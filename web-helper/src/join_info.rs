//! Only launcher-owned key names are persisted. Player configuration is never read.
use std::{fs::{self, OpenOptions}, io::{Read, Write}, path::Path};

fn valid_key(key: &str) -> bool {
    key.len() == 21 && key.starts_with("_16c_")
        && key.as_bytes()[5..].iter().all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(b))
}

pub fn cleanup_commands(game_dir: &Path, current: &str) -> Result<String, String> {
    if !valid_key(current) { return Err("Invalid managed join key".into()); }
    let path = game_dir.join("16competitive_join_keys.txt");
    if let Ok(metadata) = fs::symlink_metadata(&path) {
        if !metadata.is_file() || metadata.file_type().is_symlink() {
            return Err("Unrecognized managed join-key history".into());
        }
    }
    let mut options = OpenOptions::new();
    options.read(true).append(true).create(true);
    #[cfg(unix)] {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600).custom_flags(libc::O_NOFOLLOW);
    }
    let mut file = options.open(path).map_err(|e| e.to_string())?;
    let mut contents = String::new();
    (&mut file).take(65537).read_to_string(&mut contents).map_err(|e| e.to_string())?;
    if contents.len() > 65536 || contents.lines().any(|key| !valid_key(key)) {
        return Err("Invalid managed join-key history".into());
    }
    let mut keys: std::collections::BTreeSet<&str> = contents.lines().collect();
    if keys.insert(current) {
        writeln!(file, "{current}").map_err(|e| e.to_string())?;
        file.sync_all().map_err(|e| e.to_string())?;
    }
    // CS uses server-selected models. These unused Half-Life preferences consume
    // the small legacy userinfo buffer before the token and password are applied.
    Ok(["_16c", "model", "topcolor", "bottomcolor"].into_iter()
        .chain(keys).map(|key| format!("setinfo \"{key}\" \"\"\n")).collect())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn remembers_only_managed_keys_and_clears_unused_fields() {
        let root = std::env::temp_dir().join(format!("16c-join-history-{}", std::process::id()));
        fs::create_dir_all(&root).unwrap();
        let first = "_16c_0123456789abcdef";
        let second = "_16c_fedcba9876543210";
        cleanup_commands(&root, first).unwrap();
        let commands = cleanup_commands(&root, second).unwrap();
        for key in [first, second, "_16c", "model", "topcolor", "bottomcolor"] {
            assert!(commands.contains(&format!("setinfo \"{key}\" \"\"\n")));
        }
        let history = root.join("16competitive_join_keys.txt");
        let before = fs::read(&history).unwrap();
        cleanup_commands(&root, second).unwrap();
        assert_eq!(before, fs::read(&history).unwrap());
        fs::write(&history, "name;quit\n").unwrap();
        assert!(cleanup_commands(&root, second).is_err());
        assert!(cleanup_commands(&root, "_16c_bad").is_err());
        fs::remove_dir_all(root).unwrap();
    }
}
