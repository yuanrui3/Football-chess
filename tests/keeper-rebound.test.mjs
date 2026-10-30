import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../dist/engine.js';
import * as Previous from '../training/frozen/engine-v37.mjs';

const other = team => team === 'white' ? 'black' : 'white';
const idFor = (id, team) => team === 'white' ? id : id.replace(/^(white|black)/, other);
const pointFor = ([x, y], team) => team === 'white' ? {x, y} : {x: E.BOARD_WIDTH - 1 - x, y: E.BOARD_HEIGHT - 1 - y};
const close = (actual, expected, message = '') => assert.ok(Math.abs(actual - expected) < 1e-10, `${message}: ${actual} ≈ ${expected}`);
const plain = value => JSON.parse(JSON.stringify(value));
const masses = model => [model.goalProbability, model.keeperCornerProbability, model.keeperReboundProbability,
  model.caughtSaveProbability, model.missProbability, model.blockOutProbability, model.blockPossessionProbability];

function fixture(team = 'white') {
  const s = E.createGame({mode: 'local', kickoff: 'white', seed: 781});
  const assigned = {'white-K': [6, 15], 'black-K': [6, 1], 'black-R2': [10, 3],
    'white-Q': [5, 6], 'white-R1': [4, 4], 'white-N1': [3, 2]};
  const occupied = new Set(Object.values(assigned).map(p => p.join(',')));
  const parking = Array.from({length: 7}, (_, i) => [0, 1, 12, 13].map(x => [x, 16 - i])).flat();
  for (const piece of s.pieces) {
    const p = assigned[piece.id] || parking.find(p => !occupied.has(p.join(',')));
    assert.ok(p); [piece.x, piece.y] = p; occupied.add(p.join(','));
  }
  if (team === 'black') for (const piece of s.pieces) {
    piece.id = idFor(piece.id, team); piece.team = other(piece.team);
    Object.assign(piece, pointFor([piece.x, piece.y], team));
  }
  const shooter = s.pieces.find(p => p.id === idFor('white-Q', team));
  Object.assign(s, {phase: 'kick', attack: team, restart: null, offside: null, pendingShot: null,
    ball: {x: shooter.x, y: shooter.y, carrierId: shooter.id},
    positionBudget: {normalUsed: false, pawnUsed: false, dribbleUsed: false},
    ballProgress: {team, anchorY: shooter.y, rounds: 0, pendingRelease: false, excludeRelease: false}});
  assert.ok(s.pieces.every(p => E.canOccupySquare(p, p.x, p.y)));
  return s;
}
function declare(s) {
  const aim = s.attack === 'white' ? {x: 5, y: -1} : {x: E.BOARD_WIDTH - 1 - 5, y: E.BOARD_HEIGHT};
  return E.applyKick(s, aim.x, aim.y);
}
const reboundRoll = model => model.goalProbability + model.keeperCornerProbability + model.keeperReboundProbability / 2;
function rebound(s, landing) {return E.skipMove(s, {roll: reboundRoll(E.shotModel(s)), ...(landing ? {landing} : {})});}
function revisedPreSplitSave(old, model) {
  const goalLineY = old.target.y < 0 ? 0 : E.BOARD_HEIGHT - 1;
  const depth = Math.abs(old.keeperPosition.y - goalLineY);
  const directionY = Math.abs(old.target.y - old.origin.y) / old.distance;
  const stanceTime = old.timeToKeeper + depth * directionY / E.SHOT_MODEL.ballSpeed;
  const readiness = time => E.SHOT_MODEL.boxMaxSave *
    (1 - Math.exp(-(E.SHOT_MODEL.readinessBase + time) / E.SHOT_MODEL.readinessTime));
  const stanceSave = old.saveGivenOnTarget * readiness(stanceTime) / readiness(old.timeToKeeper);
  const conditional = Math.min(E.SHOT_MODEL.boxMaxSave,
    stanceSave + (1 - stanceSave) * model.rushCoverage);
  return {conditional, save: old.onTargetProbability * conditional};
}

