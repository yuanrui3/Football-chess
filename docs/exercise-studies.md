# Football Chess exercises

The library contains 36 reduced positions in three tiers. The original twelve
are now Easy, with their IDs and saved results preserved. Each tier contains nine
attacking studies and three defensive studies. Unused players are deliberately omitted. Every board
contains both goalkeepers, uses the normal engine and has fouls disabled to keep
attention on the tactical idea. Opponents use expanded Tactical study analysis
with immediate reply checks. This search is bounded; it is not a proof of
globally optimal play. Match opponents retain their normal profile.

`dist/exercise-positions.js` combines and freezes the catalog; the new tier
definitions live in `exercise-medium.js`, `exercise-tough-attack.js`,
`exercise-tough-mixed.js` and `exercise-tough-defence-extra.js`. Each definition includes progressive hints and one
illustrative line. `dist/exercise-session.js` owns flexible grading.
The example action list is documentation and review material; it is not an
answer key checked against the student's moves.

## Difficulty and plan length

| Tier | Studies | Pieces on the pitch | Typical plan |
| --- | ---: | ---: | --- |
| Easy | 12 | 5–7 | Learn a core finishing or defensive idea |
| Medium | 12 | 10–14 | Link 2–3 student steps |
| Tough | 12 | 14–18 | Coordinate 3–4 student steps |

A step is a purposeful student move, bonus reposition, pass or shot. Ending
positioning and the Tactical opponent's replies are not counted as plan steps.
The label describes the checked teaching route, not a forced answer length.
Other sound plans can pass. Difficulty and theme filters can be combined, and
Next stays inside the selected group. An empty combination pauses the current
study until a matching selection is available.

## Objectives and feedback

Attacking studies require a real shot whose expected goal probability reaches
the stated threshold after the goalkeeper's best legal response. The native
model includes angle, distance, blockers and any two-target disguise. A sampled
save or miss does not invalidate a sufficiently strong chance, and a lucky goal
does not excuse a weak chance. Every legal route meeting the outcome earns
credit, including a stronger direct shot, a shorter plan or an unexpected piece.

Themes are optional coaching. Through balls, box entries and teammate-pass
counts remain observable contributions; none is a gate for completion. The
engine's normal legality still applies to offside, self-passes, the box and
compulsory keeper releases. The example line illustrates one useful plan.

Defensive studies accept winning possession before the finish, or reducing the
opponent's strongest available immediate finish to the threshold. When a shot
is declared, all legal goal aims and any legal disguise are checked against
their best keeper responses. The student's actual reaction to the chosen shot
is also checked. A weak bot aim cannot hand out credit while a stronger legal
aim was available. An already committed-shot study only tests its declared aim.
The decision is graded independently of the sampled goal or save.

All studies allow three or four completed possession rounds. Positioning,
dribbling and bonus subactions do not each spend a round. The shortest example
Easy lines take one or two rounds; larger studies use the same short horizon.
The allowance permits alternative sound plans without turning an exercise into
a full match. Plan steps and possession rounds are different measures.

## Earlier Easy examples

The table records the original baseline examples before expanded study analysis.
These historical values are not a claim about the strongest current opposition.
Finishing values are after the best keeper response to the final declared shot;
defensive values are after the student's actual response.

| Study | Main idea | Example result | Completed rounds |
| --- | --- | ---: | ---: |
| Pick the open file | Close queen finish against a displaced keeper | 92.1% shot | 1 |
| The knight has two posts | L-shaped targets, with direct or disguised choices | 98.0% shot on the far-side aim | 1 |
| Keep the goalkeeper guessing | Queen's two-target disguise | 67.4% mixture; both direct aims also qualify | 1 |
| Release the knight beyond the line | Bd10–h14, teammate collection and onward knight jump | 49.2% shot | 2 |
| Find the diagonal pocket | Qf13–h15, collect and change direction | 49.2% shot | 2 |
| Pass down the channel | Rd11–d15, collect and enter on a knight jump | 49.2% shot | 2 |
| Deliver to the box | Diagonal bishop pass to an onside box receiver | 49.2% shot | 2 |
| Cross to the middle | Horizontal rook cross to the queen | 29.1% shot, above a 25% task threshold | 2 |
| Carry inward, then finish | Improve a tight-angle wide queen shot by ordinary box entry | 4.2% initial shot becomes 90.6% | 1 |
| Win it before the shot | Bonus pawn step followed by a regular diagonal tackle | Clean possession win | 1 |
| Screen the shot and cover the goal | Rook body block, king bonus and keeper reaction | 10.5% opponent shot | 1 |
| Cover the declared aim | Move the goalkeeper onto the committed shooting file | 19.0% opponent shot | 1 |

<!-- NEW-TIER-TABLES -->
## Medium study outcomes

