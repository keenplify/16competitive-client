#![cfg_attr(windows, windows_subsystem = "windows")]

use competitive16_web_helper::{parse_check_link, parse_launch_link, Connection, SessionResponse};
mod assets;
mod native_bundle;
mod native_session;
mod presence;
mod runtime;
mod self_update;
mod settings_bridge;
mod tray;
#[cfg(windows)]
mod windows_native;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    env,
    fs::{self, OpenOptions},
    io::Write,
    path::{Path, PathBuf},
    process::{Command, Stdio},
    time::Duration,
};

#[derive(Default, Deserialize, Serialize)]
struct Preferences {
    cs13: Option<PathBuf>,
    cs16: Option<PathBuf>,
    #[serde(default)]
    settings: settings_bridge::NativePreferences,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GamePattern {
    windows_executable: String,
    next_client_executable: Option<String>,
    next_client_managed_flag: Option<String>,
    gold_client_managed_flag: Option<String>,
    standalone_steam_emulator_marker: Option<String>,
    standalone_steam_flag: Option<String>,
    standalone_windows_flags: Option<Vec<String>>,
    linux_executable: String,
    mod_directories: Vec<String>,
    password_argument: String,
    connect_argument: String,
    windows_flags: Option<Vec<String>>,
    auth_file_prefix: Option<String>,
    auth_command: Option<String>,
    join_info_prefix: Option<String>,
    startup_wait_frames: Option<usize>,
    startup_config_prefix: Option<String>,
    managed_native_flag: Option<String>,
}

#[derive(Deserialize)]
struct LaunchPattern {
    schema: u8,
    cs13: GamePattern,
    cs16: GamePattern,
}

fn launch_pattern() -> LaunchPattern {
    let pattern: LaunchPattern = serde_json::from_str(include_str!(
        "../../src/shared/web-game-launch-pattern.json"
    ))
    .expect("shared launch pattern is invalid");
    assert_eq!(pattern.schema, 1, "unsupported shared launch pattern");
    pattern
}

fn cs16_standalone_windows_args(root: &Path, pattern: &GamePattern) -> Result<Vec<String>, String> {
    let marker = pattern
        .standalone_steam_emulator_marker
        .as_deref()
        .ok_or("Missing CS 1.6 Steam emulator marker")?;
    let mut args = Vec::new();
    if root.join(marker).is_file() {
        args.push(
            pattern
                .standalone_steam_flag
                .clone()
                .ok_or("Missing CS 1.6 Steam emulator flag")?,
        );
    }
    args.extend(["-game".to_owned(), "cstrike".to_owned()]);
    args.extend(
        pattern
            .standalone_windows_flags
            .as_ref()
            .ok_or("Missing CS 1.6 standalone flags")?
            .iter()
            .cloned(),
    );
    Ok(args)
}

fn helper_fingerprint() -> String {
    let mut digest = Sha256::new();
    for source in [
        include_bytes!("main.rs").as_slice(),
        include_bytes!("lib.rs").as_slice(),
        include_bytes!("settings_bridge.rs").as_slice(),
        include_bytes!("self_update.rs").as_slice(),
        include_bytes!("tray.rs").as_slice(),
        include_bytes!("presence.rs").as_slice(),
        include_bytes!("runtime.rs").as_slice(),
        include_bytes!("assets.rs").as_slice(),
        include_bytes!("native_bundle.rs").as_slice(),
        include_bytes!("native_session.rs").as_slice(),
        include_bytes!("windows_native.rs").as_slice(),
        include_bytes!("../Cargo.toml").as_slice(),
        include_bytes!("../Cargo.lock").as_slice(),
        include_bytes!("../../src/shared/web-game-launch-pattern.json").as_slice(),
        include_bytes!("../../src/shared/windows-client-exports.json").as_slice(),
        include_bytes!("../../src/shared/windows-goldclient-exports.json").as_slice(),
        include_bytes!("../../helper-release.json").as_slice(),
        include_bytes!("../../src/shared/discord-application.json").as_slice(),
    ] {
        digest.update(source);
    }
    format!("{:x}", digest.finalize())
}

fn user_config_dir() -> Result<PathBuf, String> {
    #[cfg(windows)]
    {
        Ok(
            PathBuf::from(env::var_os("LOCALAPPDATA").ok_or("LOCALAPPDATA is unavailable")?)
                .join("16competitive"),
        )
    }
    #[cfg(not(windows))]
    {
        Ok(env::var_os("XDG_CONFIG_HOME")
            .map(PathBuf::from)
            .unwrap_or_else(|| {
                PathBuf::from(env::var_os("HOME").unwrap_or_default()).join(".config")
            })
            .join("16competitive"))
    }
}

fn installed_path() -> Result<PathBuf, String> {
    // Immutable version directories avoid replacing a running Windows EXE.
    // Each completed setup re-registers the protocol to the current version.
    Ok(user_config_dir()?
        .join("helper-versions")
        .join(helper_fingerprint())
        .join(if cfg!(windows) {
            "competitive16-web-helper.exe"
        } else {
            "competitive16-web-helper"
        }))
}

fn install_self() -> Result<PathBuf, String> {
    let installed = installed_path()?;
    let current = env::current_exe().map_err(|e| e.to_string())?;
    if current == installed {
        return Ok(installed);
    }
    fs::create_dir_all(installed.parent().ok_or("Invalid install path")?)
        .map_err(|e| e.to_string())?;
    // A resident Windows tray holds its executable open. Re-running the same
    // download must reuse the verified identical installation, never replace it.
    let mut lock_options = OpenOptions::new();
    lock_options
        .read(true)
        .write(true)
        .create(true)
        .truncate(false);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        lock_options.mode(0o600).custom_flags(libc::O_NOFOLLOW);
    }
    let install_lock = lock_options
        .open(user_config_dir()?.join("helper-install.lock"))
        .map_err(|e| e.to_string())?;
    fs2::FileExt::lock_exclusive(&install_lock).map_err(|e| e.to_string())?;
    if installed.exists() {
        if fs::symlink_metadata(&installed)
            .map_err(|e| e.to_string())?
            .file_type()
            .is_symlink()
            || fs::read(&installed).map_err(|e| e.to_string())?
                != fs::read(&current).map_err(|e| e.to_string())?
        {
            return Err(
                "Installed helper integrity check failed. Download the helper again.".into(),
            );
        }
        return Ok(installed);
    }
    let temp = installed.with_extension("installing");
    fs::copy(current, &temp).map_err(|e| e.to_string())?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(&temp, fs::Permissions::from_mode(0o700)).map_err(|e| e.to_string())?;
    }
    fs::rename(temp, &installed).map_err(|e| e.to_string())?;
    Ok(installed)
}

