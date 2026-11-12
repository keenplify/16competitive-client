//! Consent-separated, bounded compatibility snapshots for the browser settings bridge.
use std::{collections::HashMap, fs, io::Read, path::Path, sync::Mutex, time::{Duration, Instant}};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
struct Snapshot { id: String, owner: String, expires: Instant, files: Value, bytes: HashMap<String, Vec<u8>>, total: usize }
static SNAPSHOT: Mutex<Option<Snapshot>> = Mutex::new(None);
const LIMIT: usize = 16 * 1024 * 1024;
fn owner(api: &str, token: &str) -> Result<String, String> {
    if competitive16_web_helper::allowed_api_origin(api, cfg!(debug_assertions)).as_deref() != Some(api)
        || token.is_empty() || token.len() > 4096 || !token.bytes().all(|b| b > 32 && b < 127) {
        return Err("COMPATIBILITY_AUTH_INVALID".into());
    }
    Ok(format!("{:x}", Sha256::digest(format!("{api}\n{token}"))))
}
fn read_file(root: &Path, relative: &str) -> Result<Option<Vec<u8>>, String> {
    let mut candidate = root.to_path_buf();
    for part in relative.split('/') {
        candidate.push(part);
        let meta = match fs::symlink_metadata(&candidate) {
            Ok(meta) => meta,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
            Err(_) => return Err("COMPATIBILITY_READ_FAILED".into()),
        };
        if meta.file_type().is_symlink() { return Err("COMPATIBILITY_LINK_REJECTED".into()); }
        #[cfg(windows)] {
            use std::os::windows::fs::MetadataExt;
            if meta.file_attributes() & 0x400 != 0 { return Err("COMPATIBILITY_LINK_REJECTED".into()); }
        }
    }
    let resolved = fs::canonicalize(&candidate).map_err(|_| "COMPATIBILITY_READ_FAILED")?;
    if !resolved.starts_with(root) { return Err("COMPATIBILITY_LINK_REJECTED".into()); }
    let file = fs::File::open(&resolved).map_err(|_| "COMPATIBILITY_READ_FAILED")?;
    let meta = file.metadata().map_err(|_| "COMPATIBILITY_READ_FAILED")?;
    if !meta.is_file() || meta.len() < 64 || meta.len() > LIMIT as u64 { return Ok(None); }
    let mut bytes = Vec::new();
    file.take(LIMIT as u64 + 1).read_to_end(&mut bytes).map_err(|_| "COMPATIBILITY_READ_FAILED")?;
    if bytes.len() != meta.len() as usize { return Err("COMPATIBILITY_FILE_CHANGED".into()); }
    Ok(Some(bytes))
}
fn capture(root: &Path, game: &str, owner: String) -> Result<Snapshot, String> {
    let root = fs::canonicalize(root).map_err(|_| "COMPATIBILITY_ROOT_UNAVAILABLE")?;
    let paths: &[&str] = if cfg!(windows) {
        if game == "cs13" { &["cstrike/cl_dlls/client.dll", "cstrk13/cl_dlls/client.dll", "client_original.dll", "hw.dll", "sw.dll", "vgui.dll", "filesystem_stdio.dll"] }
        else { &["cstrike/cl_dlls/client.dll", "client_original.dll", "hw.dll", "valve/cl_dlls/GameUI.dll", "cstrike/cl_dlls/GameUI.dll", "vgui2.dll", "steam.dll"] }
    } else if game == "cs13" { &["cstrike/cl_dlls/client.so", "cstrk13/cl_dlls/client.so", "hw.so", "sw.so"] }
    else { &["cstrike/cl_dlls/client.so", "hw.so", "valve/cl_dlls/GameUI.so", "vgui2.so"] };
    let mut files = Vec::new(); let mut captured = HashMap::new(); let mut total = 0;
    for path in paths {
        if let Some(bytes) = read_file(&root, path)? {
            total += bytes.len();
            if total > 64 * 1024 * 1024 { return Err("COMPATIBILITY_TOO_LARGE".into()); }
            let hash = format!("{:x}", Sha256::digest(&bytes));
            files.push(json!({"path":path,"sha256":hash,"size":bytes.len()}));
            captured.insert(hash, bytes);
        }
    }
    if files.is_empty() { return Err("COMPATIBILITY_FILES_UNAVAILABLE".into()); }
    Ok(Snapshot {id:uuid::Uuid::new_v4().to_string(),owner,expires:Instant::now()+Duration::from_secs(600),files:json!(files),bytes:captured,total})
}
pub fn prepare(api: &str, token: &str, game: &str) -> Result<Value,String> {
    let account = owner(api, token)?;
    if !matches!(game, "cs13" | "cs16") { return Err("COMPATIBILITY_GAME_INVALID".into()); }
    let mut slot = SNAPSHOT.lock().map_err(|_| "COMPATIBILITY_BUSY")?;
    *slot = None;
    let (root, _, _) = crate::managed_installations::choose(api, token, game)?;
    let snapshot = capture(&root, game, account)?;
    let preview = json!({"id":snapshot.id,"files":snapshot.files,"totalBytes":snapshot.total});
    let id = snapshot.id.clone();
    *slot = Some(snapshot);
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_secs(600));
        if let Ok(mut slot) = SNAPSHOT.lock() {
            if slot.as_ref().is_some_and(|s| s.id == id) { *slot = None; }
        }
    });
    Ok(preview)
}
pub fn upload(api: &str, token: &str, report: &str, id: &str) -> Result<Value,String> {
    let account = owner(api, token)?;
    uuid::Uuid::parse_str(report).map_err(|_| "COMPATIBILITY_REPORT_INVALID")?;
    let slot = SNAPSHOT.lock().map_err(|_| "COMPATIBILITY_BUSY")?;
    let snapshot = slot.as_ref().filter(|s| s.id==id && s.owner==account && s.expires>Instant::now()).ok_or("COMPATIBILITY_PREVIEW_EXPIRED")?;
    let agent = ureq::AgentBuilder::new().redirects(0).timeout(Duration::from_secs(120)).build();
    let base = format!("{api}/auth/issue-reports/{report}/compatibility");
    let auth = format!("Bearer {token}");
    let response: Value = agent.post(&base).set("Authorization",&auth).send_json(json!({"files":snapshot.files}))
        .map_err(|_| "COMPATIBILITY_UPLOAD_FAILED")?.into_json().map_err(|_| "COMPATIBILITY_UPLOAD_FAILED")?;
    let missing = response["missing"].as_array().filter(|v|v.len()<=7).ok_or("COMPATIBILITY_RESPONSE_INVALID")?;
    for hash in missing {
        let hash = hash.as_str().ok_or("COMPATIBILITY_RESPONSE_INVALID")?;
        let bytes = snapshot.bytes.get(hash).ok_or("COMPATIBILITY_RESPONSE_INVALID")?;
        let boundary = format!("16c-{}",uuid::Uuid::new_v4());
        let mut body = format!("--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"{hash}.bin\"\r\nContent-Type: application/octet-stream\r\n\r\n").into_bytes();
        body.extend_from_slice(bytes);
        body.extend_from_slice(format!("\r\n--{boundary}--\r\n").as_bytes());
        agent.post(&format!("{base}/{hash}")).set("Authorization",&auth)
            .set("Content-Type",&format!("multipart/form-data; boundary={boundary}"))
            .send_bytes(&body).map_err(|_| "COMPATIBILITY_UPLOAD_FAILED")?;
    }
    Ok(json!({"ok":true}))
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn snapshot_is_bounded_and_never_reads_unlisted_files() {
        let root=std::env::temp_dir().join(uuid::Uuid::new_v4().to_string());
        fs::create_dir_all(&root).unwrap();
        let name=if cfg!(windows) {"hw.dll"} else {"hw.so"};
        fs::write(root.join(name),vec![7;128]).unwrap();
        fs::write(root.join("private.txt"),b"secret").unwrap();
        let snapshot=capture(&root,"cs16","account".into()).unwrap();
        assert_eq!(snapshot.total,128);assert_eq!(snapshot.files.as_array().unwrap().len(),1);
        assert!(!snapshot.files.to_string().contains("private"));
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn upload_sends_only_the_consented_snapshot_and_rejects_another_session() {
        use std::{net::TcpListener, io::Write};
        let listener=TcpListener::bind("127.0.0.1:0").unwrap();
        let api=format!("http://{}",listener.local_addr().unwrap());
        let bytes=vec![7u8;128];let hash=format!("{:x}",Sha256::digest(&bytes));
        let files=json!([{"path":"hw.dll","size":128,"sha256":hash}]);
        let id=uuid::Uuid::new_v4().to_string();let report=uuid::Uuid::new_v4().to_string();
        *SNAPSHOT.lock().unwrap()=Some(Snapshot{id:id.clone(),owner:owner(&api,"session-a").unwrap(),expires:Instant::now()+Duration::from_secs(60),files,bytes:HashMap::from([(hash.clone(),bytes.clone())]),total:128});
        assert!(upload(&api,"session-b",&report,&id).is_err());
        let worker=std::thread::spawn(move||{
            for step in 0..2 {
                let(mut stream,_)=listener.accept().unwrap();stream.set_read_timeout(Some(Duration::from_secs(5))).unwrap();
                let mut data=Vec::new();let body;
                loop {let mut chunk=[0;4096];let n=stream.read(&mut chunk).unwrap();assert!(n>0);data.extend_from_slice(&chunk[..n]);
                    if let Some(end)=data.windows(4).position(|w|w==b"\r\n\r\n") {
                        let headers=String::from_utf8_lossy(&data[..end]).to_lowercase();
                        let len:usize=headers.lines().find_map(|l|l.strip_prefix("content-length: ")).unwrap().parse().unwrap();
                        if data.len()<end+4+len {continue;}
                        assert!(headers.contains("authorization: bearer session-a"));
                        if step==1 {assert!(headers.contains(&hash));assert!(headers.contains("multipart/form-data"));}
                        body=data[end+4..end+4+len].to_vec();break;
                    }
                }
                let response=if step==0 {let manifest:Value=serde_json::from_slice(&body).unwrap();assert_eq!(manifest["files"][0]["sha256"],hash);json!({"missing":[hash]}).to_string()} else {assert!(body.windows(bytes.len()).any(|w|w==bytes));"{}".into()};
                write!(stream,"HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",response.len(),response).unwrap();
            }
        });
        assert_eq!(upload(&api,"session-a",&report,&id).unwrap(),json!({"ok":true}));worker.join().unwrap();
        *SNAPSHOT.lock().unwrap()=None;
    }
    #[test]
    fn unauthenticated_upload_and_unknown_snapshot_fail_closed() {
        assert!(owner("https://evil.example","token").is_err());
        assert!(upload("https://16competitive.papamo.dev","token",&uuid::Uuid::new_v4().to_string(),"missing").is_err());
    }
}
