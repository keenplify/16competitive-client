//! Resolve only the compatibility tool explicitly selected for Steam app 10.
//! Never read the player's game configuration or guess a different Proton build.
#![cfg(any(target_os = "linux", test))]
use std::{
    collections::BTreeMap,
    fs,
    io::Read,
    path::{Path, PathBuf},
};

/// GoldSrc's CEF uses GTK2. SDL's Wayland decorations can load GTK3 into
/// the same process and crash CEF in gdk_display_open. Use XWayland/X11
/// for the native game only; do not alter the desktop or Proton environment.
#[cfg(target_os = "linux")]
pub fn configure_native_display(command: &mut std::process::Command) {
    command.env("SDL_VIDEODRIVER", "x11").env("GDK_BACKEND", "x11");
}

/// Ask Steam's runtime to select pinned/host/fallback libraries in its own
/// order. Prepending all bundled libraries can break the host Mesa driver.
#[cfg(target_os = "linux")]
pub fn native_library_path(game: &Path, home: &Path) -> Result<std::ffi::OsString, String> {
    use std::{
        process::{Command, Stdio},
        time::{Duration, Instant},
    };
    let mut paths = vec![game.to_path_buf()];
    if let Some(existing) = std::env::var_os("LD_LIBRARY_PATH") {
        paths.extend(std::env::split_paths(&existing));
    }
    let fallback = std::env::join_paths(paths).map_err(|_| "Invalid game library path")?;
    let runtime = native_runtime(game, home);
    let Some(runtime) = runtime else {
        return Ok(fallback);
    };
    let mut child = Command::new(runtime)
        .arg("--print-steam-runtime-library-paths")
        .env("LD_LIBRARY_PATH", &fallback)
        .env_remove("LD_PRELOAD")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|_| "Steam runtime initialization failed")?;
    let output = child
        .stdout
        .take()
        .ok_or("Steam runtime output unavailable")?;
    let (tx, rx) = std::sync::mpsc::sync_channel(1);
    std::thread::spawn(move || {
        let mut bytes = Vec::new();
        let result = output.take(65537).read_to_end(&mut bytes).map(|_| bytes);
        let _ = tx.send(result);
    });
    let deadline = Instant::now() + Duration::from_secs(10);
    loop {
        if let Some(status) = child
            .try_wait()
            .map_err(|_| "Steam runtime status unavailable")?
        {
            if !status.success() {
                return Err("Steam runtime initialization failed".into());
            }
            break;
        }
        if Instant::now() >= deadline {
            let _ = child.kill();
            let _ = child.wait();
            return Err("Steam runtime initialization timed out".into());
        }
        std::thread::sleep(Duration::from_millis(25));
    }
    let bytes = rx
        .recv_timeout(Duration::from_secs(1))
        .map_err(|_| "Steam runtime output timed out")?
        .map_err(|_| "Steam runtime output unavailable")?;
    if bytes.len() > 65536 {
        return Err("Steam runtime output too large".into());
    }
    let value = String::from_utf8(bytes).map_err(|_| "Invalid Steam runtime paths")?;
    let value = value.trim_end_matches('\n');
    if value.is_empty()
        || value.contains(['\0', '\r', '\n'])
        || std::env::split_paths(value).any(|path| !path.is_absolute())
    {
        return Err("Invalid Steam runtime paths".into());
    }
    Ok(value.into())
}

