//! Resident UI only. Match workers retain ownership of recovery and cleanup.
use super::*;
use fs2::FileExt;

const TITLE: &str = "1.6 Competitive Helper";

pub fn background(exe: &Path, args: Vec<String>) -> Result<(), String> {
    let mut command = Command::new(exe);
    command
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        command.process_group(0);
    }
    command.spawn().map_err(|e| e.to_string())?;
    Ok(())
}

pub fn ensure(exe: &Path) -> Result<(), String> {
    background(exe, vec!["--tray".into()])
}

fn lock(path: &Path) -> Result<Option<fs::File>, String> {
    let mut options = OpenOptions::new();
    options.read(true).write(true).create(true).truncate(false);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600).custom_flags(libc::O_NOFOLLOW);
    }
    let file = options.open(path).map_err(|e| e.to_string())?;
    match file.try_lock_exclusive() {
        Ok(()) => Ok(Some(file)),
        Err(e) if e.raw_os_error() == fs2::lock_contended_error().raw_os_error() => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

fn labels(locale: &str) -> [&'static str; 3] {
    match locale.split(['-', '_']).next().unwrap_or("en") {
        "ru" => ["Открыть 1.6 Competitive", "Настройки", "Выйти"],
        "tl" | "fil" => ["Buksan ang 1.6 Competitive", "Mga Setting", "Isara"],
        "th" => ["เปิด 1.6 Competitive", "การตั้งค่า", "ออก"],
        "id" => ["Buka 1.6 Competitive", "Pengaturan", "Keluar"],
        "hi" => ["1.6 Competitive खोलें", "सेटिंग्स", "बंद करें"],
        "pt" => ["Abrir 1.6 Competitive", "Configurações", "Sair"],
        "ja" => ["1.6 Competitive を開く", "設定", "終了"],
        _ => ["Open 1.6 Competitive", "Settings", "Quit"],
    }
}

fn open(settings: bool) {
    // Fixed HTTPS destinations only; no protocol payload enters a shell.
    let url = if settings {
        "https://16competitive.papamo.dev/#settings"
    } else {
        "https://16competitive.papamo.dev/"
    };
    let mut command = Command::new(if cfg!(windows) {
        "explorer.exe"
    } else {
        "xdg-open"
    });
    command
        .arg(url)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }
    if let Err(error) = command.spawn() {
        diagnostic(&error.to_string());
    }
}

// Small green crosshair, crisp at tray sizes. Shared RGBA source for both OSes.
fn icon() -> Vec<u8> {
    let mut bytes = vec![0; 32 * 32 * 4];
    for y in 0i32..32 {
        for x in 0i32..32 {
            let dx = (x - 16).abs();
            let dy = (y - 16).abs();
            if (dx <= 1 && (5..=12).contains(&dy))
                || (dy <= 1 && (5..=12).contains(&dx))
                || (dx <= 1 && dy <= 1)
            {
                let i = ((y * 32 + x) * 4) as usize;
                bytes[i..i + 4].copy_from_slice(&[76, 210, 120, 255]);
            }
        }
    }
    bytes
}

fn diagnostic(message: &str) {
    if let Ok(dir) = user_config_dir() {
        // Bounded, no URLs, launch parameters or authentication data.
        let _ = fs::write(dir.join("helper-tray.log"), message);
    }
}

pub fn run() -> Result<(), String> {
    let directory = user_config_dir()?;
    fs::create_dir_all(&directory).map_err(|e| e.to_string())?;
    // Never unlink this file: OS locks release on crashes, unlike PID files.
    let Some(_ownership) = lock(&directory.join("helper-tray.lock"))? else {
        return Ok(());
    };
    if let Err(error) = platform_run() {
        diagnostic(&error);
    }
    Ok(()) // Missing tray support must never block browser setup or launching.
}

