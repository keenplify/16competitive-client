//! Process supervision only. Detection and observation uploads stay in the
//! separately signed private inspector. No Electron runtime or shell is used.
use crate::native_bundle::{ApprovalError, NativeBundle};
use serde_json::{json, Value};
use std::{
    io::{BufRead, BufReader, Read, Write},
    path::Path,
    process::{Child, Command, Stdio},
    sync::mpsc::{self, Receiver, SyncSender, TryRecvError},
    thread::{self, JoinHandle},
    time::{Duration, Instant},
};

const MAX_INPUT: usize = 16384;
const MAX_OUTPUT: u64 = 8192;
const START_TIMEOUT: Duration = Duration::from_secs(10);
const HEARTBEAT_TIMEOUT: Duration = Duration::from_secs(30);
const CONTROL_TIMEOUT: Duration = Duration::from_secs(2);

fn api_origin(api: &str) -> Result<(), String> {
    if competitive16_web_helper::allowed_api_origin(api, cfg!(debug_assertions)).as_deref()
        != Some(api)
    {
        return Err("Invalid inspector API origin".into());
    }
    Ok(())
}

fn read_message(reader: &mut impl BufRead) -> Result<Option<Value>, String> {
    let mut bytes = Vec::new();
    reader
        .take(MAX_OUTPUT + 1)
        .read_until(b'\n', &mut bytes)
        .map_err(|_| "Inspector output is unavailable")?;
    if bytes.is_empty() {
        return Ok(None);
    }
    if bytes.len() as u64 > MAX_OUTPUT || !bytes.ends_with(b"\n") {
        return Err("Invalid inspector protocol".into());
    }
    serde_json::from_slice(&bytes)
        .map(Some)
        .map_err(|_| "Invalid inspector protocol".into())
}

struct Input {
    bytes: Vec<u8>,
    acknowledgment: SyncSender<Result<(), ()>>,
}

struct Process {
    child: Child,
    input: Option<SyncSender<Input>>,
    output: Option<Receiver<Result<Value, String>>>,
    workers: Vec<JoinHandle<()>>,
    terminated: bool,
}

impl Process {
    fn spawn(binary: &Path, mode: &str) -> Result<Self, String> {
        let mut command = Command::new(binary);
        command
            .arg(mode)
            .env_clear()
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null());
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            command.creation_flags(0x08000000); // CREATE_NO_WINDOW
            for name in ["SystemRoot", "WINDIR"] {
                if let Some(value) = std::env::var_os(name) {
                    command.env(name, value);
                }
            }
        }
        #[cfg(not(windows))]
        command.env("LANG", "C");
        #[cfg(unix)]
        {
            use std::os::unix::process::CommandExt;
            command.process_group(0);
        }
        let mut child = command.spawn().map_err(|error| format!("Inspector could not start: {error}"))?;
        let mut stdin = child.stdin.take().expect("piped inspector input");
        let stdout = child.stdout.take().expect("piped inspector output");
        let (input, messages) = mpsc::sync_channel::<Input>(4);
        let writer = thread::spawn(move || {
            while let Ok(mut message) = messages.recv() {
                let result = stdin
                    .write_all(&message.bytes)
                    .and_then(|_| stdin.flush())
                    .map_err(|_| ());
                message.bytes.fill(0);
                let failed = result.is_err();
                let _ = message.acknowledgment.send(result);
                if failed {
                    break;
                }
            }
        });
        let (events, output) = mpsc::sync_channel(32);
        let reader = thread::spawn(move || {
            let mut reader = BufReader::new(stdout);
            loop {
                let message = match read_message(&mut reader) {
                    Ok(Some(value)) => Ok(value),
                    Ok(None) => break,
                    Err(error) => Err(error),
                };
                let failed = message.is_err();
                if events.send(message).is_err() || failed {
                    break;
                }
            }
        });
        Ok(Self {
            child,
            input: Some(input),
            output: Some(output),
            workers: vec![writer, reader],
            terminated: false,
        })
    }

    fn send(&self, value: Value) -> Result<(), String> {
        let mut bytes = serde_json::to_vec(&value).map_err(|_| "Invalid inspector request")?;
        bytes.push(b'\n');
        if bytes.len() > MAX_INPUT {
            bytes.fill(0);
            return Err("Inspector request exceeds protocol limit".into());
        }
        let (acknowledgment, result) = mpsc::sync_channel(1);
        self.input
            .as_ref()
            .ok_or("Inspector control channel is closed")?
            .try_send(Input {
                bytes,
                acknowledgment,
            })
            .map_err(|_| "Inspector control channel is unavailable")?;
        result
            .recv_timeout(CONTROL_TIMEOUT)
            .map_err(|_| "Inspector control channel timed out")?
            .map_err(|_| "Inspector control channel is unavailable".into())
    }

    fn receive(&self, timeout: Duration) -> Result<Value, String> {
        self.output
            .as_ref()
            .ok_or("Inspector output is closed")?
            .recv_timeout(timeout)
            .map_err(|_| "Inspector did not respond")?
    }

    fn finish(&mut self, timeout: Duration) -> Result<(), String> {
        self.input.take();
        let deadline = Instant::now() + timeout;
        loop {
            if let Some(status) = self
                .child
                .try_wait()
                .map_err(|_| "Inspector exit is unavailable")?
            {
                return if status.success() {
                    Ok(())
                } else {
                    Err("Inspector exited unsuccessfully".into())
                };
            }
            if Instant::now() >= deadline {
                return Err("Inspector shutdown timed out".into());
            }
            thread::sleep(Duration::from_millis(10));
        }
    }

    fn terminate(&mut self) {
        if self.terminated {
            return;
        }
        self.terminated = true;
        self.input.take();
        self.output.take();
        #[cfg(unix)]
        {
            // The inspector's private group contains only its observation
            // utilities, never the game or a replacement standalone process.
            unsafe {
                libc::kill(-(self.child.id() as i32), libc::SIGKILL);
            }
        }
        let _ = self.child.kill();
        let _ = self.child.wait();
        for worker in self.workers.drain(..) {
            let _ = worker.join();
        }
    }
}

