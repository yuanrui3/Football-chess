Reducing the hypothetical first dribble budget from eight movement points to seven or six removes some safe destinations, but did not eliminate any sampled side's last safe escape. This is a local counterfactual, not a recommendation or evidence about match balance, scoring, possession duration or win rate.

| Hypothetical dribble budget | Legal destinations | Safe destinations | Mean safe options | States with a safe dribble | States with a safe forward dribble | States with safe dribble or safe outfield pass |
|---|---:|---:|---:|---:|---:|---:|
| 8, current rule | 872 | 377 | 4.71 | 68/80 (85%) | 46/80 | 72/80 (90%) |
| 7 | 842 | 356 | 4.45 | 68/80 (85%) | 46/80 | 72/80 (90%) |
| 6 | 808 | 333 | 4.16 | 68/80 (85%) | 46/80 | 72/80 (90%) |

A seven-point budget removes 21 of 377 safe destinations (5.6%). Six removes 44 (11.7%). Safe-option counts decrease, particularly for queens: their mean falls from 11.29 to 10.35 or 9.29 across 17 sampled queen positions. Native pawn, keeper and knight movement does not reach either threshold, so their legal carries are unchanged. Six-point carriers may still move fewer than six geometric squares when entering the box, because each entered box square costs two points.

The audit reuses the same 80 evenly spaced attacking states from seven completed development scenarios, seed 610017 with paired colors/kickoffs and two policies. It uses an immutable copy of the current final engine, SHA256 `4388dc612b14feb2b266dc5389e1f95228c68e994bcabbcfd39c21a5e4d880f3`, rules 19, shot model 15. No rule constant was edited and no additional matches were simulated.

For each current legal carry, the script first applies the move and excludes it if the actual result awards a pace, repetition or offside free kick, or otherwise loses that carrier's possession. None of the 872 candidates did so. It then checks every eligible direct normal tackle and every legal shared pawn/keeper bonus move followed by any eligible defender's normal tackle. All 872 baseline classifications agree exactly with the original exhaustive audit. This required 872 defensive reply states and 6,485 actual bonus steps. Offside eligibility and real action budgets are retained.

The hypothetical budgets are filters on that first dribble only: `movementCost(carrier, destination) <= budget`. Native geometry, board occupancy, box costs, defending replies and current passing rules remain fixed. A safe destination means no immediate clean tackle can be legally attempted through that reply. It does not guarantee possession through another round. Existing safe outfield passes are measured on receipt before the receiver uses its optional dribble and are held fixed. No hidden random seed or held-out match results informed safety classification.

The result suggests the last two movement points add escape variety more than they create the existence of an escape in these sampled positions. It does not show that reducing the range would have no effect on actual play: both players' later choices, team shape, pressing and scoring would adapt. These observations cover one paired development seed and should not be generalized as a population estimate.

Reproduce from the extracted evidence directory using `node dribble-range-sensitivity.mjs`. The script reads its engine snapshot, original sampled states and original pass audit, then writes `dribble-range-sensitivity.json` and prints the summary. Detailed per-state/per-destination results are in that JSON. No canonical source files are modified.
