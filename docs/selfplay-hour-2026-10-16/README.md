# One-hour self-play and baseline-counterplay experiment

This experiment extends the original seven-weight TD model with a prior-consistent learning target, direct training against frozen Tactical, 28 contextual features, and a larger residual-scale ablation. The session began at 2026-10-17 00:08 UTC (October 16, 8:08 p.m. in Indiana), with an approximate one-hour compute budget. Results and the final promotion decision are recorded separately after evaluation; this document describes the method and predeclared test.

This remains a small learned adjustment to the existing Tactical evaluator and search. It is not a from-scratch neural policy, GAN, or AlphaZero implementation. Center control and open files are engineered inputs whose coefficients learn from experience. There is no direct reward for occupying the center, opening a file, completing a pass, or retaining possession.

## What changed in the learning target

The preceding learner predicted goal returns and then added that prediction to an evaluator that already knew about possession and goal threats. More training did not resolve that mismatch. The new target learns the correction to the deployed prior itself.

Let `B(s)` be the existing handcrafted White-perspective evaluation, `D(s)` the White-minus-Black score difference, `S` the residual scale, and `phi(s)` the public feature vector:

```text
H(s) = [B(s) - 2000 × D(s)] / S
H(true terminal) = 0
v(s) = tanh(w · phi(s))
deployed nonterminal evaluation = B(s) + S × v(s)

r = change in White goals minus Black goals
delta = E[(2000/S) × r + gamma × (H(next) + v(next))]
        - (H(current) + v(current))
```

True-terminal continuation is zero. An artificial action limit retains bootstrapping. The score ledger is removed from `H` so a goal is not counted once in the explicit reward and again in the prior. All values stay in White's frame across consecutive actions by the same team; the sign does not flip automatically after every action.

The update uses accumulating eligibility traces with `gamma=.995`, `lambda=.97`, the tanh gradient, and weights bounded to `[-4,4]`. Zero weights preserve baseline evaluation exactly. Compared scales are `S=80` and `S=320`, bounding the adjustment to ±80 or ±320 evaluation points; baseline values a goal at 2,000 points. The latter is a capacity ablation, not an increase to any piece's movement, shooting odds, or rule strength.

The TD target averages public successor branches for the chosen action, including pass scatter, fouls, saves and goals. Ordinary pass scatter is enumerated; long-shot misses use the engine's existing bounded symmetric quadrature. This is an expected public model target, not advance access to the live random outcome. Actual trajectories use an independent environment stream, and policies receive a sanitized planning state. Expected goal mass is logged separately from goals that actually occurred.

## Features and prior knowledge

The original seven features remain available for backward compatibility. The contextual family keeps them as its prefix and adds phase, action-budget and geometric information:

| Group | Inputs |
|---|---|
| Original seven | Possession, ball progress, material, center control, open files, defensive cover, central receivers |
| Action opportunity | Acting team, remaining ordinary move, shared pawn/keeper bonus, remaining dribble, immediate kick possession |
| Carrier geometry | Squared attacking depth, centrality, visible goal opening, presence in the opponent's box |
| Exposure | Direct tackle risk, pawn/keeper reposition-then-tackle risk, nearby defender pressure |
| Receiving options | Safe passes, safe forward passes, central receiving quality, finishing receiving geometry |
| Other context | Opposing keeper displacement, dribble-limit pressure, own-half stall pressure, advanced-zone center control and open files |

All 28 features are normalized, use public state, exclude the score and hidden RNG, and are antisymmetric by requested side. The exposure features honor an already-spent defensive reply budget; attack positioning and pass-and-run face a fresh subsequent reply. Setup risk includes both pawns and the king, legal tackle landing space, knight tackle resistance, and the foul setting. Receiving options honor pass shape, occupied lanes, and offside.

`ordinaryMoveTempo` describes the ordinary positioning budget; it does not count the optional pass-and-run action. Finishing receiving quality is a geometric potential, not exact piece-specific xG. Existing handcrafted move ranking, safety calculations, and search remain substantial priors. The learned model has no human-match pretraining.

The encoder passed a 240-state Casual-play audit against the engine's exact acting-team and tactical tackle-risk functions, with no mismatches in those quantities, the seven-feature prefix, or checked onside pass lanes. Targeted tests cover back-passes, pass-and-run, keeper reactions, legal king setups, and the king's forbidden opponent-box entry.

## Training procedure and reproducibility

The bulk runs mix frozen-baseline opponents with self-play, alternating learner colors and kickoff assignments. Their inexpensive behavior policy considers eight handcrafted-ranked legal candidates and expected successors; baseline Tactical uses a 128-node budget during these bulk rollouts. The principal runs use 480-action segments, four workers, 10% exploration, and no warm-up. The contextual S80 run uses learning rate `.001`; the legacy seven-feature comparison uses `.003`.

