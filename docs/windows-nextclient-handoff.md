# Windows cosmetic overlay and NextClient handoff

## Objective

Make the launcher’s Windows cosmetic/scoreboard overlay work on verified Counter-Strike 1.6 installations without preventing match connection or reconnect. Investigate NextClient separately on a Windows test machine. Keep the safe fallback released after `2026.927.2`: an unverified installation launches with its original `client.dll` and stock HUD.

## Starting state

- Client repository: `16competitive-client`, current base commit `14a9e7f` (`fix: restore interrupted Windows installations for 2026.927.2`). The user says that fix was committed and released. Check the current branch and worktree before continuing.
- Private native helper: sibling `../16competitive-helper`, `cosmetic-module/README.md`, signed helper pinned in the client as version `0.1.12` at the time of this handoff. Do not copy its Rust module into the public Electron repository.
- Backend `../16competitive` is reference-only unless the user explicitly requests backend changes.
- The current worktree has **uncommitted** client changes that re-enable the Windows overlay only for two `client.dll` hashes already verified by the private helper. Do not release these changes before an end-to-end Windows match and reconnect test.

## Incident evidence

The attached reports are at `/home/keenplify-fedora/.codex/attachments/042a8a06-5f28-4fd1-814e-d91b8fa07019/Pasted text.txt` on the Linux machine. The most useful report is Amir_Drun, created `2026-09-27T14:49:08.803Z`, client `2026.927.2`, match `e1b98a3d-e9fb-42ce-94d0-e2bdb65965f4`.

Four launches from `C:\games2\CS 1.6 - NextClient\cs.exe` exited after about two seconds with Windows code `3221225477` (`0xC0000005`). Every launch logged `[Scoreboard] in-game board prepared` before the game crashed. The native log ends while NextClient's `nitro_api` is loading `cstrike\cl_dlls\client.dll`; it also records failed static hooks for `UserMsg_SetFOV`, `UserMsg_CurWeapon`, and `UserMsg_DeathMsg`. Those warnings locate the crash phase but do **not** prove the exact faulting instruction. The server's five-minute deadline then expired. The launcher log says `usesSteamEmulation:false` for this `cs.exe` installation. The official NextClient project documents launching via `cstrike.exe`, so identify the affected distribution/version before assuming it is identical to an official build.

Another report, Saiyajin7, shows the Steam installation reaching and completing a match with the 2026.927.2 overlay. One earlier report shows `cstrike\cl_dlls` missing after reinstall, so an absent DLL must remain a nonfatal stock-HUD fallback. A quick read of `sg` logs did not reveal a separate server reconnect rejection for Amir_Drun; the client crash is the strongest available evidence.

## Native compatibility finding

The private helper's Windows probe admits **only** these two SHA-256 hashes of the original 32-bit `cstrike\cl_dlls\client.dll`:

| Build verified by helper          | SHA-256                                                            |
| --------------------------------- | ------------------------------------------------------------------ |
| Steam Half-Life client            | `ef7a0f40989cb79ba95d40f528534da36866892ee871147ca82e133b7a5edc3d` |
| WaRzOnE / Xtreme V6 shared client | `733d4b48a64991d2cd2a60c20d99f72b6533cc401c47f97cc0e6073bd482b6dc` |

See `../16competitive-helper/src/skin_probe.rs` (`prepare_windows`) and `../16competitive-helper/cosmetic-module/README.md`. Their original DLLs have the 87 export names and ordinals expected by the Rust proxy. The 2026.927.2 Electron installer omitted this admission check and installed the proxy over arbitrary Windows `client.dll` builds.

The Windows module is a proxy installed at `cstrike\cl_dlls\client.dll`; it forwards most exports to `<game root>\client_original.dll` and wraps `F`, `Initialize`, `HUD_GetStudioModelInterface`, `HUD_Redraw`, and `HUD_Key_Event`. `16competitive\cosmetic-install.json` records hashes for safe restoration. The hotfix restores a leftover proxy before a later Windows launch.

## Public NextClient sources checked

