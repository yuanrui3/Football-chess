# Move-ranking evidence archive

| Ledger | Games | Candidate policies | Shared search allowance |
| --- | ---: | --- | --- |
| [Equal nodes](equal-nodes.jsonl) | 72 | Scratch, imitation, imitation then RL | 1,400 nodes and depth 8 |
| [200 ms](200ms.jsonl) | 48 | Plain imitation and reordering the native defensive shortlist | 200 ms and depth 8 |
| [Original decision time](original-time.jsonl) | 48 | Plain imitation and reordering the native defensive shortlist | 777.4551239284 ms and depth 8 |

Each line is one completed paired-tournament game, copied verbatim from the completed job ledgers. The fields `arm`, `seed`, `candidateColor` and `kickoff` identify a game. A job's `arm` suffix identifies its checkpoint repeat. Every seed contributes four color/kickoff combinations per candidate. `candidateResult` is the candidate-side outcome. The `candidate` and `baseline` objects report each side's goals, post-reaction expected goals, and search work. The timed ledgers also record elapsed time for each search, deadline hits, and zero-depth searches.

[Summary data](summary.json) gives the six-seed schedule for each study, three training runs, per-job protocol and engine hashes, selected match aggregates, and the paired estimates and timing diagnostics recorded in the study reports. The original time reference divides the frozen side's total `searchThinkMs` by total `searchDecisions` across the 1,400-node ledger. Search timing excludes keeper reactions. The portable export records input hashes for each original job subset.

## Independent checks

Run the dependency-free verifier with Node.js 22 or later from the repository root.

```sh
node docs/football-chess-rl-closeout-2026-11-15/evidence/verify.mjs
```

It checks the ledger hashes, all 168 game records, protocol IDs, all 18 distinct held-out seeds, every four-leg set, recorded search timing, and the original time reference. It recomputes pooled and checkpoint-level W/D/L and the paired estimates with their original 20,000-resample intervals. To reproduce those estimates separately, compute candidate minus baseline per game. Use W/D/L points 1/½/0 and subtract ½ to report points above parity. For a direct candidate comparison, subtract those differences between matching seed, checkpoint, color and kickoff. Average within seed, then within checkpoint. Resample the three checkpoints first and the two seeds within each chosen checkpoint second, retaining all four legs per seed. The verifier implements the percentile convention used in each study.

The experiments used the reviewed game rules and a paired tournament harness. The earlier reports describe the separate search-width and shot-backup experiments. [Reviewed engine](https://github.com/yuanrui3/Football-chess/blob/45fc3f4a43f2775c1eaf6e27737ef4aba76a7403/dist/engine.js) · [Paired tournament source](https://github.com/yuanrui3/Football-chess/blob/f119538eb051ac6500f4c2a0ac90c61a6194ad0e/scripts/paired-tournament.mjs) · [Search sensitivity report](../../search-sensitivity-2026-11-13/README.md) · [Shot probability report](../../shot-probability-pilot-2026-11-14/README.md)
