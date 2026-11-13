#![cfg_attr(windows, windows_subsystem = "windows")]
mod cs13_installation;

use competitive16_web_helper::{parse_check_link, parse_launch_link, Connection, SessionResponse};
mod assets;
mod join_info;
mod native_bundle;
mod inspector;
mod native_voice;
mod stickers;
mod session_mode;
mod desktop_session;
#[cfg(windows)]
mod admin_restart;
mod owned_game;
#[cfg(any(windows, test))]
mod gtprotector;
#[cfg(any(windows, test))]
mod startup_bridge;
mod match_recovery;
mod steam_proton;
#[cfg(target_os = "linux")]
mod linux_emulation;
#[cfg(target_os = "linux")]
mod steam_ready;
#[cfg(target_os = "linux")]
mod linux_startup_notice;
mod compatibility;
mod partner;
mod managed_installations;
mod native_session;
mod music;
mod persistent_native;
mod native_preferences;
mod legacy_crosshair;
mod session_authorization;
mod session_cleanup;
mod launch_diagnostics;
mod notice_throttle;
mod presence;
mod runtime;
mod self_update;
mod settings_bridge;
mod compatibility_report;
mod installation_version;
mod installation_search;
mod tray;
mod branding;
mod uninstall;
#[cfg(windows)]
mod windows_native;
mod won_native;
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

