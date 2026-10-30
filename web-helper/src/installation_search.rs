//! Bounded, read-only search confined to a folder explicitly chosen by the user.
use std::{collections::VecDeque, fs, path::Path, time::{Duration, Instant}};

pub fn find<T>(folder: &Path, mut validate: impl FnMut(&Path) -> Option<T>) -> Option<T> {
    if let Some(value) = validate(folder) {
        return Some(value);
    }
    let root = folder.canonicalize().ok()?;
    let started = Instant::now();
    let mut queue = VecDeque::from([(root.clone(), 0usize)]);
    let mut entries_left = 4096usize;
    let mut directories_left = 512usize;
    while let Some((directory, depth)) = queue.pop_front() {
        if entries_left == 0 || directories_left == 0 || started.elapsed() > Duration::from_secs(5) {
            break;
        }
        directories_left -= 1;
        // A candidate is always validated by the game-specific validator, even
        // when it contains hl.exe: executable names alone are not version evidence.
        if depth > 0 {
            if let Some(value) = validate(&directory) {
                return Some(value);
            }
        }
        if depth >= 8 { continue; }
        let Ok(entries) = fs::read_dir(&directory) else { continue; };
        let mut children = Vec::new();
        for entry in entries {
            if entries_left == 0 || started.elapsed() > Duration::from_secs(5) { break; }
            entries_left -= 1;
            let Ok(entry) = entry else { continue; };
            let Ok(kind) = entry.file_type() else { continue; };
            if !kind.is_dir() || kind.is_symlink() { continue; }
            // Windows junctions/reparse points must not escape or cycle either.
            #[cfg(windows)] {
                use std::os::windows::fs::MetadataExt;
                if entry.metadata().map_or(true, |meta| meta.file_attributes() & 0x400 != 0) { continue; }
            }
            let Ok(child) = entry.path().canonicalize() else { continue; };
            if child.starts_with(&root) { children.push(child); }
        }
        children.sort();
        let remaining = 512usize.saturating_sub(queue.len());
        queue.extend(children.into_iter().take(remaining).map(|child| (child, depth + 1)));
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;
    #[test]
    fn searches_nested_folders_and_keeps_requested_version() {
        let root = std::env::temp_dir().join(format!("installation-search-{}", uuid::Uuid::new_v4()));
        for (path, version) in [("a/modern", "1.6"), ("b/legacy", "1.3")] {
            fs::create_dir_all(root.join(path)).unwrap();
            fs::write(root.join(path).join("hl.exe"), version).unwrap();
        }
        for (version, expected) in [("1.3", "b/legacy"), ("1.6", "a/modern")] {
            let found = find(&root, |path| {
                (fs::read_to_string(path.join("hl.exe")).ok()?.as_str() == version).then(|| path.to_path_buf())
            });
            assert_eq!(found, Some(root.canonicalize().unwrap().join(expected)));
        }
        assert!(find(&root, |_| None::<PathBuf>).is_none());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn direct_selection_wins_and_search_has_a_depth_limit() {
        let root = std::env::temp_dir().join(format!("search-depth-{}", uuid::Uuid::new_v4()));
        let deep = (0..10).fold(root.clone(), |path, _| path.join("nested"));
        fs::create_dir_all(&deep).unwrap();
        let root = root.canonicalize().unwrap();
        let deep = deep.canonicalize().unwrap();
        assert_eq!(find(&root, |path| Some(path.to_path_buf())), Some(root.clone()));
        assert!(find(&root, |path| (path == deep).then(|| path.to_path_buf())).is_none());
        fs::remove_dir_all(root).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn does_not_follow_directory_links() {
        let root = std::env::temp_dir().join(format!("search-link-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(root.join("selected")).unwrap();
        fs::create_dir_all(root.join("outside")).unwrap();
        std::os::unix::fs::symlink(root.join("outside"), root.join("selected/link")).unwrap();
        let outside = root.join("outside").canonicalize().unwrap();
        assert!(find(&root.join("selected"), |path| (path == outside).then(|| path.to_path_buf())).is_none());
        fs::remove_dir_all(root).unwrap();
    }
}
