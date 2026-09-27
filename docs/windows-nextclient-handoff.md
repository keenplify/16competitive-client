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

| Build verified by helper | SHA-256 |
| --- | --- |
| Steam Half-Life client | `ef7a0f40989cb79ba95d40f528534da36866892ee871147ca82e133b7a5edc3d` |
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
