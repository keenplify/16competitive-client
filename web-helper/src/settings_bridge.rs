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
    #[serde(default)]
    pub crosshair_config: Option<String>,
    #[serde(default = "default_ping")]
    pub player_ping_key: String,
    #[serde(default = "default_voice")]
    pub voice_ptt_keys: Vec<String>,
}
fn default_voice() -> Vec<String> {
    vec!["K".into(), "V".into()]
}
fn default_ping() -> String {
    "MOUSE3".into()
}
fn valid_crosshair(value: &str) -> bool {
    if value.len() > 192 || value.contains(['\r', '\0']) {
        return false;
    }
    let fields: Vec<_> = value.split_whitespace().collect();
    let cs2 = fields.first() == Some(&"cs2");
    let fields = if cs2 { &fields[1..] } else { &fields[..] };
    let legacy = [
        (0, 255),
        (0, 255),
        (0, 255),
        (1, 24),
        (0, 24),
        (1, 8),
        (0, 4),
        (10, 100),
        (0, 1),
        (0, 1),
    ];
    let modern = [
        (0, 255),
        (0, 255),
        (0, 255),
        (0, 255),
        (0, 255),
        (0, 255),
        (0, 255),
        (0, 255),
        (0, 9),
        (0, 255),
        (-128, 127),
        (0, 255),
        (0, 2),
        (0, 1),
        (0, 1),
        (0, 1),
        (0, 65535),
        (0, 255),
        (0, 127),
        (0, 100),
        (30, 100),
        (0, 100),
        (10, 200),
        (0, 1),
    ];
    let ranges = if cs2 { &modern[..] } else { &legacy[..] };
    fields.len() == ranges.len()
        && fields
            .iter()
            .zip(ranges)
            .all(|(value, (min, max))| value.parse::<i32>().is_ok_and(|n| n >= *min && n <= *max))
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
            crosshair_config: None,
            player_ping_key: default_ping(),
            voice_ptt_keys: default_voice(),
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
        if self.voice_ptt_keys.len() != 2
            || self.voice_ptt_keys[0] == self.voice_ptt_keys[1]
            || self.voice_ptt_keys.iter().any(|s| {
                !((s.len() == 1
                    && s.bytes()
                        .all(|c| c.is_ascii_uppercase() || c.is_ascii_digit()))
                    || s.strip_prefix('F')
                        .and_then(|n| n.parse::<u8>().ok())
                        .is_some_and(|n| (1..=12).contains(&n))
                    || [
                        "SPACE",
                        "CTRL",
                        "SHIFT",
                        "ALT",
                        "ENTER",
                        "TAB",
                        "ESCAPE",
                        "BACKSPACE",
                        "UPARROW",
                        "DOWNARROW",
                        "LEFTARROW",
                        "RIGHTARROW",
                        "INS",
                        "DEL",
                        "HOME",
                        "END",
                        "PGUP",
                        "PGDN",
                        "MOUSE1",
                        "MOUSE2",
                        "MOUSE3",
                        "MOUSE4",
                        "MOUSE5",
                    ]
                    .contains(&s.as_str()))
            })
        {
            return Err("Invalid voice keys".into());
        }
        if !matches!(
            self.player_ping_key.as_str(),
            "MOUSE3"
                | "MOUSE4"
                | "MOUSE5"
                | "B"
                | "F"
                | "G"
                | "H"
                | "J"
                | "L"
                | "N"
                | "P"
                | "X"
                | "Z"
                | "NONE"
        ) || self
            .crosshair_config
            .as_ref()
            .is_some_and(|v| !valid_crosshair(v))
        {
            return Err("Invalid native input preferences".into());
        }
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
#[serde(
    tag = "action",
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
enum Request {
    Get,
    Choose {
        game: String,
    },
    Select {
        game: String,
        folder_path: String,
    },
    Save {
        settings: NativePreferences,
    },
    Presence {
        activity: Option<crate::presence::Activity>,
    },
    AssetStatus,
    AssetSync {
        api_origin: String,
        token: String,
        #[serde(default)]
        repair: bool,
    },
    RuntimeCheck {
        api_origin: String,
    },
    NextClient {
        api_origin: String,
        install: bool,
    },
    NextClientStatus,
    NextClientCancel,
    VoiceStream,
    Microphone { api_origin: String },
    Diagnostics { api_origin: String, token: String, match_id: Option<String> },
    ProbeNodes {
        nodes: Vec<ProbeNode>,
    },
    Logout {
        account_id: String,
    },
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ProbeNode {
    id: String,
    api_origin: String,
    port: u16,
}

fn probe_udp_latency(host: &str, port: u16) -> Option<u32> {
    use std::net::{ToSocketAddrs, UdpSocket};
    let address = (host, port).to_socket_addrs().ok()?.next()?;
    let bind = if address.is_ipv4() { "0.0.0.0:0" } else { "[::]:0" };
    let socket = UdpSocket::bind(bind).ok()?;
    socket.connect(address).ok()?;
    socket.set_read_timeout(Some(Duration::from_millis(1500))).ok()?;
    let nonce = *uuid::Uuid::new_v4().as_bytes();
    let started = Instant::now();
    socket.send(&nonce).ok()?;
    let mut response = [0u8; 16];
    if socket.recv(&mut response).ok()? != nonce.len() || response != nonce {
        return None;
    }
    Some(started.elapsed().as_millis().min(u32::MAX as u128) as u32)
}

fn probe_nodes(nodes: Vec<ProbeNode>) -> Result<serde_json::Value, String> {
    if nodes.is_empty() || nodes.len() > 16 {
        return Err("Invalid latency probes".into());
    }
    let mut checked = Vec::with_capacity(nodes.len());
    let mut ids = std::collections::HashSet::new();
    for node in nodes {
        if node.id.is_empty() || node.id.len() > 80 || !ids.insert(node.id.clone()) || node.port == 0 {
            return Err("Invalid latency probe".into());
        }
        let origin = competitive16_web_helper::allowed_api_origin(&node.api_origin, cfg!(debug_assertions))
            .ok_or("Invalid latency probe origin")?;
        let host = url::Url::parse(&origin).map_err(|_| "Invalid latency probe origin")?
            .host_str().ok_or("Invalid latency probe host")?.to_owned();
        checked.push((node.id, host, node.port));
    }
    let measured = std::thread::scope(|scope| {
        checked.into_iter().map(|(id, host, port)| {
            scope.spawn(move || serde_json::json!({"id": id, "latencyMs": probe_udp_latency(&host, port)}))
        }).collect::<Vec<_>>().into_iter().map(|task| task.join().unwrap_or(serde_json::Value::Null)).collect::<Vec<_>>()
    });
    Ok(serde_json::json!(measured))
}
fn apply(request: Request, source: &str) -> Result<serde_json::Value, String> {
    match &request {
        Request::Logout { account_id } => {
            uuid::Uuid::parse_str(account_id).map_err(|_| "Invalid helper account")?;
            let at = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map_err(|e| e.to_string())?
                .as_millis();
            crate::native_session::owned_write(
                &user_config_dir()?.join("runtime-logout.json"),
                serde_json::json!({"accountId":account_id,"at":at})
                    .to_string()
                    .as_bytes(),
            )?;
            return Ok(serde_json::json!({"ok":true}));
        }
        Request::Microphone { api_origin } => {
            return crate::runtime::microphone(api_origin.clone());
        }
        Request::Diagnostics { api_origin, token, match_id } => {
            if token.len() > 4096 || match_id.as_ref().is_some_and(|id| uuid::Uuid::parse_str(id).is_err()) {
                return Err("Invalid diagnostic request".into());
            }
            return crate::runtime::invoke("diagnostics", api_origin, Some(token), match_id.as_deref());
        }
        Request::RuntimeCheck { api_origin } => {
            return crate::runtime::invoke("check", api_origin, None, None)
        }
        Request::NextClient {
            api_origin,
            install,
        } => {
            return if *install {
                crate::runtime::installer(api_origin.clone())
            } else {
                crate::runtime::invoke("detectNextClient", api_origin, None, None)
            }
        }
        Request::NextClientStatus => return Ok(crate::runtime::installer_status()),
        Request::NextClientCancel => {
            crate::native_session::owned_write(
                &user_config_dir()?.join("nextclient.cancel"),
                b"1",
            )?;
            return Ok(serde_json::json!({"ok":true}));
        }
        Request::ProbeNodes { nodes } => return probe_nodes(nodes.clone()),
        Request::AssetStatus => {
            return serde_json::to_value(crate::assets::status()).map_err(|e| e.to_string())
        }
        Request::AssetSync {
            api_origin,
            token,
            repair,
        } => {
            return serde_json::to_value(crate::assets::start_catalog(
                api_origin.clone(),
                token.clone(),
                *repair,
            )?)
            .map_err(|e| e.to_string())
        }
        _ => {}
    }
    if let Request::Presence { activity } = request {
        return serde_json::to_value(crate::presence::publish(source, activity)?)
            .map_err(|e| e.to_string());
    }
    let mut prefs = load()?;
    match request {
        Request::Get => {
            // Populate the web settings with a validated local installation on
            // first use. This only saves the helper's preference; it does not
            // change game files. A manual choice always takes precedence.
            static CS16_DISCOVERED: std::sync::OnceLock<Vec<PathBuf>> = std::sync::OnceLock::new();
            static CS13_DISCOVERED: std::sync::OnceLock<Vec<PathBuf>> = std::sync::OnceLock::new();
            if prefs
                .cs16
                .as_ref()
                .and_then(|folder| validate_installation(folder, "cs16"))
                .is_none()
            {
                let previous = prefs.cs16.clone();
                prefs.cs16 = CS16_DISCOVERED
                    .get_or_init(|| discover("cs16"))
                    .iter()
                    .find(|folder| validate_installation(folder, "cs16").is_some())
                    .cloned();
                if prefs.cs16 != previous {
                    save(&prefs)?;
                }
            }
            if prefs
                .cs13
                .as_ref()
                .and_then(|folder| validate_installation(folder, "cs13"))
                .is_none()
            {
                let previous = prefs.cs13.clone();
                prefs.cs13 = CS13_DISCOVERED
                    .get_or_init(|| discover("cs13"))
                    .iter()
                    .find(|folder| validate_installation(folder, "cs13").is_some())
                    .cloned();
                if prefs.cs13 != previous {
                    save(&prefs)?;
                }
            }
        }
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
        Request::Select { game, folder_path } => {
            if !matches!(game.as_str(), "cs13" | "cs16") || folder_path.len() > 4096 {
                return Err("Invalid installation folder".into());
            }
            let (root, _, _) = validate_installation(Path::new(&folder_path), &game)
                .ok_or("Invalid game installation")?;
            if game == "cs13" {
                prefs.cs13 = Some(root);
            } else {
                prefs.cs16 = Some(root);
            }
            save(&prefs)?;
        }
        Request::Save { settings } => {
            settings.validate()?;
            prefs.settings = settings;
            save(&prefs)?;
        }
        Request::Presence { .. } => unreachable!(),
        Request::AssetStatus | Request::AssetSync { .. } => unreachable!(),
        Request::RuntimeCheck { .. } | Request::NextClient { .. } => unreachable!(),
        Request::NextClientStatus | Request::NextClientCancel => unreachable!(),
        Request::VoiceStream | Request::Microphone { .. } | Request::Diagnostics { .. } => unreachable!(),
        Request::ProbeNodes { .. } => unreachable!(),
        Request::Logout { .. } => unreachable!(),
    }
    let mut value = serde_json::to_value(&prefs.settings).map_err(|e| e.to_string())?;
    value["nextClientDetected"] = serde_json::json!(
        cfg!(windows)
            && prefs
                .cs16
                .as_ref()
                .is_some_and(|root| root.join("nitro_api2.dll").is_file()
                    && root.join("cstrike/cl_dlls/client_mini.dll").is_file())
    );
    value["platform"] = serde_json::json!(if cfg!(windows) { "win32" } else { "linux" });
    value["helperVersion"] = serde_json::json!(
        serde_json::from_str::<serde_json::Value>(include_str!("../../package.json"))
            .ok()
            .and_then(|package| package["version"].as_str().map(str::to_owned))
            .ok_or("Invalid helper version")?
    );
    value["cs13FolderPath"] = serde_json::to_value(prefs.cs13.as_deref().map(installation_display_path)).map_err(|e| e.to_string())?;
    value["cs16FolderPath"] = serde_json::to_value(prefs.cs16.as_deref().map(installation_display_path)).map_err(|e| e.to_string())?;
    Ok(value)
}
fn respond_settings_error(stream: &mut TcpStream, origin: &str, error: &str) {
    // Send stable codes, never raw filesystem errors or local paths.
    let code = if error == "Invalid game installation" {
        "INVALID_GAME_INSTALLATION"
    } else {
        "SETTINGS_FAILED"
    };
    respond(stream, "400 Bad Request", Some(origin), &serde_json::json!({"code": code}).to_string());
}
fn respond(stream: &mut TcpStream, status: &str, origin: Option<&str>, body: &str) {
    let cors = origin.map(|o| format!("Access-Control-Allow-Origin: {o}\r\nAccess-Control-Allow-Methods: POST, OPTIONS\r\nAccess-Control-Allow-Headers: authorization, content-type\r\nAccess-Control-Allow-Private-Network: true\r\nVary: Origin\r\n")).unwrap_or_default();
    let _ = write!(stream, "HTTP/1.1 {status}\r\n{cors}Content-Type: application/json\r\nCache-Control: no-store\r\nConnection: close\r\nContent-Length: {}\r\n\r\n{body}", body.len());
}
static VOICE_STREAMS: std::sync::atomic::AtomicUsize = std::sync::atomic::AtomicUsize::new(0);
static RUNTIME_CHECKS: std::sync::atomic::AtomicUsize = std::sync::atomic::AtomicUsize::new(0);
fn voice_stream(mut stream: TcpStream, origin: String) {
    struct Lease;
    impl Drop for Lease {
        fn drop(&mut self) {
            VOICE_STREAMS.fetch_sub(1, std::sync::atomic::Ordering::SeqCst);
        }
    }
    let _lease = Lease;
    let _ = stream.set_write_timeout(Some(Duration::from_secs(2)));
    if write!(stream,"HTTP/1.1 200 OK\r\nAccess-Control-Allow-Origin: {origin}\r\nVary: Origin\r\nContent-Type: text/event-stream\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n").is_err(){return;}
    let start = Instant::now();
    let mut heartbeat = Instant::now();
    let mut last = serde_json::json!({"matchId":"","team":false,"party":false});
    while start.elapsed() < Duration::from_secs(300) {
        let read = || -> Option<serde_json::Value> {
            let path = user_config_dir().ok()?.join("voice-ptt.json");
            let meta = fs::metadata(&path).ok()?;
            if meta.len() > 1024 || meta.modified().ok()?.elapsed().ok()?.as_millis() > 2000 {
                return None;
            }
            let v: serde_json::Value = serde_json::from_slice(&fs::read(path).ok()?).ok()?;
            uuid::Uuid::parse_str(v["matchId"].as_str()?).ok()?;
            if !v["team"].is_boolean() || !v["party"].is_boolean() {
                return None;
            }
            Some(serde_json::json!({"matchId":v["matchId"],"team":v["team"],"party":v["party"]}))
        };
        let value = read().unwrap_or_else(
            || serde_json::json!({"matchId":last["matchId"],"team":false,"party":false}),
        );
        if value != last {
            if write!(stream, "data: {value}\n\n").is_err() {
                return;
            }
            last = value;
        }
        if heartbeat.elapsed() > Duration::from_secs(1) {
            if write!(stream, ": heartbeat\n\n").is_err() {
                return;
            }
            heartbeat = Instant::now();
        }
        std::thread::sleep(Duration::from_millis(30));
    }
}
fn handle(mut stream: TcpStream, port: u16, token: &str, origin: &str) -> bool {
    if stream.set_nonblocking(false).is_err(){return false;}
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
    match serde_json::from_slice::<Request>(&bytes[split..split + length]) {
        Ok(Request::VoiceStream) => {
            if VOICE_STREAMS.fetch_add(1, std::sync::atomic::Ordering::SeqCst) >= 4 {
                VOICE_STREAMS.fetch_sub(1, std::sync::atomic::Ordering::SeqCst);
                respond(&mut stream, "429 Too Many Requests", Some(origin), "{}");
                return true;
            }
            std::thread::spawn({
                let origin = origin.to_owned();
                move || voice_stream(stream, origin)
            });
        }
        Ok(request @ (Request::RuntimeCheck { .. } | Request::Microphone { .. } | Request::Diagnostics { .. })) => {
            if RUNTIME_CHECKS.fetch_add(1, std::sync::atomic::Ordering::SeqCst) >= 1 {
                RUNTIME_CHECKS.fetch_sub(1, std::sync::atomic::Ordering::SeqCst);
                respond(&mut stream, "429 Too Many Requests", Some(origin), "{}");
                return true;
            }
            let origin = origin.to_owned();
            let token = token.to_owned();
            std::thread::spawn(move || {
                struct Lease;
                impl Drop for Lease {
                    fn drop(&mut self) {
                        RUNTIME_CHECKS.fetch_sub(1, std::sync::atomic::Ordering::SeqCst);
                    }
                }
                let _lease = Lease;
                match apply(request, &token) {
                    Ok(value) => respond(&mut stream, "200 OK", Some(&origin), &value.to_string()),
                    Err(_) => respond(&mut stream, "400 Bad Request", Some(&origin), "{}"),
                }
            });
        }
        Ok(request) => match apply(request, token) {
            Ok(value) => respond(&mut stream, "200 OK", Some(origin), &value.to_string()),
            Err(error) => respond_settings_error(&mut stream, origin, &error),
        },
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
    let listener = match TcpListener::bind((std::net::Ipv4Addr::LOCALHOST, port)) {
        Ok(listener) => listener,
        Err(error) if error.kind() == std::io::ErrorKind::AddrInUse => {
            // Repeated protocol checks from the same page may start another
            // process while its authenticated bridge is still serving.
            if existing_bridge_matches(port, token, origin) {
                return Ok(());
            }
            return Err("Local settings port is occupied by another process".into());
        }
        Err(error) => return Err(error.to_string()),
    };
    listener.set_nonblocking(true).map_err(|e| e.to_string())?;
    let mut last = Instant::now();
    while last.elapsed() < Duration::from_secs(30)
        || crate::assets::busy()
        || crate::runtime::busy()
        || RUNTIME_CHECKS.load(std::sync::atomic::Ordering::Relaxed) > 0
    {
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

pub(super) fn wait_until_ready(port: u16, token: &str, origin: &str) -> Result<(), String> {
    let deadline = Instant::now() + Duration::from_secs(5);
    loop {
        if existing_bridge_matches(port, token, origin) { return Ok(()); }
        if Instant::now() >= deadline { return Err("Native helper settings bridge did not become ready".into()); }
        std::thread::sleep(Duration::from_millis(100));
    }
}

fn existing_bridge_matches(port: u16, token: &str, origin: &str) -> bool {
    let address = std::net::SocketAddr::from(([127, 0, 0, 1], port));
    let Ok(mut stream) = TcpStream::connect_timeout(&address, Duration::from_secs(1)) else {
        return false;
    };
    let _ = stream.set_read_timeout(Some(Duration::from_secs(2)));
    let _ = stream.set_write_timeout(Some(Duration::from_secs(2)));
    let body = r#"{"action":"get"}"#;
    if write!(stream, "POST /settings HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nOrigin: {origin}\r\nAuthorization: Bearer {token}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}", body.len()).is_err() {
        return false;
    }
    let mut response = Vec::new();
    if stream.take(16384).read_to_end(&mut response).is_err() {
        return false;
    }
    let Ok(response) = std::str::from_utf8(&response) else {
        return false;
    };
    let Some((headers, body)) = response.split_once("\r\n\r\n") else {
        return false;
    };
    headers.starts_with("HTTP/1.1 200 OK\r\n")
        && headers.lines().any(|line| line == format!("Access-Control-Allow-Origin: {origin}"))
        && serde_json::from_str::<serde_json::Value>(body).is_ok_and(|value| {
            value["platform"].as_str() == Some(if cfg!(windows) { "win32" } else { "linux" })
                && (value["cs16FolderPath"].is_null() || value["cs16FolderPath"].is_string())
        })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn bridge_readiness_waits_for_a_responding_authenticated_listener() {
        let listener = TcpListener::bind((std::net::Ipv4Addr::LOCALHOST, 0)).unwrap();
        let port = listener.local_addr().unwrap().port();
        let token = "a".repeat(64);
        let worker = std::thread::spawn(move || {
            std::thread::sleep(Duration::from_millis(150));
            let (mut stream, _) = listener.accept().unwrap();
            let mut request = [0; 4096];
            let count = stream.read(&mut request).unwrap();
            let request = std::str::from_utf8(&request[..count]).unwrap();
            assert!(request.contains(&format!("Authorization: Bearer {}", "a".repeat(64))));
            respond(&mut stream, "200 OK", Some("https://16competitive.papamo.dev"),
                &serde_json::json!({"platform": if cfg!(windows) {"win32"} else {"linux"}, "cs16FolderPath":null}).to_string());
        });
        let start = Instant::now();
        wait_until_ready(port, &token, "https://16competitive.papamo.dev").unwrap();
        assert!(start.elapsed() >= Duration::from_millis(100));
        worker.join().unwrap();
    }
    #[test]
    fn udp_probe_uses_echo_response_and_rejects_wrong_nonce() {
        for echo in [true, false] {
            let server = std::net::UdpSocket::bind("127.0.0.1:0").unwrap();
            let port = server.local_addr().unwrap().port();
            let worker = std::thread::spawn(move || {
                let mut nonce = [0u8; 16];
                let (_, peer) = server.recv_from(&mut nonce).unwrap();
                if !echo { nonce[0] ^= 1; }
                server.send_to(&nonce, peer).unwrap();
            });
            assert_eq!(probe_udp_latency("127.0.0.1", port).is_some(), echo);
            worker.join().unwrap();
        }
    }
    #[test]
    fn duplicate_bridge_reuses_matching_capability_and_rejects_other_listener() {
        let listener = (60000..61000)
            .find_map(|port| TcpListener::bind((std::net::Ipv4Addr::LOCALHOST, port)).ok())
            .unwrap();
        let port = listener.local_addr().unwrap().port();
        let token = "a".repeat(64);
        let origin = "https://16competitive.papamo.dev";
        let worker = std::thread::spawn({
            let token = token.clone();
            move || {
                let (stream, _) = listener.accept().unwrap();
                handle(stream, port, &token, origin)
            }
        });
        assert!(serve(port, &token, origin).is_ok());
        assert!(worker.join().unwrap());

        let listener = TcpListener::bind((std::net::Ipv4Addr::LOCALHOST, port)).unwrap();
        let worker = std::thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            let _ = stream.write_all(b"HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\n\r\n");
        });
        assert!(serve(port, &token, origin).is_err());
        worker.join().unwrap();
    }
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
