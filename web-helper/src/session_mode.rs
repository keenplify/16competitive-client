//! Cross-process exclusion: a native session cannot coexist with helper Electron actions.
use std::{
    fs::{self, File, OpenOptions},
    path::Path,
};

pub struct Lease {
    _file: File,
}
impl Drop for Lease {
    fn drop(&mut self) {
        // A concurrently spawned child briefly inherits this file until exec.
        // Closing our descriptor alone leaves flock held by that child. Release
        // ownership explicitly so stale status cannot survive the owner's drop.
        let _ = fs2::FileExt::unlock(&self._file);
    }
}
impl Lease {
    pub fn native_wait(directory: &Path) -> Result<Self, String> {
        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(10);
        loop {
            match Self::native(directory) {
                Err(error)
                    if error == "A native helper action is already running"
                        && std::time::Instant::now() < deadline =>
                {
                    std::thread::sleep(std::time::Duration::from_millis(100));
                }
                result => return result,
            }
        }
    }
    pub fn native(directory: &Path) -> Result<Self, String> {
        Self::acquire(directory, true)
    }
    pub fn electron(directory: &Path) -> Result<Self, String> {
        Self::acquire(directory, false)
    }
    fn acquire(directory: &Path, native: bool) -> Result<Self, String> {
        Self::acquire_named(directory, "session-mode.lock", native)
    }
    fn acquire_named(directory: &Path, name: &str, native: bool) -> Result<Self, String> {
        let path = directory.join(name);
        if let Ok(metadata) = fs::symlink_metadata(&path) {
            if !metadata.is_file() || metadata.file_type().is_symlink() {
                return Err("Invalid helper session lock".into());
            }
            #[cfg(windows)]
            {
                use std::os::windows::fs::MetadataExt;
                if metadata.file_attributes() & 0x400 != 0 {
                    return Err("Invalid helper session lock".into());
                }
            }
        }
        let mut options = OpenOptions::new();
        options.read(true).write(true).create(true).truncate(false);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600).custom_flags(libc::O_NOFOLLOW);
        }
        let file = options
            .open(path)
            .map_err(|_| "Helper session lock unavailable")?;
        let lock = if native {
            fs2::FileExt::try_lock_exclusive(&file)
        } else {
            fs2::FileExt::try_lock_shared(&file)
        };
        lock.map_err(|error| {
            if error.kind() == std::io::ErrorKind::WouldBlock
                || error.raw_os_error() == fs2::lock_contended_error().raw_os_error() {
                "A native helper action is already running"
            } else {
                "Helper session lock unavailable"
            }
        })?;
        Ok(Self { _file: file })
    }
}

/// A separate lock advertises voice takeover before waiting for the browser's
/// old microphone runtime. OS lock release clears ownership even after a crash.
pub struct VoiceOwnership {
    _lease: Lease,
    status: std::path::PathBuf,
}
impl VoiceOwnership {
    pub fn start(directory: &Path, match_id: &str) -> Result<Self, String> {
        // Browser status probes briefly take a shared lock. Retry contention;
        // never steal ownership from a live native session or retry IO failures.
        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(2);
        let lease = loop {
            match Lease::acquire_named(directory, "native-voice-owner.lock", true) {
                Err(error) if error == "A native helper action is already running"
                    && std::time::Instant::now() < deadline => {
                        std::thread::sleep(std::time::Duration::from_millis(25));
                    }
                result => break result?,
            }
        };
        let status = directory.join("native-voice-owner.json");
        crate::native_session::owned_write(
            &status,
            &serde_json::to_vec(&serde_json::json!({"matchId":match_id,"directory":null}))
                .map_err(|e| e.to_string())?,
        )?;
        Ok(Self {
            _lease: lease,
            status,
        })
    }
    pub fn ready(&self, match_id: &str, session: &Path) -> Result<(), String> {
        crate::native_session::owned_write(
            &self.status,
            &serde_json::to_vec(&serde_json::json!({"matchId":match_id,"directory":session}))
                .map_err(|e| e.to_string())?,
        )
    }
}
impl Drop for VoiceOwnership {
    fn drop(&mut self) {
        let _ = fs::remove_file(&self.status);
    }
}

fn bounded_json(path: &Path) -> Option<serde_json::Value> {
    use std::io::Read;
    let metadata = fs::symlink_metadata(path).ok()?;
    if !metadata.is_file() || metadata.file_type().is_symlink() || metadata.len() > 8192 {
        return None;
    }
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        if metadata.file_attributes() & 0x400 != 0 {
            return None;
        }
    }
    let mut options = OpenOptions::new();
    options.read(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.custom_flags(libc::O_NOFOLLOW);
    }
    let mut bytes = Vec::new();
    options
        .open(path)
        .ok()?
        .take(8193)
        .read_to_end(&mut bytes)
        .ok()?;
    if bytes.len() > 8192 {
        return None;
    }
    serde_json::from_slice(&bytes).ok()
}

