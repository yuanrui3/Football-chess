# Football Chess shot probability pilot

**Research status. Closed after the pilot.** Known shot probabilities produced no first-move quality gain over sampling on the nine qualifying held-out buildup positions at either tested time cap. The pilot cleared the position coverage and goalkeeper control requirements. It missed the registered improvement threshold. The result ends this benchmark study at the pilot stage.

The pilot compares sampled shot outcomes with known shot probabilities under an equal decision-time cap. It uses the engine reviewed at commit `45fc3f4a43f2775c1eaf6e27737ef4aba76a7403` and frozen search rules. The main question is whether probability-weighted backups select better first moves in positions where a strong finish takes several decisions. [Literature review](../football-chess-research-review-2026-11-14.md)

## Held-out results

The 22 development positions set a six-action horizon and a 2 ms allowance after tree preparation. The held-out set had 33 positions from 31 source families, including 27 positions reached in Casual self-play. Nine buildup positions qualified for the primary comparison, six from natural play. Their six-action reference values exceeded their four-action values by 0.071 to 0.186 expected goals. Each position was measured eight times per method at each cap. The run used Node v24.22.1 on Windows. [Development calibration](results/calibration.json) · [Frozen protocol](results/protocol-lock.json) · [Held-out lock](results/holdout-lock.json)

Positive regret reduction means that the known-probability method chose a better first move under the shared reference. The practical threshold for qualifying buildup positions was **+0.005 expected goals per decision**.

| Held-out group | Positions | Regret reduction at 2 ms with 95% interval | Regret reduction at 8 ms with 95% interval |
| --- | ---: | ---: | ---: |
| Qualifying buildup | 9 | 0.00000 [0, 0] | 0.00000 [0, 0] |
| Qualifying natural buildup | 6 | 0.00000 [0, 0] | 0.00000 [0, 0] |
| All buildup | 11 | 0.00000 [0, 0] | 0.00000 [0, 0] |
| Kick decisions | 11 | +0.00287 [0, +0.00838] | +0.00011 [0, +0.00034] |
| Goalkeeper reactions | 11 | +0.00056 [0, +0.00139] | 0.00000 [0, 0] |

The shared ranking placed a reference-optimal action first in eight of the nine qualifying buildup positions. Both methods found the better second-ranked move in every run on the ninth, the wide-rook relay exercise. At 2 ms the methods chose literally the same action in 67 of 72 paired trials. At 8 ms they agreed in 66 of 72. Every remaining pair was a tie in reference value. The deeper reference distinguished good from weak actions, while the existing candidate ranking left little room for a shot backup to improve the first choice. [Decision records](results/decisions.json) · [Aggregate results](results/result.json)

Both methods received the same decision-time cap, with shared tree preparation charged to each. Preparation averaged **569.15 ms** on qualifying buildup positions. At the 2 ms allowance, the known and sampled methods averaged **1.27 ms and 2.01 ms** after preparation and completed a full sweep in **51 of 72 and 52 of 72** calls. Development review found that 2 ms fit only one of the four qualifying development sweeps. The registered 8 ms sensitivity provided a better test of completed searches. The arms completed **69 of 72 and 67 of 72** sweeps, including all 48 natural-buildup calls on each side. The primary and sensitivity goal comparisons had zero overruns under the registered tolerance. The shorter known-probability backup saved time after the tree was ready. Tree construction accounted for almost all measured decision time. [Calibration timings](results/calibration.json) · [Timing results](results/result.json)

The goalkeeper control matched the analytic best immediate reply in **88 of 88** known-probability calls at 2 ms. Sampling matched it in **82 of 88**, and both matched all 88 calls at 8 ms. The separate continuation reference changed the best keeper reply in **two of 11** positions when a non-goal catch or awarded restart carried value. The continuation timing comparison was unusable at 2 ms. Neither arm completed a full sweep, and both exceeded the overrun tolerance on more than 60% of calls. The computed reference is evidence about the stated possession proxy. The timed trials give no reliable comparison of continuation-aware methods. [Continuation records](results/decisions.json)

## Scope of the closeout

The two methods used a fixed candidate tree. Its Tactical ranking already incorporates probability-informed features. At each terminal shot, both methods constructed the same native goal distribution. One received its expectation and the other drew a binary goal outcome. This isolates shot-backup noise and compares cheap, repeated draws with the known expectation. It leaves open the cost and benefits of search methods that build their own trees on demand, and of learners trained over full matches. The zero-width buildup interval describes the observed families at these two budgets. Near-tied choices, more varied starting policies, and longer continuations remain outside that evidence.

