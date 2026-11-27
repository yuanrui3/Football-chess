# Paired-position Football Chess benchmark data and scorer

From this directory, with **Node.js 24.2 or later**, run

```sh
node score.mjs
```

The scorer prints a JSON report to standard output. It uses Node's standard library and reads only the bundled files. It makes no model calls. The report covers all 1,080 primary decisions and the separate 360-decision GPT-OSS final-answer follow-up.

## Verify the native ground truth

From this directory, run `node native/verify.mjs`. The verifier rebuilds all 200 positions from their public coordinates. It replays 601 legal keeper replies including holds, checks both ordinary-shot probabilities for each reply, and verifies the three minimax shot values and winning option on every shot board. For all 240 passes it verifies legal completion, enumerates 1,640 legal tackle landings, checks the resulting retention probabilities and recovers each winning receiver. It also checks the switch or stay label for every pair.

`native/engine.mjs` is a byte-for-byte copy of the rules-22 `dist/engine.js` used to label both studies. Its SHA-256 is `8c4e1d5fe428878d4d8a0aace338b2f12d1c50d1839e076b3990f1b7d99163c6`. Both study locks record this digest. The adjacent `LICENSE` preserves the upstream game's MIT notice. Native replay tests agreement with these specific engine bytes. A separate shot-law implementation checked the frozen shot keys during study preparation. The bundled `pass/reproduce.mjs` independently calculates pass values from the coordinates and printed tackle rules.

## Data

- **positions.json** contains 120 coordinate boards grouped into 60 one-square edit pairs. Each record's `id` identifies a benchmark position. The `pair`, `member`, `block` and `seed` fields describe its matched partner and generation block. The three seeds are 41711, 51329 and 60509. A `kind` of `switch` means the engine's best shot changes between partners. A `stay` means it remains the same. The `edit` identifies the moved defender, and `replySetChanged` records whether its move altered the legal keeper destinations.
- **board** gives the attacking team, ball carrier, pieces and two target files. Pieces use team, type and square. Files run from a to n and ranks from 1 to 17. **options** lists the three shot labels in the presented order. **best** is the one-based engine-optimal menu index.
- **replyTable** has one row per legal keeper destination, including its hold. The two probabilities follow `board.targets` order. **actionGoalProbabilities** contains native values in menu order, on the 0–1 probability scale. Taking the minimum in each target column gives the two declared-shot values. Taking the minimum of the within-row averages gives the disguised-shot value.
- **choices** holds the recorded **one-based** menu indices for `board`, `replies` and `odds` under each configuration. A JSON `null` is a completed response that failed the frozen answer rule. The original configurations are `gemini` (Gemini 3.1 Flash-Lite), `gemma` (Gemma 4 31B IT) and `gptoss` (locally served GPT-OSS-20B, MXFP4). **gptossFinal** identifies the post hoc GPT-OSS final-answer protocol. It could continue the same item's analysis in a final-answer channel after a first generation of up to 2,048 tokens. Its combined maximum remained 4,096 tokens. **followUpGenerations** gives the number of completed generations for each of its three conditions.
- **gemmaClosingFenceRecovery** records an option only when removing one trailing Markdown fence yielded an otherwise strictly valid answer. These 25 entries enable a separate post hoc formatting check. The primary Gemma choices retain their original values.
- **prompts.json** contains all 360 exact shared **user-message texts**, one for each position and condition. Join its `id` and `condition` to the records above. The odds prompts give the displayed percentages rounded to two decimal places. Each call used one board in a fresh context. These are the shared task texts across model API formats.

## Reading the scores

**modelScores** and **deterministic** report board correctness, both-boards-correct pair counts, switch and stay counts, and mean loss in native goal probability in percentage points over valid choices. An invalid choice fails its board and pair. The scorer reconstructs native values from the unrounded reply table and calculates five deterministic policy rows, including the oracle and the geometry approximation, directly from the supplied data. The geometry function itself receives only the public coordinates and menu.

**semanticChange** compares the two shots in each pair by their declared target or disguised target set, decoding the menu on each board independently. Its `changed` and `unchanged` counts use the `bothValid` denominator. Its `bothCorrect` count uses `totalPairs`. The complementary **boardGeometryVsGemini** counts compare the pairs that each solved.

**pairedEffects** gives pair gains and losses and marginal percentile bootstrap intervals from 20,000 within-block resamples. Each original two-model comparison applies Holm adjustment across its four planned information contrasts. The two comparisons share the same Gemini decisions. The final-answer protocol, formatting check, geometry rule and semantic-change analysis are exploratory.

The scorer checks data hashes before reading the inputs. The bundled `geometry.mjs` retains the original coordinate-only policy functions, `compare-shots.mjs` and `paired-analysis.mjs` implement the study's matched scoring, and `pair-actions.mjs` calculates action-change counts. Only board-level decoded decisions and the two limited follow-up indicators are distributed.
