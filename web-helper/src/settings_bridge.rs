//! Short-lived, capability-authenticated loopback settings for the web UI.
//! No installation path is sent to the account or matchmaking API.
use super::*;
use std::io::Read;
use std::net::{TcpListener, TcpStream};
use std::time::Instant;

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Display {
    pub resolution: String,
    pub widescreen: bool,
}
#[derive(Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Resolution {
    pub width: u32,
    pub height: u32,
}
#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct NativePreferences {
    pub display: Display,
    pub current_display_resolution: Resolution,
    pub fast_switch_enabled: bool,
    pub enhancements_enabled: bool,
    pub lightweight_hud: bool,
    pub kill_cards_enabled: bool,
}
impl Default for NativePreferences {
    fn default() -> Self {
        Self {
            display: Display {
                resolution: "current".into(),
                widescreen: true,
            },
            current_display_resolution: Resolution {
                width: 1920,
                height: 1080,
            },
            fast_switch_enabled: true,
            enhancements_enabled: true,
            lightweight_hud: true,
            kill_cards_enabled: true,
        }
    }
}
impl NativePreferences {
    pub fn resolution(&self, game: &str) -> Result<(u32, u32), String> {
        let (mut w, h) = if self.display.resolution == "current" {
            let r = &self.current_display_resolution;
            if !self.display.widescreen && r.width * 2 > r.height * 3 {
                (r.height * 4 / 3 / 2 * 2, r.height)
            } else {
                (r.width, r.height)
            }
        } else {
            let (w, h) = self
                .display
                .resolution
                .split_once('x')
                .ok_or("Invalid resolution")?;
            (
                w.parse::<u32>().map_err(|_| "Invalid resolution")?,
                h.parse::<u32>().map_err(|_| "Invalid resolution")?,
            )
        };
        if !(320..=16384).contains(&w) || !(320..=16384).contains(&h) {
            return Err("Invalid resolution".into());
        }
        if self.display.resolution != "current" {
            const MODES: &[(u32, u32)] = &[
                (640, 480),
                (800, 600),
                (1024, 768),
                (1152, 864),
                (1280, 960),
                (1280, 1024),
                (1600, 1200),
                (1280, 720),
                (1366, 768),
                (1440, 900),
                (1600, 900),
                (1680, 1050),
                (1920, 1080),
                (1920, 1200),
                (2560, 1440),
                (2560, 1600),
                (3840, 2160),
            ];
            if !MODES.contains(&(w, h)) || (w * 2 > h * 3) != self.display.widescreen {
                return Err("Unsupported resolution".into());
            }
        }
        if game == "cs13" {
            let r = [
                (640, 480),
                (800, 600),
                (1024, 768),
                (1152, 864),
                (1280, 960),
            ]
            .into_iter()
            .filter(|(x, y)| *x <= w && *y <= h)
            .last()
            .unwrap_or((640, 480));
            return Ok(r);
        }
        // GoldSrc receives dimensions through process arguments, never a player config.
        w = w.max(320);
        Ok((w, h))
    }
    fn validate(&self) -> Result<(), String> {
        if !(320..=16384).contains(&self.current_display_resolution.width)
            || !(320..=16384).contains(&self.current_display_resolution.height)
        {
            return Err("Invalid display".into());
        }
        self.resolution("cs16").map(|_| ())
    }
}

pub fn load() -> Result<Preferences, String> {
    let path = preference_path()?;
    match fs::read(&path) {
        Ok(bytes) if bytes.len() <= 16384 => {
            let preferences: Preferences =
                serde_json::from_slice(&bytes).map_err(|_| "Invalid local helper settings")?;
            preferences.settings.validate()?;
            Ok(preferences)
        }
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(Preferences::default()),
        _ => Err("Could not read local helper settings".into()),
    }
}
pub fn save(value: &Preferences) -> Result<(), String> {
    let path = preference_path()?;
    fs::create_dir_all(path.parent().ok_or("Invalid preference path")?)
        .map_err(|e| e.to_string())?;
    let temp = path.with_extension(format!("{}.tmp", uuid::Uuid::new_v4()));
    let mut options = OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    let result = (|| {
        let mut file = options.open(&temp).map_err(|e| e.to_string())?;
        file.write_all(&serde_json::to_vec(value).map_err(|e| e.to_string())?)
            .map_err(|e| e.to_string())?;
        file.sync_all().map_err(|e| e.to_string())?;
        #[cfg(windows)]
        if path.exists() {
            fs::remove_file(&path).map_err(|e| e.to_string())?;
        }
        fs::rename(&temp, &path).map_err(|e| e.to_string())
    })();
    if result.is_err() {
        let _ = fs::remove_file(temp);
    }
    result
}

