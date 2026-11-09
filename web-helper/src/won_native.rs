//! Separate, temporary WON adapter. CS 1.6 persistence does not apply here.
#![cfg(windows)]
use crate::{native_bundle::NativeBundle, windows_native::{digest, ordinary_directory, read_limited, write_new}};
use std::{fs, io::{BufRead, BufReader, Read}, path::{Path, PathBuf}, process::{Child, Command, Stdio}, sync::mpsc, time::Duration};
use std::os::windows::process::CommandExt;
use serde_json::json;
const CLIENT: &str = "71fdbe140df3598a74738537b924141f4fb4b0b828737bd99a7223d9e4549460";
const ENGINES: [&str; 2] = ["525c1a32a520bbde8857e8dc3ed1e5bbc8b2ef5620bc6cdbcdbc72c34542bace", "b5f34ed4726d93a9c3d4b3d3eb60df5680f5ae888710f5461e54a462e1efd487"];
pub struct WonInstall { root: PathBuf, helper: PathBuf, id: String, guard: Option<Child> }
impl WonInstall {
    fn command(&self, mode: &str) -> Command {
        let mut c = Command::new(&self.helper);
        c.args(["--cosmetic-recovery"]).arg(&self.root).arg(&self.id)
            .arg(std::process::id().to_string()).arg(mode)
            .stdin(Stdio::null()).stderr(Stdio::null()).creation_flags(0x08000000);
        c
    }
    fn run(&self, mode: &str) -> Result<(), String> {
        let mut child = self.command(mode).stdout(Stdio::null()).spawn().map_err(|e| e.to_string())?;
        let start = std::time::Instant::now();
        loop {
            if let Some(status) = child.try_wait().map_err(|e| e.to_string())? {
                return if status.success() { Ok(()) } else { Err("WON recovery failed; installation retained for inspection".into()) };
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
