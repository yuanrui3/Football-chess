# Self-play value learning — 16 October 2026

This experiment adds real, offline reinforcement learning to Football Chess: a seven-parameter value model learns from goals scored in seeded self-play. It supplies a small, bounded adjustment to Tactical's existing position evaluation. The rules, shot probabilities, action allowances and search budget do not change.

The completed training lineage contains **80 fixed-action segments, 38,400 legal transitions and 57 actual goal rewards**. These training totals establish that learning occurred; they do not establish that the resulting bot is stronger. Checkpoint selection and playing-strength results belong to the separate development and held-out evaluations retained with this report. See [checkpoint selection and evaluation](EVALUATION.md) for the release decision and exact measured results.

## What learns

The model is `v(s) = tanh(w · features(s))`, with seven learned weights. Browser inference adds `80 × v(s)` to the existing handcrafted evaluator, so the learned adjustment stays between −80 and +80 evaluation points. An actual goal remains worth 2,000 points in the base evaluator. Each weight is finite and bounded to [−4, 4]. This is a small value model, not a GAN, a large language model, a neural move generator, or learning from scratch.

The features are public-board, normalized, team-relative quantities:

| Feature | Meaning |
| --- | --- |
| `possession` | Controlled possession or the side awarded a restart; zero for an unowned loose ball. |
| `ballProgress` | The carrier's progress toward the opposing goal, signed by possession. |
| `material` | Difference in active outfield material; dismissals matter and the King has no material weight. |
| `centerControl` | Control of the central region, files e–j and internal ranks y=5–11. Legal tackle geometry and pawn-or-King bonus setups contribute; overlapping control has diminishing returns. |
| `openFiles` | Useful forward files for Queens and Rooks, accounting for blockers, movement costs, advancement and reachable friendly outlets. |
| `defensiveCover` | Goal-side outfield coverage behind the ball, concentrated around the corridor toward the team's own goal. |
| `centralReceivers` | Up to two useful central receiving targets in the attacking half, accounting for offside, the carrier's passing pattern, accuracy and challenge exposure. |

The score is excluded from the feature vector. Changing the score alone cannot tell the learner the reward it is supposed to predict. A color swap and 180° board rotation negate the team-relative vector; the model has no separate White and Black weights. Geometry features describe strategic potential with fresh movement allowances, while the existing phase-aware search remains responsible for the actual spent allowances and legal defensive reply.

Controlling the center and opening files therefore become things the learner can value from experience. They are not automatically awarded training points. These concepts also do not imply a persistent tiki-taka system or coordinated team press; the bot still selects actions through its legal candidate generator and bounded search.

## Learning target and update

Training uses online semi-gradient **TD(lambda)** with accumulating eligibility traces. Every transition uses a fixed White perspective. The perspective does not flip when Black acts, because Football Chess can give one team several consecutive decisions.

```text
reward = change in (White goals − Black goals)
delta = reward + gamma × v(next position) − v(current position)
trace = gamma × lambda × trace + (1 − v(current position)^2) × features
weights = clip(weights + alpha × delta × trace, −4, 4)
```

Only an actual engine `finished` state has a zero bootstrap. Reaching the research action limit leaves the last position nonterminal and bootstraps its predicted value. Eligibility traces reset at the beginning of each new segment, not on a goal or a change of possession. A pure forfeit would terminate the value bootstrap without inventing a goal reward; winner and finish-reason metadata are retained separately. No forfeit occurred in these 80 segments.

There is no reward for passing, carrying, possession, center occupation, an open file, a shot, or a prettier formation. Starting from zero weights, a segment with no goal cannot generate weight changes merely by improving those features. After goal experience has produced nonzero values, later zero-reward transitions can legitimately update the model through temporal bootstrapping.

## Self-play behavior and randomness

Both sides use the same current learned weights. To collect experience quickly on a CPU, training uses six handcrafted-ranked legal candidates and one-ply expected public chance outcomes, with 12% exploration within that shortlist. This behavior policy is cheaper than running the full 1,400-node Tactical search at every training action. It constrains what the learner can discover; production playing strength must be measured using the production search separately.

A pending shot is extended through a legal keeper reply and its public goal, save, miss and block outcomes before it is evaluated. A declared shot is therefore not judged as though it merely surrendered a promising possession. The engine enumerates public chance branches, including tackle/foul outcomes, pass scatter and the two possible targets of a disguised shot. Planning copies replace the hidden random state with a constant and never consult the live outcome stream.

The real match transition then uses `applyMove`, `applyKick`, `skipMove` or `selectCornerTaker` without forced outcomes. Its ordinary seeded random stream decides what actually happens. Exploration has a separate reproducible stream, so testing or ranking an action cannot inspect or consume the upcoming match roll. Every executed action is checked against the engine's legal action generation.

## Completed training

| Run | Segments | Atomic actions | Goal rewards | White goals | Black goals | Learning rate |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Corrected stage 1 | 16 | 7,680 | 12 | 7 | 5 | 0.035 |
| Stage 2, resumed from stage 1 | 64 | 30,720 | 45 | 14 | 31 | 0.015 |
| **Cumulative lineage** | **80** | **38,400** | **57** | **21** | **36** | — |

