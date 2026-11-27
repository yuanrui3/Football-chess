# Passing under a calibrated cue

Six layouts cross the identity of a protected receiver (knight or rook), the content of a scout's report (safe or exposed) and its accuracy (60% or 90%). The ordinary receiver retains the ball with probability equal to its posterior chance of being safe. The protected receiver retains it with probability 75% in both states. The exposed bishop loses possession. All outcomes used for scoring are conditional expectations.

## Offline reproduction

Run this command from the repository's `benchmarks/paired-positions/` directory with Node.js 24.2 or newer.

```sh
node anc/cue/reproduce.mjs
```

The verifier regenerates the six layouts and 48 texts from the seed. The generator uses the included rules-22 engine to check certain legal passes, subsequent holds and available tackles in both possible worlds under both protection assignments. It checks uniqueness against the two earlier pass banks. The verifier checks the pawn edits, rook–knight swaps, menu orders, matched reliability texts and all 48 serialized request digests against the pre-collection freeze. It then scores the released choices and compares every result field with the recorded analysis.

Gemini 3.1 Flash-Lite made all 12 favorable-report reversals, six for each protection assignment. All six layouts passed with both assignments. Both decisions were correct in all 12 exposed-report control pairs. The model chose 24 knights and 24 rooks, maximizing expected retention on all 48 decisions. The mean was 78.75%. These are descriptive results for one request in each cell of these six layouts.

## Source release

- `protocol.md`, `manifest.json`, `freeze.json`, `choices.json`, `results.json` and `score.mjs` are byte copies from the completed study. The manifest records both board states, menu orders, protection assignments, exact prompts and answer keys. Each released response contains the study's prompt hash prefix and the decoded one-based option number.
- `design.mjs` is the frozen generator with its engine import and data directory relocated into the public benchmark directory. The verifier restores the two original path strings in memory and checks the original file digest. The freeze preserves the hash and timestamp record produced locally before collection.
- `collection.json` contains completion counts and times, model aliases, retry count, and digests of the choices and freeze from the collection receipt. Two transient requests were retried. The public reproduction starts from the decoded choices. The provider's raw response envelopes remain outside the public release.
- `reproduce.mjs` implements the public offline checks, including the exact JSON request serialization. Together with the original scorer, it verifies the primary matched endpoint, controls, condition summaries, and role-swap patterns.
