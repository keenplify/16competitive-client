#![cfg(windows)]

use crate::native_bundle::NativeBundle;
use crate::persistent_native::{replace_metadata, replace_owned, verify_owned};
use goblin::pe::PE;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    collections::HashSet,
    fs::{self, OpenOptions},
    io::{Read, Write},
    os::windows::fs::MetadataExt,
    path::{Path, PathBuf},
};
use uuid::Uuid;

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Recovery {
    helper_path: String,
    helper_sha256: String,
    session_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    game_directory: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    auth_file: Option<serde_json::Value>,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Journal {
    original_sha256: String,
    module_sha256: String,
    owns_backup: bool,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct NextJournal {
    original_mini_sha256: String,
    custom_mini_sha256: String,
    cosmetic_sha256: String,
    owns_cosmetic: bool,
}

#[derive(Deserialize)]
struct GoldClientExports {
    omitted: Vec<String>,
    extension: Vec<String>,
    #[serde(rename = "legacyExtension")]
    legacy_extension: Vec<String>,
}

pub(crate) fn digest(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

fn ordinary_file(path: &Path) -> Result<(), String> {
    let meta = fs::symlink_metadata(path).map_err(|e| e.to_string())?;
    if !meta.is_file() || meta.file_type().is_symlink() || meta.file_attributes() & 0x400 != 0 {
        return Err(format!(
            "Counter-Strike file contains an unsupported link: {}",
            path.display()
        ));
    }
    Ok(())
}

pub(crate) fn ordinary_directory(path: &Path) -> Result<(), String> {
    let meta = fs::symlink_metadata(path).map_err(|e| e.to_string())?;
    if !meta.is_dir() || meta.file_type().is_symlink() || meta.file_attributes() & 0x400 != 0 {
        return Err(format!(
            "Counter-Strike directory contains an unsupported link: {}",
            path.display()
        ));
    }
    Ok(())
}

pub(crate) fn read_limited(path: &Path, limit: u64) -> Result<Vec<u8>, String> {
    ordinary_file(path)?;
    let mut data = Vec::new();
    fs::File::open(path)
        .map_err(|e| e.to_string())?
        .take(limit + 1)
        .read_to_end(&mut data)
        .map_err(|e| e.to_string())?;
    if data.len() as u64 > limit {
        return Err("Counter-Strike file is unexpectedly large".into());
    }
    Ok(data)
}

pub(crate) fn write_new(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(path)
        .map_err(|e| e.to_string())?;
    file.write_all(bytes).map_err(|e| e.to_string())?;
    file.sync_all().map_err(|e| e.to_string())
}

fn client_exports(bytes: &[u8]) -> Option<HashSet<&str>> {
    let Ok(pe) = PE::parse(bytes) else {
        return None;
    };
    if pe.header.coff_header.machine != 0x14c || !pe.is_lib {
        return None;
    }
    Some(
        pe.exports
            .iter()
            .filter(|export| export.reexport.is_none() && export.rva != 0)
            .filter_map(|export| export.name)
            .collect(),
    )
}

fn supported_client(bytes: &[u8]) -> bool {
    let Some(exports) = client_exports(bytes) else {
        return false;
    };
    let required: Vec<String> =
        match serde_json::from_str(include_str!("../../src/shared/windows-client-exports.json")) {
            Ok(value) => value,
            Err(_) => return false,
        };
    if required.len() < 80 {
        return false;
    }
    if required.iter().all(|name| exports.contains(name.as_str())) {
        return true;
    }
    let gold: GoldClientExports = match serde_json::from_str(include_str!(
        "../../src/shared/windows-goldclient-exports.json"
    )) {
        Ok(value) => value,
        Err(_) => return false,
    };
    required
        .iter()
        .filter(|name| !gold.omitted.contains(name))
        .chain(gold.extension.iter())
        .all(|name| exports.contains(name.as_str()))
}

// Authentication does not require replacing the game's client DLL. Only a
// clean unmanaged installation may use the existing startup-config path;
// partial NextClient layouts and interrupted/managed installs stay fail-closed.
pub fn supports_config_authenticated_launch(root: &Path) -> Result<bool, String> {
    for marker in [
        "cstrike/cl_dlls/client_mini.dll", "nitro_api2.dll",
        "16competitive/recovery.json", "16competitive/cosmetic-install.json",
        "16competitive/nextclient-install.json",
    ] {
        match fs::symlink_metadata(root.join(marker)) {
            Ok(_) => {
                crate::launch_diagnostics::install_check(marker, None);
                return Ok(false);
            },
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {},
            Err(error) => return Err(error.to_string()),
        }
    }
    let bytes = read_limited(&root.join("cstrike/cl_dlls/client.dll"), 128 * 1024 * 1024)?;
    let supported = client_exports(&bytes).is_some_and(|exports| exports.contains("Initialize") || exports.contains("F"));
    crate::launch_diagnostics::install_check(if supported { "config_auth_supported" } else { "unrecognized_client_exports" }, Some(&bytes));
    // This is an authentication-only launch, not approval to install our DLL.
    // Custom/protected game clients may not expose a standard PE export table.
    // Let the game's own loader decide whether its original DLL can run.
    Ok(true)
}

pub fn is_gold_client(root: &Path) -> Result<bool, String> {
    let path = if root.join("16competitive/cosmetic-install.json").exists() {
        root.join("client_original.dll")
    } else {
        root.join("cstrike/cl_dlls/client.dll")
    };
    let bytes = read_limited(&path, 128 * 1024 * 1024)?;
    let Some(exports) = client_exports(&bytes) else {
        return Ok(false);
    };
    gold_client_launch_exports(&exports)
}

fn gold_client_launch_exports(exports: &HashSet<&str>) -> Result<bool, String> {
    let gold: GoldClientExports = serde_json::from_str(include_str!(
        "../../src/shared/windows-goldclient-exports.json"
    ))
    .map_err(|_| "Invalid GoldClient launch contract")?;
    let required: Vec<String> = serde_json::from_str(include_str!(
        "../../src/shared/windows-client-exports.json"
    )).map_err(|_| "Invalid Windows client launch contract")?;
    // Legacy callbacks identify the updater behavior only. They must never
    // widen supported_client: the cosmetic proxy cannot forward this ABI.
    Ok(required.len() >= 80 && required
        .iter()
        .filter(|name| !gold.omitted.contains(name))
        .all(|name| exports.contains(name.as_str()))
        && [gold.extension, gold.legacy_extension].iter().any(|extension|
            !extension.is_empty() && extension.iter().all(|name| exports.contains(name.as_str()))))
}

/// Older GoldClient/TurboClient uses a different Initialize ABI. Select the
/// original-DLL path before starting any optional native session workers.
/// Interrupted installs and partial NextClient layouts must not use this route.
pub fn requires_legacy_original_client(root: &Path) -> Result<bool, String> {
    if !supports_config_authenticated_launch(root)? {
        return Ok(false);
    }
    let bytes = read_limited(&root.join("cstrike/cl_dlls/client.dll"), 128 * 1024 * 1024)?;
    let Some(exports) = client_exports(&bytes) else { return Ok(false); };
    Ok(gold_client_launch_exports(&exports)? && !supported_client(&bytes))
}

fn recovery_path(root: &Path) -> PathBuf {
    root.join("16competitive/recovery.json")
}

pub fn validate_root(root: &Path) -> Result<(), String> {
    for directory in [root, &root.join("cstrike"), &root.join("cstrike/cl_dlls")] {
        ordinary_directory(directory)?;
    }
    ordinary_file(&root.join("cstrike/cl_dlls/client.dll"))?;
    let managed = root.join("16competitive");
    if managed.exists() {
        ordinary_directory(&managed)?;
    }
    Ok(())
}

pub fn prepare_existing(root: &Path, bundle: &NativeBundle) -> Result<(), String> {
    let session = root.join("16competitive/live-session");
    if session.exists() {
        ordinary_directory(&session)?;
        fs::remove_dir_all(&session).map_err(|e| e.to_string())?;
    }
    let descriptor = recovery_path(root);
    if !descriptor.exists() {
        if root.join("16competitive/cosmetic-install.json").exists()
            || root.join("16competitive/nextclient-install.json").exists()
        {
            return Err(
                "An older native installation needs recovery in Electron before play".into(),
            );
        }
        return Ok(());
    }
    let bytes = read_limited(&descriptor, 4096)?;
    let mut state: Recovery =
        serde_json::from_slice(&bytes).map_err(|_| "Invalid native recovery descriptor")?;
    Uuid::parse_str(&state.session_id).map_err(|_| "Invalid native recovery session")?;
    if !["cstrike", "cstrk13"].contains(&state.game_directory.as_deref().unwrap_or("cstrike"))
        || state.helper_sha256.len() != 64
    {
        return Err("Invalid native recovery descriptor".into());
    }
    state.helper_path = bundle
        .inspector
        .to_str()
        .ok_or("Invalid native helper path")?
        .to_owned();
    state.helper_sha256 = digest(&read_limited(&bundle.inspector, 32 * 1024 * 1024)?);
    let pending = descriptor.with_extension(format!("{}.tmp", Uuid::new_v4()));
    write_new(
        &pending,
        &serde_json::to_vec(&state).map_err(|e| e.to_string())?,
    )?;
    if fs::read(&descriptor).map_err(|e| e.to_string())? != bytes {
        let _ = fs::remove_file(&pending);
        return Err("Native recovery session changed during helper update".into());
    }
    fs::rename(&pending, &descriptor).map_err(|e| e.to_string())?;
    Ok(())
}

pub struct WindowsInstall;

impl WindowsInstall {
    pub fn install(root: &Path, bundle: &NativeBundle) -> Result<Option<Self>, String> {
        let module = read_limited(&bundle.module, 32 * 1024 * 1024)?;
        let marker = b"papamo_persistent_session_v1";
        if !module.windows(marker.len()).any(|bytes| bytes == marker) {
            return Err("The approved native bundle needs persistent-session support".into());
        }
        let client = root.join("cstrike/cl_dlls/client.dll");
        for directory in [root, &root.join("cstrike"), &root.join("cstrike/cl_dlls")] {
            ordinary_directory(directory)?;
        }
        if root.join("16competitive").exists() {
            ordinary_directory(&root.join("16competitive"))?;
        }
        if Self::refresh_installed(root, bundle)? {
            return Ok(Some(Self));
        }
        if root.join("cstrike/cl_dlls/client_mini.dll").exists()
            && root.join("nitro_api2.dll").exists()
        {
            return Self::install_next_client(root, bundle).map(Some);
        }
        if root.join("cstrike/cl_dlls/client_mini.dll").exists()
            || root.join("nitro_api2.dll").exists()
        {
            return Ok(None);
        }
        let original = read_limited(&client, 128 * 1024 * 1024)?;
        if !supported_client(&original) {
            return Ok(None);
        }
        let managed = root.join("16competitive");
        if managed.exists() {
            ordinary_directory(&managed)?;
        } else {
            fs::create_dir(&managed).map_err(|e| e.to_string())?;
        }
        let journal = managed.join("cosmetic-install.json");
        let descriptor = managed.join("recovery.json");
        let backup = root.join("client_original.dll");
        if journal.exists() || descriptor.exists() {
            return Err("Existing native installation needs inspection".into());
        }
        let owns_backup = if backup.exists() {
            if read_limited(&backup, 128 * 1024 * 1024)? != original {
                return Err("Existing original client backup does not match the game".into());
            }
            false
        } else {
            write_new(&backup, &original)?;
            true
        };
        let module = read_limited(&bundle.module, 32 * 1024 * 1024)?;
        let state = Recovery {
            helper_path: bundle
                .inspector
                .to_str()
                .ok_or("Invalid native helper path")?
                .into(),
            helper_sha256: digest(&read_limited(&bundle.inspector, 32 * 1024 * 1024)?),
            session_id: Uuid::new_v4().to_string(),
            game_directory: None,
            auth_file: None,
        };
        let record = Journal {
            original_sha256: digest(&original),
            module_sha256: digest(&module),
            owns_backup,
        };
        if let Err(error) = write_new(
            &journal,
            &serde_json::to_vec(&record).map_err(|e| e.to_string())?,
        ) {
            if owns_backup {
                let _ = fs::remove_file(&backup);
            }
            return Err(error);
        }
        if let Err(error) = write_new(
            &descriptor,
            &serde_json::to_vec(&state).map_err(|e| e.to_string())?,
        ) {
            let _ = fs::remove_file(&journal);
            if owns_backup {
                let _ = fs::remove_file(&backup);
            }
            return Err(error);
        }
        let pending = root.join("cstrike/cl_dlls/client.dll.16competitive.tmp");
        if pending.exists() {
            return Err("Existing native DLL staging file needs inspection".into());
        }
        write_new(&pending, &module)?;
        if digest(&read_limited(&backup, 128 * 1024 * 1024)?) != record.original_sha256 {
            return Err("Counter-Strike client backup changed during installation".into());
        }
        fs::rename(&pending, &client).map_err(|e| e.to_string())?;
        Ok(Some(Self))
    }

    fn install_next_client(root: &Path, bundle: &NativeBundle) -> Result<Self, String> {
        let signed_mini = bundle
            .next_client
            .as_ref()
            .ok_or("The approved native release does not include NextClient support")?;
        let managed = root.join("16competitive");
        ordinary_directory(&managed)?;
        let mini = root.join("cstrike/cl_dlls/client_mini.dll");
        let cosmetic = root.join("papamo_cosmetic_module.dll");
        let backup = managed.join("nextclient-client-mini.original.dll");
        let journal = managed.join("nextclient-install.json");
        let descriptor = managed.join("recovery.json");
        let mini_temp = root.join("cstrike/cl_dlls/client_mini.dll.16competitive.tmp");
        let cosmetic_temp = root.join("papamo_cosmetic_module.dll.16competitive.tmp");
        for path in [&backup, &journal, &descriptor, &mini_temp, &cosmetic_temp] {
            if path.exists() {
                return Err("Existing NextClient integration needs inspection".into());
            }
        }
        let original = read_limited(&mini, 128 * 1024 * 1024)?;
        let custom = read_limited(signed_mini, 32 * 1024 * 1024)?;
        let module = read_limited(&bundle.module, 32 * 1024 * 1024)?;
        let owns_cosmetic = if cosmetic.exists() {
            if read_limited(&cosmetic, 32 * 1024 * 1024)? != module {
                return Err("An unmanaged NextClient cosmetic module already exists".into());
            }
            false
        } else {
            true
        };
        write_new(&backup, &original)?;
        let record = NextJournal {
            original_mini_sha256: digest(&original),
            custom_mini_sha256: digest(&custom),
            cosmetic_sha256: digest(&module),
            owns_cosmetic,
        };
        if let Err(error) = write_new(
            &journal,
            &serde_json::to_vec(&record).map_err(|e| e.to_string())?,
        ) {
            let _ = fs::remove_file(&backup);
            return Err(error);
        }
        let state = Recovery {
            helper_path: bundle
                .inspector
                .to_str()
                .ok_or("Invalid native helper path")?
                .into(),
            helper_sha256: digest(&read_limited(&bundle.inspector, 32 * 1024 * 1024)?),
            session_id: Uuid::new_v4().to_string(),
            game_directory: None,
            auth_file: None,
        };
        if let Err(error) = write_new(
            &descriptor,
            &serde_json::to_vec(&state).map_err(|e| e.to_string())?,
        ) {
            let _ = fs::remove_file(&journal);
            let _ = fs::remove_file(&backup);
            return Err(error);
        }
        write_new(&mini_temp, &custom)?;
        fs::rename(&mini_temp, &mini).map_err(|e| e.to_string())?;
        if owns_cosmetic {
            write_new(&cosmetic_temp, &module)?;
            fs::rename(&cosmetic_temp, &cosmetic).map_err(|e| e.to_string())?;
        }
        Ok(Self)
    }

    /// Reuse or update only our hash-journaled DLLs. Originals remain available
    /// for explicit maintenance; ending a session never restores an installation.
    fn refresh_installed(root: &Path, bundle: &NativeBundle) -> Result<bool, String> {
        let managed = root.join("16competitive");
        let proxy = managed.join("cosmetic-install.json");
        let next = managed.join("nextclient-install.json");
        if proxy.exists() && next.exists() {
            return Err("Ambiguous native installation".into());
        }
        if proxy.exists() {
            let mut journal: Journal = serde_json::from_slice(&read_limited(&proxy, 1024)?)
                .map_err(|_| "Invalid native installation journal")?;
            let backup = read_limited(&root.join("client_original.dll"), 128 * 1024 * 1024)?;
            if digest(&backup) != journal.original_sha256 || !supported_client(&backup) {
                return Err("Original native client backup changed".into());
            }
            let module = read_limited(&bundle.module, 32 * 1024 * 1024)?;
            replace_owned(
                &root.join("cstrike/cl_dlls/client.dll"),
                &journal.module_sha256,
                &module,
            )?;
            journal.module_sha256 = digest(&module);
            replace_metadata(
                &proxy,
                &serde_json::to_vec(&journal).map_err(|e| e.to_string())?,
            )?;
            return Ok(true);
        }
        if next.exists() {
            let mut journal: NextJournal = serde_json::from_slice(&read_limited(&next, 1024)?)
                .map_err(|_| "Invalid NextClient installation journal")?;
            if digest(&read_limited(
                &managed.join("nextclient-client-mini.original.dll"),
                128 * 1024 * 1024,
            )?) != journal.original_mini_sha256
            {
                return Err("Original NextClient backup changed".into());
            }
            let mini = read_limited(
                bundle
                    .next_client
                    .as_ref()
                    .ok_or("Missing approved NextClient host")?,
                32 * 1024 * 1024,
            )?;
            let module = read_limited(&bundle.module, 32 * 1024 * 1024)?;
            // Validate both before changing either. Interrupted updates can retry
            // the same approved bundle, but never overwrite an unknown player file.
            verify_owned(
                &root.join("cstrike/cl_dlls/client_mini.dll"),
                &journal.custom_mini_sha256,
                &mini,
            )?;
            verify_owned(
                &root.join("papamo_cosmetic_module.dll"),
                &journal.cosmetic_sha256,
                &module,
            )?;
            if !journal.owns_cosmetic && digest(&module) != journal.cosmetic_sha256 {
                return Err("An existing unowned cosmetic module needs manual updating".into());
            }
            replace_owned(
                &root.join("cstrike/cl_dlls/client_mini.dll"),
                &journal.custom_mini_sha256,
                &mini,
            )?;
            if journal.owns_cosmetic {
                replace_owned(
                    &root.join("papamo_cosmetic_module.dll"),
                    &journal.cosmetic_sha256,
                    &module,
                )?;
            }
            journal.custom_mini_sha256 = digest(&mini);
            journal.cosmetic_sha256 = digest(&module);
            replace_metadata(
                &next,
                &serde_json::to_vec(&journal).map_err(|e| e.to_string())?,
            )?;
            return Ok(true);
        }
        Ok(false)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::native_session::NativeSession;
    use competitive16_web_helper::Connection;

    #[test]
    fn legacy_launch_contract_requires_every_callback() {
        let gold: GoldClientExports = serde_json::from_str(include_str!(
            "../../src/shared/windows-goldclient-exports.json"
        )).unwrap();
        let required: Vec<String> = serde_json::from_str(include_str!(
            "../../src/shared/windows-client-exports.json"
        )).unwrap();
        for extension in [&gold.extension, &gold.legacy_extension] {
            let exports: HashSet<&str> = required.iter()
                .filter(|name| !gold.omitted.contains(name))
                .chain(extension.iter()).map(String::as_str).collect();
            assert!(gold_client_launch_exports(&exports).unwrap());
            for name in &exports {
                let mut missing = exports.clone();
                missing.remove(name);
                assert!(!gold_client_launch_exports(&missing).unwrap(), "{name}");
            }
        }
        assert!(!gold_client_launch_exports(&required.iter().map(String::as_str).collect()).unwrap());
    }

    fn config_auth_client_fixture() -> Vec<u8> {
        client_fixture(&["Initialize".to_owned()])
    }

    fn client_fixture(names: &[String]) -> Vec<u8> {
        let mut b = vec![0u8; 16384];
        fn u16at(b: &mut [u8], offset: usize, value: u16) { b[offset..offset+2].copy_from_slice(&value.to_le_bytes()); }
        fn u32at(b: &mut [u8], offset: usize, value: u32) { b[offset..offset+4].copy_from_slice(&value.to_le_bytes()); }
        u16at(&mut b, 0, 0x5a4d); u32at(&mut b, 0x3c, 0x80);
        u32at(&mut b, 0x80, 0x4550); u16at(&mut b, 0x84, 0x14c);
        u16at(&mut b, 0x86, 1); u16at(&mut b, 0x94, 224); u16at(&mut b, 0x96, 0x2000);
        u16at(&mut b, 0x98, 0x10b); u32at(&mut b, 0x98+92, 16);
        u32at(&mut b, 0x98+96, 0x1000); u32at(&mut b, 0x98+100, 0x2000);
        u32at(&mut b, 0x98+32, 0x1000); u32at(&mut b, 0x98+36, 0x200);
        u32at(&mut b, 0x98+56, 0x5000); u32at(&mut b, 0x98+60, 0x200);
        let section = 0x98+224;
        u32at(&mut b, section+8, 0x3e00);
        u32at(&mut b, section+12, 0x1000); u32at(&mut b, section+16, 0x3e00); u32at(&mut b, section+20, 0x200);
        for (offset,value) in [(16,1),(20,names.len() as u32),(24,names.len() as u32),(28,0x1100),(32,0x1300),(36,0x1500)] { u32at(&mut b, 0x200+offset,value); }
        let mut cursor = 0x900;
        for (index, name) in names.iter().enumerate() {
            u32at(&mut b, 0x300 + index * 4, 0x4000 + index as u32);
            u32at(&mut b, 0x500 + index * 4, cursor as u32 + 0xe00);
            u16at(&mut b, 0x700 + index * 2, index as u16);
            b[cursor..cursor+name.len()].copy_from_slice(name.as_bytes());
            cursor += name.len() + 1;
        }
        b
    }

    #[test]
    fn legacy_client_selects_original_dll_and_preserves_recovery_gates() {
        let gold: GoldClientExports = serde_json::from_str(include_str!(
            "../../src/shared/windows-goldclient-exports.json"
        )).unwrap();
        let required: Vec<String> = serde_json::from_str(include_str!(
            "../../src/shared/windows-client-exports.json"
        )).unwrap();
        let root = std::env::temp_dir().join(format!("16c-legacy-client-{}", Uuid::new_v4()));
        let dir = root.join("cstrike/cl_dlls");
        fs::create_dir_all(&dir).unwrap();
        let names: Vec<String> = required.into_iter().filter(|name| !gold.omitted.contains(name))
            .chain(gold.legacy_extension).collect();
        let bytes = if let Ok(path) = std::env::var("C16_TEST_LEGACY_CLIENT_DLL") {
            fs::read(path).unwrap()
        } else { client_fixture(&names) };
        fs::write(dir.join("client.dll"), &bytes).unwrap();
        assert!(requires_legacy_original_client(&root).unwrap());
        assert!(!supported_client(&bytes));
        assert_eq!(fs::read(dir.join("client.dll")).unwrap(), bytes);
        fs::create_dir(root.join("16competitive")).unwrap();
        fs::write(root.join("16competitive/recovery.json"), b"interrupted").unwrap();
        assert!(!requires_legacy_original_client(&root).unwrap());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn config_auth_does_not_require_cosmetic_abi_or_modify_dll() {
        let root = std::env::temp_dir().join(format!("16c-config-auth-{}", Uuid::new_v4()));
        let dir = root.join("cstrike/cl_dlls");
        fs::create_dir_all(&dir).unwrap();
        let bytes = config_auth_client_fixture();
        fs::write(dir.join("client.dll"), &bytes).unwrap();
        assert!(!supported_client(&bytes));
        assert!(supports_config_authenticated_launch(&root).unwrap());
        assert_eq!(fs::read(dir.join("client.dll")).unwrap(), bytes);
        for marker in ["cstrike/cl_dlls/client_mini.dll", "nitro_api2.dll",
            "16competitive/recovery.json", "16competitive/cosmetic-install.json", "16competitive/nextclient-install.json"] {
            let path = root.join(marker);
            fs::create_dir_all(path.parent().unwrap()).unwrap();
            fs::write(&path, b"partial-or-managed").unwrap();
            assert!(!supports_config_authenticated_launch(&root).unwrap(), "{marker}");
            fs::remove_file(path).unwrap();
        }
        let mut x64 = bytes.clone(); x64[0x84..0x86].copy_from_slice(&0x8664u16.to_le_bytes());
        for original in [x64, b"custom client not recognized by our PE parser".to_vec()] {
            fs::write(dir.join("client.dll"), &original).unwrap();
            assert!(!supported_client(&original));
            assert!(supports_config_authenticated_launch(&root).unwrap());
            assert_eq!(fs::read(dir.join("client.dll")).unwrap(), original);
        }
        fs::remove_file(dir.join("client.dll")).unwrap();
        assert!(supports_config_authenticated_launch(&root).is_err());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn inspected_client_exports_are_supported() {
        let Ok(path) = std::env::var("C16_TEST_CLIENT_DLL") else {
            return;
        };
        let bytes = fs::read(path).unwrap();
        assert!(supported_client(&bytes));
    }

    #[test]
    fn managed_dll_retains_module_after_session_cleanup() {
        let Ok(path) = std::env::var("C16_TEST_CLIENT_DLL") else {
            return;
        };
        let original = fs::read(path).unwrap();
        assert!(supported_client(&original));
        let root = std::env::temp_dir().join(format!("16c-web-native-{}", Uuid::new_v4()));
        let client_dir = root.join("cstrike/cl_dlls");
        fs::create_dir_all(&client_dir).unwrap();
        fs::write(client_dir.join("client.dll"), &original).unwrap();
        let cache = std::env::temp_dir().join(format!("16c-web-cache-{}", Uuid::new_v4()));
        let bundle = crate::native_bundle::prepare(&cache).unwrap();
        let connection = Connection {
            match_id: Uuid::new_v4().to_string(),
            mode: "5v5".into(),
            host: "127.0.0.1".into(),
            port: 27015,
            password: "example".into(),
            join_token: "a".repeat(32),
            player_name: "Test".into(),
        };
        let mut session = NativeSession::start_at(
            root.join("16competitive/live-session"),
            &connection,
            "https://16competitive.papamo.dev",
            "invalid-test-token",
            &crate::settings_bridge::NativePreferences::default(),
        )
        .unwrap();
        let installation = WindowsInstall::install(&root, &bundle).unwrap().unwrap();
        assert_eq!(
            fs::read(client_dir.join("client.dll")).unwrap(),
            fs::read(&bundle.module).unwrap()
        );
        session.stop();
        let _installation = installation;
        session.cleanup().unwrap();
        assert_eq!(
            fs::read(client_dir.join("client.dll")).unwrap(),
            fs::read(&bundle.module).unwrap()
        );
        assert_eq!(
            fs::read(root.join("client_original.dll")).unwrap(),
            original
        );
        assert!(root.join("16competitive/cosmetic-install.json").exists());
        assert!(WindowsInstall::install(&root, &bundle).unwrap().is_some());
        fs::remove_dir_all(root).unwrap();
        let _ = fs::remove_dir_all(cache);
    }

    #[test]
    fn existing_nextclient_prepares_twice_and_preserves_locked_file_failure() {
        let Ok(source) = std::env::var("C16_TEST_NEXTCLIENT_MANAGED_ROOT") else { return; };
        let source = PathBuf::from(source);
        let root = std::env::temp_dir().join(format!("16c-next-repeat-{}", Uuid::new_v4()));
        for name in [
            "cstrike/cl_dlls/client.dll", "cstrike/cl_dlls/client_mini.dll",
            "nitro_api2.dll", "papamo_cosmetic_module.dll",
            "16competitive/nextclient-client-mini.original.dll",
            "16competitive/nextclient-install.json", "16competitive/recovery.json",
        ] {
            let target = root.join(name);
            fs::create_dir_all(target.parent().unwrap()).unwrap();
            fs::copy(source.join(name), target).unwrap();
        }
        let cache = std::env::temp_dir().join(format!("16c-next-bundle-{}", Uuid::new_v4()));
        let bundle = crate::native_bundle::prepare(&cache).unwrap();
        for _ in 0..2 {
            validate_root(&root).unwrap();
            prepare_existing(&root, &bundle).unwrap();
            assert!(WindowsInstall::install(&root, &bundle).unwrap().is_some());
        }
        use std::os::windows::fs::OpenOptionsExt;
        let locked = OpenOptions::new().read(true).share_mode(1)
            .open(root.join("cstrike/cl_dlls/client_mini.dll")).unwrap();
        let failure = WindowsInstall::install(&root, &bundle).err().expect("locked DLL must fail closed");
        let primary = crate::desktop_session::preparation_error(&failure, "NATIVE_INSTALL_FAILED");
        let result = crate::session_cleanup::finish(Err(primary), &[
            ("INSPECTOR_STOP_FAILED", Err("Inspector shutdown timed out".into()))
        ]);
        assert_eq!(result, Err("NATIVE_INSTALL_FAILED".into()));
        drop(locked);
        assert!(WindowsInstall::install(&root, &bundle).unwrap().is_some());
        fs::remove_dir_all(root).unwrap();
        fs::remove_dir_all(cache).unwrap();
    }

    #[test]
    fn managed_nextclient_retains_host_after_session_cleanup() {
        let Ok(source) = std::env::var("C16_TEST_NEXTCLIENT_ROOT") else {
            return;
        };
        let source = PathBuf::from(source);
        let root = std::env::temp_dir().join(format!("16c-web-next-{}", Uuid::new_v4()));
        let client_dir = root.join("cstrike/cl_dlls");
        fs::create_dir_all(&client_dir).unwrap();
        fs::copy(
            source.join("cstrike/cl_dlls/client.dll"),
            client_dir.join("client.dll"),
        )
        .unwrap();
        fs::copy(
            source.join("cstrike/cl_dlls/client_mini.dll"),
            client_dir.join("client_mini.dll"),
        )
        .unwrap();
        fs::copy(source.join("nitro_api2.dll"), root.join("nitro_api2.dll")).unwrap();
        let original = fs::read(client_dir.join("client_mini.dll")).unwrap();
        let cache = std::env::temp_dir().join(format!("16c-web-cache-{}", Uuid::new_v4()));
        let bundle = crate::native_bundle::prepare(&cache).unwrap();
        let connection = Connection {
            match_id: Uuid::new_v4().to_string(),
            mode: "5v5".into(),
            host: "127.0.0.1".into(),
            port: 27015,
            password: "example".into(),
            join_token: "a".repeat(32),
            player_name: "Test".into(),
        };
        let mut session = NativeSession::start_at(
            root.join("16competitive/live-session"),
            &connection,
            "https://16competitive.papamo.dev",
            "invalid-test-token",
            &crate::settings_bridge::NativePreferences::default(),
        )
        .unwrap();
        let installation = WindowsInstall::install(&root, &bundle).unwrap().unwrap();
        assert_eq!(
            fs::read(client_dir.join("client_mini.dll")).unwrap(),
            fs::read(bundle.next_client.as_ref().unwrap()).unwrap()
        );
        assert_eq!(
            fs::read(root.join("papamo_cosmetic_module.dll")).unwrap(),
            fs::read(&bundle.module).unwrap()
        );
        session.stop();
        let _installation = installation;
        session.cleanup().unwrap();
        assert_eq!(
            fs::read(client_dir.join("client_mini.dll")).unwrap(),
            fs::read(bundle.next_client.as_ref().unwrap()).unwrap()
        );
        assert_eq!(
            fs::read(root.join("16competitive/nextclient-client-mini.original.dll")).unwrap(),
            original
        );
        assert!(root.join("papamo_cosmetic_module.dll").exists());
        assert!(root.join("16competitive/nextclient-install.json").exists());
        assert!(WindowsInstall::install(&root, &bundle).unwrap().is_some());
        fs::remove_dir_all(root).unwrap();
        let _ = fs::remove_dir_all(cache);
    }
}
