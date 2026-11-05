//! Server-owned session lifetime, independent of a launcher window or renderer.
use std::time::Duration;

/// A web handoff creates a separate helper login. Revoke only that token after
/// cleanup (including failed launches); the desktop/browser login remains valid.
pub(crate) struct HelperToken {
    api: String,
    token: String,
}

impl HelperToken {
    pub(crate) fn new(api: &str, token: String) -> Result<Self, String> {
        if competitive16_web_helper::allowed_api_origin(api, cfg!(debug_assertions)).as_deref()
            != Some(api)
            || token.is_empty()
            || token.len() > 2048
            || !token.bytes().all(|byte| byte > 32 && byte < 127)
        {
            return Err("Invalid helper authentication response".into());
        }
        Ok(Self {
            api: api.to_owned(),
            token,
        })
    }
}

impl std::ops::Deref for HelperToken {
    type Target = str;
    fn deref(&self) -> &str {
        &self.token
    }
}

impl Drop for HelperToken {
    fn drop(&mut self) {
        let agent = ureq::AgentBuilder::new()
            .redirects(0)
            .timeout(Duration::from_secs(3))
            .build();
        if agent
            .post(&format!("{}/auth/logout", self.api))
            .set("Authorization", &format!("Bearer {}", self.token))
            .call()
            .is_err()
        {
            // Fixed diagnostic only; never include credentials or response bodies.
            eprintln!("Helper session revocation unavailable; server expiry still applies");
        }
    }
}

#[derive(Debug, PartialEq, Eq)]
pub(crate) enum Authorization {
    Active,
    Revoked,
    Unavailable,
}

fn classify(status: u16) -> Authorization {
    match status {
        200 => Authorization::Active,
        401 | 403 | 404 | 409 | 410 => Authorization::Revoked,
        _ => Authorization::Unavailable,
    }
}

pub(crate) fn check(api: &str, token: &str, match_id: &str) -> Authorization {
    let agent = ureq::AgentBuilder::new()
        .redirects(0)
        .timeout(Duration::from_secs(5))
        .build();
    match agent
        .get(&format!(
            "{api}/matchmaking/matches/{match_id}/helper-connection"
        ))
        .set("Authorization", &format!("Bearer {token}"))
        .call()
    {
        Ok(response) | Err(ureq::Error::Status(_, response)) => classify(response.status()),
        Err(_) => Authorization::Unavailable,
    }
}

/// Call only after the owned game has stopped and all restoration has succeeded.
pub(crate) fn finish_session(result: Result<(), String>) -> Result<(), String> {
    match result {
        Err(error) if error == "Managed game authorization ended" => {
            eprintln!("Managed game session ended; cleanup complete");
            Ok(())
        }
        other => other,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{
        io::{Read, Write},
        net::TcpListener,
        thread,
    };

    #[test]
    fn completed_authorization_is_quiet_but_real_failures_remain_errors() {
        assert_eq!(finish_session(Err("Managed game authorization ended".into())), Ok(()));
        for reason in ["Managed game session expired", "Inspector lost the managed game process", "DLL restoration failed"] {
            assert_eq!(finish_session(Err(reason.into())), Err(reason.into()));
        }
    }

    #[test]
    fn only_explicit_denial_revokes_session() {
        assert_eq!(classify(200), Authorization::Active);
        for status in [401, 403, 404, 409, 410] {
            assert_eq!(classify(status), Authorization::Revoked);
        }
        for status in [301, 302, 400, 429, 500, 502, 503] {
            assert_eq!(classify(status), Authorization::Unavailable);
        }
    }

    #[test]
    fn helper_token_revokes_only_its_own_session_when_scope_ends() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        let server = thread::spawn(move || {
            let (mut socket, _) = listener.accept().unwrap();
            socket
                .set_read_timeout(Some(Duration::from_secs(2)))
                .unwrap();
            let mut bytes = [0; 4096];
            let count = socket.read(&mut bytes).unwrap();
            let request = String::from_utf8_lossy(&bytes[..count]).to_lowercase();
            assert!(request.starts_with("post /auth/logout "));
            assert!(request.contains("authorization: bearer dedicated-helper-token"));
            socket
                .write_all(b"HTTP/1.1 200 OK\r\nContent-Length: 0\r\nConnection: close\r\n\r\n")
                .unwrap();
        });
        {
            let token = HelperToken::new(
                &format!("http://{address}"),
                "dedicated-helper-token".into(),
            )
            .unwrap();
            assert_eq!(&*token, "dedicated-helper-token");
        }
        server.join().unwrap();
        assert!(HelperToken::new("https://evil.test", "token".into()).is_err());
        assert!(
            HelperToken::new("https://16competitive.papamo.dev", "token\ninjected".into()).is_err()
        );
    }

    #[test]
    fn sends_authentication_and_does_not_follow_redirects() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        let server = thread::spawn(move || {
            let (mut socket, _) = listener.accept().unwrap();
            socket
                .set_read_timeout(Some(Duration::from_secs(2)))
                .unwrap();
            let mut bytes = [0; 4096];
            let count = socket.read(&mut bytes).unwrap();
            let request = String::from_utf8_lossy(&bytes[..count]).to_lowercase();
            assert!(request.contains("/matchmaking/matches/test-match/helper-connection"));
            assert!(request.contains("authorization: bearer test-token"));
            socket.write_all(b"HTTP/1.1 302 Found\r\nLocation: http://127.0.0.1:1/forbidden\r\nContent-Length: 0\r\nConnection: close\r\n\r\n").unwrap();
        });
        assert_eq!(
            check(&format!("http://{address}"), "test-token", "test-match"),
            Authorization::Unavailable
        );
        server.join().unwrap();
    }
}
