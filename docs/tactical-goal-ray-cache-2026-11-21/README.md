# Exact goal-ray caching in 700-node Tactical

Tactical on the web game uses a 700-node ceiling. It caches the goal endpoints and paths for each piece type, side, and starting square during search. Each board still goes through the original friendly-blocker checks. Shot probabilities, keeper reactions, and chance draws use the same rules. The depth ceiling, root shortlist, search extensions, and last-completed-iteration rule stay in place. Ordinary rule queries and iteration callbacks receive fresh shot preview paths.

## Why 700 nodes

In the earlier frozen-engine study, 700-node Tactical played 96 paired games against 1,400-node Tactical. It averaged 294 ms per decision versus 547 ms, with p95 of 530 versus 990 ms. Net expected goals were +0.0436 per game [95% interval +0.0251, +0.0628]. The games used neutral formations, 24 seeds crossed by color and kickoff, the same keeper, and a 120-action limit. A separate 54-board timing panel at both budgets found a 42.0% mean saving. These results support the budget choice for this test setting. Changing the node budget can change the selected move.

## Cache validation at the same budget

| Frozen-engine comparison at 700 nodes | Mean without → with cache | p95 without → with cache | Mean time saved |
| --- | ---: | ---: | ---: |
| 48 held-out boards, 96 calls per version | 226.79 → 217.32 ms | 358.49 → 346.68 ms | 4.18% |
| 36 fresh games, 2,134 decisions per version | 273.59 → 256.60 ms | 446.32 → 419.76 ms | 6.21% |

The held-out panel contains one board from each of 48 source games across six phases. Across 96 comparisons at 700 nodes and fixed depth two, both engines returned identical actions, values, principal variations, and search statistics. The paired mean difference was −9.47 ms [95% interval −14.70, −4.38 ms]. All 18 crossed game pairs matched at every action, final state, and per-decision node count. The full-game mean saving had a whole-seed bootstrap interval of 2.06% to 10.51%. The nine ordered formation pairings used aggressive, neutral, and defensive setups, crossed candidate color and kickoff, with the same keeper and a 120-action limit.

These timings come from a frozen research engine on Windows with Node.js 24.22.1 and an Intel Core i9-11900K. The frozen baseline engine has SHA-256 `0fd749202309f4394f7f1201ad8e8397601531a1f0d9bdef1efd061ff9b4bdba`. The cache adapter and the original web engine use the same static-ray mechanism. The two budget and cache studies report their timings separately.

On the production web engine, all 48 boards matched the previous `main` engine in complete search reports at fixed 700 nodes and at completed depth two. A third comparison on each board confirmed the new default matches the previous engine with 700 nodes explicitly requested, for 144 report comparisons overall. The normal Tactical action matched on one board per phase. The worker returned the same action on a seeded kickoff with iteration updates enabled.

In a balanced timing run on the production web engine, 96 calls per version averaged **218.77 → 189.99 ms** (13.2% less time), with p95 **423.53 → 342.90 ms**. This was one same-board run on the Windows host, timed after input cloning. The full suite had the same 89 existing failures before and after the change. Both added cache tests passed. [Production verification](main-verification.json)

## Cross-piece tackle setup

This remains an experimental search policy. A bonus reposition by one pawn can open a tackle for a teammate while both defensive allowances are available. In the 144-game confirmation, it added +0.0043 net expected goals per game [unstratified whole-seed bootstrap interval +0.0009, +0.0084]. Non-shot turnovers were 29 apiece and the setup was selected on eight of 8,589 decisions. Six audited activations repeated just two local tackle patterns. All trajectory changes in the setup cohorts came from Ivory kickoffs, across both candidate colors. This is evidence of a narrow tactical effect. The web engine uses its existing tackle search.

## Reproduce the main-branch comparison

The [verification script](verify-main-ray.mjs) compares this repository’s production engine with the previous web engine at the same search budget, using the [saved held-out panel](ray-panel.json). The focused [engine tests](../../tests/tactical-goal-ray.test.mjs) cover friendly blockers, disguised shots, seeded randomness, and public previews during nested callbacks.

```sh
git worktree add --detach ../football-chess-ray-baseline 5bfab91d77280f6c9d2065c979197baadcb54884
node docs/tactical-goal-ray-cache-2026-11-21/verify-main-ray.mjs ../football-chess-ray-baseline/dist/engine.js dist/engine.js
```

Use `--time` for a same-board latency run. See the [fresh-game parity summary](ray-game-parity.json) for the frozen-engine game results.
