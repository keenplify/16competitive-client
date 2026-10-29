//! Session-scoped presentation fetched only from a trusted platform API.
use super::*;
use std::io::Read;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct Branding {
    pub name: String,
    pub origin: String,
    pub rgba: Vec<u8>,
}
#[derive(Serialize, Deserialize)]
struct Stored {
    owner: String,
    expires: u64,
    branding: Option<Branding>,
}
fn now() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}
fn valid(b: &Branding) -> bool {
    !b.name.trim().is_empty()
        && b.name.len() <= 256
        && !b.name.chars().any(char::is_control)
        && competitive16_web_helper::partner_for_web_origin(&b.origin).is_some()
        && b.rgba.len() == 32 * 32 * 4
}
pub fn current() -> Option<Branding> {
    let bytes = fs::read(user_config_dir().ok()?.join("helper-branding.json")).ok()?;
    if bytes.len() > 32768 {
        return None;
    }
    let stored: Stored = serde_json::from_slice(&bytes).ok()?;
    if stored.expires < now() || stored.expires > now() + 60 {
        return None;
    }
    stored.branding.filter(valid)
}
fn write(owner: &str, branding: &Option<Branding>) -> Result<(), String> {
    let dir = user_config_dir()?;
    let path = dir.join("helper-branding.json");
    let temp = dir.join(format!("helper-branding-{}.tmp", uuid::Uuid::new_v4()));
    let mut options = OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    let mut file = options.open(&temp).map_err(|e| e.to_string())?;
    file.write_all(
        &serde_json::to_vec(&Stored {
            owner: owner.into(),
            expires: now() + 45,
            branding: branding.clone(),
        })
        .map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())?;
    drop(file);
    #[cfg(windows)]
    if path.exists() {
        fs::remove_file(&path).map_err(|e| e.to_string())?;
    }
    fs::rename(&temp, &path).map_err(|e| e.to_string())
}
fn response(agent: &ureq::Agent, url: &str, limit: u64) -> Result<Vec<u8>, String> {
    let mut bytes = Vec::new();
    agent
        .get(url)
        .call()
        .map_err(|_| "Branding request failed")?
        .into_reader()
        .take(limit + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| "Branding read failed")?;
    if bytes.len() as u64 > limit {
        return Err("Branding too large".into());
    }
    Ok(bytes)
}
fn decode(bytes: &[u8]) -> Result<Vec<u8>, String> {
    let mut decoder = png::Decoder::new(std::io::Cursor::new(bytes));
    decoder.set_limits(png::Limits {
        bytes: 32 * 1024 * 1024,
    });
    decoder.set_transformations(png::Transformations::EXPAND | png::Transformations::STRIP_16);
    let mut reader = decoder.read_info().map_err(|_| "Invalid partner icon")?;
    if reader.info().width == 0
        || reader.info().height == 0
        || reader.info().width > 2048
        || reader.info().height > 2048
    {
        return Err("Partner icon dimensions invalid".into());
    }
    let mut pixels = vec![0; reader.output_buffer_size()];
    let info = reader
        .next_frame(&mut pixels)
        .map_err(|_| "Invalid partner icon")?;
    let channels = match info.color_type {
        png::ColorType::Rgba => 4,
        png::ColorType::Rgb => 3,
        png::ColorType::GrayscaleAlpha => 2,
        png::ColorType::Grayscale => 1,
        _ => return Err("Unsupported partner icon".into()),
    };
    let scale = 32.0 / info.width.max(info.height) as f32;
    let width = ((info.width as f32 * scale) as usize).max(1);
    let height = ((info.height as f32 * scale) as usize).max(1);
    let mut rgba = vec![0; 4096];
    for y in 0..height {
        for x in 0..width {
            let source = ((y * info.height as usize / height) * info.width as usize
                + x * info.width as usize / width)
                * channels;
            let p = &pixels[source..source + channels];
            let pixel = match channels {
                4 => [p[0], p[1], p[2], p[3]],
                3 => [p[0], p[1], p[2], 255],
                2 => [p[0], p[0], p[0], p[1]],
                _ => [p[0], p[0], p[0], 255],
            };
            let target = (((32 - height) / 2 + y) * 32 + (32 - width) / 2 + x) * 4;
            rgba[target..target + 4].copy_from_slice(&pixel);
        }
    }
    Ok(rgba)
}
fn fetch(origin: &str) -> Result<Option<Branding>, String> {
    let Some(id) = competitive16_web_helper::partner_for_web_origin(origin) else {
        return Ok(None);
    };
    let api = "https://16competitive.papamo.dev";
    let agent = ureq::AgentBuilder::new()
        .timeout(Duration::from_secs(8))
        .redirects(0)
        .build();
    let data: serde_json::Value = serde_json::from_slice(&response(
        &agent,
        &format!("{api}/partners/branding/public/{id}"),
        128 * 1024,
    )?)
    .map_err(|_| "Invalid branding")?;
    let b = &data["branding"];
    if b["partnerId"].as_str() != Some(&id) {
        return Err("Partner mismatch".into());
    }
    let name = b["communityName"]
        .as_str()
        .or_else(|| b["appName"].as_str())
        .ok_or("Missing partner name")?;
    let app = &b["appIcon"];
    let (url, endpoint, hash) = if let Some(url) = app["pngUrl"].as_str() {
        (url, "app-icon", app["pngSha256"].as_str())
    } else {
        (
            b["logoUrl"].as_str().ok_or("Missing partner icon")?,
            "logo",
            None,
        )
    };
    let parsed = url::Url::parse(url).map_err(|_| "Invalid icon URL")?;
    if parsed.origin().ascii_serialization() != api
        || parsed.path() != format!("/partners/branding/{id}/{endpoint}")
        || !parsed.username().is_empty()
        || parsed.password().is_some()
        || parsed.fragment().is_some()
    {
        return Err("Unapproved icon URL".into());
    }
    let bytes = response(&agent, url, 2 * 1024 * 1024)?;
    if hash.is_some_and(|h| h != format!("{:x}", Sha256::digest(&bytes))) {
        return Err("Icon hash mismatch".into());
    }
    let branding = Branding {
        name: name.into(),
        origin: origin.into(),
        rgba: decode(&bytes)?,
    };
    if !valid(&branding) {
        return Err("Invalid branding".into());
    }
    Ok(Some(branding))
}
pub struct Lease {
    stop: Arc<AtomicBool>,
    worker: Option<std::thread::JoinHandle<()>>,
}
impl Lease {
    pub fn start(origin: &str) -> Self {
        let stop = Arc::new(AtomicBool::new(false));
        let stopping = stop.clone();
        let origin = origin.to_owned();
        let worker = std::thread::spawn(move || {
            let owner = uuid::Uuid::new_v4().to_string();
            let placeholder =
                competitive16_web_helper::partner_for_web_origin(&origin).map(|_| Branding {
                    name: origin.trim_start_matches("https://").into(),
                    origin: origin.clone(),
                    rgba: vec![0; 4096],
                });
            let _ = write(&owner, &placeholder); // Never flash platform/previous-partner branding.
            let branding = fetch(&origin).unwrap_or(placeholder);
            let owns = || {
                user_config_dir()
                    .ok()
                    .and_then(|dir| fs::read(dir.join("helper-branding.json")).ok())
                    .and_then(|bytes| serde_json::from_slice::<Stored>(&bytes).ok())
                    .is_some_and(|s| s.owner == owner)
            };
            while !stopping.load(Ordering::Relaxed) && owns() {
                let _ = write(&owner, &branding);
                for _ in 0..100 {
                    if stopping.load(Ordering::Relaxed) {
                        break;
                    }
                    std::thread::sleep(Duration::from_millis(100));
                }
            }
            if owns() {
                let _ = write(&owner, &None);
            }
        });
        Self {
            stop,
            worker: Some(worker),
        }
    }
}
impl Drop for Lease {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::Relaxed);
        if let Some(w) = self.worker.take() {
            let _ = w.join();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn malformed_icons_are_rejected() {
        assert!(decode(b"not a png").is_err());
    }
    #[test]
    fn icon_decode_is_bounded_and_rgba() {
        let rgba = decode(include_bytes!(
            "../../src/renderer/public/favicon-96x96.png"
        ))
        .unwrap();
        assert_eq!(rgba.len(), 4096);
        assert!(rgba.chunks_exact(4).any(|p| p[3] > 0));
        let mut b = Branding {
            name: "Partner".into(),
            origin: "https://evil.test".into(),
            rgba,
        };
        assert!(!valid(&b));
        b.origin = "https://counterstrike.olaguergeyming.com".into();
        assert!(valid(&b));
    }
}

pub fn text(value: &str) -> String {
    current().map(|b|value.replace("1.6 Competitive Helper",&b.name).replace("1.6 Competitive",&b.name)).unwrap_or_else(||value.into())
}