impl Drop for Process {
    fn drop(&mut self) {
        self.terminate();
    }
}

/// Strip unknown fields: raw hardware identifiers must never cross this boundary.
fn device_status(value: Value) -> Result<Value, String> {
    if value["banned"] == false {
        return Ok(json!({"banned": false}));
    }
    if value["banned"] != true
        || !value["permanent"].is_boolean()
        || !value["offenseCount"]
            .as_u64()
            .is_some_and(|count| count >= 1)
        || !(value["expiresAt"].is_null()
            || value["expiresAt"].as_str().is_some_and(|s| s.len() <= 2000))
        || ["displayUntil", "reason", "appealEmail"]
            .iter()
            .any(|key| !value[key].as_str().is_some_and(|s| s.len() <= 2000))
    {
        return Err("Invalid device status".into());
    }
    Ok(
        json!({"banned":true,"permanent":value["permanent"],"offenseCount":value["offenseCount"],
        "expiresAt":value["expiresAt"],"displayUntil":value["displayUntil"],
        "reason":value["reason"],"appealEmail":value["appealEmail"]}),
    )
}

pub(crate) fn check_device(bundle: &NativeBundle, api: &str) -> Result<Value, String> {
    check_device_inner(bundle, api).map_err(|_| "Device authorization check failed".into())
}

fn check_device_inner(bundle: &NativeBundle, api: &str) -> Result<Value, String> {
    api_origin(api)?;
    bundle.verify_inspector()?;
    let mut process = Process::spawn(&bundle.inspector, "--device")?;
    process.send(json!({"apiUrl":api,"allowInsecureLocal":cfg!(debug_assertions)}))?;
    let status = device_status(process.receive(Duration::from_secs(20))?)?;
    process.finish(Duration::from_secs(2))?;
    Ok(status)
}

pub(crate) struct SessionOptions<'a> {
    pub api: &'a str,
    pub token: &'a str,
    pub match_id: &'a str,
    pub executable: &'a Path,
    pub runtime_executable: &'a Path,
    pub game_directory: &'a Path,
    pub steam: bool,
}

pub(crate) struct Session {
    process: Process,
    heartbeat: Instant,
    target: Option<u32>,
    discovering: bool,
    attached: bool,
    exited: bool,
    restart: Option<(NativeBundle, Value)>,
    restarts: u8,
    next_verification: Instant,
    approval_deadline: Option<Instant>,
}

