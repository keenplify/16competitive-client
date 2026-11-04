# AK-47 sticker editor

Private development editor built with the launcher's React, Zustand and GoldSrc
model-viewer code. It is separate from the normal launcher and matchmaking.

Run from the client repository:

```sh
rtk npm run sticker:editor
# Optional Steam game root (case-sensitive on Linux):
rtk npm run sticker:editor -- "/path/to/Half-Life"
```

The default is `~/.steam/steam/steamapps/common/Half-Life`. The editor displays the
actual first-person `cstrike/models/v_ak47.mdl`, including its hands. This prototype
admits the inspected stock model with SHA-256
`6eb08a5e76210712ad787949e244fd57346b1836a7462f3a436976126e270fa3`.
It is not a general importer for untrusted or custom MDLs.

- Drag the test sticker from the right panel onto the weapon, or left-drag on the
  weapon to move it. Right-drag adjusts the player-facing view within ±20° horizontally and ±15° vertically; the wheel zooms.
- Size and rotation adjust the same 3D projection. The texture panel updates as
  you move. Its selector lets you inspect individual atlas pages.
- Choose PNG imports a local sticker, up to 512 × 512 pixels and 2 MiB.
- Save model creates a content-addressed `.mdl` under the editor's Electron
  user-data directory, in `sticker-models/`. The footer shows its full path.
- Test in game prepares a private game copy, stages that exact baked model and
  starts a local Dust2 game. Join Terrorists and buy an AK-47. Close that game
  before testing the next edit; GoldSrc caches models during a process lifetime.

## Native prerequisites

Build the private sibling helper before using Test in game:

```sh
# From ../16competitive-helper, native Linux:
rtk cargo build --locked --features cosmetic-probe
rtk cargo build --locked -p papamo-cosmetic-module --target i686-unknown-linux-gnu

# On Windows, with the corresponding Rust toolchains:
rtk cargo build --locked --features cosmetic-probe
rtk cargo build --locked -p papamo-cosmetic-module --target i686-pc-windows-gnu
```

`STICKER_HELPER` and `STICKER_MODULE` can override the main-process development
binary paths. Windows testing uses the existing classic-client proxy admission
checks; this editor does not install a NextClient host or claim NextClient runtime
support. No release signing or production helper approval is bypassed: this is
the existing explicit, isolated `--skin-probe` development workflow.

The helper adds `prepare-ak47 <game-root> <module> <new-session>` and
`launch-baked <session> <model.mdl>`. Old knife commands remain available. The
new probe source selector accepts only `knife` or `ak47`; it does not expose an
arbitrary game model path. The private launch receives 16,000 starting money.

## How the bake works

The stock model reuses texture coordinates, so stamping its original texture can
put fragments on unrelated surfaces. The editor gives each weapon triangle its
own padded tile, packed into 512 × 512 indexed texture pages. It rewrites the
mesh texture references and UVs in the derived MDL while retaining the original
bones, vertex positions, animations and hands.

Mouse picking supplies a projection plane in the authored idle pose. The bake
projects across neighboring faces and material boundaries into those tiles.
It preserves the picked triangle winding instead of assuming camera-facing
winding; the opposite-facing surface is excluded. Depth is bounded around the
picked surface. This is a local planar projection, not a full wrap around the
weapon or a visibility/occlusion solver for arbitrary custom geometry.

The same projection/compositor runs in the preview and Electron main. Main owns
the source model and imported PNG; export IPC supplies only validated projection
numbers. The renderer cannot choose output paths or supply executable commands.
The preload is narrow, context isolation and sandbox are enabled, external
navigation is blocked, and the editor makes no network requests.

GoldSrc still uses 256-color palettes. The bake reserves 32 least-used entries
per affected page and remaps their original pixels to the nearest retained
colors. Sticker colors and base texture shades may therefore be approximated.
This stock AK grows from about 288 KiB to 2.55 MiB with isolated texture pages.
No geometry is added, but additional texture pages/mesh groups cost resources;
no FPS improvement or production performance guarantee is claimed.

Stock models are never overwritten. No application path accesses `config.cfg`.
The game copy omits the launcher-managed model-cache link; Steam's fixed sibling
SDL alias is copied as a regular file. Other symlinks remain rejected. Private
test sessions remain available for diagnostics; they are not normal installations.

## Scope and validation

The standalone development editor affects only the local first-person AK-47.
The inventory and managed-match integration is described below. Held and dropped
model textures still need their own projection assets.

```sh
rtk npm run test:stickers
rtk npm run typecheck
```

Set `STICKER_TEST_MODEL` to the stock `v_ak47.mdl` path to include the real-model
round-trip check. Tests cover invalid bounds/payloads, source immutability,
palette color, cross-material projection, reverse-side exclusion and all eight
translation catalogs. Linux editor interaction was checked with the real stock
model. Native helper workspace tests and Windows cross-compilation pass.

