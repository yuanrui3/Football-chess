# Coach controls, commentary and own-goal display

Human-controlled sides can delegate continuous play to the ordinary Tactical bot (default) or Casual bot, take over before a queued action commits, or request one bot action followed by a pause. Solo supports Ivory; same-device two-player mode supports both sides independently. Search cancellation rejects stale worker answers. Coaching settings persist, and restored games reopen paused. Control handoffs preserve the match and action clocks. A committed shot completes its presentation before a single-action pause.

Main match commentary now offers Adam only, with On/Off, Test Adam and Match sample. Legacy stored voice choices migrate to Adam while keeping the user's enabled setting. Alternate voice engines and the historical audition page are not exposed by the match UI.

Own-goal targets, tooltips, keeper reaction badges, shot breakdowns, own-goal journal entries and goal replay details omit numeric scoring probabilities. OWN and plain warnings identify the risk. Opponent-goal odds, engine probabilities and outcome randomness are unchanged. Exercises already expose only the player's attacking-goal targets.

Validation: 481 tests passed across commentary/Adam, coaching worker boundaries, own-goal display in both directions, goal replay, keeper catch and rebound, formations, pause/stats, shot animation and empty-net behavior. Browser checks covered single-action pause, immediate takeover, Adam playback/captions, own-goal reaction without numeric odds, both teams, a rotated pitch and paused reload. Screenshot: interface.jpg.
