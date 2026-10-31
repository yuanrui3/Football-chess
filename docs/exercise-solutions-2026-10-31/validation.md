# On-board exercise solutions

Added Play solution to all 36 tactical exercises, with automatic playback of both sides and Pause/Resume, Previous, Next, Restart, and Back to my attempt controls. Watching uses an independent exercise session and never awards completion or changes the held attempt.

Example records are generated using the native rules and expanded Tactical study policy with seed 1984. All 36 recordings meet their native exercise objectives within their original round limits. Generate again after relevant rules, study policy, or exercise updates with `node scripts/build-exercise-solutions.mjs`, then run `node scripts/version-assets.mjs`.

## Validation

- `node --test --test-concurrency=2 tests/exercise*.test.mjs`: 213 passed, 0 failed.
- `node --check dist/exercises-app.js` and `git diff --check`: passed.
- Browser: exercise 30, started an attempt with keeper g1 to rook g8. Played all 11 recorded actions, including opponent replies; finished as SOLUTION DEMONSTRATED with solved count still 0/36. Back to my attempt restored identical board labels, ball carrier, status and solved count.
- Browser: Previous/Next step correctly; board input is disabled during the demonstration. Switching to exercise 1 cleared the previous playback; automatic playback completed its two actions and left solved count 0/36.
- Unit coverage includes frame isolation, native legality of every example, stale/incomplete data rejection, timer cancellation on pause/seek/exit/restart, opponent frames, attempt isolation, and evaluation suspension.
- Engine, scoring rules, exercise objectives and round limits unchanged.

Screenshot: interface.jpg.
