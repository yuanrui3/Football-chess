import test from 'node:test';
import assert from 'node:assert/strict';
import {Worker} from 'node:worker_threads';
import {once} from 'node:events';
import * as rules from '../dist/engine.js';
import {fixture} from './helpers/shot-fixture.mjs';
import {validateSeeds, validateCheckpoint, checkIntegrity, validateAction, publicDecisionState,
  makeSearchPolicy, createWarmStart, runEvaluationScenario, evaluatePaired, summarizeEvaluation,
  EVALUATION_GATE, seedBootstrap, evaluatePairedParallel} from '../scripts/evaluate-selfplay.mjs';

const featureNames = ['possession', 'ballProgress', 'material', 'centerControl', 'openFiles', 'defensiveCover', 'centralReceivers'];
const checkpoint = () => ({algorithm: 'TD(lambda)', scale: 80, featureNames, weights: [0, 0, 0, 0, 0, 0, 0]});
const kickoffAction = state => {
  if (['kick', 'kickoff', 'keeperRelease'].includes(state.phase)) {
    const kick = rules.legalKicks(state).find(kick => !kick.goal) || rules.legalKicks(state)[0];
    return kick ? {type: 'kick', x: kick.x, y: kick.y} : {type: 'skip'};
  }
  if (state.phase === 'cornerSelect') return {type: 'cornerTaker', pieceId: rules.cornerTakers(state)[0].id};
  return {type: 'skip'};
};

test('heldout evaluation has disjoint, explicit train/dev/test partitions', () => {
  assert.deepEqual(validateSeeds([400000, 400003]), [400000, 400003]);
  assert.deepEqual(validateSeeds([300000], 'dev'), [300000]);
  for (const seeds of [[], [400000, 400000], [100000], [300000], [500000], [400000.5]]) assert.throws(() => validateSeeds(seeds));
  assert.throws(() => validateSeeds([400000], 'test', [400000]), /overlaps/);
  assert.throws(() => validateSeeds([100000], 'train'));
});

test('checkpoint must match the trained seven-feature tanh evaluator', () => {
  assert.deepEqual(validateCheckpoint(checkpoint()), Array(7).fill(0));
  for (const bad of [{...checkpoint(), scale: 800}, {...checkpoint(), weights: [1]},
    {...checkpoint(), weights: [NaN, 0, 0, 0, 0, 0, 0]}, {...checkpoint(), algorithm: 'GAN'},
    {...checkpoint(), featureNames: [...featureNames].reverse()}]) assert.throws(() => validateCheckpoint(bad));
});

test('decision boards hide the outcome PRNG without mutating the true state', () => {
  const state = rules.createGame({seed: 0xdeadbeef}), snapshot = structuredClone(state);
  const visible = publicDecisionState(state);
  assert.equal(visible.randomState, 0);
  assert.deepEqual(state, snapshot);
  visible.score.white = 8; assert.equal(state.score.white, 0);
});

test('both search policies receive exactly the declared allowance', () => {
  const calls = [], module = {analyzeTacticalAction: (state, options) => {calls.push(options); return {action: kickoffAction(state), stats: {nodes: options.nodeLimit}};}};
  makeSearchPolicy(module, {nodeLimit: 128, maxDepth: 3, extensions: false, modelWeights: [1, 2]})(rules.createGame());
  assert.deepEqual(calls, [{modelWeights: [1, 2], nodeLimit: 128, maxDepth: 3, extensions: false}]);
});

test('paired scenarios swap candidate color and kickoff from identical legal warm starts', async () => {
  const calls = [], candidate = {analyzeTacticalAction: (state, options) => {calls.push({state: structuredClone(state), options}); return {action: kickoffAction(state), stats: {nodes: 1, completedDepth: 1}};}};
  const baseline = {analyzeTacticalAction: candidate.analyzeTacticalAction};
  const result = await evaluatePaired({baselineModule: baseline, candidateModule: candidate,
    seeds: [300001], split: 'dev', modelWeights: Array(7).fill(0.1), nodeLimit: 10, maxDepth: 1, actionLimit: 2, warmup: 1, record: true});
  assert.equal(result.matches.length, 4);
  assert.deepEqual(result.matches.map(match => `${match.candidateColor}:${match.kickoff}`), ['white:white', 'black:white', 'white:black', 'black:black']);
  assert.equal(result.summary.errors.length, 0);
  assert.ok(result.matches.every(match => match.actions === 2));
  assert.ok(calls.every(call => call.state.randomState === 0 && call.state.pieces.length === 22 && call.options.nodeLimit === 10 && call.options.maxDepth === 1));
  assert.deepEqual(result.matches[0].events, result.matches[1].events, 'identical policies and same kickoff see identical real outcomes despite candidate color');
  assert.equal(result.summary.promotionGate.passed, false, 'tiny development checks never establish strength');
});

