use std::{
    fs::{File, OpenOptions},
    io::{self, Read, Seek, SeekFrom, Write},
    path::Path,
};

const COOLDOWN_MS: u64 = 60_000;

pub struct NoticeGuard {
    file: File,
}

impl Drop for NoticeGuard {
    fn drop(&mut self) {
        // A concurrent fork can retain the open-file description until exec.
        // Dismissal must release ownership even while that descriptor survives.
        if let Err(error) = fs2::FileExt::unlock(&self.file) {
            eprintln!("Could not release native notice lock: {error}");
        }
    }
}

// Protocol requests run in separate processes. Keep the file locked for the
// dialog's whole lifetime so even a slow dismissal cannot stack another one.
pub fn acquire(path: &Path, now_ms: u64) -> io::Result<Option<NoticeGuard>> {
    let mut options = OpenOptions::new();
    options.read(true).write(true).create(true).truncate(false);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600).custom_flags(libc::O_NOFOLLOW);
    }
    let file = options.open(path)?;
    match fs2::FileExt::try_lock_exclusive(&file) {
        Ok(()) => {}
        // Windows reports ERROR_LOCK_VIOLATION as Uncategorized, so compare
        // fs2's platform-specific contention code rather than ErrorKind.
        Err(error) if error.raw_os_error() == fs2::lock_contended_error().raw_os_error() => {
            return Ok(None)
        }
        Err(error) => return Err(error),
    }
    let mut guard = NoticeGuard { file };
    let file = &mut guard.file;
    let mut previous = String::new();
    (&mut *file).take(32).read_to_string(&mut previous)?;
    if let Ok(previous_ms) = previous.trim().parse::<u64>() {
        if now_ms
            .checked_sub(previous_ms)
            .is_some_and(|elapsed| elapsed < COOLDOWN_MS)
        {
            return Ok(None);
        }
    }
    file.seek(SeekFrom::Start(0))?;
    file.set_len(0)?;
    write!(file, "{now_ms}")?;
    file.sync_data()?;
    Ok(Some(guard))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{
        fs,
        time::{SystemTime, UNIX_EPOCH},
    };

    #[cfg(unix)]
    #[test]
    fn dismissal_releases_lock_with_an_inherited_descriptor() {
        let path =
            std::env::temp_dir().join(format!("16c-notice-inherited-{}", uuid::Uuid::new_v4()));
        let owner = acquire(&path, 100_000).unwrap().unwrap();
        let inherited = owner.file.try_clone().unwrap();
        drop(owner);
        assert!(acquire(&path, 159_999).unwrap().is_none());
        let replacement = acquire(&path, 160_000)
            .unwrap()
            .expect("dismissed notice releases ownership");
        drop(inherited);
        assert!(acquire(&path, 220_000).unwrap().is_none());
        drop(replacement);
        assert!(acquire(&path, 220_000).unwrap().is_some());
        fs::remove_file(path).unwrap();
    }

    #[test]
    fn busy_notice_shows_immediately_then_at_most_once_per_minute() {
        let path = std::env::temp_dir().join(format!(
            "16c-notice-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let guard = acquire(&path, 100_000).unwrap().expect("first notice");
        assert!(
            acquire(&path, 160_000).unwrap().is_none(),
            "open dialog blocks stacking even after cooldown"
        );
        drop(guard);
        assert!(acquire(&path, 159_999).unwrap().is_none());
        assert!(acquire(&path, 160_000).unwrap().is_some());
        assert!(acquire(&path, 160_001).unwrap().is_none());
        fs::remove_file(path).unwrap();
    }

    #[test]
    fn a_clock_reset_does_not_suppress_the_notice_forever() {
        let path = std::env::temp_dir().join(format!("16c-notice-clock-{}", std::process::id()));
        fs::write(&path, "9999999999999").unwrap();
        assert!(acquire(&path, 100_000).unwrap().is_some());
        fs::remove_file(path).unwrap();
    }
}
