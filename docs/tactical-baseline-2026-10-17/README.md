# Handcrafted Tactical AI study — 17 October 2026

**Final policy decision: retain the tested production Tactical policy. The experimental evaluation changes are not promoted. Completed-iteration delivery and the UI thinking pipeline are the release changes.**

The experimental candidate scored more total goals and conceded fewer expected goals against Casual, but won fewer scenarios and scored later. No decisive playing-strength or win-rate improvement was demonstrated, so it was not promoted. No RL was trained or used. The release engine is `df962903a48e9853a18ce0a600d498f648ac84fee600ed1ff045cf963d8311f8`; its diff from frozen production adds only completed-iteration callbacks. [Release decision](release-decision.json) and [exact release diff](evidence/release-engine.diff).

## Rejected round 1 trial: complete result

Two fresh seeds (720017 and 720043) each supplied four correlated legs: Tactical White/Black crossed with White/Black kickoff. Both engines played the same immutable Casual opponent, under one shared rules 19 / shot 15 module. Tactical used the unchanged 1,400-node/depth 8 allowance; fouls were enabled and learned weights were explicitly null. Eight 480-action scenarios completed for each policy, settling any pending shot at the boundary.

| Policy | Wins/draws/losses | Goals | Shots | xG | Stalls | Mean/p95 decision ms |
|---|---:|---:|---:|---:|---:|---:|
| Frozen production Tactical | 5/3/0 | 10–4 | 71–14 | 11.976–4.103 | 1 | 615/1229 |
| Experimental 0.25 candidate | 3/5/0 | 13–4 | 85–8 | 12.367–1.997 | 0 | 601/1116 |

The candidate increased full-horizon goals 10→13 and shots 71→85, while wins decreased 5→3. Attacking xG increased only 11.976→12.367; conceded xG decreased 4.103→1.997. These are descriptive results from only two independent seeds, not a reliable Elo estimate or proof of universal strength. The four legs from one seed must not be counted as four independent samples.

| Horizon | Frozen goals | Candidate goals | Frozen shots | Candidate shots |
|---|---:|---:|---:|---:|
| 160 actions | 3–0 | 2–1 | 18–2 | 24–3 |
| 200 actions | 5–0 | 4–1 | 24–4 | 33–3 |
| 240 actions | 5–1 | 7–1 | 34–5 | 42–3 |
| 480 actions | 10–4 | 13–4 | 71–14 | 85–8 |

The first-goal median among the seven scoring legs was 165 actions for the frozen engine and 226 for the candidate; each had one scoreless leg. At 200 actions the candidate scored fewer goals (4 versus 5) and had a weaker W/D/L record. More goals at 480 actions therefore does not demonstrate faster scoring in a short live match.

Full pairings, first-goal arrays, checkpoints and machine-readable metrics are in [the round 1 comparison](evidence/heldout-round1-comparison.md) and [JSON](evidence/heldout-round1-comparison.json). No gameplay-validation errors, unresolved shots, unsafe horizon cuts or node-cap violations were recorded; both policies stayed within 1,400 nodes.

## What the rejected trial changed

- Carried-possession evaluation weight changes from 0.35 to 0.25, with the original immediate tackle-risk cost preserved. This reduces the incentive to retain established possession indefinitely.
- Off-ball rankings reward moving a friendly blocker away from the carrier’s real, keeper-reacted shooting lane.
- Loose-ball approaches respect native movement lanes and bishop square color. Pace-forbidden self-collections no longer earn collection credit.
- A legal finish with at least 55% keeper-reacted chance is taken when no receiving outlet is clearly superior, allowing a five-percentage-point tolerance.

These trial preferences were not released. Completed-iteration snapshots and the UI thinking pipeline were retained independently of playing-policy changes. The chess parallel is clearing a file or diagonal before attacking; the football parallel is an off-ball run opening a shot or collecting a second ball. The experimental candidate retained the existing tactical search and public chance model. No pitch rule, shot probability, piece capability, node limit or game action allowance changes in this engine diff. Knight receiving/carry bonuses, broad tackle-risk integrations, the quiescence boundary experiment and the tempo-discount experiment are excluded.

## Development history, including unfavorable results

Round 1 development used seed 610017 only, with paired colors/kickoffs. It recorded 49 completed scenarios and 15,840 atomic actions across 13 batches. Twelve batches completed all four planned legs; `attack-wide-v3` stopped with one of four legs recorded. Its three unplayed legs are not counted. A defense-only full 480-action launch was stopped immediately with exit 130 and produced no completed scenarios. Unbenchmarked prototype files are labeled as such.

