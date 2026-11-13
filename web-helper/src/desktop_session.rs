//! Private inherited-pipe handoff. Credentials never enter argv or files.
use crate::*;
use std::{
    io::{BufRead, BufReader, Read},
    sync::mpsc,
};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Request {
    protocol: u8,
    api_origin: String,
    handoff: String,
    match_id: Option<String>,
    #[serde(default)]
    partner: Option<partner::Launch>,
    installation: PathBuf,
    #[serde(default)]
    game: Option<String>,
    settings: settings_bridge::NativePreferences,
    reopen: Option<Reopen>,
    #[serde(default)]
    keep_launcher_open: bool,
    #[serde(default)]
    preferences_source: Option<PathBuf>,
    #[serde(default)]
    asset_config_home: Option<PathBuf>,
}
#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct Reopen {
    pub(crate) executable: PathBuf,
    pub(crate) sha256: String,
    pub(crate) args: Vec<String>,
}

pub(crate) fn executable_hash(path: &Path) -> Result<String, String> {
    if !path.is_absolute() {
        return Err("Invalid launcher executable".into());
    }
    let metadata = fs::symlink_metadata(path).map_err(|_| "Launcher executable unavailable")?;
    if !metadata.is_file()
        || metadata.file_type().is_symlink()
        || metadata.len() > 1024 * 1024 * 1024
    {
        return Err("Invalid launcher executable".into());
    }
    let mut file = fs::File::open(path).map_err(|_| "Launcher executable unavailable")?;
    let mut hasher = Sha256::new();
    let mut buffer = [0; 65536];
    let mut size = 0;
    loop {
        let n = file
            .read(&mut buffer)
            .map_err(|_| "Launcher verification failed")?;
        if n == 0 {
            break;
        }
        size += n;
        if size > 1024 * 1024 * 1024 {
            return Err("Invalid launcher executable".into());
        }
        hasher.update(&buffer[..n]);
    }
    Ok(format!("{:x}", hasher.finalize()))
}
impl Reopen {
    pub(crate) fn validate(&self) -> Result<(), String> {
        if self.args.len() > 3
            || self
                .args
                .iter()
                .any(|a| a.len() > 4096 || a.contains(['\0', '\r', '\n']))
            || executable_hash(&self.executable)? != self.sha256
        {
            return Err("Launcher restart verification failed".into());
        }
        Ok(())
    }
    pub(crate) fn launch(&self) -> Result<(), String> {
        self.validate()?;
        let mut command = Command::new(&self.executable);
        command
            .args(&self.args)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null());
        // Do not carry a game injection/runtime environment into the launcher.
        for key in [
            "LD_PRELOAD",
            "PAPAMO_SKIN_PROBE_SESSION",
            "ELECTRON_RUN_AS_NODE",
        ] {
            command.env_remove(key);
        }
        #[cfg(unix)]
        {
            use std::os::unix::process::CommandExt;
            command.process_group(0);
        }
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            command.creation_flags(0x00000008 | 0x00000200);
        }
        command.spawn().map_err(|_| "Could not reopen launcher")?;
        Ok(())
    }
}

static STOP_REQUESTED: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);
static PROGRESS_ENABLED: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);

pub(crate) fn report_progress(phase: &str, completed: usize, total: usize) {
    if !PROGRESS_ENABLED.load(std::sync::atomic::Ordering::Acquire) { return; }
    let mut output = std::io::stdout().lock();
    let _ = writeln!(output, "{}", serde_json::json!({
        "protocol": 1, "event": "progress", "phase": phase,
        "completed": completed, "total": total
    }));
    let _ = output.flush();
}

pub(crate) fn report_config_auth_fallback() {
    if !PROGRESS_ENABLED.load(std::sync::atomic::Ordering::Acquire) { return; }
    let mut output = std::io::stdout().lock();
    let _ = writeln!(output, "{}", serde_json::json!({
        "protocol": 1, "event": "notice", "code": "COSMETICS_UNAVAILABLE_CONFIG_AUTH"
    }));
    let _ = output.flush();
}

pub(crate) fn forward_progress(frame: &serde_json::Value) -> Result<bool, String> {
    if frame["protocol"] == 1 && frame["event"] == "notice" && frame["code"] == "COSMETICS_UNAVAILABLE_CONFIG_AUTH" {
        report_config_auth_fallback();
        return Ok(true);
    }
    if frame["event"] != "progress" { return Ok(false); }
    let phase = frame["phase"].as_str().ok_or("Invalid compatibility progress")?;
    let completed = frame["completed"].as_u64().ok_or("Invalid compatibility progress")?;
    let total = frame["total"].as_u64().ok_or("Invalid compatibility progress")?;
    if frame["protocol"] != 1 || completed > total || total > 20000 ||
        !matches!(phase, "checking" | "assets" | "downloading" | "stickers" | "sticker_download" | "sticker_bake" | "starting") {
        return Err("Invalid compatibility progress".into());
    }
    report_progress(phase, completed as usize, total as usize);
    Ok(true)
}

