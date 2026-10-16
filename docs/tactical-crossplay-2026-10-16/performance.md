# Tactical decision latency

The final C2 engine was measured on six saved public-board states after the match arena stopped. One analysis process ran; the final rules test suite was still running concurrently on the same host. The median was **426 ms**, the maximum **696 ms**. These observations stayed below the UI worker's 4,000 ms fallback deadline. They are a host smoke check, not a guarantee for every browser or device.

| State | Phase | Elapsed ms | Expanded nodes | Last completed depth |
| --- | --- | ---: | ---: | ---: |
| Opening | kickoff | 696 | 1,400 | 4 |
| Defensive reply | defendMove | 612 | 1,400 | 5 |
| Previously deferred 10.9% finish | kick | 361 | 1,400 | 4 |
| Loose-ball collection | attackMove | 492 | 1,400 | 4 |
| Optional follow-up run | passRun | 267 | 1,400 | 4 |
| Corner taker selection | cornerSelect | 308 | 1,400 | 7 |

The deterministic default allowance remains 1,400 expanded nodes. Exhausting the allowance interrupts only the next iterative-deepening attempt; the bot returns its last completed legal result. No extra search budget, changed scoring odds, or future random seed was used.

`performance.json` preserves the engine hash, source action IDs, compact input snapshots and exact observations. Logs and previous-action text are omitted because the planning entry point already discards them. Reproduce the six checks from the repository root with:

```
node docs/tactical-crossplay-2026-10-16/performance.mjs
```
