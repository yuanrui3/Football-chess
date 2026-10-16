# Football Chess — 11 a side

A playable custom variation inspired by Football Chess by Serrano Saunders.
Original handbook: https://pdfhost.io/v/bWV1pmicf_Football_Chess_Handbook.pdf

## Play

Choose a computer opponent, two players on one device, or **Watch · computer vs computer**. Each team has one king, one queen, two rooks, two bishops, two knights, and three pawns on a 12×15 pitch. Goals occupy files e–h. Arrange your starting half if desired; move a teammate onto the kickoff carrier to change the taker. Click Kick off, then select a highlighted kick destination.

In Watch mode, choose Casual or Tactical independently for Ivory and Obsidian, choose an action pace, then click **Start watching**. Both teams take every action automatically, including keeper reactions and restarts. You may arrange either side before starting. Once play begins, the board is read-only; Pause/Resume, Rotate, the match journal, and team-labelled action recaps let you follow the game. Undo rewinds one computer action and pauses. Reloading restores the match paused, with both difficulty settings and pace retained. New matches and rematches retain the selected mode and settings. Timed games use the normal full-time rules; untimed games have a Finish match control.

Goals automatically open a replay of the recorded build-up, shot, and actual keeper response. The match and its clocks wait while the replay plays, then continue automatically. Pause, step, scrub, or restart the replay to keep it open for inspection; Continue match closes it. **Last goal** opens the latest saved goal again without changing the live position or random state. A goal at full time replays before the result appears. Replays use recorded positions rather than the reset kickoff formation, retain at most twelve frames, and persist with the match. New matches clear the replay; Undo clears it when rewinding across that goal.

Full time opens a match report with shots, shots on target, corners, possession, goal scorers, assist providers, and a chronological goal list. **Match stats** reopens it after closing. Stable board labels identify Q, K, R1/R2, B1/B2, N1/N2 and P1/P2/P3. Possession measures active play time credited to the team controlling the ball, including its loose passes and shots in flight; pauses, dialogs, replays, kickoff and protected restart preparation are excluded. Untimed matches track the same possession time. Pass accuracy is not a match statistic.

The report also maps the exact square of every recorded scoring shot. Markers use actual pitch coordinates: Ivory attacks the upper goal and Obsidian the lower goal. Selecting a marker shows its scorer, time, original square and physical shot distance. Repeated origins share a count marker. The four location groups use this custom board: inside the restricted keeper box (goal files e–h, first two ranks), central approach (e–h, next three ranks), wide close (other files, first five ranks), and further out. Missing historical origins remain unknown rather than being inferred from kickoff positions.

An assist is the final accurate completed teammate pass to the scorer, including a pass into space subsequently collected by that teammate. Dribbling and off-ball moves preserve it; turnovers, restarts, inaccurate passes, self passes, and a previous shot clear it. Own goals list the responsible piece and credit the opponent, with no personal goal or assist; own-goal-target attempts are excluded from shots and shots on target. Statistics and the pending assist are saved with the match and Undo snapshots. Matches saved before statistics existed show a partial-record notice rather than invent earlier events.

The default formation uses a box screen, wide rooks, opposite-colour bishops, and an advanced knight. White starts K f2, Q f5, R b4/k4, B c5/j5, N d7/i6, and P e3/g3/i3; Black is the exact 180° rotation. The kickoff queen alone moves to f8 or g8. King f2 covers the f3 gap, bishop j5 covers h3, and pawn i3 guards the wide approach. Both rooks have a clear nine-square crossfield link. The queen can feed knight d7 from f5; moving knight i6 opens bishop j5's forward crossing lane. The shape is used for new matches and goal resets, while saved or custom positions stay intact.

An ordinary attacking positioning turn provides one carrier dribble, one separate move by a player without the ball, and an optional one-square pawn action, in any order. The defender then has one regular move or tackle plus a free pawn action, before the attacker kicks. The controls show each allowance independently; End positioning forfeits unused actions. Knights jump while dribbling. Tackles against a knight succeed 50% of the time; other legal tackles remain certain. The challenger moves to the selected adjacent square on either outcome. A failed attempt leaves the knight in possession and uses the challenger’s regular move while preserving any unused free pawn action. Pieces are never captured.

A shot commits a specific goal cell. A defending king inside its own box gets one extra one-square reaction move or a hold. Continuous goal odds then use shooting distance and angle, the keeper's shortest distance to the finite shot path, and the flight time available for reaching that path. A longer shot allows a larger saving reach. The king may leave its own box onto the ordinary field during positioning, retaining ordinary king movement, tackling, and queen-style kicking. It cannot enter the opponent’s box; only knights may enter both boxes. Outside its own box it has no special saving reach, catches, parries, or extra shot reaction; its occupied square can intercept a ray exactly like an ordinary piece. Only ordinary re-entry restores goalkeeper abilities. The shot-resolution phase remains available outside the box, with Resolve shot as its sole action.

