import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../dist/engine.js';

const clone = structuredClone;
const other = team => team === 'white' ? 'black' : 'white';
const close = (a, b, message) => assert.ok(Math.abs(a - b) < 1e-10, `${message || ''}: ${a} ≈ ${b}`);
function fixture({team = 'white', blockers = 0, shooter = 'R1', origin = [5, 6], positions = {}} = {}) {
  const s = E.createGame({seed: 7081});
  const assigned = {'white-K': [8, 15], 'black-K': [6, 1], [`white-${shooter}`]: origin,
    ...(blockers > 0 ? {'black-N1': [5, 3]} : {}), ...(blockers > 1 ? {'black-N2': [5, 1]} : {}), ...positions};
  const used = new Set(Object.values(assigned).map(p => p.join(',')));
  assert.equal(used.size, Object.keys(assigned).length);
  const parking = Array.from({length: E.BOARD_HEIGHT}, (_, y) => [[0, y], [E.BOARD_WIDTH - 1, y]]).flat();
  for (const p of s.pieces) {
    const q = assigned[p.id] || parking.find(q => !used.has(q.join(',')));
    assert.ok(q); [p.x, p.y] = q; used.add(q.join(','));
  }
  s.phase = 'kick'; s.attack = 'white'; s.restart = null; s.offside = null;
  const carrier = s.pieces.find(p => p.id === `white-${shooter}`);
  s.ball = {x: carrier.x, y: carrier.y, carrierId: carrier.id};
  s.ballProgress = {team: 'white', anchorY: carrier.y, rounds: 0, pendingRelease: false, excludeRelease: false};
  if (team === 'black') {
    const swapId = id => id?.replace(/^(white|black)/, other) ?? null;
    s.pieces = s.pieces.map(p => ({...p, id: swapId(p.id), team: other(p.team), x: E.BOARD_WIDTH - 1 - p.x, y: E.BOARD_HEIGHT - 1 - p.y}));
    s.ball = {x: E.BOARD_WIDTH - 1 - s.ball.x, y: E.BOARD_HEIGHT - 1 - s.ball.y, carrierId: swapId(s.ball.carrierId)};
    s.attack = 'black'; s.ballProgress.team = 'black'; s.ballProgress.anchorY = E.BOARD_HEIGHT - 1 - s.ballProgress.anchorY;
  }
  return s;
}
const target = (team, x = 5, y = -1) => team === 'white' ? {x, y} : {x: E.BOARD_WIDTH - 1 - x, y: E.BOARD_HEIGHT - 1 - y};
function declare(s, p = target(s.attack)) {
  assert.ok(E.legalKicks(s).some(k => k.x === p.x && k.y === p.y && k.goal));
  const before = clone(s), pending = E.applyKick(s, p.x, p.y);
  assert.deepEqual(s, before); assert.equal(pending.phase, 'keeperReact'); assert.equal(pending.randomState, s.randomState);
  return pending;
}
function masses(m) { return [m.goalProbability, m.keeperCornerProbability, m.caughtSaveProbability, m.missProbability, m.blockOutProbability, m.blockPossessionProbability]; }
function integrity(s) {
  assert.equal(s.pieces.length, 22); assert.equal(new Set(s.pieces.map(p => `${p.x},${p.y}`)).size, 22);
  for (const p of s.pieces) assert.ok(E.canOccupySquare(p, p.x, p.y));
  if (s.ball.carrierId) { const p = s.pieces.find(p => p.id === s.ball.carrierId); assert.deepEqual(s.ball, {x: p.x, y: p.y, carrierId: p.id}); assert.equal(s.attack, p.team); }
}

test('shot blocking has an explicit tunable model and safe invalid metadata', () => {
  assert.equal(E.SHOT_MODEL.version, 13); assert.equal(E.SHOT_MODEL.blockPerDefender, .45); assert.equal(E.SHOT_MODEL.blockCornerShare, .85);
  const m = E.shotModel(null); assert.deepEqual(m.blockerIds, []); assert.deepEqual(m.blockerPositions, []);
  for (const key of ['blockProbability', 'blockOutProbability', 'blockCornerProbability', 'blockPossessionProbability', 'keeperCornerProbability']) assert.equal(m[key], 0);
  close(masses(m).reduce((a, b) => a + b, 0), 1);
});

