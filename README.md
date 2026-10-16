# Football Chess — eleven a side

A playable custom variation inspired by Football Chess by Serrano Saunders. Original handbook: https://pdfhost.io/v/bWV1pmicf_Football_Chess_Handbook.pdf

## Play

Choose a computer opponent, two players on one device, or **Watch · computer vs computer**. The pitch is **14×17**, with four-file goals **f–i** and **6×3 boxes in files e–j**. Each side has K, Q, R1/R2, B1/B2, N1/N2 and P1/P2/P3. Ivory attacks the upper goal; Obsidian attacks the lower goal. Both teams use the same rules and a formation rotated 180°.

Before kickoff, rearrange your own half and move a teammate onto the kickoff carrier to change the taker. The default Ivory formation is K g2; Q g5; rooks b4/m4; bishops c5/l5; knights d8/j7; pawns f4/h4/j4. The pawns screen immediately in front of the box. Wide rooks initially pass inward to the nearest screening pawn. Clearing that rank opens an eleven-square passing switch, subject to long-pass accuracy. The advanced knight can receive from the queen. The kickoff queen alone moves to g9 (Ivory) or h9 (Obsidian). Goal resets restore this shape.

Watch mode controls both teams, including keeper reactions and restarts. Choose Casual or Tactical independently and an action pace. Pause to inspect; Undo rewinds one computer action and pauses. Reloading restores a saved Watch match paused. Mode, difficulties and pace persist for rematches. Timed games follow the match clock; untimed games offer Finish match.

Every goal opens a replay of its actual build-up, shot and keeper response. Match clocks wait during playback. Pause, step, scrub, restart, or Continue match. Last goal reopens the latest recording without changing the live state or seeded randomness. Full-time goals replay before the report. Replays retain at most twelve frames and only actual goals open one.

Full time opens a report containing shots, shots on target, corners, active-time possession, stable scorer IDs, assists and a chronological goal list. Match stats reopens it. The goal map shows actual scoring origins, with Ivory at the upper end and Obsidian at the lower end. Its custom zones are: box (e–j, nearest three ranks), central approach (e–j, next three ranks), wide close (other files, nearest six ranks), and further out. These game zones are not a scale copy of soccer's penalty area.

An assist is the final accurate completed teammate pass, including a pass into space later collected by the scorer. Dribbling and off-ball moves preserve it. Turnovers, restarts, inaccurate passes, self-passes and earlier shots clear it. Own goals credit the opponent without a personal goal or assist; own-goal-target attempts are excluded from shots. A blocked shot counts once, is not on target, and clears the assist chain. Corner awards count once. Possession excludes pauses, dialogs, replays, kickoff and protected restart preparation. Pass accuracy is not reported as a match statistic.

## Action allowances

An ordinary attacking positioning turn offers **one dribble, one separate off-ball move, and one shared pawn-or-King bonus**, in any order. The defending side then has one regular move or tackle and the same bonus, before the attacker kicks. End positioning forfeits unused allowances. A turnover refreshes them for the new attacker.

The shared bonus moves one off-ball pawn one cardinal square, **or** the off-ball King one adjacent square. It cannot carry or tackle, but may collect a loose ball. Using it for either piece spends the single shared bonus. It remains separate from the King's later shot reaction. The same King may use a regular move and then the bonus if otherwise legal.

Every carrier has only one dribble per attacking positioning turn. Collecting its own previous pass spends that dribble. Collecting a teammate's loose pass can leave it available, except that the King must immediately release a teammate's back-pass. The forced release finishes the original round; collecting a teammate's pass whose round already completed does not charge that round twice.

| Piece | Off-ball movement | Dribble | Passing and shooting |
| --- | --- | --- | --- |
| King | One adjacent square | One adjacent square | Queen-style straight or diagonal rays |
| Queen | Straight or diagonal, up to 10 | Same directions, up to 8 | Straight or diagonal rays |
| Rook | Horizontal or vertical, up to 10 | Same directions, up to 8 | Horizontal or vertical rays; gentler long-shot penalty |
| Bishop | Diagonal, up to 10 | Diagonal, up to 8 | Diagonal rays |
| Knight | One L-shaped jump | One L-shaped jump | One L-shaped lob; standard goal probability |
| Pawn | One cardinal square | One cardinal square | Forward, back, left or right rays |

