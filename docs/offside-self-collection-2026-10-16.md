# Loose-ball offside warnings and self-collection

The live preview previously recalculated geometric offside positions while the ball was loose. This could put an exclamation mark on a knight chasing its own kick, or an onside teammate running forward after the kick. Ordinary self-collection was already permitted by the kick-time engine snapshot.

Warnings now use only that original snapshot while the ball is loose or a shot is pending. Fresh positional previews resume when a player controls the ball. The kicker is explicitly excluded from adjudication and active warnings, including stale saved snapshots. Loading removes the known kicker flag while retaining genuine teammate flags; the defensive line is never reconstructed after the kick. A later teammate kick creates a new snapshot, so the former kicker has no permanent exemption.

Knight passes remain one L-shaped jump and can land on an onside teammate, jumping over intervening pieces. Ordinary teammate offside and the special box-involvement rule still apply.

Self-collection still spends the ordinary move and dribble allowance. Four completed attacking rounds carrying with the same player are allowed; a fifth attempted carrying round awards an indirect carrying-limit free kick. A simply unavailable move may instead mean the current round's allowance has already been spent. Self-pass box-entry restrictions remain in force.

Validation covers both directions, self-collection, intervening actions, reload, stale flags, onside and offside receivers, later teammate kicks, production warning functions and action budgets. See tests/self-collection-offside.test.mjs. Focused existing offside, box-involvement, fairness, pace and UI checks also pass. Browser visual QA was unavailable in this managed environment.

## Full audit and live goalkeeper parries

The full audit checked kick-time geometry against IFAB Law 11: https://www.theifab.com/laws/latest/offside/ . The strict ball/second-last-opponent tests, neutral halfway row, level positions, delayed involvement, direct goal-kick/corner/throw exemptions and controlled-opponent reset are retained. The custom automatic involvement for offside outfield attackers inside the opponent's box and the fixed penalty model remain explicit grid-game differences. Individual dribble steps do not create a new teammate-kick snapshot in this phase-based game.

One further bug was corrected: reflex defensive shot blocks retain offside flags until the defender subsequently plays the ball under control, matching a keeper save. A boundary restart still clears the old snapshot.

Following the requested keeper-punch/spill rule, one in five parries of an opponent's shot stays in play. Goal/catch/wide/body-block odds remain unchanged, and the previous corner-parry mass supplies the new live outcome. Landings are uniform over empty legal cells in the box plus a two-square margin, excluding goal-mouth cells. The ball stays loose, old offside flags remain active, and ordinary collection rules apply. Penalties and teammate backward shots retain their prior handling so compulsory keeper release cannot be bypassed.

New engine tests cover all seven disjoint outcomes, both directions, exact public landing probabilities, keeper movement and occupancy, random replay and reload, offside rebound eligibility, and back-pass handling. Training tests verify the same finite distribution is used offline; no retraining or new strength claim is made.

Final validation: all 1,132 regression tests pass, with no failures or skips. Four actual versioned-worker/main-thread round trips pass with the experimental model both enabled and disabled. Fifteen static local references pass. See the verification folder for exact evidence.
