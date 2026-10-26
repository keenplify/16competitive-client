use competitive16_web_helper::{parse_check_link, parse_launch_link, Connection, SessionResponse};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{env, fs::{self, OpenOptions}, io::Write, path::{Path, PathBuf}, process::{Command, Stdio}, time::Duration};

#[derive(Default, Deserialize, Serialize)]
struct Preferences { cs13: Option<PathBuf>, cs16: Option<PathBuf> }

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GamePattern {
    windows_executable: String,
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
}

#[derive(Deserialize)]
struct LaunchPattern { schema: u8, cs13: GamePattern, cs16: GamePattern }

fn launch_pattern() -> LaunchPattern {
    let pattern: LaunchPattern = serde_json::from_str(include_str!("../../src/shared/web-game-launch-pattern.json"))
        .expect("shared launch pattern is invalid");
    assert_eq!(pattern.schema, 1, "unsupported shared launch pattern");
    pattern
}

fn helper_fingerprint() -> String {
    let mut digest = Sha256::new();
    for source in [
        include_bytes!("main.rs").as_slice(),
        include_bytes!("lib.rs").as_slice(),
        include_bytes!("../Cargo.toml").as_slice(),
        include_bytes!("../Cargo.lock").as_slice(),
        include_bytes!("../../src/shared/web-game-launch-pattern.json").as_slice(),
    ] { digest.update(source); }
    format!("{:x}", digest.finalize())
}

fn user_config_dir() -> Result<PathBuf, String> {
    #[cfg(windows)]
    { Ok(PathBuf::from(env::var_os("LOCALAPPDATA").ok_or("LOCALAPPDATA is unavailable")?).join("16competitive")) }
    #[cfg(not(windows))]
    { Ok(env::var_os("XDG_CONFIG_HOME").map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from(env::var_os("HOME").unwrap_or_default()).join(".config"))
        .join("16competitive")) }
}

fn installed_path() -> Result<PathBuf, String> {
    #[cfg(windows)]
    { Ok(user_config_dir()?.join("competitive16-web-helper.exe")) }
    #[cfg(not(windows))]
    { Ok(PathBuf::from(env::var_os("HOME").ok_or("HOME is unavailable")?).join(".local/bin/competitive16-web-helper")) }
}

fn install_self() -> Result<PathBuf, String> {
    let installed = installed_path()?;
    let current = env::current_exe().map_err(|e| e.to_string())?;
    if current == installed { return Ok(installed); }
    fs::create_dir_all(installed.parent().ok_or("Invalid install path")?).map_err(|e| e.to_string())?;
    let temp = installed.with_extension("installing");
    fs::copy(current, &temp).map_err(|e| e.to_string())?;
    #[cfg(unix)] {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(&temp, fs::Permissions::from_mode(0o700)).map_err(|e| e.to_string())?;
    }
    if installed.exists() { fs::remove_file(&installed).map_err(|e| e.to_string())?; }
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
        if !Command::new("reg.exe").args(args).output().map_err(|e| e.to_string())?.status.success() {
            return Err("Could not register the URL protocol".into());
        }
    }
    let key = format!(r"{}\shell\open\command", root);
    if !Command::new("reg.exe").args(["add", &key, "/ve", "/d", &command, "/f"])
        .output().map_err(|e| e.to_string())?.status.success() {
        return Err("Could not register the URL command".into());
    }
    Ok(())
}

#[cfg(not(windows))]
fn register_protocol(executable: &Path) -> Result<(), String> {
    let home = PathBuf::from(env::var_os("HOME").ok_or("HOME is unavailable")?);
    let data = env::var_os("XDG_DATA_HOME").map(PathBuf::from).unwrap_or_else(|| home.join(".local/share"));
    let applications = data.join("applications");
    fs::create_dir_all(&applications).map_err(|e| e.to_string())?;
    let value = executable.to_str().ok_or("Invalid executable path")?;
    if value.contains(['\n', '\r', '"', '%']) { return Err("Unsupported executable path".into()); }
    fs::write(applications.join("competitive16-web-helper.desktop"), format!(
        "[Desktop Entry]\nType=Application\nName=1.6 Competitive Web Helper\nExec=\"{}\" %u\nTerminal=false\nNoDisplay=true\nMimeType=x-scheme-handler/competitive16-helper;\n", value
    )).map_err(|e| e.to_string())?;
    let result = Command::new("xdg-mime").args(["default", "competitive16-web-helper.desktop", "x-scheme-handler/competitive16-helper"])
        .output().map_err(|e| e.to_string())?;
    if !result.status.success() { return Err("Could not set the URL handler".into()); }
    Ok(())
}

