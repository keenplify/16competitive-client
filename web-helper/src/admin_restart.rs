//! One-time Windows UAC restart after ERROR_ELEVATION_REQUIRED. No login,
//! match credentials or arbitrary commands cross the desktop elevation boundary.
//! Web retries pass only a fresh, short-lived, single-use web handoff.
use crate::{desktop_session::Reopen, *};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use std::{
    io::Read,
    mem::{size_of, zeroed},
    os::windows::ffi::{OsStrExt, OsStringExt},
};
use windows_sys::Win32::{
    Foundation::{CloseHandle, HANDLE, WAIT_OBJECT_0},
    System::Threading::{
        CreateEventW, OpenEventW, OpenProcess, QueryFullProcessImageNameW, SetEvent,
        WaitForMultipleObjects, WaitForSingleObject, EVENT_MODIFY_STATE,
        PROCESS_QUERY_LIMITED_INFORMATION, PROCESS_SYNCHRONIZE,
    },
    UI::Shell::{ShellExecuteExW, SEE_MASK_NOASYNC, SEE_MASK_NOCLOSEPROCESS, SHELLEXECUTEINFOW},
};

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Request {
    parent_pid: u32,
    reopen: Reopen,
}
struct Handle(HANDLE);
impl Drop for Handle {
    fn drop(&mut self) {
        unsafe {
            CloseHandle(self.0);
        }
    }
}
fn wide(value: &std::ffi::OsStr) -> Result<Vec<u16>, String> {
    let value: Vec<_> = value.encode_wide().collect();
    if value.contains(&0) {
        return Err("ADMIN_RESTART_FAILED".into());
    }
    Ok(value.into_iter().chain(Some(0)).collect())
}
fn parse(bytes: &[u8]) -> Result<Request, String> {
    if bytes.len() > 8192 {
        return Err("ADMIN_RESTART_FAILED".into());
    }
    let request: Request = serde_json::from_slice(bytes).map_err(|_| "ADMIN_RESTART_FAILED")?;
    // Only the installed launcher is supported, with fixed non-secret flags.
    if request.parent_pid == 0
        || request.reopen.args != ["--return-from-game", "--admin-game-retry"]
    {
        return Err("ADMIN_RESTART_FAILED".into());
    }
    request
        .reopen
        .validate()
        .map_err(|_| "ADMIN_RESTART_FAILED")?;
    Ok(request)
}
fn parent(request: &Request) -> Result<Handle, String> {
    let handle = unsafe {
        OpenProcess(
            PROCESS_QUERY_LIMITED_INFORMATION | PROCESS_SYNCHRONIZE,
            0,
            request.parent_pid,
        )
    };
    if handle.is_null() {
        return Err("ADMIN_RESTART_FAILED".into());
    }
    let handle = Handle(handle);
    let mut buffer = vec![0u16; 32768];
    let mut length = buffer.len() as u32;
    if unsafe { QueryFullProcessImageNameW(handle.0, 0, buffer.as_mut_ptr(), &mut length) } == 0 {
        return Err("ADMIN_RESTART_FAILED".into());
    }
    let actual = fs::canonicalize(PathBuf::from(std::ffi::OsString::from_wide(
        &buffer[..length as usize],
    )))
    .map_err(|_| "ADMIN_RESTART_FAILED")?;
    let expected =
        fs::canonicalize(&request.reopen.executable).map_err(|_| "ADMIN_RESTART_FAILED")?;
    if actual != expected {
        return Err("ADMIN_RESTART_FAILED".into());
    }
    Ok(handle)
}
fn approval_result(result: std::io::Result<()>) -> Result<(), String> {
    result.map_err(|error| {
        if error.raw_os_error() == Some(1223) {
            "ADMIN_RESTART_CANCELLED".into()
        } else {
            "ADMIN_RESTART_FAILED".into()
        }
    })
}
pub fn request() -> Result<(), String> {
    let mut bytes = Vec::new();
    std::io::stdin()
        .take(8193)
        .read_to_end(&mut bytes)
        .map_err(|_| "ADMIN_RESTART_FAILED")?;
    let request = parse(&bytes)?;
    let _parent = parent(&request)?;
    let executable = wide(
        env::current_exe()
            .map_err(|_| "ADMIN_RESTART_FAILED")?
            .as_os_str(),
    )?;
    let verb = wide(std::ffi::OsStr::new("runas"))?;
    // Base64url has no Windows argument separators. This contains only the
    // validated parent PID, launcher path/hash and fixed restart flags.
    let event_name = format!("Local\\16c-admin-{}", uuid::Uuid::new_v4());
    let event_wide = wide(std::ffi::OsStr::new(&event_name))?;
    let event = unsafe { CreateEventW(std::ptr::null(), 1, 0, event_wide.as_ptr()) };
    if event.is_null() {
        return Err("ADMIN_RESTART_FAILED".into());
    }
    let event = Handle(event);
    let parameters = wide(std::ffi::OsStr::new(&format!(
        "--admin-restart {} {}",
        URL_SAFE_NO_PAD.encode(&bytes),
        event_name
    )))?;
    let mut info: SHELLEXECUTEINFOW = unsafe { zeroed() };
    info.cbSize = size_of::<SHELLEXECUTEINFOW>() as u32;
    info.fMask = SEE_MASK_NOCLOSEPROCESS | SEE_MASK_NOASYNC;
    info.lpVerb = verb.as_ptr();
    info.lpFile = executable.as_ptr();
    info.lpParameters = parameters.as_ptr();
    info.nShow = 1;
    approval_result(if unsafe { ShellExecuteExW(&mut info) } == 0 {
        Err(std::io::Error::last_os_error())
    } else {
        Ok(())
    })?;
    if info.hProcess.is_null() {
        return Err("ADMIN_RESTART_FAILED".into());
    }
    let child = Handle(info.hProcess);
    // Readiness means the approved bootstrap has retained the original
    // launcher handle and can safely wait for its single-instance lock.
    let handles = [event.0, child.0];
    if unsafe { WaitForMultipleObjects(2, handles.as_ptr(), 0, 15000) } != WAIT_OBJECT_0 {
        return Err("ADMIN_RESTART_FAILED".into());
    }
    println!("{{\"protocol\":1,\"event\":\"admin-approved\"}}");
    Ok(())
}
pub fn restart(args: &[String]) -> Result<(), String> {
    if args.len() != 2 || args[0].len() > 11000 {
        return Err("ADMIN_RESTART_FAILED".into());
    }
    let bytes = URL_SAFE_NO_PAD
        .decode(&args[0])
        .map_err(|_| "ADMIN_RESTART_FAILED")?;
    let request = parse(&bytes)?;
    let parent = parent(&request)?;
    let suffix = args[1]
        .strip_prefix("Local\\16c-admin-")
        .ok_or("ADMIN_RESTART_FAILED")?;
    if uuid::Uuid::parse_str(suffix).is_err() {
        return Err("ADMIN_RESTART_FAILED".into());
    }
    let event_name = wide(std::ffi::OsStr::new(&args[1]))?;
    let event = unsafe { OpenEventW(EVENT_MODIFY_STATE, 0, event_name.as_ptr()) };
    if event.is_null() {
        return Err("ADMIN_RESTART_FAILED".into());
    }
    let event = Handle(event);
    if unsafe { SetEvent(event.0) } == 0 {
        return Err("ADMIN_RESTART_FAILED".into());
    }
    // Preserve the single-instance lock: the original launcher cleans up its
    // failed session and exits before the approved replacement starts.
    if unsafe { WaitForSingleObject(parent.0, 30000) } != WAIT_OBJECT_0 {
        return Err("ADMIN_RESTART_FAILED".into());
    }
    request
        .reopen
        .launch()
        .map_err(|_| "ADMIN_RESTART_FAILED".into())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn cancelled_approval_is_distinct_and_does_not_retry() {
        assert_eq!(
            approval_result(Err(std::io::Error::from_raw_os_error(1223))).unwrap_err(),
            "ADMIN_RESTART_CANCELLED"
        );
        assert_eq!(
            approval_result(Err(std::io::Error::from_raw_os_error(5))).unwrap_err(),
            "ADMIN_RESTART_FAILED"
        );
        assert!(approval_result(Ok(())).is_ok());
    }
    #[test]
    fn only_the_live_parent_image_and_fixed_flags_can_restart() {
        let executable = env::current_exe().unwrap();
        let mut request = Request {
            parent_pid: std::process::id(),
            reopen: Reopen {
                sha256: format!("{:x}", Sha256::digest(fs::read(&executable).unwrap())),
                executable,
                args: vec!["--return-from-game".into(), "--admin-game-retry".into()],
            },
        };
        assert!(parse(&serde_json::to_vec(&request).unwrap()).is_ok());
        assert!(parent(&request).is_ok());
        request.reopen.args.push("--arbitrary-command".into());
        assert!(parse(&serde_json::to_vec(&request).unwrap()).is_err());
        request.reopen.args.pop();
        request.reopen.sha256 = "0".repeat(64);
        assert!(parse(&serde_json::to_vec(&request).unwrap()).is_err());
        // A valid file/hash cannot authorize another executable as our parent.
        let file = env::temp_dir().join(format!("16c-admin-{}.exe", uuid::Uuid::new_v4()));
        fs::write(&file, b"fixture").unwrap();
        request.reopen.executable = file.clone();
        request.reopen.sha256 = format!("{:x}", Sha256::digest(b"fixture"));
        assert!(parse(&serde_json::to_vec(&request).unwrap()).is_ok());
        assert!(parent(&request).is_err());
        fs::remove_file(file).unwrap();
    }
    #[test]
    fn malformed_restart_requests_cannot_select_commands() {
        for bytes in [b"{}".as_slice(), b"{\"parentPid\":0}", &[b'x'; 8193]] {
            assert!(parse(bytes).is_err());
        }
        assert!(restart(&[]).is_err());
        assert!(restart(&["bad!".into()]).is_err());
    }
}


