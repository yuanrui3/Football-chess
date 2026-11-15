import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {cpus} from 'node:os';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {collectPositions} from './positions.mjs';
import {makePlanner} from './planner.mjs';

const commit = '45fc3f4a43f2775c1eaf6e27737ef4aba76a7403';
const engineHash = 'eb0ab0924c735871ac2186c6e1f0a1ddb450cdd49533413a795a0650c9a89901';
const targets = {shortHorizon: 4, depthDelta: 0.025, choiceSpread: 0.01, minEffect: 0.005,
  minFamilies: 6, minNaturalFamilies: 3, repetitions: 8, bootstrapSamples: 20_000};
const file = name => new URL(name, import.meta.url);
const defaultAssets = file('../../');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const mean = values => values.reduce((a, b) => a + b, 0) / values.length;
const average = values => values.length ? mean(values) : null;
const other = team => team === 'white' ? 'black' : 'white';
const natural = position => position.source === 'casual-self-play';
const seed = text => createHash('sha256').update(text).digest().readUInt32LE();
const rawJson = data => `${JSON.stringify(data, null, 2)}\n`;

function rng(initial) {
  let value = initial || 1;
  return () => {
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    return (value >>> 0) / 2 ** 32;
  };
}

async function newFile(filename, contents) {
  try {
    await writeFile(filename, contents, {flag: 'wx'});
  } catch (error) {
    if (error.code !== 'EEXIST' || await readFile(filename, 'utf8') !== contents) throw error;
  }
}

async function loadEngine(assetRoot, explicitlyGivenRoot) {
  const bytes = explicitlyGivenRoot ? await readFile(new URL('./dist/engine.js', assetRoot))
    : execFileSync('git', ['show', `${commit}:dist/engine.js`], {cwd: fileURLToPath(defaultAssets)});
  if (hash(bytes) !== engineHash) throw new Error('Unexpected engine SHA-256. Use a pristine LF export of the reviewed commit.');
  const exports = '\nexport {rankedTacticalActions, tacticalSuccessors};\n';
  return import(`data:text/javascript;base64,${Buffer.concat([bytes, Buffer.from(exports)]).toString('base64')}`);
}

async function sourceHashes() {
  const sources = ['run.mjs', 'positions.mjs', 'planner.mjs'];
  return Object.fromEntries(await Promise.all(sources.map(async source => [source, hash(await readFile(file(source)))])));
}

function checkPositions(positions, split) {
  const ids = new Set();
  for (const position of positions) {
    if (!position.id || ids.has(position.id) || !position.family || !['reaction', 'kick', 'build'].includes(position.kind)) {
      throw new Error(`Invalid position identity in ${split}: ${position.id}`);
    }
    ids.add(position.id);
    if (position.state.randomState !== 0 || position.state.lastAction !== null || position.state.log.length) {
      throw new Error(`Unmasked random state or event history in ${position.id}`);
    }
  }
}

function prepare(planner, position, tree, objective = 'goal') {
  const trial = planner.buildTrial(position, {...tree, objective});
  const reference = planner.reference(trial);
  const short = planner.reference(trial, {horizon: Math.min(targets.shortHorizon, trial.horizon)});
  const spread = Math.max(...reference.values) - Math.min(...reference.values);
  const depthGain = reference.value - short.value;
  const deep = position.kind === 'build' && depthGain >= targets.depthDelta && spread >= targets.choiceSpread;
  return {position, trial, reference, short, spread, depthGain, deep};
}

