# NextClient external React overlay proof

The NextClient 2.5.3 `client_mini.dll` scans the loaded stock `client.dll` for a
code pattern. Replacing that DLL with the current Rust proxy crashes at
`client_mini.dll` RVA `0xC0BC`, so the production NextClient proxy gate must
remain closed. This experiment uses a separate transparent Electron window;
it does not replace a game DLL, hook the process, read game memory, or connect
to a server.

## Run the proof

Start a **windowed** NextClient game or a local map with its original DLL.
Measure the game's client-area screen rectangle (`x y width height`), excluding
the title bar. From `16competitive-client` run:

```powershell
npm run nextclient:overlay:probe -- 560 240 800 600
```

Replace those four example numbers with the actual client-area rectangle.
The development-only React badge appears at the top-left of that rectangle,
allows mouse clicks through to the game, does not take focus, and closes after
30 seconds. It does not require a rebuilt or installed launcher. The wrapper
builds its page in a temporary directory and removes that directory when the
probe exits.

## Verified on this machine

On 2026-09-28, the badge appeared over a private stock-DLL NextClient
`de_dust2` window at `560 240 800 600`. Its timer advanced, and a click through
the transparent overlay dismissed the game's welcome dialog. The overlay
exited after 30 seconds. The private game was then closed. The installed game
and production launcher were not modified by this test.

On 2026-09-28, a separate private copy was also started with `-full -w 800 -h 600`.
The game filled the display with 4:3 letterboxing, but the React badge did not
appear over it, including when the overlay rectangle matched the rendered
game area. That fullscreen path is **not supported** by this proof. The game
copy was closed after testing.

This proves only external rendering and click-through on a windowed game. It
does **not** yet handle moving/resizing the game, fullscreen, TAB
press/release, hiding the stock board, authenticated live scoreboard data, or
the match lifecycle. Those need separate tests before launcher integration.
The normal Linux overlay path is unchanged.
