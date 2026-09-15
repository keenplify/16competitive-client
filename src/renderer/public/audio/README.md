# Launcher audio assets

Drop the production audio files into this directory using these exact paths:

```text
audio/
├── bgm/
│   └── enth-e-nd.mp3
└── sfx/
    ├── tab.mp3
    ├── find-match.mp3
    ├── forward.mp3
    ├── backward.mp3
    ├── party-invitation.mp3
    ├── match-found.mp3
    ├── match-accepted.mp3
    ├── game-starting.mp3
    ├── victory.mp3
    └── defeat.mp3
```

The **Hip-Hop** music set uses `enth-e-nd.mp3` before login. After authentication, its audio passes
through a low-pass filter for the lobby; the track continues at its current
timestamp while the filter transitions. The BGM is muted while the launcher is
not focused and resumes when focus returns.

When **Hip-Hop** is selected, `sfx/match-found.mp3` is its match-found cue. It
plays when the matchmaking service emits a `match_found` event.

`sfx/find-match.mp3` plays immediately after the player clicks **Find match**.

The BGM choices are defined in `src/renderer/src/features/audio/audio.paths.ts`.
