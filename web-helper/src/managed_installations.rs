//! Authenticated, opt-in Windows installation policy. No browser-supplied paths.
use crate::*;

#[derive(Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Entry {
    pub path: String,
    pub executable: String,
}
#[derive(Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Policy {
    pub cs13: Entry,
    pub cs16: Entry,
}

fn valid_path(path: &str) -> bool {
    let parts: Vec<_> = path.split('/').collect();
    path.len() <= 180
        && (2..=8).contains(&parts.len())
        && parts.iter().all(|part| {
            let base = part.split('.').next().unwrap_or("").to_ascii_uppercase();
            let reserved = ["CON", "PRN", "AUX", "NUL"].contains(&base.as_str())
                || (base.len() == 4
                    && (base.starts_with("COM") || base.starts_with("LPT"))
                    && matches!(base.as_bytes()[3], b'1'..=b'9'));
            !reserved
                && !part.is_empty()
                && part.len() <= 64
                && part
                    .as_bytes()
                    .first()
                    .is_some_and(|c| c.is_ascii_alphanumeric() || *c == b'_')
                && !part.ends_with(['.', ' '])
                && part
                    .bytes()
                    .all(|c| c.is_ascii_alphanumeric() || b"_. -".contains(&c))
        })
}
impl Policy {
    fn validate(&self) -> Result<(), String> {
        if !valid_path(&self.cs13.path)
            || !valid_path(&self.cs16.path)
            || self.cs13.path.eq_ignore_ascii_case(&self.cs16.path)
            || self.cs13.executable != "hl.exe"
            || !["auto", "hl.exe", "cstrike.exe"].contains(&self.cs16.executable.as_str())
        {
            return Err("Invalid partner installation policy".into());
        }
        Ok(())
    }
    pub fn resolve(&self, game: &str) -> Result<(PathBuf, PathBuf, String), String> {
        self.validate()?;
        if !cfg!(windows) {
            return Err("Partner installation policy requires Windows".into());
        }
        let entry = match game {
            "cs13" => &self.cs13,
            "cs16" => &self.cs16,
            _ => return Err("Invalid game".into()),
        };
        for drive in b'C'..=b'Z' {
            let mut path = PathBuf::from(format!("{}:\\", drive as char));
            #[cfg(windows)]
            {
                use std::os::windows::ffi::OsStrExt;
                let wide: Vec<u16> = path.as_os_str().encode_wide().chain(Some(0)).collect();
                // Local fixed/removable volumes only, never network drive mappings.
                let kind = unsafe {
                    windows_sys::Win32::Storage::FileSystem::GetDriveTypeW(wide.as_ptr())
                };
                if kind != 2 && kind != 3 {
                    continue;
                }
            }
            let mut safe = true;
            for part in entry.path.split('/') {
                path.push(part);
                if !plain_directory(&path) {
                    safe = false;
                    break;
                }
            }
            if !safe {
                continue;
            }
            let Some((root, detected, mod_dir)) = validate_installation(&path, game) else {
                continue;
            };
            // Policy paths name the root, not a mod directory or a linked destination.
            if fs::canonicalize(&path).ok().as_ref() != Some(&root) {
                continue;
            }
            let exe = if entry.executable == "auto" {
                detected
            } else {
                root.join(&entry.executable)
            };
            if !plain_file(&exe) {
                continue;
            }
            // cstrike.exe is supported only for a recognized NextClient install.
            if entry.executable == "cstrike.exe"
                && (!root.join("nitro_api2.dll").is_file()
                    || !root.join("cstrike/cl_dlls/client_mini.dll").is_file())
            {
                continue;
            }
            return Ok((root, exe, mod_dir));
        }
        Err("Partner game installation was not found. Reinstall the partner game package, then retry.".into())
    }
    pub fn folders(&self, prefs: &mut Preferences) {
        prefs.cs13 = self.resolve("cs13").ok().map(|value| value.0);
        prefs.cs16 = self.resolve("cs16").ok().map(|value| value.0);
    }
}
fn plain_metadata(path: &Path) -> Option<fs::Metadata> {
    let meta = fs::symlink_metadata(path).ok()?;
    if meta.file_type().is_symlink() {
        return None;
    }
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        if meta.file_attributes() & 0x400 != 0 {
            return None;
        }
    }
    Some(meta)
}
fn plain_directory(path: &Path) -> bool {
    plain_metadata(path).is_some_and(|m| m.is_dir())
}
fn plain_file(path: &Path) -> bool {
    plain_metadata(path).is_some_and(|m| m.is_file())
}

pub fn fetch(api: &str, token: &str) -> Result<Option<Policy>, String> {
    crate::assets::api(api, token)?;
    if !cfg!(windows) {
        return Ok(None);
    }
    let value = crate::partner::request(api, token, "/partners/branding/me", false)?;
    let branding = value.get("branding").ok_or("Invalid partner settings")?;
    if branding.is_null() {
        return Ok(None);
    }
    let policy = branding.get("managedInstallations");
    if policy.is_none() || policy.is_some_and(|v| v.is_null()) {
        return Ok(None);
    }
    let policy: Policy = serde_json::from_value(policy.unwrap().clone())
        .map_err(|_| "Invalid partner installation policy")?;
    policy.validate()?;
    Ok(Some(policy))
}
pub fn choose(api: &str, token: &str, game: &str) -> Result<(PathBuf, PathBuf, String), String> {
    if let Some(policy) = fetch(api, token)? {
        let found = policy.resolve(game)?;
        // The compatibility runtime consumes this preference immediately before launch.
        let mut prefs = settings_bridge::load()?;
        if game == "cs13" {
            prefs.cs13 = Some(found.0.clone());
        } else {
            prefs.cs16 = Some(found.0.clone());
        }
        settings_bridge::save(&prefs)?;
        Ok(found)
    } else {
        choose_installation(game)
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rejects_windows_path_escapes() {
        assert!(valid_path("OlagueR.GeyminG/cs13"));
        for path in [
            "C:/games/cs13",
            "//server/share",
            "../cs13",
            "games/../cs13",
            "games/CON.txt",
            "games/cs13.",
            "games/cs13 ",
            "games/a:b",
            "games/a|b",
            "games//cs13",
        ] {
            assert!(!valid_path(path), "{path}");
        }
    }
    #[test]
    fn rejects_executable_commands_and_same_root() {
        let mut policy = Policy {
            cs13: Entry {
                path: "games/cs13".into(),
                executable: "hl.exe".into(),
            },
            cs16: Entry {
                path: "games/cs16".into(),
                executable: "auto".into(),
            },
        };
        assert!(policy.validate().is_ok());
        policy.cs16.executable = "cmd.exe".into();
        assert!(policy.validate().is_err());
        policy.cs16.executable = "auto".into();
        policy.cs16.path = "GAMES/CS13".into();
        assert!(policy.validate().is_err());
    }
}
