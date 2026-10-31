# Play exercise after solution playback

## Cause and correction

In version 73, switching exercises while solution playback was open called leaveSolution with resume=false. The controller intentionally preserves suspension across load, so the newly selected exercise stayed suspended. Play exercise silently returned false and all board cells stayed disabled.

After loading a selected exercise, the page now resumes its controller if the page is visible and filters permit play. Hidden-page and empty-filter pauses remain respected. Existing attempt restoration is unchanged.

## Reproduction and browser validation

- Reproduced on live version 73: open solution playback, select exercise 30 in the library, click Play exercise. The button remained visible, all cells stayed disabled, and no error appeared.
- Fixed preview: the same sequence hides Play exercise, shows PASS / SHOOT, enables the board and permits the goalkeeper g1 to rook g8 pass.
- Open solution and return to an in-progress exercise 30: all occupied-square labels, the ball carrier, status text and round counter restored exactly.
- Let exercise 1 solution finish, click Next exercise, then Play exercise: exercise 2 starts normally, with F/H shot targets available at 51%.
- `node --test --test-concurrency=2 tests/exercise*.test.mjs`: 213 tests passed, 0 failed.
- `git diff --check`: passed.
- No changes to game rules, exercise objectives or saved progress.

Screenshot: interface.jpg.
