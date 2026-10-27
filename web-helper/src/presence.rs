//! One resident Discord connection; browser and game workers publish bounded
//! activity leases through a private local broker. No account credentials persist.
use super::*;
use serde_json::{json, Value};
use std::{
    collections::HashMap,
    io::{BufRead, BufReader, Read},
    net::{TcpListener, TcpStream},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    thread::{self, JoinHandle},
    time::Instant,
};

const MAX_FRAME: usize = 65536;
const LEASE: Duration = Duration::from_secs(90);

#[derive(Clone, Deserialize, Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Activity {
    pub phase: String,
    pub mode: Option<String>,
    pub map: Option<String>,
    pub party_id: Option<String>,
    pub party_size: u8,
    pub join_secret: Option<String>,
    pub started_at: Option<u64>,
}
impl Activity {
    fn valid(&self) -> bool {
        matches!(self.phase.as_str(), "lobby" | "queue" | "match" | "game")
            && self.mode.as_ref().is_none_or(|v| {
                matches!(
                    v.as_str(),
                    "3v3"
                        | "5v5"
                        | "unrated"
                        | "legacy"
                        | "legacy_3v3"
                        | "cs13_3v3"
                        | "casual"
                        | "ffa"
                        | "arena"
                )
            })
            && self.map.as_ref().is_none_or(|v| {
                !v.is_empty()
                    && v.len() <= 64
                    && v.bytes().all(|c| c.is_ascii_alphanumeric() || c == b'_')
            })
            && self
                .party_id
                .as_ref()
                .is_none_or(|v| uuid::Uuid::parse_str(v).is_ok())
            && self
                .join_secret
                .as_ref()
                .is_none_or(|v| uuid::Uuid::parse_str(v).is_ok())
            && self.party_size <= 5
            && self
                .started_at
                .is_none_or(|v| (1_500_000_000..=4_000_000_000).contains(&v))
    }
    fn priority(&self) -> u8 {
        match self.phase.as_str() {
            "game" => 3,
            "match" => 2,
            "queue" => 1,
            _ => 0,
        }
    }
    fn discord(&self) -> Value {
        let mode = match self.mode.as_deref().unwrap_or("") {
            "5v5" => "Competitive",
            "unrated" => "Unrated",
            "ffa" => "FFA",
            "arena" => "Arena",
            "casual" => "Casual",
            "3v3" => "3v3",
            _ => "Legacy",
        };
        let (details, state) = match self.phase.as_str() {
            "game" => (
                format!("{mode} • In Game"),
                format!("Map: {}", self.map.as_deref().unwrap_or("Counter-Strike")),
            ),
            "match" => (
                "Match Found".into(),
                format!(
                    "{mode} • {}",
                    self.map.as_deref().unwrap_or("Counter-Strike")
                ),
            ),
            "queue" => (
                "Searching for Match".into(),
                self.map
                    .as_ref()
                    .map(|m| format!("{mode} • {m}"))
                    .unwrap_or(mode.into()),
            ),
            _ => (
                "In Lobby".into(),
                if self.party_size > 1 {
                    "In a Party"
                } else {
                    "Ready to play"
                }
                .into(),
            ),
        };
        let config: Value =
            serde_json::from_str(include_str!("../../src/shared/discord-application.json"))
                .expect("Discord configuration");
        let mut value = json!({"type":0,"details":details,"state":state,"instance":false,"assets":{"large_image":config["largeImage"],"large_text":"1.6 Competitive"}});
        if let Some(start) = self.started_at.filter(|_| self.phase == "game") {
            value["timestamps"] = json!({"start":start});
        }
        if let Some(id) = self.party_id.as_ref().filter(|_| self.party_size > 0) {
            value["party"] = json!({"id":id,"size":[self.party_size,5]});
            if let Some(secret) = self
                .join_secret
                .as_ref()
                .filter(|_| self.phase == "lobby" && self.party_size < 5)
            {
                value["secrets"] = json!({"join":secret});
            }
        }
        value
    }
}
#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct Endpoint {
    port: u16,
    token: String,
}
#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct Message {
    token: String,
    source: String,
    activity: Option<Activity>,
}
#[derive(Deserialize, Serialize, Default)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Status {
    pub connected: bool,
    pub join_secret: Option<String>,
}

