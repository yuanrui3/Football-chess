import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {cpus, platform} from 'node:os';
import {resolve} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {parseArgs} from 'node:util';

const {positionals, values} = parseArgs({allowPositionals: true, options: {panel: {type: 'string'}, time: {type: 'boolean'}}});
assert.equal(positionals.length, 2, 'Usage: node verify-main-ray.mjs BASELINE CANDIDATE [--panel PATH] [--time]');
const enginePaths = Object.fromEntries(['baseline', 'candidate'].map((arm, index) => [arm, resolve(positionals[index])]));
const panelPath = values.panel ? resolve(values.panel) : fileURLToPath(new URL('./ray-panel.json', import.meta.url));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const panelBytes = await readFile(panelPath);
const {boards, warmup = [], boardListSha256} = JSON.parse(panelBytes);
assert.ok(Array.isArray(boards) && boards.length > 0);
assert.equal(new Set(boards.map(row => row.id)).size, boards.length);
for (const {state, boardSha256} of [...warmup, ...boards]) assert.equal(hash(JSON.stringify(state)), boardSha256);
assert.equal(hash(JSON.stringify(boards.map(({id, boardSha256}) => ({id, boardSha256})))), boardListSha256);
const engines = Object.fromEntries(await Promise.all(Object.entries(enginePaths).map(async ([arm, path]) => {
  const bytes = await readFile(path);
  const implementation = await import(pathToFileURL(path).href);
  assert.equal(typeof implementation.analyzeTacticalAction, 'function');
  return [arm, {sha256: hash(bytes), implementation}];
})));

const defaults = {modelWeights: null};
const profiles = {node700: {...defaults, nodeLimit: 700, maxDepth: 8},
  fixedDepth2: {...defaults, nodeLimit: 50_000, maxDepth: 2, extensions: false}};

function decision(arm, state, options) {
  const original = JSON.stringify(state);
  const exposed = structuredClone(state);
  const start = performance.now();
  const result = engines[arm].implementation.analyzeTacticalAction(exposed, options);
  const ms = performance.now() - start;
  assert.equal(JSON.stringify(exposed), original, `${arm} mutated its public input`);
  assert.ok(result?.action && Number.isInteger(result.stats?.nodes) && result.stats.nodes <= (options.nodeLimit ?? 700));
  return {result, ms};
}

function compare(board, name, options) {
  const baseline = decision('baseline', board.state, options).result;
  const candidate = decision('candidate', board.state, options).result;
  if (name === 'fixedDepth2') {
    // The native keeper short-circuit completes without entering root search.
    const expectedDepth = board.state.phase === 'keeperReact' ? 0 : 2;
    assert.equal(baseline.stats.completedDepth, expectedDepth, `${board.id} did not complete fixed depth`);
  }
  assert.deepEqual(candidate, baseline, `${board.id} (${board.state.phase}) report differs at ${name}`);
  return baseline;
}

const tacticalEntryPhases = new Set();
const chooseTactical = engines.candidate.implementation.chooseAIAction;
assert.equal(typeof chooseTactical, 'function', 'Candidate must export the normal chooseAIAction entry point');
for (const board of boards) {
  assert.ok(board.state?.pieces?.length > 0, `Invalid board state ${board.id}`);
  const baseline700 = compare(board, 'node700', profiles.node700);
  compare(board, 'fixedDepth2', profiles.fixedDepth2);
  assert.deepEqual(decision('candidate', board.state, defaults).result, baseline700,
    `${board.id} (${board.state.phase}) candidate default budget does not match explicit native 700/depth 8`);
  const {phase} = board.state;
  if (!tacticalEntryPhases.has(phase)) {
    const exposed = structuredClone(board.state);
    const action = chooseTactical(exposed, {difficulty: 'tactical', modelWeights: null});
    assert.deepEqual(exposed, board.state, `${board.id} Tactical entry point mutated its public input`);
    assert.deepEqual(action, baseline700.action, `${board.id} (${phase}) Tactical entry point differs from native 700`);
    tacticalEntryPhases.add(phase);
  }
}
const sources = Object.fromEntries(Object.entries(engines).map(([arm, engine]) => [arm, engine.sha256]));
const parity = {passed: true, boards: boards.length, completeReportComparisons: boards.length * 3,
  candidateDefaultComparisons: boards.length, tacticalEntryComparisons: tacticalEntryPhases.size,
  tacticalEntryPhases: [...tacticalEntryPhases], profiles, sources, panelSha256: hash(panelBytes), boardListSha256, publicStateUnchanged: true};
console.log(JSON.stringify({parity}));

if (values.time) {
  for (const {state} of warmup.slice(0, 3)) {
    decision('baseline', state, profiles.node700);
    decision('candidate', state, profiles.node700);
  }
  const samples = {baseline: [], candidate: []};
  for (let repeat = 0; repeat < 2; repeat++) for (const [index, {state}] of boards.entries()) {
    const order = (repeat + index) % 2 ? ['candidate', 'baseline'] : ['baseline', 'candidate'];
    for (const arm of order) samples[arm].push(decision(arm, state, profiles.node700).ms);
  }
  const summary = Object.fromEntries(Object.entries(samples).map(([arm, times]) => {
    const sorted = [...times].sort((a, b) => a - b);
    return [arm, {calls: times.length, meanMs: times.reduce((sum, time) => sum + time, 0) / times.length,
      p95Ms: sorted[Math.ceil(sorted.length * 0.95) - 1]}];
  }));
  const timing = {...summary, meanSavingsPercent: 100 * (1 - summary.candidate.meanMs / summary.baseline.meanMs),
    p95SavingsPercent: 100 * (1 - summary.candidate.p95Ms / summary.baseline.p95Ms),
    measuredScope: 'Full 700-node call after the public-state clone; balanced policy order after parity warmup',
    machine: {node: process.version, platform: platform(), processor: cpus()[0].model}};
  console.log(JSON.stringify({timing}));
}
