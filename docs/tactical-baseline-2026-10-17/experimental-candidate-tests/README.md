# Experimental candidate regressions

These 14 checks cover the unpromoted round-one candidate (engine SHA-256 4388dc612b14feb2b266dc5389e1f95228c68e994bcabbcfd39c21a5e4d880f3). They are preserved with that exact engine, rather than changing expectations for the released baseline policy. Existing production regression assertions were retained; the frozen handwritten-value equality test was restored when the trial evaluation was excluded.

Run from the repository root:

```sh
node --test docs/tactical-baseline-2026-10-17/experimental-candidate-tests/tests/*.test.mjs
```
