# Passing under a calibrated cue

## Question and interventions

Can Gemini 3.1 Flash-Lite reverse its pass when the reliability of the same favorable report crosses the protected receiver's retention probability? Does it make that reversal when protection is assigned to a rook as well as when it is assigned to a knight?

Use six fresh Football Chess layouts. Each supplies two equally likely possible states and hides which state is present. The ordinary receiver is safe in one state and tackled in the other. A second receiver is tackled in both states but retains possession with probability 0.75. A bishop is tackled in both states and loses possession. The stipulated protection rule replaces the usual piece-specific tackle payoff. The objective is retention after the next challenge, with no value assigned to later moves.

Cross two protection assignments (knight or rook), two cue reliabilities (0.90 or 0.60) and two reported outcomes (safe or exposed) within each layout. The cue concerns the ordinary receiver and has the same accuracy in both possible states. Give the model the state descriptions and cue mechanism as text. No true state is drawn or revealed. Score each choice by its expected return conditional on the given report. Each of the six menu permutations appears in each factorial cell. Each condition gets one fresh API request per layout, 48 in total. The six layouts replicate each comparison across positions. Identical prompts are not repeatedly sampled.

## Endpoints

The primary unit is a layout and protection assignment with a favorable report. Count a solved reliability pair only when the model chooses the ordinary receiver at 0.90 and the protected receiver at 0.60. Report out of 6 for each assignment and 12 overall. Also report how many of 6 layouts pass this test with both assignments. An invalid completed response counts as incorrect. A run with missing requests is incomplete.

Secondary measures are correct choices and choice frequencies by condition and piece, knight choices with and without protection, and mean expected retention forgone among valid choices. For an exposed report the ordinary receiver retains possession with probability 0.10 or 0.40, so both reliabilities favor protection. Report these controls separately. Counts are descriptive for the frozen layouts and model configuration. Correct behavior can result from a numerical comparison using supplied information. The experiment does not identify the computation used on the prior full boards.

## Collection

Use the standard Google Gemini Developer API on the Football Chess Benchmark project after checking its free tier. Use the same model alias, temperature zero, high thinking and 4,096 output-token cap as the previous pass study. Use a single user turn, no tools, no history and a JSON integer from 1 to 3. Shuffle all requests by a deterministic hash ordering before collection. Freeze the design, prompt manifest, model request bytes, schedule, protocol and analysis code with SHA-256 digests before the first call.

Journal completed replies once, including invalid or blocked completions. Retry transient transport and rate-limit failures on the same serialized body. Resume from verified completed requests after an interruption. A free-tier quota interruption preserves the remaining schedule. Record the actual returned model versions and the number of retries. Score after all scheduled replies are available.
