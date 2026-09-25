# Anti-cheat enforcement boundary

The private Rust helper collects client evidence and reports it to the backend.
The backend validates player identity and match membership, correlates evidence,
and owns bans, matchmaking restrictions, and match cancellation. Client reports
are untrusted inputs; neither a signature nor a reported binary hash establishes
that a player's machine is clean.

The public launcher displays server-authorized bans and **MATCH TERMINATED**
notices. Helper integrity or availability failures produce repair/connection
errors, not cheating bans. Reports and strong gameplay alone are not ban verdicts.
Bots are excluded from player enforcement.

Detailed server detection rules, thresholds, deployment instructions, and private
review-pool policy are documented in the backend's `docs/anti-cheat-enforcement.md`.
Helper packaging and authentication are described in [native-game-inspector.md](native-game-inspector.md).
