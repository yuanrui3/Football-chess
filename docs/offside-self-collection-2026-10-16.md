# Loose-ball offside warnings and self-collection

The live preview previously recalculated geometric offside positions while the ball was loose. This could put an exclamation mark on a knight chasing its own kick, or an onside teammate running forward after the kick. Ordinary self-collection was already permitted by the kick-time engine snapshot.

Warnings now use only that original snapshot while the ball is loose or a shot is pending. Fresh positional previews resume when a player controls the ball. The kicker is explicitly excluded from adjudication and active warnings, including stale saved snapshots. Loading removes the known kicker flag while retaining genuine teammate flags; the defensive line is never reconstructed after the kick. A later teammate kick creates a new snapshot, so the former kicker has no permanent exemption.

Knight passes remain one L-shaped jump and can land on an onside teammate, jumping over intervening pieces. Ordinary teammate offside and the special box-involvement rule still apply.

Self-collection still spends the ordinary move and dribble allowance. Four completed attacking rounds carrying with the same player are allowed; a fifth attempted carrying round awards an indirect carrying-limit free kick. A simply unavailable move may instead mean the current round's allowance has already been spent. Self-pass box-entry restrictions remain in force.

Validation covers both directions, self-collection, intervening actions, reload, stale flags, onside and offside receivers, later teammate kicks, production warning functions and action budgets. See tests/self-collection-offside.test.mjs. Focused existing offside, box-involvement, fairness, pace and UI checks also pass. Browser visual QA was unavailable in this managed environment.