All outfield pieces may enter **either** box, with or without the ball. The King may leave its own box onto the ordinary field, but **cannot enter the opponent's box**. Ordinary ray movement stops at occupied squares; knights jump. Pieces are never captured. There is no check, castling, en passant or promotion.

Movement, tackling and pass length use Chebyshev distance, max(abs(dx), abs(dy)); an eight-by-eight diagonal counts as eight. Shot geometry uses Euclidean distance to the physical goal plane half a square past the end row. Ray kicks have no ten-square cap. Ordinary passes stop at the first player; knight kicks jump. Passes through ten squares are accurate; beyond ten they lose ten percentage points per extra square, to a 25% minimum.

Queen, rook and bishop tackles reach up to five squares along their normal capture directions. Kings challenge one adjacent square, knights one L jump, and pawns one of four diagonals, including backward. Choose a legal landing beside the carrier; the overall start-to-landing cap is ten squares. The challenger moves there on either outcome. Tackles against knights succeed 50%; other legal tackles succeed 100%. Failed tackles still spend the regular action. The bonus cannot tackle.

## Shooting: model 12

This is an **xG-style custom game heuristic**, not a model fitted to real match data. It combines distance, visible goal angle, keeper position and defenders on the physical shot path. Previews show the mutually exclusive outcomes before rolling. Planning does not consume seeded match randomness.

A shot commits one reachable goal cell. A King in its own box gets a one-square reaction or hold. Outside its box it has no saving reach, catches, parries or special reaction; Resolve shot is the only reaction-phase action. Its occupied square is then an ordinary potential blocker. Re-entering its own box in ordinary positioning restores keeper abilities.

For shooter S and target T on y=-0.5 or 16.5, L is Euclidean length and u the unit direction. The physical post edges are x=4.5 and 8.5. Project the keeper onto the finite segment: q=clamp(dot(K−S,u),0,L). Clearance c is the keeper's distance to that closest point; available flight time is q/6. A keeper behind the shooter cannot make a reach-based save.

- Relative opening ratio r is the visible angle between the posts divided by the opening for a central shooter at the same goal depth, clamped to [0,1]. Tight-angle factor is **0.10 + 0.90 × r^1.5**, a stronger penalty than the preceding release.
- For visible opening a in degrees, t=clamp((a−45)/45,0,1). Wide-opening factor is 1+0.25×t²×(3−2t), reaching +25% raw accuracy at 90°.
- Shooting from **g or h** multiplies raw accuracy by 1.15. The target file alone grants no reward.
- Raw on-target chance is clamp(0.98×exp(−0.018L−k×max(0,L−3)²)×(0.65+0.35×abs(u.y))×tightAngleFactor×wideOpeningFactor×centralFileFactor,0.01,0.98). k=0.03 for rooks, 0.06 otherwise.
- In-box keeper reach is 0.40+1.30×max(0,q/6−0.15). Readiness is 0.94×(1−exp(−(0.35+q/6)/0.45)). Conditional save chance is readiness×exp(−(c/reach)²).
- Each opponent square whose **interior** the physical shot segment crosses contributes an independent **45% block risk**: B=1−0.55^n. A zero-length touch at a square corner does not count. The own-box keeper uses saving mechanics instead of this body test. Friendly bodies still forbid ordinary shots. Knight lobs bypass intervening bodies.
- Ordinary goal chance is (1−B)×rawOnTarget×(1−conditionalSave). Keeper saves and wide shots are also multiplied by 1−B.
- Knights use the same distance, angle and keeper scoring model with **no scoring multiplier**. Their kicking range remains one L-shaped jump and intervening bodies are bypassed.
- A block yields **85% out for a corner, 15% possession for the first defender**. Last-touch rules still apply: a shooting-side deflection out at its own goal gives its opponent a goal kick.
- Keeper saves split into catches and parries. Arrival pace proxy is 6×exp(−0.08q); stretch is clamp(c/reach,0,1). Parry chance given a save is clamp(0.05+0.60×(arrivalPace/6)²+0.25×stretch,0.05,0.90). Close, fast arrivals and stretched stops spill more often. All shots share the same launch power.

