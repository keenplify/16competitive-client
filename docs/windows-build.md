# Native Windows builds

Run from the client checkout:

```powershell
npm run build:windows
```

This builds Windows x64 locally without Fedora, WSL or GitHub build runners. It
requires Node 24 or newer, npm, Git/GitHub CLI authentication, Rust MSVC, and the
Visual Studio C++ build tools. Commit source changes first so the output records
an exact clean revision. An administrator prompt opens the developer build shell
so file-symlink security regression tests can run on Windows without requiring
Developer Mode. The build log is `dist/native-windows-build.log`.

Signing credentials stay outside Git at
`%USERPROFILE%\.config\16competitive-release\credentials.json`. Its
`privateKeyPath` must point to the existing pinned Ed25519 key. The files must be
owned by the current Windows user with access limited to that user, SYSTEM and
Administrators. The build validates the ACLs and pinned public identity; secret
values never appear in arguments or logs. Preserve the protected credential files
for subsequent builds. Never put keys or publisher credentials in project env
files. An alternative credential-file location can be passed to
`scripts/build-windows.ps1 -Credentials <path>`.

The command installs locked npm dependencies, verifies the signed/backend-approved
native bundle, runs verification, web, helper, scoreboard and launcher checks, then
builds the MSVC standalone helper and Electron Windows package with validated
production HTTPS/WSS settings. Linux Proton/Bash runtime tests execute on Linux,
while platform-independent tests and Windows symlink security cases still execute
here. The cross-platform release preflight runs all Linux runtime cases too.

Artifacts are copied to `dist/windows-<version>-<commit>/`. The Windows web helper,
background runtime and renderer receive verified Ed25519 update envelopes, and
`windows-build.json` records the exact source revision, hashes and sizes. The
installer's Windows Authenticode certificate is separate from this update-signing
identity; this command does not invent or provision an Authenticode certificate.

Nothing is uploaded, published or deployed. Local build artifacts retain the
checkout's package version and must not overwrite an already published release.
Use the established release coordinator for a fresh version, all platform assets,
protected publication and matching web deployment. The native Windows artifacts
are useful for local testing and review before that release.

## Automatic game-file permissions

WON 1.3 repair changes read-only attributes only on its exact admitted OpenGL
engine. CS 1.6 repair applies to supported initial native clients and known
hash-journaled persistent module updates, including NextClient. Original backups
and ownership checks remain mandatory; unknown changes are preserved. Neither
adapter changes folder ACLs or recursive attributes, and neither accesses
`config.cfg`. Only the selected installation's process can be closed. Permission
failures use one existing UAC retry after successful cleanup; cancellation and an
already elevated attempt cannot start another elevation loop.
