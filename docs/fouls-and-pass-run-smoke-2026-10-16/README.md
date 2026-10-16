# Fouls and pass-and-run implementation checks

The short box-entry smoke uses frozen engine `f8f4869965c49adf6d5e122846938531dc2404f52b373bb120cd54675abad59c`, with Fouls ON, reserved goal-mouth cells, the outside-to-box dribble/run ban, the loose self-pass entry guard and optional pass-and-run. Seed 3621279913, White kickoff, ran once per difficulty for 120 atomic actions. No policy parameters were tuned on these runs. It predates the subsequent saved-shot team-metadata and saved goal-record repairs; separate mirrored attribution regressions cover those corrections.

| Difficulty | Actions | Score | Opponent-goal attempts | Pass-runs offered / taken | Runtime |
|---|---:|---:|---:|---:|---:|
| Casual | 120 | 0–0 | 0 | 3 / 3 | 1.3 s |
| Tactical | 120 | 0–0 | 0 | 4 / 4 | 31.3 s |

Both runs completed without an error, retained eleven active players per team, and replayed all 240 complete states exactly. All 198 submitted move actions were legal; no forbidden goal-mouth occupancy or outside-to-box dribble/run entry occurred. No exact position repeated. These short games exercise the new pass-run phase naturally; they provide no evidence of scoring balance, realistic pace or a change in shooting frequency.

No shots, fouls, cards or penalties occurred in this small smoke. Separate deterministic public-simulator tests cover plain/yellow/red fouls, second yellows, goalkeeper replacement, penalty goal/save counters, dismissal persistence, forfeits, and pass-run acceptance/decline. The focused command `node --test tests/foul-simulation.test.mjs tests/simulation-stats.test.mjs` passed all 34 tests. The harness forwards the optional kick flag, preserves the next normal allowance when a run is declined, consumes it when taken, and counts own-goal and opponent-goal attempts separately.

`current-protocol.json` preserves the source and harness hashes, seeds, rules and coverage limits. `current-short-smoke.json` contains both compact summaries and exact-replay results. Timings were measured during concurrent development checks and are not browser latency measurements.

An earlier four-game Tactical Fouls ON smoke used engine `f03a0e518b6cc1ca2a963923adf85fe0339554d729d155eee16ab29d9c71e301`. Its seeds were 2488063171 and 729413587, both kickoffs, 480 actions each. All 1,920 actions completed and replayed exactly: two goals from seven opponent-goal attempts, xG 2.902, four fouls, three yellow cards, no reds or penalties, and a maximum corner chain of one. It predates the goal-mouth reservation, new box-entry restrictions, pass-and-run and AI own-goal-shot filtering. Its results are historical implementation evidence, not predictions of current play. The three `historical-f03-*` files preserve its original protocol, compact results and replay audit.