#[cfg(windows)]
fn notice(message: &str) {
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::UI::WindowsAndMessaging::{MessageBoxW, MB_OK};
    let wide: Vec<u16> = std::ffi::OsStr::new(message).encode_wide().chain(Some(0)).collect();
    let title: Vec<u16> = std::ffi::OsStr::new("1.6 Competitive Helper").encode_wide().chain(Some(0)).collect();
    unsafe { MessageBoxW(std::ptr::null_mut(), wide.as_ptr(), title.as_ptr(), MB_OK); }
}

#[cfg(not(windows))]
fn notice(message: &str) {
    if Command::new("zenity").args(["--info", "--title=1.6 Competitive Helper", "--text", message])
        .status().is_err() { eprintln!("{message}"); }
}

#[cfg(windows)]
fn confirm(message: &str) -> bool {
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::UI::WindowsAndMessaging::{MessageBoxW, MB_YESNO, IDYES};
    let wide: Vec<u16> = std::ffi::OsStr::new(message).encode_wide().chain(Some(0)).collect();
    let title: Vec<u16> = std::ffi::OsStr::new("1.6 Competitive Helper").encode_wide().chain(Some(0)).collect();
    unsafe { MessageBoxW(std::ptr::null_mut(), wide.as_ptr(), title.as_ptr(), MB_YESNO) == IDYES }
}

#[cfg(not(windows))]
fn confirm(message: &str) -> bool {
    Command::new("zenity").args(["--question", "--title=1.6 Competitive Helper", "--text", message])
        .status().map(|s| s.success()).unwrap_or(false)
}

#[cfg(windows)]
fn browse_folder() -> Option<PathBuf> {
    // The script is constant; no path or server value is interpolated into it.
    let script = "Add-Type -AssemblyName System.Windows.Forms; $d = New-Object System.Windows.Forms.FolderBrowserDialog; if ($d.ShowDialog() -eq 'OK') { [Console]::Write($d.SelectedPath) }";
    let output = Command::new("powershell.exe").args(["-NoProfile", "-NonInteractive", "-Command", script]).output().ok()?;
    output.status.success().then(|| PathBuf::from(String::from_utf8_lossy(&output.stdout).trim()))
        .filter(|p| !p.as_os_str().is_empty())
}

#[cfg(not(windows))]
fn browse_folder() -> Option<PathBuf> {
    let output = Command::new("zenity").args(["--file-selection", "--directory", "--title=Choose Counter-Strike folder"])
        .output().ok()?;
    output.status.success().then(|| PathBuf::from(String::from_utf8_lossy(&output.stdout).trim()))
        .filter(|p| !p.as_os_str().is_empty())
}

fn version_is_13(path: &Path) -> bool {
    let source = fs::read_to_string(path).unwrap_or_default();
    source.lines().any(|line| line.trim().eq_ignore_ascii_case("version \"1.3\""))
}

fn validate_installation(folder: &Path, game: &str) -> Option<(PathBuf, PathBuf, String)> {
    let pattern = launch_pattern();
    let game_pattern = if game == "cs13" { &pattern.cs13 } else { &pattern.cs16 };
    let selected = fs::canonicalize(folder).ok()?;
    let selected_name = selected.file_name()?.to_string_lossy();
    let root = if ["cstrike", "cstrk13"].iter().any(|name| selected_name.eq_ignore_ascii_case(name)) {
        selected.parent()?.to_path_buf()
    } else { selected };
    for mod_dir in &game_pattern.mod_directories {
        let metadata = root.join(mod_dir).join("liblist.gam");
        if !metadata.is_file() || version_is_13(&metadata) != (game == "cs13") { continue; }
        let native_linux = cfg!(target_os = "linux") && root.join("hl_linux").is_file();
        let exe = root.join(if native_linux { &game_pattern.linux_executable } else { &game_pattern.windows_executable });
        let client = root.join(mod_dir).join("cl_dlls").join(if native_linux { "client.so" } else { "client.dll" });
        if exe.is_file() && client.is_file() {
            return Some((root, exe, mod_dir.to_owned()));
        }
    }
    None
}

fn discover(game: &str) -> Vec<PathBuf> {
    let roots: Vec<PathBuf> = if cfg!(windows) {
        (b'A'..=b'Z').map(|letter| PathBuf::from(format!("{}:\\", letter as char))).collect()
    } else {
        vec![PathBuf::from(env::var_os("HOME").unwrap_or_default()), PathBuf::from("/opt"), PathBuf::from("/mnt"), PathBuf::from("/media")]
    };
    let mut found = Vec::new();
    for root in roots {
        if !root.is_dir() { continue; }
        let mut seeds = vec![root.clone()];
        if cfg!(windows) {
            seeds.extend(["Games", "SteamLibrary/steamapps/common", "Program Files (x86)/Steam/steamapps/common", "Program Files/Steam/steamapps/common"]
                .iter().map(|path| root.join(path)));
        } else {
            seeds.extend([".steam/steam/steamapps/common", ".local/share/Steam/steamapps/common"]
                .iter().map(|path| root.join(path)));
        }
        for seed in seeds {
            if let Some((path, _, _)) = validate_installation(&seed, game) { if !found.contains(&path) { found.push(path); } }
            let Ok(entries) = fs::read_dir(&seed) else { continue };
            for entry in entries.flatten().take(400) {
                if entry.file_type().map(|kind| kind.is_dir()).unwrap_or(false) {
                    if let Some((path, _, _)) = validate_installation(&entry.path(), game) {
                        if !found.contains(&path) { found.push(path); }
                    }
                }
            }
        }
    }
    found
}

