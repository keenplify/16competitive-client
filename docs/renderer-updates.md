# Renderer-only Windows updates

Windows releases now include a separate renderer ASAR and an unsigned description
of its version, size, SHA-256 and installed-runtime compatibility fingerprint.
`release:local` verifies the complete local build, signs that description with the
existing locally protected Ed25519 release key, uploads the signed metadata, and
only then publishes the desktop release. Signing keys never enter the Windows
build VM or public CI workflow. This signature is an application integrity check;
it is not Windows Authenticode signing or a Smart App Control approval.

The first installer containing this updater is still required. Older launchers
cannot use the new payload. Linux keeps its existing AppImage update flow.

For subsequent releases the launcher checks the normal release metadata, then
tries the signed renderer payload. Its fingerprint must match all installed main
and preload code, application dependencies, Electron version, target architecture
and external resources, including helpers, modules and scoreboard assets. Package
version and renderer contents are the only excluded inputs. Any other difference
uses the full installer. GitHub-only releases without locally signed renderer
metadata also use the full installer.

Renderer payloads contain HTML, JavaScript, CSS and renderer assets only. They
cannot replace main/preload code or native files. Downloads are bounded, checked
against the pinned signature, size and hash, written to a temporary file, then
renamed into the user's `renderer-updates` directory. There is no installer or
executable replacement on this path. The existing installed preload stays in use.

The next launch verifies the cached payload again. A pending renderer is marked
as unconfirmed until React mounts through the existing preload. A load failure,
startup timeout or subsequent restart without confirmation restores the prior
renderer. A failed renderer version falls back to the installer on future checks
instead of repeatedly relaunching. The displayed client version follows the active
renderer; the installed native application version remains unchanged.

Full-installer attempts record their target version before quitting. If the next
launch still runs an older installed version, recovery UI offers Retry, official
downloads and translated instructions. This detects an incomplete installation,
not its cause: the installer may have been cancelled, failed, or been blocked by
Windows. No claim is made that Windows reported Smart App Control as the cause.
All restarts await the existing managed-game shutdown and DLL restoration path.

Changing helper code less often can make more releases renderer-compatible, but
changing a DLL, helper, dependency, preload, main process or Electron still needs
the normal installer. Downloading native files separately is not part of this
change. Smart App Control may still block unsigned native code.
