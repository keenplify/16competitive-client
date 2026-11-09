//! Bounded startup discovery only. Once selected, retain the OS process handle;
//! never discover a replacement after game exit (PID reuse is not ownership).
#[cfg(windows)]
mod windows {
    use std::{
        mem::{size_of, zeroed},
        path::{Path, PathBuf},
        time::{Duration, Instant},
    };
    use windows_sys::Win32::{
        Foundation::{CloseHandle, HANDLE, INVALID_HANDLE_VALUE, WAIT_OBJECT_0, WAIT_TIMEOUT},
        System::{Diagnostics::ToolHelp::*, Threading::*},
    };

    use super::{same_path, LoadedClient};

    struct Handle(HANDLE);
    impl Drop for Handle {
        fn drop(&mut self) {
            unsafe {
                CloseHandle(self.0);
            }
        }
    }

    fn image(handle: HANDLE) -> Option<PathBuf> {
        use std::os::windows::ffi::OsStringExt;
        let mut buffer = vec![0u16; 32768];
        let mut size = buffer.len() as u32;
        if unsafe { QueryFullProcessImageNameW(handle, 0, buffer.as_mut_ptr(), &mut size) } == 0 {
            return None;
        }
        Some(PathBuf::from(std::ffi::OsString::from_wide(
            &buffer[..size as usize],
        )))
    }
    fn matching(executable: &Path) -> Result<Vec<(u32, Handle)>, String> {
        let snapshot = unsafe { CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0) };
        if snapshot == INVALID_HANDLE_VALUE {
            return Err("Could not inspect game startup".into());
        }
        let snapshot = Handle(snapshot);
        let mut entry: PROCESSENTRY32W = unsafe { zeroed() };
        entry.dwSize = size_of::<PROCESSENTRY32W>() as u32;
        let expected = executable
            .file_name()
            .ok_or("Invalid game executable")?
            .to_string_lossy();
        let mut found = Vec::new();
        let mut available = unsafe { Process32FirstW(snapshot.0, &mut entry) } != 0;
        while available {
            let length = entry
                .szExeFile
                .iter()
                .position(|c| *c == 0)
                .unwrap_or(entry.szExeFile.len());
            if String::from_utf16_lossy(&entry.szExeFile[..length]).eq_ignore_ascii_case(&expected)
            {
                let handle = unsafe {
                    OpenProcess(
                        PROCESS_QUERY_LIMITED_INFORMATION | PROCESS_TERMINATE | PROCESS_SYNCHRONIZE,
                        0,
                        entry.th32ProcessID,
                    )
                };
                if !handle.is_null() {
                    let handle = Handle(handle);
                    if image(handle.0).is_some_and(|path| same_path(&path, executable)) {
                        found.push((entry.th32ProcessID, handle));
                    }
                }
            }
            available = unsafe { Process32NextW(snapshot.0, &mut entry) } != 0;
        }
        Ok(found)
    }
    fn client_loaded(pid: u32, game: &Path) -> bool {
        use std::os::windows::ffi::OsStringExt;
        let snapshot =
            unsafe { CreateToolhelp32Snapshot(TH32CS_SNAPMODULE | TH32CS_SNAPMODULE32, pid) };
        if snapshot == INVALID_HANDLE_VALUE {
            return false;
        }
        let snapshot = Handle(snapshot);
        let mut entry: MODULEENTRY32W = unsafe { zeroed() };
        entry.dwSize = size_of::<MODULEENTRY32W>() as u32;
        let mut available = unsafe { Module32FirstW(snapshot.0, &mut entry) } != 0;
        let mut count = 0;
        let mut loaded = LoadedClient::default();
        while available && count < 1024 {
            count += 1;
            let length = entry
                .szExePath
                .iter()
                .position(|c| *c == 0)
                .unwrap_or(entry.szExePath.len());
            let path = PathBuf::from(std::ffi::OsString::from_wide(&entry.szExePath[..length]));
            if loaded.observe(&path, game) { return true; }
            available = unsafe { Module32NextW(snapshot.0, &mut entry) } != 0;
        }
        false
    }

    pub struct Startup {
        executable: PathBuf,
        game: PathBuf,
    }
    pub struct Owned {
        pub pid: u32,
        handle: Handle,
    }
    impl Startup {
        /// Explicit CS 1.6 launch policy: close only exact-path matches and
        /// retain their handles through shutdown. Never kill by basename/PID.
        pub fn prepare_replacing(executable: &Path, game: &Path) -> Result<Self, String> {
            let existing = matching(executable)?;
            for (pid, handle) in existing {
                Owned { pid, handle }.stop()?;
            }
            Self::prepare(executable, game)
        }
        pub fn prepare(executable: &Path, game: &Path) -> Result<Self, String> {
            if !matching(executable)?.is_empty() {
                return Err(
                    "Close the existing Counter-Strike game before starting a managed session"
                        .into(),
                );
            }
            Ok(Self {
                executable: executable.into(),
                game: game.into(),
            })
        }
        pub fn recheck(&self) -> Result<(), String> {
            Self::prepare(&self.executable, &self.game).map(|_| ())
        }
        pub fn wait(self) -> Result<Owned, String> {
            let deadline = Instant::now() + Duration::from_secs(45);
            loop {
                let mut candidates = matching(&self.executable)?;
                if candidates.len() > 1 {
                    return Err("Multiple game processes appeared during startup".into());
                }
                if let Some((pid, handle)) = candidates.pop() {
                    // Steam/bootstrap executables may exit before creating the actual
                    // game. A loaded client module distinguishes the game from them.
                    if client_loaded(pid, &self.game) {
                        return Ok(Owned { pid, handle });
                    }
                }
                if Instant::now() >= deadline {
                    return Err("Counter-Strike startup timed out".into());
                }
                std::thread::sleep(Duration::from_millis(100));
            }
        }
    }
    impl Owned {
        pub fn exited(&self) -> Result<bool, String> {
            match unsafe { WaitForSingleObject(self.handle.0, 0) } {
                WAIT_OBJECT_0 => Ok(true),
                WAIT_TIMEOUT => Ok(false),
                _ => Err("Game process status unavailable".into()),
            }
        }
        pub fn failed_exit(&self, _: &mut std::process::Child) -> Result<bool, String> {
            if !self.exited()? { return Ok(false); }
            let mut code = 0;
            if unsafe { GetExitCodeProcess(self.handle.0, &mut code) } == 0 {
                return Err("Game exit status unavailable".into());
            }
            Ok(code != 0)
        }
        pub fn stop(&self) -> Result<(), String> {
            if self.exited()? {
                return Ok(());
            }
            if unsafe { TerminateProcess(self.handle.0, 1) } == 0 && !self.exited()? {
                return Err("Could not stop the owned game".into());
            }
            if unsafe { WaitForSingleObject(self.handle.0, 15000) } != WAIT_OBJECT_0 {
                return Err("Owned game did not release its files".into());
            }
            Ok(())
        }
    }
    #[cfg(test)]
    mod tests {
        use super::*;
        #[test]
        #[ignore = "requires the controlled Windows bootstrap fixture"]
        fn bootstrap_handoff_tracks_game_after_launcher_exits() {
            let root =
                PathBuf::from(std::env::var_os("OWNED_GAME_FIXTURE").expect("fixture directory"));
            let executable = root.join("fixture-game.exe");
            let startup = Startup::prepare(&executable, &root.join("cstrike")).unwrap();
            let mut wrapper = std::process::Command::new(&executable)
                .arg("--wrapper")
                .current_dir(&root)
                .spawn()
                .unwrap();
            assert!(wrapper.wait().unwrap().success());
            let game = startup.wait().unwrap();
            assert_ne!(game.pid, wrapper.id());
            assert!(!game.exited().unwrap());
            game.stop().unwrap();
            assert!(game.exited().unwrap());
        }

        #[test]
        fn retained_handle_never_adopts_a_replacement_process() {
            let powershell = PathBuf::from(std::env::var_os("SystemRoot").unwrap())
                .join("System32/WindowsPowerShell/v1.0/powershell.exe");
            let spawn = || {
                std::process::Command::new(&powershell)
                    .args([
                        "-NoProfile",
                        "-NonInteractive",
                        "-Command",
                        "Start-Sleep -Seconds 30",
                    ])
                    .stdin(std::process::Stdio::null())
                    .stdout(std::process::Stdio::null())
                    .stderr(std::process::Stdio::null())
                    .spawn()
                    .unwrap()
            };
            let mut first = spawn();
            let handle = matching(&powershell)
                .unwrap()
                .into_iter()
                .find(|(pid, _)| *pid == first.id())
                .unwrap()
                .1;
            let owned = Owned {
                pid: first.id(),
                handle,
            };
            assert!(!owned.exited().unwrap());
            owned.stop().unwrap();
            first.wait().unwrap();
            let mut replacement = spawn();
            assert!(owned.exited().unwrap());
            owned.stop().unwrap();
            assert!(replacement.try_wait().unwrap().is_none());
            replacement.kill().unwrap();
            replacement.wait().unwrap();
        }

        #[test]
        fn path_comparison_preserves_the_selected_installation() {
            assert!(same_path(
                Path::new(r"\\?\C:\Steam\hl.exe"),
                Path::new("c:/steam/hl.exe")
            ));
            assert!(!same_path(
                Path::new("c:/other/hl.exe"),
                Path::new("c:/steam/hl.exe")
            ));
        }
    }
}
#[cfg(windows)]
pub use windows::Startup;

