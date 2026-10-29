//! Signed, on-demand companion running the existing desktop game integrations.
//! The tray remains Rust; Electron exists only for device checks/setup or a game.
use super::*;
use base64::{engine::general_purpose::STANDARD, Engine};
use ed25519_dalek::{Signature, Verifier, VerifyingKey};
use std::thread;
use std::{
    collections::BTreeMap,
    io::{BufRead, BufReader, Read},
    path::Component,
};

const CONTEXT: &str = "16competitive.helper-runtime.v1\n";
const RELEASES: &str = "https://github.com/keenplify/16competitive-client/releases";
static INSTALLING: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);
pub fn busy() -> bool {
    INSTALLING.load(std::sync::atomic::Ordering::Relaxed)
}
pub fn installer_status() -> serde_json::Value {
    let read = || -> Option<serde_json::Value> {
        let p = user_config_dir().ok()?.join("nextclient-progress.json");
        let meta = fs::metadata(&p).ok()?;
        if meta.len() > 4096 || meta.modified().ok()?.elapsed().ok()?.as_secs() > 900 {
            return None;
        }
        serde_json::from_slice(&fs::read(p).ok()?).ok()
    };
    read().unwrap_or(serde_json::json!({"status":"idle"}))
}
pub fn installer(api: String) -> Result<serde_json::Value, String> {
    if INSTALLING.swap(true, std::sync::atomic::Ordering::SeqCst) {
        return Ok(installer_status());
    }
    let _ = fs::remove_file(user_config_dir()?.join("nextclient.cancel"));
    crate::native_session::owned_write(
        &user_config_dir()?.join("nextclient-progress.json"),
        b"{\"status\":\"installing\"}",
    )?;
    thread::spawn(move || {
        if invoke("installNextClient", &api, None, None).is_err() {
            if let Ok(dir) = user_config_dir() {
                let _ = crate::native_session::owned_write(
                    &dir.join("nextclient-progress.json"),
                    b"{\"status\":\"error\"}",
                );
            }
        }
        INSTALLING.store(false, std::sync::atomic::Ordering::SeqCst);
    });
    Ok(installer_status())
}
#[derive(Deserialize, Serialize)]
struct Envelope {
    manifest: String,
    signature: String,
}
#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct File {
    sha256: String,
    size_bytes: u64,
    executable: bool,
}
#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Manifest {
    schema_version: u8,
    version: String,
    platform: String,
    arch: String,
    file_name: String,
    sha256: String,
    size_bytes: u64,
    executable: String,
    files: BTreeMap<String, File>,
}
fn asset() -> &'static str {
    if cfg!(windows) {
        "helper-runtime-win-x64.tar.gz"
    } else if cfg!(target_arch = "aarch64") {
        "helper-runtime-linux-arm64.tar.gz"
    } else {
        "helper-runtime-linux-x64.tar.gz"
    }
}
fn runtime_arch() -> &'static str {
    if cfg!(target_arch = "aarch64") { "arm64" } else { "x64" }
}
fn hash_valid(value: &str) -> bool {
    value.len() == 64
        && value
            .bytes()
            .all(|b| b.is_ascii_hexdigit() && !b.is_ascii_uppercase())
}
fn safe_path(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 512
        && !value.contains(['\\', ':', '\0'])
        && Path::new(value)
            .components()
            .all(|c| matches!(c, Component::Normal(_)))
}
fn version(value: &str) -> Option<Vec<u32>> {
    let v = value
        .split('.')
        .map(str::parse)
        .collect::<Result<Vec<u32>, _>>()
        .ok()?;
    (v.len() == 3).then_some(v)
}
fn verify(envelope: &Envelope) -> Result<Manifest, String> {
    if envelope.manifest.len() > 2 * 1024 * 1024 {
        return Err("Runtime manifest exceeds its limit".into());
    }
    let config: serde_json::Value = serde_json::from_str(include_str!("../../helper-release.json"))
        .map_err(|_| "Invalid runtime key")?;
    let pem = config["publicKeyPem"]
        .as_str()
        .ok_or("Missing runtime key")?;
    let body = pem
        .lines()
        .filter(|l| !l.starts_with("-----"))
        .collect::<String>();
    let der = STANDARD.decode(body).map_err(|_| "Invalid runtime key")?;
    let prefix = [
        0x30, 0x2a, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x03, 0x21, 0x00,
    ];
    if der.len() != 44 || !der.starts_with(&prefix) {
        return Err("Invalid runtime key".into());
    }
    let key = VerifyingKey::from_bytes(&der[12..].try_into().map_err(|_| "Invalid runtime key")?)
        .map_err(|_| "Invalid runtime key")?;
    let signature = Signature::from_slice(
        &STANDARD
            .decode(&envelope.signature)
            .map_err(|_| "Invalid runtime signature")?,
    )
    .map_err(|_| "Invalid runtime signature")?;
    key.verify(
        format!("{CONTEXT}{}", envelope.manifest).as_bytes(),
        &signature,
    )
    .map_err(|_| "Runtime signature verification failed")?;
    let m: Manifest =
        serde_json::from_str(&envelope.manifest).map_err(|_| "Invalid runtime manifest")?;
    let package: serde_json::Value = serde_json::from_str(include_str!("../../package.json"))
        .map_err(|_| "Invalid runtime version")?;
    let minimum = version(
        package["version"]
            .as_str()
            .ok_or("Invalid runtime version")?,
    )
    .ok_or("Invalid runtime version")?;
    if m.schema_version != 1
        || m.platform != if cfg!(windows) { "win" } else { "linux" }
        || m.arch != runtime_arch()
        || m.file_name != asset()
        || !hash_valid(&m.sha256)
        || m.size_bytes == 0
        || m.size_bytes > 512 * 1024 * 1024
        || version(&m.version).is_none_or(|v| v < minimum)
        || !safe_path(&m.executable)
        || !m.files.contains_key(&m.executable)
        || m.files.is_empty()
        || m.files.len() > 20000
        || m.files.iter().any(|(p, f)| {
            !safe_path(p) || !hash_valid(&f.sha256) || f.size_bytes > 512 * 1024 * 1024
        })
        || m.files.values().map(|f| f.size_bytes).sum::<u64>() > 2 * 1024 * 1024 * 1024
    {
        return Err("Unsupported helper runtime".into());
    }
    Ok(m)
}
fn read_limited(mut input: impl Read, limit: u64) -> Result<Vec<u8>, String> {
    let mut out = Vec::new();
    input
        .by_ref()
        .take(limit + 1)
        .read_to_end(&mut out)
        .map_err(|e| e.to_string())?;
    if out.len() as u64 > limit {
        return Err("Runtime response exceeds its limit".into());
    }
    Ok(out)
}
fn file_hash(path: &Path) -> Result<String, String> {
    let mut file = fs::File::open(path)
        .map_err(|e| e.to_string())?
        .take(512 * 1024 * 1024 + 1);
    let mut hash = Sha256::new();
    let mut block = [0; 65536];
    loop {
        let n = file.read(&mut block).map_err(|e| e.to_string())?;
        if n == 0 {
            break;
        }
        hash.update(&block[..n]);
    }
    Ok(format!("{:x}", hash.finalize()))
}
fn verify_tree(root: &Path, m: &Manifest) -> Result<(), String> {
    let meta = fs::symlink_metadata(root).map_err(|e| e.to_string())?;
    if !meta.is_dir() || meta.file_type().is_symlink() {
        return Err("Invalid runtime root".into());
    }
    fn walk(root: &Path, dir: &Path, m: &Manifest, count: &mut usize) -> Result<(), String> {
        for entry in fs::read_dir(dir).map_err(|e| e.to_string())? {
            let entry = entry.map_err(|e| e.to_string())?;
            let path = entry.path();
            let meta = fs::symlink_metadata(&path).map_err(|e| e.to_string())?;
            if meta.file_type().is_symlink() {
                return Err("Runtime contains a symbolic link".into());
            }
            if meta.is_dir() {
                let prefix = path
                    .strip_prefix(root)
                    .map_err(|_| "Invalid runtime directory")?
                    .to_string_lossy()
                    .replace('\\', "/")
                    + "/";
                if !m.files.keys().any(|name| name.starts_with(&prefix)) {
                    return Err("Unexpected runtime directory".into());
                }
                walk(root, &path, m, count)?;
                continue;
            }
            let name = path
                .strip_prefix(root)
                .map_err(|_| "Invalid runtime path")?
                .to_string_lossy()
                .replace('\\', "/");
            let f = m.files.get(&name).ok_or("Unexpected runtime file")?;
            if !meta.is_file() || meta.len() != f.size_bytes || file_hash(&path)? != f.sha256 {
                return Err("Runtime file verification failed".into());
            }
            *count += 1;
        }
        Ok(())
    }
    let mut count = 0;
    walk(root, root, m, &mut count)?;
    if count != m.files.len() {
        return Err("Runtime files are missing".into());
    }
    Ok(())
}
fn unpack(bytes: &[u8], root: &Path, m: &Manifest) -> Result<(), String> {
    let mut archive = tar::Archive::new(flate2::read::GzDecoder::new(bytes));
    let mut seen = std::collections::HashSet::new();
    for entry in archive.entries().map_err(|e| e.to_string())? {
        let mut entry = entry.map_err(|e| e.to_string())?;
        if entry.header().entry_type().is_dir() {
            continue;
        }
        if !entry.header().entry_type().is_file() {
            return Err("Unsupported runtime archive entry".into());
        }
        let path = entry
            .path()
            .map_err(|e| e.to_string())?
            .to_string_lossy()
            .trim_start_matches("./")
            .to_owned();
        if !safe_path(&path) || !seen.insert(path.clone()) {
            return Err("Invalid runtime archive path".into());
        }
        let f = m
            .files
            .get(&path)
            .ok_or("Unexpected runtime archive file")?;
        if entry.size() != f.size_bytes {
            return Err("Runtime archive size mismatch".into());
        }
        let target = root.join(&path);
        fs::create_dir_all(target.parent().ok_or("Invalid runtime path")?)
            .map_err(|e| e.to_string())?;
        let mut options = OpenOptions::new();
        options.create_new(true).write(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(if f.executable { 0o700 } else { 0o600 });
        }
        let mut file = options.open(&target).map_err(|e| e.to_string())?;
        std::io::copy(&mut entry, &mut file).map_err(|e| e.to_string())?;
    }
    verify_tree(root, m)
}
pub fn ensure() -> Result<PathBuf, String> {
    #[cfg(debug_assertions)]
    if let Some(path) = env::var_os("COMPETITIVE16_RUNTIME_EXE") {
        return Ok(PathBuf::from(path));
    }
    let config = user_config_dir()?;
    fs::create_dir_all(&config).map_err(|e| e.to_string())?;
    let lock = OpenOptions::new()
        .write(true)
        .create(true)
        .truncate(false)
        .open(config.join("runtime-update.lock"))
        .map_err(|e| e.to_string())?;
    fs2::FileExt::lock_exclusive(&lock).map_err(|e| e.to_string())?;
    let cached = config.join("runtime-update.json");
    let agent = ureq::AgentBuilder::new()
        .timeout(Duration::from_secs(120))
        .build();
    let envelope: Envelope = match agent
        .get(&format!(
            "{RELEASES}/latest/download/{}.update.json",
            asset()
        ))
        .call()
    {
        Ok(reply) => serde_json::from_slice(&read_limited(reply.into_reader(), 3 * 1024 * 1024)?)
            .map_err(|_| "Invalid runtime update")?,
        Err(_) => serde_json::from_slice(
            &fs::read(&cached)
                .map_err(|_| "Connect to the internet to set up the helper runtime")?,
        )
        .map_err(|_| "Invalid cached runtime update")?,
    };
    let m = verify(&envelope)?;
    // A validly signed older release still cannot roll back an installed runtime.
    if let Ok(bytes) = fs::read(&cached) {
        if let Ok(previous) = serde_json::from_slice::<Envelope>(&bytes) {
            if let Ok(old) = verify(&previous) {
                if version(&m.version) < version(&old.version) {
                    return Err("Runtime rollback rejected".into());
                }
            }
        }
    }
    let root = config.join("runtimes").join(&m.sha256);
    fs::create_dir_all(config.join("runtimes")).map_err(|e| e.to_string())?;
    if fs::symlink_metadata(config.join("runtimes"))
        .map_err(|e| e.to_string())?
        .file_type()
        .is_symlink()
    {
        return Err("Invalid runtime cache directory".into());
    }
    if !root.exists() || verify_tree(&root, &m).is_err() {
        let url = format!("{RELEASES}/download/v{}/{}", m.version, m.file_name);
        let bytes = read_limited(
            agent
                .get(&url)
                .call()
                .map_err(|_| "Helper runtime download failed")?
                .into_reader(),
            m.size_bytes,
        )?;
        if bytes.len() as u64 != m.size_bytes || format!("{:x}", Sha256::digest(&bytes)) != m.sha256
        {
            return Err("Runtime archive verification failed".into());
        }
        let pending = config
            .join("runtimes")
            .join(format!(".{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&pending).map_err(|e| e.to_string())?;
        if let Err(e) = unpack(&bytes, &pending, &m) {
            let _ = fs::remove_dir_all(&pending);
            return Err(e);
        }
        if root.exists() {
            fs::rename(
                &root,
                root.with_extension(format!("invalid-{}", uuid::Uuid::new_v4())),
            )
            .map_err(|e| e.to_string())?;
        }
        fs::rename(&pending, &root).map_err(|e| e.to_string())?;
    }
    crate::native_session::owned_write(
        &cached,
        &serde_json::to_vec(&envelope).map_err(|e| e.to_string())?,
    )?;
    Ok(root.join(&m.executable))
}
pub fn invoke(
    action: &str,
    api: &str,
    token: Option<&str>,
    match_id: Option<&str>,
) -> Result<serde_json::Value, String> {
    invoke_session(action, api, token, match_id, None, None)
}
pub fn microphone(api: String) -> Result<serde_json::Value, String> {
    let (send, receive) = std::sync::mpsc::sync_channel(1);
    std::thread::spawn(move || {
        let _ = invoke_session("microphone", &api, None, None, None, Some(send));
    });
    receive.recv_timeout(Duration::from_secs(120)).map_err(|_| "Native microphone unavailable".into())
}
pub fn launch(connection: &Connection, api: &str, token: &str) -> Result<(), String> {
    invoke_session(
        "launch",
        api,
        Some(token),
        Some(&connection.match_id),
        Some(connection),
        None,
    )
    .map(|_| ())
}
fn invoke_session(
    action: &str,
    api: &str,
    token: Option<&str>,
    match_id: Option<&str>,
    connection: Option<&Connection>,
    ready: Option<std::sync::mpsc::SyncSender<serde_json::Value>>,
) -> Result<serde_json::Value, String> {
    if competitive16_web_helper::allowed_api_origin(api, cfg!(debug_assertions)).as_deref()
        != Some(api)
    {
        return Err("Invalid runtime origin".into());
    }
    let _operation_lock = if matches!(action, "launch" | "installNextClient" | "microphone") {
        let path = user_config_dir()?.join(if action == "launch" {
            "runtime-game.lock"
        } else if action == "microphone" {
            "runtime-microphone.lock"
        } else {
            "runtime-install.lock"
        });
        let file = OpenOptions::new()
            .write(true)
            .create(true)
            .truncate(false)
            .open(path)
            .map_err(|e| e.to_string())?;
        let deadline = std::time::Instant::now() + Duration::from_secs(5);
        loop {
            match fs2::FileExt::try_lock_exclusive(&file) {
                Ok(()) => break,
                Err(_) if action == "microphone" && std::time::Instant::now() < deadline => {
                    thread::sleep(Duration::from_millis(100));
                }
                Err(_) => return Err("A native helper action is already running".into()),
            }
        }
        Some(file)
    } else {
        None
    };
    let executable = ensure()?;
    let listener = std::net::TcpListener::bind((std::net::Ipv4Addr::LOCALHOST, 0))
        .map_err(|e| e.to_string())?;
    listener.set_nonblocking(true).map_err(|e| e.to_string())?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();
    let capability = format!(
        "{}{}",
        uuid::Uuid::new_v4().simple(),
        uuid::Uuid::new_v4().simple()
    );
    let mut command = Command::new(executable);
    #[cfg(target_os = "linux")]
    command.arg("--disable-setuid-sandbox"); // Keep Chromium's user-namespace sandbox; cache files are never setuid.
    #[cfg(debug_assertions)]
    if let Some(app) = env::var_os("COMPETITIVE16_RUNTIME_APP") {
        command.arg(app);
    }
    command
        .arg("--native-helper-runtime")
        .arg(user_config_dir()?)
        .arg(port.to_string())
        .arg(&capability)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    // Do not let Electron inherit Node/Electron injection knobs from a browser
    // protocol handler or a developer shell.
    for name in [
        "ELECTRON_RUN_AS_NODE",
        "NODE_OPTIONS",
        "NODE_PATH",
        "ELECTRON_REPL_MODE",
        "LD_PRELOAD",
    ] {
        command.env_remove(name);
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }
    let mut child = command
        .spawn()
        .map_err(|_| "Could not start the helper runtime")?;
    let request = serde_json::json!({"protocol":1,"action":action,"apiOrigin":api,"token":token,"matchId":match_id});
    let deadline = std::time::Instant::now() + Duration::from_secs(30);
    let mut reader = loop {
        match listener.accept() {
            Ok((stream, _)) => {
                stream.set_nonblocking(false).map_err(|e|e.to_string())?;
                stream
                    .set_read_timeout(Some(Duration::from_secs(5)))
                    .map_err(|e| e.to_string())?;
                stream
                    .set_write_timeout(Some(Duration::from_secs(5)))
                    .map_err(|e| e.to_string())?;
                let mut candidate = BufReader::new(stream);
                let mut line = Vec::new();
                let valid = candidate
                    .by_ref()
                    .take(1025)
                    .read_until(b'\n', &mut line)
                    .is_ok()
                    && line.len() <= 1024
                    && serde_json::from_slice::<serde_json::Value>(&line)
                        .ok()
                        .is_some_and(|v| v["protocol"] == 1 && v["capability"] == capability);
                if valid {
                    break candidate;
                }
            }
            Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                thread::sleep(Duration::from_millis(50))
            }
            Err(_) => {
                let _ = child.kill();
                return Err("Runtime control channel unavailable".into());
            }
        }
        if std::time::Instant::now() > deadline
            || child.try_wait().map_err(|e| e.to_string())?.is_some()
        {
            let _ = child.kill();
            return Err("Runtime did not authenticate its control channel".into());
        }
    };
    reader
        .get_ref()
        .set_read_timeout(Some(Duration::from_secs(300)))
        .map_err(|e| e.to_string())?;
    writeln!(reader.get_mut(), "{request}").map_err(|_| "Runtime control channel failed")?;
    let mut result = None;
    let mut _activity: Option<crate::presence::GameLease> = None;
    loop {
        let limit = if action == "diagnostics" { 220_000 } else { 16384 };
        let mut line = Vec::new();
        let n = reader
            .by_ref()
            .take((limit + 1) as u64)
            .read_until(b'\n', &mut line)
            .map_err(|_| "Runtime reply failed")?;
        if n == 0 {
            break;
        }
        if line.len() > limit {
            let _ = child.kill();
            return Err("Runtime reply exceeds its limit".into());
        }
        let v: serde_json::Value =
            serde_json::from_slice(&line).map_err(|_| "Invalid runtime reply")?;
        if v["event"] == "launched" {
            if let Some(connection) = connection {
                _activity = Some(crate::presence::GameLease::start(
                    connection,
                    v["sessionDirectory"].as_str().map(PathBuf::from),
                ));
            }
        }
        if v["event"] == "microphoneReady" {
            if let Some(sender) = &ready {
                if sender.send(v.clone()).is_err() {
                    let _ = child.kill();
                    return Err("Microphone requester disconnected".into());
                }
            }
        }
        if v.get("ok").is_some() {
            result = Some(v);
        }
    }
    let status = child.wait().map_err(|_| "Runtime did not exit cleanly")?;
    let value = result.ok_or("Helper runtime returned no result")?;
    if !status.success() || value["ok"] != true {
        let stage = value["stage"].as_str().filter(|stage|
            ["control", "startup", "preferences", "connection", "assets", "game"].contains(stage)
        ).unwrap_or("unknown");
        let code = value["error"].as_str().filter(|code|
            ["runtimeUnavailable", "ENOENT", "EACCES", "ENOEXEC", "EPERM", "ECONNREFUSED", "ETIMEDOUT"].contains(code)
        ).unwrap_or("runtimeUnavailable");
        return Err(format!("Helper runtime could not complete the action (stage: {stage}, code: {code})"));
    }
    Ok(value)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn confines_runtime_paths() {
        for p in ["../x", "/x", "C:/x", "a\\b", "a/../b", ""] {
            assert!(!safe_path(p));
        }
        assert!(safe_path("resources/app.asar"));
    }
    #[test]
    fn verifies_unpacked_files_and_rejects_archive_links_and_extra_files() {
        let root = env::temp_dir().join(format!("16c-runtime-{}", uuid::Uuid::new_v4()));
        fs::create_dir(&root).unwrap();
        let bytes = b"trusted runtime";
        let m = Manifest {
            schema_version: 1,
            version: "2026.1027.6".into(),
            platform: "win".into(),
            arch: "x64".into(),
            file_name: asset().into(),
            sha256: "a".repeat(64),
            size_bytes: 1,
            executable: "runtime".into(),
            files: BTreeMap::from([(
                "runtime".into(),
                File {
                    sha256: format!("{:x}", Sha256::digest(bytes)),
                    size_bytes: bytes.len() as u64,
                    executable: true,
                },
            )]),
        };
        let archive = |link: bool| {
            let gzip = flate2::write::GzEncoder::new(Vec::new(), flate2::Compression::default());
            let mut tar = tar::Builder::new(gzip);
            let mut header = tar::Header::new_gnu();
            header.set_mode(0o700);
            if link {
                header.set_entry_type(tar::EntryType::Symlink);
                header.set_link_name("../outside").unwrap();
                header.set_size(0);
                header.set_cksum();
                tar.append_data(&mut header, "runtime", std::io::empty())
                    .unwrap();
            } else {
                header.set_size(bytes.len() as u64);
                header.set_cksum();
                tar.append_data(&mut header, "runtime", &bytes[..]).unwrap();
            }
            tar.into_inner().unwrap().finish().unwrap()
        };
        assert!(unpack(&archive(true), &root, &m).is_err());
        unpack(&archive(false), &root, &m).unwrap();
        verify_tree(&root, &m).unwrap();
        fs::write(root.join("unexpected.dll"), b"untrusted").unwrap();
        assert!(verify_tree(&root, &m).is_err());
        fs::remove_file(root.join("unexpected.dll")).unwrap();
        fs::write(root.join("runtime"), b"changed runtime").unwrap();
        assert!(verify_tree(&root, &m).is_err());
        fs::remove_dir_all(root).unwrap();
    }
}