pub fn publish(source: &str, activity: Option<Activity>) -> Result<Status, String> {
    if source.len() > 80 || activity.as_ref().is_some_and(|a| !a.valid()) {
        return Err("Invalid native activity".into());
    }
    let bytes = fs::read(user_config_dir()?.join("presence.endpoint"))
        .map_err(|_| "Native activity service is unavailable")?;
    if bytes.len() > 256 {
        return Err("Invalid activity service".into());
    }
    let endpoint: Endpoint =
        serde_json::from_slice(&bytes).map_err(|_| "Invalid activity service")?;
    let mut stream = TcpStream::connect_timeout(
        &std::net::SocketAddr::from(([127, 0, 0, 1], endpoint.port)),
        Duration::from_secs(1),
    )
    .map_err(|_| "Activity service unavailable")?;
    stream
        .set_read_timeout(Some(Duration::from_secs(2)))
        .map_err(|e| e.to_string())?;
    stream
        .set_write_timeout(Some(Duration::from_secs(2)))
        .map_err(|e| e.to_string())?;
    let message = Message {
        token: endpoint.token,
        source: source.into(),
        activity,
    };
    writeln!(
        stream,
        "{}",
        serde_json::to_string(&message).map_err(|e| e.to_string())?
    )
    .map_err(|e| e.to_string())?;
    let mut bytes = Vec::new();
    BufReader::new(stream)
        .take(1025)
        .read_until(b'\n', &mut bytes)
        .map_err(|e| e.to_string())?;
    if bytes.len() > 1024 {
        return Err("Invalid activity reply".into());
    }
    serde_json::from_slice(&bytes).map_err(|_| "Invalid activity reply".into())
}

pub struct Broker {
    stop: Arc<AtomicBool>,
    worker: Option<JoinHandle<()>>,
    lifetime: Arc<Mutex<Lifetime>>,
}
struct Lifetime {
    started: Instant,
    browser: Option<Instant>,
    game_active: bool,
}
impl Lifetime {
    fn needed(&self) -> bool {
        self.started.elapsed() < Duration::from_secs(30)
            || self.browser.is_some_and(|at| at.elapsed() < Duration::from_secs(30))
            || self.game_active
    }
}
impl Broker {
    pub fn needed(&self) -> bool {
        self.lifetime.lock().is_ok_and(|state| state.needed())
    }
    pub fn start() -> Result<Self, String> {
        let listener = TcpListener::bind("127.0.0.1:0").map_err(|e| e.to_string())?;
        listener.set_nonblocking(true).map_err(|e| e.to_string())?;
        let endpoint = Endpoint {
            port: listener.local_addr().map_err(|e| e.to_string())?.port(),
            token: format!(
                "{}{}",
                uuid::Uuid::new_v4().simple(),
                uuid::Uuid::new_v4().simple()
            ),
        };
        let path = user_config_dir()?.join("presence.endpoint");
        let temp = path.with_extension(uuid::Uuid::new_v4().to_string());
        let mut options = OpenOptions::new();
        options.write(true).create_new(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600);
        }
        let mut file = options.open(&temp).map_err(|e| e.to_string())?;
        file.write_all(&serde_json::to_vec(&endpoint).map_err(|e| e.to_string())?)
            .map_err(|e| e.to_string())?;
        if path.exists() {
            fs::remove_file(&path).map_err(|e| e.to_string())?;
        }
        fs::rename(&temp, &path).map_err(|e| e.to_string())?;
        let stop = Arc::new(AtomicBool::new(false));
        let stopping = stop.clone();
        let lifetime = Arc::new(Mutex::new(Lifetime {
            started: Instant::now(),
            browser: None,
            game_active: false,
        }));
        let worker_lifetime = lifetime.clone();
        let worker = thread::spawn(move || {
            let mut leases: HashMap<String, (Activity, Instant)> = HashMap::new();
            let mut discord = Discord::default();
            let mut joins: Vec<String> = Vec::new();
            while !stopping.load(Ordering::Relaxed) {
                match listener.accept() {
                    Ok((mut stream, _)) => {
                        if stream.set_nonblocking(false).is_err(){continue;}
                        let _ = stream.set_read_timeout(Some(Duration::from_millis(500)));
                        let _ = stream.set_write_timeout(Some(Duration::from_millis(500)));
                        let mut bytes = Vec::new();
                        let read = BufReader::new(&mut stream)
                            .take(4097)
                            .read_until(b'\n', &mut bytes);
                        if read.is_ok() && bytes.len() <= 4096 {
                            if let Ok(message) = serde_json::from_slice::<Message>(&bytes) {
                                if message.token == endpoint.token
                                    && !message.source.is_empty()
                                    && message.source.len() <= 80
                                    && message.activity.as_ref().is_none_or(Activity::valid)
                                {
                                    let browser_source = message.source.len() == 64
                                        && message.source.bytes().all(|b| b.is_ascii_hexdigit());
                                    if let Some(activity) = message.activity {
                                        if leases.contains_key(&message.source) || leases.len() < 8
                                        {
                                            leases
                                                .insert(message.source, (activity, Instant::now()));
                                        }
                                    } else {
                                        leases.remove(&message.source);
                                        if message.source.len() == 64 {
                                            joins.clear();
                                        }
                                    }
                                    let _ = writeln!(
                                        stream,
                                        "{}",
                                        serde_json::to_string(&Status {
                                            connected: discord.ready,
                                            join_secret: if browser_source {
                                                joins.pop()
                                            } else {
                                                None
                                            }
                                        })
                                        .unwrap_or_default()
                                    );
                                }
                            }
                        }
                    }
                    Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {}
                    Err(_) => break,
                }
                leases.retain(|_, (_, at)| at.elapsed() < LEASE);
                if let Ok(mut state) = worker_lifetime.lock() {
                    state.browser = leases.iter()
                        .filter(|(source, _)| source.len() == 64 && source.bytes().all(|b| b.is_ascii_hexdigit()))
                        .map(|(_, (_, at))| *at)
                        .max();
                    state.game_active = leases.values().any(|(activity, _)| activity.phase == "game");
                }
                let activity = leases
                    .values()
                    .max_by_key(|(a, at)| (a.priority(), *at))
                    .map(|(a, _)| a.discord());
                discord.tick(activity, &mut joins);
                thread::sleep(Duration::from_millis(50));
            }
            discord.clear();
            let _ = fs::remove_file(path);
        });
        Ok(Self {
            stop,
            worker: Some(worker),
            lifetime,
        })
    }
}
#[cfg(test)]
mod lifetime_tests {
    use super::*;

