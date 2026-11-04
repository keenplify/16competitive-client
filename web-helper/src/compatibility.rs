//! Linux delegates Windows game ownership to the same Rust supervisor under
//! Steam's selected Proton runtime (or Wine). No Electron runtime participates.
#![cfg(target_os = "linux")]
use crate::*;
use std::io::{BufRead, BufReader, Read};

fn command(runtime: Option<&steam_proton::Runtime>, executable: &Path) -> Command {
    let mut command = if let Some(runtime) = runtime {
        let mut command = Command::new(&runtime.proton);
        command
            .arg("runinprefix")
            .arg(executable)
            .env("STEAM_COMPAT_DATA_PATH", &runtime.data)
            .env("STEAM_COMPAT_CLIENT_INSTALL_PATH", &runtime.steam)
            .env("SteamAppId", "10")
            .env("SteamGameId", "10")
            .env("PROTON_LOG", "0")
            .env("COMPETITIVE16_NATIVE_STEAM", "1");
        command
    } else {
        let mut command = Command::new("wine");
        command.arg(executable);
        command
    };
    command
        .env_remove("LD_PRELOAD")
        .env_remove("PAPAMO_SKIN_PROBE_SESSION");
    command
}
fn windows_path(runtime: Option<&steam_proton::Runtime>, path: &Path) -> Result<String, String> {
    if !path.is_absolute() || path.to_string_lossy().contains(['\0', '\r', '\n']) {
        return Err("Invalid compatibility path".into());
    }
    let mut command = if runtime.is_some() {
        command(runtime, Path::new("winepath.exe"))
    } else {
        Command::new("winepath")
    };
    let mut child = command
        .arg("-w")
        .arg(path)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|_| "Wine path conversion failed")?;
    let output = child.stdout.take().ok_or("Wine output unavailable")?;
    let (tx, rx) = std::sync::mpsc::sync_channel(1);
    std::thread::spawn(move || {
        let mut bytes = Vec::new();
        let result = output.take(4097).read_to_end(&mut bytes).map(|_| bytes);
        let _ = tx.send(result);
    });
    let deadline = std::time::Instant::now() + Duration::from_secs(30);
    let status = loop {
        if let Some(status) = child.try_wait().map_err(|_| "Wine status unavailable")? {
            break status;
        }
        if std::time::Instant::now() >= deadline {
            let _ = child.kill();
            let _ = child.wait();
            return Err("Wine path conversion timed out".into());
        }
        std::thread::sleep(Duration::from_millis(50));
    };
    let bytes = rx
        .recv_timeout(Duration::from_secs(1))
        .map_err(|_| "Wine output timed out")?
        .map_err(|_| "Wine output unavailable")?;
    let value = String::from_utf8(bytes).map_err(|_| "Invalid Wine path")?;
    let value = value.trim();
    if !status.success()
        || value.len() > 4096
        || value.contains(['\0', '\r', '\n'])
        || value.as_bytes().get(1) != Some(&b':')
    {
        return Err("Invalid Wine path".into());
    }
    Ok(value.into())
}