test('legal Casual warmup is reproducible and input scores remain separate', () => {
  const first = createWarmStart({seed: 300004, kickoff: 'black', warmup: 8});
  const second = createWarmStart({seed: 300004, kickoff: 'black', warmup: 8});
  assert.deepEqual(first, second); assert.equal(checkIntegrity(rules, first), true);
  const scored = {...structuredClone(first), score: {white: 3, black: 2}};
  const result = runEvaluationScenario({initialState: scored, whitePolicy: kickoffAction, blackPolicy: kickoffAction, actionLimit: 1});
  assert.deepEqual(result.initialScore, {white: 3, black: 2});
  assert.deepEqual(result.score, {white: 0, black: 0});
});

test('shot launched on the final action is resolved and its xG counted', () => {
  const state = fixture({type: 'R', origin: [6, 4]});
  const shot = rules.legalKicks(state).find(kick => kick.goal === 'white'); assert.ok(shot);
  const policy = game => game.phase === 'keeperReact' ? {type: 'skip'} : {type: 'kick', x: shot.x, y: shot.y};
  const result = runEvaluationScenario({initialState: state, whitePolicy: policy, blackPolicy: policy, actionLimit: 1, record: true});
  assert.equal(result.error, null); assert.equal(result.pendingShot, false);
  assert.equal(result.actions, 2); assert.equal(result.extraResolutionActions, 1);
  assert.equal(result.stats.white.shots, 1); assert.equal(result.stats.white.resolvedShots, 1);
  assert.ok(result.stats.white.xG > 0 && result.stats.white.xG <= 1);
});

test('ordinary-round horizon stops only after a completed round', () => {
  const state = fixture({type: 'R', origin: [6, 4]});
  const kick = rules.legalKicks(state).find(kick => !kick.goal);
  const result = runEvaluationScenario({initialState: state, whitePolicy: () => ({type: 'kick', x: kick.x, y: kick.y}),
    blackPolicy: kickoffAction, roundLimit: 1, actionLimit: 3});
  assert.equal(result.error, null); assert.equal(result.completedOrdinaryRounds, 1); assert.equal(result.actions, 1);
});

test('illegal actions, input mutation, excessive nodes and safety cutoffs are reported', () => {
  const options = {whitePolicy: kickoffAction, blackPolicy: kickoffAction, actionLimit: 1};
  const illegal = runEvaluationScenario({...options, whitePolicy: () => ({type: 'move', pieceId: 'white-Q', x: 99, y: 99})});
  assert.match(illegal.error.message, /Illegal policy move/);
  const mutation = runEvaluationScenario({...options, whitePolicy: state => {state.randomState = 4; return kickoffAction(state);}});
  assert.match(mutation.error.message, /mutated/);
  const exceeded = runEvaluationScenario({...options, nodeLimit: 1, whitePolicy: state => ({action: kickoffAction(state), stats: {nodes: 2}})});
  assert.match(exceeded.error.message, /node allowance/);
  const safety = runEvaluationScenario({...options, roundLimit: 100, safetyActionLimit: 2});
  assert.equal(safety.error, null); assert.equal(safety.safetyLimitReached, true);
});

test('roster, ball and goalkeeper integrity are enforced before play', () => {
  const state = rules.createGame(); assert.equal(checkIntegrity(rules, state), true);
  assert.throws(() => checkIntegrity(rules, {...state, pieces: state.pieces.slice(1)}), /22/);
  const overlap = structuredClone(state); Object.assign(overlap.pieces[1], {x: overlap.pieces[0].x, y: overlap.pieces[0].y});
  assert.throws(() => checkIntegrity(rules, overlap), /occupancy/);
  assert.throws(() => checkIntegrity(rules, {...state, ball: {...state.ball, x: 0}}), /carrier/);
  assert.throws(() => validateAction(rules, state, {type: 'skip'}), /skip/);
});

test('promotion requires paired goal and WDL advantage plus held-out production evidence', async () => {
  const module = {analyzeTacticalAction: state => ({action: kickoffAction(state), stats: {nodes: 1}})};
  const tiny = await evaluatePaired({baselineModule: module, candidateModule: module, split: 'test', seeds: [400001], actionLimit: 1, nodeLimit: 1, maxDepth: 1});
  const matches = [];
  for (let seed = 400001; seed < 400001 + EVALUATION_GATE.minimumSeeds; seed++) for (const candidateColor of ['white', 'black']) for (const kickoff of ['white', 'black']) {
    const match = structuredClone(tiny.matches[0]);
    Object.assign(match, {seed, candidateColor, kickoff, actions: 120, actionLimit: 120, candidateResult: 'win', score: {[candidateColor]: 1, [candidateColor === 'white' ? 'black' : 'white']: 0}});
    for (const team of ['white', 'black']) Object.assign(match.stats[team], {actions: 60, goals: team === candidateColor ? 1 : 0, resolvedShots: 1, xG: 0.4});
    matches.push(match);
  }
  const config = {split: 'test', actionLimit: 120, nodeLimit: 1400, maxDepth: 8};
  assert.equal(summarizeEvaluation(matches, config).promotionGate.passed, true);
  const developmentGate = summarizeEvaluation(matches, {...config, split: 'dev'}).promotionGate;
  assert.equal(developmentGate.checks.heldOutTestSplit, false);
  assert.equal(developmentGate.passed, false, 'a large winning development run cannot promote a checkpoint');
  assert.ok(Object.entries(developmentGate.checks).filter(([name]) => name !== 'heldOutTestSplit').every(([, passed]) => passed),
    'the split alone rejects otherwise sufficient development evidence');
  const duplicate = structuredClone(matches); duplicate[0].candidateColor = duplicate[1].candidateColor; duplicate[0].kickoff = duplicate[1].kickoff;
  assert.equal(summarizeEvaluation(duplicate, config).promotionGate.checks.completePairing, false);
  const noGoals = matches.map(match => ({...match, candidateResult: 'draw', score: {white: 0, black: 0}, stats: {...match.stats, [match.candidateColor]: {...match.stats[match.candidateColor], goals: 0}}}));
  assert.equal(summarizeEvaluation(noGoals, config).promotionGate.passed, false);
});