for (const team of ['white', 'black']) {
  test(`${team}: zero, one and two defenders multiply unblocked goal/save/miss mass without changing geometry`, () => {
    const models = [0, 1, 2].map(blockers => E.shotModel(declare(fixture({team, blockers}))));
    for (const [n, m] of models.entries()) {
      close(m.blockProbability, 1 - .55 ** n); close(m.blockOutProbability, m.blockProbability * .85);
      close(m.blockPossessionProbability, m.blockProbability * .15); close(m.cornerProbability, m.keeperCornerProbability + m.blockCornerProbability);
      close(masses(m).reduce((a, b) => a + b, 0), 1); close(m.goalProbability + m.saveProbability + m.missProbability + m.blockProbability, 1);
      close(m.onTargetProbability, m.goalProbability + m.saveProbability); close(m.saveProbability, m.keeperCornerProbability + m.caughtSaveProbability);
      for (const key of ['goalProbability', 'saveProbability', 'missProbability']) close(m[key], models[0][key] * .55 ** n, key);
      for (const key of ['distance', 'goalOpeningDegrees', 'baseOnTargetProbability', 'reach', 'keeperPathDistance']) close(m[key], models[0][key], key);
      assert.equal(m.blockerIds.length, n); assert.ok(masses(m).every(p => p >= 0 && p <= 1));
    }
    assert.deepEqual(models[2].blockerIds, [`${other(team)}-N1`, `${other(team)}-N2`]);
  });

  test(`${team}: six real outcomes use exact disjoint probability boundaries and the same one RNG draw`, () => {
    const pending = declare(fixture({team, blockers: 2})), m = E.shotModel(pending), before = clone(pending);
    const expected = [['goal', 'goal'], ['save', 'corner'], ['save', 'saved'], ['shotMiss', 'wide'], ['blockedShot', 'corner'], ['blockedShot', 'blocked']];
    let boundary = 0, randomState;
    for (const [index, mass] of masses(m).entries()) {
      assert.ok(mass > 0);
      for (const roll of [boundary, boundary + mass / 2, boundary + mass - 1e-12]) {
        const next = E.skipMove(pending, {roll});
        assert.deepEqual([next.lastAction.type, next.lastAction.outcome], expected[index]); integrity(next);
        randomState ??= next.randomState; assert.equal(next.randomState, randomState);
        if (index >= 4) {
          assert.equal(next.lastAction.blockerId, `${other(team)}-N1`); assert.equal(next.offside, null);
          if (index === 4) {
            assert.equal(next.restart.type, 'corner'); assert.equal(next.attack, team); assert.equal(next.phase, 'cornerSelect');
            assert.equal(next.restart.takerId,null); assert.equal(next.ballProgress.rounds, 0);
            const selected=E.selectCornerTaker(next,E.cornerTakers(next)[0].id);
            assert.deepEqual(E.legalMoves(selected,selected.restart.takerId),[]);
            assert.equal(E.skipMove(E.skipMove(selected)).phase, 'kick');
          } else {
            assert.equal(next.restart, null); assert.equal(next.attack, other(team)); assert.equal(next.ball.carrierId, `${other(team)}-N1`);
            assert.equal(next.phase, 'attackMove'); assert.equal(next.ballProgress.rounds, 0);
            assert.deepEqual(next.lastAction.path, [pending.pendingShot.from, next.lastAction.blockedAt], 'a retained block stops its visible path at the first defender');
          }
        }
      }
      boundary += mass;
    }
    assert.deepEqual(pending, before); close(boundary, 1);
  });

  test(`${team}: opponents permit shots but still intercept ordinary passes and teammates hard-stop shots`, () => {
    const s = fixture({team, blockers: 1}), defender = s.pieces.find(p => p.id === `${other(team)}-N1`);
    const pass = E.legalKicks(s).find(k => k.x === defender.x && k.y === defender.y);
    assert.equal(pass.receiverId, defender.id); assert.equal(E.applyKick(s, pass.x, pass.y, {roll: 0}).lastAction.type, 'interception');
    const friendly = fixture({team, positions: {'white-N1': [5, 3]}}), p = target(team);
    assert.ok(!E.legalKicks(friendly).some(k => k.x === p.x && k.y === p.y));
    assert.ok(!E.legalKicks(s).some(k => !k.goal && k.x === p.x && k.y === target(team, 5, 2).y));
  });

  test(`${team}: physical segment crossings catch bodies absent from the grid-center ray; native knight shots lob over them`, () => {
    const bishop = fixture({team, shooter: 'B1', origin: [1, 6], positions: {'black-N1': [8, 0]}}), aim = target(team, 8, -1);
    const pending = declare(bishop, aim), m = E.shotModel(pending);
    assert.equal(pending.pendingShot.path.some(p => p.x === target(team, 8, 0).x && p.y === target(team, 8, 0).y), false);
    assert.deepEqual(m.blockerIds, [`${other(team)}-N1`]); close(m.blockProbability, .45);
    const friendly = fixture({team, shooter: 'B1', origin: [1, 6], positions: {'white-N1': [8, 0]}});
    assert.ok(!E.legalKicks(friendly).some(k => k.x === aim.x && k.y === aim.y));
    const knight = fixture({team, shooter: 'N1', origin: [5, 1], positions: {'black-N1': [6, 0], 'white-N2': [5, 0], 'black-K': [8, 0]}});
    const lob = declare(knight, target(team, 6, -1)), lobModel=E.shotModel(lob); assert.deepEqual(lobModel.blockerIds, []); close(lobModel.blockProbability, 0);
    assert.equal(lobModel.scoringMultiplier,1);close(lobModel.goalProbability,lobModel.baseGoalProbability);close(masses(lobModel).reduce((a,b)=>a+b,0),1);
  });

  test(`${team}: keeper reaction overrides remove its old square and count its new outside-box square as an ordinary blocker`, () => {
    const s = fixture({team, positions: {'black-K': [5, 2]}}), pending = declare(s), m = E.shotModel(pending), outside = target(team, 5, 3);
    assert.equal(m.keeperInBox, true); close(m.blockProbability, 0);
    assert.ok(E.legalMoves(pending, `${other(team)}-K`).some(p => p.x === outside.x && p.y === outside.y));
    const projected = E.shotModel(pending, pending.pendingShot.x, pending.pendingShot.y, outside);
    assert.equal(projected.keeperInBox, false); close(projected.saveProbability, 0); close(projected.blockProbability, .45);
    assert.deepEqual(projected.blockerIds, [`${other(team)}-K`]);
    const held = E.shotModel({...pending, pieces: pending.pieces.map(p => p.id === `${other(team)}-K` ? {...p, ...outside} : p)});
    assert.deepEqual(projected, held);
  });

  test(`${team}: pending save restoration refreshes blocker odds without changing declaration, input or randomness`, () => {
    const pending = declare(fixture({team, blockers: 2})), before = clone(pending);
    pending.lastAction.shotModel = {modelVersion: 1}; pending.lastAction.probability = -1;
    const normalized = E.normalizeGame(pending);
    assert.deepEqual(normalized.pendingShot, before.pendingShot); assert.equal(normalized.randomState, pending.randomState);
    assert.deepEqual(normalized.lastAction.shotModel, E.shotModel(normalized)); assert.deepEqual(E.normalizeGame(normalized), normalized);
    assert.equal(pending.lastAction.probability, -1);
    assert.deepEqual(E.skipMove(normalized, {roll: .99}), E.skipMove({...normalized, lastAction: before.lastAction}, {roll: .99}));
  });

  test(`${team}: an opponent deflecting an own-goal attempt follows actual last-touch goal-kick rules`, () => {
    const s = fixture({team, origin: [5, 10], positions: {'black-N1': [5, 13]}}), pending = declare(s, target(team, 5, E.BOARD_HEIGHT)), m = E.shotModel(pending);
    close(m.blockProbability, .45); close(m.blockOutProbability, .3825); close(m.blockCornerProbability, 0);
    close(m.cornerProbability, m.keeperCornerProbability); close(masses(m).reduce((a, b) => a + b, 0), 1);
    const out = E.skipMove(pending, {roll: 1 - m.blockPossessionProbability - m.blockOutProbability / 2});
    assert.equal(out.lastAction.type, 'blockedShot'); assert.equal(out.lastAction.outcome, 'out');
    assert.equal(out.restart.type, 'goalKick'); assert.equal(out.restart.team, team); integrity(out);
    const controlled = E.skipMove(pending, {roll: 1 - m.blockPossessionProbability / 2});
    assert.equal(controlled.ball.carrierId, `${other(team)}-N1`); assert.equal(controlled.attack, other(team)); integrity(controlled);
  });
}

test('Tactical chance search with blockers stays pure, seed-blind and cache-equivalent', () => {
  const s = fixture({blockers: 2}), before = clone(s), options = {maxDepth: 2, nodeLimit: 50000, extensions: false};
  const cached = E.analyzeTacticalAction(s, {...options, useCache: true});
  const uncached = E.analyzeTacticalAction(s, {...options, useCache: false});
  assert.deepEqual(s, before); assert.deepEqual(cached.action, uncached.action); close(cached.value, uncached.value);
  assert.equal(cached.stats.completedDepth, 2); assert.equal(uncached.stats.completedDepth, 2);
  assert.ok(cached.stats.nodes >= 6, 'search expands real block, save, wide and goal outcomes');
  assert.deepEqual(E.analyzeTacticalAction({...s, randomState: 0}, {...options, useCache: true}), cached);
});
