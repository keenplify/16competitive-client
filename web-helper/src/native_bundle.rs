//! The web launcher carries the same backend-approved native release as Electron.
//! Embedded bytes are inert until their signed manifest and backend approval pass.
use base64::{engine::general_purpose::STANDARD, Engine};
use ed25519_dalek::{Signature, Verifier, VerifyingKey};
use serde::Deserialize;
use sha2::{Digest, Sha256};
use std::{
    fs::{self, OpenOptions},
    io::Write,
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
const ARCH: &str = "x64";

#[cfg(windows)]
const ENVELOPE: &[u8] = include_bytes!("../../resources/native/win-x64/manifest.json");
#[cfg(not(windows))]
const ENVELOPE: &[u8] = include_bytes!("../../resources/native/linux-x64/manifest.json");
#[cfg(windows)]
const INSPECTOR: &[u8] = include_bytes!("../../resources/native/win-x64/game-inspector.exe");
#[cfg(not(windows))]
const INSPECTOR: &[u8] = include_bytes!("../../resources/native/linux-x64/game-inspector");
#[cfg(windows)]
const MODULE: &[u8] =
    include_bytes!("../../resources/native/win-x64/papamo-cosmetic-module-win-x86.dll");
#[cfg(not(windows))]
const MODULE: &[u8] =
    include_bytes!("../../resources/native/linux-x64/papamo-cosmetic-module-linux-x86.so");
#[cfg(windows)]
const NEXT_CLIENT: &[u8] =
    include_bytes!("../../resources/native/win-x64/papamo-nextclient-client-mini-win-x86.dll");

pub struct NativeBundle {
    pub inspector: PathBuf,
    pub module: PathBuf,
    #[cfg(windows)]
    pub next_client: Option<PathBuf>,
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
        "game-inspector-linux-x64"
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

fn approve(config: &ReleaseConfig, envelope: &Envelope) -> Result<(), String> {
    let origin =
        url::Url::parse(&config.registry_url).map_err(|_| "Invalid native release registry")?;
    if origin.scheme() != "https"
        || origin.username() != ""
        || origin.password().is_some()
        || origin.path() != "/"
        || origin.query().is_some()
        || origin.fragment().is_some()
    {
        return Err("Invalid native release registry".into());
    }
    let endpoint = origin
        .join(&format!(
            "helper-releases/{}/{PLATFORM}/{ARCH}",
            config.version
        ))
        .map_err(|_| "Invalid native release registry")?;
    let agent = ureq::AgentBuilder::new()
        .redirects(0)
        .timeout(Duration::from_secs(10))
        .build();
    let reply: Envelope = agent
        .get(endpoint.as_str())
        .call()
        .map_err(|_| "Native release approval is unavailable")?
        .into_json()
        .map_err(|_| "Invalid native release approval")?;
    if reply.manifest != envelope.manifest || reply.signature != envelope.signature {
        return Err("Native release differs from backend approval".into());
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
    approve(&config, &envelope)?;
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
    fn embedded_bundle_matches_signed_release() {
        let config: ReleaseConfig =
            serde_json::from_str(include_str!("../../helper-release.json")).unwrap();
        let envelope: Envelope = serde_json::from_slice(ENVELOPE).unwrap();
        verify_envelope(&config, &envelope).unwrap();
    }
}
