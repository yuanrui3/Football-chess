# Close-range keeper rushing

Shot model 16 separates reactive diving from a keeper's prepared close-range
smothering coverage. Previously rushing reduced flight time, dive reach and
readiness without providing any benefit for closing the shooter down. Even an
aligned rook one-on-one became easier to score as the keeper came forward.

Preparedness uses the same-file goal-line equivalent distance: actual shot-ray projection plus the keeper’s forward depth times the shot’s vertical direction cosine. This represents a keeper setting its stance before the shot; actual flight time still governs lateral diving reach and arrival speed. An additional, modest coverage factor is:

```
advance = own-box depth / (BOX_DEPTH - 1)
proximity = max(0, 1 - (keeper-to-shooter distance / 6)^2)
rush = .20 * advance * proximity * exp(-(shot-path clearance / .9)^2)
save-on-target = min(.90, 1 - (1 - reactive-save) * (1 - rush))
```

Distances are Euclidean board squares. The keeper must be inside its own box,
off the goal line, and between the shot origin and goal along the actual shot
segment. The bonus smoothly vanishes at six squares and decays sharply away
from the shot path. Rushing toward a poorly covered angle is not automatically
good. For distant shots the close-range bonus vanishes. Advancing still trades away lateral diving reach, so keeping a poor angle can be worse than holding.
These are board-game parameters, not fitted real-world xG coefficients.

An unobstructed legal rook shot from (6,4) toward (6,-1) now has these chances:

| Keeper square | Previous goal chance | Model 16 goal chance |
| --- | ---: | ---: |
| (6,0), goal line | 19.01% | 19.01% |
| (6,1), one forward | 23.14% | 17.58% |
| (6,2), two forward | 29.12% | 15.63% |

This is a fixed-position comparison, not three extra reaction moves. A shot
reaction still permits only one legal keeper step or hold. Both AI levels use
the same revised shot model to choose that step. Shot previews, actual outcome
resolution, expected-value search and new rating events also use that model.
The shot panel identifies close-range rush coverage; the blue overlay remains
the reactive diving reach rather than a guarantee of stopping a ball.

Outside-box kings remain ordinary body blockers, penalties remain fixed at 80%,
and a keeper already bypassed by the shooter gains no rush coverage. Knight
shots still face keeper saves. Each possible disguised shot is evaluated
separately before taking the fair 50/50 average. Existing outcome splits for
catches, corners and loose parries apply to the revised saved-shot mass.
Historical completed rating totals and replayed shot records are retained.

Regression tests cover both teams, aligned rook origins three through six,
wrong angles, bypassed and outside keepers, AI reaction choice, legal shot
resolution, probability conservation, disguise, penalties and reload purity.

## Model 17: handling a rushed save

A close smother gives up secure handling. Model 17 adds up to 45 percentage
points to the existing conditional parry rate, scaled by the same aligned,
close-range rush intensity used for smothering. The total parry rate remains
capped at 90%, leaving at least a 10% conditional catch chance:

```
rush-parry-bonus = .45 * clamp(rush-coverage / .20, 0, 1)
parry-if-saved = clamp(speed-and-stretch-parry + rush-parry-bonus, .05, .90)
hold-if-saved = 1 - parry-if-saved
```

For the same legal rook shot from (6,4), conditional holding chances are:

| Keeper square | Hold if saved |
| --- | ---: |
| (6,0), goal line | 63.36% |
| (6,1), one forward | 41.00% |
| (6,2), two forward | 11.43% |

These are conditional on a keeper save, not percentages of all shots. Goal
odds, total save odds, wide shots and defender blocks remain exactly those of
model 16. The extra parry mass comes only from catches. Of opponent-shot
parries, the existing 20% loose / 80% corner split still applies, and native
loose-ball landings remain uniform over legal empty rebound squares.
Teammate backward-shot parries remain out of play; a caught back-pass still
requires immediate release. Penalties retain fixed 80% goal / 20% catch when
the keeper is in its box. Disguised shots evaluate each target before averaging.
