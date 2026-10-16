import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {E, fixture, point, pieceId, other} from './helpers/shot-fixture.mjs';
import {createMatchStats, recordMatchTransition, restoreMatchStats} from '../dist/match-stats.js';

const clone = value => structuredClone(value);
const close = (actual, expected, message = '') => assert.ok(Math.abs(actual - expected) < 1e-10, `${message}: ${actual} ≈ ${expected}`);
const xy = p => ({x: p.x, y: p.y});
const stepSeed = seed => (Math.imul(1664525, seed >>> 0) + 1013904223) >>> 0;
const probabilityKeys = ['goalProbability', 'keeperCornerProbability', 'caughtSaveProbability', 'missProbability', 'blockOutProbability', 'blockPossessionProbability'];
const mass = model => probabilityKeys.map(key => model[key]);
const total = values => values.reduce((a, b) => a + b, 0);

function declaration(state, disguise = true, index = 0) {
  const options = E.disguisedShotTargets(state);
  assert.equal(options.length, 2);
  return E.applyKick(state, options[index].x, options[index].y, {disguise});
}

function setPosition(state, id, at, team = state.attack) {
  const piece = state.pieces.find(piece => piece.id === pieceId(id, team));
  assert.ok(piece);
  Object.assign(piece, point(at, team));
  return state;
}

