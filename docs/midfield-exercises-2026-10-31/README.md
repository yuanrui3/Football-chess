# Midfield exercises

Six studies extend the existing 36 without changing their IDs or numbers. The catalogue now contains 42 studies, with 14 at each difficulty.

| Number | Level | Theme | Study |
| --- | --- | --- | --- |
| 37 | Easy | Switch play | Find the open flank |
| 38 | Medium | Switch play | Clear the switching lane |
| 39 | Tough | Switch play | Switch through a moving pivot |
| 40 | Easy | Protect possession | Step off the pressure line |
| 41 | Medium | Protect possession | Protect the receiver with support |
| 42 | Tough | Protect possession | Keep control in the crowd |

## Objective grading

Midfield studies use a possession objective instead of a shot threshold. A switch requires controlled outfield possession inside the marked far-side area after one complete defending phase. Protection requires two consecutive clean defensive replies with outfield possession inside the marked central area. Ordinary and shared-bonus defensive actions together count as one reply.

Opening a study, completing a pass, or leaving a loose ball in the area cannot solve it immediately. A turnover, restart, leaving the marked area, or using the goalkeeper as carrier resets the streak. A failed 50% tackle against a knight cannot earn clean-protection credit. The player may recover possession and continue while the original three/four-round budget remains. Any legal route meeting the stated objective earns credit; example actions and pass counts are not required.

The marked area is visible on the pitch and included in square accessibility labels. A live counter displays secured replies. Both new themes work with the difficulty filter. Hints, live play, Undo, Retry, saved progress, and the separate on-board solution player use the same session rules.

## Verification

- All 42 examples were regenerated against the unchanged deeper study opponent with native seed 1984; all met their objectives. No forced outcome overrides were used.
- `validation.json` records every example's outcome, with full native action traces and protection counters for the six new studies.
- 145 focused session, midfield, catalogue, UI and replay checks passed.
- 22 position and existing Easy-study checks passed.
- Tests cover full defensive-phase counting, alternative receiving squares, loose balls, turnovers, out-of-area movement, restarts, knight evasion, and actual guaranteed challenges in the protection diagrams.
- Browser: theme/difficulty filtering selects exercise 42; its solution replay reaches “Possession protected” at 2/2. Live exercise 37 stays active after the pass, waits for the worker's full reply, then reaches “Switch secured” at 1/1 and records completion. Returning from the demonstration restores the attempt.
- `git diff --check` passed. Game engine and match AI were not changed.

These checks establish legal, working illustrative routes against the current bounded opponent. They do not prove optimal defence or a minimum solution length. Protection teaches spatial control and support rather than a separate physical shielding mechanic.

```sh
node scripts/build-exercise-solutions.mjs
node scripts/version-assets.mjs
node --test tests/exercise-session.test.mjs tests/exercise-difficulty.test.mjs tests/exercises-ui.test.mjs tests/exercise-midfield.test.mjs tests/exercise-solutions.test.mjs
node --test tests/exercise-positions.test.mjs
```
