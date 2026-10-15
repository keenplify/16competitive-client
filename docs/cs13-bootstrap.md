# Counter-Strike 1.3 bootstrap

The app remains **1.6 Competitive**. Matchmaking recognizes a separate
**1.3 3v3** mode (`cs13_3v3`), with six players and requested MR12 regulation:
12 rounds per half, first to 13. Existing Legacy modes remain 1.6 movement
emulation. All three admin access switches default to off and can be toggled independently.
A separate native Linux server adapter and AMXX controller now provision custom
rooms, enforce token-based rosters and apply MR12 with MR3 overtime. The selected
1.3 client connects through Wine on the verified Linux host.

Custom-room mode contracts include `cs13_3v3` on the client and API, as **Legacy 1.3**, with five
slots per team by default and independently editable capacities of 1–8 per side.
The matchmaking queue remains 1.3 3v3. The map catalog response includes the independently
enabled `customModes` list, so the Create room and room settings mode dropdowns
follow the admin's Custom Games toggle even if matchmaking is off or no maps
have been configured. With no maps, Create room shows a translated map-field
placeholder and disables creation. An enabled map with explicit `cs13_3v3` pool
membership is required. At the user's request, existing `cs16` GoldSrc map entries
can share that membership; `cs13` entries remain restricted to 1.3 modes. Older APIs fall back to modes
advertised by their map pools. The dedicated 1.3 adapter requires the native pre-Steam runtime and the selected
map to be installed; it never dispatches this mode to the 1.6 adapter.

## Installation and onboarding

