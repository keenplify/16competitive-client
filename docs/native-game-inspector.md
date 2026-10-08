# Private anti-cheat helper

The Rust project lives beside this repository at `../16competitive-helper`. It is
intended for a private GitHub repository. This public project contains the typed
process supervisor, signature verifier, and player UI. It has no Rust source,
cheat hash list, module baseline, hardware collection rules, or server scoring rules.

## Local development

With access to the private sibling project and stable Rust installed:

```text
npm run test:helper
npm run dev
```

`npm run dev` automatically runs `npm run build:helper` through the `predev` lifecycle.
If the Rust build fails, development startup stops.
On Fedora, the Linux x86 cosmetic module needs the 32-bit C development files,
OpenGL runtime, and Rust target. Install them once with:

```sh
sudo dnf install glibc-devel.i686 libglvnd-glx.i686
rustup target add i686-unknown-linux-gnu
```

Missing `glibc-devel.i686` appears as linker errors for `crti.o`, `crtn.o`,
`-lc`, and other 32-bit system libraries. Missing `libglvnd-glx.i686` leaves
the in-game overlay without the 32-bit `libGL.so.1` runtime. The installed Rust
target alone does not provide those files.

`HELPER_SOURCE_DIR` can override the sibling source location. `build:helper` builds
the latest sibling helper source with the cosmetic feature and, on Windows/Linux
x64, the x86 cosmetic module. Both are staged under ignored `resources/native/`.
After a successful build, the client records the helper checkout's commit per
platform/architecture. Subsequent runs skip building and staging when that commit,
the build script, and the staged binaries are unchanged. This compares the local
helper `HEAD`; it does not fetch remote commits. Dirty checkouts (including
untracked files), missing/replaced outputs, or missing build records rebuild.
The first run after this change builds once to create the record. Use
`npm run build:helper -- --force` to rebuild after changing toolchains or build
environment settings without changing source.
On Windows, `COSMETIC_MSVC_TOOLS_DIR` may point to a directory containing
`llvm-lib.exe` when the Visual Studio library tool is unavailable. Rust tests
run in the private project with `cargo test --locked`. Public protocol/signature
tests need no access to the private repository.

`npm run dev` defaults to `http://127.0.0.1:3000` and its local WebSocket.
Local development accepts an unsigned helper. It filters remote matchmaking nodes
and rejects remote WebSocket handoffs. Explicit remote/production API or WebSocket
overrides require an approved signed helper before the login UI/session restore
can connect, even in development. For that mode, stage the pinned signed release
with `npm run prepare:helper`; `npm run build:helper` produces only an unsigned
local development binary. Remote HTTP/WS is rejected. Packaged launchers require a signed helper and HTTPS registry.
The helper is required before starting a competitive game. A missing development
binary now requires `npm run build:helper`; there is no JavaScript scanner fallback.

## Ownership and authentication

The Rust helper owns installation hashing, loaded module enumeration, known hash
checks, executable region inspection, process identity checks, Windows handoff
process discovery, hardware fingerprinting, and evidence uploads. It sends match
observations directly to `/auth/anti-cheat/observations`, using the existing
server-authenticated player and match-membership checks. Device checks and
hardware-enriched client telemetry are also sent by Rust.

Electron passes a bearer token over the helper's private stdin pipe. It never
appears in process arguments or inherited environment variables. A token change
is forwarded over that pipe; logout stops the session. This currently uses the
account session bearer, not a scoped capability or remote attestation credential.
The helper has only that session's authority, and the token remains sensitive.

The child has a minimal environment and returns only bounded status messages.
Electron retains authentication, game launch/cleanup, launcher watchdog, helper
supervision, and the ban/match-termination UI. General GPU/OS telemetry comes from
Electron; Rust adds the hardware hashes and uploads it. Raw hardware identifiers
are never returned to Electron or uploaded.

The session protocol uses one bounded JSON line per command on stdin and status
events on stdout. Rust scans serially, caps modules, signals, file hashing, memory
maps, and HTTP timeouts, and deduplicates successfully uploaded runtime evidence.
EOF on stdin ends the helper. A watchdog detects an unresponsive helper; Electron
attempts one restart, then closes the game with a repair message. It does not ban
players for helper failure. A backend outage causes failed-upload status, not a
cheat verdict.

## Signed releases and database approval

`helper-release.json` pins the helper version, Ed25519 public key, and HTTPS
registry origin. The public key is intentionally public. Never put a private key
or a GitHub/publisher token in this file.

1. Publish a `v<version>` tag from the private helper repository. Its protected
   `Release` environment signs the Windows x64, Linux x64, and Linux ARM64 builds
   plus the Windows and Linux x86 cosmetic modules, and registers the signed bundle manifests
   with the backend.
