#!/usr/bin/env node
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {performance} from 'node:perf_hooks';
import {Worker, isMainThread, parentPort, workerData} from 'node:worker_threads';
import {loadTrainingEngine, checkpoint} from './train-selfplay.mjs';
import {generateCounterplayEpisode, replayCounterplayEpisode, createCounterLearner, featureNamesFor} from './counterplay-training.mjs';

export function parseArguments(args) {
  const c = {episodes: 32, actions: 384, seed: 200000, out: 'docs/counterplay-training', workers: 4, candidateWidth: 8, policy: 'beam', nodeLimit: 128, baselineNodes: 128, baselineDepth: 8, baselinePolicy: 'tactical', baselineFraction: .75, epsilon: .10, alpha: .003, gamma: .995, lambda: .97, maxWeight: 4, checkpointEvery: 8, warmup: 0, foulsEnabled: true, baseline: fileURLToPath(new URL('../training/frozen/engine-v37.mjs', import.meta.url))};
  c.residualScale=80;
  c.searchBackupAlpha=0;
  const numeric = {'episodes': 'episodes', 'actions': 'actions', 'seed': 'seed', 'workers': 'workers', 'candidate-width': 'candidateWidth', 'node-limit': 'nodeLimit', 'baseline-nodes': 'baselineNodes', 'baseline-depth': 'baselineDepth', 'baseline-fraction': 'baselineFraction', 'epsilon': 'epsilon', 'alpha': 'alpha', 'gamma': 'gamma', 'lambda': 'lambda', 'max-weight': 'maxWeight', 'checkpoint-every': 'checkpointEvery', 'warmup': 'warmup', 'residual-scale':'residualScale','search-backup-alpha':'searchBackupAlpha'};
  const strings = {'out': 'out', 'initial-model': 'initialModel', 'pool-model': 'poolModel', 'engine': 'enginePath', 'baseline': 'baseline', 'policy': 'policy', 'baseline-policy': 'baselinePolicy'};
  for (let i = 0; i < args.length; i++) {
    const key = args[i]; if (key === '--help') {c.help = true; continue;} if (key === '--no-fouls') {c.foulsEnabled = false; continue;}
    const name = key.slice(2), value = args[++i];
    if (!key.startsWith('--') || value === undefined || value.startsWith('--')) throw new Error(`Missing argument ${key}.`);
    if (numeric[name]) c[numeric[name]] = Number(value); else if (strings[name]) c[strings[name]] = value; else throw new Error(`Unknown argument ${key}.`);
  }
  for (const key of ['episodes','actions','workers','candidateWidth','nodeLimit','baselineNodes','baselineDepth','checkpointEvery']) if (!Number.isInteger(c[key]) || c[key] < 1) throw new Error(`${key} must be a positive integer.`);
  if (!Number.isInteger(c.warmup) || c.warmup < 0 || !Number.isSafeInteger(c.seed) || c.seed < 0 || c.seed + c.episodes > 0x100000000) throw new Error('Invalid warmup or seed range.');
  if (c.workers > 16 || ![c.epsilon,c.baselineFraction].every(x => x >= 0 && x <= 1)) throw new Error('Invalid workers or probability.');
  if (!['beam','casual','tactical'].includes(c.policy) || !['beam','casual','tactical'].includes(c.baselinePolicy)) throw new Error('Invalid policy.');
  createCounterLearner({...c,weights:[0]}); return c;
}

async function loadAll(config) {
  const {rules, engineSha256} = await loadTrainingEngine(config.enginePath);
  const baselineSource = await readFile(config.baseline, 'utf8');
  const {rules: frozen} = await loadTrainingEngine(config.baseline);
  return {rules, frozen, engineSha256, baselineSha256: createHash('sha256').update(baselineSource).digest('hex')};
}
const saveJson = (filename, obj) => writeFile(filename, `${JSON.stringify(obj, null, 2)}\n`);

export function migrateFeatureCheckpoint(prior,featureNames,{sourceCheckpointSha256=null,targetEngineSha256=null}={}) {
  if (!Array.isArray(prior.weights)||!Array.isArray(prior.featureNames)||featureNames.length<=prior.weights.length||prior.weights.length!==prior.featureNames.length||prior.featureNames.some((name,i)=>featureNames[i]!==name)) throw new Error('A migration must preserve the complete old feature prefix and add new features.');
  const append=weights=>weights?.length===prior.weights.length?[...weights,...Array(featureNames.length-prior.weights.length).fill(0)]:weights;
  return {...structuredClone(prior),format:featureNames.length===37?'football-chess-shot-td-lambda-v3':prior.format,featureNames:[...featureNames],weights:append(prior.weights),initialWeights:append(prior.initialWeights),training:{...structuredClone(prior.training),originInitialWeights:append(prior.training?.originInitialWeights)},migrations:[...(prior.migrations??[]),{kind:'zero-extension with identical old feature prefix',fromFeatureCount:prior.weights.length,toFeatureCount:featureNames.length,sourceCheckpointSha256,targetEngineSha256,preservesPredictions:true,addedTrainingTransitions:0,addedGoalRewards:0}]};
}

