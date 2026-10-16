# Historical evaluation: 12×15 pitch

These measurements predate the 14×17 pitch, 6×3 boxes, universal outfield box access, doubled knight finishing and probabilistic defender blocks. They describe their frozen builds, not the current game.



Before this update, 64 Casual selfplay games (seeds 49000–49031, both kickoffs, 480 actions each) produced 248 goals and 159 assists. The final accurate teammate pass, including a pass into space followed by collection, receives the assist; dribbling preserves it, while a turnover, restart, scattered pass, self-pass, or previous shot clears it. There were 89 unassisted goals and no own goals.

| Piece | Goals | Assists |
| --- | ---: | ---: |
| Queen | 142 | 20 |
| Knight | 72 | 100 |
| Bishop | 25 | 16 |
| Rook | 7 | 11 |
| Pawn | 2 | 8 |
| King | 0 | 4 |

This distribution describes that policy and starting formation, rather than intrinsic piece values. Knight-to-queen combinations supplied 89 goals.

The selected Tactical upgrade was evaluated against the previous search with identical new shooting rules and Casual ranking utilities. Twenty-four held-out paired games, capped at 240 actions, finished 10 wins, 10 draws and 4 losses for the upgrade: 12–5 goals, 35–16 shots, and 8.651–4.463 summed post-reaction goal probability. Seeds were 82701–82704 with both kickoffs and swapped colours, plus 1974113031, 374918055, 2948123670 and 840537219 with White kickoff and swapped colours. All 5,760 actions replayed exactly from their seeds without a rules-invariant error. Candidate engine SHA-256 was `068c296ee7b49254554130b79e34a4ea52303713a0ce5d4d648ddcaea059fca2`; matched old-search module was `49a064a98a372621776d5803061b0eb354e40046a353953d6d97daed60f32b3b`.

That study preceded the own-half-only stalling change. These fixed-action games are a small, partly correlated sample, rather than regulation matches or an Elo estimate. No new-policy rook shots, shots longer than six physical squares, or long passes occurred in this sample. Stronger rook accuracy therefore establishes a capability change, without evidence that this search uses it more often. A separate 98-position single-process profile measured similar mean decision time (139.7 ms versus 137.2 ms), with the 95th percentile reduced from 616.5 ms to 257.2 ms; this is not a browser performance measurement.

An additional eight games under own-half-only stalling (seeds 315502971 and 2245870031, both kickoffs and swapped colours, 240 actions) finished 1 win, 7 draws and no losses for the upgrade, with 1–0 goals, 8–5 actual declared shots, and 2.239–1.360 summed goal probability. All 1,920 actions replayed exactly; all 1,512 checked opponent-half states correctly disabled stalling, and the sole stalling award occurred in the offender's own half. The upgrade took all eight actual kick-phase opportunities worth at least 25% after the best keeper reaction. This small smoke sample still included long legal attacking-half circulation, so the absence of a deadline there should not be mistaken for an AI guarantee of quick attacks. These fresh matches used the same live transition rules as version 13; the later version-13 migration only changes handling of historical saved counters. An audited simulator bookkeeping correction excludes goal-target kicks cancelled for offside before shot declaration; scores and goal probabilities were unaffected.

For spatial context, [UEFA reports 98 of EURO 2024's 117 goals inside the penalty area](https://www.uefa.com/uefaeuro/history/news/028f-1b5e7399cdaa-e76541a9f816-1000--how-the-117-goals-at-uefa-euro-2024-went-in/). [FIFA reports 83% inside at Club World Cup 2025, versus 92% at World Cup 2022](https://www.fifatrainingcentre.com/en/game/tournaments/fcwc/2025/team-analyses/the-fpi-overview-of-fifa-club-world-cup.php). The game's four-by-two restricted keeper box is not a scale equivalent of a real penalty area; those figures guide the preference for close, central chances rather than a literal target for goals inside the game's box.

Post-update spatial sampling used the frozen version-13 engine `bd15a4aaf810cc6a075876bdda2ec68cbf49f3b67e1d97f90a850611dceafbda`. Thirty-two Casual selfplay runs (seeds 81000–81015, both kickoffs, 480 actions) produced 361 shots and 83 goals from 15,360 actions, with no own goals or unresolved shots. Goals by the map's custom zones were 11 inside the keeper box, 20 in the central approach, 51 wide close, and 1 further out. Physical shot distance was at most three squares for 63 goals and between three and six for 20; there were no shots longer than six squares. The 26 rook shots all had physical distance at most 3.5 squares. Wide end-line squares outside the goal files produced 12 goals (14.5%); wider approaches across the first five ranks produced 51 (61.4%). These are different measures: not every wide-file origin has an extreme shooting angle. Goals by piece were Q 46, N 22, B 8, R 4, P 3 and K 0. This sample remains wide- and close-heavy, so it does not establish calibration to real soccer.

In a separate eight-run Tactical-versus-Casual cohort with the same 480-action cutoff, Tactical recorded 36 actual declared shots and 13 goals, versus 8 shots and 3 goals for Casual. Tactical's goal origins were 6 in the keeper box, 5 in the central approach, and 2 wide close: 11 of 13 (84.6%) came from the central files near goal. Scorers were Q 5, N 6 and R 2. No Tactical shot exceeded six physical squares. The different policies and opponents make this a description of observed spatial play, rather than a like-for-like comparison with Casual selfplay.

A matched whole-release comparison ran the old version-25 engine on the same 32 Casual seeds, kickoffs and 480-action cutoff. The old build produced 431 actual shots and 144 goals, versus 361 and 83 after the update. Wide end-line origins fell from 35/144 goals (24.3%) to 12/83 (14.5%); all wide-file origins fell from 114/144 (79.2%) to 51/83 (61.4%). The central approach increased from 14/144 (9.7%) to 20/83 (24.1%). Origins whose visible opening was less than half that of a central shooter at the same depth supplied 69.4% of old goals and 39.8% of new goals. This compares the whole release, including Casual finishing and own-half stalling, rather than isolating the angle coefficient. The narrower old/new sample of absolute openings below 30 degrees changed more modestly, from 16.7% to 14.5%.

The spatial studies above used shot model 9. Model 10 subsequently adds the requested wide-opening finishing bonus; those recorded distributions are historical measurements rather than fresh model-10 predictions.
