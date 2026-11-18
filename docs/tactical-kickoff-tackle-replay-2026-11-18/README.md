# Kickoff tackle replay

This study follows the 13 archived openings where the buildup planner lost attacking rights to a tackle before shooting and frozen Tactical reached a shot or the opening cap without a prior turnover.

## Findings

All 13 starts reproduced the tackle-versus-retention outcome in traced reruns. One planner trajectory matched the original checksums exactly. The other 12 are new trajectories from the same starts. Each selected trace showed the same mechanism. The attacker kicked into space, then exposed the ball to a direct legal tackle when collecting it. Nine of those kicks were taken at kickoff. The tackle that eventually won possession could already be made after the collection in each selected trace.

In the exact Aggressive–Aggressive replay, Black's queen kicked **h9 → i8** on the first action. White moved its queen to **h8** while the ball was loose. When Black collected at **i8** on action 10, White had a legal tackle with a **90%** chance of taking possession. White took the ball on action 13. Black's intervening keeper move left the tackle open.

Two distinct buildup routes passed the stronger-defense retest. Both came from Neutral-versus-Neutral starts.

| Initial change | Continuation | Retest |
| --- | --- | --- |
| White queen passes **g9 → c5** to its bishop | The bishop exchanges with the queen and a rook, receives again, and eventually shoots **j16 → h18**. | **0.096 xG**, four shots and zero turnovers in four draws |
| Black queen passes **h9 → h16** to its keeper | The keeper releases to build up through the outfield, and a bishop eventually shoots. | **0.106 xG**, four shots and zero turnovers in four draws on each of two seeds with the same opening geometry |

The self-pass continuations in these three retest records reached the action cap with zero xG and no turnovers. The new outlets therefore improved shot creation in those probes. Their clean retests do not estimate the turnover-rate difference between the two moves. The four draws for each successful route followed the same action sequence through the shot, so they establish feasible routes against the fixed defender.

A fourth retest passed by shooting immediately from kickoff at **0.012 xG**. In six starts, a route that looked promising in the screen failed the stronger-defense retest. One start produced no qualifying shot in the screen. Two produced no lower-risk kick in the native candidate set. Even in the exact Aggressive–Aggressive example, the original kick produced more xG than its tested replacement under the stronger-defense continuation. The original kick can work with different subsequent play.

| Archived start | First persistent exposure in selected trace | Action | Result of safer-route test |
| --- | --- | ---: | --- |
| Aggressive–Aggressive 1 Black | Black queen collects h9–i8 | 10 | Failed retest |
| Aggressive–Aggressive 1 White | White queen collects g9–f10 | 10 | Failed retest |
| Aggressive–Aggressive 2 Black | Black queen collects h9–i8, exact original trace | 10 | Failed retest |
| Aggressive–Neutral 1 White | White queen collects g9–f10 | 7 | Failed retest |
| Aggressive–Neutral 2 Black | Black rook collects f8–e8 | 17 | No lower-risk first action |
| Aggressive–Neutral 2 White | White queen collects g9–f10 | 7 | Failed retest |
| Defensive–Aggressive 1 White | White queen collects l15–k16 | 41 | Failed retest |
| Defensive–Neutral 1 White | White queen collects g9–f10 | 7 | Immediate kickoff shot at 0.012 xG |
| Neutral–Defensive 2 Black | Black bishop collects b1–d3 | 45 | No lower-risk first action |
| Neutral–Defensive 2 White | White rook collects f9–e9 | 22 | No qualifying shot in screen |
| Neutral–Neutral 1 Black | Black queen collects h9–i8 | 7 | Keeper outlet at 0.106 xG |
| Neutral–Neutral 2 Black | Black queen collects h9–i8 | 7 | Same keeper route at 0.106 xG |
| Neutral–Neutral 2 White | White queen collects g9–f10 | 6 | Bishop outlet at 0.096 xG |

## Method

- The original pilot retained starting-state, trajectory and final-state checksums. The replay reruns its frozen policies on the same starts and saves each action. A planner path is called exact only when all three checksums match. Other cases enter the diagnosis only if the traced planner is tackled while the traced Tactical opening reaches a shot or the cap without a prior turnover. Selection favors exact paths, then the nearest original tackle action among the available traces.
- Each tackle is checked against the native legal moves on the actual defender turn. Exposure starts when an attacker action opens a direct legal tackle and the defender has that opportunity on the recorded trajectory. The audit also identifies which exposure persists to the decisive tackle and records a projected legal tackle before the defender has moved.
- For a vulnerable loose-ball collection, the alternative search branches at the pass that produced the loose ball, when the trace identifies it. Otherwise it branches at the exposure or the last attacking move before the tackle. It screens up to four legal alternatives with a lower immediate unsecured-ball score. This score adds the probability of a loose ball or immediate loss of attacking rights to the probability-weighted best projected direct tackle on retained balls. A pending shot bypasses this tackle check.
- Every continuation shares chance seeds between the original move and its replacements. Both sides use the frozen 350-node Tactical implementation for the two-draw screen. A promising route is replayed on four new draws with 1,400 nodes for the same frozen defender and 350 for the attack. Each continuation runs for up to 48 actions and settles a pending shot. A route passes if it creates more mean first-shot xG, reaches a shot at least once, and turns the ball over no more often than the original move. These are focused position probes.

[Replay checksums and coverage](results/summary.json) · [Counterfactual records](results/counterfactual.json) · [Original pilot](../tactical-kickoff-buildup-pilot-2026-11-18/README.md)
