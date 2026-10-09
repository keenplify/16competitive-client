# Player Ping

The core AMXX plugin implements `16competitive_ping` for living teammates in every mode except FFA. Settings → Voice & Audio → Player Ping defaults to MOUSE3. Binding preferences are validated and applied through launcher-owned match/session files. `config.cfg` remains untouched.

Pings last eight seconds and replace the sender's previous ping. Players can send three successful pings in a burst; the third starts a five-second cooldown before the fourth. A five-second pause resets the burst. Blocked attempts never extend the deadline and display a localized remaining-time notice at most once per second. Aim traces start at the player's eye. Visible dropped weapons, armoury weapons, and C4 within 48 units snap to an item position. Enemy pings mark the spotted position once and do not follow the enemy. The coordinated YaPB build chooses one enemy-sighting report: observed count plus the enemy’s NAV callout (for example “1 mid”), Enemy spotted radio, or an enemy ping. It uses actual visible-enemy perception rather than requiring a crosshair hit, with 12-second individual and five-second team cooldowns. Unknown callouts fall back to a ping.

The rebuilt broken-ring/diamond MDL retains the original GoldSrc v10 geometry and five-second looping animation. Enemy markers use the red texture variant plus a red warning triangle. Both marker and icon pulse at 1.5 Hz between approximately half and full brightness, without changing scale. BMPs retain the original dimensions, uncompressed eight-bit format, and 256-color palettes.

Team chat includes the pinged position's NAV v5 place name when available: “Player 1 pinged the bomb at Mid.”, “Player 2 pinged an enemy at Mid.”, “Player 3 pinged Mid.”, “Player 4 pinged an AK-47 at Mid.” Missing/unsupported NAV data omits the location suffix. All eight supported languages have chat and Settings translations.

## Visibility and coordinated release

Ordinary world models obey normal PVS/wall occlusion. Managed native clients also receive reliable, team-only `16CPing` messages independent of PVS. The HUD projects weapon, bomb, and warning artwork without depth testing, with offscreen bearings clamped to the screen edge. Thus a teammate at A can receive an image ping from B even when the model is hidden. Location-only pings show only the MDL. HUD images preserve aspect ratio, normalize to 28 pixels high at 1080p, and cap wide weapons at 96 pixels. The exported sprites use a common 96×32 canvas, but the server no longer spawns them: native clients draw a single HUD icon, and other clients retain the MDL fallback.

Ship the backend core, bundled models/sprites, FastDL route, dictionary, launcher, private cosmetic module, and NextClient host together. NextClient host/module ABI is now 6; an old host/module pair will not provide this feature. Live launcher ownership and the non-FFA overlay gate remain required. Browser/unmanaged clients receive ordinary precached entities only; they can bind `16competitive_ping` manually.

## Verification

AMXX core compiles without warnings. Native Linux i686 tests pass, Windows Rust target checks pass, launcher TypeScript and focused lint pass, and adapter tests verify both model files, normalized sprites, and chat dictionary reach isolated match instances. The real Dust2 NAV v5 data parses to 718 areas and consumes all 388,040 bytes. Settings idle/saving/error states have matching geometry in an isolated component preview. MDL texture round-trip checks confirm non-texture bytes remain identical.

An isolated ReHLDS startup smoke test now loads Dust2, precaches all ping assets, answers A2S_INFO, and shuts down cleanly. The sprite exporter pads every declared palette to 256 entries; regression coverage checks palette offsets, frames, and payload sizes for all icons. Corrected sprites use version v2 to bypass any cached v1 files.

A live CS session still needs smoke testing for cross-site icons, item snap placement, bot aim behavior, chat locations, expiry/round changes, and flashing. The complete Windows NextClient host has not been built here; its portable handoff test passes. No live server deployment or restart was performed.


## Repeated-ping transport regression

`16CPing` is registered directly through Fakemeta's engine API. That bypasses Metamod's user-message name registry, so AMXX's ordinary `message_begin` rejects the valid engine ID (148 in the local build). The first ping could create a model before its message failed; the next ping then failed in removal and fell through to the game's unknown-command response. `competitive_ping_transport.inc` begins the message through the same engine API, with the unchanged eight-byte payload and normal writers/end. The isolated `src/amxx/tests/ping_transport.sma` smoke plugin sent four updates and four removals successfully on ReHLDS, then shut down cleanly. Do not load that test plugin in production.

