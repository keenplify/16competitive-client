# Standalone game-session helper

Target: the Rust helper owns the entire managed session while every Electron
process is closed. The cosmetic module remains a rendering/input component inside
the game; the read-only inspector remains separate. A hidden Electron runtime is
not Lightweight mode.

## Dependency audit (2026-11-04)

| Feature | Current owner / dependency | Standalone work |
| --- | --- | --- |
| CS1.6 launch | Lightweight native matches use Rust; desktop hands off through a private inherited pipe | Native process handoff and Proton/Wine supervision are implemented; live compatibility validation remains |
| Crosshair rendering | Native cosmetic worker reads `crosshair.conf`; Electron normally writes it | Rust now validates/writes the profile and refreshes helper preferences during the native session |
| PTT and ping input | Native module requires `ptt.keys` before loading; direct Rust session previously omitted it | Rust now writes validated GoldSrc key codes and ping preference before launch; key changes take effect on the next native session |
| Voice audio | `VoiceChatDock.tsx`: browser WebRTC, microphone capture, per-peer playback/muting; helper microphone uses a BrowserWindow | Rust capture/playback, Opus/WebRTC, authenticated signaling, roster authorization and PTT gates are implemented and wired into the direct native session. Renderer preference handoff and browser suppression are implemented; ownership is checked through a live process lock scoped to the match. Linux/Wine default-device initialization passed; device selection and live relay/audio validation remain |
| Stickers | Electron `sticker-delivery.ts` downloads recipes/artwork and runs a JS bake worker; native module validates/displays prepared results | Rust now embeds the shared baker in bounded QuickJS, verifies recipe/source/artwork hashes, decodes PNG, writes immutable model/RGBA artifacts and v2 manifests before direct launch. Stock AK output matches the Electron baker byte for byte; live pickup/drop and partner delivery still need validation |
| Skins/model assets | Match preparation and catalog sync/repair run in Rust with hash verification | Partner asset parity still needs work |
| Native ownership | Rust `NativeSession` already owns fixed two-hour tickets and one-second leases | Preserve expiry and server endpoint binding; never extend the ticket with a heartbeat |
| Match authorization | Electron runtime checks helper-connection every 15 seconds | Native session now performs the same check and revokes ownership on explicit denial; outages do not become bans or renewed tickets |
| Anti-cheat | Private Rust inspector scans/uploads; Rust now supervises the direct launch path | Startup timeout, bounded IPC, PID attachment, heartbeat checks, one restart, local integrity/approval rechecks and shutdown are implemented. Native screenshot collection still needs parity. Steam/bootstrap ownership uses retained OS handles; Proton delegates to the Windows Rust supervisor. |
| Scoreboard | Electron offscreen BrowserWindow paints rich Tab scoreboard | Native path currently retains stock Tab and native ally tags; native tactical parity needs review |
| Kill cards | Native path has a basic feed-derived counter; Electron has richer prediction and rendering | Preserve supported events/settings without an offscreen browser |
| Partner UI | Electron `PartnerHtmlRenderer` renders arbitrary partner HTML | CS1.6 always uses native HUD presentation. Keeping the launcher open does not enable arbitrary partner HTML. |
| In-game DMs/announcements | Managed game-server AMXX/backend bridge | Does not require Electron for in-game delivery; client voice/signaling and presence still need independent session ownership |
| Presence | Rust local activity broker exists; authenticated account presence is separate | Own backend connection/reconnect and logout/session revocation in the supervisor |
| Diagnostics | Electron collects issue logs, screenshots and recent native HUD cadence samples | Preserve bounded retention and submit-only upload semantics independently |
| Cleanup/recovery | Rust Windows journal/guard already exists; older unjournaled installs explicitly request Electron recovery | Audit migration/recovery, helper updates and standalone restart; retain unknown changes and journals on failure |
| Relaunch app | Rust verifies and reopens the launcher after game exit/cleanup | Private authenticated handoff and commit/EOF protocol implemented; supervisor-crash recovery remains incomplete |
| Setup checks | Rust now calls the signed inspector directly and validates the selected installation | No Electron runtime is started by this action. |
| Other auxiliary helper actions | Microphone diagnostics, issue diagnostics, installer and partner launch can invoke `runtime` | A shared/exclusive process lock now prevents these actions from starting Electron while the direct native session owns the game. Native replacements remain necessary for microphone diagnostics/issue diagnostics/installer functionality; CS1.6 partner launch now routes to Rust |

## Changes implemented so far

