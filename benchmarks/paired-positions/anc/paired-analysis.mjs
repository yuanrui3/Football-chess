import assert from 'node:assert/strict';
import {compareShots} from './compare-shots.mjs';

const conditions = ['board', 'replies', 'odds'];
const bootstrapSamples = 20_000;
const bootstrapSeed = 27058201;

function groupPairs(keys) {
  const pairs = new Map();
  for (const k of keys) {
    assert.ok(Number.isSafeInteger(k.block), k.id + ' requires a generation block');
    if (!pairs.has(k.pair)) pairs.set(k.pair, {id: k.pair, block: k.block, boards: []});
    const pair = pairs.get(k.pair);
    assert.equal(pair.block, k.block, k.pair + ' spans generation blocks');
    pair.boards.push(k.id);
  }
  const blocks = new Map();
  // Fix sampling order even when a caller shuffles the board or response rows.
  for (const pair of [...pairs.values()].sort((a, b) => a.id.localeCompare(b.id))) {
    if (!blocks.has(pair.block)) blocks.set(pair.block, []);
    blocks.get(pair.block).push(pair);
  }
  return [...blocks.entries()].sort(([a], [b]) => a - b);
}

function bootstrapInterval(strata, n) {
  let state = bootstrapSeed;
  const samples = [];
  for (let draw = 0; draw < bootstrapSamples; draw++) {
    let change = 0;
    for (const differences of strata) {
      for (let i = 0; i < differences.length; i++) {
        state = (Math.imul(1664525, state) + 1013904223) >>> 0;
        const index = Math.floor((state / 4294967296) * differences.length);
        change += differences[index];
      }
    }
    samples.push(change / n);
  }
  samples.sort((a, b) => a - b);
  // Empirical inverse-CDF percentiles preserve the discrete accuracy scale.
  return [samples[Math.ceil(0.025 * bootstrapSamples) - 1], samples[Math.ceil(0.975 * bootstrapSamples) - 1]];
}

function contrast(scored, blocks) {
  const {items, pairs} = scored.matched;
  const boards = new Map(scored.boardDiagnostics.map(d => [d.id, d]));
  const strata = [], byBlock = [];
  for (const [block, group] of blocks) {
    const differences = [];
    let leftSolved = 0, rightSolved = 0;
    for (const pair of group) {
      const left = pair.boards.every(id => boards.get(id).left.correct);
      const right = pair.boards.every(id => boards.get(id).right.correct);
      leftSolved += Number(left);
      rightSolved += Number(right);
      differences.push(Number(right) - Number(left));
    }
    byBlock.push({block, pairs: group.length, leftSolved, rightSolved,
      pairDifference: (rightSolved - leftSolved) / group.length});
    strata.push(differences);
  }
  assert.equal(byBlock.reduce((sum, b) => sum + b.pairs, 0), pairs.total);
  assert.equal(byBlock.reduce((sum, b) => sum + b.rightSolved - b.leftSolved, 0), pairs.rightOnly - pairs.leftOnly);
  return {matched: scored.matched, boardDifference: (items.rightOnly - items.leftOnly) / items.total,
    pairDifference: (pairs.rightOnly - pairs.leftOnly) / pairs.total,
    pairCI95: bootstrapInterval(strata, pairs.total), byBlock};
}

function adjustPrimaryP(contrasts) {
  const ordered = [...contrasts].sort((a, b) => a.matched.pairs.exactTwoSidedP - b.matched.pairs.exactTwoSidedP);
  let adjusted = 0;
  for (const [i, c] of ordered.entries()) {
    adjusted = Math.max(adjusted, Math.min(1, (ordered.length - i) * c.matched.pairs.exactTwoSidedP));
    c.holmAdjustedP = adjusted;
  }
}

export function analyzeStudy(keys, rows) {
  assert.ok(Array.isArray(keys) && keys.length && Array.isArray(rows), 'Expected study keys and responses');
  const orderedKeys = [...keys].sort((a, b) => a.id.localeCompare(b.id));
  const blocks = groupPairs(orderedKeys);
  const models = [...new Set(rows.map(r => r.model))].sort();
  assert.ok(models.length === 2 && models.every(m => typeof m === 'string' && m.trim().length > 0),
    'Expected two named models');
  assert.ok(rows.every(r => conditions.includes(r.condition)), 'Unknown information condition');
  const arms = new Map(models.map(model => [model, Object.fromEntries(conditions.map(c =>
    [c, rows.filter(r => r.model === model && r.condition === c).sort((a, b) => a.id.localeCompare(b.id))]))]));
  const byModel = new Map(), primary = [];
  let baselines;
  for (const model of models) {
    const {board, replies, odds} = arms.get(model);
    const first = compareShots(orderedKeys, board, replies), second = compareShots(orderedKeys, replies, odds);
    baselines ??= first.baselines;
    const contrasts = {repliesMinusBoard: contrast(first, blocks), oddsMinusReplies: contrast(second, blocks)};
    primary.push(...Object.values(contrasts));
    byModel.set(model, {arms: {board: first.left, replies: first.right, odds: second.right}, contrasts});
  }
  adjustPrimaryP(primary);
  const [leftModel, rightModel] = models;
  const byCondition = Object.fromEntries(conditions.map(c => [c, contrast(
    compareShots(orderedKeys, arms.get(leftModel)[c], arms.get(rightModel)[c]), blocks)]));
  return {
    models, conditions: [...conditions], boards: keys.length, pairs: keys.length / 2,
    blocks: blocks.map(([block, pairs]) => ({block, pairs: pairs.length})),
    byModel: Object.fromEntries(byModel), betweenModels: {leftModel, rightModel, byCondition}, baselines,
    inference: {
      difference: 'Right minus left, as a fraction. Pair success requires both boards correct. Explicit invalid answers count as incorrect. Mean shot regret in percentage points uses valid answers.',
      pairCI: '95% percentile bootstrap. Within each fixed generation block, resample whole position pairs with replacement, holding all matched arm outcomes together. These marginal intervals condition on the observed blocks and model calls.',
      bootstrapSamples, bootstrapSeed,
      exactTest: 'Two-sided binomial sign test on discordant position pairs under arm exchangeability. The four primary within-model tests also receive Holm-adjusted p-values. Cross-model comparisons are descriptive.',
    },
  };
}
