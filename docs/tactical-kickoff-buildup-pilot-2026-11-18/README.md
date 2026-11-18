# Kickoff-to-shot pilot

This experiment asks whether explicitly comparing buildup routes makes the kickoff side more dangerous against frozen Tactical under the same decision-time allowance.

## Results

The buildup planner produced **0.0252 less xG per kickoff** than frozen Tactical across 36 paired openings. The seed-paired 95% interval was **−0.0468 to −0.0051**. It reached a shot less often, and the shots it reached averaged 0.066 xG versus 0.110 for Tactical.

| Measure | Frozen Tactical | Buildup planner |
| --- | ---: | ---: |
| Reached a shot | 13/36 (36.1%) | 8/36 (22.2%) |
| xG created per kickoff | 0.0398 | 0.0147 |
| Turnovers before a shot | 4/36 (11.1%) | 19/36 (52.8%) |
| Reached the 64-action opening cap | 19/36 | 9/36 |
| xG conceded after a turnover per kickoff | 0.0072 | 0.0078 |
| xG conceded per turnover | 0.0648 | 0.0148 |
| Mean opening decision time | 343.7 ms | 338.8 ms |
| p95 opening decision time | 347.3 ms | 369.6 ms |

The shot-rate difference was −13.9 percentage points [−33.3, +5.6]. The difference in concession xG per kickoff was +0.0006 [−0.0144, +0.0157]. Both arms conceded two shots in their counterattack windows. The conditional concession numbers describe four Tactical turnovers and 19 planner turnovers. Net xG per kickoff after the follow-up fell by 0.0258 [−0.0511, +0.0006].

The turnover increase was 41.7 percentage points [+25.0, +58.3]. Seventeen planner openings ended with a tackle, compared with three for Tactical. The planner completed alternative-route comparisons on 321 of 514 eligible own decisions and chose an alternative to its own Tactical fallback on 102 decisions. Its simulated routes reached a shot on 116 of 974 completed rollouts. The trial measures this 14-action planner with short simulated replies and a position score for unresolved branches. The value of other ways to plan the opening remains open.

The actual mean decision times differed by 1.4%. The timing guards check the clock between units of work. Forty-seven of 769 planner decisions and four of 1,267 Tactical decisions exceeded the shared allowance by more than 25 ms. Opening counts also differ because the two policies reach shots, lose possession, or hit the cap at different points.

[Complete results and per-pair checksums](results/summary.json) · [Paired opening records](results/pairs)

## Design

- Each of the nine ordered Aggressive, Neutral and Defensive formation pairings contributes two fresh game seeds. Both colors take kickoff on each seed. Each opening is played twice from the same engine state, once with a buildup planner and once with frozen Tactical in charge of the kickoff side. The defender uses frozen Tactical both times. The order of the two arms is balanced.
- A separate panel of 30 opening decisions gives a mean of 342.14 ms at Tactical's original 1,400-node budget. The two pilots use a shared 342 ms allowance and the same keeper policy. Frozen Tactical keeps its native candidate ranking, evaluation and depth cap and may use up to 50,000 nodes under the deadline. The search retains its last completed iteration. A move that finishes early returns immediately. Work already underway at the deadline can cause small overruns.
- The opening ends at its first settled shot, loss of attacking rights before a shot, or 64 actions. A shot announced at the action cap receives one more action for the keeper response. Expected goals are the engine's probabilities after the keeper response. Openings that reach the cap contribute zero observed xG and are counted as censored.
- When the kickoff side turns the ball over before a shot, frozen Tactical controls both sides for up to 24 more actions. The window ends early at a goal or game termination. Conceded xG sums the shot probabilities in favor of the opponent, with own goals broken out in the results. This measures the danger the opening leaves behind with the subsequent policy held fixed.
- The same initial random seed is used within each pair. Different trajectories can use random draws in different situations. The analysis pairs outcomes and groups the two kickoff colors by their shared seed when estimating uncertainty.

[Frozen protocol](results/protocol.json) · [Timing calibration](results/calibration.json)

## Buildup planner

At each decision the planner reserves part of its allowance for a legal Tactical fallback. It compares that move with alternatives such as passing to a different receiver, advancing into space, and moving a teammate into a supporting position. It simulates up to 14 actions per route with legal replies chosen anew on each board. The simulation uses its own paired chance draws and the keeper-adjusted shot probability. Unfinished routes are valued by possession, turnover risk, and changes in Tactical's position score. The planner plays one action and recalculates on its next turn.