pub(crate) fn web_retry_allowed(frame: &serde_json::Value) -> bool {
    frame["code"] == "GAME_SPAWN_FAILED" && frame["osError"] == 740
        && frame["elevated"] == false && frame.get("cleanupCodes").is_none()
}

pub(crate) fn request_web_join(api: &str, token: &str, match_id: &str) -> Result<(), String> {
    // The failed attempt has returned: its workers and ownership guards are gone.
    // Never put the helper login token or game credentials in process arguments.
    let response: serde_json::Value = ureq::AgentBuilder::new().redirects(0)
        .timeout(Duration::from_secs(10)).build()
        .post(&format!("{api}/auth/web-handoff"))
        .set("Authorization", &format!("Bearer {token}"))
        .call().map_err(|_| "ADMIN_RESTART_FAILED")?
        .into_json().map_err(|_| "ADMIN_RESTART_FAILED")?;
    let handoff = response["token"].as_str().ok_or("ADMIN_RESTART_FAILED")?;
    let mut link = url::Url::parse(&format!("competitive16-helper://join/{match_id}"))
        .map_err(|_| "ADMIN_RESTART_FAILED")?;
    link.query_pairs_mut().append_pair("api", api).append_pair("handoff", handoff);
    parse_launch_link(link.as_str(), cfg!(debug_assertions)).ok_or("ADMIN_RESTART_FAILED")?;
    let path = env::current_exe().map_err(|_| "ADMIN_RESTART_FAILED")?;
    let hash = desktop_session::executable_hash(&path).map_err(|_| "ADMIN_RESTART_FAILED")?;
    let executable = wide(path.as_os_str())?;
    let verb = wide(std::ffi::OsStr::new("runas"))?;
    let parameters = wide(std::ffi::OsStr::new(&format!("--admin-web-join {} {}",
        URL_SAFE_NO_PAD.encode(link.as_str()), hash)))?;
    let mut info: SHELLEXECUTEINFOW = unsafe { zeroed() };
    info.cbSize = size_of::<SHELLEXECUTEINFOW>() as u32;
    info.fMask = SEE_MASK_NOCLOSEPROCESS | SEE_MASK_NOASYNC;
    info.lpVerb = verb.as_ptr();
    info.lpFile = executable.as_ptr();
    info.lpParameters = parameters.as_ptr();
    info.nShow = 1;
    approval_result(if unsafe { ShellExecuteExW(&mut info) } == 0 {
        Err(std::io::Error::last_os_error())
    } else { Ok(()) })?;
    if info.hProcess.is_null() { return Err("ADMIN_RESTART_FAILED".into()); }
    let _child = Handle(info.hProcess);
    Ok(())
}

