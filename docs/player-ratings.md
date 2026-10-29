# Full-time player ratings

The full-time report includes an interactive ratings pitch for each team. Each
piece keeps its stable ID, including players sent off. The positions are a review
lineup, not the final match coordinates: after a goal, the engine resets the
formation, and final squares would otherwise hide the player's role.

Ratings are out of ten, starting at 6.0. They describe performance relative to
the piece's native abilities. The separate impact figure describes contribution
before that adjustment. A pawn can receive a higher rating than a queen while
the queen still has greater overall impact. These are transparent game
heuristics, not calibrated real-football ratings or probabilities.

The scoring is cumulative. For example, the same chance-creation impact is
divided by 0.32 for a queen and 0.16 for a pawn, so a pawn gets twice the merit
for that particular contribution. Queens can nevertheless accumulate more
credit because they take more actions and create more measurable opportunities.
The model does not yet normalize grades by a learned distribution of each
piece's opportunities. Direct shooting coverage is better represented than
denial of passes or pressing. This limitation should not be mistaken for a
calibrated comparison with Sofascore.

Positive total merit `m` maps to `6 + 4*tanh(m/4)`; negative merit maps to
`6 + 5*tanh(m/2.5)`. Displayed grades are rounded to one decimal and bounded
between 1 and 10. Goals add a modest outcome residual to expected shot quality;
chance creation, retained progression, tackles and screening also contribute.
Mistakes, fouls, dismissals and dangerous turnovers reduce merit.

## Method 2 and the keeper correction

Both an ordinary keeper positioning move and a shot reaction are now judged
against the best legal keeper move available for that exact normal or bonus
allowance. Routine optimal coverage earns no extra execution merit. Inferior
coverage can lose merit, while useful coverage still appears in raw impact.
Actual saves have a modest difficulty-adjusted contribution. Wides, defender
blocks and teammate back-passes do not become goalkeeper save achievements.

An audit replayed the same actions from eight kickoff-paired Casual trials,
360 actions each. This is a bounded game sample, not a population calibration.

| Piece | Earlier mean | Method 2 mean |
| --- | ---: | ---: |
| King | 6.72 | 6.00 |
| Queen | 6.72 | 6.67 |
| Pawn | 6.32 | 6.26 |
| Knight | 6.23 | 6.19 |
| Rook | 6.13 | 6.07 |
| Bishop | 6.09 | 6.05 |

Ordinary positioning supplied 81% of earlier keeper merit. Queens averaged
36.4 recorded actions, versus 8.5 for bishops and 9.3 for rooks. The correction
addresses the keeper baseline without forcing every piece type to have the
same mean.

## Event rubric in method 2

Finishing combines `0.12 * max(0, xG - 0.08)` chance-quality credit with
`0.30 * (goal - xG)` result credit, where `goal` is one for a goal and zero
otherwise. A missed high-probability finish therefore has negative finishing
impact. Positive performances use native piece allowances; negative finishing
uses a common 0.32 normalizer so the same missed chance does not punish a pawn
more heavily than a queen. Penalties use a common expectation for every piece.
The game's explicit big-chance threshold is 0.35 xG; it is a heuristic, not a
claim about a real-football data provider's classification.

Key passes and big chances created are recorded from the final delivery to a
shot. Their credit depends on that shot's chance quality, with a modest actual
assist bonus. Goal and assist badges continue to use factual match records.
Lost duels are negative, with blame tempered by the native tackle probability.
Defensive actions and mistakes are weighted by threat and position. Actual
near-goal body clearances, penalty saves, penalties committed, own goals and
clear errors leading to goals have explicit counters and explanations.

Keeper on-target xG is `goalProbability / (goalProbability + saveProbability)`.
Only native goals and goalkeeper stops count as attempts faced by the keeper;
wides, body blocks and teammate back-passes are excluded. Signed xG prevented
is the sum of this on-target xG minus actual goals conceded. The grade gives
this measure greater emphasis than raw save count, while penalizing inferior
legal coverage and removing credit for difficulty caused by the keeper's own
poor reaction. The factual faced/prevented figures still describe the actual
shot geometry. A penalty save consequently carries much more expected-goal
value than an easy routine stop.

An error-leading-to-goal label requires a high-certainty, dangerous own-half
possession loss followed by a direct opponent goal within two rounds and at
most one pass. Recovery, restarts, another resolved shot or expiry clear the
candidate. Unpredictable scatter and a knight losing a native 50% challenge
alone are not labelled as clear errors. This deliberately omits ambiguous
chains instead of inventing individual blame.

New matches use rating ledger version 2. Valid version-1 saves retain their
earlier formula and expose `legacyMethod: true`; continuing such a match keeps
one consistent method. The view labels it as an earlier method. Missing or
invalid rating history is separately labelled partial.

## Goal and assist badges

Ball and boot icons use the existing match scorer and assist records, not xG
or expected-assist credit. Own goals are excluded from scorer badges. Multiple
contributions show counts, and accessible labels always contain the full
numbers. These factual records can be available even when rating history is
partial. Review positions remain independent of final board squares.

Selecting a piece shows the recorded contributions behind its rating. Quiet
pieces stay near the starting rating, and the report avoids awarding player of
the match for an unused player's baseline score. The two pitches use the same
review slots, with the attacking direction labelled on each.

## Recording and persistence

`dist/player-ratings.js` records contributions from committed native engine
transitions. Its ledger is stored with `matchStats.playerRatings`, so existing
save, restore and Undo snapshots also preserve ratings. Replays only display
past play and never record a second contribution. Match rules, sampled outcomes
and computer decisions are unchanged.

Existing match saves can lack the new ledger. They retain their original score
and statistics; ratings explicitly cover only the available history. Missing
actions are never reconstructed as invented performances. Starting a new match
starts a fresh ledger.

`dist/player-ratings-view.js` renders the report without changing the match or
the ledger. Its buttons provide piece IDs, teams, ratings, dismissals and details
to keyboard and screen-reader users. The two pitches stack on narrow screens.

## Scope

The rating heuristic rewards observed useful contributions and measured local
geometry. It does not claim to reconstruct every pressing trap, decoy run or
formation responsibility. Results are assessed against native probabilities:
difficult saves carry more credit and missed chances carry difficulty-weighted
blame, with common negative normalizers across piece types.
Routine ball circulation and repeated routes do not earn unlimited credit.

The model and view have focused tests for native abilities, expected versus
sampled outcomes, contribution recording, restoration, quiet players, all 22
identities and rating-detail selection. Existing match-statistics and save
compatibility tests remain part of the validation.
