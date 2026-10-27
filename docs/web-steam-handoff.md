# Web Play Steam handoff

Web Play requests fresh, activated manual credentials from the backend for each
launch or reconnect. It validates the response before opening the Steam URI.
The desktop launcher uses its own handoff and is unaffected by this path.

The Web Play URI queues 20 GoldSrc `wait` commands before setting the manual
identity and server password, then immediately connects. Applying credentials
after the delay avoids startup replacing them before the connection attempt.
Each credential is sent once to keep the forwarded command short. This uses
game commands only and does not access any game configuration files.

Run `npm run test:web` for simulated startup credential resets, forwarding to an
already running game, fresh reconnect credentials, invalid responses, and a
match changing while the manual connection request is pending. These tests do
not execute Steam or GoldSrc.

Before deployment, verify Windows and Linux Steam connections with CS closed
and already open. Confirm the player joins the assigned match without a password
rejection. Steam or game variants that ignore forwarded arguments may still
require closing CS first or using Web Play's copied console command.

## Native helper setup and local settings

The helper runs in the system tray with Open, Settings and Quit actions. Setup
and protocol invocations detach immediately and do not keep a terminal open;
Windows uses the GUI subsystem. Settings opens the website directly at General.
One OS file lock prevents duplicate tray icons, including after a crash. Quit
closes the tray only: active match workers still finish native recovery and cleanup.
The next browser invocation starts the tray again. Updates resume the original
launch independently, so an existing tray never holds a game or updater open.

Linux uses StatusNotifier over D-Bus with a bundled D-Bus library, without GTK or
AppIndicator library dependencies. GNOME needs its AppIndicator/KStatusNotifier
extension to display an icon. Without it, browser setup, settings and game launches
still work; the tray registers if the extension starts later. Tray startup errors
are recorded in `16competitive/helper-tray.log` under the user's config directory.
Validate with `cargo test --manifest-path web-helper/Cargo.toml --locked`, then
`cargo build --manifest-path web-helper/Cargo.toml --locked` and
`node scripts/native-helper-tray.test.mjs` on Linux.

Web Play checks the native helper on account login, opening Play, and starting a
search. Checks are deduplicated while pending. The prompt offers only Download
native helper and Continue to Play; Continue remains available during a check.
The optional helper uses its own protocol; Web Play no longer selects a cached
desktop application as its preferred launcher.

On Linux, setup refreshes the desktop MIME application database before setting
the protocol handler. Fedora/GNOME needs `desktop-file-utils` and `xdg-mime`;
`zenity` provides the native folder picker. Terminal instructions include a
short-lived, account-bound verification URL. The helper consumes it directly,
then the browser closes both setup dialogs and displays the success toast.
Setup commands expire after two minutes and refresh while the instructions stay
open. Closing setup or logging out ignores pending verification results.

A verified setup can start a five-minute-idle loopback settings bridge. It binds
only to `127.0.0.1` on a random high port, requires an independently generated
256-bit capability plus the exact approved browser Origin, and exposes only
read settings, choose a validated game folder, and save typed preferences.
There is no arbitrary file, command, or process API. Folder paths remain on the
machine and are never uploaded to account or matchmaking endpoints. Preferences
live in the helper-owned `web-helper.json` and apply to the next game launch.
CS 1.3 retains its limited resolution table; native Windows clients on Linux
still require Wine. The helper retains the stock Tab scoreboard because Web
Play does not provide Electron's offscreen image renderer.

## Helper updates

Production helper invocations check a platform-specific signed update envelope
on the client GitHub release. The pinned Ed25519 key verifies the dedicated
`16competitive.web-helper.update.v1` signature context; fixed filenames,
platform/architecture, version, size, and SHA-256 are checked before execution.
Metadata cannot redirect the download to arbitrary hosts or paths. Offline
checks retain the installed helper. Unverifiable updates never execute.

Verified updates run from a new file and preserve the original argument vector,
including its one-time setup or match link. A verified hash skips the child's
duplicate update check. Protocol registrations point at immutable helper-version
directories, avoiding Windows executable replacement locks. Active game sessions
continue under their existing helper and recovery checks.

Existing helpers need one installation of this release to gain the updater.
`npm run release:local` signs both helper update envelopes with the existing
local release key and uploads them beside the binaries. Hosted releases require
the matching `HELPER_SIGNING_PRIVATE_KEY` secret. Signing credentials never enter
build containers, the Windows build VM, or the packaged helper.

Run `node --experimental-strip-types --test scripts/native-helper-setup.test.mjs`
and `cargo test --manifest-path web-helper/Cargo.toml --locked`. On Linux, build
the helper and set `NATIVE_HELPER_TEST_BINARY` to its absolute path when running
`scripts/native-helper-bridge.test.mjs` to exercise real local folder selection
and preference persistence against isolated game fixtures. Actual Windows
installation, browser protocol consent, and game launch still require platform
verification.
