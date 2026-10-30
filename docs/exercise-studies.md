# Football Chess exercises

The library contains 36 reduced positions in three tiers. The original twelve
are now Easy, with their IDs and saved results preserved. Each tier contains nine
attacking studies and three defensive studies. Unused players are deliberately omitted. Every board
contains both goalkeepers, uses the normal engine and has fouls disabled to keep
attention on the tactical idea. Opponents use expanded Tactical study analysis
with immediate reply checks. This search is bounded; it is not a proof of
globally optimal play. Match opponents retain their normal profile.

## Natural goalkeeper starts

Both keepers begin inside their own box, on the goal line or one square in
front of it. They normally cover the central two goal files. A defending keeper
may shade toward the near post when the ball starts genuinely wide. Puzzle
solutions are built around that coverage rather than a keeper stranded outside
the posts or far upfield. Studies that previously depended on such starts have
new positions and revision numbers; earlier completions remain in their history.

`dist/exercise-positions.js` combines and freezes the catalog; the new tier
definitions live in `exercise-medium.js`, `exercise-tough-attack.js`,
`exercise-tough-mixed.js` and `exercise-tough-defence-extra.js`. Each definition includes progressive hints and one
illustrative line. `dist/exercise-session.js` owns flexible grading.
The example action list is documentation and review material; it is not an
answer key checked against the student's moves.

## Difficulty and plan length

| Tier | Studies | Pieces on the pitch | Typical plan |
| --- | ---: | ---: | --- |
| Easy | 12 | Reduced positions | Learn a core finishing or defensive idea |
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

## Current study outcomes

These targets use the current positions and the native chance model, including the keeper’s best legal response. They are outcome thresholds, not prescribed move sequences.

### Easy

| Study | Coaching theme | Example steps | Pieces | Outcome |
| --- | --- | ---: | ---: | --- |
| Take the central finish | Finishing | 1 | 5 | Create and take a finish worth at least 25% after the best legal keeper reply. Any legal plan can succeed. |
| The knight has two posts | Finishing | 1 | 5 | Create and take a finish worth at least 45% after the best legal keeper reply. Any legal plan can succeed. |
| Keep the goalkeeper guessing | Finishing | 1 | 5 | Create and take a finish worth at least 35% after the best legal keeper reply. Any legal plan can succeed. |
| Release the knight beyond the line | Through ball | 4 | 6 | Create and take a finish worth at least 20% after the best legal keeper reply. Any legal plan can succeed. |
| Find the diagonal pocket | Through ball | 4 | 6 | Create and take a finish worth at least 20% after the best legal keeper reply. Any legal plan can succeed. |
| Pass down the channel | Through ball | 4 | 6 | Create and take a finish worth at least 20% after the best legal keeper reply. Any legal plan can succeed. |
| Deliver to the far-side receiver | Into the box | 2 | 6 | Create and take a finish worth at least 20% after the best legal keeper reply. Any legal plan can succeed. |
| Cross to the middle | Into the box | 3 | 6 | Create and take a finish worth at least 25% after the best legal keeper reply. Any legal plan can succeed. |
| Carry inward, then finish | Into the box | 2 | 6 | Create and take a finish worth at least 25% after the best legal keeper reply. Any legal plan can succeed. |
| Win it before the shot | Defence | 2 | 6 | Win possession, or hold the strongest available immediate finish to 15% or less, with sound keeper play. |
| Screen the shot and cover the goal | Defence | 2 | 6 | Win possession, or hold the strongest available immediate finish to 15% or less, with sound keeper play. |
| Cover the declared aim | Defence | 1 | 5 | Hold the already declared finish to 20% or less with a sound keeper reaction. |

### Medium

| Study | Coaching theme | Example steps | Pieces | Outcome |
| --- | --- | ---: | ---: | --- |
| Clear the rook’s approach | Finishing | 3 | 12 | Create and take a finish worth at least 20% after the best legal keeper reply. Any legal plan can succeed. |
| Switch wide, drive inside | Into the box | 3 | 12 | Create and take a finish worth at least 25% after the best legal keeper reply. Any legal plan can succeed. |
| Launch diagonally, finish at the edge | Finishing | 3 | 12 | Create and take a finish worth at least 20% after the best legal keeper reply. Any legal plan can succeed. |
| Hand the file to the forward rook | Finishing | 3 | 13 | Create and take a finish worth at least 20% after the best legal keeper reply. Any legal plan can succeed. |
| Clear the pawn, keep a safe distance | Finishing | 3 | 11 | Create and take a finish worth at least 20% after the best legal keeper reply. Any legal plan can succeed. |
| Lead the rook through the line | Through ball | 3 | 12 | Create and take a finish worth at least 20% after the best legal keeper reply. Any legal plan can succeed. |
| Clear the diagonal runway | Finishing | 3 | 12 | Create and take a finish worth at least 20% after the best legal keeper reply. Any legal plan can succeed. |
| Collect at the edge of the box | Through ball | 3 | 12 | Create and take a finish worth at least 20% after the best legal keeper reply. Any legal plan can succeed. |
| Vacate the finishing pocket | Finishing | 3 | 12 | Create and take a finish worth at least 20% after the best legal keeper reply. Any legal plan can succeed. |
| Screen and react from the centre | Defence | 2 | 11 | Win possession, or hold the strongest available immediate finish to 12% or less, with sound keeper play. |
| Close the diagonal gate | Defence | 3 | 10 | Win possession, or hold the strongest available immediate finish to 10% or less, with sound keeper play. |
| Step out and challenge | Defence | 2 | 11 | Win possession, or hold the strongest available immediate finish to 15% or less, with sound keeper play. |

