# Local releases

Run `npm run release:local` from a clean client checkout. `npm run release`
continues to use hosted build runners. Both commands publish the same GitHub
Releases, updater metadata, and web clients. Workflows are dispatched explicitly
by the command; pushing a tag alone no longer starts a hosted build.

The local command checks Docker, GitHub CLI authentication, the Windows build VM,
and production endpoints before creating tags. Linux x64/ARM64 builds run on the
Fedora PC in Debian Bookworm containers; Windows builds run in the dedicated
`16competitive-build-win11` KVM VM. Source is transferred as an archive of the
exact committed revision, without `.env` files or GitHub credentials. The normal
launcher checks and native tests still run. Partial or modified artifact caches
are rebuilt rather than published.

Build state is under `~/.local/share/16competitive-build/`. The VM has six CPU
threads, 8 GB RAM, a 120 GB virtual disk, UEFI and TPM 2.0. It uses the official
Windows 11 Enterprise LTSC evaluation, which expires after its evaluation period.
It does not use the existing Windows VM or physical game disks. Open its console:

```sh
virt-viewer --connect qemu:///session 16competitive-build-win11
```

Complete Windows first-run setup using the prepared `build` account. The seed
bootstrap installs Visual Studio 2022 C++ Build Tools, Git, Node 22, Rust and
OpenSSH, checking installer signatures or official archive hashes. Progress is
in `C:\16c-build\bootstrap.log`; successful setup creates `C:\16c-build\ready`.
If first-run execution fails, open PowerShell as Administrator and run
`powershell.exe -NoProfile -ExecutionPolicy Bypass -File <seed-drive>:\bootstrap.ps1`.
The initial generated account password is stored privately on the host in
`~/.local/share/16competitive-build/windows/initial-password`.

SSH uses a dedicated host-generated key and only listens on host loopback port 2222. After first setup, register its host key locally:

```sh
ssh-keyscan -p 2222 127.0.0.1 > ~/.local/share/16competitive-build/windows/known_hosts
```

The command requires this pinned key on every build. It never disables host-key
checking. Keep the VM and its build directory private; it contains private helper
source. Signing and publisher credentials are not transferred to it.

## Build settings

Only `API_BASE_URL`, `MATCHMAKING_WS_URL`, `DISCORD_CLIENT_ID`, and
`DISCORD_LARGE_IMAGE_KEY` are forwarded to the containers and VM. They are build
settings that appear in the packaged launcher, not secrets. Machine-specific
`DISCORD_IPC_PATH`, database credentials, signing keys, and arbitrary environment
variables are not forwarded.

Settings load from `.env`, `.env.production`, `.env.production.local`, then
`.env.release.local`; exported shell variables take precedence. The `.env.*`
files remain ignored by Git. Use `.env.release.local` to override development
endpoints without changing the development `.env`:

```dotenv
API_BASE_URL=https://16competitive.papamo.dev
MATCHMAKING_WS_URL=wss://16competitive.papamo.dev/matchmaking/ws
# Optional; otherwise inherited from .env:
# DISCORD_CLIENT_ID=123456789012345678
# DISCORD_LARGE_IMAGE_KEY=logo
```

Localhost and insecure endpoints are rejected before tagging. The packaged
backend target and helper signatures/approval are checked again during packaging.
Changing build settings invalidates a cached desktop artifact set.

## Publication

The command uploads unsigned helper binaries and provenance/checksums to a draft
GitHub release, then dispatches `release-local.yml` on that exact tag. The protected
helper `Release` environment verifies the source revision, expected file set and
SHA-256 hashes, signs manifests, registers approved hashes, then publishes the
release. The Ed25519 private key stays in protected CI. Desktop packaging consumes
only these signed, backend-approved helper assets; it requires no GitHub token in
the Windows VM. The protected desktop `Prod` job verifies the uploaded artifact
set before publishing installers, AppImages and updater metadata.

Protected publication still uses a small hosted Actions job. An exhausted private
Actions allowance or billing restriction can still block helper signing. Local
compilation does not bypass signing or backend approval. Failed publication leaves
the draft and local artifacts available for retry; published releases are never
overwritten by the local upload path.

Rebuild the local Linux tool images after Dockerfile changes:

```sh
docker build -t 16c-release-helper-x64 -f scripts/local-release/Dockerfile.helper-x64 scripts/local-release
docker build -t 16c-release-helper-arm64 -f scripts/local-release/Dockerfile.helper-arm64 scripts/local-release
docker build -t 16c-release-desktop -f scripts/local-release/Dockerfile.desktop scripts/local-release
```

Helper commits marked `[local-release]` skip duplicate hosted push verification; the local command runs the Rust and C++ handoff tests itself. Ordinary commits and pull requests retain their hosted verification.