fn web_link(args: &[String]) -> Result<competitive16_web_helper::LaunchLink, String> {
    if args.len() != 2 || args[0].len() > 4096 {
        return Err("ADMIN_RESTART_FAILED".into());
    }
    let path = env::current_exe().map_err(|_| "ADMIN_RESTART_FAILED")?;
    if desktop_session::executable_hash(&path).map_err(|_| "ADMIN_RESTART_FAILED")? != args[1] {
        return Err("ADMIN_RESTART_FAILED".into());
    }
    let bytes = URL_SAFE_NO_PAD.decode(&args[0]).map_err(|_| "ADMIN_RESTART_FAILED")?;
    let link = std::str::from_utf8(&bytes).map_err(|_| "ADMIN_RESTART_FAILED")?;
    parse_launch_link(link, cfg!(debug_assertions)).ok_or("ADMIN_RESTART_FAILED".into())
}

pub(crate) fn web_join(args: &[String]) -> Result<(), String> {
    let launch = web_link(args)?;
    if desktop_session::process_elevated() != Some(true) { return Err("ADMIN_RESTART_FAILED".into()); }
    // No updater, elevated tray, cached credentials, or second UAC retry.
    let token = session(&launch.api_origin, &launch.handoff)?;
    let connection = connection(&launch.api_origin, &token, &launch.match_id)?;
    launch_match(&connection, &launch.api_origin, &token)
}

