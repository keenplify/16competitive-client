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
    settings: settings_bridge::NativePreferences,
    reopen: Option<Reopen>,
    #[serde(default)]
    keep_launcher_open: bool,
    #[serde(default)]
    preferences_source: Option<PathBuf>,
    #[serde(default)]
    asset_config_home: Option<PathBuf>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Reopen {
    executable: PathBuf,
    sha256: String,
    args: Vec<String>,
}

fn executable_hash(path: &Path) -> Result<String, String> {
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
    fn validate(&self) -> Result<(), String> {
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
    fn launch(&self) -> Result<(), String> {
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
        "NATIVE_RECOVERY_FAILED" => "NATIVE_RECOVERY_FAILED",
        "Wine path conversion timed out" | "Wine output timed out" => "COMPATIBILITY_PATH_FAILED",
        "Could not obtain the signed Windows session helper" | "Could not download Windows session helper" | "WINDOWS_HELPER_DOWNLOAD_FAILED" => "WINDOWS_HELPER_DOWNLOAD_FAILED",
        "Native inspector integrity check failed" | "NATIVE_INTEGRITY_FAILED" => "NATIVE_INTEGRITY_FAILED",
        "Invalid compatibility cache root" | "COMPATIBILITY_CACHE_FAILED" => "COMPATIBILITY_CACHE_FAILED",
        "NATIVE_INSTALL_FAILED" => "NATIVE_INSTALL_FAILED",
        "STICKER_REQUEST_FAILED" => "STICKER_REQUEST_FAILED",
        "STICKER_PREPARATION_FAILED" => "STICKER_PREPARATION_FAILED",
        "ASSET_PREPARATION_FAILED" => "ASSET_PREPARATION_FAILED",
        "STARTUP_CONFIG_FAILED" => "STARTUP_CONFIG_FAILED",
        value if value.starts_with("Sticker cache") => "STICKER_CACHE_FAILED",
        "STICKER_CACHE_FAILED" => "STICKER_CACHE_FAILED",
        _ => "PREPARATION_FAILED",
    }
}

pub(crate) fn report_failure(error: &str) {
    let mut output = std::io::stdout().lock();
    let _ = writeln!(output, "{}", serde_json::json!({"protocol":1,"event":"error","code":failure_code(error)}));
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
    let (root, _, _) =
        validate_installation(&request.installation, "cs16").ok_or("Invalid game installation")?;
    let mut preferences = settings_bridge::load()?;
    preferences.cs16 = Some(root);
    preferences.settings = request.settings;
    preferences.settings.lightweight_hud = true;
    settings_bridge::save(&preferences)?;
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
    fn failure_codes_survive_compatibility_handoff_without_echoing_details() {
        assert_eq!(failure_code("Device authorization check failed"), "DEVICE_CHECK_FAILED");
        assert_eq!(failure_code("DEVICE_CHECK_FAILED"), "DEVICE_CHECK_FAILED");
        for code in ["STICKER_REQUEST_FAILED", "STICKER_PREPARATION_FAILED", "ASSET_PREPARATION_FAILED", "NATIVE_RECOVERY_FAILED", "WINDOWS_HELPER_DOWNLOAD_FAILED", "COMPATIBILITY_CACHE_FAILED"] {
            assert_eq!(failure_code(code), code);
        }
        assert_eq!(failure_code("Close the existing Counter-Strike game before starting a managed session"), "GAME_ALREADY_RUNNING");
        assert_eq!(failure_code("secret token or private backend body"), "PREPARATION_FAILED");
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
