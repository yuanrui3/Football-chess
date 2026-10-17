import test from 'node:test';
import assert from 'node:assert/strict';
import {FEATURE_NAMES, createLearner, valuePrediction, tdLambdaUpdate, resetEligibility, goalReward, seededRandom, deriveSeed, planningView, chooseTrainingAction, trainEpisode, evaluateEpisode, assertLegalAction} from '../scripts/rl-training.mjs';
import {parseArguments, loadTrainingEngine, checkpoint} from '../scripts/train-selfplay.mjs';

const zero = () => Array(FEATURE_NAMES.length).fill(0);
const features = (...values) => [...values, ...zero()].slice(0, FEATURE_NAMES.length);

function toyRules({goals = true} = {}) {
  const make = seed => ({phase: 'kick', team: 'white', attack: 'white', stage: 0, score: {white: 0, black: 0}, pieces: [], ball: {carrierId: 'white-Q'}, randomState: seed, features: features(1, .2)});
  const apply = (state, x) => {
    const next = structuredClone(state); next.stage++;
    next.randomState = (Math.imul(state.randomState, 1664525) + 1013904223) >>> 0;
    if (goals && x === 1) next.score[state.team]++;
    next.team = next.stage === 1 ? 'white' : 'black';
    next.features = features(next.team === 'white' ? .75 : -.5, .1);
    if (next.stage === 3) next.phase = 'finished';
    return next;
  };
  return {
    createGame: ({seed}) => make(seed), currentTeam: state => state.phase === 'finished' ? null : state.team,
    rankedTacticalActions: () => [0, 1].map(x => ({action: {type: 'kick', x, y: 0}, rank: 1 - x})),
    tacticalSuccessors: (state, action) => [{probability: 1, state: apply({...state, randomState: 1}, action.x)}],
    tacticalBasePositionValue: (state, team) => (state.score.white - state.score.black) * (team === 'white' ? 2000 : -2000),
    rlValueFeatures: (state, team) => state.features.map(value => team === 'white' ? value : -value),
    rlValuePrediction: (state, team, weights) => valuePrediction(state.features.map(value => team === 'white' ? value : -value), weights),
    legalKicks: () => [0, 1].map(x => ({x, y: 0})), legalMoves: () => [], cornerTakers: () => [],
    applyKick: (state, x) => apply(state, x), chooseAIAction: () => ({type: 'kick', x: 0, y: 0}),
    analyzeTacticalAction: () => ({action: {type: 'kick', x: 0, y: 0}})
  };
}

test('TD(lambda) uses the exact tanh semi-gradient and accumulating trace', () => {
  const learner = createLearner({weights: features(.4), alpha: .1, gamma: .9, lambda: .8});
  const x = features(.5), next = features(.2), before = valuePrediction(x, learner.weights);
  const expectedBootstrap = Math.tanh(.4 * .2), expectedDelta = 1 + .9 * expectedBootstrap - before;
  const first = tdLambdaUpdate(learner, x, next, 1);
  assert.ok(Math.abs(first.delta - expectedDelta) < 1e-12);
  assert.ok(Math.abs(learner.weights[0] - (.4 + .1 * expectedDelta * (1 - before * before) * .5)) < 1e-12);
  const trace = learner.eligibility[0], prediction = valuePrediction(x, learner.weights);
  tdLambdaUpdate(learner, x, next, 0);
  assert.ok(Math.abs(learner.eligibility[0] - (.9 * .8 * trace + (1 - prediction * prediction) * .5)) < 1e-12);
});

test('the tanh gradient agrees with a finite difference', () => {
  const x = features(.8, -.2), w = features(.3, -.7), epsilon = 1e-6;
  const prediction = valuePrediction(x, w);
  for (let index = 0; index < 2; index++) {
    const high = [...w], low = [...w]; high[index] += epsilon; low[index] -= epsilon;
    const numerical = (valuePrediction(x, high) - valuePrediction(x, low)) / (2 * epsilon);
    assert.ok(Math.abs(numerical - (1 - prediction * prediction) * x[index]) < 1e-8);
  }
});

test('fixed-white values do not flip sign just because the next actor changes', () => {
  const learner = createLearner({weights: features(.2), gamma: .95, lambda: 0});
  const sameWhitePerspective = features(.7), nextWhitePerspective = features(.5);
  const update = tdLambdaUpdate(learner, sameWhitePerspective, nextWhitePerspective, 0);
  assert.equal(update.target, .95 * Math.tanh(.2 * .5));
  assert.ok(update.target > 0, 'a black action does not negate White’s predicted value');
});

