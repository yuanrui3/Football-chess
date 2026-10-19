# Spatial match commentary

The commentary combines public board geometry with a short history of completed passes and off-ball moves. It does not invoke Tactical search, a language model, random draws or the speech service. The default Instant analysis mode selects prepared whole-sentence Hugo clips from those live facts; Tom retains recorded shot and goal reactions. Optional Live Hugo mode still synthesizes new sentences locally.

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

## Delivery

Technical facts take priority over generic zone summaries, subject to the existing ten-second routine cooldown and twelve-second quiet-passage heartbeat. Repeated spatial relationships have a thirty-second cooldown. Shots and goals still interrupt routine analysis; shot results remain tied to the visible animation impact.

Present-tense facts have stable keys naming the involved pieces. The controller recomputes them after observed board changes and immediately before playback, requiring both the same key and the same underlying claim. A library caption always matches the selected recording exactly; the original spatial fact remains attached for revalidation. Invalid facts are cancelled; unrelated moves do not cancel still-valid analysis. Completed actions use past tense. Turnovers, restarts, shots, pauses, undo, mute and pace changes cannot leave stale technical speech queued.

Use **Relaxed · 3 seconds** and **Instant analysis · Hugo + Tom** for spoken spatial analysis without runtime speech generation. Complete Hugo sentences are prepared ahead of time in `dist/audio/hugo/`, and `hugoCommentaryClip(line, state)` chooses a truthful variant using the fact type, involved piece roles and native lane evidence. Scripts omit team names and piece numbers so a finite bank can describe either side. They are not assembled from word fragments. No match data leaves the browser. Missing variants keep their technical caption instead of playing an unrelated call.

The optional **Live Hugo · slower** mode loads about 38 MB of model/runtime assets and may need several seconds per sentence. Valid spatial calls can generate for up to twelve seconds; explicit voice tests get twenty seconds. A changed or expired claim is still cancelled immediately, and urgent keeper-rebound calls retain a shorter deadline. Audio-context interruption recovery and a thirty-second inference watchdog permit explicit retries instead of leaving the worker permanently busy. A selected device voice is another alternative.

`docs/hugo-commentary-library-provenance.json` records the prepared scripts, source identities, file hashes and audio checks. `scripts/build-hugo-commentary-library.mjs` reproduces the bank using the bundled Hugo voice and local speech model. Saved shot/goal calls and the existing model/voice identities are preserved.

## Verification

`tests/commentary-spatial.test.mjs` covers mirrored positive and negative geometry cases, including offside, blockers, pawn setup, backward tackles and actual pass-and-run history. `tests/commentary-spatial-delivery.test.mjs` checks exact local speech, truthful caption fallbacks, cadence, priority and cancellation. `tests/commentary-library.test.mjs` checks prepared variants, exact captions, stale-call cancellation and playback without local synthesis. Existing commentary and speech tests remain applicable.