for (const team of ['white', 'black']) for (const type of ['Q', 'N']) {
  test(`${team} ${type}: disguise reuses exactly two legal native goal targets and leaves state unchanged`, () => {
    const state = fixture({team, type, origin: [6, 1]}), before = clone(state);
    const options = E.disguisedShotTargets(state), normal = E.legalKicks(state).filter(kick => kick.goal === team);
    assert.equal(options.length, 2);
    assert.deepEqual(options.map(xy), normal.map(xy).sort((a, b) => a.x - b.x));
    for (const option of options) assert.deepEqual(option.path, normal.find(kick => kick.x === option.x).path);
    assert.ok(options.every(option => option.goal === team));
    const pending = declaration(state);
    assert.equal(pending.phase, 'keeperReact');
    assert.equal(pending.pendingShot.disguised, true);
    assert.deepEqual(pending.pendingShot.targetOptions.map(xy), options.map(xy));
    assert.equal(pending.randomState, state.randomState, 'the shot has no selected random endpoint before the keeper reacts');
    assert.deepEqual(state, before, 'legal previews and declarations preserve the undo snapshot');
    assert.deepEqual(declaration(state, true, 1), pending, 'clicking either public endpoint declares the same unordered pair');
  });

  test(`${team} ${type}: every keeper preview is the exact 50/50 mixture of the ordinary shot models`, () => {
    const state = fixture({team, type, origin: [6, 1]}), pending = declaration(state);
    const options = E.disguisedShotTargets(state), keeperId = `${other(team)}-K`;
    const candidates = [undefined, ...E.legalMoves(pending, keeperId)];
    const before = clone(pending);
    for (const keeper of candidates) {
      const model = E.shotModel(pending, pending.pendingShot.x, pending.pendingShot.y, keeper);
      const ordinary = options.map(option => E.shotModel(E.applyKick(state, option.x, option.y), option.x, option.y, keeper));
      assert.equal(model.disguised, true);
      assert.equal(model.targetModels.length, 2);
      for (const key of [...probabilityKeys, 'probability', 'saveProbability', 'cornerProbability', 'blockProbability', 'onTargetProbability']) {
        close(model[key], (ordinary[0][key] + ordinary[1][key]) / 2, key);
      }
      close(E.shotChance(pending, pending.pendingShot.x, pending.pendingShot.y, keeper), model.goalProbability);
      close(total(mass(model)), 1, 'all six disjoint outcome masses sum to one');
    }
    assert.deepEqual(pending, before, 'keeper previews reveal no target or advance of randomness');
  });

  test(`${team} ${type}: target selection occurs after reaction, consumes one extra draw, and reports only the actual trajectory`, () => {
    const state = fixture({team, type, origin: [6, 1]}), pending = declaration(state), before = clone(pending);
    const options = E.disguisedShotTargets(state);
    for (const [targetRoll, index] of [[0, 0], [.49999999, 0], [.5, 1], [.99999999, 1]]) {
      const next = E.skipMove(pending, {targetRoll, roll: 0});
      const ordinary = E.skipMove(E.applyKick(state, options[index].x, options[index].y), {roll: 0});
      assert.equal(next.lastAction.type, 'goal');
      assert.deepEqual(next.lastAction.goalTarget, xy(options[index]));
      assert.deepEqual(next.lastAction.shotPath, options[index].path);
      assert.deepEqual(next.lastAction.shotModel, ordinary.lastAction.shotModel, 'resolution uses the selected single-target physics');
      close(next.lastAction.probability, ordinary.lastAction.probability);
      assert.equal(next.lastAction.targetProbability, .5);
      close(next.lastAction.combinedProbability, E.shotModel(pending).probability);
      assert.equal(next.randomState, stepSeed(stepSeed(pending.randomState)));
      assert.equal(ordinary.randomState, stepSeed(pending.randomState), 'ordinary shots still draw exactly once');
    }
    const keeperId = `${other(team)}-K`, reaction = E.legalMoves(pending, keeperId)[0];
    assert.ok(reaction);
    for (const [targetRoll, index] of [[.25, 0], [.75, 1]]) {
      const next = E.applyMove(pending, keeperId, reaction.x, reaction.y, {targetRoll, roll: 0});
      const ordinary = E.applyMove(E.applyKick(state, options[index].x, options[index].y), keeperId, reaction.x, reaction.y, {roll: 0});
      assert.deepEqual(next.lastAction.goalTarget, xy(options[index]));
      assert.deepEqual(next.lastAction.keeperMove, ordinary.lastAction.keeperMove);
      assert.deepEqual(next.lastAction.shotModel, ordinary.lastAction.shotModel);
    }
    for (const targetRoll of [-.1, 1, NaN]) assert.throws(() => E.skipMove(pending, {targetRoll, roll: 0}));
    assert.deepEqual(pending, before);
  });

  test(`${team} ${type}: save restoration and Undo retain the public pair, not a sampled target`, () => {
    const pending = declaration(fixture({team, type, origin: [6, 1]})), before = clone(pending);
    const restored = E.normalizeGame(clone(pending));
    assert.deepEqual(restored.pendingShot, pending.pendingShot);
    assert.equal(restored.randomState, pending.randomState);
    assert.deepEqual(E.normalizeGame(restored), restored);
    for (const targetRoll of [.25, .75]) {
      assert.deepEqual(E.skipMove(restored, {targetRoll, roll: .2}), E.skipMove(pending, {targetRoll, roll: .2}));
    }
    assert.deepEqual(pending, before, 'replaying either outcome cannot corrupt the saved declaration');
  });

  test(`${team} ${type}: a disguised attempt counts once and records the actual resolved goal endpoint`, () => {
    const state = fixture({team, type, origin: [6, 1]}), pending = declaration(state), options = E.disguisedShotTargets(state);
    let stats = recordMatchTransition(createMatchStats(), state, pending);
    assert.equal(stats.teams[team].shots, 1);
    assert.equal(stats.teams[team].onTarget, 0);
    const saved = restoreMatchStats(stats, pending, {partial: false});
    const next = E.skipMove(pending, {targetRoll: .75, roll: 0});
    stats = recordMatchTransition(saved, pending, next);
    assert.equal(stats.teams[team].shots, 1);
    assert.equal(stats.teams[team].onTarget, 1);
    assert.equal(stats.goals.length, 1);
    assert.equal(stats.goals[0].scorerId, pieceId(`white-${type === 'Q' ? 'Q' : 'N1'}`, team));
    assert.deepEqual(stats.goals[0].target, xy(options[1]));
    assert.deepEqual(stats.goals[0].origin, point([6, 1], team));
    close(stats.goals[0].distance, next.lastAction.shotModel.distance);
  });
}

