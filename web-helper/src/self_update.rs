//! Verify a signed web-helper release before resuming the original invocation.
use super::*;
use base64::{engine::general_purpose::STANDARD, Engine};
use ed25519_dalek::{Signature, Verifier, VerifyingKey};
use std::io::Read;

const CONTEXT: &str = "16competitive.web-helper.update.v1\n";
const RELEASE_ROOT: &str = "https://github.com/keenplify/16competitive-client/releases";
#[cfg(windows)]
const ASSET: &str = "competitive16-web-helper.exe";
#[cfg(not(windows))]
const ASSET: &str = "competitive16-web-helper-linux";
#[derive(Deserialize)]
struct Envelope {
    manifest: String,
    signature: String,
}
#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Manifest {
    schema_version: u8,
    version: String,
    file_name: String,
    platform: String,
    arch: String,
    sha256: String,
    size_bytes: usize,
}
fn version(value: &str) -> Option<Vec<u32>> {
    let parts: Vec<_> = value
        .split('.')
        .map(str::parse::<u32>)
        .collect::<Result<_, _>>()
        .ok()?;
    (parts.len() == 3).then_some(parts)
}
fn verify(envelope: &Envelope, public_key: &str) -> Result<Manifest, String> {
    if envelope.manifest.len() > 4096 || envelope.signature.len() != 88 {
        return Err("Invalid helper update envelope".into());
    }
    let body: String = public_key
        .lines()
        .filter(|s| !s.starts_with("-----"))
        .collect();
    let der = STANDARD.decode(body).map_err(|_| "Invalid update key")?;
    const PREFIX: &[u8] = &[
        0x30, 0x2a, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x03, 0x21, 0x00,
    ];
    if der.len() != 44 || !der.starts_with(PREFIX) {
        return Err("Invalid update key".into());
    }
    let key = VerifyingKey::from_bytes(&der[12..].try_into().map_err(|_| "Invalid update key")?)
        .map_err(|_| "Invalid update key")?;
    let signature = Signature::from_slice(
        &STANDARD
            .decode(&envelope.signature)
            .map_err(|_| "Invalid update signature")?,
    )
    .map_err(|_| "Invalid update signature")?;
    key.verify(
        format!("{CONTEXT}{}", envelope.manifest).as_bytes(),
        &signature,
    )
    .map_err(|_| "Helper update signature verification failed")?;
    let m: Manifest =
        serde_json::from_str(&envelope.manifest).map_err(|_| "Invalid helper update manifest")?;
    if m.schema_version != 1
        || m.file_name != ASSET
        || m.arch != "x64"
        || m.platform != if cfg!(windows) { "win" } else { "linux" }
        || version(&m.version).is_none()
        || m.size_bytes == 0
        || m.size_bytes > 256 * 1024 * 1024
        || m.sha256.len() != 64
        || !m.sha256.bytes().all(|b| b.is_ascii_hexdigit())
    {
        return Err("Unsupported helper update".into());
    }
    Ok(m)
}
fn verify_bytes(bytes: &[u8], m: &Manifest) -> Result<(), String> {
    if bytes.len() != m.size_bytes || format!("{:x}", Sha256::digest(bytes)) != m.sha256 {
        return Err("Helper update hash mismatch".into());
    }
    Ok(())
}
fn limited_response(response: ureq::Response, limit: usize) -> Result<Vec<u8>, String> {
    let mut bytes = Vec::new();
    response
        .into_reader()
        .take((limit + 1) as u64)
        .read_to_end(&mut bytes)
        .map_err(|e| e.to_string())?;
    if bytes.len() > limit {
        return Err("Helper update exceeds size limit".into());
    }
    Ok(bytes)
}
fn resume_command(path: &Path, args: &[String], digest: &str) -> Command {
    let mut command = Command::new(path);
    command
        .args(args)
        .env("COMPETITIVE16_UPDATE_APPLIED_SHA", digest);
    #[cfg(windows)] {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }
    #[cfg(unix)] {
        use std::os::unix::process::CommandExt;
        command.process_group(0);
    }
    command
}
pub fn check_and_resume(args: &[String]) -> Result<bool, String> {
    // Development binaries never replace themselves with a production release.
    if cfg!(debug_assertions) {
        return Ok(false);
    }
    let current = env::current_exe().map_err(|e| e.to_string())?;
    let current_bytes = fs::read(&current).map_err(|e| e.to_string())?;
    let digest = format!("{:x}", Sha256::digest(&current_bytes));
    if env::var("COMPETITIVE16_UPDATE_APPLIED_SHA").ok().as_deref() == Some(&digest) {
        return Ok(false);
    }
    let config: serde_json::Value = serde_json::from_str(include_str!("../../helper-release.json"))
        .map_err(|e| e.to_string())?;
    let agent = ureq::AgentBuilder::new()
        .timeout(Duration::from_secs(8))
        .build();
    let response = match agent
        .get(&format!(
            "{RELEASE_ROOT}/latest/download/{ASSET}.update.json"
        ))
        .call()
    {
        Ok(response) => response,
        Err(_) => return Ok(false), // Offline/older releases retain the installed helper.
    };
    let envelope: Envelope = serde_json::from_slice(&limited_response(response, 8192)?)
        .map_err(|_| "Invalid helper update response")?;
    let m = verify(
        &envelope,
        config["publicKeyPem"]
            .as_str()
            .ok_or("Missing update key")?,
    )?;
    let package: serde_json::Value =
        serde_json::from_str(include_str!("../../package.json")).map_err(|e| e.to_string())?;
    let current_version = version(
        package["version"]
            .as_str()
            .ok_or("Invalid current version")?,
    )
    .ok_or("Invalid current version")?;
    if version(&m.version).ok_or("Invalid update version")? < current_version || m.sha256 == digest
    {
        return Ok(false);
    }
    let agent = ureq::AgentBuilder::new()
        .timeout(Duration::from_secs(45))
        .build();
    // Construct the URL from the pinned repository, validated version and fixed
    // platform asset. Signed metadata cannot redirect execution to another host.
    let response = agent
        .get(&format!("{RELEASE_ROOT}/download/v{}/{ASSET}", m.version))
        .call()
        .map_err(|_| "Could not download helper update")?;
    let bytes = limited_response(response, m.size_bytes)?;
    verify_bytes(&bytes, &m)?;
    let directory = user_config_dir()?.join("updates").join(&m.sha256);
    fs::create_dir_all(&directory).map_err(|e| e.to_string())?;
    let staged = directory.join(ASSET);
    if staged.exists() {
        verify_bytes(&fs::read(&staged).map_err(|e| e.to_string())?, &m)?;
    } else {
        let temp = directory.join(format!("{}.tmp", uuid::Uuid::new_v4()));
        let mut options = OpenOptions::new();
        options.write(true).create_new(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o700);
        }
        let mut file = options.open(&temp).map_err(|e| e.to_string())?;
        file.write_all(&bytes).map_err(|e| e.to_string())?;
        file.sync_all().map_err(|e| e.to_string())?;
        fs::rename(&temp, &staged).map_err(|e| e.to_string())?;
    }
    // argv is copied verbatim, including the one-time setup/join URL. A verified
    // digest skips exactly this child's duplicate update check and prevents loops.
    resume_command(&staged, args, &m.sha256)
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(true)
}