fn preference_path() -> Result<PathBuf, String> { Ok(user_config_dir()?.join("web-helper.json")) }

fn choose_installation(game: &str) -> Result<(PathBuf, PathBuf, String), String> {
    let path = preference_path()?;
    let mut preferences: Preferences = fs::read(&path).ok().and_then(|bytes| serde_json::from_slice(&bytes).ok()).unwrap_or_default();
    let saved = if game == "cs13" { &preferences.cs13 } else { &preferences.cs16 };
    if let Some(found) = saved.as_ref().and_then(|folder| validate_installation(folder, game)) { return Ok(found); }
    let mut selected = None;
    for folder in discover(game) {
        if confirm(&format!("Use this Counter-Strike {} installation?\n{}", &game[2..], folder.display())) {
            selected = Some(folder); break;
        }
    }
    while selected.is_none() {
        if !confirm(&format!("Counter-Strike {} was not selected. Choose its installation folder?", &game[2..])) {
            return Err("Game installation is required".into());
        }
        let Some(folder) = browse_folder() else { return Err("Game folder selection was cancelled".into()); };
        if validate_installation(&folder, game).is_some() { selected = Some(folder); }
        else { notice("That folder is not a valid installation for the selected Counter-Strike version."); }
    }
    let installation = validate_installation(selected.as_ref().unwrap(), game).ok_or("Invalid game installation")?;
    if game == "cs13" { preferences.cs13 = Some(installation.0.clone()); }
    else { preferences.cs16 = Some(installation.0.clone()); }
    fs::create_dir_all(path.parent().ok_or("Invalid settings path")?).map_err(|e| e.to_string())?;
    fs::write(path, serde_json::to_vec(&preferences).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
    Ok(installation)
}

fn session(api: &str, handoff: &str) -> Result<String, String> {
    let agent = ureq::AgentBuilder::new().redirects(0).timeout(Duration::from_secs(10)).build();
    let response: SessionResponse = agent.post(&format!("{api}/auth/web-handoff/consume"))
        .send_json(serde_json::json!({ "token": handoff, "clientKind": "rust", "clientVersion": helper_fingerprint() }))
        .map_err(|_| "Setup or match handoff expired; try again from the web page".to_owned())?
        .into_json().map_err(|_| "Invalid authentication response".to_owned())?;
    if response.token.len() < 20 || response.token.len() > 2048 { return Err("Invalid authentication response".into()); }
    Ok(response.token)
}

fn connection(api: &str, token: &str, match_id: &str) -> Result<Connection, String> {
    let agent = ureq::AgentBuilder::new().redirects(0).timeout(Duration::from_secs(10)).build();
    let result: Connection = agent.get(&format!("{api}/matchmaking/matches/{match_id}/helper-connection"))
        .set("Authorization", &format!("Bearer {token}"))
        .call().map_err(|_| "Match connection is no longer available".to_owned())?
        .into_json().map_err(|_| "Invalid match connection response".to_owned())?;
    result.validate(match_id).map_err(str::to_owned)?;
    Ok(result)
}

fn cs13_auth_file(game_dir: &Path, connection: &Connection) -> Result<(PathBuf, String), String> {
    let pattern = launch_pattern();
    let wire = format!("{:x}", Sha256::digest(format!("cs13:{}", connection.join_token))).chars().take(32).collect::<String>();
    let id = format!("{:x}", Sha256::digest(format!("cs13file:{}", connection.password))).chars().take(16).collect::<String>();
    let path = game_dir.join(format!("{}{id}.cfg", pattern.cs13.auth_file_prefix.as_deref().ok_or("Missing CS 1.3 auth prefix")?));
    let contents = format!("// 1.3 Competitive session authentication\ncmd {} {wire}\n", pattern.cs13.auth_command.as_deref().ok_or("Missing CS 1.3 auth command")?);
    if path.exists() {
        if fs::symlink_metadata(&path).map_err(|e| e.to_string())?.file_type().is_symlink() ||
            fs::read_to_string(&path).map_err(|e| e.to_string())? != contents { return Err("Unrecognized CS 1.3 session file".into()); }
    } else {
        let mut options = OpenOptions::new();
        options.write(true).create_new(true);
        #[cfg(unix)] {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600).custom_flags(libc::O_NOFOLLOW);
        }
        let mut file = options.open(&path).map_err(|e| e.to_string())?;
        file.write_all(contents.as_bytes()).map_err(|e| e.to_string())?;
        file.sync_all().map_err(|e| e.to_string())?;
    }
    Ok((path, contents))
}