The model separates goals, stopped shots, and wide shots. A caught save gives the keeper normal possession. A stopped shot may instead be parried out for a corner, with a greater conditional chance for a fast close arrival or stretched stop. Wide shots and inaccurate long passes may cross a touchline or end line and award a restart. A goal resets formation and gives kickoff to the conceding side. Goal and keeper-move previews show outcome probabilities and a coverage overlay before the outcome is rolled.

### Transparent shot heuristic

This is a tunable game model, not an xG model fitted to real match data. Distances and times are abstract game units.

For origin S and target T on the physical goal plane (y=-0.5 or 14.5), let L be their Euclidean distance and u the normalized shot direction. Project the keeper K onto the finite segment: q=clamp(dot(K-S,u),0,L). Clearance c is the distance from K to that closest point, and available flight time t=q/6. A keeper behind the shooter has zero saving probability.

- Goal opening: the angle between rays from the shooter to the physical post edges x=3.5 and x=7.5. Divide it by the opening for a central shooter at the same perpendicular depth, clamp the ratio to [0,1], and use postAngleFactor = 0.25 + 0.75 × ratio.
- Wide-opening accuracy bonus: let t = clamp((goal opening in degrees − 45) / 45, 0, 1); wideAngleFactor = 1 + 0.25 × t² × (3 − 2t). Openings at or below 45° receive no bonus, and openings of 90° or more receive the maximum +25% raw accuracy before the usual 98% cap. This uses the actual angle between the posts, so distant central shots do not gain a flat bonus.
- On-target chance: clamp(0.98 × exp(-0.018L - k × max(0, L - 3)²) × (0.65 + 0.35 × abs(u.y)) × postAngleFactor × wideAngleFactor, 0.01, 0.98), where k=0.03 for a rook and 0.06 for other shooters.
- Reach: bodyRadius + diveSpeed × max(0, t - reactionDelay).
- Readiness: maxSave × (1 - exp(-(0.35 + t) / 0.45)).
- Save chance conditional on an on-target shot: readiness × exp(-(c / reach)²).
- Base goal chance: onTarget × (1 - conditionalSave). Base save chance: onTarget × conditionalSave. Base wide chance: 1 - onTarget.
- Every shooter shares the angle and keeper model. Rooks lose distance accuracy more slowly beyond three squares; knights receive no scoring multiplier and retain their one-L-shaped kicking pattern.
- Handling pace proxy: arrivalSpeed = ballSpeed × exp(-0.08q). All shots currently share launch power; this is a distance-based handling estimate, not an independently simulated physical velocity or user-selected power. The existing flight-time/reach calculation is unchanged.
- Keeper stretch: clamp(c / reach, 0, 1), or zero without a keeper or positive reach. Conditional parry chance after a stop: clamp(0.05 + 0.60 × (arrivalSpeed / ballSpeed)² + 0.25 × stretch, 0.05, 0.90). It is zero when stopped-shot probability is zero.
- At every shooting distance, cornerProbability = finalSave × parryGivenSave and caughtSaveProbability = finalSave - cornerProbability. Faster arrivals and stretched stops are harder to hold. Corner probability is a subset of stopped shots, not an additional probability on top of saveProbability. Goal, stopped-shot, and wide probability masses stay unchanged. The live roll partitions goal, parry for corner, catch, then wide; the catch/parry split uses the same outcome draw.

| Keeper starts in | Body radius | Dive speed | Reaction delay | Maximum save readiness |
| --- | ---: | ---: | ---: | ---: |
| Own box | 0.40 | 1.30 | 0.15 | 0.94 |
| Outside own box | 0 | 0 | 0 | 0 |

One seeded uniform draw resolves the mutually exclusive shot outcomes; a long wide shot then uses seeded draws for its landing. AI planning and previews do not consume match randomness. The pending shot retains its original shooter position while the keeper reacts.

Shot model version 10 retains the relative goal-opening penalty and the rook’s gentler long-shot distance curve, and adds a smooth accuracy bonus for larger visible goal openings. Shots beside the posts lose accuracy as the visible goal narrows; shots with a wider opening gain accuracy before the existing cap. Goalkeeper abilities remain restricted to the king’s own box and knights have no scoring multiplier. Goal-line odds appear only for shots the carrier’s kicking pattern and clear path can reach; other cells show an em dash. Positioning previews remain disabled until the kicking phase, and only the committed target shows odds during a keeper reaction. Saved declared shots retain their shooter and origin while normalization refreshes their odds under the current model without consuming randomness.

Checked examples with the best legal keeper reaction and a clear path: a queen on d15 aiming at the upper E goal against a keeper on h15 now scores with about 34.2% probability (previously 77.5%). A rook on e8 aiming at E against a keeper on g15 now has about 16.0% (previously 8.9%); a queen in that same midfield geometry has about 8.7%. These are game-model probabilities for those exact positions, not empirical football estimates.

