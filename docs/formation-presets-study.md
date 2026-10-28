# Starting formation presets

This update changes starting coordinates only. Piece abilities, move budgets,
AI difficulty, offside, shots and tackling probabilities are identical for all
three presets. Neutral preserves the v47 starting position exactly. Each team
can independently choose a preset; Obsidian uses its selected template rotated
180 degrees. Only the kickoff queen is moved onto the centre row.

Players can still reposition pieces before kickoff using the existing setup
controls. Changing one team's preset replaces that team's setup only. A goal
restores surviving players to that team's selected preset; it does not restore
manual pre-match edits. Loading or undoing a live custom position preserves its
coordinates. Older matches without preset metadata use Neutral on later goal
resets, without rearranging the currently saved board.

## Why offer three starting choices?

Advantages are strategic variety before the first move, clearer teaching of
height/width/cover tradeoffs, and a quick alternative to manually rebuilding
eleven pieces. Keeping Neutral unchanged protects the familiar default. Three
labels are small enough to compare, while independent team choices allow nine
preset matchups and human customisation remains available.

Costs are added setup decisions, more combinations to validate, and a risk that
players mistake a formation name for an AI style or statistical bonus. An
advanced start can also expose an opening exploit, while a compact start can
lead to slow circulation. The presets therefore retain the same king and pawn
screen, enforce legal own-half starts and preserve at least one accurate
nonkeeper kickoff receiver. Match results can still favour one geometry under
a particular AI; no opening smoke test establishes equal full-game strength.

## Coordinate reference

Ivory attacks toward rank17. Its static home positions are:

| Piece | Aggressive | Neutral | Defensive |
|---|---|---|---|
| K | g2 | g2 | g2 |
| Q | g7 | g5 | g4 |
| R1 / R2 | b5 / m5 | b4 / m4 | b4 / m4 |
| B1 / B2 | e7 / l5 | c5 / l5 | c4 / l4 |
| N1 / N2 | d8 / j7 | d8 / j7 | e6 / j6 |
| P1 / P2 / P3 | f4 / h4 / j4 | f4 / h4 / j4 | f4 / h4 / j4 |

For any preset, the side taking kickoff instead has its queen at g9 (Ivory) or
h9 (Obsidian). All other players are in their own half; goal-mouth squares are
clear, both bishops cover opposite square colours, and only K starts in a box.

## Strategic tradeoffs

### Aggressive

The advanced e7 bishop gives the kickoff queen a two-square diagonal outlet
Qg9–Be7, then a one-square diagonal link Be7–Nd8. The home queen on g7 also has
a horizontal link toward Nj7 when the other side takes kickoff. The rooks start
one rank higher and the second bishop keeps its familiar l5–j7 diagonal.

This is faster support for the advanced knight, not extra pace or scoring
strength. Advancing a bishop, queen and both rooks leaves more room between that
line and the unchanged three-pawn screen. After losing the ball, there is less
cover already sitting behind midfield. Rook-to-pawn row-four outlets are also
replaced by a more advanced horizontal route into the l5 bishop.

Use it when seeking an early central connection, a higher press, or quicker
wing support. Keep a recovery defender rather than sending every forward piece
to the ball. The most advanced knight remains d8: the starting-own-half rule
prevents arbitrarily placing extra players across halfway.

### Neutral

This is the existing formation: wide rooks on the pawn-screen rank, opposite
bishops connected toward the front, and advanced knights. Rb4 can find Pf4 and
Rm4 can find Pj4 with accurate horizontal passes. Home Qg5 has its diagonal into
Nd8, and Bl5 links to Nj7. The kickoff queen's c5 bishop outlet is deeper than
Aggressive's e7 outlet.

Its advantage is balance and familiar lanes. Its cost is that neither the
initial central support nor the compact deeper cover is as concentrated as in
the specialised alternatives. It is the default and a good learning setup.

### Defensive

The queen, bishops and knights sit deeper. Bc4–Ne6 and Bl4–Nj6 remain linked
by short diagonals, while Qg4–Ne6 provides a central build-up line. The kickoff
queen can send an accurate diagonal to Nj6 or Rb4. The knight outlet is
resistant to clean tackles but still needs a legal L-shaped next kick.

The compact shape places more cover near the pawn screen without parking
outfield players inside the box. It also crowds the back rank: the wide rooks'
first horizontal receivers are now the bishops at c4/l4, rather than the pawns.
Short relays replace direct rook-to-pawn distribution. There are fewer already
advanced receiving targets, and own-half four-square progress must still be
made within three completed rounds. Defensive does not exempt stalling or
repetition and does not tell the AI to refuse shots.

Use it when prioritising recovery cover or counterattacks after regaining the
ball. Prepare a genuine forward outlet; repeatedly recycling in the compact
line can simply invite pressure or a progress free kick.

## Keeper distribution caution

All three home shapes leave a clear native king pass along the g-file to their
home queen. Moving the kickoff queen into the centre changes the endpoint but
not this basic lane. A king receiving a teammate pass must immediately release;
the preset is not a guarantee of two safe exits. Prepare a second distribution
ray before passing to K if the central queen route can be blocked. Goal kicks
are different: both teams resettle first and the kick may loft one body.

## Validation and opening study

The accompanying `scripts/analyze-formations.mjs` reports exact native passing
connections and runs fixed-action opening windows. It uses native engine
transitions with roster/occupancy integrity checks, both kickoff directions and
paired random seeds. Expected goals are counted after keeper reaction. These
are short opening samples, not timed matches or evidence that one preset is
stronger across a full game. Changing a formation also changes the AI's chosen
route, so a handful of sampled goals cannot isolate formation strength.

### Recorded opening sample

- 36 Casual-vs-Casual opening windows, 120 atomic actions each.
- All nine ordered preset pairings, seeds 7021/7022, both kickoff choices.
- 6 extra mirror opening windows with bounded tactical search (depth3, 180nodes),
  48 actions each. This is a smoke check, not the full Tactical difficulty.
- Fouls enabled; no integrity errors across all 42 windows.
- xG is accumulated from the resolved shot model after keeper reaction.

Totals across 24 Casual team-windows for each preset:

| Preset | Shots for / against | xG for / against | Goals | Own-half stalls | Attacking-third entries |
|---|---:|---:|---:|---:|---:|
| Aggressive | 14 / 17 | 2.006 / 2.734 | 4 | 10 | 32 |
| Neutral | 5 / 4 | 1.106 / 0.655 | 1 | 14 | 36 |
| Defensive | 10 / 8 | 1.727 / 1.450 | 1 | 12 | 28 |

The aggressive shape produced more shots and conceded more shot quality in
this sample, consistent with its intended exposure tradeoff. Defensive reached
the attacking third less often, but the sample does not show it conceding less
xG than Neutral. Therefore the label describes its starting shape, not a proven
defensive advantage. Do not rank presets by the six sampled goals.

The bounded tactical mirrors produced only one resolved shot overall (0.112xG),
so they support legal-play smoke validation only. Forty-eight actions are too
short to compare Tactical scoring or defensive strength. Full tactical matches
and larger samples are required for that separate question.

Static home-position geometry also differs meaningfully: mean outfield rank
from its own goal is 5.6 / 5.0 / 4.4 for Aggressive / Neutral / Defensive. There
are 15 / 19 / 17 directed accurate native teammate passing links in their
respective home shapes. These counts do not measure safe retention after a
defensive reply. The exact initial nonkeeper kickoff receivers are Be7, Bc5,
and Nj6 plus Rb4 respectively, all 100% accurate.