#[cfg(target_os = "linux")]
fn native_runtime(game: &Path, home: &Path) -> Option<std::path::PathBuf> {
    let roots = [home.join(".steam/steam"), home.join(".local/share/Steam")];
    let mut libraries = roots.to_vec();
    if let Some(library) = game.ancestors().take(8)
        .find(|p| p.file_name().is_some_and(|name| name == "steamapps"))
        .and_then(Path::parent) {
        libraries.push(library.to_owned());
    }
    for root in &roots {
        if let Value::Object(folders) = metadata(&root.join("steamapps/libraryfolders.vdf")).get("libraryfolders") {
            for value in folders.values() {
                if let Some(path) = value.text().or_else(|| value.get("path").text()) {
                    if Path::new(path).is_absolute() && !path.contains(['\0', '\r', '\n']) {
                        libraries.push(path.into());
                    }
                }
            }
        }
    }
    libraries.into_iter().map(|root| root.join("steamapps/common/LegacySteamRuntime/run.sh"))
        .chain(roots.into_iter().map(|root| root.join("ubuntu12_32/steam-runtime/run.sh")))
        .find(|path| {
            // SteamRT3 replaces the old run.sh symlink with a command passthrough.
            // It cannot answer --print-steam-runtime-library-paths. Treat it as
            // an absent runtime, retaining the existing host-library fallback.
            path.is_file() && fs::canonicalize(path).is_ok_and(|target| {
                target.file_name().is_none_or(|name| name != "legacy-run-stub.sh")
            })
        })
}
#[derive(Debug, Clone)]
pub struct Runtime {
    pub proton: PathBuf,
    pub steam: PathBuf,
    pub data: PathBuf,
}
#[derive(Debug)]
enum Value {
    Text(String),
    Object(BTreeMap<String, Value>),
}
impl Value {
    fn get(&self, key: &str) -> &Self {
        static EMPTY: Value = Value::Text(String::new());
        match self {
            Self::Object(map) => map.get(key).unwrap_or(&EMPTY),
            _ => &EMPTY,
        }
    }
    fn text(&self) -> Option<&str> {
        match self {
            Self::Text(s) => Some(s),
            _ => None,
        }
    }
}
fn parse(source: &str) -> Result<Value, String> {
    if source.len() > 2 * 1024 * 1024 {
        return Err("Steam metadata too large".into());
    }
    let mut chars = source.chars().peekable();
    let mut tokens = Vec::new();
    while let Some(c) = chars.next() {
        if c.is_whitespace() {
            continue;
        }
        if c == '/' && chars.peek() == Some(&'/') {
            for c in chars.by_ref() {
                if c == '\n' {
                    break;
                }
            }
            continue;
        }
        let mut token = String::new();
        if c == '"' {
            let mut closed = false;
            while let Some(c) = chars.next() {
                if c == '"' {
                    closed = true;
                    break;
                }
                if c == '\\' && chars.peek().is_some_and(|c| *c == '"' || *c == '\\') {
                    token.push(chars.next().unwrap());
                } else {
                    token.push(c);
                }
            }
            if !closed {
                return Err("Truncated Steam metadata".into());
            }
        } else if c == '{' || c == '}' {
            token.push(c);
        } else {
            token.push(c);
            while chars
                .peek()
                .is_some_and(|c| !c.is_whitespace() && *c != '{' && *c != '}')
            {
                token.push(chars.next().unwrap());
            }
        }
        tokens.push(token);
        if tokens.len() > 100_000 {
            return Err("Steam metadata too complex".into());
        }
    }
    fn block(tokens: &[String], index: &mut usize, depth: usize) -> Result<Value, String> {
        if depth > 32 {
            return Err("Steam metadata too deep".into());
        }
        let mut map = BTreeMap::new();
        while *index < tokens.len() {
            let key = &tokens[*index];
            *index += 1;
            if key == "}" {
                return if depth == 0 {
                    Err("Invalid Steam metadata".into())
                } else {
                    Ok(Value::Object(map))
                };
            }
            if key == "{" || *index == tokens.len() {
                return Err("Invalid Steam metadata".into());
            }
            let token = &tokens[*index];
            *index += 1;
            let value = if token == "{" {
                block(tokens, index, depth + 1)?
            } else if token == "}" {
                return Err("Invalid Steam metadata".into());
            } else {
                Value::Text(token.clone())
            };
            if map.insert(key.to_lowercase(), value).is_some() {
                return Err("Ambiguous Steam metadata".into());
            }
        }
        if depth > 0 {
            return Err("Truncated Steam metadata".into());
        }
        Ok(Value::Object(map))
    }
    block(&tokens, &mut 0, 0)
}
fn read(path: &Path, limit: u64) -> Option<String> {
    let mut text = String::new();
    fs::File::open(path)
        .ok()?
        .take(limit + 1)
        .read_to_string(&mut text)
        .ok()?;
    (text.len() as u64 <= limit).then_some(text)
}
fn metadata(path: &Path) -> Value {
    read(path, 2 * 1024 * 1024)
        .and_then(|s| parse(&s).ok())
        .unwrap_or(Value::Object(BTreeMap::new()))
}
fn directories(root: &Path, limit: usize) -> Vec<PathBuf> {
    let mut paths: Vec<_> = fs::read_dir(root)
        .into_iter()
        .flatten()
        .take(limit)
        .filter_map(Result::ok)
        .filter(|entry| entry.file_type().is_ok_and(|t| t.is_dir()))
        .map(|e| e.path())
        .collect();
    paths.sort();
    paths
}
pub fn resolve(game: &Path, home: &Path) -> Result<Option<Runtime>, String> {
    let Some(apps) = game
        .ancestors()
        .take(8)
        .find(|p| p.file_name().is_some_and(|n| n == "steamapps"))
    else {
        return Ok(None);
    };
    let library = apps.parent().ok_or("Invalid Steam library")?;
    let mut roots = vec![
        home.join(".steam/steam"),
        home.join(".local/share/Steam"),
        library.into(),
    ];
    for root in &mut roots {
        if let Ok(path) = fs::canonicalize(&root) {
            *root = path;
        }
    }
    roots.dedup();
    for root in roots {
        let config = metadata(&root.join("config/config.vdf"));
        let name = config
            .get("installconfigstore")
            .get("software")
            .get("valve")
            .get("steam")
            .get("compattoolmapping")
            .get("10")
            .get("name")
            .text()
            .unwrap_or("");
        if name.is_empty() || name.to_lowercase().starts_with("steamlinuxruntime") {
            continue;
        }
        let mut libraries = vec![library.to_path_buf(), root.clone()];
        if let Value::Object(folders) =
            metadata(&root.join("steamapps/libraryfolders.vdf")).get("libraryfolders")
        {
            for value in folders.values() {
                if let Some(path) = value.text().or_else(|| value.get("path").text()) {
                    if Path::new(path).is_absolute() && !path.contains(['\0', '\r', '\n']) {
                        libraries.push(path.into());
                    }
                }
            }
        }
        let mut candidates = Vec::new();
        for library in libraries {
            for folder in directories(&library.join("steamapps/common"), 256) {
                let label = folder.file_name().unwrap().to_string_lossy().to_lowercase();
                if !label.starts_with("proton") {
                    continue;
                }
                let version = read(&folder.join("version"), 65536).unwrap_or_default();
                let matches = if let Some(number) = name
                    .strip_prefix("proton_")
                    .filter(|v| !v.is_empty() && v.bytes().all(|c| c.is_ascii_digit()))
                {
                    version.contains(&format!("proton-{number}."))
                } else {
                    name == "proton_experimental" && label.contains("experimental")
                        || name == "proton_hotfix" && label.contains("hotfix")
                };
                if matches {
                    candidates.push(folder.join("proton"));
                }
            }
        }
        for tools in [
            root.join("compatibilitytools.d"),
            home.join(".steam/root/compatibilitytools.d"),
        ] {
            for folder in directories(&tools, 128) {
                let config = metadata(&folder.join("compatibilitytool.vdf"));
                let tool = config
                    .get("compatibilitytools")
                    .get("compat_tools")
                    .get(&name.to_lowercase());
                if let Value::Object(_) = tool {
                    let install = Path::new(tool.get("install_path").text().unwrap_or("."));
                    if !install.is_absolute()
                        && !install
                            .components()
                            .any(|c| matches!(c, std::path::Component::ParentDir))
                    {
                        candidates.push(folder.join(install).join("proton"));
                    }
                }
            }
        }
        for proton in candidates {
            if !proton.is_file() {
                continue;
            }
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                if fs::metadata(&proton)
                    .map_err(|e| e.to_string())?
                    .permissions()
                    .mode()
                    & 0o111
                    == 0
                {
                    continue;
                }
            }
            return Ok(Some(Runtime {
                proton,
                steam: root,
                data: apps.join("compatdata/10"),
            }));
        }
        return Err("Steam's selected Proton runtime is not installed".into());
    }
    Ok(None)
}
#[cfg(test)]
mod tests {
    use super::*;
    #[cfg(target_os = "linux")]
    #[test]
    fn native_display_overrides_wayland_without_changing_parent() {
        let mut command = std::process::Command::new("/bin/sh");
        command.env("SDL_VIDEODRIVER", "wayland").env("GDK_BACKEND", "wayland");
        configure_native_display(&mut command);
        let output = command.args(["-c", "printf '%s:%s' \"$SDL_VIDEODRIVER\" \"$GDK_BACKEND\""])
            .output().unwrap();
        assert!(output.status.success());
        assert_eq!(output.stdout, b"x11:x11");
    }
    #[cfg(target_os = "linux")]
    #[test]
    fn native_runtime_uses_steams_library_order_without_starting_game() {
        use std::os::unix::fs::PermissionsExt;
        let home = std::env::temp_dir().join(format!("16c-runtime-{}", uuid::Uuid::new_v4()));
        let script = home.join(".local/share/Steam/ubuntu12_32/steam-runtime/run.sh");
        fs::create_dir_all(script.parent().unwrap()).unwrap();
        fs::write(&script, b"#!/bin/sh\n[ \"$1\" = --print-steam-runtime-library-paths ] || exit 2\n[ -z \"$LD_PRELOAD\" ] || exit 3\nprintf '/pinned:/host:/fallback\\n'\n").unwrap();
        fs::set_permissions(&script, fs::Permissions::from_mode(0o700)).unwrap();
        assert_eq!(
            native_library_path(Path::new("/game"), &home).unwrap(),
            "/pinned:/host:/fallback"
        );
        fs::write(&script, b"#!/bin/sh\nprintf '/safe:relative\\n'\n").unwrap();
        assert!(native_library_path(Path::new("/game"), &home).is_err());
        fs::remove_dir_all(home).unwrap();
    }

