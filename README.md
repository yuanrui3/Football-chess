# Football Chess — eleven a side

This checkout uses the complete **Sites web beta 76** as its starting point, plus shared Android/iOS packaging and mobile presentation changes on the `mobile/capacitor` branch. The imported Sites source commit is `6a2105cf22b21c7d4d9fa7263c82ac230fbccf42`; the earlier GitHub `main` branch is not the source of this beta. Web beta 76 and the native app's initial version 1.0 are separate version numbers.

Current engine: **rules version 22** and **shooting model 19**.

For native development, start with [MOBILE.md](MOBILE.md). For free testing on a personal iPhone using a Mac, see [IOS-IPHONE-TESTING.md](IOS-IPHONE-TESTING.md). Current validation and device limits are recorded in [MOBILE-STATUS.md](MOBILE-STATUS.md).

A playable custom variation inspired by Football Chess by Serrano Saunders. Original [Football Chess handbook](https://pdfhost.io/v/bWV1pmicf_Football_Chess_Handbook.pdf).

## Current beta features

- **Play, watch and coach:** human vs computer, two players on one device, computer vs computer, and optional Tactical/Casual assistance for human-controlled teams. Take over at the next decision or ask the bot to play one action and pause.
- **42 practice exercises:** 14 Easy, 14 Medium and 14 Tough studies, including six midfield switching/possession studies, deeper defensive replies, hints, playable solutions, Retry and Undo.
- **Adam commentary:** bundled British whole-sentence recordings cover tactical observations and match reactions. Match playback needs no speech generation or model download.
- **Updated goalkeeper play:** close-range rushing trades better smothering coverage for worse handling; clean catches offer quick distribution or holding to organise; current ratings better reflect cumulative shot stopping.
- **Match review:** optional current-round analysis, full-time player ratings, outfield heatmaps, goal replays, and portable full-match recordings with post-match analysis.
- **One game for web, Android and iOS:** `dist/` is the shared source bundled by Capacitor 8.6.0. Both native cloud build jobs have passed; real-device testing remains a separate check.

## Play

[Play the current web beta](https://football-chess-pitch.frogfromyangzhou.chatgpt.site)

Choose a computer opponent, two players on one device, or **Watch · computer vs computer**. The pitch is **14×17**, with four-file goals **f–i** and **6×3 boxes in files e–j**. Each side has K, Q, R1/R2, B1/B2, N1/N2 and P1/P2/P3. Ivory attacks the upper goal; Obsidian attacks the lower goal. Both teams use the same rules and a formation rotated 180°.

Before kickoff, each team can independently choose Aggressive, Neutral or Defensive starting positions, then rearrange its own half and move a teammate onto the kickoff carrier to change the taker. Neutral is the default. Its Ivory formation is K g2; Q g5; rooks b4/m4; bishops c5/l5; knights d8/j7; pawns f4/h4/j4. The pawns screen immediately in front of the box. Wide rooks initially pass inward to the nearest screening pawn. Clearing that rank opens an eleven-square passing switch, subject to long-pass accuracy. The advanced knight can receive from the queen. The kickoff queen alone moves to g9 (Ivory) or h9 (Obsidian). Goals restore surviving players to their team's selected preset, rather than restoring manual pre-match edits. Formation names change starting coordinates only; they do not alter piece abilities, shot odds or AI difficulty. See [the formation reference](docs/formation-presets-study.md).

Watch mode controls both teams, including keeper reactions and restarts. Choose Casual or Tactical independently and an action pace. Pause to inspect; Undo rewinds one computer action and pauses. Reloading restores a saved Watch match paused. Mode, difficulties and pace persist for rematches. Timed games follow the match clock; untimed games offer Finish match.

After the keeper resolves a shot, the ball animates along its actual path before the board resets or a goal replay opens. Goals, catches, blocks, parries and wide shots have distinct endpoints. Match/action clocks, AI and board input wait during the 0.9–1.35 second flight; Pause, dialogs, Rotate, Undo and new matches are handled safely. Reduced-motion mode uses a brief static impact cue. The resolved state is saved before flight, so reloading cannot reroll it. Every goal then opens a replay of its actual build-up, shot and keeper response. Match clocks wait during playback. Pause, step, scrub, restart, or Continue match. Last goal reopens the latest recording without changing the live state or seeded randomness. Full-time goals replay before the report. Replays retain at most twelve frames and only actual goals open one.

Full time opens a report containing shots, shots on target, corners, active-time possession, stable scorer IDs, assists and a chronological goal list. Match stats reopens it. The goal map shows actual scoring origins, with Ivory at the upper end and Obsidian at the lower end. Its custom zones are: box (e–j, nearest three ranks), central approach (e–j, next three ranks), wide close (other files, nearest six ranks), and further out. These game zones are not a scale copy of soccer's penalty area.

An assist is the final accurate completed teammate pass, including a pass into space later collected by the scorer. Dribbling and off-ball moves preserve it. Turnovers, restarts, inaccurate passes, self-passes and earlier shots clear it. Own goals credit the opponent without a personal goal or assist; own-goal-target attempts are excluded from shots. A blocked shot counts once, is not on target, and clears the assist chain. Corner awards count once. Possession excludes pauses, dialogs, replays, kickoff and protected restart preparation. Pass accuracy is not reported as a match statistic.

## Coach mode and optional analysis

In **You vs computer**, Coach mode can control the human side. In **Two players**, each side has independent coaching settings. Choose Tactical or Casual, select **Let bot play** for continuous assistance, **Take over** to cancel the next pending decision, or **Bot plays one action** to receive one action followed by a pause for review. A committed shot finishes its presentation before control changes. Normal rules and clocks still apply, and restored coaching matches reopen paused. See [Coach mode details](docs/coach-mode-2026-10-31/README.md).

The optional analysis bar estimates the **current round from Ivory's perspective**, even when the board is rotated. It considers the remaining positioning, defensive reply and kick, completing a compulsory keeper release when necessary. Earlier goals and raw piece totals are excluded. Its heuristic units are neither expected goals nor a calibrated win probability. Analysis runs in the background without consuming match randomness and holds its estimate while a shot result is hidden by the animation.

## Practice exercises

Open **Practice exercises** for 42 positions: **14 Easy, 14 Medium and 14 Tough**, filtered by difficulty and theme. Themes cover one-on-ones, through balls, box entry, defending the finish, switching play and protecting possession. Hints, playable example solutions, Retry and Undo decision support experimentation. Progress is saved separately from the match; a rebuilt study retains older completion as history while allowing the new board to be solved.

Any legal continuation meeting the outcome earns credit. Example moves, pass counts and themes do not gate success. Each study keeps its original three- or four-possession-round limit. Attacking studies allow recovery after losing possession or taking a weak shot while rounds remain. Finishing is judged by the chance created after the best legal keeper reply, so a lucky weak goal does not pass and an unlucky save does not invalidate a strong finish.

The six midfield studies, **37–42**, teach switching play and protecting the ball in crowded areas. A switch needs outfield control in the marked area after **one full clean defensive reply**; protection needs **two consecutive clean replies**. A turnover, restart or leaving the area resets the streak; a lucky knight evasion does not count. No shot is needed.

Study opponents use expanded Tactical search, exact immediate keeper checks and broader defensive replies. The defensive search profile is deeper than normal match play, but remains bounded rather than proving perfect play. Defensive studies evaluate possession recovery or the strongest available immediate finish, including the keeper reaction actually played. Exercises 26 and 27 were revised for the stronger defender; exercise 27's five example actions include a separate screen within the existing round budget. See [exercise studies](docs/exercise-studies.md), [midfield studies](docs/midfield-exercises-2026-10-31/README.md), and [defensive-search update](docs/exercise-defence-depth-2026-10-31/README.md).

## Ratings, heatmaps and match recordings

**Match stats** can be inspected while the live match is paused. Full-time review adds player ratings, outfield heatmaps and the complete recorded analysis.

The full-time report places both teams on interactive ratings lineups. Select a player for its contribution breakdown; ball and boot badges show actual goals and assists. Ratings start at **6.0 out of 10** and assess useful play relative to the piece's abilities. Forward carries, completed forward passes, legal supporting runs, retention under pressure, chance creation, tackles and errors contribute. Repeated routes and idle movement earn no automatic credit. These are transparent game heuristics, rather than calibrated real-football grades.

Goalkeeper grades use cumulative assessed on-target xG prevented, with more credit for positive shot stopping and tempered deductions for difficult goals. Difficulty created by a poor keeper response is removed from that credit. Ordinary coverage deductions are bounded and recoverable within the same decision sequence; routine repositioning does not add positive merit. Keeper attacking movement earns only a fraction of comparable outfield movement credit, while useful distribution retains passing credit. Start a new match for the latest method; valid older ledgers preserve their recorded history. See [the ratings methods and audits](docs/player-ratings.md).

After full time, selecting an **outfield** player also opens its heatmap. It records active time on actual occupied squares, rather than inferring paths between them. The view rotates both teams to attack upward, shows each player's busiest areas and excludes goalkeeper-only time. Older saves show missing or partial occupancy history explicitly. See [heatmap details](docs/player-heatmaps.md).

**Match files** exports a compact `.fcmatch` recording or JSON and opens recordings without replacing the paused live game. Recordings retain observed actions and outcomes, goals, cards and available statistics. Replay supports a timeline, stepping, **1×/2×/4×/8×** playback, goal jumps and goal clips. New exports preserve their recorded statistics, ratings and timed heatmaps; older files reconstruct only supported event totals and label unavailable measurements. Post-match analysis is local and deterministic, grounded in recorded evidence. See [post-match analysis](docs/postmatch-analysis/README.md) and [recording format code](dist/match-archive.js).

## Action allowances

An ordinary attacking positioning turn offers **one dribble, one separate off-ball move, and one shared pawn-or-King bonus**, in any order. The defending side then has one regular move or tackle and the same bonus, before the attacker kicks. End positioning forfeits unused allowances. A turnover refreshes them for the new attacker.

The shared bonus moves one off-ball pawn one cardinal square, **or** the off-ball King one adjacent square. It cannot carry or tackle, but may collect a loose ball. Using it for either piece spends the single shared bonus. It remains separate from the King's later shot reaction. The same King may use a regular move and then the bonus if otherwise legal.

Every carrier has only one dribble per attacking positioning turn. Collecting its own previous pass spends that dribble. Collecting a teammate's loose pass can leave it available, except that the King must immediately release a teammate's back-pass. The forced release finishes the original round; collecting a teammate's pass whose round already completed does not charge that round twice.

| Piece | Off-ball movement | Dribble | Passing and shooting |
| --- | --- | --- | --- |
| King | One adjacent square | One adjacent square | Queen-style straight or diagonal rays |
| Queen | Straight or diagonal, up to 10 points | Same directions, up to 8 points | Straight or diagonal rays |
| Rook | Horizontal or vertical, up to 10 points | Same directions, up to 8 points | Horizontal or vertical rays; gentler long-shot penalty |
| Bishop | Diagonal, up to 10 points | Diagonal, up to 8 points | Diagonal rays |
| Knight | One L-shaped jump | One L-shaped jump | One L-shaped lob; standard goal probability |
| Pawn | One cardinal square | One cardinal square | Forward, back, left or right rays |

All outfield pieces may enter **either** box during an ordinary off-ball move or dribble. They may also receive a teammate's pass there. Ordinary dribbling may enter or cross a box, subject to the eight-point budget and double cost. A pass-and-run still cannot enter a box. The four goal-mouth squares directly in front of each goal—f1–i1 and f17–i17—are reserved for that goal's defending King; no other player may occupy them. The King may leave its own box onto the ordinary field, but **cannot enter the opponent's box**. Ordinary ray movement stops at occupied squares; knights jump. Each entered square in either box costs two movement points; an outside square costs one. The starting square is free. A move entirely inside a box is therefore limited to five squares off the ball or four while dribbling. Mixed routes add both costs; three outside plus two box squares cost seven. Kings, pawns and knights retain their native shorter patterns. Tackles and keeper reactions keep their separate reach rules. Pieces are never captured. There is no check, castling, en passant or promotion.

Choose **Pass & run** before a kick to request an optional run after an accurate pass is controlled by a teammate other than the King. Only the passer may run, without tackling or collecting the ball, and its route cannot enter a box. Running uses the next attacking turn's ordinary off-ball allowance; the receiver still has its separate dribble and the shared pawn-or-King bonus. **Skip run**, or reaching the optional run's action deadline, preserves the ordinary off-ball allowance instead. An inaccurate or intercepted pass grants no run. Passing to the King always requires immediate release and grants no run. An outside player still cannot collect its own loose pass inside a box: use an ordinary dribble to carry the ball in, or receive a teammate's pass. Self-pass collections elsewhere count toward the same player's four-round carrying allowance.

Movement steps, tackling and pass length use Chebyshev distance, max(abs(dx), abs(dy)); an eight-by-eight diagonal has eight steps. Ordinary moves and dribbles additionally apply the double cost inside a box. Shot geometry uses Euclidean distance to the physical goal plane half a square past the end row. Ray kicks have no ten-square cap. Ordinary passes stop at the first player; knight kicks jump. Passes through ten squares are accurate; beyond ten they lose ten percentage points per extra square, to a 25% minimum.

Queen, rook and bishop tackles reach up to five squares along their normal capture directions. Kings challenge one adjacent square, knights one L jump, and pawns one of four diagonals, including backward. Choose a legal landing beside the carrier; the overall start-to-landing cap is ten squares. The challenger moves there on either outcome. With Fouls mode off, tackles against knights succeed 50%; other legal tackles succeed 100%. Failed tackles still spend the regular action. The bonus cannot tackle.

## Shooting: model 19

This is an **xG-style custom game heuristic**, not a model fitted to real match data. The current coefficients and exact outcome calculation are in [`SHOT_MODEL` and the shot model in `dist/engine.js`](dist/engine.js). Geometry, keeper movement, rushing, handling, empty nets and set pieces must be considered together; the dated experiment sections later in this README retain their historical measurements.

An ordinary shot commits one reachable goal cell; an eligible Queen or Knight may instead declare the two-target disguised shot below. A King inside its own box gets one legal reaction step or may hold. Outside its own box it has no saving reach, catches, parries or special reaction; its occupied square can still be an ordinary body blocker. Returning to its box restores keeper abilities.

For a guarded goal:

- Shot distance is Euclidean distance to the physical goal plane half a square beyond the end row. The visible opening between the posts, the shooter's approach and central file, and the piece's distance penalty determine raw accuracy. Rooks lose less accuracy on long shots; knights retain their single L-shaped kicking range and bypass intervening bodies, without a scoring multiplier.
- Keeper saving combines lateral diving reach with preparedness and close-range smothering. A keeper advancing inside its own box can improve coverage when aligned between a nearby shooter and goal. The ordinary conditional save probability is capped at 90%; this is a ceiling, not a flat save rate. The rush benefit fades to zero at six squares and drops away from the shot line; advancing at a poor angle can still be worse. The blue overlay shows reactive diving reach, rather than the entire smothering calculation or a guaranteed save.
- Each opposing body whose square interior is crossed contributes an independent 45% block risk. Corner-only contact does not count. The own-box keeper uses saving mechanics; friendly bodies prohibit ordinary shots. A body block sends the ball out 85% of the time, with the remaining mass awarding the first defender possession, subject to the normal last-touch restart rules.
- Saved-shot mass splits into catches and parries. Fast arrivals, stretching and close-range rushing make a secure catch less likely. This handling adjustment redistributes keeper saves without changing the declared shot's goal probability. Eligible opponent-shot parries split between a live rebound and a corner as described below.

When the defending King is absent or outside its own box, **unguarded-goal attempts use ordinary pass accuracy**: 100% through ten Chebyshev squares, then ten percentage points less per additional square, down to 25%. Outfield defenders and an outside King still block normally. The ordinary finishing curve and direct-free-kick scoring multiplier do not apply to these unguarded shots. See [empty-net regression cases](tests/empty-net-scoring.test.mjs).

Previews partition mutually exclusive outcomes before the roll: goal, catch, parry out, live keeper rebound, wide, defender deflection out and defender possession. Planning does not consume match randomness. Resolution, previews and both AI policies share the model; saved pending shots retain their actual shooter and origin. Own-goal targets remain legal for humans and show an explicit own-goal warning rather than normal scoring advice.

Queens and Knights can optionally declare a **disguised shot** when their native kicking pattern reaches exactly two legal opponent-goal endpoints. Both endpoints are public, but neither is selected before the keeper reacts. Resolution draws the target with equal 50/50 odds, then samples that target's usual shot outcomes. Keeper previews and both AI policies use the mean of the two target models, including the same keeper reply for both; Tactical search enumerates target and outcome branches. This gives uncertainty a practical finishing benefit without changing the underlying shot coefficients, range, friendly-body restrictions or penalties. A normal single-target shot remains available. The resolved action, statistics and replay use the actual selected endpoint; one declaration counts as one attempt.

For a shot parried or blocked out, the aimed goal file selects the corner: f/g gives x=0, h/i gives x=13 on the unrotated pitch. A disguised shot uses the endpoint sampled after the keeper's reaction. Ordinary pass exits and long wide-shot scatter retain the first-boundary-crossing rule.

The rush and handling changes are documented in [keeper rushing](docs/keeper-rush.md), with [rush](tests/keeper-rush.test.mjs) and [handling](tests/keeper-rush-holding.test.mjs) regression tests. Sample rates in those notes describe fixed test positions, not universal keeper save or catch rates.

### Live goalkeeper parries

For eligible saves of an opponent’s shot, **20% of parries remain in play**; 80% go out for a corner. This divides the existing parry probability and leaves goal, catch, wide and defender-block odds unchanged. `keeperReboundProbability` is `saveProbability × parryGivenSave × 0.20`; it is zero for penalties, teammate backward shots and kings outside their own box. Teammate backward-shot catches retain the compulsory keeper release.

A spill lands uniformly on one empty pitch square in the defending six-by-three box or within a two-square margin, excluding all four goal-mouth squares and occupied squares. No automatic possession is awarded. The attacking side begins the normal loose-ball positioning sequence, and only eligible players may collect. The shot’s offside snapshot survives the save. The ball animates through the keeper to its landing, statistics count a save/on-target attempt without a corner, commentary calls the live rebound, and goal replays retain it. Tactical chance search and offline learning enumerate the same public landing distribution.

### Clean catches and distribution

After catching an opponent's shot during live match time, the keeper can **distribute immediately before either side repositions**, or choose **Hold & organise** to keep the normal positioning round and movement allowances. The quick pass uses ordinary kicking, accuracy, interception and offside rules; it does not gain a goal kick's loft or offside exemption. An action timeout chooses holding. A catch after full time does not create another attack. Teammate back-passes still require immediate release and cannot be held. See [catch distribution](docs/keeper-catch-distribution.md).

## Offside

At each teammate kick, flag attackers in the opponents' half strictly nearer the goal line than **both the ball and the second-last opponent**. All opponents count; the King need not be last. Level with the ball/defender or on the halfway row (y=8) is onside. A player behind the dribbler is not flagged merely for being beyond the defenders.

A kicker may chase and collect its own loose kick across the offside line; teammates who were onside at the kick may run beyond it afterward. Loose-ball warnings retain the kick-time snapshot instead of recalculating from later positions. Self-collection still spends the normal movement and dribble allowances, including the existing carrying limit and self-pass box-entry restrictions.

Every offside attacking outfield piece inside the opponents' box counts as involved immediately at a teammate's kick, even when the ball is aimed elsewhere. The kicker is excluded. This custom grid rule prevents offside attackers occupying keeper reaction squares. Own-box defenders are unaffected. Other flagged players are penalized when receiving, collecting or challenging for that ball; returning onside later does not erase the snapshot. A goalkeeper save or reflex shot block preserves it, including a block that leaves the defender holding the ball; subsequent controlled opponent play clears it. Direct receipt from a goal kick, corner or throw is exempt, including automatic box involvement. Offside free kicks are indirect.

## Restarts and progress

Goal kicks, corners, throws and indirect free kicks all have protected attacking positioning, defending positioning, then the restart. Each side has one off-ball move and one shared pawn-or-King bonus. The taker is locked; no extra dribble or tackle occurs before the restart. Goal kicks always belong to the King at a vacant own-box square, then require a pass. For a corner, first choose any active teammate in the **attacking half**: Ivory y<8 or Obsidian y>8; the middle row does not qualify. Choosing a taker places that piece at the nearest free legal square to the corner without using a positioning allowance. Both teams then resettle normally. If nobody is in the attacking half, the nearest teammate takes it automatically. The corner-choice deadline also chooses a legal taker automatically. Throws and free kicks retain nearest-eligible selection by Euclidean distance with stable ID ties. Nobody is displaced.

Goal-kick, corner and free-kick passes may loft over one intervening player of either side. The first remains a ground-pass target; the second occupied square can receive/intercept but cannot be bypassed. Normal piece kicking patterns, accuracy and offside still apply. LOFT marks targets beyond the bypassed player. Throws and ordinary passes keep normal interception; shooting uses the separate model above.

All pieces throw along eight straight/diagonal rays, stopping at the first player. Throws cannot score or exceed ten squares. Accuracy is 100% through five squares, then 85%, 70%, 55%, 40%, 25% at six through ten. Inaccurate passes longer than ten squares and inaccurate throws scatter without clamping to the board. Long wide shots sample an extended landing. The first boundary crossed decides: touchline → opposing throw; endline after attacker touch → defending goal kick; endline after defender touch → attacking corner.

Stalling applies only in the possessing side's **own half**: Ivory y>8, Obsidian y<8. Within three completed ordinary rounds, advance at least four net rows toward goal, shoot at the opponent's goal, or finish a round at midfield/beyond. A round includes both positioning turns and the kick. Sideways circulation and forward/backward loops do not reset it. At the deadline the opponent's nearest eligible player takes an indirect free kick near the ball, with protected resettling. Kickoffs and protected restarts do not consume the window. A turnover or restart clears it. Entering the opponent's half and passing back within the same round does not clear an existing window.

Two additional pace rules apply in **both halves**. During uninterrupted possession, one player may dribble in four completed ordinary attacking rounds; attempting another dribble gives the nearest eligible opponent an **indirect free kick at the pre-move ball location**. Collecting that player's own pass counts as dribbling. Skipping a round or kicking into empty space cannot reset the allowance; a real teammate touch, opponent possession, restart or shot does. Independent off-ball and bonus moves do not spend it, and a compulsory keeper release cannot count the same round twice.

At each completed ordinary attacking round, the game also records the ball square and controlling player's stable ID (the kicker's ID while a pass remains loose). A repeating one-, two- or three-round route reaching the same checkpoint for the **third total occurrence** without a new furthest forward checkpoint gives the nearest opponent an indirect free kick. Only the possessing team's route counts: defensive responses and irrelevant off-ball shuffles cannot make the defender guilty or hide the loop. New forward progress clears loop history; shots, turnovers and restarts also clear it. For example, the same carrier visiting g9→h9→g9→h9→g9 triggers the rule. These are custom possession rules, separate from the own-half progress rule. Both sides resettle before either new free kick. If one is awarded at the final whistle, its attacking chance is completed normally.

## Fouls mode

The setup toggle is enabled for fresh browser matches. It is locked after kickoff and retained for rematches. Existing saves without the flag keep it disabled; the engine API and simulation CLI also default to disabled unless requested.

Every enabled tackle uses one seeded draw: normally 2% straight red, 5% yellow, 3% uncarded foul, 90% clean. The card events are part of the 10% foul probability. Under rules version 21, every foul is a straight red when an outfield tackler has no other outfield teammate on a row strictly between the carrier and goalkeeper (across all files, excluding the tackler), or when a goalkeeper fouls outside its own box. Both checks use the pre-tackle position and the original carrier/contact square, never the selected landing square. These situations still have a 10% foul chance, with all fouls resulting in red. Legal tackle previews and Tactical chance branches use the same decision. Clean ordinary tackles win; clean Knight challenges split evenly between winning and evasion (45% / 45% / 10% overall). A second yellow dismisses the player; an automatic straight red does not add a yellow.

Fouls outside the offender’s own box award a **direct free kick** to the possessing side, with nearest-taker selection and protected resettling. Passes can loft over one player and direct shots are allowed. With the defending King inside its own box, a shot directly from the free kick receives twice the ordinary goal probability, capped at 100%; all non-goal outcome masses scale together. The bonus survives the keeper reaction, disguised target choice, saving/reloading and AI analysis, and ends when the taker passes. Other restarts and open-play shots receive no bonus. Unguarded goals instead use the pass-accuracy rule above, without that multiplier.

Fouls in the offender’s own box award a **penalty**. Both sides resettle and any taker can aim at all four goal targets. With a keeper in its box, the result is fixed at **80% goal / 20% catch**, without body blocks, offside, piece bonuses or a keeper reaction move. At an unguarded goal, the empty-net pass-accuracy rule applies and no outside-box save is possible. The normal shot animation and records still apply; see [penalty and card tests](tests/fouls-cards.test.mjs).

Sent-off pieces leave the active roster and remain dismissed across goals, Undo snapshots and reload. Card history stays tied to stable player IDs. If the King is sent off, the nearest remaining pawn (or nearest other teammate) becomes the replacement King in a vacant own-box square, preserving its original ID and originalType. Subsequent goal kicks and immediate back-pass release use that keeper. Falling below seven players ends the match by forfeit without adding fictitious scored goals. The report shows foul and card totals plus dismissed IDs; the journal records individual foul and card events.

Rules version 15 supplies missing discipline metadata when loading a version-14 board. It does not turn Fouls on during a saved match. AI chance branches include card and foul outcomes; state keys include discipline and replacements. A foul restart awarded near full time receives the same protected final attack as a timeout award.

## Computers and clocks

Casual ranks legal moves using safe progress, collectable passing lanes, tackle risk, shooting chances and keeper position. A shot worth at least 45% after the best legal keeper reaction takes priority over a positional pass. Lower-probability shots compete normally.

Tactical searches actual phase transitions with iterative deepening, full rule-state transpositions, alpha-beta decision pruning and expected values for uncertain outcomes. Its candidate set retains purposeful off-ball runs into the box, and it evaluates onside receiving finishes using the real passing lane, accuracy, keeper reaction and tackle exposure. It values dismissed players and card warnings, and treats an awarded corner as protected possession. The production handcrafted utility and tackle-risk penalties are retained. Tactical uses ordinary passes instead of adding a redundant optional pass-and-run choice; the following off-ball allowance still permits the same legal run. It extends pending shots, forced releases, loose collections and imminent challenges. Default budget remains 1,400 expanded nodes, up to eight iterative depths and three horizon actions; root shortlists retain nine candidates. Only the last completed iteration selects the action. Both policies follow identical rules and do not inspect future randomness. Selective search is not a solved strategy or Elo guarantee.

The archived 17 October tuning candidates were not promoted. One trial scored more total goals against Casual but won fewer scenarios and did not improve early scoring; the current playing policy retains the tested handcrafted baseline. Full results and the possession audit are in the [handcrafted Tactical study](docs/tactical-baseline-2026-10-17/README.md).

Playable Tactical uses handcrafted evaluation with learned weights disabled. The self-play toggle has been removed, and an old saved opt-in cannot reactivate it. Offline code, checkpoints and the [extended self-play results](docs/selfplay-hour-2026-10-16/RESULTS.md) remain archived for reproducibility; no further training is part of this update.

Tactical runs in a module worker to keep controls responsive. Calculation starts during the configured action pause; an early answer waits until that pause ends, while a late answer plays when ready. It sends completed search iterations without moving early. On a worker error or four-second timeout, the controller uses the deepest completed answer for the current decision; a timeout falls back to Casual only when no iteration has finished. Stale, cancelled or paused results are discarded, and unsupported workers use the bounded main-thread policy after the pause. Opponent pace is a separate setting (three seconds by default), with visible action paths and team-labelled recaps. Reduced-motion preferences are respected.

Casual and Tactical also receive a modest, bounded match-management preference adjustment: trailing sides favour progress and pressure slightly more, while leading sides favour cover and retention, with gradual clock-based urgency. This changes preferences rather than move legality, shot probabilities or search budgets. Exercises omit this live-match context. See [match management](docs/match-management.md).

Timed matches allow 30 seconds per action for either side, including computer thinking and pace. Selection, settings and rotation do not refresh it. Pause/dialogs freeze clocks. A missed deadline awards an indirect free kick; during keeper reaction it instead holds and resolves the shot. At 00:00 the current decision, pending shot or forced keeper release finishes. A timeout or foul award preserves one final attacking chance through its restart and one live round, ending on shot, possession loss or completed round. Further overtime timeouts use automatic legal actions. Undo and saves retain these states. Untimed matches have no action deadline.

## Saving and source checks

The expanded pitch starts a fresh match under browser save key **football-chess-match-v4**. It retains preferences from earlier saves, while older matches remain untouched. A 12×15 board, old replay or old stats map is not reinterpreted on the 14×17 pitch. Current saves include explicit dimensions; replay and statistics schemas are version 2. Current-board rule normalization is pure, preserves randomness, and repairs forbidden occupants without displacement, including an opponent-box King or an outfield player in the reserved goal mouth. Historical same-size replays keep their recorded positions.

Pending shots derive the shooting side from the actual shooter and the scoring side from the target goal, including incomplete older saves. Missing or contradictory redundant team metadata must not turn a legitimate P3 goal into an own goal. Saved goal records reconcile the own-goal flag with their stable scorer ID and credited team, preserving genuine own goals and restoring ordinary scorer entries when those identities agree. Both bot policies exclude deliberate shots into their own goal; human own-goal targets remain legal.

The browser game is buildless static JavaScript, HTML, CSS and bundled assets. Native Android and iOS packaging adds the pinned Capacitor dependencies in `package.json` and `pnpm-lock.yaml`; there is no separate web compilation step. Optional Google Fonts styling has local fallback fonts. Bundled Adam match speech is local.

### Developer setup

Use **Node.js 22 or newer** and **pnpm 11.25.0**:

```sh
pnpm install --frozen-lockfile
pnpm run test:mobile
```

`test:mobile` checks the engine, midfield exercises and bundled Adam assets. It is a focused check, not the entire AI/training suite; run `pnpm test` for the full existing suite when needed. Serve `dist/` from an HTTP server to run the browser game.

On this Windows PC, `mobile.cmd` locates the Codex-managed runtime. Equivalent commands work with a system pnpm installation:

```powershell
.\mobile.cmd run mobile:sync:android
.\mobile.cmd run android:open
.\mobile.cmd run android:build
```

Android Studio opens the generated `android/` project. For Mac preparation and personal-iPhone signing steps, use [the iPhone guide](IOS-IPHONE-TESTING.md) and `bash scripts/prepare-ios-mac.sh`; the Swift Package Manager project is `ios/App/App.xcodeproj`. The user selects their Apple Account and development team in Xcode. See [MOBILE.md](MOBILE.md) for platform prerequisites and local runtime details.

Edit **`dist/`**, then sync the native platform before building. Generated copies under `android/app/src/main/assets/public/` and `ios/App/App/public/` are not the source to edit. Browser saves from the hosted site do not automatically transfer into an installed app. Native packaging does not deploy the hosted web beta.

The [first GitHub Actions mobile run](https://github.com/yuanrui3/Football-chess/actions/runs/41364459458) built both the Android debug APK and the unsigned iOS Simulator app successfully. That run passed 82 focused checks on the iOS job. The Simulator artifact cannot be installed on an iPhone; personal-device signing and gameplay validation are separate. See [MOBILE-STATUS.md](MOBILE-STATUS.md) for dated verification and outstanding device checks.

### Source and validation map

- [`dist/engine.js`](dist/engine.js): rule transitions, shot outcomes and match AI.
- [`dist/app.js`](dist/app.js): match interface, coaching, playback and worker coordination.
- [`dist/match-clock.js`](dist/match-clock.js), [`dist/goal-replay.js`](dist/goal-replay.js), [`dist/match-stats.js`](dist/match-stats.js): clocks, goal clips and observed statistics.
- [`dist/exercise-session.js`](dist/exercise-session.js), [`dist/exercise-ai.js`](dist/exercise-ai.js): outcome-based study sessions and expanded study opponents.
- [`dist/player-ratings.js`](dist/player-ratings.js), [`dist/player-heatmaps.js`](dist/player-heatmaps.js): contribution ledgers and timed occupancy.
- [`dist/match-archive.js`](dist/match-archive.js), [`dist/match-analysis.js`](dist/match-analysis.js): portable recordings and evidence-based review.

Before a hosted web publication, run `node scripts/version-assets.mjs` to synchronize content versions in HTML, module consumers and workers. Visual checks should cover the actual browser and native controls; engine tests alone do not establish touch layout, native audio or device lifecycle behavior.

Run `node scripts/simulate.mjs --seeds=16 --actions=480 --out=simulation-results` for paired kickoff selfplay. Add `--difficulty=tactical`, or use `--rounds=40 --actions=1000` to study round-capped matches. Policy and shared-rule modules may be supplied using `--white`, `--black`, `--rules`. The harness records shots, post-reaction goal odds, body blocks, corners, possession chains, progress fouls and piece roles. Fixed-action runs are not timed full matches.

## Historical experiments

The studies below retain their original rules, policies, samples and dates for reproducibility. Their measurements do not describe the current beta under every later change.

### Tactical scoring and possession pace: 16 October 2026

The 16 October update allowed ordinary dribbling into either box with double movement cost, reduced the goalkeeper's potential save ceiling from 94% to 90%, and added four-round same-player carrying and three-occurrence possession-route limits. In two matched Tactical self-play cases at 480 actions, attempts increased from 13 to 18, total post-reaction xG from 2.568 to 4.568, and goals from two to four. Scores were 0–1 / 0–1 before and 2–0 / 1–1 after. All final attempts resolved, and no fouls or penalties inflated those goals. This small fixed-action sample is promising, but does not establish a typical timed-game scoreline or long-term piece balance. Protocols, full records, intermediate rule screens and exact-replay audits are retained in [the pace study](docs/tactical-pace-2026-10-16/).

### Weighted-movement shooting trial

The paired Fouls-OFF study in [weighted accuracy trial data](docs/weighted-accuracy-trial-2026-10-16/) used two independent seeds, both kickoffs and 480 actions per run. All variants used double-cost box movement. Four Tactical runs at the old accuracy / threat weight 650 produced five opponent-goal attempts and one goal; +15% accuracy alone produced three attempts and three goals. The selected +15% accuracy / threat weight 450 produced ten attempts and one goal. Meaningful attempts worth at least 15% rose from three to six versus accuracy alone, while average attempted quality fell. This is a willingness/quality tradeoff, not evidence of stronger play. Casual’s paired four-run screen went from 18 to 23 attempts, with six goals in each. All 9,600 actions replayed exactly. These measurements predate Fouls mode and are separate from its final smoke check.

### Tactical crossplay: 16 October 2026

The [crossplay study](docs/tactical-crossplay-2026-10-16/) compared the previous Tactical policy with the selected updated policy against unchanged Casual, using identical corner-selection rules, Fouls mode, two fixed seeds, both Tactical colours and both kickoff choices. Each variant played eight games capped at 720 atomic actions with the same 1,400-node search allowance. Rows below report Tactical's results against Casual.

| Policy | Wins–draws–losses | Goals for–against | Opponent-goal attempts | Attacking xG |
| --- | --- | --- | --- | --- |
| Previous Tactical | 4–3–1 | 7–3 | 13 | 6.019 |
| Updated Tactical | 7–1–0 | 17–0 | 105 | 15.892 |

On the separate validation seed, the updated policy won all four games, scoring 9–0; the previous policy won two and drew two, scoring 4–2. The updated bot accepts more moderate finishes: its added shot volume raises total attacking xG while reducing average xG per attempt. Actual shooting probabilities and piece abilities are identical for both difficulties. The two-seed, fixed-action sample supports the selected improvement; broader win rates remain uncertain. The study retains the rejected intermediate policy, stopped experimental runs, exact-replay audit, and frozen rules/policy sources.

### Historical box-access trial: 16 October 2026

This study predates weighted box movement and model 13. The 14×17 / 6×3 / probabilistic-block study used eight Casual seeds (84100–84107), both kickoffs, and 480 actions per run. All four variants shared the new geometry, formation, bonus action and shot model; only box access and the Knight multiplier varied.

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

## Optional match commentary

At **Relaxed · 3 seconds**, turn **Match commentary** On. **Adam** provides British commentary through the bundled whole-sentence library: tactical observations and analysis as well as shots, goals, held saves, parries, blocks and misses. No speech model downloads or speech generation requests are made during match playback. Voice provenance and the recording plan are in [Adam commentary](docs/adam-commentary.md).

Tactical calls use observed geometry and recent play: switches, counterattacks, legal support, midfield congestion, pressure and defensive shape. Sustained shape claims need repeated completed rounds and are rechecked before the recording starts; setup labels alone do not establish a tactic. Player comments use observed contributions without inventing ratings or pass accuracy. Team shot totals and rounded possession updates retain exact context in the captions.

A three-second action pace is **not** a sentence cutoff. Every started recording finishes before the next automatic call. Important reactions wait in one priority slot; stale routine calls are dropped, and an obsolete shot announcement can be replaced by its result. Automatic goal replay and full time preserve the current sentence. Explicit mute, pause, manual replay, dialogs and resets stop playback immediately. Captions remain available when audio cannot play.

**Test Adam** gives a short voice check; **Match sample** is available before kickoff or while paused. Switching to Standard or Quick turns commentary off. Returning to Relaxed leaves it off until the player enables it again. Retained speech experiments and their licensed assets remain documented in the repository. The current match interface uses Adam's recorded library.
