import test from 'node:test';
import assert from 'node:assert/strict';
import {E, fixture, model, point, pieceId, clone} from './helpers/shot-fixture.mjs';

const close = (a, b, label = '') => assert.ok(Math.abs(a - b) < 1e-10, `${label}: ${a} ≈ ${b}`);
const masses = m => [m.goalProbability, m.keeperCornerProbability, m.keeperReboundProbability,
  m.caughtSaveProbability, m.missProbability, m.blockOutProbability, m.blockPossessionProbability];
function conserved(m) {
  assert.ok(masses(m).every(p => Number.isFinite(p) && p >= 0 && p <= 1));
  close(masses(m).reduce((a, b) => a + b, 0), 1, 'disjoint outcomes');
  close(m.saveProbability, m.keeperCornerProbability + m.keeperReboundProbability + m.caughtSaveProbability);
  assert.ok(m.saveGivenOnTarget <= E.SHOT_MODEL.boxMaxSave + 1e-12);
}
function declare(state, file = 6) {
  const aim = point([file, -1], state.attack);
  assert.ok(E.legalKicks(state).some(k => k.goal === state.attack && k.x === aim.x && k.y === aim.y));
  return E.applyKick(state, aim.x, aim.y);
}

for (const team of ['white', 'black']) {
  test(`${team}: a keeper closing an aligned rook one-on-one reduces goal odds at each step`, () => {
    for (const originY of [3, 4, 5, 6]) {
      const chances = [];
      for (const depth of [0, 1, 2]) {
        const state = fixture({team, type: 'R', origin: [6, originY], keeper: [6, depth]}), before = clone(state);
        const m = model(state), pending = declare(state);
        chances.push(m.goalProbability);
        close(E.shotChance(pending), m.goalProbability);
        assert.deepEqual(E.shotModel(pending), m);
        assert.deepEqual(state, before, 'preview/declaration preserve caller state and RNG');
        assert.equal(pending.randomState, state.randomState, 'a declaration draws no result');
        assert.equal(m.rushCoverage > 0, depth > 0 && m.keeperDistance < E.SHOT_MODEL.rushRange);
        conserved(m);
      }
      assert.ok(chances[0] > chances[1] && chances[1] > chances[2], `origin y=${originY}: ${chances.join(' > ')}`);
      assert.ok(chances[2] > 0, 'a close keeper is still beatable');
    }
  });

  test(`${team}: both AI levels choose the best legal reaction using the revised odds`, () => {
    const pending = declare(fixture({team, type: 'R', origin: [6, 4], keeper: [6, 0]}));
    const before = clone(pending), id = pieceId('black-K', team);
    const moves = E.legalMoves(pending, id), hold = E.shotChance(pending);
    const chances = moves.map(at => E.shotChance(pending, pending.pendingShot.x, pending.pendingShot.y, at));
    const best = Math.min(hold, ...chances);
    assert.ok(best < hold, 'a forward reaction improves on holding the goal line');
    for (const difficulty of ['casual', 'tactical']) {
      const action = E.chooseAIAction(pending, {difficulty});
      assert.equal(action.type, 'move');
      assert.equal(action.pieceId, id);
      assert.ok(moves.some(at => at.x === action.x && at.y === action.y));
      close(E.shotChance(pending, pending.pendingShot.x, pending.pendingShot.y, action), best);
    }
    assert.deepEqual(pending, before, 'AI inspection leaves the declared shot and RNG untouched');
  });

  test(`${team}: advancing preserves a set stance while actual flight still limits dive reach`, () => {
    for (const originY of [3, 4, 6]) {
      const held = model(fixture({team, type: 'R', origin: [6, originY], keeper: [6, 0]}));
      let previous = held;
      for (const depth of [1, 2]) {
        const rushed = model(fixture({team, type: 'R', origin: [6, originY], keeper: [6, depth]}));
        close(rushed.baseOnTargetProbability, held.baseOnTargetProbability, 'shooter accuracy stays unchanged');
        close(rushed.goalProbability / (1 - rushed.rushCoverage), held.goalProbability,
          'removing close-down coverage exposes the same on-axis set-stance saving ability');
        assert.ok(rushed.timeToKeeper < previous.timeToKeeper, 'a close keeper has less real ball flight time');
        assert.ok(rushed.reach < previous.reach, 'shorter flight still reduces available lateral diving');
        assert.ok(rushed.arrivalSpeed > previous.arrivalSpeed, 'a close stop faces a harder arrival');
        previous = rushed;
      }
    }
  });

  test(`${team}: rush reaction preview and actual resolution share the same probabilities`, () => {
    const pending = declare(fixture({team, type: 'R', origin: [6, 4], keeper: [6, 0]}));
    const before = clone(pending), id = pieceId('black-K', team), at = point([6, 1], team);
    assert.ok(E.legalMoves(pending, id).some(move => move.x === at.x && move.y === at.y));
    const preview = E.shotModel(pending, pending.pendingShot.x, pending.pendingShot.y, at);
    for (const [roll, expectedGoal] of [[preview.goalProbability / 2, true], [preview.goalProbability, false]]) {
      const result = E.applyMove(pending, id, at.x, at.y, {roll});
      assert.deepEqual(result.lastAction.shotModel, preview);
      close(result.lastAction.probability, preview.goalProbability);
      assert.equal(result.lastAction.type === 'goal', expectedGoal);
    }
    const restored = E.normalizeGame(clone(pending));
    close(E.shotChance(restored, pending.pendingShot.x, pending.pendingShot.y, at), preview.goalProbability);
    assert.deepEqual(E.applyMove(restored, id, at.x, at.y, {roll: .5}), E.applyMove(pending, id, at.x, at.y, {roll: .5}));
    assert.deepEqual(pending, before);
  });

  test(`${team}: closing the wrong angle does not grant the aligned keeper's coverage`, () => {
    const aligned = model(fixture({team, type: 'R', origin: [6, 4], keeper: [6, 2]}));
    const stranded = model(fixture({team, type: 'R', origin: [6, 4], keeper: [9, 2]}));
    assert.ok(stranded.keeperInBox && aligned.keeperInBox);
    assert.ok(stranded.goalProbability > aligned.goalProbability + .5, 'a poorly covered angle remains exposed');
    assert.ok(stranded.rushCoverage < aligned.rushCoverage / 1000);
    for (const m of [aligned, stranded]) conserved(m);
  });

  test(`${team}: goal-line, distant, bypassed and outside-box keepers gain no rush bonus`, () => {
    const line = model(fixture({team, type: 'R', origin: [6, 4], keeper: [6, 0]}));
    const distant = model(fixture({team, type: 'R', origin: [6, 8], keeper: [6, 2]}));
    const bypassed = model(fixture({team, type: 'R', origin: [6, 1], keeper: [6, 2]}));
    const outside = model(fixture({team, type: 'R', origin: [6, 4], keeper: [6, 3]}));
    for (const m of [line, distant, bypassed, outside]) { close(m.rushCoverage, 0); conserved(m); }
    close(bypassed.saveProbability, 0);
    close(outside.saveProbability, 0);
    assert.deepEqual(outside.blockerIds, [pieceId('black-K', team)], 'an outside king retains only ordinary body blocking');
    close(outside.blockProbability, E.SHOT_MODEL.blockPerDefender);
  });

  test(`${team}: penalties keep fixed eighty-percent scoring despite rushing`, () => {
    for (const depth of [0, 1, 2]) {
      const state = fixture({team, type: 'R', origin: [6, 3], keeper: [6, depth]});
      state.restart = {type: 'penalty', team, takerId: pieceId('white-R1', team), spot: {...state.ball}, indirect: false};
      const m = model(state), pending = declare(state);
      close(m.goalProbability, .8); close(m.saveProbability, .2); close(m.rushCoverage, 0);
      assert.equal(E.skipMove(pending, {roll: .799999}).lastAction.type, 'goal');
      assert.equal(E.skipMove(pending, {roll: .8}).lastAction.type, 'save');
      conserved(m);
    }
  });

  for (const type of ['Q', 'N']) {
    test(`${team} ${type}: disguised shots fairly average rush coverage at both public endpoints`, () => {
      const state = fixture({team, type, origin: [6, 1], keeper: [6, 0]}), before = clone(state);
      const options = E.disguisedShotTargets(state);
      assert.equal(options.length, 2);
      const pending = E.applyKick(state, options[0].x, options[0].y, {disguise: true});
      const at = point([type === 'Q' ? 7 : 5, 1], team), id = pieceId('black-K', team);
      assert.ok(E.legalMoves(pending, id).some(move => move.x === at.x && move.y === at.y));
      const mixed = E.shotModel(pending, pending.pendingShot.x, pending.pendingShot.y, at);
      const ordinary = options.map(option => E.shotModel(E.applyKick(state, option.x, option.y), option.x, option.y, at));
      assert.ok(ordinary.some(m => m.rushCoverage > 0), 'at least one aimed lane faces close keeper coverage');
      for (const key of ['goalProbability', 'saveProbability', 'rushCoverage', 'missProbability']) {
        close(mixed[key], (ordinary[0][key] + ordinary[1][key]) / 2, key);
      }
      for (const m of [mixed, ...ordinary]) { conserved(m); assert.equal(m.blockProbability, 0); }
      for (const [targetRoll, index] of [[.25, 0], [.75, 1]]) {
        const result = E.applyMove(pending, id, at.x, at.y, {roll: 0, targetRoll});
        assert.deepEqual(result.lastAction.shotModel, ordinary[index]);
      }
      assert.deepEqual(state, before);
    });
  }
}

test('rush coverage and all outcome masses are symmetric under rotation and reflection', () => {
  for (const [x, y, kx, ky] of [[6, 4, 6, 1], [5, 3, 6, 2], [7, 2, 8, 1]]) {
    const a = model(fixture({type: 'R', origin: [x, y], keeper: [kx, ky]}), x);
    const rotated = model(fixture({team: 'black', type: 'R', origin: [x, y], keeper: [kx, ky]}), x);
    const reflected = model(fixture({type: 'R', origin: [13 - x, y], keeper: [13 - kx, ky]}), 13 - x);
    for (const b of [rotated, reflected]) {
      for (const key of ['goalProbability', 'saveProbability', 'rushCoverage', 'keeperDistance', 'keeperPathDistance']) close(a[key], b[key], key);
      masses(a).forEach((p, i) => close(p, masses(b)[i]));
    }
  }
});