impl Session {
    pub(crate) fn start(
        bundle: &NativeBundle,
        options: SessionOptions<'_>,
    ) -> Result<Self, String> {
        api_origin(options.api)?;
        if options.token.is_empty()
            || options.token.len() > 8192
            || !options.token.bytes().all(|b| b > 32 && b < 127)
            || uuid::Uuid::parse_str(options.match_id).is_err()
            || ![
                options.executable,
                options.runtime_executable,
                options.game_directory,
            ]
            .iter()
            .all(|p| p.is_absolute())
        {
            return Err("Invalid inspector session".into());
        }
        bundle.verify_inspector()?;
        let process = Process::spawn(&bundle.inspector, "--session")?;
        let request = json!({"command":"start","apiUrl":options.api,"token":options.token,
            "allowInsecureLocal":cfg!(debug_assertions),"matchId":options.match_id,
            "executablePath":options.executable,"runtimeExecutablePath":options.runtime_executable,
            "gameDirectory":options.game_directory,"distribution":if options.steam {"steam"} else {"standalone"}});
        process.send(request.clone())?;
        let mut session = Self::await_ready(process, START_TIMEOUT)?;
        session.restart = Some((bundle.clone(), request));
        Ok(session)
    }

    fn await_ready(process: Process, timeout: Duration) -> Result<Self, String> {
        let ready = process.receive(timeout)?;
        if ready["event"] != "ready" || ready["protocol"] != 2 {
            return Err("Unsupported inspector protocol".into());
        }
        Ok(Self {
            process,
            heartbeat: Instant::now(),
            target: None,
            discovering: false,
            attached: false,
            exited: false,
            restart: None,
            restarts: 0,
            next_verification: Instant::now() + Duration::from_secs(60),
            approval_deadline: None,
        })
    }

    pub(crate) fn attach(&mut self, pid: u32) -> Result<(), String> {
        if pid == 0 || pid > i32::MAX as u32 {
            return Err("Invalid game process".into());
        }
        self.process.send(json!({"command":"attach","pid":pid}))?;
        self.target = Some(pid);
        self.attached = false;
        self.exited = false;
        self.discovering = false;
        Ok(())
    }

    /// Readiness requires acknowledgement for this exact PID, not merely a
    /// successful write to the scanner pipe. A fixed deadline also bounds a
    /// scanner that emits heartbeats without ever attaching.
    pub(crate) fn await_attachment(&mut self, timeout: Duration) -> Result<(), String> {
        let deadline = Instant::now() + timeout;
        loop {
            if self.poll()? {
                return Err("Managed game exited before inspector attachment".into());
            }
            if self.attached {
                return Ok(());
            }
            if Instant::now() >= deadline {
                return Err("Inspector game attachment timed out".into());
            }
            std::thread::sleep(Duration::from_millis(10));
        }
    }

    #[cfg(windows)]
    pub(crate) fn discover(&mut self) -> Result<(), String> {
        self.process.send(json!({"command":"discover"}))?;
        self.discovering = true;
        Ok(())
    }

    fn event(&mut self, value: Value) -> Result<(), String> {
        match value["event"].as_str() {
            Some("heartbeat") => self.heartbeat = Instant::now(),
            Some("report") if value["accepted"].is_boolean() => {} // Unavailable upload is not a cheating verdict.
            Some("attached") | Some("process_exit") => {
                let pid = value["pid"]
                    .as_u64()
                    .filter(|pid| *pid > 0 && *pid <= i32::MAX as u64)
                    .ok_or("Invalid inspector process event")? as u32;
                if value["event"] == "attached" && (self.discovering || self.target == Some(pid)) {
                    self.target = Some(pid);
                    self.attached = true;
                    self.discovering = false;
                } else if value["event"] == "process_exit" && self.target == Some(pid) {
                    self.attached = false;
                    self.exited = true;
                    self.target = None;
                }
            }
            _ => return Err("Invalid inspector event".into()),
        }
        Ok(())
    }

