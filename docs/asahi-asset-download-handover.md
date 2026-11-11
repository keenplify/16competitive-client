# Asahi Steam/muvm asset-download handover

Date: November 12, 2026 (Asia/Manila)

## Objective and current status

Fix web-client skin asset downloads after helper setup on a **fresh Asahi Linux / Fedora installation using Steam through muvm/FEX**. The owner will continue debugging on that Asahi machine.

**The root cause on Asahi is not confirmed. Do not describe this issue as fixed.** Changes improve retries and preserve the evidence needed to diagnose it. The owner subsequently requested committing and pushing all pending work; the source changes accompany this handover in Git. No release or deployment was performed.

The development machine used for this investigation is x86_64 Fedora, not the affected Asahi installation. Passing its tests does not establish ARM64/muvm runtime compatibility.

## Report and verified evidence

- Account: keenplify. Feedback timestamp: November 12, 2026, 1:49 AM, Asia/Manila.
- Client: web, at `https://16competitive.papamo.dev/pwa/`.
- Report text: “after setting up helper. cant download assets”.
- Screenshot: error indicator “Could not download skin assets.” with `0 / 0 files`.
- Settings logs report `installationSelected: true` and `setupCompleted: true`.
- At `2026-11-11T17:49:23.104Z`, two warnings say `[GameSettings] early helper asset sync failed`; only a minified Firefox stack frame was retained, without the exception message.
- Report snapshot: catalog status `error`, completed/total files both zero. Native helper diagnostics unavailable.
- Owner said this worked before, then clarified this is a fresh Asahi installation. A last-known-good helper version or same-machine reproduction has not been established.
- Owner confirmed Steam/muvm. **The exact selected CS directory and whether Steam can currently launch CS remain unknown.**

Original attachments on the development machine (these may not exist on Asahi):

- `/home/keenplify-fedora/.codex/attachments/ab33d8e5-8960-4b82-be0e-ef5c0baea01a/Pasted text.txt`
- `/tmp/codex-clipboard-d6de625f-8edb-4960-be8d-37633c3f9cca.png`

Read-only checks against the Singapore production backend found 223 early catalog assets. All paths fit the helper catalog allowlist, all advertised hashes are valid, all served-file candidates exist and meet size/header checks, all actual SHA-256 hashes match the manifest, and content-addressed path prefixes match those hashes. These checks used the backend source and filesystem directly over SSH. They **did not reproduce an authenticated HTTP download from the Asahi helper**, and do not rule out network, TLS, HTTP, destination, or cache failures on that machine. Production data was not changed or repaired.

## Code path and confirmed defects

1. `src/web/browser-api.ts`: `prepareHelperAssets()` schedules `syncNativeAssets('download')` after settings reveals a CS folder. `createEarlyAssetSync()` deduplicates by folder/session and permits retries after failures.
2. `src/web/local-play.ts`: sends authenticated `assetSync` over the loopback settings bridge, then polls `assetStatus`.
3. `web-helper/src/settings_bridge.rs`: dispatches `AssetSync` to `assets::start_catalog()`.
4. `web-helper/src/assets.rs`: validates configured installations, obtains `/skins/assets/manifest`, verifies paths/hashes, downloads files, and installs them using cache and atomic temporary files.
5. In the original code, the background catalog wrapper replaced every failure with `error / 0 / 0`, cleared the filename, and discarded the cause. Thus **0/0 does not prove failure occurred before downloading files**.
6. The original manifest request had no retry for transient failures. File downloads already had retries, but discarded the HTTP/network cause on failure.
7. `src/renderer/src/diagnostic-logs.ts` originally preferred `Error.stack`. Firefox stacks can omit the message, causing this report to lose its useful exception text.

The loopback bridge and catalog sync run on the host. Web match launch uses `web-helper/src/linux_emulation.rs` to re-enter muvm before exchanging the match handoff. Read `docs/web-steam-handoff.md`, especially the Asahi section. Do not assume a game-launch emulation problem is also the asset-download cause.

## Patch contents

The companion patch covers these seven files; inspect the source commit before continuing:

- `web-helper/src/assets.rs`
  - Optional backward-compatible `errorCode` in progress JSON.
  - Preserve failed filename and completed/total counts instead of resetting to zero.
  - Record the filename before destination checks so write/path failures also identify the asset.
  - Distinguish authentication, missing file, service, network, verification, manifest and storage failures using credential-free codes.
  - Retry transient manifest failures up to three attempts with bounded backoff.
  - Preserve the file-download failure category; stop retrying authentication/404 failures.
  - Regression tests for progress retention and transient HTTP/auth behavior.
- `src/shared/game-settings.ts`: optional progress `errorCode`.
- `src/web/local-play.ts`: validate bounded error codes; log safe failure metadata (code, counts, managed relative filename). User-facing thrown error remains translatable.
- `src/renderer/src/features/skins/SkinAssetSyncIndicator.tsx`: translate actionable authentication/network/storage/service failure messages, retaining existing fixed indicator geometry.
- `src/renderer/src/features/i18n/match-asset-translations.ts`: new messages in all eight supported languages.
- `src/renderer/src/diagnostic-logs.ts`: retain exception name/message when Firefox stack omits it.
- `scripts/launcher-diagnostics.test.mjs`: Firefox-style stack regression test.

