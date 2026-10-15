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

- On-target chance: clamp(0.98 × exp(-0.018L - 0.06 × max(0, L - 3)²) × (0.65 + 0.35 × abs(u.y)), 0.01, 0.98).
- Reach: bodyRadius + diveSpeed × max(0, t - reactionDelay).
- Readiness: maxSave × (1 - exp(-(0.35 + t) / 0.45)).
- Save chance conditional on an on-target shot: readiness × exp(-(c / reach)²).
- Goal chance: onTarget × (1 - conditionalSave). Save chance: onTarget × conditionalSave. Wide chance: 1 - onTarget.

| Keeper starts in | Body radius | Dive speed | Reaction delay | Maximum save readiness |
| --- | ---: | ---: | ---: | ---: |
| Own box | 0.40 | 1.30 | 0.15 | 0.94 |
| Outside own box | 0.25 | 0.65 | 0.20 | 0.55 |

One seeded uniform draw resolves the mutually exclusive outcomes, with goal first, then save, then wide. AI planning and previews do not consume randomness. The pending shot retains its original shooter position while the keeper reacts.

Shot model version 4 preserves the previous accuracy for shots within three Euclidean squares of the goal plane. Beyond that, a quadratic distance term increasingly reduces accuracy, down to a 1% on-target floor. Keeper reach, angle effects, and passing accuracy retain their existing formulas. For a straight shot from e8 to the upper E goal with the keeper at g15, scoring is approximately 19.4% before reaction and 8.9% after the best keeper step to f15. Goal-line odds appear only for shots the carrier's kicking pattern and clear path can reach; other cells show an em dash. Positioning previews remain disabled until the kicking phase, and only the committed target shows odds during a keeper reaction.

