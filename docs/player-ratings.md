# Full-time player ratings

The full-time report includes an interactive ratings pitch for each team. Each
piece keeps its stable ID, including players sent off. The positions are a review
lineup, not the final match coordinates: after a goal, the engine resets the
formation, and final squares would otherwise hide the player's role.

Ratings are out of ten, starting at 6.0. They describe performance relative to
the piece's native abilities. The separate impact figure describes contribution
before that adjustment. A pawn can receive a higher rating than a queen while
the queen still has greater overall impact. These are transparent game
heuristics, not calibrated real-football ratings or probabilities.

Selecting a piece shows the recorded contributions behind its rating. Quiet
pieces stay near the starting rating, and the report avoids awarding player of
the match for an unused player's baseline score. The two pitches use the same
review slots, with the attacking direction labelled on each.

## Recording and persistence

`dist/player-ratings.js` records contributions from committed native engine
transitions. Its ledger is stored with `matchStats.playerRatings`, so existing
save, restore and Undo snapshots also preserve ratings. Replays only display
past play and never record a second contribution. Match rules, sampled outcomes
and computer decisions are unchanged.

Existing match saves can lack the new ledger. They retain their original score
and statistics; ratings explicitly cover only the available history. Missing
actions are never reconstructed as invented performances. Starting a new match
starts a fresh ledger.

`dist/player-ratings-view.js` renders the report without changing the match or
the ledger. Its buttons provide piece IDs, teams, ratings, dismissals and details
to keyboard and screen-reader users. The two pitches stack on narrow screens.

## Scope

The first version rewards observed useful contributions and measured local
geometry. It does not claim to reconstruct every pressing trap, decoy run or
formation responsibility. Chance events are tempered so a lucky finish or
failed probabilistic tackle does not alone decide a piece's entire performance.
Routine ball circulation and repeated routes do not earn unlimited credit.

The model and view have focused tests for native abilities, expected versus
sampled outcomes, contribution recording, restoration, quiet players, all 22
identities and rating-detail selection. Existing match-statistics and save
compatibility tests remain part of the validation.
