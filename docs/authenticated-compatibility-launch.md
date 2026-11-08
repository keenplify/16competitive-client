# Authenticated launch without native cosmetics on Windows

A clean x86 GoldSrc client can launch with the current match token even when
its exports do not satisfy the cosmetic proxy ABI. The helper keeps the signed
inspector, backend session authorization checks, two-hour session limit, owned
process lifecycle, and launcher-owned startup file. Native cosmetics, HUD,
voice and session music are unavailable in this compatibility path.

The inspected legacy GoldClient family can use its own built-in crosshair.
The helper maps validated launcher RGB, opacity, size, gap, thickness, dot,
outline, T-style and supported dynamic settings to that client's crosshair
commands in the launcher-owned startup file. No native workers or proxy are
needed. CS2 styles above 5 fall back to static style 4; colored outlines,
follow-recoil, screen-height scaling and CS2 scope-dot features have no exact
equivalent here. Disabled enhancements leave the player's crosshair alone.

This does not expand the native proxy ABI. A malformed client DLL, wrong
architecture, missing Initialize/F entry point, partial NextClient layout, or
existing managed/recovery journal still fails closed. Unknown player files are
never replaced to force compatibility. CS 1.3 and native Linux keep their
existing paths.

Legacy GoldClient-derived clients (including LQS's supplied client, reported as
TurboClient) are classified separately for launch behavior. Their full legacy
export surface enables `-noupdate` even on the authenticated fallback path;
it does not permit installing the cosmetic proxy. The modern proxy contract
still requires every modern extension callback. LQS's November 7 report from
2026.1107.8 records successful asset preparation followed by
`NATIVE_INSTALL_UNSUPPORTED` on automatic launch and two reconnect attempts.
That report predates the authenticated fallback; it is not evidence of a
game-process crash or a failed automatic-launch trigger.

Static Ghidra inspection of the supplied DLL (SHA-256
`7c9b6e10b0d896d5c99bb0175fff4e8a13834f3e3ae9948e5ccbbf3c1bfdba9d`)
also confirms a nonstandard initialization ABI: at RVA `0x30df0`, argument two
is dereferenced as an interface object and argument three is compared with
version 7. Valve's SDK uses two arguments, with the version in argument two.
Both the supplied engine and client contain `VGUI_Surface026`, `GameUI007`
and `GameConsole004` interface names. This is not evidence that VGUI2 is
absent; nor does it prove compatibility with a newer native scoreboard.
Keeping the original engine/client pair avoids routing this initialization
through a standard SDK proxy. A later private-helper adapter was verified in a
matching isolated Windows probe, including the custom scoreboard, crosshair and
shutdown fix. This does not enable production native installation or establish
authenticated-match compatibility. See the [November 8 diagnosis record](https://www.papamo.dev/docs/papamovgui2/legacy-goldclient)
for the exact hashes, ABI differences, opacity bug, crash causes and retest steps.
A mixed-resource crash remains separate from the recorded preparation rejection.

The startup file repeats the current token and password before connecting;
legacy hyphenated credentials remain intact. It is removed at session end.
The helper reports COSMETICS_UNAVAILABLE_CONFIG_AUTH, saved in account-scoped
launch history without paths, binaries, raw arguments or credentials.

The helper also preserves the Electron adapter's standalone Windows GTProtector
workaround. After stopping the previous game under the installation ownership
lock, it moves only `GTlib.asi` and `GTProtector.asi` (case insensitive) into a
unique `16competitive/disabled-gtprotector/backup-*` directory. Original bytes
and earlier backups are retained. Steam and NextClient installations are skipped;
links and reparse points are rejected. This prevents the legacy `Find Cl/En/St
Modules Error` popup observed with WaRzOnE. It does not disable the signed
competitive inspector or change its checks.

The server additionally recovers a missing token after ten seconds using a
unique address captured by that match's authenticated ready response. This is
an explicitly requested availability tradeoff; addresses are weaker than
credentials. Shared/ambiguous addresses and occupied/revoked slots are rejected.
See the backend docs/missing-token-recovery.md for admission behavior and tests.

Some standalone repacks ship an empty `cstrike/valve.rc`. GoldSrc then opens
the menu without processing the helper's `+exec` argument. On Windows, after
the previous game has stopped, the helper temporarily fills only that empty
script with its marked `stuffcmds` bridge. The existing launcher-owned session
file still supplies the backend-issued identity and connection credentials.
Steam, NextClient, missing scripts, and unknown nonempty scripts are untouched.
Cleanup uses the retained file handle and restores the original empty content
only while the bridge bytes still match; player edits and replacement files
are preserved. An exact bridge left by an interrupted session can be reused
and cleaned up by the next launch. This never accesses `config.cfg` and does
not bypass the inspector or any native-module approval checks.

### Windows VM validation (November 8, 2026)

Fresh Cybersports Russian Original and WarzoneCS downloads both shipped empty
startup scripts. With the patched helper, both connected to live private test
matches, received team 1 from the server, and visibly spawned. Cleanup returned
both scripts to zero bytes. Test copies excluded the player-owned configuration;
original installations were untouched.

Additional OpenGL checks use per-copy Mesa llvmpipe in the Windows 11 VM. Test-only
startup bindings enable Tab and weapon selection without accessing player config.
Russian Original displayed the custom crosshair, native Tab board and equipped
Emberborn Glock. The optimized published helper completed a two-sticker recipe
and wrote verified model/texture sidecars; the debug helper exceeded the sticker
bake deadline. These VM checks do not establish hardware performance or identify
the downloaded distribution as LQS's exact installation.
