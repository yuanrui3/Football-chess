# Flexible attacking exercises with explicit turnover feedback

The original three- or four-round study limits remain in force, including four rounds for Exercise 33. Any legal route meeting the existing chance-quality target earns credit. Example steps and coaching themes do not constrain success.

Attacking studies now continue after possession loss or a sub-target shot while rounds remain. Native catches, wide shots, corners and rebounds retain their actual positions so the student can recover and try again. A conceded goal, own-goal attempt, ended match or exhausted study budget still ends the attempt. A qualifying last-round shot is resolved and graded before applying the round limit. Defensive grading remains based on all available immediate threats and the actual keeper response.

A visible continuation card explains the actual engine event. Tackles name challenger, carrier, contact square and landing square; interceptions name receiver and square; offside names the offender and offence square, including the special box-knight involvement rule. Catches, parries, wide shots and blocked shots are distinguished. Possession-rule infringements name the violated rule and explain that it is separate from the study round limit. The notice survives automatic opponent replies until the next human action. Last-action captions share the same event descriptions, so an offside kick is no longer labelled an ordinary completed pass.

No reconstruction of the user's historical Exercise 33 turnover was available; this update does not assert that a keeper challenge, offside or round limit caused it.

Validation: `node --test --test-reporter=tap tests/exercise*.test.mjs` (full exercise catalog, controller, AI and session suites). Native regression fixtures cover a turnover/recovery/qualifying finish within three rounds, legal offside and interceptions with continuation, all four non-goal weak-shot outcomes, unchanged retry budgets, last-round grading and an own-half progress infringement inside a four-round study.

Result: 170/170 tests passed. Browser QA on Exercise 33 confirmed the four-round cap, a sub-target shot continuing with normal controls, Undo returning to the prior position and original round count, and an interception at i13 showing the correct bishop/square while the exercise remains active at 1/4 rounds. The explanation remains visible after the opponent repositions. `preview.jpg` records that continuation view.