fn cs16_startup_file(game_dir: &Path, connection: &Connection) -> Result<(PathBuf, String), String> {
    let pattern = launch_pattern();
    let id = format!("{:x}", Sha256::digest(connection.match_id.as_bytes()));
    let short_id = &id[..16];
    let prefix = pattern.cs16.startup_config_prefix.as_deref().ok_or("Missing CS 1.6 config prefix")?;
    let key = pattern.cs16.join_info_prefix.as_deref().ok_or("Missing CS 1.6 join prefix")?;
    let path = game_dir.join(format!("{prefix}{short_id}.cfg"));
    let identity = format!("name \"{}\"\nsetinfo \"{key}{short_id}\" \"{}\"\npassword \"{}\"\n",
        connection.player_name, connection.join_token, connection.password);
    let waits = "wait\n".repeat(pattern.cs16.startup_wait_frames.ok_or("Missing CS 1.6 startup wait")?);
    let contents = format!("{identity}{waits}{identity}connect {}:{}\n", connection.host, connection.port);
    if path.exists() {
        if fs::symlink_metadata(&path).map_err(|e| e.to_string())?.file_type().is_symlink() ||
            fs::read_to_string(&path).map_err(|e| e.to_string())? != contents { return Err("Unrecognized CS 1.6 session file".into()); }
    } else {
        let mut options = OpenOptions::new();
        options.write(true).create_new(true);
        #[cfg(unix)] {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600).custom_flags(libc::O_NOFOLLOW);
        }
        let mut file = options.open(&path).map_err(|e| e.to_string())?;
        file.write_all(contents.as_bytes()).map_err(|e| e.to_string())?;
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

fn launch_match(connection: &Connection) -> Result<(), String> {
    let pattern = launch_pattern();
    let game_pattern = if connection.game() == "cs13" { &pattern.cs13 } else { &pattern.cs16 };
    let (root, exe, mod_dir) = choose_installation(connection.game())?;
    let game_dir = root.join(&mod_dir);
    let auth = if connection.game() == "cs13" { Some(cs13_auth_file(&game_dir, connection)?) } else { None };
    let startup = if connection.game() == "cs16" { Some(cs16_startup_file(&game_dir, connection)?) } else { None };
    let mut command = if cfg!(target_os = "linux") && exe.extension().is_some_and(|ext| ext == "exe") {
        let mut wine = Command::new("wine"); wine.arg(&exe); wine
    } else { Command::new(&exe) };
    command.current_dir(&root).arg("-game").arg(&mod_dir);
    if connection.game() == "cs13" {
        command.args(game_pattern.windows_flags.as_deref().unwrap_or_default());
        command.args([&game_pattern.password_argument, &connection.password,
            &game_pattern.connect_argument, &format!("{}:{}", connection.host, connection.port)]);
    } else {
        let name = startup.as_ref().and_then(|(path, _)| path.file_name()).ok_or("Missing CS 1.6 config")?;
        command.arg("+exec").arg(name);
    }
    command.stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null());
    let mut child = match command.spawn() {
        Ok(child) => child,
        Err(error) => {
            cleanup_owned_file(auth)?;
            cleanup_owned_file(startup)?;
            return Err(error.to_string());
        }
    };
    let _ = child.wait();
    cleanup_owned_file(auth)?;
    cleanup_owned_file(startup)?;
    Ok(())
}

fn run() -> Result<(), String> {
    if env::args().any(|value| value == "--fingerprint") {
        println!("{}", helper_fingerprint());
        return Ok(());
    }
    let exe = install_self()?;
    register_protocol(&exe)?;
    let arg = env::args().skip(1).find(|value| value.starts_with("competitive16-helper://"));
    let Some(link) = arg else {
        notice("Web helper installed. The website can now check setup and open matches. You can close this helper; it does not run in the background.");
        return Ok(());
    };
    let development = cfg!(debug_assertions);
    if let Some(check) = parse_check_link(&link, development) {
        session(&check.api_origin, &check.handoff)?;
        return Ok(());
    }
    let launch = parse_launch_link(&link, development).ok_or("Invalid 1.6 Competitive link")?;
    let token = session(&launch.api_origin, &launch.handoff)?;
    let connection = connection(&launch.api_origin, &token, &launch.match_id)?;
    launch_match(&connection)
}

fn main() {
    if let Err(error) = run() { notice(&error); std::process::exit(1); }
}
