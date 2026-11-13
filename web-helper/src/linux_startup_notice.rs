//! Close GoldSrc's known, nonfatal locale notice in our own game process tree.
//! No game hooks, process-memory access, generic dialog handling or key input.
use std::{fs::{self, File}, io::Read, os::fd::{AsRawFd, FromRawFd, OwnedFd}, path::{Path, PathBuf}, process::{Child, Command, Stdio}, time::{Duration, Instant}};

const NOTICE: &[u8] = b"SetLocale('en_US.UTF-8') failed. Using 'C'.\nYou may have limited glyph support.\nPlease install 'en_US.UTF-8' locale.";

fn known_notice(bytes: &[u8]) -> bool {
    let Some(bytes) = bytes.strip_suffix(&[0]) else { return false; };
    let args: Vec<_> = bytes.split(|byte| *byte == 0).collect();
    let expected: &[&[u8]] = &[b"--question", b"--switch", b"--no-wrap", b"--no-markup", b"--icon", b"dialog-information", b"--title", b"Warning", b"--text", NOTICE, b"--extra-button", b"OK"];
    args.len() == expected.len() + 1 && args[1..] == *expected
}

fn bounded(path: impl AsRef<Path>, limit: u64) -> Option<Vec<u8>> {
    let mut bytes = Vec::new();
    File::open(path).ok()?.take(limit + 1).read_to_end(&mut bytes).ok()?;
    (bytes.len() as u64 <= limit).then_some(bytes)
}

fn parent(pid: u32) -> Option<u32> {
    let bytes = bounded(format!("/proc/{pid}/status"), 16384)?;
    std::str::from_utf8(&bytes).ok()?.lines()
        .find_map(|line| line.strip_prefix("PPid:").and_then(|value| value.trim().parse().ok()))
}

fn candidate(game: u32, child: u32, executable: &Path) -> Option<OwnedFd> {
    if parent(child) != Some(game) { return None; }
    let descriptor = unsafe { libc::syscall(libc::SYS_pidfd_open, child, 0) } as i32;
    if descriptor < 0 { return None; }
    let handle = unsafe { OwnedFd::from_raw_fd(descriptor) };
    if !fs::read_link(format!("/proc/{child}/exe")).is_ok_and(|path| path == executable)
        || !bounded(format!("/proc/{child}/cmdline"), 4096).is_some_and(|args| known_notice(&args))
        || parent(child) != Some(game) { return None; }
    Some(handle)
}

// Public AT-SPI API, in a short-lived credential-free subprocess. Never kill
// Zenity: SDL interprets an abnormal exit as failure and opens another dialog.
// The subprocess has a hard deadline even if the accessibility bus hangs.
pub fn acknowledge(game: u32, child: u32) -> bool {
    let Ok(zenity) = fs::canonicalize("/usr/bin/zenity") else { return false; };
    let Some(handle) = candidate(game, child, &zenity) else { return false; };
    unsafe { acknowledge_accessible(game, child, &zenity, &handle).unwrap_or(false) }
}

