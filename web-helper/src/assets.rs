//! Verified assets only, confined to managed game namespaces and a local cache.
use super::*;
use regex::Regex;
use std::{
    collections::HashSet,
    io::Read,
    sync::{
        atomic::{AtomicBool, Ordering},
        LazyLock,
    },
};
static BUSY: AtomicBool = AtomicBool::new(false);
pub fn busy() -> bool {
    BUSY.load(Ordering::Relaxed)
}

#[derive(Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Progress {
    pub status: String,
    pub completed_files: usize,
    pub total_files: usize,
}
#[derive(Deserialize)]
struct Asset {
    path: String,
    sha256: Option<String>,
}
#[derive(Deserialize)]
struct Manifest {
    assets: Vec<Asset>,
}
static MODEL: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(
        r"^models/16competitive/[a-z0-9_]+/([a-f0-9]{16,64})/(?:view|player|world|v|p|w)\.mdl$",
    )
    .unwrap()
});
static AUDIO: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"^sound/16competitive/[a-z0-9_]+/([a-f0-9]{16,64})/action\.wav$").unwrap()
});
static SPRITE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"^sprites/16competitive/[a-z0-9_]+/([a-f0-9]{16,64})/(?:explosion|e|gas)\.spr$")
        .unwrap()
});
static CATALOG: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"^(?:models|sound|sprites)/16competitive/[a-zA-Z0-9_/-]+\.(?:mdl|wav|spr)$")
        .unwrap()
});
static MAP: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"^maps/[a-z0-9_]{1,64}\.bsp$").unwrap());
const PING: &[&str] = &[
    "models/16competitive/ping/v2/ef_gundrop.mdl",
    "models/16competitive/ping/v2/ef_gundrop_red.mdl",
    "sound/16competitive/ping/v1/ping.wav",
    "sound/16competitive/ping/v1/item.wav",
    "sound/16competitive/ping/v1/enemy.wav",
];
fn hash_for(asset: &Asset, catalog: bool) -> Result<String, String> {
    if asset.path.len() > 256
        || asset
            .path
            .split('/')
            .any(|p| p.is_empty() || p == "." || p == "..")
    {
        return Err("Invalid managed asset path".into());
    }
    let path_hash = [&*MODEL, &*AUDIO, &*SPRITE]
        .into_iter()
        .find_map(|r| r.captures(&asset.path).map(|v| v[1].to_owned()));
    if !(if catalog {
        CATALOG.is_match(&asset.path)
    } else {
        path_hash.is_some() || PING.contains(&asset.path.as_str()) || MAP.is_match(&asset.path)
    }) {
        return Err("Unsupported managed asset path".into());
    }
    if let Some(hash) = &asset.sha256 {
        if hash.len() != 64
            || !hash
                .bytes()
                .all(|c| c.is_ascii_hexdigit() && !c.is_ascii_uppercase())
            || path_hash.as_ref().is_some_and(|h| !hash.starts_with(h))
        {
            return Err("Invalid managed asset hash".into());
        }
        return Ok(hash.clone());
    }
    if !catalog {
        if let Some(hash) = path_hash {
            return Ok(hash);
        }
    }
    Err("Managed asset is missing its hash".into())
}
fn limit(path: &str) -> u64 {
    if MAP.is_match(path) {
        128 * 1024 * 1024
    } else {
        20 * 1024 * 1024
    }
}
fn valid_header(path: &str, head: &[u8]) -> bool {
    if head.len() < 16 {
        return false;
    }
    if path.ends_with(".mdl") {
        head.starts_with(b"IDST") && head[4..8] == 10i32.to_le_bytes()
    } else if path.ends_with(".wav") {
        head.starts_with(b"RIFF") && &head[8..12] == b"WAVE"
    } else if path.ends_with(".spr") {
        head.starts_with(b"IDSP")
    } else {
        head[..4] == 30i32.to_le_bytes()
    }
}
fn checked_file(path: &Path) -> Result<fs::File, String> {
    if !fs::symlink_metadata(path)
        .map_err(|e| e.to_string())?
        .is_file()
    {
        return Err("Asset is not a regular file".into());
    }
    let mut options = OpenOptions::new();
    options.read(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.custom_flags(libc::O_NOFOLLOW);
    }
    options.open(path).map_err(|e| e.to_string())
}
fn matches(path: &Path, asset: &Asset, expected: &str) -> bool {
    let Ok(mut file) = checked_file(path) else {
        return false;
    };
    let Ok(metadata) = file.metadata() else {
        return false;
    };
    if metadata.len() < 16 || metadata.len() > limit(&asset.path) {
        return false;
    }
    let mut header = [0; 16];
    if file.read_exact(&mut header).is_err() || !valid_header(&asset.path, &header) {
        return false;
    }
    let mut hash = Sha256::new();
    hash.update(header);
    let mut buffer = [0; 65536];
    let mut size = 16;
    loop {
        match file.read(&mut buffer) {
            Ok(0) => break,
            Ok(n) => {
                size += n as u64;
                if size > limit(&asset.path) {
                    return false;
                }
                hash.update(&buffer[..n]);
            }
            Err(_) => return false,
        }
    }
    format!("{:x}", hash.finalize()).starts_with(expected)
}
fn destination(root: &Path, path: &str) -> Result<PathBuf, String> {
    let canonical = fs::canonicalize(root).map_err(|e| e.to_string())?;
    let mut current = canonical.clone();
    let parts: Vec<_> = path.split('/').collect();
    for (index, part) in parts.iter().enumerate() {
        if part.is_empty() || *part == "." || *part == ".." || part.contains(['\\', ':', '\0']) {
            return Err("Unsafe managed asset path".into());
        }
        current.push(part);
        match fs::symlink_metadata(&current) {
            Ok(meta) if linked(&meta) => {
                return Err("Managed asset directory contains a symbolic link".into())
            }
            Ok(meta) if index + 1 < parts.len() && !meta.is_dir() => {
                return Err("Managed asset parent is not a directory".into())
            }
            Err(e) if e.kind() == std::io::ErrorKind::NotFound && index + 1 < parts.len() => {
                fs::create_dir(&current).map_err(|e| e.to_string())?;
            }
            Err(e) if e.kind() != std::io::ErrorKind::NotFound => return Err(e.to_string()),
            _ => {}
        }
        if current.parent().is_none_or(|p| !p.starts_with(&canonical)) {
            return Err("Managed asset escaped its root".into());
        }
    }
    Ok(current)
}

