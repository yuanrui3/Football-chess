# Knight goal animation update — 17 October 2026

Live goal flights now follow the resolved engine action path, as goal replays already do. The old presentation inserted the keeper model’s goal-line point as an extra waypoint, visibly bending a knight lob near the net. The resolved final goal file was already correct, including disguised shots; this change corrects the in-flight path.

No game rules, shot odds, goalkeeper tackle probabilities, opening policy, or Tactical engine weights changed. A keeper challenge against a knight succeeds with probability 50% without fouls or 45% with fouls enabled. Evasion leaves the knight in possession and uses the regular defensive move.

Regression coverage includes real engine knight goals, wing lobs, disguised targets, own goals, both teams, rotated boards, reduced motion, replay playback, and supported responsive net widths. Targeted UI/replay checks passed 67/67; broader shot checks passed 175/175. A separate keeper and pawn safety batch passed 67/67.

Production files changed: `dist/app.js` and `dist/index.html` (asset version).

The learning experiment remains separate and unpromoted. Repeated initial AI choices are deterministic behavior; saves remain in each browser profile’s local storage.