### Tough

| Study | Coaching theme | Example steps | Pieces | Outcome |
| --- | --- | ---: | ---: | --- |
| Open the rook’s finishing file | Into the box | 4 | 14 | Create and take a finish worth at least 15% after the best legal keeper reply. Any legal plan can succeed. |
| Cross, jump, and chip | Into the box | 4 | 14 | Create and take a finish worth at least 20% after the best legal keeper reply. Any legal plan can succeed. |
| Link through the knight, then escape | Into the box | 4 | 15 | Create and take a finish worth at least 15% after the best legal keeper reply. Any legal plan can succeed. |
| Through the line, then lay off | Through ball | 4 | 15 | Create and take a finish worth at least 15% after the best legal keeper reply. Any legal plan can succeed. |
| Clear the offside runner first | Into the box | 3 | 14 | Create and take a finish worth at least 10% after the best legal keeper reply. Any legal plan can succeed. |
| Build from the goalkeeper | Finishing | 4 | 14 | Create and take a finish worth at least 15% after the best legal keeper reply. Any legal plan can succeed. |
| Unlock the rook battery | Into the box | 4 | 15 | Create and take a finish worth at least 20% after the best legal keeper reply. Any legal plan can succeed. |
| Find the protected pocket | Through ball | 4 | 16 | Create and take a finish worth at least 20% after the best legal keeper reply. Any legal plan can succeed. |
| Switch around the central screen | Into the box | 3 | 14 | Create and take a finish worth at least 20% after the best legal keeper reply. Any legal plan can succeed. |
| Two screens and the keeper | Defence | 3 | 15 | Win possession, or hold the strongest available immediate finish to 7% or less, with sound keeper play. |
| Cover the far post | Defence | 3 | 15 | Win possession, or hold the strongest available immediate finish to 10% or less, with sound keeper play. |
| Bring the bishop across | Defence | 3 | 15 | Win possession, or hold the strongest available immediate finish to 10% or less, with sound keeper play. |

## Alternative plans verified

- Both reachable knight targets and its disguised shot pass the same finishing
  objective in the second study.
- Both direct queen aims and the two-target disguise pass the third study.
- After the rook cross, carrying the queen from h15 to i16 before shooting is
  accepted; alternative sufficiently strong finishes also earn credit.
- The rook screen and king bonus in the defensive coordination study may be
  executed in either order.

Themes never override outcome quality. In particular, a stronger finish cannot
be rejected for omitting a pass quota or a box-entry badge.

## Verification

`tests/exercise-difficulty.test.mjs` checks all 36 IDs, tier sizes, the original
Easy IDs, truthful plan-step labels, larger diagram sizes, the real squad
inventory and natural starting positions for all 72 goalkeepers. The tier-specific tests exercise the new teaching lines, alternatives
and critical preparation steps. Independent review additionally tries immediate
shots/tackles and tries shorter or stronger legal alternatives. A good shortcut
is credited; an intrinsically trivial board is rebuilt instead of adding a gate.

`tests/exercise-positions.test.mjs` checks catalog structure, legal occupancy,
ball metadata, Easy example lines against the current study opponent and round
limits. The tier tests cover the new examples and alternative plans. The tests
also check the alternative plans
above and force a good finishing shot to miss to verify outcome-independent
credit. Session tests independently cover chance grading, offside collection,
limits, immutable state and stopping conditions. No simulation result is used to
claim these positions have only one solution or that the bot is unbeatable.
Repeated RNG seeds with the same deterministic policy are not independent
adversarial replies. Wider reply searches, explicit alternative moves and exact
immediate shot/keeper checks supply the opponent coverage.

### Keeper-rush model 16 compatibility

The rush correction changes finishing probabilities while keeping all study
positions, example actions and the expanded opponent policy intact. Eight
Medium studies now target 17% rather than 20%; their illustrative finishes are
17.41–18.64% against the best keeper reply, from no initial legal shot. The
Tough rook battery likewise changes from 20% to 17% (17.54% actual). The two
Tough supported long-shot examples change from 15% to 13% (13.52% actual,
initially no legal finish). The Easy inward carry accepts the alternative
24.04% disguised finish as well as its 25.87% direct aim, with a 24% target.
These revisions preserve outcome-based alternatives and the original plan
lengths; no move sequence or pass quota is imposed.

The two Tough far-post defensive studies still require all three preparations:
their original screened replies are 9.30%, below the 10% target, while the best
enumerated route using at most two actions leaves 13.91%. Their starting
keepers and lesson targets therefore do not need changing. The offside study
still creates 10.25% through a real body block and meets its original 10%
target; its board is also unchanged.

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
