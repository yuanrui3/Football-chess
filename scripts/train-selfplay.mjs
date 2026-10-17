#!/usr/bin/env node
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pathToFileURL, fileURLToPath} from 'node:url';
import path from 'node:path';
import {performance} from 'node:perf_hooks';
import {FEATURE_NAMES, RESIDUAL_SCALE, createLearner, validateVector, trainEpisode, evaluateEpisode} from './rl-training.mjs';

export async function loadTrainingEngine(enginePath = fileURLToPath(new URL('../dist/engine.js', import.meta.url))) {
  const source = await readFile(enginePath, 'utf8');
  // Private search helpers are exposed only in this ephemeral offline module.
  // They are not added to the playable engine's public API or saved games.
  const base = /function tacticalBasePositionValue\(/.test(source) ? 'tacticalBasePositionValue' : 'tacticalPositionValue as tacticalBasePositionValue';
  const augmented = `${source}\nexport {rankedTacticalActions, tacticalSuccessors, ${base}};\n`;
  return {rules: await import(`data:text/javascript;base64,${Buffer.from(augmented).toString('base64')}`), engineSha256: createHash('sha256').update(source).digest('hex')};
}

export function parseArguments(args) {
  const options = {episodes: 8, actions: 384, seed: 100000, out: 'docs/selfplay-training', policy: 'beam', baselinePolicy: 'tactical', candidateWidth: 6, nodeLimit: 96, epsilon: 0.12, alpha: 0.035, gamma: 0.995, lambda: 0.85, maxWeight: 4, checkpointEvery: 4, foulsEnabled: false, evaluate: false};
  const numeric = {'episodes': 'episodes', 'actions': 'actions', 'seed': 'seed', 'candidate-width': 'candidateWidth', 'node-limit': 'nodeLimit', 'epsilon': 'epsilon', 'alpha': 'alpha', 'gamma': 'gamma', 'lambda': 'lambda', 'max-weight': 'maxWeight', 'checkpoint-every': 'checkpointEvery'};
  const string = {'out': 'out', 'initial-model': 'initialModel', 'engine': 'enginePath', 'policy': 'policy', 'baseline-policy': 'baselinePolicy'};
  for (let index = 0; index < args.length; index++) {
    const key = args[index];
    if (key === '--help') {options.help = true; continue;}
    if (key === '--evaluate') {options.evaluate = true; continue;}
    if (key === '--fouls') {options.foulsEnabled = true; continue;}
    const name = key.slice(2), value = args[++index];
    if (!key.startsWith('--') || value === undefined || value.startsWith('--')) throw new Error(`Missing or unknown argument ${key}.`);
    if (numeric[name]) options[numeric[name]] = Number(value);
    else if (string[name]) options[string[name]] = value;
    else throw new Error(`Unknown argument ${key}.`);
  }
  for (const name of ['episodes', 'actions', 'candidateWidth', 'nodeLimit', 'checkpointEvery']) if (!Number.isInteger(options[name]) || options[name] < 1) throw new Error(`${name} must be a positive integer.`);
  if (!Number.isSafeInteger(options.seed) || options.seed < 0 || options.seed > 0xffffffff) throw new Error('seed must be a uint32.');
  if (!options.evaluate && options.seed + options.episodes > 0x100000000) throw new Error('The training environment seed range must not wrap around.');
  if (!(options.epsilon >= 0 && options.epsilon <= 1)) throw new Error('epsilon must be between zero and one.');
  createLearner({alpha: options.alpha, gamma: options.gamma, lambda: options.lambda, maxWeight: options.maxWeight});
  if (!['beam', 'casual', 'tactical'].includes(options.policy) || !['beam', 'casual', 'tactical'].includes(options.baselinePolicy)) throw new Error('policy must be beam, casual, or tactical.');
  if (options.evaluate && options.episodes % 2 !== 0) throw new Error('Evaluation needs an even episode count so every seed swaps learner colors.');
  return options;
}

async function saveJson(filename, object) {await writeFile(filename, `${JSON.stringify(object, null, 2)}\n`);}
export function checkpoint(learner, config, completedEpisodes, engineSha256, initialWeights, episodes = [], prior = null) {
  const inherited = prior?.training ?? {};
  const seeds = [...new Set([...(inherited.seeds ?? []), ...episodes.map(item => item.environmentSeed)])];
  const totalEpisodes = (inherited.episodes ?? 0) + completedEpisodes;
  const totalTransitions = (inherited.totalTransitions ?? prior?.updates ?? 0) + learner.updates;
  const count = (field, read) => (inherited[field] ?? 0) + episodes.reduce((sum, item) => sum + read(item), 0);
  const priorRuns = inherited.runs ?? (prior ? [{seed: inherited.seed, episodes: inherited.episodes, actionsPerEpisode: inherited.actionsPerEpisode}] : []);
  return {
    format: 'football-chess-td-lambda-v1', algorithm: 'TD(lambda)', implementation: 'online semi-gradient TD(lambda) with accumulating eligibility traces',
    featureNames: FEATURE_NAMES, perspective: 'fixed white; color-relative, score-excluded features', scale: RESIDUAL_SCALE, residualScale: RESIDUAL_SCALE,
    weights: [...learner.weights], initialWeights, updates: totalTransitions, completedEpisodes: totalEpisodes,
    training: {
      seed: inherited.seed ?? config.seed, seeds, seedRange: seeds.length ? [Math.min(...seeds), Math.max(...seeds)] : null,
      episodes: totalEpisodes, actionsPerEpisode: config.actions, totalTransitions,
      goalEvents: count('goalEvents', item => item.goalEvents.length), whiteGoals: count('whiteGoals', item => item.score.white), blackGoals: count('blackGoals', item => item.score.black),
      originInitialWeights: inherited.originInitialWeights ?? prior?.initialWeights ?? initialWeights,
      runs: [...priorRuns, {seed: config.seed, episodes: completedEpisodes, actionsPerEpisode: config.actions, policy: config.policy, epsilon: config.epsilon}]
    },
    parentCheckpoint: prior ? {weights: prior.weights, engineSha256: prior.engineSha256, episodes: inherited.episodes, transitions: inherited.totalTransitions} : null,
    engineSha256, reward: 'change in white goals minus black goals; no center, possession, passing, or movement reward',
    truncation: 'action limits bootstrap the last nonterminal position; only real finished states use zero', config
  };
}

export async function main(args = process.argv.slice(2)) {
  const config = parseArguments(args);
  if (config.help) {
    console.log('Train: node scripts/train-selfplay.mjs --episodes 16 --actions 384 --seed 100000 --out docs/selfplay-training\nEvaluate (no updates): add --evaluate --initial-model PATH --policy tactical --baseline-policy tactical --node-limit 1400 --episodes 8 --seed 400000\nOther flags: --epsilon .12 --alpha .035 --gamma .995 --lambda .85 --candidate-width 6 --checkpoint-every 4 --fouls');
    return;
  }
  const {rules, engineSha256} = await loadTrainingEngine(config.enginePath);
  if (typeof rules.rlValueFeatures !== 'function' || typeof rules.rlValuePrediction !== 'function') throw new Error('This engine does not contain the local seven-feature value model.');
  let weights = Array(FEATURE_NAMES.length).fill(0), prior = null;
  if (config.initialModel) {
    prior = JSON.parse(await readFile(config.initialModel, 'utf8'));
    if (JSON.stringify(prior.featureNames) !== JSON.stringify(FEATURE_NAMES)) throw new Error('Checkpoint feature ordering differs from the engine.');
    weights = validateVector(prior.weights, FEATURE_NAMES.length, 'checkpoint weights');
  }
  const initialWeights = [...weights], out = path.resolve(config.out); await mkdir(out, {recursive: true});
  const start = performance.now();
  await saveJson(path.join(out, 'config.json'), {...config, engineSha256, featureNames: FEATURE_NAMES, initialWeights});
  const episodes = [];
  if (config.evaluate) {
    for (let game = 0; game < config.episodes; game++) {
      const clock = performance.now(), {stats} = evaluateEpisode(rules, weights, {...config, game});
      episodes.push(stats);
      console.log(JSON.stringify({stage: 'evaluation', game: game + 1, total: config.episodes, learnerTeam: stats.learnerTeam, score: stats.score, outcome: stats.outcome, actions: stats.actions, seconds: Number(((performance.now() - clock) / 1000).toFixed(3))}));
      await saveJson(path.join(out, 'evaluation-games.json'), episodes);
    }
    const summary = {diagnosticOnly: true, engineSha256, modelWeights: weights, updates: 0, config, games: episodes.length, pairedSeeds: episodes.length / 2, wins: episodes.filter(item => item.outcome === 'win').length, draws: episodes.filter(item => item.outcome === 'draw').length, losses: episodes.filter(item => item.outcome === 'loss').length, goalDifference: episodes.reduce((sum, item) => sum + item.goalDifference, 0), goalsFor: episodes.reduce((sum, item) => sum + item.score[item.learnerTeam], 0), goalsAgainst: episodes.reduce((sum, item) => sum + item.score[item.learnerTeam === 'white' ? 'black' : 'white'], 0), totalActions: episodes.reduce((sum, item) => sum + item.actions, 0), elapsedSeconds: (performance.now() - start) / 1000, limitation: 'Fixed-action diagnostic segments without forced boundary settlement, not the production holdout gate. Use evaluate-selfplay.mjs for model selection and heldout evaluation.'};
    await saveJson(path.join(out, 'evaluation-summary.json'), summary); console.log(JSON.stringify({stage: 'complete', ...summary}));
    return summary;
  }
  const learner = createLearner({...config, weights});
  await saveJson(path.join(out, 'initial-model.json'), checkpoint(learner, config, 0, engineSha256, initialWeights, [], prior));
  for (let episode = 0; episode < config.episodes; episode++) {
    const clock = performance.now(), {stats} = trainEpisode(rules, learner, {...config, episode}); episodes.push(stats);
    console.log(JSON.stringify({stage: 'training', episode: episode + 1, total: config.episodes, score: stats.score, actions: stats.actions, rewards: stats.goalEvents.length, explored: stats.exploredActions, updateL1: stats.updateL1, seconds: Number(((performance.now() - clock) / 1000).toFixed(3))}));
    await saveJson(path.join(out, 'training-episodes.json'), episodes);
    if ((episode + 1) % config.checkpointEvery === 0 || episode + 1 === config.episodes) await saveJson(path.join(out, `checkpoint-${String(episode + 1).padStart(4, '0')}.json`), checkpoint(learner, config, episode + 1, engineSha256, initialWeights, episodes, prior));
  }
  const model = checkpoint(learner, config, config.episodes, engineSha256, initialWeights, episodes, prior);
  await saveJson(path.join(out, 'model.json'), model);
  const summary = {engineSha256, config, episodes: episodes.length, actions: episodes.reduce((sum, item) => sum + item.actions, 0), goalRewardEvents: episodes.reduce((sum, item) => sum + item.goalEvents.length, 0), whiteGoals: episodes.reduce((sum, item) => sum + item.score.white, 0), blackGoals: episodes.reduce((sum, item) => sum + item.score.black, 0), nonzeroDeltaUpdates: episodes.reduce((sum, item) => sum + item.nonzeroDeltaUpdates, 0), updateL1: episodes.reduce((sum, item) => sum + item.updateL1, 0), initialWeights, finalWeights: [...learner.weights], elapsedSeconds: (performance.now() - start) / 1000, behaviorPolicy: config.policy === 'beam' ? `${config.candidateWidth} handcrafted-ranked legal candidates; one-ply expected public chance outcomes; epsilon exploration` : config.policy, limitation: 'A small goal-trained residual over the existing evaluator, not a neural policy or from-scratch soccer system. Training uses fixed-action segments with nonterminal bootstrapping.'};
  await saveJson(path.join(out, 'training-summary.json'), summary); console.log(JSON.stringify({stage: 'complete', ...summary}));
  return summary;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main().catch(error => {console.error(error.stack || error.message); process.exitCode = 1;});
