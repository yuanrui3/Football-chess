# Tactical attack branch review

This branch changes policy only. Rules, Casual move selection, hidden randomness, learned weights and the production 1,400-node budget remain unchanged.

## Lane clearing (v1)

An attacking off-ball move was rewarded for opening receiving outlets, improving crossing support or reducing tackle exposure. Its rank did not value opening the carrier's own shot when a friendly player occupied the ray. Both root and inner Tactical ordering now include the difference in the carrier's exact shooting chance, with the opponent's best legal keeper reaction included. This changes candidate ordering, not shot probabilities.

Concrete mirrored fixture: queen on g14, onside bishop on g15 and a defending rook on m16 keeping the bishop onside. The carrier initially has no legal shot. The former first-ranked move shifts an unrelated support piece and leaves the finish unavailable. The new first-ranked move vacates the bishop; the legal keeper-reacted shot becomes 78.94%. The corresponding black-side fixture also passes. This is distinct from clearing an offside player from the box.

Files: `engine-opening-v1.mjs`, minimal diff `attack-opening-v1.patch`.

Validation: `attack-v1-tests.log`: 30/30 tests passed, covering lane clearing, legality, public-state purity, hidden-seed independence, unchanged Casual decisions, the pawn bonus trap, crossing support, and preserving a superior receiving finish.

Dev screen: common seed 610017, both Tactical colors and both kickoff colors, 160 atomic actions per scenario, fouls enabled, frozen Casual opponent. All four were draws, with candidate shots 7–1 and xG 1.5892–0.0756. These short scenarios are insufficient to claim a scoring improvement; the root combined candidate requires 480-action evaluation.

## Credible finish gate (v2)

A separate root-only gate cashes a legal opponent-goal shot worth at least 55% after the keeper's best reaction, unless an onside immediate receiving outlet is more than five percentage points better. Weak shots still compete normally; the existing superior-receiver passing regression passes. All phases retain normal legal-action validation.

QA found a real horizon failure: a rook on h11 has a 67.695% legal finish but the previous search chooses a self-pass to h14. A real Tactical defender then uses its shared king bonus and ordinary king move before the next shot, reducing that later finish to 23.139%. The .55 gate takes the existing finish. `attack-finishing-probe.json` records both reports, identical node limits, purity and seed-independence assertions.

Files: `engine-finish-55.mjs`, independent diff against v1 `attack-finish-55.patch`. `attack-finish55-tests.log`: 30/30 selected tests passed. The separate .50 gate dev experiment in `../attack-finish-v2/` is an ablation, not the exact .55 release candidate.

## Rejected variant

The v3 branch multiplied wide-isolation leaf/ranking terms while retaining v1 and a .50 finishing gate. Its first 160-action dev scenario had lower xG than baseline and the existing pawn-trap test failed productive advance. That run was stopped after one scenario and is not proposed for integration. The failure and partial result remain recorded. A possession-scale v4 file was prepared but never benchmarked; root already tests a separate combined possession-scale ablation.
