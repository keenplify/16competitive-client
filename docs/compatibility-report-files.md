# Game compatibility attachments

Issue reporting uses a consent modal with a fixed file preview. `Include files`
enables attachments only for the submitted report. `Remember my preference`
remembers Include for this account; `Not now` does not save a refusal. The prompt appears when opening a report unless Include was remembered. There is
no attachment control on the main report form. Browser and automatic reports never
collect files.

The main process owns the path allowlist, bounded snapshot, SHA-256 hashing and
upload. The renderer receives only preview metadata and an opaque ID. Approved
snapshots expire after ten minutes and cannot cross account sessions. The backend
asks only for missing hashes and recomputes hashes before storing private blobs.
Limits are 16 MiB per file and 64 MiB per report. Neither code nor tests access
`config.cfg`.

Backend migration `0175_issue_compatibility_files` and matching routes must deploy
before releasing this launcher. Backend documentation in
`16competitive/docs/compatibility-report-files.md` describes storage, 30-day
retention, administrator downloads, rate limits and staging checks. Source pushes
do not apply production migrations or publish a launcher release.

Tests: `scripts/compatibility-files.test.mjs`,
`scripts/compatibility-consent.test.mjs`, and
`scripts/compatibility-modal-runtime.test.mjs` (requires the built web CSS and
Electron). The runtime test captures both themes and checks stable loading/error
geometry, square corners and Not now behavior.
