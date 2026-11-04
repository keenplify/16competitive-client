//! Native voice owns capture, playback, DTLS/SRTP and authenticated signaling.
//! No browser, Electron window or plaintext media transport is involved.
mod audio;
mod peer;

use audio::{Audio, Mixer, Playback};
use futures_util::{SinkExt, StreamExt};
use peer::{Peer, Signal};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    collections::{HashMap, HashSet},
    io::Read,
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    thread::JoinHandle,
    time::{Duration, Instant},
};
use tokio::{sync::mpsc, time::timeout};
use tokio_tungstenite::{
    connect_async_with_config,
    tungstenite::{protocol::WebSocketConfig, Message},
};
use webrtc::{
    ice_transport::ice_server::RTCIceServer,
    peer_connection::{
        configuration::RTCConfiguration, policy::ice_transport_policy::RTCIceTransportPolicy,
    },
};

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Preference {
    pub muted: bool,
    pub volume: f32,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Preferences {
    pub enabled: bool,
    pub open_mic: bool,
    #[serde(default)]
    pub peers: HashMap<String, Preference>,
}
impl Default for Preferences {
    fn default() -> Self {
        Self {
            enabled: true,
            open_mic: false,
            peers: HashMap::new(),
        }
    }
}
impl Preferences {
    pub fn validate(&self) -> Result<(), String> {
        if self.peers.len() > 100
            || self.peers.iter().any(|(id, p)| {
                id.is_empty()
                    || id.len() > 80
                    || !p.volume.is_finite()
                    || !(0.0..=2.0).contains(&p.volume)
            })
        {
            return Err("Invalid native voice preferences".into());
        }
        Ok(())
    }
}

#[derive(Clone, PartialEq, Eq, Deserialize, Serialize)]
pub struct Context {
    pub kind: String,
    pub id: String,
}

#[derive(Clone, Deserialize)]
struct Member {
    id: String,
    #[serde(default)]
    team: bool,
    #[serde(default)]
    party: bool,
}

fn transmits(
    context: &Context,
    member: &Member,
    settings: &Preferences,
    ptt: [bool; 2],
    party: &HashSet<String>,
) -> bool {
    if !settings.enabled {
        return false;
    }
    if settings.open_mic {
        return true;
    }
    if context.kind == "party" {
        return ptt[1];
    }
    if ptt[0] {
        return context.kind != "partner" || member.team;
    }
    ptt[1]
        && if context.kind == "partner" {
            member.party
        } else {
            party.contains(&member.id)
        }
}

fn configuration(value: &Value, local: bool) -> Result<RTCConfiguration, String> {
    let policy = match value["iceTransportPolicy"].as_str() {
        Some("relay") => RTCIceTransportPolicy::Relay,
        Some("all") if local => RTCIceTransportPolicy::All,
        _ => return Err("voice-relay-required".into()),
    };
    let servers = value["iceServers"]
        .as_array()
        .filter(|s| s.len() <= 4)
        .ok_or("voice-relay-invalid")?;
    let mut ice_servers = Vec::new();
    for server in servers {
        let urls = match &server["urls"] {
            Value::String(url) => vec![url.clone()],
            Value::Array(urls) if !urls.is_empty() && urls.len() <= 4 => urls
                .iter()
                .map(|url| url.as_str().map(str::to_owned).ok_or("voice-relay-invalid"))
                .collect::<Result<Vec<_>, _>>()?,
            _ => return Err("voice-relay-invalid".into()),
        };
        if urls.iter().any(|url| {
            url.len() > 512
                || !(url.starts_with("stun:")
                    || url.starts_with("turn:")
                    || url.starts_with("turns:"))
        }) {
            return Err("voice-relay-invalid".into());
        }
        let username = server["username"].as_str().unwrap_or("");
        let credential = server["credential"].as_str().unwrap_or("");
        if username.len() > 256 || credential.len() > 512 {
            return Err("voice-relay-invalid".into());
        }
        ice_servers.push(RTCIceServer {
            urls,
            username: username.into(),
            credential: credential.into(),
            ..Default::default()
        });
    }
    Ok(RTCConfiguration {
        ice_servers,
        ice_transport_policy: policy,
        ..Default::default()
    })
}

fn ptt(directory: &Path) -> [bool; 2] {
    let path = directory.join("ptt.state");
    let Ok(meta) = std::fs::symlink_metadata(&path) else {
        return [false; 2];
    };
    if !meta.is_file() || meta.file_type().is_symlink() || meta.len() != 4 {
        return [false; 2];
    }
    let mut bytes = Vec::new();
    if std::fs::File::open(path)
        .and_then(|f| f.take(5).read_to_end(&mut bytes))
        .is_err()
    {
        return [false; 2];
    }
    match bytes.as_slice() {
        b"0 0\n" => [false, false],
        b"1 0\n" => [true, false],
        b"0 1\n" => [false, true],
        b"1 1\n" => [true, true],
        _ => [false; 2],
    }
}

fn party_members(api: &str, token: &str) -> HashSet<String> {
    let result = (|| -> Option<HashSet<String>> {
        let response = ureq::AgentBuilder::new()
            .redirects(0)
            .timeout(Duration::from_secs(3))
            .build()
            .get(&format!("{api}/party"))
            .set("Authorization", &format!("Bearer {token}"))
            .call()
            .ok()?;
        let mut bytes = Vec::new();
        response
            .into_reader()
            .take(65537)
            .read_to_end(&mut bytes)
            .ok()?;
        if bytes.len() > 65536 {
            return None;
        }
        let value: Value = serde_json::from_slice(&bytes).ok()?;
        let members = value["party"]["members"].as_array()?;
        if members.len() > 20 {
            return None;
        }
        Some(
            members
                .iter()
                .filter_map(|m| {
                    m["id"]
                        .as_str()
                        .filter(|id| id.len() <= 80)
                        .map(str::to_owned)
                })
                .collect(),
        )
    })();
    result.unwrap_or_default()
}

struct Room {
    self_id: String,
    config: RTCConfiguration,
    members: HashMap<String, Member>,
    peers: HashMap<String, Peer>,
    mixer: Mixer,
    outgoing: mpsc::Sender<Signal>,
    generation: u64,
}
impl Room {
    async fn ensure(&mut self, id: &str) -> Result<(), String> {
        if self.peers.contains_key(id) {
            return Ok(());
        }
        if !self.members.contains_key(id) || id == self.self_id || self.peers.len() >= 31 {
            return Err("voice-peer-forbidden".into());
        }
        self.generation += 1;
        let peer = Peer::new(
            id,
            &self.self_id,
            self.generation,
            self.config.clone(),
            self.mixer.clone(),
            self.outgoing.clone(),
        )
        .await?;
        self.mixer
            .lock()
            .map_err(|_| "voice-mixer-unavailable")?
            .insert(
                id.into(),
                Playback {
                    generation: self.generation,
                    volume: 1.0,
                    ..Default::default()
                },
            );
        self.peers.insert(id.into(), peer);
        Ok(())
    }
    async fn remove(&mut self, id: &str) {
        if let Ok(mut mixer) = self.mixer.lock() {
            mixer.remove(id);
        }
        if let Some(peer) = self.peers.remove(id) {
            let _ = timeout(Duration::from_secs(2), peer.connection.close()).await;
        }
    }
    async fn close(&mut self) {
        if let Ok(mut mixer) = self.mixer.lock() {
            mixer.clear();
        }
        let peers: Vec<_> = self.peers.drain().map(|(_, peer)| peer).collect();
        let _ = timeout(
            Duration::from_secs(2),
            futures_util::future::join_all(peers.iter().map(|peer| peer.connection.close())),
        )
        .await;
    }
    fn preferences(&self, settings: &Preferences) {
        if let Ok(mut mixer) = self.mixer.lock() {
            for (id, playback) in mixer.iter_mut() {
                playback.muted =
                    !settings.enabled || settings.peers.get(id).is_some_and(|p| p.muted);
                playback.volume = settings.peers.get(id).map_or(1.0, |p| p.volume);
                if playback.muted {
                    playback.samples.clear();
                }
            }
        }
    }
}

fn needs_ready_check(event: &Value, context: &Context) -> bool {
    context.kind == "match" && event["type"] == "match_ready_check"
        && event["whileQueued"] != true
        && event["matchId"].as_str().is_some_and(|id|
            id != context.id && uuid::Uuid::parse_str(id).is_ok())
}

pub struct Session {
    return_to_launcher: Arc<AtomicBool>,
    stop: Arc<AtomicBool>,
    worker: Option<JoinHandle<()>>,
}
impl Session {
    pub fn start(
        directory: PathBuf,
        api: String,
        token: String,
        context: Context,
    ) -> Result<Self, String> {
        if competitive16_web_helper::allowed_api_origin(&api, cfg!(debug_assertions)).as_deref()
            != Some(&api)
            || !matches!(context.kind.as_str(), "party" | "match" | "partner")
            || uuid::Uuid::parse_str(&context.id).is_err()
            || token.is_empty()
            || token.len() > 2048
            || !token.bytes().all(|b| b > 32 && b < 127)
        {
            return Err("Invalid native voice session".into());
        }
        let stop = Arc::new(AtomicBool::new(false));
        let stopped = stop.clone();
        let return_to_launcher = Arc::new(AtomicBool::new(false));
        let requested = return_to_launcher.clone();
        let worker = std::thread::spawn(move || {
            let Ok(runtime) = tokio::runtime::Builder::new_multi_thread()
                .worker_threads(2)
                .enable_all()
                .build()
            else {
                return;
            };
            runtime.block_on(async {
                while !stopped.load(Ordering::Relaxed) {
                    let _ = run(&directory, &api, &token, &context, &stopped, &requested).await;
                    let _ = crate::native_session::owned_write(
                        &directory.join("voice.state.json"),
                        b"{\"connected\":false}",
                    );
                    for _ in 0..20 {
                        if stopped.load(Ordering::Relaxed) {
                            break;
                        }
                        tokio::time::sleep(Duration::from_millis(100)).await;
                    }
                }
            });
            runtime.shutdown_timeout(Duration::from_secs(1));
        });
        Ok(Self {
            return_to_launcher,
            stop,
            worker: Some(worker),
        })
    }
    pub fn needs_launcher(&self) -> bool { self.return_to_launcher.load(Ordering::Relaxed) }
    pub fn stop(&mut self) {
        self.stop.store(true, Ordering::Relaxed);
        if let Some(worker) = self.worker.take() {
            let _ = worker.join();
        }
    }
}
impl Drop for Session {
    fn drop(&mut self) {
        self.stop();
    }
}

async fn run(
    directory: &Path,
    api: &str,
    token: &str,
    context: &Context,
    stop: &AtomicBool,
    return_to_launcher: &AtomicBool,
) -> Result<(), String> {
    let mut url = url::Url::parse(api).map_err(|_| "voice-api-invalid")?;
    url.set_scheme(if api.starts_with("https:") {
        "wss"
    } else {
        "ws"
    })
    .map_err(|_| "voice-api-invalid")?;
    url.set_path("/matchmaking/ws");
    let config = WebSocketConfig::default()
        .max_message_size(Some(256 * 1024))
        .max_frame_size(Some(256 * 1024));
    let (socket, _) = timeout(
        Duration::from_secs(5),
        connect_async_with_config(url.as_str(), Some(config), false),
    )
    .await
    .map_err(|_| "voice-connect-timeout")?
    .map_err(|_| "voice-connect-failed")?;
    let (mut sender, mut receiver) = socket.split();
    let (outgoing, mut signals) = mpsc::channel(128);
    let (frames, mut microphone) = mpsc::channel(4);
    let mixer: Mixer = Arc::new(Mutex::new(HashMap::new()));
    let mut room = Room {
        self_id: String::new(),
        config: RTCConfiguration::default(),
        members: HashMap::new(),
        peers: HashMap::new(),
        mixer: mixer.clone(),
        outgoing,
        generation: 0,
    };
    let mut audio: Option<Audio> = None;
    let mut settings = crate::native_preferences::live_settings()?.voice;
    let mut party = HashSet::new();
    let mut encoder =
        opus::Encoder::new(audio::RATE, opus::Channels::Mono, opus::Application::Voip)
            .map_err(|_| "voice-codec-unavailable")?;
    let _ = encoder.set_bitrate(opus::Bitrate::Bits(24000));
    let _ = encoder.set_inband_fec(true);
    let _ = encoder.set_packet_loss_perc(10);
    let _ = encoder.set_dtx(true);
    let mut tick = tokio::time::interval(Duration::from_millis(30));
    let mut preferences_at = Instant::now();
    let mut ping_at = Instant::now();
    let mut roster_at = Instant::now();
    let mut last_received = Instant::now();
    let mut audio_retry = Instant::now();
    let mut authenticated = false;
    let mut joined = false;
    let mut last_status = String::new();
    let work = async {
        loop {
            tokio::select! {
                _=tick.tick()=>{
                    if stop.load(Ordering::Relaxed){return Ok(());}
                    if last_received.elapsed()>Duration::from_secs(40){return Err("voice-signaling-timeout".into());}
                    if Instant::now()>=preferences_at{
                        if let Ok(preferences)=crate::native_preferences::live_settings(){settings=preferences.voice;}
                        room.preferences(&settings);preferences_at=Instant::now()+Duration::from_secs(1);
                    }
                    if authenticated && settings.enabled && !joined{
                        sender.send(Message::Text(json!({"type":"voice_join","context":context}).to_string().into())).await.map_err(|_|"voice-signaling-failed")?;joined=true;
                    }else if joined && !settings.enabled{
                        sender.send(Message::Text(json!({"type":"voice_leave"}).to_string().into())).await.map_err(|_|"voice-signaling-failed")?;
                        room.close().await;room.members.clear();joined=false;audio=None;
                    }
                    if settings.enabled && !room.members.is_empty() && audio.is_none() && Instant::now()>=audio_retry{
                        audio=Audio::open(frames.clone(),mixer.clone()).ok();audio_retry=Instant::now()+Duration::from_secs(5);
                    }
                    if joined && roster_at.elapsed() >= Duration::from_secs(10) {
                        sender.send(Message::Text(json!({"type":"voice_join","context":context}).to_string().into())).await.map_err(|_|"voice-signaling-failed")?;
                        roster_at=Instant::now();
                    }
                    let keys=ptt(directory);
                    if let Some(device)=&audio{
                        device.transmitting.store(room.members.values().any(|p|transmits(context,p,&settings,keys,&party)),Ordering::Relaxed);
                        if device.failed.load(Ordering::Relaxed){audio=None;}
                    }
                    let status=json!({"connected":authenticated,"joined":joined,"peers":room.peers.len(),"audioReady":audio.is_some(),"team":keys[0],"party":keys[1]}).to_string();
                    if status!=last_status{let _=crate::native_session::owned_write(&directory.join("voice.state.json"),status.as_bytes());last_status=status;}
                    if ping_at.elapsed()>=Duration::from_secs(20){sender.send(Message::Text(json!({"type":"ping"}).to_string().into())).await.map_err(|_|"voice-signaling-failed")?;ping_at=Instant::now();}
                }
                frame=microphone.recv()=>{
                    let Some(frame)=frame else {return Err("voice-capture-ended".into());};
                    let keys=ptt(directory);
                    if !settings.enabled{continue;}
                    let packet=encoder.encode_vec_float(&frame,1275).map_err(|_|"voice-encode-failed")?;
                    let bytes=bytes::Bytes::from(packet);
                    let sends = room.peers.iter().filter(|(id,_)| room.members.get(*id)
                        .is_some_and(|member|transmits(context,member,&settings,keys,&party)))
                        .map(|(_,peer)| peer.send(bytes.clone()));
                    let _ = timeout(Duration::from_millis(100), futures_util::future::join_all(sends)).await;
                }
                signal=signals.recv()=>{
                    let Some(signal)=signal else {return Err("voice-signaling-ended".into());};
                    if room.peers.get(&signal.peer).is_some_and(|p|p.generation==signal.generation){
                        sender.send(Message::Text(json!({"type":"voice_signal","targetPlayerId":signal.peer,"signalType":signal.kind,"signal":signal.payload.to_string()}).to_string().into())).await.map_err(|_|"voice-signaling-failed")?;
                    }
                }
                message=receiver.next()=>{
                    let message=message.ok_or("voice-signaling-ended")?.map_err(|_|"voice-signaling-failed")?;
                    if matches!(message, Message::Close(_)){return Err("voice-signaling-ended".into());}
                    if let Message::Ping(data)=message{sender.send(Message::Pong(data)).await.map_err(|_|"voice-signaling-failed")?;continue;}
                    let Message::Text(text)=message else {continue;};
                    let event:Value=serde_json::from_str(&text).map_err(|_|"voice-event-invalid")?;last_received=Instant::now();
                    if authenticated && needs_ready_check(&event, context) {
                        return_to_launcher.store(true, Ordering::Relaxed);
                    }
                    match event["type"].as_str(){
                        Some("connected")=>sender.send(Message::Text(json!({"type":"authenticate","token":token,"client":"desktop"}).to_string().into())).await.map_err(|_|"voice-authentication-failed")?,
                        Some("authenticated")=>{
                            room.self_id=event["player"]["id"].as_str().filter(|id|!id.is_empty()&&id.len()<=80).ok_or("voice-authentication-failed")?.into();authenticated=true;
                            party=party_members(api,token);
                        }
                        Some("party_presence_ping")=>{if let Some(nonce)=event["nonce"].as_str().filter(|n|n.len()<=64){sender.send(Message::Text(json!({"type":"party_presence_pong","nonce":nonce}).to_string().into())).await.map_err(|_|"voice-signaling-failed")?;}}
                        Some("party_updated")=>{
                            party=event["party"]["members"].as_array().filter(|m|m.len()<=20).map(|members|members.iter().filter_map(|m|m["id"].as_str().map(str::to_owned)).collect()).unwrap_or_default();
                        }
                        Some("voice_session")|Some("voice_peer_joined")|Some("voice_peer_left")|Some("voice_signal")=>{
                            if !settings.enabled || !joined || serde_json::from_value::<Context>(event["context"].clone()).ok().as_ref()!=Some(context){continue;}
                            match event["type"].as_str().unwrap(){
                                "voice_session"=>{
                                    room.config=configuration(&event,api.starts_with("http:"))?;
                                    let members:Vec<Member>=serde_json::from_value(event["peers"].clone()).map_err(|_|"voice-roster-invalid")?;
                                    if members.len()>31 || members.iter().any(|m|m.id.is_empty()||m.id.len()>80||m.id==room.self_id){return Err("voice-roster-invalid".into());}
                                    let ids:HashSet<_>=members.iter().map(|m|m.id.clone()).collect();
                                    if ids.len()!=members.len(){return Err("voice-roster-invalid".into());}
                                    for id in room.peers.keys().filter(|id|!ids.contains(*id)).cloned().collect::<Vec<_>>(){room.remove(&id).await;}
                                    room.members=members.into_iter().map(|m|(m.id.clone(),m)).collect();
                                    for id in ids{room.ensure(&id).await?;if room.self_id<id && room.peers[&id].connection.local_description().await.is_none(){let offer=room.peers[&id].offer().await?;sender.send(Message::Text(json!({"type":"voice_signal","targetPlayerId":id,"signalType":"offer","signal":offer.to_string()}).to_string().into())).await.map_err(|_|"voice-signaling-failed")?;}}
                                    room.preferences(&settings);
                                }
                                "voice_peer_joined"=>{
                                    let member:Member=serde_json::from_value(event["peer"].clone()).map_err(|_|"voice-roster-invalid")?;
                                    if member.id.is_empty()||member.id.len()>80||member.id==room.self_id||room.members.len()>=31{continue;}
                                    let id=member.id.clone();room.remove(&id).await;room.members.insert(id.clone(),member);room.ensure(&id).await?;room.preferences(&settings);
                                    let offer=room.peers[&id].offer().await?;sender.send(Message::Text(json!({"type":"voice_signal","targetPlayerId":id,"signalType":"offer","signal":offer.to_string()}).to_string().into())).await.map_err(|_|"voice-signaling-failed")?;
                                }
                                "voice_peer_left"=>{if let Some(id)=event["playerId"].as_str(){room.members.remove(id);room.remove(id).await;}}
                                "voice_signal"=>{
                                    let id=event["fromPlayerId"].as_str().ok_or("voice-signal-invalid")?;
                                    // Only a backend-authorized roster member may negotiate media.
                                    if !room.members.contains_key(id){continue;}
                                    room.ensure(id).await?;
                                    let kind=event["signalType"].as_str().ok_or("voice-signal-invalid")?;
                                    let payload=event["signal"].as_str().ok_or("voice-signal-invalid")?;
                                    let answer=room.peers.get_mut(id).unwrap().signal(kind,payload).await?;
                                    room.generation=room.generation.max(room.peers[id].generation);
                                    if let Some(answer)=answer{
                                        sender.send(Message::Text(json!({"type":"voice_signal","targetPlayerId":id,"signalType":"answer","signal":answer.to_string()}).to_string().into())).await.map_err(|_|"voice-signaling-failed")?;
                                    }
                                }
                                _=>{}
                            }
                        }
                        Some("error") if matches!(event["code"].as_str(),Some("UNAUTHORIZED"|"VOICE_CONTEXT_FORBIDDEN"|"VOICE_PEER_FORBIDDEN"|"VOICE_NOT_JOINED"))=>return Err("voice-authorization-ended".into()),
                        _=>{}
                    }
                }
            }
        }
    };
    // Cancellation also interrupts a stalled WebRTC operation or socket write.
    let result = tokio::select! {
        result = work => result,
        _ = async {
            while !stop.load(Ordering::Relaxed) {
                tokio::time::sleep(Duration::from_millis(50)).await;
            }
        } => Ok(()),
    };
    drop(audio);
    room.close().await;
    let _ = timeout(Duration::from_secs(1), sender.close()).await;
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn ready_check_only_returns_for_another_ranked_match() {
        let context = Context { kind: "match".into(), id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa".into() };
        let mut event = json!({"type":"match_ready_check","matchId":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"});
        assert!(needs_ready_check(&event, &context));
        event["whileQueued"] = json!(true);
        assert!(!needs_ready_check(&event, &context));
        event["whileQueued"] = json!(false);
        event["matchId"] = json!(context.id);
        assert!(!needs_ready_check(&event, &context));
        event["matchId"] = json!("invalid");
        assert!(!needs_ready_check(&event, &context));
    }

    #[test]
    fn ptt_preserves_team_party_and_mute_boundaries() {
        let context = Context {
            kind: "partner".into(),
            id: "server".into(),
        };
        let member = Member {
            id: "friend".into(),
            team: false,
            party: true,
        };
        let mut settings = Preferences::default();
        let party = HashSet::new();
        assert!(!transmits(
            &context,
            &member,
            &settings,
            [true, false],
            &party
        ));
        assert!(transmits(
            &context,
            &member,
            &settings,
            [false, true],
            &party
        ));
        settings.enabled = false;
        settings.open_mic = true;
        assert!(!transmits(
            &context,
            &member,
            &settings,
            [true, true],
            &party
        ));
        settings.enabled = true;
        settings.open_mic = false;
        let context = Context {
            kind: "match".into(),
            id: "match".into(),
        };
        assert!(transmits(
            &context,
            &member,
            &settings,
            [true, false],
            &party
        ));
        assert!(!transmits(
            &context,
            &member,
            &settings,
            [false, true],
            &party
        ));
        assert!(transmits(
            &context,
            &member,
            &settings,
            [false, true],
            &HashSet::from(["friend".into()])
        ));
    }
    #[test]
    fn public_voice_cannot_downgrade_relay_policy() {
        let event = json!({"iceServers":[],"iceTransportPolicy":"all"});
        assert!(configuration(&event, false).is_err());
        assert!(configuration(&event, true).is_ok());
        assert!(configuration(
            &json!({"iceServers":[{"urls":"file:/secret"}],"iceTransportPolicy":"relay"}),
            false
        )
        .is_err());
    }
}
