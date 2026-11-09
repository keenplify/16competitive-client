//! Prepare WON's server-selected mod folder without launching Electron.
//! Copy game assets only; user configuration is never inspected or copied.
use std::{
    fs,
    io::{self, Read},
    path::Path,
};

fn directory(path: &Path) -> Result<(), String> {
    match fs::create_dir(path) {
        Ok(()) => (),
        Err(e) if e.kind() == io::ErrorKind::AlreadyExists => (),
        Err(e) => return Err(e.to_string()),
    }
    let info = fs::symlink_metadata(path).map_err(|e| e.to_string())?;
    if !info.is_dir() || info.file_type().is_symlink() {
        return Err("Unsafe CS 1.3 asset directory".into());
    }
    Ok(())
}
fn asset(name: &str) -> bool {
    Path::new(name)
        .extension()
        .and_then(|s| s.to_str())
        .is_some_and(|ext| {
            [
                "mdl", "bsp", "wad", "spr", "wav", "mp3", "tga", "bmp", "pcx", "txt", "res", "lst",
                "sc", "pak", "avi",
            ]
            .contains(&ext.to_ascii_lowercase().as_str())
        })
}
#[derive(Default)]
struct Budget {
    files: usize,
    bytes: u64,
}
impl Budget {
    fn copy_missing(&mut self, source: &Path, destination: &Path) -> Result<(), String> {
        let info = fs::symlink_metadata(source).map_err(|e| e.to_string())?;
        if !info.is_file() || info.file_type().is_symlink() {
            return Err("Unsafe CS 1.3 source asset".into());
        }
        self.files += 1;
        self.bytes = self
            .bytes
            .checked_add(info.len())
            .ok_or("CS 1.3 assets exceed copy limits")?;
        if self.files > 30_000 || self.bytes > 4 * 1024 * 1024 * 1024 {
            return Err("CS 1.3 assets exceed copy limits".into());
        }
        match fs::symlink_metadata(destination) {
            Ok(info) if info.is_file() && !info.file_type().is_symlink() => return Ok(()),
            Ok(_) => return Err("Unsafe existing CS 1.3 asset".into()),
            Err(e) if e.kind() == io::ErrorKind::NotFound => (),
            Err(e) => return Err(e.to_string()),
        }
        let temporary = destination.with_extension(format!("{}.16c-tmp", uuid::Uuid::new_v4()));
        let result = (|| {
            let input = fs::File::open(source).map_err(|e| e.to_string())?;
            let mut output = fs::OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(&temporary)
                .map_err(|e| e.to_string())?;
            let copied = io::copy(&mut input.take(info.len() + 1), &mut output)
                .map_err(|e| e.to_string())?;
            if copied != info.len() {
                return Err("CS 1.3 source asset changed during preparation".into());
            }
            output.sync_all().map_err(|e| e.to_string())?;
            drop(output);
            match fs::hard_link(&temporary, destination) {
                Ok(()) => Ok(()),
                Err(e) if e.kind() == io::ErrorKind::AlreadyExists => {
                    let info = fs::symlink_metadata(destination).map_err(|e| e.to_string())?;
                    if info.is_file() && !info.file_type().is_symlink() {
                        Ok(())
                    } else {
                        Err("Unsafe existing CS 1.3 asset".into())
                    }
                }
                Err(e) => Err(e.to_string()),
            }
        })();
        let _ = fs::remove_file(temporary);
        result
    }
    fn walk(&mut self, source: &Path, destination: &Path, depth: usize) -> Result<(), String> {
        if depth > 12 {
            return Err("CS 1.3 asset directory is too deep".into());
        }
        for entry in fs::read_dir(source).map_err(|e| e.to_string())? {
            let entry = entry.map_err(|e| e.to_string())?;
            let name = entry.file_name();
            // This name must be rejected before querying metadata or opening it.
            if name.to_string_lossy().eq_ignore_ascii_case("config.cfg") {
                continue;
            }
            let kind = entry.file_type().map_err(|e| e.to_string())?;
            if kind.is_symlink() {
                continue;
            }
            let target = destination.join(&name);
            if kind.is_dir() {
                directory(&target)?;
                self.walk(&entry.path(), &target, depth + 1)?;
            } else if kind.is_file() && asset(&name.to_string_lossy()) {
                self.copy_missing(&entry.path(), &target)?;
            }
        }
        Ok(())
    }
}
pub fn prepare(root: &Path, game: &str) -> Result<String, String> {
    if game == "cstrk13" {
        return Ok(game.into());
    }
    if game != "cstrike" {
        return Err("Unsupported CS 1.3 mod directory".into());
    }
    let source = root.join(game);
    let target = root.join("cstrk13");
    directory(&target)?;
    if target.join("liblist.gam").exists()
        && !crate::installation_version::matches(root, "cstrk13", "cs13")
    {
        return Err("Existing cstrk13 directory is not a compatible CS 1.3 installation".into());
    }
    let mut budget = Budget::default();
    for name in [
        "models",
        "maps",
        "sprites",
        "sound",
        "gfx",
        "resource",
        "events",
        "media",
        "overviews",
    ] {
        let path = source.join(name);
        match fs::symlink_metadata(&path) {
            Ok(info) if info.is_dir() && !info.file_type().is_symlink() => {
                directory(&target.join(name))?;
                budget.walk(&path, &target.join(name), 0)?;
            }
            Ok(_) => (),
            Err(e) if e.kind() == io::ErrorKind::NotFound => (),
            Err(e) => return Err(e.to_string()),
        }
    }
    for entry in fs::read_dir(&source).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let name = entry.file_name();
        if name.to_string_lossy().eq_ignore_ascii_case("config.cfg") {
            continue;
        }
        if asset(&name.to_string_lossy()) && entry.file_type().map_err(|e| e.to_string())?.is_file()
        {
            budget.copy_missing(&entry.path(), &target.join(name))?;
        }
    }
    directory(&target.join("cl_dlls"))?;
    budget.copy_missing(
        &source.join("cl_dlls/client.dll"),
        &target.join("cl_dlls/client.dll"),
    )?;
    budget.copy_missing(&source.join("liblist.gam"), &target.join("liblist.gam"))?;
    if !crate::installation_version::matches(root, "cstrk13", "cs13") {
        return Err("Invalid prepared CS 1.3 installation".into());
    }
    Ok("cstrk13".into())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn prepares_server_mod_and_reuses_it_without_overwriting_player_assets() {
        let folder =
            std::env::temp_dir().join(format!("16c-cs13-prepare-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(folder.join("cstrike/cl_dlls")).unwrap();
        let root = folder.canonicalize().unwrap();
        fs::write(root.join("cstrike/liblist.gam"), b"version \"1.3\"\n").unwrap();
        fs::write(root.join("cstrike/cl_dlls/client.dll"), b"client").unwrap();
        fs::create_dir(root.join("cstrike/sprites")).unwrap();
        fs::write(root.join("cstrike/sprites/hud.txt"), b"original HUD").unwrap();
        assert_eq!(prepare(&root, "cstrike").unwrap(), "cstrk13");
        assert_eq!(
            fs::read(root.join("cstrk13/sprites/hud.txt")).unwrap(),
            b"original HUD"
        );
        fs::write(root.join("cstrk13/sprites/hud.txt"), b"user HUD").unwrap();
        assert_eq!(prepare(&root, "cstrike").unwrap(), "cstrk13");
        assert_eq!(
            fs::read(root.join("cstrk13/sprites/hud.txt")).unwrap(),
            b"user HUD"
        );
        fs::write(root.join("cstrk13/liblist.gam"), b"version \"1.6\"\n").unwrap();
        assert!(prepare(&root, "cstrike").is_err());
        fs::remove_dir_all(folder).unwrap();
    }
    #[test]
    fn copies_only_assets_and_preserves_existing_files() {
        let root = std::env::temp_dir().join(format!("16c-cs13-assets-{}", uuid::Uuid::new_v4()));
        let source = root.join("source");
        let target = root.join("target");
        fs::create_dir_all(&source).unwrap();
        fs::create_dir(&target).unwrap();
        fs::write(source.join("v_knife.mdl"), b"stock").unwrap();
        fs::write(source.join("hud.txt"), b"sprites").unwrap();
        fs::write(source.join("settings.cfg"), b"user-owned").unwrap();
        fs::write(target.join("v_knife.mdl"), b"player-change").unwrap();
        Budget::default().walk(&source, &target, 0).unwrap();
        assert_eq!(
            fs::read(target.join("v_knife.mdl")).unwrap(),
            b"player-change"
        );
        assert_eq!(fs::read(target.join("hud.txt")).unwrap(), b"sprites");
        assert!(!target.join("settings.cfg").exists());
        assert!(!asset("config.cfg"));
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn refuses_unsafe_destination_and_excessive_depth() {
        let root = std::env::temp_dir().join(format!("16c-cs13-unsafe-{}", uuid::Uuid::new_v4()));
        fs::create_dir(&root).unwrap();
        fs::write(root.join("asset"), b"ordinary").unwrap();
        assert!(directory(&root.join("asset")).is_err());
        assert!(Budget::default().walk(&root, &root, 13).is_err());
        #[cfg(unix)]
        {
            std::os::unix::fs::symlink(root.join("asset"), root.join("link")).unwrap();
            assert!(Budget::default()
                .copy_missing(&root.join("asset"), &root.join("link"))
                .is_err());
        }
        fs::remove_dir_all(root).unwrap();
    }
}
