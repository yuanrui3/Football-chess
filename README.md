# Football Chess — 11 a side

A playable custom variation inspired by Football Chess by Serrano Saunders.
Original handbook: https://pdfhost.io/v/bWV1pmicf_Football_Chess_Handbook.pdf

## Play

Choose a computer opponent or two players on one device. Each team has one king, one queen, two rooks, two bishops, two knights, and three pawns on a 12×15 pitch. Goals occupy files e–h. Arrange your starting half if desired; move a teammate onto the kickoff carrier to change the taker. Click Kick off, then select a highlighted kick destination.

Each attack or defense positioning turn provides one regular move plus an optional one-square pawn reposition, in either order. The controls show which actions remain; End positioning turn forfeits the unused actions. Then the attacker kicks. Knights jump while dribbling. Tackles against a knight succeed 50% of the time; other legal tackles remain certain. The challenger moves to the selected adjacent square on either outcome. A failed attempt leaves the knight in possession and uses the challenger’s regular move while preserving any unused free pawn action. Pieces are never captured.

A shot commits a specific goal cell and gives the defending king one extra one-square reaction move or a hold. Continuous goal odds then use shooting distance and angle, the keeper's shortest distance to the finite shot path, and the flight time available for reaching that path. A longer shot allows a larger saving reach. A keeper in their own box has full saving reach and readiness; outside their own box, blocking reach and readiness are reduced.

The model separates goals, stopped shots, and wide shots. A caught save gives the keeper normal possession. For shots longer than ten squares, 20% of stopped-shot outcomes are tips out for a corner. Wide shots and inaccurate long passes may cross a touchline or end line and award a restart. A goal resets formation and gives kickoff to the conceding side. Goal and keeper-move previews show outcome probabilities and a coverage overlay before the outcome is rolled.

### Transparent shot heuristic

This is a tunable game model, not an xG model fitted to real match data. Distances and times are abstract game units.

For origin S and target T on the physical goal plane (y=-0.5 or 14.5), let L be their Euclidean distance and u the normalized shot direction. Project the keeper K onto the finite segment: q=clamp(dot(K-S,u),0,L). Clearance c is the distance from K to that closest point, and available flight time t=q/6. A keeper behind the shooter has zero saving probability.

- On-target chance: clamp(0.98 × exp(-0.018L - 0.06 × max(0, L - 3)²) × (0.65 + 0.35 × abs(u.y)), 0.01, 0.98).
- Reach: bodyRadius + diveSpeed × max(0, t - reactionDelay).
- Readiness: maxSave × (1 - exp(-(0.35 + t) / 0.45)).
- Save chance conditional on an on-target shot: readiness × exp(-(c / reach)²).
- Base goal chance: onTarget × (1 - conditionalSave). Base save chance: onTarget × conditionalSave. Base wide chance: 1 - onTarget.
- Knight shots against a keeper: finalGoal = min(1, 2 × baseGoal). Scale both base save and wide chances by (1 - finalGoal) / (1 - baseGoal), preserving their relative weights and a total of one. Non-knights use a multiplier of one. Previews use the pending shooter's type even while the keeper moves.
- For a shot longer than ten squares by the maximum-coordinate distance, cornerProbability = 0.2 × finalSave and caughtSaveProbability = 0.8 × finalSave. Corner probability is a subset of stopped shots, not an additional probability on top of saveProbability. The live roll partitions goal, tip for corner, catch, then wide. Short stopped shots are always caught.

| Keeper starts in | Body radius | Dive speed | Reaction delay | Maximum save readiness |
| --- | ---: | ---: | ---: | ---: |
| Own box | 0.40 | 1.30 | 0.15 | 0.94 |
| Outside own box | 0.25 | 0.65 | 0.20 | 0.55 |

One seeded uniform draw resolves the mutually exclusive shot outcomes; a long wide shot then uses seeded draws for its landing. AI planning and previews do not consume match randomness. The pending shot retains its original shooter position while the keeper reacts.