fn linked(metadata: &fs::Metadata) -> bool {
    if metadata.file_type().is_symlink() {
        return true;
    }
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        return metadata.file_attributes() & 0x400 != 0; // FILE_ATTRIBUTE_REPARSE_POINT
    }
    #[cfg(not(windows))]
    {
        false
    }
}

/// Electron's default userData location, shared by the desktop and companion
/// runtime. Never derive an approved storage root from the game link itself.
fn desktop_config_home() -> Result<PathBuf, String> {
    #[cfg(windows)]
    let home = env::var_os("APPDATA").map(PathBuf::from);
    #[cfg(not(windows))]
    let home = env::var_os("XDG_CONFIG_HOME")
        .map(PathBuf::from)
        .filter(|home| home.is_absolute())
        .or_else(|| env::var_os("HOME").map(|home| PathBuf::from(home).join(".config")));
    home.filter(|home| home.is_absolute())
        .ok_or_else(|| "Managed asset directory contains a symbolic link".into())
}

/// Accept only the launcher's existing models/16competitive link. Resolve all
/// writes against the independently approved physical cache, never through the
/// game link. Ordinary installations continue to use their existing directory.
fn game_destination(root: &Path, path: &str) -> Result<PathBuf, String> {
    game_destination_under(root, path, &desktop_config_home)
}

