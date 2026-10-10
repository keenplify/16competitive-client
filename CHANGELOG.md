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
  \=======

## v2026.910.2 — 2026-09-10

### Voice Chat

- Clarified when voice chat context state resets.

## v2026.910.5 — 2026-09-10

### Documentation

- Updated the README

## v2026.910.6 — 2026-09-10

### Team Communication

- Added team voice chat.

### Downloads

- Released Windows and AppImage packages.

## v2026.910.7 — 2026-09-10

### Voice Chat

- Added a local push-to-talk fallback for GoldSrc matches.

## v2026.910.8 — 2026-09-10

### Voice

- Improved push-to-talk handling.

### Windowing

- Fixed Alt-Tab behavior.

### Diagnostics

- Improved window diagnostics logging.

## v2026.910.9 — 2026-09-10

### Voice Chat

- Added support for choosing a custom voice push-to-talk key.
- Improved restoration of voice key bindings.

## v2026.910.10 — 2026-09-10

### Voice Chat

- Push-to-talk now uses a private GoldSrc command.

## v2026.910.11 — 2026-09-10

### Changes

- No player-facing changes provided.

## v2026.910.12 — 2026-09-10

### Friends

- Added a CS2-style friends list.
- Friend presence now refreshes across regions.

### Parties

- Added party actions directly to the friends panel.
- Improved the lobby’s social sidebar.

## v2026.910.13 — 2026-09-10

### Friends

- Improved friends and social interactions in the party sidebar.

### Chat

- Refined party chat interactions for a smoother experience.
- Added clearer toast notifications for chat and social activity.

## v2026.911.1 — 2026-09-11

### Voice Chat

- Added separate Team and Party voice channels.
- Added separate push-to-talk controls and settings for Team and Party chat.
- Improved automatic push-to-talk binding, including GoldSrc-compatible key bindings.

### Matchmaking

- Improved region selection using latency-safe regions.
- Added latency safety bands to matchmaking server selection.
- Only servers measured at 200 ms or less are eligible.
- Preserved safe-region settings across matchmaking reconnects.
- Added a fallback to the connected region when latency probes fail.

## v2026.911.2 — 2026-09-11

### Improvements

- Improved consistency across matchmaking, party, voice chat, settings, and skins screens.
- Refined party sidebar and chat presentation for a smoother experience.
- Polished voice chat controls and status indicators.

## v2026.913.1 — 2026-09-13

### Match Updates

- See why a match was cancelled when players fail to connect.
- Receive clear, persistent notices when a match is abandoned.
- The launcher now comes into focus for important abandon notices.

## v2026.913.2 — 2026-09-13

### Visuals

- Fixed the lobby glow effect.

## v2026.913.3 — 2026-09-13

### Matchmaking

- Updated the matchmaking lobby experience.
- Improved region selection.

## v2026.913.4 — 2026-09-13

### Matchmaking

- Added a warning modal explaining penalties for failing to connect to a match.

## v2026.914.1 — 2026-09-14

### Linux

- Added packaging support for ARM Linux devices.

## v2026.914.2 — 2026-09-14

### Lobby

- Improved lobby character model rendering.
- Added lobby character animations.
- Lobby models are now cached locally for reuse.

### Platform Support

- Legacy ARMv7 Linux builds are no longer supported.

## v2026.914.3 — 2026-09-14

### Matchmaking

- Regional latency is now measured over UDP.

## v2026.914.4 — 2026-09-14

### Linux

- ARM64 Linux updater metadata is now published.

## v2026.914.5 — 2026-09-14

### Connectivity

- Documented regional latency and connectivity issues for follow-up.

## v2026.915.1 — 2026-09-15

### Audio

- Added looping launcher background music.
- Added selectable BGM presets with saved preferences.
- Added separate BGM and SFX volume controls.
- Added audio cues for navigation, match found, party invitations, and game start.

## v2026.915.2 — 2026-09-15

### Match Found

- Fixed an issue with match-found notifications.

## v2026.915.3 — 2026-09-15

### Daily Quests

- View daily quests in the lobby and match results.
- Track quest progress with new animations.
- See quest rewards carried through match results.

### Store & Skins

- Purchase skins with P Cash.
- View P Cash prices in the store.
- Browse skins by rarity tiers.
- Existing skin unlocks and P Cash balances are preserved.

### Rewards

- Daily rewards now display and apply correctly.

## v2026.915.4 — 2026-09-15

### Daily Quests

- Added daily quests.

## v2026.915.5 — 2026-09-15

### Shop

- Improved error messages when unlocking skins.
- Shop errors now appear as clear notifications.

## v2026.915.6 — 2026-09-15

- feat: enhance match history and results with additional player stats
- fix: show bot teammates in team voice

## v2026.915.7 — 2026-09-15

