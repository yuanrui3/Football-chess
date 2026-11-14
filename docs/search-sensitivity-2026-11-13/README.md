# Tactical AI search sensitivity

The study used the engine at [reviewed commit `45fc3f4`](https://github.com/yuanrui3/Football-chess/tree/45fc3f4a43f2775c1eaf6e27737ef4aba76a7403). The controls and node ladder finished on November 14 with 1,600 games. The 5,600-node policy lost 0.152 xG per game against 1,400 nodes. The 1,400-versus-350 comparison was close. The tested production settings were 1,400 nodes and depth cap 8. The search-option arms remain unrun.

The copied `foul-ai` suite was required to pass with options omitted, while the same suite was required to reproduce a known failure on production. The failing test reads the real engine source and exercises its chance enumerator. The fixture expects an 80/20 split even with the keeper outside the box, where production follows the documented empty-net rule. In that fixture production returns a single outcome with probability 1. Repointing the unchanged test at an equivalent engine preserves the failure. [Test](https://github.com/yuanrui3/Football-chess/blob/45fc3f4a43f2775c1eaf6e27737ef4aba76a7403/tests/foul-ai.test.mjs#L61) · [Engine](https://github.com/yuanrui3/Football-chess/blob/45fc3f4a43f2775c1eaf6e27737ef4aba76a7403/dist/engine.js#L1134) · [Empty-net rule](https://github.com/yuanrui3/Football-chess/blob/45fc3f4a43f2775c1eaf6e27737ef4aba76a7403/docs/empty-net-pass-accuracy/README.md)

## Baseline

The pristine LF snapshot reproduced the independent baseline on Ubuntu 22.04 with Node v22.23.4. **2,008 passed and the same four failed out of 2,012** in 9 minutes 47 seconds. Production's SHA-256 was `eb0ab0924c735871ac2186c6e1f0a1ddb450cdd49533413a795a0650c9a89901` at both ends of the run. This satisfied the baseline gate for the unmodified-engine controls and ladder.

The full suite on the untouched Windows checkout with Node v24.22.1 finished in 9 minutes 5 seconds with **2,000 passing and 12 failing out of 2,012**. All four failures from the Linux review reproduced, and eight additional tests failed. The baseline requirement was 2,008 passing with only the four listed failures.

| Case | Observed failure |
| --- | --- |
| [`evaluation.test.mjs`](https://github.com/yuanrui3/Football-chess/blob/45fc3f4a43f2775c1eaf6e27737ef4aba76a7403/tests/evaluation.test.mjs#L250) | The source-slice test cannot find `function applyVoicePreference(){`, the end marker it uses to extract `renderEvaluation`. |
| [`foul-ai.test.mjs`](https://github.com/yuanrui3/Football-chess/blob/45fc3f4a43f2775c1eaf6e27737ef4aba76a7403/tests/foul-ai.test.mjs#L61) | The outside-box keeper case returns `[1]` instead of `[0.8, 0.2]`. |
| [`pitch-expansion.test.mjs`, White](https://github.com/yuanrui3/Football-chess/blob/45fc3f4a43f2775c1eaf6e27737ef4aba76a7403/tests/pitch-expansion.test.mjs#L97) | The selected corner is at `(0,16)`. The assertion expects `(1,16)`. |
| [`pitch-expansion.test.mjs`, Black](https://github.com/yuanrui3/Football-chess/blob/45fc3f4a43f2775c1eaf6e27737ef4aba76a7403/tests/pitch-expansion.test.mjs#L97) | The selected corner is at `(13,0)`. The assertion expects `(12,0)`. |

The current corner rule clears the occupant so the selected taker can use the flag. A separate test covers that behavior for both colours. [Corner-taker test](https://github.com/yuanrui3/Football-chess/blob/45fc3f4a43f2775c1eaf6e27737ef4aba76a7403/tests/corner-taker.test.mjs#L100)

| Additional failures | Cause |
| --- | --- |
| Two [Adam preference tests](https://github.com/yuanrui3/Football-chess/blob/45fc3f4a43f2775c1eaf6e27737ef4aba76a7403/tests/adam-app-preferences.test.mjs#L7) | A literal LF delimiter in the source-slice test is absent in the CRLF checkout. The test extracts the wrong code. |
| One [exercise-solution test](https://github.com/yuanrui3/Football-chess/blob/45fc3f4a43f2775c1eaf6e27737ef4aba76a7403/tests/exercise-solutions.test.mjs#L14) | The CRLF working-tree bytes hash differently. Normalizing the engine and exercise-AI text to LF in memory matched the stored digests. |
| Three feature-source tests in [RL context integration](https://github.com/yuanrui3/Football-chess/blob/45fc3f4a43f2775c1eaf6e27737ef4aba76a7403/tests/rl-context-integration.test.mjs#L8) and the [RL value model](https://github.com/yuanrui3/Football-chess/blob/45fc3f4a43f2775c1eaf6e27737ef4aba76a7403/tests/rl-value-model.test.mjs#L25) | A literal LF delimiter fails to locate each embedded feature block in the CRLF engine source. |
| Two CLI tests in [counterplay training](https://github.com/yuanrui3/Football-chess/blob/45fc3f4a43f2775c1eaf6e27737ef4aba76a7403/tests/counterplay-training.test.mjs#L139) and [self-play evaluation](https://github.com/yuanrui3/Football-chess/blob/45fc3f4a43f2775c1eaf6e27737ef4aba76a7403/tests/selfplay-evaluation.test.mjs#L99) | Each passes a URL's `.pathname` to Node. On Windows the resulting path has a leading slash before the drive letter and percent-encoded spaces. Both fail before the worker comparison. |

```sh
node --test --test-reporter=tap "tests/*.test.mjs"
node --test --test-name-pattern "^main match holds analysis before a shot result is visible" tests/evaluation.test.mjs
node --test --test-name-pattern "^penalty chance trees" tests/foul-ai.test.mjs
node --test --test-name-pattern "boundary restarts use the new touchlines" tests/pitch-expansion.test.mjs
```

## Controls and node ladder

The controls and ladder use one rules module, fouls enabled, and four legs per seed. Each leg crosses candidate White/Black with White/Black kickoff. The horizon is 240 atomic actions, plus the keeper's reaction if a shot is still pending. The primary metric is candidate-minus-baseline xG per game, using the post-reaction goal probability of each resolved opponent-goal attempt. Own-goal attempts and risk are recorded separately. Tactical calls the deterministic search entry point with production defaults apart from the stated budgets. Casual calls production's Casual policy.

The rules, original production engine and null copy use the commit's LF bytes with SHA-256 `eb0ab0924c735871ac2186c6e1f0a1ddb450cdd49533413a795a0650c9a89901`. Each arm has a distinct list of 100 seeds. The first prefix is fixed by the arm's initial cluster count. Seed generation uses the first four bytes of SHA-256 of `football-chess/search-sensitivity/2026-11-13/phase-1/<arm>/<1-based index>` interpreted as an unsigned big-endian integer. It skips any result below 1,000,000 or already drawn. All 400 seeds were checked against the tracked study records and the independent review bundle before the first game.

| Arm | Candidate | Baseline | Initial clusters | Status |
| --- | --- | --- | ---: | --- |
| [Null](null.json) | Byte-identical copy, 1,400 nodes, depth 8 | Tactical, 1,400 nodes, depth 8 | 25 | Passed. All 50 mirrors matched. Mean xG difference 0.000, 95% interval [0.000, 0.000], exact p = 1. |
| [Positive](positive.json) | Tactical, 1,400 nodes, depth 8 | Casual | 10 | Passed. Mean xG difference +0.648, 95% interval [+0.574, +0.720], exact p = 0.001953125. |
| [Ladder down](ladder-down.json) | Tactical, 1,400 nodes, depth 8 | Tactical, 350 nodes, depth 8 | 50 | Complete. Mean xG difference +0.002, 95% interval [−0.024, +0.028], exact p = 0.9047. |
| [Ladder up](ladder-up.json) | Tactical, 5,600 nodes, depth 12 | Tactical, 1,400 nodes, depth 8 | 50 | Complete. Mean xG difference −0.164, 95% interval [−0.198, −0.132], exact p = 6.24 × 10⁻¹². |
| Options, equal nodes | Options on, 1,400 nodes | Tactical, 1,400 nodes | 50 | Deferred |
| Options, equal time | Options on, node limit to be calibrated | Tactical, 1,400 nodes | 50 | Deferred |

In the positive control, Tactical went 23–17–0 (W/D/L) and led 29–1 in goals and 180–14 in shots. It won 38 tackles and conceded one. [Positive report](results/positive-initial.json) · [Null report](results/null-initial.json)

In the ladder-down arm, 1,400 nodes completed a mean depth of 4.140 versus 2.085 at 350. It took 411 versus 352 shots and won 36 versus 16 tackles, with goals 55–56 and a 33–135–32 record. Its xG interval fits inside the ±0.03 margin. [Ladder-down report](results/ladder-down-initial.json)

In the ladder-up arm, 5,600 nodes completed a mean depth of 6.528 versus 4.217 at 1,400. It took 246 versus 514 shots, won 45 versus 193 tackles, and recorded 37–86 goals and a 21–116–63 record. Its xG difference was negative in 47 of 50 seed clusters and in each of the four colour/kickoff combinations. It conceded more tackles in 49 of 50 clusters. The tackle counts do not establish the cause of the xG loss. The preregistered stopping criteria trigger one extension to 100 clusters in each active arm. The run resumed after Ubuntu stopped, retaining 170 completed ladder-up games. The timing totals include both sessions. [Ladder-up report](results/ladder-up-initial.json)

## Extension to 100 seed clusters

| Arm | Games | Mean xG difference | 95% seed-cluster interval | Two-sided sign-flip p |
| --- | ---: | ---: | --- | ---: |
| [Null](results/null-extension.json) | 400 | 0.000 | [0.000, 0.000] | 1 |
| [Positive](results/positive-extension.json) | 400 | +0.579 | [+0.546, +0.613] | 1.58 × 10⁻³⁰ |
| [Ladder down](results/ladder-down-extension.json) | 400 | +0.012 | [−0.007, +0.031] | Certified bounds [0.2120, 0.2137] |
| [Ladder up](results/ladder-up-extension.json) | 400 | −0.152 | [−0.175, −0.129] | Certified bounds [1.4603, 1.4634] × 10⁻²⁰ |

All 200 null mirror pairs matched exactly. In the extended positive control, Tactical went 200–190–10 and led 263–14 in goals, 1,718–181 in shots and 374–32 in tackles won.

The extended ladder-down interval includes zero and its upper endpoint, +0.03114, narrowly exceeds the +0.03 equivalence margin. At 1,400 versus 350 nodes, mean completed depths were 4.149 and 2.095. Goals were 96–103, shots were 828–712, tackles won were 77–30 and the 1,400-node side went 60–276–64. The exact sign-flip count exceeded the work limit. The report gives certified bounds without changing the raw xG effects.

At 5,600 versus 1,400 nodes, mean completed depths were 6.507 and 4.211. The 5,600-node side had 73–161 goals, 527–1,023 shots and a 49–225–126 record. It conceded 383 tackles and won 91. Its xG difference was negative in 93 of 100 clusters and in each colour/kickoff combination. Average search time per decision was 7.46 seconds versus 2.03 seconds with up to 16 games running at once. The exact count still exceeded the work limit after a retry with `--exact-work-limit 500000000`, and the certified bounds agreed with the first report.

The extension was the final planned look. The protocol's classification is inconclusive because it established neither a benefit at 5,600 nodes nor equivalence across both ladder steps. It did establish a regression at the tested 5,600-node/depth-12 setting. Both the budget and depth cap changed in that comparison. The trial does not identify the cause of the xG or tackle differences.

All 400 seed clusters had four unique games. Every shot was resolved, including 19 keeper reactions beyond the nominal action horizon. Every recorded search stayed within its configured node cap. Production and the null copy finished with the original SHA-256. The three proposed search options, their copy-equivalence checks, and the equal-time calibration were deferred for this controls-first run.

At the first look, the null must have exact mirrored game records for each fixed seed and kickoff, with zero seed-level xG differences. The positive control is detected when its 95% seed-cluster bootstrap interval is above zero. Both controls must pass before ladder results are interpreted. A ladder-up lower bound above zero supports more search work. If both ladder intervals are entirely within ±0.03 xG, proceed to candidate ranking and evaluation. Otherwise, the four active arms have one reserved extension to 100 clusters each. Report the fixed-sample percentile intervals at each look and the two-sided sign-flip p-values.

Use Node v22.23.4 on Linux for reproduction. The original repository's current engine is a different revision. From the root of this branch, extract the reviewed engine and the original harness dependencies into a temporary directory. This fetch reads the reviewed commit without updating either published branch. The engine hashes check the LF bytes of the reviewed commit.

```sh
reviewed=45fc3f4a43f2775c1eaf6e27737ef4aba76a7403
git fetch origin "$reviewed"
repro=$(mktemp -d)
git -c core.autocrlf=false -c core.eol=lf archive "$reviewed" -- \
  package.json dist/engine.js scripts/evaluate-selfplay.mjs scripts/simulate.mjs \
  scripts/rl-features.mjs scripts/rl-context-features.mjs scripts/rl-shot-features.mjs \
  | tar -x -C "$repro"
mkdir -p "$repro/docs"
cp -R docs/search-sensitivity-2026-11-13 "$repro/docs/"
cp scripts/paired-tournament*.mjs "$repro/scripts/"
cd "$repro"
```

`report` reads the saved JSONL without playing any games. `run` appends one verified record per game and skips completed legs when repeated. To replay the games, use a fresh output directory with the same commands. Keep each log with its manifest sidecar. `--clusters 100` uses the reserved prefix extension without changing the protocol. The reported intervals use 20,000 seeded bootstrap draws. Exact sign-flip counts use the stored seed effects. If the full count exceeds the work limit, the report gives certified bounds on the exact p-value.

```sh
study=docs/search-sensitivity-2026-11-13
mkdir -p "$study/results"
for arm in null positive; do
  node scripts/paired-tournament.mjs run --config "$study/$arm.json" \
    --out "$study/results/$arm.jsonl" --workers 16 > "$study/results/$arm-initial.json"
done
# Check both control reports before continuing.
for arm in ladder-down ladder-up; do
  node scripts/paired-tournament.mjs run --config "$study/$arm.json" \
    --out "$study/results/$arm.jsonl" --workers 16 > "$study/results/$arm-initial.json"
done
node scripts/paired-tournament.mjs report --config "$study/ladder-up.json" \
  --out "$study/results/ladder-up.jsonl"
# The study reached its single extension. Run this loop after the initial look.
for arm in null positive ladder-down ladder-up; do
  node scripts/paired-tournament.mjs run --config "$study/$arm.json" \
    --out "$study/results/$arm.jsonl" --workers 16 --clusters 100 \
    > "$study/results/$arm-extension.json"
done
```

## What the ladder can establish

The ladder tests whether extra search budget improves this Tactical policy. With the default shortlist widths, an inner kick node admits at most two candidates and an inner positioning node at most three. Intervals contained in ±0.03 xG would support practical insensitivity to the tested budgets at those widths. Candidate selection and leaf evaluation would remain untested explanations. Earlier repository experiments changed candidate selection and evaluation at the same 1,400-node budget and changed observed chance creation against Casual. [Shortlist widths](https://github.com/yuanrui3/Football-chess/blob/45fc3f4a43f2775c1eaf6e27737ef4aba76a7403/dist/engine.js#L2966) · [Earlier crossplay](https://github.com/yuanrui3/Football-chess/blob/45fc3f4a43f2775c1eaf6e27737ef4aba76a7403/docs/tactical-crossplay-2026-10-16/README.md)

The bundle's 25.1% allocation figure groups nodes by cumulative reach probability. The proposed 0.015 cutoff uses the probability of one outcome at its parent. The allocation figure therefore does not estimate how many nodes the floor would save. The ladder-down pilot also includes a 240-action game that ended in `keeperReact` (seed 930017, candidate Black, Black kickoff). The requested boundary settlement addresses that difference. [Pilot source](https://github.com/yuanrui3/Football-chess/blob/45fc3f4a43f2775c1eaf6e27737ef4aba76a7403/scripts/simulate.mjs#L66)

The ladder-down pilot reports a seed-cluster standard deviation of 0.118 xG per game. Using that estimate, the rough 95% half-width is 0.033 at 50 clusters and 0.023 at 100. Even with a true effect near zero, the first look can struggle to fit the interval inside ±0.03. A missed positive control can also reflect signal or power at 240 actions. The earlier repository comparison used eight legs and a 480-action endpoint under older rules. The bundle's sign-flip implementation uses a 32-bit shift for `2^n` and cannot provide the requested exact result at 50 or 100 clusters. [Earlier positive control](https://github.com/yuanrui3/Football-chess/blob/45fc3f4a43f2775c1eaf6e27737ef4aba76a7403/docs/tactical-baseline-2026-10-17/README.md#rejected-round-1-trial-complete-result)
