# Paired shot and pass decisions in Purdue Football Chess

This is the benchmark for *When Should a Language Model Change Its Move? Paired Shot and Pass Decisions in Purdue Football Chess* by Yuanrui Chen. Each pair differs by a one-square defensive edit. The model sees each board separately. Half of each bank requires a change of action, and half preserves the optimal action.

| Task | Fixed bank | Inputs and recorded choices | Reproduction script |
| --- | --- | --- | --- |
| Choose a shot against a responding goalkeeper | 60 pairs, 120 boards | [Boards, payoffs and model choices](anc/positions.json) · [Exact prompts](anc/prompts.json) · [Data guide](anc/README.md) | [Shot scores and geometry baseline](anc/score.mjs) |
| Choose a receiver who can retain possession after a tackle | 40 pairs, 80 boards | [Boards, prompts, payoffs and model choices](anc/pass/data.json) · [Data guide](anc/pass/README.md) | [Pass scores and independent tackle calculation](anc/pass/reproduce.mjs) |

## Reproduce the paper's results

From this directory, run the following commands with Node.js 24.2 or later. They use only the bundled files and the Node.js standard library. Each command prints JSON and can run offline.

```sh
node anc/score.mjs
node anc/pass/reproduce.mjs
node anc/native/verify.mjs
```

The first two commands score the recorded choices. On the coordinate-only shot prompts, Gemini 3.1 Flash-Lite solves both boards in 12 of 60 pairs and the geometry baseline solves 52. On passes, Gemini and the tackle-range baseline each solve 38 of 40 pairs.

The [native verifier](anc/native/verify.mjs) rebuilds all 200 boards from their coordinates and checks the action values, optimal choices and switch/stay labels with the [rules-version-22 engine used for the study](anc/native/engine.mjs). It checks 601 goalkeeper replies on the shot boards and 1,640 legal tackle landings on the pass boards. The engine's [MIT notice](anc/native/LICENSE) accompanies the snapshot.
