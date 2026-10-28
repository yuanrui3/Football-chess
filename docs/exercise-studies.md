# Football Chess exercises

The library contains 36 reduced positions in three tiers. The original twelve
are now Easy, with their IDs and saved results preserved. Each tier contains nine
attacking studies and three defensive studies. Unused players are deliberately omitted. Every board
contains both goalkeepers, uses the normal engine and has fouls disabled to keep
attention on the tactical idea. Opponents use the full published Tactical policy,
not the Casual policy or a scripted move sequence.

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
does not excuse a weak chance or a missing theme prerequisite.

Through-ball studies additionally require an accurate forward pass into space
across a nearby outfield defender's line, followed by an onside teammate's
collection. A self-pass does not meet that objective. Box-entry studies require
a teammate delivery into the attacking box; the final carrying study explicitly
also allows an ordinary dribble into the box. Some larger studies explicitly
require a teammate-pass combination before the finish. Only accurate deliveries
received by another outfield player count: self-passes and keeper backpasses
do not. The combination and theme requirements must both be met at release of
the final shot; neither imposes a prescribed move sequence.

Defensive studies accept winning possession before the finish, or reducing the
opponent's actual finishing chance to the threshold after the student's keeper
response. They also grade the decision rather than the sampled goal or save.

All studies allow three or four completed possession rounds. Positioning,
dribbling and bonus subactions do not each spend a round. The shortest example
Easy lines take one or two rounds; larger studies use the same short horizon.
The allowance permits alternative sound plans without turning an exercise into
a full match. Plan steps and possession rounds are different measures.

## Checked Easy teaching lines

The table reports one line with the full Tactical opponent, using the native
session grader. It is a reproducible teaching route, not a uniqueness claim.
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
## New Medium studies

| Study | Theme | Plan steps | Pieces | Objective |
| --- | --- | ---: | ---: | --- |
| Open the rook’s long shot | Finishing | 3 | 12 | Clear the bishop, advance the rook and create a shot worth at least 65%. |
| Switch wide, drive inside | Into the box | 3 | 12 | Find the wide queen, enter the box and finish at 60% or better. |
| Receive and escape the keeper | Into the box | 3 | 12 | Complete the diagonal delivery, evade the keeper’s approach and create an 80% finish. |
| Relay around the pressure | Into the box | 3 | 13 | Complete two teammate passes, then create a finish worth at least 35%. |
| Make room with the pawn | Finishing | 3 | 11 | Clear the pawn, carry into the open file and finish at 25% or better. |
| Thread the bishop’s pass | Through ball | 3 | 12 | Send a through ball into space, collect with the knight and finish at 40% or better. |
| Clear the diagonal runway | Finishing | 3 | 12 | Clear a teammate from the dribbling route, carry centrally and finish at 25% or better. |
| Release the queen into space | Through ball | 3 | 12 | Play a through ball, collect with the queen and create a finish worth at least 55%. |
| Vacate the finishing pocket | Into the box | 3 | 12 | Move the rook, carry into the vacated box square and finish at 80% or better. |
| The rook’s weighted retreat | Defence | 3 | 11 | Use coordinated cover to win possession or leave a finishing chance of 12% or less. |
| Close the diagonal gate | Defence | 3 | 10 | Screen the finish and cover its target, leaving 10% or less. |
| The keeper’s two-action challenge | Defence | 2 | 11 | Win possession with coordinated keeper movement, or hold the finish to 15% or less. |

## New Tough studies

| Study | Theme | Plan steps | Pieces | Objective |
| --- | --- | ---: | ---: | --- |
| Relay wide, escape the keeper | Into the box | 4 | 14 | Complete two teammate passes, enter the box and create a finish worth at least 15%. |
| Cross, jump, and chip | Into the box | 4 | 14 | Complete two teammate passes and carry into the box for a finish worth at least 40%. |
| The jumping wall pass | Into the box | 3 | 14 | Link three players with two passes into the box, then create a finish worth at least 20%. |
| Through the line, then lay off | Through ball | 4 | 14 | Complete a through ball and a second teammate pass, then attempt a finish worth at least 15%. |
| Clear the offside runner first | Into the box | 4 | 14 | Remove the offside interference, complete a teammate pass and enter the box for a finish worth at least 10%. |
| The sweeper’s diagonal outlet | Into the box | 3 | 14 | Build from the advanced king through two teammate passes into the box, then take a finish worth at least 15%. |
| Unlock the rook battery | Into the box | 4 | 15 | Transfer to the second rook, clear its file and create a box-entry finish worth at least 60%. |
| Find the protected pocket | Through ball | 4 | 16 | Send a through ball to an onside teammate and finish from a protected pocket at 35% or better. |
| Clear the delivery diagonal | Into the box | 3 | 14 | Clear the crowded diagonal, deliver to an onside box receiver and create a finish worth at least 35%. |
| A screen and a keeper route | Defence | 3 | 14 | Coordinate the goalkeeper and pawn to hold the next finish to 12% or less, or win possession. |
| Open the keeper’s return route | Defence | 3 | 14 | Clear a route back into the box, then hold the close finish to 30% or less, or win possession. |
| Clear the box gateway | Defence | 3 | 14 | Use the ordinary move to open a box entry, then coordinate the king bonus and shot reaction to hold the finish to 28% or less, or win possession. |

<!-- END-NEW-TIER-TABLES -->

## Alternative plans verified

- Both reachable knight targets and its disguised shot pass the same finishing
  objective in the second study.
- Both direct queen aims and the two-target disguise pass the third study.
- After the rook cross, carrying the queen from h15 to i16 before shooting is
  accepted and creates a substantially stronger chance than the shorter example.
- The rook screen and king bonus in the defensive coordination study may be
  executed in either order.

The explicit theme prerequisites prevent unrelated long shots or self-passes
from bypassing the intended learning objective, while the probability-based
grader accepts other legal routes that meet it.

## Verification

`tests/exercise-difficulty.test.mjs` checks all 36 IDs, tier sizes, the original
Easy IDs, truthful plan-step labels, larger diagram sizes and the real squad
inventory. The tier-specific tests exercise the new teaching lines, alternatives
and critical preparation steps. Independent review additionally tries immediate
shots/tackles and removes preparatory actions to catch padded solutions.

`tests/exercise-positions.test.mjs` checks catalog structure, legal occupancy,
ball metadata, every teaching line against full Tactical over seeds 1984, 7 and
98765, theme completion and round limits. It also checks the alternative plans
above and forces a good finishing shot to miss to verify outcome-independent
credit. Session tests independently cover chance grading, offside collection,
limits, immutable state and stopping conditions. No simulation result is used to
claim these positions have only one solution or that the bot is unbeatable.

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