Shot model version 5 retains the stronger distance accuracy penalty: shots within three Euclidean squares of the goal plane keep their close-range accuracy, and a quadratic distance term increasingly reduces longer-shot accuracy, down to a 1% base on-target floor. The knight bonus applies after this base model and the keeper's reaction. For an ordinary straight shot from e8 to the upper E goal with the keeper at g15, scoring remains approximately 19.4% before reaction and 8.9% after the best keeper step to f15. Goal-line odds appear only for shots the carrier's kicking pattern and clear path can reach; other cells show an em dash. Positioning previews remain disabled until the kicking phase, and only the committed target shows odds during a keeper reaction.

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

A knight scores when its one L-shaped kick ends in a goal cell. It may now occupy either goal box, opening central finishing positions as well as side approaches: d14→upper E and f14→upper E are examples. Knight shots jump over blockers, then face the usual keeper reaction with the doubled final scoring probability described above.

Only kings and knights may occupy either four-column, two-row goal area. Pawns tackle on their forward diagonals; their sideways and backward movement does not add new tackle directions. Tackles against a knight succeed 50% of the time, including inside a box; other legal tackles succeed automatically. No piece is captured.

### Turn order and exceptions

After kickoff, an ordinary round is **attacking positioning → defending positioning → attacking kick**. Each positioning turn has one regular move and an optional free one-square pawn action, in either order. Dribbling uses a positioning action; it is not a pass or an extra action. End positioning turn forfeits any actions remaining for that team. A turnover starts a fresh attacking positioning turn for the new team; if the ball is still loose after both positioning turns, a new positioning round begins without a kick.

- The free pawn action can move a pawn without the ball, dribble with it, or collect a loose ball. It cannot tackle. It is available in each ordinary positioning turn, not during the special keeper reaction.
- A teammate's back-pass to the king requires an immediate kick with no positioning or dribbling first. A king receiving an opponent's pass or saving a shot may hold normally.
- A shot pauses play for the defending king's one-square reaction or hold; it does not grant a regular positioning turn or free pawn action. A boundary award then starts a protected restart round as described below.
- Ordinary passes through ten squares have 100% accuracy. Each extra square costs ten percentage points, with a floor of 25%. Distances use the maximum coordinate gap. Inaccurate passes sample a landing near the intended target; that landing may be occupied or outside. An occupied landing receives or intercepts the ball, subject to offside. Shots use the continuous model above; the long-pass curve applies to ordinary passes.
- Shots, long passes, and 50% knight tackles use serializable seeded randomness; previews and AI planning do not consume random draws. Undo restores the prior random state.

The shot coefficients, accuracy curve, pawn-kick expansion and goal-box dimensions are explicit playable defaults documented in the in-game rules. The computer considers keeper reactions when choosing shots.

### Offside

At each teammate kick, record attackers strictly inside the opposing half (white y<7, black y>7) and strictly nearer the goal line than both the ball and the second-last opponent. All opposing pieces count; the king need not be last. The halfway row and level positions are onside. Being in an offside position alone is not penalised: direct receipt, later collection, or a challenge for a saved ball triggers an indirect free kick. Moving back onside does not erase the kick-time snapshot. Opponent controlled play, including a keeper deliberately dribbling after a save, clears it; the save itself does not. The discrete game does not simulate visual obstruction or body-part geometry.

