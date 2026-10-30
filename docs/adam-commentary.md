# Adam match commentary

The selected voice is Adam Stone, a warm, upbeat British stock voice available
through Runway. The generation plan uses voice ID
`DEFpwxCUkrj3WAbTDRTZ`, model `eleven_v4`, and speed `1.05`. No real match
commentator is cloned or imitated.

`adam-commentary-plan.json` covers all 55 existing event keys and all 305
existing tactical, spatial, shape, player-performance and statistics keys.
It also supplies 38 alternate event sentences for goals, shots, held saves,
corner saves, misses, loose balls, counters and switches. Identical words with
the same delivery share one recording, producing 364 unique whole-sentence
recordings across 398 bindings.

Measured analysis uses a conversational delivery. Dangerous attacks and
reactions use an excited delivery; goal punctuation provides the stronger
celebration without a shout instruction. Bracketed delivery tags are only
generation instructions. Captions contain the actual spoken sentence.

Event variants retain their original trigger's factual meaning. Equalisers
still describe a level score, lead-extending goals describe a larger lead,
held saves describe keeper control, and corner saves describe the ball going
out. A goal call never invents the exact part of the net. Shot-attempt calls do not claim that the keeper has already made contact.
Miss calls are
restart-neutral, because an off-target long shot can produce a throw-in and
an ownward attempt can produce a corner.

All existing tactical snapshot flags and selection keys are preserved.
Internal `hugo_*` keys remain compatibility aliases, but their spoken identity
is Adam. Technical calls continue to depend on observed geometry and recent
play; new recordings do not establish new tactical facts or change game rules.

The plan orders event calls and their variants first, then common tactical
calls, then statistics. Every generation request is one complete sentence or
short complete call. Audio is intended to be generated ahead of time and
bundled with the game, with no paid generation requests during a match.

The existing Relaxed three-second eligibility and natural sentence completion
remain requirements of live playback. A three-second action pace is never an
audio cutoff. Explicit Stop, mute, pause and voice changes remain immediate.

## Positional accuracy update

Nearby support calls now say that a piece had a clear pass to a teammate.
They do not describe the whole file, rank or diagonal as open. Native legal
passing geometry and offside still determine whether that outlet exists.
A cleared rook shooting lane requires an actual friendly blocker to move away,
no remaining outfield blocker on the file, and no defender in the native shot
model's corridor. The lane is checked again while the call is waiting to start.

Adam names Ivory or Obsidian when a broad high defensive line persists for
three completed rounds. The deepest outfield piece must be within two ranks
of halfway or farther forward; at least three pieces must form the rear band
within two ranks of that depth, spanning at least four files. A lone advanced
piece or a high average position does not qualify.

Crowded-midfield commentary requires at least eight outfield players, including
at least three from each side, in the central six files and five ranks around
halfway. The observed board must contain at least twelve outfield players.
It must persist for three completed rounds and the caption names both teams.
These distribution histories survive open-play turnovers. Restarts, invalid
boards and resets clear them. Current positions must still support every
shape statement before playback starts; started sentences finish naturally.