### Language Support

- Added Taglish, Portuguese, Thai, and Indonesian language options.
- The launcher now detects your language on first launch.
- Language preferences persist across sessions.

### Localization

- Translated launcher navigation, settings, authentication, friends panel, notices, and dynamic UI text.
- Language changes now apply immediately throughout the launcher.

### Settings & Sign-In

- Added language selection to authentication screens and General settings.
- Improved language picker placement and visibility across launcher screens.

## v2026.915.8 — 2026-09-15

### Settings

- Added language selection to Settings.
- Improved language switching across the app.

### Localization

- Updated translations across supported languages.
- Added and refined translated interface text.

## v2026.916.1 — 2026-09-16

### Interface

- Streamlined the Lobby and Play screens.

## v2026.916.2 — 2026-09-16

### Map Previews

- Added map previews for Dust1, Italy, and Assault.
- Match-found screens now display dynamic map previews.

### Interface

- Improved Lobby and Play page backgrounds.
- Refined Daily Quests panel spacing.

## v2026.916.3 — 2026-09-16

### Authentication

- Facebook login is temporarily unavailable.

## v2026.917.1 — 2026-09-17

### Anti-Cheat

- Added anti-cheat checks before the launcher and when starting Counter-Strike.
- Added clearer notices for device bans and anti-cheat-related match cancellations.
- Improved detection of unexpected game changes and cheating indicators.
- Reduced false-positive anti-cheat alerts.

### Launcher

- Added checks for missing or incomplete game setup.
- Improved launcher protection while Counter-Strike is running.
- Improved live refresh of ban and match status.

### Reliability

- Fixed an issue that could cause memory leaks.
- Improved anti-cheat startup and match-to-match state handling.

## v2026.917.2 — 2026-09-17

### Anti-cheat

- Updated the anti-cheat match cancellation notice.

## v2026.917.3 — 2026-09-17

### Fixes

- Fixed an issue affecting the anti-cheat match cancellation notice.

## v2026.917.4 — 2026-09-17

### Device Ban Screen

- Added a sign-out option when access is blocked by a device ban.
- Device bans are rechecked after login.

## v2026.917.5 — 2026-09-17

### Private Friend Chat

- Open private chats from a friend’s context menu.
- Switch between friend chat tabs in the chat panel.
- Receive realtime friend messages and restore offline messages.

### Notifications

- Get sound and taskbar notifications for incoming friend messages.
- Launcher attention alerts and flashing now highlight new messages.

### Chat Experience

- Friend chats reset cleanly between sessions.
- Opening a friend chat automatically focuses the message input.
- Message history no longer inflates DM unread counts.

## v2026.918.1 — 2026-09-18

- Show flags in country picker options
- Move flag picker beside profile name
- Move flag guidance into country picker
- Fix player flag sizing
- Use SVG flags and styled country picker
- Add react-world-flags dependency to project
- Auto-save player flag selection
- Merge pull request #21 from keenplify/feature/player-flags
- Show flags and profiles from leaderboard
- Show flag on player profile
- Validate player profile flag
- Add flag to player profile
- Validate leaderboard flags
- Add flags to leaderboard entries
- Add optional flag selector to profile
- Store player flag selection
- Expose player flag setting
- Register player flag IPC
- Support changing player flag
- Add flag to auth contract
- Add country flag display helpers

## v2026.918.2 — 2026-09-18

- Show player standing below leaderboard
- Fetch current player leaderboard standing
- Include current player leaderboard standing

## v2026.918.3 — 2026-09-18

- Report measured regional latency

## v2026.918.4 — 2026-09-18

- Fix CountryFlag lint directive formatting
- Format latency reporting helper
- Fix profile flag effect lint
- Fix country flag fast refresh lint

## v2026.919.1 — 2026-09-19

- final touches
- Merge pull request #22 from keenplify/feature/random-skin-gifts
- Localize mixed gift reward copy
- Show realtime gifts only in lobby with currency cards
- Claim mixed gift reward types
- Support skin and currency gift choices
- Forward realtime skin gift events
- Add realtime skin gift client event
- Translate deferred gift choice
- Allow deferring welcome gift choice
- Add animated gift box reveal
- Keep gift reveal stable while polling
- Fix gift translation catalog syntax
- Use live language strings in skin gift reveal
- Localize animated skin gifts
- Add welcome gift thank-you message
- Show pending skin gifts after login
- Add animated skin gift reveal
- Wire skin gift IPC
- Expose skin gifts to renderer
- Add skin gift API calls
- Add skin gift client types

## v2026.919.2 — 2026-09-19

- Refactor code for consistency and readability across various components

## v2026.919.3 — 2026-09-19

- Refactor animation keyframes in SkinGiftOverlay for improved clarity and performance