// Return only fixed diagnostic codes, never paths, tokens or backend bodies.
pub(crate) fn failure_code(error: &str) -> &'static str {
    match error {
        "Device authorization check failed" | "DEVICE_CHECK_FAILED" => "DEVICE_CHECK_FAILED",
        "Match connection is no longer available" | "MATCH_UNAVAILABLE" => "MATCH_UNAVAILABLE",
        "Invalid game installation" | "INSTALLATION_INVALID" => "INSTALLATION_INVALID",
        "Invalid Wine path" | "Wine path conversion failed" | "COMPATIBILITY_PATH_FAILED" => "COMPATIBILITY_PATH_FAILED",
        "Launcher restart verification failed" | "LAUNCHER_VERIFICATION_FAILED" => "LAUNCHER_VERIFICATION_FAILED",
        "This device cannot join competitive matches" | "DEVICE_DENIED" => "DEVICE_DENIED",
        "GAME_ALREADY_RUNNING" | "Close the existing Counter-Strike game before starting a managed session" => "GAME_ALREADY_RUNNING",
        "GAME_CLOSE_FAILED" => "GAME_CLOSE_FAILED",
        "NATIVE_RECOVERY_FAILED" => "NATIVE_RECOVERY_FAILED",
        "Wine path conversion timed out" | "Wine output timed out" => "COMPATIBILITY_PATH_FAILED",
        "Could not obtain the signed Windows session helper" | "Could not download Windows session helper" | "WINDOWS_HELPER_DOWNLOAD_FAILED" => "WINDOWS_HELPER_DOWNLOAD_FAILED",
        "Native inspector integrity check failed" | "Native module integrity check failed" | "NATIVE_INTEGRITY_FAILED" => "NATIVE_INTEGRITY_FAILED",
        "Invalid compatibility cache root" | "COMPATIBILITY_CACHE_FAILED" => "COMPATIBILITY_CACHE_FAILED",
        "NATIVE_INSTALL_FAILED" => "NATIVE_INSTALL_FAILED",
        "INSTALLATION_SELECTION_FAILED" => "INSTALLATION_SELECTION_FAILED",
        "NATIVE_ROOT_INVALID" => "NATIVE_ROOT_INVALID",
        "NATIVE_CLIENT_CHECK_FAILED" => "NATIVE_CLIENT_CHECK_FAILED",
        "NATIVE_CLEANUP_FAILED" => "NATIVE_CLEANUP_FAILED",
        "AUTH_CLEANUP_FAILED" => "AUTH_CLEANUP_FAILED",
        "STARTUP_CLEANUP_FAILED" => "STARTUP_CLEANUP_FAILED",
        "INSPECTOR_STOP_FAILED" => "INSPECTOR_STOP_FAILED",
        "VOICE_OWNERSHIP_FAILED" => "VOICE_OWNERSHIP_FAILED",
        "NATIVE_LEASE_FAILED" => "NATIVE_LEASE_FAILED",
        "SETTINGS_READ_FAILED" => "SETTINGS_READ_FAILED",
        "SETTINGS_WRITE_FAILED" => "SETTINGS_WRITE_FAILED",
        "LAUNCH_ARGUMENTS_FAILED" => "LAUNCH_ARGUMENTS_FAILED",
        "NATIVE_HANDOFF_FAILED" => "NATIVE_HANDOFF_FAILED",
        "GTPROTECTOR_COMPATIBILITY_FAILED" => "GTPROTECTOR_COMPATIBILITY_FAILED",
        "STICKER_REQUEST_FAILED" => "STICKER_REQUEST_FAILED",
        "STICKER_PREPARATION_FAILED" => "STICKER_PREPARATION_FAILED",
        "Sticker preparation timed out" | "STICKER_TIMEOUT" => "STICKER_TIMEOUT",
        "Sticker recipe hash mismatch" | "STICKER_RECIPE_HASH_MISMATCH" => "STICKER_RECIPE_HASH_MISMATCH",
        "Sticker source hash mismatch" | "STICKER_SOURCE_HASH_MISMATCH" => "STICKER_SOURCE_HASH_MISMATCH",
        "Sticker artwork hash mismatch" | "STICKER_ARTWORK_HASH_MISMATCH" => "STICKER_ARTWORK_HASH_MISMATCH",
        "STICKER_RECIPE_INVALID" => "STICKER_RECIPE_INVALID",
        "STICKER_SOURCE_FAILED" => "STICKER_SOURCE_FAILED",
        "STICKER_ARTWORK_REQUEST_FAILED" => "STICKER_ARTWORK_REQUEST_FAILED",
        "STICKER_IMAGE_INVALID" => "STICKER_IMAGE_INVALID",
        "STICKER_BAKE_FAILED" => "STICKER_BAKE_FAILED",
        "STICKER_BAKE_TIMEOUT" => "STICKER_BAKE_TIMEOUT",
        "STICKER_SESSION_WRITE_FAILED" => "STICKER_SESSION_WRITE_FAILED",
        "ASSET_PREPARATION_FAILED" => "ASSET_PREPARATION_FAILED",
        "STARTUP_CONFIG_FAILED" => "STARTUP_CONFIG_FAILED",
        "NATIVE_BUNDLE_FAILED" => "NATIVE_BUNDLE_FAILED",
        "NATIVE_SESSION_FAILED" => "NATIVE_SESSION_FAILED",
        "NATIVE_INSTALL_UNSUPPORTED" => "NATIVE_INSTALL_UNSUPPORTED",
        "INSPECTOR_START_FAILED" => "INSPECTOR_START_FAILED",
        "STEAM_START_FAILED" => "STEAM_START_FAILED",
        "STEAM_RUNTIME_FAILED" => "STEAM_RUNTIME_FAILED",
        "GAME_SPAWN_FAILED" => "GAME_SPAWN_FAILED",
        "ADMIN_RESTART_FAILED" => "ADMIN_RESTART_FAILED",
        "ADMIN_RESTART_CANCELLED" => "ADMIN_RESTART_CANCELLED",
        "GAME_STARTUP_FAILED" => "GAME_STARTUP_FAILED",
        "GAME_PROCESS_NOT_FOUND" => "GAME_PROCESS_NOT_FOUND",
        "GAME_CLIENT_NOT_LOADED" => "GAME_CLIENT_NOT_LOADED",
        "MATCH_RECOVERY_REQUIRED" => "MATCH_RECOVERY_REQUIRED",
        value if value.starts_with("Sticker cache") => "STICKER_CACHE_FAILED",
        "STICKER_CACHE_FAILED" => "STICKER_CACHE_FAILED",
        _ => "PREPARATION_FAILED",
    }
}