The choice of distance, angle and keeper alignment as factors is informed by [goalkeeper positioning research](https://pmc.ncbi.nlm.nih.gov/articles/PMC5800537/) and [Hudl's explanation of expected goals](https://support.hudl.com/s/article/expected-goals?language=en_US&topic=Statsbomb_Global_Football_Data_Glossary); the formula and coefficients above are custom balancing choices.

## Moving, dribbling, and kicking

These are distinct actions. Moving a piece does not automatically pass the ball, and a kick does not move the kicker. Movement, tackle reach, and pass length use Chebyshev distance, max(abs(dx), abs(dy)); an eight-by-eight diagonal counts as eight squares. Shot accuracy and keeper-path geometry use Euclidean distance to the physical goal plane half a square beyond the end row.

| Action | What moves | When available | Cost |
| --- | --- | --- | --- |
| Move without the ball | The selected piece; the ball stays where it is. Landing on a loose ball collects it. | Your team's positioning turn | The off-ball/regular allowance, or the free pawn action for a pawn |
| Dribble | The ball carrier and ball move together. | Ordinary attacking positioning with possession | The single independent dribble allowance, including for a pawn |
| Pass or shoot | The ball travels; the kicker stays in place. | Kickoff, the attacking kick phase, or a required goalkeeper release | The kick action |
| Tackle | A challenger moves to a highlighted square beside the opposing carrier and attempts to take possession. | Your team's positioning turn | One regular move; never the free pawn action |

### Piece reference

Off-ball movement and dribbling use each piece's directions, with a separate eight-square dribble cap. Queen, rook, and bishop off-ball moves still reach ten squares. Kings, pawns, and knights retain their shorter patterns. Passing and shooting use the separate kick pattern and range below.

| Piece | Move without ball | Dribble | Pass / shoot |
| --- | --- | --- | --- |
| King (goalkeeper) | One square horizontally, vertically, or diagonally | One square horizontally, vertically, or diagonally | Any distance horizontally, vertically, or diagonally |
| Queen | Up to 10 squares horizontally, vertically, or diagonally | Up to 8 squares horizontally, vertically, or diagonally | Any distance horizontally, vertically, or diagonally |
| Rook | Up to 10 squares horizontally or vertically | Up to 8 squares horizontally or vertically | Any distance horizontally or vertically |
| Bishop | Up to 10 squares diagonally | Up to 8 squares diagonally | Any distance diagonally |
| Knight | One L-shaped jump: two squares on one axis and one on the other | One L-shaped jump | One L-shaped jump |
| Pawn | One square forward, backward, left, or right | One square forward, backward, left, or right | Any distance forward, backward, left, or right |

Ordinary movement and dribbling require a clear path and an empty destination. A goal-box square forbidden to the moving piece stops its movement ray: queens, rooks and bishops cannot cross an empty box to reach its far side. Knight jumps retain their existing box access. Sliding tackle rays and AI collection routes likewise cannot cross intervening forbidden box squares. Knights jump over intervening pieces, including while dribbling. Ordinary kicks stop at the first piece: a teammate receives the ball, an opponent intercepts it, and an empty destination leaves a loose ball. Knight kicks jump over intervening pieces. A shot uses the piece's kick pattern to reach one of the four goal targets; other pieces block its path, while an opposing king inside its own box instead gets a reaction before the shot resolves.

A knight scores when its one L-shaped kick ends in a goal cell. It may occupy either goal box, opening central finishing positions as well as side approaches: d14→upper E and f14→upper E are examples. Knight shots jump over blockers, then face the usual keeper reaction and normal distance/angle accuracy, with no scoring multiplier.

Only kings and knights may occupy either four-column, two-row goal area. Pawns tackle one square on any of the four diagonals, forward or backward. Their ordinary movement and dribbling remain one cardinal square. Tackles against a knight succeed 50% of the time, including inside a box; other legal tackles succeed automatically. No piece is captured.

Queen, rook, and bishop tackle reach is capped at five squares to the opposing carrier, along their normal capture directions and a clear path. King reach is one adjacent square, pawn reach is one square diagonally forward or backward, and knight reach is one L-shaped jump. After the challenge, choose an allowed adjacent landing square; the overall ten-square start-to-landing limit remains. A carrier five squares away can therefore have an adjacent landing six squares from the defender. Off-ball moves have a ten-square cap, dribbles an eight-square cap, and passing uses its separate distance/accuracy rules. Both AI policies use this shared tackle rule.

### Turn order and exceptions

After kickoff, an ordinary round is **attacking positioning → defending positioning → attacking kick**. The attack has three independent allowances: one dribble by the carrier, one move by another player without the ball, and one optional free one-square move by a pawn without the ball. They may be taken in any order, and each may be used once. Every carrier, including a pawn, has only one dribble per attacking positioning turn; neither off-ball allowance can carry an already-held ball. Collecting your own previous pass consumes the dribble allowance alongside the normal or free-pawn action used to collect it; collecting another player's loose ball can leave the unused dribble available. The defence has one regular move or tackle plus one free pawn action. End positioning forfeits any actions remaining for that team. Automatic advance waits until all available allowances are spent; a blocked or absent carrier does not prevent advancement. A turnover starts a fresh attacking positioning turn with all allowances reset; if the ball is still loose after both positioning turns, a new positioning round begins without a kick.

- The free pawn action repositions a pawn that starts without the ball. It may collect a loose ball, but cannot dribble, tackle, or kick. It is available in each ordinary positioning turn, not during the special keeper reaction.
- A teammate's back-pass to the king requires an immediate kick with no positioning or dribbling first. A king receiving an opponent's pass or saving a shot may hold normally.
- A shot pauses play for the defending king's one-square reaction or hold when it starts inside its own box; an outside king only resolves the shot and cannot move or save. This does not grant a regular positioning turn or free pawn action. If the outcome awards a goal kick or corner, a protected restart round lets both teams resettle before the ball is played.
- Ordinary passes through ten squares have 100% accuracy. Each extra square costs ten percentage points, with a floor of 25%. Distances use the maximum coordinate gap. Inaccurate passes sample a landing near the intended target; that landing may be occupied or outside. An occupied landing receives or intercepts the ball, subject to offside. Shots use the continuous model above; the long-pass curve applies to ordinary passes.
- Shots, long passes, and 50% knight tackles use serializable seeded randomness; previews and AI planning do not consume random draws. Undo restores the prior random state.

### Forward progress and stalling

The stalling rule applies only in the possessing team's own half: White at `y > 7`, Black at `y < 7`. The halfway row (`y = 7`) and the opponent's half are exempt. While in the own half, advance the ball at least four net rows toward the opponent's goal within three completed ordinary possession rounds, shoot at the opponent's goal, or finish a round at midfield or beyond. A round includes attacking positioning, defending positioning, and the kick. The actual ball position after the round is compared with the previous progress checkpoint; sideways passes and forward/backward loops cannot satisfy the rule. Reaching four net forward rows resets the checkpoint and the three-round allowance. A forced King back-pass release completes the original round rather than counting a second round or erasing backward travel.

After the third failed round, the opposing team's nearest eligible piece receives an indirect `stalling` free kick at the nearest free legal square to the ball. Selection uses Euclidean distance and stable ID ties; nobody is displaced. The taker is locked while both teams resettle, then must pass, with no direct goal target. Normal offside applies when the indirect kick is played. The foul record retains the action that caused the deadline to expire.

A completed round ending at midfield or in the opponent's half clears the count. Returning to the own half starts a fresh three-round window; the return round does not consume the new allowance. Briefly crossing midfield and passing back during the same round does not erase an existing own-half count. A turnover (including an opponent's save), goal, boundary award, offside award, or stalling award also starts a fresh progress window. Kickoff, protected restart positioning, and the restart kick do not spend the allowance. A shot at the opponent's goal resets it. Shooting at your own goal and catching it does not reset the count. A pass into space still completes a round; a complete positioning cycle with an uncollected loose ball also counts. The live progress panel appears only in the own half and shows signed net progress and rounds remaining, with a warning on the last round.