2. Set the pinned version and public key in `helper-release.json` and commit them.
3. Set `HELPER_REPOSITORY=owner/private-helper-repo` locally and authenticate `gh`
   with read access. Run `npm run release:check` to verify every target without
   changing Git or publishing anything.
4. Run `npm run release` after committing changes. It runs normal client checks,
   releases the private Rust bundle, verifies every pinned native asset and backend
   approval, then builds every desktop target through GitHub Actions. It waits for
   the desktop workflow before updating the web clients. Rust source remains in the
   private repository. Reusing an approved helper version is supported.

For the client's GitHub `Prod` environment configure:

- Variable `HELPER_REPOSITORY`: the private repository's `owner/name`.
- Secret `HELPER_RELEASE_READ_TOKEN`: a GitHub App installation token or fine-grained
  token with **Contents: read** on only that private repository. Short-lived App
  tokens should be minted by a CI step if used; do not store expired tokens.

The public release workflow downloads binaries only. The packaging hook verifies
the signature, version, target, byte size, SHA-256, and backend approval before
copying the helper, platform cosmetic module, and signed manifest outside ASAR.
Failure aborts packaging.
No signing or backend publishing credential belongs in the public client workflow.

Packaged clients and development clients configured for a remote backend verify the signed file before starting the helper and periodically
during the match. Registry approval is cached for at most 60 seconds. Revoked or
unknown releases are refused; a registry outage also prevents a new verified
session. Signature/hash verification does not prove that memory is unmodified or
that an attacker follows this source code. Modified clients can omit these checks.
Server evidence remains authoritative.

## Initial setup still required

The public-key field is deliberately blank until you create the production signing
key. Official packaging and `release:check` fail with a setup message until it is
configured. The backend needs migration `0054_helper_releases`, the matching public
key, and a release-publisher credential. See the private helper README for exact
setup and API details. No migration, GitHub secret, release, or deployment is
created automatically by this source change.

Windows native runtime and live game compatibility must be checked on the Windows
CI runner and a test client. macOS helper releases are not currently supported.

### Coordinated client and helper release

`npm run release` requires clean, committed client and sibling
`../16competitive-helper` checkouts, GitHub CLI authentication with access to
the private repository, and permission to push both repositories.

The command increments the helper patch version in Cargo.toml and Cargo.lock,
runs its locked Rust tests, commits the version changes, and pushes the helper
branch and release tag. It waits up to 45 minutes for the private release
workflow to build, sign, and register all helper and cosmetic targets. It then updates
helper-release.json and verifies all binaries, signatures, and backend approvals
before committing and tagging the client release. It waits up to 60 minutes for
all Windows and Linux desktop packages to finish, then runs the web deployment steps.

If the helper version is already ahead of the client pin, retrying resumes that
version instead of incrementing it again. Existing tags are never moved. If
Actions fails, follow the printed run URL and fix/retry that workflow first.
No signing or registry publishing secret is required on the release workstation.


## Regional routing and operational failure reports

The launcher passes the match host API to the helper session and uses that same
origin for periodic signed approval checks and screenshot review requests. Session
recovery retains the original match origin. Outside a match, startup verification,
device checks, telemetry, and automatic issue reports use the saved usable region
or the lowest measured latency region. `/nodes` discovery is public and works
before login. Production node URLs must use HTTPS. Service selection is cached for
60 seconds and invalidated when region preferences change. If discovery fails,
the configured bootstrap API remains the fallback.

Signed helper verification is unchanged: local binary hashes and pinned signatures
must pass, and the selected backend must approve the exact manifest. Approval
caches are scoped to origin and release. An explicit rejection, mismatched manifest,
or failed approval request never becomes approval through fallback.

Operational helper failures automatically enter the existing admin issue reports.
The launcher queues the occurrence time, failure stage, launcher/helper versions,
OS release and architecture, match/distribution, API origin when known, retry count,
exit status and sanitized error details. It does not persist helper control-channel
messages or raw helper stdout/stderr. The existing issue-report upload attaches
redacted launcher and game diagnostics available at submission time; these may be
from a later launch when the original failure occurred offline.

The local `anticheat-failure-reports.json` queue is restricted to 32 records, expires
after seven days, and deduplicates each stage/match/version/account per hour. Failed
uploads retry every minute and after sign-in. Pre-login incidents wait for login
and bind to the first submitting account. Operational reports are diagnostic
information, not cheating verdicts or automatic bans.

Backend `HELPER_SIGNING_PUBLIC_KEY` and `HELPER_RELEASE_PUBLISH_TOKEN` configure
release registration. Regional readers can serve already-approved releases from
the shared database without publisher credentials. Demo recording uses optional
`ANTICHEAT_RECORDING_SCORE_THRESHOLD` (default 20) and
`ANTICHEAT_DEMO_STORAGE_PATH` (default `data/anticheat-demos`); the service account
must be able to write that directory.
