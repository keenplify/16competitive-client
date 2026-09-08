# Launcher audio assets

Drop the production audio files into this directory using these exact paths:

```text
audio/
├── bgm/
│   ├── launcher-1.mp3
│   ├── launcher-2.mp3
│   └── launcher-3.mp3
└── sfx/
    ├── tab.mp3
    ├── party-invitation.mp3
    ├── match-found.mp3
    ├── match-accepted.mp3
    ├── game-starting.mp3
    ├── victory.mp3
    └── defeat.mp3
```

The BGM choices are defined in `src/renderer/src/features/audio/audio.paths.ts`. The user selects one track in Settings, and that selected track loops continuously until another track is chosen.

No audio binaries are committed yet. The renderer code is already wired to these paths.
