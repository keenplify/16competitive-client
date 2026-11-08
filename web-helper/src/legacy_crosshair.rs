//! Crosshair commands implemented by the inspected legacy GoldClient client.
//! Use only on its original-DLL launch path; never write player configuration.
use crate::settings_bridge::NativePreferences;

pub fn commands(preferences: &NativePreferences) -> Result<String, String> {
    preferences.validate()?;
    if !preferences.enhancements_enabled { return Ok(String::new()); }
    let Some(config) = &preferences.crosshair_config else { return Ok(String::new()); };
    let modern = config.split_whitespace().next() == Some("cs2");
    let values: Vec<i32> = config.split_whitespace().skip(usize::from(modern))
        .map(|value| value.parse().map_err(|_| "Invalid crosshair value".to_owned()))
        .collect::<Result<_, _>>()?;
    let (size, gap, thickness, outline, alpha, dot, style, t_style) = if modern {
        // This engine implements the CS:GO 0..5 styles, not CS2's newer styles.
        (values[9], values[10], values[11], i32::from(values[12] != 0), values[3],
         values[13], if values[8] <= 5 { values[8] } else { 4 }, values[14])
    } else {
        (values[3], values[4], values[5], values[6], (values[7] * 255 + 50) / 100,
         values[8], if values[9] != 0 { 2 } else { 4 }, 0)
    };
    let mut output = String::from("crosshair 1\ncl_crosshaircolor 5\ncl_crosshairusealpha 1\n");
    for (name, value) in [
        ("cl_crosshaircolor_r", values[0]), ("cl_crosshaircolor_g", values[1]),
        ("cl_crosshaircolor_b", values[2]), ("cl_crosshairalpha", alpha),
        ("cl_crosshairsize", size), ("cl_crosshairgap", gap),
        ("cl_crosshairthickness", thickness), ("cl_crosshairdot", dot),
        ("cl_crosshair_drawoutline", i32::from(outline != 0)),
        ("cl_crosshair_outlinethickness", outline.clamp(0, 3)),
        ("cl_crosshairstyle", style), ("cl_dynamiccrosshair", i32::from(style <= 3)),
        ("cl_crosshair_t", t_style), ("cl_crosshairgap_useweaponvalue", 0),
    ] { output.push_str(&format!("{name} {value}\n")); }
    if modern {
        output.push_str(&format!("cl_crosshair_dynamic_splitdist {}\n", values[18]));
        for (name, index) in [("cl_crosshair_dynamic_splitalpha_innermod", 19),
            ("cl_crosshair_dynamic_splitalpha_outermod", 20),
            ("cl_crosshair_dynamic_maxdist_splitratio", 21)] {
            output.push_str(&format!("{name} {:.2}\n", values[index] as f32 / 100.0));
        }
    }
    Ok(output)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn maps_basic_profile_to_builtin_crosshair() {
        let mut p = NativePreferences::default();
        p.crosshair_config = Some("0 255 80 4 3 2 1 80 1 0\n".into());
        let text = commands(&p).unwrap();
        for command in ["cl_crosshaircolor_g 255\n", "cl_crosshairsize 4\n",
            "cl_crosshairalpha 204\n", "cl_crosshairdot 1\n", "cl_crosshairstyle 4\n"] {
            assert!(text.contains(command), "{command}");
        }
        p.enhancements_enabled = false;
        assert!(commands(&p).unwrap().is_empty());
    }
    #[test]
    fn maps_cs2_supported_fields_and_rejects_command_injection() {
        let mut p = NativePreferences::default();
        p.crosshair_config = Some("cs2 50 250 50 255 0 0 0 255 4 4 -2 1 1 0 1 0 1080 255 3 100 50 35 100 0".into());
        let text = commands(&p).unwrap();
        assert!(text.contains("cl_crosshairgap -2\n"));
        assert!(text.contains("cl_crosshair_t 1\n"));
        assert!(text.contains("cl_crosshair_dynamic_maxdist_splitratio 0.35\n"));
        for bad in ["0 255 80 4 3 2 1 80 1 0;quit", "cs2 0", "0 256 80 4 3 2 1 80 1 0"] {
            p.crosshair_config = Some(bad.into());
            assert!(commands(&p).is_err());
        }
    }
}
