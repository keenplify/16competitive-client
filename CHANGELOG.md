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
