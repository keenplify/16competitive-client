//! ARM Linux web match workers must share Steam's VM and process namespace.
//! Keep setup/tray on the host; never dispatch an authenticated session token.
use std::{
    env, fs,
    os::unix::fs::PermissionsExt,
    path::{Path, PathBuf},
    process::{Command, Stdio},
};

fn executable(path: &Path) -> bool {
    fs::metadata(path).is_ok_and(|m| m.is_file() && m.permissions().mode() & 0o111 != 0)
}

pub fn in_guest() -> bool {
    Path::new("/run/muvm-host").is_dir()
}

fn needs_vm(architecture: &str, guest: bool, muvm: bool, fex: bool) -> bool {
    architecture == "aarch64" && !guest && muvm && fex
}

fn x86_steam(home: &Path) -> Option<PathBuf> {
    [home.join(".steam/steam"), home.join(".local/share/Steam")]
        .into_iter()
        .map(|root| root.join("steam.sh"))
        .find(|path| executable(path))
}

fn guest_steam_command(home: &Path, bash: &Path) -> Result<Option<Command>, String> {
    let Some(script) = x86_steam(home) else {
        return Ok(None);
    };
    if !executable(bash) {
        return Err("FEXBash is required to start x86 Steam in muvm".into());
    }
    // Executing steam.sh directly uses the ARM shell and host ldd, which can
    // incorrectly report missing x86 libc. FEXBash keeps script tools in x86.
    let mut command = Command::new(bash);
    command.arg(script);
    Ok(Some(command))
}

pub fn steam_command() -> Result<Command, String> {
    // The host's `steam` can point at an ARM client even when the installed
    // x86 client lives in muvm. Invoke that client's entry point in the guest.
    if in_guest() {
        let home = env::var_os("HOME").ok_or("Home directory unavailable")?;
        if let Some(command) = guest_steam_command(Path::new(&home), Path::new("/usr/bin/FEXBash"))?
        {
            return Ok(command);
        }
    }
    Ok(Command::new("steam"))
}

pub fn dispatch_web_match(helper: &Path, link: &str) -> Result<bool, String> {
    if !needs_vm(
        env::consts::ARCH,
        in_guest(),
        executable(Path::new("/usr/bin/muvm")),
        executable(Path::new("/usr/bin/FEX")) || executable(Path::new("/usr/bin/FEXInterpreter")),
    ) {
        return Ok(false);
    }
    // Re-enter before exchanging the one-time web handoff. The helper, signed
    // inspector and game then see the same /proc and retain normal ownership
    // checks. Wrapping only hl_linux would make its guest PID invisible.
    let mut command = Command::new("/usr/bin/muvm");
    command
        .args(["--emu=fex", "--"])
        .arg(helper)
        .arg("--muvm-match")
        .arg(link)
        .env_remove("LD_PRELOAD")
        .env_remove("PAPAMO_SKIN_PROBE_SESSION")
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    use std::os::unix::process::CommandExt;
    command.process_group(0);
    command
        .spawn()
        .map_err(|_| "Could not start the match helper in muvm")?;
    Ok(true)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn routing_requires_arm_host_and_installed_runtime() {
        assert!(needs_vm("aarch64", false, true, true));
        assert!(!needs_vm("aarch64", true, true, true));
        assert!(!needs_vm("x86_64", false, true, true));
        assert!(!needs_vm("aarch64", false, false, true));
        assert!(!needs_vm("aarch64", false, true, false));
    }
    #[test]
    fn guest_steam_entry_must_be_executable() {
        let home = env::temp_dir().join(format!("16c-steam-{}", uuid::Uuid::new_v4()));
        let script = home.join(".local/share/Steam/steam.sh");
        fs::create_dir_all(script.parent().unwrap()).unwrap();
        fs::write(&script, "#!/bin/sh\n").unwrap();
        fs::set_permissions(&script, fs::Permissions::from_mode(0o600)).unwrap();
        assert!(x86_steam(&home).is_none());
        fs::set_permissions(&script, fs::Permissions::from_mode(0o700)).unwrap();
        assert_eq!(x86_steam(&home), Some(script.clone()));
        let bash = home.join("FEX Bash");
        assert!(guest_steam_command(&home, &bash).is_err());
        fs::write(&bash, "#!/bin/sh\n").unwrap();
        fs::set_permissions(&bash, fs::Permissions::from_mode(0o700)).unwrap();
        let command = guest_steam_command(&home, &bash).unwrap().unwrap();
        assert_eq!(command.get_program(), bash.as_os_str());
        assert_eq!(
            command.get_args().collect::<Vec<_>>(),
            vec![script.as_os_str()]
        );
        fs::remove_dir_all(home).unwrap();
    }
}
