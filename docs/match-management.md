# Modest computer match management

The playable Casual and Tactical policies accept a separate `matchContext`
option containing `durationSeconds` and `remainingSeconds`. The browser supplies
its actual clock snapshot to the worker and to every recovery path. The clock
hint is not stored in the live rules state and does not consume match RNG.

`matchTacticsProfile` returns bounded preference multipliers. At equal scores,
the current position is balanced. For a one-goal deficit, the aggression factor
grows from 2% at kickoff to 6% at full time; a two-goal or larger deficit grows
from 4% to a maximum 12%. A lead reverses the sign. Untimed matches use 3% per
goal, capped at 6%.

Timed urgency uses the square of elapsed match fraction, giving a gradual
increase without a sudden final-minute switch. Forward progress, receiving
support and pressing have multiplier `1 + aggression`; risk aversion and cover
have `1 - aggression`. Shot preference and possession control use half that
adjustment. These are preference multipliers, not changes to shot probability.

The search recomputes the score relationship in hypothetical branches while
holding the supplied clock snapshot fixed. Both sides use the same policy.
Move legality, native chance outcomes, stalling enforcement, keeper-home
incentives, high-value tackles and the Casual strong-shot safeguard retain their
normal rules. Search budgets remain fixed.

Missing or invalid context retains the earlier policy. Exercises omit the live
match context. Current-round display analysis explicitly disables management,
so its estimate continues to ignore earlier goals and the match clock.

Validation covers context propagation through the worker, fallback and timeout
recovery; bounded and mirrored profiles; actual legal decision changes; strong
finishes and defensive safeguards; and exact compatibility without context.