Each segment starts from the standard formation and allows 480 atomic actions. Kickoff alternates between White and Black. Fouls mode is on. All 80 segments reached that action limit; they are not 80 completed wall-clock matches or 90-minute soccer matches. Ten of the first 16 and 39 of the following 64 segments contained at least one goal.

The common settings were gamma=0.995, lambda=0.85, epsilon=0.12, candidate width=6 and maximum absolute weight=4. Stage 1 used environment seeds 100000–100015. Stage 2 used 110000–110063. Resumed checkpoints preserve the entire 80-seed lineage, cumulative transitions and prior goal counts, so later evaluation can exclude every training seed. Checkpoint files also retain the feature order, engine fingerprint, initial weights and configuration.

The final 80-segment checkpoint's weights, in the feature order above, are:

```json
[-0.017037205695739067, 0.03896355993093529, 0.06725453102144376, 0.013453301124116863, -0.026285321777879594, 0.029777617298381773, 0.016163178455716656]
```

These are fitted coefficients, not piece values or a ranking of which soccer tactics are universally best. The final training checkpoint is also not automatically the checkpoint selected for play. Development evaluation compares predeclared early, middle and late candidates, then freezes one before using separate held-out seeds.

Measured training runtime in this workspace was 25.19 seconds for corrected stage 1 and 110.46 seconds for stage 2. This is a machine-specific CPU measurement. It excludes the pilot, smoke tests and production-search evaluations.

The training logger does not measure time in the team's own half, territorial possession, coordinated press sequences or tiki-taka sequences. Those statistics cannot be inferred from the goal totals. Existing own-half stalling and repetition rules remain unchanged.

## Reproduce or continue

Use Node.js from the repository root; no training packages, GPU, API or account are required. These single-line commands also work in Windows PowerShell. The frozen training engine has SHA-256 `0c58acf47dd28a3ccf5c67dc7ef297867f787bb9d18ca88274af5fb6831c8d9b`.

```powershell
node --test tests/selfplay-training.test.mjs tests/rl-features.test.mjs
node scripts/train-selfplay.mjs --engine docs/selfplay-rl-2026-10-16/frozen/training-engine.mjs --episodes 16 --actions 480 --seed 100000 --fouls --alpha 0.035 --gamma 0.995 --lambda 0.85 --epsilon 0.12 --candidate-width 6 --max-weight 4 --checkpoint-every 4 --out docs/selfplay-rl-2026-10-16/train-stage1-forced-shot
node scripts/train-selfplay.mjs --engine docs/selfplay-rl-2026-10-16/frozen/training-engine.mjs --episodes 64 --actions 480 --seed 110000 --fouls --alpha 0.015 --gamma 0.995 --lambda 0.85 --epsilon 0.12 --candidate-width 6 --max-weight 4 --checkpoint-every 16 --initial-model docs/selfplay-rl-2026-10-16/train-stage1-forced-shot/model.json --out docs/selfplay-rl-2026-10-16/train-stage2
```

The output directories are created automatically. Use a fresh `--out` directory to keep another experiment separate. To continue training, give `--initial-model` the previous `model.json` or a checkpoint, choose a new training seed range, and retain all earlier checkpoints. Stage-2 filenames count episodes in that run: `checkpoint-0032.json` contains 48 cumulative segments, and its final `model.json` contains 80. Wall-clock timing and local output-path fields may differ between machines while seeded actions, rewards and weights remain reproducible with the same source and configuration.

Use `scripts/evaluate-selfplay.mjs` for development selection and held-out comparisons. The trainer's optional `--evaluate` mode is a quick diagnostic, explicitly marked `diagnosticOnly`; it does not perform the production evaluator's forced boundary settlement and is not the promotion gate.

## Verification and excluded pilot

The 19 training tests cover the tanh derivative, exact trace updates, color reflection, fixed-perspective consecutive actions, terminal versus nonterminal bootstrapping, bounded finite weights, goal-only rewards, legal exploration, hidden-random-state independence, shot extension, actual engine transitions and cumulative checkpoint provenance. Feature geometry has its separate test suite.

An independent rerun of the first corrected 480-action segment reproduced its score, goal events, sampled action trace, final weights, exploration count, nonzero-delta count and final bootstrap exactly. The retained `reproducibility-audit.json` records those checks.

An earlier 16-segment pilot evaluated shot declarations before completing their mandatory keeper resolution. It is excluded from the counts, training lineage, checkpoint selection and strength claims above. The short 128-action integration smoke is also excluded. Only `train-stage1-forced-shot` and its `train-stage2` continuation form this experiment's 80-segment training lineage.

## Release verification

The complete baseline-default regression suite passed 1,015/1,015 tests. The additional 16 UI tests passed separately. After embedding the selected checkpoint with its default disabled and refreshing asset hashes, all 94 focused learning, release, UI, pawn-awareness, crossing and search checks passed. Two actual versioned module-worker roundtrips matched direct engine decisions with the learned model both off and on. No gameplay or evaluation-function code changed after the full suite; the release embeds weights and metadata with the baseline path retained. Browser verification was limited to controlled VM/DOM/worker checks because the supported browser-control capability was unavailable. Actual visual and audio playback were not exercised.