`native_preferences.rs` writes only helper-owned native session files. It checks
the entire settings object before mutation, rejects invalid/duplicate PTT keys,
supports both crosshair formats, removes the custom crosshair when enhancements
are disabled, and bounds settings-file reads. The lease worker refreshes changed
crosshair/HUD preferences without a renderer. Native PTT is input handling only;
native voice audio is now a separate Rust session service.

`session_authorization.rs` checks the authenticated regional match endpoint without
following redirects. Explicit 401/403/404/409/410 revokes the session; temporary
network/server errors retain the original fixed expiry and native feed freshness
rules. No token is written to disk or command arguments. The dedicated helper login is
revoked when its scope ends, including failed launches and setup handoffs; this
does not revoke the browser/desktop login. Direct sessions without the cosmetic
module also retain the two-hour limit and backend authorization checks.

`inspector.rs` now owns the signed scanner process independently: credentials use
bounded stdin, the child receives a minimal environment, startup and heartbeat
failures close the session, and unexpected scanner death permits one verified
restart. Approval is checked every minute; temporary service failures get a fixed
one-minute grace period with retries, while tampering and explicit rejection fail
immediately. The direct launch path waits for the owned game process before native
restoration. Missing observation uploads are not treated as cheating.

The helper setup-check action now uses this Rust device-check path. Returned device
status is allowlisted so hardware identifiers cannot reach the web UI.

Native CS1.6 lightweight launches now route to Rust. Desktop handoff uses an
inherited pipe, a dedicated backend login, readiness/commit acknowledgement and
confirmation that Electron released the pipe before native voice starts. Rust
reopens the verified launcher executable after game supervision and cleanup.
Queued warmup, Proton/Wine and CS1.6 partner sessions now use this handoff.
CS1.3 is deferred by explicit user instruction and retains its existing path.

## Required end-to-end verification

- Linux native, Windows native, Steam handoff, Wine/Proton and NextClient launches.
- Zero Electron processes after handoff; closing the browser must not stop voice.
- Crosshair, stickers (including pickup/drop), pings and voice remain functional.
- Expiry, logout, match completion, helper crash, game crash and backend outage.
- Scanner lifecycle and signature/approval enforcement stay active.
- Cleanup restores only recognized journaled files; no access to player config.
- Launcher reopens once with results/reconnect state after cleanup. Old session
  events cannot terminate a replacement standalone game.

Verification: the stale 0.1.79 local bundle was replaced using the existing
preparation script with published 0.1.81 assets, after signature/hash checks and
backend approval. The full Linux helper suite now passes without skipping the
signed-bundle check. Windows GNU compilation passes using the cached LLVM-MinGW
toolchain. Windows process ownership and controlled bootstrap runtime tests passed. Live
voice relay and actual managed-game handoff remain end-to-end checks; these
controlled process tests do not establish gameplay compatibility.

## Native services verification (current work)

- Native WebRTC peers negotiated DTLS/SRTP and delivered decoded synthetic Opus
  audio without a browser or audio hardware. A simultaneous-offer test exposed
  unsupported SDP rollback in webrtc-rs; the polite peer now replaces its
  provisional connection and rejects stale generation events.
- Playback continues without a microphone. Capture/playback currently require a
  48 kHz-capable default device. Default audio-device initialization passed on Linux and under Wine. Audible
  microphone/playback, TURN behavior,
  echo cancellation/noise suppression and UI mute/device handoff are not verified.
- The standalone sticker baker ran twice against a pinned stock AK-47 model;
  both generated model and RGBA sidecar were byte-identical to the Electron
  implementation. This is preparation validation, not live in-game rendering QA.
  Debug baking took approximately 14.5 seconds per bake on this host; do not claim
  launch-time or FPS improvements without measuring a release build.
- Corrected Electron's four-column sticker manifest header to `16c-stickers-v2`.
- Browser/settings saves preserve native voice preferences and synchronize
  VoiceChatDock state. A match-scoped native lock advertises takeover before
  waiting for the old microphone runtime. Browser voice resumes on failed launch
  or helper exit; stale files and replies from older matches cannot claim it.
- The embedded baker is reproducibly generated by
  `node scripts/build-native-sticker-baker.mjs`; `--check` detects stale output.
  The helper fingerprint includes all new native services and the bundled script.
- Linux helper tests and Windows GNU test compilation pass with the new native
  dependencies. Build images/workflows now include ALSA development libraries.