The selected 0.25 prototype’s development tournament scored **3–0 versus the old engine’s 6–0**, despite greater attacking xG (**9.034 versus 6.771**) and less conceded xG (0.456 versus 0.660). At 200 actions its attacking xG was essentially unchanged (2.246 versus 2.265), while its actual goals were 0 versus 2. These unfavorable results are retained rather than replaced by the more favorable test goal total. See [all development tables](evidence/development-tables.md), [counts and partial batches](evidence/development-counts.json), exact source snapshots and raw match recordings.

The 0.20 possession prototype initially failed the superior-receiver regression: a 7.95% shot displaced a receiver with an 85.04% immediate chance (37.78% after actual defensive replies). The 0.25 prototype restored the pass. Other branches increased nominal depth or emphasized future knight chances without a clear measured goal-volume benefit; they were not selected. Their source and reports remain under the corresponding candidate directories.

## Final refinement and why it was rejected

Additional 0.20 and 0.15 carried-possession variants, while retaining the original tackle penalty, failed existing superior-receiver checks; the 0.15 version also failed productive carrying. They were not given a bulk tournament. A revised 0.20 variant preserved the old explicit shot-threat and receiver values, passed focused checks, and was evaluated on fresh development seed 610043.

| 240-action development policy | W/D/L | Goals | Shots | xG |
|---|---:|---:|---:|---:|
| Frozen production | 4/0/0 | 5–0 | 17–1 | 4.953–0.058 |
| Finish-preserved v7 | 3/1/0 | 3–0 | 18–1 | 2.907–0.106 |

At 200 actions the refinement scored 2–0 versus production’s 4–0. It did not justify another test or promotion. Exact sources, failed focused checks, the completed four-leg development records and configuration are retained in [refinement-v7](refinement-v7/); [the corresponding control](baseline-dev-refinement/) is complete. This adds eight development scenarios / 1,920 actions to the initial development inventory. Four one-action portable infrastructure checks are excluded from all gameplay totals.

## Possession audit and an unresolved defensive limitation

An exhaustive immediate-reply audit used 80 stored attacking positions from seven completed development scenarios. It actually applied each legal carry, then checked every direct ordinary tackle and every legal pawn/king bonus followed by any defender’s ordinary tackle. Of 872 legal carry destinations, 377 (43.23%) were safe from an immediate clean tackle; 68/80 positions had at least one safe carry, and 72/80 had a safe carry or safe outfield pass. The mean was 10.90 legal carries and 4.71 safe carries per position. Mean onside teammate passes within 10 squares was 1.225, with 0.488 safe outfield passes on receipt and 0.088 keeper back-passes. Receiver escape dribbles were not included in pass safety, so that count is conservative.

The original Tactical risk helper incorrectly classified five destinations as safe when a pawn/king bonus vacated another defender’s tackling ray. Each counterexample was verified with actual legal moves and a winning clean tackle. The game rules adjudicate those tackles correctly; this is an AI evaluation gap.

The fuller risk helper matched all 872 audited destinations, but broad and minimal integrations failed the unchanged productive-carry regression. They escaped sideways, passed to an empty forward square, then self-collected into a guaranteed pawn setup tackle. A loose-ball leaf could overcredit an unsafe self-collection after its dribble allowance was spent. Signed and unsigned retention adjustments did not resolve the continuation. Those variants were rejected, and the released production policy does **not** fix every discovered-ray or self-collection evaluation weakness. Passing forward alone was not accepted as proof of a safe full turn, and the original assertion was not weakened.

The replay audit counted 118 completed ownership segments (mean 16.99 actions by the owning side, median 14), plus seven censored segments; these actions include bonus/off-ball moves and are not football touches or complete rounds. There were 469 non-shot kicks, no direct interception events, 37 tackle attempts and 30 wins. The sample is descriptive and comes from one development seed. Exact states, five counterexamples, rejected branch hashes and continuation proofs are in [defense research status](defense-candidate/research-status.json) and [the defense report](defense-candidate/README.md).


## Hypothetical dribble range sensitivity

The same 80 positions were rechecked against the locked `4388dc612b14…` research snapshot using hypothetical first-carry budgets of 8, 7 and 6 movement points. Native geometry, occupancy, box movement costs, defending replies and passing options were held fixed; no rules were edited or new matches played.

| First-carry budget | Legal destinations | Safe destinations | Mean safe options | States with a safe carry | States with a safe forward carry |
|---|---:|---:|---:|---:|---:|
| 8, current rule | 872 | 377 | 4.71 | 68/80 | 46/80 |
| 7 | 842 | 356 | 4.45 | 68/80 | 46/80 |
| 6 | 808 | 333 | 4.16 | 68/80 | 46/80 |

Reducing the budget removes escape variety: 21 safe destinations at seven points, or 44 at six. No sampled position loses its last safe carry, and safe-forward availability stays unchanged. This local result does not establish that shorter dribbling has no effect on actual play, possession length, scoring or balance; later choices and formations would adapt. It provides no support for claiming that a smaller range alone eliminates safe retention in this sample. [Method and report](defense-candidate/dribble-range-sensitivity.md), [detailed JSON](defense-candidate/dribble-range-sensitivity.json) and a portable script are retained.