The choice of distance, angle and keeper alignment as factors is informed by [goalkeeper positioning research](https://pmc.ncbi.nlm.nih.gov/articles/PMC5800537/) and [Hudl's explanation of expected goals](https://support.hudl.com/s/article/expected-goals?language=en_US&topic=Statsbomb_Global_Football_Data_Glossary); the formula and coefficients above are custom balancing choices.

## Moving, dribbling, and kicking

These are distinct actions. Moving a piece does not automatically pass the ball, and a kick does not move the kicker.

| Action | What moves | When available | Cost |
| --- | --- | --- | --- |
| Move without the ball | The selected piece; the ball stays where it is. Landing on a loose ball collects it. | Your team's positioning turn | One regular move, or the free pawn action for a pawn |
| Dribble | The ball carrier and ball move together. | Your team's positioning turn | One regular move, or the free pawn action if the carrier is a pawn |
| Pass or shoot | The ball travels; the kicker stays in place. | Kickoff, the attacking kick phase, or a required goalkeeper release | The kick action |
| Tackle | A challenger moves to a highlighted square beside the opposing carrier and attempts to take possession. | Your team's positioning turn | One regular move; never the free pawn action |

### Piece reference

Off-ball movement and dribbling currently use the same pattern for a given piece. Passing and shooting use the separate kick pattern and range below.

| Piece | Move without ball / dribble | Pass / shoot |
| --- | --- | --- |
| King (goalkeeper) | One square horizontally, vertically, or diagonally | Any distance horizontally, vertically, or diagonally |
| Queen | Up to 10 squares horizontally, vertically, or diagonally | Any distance horizontally, vertically, or diagonally |
| Rook | Up to 10 squares horizontally or vertically | Any distance horizontally or vertically |
| Bishop | Up to 10 squares diagonally | Any distance diagonally |
| Knight | One L-shaped jump: two squares on one axis and one on the other | One L-shaped jump |
| Pawn | One square forward, backward, left, or right | Any distance forward, backward, left, or right |

Ordinary movement requires a clear path and an empty destination. Knights jump over intervening pieces, including while dribbling. Ordinary kicks stop at the first piece: a teammate receives the ball, an opponent intercepts it, and an empty destination leaves a loose ball. Knight kicks jump over intervening pieces. A shot uses the piece's kick pattern to reach one of the four goal targets; other pieces block its path, while the opposing goalkeeper instead gets a reaction before the shot resolves.

A knight scores only when its one L-shaped kick ends in a goal cell. For the upper goal, valid origins are c15→E, d15→F, i15→G, j15→H, d14→E, and i14→H. The lower goal mirrors these at c1, d1, i1, j1, d2, and i2. The central goal-box squares cannot be occupied by knights. Knight shots jump over blockers, then use the same keeper reaction and goal/save/wide model as other shots.

Only kings may occupy the four-column, two-row goal areas. Pawns tackle on their forward diagonals; their sideways and backward movement does not add new tackle directions. Tackles against a knight succeed 50% of the time; other legal tackles succeed automatically. No piece is captured.

### Turn order and exceptions

After kickoff, an ordinary round is **attacking positioning → defending positioning → attacking kick**. Each positioning turn has one regular move and an optional free one-square pawn action, in either order. Dribbling uses a positioning action; it is not a pass or an extra action. End positioning turn forfeits any actions remaining for that team. A turnover starts a fresh attacking positioning turn for the new team; if the ball is still loose after both positioning turns, a new positioning round begins without a kick.

- The free pawn action can move a pawn without the ball, dribble with it, or collect a loose ball. It cannot tackle. It is available in each ordinary positioning turn, not during the special keeper reaction.
- A teammate's back-pass to the king requires an immediate kick with no positioning or dribbling first. A king receiving an opponent's pass or saving a shot may hold normally.
- A shot pauses play for the defending king's one-square reaction or hold; it does not grant a regular positioning turn or free pawn action. A wide shot gives the defending keeper an immediate goal kick.
- Passes through ten squares have 100% accuracy. Each extra square costs ten percentage points, with a floor of 25%. Distances use the maximum coordinate gap. Inaccurate passes scatter to an empty square near the intended target. Shots use the continuous model above; the long-pass curve applies to passes.
- Shots, long passes, and 50% knight tackles use serializable seeded randomness; previews and AI planning do not consume random draws. Undo restores the prior random state.

The shot coefficients, accuracy curve, pawn-kick expansion and goal-box dimensions are explicit playable defaults documented in the in-game rules. The computer considers keeper reactions when choosing shots.

## Features

Timed or untimed matches, pause, undo, rotation, local saving, and adjustable opponent pace (3 seconds by default). Computer actions have move animations, retained paths, and descriptions. Reduced-motion preferences are respected. The shot-model update retains the version 2 save key and active matches. The earlier board expansion used a new save key because the roster and geometry changed; version 1 saves remain untouched and opponent pace is retained when starting the new rules.

### Computer difficulty

Choose either level in the Computer difficulty control beside the pitch, before or during a match. The selection is saved without resetting the match. Existing saves default to Casual. Opponent pace remains a separate setting.

- **Casual** preserves the original reactive AI. It ranks legal actions using possession, tackles, attacking progress, shooting opportunities, pass accuracy, and keeper positioning. It does not search a sequence of opponent replies.
- **Tactical** searches up to six actions through the actual phase and movement-budget rules, considering both teams' replies. It shortlists candidates and uses a fixed search budget, so it cannot examine every continuation. Shots, inaccurate passes, and knight tackles are weighted by their possible outcomes. A missed pass uses a reproducible representative landing square, rather than every possible scatter square.

Both levels use the same legal moves, scoring odds, and optimal immediate keeper reaction. Neither reads future match randomness or changes it while planning. Tactical runs in a module Web Worker to keep the controls responsive; cancelling or changing the match discards stale results. Unsupported workers fall back to the same bounded policy on the main thread, and a worker timeout falls back to Casual for that action. Search limits depend on actions and node budgets, not processor speed.

## Source and validation

- `dist/index.html`: interface and custom rules
- `dist/style.css`: responsive pitch and interface
- `dist/app.js`: input, phase controls, clock, AI scheduling, browser persistence
- `dist/engine.js`: immutable rules, seeded outcomes, computer decisions
- `dist/ai-worker.js`: background Tactical planning
- `tests/engine.test.mjs`: deterministic rule scenarios and extended AI play
- `tests/ai.test.mjs`: both policies, legal play, fair randomness, and tactical scenarios

No build or runtime dependencies. Serve `dist/` using a static HTTP server. Run `npm test` with Node.js. Before each deployment, run `node scripts/version-assets.mjs` so the HTML, controller, engine, worker, and stylesheet use matching content versions instead of stale browser caches.

Validation covers continuous shot geometry and deterministic outcome boundaries, movement and possession invariants, both AI levels across every phase and move budget, seed-independent planning, and extended legal play. DOM interaction checks cover saved preferences, independent pace, worker failures, and stale-result cancellation. Short deterministic match benchmarks are smoke checks rather than evidence of a general win rate.
