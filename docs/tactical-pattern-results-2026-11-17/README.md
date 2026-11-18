# What scaled in Tactical Fast pattern learning

**Keep native Tactical Fast as the default.** Learning to reorder its search produced a measurable advantage in the default neutral matchup, where both teams used neutral formations. Tripling the training data improved agreement with the teacher's move preferences, while the match benefit failed to transfer across other formation pairings. The synthetic games remain useful as a replayable benchmark and a way to investigate specific positions.

## Playing strength

All four follow-up experiments used a 350-node cap for both guided search and native Tactical Fast, with up to 120 actions plus pending keeper settlement. Each seed had four games crossing color and kickoff. Effects use guided minus Fast, with uncertainty estimated by resampling whole seed groups. Expected goals (xG) sum the game's scoring probabilities for settled shots.

| Experiment | Games | Main result |
| --- | ---: | --- |
| Confirm the 10,000-position model on neutral starts | 384 | +0.0198 xG/game [0.0136, 0.0258]. Guided won 20, drew 354 and lost 10. |
| Test that model across nine formation pairings | 360 | +0.0081 xG/game [−0.0036, 0.0186]. Guided won 22, drew 304 and lost 34. |
| Compare 10,000 and 30,000 positions across the same nine pairings | 720 | The larger model's paired margin improved by +0.0136 xG/game [−0.0038, 0.0324]. The largest observed gain came from neutral-versus-neutral starts, especially when guided kicked off. |
| Confirm transfer across the other eight pairings on fresh seeds | 960 | The larger model's paired margin fell by 0.0129 xG/game [−0.0233, −0.0031]. The difference in signed match points was +0.0063 [−0.0167, 0.0292]. |

The final test used 120 fresh seed groups, 15 per ordered formation pairing. Both models played separate games against the same frozen Fast policy on the same schedules. Each model's margin was computed against its own Fast opponent, then the two margins were compared. The 10,000-position model went 33–414–33 with +0.0076 xG/game. The 30,000-position model went 35–413–32 with −0.0053 xG/game. The 95% interval for scaling excludes the study's +0.010 xG/game target across these starts. Actual win–loss differences remained uncertain. [Match summaries and frozen input hashes](evidence.json)

## What to carry forward

- **Game generation is practical.** The local CPU generated 540 new Tactical Fast games and 64,803 actions in 19.6 minutes. The 20,000-position extension came from fresh seeds and had zero canonical rule-state overlap with the original corpus. It supplied 166,298 strict move comparisons derived from full Tactical search bounds. [Corpus and labeling evidence](evidence.json)
- **Teacher agreement is an incomplete measure of strength.** On the same 1,000-position validation panel used to choose checkpoints, strict-pair accuracy rose from 72.80% to 73.41%, and teacher first-choice agreement rose from 34.5% to 34.7%. On a separate archived panel, the 10,000-position guided search and native Fast chose the same action on 125 of 128 boards. [Training and board diagnostics](evidence.json)
- **Timing is matchup-specific in this study.** In the final test, the 10,000-position model averaged 132.8 ms versus its Fast opponent's 156.2 ms. The 30,000-position model averaged 131.1 ms versus 127.1 ms. Even in the 110 paired games with identical trajectories, the Fast averages differed by about 25 ms between concurrent runs. These measurements leave repeatable latency gains uncertain. [Paired transfer records](transfer-pairs.jsonl)

The findings apply to this search policy, teacher, two fixed model fits and 120-action windows. The intervals cover game-seed variation. They do not account for training another model from a different initialization. The neutral replay shows one concrete mechanism on one seed. At action 69, the larger model searched one completed depth further at the same node cap, moved its queen to a different square and later created more xG. [Verified neutral-start replay](neutral-replay.json)

## Check the result

Run `node docs/tactical-pattern-results-2026-11-17/verify-transfer.mjs` from the repository root. It recomputes the decisive paired comparison and its intervals from 480 paired rows representing 960 games. Each row identifies the seed, starting formations, guided color and kickoff. The `small` and `large` arrays store guided xG, Fast xG, guided goals, Fast goals, guided search milliseconds and call count, then Fast search milliseconds and call count. `sameTrajectory` records whether the original trajectory hashes matched between the two games. Search timing excludes shared keeper decisions.

The export preserves the numerical inputs for the transfer analysis and the original ledger digests. The full local research archive holds the simulation sources, model weights, labeled training data and complete ledgers.
