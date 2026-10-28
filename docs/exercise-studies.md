# Short finishing studies

The first set contains twelve reduced positions: nine attacking studies and
three defensive studies. Unused players are deliberately omitted. Every board
contains both goalkeepers, uses the normal engine and has fouls disabled to keep
attention on the tactical idea. Opponents use the full published Tactical policy,
not the Casual policy or a scripted move sequence.

`dist/exercise-positions.js` owns the frozen catalog, progressive hints and one
illustrative line per study. `dist/exercise-session.js` owns flexible grading.
The example action list is documentation and review material; it is not an
answer key checked against the student's moves.

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
also allows an ordinary dribble into the box.

Defensive studies accept winning possession before the finish, or reducing the
opponent's actual finishing chance to the threshold after the student's keeper
response. They also grade the decision rather than the sampled goal or save.

All studies allow three or four completed possession rounds. Positioning,
dribbling and bonus subactions do not each spend a round. The shortest example
lines take one or two rounds; the larger allowance permits alternative sound
plans without turning an exercise into a full match.

## Checked teaching lines

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

`tests/exercise-positions.test.mjs` checks catalog structure, legal occupancy,
ball metadata, every teaching line against full Tactical over seeds 1984, 7 and
98765, theme completion and round limits. It also checks the alternative plans
above and forces a good finishing shot to miss to verify outcome-independent
credit. Session tests independently cover chance grading, offside collection,
limits, immutable state and stopping conditions. No simulation result is used to
claim these positions have only one solution or that the bot is unbeatable.
