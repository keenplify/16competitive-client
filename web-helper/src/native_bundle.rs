//! The web launcher carries the same backend-approved native release as Electron.
//! Embedded bytes are inert until their signed manifest and backend approval pass.
use base64::{engine::general_purpose::STANDARD, Engine};
use ed25519_dalek::{Signature, Verifier, VerifyingKey};
use serde::Deserialize;
use sha2::{Digest, Sha256};
use std::{
    fs::{self, OpenOptions},
    io::{Read, Write},
    path::{Path, PathBuf},
    time::Duration,
};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ReleaseConfig {
    version: String,
    public_key_pem: String,
    registry_url: String,
}

#[derive(Deserialize)]
struct Envelope {
    manifest: String,
    signature: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Asset {
    file_name: String,
    sha256: String,
    size_bytes: usize,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Manifest {
    schema_version: u8,
    version: String,
    platform: String,
    arch: String,
    file_name: String,
    sha256: String,
    size_bytes: usize,
    cosmetic_module: Asset,
    next_client_module: Option<Asset>,
}

#[cfg(windows)]
const PLATFORM: &str = "win";
#[cfg(not(windows))]
const PLATFORM: &str = "linux";
#[cfg(target_arch = "aarch64")]
const ARCH: &str = "arm64";
#[cfg(not(target_arch = "aarch64"))]
const ARCH: &str = "x64";

#[cfg(windows)]
const ENVELOPE: &[u8] = include_bytes!("../../resources/native/win-x64/manifest.json");
#[cfg(all(not(windows), target_arch = "aarch64"))]
const ENVELOPE: &[u8] = include_bytes!("../../resources/native/linux-arm64/manifest.json");
#[cfg(all(not(windows), not(target_arch = "aarch64")))]
const ENVELOPE: &[u8] = include_bytes!("../../resources/native/linux-x64/manifest.json");
#[cfg(windows)]
const INSPECTOR: &[u8] = include_bytes!("../../resources/native/win-x64/game-inspector.exe");
#[cfg(all(not(windows), target_arch = "aarch64"))]
const INSPECTOR: &[u8] = include_bytes!("../../resources/native/linux-arm64/game-inspector");
#[cfg(all(not(windows), not(target_arch = "aarch64")))]
const INSPECTOR: &[u8] = include_bytes!("../../resources/native/linux-x64/game-inspector");
#[cfg(windows)]
const MODULE: &[u8] =
    include_bytes!("../../resources/native/win-x64/papamo-cosmetic-module-win-x86.dll");
#[cfg(all(not(windows), target_arch = "aarch64"))]
const MODULE: &[u8] =
    include_bytes!("../../resources/native/linux-arm64/papamo-cosmetic-module-linux-x86.so");
#[cfg(all(not(windows), not(target_arch = "aarch64")))]
const MODULE: &[u8] =
    include_bytes!("../../resources/native/linux-x64/papamo-cosmetic-module-linux-x86.so");

/// Feature selection only; signature/hash/registry approval remains mandatory.
pub(crate) fn supports_vgui_scoreboard() -> bool {
    const MARKER: &[u8] = b"papamo_vgui_scoreboard_v1";
    MODULE.windows(MARKER.len()).any(|bytes| bytes == MARKER)
}
#[cfg(windows)]
const NEXT_CLIENT: &[u8] =
    include_bytes!("../../resources/native/win-x64/papamo-nextclient-client-mini-win-x86.dll");

#[derive(Clone)]
pub struct NativeBundle {
    pub inspector: PathBuf,
    pub module: PathBuf,
    #[cfg(windows)]
    pub next_client: Option<PathBuf>,
}

impl NativeBundle {
    pub(crate) fn verify_approval(&self) -> Result<(), ApprovalError> {
        let config: ReleaseConfig = serde_json::from_str(include_str!("../../helper-release.json"))
            .map_err(|_| ApprovalError::Rejected)?;
        let envelope: Envelope =
            serde_json::from_slice(ENVELOPE).map_err(|_| ApprovalError::Rejected)?;
        verify_envelope(&config, &envelope).map_err(|_| ApprovalError::Rejected)?;
        approve(&config, &envelope)
    }

    /// Recheck the on-disk scanner immediately before spawning it. Preparation
    /// has already required backend approval; a cache replacement is not trusted.
    pub(crate) fn verify_inspector(&self) -> Result<(), String> {
        let metadata =
            fs::symlink_metadata(&self.inspector).map_err(|_| "Native inspector is unavailable")?;
        if !metadata.is_file()
            || metadata.file_type().is_symlink()
            || metadata.len() != INSPECTOR.len() as u64
        {
            return Err("Native inspector integrity check failed".into());
        }
        let mut options = OpenOptions::new();
        options.read(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.custom_flags(libc::O_NOFOLLOW | libc::O_NONBLOCK);
        }
        let file = options
            .open(&self.inspector)
            .map_err(|_| "Native inspector is unavailable")?;
        if !file
            .metadata()
            .map_err(|_| "Native inspector is unavailable")?
            .is_file()
        {
            return Err("Native inspector integrity check failed".into());
        }
        let mut bytes = Vec::new();
        file.take(INSPECTOR.len() as u64 + 1)
            .read_to_end(&mut bytes)
            .map_err(|_| "Native inspector integrity check failed")?;
        if bytes != INSPECTOR {
            return Err("Native inspector integrity check failed".into());
        }
        Ok(())
    }
}

fn valid_asset(asset: &Asset, expected: &str, bytes: &[u8]) -> bool {
    asset.file_name == expected
        && asset.size_bytes == bytes.len()
        && asset.size_bytes > 0
        && asset.size_bytes <= 32 * 1024 * 1024
        && asset.sha256 == format!("{:x}", Sha256::digest(bytes))
}

fn verify_envelope(config: &ReleaseConfig, envelope: &Envelope) -> Result<Manifest, String> {
    if envelope.manifest.len() > 4096 || envelope.signature.len() != 88 {
        return Err("Invalid native release signature envelope".into());
    }
    let pem_body: String = config
        .public_key_pem
        .lines()
        .filter(|line| !line.starts_with("-----"))
        .collect();
    let spki = STANDARD
        .decode(pem_body)
        .map_err(|_| "Invalid native release public key")?;
    const ED25519_SPKI: &[u8] = &[
        0x30, 0x2a, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x03, 0x21, 0x00,
    ];
    if spki.len() != 44 || !spki.starts_with(ED25519_SPKI) {
        return Err("Invalid native release public key".into());
    }
    let key_bytes: [u8; 32] = spki[12..]
        .try_into()
        .map_err(|_| "Invalid native release public key")?;
    let key =
        VerifyingKey::from_bytes(&key_bytes).map_err(|_| "Invalid native release public key")?;
    let signature_bytes = STANDARD
        .decode(&envelope.signature)
        .map_err(|_| "Invalid native release signature")?;
    let signature =
        Signature::from_slice(&signature_bytes).map_err(|_| "Invalid native release signature")?;
    key.verify(envelope.manifest.as_bytes(), &signature)
        .map_err(|_| "Native release signature verification failed")?;
    let manifest: Manifest =
        serde_json::from_str(&envelope.manifest).map_err(|_| "Invalid signed native release")?;
    let inspector_name = if PLATFORM == "win" {
        "game-inspector-win-x64.exe"
    } else {
        if ARCH == "arm64" {
            "game-inspector-linux-arm64"
        } else {
            "game-inspector-linux-x64"
        }
    };
    let module_name = if PLATFORM == "win" {
        "papamo-cosmetic-module-win-x86.dll"
    } else {
        "papamo-cosmetic-module-linux-x86.so"
    };
    if manifest.schema_version != 1
        || manifest.version != config.version
        || manifest.platform != PLATFORM
        || manifest.arch != ARCH
        || !valid_asset(
            &Asset {
                file_name: manifest.file_name.clone(),
                sha256: manifest.sha256.clone(),
                size_bytes: manifest.size_bytes,
            },
            inspector_name,
            INSPECTOR,
        )
        || !valid_asset(&manifest.cosmetic_module, module_name, MODULE)
    {
        return Err("Signed native release does not match this web helper".into());
    }
    #[cfg(windows)]
    if manifest.next_client_module.as_ref().is_some_and(|asset| {
        !valid_asset(
            asset,
            "papamo-nextclient-client-mini-win-x86.dll",
            NEXT_CLIENT,
        )
    }) {
        return Err("Signed NextClient module does not match this web helper".into());
    }
    Ok(manifest)
}

#[derive(Debug, PartialEq, Eq)]
pub(crate) enum ApprovalError {
    Unavailable,
    Rejected,
}

impl std::fmt::Display for ApprovalError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(match self {
            Self::Unavailable => "Native release approval is unavailable",
            Self::Rejected => "Native release approval was rejected",
        })
    }
}

