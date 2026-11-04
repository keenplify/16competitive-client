use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{FromSample, SizedSample};
use std::{
    collections::{HashMap, VecDeque},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
};
use tokio::sync::mpsc;

pub const RATE: u32 = 48000;
pub const FRAME: usize = 960;
const MAX_BUFFER: usize = RATE as usize / 5;

#[derive(Default)]
pub struct Playback {
    pub generation: u64,
    pub samples: VecDeque<f32>,
    pub volume: f32,
    pub muted: bool,
}
pub type Mixer = Arc<Mutex<HashMap<String, Playback>>>;

pub struct Audio {
    _input: Option<cpal::Stream>,
    _output: cpal::Stream,
    pub transmitting: Arc<AtomicBool>,
    pub failed: Arc<AtomicBool>,
}

fn config(device: &cpal::Device, input: bool) -> Result<cpal::SupportedStreamConfig, String> {
    let formats: Vec<_> = if input {
        device
            .supported_input_configs()
            .map_err(|_| "audio-input-unavailable")?
            .collect()
    } else {
        device
            .supported_output_configs()
            .map_err(|_| "audio-output-unavailable")?
            .collect()
    };
    formats
        .into_iter()
        .filter(|c| {
            c.channels() > 0
                && c.channels() <= 8
                && c.min_sample_rate().0 <= RATE
                && c.max_sample_rate().0 >= RATE
                && matches!(
                    c.sample_format(),
                    cpal::SampleFormat::F32 | cpal::SampleFormat::I16 | cpal::SampleFormat::U16
                )
        })
        .min_by_key(|c| {
            (
                c.channels(),
                if c.sample_format() == cpal::SampleFormat::F32 {
                    0
                } else {
                    1
                },
            )
        })
        .map(|c| c.with_sample_rate(cpal::SampleRate(RATE)))
        .ok_or_else(|| "audio-format-unavailable".into())
}

fn input<T>(
    device: &cpal::Device,
    config: &cpal::StreamConfig,
    tx: mpsc::Sender<[f32; FRAME]>,
    active: Arc<AtomicBool>,
    failed: Arc<AtomicBool>,
) -> Result<cpal::Stream, String>
where
    T: SizedSample,
    f32: FromSample<T>,
{
    let channels = config.channels as usize;
    let mut frame = [0.0; FRAME];
    let mut offset = 0;
    device
        .build_input_stream(
            config,
            move |samples: &[T], _| {
                if !active.load(Ordering::Relaxed) {
                    offset = 0;
                    return;
                }
                for sample in samples.chunks_exact(channels) {
                    frame[offset] =
                        sample.iter().map(|s| s.to_sample::<f32>()).sum::<f32>() / channels as f32;
                    offset += 1;
                    if offset == FRAME {
                        // A slow network must not block the audio callback or build a backlog.
                        let _ = tx.try_send(frame);
                        offset = 0;
                    }
                }
            },
            move |_| {
                failed.store(true, Ordering::Relaxed);
            },
            None,
        )
        .map_err(|_| "audio-input-unavailable".into())
}

fn output<T>(
    device: &cpal::Device,
    config: &cpal::StreamConfig,
    mixer: Mixer,
    failed: Arc<AtomicBool>,
) -> Result<cpal::Stream, String>
where
    T: SizedSample + FromSample<f32>,
{
    let channels = config.channels as usize;
    device
        .build_output_stream(
            config,
            move |samples: &mut [T], _| {
                let Ok(mut peers) = mixer.try_lock() else {
                    samples.fill(T::from_sample(0.0));
                    return;
                };
                for frame in samples.chunks_exact_mut(channels) {
                    let mixed = peers
                        .values_mut()
                        .map(|peer| {
                            let value = peer.samples.pop_front().unwrap_or(0.0);
                            if peer.muted {
                                0.0
                            } else {
                                value * peer.volume
                            }
                        })
                        .sum::<f32>()
                        .clamp(-1.0, 1.0);
                    frame.fill(T::from_sample(mixed));
                }
            },
            move |_| {
                failed.store(true, Ordering::Relaxed);
            },
            None,
        )
        .map_err(|_| "audio-output-unavailable".into())
}