    #[test]
    #[cfg(target_os = "linux")]
    fn native_runtime_skips_steamrt3_stub_and_finds_relocated_runtime() {
        use std::os::unix::fs::{symlink, PermissionsExt};
        let home = std::env::temp_dir().join(format!("16c-runtime-{}", uuid::Uuid::new_v4()));
        let root = home.join(".local/share/Steam");
        let old = root.join("ubuntu12_32/steam-runtime/run.sh");
        let stub = root.join("ubuntu12_32/legacy-run-stub.sh");
        fs::create_dir_all(old.parent().unwrap()).unwrap();
        fs::write(&stub, b"#!/bin/sh\nexit 99\n").unwrap();
        fs::set_permissions(&stub, fs::Permissions::from_mode(0o700)).unwrap();
        symlink(&stub, &old).unwrap();
        assert!(native_runtime(Path::new("/game"), &home).is_none());
        assert!(native_library_path(Path::new("/game"), &home).is_ok());

        let library = home.join("external-library");
        fs::create_dir_all(root.join("steamapps")).unwrap();
        fs::write(root.join("steamapps/libraryfolders.vdf"), format!(
            "\"libraryfolders\" {{ \"1\" {{ \"path\" \"{}\" }} }}", library.display())).unwrap();
        let relocated = library.join("steamapps/common/LegacySteamRuntime/run.sh");
        fs::create_dir_all(relocated.parent().unwrap()).unwrap();
        fs::write(&relocated, b"#!/bin/sh\n[ \"$1\" = --print-steam-runtime-library-paths ] || exit 2\nprintf '/new-pinned:/host:/new-fallback\\n'\n").unwrap();
        fs::set_permissions(&relocated, fs::Permissions::from_mode(0o700)).unwrap();
        assert_eq!(native_runtime(Path::new("/game"), &home), Some(relocated));
        assert_eq!(native_library_path(Path::new("/game"), &home).unwrap(), "/new-pinned:/host:/new-fallback");
        fs::remove_dir_all(home).unwrap();
    }

