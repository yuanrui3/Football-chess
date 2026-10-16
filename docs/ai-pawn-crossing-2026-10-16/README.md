# Pawn setup awareness and central crossing support

This AI-only change preserves game rules and the 1,400-node Tactical search allowance.

The former policy carried its queen from f8 to f14 in a natural seed-55 position. Opposing pawns could not tackle immediately, but a legal free reposition followed by the same pawn’s ordinary tackle won the ball. The old inner beam discarded these setup replies. The new risk evaluation and retained setup candidate identify them; mirrored actual-play proofs confirm safe productive carries for either side.

Wide attack evaluation now distinguishes an onside central recipient on a legal passing ray from an otherwise similar recipient off that ray. A concrete eleven-square bishop delivery to a wide rook retained its 90% incoming pass accuracy. The former receiving evaluation scored both cases 102.4. The new evaluation scores the version with a central queen and a 19% reacted receiving finish 118.21, versus 89.98 when the rook cannot cross to that queen. These are ranking values, not goal probabilities.

The central support run test uses full squads and real moves. Older Tactical could also find that run, and an opponent can subsequently close its passing lane; the change strengthens explicit support valuation without guaranteeing successful delivery or introducing a complete team tactical planner.

One matched 120-action Tactical self-play smoke case reduced free-pawn-only carrier threats from three of sixteen fresh defensive replies to zero of fifteen. All 240 compared actions remained legal with valid state invariants. Shots were one versus three; both partial-match scores were 0–0. This tiny early-match comparison establishes neither scoring calibration nor AI win strength. Two baseline seeds followed equivalent deterministic opening play; only one matching updated run is retained. Timing measurements were taken under concurrent regression load and do not isolate change overhead.

Focused regression coverage: tests/pawn-tactical-awareness.test.mjs and tests/crossing-support-ai.test.mjs. The JSON files retain the independent before/after proof and smoke-check metrics.


Validation run: 960 of 961 tests passed in the complete suite. Its sole failure was an obsolete fixed heuristic-score assertion in the cutoff-bound regression. The expected best defensive action remained unchanged. The test now checks equality with the uncached completed search; all nine search tests passed on recheck. No engine changes followed the full suite. The final versioned worker roundtrip also passed.