for (const team of ['white', 'black']) {
  test(`${team}: in-play rebounds split revised keeper parries without altering the save mass`, () => {
    const pending = declare(fixture(team)), before = structuredClone(pending), model = E.shotModel(pending), old = Previous.shotModel(pending);
    assert.equal(E.SHOT_MODEL.parryInPlayShare, .20);
    // Model 16 preserves a rushing keeper's set stance and adds smothering.
    // Adjust the frozen pre-rebound save model for both changes before checking
    // the split, which must redistribute only saves, never goal/wide/block mass.
    const {conditional: expectedSaveGivenTarget, save: expectedSave} = revisedPreSplitSave(old, model);
    const unsplitParry = expectedSave * old.parryGivenSave;
    assert.ok(model.rushCoverage > 0, 'the fixture exercises the new rush rather than silently avoiding it');
    close(model.timeToKeeper, old.timeToKeeper, 'actual flight time unchanged');
    close(model.reach, old.reach, 'diving reach still uses actual flight time');
    close(model.parryGivenSave, old.parryGivenSave, 'arrival pace and stretch still use actual flight time');
    close(model.goalProbability, old.onTargetProbability * (1 - expectedSaveGivenTarget), 'goal mass uses the revised save odds');
    close(model.saveProbability, expectedSave, 'all revised saves preserved');
    close(model.caughtSaveProbability, expectedSave - unsplitParry, 'catches exclude only revised parries');
    close(model.missProbability, old.missProbability, 'wide mass unchanged');
    close(model.blockProbability, old.blockProbability, 'body-block mass unchanged');
    close(model.keeperReboundProbability, model.saveProbability * model.parryGivenSave * .20);
    close(model.keeperCornerProbability, model.saveProbability * model.parryGivenSave * .80);
    close(model.keeperReboundProbability + model.keeperCornerProbability, unsplitParry);
    close(masses(model).reduce((sum, p) => sum + p, 0), 1);
    assert.ok(masses(model).every(p => p >= 0 && p <= 1));
    assert.deepEqual(pending, before, 'probability queries remain pure');
  });

  test(`${team}: rebound targets are exactly uniform empty squares near the defending box`, () => {
    const pending = declare(fixture(team)), before = structuredClone(pending), targets = E.keeperReboundTargets(pending);
    const expected = [];
    for (let y = 0; y < E.BOARD_HEIGHT; y++) for (let x = 0; x < E.BOARD_WIDTH; x++) {
      const whitePoint = team === 'white' ? {x, y} : pointFor([x, y], 'black');
      const nearBox = whitePoint.x >= 2 && whitePoint.x <= 11 && whitePoint.y >= 0 && whitePoint.y <= 4;
      if (nearBox && !E.isGoalMouth(x, y) && !pending.pieces.some(p => p.x === x && p.y === y)) expected.push(`${x},${y}`);
    }
    assert.deepEqual(targets.map(p => `${p.x},${p.y}`).sort(), expected.sort());
    assert.ok(targets.length > 20); assert.equal(new Set(targets.map(p => `${p.x},${p.y}`)).size, targets.length);
    assert.ok(targets.every(p => !E.isGoalMouth(p.x, p.y)));
    assert.deepEqual(pending, before, 'target enumeration does not spend RNG');
  });

  test(`${team}: a keeper rebound leaves a playable loose ball and preserves shot-time offside`, () => {
    const pending = declare(fixture(team)), before = structuredClone(pending), landing = pointFor([4, 2], team);
    const saved = rebound(pending, landing);
    assert.equal(saved.lastAction.type, 'save'); assert.equal(saved.lastAction.outcome, 'loose');
    assert.equal(saved.lastAction.keeperRebound, true); assert.equal(saved.lastAction.keeperId, idFor('black-K', team));
    assert.deepEqual(saved.lastAction.reboundLanding, landing); assert.deepEqual(saved.lastAction.to, landing);
    assert.ok(saved.lastAction.reboundRoll >= 0 && saved.lastAction.reboundRoll < 1);
    assert.deepEqual(saved.ball, {...landing, carrierId: null}); assert.equal(saved.attack, team);
    assert.equal(saved.phase, 'attackMove'); assert.equal(saved.restart, null); assert.equal(saved.pendingShot, null);
    assert.equal(saved.looseBallKickOrigin, null);
    assert.deepEqual(saved.positionBudget, {normalUsed: false, pawnUsed: false, dribbleUsed: false});
    assert.deepEqual(saved.offside, pending.offside);
    const keeper = pending.pieces.find(p => p.id === idFor('black-K', team));
    assert.deepEqual(saved.lastAction.path, [pending.pendingShot.from, {x: keeper.x, y: keeper.y}, landing]);
    const collected = E.applyMove(saved, idFor('white-R1', team), landing.x, landing.y);
    assert.equal(collected.ball.carrierId, idFor('white-R1', team)); assert.equal(collected.restart, null);
    assert.deepEqual(pending, before);
  });

  test(`${team}: originally offside runner cannot collect a keeper rebound; the shooter can`, () => {
    const pending = declare(fixture(team)), runner = idFor('white-N1', team);
    assert.ok(E.offsideFlaggedIds(pending).includes(runner));
    const flaggedLanding = pointFor([5, 3], team), saved = rebound(pending, flaggedLanding);
    assert.ok(E.legalMoves(saved, runner).some(p => p.x === flaggedLanding.x && p.y === flaggedLanding.y));
    const penalized = E.applyMove(saved, runner, flaggedLanding.x, flaggedLanding.y);
    assert.equal(penalized.lastAction.type, 'offside'); assert.equal(penalized.restart.team, other(team));
    const shooterLanding = pointFor([5, 4], team), second = rebound(pending, shooterLanding), shooter = idFor('white-Q', team);
    const collected = E.applyMove(second, shooter, shooterLanding.x, shooterLanding.y);
    assert.equal(collected.ball.carrierId, shooter); assert.equal(collected.restart, null);
    assert.equal(collected.lastAction.selfPassCollection, undefined, 'a goalkeeper rebound is not a loose self-pass');
    assert.equal(collected.positionBudget.dribbleUsed, false, 'ordinary rebound collection leaves the carrying allowance');
  });

  test(`${team}: rebound sampling is seeded and survives reload; invalid forced landings are rejected`, () => {
    const pending = declare(fixture(team)), before = structuredClone(pending), loaded = E.normalizeGame(plain(pending));
    assert.deepEqual(rebound(pending), rebound(pending));
    assert.deepEqual(rebound(pending), rebound(loaded));
    const destinations = new Set();
    for (let seed = 1; seed <= 32; seed++) {
      const input = {...pending, randomState: seed}, saved = rebound(input);
      const targets = E.keeperReboundTargets(input);
      assert.deepEqual({x: saved.ball.x, y: saved.ball.y}, targets[Math.floor(saved.lastAction.reboundRoll * targets.length)], 'one uniform RNG draw maps to equally sized target intervals');
      destinations.add(`${saved.ball.x},${saved.ball.y}`);
    }
    assert.ok(destinations.size > 1, 'different seeds produce different legal rebound squares');
    const keeper = pending.pieces.find(p => p.id === idFor('black-K', team));
    for (const invalid of [{x: -1, y: 0}, pointFor([6, 0], team), {x: keeper.x, y: keeper.y}, pointFor([5, 9], team)]) {
      assert.throws(() => rebound(pending, invalid), /rebound|landing|square|target/i);
    }
    assert.deepEqual(pending, before);
  });

  test(`${team}: keeper reactions change occupied rebound squares before resolution`, () => {
    const pending = declare(fixture(team)), keeperId = idFor('black-K', team), destination = pointFor([7, 1], team);
    const adjusted = structuredClone(pending); Object.assign(adjusted.pieces.find(p => p.id === keeperId), destination);
    const oldKeeper = pending.pieces.find(p => p.id === keeperId);
    const targets = E.keeperReboundTargets(adjusted);
    assert.ok(targets.some(p => p.x === oldKeeper.x && p.y === oldKeeper.y), 'the vacated keeper square is available');
    assert.ok(!targets.some(p => p.x === destination.x && p.y === destination.y), 'the new keeper square is occupied');
    const roll = reboundRoll(E.shotModel(adjusted)), landing = {x: oldKeeper.x, y: oldKeeper.y};
    const saved = E.applyMove(pending, keeperId, destination.x, destination.y, {roll, landing});
    assert.equal(saved.lastAction.outcome, 'loose'); assert.deepEqual(saved.lastAction.reboundLanding, landing);
    assert.deepEqual(saved.lastAction.keeperMove.to, destination);
    assert.deepEqual(saved.lastAction.path[1], destination);
  });

  test(`${team}: penalties have no keeper-rebound branch`, () => {
    const s = fixture(team), shooterId = s.ball.carrierId;
    s.restart = {type: 'penalty', team, takerId: shooterId, spot: {x: s.ball.x, y: s.ball.y}, indirect: false};
    const model = E.shotModel(declare(s));
    close(model.goalProbability, .8); close(model.keeperReboundProbability, 0);
    close(model.keeperCornerProbability, 0); close(model.caughtSaveProbability, .2);
    close(masses(model).reduce((sum, p) => sum + p, 0), 1);
  });

  test(`${team}: a teammate's backward shot cannot create a keeper rebound or evade immediate release`, () => {
    const s = fixture(team), aim = team === 'white' ? {x: 5, y: E.BOARD_HEIGHT} : {x: E.BOARD_WIDTH - 1 - 5, y: -1};
    const pending = E.applyKick(s, aim.x, aim.y), model = E.shotModel(pending), old = Previous.shotModel(pending);
    assert.equal(pending.pendingShot.shootingTeam, team);
    assert.equal(pending.pendingShot.defendingTeam, team, 'the shot is toward the shooter’s own keeper');
    const {save: expectedSave} = revisedPreSplitSave(old, model);
    close(model.keeperReboundProbability, 0);
    close(model.keeperCornerProbability, expectedSave * old.parryGivenSave, 'backward-shot parries all remain out of play');
    close(model.caughtSaveProbability, expectedSave * (1 - old.parryGivenSave));
    assert.ok(model.caughtSaveProbability > 0);
    const caughtRoll = model.goalProbability + model.keeperCornerProbability + model.caughtSaveProbability / 2;
    const caught = E.skipMove(pending, {roll: caughtRoll});
    assert.equal(caught.lastAction.type, 'save'); assert.equal(caught.lastAction.outcome, 'saved');
    assert.equal(caught.lastAction.backPass, true); assert.equal(caught.ball.carrierId, idFor('white-K', team));
    assert.equal(caught.phase, 'keeperRelease'); assert.equal(caught.releaseReason, 'backPass');
    assert.deepEqual(E.legalMoves(caught, caught.ball.carrierId), [], 'the keeper cannot carry or wait through positioning');
    assert.ok(E.legalKicks(caught).length > 0, 'an immediate release remains available');
  });
}