Safe helper codes currently include `ASSET_AUTH_FAILED`, `ASSET_NOT_FOUND`, `ASSET_SERVICE_UNAVAILABLE`, `ASSET_NETWORK_FAILED`, `ASSET_VERIFICATION_FAILED`, `ASSET_MANIFEST_INVALID`, and `ASSET_STORAGE_FAILED`. Storage is a fallback category, not proof of a permission error. No raw backend token, authorization header or arbitrary OS error text is sent in progress.

**The changes have not been installed on the affected machine. An old installed helper will still erase the failure details even with a new web build.** Preserve signed-helper verification and release requirements; do not replace the installed helper with an unapproved debug binary as a shortcut.

## Validation performed

- Full helper Cargo suite: 4 library tests and 149 binary tests passed; 2 optional binary tests ignored. Existing warnings remain.
- Targeted asset tests passed again after the final error-classification adjustment (12 tests).
- 19 targeted JavaScript tests passed across early sync, web settings, local bridge and launcher diagnostics.
- Targeted ESLint passed.
- Web TypeScript check and `npm run build:web` passed. Existing bundle-size/dynamic-import warnings remain.
- `git diff --check` passed.

On the development machine the default Cargo target contained unwritable artifacts, and system ALSA pkg-config metadata was missing. Tests succeeded using the existing local ALSA shim and a separate target directory:

```bash
rtk proxy env PKG_CONFIG_PATH=/home/keenplify-fedora/.cache/16competitive/build-tools/alsa-native/lib/pkgconfig CARGO_TARGET_DIR=/tmp/16competitive-asset-sync-target CARGO_PROFILE_DEV_DEBUG=0 CARGO_BUILD_JOBS=4 cargo test --locked --manifest-path web-helper/Cargo.toml -- --test-threads=1
```

These paths are development-host-specific. Use the Asahi machine’s correct architecture, dependencies and writable build directories. The test workaround above is unrelated to the reported end-user failure.

## Continue on the Asahi machine

1. Inspect Git status and the latest source commits. Transfer this document **and `docs/asahi-asset-download.patch`** to the Asahi machine. The patch contains exactly the seven source/test files listed above, not the separate admin/backend work. On a matching checkout, first run `rtk git apply --check docs/asahi-asset-download.patch`, then `rtk git apply docs/asahi-asset-download.patch`. If the check fails, inspect the differences and reconcile them; do not force it. If the changes already exist, do not apply them again. Do not reset either checkout or overwrite unrelated work.
2. Establish the exact installed helper version/build and web version. Confirm that the setup/protocol handler uses the ARM64 helper on the host. Avoid changing muvm routing before identifying the failure.
3. Read the selected CS path from helper Settings and confirm whether Steam can launch CS independently. Inspect only relevant directory ownership, write permissions, available space, mount flags, and links along the managed asset destinations/cache. Do not run broad permission changes or delete the cache to hide the cause.
4. Reproduce once while observing the browser’s local `assetSync` and `assetStatus` exchanges. Never copy their request headers/bodies into the report: they contain capabilities/account tokens. Record only HTTP status, safe error code, counts, and managed relative filename.
5. With an approved updated helper and web build, capture the retained error category and filename. Linux helper progress is normally `${XDG_CONFIG_HOME:-$HOME/.config}/16competitive/asset-progress.json`. Inspect this specific file only; do not dump nearby settings/session files. The existing helper may contain only the uninformative old 0/0 state.
6. Use the observed category to investigate: authentication/session routing, actual authenticated manifest/file HTTP response, network/TLS connectivity from the host helper, or local destination/cache handling. Keep the backend authoritative and retain hash verification, approved roots, traversal rejection, and symlink constraints.
7. Add a regression test for the **observed** root cause, verify download completion from a fresh cache on the real ARM64 host, and confirm Steam sees the installed files inside muvm. Do not claim end-to-end success from x86 tests alone.
8. Release/deploy only when the owner requests it, using the existing signed-bundle process and exact artifact verification.

## Hard constraints

- `config.cfg` is strictly out of bounds: never read, write, back up or otherwise manipulate it.
- Never log/share session tokens, loopback capabilities, launch passwords or signing secrets.
- Do not weaken path/hash/symlink/signature checks to make the download succeed.
- Preserve Linux and Windows support. Do not conflate catalog sync with native cosmetic module loading or anti-cheat compatibility.
- Do not claim VAC/third-party anti-cheat compatibility.

## Other pending work in this chat

Earlier admin/backend work is separate in the development machine’s sibling repositories and is included in the owner’s subsequent commit/push request. It preserves former human warmup reservations in admin match lists/rosters, persists Games filters and replaces Region with a dropdown, and gates warmup server startup on two human acceptances unless elapsed waiting time lowers the minimum to one. Tests/builds passed for that work. Do not discard it or accidentally include it in an asset-only release without reviewing scope with the owner.
