# Paired shot and pass decisions in Purdue Football Chess

This is the dataset for *When Should a Language Model Change Its Move? Paired Shot and Pass Decisions in Purdue Football Chess* by Yuanrui Chen. In the paired-board studies, a defender moves one square. Half the pairs require switching actions and half preserve the best action. The cue study uses six layouts to test whether a change in a scout report’s reliability reverses the best pass.

The [dataset landing page](https://yuanrui3.github.io/Football-chess/benchmarks/paired-positions/) describes the studies. The [dataset citation](CITATION.cff) identifies the expanded release. The [original 100-pair release](https://github.com/yuanrui3/Football-chess/tree/8e87600e949d23675a293414391c54e63cbc64aa/benchmarks/paired-positions) remains available at revision `8e87600`.

| Study | Size | Data and recorded choices | Offline script |
| --- | --- | --- | --- |
| Shot choice against a responding goalkeeper | 60 pairs, 120 boards | [Boards and choices](anc/positions.json) · [Exact prompts](anc/prompts.json) · [Guide](anc/README.md) | [Shot scores and geometry baseline](anc/score.mjs) |
| Pass choice before a one-move tackle | 40 pairs, 80 boards | [Boards, prompts, payoffs and choices](anc/pass/data.json) · [Guide](anc/pass/README.md) | [Pass scores and tackle verification](anc/pass/reproduce.mjs) |
| Author and Gemini choosing a receiver from the same images and coordinates | 8 fresh pairs, 16 boards | [Boards](anc/followup/bank.json) · [Exact prompts](anc/followup/participant/items.json) · [Open the quiz](https://yuanrui3.github.io/Football-chess/benchmarks/paired-positions/anc/followup/participant/quiz.html) · [Recorded choices](anc/followup/comparison.json) · [Guide](anc/followup/README.md) | [Quiz scores and request verification](anc/followup/reproduce.mjs) |
| Pass choice under a scout’s report with protection assigned to the knight or rook | 48 text decisions on 6 layouts | [Layouts, prompts and answer keys](anc/cue/manifest.json) · [Recorded choices](anc/cue/choices.json) · [Results](anc/cue/results.json) · [Guide](anc/cue/README.md) | [Cue reversals and role swaps](anc/cue/reproduce.mjs) |

## Results

Solving a board pair requires choosing the optimal action on both boards. On the original coordinate-only shot task, Gemini 3.1 Flash-Lite solved 12/60 pairs and the geometry rule solved 52/60. On the original pass task, Gemini and the tackle-range rule each solved 38/40 pairs.

On the 16 fresh boards, the author solved 7/8 pairs and Gemini solved 2/8. Gemini chose the knight on 13/16 boards although it was optimal on four. The author was familiar with the benchmark. Each model decision used a fresh context.

The cue experiment supplied the possible tackle outcomes. The protected receiver retained possession with probability 0.75. After a “safe” report the ordinary receiver’s expected retention was 0.90 or 0.60, depending on cue reliability. Gemini made all 12 predicted reversals, six with each piece protected. It maximized expected retention on all 48 decisions and chose 24 knights and 24 rooks. Choosing the ordinary receiver only on a 90%-reliable “safe” report would reproduce all 48 decisions.

## Reproduce offline

In a checkout of the expanded dataset, run these commands from `benchmarks/paired-positions/` with Node.js 24.2 or later. The scripts use the bundled files and the Node.js standard library.

```sh
node anc/score.mjs
node anc/pass/reproduce.mjs
node anc/native/verify.mjs
node anc/followup/reproduce.mjs
node anc/followup/value-of-information.mjs
node anc/cue/reproduce.mjs
```

The [original engine verifier](anc/native/verify.mjs) checks 601 goalkeeper replies and 1,640 legal tackle landings for the original 200 boards. The follow-up scorers regenerate the new inputs from their frozen designs. The [value-of-information analysis](anc/followup/value-of-information.mjs) computes the expected value of revealing the edited defender’s position across the three paired-board studies. The [engine’s MIT notice](anc/native/LICENSE) accompanies the frozen engine.
