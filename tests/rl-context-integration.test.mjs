import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as E from '../dist/engine.js';
import * as Frozen from '../training/frozen/engine-v37.mjs';
import {rlContextValueFeatures, RL_CONTEXT_FEATURE_NAMES} from '../scripts/rl-context-features.mjs';
import {rlShotValueFeatures, RL_SHOT_FEATURE_NAMES} from '../scripts/rl-shot-features.mjs';

test('browser context encoder is the exact source used for offline learning', async () => {
  const source = await readFile(new URL('../dist/engine.js', import.meta.url), 'utf8');
  const moduleSource = await readFile(new URL('../scripts/rl-context-features.mjs', import.meta.url), 'utf8');
  const embedded = source.split('// BEGIN GENERATED RL CONTEXT FEATURES — source: scripts/rl-context-features.mjs\n')[1].split('\n// END GENERATED RL CONTEXT FEATURES')[0];
  assert.equal(embedded.trim(), moduleSource.split('\n').slice(1).join('\n').trim());
  assert.deepEqual(E.RL_CONTEXT_FEATURE_NAMES, RL_CONTEXT_FEATURE_NAMES);
});

test('all model families preserve baseline search when their weights are zero', () => {
  const state = E.createGame({seed: 120000});
  const options = {maxDepth: 2, nodeLimit: 120, extensions: false};
  const expected = Frozen.analyzeTacticalAction(state, options);
  for (const length of [7, 28, 37]) {
    assert.deepEqual(E.analyzeTacticalAction(state, {...options, modelWeights: Array(length).fill(0)}), expected);
  }
});

test('browser 37-feature encoder is the exact offline source with the same feature ordering', async () => {
  const source = await readFile(new URL('../dist/engine.js', import.meta.url), 'utf8');
  const moduleSource = await readFile(new URL('../scripts/rl-shot-features.mjs', import.meta.url), 'utf8');
  const embedded = source.split('// BEGIN GENERATED RL SHOT FEATURES — source: scripts/rl-shot-features.mjs\n')[1].split('\n// END GENERATED RL SHOT FEATURES')[0];
  assert.equal(embedded.trim(), moduleSource.split('\n').slice(1).join('\n').trim());
  assert.deepEqual(E.RL_SHOT_FEATURE_NAMES, RL_SHOT_FEATURE_NAMES);
});

test('37-feature inference uses exact public tactical metrics and preserves the contextual prefix', async () => {
  const source = await readFile(new URL('../dist/engine.js', import.meta.url), 'utf8');
  const internal = await import(`data:text/javascript;base64,${Buffer.from(source + '\nexport {tacticalShots,tacticalOutlets};').toString('base64')}`);
  const state = E.createGame({seed: 120003});
  state.pieces = [
    {id: 'white-K', team: 'white', type: 'K', x: 6, y: 16},
    {id: 'black-K', team: 'black', type: 'K', x: 7, y: 0},
    {id: 'white-Q', team: 'white', type: 'Q', x: 6, y: 2},
    {id: 'white-R1', team: 'white', type: 'R', x: 7, y: 2},
    {id: 'black-B1', team: 'black', type: 'B', x: 0, y: 10}
  ];
  state.ball = {x: 6, y: 2, carrierId: 'white-Q'}; state.phase = 'kick'; state.attack = 'white';
  const before = structuredClone(state), carrier = state.pieces.find(piece => piece.id === state.ball.carrierId);
  const outlets = internal.tacticalOutlets(state, carrier);
  const metrics = {bestShot: internal.tacticalShots(state, carrier.team, true), bestOutlet: outlets.best, secondOutlet: outlets.second};
  assert.ok(metrics.bestShot > 0);
  const context = E.rlContextFeatures(state, 'white'), expected = rlShotValueFeatures(state, 'white', context, metrics);
  const features = E.rlShotFeatures(state, 'white');
  assert.deepEqual(features, expected); assert.deepEqual(features.slice(0, 28), context);
  assert.ok(features.every(value => Number.isFinite(value) && Math.abs(value) <= 1));
  assert.deepEqual(E.rlShotFeatures(state, 'black'), features.map(value => -value));
  const weights = Array.from({length: 37}, (_, index) => (index % 7 - 3) / 20);
  const prediction = Math.tanh(features.reduce((sum, value, index) => sum + value * weights[index], 0));
  assert.equal(E.rlValuePrediction(state, 'white', weights), prediction);
  assert.equal(E.rlValuePrediction(state, 'black', weights), -prediction);
  assert.deepEqual(E.rlShotFeatures({...state, randomState: 0xffffffff, score: {white: 313, black: 911}}), features);
  assert.deepEqual(E.rlValidateWeights(new Float32Array(37)), Array(37).fill(0));
  assert.deepEqual(state, before);
});

test('context inference matches training, remains antisymmetric, seed blind and score excluded', () => {
  const state = E.createGame({seed: 120001});
  const before = structuredClone(state), weights = Array.from({length: 28}, (_, i) => (i % 5 - 2) / 10);
  const features = rlContextValueFeatures(state, 'white', E.rlValueFeatures(state, 'white'));
  assert.deepEqual(E.rlContextFeatures(state, 'white'), features);
  assert.deepEqual(E.rlContextFeatures(state, 'black'), features.map(value => -value));
  assert.equal(E.rlValuePrediction(state, 'white', weights), Math.tanh(features.reduce((sum, x, i) => sum + x * weights[i], 0)));
  assert.equal(E.rlValuePrediction(state, 'black', weights), -E.rlValuePrediction(state, 'white', weights));
  assert.deepEqual(E.rlContextFeatures({...state, randomState: 123, score: {white: 31, black: 89}}), features);
  assert.deepEqual(state, before);
  assert.deepEqual(E.rlValidateWeights(new Float32Array(28)), Array(28).fill(0));
});

test('80 and 320 scales change only the learned residual and preserve terminal and zero-model values', async () => {
  const source = await readFile(new URL('../dist/engine.js', import.meta.url), 'utf8');
  const internal = await import(`data:text/javascript;base64,${Buffer.from(source + '\nexport {tacticalPositionValue,tacticalBasePositionValue};').toString('base64')}`);
  const state = E.createGame({seed: 120002}), weights = Array(28).fill(0.04);
  const base = internal.tacticalBasePositionValue(state, 'white');
  const small = internal.tacticalPositionValue(state, 'white', weights, 80) - base;
  const large = internal.tacticalPositionValue(state, 'white', weights, 320) - base;
  assert.ok(Math.abs(large - 4 * small) < 1e-9);
  assert.ok(Math.abs(large) <= 320);
  assert.equal(internal.tacticalPositionValue({...state, phase: 'finished', winner: 'white'}, 'white', weights, 320), 1000000);
  const options = {nodeLimit: 120, maxDepth: 2, extensions: false};
  assert.deepEqual(E.analyzeTacticalAction(state, {...options, modelWeights: Array(28).fill(0), modelScale: 320}), Frozen.analyzeTacticalAction(state, options));
  for (const scale of [0, -80, 81, NaN, Infinity, '320']) assert.throws(() => E.analyzeTacticalAction(state, {...options, modelWeights: weights, modelScale: scale}), /80 or 320/);
});