pub fn launch(
    connection: &Connection,
    api: &str,
    token: &str,
    root: &Path,
    runtime: Option<&steam_proton::Runtime>,
    ready: &mut dyn FnMut() -> Result<(), String>,
) -> Result<(), String> {
    launch_target(
        &connection.match_id,
        serde_json::json!({"matchId":connection.match_id}),
        api,
        token,
        root,
        runtime,
        ready,
    )
}
pub fn launch_partner(
    launch: &partner::Launch,
    api: &str,
    token: &str,
    root: &Path,
    runtime: Option<&steam_proton::Runtime>,
    ready: &mut dyn FnMut() -> Result<(), String>,
) -> Result<(), String> {
    launch_target(
        &launch.server_id,
        serde_json::json!({"partner":launch}),
        api,
        token,
        root,
        runtime,
        ready,
    )
}
fn launch_target(
    source_id: &str,
    target: serde_json::Value,
    api: &str,
    token: &str,
    root: &Path,
    runtime: Option<&steam_proton::Runtime>,
    ready: &mut dyn FnMut() -> Result<(), String>,
) -> Result<(), String> {
    if runtime.is_some() {
        start_steam_client()?;
    }
    let directory = user_config_dir()?;
    let voice = session_mode::VoiceOwnership::start(&directory, source_id)?;
    let _lease = session_mode::Lease::native_wait(&directory)?;
    let bundle = native_bundle::prepare(&directory)?;
    if inspector::check_device(&bundle, api)?["banned"] == true {
        return Err("This device cannot join competitive matches".into());
    }
    let helper = self_update::windows_supervisor()?;
    let installation = windows_path(runtime, root)?;
    let source = windows_path(runtime, &preference_path()?)?;
    let agent = ureq::AgentBuilder::new()
        .redirects(0)
        .timeout(Duration::from_secs(10))
        .build();
    let handoff: serde_json::Value = agent
        .post(&format!("{api}/auth/web-handoff/"))
        .set("Authorization", &format!("Bearer {token}"))
        .send_json(serde_json::json!({}))
        .map_err(|_| "Could not authorize the Windows session supervisor")?
        .into_json()
        .map_err(|_| "Invalid compatibility authorization")?;
    let handoff = handoff["token"]
        .as_str()
        .filter(|value| {
            (32..=128).contains(&value.len())
                && value
                    .bytes()
                    .all(|c| c.is_ascii_alphanumeric() || c == b'_' || c == b'-')
        })
        .ok_or("Invalid compatibility authorization")?;
    let mut request = serde_json::json!({"protocol":1,"apiOrigin":api,"handoff":handoff,
        "installation":installation,"settings":settings_bridge::load()?.settings,"reopen":null,"keepLauncherOpen":true,"preferencesSource":source});
    for (key, value) in target.as_object().ok_or("Invalid compatibility target")? {
        request[key] = value.clone();
    }
    let mut child = command(runtime, &helper)
        .arg("--compatibility-session")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|_| "Could not start the Windows session supervisor")?;
    let mut input = child
        .stdin
        .take()
        .ok_or("Compatibility input unavailable")?;
    writeln!(input, "{request}").map_err(|_| "Compatibility handoff failed")?;
    let output = child
        .stdout
        .take()
        .ok_or("Compatibility output unavailable")?;
    let (tx, rx) = std::sync::mpsc::sync_channel(4);
    std::thread::spawn(move || {
        let mut reader = BufReader::new(output);
        loop {
            let mut bytes = Vec::new();
            match reader.by_ref().take(8193).read_until(b'\n', &mut bytes) {
                Ok(0) => break,
                Ok(_) if bytes.len() <= 8192 && bytes.ends_with(b"\n") => {
                    if tx
                        .send(serde_json::from_slice::<serde_json::Value>(&bytes).ok())
                        .is_err()
                    {
                        break;
                    }
                }
                _ => break,
            }
        }
    });
    let result = (|| -> Result<(), String> {
        let frame = rx
            .recv_timeout(Duration::from_secs(300))
            .map_err(|_| "Windows session preparation failed")?
            .ok_or("Invalid compatibility readiness")?;
        if frame["protocol"] == 1 && frame["event"] == "error" {
            return Err(desktop_session::failure_code(frame["code"].as_str().unwrap_or("")).into());
        }
        if frame != serde_json::json!({"event":"ready","protocol":1}) {
            return Err("Unsupported Windows supervisor protocol".into());
        }
        ready()?;
        writeln!(input, "{{\"commit\":true}}").map_err(|_| "Compatibility commit failed")?;
        input.flush().map_err(|_| "Compatibility commit failed")?;
        let frame = rx
            .recv_timeout(Duration::from_secs(15))
            .map_err(|_| "Windows session commit failed")?
            .ok_or("Invalid compatibility commit")?;
        if frame != serde_json::json!({"event":"committed","protocol":1}) {
            return Err("Invalid compatibility commit".into());
        }
        writeln!(input, "{{\"release\":true}}").map_err(|_| "Compatibility release failed")?;
        input.flush().map_err(|_| "Compatibility release failed")?;
        voice.ready(source_id, &root.join("16competitive/live-session"))?;
        Ok(())
    })();
    // EOF commits ownership on success; on failure it asks the Windows helper
    // to unwind its staged installation. Never kill it during DLL restoration.
    let mut input = if result.is_ok() { Some(input) } else { None };
    let status = if result.is_err() {
        let deadline = std::time::Instant::now() + Duration::from_secs(60);
        let mut reported = false;
        loop {
            if let Some(status) = child
                .try_wait()
                .map_err(|_| "Windows supervisor exit unavailable")?
            {
                break status;
            }
            if !reported && std::time::Instant::now() >= deadline {
                // Keep the Linux ownership locks too: the Windows lock lives in
                // the prefix and cannot exclude Linux Electron helper actions.
                // The requesting launcher has its own bounded readiness timeout.
                eprintln!(
                    "Windows session cleanup is still running; native ownership remains reserved"
                );
                reported = true;
            }
            std::thread::sleep(Duration::from_millis(100));
        }
    } else {
        loop {
            if let Some(status) = child
                .try_wait()
                .map_err(|_| "Windows supervisor exit unavailable")?
            {
                break status;
            }
            if desktop_session::stop_requested() {
                if let Some(mut pipe) = input.take() {
                    let _ = writeln!(pipe, "{{\"stop\":true}}");
                    let _ = pipe.flush();
                }
            }
            std::thread::sleep(Duration::from_millis(100));
        }
    };
    result?;
    if !status.success() {
        return Err("Windows session ended with an error; recovery records were preserved".into());
    }
    Ok(())
}
