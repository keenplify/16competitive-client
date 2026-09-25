# Admin demo playback

The admin review page provides **Watch in client** for ready recordings. It opens:

```
competitive16://play-demo?recordingId=<recording UUID>
```

URI schemes must start with a letter, so `16competitive://` is not used. The
installed client registers `competitive16` on Windows/Linux. AppImage users need
desktop integration for browser protocol launching. Restart an already running
development client after changing protocol handlers.

The client also provides an admin-only Demos navigation entry. Access is checked
by authenticated backend endpoints, not by a renderer-provided role. Cold-start
links wait for sign-in. Sign in with the administrator account in the desktop
client; browser credentials are never placed in the link.

Playback requires leaving the queue and finishing any active match. Close CS
first, since an already running Steam game may ignore new launch arguments.
Downloads use the existing authenticated regional recording endpoint, disallow
redirects, and validate destination origins against configured matchmaking nodes.
The download is bounded to 512 MB / three minutes and written to a unique temporary
file in the selected installation's cstrike folder. A GoldSrc demo header check
precedes the atomic rename. It is a format check, not a cryptographic authenticity
check. Valid files are retained as `16c_review_<id>_<suffix>.dem` for replay.

The selected installation's existing launch adapter starts Steam/direct CS with
`+viewdemo <safe generated name>`. No raw URLs, paths, tokens, or game commands are
accepted from the deep link. A successful launch request does not guarantee the
engine accepted or played the demo.

Deploy backend and admin changes and distribute a client update before using
this feature. No database migration is required for demo playback.
