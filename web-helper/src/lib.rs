use serde::Deserialize;
use url::Url;

pub const SCHEME: &str = "competitive16-helper";

#[derive(Debug, PartialEq, Eq)]
pub struct LaunchLink {
    pub api_origin: String,
    pub match_id: String,
    pub handoff: String,
}

#[derive(Debug, PartialEq, Eq)]
pub struct CheckLink {
    pub api_origin: String,
    pub handoff: String,
}

pub fn allowed_api_origin(value: &str, development: bool) -> Option<String> {
    let url = Url::parse(value).ok()?;
    if !url.username().is_empty() || url.password().is_some() || url.path() != "/" ||
        url.query().is_some() || url.fragment().is_some() { return None; }
    let host = url.host_str()?;
    if development && url.scheme() == "http" && (host == "127.0.0.1" || host == "localhost") {
        return Some(url.origin().ascii_serialization());
    }
    if url.scheme() != "https" || url.port().is_some() ||
        (host != "16competitive.papamo.dev" &&
         !(host.ends_with(".16competitive.papamo.dev") &&
           host[..host.len() - ".16competitive.papamo.dev".len()].chars()
               .all(|ch| ch.is_ascii_lowercase() || ch.is_ascii_digit() || ch == '-'))) {
        return None;
    }
    Some(url.origin().ascii_serialization())
}

pub fn parse_launch_link(value: &str, development: bool) -> Option<LaunchLink> {
    let url = Url::parse(value).ok()?;
    if url.scheme() != SCHEME || url.host_str()? != "join" ||
        !url.username().is_empty() || url.password().is_some() || url.port().is_some() ||
        url.fragment().is_some() { return None; }
    let match_id = url.path().strip_prefix('/')?;
    if match_id.len() != 36 || !match_id.bytes().enumerate().all(|(i, ch)|
        if [8, 13, 18, 23].contains(&i) { ch == b'-' } else { ch.is_ascii_hexdigit() }) { return None; }
    let mut api = None;
    let mut handoff = None;
    for (key, value) in url.query_pairs() {
        match key.as_ref() {
            "api" if api.is_none() => api = Some(value.into_owned()),
            "handoff" if handoff.is_none() => handoff = Some(value.into_owned()),
            _ => return None,
        }
    }
    let api_origin = allowed_api_origin(&api?, development)?;
    let handoff = handoff?;
    if !(32..=128).contains(&handoff.len()) ||
        !handoff.bytes().all(|ch| ch.is_ascii_alphanumeric() || ch == b'_' || ch == b'-') { return None; }
    Some(LaunchLink { api_origin, match_id: match_id.to_owned(), handoff })
}

pub fn parse_check_link(value: &str, development: bool) -> Option<CheckLink> {
    let url = Url::parse(value).ok()?;
    if url.scheme() != SCHEME || url.host_str()? != "check-setup" ||
        url.path() != "" && url.path() != "/" ||
        !url.username().is_empty() || url.password().is_some() || url.port().is_some() ||
        url.fragment().is_some() { return None; }
    let mut api = None;
    let mut handoff = None;
    for (key, value) in url.query_pairs() {
        match key.as_ref() {
            "api" if api.is_none() => api = Some(value.into_owned()),
            "handoff" if handoff.is_none() => handoff = Some(value.into_owned()),
            _ => return None,
        }
    }
    let api_origin = allowed_api_origin(&api?, development)?;
    let handoff = handoff?;
    if !(32..=128).contains(&handoff.len()) ||
        !handoff.bytes().all(|ch| ch.is_ascii_alphanumeric() || ch == b'_' || ch == b'-') { return None; }
    Some(CheckLink { api_origin, handoff })
}

#[derive(Debug, Deserialize)]
pub struct SessionResponse { pub token: String }

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Connection {
    pub match_id: String,
    pub mode: String,
    pub host: String,
    pub port: u16,
    pub password: String,
    pub join_token: String,
    pub player_name: String,
}

impl Connection {
    pub fn validate(&self, expected_match_id: &str) -> Result<(), &'static str> {
        if self.match_id != expected_match_id || self.port == 0 ||
            !matches!(self.mode.as_str(), "cs13_3v3" | "5v5" | "3v3" | "unrated" | "legacy" | "legacy_3v3" | "ffa" | "arena") ||
            self.host.is_empty() || self.host.len() > 253 ||
            !self.host.bytes().all(|ch| ch.is_ascii_alphanumeric() || ch == b'.' || ch == b'-') ||
            self.password.len() > 128 ||
            !self.password.bytes().all(|ch| ch.is_ascii_alphanumeric() || ch == b'_' || ch == b'-') ||
            !(32..=64).contains(&self.join_token.len()) ||
            !self.join_token.bytes().all(|ch| ch.is_ascii_alphanumeric() || ch == b'_' || ch == b'-') {
            return Err("Invalid match connection from server");
        }
        if self.player_name.is_empty() || self.player_name.len() > 32 ||
            !self.player_name.bytes().all(|ch| ch.is_ascii_alphanumeric() || ch == b'_') {
            return Err("Invalid player name from server");
        }
        if self.mode == "cs13_3v3" &&
            (self.password.len() != 24 || !self.password.bytes().all(|ch| ch.is_ascii_hexdigit()) ||
             self.join_token.len() != 32) { return Err("Invalid CS 1.3 match connection"); }
        Ok(())
    }

    pub fn game(&self) -> &'static str { if self.mode == "cs13_3v3" { "cs13" } else { "cs16" } }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_one_time_link() {
        let link = format!("competitive16-helper://join/12345678-1234-4234-8234-123456789abc?api=https%3A%2F%2Feuw.16competitive.papamo.dev&handoff={}", "a".repeat(43));
        assert_eq!(allowed_api_origin("https://euw.16competitive.papamo.dev", false).as_deref(), Some("https://euw.16competitive.papamo.dev"));
        assert_eq!(parse_launch_link(&link, false).unwrap().api_origin, "https://euw.16competitive.papamo.dev");
    }

    #[test]
    fn rejects_bad_origins_and_extra_parameters() {
        let link = format!("competitive16-helper://join/12345678-1234-4234-8234-123456789abc?api=https%3A%2F%2Feuw.16competitive.papamo.dev.evil.test&handoff={}", "a".repeat(43));
        assert!(parse_launch_link(&link, false).is_none());
        assert!(parse_launch_link(&(link + "&password=secret"), false).is_none());
    }
}
