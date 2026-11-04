# Sticker model colors and NextClient

Checked 2026-11-04 against the helper-pinned NextClient revision
`9eef60908fb874843f7e9aa68a0e91c0743a402a` (not just upstream HEAD).

NextClient already performs texture gamma correction:

- `nextclient/engine_mini/src/graphics/gl_draw.cpp`, `BuildGammaTable`: builds
  `texgammatable` using `texgamma / gamma`. `V_CheckGamma` rebuilds the tables
  when gamma, texture gamma, light gamma, or brightness changes.
- `graphics/texture_processing.cpp`, `TryUnpackTextureToRGBA`: applies that
  table to the indexed texture palette before converting to RGBA.
- `graphics/texture_loader.cpp`, `LoadTexture`: the hardware palette path also
  applies the table. Already-RGBA textures take a separate path without that
  indexed-palette conversion.

The helper's `cosmetic-module/src/sticker_textures.rs` uploads the verified
RGBA sidecars directly through `glTexImage2D`, and temporarily substitutes their
texture IDs during the draw. The NextClient host wraps the studio draw with
`papamo_sticker_textures_begin/end`. This bypasses the indexed-palette gamma
conversion; it does not disable NextClient's lighting or global color settings.
Consequently, it can differ from the gamma-corrected indexed model underneath.
This review does not establish visual color parity.

Do not add a blanket gamma adjustment to the baked model, all game textures,
or the editor. It could double-correct indexed fallback rendering. Any future
RGBA color integration needs the active engine's actual conversion and cache
invalidation on gamma changes, with separate Steam and NextClient verification.
No native color behavior was changed as part of the knife-side correction.

Source: https://github.com/CS-NextClient/NextClient/tree/9eef60908fb874843f7e9aa68a0e91c0743a402a/nextclient/engine_mini/src/graphics

The knife editor and inspection now start on the opposite blade face from the
firearm inspection view, with the existing bounded orbit. Atlas projection
remains one-sided. Existing server-owned sticker placements are not migrated
or mirrored by the client; their saved projection remains authoritative.
