# Web Play Steam handoff

Web Play requests fresh, activated manual credentials from the backend for each
launch or reconnect. It validates the response before opening the Steam URI.
The desktop launcher uses its own handoff and is unaffected by this path.

The Web Play URI queues 20 GoldSrc `wait` commands before setting the manual
identity and server password, then immediately connects. Applying credentials
after the delay avoids startup replacing them before the connection attempt.
Each credential is sent once to keep the forwarded command short. This uses
game commands only and does not access any game configuration files.

Run `npm run test:web` for simulated startup credential resets, forwarding to an
already running game, fresh reconnect credentials, invalid responses, and a
match changing while the manual connection request is pending. These tests do
not execute Steam or GoldSrc.

Before deployment, verify Windows and Linux Steam connections with CS closed
and already open. Confirm the player joins the assigned match without a password
rejection. Steam or game variants that ignore forwarded arguments may still
require closing CS first or using Web Play's copied console command.
