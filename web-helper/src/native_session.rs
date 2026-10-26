use competitive16_web_helper::Connection;
use std::{
    fs::{self, OpenOptions},
    io::{Read, Write},
    net::{Ipv4Addr, ToSocketAddrs},
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
    thread::{self, JoinHandle},
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use uuid::Uuid;

const TICKET_LIFETIME_MS: u128 = 2 * 60 * 60 * 1000;
const MAX_FEED: u64 = 8192;

fn now_ms() -> Result<u128, String> {
    Ok(SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_millis())
}

fn owned_write(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let parent = path.parent().ok_or("Invalid managed session path")?;
    fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    let pending = parent.join(format!(".{}.tmp", Uuid::new_v4()));
    let mut options = OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600).custom_flags(libc::O_NOFOLLOW);
    }
    let mut file = options.open(&pending).map_err(|e| e.to_string())?;
    file.write_all(bytes).map_err(|e| e.to_string())?;
    file.sync_all().map_err(|e| e.to_string())?;
    fs::rename(&pending, path).map_err(|e| e.to_string())
}

fn fetch_feed(api: &str, token: &str, match_id: &str) -> Option<Vec<u8>> {
    let agent = ureq::AgentBuilder::new()
        .redirects(0)
        .timeout(Duration::from_secs(5))
        .build();
    let reply = agent
        .get(&format!("{api}/matches/{match_id}/live-scoreboard"))
        .set("Authorization", &format!("Bearer {token}"))
        .set("X-Scoreboard-Utilities", "v1")
        .set("X-Scoreboard-VIP", "v1")
        .call()
        .ok()?;
    let mut bytes = Vec::new();
    reply
        .into_reader()
        .take(MAX_FEED + 1)
        .read_to_end(&mut bytes)
        .ok()?;
    if bytes.len() as u64 > MAX_FEED || !bytes.starts_with(b"#16c-scoreboard-v") {
        return None;
    }
    Some(bytes)
}

pub struct NativeSession {
    pub directory: PathBuf,
    stop: Arc<AtomicBool>,
    workers: Vec<JoinHandle<()>>,
}

impl NativeSession {
    #[cfg(target_os = "linux")]
    pub fn start(
        config_dir: &Path,
        connection: &Connection,
        api: &str,
        token: &str,
    ) -> Result<Self, String> {
        let id = Uuid::new_v4().to_string();
        let directory = config_dir.join("web-sessions").join(&id);
        Self::start_at(directory, connection, api, token)
    }

    pub fn start_at(
        directory: PathBuf,
        connection: &Connection,
        api: &str,
        token: &str,
    ) -> Result<Self, String> {
        let id = Uuid::new_v4().to_string();
        fs::create_dir_all(directory.parent().ok_or("Invalid managed session path")?)
            .map_err(|e| e.to_string())?;
        fs::create_dir(&directory).map_err(|e| e.to_string())?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            fs::set_permissions(&directory, fs::Permissions::from_mode(0o700))
                .map_err(|e| e.to_string())?;
        }
        let issued = now_ms()?;
        let expires = issued + TICKET_LIFETIME_MS;
        let setup = (|| -> Result<(), String> {
            let endpoint_ip = connection
                .host
                .parse::<Ipv4Addr>()
                .ok()
                .or_else(|| {
                    (connection.host.as_str(), connection.port)
                        .to_socket_addrs()
                        .ok()?
                        .find_map(|address| match address.ip() {
                            std::net::IpAddr::V4(ip) => Some(ip),
                            _ => None,
                        })
                })
                .ok_or("Match server has no IPv4 endpoint")?;
            owned_write(
                &directory.join("manifest.json"),
                serde_json::json!({"matchId": connection.match_id})
                    .to_string()
                    .as_bytes(),
            )?;
            owned_write(
                &directory.join("server.endpoint"),
                format!("{endpoint_ip}:{}\n", connection.port).as_bytes(),
            )?;
            owned_write(&directory.join("overlay.mode"), b"scoreboard\n")?;
            owned_write(&directory.join("overlay.enabled"), b"1\n")?;
            owned_write(&directory.join("hud-lightweight.enabled"), b"1\n")?;
            owned_write(&directory.join("scoreboard.visible"), b"0\n")?;
            owned_write(
                &directory.join("session.ticket"),
                format!("v1\n{id}\n{issued}\n{expires}\n").as_bytes(),
            )?;
            owned_write(
                &directory.join("launcher.lease"),
                format!("{id}\n").as_bytes(),
            )
        })();
        if let Err(error) = setup {
            let _ = fs::remove_dir_all(&directory);
            return Err(error);
        }
        let stop = Arc::new(AtomicBool::new(false));
        let heartbeat_stop = Arc::clone(&stop);
        let heartbeat_path = directory.clone();
        let heartbeat = thread::spawn(move || {
            while !heartbeat_stop.load(Ordering::Relaxed) {
                if now_ms().is_ok_and(|now| now >= expires) {
                    break;
                }
                if owned_write(
                    &heartbeat_path.join("launcher.lease"),
                    format!("{id}\n").as_bytes(),
                )
                .is_err()
                {
                    break;
                }
                for _ in 0..10 {
                    if heartbeat_stop.load(Ordering::Relaxed) {
                        break;
                    }
                    thread::sleep(Duration::from_millis(100));
                }
            }
            let _ = owned_write(&heartbeat_path.join("launcher.stopped"), b"1\n");
            let _ = fs::remove_file(heartbeat_path.join("launcher.lease"));
            let _ = fs::remove_file(heartbeat_path.join("session.ticket"));
        });
        let feed_stop = Arc::clone(&stop);
        let feed_path_root = directory.clone();
        let api = api.to_owned();
        let token = token.to_owned();
        let match_id = connection.match_id.clone();
        let feed = thread::spawn(move || {
            let feed_path =
                feed_path_root.join("game/cstrike/addons/amxmodx/data/16c_scoreboard.tsv");
            while !feed_stop.load(Ordering::Relaxed) {
                if now_ms().is_ok_and(|now| now >= expires) {
                    break;
                }
                if let Some(snapshot) = fetch_feed(&api, &token, &match_id) {
                    let _ = owned_write(&feed_path, &snapshot);
                } else {
                    let _ = fs::remove_file(&feed_path);
                }
                for _ in 0..5 {
                    if feed_stop.load(Ordering::Relaxed) {
                        break;
                    }
                    thread::sleep(Duration::from_millis(100));
                }
            }
            let _ = fs::remove_file(&feed_path);
        });
        Ok(Self {
            directory,
            stop,
            workers: vec![heartbeat, feed],
        })
    }

    pub fn stop(&mut self) {
        self.stop.store(true, Ordering::Relaxed);
        for worker in self.workers.drain(..) {
            let _ = worker.join();
        }
    }

    pub fn write_nextclient_handoff(
        &self,
        connection: &Connection,
        join_key: &str,
    ) -> Result<(), String> {
        if !join_key.starts_with("_16c_") || join_key.len() != 21 {
            return Err("Invalid NextClient join key".into());
        }
        for (name, value) in [
            ("player.name", format!("{}\n", connection.player_name)),
            ("join.key", format!("{join_key}\n")),
            ("join.cleanup", "\n".into()),
            ("join.token", format!("{}\n", connection.join_token)),
            ("server.password", format!("{}\n", connection.password)),
            ("texture.size", "512\n".into()),
            ("fast-switch.preference", "inherit\n".into()),
        ] {
            let path = self.directory.join(name);
            let mut options = OpenOptions::new();
            options.write(true).create_new(true);
            #[cfg(unix)]
            {
                use std::os::unix::fs::OpenOptionsExt;
                options.mode(0o600).custom_flags(libc::O_NOFOLLOW);
            }
            let mut file = options.open(&path).map_err(|e| e.to_string())?;
            file.write_all(value.as_bytes())
                .map_err(|e| e.to_string())?;
            file.sync_all().map_err(|e| e.to_string())?;
        }
        Ok(())
    }

    pub fn cleanup(&self) -> Result<(), String> {
        match fs::remove_dir_all(&self.directory) {
            Ok(()) => Ok(()),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(error) => Err(error.to_string()),
        }
    }
}