/// Preserve a recognized failure, otherwise expose only the fixed failing step.
pub(crate) fn preparation_error(error: &str, step: &str) -> String {
    let code = failure_code(error);
    if code == "PREPARATION_FAILED" { failure_code(step).into() } else { code.into() }
}

thread_local! {
    static CLEANUP_FAILURE: std::cell::RefCell<Option<(String, Option<String>)>> = const { std::cell::RefCell::new(None) };
    static SPAWN_FAILURE: std::cell::RefCell<Option<(Option<i32>, String)>> = const { std::cell::RefCell::new(None) };
}

/// Keep only OS diagnostics, never the error message, executable path or argv.
pub(crate) fn game_spawn_failure(error: std::io::Error) -> String {
    SPAWN_FAILURE.with(|slot| {
        *slot.borrow_mut() = Some((error.raw_os_error(), format!("{:?}", error.kind())));
    });
    "GAME_SPAWN_FAILED".into()
}

#[cfg(windows)]
pub(crate) fn process_elevated() -> Option<bool> {
    use windows_sys::Win32::{Foundation::CloseHandle, Security::{GetTokenInformation, TokenElevation, TOKEN_ELEVATION, TOKEN_QUERY}, System::Threading::{GetCurrentProcess, OpenProcessToken}};
    let mut token = std::ptr::null_mut();
    if unsafe { OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &mut token) } == 0 { return None; }
    let mut elevation: TOKEN_ELEVATION = unsafe { std::mem::zeroed() };
    let mut bytes = 0;
    let result = unsafe { GetTokenInformation(token, TokenElevation, (&mut elevation as *mut TOKEN_ELEVATION).cast(), std::mem::size_of::<TOKEN_ELEVATION>() as u32, &mut bytes) };
    unsafe { CloseHandle(token); }
    (result != 0).then_some(elevation.TokenIsElevated != 0)
}
#[cfg(not(windows))]
pub(crate) fn process_elevated() -> Option<bool> { None }

pub(crate) fn record_cleanup_failures(primary: &Result<(), String>, cleanup: &[(&str, Result<(), String>)]) {
    let codes: Vec<_> = cleanup.iter().filter(|(_, result)| result.is_err())
        .map(|(code, _)| failure_code(code)).collect();
    CLEANUP_FAILURE.with(|slot| *slot.borrow_mut() = if codes.is_empty() { None } else {
        Some((codes.join(" "), primary.as_ref().err().map(|error| failure_code(error).to_owned())))
    });
}