## v2026.921.1 — 2026-09-21

### Discord

- Added Discord Rich Presence.
- Join parties directly from Discord.
- Improved Discord reconnect handling and artwork.

### Parties

- Added support for registering Discord join links.

### Lobby

- Made lobby nameplates responsive.

## v2026.921.2 — 2026-09-21

### Global Chat

- Global chat now follows your launcher language.
- Changing the launcher language switches global chat to the matching language room.
- Chat messages now include language information for a clearer experience.

### Lobby Chat

- Lobby chat can be closed without permanently hiding it.

## v2026.921.3 — 2026-09-21

### Chat

- Added separate Party, Language, and Global chat tabs.
- Kept chat messages isolated by room.
- Improved message routing across chat rooms.
- Private messages now use shared chat notifications.

### Notifications

- Added chat notification sounds for party and public messages.
- Minimized Party and private chats now show message pings.
- Removed obsolete friend-only chat sounds.

## v2026.921.4 — 2026-09-21

### Chat

- The Global chat tab is now always visible.
- Fixed minimized chat state behavior.

## v2026.921.5 — 2026-09-21

### Store & Skins

- Browse skins in a full-width store with sidebar filters.
- Filter skins by rarity and weapon category.
- Purchase and gift skins with updated currency visuals.
- Enjoy animated currency choices in gifts and operation rewards.

### Operations

- Added the Operations experience with progress and rewards.
- View and claim Points and Papa Cash rewards.

### Match & Game Experience

- Improved Counter-Strike 1.6 installation detection and launching.
- Added improved match asset and audio handling.
- Improved voice push-to-talk behavior and game monitoring.

### Interface

- Reserved space for the Friends rail.
- New sessions now default to language chat.
- Removed unnecessary refresh controls.
- Updated Points and Papa Cash artwork throughout the app.

## v2026.921.6 — 2026-09-21

### Fixes

- Improved match asset handling and match data reliability.

## v2026.921.7 — 2026-09-21

### Operations

- Improved the operations screen and operation-related flows.
- Fixed issues affecting operation state and behavior.

### Skins

- Improved skin purchase confirmation.
- Updated skin rarity handling and display.
- Refined skin audio override behavior.

## v2026.921.8 — 2026-09-21

- dsadsa
- mmfi x
- verify

## v2026.921.9 — 2026-09-21

### Discord

- Improved Discord Rich Presence connection reliability.

### Match Assets

- Restored previous match asset behavior.

## v2026.922.1 — 2026-09-22

### Lobby

- Added a marketing lobby experience.
- Added lobby chat functionality.

### Skins

- Improved skin model handling and previews.
- Improved model caching and presentation.

### Discord

- Added configuration support for custom Discord IPC paths.

## v2026.922.2 — 2026-09-22

### Authentication

- Added Discord social login.
- Improved password verification and sign-in flow.
- Added clearer social login provider icons.

### Leaderboards

- Added a national leaderboard view.
- Improved player country display and leaderboard handling.

### Skins

- Improved weapon transforms and skin preview rotation for better model presentation.

## v2026.922.3 — 2026-09-22

### Match Features

- Added player reporting.
- Improved in-game roster management.

### Voice Chat

- Added voice chat preferences.
- Refined the voice chat interface.

## v2026.922.4 — 2026-09-22

### Leaderboard

- Added the continental leaderboard to the client.

## v2026.923.1 — 2026-09-23

### Operations

- View Operation progress after completing a match.
- Browse Operation rewards in a focused carousel and equip eligible skins from their previews.

### Matchmaking

- Improved post-match results and Operation tracking.

### Skins & Effects

- Added water-themed skin patterns, materials, and splash effects.

### Settings & Updates

- Added in-app changelog content with Markdown support.
- Improved game and asset download settings.

## v2026.923.2 — 2026-09-23

### Operations

- Improved reward track scrolling and centered reward selection.
- Refined progression rail interactions.
- Enhanced reward previews with smoother scrolling.
- Added glow effects to operation skin previews.

### Party

- Improved party model scene previews.
- Updated skin texture handling.

## v2026.923.3 — 2026-09-23

### Launching

- Improved Steam game launch handling on Windows.

### Gameplay

- Improved USP weapon positioning.

### Voice Chat

- Updated voice chat dock behavior for marketing lobbies.

## v2026.923.4 — 2026-09-23

### Web App

- Added browser-based Unrated matchmaking.
- Added installable PWA support.
- Preserved browser sign-in sessions across refreshes.
- Added links to download and open the desktop app.
- Improved browser matchmaking reconnect handling.
- Added browser audio support after user interaction.

### Matchmaking

- Added Unrated queue support to the desktop app.
- Added competitive and Unrated queue selection.
- Added Unrated map and match status support.
- Improved matchmaking lifecycle and connection handling.

