# Locked-policy held-out comparison

Status: **complete (8/8 candidate legs)**. Generated 2026-10-17T06:44:44.610572+00:00.

The candidate was locked at 2026-10-17T06:36:52Z with SHA-256 `4388dc612b14feb2b266dc5389e1f95228c68e994bcabbcfd39c21a5e4d880f3` before any frozen test outcomes were inspected. No policy retuning is included in this report.

Both policies are evaluated against the same frozen production Casual opponent, using exactly matched seed/color/kickoff legs. Actual transitions use the same production rules 19 / shot 15 module. Tactical uses 1,400 nodes/depth 8, learned weights are null, and fouls are enabled.

| Policy | W/D/L | Goals | Shots | xG | Stalls | Mean/p95 decision ms | Max nodes |
|---|---:|---:|---:|---:|---:|---:|---:|
| Frozen production Tactical | 5/3/0 | 10–4 | 71–14 | 11.976–4.103 | 1 | 615/1229 | 1400 |
| Locked candidate | 3/5/0 | 13–4 | 85–8 | 12.367–1.997 | 0 | 601/1116 | 1400 |

Only the control legs matching the currently completed candidate legs appear above. The complete control has 8/8 legs; partial candidate results must not be presented as a final test.

| Action checkpoint | Frozen goals | Candidate goals | Frozen shots/xG | Candidate shots/xG |
|---|---:|---:|---:|---:|
| 160 | 3–0 | 2–1 | 18–2 / 2.632–0.165 | 24–3 / 3.095–0.646 |
| 200 | 5–0 | 4–1 | 24–4 / 4.262–1.150 | 33–3 / 4.320–0.646 |
| 240 | 5–1 | 7–1 | 34–5 / 5.949–1.950 | 42–3 / 5.603–0.646 |
| 480 | 10–4 | 13–4 | 71–14 / 11.976–4.103 | 85–8 / 12.367–1.997 |

## First goals and validation

- Frozen first-goal actions: [276, 96, 83, 330, 198, 96, None, 165]; conditional median 165; scoreless legs 1.
- Candidate first-goal actions: [173, 226, 66, 115, 320, 264, None, 391]; conditional median 226; scoreless legs 1.
- Recorded legality/state/purity/node/horizon failures: frozen 0, candidate 0.

`null` first-goal entries mean the side did not score within that scenario. Conditional medians exclude them.

## Limits

The planned eight scenarios come from only two independent seeds; the four color/kickoff legs per seed are correlated. This is exploratory evidence, not a reliable general Elo estimate or proof of universal strength. All results here use fouls ON. No separate head-to-head tournament against frozen Tactical or fouls OFF tournament is claimed.

Fixed-action horizons differ from a timed game. Roughly 200 actions fit a ten-minute/three-second pace before animation and clock effects. Computation overlapping the UI pause changes live pace independently of this fixed-action comparison. Different background CPU loads limit relative-speed claims. Earlier goals reset formations and change later cumulative xG trajectories.

Final promotion/strength claim and final full-suite validation remain the parent task’s decision. See `selected-policy-lock.json`, per-batch configurations, immutable engine snapshots and individual match recordings for reproduction.
