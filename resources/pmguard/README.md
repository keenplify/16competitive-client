# PMGUARD artwork

The active background, `cs16-splash-classic.png`, is the classic Counter-Strike image supplied by the user. Earlier generated artwork is retained below for provenance.

## Prompt direction

- `emblem-v1.png`: isolated ivory handlebar mustache combined with a stern guard helmet/visor and angular shield, amber center, transparent background; refined for a compact startup emblem.
- `cs16-splash-v1.png`: portrait classic Counter-Strike 1.6 inspired artwork, two masked counter-terrorists, raised pistol, dusty olive and yellow wall with lambda motif, dark negative space at top and bottom for text.

These descriptions record the generation direction, rather than verbatim tool prompts. Typography is rendered in HTML, not baked into artwork. The PMGUARD wordmark is one unbroken uppercase line, using the launcher’s default blue palette.

The Electron splash is 320 × 480 pixels, frameless, square-cornered and positioned 24 pixels from the bottom-right of the current display work area. It displays for three seconds. “Starting launcher…” indicates startup, not a verified anti-cheat verdict.

The splash header uses the packaged 1.6 Competitive logo. When backend-validated community branding supplies a logo, it replaces the header artwork without changing its geometry. The main process downloads bounded artwork, decodes it to PNG, and embeds it locally; unavailable artwork keeps the default logo and never blocks startup. Saved credentials remain in the main process.