    #[test]
    fn tray_stays_only_for_recent_browser_or_active_game() {
        let mut lifetime = Lifetime {
            started: Instant::now() - Duration::from_secs(31),
            browser: None,
            game_active: false,
        };
        assert!(!lifetime.needed());
        lifetime.browser = Some(Instant::now());
        assert!(lifetime.needed());
        lifetime.browser = Some(Instant::now() - Duration::from_secs(31));
        assert!(!lifetime.needed());
        lifetime.game_active = true;
        assert!(lifetime.needed());
    }
}
impl Drop for Broker {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::Relaxed);
        if let Some(worker) = self.worker.take() {
            let _ = worker.join();
        }
    }
}

/// Game status outlives the browser, and clears even when a launch fails later.
pub struct GameLease {
    stop: Arc<AtomicBool>,
    worker: Option<JoinHandle<()>>,
}
impl GameLease {
    pub fn start(connection: &Connection, directory: Option<PathBuf>) -> Self {
        let source = format!("game-{}", uuid::Uuid::new_v4());
        let mode = connection.mode.clone();
        let started = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .ok()
            .map(|v| v.as_secs());
        let stop = Arc::new(AtomicBool::new(false));
        let stopping = stop.clone();
        let worker = thread::spawn(move || {
            while !stopping.load(Ordering::Relaxed) {
                let map = directory.as_ref().and_then(|dir| {
                    let path = dir.join("game/cstrike/addons/amxmodx/data/16c_scoreboard.tsv");
                    let metadata = fs::metadata(&path).ok()?;
                    if metadata.len() > 8192 {
                        return None;
                    }
                    let bytes = fs::read_to_string(path).ok()?;
                    let map = bytes.lines().next()?.split('\t').nth(1)?.to_owned();
                    Some(map)
                });
                let _ = publish(
                    &source,
                    Some(Activity {
                        phase: "game".into(),
                        mode: Some(mode.clone()),
                        map,
                        party_id: None,
                        party_size: 0,
                        join_secret: None,
                        started_at: started,
                    }),
                );
                for _ in 0..200 {
                    if stopping.load(Ordering::Relaxed) {
                        break;
                    }
                    thread::sleep(Duration::from_millis(100));
                }
            }
            let _ = publish(&source, None);
        });
        Self {
            stop,
            worker: Some(worker),
        }
    }
}
impl Drop for GameLease {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::Relaxed);
        if let Some(worker) = self.worker.take() {
            let _ = worker.join();
        }
    }
}