### Settings

- Added browser-compatible settings.
- Clarified streamed asset behavior in browser settings.
- Improved desktop-only feature messaging.

## v2026.923.5 — 2026-09-23

### Match Connections

- Match passwords are re-applied before connecting through Steam for more reliable joins.

### Web Client

- Web client updates are now rolled out across supported hosts after releases.

## v2026.923.6 — 2026-09-23

### Match Results

- Only Competitive results now affect ratings.
- MMR changes are hidden for Unrated results.

### Settings

- Added the web client version to Settings.

## v2026.923.8 — 2026-09-23

### Authentication

- Social login windows now close automatically after successful sign-in.

## v2026.924.1 — 2026-09-24

### Weapon Previews

- Added stable previews for available weapons and equipment.

### Telemetry

- Improved browser telemetry handling.
- Added telemetry reporting for web mode.

## v2026.924.2 — 2026-09-24

### Skins

- Updated the AK-47 model asset.

## v2026.924.3 — 2026-09-24

### Improvements

- Improved gift validation for a smoother, clearer gifting experience.
- Made general improvements across the app for greater consistency.

## v2026.924.4 — 2026-09-24

### Party Previews

- Improved weapon model handling in web party previews.
- Added clearer error messaging when previews fail to load.

### Loadouts

- Improved weapon loadout handling across matchmaking, party, and skins views.

## v2026.924.5 — 2026-09-24

### Language Support

- Added Hindi translations for the UI.
- Improved language detection and language support.

### Skin Assets

- Updated skin asset sync status text for localization.

## v2026.924.6 — 2026-09-24

### Matchmaking

- Copy match connection details from the matchmaking flow.

### Regional Support

- Added support for India-region matchmaking services.

## v2026.924.7 — 2026-09-24

### Match Connection

- Added an option to copy connection details.

### Help

- Added a tooltip with backup instructions.

## v2026.924.8 — 2026-09-24

### Skin Previews

- Added explosion sprite previews for skins.

## v2026.924.9 — 2026-09-24

### Visual Improvements

- Smoothed explosion sprite animation.

## v2026.924.10 — 2026-09-24

### Match Preparation

- Added FastDL support for preparing match assets.
- Improved match asset preparation status updates.

## v2026.925.1 — 2026-09-25

### Matchmaking

- Improved matchmaking recovery after a launcher restart.
- Added automatic match reporting.

### Game Integrity

- Added game inspection support for match integrity checks.
- Improved anti-cheat startup and match termination messaging.

## v2026.925.2 — 2026-09-25

### Improvements

- Improved release management and versioning.
- Added guidance for inspecting native game installations.

## v2026.925.3 — 2026-09-25

### Demo Playback

- Added demo playback functionality.
- Added a new interface for managing admin demos.
- Added demo links and match integration for playback.

### Navigation

- Added access to the demo playback area from the lobby navigation.

## v2026.925.4 — 2026-09-25

### Demo Playback

- Added desktop integration for demo playback.

## v2026.925.5 — 2026-09-25

### Custom Games

- Added support for creating and joining custom games.
- Added custom game lobbies and player rosters.
- Added custom game matchmaking state and controls.

### Reliability

- Improved anti-cheat logging.
- Improved Windows watchdog process handling.

## v2026.926.1 — 2026-09-26

### Matchmaking

- Added server moving support.
- Improved matchmaking region selection.

### Voice Chat

- FFA match voice chat now uses an all-player channel.

### Updates

- Added support for scoped web updates during client releases.

## v2026.927.1 — 2026-09-27

### Crosshair

- Added a desktop crosshair editor.
- Apply and save crosshair changes during active games.
- Added saved crosshair overlays and save confirmations.

### Scoreboard

- Added Linux match scoreboard support.
- Added FFA and competitive scoreboard layouts.
- Show MR12 round winners.
- Highlighted your own scoreboard row.
- Improved scoreboard headers and round-history handling.

### Fair Play

- Added game screenshot capture for anti-cheat checks.

## v2026.927.2 — 2026-09-27

### Compatibility

- Improved Steam emulation detection for CS16Launcher.

### Overlay

- Improved scoreboard overlay behavior.

### Windows

- Added Windows cosmetic installation support.

## v2026.927.3 — 2026-09-27

### Fixed

- Restored interrupted Windows installations.
- Improved Windows cosmetic installation handling.

## v2026.927.4 — 2026-09-27

### Windows Compatibility

- Improved Counter-Strike client file verification and error handling on Windows.
- Added detection for the NextClient executable.
- Expanded Windows compatibility checks.

### Cosmetic Support

- Improved Windows cosmetic overlay compatibility.
- Added additional checks for cosmetic installations.

### Matchmaking

