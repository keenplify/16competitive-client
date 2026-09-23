# Operation Waterline deployment pack

This folder's Desktop copy is an upload pack, not an automatic importer. Keep the versioned originals until the admin/backend accepts and serves them.

## Operation fields

- Title: `Operation Waterline`
- Description: use the **Operation page description** in `OPERATION_COPY.md`
- Lobby teaser: use the **Lobby card description** in `OPERATION_COPY.md`
- Lobby banner image: `lobby-banner.png` (client `bannerUrl`)
- Operation background image: `operation-background.png` (client `heroUrl`)
- Character cutout: `operative.png` (client `characterUrl`, transparent PNG)
- Access type, price, start/end dates, tier thresholds, and reward order: choose in admin; none are set by this pack.

## Skin models

Each skin upload needs the matching `v_`, `p_`, and `w_` MDL files from **one** material folder. Do not mix finishes or weapon names in a triple.

- `skins/dark-navy-glass/`: MP5, M4A1, Scout, HE grenade, Glock-18 (15 MDLs)
- `skins/frosted-pearl/`: MP5, M4A1, Scout, HE grenade (12 MDLs)

The `material-preview.png` files are visual references, not game assets. An AK-47 triple is **not** in this pack; do not create an AK-47 reward until its final models are added.

## Grenade effect

`sprites/fexplo_pixel_water.spr` is the water-explosion sprite. The BMP beside it is a preview only. The sprite is **not yet connected** to the backend/admin upload flow or the HE-grenade game-server effect; uploading this pack alone will not replace the stock explosion. Verify sprite precaching and the grenade effect hook before advertising it as active.

## Client/backend status

The Electron client can display operation art URLs and a reward track, but the inspected `16competitive` backend currently has no Operation API or admin Operation screen. `characterUrl` and `bannerUrl` are optional client fields. Backend/admin support and a published Operation are still required before players see this pack in production.