The outcome draw partitions goal, keeper parry, keeper catch, wide, defender deflection out, and defender possession. Keeper save probability excludes body blocks. Total corner probability combines keeper parries and actual block corners; it is not subtracted from keeper saves when calculating catches. Long wide-shot scatter uses additional seeded draws for landing. Pending shots retain shooter identity and original position while the keeper moves.

## Offside

At each teammate kick, flag attackers in the opponents' half strictly nearer the goal line than **both the ball and the second-last opponent**. All opponents count; the King need not be last. Level with the ball/defender or on the halfway row (y=8) is onside. A player behind the dribbler is not flagged merely for being beyond the defenders.

Every offside attacking outfield piece inside the opponents' box counts as involved immediately at a teammate's kick, even when the ball is aimed elsewhere. The kicker is excluded. This custom grid rule prevents offside attackers occupying keeper reaction squares. Own-box defenders are unaffected. Other flagged players are penalized when receiving, collecting or challenging for that ball; returning onside later does not erase the snapshot. A save preserves it; controlled opponent play clears it. Direct receipt from a goal kick, corner or throw is exempt, including automatic box involvement. Offside free kicks are indirect.

## Restarts and progress

Goal kicks, corners, throws and indirect free kicks all have protected attacking positioning, defending positioning, then the restart. Each side has one off-ball move and one shared pawn-or-King bonus. The taker is locked; no extra dribble or tackle occurs before the restart. Goal kicks always belong to the King at a vacant own-box square, then require a pass. Other restart takers are the nearest eligible teammate by Euclidean distance, stable ID ties, at the nearest vacant legal square. Nobody is displaced.

Goal-kick, corner and free-kick passes may loft over one intervening player of either side. The first remains a ground-pass target; the second occupied square can receive/intercept but cannot be bypassed. Normal piece kicking patterns, accuracy and offside still apply. LOFT marks targets beyond the bypassed player. Throws and ordinary passes keep normal interception; shooting uses the separate model above.

All pieces throw along eight straight/diagonal rays, stopping at the first player. Throws cannot score or exceed ten squares. Accuracy is 100% through five squares, then 85%, 70%, 55%, 40%, 25% at six through ten. Inaccurate passes longer than ten squares and inaccurate throws scatter without clamping to the board. Long wide shots sample an extended landing. The first boundary crossed decides: touchline → opposing throw; endline after attacker touch → defending goal kick; endline after defender touch → attacking corner.

Stalling applies only in the possessing side's **own half**: Ivory y>8, Obsidian y<8. Within three completed ordinary rounds, advance at least four net rows toward goal, shoot at the opponent's goal, or finish a round at midfield/beyond. A round includes both positioning turns and the kick. Sideways circulation and forward/backward loops do not reset it. At the deadline the opponent's nearest eligible player takes an indirect free kick near the ball, with protected resettling. Kickoffs and protected restarts do not consume the window. A turnover or restart clears it. Entering the opponent's half and passing back within the same round does not clear an existing window.

## Computers and clocks

Casual ranks legal moves using safe progress, collectable passing lanes, tackle risk, shooting chances and keeper position. A shot worth at least 45% after the best legal keeper reaction takes priority over a positional pass. Lower-probability shots compete normally. Tactical searches actual phase transitions with iterative deepening, full rule-state transpositions, alpha-beta decision pruning and expected values for uncertain outcomes. It extends pending shots, forced releases, loose collections and imminent challenges. Default budget is 1,400 expanded nodes, up to eight iterative depths and three horizon actions; root shortlists retain nine candidates. Only the last completed iteration selects the action. Both policies follow identical rules and do not inspect future randomness. Selective search is not a solved strategy or Elo guarantee.

Tactical runs in a module worker to keep controls responsive. Stale results are discarded; unsupported workers use the bounded main-thread policy, and a worker timeout falls back to Casual for that action. Opponent pace is a separate setting (three seconds by default), with visible action paths and team-labelled recaps. Reduced-motion preferences are respected.

Timed matches allow 30 seconds per action for either side, including computer thinking and pace. Selection, settings and rotation do not refresh it. Pause/dialogs freeze clocks. A missed deadline awards an indirect free kick; during keeper reaction it instead holds and resolves the shot. At 00:00 the current decision, pending shot or forced keeper release finishes. A timeout award preserves one final attacking chance through its restart and one live round, ending on shot, possession loss or completed round. Further overtime timeouts use automatic legal actions. Undo and saves retain these states. Untimed matches have no action deadline.

