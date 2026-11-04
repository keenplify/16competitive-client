# Production preview report — 2026-11-04

The user authorized deployment after these investigations. See release status for publication.

## Confirmed causes and changes

- The Windows report identifies client 2026.1104.3 and `C:\Games\CS 1.6 GoldClient`.
- The stock XM1014 in that report is 250,148 bytes. The supplied GoldClient
  installation has the same size; the pinned Steam/NextClient file is 248,212 bytes.
- Audited all 28 pinned viewmodels from the three supplied game installations,
  including SHA-256 checks in the running Windows 11 VM. NextClient and WaRzOnE
  match 28/28; GoldClient matches 0/28. Only model files were copied for this audit.
  No game configuration files were accessed.
- GoldClient's local source rejection is addressed by a canonical, hash-pinned
  stock source at `models/16competitive/stock/<sha-prefix>/v.mdl`. The editor fetches
  this verified source; new match recipes and precache use the same path. Local
  stock files are untouched and native hash/session/endpoint gates are retained.
  Existing matches keep their frozen loadouts; validation of Windows gameplay
  remains for the user. All 28 real-model bake checks and isolated database
  integration tests passed.
- Production catalog reads over SSH `sg` identified the exact affected skin models.
  Preview bugs also reproduce on Fedora, as confirmed by the user's later screenshot.
- Synaptic Surge uses `v_hands.bmp`; the material classifier matched only singular
  `hand`. Plural hand/glove/finger/sleeve tokens are now recognized while preserving
  weapon names such as `handle.bmp`, `handguard.bmp`, and `forearm.bmp`.
- Read-only inspection now decodes animated bone translations for all models.
  This fixes Ink Bloom's displaced/inverted magazine and body parts. Sticker
  authoring transforms remain unchanged.
- Stock-specific inspection adjustments no longer apply indiscriminately to custom
  models. Database `previewRotation` and `previewHiddenTextures` are passed through
  to inspection and thumbnails. Thumbnail keys include those settings, and the
  render namespace was bumped. Existing admin rotation controls save these values.
- `pending-knife-preview-rotations.sql` prepares `[0,-90,0]` for the ten production
  butterfly/falchion skins. IDs, source paths, and previous zero rotation are guarded.
  This SQL has **not** been executed; apply it with the corrected renderer release.
- Thumbnail warming starts after authentication restoration, renders one catalog
  weapon at a time during idle work, and pauses for Store/Profile or matchmaking.
  It uses the same persistent thumbnail cache keys as the store. No measured FPS
  or first-open latency improvement is claimed yet. Fresh unauthenticated sessions
  cannot fetch the authenticated skin catalog before login.

## Verification and limitations

- Typecheck passed; launcher suite: 497 passed, 3 skipped.
- Sticker model tests: 8 passed, 3 optional fixture skips.
- Electron runtime test passed with real USP, Ink Bloom and all ten knife assets;
  screenshots inspected for the affected weapon families and database rotation.
  `INSPECTION_FIXTURES` accepts JSON entries with `path`, `weapon`, `rotation`, and
  `screenshot` for repeatable local visual checks.
- Windows VM uses Microsoft Basic Display Adapter and currently has no interactive
  logged-in user. Its hash audit is not Windows visual or in-game OpenGL validation.
- naiverum's 800×600 scoreboard/kill-card issue remains unresolved.
- Custom-skin sticker authoring remains unimplemented; earlier local disabled-action
  notices only contain that failure. Do not describe it as working.
