//! Keep web selection consistent with the desktop CS 1.3 adapter.
//! Only bounded game metadata and the known AGC client binary are inspected.
use sha2::{Digest, Sha256};
use std::{fs::File, io::Read, path::Path};

// Same compatibility evidence as src/main/game/goldsrc-client-capabilities.ts.
const AGC_CLIENT_SHA256: &str =
    "71fdbe140df3598a74738537b924141f4fb4b0b828737bd99a7223d9e4549460";

fn read_contained(root: &Path, path: &Path, limit: u64) -> Option<Vec<u8>> {
    let path = path.canonicalize().ok()?;
    if !path.starts_with(root) {
        return None;
    }
    let file = File::open(path).ok()?;
    let metadata = file.metadata().ok()?;
    if !metadata.is_file() || metadata.len() > limit {
        return None;
    }
    let mut bytes = Vec::new();
    file.take(limit + 1).read_to_end(&mut bytes).ok()?;
    (bytes.len() as u64 <= limit).then_some(bytes)
}

fn version(source: &str) -> Option<String> {
    let field = regex::Regex::new(r#"(?i)^\s*version\s+"([^"]+)"\s*$"#).ok()?;
    let values: Vec<_> = source.lines().filter_map(|line| {
        let line = line.split_once("//").map_or(line, |(value, _)| value);
        field.captures(line).map(|capture| capture[1].to_owned())
    }).collect();
    (values.len() == 1).then(|| values[0].clone())
}

pub fn matches(root: &Path, mod_dir: &str, game: &str) -> bool {
    let Some(bytes) = read_contained(root, &root.join(mod_dir).join("liblist.gam"), 16_384) else {
        return false;
    };
    let version = version(&String::from_utf8_lossy(&bytes)).unwrap_or_default();
    let legacy = version == "1.3" || (version == "1.1"
        && !(cfg!(target_os = "linux") && root.join("hl_linux").is_file())
        && read_contained(root, &root.join(mod_dir).join("cl_dlls/client.dll"), 655_360)
            .is_some_and(|bytes| bytes.len() == 655_360
                && format!("{:x}", Sha256::digest(&bytes)) == AGC_CLIENT_SHA256));
    if game == "cs13" { legacy } else { version == "1.6" }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn metadata_accepts_whitespace_and_comments_but_not_ambiguous_versions() {
        assert_eq!(version("// version \"1.6\"\nVERSION\t\"1.3\" // legacy"), Some("1.3".into()));
        for value in ["", "// version \"1.3\"", "version \"1.3\"\nversion \"1.6\"", "version \"1.3\" junk"] {
            assert_eq!(version(value), None);
        }
    }

    #[test]
    fn rejects_wrong_version_unknown_agc_and_missing_mod() {
        let folder = std::env::temp_dir().join(format!("web-cs13-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(folder.join("cstrike/cl_dlls")).unwrap();
        let root = folder.canonicalize().unwrap();
        assert!(!matches(&root, "cstrike", "cs13"));
        for (metadata, legacy) in [("version \"1.3\"", true), ("version \"1.6\"", false), ("version \"1.1\"", false)] {
            std::fs::write(root.join("cstrike/liblist.gam"), metadata).unwrap();
            std::fs::write(root.join("cstrike/cl_dlls/client.dll"), vec![0; 655_360]).unwrap();
            assert_eq!(matches(&root, "cstrike", "cs13"), legacy);
        }
        std::fs::write(root.join("cstrike/liblist.gam"), vec![b' '; 16_385]).unwrap();
        assert!(!matches(&root, "cstrike", "cs13"));
        std::fs::remove_dir_all(folder).unwrap();
    }

    #[test]
    fn installed_agc_build_uses_exact_desktop_compatibility_hash() {
        let Some(folder) = std::env::var_os("CS13_AGC_TEST_ROOT") else { return; };
        let root = Path::new(&folder).canonicalize().unwrap();
        assert!(matches(&root, "cstrike", "cs13"));
        assert!(!matches(&root, "cstrike", "cs16"));
    }
}
