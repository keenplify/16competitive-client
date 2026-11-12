//! Bounded, account-scoped failure evidence for browser-launched native games.
use std::{cell::RefCell, fs, path::Path, time::{SystemTime, UNIX_EPOCH}};
use sha2::{Digest, Sha256};
use serde_json::{json, Value};
use competitive16_web_helper::Connection;
thread_local! {
    static OWNER: RefCell<Option<String>> = const { RefCell::new(None) };
    static INSTALL_CHECK: RefCell<Option<Value>> = const { RefCell::new(None) };
    static EXECUTABLE: RefCell<Option<String>> = const { RefCell::new(None) };
}
pub fn set_owner(id: Option<&str>) {
    OWNER.with(|slot| *slot.borrow_mut() = id.filter(|id| uuid::Uuid::parse_str(id).is_ok())
        .map(|id| format!("{:x}", Sha256::digest(id.as_bytes()))));
    EXECUTABLE.with(|slot| *slot.borrow_mut() = None);
    INSTALL_CHECK.with(|slot| *slot.borrow_mut() = None);
}
pub fn set_executable(name: Option<&str>) {
    EXECUTABLE.with(|slot| *slot.borrow_mut() = name.filter(|name| matches!(*name, "hl.exe" | "cstrike.exe" | "hl_linux")).map(str::to_owned));
}
pub fn record(directory: &Path, connection: &Connection, failure: &Value) -> Result<(), String> {
    let Some(owner) = OWNER.with(|slot| slot.borrow().clone()) else { return Ok(()); };
    let at = SystemTime::now().duration_since(UNIX_EPOCH).map_err(|_| "Invalid diagnostic time")?.as_millis();
    let path = directory.join("native-launch-failure.json");
    if let Ok(meta) = fs::symlink_metadata(&path) {
        if !meta.is_file() || meta.file_type().is_symlink() { return Err("Invalid diagnostic file".into()); }
        #[cfg(windows)] {
            use std::os::windows::fs::MetadataExt;
            if meta.file_attributes() & 0x400 != 0 { return Err("Invalid diagnostic file".into()); }
        }
    }
    let data = json!({"version":1,"ownerHash":owner,"at":at,"matchId":connection.match_id,
        "game":connection.game(),"executable":EXECUTABLE.with(|slot| slot.borrow().clone()),
        "helperVersion":crate::helper_fingerprint(),"failure":failure,
        "installationCheck":INSTALL_CHECK.with(|slot| slot.borrow().clone())});
    let bytes = serde_json::to_vec(&data).map_err(|_| "Invalid diagnostic data")?;
    if bytes.len() > 4096 { return Err("Diagnostic data too large".into()); }
    crate::native_session::owned_write(&path, &bytes)
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn web_failure_is_scoped_and_contains_no_connection_secrets() {
        let dir = std::env::temp_dir().join(format!("16c-web-diagnostics-{}", uuid::Uuid::new_v4()));
        let owner = uuid::Uuid::new_v4().to_string();
        set_owner(Some(&owner));
        set_executable(Some("hl.exe"));
        let connection = Connection {match_id:uuid::Uuid::new_v4().to_string(),mode:"cs13_3v3".into(),
            host:"private-host".into(),port:27015,password:"secret-password".into(),join_token:"secret-token".into(),player_name:"private-name".into()};
        let code = crate::desktop_session::game_spawn_failure(std::io::Error::from_raw_os_error(740));
        record(&dir, &connection, &crate::desktop_session::failure_snapshot(&code)).unwrap();
        let bytes = fs::read_to_string(dir.join("native-launch-failure.json")).unwrap();
        let value: Value = serde_json::from_str(&bytes).unwrap();
        assert_eq!(value["game"], "cs13");
        assert_eq!(value["executable"], "hl.exe");
        assert_eq!(value["failure"]["osError"], 740);
        for secret in [&owner, "private-host", "secret-password", "secret-token", "private-name"] { assert!(!bytes.contains(secret)); }
        set_owner(None);
        record(&dir, &connection, &json!({})).unwrap();
        assert_eq!(fs::read_to_string(dir.join("native-launch-failure.json")).unwrap(), bytes);
        fs::remove_dir_all(dir).unwrap();
    }
}


// Fixed compatibility reasons and a hash of the already inspected DLL only.
// Never upload game files, absolute paths, or connection credentials.
pub(crate) fn install_check(reason: &'static str, client_bytes: Option<&[u8]>) {
    INSTALL_CHECK.with(|slot| *slot.borrow_mut() = Some(json!({
        "reason": reason,
        "clientSha256": client_bytes.map(|bytes| format!("{:x}", Sha256::digest(bytes)))
    })));
}


