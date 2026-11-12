use crate::*;
use serde_json::{json, Value};
use std::io::Read;
#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Launch {
    pub server_id: String,
    pub group_id: Option<String>,
    pub community_id: Option<String>,
}
impl Launch {
    pub fn validate(&self) -> Result<(), String> {
        if std::iter::once(&self.server_id)
            .chain(self.group_id.iter())
            .chain(self.community_id.iter())
            .any(|id| uuid::Uuid::parse_str(id).is_err())
        {
            return Err("Invalid partner launch".into());
        }
        Ok(())
    }
}
#[derive(Clone)]
pub struct Server {
    pub game: String,
    pub id: String,
    pub host: String,
    pub port: u16,
    pub ticket: Option<String>,
    pub connection_id: Option<String>,
}
pub(crate) fn request(api: &str, token: &str, path: &str, post: bool) -> Result<Value, String> {
    let agent = ureq::AgentBuilder::new()
        .redirects(0)
        .timeout(Duration::from_secs(10))
        .build();
    let request = agent
        .request(if post { "POST" } else { "GET" }, &format!("{api}{path}"))
        .set("Authorization", &format!("Bearer {token}"));
    let response = if post {
        request.send_json(json!({}))
    } else {
        request.call()
    }
    .map_err(|_| "Partner request failed")?;
    let mut bytes = Vec::new();
    response
        .into_reader()
        .take(1024 * 1024 + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| "Partner response unavailable")?;
    if bytes.len() > 1024 * 1024 {
        return Err("Partner response too large".into());
    }
    serde_json::from_slice(&bytes).map_err(|_| "Invalid partner response".into())
}
fn public_ipv4(ip: std::net::Ipv4Addr) -> bool {
    let [a, b, c, _] = ip.octets();
    a > 0
        && a < 224
        && a != 10
        && a != 127
        && !(a == 169 && b == 254)
        && !(a == 172 && (16..=31).contains(&b))
        && !(a == 192 && [168, 0, 2].contains(&b))
        && !(a == 100 && (64..=127).contains(&b))
        && !(a == 198 && (b == 18 || b == 19 || b == 51 && c == 100))
        && !(a == 203 && b == 0 && c == 113)
}
fn address(host: &str, port: u16) -> Result<String, String> {
    if let Ok(ip) = host.parse::<std::net::Ipv4Addr>() {
        if public_ipv4(ip) || ip.is_private() {
            return Ok(ip.to_string());
        }
        return Err("Partner address rejected".into());
    }
    let host = host.to_owned();
    let (tx, rx) = std::sync::mpsc::sync_channel(1);
    std::thread::spawn(move || {
        use std::net::ToSocketAddrs;
        let addresses = (host.as_str(), port).to_socket_addrs().ok().map(|rows| {
            rows.filter_map(|row| match row.ip() {
                std::net::IpAddr::V4(ip) => Some(ip),
                _ => None,
            })
            .collect::<Vec<_>>()
        });
        let _ = tx.send(addresses);
    });
    let addresses = rx
        .recv_timeout(Duration::from_secs(3))
        .ok()
        .flatten()
        .ok_or("Partner server unavailable")?;
    if addresses.is_empty() || addresses.iter().any(|ip| !public_ipv4(*ip)) {
        return Err("Partner address rejected".into());
    }
    Ok(addresses[0].to_string())
}
fn parse_server(value: &Value, id: &str) -> Result<Server, String> {
    if value["id"] != id || !matches!(value["gameVersion"].as_str(), Some("cs16" | "cs13")) {
        return Err("Unsupported partner game version".into());
    }
    let host = value["host"]
        .as_str()
        .filter(|s| {
            !s.is_empty()
                && s.len() <= 253
                && s.bytes()
                    .all(|c| c.is_ascii_alphanumeric() || c == b'.' || c == b'-')
        })
        .ok_or("Invalid partner server address")?;
    let port = value["port"]
        .as_u64()
        .filter(|p| *p > 0 && *p <= 65535)
        .ok_or("Invalid partner server port")? as u16;
    Ok(Server {
        game: value["gameVersion"].as_str().unwrap().into(),
        id: id.into(),
        host: host.into(),
        port,
        ticket: None,
        connection_id: None,
    })
}
pub fn resolve(api: &str, token: &str, launch: &Launch) -> Result<Server, String> {
    launch.validate()?;
    let value = if let Some(group) = &launch.group_id {
        let group = request(api, token, &format!("/partners/launch/{group}"), false)?;
        if group["status"] != "ready" {
            return Err("Partner group is not ready".into());
        }
        group["server"].clone()
    } else {
        let path = launch
            .community_id
            .as_ref()
            .map(|id| format!("/partners/branding/public/{id}"))
            .unwrap_or_else(|| "/partners/branding/me".into());
        let response = request(api, token, &path, false)?;
        response["branding"]["servers"]
            .as_array()
            .and_then(|servers| servers.iter().find(|s| s["id"] == launch.server_id))
            .cloned()
            .ok_or("Partner server unavailable")?
    };
    let mut server = parse_server(&value, &launch.server_id)?;
    server.host = address(&server.host, server.port)?;
    let ticket = request(
        api,
        token,
        &format!("/partners/servers/{}/launch-ticket", server.id),
        true,
    )?;
    if !ticket["ticket"].is_null() {
        server.ticket = Some(
            ticket["ticket"]
                .as_str()
                .filter(|s| s.len() == 32 && s.bytes().all(|c| c.is_ascii_hexdigit()))
                .ok_or("Invalid partner launch ticket")?
                .into(),
        );
        server.connection_id = Some(
            ticket["connectionId"]
                .as_str()
                .filter(|id| uuid::Uuid::parse_str(id).is_ok())
                .ok_or("Invalid partner connection")?
                .into(),
        );
    }
    Ok(server)
}
pub fn mark_launched(api: &str, token: &str, launch: &Launch) -> Result<(), String> {
    if let Some(group) = &launch.group_id {
        request(
            api,
            token,
            &format!("/partners/launch/{group}/launched"),
            true,
        )?;
    }
    Ok(())
}
pub fn authorized(
    api: &str,
    token: &str,
    server: &str,
    connection: Option<&str>,
    startup: bool,
) -> bool {
    let path = if connection.is_some() {
        "/partners/play/presence"
    } else {
        "/auth/session"
    };
    let agent = ureq::AgentBuilder::new()
        .redirects(0)
        .timeout(Duration::from_secs(5))
        .build();
    match agent
        .get(&format!("{api}{path}"))
        .set("Authorization", &format!("Bearer {token}"))
        .call()
    {
        Ok(response) => {
            let mut bytes = Vec::new();
            if response
                .into_reader()
                .take(65537)
                .read_to_end(&mut bytes)
                .is_err()
                || bytes.len() > 65536
            {
                return false;
            }
            let Ok(value) = serde_json::from_slice::<Value>(&bytes) else {
                return false;
            };
            if let Some(connection) = connection {
                value["server"]["id"] == server && value["connectionId"] == connection
                    || value.is_null() && startup
            } else {
                !value.is_null()
            }
        }
        Err(ureq::Error::Status(code, _)) if matches!(code, 401 | 403 | 404 | 409 | 410) => false,
        Err(_) => true, // availability does not renew the fixed native ticket
    }
}
static ACTIVE: std::sync::atomic::AtomicUsize = std::sync::atomic::AtomicUsize::new(0);
pub fn busy() -> bool {
    ACTIVE.load(std::sync::atomic::Ordering::Relaxed) > 0
}
pub fn start_background(api: &str, token: &str, launch: Launch) -> Result<Value, String> {
    launch.validate()?;
    if competitive16_web_helper::allowed_api_origin(api, cfg!(debug_assertions)).as_deref()
        != Some(api)
    {
        return Err("Invalid partner API".into());
    }
    let response = request(api, token, "/auth/web-handoff/", true)?;
    let handoff = response["token"]
        .as_str()
        .filter(|value| {
            (32..=128).contains(&value.len())
                && value
                    .bytes()
                    .all(|c| c.is_ascii_alphanumeric() || c == b'_' || c == b'-')
        })
        .ok_or("Invalid partner authorization")?;
    let token = session(api, handoff)?;
    let api = api.to_owned();
    let (tx, rx) = std::sync::mpsc::sync_channel(1);
    ACTIVE.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
    std::thread::spawn(move || {
        struct Active;
        impl Drop for Active {
            fn drop(&mut self) {
                ACTIVE.fetch_sub(1, std::sync::atomic::Ordering::Relaxed);
            }
        }
        let _active = Active;
        let result = self::launch(&api, &token, &launch, &mut || {
            tx.send(Ok(()))
                .map_err(|_| "Partner launch request closed".into())
        });
        if let Err(error) = result {
            eprintln!("Partner native session ended: {error}");
            let _ = tx.try_send(Err(error));
        }
    });
    rx.recv_timeout(Duration::from_secs(300))
        .map_err(|_| "Partner launch timed out")??;
    Ok(json!({"ok":true,"event":"launched"}))
}

