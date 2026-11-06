//! Optional, on-demand MP3 delivery. GoldSrc itself owns playback.
use serde::Deserialize;
use sha2::{Digest, Sha256};
use std::{
    fs,
    io::Read,
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
    thread,
    time::{Duration, Instant},
};

const LIMIT: u64 = 24 * 1024 * 1024;
// One PCM16 zero sample replaces the music channel without affecting game effects.
const SILENCE: &[u8] = b"RIFF&\0\0\0WAVEfmt \x10\0\0\0\x01\0\x01\0\x22\x56\0\0\x44\xac\0\0\x02\0\x10\0data\x02\0\0\0\0\0";
fn silence_asset() -> Asset {
    let sha256 = format!("{:x}", Sha256::digest(SILENCE));
    Asset { path: format!("sound/16competitive/music/{}/audio.wav", &sha256[..32]), sha256 }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Manifest {
    #[serde(default)]
    music_assets: Vec<Asset>,
}
#[derive(Deserialize)]
struct Asset {
    path: String,
    sha256: String,
}
fn valid(asset: &Asset) -> bool {
    let Some(hash) = asset
        .path
        .strip_prefix("sound/16competitive/music/")
        .and_then(|s| s.strip_suffix("/audio.mp3").or_else(|| s.strip_suffix("/audio.wav")))
    else {
        return false;
    };
    hash.len() == 32
        && asset.sha256.len() == 64
        && asset.sha256.starts_with(hash)
        && asset
            .sha256
            .bytes()
            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
}
fn verified(path: &Path, asset: &Asset) -> bool {
    let Ok(meta) = fs::symlink_metadata(path) else {
        return false;
    };
    if !meta.is_file() || meta.file_type().is_symlink() || !(16..=LIMIT).contains(&meta.len()) {
        return false;
    }
    fs::read(path).is_ok_and(|bytes| format!("{:x}", Sha256::digest(&bytes)) == asset.sha256)
}
fn fetch(
    agent: &ureq::Agent,
    url: &str,
    token: &str,
    max: u64,
    stop: &AtomicBool,
    manifest: bool,
) -> Result<Vec<u8>, String> {
    let mut request = agent
        .get(url)
        .set("Authorization", &format!("Bearer {token}"));
    if manifest {
        request = request.set("X-16C-Local-Music", "v1");
    }
    let reply = request.call().map_err(|_| "Music service unavailable")?;
    if reply
        .header("content-length")
        .and_then(|s| s.parse::<u64>().ok())
        .is_some_and(|n| n > max)
    {
        return Err("Music size limit exceeded".into());
    }
    let mut reader = reply.into_reader().take(max + 1);
    let mut bytes = Vec::new();
    let mut chunk = [0u8; 32768];
    loop {
        if stop.load(Ordering::Relaxed) {
            return Err("Music download stopped".into());
        }
        let n = reader
            .read(&mut chunk)
            .map_err(|_| "Music download interrupted")?;
        if n == 0 {
            break;
        }
        bytes.extend_from_slice(&chunk[..n]);
        if bytes.len() as u64 > max {
            return Err("Music size limit exceeded".into());
        }
    }
    Ok(bytes)
}
fn sync(
    root: &Path,
    session: &Path,
    api: &str,
    token: &str,
    match_id: &str,
    agent: &ureq::Agent,
    stop: &AtomicBool,
) -> Result<(), String> {
    let url = format!("{api}/matches/{match_id}/assets");
    let bytes = fetch(agent, &url, token, 1024 * 1024, stop, true)?;
    let manifest: Manifest =
        serde_json::from_slice(&bytes).map_err(|_| "Invalid music manifest")?;
    if manifest.music_assets.len() > 4096 || manifest.music_assets.iter().any(|asset| !valid(asset))
    {
        return Err("Invalid music manifest".into());
    }
    let silence = silence_asset();
    crate::native_session::owned_write(&crate::assets::game_destination(root, &silence.path)?, SILENCE)?;
    let mut ready = format!("#16c-music-v1\n{}\n{}\t{:x}\n", root.display(), silence.path, Sha256::digest(SILENCE));
    crate::native_session::owned_write(&session.join("music-assets.tsv"), ready.as_bytes())?;
    for asset in manifest.music_assets {
        if stop.load(Ordering::Relaxed) {
            return Ok(());
        }
        let destination = crate::assets::game_destination(root, &asset.path)?;
        if !verified(&destination, &asset) {
            let mut url = url::Url::parse(&format!("{api}/matches/{match_id}/assets/file"))
                .map_err(|_| "Invalid music API")?;
            url.query_pairs_mut().append_pair("path", &asset.path);
            let downloaded = fetch(agent, url.as_str(), token, LIMIT, stop, false);
            if let Ok(bytes) = downloaded {
                if bytes.len() >= 16 && format!("{:x}", Sha256::digest(&bytes)) == asset.sha256 {
                    crate::native_session::owned_write(&destination, &bytes)?;
                }
            }
        }
        if verified(&destination, &asset) {
            ready.push_str(&format!("{}\t{}\n", asset.path, asset.sha256));
            // Publish each completed file, so one slow download cannot hide ready audio.
            crate::native_session::owned_write(
                &session.join("music-assets.tsv"),
                ready.as_bytes(),
            )?;
        }
    }
    crate::native_session::owned_write(&session.join("music-assets.tsv"), ready.as_bytes())
}

pub fn start(
    root: PathBuf,
    session: PathBuf,
    api: String,
    token: String,
    match_id: String,
    stop: Arc<AtomicBool>,
) -> thread::JoinHandle<()> {
    thread::spawn(move || {
        // Slow optional audio never blocks game launch, HUD feeds, or session shutdown.
        let agent = ureq::AgentBuilder::new()
            .redirects(0)
            .timeout(Duration::from_secs(5))
            .build();
        let deadline = Instant::now() + Duration::from_secs(2 * 60 * 60);
        while !stop.load(Ordering::Relaxed) && Instant::now() < deadline {
            if sync(&root, &session, &api, &token, &match_id, &agent, &stop).is_err() {
                eprintln!("[Music] optional audio unavailable; missing cues remain silent");
            }
            for _ in 0..100 {
                if stop.load(Ordering::Relaxed) {
                    break;
                }
                thread::sleep(Duration::from_millis(100));
            }
        }
        let _ = fs::remove_file(session.join("music-assets.tsv"));
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn generated_stop_cue_is_a_valid_content_addressed_music_asset() {
        let asset = silence_asset();
        assert!(valid(&asset));
        assert_eq!(asset.path, "sound/16competitive/music/bf3e2006c07d1c47471e4d45e61cb30d/audio.wav");
        assert_eq!(asset.sha256, format!("{:x}", Sha256::digest(SILENCE)));
        assert_eq!(SILENCE.len(), 46);
    }
    #[test]
    fn rejects_path_injection_and_hash_mismatch() {
        let hash = "a".repeat(64);
        let mut asset = Asset {
            path: format!("sound/16competitive/music/{}/audio.mp3", &hash[..32]),
            sha256: hash,
        };
        assert!(valid(&asset));
        asset.sha256 = "b".repeat(64);
        assert!(!valid(&asset));
        for path in [
            "../config.cfg",
            "sound/16competitive/music/../audio.mp3",
            "sound/x.mp3;quit",
        ] {
            asset.path = path.into();
            assert!(!valid(&asset));
        }
    }
}