function confirmReactionKernel(engine, positions) {
  let checks = 0;
  for (const {state} of positions.filter(position => position.kind === 'reaction')) {
    const pending = state.pendingShot;
    if (pending.shootingTeam !== pending.scoringTeam) throw new Error('Pilot positions must exclude own-goal attempts');
    const keeper = state.pieces.find(piece => piece.type === 'K' && piece.team === other(pending.shootingTeam));
    const moves = [null, ...(keeper ? engine.legalMoves(state, keeper.id) : [])];
    for (const reaction of moves) {
      const preview = engine.shotModel(state, pending.x, pending.y, reaction || undefined);
      const targets = preview.targetModels || [preview];
      if (Math.abs(mean(targets.map(target => target.goalProbability)) - preview.goalProbability) > 1e-12) {
        throw new Error('The target mixture disagrees with the reaction preview');
      }
      for (const [index, target] of targets.entries()) {
        const mass = ['goalProbability', 'keeperCornerProbability', 'keeperReboundProbability', 'caughtSaveProbability',
          'missProbability', 'blockOutProbability', 'blockPossessionProbability'].reduce((sum, key) => sum + target[key], 0);
        if (Math.abs(mass - 1) > 1e-9) throw new Error('Shot probability mass does not sum to one');
        const p = target.goalProbability;
        for (const roll of [p / 2, (p + 1) / 2].filter(roll => roll < 1)) {
          const options = {roll, targetRoll: targets.length === 2 ? (index + 0.5) / 2 : undefined};
          const result = reaction ? engine.applyMove(state, keeper.id, reaction.x, reaction.y, options) : engine.skipMove(state, options);
          const scored = result.score[pending.scoringTeam] > state.score[pending.scoringTeam];
          if (scored !== (roll < p)) throw new Error('Preview and live shot threshold disagree');
          checks++;
        }
      }
    }
  }
  return checks;
}

function measure(planner, {trial, reference, position}, objective, budgetMs) {
  return Array.from({length: targets.repetitions}, (_, repetition) => {
    const paired = {};
    const knownFirst = (repetition + seed(position.id)) % 2 === 0;
    for (const method of knownFirst ? ['known', 'sampled'] : ['sampled', 'known']) {
      const result = planner.decide(trial, {method, budgetMs, seed: seed(`${position.id}:${objective}:${repetition}`)});
      const value = reference.values[result.actionIndex];
      if (!Number.isFinite(value) || result.actionIndex < 0) throw new Error(`Invalid decision on ${position.id}`);
      paired[method] = {regret: Math.max(0, reference.value - value), actionIndex: result.actionIndex,
        elapsedMs: result.elapsedMs, completedSweeps: result.completedSweeps, leaves: result.evaluatedLeaves,
        samples: result.outcomeSamples, timedOut: result.timedOut};
    }
    return {repetition, knownFirst, ...paired};
  });
}

function summarize(group, budgetMs) {
  const families = new Map();
  for (const record of group) {
    const difference = mean(record.runs.map(run => run.sampled.regret - run.known.regret));
    const values = families.get(record.family) || [];
    values.push(difference);
    families.set(record.family, values);
  }
  const familyMeans = [...families.values()].map(mean);
  const draw = rng(0xac583281);
  const draws = familyMeans.length > 1 ? Array.from({length: targets.bootstrapSamples}, () => mean(
    familyMeans.map(() => familyMeans[Math.floor(draw() * familyMeans.length)]))).sort((a, b) => a - b) : [];
  const interval = draws.length ? [draws[Math.floor(0.025 * draws.length)], draws[Math.floor(0.975 * draws.length)]] : null;
  const attempts = group.flatMap(position => position.runs.map(run => ({...run, preparationMs: position.preparationMs})));
  const arms = Object.fromEntries(['known', 'sampled'].map(method => [method, {
    meanRegret: average(attempts.map(run => run[method].regret)),
    optimalRate: average(attempts.map(run => Number(run[method].regret < 1e-9))),
    meanTotalMs: average(attempts.map(run => run.preparationMs + run[method].elapsedMs)),
    meanTimedMs: average(attempts.map(run => run[method].elapsedMs)),
    overrunRate: average(attempts.map(run => Number(run[method].elapsedMs > budgetMs + Math.max(1, budgetMs / 4)))),
    meanOutcomeSamples: average(attempts.map(run => run[method].samples)),
    completedSweepRate: average(attempts.map(run => Number(run[method].completedSweeps > 0)))
  }]));
  return {positions: group.length, families: families.size, callsPerMethod: attempts.length,
    meanPreparationMs: average(group.map(position => position.preparationMs)), pairedRegretReduction: average(familyMeans), interval, ...arms};
}