pub fn voice_status(directory: &Path, match_id: &str) -> serde_json::Value {
    let inactive = serde_json::json!({"owned":false,"connected":false});
    // An unlocked descriptor is stale, regardless of its on-disk contents.
    match Lease::acquire_named(directory, "native-voice-owner.lock", false) {
        Ok(_) => return inactive,
        Err(error) if error == "A native helper action is already running" => {}
        Err(_) => return inactive,
    }
    let Some(value) = bounded_json(&directory.join("native-voice-owner.json")) else {
        return inactive;
    };
    if value["matchId"] != match_id {
        return inactive;
    }
    let connected = value["directory"]
        .as_str()
        .and_then(|path| {
            let path = Path::new(path);
            if !path.is_absolute() {
                return None;
            }
            bounded_json(&path.join("voice.state.json"))
        })
        .is_some_and(|voice| voice["connected"] == true && voice["joined"] == true);
    serde_json::json!({"owned":true,"connected":connected})
}

#[cfg(test)]
mod tests {
    use super::*;
    #[cfg(unix)]
    #[test]
    fn dropping_owner_releases_lock_even_with_inherited_descriptor() {
        // dup models the shared open-file description inherited during fork,
        // without forking the multithreaded test runner.
        let root = std::env::temp_dir().join(format!("16c-inherited-lease-{}", uuid::Uuid::new_v4()));
        fs::create_dir(&root).unwrap();
        let owner = VoiceOwnership::start(&root, "match-a").unwrap();
        let inherited = owner._lease._file.try_clone().unwrap();
        drop(owner);
        fs::write(root.join("native-voice-owner.json"), br#"{"matchId":"match-a"}"#).unwrap();
        assert_eq!(voice_status(&root, "match-a")["owned"], false);
        let replacement = VoiceOwnership::start(&root, "match-b").unwrap();
        drop(inherited);
        assert_eq!(voice_status(&root, "match-b")["owned"], true);
        drop(replacement);
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn voice_start_waits_for_a_short_status_probe() {
        let root = std::env::temp_dir().join(format!("16c-voice-probe-{}", uuid::Uuid::new_v4()));
        fs::create_dir(&root).unwrap();
        let probe = Lease::acquire_named(&root, "native-voice-owner.lock", false).unwrap();
        let release = std::thread::spawn(move || {
            std::thread::sleep(std::time::Duration::from_millis(100));
            drop(probe);
        });
        let owner = VoiceOwnership::start(&root, "match-a").unwrap();
        release.join().unwrap();
        assert_eq!(voice_status(&root, "match-a")["owned"], true);
        drop(owner);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn voice_ownership_is_match_scoped_and_stale_files_do_not_claim_audio() {
        let root = std::env::temp_dir().join(format!("16c-voice-owner-{}", uuid::Uuid::new_v4()));
        fs::create_dir(&root).unwrap();
        let owner = VoiceOwnership::start(&root, "match-a").unwrap();
        assert_eq!(voice_status(&root, "match-a")["owned"], true);
        assert_eq!(voice_status(&root, "match-b")["owned"], false);
        fs::write(
            root.join("voice.state.json"),
            br#"{"connected":true,"joined":true}"#,
        )
        .unwrap();
        owner.ready("match-a", &root).unwrap();
        assert_eq!(voice_status(&root, "match-a")["connected"], true);
        assert!(VoiceOwnership::start(&root, "match-b").is_err());
        drop(owner);
        fs::write(
            root.join("native-voice-owner.json"),
            br#"{"matchId":"match-a"}"#,
        )
        .unwrap();
        assert_eq!(voice_status(&root, "match-a")["owned"], false);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn native_excludes_every_electron_action_and_releases_on_exit() {
        let root = std::env::temp_dir().join(format!("16c-mode-{}", uuid::Uuid::new_v4()));
        fs::create_dir(&root).unwrap();
        let native = Lease::native(&root).unwrap();
        assert!(Lease::electron(&root).is_err());
        assert!(Lease::native(&root).is_err());
        drop(native);
        let first = Lease::electron(&root).unwrap();
        let second = Lease::electron(&root).unwrap();
        assert!(Lease::native(&root).is_err());
        drop(first);
        drop(second);
        drop(Lease::native(&root).unwrap());
        fs::remove_dir_all(root).unwrap();
    }
}
