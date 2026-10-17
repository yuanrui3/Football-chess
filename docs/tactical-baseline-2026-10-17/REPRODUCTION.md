# Tactical improvement benchmark

The frozen tree captures the production v40 rules19/shot15 engine and seven dependency files before any experiment. `frozen-manifest.json` records SHA-256 and byte counts. This run makes no RL updates and explicitly passes `modelWeights: null` for every policy.

`benchmark.mjs` uses one shared rules module for all actual transitions and independently imported policy modules for decisions. Candidate source and rules source are copied into each output directory before workers begin. Inputs are hashed before the run and verified again after it. Policy views mask the hidden outcome RNG. The frozen evaluation runner checks legal actions, input purity, roster/ball/card consistency and the 1,400-node ceiling. Launched shots are always resolved before a fixed horizon ends.

A seed produces four correlated scenarios: candidate White/Black crossed with White/Black kickoff. Do not treat those legs as four independent seeds. Fixed action horizons are research scenarios, not timed football matches. All reports label fouls, action limits, wall time and source hashes.

From this directory:

```sh
node benchmark.mjs --candidate /absolute/candidate-engine.mjs --label candidate-dev --seeds 610017 --actions 160 --nodes 1400 --workers 1 --fouls true --record true
node benchmark.mjs --candidate /absolute/candidate-engine.mjs --label candidate-heldout --split heldout --seeds 720017,720043 --actions 480 --nodes 1400 --workers 2 --fouls true --record true
node benchmark.mjs --candidate /absolute/candidate-engine.mjs --label candidate-vs-tactical --seeds 830017 --actions 480 --nodes 1400 --workers 2 --opponent tactical --fouls true --record true
```

Defaults: frozen v40 Tactical candidate, frozen v40 Casual opponent, 480 actions, 1,400 search nodes, depth 8, extensions enabled, two workers, fouls enabled. `--fouls false` runs a no-foul sensitivity check. `--fouls both` runs both modes for every paired seed. `--rules` can supply a separate rules snapshot; all source policies must remain compatible with it.

Each completed scenario is written immediately. `summary.json` contains cumulative W/D/L, goals, xG, shots, resolved shots, stalls, repetition/dribble-limit awards, offsides, passes, dribbles, tackles, nodes, mean completed depth, and mean/p95 decision time by candidate/opponent. Keep output labels unique; this harness does not resume an earlier run.

Development seeds and reserved held-out seeds were written in `protocol.json` before candidate comparisons. Lock a candidate source hash before using held-out seeds, and do not retune against held-out results.

`node compare-batches.mjs` refreshes `comparison-progress.json` from completed development legs. It includes exact matched seed/color/kickoff prefixes at160,200,240 and480 actions, plus first-goal action counts (with non-scoring legs explicitly retained). It excludes directories named `heldout` and configurations whose split is `heldout`. Only use `--unblind` after the candidate source hash is explicitly locked. The blind baseline test was run concurrently to save compute time; its process completion was checked without reading outcomes.

When comparing goal pace, an earlier goal changes the formation and later trajectory. Cumulative xG along those later paths is useful evidence but cannot alone isolate the value of the earlier decision. First-goal medians are conditional on a leg scoring; always read the accompanying number of scoreless legs.