function evaluate(planner, prepared, objective, budgetMs) {
  return prepared.map(item => {
    const {position, trial, reference, short, spread, depthGain, deep} = item;
    return {id: position.id, family: position.family, kind: position.kind, natural: natural(position),
      objective, budgetMs, preparationMs: trial.preparationMs, depthGain, deep, short: short.value, reference: reference.value,
      rootActions: trial.rootActions, referenceValues: reference.values, choiceSpread: spread, minShotPlies: trial.minShotPlies,
      nodeCount: trial.nodeCount, leafCount: trial.leafCount, chanceNodes: trial.chanceNodes,
      approximatedChanceNodes: trial.approximatedChanceNodes, runs: measure(planner, item, objective, budgetMs)};
  });
}

function overallReport(records, budgetMs, reactionChecks) {
  const contains = kind => records.filter(record => record.kind === kind);
  const deep = records.filter(position => position.deep);
  return {budgetMs, reactionChecks, reaction: summarize(contains('reaction'), budgetMs), kick: summarize(contains('kick'), budgetMs),
    build: summarize(contains('build'), budgetMs), deep: summarize(deep, budgetMs),
    naturalDeep: summarize(deep.filter(position => position.natural), budgetMs), all: summarize(records, budgetMs)};
}

async function main() {
  const [command, outputArg, rootArg] = process.argv.slice(2);
  if (!['calibrate', 'run'].includes(command) || !outputArg || process.argv.length > 5) {
    throw new Error('Usage: node run.mjs <calibrate|run> <output-directory> [reviewed-source-root]');
  }
  const output = resolve(outputArg);
  const assetRoot = rootArg ? pathToFileURL(`${resolve(rootArg)}/`) : defaultAssets;
  const assetCommit = rootArg ? null : execFileSync('git', ['rev-parse', 'HEAD'], {cwd: fileURLToPath(assetRoot), encoding: 'utf8'}).trim();
  if (!rootArg && assetCommit !== commit) throw new Error('Use the reviewed source root for position generation');
  const engine = await loadEngine(assetRoot, !!rootArg);
  const planner = makePlanner(engine);
  const sources = await sourceHashes();
  await mkdir(output, {recursive: true});
  const save = (name, data) => newFile(resolve(output, name), rawJson(data));
  if (command === 'calibrate') {
    const dev = await collectPositions(engine, {split: 'development', assetRoot});
    checkPositions(dev, 'development');
    let tree, prepared;
    for (const horizon of [6, 8]) {
      tree = {horizon, width: 2, preShotSamples: 2};
      prepared = dev.map(position => prepare(planner, position, tree));
      if (prepared.filter(item => item.deep).length >= 4) break;
    }
    const reactionChecks = confirmReactionKernel(engine, dev);
    const trials = prepared.filter(item => ['reaction', 'kick'].includes(item.position.kind) || item.deep);
    for (const {trial} of trials) for (const method of ['known', 'sampled']) planner.decide(trial, {method, budgetMs: 2, seed: 11});
    const sweeps = trials.map(({trial, position}) => ({id: position.id, elapsedMs: mean(Array.from({length: 3}, () =>
      planner.decide(trial, {method: 'known', budgetMs: 100, seed: 5}).elapsedMs))}));
    const budgets = [2, 5, 10, 20, 40];
    const qualifying = budgets.find(budget => sweeps.filter(sweep => sweep.elapsedMs <= budget).length >= 0.8 * sweeps.length);
    const budgetMs = qualifying ?? budgets.at(-1);
    await save('development-positions.json', dev);
    await save('calibration.json', {tree, budgetMs, qualifying: qualifying !== undefined, sweeps, reactionChecks,
      counts: Object.fromEntries(['reaction', 'kick', 'build'].map(kind => [kind, prepared.filter(item => item.position.kind === kind).length])),
      verifiedDepth: prepared.filter(item => item.deep).map(({position, depthGain, spread}) => ({id: position.id, family: position.family, depthGain, spread}))});
    await save('protocol-lock.json', {commit, engineHash, sources, targets, tree, budgetMs,
      developmentPositionHash: hash(rawJson(dev)), developmentFamilies: [...new Set(dev.map(position => position.family))]});
    console.log(JSON.stringify({budgetMs, tree, developmentPositions: dev.length, deep: prepared.filter(position => position.deep).length, reactionChecks}));
    return;
  }
  const lock = JSON.parse(await readFile(resolve(output, 'protocol-lock.json'), 'utf8'));
  if (lock.engineHash !== engineHash || JSON.stringify(lock.sources) !== JSON.stringify(sources) || JSON.stringify(lock.targets) !== JSON.stringify(targets)) {
    throw new Error('The study source or decision rule differs from the locked protocol');
  }
  const positions = await collectPositions(engine, {split: 'holdout', assetRoot});
  checkPositions(positions, 'holdout');
  if (positions.some(position => lock.developmentFamilies.includes(position.family))) throw new Error('Development and holdout families overlap');
  await save('holdout-positions.json', positions);
  await save('holdout-lock.json', {positionsHash: hash(rawJson(positions)), protocolHash: hash(rawJson(lock)), ids: positions.map(position => position.id)});
  const dev = JSON.parse(await readFile(resolve(output, 'development-positions.json'), 'utf8'));
  if (hash(rawJson(dev)) !== lock.developmentPositionHash) throw new Error('Development positions do not match protocol lock');
  for (const position of dev.slice(0, 6)) {
    const {trial} = prepare(planner, position, lock.tree);
    for (const method of ['known', 'sampled']) planner.decide(trial, {method, budgetMs: lock.budgetMs, seed: 13});
  }
  const reactionChecks = confirmReactionKernel(engine, positions);
  const prepared = positions.map(position => prepare(planner, position, lock.tree));
  const primary = evaluate(planner, prepared, 'goal', lock.budgetMs);
  const sensitivity = evaluate(planner, prepared, 'goal', lock.budgetMs * 4);
  const reactionContinuations = positions.filter(position => position.kind === 'reaction').map(position => prepare(planner, position, lock.tree, 'continuation'));
  const continuation = evaluate(planner, reactionContinuations, 'continuation', lock.budgetMs);
  const summary = overallReport(primary, lock.budgetMs, reactionChecks);
  const timingValid = ['known', 'sampled'].every(method => summary.all[method].overrunRate <= 0.05);
  const gates = {timingValid, enoughDeepFamilies: summary.deep.families >= targets.minFamilies,
    enoughNaturalFamilies: summary.naturalDeep.families >= targets.minNaturalFamilies,
    practicalEffect: summary.deep.pairedRegretReduction >= targets.minEffect,
    intervalAboveZero: summary.deep.interval?.[0] > 0, naturalPointEstimatePositive: summary.naturalDeep.pairedRegretReduction > 0,
    reactionControl: summary.reaction.known.optimalRate >= 0.95};
  await save('decisions.json', {primary, sensitivity, continuation});
  const report = {node: process.version, platform: process.platform, cpu: cpus()[0]?.model, lock, gates,
    decision: !timingValid ? 'retry-timing' : Object.values(gates).every(Boolean) ? 'continue' : 'stop', primary: summary,
    sensitivity: overallReport(sensitivity, lock.budgetMs * 4, reactionChecks),
    continuation: {...summarize(continuation, lock.budgetMs), changedBestReaction: continuation.filter(record => {
      const matching = primary.find(otherRecord => otherRecord.id === record.id);
      const bestGoalIndex = matching.referenceValues.indexOf(matching.reference);
      const index = record.rootActions.findIndex(action => JSON.stringify(action) === JSON.stringify(matching.rootActions[bestGoalIndex]));
      return index >= 0 && record.reference - record.referenceValues[index] > 1e-9;
    }).length}};
  await save('result.json', report);
  console.log(rawJson(report));
}

await main();
