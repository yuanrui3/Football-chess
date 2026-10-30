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

New matches now use rating ledger version 4, described below. Valid version-1,
version-2 and version-3 saves retain their earlier formulas and expose `legacyMethod:
true`; continuing such a match keeps one consistent method. The view labels it
as an earlier method. Missing or invalid rating history is separately labelled
partial.

## Method 3: keeper performance and useful positioning

The method-2 audit exposed two ways keepers could be underrated. A useful
ordinary reposition could lose merit just because another legal square would
have improved coverage still more. Meanwhile keeper shot-stopping merit used
an unnormalized 0.80 multiplier on xG prevented; useful outfield contributions
used much smaller role allowances, and the shared rating curve penalizes a
negative balance more steeply than it rewards a positive one.

Method 3 changes only keeper assessment:

- Ordinary off-ball keeper moves earn no positive execution merit. A move
  loses merit only if it actually increases the opponent's immediate shooting
  threat relative to holding position. Giving up a better possible improvement
  is no longer treated as a missed save. Leaving the box or opening the goal
  can still lose credit. Repeated repositioning cannot farm positive grades.
- Shot reactions are still compared with the best legal keeper reaction.
  Difficulty caused by choosing worse coverage is removed from assessed xG
  prevention, and the existing explicit reaction penalty remains.
- The cumulative assessed xG balance is worth `1.8 * balance` when positive,
  and `0.60 * balance` when negative. Each shot records the change in that
  cumulative value. This rewards useful stops more visibly while tempering
  stochastic concessions. Applying the weights to the cumulative balance
  prevents several routine saves from hiding below-expectation goalkeeping.

Factual on-target xG faced, goals conceded and signed xG prevented are
unchanged. The extra signed `keeperAdjustedXGPrevented` counter persists the
assessment after removing self-created difficulty. Save count itself adds no
flat grade bonus. An 80%-xG penalty save receives much more credit than an easy
stop, without awarding a type-specific starting grade or a clean-sheet bonus.
All quiet players still start at 6.0, and outfield grading is unchanged.

For a native best-reaction rook stop worth 0.268 on-target xG, the keeper rises
from 6.2 in method 2 to 6.5 in method 3. An isolated penalty save rises from
6.6 to 7.4. Conceding the same best-reaction rook chance still grades below
baseline. Two such saves followed by one goal have a negative cumulative xG
balance and negative goalkeeping merit, rather than manufacturing an above-
expectation performance from raw save count.

Ledger versions 1 and 2 remain readable and continue with their original
formula. Existing finished grades are never recomputed. Start a new match for
method 3; restore and Undo preserve its signed assessment exactly.

A bounded replay audit used the exact same 2,880 committed actions from eight
Casual trials: seeds 91001–91004 with both kickoffs, 360 actions each, fouls
off. Actual match-stat assist/provider tracking was retained. Sixteen keeper
records contained eight saves and ten conceded goals:

| Keeper group | Records | Method 2 mean | Method 3 mean |
| --- | ---: | ---: | ---: |
| Positive factual xG prevented | 5 | 5.94 | 6.54 |
| Negative factual xG prevented | 6 | 4.32 | 4.80 |
| Zero faced/prevented xG | 5 | 5.98 | 6.14 |
| All keepers | 16 | 5.34 | 5.76 |

The zero-xG group can still earn distribution credit or lose credit for an
actual positioning error. No neutral grade was raised automatically. One
keeper with three saves, one goal conceded and +0.40 factual xG prevented
improved from 4.5 to 6.2. Continuing method-2 ledgers matched the frozen earlier
implementation exactly after every action; outfield grades and contributions
were unchanged. This small, action-limited audit diagnoses the mechanism and
checks preservation, not population calibration or predicted full-time grades.

## Method 4: fair keeper ratings over long matches

Ordinary goalkeeper positioning now uses net threat change within a decision
sequence: the same round, attacking side, carrier and ball square. A correction
within that sequence refunds the earlier deduction, but cannot produce positive
positioning merit. A shot declaration, turnover or restart closes the sequence.
The cost is capped at 0.12 performance points per sequence and 0.35 for the match.
These limits apply only to ordinary coverage: failed tackles, fouls, dangerous
turnovers and actual shot-stopping performance keep their separate contributions.

The existing assessed on-target xG balance already removes difficulty caused by
a worse keeper reaction. Method 4 removes the additional reaction deduction that
charged the decision twice. Shot-stopping credit remains 1.8 times a positive
cumulative balance or 0.60 times a negative one. Its cumulative increments bypass
the generic positive-action cap, so reversing shot order cannot change the total
credit through clipping. Wides, body blocks and back-passes still give no save
credit. There is no automatic save-count bonus, clean-sheet bonus or ranking floor.

Keeper negative merit now maps to `6 + 5*tanh(m/5)`, giving the same unit slope
near neutral as positive merit. Outfield curves are unchanged. Quiet keepers
remain at 6.0; genuinely poor performance still grades below six. Emergency
keepers use the same correction. Saved positioning context survives reload and
Undo. A new match is required for method 4; valid earlier ledgers retain their
original grades and continuation rules rather than reconstructing missing history.

A paired audit replayed 12 native Casual games of 1,200 actions each through the
frozen method-3 and current methods, including four games from two additional
seeds. Fouls were disabled to isolate the rating mechanisms. Every outfield
summary matched exactly at each checkpoint, and continued method-3 ledgers
matched the frozen implementation after every one of the 14,400 actions.

| Piece | Method 3 mean | Method 4 mean |
| --- | ---: | ---: |
| Goalkeeper | 6.09 | 6.60 |
| Queen | 7.84 | 7.84 |
| Rook | 6.94 | 6.94 |
| Bishop | 6.66 | 6.66 |
| Knight | 6.58 | 6.58 |
| Pawn | 6.64 | 6.64 |

The eight keepers in the additional-seed games improved from 5.95 to 6.54 on
average. Across all games, nine keepers with positive factual xG prevented
improved from 7.29 to 7.46. The reproduced three-save, one-concession example
rose from 5.5 to 6.7 with +0.14 xG prevented. Poor performances still scored as
low as 4.4. This bounded audit supports the correction; it is not a population
calibration or a claim that keepers should always outrank every outfielder.

Validation: 191 targeted tests, including 12 new regressions for refunds,
sequence and match caps, save/Undo, invalid telemetry, legacy preservation,
shot-order invariance, no double reaction charge, and strong/poor performance.
Browser QA verified the audited example in the native full-time report.
Reproduce the comparison with `node scripts/audit-keeper-ratings-v4.mjs`;
raw results, the frozen baseline and example match are in `docs/keeper-ratings-v4/`.

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
