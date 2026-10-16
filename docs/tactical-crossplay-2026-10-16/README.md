# Tactical cross-play study — 16 October 2026

Selected C2: receiver-aware attack construction plus a lower value for retaining the ball compared with scoring. The prior Tactical policy already dominated possession, but often circulated into wide space without producing a shot. C1 alone did not improve the balanced development results. C2 converts useful positions into actual attempts while keeping the same goal probabilities, chance branches and 1,400-node search budget.

Each row reports Tactical against unchanged Casual. Wins/draws/losses and goals are measured after exactly **720 atomic actions**, not a timed UI match. Both colors and both kickoff teams are included for each seed. Fouls mode is on.

## Development seed: four balanced configurations

| Tactical policy | W/D/L | Goals | Opponent-goal attempts | Post-reaction xG |
|---|---:|---:|---:|---:|
| Previous policy | 2/1/1 | 3–1 | 6–7 | 2.710–0.903 |
| C1: attack construction | 1/2/1 | 3–2 | 9–10 | 2.058–1.055 |
| C2: selected | 3/1/0 | 8–0 | 56–12 | 9.177–1.175 |

## Heldout seed: four balanced configurations

C2 was frozen before any second-seed outcome was inspected. These games were not used for further tuning.

| Tactical policy | W/D/L | Goals | Opponent-goal attempts | Post-reaction xG |
|---|---:|---:|---:|---:|
| Previous policy | 2/2/0 | 4–2 | 7–6 | 3.310–0.664 |
| C2: selected | 4/0/0 | 9–0 | 49–13 | 6.715–1.255 |

## Combined paired comparison: eight configurations

| Tactical policy | W/D/L | Goals | Opponent-goal attempts | Post-reaction xG |
|---|---:|---:|---:|---:|
| Previous policy | 4/3/1 | 7–3 | 13–13 | 6.019–1.566 |
| C2: selected | 7/1/0 | 17–0 | 105–25 | 15.892–2.431 |

The selected policy improves the observed results and attack output in this small fixed sample. This supports shipping it, without establishing a universal win rate. Mean Tactical shot xG changes from **0.463 to 0.151**: C2 accepts more moderate chances instead of waiting for rare point-blank finishes. Mean shot distance rises from **2.195 to 3.535 squares**, using Euclidean ball distance.

Tactical completed 891 ordinary rounds with the previous policy and 567 with C2. Thus the increase in shooting is not explained by receiving more completed rounds within the fixed action budget. Human players can still choose pass-and-run; C1/C2 use ordinary passes during search so the next off-ball move is not committed prematurely.

Measured thinking time averaged **431.239 ms** per previous-policy decision and **518.877 ms** for C2. Workers had varying contention; these are descriptive costs, not isolated hardware benchmarks. No extra node allowance was given to C2.

## Integrity and pressure checks

- Replayed all **14,400 transitions** from all 20 complete games using the frozen common rules and exact recorded actions. Every state, RNG continuation, final score, shot declaration/resolution count, xG sum and foul/card count matched.
- 175 declared shots and 175 resolutions across the whole study; 0 own-goal attempts. No rule-integrity errors or forfeits.
- C2's largest score-aware exact-position repetition count was **1**. The public harness excludes scores from its position key, so its larger board-only counts include formations recurring after goals.
- C2 produced **45 corners** across eight games; the longest same-possession corner chain was **5**. This pressure is useful, but repeated parries and offside interruptions remain areas for future polish.
- All selected games used the same public finishing physics and card probabilities as the baseline. Goals were not made more likely for the stronger level.

## Reproducibility and stopping

[protocol.json](protocol.json) records seeds, complete source hashes, the v29 baseline commit, legacy corner adapters and the unchanged search allowance. [summary.json](summary.json) provides development/heldout aggregates and paired deltas. [match-summary.json](match-summary.json) lists every complete case. [replay-audit.json](replay-audit.json) and [pressure-audit.json](pressure-audit.json) provide recount checks and shot-origin/corner details.

All four completed C1 development games are retained, including the unfavorable results. Two incomplete second-seed C1 workers were stopped after progress-only output; their outcomes were never inspected or used for C2 tuning. The fourth development case was restarted to completion on the same frozen C1 module. [c1-stopped.json](c1-stopped.json) records the interruption. Partial runs are not counted as matches or wins.

The common actual corner-taker selection policy was deliberately held fixed across levels for this arena. Corner choice strength itself is therefore outside this comparison. The final selected source matches C2's recorded full-engine hash. The common engine's transition rules differ from the final release only in an unused malformed-save normalization path; its embedded C1 Tactical policy is bypassed when the baseline or C2 policy wrapper supplies decisions.


## Frozen reproduction bundle

`frozen/shared-rules.mjs` is the immutable common transition engine and exact C1 source. `frozen/baseline-engine.mjs` contains the adapted previous Tactical policy. `frozen/selected-engine.mjs` is exact C2. Their SHA-256 values match the protocol. The three small policy wrappers force the common Casual corner selector in actual play, as the original arena did. `frozen/simulate.mjs` is the exact measurement harness, with its relative import resolved locally. `frozen/manifest.json` records every bundled file hash.

From the repository root, run a complete four-configuration seed with:

```bash
node docs/tactical-crossplay-2026-10-16/frozen/reproduce-one-seed.mjs --variant=c2 --seed=1632189751
node docs/tactical-crossplay-2026-10-16/frozen/reproduce-one-seed.mjs --variant=c2 --seed=3807295163
```

Use `--variant=baseline` for the paired previous-policy cases or `--variant=c1` for the four development cases. The default is 720 actions; `--actions=0` checks local imports and initial integrity without running a cohort. Each command writes compact match records to stdout and progress to stderr. CPU contention changes timing, while fixed seeds and node allowances preserve actions and outcomes.

All three variant import paths were validated with `--actions=0`, and their pending-corner wrappers were checked against the common selector. No additional full cohort was run for this packaging check. The frozen measurement harness retains the original restart-award counter, which also notices a corner-taker selection changing restart metadata; the corner totals in this report come from the replay event audit, excluding selection events. The current public simulation harness corrects that counter separately.
