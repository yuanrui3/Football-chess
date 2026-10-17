# One-hour training results

**No safe improvement over frozen Tactical has been demonstrated yet. Final held-out evaluation is pending.** The promising reduced-budget result failed production-budget development confirmation. Baseline Tactical should remain the default unless the final promotion gate passes.

## Completed development evaluations

Every row is **DEV**: eight **120-action scenarios**, after an excluded 80-action Casual warm-up. Two seeds each supply four color/kickoff legs. Both policies receive the stated nodes, depth 8 and extensions; fouls are enabled. W/D/L describes the candidate. These are artificial-horizon scenarios, not full football matches; pending shots always resolve.

| DEV candidate | Nodes per decision | W / D / L | WDL score | Goals, candidate–baseline | xG, candidate–baseline | Source JSON |
|---|---:|---:|---:|---:|---:|---|
| Seven features, checkpoint 8, S80 | 256 | 0 / 8 / 0 | 50.00% | 1–1 | 0.14–0.76 | `dev7-0008.json` |
| 28 features, checkpoint 24, S80 | 256 | 0 / 7 / 1 | 43.75% | 0–1 | 0.66–1.20 | `dev28-0024.json` |
| 28 features, checkpoint 64, S80 | 256 | 1 / 6 / 1 | 50.00% | 1–1 | 1.62–2.21 | `dev28-0064.json` |
| 28 features, production-search fine-tune, S80 | 256 | 1 / 7 / 0 | 56.25% | 1–0 | 0.86–0.98 | `dev28-full8.json` |
| 28 features, fresh checkpoint 8, S320 | 256 | 0 / 7 / 1 | 43.75% | 0–1 | 0.59–1.74 | `dev28-S320-0008.json` |
| 28 features, search-backup checkpoint 8, S320 | 256 | 0 / 8 / 0 | 50.00% | 0–0 | 0.90–0.72 | `dev28-search8.json` |
| Same S80 fine-tuned candidate, production confirmation | **1,400** | **0 / 5 / 3** | **31.25%** | **0–3** | **1.08–1.37** | `dev-production-full80.json` |
| S320 search-backup candidate, production confirmation | **1,400** | **0 / 7 / 1** | **43.75%** | **0–1** | **1.55–1.04** | `dev-production-search8.json` |
| 37 features, S320 shot-aware candidate | **1,400** | **1 / 7 / 0** | **56.25%** | **1–0** | **0.66–0.00** | `dev-production-shot37.json` |

The 256-node screens use seeds `320017,320041`; production confirmation uses `320083,320123`. Positions and budget both change, so this does not isolate deeper search's effect. Nevertheless, **1 win, 7 draws, 0 losses at reduced budget does not establish stronger deployed play**. All evaluations report zero legality/integrity errors; some candidates incur extra stalling/offside offences.

## Experience and interpretation

The completed-run audit records **170 segments, 72,644 trained actions, 157 actual goal rewards, 90 baseline-opponent segments and 1,624 auxiliary search-backup updates**. It counts completed rollouts once, excludes unfinished work, and separately records 2,240 warm-up actions. All 170 environment seeds are unique. These totals span branches; no individual checkpoint learned from every action.

Weights genuinely learn, but handcrafted move ranking and Tactical search remain substantial priors. Seven-feature inputs summarize possession, progress, material and positional control; 28-feature inputs add phase, budgets, exposure and receiving geometry. Center control and open files receive no standalone reward. The 37-feature family adds piece identity and exact public shooting/outlet metrics; its fresh held-out results are pending.

Different tactical positions can share a compact feature vector, forcing one residual onto situations needing different moves. Context reduces some aliasing but cannot express arbitrary threat combinations. The tanh residual is bounded to ±80 or ±320 evaluation points; a goal is worth 2,000. Only 157 realized goals across all branches supply sparse, noisy outcome evidence. Most training also uses cheaper searches than deployment. More segments or larger scale alone cannot establish improvement. Auxiliary search fitting may reproduce existing search biases. These are plausible limitations, not experimentally isolated causes of failure.

## Observed DEV behavior

Production `search8` created nine shots and 1.55 xG against baseline's eight and 1.04, but converted none: four were saved and five missed. Baseline scored once. Its lack of wins therefore does not reflect worse recorded chance creation. `full80` also took nine shots against seven, but average quality was lower (.120 versus .196 xG/shot); five were saved, two missed and two were blocked, producing a 0–3 scoreline. Each candidate had two shotless scenarios. Neither triggered stalling, repetition or dribble-limit penalties; `search8` had one offside and `full80` none. Pass/dribble counts were 67/44 versus 70/45 for `search8`, and 53/39 versus 85/55 for `full80`. All four policy totals recorded two tackles each. Event counts do not measure elapsed possession, so they cannot establish a possession-holding rate. These two-seed samples show limited shot volume and unsuccessful conversion; they do not isolate tactical weakness from outcome variance.

## Candidate selection and lock

The 37-feature S320 candidate had the highest production DEV WDL score among the three candidates tested on common seeds `320083,320123`, followed by the S320 search-backup candidate and S80 fine-tune. Selection follows the declared order: WDL, goal difference, then xG difference. The candidate was locked at **2026-10-17 00:45:39.605353 UTC**, after completed DEV results and before the fresh final test.

- Checkpoint SHA256: `18c42fe6a0ed25b567dcb31a2acc45c18bc1c4bcfc56d0a727196c7d4b0fd869`.
- Engine SHA256: `cebd6fa0cc52bddc0ee03bb05aa703645ba3a6c63a417883d2cda694a0cc87fb`.

Independent static checks matched the lock to actual checkpoint/engine bytes, DEV provenance, frozen baseline, feature count, scale, training partitions and declared final seeds. The engine diff adds learned evaluation and option plumbing without changing legal actions or rule transitions. The final candidate cannot be swapped or retuned after seeing test results.

This DEV result contains only **four candidate shots and zero baseline shots**, across eight short scenarios. Its seed-cluster WDL interval is `[.50,.625]`; goal-difference interval `[0,.25]`. Neither excludes parity, and 56.25% is below the final 60% threshold. Suppressing recorded shots here is promising but does not establish robust strength or satisfy the shot-evidence requirement.

## Final held-out decision

**Not promoted. Baseline Tactical remains the default.** The final evaluation process stopped before completing its planned 32 scenarios; its execution session was no longer available. The retained log contains **13 completed 120-action scenario summaries: 0 wins, 12 draws, 1 loss, goals 0–1** for the locked 37-feature candidate. These are partial observations, not a completed benchmark. The process did not write aggregate shot statistics or confidence intervals, so they are unavailable; the strict promotion gate is not satisfied. No checkpoint was changed or selected using these test observations.

The best development result was 1 win, 7 draws and no losses, but that did not establish stronger play on fresh seeds. The selected checkpoint remains available through the optional experimental Self-play model control, initially off. It learned from 32 cumulative segments and 10,241 TD transitions; the experiment-wide 170-segment total spans multiple branches.

The final installed source passed **1,074/1,074 regression tests**, 53 focused release checks, 14 model-enabled pawn/crossing regressions and four actual versioned-worker/main-thread round trips. Static imports and page asset references resolve. Managed browser tooling was unavailable, so this is code and worker verification, not a visual browser test.

The preserved `final-heldout.log`, `final-heldout-incomplete.json`, `selection-lock.json`, checkpoint, frozen engines and protocol make the incomplete status explicit and allow the exact locked comparison to be rerun. The outcome of this bounded training effort is an improved learning pipeline and a promising development candidate, **not a demonstrated safe win over baseline Tactical**.