test('two real shallow Tactical decisions obey the independent evaluation checks', () => {
  const policy = makeSearchPolicy(rules, {modelWeights: null, nodeLimit: 8, maxDepth: 1, extensions: false});
  const result = runEvaluationScenario({whitePolicy: policy, blackPolicy: policy, seed: 400010, actionLimit: 2, nodeLimit: 8});
  assert.equal(result.error, null); assert.equal(result.actions, 2);
  assert.ok(result.stats.white.maxNodes <= 8 && result.stats.black.maxNodes <= 8);
});

test('uncertainty resamples complete seed groups reproducibly', () => {
  const paired = [{seed: 1, scenarios: 4, goalDifference: 4, points: 4}, {seed: 2, scenarios: 4, goalDifference: -4, points: 0}];
  const first = seedBootstrap(paired, 200);
  assert.deepEqual(first, seedBootstrap(paired, 200));
  assert.deepEqual(first.wdlScore95, [0, 1]);
  assert.deepEqual(first.meanGoalDifferencePerScenario95, [-1, 1]);
  assert.equal(seedBootstrap(paired.slice(0, 1)).wdlScore95, null);
});

test('parallel workers retain serial scenario order, choices and true outcomes', async () => {
  const modulePath = new URL('../dist/engine.js', import.meta.url);
  const options = {seeds: [400017], split: 'test', modelWeights: Array(7).fill(0.02),
    nodeLimit: 8, maxDepth: 1, extensions: false, actionLimit: 2, warmup: 0, record: true};
  const serial = await evaluatePaired({...options, candidateModule: rules, baselineModule: rules});
  const completion = [];
  const parallel = await evaluatePairedParallel({...options, candidatePath: modulePath, baselinePath: modulePath, workers: 2,
    onScenario: (match, count, index) => completion.push({index, count})});
  assert.equal(parallel.config.workers, 2); assert.equal(parallel.summary.errors.length, 0);
  assert.equal(completion.length, 4); assert.equal(new Set(completion.map(item => item.index)).size, 4);
  assert.deepEqual(parallel.matches.map(match => `${match.seed}:${match.kickoff}:${match.candidateColor}`), serial.matches.map(match => `${match.seed}:${match.kickoff}:${match.candidateColor}`));
  for (let index = 0; index < serial.matches.length; index++) {
    const first = serial.matches[index], second = parallel.matches[index];
    assert.deepEqual(first.events, second.events);
    assert.deepEqual(first.finalState, second.finalState);
    for (const side of ['white', 'black']) {
      const deterministic = stats => Object.fromEntries(Object.entries(stats).filter(([key]) => key !== 'thinkMs'));
      assert.deepEqual(deterministic(first.stats[side]), deterministic(second.stats[side]));
    }
  }
  assert.deepEqual(parallel.summary.promotionGate, serial.summary.promotionGate);
  await assert.rejects(evaluatePairedParallel({...options, baselinePath: modulePath, workers: 0}), /workers/);
});

test('worker protocol rejects malformed jobs and can be terminated cleanly', async () => {
  const moduleUrl = new URL('../dist/engine.js', import.meta.url).href;
  const worker = new Worker(new URL('../scripts/evaluate-selfplay-worker.mjs', import.meta.url), {workerData: {
    rulesUrl: moduleUrl, candidateUrl: moduleUrl, baselineUrl: moduleUrl, modelWeights: null,
    nodeLimit: 8, maxDepth: 1, extensions: false, actionLimit: 2, roundLimit: null, record: false}});
  try {
    const [ready] = await once(worker, 'message'); assert.equal(ready.type, 'ready');
    const pending = once(worker, 'message'); worker.postMessage({type: 'wrong', index: 1});
    const [reply] = await pending; assert.equal(reply.type, 'error'); assert.match(reply.message, /Invalid.*task/);
  } finally {await worker.terminate();}
});