fn game_destination_under(
    root: &Path,
    path: &str,
    config_home: &impl Fn() -> Result<PathBuf, String>,
) -> Result<PathBuf, String> {
    let Some(suffix) = path.strip_prefix("models/16competitive/") else {
        return destination(root, path);
    };
    let game = fs::canonicalize(root).map_err(|e| e.to_string())?;
    let models = game.join("models");
    // Do not inspect or follow a namespace underneath an unapproved parent link.
    match fs::symlink_metadata(&models) {
        Ok(meta) if linked(&meta) => {
            return Err("Managed asset directory contains a symbolic link".into());
        }
        Ok(meta) if !meta.is_dir() => {
            return Err("Managed asset parent is not a directory".into());
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return destination(root, path);
        }
        Err(error) => return Err(error.to_string()),
        _ => {}
    }
    let namespace = models.join("16competitive");
    match fs::symlink_metadata(&namespace) {
        Ok(meta) if linked(&meta) => {}
        Ok(_) => return destination(root, path),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return destination(root, path);
        }
        Err(error) => return Err(error.to_string()),
    }
    let mut approved = fs::canonicalize(config_home()?).map_err(|e| e.to_string())?;
    for part in ["16competitive-client", "game-assets", "models", "16competitive"] {
        approved.push(part);
        let metadata = fs::symlink_metadata(&approved).map_err(|e| e.to_string())?;
        if linked(&metadata) {
            return Err("Managed asset directory contains a symbolic link".into());
        }
        if !metadata.is_dir() {
            return Err("Managed asset parent is not a directory".into());
        }
    }
    let approved = fs::canonicalize(approved).map_err(|e| e.to_string())?;
    if fs::canonicalize(namespace).map_err(|e| e.to_string())? != approved {
        return Err("Managed asset directory contains a symbolic link".into());
    }
    destination(&approved, suffix)
}
fn write_progress(value: &Progress) {
    if let Ok(dir) = user_config_dir() {
        let temp = dir.join(format!("asset-progress.{}.tmp", uuid::Uuid::new_v4()));
        let target = dir.join("asset-progress.json");
        if fs::write(&temp, serde_json::to_vec(value).unwrap_or_default()).is_ok() {
            let _ = fs::rename(temp, target);
        }
    }
}
pub fn status() -> Progress {
    let read = || -> Option<Progress> {
        let path = user_config_dir().ok()?.join("asset-progress.json");
        let meta = fs::metadata(&path).ok()?;
        if meta.len() > 1024 || meta.modified().ok()?.elapsed().ok()?.as_secs() > 180 {
            return None;
        }
        serde_json::from_slice(&fs::read(path).ok()?).ok()
    };
    read().unwrap_or(Progress {
        status: "idle".into(),
        completed_files: 0,
        total_files: 0,
    })
}
fn api(origin: &str, token: &str) -> Result<ureq::Agent, String> {
    if competitive16_web_helper::allowed_api_origin(origin, cfg!(debug_assertions)).as_deref()
        != Some(origin)
        || token.len() > 8192
        || token.is_empty()
        || !token.bytes().all(|c| c > 32 && c < 127)
    {
        return Err("Invalid asset session".into());
    }
    Ok(ureq::AgentBuilder::new()
        .redirects(0)
        .timeout(Duration::from_secs(90))
        .build())
}
fn request(agent: &ureq::Agent, url: &str, token: &str, max: u64) -> Result<Vec<u8>, String> {
    let reply = agent
        .get(url)
        .set("Authorization", &format!("Bearer {token}"))
        .call()
        .map_err(|_| "Managed asset service is unavailable")?;
    let mut bytes = Vec::new();
    reply
        .into_reader()
        .take(max + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| "Managed asset download failed")?;
    if bytes.len() as u64 > max {
        return Err("Managed asset exceeds its size limit".into());
    }
    Ok(bytes)
}
fn sync(root: &Path, origin: &str, token: &str, match_id: Option<&str>) -> Result<(), String> {
    let agent = api(origin, token)?;
    let config = user_config_dir()?;
    fs::create_dir_all(&config).map_err(|e| e.to_string())?;
    let lock = OpenOptions::new()
        .write(true)
        .create(true)
        .truncate(false)
        .open(config.join("asset-sync.lock"))
        .map_err(|e| e.to_string())?;
    fs2::FileExt::lock_exclusive(&lock).map_err(|e| e.to_string())?;
    write_progress(&Progress {
        status: "syncing".into(),
        completed_files: 0,
        total_files: 0,
    });
    let result = (|| {
        let manifest_url = if let Some(id) = match_id {
            format!("{origin}/matches/{id}/assets")
        } else {
            format!("{origin}/skins/assets/manifest")
        };
        let manifest: Manifest =
            serde_json::from_slice(&request(&agent, &manifest_url, token, 4 * 1024 * 1024)?)
                .map_err(|_| "Invalid asset manifest")?;
        if manifest.assets.len() > 20000 {
            return Err("Asset manifest is too large".into());
        }
        let mut seen = HashSet::new();
        // Validate the complete manifest before creating any game destinations.
        for asset in &manifest.assets {
            hash_for(asset, match_id.is_none())?;
            if !seen.insert(asset.path.clone()) {
                return Err("Duplicate managed asset destination".into());
            }
        }
        let cache = config.join("game-assets/cache");
        fs::create_dir_all(&cache).map_err(|e| e.to_string())?;
        let total = manifest.assets.len();
        for (index, asset) in manifest.assets.iter().enumerate() {
            let expected = hash_for(asset, match_id.is_none())?;
            let target = game_destination(root, &asset.path)?;
            if !matches(&target, asset, &expected) {
                let cached = destination(
                    &cache,
                    &format!(
                        "{expected}.{}",
                        Path::new(&asset.path)
                            .extension()
                            .and_then(|v| v.to_str())
                            .ok_or("Invalid asset extension")?
                    ),
                )?;
                if !matches(&cached, asset, &expected) {
                    let mut url = url::Url::parse(origin).map_err(|_| "Invalid asset API")?;
                    url.set_path(&if let Some(id) = match_id {
                        format!("/matches/{id}/assets/file")
                    } else {
                        "/skins/assets/file".into()
                    });
                    url.query_pairs_mut().append_pair("path", &asset.path);
                    let mut downloaded = None;
                    for attempt in 0..3 {
                        if let Ok(bytes) = request(&agent, url.as_str(), token, limit(&asset.path))
                        {
                            if valid_header(&asset.path, &bytes)
                                && format!("{:x}", Sha256::digest(&bytes)).starts_with(&expected)
                            {
                                downloaded = Some(bytes);
                                break;
                            }
                        }
                        if attempt < 2 {
                            std::thread::sleep(Duration::from_millis(500 * (attempt + 1)));
                        }
                    }
                    let bytes = downloaded.ok_or("Could not verify required managed assets")?;
                    let temp = cached.with_extension(format!("{}.tmp", uuid::Uuid::new_v4()));
                    let mut options = OpenOptions::new();
                    options.create_new(true).write(true);
                    #[cfg(unix)]
                    {
                        use std::os::unix::fs::OpenOptionsExt;
                        options.mode(0o600);
                    }
                    let mut file = options.open(&temp).map_err(|e| e.to_string())?;
                    file.write_all(&bytes).map_err(|e| e.to_string())?;
                    file.sync_all().map_err(|e| e.to_string())?;
                    drop(file);
                    fs::rename(temp, &cached).map_err(|e| e.to_string())?;
                }
                let temp = target.with_extension(format!("{}.tmp", uuid::Uuid::new_v4()));
                fs::copy(&cached, &temp).map_err(|e| e.to_string())?;
                if !matches(&temp, asset, &expected) {
                    let _ = fs::remove_file(temp);
                    return Err("Asset changed during installation".into());
                }
                fs::rename(temp, target).map_err(|e| e.to_string())?;
            }
            write_progress(&Progress {
                status: "syncing".into(),
                completed_files: index + 1,
                total_files: total,
            });
        }
        write_progress(&Progress {
            status: "ready".into(),
            completed_files: total,
            total_files: total,
        });
        Ok(())
    })();
    if result.is_err() {
        let old = status();
        write_progress(&Progress {
            status: "error".into(),
            ..old
        });
    }
    result
}
pub fn prepare_match(
    root: &Path,
    connection: &Connection,
    origin: &str,
    token: &str,
) -> Result<(), String> {
    sync(root, origin, token, Some(&connection.match_id))
}
pub fn start_catalog(origin: String, token: String, repair: bool) -> Result<Progress, String> {
    api(&origin, &token)?;
    let prefs = settings_bridge::load()?;
    let folder = prefs.cs16.ok_or("Choose a Counter-Strike folder first")?;
    validate_installation(&folder, "cs16").ok_or("Counter-Strike folder is invalid")?;
    if BUSY.swap(true, Ordering::SeqCst) {
        return Ok(status());
    }
    write_progress(&Progress {
        status: "syncing".into(),
        completed_files: 0,
        total_files: 0,
    });
    std::thread::spawn(move || {
        if crate::runtime::invoke(
            if repair { "repairAssets" } else { "syncAssets" },
            &origin,
            Some(&token),
            None,
        )
        .is_err()
        {
            write_progress(&Progress {
                status: "error".into(),
                completed_files: 0,
                total_files: 0,
            });
        }
        BUSY.store(false, Ordering::SeqCst);
    });
    Ok(status())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_root() -> PathBuf {
        let root = env::temp_dir().join(format!("16c-shared-assets-{}", uuid::Uuid::new_v4()));
        fs::create_dir(&root).unwrap();
        root
    }

    fn shared_root(root: &Path) -> PathBuf {
        let shared = root.join("config/16competitive-client/game-assets/models/16competitive");
        fs::create_dir_all(&shared).unwrap();
        shared
    }

    #[cfg(unix)]
    fn link_directory(target: &Path, link: &Path) {
        std::os::unix::fs::symlink(target, link).unwrap();
    }

    #[cfg(windows)]
    fn link_directory(target: &Path, link: &Path) {
        // A junction exercises the actual Windows launcher layout without
        // requiring Developer Mode or the symbolic-link privilege. The script
        // is constant and paths are separate -File parameters, never code.
        let script = link.parent().unwrap().join(format!("junction-{}.ps1", uuid::Uuid::new_v4()));
        fs::write(&script, "param([string]$Link, [string]$Target)\n$ErrorActionPreference = 'Stop'\nNew-Item -ItemType Junction -Path $Link -Target $Target | Out-Null\n").unwrap();
        let result = hidden_command("powershell.exe")
            .args(["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File"])
            .arg(&script).arg("-Link").arg(link).arg("-Target").arg(target)
            .output().unwrap();
        fs::remove_file(script).unwrap();
        assert!(result.status.success(), "{}", String::from_utf8_lossy(&result.stderr));
    }

    #[test]
    fn ordinary_game_directories_do_not_require_desktop_storage() {
        let root = test_root();
        let path = game_destination_under(&root, "models/16competitive/knife/v.mdl", &|| {
            panic!("ordinary installation must not require desktop storage")
        }).unwrap();
        assert_eq!(path, root.canonicalize().unwrap().join("models/16competitive/knife/v.mdl"));
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn approved_model_links_use_physical_storage_for_both_game_versions() {
        let root = test_root();
        let shared = shared_root(&root);
        let path = "models/16competitive/knife/v.mdl";
        let mut bytes = vec![0; 16];
        bytes[..4].copy_from_slice(b"IDST");
        bytes[4..8].copy_from_slice(&10i32.to_le_bytes());
        let hash = format!("{:x}", Sha256::digest(&bytes));
        let asset = Asset { path: path.into(), sha256: Some(hash.clone()) };
        for game in ["cstrike", "cstrk13"] {
            let game = root.join(game);
            fs::create_dir_all(game.join("models")).unwrap();
            link_directory(&shared, &game.join("models/16competitive"));
            let target = game_destination_under(&game, path, &|| Ok(root.join("config"))).unwrap();
            assert_eq!(target, shared.canonicalize().unwrap().join("knife/v.mdl"));
            fs::write(&target, &bytes).unwrap();
            assert!(matches(&target, &asset, &hash));
            assert!(!matches(&target, &asset, &"a".repeat(64)));
            assert!(linked(&fs::symlink_metadata(game.join("models/16competitive")).unwrap()));
            // Unlink only the test link before removing its fixture tree.
            #[cfg(windows)] fs::remove_dir(game.join("models/16competitive")).unwrap();
            #[cfg(unix)] fs::remove_file(game.join("models/16competitive")).unwrap();
        }
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn unexpected_namespace_links_are_not_redirected_or_replaced() {
        let root = test_root();
        let shared = shared_root(&root);
        let game = root.join("game");
        let outside = root.join("outside");
        fs::create_dir_all(game.join("models")).unwrap();
        fs::create_dir(&outside).unwrap();
        fs::write(outside.join("untouched.mdl"), b"player bytes").unwrap();
        link_directory(&outside, &game.join("models/16competitive"));
        assert!(game_destination_under(&game, "models/16competitive/knife/v.mdl", &|| Ok(root.join("config"))).is_err());
        assert_eq!(fs::read(outside.join("untouched.mdl")).unwrap(), b"player bytes");
        assert!(!shared.join("knife").exists());
        #[cfg(windows)] fs::remove_dir(game.join("models/16competitive")).unwrap();
        #[cfg(unix)] fs::remove_file(game.join("models/16competitive")).unwrap();
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn approved_namespace_does_not_approve_nested_or_parent_links() {
        let root = test_root();
        let shared = shared_root(&root);
        let game = root.join("game");
        let outside = root.join("outside");
        fs::create_dir_all(game.join("models")).unwrap();
        fs::create_dir(&outside).unwrap();
        link_directory(&shared, &game.join("models/16competitive"));
        link_directory(&outside, &shared.join("nested"));
        assert!(game_destination_under(&game, "models/16competitive/nested/v.mdl", &|| Ok(root.join("config"))).is_err());
        assert!(game_destination_under(&game, "models/16competitive/../escaped.mdl", &|| Ok(root.join("config"))).is_err());
        #[cfg(windows)] {
            fs::remove_dir(game.join("models/16competitive")).unwrap();
            fs::remove_dir(shared.join("nested")).unwrap();
        }
        #[cfg(unix)] {
            fs::remove_file(game.join("models/16competitive")).unwrap();
            fs::remove_file(shared.join("nested")).unwrap();
        }
        fs::remove_dir(game.join("models")).unwrap();
        link_directory(&outside, &game.join("models"));
        assert!(game_destination_under(&game, "models/16competitive/knife/v.mdl", &|| Ok(root.join("config"))).is_err());
        #[cfg(windows)] fs::remove_dir(game.join("models")).unwrap();
        #[cfg(unix)] fs::remove_file(game.join("models")).unwrap();
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn rejects_redirected_shared_storage_and_other_asset_namespaces() {
        let root = test_root();
        let shared = shared_root(&root);
        let game = root.join("game");
        fs::create_dir_all(game.join("models")).unwrap();
        fs::create_dir_all(game.join("sound")).unwrap();
        link_directory(&shared, &game.join("models/16competitive"));
        link_directory(&shared, &game.join("sound/16competitive"));
        assert!(game_destination_under(&game, "sound/16competitive/ping/ping.wav", &|| Ok(root.join("config"))).is_err());
        // Even if the game link ultimately resolves there, a redirected parent
        // inside the approved desktop cache must not authorize arbitrary storage.
        let user_data = root.join("config/16competitive-client");
        let renamed = root.join("config/redirected");
        fs::rename(&user_data, &renamed).unwrap();
        link_directory(&renamed, &user_data);
        assert!(game_destination_under(&game, "models/16competitive/knife/v.mdl", &|| Ok(root.join("config"))).is_err());
        #[cfg(windows)] {
            fs::remove_dir(game.join("models/16competitive")).unwrap();
            fs::remove_dir(game.join("sound/16competitive")).unwrap();
            fs::remove_dir(user_data).unwrap();
        }
        #[cfg(unix)] {
            fs::remove_file(game.join("models/16competitive")).unwrap();
            fs::remove_file(game.join("sound/16competitive")).unwrap();
            fs::remove_file(user_data).unwrap();
        }
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn rejects_unmanaged_paths_and_inconsistent_hashes() {
        for path in [
            "../config.cfg",
            "config.cfg",
            "models/v_ak47.mdl",
            "models/16competitive/a/../b.mdl",
            "models/16competitive/a//x.mdl",
        ] {
            assert!(hash_for(
                &Asset {
                    path: path.into(),
                    sha256: Some("a".repeat(64))
                },
                true
            )
            .is_err());
        }
        let valid = Asset {
            path: format!("models/16competitive/knife/{}/v.mdl", "a".repeat(16)),
            sha256: Some("a".repeat(64)),
        };
        assert!(hash_for(&valid, false).is_ok());
        assert!(hash_for(
            &Asset {
                sha256: Some("b".repeat(64)),
                ..valid
            },
            false
        )
        .is_err());
    }
    #[cfg(unix)]
    #[test]
    fn never_follows_game_directory_symlinks() {
        let root = env::temp_dir().join(format!("16c-assets-{}", uuid::Uuid::new_v4()));
        fs::create_dir(&root).unwrap();
        std::os::unix::fs::symlink(env::temp_dir(), root.join("models")).unwrap();
        assert!(destination(&root, "models/16competitive/a.mdl").is_err());
        fs::remove_dir_all(root).unwrap();
    }
}
