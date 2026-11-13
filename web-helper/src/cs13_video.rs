//! First-run defaults for the verified WON launcher; saved in-game choices win.
//! hl.exe SHA-256 525c1a32a520bbde8857e8dc3ed1e5bbc8b2ef5620bc6cdbcdbc72c34542bace:
//! 0x00423ec7 reads EngineModeW/H (default 640x480), via 0x004a2254 and
//! GetSectionKey at 0x004a220e under HKCU/Software/Valve/Half-Life/Settings.
//! No game files or recurring resolution arguments are changed.

fn initial_mode(width: u32, height: u32) -> (u32, u32) {
    [(640, 480), (800, 600), (1024, 768), (1152, 864), (1280, 960)]
        .into_iter()
        .filter(|(w, h)| *w <= width && *h <= height)
        .last()
        .unwrap_or((640, 480))
}

#[cfg(windows)]
mod registry {
    use windows_sys::Win32::{Foundation::{ERROR_FILE_NOT_FOUND, ERROR_SUCCESS}, System::Registry::*};
    use std::ptr::{null, null_mut};

    struct Key(HKEY);
    impl Drop for Key { fn drop(&mut self) { unsafe { RegCloseKey(self.0); } } }
    fn wide(value: &str) -> Vec<u16> { value.encode_utf16().chain([0]).collect() }

    // Missing is the only state that permits initialization. Existing values,
    // including unfamiliar formats and partial settings, belong to the player.
    unsafe fn missing(key: HKEY, name: &str) -> bool {
        RegQueryValueExW(key, wide(name).as_ptr(), null(), null_mut(), null_mut(), null_mut()) == ERROR_FILE_NOT_FOUND
    }

    pub(super) fn initialize(parent: HKEY, path: &str, mode: (u32, u32)) -> Result<(), u32> {
        let mut key = null_mut();
        let result = unsafe { RegCreateKeyExW(parent, wide(path).as_ptr(), 0, null(), 0,
            KEY_QUERY_VALUE | KEY_SET_VALUE | KEY_WOW64_32KEY, null(), &mut key, null_mut()) };
        if result != ERROR_SUCCESS { return Err(result); }
        let key = Key(key);
        if !unsafe { missing(key.0, "EngineModeW") && missing(key.0, "EngineModeH") } { return Ok(()); }
        for (name, value) in [("EngineModeW", mode.0), ("EngineModeH", mode.1)] {
            let result = unsafe { RegSetValueExW(key.0, wide(name).as_ptr(), 0, REG_DWORD, value.to_le_bytes().as_ptr(), 4) };
            if result != ERROR_SUCCESS { return Err(result); }
        }
        Ok(())
    }

    #[test]
    fn initializes_missing_dimensions_once_and_preserves_player_settings() {
        let path = format!("Software\\16CompetitiveTests\\{}", uuid::Uuid::new_v4());
        let read = |name: &str| {
            let mut value = 0u32; let mut bytes = 4;
            let result = unsafe { RegGetValueW(HKEY_CURRENT_USER, wide(&path).as_ptr(), wide(name).as_ptr(),
                RRF_RT_REG_DWORD | RRF_SUBKEY_WOW6432KEY, null_mut(), (&mut value as *mut u32).cast(), &mut bytes) };
            assert_eq!(result, ERROR_SUCCESS); value
        };
        initialize(HKEY_CURRENT_USER, &path, (1280, 960)).unwrap();
        assert_eq!((read("EngineModeW"), read("EngineModeH")), (1280, 960));
        initialize(HKEY_CURRENT_USER, &path, (1024, 768)).unwrap();
        assert_eq!((read("EngineModeW"), read("EngineModeH")), (1280, 960));
        unsafe { assert_eq!(RegDeleteTreeW(HKEY_CURRENT_USER, wide(&path).as_ptr()), ERROR_SUCCESS); }
    }
}

#[cfg(windows)]
pub(crate) fn prepare(executable: &std::path::Path, width: u32, height: u32) {
    use crate::windows_native::{digest, read_limited};
    let verified = read_limited(executable, 32 * 1024 * 1024)
        .is_ok_and(|bytes| digest(&bytes) == "525c1a32a520bbde8857e8dc3ed1e5bbc8b2ef5620bc6cdbcdbc72c34542bace");
    if !verified { return; }
    if let Err(code) = registry::initialize(windows_sys::Win32::System::Registry::HKEY_CURRENT_USER,
        "Software\\Valve\\Half-Life\\Settings", initial_mode(width, height)) {
        eprintln!("Legacy first-run video defaults unavailable (Windows error {code}); retaining game defaults");
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn fits_verified_legacy_modes_to_the_current_display() {
        for (display, expected) in [((1920,1080),(1280,960)), ((1366,768),(1024,768)),
            ((3840,2160),(1280,960)), ((800,600),(800,600)), ((640,480),(640,480))] {
            assert_eq!(initial_mode(display.0, display.1), expected);
        }
    }
}