| Study | Coaching theme | Example steps | Pieces | Outcome |
| --- | --- | ---: | ---: | --- |
| Open the rook’s long shot | Finishing | 3 | 12 | Create and take a finish worth at least 65% against the best legal keeper response. Any legal plan can succeed. |
| Switch wide, drive inside | Into the box | 3 | 12 | Create and take a finish worth at least 60% against the best legal keeper response. Any legal plan can succeed. |
| Receive and escape the keeper | Into the box | 3 | 12 | Create and take a finish worth at least 80% against the best legal keeper response. Any legal plan can succeed. |
| The knight’s cut-back | Into the box | 3 | 13 | Create and take a finish worth at least 35% against the best legal keeper response. Any legal plan can succeed. |
| Make room with the pawn | Finishing | 3 | 11 | Create and take a finish worth at least 25% against the best legal keeper response. Any legal plan can succeed. |
| Thread the bishop’s pass | Through ball | 3 | 12 | Create and take a finish worth at least 40% against the best legal keeper response. Any legal plan can succeed. |
| Clear the diagonal runway | Finishing | 3 | 12 | Create and take a finish worth at least 25% against the best legal keeper response. Any legal plan can succeed. |
| Release the queen into space | Through ball | 3 | 12 | Create and take a finish worth at least 55% against the best legal keeper response. Any legal plan can succeed. |
| Vacate the finishing pocket | Into the box | 3 | 12 | Create and take a finish worth at least 80% against the best legal keeper response. Any legal plan can succeed. |
| The rook’s weighted retreat | Defence | 3 | 11 | Win possession, or limit every available immediate finish to 12% or less with sound keeper play. Any legal plan can succeed. |
| Close the diagonal gate | Defence | 3 | 10 | Win possession, or limit every available immediate finish to 10% or less with sound keeper play. Any legal plan can succeed. |
| The keeper’s two-action challenge | Defence | 2 | 11 | Win possession, or limit every available immediate finish to 15% or less with sound keeper play. Any legal plan can succeed. |

## Tough study outcomes

| Study | Coaching theme | Example steps | Pieces | Outcome |
| --- | --- | ---: | ---: | --- |
| Open the rook’s finishing file | Into the box | 4 | 14 | Create and take a finish worth at least 15% against the best keeper response. Any legal route can succeed. |
| Cross, jump, and chip | Into the box | 4 | 14 | Create and take a finish worth at least 40% against the best keeper response. Passes and box entry are suggestions, not requirements. |
| Clear the knight’s finishing pocket | Into the box | 4 | 14 | Create and take a finish worth at least 20% against the best keeper response. A stronger legal route earns credit too. |
| Through the line, then lay off | Through ball | 4 | 14 | Create and take a finish worth at least 15% against the best keeper response. The through-ball theme is optional coaching. |
| Clear the offside runner first | Into the box | 3 | 14 | Create and take a legal finish worth at least 10% against the best keeper response. Normal offside rules still apply. |
| The sweeper’s diagonal outlet | Into the box | 3 | 14 | Create and take a finish worth at least 15% against the best keeper response. Any legal buildup from the advanced king is accepted. |
| Unlock the rook battery | Into the box | 4 | 15 | Create and take a finish worth at least 60% against the best goalkeeper reaction. Any legal plan can earn credit. |
| Find the protected pocket | Through ball | 4 | 16 | Create and take a finish worth at least 35% against the best goalkeeper reaction. Any legal plan can earn credit. |
| Clear the delivery diagonal | Into the box | 3 | 14 | Create and take a finish worth at least 35% against the best goalkeeper reaction. Any legal plan can earn credit. |
| A screen and a keeper route | Defence | 3 | 15 | Hold the opponent’s finishing chance to 12% or less, or win possession. Any legal defensive plan can earn credit. |
| Open the keeper’s return route | Defence | 3 | 14 | Hold the opponent’s finishing chance to 30% or less, or win possession. Any legal defensive plan can earn credit. |
| Clear the box gateway | Defence | 3 | 14 | Hold the opponent’s finishing chance to 28% or less, or win possession. Any legal defensive plan can earn credit. |

<!-- END-NEW-TIER-TABLES -->

## Alternative plans verified

- Both reachable knight targets and its disguised shot pass the same finishing
  objective in the second study.
- Both direct queen aims and the two-target disguise pass the third study.
- After the rook cross, carrying the queen from h15 to i16 before shooting is
  accepted and creates a substantially stronger chance than the shorter example.
- The rook screen and king bonus in the defensive coordination study may be
  executed in either order.

Themes never override outcome quality. In particular, a stronger finish cannot
be rejected for omitting a pass quota or a box-entry badge.

## Verification

`tests/exercise-difficulty.test.mjs` checks all 36 IDs, tier sizes, the original
Easy IDs, truthful plan-step labels, larger diagram sizes and the real squad
inventory. The tier-specific tests exercise the new teaching lines, alternatives
and critical preparation steps. Independent review additionally tries immediate
shots/tackles and tries shorter or stronger legal alternatives. A good shortcut
is credited; an intrinsically trivial board is rebuilt instead of adding a gate.

`tests/exercise-positions.test.mjs` checks catalog structure, legal occupancy,
ball metadata, Easy example lines against the current study opponent and round
limits. The tier tests cover the new examples and alternative plans. The tests
also check alternative plans
above and forces a good finishing shot to miss to verify outcome-independent
credit. Session tests independently cover chance grading, offside collection,
limits, immutable state and stopping conditions. No simulation result is used to
claim these positions have only one solution or that the bot is unbeatable.
Repeated RNG seeds with the same deterministic policy are not independent
adversarial replies. Wider reply searches, explicit alternative moves and exact
immediate shot/keeper checks supply the opponent coverage.

## Current-round analysis help

The optional bar now measures the current round's attack against defence.
Earlier goals and the raw material ledger are excluded. The display search stops
when that round ends or possession changes, while completing a compulsory keeper
release. A goal in a searched branch contributes its expected reward for this
round; the conceding side's later kickoff does not. The next actual round starts
a fresh estimate. Finished matches show no active round.

The number remains an Ivory-positive heuristic scale, not xG or a calibrated win
probability. This display-only search scope does not change the Tactical playing
policy. A completed exercise freezes its last real decision estimate instead of
analysing the synthetic shot-review diagram again.
