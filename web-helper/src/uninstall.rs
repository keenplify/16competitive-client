//! Per-user helper removal. Game installations and native recovery journals are
//! deliberately outside this scope.
use super::*;

pub fn run(confirmed: bool) -> Result<(), String> {
    if !confirmed && !confirm(confirmation()) {
        return Ok(());
    }
    let directory = user_config_dir()?;
    let versions = directory.join("helper-versions");
    if active_worker(&versions)? {
        return Err(active_message().into());
    }
    stop_trays(&versions)?;
    unregister_protocol()?;
    #[cfg(windows)]
    unregister_app()?;
    #[cfg(windows)]
    schedule_windows_cleanup(&directory)?;
    #[cfg(not(windows))]
    {
        remove_owned_directory(&versions)?;
        remove_owned_directory(&directory.join("updates"))?;
        for name in ["helper-tray.log", "presence.endpoint"] {
            let _ = fs::remove_file(directory.join(name));
        }
    }
    Ok(())
}

fn active_message() -> &'static str {
    match sys_locale::get_locale().unwrap_or_default().split(['-', '_']).next().unwrap_or("en") {
        "ru" => "Матч или задача помощника ещё выполняется. Завершите её и повторите удаление.",
        "tl" | "fil" => "May laban o gawain ng Helper na tumatakbo pa. Tapusin ito at subukang i-uninstall muli.",
        "th" => "ยังมีแมตช์หรืองานของตัวช่วยทำงานอยู่ จบงานก่อนแล้วลองถอนการติดตั้งอีกครั้ง",
        "id" => "Pertandingan atau tugas Helper masih berjalan. Selesaikan dahulu, lalu coba hapus lagi.",
        "hi" => "मैच या हेल्पर का काम अभी चल रहा है। इसे पूरा करके फिर से अनइंस्टॉल करें।",
        "pt" => "Uma partida ou tarefa do Helper ainda está em andamento. Conclua-a e tente desinstalar novamente.",
        "ja" => "試合またはヘルパーの処理が実行中です。終了してからアンインストールをやり直してください。",
        _ => "A match or helper task is still running. Finish it and try uninstalling again.",
    }
}

pub fn confirmation() -> &'static str {
    match sys_locale::get_locale().unwrap_or_default().split(['-', '_']).next().unwrap_or("en") {
        "ru" => "Удалить 1.6 Competitive Helper? Сначала завершите активные матчи. Игровые файлы и настройки сохранятся.",
        "tl" | "fil" => "I-uninstall ang 1.6 Competitive Helper? Tapusin muna ang aktibong laban. Mananatili ang mga file ng laro at setting.",
        "th" => "ถอนการติดตั้ง 1.6 Competitive Helper หรือไม่? จบแมตช์ที่กำลังเล่นก่อน ไฟล์เกมและการตั้งค่าจะยังอยู่",
        "id" => "Hapus 1.6 Competitive Helper? Selesaikan pertandingan aktif terlebih dahulu. File game dan pengaturan tetap disimpan.",
        "hi" => "1.6 Competitive Helper अनइंस्टॉल करें? पहले चल रहा मैच पूरा करें। गेम फ़ाइलें और सेटिंग्स सुरक्षित रहेंगी।",
        "pt" => "Desinstalar o 1.6 Competitive Helper? Termine as partidas ativas primeiro. Os arquivos do jogo e as configurações serão mantidos.",
        "ja" => "1.6 Competitive Helper をアンインストールしますか？進行中の試合を先に終了してください。ゲームファイルと設定は保持されます。",
        _ => "Uninstall 1.6 Competitive Helper? Finish active matches first. Game files and saved settings will be kept.",
    }
}

