# Changelog

All notable changes to 1.6 Competitive Launcher are documented here.

## v2026.904.6 — 2026-09-04

### Added

- Public top-MMR leaderboard with cached server data and in-app refresh.
- Post-game MMR snapshots in match results and match history.

### Changed

- The lobby MMR now updates immediately after a completed match and then synchronizes with the server.
- Launcher updates now block interaction while downloading and restart automatically after installation is ready.
- Linux and Windows launcher icons now use the 1.6 Competitive brand mark instead of an invisible or default icon.

### Notes

- Casual matches remain unranked.
- Historic matches without MMR snapshots are displayed as unranked.

## v2026.905.1 — 2026-09-05

### Launcher

- Improved navigation between launcher sections.
- Refined the in-launcher news experience.

### Party Chat

- Improved party chat usability and reliability.

## v2026.905.2 — 2026-09-05

### Linux

- Improved Linux packaging reliability.

## v2026.905.3 — 2026-09-05

### Updates

- Improved launcher update installation and restart reliability.

### Fixes

- Fixed the launcher getting stuck in fullscreen while closing for an update.
- Prevented duplicate update installation attempts.

## v2026.905.4 — 2026-09-05

- expand map pool
- Fix CS 1.6 match identity launch reliability

## v2026.905.5 — 2026-09-05

- Fix CS 1.6 reconnect identity persistence

## v2026.906.1 — 2026-09-06

### Redeem Codes

- Added support for redeeming player codes.
- Added a redeem code flow in the client.

### Chat

- Deleted global chat messages are now removed.

## v2026.906.2 — 2026-09-06

### Linux

- Fixed fullscreen behavior.

## v2026.906.3 — 2026-09-06

### Skin Preview

- Faster skin preview loading.
- Improved preview performance with cached model thumbnails.
- Added a new Elite pistols preview asset.

### Skins

- Overhauled the skins popup experience.
- Improved skin browsing and model presentation.
- Updated skin shop and skins page layouts.
- Added clearer skin previews in party and profile views.

## v2026.906.4 — 2026-09-06

### Matchmaking

- Ready checks now recover after a host handoff.

## v2026.907.1 — 2026-09-07

### Matchmaking

- Fixed matchmaking flow and lobby state updates.
- Improved match search and queue handling.
- Improved party and lobby coordination.

### Game Launching

- Fixed Counter-Strike 1.6 installation and launch handling.

## v2026.907.2 — 2026-09-07

### Match Results

- Fixed MMR display for completed matches.

### Match History

- Fixed MMR values shown for completed matches.

## v2026.907.3 — 2026-09-07

### Updates

- Improved version control.

## v2026.907.4 — 2026-09-07

### Fixes

- Fixed issues affecting the gear lever.
- Improved update handling and notifications.
- Corrected update metadata.

## v2026.908.1 — 2026-09-08

### Sign-In

- Sign in or register with Google or Facebook.
- Connect social accounts from Settings.

### Account

- Set up a username before entering the lobby.
- Change your username from Settings.
- Update your password with verification.

### Settings

- Browse settings with smoother animated sections.
- Find Sign out and Exit below the settings tabs.

## v2026.908.2 — 2026-09-08

### Matchmaking

- Fixed issues affecting matchmaking flow and lobby state.
- Improved match-found ready check handling.
- Refined matchmaking status updates.

## v2026.908.3 — 2026-09-08

- Fix client lint errors

## v2026.908.4 — 2026-09-08

- Merge pull request #3 from keenplify/fix/match-recovery-and-game-exit
- Track Linux GoldSrc process after Steam handoff
- Mount matchmaking search status in the lobby
- Show matchmaking status while joining and searching
- Fix recovered matches and duplicate results
- Fix match result perspective

## v2026.908.5 — 2026-09-08

- Serialize reconnect launches and harden match config writes

## v2026.908.6 — 2026-09-08

### Matchmaking

- Added clearer reconnect banners for matchmaking and match servers.
- Improved recovery when matchmaking connections become unhealthy.
- Hardened matchmaking recovery after temporary connection loss.

### Match Preparation

- Matchmaking now waits for required client updates.
- Asset downloads automatically retry when they fail.
- Improved handling of match events during reconnection.

## v2026.908.7 — 2026-09-08

### Updates

- Fixed update handling.

## v2026.908.8 — 2026-09-08

### Matchmaking

- Improved connection status visibility.
- Made matchmaking lobby behavior more reliable.

## v2026.908.9 — 2026-09-08

### Match Assets

- Improved retry handling for match asset downloads.

### Launcher

- Fixed several launcher issues.
- Improved launcher reliability.

### Diagnostics

- Added launcher telemetry reporting after authentication.
- Improved reporting of launcher client telemetry.

## v2026.908.10 — 2026-09-08

### Matchmaking

- Improved recovery when the matchmaking server restarts.

## v2026.908.11 — 2026-09-08

### Match Stability

- Counter-Strike now stays running when the API restarts.

## v2026.908.12 — 2026-09-08

### Match cancellations

- Asset downloads now stop when a match is cancelled.

## v2026.908.13 — 2026-09-08

### Matchmaking

- Prevented duplicate matchmaking connections.

## v2026.908.14 — 2026-09-08

### Skin Assets

- Download skin assets in the background.
- Cache skin preview models locally for faster loading.

## v2026.908.15 — 2026-09-08

### Skin Assets