#[cfg(target_os = "linux")]
fn platform_run() -> Result<(), String> {
    enum Event {
        Quit,
        Stopped(Result<(), String>),
    }
    let (send, receive) = std::sync::mpsc::channel();
    struct Tray {
        labels: [&'static str; 3],
        events: std::sync::mpsc::Sender<Event>,
    }
    impl ksni::Tray for Tray {
        fn id(&self) -> String {
            "competitive16-web-helper".into()
        }
        fn title(&self) -> String {
            TITLE.into()
        }
        fn icon_pixmap(&self) -> Vec<ksni::Icon> {
            let rgba = icon();
            let argb = rgba
                .chunks_exact(4)
                .flat_map(|p| [p[3], p[0], p[1], p[2]])
                .collect();
            vec![ksni::Icon {
                width: 32,
                height: 32,
                data: argb,
            }]
        }
        fn activate(&mut self, _: i32, _: i32) {
            open(false);
        }
        fn menu(&self) -> Vec<ksni::MenuItem<Self>> {
            use ksni::menu::StandardItem;
            vec![
                StandardItem {
                    label: self.labels[0].into(),
                    activate: Box::new(|_| open(false)),
                    ..Default::default()
                }
                .into(),
                StandardItem {
                    label: self.labels[1].into(),
                    activate: Box::new(|_| open(true)),
                    ..Default::default()
                }
                .into(),
                // Only this tray process exits. Independent match workers finish cleanup.
                StandardItem {
                    label: self.labels[2].into(),
                    activate: Box::new(|tray: &mut Self| {
                        let _ = tray.events.send(Event::Quit);
                    }),
                    ..Default::default()
                }
                .into(),
            ]
        }
    }
    let service = ksni::TrayService::new(Tray {
        labels: labels(&sys_locale::get_locale().unwrap_or_default()),
        events: send.clone(),
    });
    let handle = service.handle();
    let worker = std::thread::spawn(move || {
        let result = service.run().map_err(|e| e.to_string());
        let _ = send.send(Event::Stopped(result));
    });
    let result = match receive.recv().map_err(|e| e.to_string())? {
        Event::Quit => {
            handle.shutdown();
            Ok(())
        }
        Event::Stopped(result) => result,
    };
    worker
        .join()
        .map_err(|_| "Tray service stopped unexpectedly")?;
    result
}

#[cfg(windows)]
fn platform_run() -> Result<(), String> {
    use tray_icon::{
        menu::{Menu, MenuEvent, MenuItem},
        Icon, TrayIconBuilder,
    };
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        DispatchMessageW, PeekMessageW, TranslateMessage, MSG, PM_REMOVE, WM_QUIT,
    };
    let text = labels(&sys_locale::get_locale().unwrap_or_default());
    let menu = Menu::new();
    let website = MenuItem::new(text[0], true, None);
    let settings = MenuItem::new(text[1], true, None);
    let quit = MenuItem::new(text[2], true, None);
    menu.append_items(&[&website, &settings, &quit])
        .map_err(|e| e.to_string())?;
    let _tray = TrayIconBuilder::new()
        .with_tooltip(TITLE)
        .with_menu(Box::new(menu))
        .with_icon(Icon::from_rgba(icon(), 32, 32).map_err(|e| e.to_string())?)
        .build()
        .map_err(|e| e.to_string())?;
    loop {
        unsafe {
            let mut message: MSG = std::mem::zeroed();
            while PeekMessageW(&mut message, std::ptr::null_mut(), 0, 0, PM_REMOVE) != 0 {
                if message.message == WM_QUIT {
                    return Ok(());
                }
                TranslateMessage(&message);
                DispatchMessageW(&message);
            }
        }
        while let Ok(event) = MenuEvent::receiver().try_recv() {
            if event.id == quit.id() {
                return Ok(());
            }
            if event.id == settings.id() {
                open(true);
            }
            if event.id == website.id() {
                open(false);
            }
        }
        std::thread::sleep(Duration::from_millis(40));
    }
}

#[cfg(not(any(windows, target_os = "linux")))]
fn platform_run() -> Result<(), String> {
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn singleton_releases_after_exit_and_ignores_stale_file_contents() {
        let path = env::temp_dir().join(format!("16c-tray-{}", uuid::Uuid::new_v4()));
        fs::write(&path, "stale PID").unwrap();
        let owner = lock(&path).unwrap().unwrap();
        assert!(lock(&path).unwrap().is_none());
        drop(owner);
        assert!(lock(&path).unwrap().is_some());
        fs::remove_file(path).unwrap();
    }
    #[test]
    fn icon_and_supported_locale_menus_are_complete() {
        assert_eq!(icon().len(), 32 * 32 * 4);
        assert!(icon().chunks_exact(4).any(|p| p[3] == 255));
        for locale in ["en", "ru-RU", "tl", "th", "id", "hi", "pt-BR", "ja"] {
            assert!(labels(locale).iter().all(|s| !s.is_empty()));
        }
        assert_ne!(labels("ja"), labels("en"));
    }
}