#[derive(Deserialize)]
#[serde(tag = "action", rename_all = "camelCase", deny_unknown_fields)]
enum Request {
    Get,
    Choose { game: String },
    Save { settings: NativePreferences },
}
fn apply(request: Request) -> Result<serde_json::Value, String> {
    let mut prefs = load()?;
    match request {
        Request::Get => {}
        Request::Choose { game } => {
            if !matches!(game.as_str(), "cs13" | "cs16") {
                return Err("Invalid game".into());
            }
            if let Some(folder) = browse_folder() {
                let (root, _, _) =
                    validate_installation(&folder, &game).ok_or("Invalid game installation")?;
                if game == "cs13" {
                    prefs.cs13 = Some(root);
                } else {
                    prefs.cs16 = Some(root);
                }
                save(&prefs)?;
            }
        }
        Request::Save { settings } => {
            settings.validate()?;
            prefs.settings = settings;
            save(&prefs)?;
        }
    }
    let mut value = serde_json::to_value(&prefs.settings).map_err(|e| e.to_string())?;
    value["cs13FolderPath"] = serde_json::to_value(prefs.cs13).map_err(|e| e.to_string())?;
    value["cs16FolderPath"] = serde_json::to_value(prefs.cs16).map_err(|e| e.to_string())?;
    Ok(value)
}
fn respond(stream: &mut TcpStream, status: &str, origin: Option<&str>, body: &str) {
    let cors = origin.map(|o| format!("Access-Control-Allow-Origin: {o}\r\nAccess-Control-Allow-Methods: POST, OPTIONS\r\nAccess-Control-Allow-Headers: authorization, content-type\r\nAccess-Control-Allow-Private-Network: true\r\nVary: Origin\r\n")).unwrap_or_default();
    let _ = write!(stream, "HTTP/1.1 {status}\r\n{cors}Content-Type: application/json\r\nCache-Control: no-store\r\nConnection: close\r\nContent-Length: {}\r\n\r\n{body}", body.len());
}
fn handle(mut stream: TcpStream, port: u16, token: &str, origin: &str) -> bool {
    let _ = stream.set_read_timeout(Some(Duration::from_secs(5)));
    let _ = stream.set_write_timeout(Some(Duration::from_secs(5)));
    let mut bytes = Vec::new();
    let split = loop {
        if bytes.len() >= 16384 {
            respond(&mut stream, "413 Payload Too Large", None, "{}");
            return false;
        }
        let mut chunk = [0; 1024];
        let Ok(n) = stream.read(&mut chunk) else {
            return false;
        };
        if n == 0 {
            return false;
        }
        bytes.extend_from_slice(&chunk[..n]);
        if let Some(i) = bytes.windows(4).position(|v| v == b"\r\n\r\n") {
            break i + 4;
        }
    };
    let Ok(header) = std::str::from_utf8(&bytes[..split]) else {
        return false;
    };
    let lines: Vec<_> = header.split("\r\n").collect();
    let fields: Vec<_> = lines
        .iter()
        .skip(1)
        .filter_map(|line| line.split_once(':'))
        .collect();
    let one = |name: &str| -> Option<&str> {
        let mut values = fields
            .iter()
            .filter(|(key, _)| key.eq_ignore_ascii_case(name));
        let value = values.next()?.1.trim();
        if values.next().is_some() {
            None
        } else {
            Some(value)
        }
    };
    if one("origin") != Some(origin) || one("host") != Some(format!("127.0.0.1:{port}").as_str()) {
        respond(&mut stream, "403 Forbidden", None, "{}");
        return false;
    }
    if lines[0] == "OPTIONS /settings HTTP/1.1" {
        respond(&mut stream, "204 No Content", Some(origin), "");
        return false;
    }
    if lines[0] != "POST /settings HTTP/1.1"
        || one("authorization") != Some(format!("Bearer {token}").as_str())
        || one("content-type") != Some("application/json")
        || one("transfer-encoding").is_some()
    {
        respond(&mut stream, "403 Forbidden", Some(origin), "{}");
        return false;
    }
    let Some(length) = one("content-length")
        .and_then(|s| s.parse::<usize>().ok())
        .filter(|n| *n <= 8192)
    else {
        respond(&mut stream, "400 Bad Request", Some(origin), "{}");
        return false;
    };
    while bytes.len() < split + length {
        let mut chunk = [0; 1024];
        let Ok(n) = stream.read(&mut chunk) else {
            return false;
        };
        if n == 0 {
            return false;
        };
        bytes.extend_from_slice(&chunk[..n]);
    }
    match serde_json::from_slice::<Request>(&bytes[split..split + length])
        .map_err(|_| "Invalid settings request".to_string())
        .and_then(apply)
    {
        Ok(value) => respond(&mut stream, "200 OK", Some(origin), &value.to_string()),
        Err(_) => respond(&mut stream, "400 Bad Request", Some(origin), "{}"),
    }
    true
}
pub fn serve(port: u16, token: &str, origin: &str) -> Result<(), String> {
    if port < 49152
        || token.len() != 64
        || !token.bytes().all(|b| b.is_ascii_hexdigit())
        || competitive16_web_helper::allowed_api_origin(origin, cfg!(debug_assertions)).as_deref()
            != Some(origin)
    {
        return Err("Invalid local settings capability".into());
    }
    let listener =
        TcpListener::bind((std::net::Ipv4Addr::LOCALHOST, port)).map_err(|e| e.to_string())?;
    listener.set_nonblocking(true).map_err(|e| e.to_string())?;
    let mut last = Instant::now();
    while last.elapsed() < Duration::from_secs(300) {
        match listener.accept() {
            Ok((stream, _)) => {
                if handle(stream, port, token, origin) {
                    last = Instant::now();
                }
            }
            Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                std::thread::sleep(Duration::from_millis(100))
            }
            Err(e) => return Err(e.to_string()),
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    fn exchange(request: String, token: &str) -> (bool, String) {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        let request = request.replace("PORT", &port.to_string());
        let token = token.to_string();
        let worker = std::thread::spawn(move || {
            let (stream, _) = listener.accept().unwrap();
            handle(stream, port, &token, "https://16competitive.papamo.dev")
        });
        let mut stream = TcpStream::connect(("127.0.0.1", port)).unwrap();
        stream.write_all(request.as_bytes()).unwrap();
        let mut response = String::new();
        stream.read_to_string(&mut response).unwrap();
        (worker.join().unwrap(), response)
    }
    #[test]
    fn local_bridge_refuses_other_origins_and_missing_capability() {
        for (origin, auth) in [
            ("https://evil.test", "Bearer secret"),
            ("https://16competitive.papamo.dev", "Bearer wrong"),
        ] {
            let (accepted,response) = exchange(format!("POST /settings HTTP/1.1\r\nHost: 127.0.0.1:PORT\r\nOrigin: {origin}\r\nAuthorization: {auth}\r\nContent-Type: application/json\r\nContent-Length: 2\r\n\r\n{{}}"), "secret");
            assert!(!accepted);
            assert!(response.starts_with("HTTP/1.1 403"));
        }
    }
    #[test]
    fn preflight_and_invalid_actions_never_read_or_change_settings() {
        let (_,response)=exchange("OPTIONS /settings HTTP/1.1\r\nHost: 127.0.0.1:PORT\r\nOrigin: https://16competitive.papamo.dev\r\n\r\n".into(),"secret");
        assert!(response.starts_with("HTTP/1.1 204"));
        assert!(response.contains("Access-Control-Allow-Private-Network: true"));
        let body = r#"{"action":"exec","command":"anything"}"#;
        let (_,response)=exchange(format!("POST /settings HTTP/1.1\r\nHost: 127.0.0.1:PORT\r\nOrigin: https://16competitive.papamo.dev\r\nAuthorization: Bearer secret\r\nContent-Type: application/json\r\nContent-Length: {}\r\n\r\n{body}",body.len()),"secret");
        assert!(response.starts_with("HTTP/1.1 400"));
        assert!(serde_json::from_str::<Request>(
            r#"{"action":"choose","game":"cs16","path":"/arbitrary"}"#
        )
        .is_err());
    }
    #[test]
    fn display_validation_preserves_legacy_modes_and_rejects_arbitrary_arguments() {
        let mut value = NativePreferences::default();
        value.display.widescreen = false;
        assert_eq!(value.resolution("cs16").unwrap(), (1440, 1080));
        assert_eq!(value.resolution("cs13").unwrap(), (1280, 960));
        value.display.resolution = "1920x1080 +exec arbitrary".into();
        assert!(value.validate().is_err());
        value.display.resolution = "current".into();
        value.current_display_resolution.width = u32::MAX;
        assert!(value.validate().is_err());
    }
}
