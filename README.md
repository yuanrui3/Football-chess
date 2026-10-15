# Football Chess

A buildless, browser-local playable adaptation of Football Chess by Serrano Saunders.

Original handbook: https://pdfhost.io/v/bWV1pmicf_Football_Chess_Handbook.pdf

## Play

Choose the computer opponent or two players on the same device. Arrange pieces on your own half if desired. Select a teammate, then the kickoff carrier's centre square, to change the kickoff taker. Start the match and choose a highlighted pass destination.

Normal play follows attack positioning, defense positioning, and the attacker's kick. Highlighted red destinations are tackle landing squares. Only a ball carrier can be tackled; pieces are never removed. Lit goal buttons shoot beyond the end line through the goal mouth. Matches support timed or untimed play, pause, undo, rotation, and local saving. Saved active games reopen paused.

## Source

- `dist/index.html`: interface and in-game rules
- `dist/style.css`: responsive board and layout
- `dist/app.js`: input, match lifecycle, timer, AI scheduling and browser persistence
- `dist/engine.js`: immutable, dependency-free rules and computer decisions
- `tests/engine.test.mjs`: rule scenarios and extended legal AI play

No build or runtime dependencies. Serve `dist/` using any static HTTP server. Run `npm test` with Node.js to check the game engine.

## Digital interpretations

The handbook's text is the rules source. Its original binary PDF endpoint was unavailable during development; box geometry and centre markings are explicit interpretations: two-by-two boxes at each end, centred on files d/e, and kickoff on d6/e6. Other ambiguities are documented in the in-game How to play panel: L-shaped knight passes, forward-only pawn kicks, any-distance ray kicks, no promotion/check/castling, turnover phase resets, loose-ball continuity, and post-goal formation resets. A pawn at the far border may kick against that border to keep the game progressing. Hold position and undo are digital convenience controls.

The interface was checked with DOM interaction smoke tests. Visual browser QA was unavailable in this environment.
