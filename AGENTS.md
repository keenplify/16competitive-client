# AGENTS.md

## Project Overview

This repository contains the desktop client / launcher for **1.6 Competitive**, a modern competitive matchmaking platform for classic Counter-Strike / GoldSrc.

The client is built with Electron and TypeScript.

Primary target:

- Counter-Strike 1.6
- Windows
- Linux

Future compatibility may include:

- Counter-Strike 1.3
- Counter-Strike 1.5
- other GoldSrc-era variants where practical

The Electron app should remain a launcher and user interface, not the source of truth for competitive data.

The backend is authoritative for:

- player identity
- MMR / Elo
- match results
- inventory ownership
- bans
- matchmaking
- server assignment
- entitlement checks

The desktop client must be treated as untrusted.

The backend repository is available at `../16competitive`. Inspect its implementation when needed to verify API contracts, authentication behavior, WebSocket events, matchmaking flows, validation rules, and other authoritative backend logic. Do not guess backend behavior when it can be confirmed there. Treat the backend repository as reference-only while working on this client unless backend changes are explicitly requested.

---

## Core Responsibilities

The Electron client should provide:

- authentication UI
- matchmaking queue UI
- live queue status
- match-found flow
- server connection details
- player profile UI
- match history UI
- leaderboard UI
- inventory / skin selection
- asset manifest handling
- skin/model downloading
- local asset caching
- hash verification
- Counter-Strike installation detection
- game/version selection
- launching the correct Counter-Strike executable
- connecting the player to the assigned match server
- client update flow
- user settings
- basic diagnostic logging

Do not move trusted competitive logic into the client.

---

## Non-Goals

Do not implement these in the Electron app unless explicitly requested:

- authoritative MMR calculations
- authoritative match result submission
- authoritative skin ownership
- authoritative ban logic
- authoritative anti-cheat verdicts
- server provisioning
- raw PostgreSQL access
- direct manipulation of backend state
- custom kernel anti-cheat
- DLL injection
- process memory manipulation
- invasive runtime hooks

Avoid invasive game modification if normal files, launch arguments, AMXX/ReHLDS behavior, or backend-controlled game-server logic can accomplish the goal.

---

## Preferred Stack

Use:

- Electron
- TypeScript
- React
- Vite
- Tailwind CSS
- `tailwind-merge` (`twMerge`) for component class composition
- Zustand for renderer state management
- WebSocket connection to backend
- HTTPS REST API for normal requests

Keep shared contracts and non-UI domain logic framework-agnostic where practical.

Do not introduce additional languages into the launcher without a concrete reason.

---

## Process Architecture

Use normal Electron separation:

```text
Renderer
   ↓
Preload
   ↓
IPC
   ↓
Main Process
   ↓
Filesystem / OS / Game Launching
```

The renderer must not have unrestricted Node.js access.

Recommended defaults:

```text
contextIsolation: true
nodeIntegration: false
sandbox: true where practical
```

Expose only narrow, typed APIs through preload.

Do not expose:

```text
require()
fs
child_process
shell execution
arbitrary filesystem access
```

directly to renderer code.

---

## Security Rules

Treat all renderer data as untrusted.

Treat all server responses as untrusted until validated.

Treat all local files as potentially modified.

Required principles:

- validate IPC payloads
- validate backend responses
- validate asset manifests
- verify asset hashes before use
- never interpolate arbitrary values into shell commands
- prefer `spawn()` / argument arrays over shell strings
- do not use `exec()` when `spawn()` is sufficient
- never expose backend secrets in the desktop app
- never store database credentials locally
- never store server-side signing secrets locally
- do not trust client-reported ownership
- do not trust client-reported match results
- do not trust client-reported rank/MMR
- do not permit arbitrary path traversal from manifests
- constrain downloaded files to approved game asset directories
- use HTTPS/WSS in production

If launch arguments contain user-controlled values, validate them before passing them to the game process.

---

## Authentication

The client may:

- authenticate the user
- securely store a refresh/session token
- refresh sessions
- display the current account
- log out

Prefer OS-native secure credential storage where practical.

Do not store sensitive tokens in:

```text
localStorage
plain JSON files
renderer-accessible config
```

The renderer should receive only the minimum session state it needs.

---

## Backend Communication

The backend is expected to use ElysiaJS / Bun.

Refer to `../16competitive` for the current backend implementation and contracts when integrating or debugging client behavior.

Use:

- REST/HTTP for normal CRUD-style operations
- WebSockets for live matchmaking / queue / match state updates

Example live events:

```text
queue.joined
queue.updated
queue.left
match.found
match.preparing
match.assets_ready
match.server_ready
match.connect
match.cancelled
match.finished
profile.updated
```

Keep WebSocket event contracts typed.

Prefer shared TypeScript types if the backend and client are maintained together.

Do not couple UI code directly to raw socket messages.

Use a client/service layer.

---

## Matchmaking UX

Initial population may be small.

The UI should support one simple queue first.

Preferred flow:

```text
PLAY
  ↓
Join Queue
  ↓
7 / 10 Players
  ↓
Match Found
  ↓
Preparing Assets
  ↓
Server Ready
  ↓
Connect
```

Do not create lots of rank queues or game modes before the backend actually supports them.

If warmup/DM integration is added later, the client may show:

```text
Queued: 8 / 10
Warmup server available
[Join Warmup]
```

Do not imply exact queue-time estimates unless the backend actually calculates them.

---

## Match Found Flow

When a match is created:

1. Receive match ID.
2. Receive the game/version required.
3. Receive asset manifest.
4. Check local cache.
5. Download missing assets.
6. Verify hashes.
7. Wait for server readiness.
8. Receive server address / connection command.
9. Launch correct game/version.
10. Connect player.
11. Keep match state visible in the launcher.

Do not launch the game before required assets are verified.

---

## Game Compatibility Layer

Do not hardcode Counter-Strike 1.6 behavior throughout the app.

Use a game adapter abstraction.

Example:

```text
GameAdapter
├── cs16
├── cs15
├── cs13
└── future GoldSrc variants
```

A client game adapter may handle:

- installation detection
- executable location
- game directory
- supported launch arguments
- connect command
- asset destination paths
- config paths
- protocol quirks
- version display
- supported launcher features

Suggested interface concept:

```ts
interface GameAdapter {
  id: string
  displayName: string

  detectInstallations(): Promise<GameInstallation[]>
  validateInstallation(path: string): Promise<ValidationResult>
  getAssetRoot(installation: GameInstallation): string
  buildLaunchArgs(options: LaunchOptions): string[]
  launch(options: LaunchOptions): Promise<LaunchResult>
}
```

Do not assume CS 1.3 and CS 1.6 use identical:

- executable names
- folders
- launch flags
- authentication
- Steam integration
- model behavior
- protocol versions

Keep compatibility isolated.

---

## Installation Detection

Support manual selection even if automatic detection exists.

Potential locations may differ across:

- Steam on Windows
- Steam on Linux
- native Linux installations
- Wine/Proton environments
- older manually installed Counter-Strike versions

Do not silently modify arbitrary discovered installations.

The user should be able to:

- see detected installations
- select preferred installation
- browse manually
- revalidate installation
- choose game version

Store normalized installation metadata.

---

## Linux Support

Linux compatibility is a first-class requirement.

Do not assume:

```text
C:\Program Files
.exe-only behavior
Windows registry
backslash paths
Windows-only shell commands
```

Use Node/Electron path APIs.

Prefer platform-neutral filesystem logic.

Any Windows-specific implementation must have:

- an explicit platform guard
- a Linux counterpart where feasible
- clear documentation

Test:

```text
process.platform === "win32"
process.platform === "linux"
```

Do not make Windows the hidden default architecture.

---

## Asset System

The client manages cosmetic assets before connecting to a match.

The intended backend flow is:

```text
10 matched players
       ↓
backend determines required skins
       ↓
backend sends deduplicated manifest
       ↓
client checks cache
       ↓
downloads missing files
       ↓
verifies hashes
       ↓
places assets in approved game paths
       ↓
game launches
```

The client does not decide which paid/premium skin a player owns.

The backend decides entitlements.

---

## Asset Manifest

A manifest should contain enough information to safely fetch and verify files.

Example concept:

```json
{
  "matchId": "12345",
  "game": "cs16",
  "assets": [
    {
      "id": "ak47-neon-v3",
      "path": "models/1.6competitive/ak47/neon_01/v.mdl",
      "url": "https://cdn.example.com/...",
      "sha256": "..."
    }
  ]
}
```

Required validation:

- path is relative
- path contains no traversal
- destination is inside approved root
- URL uses an approved protocol
- hash format is valid
- duplicate destinations are rejected
- unexpected file types may be rejected

Do not trust manifest paths blindly.

---