pub(crate) fn failure_snapshot(error: &str) -> serde_json::Value {
    let mut frame = serde_json::json!({"protocol":1,"event":"error","code":failure_code(error)});
    if let Some((codes, primary)) = CLEANUP_FAILURE.with(|slot| slot.borrow().clone()) {
        frame["cleanupCodes"] = serde_json::json!(codes);
        if let Some(code) = primary { frame["originalCode"] = serde_json::json!(code); }
    }
    // A report snapshot must not consume the context needed by the launcher.
    if let Some((os_error, kind)) = SPAWN_FAILURE.with(|slot| slot.borrow().clone()) {
        if error == "GAME_SPAWN_FAILED" {
            frame["osError"] = serde_json::json!(os_error);
            frame["errorKind"] = serde_json::json!(kind);
            frame["elevated"] = serde_json::json!(process_elevated());
        }
    }
    frame
}

pub(crate) fn failure_notice(error: &str, locale: &str) -> String {
    let frame = failure_snapshot(error);
    let key = if error == "GAME_SPAWN_FAILED" && frame["osError"] == 740 { "elevation" }
        else if error == "ADMIN_RESTART_CANCELLED" { "cancelled" }
        else if error == "ADMIN_RESTART_FAILED" { "adminFailed" }
        else if error == "VOICE_OWNERSHIP_FAILED" { "voice" }
        else { return frame.to_string(); };
    let language = locale.split(['-', '_']).next().unwrap_or("en").to_ascii_lowercase();
    let language = if language == "fil" { "tl" } else { &language };
    let catalog: serde_json::Value = serde_json::from_str(include_str!("launch-notices.json")).expect("static launch notices");
    let message = catalog[language][key].as_str().unwrap_or_else(|| catalog["en"][key].as_str().unwrap());
    format!("{message}\n\n{}", frame)
}

fn failure_frame(error: &str) -> serde_json::Value {
    let frame = failure_snapshot(error);
    CLEANUP_FAILURE.with(|slot| slot.borrow_mut().take());
    SPAWN_FAILURE.with(|slot| slot.borrow_mut().take());
    frame
}

pub(crate) fn report_failure(error: &str) {
    let mut output = std::io::stdout().lock();
    let _ = writeln!(output, "{}", failure_frame(error));
    let _ = output.flush();
}

pub fn stop_requested() -> bool {
    STOP_REQUESTED.load(std::sync::atomic::Ordering::Acquire)
}

fn accept_handoff(
    rx: &mpsc::Receiver<Option<Vec<u8>>>,
    output: &mut impl Write,
    timeout: Duration,
    keep_launcher_open: bool,
) -> Result<(), String> {
    writeln!(output, "{{\"event\":\"ready\",\"protocol\":1}}")
        .map_err(|_| "Launcher handoff closed")?;
    output.flush().map_err(|_| "Launcher handoff closed")?;
    let frame = rx
        .recv_timeout(timeout)
        .map_err(|_| "Launcher handoff was not committed")?
        .ok_or("Launcher handoff closed")?;
    let frame: serde_json::Value =
        serde_json::from_slice(&frame).map_err(|_| "Invalid handoff commit")?;
    if frame != serde_json::json!({"commit":true}) {
        return Err("Invalid handoff commit".into());
    }
    writeln!(output, "{{\"event\":\"committed\",\"protocol\":1}}")
        .map_err(|_| "Launcher handoff closed")?;
    output.flush().map_err(|_| "Launcher handoff closed")?;
    PROGRESS_ENABLED.store(false, std::sync::atomic::Ordering::Release);
    // Closing mode requires parent EOF. Retained UI mode requires an explicit
    // release and keeps the same pipe for bounded session control.
    match rx.recv_timeout(timeout) {
        Ok(None) if !keep_launcher_open => Ok(()),
        Ok(Some(frame))
            if keep_launcher_open
                && serde_json::from_slice::<serde_json::Value>(&frame).ok()
                    == Some(serde_json::json!({"release":true})) =>
        {
            Ok(())
        }
        _ => Err("Launcher did not release the standalone session".into()),
    }
}

