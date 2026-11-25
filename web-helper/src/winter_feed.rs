use crate::native_session::owned_write;
use std::{fs, io::ErrorKind, path::Path};

const ATLAS: &[u8] = include_bytes!("../assets/16cwfeed1.spr");
const STOCK_LIST: &[u8] = include_bytes!("../assets/cs16-stock-hud.txt");
const ICONS: [&str; 5] = ["16wsnow", "16wrico", "16wflurry", "16wpolar", "16wcomet"];

fn definitions(original: &[u8]) -> Result<Vec<u8>, String> {
    let text = std::str::from_utf8(original).map_err(|_| "Unsupported HUD list encoding")?;
    let (count, body) = text.split_once('\n').ok_or("Missing HUD entries")?;
    let declared: usize = count.trim().parse().map_err(|_| "Invalid HUD count")?;
    let mut rows = Vec::new();
    for line in body.lines() {
        let line = line.split("//").next().unwrap_or("").trim();
        if line.is_empty() {
            continue;
        }
        let fields: Vec<_> = line.split_whitespace().collect();
        if fields.len() != 7 {
            return Err("Unsupported HUD entry".into());
        }
        rows.push(fields);
    }
    if declared < rows.len() || rows.len() > 4096 {
        return Err("Unsupported HUD count".into());
    }
    let mut extension = String::new();
    let mut added = 0;
    for res in ["320", "640"] {
        for (i, icon) in ICONS.iter().enumerate() {
            let name = format!("d_{icon}");
            let row = format!("{name} {res} 16cwfeed1 {} 0 24 24", i * 24);
            if let Some(existing) = rows.iter().find(|r| r[0] == name && r[1] == res) {
                if existing.join(" ") != row {
                    return Err("Winter HUD name already used".into());
                }
            } else {
                extension.push_str(&row);
                extension.push('\n');
                added += 1;
            }
        }
    }
    if added == 0 {
        return Ok(original.to_owned());
    }
    let separator = if body.ends_with('\n') { "" } else { "\n" };
    Ok(format!("{}\n{body}{separator}{extension}", rows.len() + added).into_bytes())
}

pub(crate) fn install(game: &Path) -> Result<(), String> {
    let game = fs::canonicalize(game).map_err(|e| e.to_string())?;
    let dir = game.join("sprites");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    if fs::canonicalize(&dir).map_err(|e| e.to_string())? != dir {
        return Err("Linked HUD directory".into());
    }
    let read = |name: &str| -> Result<Option<Vec<u8>>, String> {
        let path = dir.join(name);
        match fs::symlink_metadata(&path) {
            Ok(meta) if meta.is_file() && meta.len() < 512 * 1024 => {
                fs::read(path).map(Some).map_err(|e| e.to_string())
            }
            Ok(_) => Err("Unsupported HUD file".into()),
            Err(e) if e.kind() == ErrorKind::NotFound => Ok(None),
            Err(e) => Err(e.to_string()),
        }
    };
    let current = read("hud.txt")?;
    let list = definitions(current.as_deref().unwrap_or(STOCK_LIST))?;
    match read("16cwfeed1.spr")? {
        None => owned_write(&dir.join("16cwfeed1.spr"), ATLAS)?,
        Some(data) if data == ATLAS => (),
        Some(_) => return Err("Winter sprite name already used".into()),
    }
    if current.as_ref() != Some(&list) {
        if read("hud.txt")? != current {
            return Err("HUD list changed during installation".into());
        }
        owned_write(&dir.join("hud.txt"), &list)?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn preserves_hud_rows_and_registers_every_icon_once() {
        let list = definitions(STOCK_LIST).unwrap();
        assert_eq!(definitions(&list).unwrap(), list);
        assert!(std::str::from_utf8(&list)
            .unwrap()
            .contains("d_16wpolar 640 16cwfeed1 72 0 24 24"));
        assert_eq!(list.windows(10).filter(|w| *w == b"16cwfeed1 ").count(), 10);
    }
}