test('disguise requires two legal opponent-goal targets and cannot create movement, shot rays or penalty powers', () => {
  for (const type of ['R', 'B', 'P', 'K']) {
    const state = fixture({type, origin: [6, type === 'K' ? 3 : 1]});
    assert.deepEqual(E.disguisedShotTargets(state), []);
    const aim = E.legalKicks(state).find(kick => kick.goal);
    if (aim) assert.throws(() => E.applyKick(state, aim.x, aim.y, {disguise: true}));
  }
  const single = fixture({type: 'Q', origin: [6, 3]});
  assert.equal(E.legalKicks(single).filter(kick => kick.goal === 'white').length, 1);
  assert.deepEqual(E.disguisedShotTargets(single), []);
  assert.throws(() => E.applyKick(single, 6, -1, {disguise: true}));
  const paired = fixture({type: 'Q', origin: [5, 2]}), friendly = setPosition(clone(paired), 'white-N1', [6, 1]);
  assert.equal(E.disguisedShotTargets(paired).length, 2);
  assert.deepEqual(E.disguisedShotTargets(friendly), [], 'a friendly body still makes the diagonal shot illegal');
  assert.throws(() => E.applyKick(friendly, 5, -1, {disguise: true}));
  const outfield = E.legalKicks(paired).find(kick => !kick.goal);
  assert.ok(outfield);
  assert.throws(() => E.applyKick(paired, outfield.x, outfield.y, {disguise: true}));
  const penalty = fixture({type: 'Q', origin: [6, 2]});
  penalty.restart = {type: 'penalty', team: 'white', takerId: 'white-Q', spot: xy(penalty.ball), indirect: false};
  assert.deepEqual(E.disguisedShotTargets(penalty), []);
  assert.throws(() => E.applyKick(penalty, 6, -1, {disguise: true}));
  const pending = E.applyKick(penalty, 6, -1);
  close(E.shotChance(pending), .8);
  assert.equal(E.skipMove(pending, {roll: .79999}).lastAction.type, 'goal');
  assert.equal(E.skipMove(pending, {roll: .8}).lastAction.type, 'save');
});

