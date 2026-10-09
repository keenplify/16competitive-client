# ef_gundrop — CS 1.6 red enemy marker

The finished model is **ef_gundrop.mdl**. The source in Downloads was left unchanged.

## What was deconstructed

GoldSrc IDST version 10, 332,056 bytes, one body/submodel (`ref_drop`), two bones,
38 vertices, 19 normals, two meshes, and 66 triangles. The effect consists of a
horizontal marker quad and a very narrow vertical glow column. Both materials
have flags 36 (`FULLBRIGHT | ADDITIVE`); black is invisible through additive blending.

The single `idle` sequence loops at 30 FPS with 151 frames (a five-second cycle).
The marker bone rotates; the beam bone holds a fixed orientation. This existing
animation is preserved byte for byte. The game/entity must advance its sequence
for motion to play. The BMP textures themselves are static.

## Outputs

- `original.mdl`: unchanged source copy.
- `original-textures/`: lossless original indexed BMPs, PNG previews, texture manifest.
- `textures/`: regenerated textures, ready as matching indexed BMPs, plus PNG previews.
- `ef_gundrop.mdl`: finished model with the new textures embedded.
- `decompiled-original/`: original reference mesh SMD, idle animation SMD, QC, and BMPs.
- `decompiled-cs16/`: matching editable source files with the regenerated BMPs.
- `model-structure.json`: decoded geometry, UVs, bones, and every animation frame.
- `generated/`: original high-resolution image generation outputs.
- `imagegen-prompts.txt`: exact prompts used with the built-in image_gen tool.
- `comparison.png`: original/new software model previews, viewed from above.
- `animation-preview.gif`: software preview using decoded model animation.
- `verification.json`: integrity and format results, including SHA-256 hashes.

The marker now uses a broken outer circle and a hollow center diamond with a small solid diamond.

The textures replace neon green with muted brick red and scarlet, with worn stencil
markings and a restrained glow. `portal02.bmp` remains 512×512; `portal03.bmp` remains
256×256. Both use uncompressed Windows BMP, 8 bits per pixel, a 256-entry BGR0 palette,
40-byte DIB header, and bottom-up rows. Original names, flags, UVs, and dimensions
are unchanged. Palette colors are intentionally replaced; the indexed format is retained.

## Rebuild and inspect

From the repository root:

```sh
rtk node output/models/ef_gundrop-red-v1/rebuild.mjs
rtk node output/models/ef_gundrop-red-v1/verify.mjs
rtk proxy python3 output/models/ef_gundrop-red-v1/deconstruct.py
rtk proxy python3 output/models/ef_gundrop-red-v1/preview.py
```

Python source/preview tools require numpy and Pillow. The Node rebuild uses the
existing repository texture import/export scripts. Regenerated PNGs were resized
with Lanczos and quantized to 256 colors without dithering, then BMP headers were
canonicalized with the same exporter used for the originals.

The QC/SMD files are editable decompilation outputs. The final MDL was rebuilt by
direct texture import, so recompilation artifacts cannot change its geometry or motion.
Verification confirms every non-texture byte is identical to the source and that
both replacement BMPs export back from the rebuilt model exactly.

The preview is an orthographic software visualization, not an in-game screenshot.
The final model has passed binary/texture checks; it has not been tested in a live
Counter-Strike session. No game installation files were changed.

The core plugin pulses brightness at 1.5 Hz, from approximately 50% to 100%, while preserving entity scale. The texture and model animation remain independently usable.