impl Drop for NativeSession {
    fn drop(&mut self) {
        self.stop();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use competitive16_web_helper::Connection;
    use std::net::TcpListener;

    #[test]
    fn managed_session_uses_fixed_ticket_and_authenticated_feed() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        listener.set_nonblocking(true).unwrap();
        let port = listener.local_addr().unwrap().port();
        let feed = b"#16c-scoreboard-v16\tde_dust2\n".to_vec();
        let server = thread::spawn(move || {
            let deadline = std::time::Instant::now() + Duration::from_secs(5);
            loop {
                if let Ok((mut socket, _)) = listener.accept() {
                    socket
                        .set_read_timeout(Some(Duration::from_secs(2)))
                        .unwrap();
                    let mut request = [0u8; 2048];
                    let count = socket.read(&mut request).unwrap();
                    let request = String::from_utf8_lossy(&request[..count]).to_ascii_lowercase();
                    assert!(request.contains("/matches/"));
                    assert!(request.contains("authorization: bearer test-token"));
                    let header = format!(
                        "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
                        feed.len()
                    );
                    socket.write_all(header.as_bytes()).unwrap();
                    socket.write_all(&feed).unwrap();
                    return feed;
                }
                assert!(
                    std::time::Instant::now() < deadline,
                    "feed request did not arrive"
                );
                thread::sleep(Duration::from_millis(10));
            }
        });
        let connection = Connection {
            match_id: Uuid::new_v4().to_string(),
            mode: "5v5".into(),
            host: "127.0.0.1".into(),
            port: 27015,
            password: "example".into(),
            join_token: "a".repeat(32),
            player_name: "Test".into(),
        };
        let directory = std::env::temp_dir().join(format!("16c-native-session-{}", Uuid::new_v4()));
        let mut session = NativeSession::start_at(
            directory.clone(),
            &connection,
            &format!("http://127.0.0.1:{port}"),
            "test-token",
        )
        .unwrap();
        let ticket = fs::read_to_string(directory.join("session.ticket")).unwrap();
        let fields: Vec<_> = ticket.lines().collect();
        assert_eq!(fields[0], "v1");
        assert_eq!(
            fields[3].parse::<u128>().unwrap() - fields[2].parse::<u128>().unwrap(),
            TICKET_LIFETIME_MS
        );
        let expected = server.join().unwrap();
        let feed_path = directory.join("game/cstrike/addons/amxmodx/data/16c_scoreboard.tsv");
        let deadline = std::time::Instant::now() + Duration::from_secs(3);
        while !feed_path.exists() && std::time::Instant::now() < deadline {
            thread::sleep(Duration::from_millis(10));
        }
        assert_eq!(fs::read(feed_path).unwrap(), expected);
        session.stop();
        assert!(!directory.join("session.ticket").exists());
        assert!(!directory.join("launcher.lease").exists());
        session.cleanup().unwrap();
    }
}