- [NextClient](https://github.com/CS-NextClient/NextClient): it requires a separate copy of Steam's legacy engine build 8684, loads `cstrike\cl_dlls\client_mini.dll` and `nitro_api2.dll`, and hooks client callbacks including `HUD_Redraw` and `HUD_GetStudioModelInterface` (`nextclient/launcher/src/next_launcher/ClientLauncher.cpp`, `nextclient/client_mini/src/main.cpp`). Its client hooks can conflict with a second proxy, but source inspection alone cannot establish the crash cause. The official source does not contain the player's `client.dll` binary.
- [NextClientServerApi](https://github.com/CS-NextClient/NextClientServerApi): offers NextClient detection, separate model/sound precache, file upload, viewmodel effects, and HUD sprites. This may support a separate server-controlled cosmetic path. It is **not** an API for handing the existing live React scoreboard PNG to the client, and would require backend/game-server work rather than a launcher-only DLL fix.

Local read-only clones on the Linux machine were made at `/tmp/codex-nextclient` and `/tmp/codex-nextclient-server-api`; clone again on Windows if needed.

## Uncommitted client changes in progress

- `src/main/game/windows-cosmetic-compatibility.ts`: exact-hash admission for the two helper-verified clients, with a separate NextClient module check that keeps its stock HUD even if the stock DLL hash matches.
- `src/main/game/windows-cosmetic-installation.ts`: restore a prior installation, hash the original DLL, and return `null` without modifying the game if it is unverified.
- `src/main/game/scoreboard-overlay.ts` and `src/main/game/cs16-launcher.ts`: call the Windows overlay installer again; unsupported clients retain the stock HUD.
- `scripts/windows-cosmetic-compatibility.test.mjs` and `package.json`: compatibility gate test.

Linux `npm run typecheck:node` and `npm run test:scoreboard` passed after these changes. They do not prove a Windows launch. `git diff --check` passed before this document was added. No new helper release, backend change, package version bump, commit, or deployment was made by this handoff.

## Windows investigation and acceptance checks

1. Use a **copy** of the affected game directory, or a disposable installation. Record the selected EXE, NextClient version, engine version, and whether it is the official `cstrike.exe` build or a `cs.exe` repack. Record SHA-256 of the original `client.dll`, `client_mini.dll`, `nitro_api2.dll`, and `hw.dll` using `Get-FileHash -Algorithm SHA256`.
2. Capture the original DLL's PE exports and ordinals (`dumpbin /exports client.dll` or an equivalent PE tool), plus the proxy's exports. Check `client_original.dll` resolution from the EXE root. Do not admit a build solely because the export names happen to match: runtime hook behavior also needs testing.
3. Obtain a crash dump for the 2026.927.2 proxy crash if possible. In WinDbg, `!analyze -v`, `.exr -1`, `k`, and `lm` should identify the faulting module/address and loaded DLL paths. Keep user tokens, match passwords, and private data out of shared logs.
4. Confirm the released hotfix reconnects with the stock DLL. Then test this worktree on the two admitted builds: initial connect, exit, forced reconnect, launcher restart during a match, Steam handoff, and restoration of the original DLL after exit. Verify the scoreboard and crosshair actually render; a successful process spawn is insufficient.
5. Test the affected NextClient build with the admission gate: it should log an unsupported client hash, leave `client.dll` untouched, and connect/reconnect with stock HUD. **Do not add its hash to the allowlist** until a native compatibility change has been proved in a private copy with repeated launches, reconnects, map changes, and clean restoration.
6. If NextClient-specific integration is needed, prototype it in the private helper or through its documented server API. Keep the scanner separate and avoid broad anti-cheat exemptions. Any server-side API implementation needs an explicit request to modify the backend.

If Windows tests fail, retain the released stock-HUD fallback and share the DLL hash, export listing, and sanitized dump analysis before changing the native ABI.

## 2026-09-28 official NextClient follow-up

- The user's official `C:\Games\CS 1.6 - NextClient\cstrike.exe` 2.5.3 launches and joins, with `client_mini.dll` and `nitro_api2.dll` loaded. Its stock `client.dll` has the same hash as the Steam build, but the NextClient-specific gate still correctly leaves the proxy disabled. The launcher log says `NextClient uses its own client hooks; using stock HUD`; the missing custom scoreboard is an intentional compatibility fallback, not evidence of a missing feed.
- On a fresh installation, `prepareVoicePtt` created `cstrike\config.cfg` before GoldSrc initialization with only the managed K/V binds. GoldSrc then saved `unbindall` and no ordinary controls. The client now skips writing an absent config and relies on the match config for voice commands. A regression test covers that first-launch path.
- A recovery `cstrike\userconfig.cfg` was added to the user's installation with binds copied from their installed Steam CS configuration. It includes `TAB`/`+showscores`, movement, weapons, mouse and `crosshair "1"`. The running game can apply it with `exec userconfig.cfg`; a fresh game should execute it from `config.cfg`.
- The client now maps the configured crosshair to NextClient's own documented `cl_crosshair_*` controls in the match config, without installing a DLL proxy, and restores prior settings after exit if they remain unchanged. NextClient only offers discrete native sizes and shapes, so this is an approximation of the React crosshair profile.
- The private helper's opt-in Windows probe can prepare a `cstrike.exe` NextClient copy. At this point the live game was still active, so the custom scoreboard remained gated pending the separate test recorded below.

## Isolated official NextClient runtime result

After the user's game ended, the opt-in helper prepared a private copy at `%LOCALAPPDATA%\PapamoProbe-NextClient`. It removed copied personal configs and the match config, preserved the original installed game, and replaced only the private copy's `client.dll` with the Rust proxy. The copied `cstrike.exe` crashed during startup with `0xC0000005`. A second launch omitting `-steam` reproduced the same fault. Both Crashpad minidumps report `client_mini.dll` at RVA `0xC0BC` as the faulting module; disassembly shows it writing to `[ebx-1]` when `ebx` is zero.

The corresponding [NextClient source](https://github.com/CS-NextClient/NextClient/blob/main/nextclient/client_mini/src/color_chat_in_console.cpp) scans byte patterns in the loaded `client.dll` and patches the found address without checking a failed lookup. This is consistent with the proxy lacking the stock code pattern. The evidence is sufficient to keep the production NextClient proxy gate closed; it is **not** sufficient to add a binary patch or claim a safe native integration. NextClient's own cvars remain the safe path for an approximate crosshair. A custom TAB board needs a separate, verified integration path rather than forcing the current proxy into NextClient.

A control run restored the original DLL inside the private copy and reached a local `de_dust2` map. The command-line native crosshair cvars were present in its generated `config.cfg`, including `crosshair "1"`, but the test did not visually verify a live-player crosshair because automated keyboard input did not advance the local team menu. The private test process was closed. The user's installed original `client.dll` still hashes to `ef7a0f40989cb79ba95d40f528534da36866892ee871147ca82e133b7a5edc3d` and was never replaced.

A separate [external React overlay proof](windows-nextclient-react-overlay.md) now renders over a windowed private NextClient game without replacing `client.dll`. It is a timed, click-through badge only; it is not the scoreboard or a match integration.

## Native NextClient HUD direction after fullscreen test

The external Electron badge did not appear over the private copy started with
`-full -w 800 -h 600`; do not treat a topmost desktop window as a fullscreen
solution. The upstream NextClient source exposes a more direct path:
`nextclient/client_mini/src/main.cpp` subscribes to NitroAPI's
`ClientData::HUD_Redraw` callback, and its `HUD_RedrawPost` calls
`GameHud::Draw`. `nextclient/client_mini/src/hud/GameHud.cpp` already composes
HUD elements including a crosshair. Valve's public GoldSrc client source
confirms `HUD_Redraw` is invoked each screen frame. Thus, a narrowly modified
NextClient `client_mini.dll` could render a locally supplied, bounded HUD image
in the game renderer, including fullscreen, without replacing the stock
`client.dll`. This is an architectural inference, **not yet a built or tested
NextClient overlay**.

The first proof should be in a disposable copy: build the upstream 32-bit
NextClient component with an opt-in development-only PNG badge; preserve the
stock DLL and other NextClient files; launch windowed and fullscreen; test
map change, disconnect/reconnect, and clean rollback. Only then investigate
TAB press/release, stock-board suppression, fresh authenticated scoreboard
data, and production packaging. Keep the normal helper scanner read-only and
the NextClient proxy admission gate closed throughout. Do not use a binary
patch or allowlist shortcut to work around `ColorChatInConsolePatch`.

On this machine, Visual Studio 2022 Build Tools and its bundled CMake are
present. The temporary upstream clone now has its `vcpkg` and
`dep/NclNitroApi` submodules initialized, but vcpkg packages and Git LFS
assets have not been fetched or built. The clone currently follows upstream
2.5.4.1, while the installed game is 2.5.3. The exact 2.5.3 tag
(`cef4a59b8ba8681769e8dda3f50dc28a2aa5aae8`) has been fetched and
contains the same `HUD_RedrawPost` and `ColorChatInConsolePatch` entry points;
a private runtime proof should build from that tag before modifying or
replacing any component.

## 2026-09-30 production integration

The private helper now pins upstream NextClient commit
`9eef60908fb874843f7e9aa68a0e91c0743a402a` and CI builds a narrow custom
`client_mini.dll` host from source. The host loads the separately signed Rust
cosmetic module through a versioned ABI; it does not replace or proxy
NextClient's stock `client.dll`. The fullscreen native GUI proof passed with the
texture-free Rust/OpenGL path, so React-to-PNG is not part of this integration.

The Electron launcher verifies both release assets, transactionally backs up
and replaces `client_mini.dll` only for the active match, starts NextClient with
`-noupdate`, and restores the original afterward. The setting is opt-out. If
NextClient exits abnormally during the first 45 seconds, the launcher records a
compatibility opt-out, restores the original DLL, and retries the match without
the helper. Installation or telemetry failure is never a cheating verdict.

NextClient's crosshair is explicitly outside the launcher overlay. The launcher
neither writes `cl_crosshair_*` values nor suppresses the native crosshair;
settings direct NextClient players to its built-in crosshair editor.

Cosmetic model replacement is also runtime-gated by the authenticated
scoreboard feed and an exact comparison between NitroAPI's current remote
address and the IPv4 match endpoint pinned by the launcher. The native module
returns the stock model before that feed is fresh, after it expires, or when the
player connects to any server outside the active 1.6 Competitive match. A
hostname-only endpoint fails closed to unchanged NextClient.