#[cfg(windows)]
fn register_protocol(executable: &Path) -> Result<(), String> {
    let root = r"HKCU\Software\Classes\competitive16-helper";
    let command = format!("\"{}\" \"%1\"", executable.display());
    for args in [
        vec!["add", root, "/ve", "/d", "URL:1.6 Competitive", "/f"],
        vec!["add", root, "/v", "URL Protocol", "/d", "", "/f"],
    ] {
        if !hidden_command("reg.exe")
            .args(args)
            .output()
            .map_err(|e| e.to_string())?
            .status
            .success()
        {
            return Err("Could not register the URL protocol".into());
        }
    }
    let key = format!(r"{}\shell\open\command", root);
    if !hidden_command("reg.exe")
        .args(["add", &key, "/ve", "/d", &command, "/f"])
        .output()
        .map_err(|e| e.to_string())?
        .status
        .success()
    {
        return Err("Could not register the URL command".into());
    }
    Ok(())
}

#[cfg(not(windows))]
fn register_protocol(executable: &Path) -> Result<(), String> {
    let home = PathBuf::from(env::var_os("HOME").ok_or("HOME is unavailable")?);
    let data = env::var_os("XDG_DATA_HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|| home.join(".local/share"));
    let applications = data.join("applications");
    fs::create_dir_all(&applications).map_err(|e| e.to_string())?;
    let value = executable.to_str().ok_or("Invalid executable path")?;
    if value.contains(['\n', '\r', '"', '%']) {
        return Err("Unsupported executable path".into());
    }
    fs::write(applications.join("competitive16-web-helper.desktop"), format!(
        "[Desktop Entry]\nType=Application\nName=1.6 Competitive Web Helper\nExec=\"{}\" %u\nTerminal=false\nNoDisplay=true\nMimeType=x-scheme-handler/competitive16-helper;\n", value
    )).map_err(|e| e.to_string())?;
    // GNOME/GIO discovers protocol handlers through mimeinfo.cache. Setting
    // mimeapps.list alone leaves an unknown-scheme chooser with no applications.
    let cache = Command::new("update-desktop-database")
        .arg(&applications)
        .output()
        .map_err(|_| "Install desktop-file-utils, then run helper setup again".to_owned())?;
    if !cache.status.success() {
        return Err("Could not refresh the desktop application database".into());
    }
    let result = Command::new("xdg-mime")
        .args([
            "default",
            "competitive16-web-helper.desktop",
            "x-scheme-handler/competitive16-helper",
        ])
        .output()
        .map_err(|e| e.to_string())?;
    if !result.status.success() {
        return Err("Could not set the URL handler".into());
    }
    Ok(())
}

#[cfg(windows)]
fn notice(message: &str) {
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::UI::WindowsAndMessaging::{MessageBoxW, MB_OK};
    let wide: Vec<u16> = std::ffi::OsStr::new(message)
        .encode_wide()
        .chain(Some(0))
        .collect();
    let title: Vec<u16> = std::ffi::OsStr::new("1.6 Competitive Helper")
        .encode_wide()
        .chain(Some(0))
        .collect();
    unsafe {
        MessageBoxW(std::ptr::null_mut(), wide.as_ptr(), title.as_ptr(), MB_OK);
    }
}

#[cfg(not(windows))]
fn notice(message: &str) {
    if Command::new("zenity")
        .args([
            "--info",
            "--title=1.6 Competitive Helper",
            "--text",
            message,
        ])
        .status()
        .is_err()
    {
        eprintln!("{message}");
    }
}

#[cfg(windows)]
fn confirm(message: &str) -> bool {
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::UI::WindowsAndMessaging::{MessageBoxW, IDYES, MB_YESNO};
    let wide: Vec<u16> = std::ffi::OsStr::new(message)
        .encode_wide()
        .chain(Some(0))
        .collect();
    let title: Vec<u16> = std::ffi::OsStr::new("1.6 Competitive Helper")
        .encode_wide()
        .chain(Some(0))
        .collect();
    unsafe {
        MessageBoxW(
            std::ptr::null_mut(),
            wide.as_ptr(),
            title.as_ptr(),
            MB_YESNO,
        ) == IDYES
    }
}

#[cfg(not(windows))]
fn confirm(message: &str) -> bool {
    Command::new("zenity")
        .args([
            "--question",
            "--title=1.6 Competitive Helper",
            "--text",
            message,
        ])
        .status()
        .map(|s| s.success())
        .unwrap_or(false)
}

#[cfg(windows)]
fn hidden_command(program: &str) -> Command {
    use std::os::windows::process::CommandExt;
    let mut command = Command::new(program);
    command.creation_flags(0x08000000); // CREATE_NO_WINDOW
    command
}

#[cfg(windows)]
fn browse_folder() -> Option<PathBuf> {
    // The script is constant; no path or server value is interpolated into it.
    let script = "Add-Type -AssemblyName System.Windows.Forms; $d = New-Object System.Windows.Forms.FolderBrowserDialog; if ($d.ShowDialog() -eq 'OK') { [Console]::Write($d.SelectedPath) }";
    let output = hidden_command("powershell.exe")
        .args(["-NoProfile", "-NonInteractive", "-Command", script])
        .output()
        .ok()?;
    output
        .status
        .success()
        .then(|| PathBuf::from(String::from_utf8_lossy(&output.stdout).trim()))
        .filter(|p| !p.as_os_str().is_empty())
}

#[cfg(not(windows))]
fn browse_folder() -> Option<PathBuf> {
    let output = Command::new("zenity")
        .args([
            "--file-selection",
            "--directory",
            "--title=Choose Counter-Strike folder",
        ])
        .output()
        .ok()?;
    output
        .status
        .success()
        .then(|| PathBuf::from(String::from_utf8_lossy(&output.stdout).trim()))
        .filter(|p| !p.as_os_str().is_empty())
}

fn version_is_13(path: &Path) -> bool {
    let source = fs::read_to_string(path).unwrap_or_default();
    source
        .lines()
        .any(|line| line.trim().eq_ignore_ascii_case("version \"1.3\""))
}

fn validate_installation(folder: &Path, game: &str) -> Option<(PathBuf, PathBuf, String)> {
    let pattern = launch_pattern();
    let game_pattern = if game == "cs13" {
        &pattern.cs13
    } else {
        &pattern.cs16
    };
    let selected = fs::canonicalize(folder).ok()?;
    let selected_name = selected.file_name()?.to_string_lossy();
    let root = if ["cstrike", "cstrk13"]
        .iter()
        .any(|name| selected_name.eq_ignore_ascii_case(name))
    {
        selected.parent()?.to_path_buf()
    } else {
        selected
    };
    for mod_dir in &game_pattern.mod_directories {
        let metadata = root.join(mod_dir).join("liblist.gam");
        if !metadata.is_file() || version_is_13(&metadata) != (game == "cs13") {
            continue;
        }
        let native_linux = cfg!(target_os = "linux") && root.join("hl_linux").is_file();
        let next_client = cfg!(windows)
            && game == "cs16"
            && root.join("cstrike/cl_dlls/client_mini.dll").is_file()
            && root.join("nitro_api2.dll").is_file()
            && game_pattern
                .next_client_executable
                .as_ref()
                .is_some_and(|name| root.join(name).is_file());
        let executable = if native_linux {
            &game_pattern.linux_executable
        } else if next_client {
            game_pattern.next_client_executable.as_ref().unwrap()
        } else {
            &game_pattern.windows_executable
        };
        let exe = root.join(executable);
        let client = root.join(mod_dir).join("cl_dlls").join(if native_linux {
            "client.so"
        } else {
            "client.dll"
        });
        if exe.is_file() && client.is_file() {
            return Some((root, exe, mod_dir.to_owned()));
        }
    }
    None
}

fn discover(game: &str) -> Vec<PathBuf> {
    let roots: Vec<PathBuf> = if cfg!(windows) {
        (b'A'..=b'Z')
            .map(|letter| PathBuf::from(format!("{}:\\", letter as char)))
            .collect()
    } else {
        vec![
            PathBuf::from(env::var_os("HOME").unwrap_or_default()),
            PathBuf::from("/opt"),
            PathBuf::from("/mnt"),
            PathBuf::from("/media"),
        ]
    };
    let mut found = Vec::new();
    for root in roots {
        if !root.is_dir() {
            continue;
        }
        let mut seeds = vec![root.clone()];
        if cfg!(windows) {
            seeds.extend(
                [
                    "Games",
                    "SteamLibrary/steamapps/common",
                    "Program Files (x86)/Steam/steamapps/common",
                    "Program Files/Steam/steamapps/common",
                ]
                .iter()
                .map(|path| root.join(path)),
            );
        } else {
            seeds.extend(
                [
                    ".steam/steam/steamapps/common",
                    ".local/share/Steam/steamapps/common",
                ]
                .iter()
                .map(|path| root.join(path)),
            );
        }
        for seed in seeds {
            if let Some((path, _, _)) = validate_installation(&seed, game) {
                if !found.contains(&path) {
                    found.push(path);
                }
            }
            let Ok(entries) = fs::read_dir(&seed) else {
                continue;
            };
            for entry in entries.flatten().take(400) {
                if entry.file_type().map(|kind| kind.is_dir()).unwrap_or(false) {
                    if let Some((path, _, _)) = validate_installation(&entry.path(), game) {
                        if !found.contains(&path) {
                            found.push(path);
                        }
                    }
                }
            }
        }
    }
    found
}

fn preference_path() -> Result<PathBuf, String> {
    Ok(user_config_dir()?.join("web-helper.json"))
}

fn choose_installation(game: &str) -> Result<(PathBuf, PathBuf, String), String> {
    let mut preferences = settings_bridge::load()?;
    let saved = if game == "cs13" {
        &preferences.cs13
    } else {
        &preferences.cs16
    };
    if let Some(found) = saved
        .as_ref()
        .and_then(|folder| validate_installation(folder, game))
    {
        return Ok(found);
    }
    let mut selected = None;
    for folder in discover(game) {
        if confirm(&format!(
            "Use this Counter-Strike {} installation?\n{}",
            &game[2..],
            folder.display()
        )) {
            selected = Some(folder);
            break;
        }
    }
    while selected.is_none() {
        if !confirm(&format!(
            "Counter-Strike {} was not selected. Choose its installation folder?",
            &game[2..]
        )) {
            return Err("Game installation is required".into());
        }
        let Some(folder) = browse_folder() else {
            return Err("Game folder selection was cancelled".into());
        };
        if validate_installation(&folder, game).is_some() {
            selected = Some(folder);
        } else {
            notice(
                "That folder is not a valid installation for the selected Counter-Strike version.",
            );
        }
    }
    let installation = validate_installation(selected.as_ref().unwrap(), game)
        .ok_or("Invalid game installation")?;
    if game == "cs13" {
        preferences.cs13 = Some(installation.0.clone());
    } else {
        preferences.cs16 = Some(installation.0.clone());
    }
    settings_bridge::save(&preferences)?;
    Ok(installation)
}

fn session(api: &str, handoff: &str) -> Result<String, String> {
    let agent = ureq::AgentBuilder::new()
        .redirects(0)
        .timeout(Duration::from_secs(10))
        .build();
    let response: SessionResponse = agent.post(&format!("{api}/auth/web-handoff/consume"))
        .send_json(serde_json::json!({ "token": handoff, "clientKind": "rust", "clientVersion": helper_fingerprint() }))
        .map_err(|_| "Setup or match handoff expired; try again from the web page".to_owned())?
        .into_json().map_err(|_| "Invalid authentication response".to_owned())?;
    if response.token.len() < 20 || response.token.len() > 2048 {
        return Err("Invalid authentication response".into());
    }
    Ok(response.token)
}

fn connection(api: &str, token: &str, match_id: &str) -> Result<Connection, String> {
    let agent = ureq::AgentBuilder::new()
        .redirects(0)
        .timeout(Duration::from_secs(10))
        .build();
    let result: Connection = agent
        .get(&format!(
            "{api}/matchmaking/matches/{match_id}/helper-connection"
        ))
        .set("Authorization", &format!("Bearer {token}"))
        .call()
        .map_err(|_| "Match connection is no longer available".to_owned())?
        .into_json()
        .map_err(|_| "Invalid match connection response".to_owned())?;
    result.validate(match_id).map_err(str::to_owned)?;
    Ok(result)
}

fn cs13_auth_file(game_dir: &Path, connection: &Connection) -> Result<(PathBuf, String), String> {
    let pattern = launch_pattern();
    let wire = format!(
        "{:x}",
        Sha256::digest(format!("cs13:{}", connection.join_token))
    )
    .chars()
    .take(32)
    .collect::<String>();
    let id = format!(
        "{:x}",
        Sha256::digest(format!("cs13file:{}", connection.password))
    )
    .chars()
    .take(16)
    .collect::<String>();
    let path = game_dir.join(format!(
        "{}{id}.cfg",
        pattern
            .cs13
            .auth_file_prefix
            .as_deref()
            .ok_or("Missing CS 1.3 auth prefix")?
    ));
    let contents = format!(
        "// 1.3 Competitive session authentication\ncmd {} {wire}\n",
        pattern
            .cs13
            .auth_command
            .as_deref()
            .ok_or("Missing CS 1.3 auth command")?
    );
    if path.exists() {
        if fs::symlink_metadata(&path)
            .map_err(|e| e.to_string())?
            .file_type()
            .is_symlink()
            || fs::read_to_string(&path).map_err(|e| e.to_string())? != contents
        {
            return Err("Unrecognized CS 1.3 session file".into());
        }
    } else {
        let mut options = OpenOptions::new();
        options.write(true).create_new(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600).custom_flags(libc::O_NOFOLLOW);
        }
        let mut file = options.open(&path).map_err(|e| e.to_string())?;
        file.write_all(contents.as_bytes())
            .map_err(|e| e.to_string())?;
        file.sync_all().map_err(|e| e.to_string())?;
    }
    Ok((path, contents))
}

