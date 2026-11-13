//! Linux Steam readiness, isolated from the authenticated session supervisor.
//! A running Steam process is not evidence that its authentication IPC is ready.
use std::{env, ffi::CString, os::unix::ffi::OsStrExt, path::{Path, PathBuf}, process::{Command, Stdio}, time::{Duration, Instant}};

fn client_libraries(home: &Path) -> Vec<PathBuf> {
    [home.join(".steam/sdk64/steamclient.so"),
        home.join(".steam/steam/steamrt64/steamclient.so"),
        home.join(".steam/steam/linux64/steamclient.so"),
        home.join(".local/share/Steam/steamrt64/steamclient.so"),
        home.join(".local/share/Steam/linux64/steamclient.so")].into_iter().filter(|path| path.is_file()).collect()
}

// These are Steam's exported C functions, not a game hook or a competitive
// authorization check. Only boolean readiness leaves this short-lived process.
unsafe fn logged_on(path: &Path) -> Option<bool> {
    let path = CString::new(path.as_os_str().as_bytes()).ok()?;
    let library = libc::dlopen(path.as_ptr(), libc::RTLD_NOW | libc::RTLD_LOCAL);
    if library.is_null() { return None; }
    unsafe fn symbol<T: Copy>(library: *mut libc::c_void, name: &std::ffi::CStr) -> Option<T> {
        let address = libc::dlsym(library, name.as_ptr());
        if address.is_null() { None } else {
            assert_eq!(std::mem::size_of::<T>(), std::mem::size_of_val(&address));
            Some(std::mem::transmute_copy(&address))
        }
    }
    let create: unsafe extern "C" fn() -> i32 = symbol(library, c"Steam_CreateSteamPipe")?;
    let connect: unsafe extern "C" fn(i32) -> i32 = symbol(library, c"Steam_ConnectToGlobalUser")?;
    let connected: unsafe extern "C" fn(i32, i32) -> bool = symbol(library, c"Steam_BConnected")?;
    let logged_on: unsafe extern "C" fn(i32, i32) -> bool = symbol(library, c"Steam_BLoggedOn")?;
    let release_user: unsafe extern "C" fn(i32, i32) = symbol(library, c"Steam_ReleaseUser")?;
    let release_pipe: unsafe extern "C" fn(i32) -> bool = symbol(library, c"Steam_BReleaseSteamPipe")?;
    let pipe = create();
    if pipe <= 0 { return Some(false); }
    let user = connect(pipe);
    let ready = user > 0 && connected(user, pipe) && logged_on(user, pipe);
    if user > 0 { release_user(pipe, user); }
    release_pipe(pipe);
    // Do not unload a library that may own internal threads. This mode exits
    // immediately; the OS reclaims it without touching the game or supervisor.
    Some(ready)
}

pub fn probe() -> bool {
    let Some(home) = env::var_os("HOME") else { return false; };
    for library in client_libraries(Path::new(&home)) {
        if let Some(ready) = unsafe { logged_on(&library) } { return ready; }
    }
    false
}

fn probe_process(executable: &Path, home: &Path, timeout: Duration) -> Result<bool, String> {
    let mut command = Command::new(executable);
    command.arg("--steam-readiness-probe").env_clear().env("HOME", home)
        .env("LANG", "C").env("SteamAppId", "10")
        .stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null());
    if let Some(runtime) = env::var_os("XDG_RUNTIME_DIR") { command.env("XDG_RUNTIME_DIR", runtime); }
    let mut child = command.spawn().map_err(|_| "STEAM_START_FAILED")?;
    let deadline = Instant::now() + timeout;
    loop {
        match child.try_wait() {
            Ok(Some(status)) => return Ok(status.success()),
            Ok(None) if Instant::now() < deadline => std::thread::sleep(Duration::from_millis(25)),
            _ => {
                let _ = child.kill();
                let _ = child.wait();
                return Ok(false);
            }
        }
    }
}

fn wait_until(mut check: impl FnMut(Duration) -> Result<bool, String>, mut stopped: impl FnMut() -> bool,
    timeout: Duration, interval: Duration) -> Result<(), String> {
    let deadline = Instant::now() + timeout;
    loop {
        if stopped() { return Err("STEAM_START_FAILED".into()); }
        let remaining = deadline.saturating_duration_since(Instant::now());
        if remaining.is_zero() { return Err("STEAM_START_FAILED".into()); }
        if check(remaining.min(Duration::from_secs(5)))? { return Ok(()); }
        let remaining = deadline.saturating_duration_since(Instant::now());
        if remaining.is_zero() { return Err("STEAM_START_FAILED".into()); }
        std::thread::sleep(remaining.min(interval));
    }
}

pub fn wait(stopped: impl FnMut() -> bool) -> Result<(), String> {
    let home = env::var_os("HOME").ok_or("STEAM_START_FAILED")?;
    // ARM-host emulation keeps its existing VM startup path. Its x86 worker
    // performs this probe inside the matching architecture/process namespace.
    if cfg!(target_arch = "aarch64") && !crate::linux_emulation::in_guest() { return Ok(()); }
    let executable = env::current_exe().map_err(|_| "STEAM_START_FAILED")?;
    wait_until(|timeout| probe_process(&executable, Path::new(&home), timeout), stopped,
        Duration::from_secs(90), Duration::from_secs(1))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    #[test]
    fn steam_must_be_authenticated_not_just_running_and_wait_is_bounded() {
        let mut checks = 0;
        wait_until(|_| { checks += 1; Ok(checks == 3) }, || false, Duration::from_secs(1), Duration::ZERO).unwrap();
        assert_eq!(checks, 3);
        let start = Instant::now();
        assert!(wait_until(|_| Ok(false), || false, Duration::from_millis(30), Duration::from_millis(5)).is_err());
        assert!(start.elapsed() < Duration::from_secs(1));
        assert!(wait_until(|_| panic!("cancelled probe ran"), || true, Duration::from_secs(1), Duration::ZERO).is_err());
    }
    #[test]
    fn isolated_probe_has_no_credentials_or_appimage_libraries_and_times_out() {
        use std::os::unix::fs::PermissionsExt;
        let home = env::temp_dir().join(format!("16c-steam-ready-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&home).unwrap();
        let helper = home.join("probe");
        fs::write(&helper, b"#!/bin/sh\n[ \"$1\" = --steam-readiness-probe ] || exit 2\n[ -z \"$LD_PRELOAD$LD_LIBRARY_PATH$APPIMAGE$APPDIR\" ] || exit 3\n[ \"$SteamAppId\" = 10 ] || exit 4\nexit 0\n").unwrap();
        fs::set_permissions(&helper, fs::Permissions::from_mode(0o700)).unwrap();
        assert!(probe_process(&helper, &home, Duration::from_secs(1)).unwrap());
        fs::write(&helper, b"#!/bin/sh\nexec /bin/sleep 5\n").unwrap();
        let start = Instant::now();
        assert!(!probe_process(&helper, &home, Duration::from_millis(50)).unwrap());
        assert!(start.elapsed() < Duration::from_secs(1));
        fs::remove_dir_all(home).unwrap();
    }
}
