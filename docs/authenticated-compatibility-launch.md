# Authenticated launch without native cosmetics on Windows

A clean x86 GoldSrc client can launch with the current match token even when
its exports do not satisfy the cosmetic proxy ABI. The helper keeps the signed
inspector, backend session authorization checks, two-hour session limit, owned
process lifecycle, and launcher-owned startup file. Native cosmetics, HUD,
voice and session music are unavailable in this compatibility path.

This does not expand the native proxy ABI. A malformed client DLL, wrong
architecture, missing Initialize/F entry point, partial NextClient layout, or
existing managed/recovery journal still fails closed. Unknown player files are
never replaced to force compatibility. CS 1.3 and native Linux keep their
existing paths.

The startup file repeats the current token and password before connecting;
legacy hyphenated credentials remain intact. It is removed at session end.
The helper reports COSMETICS_UNAVAILABLE_CONFIG_AUTH, saved in account-scoped
launch history without paths, binaries, raw arguments or credentials.

The helper also preserves the Electron adapter's standalone Windows GTProtector
workaround. After stopping the previous game under the installation ownership
lock, it moves only `GTlib.asi` and `GTProtector.asi` (case insensitive) into a
unique `16competitive/disabled-gtprotector/backup-*` directory. Original bytes
and earlier backups are retained. Steam and NextClient installations are skipped;
links and reparse points are rejected. This prevents the legacy `Find Cl/En/St
Modules Error` popup observed with WaRzOnE. It does not disable the signed
competitive inspector or change its checks.

The server additionally recovers a missing token after ten seconds using a
unique address captured by that match's authenticated ready response. This is
an explicitly requested availability tradeoff; addresses are weaker than
credentials. Shared/ambiguous addresses and occupied/revoked slots are rejected.
See the backend docs/missing-token-recovery.md for admission behavior and tests.
