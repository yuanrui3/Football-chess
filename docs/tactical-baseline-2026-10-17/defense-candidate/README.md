The final release uses the root agent’s balanced v4 plus completed-iteration callback. This directory contains development evidence and rejected research branches; it is not the deployed source. Root froze the final candidate at 06:36:52 UTC, hash prefix `4388dc612b14`. No held-out files or outcomes were read by this agent. No CPU jobs remain.

The initial defense work improved Tactical’s second-ball ranking: bishops on the opposite square color no longer receive collection credit, and approaches prioritize real native receiving lanes. A separate pace guard excludes illegal fifth self-collections from a loose-ball possession claim. Root included those changes in v4. On four paired 160-action development scenarios, this defense candidate produced 14 shots / 2.152 xG against Casual’s 0 / 0; frozen Tactical’s matching prefixes produced 10 shots / 1.494 xG. All eight results were draws at that short horizon. These are development measurements, not an independent strength guarantee.

The possession audit used seven completed development scenarios, all seed 610017 with paired colors/kickoffs and two policies. It sampled 80 evenly spaced ordinary attacking states with a carrier and a dribble available. Every candidate dribble was actually applied first; moves awarding an offside, pace or repetition free kick instead of retaining the carrier were excluded. Each resulting position was checked against every legal direct ordinary tackle and every legal shared pawn/king bonus followed by any eligible defender’s ordinary tackle. This exhausts immediate clean-tackle availability for that defensive reply, rather than predicting later rounds.

| Measure | Result |
|---|---:|
| Legal dribble destinations audited | 872 |
| Destinations safe from the full immediate reply | 377 / 872 (43.23%) |
| Mean legal / safe dribble destinations per state | 10.90 / 4.71 |
| Median safe dribble destinations | 4 |
| States with at least one safe dribble | 68 / 80 (85%) |
| States with at least five safe dribbles | 28 / 80 |
| States with a safe dribble or safe outfield pass | 72 / 80 (90%) |
| Mean onside teammate passes within 10 squares | 1.225 |
| Mean outfield passes already safe on receipt | 0.488 |
| Mean keeper back-passes, counted separately | 0.088 |

Pass safety is measured before a receiver uses its own dribble, so it understates the number of passes that can lead to a safe escape. Keeper back-passes are separate because the keeper must release immediately. Safety here means no immediate clean tackle is legally available; it does not promise long-term possession or a good attack.

The replay contained 118 completed possession segments, averaging 16.99 actions by the possessing side (median 14), plus seven horizon-censored segments. Those actions include off-ball and bonus moves, so they are not football touches or full rounds. There were 469 non-shot kicks, no direct interception events, 37 tackle attempts and 30 successful tackles. Possession ended through 26 wide shots, 24 catches, nine goals, 30 tackles, 12 offsides, 10 stalling awards and seven opponent loose-ball collections. These descriptive counts come from one paired seed and are not a population estimate.

The audit also found a real legacy evaluation gap: the original `tacticalTackleRisk` recognizes a pawn/king setting up its own tackle, but can miss that piece vacating a bishop/rook/queen’s line. Five of the 872 destinations were incorrectly classified safe by the old helper. All five were proven with actual legal bonus moves and clean winning tackles. The released rules themselves adjudicate those tackles correctly.

The attempted Tactical-only full-reply helper matched the exhaustive audit exactly and preserved Casual and rule behavior over 640 natural states (28,160 legal-move comparisons). However, both broad and minimal integrations failed the existing productive-carry regression. They escaped laterally, then passed to an empty forward square and self-collected into a guaranteed pawn setup tackle. The forward pass alone was insufficient proof: its later collection was explicitly checked and failed. Unsigned and signed loose-ball retention adjustments did not resolve this sequence. The original regression assertion was not weakened, and all four variants were excluded from the final candidate.

The native-knight receiving-and-carrying threat branch also remains unselected. It correctly recognized a recorded keeper defense case and passed its focused checks, but root’s development comparison favored v4. None of these excluded branches should be described as shipped fixes.

Useful files:

- `possession-full-reply-audit.json`: exact immediate-reply counts, five full counterexamples and 80 sampled rows.
- `possession-audit.json` and `possession-audit-states.json`: replay accounting and reproducible sampled states.
- `full-risk-exact-audit.json`: full helper versus exhaustive ground truth, zero disagreements on 872 destinations.
- `research-status.json`: source hashes, branch status, limitations and test results.
- `engine.diff`, `pace-guard.patch`: initial second-ball and pace development changes.
- `full-reply-risk.patch`, `minimal-reply-risk.patch`, `collection-risk.patch`, `signed-collection-risk.patch`: rejected research changes.
- `broad-pawn-trap-collection.json`, `collection-risk-pawn-proof.json`, `signed-collection-risk-pawn-proof.json`: failing full-turn continuations.
- `full-risk-profile.json`: eight 1,400-node development profiles; shared-CPU wall times are approximate.
