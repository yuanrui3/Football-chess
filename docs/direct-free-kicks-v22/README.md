# Direct free-kick finishing — rules 22 / shot model 18

Opponent-goal shots taken directly from a freeKick restart multiply their ordinary final goal probability by two, capped at 100%. The ordinary calculation still includes piece geometry, distance, angle, blockers and goalkeeper positioning. All non-goal outcome masses scale proportionally so the distribution remains valid. Penalties retain fixed 80% conversion. Corners, indirect restarts, open play, own-goal attempts and shots after a restart pass receive no bonus.

A directFreeKick flag on the pending shot retains provenance after the restart is consumed. Native resolution, each keeper reaction preview, disguised endpoints, Tactical chance branches and save/reload use the same shot model. Earlier in-flight saves without provenance are not guessed to be direct free kicks. The handbook, restart guide and shot details explain the bonus.

400 targeted tests passed. Coverage includes every piece type and both teams, all legal keeper reactions, walls and distance, 100% saturation and probability conservation, pass expiry, exclusions, save/reload, xG in player records, disguised shots and Tactical branches. Existing engine, shot-blocking, keeper, foul, replay, statistics and rating tests also passed. Replay tests for ordinary cards now explicitly include a covering defender, as required by rules 21.

Browser QA confirmed a 15.9027737% ordinary position displays 31.8055474% for the direct free kick, retains 31.8% at declaration, and exposes the ×2 label and reaction odds. Screenshot: preview.jpg. Temporary local fixture page was removed before packaging.