- Improved matchmaking state management.

## v2026.927.5 — 2026-09-27

### Settings

- Added a setting to disable the Steam scoreboard wrapper.
- Added a custom HUD option for crosshair settings.

## v2026.928.1 — 2026-09-28

### Audio

- Updated the background music to the default track.
- Removed the previous background music track.

## v2026.929.1 — 2026-09-29

### Match Flow

- Fixed post-match reconnect behavior and launcher focus.
- Restored lobby music after matches.
- Extended the match-found backdrop behind navigation.
- Added support for cancelling empty custom rooms.

### Voice Chat

- Improved voice push-to-talk configuration.

## v2026.929.2 — 2026-09-29

### Match Found

- Improved layout and responsiveness for match found screens.

## v2026.929.3 — 2026-09-29

### Improvements

- Improved client code organization and readability for easier maintenance.

## v2026.929.4 — 2026-09-29

### Match Results

- Added an FFA leaderboard to match results.
- Added player ranking displays.

## v2026.929.5 — 2026-09-29

### Cosmetics

- Added resilient Windows NextClient cosmetic support.
- Improved cosmetic helper release handling.

### Settings

- Added crosshair customization options.
- Improved game settings persistence and handling.

### Overlays and Input

- Added NextClient overlay support.
- Added voice push-to-talk support.
- Improved scoreboard overlay behavior.

### Launching

- Improved Counter-Strike launch and installation handling.

## v2026.929.6 — 2026-09-29

### Changes

- No changes were provided.

## v2026.929.7 — 2026-09-29

### Settings

- Updated in-game enhancements settings for a clearer configuration experience.

### CS 1.6

- Enabled the native HUD for CS 1.6.

## v2026.929.8 — 2026-09-29

### Language

- Added Japanese language support and translations.

### Leaderboards

- Added a ranked challenge leaderboard tab.
- Fixed the challenge leaderboard for the web build.

### Improvements

- Improved code formatting and readability.

## v2026.930.1 — 2026-09-30

### Leaderboard

- Added the featured ladder title to the leaderboard header.
- Added a link to join the Discord community.

## v2026.930.2 — 2026-09-30

### Improvements

- Reduced noise from connection failures.
- Discord IPC errors are now handled quietly.

## v2026.930.3 — 2026-09-30

### Post-match surveys

- Share feedback through a new post-match satisfaction survey.
- Defer a survey for the current session or complete it later.
- Unanswered surveys appear in the lobby on your next launch.
- Earn 500 points for completing a survey.
- Your point balance refreshes after receiving a survey reward.

### Visual updates

- Added the Papamo wordmark to authentication screens.
- Refined authentication and text-field styling.

## v2026.930.4 — 2026-09-30

### Reliability

- Improved reliability when downloading the game inspector helper.

## v2026.930.5 — 2026-09-30

### Matchmaking

- Added support for Legacy matchmaking mode.
- Improved matchmaking preferences and region selection.

### Map Feedback

- Added a way to share feedback about map contests.

### Interface

- Refined UI components and visual styling.
- Added the Rajdhani font for a refreshed look.

## v2026.930.6 — 2026-09-30

### Scoreboard

- Added support for more scoreboard versions.
- Improved scoreboard data parsing.

### Match Lobby

- Improved navigation based on the current match status.

## v2026.930.7 — 2026-09-30

### Matchmaking

- Improved matchmaking support for legacy maps.
- Updated selected game mode handling for a smoother queue experience.

## v2026.930.8 — 2026-09-30

### Custom Games

- Improved custom game creation and management.
- Updated the custom games panel for a smoother experience.
- Added clearer validation for custom game settings.

### Matchmaking

- Expanded support for matchmaking modes and maps.
- Updated matchmaking interfaces and browser support.
- Improved validation for matchmaking options.

## v2026.1001.1 — 2026-10-01

### Voice Chat

- Use native push-to-talk without changing your in-game binds.
- Fixed microphone requests for configured PTT and party voice actions.
- Mute and launcher volume controls now work correctly.
- Added a login music control.

### Game Setup

- Fixed missing Counter-Strike key bindings.
- Improved recovery for configurations with missing movement or PTT binds.

### Match Features

- Added ally tags for competitive launcher sessions.
- Added tactical round details to the scoreboard.

### Browsing

- Added category icons for weapons, equipment, player models, and other assets.

## v2026.1001.2 — 2026-10-01

### Controls

- Player binds are now loaded when launching the game.

### Teamplay

- Ally markers are now enabled for NextClient players.

## v2026.1001.3 — 2026-10-01

### Fixes

- Recovered damaged NextClient bindings.
- Diagnosed teammate marker issues.

## v2026.1001.4 — 2026-10-01

### Controls

- Removed automatic launcher control-binding recovery.

