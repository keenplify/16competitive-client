use std::collections::BTreeMap;

fn arguments(bytes: &[u8]) -> Result<Vec<String>, String> {
    #[derive(serde::Deserialize)]
    struct Profile {
        cvars: BTreeMap<String, f64>,
    }
    let profile: Profile = serde_json::from_slice(bytes).map_err(|_| "INVALID_CVARS")?;
    let ranges: BTreeMap<String, [f64; 2]> =
        serde_json::from_str(include_str!("../../src/shared/goldsrc-cvars.json"))
            .map_err(|_| "INVALID_CVAR_CATALOG")?;
    let mut args = Vec::new();
    for (name, value) in profile.cvars {
        let [min, max] = *ranges.get(&name).ok_or("INVALID_CVAR")?;
        let text = value.to_string();
        if !(min..=max).contains(&value)
            || !text.bytes().all(|b| b.is_ascii_digit() || b == b'.')
            || text
                .split_once('.')
                .is_some_and(|(_, decimals)| decimals.len() > 6)
            || (matches!(
                name.as_str(),
                "net_graph"
                    | "cl_showfps"
                    | "hud_centerid"
                    | "cl_righthand"
                    | "cl_dynamiccrosshair"
                    | "cl_crosshair_translucent"
            ) && value.fract() != 0.0)
        {
            return Err("INVALID_CVAR_VALUE".into());
        }
        args.extend([format!("+{name}"), text]);
    }
    Ok(args)
}

#[cfg(windows)]
pub fn config_commands(validated_args: &[String]) -> String {
    validated_args.chunks_exact(2).map(|pair| format!("{} {}\n", pair[0].trim_start_matches('+'), pair[1])).collect()
}

fn fetch(api: &str, token: &str) -> Result<Vec<String>, String> {
    let agent = crate::assets::api_with_timeout(api, token, std::time::Duration::from_secs(5))?;
    let bytes = crate::assets::request(&agent, &format!("{api}/auth/goldsrc-cvars/"), token, 4096)?;
    arguments(&bytes)
}

// A missing preference endpoint during a rolling release must not prevent joining a match.
pub fn load(api: &str, token: &str) -> Vec<String> {
    fetch(api, token).unwrap_or_else(|_| {
        eprintln!("GoldSrc account settings unavailable; continuing with game defaults");
        Vec::new()
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn startup_arguments_only_contain_known_numeric_assignments() {
        assert_eq!(
            arguments(br#"{"cvars":{"cl_sidespeed":400,"sensitivity":2.5}}"#).unwrap(),
            ["+cl_sidespeed", "400", "+sensitivity", "2.5"]
        );
        for profile in [
            r#"{"cvars":{"exec":1}}"#,
            r#"{"cvars":{"volume":2}}"#,
            r#"{"cvars":{"cl_forwardspeed":"400;quit"}}"#,
        ] {
            assert!(arguments(profile.as_bytes()).is_err());
        }
    }
}
