# Deeper exercise defence audit

The old exercise defender optimized only the positioning phase before the next kick. If that kick was a pass rather than a shot, equally safe positions could tie and the skip action could win. In the original exercises 26 and 27 this missed the opposing rook's chance to prepare on j17 and attack the later receiver.

Exercise defence now follows the native tactical continuation with a 24,000-node allowance and a depth cap of 14 actions. Exact immediate-threat checks still cover normal moves, the shared bonus, goalkeeper replies, and both outcomes of uncertain knight tackles. A forward choice is accepted only after a complete local check confirms that it preserves the best immediate protection. Guaranteed possession wins retain their existing exhaustive shortcut. Ordinary match AI and engine rules are unchanged.

The worker publishes completed iterations, beginning with its local safeguard. Its recovery timeout is 60 seconds to allow the larger study search on slower devices. This remains bounded search, not a proof of perfect defence or universal puzzle solvability.

## Catalogue findings

Running all 36 original example plans against the new opponent produced 34 successful plans. Exercises 26 and 27 lost possession before their intended finish. Twenty-four recorded reply sequences changed: 4–9, 13–21, and 25–33.

| Exercise | Revision | Change | Checked chance | Required chance |
| --- | --- | --- | --- | --- |
| 26: Cross, jump, and chip | 4 | Move the wide rook's start to b15 with the ball and the knight to f14. Cross directly to h15, collect with the knight, carry to j16, then shoot at I. | 22.68% | 20% |
| 27: Link, retreat, and screen the press | 3 | Keep the starting board. After Ba12–Nd15–Qf16, retreat to f14 and move Nd15–e13 to stop the pawn's bonus-assisted challenge, then shoot at F. | 17.41% | 15% |

All chance targets and all original three/four-round limits remain unchanged. Exercise 27's guide now says five player actions; the extra off-ball screen shares a positioning turn with the queen's dribble and does not add a possession round. Either preparation order works. Hints remain suggestions: the outcome grading continues to accept any qualifying legal route.

Exercise 30's main example remains valid. Its previously tested alternative Qj11–k11 is now held to an 8.26% finish by Ra17–a15–g15, below its 13% target. The regression test now recognizes that concrete defensive improvement instead of expecting a weaker alternative to succeed. Other alternative-route and outcome-grading checks still pass.

The final full-catalogue audit is **36/36 successful example plans** using natural seed 1984, with no forced goals or tackle misses. This checks the illustrated plans against this deterministic opponent; it does not exhaust every possible human route or all random outcomes. All solution recordings were rebuilt with the current policy. AI version and source-hash metadata prevent stale demonstrations from silently passing validation.

## Validation

- Initial focused run: 171/173 checks passed. The two failures were the old 20-second watchdog expectation and the now-refuted exercise 30 alternative.
- Updated UI suite: 32/32 passed, including 60-second recovery from a completed safe iteration.
- Updated alternative-route checks: 2/2 passed, covering the refuted exercise 30 route, exercise 27's reversed preparation order, and exercise 29's alternate offside clearance.
- Replay suite: 43/43 passed, including every recorded action in all 36 examples, current AI/engine fingerprints, stale-record rejection, playback controls and attempt isolation.
- Browser preview: exercises 26 and 27 autoplay to a demonstrated successful chance (23% and 17% rounded). Return-to-attempt and Play exercise work. In live exercise 27, the worker plays Rm17–j17 and Pi12–h12 after the first delivery, then returns control. No game-origin browser errors were observed; extension metadata warnings were unrelated.
- `git diff --check` passed.

## Reproduction

```sh
node scripts/audit-exercise-defence.mjs --definitions docs/exercise-defence-depth-2026-10-31/original-definitions.json --output /tmp/original-plans-audit.json
node scripts/audit-exercise-defence.mjs --output /tmp/final-audit.json
node scripts/build-exercise-solutions.mjs
node scripts/version-assets.mjs
node --test tests/exercise-solutions.test.mjs tests/exercises-ui.test.mjs
```

`original-definitions.json` freezes the old diagrams for the defensive-horizon regressions. `original-plans-audit.json` and `final-audit.json` preserve complete action traces and analysis diagnostics. Candidate-route records document the position and screen alternatives examined before choosing these revisions.
