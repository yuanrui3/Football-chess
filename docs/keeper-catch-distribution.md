# Catch distribution advantage

Rules version 20 gives a clean catch of an opponent's shot an optional immediate
distribution. The keeper can pass before either team repositions, or choose
**Hold & organise** to retain the existing positioning round, including all
normal movement allowances. A wide shot still awards its native boundary
restart; a goal kick requires both teams' protected positioning turns first.

The immediate distribution follows normal legal kicking geometry, pass
accuracy, blocking and offside rules. It does not inherit a goal kick's loft
or offside exemption. No shot, save, parry or miss probability changes.

The native state is `keeperRelease` with `releaseReason: 'catch'`. `skipMove`
declines this option without advancing the turn, drawing randomness, clearing
the shot-time offside snapshot or spending progress/pace allowances. The next
normal dribble or pass applies the existing deliberate-play offside rules.
An action timeout declines the optional distribution. A catch after the match
clock expires does not grant a new attack beyond full time.

Teammate back-passes retain `releaseReason: 'backPass'`, with a compulsory
immediate kick and no hold option. Intercepted ordinary passes, loose rebounds,
corners and goal kicks do not receive the new catch option. Penalty catches
qualify during live match time; their 80/20 outcome split is unchanged.

Casual distributes to a reliable onside teammate when its chosen outlet meets
that requirement, otherwise it holds. Tactical compares both distribution and
holding using the native phase transitions. Both match and exercise interfaces
expose the choice. Save/Undo preserves it without retroactively granting it to
an older saved positioning state.

Validation covers both teams, immediate passing, holding and available moves,
offside and blocking, unchanged goal-kick preparation, saved-state replay,
timeout/full-time behaviour, native AI decisions, match statistics, ratings,
and simulation round accounting. Browser QA exercised quick distribution,
holding, Undo and the contrasting goal-kick preparation through actual controls.

Verification: the complete suite ran 1,821 tests. Four assertions still expected
the old catch phase; they were updated to exercise the new choice. A subsequent
66-test run covering the new catch tests, AI integration, foul chance branches
and offside passed without failures. The full run's two other failures are the
previously documented mirrored corner-flag placement expectations in
`tests/pitch-expansion.test.mjs:88`; this change does not alter corner placement.
