# Spatial match commentary

The commentary combines public board geometry with a bounded history of completed rounds, passes and off-ball moves. It does not invoke Tactical search, a language model, random draws or the speech service. The default Instant analysis mode selects prepared whole-sentence Hugo clips from those live facts; Tom retains recorded shot and goal reactions. Optional Live Hugo mode still synthesizes new sentences locally.

## Terms and evidence

| Call | Required evidence |
| --- | --- |
| Support / outlet | A nearby teammate is onside and reachable by the carrier's native passing pattern, with no illegal blocker. A knight uses an L-shaped jumping pass. |
| Link-up play | A recorded receiver subsequently passes to a third teammate during uninterrupted possession. |
| One-two | A completed A-to-B pass, an observed off-ball run by A, then a completed B-to-A return. Offering the pass-and-run action does not count as executing it. |
| Forward run | An actual off-ball move advances toward goal and creates an onside passing connection. |
| Pressing | The defender has a legal tackle under the current phase and remaining ordinary-move budget. Nearby pieces with the wrong tackle pattern do not count. |
| Pawn pressure | During the defensive turn, both the shared bonus and ordinary action remain; a legal free pawn step would create a legal diagonal tackle. |
| Screening | A defender obstructs a native passing ray. A screening move closes a previously legal receiving lane; knight passes jump over intervening pieces. |
| Shooting through traffic | The native shot model identifies a defending piece whose square intersects a legal shot. The call describes a possible block, rather than claiming the shot is forbidden or will be stopped. |
| One-on-one | A near-goal carrier has a legal shot against a keeper in its own box, with no outfield challenge, native shot-body blocker, or defender in the shooting corridor. Backward knight challenges and pawn bonus setups prevent a clear one-on-one call. |
| Through ball | An actual forward pass reaches empty space beyond nearby defenders, and a different onside teammate has a legal collection move. Commentary does not promise that the runner will collect it. |
| Cross / cutback | An actual wide attacking delivery travels substantially inward to the central final third. A backward delivery is a cutback. A midfield switch is not a cross. |
| Carry into space | A completed forward dribble ends beyond immediate native tackle and bonus-step threats. |

Native pass generation supplies receiver and offside flags. Read-only board geometry supplies movement, occupancy and challenge patterns. No game rules, probabilities, AI choices, storage or match clocks are changed.

## Larger tactical analysis

`dist/commentary-tactics.js` records only committed public actions. Sequences detect genuine regains followed by forward progress, completed passes switching between opposite flanks, short combinations involving several pieces, territorial gains and sustained final-third possession. Formation assessments require six stable completed rounds within a rolling ten-round window: width on both wings, central congestion, a genuinely compact defensive block, a high line, isolated carriers, pawns screening in front of the box, and pieces balancing ahead of and behind the ball. These are descriptions of observed shape, not a conventional formation name or a claim about a manager’s intent.

Individual assessments use bounded recent events tied to a stable piece ID: at least two completed forward passes or carries totalling six forward squares, two successful tackles, two verified assists, two goals, three forward possession losses, or three genuine keeper saves. A lost stochastic outcome does not become a numerical player rating. Goal and assist credit requires a verified current scoring transition; old saved totals are not imported as new performances. The caption context identifies the assessed team and player; the spoken caption still matches the recording exactly. No pass accuracy metric is introduced.

## Delivery

Broader tactics, shape and performance lead routine analysis. When both are available, three broader comments are followed by an eligible spatial detail. The ten-second routine cooldown and twelve-second quiet-passage heartbeat remain. Spatial relationships have a thirty-second cooldown; a tactical team/player topic has a forty-five-second cooldown, and unchanged individual event totals cannot repeat a performance verdict. There is no analysis backlog. Once Hugo starts a sentence, automatic shot/result/goal calls wait for its end. A single pending reaction keeps the highest priority and newest equal-priority event; a result replaces its obsolete shot call. Expired reactions are dropped. Automatic replay/full time preserve the sentence and pending reaction; explicit mute, pause, reset, mode changes and manual dialogs still stop immediately. Results are observed only at visible animation impact, even when their voice reaction waits briefly.

