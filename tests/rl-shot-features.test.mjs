import test from 'node:test';
import assert from 'node:assert/strict';
import {RL_CONTEXT_FEATURE_NAMES, rlContextValueFeatures} from '../scripts/rl-context-features.mjs';
import {RL_SHOT_FEATURE_NAMES, rlShotValueFeatures} from '../scripts/rl-shot-features.mjs';
import {createGame} from '../dist/engine.js';

function fixture() {
  const state = createGame({seed: 114});
  state.ball = {...state.pieces.find(piece => piece.id === 'white-Q'), carrierId: 'white-Q'};
  return {state, context: rlContextValueFeatures(state)};
}
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-12, `${a} != ${b}`);

test('37-feature shooting family keeps the exact normalized contextual prefix', () => {
  const {state, context} = fixture();
  const vector = rlShotValueFeatures(state, 'white', context, {bestShot: .31, bestOutlet: .24, secondOutlet: .09});
  assert.equal(vector.length, 37); assert.equal(new Set(RL_SHOT_FEATURE_NAMES).size, 37);
  assert.deepEqual(RL_SHOT_FEATURE_NAMES.slice(0, 28), RL_CONTEXT_FEATURE_NAMES);
  assert.deepEqual(vector.slice(0, 28), context);
  assert.deepEqual(vector.slice(-3), [.31, .24, .09]);
  assert.ok(vector.every(value => Number.isFinite(value) && Math.abs(value) <= 1));
});

test('all supplied metrics and carrier features reverse requested perspective exactly', () => {
  const {state, context} = fixture(), metrics = {bestShot: .8, bestOutlet: .2, secondOutlet: .1};
  const white = rlShotValueFeatures(state, 'white', context, metrics);
  const black = rlShotValueFeatures(state, 'black', context, metrics);
  white.forEach((value, index) => close(value, -black[index]));
  state.pieces.find(piece => piece.id === 'white-Q').team = 'black';
  const changed = rlShotValueFeatures(state, 'white', context, metrics);
  assert.deepEqual(changed.slice(-3), [-.8, -.2, -.1]);
});

test('native carrier piece identities are distinct signed one-hot features', () => {
  const {state, context} = fixture(), carrier = state.pieces.find(piece => piece.id === 'white-Q');
  for (const [index, type] of ['K', 'Q', 'R', 'B', 'N', 'P'].entries()) {
    carrier.type = type;
    for (const side of ['white', 'black']) {
      carrier.team = side;
      const expected = Array(6).fill(0); expected[index] = side === 'white' ? 1 : -1;
      assert.deepEqual(rlShotValueFeatures(state, 'white', context).slice(28, 34), expected);
    }
  }
});

test('encoder is pure, ignores score and hidden RNG, and consumes the supplied public metrics', () => {
  const {state, context} = fixture(), metrics = {bestShot: .6, bestOutlet: .2, secondOutlet: .1};
  const before = structuredClone(state), contextBefore = [...context], metricsBefore = {...metrics};
  const vector = rlShotValueFeatures(state, 'white', context, metrics);
  assert.deepEqual(rlShotValueFeatures({...state, randomState: 0xffffffff, score: {white: 999, black: 13}}, 'white', context, metrics), vector);
  assert.deepEqual(state, before); assert.deepEqual(context, contextBefore); assert.deepEqual(metrics, metricsBefore);
  assert.notDeepEqual(rlShotValueFeatures(state, 'white', context, {...metrics, bestShot: .8}), vector);
});

test('probabilities are bounded and invalid inputs fail without NaN propagation', () => {
  const {state, context} = fixture();
  assert.deepEqual(rlShotValueFeatures(state, 'white', context, {bestShot: 12, bestOutlet: -3, secondOutlet: 1}).slice(-3), [1, 0, 1]);
  assert.throws(() => rlShotValueFeatures(state, 'white', context, {bestShot: NaN}), /must be finite/);
  assert.throws(() => rlShotValueFeatures(state, 'white', context, {bestOutlet: Infinity}), /must be finite/);
  assert.throws(() => rlShotValueFeatures(state, 'white', Array(7).fill(0)), /28 finite normalized/);
  assert.throws(() => rlShotValueFeatures(state, 'white', Array(28).fill(2)), /28 finite normalized/);
});

test('loose-ball states do not invent carrier identity or shooting values', () => {
  const {state, context} = fixture(); state.ball.carrierId = null;
  assert.deepEqual(rlShotValueFeatures(state, 'white', context, {bestShot: .9, bestOutlet: .8, secondOutlet: .7}).slice(28), Array(9).fill(0));
});