#[cfg(test)]
mod web_tests {
    use super::*;
    #[test]
    fn retry_requires_740_unelevated_and_successful_cleanup() {
        let frame = serde_json::json!({"code":"GAME_SPAWN_FAILED", "osError":740, "elevated":false});
        assert!(web_retry_allowed(&frame));
        for (key, value) in [("osError", serde_json::json!(5)), ("elevated", serde_json::json!(true)),
            ("elevated", serde_json::Value::Null), ("cleanupCodes", serde_json::json!("RESTORE_FAILED")),
            ("code", serde_json::json!("VOICE_OWNERSHIP_FAILED"))] {
            let mut rejected = frame.clone(); rejected[key] = value;
            assert!(!web_retry_allowed(&rejected));
        }
    }
    #[test]
    fn elevated_worker_accepts_only_valid_link_and_same_image() {
        let hash = desktop_session::executable_hash(&env::current_exe().unwrap()).unwrap();
        let link = format!("competitive16-helper://join/12345678-1234-4234-8234-123456789abc?api=https%3A%2F%2Feuw.16competitive.papamo.dev&handoff={}", "a".repeat(43));
        let args = vec![URL_SAFE_NO_PAD.encode(&link), hash];
        assert!(web_link(&args).is_ok());
        assert!(web_link(&[]).is_err());
        let mut invalid = args.clone(); invalid.push("--command".into());
        assert!(web_link(&invalid).is_err());
        invalid = args.clone(); invalid[1] = "0".repeat(64);
        assert!(web_link(&invalid).is_err());
        invalid = args; invalid[0] = URL_SAFE_NO_PAD.encode(format!("{link}&command=calc.exe"));
        assert!(web_link(&invalid).is_err());
    }
}