#[cfg(target_os = "linux")]
mod linux {
    use std::{
        fs::{self, File},
        io::Read,
        os::fd::{AsRawFd, FromRawFd},
        path::{Path, PathBuf},
        time::{Duration, Instant},
    };
    fn matching(executable: &Path) -> Result<Vec<u32>, String> {
        let expected = fs::canonicalize(executable).map_err(|_| "Game executable unavailable")?;
        let mut found = Vec::new();
        for entry in fs::read_dir("/proc")
            .map_err(|_| "Process inventory unavailable")?
            .take(32768)
            .flatten()
        {
            if let Ok(pid) = entry.file_name().to_string_lossy().parse::<u32>() {
                if fs::read_link(entry.path().join("exe")).is_ok_and(|path| path == expected) {
                    found.push(pid);
                }
            }
        }
        Ok(found)
    }
    fn client_loaded(pid: u32, game: &Path) -> bool {
        let expected = game.join("cl_dlls/client.so");
        let Ok(expected) = fs::canonicalize(expected) else {
            return false;
        };
        let Ok(file) = File::open(format!("/proc/{pid}/maps")) else {
            return false;
        };
        let mut maps = String::new();
        if file
            .take(4 * 1024 * 1024 + 1)
            .read_to_string(&mut maps)
            .is_err()
            || maps.len() > 4 * 1024 * 1024
        {
            return false;
        }
        maps.lines().any(|line| {
            line.find('/')
                .is_some_and(|start| Path::new(&line[start..]) == expected)
        })
    }
    pub struct Startup {
        executable: PathBuf,
        game: PathBuf,
    }
    pub struct Owned {
        pub pid: u32,
        handle: File,
    }
    impl Startup {
        pub fn prepare_replacing(executable: &Path, game: &Path) -> Result<Self, String> {
            let expected = fs::canonicalize(executable).map_err(|_| "Game executable unavailable")?;
            for pid in matching(executable)? {
                let fd = unsafe { libc::syscall(libc::SYS_pidfd_open, pid, 0) } as i32;
                if fd < 0 {
                    if std::io::Error::last_os_error().raw_os_error() == Some(libc::ESRCH) {
                        continue;
                    }
                    return Err("Could not retain the existing game process handle".into());
                }
                let owned = Owned { pid, handle: unsafe { File::from_raw_fd(fd) } };
                // Recheck identity after acquiring the pidfd. A process that
                // exited/reused its PID or changed its executable is not ours.
                if owned.exited()? { continue; }
                if !fs::read_link(format!("/proc/{pid}/exe")).is_ok_and(|path| path == expected) {
                    return Err("Existing game process identity changed".into());
                }
                owned.stop()?;
            }
            Self::prepare(executable, game)
        }
        pub fn prepare(executable: &Path, game: &Path) -> Result<Self, String> {
            if !matching(executable)?.is_empty() {
                return Err(
                    "Close the existing Counter-Strike game before starting a managed session"
                        .into(),
                );
            }
            Ok(Self {
                executable: executable.into(),
                game: game.into(),
            })
        }
        pub fn recheck(&self) -> Result<(), String> {
            Self::prepare(&self.executable, &self.game).map(|_| ())
        }
        pub fn wait(self) -> Result<Owned, String> {
            let deadline = Instant::now() + Duration::from_secs(45);
            loop {
                let candidates = matching(&self.executable)?;
                if candidates.len() > 1 {
                    return Err("Multiple game processes appeared during startup".into());
                }
                if let Some(&pid) = candidates.first() {
                    if client_loaded(pid, &self.game) {
                        let fd = unsafe { libc::syscall(libc::SYS_pidfd_open, pid, 0) } as i32;
                        if fd >= 0 {
                            return Ok(Owned {
                                pid,
                                handle: unsafe { File::from_raw_fd(fd) },
                            });
                        }
                        return Err("Could not retain the managed game process handle".into());
                    }
                }
                if Instant::now() >= deadline {
                    return Err(
                        "Counter-Strike did not finish startup; check Steam authentication".into(),
                    );
                }
                std::thread::sleep(Duration::from_millis(100));
            }
        }
    }
    impl Owned {
        pub fn exited(&self) -> Result<bool, String> {
            let mut fd = libc::pollfd {
                fd: self.handle.as_raw_fd(),
                events: libc::POLLIN,
                revents: 0,
            };
            let result = unsafe { libc::poll(&mut fd, 1, 0) };
            if result < 0 {
                return Err("Game process status unavailable".into());
            }
            Ok(result > 0)
        }
        pub fn failed_exit(&self, child: &mut std::process::Child) -> Result<bool, String> {
            // A bootstrap's exit status cannot describe the retained game PID.
            if child.id() != self.pid { return Ok(false); }
            Ok(child.try_wait().map_err(|_| "Game exit status unavailable")?
                .is_some_and(|status| !status.success()))
        }
        pub fn stop(&self) -> Result<(), String> {
            if self.exited()? {
                return Ok(());
            }
            for signal in [libc::SIGTERM, libc::SIGKILL] {
                let result = unsafe {
                    libc::syscall(
                        libc::SYS_pidfd_send_signal,
                        self.handle.as_raw_fd(),
                        signal,
                        std::ptr::null::<libc::siginfo_t>(),
                        0,
                    )
                };
                if result < 0 && !self.exited()? {
                    return Err("Could not stop the owned game".into());
                }
                let deadline = Instant::now() + Duration::from_secs(3);
                while Instant::now() < deadline {
                    if self.exited()? {
                        return Ok(());
                    }
                    std::thread::sleep(Duration::from_millis(20));
                }
            }
            Err("Owned game did not release its files".into())
        }
    }
    #[cfg(test)]
    mod tests {
        use super::*;
        #[test]
        fn retained_child_exit_status_distinguishes_quit_and_failure() {
            for (program, failure) in [("true", false), ("false", true)] {
                let mut child = std::process::Command::new(program).spawn().unwrap();
                let fd = unsafe { libc::syscall(libc::SYS_pidfd_open, child.id(), 0) } as i32;
                assert!(fd >= 0);
                let owned = Owned { pid: child.id(), handle: unsafe { File::from_raw_fd(fd) } };
                child.wait().unwrap();
                assert!(owned.exited().unwrap());
                assert_eq!(owned.failed_exit(&mut child).unwrap(), failure);
            }
        }
        #[test]
        fn process_handle_does_not_follow_replacement() {
            let mut first = std::process::Command::new("sleep")
                .arg("30")
                .spawn()
                .unwrap();
            let fd = unsafe { libc::syscall(libc::SYS_pidfd_open, first.id(), 0) } as i32;
            assert!(fd >= 0);
            let owned = Owned {
                pid: first.id(),
                handle: unsafe { File::from_raw_fd(fd) },
            };
            owned.stop().unwrap();
            first.wait().unwrap();
            let mut replacement = std::process::Command::new("sleep")
                .arg("30")
                .spawn()
                .unwrap();
            owned.stop().unwrap();
            assert!(replacement.try_wait().unwrap().is_none());
            replacement.kill().unwrap();
            replacement.wait().unwrap();
        }
    }
}
#[cfg(target_os = "linux")]
pub use linux::Startup;

