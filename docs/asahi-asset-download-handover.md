my asahi found it

## Follow-up: November 12, 2026

The Asahi investigation produced commit `d6da9808`: the Steam library retained a dangling `models/16competitive` link to the previous home's launcher storage. The helper now redirects only dangling links with the known launcher-owned storage layout to the current user's approved storage. Existing links and unrecognized targets remain protected.

The fix has been pulled into this checkout. All 13 targeted asset tests pass on the Fedora x64 build host, including stale-link recovery and rejection of unexpected links. This does not independently establish ARM64 runtime success. The user has requested a signed release including this fix, the earlier download diagnostics, Settings search, and helper setup layout corrections.

The earlier detailed investigation remains in Git at `11234ff`; the companion patch is historical and must not be applied again to a checkout containing those changes.