MOUSE3 uses `cmd 16competitive_ping` to explicitly forward to the server. A launcher-owned `16competitive_ping.cfg` is appended through the managed `userconfig.cfg` hook after player startup bindings; classic clients use that hook only for bindings, so it never reconnects the game. Managed match cleanup removes the hook/config and preserves player edits. A currently open game can apply the prepared binding with `exec 16competitive_ping.cfg`.


Duplicate weapon images were caused by the server billboard and native HUD drawing the same ping. The core now spawns only the ground MDL and sends icon data to the native HUD. Server sprite creation and precaching were removed; brightness pulses and fixed HUD scaling remain.

Enemy ping kind 31 now maps to a dedicated native texture slot 32, avoiding the defuse-kit equipment slot 31. Bomb pings retain C4 kind 6 and use the same white silhouette as teammate equipment tags. Native regression coverage checks the warning pixels, white bomb pixels, and unchanged defuse-kit mapping.

C4 and defuse-kit icons now embed the supplied white C4/pliers artwork, preserving its natural aspect ratio and treating black as transparent. Both overhead equipment and pings share these cached textures. Dropped item_thighpack entities snap as defuse-kit pings using wire kind 32 (native equipment slot 31); enemy wire kind 31 continues to use warning texture slot 32. Both updated server and native module are required for kit pings.

NAV callout parsing now checks fread against the requested byte width and converts signed narrow reads to unsigned NAV counts. An isolated AMXX/ReHLDS regression tests 8/16/32-bit reads and named-area lookups against the actual Dust2 NAV. Map initialization logs missing, unsupported, malformed, or loaded NAV details. NAVs belong in the server template cstrike/maps directory, which match instances link; adding files during a map requires a map reload, and an updated plugin requires a new match instance.

The compact green current-location HUD below the radar now resolves the living player’s origin through the same NAV parser every half-second. Dead players see their spectated player’s callout; unknown areas clear the label. Native ReGameDLL location lookup remains fallback only when the NAV parser is unavailable. competitive_location_hud controls this existing HUD.

YaPB yb_ping_comms=1 enables the coordinated sighting path when the core advertises competitive_bot_reports=1 and competitive_player_ping=1. The bot queues the server-only 16competitive_bot_report command with its slot, visible enemy slot, and selected chat/ping mode; the core revalidates bot identity, life/team, view cone, line of sight, cooldowns, and the FFA gate. Count reports include only visible nearby enemies in the same NAV callout. The independent AMXX bot polling loop is disabled for this coordinated build to avoid duplicate reports. Stock YaPB retains the older aim-trace fallback. The isolated ping_bots.sma smoke test verifies off-crosshair spotting, behind-bot rejection, FFA, chat-only selection, cooldown, red markers, missing-callout fallback, and the server command handoff.

A live isolated Dust2 run with 12 YaPB bots exercised all three delivery choices. The core logged “chat=1 Mid” and a red enemy ping marker, confirming the YaPB-to-AMXX server-command handoff. The three standalone YaPB behavior tests also pass; the updated 32-bit Linux YaPB module and core are staged in the server template for new match instances.

Bot count-callout chat renders location names in lowercase (for example “1 mid”).

Human enemy pings retain the scalar TR_pHit entity ID correctly. If the direct trace misses an enemy, a small angular margin around current player bounds can select a visible enemy near the crosshair (about 20 pixels at 1920px/90-degree FOV, capped at 48 world units). Exact hits take priority, larger misses remain ordinary pings, and snap selection requires an unobstructed engine trace. The engine smoke regression covers direct human hits, small/large misses, and the bot/report gates.

Entity pings now replace previous same-team markers for the same enemy/item/bomb/kit, including their HUD icons. Each marker stores target identity separately from its static origin. Target movement never updates it automatically; a fresh ping clears the old owner’s marker and samples the current position. Independent entities and the opposing team’s private pings remain separate. Location-only pings have no entity identity.

Three original synthesized radio-like cues distinguish location, item, and enemy pings. All are mono 22050-Hz, 16-bit uncompressed PCM WAVs lasting 0.22/0.25/0.31 seconds, under sound/16competitive/ping/v1. build-ping-sounds.py reproduces them without samples or dependencies. The server precaches them, sends the chosen cue only to teammates, and match preparation/FastDL/template deployment include the assets. Adapter regression validates the WAV headers and payload sizes.
