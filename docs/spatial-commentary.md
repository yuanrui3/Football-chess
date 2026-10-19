# Spatial match commentary

The commentary combines public board geometry with a short history of completed passes and off-ball moves. It does not invoke Tactical search, a language model, random draws or the speech service. The existing local Hugo voice speaks new analysis; Tom retains recorded shot and goal reactions.

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

Present-tense facts have stable keys naming the involved pieces. The controller recomputes them after observed board changes and immediately before local playback, requiring both the same key and the same spoken claim. Invalid facts are cancelled; unrelated moves do not cancel still-valid analysis. Completed actions use past tense. Turnovers, restarts, shots, pauses, undo, mute and pace changes cannot leave stale technical speech queued.

Use **Relaxed · 3 seconds** and **Live analysis · Hugo + Tom** for spoken spatial analysis. The selected device voice can also read it. When Hugo is unavailable, or recorded-only mode has no matching clip, the exact technical caption remains; an unrelated stock recording is never presented as that analysis. Saved shot/goal calls continue normally. The local model and voice assets are unchanged.

## Verification

`tests/commentary-spatial.test.mjs` covers mirrored positive and negative geometry cases, including offside, blockers, pawn setup, backward tackles and actual pass-and-run history. `tests/commentary-spatial-delivery.test.mjs` checks exact local speech, truthful caption fallbacks, cadence, priority and cancellation. Existing commentary and speech tests remain applicable.