## Asset Paths

Prefer unique custom paths.

Example:

```text
models/1.6competitive/ak47/neon_01/v.mdl
models/1.6competitive/ak47/neon_01/p.mdl
models/1.6competitive/ak47/neon_01/w.mdl
```

Do not overwrite Valve default models such as:

```text
models/v_ak47.mdl
```

unless explicitly required and reviewed.

Unique paths make:

- cache management easier
- versioning safer
- rollback easier
- multiple skins coexist
- cleanup easier

---

## Asset Versioning

Use immutable/versioned assets.

Prefer:

```text
skin-id + version
```

or content-addressed paths.

Example:

```text
models/1.6competitive/ak47/184_v3/v.mdl
```

or:

```text
models/1.6competitive/ak47/184_a8f3c2/v.mdl
```

If content changes, use a new version/path.

Do not mutate an existing cached asset in place without changing its version/hash.

---

## Download Modes

Support these eventually:

### Smart

Default.

- download player's equipped skins early
- download required match assets
- keep cache
- reuse assets from previous matches

### Match Only

- download only assets required for the current match

### Full Collection

- download all currently available cosmetics

Do not download the full catalog by default.

---

## Download Manager

The download manager should support:

- bounded concurrency
- cancellation
- retries
- timeout handling
- progress reporting
- checksum verification
- atomic writes
- resume where practical
- cleanup of partial files

Preferred write flow:

```text
download.tmp
    ↓
verify SHA-256
    ↓
rename atomically
    ↓
asset ready
```

Never mark an asset ready before hash verification succeeds.

---

## Asset Cache

Keep cache metadata separate from game state.

Potential metadata:

```text
asset_id
version
sha256
local_path
size
last_used_at
verified_at
```

Do not re-hash every asset on every UI render.

Hash when:

- first downloaded
- file metadata unexpectedly changes
- manifest version changes
- integrity check is explicitly requested

---

## Game Launching

Use the Electron main process for launching Counter-Strike.

Prefer process spawning with argument arrays.

Example concept:

```ts
spawn(executable, args, {
  cwd: gameDirectory,
  detached: false
})
```

Avoid:

```ts
exec(`${executable} ${userControlledArgs}`)
```

Do not use shell execution unless technically required.

Support connecting through appropriate game launch parameters or commands.

Game/version-specific launch behavior belongs in the game adapter.

---

## Match Connection

The backend decides:

- server IP
- server port
- match ID
- authentication token/password if used

The client only:

- receives it
- validates format
- launches/connects

Do not allow a match server to alter permanent account state through the launcher.

---

## Client State

Separate:

```text
server state
local UI state
local machine state
```

Examples:

### Server state

- profile
- MMR
- inventory
- queue
- match
- match history

### Local UI state

- selected tab
- modal visibility
- theme
- download panel visibility

### Local machine state

- game installation path
- download cache
- launcher settings
- asset metadata

Do not mix these into one giant store.

Use Zustand for renderer state management. Prioritize placing application and feature state in Zustand rather than embedding it in React components. Prefer small, domain-focused stores or slices with typed state and actions. Keep server state, local UI state, and local machine state logically separated rather than placing everything in one global Zustand store.

Components should be stateless and driven by typed props and store selectors by default. Use component-local React state only when the state is genuinely local, short-lived, and not needed by sibling components, other features, persistence, or application workflows. Examples include temporary input composition, focus state, and isolated open/closed presentation state.

---

## Suggested Renderer Areas

Potential application sections:

```text
Home
Play
Match
Inventory
Profile
Leaderboard
Match History
Reports
Settings
Downloads
```

For MVP, prioritize:

```text
Play
Match Found
Downloads
Profile
Settings
```

Do not build the entire product navigation before the core flow works.

---

## UI Philosophy

This should feel like a modern competitive launcher around classic Counter-Strike.

Keep UI:

- fast
- simple
- keyboard-friendly
- low-friction
- clear about current state

Important states must be obvious:

```text
Offline
Connected
Queued
Match Found
Downloading
Ready
Launching
In Match
Reconnect Available
```

Avoid UI that makes the player wonder whether the launcher is frozen.

### Component Architecture

Build the renderer from reusable React components instead of repeatedly assembling bare Tailwind markup inside pages and feature screens.

Required principles:

- Prefer an existing shared component before creating feature-local Tailwind markup.
- Extract repeated UI patterns into reusable components with clear, typed props.
- Keep page and feature components focused on composition, state, and behavior.
- Reusable components must accept a `className` prop when their styling may need to be extended.
- Reusable components must merge their default classes with caller-provided classes using `twMerge` by default.
- Caller-provided classes should be able to override conflicting default Tailwind classes.
- Use variants or typed props for supported visual and behavioral differences instead of duplicating components.
- Preserve accessibility semantics, keyboard behavior, and focus states in shared components.

Example:

```tsx
import { twMerge } from 'tailwind-merge'

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement>

export function Button({ className, ...props }: ButtonProps) {
  return (
    <button
      className={twMerge(
        'inline-flex items-center justify-center rounded-md px-4 py-2',
        className
      )}
      {...props}
    />
  )
}
```

Avoid copying long Tailwind class lists across screens. One-off layout markup is acceptable when it is genuinely specific to that screen and is not a reusable UI primitive or pattern.

---

## Error Handling

Errors should be actionable.

Bad:

```text
Something went wrong.
```

Better:

```text
Counter-Strike 1.6 installation was not found.

[Choose Installation]
[Retry Detection]
```

Or:

```text
Could not verify 2 required match assets.

[Retry Downloads]
[Open Diagnostics]
```

Log detailed technical information separately from friendly UI messages.

---

## Logging

Keep local diagnostic logs for:

- app startup
- backend connection
- WebSocket reconnects
- installation detection
- downloads
- hash failures
- game launch
- process exit
- IPC failures

Do not log:

- authentication secrets
- refresh tokens
- passwords
- private backend credentials

Provide an easy way for users to locate or export logs later.

---

## Reconnect Behavior

The app should gracefully handle:

- backend reconnect
- WebSocket reconnect
- temporary internet loss
- launcher restart
- game crash
- match server not ready
- match server crash

If a live match exists for the current user, the launcher should be able to restore the relevant match state after restart.

Eventually provide:

```text
MATCH IN PROGRESS

[Reconnect]
```

Do not rely only on in-memory state.

---

## Updates

Eventually support launcher self-updates.

Keep launcher updates separate from cosmetic asset updates.

Conceptually:

```text
Launcher Update
Game Asset Update
Match Asset Download
```

These are different systems.

Do not block entering the app for non-critical cosmetic catalog updates.

---

## Anti-Cheat

The initial architecture favors server-side anti-cheat and HLTV/manual review.

Do not implement invasive client anti-cheat unless explicitly requested.

The launcher may eventually assist with low-risk integrity checks, such as:

- verifying known launcher-managed assets
- validating selected game installation
- detecting obvious unsupported configurations

Do not pretend client-side checks are authoritative.

A modified client can lie.

---

## Privacy

Avoid collecting unnecessary machine information.

If telemetry is added:

- document what is collected
- collect only what is needed
- avoid invasive process scanning by default
- avoid uploading arbitrary local files
- avoid hidden monitoring

Linux users and technically experienced users should be able to understand what the launcher is doing.

---

## Portfolio Goal

The client should demonstrate:

- Electron architecture
- secure preload/IPC design
- TypeScript
- WebSockets
- real-time matchmaking state
- cross-platform filesystem handling
- asset manifests
- content hashing
- download management
- legacy game integration
- process launching
- compatibility adapters
- robust failure handling

A reliable polished flow is more valuable than many unfinished screens.

---

## MVP Order

Build in roughly this order:

### Phase 1 — Shell

- [ ] Electron app starts
- [ ] Renderer loads
- [ ] Secure preload works
- [ ] Basic routing/layout
- [ ] Settings persistence
- [ ] Backend connectivity status

### Phase 2 — Authentication

- [ ] Login
- [ ] Session restore
- [ ] Logout
- [ ] Secure token storage

### Phase 3 — Game Detection

- [ ] Detect CS 1.6
- [ ] Manual installation selection
- [ ] Validate installation
- [ ] Store preferred installation
- [ ] Add game adapter interface

### Phase 4 — Matchmaking

- [ ] Join queue
- [ ] Leave queue
- [ ] WebSocket status
- [ ] Player count
- [ ] Match found screen
- [ ] Restore queue state after reconnect

### Phase 5 — Asset Pipeline

- [ ] Receive manifest
- [ ] Validate manifest
- [ ] Check cache
- [ ] Download missing files
- [ ] Verify SHA-256
- [ ] Move into approved game path
- [ ] Show progress
- [ ] Handle retry/failure

### Phase 6 — Launch