fn cs16_startup_file(
    game_dir: &Path,
    connection: &Connection,
) -> Result<(PathBuf, String), String> {
    let pattern = launch_pattern();
    let id = format!("{:x}", Sha256::digest(connection.match_id.as_bytes()));
    let short_id = &id[..16];
    let prefix = pattern
        .cs16
        .startup_config_prefix
        .as_deref()
        .ok_or("Missing CS 1.6 config prefix")?;
    let key = pattern
        .cs16
        .join_info_prefix
        .as_deref()
        .ok_or("Missing CS 1.6 join prefix")?;
    let path = game_dir.join(format!("{prefix}{short_id}.cfg"));
    let identity = format!(
        "name \"{}\"\nsetinfo \"{key}{short_id}\" \"{}\"\npassword \"{}\"\n",
        connection.player_name, connection.join_token, connection.password
    );
    let waits = "wait\n".repeat(
        pattern
            .cs16
            .startup_wait_frames
            .ok_or("Missing CS 1.6 startup wait")?,
    );
    let contents = format!(
        "{identity}{waits}{identity}connect {}:{}\n",
        connection.host, connection.port
    );
    if path.exists() {
        if fs::symlink_metadata(&path)
            .map_err(|e| e.to_string())?
            .file_type()
            .is_symlink()
            || fs::read_to_string(&path).map_err(|e| e.to_string())? != contents
        {
            return Err("Unrecognized CS 1.6 session file".into());
        }
    } else {
        let mut options = OpenOptions::new();
        options.write(true).create_new(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600).custom_flags(libc::O_NOFOLLOW);
        }
        let mut file = options.open(&path).map_err(|e| e.to_string())?;
        file.write_all(contents.as_bytes())
            .map_err(|e| e.to_string())?;
        file.sync_all().map_err(|e| e.to_string())?;
    }
    Ok((path, contents))
}

