# Tactical self-play: scoring and possession pace

This update was prepared against `yuanrui3/Football-chess` main commit `ca628d4159666e8dc8ccee8e30d359c241f24dd2`. It is a small rules adjustment, with the existing Tactical search budget retained.

## What was causing the low scores?

The baseline's main bottleneck was creating shooting opportunities. Two Tactical self-play games produced 13 attempts and 2.568 expected goals, with one goal in each game. Of 137 kick decisions, 79 had no opponent-goal target under the carrier's native movement pattern and 16 had all goal lanes blocked by teammates. Only 42 offered any legal shot.

The bot was not routinely ignoring strong open shots. The two declined opportunities above 10% were both 18.5% queen chances used to set up knights; one sequence led to the eventual 47.2% goal. A separate issue was prolonged carrying: Ivory R2 carried for five rounds in one recorded sequence, with four moves disguised as passes into space followed by self-collection.

## Selected small changes

1. Reduce the goalkeeper's maximum potential save probability from 94% to 90%. Actual saving still depends on arrival time, keeper position and reach. This is not a flat 90% save rate. An aligned, unblocked central shot at physical distance 3.5 rises from 19.81% to 23.14%. Holding the original 13 shot origins, targets and keeper responses fixed raises their total xG from 2.568 to 2.854, or 11.1%.
2. Permit four completed carrying rounds with the same player during uninterrupted control. An attempted fifth carry awards the nearest eligible opponent an indirect free kick near the original ball position, before the move occurs. Self-pass collections count; skips do not reset the count. Genuine teammate control, a shot, turnover or restart resets it. Other players' positioning actions do not spend it.
3. Penalize repeated possession routes throughout the pitch. At completed-round checkpoints, the third occurrence of the same ball square and controlling player in a repeating route of one, two or three rounds awards the opponent the same indirect free kick. New furthest forward progress breaks the cycle. Defensive replies and off-ball shuffles do not determine who is guilty. The existing three-round forward-progress rule remains limited to the possessing side's own half.

4. Allow ordinary dribbling into and across either box. Every entered box square still costs two of the eight dribbling points; an entirely inside move reaches at most four squares. Native shorter movement patterns still apply. Goal-mouth squares remain reserved for the defending keeper; the King cannot enter the opponent’s box. Pass-and-run and collecting one’s own loose pass from outside still cannot enter a box.

Both teams retain protected restart positioning. These are custom game rules. The pace free kicks remain indirect even inside the box, and are protected as a final attacking chance at full time.

## Pace-only candidate: matched 480-action comparison

This first comparison isolates the pace rules and save-cap change, before allowing ordinary box dribbling. Both sides used Tactical at its existing 1,400-node, depth-eight limits, with fouls enabled. Each game stopped at exactly 480 atomic actions. All shots resolved within that budget. Scores list Ivory first.

| Seed / kickoff | Baseline score | Revised score | Baseline shots / xG | Revised shots / xG |
| --- | --- | --- | --- | --- |
| 202610161 / Ivory | 0–1 | 2–1 | 4 / 1.012 | 8 / 1.039 |
| 202610162 / Obsidian | 0–1 | 0–0 | 9 / 1.557 | 11 / 1.818 |
| Total | 2 goals | 3 goals | 13 / 2.568 | 19 / 2.857 |

Attempts increased 46%, and total post-reaction xG increased 11%. Finishing was fortunate in the 2–1 game and unlucky in the 0–0. This small two-seed sample does not establish a typical soccer scoreline. These are fixed-action experiments, not timed ten-minute matches; think time, animation and stoppages change how many actions fit in a timed game. Changing a rule also changes subsequent AI choices and random draw sequences, so paired seeds do not hold every later event fixed.

The revised game awarded one actual repetition free kick to Ivory after Obsidian repeated a Queen-origin loose-ball position at k1. Ivory made the last defensive pawn move, but Obsidian was correctly identified as the offending possessing side. Neither revised game exceeded four carrying rounds.

For the real baseline R2 sequence, replaying the recorded actions through step 457 preserves board, ball and PRNG exactly. Step 458 now aborts the fifth self-collection before R2 moves from e10: Black B2 receives the indirect free kick at the original ball square, e8. This verifies the carrying sanction on an observed exploit rather than only an artificial fixture.

## Box-dribbling screen and final validation

The user then proposed relaxing the ordinary box-dribbling restriction. A frozen one-line movement-rule variant was tested on the same two seeds for 240 actions each. Compared with the pace-only candidate’s matched prefixes, attempts increased from 9 to 11 and post-reaction xG from 1.432 to 2.135. Both screen games ended 1–0, versus 1–0 and 0–0 with the entry ban. The first case improved; the second fell from six to five shots and from 0.931 to 0.829 xG. The extra goal in that second case was a 15.88% tight-angle queen finish.

The eight opponent-box entry/crossing dribbles comprised two queen, five bishop and one knight actions. Both sides used the new rule. Queens took five of eleven attempts, compared with five of nine under the ban; both goals happened to be queen goals. This is useful evidence of additional attacking routes, not proof of long-term piece balance. Twenty-six independent entry-rule cases passed before selecting the variant.

The final 480-action extensions and their exact-replay audit are retained in `box-entry/`. Each extension starts from the original 240-action state and computes only the remaining 240 AI decisions. The combined recorded actions are then replayed from the original seed to recalculate full-game statistics and assert all 480 states. The initial 240-action screen is preserved separately.

