//! Native session settings; no Electron, game console, or player config access.
use crate::{native_session::owned_write, settings_bridge::NativePreferences};
use std::io::Read;
use std::{fs, path::Path};

fn remove(path: &Path) -> Result<(), String> {
    match fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error.to_string()),
    }
}

pub(crate) fn goldsrc_key(key: &str) -> Option<u8> {
    if key.len() == 1 {
        let byte = key.as_bytes()[0];
        return (byte.is_ascii_uppercase() || byte.is_ascii_digit())
            .then_some(byte.to_ascii_lowercase());
    }
    if let Some(number) = key.strip_prefix('F').and_then(|s| s.parse::<u8>().ok()) {
        return ((1..=12).contains(&number) && key == format!("F{number}")).then(|| 134 + number);
    }
    Some(match key {
        "SPACE" => 32,
        "CTRL" => 133,
        "SHIFT" => 134,
        "ALT" => 132,
        "ENTER" => 13,
        "TAB" => 9,
        "ESCAPE" => 27,
        "BACKSPACE" => 127,
        "UPARROW" => 128,
        "DOWNARROW" => 129,
        "LEFTARROW" => 130,
        "RIGHTARROW" => 131,
        "INS" => 147,
        "DEL" => 148,
        "HOME" => 151,
        "END" => 152,
        "PGUP" => 150,
        "PGDN" => 149,
        "MOUSE1" => 241,
        "MOUSE2" => 242,
        "MOUSE3" => 243,
        "MOUSE4" => 244,
        "MOUSE5" => 245,
        _ => return None,
    })
}

/// PTT keys are consumed once by the native module, before its input worker starts.
pub(crate) fn initialize(directory: &Path, settings: &NativePreferences) -> Result<(), String> {
    settings.validate()?;
    let team = goldsrc_key(&settings.voice_ptt_keys[0]).ok_or("Invalid team voice key")?;
    let party = goldsrc_key(&settings.voice_ptt_keys[1]).ok_or("Invalid party voice key")?;
    owned_write(
        &directory.join("ptt.keys"),
        format!("{team} {party}\n").as_bytes(),
    )?;
    owned_write(
        &directory.join("player-ping.key"),
        format!("{}\n", settings.player_ping_key).as_bytes(),
    )?;
    refresh(directory, settings)
}

/// Only files that the native worker reloads belong here. Validation precedes writes.
pub(crate) fn refresh(directory: &Path, settings: &NativePreferences) -> Result<(), String> {
    settings.validate()?;
    for (name, enabled) in [
        ("overlay.enabled", settings.enhancements_enabled),
        // Native sessions always own the HUD; launcher visibility is independent.
        ("hud-lightweight.enabled", true),
    ] {
        let path = directory.join(name);
        if enabled {
            owned_write(&path, b"1\n")?;
        } else {
            remove(&path)?;
        }
    }
    let crosshair = directory.join("crosshair.conf");
    match settings
        .crosshair_config
        .as_ref()
        .filter(|_| settings.enhancements_enabled)
    {
        Some(value) => owned_write(&crosshair, value.as_bytes()),
        None => remove(&crosshair),
    }
}

/// Bounded reads from the helper's own preference file. Keep the last valid
/// settings during an incomplete write; never consume a symlink or device.
pub(crate) fn read_settings(path: &Path) -> Result<NativePreferences, String> {
    Ok(read_preferences(path)?.settings)
}