In the primary target, a goal is worth one in the scoring team's favor. The target includes a keeper reaction on a shot declared at the horizon. Larger pre-shot chance branches are approximated in both arms by two probability-stratified samples. The common beam retains up to two ranked positioning candidates plus a legal skip and all legal opponent-goal shots and keeper reactions when reached. The longer reference is exact over that bounded tree and goal law. The continuation analysis uses Tactical's existing wide-shot approximation and a 0.1 possession or restart valuation on non-goal outcomes. [Planner implementation](planner.mjs)

The engine SHA-256 and study scripts were checked against the locked protocol. All 68 focused engine tests passed. A separate check verified probability mass, the disguised-shot mixture, and goal thresholds against 170 live-engine transitions on the held-out reaction positions. No engine behavior or game settings changed. [Integrity records](results/result.json)

## Protocol

- Freeze the position generator, planner, decision rule, and the development-selected horizon and time cap before evaluating held-out actions. Hold out whole source games and exercise families. Retain all registered cases with separate results for goalkeeper reaction, kick, and attacking buildup.
- Build one shared legal candidate tree for each position and charge its measured construction time to each method. Each timed call receives the same additional wall-clock allowance. Both methods query the same shot law. The sampled arm sees independent goal draws from that law, while the known arm backs up the underlying probabilities. Both use the same non-shot transitions, candidate ordering, and scoring horizon. Alternate execution order and report elapsed times, overruns, search work, and first choices.
- The primary target is signed expected goals through the first resolved shot or the horizon, whichever comes first. The reference searches the same finite candidate tree using known probabilities. Choice regret is the best reference value less the reference value of the chosen first move. The reaction task is a positive control. A secondary reaction analysis includes a fixed continuation value for controlled possession or a protected restart after a non-goal.
- Classify additional depth before observing timed decisions. Use the probability-weighted reference at four actions and at the frozen longer horizon. Choose horizon six if it identifies at least four qualifying development positions and horizon eight otherwise. The primary subset consists of attacking buildup states where the longer reference adds at least 0.025 expected goals and first moves differ by at least 0.01 in reference value. These are bounded tree checks. Also report the results on all buildup states.
- Use eight paired calls per case at the primary cap and eight at four times that cap. Calibrate the primary allowance from development cases only. Require that a warm known-probability sweep fits the primary allowance on at least 80% of development positions from the candidate grid of 2, 5, 10, 20, and 40 milliseconds after common preparation. Use the smallest qualifying value, with the 40 ms ceiling recorded if none qualifies.
- Pair the methods within a position and repetition. Average repetitions within a position and positions within their source family. Use 20,000 seeded resamples of source families for the 95% percentile interval. This interval characterizes the pilot corpus. Report performance alongside the mean elapsed decision time, including common tree construction.

The pilot supports pursuing this line only if the qualifying depth subset spans at least six independent families, at least three from naturally reached games, and the known arm reduces mean first-move regret by at least **0.005 expected goals** at the primary cap. The paired 95% interval must be above zero, the point estimate in the natural subset must favor known probabilities, and the known-probability reaction control must match its analytic reference in at least 95% of calls. A call counts as an overrun if it takes more than the cap plus the greater of 1 ms and one quarter of the cap. More than 5% overruns in either arm calls for diagnosis and a repeat on the locked protocol. The result governs further work on this benchmark and learning experiment.

## Reproduction

Run with Node.js 22 or later. On the original repository's newer engine revision, use a plain LF export of the reviewed engine and its exercise files. Use a fresh output directory for a repeat. Wall-clock measurements vary by computer and workload.

```sh
reviewed=45fc3f4a43f2775c1eaf6e27737ef4aba76a7403
git fetch origin "$reviewed"
assets=$(mktemp -d)
out=$(mktemp -d)
git -c core.autocrlf=false -c core.eol=lf archive "$reviewed" -- package.json dist \
  | tar -x -C "$assets"
pilot=docs/shot-probability-pilot-2026-11-14
node "$pilot/run.mjs" calibrate "$out" "$assets"
node "$pilot/run.mjs" run "$out" "$assets"
```