fn architecture_details() -> Value {
    #[allow(unused_mut)]
    let mut details = json!({"helperBuild":std::env::consts::ARCH});
    #[cfg(windows)] {
        use windows_sys::Win32::System::Threading::{GetCurrentProcess, IsWow64Process2};
        let (mut process, mut native) = (0u16, 0u16);
        if unsafe { IsWow64Process2(GetCurrentProcess(), &mut process, &mut native) } != 0 {
            details["windowsProcessMachine"] = json!(process);
            details["windowsNativeMachine"] = json!(native);
            details["emulated"] = json!(process != 0);
        }
    }
    details
}

fn automatic_payload(connection: &Connection, failure: &Value) -> Option<Value> {
    if failure["code"] != "NATIVE_INSTALL_UNSUPPORTED" { return None; }
    let details = json!({"failure": failure, "game": connection.game(),
        "platform": std::env::consts::OS, "architecture":architecture_details(),
        "installationCheck": INSTALL_CHECK.with(|slot| slot.borrow().clone())});
    Some(json!({
        "matchId":connection.match_id,
        "deduplicationKey":format!("native-install-unsupported:{}:{}",connection.match_id,crate::helper_fingerprint()),
        "description":"Automatic bug report: native game installation compatibility check blocked launch (NATIVE_INSTALL_UNSUPPORTED).",
        "logs":details.to_string(),
        "clientVersion":crate::helper_fingerprint()
    }))
}

pub(crate) fn report_automatically(api: &str, token: &str, connection: &Connection, failure: &Value) {
    let Some(payload) = automatic_payload(connection, failure) else { return; };
    if competitive16_web_helper::allowed_api_origin(api, cfg!(debug_assertions)).as_deref() != Some(api) { return; }
    let agent = ureq::AgentBuilder::new().redirects(0).timeout(std::time::Duration::from_secs(5)).build();
    // Same stable key across repeated clicks; backend deduplicates per account.
    for _ in 0..2 {
        match agent.post(&format!("{api}/auth/issue-reports"))
            .set("Authorization", &format!("Bearer {token}"))
            .send_json(payload.clone()) {
            Ok(_) => { eprintln!("Automatic native installation issue report submitted"); return; },
            Err(ureq::Error::Status(status, _)) if status < 500 && status != 429 => break,
            Err(_) => {},
        }
    }
    eprintln!("Automatic native installation issue report unavailable; local diagnostics retained");
}


#[cfg(test)]
mod automatic_tests {
    use super::*;
    use std::{io::{Read, Write}, net::TcpListener};
    #[test]
    fn unsupported_install_is_reported_with_safe_evidence_and_stable_deduplication() {
        let connection = Connection {match_id:uuid::Uuid::new_v4().to_string(), mode:"5v5".into(),
            host:"private-host".into(),port:27015,password:"secret-password".into(),join_token:"secret-token".into(),player_name:"private-name".into()};
        install_check("unrecognized_client_exports", Some(b"client fixture"));
        let failure = json!({"code":"NATIVE_INSTALL_UNSUPPORTED"});
        let payload = automatic_payload(&connection, &failure).unwrap();
        assert_eq!(payload, automatic_payload(&connection, &failure).unwrap());
        assert!(payload["deduplicationKey"].as_str().unwrap().len() <= 128);
        for secret in ["private-host", "secret-password", "secret-token", "private-name", "client fixture"] {
            assert!(!payload.to_string().contains(secret));
        }
        assert!(payload["logs"].as_str().unwrap().contains("unrecognized_client_exports"));
        assert!(automatic_payload(&connection, &json!({"code":"GAME_SPAWN_FAILED"})).is_none());
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        let worker = std::thread::spawn(move || {
            let (mut socket, _) = listener.accept().unwrap();
            socket.set_read_timeout(Some(std::time::Duration::from_secs(5))).unwrap();
            let mut received = Vec::new();
            loop {
                let mut bytes = [0; 4096];
                let count = socket.read(&mut bytes).unwrap();
                assert!(count > 0);
                received.extend_from_slice(&bytes[..count]);
                if let Some(end) = received.windows(4).position(|v| v == b"\r\n\r\n") {
                    let headers = String::from_utf8_lossy(&received[..end]).to_lowercase();
                    let length: usize = headers.lines().find_map(|line| line.strip_prefix("content-length: ")).unwrap().parse().unwrap();
                    if received.len() < end + 4 + length { continue; }
                    assert!(headers.starts_with("post /auth/issue-reports "));
                    assert!(headers.contains("authorization: bearer test-auth"));
                    let body: Value = serde_json::from_slice(&received[end+4..end+4+length]).unwrap();
                    assert_eq!(body, payload);
                    break;
                }
            }
            socket.write_all(b"HTTP/1.1 201 Created\r\nContent-Length: 2\r\nConnection: close\r\n\r\n{}").unwrap();
        });
        report_automatically(&format!("http://{address}"), "test-auth", &connection, &failure);
        worker.join().unwrap();
    }
}
