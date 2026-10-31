# Automatic red cards — rules version 21

A foul is a straight red when an outfield challenger has no other defending outfielder on a row strictly between the carrier and the goalkeeper, across any file, or when a goalkeeper fouls at a contact square outside its own box. The original position determines both conditions; the tackler and goalkeeper never count as additional cover. Foul frequency remains 10%, and clean outcomes and shooting odds are unchanged.

The native transition, legal tackle previews and Tactical chance branches share the same decision. Logs and saved dismissals retain the automatic-red reason. Existing two-yellow dismissals still apply; an automatic straight red does not add a yellow. The preview also identifies a booked player's second-yellow risk.

Keeper replacement remains the nearest available pawn to the keeper's pre-tackle location, with the nearest other teammate as fallback. The replacement retains its ID, becomes a king and moves into the nearest vacant own-box square. The team loses one active player. Falling below seven ends the match by forfeit before replacement.

Validation: 236 targeted tests passed across automatic reds, standard cards and second yellows, AI chance branches, simulation/statistics, final-whistle restarts, keeper roles and catches, ratings, heatmaps and set pieces. Tests cover both attack directions, all referee partitions, cover boundaries, contact versus landing/origin, save normalization, single-draw RNG, no-Fouls mode, knight evasion, replacement fallback and forfeits. Generic card fixtures now explicitly include a covering defender.

Browser QA used seeded local fixtures in the production UI: last-defender straight red and direct free kick; outside-box keeper straight red with P3 automatically replacing K; second yellow with removal and correct journal entry. Checked tackle warnings and handbook text. The temporary fixture page was removed before packaging.

`tests.tap` records the test output. `rules-preview.jpg` shows the updated handbook.