#[cfg(test)]
mod replacement_tests {
    use super::Startup;
    use std::{fs, path::Path, process::{Child, Command, Stdio}, time::Duration};

    struct Fixture(Child);
    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = self.0.kill();
            let _ = self.0.wait();
        }
    }
    fn spawn(executable: &Path) -> Fixture {
        let mut command = Command::new(executable);
        #[cfg(windows)]
        command.args(["-t", "127.0.0.1"]);
        #[cfg(target_os = "linux")]
        command.arg("60");
        command.stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null());
        let deadline = std::time::Instant::now() + Duration::from_secs(2);
        loop {
            match command.spawn() {
                Ok(child) => return Fixture(child),
                // Parallel test subprocesses can briefly inherit a descriptor
                // used to copy this fixture until their exec closes it.
                Err(error) if cfg!(target_os = "linux") && error.raw_os_error() == Some(26)
                    && std::time::Instant::now() < deadline => {
                    std::thread::sleep(Duration::from_millis(10));
                }
                Err(error) => panic!("Could not spawn process fixture: {error}"),
            }
        }
    }

    #[test]
    fn closes_only_selected_installation_and_recheck_never_kills_a_new_process() {
        let root = std::env::temp_dir().join(format!("16c-replace-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(root.join("selected")).unwrap();
        fs::create_dir_all(root.join("other")).unwrap();
        #[cfg(windows)]
        let source = std::path::PathBuf::from(std::env::var_os("SystemRoot").unwrap()).join("System32/ping.exe");
        #[cfg(target_os = "linux")]
        let source = std::path::PathBuf::from("/bin/sleep");
        let selected = root.join("selected/hl.exe");
        let other = root.join("other/hl.exe");
        fs::copy(&source, &selected).unwrap();
        fs::copy(&source, &other).unwrap();
        {
            let mut selected_process = spawn(&selected);
            let mut other_process = spawn(&other);
            std::thread::sleep(Duration::from_millis(100));
            assert!(selected_process.0.try_wait().unwrap().is_none());
            assert!(other_process.0.try_wait().unwrap().is_none());
            // The legacy/late-start check retains its refusal behavior.
            assert!(Startup::prepare(&selected, &root).is_err());
            let startup = Startup::prepare_replacing(&selected, &root).unwrap();
            assert!(!selected_process.0.wait().unwrap().success());
            assert!(other_process.0.try_wait().unwrap().is_none());
            startup.recheck().unwrap();
            let mut late_process = spawn(&selected);
            std::thread::sleep(Duration::from_millis(100));
            assert!(startup.recheck().is_err());
            assert!(late_process.0.try_wait().unwrap().is_none());
        }
        fs::remove_dir_all(root).unwrap();
    }
}

#[cfg(any(windows, test))]
use std::path::Path;
#[cfg(any(windows, test))]
fn same_path(left: &Path, right: &Path) -> bool {
        let normalize = |path: &Path| {
            path.to_string_lossy()
                .trim_start_matches(r"\\?\")
                .replace('/', "\\")
                .to_lowercase()
        };
        normalize(left) == normalize(right)
    }
#[cfg(any(windows, test))]
#[derive(Default)]
struct LoadedClient { won_module: bool, won_original: bool }
#[cfg(any(windows, test))]
impl LoadedClient {
    fn observe(&mut self, path: &Path, game: &Path) -> bool {
        if ["client.dll", "client_mini.dll"].iter().any(|name| same_path(path, &game.join("cl_dlls").join(name))) { return true; }
        self.won_module |= same_path(path, &game.join("cl_dlls/16cmod.dll"));
        self.won_original |= game.parent().is_some_and(|root| same_path(path, &root.join("client_original.dll")));
        self.won_module && self.won_original
    }
}
#[cfg(test)]
mod client_tests {
    use super::*;
    #[test]
    fn recognizes_both_won_mod_directories_and_module_orders() {
        for directory in ["cstrike", "cstrk13"] {
            let game = std::path::PathBuf::from("C:/game").join(directory);
            let paths = [game.join("cl_dlls/16cmod.dll"), std::path::PathBuf::from("C:/game/client_original.dll")];
            for order in [[0, 1], [1, 0]] {
                let mut loaded = LoadedClient::default();
                assert!(!loaded.observe(&paths[order[0]], &game));
                assert!(loaded.observe(&paths[order[1]], &game));
            }
        }
    }
    #[test]
    fn rejects_other_installations_and_incomplete_won_pairs() {
        let game = Path::new("C:/game/cstrike");
        let mut loaded = LoadedClient::default();
        assert!(!loaded.observe(Path::new("C:/other/cstrike/cl_dlls/client.dll"), game));
        assert!(!loaded.observe(Path::new("C:/game/cstrike/cl_dlls/16cmod.dll"), game));
        assert!(!loaded.observe(Path::new("C:/other/client_original.dll"), game));
        for name in ["client.dll", "client_mini.dll"] {
            assert!(LoadedClient::default().observe(&game.join("cl_dlls").join(name), game));
        }
    }
}
