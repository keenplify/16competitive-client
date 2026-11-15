//! Separate, temporary WON adapter. CS 1.6 persistence does not apply here.
#![cfg(windows)]
use crate::{native_bundle::NativeBundle, windows_native::{digest, ordinary_directory, read_limited, write_new}};
use std::{fs, io::{BufRead, BufReader, Read}, path::{Path, PathBuf}, process::{Child, Command, Stdio}, sync::mpsc, time::Duration};
use std::os::windows::process::CommandExt;
use serde_json::json;
const CLIENT: &str = "71fdbe140df3598a74738537b924141f4fb4b0b828737bd99a7223d9e4549460";
const ENGINES: [&str; 2] = ["525c1a32a520bbde8857e8dc3ed1e5bbc8b2ef5620bc6cdbcdbc72c34542bace", "b5f34ed4726d93a9c3d4b3d3eb60df5680f5ae888710f5461e54a462e1efd487"];
const OPENGL: &str = "c047cd0f87f379fe3d24d7f2e07241eb11d590211157be5a527bc9d9f295e922";
fn repair_error(error: std::io::Error) -> String {
    if matches!(error.raw_os_error(), Some(5 | 32 | 33 | 740)) {
        "WON_REPAIR_ELEVATION_REQUIRED".into()
    } else { format!("WON installation could not be prepared: {error}") }
}