for (const team of ['white', 'black']) {
  test(`${team}: malformed saved target pairs cannot invent illegal rays or preserve a claimed hidden endpoint`, () => {
    const pending = declaration(fixture({team, type: 'Q', origin: [6, 1]}));
    const invalidOptions = [
      [pending.pendingShot.targetOptions[0], pending.pendingShot.targetOptions[0]],
      [pending.pendingShot.targetOptions[0], point([5, -1], team)],
      [pending.pendingShot.targetOptions[0], point([6, E.BOARD_HEIGHT], team)],
      [{x: -5, y: -1}, {x: 999, y: -1}],
      []
    ];
    for (const targetOptions of invalidOptions) {
      const corrupt = clone(pending); corrupt.pendingShot.targetOptions = targetOptions;
      const before = clone(corrupt), restored = E.normalizeGame(corrupt);
      assert.equal(restored.pendingShot.disguised, undefined);
      assert.equal(restored.pendingShot.targetOptions, undefined);
      assert.equal(restored.randomState, pending.randomState);
      assert.deepEqual(corrupt, before);
      assert.ok(Number.isFinite(E.shotChance(restored)));
    }
  });

  test(`${team}: both blocker outcomes retain the 15% possession / 85% corner split after target selection`, () => {
    const state = setPosition(fixture({team, type: 'Q', origin: [5, 2], keeper: [8, 0]}), 'black-N1', [6, 1], team);
    const pending = declaration(state), options = E.disguisedShotTargets(state);
    const blockedIndex = options.findIndex(option => E.shotModel(E.applyKick(state, option.x, option.y)).blockProbability > 0);
    assert.ok(blockedIndex >= 0);
    const targetRoll = blockedIndex === 0 ? .25 : .75;
    const ordinary = E.applyKick(state, options[blockedIndex].x, options[blockedIndex].y), model = E.shotModel(ordinary);
    close(model.blockOutProbability / model.blockProbability, .85);
    close(model.blockPossessionProbability / model.blockProbability, .15);
    const corner = E.skipMove(pending, {targetRoll, roll: 1 - model.blockPossessionProbability - model.blockOutProbability / 2});
    assert.equal(corner.lastAction.type, 'blockedShot'); assert.equal(corner.lastAction.outcome, 'corner');
    assert.equal(corner.restart.type, 'corner'); assert.equal(corner.restart.team, team);
    const retained = E.skipMove(pending, {targetRoll, roll: 1 - model.blockPossessionProbability / 2});
    assert.equal(retained.lastAction.type, 'blockedShot'); assert.equal(retained.lastAction.outcome, 'blocked');
    assert.equal(retained.attack, other(team)); assert.equal(retained.ball.carrierId, `${other(team)}-N1`);
    assert.equal(retained.restart, null);
    assert.deepEqual(retained.lastAction.goalTarget, xy(options[blockedIndex]));
    assert.deepEqual(retained.lastAction.path, [pending.pendingShot.from, retained.lastAction.blockedAt]);
  });

  test(`${team}: normal parries and deflections take their corner side from the aimed goal file`, () => {
    for (const [origin, aim, blocker] of [[[13, 6], [6, -1], [10, 3]], [[0, 6], [7, -1], [3, 3]]]) {
      const state = fixture({team, type: 'B', origin, keeper: [8, 0]});
      setPosition(state, 'black-N1', blocker, team);
      const target = point(aim, team), pending = E.applyKick(state, target.x, target.y), model = E.shotModel(pending);
      assert.ok(model.keeperCornerProbability > 0); assert.ok(model.blockOutProbability > 0);
      const expectedX = target.x <= E.GOAL_FILES[1] ? 0 : E.BOARD_WIDTH - 1;
      const expectedY = target.y < 0 ? 0 : E.BOARD_HEIGHT - 1;
      for (const roll of [model.goalProbability + model.keeperCornerProbability / 2, 1 - model.blockPossessionProbability - model.blockOutProbability / 2]) {
        const next = E.skipMove(pending, {roll});
        assert.equal(next.restart.type, 'corner');
        assert.deepEqual(next.restart.spot, {x: expectedX, y: expectedY});
        assert.deepEqual(next.lastAction.goalTarget, target);
      }
    }
  });

  test(`${team}: a disguised parry uses the actual chosen endpoint for the corner side`, () => {
    const state = fixture({team, type: 'Q', origin: [6, 1]}), pending = declaration(state), options = E.disguisedShotTargets(state);
    for (const [targetRoll, index] of [[.25, 0], [.75, 1]]) {
      const ordinary = E.applyKick(state, options[index].x, options[index].y), model = E.shotModel(ordinary);
      assert.ok(model.keeperCornerProbability > 0);
      const next = E.skipMove(pending, {targetRoll, roll: model.goalProbability + model.keeperCornerProbability / 2});
      assert.equal(next.restart.type, 'corner');
      assert.deepEqual(next.restart.spot, {x: options[index].x <= E.GOAL_FILES[1] ? 0 : E.BOARD_WIDTH - 1, y: options[index].y < 0 ? 0 : E.BOARD_HEIGHT - 1});
      assert.deepEqual(next.lastAction.goalTarget, xy(options[index]));
    }
  });
}

// Exporting the planner inside this test module lets us inspect every chance
// branch without adding a debug API to the shipped game.
const source = await readFile(new URL('../dist/engine.js', import.meta.url), 'utf8');
const internal = await import(`data:text/javascript;base64,${Buffer.from(source + '\nexport {tacticalSuccessors};\n').toString('base64')}`);