Settings → General includes a separate **Counter-Strike 1.3** installation picker,
a normal game-menu launch, and the requested canonical
[ModDB download page](https://www.moddb.com/mods/counter-strike/downloads/counter-strike-13).
The page distributes a mod for Half-Life Retail; the UI explains the base-game
requirement rather than implying it is a standalone engine installer.

Onboarding asks whether the player wants to set up 1.3 after selecting 1.6.
“Yes” shows the same folder controls and download link. “Not now” and “Skip 1.3
setup for now” continue without requiring a 1.3 installation. A player who chooses
“Yes” must select a valid folder before continuing, or explicitly skip.

The selected real path and mod directory are saved separately in `cs13-installation.json` under
Electron user data. It never replaces the selected 1.6 path. The renderer uses
Zustand and typed, argument-free IPC. All new copy is translated into the eight
supported languages. Native dialogs contain only the game/version identifier.
Browser mode exposes no local 1.3 setup or launch controls.

## Adapter boundaries

- Accept the installation root or its `cstrike` / `cstrk13` subfolder. For a root
  containing `cstrk13`, select that community-layout directory explicitly.
- Require one `version "1.3"` entry in the selected mod's `liblist.gam`, a direct
  executable and a client library. Version metadata is evidence, not binary
  attestation or proof of protocol compatibility.
- Windows uses `hl.exe` and `client.dll`. Linux supports native `hl_linux` and
  `client.so` when present, or the Windows pair through a fixed `wine` command.
  Wine must already be installed. No native Linux pre-Steam client has been
  verified by this work; the Linux `.so` in the supplied `cstrk13/dlls` is a
  **server** game library.
- Revalidate on launch, bound metadata reads, reject missing files and symlinks
  escaping the root. Never change Linux executable permissions automatically.
- Menu launches use `-game <validated-mod-directory>`. Match startup sends a
  validated 24-character hex password and a resolved IPv4 connect endpoint.
  After connection, the server requests one exact launcher-owned session file,
  whose `cmd 16c13_auth` command carries a 32-character hex digest of the backend
  roster token. Saved legacy userinfo cannot override this post-connect exchange.
  The private file is removed on exit or failed/cancelled launch; unknown changes
  and symbolic links are preserved. No copied 1.6 settings are applied. Optional shared native enhancements are described below. Legacy cosmetics
  use the separate server path described below.
- Ordinary launches share the existing cleanup/launch queue, are blocked during
  matchmaking and are released from match monitoring. Managed session variables
  and `LD_PRELOAD` are not inherited.
- Never read, write, copy or otherwise manipulate `config.cfg`.

The spawn-success notice means a process started, not that the menu rendered.
Wine rendering was subsequently verified on the local Linux host as described
below. Windows rendering remains unverified. A real Wine client authenticated and joined
the native protocol-45 server during local validation.

### Linux Wine display scaling

The pre-Steam menu draws at 640×480 even when a larger game resolution is supplied.
Simply enlarging Wine's virtual desktop leaves the menu in a corner. On Linux,
when `/usr/bin/gamescope` is executable, ordinary Wine launches now use Gamescope
in fullscreen at the launch monitor's logical size, wrapping a named Wine desktop
initially sized 640×480. Gameplay requests OpenGL at 1280×960. Gamescope preserves
4:3 proportions with side bars on widescreen displays. This path was visually
verified on the user's 1920×1080 GNOME Wayland desktop, including running gameplay.
The named desktop avoids changing global Wine desktop preferences. All parameters
are spawn arguments; no player configuration files are read or written by the
launcher. Without Gamescope, the existing direct Wine launch remains available.
Windows and native Linux launches retain their existing arguments. This verifies
local display behavior, not matchmaking or pre-Steam server authentication.

## Experimental native DLL bridge test (2026-10-15)

The user supplied `/home/keenplify-fedora/Downloads/linux_bridge`, distributed at
[ModDB](https://www.moddb.com/games/half-life/downloads/play-any-mod-under-linux-build-dll-bridge).
Its `cl_dlls/client.so` and `dlls/bridge.so` are Linux i386 libraries that use
`libgoldsrc_pe.so` to load Windows DLLs. This is a binary compatibility bridge,
not a native port of the 1.3 client.

An isolated installation was prepared at
`/home/keenplify-fedora/.cache/16competitive/cs13-native-bridge-test`, using the
installed native Steam Half-Life engine, a copy of `goldsrc-sierra/cstrk13`, and
the bridge. Copies excluded `config.cfg` and symlinks. Original Steam and Sierra
installations were not modified. Library dependency resolution succeeded without
installing packages.

With Steam running, native GoldSrc build 10211 initialized OpenGL and the bridge
loaded the Windows 1.3 client DLL. It then crashed before the game menu. A second
run under GDB reproduced `SIGSEGV` at address zero in `CBaseUI::Start`, through
`VGuiWrap2_Startup`, immediately after the bridge's `VClientVGUI001` legacy-VGUI
interface query. This points to a UI-interface compatibility problem; no working
gameplay or server connection was demonstrated. The engine reports protocol 48,
whereas the separately verified pre-Steam research server reports protocol 45.
The bridge does not establish that those protocols can interoperate.

Local evidence is retained in `native-startup-steam.log`, `native-gdb.log`, and
`bridge-provenance.json` inside that isolated installation. Do not advertise this
combination as supported or replace the selected Wine installation with it.

## Backend and server research

The sibling backend contains migration `0099_cs13_3v3`, a distinct mode policy,
editable version-aware map-pool metadata and a separate `Cs13Adapter`. Admin Maps can create game `cs13` maps and edit
membership in this mode. Local migrations and map-pool configuration were applied; no deployment was performed.

The supplied root was copied and renamed to `../16competitive/goldsrc-sierra`.
A separate protocol-45 Linux research runtime was downloaded, checksum-checked
and successfully tested with the supplied `cstrk13` server library on loopback.
See the backend's `docs/cs13-research.md` for sources, hashes, evidence and the
repeatable local start command. The test was stopped normally.

That isolated native server now also has Metamod-P 1.21p38 and AMXX 1.8.2
installed. Ten administration plugins stayed running across all six stock maps;
missing WAD resources were repaired only inside the server runtime. Match instances
load the dedicated 1.3 controller and generic AMXX engine module. YaPB uses its
legacy 1.3 path for backend-owned bots.

The backend custom-room start function was exercised successfully with two named
bots, and a real Wine client passed roster authentication against a native server.
Runtime tests verified actual bot side switching after round 12, then used
development-only round awards to exercise 12:12 and a 16:12 MR3 finish. This does
not constitute a complete six-human match or a remote deployment test.

Reconnects use the saved 1.3 connection and fresh installation validation. Pending
launches check cancellation immediately before spawning. Instance manifests retain
the adapter and mode for restart adoption; adopted instances retain the existing
runner's restricted remote-control capabilities. Full restart/rejoin gameplay is
not yet tested.

## Validation

Run `rtk npm run verify` and `rtk npm run test:launcher`. The bootstrap tests cover
Windows/Linux/Wine layouts, `cstrk13`, unsafe paths, version rejection, bounded
reads, symlink containment, permission preservation, isolated arguments, profile
persistence, changed installations, cancellation, busy actions and spawn failure.
Backend policy tests cover the mode contract, MR12 policy, explicit shared map pools and
runtime isolation and legacy UDP readiness. These fixtures do not replace real client/server compatibility
checks.

The backend join-token contract for 1.3 remains exactly 32 URL-safe characters.
Client/server adapter tests share fixed token and session-filename vectors.
A real five-bot/human run confirmed authentication, observed roster name, manual
team-change blocking, and roster revocation on the native protocol-45 server.

## Shared skins and legacy cosmetics

Both selected installations link only `models/16competitive` to the same physical
folder, `<Electron userData>/game-assets/models/16competitive`. Linux uses directory
symlinks; Windows uses directory junctions. Match downloads and catalog repair
write directly into the approved shared storage and reject nested links. Other
assets stay in the selected game's own directory.

Existing model directories are merged after checking for conflicting bytes and
unexpected entries. Their originals remain alongside the link as
`16competitive.before-shared-<uuid>` migration backups. Conflicts stop preparation
without replacing player files. New selections are wired during asset preparation.

Legacy 1.3 now uses backend-frozen loadouts and hash-verified version-10 models,
precached by the dedicated AMXX controller. It applies first-person and held
third-person models through normal engine fields. World models are precached too;
weaponbox drops retain their skin on the physical weapon across pickup. The legacy selection is capped
at 32 skin entries, excluding weapons absent from 1.3. Custom sounds and grenade effects are not implemented for 1.3. Individual 1.6 asset animation compatibility still needs gameplay checks.

YaPB match configuration explicitly sets `yb_bhop 1` and `yb_bhop_test 0` for both
adapters. This uses the fork's occasional, difficulty-scaled bunnyhop bursts.
Native 1.3 runtime tests verified the cvars and namespaced v/p model fields while
retaining roster enforcement, MR12 side swaps and MR3 overtime.

A real Wine client also passed the optional custom-knife test through a shared
model symlink, including authenticated namespaced v/p selection and continued
roster enforcement. This is not a guarantee for every catalog model's animation.

Weapon switching uses the active CurWeapon message and runs model repair after
normal game weapon processing. Switching to an unskinned knife or pistol restores
stock model paths instead of leaving the previous gun's managed model in place.
Generic AMXX fakemeta Spawn/SetModel hooks track only public weapon entity ownership
and world models; there are no private game offsets or client-side injections.

The switch/drop/pickup regression was verified on native 1.3: a skinned AK returned
to stock knife/pistol models, switched back, used its custom w model on drop, and
kept its appearance when picked up by a roster bot with no equipped skin. This
revision's fresh headless Wine probe exited before joining, so it does not add
new client-side rendering validation. Restart the backend and create a fresh room
to receive the updated controller, module list and asset manifest.

Controller 0.5 fixes a separate cache-lifetime regression across rounds: new weapon
entities could inherit a recycled edict's stock marker. Allocation/removal hooks
now reset each entity lifetime. Six native restart/purchase cycles passed along
with switch/drop/pickup checks; the previous binary reproduced the missing AK
skin. Existing rooms retain their old plugin copy, so create a new room to apply
this controller update. Equipment and the shared asset files need no changes.

## Round awards, bot joining, and room economy

Controller 0.6 ports the eight 1.6 round-end MVP awards to classic 1.3 HUD/chat:
Ace, Quad, Triple, Pain Train, Bullseye, Assistant, Entry Fragger, and Valuable
Player. The winning-side score and award precedence follow the 1.6 controller.
An AMXX dictionary supplies all eight supported languages. Native regression
checks passed for all eight awards; this does not add Wine rendering validation.

The YaPB Legacy join path now recognizes an already-spawned combat player and
clears pending team/class menus. This fixes a join race found during the bot
position investigation. A bounded native physics probe did not reproduce the
reported teleport, so that specific symptom still needs gameplay confirmation.

Custom-room settings offer a starting-money checkbox: unchecked uses $800;
checked accepts whole-dollar amounts from $800 to $16,000. FFA and Fight Yard
hide the control and reject overrides server-side. The confirmed room value is
persisted through ready checks, transfers and server recovery, and both game
adapters generate the corresponding `mp_startmoney`. Normal overtime rules still
apply. Migration `0100_custom_starting_money.sql` was applied locally. Restart
the backend/client and create a fresh match to use these changes.


## Shared helper and AMXX feature architecture

Match manifests for both game versions include the two shared ping models and
three ping sounds. The API serves these from its bundled resources and supplies
full SHA-256 hashes. Launcher preparation verifies or repairs the files before
connecting, so a stock 1.3 client does not need to fetch them through the game.
The selected map asset is also included in the legacy manifest when available.
This resource preparation works independently of native helper activation.

The Windows cosmetic helper now builds one DLL with both the modern and legacy
named export surfaces. Exact client/engine hash detection selects capabilities;
unknown pairs keep their stock callbacks. The 1.3 path avoids the modern engine
table tail and uses the existing post-connect auth file instead of modern join
recovery. Scoreboard, crosshair, pings, cards, native input and session ownership
share their existing implementations. A private real-Wine rendering test passed;
authenticated managed Wine gameplay and restoration also passed with the exact-build loader adapter.

The launcher uses the same in-game enhancement opt-in and saved ping/PTT keys.
A reconnect closes the prior managed session and creates a new fixed two-hour
ticket. Recovery records the selected fixed mod directory and hash of its private
auth file. Signature, release approval, DLL hash and endpoint checks remain
required. Linux packages include the same signed Windows helper bundle under
`native/wine`; development preparation stages it under `linux-<arch>/wine`.
The exact inspected WON engine now supports a journaled loader-path adapter:
the helper loads from `cl_dlls\16cmod.dll`, while the stock client and its independent
checksum pathname remain unchanged. Engine/client hashes must match the supported
build. Managed Wine testing authenticated on the native server, rendered a test
scoreboard and shared crosshair, then restored both originals and removed owned
session files after lease revocation. Unknown changes preserve recovery evidence.
An approved signed bundle with the `papamo_won_loader_v1` marker is required;
older bundles retain the stock HUD. Native Windows gameplay, real ping input,
teammate tags and the actual launcher-rendered scoreboard remain runtime checks.

Both server targets compile `src/amxx/16competitive_core.sma`; the legacy wrapper
selects `COMPETITIVE_PRESTEAM`. Shared features live in
`src/amxx/competitive_features.inc`, including lifecycle dispatch, MVP selection,
scoreboard serialization and award publication. Shared ping and spectator
crosshair includes use public legacy APIs through the adapter. Add common
features once, then add only API-specific reads/actions to the adapter.
AMXX 1.8.2 for native 1.3 and AMXX 1.10/ReAPI for 1.6 remain separate runtime builds.
Exact modern economy/loss-bonus reporting and ReAPI bot diagnostics are not
available through the legacy adapter.

### Custom-room friendly fire

Room owners can save a Friendly fire checkbox before the ready check. The server
validates the boolean and writes `mp_friendlyfire 0` or `1` into the managed match
configuration for both the 1.6 adapter and native Legacy 1.3 adapter. New rooms
default to on, except Fight Yard (off); FFA has no teammate damage to toggle.
Room transfers and running-server recovery manifests preserve explicit false.
Public matchmaking retains its mode defaults. Configuration generation is covered
for both adapters; no live player damage test was performed for this change.

### Windows release checks (2026-10-15)

Windows and Wine executable launches explicitly select OpenGL (`-gl`), because
the supported WON helper uses the inspected `hw.dll` loader and OpenGL HUD.
The native Windows 11 build VM passed 39 focused launcher/compatibility/recovery
tests (two POSIX-only fixture checks skipped). These cover real Windows paths,
installation/profile selection, authentication-file cleanup, shared-model junctions,
and safe cosmetic recovery. The local Windows packaging pipeline now runs this
suite before building the installer. These automated checks do not establish
visual gameplay correctness on every Windows GPU or unrecognized game build.