Prepared spatial recordings use past tense and carry `snapshot:true`. The controller verifies the underlying public fact immediately before the first playback start. Once it starts, the historical observation remains true even when an ordinary move changes the current position, possession or restart. It can finish its sentence even when a shot, goal or full-time transition arrives. Stale pending clips are still discarded, and explicit pause, manual replay, undo, mute, pace changes and resets still stop immediately. Repeated browser playback callbacks cannot revalidate and cut off an already-started observation. Optional Live Hugo converts current spatial statements to past tense while retaining their original native evidence for validation before first playback. Its already-started observations receive the same sentence protection. The device-voice alternative retains its existing behavior.

Use **Relaxed · 3 seconds** and **Instant analysis · Hugo + Tom** for spoken spatial analysis without runtime speech generation. Complete Hugo sentences are prepared ahead of time in `dist/audio/hugo/`, and `hugoCommentaryClip(line, state)` chooses a truthful variant using the fact type, involved piece roles and native lane evidence. Spatial and tactical scripts omit team names and piece numbers so a finite bank can describe either side; statistical recordings name Ivory or Obsidian explicitly. They are not assembled from word fragments. No match data leaves the browser. Missing variants keep their technical caption instead of playing an unrelated call.

All prepared tactical scripts are exported from `TACTICAL_COMMENTARY_SCRIPTS` as the single source for exact captions and generated recordings.

The optional **Live Hugo · slower** mode loads about 38 MB of model/runtime assets and may need several seconds per sentence. Valid spatial calls can generate for up to twelve seconds; explicit voice tests get twenty seconds. A changed spatial fact before speech or an expired pending call is still cancelled immediately, and urgent keeper-rebound calls retain a shorter deadline. Audio-context interruption recovery and a thirty-second inference watchdog permit explicit retries instead of leaving the worker permanently busy. A selected device voice is another alternative.

`docs/hugo-commentary-library-provenance.json` records the prepared scripts, source identities, file hashes and audio checks. `scripts/build-hugo-commentary-library.mjs` reproduces the bank using the bundled Hugo voice and local speech model. Saved shot/goal calls and the existing model/voice identities are preserved.

## Verification

`tests/commentary-spatial.test.mjs` covers mirrored positive and negative geometry cases, including offside, blockers, pawn setup, backward tackles and actual pass-and-run history. `tests/commentary-spatial-delivery.test.mjs` checks exact local speech, truthful caption fallbacks, cadence, priority and cancellation. `tests/commentary-library.test.mjs` checks prepared variants, exact captions, stale-call cancellation and playback without local synthesis. `tests/commentary-tactics.test.mjs` verifies sequence, formation and performance evidence; delivery and continuity tests check macro emphasis, snapshot completion and protected interruptions. Existing commentary and speech tests remain applicable.

## Statistical commentary

`dist/commentary-stats.js` derives team-named shot and possession calls from `matchStatsSummary`. Shot counts start at three and are spoken exactly through thirty, with a truthful “more than thirty” call above that. Possession requires at least sixty seconds of active recorded play; the voice rounds to five percentage points and says “about”, while the separate context retains the observed exact percentage, shots and on-target count. Partial restored records stay silent. Stats share the routine cadence but have a global sixty-second minimum gap; topic/team rotation prevents shot updates starving possession or one team. Unchanged shot counts or possession buckets do not repeat. Pending clips are checked against the current count/bucket before first start, without requiring exact floating-percentage equality that would starve playback.

Pause opens current match stats with Resume and Keep paused controls. The Match stats button can reopen them while paused. A paused, unrevealed shot uses its pre-impact recorded state, so the panel does not leak a result before the ball arrives.
