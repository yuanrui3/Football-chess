# Tactical search candidate

No game rules, public chance distributions, node budget, Casual policy or learned model changed.

## Search-only candidate

`engine.mjs` is an isolated copy of v40 source with one change: the exact keeper-reaction chance event ends the current quiescence-extension sequence. All ordinary remaining search depth is preserved; forced pending shots still settle at depth zero. Every legal keeper-rebound landing remains explicitly enumerated with its original probability. This stops dozens of low-probability landing states from independently consuming the remaining three extension plies.

Apply `search.patch` to the matching source.

Seven diagram smoke tests at 1,400 nodes increased completed depth on four positions and held it on three. Timing is indicative only because the initial run used fixed baseline-first ordering. Existing tactical-search and pawn-awareness tests: 18 passed. Five additional tests cover exact nominal-depth preservation with extensions disabled, mirrored close shots, seed purity and safe iteration callbacks.

Common development benchmark (seed610017, both colors and kickoffs, 160 measured actions each): four draws, goals0–0, shots9–0, xG1.250686–0. Mean completed depth4.534, mean thinking506ms, p95 thinking950ms, nodecap1400, no errors. These are fixed-action scenarios, not timed matches or evidence of a statistically established strength gain.

## Separate iteration-progress option

`engine-progress.mjs` additionally implements optional `analyzeTacticalAction({onIteration})`. The callback receives only completed-iteration results and copied action, line and stats snapshots. It cannot mutate the live search through the reported objects. No default API result changes. `iteration-progress.patch` is separate from the search change. A worker can publish these results so a watchdog retains the last completed Tactical answer instead of replacing it with Casual.

## Separate tempo ablation

`engine-tempo.mjs` discounts each search micro-action by .985 around the actual root score ledger. Deterministic alpha/beta windows use the inverse affine transform, so ordinary cutoff bounds remain valid. This candidate is experimental and requires paired development evidence before adoption. Existing tactical-search tests9/9passed. No chance probabilities or live outcomes are changed.


## Bounded concession diagnosis

`concession-audit.json` reconstructs the exact public combined-v1 development game at steps156/157/162/163/168/169/174/175. Replay through step177 matched every recorded action result. At the six early defensive decisions, baseline v40, q1-only and combined-v1 choose identical actions. At the critical step168 all three also have identical value, depth5 and principal variation: Black Bishop passes to(8,14), Knight collects, Knight carries to(6,15), then White King attempts its45% tackle. The completed horizon ends before the later shot, undervaluing the knight receiving-and-carrying finish.

At step174 baseline and q1 choose different tackle landing squares; their actual seeded outcome is the same evasion. `concession-counterfactual.json` proves both return the King to(6,16) at175 and produce identical complete rule state before the176 shot, ignoring only log and lastAction. Therefore this particular concession is not caused by q1.

Recommendation: omit q1 from the current release because the matched160-action screen does not establish strength improvement. No general mathematical correctness fault was found; its broad extension boundary is a heuristic horizon change. A narrower future experiment could end extensions only for live keeper-rebound children while preserving catch/corner follow-up search. This diagnosis used only completed development files and bounded position analyses; no further bulk games or held-out outcomes were inspected.