fn cleanup_owned_file(file: Option<(PathBuf, String)>) -> Result<(), String> {
    if let Some((path, contents)) = file {
        if fs::read_to_string(&path).ok().as_deref() == Some(contents.as_str()) {
            fs::remove_file(path).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

fn launch_match(connection: &Connection, api: &str, token: &str) -> Result<(), String> {
    // Reuse the complete desktop game adapter, rendering and scanner lifecycle.
    // CS 1.3 retains its separate legacy adapter below.
    if connection.game() == "cs16" {
        choose_installation("cs16")?;
        runtime::launch(connection, api, token)?;
        return Ok(());
    }
    let pattern = launch_pattern();
    let game_pattern = if connection.game() == "cs13" {
        &pattern.cs13
    } else {
        &pattern.cs16
    };
    let (root, exe, mod_dir) = choose_installation(connection.game())?;
    let preferences = settings_bridge::load()?.settings;
    let windows_cs16_args = if cfg!(windows) && connection.game() == "cs16" {
        Some(cs16_standalone_windows_args(&root, game_pattern)?)
    } else {
        None
    };
    let next_client = cfg!(windows)
        && connection.game() == "cs16"
        && exe.file_name().is_some_and(|name| name == "cstrike.exe");
    let game_dir = root.join(&mod_dir);
    assets::prepare_match(&game_dir, connection, api, token)?;
    let mut native: Option<(native_bundle::NativeBundle, native_session::NativeSession)> = None;
    #[cfg(target_os = "linux")]
    if connection.game() == "cs16" && exe.file_name().is_some_and(|name| name == "hl_linux") {
        match native_bundle::prepare(&user_config_dir()?).and_then(|bundle| {
            native_session::NativeSession::start(&user_config_dir()?, connection, api, token, &preferences)
                .map(|session| (bundle, session))
        }) {
            Ok((bundle, session)) => native = Some((bundle, session)),
            Err(error) => notice(&format!("In-game enhancements are unavailable: {error}\nThe match will open with the stock game HUD.")),
        }
    }
    #[cfg(windows)]
    let mut windows_install: Option<windows_native::WindowsInstall> = None;
    #[cfg(windows)]
    let gold_client =
        connection.game() == "cs16" && !next_client && windows_native::is_gold_client(&root)?;
    #[cfg(windows)]
    if connection.game() == "cs16" && mod_dir == "cstrike" {
        match native_bundle::prepare(&user_config_dir()?) {
            Ok(bundle) => {
                windows_native::validate_root(&root)?;
                windows_native::restore_previous(&root, &bundle)?;
                let session = native_session::NativeSession::start_at(
                    root.join("16competitive/live-session"),
                    connection,
                    api,
                    token,
                    &preferences,
                )?;
                match windows_native::WindowsInstall::install(&root, &bundle) {
                    Ok(Some(installation)) => {
                        windows_install = Some(installation);
                        native = Some((bundle, session));
                    }
                    Ok(None) => {
                        let mut session = session;
                        session.stop();
                        session.cleanup()?;
                    }
                    Err(error) => {
                        let mut session = session;
                        session.stop();
                        if !root.join("16competitive/recovery.json").exists()
                            && !root.join("16competitive/cosmetic-install.json").exists()
                        {
                            session.cleanup()?;
                        }
                        return Err(error);
                    }
                }
            }
            Err(error) => {
                if root.join("16competitive/recovery.json").exists()
                    || root.join("16competitive/cosmetic-install.json").exists()
                    || root.join("16competitive/nextclient-install.json").exists()
                {
                    return Err(format!(
                        "Native recovery requires the approved helper: {error}"
                    ));
                }
                if next_client {
                    return Err(format!(
                        "NextClient requires the approved native helper: {error}"
                    ));
                }
                notice(&format!("In-game enhancements are unavailable: {error}\nThe match will open with the stock game HUD."));
            }
        }
    }
    #[cfg(windows)]
    if next_client {
        let session = native
            .as_ref()
            .ok_or("NextClient native match handoff is unavailable")?;
        let key = format!(
            "{}{}",
            game_pattern
                .join_info_prefix
                .as_deref()
                .ok_or("Missing CS 1.6 join prefix")?,
            &format!("{:x}", Sha256::digest(connection.match_id.as_bytes()))[..16]
        );
        if let Err(error) = session.1.write_nextclient_handoff(connection, &key) {
            if let Some((_, mut session)) = native.take() {
                session.stop();
                if let Some(installation) = windows_install.take() {
                    installation.restore()?;
                }
                session.cleanup()?;
            }
            return Err(error);
        }
    }
    let auth = if connection.game() == "cs13" {
        Some(cs13_auth_file(&game_dir, connection)?)
    } else {
        None
    };
    let startup = if connection.game() == "cs16" && !next_client {
        match cs16_startup_file(&game_dir, connection) {
            Ok(file) => Some(file),
            Err(error) => {
                if let Some((_, mut session)) = native {
                    session.stop();
                    #[cfg(windows)]
                    if let Some(installation) = windows_install {
                        installation.restore()?;
                    }
                    session.cleanup()?;
                }
                return Err(error);
            }
        }
    } else {
        None
    };
    let mut command =
        if cfg!(target_os = "linux") && exe.extension().is_some_and(|ext| ext == "exe") {
            let mut wine = Command::new("wine");
            wine.arg(&exe);
            wine
        } else {
            Command::new(&exe)
        };
    command.current_dir(&root);
    let (width, height) = preferences.resolution(connection.game())?;
    if connection.game() == "cs13" {
        command.args(["-width", &width.to_string(), "-height", &height.to_string()]);
    } else {
        command.args(["-w", &width.to_string(), "-h", &height.to_string()]);
        command.args([
            "+hud_fastswitch",
            if preferences.fast_switch_enabled {
                "1"
            } else {
                "0"
            },
        ]);
    }
    if let Some(args) = windows_cs16_args {
        command.args(args);
    } else {
        command.arg("-game").arg(&mod_dir);
    }
    #[cfg(target_os = "linux")]
    if let Some((bundle, session)) = &native {
        command.arg(
            game_pattern
                .managed_native_flag
                .as_deref()
                .ok_or("Missing managed native flag")?,
        );
        command.env("PAPAMO_SKIN_PROBE_SESSION", &session.directory);
        command.env("LD_PRELOAD", &bundle.module);
    }
    #[cfg(windows)]
    if let Some((_, session)) = &native {
        command.arg(
            game_pattern
                .managed_native_flag
                .as_deref()
                .ok_or("Missing managed native flag")?,
        );
        command.env("PAPAMO_SKIN_PROBE_SESSION", &session.directory);
        if next_client {
            command.arg(
                game_pattern
                    .next_client_managed_flag
                    .as_deref()
                    .ok_or("Missing NextClient managed flag")?,
            );
        } else if gold_client {
            command.arg(
                game_pattern
                    .gold_client_managed_flag
                    .as_deref()
                    .ok_or("Missing GoldClient managed flag")?,
            );
        }
    }
    if connection.game() == "cs13" {
        command.args(game_pattern.windows_flags.as_deref().unwrap_or_default());
        command.args([
            &game_pattern.password_argument,
            &connection.password,
            &game_pattern.connect_argument,
            &format!("{}:{}", connection.host, connection.port),
        ]);
    } else if !next_client {
        let name = startup
            .as_ref()
            .and_then(|(path, _)| path.file_name())
            .ok_or("Missing CS 1.6 config")?;
        command.arg("+exec").arg(name);
    }
    command
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    let mut child = match command.spawn() {
        Ok(child) => child,
        Err(error) => {
            let auth_cleanup = cleanup_owned_file(auth);
            let startup_cleanup = cleanup_owned_file(startup);
            if let Some((_, mut session)) = native {
                session.stop();
                #[cfg(windows)]
                if let Some(installation) = windows_install {
                    installation.restore()?;
                }
                session.cleanup()?;
            }
            auth_cleanup?;
            startup_cleanup?;
            return Err(error.to_string());
        }
    };
    let _activity = presence::GameLease::start(
        connection,
        native
            .as_ref()
            .map(|(_, session)| session.directory.clone()),
    );
    let wait_result = child.wait();
    let auth_cleanup = cleanup_owned_file(auth);
    let startup_cleanup = cleanup_owned_file(startup);
    if let Some((_, mut session)) = native {
        session.stop();
        #[cfg(windows)]
        if let Some(installation) = windows_install {
            installation.restore()?;
        }
        session.cleanup()?;
    }
    auth_cleanup?;
    startup_cleanup?;
    wait_result.map_err(|e| e.to_string())?;
    Ok(())
}

fn run() -> Result<(), String> {
    let mut args: Vec<String> = env::args().skip(1).collect();
    if args.as_slice() == ["--tray"] {
        return tray::run();
    }
    if args.first().map(String::as_str) == Some("--local-settings") {
        if args.len() != 4 {
            return Err("Invalid local settings arguments".into());
        }
        return settings_bridge::serve(
            args[1].parse().map_err(|_| "Invalid settings port")?,
            &args[2],
            &args[3],
        );
    }
    if env::args().any(|value| value == "--fingerprint") {
        println!("{}", helper_fingerprint());
        return Ok(());
    }
    // The shell command returns immediately; all setup, dialogs and game
    // supervision happen without inheriting a terminal or its standard handles.
    if args.first().map(String::as_str) != Some("--background") {
        tray::background(
            &env::current_exe().map_err(|e| e.to_string())?,
            std::iter::once("--background".to_owned())
                .chain(args)
                .collect::<Vec<_>>(),
        )?;
        return Ok(());
    }
    args.remove(0);
    match self_update::check_and_resume(&args) {
        Ok(true) => return Ok(()),
        Ok(false) => {}
        Err(_) => eprintln!("Helper update could not be verified; keeping the installed version."),
    }
    let exe = install_self()?;
    register_protocol(&exe)?;
    tray::ensure(&exe)?;
    let arg = env::args()
        .skip(1)
        .find(|value| value.starts_with("competitive16-helper://"));
    let Some(link) = arg else {
        return Ok(());
    };
    let development = cfg!(debug_assertions);
    if let Some(check) = parse_check_link(&link, development) {
        session(&check.api_origin, &check.handoff)?;
        if let Some(local) = check.local_settings {
            let mut bridge = Command::new(&exe);
            bridge
                .args([
                    "--local-settings",
                    &local.port.to_string(),
                    &local.token,
                    &local.origin,
                ])
                .stdin(Stdio::null())
                .stdout(Stdio::null())
                .stderr(Stdio::null());
            #[cfg(windows)]
            {
                use std::os::windows::process::CommandExt;
                bridge.creation_flags(0x08000000); // CREATE_NO_WINDOW
            }
            #[cfg(unix)]
            {
                use std::os::unix::process::CommandExt;
                bridge.process_group(0);
            }
            bridge.spawn().map_err(|e| e.to_string())?;
        }
        return Ok(());
    }
    let launch = parse_launch_link(&link, development).ok_or("Invalid 1.6 Competitive link")?;
    let token = session(&launch.api_origin, &launch.handoff)?;
    let connection = connection(&launch.api_origin, &token, &launch.match_id)?;
    launch_match(&connection, &launch.api_origin, &token)
}

fn main() {
    if let Err(error) = run() {
        notice(&error);
        std::process::exit(1);
    }
}

#[cfg(test)]
mod launch_tests {
    use super::*;

    #[test]
    fn revemu_installation_uses_shared_steam_launch_flags() {
        let root = env::temp_dir().join(format!("16c-warzone-launch-{}", uuid::Uuid::new_v4()));
        fs::create_dir(&root).unwrap();
        fs::write(root.join("rev.ini"), b"[Emulator]\n").unwrap();
        let pattern = launch_pattern();
        let args = cs16_standalone_windows_args(&root, &pattern.cs16).unwrap();
        assert_eq!(
            args,
            [
                "-steam",
                "-game",
                "cstrike",
                "-noforcemparms",
                "-noforcemaccel"
            ]
        );
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn ordinary_installation_does_not_get_steam_emulation() {
        let root = env::temp_dir().join(format!("16c-plain-launch-{}", uuid::Uuid::new_v4()));
        fs::create_dir(&root).unwrap();
        let pattern = launch_pattern();
        let args = cs16_standalone_windows_args(&root, &pattern.cs16).unwrap();
        assert_eq!(args.first().map(String::as_str), Some("-game"));
        fs::remove_dir_all(root).unwrap();
    }
}
