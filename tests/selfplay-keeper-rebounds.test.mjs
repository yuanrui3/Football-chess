import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture, point, other} from './helpers/shot-fixture.mjs';
import {loadTrainingEngine} from '../scripts/train-selfplay.mjs';
import {FEATURE_NAMES, expectedTrainingLeaf, goalReward, planningView} from '../scripts/rl-training.mjs';
import {generateCounterplayEpisode} from '../scripts/counterplay-training.mjs';

const {rules} = await loadTrainingEngine();
const close = (a, b, label = '') => assert.ok(Math.abs(a - b) < 1e-10, `${label}: ${a} ≈ ${b}`);
const zero = () => Array(FEATURE_NAMES.length).fill(0);
const xy = p => ({x: p.x, y: p.y});

for (const team of ['white', 'black']) for (const disguised of [false, true]) {
  const label = `${team} ${disguised ? 'disguised' : 'ordinary'} shot`;
  const source = fixture({team, origin: disguised ? [6, 1] : [6, 3], keeper: [8, 0]});
  const target = disguised ? rules.disguisedShotTargets(source)[0] : point([6, -1], team);
  const pending = rules.applyKick(source, target.x, target.y, {disguise: disguised});

  test(`${label}: offline public outcomes preserve every rebound and actual goal probability`, () => {
    const before = structuredClone(pending), model = rules.shotModel(pending);
    const outcomes = rules.tacticalSuccessors(pending, {type: 'skip'});
    close(outcomes.reduce((s, o) => s + o.probability, 0), 1, 'total mass');
    assert.ok(outcomes.every(o => Number.isFinite(o.probability) && o.probability > 0 && o.state.phase !== 'keeperReact'));
    // Search intentionally strips event logs. In this blocker-free fixture,
    // a live loose ball without a restart uniquely identifies a keeper parry.
    const rebounds = outcomes.filter(o => !o.state.ball.carrierId && !o.state.restart);
    assert.ok(model.keeperReboundProbability > 0 && rebounds.length > 0);
    close(rebounds.reduce((s, o) => s + o.probability, 0), model.keeperReboundProbability, 'unrenormalized rebound mass');
    close(outcomes.reduce((s, o) => s + o.probability * goalReward(pending, o.state), 0), (team === 'white' ? 1 : -1) * model.goalProbability, 'signed actual-goal reward');
    for (const o of rebounds) {
      assert.equal(o.state.ball.carrierId, null);
      assert.equal(o.state.restart, null);
      assert.deepEqual(o.state.offside, pending.offside, 'live rebound retains kick-time offside snapshot');
      assert.deepEqual(o.state.score, pending.score, 'parrying is not a goal reward');
    }
    const shots = disguised ? pending.pendingShot.targetOptions.map(t => ({...pending.pendingShot, ...t})) : [pending.pendingShot];
    let offset = 0;
    for (let targetIndex = 0; targetIndex < shots.length; targetIndex++) {
      const shot = shots[targetIndex];
      const landings = rules.keeperReboundTargets(pending, shot);
      const group = rebounds.slice(offset, offset + landings.length);
      offset += landings.length;
      assert.equal(group.length, landings.length, 'enumerates every finite legal rebound target');
      const ordinary = {...pending, pendingShot: {...shot, disguised: false, targetOptions: undefined}};
      const conditionalMass = rules.shotModel(ordinary, shot.x, shot.y).keeperReboundProbability / shots.length;
      for (const o of group) close(o.probability, conditionalMass / landings.length, 'uniform conditional landing probability');
      assert.deepEqual(group.map(o => xy(o.state.ball)), landings.map(xy));
      const m = rules.shotModel(ordinary, shot.x, shot.y);
      const live = rules.skipMove(pending, {roll: m.goalProbability + m.keeperCornerProbability + m.keeperReboundProbability / 2,
        targetRoll: disguised ? (targetIndex + .5) / 2 : undefined, landing: landings[0]});
      assert.equal(live.lastAction.type, 'save'); assert.equal(live.lastAction.outcome, 'loose');
      assert.deepEqual(xy(live.ball), xy(landings[0]));
      assert.deepEqual(live.lastAction.goalTarget, xy(shot));
    }
    assert.deepEqual(pending, before);
    assert.deepEqual(rules.tacticalSuccessors({...pending, randomState: 0xffffffff}, {type: 'skip'}), outcomes, 'public outcomes cannot read hidden future RNG');
  });

  test(`${label}: beam leaf evaluation includes live rebound continuation without hidden RNG`, () => {
    const expected = rules.tacticalSuccessors(pending, {type: 'skip'}).reduce((sum, o) => sum + o.probability * rules.tacticalBasePositionValue(o.state, 'white'), 0);
    const fixedReply = {...rules, chooseAIAction: state => {assert.equal(state.randomState, 1); return {type: 'skip'};}};
    close(expectedTrainingLeaf(fixedReply, pending, zero()), expected);
    close(expectedTrainingLeaf(fixedReply, {...pending, randomState: 123456}, zero()), expected);
  });

  test(`${label}: counterplay replay records the full public distribution and signed goal reward`, () => {
    const fixedReply = {...rules, chooseAIAction: state => {assert.equal(state.randomState, 1); return {type: 'skip'};}};
    const episode = generateCounterplayEpisode(fixedReply, fixedReply, zero(), {initialState: pending, actions: 1, episode: team === 'white' ? 1 : 0, policy: 'casual', baselinePolicy: 'casual', epsilon: 0, baselineFraction: 1});
    const actual = episode.transitions[0].outcomes;
    const expected = rules.tacticalSuccessors(planningView(pending), {type: 'skip'});
    assert.equal(actual.length, expected.length, 'no rebound outcomes are discarded during experience generation');
    assert.deepEqual(actual.map(o => o.probability), expected.map(o => o.probability));
    close(actual.reduce((s, o) => s + o.probability, 0), 1);
    close(actual.reduce((s, o) => s + o.probability * o.reward, 0), (team === 'white' ? 1 : -1) * rules.shotModel(pending).goalProbability);
    assert.ok(actual.every(o => Number.isFinite(o.prior) && o.features.every(Number.isFinite)));
    assert.equal(rules.currentTeam(pending), other(team));
  });
}

for (const team of ['white', 'black']) test(`${team}: public rebound targets use the keeper's completed reaction square`, () => {
  const source = fixture({team, origin: [6, 3], keeper: [8, 0]}), target = point([6, -1], team);
  const pending = rules.applyKick(source, target.x, target.y), keeperId = `${other(team)}-K`;
  const move = rules.legalMoves(pending, keeperId).find(m => m.y !== pending.pieces.find(p => p.id === keeperId).y);
  assert.ok(move);
  const action = {type: 'move', pieceId: keeperId, x: move.x, y: move.y};
  const projected = structuredClone(pending);
  Object.assign(projected.pieces.find(p => p.id === keeperId), xy(move));
  const targets = rules.keeperReboundTargets(projected);
  assert.ok(!targets.some(p => p.x === move.x && p.y === move.y), 'keeper now occupies its reaction square');
  const outcomes = rules.tacticalSuccessors(pending, action), model = rules.shotModel(pending, target.x, target.y, action);
  const rebounds = outcomes.filter(o => !o.state.ball.carrierId && !o.state.restart);
  assert.equal(rebounds.length, targets.length);
  assert.deepEqual(rebounds.map(o => xy(o.state.ball)), targets.map(xy));
  close(rebounds.reduce((s, o) => s + o.probability, 0), model.keeperReboundProbability);
  close(outcomes.reduce((s, o) => s + o.probability, 0), 1);
});