### Match Startup

- Recovered controls are now replayed when starting a NextClient match.

## v2026.1001.5 — 2026-10-01

### Launcher

- Polished authentication, news, matchmaking, and settings screens.
- Improved matchmaking search presentation and status clarity.

### Voice Chat

- Improved voice chat controls and settings.
- Added clearer push-to-talk key configuration.

### Scoreboard

- Updated scoreboard integration for improved match visibility.
- Improved scoreboard overlay behavior and presentation.

### Settings

- Refined crosshair settings for a smoother configuration experience.

## v2026.1002.1 — 2026-10-02

### Changes

- No player-facing changes provided.

## v2026.1002.2 — 2026-10-02

### Match Results

- Round-end icons now appear correctly on the scoreboard.
- Overtime and loss bonuses are shown in match results.
- Scoreboard recovery and automatic reports improve match result reliability.

### Interface

- Press Escape to toggle the lobby and settings.
- Windows launcher focus is released when the game starts.
- Other players’ MMR changes are hidden.

## v2026.1002.3 — 2026-10-02

### HUD

- Added clearer explanations for custom HUD availability.
- Improved the scoreboard overlay.

### Game Configuration

- Counter-Strike’s `config.cfg` is no longer modified.
- Removed obsolete configuration mutation behavior and coverage.

## v2026.1002.4 — 2026-10-02

### Scoreboard

- Custom HUD activation now uses the live scoreboard feed.

## v2026.1002.5 — 2026-10-02

### Match Handoff

- Improved session handoff reliability for NextClient matches.
- Prevented unnecessary startup behavior when joining NextClient matches.

### Relaunching

- Windows Counter-Strike now closes gracefully before being relaunched.

## v2026.1002.6 — 2026-10-02

### Skins

- Added a skin resale flow in the launcher.
- Added a confirmation step before reselling a skin.

## v2026.1002.7 — 2026-10-02

### Scoreboard

- Simplified round history display.
- Added a clear indicator for the bomb carrier.

## v2026.1003.1 — 2026-10-03

### Scoreboard

- Updated scoreboard columns for FFA and team loss bonuses.

## v2026.1004.1 — 2026-10-04

### Matchmaking

- Added FFA matchmaking.
- Improved lobby and match result experiences.
- Added clearer guidance when idle.

### Profiles

- Added profile level progress and rank insignia displays.

### Social

- Improved lobby social features.
- Updated chat and voice chat experiences.
- Added community links.

### Launcher

- Added launcher and game settings updates.
- Improved settings management.
- Updated news presentation.

## v2026.1004.2 — 2026-10-04

### In-Game Experience

- Added kill cards.
- Improved in-game overlays and scoreboard visibility.

### Interface

- Kept the friend menu above the rank popover.
- Simplified the idle action arrow.

## v2026.1004.3 — 2026-10-04

### Diagnostics

- Issue reports now include redacted configuration snapshots.
- Game console reports are attached to help diagnose problems.

### Reliability

- Launcher integration failures are handled more gracefully.

### Linux

- Native in-game features now work on ARM64 Linux.

## v2026.1005.1 — 2026-10-05

### Kill Cards

- Added a kill card preview.
- Improved kill card tracking and display.

### Launcher

- Fixed several launcher issues.
- Improved scoreboard overlay behavior.

## v2026.1005.2 — 2026-10-05

### Matchmaking

- Matchmaking connection now restores when the launcher regains focus.

### Issue Reports

- Issue reports now include relevant match diagnostics without uploading user configuration snapshots.

### Windows

- Fixed launching Counter-Strike through Steam on Windows.

## v2026.1005.3 — 2026-10-05

### Setup

- Added an animated client setup experience.
- Added guided onboarding for username and game settings.
- Improved authentication and setup flows.

### Referrals

- Added referral onboarding.
- Added referral settings so referral information can be managed later.

## v2026.1005.4 — 2026-10-05

- Install NextClient from official website during Windows setup

## v2026.1005.5 — 2026-10-05

### Crosshair

- Edit your CS2 crosshair live during matches.
- Import and share CS2 crosshair codes.
- Use 1.6 Competitive crosshair settings with NextClient.

### Fixes

- Fixed stale skin asset setup notifications.

## v2026.1005.6 — 2026-10-05

### Fixes

- Improved NextClient launch compatibility.
- Fixed launch settings not being handed off correctly.
- Fixed NextClient fallback launches.

## v2026.1006.1 — 2026-10-06

### Party

- Party members’ levels are now visible in the party lobby.

### Live Updates

- Improved reliability for live session and match updates.
- Custom game and scoreboard updates are now handled more consistently.

## v2026.1006.2 — 2026-10-06

### Profile Ranks

- Added profile rank progression and level indicators.
- Improved profile rank insignia visuals.