for (const team of ['white', 'black']) test(`${team}: tactical planning enumerates target × outcome without peeking at the seed`, () => {
  const state = setPosition(fixture({team, type: 'Q', origin: [5, 2]}), 'black-N1', [6, 1], team);
  const pending = declaration(state), before = clone(pending), outcomes = internal.tacticalSuccessors(pending, {type: 'skip'});
  close(total(outcomes.map(outcome => outcome.probability)), 1);
  assert.ok(outcomes.every(outcome => outcome.probability > 0));
  const expected = [];
  for (const option of pending.pendingShot.targetOptions) {
    const ordinary = E.applyKick(state, option.x, option.y), ordinaryModel = E.shotModel(ordinary);
    const group = internal.tacticalSuccessors(ordinary, {type: 'skip'}).map(outcome => ({...outcome, probability: outcome.probability / 2}));
    close(total(group.map(outcome => outcome.probability)), .5, 'each possible target has half the public probability mass');
    close(total(group.filter(outcome => outcome.state.score[team] > state.score[team]).map(outcome => outcome.probability)), ordinaryModel.probability / 2);
    expected.push(...group);
  }
  assert.deepEqual(outcomes, expected, 'planning is exactly the union of both ordinary-shot outcome distributions, weighted by one half');
  assert.deepEqual(internal.tacticalSuccessors({...pending, randomState: 0}, {type: 'skip'}), outcomes);
  assert.deepEqual(internal.tacticalSuccessors({...pending, randomState: 0xffffffff}, {type: 'skip'}), outcomes);
  assert.deepEqual(pending, before);
});

test('both keeper bots defend the aggregate probability instead of the declaration’s first endpoint', () => {
  const pending = declaration(fixture({type: 'N', origin: [6, 1], keeper: [8, 0]})), before = clone(pending);
  const keeperId = 'black-K', candidates = [{type: 'skip'}, ...E.legalMoves(pending, keeperId).map(move => ({...move, type: 'move', pieceId: keeperId}))];
  const chance = action => E.shotChance(pending, pending.pendingShot.x, pending.pendingShot.y, action.type === 'move' ? action : undefined);
  const best = Math.min(...candidates.map(chance));
  for (const difficulty of ['casual', 'tactical']) {
    const action = E.chooseAIAction(pending, {difficulty});
    assert.ok(action.type === 'move' || action.type === 'skip');
    close(chance(action), best, `${difficulty} keeper reacts to the 50/50 risk`);
    assert.deepEqual(E.chooseAIAction({...pending, randomState: 0}, {difficulty}), action);
    assert.deepEqual(E.chooseAIAction({...pending, randomState: 0xffffffff}, {difficulty}), action);
  }
  assert.deepEqual(pending, before);
});

for (const team of ['white', 'black']) for (const type of ['Q', 'N']) {
  test(`${team} ${type}: uncertainty improves a real finish and both attacker bots can choose it`, () => {
    const state = fixture({team, type, origin: [6, 1], keeper: [6, 0]}), options = E.disguisedShotTargets(state);
    const pending = declaration(state), positions = [undefined, ...E.legalMoves(pending, `${other(team)}-K`)];
    const bestOrdinary = Math.max(...options.map(option => {
      const ordinary = E.applyKick(state, option.x, option.y);
      return Math.min(...positions.map(keeper => E.shotChance(ordinary, option.x, option.y, keeper)));
    }));
    const disguised = Math.min(...positions.map(keeper => E.shotChance(pending, pending.pendingShot.x, pending.pendingShot.y, keeper)));
    assert.ok(disguised > bestOrdinary + .2, 'splitting the keeper’s information raises scoring odds without a finishing multiplier');
    for (const model of E.shotModel(pending).targetModels) assert.equal(model.scoringMultiplier, 1);
    for (const difficulty of ['casual', 'tactical']) {
      const action = difficulty === 'tactical' ? E.analyzeTacticalAction(state, {maxDepth: 2, nodeLimit: 600}).action : E.chooseAIAction(state, {difficulty});
      assert.equal(action.type, 'kick'); assert.equal(action.disguise, true);
      assert.ok(options.some(option => option.x === action.x && option.y === action.y));
      const differentSeed = {...state, randomState: 0xffffffff};
      const again = difficulty === 'tactical' ? E.analyzeTacticalAction(differentSeed, {maxDepth: 2, nodeLimit: 600}).action : E.chooseAIAction(differentSeed, {difficulty});
      assert.deepEqual(again, action);
    }
  });
}

