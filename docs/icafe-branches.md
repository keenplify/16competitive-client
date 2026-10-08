# iCafe branches

The iCafe partner signs in to the admin portal, opens **iCafe partner**, and creates
a named branch. For an individual launcher, click **Setup code** beside that branch.
In the launcher, press **Ctrl+Alt+I** and enter the six digit code. Each code works
once and expires after five minutes. The admin page automatically creates a new
code when the displayed one expires. The enrolled launcher stores its credential
with Electron secure storage and can unlink from the same panel.

For diskless clients, the partner can instead download `icafe-branch.json` and
reuse that one file across multiple launchers. The file contains a secret; keep it
private. It is tied to the branch identity, not a machine or physical location.

Place a copy in Electron's `app.getPath('userData')` directory before opening each
launcher, or use a shared path. For packaged builds the default location is normally:

- Linux: `~/.config/1.6 Competitive/icafe-branch.json`
- Windows: `%APPDATA%\1.6 Competitive\icafe-branch.json`

For diskless clients, store one config on a shared filesystem and set
`ICAFE_BRANCH_CONFIG_PATH` to its absolute path in each launcher's environment.
The launcher reads the file from that path if set. The config is tied to the
branch identity, not to a particular machine or physical location.

The main process reads and validates this file when it opens matchmaking. It sends
the branch credential directly to the backend alongside the authenticated player
session. The renderer never receives the branch credential. The backend controls
the 20% profile XP bonus at match settlement; the client cannot grant XP itself.
Before login, the launcher verifies the linked branch with the backend and shows the
branch name and XP benefit on the sign-in screen. A revoked or invalid config
does not show the iCafe banner.

The launcher refreshes activation every two minutes while its matchmaking connection
is active. Each activation expires after ten minutes. The partner portal shows
recent player activations per branch. A branch can be
revoked from that page. Revocation invalidates the config and removes current
branch sessions. A copied config can be used offsite until revoked, so protect it
as a credential. This mechanism does not prove a player's physical location.