## Production release verification

The callback-only production engine passed **1,142/1,142 tests across 59 files**, with zero failures, cancellations or skips, in 163.9 seconds; completion was 06:54:48 UTC. [Verified status](verification/production/production-regression-status.json) and [complete TAP](verification/production/production-regression.tap) identify the final `df962903a48e…` source.

The final policy-equivalence check compared 16 natural Tactical decisions, including their actions, values, statistics and principal variations, and found exact equality with frozen production. Another 640 natural states matched Casual decisions, complete transitions, normalization and kick queries, with 28,116 legal-move queries and no errors. Mutating delivered iteration snapshots could not alter the search or input state. Removing the two callback additions recovers the byte-identical frozen engine. [Portable source and proof](production-baseline-callback/verify-equivalence.mjs), [results](production-baseline-callback/equivalence-report.json) and [patch](production-baseline-callback/callback-only.patch).

Four checks using the actual versioned production worker passed, including old learned-evaluation settings forced to null, legal progress snapshots and unchanged inputs. [Report](verification/production/versioned-worker-release/worker-release-check.json).

## Historical candidate verification and timing

**The following 1,156-test record belongs to the rejected `4388dc612b14…` research candidate, not the released policy.**

- Locked-engine full suite: 1,156/1,156 passing tests across 63 files, zero failures/cancellations/skips; 205.9 seconds, completed 06:41:56 UTC. [Verified status](verification/experimental-v4/final-regression-status.json) and [complete TAP](verification/experimental-v4/final-regression.tap).
- Rule/Casual equivalence: 640 natural states, 28,160 legal-move queries, 640 kick queries, 640 normalizations, 640 exact Casual actions and 640 full transitions; 16 bounded Tactical checks, no errors. [Report](verification/experimental-v4/final-rules-casual-equivalence.json).
- Four actual versioned worker checks passed, including legacy learned-evaluation settings forced to null, legal progress snapshots and preserved inputs. [Report](verification/experimental-v4/versioned-worker-release/worker-release-check.json).
- Portable benchmark smoke and exact possession-audit reproduction passed. These infrastructure checks are excluded from gameplay outcome totals. [Report](verification/portable-reproduction.json).

Fixed-action scenarios differ from timed matches. At a three-second decision pace a ten-minute game permits roughly 200 actions before animations and clock effects; 480 actions is substantially longer. Computing during the pause can improve live pace independently of fixed-action playing strength. Shared background CPU workloads limit relative-speed claims. Earlier goals reset formations and change subsequent cumulative xG. No separate head-to-head tournament against frozen Tactical and no fouls-OFF strength tournament is claimed.

## Selection discipline and reproduction

The study began at 06:03:41 UTC. Production source and dependencies were frozen first. The round 1 policy was locked at 06:36:52 UTC with SHA-256 `4388dc612b14feb2b266dc5389e1f95228c68e994bcabbcfd39c21a5e4d880f3`. Frozen control SHA-256 is `584b1dffb37d222969c80df04eb3b80fc79ef7fb05fc225483fb820efd47a29e`. Its test was run concurrently but kept blind until the source lock. [Lock](selected-policy-lock.json), [unblinding authorization](unblinding-authorization.json), [frozen manifest](frozen-manifest.json) and [exact selected diff](evidence/selected-engine.diff) preserve the sequence.

After the mixed round 1 result, a further refinement used fresh development seed 610043. It also failed to show improvement and was rejected. Test seeds 720079/720111 remain unused and unread. Round 1 outcomes were not pooled into a fresh final test of that later refinement.

The primary reproduction commands work from the repository on Windows PowerShell:

```powershell
Push-Location docs/tactical-baseline-2026-10-17
node benchmark.mjs --candidate evidence/selected-engine-locked.mjs --label reproduced-round1 --split test --seeds 720017,720043 --actions 480 --nodes 1400 --depth 8 --workers 2 --fouls true --record true
node benchmark.mjs --candidate frozen/dist/engine.js --label reproduced-control --split test --seeds 720017,720043 --actions 480 --nodes 1400 --depth 8 --workers 2 --fouls true --record true
Pop-Location
```

Use new labels to preserve original evidence. Decisions, outcomes and node budgets are deterministic; wall times vary. Main harnesses resolve their frozen imports relative to their own files. Three supported possession-audit entrypoints also set their own working directory; the sampler pins the original seven input records. Original unmodified audit sources are retained under `defense-candidate/original-source/`. Other historical research scripts retain their original context and are not release entrypoints. See [reproduction details](REPRODUCTION.md).