test('color-reflected vectors and rewards produce identical weight updates', () => {
  const first = createLearner({weights: features(.3, -.1)}), second = createLearner({weights: features(.3, -.1)});
  const x = features(.7, -.2), next = features(.5, .1);
  tdLambdaUpdate(first, x, next, 1);
  tdLambdaUpdate(second, x.map(value => -value), next.map(value => -value), -1);
  assert.deepEqual(first.weights, second.weights);
});

test('research truncations bootstrap; only actual terminal states use zero', () => {
  const first = createLearner({weights: features(.5)}), second = createLearner({weights: features(.5)});
  assert.ok(tdLambdaUpdate(first, features(.2), features(.8), 0).bootstrap > 0);
  assert.equal(tdLambdaUpdate(second, features(.2), features(.8), 0, {terminal: true}).bootstrap, 0);
});

test('goal reward is the signed change in score and never rewards style features', () => {
  const before = {score: {white: 2, black: 1}, centerControl: -1};
  assert.equal(goalReward(before, {...before, centerControl: 1, openFiles: 1, possession: 1}), 0);
  assert.equal(goalReward(before, {score: {white: 3, black: 1}}), 1);
  assert.equal(goalReward(before, {score: {white: 2, black: 2}}), -1);
  assert.equal(goalReward(before, {score: {white: 2, black: 1}, phase: 'finished', winner: 'white'}), 0, 'a synthetic winner cannot invent a goal');
});

test('eligibility resets for a new game and learned weights remain finite and bounded', () => {
  const learner = createLearner({alpha: 1, maxWeight: .25});
  tdLambdaUpdate(learner, features(1), features(1), 100);
  assert.equal(learner.weights[0], .25);
  assert.ok(learner.weights.every(Number.isFinite));
  resetEligibility(learner); assert.deepEqual(learner.eligibility, zero());
  assert.throws(() => createLearner({weights: features(5)}));
  assert.throws(() => createLearner({gamma: 1.1}));
  assert.throws(() => createLearner({maxWeight: 5}));
  assert.throws(() => tdLambdaUpdate(learner, features(NaN), zero(), 0));
});

test('behavior RNG is seeded independently and reproducible', () => {
  const a = seededRandom(deriveSeed(100000, 2, 'behavior')), b = seededRandom(deriveSeed(100000, 2, 'behavior'));
  assert.deepEqual(Array.from({length: 20}, a), Array.from({length: 20}, b));
  assert.notEqual(deriveSeed(100000, 2, 'behavior'), deriveSeed(100000, 2, 'environment'));
});

test('planning cannot read the live PRNG or mutate the supplied game', () => {
  const rules = toyRules(), before = rules.createGame({seed: 9123}), snapshot = structuredClone(before);
  const original = rules.rankedTacticalActions;
  rules.rankedTacticalActions = (state, ...args) => {assert.equal(state.randomState, 1); return original(state, ...args);};
  const a = chooseTrainingAction(rules, before, zero());
  const b = chooseTrainingAction(rules, {...before, randomState: 2}, zero());
  assert.deepEqual(a, b); assert.deepEqual(before, snapshot);
  assert.deepEqual(planningView(before).log, []);
});

test('the behavior beam only explores legal shortlisted candidates', () => {
  const rules = toyRules(), state = rules.createGame({seed: 1});
  for (let seed = 0; seed < 20; seed++) {
    const decision = chooseTrainingAction(rules, state, zero(), {epsilon: 1, random: seededRandom(seed)});
    assert.equal(decision.explored, true); assertLegalAction(rules, state, decision.action);
  }
  assert.throws(() => assertLegalAction(rules, state, {type: 'kick', x: 999, y: 0}));
});

test('a forced certain goal beats recycling before the next keeper action', () => {
  const rules = toyRules(), state = rules.createGame({seed: 999});
  rules.tacticalBasePositionValue = next => next.score.white * 2000 + (next.recycle ? 150 : 100);
  rules.tacticalSuccessors = (before, action) => {
    assert.equal(before.randomState, 1);
    if (before.phase === 'keeperReact') return [{probability: 1, state: {...before, phase: 'kick', score: {white: 1, black: 0}}}];
    return [{probability: 1, state: {...before, phase: action.x === 1 ? 'keeperReact' : 'kick', recycle: action.x === 0}}];
  };
  const decision = chooseTrainingAction(rules, state, zero());
  assert.equal(decision.action.x, 1, 'the beam evaluates a declared shot through its public resolution');
  assert.equal(state.randomState, 999, 'actual shot randomness is still untouched');
});

test('the real engine beam and TD transitions obey the same legal phase machine', async () => {
  const {rules} = await loadTrainingEngine();
  const before = rules.createGame({seed: 100123}), snapshot = structuredClone(before);
  const a = chooseTrainingAction(rules, before, zero());
  const b = chooseTrainingAction(rules, {...before, randomState: 97}, zero());
  assert.deepEqual(a.action, b.action); assertLegalAction(rules, before, a.action); assert.deepEqual(before, snapshot);
  const result = trainEpisode(rules, createLearner(), {seed: 100123, actions: 12, epsilon: .12});
  assert.equal(result.stats.actions, 12); assert.equal(result.stats.truncated, true);
  assert.ok(result.stats.trace.every(item => item.team === 'white' || item.team === 'black'));
});

