import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {E, fixture, point, pieceId, other} from './helpers/shot-fixture.mjs';
import {createMatchStats, recordMatchTransition} from '../dist/match-stats.js';

const source = await readFile(new URL('../dist/engine.js', import.meta.url), 'utf8');
const internal = await import(`data:text/javascript;base64,${Buffer.from(source + '\nexport {tacticalSuccessors,tacticalStateKey,reactedShotChance};').toString('base64')}`);
const close = (a, b, label = '') => assert.ok(Math.abs(a - b) < 1e-10, `${label}: ${a} != ${b}`);
const failures = ['keeperCornerProbability', 'keeperReboundProbability', 'caughtSaveProbability', 'missProbability', 'blockOutProbability', 'blockPossessionProbability'];
const withRestart = (s, type = 'freeKick', indirect = false) => ({...structuredClone(s), restart: {type, team: s.attack,
  takerId: s.ball.carrierId, spot: {x: s.ball.x, y: s.ball.y}, indirect}});
function doubled(base, boosted) {
  close(boosted.goalProbability, Math.min(1, 2 * base.goalProbability), 'twice the scoring probability');
  assert.equal(boosted.directFreeKick, true); assert.equal(boosted.scoringMultiplier, 2);
  const scale = (1 - boosted.goalProbability) / (1 - base.goalProbability);
  for (const key of failures) { close(boosted[key], base[key] * scale, key); assert.ok(boosted[key] >= 0); }
  close(boosted.goalProbability + failures.reduce((sum, key) => sum + boosted[key], 0), 1, 'all outcomes conserve probability');
}