#[cfg(unix)]
type Pipe = std::os::unix::net::UnixStream;
#[cfg(windows)]
type Pipe = fs::File;
fn pipe() -> Option<Pipe> {
    let configured: Vec<PathBuf> = env::var_os("DISCORD_IPC_PATH")
        .map(|value| env::split_paths(&value).collect())
        .unwrap_or_default();
    #[cfg(unix)]
    {
        for path in &configured {
            if path.is_absolute() {
                if let Ok(stream) = Pipe::connect(path) {
                    stream.set_nonblocking(true).ok()?;
                    return Some(stream);
                }
            }
        }
        let mut roots = Vec::new();
        for name in ["XDG_RUNTIME_DIR", "TMPDIR", "TMP", "TEMP"] {
            if let Some(value) = env::var_os(name) {
                roots.push(PathBuf::from(value));
            }
        }
        roots.push(PathBuf::from("/tmp"));
        if let Some(root) = env::var_os("XDG_RUNTIME_DIR") {
            roots.push(PathBuf::from(root).join(".flatpak/dev.vencord.Vesktop/xdg-run"));
        }
        for root in roots {
            for sub in [
                "",
                "app/com.discordapp.Discord",
                "snap.discord",
                "snap.discord-canary",
            ] {
                for index in 0..10 {
                    if let Ok(stream) =
                        Pipe::connect(root.join(sub).join(format!("discord-ipc-{index}")))
                    {
                        stream.set_nonblocking(true).ok()?;
                        return Some(stream);
                    }
                }
            }
        }
    }
    #[cfg(windows)]
    {
        use std::os::windows::io::AsRawHandle;
        use windows_sys::Win32::System::Pipes::SetNamedPipeHandleState;
        let paths = configured
            .into_iter()
            .filter(|p| {
                p.to_str()
                    .is_some_and(|s| s.starts_with(r"\\?\pipe\") || s.starts_with(r"\\.\pipe\"))
            })
            .chain((0..10).map(|index| PathBuf::from(format!(r"\\?\pipe\discord-ipc-{index}"))));
        for path in paths {
            if let Ok(file) = OpenOptions::new().read(true).write(true).open(path) {
                let mode = 1u32; // PIPE_NOWAIT: a stalled peer must never hold the tray open.
                if unsafe {
                    SetNamedPipeHandleState(
                        file.as_raw_handle(),
                        &mode,
                        std::ptr::null(),
                        std::ptr::null(),
                    )
                } != 0
                {
                    return Some(file);
                }
                if let Ok(dir) = user_config_dir() {
                    let _ = fs::write(
                        dir.join("discord-rpc.log"),
                        format!(
                            "Pipe mode failed: {:?}",
                            std::io::Error::last_os_error().raw_os_error()
                        ),
                    );
                }
            }
        }
    }
    None
}
#[derive(Default)]
struct Discord {
    socket: Option<Pipe>,
    buffer: Vec<u8>,
    ready: bool,
    started: Option<Instant>,
    retry: Option<Instant>,
    last: Option<Value>,
}
fn read_pipe(pipe: &mut Pipe, buffer: &mut [u8]) -> std::io::Result<usize> {
    #[cfg(windows)]
    {
        use std::os::windows::io::AsRawHandle;
        use windows_sys::Win32::System::Pipes::PeekNamedPipe;
        let mut available = 0u32;
        if unsafe {
            PeekNamedPipe(
                pipe.as_raw_handle(),
                std::ptr::null_mut(),
                0,
                std::ptr::null_mut(),
                &mut available,
                std::ptr::null_mut(),
            )
        } == 0
        {
            return Err(std::io::Error::last_os_error());
        }
        if available == 0 {
            return Err(std::io::ErrorKind::WouldBlock.into());
        }
        let size = buffer.len().min(available as usize);
        return pipe.read(&mut buffer[..size]);
    }
    #[cfg(unix)]
    {
        pipe.read(buffer)
    }
}
impl Discord {
    fn disconnect(&mut self) {
        self.socket = None;
        self.buffer.clear();
        self.ready = false;
        self.last = None;
        self.retry = Some(Instant::now());
    }
    fn send(&mut self, opcode: u32, value: Value) -> std::io::Result<()> {
        let body = serde_json::to_vec(&value)?;
        if body.len() > 4096 {
            return Err(std::io::ErrorKind::InvalidData.into());
        }
        let mut frame = Vec::with_capacity(body.len() + 8);
        frame.extend(opcode.to_le_bytes());
        frame.extend((body.len() as u32).to_le_bytes());
        frame.extend(body);
        self.socket
            .as_mut()
            .ok_or(std::io::ErrorKind::NotConnected)?
            .write_all(&frame)
    }
    fn tick(&mut self, activity: Option<Value>, joins: &mut Vec<String>) {
        if self.socket.is_none() {
            if activity.is_none()
                || self
                    .retry
                    .is_some_and(|at| at.elapsed() < Duration::from_secs(15))
            {
                return;
            }
            self.socket = pipe();
            self.started = Some(Instant::now());
            if self.socket.is_none() {
                self.retry = Some(Instant::now());
                return;
            }
            let config: Value =
                serde_json::from_str(include_str!("../../src/shared/discord-application.json"))
                    .unwrap();
            if self
                .send(0, json!({"v":1,"client_id":config["clientId"]}))
                .is_err()
            {
                self.disconnect();
                return;
            }
        }
        let mut chunk = [0u8; 4096];
        for _ in 0..16 {
            match read_pipe(self.socket.as_mut().unwrap(), &mut chunk) {
                Ok(0) => {
                    #[cfg(windows)]
                    {
                        break;
                    }
                    #[cfg(unix)]
                    {
                        self.disconnect();
                        return;
                    }
                }
                Ok(n) => {
                    self.buffer.extend_from_slice(&chunk[..n]);
                    if self.buffer.len() > MAX_FRAME + 8 {
                        self.disconnect();
                        return;
                    }
                }
                Err(e)
                    if e.kind() == std::io::ErrorKind::WouldBlock
                        || e.raw_os_error() == Some(232) =>
                {
                    break
                }
                Err(_) => {
                    self.disconnect();
                    return;
                }
            }
        }
        while self.buffer.len() >= 8 {
            let op = u32::from_le_bytes(self.buffer[0..4].try_into().unwrap());
            let size = u32::from_le_bytes(self.buffer[4..8].try_into().unwrap()) as usize;
            if size > MAX_FRAME {
                self.disconnect();
                return;
            }
            if self.buffer.len() < size + 8 {
                break;
            }
            let value: Value = match serde_json::from_slice(&self.buffer[8..size + 8]) {
                Ok(v) => v,
                Err(_) => {
                    self.disconnect();
                    return;
                }
            };
            self.buffer.drain(..size + 8);
            if op == 2 {
                self.disconnect();
                return;
            }
            if op == 3 {
                if self.send(4, value).is_err() {
                    self.disconnect();
                    return;
                }
                continue;
            }
            if op != 1 {
                self.disconnect();
                return;
            }
            if value["evt"] == "READY" {
                self.ready = true;
                if self.send(1,json!({"cmd":"SUBSCRIBE","evt":"ACTIVITY_JOIN","nonce":uuid::Uuid::new_v4().to_string()})).is_err(){self.disconnect();return;}
            }
            if value["evt"] == "ACTIVITY_JOIN" {
                if let Some(secret) = value["data"]["secret"]
                    .as_str()
                    .filter(|s| uuid::Uuid::parse_str(s).is_ok())
                {
                    if joins.len() < 4 {
                        joins.push(secret.into());
                    }
                }
            }
        }
        if !self.ready
            && self
                .started
                .is_some_and(|at| at.elapsed() > Duration::from_secs(20))
        {
            self.disconnect();
            return;
        }
        if self.ready && activity != self.last {
            if self.send(1,json!({"cmd":"SET_ACTIVITY","args":{"pid":std::process::id(),"activity":activity},"nonce":uuid::Uuid::new_v4().to_string()})).is_err(){self.disconnect();return;}
            self.last = activity;
        }
    }
    fn clear(&mut self) {
        if self.ready {
            let _=self.send(1,json!({"cmd":"SET_ACTIVITY","args":{"pid":std::process::id(),"activity":null},"nonce":uuid::Uuid::new_v4().to_string()}));
        }
        self.disconnect();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn activity_validation_and_join_gating() {
        let mut a = Activity {
            phase: "lobby".into(),
            mode: None,
            map: None,
            party_id: Some(uuid::Uuid::new_v4().to_string()),
            party_size: 2,
            join_secret: Some(uuid::Uuid::new_v4().to_string()),
            started_at: None,
        };
        assert!(a.valid());
        assert!(a.discord().get("secrets").is_some());
        a.phase = "game".into();
        assert!(a.discord().get("secrets").is_none());
        a.map = Some("bad\nmap".into());
        assert!(!a.valid());
    }
}