The user confirmed the private Linux stock AK test works. Windows in-game
rendering and managed-match drop/pickup still require gameplay verification.


## Inventory and managed-match integration (November 4, 2026)

The working stock AK bake remains the implementation baseline. The downloaded
CS2 classic-weapon mesh pack targets a different animated model set and has not
replaced this exporter. Multiple stickers now composite in application order
before each texture is quantized once; projection remains confined to the picked
side while spanning adjacent material seams.

The profile Inventory, purchase/application API, and admin catalog source are
implemented. Points and P Cash purchases use separate single-use copies, immutable
artwork snapshots and idempotent request IDs. Application is bound to the chosen
skin acquisition; changing equipped skins retains the original application's
record, while selling and reacquiring a skin does not inherit it. Unsupported
model hashes are rejected before consuming a sticker. The current exporter only
accepts the verified stock AK binary, including copies at custom paths.

Match recipes are versioned and frozen into match loadouts. The server plugin
retains the weapon's existing skin marker on drop/pickup and sends a recipe ID
only to opted-in clients. The client recipe baker verifies recipe content, source
hash and artwork hashes and validates the resulting GoldSrc structural layout.
The launcher stages verified recipes before the managed session starts. A separate
worker bakes models into immutable `models/16competitive/st/<hash-prefix>.mdl`
cache entries, leaving stock files untouched. The session's `stickers.tsv` names
only approved recipes and source models. Normal session cleanup removes this
manifest; cached cosmetic files contain no credentials and can be reused.

The Rust input worker verifies source/output hashes and GoldSrc structure once,
then renews a short-lived authorization snapshot under the existing session
ticket/lease. The game thread accepts only server-selected recipe IDs, checks the
assigned endpoint and current source model, and restores the original model after
each draw. Messages expire after 750 ms; missing assets, invalid recipes, session
loss and unsupported clients retain ordinary models. Model pointers reset on map
initialization. Server weapon markers retain recipes through drop/pickup and
reconnect restoration; ownership never transfers with pickup.

Migrations 0152 and 0153 have been applied to the local development database.
All 67 BMPs from the supplied `stickers!` folder were imported as PNGs, preserving
palette-index-255 transparency, with zero Points and P Cash prices. Every claim
still creates a distinct single-use copy. Admins can use zero for free or leave a
currency price empty to disable it.

Helper [v0.1.78](https://github.com/keenplify/16competitive-helper/releases/tag/v0.1.78)
is signed, registered and published, including the updated Windows NextClient
host. The launcher pin and local Linux/Windows-Wine resources use this approved
release. Development startup preserves this signed bundle; use
`npm run build:helper -- --force` only for an intentional unsigned local rebuild,
then `npm run prepare:helper` to restore approved managed-game artifacts.
Signature, artifact hash and registry equality checks passed for Windows
x64, Linux x64 and Linux ARM64. This does not deploy the backend or desktop app.

The user confirmed the private stock AK test works. This supersedes the earlier
incomplete runtime note above, but does not prove Windows, NextClient, remote
match delivery, or drop/pickup support. The AMXX plugin compiles (two existing
player-assignment tag warnings). Client/admin builds, backend type checks, stock
model tests, disposable-database purchase/application tests and the Electron
recipe-to-cache smoke test pass. A real exported AK also passes the Rust model
validator. Actual managed-match drop/pickup remains a manual gameplay test.

### Engine references

- [Valve Half-Life SDK](https://github.com/valvesoftware/halflife): studio model structures and client viewmodel rendering.
- [ReGameDLL_CS](https://github.com/rehlds/ReGameDLL_CS/tree/master): weapon entities, weapon boxes, deploy and pickup lifecycle.
- [NextClient](https://github.com/CS-NextClient/NextClient): alternate client rendering and host compatibility.


Local checks:

```sh
# Backend: creates and removes a separate disposable local database.
bun run src/scripts/test-stickers-local.ts
# Reimport the supplied artwork without duplicating catalog entries.
bun run src/scripts/import-free-stickers.ts '/path/to/stickers!'
```

In the launcher, use Store → Stickers → Get sticker, then Profile → Inventory, and
right-click an unused sticker → Apply sticker → Stock AK-47. Drag and confirm
Apply. Enter a **new** match afterward: existing matches keep their frozen recipe
snapshot. Only first-person viewmodels are customized; held/world geometry keeps
its normal appearance.

The editor creates a fresh canvas for each WebGL lifecycle, including React
StrictMode development replays. Run `npm run test:stickers:runtime` with
`STICKER_TEST_MODEL` set to the stock AK path to check actual Electron rendering,
mouse placement and reopening. Graphics initialization failures stay in the editor
and do not consume a sticker.