Additional fine-tunes use actual Tactical search for both policies at the production 1,400-node budget, with 80 warm-up actions and 160 training actions. S80 starts from contextual checkpoint 8, with learning rate `.0005` and exploration `.05`; a further four-segment continuation uses seed `180000`, learning rate `.0003`, and exploration `.03`. The S320 comparison starts with fresh zero weights; its full-budget branch uses learning rate `.0005` and exploration `.03`. Run configuration files record the exact completed lengths, parent checkpoints and opponent mix.

An additional declared branch fits a small **search-backup auxiliary** alongside goal TD. For a completed candidate search, its public backed-up value is converted to White's frame, subtracts the current handcrafted value, divides by `S`, and clips to `[-.95,.95]`. A separate `.0003` tanh-gradient update fits that target. It uses the candidate's own completed search, not a fabricated goal or the opponent's private result. This branch uses 512-node learner searches and 256-node baseline searches during training only. It can distill search biases, so it must pass the same independent release test. It is a hybrid TD/search-fitting experiment rather than purely goal-only fitting.

Each worker batch freezes behavior weights before generating experience. The parent replays returned trajectories in deterministic episode order, resetting traces between episodes. Checkpoints include source hashes, seeds, parent lineage, actual goals, expected goal mass, TD updates and auxiliary-update counts. Frozen-batch replay is approximate policy iteration, not importance-corrected off-policy evaluation. Reproduction requires the same worker/batch configuration, snapshot bytes, parameters, and ordered seeds; changing the worker count changes when the behavior policy updates.

Run commands from the repository root. The packaged aliases below preserve immutable training sources; `training/frozen/engine-v37.mjs` is the unchanged baseline. PowerShell accepts these commands as single lines.

Contextual S80 bulk training:

```powershell
node scripts/train-counterplay.mjs --engine docs/selfplay-hour-2026-10-16/frozen/engine-context.mjs --baseline training/frozen/engine-v37.mjs --episodes 64 --actions 480 --seed 130000 --workers 4 --policy beam --candidate-width 8 --baseline-policy tactical --baseline-nodes 128 --baseline-fraction .5 --epsilon .1 --alpha .001 --gamma .995 --lambda .97 --checkpoint-every 8 --out docs/selfplay-hour-2026-10-16/reproduction/train28-S80
```

Fresh S320 bulk ablation:

```powershell
node scripts/train-counterplay.mjs --engine docs/selfplay-hour-2026-10-16/frozen/engine-scaled.mjs --baseline training/frozen/engine-v37.mjs --episodes 32 --actions 480 --seed 150000 --workers 4 --policy beam --candidate-width 8 --baseline-policy tactical --baseline-nodes 128 --baseline-fraction .5 --epsilon .1 --alpha .001 --gamma .995 --lambda .97 --residual-scale 320 --checkpoint-every 8 --out docs/selfplay-hour-2026-10-16/reproduction/train28-S320
```

Full-budget S80 fine-tune from the reproduced checkpoint:

```powershell
node scripts/train-counterplay.mjs --engine docs/selfplay-hour-2026-10-16/frozen/engine-context.mjs --baseline training/frozen/engine-v37.mjs --initial-model docs/selfplay-hour-2026-10-16/reproduction/train28-S80/checkpoint-0008.json --episodes 4 --actions 160 --warmup 80 --seed 140000 --workers 4 --policy tactical --node-limit 1400 --baseline-policy tactical --baseline-nodes 1400 --baseline-fraction 1 --epsilon .05 --alpha .0005 --gamma .995 --lambda .97 --checkpoint-every 4 --out docs/selfplay-hour-2026-10-16/reproduction/train28-full-S80
```

Search-backup branch from the reproduced S320 checkpoint:

```powershell
node scripts/train-counterplay.mjs --engine docs/selfplay-hour-2026-10-16/frozen/engine-scaled.mjs --baseline training/frozen/engine-v37.mjs --initial-model docs/selfplay-hour-2026-10-16/reproduction/train28-S320/checkpoint-0016.json --episodes 32 --actions 160 --warmup 80 --seed 170000 --workers 4 --policy tactical --node-limit 512 --baseline-policy tactical --baseline-nodes 256 --baseline-fraction .5 --epsilon .05 --alpha .0005 --gamma .995 --lambda .97 --residual-scale 320 --search-backup-alpha .0003 --checkpoint-every 8 --out docs/selfplay-hour-2026-10-16/reproduction/train28-S320-search
```

The search-backup branch mixes baseline and self-play opponents equally in expectation. Only the learner's search, or the same candidate policy's search in self-play, supplies auxiliary targets; baseline search reports are excluded. Incomplete searches and extreme terminal values are ignored. Run configuration files remain authoritative for exact reproduction and completed segment counts.

## Independent promotion gate

Training seeds are in `[120000,199999]`. Development uses seeds `320017,320041,320083,320123`; reduced-budget screening and any production-budget confirmation are development results only. Selection uses development WDL and goal difference, with xG difference as a tie-break. One candidate's SHA256 is locked before opening final test results; it cannot be replaced after seeing them.

