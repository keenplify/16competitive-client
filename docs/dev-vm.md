# Windows VM development

On the configured Fedora host:

```sh
npm run dev:vm
```

This starts the existing `16competitive-build-win11` libvirt session VM, opens
`virt-viewer`, copies the current client and private sibling helper source into
`C:\16c-dev`, installs Windows npm dependencies if the lockfile changed, and runs
`npm start` in an interactive Windows PowerShell console. Uncommitted source
edits are included. Log into the desktop as `build`; SSH service sessions cannot
show Electron windows. The host downloads and verifies the pinned approved Windows
helper, cosmetic DLL, NextClient DLL and signed manifest using its GitHub CLI login.
The guest retains those signed artifacts; `npm run dev` would overwrite them with
unsigned native builds. Native approval still uses the pinned HTTPS registry even
when matchmaking uses the local HTTP backend. This tests current launcher source
against the released native modules, not unreleased private helper changes.
The build VM's existing credentials remain in its private setup directory; this
command does not change the Windows account or enable automatic login.

Keep the Fedora terminal open. An SSH reverse tunnel exposes the Fedora backend
at guest `127.0.0.1:3000`, including WebSockets and local asset downloads. A
development-only UDP relay inside Windows forwards guest loopback ports
27015–27019 to the QEMU host gateway `10.0.2.2`. These match the backend's default
local server pool. The API and match addresses remain unchanged; native session
and endpoint checks still apply. Start the local Fedora backend as usual. Custom
server port ranges and remote backend deployments are outside this preset.

After closing the guest dev console, run the command again to copy new host edits.
Host files are a snapshot, not a continuously watched shared folder. Edits made
inside the copied Windows source use normal Vite hot reload. Source deletion is
limited to files listed in the preceding owned snapshot manifest. Linux
`node_modules`, environment files, source symlinks, private key files, game
installations, and `config.cfg` are not copied. Windows dependency/build caches
are retained. Build/release jobs under `C:\16c-build\jobs` are separate.

```sh
npm run dev:vm -- --prepare-only # sync/install without launching Electron
npm run dev:vm -- --no-viewer    # use an already-open VM desktop viewer
```

Closing the Fedora command stops its backend tunnel; the VM stays running. Close
the game and guest dev console normally before starting another run, so managed
native cleanup can finish. Install Steam and CS/NextClient in the guest through
their normal installers, sign in there, and select that Windows game installation
in launcher Settings. Fedora's game installation is not mounted or modified.

The current build VM has a basic display adapter. Seeing Electron run or compiling
the Windows DLL does not validate the game's OpenGL renderer. If the game cannot
create a GL context, use a Windows VM with suitable graphics acceleration or a
physical Windows machine. Do not change the release VM's graphics or pass through
a host GPU as part of this command.

For enhancement verification, check the custom crosshair, hold Tab for the custom
scoreboard, check teammate tags/pings, switch spectator targets and scope modes,
reconnect, then exit the game and check native recovery. Test Steam CS and
NextClient separately. These are runtime checks; build success alone is not proof
that the native features work on Windows.
