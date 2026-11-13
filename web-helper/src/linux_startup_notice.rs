//! Close GoldSrc's known, nonfatal locale notice in our own game process tree.
//! No game hooks, process-memory access, generic dialog handling or key input.
use std::{fs::{self, File}, io::Read, os::fd::{AsRawFd, FromRawFd, OwnedFd}, path::{Path, PathBuf}, time::{Duration, Instant}};

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

fn dismiss_candidate(game: u32, child: u32, executable: &Path,
    mut owned: impl FnMut() -> bool, matches: impl Fn(&[u8]) -> bool) -> bool {
    if !owned() || parent(child) != Some(game) { return false; }
    let descriptor = unsafe { libc::syscall(libc::SYS_pidfd_open, child, 0) } as i32;
    if descriptor < 0 { return false; }
    let handle = unsafe { OwnedFd::from_raw_fd(descriptor) };
    if !fs::read_link(format!("/proc/{child}/exe")).is_ok_and(|path| path == executable)
        || !bounded(format!("/proc/{child}/cmdline"), 4096).is_some_and(|args| matches(&args))
        || !owned() || parent(child) != Some(game) { return false; }
    // GoldSrc ignores the result of this informational message box and uses
    // its existing C fallback. Closing its helper lets startup continue. The
    // retained pidfd can never signal a different process after PID reuse.
    unsafe { libc::syscall(libc::SYS_pidfd_send_signal, handle.as_raw_fd(), libc::SIGTERM,
        std::ptr::null::<libc::siginfo_t>(), 0) == 0 }
}

pub struct Watch { deadline: Instant, next: Instant, handled: bool, zenity: Option<PathBuf> }
impl Watch {
    pub fn new() -> Self {
        Self { deadline: Instant::now() + Duration::from_secs(30), next: Instant::now(), handled: false,
            zenity: fs::canonicalize("/usr/bin/zenity").ok() }
    }
    pub fn poll(&mut self, game: u32, mut owned: impl FnMut() -> bool) {
        let now = Instant::now();
        if self.handled || now >= self.deadline || now < self.next || !owned() { return; }
        self.next = now + Duration::from_millis(250);
        let Some(zenity) = &self.zenity else { return; };
        let Some(children) = bounded(format!("/proc/{game}/task/{game}/children"), 4096) else { return; };
        let Ok(children) = std::str::from_utf8(&children) else { return; };
        for child in children.split_whitespace().take(16).filter_map(|value| value.parse::<u32>().ok()) {
            if dismiss_candidate(game, child, zenity, &mut owned, known_notice) {
                self.handled = true;
                return;
            }
        }
    }
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
    fn dismissal_requires_owned_parent_exact_executable_and_notice() {
        use std::os::unix::process::ExitStatusExt;
        let mut child = std::process::Command::new("/bin/sleep").arg("30").spawn().unwrap();
        let game = std::process::id();
        let executable = fs::canonicalize("/bin/sleep").unwrap();
        std::thread::sleep(Duration::from_millis(25));
        assert!(!dismiss_candidate(game, child.id(), &executable, || true, known_notice));
        assert!(!dismiss_candidate(game + 1, child.id(), &executable, || true, |_| true));
        assert!(!dismiss_candidate(game, child.id(), Path::new("/wrong/executable"), || true, |_| true));
        assert!(!dismiss_candidate(game, child.id(), &executable, || false, |_| true));
        assert!(child.try_wait().unwrap().is_none());
        assert!(dismiss_candidate(game, child.id(), &executable, || true, |_| true));
        assert_eq!(child.wait().unwrap().signal(), Some(libc::SIGTERM));
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
        let deadline = Instant::now() + Duration::from_secs(15);
        while Instant::now() < deadline && !watch.handled {
            assert!(game.0.try_wait().unwrap().is_none(), "native game exited during startup");
            watch.poll(game.0.id(), || game.0.try_wait().is_ok_and(|status| status.is_none()));
            std::thread::sleep(Duration::from_millis(25));
        }
        assert!(watch.handled, "fixture did not produce the known locale notice");
        std::thread::sleep(Duration::from_secs(2));
        assert!(game.0.try_wait().unwrap().is_none(), "closing the information notice stopped the game");
    }
}