    /// Returns true only when the scanner confirms the owned game process exited.
    fn poll_once(&mut self) -> Result<bool, String> {
        for _ in 0..64 {
            match self
                .process
                .output
                .as_ref()
                .ok_or("Inspector output is closed")?
                .try_recv()
            {
                Ok(value) => self.event(value?)?,
                Err(TryRecvError::Empty) => break,
                Err(TryRecvError::Disconnected) => {
                    return Err("Inspector stopped unexpectedly".into())
                }
            }
        }
        if self.heartbeat.elapsed() > HEARTBEAT_TIMEOUT {
            return Err("Inspector heartbeat timed out".into());
        }
        if self
            .process
            .child
            .try_wait()
            .map_err(|_| "Inspector process is unavailable")?
            .is_some()
        {
            return Err("Inspector stopped unexpectedly".into());
        }
        Ok(self.exited)
    }

    pub(crate) fn poll(&mut self) -> Result<bool, String> {
        // Tampering/rejection must never enter the availability grace period.
        if Instant::now() >= self.next_verification {
            if let Some((bundle, _)) = &self.restart {
                bundle.verify_inspector()?;
                let now = Instant::now();
                if self
                    .approval_deadline
                    .is_some_and(|deadline| now >= deadline)
                {
                    return Err("Native release approval remained unavailable".into());
                }
                match bundle.verify_approval() {
                    Ok(()) => {
                        self.approval_deadline = None;
                        self.next_verification = Instant::now() + Duration::from_secs(60);
                    }
                    Err(ApprovalError::Unavailable) => {
                        self.approval_deadline
                            .get_or_insert(now + Duration::from_secs(60));
                        self.next_verification = Instant::now() + Duration::from_secs(2);
                    }
                    Err(error) => return Err(error.to_string()),
                }
            }
        }
        match self.poll_once() {
            Ok(exited) => Ok(exited),
            Err(error) => {
                let Some((bundle, request)) = &self.restart else {
                    return Err(error);
                };
                if self.restarts >= 1 {
                    return Err("Inspector recovery exhausted".into());
                }
                self.restarts += 1;
                self.process.terminate();
                bundle.verify_inspector()?;
                bundle
                    .verify_approval()
                    .map_err(|error| error.to_string())?;
                let process = Process::spawn(&bundle.inspector, "--session")?;
                process.send(request.clone())?;
                let replacement = Self::await_ready(process, START_TIMEOUT)?;
                self.process = replacement.process;
                self.heartbeat = Instant::now();
                self.next_verification = Instant::now() + Duration::from_secs(60);
                self.approval_deadline = None;
                if let Some(pid) = self.target {
                    self.attach(pid)?;
                }
                #[cfg(windows)]
                if self.discovering {
                    self.discover()?;
                }
                Ok(false)
            }
        }
    }