// Keep in sync with vite.webapp.config.ts. Launcher package metadata is not
// a helper compatibility input: unchanged binaries are reused across releases.
fn helper_fingerprint() -> String {
    let mut digest = Sha256::new();
    for source in [
        include_bytes!("main.rs").as_slice(),
        include_bytes!("lib.rs").as_slice(),
        include_bytes!("settings_bridge.rs").as_slice(),
        include_bytes!("compatibility_report.rs").as_slice(),
        include_bytes!("self_update.rs").as_slice(),
        include_bytes!("tray.rs").as_slice(),
        include_bytes!("branding.rs").as_slice(),
        include_bytes!("../../src/shared/partner-web-origins.json").as_slice(),
        include_bytes!("../../src/renderer/public/favicon-96x96.png").as_slice(),
        include_bytes!("presence.rs").as_slice(),
        include_bytes!("runtime.rs").as_slice(),
        include_bytes!("assets.rs").as_slice(),
        include_bytes!("native_bundle.rs").as_slice(),
        include_bytes!("native_session.rs").as_slice(),
        include_bytes!("music.rs").as_slice(),
        include_bytes!("native_preferences.rs").as_slice(),
        include_bytes!("session_authorization.rs").as_slice(),
        include_bytes!("session_cleanup.rs").as_slice(),
        include_bytes!("launch_diagnostics.rs").as_slice(),
        include_bytes!("inspector.rs").as_slice(),
        include_bytes!("native_voice/mod.rs").as_slice(),
        include_bytes!("native_voice/audio.rs").as_slice(),
        include_bytes!("native_voice/peer.rs").as_slice(),
        include_bytes!("stickers.rs").as_slice(),
        include_bytes!("session_mode.rs").as_slice(),
        include_bytes!("desktop_session.rs").as_slice(),
        include_bytes!("admin_restart.rs").as_slice(),
        include_bytes!("launch-notices.json").as_slice(),
        include_bytes!("owned_game.rs").as_slice(),
        include_bytes!("cs13_installation.rs").as_slice(),
        include_bytes!("gtprotector.rs").as_slice(),
        include_bytes!("startup_bridge.rs").as_slice(),
        include_bytes!("steam_proton.rs").as_slice(),
        include_bytes!("steam_ready.rs").as_slice(),
        include_bytes!("linux_startup_notice.rs").as_slice(),
        include_bytes!("linux_emulation.rs").as_slice(),
        include_bytes!("compatibility.rs").as_slice(),
        include_bytes!("partner.rs").as_slice(),
        include_bytes!("managed_installations.rs").as_slice(),
        include_bytes!("../assets/sticker-baker.js").as_slice(),
        include_bytes!("notice_throttle.rs").as_slice(),
        include_bytes!("windows_native.rs").as_slice(),
        include_bytes!("won_native.rs").as_slice(),
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

fn installed_path(root: &Path, current: &Path) -> Result<PathBuf, String> {
    // Address installation by binary content, not source fingerprint: rebuilding
    // identical sources with a new version/toolchain can change executable bytes.
    // Immutable directories avoid replacing a running Windows EXE.
    // Each completed setup re-registers the protocol to the current version.
    Ok(root
        .join("helper-versions")
        .join(format!("{:x}", Sha256::digest(fs::read(current).map_err(|e| e.to_string())?)))
        .join(if cfg!(windows) {
            "competitive16-web-helper.exe"
        } else {
            "competitive16-web-helper"
        }))
}

fn install_self() -> Result<PathBuf, String> {
    let current = env::current_exe().map_err(|e| e.to_string())?;
    install_binary(&user_config_dir()?, &current)
}

fn install_binary(root: &Path, current: &Path) -> Result<PathBuf, String> {
    let installed = installed_path(root, current)?;
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
        .open(root.join("helper-install.lock"))
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
    let title: Vec<u16> = std::ffi::OsStr::new(&branding::text("1.6 Competitive Helper"))
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
            &format!("--title={}", branding::text("1.6 Competitive Helper")),
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
    let branded = branding::text(message);
    let message = branded.as_str();
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::UI::WindowsAndMessaging::{MessageBoxW, IDYES, MB_YESNO};
    let wide: Vec<u16> = std::ffi::OsStr::new(message)
        .encode_wide()
        .chain(Some(0))
        .collect();
    let title: Vec<u16> = std::ffi::OsStr::new(&branding::text("1.6 Competitive Helper"))
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
    let branded = branding::text(message);
    let message = branded.as_str();
    Command::new("zenity")
        .args([
            "--question",
            &format!("--title={}", branding::text("1.6 Competitive Helper")),
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
    // Keep a visible (nearly transparent) owner: a fully transparent window can
    // fail activation when the request arrives from a background helper bridge.
    let script = "Add-Type -AssemblyName System.Windows.Forms; $owner = New-Object System.Windows.Forms.Form; $owner.TopMost = $true; $owner.ShowInTaskbar = $false; $owner.FormBorderStyle = 'None'; $owner.Size = New-Object System.Drawing.Size(1, 1); $owner.StartPosition = 'CenterScreen'; $owner.Opacity = 0.01; $d = New-Object System.Windows.Forms.FolderBrowserDialog; try { $owner.Show(); $owner.BringToFront(); $owner.Activate(); if ($d.ShowDialog($owner) -eq 'OK') { [Console]::Write($d.SelectedPath) } } finally { $d.Dispose(); $owner.Dispose() }";
    let output = hidden_command("powershell.exe")
        .args(["-NoProfile", "-NonInteractive", "-STA", "-Command", script])
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
    // GTK can remember a folder on a removable drive that has since been
    // unmounted. Give the chooser an existing starting directory every time.
    let home = env::var_os("HOME")
        .map(PathBuf::from)
        .filter(|path| path.is_dir())
        .unwrap_or_else(|| PathBuf::from("/"));
    let initial = format!("{}/", home.display());
    let output = Command::new("zenity")
        .args([
            "--file-selection",
            "--directory",
            "--title=Choose Counter-Strike folder",
        ])
        .arg(format!("--filename={initial}"))
        .output()
        .ok()?;
    output
        .status
        .success()
        .then(|| PathBuf::from(String::from_utf8_lossy(&output.stdout).trim()))
        .filter(|p| !p.as_os_str().is_empty())
}

fn installation_display_path(path: &Path) -> String {
    let value = path.to_string_lossy();
    if let Some(unc) = value.strip_prefix(r"\\?\UNC\") {
        return format!(r"\\{unc}");
    }
    if let Some(drive) = value.strip_prefix(r"\\?\") {
        let bytes = drive.as_bytes();
        if bytes.len() >= 3 && bytes[0].is_ascii_alphabetic() && bytes[1..3] == *b":\\" {
            return drive.to_owned();
        }
    }
    value.into_owned()
}

fn validate_installation(folder: &Path, game: &str) -> Option<(PathBuf, PathBuf, String)> {
    validate_installation_executable(folder, game, None)
}

fn validate_installation_executable(folder: &Path, game: &str, executable_override: Option<&str>) -> Option<(PathBuf, PathBuf, String)> {
    if executable_override.is_some_and(|name| !managed_installations::valid_executable(name, false)) { return None; }
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
        if !installation_version::matches(&root, mod_dir, game) {
            continue;
        }
        let native_linux = executable_override.is_none() && cfg!(target_os = "linux") && root.join("hl_linux").is_file();
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
        let exe = root.join(executable_override.unwrap_or(executable));
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
        if let Some((root, _, _)) = installation_search::find(&folder, |candidate| validate_installation(candidate, game)) {
            selected = Some(root);
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

fn session(api: &str, handoff: &str) -> Result<session_authorization::HelperToken, String> {
    let agent = ureq::AgentBuilder::new()
        .redirects(0)
        .timeout(Duration::from_secs(10))
        .build();
    let response: SessionResponse = agent.post(&format!("{api}/auth/web-handoff/consume"))
        .send_json(serde_json::json!({ "token": handoff, "clientKind": "rust", "clientVersion": helper_fingerprint() }))
        .map_err(session_request_error)?
        .into_json().map_err(|_| "Invalid authentication response".to_owned())?;
    if response.token.len() < 20 || response.token.len() > 2048 {
        return Err("Invalid authentication response".into());
    }
    launch_diagnostics::set_owner(response.player.as_ref().map(|player| player.id.as_str()));
    session_authorization::HelperToken::new(api, response.token)
}

fn session_request_error(error: ureq::Error) -> String {
    #[cfg(target_os = "linux")]
    {
        match error {
            ureq::Error::Transport(_) => "HANDOFF_REQUEST_FAILED",
            ureq::Error::Status(status, _) if status == 429 || status >= 500 => "HANDOFF_REQUEST_FAILED",
            _ => "HANDOFF_EXPIRED",
        }.into()
    }
    #[cfg(not(target_os = "linux"))]
    {
        let _ = error;
        "Setup or match handoff expired; try again from the web page".into()
    }
}

fn connection(api: &str, token: &str, match_id: &str) -> Result<Connection, String> {
    let agent = ureq::AgentBuilder::new()
        .redirects(0)
        .timeout(Duration::from_secs(10))
        .build();
    let request = || agent
        .get(&format!(
            "{api}/matchmaking/matches/{match_id}/helper-connection"
        ))
        .set("Authorization", &format!("Bearer {token}"))
        .call();
    let response = match request() {
        Err(error) if retryable_connection_error(&error) => request(),
        result => result,
    }.map_err(|error| match error {
        ureq::Error::Status(404, _) => "MATCH_UNAVAILABLE",
        ureq::Error::Status(401 | 403, _) => "MATCH_AUTH_FAILED",
        _ => "MATCH_CONNECTION_REQUEST_FAILED",
    }.to_owned())?;
    let result: Connection = response
        .into_json()
        .map_err(|_| "MATCH_CONNECTION_RESPONSE_INVALID".to_owned())?;
    result.validate(match_id).map_err(str::to_owned)?;
    Ok(result)
}

fn retryable_connection_error(error: &ureq::Error) -> bool {
    match error {
        ureq::Error::Transport(_) => true,
        ureq::Error::Status(status, _) => *status == 429 || *status >= 500,
    }
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
    crosshair_commands: &str,
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
    let cleanup = join_info::cleanup_commands(game_dir, &format!("{key}{short_id}"))?;
    let identity = format!(
        "{cleanup}name \"{}\"\nsetinfo \"{key}{short_id}\" \"{}\"\npassword \"{}\"\n",
        connection.player_name, connection.join_token, connection.password
    );
    let waits = "wait\n".repeat(
        pattern
            .cs16
            .startup_wait_frames
            .ok_or("Missing CS 1.6 startup wait")?,
    );
    let contents = format!(
        "{identity}{waits}{identity}{crosshair_commands}connect {}:{}\n",
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
    launch_native_match(connection, api, token, &mut || Ok(()))
}

fn cs16_requires_steam(root: &Path, next_client: bool, gold_client: bool) -> bool {
    // Absence of an emulator marker is not evidence of a Steam installation.
    // Match the desktop launcher's Steam-library classification.
    !next_client && !gold_client
        && root.ancestors().take(8).any(|path| {
            path.file_name().is_some_and(|name| name.to_string_lossy().eq_ignore_ascii_case("steamapps"))
        })
        && !root.join(launch_pattern().cs16.standalone_steam_emulator_marker
            .as_deref().unwrap_or("rev.ini")).is_file()
}

fn start_steam_client() -> Result<(), String> {
    #[cfg(target_os="linux")]
    {
        let running=fs::read_dir("/proc").map_err(|_|"Could not check Steam")?.take(32768).flatten()
            .any(|entry|entry.file_name().to_string_lossy().bytes().all(|c|c.is_ascii_digit()) &&
                fs::read_to_string(entry.path().join("comm")).is_ok_and(|name|name.trim()=="steam"));
        if !running {
            linux_emulation::steam_command()?.arg("-silent").stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null())
                .spawn().map_err(|_|"Start Steam and sign in before launching Counter-Strike")?;
        }
        steam_ready::wait(desktop_session::stop_requested)?;
    }
    #[cfg(windows)]
    {
        if env::var_os("COMPETITIVE16_NATIVE_STEAM").is_some() { return Ok(()); }
        use windows_sys::Win32::UI::Shell::ShellExecuteW;
        let verb:Vec<u16>="open".encode_utf16().chain(Some(0)).collect();
        let uri:Vec<u16>="steam://open/main".encode_utf16().chain(Some(0)).collect();
        let result=unsafe{ShellExecuteW(std::ptr::null_mut(),verb.as_ptr(),uri.as_ptr(),std::ptr::null(),std::ptr::null(),0)};
        if result as usize <= 32 { return Err("Start Steam and sign in before launching Counter-Strike".into()); }
    }
    Ok(())
}

fn launch_native_match(initial: &Connection, api: &str, token: &str,
    ready: &mut dyn FnMut() -> Result<(), String>) -> Result<(), String> {
    let mut announced = false;
    let mut ready_once = || {
        if !announced { ready()?; announced = true; }
        Ok(())
    };
    let result = match_recovery::run(initial,
        |current| launch_native_match_attempt(current, api, token, &mut ready_once),
        || connection(api, token, &initial.match_id),
        desktop_session::stop_requested);
    if let Err(error) = &result {
        // Both browser and desktop sessions reach this point after attempt cleanup,
        // while their authenticated helper session is still valid.
        if let Ok(directory) = user_config_dir() {
            if launch_diagnostics::record(&directory, initial, &desktop_session::failure_snapshot(error)).is_err() {
                eprintln!("Native launch diagnostic could not be saved");
            }
        }
        launch_diagnostics::report_automatically(api, token, initial, &desktop_session::failure_snapshot(error));
    }
    result
}

fn launch_native_match_attempt(connection: &Connection, api: &str, token: &str,
    ready: &mut dyn FnMut() -> Result<(), String>) -> Result<(), String> {
    let pattern = launch_pattern();
    let game_pattern = if connection.game() == "cs13" {
        &pattern.cs13
    } else {
        &pattern.cs16
    };
    let (root, exe, mut mod_dir) = managed_installations::choose(api, token, connection.game()).map_err(|e| desktop_session::preparation_error(&e, "INSTALLATION_SELECTION_FAILED"))?;
    launch_diagnostics::set_executable(exe.file_name().and_then(|name| name.to_str()));
    // Windows uses the approved WON adapter directly for both cstrike and cstrk13.
    // Wine and older bundles still need the compatibility runtime.
    if connection.game() == "cs13" && exe.extension().is_some_and(|ext| ext.eq_ignore_ascii_case("exe"))
        && (!cfg!(windows) || !native_bundle::supports_won_scoreboard()) {
        runtime::launch(connection, api, token)?;
        return Ok(());
    }
    #[cfg(target_os = "linux")]
    if connection.game() == "cs16" {
        let home = PathBuf::from(env::var_os("HOME").ok_or("Home directory unavailable")?);
        let proton = steam_proton::resolve(&root, &home)?;
        if proton.is_some() || exe.extension().is_some_and(|extension| extension == "exe") {
            return compatibility::launch(connection, api, token, &root, proton.as_ref(), ready);
        }
    }
    if cfg!(windows) && connection.game() == "cs13" {
        mod_dir = cs13_installation::prepare(&root, &mod_dir)?;
    }
    let voice_ownership = session_mode::VoiceOwnership::start(&user_config_dir()?, &connection.match_id).map_err(|e| desktop_session::preparation_error(&e, "VOICE_OWNERSHIP_FAILED"))?;
    let _native_mode = session_mode::Lease::native_wait(&user_config_dir()?).map_err(|e| desktop_session::preparation_error(&e, "NATIVE_LEASE_FAILED"))?;
    let preferences = settings_bridge::load().map_err(|e| desktop_session::preparation_error(&e, "SETTINGS_READ_FAILED"))?.settings;
    let windows_cs16_args = if cfg!(windows) && connection.game() == "cs16" {
        Some(cs16_standalone_windows_args(&root, game_pattern).map_err(|e| desktop_session::preparation_error(&e, "LAUNCH_ARGUMENTS_FAILED"))?)
    } else {
        None
    };
    let next_client = cfg!(windows)
        && connection.game() == "cs16"
        && exe.file_name().is_some_and(|name| name.eq_ignore_ascii_case("cstrike.exe"));
    #[cfg(windows)]
    let gold_client = connection.game() == "cs16" && !next_client && windows_native::is_gold_client(&root).map_err(|e| desktop_session::preparation_error(&e, "NATIVE_CLIENT_CHECK_FAILED"))?;
    #[cfg(not(windows))]
    let gold_client = false;
    launch_diagnostics::set_install_root(&root);
    let game_dir = root.join(&mod_dir);
    #[cfg(target_os = "linux")]
    let library_paths = {
        let root = root.clone();
        let home = PathBuf::from(env::var_os("HOME").ok_or("Home directory unavailable")?);
        std::thread::spawn(move || steam_proton::native_library_path(&root, &home))
    };
    desktop_session::report_progress("checking", 0, 0);
    let scanner_bundle = native_bundle::prepare(&user_config_dir()?)
        .map_err(|e| desktop_session::preparation_error(&e, "NATIVE_BUNDLE_FAILED"))?;
    if inspector::check_device(&scanner_bundle, api).map_err(|e| desktop_session::preparation_error(&e, "DEVICE_CHECK_FAILED"))?["banned"] == true {
        return Err("This device cannot join competitive matches".into());
    }
    desktop_session::report_progress("assets", 0, 0);
    assets::prepare_match(&game_dir, connection, api, token).map_err(|_| "ASSET_PREPARATION_FAILED")?;
    desktop_session::report_progress("checking", 0, 0);
    let game_startup = if connection.game() == "cs16" {
        owned_game::Startup::prepare_replacing(&exe, &game_dir).map_err(|_| "GAME_CLOSE_FAILED")?
    } else {
        owned_game::Startup::prepare(&exe, &game_dir)?
    };
    // The standalone helper owns launching now, so retain the Electron
    // adapter's GTProtector workaround here, after the old game has stopped.
    #[cfg(windows)]
    if connection.game() == "cs16" {
        gtprotector::disable_conflicting(&root, cs16_requires_steam(&root, next_client, gold_client), next_client)
            .map_err(|_| "GTPROTECTOR_COMPATIBILITY_FAILED")?;
    }
    #[cfg(windows)]
    let mut startup_bridge = startup_bridge::Bridge::prepare(
        &game_dir,
        connection.game() == "cs16" && !next_client
            && !cs16_requires_steam(&root, next_client, gold_client),
    ).map_err(|_| "STARTUP_CONFIG_FAILED")?;
    if connection.game() == "cs16" && cs16_requires_steam(&root, next_client, gold_client) {
        #[cfg(target_os = "linux")]
        desktop_session::report_progress("starting", 0, 0);
        start_steam_client().map_err(|e| desktop_session::preparation_error(&e, "STEAM_START_FAILED"))?;
    }
    let mut scanner = inspector::Session::start(&scanner_bundle, inspector::SessionOptions {
        api,
        token,
        match_id: &connection.match_id,
        executable: &exe,
        runtime_executable: &exe,
        game_directory: &game_dir,
        // The direct legacy adapter is standalone; the native CS1.6 adapter
        // uses Steam unless the shared Windows launch pattern selects emulation.
        steam: connection.game() == "cs16" && cs16_requires_steam(&root, next_client, gold_client),
    }).map_err(|e| desktop_session::preparation_error(&e, "INSPECTOR_START_FAILED"))?;
    let mut native: Option<(native_bundle::NativeBundle, native_session::NativeSession)> = None;
    #[cfg(windows)]
    let mut windows_install: Option<windows_native::WindowsInstall> = None;
    #[cfg(windows)]
    let mut won_install: Option<won_native::WonInstall> = None;
    let mut auth = None;
    let mut startup = None;
    // Every preparation failure follows the same restoration path, including
    // validation errors after a Windows module has already been installed.
    let wait_result = (|| -> Result<(), String> {
    #[cfg(target_os = "linux")]
    if connection.game() == "cs16" && exe.file_name().is_some_and(|name| name == "hl_linux") {
        match scanner_bundle.verify_modules().and_then(|_| {
            let bundle = scanner_bundle.clone();
            native_session::NativeSession::start(&user_config_dir()?, connection, api, token, &preferences)
                .map(|session| (bundle, session))
        }) {
            Ok((bundle, session)) => native = Some((bundle, session)),
            Err(error) => return Err(desktop_session::preparation_error(&error, "NATIVE_SESSION_FAILED")),
        }
    }
    #[cfg(windows)]
    if connection.game() == "cs16" && mod_dir == "cstrike" {
        match scanner_bundle.verify_modules() {
            Ok(()) => {
                let bundle = scanner_bundle.clone();
                windows_native::validate_root(&root).map_err(|e| desktop_session::preparation_error(&e, "NATIVE_ROOT_INVALID"))?;
                windows_native::prepare_existing(&root, &bundle).map_err(|_| "NATIVE_RECOVERY_FAILED")?;
                // This version's engine passes a third Initialize argument and
                // invokes legacy connection callbacks. Keep its original DLL;
                // do not initialize cosmetic/voice workers just to tear them down.
                if !windows_native::requires_legacy_original_client(&root).map_err(|e| desktop_session::preparation_error(&e, "NATIVE_CLIENT_CHECK_FAILED"))? {
                let session = native_session::NativeSession::start_at(
                    root.join("16competitive/live-session"),
                    connection,
                    api,
                    token,
                    &preferences,
                ).map_err(|e| desktop_session::preparation_error(&e, "NATIVE_SESSION_FAILED"))?;
                match windows_native::WindowsInstall::install(&root, &bundle) {
                    Ok(Some(installation)) => {
                        windows_install = Some(installation);
                        native = Some((bundle, session));
                    }
                    Ok(None) => {
                        let mut session = session;
                        session.stop();
                        session.cleanup().map_err(|e| desktop_session::preparation_error(&e, "NATIVE_CLEANUP_FAILED"))?;
                    }
                    Err(error) => {
                        let mut session = session;
                        session.stop();
                        if !root.join("16competitive/recovery.json").exists()
                            && !root.join("16competitive/cosmetic-install.json").exists()
                        {
                            session.cleanup().map_err(|e| desktop_session::preparation_error(&e, "NATIVE_CLEANUP_FAILED"))?;
                        }
                        return Err(desktop_session::preparation_error(&error, "NATIVE_INSTALL_FAILED"));
                    }
                }
                }
            }
            Err(error) => {
                return Err(desktop_session::preparation_error(&error, "NATIVE_INTEGRITY_FAILED"));
            }
        }
    }
    #[cfg(windows)]
    if connection.game() == "cs13" {
        auth = Some(cs13_auth_file(&game_dir, connection)?);
        let installation = won_native::WonInstall::install(&root, &mod_dir, &scanner_bundle, auth.as_ref().unwrap())?;
        won_install = Some(installation);
        let session = native_session::NativeSession::start_at(root.join("16competitive/live-session"), connection, api, token, &preferences)?;
        native = Some((scanner_bundle.clone(), session));
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
            return Err(desktop_session::preparation_error(&error, "NATIVE_HANDOFF_FAILED"));
        }
    }
    if connection.game() == "cs16" && native.is_none() {
        #[cfg(windows)]
        let config_auth = !next_client && windows_native::supports_config_authenticated_launch(&root).map_err(|e| desktop_session::preparation_error(&e, "NATIVE_CLIENT_CHECK_FAILED"))?;
        #[cfg(not(windows))]
        let config_auth = false;
        if !config_auth {
            #[cfg(windows)]
            if next_client { launch_diagnostics::install_check("nextclient_without_native_session", None); }
            #[cfg(not(windows))]
            launch_diagnostics::install_check("native_session_unavailable", None);
            return Err("NATIVE_INSTALL_UNSUPPORTED".into());
        }
        // Retain the verified inspector, match token, owned startup file and
        // periodic backend authorization. Only optional native visuals stop.
        desktop_session::report_config_auth_fallback();
    }
    if connection.game() == "cs13" && auth.is_none() {
        auth = Some(cs13_auth_file(&game_dir, connection)?);
    }
    let crosshair_commands = if cfg!(windows) && native.is_none() && gold_client {
        legacy_crosshair::commands(&preferences).map_err(|e| desktop_session::preparation_error(&e, "STARTUP_CONFIG_FAILED"))?
    } else { String::new() };
    startup = if connection.game() == "cs16" && !next_client {
        Some(cs16_startup_file(&game_dir, connection, &crosshair_commands).map_err(|_| "STARTUP_CONFIG_FAILED")?)
    } else {
        None
    };
    let mut command =
        if cfg!(target_os = "linux") && exe.extension().is_some_and(|ext| ext.eq_ignore_ascii_case("exe")) {
            let mut wine = Command::new("wine");
            wine.arg(&exe);
            wine
        } else {
            Command::new(&exe)
        };
    command.current_dir(&root);
    #[cfg(target_os = "linux")]
    {
        command.env("SteamAppId", "10").env("SteamGameId", "10");
        command.env("LD_LIBRARY_PATH", library_paths.join()
            .map_err(|_| "STEAM_RUNTIME_FAILED")?
            .map_err(|_| "STEAM_RUNTIME_FAILED")?);
        if connection.game() == "cs16" {
            steam_proton::configure_native_display(&mut command);
        }
    }
    if connection.game() != "cs13" {
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
        // Native HUD and cosmetics require the OpenGL renderer.
        command.arg("-gl");
        if connection.game() == "cs16" { command.arg(game_pattern.managed_native_flag.as_deref().ok_or("Missing managed native flag")?); }
        command.env("PAPAMO_SKIN_PROBE_SESSION", &session.directory);
    }
    // The game updater also runs on authenticated launches without cosmetics.
    // Keep it from replacing files or consuming the match startup handoff.
    #[cfg(windows)]
    if connection.game() == "cs16" {
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
    let prepared_child = (|| -> Result<std::process::Child, String> {
        if let Some((_, session)) = &native {
            stickers::prepare(&game_dir, &session.directory, api, token, &connection.match_id).map_err(|error| {
                let code = desktop_session::failure_code(&error);
                if code == "PREPARATION_FAILED" { "STICKER_PREPARATION_FAILED" } else { code }
            })?;
        }
        desktop_session::report_progress("starting", 0, 0);
        game_startup.recheck().map_err(|e| desktop_session::preparation_error(&e, "GAME_STARTUP_FAILED"))?;
        command.spawn().map_err(desktop_session::game_spawn_failure)
    })();
    let mut child = prepared_child?;
    if let Some((_, session)) = native.as_mut() {
        session.start_music(&game_dir, api, token, &connection.match_id);
    }
    let _activity = presence::GameLease::start(
        connection,
        native
            .as_ref()
            .map(|(_, session)| session.directory.clone()),
    );
    let mut owned_game = None;
    let wait_result = (|| -> Result<(), String> {
        owned_game = Some(game_startup.wait().map_err(|e| desktop_session::preparation_error(&e, "GAME_STARTUP_FAILED"))?);
        #[cfg(target_os = "linux")]
        let mut startup_notice = linux_startup_notice::Watch::new();
        #[cfg(target_os = "linux")]
        startup_notice.poll(owned_game.as_ref().unwrap().pid,
            || owned_game.as_ref().unwrap().exited().is_ok_and(|exited| !exited));
        scanner.attach(owned_game.as_ref().unwrap().pid)?;
        scanner.await_attachment(Duration::from_secs(20))?;
        ready()?;
        launch_diagnostics::report_fallback(api, token, connection);
        if let Some((_, session)) = &native {
            voice_ownership.ready(&connection.match_id, &session.directory)?;
        }
        let voice = native.as_ref().map(|(_, session)| {
            native_voice::Session::start(session.directory.clone(), api.into(), token.into(),
                native_voice::Context { kind: "match".into(), id: connection.match_id.clone() })
        }).transpose()?;
        let expires = std::time::Instant::now() + Duration::from_secs(2 * 60 * 60);
        let mut next_authorization = std::time::Instant::now() + Duration::from_secs(15);
        loop {
            if owned_game.as_ref().unwrap().exited()? {
                return if owned_game.as_ref().unwrap().failed_exit(&mut child)? {
                    Err(match_recovery::REQUIRED.into())
                } else { Ok(()) };
            }
            #[cfg(target_os = "linux")]
            startup_notice.poll(owned_game.as_ref().unwrap().pid,
                || owned_game.as_ref().unwrap().exited().is_ok_and(|exited| !exited));
            if desktop_session::stop_requested() {
                owned_game.as_ref().unwrap().stop()?;
                return Ok(());
            }
            if voice.as_ref().is_some_and(|voice| voice.needs_launcher()) {
                owned_game.as_ref().unwrap().stop()?;
                return Ok(());
            }
            let now = std::time::Instant::now();
            if now >= expires {
                return Err("Managed game session expired".into());
            }
            // Sessions without the cosmetic module still require backend
            // authorization. NativeSession owns the same check when present.
            if native.is_none() && now >= next_authorization {
                next_authorization = now + Duration::from_secs(15);
                if session_authorization::check(api, token, &connection.match_id)
                    == session_authorization::Authorization::Revoked
                {
                    return Err("Managed game authorization ended".into());
                }
            }
            if native.as_ref().is_some_and(|(_, session)| session.recovery_requested()) {
                return Err(match_recovery::REQUIRED.into());
            }
            if native.as_ref().is_some_and(|(_, session)| !session.is_active()) {
                return Err("Managed game authorization ended".into());
            }
            if scanner.poll()? {
                // Only the attached PID belongs to this session. Never adopt a
                // clean standalone replacement process during recovery.
                // Do not block indefinitely on a scanner/OS disagreement.
                // The error path below terminates and waits for our child
                // before touching the native installation.
                if !owned_game.as_ref().unwrap().exited()? {
                    return Err("Inspector lost the managed game process".into());
                }
                return if owned_game.as_ref().unwrap().failed_exit(&mut child)? {
                    Err(match_recovery::REQUIRED.into())
                } else { Ok(()) };
            }
            std::thread::sleep(Duration::from_millis(100));
        }
    })();
    if wait_result.is_err() {
        if let Some(game) = &owned_game { game.stop()?; }
        let _ = child.kill();
        // Native DLL restoration must wait until the owned process releases them.
        child.wait().map_err(|_| "Could not wait for the managed game to exit")?;
    }
    wait_result
    })();
    let scanner_result = scanner.stop();
    let auth_cleanup = cleanup_owned_file(auth);
    let startup_cleanup = cleanup_owned_file(startup);
    #[cfg(windows)]
    let bridge_cleanup = startup_bridge.restore().map_err(|_| "STARTUP_CONFIG_FAILED");
    let native_cleanup = if let Some((_, mut session)) = native {
        session.stop();
        #[cfg(windows)]
        let _installation = windows_install; // DLLs persist; only session state is removed.
        session.cleanup()
    } else { Ok(()) };
    #[cfg(windows)]
    let won_cleanup = if let Some(mut installation) = won_install { installation.restore() } else { Ok(()) };
    let cleanup = [
        ("NATIVE_CLEANUP_FAILED", native_cleanup),
        ("AUTH_CLEANUP_FAILED", auth_cleanup),
        ("STARTUP_CLEANUP_FAILED", startup_cleanup),
        #[cfg(windows)]
        ("STARTUP_CLEANUP_FAILED", bridge_cleanup.map_err(str::to_owned)),
        #[cfg(windows)]
        ("NATIVE_CLEANUP_FAILED", won_cleanup),
        ("INSPECTOR_STOP_FAILED", scanner_result),
    ];
    desktop_session::record_cleanup_failures(&wait_result, &cleanup);
    // Normalize an ordinary authorization end before combining cleanup results,
    // so failed cleanup can never be converted into success or a retry.
    session_cleanup::finish(session_authorization::finish_session(wait_result), &cleanup)
}

fn run() -> Result<(), String> {
    let mut args: Vec<String> = env::args().skip(1).collect();
    #[cfg(target_os = "linux")]
    if args.as_slice() == ["--steam-readiness-probe"] {
        std::process::exit(if steam_ready::probe() { 0 } else { 1 });
    }
    if args.as_slice() == ["--supports-native-cs13"] {
        println!("{}", cfg!(windows) && native_bundle::supports_won_scoreboard());
        return Ok(());
    }
    #[cfg(windows)]
    if args.as_slice() == ["--request-admin-restart"] { return admin_restart::request(); }
    #[cfg(windows)]
    if args.first().map(String::as_str) == Some("--admin-restart") {
        return admin_restart::restart(&args[1..]);
    }
    #[cfg(windows)]
    if args.first().map(String::as_str) == Some("--admin-web-join") {
        return admin_restart::web_join(&args[1..]);
    }
    #[cfg(target_os = "linux")]
    if args.first().map(String::as_str) == Some("--muvm-match") {
        if args.len() != 2 || !linux_emulation::in_guest() {
            return Err("Invalid muvm match worker invocation".into());
        }
        // Host setup/update/protocol registration already completed. Keep the
        // tray and browser settings bridge on the host; only own the game here.
        let launch = parse_launch_link(&args[1], cfg!(debug_assertions))
            .ok_or("Invalid 1.6 Competitive link")?;
        let token = session(&launch.api_origin, &launch.handoff)?;
        let connection = connection(&launch.api_origin, &token, &launch.match_id)?;
        return launch_match(&connection, &launch.api_origin, &token);
    }
    if args.as_slice() == ["--desktop-session"] { return desktop_session::run(); }
    #[cfg(windows)]
    if args.as_slice() == ["--compatibility-session"] { return desktop_session::run_compatibility(); }
    if args.as_slice() == ["--tray"] {
        return tray::run();
    }
    if args.as_slice() == ["--uninstall"] {
        return uninstall::run(false);
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
    uninstall::register(&exe)?;
    tray::ensure(&exe)?;
    let arg = env::args()
        .skip(1)
        .find(|value| value.starts_with("competitive16-helper://"));
    let Some(link) = arg else {
        return Ok(());
    };
    let development = cfg!(debug_assertions);
    if let Some(check) = parse_check_link(&link, development) {
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
            let mut child = bridge.spawn().map_err(|e| e.to_string())?;
            let ready = settings_bridge::wait_until_ready(local.port, &local.token, &local.origin);
            if let Err(error) = ready.and_then(|_| session(&check.api_origin, &check.handoff).map(|_| ())) {
                let _ = child.kill();
                let _ = child.wait();
                return Err(error);
            }
        } else {
            session(&check.api_origin, &check.handoff)?;
        }
        return Ok(());
    }
    let launch = parse_launch_link(&link, development).ok_or("Invalid 1.6 Competitive link")?;
    #[cfg(target_os = "linux")]
    if linux_emulation::dispatch_web_match(&exe, &link)? { return Ok(()); }
    let token = session(&launch.api_origin, &launch.handoff)?;
    let connection = connection(&launch.api_origin, &token, &launch.match_id)?;
    let result = launch_match(&connection, &launch.api_origin, &token);
    #[cfg(windows)]
    if let Err(error) = &result {
        if admin_restart::web_retry_allowed(&desktop_session::failure_snapshot(error)) {
            return admin_restart::request_web_join(&launch.api_origin, &token, &launch.match_id);
        }
    }
    result
}

fn main() {
    if let Err(error) = run() {
        // The local bridge is spawned by a protocol check. Its failures are
        // reported to the web page; a native dialog on every check can spam.
        if matches!(env::args().nth(1).as_deref(), Some("--desktop-session" | "--compatibility-session" | "--request-admin-restart")) {
            desktop_session::report_failure(&error);
            // The launcher owns handoff feedback. After a committed session it
            // reopens and restores authoritative results/reconnect state.
            eprintln!("Standalone session ended: {error}");
        } else if env::args().nth(1).as_deref() == Some("--local-settings") {
            eprintln!("Local settings bridge unavailable: {error}");
        } else if error == "A native helper action is already running" {
            // A slow game launch is expected. Bound this warning across all
            // protocol invocations, keeping one dialog open at a time.
            let permit = user_config_dir().ok().and_then(|directory| {
                let now = std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .ok()?;
                notice_throttle::acquire(
                    &directory.join("runtime-busy-notice.lock"),
                    now.as_millis() as u64,
                )
                .ok()
                .flatten()
            });
            if let Some(_permit) = permit {
                notice(&error);
            }
        } else {
            if error == "GAME_SPAWN_FAILED" {
                notice(&desktop_session::failure_notice(&error, &sys_locale::get_locale().unwrap_or_default()));
            } else if matches!(error.as_str(), "VOICE_OWNERSHIP_FAILED" | "ADMIN_RESTART_CANCELLED" | "ADMIN_RESTART_FAILED") {
                notice(&desktop_session::failure_notice(&error, &sys_locale::get_locale().unwrap_or_default()));
            } else {
                notice(&error);
            }
        }
        std::process::exit(1);
    }
}

#[cfg(test)]
mod launch_tests {
    #[test]
    fn match_connection_retries_transient_http_failures_but_preserves_terminal_reasons() {
        use std::{io::{Read, Write}, net::TcpListener};
        for (statuses, expected) in [
            (vec![503, 200], None),
            (vec![503, 503], Some("MATCH_CONNECTION_REQUEST_FAILED")),
            (vec![401], Some("MATCH_AUTH_FAILED")),
            (vec![403], Some("MATCH_AUTH_FAILED")),
            (vec![404], Some("MATCH_UNAVAILABLE")),
        ] {
            let listener = TcpListener::bind("127.0.0.1:0").unwrap();
            let origin = format!("http://{}", listener.local_addr().unwrap());
            let id = uuid::Uuid::new_v4().to_string();
            let body = serde_json::json!({"matchId":id,"mode":"ffa","host":"127.0.0.1","port":27015,
                "password":"","joinToken":"a".repeat(43),"playerName":"test_player"}).to_string();
            let worker = std::thread::spawn(move || {
                for status in statuses {
                    let (mut stream, _) = listener.accept().unwrap();
                    stream.set_read_timeout(Some(std::time::Duration::from_secs(3))).unwrap();
                    let mut request = Vec::new();
                    while !request.windows(4).any(|b| b == b"\r\n\r\n") {
                        let mut bytes = [0; 1024];
                        let n = stream.read(&mut bytes).unwrap();
                        assert!(n > 0 && request.len() < 8192);
                        request.extend_from_slice(&bytes[..n]);
                    }
                    write!(stream, "HTTP/1.1 {status} Response\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}", body.len()).unwrap();
                }
            });
            let result = super::connection(&origin, "test-only-token", &id);
            if let Some(expected) = expected { assert_eq!(result.unwrap_err(), expected); }
            else { assert_eq!(result.unwrap().mode, "ffa"); }
            worker.join().unwrap();
        }
    }
    #[test]
    #[cfg(target_os = "linux")]
    fn linux_handoff_retry_never_treats_authentication_rejection_as_transient() {
        for status in [429, 500, 503] {
            let error = ureq::Error::Status(status, ureq::Response::new(status, "Refused", "{}").unwrap());
            assert_eq!(super::session_request_error(error), "HANDOFF_REQUEST_FAILED");
        }
        for status in [400, 401, 403, 404, 410] {
            let error = ureq::Error::Status(status, ureq::Response::new(status, "Refused", "{}").unwrap());
            assert_eq!(super::session_request_error(error), "HANDOFF_EXPIRED");
        }
    }
    use super::*;
    #[test]
    fn config_auth_startup_contains_current_identity_and_is_cleaned_up() {
        let root = env::temp_dir().join(format!("16c-config-identity-{}", uuid::Uuid::new_v4()));
        fs::create_dir(&root).unwrap();
        let connection = Connection {
            match_id: uuid::Uuid::new_v4().to_string(), mode: "5v5".into(),
            host: "127.0.0.1".into(), port: 27015, password: "legacy-password".into(),
            join_token: "legacy-token-with-hyphens-12345678".into(), player_name: "TestPlayer".into(),
        };
        let startup = cs16_startup_file(&root, &connection, "").unwrap();
        let expected = format!("setinfo \"_16c_{}\" \"{}\"", &format!("{:x}", Sha256::digest(connection.match_id.as_bytes()))[..16], connection.join_token);
        assert_eq!(startup.1.matches(&expected).count(), 2);
        assert!(startup.1.ends_with("connect 127.0.0.1:27015\n"));
        assert!(startup.1.contains("password \"legacy-password\""));
        let path = startup.0.clone();
        cleanup_owned_file(Some(startup)).unwrap();
        assert!(!path.exists());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn standalone_variants_do_not_require_a_steam_client() {
        let root = env::temp_dir().join(format!("16c-steam-requirement-{}", uuid::Uuid::new_v4()));
        fs::create_dir(&root).unwrap();
        assert!(!cs16_requires_steam(&root, false, false));
        let steam = root.join("SteamApps/common/Half-Life");
        assert!(cs16_requires_steam(&steam, false, false));
        assert!(!cs16_requires_steam(&steam, true, false));
        assert!(!cs16_requires_steam(&steam, false, true));
        assert!(!cs16_requires_steam(&root.join("Games/CS 1.3"), false, false));
        assert!(!cs16_requires_steam(&root, true, false));
        assert!(!cs16_requires_steam(&root, false, true));
        fs::create_dir_all(&steam).unwrap();
        fs::write(steam.join("rev.ini"), b"fixture").unwrap();
        assert!(!cs16_requires_steam(&steam, false, false));
        fs::write(root.join("steam_appid.txt"), b"10").unwrap();
        assert!(!cs16_requires_steam(&root, false, false));
        fs::remove_dir_all(root).unwrap();
    }

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

#[cfg(test)]
mod installation_path_tests {
    use super::*;
    #[test]
    fn displays_windows_installations_without_verbatim_namespace() {
        assert_eq!(installation_display_path(Path::new(r"\\?\C:\Games\CS 1.6 GoldClient")), r"C:\Games\CS 1.6 GoldClient");
        assert_eq!(installation_display_path(Path::new(r"\\?\UNC\server\games\CS")), r"\\server\games\CS");
        for path in [r"C:\Games\CS", r"\\server\games", "/home/player/CS", r"\\?\Volume{abc}\CS"] {
            assert_eq!(installation_display_path(Path::new(path)), path);
        }
    }
}

#[cfg(test)]
mod binary_install_tests {
    use super::*;

    #[test]
    fn different_builds_coexist_and_identical_builds_reuse_installation() {
        let root = env::temp_dir().join(format!("16c-install-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&root).unwrap();
        let download = root.join("download");
        fs::write(&download, b"first build").unwrap();
        let first = install_binary(&root, &download).unwrap();
        assert_eq!(install_binary(&root, &download).unwrap(), first);
        fs::write(&download, b"second build of identical sources").unwrap();
        let second = install_binary(&root, &download).unwrap();
        assert_ne!(first, second);
        assert_eq!(fs::read(&first).unwrap(), b"first build");
        assert_eq!(fs::read(&second).unwrap(), fs::read(&download).unwrap());
        fs::write(&second, b"corrupted installation").unwrap();
        assert!(install_binary(&root, &download).unwrap_err().contains("integrity"));
        fs::remove_dir_all(root).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn existing_symlink_is_never_reused_or_overwritten() {
        let root = env::temp_dir().join(format!("16c-install-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&root).unwrap();
        let download = root.join("download");
        fs::write(&download, b"binary").unwrap();
        let target = installed_path(&root, &download).unwrap();
        fs::create_dir_all(target.parent().unwrap()).unwrap();
        std::os::unix::fs::symlink(&download, &target).unwrap();
        assert!(install_binary(&root, &download).unwrap_err().contains("integrity"));
        assert_eq!(fs::read(&download).unwrap(), b"binary");
        fs::remove_dir_all(root).unwrap();
    }
}
