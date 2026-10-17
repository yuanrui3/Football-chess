# Development evidence — no held-out outcomes

Generated 2026-10-17T06:36:13.169025+00:00.

All development results below use seed 610017, crossed with both Tactical colors and both kickoffs. These are four correlated legs from one seed, not four independent seeds. Fouls are enabled, learned weights are null, and Tactical uses the unchanged 1,400-node/depth 8 budget. Actual transitions use the shared frozen production rules 19/shot 15 engine.

Candidate experiments were screened on development results and regression tests. These results do not establish that a release candidate is stronger. Test outcomes remain blind until the parent explicitly locks the final policy source hash.

## 160-action trial horizons

| Trial | Completed/planned | W/D/L | Goals | Shots | xG | xGD | Tactical stalls | Mean/p95 decision ms |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| attack-finish-v2 | 4/4 | 0/4/0 | 0–0 | 7–1 | 1.589–0.076 | 1.514 | 0 | 730/1435 |
| attack-opening-v1 | 4/4 | 0/4/0 | 0–0 | 7–1 | 1.589–0.076 | 1.514 | 0 | 713/1330 |
| attack-wide-v3 | 1/4 | 0/1/0 | 0–0 | 2–1 | 0.228–0.095 | 0.133 | 0 | 683/1291 |
| defense-dev | 4/4 | 0/4/0 | 0–0 | 14–0 | 2.152–0.000 | 2.152 | 0 | 564/1100 |
| search-dev | 4/4 | 0/4/0 | 0–0 | 9–0 | 1.251–0.000 | 1.251 | 0 | 506/950 |
| search-tempo-dev | 4/4 | 0/4/0 | 1–1 | 9–2 | 1.404–0.651 | 0.754 | 0 | 545/944 |

## 240-action trial horizons

| Trial | Completed/planned | W/D/L | Goals | Shots | xG | xGD | Tactical stalls | Mean/p95 decision ms |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| knight-attack-v6 | 4/4 | 1/3/0 | 1–0 | 18–3 | 2.631–0.370 | 2.262 | 0 | 604/1181 |

## 480-action trial horizons

| Trial | Completed/planned | W/D/L | Goals | Shots | xG | xGD | Tactical stalls | Mean/p95 decision ms |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| aggressive-v2 | 4/4 | 3/0/1 | 7–2 | 43–8 | 8.206–0.833 | 7.373 | 0 | 761/1562 |
| balanced-v4 | 4/4 | 3/1/0 | 3–0 | 49–4 | 9.034–0.456 | 8.578 | 0 | 695/1359 |
| baseline-v40 | 4/4 | 4/0/0 | 6–0 | 38–3 | 6.771–0.660 | 6.111 | 0 | 594/1237 |
| combined-v1 | 4/4 | 3/1/0 | 6–1 | 45–3 | 7.647–1.162 | 6.485 | 0 | 859/1638 |
| complete-v5 | 4/4 | 3/0/1 | 4–1 | 45–5 | 8.528–0.932 | 7.596 | 0 | 707/1393 |
| finish-v3 | 4/4 | 3/1/0 | 6–1 | 40–3 | 5.862–1.287 | 4.575 | 0 | 848/1618 |

## Early checkpoint at 200 actions

Only trials with at least 200 actions per completed leg appear here. A pending shot at the boundary is resolved. First-goal medians are conditional on that leg scoring and therefore must be read with the number of scoreless legs.

| Trial | Legs | W/D/L at 200 | Goals at 200 | Shots at 200 | xG at 200 | First-goal median, conditional | Scoreless legs at full trial horizon |
|---|---:|---:|---:|---:|---:|---:|---:|
| aggressive-v2 | 4 | 1/2/1 | 2–1 | 20–2 | 2.344–0.274 | 328 | 1 |
| balanced-v4 | 4 | 0/4/0 | 0–0 | 16–2 | 2.246–0.154 | 276 | 1 |
| baseline-v40 | 4 | 2/2/0 | 2–0 | 15–1 | 2.265–0.058 | 198 | 0 |
| combined-v1 | 4 | 1/2/1 | 1–1 | 16–2 | 2.466–1.086 | 210.5 | 0 |
| complete-v5 | 4 | 0/4/0 | 0–0 | 15–2 | 2.225–0.154 | 276 | 1 |
| finish-v3 | 4 | 1/2/1 | 1–1 | 14–1 | 1.764–0.980 | 210.5 | 0 |
| knight-attack-v6 | 4 | 1/3/0 | 1–0 | 14–2 | 2.010–0.154 | 169 | 3 |

## Completion and limits

- Recorded development scenarios: 49 across 13 batches;15,840 actual atomic actions. No recorded game-state, action-legality, input-mutation or node-cap errors occurred in these completed scenarios. This is separate from the regression suite, which found additional candidate defects.
- Twelve batches completed all four planned legs. `attack-wide-v3` has one of four legs recorded and is explicitly partial; its other three planned legs are not counted. No result is imputed for an unfinished leg.
- Every development batch shown here uses fouls ON. The harness supports OFF/both; no OFF-mode tournament has yet been run in this evidence pack.
- Latency runs overlapped different CPU workloads and are responsiveness screens, not controlled relative-speed measurements.
- A fixed 480-action scenario is longer than the approximate 200 actions available in a 10-minute match at a 3-second decision pace, before animation/clock effects. The 200-action and first-goal checkpoints prevent a later-game chance gain being mislabeled as faster live scoring.
- Earlier goals reset the formation and alter later trajectories. Cumulative later xG is descriptive evidence; it does not isolate the value of a single earlier decision.
- The frozen-baseline held-out process completed while blind. It was unblinded only after the parent locked source SHA4388dc612b14feb2b266dc5389e1f95228c68e994bcabbcfd39c21a5e4d880f3 at06:36:52UTC. Test outcomes remain separate from this development table; see heldout-baseline-report.json and the final test report.

## Reproduction

Run `node benchmark.mjs --candidate /absolute/engine.mjs --label unique-name --seeds 610017 --actions 480 --nodes 1400 --workers 2 --fouls true --record true`. `node compare-batches.mjs` refreshes development comparisons; it excludes held-out names and split metadata unless explicitly invoked with `--unblind`.

Every batch contains its exact candidate/rules source snapshots, configuration hashes, per-leg results and event recordings. `frozen-manifest.json` records the production control and dependency hashes.