### Final selected rules versus the original GitHub game

| Seed / kickoff | Original score | Final score | Original shots / xG | Final shots / xG |
| --- | --- | --- | --- | --- |
| 202610161 / Ivory | 0–1 | 2–0 | 4 / 1.012 | 8 / 2.316 |
| 202610162 / Obsidian | 0–1 | 1–1 | 9 / 1.557 | 10 / 2.253 |
| Total | 2 goals | 4 goals | 13 / 2.568 | 18 / 4.568 |

The selected combination produced 38% more attempts and 78% more post-reaction xG than the original GitHub rules. Compared with the pace-only candidate, box entry produced slightly fewer attempts (18 versus 19) but better overall chances (4.568 versus 2.857 xG). All 18 final attempts resolved within the fixed budget. There were no fouls or penalties in either final game, so the goals were not inflated by penalties.

Sixteen opponent-box entry/crossing dribbles involved bishops eight times, queens five, knights twice and a rook once. Queens took half the attempts and scored three goals; a knight scored the fourth. Bishops contributed six attempts. These counts are descriptive; four goals do not establish reliable piece values. Each game triggered one correctly attributed repetition free kick, and maximum carrying streaks were three and four rounds.

One useful sequence: Ivory was penalized for repetition at action 327 in the black-kickoff game. Obsidian rebuilt from the indirect free kick; N1 entered the box with an L-shaped dribble at 345 and scored a disguised shot at 350, with actual resolved goal probability 50.67%.

All 960 final box-entry transitions, plus the 960 recorded pace-only candidate transitions, replay exactly under the final production engine with no mismatches. Replaying old recorded actions under the expanded legal set does not imply the AI would choose those same actions under the new rules.

## Other coefficient screens

Two alternative changes were each screened on both seeds at 240 actions with the same AI budget. The unchanged baseline prefix produced three attempts and 0.476 xG. Slower keeper dive speed (1.3 to 1.1) produced ten attempts and 1.160 xG, but did not change saves when the keeper was already aligned. Softer distance decay produced three attempts and 0.407 xG. Neither establishes a general gain. The selected save-cap adjustment improves aligned central chances with a smaller conceptual rule change.

## Verification

- All 960 pace-only candidate transitions replay exactly against both its frozen study engine and its immutable production reference. Their only difference is defensive validation of malformed imported pace counters. The later box-entry study uses a separate frozen engine and final production reference.
- All 960 transitions in the two rejected coefficient screens also replay exactly.
- The final full regression ran 861 cases: 860 passed and one exposed an old test helper that did not dispatch or validate the existing corner-taker action. The helper was updated; the previously failing 120-action Tactical case then passed. Together the full run and targeted rerun cover all 861 current cases. An additional focused movement/rules run passed 227 cases. No production change was needed for that helper failure.
- The new pace suite has 32 cases, covering colors, carry accounting, self-passes, skipped actions, cycles of length one to three, attribution, nearest taker, resets, save/Undo, clock protection and AI legality.
- The box-entry update passed 64 DOM scenarios / 1,096 assertions for pace notices, box entry, separate action budgets, restarts, shot animation, corners and disguised shots. These are DOM checks, not native-browser visual inspection.
- All ten cache-busted asset references match file bytes. Existing CSS and the earlier ball-visibility fix are preserved.

## GitHub files

Replace these seven files under `dist/` together: `engine.js`, `app.js`, `index.html`, `match-clock.js`, `ai-worker.js`, `goal-replay.js`, and `match-stats.js`. The last three only synchronize engine import/cache hashes. `style.css` is unchanged.

The update archive also includes this evidence, the updated root README, and changed tests. Those extra files keep repository documentation and `npm test` current but are not required to run the hosted game. No change has been pushed to GitHub by this task.

## Reproduction

The adjacent study folders retain frozen engines, protocols, full action/state records and audit scripts. Node 24 was used; no extra dependencies are required for the engine tests or these study scripts.

From the repository root:

```sh
npm test
node docs/tactical-pace-2026-10-16/final/audit.mjs
node docs/tactical-pace-2026-10-16/final/reprice-baseline-shots.mjs
node docs/tactical-pace-2026-10-16/final/baseline-r2-counterfactual.mjs
node docs/tactical-pace-2026-10-16/box-entry/audit-production.mjs --full
```

To regenerate a self-play case (substantially slower than replaying it):

```sh
node docs/tactical-pace-2026-10-16/diagnosis/run.mjs 202610161 white
node docs/tactical-pace-2026-10-16/final/run.mjs 202610161 white
```

Use seed `202610162` and kickoff `black` for the second matched case. Timing measurements are machine-dependent; recorded legal transitions and probabilities are deterministic.

To regenerate the selected box-entry cases, run `box-entry/run-white.mjs` followed by `box-entry/extend-white.mjs`, or `box-entry/run-black.mjs` followed by `box-entry/resume-black.mjs`, using the full path beneath this study directory. The first runner preserves the 240-action screen; the second computes its remaining 240 decisions and stitches the complete record. Run `box-entry/analyze-white.mjs --full`, `box-entry/analyze-black.mjs --full` and `box-entry/summarize-trials.mjs --full` for the paired 480-action comparison.