fn remove_owned_directory(path: &Path) -> Result<(), String> {
    match fs::symlink_metadata(path) {
        Ok(meta) if meta.file_type().is_symlink() => {
            Err("Helper install directory is a symlink; refusing to remove it".into())
        }
        Ok(meta) if meta.is_dir() => fs::remove_dir_all(path).map_err(|e| e.to_string()),
        Ok(_) => Err("Helper install path is not a directory".into()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

#[cfg(target_os = "linux")]
fn installed_processes(versions: &Path) -> Result<Vec<(i32, bool)>, String> {
    let self_pid = std::process::id() as i32;
    let mut found = Vec::new();
    for entry in fs::read_dir("/proc").map_err(|e| e.to_string())?.flatten() {
        let Some(pid) = entry
            .file_name()
            .to_str()
            .and_then(|s| s.parse::<i32>().ok())
        else {
            continue;
        };
        if pid <= 1 || pid == self_pid {
            continue;
        }
        let Ok(exe) = fs::read_link(entry.path().join("exe")) else {
            continue;
        };
        if exe
            .file_name()
            .is_none_or(|n| n != "competitive16-web-helper")
        {
            continue;
        }
        let Ok(args) = fs::read(entry.path().join("cmdline")) else {
            continue;
        };
        let args: Vec<_> = args.split(|b| *b == 0).filter(|s| !s.is_empty()).collect();
        found.push((
            pid,
            exe.starts_with(versions) && args.len() == 2 && args[1] == b"--tray",
        ));
    }
    Ok(found)
}

#[cfg(target_os = "linux")]
fn active_worker(versions: &Path) -> Result<bool, String> {
    Ok(installed_processes(versions)?.iter().any(|(_, tray)| !tray))
}

#[cfg(target_os = "linux")]
fn stop_trays(versions: &Path) -> Result<(), String> {
    for (pid, tray) in installed_processes(versions)? {
        if tray {
            unsafe {
                libc::kill(pid, libc::SIGTERM);
            }
        }
    }
    Ok(())
}

#[cfg(windows)]
fn windows_processes(versions: &Path) -> Result<Vec<(u32, bool)>, String> {
    let script = r#"$root=[Environment]::GetEnvironmentVariable('C16_UNINSTALL_ROOT'); Get-CimInstance Win32_Process -Filter 'Name = "competitive16-web-helper.exe"' | Where-Object { $_.ExecutablePath } | ForEach-Object { $isInstalled=$_.ExecutablePath.StartsWith($root+'\',[StringComparison]::OrdinalIgnoreCase);$isTray=$isInstalled -and ($_.CommandLine -eq ('"'+$_.ExecutablePath+'" --tray') -or $_.CommandLine -eq ($_.ExecutablePath+' --tray')); Write-Output ($_.ProcessId.ToString()+','+$isTray.ToString()) }"#;
    let output = hidden_command("powershell.exe")
        .args(["-NoProfile", "-NonInteractive", "-Command", script])
        .env("C16_UNINSTALL_ROOT", versions)
        .output()
        .map_err(|e| e.to_string())?;
    if !output.status.success() {
        return Err("Could not inspect running helper processes".into());
    }
    String::from_utf8_lossy(&output.stdout)
        .lines()
        .map(|line| {
            let (pid, tray) = line
                .trim()
                .split_once(',')
                .ok_or("Invalid helper process response")?;
            Ok((
                pid.parse::<u32>()
                    .map_err(|_| "Invalid helper process ID")?,
                tray == "True",
            ))
        })
        .collect()
}

#[cfg(windows)]
fn active_worker(versions: &Path) -> Result<bool, String> {
    Ok(windows_processes(versions)?
        .iter()
        .any(|(pid, tray)| *pid != std::process::id() && !tray))
}

#[cfg(windows)]
fn stop_trays(versions: &Path) -> Result<(), String> {
    for (pid, tray) in windows_processes(versions)? {
        if tray && pid != std::process::id() {
            let status = hidden_command("taskkill.exe")
                .args(["/PID", &pid.to_string()])
                .status()
                .map_err(|e| e.to_string())?;
            if !status.success() {
                return Err("Could not stop the helper tray".into());
            }
        }
    }
    Ok(())
}

#[cfg(not(any(windows, target_os = "linux")))]
fn active_worker(_: &Path) -> Result<bool, String> {
    Ok(false)
}
#[cfg(not(any(windows, target_os = "linux")))]
fn stop_trays(_: &Path) -> Result<(), String> {
    Ok(())
}

#[cfg(windows)]
pub fn register(executable: &Path) -> Result<(), String> {
    let key = r"HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\16CompetitiveWebHelper";
    let command = format!("\"{}\" --uninstall", executable.display());
    let icon = format!("\"{}\"", executable.display());
    let version: serde_json::Value =
        serde_json::from_str(include_str!("../../helper-release.json"))
            .map_err(|e| e.to_string())?;
    let version = version["version"]
        .as_str()
        .ok_or("Missing helper version")?;
    for (name, value) in [
        ("DisplayName", "1.6 Competitive Helper"),
        ("DisplayVersion", version),
        ("Publisher", "1.6 Competitive"),
        ("UninstallString", command.as_str()),
        ("DisplayIcon", icon.as_str()),
    ] {
        let status = hidden_command("reg.exe")
            .args(["add", key, "/v", name, "/t", "REG_SZ", "/d", value, "/f"])
            .status()
            .map_err(|e| e.to_string())?;
        if !status.success() {
            return Err("Could not register helper in Installed apps".into());
        }
    }
    let status = hidden_command("reg.exe")
        .args([
            "add",
            key,
            "/v",
            "NoModify",
            "/t",
            "REG_DWORD",
            "/d",
            "1",
            "/f",
        ])
        .status()
        .map_err(|e| e.to_string())?;
    if !status.success() {
        return Err("Could not register helper in Installed apps".into());
    }
    Ok(())
}

#[cfg(not(windows))]
pub fn register(_: &Path) -> Result<(), String> {
    Ok(())
}

#[cfg(windows)]
fn unregister_app() -> Result<(), String> {
    let status = hidden_command("reg.exe")
        .args([
            "delete",
            r"HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\16CompetitiveWebHelper",
            "/f",
        ])
        .status()
        .map_err(|e| e.to_string())?;
    if !status.success() {
        return Err("Could not remove helper from Installed apps".into());
    }
    Ok(())
}

#[cfg(windows)]
fn unregister_protocol() -> Result<(), String> {
    let status = hidden_command("reg.exe")
        .args([
            "delete",
            r"HKCU\Software\Classes\competitive16-helper",
            "/f",
        ])
        .status()
        .map_err(|e| e.to_string())?;
    if !status.success() {
        return Err("Could not unregister the helper URL protocol".into());
    }
    Ok(())
}

#[cfg(not(windows))]
fn unregister_protocol() -> Result<(), String> {
    let home = PathBuf::from(env::var_os("HOME").ok_or("HOME is unavailable")?);
    let config = env::var_os("XDG_CONFIG_HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|| home.join(".config"));
    let data = env::var_os("XDG_DATA_HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|| home.join(".local/share"));
    let applications = data.join("applications");
    remove_mime_association(&config.join("mimeapps.list"))?;
    remove_mime_association(&applications.join("mimeapps.list"))?;
    let desktop = applications.join("competitive16-web-helper.desktop");
    if desktop.exists() {
        fs::remove_file(desktop).map_err(|e| e.to_string())?;
    }
    let _ = Command::new("update-desktop-database")
        .arg(applications)
        .status();
    Ok(())
}

#[cfg(not(windows))]
fn remove_mime_association(path: &Path) -> Result<(), String> {
    let source = match fs::read_to_string(path) {
        Ok(value) => value,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(()),
        Err(e) => return Err(e.to_string()),
    };
    let key = "x-scheme-handler/competitive16-helper=";
    let mut changed = false;
    let replacement = source
        .lines()
        .filter_map(|line| {
            let Some(value) = line.strip_prefix(key) else {
                return Some(line.to_owned());
            };
            let handlers: Vec<_> = value
                .split(';')
                .filter(|entry| !entry.is_empty() && *entry != "competitive16-web-helper.desktop")
                .collect();
            if handlers.len() == value.split(';').filter(|entry| !entry.is_empty()).count() {
                return Some(line.to_owned());
            }
            changed = true;
            if handlers.is_empty() {
                None
            } else {
                Some(format!("{key}{};", handlers.join(";")))
            }
        })
        .collect::<Vec<_>>()
        .join("\n");
    if !changed {
        return Ok(());
    }
    let temp = path.with_extension(format!("uninstall-{}", uuid::Uuid::new_v4()));
    fs::write(&temp, format!("{replacement}\n")).map_err(|e| e.to_string())?;
    fs::set_permissions(
        &temp,
        fs::metadata(path).map_err(|e| e.to_string())?.permissions(),
    )
    .map_err(|e| e.to_string())?;
    fs::rename(temp, path).map_err(|e| e.to_string())
}

#[cfg(windows)]
fn schedule_windows_cleanup(directory: &Path) -> Result<(), String> {
    // The Installed apps executable cannot remove itself until this process
    // exits. This detached system process waits for all tray handles to close.
    let script = r#"$root=[Environment]::GetEnvironmentVariable('C16_UNINSTALL_DIR');$pidToWait=[int][Environment]::GetEnvironmentVariable('C16_UNINSTALL_PID');try{Wait-Process -Id $pidToWait -Timeout 30 -ErrorAction SilentlyContinue}catch{};foreach($name in @('helper-versions','updates')){$path=Join-Path $root $name;if(Test-Path -LiteralPath $path -PathType Container){if((Get-Item -LiteralPath $path -Force).Attributes -band [IO.FileAttributes]::ReparsePoint){continue};for($i=0;$i -lt 30;$i++){try{Remove-Item -LiteralPath $path -Recurse -Force -ErrorAction Stop;break}catch{Start-Sleep -Milliseconds 500}}}};foreach($name in @('helper-tray.log','presence.endpoint')){Remove-Item -LiteralPath (Join-Path $root $name) -Force -ErrorAction SilentlyContinue}"#;
    hidden_command("powershell.exe")
        .args(["-NoProfile", "-NonInteractive", "-Command", script])
        .env("C16_UNINSTALL_DIR", directory)
        .env("C16_UNINSTALL_PID", std::process::id().to_string())
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn removal_is_scoped_to_the_owned_directory() {
        let root = env::temp_dir().join(format!("16c-uninstall-{}", uuid::Uuid::new_v4()));
        let versions = root.join("helper-versions");
        fs::create_dir_all(&versions).unwrap();
        fs::write(versions.join("helper"), b"binary").unwrap();
        fs::write(root.join("web-helper.json"), b"settings").unwrap();
        remove_owned_directory(&versions).unwrap();
        assert!(!versions.exists());
        assert_eq!(fs::read(root.join("web-helper.json")).unwrap(), b"settings");
        fs::remove_dir_all(root).unwrap();
    }

    #[cfg(not(windows))]
    #[test]
    fn mime_cleanup_keeps_other_associations() {
        let root = env::temp_dir().join(format!("16c-mime-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&root).unwrap();
        let mime = root.join("mimeapps.list");
        fs::write(&mime, "[Default Applications]\nx-scheme-handler/competitive16-helper=competitive16-web-helper.desktop\nx-scheme-handler/https=browser.desktop\n").unwrap();
        remove_mime_association(&mime).unwrap();
        let result = fs::read_to_string(&mime).unwrap();
        assert!(!result.contains("competitive16-helper"));
        assert!(result.contains("x-scheme-handler/https=browser.desktop"));
        fs::write(&mime, "[Default Applications]\nx-scheme-handler/competitive16-helper=other.desktop;competitive16-web-helper.desktop;\n").unwrap();
        remove_mime_association(&mime).unwrap();
        assert!(fs::read_to_string(&mime)
            .unwrap()
            .contains("x-scheme-handler/competitive16-helper=other.desktop;"));
        fs::remove_dir_all(root).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn removal_rejects_a_symlink() {
        use std::os::unix::fs::symlink;
        let root = env::temp_dir().join(format!("16c-uninstall-{}", uuid::Uuid::new_v4()));
        let target = root.join("game");
        fs::create_dir_all(&target).unwrap();
        fs::write(target.join("keep"), b"game").unwrap();
        symlink(&target, root.join("helper-versions")).unwrap();
        assert!(remove_owned_directory(&root.join("helper-versions")).is_err());
        assert!(target.join("keep").exists());
        fs::remove_dir_all(root).unwrap();
    }
}