fn legacy_partner_args(server: &Server, mod_dir: &str) -> Vec<String> {
    let mut args = vec!["-game".into(), mod_dir.into()];
    args.extend(launch_pattern().cs13.windows_flags.iter().flatten().cloned());
    for _ in 0..20 { args.push("+wait".into()); }
    if let Some(ticket) = &server.ticket { args.extend(["+setinfo".into(), "_16p".into(), ticket.clone()]); }
    args.extend(["+connect".into(), format!("{}:{}",server.host,server.port)]);
    args
}
// Ordinary partner CS 1.3 servers use their selected legacy executable and mod,
// without installing the CS 1.6 cosmetic module or changing game configuration.
fn launch_legacy_partner(api: &str, token: &str, launch: &Launch, server: &Server,
    root: &Path, executable: &Path, mod_dir: &str, ready: &mut dyn FnMut() -> Result<(),String>) -> Result<(),String> {
    let _mode = session_mode::Lease::native_wait(&user_config_dir()?)?;
    let startup = owned_game::Startup::prepare_replacing(executable, &root.join(mod_dir)).map_err(|_| "GAME_CLOSE_FAILED")?;
    let mut command = if cfg!(target_os="linux") && executable.extension().is_some_and(|ext| ext.eq_ignore_ascii_case("exe")) {
        let mut command = Command::new("wine"); command.arg(executable); command
    } else { Command::new(executable) };
    command.args(legacy_partner_args(server, mod_dir)).current_dir(root)
        .stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null());
    startup.recheck().map_err(|_| "GAME_STARTUP_FAILED")?;
    let mut child = command.spawn().map_err(desktop_session::game_spawn_failure)?;
    let owned = match startup.wait() {
        Ok(owned) => owned,
        Err(_) => { let _ = child.kill(); let _ = child.wait(); return Err("GAME_STARTUP_FAILED".into()); }
    };
    let result = (|| {
        mark_launched(api, token, launch)?;
        ready()?;
        let started = std::time::Instant::now();
        let mut checked = started;
        while !owned.exited()? {
            if desktop_session::stop_requested() || started.elapsed() >= Duration::from_secs(7200) {
                owned.stop()?; break;
            }
            if checked.elapsed() >= Duration::from_secs(15) {
                if !authorized(api, token, &server.id, server.connection_id.as_deref(), started.elapsed() < Duration::from_secs(90)) {
                    owned.stop()?; break;
                }
                checked = std::time::Instant::now();
            }
            std::thread::sleep(Duration::from_millis(100));
        }
        Ok(())
    })();
    if result.is_err() { let _ = owned.stop(); let _ = child.kill(); }
    let _ = child.wait();
    result
}