fn approve(config: &ReleaseConfig, envelope: &Envelope) -> Result<(), ApprovalError> {
    let origin = url::Url::parse(&config.registry_url).map_err(|_| ApprovalError::Rejected)?;
    if origin.scheme() != "https"
        || origin.username() != ""
        || origin.password().is_some()
        || origin.path() != "/"
        || origin.query().is_some()
        || origin.fragment().is_some()
    {
        return Err(ApprovalError::Rejected);
    }
    let endpoint = origin
        .join(&format!(
            "helper-releases/{}/{PLATFORM}/{ARCH}",
            config.version
        ))
        .map_err(|_| ApprovalError::Rejected)?;
    let agent = ureq::AgentBuilder::new()
        .redirects(0)
        .timeout(Duration::from_secs(10))
        .build();
    let response = match agent.get(endpoint.as_str()).call() {
        Ok(response) => response,
        Err(ureq::Error::Transport(_)) => return Err(ApprovalError::Unavailable),
        Err(ureq::Error::Status(status, _)) if status == 429 || status >= 500 => {
            return Err(ApprovalError::Unavailable)
        }
        Err(_) => return Err(ApprovalError::Rejected),
    };
    let mut bytes = Vec::new();
    response
        .into_reader()
        .take(16385)
        .read_to_end(&mut bytes)
        .map_err(|_| ApprovalError::Unavailable)?;
    if bytes.len() > 16384 {
        return Err(ApprovalError::Rejected);
    }
    let reply: Envelope = serde_json::from_slice(&bytes).map_err(|_| ApprovalError::Rejected)?;
    if reply.manifest != envelope.manifest || reply.signature != envelope.signature {
        return Err(ApprovalError::Rejected);
    }
    Ok(())
}