unsafe fn acknowledge_accessible(game: u32, child: u32, zenity: &Path, handle: &OwnedFd) -> Option<bool> {
    use std::ffi::{CStr, c_void};
    type Object = *mut c_void;
    let library = libc::dlopen(c"libatspi.so.0".as_ptr(), libc::RTLD_NOW | libc::RTLD_LOCAL);
    if library.is_null() { return None; }
    unsafe fn symbol<T: Copy>(library: Object, name: &CStr) -> Option<T> {
        let address = libc::dlsym(library, name.as_ptr());
        if address.is_null() { None } else { Some(std::mem::transmute_copy(&address)) }
    }
    let init: unsafe extern "C" fn() -> i32 = symbol(library, c"atspi_init")?;
    let timeout: unsafe extern "C" fn(i32, i32) = symbol(library, c"atspi_set_timeout")?;
    let desktop: unsafe extern "C" fn(i32) -> Object = symbol(library, c"atspi_get_desktop")?;
    let count: unsafe extern "C" fn(Object, Object) -> i32 = symbol(library, c"atspi_accessible_get_child_count")?;
    let at: unsafe extern "C" fn(Object, i32, Object) -> Object = symbol(library, c"atspi_accessible_get_child_at_index")?;
    let pid: unsafe extern "C" fn(Object, Object) -> u32 = symbol(library, c"atspi_accessible_get_process_id")?;
    let name: unsafe extern "C" fn(Object, Object) -> *mut libc::c_char = symbol(library, c"atspi_accessible_get_name")?;
    let role: unsafe extern "C" fn(Object, Object) -> *mut libc::c_char = symbol(library, c"atspi_accessible_get_role_name")?;
    let action: unsafe extern "C" fn(Object) -> Object = symbol(library, c"atspi_accessible_get_action_iface")?;
    let perform: unsafe extern "C" fn(Object, i32, Object) -> i32 = symbol(library, c"atspi_action_do_action")?;
    // Objects/strings live only until this isolated process exits. Avoid loading
    // GTK or AT-SPI state into the authenticated session supervisor.
    if init() > 1 { return Some(false); }
    timeout(100, 100);
    let null = std::ptr::null_mut();
    let root = desktop(0);
    if root.is_null() { return Some(false); }
    let mut application = null;
    for index in 0..count(root, null).clamp(0, 128) {
        let object = at(root, index, null);
        if !object.is_null() && pid(object, null) == child { application = object; break; }
    }
    if application.is_null() { return Some(false); }
    let mut pending = vec![(application, 0)];
    let mut button = null;
    let mut notice = false;
    let mut visited = 0;
    while let Some((object, depth)) = pending.pop() {
        visited += 1;
        if visited > 48 { return Some(false); }
        let text = name(object, null);
        if !text.is_null() {
            let text = CStr::from_ptr(text).to_bytes();
            notice |= text == NOTICE;
            if text == b"OK" {
                let kind = role(object, null);
                if !kind.is_null() && CStr::from_ptr(kind).to_bytes() == b"button" { button = object; }
                // Match the public AT-SPI button role, not its child label.
            }
        }
        if depth < 10 {
            for index in 0..count(object, null).clamp(0, 16) {
                let next = at(object, index, null);
                if !next.is_null() { pending.push((next, depth + 1)); }
            }
        }
    }
    if !notice || button.is_null() || candidate(game, child, zenity).is_none() { return Some(false); }
    let mut live = libc::pollfd { fd: handle.as_raw_fd(), events: libc::POLLIN, revents: 0 };
    if libc::poll(&mut live, 1, 0) != 0 { return Some(false); }
    let interface = action(button);
    Some(!interface.is_null() && perform(interface, 0, null) != 0)
}

