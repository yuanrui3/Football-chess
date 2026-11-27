# A matched passing test for the author and Gemini

The question is whether the author and Gemini make different receiver choices when a one-square defensive edit changes, or preserves, the best pass. The earlier eight-board walkthrough used different displays for the author and model. Both chose every optimal receiver. Gemini solved 38 of 40 pairs in the original passing bank. This follow-up uses fresh decisions and gives the two decision-makers the same pitch image, rules, coordinate roster and three options on each board.

## Design

The test has 16 boards in eight pairs. Each pair offers the same three passes before and after one defender moves one square. Four pairs require switching receiver and four require keeping the same receiver. Four pairs test obstructed tackle lines and four are comparison cases where shape and range suffice. Both groups contain two switch pairs and two stay pairs, with both attacking colors represented in each group and condition. Positions were constructed and checked against the frozen rules-22 engine before collection, using board features and reference payoffs. No response from the author or Gemini on the new boards entered selection.

Every offered pass reaches its receiver. The attacking team then holds position. The defender may hold or make one move and seeks the best legal tackle. The unique optimal receiver maximizes the probability of still having possession after that challenge. The test asks about this immediate decision. The designed board frequencies have no interpretation as frequencies in a match.

## Collection

1. The author opens `participant/quiz.html` and completes the 16 decisions once, without an engine, another assistant or outside help. The displayed instructions can be consulted on every board. The quiz locks each confirmed decision and gives a code on completion. Score the two decision-makers together after both have answered. Record any outside clarification or prior exposure to a test position if either occurs.
2. Evaluate the named Gemini model once on each manifest item, in a fresh context, with the frozen request and no tools, counterpart, feedback or extra messages. Use model alias `gemini-3.1-flash-lite`, high thinking, temperature zero and a 4,096-token generation limit. The response format admits a single option number. Preserve each returned model version. If the alias or multimodal configuration cannot be served, record the model arm as pending or unavailable. A replacement model or representation is a new experiment.
3. A completed response that is truncated, blocked, empty or outside the specified answer format receives no board or pair credit. Retry only a transient transport or quota failure on the identical request. Keep the first completed response. A missing request is pending and cannot be scored as a loss.

The file `freeze.json` is an internal, pre-response integrity record covering the protocol, answer key, scoring code, schedule, quiz assets and the exact serialized request for each board. It is a local design freeze. A person may remember earlier boards, read the rules at their own pace and already know the game's conventions. Gemini answers in independent contexts under a token cap. Record these differences when describing the comparison.

## Endpoints and interpretation

The primary result is the number of fully solved pairs for each decision-maker. A pair requires both optimal receivers. Report all four matched counts: both solved, only the author solved, only Gemini solved, neither solved. The signed difference is author-only minus Gemini-only. One pair is one eighth of the test. Set out the result in either direction, including an exact tie.

Secondary results are correct boards out of 16, receiver changes on switch and stay pairs with two valid answers, fully solved pairs by board-design group, and mean loss in retention probability over valid answers. Report the valid-answer denominator. These measures can identify different choices behind equal pair totals. Frequent errors on the obstructed-line boards motivate a hypothesis about blockers. Verifying how a decision-maker actually reasoned requires additional evidence.

All edits move a defending pawn. The constructed positions use the same three receiver types and a limited set of tackle patterns. Every stay pair has a non-knight optimum, and the switch pairs exchange a knight and a non-knight. This selection changes the knight shortcut seen in the earlier bank and limits generalization to other configurations.

This is one informed author, one model configuration and eight deliberately selected pairs. Report observed discordances descriptively. Stronger evidence about a difference in ability would require independent participants, fresh boards and replication across model calls.

## Offline verification and scoring

This section was updated for the public reproduction package. From this directory, run `node reproduce.mjs` with Node.js 24.2 or later to regenerate the board bank, verify all 16 multimodal request digests, and score both recorded sets of choices. [Reproduction notes](README.md)
