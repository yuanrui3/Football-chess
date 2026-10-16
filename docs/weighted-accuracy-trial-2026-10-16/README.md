# Weighted movement, accuracy and Tactical shooting

**Selected: global finishing accuracy ×1.15 and Tactical unrealized-shot value 450. Fouls were OFF throughout this trial.** All pieces share the accuracy adjustment; knights retain an ordinary ×1 scoring multiplier. These local A/B/C labels are independent of the earlier box-access trial.

This matched trial predates reserved goal-mouth cells, the outside-to-box dribble/run ban and optional pass-and-run. The selected coefficients remain applicable; its recorded scoring rates describe the earlier rules. A later [implementation smoke](../fouls-and-pass-run-smoke-2026-10-16/README.md) covers the new rules without claiming balance calibration.

The common rules charge two movement points for every entered box cell and one outside, excluding the starting cell. Off-ball sliding movement has ten points and dribbling eight. Short native piece patterns, keeper reactions and five-square tackle reach remain unchanged. `constants.json` preserves the geometry, coefficients and search budget.

The accuracy adjustment multiplies raw on-target probability before the existing 98% cap; it does not add 15 percentage points to every goal chance. Keeper reactions, blocks and other coefficients are unchanged. Candidate C additionally lowers the Tactical leaf evaluation's unrealized shooting-threat reward from 650 to 450. Actual goal value, move ranking, search ordering, depth and node budget are unchanged.

| Tactical variant | Accuracy | Unrealized threat value | Opponent-goal attempts | Goals | xG | Attempts worth ≥15% after best keeper response | Attempts worth ≥25% |
|---|---:|---:|---:|---:|---:|---:|---:|
| A, weighted baseline | 1.00 | 650 | 5 | 1 | 1.424 | 3 | 3 |
| B, accuracy only | 1.15 | 650 | 3 | 3 | 2.430 | 3 | 3 |
| C, selected | 1.15 | 450 | 10 | 1 | 1.549 | 6 | 2 |

Each Tactical row contains four selfplay games: seeds 1479304283 and 3682195741, both kickoffs, 480 atomic actions each. Accuracy alone improved observed conversion and total xG but did not increase attempts. C produced more attempts, including twice as many worth at least 15%, while lowering average shot quality: approximately 15.5% per attempt versus B's 81.0%. Its total xG also fell below B. This supports greater shooting activity, not stronger play or realistic soccer scorelines. Selfplay changes both attack and defence, so shot-count differences do not isolate a direct shooting preference.

C was predeclared before Tactical outcomes as a conditional experiment. The first paired seed produced three baseline attempts versus one accuracy-only attempt; meaningful attempts fell from two to one. This triggered C's four prespecified games. No further coefficients were tuned. C differs from B in one private evaluation coefficient; 120 shared Casual actions, complete states, legal kicks and models matched exactly.

Casual selfplay used the same four pinned games per A/B. A produced 18 attempts and six goals (xG 6.959); B produced 23 attempts and six goals (xG 6.734). C does not alter Casual policy, so it reuses B's applicable result rather than rerunning identical policy code.

The opportunity audit checked every Tactical release. Available ≥15% chances were deferred six of nine times in A, one of four in B and seven of thirteen in C; no ≥25% chance was deferred. In a direct fixed-position comparison, C still chose B's same pass instead of a 19.8% shot. The change therefore is not a universal shoot trigger, and low-event or cautious games remain possible.

All twenty games completed 9,600 actions with legal rosters, movement budgets and probability mass. Exact deterministic replay passed. All 59 declarations targeted the opponent's goal and resolved; none were pending or own-goal attempts. Maximum exact-position repetition was one, with corner chains no longer than three in Casual and one in Tactical. The public harness's independent shot/xG counters matched the extracted events.

`protocol.json` records frozen module hashes, pinned seeds, the optional experiment's declaration/trigger and final selection. The selected pre-fouls source hash is `aee831984ae2e5178aaa6328baa5bf0c7d694cb7b758536a1668de868fdba9c3`. These are fixed-action screens, not timed ten-minute matches, a head-to-head strength test or statistically precise rate estimates. A later Fouls ON implementation smoke is a separate dataset.