There is no offside directly from a goal kick, corner, or throw-in; the next teammate kick creates a normal snapshot. An offside free kick is indirect and has no direct goal targets. The UI distinguishes current positional warnings from players flagged at the last kick and labels a dangerous involvement with `OFF`. The timing, second-last-opponent test, and restart exemptions follow [IFAB Law 11](https://www.theifab.com/laws/latest/offside/).

### Boundaries and restart rounds

An inaccurate ordinary pass longer than ten squares samples one of eight compass directions uniformly and an integer spread uniformly from 1 through max(1, ceil((distance - 10)/2) + 1), relative to its intended target. A long wide shot samples horizontal error between ±2×radius and an end-line overshoot from 1 through radius. Landings are not clamped; the first line crossed by the trajectory from the kicker to landing determines the award. Short wide shots retain a normal end-line restart. An inaccurate throw uses radius max(1, ceil((distance - 5)/2)) and can also leave play.

- Touchline: throw-in to the team that did not touch last.
- End line after an attacking last touch: goal kick to the defending team.
- End line after a defending last touch, including a keeper tip: corner to the attacking team.

The nearest eligible teammate, using Euclidean distance and stable ID tie-breaking, becomes the taker and is placed at the nearest vacant legal square to the restart location. No players are displaced. A goal kick starts inside the defending box and uses a king or knight; a corner starts by the nearest corner; a throw-in starts at the touchline exit; an offside restart uses the offence location. The taker receives the ball and a full attacking positioning round, then the defender positions, then the taker restarts play. The taker is locked in place and tackles are disabled until the ball is played. These protected positioning rounds and nearest-player selection are custom turn-based adaptations; the boundary award follows [IFAB Laws 15–17](https://www.theifab.com/laws/latest/the-throw-in/).

Every piece throws along the same eight straight/diagonal rays, stopping at the first player. Throws are certain through five squares; accuracy is 85%, 70%, 55%, 40%, and 25% at six through ten squares. No target beyond ten squares and no direct goal is offered. The range curve is a custom game rule, independent of ordinary passing accuracy.

## Features

Timed or untimed matches, pause, undo, rotation, local saving, and adjustable opponent pace (3 seconds by default). Computer actions have move animations, retained paths, and descriptions. Reduced-motion preferences are respected. The shot-model update retains the version 2 save key and active matches. The earlier board expansion used a new save key because the roster and geometry changed; version 1 saves remain untouched and opponent pace is retained when starting the new rules.

### Computer difficulty

Choose either level in the Computer difficulty control beside the pitch, before or during a match. The selection is saved without resetting the match. Existing saves default to Casual. Opponent pace remains a separate setting.

- **Casual** preserves the original reactive AI. It ranks legal actions using possession, tackles, attacking progress, shooting opportunities, pass accuracy, and keeper positioning. It does not search a sequence of opponent replies.
- **Tactical** searches up to six actions through the actual phase and movement-budget rules, considering both teams' replies. It shortlists candidates and uses a fixed search budget, so it cannot examine every continuation. Shots, inaccurate passes, throws, and knight tackles are weighted by their possible outcomes. Pass and throw misses enumerate all direction/radius outcomes. Long wide shots use a bounded symmetric sample of lateral errors and mean overshoot, rather than every landing. Chance branches receive planning budget proportional to their probability. Both levels understand offside and restart restrictions.

Both levels use the same legal moves, scoring odds, and optimal immediate keeper reaction. Neither reads future match randomness or changes it while planning. Tactical runs in a module Web Worker to keep the controls responsive; cancelling or changing the match discards stale results. Unsupported workers fall back to the same bounded policy on the main thread, and a worker timeout falls back to Casual for that action. Search limits depend on actions and node budgets, not processor speed.

## Source and validation

- `dist/index.html`: interface and custom rules
- `dist/style.css`: responsive pitch and interface
- `dist/app.js`: input, phase controls, clock, AI scheduling, browser persistence
- `dist/engine.js`: immutable rules, seeded outcomes, computer decisions
- `dist/ai-worker.js`: background Tactical planning
- `tests/engine.test.mjs`: deterministic rule scenarios and extended AI play
- `tests/ai.test.mjs`: both policies, legal play, fair randomness, and tactical scenarios
- `tests/offside-knight.test.mjs`: knight upgrades and offside timing, involvement, and exemptions
- `tests/boundary.test.mjs`: boundary geometry, restart awards, throw ranges, and seeded scatter

No build or runtime dependencies. Serve `dist/` using a static HTTP server. Run `npm test` with Node.js. Before each deployment, run `node scripts/version-assets.mjs` so the HTML, controller, engine, worker, and stylesheet use matching content versions instead of stale browser caches.

Validation covers continuous shot geometry and deterministic outcome boundaries, movement and possession invariants, both AI levels across every phase and move budget, seed-independent planning, and extended legal play. DOM interaction checks cover saved preferences, independent pace, worker failures, and stale-result cancellation. Short deterministic match benchmarks are smoke checks rather than evidence of a general win rate.
