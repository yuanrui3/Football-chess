# Football actions in player ratings

The previous “Advanced into new squares” explanation already measured retained
forward ball progress from successful passes and dribbles. It did not reward
arbitrary visited squares. Method 5 names the actual credited actions and adds
small awards for useful forward runs and retaining possession under pressure.

- Forward dribbles must retain control; passes must reach a teammate, including
  a through ball only after collection. The existing possession-wide forward
  frontier prevents backward/forward passing or carrying loops earning again.
- An outfield forward run must finish onside with a legal delivery from the
  current carrier. Each player's furthest credited depth is tracked for the
  possession. Walking to an unrelated square or repeating the route earns no
  run award. This is a geometric heuristic, not an assessment of every tactic.
- A keeper's forward carry and attacking support receive 20% of their former
  movement weight. Keepers receive no generic forward-run award. Successful
  distribution retains its normal weight; shot stopping and the method 4
  goalkeeper positioning rubric are unchanged. The 20% is a tuning choice.
- Keeping possession is credited when the actual carrier escapes a legal tackle
  threat by dribbling or passing, or survives a missed tackle. The latter uses
  the native tackle probability to temper the random outcome. A player can
  receive this small award only once per possession. Waiting earns no award.
- Counts describe credited contributions, not every pass or movement made.

Saved methods 1–4 restore without regrading. On the next new transition, method
4 starts method 5 counters prospectively, preserves accumulated merit/impact,
and labels previous ball progress as earlier retained progress. Methods 1–3
continue their prior formulas. Duplicate recording, undo, JSON and compressed
match replay preserve the new ledger and anti-repetition state.

Validation: 242 tests passed across player ratings, keeper balance, the full-time
report, heatmaps, match statistics, portable replay and post-match analysis.
See `test-results.txt`. The older yellow-card test fixture now includes a
covering defender so that its intended ordinary foul is not an automatic red.

Browser QA used the actual local app with a generated full-roster fixture:
one keeper carry and a completed forward pass. The report showed their separate
counts and the keeper weighting explanation. `keeper-rating-proof.jpg` records
that result. The fixture loader was removed before packaging; it is not part of
the game. No production match state was modified by the test.