/// Explicit match launch authorizes replacement of this exact supported game.
/// No recursive attribute changes, ACL rewriting, or arbitrary game-file repair.
pub(crate) fn prepare_launch(root: &Path, game: &str) -> Result<(), String> {
    use std::os::windows::fs::{MetadataExt, OpenOptionsExt};
    if !matches!(game, "cstrike" | "cstrk13") { return Err("Invalid WON mod directory".into()); }
    for directory in [root.to_path_buf(), root.join(game), root.join(game).join("cl_dlls")] {
        for ancestor in directory.ancestors() { ordinary_directory(ancestor)?; }
    }
    if digest(&read_limited(&root.join(game).join("cl_dlls/client.dll"), 32*1024*1024)?) != CLIENT
        || !ENGINES.contains(&digest(&read_limited(&root.join("hl.exe"), 32*1024*1024)?).as_str())
        || digest(&read_limited(&root.join("hw.dll"), 32*1024*1024)?) != OPENGL {
        return Err("Unsupported WON installation; automatic repair refused".into());
    }
    crate::owned_game::Startup::prepare_replacing(&root.join("hl.exe"), &root.join(game))?;
    let engine = root.join("hw.dll");
    if fs::metadata(&engine).map_err(repair_error)?.permissions().readonly() {
        // Retain and validate the opened file: never follow a replacement reparse
        // point or clear attributes on a file that changed since inspection.
        let mut file = fs::OpenOptions::new().read(true).access_mode(0x80000000 | 0x100)
            .custom_flags(0x00200000).open(&engine).map_err(repair_error)?;
        let metadata = file.metadata().map_err(repair_error)?;
        if !metadata.is_file() || metadata.file_attributes() & 0x400 != 0 || metadata.len() > 32*1024*1024 {
            return Err("Invalid WON engine for automatic repair".into());
        }
        let mut bytes = Vec::new();
        (&mut file).take(32*1024*1024 + 1).read_to_end(&mut bytes).map_err(repair_error)?;
        if digest(&bytes) != OPENGL { return Err("WON engine changed before automatic repair".into()); }
        let mut permissions = metadata.permissions();
        permissions.set_readonly(false);
        file.set_permissions(permissions).map_err(repair_error)?;
    }
    // Request replacement rights without deleting/renaming anything. A process
    // outside the selected game may still hold the engine; never kill that process.
    let probe = fs::OpenOptions::new().access_mode(0x10000).share_mode(7)
        .custom_flags(0x00200000).open(&engine).map_err(repair_error)?;
    drop(probe);
    for directory in [root.to_path_buf(), root.join(game), root.join(game).join("cl_dlls")] {
        let path = directory.join(format!(".16competitive-won-{}.tmp", uuid::Uuid::new_v4()));
        let file = fs::OpenOptions::new().write(true).create_new(true).open(&path).map_err(repair_error)?;
        drop(file);
        fs::remove_file(path).map_err(repair_error)?;
    }
    Ok(())
}
pub struct WonInstall { root: PathBuf, helper: PathBuf, id: String, guard: Option<Child> }
fn recovery_failure(mode: &str, code: Option<i32>, stderr: &[u8]) -> String {
    // Report fixed categories only. Never forward paths, auth data or arbitrary
    // subprocess output into the UI or submitted diagnostics.
    let text = String::from_utf8_lossy(stderr);
    let reason = if text.contains("unsupported WON OpenGL engine") { "unsupported engine" }
        else if text.contains("invalid recovery descriptor schema") { "invalid descriptor" }
        else if text.contains("invalid cosmetic recovery mod directory") { "invalid mod directory" }
        else if text.contains("invalid recovery authentication metadata") { "invalid authentication metadata" }
        else if text.contains("cosmetic recovery helper identity changed") { "helper identity changed" }
        else if text.contains("cosmetic recovery session changed") { "session changed" }
        else if text.contains("invalid cosmetic recovery state") { "invalid recovery state" }
        else if text.contains("os error 32)") { "game file is in use" }
        else if text.contains("os error 33)") { "game file is locked" }
        else if text.contains("os error 5)") { "game file access denied" }
        else { "helper failed" };
    format!("WON recovery failed ({mode}, exit {code:?}: {reason}); installation retained for inspection")
}
impl WonInstall {
    fn command(&self, mode: &str) -> Command {
        let mut c = Command::new(&self.helper);
        c.args(["--cosmetic-recovery"]).arg(&self.root).arg(&self.id)
            .arg(std::process::id().to_string()).arg(mode)
            .stdin(Stdio::null()).stderr(Stdio::null()).creation_flags(0x08000000);
        c
    }
    fn run(&self, mode: &str) -> Result<(), String> {
        let mut child = self.command(mode).stdout(Stdio::null()).stderr(Stdio::piped()).spawn().map_err(|e| e.to_string())?;
        let stderr = child.stderr.take().ok_or("WON recovery error stream unavailable")?;
        let (tx, rx) = mpsc::channel();
        std::thread::spawn(move || {
            let mut bytes = Vec::new();
            let _ = stderr.take(4096).read_to_end(&mut bytes);
            let _ = tx.send(bytes);
        });
        let start = std::time::Instant::now();
        loop {
            if let Some(status) = child.try_wait().map_err(|e| e.to_string())? {
                return if status.success() { Ok(()) } else {
                    let bytes = rx.recv_timeout(Duration::from_millis(100)).unwrap_or_default();
                    Err(recovery_failure(mode, status.code(), &bytes))
                };
            }
            if start.elapsed() > Duration::from_secs(30) { let _ = child.kill(); let _ = child.wait(); return Err("WON recovery timed out".into()); }
            std::thread::sleep(Duration::from_millis(50));
        }
    }
    pub fn install(root: &Path, game: &str, bundle: &NativeBundle, auth: &(PathBuf, String)) -> Result<Self, String> {
        if !matches!(game, "cstrike" | "cstrk13") { return Err("Invalid WON mod directory".into()); }
        bundle.verify_modules()?;
        for path in [root.to_path_buf(), root.join(game), root.join(game).join("cl_dlls")] { ordinary_directory(&path)?; }
        let original = read_limited(&root.join(game).join("cl_dlls/client.dll"), 32*1024*1024)?;
        if digest(&original) != CLIENT || !ENGINES.contains(&digest(&read_limited(&root.join("hl.exe"), 32*1024*1024)?).as_str()) {
            return Err("Unsupported WON client and executable pair".into());
        }
        // Recovery verifies and applies the exact approved hw.dll transformation.
        let managed = root.join("16competitive");
        if managed.exists() { ordinary_directory(&managed)?; } else { fs::create_dir(&managed).map_err(|e| e.to_string())?; }
        for name in ["cosmetic-install.json", "nextclient-install.json", "recovery.json", "won-hw.original.dll", "won-hw.pending.dll"] {
            if managed.join(name).exists() { return Err("Existing WON installation needs recovery before launch".into()); }
        }
        let module = read_limited(&bundle.module, 32*1024*1024)?;
        let marker = b"papamo_won_native_board_v1";
        if !module.windows(marker.len()).any(|w| w == marker) { return Err("Approved native bundle needs WON scoreboard support".into()); }
        let music = b"papamo_won_local_music_v1";
        if !module.windows(music.len()).any(|w| w == music) { return Err("Approved native bundle needs WON local music support".into()); }
        let destination = root.join(game).join("cl_dlls/16cmod.dll");
        let temporary = root.join(game).join("cl_dlls/16cmod.dll.16competitive.tmp");
        if destination.exists() || temporary.exists() { return Err("Existing WON module needs inspection".into()); }
        let helper_sha256 = digest(&read_limited(&bundle.inspector,32*1024*1024)?);
        let auth_name = auth.0.file_name().and_then(|v|v.to_str()).ok_or("Invalid WON auth path")?;
        let backup = root.join("client_original.dll");
        let owns_backup = !backup.exists();
        if owns_backup { write_new(&backup, &original)?; }
        else if read_limited(&backup,32*1024*1024)? != original { return Err("WON original backup mismatch".into()); }
        let mut install = Self { root: root.into(), helper: bundle.inspector.clone(), id: uuid::Uuid::new_v4().to_string(), guard: None };
        let journal = managed.join("cosmetic-install.json");
        let descriptor = managed.join("recovery.json");
        let record = json!({"originalSha256": CLIENT, "moduleSha256": digest(&module), "ownsBackup": owns_backup, "wonLoader": true});
        if let Err(e) = write_new(&journal, record.to_string().as_bytes()) {
            if owns_backup { let _ = fs::remove_file(&backup); } return Err(e);
        }
        let state = json!({"helperPath": install.helper, "helperSha256": helper_sha256,
            "sessionId": install.id, "gameDirectory": game,
            "authFile": {"name": auth_name, "sha256": digest(auth.1.as_bytes())}});
        if let Err(e) = write_new(&descriptor, state.to_string().as_bytes()) {
            let _ = fs::remove_file(&journal); if owns_backup { let _ = fs::remove_file(&backup); } return Err(e);
        }
        let result = (|| {
            let mut guard = install.command("guard").stdout(Stdio::piped()).spawn().map_err(|e| e.to_string())?;
            let stdout = guard.stdout.take().ok_or("WON guard output unavailable")?;
            let (tx, rx) = mpsc::channel();
            std::thread::spawn(move || { let mut line = String::new(); let result = BufReader::new(stdout).take(128).read_line(&mut line).map(|_|line); let _ = tx.send(result); });
            install.guard = Some(guard);
            if rx.recv_timeout(Duration::from_secs(5)).map_err(|_|"WON guard timed out")?.map_err(|e|e.to_string())?.trim() != "16c-recovery-ready" { return Err("WON guard failed".into()); }
            write_new(&temporary, &module)?;
            install.run("prepare-won")
        })();
        if let Err(e) = result { let _ = install.restore(); return Err(e); }
        Ok(install)
    }
    pub fn restore(&mut self) -> Result<(), String> {
        self.run("restore")?;
        if let Some(mut guard) = self.guard.take() { let _ = guard.kill(); let _ = guard.wait(); }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::recovery_failure;
    #[test]
    #[ignore = "requires an explicitly selected, supported WON fixture"]
    fn supported_won_install_with_authentication_and_live_guard() {
        use super::*;
        let source = PathBuf::from(std::env::var_os("SIXTEEN_WON_TEST_ROOT").expect("explicit fixture root"));
        let bundle_root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../resources/native/win-x64");
        let bundle = NativeBundle {
            inspector: bundle_root.join("game-inspector.exe"),
            module: bundle_root.join("papamo-cosmetic-module-win-x86.dll"),
            next_client: Some(bundle_root.join("papamo-nextclient-client-mini-win-x86.dll")),
        };
        bundle.verify_modules().unwrap();
        bundle.verify_inspector().unwrap();
        assert!(bundle.verify_approval().is_ok(), "signed native bundle requires backend approval");
        for game in ["cstrike", "cstrk13"] {
          for condition in ["normal", "locked-engine", "readonly-folders", "readonly-engine", "unknown-readonly-engine"] {
            let root = std::env::temp_dir().join(format!("16c-won-full-{}", uuid::Uuid::new_v4())).join("Game Files");
            let dlls = root.join(game).join("cl_dlls");
            fs::create_dir_all(&dlls).unwrap();
            // Exact selected binaries only; no player configuration is accessed.
            for name in ["hl.exe", "hw.dll"] {
                fs::copy(source.join(name), root.join(name)).unwrap();
            }
            fs::copy(source.join("cstrk13/cl_dlls/client.dll"), dlls.join("client.dll")).unwrap();
            let auth_path = root.join(game).join("16c13_0123456789abcdef.cfg");
            let auth_contents = "// isolated recovery fixture; no live credentials\n".to_owned();
            fs::write(&auth_path, &auth_contents).unwrap();
            let original = fs::read(root.join("hw.dll")).unwrap();
            if condition == "readonly-folders" {
                for directory in [&root, &root.join(game), &dlls] {
                    let mut permissions = fs::metadata(directory).unwrap().permissions();
                    permissions.set_readonly(true);
                    fs::set_permissions(directory, permissions).unwrap();
                }
            }
            if condition == "unknown-readonly-engine" {
                fs::write(root.join("hw.dll"), b"unknown player engine").unwrap();
            }
            if matches!(condition, "readonly-engine" | "unknown-readonly-engine") {
                let mut permissions = fs::metadata(root.join("hw.dll")).unwrap().permissions();
                permissions.set_readonly(true);
                fs::set_permissions(root.join("hw.dll"), permissions).unwrap();
            }
            if condition == "unknown-readonly-engine" {
                assert!(prepare_launch(&root, game).unwrap_err().contains("automatic repair refused"));
                assert!(fs::metadata(root.join("hw.dll")).unwrap().permissions().readonly());
                assert_eq!(fs::read(root.join("hw.dll")).unwrap(), b"unknown player engine");
                continue;
            }
            use std::os::windows::fs::OpenOptionsExt;
            let engine_handle = if condition == "locked-engine" {
                Some(fs::OpenOptions::new().read(true).share_mode(1).open(root.join("hw.dll")).unwrap())
            } else { None };
            if condition == "locked-engine" {
                // This handle belongs to the test, not the exact game process.
                // Automatic repair must not kill arbitrary file-lock owners.
                assert_eq!(prepare_launch(&root, game).unwrap_err(), "WON_REPAIR_ELEVATION_REQUIRED");
                assert_eq!(fs::read(root.join("hw.dll")).unwrap(), original);
                assert!(!root.join("16competitive/recovery.json").exists());
                println!("PASSED foreign-lock refusal before installation ({game}); fixture {}", root.display());
                drop(engine_handle);
                continue;
            }
            prepare_launch(&root, game).unwrap();
            assert!(!fs::metadata(root.join("hw.dll")).unwrap().permissions().readonly());
            let mut install = WonInstall::install(&root, game, &bundle, &(auth_path.clone(), auth_contents))
                .unwrap_or_else(|error| panic!("WON install failed for {game}: {error}; evidence {}", root.display()));
            assert!(dlls.join("16cmod.dll").exists());
            assert_ne!(fs::read(root.join("hw.dll")).unwrap(), original);
            install.restore().unwrap();
            assert_eq!(fs::read(root.join("hw.dll")).unwrap(), original);
            assert!(!auth_path.exists());
            assert!(!dlls.join("16cmod.dll").exists());
            println!("PASSED {condition} ({game}); retained fixture: {}", root.display());
          }
        }
    }
    #[test]
    fn recovery_failure_identifies_the_rejected_contract_without_raw_output() {
        let message = recovery_failure("prepare-won", Some(1), b"cosmetic recovery failed: invalid recovery authentication metadata; private-token");
        assert!(message.contains("prepare-won, exit Some(1): invalid authentication metadata"));
        assert!(message.contains("installation retained for inspection"));
        assert!(!message.contains("private-token"));
    }
    #[test]
    fn unknown_recovery_output_is_never_forwarded() {
        let message = recovery_failure("restore", None, b"private-path private-password private-token");
        assert!(message.contains("restore, exit None: helper failed"));
        assert!(!message.contains("private-"));
    }
    #[test]
    fn windows_file_errors_are_classified_without_leaking_paths() {
        let message = recovery_failure("prepare-won", Some(2), b"private-path: Access is denied. (os error 5)");
        assert!(message.contains("game file access denied"));
        assert!(!message.contains("private-path"));
        assert!(recovery_failure("prepare-won", Some(2), b"unrelated error (os error 50)").contains("helper failed"));
    }
}
