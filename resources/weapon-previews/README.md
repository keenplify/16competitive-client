# Bundled weapon previews

These PNGs are static previews of the `p_*.mdl` files in the local Counter-Strike 1.6 installation. Both the web build and the Electron renderer import them, so stock weapon cards work without a game installation or a model endpoint. `manifest.json` records each source model's SHA-256 hash.

Regenerate them from a Counter-Strike installation with:

```bash
node scripts/generate-weapon-previews.mjs /path/to/cstrike/models
```

The generator uses the app's GoldSrc model viewer in headless Chrome. It captures a transparent image, trims empty space, and centers the weapon on a 512 × 256 card. `p_elite.png` uses the existing Elite artwork because the legacy viewer produces an empty image for that model.

The static PNGs are UI previews only. They are not game assets and do not grant skin ownership or replace match asset verification.
