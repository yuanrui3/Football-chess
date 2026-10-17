# Checkpoint selection and held-out evaluation

Development seeds and tie-breaks were written before reading development results. Held-out seeds were kept separate from training and development. All scenarios use Fouls mode, color swaps and both kickoff sides. These are fixed-action research segments, not full timed matches.

## Development selection

| Checkpoint | Training segments | W–D–L | Goal difference | Shots, candidate / baseline | xG, candidate / baseline |
| --- | ---: | --- | ---: | --- | --- |
| early | 4 | 0–8–0 | 0 | 4 / 3 | 0.391 / 0.417 |
| mid | 48 | 1–5–2 | -1 | 4 / 8 | 0.761 / 0.898 |
| late | 80 | 0–8–0 | 0 | 2 / 2 | 0.222 / 0.204 |

Two seeds (300017 and 300041), four color/kickoff legs each, 80 legal Casual warmup actions and then 96 measured actions, 128 nodes, maximum depth 8. Warmup goals and shots are excluded. This reduced-budget development run cannot promote a checkpoint.

The early checkpoint was selected: maximum paired goal difference, then WDL score, then the earlier checkpoint. It ties the late checkpoint on the first two criteria. This selection rule did not use xG, shot counts or the held-out result. The middle checkpoint lost more often than it won. More training did not monotonically improve measured strength.

The selected checkpoint itself contains **4 training segments, 1,920 transitions and 4 goal rewards**. The larger 80-segment total describes the experiment, not the training exposure of this selected checkpoint. See `selected-candidate.json` for its exact SHA-256.

## Held-out protocol

The frozen candidate is evaluated on seeds 400031, 400079, 400121 and 400171, with four color/kickoff legs each. Each starts from 80 legal Casual warmup actions, followed by 120 measured actions at the actual 1,400-node, depth-8 search budget. Pending shots are settled at the horizon. No held-out outcome is used to change weights, choose another checkpoint or change the gate.

Promotion requires the test split, four complete seed groups, 16 scenarios, at least 16 resolved shots, a meaningful horizon, production search budgets, valid states, positive paired goal difference, WDL score above 50%, and no excessive rise in stalling/offside offences. The seed-cluster bootstrap interval is descriptive; a small screening run does not establish an Elo rating.

## Held-out result and release decision

| Measure | Learned candidate | Frozen Tactical |
| --- | ---: | ---: |
| Wins / draws / losses | 1 / 10 / 5 | 5 / 10 / 1 |
| Goals | 1 | 5 |
| Opponent-goal shots | 16 | 16 |
| Post-reaction xG | 2.286 | 4.015 |
| Offside offences | 1 | 0 |
| Stalling / repetitive carry offences | 0 | 0 |
| Invalid states / unresolved shots | 0 | 0 |

The candidate's WDL score was **37.5%**, with paired goal difference **−4**. Its descriptive whole-seed bootstrap 95% intervals were 21.875–50% for WDL score and −0.5625–0 for mean goal difference per scenario. There were only four independent seed clusters; these intervals are not a stable Elo estimate.

Both policies took 16 shots, while the candidate generated lower total xG. This run provides no evidence of stronger play or better finishing. It passed the legality, node-budget, pairing, horizon, shot-evidence and offence checks, but failed both positive-result promotion checks. No replacement checkpoint was chosen after observing this result.

**Release: trained=true, enabled=false.** The selected four-segment checkpoint is available through the optional **Self-play model** control for Tactical, including both teams in Watch mode. Baseline Tactical remains the default. The model does not change Casual or any gameplay rule. The full 80-segment training lineage is retained for further research, but none of those later checkpoints is silently substituted.

Inference timing under this concurrent CPU workload averaged 1.183 seconds for candidate decisions and 1.016 seconds for baseline decisions; 95th percentiles were 2.082 and 1.884 seconds. These are shared-machine measurements, not guaranteed browser or mobile performance. Both respected the 1,400-node allowance.

The evaluated source is retained byte-for-byte at `frozen/training-engine.mjs` (SHA-256 `0c58acf47dd28a3ccf5c67dc7ef297867f787bb9d18ca88274af5fb6831c8d9b`). The released engine differs in embedded checkpoint metadata and weights, with the default disabled. Candidate evaluation passed these same weights explicitly, so embedding them does not change its mathematics.

Reproduce the held-out run from the repository root:

```powershell
node scripts/evaluate-selfplay.mjs --checkpoint training/selected-model.json --baseline training/frozen/engine-v37.mjs --split test --seeds 400031,400079,400121,400171 --actions 120 --nodes 1400 --depth 8 --warmup 80 --workers 4 --fouls true --out training/held-out-reproduction.json
```

Use different held-out seeds for any future model selected in response to these findings. Reusing this result to select a new checkpoint would turn this test set into development data.

