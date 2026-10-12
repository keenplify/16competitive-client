# Counter-Strike match launch handoff

Normal Counter-Strike launches keep engine startup flags on the process command
line. Steam also needs `-applaunch 10` and `-game cstrike`. The launcher passes
`+exec 16competitive_match.cfg` after engine startup. Standard clients receive
their match identity from that file, after cleanup, rather than an early
`+setinfo` which can consume legacy userinfo capacity before password insertion.

Before starting GoldSrc, the launcher writes `cstrike/16competitive_match.cfg`
with the current player identity, match-specific join key and token, server
password, download settings, and connect command. It first clears the old fixed
`_16c` key and previous match keys. It also clears the running session's `model`,
`topcolor`, and `bottomcolor` userinfo fields: these Half-Life preferences are
unused by Counter-Strike's server-selected player models, and freeing their
space helps legacy clients fit the match token and server password in the
256-byte connection buffer. It preserves other userinfo keys; arbitrarily full
userinfo can still exceed that limit. No saved player configuration is accessed.
It then sets the current match key. A marked
`exec "16competitive_ping.cfg"` line in `cstrike/userconfig.cfg` reapplies ping
bindings and, on classic clients, the current identity and password after any
engine profile reload. The hook clears stale identity keys again and never
disconnects, connects, or waits. Some repacks reload their profile after startup
`+exec` has returned; applying credentials only inside that startup script leaves
their saved name and old token active when the connection completes.
NextClient without its native host
uses the match file through userconfig instead, because `+exec` can crash it.
NextClient's native host continues to use its private
handoff files and does not need this line. Its handoff clears previous keys and
sets the current match key before connecting.

The launcher removes only its marked line after the game exits or the match
closes. It preserves an existing `userconfig.cfg`, including edits made while
the game is running. A later match launch replaces a stale marked line left by
an earlier launcher crash. Standalone `_16c` assignments already present in
`userconfig.cfg` are removed because match and manual tokens expire. The
player’s `config.cfg` is never accessed.

After exit, the launcher replaces `16competitive_match.cfg` with cleanup
commands containing only recent match key names. The next match runs those
commands before setting its own token. The NextClient host runs the same key
cleanup through its private handoff. This keeps old keys from accumulating in
userinfo without reading or editing `config.cfg`.

For connection diagnostics, the launcher logs the first 12 lowercase hex
characters of SHA-256 of the match token. The AMXX server logs the same
fingerprint for roster tokens and the current match key observed during assignment.
`none` means no token was present. Compare fingerprints within the same match;
the logs never include the usable token or server password.

The NextClient fallback depends on the installed client executing `userconfig.cfg`
during startup. Standard GoldSrc needs its startup scripts to process command-line
commands; an installation reporting `couldn't exec valve.rc` may skip that handoff.
For standalone classic clients only, the launcher creates a temporary `valve.rc`
containing only `stuffcmds` when neither `cstrike` nor `valve` has a startup script
or a PAK archive that could supply one. It publishes the bridge atomically
without replacing a file. Cleanup removes only its exact marked contents;
player replacements are preserved, and a launcher restart removes a crash-left
bridge. Steam, NextClient, existing startup scripts and packed content are left
alone. No player profile is read or executed by the bridge.

Verified on Windows with the OlagueR standalone installation: an echo-only cfg
did not execute with `+exec` while `valve.rc` was absent, but the same command-line
probe executed automatically with the temporary bridge. This is startup-handoff
verification. A subsequent public-server probe used the same startup bridge,
managed userinfo cleanup, two credential applications and 20 wait frames, with
compact dummy credentials. TURAN (`95.173.173.66:27015`) accepted the connection
without userinfo overflow and the user confirmed it connected. This proves the
affected client's public-server path, not competitive roster authorization or
password validation by a password-protected server.

An additional OlagueR probe reproduced the profile reset after the startup script
returned: the public server observed the saved repack name. With the profile-end
identity hook, the same installation retained the dummy launcher name after map
loading. This verifies profile reload timing; competitive roster authorization
still requires a live assigned match with fresh credentials.

Regression tests preserve WarzOnE wrapper flags and existing startup files,
Steam's Windows/Linux `-applaunch 10` handoff, and NextClient's native handoff
without `+exec` or a startup bridge. The pinned NextClient host v0.1.57 accepts
server passwords of 1–128 safe characters; launcher roster tokens retain its
32–64-character contract. Live Steam/NextClient matches were not retested here.

Manual join tokens are now `m_` plus 22 base64url characters, and new server
passwords are 22 characters. Each contains 128 random bits. The client and server
continue accepting older 48-hex manual tokens during deployment. Launcher roster
tokens and RCON credentials retain their existing format. Manual tokens remain
match-scoped allowlist credentials, not single-use credentials. The copied manual
command still applies the token to `_16c` before setting the password.
Update client/web response validation before deploying compact credential
generation; previously released clients only accept the old manual token format.
Before release, verify one native Linux Steam launch and one
Windows Steam launch: the game console should show
`[1.6 Competitive] Match config loaded`, followed by a successful rostered
connection. Also verify the marked line is removed after exit and that reconnect
starts a new game after the previous GoldSrc process exits.

## Backup roster authentication

Primary startup/profile and NextClient handoffs remain unchanged. The launcher atomically supplies only the backend-issued current match key/token in `join-recovery.state`; authenticated WebSocket status recovery refreshes it without relaunching an active game. Account bearers stay in Electron main.

AMXX requests `16CAuth` recovery only after two seconds of unresolved roster assignment. The loaded module requires a fresh, matching session ticket/lease and the actual assigned IPv4 endpoint. Its worker reads credentials; HUD callbacks send at most eight `16competitive_auth <key> <userid> <token>` attempts, spaced 500 ms apart and bounded to eight seconds from the request. There are no connect/disconnect commands or userinfo writes.

AMXX accepts only its current roster token, current connection userid and match key within the existing ten-second join grace, rejects a roster slot already occupied by another connection, and acknowledges assignment. Assigned primary connections cannot be reassigned through recovery. Accepted backup identity is retained server-side for this connection and checked against the current roster, then cleared on disconnect. Old/manual tokens cannot authenticate through this command. Session cleanup removes the handoff. Game log export filters this command as credential-bearing.

The compiled Linux x86, Windows x86 proxy and NextClient module paths use the existing public engine message/command API. Live repack/assigned-match recovery still needs an in-game verification; builds and unit tests do not establish that result.