for (const team of ['white', 'black']) test(`${team}: disguise cannot bypass an offside knight’s involvement inside the box`, () => {
  const state = fixture({team, type: 'Q', origin: [5, 2]});
  let row = 4;
  for (const piece of state.pieces.filter(piece => piece.team === other(team) && piece.type !== 'K')) {
    Object.assign(piece, point([12, row++], team));
  }
  setPosition(state, 'white-N1', [9, 1], team);
  assert.ok(E.offsideInfo(state, team).flaggedIds.includes(`${team}-N1`));
  assert.deepEqual(E.disguisedShotTargets(state), []);
  const aim = point([5, -1], team), before = clone(state);
  assert.throws(() => E.applyKick(state, aim.x, aim.y, {disguise: true}));
  const ordinary = E.applyKick(state, aim.x, aim.y);
  assert.equal(ordinary.lastAction.type, 'offside'); assert.equal(ordinary.restart.type, 'offside');
  assert.equal(ordinary.attack, other(team)); assert.equal(ordinary.pendingShot, null);
  assert.equal(ordinary.randomState, state.randomState); assert.deepEqual(state, before);
});

for (const team of ['white', 'black']) test(`${team}: valid saved pair paths and distances are rebuilt from the immutable shot origin`, () => {
  const pending = declaration(fixture({team, type: 'Q', origin: [6, 1]})), corrupt = clone(pending);
  for (const target of corrupt.pendingShot.targetOptions) {
    target.path = [{x: -10, y: -10}]; target.distance = 500;
  }
  const before = clone(corrupt), restored = E.normalizeGame(corrupt);
  assert.deepEqual(restored.pendingShot.targetOptions, pending.pendingShot.targetOptions);
  assert.deepEqual(restored.pendingShot.from, pending.pendingShot.from);
  assert.equal(restored.randomState, pending.randomState);
  assert.deepEqual(E.shotModel(restored), E.shotModel(pending));
  assert.deepEqual(corrupt, before);
});

for (const team of ['white', 'black']) test(`${team}: saved pair metadata cannot retarget an authoritative ordinary own-goal declaration`, () => {
  const state = setPosition(fixture({team, type: 'Q', origin: [6, 1]}), 'white-K', [1, 16], team);
  const pair = E.disguisedShotTargets(state), ownGoal = point([6, E.BOARD_HEIGHT], team);
  const ordinary = E.applyKick(state, ownGoal.x, ownGoal.y), corrupt = clone(ordinary);
  corrupt.pendingShot.disguised = true;
  corrupt.pendingShot.targetOptions = pair;
  const before = clone(corrupt), restored = E.normalizeGame(corrupt);
  assert.equal(restored.pendingShot.disguised, undefined);
  assert.equal(restored.pendingShot.targetOptions, undefined);
  assert.deepEqual(xy(restored.pendingShot), ownGoal);
  assert.equal(restored.pendingShot.scoringTeam, other(team));
  assert.equal(restored.randomState, ordinary.randomState);
  assert.deepEqual(E.skipMove(restored, {roll: 0}), E.skipMove(ordinary, {roll: 0}));
  assert.deepEqual(corrupt, before);
});
