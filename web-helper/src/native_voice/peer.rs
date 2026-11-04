use super::audio::{self, Mixer};
use serde_json::Value;
use std::{sync::Arc, time::Duration};
use tokio::sync::mpsc;
use webrtc::{
    api::{
        interceptor_registry::register_default_interceptors,
        media_engine::{MediaEngine, MIME_TYPE_OPUS},
        APIBuilder,
    },
    ice_transport::ice_candidate::RTCIceCandidateInit,
    interceptor::registry::Registry,
    peer_connection::{
        configuration::RTCConfiguration, sdp::session_description::RTCSessionDescription,
        signaling_state::RTCSignalingState, RTCPeerConnection,
    },
    rtp_transceiver::rtp_codec::{RTCRtpCodecCapability, RTCRtpCodecParameters, RTPCodecType},
    track::track_local::{track_local_static_sample::TrackLocalStaticSample, TrackLocal},
};

pub struct Signal {
    pub peer: String,
    pub generation: u64,
    pub kind: &'static str,
    pub payload: Value,
}

#[cfg(test)]
mod tests {
    use super::super::audio::Playback;
    use super::*;
    use std::{collections::HashMap, sync::Mutex};

    #[tokio::test]
    async fn simultaneous_offers_recover() {
        let mixer: Mixer = Arc::new(Mutex::new(HashMap::new()));
        let (sender, _receiver) = mpsc::channel(128);
        let mut left = Peer::new(
            "b",
            "a",
            1,
            RTCConfiguration::default(),
            mixer.clone(),
            sender.clone(),
        )
        .await
        .unwrap();
        let mut right = Peer::new("a", "b", 1, RTCConfiguration::default(), mixer, sender)
            .await
            .unwrap();
        let left_offer = left.offer().await.unwrap();
        let right_offer = right.offer().await.unwrap();
        assert!(left
            .signal("offer", &right_offer.to_string())
            .await
            .unwrap()
            .is_none());
        let answer = right
            .signal("offer", &left_offer.to_string())
            .await
            .unwrap()
            .unwrap();
        left.signal("answer", &answer.to_string()).await.unwrap();
        left.connection.close().await.unwrap();
        right.connection.close().await.unwrap();
    }

    #[tokio::test]
    async fn peers_negotiate_encrypted_opus_without_browser_or_microphone() {
        tokio::time::timeout(Duration::from_secs(15), async {
            let left_mix: Mixer = Arc::new(Mutex::new(HashMap::new()));
            let right_mix: Mixer = Arc::new(Mutex::new(HashMap::from([("a".into(), Playback {
                generation: 1, volume: 1.0, ..Default::default()
            })])));
            let (left_tx, mut left_rx) = mpsc::channel(128);
            let (right_tx, mut right_rx) = mpsc::channel(128);
            let mut left = Peer::new("b", "a", 1, RTCConfiguration::default(), left_mix, left_tx).await.unwrap();
            let mut right = Peer::new("a", "b", 1, RTCConfiguration::default(), right_mix.clone(), right_tx).await.unwrap();
            let offer = left.offer().await.unwrap();
            let answer = right.signal("offer", &offer.to_string()).await.unwrap().unwrap();
            left.signal("answer", &answer.to_string()).await.unwrap();
            let mut encoder = opus::Encoder::new(audio::RATE, opus::Channels::Mono, opus::Application::Voip).unwrap();
            let samples: Vec<_> = (0..audio::FRAME).map(|i| (i as f32 * 0.05).sin() * 0.2).collect();
            let mut tick = tokio::time::interval(Duration::from_millis(20));
            loop {
                tokio::select! {
                    Some(signal) = left_rx.recv() => { right.signal(signal.kind, &signal.payload.to_string()).await.unwrap(); },
                    Some(signal) = right_rx.recv() => { left.signal(signal.kind, &signal.payload.to_string()).await.unwrap(); },
                    _ = tick.tick() => {
                        left.send(encoder.encode_vec_float(&samples, 1275).unwrap().into()).await;
                        if right_mix.lock().unwrap()["a"].samples.iter().any(|v| v.abs() > 0.01) { break; }
                    }
                }
            }
            left.connection.close().await.unwrap();
            right.connection.close().await.unwrap();
        }).await.expect("native WebRTC audio did not arrive");
    }
}