impl Audio {
    pub fn open(tx: mpsc::Sender<[f32; FRAME]>, mixer: Mixer) -> Result<Self, String> {
        let host = cpal::default_host();
        let mic = host.default_input_device();
        let speakers = host
            .default_output_device()
            .ok_or("audio-output-unavailable")?;

        let output_config = config(&speakers, false)?;
        let transmitting = Arc::new(AtomicBool::new(false));
        let failed = Arc::new(AtomicBool::new(false));
        // Playback remains available when no microphone is installed or permitted.
        let input = mic.and_then(|mic| {
            let input_config = config(&mic, true).ok()?;
            let stream = match input_config.sample_format() {
                cpal::SampleFormat::F32 => input::<f32>(
                    &mic,
                    &input_config.config(),
                    tx,
                    transmitting.clone(),
                    failed.clone(),
                ),
                cpal::SampleFormat::I16 => input::<i16>(
                    &mic,
                    &input_config.config(),
                    tx,
                    transmitting.clone(),
                    failed.clone(),
                ),
                cpal::SampleFormat::U16 => input::<u16>(
                    &mic,
                    &input_config.config(),
                    tx,
                    transmitting.clone(),
                    failed.clone(),
                ),
                _ => unreachable!(),
            }
            .ok()?;
            stream.play().ok()?;
            Some(stream)
        });
        let output = match output_config.sample_format() {
            cpal::SampleFormat::F32 => {
                output::<f32>(&speakers, &output_config.config(), mixer, failed.clone())
            }
            cpal::SampleFormat::I16 => {
                output::<i16>(&speakers, &output_config.config(), mixer, failed.clone())
            }
            cpal::SampleFormat::U16 => {
                output::<u16>(&speakers, &output_config.config(), mixer, failed.clone())
            }
            _ => unreachable!(),
        }?;
        output.play().map_err(|_| "audio-output-unavailable")?;
        Ok(Self {
            _input: input,
            _output: output,
            transmitting,
            failed,
        })
    }
}

pub fn enqueue(mixer: &Mixer, id: &str, generation: u64, samples: &[f32]) {
    if let Ok(mut peers) = mixer.lock() {
        if let Some(peer) = peers
            .get_mut(id)
            .filter(|peer| peer.generation == generation)
        {
            if peer.muted {
                peer.samples.clear();
                return;
            }
            for &sample in samples {
                if peer.samples.len() == MAX_BUFFER {
                    peer.samples.pop_front();
                }
                peer.samples.push_back(if sample.is_finite() {
                    sample.clamp(-1.0, 1.0)
                } else {
                    0.0
                });
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    #[ignore = "requires a real default audio device"]
    fn default_audio_device_opens_without_electron() {
        let (tx, _rx) = mpsc::channel(2);
        let mixer: Mixer = Arc::new(Mutex::new(HashMap::new()));
        let device = Audio::open(tx, mixer).expect("native audio device must open");
        // No microphone frames are transmitted and playback is silent.
        std::thread::sleep(std::time::Duration::from_millis(250));
        assert!(!device.failed.load(Ordering::Relaxed));
        drop(device);
    }

    #[test]
    fn playback_is_bounded_and_mute_drops_pending_audio() {
        let mixer: Mixer = Arc::new(Mutex::new(HashMap::from([(
            "peer".into(),
            Playback {
                volume: 1.0,
                ..Default::default()
            },
        )])));
        enqueue(&mixer, "stranger", 0, &[1.0]);
        enqueue(&mixer, "peer", 0, &vec![0.5; MAX_BUFFER + 100]);
        assert_eq!(mixer.lock().unwrap()["peer"].samples.len(), MAX_BUFFER);
        mixer.lock().unwrap().get_mut("peer").unwrap().muted = true;
        enqueue(&mixer, "peer", 0, &[1.0]);
        assert!(mixer.lock().unwrap()["peer"].samples.is_empty());
    }
}