### Party

- Added a preview for party nameplates.
- Party lobbies now display rank information on player nameplates.

## v2026.1006.3 — 2026-10-06

### Matchmaking

- South America is now shown as a matchmaking region.
- South America is labeled consistently in matchmaking and custom games.

## v2026.1006.4 — 2026-10-06

### Match Setup

- Improved handoff of player configuration when launching matches.
- Added coverage to help ensure match configuration is handled correctly.

## v2026.1006.5 — 2026-10-06

### Matchmaking

- Region selection now checks latency to help choose a more responsive matchmaking region.
- Improved matchmaking region handling.

## v2026.1006.6 — 2026-10-06

### Matchmaking

- See the current online player count while matchmaking.
- Choose from available matchmaking regions.
- Enjoy improved matchmaking and lobby status updates.

### Match Launch

- More reliable handoff from matchmaking to the game.
- Improved match join information during launch.

## v2026.1007.1 — 2026-10-07

### Matchmaking

- Ranked browser connections are now supported when enabled.
- Web Play modes can now be configured.

### Settings

- Client settings are now available in localized languages.

## v2026.1007.2 — 2026-10-07

### Matchmaking

- Web Play now respects whether the ranked queue has been enabled by an admin.

## v2026.1007.3 — 2026-10-07

### Web Play

- Steam launches now use your activated manual token.

## v2026.1007.4 — 2026-10-07

### Match Readiness

- Required match maps are now verified before the game launches.
- Match setup now confirms the correct maps are ready before connecting.

## v2026.1007.5 — 2026-10-07

### Matchmaking

- Show each node’s 8 PM–8 AM playtime bonus window in Play and Daily Missions, with +150 points per eligible completed match.
- Show awarded playtime bonuses after matches.
- Add help tooltips for matchmaking modes, playtime bonuses, and Prefer humans in all supported languages.

### Fixes

- Fixed NextClient startup ordering that could restore an old match token, leave a matched player in spectators, and cause a kick.
- Verify the current match identity before NextClient connects.
- Keep match launch details available in issue reports submitted after restarting the launcher.

## v2026.1007.6 — 2026-10-07

### Play Window

- Improved the play window layout and status presentation.
- Refined party and matchmaking screen visuals.

### Reliability

- Added launcher crash reporting to help diagnose unexpected errors.

### Localization

- Expanded localized text support across the launcher.

## v2026.1007.7 — 2026-10-07

### Matchmaking

- Improved the peak hours layout.
- Adjusted tooltips to stay visible within the screen.

## v2026.1007.8 — 2026-10-07

### Matchmaking

- Added regional discovery fallbacks to help find available regions more reliably.

### Peak Bonus

- Clarified the peak bonus information in the player-facing text.

## v2026.1007.9 — 2026-10-07

### Matchmaking

- Improved queue management and matchmaking region handling.

### Anti-Cheat

- Added failure reporting to help diagnose anti-cheat issues.
- Improved anti-cheat helper integrity checks and diagnostics.

### In-Game

- Added native scoreboard and scoreboard overlay support.
- Improved compatibility with GTProtector.
- Improved game launch and match configuration handling.

### Diagnostics

- Added additional launcher, game, and helper diagnostics.

## v2026.1007.10 — 2026-10-07

### Settings

- Added account chat translation settings.
- Configure chat translation preferences from Settings.

## v2026.1007.11 — 2026-10-07

### Chat Translation

- Added a searchable language selector for chat translation settings.

## v2026.1007.12 — 2026-10-07

### Chat translation

- All chat translation language options now display their full language names.

## v2026.1007.13 — 2026-10-07

### Chat translation

- The **Off** option now remains visible in chat translation settings.

## v2026.1007.14 — 2026-10-07

### Match Launching

- Improved match launch diagnostics for GoldSrc clients.
- Improved handling of match connection configuration.

## v2026.1007.15 — 2026-10-07

### Play Window

- Play window checks now align with the six-hour schedule.

## v2026.1008.1 — 2026-10-08

### iCafe branches

- Link your account to an iCafe branch from the client.
- View and manage your linked iCafe branch.

### Windows client compatibility

- Updated terminology for Windows client DLL admission.

## v2026.1008.2 — 2026-10-08

### Compatibility

- Unverified Steam cosmetic proxy builds are now rejected.

## v2026.1008.3 — 2026-10-08

### Matchmaking

- Match readiness and queue timing now use the server clock for more accurate, consistent status updates.

### Account

- Account timing now stays synchronized with the server clock.

## v2026.1008.4 — 2026-10-08

### Performance

- Helper builds now reuse cached results when available.

### Scoreboard

- Scoreboard overlay now displays round accolades.

## v2026.1008.5 — 2026-10-08

### Matchmaking