- Skin asset download errors now explain whether the Counter-Strike folder needs permissions, an executable selection, or a connection check.

## v2026.908.16 — 2026-09-08

- Retry skin asset sync after saving game path

## v2026.908.17 — 2026-09-08

- fix author

## v2026.908.18 — 2026-09-08

- fix author

## v2026.908.19 — 2026-09-08

### Match Assets

- Match asset downloads now recover after network outages.

### Matchmaking

- Matchmaking now reconnects after WebSocket network errors.
- Improved stability when the network disconnects.

## v2026.908.20 — 2026-09-08

### Matchmaking

- Reduced stale matchmaking status and queue information.
- Improved matchmaking state freshness and reliability.

## v2026.908.21 — 2026-09-08

### Matchmaking

- Improved recovery when matchmaking services restart or connections are interrupted.
- Automatically reconnects when the connection heartbeat fails.

## v2026.908.22 — 2026-09-08

### Diagnostics

- Added comprehensive logging to help diagnose launcher issues.

### Skin Assets

- Improved visibility into skin asset synchronization status.

## v2026.908.23 — 2026-09-08

### Reliability

- Improved reliability when creating releases and uploading release assets, including retry handling.

## v2026.909.1 — 2026-09-09

### Improvements

- Added client issue reporting.
- Improved skin asset sync status visibility.
- Enhanced diagnostic log handling.

## v2026.909.2 — 2026-09-09

### Authentication

- Improved sign-in for Facebook accounts without a social email address.

### Privacy & Terms

- Added links to the Privacy Policy and Terms of Service on the sign-in screen.

## v2026.909.3 — 2026-09-09

### Authentication

- Updated the authentication page.

## v2026.909.4 — 2026-09-09

### Sign-in

- Facebook sign-in now brings the launcher back into focus when authentication completes.

## v2026.909.5 — 2026-09-09

- fixes
- style and sharpen lobby nameplates
- fix party model buffer race
- reduce lobby camera sway range
- add mouse-driven lobby camera movement
- fix mapping
- derive lobby weapon transform from model path
- remember selected lobby weapon in loadout
- hardcoded thigns
- render Elite pistols on both hands
- elite
- add per-weapon lobby model transforms
- WIP
- fix duplicate models path in lobby model loader
- test
- rebuild lobby scene on hot refresh
- enable hot reload for default local start
- add per-family lobby weapon transforms
- use correct lobby weapon animation sequences
- fix lobby weapon loadout precedence
- WIP - remade launcher
- Refine lobby navigation and page styling
- Improve social login focus flow

## v2026.909.6 — 2026-09-09

### Matchmaking & Lobby

- Added a more compact matchmaking search panel.
- Improved friends sidebar animations and collapsed-rail interaction.

### Match Assets

- Moved asset downloads and repair controls into Settings.
- Added skin asset repair and synchronization controls.
- Completed match asset banners now hide automatically.

### Skin Previews

- Added per-weapon preview zoom controls.
- Updated previews when zoom or presentation settings change.
- Fixed store sizing and thumbnail regeneration.

### Match Experience

- Added clearer victory and defeat result gradients.
- Improved server-ready and reconnect backgrounds.
- Extended server-ready visuals behind navigation.
- Added a smoother transition from match-ready screens back to the lobby.

## v2026.909.7 — 2026-09-09

### Skins

- Fixed an issue with skin thumbnail effects.

## v2026.909.8 — 2026-09-09

### Skin Assets

- Repair only mismatched skin assets.
- Verify skin asset integrity on the client.

### Matchmaking

- View regional latency when choosing a matchmaking region.
- Sync assets through your preferred region.

## v2026.909.9 — 2026-09-09

### Changes

- No player-facing changes were provided.

## v2026.909.10 — 2026-09-09

### Linux

- Linux AppImage updates are now automated through Gear Lever.

## v2026.909.11 — 2026-09-09

### AppImage

- AppImage runs now require Gear Lever.

## v2026.909.12 — 2026-09-09

### Matchmaking

- Added regional latency selection.
- Matchmaking nodes now measure latency to help inform region selection.

## v2026.909.13 — 2026-09-09

### Improvements

- General improvements across matchmaking, party, settings, and skins.

## v2026.909.14 — 2026-09-09

### Linux

- Removed the Gear Lever dependency for Linux AppImage updates.
- Updated documentation and package metadata to reflect the revised updater behavior.

## v2026.909.15 — 2026-09-09

### Matchmaking

- Choose a preferred region when joining the matchmaking queue.
- Your selected region is reflected in queue status.

## v2026.910.1 — 2026-09-10

### Voice Chat

- Added persistent party and team voice controls alongside Friends.
- Improved voice connection reliability and reconnect handling.
- Added push-to-talk settings and synchronized them with GoldSrc.
- Added Wayland-safe push-to-talk support.
- Fixed voice controls overlapping and improved mouse capture.

### Matchmaking & Skins

- Skin requests now use the selected region and active node.
- Improved skin asset synchronization feedback.

### Game Settings

- Added configured GoldSrc push-to-talk keys to game settings.
- Applied push-to-talk settings when launching matches.

## v2026.910.3 — 2026-09-10

### Voice Chat

- Improved handling and diagnostics for failed voice relay connections.
- Voice chat state now resets correctly when changing contexts.

## v2026.910.4 — 2026-09-10

### Linux

- Improved reliability for Linux builds.
