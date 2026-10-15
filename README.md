# Football Chess — 11 a side

A playable custom variation inspired by Football Chess by Serrano Saunders.
Original handbook: https://pdfhost.io/v/bWV1pmicf_Football_Chess_Handbook.pdf

## Play

Choose a computer opponent or two players on one device. Each team has one king, one queen, two rooks, two bishops, two knights, and three pawns on a 12×15 pitch. Goals occupy files e–h. Arrange your starting half if desired; move a teammate onto the kickoff carrier to change the taker. Click Kick off, then select a highlighted kick destination.

Each attack or defense positioning turn provides one regular move plus an optional one-square pawn reposition, in either order. The controls show which actions remain; End positioning turn forfeits the unused actions. Then the attacker kicks. Knights jump while dribbling. Tackles against a knight succeed 50% of the time; other legal tackles remain certain. The challenger moves to the selected adjacent square on either outcome. A failed attempt leaves the knight in possession and uses the challenger’s regular move while preserving any unused free pawn action. Pieces are never captured.

A shot commits a specific goal cell and gives the defending king one extra one-square reaction move or a hold. Continuous goal odds then use shooting distance and angle, the keeper's shortest distance to the finite shot path, and the flight time available for reaching that path. A longer shot allows a larger saving reach. A keeper in their own box has full saving reach and readiness; outside their own box, blocking reach and readiness are reduced.

The model separates three outcomes. A save gives the keeper normal possession; a wide shot gives the defending keeper an immediate goal kick, returning an advanced keeper to the nearest empty square of their own box. A goal resets formation and gives kickoff to the conceding side. Goal and keeper-move previews show the goal/save/wide probabilities and a coverage overlay before the outcome is rolled.

### Transparent shot heuristic

This is a tunable game model, not an xG model fitted to real match data. Distances and times are abstract game units.

For origin S and target T on the physical goal plane (y=-0.5 or 14.5), let L be their Euclidean distance and u the normalized shot direction. Project the keeper K onto the finite segment: q=clamp(dot(K-S,u),0,L). Clearance c is the distance from K to that closest point, and available flight time t=q/6. A keeper behind the shooter has zero saving probability.

- On-target chance: clamp(0.98 × exp(-0.018L) × (0.65 + 0.35 × abs(u.y)), 0.15, 0.98).
- Reach: bodyRadius + diveSpeed × max(0, t - reactionDelay).
- Readiness: maxSave × (1 - exp(-(0.35 + t) / 0.45)).
- Save chance conditional on an on-target shot: readiness × exp(-(c / reach)²).
- Goal chance: onTarget × (1 - conditionalSave). Save chance: onTarget × conditionalSave. Wide chance: 1 - onTarget.

| Keeper starts in | Body radius | Dive speed | Reaction delay | Maximum save readiness |
| --- | ---: | ---: | ---: | ---: |
| Own box | 0.40 | 1.30 | 0.15 | 0.94 |
| Outside own box | 0.25 | 0.65 | 0.20 | 0.55 |

One seeded uniform draw resolves the mutually exclusive outcomes, with goal first, then save, then wide. AI planning and previews do not consume randomness. The pending shot retains its original shooter position while the keeper reacts.

The choice of distance, angle and keeper alignment as factors is informed by [goalkeeper positioning research](https://pmc.ncbi.nlm.nih.gov/articles/PMC5800537/) and [Hudl's explanation of expected goals](https://support.hudl.com/s/article/expected-goals?language=en_US&topic=Statsbomb_Global_Football_Data_Glossary); the formula and coefficients above are custom balancing choices.

## Movement and passing

- Regular movement uses chess patterns, capped at ten squares per move. Kings move one square; pawns move one square in any cardinal direction. Pawns still tackle on forward diagonals.
- The free pawn action is a cardinal reposition, optionally with the ball or to collect a loose ball. It cannot tackle. It is available in each ordinary positioning turn, not during the special keeper reaction.
- Only kings enter the four-column, two-row goal areas.
- Non-knight pieces kick along their movement directions; kings can kick farther than they move. Knights kick one L-shaped jump. Ordinary passes stop at the first piece.
- A teammate's back-pass to the king requires an immediate kick with no positioning or dribbling first. A king receiving an opponent's pass or saving a shot may hold normally.
- Passes through ten squares have 100% accuracy. Each extra square costs ten percentage points, with a floor of 25%. Distances use the maximum coordinate gap. Inaccurate passes scatter to an empty square near the intended target. Shots use the continuous model above; the long-pass curve applies to passes.
- Shots, long passes, and 50% knight tackles use serializable seeded randomness; previews and AI planning do not consume random draws. Undo restores the prior random state.

The shot coefficients, accuracy curve, pawn-kick expansion and goal-box dimensions are explicit playable defaults documented in the in-game rules. The computer considers keeper reactions when choosing shots.

## Features

Timed or untimed matches, pause, undo, rotation, local saving, and adjustable opponent pace (3 seconds by default). Computer actions have move animations, retained paths, and descriptions. Reduced-motion preferences are respected. The shot-model update retains the version 2 save key and active matches. The earlier board expansion used a new save key because the roster and geometry changed; version 1 saves remain untouched and opponent pace is retained when starting the new rules.

## Source and validation

- `dist/index.html`: interface and custom rules
- `dist/style.css`: responsive pitch and interface
- `dist/app.js`: input, phase controls, clock, AI scheduling, browser persistence
- `dist/engine.js`: immutable rules, seeded outcomes, computer decisions
- `tests/engine.test.mjs`: deterministic rule scenarios and extended AI play

No build or runtime dependencies. Serve `dist/` using a static HTTP server. Run `npm test` with Node.js.

Validation includes 57 engine tests, continuous geometry and deterministic outcome boundaries, movement and possession invariants, and DOM interaction checks. Actual browser rendering and animation could not be visually verified in this environment.