Desktop handoff/reopen and voice preference ownership are now implemented.
Browser voice steps aside for lightweight match sessions; catalog download and
repair use Rust verification directly. Packaging includes a hashed native helper
and copies it to persistent user data before quitting, so AppImage unmounting
cannot remove the running helper. The UI calls this Lightweight mode in all eight
languages and states the partner native-HUD limitation.

Compatibility code now covers Proton/Wine native-module staging/recovery, CS1.6
partner sessions, and queued warmup. Ranked ready checks close the owned warmup
game, restore files, and reopen the launcher; no ready check is auto-accepted.
CS1.3 remains deferred. Actual Windows/Steam/NextClient and Proton/Wine gameplay,
real hardware voice/TURN checks and performance measurement remain release QA.
The two-step desktop protocol is covered by real subprocess tests (valid handoff,
invalid readiness, preserving mute/volume, no account token in argv). This does
not substitute for a live game lifecycle test.

## Current checks

- TypeScript checks and targeted lint pass.
- Native helper unit tests, including WebRTC audio/offer collision and crosshair
  refresh, pass; Windows GNU compilation passes.
- Desktop handoff and helper packaging regression tests pass.
- Web voice/settings, helper fingerprint, legacy runtime and local artifact tests
  pass. No deployment or release was performed.

## Handoff hardening

- Readiness waits for scanner acknowledgement of the exact owned PID. Heartbeats,
  another PID, an exited game or a fixed attachment timeout cannot acknowledge it.
- Preparation failures after native installation use the common restoration path.
  Scanner/OS disagreement does not enter an unbounded process wait.
- An acknowledged helper that dies before Electron's scheduled quit cancels that
  quit. The Rust protocol also requires parent EOF after commit.
- Native protocol tests cover invalid/missing commits, a parent that remains alive,
  broken output and a real test launcher process reopening. These are controlled
  fixtures, not live Counter-Strike or Electron end-to-end validation.
- Browser voice ownership tests cover old-match responses, helper failure, and
  releasing ownership after stop. The OS lock invalidates stale status on crash.

## Compatibility hardening and desktop incident (2026-11-04)

- Startup rejects an existing selected game, rechecks immediately before spawn,
  and waits for the client module to load before readiness. The selected process
  is retained using a Windows handle or Linux pidfd. Later replacement processes
  are never rediscovered or terminated by the old session.
- Linux native launch asks Steam's runtime for its pinned/host/fallback library
  order. It does not prepend every legacy runtime library ahead of Mesa.
- Proton resolution respects app 10's explicit selection, including official and
  custom runtimes; the global default does not force Proton. Missing selected
  runtimes and ambiguous metadata fail closed.
- Wine path conversion is bounded by size and time. The Windows supervisor uses
  private stdin credentials and the commit/EOF handshake. Linux ownership locks
  remain held until Windows cleanup exits, even after a failed handoff.
- Production Proton/Wine requires the matching signed Windows helper release.
  The companion must be published alongside this client version; this work has
  not published any release. Debug tests use the local Windows build.
- Partner authorization binds the exact server and connection, permits a bounded
  initial presence grace period, and preserves fixed ticket expiry during outages.
  Native voice supports 31 remote peers. Failed launches/logout clear the pending
  browser partner voice target.
- During local live testing, GoldSrc first crashed loading ChromeHTML because
  legacy runtime libraries were missing. A subsequent test coincided with an
  XWayland failure: `failed to import supplied dmabufs`, followed by loss of the
  XWayland connection. The user had to restart the desktop. No further live game
  launches are permitted on this desktop in this work; use isolated VM testing.
  This is not a successful gameplay validation or evidence of an FPS improvement.
- Windows VM bootstrap fixture validation passed: the launcher exits, the actual
  client loads its module, ownership follows that game, and stopping the retained
  process does not affect a later replacement.

### Latest automated verification

- Linux Rust: 89 passed (3 library + 86 binary), 2 explicitly ignored
  hardware/external-asset tests. One initial inspector fixture spawn failed;
  the full rerun passed after adding the OS error to startup diagnostics.
- Windows VM: 78 passed, 3 ignored; controlled bootstrap handoff separately
  passed. Corrected the Proton fixture assertion to compare canonical paths.
- Web regression suite: 83 passed.
- Standalone handoff, packaging, browser voice ownership and fingerprint: 8 passed.
- Existing launch compatibility, credentials, ready-response and partner launch:
  15 passed. TypeScript, targeted ESLint and diff whitespace checks passed.
- Querying Steam's runtime library order and checking ChromeHTML dependencies
  resolves all previously missing libraries without starting the game.
