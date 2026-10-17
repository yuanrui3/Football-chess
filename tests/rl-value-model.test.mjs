import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as E from '../dist/engine.js';
import * as B from '../training/frozen/engine-v37.mjs';

const source = await readFile(new URL('../dist/engine.js', import.meta.url), 'utf8');
const I = await import(`data:text/javascript;base64,${Buffer.from(source + '\nexport {tacticalBasePositionValue,tacticalPositionValue};').toString('base64')}`);
const weights = [.2, .3, -.1, .4, .3, .2, .25];

test('playable checkpoint matches the selected training artifact and honors its release gate', async () => {
  const checkpoint = JSON.parse(await readFile(new URL('../training/selected-model.json', import.meta.url), 'utf8'));
  const release = JSON.parse(await readFile(new URL('../docs/selfplay-rl-2026-10-16/release.json', import.meta.url), 'utf8'));
  assert.deepEqual(E.RL_VALUE_MODEL.featureNames, checkpoint.featureNames);
  assert.deepEqual(E.RL_VALUE_MODEL.weights, checkpoint.weights);
  assert.equal(E.RL_VALUE_MODEL.trained, true);
  assert.equal(E.RL_VALUE_MODEL.enabled, release.defaultEnabled);
  assert.equal(release.defaultEnabled, release.promotionGatePassed);
  assert.equal(E.RL_VALUE_MODEL.checkpointSha256, release.checkpointSha256);
  assert.equal(E.RL_VALUE_MODEL.trainingSegments, checkpoint.training.episodes);
});

test('training and playable engine use the exact same generated board features', async () => {
  const featureSource = await readFile(new URL('../scripts/rl-features.mjs', import.meta.url), 'utf8');
  const embedded = source.split('// BEGIN GENERATED RL BOARD FEATURES — source: scripts/rl-features.mjs\n')[1].split('\n// END GENERATED RL BOARD FEATURES')[0];
  assert.equal(embedded.trim(), featureSource.trim());
});

test('seven bounded value features exclude the score ledger and hidden random state', () => {
  const s = E.createGame({seed: 100001});
  const before = structuredClone(s), features = E.rlValueFeatures(s, 'white');
  assert.equal(features.length, 7); assert.ok(features.every(x => Number.isFinite(x) && Math.abs(x) <= 1));
  assert.deepEqual(E.rlValueFeatures(s, 'black'), features.map(x => -x));
  const changed = {...structuredClone(s), score: {white: 123, black: 999}, randomState: 0xffffffff};
  assert.deepEqual(E.rlValueFeatures(changed, 'white'), features);
  assert.deepEqual(s, before);
});

test('null and all-zero weights preserve the frozen baseline completed search exactly', () => {
  const opening = E.createGame({seed: 100002});
  const first = B.chooseAIAction(opening, {difficulty: 'casual'});
  const received = E.applyKick(opening, first.x, first.y, {roll: 0});
  const options = {maxDepth: 2, nodeLimit: 120, extensions: false};
  for (const s of [opening, received]) {
    const baseline = B.analyzeTacticalAction(s, options);
    assert.deepEqual(E.analyzeTacticalAction(s, {...options, modelWeights: null}), baseline);
    assert.deepEqual(E.analyzeTacticalAction(s, {...options, modelWeights: Array(7).fill(0)}), baseline);
  }
});

test('learned residual stays bounded, changes perspective correctly and cannot override a terminal result', () => {
  const s = E.createGame({seed: 100003});
  const white = I.tacticalPositionValue(s, 'white', weights) - I.tacticalBasePositionValue(s, 'white');
  const black = I.tacticalPositionValue(s, 'black', weights) - I.tacticalBasePositionValue(s, 'black');
  assert.ok(Math.abs(white) <= 80); assert.ok(Math.abs(white + black) < 1e-9);
  const ended = {...s, phase: 'finished', winner: 'white'};
  assert.equal(I.tacticalPositionValue(ended, 'white', weights), 1000000);
  assert.equal(I.tacticalPositionValue(ended, 'black', weights), -1000000);
});

test('invalid checkpoints fail clearly instead of introducing NaN evaluations', () => {
  for (const bad of [[1], Array(7).fill(NaN), Array(7).fill(Infinity), Array(7).fill(5), 'weights', {}]) {
    assert.throws(() => E.rlValidateWeights(bad), /seven finite weights/);
    assert.throws(() => E.analyzeTacticalAction(E.createGame(), {modelWeights: bad}), /seven finite weights/);
  }
  assert.deepEqual(E.rlValidateWeights(new Float32Array(7)), Array(7).fill(0));
});

test('learned search stays bounded, seed blind and pure; Casual remains unchanged', () => {
  const s = E.createGame({seed: 100004}), before = structuredClone(s);
  const options = {maxDepth: 2, nodeLimit: 120, extensions: false, modelWeights: weights};
  const report = E.analyzeTacticalAction(s, options);
  assert.ok(report.stats.nodes <= 120); assert.ok(Number.isFinite(report.value));
  assert.deepEqual(E.analyzeTacticalAction({...s, randomState: 0xffffffff}, options), report);
  assert.deepEqual(s, before);
  assert.deepEqual(E.chooseAIAction(s, {difficulty: 'casual', modelWeights: weights}), B.chooseAIAction(s, {difficulty: 'casual'}));
});