The final test uses eight fresh seeds, both kickoff teams, and both candidate colors: **32 scenarios**. Each starts from the same paired 80-action warm-up and runs 120 scored actions, settling a pending shot at the horizon. These are fixed-action segments, not complete 90-minute football matches. Both policies use identical rules, fouls enabled, depth 8, extensions enabled, and **1,400 nodes**. The learned candidate gets no larger playing-time node allowance or hidden-outcome information.

Promotion requires all of the following:

- At least eight complete seed clusters, 32 scenarios, and 32 resolved shots combined.
- WDL score `(wins + .5 × draws) / scenarios` of at least `.60`.
- A whole-seed-cluster 95% bootstrap lower bound above `.50` for WDL score and above zero for mean goal difference.
- Positive overall paired goal difference; no invalid states, illegal actions, unfinished shots, or safety-limit truncations.
- No more than `.5` additional stalling/offside offences per 100 actions relative to baseline.
- Immutable candidate, rules and baseline source hashes throughout evaluation.

The evaluator resamples complete seeds, keeping their four related color/kickoff legs together. Eight clusters remain a small sample; passing is a strict screening result for this protocol, not proof of universal strength. A failure leaves baseline Tactical as the default. More episodes, later checkpoints, or a higher training goal count do not guarantee a stronger model.

For a locked checkpoint, use the matching frozen snapshot (`engine-context.mjs` for S80 or `engine-scaled.mjs` for S320):

```powershell
node scripts/evaluate-selfplay.mjs --engine docs/selfplay-hour-2026-10-16/frozen/engine-context.mjs --checkpoint docs/selfplay-hour-2026-10-16/selected-model.json --baseline training/frozen/engine-v37.mjs --split test --seeds 450017,450043,450089,450131,450173,450211,450257,450293 --actions 120 --warmup 80 --nodes 1400 --depth 8 --workers 6 --fouls --strict-gate --out docs/selfplay-hour-2026-10-16/reproduction/held-out.json
```

The final release decision and exact evidence are in [RESULTS.md](RESULTS.md). The one-hour budget limits candidate search and evidence collection; no strength claim follows solely from completing training.

### Final piece-aware feature branch

A final 37-feature family keeps the exact 28-feature prefix and adds six signed carrier-type indicators plus the engine's existing best reacted shot and first/second legal finishing-outlet probabilities. The browser and trainer share the generated encoder; it does not approximate or alter the shooting rules. The parent search-assisted 28-feature checkpoint was migrated by appending nine zero coefficients, preserving every prediction exactly and adding no training experience. Eight further 160-action segments used 80-action warmups, learner Tactical at 512 nodes, frozen-baseline opponents at 256 nodes, scale 320, TD learning rate 0.0005 and search-backup rate 0.0003. Evaluation still uses equal 1,400-node budgets. This branch was declared in the protocol before any final test.

Reproduce the final branch from its preserved zero-extended parent (run at repository root):

```sh
node scripts/train-counterplay.mjs --engine docs/selfplay-hour-2026-10-16/frozen/engine-shot.mjs --baseline training/frozen/engine-v37.mjs --initial-model docs/selfplay-hour-2026-10-16/shot37-initial-zero-extended.json --episodes 8 --actions 160 --warmup 80 --workers 4 --seed 190000 --policy tactical --node-limit 512 --baseline-policy tactical --baseline-nodes 256 --baseline-fraction 0.5 --candidate-width 8 --alpha 0.0005 --gamma 0.995 --lambda 0.97 --epsilon 0.05 --residual-scale 320 --search-backup-alpha 0.0003 --checkpoint-every 4 --out /tmp/football-chess-shot-reproduction
```

The worker batch size is part of the training procedure. Runtime timing and absolute path metadata can differ; weights and completed-game evidence should reproduce under the same engine, seeds and configuration.

### Verification notes

The archive retains intermediate failed checks as well as final passes. An early model-on pawn regression required the queen to move first. Its selected free-pawn move followed by a safe queen dribble was legal and immune to every direct or bonus-setup reply. The regression now checks the complete legal attacking turn, actual progress, search limits and exhaustive tackle exposure, with the original unsafe position retained as a positive control. Baseline and model-on safety suites both pass; see the pawn audit and semantic regression reports. A later combined feature test initially expected the old seven-weight validation error wording; the assertion was updated to name the now-supported 7/28/37 families, while retaining rejection checks for malformed, nonfinite and excessive weights. Its final run passes.

The installed engine is compared to the frozen evaluation engine after normalizing only the selected-model export and its explanatory comment. All function source is identical. Evaluation passes the locked weights and scale explicitly; the installed worker uses that same checkpoint and scale when enabled. Four real versioned-worker roundtrips check kickoff and attack positioning with the model both on and off. Static imports and source syntax are checked. Browser visual QA is unavailable in this environment, so these checks do not claim a full visual browser test.