pub(crate) fn read_preferences(path: &Path) -> Result<crate::Preferences, String> {
    let metadata = fs::symlink_metadata(path).map_err(|e| e.to_string())?;
    if !metadata.is_file() || metadata.file_type().is_symlink() || metadata.len() > 16384 {
        return Err("Invalid local helper settings".into());
    }
    let mut options = fs::OpenOptions::new();
    options.read(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.custom_flags(libc::O_NOFOLLOW | libc::O_NONBLOCK);
    }
    let file = options.open(path).map_err(|e| e.to_string())?;
    if !file.metadata().map_err(|e| e.to_string())?.is_file() {
        return Err("Invalid local helper settings".into());
    }
    let mut bytes = Vec::new();
    file.take(16385)
        .read_to_end(&mut bytes)
        .map_err(|e| e.to_string())?;
    if bytes.len() > 16384 {
        return Err("Invalid local helper settings".into());
    }
    let preferences: crate::Preferences =
        serde_json::from_slice(&bytes).map_err(|_| "Invalid local helper settings")?;
    preferences.settings.validate()?;
    Ok(preferences)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn native_crosshair_and_input_setup_without_electron() {
        let directory =
            std::env::temp_dir().join(format!("16c-preferences-{}", uuid::Uuid::new_v4()));
        fs::create_dir(&directory).unwrap();
        let mut settings = NativePreferences::default();
        settings.crosshair_config = Some("255 255 255 1 4 1 0 100 0 0\n".into());
        initialize(&directory, &settings).unwrap();
        assert_eq!(
            fs::read_to_string(directory.join("ptt.keys")).unwrap(),
            "107 118\n"
        );
        assert_eq!(
            fs::read_to_string(directory.join("player-ping.key")).unwrap(),
            "MOUSE3\n"
        );
        assert_eq!(
            fs::read_to_string(directory.join("crosshair.conf")).unwrap(),
            settings.crosshair_config.clone().unwrap()
        );
        settings.crosshair_config = Some("0 255 0 2 3 1 0 100 0 0\n".into());
        refresh(&directory, &settings).unwrap();
        assert_eq!(
            fs::read_to_string(directory.join("crosshair.conf")).unwrap(),
            settings.crosshair_config.clone().unwrap()
        );
        // Same wire fixture accepted by the native cosmetic module's CS2 parser.
        settings.crosshair_config =
            Some("cs2 50 250 50 255 0 0 0 255 4 2 0 2 1 0 0 0 1080 255 3 0 100 100 100 0\n".into());
        refresh(&directory, &settings).unwrap();
        assert_eq!(
            fs::read_to_string(directory.join("crosshair.conf")).unwrap(),
            settings.crosshair_config.clone().unwrap()
        );
        settings.enhancements_enabled = false;
        refresh(&directory, &settings).unwrap();
        assert!(!directory.join("crosshair.conf").exists());
        assert!(!directory.join("overlay.enabled").exists());
        settings.crosshair_config = Some("invalid".into());
        assert!(refresh(&directory, &settings).is_err());
        assert!(!directory.join("crosshair.conf").exists());
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn input_codes_match_goldsrc() {
        for (key, code) in [
            ("K", 107),
            ("V", 118),
            ("0", 48),
            ("F1", 135),
            ("F12", 146),
            ("CTRL", 133),
            ("MOUSE3", 243),
            ("PGUP", 150),
        ] {
            assert_eq!(goldsrc_key(key), Some(code));
        }
        for key in ["", "F0", "F13", "F255", "F01", "NONE", "K\n", "é"] {
            assert_eq!(goldsrc_key(key), None);
        }
    }

    #[test]
    fn settings_reader_bounds_and_validates_local_input() {
        let directory =
            std::env::temp_dir().join(format!("16c-settings-read-{}", uuid::Uuid::new_v4()));
        fs::create_dir(&directory).unwrap();
        let path = directory.join("web-helper.json");
        let mut preferences = crate::Preferences::default();
        fs::write(&path, serde_json::to_vec(&preferences).unwrap()).unwrap();
        assert!(read_settings(&path).is_ok());
        preferences.settings.voice_ptt_keys = vec!["K".into(), "K".into()];
        fs::write(&path, serde_json::to_vec(&preferences).unwrap()).unwrap();
        assert!(read_settings(&path).is_err());
        fs::write(&path, vec![b' '; 16385]).unwrap();
        assert!(read_settings(&path).is_err());
        assert!(read_settings(&directory).is_err());
        #[cfg(unix)]
        {
            let link = directory.join("link.json");
            std::os::unix::fs::symlink(&path, &link).unwrap();
            assert!(read_settings(&link).is_err());
        }
        fs::remove_dir_all(directory).unwrap();
    }
}

static LIVE_SOURCE: std::sync::OnceLock<std::path::PathBuf> = std::sync::OnceLock::new();
pub fn set_live_source(path: std::path::PathBuf) -> Result<(), String> {
    read_settings(&path)?;
    LIVE_SOURCE
        .set(path)
        .map_err(|_| "Compatibility preferences already selected".into())
}
pub fn live_source() -> Result<std::path::PathBuf, String> {
    LIVE_SOURCE
        .get()
        .cloned()
        .map(Ok)
        .unwrap_or_else(crate::preference_path)
}
pub fn live_settings() -> Result<NativePreferences, String> {
    read_settings(&live_source()?)
}