    #[test]
    fn resolves_the_selected_official_and_custom_proton_only() {
        let home = std::env::temp_dir().join(format!("16c-proton-{}", uuid::Uuid::new_v4()));
        let steam = home.join(".local/share/Steam");
        let game = steam.join("steamapps/common/Half-Life");
        fs::create_dir_all(&game).unwrap();
        fs::create_dir_all(steam.join("config")).unwrap();
        let select = |name: &str| {
            fs::write(steam.join("config/config.vdf"), format!(r#""InstallConfigStore" {{ "Software" {{ "Valve" {{ "Steam" {{ "CompatToolMapping" {{ "10" {{ "name" "{name}" }} }} }} }} }} }}"#)).unwrap();
        };
        let executable = |path: &Path| {
            fs::create_dir_all(path.parent().unwrap()).unwrap();
            fs::write(path, "fixture only").unwrap();
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                fs::set_permissions(path, fs::Permissions::from_mode(0o700)).unwrap();
            }
        };
        let official = steam.join("steamapps/common/Proton 10.0/proton");
        executable(&official);
        fs::write(
            official.parent().unwrap().join("version"),
            "123 proton-10.0-3",
        )
        .unwrap();
        select("proton_10");
        let runtime = resolve(&game, &home).unwrap().unwrap();
        assert_eq!(runtime.proton, official);
        assert_eq!(runtime.data, steam.join("steamapps/compatdata/10"));
        let custom = steam.join("compatibilitytools.d/GE-Proton/files/proton");
        executable(&custom);
        fs::write(
            steam.join("compatibilitytools.d/GE-Proton/compatibilitytool.vdf"),
            r#""compatibilitytools" { "compat_tools" { "GE-Proton" { "install_path" "files" } } }"#,
        )
        .unwrap();
        select("GE-Proton");
        assert_eq!(
            fs::canonicalize(resolve(&game, &home).unwrap().unwrap().proton).unwrap(),
            fs::canonicalize(custom).unwrap()
        );
        select("proton_9");
        assert!(resolve(&game, &home).is_err());
        fs::remove_dir_all(home).unwrap();
    }
    #[test]
    fn parser_bounds_and_quoted_paths() {
        assert_eq!(
            parse(r#""Root" { "Name" "a b" }"#)
                .unwrap()
                .get("root")
                .get("name")
                .text(),
            Some("a b")
        );
        for invalid in [
            "}",
            "key {",
            "key",
            "key }",
            "\"unterminated",
            "key a KEY b",
        ] {
            assert!(parse(invalid).is_err());
        }
        assert!(parse(&"a {".repeat(34)).is_err());
    }
    #[test]
    fn global_default_does_not_force_proton_and_missing_selected_runtime_fails() {
        let home = std::env::temp_dir().join(format!("16c-proton-{}", uuid::Uuid::new_v4()));
        let steam = home.join(".local/share/Steam");
        fs::create_dir_all(steam.join("config")).unwrap();
        let game = steam.join("steamapps/common/Half-Life");
        fs::create_dir_all(&game).unwrap();
        let config = |id: &str| {
            format!(
                r#""InstallConfigStore" {{ "Software" {{ "Valve" {{ "Steam" {{ "CompatToolMapping" {{ "{id}" {{ "name" "proton_10" }} }} }} }} }} }}"#
            )
        };
        fs::write(steam.join("config/config.vdf"), config("0")).unwrap();
        assert!(resolve(&game, &home).unwrap().is_none());
        fs::write(steam.join("config/config.vdf"), config("10")).unwrap();
        assert!(resolve(&game, &home).is_err());
        fs::remove_dir_all(home).unwrap();
    }
}