export function enrichCounterplayMetadata(model, episodes, config, prior=null) {
  const runConfig=c=>({policy:c.policy,epsilon:c.epsilon,alpha:c.alpha,gamma:c.gamma,lambda:c.lambda,maxWeight:c.maxWeight,residualScale:c.residualScale??80,searchBackupAlpha:c.searchBackupAlpha??0,candidateWidth:c.candidateWidth,nodeLimit:c.nodeLimit,baselineNodes:c.baselineNodes,baselineDepth:c.baselineDepth,baselinePolicy:c.baselinePolicy,baselineFraction:c.baselineFraction,warmup:c.warmup,workers:c.workers,foulsEnabled:c.foulsEnabled});
  const priorRuns=(prior?.training?.runs??[]).map(run=>prior?.config?.seed===run.seed?{...run,...runConfig(prior.config)}:run);
  return {...model,training:{...model.training,
    whiteGoals:(prior?.training?.whiteGoals??0)+episodes.reduce((sum,e)=>sum+e.goalEvents.reduce((s,g)=>s+Math.max(0,g.reward),0),0),
    blackGoals:(prior?.training?.blackGoals??0)+episodes.reduce((sum,e)=>sum+e.goalEvents.reduce((s,g)=>s+Math.max(0,-g.reward),0),0),
    searchBackupUpdates:(prior?.training?.searchBackupUpdates??0)+episodes.reduce((sum,e)=>sum+(e.searchBackupUpdates??0),0),
    searchBackupUpdateL1:(prior?.training?.searchBackupUpdateL1??0)+episodes.reduce((sum,e)=>sum+(e.searchBackupUpdateL1??0),0),
    runs:[...priorRuns,{seed:config.seed,episodes:episodes.length,actionsPerEpisode:config.actions,...runConfig(config)}],
  }};
}

function spawnRollout(config, weights, poolWeights, episode) {
  return new Promise((resolve,reject) => {
    const worker = new Worker(new URL(import.meta.url), {workerData: {config, weights, poolWeights, episode}});
    let complete = false;
    worker.once('message', result => {complete = true; resolve(result);}); worker.once('error',reject);
    worker.once('exit', code => {if (!complete) reject(new Error(`Rollout worker exited ${code}.`));});
  });
}