pub struct Peer {
    pub connection: Arc<RTCPeerConnection>,
    pub track: Arc<TrackLocalStaticSample>,
    pub generation: u64,
    pending: Vec<RTCIceCandidateInit>,
    ignore_offer: bool,
    polite: bool,
    id: String,
    self_id: String,
    config: RTCConfiguration,
    mixer: Mixer,
    outgoing: mpsc::Sender<Signal>,
}

impl Peer {
    pub async fn new(
        id: &str,
        self_id: &str,
        generation: u64,
        config: RTCConfiguration,
        mixer: Mixer,
        outgoing: mpsc::Sender<Signal>,
    ) -> Result<Self, String> {
        let mut media = MediaEngine::default();
        let capability = RTCRtpCodecCapability {
            mime_type: MIME_TYPE_OPUS.into(),
            clock_rate: 48000,
            channels: 2,
            sdp_fmtp_line: "minptime=10;useinbandfec=1".into(),
            ..Default::default()
        };
        media
            .register_codec(
                RTCRtpCodecParameters {
                    capability: capability.clone(),
                    payload_type: 111,
                    ..Default::default()
                },
                RTPCodecType::Audio,
            )
            .map_err(|_| "voice-codec-unavailable")?;
        let interceptors = register_default_interceptors(Registry::new(), &mut media)
            .map_err(|_| "voice-codec-unavailable")?;
        let api = APIBuilder::new()
            .with_media_engine(media)
            .with_interceptor_registry(interceptors)
            .build();
        let connection = Arc::new(
            api.new_peer_connection(config.clone())
                .await
                .map_err(|_| "voice-connection-unavailable")?,
        );
        let track = Arc::new(TrackLocalStaticSample::new(
            capability,
            "audio".into(),
            "16competitive".into(),
        ));
        let sender = connection
            .add_track(track.clone() as Arc<dyn TrackLocal + Send + Sync>)
            .await
            .map_err(|_| "voice-track-unavailable")?;
        tokio::spawn(async move {
            let mut buffer = [0u8; 1500];
            while sender.read(&mut buffer).await.is_ok() {}
        });
        let remote = id.to_owned();
        let signal_sender = outgoing.clone();
        connection.on_ice_candidate(Box::new(move |candidate| {
            let outgoing = signal_sender.clone();
            let remote = remote.clone();
            Box::pin(async move {
                if let Some(candidate) = candidate {
                    if let Ok(candidate) = candidate.to_json() {
                        if let Ok(payload) = serde_json::to_value(candidate) {
                            let _ = outgoing.try_send(Signal {
                                peer: remote,
                                generation,
                                kind: "ice",
                                payload,
                            });
                        }
                    }
                }
            })
        }));
        let remote = id.to_owned();
        let playback_mixer = mixer.clone();
        connection.on_track(Box::new(move |track, _, _| {
            let mixer = playback_mixer.clone();
            let remote = remote.clone();
            Box::pin(async move {
                if track.codec().capability.mime_type.to_ascii_lowercase() != MIME_TYPE_OPUS {
                    return;
                }
                tokio::spawn(async move {
                    let Ok(mut decoder) = opus::Decoder::new(audio::RATE, opus::Channels::Mono)
                    else {
                        return;
                    };
                    let mut pcm = [0.0f32; 5760];
                    let mut previous: Option<u16> = None;
                    while let Ok((packet, _)) = track.read_rtp().await {
                        if packet.payload.len() > 1275 {
                            continue;
                        }
                        let sequence = packet.header.sequence_number;
                        if let Some(last) = previous {
                            let distance = sequence.wrapping_sub(last);
                            if distance == 0 || distance > 32768 {
                                continue;
                            }
                            // Recover a single missing 20ms packet when Opus carries FEC.
                            if distance == 2 {
                                if let Ok(count) = decoder.decode_float(
                                    &packet.payload,
                                    &mut pcm[..audio::FRAME],
                                    true,
                                ) {
                                    audio::enqueue(&mixer, &remote, generation, &pcm[..count]);
                                }
                            }
                        }
                        previous = Some(sequence);
                        if let Ok(count) = decoder.decode_float(&packet.payload, &mut pcm, false) {
                            audio::enqueue(&mixer, &remote, generation, &pcm[..count]);
                        }
                    }
                });
            })
        }));
        Ok(Self {
            connection,
            track,
            generation,
            pending: Vec::new(),
            ignore_offer: false,
            polite: self_id > id,
            id: id.into(),
            self_id: self_id.into(),
            config,
            mixer,
            outgoing,
        })
    }

