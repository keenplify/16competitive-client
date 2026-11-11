//! Bounded, account-scoped failure evidence for browser-launched native games.
use std::{cell::RefCell, fs, path::Path, time::{SystemTime, UNIX_EPOCH}};
use sha2::{Digest, Sha256};
use serde_json::{json, Value};
use competitive16_web_helper::Connection;
thread_local! {
    static OWNER: RefCell<Option<String>> = const { RefCell::new(None) };
    static EXECUTABLE: RefCell<Option<String>> = const { RefCell::new(None) };
}
pub fn set_owner(id: Option<&str>) {
    OWNER.with(|slot| *slot.borrow_mut() = id.filter(|id| uuid::Uuid::parse_str(id).is_ok())
        .map(|id| format!("{:x}", Sha256::digest(id.as_bytes()))));
    EXECUTABLE.with(|slot| *slot.borrow_mut() = None);
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
        "helperVersion":crate::helper_fingerprint(),"failure":failure});
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