pub fn launch(
    api: &str,
    token: &str,
    launch: &Launch,
    ready: &mut dyn FnMut() -> Result<(), String>,
) -> Result<(), String> {
    launch.validate()?;
    let server = resolve(api, token, launch)?;
    let (root, executable, mod_dir) = managed_installations::choose(api, token, &server.game)?;
    if server.game == "cs13" {
        return launch_legacy_partner(api, token, launch, &server, &root, &executable, &mod_dir, ready);
    }
    #[cfg(target_os = "linux")]
    {
        let home = PathBuf::from(env::var_os("HOME").ok_or("Home directory unavailable")?);
        let proton = steam_proton::resolve(&root, &home)?;
        if proton.is_some() || executable.extension().is_some_and(|ext| ext == "exe") {
            return compatibility::launch_partner(
                launch,
                api,
                token,
                &root,
                proton.as_ref(),
                ready,
            );
        }
    }
    #[cfg(windows)]
    let gold_client =
        !root.join("nitro_api2.dll").is_file() && windows_native::is_gold_client(&root)?;
    #[cfg(not(windows))]
    let gold_client = false;
    #[cfg(target_os = "linux")]
    let library_paths = {
        let root = root.clone();
        let home = PathBuf::from(env::var_os("HOME").ok_or("Home directory unavailable")?);
        std::thread::spawn(move || steam_proton::native_library_path(&root, &home))
    };
    let config = user_config_dir()?;
    let ownership = session_mode::VoiceOwnership::start(&config, &server.id)?;
    let _mode = session_mode::Lease::native_wait(&config)?;
    let preferences = settings_bridge::load()?.settings;
    let bundle = native_bundle::prepare(&config)?;
    let startup = owned_game::Startup::prepare_replacing(&executable, &root.join(&mod_dir))
        .map_err(|_| "GAME_CLOSE_FAILED")?;
    if cs16_requires_steam(&root, root.join("nitro_api2.dll").is_file(), gold_client) {
        start_steam_client()?;
    }
    #[cfg(windows)]
    windows_native::prepare_existing(&root, &bundle)?;
    let directory = if cfg!(windows) {
        root.join("16competitive/live-session")
    } else {
        config
            .join("web-sessions")
            .join(uuid::Uuid::new_v4().to_string())
    };
    let mut session = native_session::NativeSession::start_partner_at(
        directory,
        &server,
        api,
        token,
        &preferences,
    )?;
    #[cfg(windows)]
    let mut installation = None;
    let result = (|| -> Result<(), String> {
        #[cfg(windows)]
        {
            installation = windows_native::WindowsInstall::install(&root, &bundle)?;
            if installation.is_none() {
                return Err("This installation does not support the native session module".into());
            }
        }
        let mut command = Command::new(&executable);
        let pattern = launch_pattern();
        #[cfg(windows)]
        command.args(cs16_standalone_windows_args(&root, &pattern.cs16)?);
        #[cfg(not(windows))]
        command.args(["-game", &mod_dir]);
        command.arg("-gl");
        command.arg(
            pattern
                .cs16
                .managed_native_flag
                .as_deref()
                .ok_or("Missing managed native flag")?,
        );
        #[cfg(windows)]
        if executable
            .file_name()
            .is_some_and(|name| name.eq_ignore_ascii_case("cstrike.exe"))
        {
            command.arg(
                pattern
                    .cs16
                    .next_client_managed_flag
                    .as_deref()
                    .ok_or("Missing NextClient managed flag")?,
            );
        } else if windows_native::is_gold_client(&root)? {
            command.arg(
                pattern
                    .cs16
                    .gold_client_managed_flag
                    .as_deref()
                    .ok_or("Missing GoldClient managed flag")?,
            );
        }
        for _ in 0..20 {
            command.arg("+wait");
        }
        if let Some(ticket) = &server.ticket {
            command.args(["+setinfo", "_16p", ticket]);
        }
        command
            .arg("+connect")
            .arg(format!("{}:{}", server.host, server.port));
        command
            .current_dir(&root)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .env("PAPAMO_SKIN_PROBE_SESSION", &session.directory);
        #[cfg(target_os = "linux")]
        {
            command
                .env("LD_PRELOAD", &bundle.module)
                .env("SteamAppId", "10")
                .env("SteamGameId", "10");
            command.env(
                "LD_LIBRARY_PATH",
                library_paths
                    .join()
                    .map_err(|_| "Steam runtime initialization failed")??,
            );
        }
        startup.recheck()?;
        let mut child = command.spawn().map_err(|_| "Partner game launch failed")?;
        let mut owned = None;
        let run = (|| -> Result<(), String> {
            owned = Some(startup.wait()?);
            mark_launched(api, token, launch)?;
            ready()?;
            ownership.ready(&server.id, &session.directory)?;
            let _voice = native_voice::Session::start(
                session.directory.clone(),
                api.into(),
                token.into(),
                native_voice::Context {
                    kind: "partner".into(),
                    id: server.id.clone(),
                },
            )?;
            loop {
                if owned.as_ref().unwrap().exited()? {
                    return Ok(());
                }
                if desktop_session::stop_requested() {
                    owned.as_ref().unwrap().stop()?;
                    return Ok(());
                }
                if !session.is_active() {
                    return Err("Partner native session ended".into());
                }
                std::thread::sleep(Duration::from_millis(100));
            }
        })();
        if run.is_err() {
            if let Some(game) = &owned {
                game.stop()?;
            }
            let _ = child.kill();
            child.wait().map_err(|_| "Partner game exit unavailable")?;
        }
        run
    })();
    session.stop();
    #[cfg(windows)]
    let _installation = installation; // Keep the verified host/module installed.
    session.cleanup()?;
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn authorization_is_bound_to_the_linked_connection_and_startup_grace() {
        use std::{io::Write, net::TcpListener};
        let check = |body: Value, status: u16, connection: Option<&str>, startup| {
            let listener = TcpListener::bind("127.0.0.1:0").unwrap();
            let address = listener.local_addr().unwrap();
            let expected_path = if connection.is_some() {
                "/partners/play/presence"
            } else {
                "/auth/session"
            };
            let worker = std::thread::spawn(move || {
                let (mut socket, _) = listener.accept().unwrap();
                socket
                    .set_read_timeout(Some(Duration::from_secs(2)))
                    .unwrap();
                let mut bytes = [0; 4096];
                let count = socket.read(&mut bytes).unwrap();
                let request = String::from_utf8_lossy(&bytes[..count]).to_lowercase();
                assert!(request.starts_with(&format!("get {expected_path} ")));
                assert!(request.contains("authorization: bearer fixture-token"));
                let body = body.to_string();
                write!(socket,"HTTP/1.1 {status} Test\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",body.len()).unwrap();
            });
            let result = authorized(
                &format!("http://{address}"),
                "fixture-token",
                "server",
                connection,
                startup,
            );
            worker.join().unwrap();
            result
        };
        assert!(check(
            json!({"server":{"id":"server"},"connectionId":"session"}),
            200,
            Some("session"),
            false
        ));
        assert!(!check(
            json!({"server":{"id":"other"},"connectionId":"session"}),
            200,
            Some("session"),
            true
        ));
        assert!(!check(
            json!({"server":{"id":"server"},"connectionId":"old"}),
            200,
            Some("session"),
            true
        ));
        assert!(check(Value::Null, 200, Some("session"), true));
        assert!(!check(Value::Null, 200, Some("session"), false));
        assert!(!check(Value::Null, 401, None, false));
        assert!(check(json!({"id":"player"}), 200, None, false));
        assert!(check(Value::Null, 503, Some("session"), false));
    }
    #[test]
    fn endpoint_validation_does_not_allow_local_services_or_dns_injection() {
        for host in [
            "127.0.0.1",
            "169.254.169.254",
            "0.0.0.0",
            "224.0.0.1",
            "192.0.2.1",
            "100.64.0.1",
        ] {
            assert!(address(host, 27015).is_err(), "{host}");
        }
        assert_eq!(address("192.168.1.2", 27015).unwrap(), "192.168.1.2");
        assert_eq!(address("8.8.8.8", 27015).unwrap(), "8.8.8.8");
    }
    #[test]
    fn server_metadata_never_accepts_shell_input_or_wrong_game() {
        let mut value = json!({"id":"server","gameVersion":"cs16","host":"127.0.0.1","port":27015});
        assert!(parse_server(&value, "server").is_ok());
        value["host"] = json!("127.0.0.1 +quit");
        assert!(parse_server(&value, "server").is_err());
        value["host"] = json!("127.0.0.1");
        value["gameVersion"] = json!("cs13");
        let mut server = parse_server(&value, "server").unwrap();
        assert_eq!(server.game, "cs13");
        server.ticket = Some("a".repeat(32));
        let args = legacy_partner_args(&server, "cstrk13");
        assert_eq!(&args[..2], &["-game", "cstrk13"]);
        assert_eq!(&args[args.len()-2..], &["+connect", "127.0.0.1:27015"]);
        assert!(!args.iter().any(|arg| arg == "-insecure" || arg == "-steam"));
        value["gameVersion"] = json!("cs15");
        assert!(parse_server(&value, "server").is_err());
    }
}

pub(crate) fn custom_scoreboard_allowed(api: &str, token: &str, server_id: &str) -> Option<bool> {
    request(
        api,
        token,
        &format!("/partners/branding/server/{server_id}/scoreboard-policy"),
        false,
    )
    .ok()
    .and_then(|v| v["customScoreboardEnabled"].as_bool())
}