- Added ranked browser matchmaking when enabled.
- Added custom games and configurable Web Play modes.
- Improved regional matchmaking selection and latency checks.
- Added regional discovery fallbacks and online player counts.
- Added iCafe branch linking.
- Improved match launch diagnostics and reconnection handling.
- Added peak-hour matchmaking UI and schedule checks.

### In-Game

- Added round accolades to the scoreboard.
- Added kill cards and improved in-game overlays.
- Added tactical scoreboard details, overtime, loss bonuses, and round history.
- Added crosshair editing and sharing support.
- Added ally tags and improved scoreboard updates.
- Added demo playback support.

### Chat and Voice

- Added chat translation settings with searchable, named language options.
- Added support for Japanese, Hindi, Portuguese, Thai, Indonesian, and Taglish translations.
- Added separate team and party voice controls.
- Improved push-to-talk support and voice reconnect behavior.
- Added friend messaging, Discord Rich Presence, and party invitations.

### Profile and Progression

- Added profile ranks, levels, and party nameplates.
- Added national, continental, FFA, and challenge leaderboard views.
- Added daily missions and post-match surveys.
- Added player flags and improved match history statistics.
- Added skin gifting, currency rewards, operations, and store improvements.

### Downloads and Updates

- Improved skin asset caching, verification, repair, and background downloads.
- Added retry handling for temporary helper and asset download failures.
- Helper builds can now be reused when the matching release is available.
- The launcher now checks for updates after the game closes.

### Reliability

- Improved Windows, Linux, Steam, and GoldSrc launch handling.
- Added clearer match cancellation notices and launcher diagnostics.
- Improved recovery after network interruptions and launcher focus changes.
- Strengthened client integrity and anti-cheat failure reporting.

## v2026.1008.6 — 2026-10-08

### Match Integrity

- Helper integrity checks now retry automatically after approval timeouts.

### Custom Games

- Added chat for custom game lobbies.

### Updates

- Post-game update checks now wait until you return to the lobby.

## v2026.1009.1 — 2026-10-09

### Cosmetics

- Improved recovery when cosmetic installation encounters a problem.

### Parties

- Improved party state handling during matchmaking.

## v2026.1009.2 — 2026-10-09

### Windows Compatibility

- Improved Windows cosmetic compatibility checks.
- Added clearer logging to help diagnose compatibility issues.

## v2026.1009.3 — 2026-10-09

### Sign-in

- Added Steam social login.
- Added Steam sign-in validation and clearer authentication states.

### Localization

- Added translated text for Steam sign-in and related authentication flows.

### Account Setup

- Improved username setup when creating or signing in with Steam.

## v2026.1009.4 — 2026-10-09

### Match Readiness

- Ready checks now appear directly on the current page.
- Added clearer ready-check status and actions during matchmaking.

### Scoreboard

- Fixed scoreboard round indicators.

## v2026.1009.5 — 2026-10-09

### Matchmaking

- Improved friendly-fire handling and player-facing messaging.
- Added clearer logging for friendly-fire events.

### Match Results

- Fixed delayed confirmation of ACE cards.

## v2026.1009.6 — 2026-10-09

### Authentication

- Added clearer login error handling.
- Added status notifications for social sign-in providers.

### Localization

- Updated translations for the login placeholder.

## v2026.1009.7 — 2026-10-09

### Sign-in

- Improved social authentication.
- Added more reliable handling of authentication links.

## v2026.1009.8 — 2026-10-09

### Player Pings

- Added player ping settings.
- Added ping sound cues for general, enemy, and item pings.
- Added cooldowns for entity pings.
- Added new ping visuals and gun-drop assets.

### Game Sessions

- Improved managed game session safety and recovery.
- Improved switching between managed and standalone game sessions.
- Added safeguards to prevent stale session data from carrying over.

## v2026.1010.1 — 2026-10-10

### Lightweight HUD

- Added an optional lightweight in-game HUD for tactical information.
- Added settings controls and translations for the lightweight HUD.

### Issue Reports

- Issue reports can now include game FPS diagnostics when available.

## v2026.1010.2 — 2026-10-10

### Game Sessions

- Managed game sessions now use expiring authorization tickets.
- Improved authorization handling for active sessions.

## v2026.1010.3 — 2026-10-10

### Fixes

- Fixed an issue that could trigger duplicate standalone game restarts.
- Improved reliability when handing off to a standalone game session.

## v2026.1010.4 — 2026-10-10

### Match Launch

- The player ping key is now saved to a file when launching a match.

## v2026.1010.5 — 2026-10-10

### Fixes

- Fixed an issue that could prevent Warzone from launching.

## v2026.1010.6 — 2026-10-10

### Enhanced Game Sessions

- Improved input handling for enhanced game sessions.