pub fn run() -> Result<(), String> {
    run_inner(false)
}
#[cfg(windows)]
pub fn run_compatibility() -> Result<(), String> {
    run_inner(true)
}
fn run_inner(compatibility: bool) -> Result<(), String> {
    PROGRESS_ENABLED.store(true, std::sync::atomic::Ordering::Release);
    let (tx, rx) = mpsc::sync_channel(3);
    std::thread::spawn(move || {
        let mut input = BufReader::new(std::io::stdin());
        loop {
            let mut line = Vec::new();
            match input.by_ref().take(32769).read_until(b'\n', &mut line) {
                Ok(0) => {
                    let _ = tx.send(None);
                    break;
                }
                Ok(_) if line.len() <= 32768 && line.ends_with(b"\n") => {
                    if tx.send(Some(line)).is_err() {
                        break;
                    }
                }
                _ => break,
            }
        }
    });
    let bytes = rx
        .recv_timeout(Duration::from_secs(10))
        .map_err(|_| "Launcher handoff timed out")?
        .ok_or("Launcher handoff closed")?;
    let request: Request =
        serde_json::from_slice(&bytes).map_err(|_| "Invalid launcher handoff")?;
    if request.protocol != 1
        || match (&request.match_id, &request.partner) {
            (Some(id), None) => uuid::Uuid::parse_str(id).is_err(),
            (None, Some(partner)) => partner.validate().is_err(),
            _ => true,
        }
        || competitive16_web_helper::allowed_api_origin(&request.api_origin, cfg!(debug_assertions))
            .as_deref()
            != Some(&request.api_origin)
        || !(32..=128).contains(&request.handoff.len())
        || !request
            .handoff
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-')
    {
        return Err("Invalid launcher handoff".into());
    }
    request.settings.validate()?;
    if let Some(path) = &request.asset_config_home {
        if !compatibility { return Err("Invalid compatibility cache root".into()); }
        assets::set_compatibility_config_home(path.clone())?;
    }
    match &request.reopen {
        Some(reopen) if !compatibility => reopen.validate()?,
        None if compatibility || request.keep_launcher_open => {}
        _ => return Err("Invalid launcher restart request".into()),
    }
    if let Some(source) = &request.preferences_source {
        if !compatibility
            || !source.is_absolute()
            || source
                .file_name()
                .is_none_or(|name| name != "web-helper.json")
        {
            return Err("Invalid compatibility preference source".into());
        }
        native_preferences::set_live_source(source.clone())?;
    }
    let game = request.game.as_deref().unwrap_or("cs16");
    if !matches!(game, "cs16" | "cs13") { return Err("Invalid game installation".into()); }
    let (root, _, mod_dir) =
        validate_installation(&request.installation, game).ok_or("Invalid game installation")?;
    let mut preferences = settings_bridge::load().map_err(|e| preparation_error(&e, "SETTINGS_READ_FAILED"))?;
    if game == "cs13" { preferences.cs13 = Some(root.join(mod_dir)); }
    else { preferences.cs16 = Some(root); }
    preferences.settings = request.settings;
    preferences.settings.lightweight_hud = true;
    settings_bridge::save(&preferences).map_err(|e| preparation_error(&e, "SETTINGS_WRITE_FAILED"))?;
    let token = session(&request.api_origin, &request.handoff)?;
    // Use the same resident UI and OS lock as browser sessions. Do not delay
    // game preparation for tray startup or community image downloads.
    let _branding = if compatibility { None } else { Some(branding::Lease::start_game(&request.api_origin, &token)) };
    let _partner_activity = request.partner.as_ref().map(|_| presence::GameLease::partner());
    let status_stop = std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false));
    let mut status_worker = None;
    let mut committed = false;
    let mut control_rx = Some(rx);
    let mut accept = || {
        accept_handoff(
            control_rx.as_ref().ok_or("Session already released")?,
            &mut std::io::stdout(),
            Duration::from_secs(15),
            request.keep_launcher_open,
        )?;
        if !compatibility {
            if let Ok(exe) = env::current_exe() {
                std::thread::spawn(move || {
                    if let Err(error) = tray::ensure(&exe) { eprintln!("Tray startup failed: {error}"); }
                });
            }
        }
        if request.keep_launcher_open {
            // The pipe controls only this retained session. EOF after release
            // requests cleanup; it can never target a replacement game.
            let rx = control_rx.take().ok_or("Session already released")?;
            std::thread::spawn(move || {
                while let Ok(Some(frame)) = rx.recv() {
                    let Ok(value) = serde_json::from_slice::<serde_json::Value>(&frame) else {
                        break;
                    };
                    if value == serde_json::json!({"stop":true}) {
                        break;
                    }
                    if let Some(settings) = value.get("settings") {
                        let result = (|| -> Result<(), String> {
                            let settings: settings_bridge::NativePreferences =
                                serde_json::from_value(settings.clone())
                                    .map_err(|_| "Invalid session preferences")?;
                            settings.validate()?;
                            let mut preferences = settings_bridge::load()?;
                            preferences.settings = settings;
                            settings_bridge::save(&preferences)
                        })();
                        if result.is_err() {
                            break;
                        }
                    } else {
                        break;
                    }
                }
                STOP_REQUESTED.store(true, std::sync::atomic::Ordering::Release);
            });
        }
        if request.keep_launcher_open && !compatibility {
            let stop = status_stop.clone();
            let directory = user_config_dir()?;
            let id = request
                .match_id
                .clone()
                .or_else(|| request.partner.as_ref().map(|p| p.server_id.clone()))
                .ok_or("Missing session")?;
            status_worker = Some(std::thread::spawn(move || {
                while !stop.load(std::sync::atomic::Ordering::Acquire) {
                    let status = session_mode::voice_status(&directory, &id);
                    let mut output = std::io::stdout().lock();
                    if writeln!(output, "{}", serde_json::json!({"protocol":1,"event":"status","connected":status["connected"]})).is_err() { break; }
                    let _ = output.flush();
                    drop(output);
                    std::thread::sleep(Duration::from_millis(500));
                }
            }));
        }
        committed = true;
        Ok(())
    };
    let result = if let Some(partner) = &request.partner {
        partner::launch(&request.api_origin, &token, partner, &mut accept)
    } else {
        let connection = connection(
            &request.api_origin,
            &token,
            request.match_id.as_deref().ok_or("Missing match")?,
        )?;
        if connection.game() != game { return Err("Game installation does not match assigned game".into()); }
        launch_native_match(&connection, &request.api_origin, &token, &mut accept)
    };
    status_stop.store(true, std::sync::atomic::Ordering::Release);
    if let Some(worker) = status_worker {
        let _ = worker.join();
    }
    drop(token);
    if committed && !request.keep_launcher_open {
        if let Some(reopen) = request.reopen {
            reopen.launch()?;
        }
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn actionable_launch_notices_cover_every_supported_language() {
        for locale in ["en", "tl", "fil-PH", "ru", "th", "id", "pt", "ja", "hi"] {
            let error = game_spawn_failure(std::io::Error::from_raw_os_error(740));
            let message = failure_notice(&error, locale);
            assert!(message.contains("740"));
            assert!(message.len() > failure_snapshot(&error).to_string().len());
            for code in ["VOICE_OWNERSHIP_FAILED", "ADMIN_RESTART_CANCELLED", "ADMIN_RESTART_FAILED"] {
                let notice = failure_notice(code, locale);
                assert!(notice.contains(code));
                assert!(notice.len() > failure_snapshot(code).to_string().len());
            }
            let language = if locale == "fil-PH" { "tl" } else { locale };
            let catalog: serde_json::Value = serde_json::from_str(include_str!("launch-notices.json")).unwrap();
            for key in ["elevation", "voice", "cancelled", "adminFailed"] {
                assert!(!catalog[language][key].as_str().unwrap().is_empty());
            }
        }
        SPAWN_FAILURE.with(|slot| slot.borrow_mut().take());
    }

    #[test]
    fn spawn_failure_retains_os_code_without_private_error_text() {
        let code = game_spawn_failure(std::io::Error::from_raw_os_error(740));
        let frame = failure_frame(&code);
        assert_eq!(frame["code"], "GAME_SPAWN_FAILED");
        assert_eq!(frame["osError"], 740);
        assert_eq!(frame["elevated"], serde_json::json!(process_elevated()));
        assert!(frame["errorKind"].is_string());
        assert!(failure_frame(&code).get("osError").is_none());

        game_spawn_failure(std::io::Error::new(std::io::ErrorKind::PermissionDenied, "private path and token"));
        let frame = failure_frame("GAME_SPAWN_FAILED");
        assert_eq!(frame["errorKind"], "PermissionDenied");
        assert!(frame["osError"].is_null());
        assert!(!frame.to_string().contains("private"));

        game_spawn_failure(std::io::Error::from_raw_os_error(5));
        assert!(failure_frame("NATIVE_INSTALL_FAILED").get("osError").is_none());
    }

    #[cfg(windows)]
    #[test]
    fn real_windows_spawn_errors_reach_the_failure_frame() {
        let root = env::temp_dir().join(format!("16c-spawn-{}", uuid::Uuid::new_v4()));
        fs::create_dir(&root).unwrap();
        let executable = root.join("fixture.exe");
        for invalid_image in [false, true] {
            if invalid_image {
                fs::write(&executable, b"deliberately invalid executable").unwrap();
            }
            let error = Command::new(&executable).spawn().unwrap_err();
            let actual = error.raw_os_error().unwrap();
            if invalid_image {
                // Windows may classify the bytes as an invalid PE image or
                // as an unsupported legacy executable for this machine.
                assert!(matches!(actual, 193 | 216), "unexpected OS error: {actual}");
            } else {
                assert_eq!(actual, 2);
            }
            let code = game_spawn_failure(error);
            let frame = failure_frame(&code);
            assert_eq!(frame["osError"], actual);
            assert_eq!(frame["code"], "GAME_SPAWN_FAILED");
            assert!(!frame.to_string().contains("fixture.exe"));
        }
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn failure_codes_survive_compatibility_handoff_without_echoing_details() {
        assert_eq!(failure_code("Device authorization check failed"), "DEVICE_CHECK_FAILED");
        assert_eq!(failure_code("DEVICE_CHECK_FAILED"), "DEVICE_CHECK_FAILED");
        for code in ["STICKER_REQUEST_FAILED", "STICKER_PREPARATION_FAILED", "ASSET_PREPARATION_FAILED", "NATIVE_RECOVERY_FAILED", "WINDOWS_HELPER_DOWNLOAD_FAILED", "COMPATIBILITY_CACHE_FAILED", "STEAM_RUNTIME_FAILED", "GAME_PROCESS_NOT_FOUND", "GAME_CLIENT_NOT_LOADED"] {
            assert_eq!(failure_code(code), code);
        }
        assert_eq!(failure_code("Close the existing Counter-Strike game before starting a managed session"), "GAME_ALREADY_RUNNING");
        assert_eq!(failure_code("secret token or private backend body"), "PREPARATION_FAILED");
        assert_eq!(preparation_error("private path and token", "NATIVE_BUNDLE_FAILED"), "NATIVE_BUNDLE_FAILED");
        assert_eq!(preparation_error("NATIVE_RECOVERY_FAILED", "NATIVE_SESSION_FAILED"), "NATIVE_RECOVERY_FAILED");
        assert_eq!(preparation_error("private token", "private step"), "PREPARATION_FAILED");
    }
    #[test]
    fn cleanup_diagnostics_preserve_both_failures_and_are_consumed() {
        record_cleanup_failures(&Err("NATIVE_INSTALL_FAILED".into()), &[
            ("NATIVE_CLEANUP_FAILED", Err("C:\\private\\session".into())),
            ("INSPECTOR_STOP_FAILED", Err("secret backend body".into())),
        ]);
        let frame = failure_frame("NATIVE_INSTALL_FAILED");
        assert_eq!(frame["code"], "NATIVE_INSTALL_FAILED");
        assert_eq!(frame["originalCode"], "NATIVE_INSTALL_FAILED");
        assert_eq!(frame["cleanupCodes"], "NATIVE_CLEANUP_FAILED INSPECTOR_STOP_FAILED");
        assert!(!frame.to_string().contains("private"));
        assert!(!frame.to_string().contains("secret"));
        assert!(failure_frame("DEVICE_CHECK_FAILED").get("cleanupCodes").is_none());
    }
    #[test]
    fn preparation_checks_reach_reports_without_private_error_details() {
        for code in ["INSTALLATION_SELECTION_FAILED", "NATIVE_ROOT_INVALID", "NATIVE_CLIENT_CHECK_FAILED", "NATIVE_CLEANUP_FAILED", "VOICE_OWNERSHIP_FAILED", "NATIVE_LEASE_FAILED", "SETTINGS_READ_FAILED", "SETTINGS_WRITE_FAILED", "LAUNCH_ARGUMENTS_FAILED", "NATIVE_HANDOFF_FAILED", "GTPROTECTOR_COMPATIBILITY_FAILED"] {
            let error = preparation_error("C:\\private\\game: secret token", code);
            let frame = failure_frame(&error);
            assert_eq!(frame["code"], code);
            assert!(!frame.to_string().contains("private"));
            assert!(!frame.to_string().contains("secret"));
        }
        assert_eq!(failure_code("Native module integrity check failed"), "NATIVE_INTEGRITY_FAILED");
    }
    #[test]
    fn sticker_failures_keep_the_specific_reason_across_handoffs() {
        for code in [
            "STICKER_RECIPE_INVALID", "STICKER_RECIPE_HASH_MISMATCH",
            "STICKER_SOURCE_FAILED", "STICKER_SOURCE_HASH_MISMATCH",
            "STICKER_ARTWORK_REQUEST_FAILED", "STICKER_ARTWORK_HASH_MISMATCH",
            "STICKER_IMAGE_INVALID", "STICKER_BAKE_FAILED", "STICKER_BAKE_TIMEOUT", "STICKER_CACHE_FAILED",
            "STICKER_SESSION_WRITE_FAILED", "STICKER_TIMEOUT",
        ] {
            let error = preparation_error(code, "STICKER_PREPARATION_FAILED");
            let frame = failure_frame(&error);
            assert_eq!(frame["code"], code);
            assert_eq!(failure_code(&error), code);
        }
        for (error, expected) in [
            ("Sticker preparation timed out", "STICKER_TIMEOUT"),
            ("Sticker recipe hash mismatch", "STICKER_RECIPE_HASH_MISMATCH"),
            ("Sticker source hash mismatch", "STICKER_SOURCE_HASH_MISMATCH"),
            ("Sticker artwork hash mismatch", "STICKER_ARTWORK_HASH_MISMATCH"),
        ] {
            assert_eq!(preparation_error(error, "STICKER_PREPARATION_FAILED"), expected);
        }
        let error = preparation_error("C:\\private\\file: secret bearer", "STICKER_SOURCE_FAILED");
        assert_eq!(failure_frame(&error)["code"], "STICKER_SOURCE_FAILED");
        assert!(!failure_frame(&error).to_string().contains("private"));
    }
    #[test]
    fn compatibility_progress_keeps_validation_and_readiness_separate() {
        assert!(forward_progress(&serde_json::json!({"protocol":1,"event":"progress","phase":"sticker_bake","completed":1,"total":3})).unwrap());
        assert!(!forward_progress(&serde_json::json!({"protocol":1,"event":"ready"})).unwrap());
        for (phase, completed, total) in [("ready",0,0), ("assets",2,1), ("secret",0,1), ("assets",0,20001)] {
            assert!(forward_progress(&serde_json::json!({"protocol":1,"event":"progress","phase":phase,"completed":completed,"total":total})).is_err());
        }
    }
    #[test]
    fn handoff_needs_commit_and_parent_exit_before_ownership() {
        let (tx, rx) = mpsc::sync_channel(3);
        tx.send(Some(br#"{"commit":true}"#.to_vec())).unwrap();
        tx.send(None).unwrap();
        let mut output = Vec::new();
        accept_handoff(&rx, &mut output, Duration::from_millis(10), false).unwrap();
        let frames: Vec<serde_json::Value> = String::from_utf8(output)
            .unwrap()
            .lines()
            .map(|line| serde_json::from_str(line).unwrap())
            .collect();
        assert_eq!(
            frames,
            vec![
                serde_json::json!({"event":"ready","protocol":1}),
                serde_json::json!({"event":"committed","protocol":1})
            ]
        );
    }

    #[test]
    fn handoff_rejects_missing_commit_invalid_commit_and_parent_remaining_alive() {
        for frames in [
            vec![None],
            vec![Some(br#"{"commit":false}"#.to_vec()), None],
            vec![Some(br#"{"commit":true,"extra":1}"#.to_vec()), None],
            vec![Some(br#"{"commit":true}"#.to_vec())],
            vec![
                Some(br#"{"commit":true}"#.to_vec()),
                Some(b"unexpected".to_vec()),
            ],
        ] {
            let (tx, rx) = mpsc::sync_channel(3);
            for frame in frames {
                tx.send(frame).unwrap();
            }
            assert!(
                accept_handoff(&rx, &mut Vec::new(), Duration::from_millis(10), false).is_err()
            );
        }
    }

    #[test]
    fn retained_launcher_requires_explicit_release_not_eof() {
        for (release, valid) in [
            (Some(br#"{"release":true}"#.to_vec()), true),
            (None, false),
            (Some(br#"{"stop":true}"#.to_vec()), false),
        ] {
            let (tx, rx) = mpsc::sync_channel(3);
            tx.send(Some(br#"{"commit":true}"#.to_vec())).unwrap();
            tx.send(release).unwrap();
            assert_eq!(
                accept_handoff(&rx, &mut Vec::new(), Duration::from_millis(10), true).is_ok(),
                valid
            );
        }
    }

    #[test]
    fn broken_launcher_output_cannot_commit_a_session() {
        struct Closed;
        impl Write for Closed {
            fn write(&mut self, _: &[u8]) -> std::io::Result<usize> {
                Err(std::io::ErrorKind::BrokenPipe.into())
            }
            fn flush(&mut self) -> std::io::Result<()> {
                Ok(())
            }
        }
        let (_tx, rx) = mpsc::sync_channel(3);
        assert!(accept_handoff(&rx, &mut Closed, Duration::from_millis(10), false).is_err());
    }

    #[cfg(unix)]
    #[test]
    fn reopen_starts_a_real_process_with_clean_environment() {
        use std::os::unix::fs::PermissionsExt;
        let directory = env::temp_dir().join(format!("16c-reopen-{}", uuid::Uuid::new_v4()));
        fs::create_dir(&directory).unwrap();
        let executable = directory.join("launcher");
        let marker = directory.join("reopened");
        fs::write(&executable, b"#!/bin/sh\ntest -z \"$LD_PRELOAD$PAPAMO_SKIN_PROBE_SESSION$ELECTRON_RUN_AS_NODE\" || exit 1\nprintf reopened > \"$1\"\n").unwrap();
        fs::set_permissions(&executable, fs::Permissions::from_mode(0o700)).unwrap();
        let reopen = Reopen {
            sha256: executable_hash(&executable).unwrap(),
            executable,
            args: vec![marker.to_string_lossy().into_owned()],
        };
        reopen.launch().unwrap();
        let deadline = std::time::Instant::now() + Duration::from_secs(2);
        while !marker.exists() && std::time::Instant::now() < deadline {
            std::thread::sleep(Duration::from_millis(10));
        }
        assert_eq!(fs::read_to_string(marker).unwrap(), "reopened");
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn reopening_rejects_changed_launcher_and_unsafe_arguments() {
        let path = env::temp_dir().join(format!("16c-reopen-{}", uuid::Uuid::new_v4()));
        fs::write(&path, b"approved launcher").unwrap();
        let mut reopen = Reopen {
            executable: path.clone(),
            sha256: executable_hash(&path).unwrap(),
            args: vec![],
        };
        reopen.validate().unwrap();
        reopen.args.push("bad\0argument".into());
        assert!(reopen.validate().is_err());
        reopen.args.clear();
        fs::write(&path, b"changed launcher").unwrap();
        assert!(reopen.validate().is_err());
        fs::remove_file(path).unwrap();
    }
}
