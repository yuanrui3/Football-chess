# Passing under an immediate challenge

Run `node reproduce.mjs` in this directory using Node.js 24.2 or newer. The command works offline with the standard library. It prints board accuracy, pair scores, receiver changes and retention loss for Gemini and four deterministic policies. It checks every request hash, all 240 native reference values and every recorded tackling defender from the coordinates.

## Data

`data.json` contains the frozen generation settings, 40 pair definitions and 80 positions in the scheduled request order. Each pair lists its two item IDs, attacking colour, edited defender and true condition. The optimal receiving piece changes on a switch pair and stays the same on a stay pair. Each position lists every occupied square, the attacking queen carrying the ball, and three receiver IDs in the displayed order. The `oracle` rows identify the receiver, pass accuracy, defending tacklers, maximum takeaway probabilities through those tacklers, and resulting retention probability. The best receiver uniquely maximizes retention through the defending turn. The native game accepted all 240 passes as legal and accurate with probability one.

The `prompt` field is the exact user text. A single user message, one text part and the frozen generation settings reconstruct each serialized request. The SHA-256 `wireHash` covers its UTF-8 bytes. `answer` and the recorded `geminiChoice` are one-based menu indices. A null choice represents a completed response that failed the strict format or completion check. The repeated item IDs identify synthetic boards.

## Interpretation

`correctBoards` counts agreement with the engine on all 80 choices. `bothCorrect` requires two correct choices among all 20 pairs of each kind. `changedReceiver` compares receiver identities among `bothValid` pairs. `meanRetentionLossValid` averages the optimal receiver's retention minus that of the selected receiver over valid answers, on a 0–1 probability scale.

The three comparison policies specified before collection always choose the first option, maximize distance to the nearest defender, or evaluate defender tackle shapes and ranges while ignoring blockers and landing availability. The additional post hoc diagnostic chooses a knight whenever offered and the first receiver otherwise. All rules break ties by menu order. The offline audit also enumerates legal tackle landings with occupancy and landing constraints to verify the native labels.

The pass task was developed after the shot study. The pass bank, requests and model scoring were frozen before collecting pass responses. A local credential preflight correction preceded the first request. The corrected lock retained every request hash, the scorer and all study measures.
