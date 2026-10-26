# Web match helper

This optional Rust program handles `competitive16-helper://` links from the web app. It runs only for setup checks or match launches; there is no background service. Open the downloaded binary once to copy it into the user's profile and register the protocol. Opening a newer binary replaces the installed copy. The helper discovers Counter-Strike 1.3 and 1.6 installations in common locations and lets the player select a folder manually.

Windows installs under `%LOCALAPPDATA%\16competitive`. Linux installs under `~/.local/bin` and registers a user desktop entry. Linux players may need to grant the downloaded file executable permission before opening it. No administrator rights are required.

The PWA uses a single-use handoff token for setup checks and match joins. The backend returns credentials only for the signed-in player's current match. The helper validates the response and launches the appropriate executable with argument arrays. It writes temporary launcher-owned session files and removes them when the game exits. It never reads or changes `config.cfg`.

The helper and Electron read `src/shared/web-game-launch-pattern.json` for shared launch values. The web build embeds a SHA-256 fingerprint of the Rust sources, Cargo files, and launch pattern. A setup check reports the installed helper fingerprint through the handoff API; an older helper is marked outdated and the web UI offers the current download.

`npm run release` and `npm run release:local` compare these sources with the previous release. Changed sources rebuild the Windows and Linux binaries; unchanged sources reuse the previous release assets when available. Each desktop release publishes `competitive16-web-helper.exe` and `competitive16-web-helper-linux` alongside its other assets.

For local development: `cargo test --manifest-path web-helper/Cargo.toml` and `cargo build --manifest-path web-helper/Cargo.toml --release`. The built binary accepts `--fingerprint` for checking its embedded version without installing it.
