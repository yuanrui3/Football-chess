# Football Chess — 11 a side

A playable custom variation inspired by Football Chess by Serrano Saunders.
Original handbook: https://pdfhost.io/v/bWV1pmicf_Football_Chess_Handbook.pdf

## Play

Choose a computer opponent or two players on one device. Each team has one king, one queen, two rooks, two bishops, two knights, and three pawns on a 12×15 pitch. Goals occupy files e–h. Arrange your starting half if desired; move a teammate onto the kickoff carrier to change the taker. Click Kick off, then select a highlighted kick destination.

Each attack or defense positioning turn provides one regular move plus an optional one-square pawn reposition, in either order. The controls show which actions remain; End positioning turn forfeits the unused actions. Then the attacker kicks. Knights jump while dribbling and cannot be tackled. Pieces are never captured.

A shot commits a specific goal cell and gives the defending king one extra one-square reaction move or a hold. After that reaction, scoring uses the maximum horizontal/vertical gap between the king and the impact square on the inner goal line:

| Distance | Goal probability |
| --- | --- |
| 0 | 0% |
| 1 | 25% |
| 2 | 50% |
| 3+ | 100% |

A failed shot is saved into the keeper's possession. A successful shot resets formation and gives kickoff to the conceding team. Goal cells show odds before the reaction; keeper destinations preview the odds after moving. Both teams have the same rules.

## Movement and passing

- Regular movement uses chess patterns, capped at ten squares per move. Kings move one square; pawns move one square in any cardinal direction. Pawns still tackle on forward diagonals.
- The free pawn action is a cardinal reposition, optionally with the ball or to collect a loose ball. It cannot tackle. It is available in each ordinary positioning turn, not during the special keeper reaction.
- Only kings enter the four-column, two-row goal areas.
- Non-knight pieces kick along their movement directions; kings can kick farther than they move. Knights kick one L-shaped jump. Ordinary passes stop at the first piece.
- A teammate's back-pass to the king requires an immediate kick with no positioning or dribbling first. A king receiving an opponent's pass or saving a shot may hold normally.
- Passes through ten squares have 100% accuracy. Each extra square costs ten percentage points, with a floor of 25%. Distances use the maximum coordinate gap. Inaccurate passes scatter to an empty square near the intended target. Shots use only the keeper odds above.
- Actual outcomes use serializable seeded randomness; previews and AI planning do not consume random draws. Undo restores the prior random state.

The distance bands, accuracy curve, pawn-kick expansion and goal-box dimensions are explicit playable defaults documented in the in-game rules. The computer considers keeper reactions when choosing shots.

## Features

Timed or untimed matches, pause, undo, rotation, local saving, and adjustable opponent pace (3 seconds by default). Computer actions have move animations, retained paths, and descriptions. Reduced-motion preferences are respected. Version 2 uses a new save key because the roster and geometry changed; version 1 saves remain untouched and opponent pace is retained when starting the new rules.

## Source and validation

- `dist/index.html`: interface and custom rules
- `dist/style.css`: responsive pitch and interface
- `dist/app.js`: input, phase controls, clock, AI scheduling, browser persistence
- `dist/engine.js`: immutable rules, seeded outcomes, computer decisions
- `tests/engine.test.mjs`: deterministic rule scenarios and extended AI play

No build or runtime dependencies. Serve `dist/` using a static HTTP server. Run `npm test` with Node.js.

Validation includes 46 engine tests, deterministic shooting boundaries, movement and possession invariants, and DOM interaction checks. Actual browser rendering and animation could not be visually verified in this environment.