pub struct Watch { deadline: Instant, next: Instant, handled: bool, zenity: Option<PathBuf>, worker: Option<(Child, Instant)>, executable: Option<PathBuf> }
impl Watch {
    pub fn new() -> Self {
        Self { deadline: Instant::now() + Duration::from_secs(30), next: Instant::now(), handled: false,
            zenity: fs::canonicalize("/usr/bin/zenity").ok(), worker: None, executable: std::env::current_exe().ok() }
    }
    pub fn poll(&mut self, game: u32, mut owned: impl FnMut() -> bool) {
        let now = Instant::now();
        if let Some((worker, started)) = &mut self.worker {
            match worker.try_wait() {
                Ok(Some(status)) => { self.handled = status.success(); self.worker = None; }
                _ if now.duration_since(*started) >= Duration::from_secs(3) || !owned() => {
                    let _ = worker.kill(); let _ = worker.wait(); self.worker = None;
                }
                _ => return,
            }
        }
        if self.handled || now >= self.deadline || now < self.next || !owned() { return; }
        self.next = now + Duration::from_millis(500);
        let Some(zenity) = &self.zenity else { return; };
        let Some(children) = bounded(format!("/proc/{game}/task/{game}/children"), 4096) else { return; };
        let Ok(children) = std::str::from_utf8(&children) else { return; };
        for child in children.split_whitespace().take(16).filter_map(|value| value.parse::<u32>().ok()) {
            if candidate(game, child, zenity).is_none() || !owned() { continue; }
            let Some(executable) = &self.executable else { return; };
            let mut command = Command::new(executable);
            command.args(["--linux-locale-notice", &game.to_string(), &child.to_string()]).env_clear()
                .stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null());
            for key in ["HOME", "DBUS_SESSION_BUS_ADDRESS", "XDG_RUNTIME_DIR", "DISPLAY"] {
                if let Some(value) = std::env::var_os(key) { command.env(key, value); }
            }
            if let Ok(worker) = command.spawn() { self.worker = Some((worker, now)); }
            return;
        }
    }
}
impl Drop for Watch {
    fn drop(&mut self) { if let Some((worker, _)) = &mut self.worker { let _ = worker.kill(); let _ = worker.wait(); } }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn only_the_exact_informational_locale_notice_matches() {
        let args: &[&[u8]] = &[b"zenity", b"--question", b"--switch", b"--no-wrap", b"--no-markup", b"--icon", b"dialog-information", b"--title", b"Warning", b"--text", NOTICE, b"--extra-button", b"OK"];
        let mut command = args.join(&0); command.push(0);
        assert!(known_notice(&command));
        let mut other = command.clone();
        let start = other.windows(NOTICE.len()).position(|part| part == NOTICE).unwrap();
        other[start] = b'X';
        assert!(!known_notice(&other));
        assert!(!known_notice(b"zenity\0--question\0--text\0Allow access?\0"));
        assert!(!known_notice(&command[..command.len() - 1]));
    }
    #[test]
    fn candidate_rejects_unrelated_processes() {
        let mut child = Command::new("/bin/sleep").arg("30").spawn().unwrap();
        let executable = fs::canonicalize("/bin/sleep").unwrap();
        assert!(candidate(std::process::id(), child.id(), &executable).is_none());
        assert!(candidate(std::process::id() + 1, child.id(), &executable).is_none());
        assert!(child.try_wait().unwrap().is_none());
        child.kill().unwrap(); child.wait().unwrap();
    }
    #[test]
    #[ignore = "requires the owner-provided native Linux GoldSrc fixture and display"]
    fn real_goldsrc_locale_notice_closes_without_game_changes() {
        struct Game(std::process::Child);
        impl Drop for Game { fn drop(&mut self) { let _ = self.0.kill(); let _ = self.0.wait(); } }
        let executable = std::env::var_os("NATIVE_CS16_LOCALE_GAME").expect("native game fixture");
        let executable = fs::canonicalize(executable).unwrap();
        let root = executable.parent().unwrap();
        let home = std::env::var_os("HOME").unwrap();
        let mut command = std::process::Command::new(&executable);
        command.current_dir(root).args(["-game", "cstrike", "-gl", "-novid", "-windowed", "-w", "800", "-h", "600", "+disconnect"])
            .env_remove("LD_PRELOAD").env_remove("PAPAMO_SKIN_PROBE_SESSION")
            .env("SteamAppId", "10").env("SteamGameId", "10")
            .env("LD_LIBRARY_PATH", crate::steam_proton::native_library_path(root, Path::new(&home)).unwrap())
            .stdin(std::process::Stdio::null()).stdout(std::process::Stdio::null()).stderr(std::process::Stdio::null());
        crate::steam_proton::configure_native_display(&mut command);
        let mut game = Game(command.spawn().unwrap());
        let mut watch = Watch::new();
        watch.executable = Some(PathBuf::from(std::env::var_os("NATIVE_CS16_NOTICE_HELPER").expect("built helper fixture")));
        let deadline = Instant::now() + Duration::from_secs(15);
        while Instant::now() < deadline && !watch.handled {
            assert!(game.0.try_wait().unwrap().is_none(), "native game exited during startup");
            watch.poll(game.0.id(), || game.0.try_wait().is_ok_and(|status| status.is_none()));
            std::thread::sleep(Duration::from_millis(25));
        }
        assert!(watch.handled, "fixture did not produce the known locale notice");
        std::thread::sleep(Duration::from_secs(2));
        assert!(game.0.try_wait().unwrap().is_none(), "closing the information notice stopped the game");
        let inventory = Command::new("xprop").args(["-root", "_NET_CLIENT_LIST"]).output().unwrap();
        assert!(inventory.status.success(), "X11 inventory unavailable");
        let inventory = String::from_utf8(inventory.stdout).unwrap();
        let mut main_window = false;
        for id in inventory.split_whitespace().filter(|id| id.starts_with("0x")) {
            let properties = Command::new("xprop").args(["-id", id.trim_end_matches(','), "_NET_WM_PID", "_NET_WM_NAME"]).output().unwrap();
            let properties = String::from_utf8_lossy(&properties.stdout);
            if properties.lines().any(|line| line == format!("_NET_WM_PID(CARDINAL) = {}", game.0.id())) {
                assert!(!properties.contains("= \"Warning\""), "SDL opened a fallback warning; startup is still blocked");
                main_window |= properties.contains("Counter-Strike");
            }
        }
        assert!(main_window, "game window never opened");
    }
}
