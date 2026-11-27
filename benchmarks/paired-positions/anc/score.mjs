import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {coordinatePolicies} from './geometry.mjs';
import {compareShots} from './compare-shots.mjs';
import {analyzeStudy} from './paired-analysis.mjs';
import {summarizeChoices} from './pair-actions.mjs';

const conditions = ['board', 'replies', 'odds'];
const models = ['gemini', 'gemma', 'gptoss', 'gptossFinal'];
const inputSHA256 = {
  'positions.json': '1218d70f081629eebf3a173da1d97ebf464ce2c0d4b0596230ff235ec197deee',
  'prompts.json': '6fffb09f392804cf0be758d05a86c05b36bef20b21c074da6df4439cd8c988e1',
};

function read(name) {
  const bytes = readFileSync(new URL(name, import.meta.url));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), inputSHA256[name], name);
  return JSON.parse(bytes);
}

function nativeValues(position, rows) {
  const [first, second] = position.board.targets;
  const values = new Map([
    ['Declare file ' + first, Math.min(...rows.map(r => r[0]))],
    ['Declare file ' + second, Math.min(...rows.map(r => r[1]))],
    ['Disguise ' + first + '/' + second, Math.min(...rows.map(([a, b]) => (a + b) / 2))],
  ]);
  return position.options.map(label => values.get(label));
}

function oneBasedChoice(value) {
  if (value === null) return null;
  assert.ok([1, 2, 3].includes(value), 'Unknown option');
  return value - 1;
}

function summarizeArm(keys, choices) {
  const rows = keys.map(k => ({id: k.id, answer: choices.get(k.id)}));
  const summary = compareShots(keys, rows, rows).left;
  return {correctBoards: summary.correct, invalidBoards: summary.invalid,
    solvedPairs: summary.solvedPairs, solvedSwitches: summary.switch.solved,
    solvedStays: summary.stay.solved, meanLossPP: summary.meanRegretPP};
}

export function score() {
  const positions = read('positions.json'), prompts = read('prompts.json');
  assert.equal(positions.length, 120);
  const byId = new Map(positions.map(p => [p.id, p]));
  assert.equal(byId.size, 120);
  assert.equal(prompts.length, 360);
  assert.equal(new Set(prompts.map(p => p.id + '/' + p.condition)).size, 360);
  for (const prompt of prompts) {
    const position = byId.get(prompt.id);
    assert.ok(position && conditions.includes(prompt.condition));
    assert.ok(prompt.text.includes(position.options.map((o, i) => (i + 1) + '. ' + o).join('\n')));
  }

  const policies = Object.fromEntries(['alwaysDisguise', 'fartherFile', 'reachableFiles',
    'simplifiedGeometry', 'displayedOracle'].map(name => [name, new Map()]));
  const keys = positions.map(position => {
    const {id, pair, member, kind, block, options} = position;
    const predicted = coordinatePolicies({board: position.board, options});
    for (const name of Object.keys(policies).filter(n => n !== 'displayedOracle')) {
      policies[name].set(id, predicted[name]);
    }
    const rows = position.replyTable.map(r => r.probabilities);
    assert.ok(rows.every(row => row.length === 2 && row.every(p => Number.isFinite(p) && p >= 0 && p <= 1)));
    const values = nativeValues(position, rows), answer = values.indexOf(Math.max(...values));
    for (const [i, value] of values.entries()) assert.ok(Math.abs(value-position.actionGoalProbabilities[i]) < 1e-12);
    assert.equal(answer + 1, position.best);
    const rounded = nativeValues(position, rows.map(row => row.map(p => Number((p*100).toFixed(2)) / 100)));
    policies.displayedOracle.set(id, rounded.indexOf(Math.max(...rounded)));
    return {id, pair, member, kind, block, options, values, answer, heuristic: predicted.fartherFile};
  });
  assert.equal(new Set(keys.map(k => k.pair)).size, 60);
  const deterministic = Object.fromEntries(Object.entries(policies).map(([name, choices]) =>
    [name, summarizeArm(keys, choices)]));
  const rows = models.flatMap(model => conditions.flatMap(condition => positions.map(p =>
    ({id:p.id, condition, model, answer:oneBasedChoice(p.choices[model][condition])}))));
  assert.equal(rows.length, 1440);
  function choicesFor(model, condition) {
    return new Map(rows.filter(r => r.model === model && r.condition === condition).map(r => [r.id,r.answer]));
  }
  const modelScores = Object.fromEntries(models.map(model => [model, Object.fromEntries(conditions.map(c =>
    [c, summarizeArm(keys, choicesFor(model,c))]))]));
  const semanticChange = {simplifiedGeometry: summarizeChoices(keys, policies.simplifiedGeometry)};
  for (const c of conditions) semanticChange['gemini-' + c] = summarizeChoices(keys, choicesFor('gemini',c));
  const pairedEffects = [];
  for (const [left, right, scope] of [['gemini', 'gemma', 'hosted primary'], ['gemini', 'gptoss', 'cross-developer primary'],
    ['gptoss', 'gptossFinal', 'final-answer sensitivity']]) {
    const result = analyzeStudy(keys, rows.filter(r => r.model === left || r.model === right));
    for (const model of scope === 'final-answer sensitivity' ? [right] : [left,right]) {
      for (const [addition, effect] of Object.entries(result.byModel[model].contrasts)) {
        pairedEffects.push({scope, model, addition, gained:effect.matched.pairs.rightOnly, lost:effect.matched.pairs.leftOnly,
          changePP:100*effect.pairDifference, marginal95PP:effect.pairCI95.map(p => 100*p),
          ...(scope.endsWith('primary') ? {holmPWithinComparison:effect.holmAdjustedP} : {})});
      }
    }
  }
  let recoveredChoices = 0;
  const formattingCheck = Object.fromEntries(conditions.map(c => {
    const answers = choicesFor('gemma',c);
    for (const p of positions) if (Object.hasOwn(p.gemmaClosingFenceRecovery,c)) {
      assert.equal(answers.get(p.id), null);
      answers.set(p.id, oneBasedChoice(p.gemmaClosingFenceRecovery[c]));
      recoveredChoices++;
    }
    return [c, summarizeArm(keys, answers)];
  }));
  const continuationCounts = positions.flatMap(p => conditions.map(c => p.followUpGenerations[c]));
  assert.ok(continuationCounts.every(n => n === 1 || n === 2));
  const boardGeometryVsGemini = compareShots(keys,
    keys.map(k => ({id:k.id, answer:policies.simplifiedGeometry.get(k.id)})),
    rows.filter(r => r.model === 'gemini' && r.condition === 'board')).matched.pairs;
  return {inputSHA256, decisions: rows.length, deterministic, modelScores, semanticChange, pairedEffects,
    boardGeometryVsGemini: {both:boardGeometryVsGemini.both, geometryOnly:boardGeometryVsGemini.leftOnly,
      geminiOnly:boardGeometryVsGemini.rightOnly, neither:boardGeometryVsGemini.neither},
    gemmaFormattingSensitivity: {recoveredChoices, arms:formattingCheck},
    followUp: {decisions:continuationCounts.length, requiredSecondGeneration:continuationCounts.filter(n => n === 2).length,
      completedGenerations:continuationCounts.reduce((a,b) => a+b,0)}};
}

if (import.meta.main) console.log(JSON.stringify(score(), null, 2));