#[cfg(test)]
mod tests {
    use super::*;
    use ed25519_dalek::{Signer, SigningKey};
    fn fixture() -> (Envelope, String, Vec<u8>) {
        let key = SigningKey::from_bytes(&[7; 32]);
        let mut der = vec![
            0x30, 0x2a, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x03, 0x21, 0x00,
        ];
        der.extend(key.verifying_key().as_bytes());
        let pem = format!(
            "-----BEGIN PUBLIC KEY-----\n{}\n-----END PUBLIC KEY-----",
            STANDARD.encode(der)
        );
        let bytes = b"verified-helper".to_vec();
        let manifest = serde_json::to_string(&Manifest {
            schema_version: 1,
            version: "2026.1027.4".into(),
            file_name: ASSET.into(),
            platform: if cfg!(windows) { "win" } else { "linux" }.into(),
            arch: "x64".into(),
            sha256: format!("{:x}", Sha256::digest(&bytes)),
            size_bytes: bytes.len(),
        })
        .unwrap();
        let signature = STANDARD.encode(
            key.sign(format!("{CONTEXT}{manifest}").as_bytes())
                .to_bytes(),
        );
        (
            Envelope {
                manifest,
                signature,
            },
            pem,
            bytes,
        )
    }
    #[test]
    fn accepts_signed_bytes_and_rejects_modified_update() {
        let (e, k, b) = fixture();
        let m = verify(&e, &k).unwrap();
        assert!(verify_bytes(&b, &m).is_ok());
        assert!(verify_bytes(b"tampered", &m).is_err());
        let bad = Envelope {
            manifest: e.manifest.replace("2026.1027.4", "2026.1027.5"),
            signature: e.signature,
        };
        assert!(verify(&bad, &k).is_err());
    }
    #[test]
    fn resume_preserves_every_argument_without_shell_parsing() {
        let args=vec!["competitive16-helper://join/match?handoff=a-b+c&api=https%3A%2F%2F16competitive.papamo.dev".to_string(),"argument with spaces".to_string()];
        let command = resume_command(Path::new("verified-helper"), &args, "digest");
        assert_eq!(
            command
                .get_args()
                .map(|v| v.to_str().unwrap())
                .collect::<Vec<_>>(),
            args
        );
        assert!(command
            .get_envs()
            .any(|(k, v)| k == "COMPETITIVE16_UPDATE_APPLIED_SHA"
                && v.is_some_and(|v| v == "digest")));
    }
    #[test]
    fn release_versions_compare_numerically() {
        assert!(version("2026.1027.10") > version("2026.1027.9"));
        assert!(version("../release").is_none());
    }
}