for (const team of ['white', 'black']) {
  test(`${team}: legal direct free kicks double scoring for every piece type`, () => {
    for (const type of E.TYPES) {
      const origin = type === 'N' ? [6, 1] : type === 'B' ? [3, 3] : [6, 4];
      const target = point([type === 'N' ? 5 : type === 'B' ? 7 : 6, -1], team);
      const normal = fixture({team, type, origin}), direct = withRestart(normal), before = structuredClone(direct);
      const legal = E.legalKicks(direct).find(k => k.x === target.x && k.y === target.y); assert.ok(legal?.goal);
      doubled(E.shotModel(normal, target.x, target.y), legal.shotModel);
      const declared = E.applyKick(direct, target.x, target.y);
      assert.equal(declared.pendingShot.directFreeKick, true); assert.equal(declared.restart, null);
      assert.deepEqual(E.shotModel(declared), legal.shotModel);
      assert.equal(declared.randomState, direct.randomState); assert.deepEqual(direct, before);
    }
  });

  test(`${team}: walls, long range and every keeper reaction retain the same twofold bonus`, () => {
    for (const row of [3, 6, 10]) for (const blocked of [false, true]) {
      const normal = fixture({team, type: 'R', origin: [6, row], keeper: [6, 0]}), target = point([6, -1], team);
      if (blocked) Object.assign(normal.pieces.find(p => p.id === pieceId('black-P1', team)), point([6, 2], team));
      const plain = E.applyKick(normal, target.x, target.y), direct = E.applyKick(withRestart(normal), target.x, target.y);
      const keeperId = `${other(team)}-K`, reactions = [undefined, ...E.legalMoves(direct, keeperId)];
      for (const reaction of reactions) {
        const base = E.shotModel(plain, target.x, target.y, reaction), boosted = E.shotModel(direct, target.x, target.y, reaction);
        doubled(base, boosted);
        const roll = (base.goalProbability + boosted.goalProbability) / 2;
        const result = reaction ? E.applyMove(direct, keeperId, reaction.x, reaction.y, {roll}) : E.skipMove(direct, {roll});
        const ordinary = reaction ? E.applyMove(plain, keeperId, reaction.x, reaction.y, {roll}) : E.skipMove(plain, {roll});
        assert.equal(result.lastAction.type, 'goal'); assert.notEqual(ordinary.lastAction.type, 'goal');
        assert.deepEqual(result.lastAction.shotModel, boosted);
      }
    }
  });

  test(`${team}: scoring caps at 100% without negative or leftover failure probability`, () => {
    const normal = fixture({team, origin: [6, 1], keeper: [10, 5]}), target = point([6, -1], team);
    const base = E.shotModel(normal, target.x, target.y); assert.ok(base.goalProbability > .5);
    const boosted = E.shotModel(withRestart(normal), target.x, target.y); doubled(base, boosted);
    assert.equal(boosted.goalProbability, 1); assert.ok(failures.every(key => boosted[key] === 0));
    const result = E.skipMove(E.applyKick(withRestart(normal), target.x, target.y), {roll: .999999});
    assert.equal(result.lastAction.type, 'goal');
  });

  test(`${team}: penalties, corners, indirect restarts and own-goal attempts receive no free-kick bonus`, () => {
    const normal = fixture({team, origin: [6, 3]}), target = point([6, -1], team), base = E.shotModel(normal, target.x, target.y);
    for (const type of ['corner', 'offside', 'stalling', 'timeout', 'goalKick', 'throwIn']) {
      const state = withRestart(normal, type, ['offside', 'stalling', 'timeout'].includes(type));
      assert.deepEqual(E.shotModel(state, target.x, target.y), base);
    }
    assert.deepEqual(E.shotModel(withRestart(normal, 'freeKick', true), target.x, target.y), base);
    const penalty = E.shotModel(withRestart(normal, 'penalty'), target.x, target.y);
    assert.equal(penalty.goalProbability, .8); assert.equal(penalty.directFreeKick, false);
    const ownTarget = point([6, E.BOARD_HEIGHT], team);
    assert.deepEqual(E.shotModel(withRestart(normal), ownTarget.x, ownTarget.y), E.shotModel(normal, ownTarget.x, ownTarget.y));
    Object.assign(normal.pieces.find(p => p.id === `${team}-K`), point([8, 15], team));
    const own = E.applyKick(withRestart(normal), ownTarget.x, ownTarget.y);
    assert.equal(own.pendingShot.directFreeKick, undefined); assert.equal(E.shotModel(own).scoringMultiplier, 1);
  });

  test(`${team}: passing from the restart ends the bonus before the receiver shoots`, () => {
    const normal = fixture({team, origin: [6, 4]}), receiverId = pieceId('white-R1', team);
    Object.assign(normal.pieces.find(p => p.id === receiverId), point([7, 5], team));
    const targetPass = point([7, 5], team);
    const passed = E.applyKick(withRestart(normal), targetPass.x, targetPass.y, {roll: 0});
    assert.equal(passed.restart, null); assert.equal(passed.ball.carrierId, receiverId);
    const ready = E.skipMove(E.skipMove(passed)), target = point([7, -1], team), pending = E.applyKick(ready, target.x, target.y);
    assert.equal(pending.pendingShot.directFreeKick, undefined); assert.equal(E.shotModel(pending).directFreeKick, false);
    assert.equal(E.shotModel(pending).scoringMultiplier, 1);
  });

  test(`${team}: save/reload and match xG retain the declared direct-free-kick chance`, () => {
    const normal = fixture({team}), direct = withRestart(normal), target = point([6, -1], team);
    const pending = E.applyKick(direct, target.x, target.y), restored = E.normalizeGame(JSON.parse(JSON.stringify(pending)));
    assert.deepEqual(restored, pending); assert.equal(restored.pendingShot.directFreeKick, true);
    const after = E.skipMove(restored, {roll: 0}), stats = recordMatchTransition(createMatchStats(), direct, pending);
    const finalStats = recordMatchTransition(stats, pending, after);
    close(finalStats.playerRatings.players[direct.ball.carrierId].counts.xG, E.shotModel(pending).goalProbability);
    assert.equal(finalStats.teams[team].shots, 1);
    const legacy = E.applyKick(normal, target.x, target.y); legacy.rulesVersion = 21;
    assert.equal(E.shotModel(E.normalizeGame(legacy)).directFreeKick, false, 'do not invent provenance for an older in-flight shot');
  });

  test(`${team}: disguised shots boost each endpoint and Tactical uses the correct chance branches`, () => {
    for (const type of ['Q', 'N']) {
      const normal = fixture({team, type, origin: [6, 1]}), direct = withRestart(normal), options = E.disguisedShotTargets(direct);
      assert.equal(options.length, 2);
      const plain = E.applyKick(normal, options[0].x, options[0].y, {disguise: true});
      const pending = E.applyKick(direct, options[0].x, options[0].y, {disguise: true});
      const models = E.shotModel(pending), bases = E.shotModel(plain);
      for (let i = 0; i < 2; i++) doubled(bases.targetModels[i], models.targetModels[i]);
      close(models.goalProbability, (models.targetModels[0].goalProbability + models.targetModels[1].goalProbability) / 2);
      const outcomes = internal.tacticalSuccessors(pending, {type: 'skip'});
      close(outcomes.reduce((sum, o) => sum + o.probability, 0), 1);
      close(outcomes.filter(o => o.state.score[team] === 1).reduce((sum, o) => sum + o.probability, 0), models.goalProbability);
      assert.notEqual(internal.tacticalStateKey(plain), internal.tacticalStateKey(pending));
      const choice = {...options[0], disguise: true, targetOptions: options};
      const positions = [undefined, ...E.legalMoves(pending, `${other(team)}-K`)];
      close(internal.reactedShotChance(direct, choice), Math.min(...positions.map(p => E.shotChance(pending, pending.pendingShot.x, pending.pendingShot.y, p))));
      for (const targetRoll of [0, .75]) {
        const result = E.skipMove(pending, {roll: 0, targetRoll});
        assert.equal(result.lastAction.shotModel.directFreeKick, true); assert.equal(result.lastAction.type, 'goal');
      }
    }
  });
}
