# Balanced handcrafted Tactical candidate

`engine-25.mjs` is immutable candidate SHA-256 `18890a5b0ffbd07f9a446299615bf0da7e2623c17ba06a9896b253b3f03e9327`.

It combines the frozen v40 rules/search with attack lane clearing, native-piece second-ball approach/evaluation, the fifth-self-collection pace guard, and the 55% credible-finish gate. It does **not** contain the search-quiescence q1 modification or any learned residual. The carried-possession leaf scale is 0.25 rather than 0.35. Loose-ball/corner scales, material and keeper values are unchanged. The exact old immediate tackle-risk cost is restored after the carried-possession term:

```js
value += sign * possession * 0.25;
value -= sign * risk * (kickNow || !challengePending ? 0 : canEscape ? 65 : 520) * (0.35 - 0.25);
```

The initially requested scale 0.20 candidate is preserved as `engine.mjs` but rejected by the superior-receiver regression: it takes a 7.95% direct shot rather than pass to a receiver with an 85.04% immediate chance. Following both sides' full actual Tactical positioning turns still leaves that receiving attack a 37.78% shot, so the pass is materially better. Both 0.25 and 0.28 variants restore the pass. The selected prototype uses 0.25; `engine-28.mjs` remains a separate unbenchmarked alternative.

Checks on the .25 candidate:

- 28/28 existing AI regressions: pawn bonus traps, crossing support, chance creation, superior receiving passes, dribble pace and unchanged Casual finishing.
- 2/2 mirrored shot-lane-clearing checks, including planning purity, legality and independence of hidden RNG.
- 16/16 security-cost checks covering both colors, foul modes, direct tackles and bonus-pawn tackle setups. The original defensive challenge cost is 182 without fouls or 163.8 with fouls; the original available-escape discount is also preserved exactly.

Reports/logs are in this directory and `../attack-candidate/`. Gameplay outcome claims require the common root 480-action benchmark; no independent full-match win claim is made here.