    pub(crate) fn stop(mut self) -> Result<(), String> {
        self.process
            .send(json!({"command":"stop","reason":"session-ended"}))?;
        self.process.finish(Duration::from_secs(6))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bounded_protocol_rejects_truncation_and_oversized_records() {
        assert!(read_message(&mut &b"{\"event\":\"heartbeat\"}\n"[..])
            .unwrap()
            .is_some());
        assert!(read_message(&mut &b""[..]).unwrap().is_none());
        for bytes in [vec![b'x'; 8193], b"{}".to_vec(), b"not-json\n".to_vec()] {
            assert!(read_message(&mut &bytes[..]).is_err());
        }
    }

    #[test]
    fn device_status_drops_identifiers_and_rejects_incomplete_bans() {
        assert_eq!(
            device_status(json!({"banned":false,"hardwareSignals":["private"]})).unwrap(),
            json!({"banned":false})
        );
        assert!(device_status(json!({"banned":true})).is_err());
        assert!(device_status(json!({"banned":"false"})).is_err());
        assert!(api_origin("https://evil.test").is_err());
    }

    #[cfg(unix)]
    fn fixture(script: &str) -> (std::path::PathBuf, Process) {
        use std::os::unix::fs::PermissionsExt;
        let directory =
            std::env::temp_dir().join(format!("16c-inspector-test-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir(&directory).unwrap();
        let binary = directory.join("inspector");
        std::fs::write(&binary, format!("#!/bin/sh\n{script}")).unwrap();
        std::fs::set_permissions(&binary, std::fs::Permissions::from_mode(0o700)).unwrap();
        // Parallel tests can briefly retain a freshly written executable through
        // fork on Linux. Retry only ETXTBSY; protocol/startup failures still fail.
        let mut attempts = 0;
        let process = loop {
            match Process::spawn(&binary, "--session") {
                Ok(process) => break process,
                Err(error) if error.contains("Text file busy (os error 26)") && attempts < 20 => {
                    attempts += 1;
                    thread::sleep(Duration::from_millis(10));
                }
                Err(error) => panic!("Inspector fixture failed: {error}"),
            }
        };
        (directory, process)
    }

    #[test]
    #[cfg(unix)]
    fn process_protocol_runs_without_electron_and_does_not_inherit_environment() {
        let (directory, process) = fixture("test -z \"$HOME\" || exit 1\nread -r start\nprintf '%s\\n' '{\"event\":\"ready\",\"protocol\":2}'\nwhile read -r command; do\ncase \"$command\" in\n*attach*) printf '%s\\n' '{\"event\":\"attached\",\"pid\":42}' '{\"event\":\"heartbeat\"}' ;;\n*stop*) exit 0 ;;\nesac\ndone\n");
        process
            .send(json!({"command":"start","token":"test-token"}))
            .unwrap();
        let mut session = Session::await_ready(process, Duration::from_secs(2)).unwrap();
        session.attach(42).unwrap();
        session.await_attachment(Duration::from_secs(2)).unwrap();
        assert!(session.attach(0).is_err());
        session
            .event(json!({"event":"process_exit","pid":43}))
            .unwrap();
        assert!(!session.exited);
        session
            .event(json!({"event":"process_exit","pid":42}))
            .unwrap();
        assert!(session.exited);
        session.stop().unwrap();
        std::fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    #[cfg(unix)]
    fn startup_timeout_and_invalid_protocol_terminate_owned_processes() {
        for script in [
            "read -r line\nread -r line\n",
            "printf '%s\\n' '{\"event\":\"ready\",\"protocol\":1}'\nread -r line\n",
        ] {
            let (directory, process) = fixture(script);
            assert!(Session::await_ready(process, Duration::from_millis(100)).is_err());
            std::fs::remove_dir_all(directory).unwrap();
        }
    }

    #[test]
    #[cfg(unix)]
    fn missing_heartbeat_and_malformed_events_fail_closed() {
        let (directory, process) = fixture("printf '%s\\n' '{\"event\":\"ready\",\"protocol\":2}'\nwhile read -r line; do :; done\n");
        let mut session = Session::await_ready(process, Duration::from_secs(2)).unwrap();
        assert!(!session.poll().unwrap());
        assert!(session.event(json!({"event":"attached","pid":-1})).is_err());
        assert!(session
            .event(json!({"event":"report","accepted":"false"}))
            .is_err());
        assert!(session
            .event(json!({"event":"report","accepted":false}))
            .is_ok());
        session.heartbeat = Instant::now() - Duration::from_secs(31);
        assert_eq!(session.poll().unwrap_err(), "Inspector heartbeat timed out");
        drop(session);
        std::fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    #[cfg(unix)]
    fn attachment_requires_matching_acknowledgement() {
        for event in [
            r#"{"event":"heartbeat"}"#,
            r#"{"event":"attached","pid":43}"#,
            r#"{"event":"process_exit","pid":42}"#,
        ] {
            let script = format!("printf '%s\\n' '{{\"event\":\"ready\",\"protocol\":2}}'\nread -r line\nprintf '%s\\n' '{event}'\nwhile read -r line; do :; done\n");
            let (directory, process) = fixture(&script);
            let mut session = Session::await_ready(process, Duration::from_secs(2)).unwrap();
            session.attach(42).unwrap();
            assert!(session
                .await_attachment(Duration::from_millis(100))
                .is_err());
            drop(session);
            std::fs::remove_dir_all(directory).unwrap();
        }
    }

    #[test]
    #[cfg(unix)]
    fn scanner_channel_failure_is_detected_without_waiting_for_heartbeat() {
        let (directory, process) =
            fixture("printf '%s\\n' '{\"event\":\"ready\",\"protocol\":2}'\nexit 0\n");
        let mut session = Session::await_ready(process, Duration::from_secs(2)).unwrap();
        session.process.child.wait().unwrap();
        assert!(session.poll().is_err());
        drop(session);
        std::fs::remove_dir_all(directory).unwrap();
    }
}
