import test from 'node:test';
import assert from 'node:assert/strict';
import {E, fixture, model, point, pieceId, clone} from './helpers/shot-fixture.mjs';

const close = (a, b, label = '') => assert.ok(Math.abs(a - b) < 1e-12, `${label}: ${a} ≈ ${b}`);
const masses = m => [m.goalProbability, m.keeperCornerProbability, m.keeperReboundProbability,
  m.caughtSaveProbability, m.missProbability, m.blockOutProbability, m.blockPossessionProbability];
const heldGivenSave = m => m.saveProbability > 0 ? m.caughtSaveProbability / m.saveProbability : 0;
const goalAt = (team, file = 6) => point([file, -1], team);
function declare(state, file = 6, options = {}) {
  const aim = goalAt(state.attack, file);
  assert.ok(E.legalKicks(state).some(k => k.goal === state.attack && k.x === aim.x && k.y === aim.y));
  return E.applyKick(state, aim.x, aim.y, options);
}
function conserved(m) {
  assert.ok(masses(m).every(p => Number.isFinite(p) && p >= 0 && p <= 1));
  close(masses(m).reduce((a, b) => a + b, 0), 1);
  close(m.caughtSaveProbability + m.keeperCornerProbability + m.keeperReboundProbability, m.saveProbability);
  close(heldGivenSave(m), 1 - m.parryGivenSave);
}

for (const team of ['white', 'black']) {
  test(`${team}: an aligned rush greatly reduces holding among saves without changing the established xG`, () => {
    // Model 16 goal odds for this native legal rook shot, before handling risk
    // was added. These are fixed positions, not extra reaction allowances.
    const establishedXG = [.19010532846021905, .17584742882570267, .15630882562284676];
    const models = [0, 1, 2].map(depth => {
      const state = fixture({team, type: 'R', origin: [6, 4], keeper: [6, depth]}), before = clone(state);
      const m = E.shotModel(declare(state));
      assert.deepEqual(state, before, 'previews preserve state and randomness');
      close(m.goalProbability, establishedXG[depth], 'handling does not change scoring odds');
      conserved(m);
      return m;
    });
    const holds = models.map(heldGivenSave);
    assert.ok(holds[0] > .63 && holds[0] < .64);
    assert.ok(holds[1] > .40 && holds[1] < .42);
    assert.ok(holds[2] > .10 && holds[2] < .13);
    assert.ok(holds[0] > holds[1] && holds[1] > holds[2]);
    assert.ok(holds[2] < holds[0] / 4, 'a near smother is much harder to hold securely');
    for (const m of models) {
      close(m.keeperReboundProbability, m.saveProbability * m.parryGivenSave * .20);
      close(m.keeperCornerProbability, m.saveProbability * m.parryGivenSave * .80);
    }
  });

  test(`${team}: rushed saves resolve into catch, loose ball and corner with the advertised masses`, () => {
    const pending = declare(fixture({team, type: 'R', origin: [6, 4], keeper: [6, 2]}));
    const before = clone(pending), m = E.shotModel(pending);
    const branches = [
      [m.goalProbability + m.keeperCornerProbability / 2, 'corner'],
      [m.goalProbability + m.keeperCornerProbability + m.keeperReboundProbability / 2, 'loose'],
      [m.goalProbability + m.keeperCornerProbability + m.keeperReboundProbability + m.caughtSaveProbability / 2, 'saved']
    ];
    for (const [roll, outcome] of branches) {
      const result = E.skipMove(pending, {roll});
      assert.equal(result.lastAction.type, 'save');
      assert.equal(result.lastAction.outcome, outcome);
      assert.deepEqual(result.lastAction.shotModel, m);
      if (outcome === 'loose') assert.equal(result.ball.carrierId, null);
      if (outcome === 'corner') assert.equal(result.restart.type, 'corner');
      if (outcome === 'saved') assert.equal(result.ball.carrierId, pieceId('black-K', team));
    }
    assert.deepEqual(pending, before);
    conserved(m);
  });

  test(`${team}: rushing handling risk vanishes on the goal line, at range, behind the shooter and outside the box`, () => {
    for (const [origin, keeper] of [
      [[6, 4], [6, 0]], [[6, 8], [6, 2]], [[6, 1], [6, 2]], [[6, 4], [6, 3]]
    ]) {
      const m = model(fixture({team, type: 'R', origin, keeper}));
      close(m.rushParryBonus, 0);
      if (m.saveProbability > 0) conserved(m);
    }
    const near = model(fixture({team, type: 'R', origin: [6, 4], keeper: [6, 2]}));
    const wrongAngle = model(fixture({team, type: 'R', origin: [6, 4], keeper: [9, 2]}));
    assert.ok(wrongAngle.rushParryBonus < near.rushParryBonus / 1000);
  });

  test(`${team}: a very close smother respects the parry cap and retains a catch branch`, () => {
    const m = model(fixture({team, type: 'R', origin: [6, 3], keeper: [6, 2]}));
    close(m.parryGivenSave, .90);
    close(heldGivenSave(m), .10);
    assert.ok(m.caughtSaveProbability > 0);
    conserved(m);
  });

  test(`${team}: penalties still have fixed eighty-percent goals and clean catches for the remaining saves`, () => {
    const state = fixture({team, type: 'R', origin: [6, 3], keeper: [6, 2]});
    state.restart = {type: 'penalty', team, takerId: pieceId('white-R1', team), spot: {...state.ball}, indirect: false};
    const m = E.shotModel(declare(state));
    close(m.goalProbability, .8); close(m.caughtSaveProbability, .2);
    close(m.rushParryBonus, 0); close(m.parryGivenSave, 0);
    close(m.keeperReboundProbability, 0); close(m.keeperCornerProbability, 0);
    close(heldGivenSave(m), 1); conserved(m);
  });

  for (const type of ['Q', 'N']) {
    test(`${team} ${type}: disguised handling is save-weighted across the public possibilities`, () => {
      const state = fixture({team, type, origin: [6, 1], keeper: [6, 0]});
      const targets = E.disguisedShotTargets(state);
      assert.equal(targets.length, 2);
      const pending = E.applyKick(state, targets[0].x, targets[0].y, {disguise: true});
      const keeper = point([type === 'Q' ? 7 : 5, 1], team);
      assert.ok(E.legalMoves(pending, pieceId('black-K', team)).some(m => m.x === keeper.x && m.y === keeper.y));
      const mixed = E.shotModel(pending, pending.pendingShot.x, pending.pendingShot.y, keeper);
      const endpoints = targets.map(target => E.shotModel(E.applyKick(state, target.x, target.y), target.x, target.y, keeper));
      for (const key of ['saveProbability', 'caughtSaveProbability', 'keeperReboundProbability', 'keeperCornerProbability', 'goalProbability']) {
        close(mixed[key], (endpoints[0][key] + endpoints[1][key]) / 2, key);
      }
      close(heldGivenSave(mixed), endpoints.reduce((sum, m) => sum + m.caughtSaveProbability, 0)
        / endpoints.reduce((sum, m) => sum + m.saveProbability, 0));
      conserved(mixed);
    });
  }
}

test('invalid shot metadata reports no rush handling bonus', () => {
  const m = E.shotModel(null);
  assert.equal(m.rushParryBonus, 0);
  assert.equal(m.caughtSaveProbability, 0);
});