- [ ] Receive server details
- [ ] Build game-specific launch args
- [ ] Launch CS 1.6
- [ ] Connect to match
- [ ] Track process
- [ ] Detect exit
- [ ] Reconnect button

### Phase 7 — Product UI

- [ ] Player profile
- [ ] MMR/rank
- [ ] Match history
- [ ] Inventory
- [ ] Skin equip
- [ ] Leaderboard

### Phase 8 — Legacy Versions

Only after CS 1.6 works:

- [ ] CS 1.3 adapter research
- [ ] CS 1.3 installation detection
- [ ] CS 1.3 launch flow
- [ ] CS 1.3 asset path verification
- [ ] CS 1.3 backend compatibility
- [ ] CS 1.5 support if desired

Do not let speculative CS 1.3 support block the CS 1.6 MVP.

---

## Suggested Repository Structure

Illustrative only:

```text
src/
  main/
    ipc/
    game/
    downloads/
    auth/
    storage/
    updater/
  preload/
  renderer/
    components/
    pages/
    features/
      auth/
      matchmaking/
      match/
      inventory/
      profile/
      downloads/
      settings/
    services/
    stores/
    hooks/
  shared/
    contracts/
    schemas/
    types/
    constants/

src/main/game/
  adapters/
    cs16/
    cs13/
```

Keep Electron main-process code separate from renderer code.

Keep shared contracts free of Electron-specific imports.

---

## Coding Guidelines

- Use strict TypeScript.
- Prefer small modules.
- Avoid giant IPC handlers.
- Avoid giant React components.
- Prefer reusable shared components over bare, duplicated Tailwind markup.
- Support `className` overrides with `twMerge` by default in reusable components.
- Keep filesystem and process code in the main process.
- Keep display/UI logic in the renderer.
- Keep React components stateless by default; use local state only when it is genuinely isolated and necessary.
- Prioritize Zustand for application and feature state.
- Use typed, domain-focused Zustand stores for renderer state.
- Keep preload APIs narrow.
- Validate IPC with schemas.
- Prefer typed discriminated unions for state machines.
- Avoid `any`.
- Avoid shell commands when Node APIs exist.
- Prefer `path.join()` and platform-safe APIs.
- Add tests for path validation and manifest validation.
- Add tests for game adapter launch arguments.
- Add tests for state transitions where practical.
- Keep user-facing errors readable.
- Keep technical errors in logs.
- Do not silently swallow errors.

---

## State Machines

Use explicit state for important flows.

Example asset preparation:

```text
IDLE
  ↓
CHECKING
  ↓
DOWNLOADING
  ↓
VERIFYING
  ↓
READY
```

Failure states:

```text
FAILED
CANCELLED
```

Example match client state:

```text
IDLE
QUEUED
MATCH_FOUND
PREPARING
SERVER_READY
LAUNCHING
IN_MATCH
FINISHED
CANCELLED
ERROR
```

Avoid managing complex flows with many unrelated booleans.

---

## Agent Instructions

When working in this repository:

1. Treat this repository as the Electron launcher/client for 1.6 Competitive.
2. Keep the backend authoritative.
3. Treat the desktop client as untrusted.
4. Preserve Linux support.
5. Preserve Windows support.
6. Keep game-specific behavior behind adapters.
7. Implement CS 1.6 first.
8. Keep CS 1.3 / CS 1.5 compatibility possible without overengineering it now.
9. Do not add invasive DLL injection, memory hooks, or kernel anti-cheat unless explicitly requested.
10. Prefer normal filesystem assets and launch parameters.
11. Never expose unrestricted Node APIs to the renderer.
12. Keep `contextIsolation` enabled.
13. Keep `nodeIntegration` disabled unless there is an exceptional documented reason.
14. Validate all IPC input.
15. Validate all manifest paths and hashes.
16. Never construct shell commands from untrusted strings.
17. Prefer `spawn(executable, args)` to shell execution.
18. Never trust the launcher to determine ownership, MMR, match outcomes, or bans.
19. Keep asset downloads versioned and hash-verified.
20. Prefer incremental vertical slices over broad unfinished UI.
21. Do not build marketplace/battle-pass complexity before matchmaking + asset preparation + launch works.
22. Do not silently modify Counter-Strike core game files.
23. Use unique custom model paths where possible.
24. Document platform-specific behavior.
25. When adding CS 1.3 or another game version, document verified differences instead of assuming CS 1.6 behavior.