- The user will install Steam/CS1.6 in the isolated Windows test VM. Live game,
  voice relay, visual crosshair/sticker and actual Electron exit/reopen validation
  remain pending that setup. No release or deployment was performed.

## Isolated installation matrix (2026-11-04)

Copies of the three user-selected installations were tested inside the Windows
VM. Source installations were untouched; copying excluded every `.cfg` file.
No further host-desktop game launches were made.

| Installation | Result |
| --- | --- |
| GoldClient | Joined local Dust2; native helper ready/commit, scanner attachment, game exit and original DLL restoration passed. No ticket/recovery journal remained. |
| NextClient | Same local join and cleanup checks passed. |
| WaRzOnE | VM rejects the OpenGL video mode; software baseline crashes. Managed readiness correctly stays unacknowledged and failure cleanup restores DLLs. Gameplay remains unverified. |
| Steam | Awaiting user login/setup in VM. |

Reopen checks used a verified executable fixture, not the Electron application.
Voice was disabled and the asset manifest empty: these runs do not validate live
voice/TURN, equipped sticker rendering, Proton/Wine gameplay or complete launcher
exit/reopen. Managed-server MOTD filtering was separately confirmed on GoldClient
and NextClient; both reached team selection without the welcome window.

The latest Linux binary regression run passed 87 tests, with 2 optional tests
ignored. Windows tests were rebuilt after the standalone Steam-detection change and
passed in the VM: 79 passed, 3 ignored. Test-owned scheduled tasks, loopback
firewall rules, mock API and SSH tunnel were removed/stopped afterward.

## Unified CS1.6 launch path (2026-11-04)

Desktop match/reconnect and CS1.6 partner launches now always hand off to Rust.
Browser-helper CS1.6 launches also always use Rust. The old Electron CS1.6
launch routine and partner fallback were removed; the legacy Electron runtime
rejects CS1.6 launch requests. CS1.3's existing match adapter remains separate.

The desktop setting is now **Close launcher while playing**, translated in all
eight languages. Unset preferences default to enabled; explicit saved false
preferences remain disabled. This preference changes only Electron's lifetime.
The web helper no longer exposes a switch for the retired Electron game path.

- Enabled: commit plus parent EOF transfers ownership; the helper reopens the
  verified launcher after cleanup.
- Disabled: the same helper receives an explicit release, keeps a private control
  pipe, reports voice connection status, and accepts validated live preferences.
  Closing the launcher or requesting a stop waits for native cleanup. It does
  not start a second launcher on normal game exit.
- Match activity, game-exit callbacks and voice ownership use the retained helper
  session. Stop requests remain bound to that session; Rust holds the actual game
  process handle. Proton/Wine forwards stop to its Windows supervisor and waits
  for restoration.
- Native HUD selection is independent of launcher visibility. Crosshair, kill
  cards and voice preference changes reach the retained helper.

Validation: 18 targeted JavaScript tests passed; Linux Rust binary tests passed
88 with 2 optional tests ignored; Windows VM tests passed 80 with 3 ignored.
TypeScript and targeted ESLint checks passed. ARM64 helper source checking and
cross-compilation completed using the approved ARM64 inspector/module bundle;
packaging tests verify the ARM64 ELF target and hash. No Asahi gameplay test was
performed: the user will test on their own device, including Steam/FEX/muvm.
The earlier Steam, live audio, equipped-sticker and actual launcher-reopen
validation gaps remain. This is an explicitly accepted experimental default.

### Pending deployment scope

Do not deploy until the user requests it. Include the **admin app's pending
changes**, alongside the relevant client/web helper, private native helper and
backend/server-plugin changes. No deployment or release was performed here.

### Partner web blank-lobby report

The Nov 4 23:54 feedback screenshot showed the home shell and sidebars with an
empty scene. Its logs did not identify a scene error or establish the cause.
A separate shared-UI fix bounds optional IndexedDB cache waits, makes prepared
model persistence non-blocking, and observes transaction completion before
awaiting requests. Loading/render failures and WebGL context loss now retain a
translated status and Play action in the home area; readiness follows a rendered
frame with nonzero canvas dimensions. All eight locales are included.

23 cache, lobby-state and model-preview regressions passed, plus renderer type
checking and targeted lint. The exact reported production session was not
reproduced (the partner domain returned HTTP 403 to the read-only request and
browser tooling failed to start). Include this fix in the upcoming web-client
release and verify first-open behavior on the partner host after deployment;
do not describe the cache stall as the confirmed cause of that report.