The shot coefficients, accuracy curve, pawn-kick expansion and goal-box dimensions are explicit playable defaults documented in the in-game rules. The computer considers keeper reactions when choosing shots.

### Offside

At each teammate kick, record attackers strictly inside the opposing half (white y<7, black y>7) and strictly nearer the goal line than both the ball and the second-last opponent. All opposing pieces count; the king need not be last. The halfway row and level positions are onside. An attacking knight inside the opponent's box is automatically involved in play at that kick: if offside, it immediately awards an indirect free kick, even when the ball is aimed elsewhere. The knight taking the kick is excluded. This prevents offside knights occupying useful goalkeeper reaction squares. Defending knights in their own box are unaffected. Other offside-positioned players are penalised on direct receipt, later collection, or a challenge for a saved ball. Moving back onside does not erase the kick-time snapshot. Opponent controlled play, including a keeper deliberately dribbling after a save, clears it; the save itself does not. The discrete game does not simulate visual obstruction or body-part geometry.

There is no offside directly from a goal kick, corner, or throw-in, including automatic box-knight involvement; the next teammate kick creates a normal snapshot. An offside free kick is indirect and has no direct goal targets. The UI distinguishes current positional warnings from players flagged at the last kick and labels a dangerous involvement with `OFF`. The timing, second-last-opponent test, and restart exemptions follow [IFAB Law 11](https://www.theifab.com/laws/latest/offside/); automatic involvement for a knight in the opponent's box is a custom grid-game rule. A saved pending shot from rules before version 10 is adjudicated using its stored kick-time flags before any keeper move or new random draw; missing snapshots are not reconstructed from later positions.

### Boundaries and restart rounds

An inaccurate ordinary pass longer than ten squares samples one of eight compass directions uniformly and an integer spread uniformly from 1 through max(1, ceil((distance - 10)/2) + 1), relative to its intended target. A long wide shot samples horizontal error between ±2×radius and an end-line overshoot from 1 through radius. Landings are not clamped; the first line crossed by the trajectory from the kicker to landing determines the award. Short wide shots retain a normal end-line restart. An inaccurate throw uses radius max(1, ceil((distance - 5)/2)) and can also leave play.

- Touchline: throw-in to the team that did not touch last.
- End line after an attacking last touch: goal kick to the defending team.
- End line after a defending last touch, including a keeper tip: corner to the attacking team.

A goal kick belongs to the defending king, placed at a free square in its own goal box. Like corners and throws, it starts a protected `attackMove` positioning turn, then `defendMove`, then `kick`. The king stays locked at the restart spot while both teams resettle, then must pass into the pitch; there is no dribble or direct goal target. A nearer knight cannot take it. Restart metadata retains the direct-receipt offside exemption. A teammate back-pass to the king still demands an immediate release without positioning.

Goal-kick, corner and free-kick passes (offside, stalling and time-wasting awards) may loft over one intervening player, of either team, following the taker’s normal kicking directions. The first occupied square remains a ground-pass target; targets beyond it are marked LOFT. A second occupied square may receive or intercept the pass, but the ball cannot pass beyond it. Throws and open-play passes retain their normal blocking rules; shots retain their existing blocking and direct-goal restrictions. Knight kicks retain their single L-shaped jump. Lofted passes use the normal distance accuracy, offside, scatter and boundary rules; accuracy still drops beyond ten squares. Both AI levels evaluate the same new passing lanes.

For corners, throws, offside free kicks, and stalling free kicks, the nearest eligible teammate, using Euclidean distance and stable ID tie-breaking, becomes the taker and is placed at the nearest vacant legal square to the restart location. No players are displaced. A corner starts by the nearest corner; a throw-in starts at the touchline exit; an indirect restart uses the offence location. All these restarts, including goal kicks, give the restart team a protected attacking positioning turn, then the opponent a defending positioning turn, then the taker plays. Each team has one off-ball move and a free pawn action and may skip unused actions. The taker is locked in place, there is no extra dribble, and tackles are disabled until the ball is played. These positioning turns and nearest-player selection are custom turn-based adaptations; the boundary award follows [IFAB Laws 15–17](https://www.theifab.com/laws/latest/the-throw-in/).

Every piece throws along the same eight straight/diagonal rays, stopping at the first player. Throws are certain through five squares; accuracy is 85%, 70%, 55%, 40%, and 25% at six through ten squares. No target beyond ten squares and no direct goal is offered. The range curve is a custom game rule, independent of ordinary passing accuracy.

## Features

Timed or untimed matches, pause, undo, rotation, local saving, and adjustable opponent pace (3 seconds by default). Computer actions have move animations, retained paths, and descriptions. Reduced-motion preferences are respected. The shot-model update retains the version 2 save key and active matches. The earlier board expansion used a new save key because the roster and geometry changed; version 1 saves remain untouched and opponent pace is retained when starting the new rules.

Rules version 13 keeps saved matches and undo snapshots through pure `normalizeGame()` migration. Saves from before version 13 receive one fresh own-half progress window so historical field-wide counts cannot cause a stale penalty; current saves and Undo retain their checkpoint and round count. An existing king incorrectly placed in the opponent’s box is moved to the nearest vacant ordinary-field square without displacing another piece or consuming randomness; possession and restart spots follow it when necessary, while a declared shot retains its original path. Equal-distance repair choices use team-relative coordinates so mirrored positions receive mirrored repairs. Loose balls retain the previous kicker's identity through unrelated moves and saves, so self-pass collection spends the dribble correctly. Older saves infer that identity when their latest kick gives clear evidence. Pending knight shots use the current unboosted model without consuming randomness. A saved attacking turn whose latest action used the old free-pawn carrying rule marks its dribble spent when restored. Pending immediate goal kicks return to protected attacking positioning. Existing goal kicks already in positioning or kicking retain their phase and spent allowances; old knight takers are reassigned to the king. A legacy shared normal move that was already spent conservatively marks the separate dribble allowance spent as well; fresh rounds use three explicit fields. `positionActions()` exposes current availability for the controller and AI.

### Action deadlines and full time

Timed matches give each actual action 30 seconds, including computer decisions and their selected pace delay. Only a completed action refreshes the allowance; selection, display updates, settings, rotation, pause, dialogs, reload, and Undo do not grant extra time. Pausing or opening a dialog freezes both clocks. Untimed matches retain unlimited action time and manual finishing; timed matches finish through the match clock, with the manual Finish match action disabled.

A deadline normally awards the other team an indirect `timeout` free kick near the ball, using the same nearest-player selection and protected positioning as other indirect restarts. A deadline during keeper reaction holds the keeper and resolves the committed shot with normal seeded odds instead of cancelling it.

At nominal 00:00 the current decision must settle; a declared shot or mandatory king release finishes first. A timeout award protects one final attacking chance through its indirect restart and a subsequent live attacking round, ending on a resolved shot, lost possession, or completed live round. This protection also applies if the timeout was awarded just before 00:00. Further missed deadlines during the final chance use automatic legal actions, preventing an endless chain of overtime penalties. Saves and Undo preserve the action allowance and final-chance state.

### Computer difficulty

Choose either level in the Computer difficulty control beside the pitch, before or during a match. Watch mode shows separate Ivory and Obsidian controls. The selections are saved without resetting the match; an in-progress computer decision completes at its original level. Existing saves default to Casual. Action pace remains a separate setting shared by both teams in Watch mode.

- **Casual** ranks legal actions using forward progress, possession, tackles, shooting opportunities, pass accuracy, and keeper positioning. Dribbles are judged by their improvement over the current shot and tackle risk, so an available finish is not discarded for an arbitrary move. In the kicking phase, a legal shot with at least 45% scoring probability after the best keeper reaction takes priority over a positional pass. Lower-probability shots still compete with passes through the normal ranking. It checks which onside teammate can actually collect a loose pass, whether collection spends the dribble, and whether the next defender can win the ball. Off-ball support creates compatible passing lanes rather than merely moving forward. Defensive positioning covers likely receiving lanes as well as immediate shots, and the king is encouraged to protect its own box. Forward-location rewards saturate near goal so an end-line run is not automatically better than creating a finish. Sideways and backward circulation becomes less attractive as the three-round progress deadline approaches. It remains a reactive policy without a search through opponent replies.
- **Tactical** uses iterative deepening through the actual phase machine and independent movement allowances. A per-decision transposition table caches complete rule states, including offside, restart, progress deadline, and spent actions. Alpha-beta pruning applies to decision branches; uncertain outcomes are averaged from full-window child searches. A deterministic node allowance bounds the work, and only the last fully completed iteration selects the action. Bounded horizon extensions continue pending kicks, live defensive replies, loose-ball collections, immediate challenges, and forced keeper releases; a declared shot always receives its normal keeper response before evaluation. Position evaluation considers legal passing outlets, central support, defensive cover and the usefulness of a wide attack, alongside score, possession, pressure, progress and shot quality. Candidate ordering and narrow shortlists keep browser work bounded, so search remains selective. Pass/throw scatter is enumerated, while long wide-shot landings retain a bounded symmetric approximation. Both levels understand offside and restart restrictions.

Both levels use the same legal moves, scoring odds, and optimal immediate keeper reaction. Neither reads future match randomness or changes it while planning. Tactical runs in a module Web Worker to keep the controls responsive; cancelling or changing the match discards stale results. Unsupported workers fall back to the same bounded policy on the main thread, and a worker timeout falls back to Casual for that action. Search limits depend on actions and node budgets, not processor speed.

The default Tactical allowance is 1,400 expanded nodes, up to eight iterative action-depths, and three extra horizon actions; a declared keeper reaction is stabilized separately. Root search keeps nine candidates. Completed iterations, cache hits, pruning and the representative principal continuation are available through the pure `analyzeTacticalAction()` diagnostics API. This selective search is not a full-game solution or a trained neural evaluator.

## Source and validation

- `dist/index.html`: interface and custom rules
- `dist/style.css`: responsive pitch and interface
- `dist/app.js`: input, phase controls, clock, AI scheduling, browser persistence
- `dist/match-clock.js`: action deadlines, final decisions, protected final attacks, and clock restoration
- `dist/engine.js`: immutable rules, seeded outcomes, computer decisions
- `dist/ai-worker.js`: background Tactical planning
- `dist/goal-replay.js`: bounded goal recordings and independent playback controls
- `dist/match-stats.js`: pure event recording, assist attribution, active possession time, restoration and report summaries
- `tests/goal-replay.test.mjs`: actual goal geometry, keeper responses, own goals, recording bounds, and stored replay validation
- `tests/engine.test.mjs`: deterministic rule scenarios and extended AI play
- `tests/ai.test.mjs`: both policies, legal play, fair randomness, and tactical scenarios
- `tests/tactical-search.test.mjs`: completed iterations, deterministic budgets, cache parity, cutoff bounds, tactical extensions, principal continuations, and edited-state freshness
- `tests/casual-finishing.test.mjs`: preserving strong finishes, taking shots, safe escapes, restarts, offside and seed independence
- `tests/match-stats.test.mjs`: real shots, corners, goals and assists, exact scoring origins, location groups, stable identities, active possession, save/reload, Undo and partial legacy records
- `tests/tactical-search.test.mjs`: iterative-depth budgets, cache parity, chance values, tactical continuations and edited-state purity
- `tests/casual-finishing.test.mjs`: preserve an available finish, take open goals and escape guaranteed tackles
- `tests/shooting-angle-rook.test.mjs`: post-angle geometry, rook distance accuracy, declared shooter identity, symmetry and restored shots
- `tests/shooting-angle-rook.test.mjs`: mirrored post angles, rook long-shot accuracy, declared shooter identity, saved odds, and probability mass
- `tests/ai-development.test.mjs`: safe collections, real passing support, offside, keeper anchoring, edited snapshots and throw coverage
- `tests/keeper-role.test.mjs`: own-box saving boundaries, ordinary outside king, re-entry and resolution-only shots
- `tests/king-box-boundary.test.mjs`: king opponent-box exclusion, mirrored move and restart boundaries, and deterministic saved-match and Undo repairs
- `tests/offside-knight.test.mjs`: knight upgrades and offside timing, involvement, and exemptions
- `tests/box-offside.test.mjs`: automatic attacking-box knight involvement, mirrored timing and restart exceptions, AI avoidance, and deterministic saved-shot migration
- `tests/boundary.test.mjs`: boundary geometry, restart awards, throw ranges, and seeded scatter
- `tests/set-piece-loft.test.mjs`: one-player restart lofts, pass metadata, blockers, offside, accuracy, and AI use
- `tests/box-crossing.test.mjs`: mirrored goal-box barriers for movement, dribbling, tackles, collection, and AI planning
- `tests/possession.test.mjs`: independent action budgets, all action orders, protected restart positioning, king goal kicks, and saved-match migration
- `tests/dribble-range.test.mjs`: eight-square carrying limit, ten-square off-ball movement, passing ranges, and shorter piece patterns
- `tests/stalling.test.mjs` and `tests/stalling-own-half.test.mjs`: own-half scope, three-round net progress, indirect free-kick awards, round boundaries, resets, saved state, and AI urgency
- `tests/fairness.test.mjs`: self-pass collection costs, pass identity, timeout awards, and equal shot odds
- `tests/action-clock.test.mjs`: deadline accounting, full-time safeguards, final attacking chances, and saved clocks
- `tests/formation.test.mjs`: mirrored starting shape, legal setup, defensive screen, passing links, goal resets, and saved boards

No build or runtime dependencies. Serve `dist/` using a static HTTP server. Run `npm test` with Node.js. Before each deployment, run `node scripts/version-assets.mjs` so the HTML, controller, engine, worker, and stylesheet use matching content versions instead of stale browser caches.

Validation covers continuous shot geometry and deterministic outcome boundaries, movement and possession invariants, both AI levels across every phase and move budget, seed-independent planning, and extended legal play. DOM interaction checks cover saved preferences, independent pace, worker failures, and stale-result cancellation. Short deterministic match benchmarks are smoke checks rather than evidence of a general win rate.

### Reproducible simulations

Run `npm run simulate -- --seeds=16 --actions=240 --out=simulation-results` for matched current-engine selfplay with both kickoff teams. Add `--difficulty=tactical` for Tactical, or `--rounds=40 --actions=1000` to investigate a regulation-round format with an action safety cap. The CLI writes raw per-match JSON and an aggregate report; it does not change the playable match clock. Policy modules for either side and a shared rules module can be supplied with `--white`, `--black`, and `--rules` using absolute file paths.

The harness distinguishes attempted shots from resolved post-reaction goal probability, catches/corners/wide shots, team/space passes, self-pass collections, dribbles, tackle success, stalls, offside, restarts, ordinary rounds and piece roles. Fixed action cutoffs are not timed full matches. Compare policies with paired seeds, both colours and kickoffs, and separate development cases from held-out evaluation; selfplay alone cannot establish balance against every strategy. The playable rules include tight-angle penalties, stronger rook long-shot accuracy, and own-half-only stalling. Match-length alternatives remain experiments. Automatic involvement of offside attacking knights in the opponent's box is implemented.

### AI evaluation, 16 October 2026

Before this update, 64 Casual selfplay games (seeds 49000–49031, both kickoffs, 480 actions each) produced 248 goals and 159 assists. The final accurate teammate pass, including a pass into space followed by collection, receives the assist; dribbling preserves it, while a turnover, restart, scattered pass, self-pass, or previous shot clears it. There were 89 unassisted goals and no own goals.

| Piece | Goals | Assists |
| --- | ---: | ---: |
| Queen | 142 | 20 |
| Knight | 72 | 100 |
| Bishop | 25 | 16 |
| Rook | 7 | 11 |
| Pawn | 2 | 8 |
| King | 0 | 4 |

This distribution describes that policy and starting formation, rather than intrinsic piece values. Knight-to-queen combinations supplied 89 goals.

The selected Tactical upgrade was evaluated against the previous search with identical new shooting rules and Casual ranking utilities. Twenty-four held-out paired games, capped at 240 actions, finished 10 wins, 10 draws and 4 losses for the upgrade: 12–5 goals, 35–16 shots, and 8.651–4.463 summed post-reaction goal probability. Seeds were 82701–82704 with both kickoffs and swapped colours, plus 1974113031, 374918055, 2948123670 and 840537219 with White kickoff and swapped colours. All 5,760 actions replayed exactly from their seeds without a rules-invariant error. Candidate engine SHA-256 was `068c296ee7b49254554130b79e34a4ea52303713a0ce5d4d648ddcaea059fca2`; matched old-search module was `49a064a98a372621776d5803061b0eb354e40046a353953d6d97daed60f32b3b`.

That study preceded the own-half-only stalling change. These fixed-action games are a small, partly correlated sample, rather than regulation matches or an Elo estimate. No new-policy rook shots, shots longer than six physical squares, or long passes occurred in this sample. Stronger rook accuracy therefore establishes a capability change, without evidence that this search uses it more often. A separate 98-position single-process profile measured similar mean decision time (139.7 ms versus 137.2 ms), with the 95th percentile reduced from 616.5 ms to 257.2 ms; this is not a browser performance measurement.

An additional eight games under own-half-only stalling (seeds 315502971 and 2245870031, both kickoffs and swapped colours, 240 actions) finished 1 win, 7 draws and no losses for the upgrade, with 1–0 goals, 8–5 actual declared shots, and 2.239–1.360 summed goal probability. All 1,920 actions replayed exactly; all 1,512 checked opponent-half states correctly disabled stalling, and the sole stalling award occurred in the offender's own half. The upgrade took all eight actual kick-phase opportunities worth at least 25% after the best keeper reaction. This small smoke sample still included long legal attacking-half circulation, so the absence of a deadline there should not be mistaken for an AI guarantee of quick attacks. These fresh matches used the same live transition rules as version 13; the later version-13 migration only changes handling of historical saved counters. An audited simulator bookkeeping correction excludes goal-target kicks cancelled for offside before shot declaration; scores and goal probabilities were unaffected.

For spatial context, [UEFA reports 98 of EURO 2024's 117 goals inside the penalty area](https://www.uefa.com/uefaeuro/history/news/028f-1b5e7399cdaa-e76541a9f816-1000--how-the-117-goals-at-uefa-euro-2024-went-in/). [FIFA reports 83% inside at Club World Cup 2025, versus 92% at World Cup 2022](https://www.fifatrainingcentre.com/en/game/tournaments/fcwc/2025/team-analyses/the-fpi-overview-of-fifa-club-world-cup.php). The game's four-by-two restricted keeper box is not a scale equivalent of a real penalty area; those figures guide the preference for close, central chances rather than a literal target for goals inside the game's box.

Post-update spatial sampling used the frozen version-13 engine `bd15a4aaf810cc6a075876bdda2ec68cbf49f3b67e1d97f90a850611dceafbda`. Thirty-two Casual selfplay runs (seeds 81000–81015, both kickoffs, 480 actions) produced 361 shots and 83 goals from 15,360 actions, with no own goals or unresolved shots. Goals by the map's custom zones were 11 inside the keeper box, 20 in the central approach, 51 wide close, and 1 further out. Physical shot distance was at most three squares for 63 goals and between three and six for 20; there were no shots longer than six squares. The 26 rook shots all had physical distance at most 3.5 squares. Wide end-line squares outside the goal files produced 12 goals (14.5%); wider approaches across the first five ranks produced 51 (61.4%). These are different measures: not every wide-file origin has an extreme shooting angle. Goals by piece were Q 46, N 22, B 8, R 4, P 3 and K 0. This sample remains wide- and close-heavy, so it does not establish calibration to real soccer.

In a separate eight-run Tactical-versus-Casual cohort with the same 480-action cutoff, Tactical recorded 36 actual declared shots and 13 goals, versus 8 shots and 3 goals for Casual. Tactical's goal origins were 6 in the keeper box, 5 in the central approach, and 2 wide close: 11 of 13 (84.6%) came from the central files near goal. Scorers were Q 5, N 6 and R 2. No Tactical shot exceeded six physical squares. The different policies and opponents make this a description of observed spatial play, rather than a like-for-like comparison with Casual selfplay.

A matched whole-release comparison ran the old version-25 engine on the same 32 Casual seeds, kickoffs and 480-action cutoff. The old build produced 431 actual shots and 144 goals, versus 361 and 83 after the update. Wide end-line origins fell from 35/144 goals (24.3%) to 12/83 (14.5%); all wide-file origins fell from 114/144 (79.2%) to 51/83 (61.4%). The central approach increased from 14/144 (9.7%) to 20/83 (24.1%). Origins whose visible opening was less than half that of a central shooter at the same depth supplied 69.4% of old goals and 39.8% of new goals. This compares the whole release, including Casual finishing and own-half stalling, rather than isolating the angle coefficient. The narrower old/new sample of absolute openings below 30 degrees changed more modestly, from 16.7% to 14.5%.

The spatial studies above used shot model 9. Model 10 subsequently adds the requested wide-opening finishing bonus; those recorded distributions are historical measurements rather than fresh model-10 predictions.
