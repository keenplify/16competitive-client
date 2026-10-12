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
bindings without making a second connection. NextClient without its native host
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
Do not silently seed or replace game startup files. Diagnose with
`exec 16competitive_match.cfg` in the console during an active match.
Before release, verify one native Linux Steam launch and one
Windows Steam launch: the game console should show
`[1.6 Competitive] Match config loaded`, followed by a successful rostered
connection. Also verify the marked line is removed after exit and that reconnect
starts a new game after the previous GoldSrc process exits.