fn stage(directory: &Path, name: &str, bytes: &[u8]) -> Result<PathBuf, String> {
    let target = directory.join(name);
    match fs::symlink_metadata(&target) {
        Ok(metadata) => {
            if !metadata.is_file()
                || metadata.file_type().is_symlink()
                || fs::read(&target).map_err(|e| e.to_string())? != bytes
            {
                return Err(format!("Cached native asset needs inspection: {name}"));
            }
            return Ok(target);
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        Err(error) => return Err(error.to_string()),
    }
    let pending = directory.join(format!("{name}.installing"));
    let mut options = OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o700).custom_flags(libc::O_NOFOLLOW);
    }
    let mut file = options.open(&pending).map_err(|e| e.to_string())?;
    file.write_all(bytes).map_err(|e| e.to_string())?;
    file.sync_all().map_err(|e| e.to_string())?;
    fs::rename(&pending, &target).map_err(|e| e.to_string())?;
    Ok(target)
}

pub fn prepare(config_dir: &Path) -> Result<NativeBundle, String> {
    let config: ReleaseConfig = serde_json::from_str(include_str!("../../helper-release.json"))
        .map_err(|_| "Invalid native release configuration")?;
    let envelope: Envelope =
        serde_json::from_slice(ENVELOPE).map_err(|_| "Invalid embedded native release")?;
    let manifest = verify_envelope(&config, &envelope)?;
    approve(&config, &envelope).map_err(|error| error.to_string())?;
    let directory = config_dir
        .join("native")
        .join(format!("v{}", config.version));
    fs::create_dir_all(&directory).map_err(|e| e.to_string())?;
    #[cfg(windows)]
    let inspector_name = "game-inspector.exe";
    #[cfg(not(windows))]
    let inspector_name = "game-inspector";
    #[cfg(windows)]
    let module_name = "papamo-cosmetic-module-win-x86.dll";
    #[cfg(not(windows))]
    let module_name = "papamo-cosmetic-module-linux-x86.so";
    let inspector = stage(&directory, inspector_name, INSPECTOR)?;
    let module = stage(&directory, module_name, MODULE)?;
    #[cfg(windows)]
    let next_client = if manifest.next_client_module.is_some() {
        Some(stage(
            &directory,
            "papamo-nextclient-client-mini-win-x86.dll",
            NEXT_CLIENT,
        )?)
    } else {
        None
    };
    Ok(NativeBundle {
        inspector,
        module,
        #[cfg(windows)]
        next_client,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn scanner_revalidation_rejects_replaced_or_linked_bytes() {
        let root =
            std::env::temp_dir().join(format!("16c-inspector-integrity-{}", uuid::Uuid::new_v4()));
        fs::create_dir(&root).unwrap();
        let inspector = root.join("inspector");
        fs::write(&inspector, INSPECTOR).unwrap();
        let bundle = NativeBundle {
            inspector: inspector.clone(),
            module: root.join("unused-module"),
            #[cfg(windows)]
            next_client: None,
        };
        bundle.verify_inspector().unwrap();
        let mut changed = INSPECTOR.to_vec();
        changed[0] ^= 1;
        fs::write(&inspector, changed).unwrap();
        assert!(bundle.verify_inspector().is_err());
        fs::remove_file(&inspector).unwrap();
        #[cfg(unix)]
        {
            let target = root.join("other");
            fs::write(&target, INSPECTOR).unwrap();
            std::os::unix::fs::symlink(target, &inspector).unwrap();
            assert!(bundle.verify_inspector().is_err());
        }
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn embedded_bundle_matches_signed_release() {
        let config: ReleaseConfig =
            serde_json::from_str(include_str!("../../helper-release.json")).unwrap();
        let envelope: Envelope = serde_json::from_slice(ENVELOPE).unwrap();
        verify_envelope(&config, &envelope).unwrap();
    }
}
