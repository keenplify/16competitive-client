# Regional Matchmaking Frontend Agent Instructions

Update the 16competitive Electron frontend/launcher to support the backend's
multi-region public API setup. The backend repository is at
`../16competitive`; treat it as reference-only and verify contracts there.

## Backend behavior

- Multiple public Elysia APIs share one PostgreSQL database.
- Each API represents a region and owns local game-server capacity.
- The client initially connects to its selected regional API.
- Matchmaking searches locally for the first 90 seconds.
- If `allowRegionExpansion` is `true`, other regions become eligible after 90
  seconds.
- Bot autofill begins after 180 seconds.
- If expansion finds a match on another API, the client must move its
  authenticated matchmaking WebSocket to that match's `hostApiUrl`.
- Backend timing and matchmaking decisions are authoritative. Do not reproduce
  them as client-side business logic.

## 1. Discover API nodes

Start from a configured bootstrap API URL and call:

```http
GET {bootstrapApiUrl}/nodes
```

An optional regional filter is available:

```http
GET {bootstrapApiUrl}/nodes?region=eu
```

Example response:

```json
{
  "nodes": [
    {
      "id": "eu-1",
      "region": "eu",
      "publicApiUrl": "https://eu.example.com",
      "capacity": 8,
      "activeConnections": 123,
      "activeMatches": 4,
      "available": true
    }
  ]
}
```

Let the player select a region, or automatically select a healthy available
node using connectivity and measured latency. Prefer the selected region and
`available: true`. Never connect the client directly to PostgreSQL.

## 2. Connect and authenticate the WebSocket

For `https://eu.example.com`, connect to:

```text
wss://eu.example.com/matchmaking/ws
```

Use `ws://` only for local HTTP development. On connection the server sends:

```json
{ "type": "connected", "authenticated": false }
```

Immediately authenticate with the existing session token:

```json
{ "type": "authenticate", "token": "<session-token>" }
```

Wait for the `authenticated` response before sending queue or ready-check
commands:

```json
{
  "type": "authenticated",
  "player": { "id": "...", "username": "...", "mmr": 1000 }
}
```

Keep tokens out of renderer persistence and logs. Follow the existing secure
main/preload credential boundary.

## 3. Add the expansion preference

Add a matchmaking setting with this suggested label:

> Expand search to other regions after 90 seconds

Represent it as `allowRegionExpansion: boolean` and default it to `true` unless
an existing saved preference says otherwise.

Join matchmaking with:

```json
{
  "type": "join_queue",
  "mode": "5v5",
  "mapId": "de_dust2",
  "allowRegionExpansion": true
}
```

Set the field to `false` for local-only searching. The backend persists the
choice, including for parties.

## 4. Display queue state

Handle `queue_joined`:

```json
{
  "type": "queue_joined",
  "mode": "5v5",
  "mapId": "de_dust2",
  "region": "eu",
  "allowRegionExpansion": true
}
```

Handle `queue_status`:

```json
{
  "type": "queue_status",
  "mode": "5v5",
  "mapId": "de_dust2",
  "queuedPlayers": 6,
  "playersRequired": 10,
  "position": 2,
  "region": "eu",
  "allowRegionExpansion": true
}
```

The UI may use its elapsed timer only for presentation:

- 0-89 seconds: `Searching in Europe`
- 90-179 seconds with expansion enabled: `Searching other regions`
- 180+ seconds: `Waiting for players or bot autofill`

Do not use the UI timer to decide match eligibility. Restore authoritative
queue state after reconnecting with:

```json
{ "type": "get_queue_status" }
```

Leave with:

```json
{ "type": "leave_queue" }
```

## 5. Perform cross-region host handoff

`match_found` now includes the API that owns the match:

```json
{
  "type": "match_found",
  "matchId": "...",
  "mode": "5v5",
  "mapId": "de_dust2",
  "region": "us",
  "hostApiUrl": "https://us.example.com",
  "teams": {
    "teamA": [],
    "teamB": []
  }
}
```

`hostApiUrl` is authoritative. If it differs from the current API:

1. Save the `match_found` payload and `matchId`.
2. Open `{hostApiUrl}/matchmaking/ws`, converting HTTPS to WSS.
3. Authenticate the new socket with the same session token.
4. Wait for `authenticated`.
5. Promote the new socket to the active matchmaking socket.
6. Close the old socket only after the new socket is authenticated.
7. Send the ready response through the new host socket only.
8. Pin automatic reconnects to the host API while that match is active.
9. If handoff fails, show a retryable connection error; do not send ready
   through the previous API.

Accept readiness with:

```json
{
  "type": "match_ready_response",
  "matchId": "...",
  "accepted": true
}
```

Send `accepted: false` to decline. Treat repeated match events idempotently,
keyed by message type and `matchId`. Cross-node outbox delivery is at-least-once,
so duplicate messages are expected and valid.

## 6. Support the complete live lifecycle

Continue handling these server message types:

- `match_ready_check`
- `match_ready_updated`
- `match_countdown`
- `match_server_starting`
- `match_connect`
- `match_finished`
- `match_cancelled`
- `error`
- `pong`

Example connection event:

```json
{
  "type": "match_connect",
  "matchId": "...",
  "host": "game.example.com",
  "port": 27015,
  "password": "...",
  "joinToken": "..."
}
```

Use these values in the existing game adapter/launch flow. Validate them and do
not log or unnecessarily persist the password or join token.

## 7. Make reconnect behavior safe

- Send `{ "type": "ping" }` periodically and expect `{ "type": "pong" }`.
- Reauthenticate after every WebSocket reconnect.
- Send `get_queue_status` after the socket is authenticated again.
- Use bounded exponential backoff.
- During match handoff, prevent generic reconnect logic from returning to the
  player's original regional API.
- Do not silently move an ordinary queued connection to another API. The
  backend performs expanded matching while preserving the original preference.
- Do not infer that a player left the queue solely because the socket dropped.
- Reply to `party_presence_ping` with the received nonce:

```json
{ "type": "party_presence_pong", "nonce": "<received nonce>" }
```

## 8. State and architecture

Keep raw WebSocket handling in a typed client/service layer rather than UI
components. Use a domain-focused Zustand store or state machine for at least:

- selected node and region
- active API and WebSocket URLs
- socket and authentication state
- `allowRegionExpansion`
- queue start time and authoritative queue status
- active match ID, region, and host API URL
- pending host handoff state

Keep server messages authoritative. Preserve the repository's Electron
security boundaries, Linux/Windows compatibility, typed contracts, and
component conventions.

## Scope

Implement the client integration for node discovery/selection, the expansion
flag, queue display, cross-region WebSocket handoff, duplicate event handling,
and reconnect behavior. Do not modify the backend, database, matchmaking
timers, or game-server orchestration.