export async function main(args = process.argv.slice(2)) {
  const config = parseArguments(args); if (config.help) {console.log('node scripts/train-counterplay.mjs --episodes 64 --actions 384 --seed 120000 --workers 4 --baseline-nodes 128 --initial-model model.json --out PATH\nOptional: --baseline-fraction .75 --pool-model PATH --policy beam|tactical --node-limit 128 --candidate-width 8 --epsilon .1 --alpha .003 --gamma .995 --lambda .97 --warmup 0 --checkpoint-every 8 --residual-scale 80|320 --search-backup-alpha 0\nNonzero search-backup-alpha adds a separate undiscounted own-search fitting objective alongside discounted goal TD.'); return;}
  const {rules, frozen, engineSha256, baselineSha256} = await loadAll(config);
  let prior = null, weights = Array(featureNamesFor(rules).length).fill(0), poolWeights = null;
  if (config.initialModel) {prior = JSON.parse(await readFile(config.initialModel, 'utf8')); if (JSON.stringify(prior.featureNames) !== JSON.stringify(featureNamesFor(rules,prior.weights.length))) throw new Error('Initial checkpoint features differ.'); if ((prior.scale??80)!==config.residualScale) throw new Error('Initial checkpoint residual scale differs; start fresh weights for a scale ablation.'); weights = [...prior.weights];}
  const featureNames=featureNamesFor(rules,weights.length);
  if (config.poolModel) {const pool = JSON.parse(await readFile(config.poolModel,'utf8')); if (JSON.stringify(pool.featureNames) !== JSON.stringify(featureNames) || (pool.scale??80)!==config.residualScale) throw new Error('Pool features or scale differ.'); poolWeights = [...pool.weights];}
  const learner = createCounterLearner({...config,weights}), initialWeights = [...weights], episodes = [], start = performance.now(), out = path.resolve(config.out);
  await mkdir(out,{recursive:true}); await saveJson(path.join(out,'config.json'),{...config,engineSha256,baselineSha256,featureNames,initialWeights});
  const model = completed => enrichCounterplayMetadata({...checkpoint(learner,config,completed,engineSha256,initialWeights,episodes,prior), format:featureNames.length===7?'football-chess-td-lambda-v1':featureNames.length===37?'football-chess-shot-td-lambda-v3':'football-chess-context-td-lambda-v2',featureNames,scale:config.residualScale,residualScale:config.residualScale,migrations:prior?.migrations??[], implementation: 'batch-frozen behavior rollouts with deterministic ordered prior-consistent expected semi-gradient TD(lambda) replay', auxiliaryObjective:config.searchBackupAlpha>0?'undiscounted completed own-candidate search-backup fitting alongside discounted goal TD; not an extra goal reward':null,searchBackupAlpha:config.searchBackupAlpha, baselineSha256, baseline: config.baseline, opponentMix: {baselineFraction: config.baselineFraction, poolWeights}, batchSize: config.workers, reward: `goal reward in baseline/${config.residualScale} units (${2000/config.residualScale} per goal) plus the exact potential difference of the deployed score-excluded handcrafted prior; all public chance outcomes and opponent actions`, target:`H=(handcraftedValue-2000*scoreDifference)/${config.residualScale}, H(terminal)=0; delta=E[${2000/config.residualScale}*goalReward+gamma*(Hnext+tanh(w*phiNext))]-(H+tanh(w*phi)); terminal continuation zero`, behaviorLimitation: 'Rollout policies remain frozen within each batch. This is approximate policy iteration with TD replay, not importance-corrected off-policy evaluation.'},episodes,config,prior);
  await saveJson(path.join(out,'initial-model.json'),model(0));
  for (let first = 0; first < config.episodes; first += config.workers) {
    const frozenWeights = [...learner.weights], count = Math.min(config.workers,config.episodes-first), clock = performance.now();
    const rollouts = config.workers === 1 ? [{...generateCounterplayEpisode(rules,frozen,frozenWeights,{...config,poolWeights,episode:first}),engineSha256,baselineSha256}] : await Promise.all(Array.from({length:count},(_,i) => spawnRollout(config,frozenWeights,poolWeights,first+i)));
    for (const rollout of rollouts) {
      if (rollout.engineSha256!==engineSha256||rollout.baselineSha256!==baselineSha256) throw new Error('A source file changed during training; freeze engine and baseline sources before restarting.');
      const stats = replayCounterplayEpisode(learner,rollout); episodes.push(stats);
      console.log(JSON.stringify({stage:'counterplay',episode:stats.episode+1,total:config.episodes,learnerTeam:stats.learnerTeam,opponent:stats.opponent,score:stats.score,actions:stats.actions,goals:stats.goalEvents.length,goalDifference:stats.goalDifference,batchSeconds:Number(((performance.now()-clock)/1000).toFixed(3))}));
      if (episodes.length % config.checkpointEvery === 0 || episodes.length === config.episodes) await saveJson(path.join(out,`checkpoint-${String(episodes.length).padStart(4,'0')}.json`),model(episodes.length));
    }
    await saveJson(path.join(out,'training-episodes.json'),episodes);
  }
  const final = model(episodes.length); await saveJson(path.join(out,'model.json'),final);
  const summary = {engineSha256,baselineSha256,config,episodes:episodes.length,actions:episodes.reduce((s,e)=>s+e.actions,0),warmupActions:episodes.reduce((s,e)=>s+(e.warmupActions??e.warmup??0),0),goalRewardEvents:episodes.reduce((s,e)=>s+e.goalEvents.length,0),learnerGoals:episodes.reduce((s,e)=>s+e.learnerGoals,0),opponentGoals:episodes.reduce((s,e)=>s+e.opponentGoals,0),baselineEpisodes:episodes.filter(e=>e.opponent==='baseline').length,searchBackupUpdates:episodes.reduce((s,e)=>s+(e.searchBackupUpdates??0),0),searchBackupUpdateL1:episodes.reduce((s,e)=>s+(e.searchBackupUpdateL1??0),0),initialWeights,finalWeights:[...learner.weights],updateL1:episodes.reduce((s,e)=>s+e.updateL1,0),elapsedSeconds:(performance.now()-start)/1000};
  await saveJson(path.join(out,'training-summary.json'),summary); console.log(JSON.stringify({stage:'complete',...summary})); return summary;
}

if (!isMainThread && workerData) {const {config,weights,poolWeights,episode} = workerData; const {rules,frozen,engineSha256,baselineSha256} = await loadAll(config); parentPort.postMessage({...generateCounterplayEpisode(rules,frozen,weights,{...config,poolWeights,episode}),engineSha256,baselineSha256});}
else if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main().catch(error=>{console.error(error.stack||error);process.exitCode=1;});