test('real reward events change weights; the episode uses fixed-white consecutive actions', () => {
  const rules = toyRules(), learner = createLearner();
  const {stats} = trainEpisode(rules, learner, {seed: 100000, episode: 2, actions: 3, epsilon: 0});
  assert.equal(stats.environmentSeed, 100002);
  assert.deepEqual(stats.trace.map(item => item.team), ['white', 'white', 'black']);
  assert.deepEqual(stats.goalEvents.map(item => item.reward), [1, 1, -1]);
  assert.ok(stats.updateL1 > 0); assert.ok(learner.weights.some(value => value !== 0));
  assert.equal(stats.terminal, true); assert.equal(stats.finalBootstrap, 0);
});

test('zero initial weights cannot learn merely by farming central or possession moves', () => {
  const rules = toyRules({goals: false}), learner = createLearner();
  const {stats} = trainEpisode(rules, learner, {actions: 3, epsilon: 0});
  assert.equal(stats.goalEvents.length, 0); assert.equal(stats.updateL1, 0); assert.deepEqual(learner.weights, zero());
});

test('a truncated episode keeps a nonzero bootstrap and resets old eligibility', () => {
  const rules = toyRules({goals: false}), learner = createLearner({weights: features(.3)});
  learner.eligibility.fill(1000);
  const {stats} = trainEpisode(rules, learner, {actions: 1, epsilon: 0});
  assert.equal(stats.truncated, true); assert.equal(stats.terminal, false); assert.notEqual(stats.finalBootstrap, 0);
  assert.ok(learner.eligibility.every(value => Math.abs(value) <= 1));
});

test('self-play is exactly reproducible under a fixed environment and behavior seed', () => {
  const a = trainEpisode(toyRules(), createLearner(), {actions: 3, seed: 100000, epsilon: .5});
  const b = trainEpisode(toyRules(), createLearner(), {actions: 3, seed: 100000, epsilon: .5});
  assert.deepEqual(a, b);
});

test('evaluation swaps learner colors with the same paired outcome seed and never changes weights', () => {
  const rules = toyRules(), weights = features(.2), before = [...weights];
  const first = evaluateEpisode(rules, weights, {game: 0, actions: 3, policy: 'beam', baselinePolicy: 'beam', seed: 400000});
  const second = evaluateEpisode(rules, weights, {game: 1, actions: 3, policy: 'beam', baselinePolicy: 'beam', seed: 400000});
  assert.equal(first.stats.environmentSeed, second.stats.environmentSeed);
  assert.equal(first.stats.learnerTeam, 'white'); assert.equal(second.stats.learnerTeam, 'black');
  assert.deepEqual(weights, before);
});

test('the reproducible CLI rejects ambiguous or invalid configurations', () => {
  assert.equal(parseArguments(['--episodes', '2', '--actions', '64']).episodes, 2);
  assert.equal(parseArguments(['--fouls']).foulsEnabled, true);
  assert.throws(() => parseArguments(['--evaluate', '--episodes', '3']));
  assert.throws(() => parseArguments(['--epsilon', '2']));
  assert.throws(() => parseArguments(['--alpha', '0']));
  assert.throws(() => parseArguments(['--nonsense', '1']));
  assert.throws(() => parseArguments(['--seed']));
  assert.throws(() => parseArguments(['--seed', '4294967295', '--episodes', '2']));
});

test('resumed checkpoints retain all prior training seeds and goal events for holdout exclusion', () => {
  const config = {seed: 100000, actions: 3, policy: 'beam', epsilon: 0};
  const firstLearner = createLearner(), first = trainEpisode(toyRules(), firstLearner, {...config, actions: 3});
  const parent = checkpoint(firstLearner, config, 1, 'engine-sha', zero(), [first.stats]);
  const nextLearner = createLearner({weights: parent.weights}), next = trainEpisode(toyRules(), nextLearner, {...config, seed: 110000, actions: 3});
  const resumed = checkpoint(nextLearner, {...config, seed: 110000}, 1, 'engine-sha', parent.weights, [next.stats], parent);
  assert.deepEqual(resumed.training.seeds, [100000, 110000]);
  assert.equal(resumed.training.episodes, 2); assert.equal(resumed.training.totalTransitions, 6);
  assert.equal(resumed.training.goalEvents, 6); assert.equal(resumed.updates, 6);
  assert.deepEqual(resumed.training.originInitialWeights, zero());
  assert.equal(resumed.training.runs.length, 2);
});