    pub async fn offer(&self) -> Result<Value, String> {
        let offer = self
            .connection
            .create_offer(None)
            .await
            .map_err(|_| "voice-offer-failed")?;
        self.connection
            .set_local_description(offer.clone())
            .await
            .map_err(|_| "voice-offer-failed")?;
        serde_json::to_value(offer).map_err(|_| "voice-offer-failed".into())
    }

    pub async fn signal(&mut self, kind: &str, payload: &str) -> Result<Option<Value>, String> {
        if payload.len() > 24000 {
            return Err("voice-signal-invalid".into());
        }
        if kind == "ice" {
            let candidate: RTCIceCandidateInit =
                serde_json::from_str(payload).map_err(|_| "voice-signal-invalid")?;
            if self.ignore_offer {
                return Ok(None);
            }
            if self.connection.remote_description().await.is_none() {
                if self.pending.len() >= 64 {
                    return Err("voice-signal-overflow".into());
                }
                self.pending.push(candidate);
            } else {
                self.connection
                    .add_ice_candidate(candidate)
                    .await
                    .map_err(|_| "voice-candidate-failed")?;
            }
            return Ok(None);
        }
        if kind != "offer" && kind != "answer" {
            return Err("voice-signal-invalid".into());
        }
        let value: Value = serde_json::from_str(payload).map_err(|_| "voice-signal-invalid")?;
        if value["type"] != kind {
            return Err("voice-signal-invalid".into());
        }
        let description: RTCSessionDescription =
            serde_json::from_value(value).map_err(|_| "voice-signal-invalid")?;
        if kind == "offer" && self.connection.signaling_state() != RTCSignalingState::Stable {
            if !self.polite {
                self.ignore_offer = true;
                return Ok(None);
            }
            // webrtc-rs does not implement SDP rollback. The polite side replaces
            // its provisional connection; generation checks discard old ICE/audio.
            let mut replacement = Self::new(
                &self.id,
                &self.self_id,
                self.generation + 1,
                self.config.clone(),
                self.mixer.clone(),
                self.outgoing.clone(),
            )
            .await?;
            replacement.pending = std::mem::take(&mut self.pending);
            let _ = tokio::time::timeout(Duration::from_secs(2), self.connection.close()).await;
            if let Ok(mut mixer) = self.mixer.lock() {
                if let Some(playback) = mixer.get_mut(&self.id) {
                    playback.generation = replacement.generation;
                    playback.samples.clear();
                }
            }
            *self = replacement;
        }
        self.connection
            .set_remote_description(description)
            .await
            .map_err(|_| "voice-negotiation-failed")?;
        self.ignore_offer = false;
        for candidate in self.pending.drain(..) {
            self.connection
                .add_ice_candidate(candidate)
                .await
                .map_err(|_| "voice-candidate-failed")?;
        }
        if kind == "answer" {
            return Ok(None);
        }
        let answer = self
            .connection
            .create_answer(None)
            .await
            .map_err(|_| "voice-answer-failed")?;
        self.connection
            .set_local_description(answer.clone())
            .await
            .map_err(|_| "voice-answer-failed")?;
        serde_json::to_value(answer)
            .map(Some)
            .map_err(|_| "voice-answer-failed".into())
    }

    pub async fn send(&self, packet: bytes::Bytes) {
        let _ = self
            .track
            .write_sample(&webrtc::media::Sample {
                data: packet,
                duration: Duration::from_millis(20),
                ..Default::default()
            })
            .await;
    }
}