## Saving and source checks

The expanded pitch starts a fresh match under browser save key **football-chess-match-v4**. It retains preferences from earlier saves, while older matches remain untouched. A 12×15 board, old replay or old stats map is not reinterpreted on the 14×17 pitch. Current saves include explicit dimensions; replay and statistics schemas are version 2. Current-board rule normalization is pure, preserves randomness, and repairs an invalid opponent-box King to the nearest vacant ordinary square without displacement.

There are no runtime or build dependencies. Run `npm test` with Node.js. `dist/engine.js` owns transitions and AI; `app.js` controls the UI; `match-clock.js`, `goal-replay.js` and `match-stats.js` are pure supporting modules. Tests cover actual seeded outcomes, mirrored geometry, action budgets, offside, restarts, saving, replays, stats and both policies. Before publishing run `node scripts/version-assets.mjs` to synchronize content versions in HTML, engine consumers and the worker. Browser QA requires the supported browser skill; DOM interaction tests do not substitute for a visual browser check.

Run `npm run simulate -- --seeds=16 --actions=480 --out=simulation-results` for paired kickoff selfplay. Add `--difficulty=tactical`, or use `--rounds=40 --actions=1000` to study round-capped matches. Policy and shared-rule modules may be supplied using `--white`, `--black`, `--rules`. The harness records shots, post-reaction goal odds, body blocks, corners, possession chains, progress fouls and piece roles. Fixed-action runs are not timed full matches.

## Current rule trial: 16 October 2026

The 14×17 / 6×3 / probabilistic-block study used eight Casual seeds (84100–84107), both kickoffs, and 480 actions per run. All four variants shared the new geometry, formation, bonus action and shot model; only box access and the Knight multiplier varied.

| Variant | Box access | Knight multiplier | Goals / 16 runs | Shots | Maximum total score |
| --- | --- | ---: | ---: | ---: | ---: |
| A | Knights only, plus own King | 1× | 33 | 128 | 4 |
| **B — selected** | **All outfield pieces, plus own King** | **1×** | **25** | **122** | **4** |
| C — rejected doubled-knight trial | All outfield pieces, plus own King | 2× | 39 | 104 | 4 |
| D | Knights only, plus own King | 2× | 36 | 115 | 3 |

All 30,720 Casual actions replayed exactly. **B is selected after the user removed the Knight multiplier.** Its 16 runs produced 25 goals (1.56 per run), with 20 inside the custom box, four in the central approach and one wide close. Knights scored 11, Queens nine, Bishops four and a Rook one. The maximum total score was four and the longest corner chain was three. All 122 attempts targeted the opponent's goal.

The rejected C trial produced 39 goals from 104 shots; Knights supplied 24 goals, with seven certain finishes even after the best legal keeper move. Twenty-five goals originated on the end row. The scoring boost was removed at the user’s request. No C shot exceeded six physical squares; B attempted one longer shot.

A stronger-policy screen ran four Tactical selfplay games per A/B/C, capped at 480 actions: A scored zero from one opponent-goal attempt, B zero from two, and C two from three. B and C also each made two own-goal-directed attempts, excluded from those attacking totals. This screen used the frozen trial rules before the final teammate-shot back-pass correction. Low shooting frequency remains a Tactical pace limitation. These fixed-action samples do not establish calibration to soccer or a general AI strength guarantee.

The final policy recognizes the shared King bonus as a loose-ball collection route. A teammate's own-goal-directed shot caught by its King also requires the same immediate release as another teammate back-pass; calling it a shot cannot let the King hold the ball. Self-shot catches keep their existing rule. The final selected-rule smoke, compact protocols and exact-replay audits are retained in [rule-trial data](docs/rule-trial-2026-10-16/). The earlier four-run doubled-Knight smoke remains historical and is labelled separately.

Earlier 12×15 scorer, assist, Tactical and goal-origin studies are retained separately in [historical evaluation](docs/historical-evaluation.md), labelled with their frozen rules. Their outcomes are not predictions for this release.
