# Game compatibility attachments

Issue reporting uses a consent modal with a fixed file preview. `Include files`
enables attachments only for the submitted report. `Remember my preference`
remembers Include for this account; `Not now` does not save a refusal. The prompt appears after Submit, before sending, unless Include was remembered. There is
no attachment control on the main report form. Browser and automatic reports never
collect files.

CS 1.3 reports use the saved, adapter-validated Legacy 1.3 installation; CS 1.6
reports use the saved CS 1.6 executable. The active match, then completed match,
then selected matchmaking mode determines the game. The renderer sends only a
validated game ID, never a filesystem path. CS 1.3 includes both `cstrike` and
`cstrk13` client libraries plus its legacy renderer libraries, within the same
seven-file/64 MiB limit. Wine installations collect DLLs, native Linux collects
SO files. Missing or invalid CS 1.3 installations never fall back to CS 1.6 files.

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

Attachment upload failures reopen consent even when Include was remembered. The
draft and screenshots remain intact; retrying a valid snapshot reuses its report
key. An expired or unavailable snapshot can be prepared again within the dialog.
Quota and file-verification refusals have translated, actionable messages.

The backend raw-SQL manifest insert must explicitly JSON-encode descriptors:
Drizzle changes the shared postgres.js JSON serializers to pass-through functions.
Using `tx.json(array)` on that client fails before any binary upload. The backend
real-PostgreSQL regression test covers manifest creation, deduplicated retries,
binary upload and admin download with isolated temporary tables.
