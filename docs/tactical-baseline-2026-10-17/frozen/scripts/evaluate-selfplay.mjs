/**
 * Paired evaluation for the small TD value learner. Both policies search the
 * same public board with identical budgets; only the live rules consume RNG.
 * Fixed horizons below are scenarios, not full timed football matches.
 */
import * as engine from '../dist/engine.js';
import {performance} from 'node:perf_hooks';
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {pathToFileURL, fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {Worker} from 'node:worker_threads';
import path from 'node:path';
import {RL_CONTEXT_FEATURE_NAMES} from './rl-context-features.mjs';
import {RL_SHOT_FEATURE_NAMES} from './rl-shot-features.mjs';

const TEAMS = ['white', 'black'];
const other = team => team === 'white' ? 'black' : 'white';
const clone = structuredClone;
export const SEED_PARTITIONS = Object.freeze({train: [100000, 199999], dev: [300000, 399999], test: [400000, 499999]});
export const EVALUATION_GATE = Object.freeze({minimumSeeds: 4, minimumScenarios: 16, minimumResolvedShots: 16,
  minimumActionsPerScenario: 120, minimumRoundsPerScenario: 24, requiredNodes: 1400, requiredDepth: 8,
  maximumOffenceIncreasePer100Actions: 0.5});
// The hour-long training experiment pre-registers this stronger gate. Retaining
// the original default makes the earlier experiment's report reproducible.
export const STRICT_EVALUATION_GATE = Object.freeze({...EVALUATION_GATE, minimumSeeds: 8,
  minimumScenarios: 32, minimumResolvedShots: 32, minimumWdlScore: 0.6,
  minimumWdlLower95: 0.5, minimumGoalDifferenceLower95: 0});

function sideStats() {
  return {actions: 0, thinkMs: 0, nodes: 0, maxNodes: 0, completedDepthTotal: 0,
    goals: 0, shots: 0, resolvedShots: 0, xG: 0, stalls: 0, repetitions: 0,
    dribbleLimit: 0, offsides: 0, fouls: 0, yellowCards: 0, redCards: 0,
    completedOrdinaryRounds: 0, passes: 0, dribbles: 0, tackles: 0};
}
const sum = (items, field) => items.reduce((total, item) => total + (typeof field === 'function' ? field(item) : item[field] || 0), 0);
function integer(value, name, minimum = 1) {
  if (!Number.isInteger(value) || value < minimum) throw new Error(`${name} must be an integer >= ${minimum}`);
  return value;
}

export function validateSeeds(seeds, split = 'test', trainingSeeds = []) {
  if (!Object.hasOwn(SEED_PARTITIONS, split) || split === 'train') throw new Error('Evaluation split must be dev or test');
  if (!Array.isArray(seeds) || !seeds.length || new Set(seeds).size !== seeds.length) throw new Error('Evaluation seeds must be nonempty and unique');
  const [low, high] = SEED_PARTITIONS[split], trained = new Set(trainingSeeds);
  for (const seed of seeds) {
    if (!Number.isInteger(seed) || seed < low || seed > high) throw new Error(`${split} seeds must be in [${low}, ${high}]`);
    if (trained.has(seed)) throw new Error('Evaluation seed overlaps training');
  }
  return [...seeds];
}

export function validateCheckpoint(checkpoint) {
  const legacyNames = ['possession', 'ballProgress', 'material', 'centerControl', 'openFiles', 'defensiveCover', 'centralReceivers'];
  const expected = [legacyNames, RL_CONTEXT_FEATURE_NAMES, RL_SHOT_FEATURE_NAMES].find(names => JSON.stringify(checkpoint?.featureNames) === JSON.stringify(names));
  const validScale = checkpoint?.scale === 80 || checkpoint?.scale === 320 && [RL_CONTEXT_FEATURE_NAMES, RL_SHOT_FEATURE_NAMES].includes(expected);
  if (!checkpoint || checkpoint.algorithm !== 'TD(lambda)' || !validScale
    || !expected
    || !Array.isArray(checkpoint.weights) || checkpoint.weights.length !== expected.length
    || checkpoint.weights.some(weight => !Number.isFinite(weight))) throw new Error('Unsupported TD checkpoint schema');
  return [...checkpoint.weights];
}

// Policy input deliberately replaces the hidden outcome generator state. The
// real state is retained solely for legal transitions after a move is chosen.
export function publicDecisionState(state) {
  const visible = clone(state);
  visible.randomState = 0;
  return visible;
}

export function checkIntegrity(rules, state, previous = null) {
  const phases = ['kickoff', 'attackMove', 'defendMove', 'kick', 'keeperRelease', 'keeperReact', 'passRun', 'cornerSelect', 'finished'];
  if (!phases.includes(state.phase)) throw new Error('Unknown game phase');
  const pieces = state.pieces, sentOff = state.sentOff || [], discipline = state.discipline || {};
  if (!Array.isArray(pieces) || !Array.isArray(sentOff) || pieces.length + sentOff.length !== 22) throw new Error('Roster must retain all 22 original players');
  const all = [...pieces, ...sentOff], ids = new Set(all.map(piece => piece?.id));
  if (ids.size !== 22 || all.some(piece => !piece || !/^(white|black)-(K|Q|R[12]|B[12]|N[12]|P[123])$/.test(piece.id)
    || !piece.id.startsWith(`${piece.team}-`) || !['K', 'Q', 'R', 'B', 'N', 'P'].includes(piece.type))) throw new Error('Invalid player identities');
  if (new Set(pieces.map(piece => `${piece.x},${piece.y}`)).size !== pieces.length
    || pieces.some(piece => !Number.isInteger(piece.x) || !Number.isInteger(piece.y) || piece.x < 0 || piece.x >= rules.BOARD_WIDTH
      || piece.y < 0 || piece.y >= rules.BOARD_HEIGHT || !rules.canOccupySquare(piece, piece.x, piece.y))) throw new Error('Illegal board occupancy');
  const dismissed = new Set(sentOff.map(piece => piece.id));
  for (const [id, card] of Object.entries(discipline)) {
    if (!ids.has(id) || !Number.isInteger(card.yellowCards) || card.yellowCards < 0 || card.yellowCards > 2
      || typeof card.redCard !== 'boolean' || card.redCard !== dismissed.has(id) || card.yellowCards === 2 && !card.redCard) throw new Error('Invalid card ledger');
  }
  if (sentOff.some(piece => !discipline[piece.id]?.redCard)) throw new Error('Dismissed player lacks red card');
  if (previous) {
    if ((previous.sentOff || []).some(piece => !dismissed.has(piece.id))) throw new Error('Dismissed player returned');
    for (const [id, card] of Object.entries(previous.discipline || {})) {
      if ((discipline[id]?.yellowCards || 0) < card.yellowCards || card.redCard && !discipline[id]?.redCard) throw new Error('Card ledger regressed');
    }
  }
  const short = TEAMS.filter(team => pieces.filter(piece => piece.team === team).length < (rules.FOUL_RULE?.minimumPlayers || 7));
  if (short.length ? state.phase !== 'finished' || short.length !== 1 || state.finishReason !== 'forfeit' || state.winner !== other(short[0])
    : TEAMS.some(team => pieces.filter(piece => piece.team === team && piece.type === 'K').length !== 1)) throw new Error('Invalid goalkeeper or forfeit');
  const carrier = pieces.find(piece => piece.id === state.ball?.carrierId);
  if (state.ball?.carrierId && !carrier || carrier && (carrier.x !== state.ball.x || carrier.y !== state.ball.y || carrier.team !== state.attack)) throw new Error('Ball/carrier mismatch');
  if (!TEAMS.includes(state.attack) || TEAMS.some(team => !Number.isInteger(state.score?.[team]) || state.score[team] < 0)) throw new Error('Invalid attack or score');
  if (state.phase === 'keeperReact' && !state.pendingShot) throw new Error('Keeper reaction lacks shot');
  if (state.phase === 'passRun' && (!state.passRun || !pieces.some(piece => piece.id === state.passRun.pieceId && piece.team === state.attack && piece.id !== carrier?.id))) throw new Error('Invalid pass-run metadata');
  return true;
}

export function validateAction(rules, state, action) {
  if (!action || typeof action !== 'object') throw new Error('Policy returned no action');
  if (action.type === 'kick') {
    if (!rules.legalKicks(state).some(kick => kick.x === action.x && kick.y === action.y)) throw new Error('Illegal policy kick');
    if (action.disguise && (!rules.disguisedShotTargets || rules.disguisedShotTargets(state).length !== 2)) throw new Error('Illegal disguised shot');
  } else if (action.type === 'move') {
    if (!rules.legalMoves(state, action.pieceId, {freePawn: !!action.freePawn}).some(move => move.x === action.x && move.y === action.y)) throw new Error('Illegal policy move');
  } else if (action.type === 'cornerTaker') {
    if (state.phase !== 'cornerSelect' || !rules.cornerTakers(state).some(piece => piece.id === action.pieceId)) throw new Error('Illegal corner taker');
  } else if (action.type !== 'skip' || !(['attackMove', 'defendMove', 'keeperReact', 'passRun', 'finished'].includes(state.phase)
    || ['kick', 'keeperRelease'].includes(state.phase) && !state.ball.carrierId)) throw new Error('Illegal policy skip');
  return true;
}

function apply(rules, state, action) {
  if (action.type === 'kick') return rules.applyKick(state, action.x, action.y, {passRun: !!action.passRun, disguise: !!action.disguise});
  if (action.type === 'move') return rules.applyMove(state, action.pieceId, action.x, action.y, {freePawn: !!action.freePawn});
  if (action.type === 'cornerTaker') return rules.selectCornerTaker(state, action.pieceId);
  return rules.skipMove(state);
}

export function makeSearchPolicy(module, {modelWeights = null, modelScale, nodeLimit = 1400, maxDepth = 8, extensions = true} = {}) {
  if (typeof module.analyzeTacticalAction !== 'function') throw new Error('Policy module needs analyzeTacticalAction');
  if (modelScale !== undefined && ![80, 320].includes(modelScale)) throw new Error('Unsupported model scale');
  return state => module.analyzeTacticalAction(state, {modelWeights, nodeLimit, maxDepth, extensions,
    ...(modelScale === undefined ? {} : {modelScale})});
}

// A legal Casual rollout creates identical warm starting positions for both
// candidate colors. Warmup goals/actions are excluded from scored metrics.
export function createWarmStart({rules = engine, seed, kickoff, warmup = 0, foulsEnabled = false} = {}) {
  integer(warmup, 'warmup', 0);
  let state = rules.createGame({mode: 'local', seed, kickoff, foulsEnabled});
  for (let step = 0; (step < warmup || state.phase === 'keeperReact') && state.phase !== 'finished'; step++) {
    if (step > warmup + 4) throw new Error('Warmup failed to settle a pending shot');
    const visible = publicDecisionState(state), snapshot = JSON.stringify(visible), prior = JSON.stringify(state);
    const action = rules.chooseAIAction(visible, {difficulty: 'casual'});
    if (JSON.stringify(visible) !== snapshot) throw new Error('Warmup policy mutated its input');
    validateAction(rules, state, action);
    const next = apply(rules, state, action);
    if (JSON.stringify(state) !== prior) throw new Error('Warmup transition mutated its input');
    checkIntegrity(rules, next, state); state = next;
  }
  return state;
}

export function runEvaluationScenario({rules = engine, whitePolicy, blackPolicy, initialState,
  seed = 400000, kickoff = 'white', candidateColor = 'white', actionLimit = 160, roundLimit = null,
  safetyActionLimit = null, nodeLimit = 1400, record = false} = {}) {
  if (!whitePolicy || !blackPolicy) throw new Error('Both evaluation policies are required');
  integer(actionLimit, 'actionLimit'); if (roundLimit !== null) integer(roundLimit, 'roundLimit');
  const hardLimit = safetyActionLimit ?? (roundLimit ? Math.max(actionLimit, roundLimit * 30 + 120) : actionLimit + 4);
  integer(hardLimit, 'safetyActionLimit');
  let state = initialState ? clone(initialState) : rules.createGame({mode: 'local', seed, kickoff});
  checkIntegrity(rules, state);
  const initialScore = {...state.score}, stats = {white: sideStats(), black: sideStats()}, events = [];
  const timings = {white: [], black: []};
  let actions = 0, error = null, pendingShotRound = false, horizonReached = false;
  const started = performance.now();
  while (state.phase !== 'finished' && actions < hardLimit) {
    const rounds = stats.white.completedOrdinaryRounds + stats.black.completedOrdinaryRounds;
    horizonReached = roundLimit !== null ? rounds >= roundLimit : actions >= actionLimit;
    // Never leave a launched shot unresolved at an artificial horizon.
    if (horizonReached && state.phase !== 'keeperReact') break;
    const before = state, team = rules.currentTeam(state), policy = team === 'white' ? whitePolicy : blackPolicy;
    const visible = publicDecisionState(before), visibleSnapshot = JSON.stringify(visible), inputSnapshot = JSON.stringify(before);
    let action, report, next, thinkMs;
    try {
      const start = performance.now(); report = policy(visible); thinkMs = performance.now() - start;
      if (report && typeof report.then === 'function') throw new Error('Evaluation policies must be synchronous');
      if (JSON.stringify(visible) !== visibleSnapshot) throw new Error('Policy mutated its input');
      action = report?.action || report; validateAction(rules, before, action);
      const nodes = report?.stats?.nodes ?? 0;
      if (!Number.isFinite(nodes) || nodes < 0 || nodes > nodeLimit) throw new Error('Policy exceeded the common node allowance');
      next = apply(rules, before, action);
      if (JSON.stringify(before) !== inputSnapshot) throw new Error('Rules transition mutated its input');
      checkIntegrity(rules, next, before);
    } catch (caught) {
      error = {step: actions, phase: before.phase, team, message: caught.message, action}; break;
    }
    state = next; actions++;
    const s = stats[team], result = state.lastAction || {};
    s.actions++; s.thinkMs += thinkMs; s.nodes += report?.stats?.nodes || 0;
    s.maxNodes = Math.max(s.maxNodes, report?.stats?.nodes || 0); s.completedDepthTotal += report?.stats?.completedDepth || 0;
    timings[team].push(thinkMs);
    for (const side of TEAMS) stats[side].goals += state.score[side] - before.score[side];
    const carrier = before.pieces.find(piece => piece.id === before.ball.carrierId);
    if (action.type === 'kick' && carrier) {
      const kick = rules.legalKicks(before).find(entry => entry.x === action.x && entry.y === action.y);
      if (kick?.goal) {
        if (state.phase === 'keeperReact' && result.type === 'shotAttempt') {
          s.shots++;
          pendingShotRound = !before.restart && before.phase !== 'kickoff' && !before.ballProgress?.excludeRelease && !before.ballProgress?.releaseAlreadyCounted;
        }
      } else {
        s.passes++;
        if (!before.restart && before.phase !== 'kickoff' && !before.ballProgress?.excludeRelease && !before.ballProgress?.releaseAlreadyCounted && !result.backPass) s.completedOrdinaryRounds++;
      }
    }
    const shotResult = before.phase === 'keeperReact' && result.type === 'stalling' && result.triggeringAction?.shotModel ? result.triggeringAction : result;
    if (before.phase === 'keeperReact' && ['goal', 'save', 'shotMiss', 'blockedShot'].includes(shotResult.type)) {
      const shot = before.pendingShot, shooting = stats[shot.shootingTeam], probability = shotResult.shotModel?.probability;
      if (!Number.isFinite(probability) || probability < 0 || probability > 1) {
        error = {step: actions, phase: before.phase, team, message: 'Resolved shot lacks valid xG'}; break;
      }
      shooting.resolvedShots++; shooting.xG += probability;
      if (pendingShotRound && state.phase !== 'keeperRelease') shooting.completedOrdinaryRounds++;
      pendingShotRound = false;
    }
    if (action.type === 'move') {
      if (before.ball.carrierId === action.pieceId && before.phase !== 'keeperReact') s.dribbles++;
      if (rules.legalMoves(before, action.pieceId, {freePawn: !!action.freePawn}).some(move => move.x === action.x && move.y === action.y && move.type === 'tackle')) s.tackles++;
    }
    if (before.phase === 'defendMove' && state.phase === 'attackMove' && !before.ball.carrierId && !state.ball.carrierId && !before.restart && !state.restart && before.attack === state.attack) stats[before.attack].completedOrdinaryRounds++;
    if (result.type === 'stalling') {
      stats[result.team].stalls++;
      if (result.reason === 'repetition') stats[result.team].repetitions++;
      if (result.reason === 'dribbleLimit') stats[result.team].dribbleLimit++;
    }
    if (result.type === 'offside' && before.phase !== 'keeperReact') stats[result.team].offsides++;
    if (action.type === 'move' && result.type === 'foul') {
      const offender = stats[result.team]; offender.fouls++;
      if (result.card === 'yellow' || result.secondYellow) offender.yellowCards++;
      if (result.card === 'red') offender.redCards++;
    }
    if (record) events.push({step: actions, team, phase: before.phase, action: clone(action), result: clone(result), score: {...state.score}, nodes: report?.stats?.nodes || 0});
  }
  const rounds = stats.white.completedOrdinaryRounds + stats.black.completedOrdinaryRounds;
  horizonReached = roundLimit !== null ? rounds >= roundLimit : actions >= actionLimit;
  const safetyLimitReached = !error && state.phase !== 'finished' && (!horizonReached || state.phase === 'keeperReact') && actions >= hardLimit;
  const score = Object.fromEntries(TEAMS.map(team => [team, state.score[team] - initialScore[team]]));
  const winningTeam = state.finishReason === 'forfeit' ? state.winner : score.white > score.black ? 'white' : score.black > score.white ? 'black' : null;
  return {seed, kickoff, candidateColor, actions, actionLimit, roundLimit, completedOrdinaryRounds: rounds,
    extraResolutionActions: roundLimit === null ? Math.max(0, actions - actionLimit) : 0,
    initialScore, score, finalScore: {...state.score}, stats, timings, error, safetyLimitReached,
    pendingShot: state.phase === 'keeperReact', phase: state.phase, terminal: state.phase === 'finished', finishReason: state.finishReason,
    candidateResult: winningTeam === null ? 'draw' : winningTeam === candidateColor ? 'win' : 'loss',
    elapsedMs: performance.now() - started, finalState: record ? state : undefined, events: record ? events : undefined};
}

function aggregateSide(matches, candidate) {
  const result = sideStats();
  for (const match of matches) {
    const side = match.stats[candidate ? match.candidateColor : other(match.candidateColor)];
    for (const key of Object.keys(result)) result[key] = key === 'maxNodes' ? Math.max(result[key], side[key]) : result[key] + side[key];
  }
  const timings = matches.flatMap(match => match.timings[candidate ? match.candidateColor : other(match.candidateColor)]).sort((a, b) => a - b);
  return {...result, offencePer100Actions: result.actions ? (result.stalls + result.offsides) / result.actions * 100 : 0,
    meanThinkMs: result.actions ? result.thinkMs / result.actions : null,
    medianThinkMs: timings.length ? timings[Math.floor((timings.length - 1) * 0.5)] : null,
    p95ThinkMs: timings.length ? timings[Math.floor((timings.length - 1) * 0.95)] : null};
}

// Resample whole seeds, preserving the four correlated color/kickoff legs.
// This interval is descriptive at small n and never substitutes for the gate.
export function seedBootstrap(paired, samples = 2000) {
  if (paired.length < 2) return {method: 'seed-cluster percentile bootstrap', samples: 0, wdlScore95: null, meanGoalDifferencePerScenario95: null};
  let rng = 0x51f15e;
  const draw = size => {rng ^= rng << 13; rng ^= rng >>> 17; rng ^= rng << 5; return (rng >>> 0) % size;};
  const wdl = [], goals = [];
  for (let iteration = 0; iteration < samples; iteration++) {
    let points = 0, difference = 0, scenarios = 0;
    for (let index = 0; index < paired.length; index++) {
      const seed = paired[draw(paired.length)]; points += seed.points; difference += seed.goalDifference; scenarios += seed.scenarios;
    }
    wdl.push(points / scenarios); goals.push(difference / scenarios);
  }
  const interval = values => {values.sort((a, b) => a - b); return [values[Math.floor(samples * 0.025)], values[Math.min(samples - 1, Math.floor(samples * 0.975))]];};
  return {method: 'seed-cluster percentile bootstrap', samples, wdlScore95: interval(wdl), meanGoalDifferencePerScenario95: interval(goals),
    note: 'Whole seed groups are resampled; with few distinct seeds, these intervals can be unstable and are not a proof of strength.'};
}

export function summarizeEvaluation(matches, config = {}) {
  const candidate = aggregateSide(matches, true), baseline = aggregateSide(matches, false);
  const wins = matches.filter(match => match.candidateResult === 'win').length;
  const losses = matches.filter(match => match.candidateResult === 'loss').length, draws = matches.length - wins - losses;
  const paired = [...new Set(matches.map(match => match.seed))].map(seed => {
    const subset = matches.filter(match => match.seed === seed);
    return {seed, scenarios: subset.length, goalDifference: sum(subset, match => match.score[match.candidateColor] - match.score[other(match.candidateColor)]),
      points: sum(subset, match => match.candidateResult === 'win' ? 1 : match.candidateResult === 'draw' ? 0.5 : 0)};
  });
  const score = matches.length ? (wins + draws / 2) / matches.length : 0;
  const errors = matches.filter(match => match.error || match.safetyLimitReached || match.pendingShot);
  const uncertainty = seedBootstrap(paired), preset = config.strictGate ? STRICT_EVALUATION_GATE : EVALUATION_GATE;
  const gates = {
    heldOutTestSplit: config.split === 'test',
    enoughSeeds: paired.length >= preset.minimumSeeds,
    completePairing: paired.every(pair => pair.scenarios === 4 && new Set(matches.filter(match => match.seed === pair.seed).map(match => `${match.candidateColor}:${match.kickoff}`)).size === 4),
    enoughScenarios: matches.length >= preset.minimumScenarios,
    enoughShotEvidence: candidate.resolvedShots + baseline.resolvedShots >= preset.minimumResolvedShots,
    meaningfulHorizon: config.roundLimit ? config.roundLimit >= preset.minimumRoundsPerScenario : config.actionLimit >= preset.minimumActionsPerScenario,
    productionSearch: config.nodeLimit === preset.requiredNodes && config.maxDepth === preset.requiredDepth && config.extensions !== false,
    intact: errors.length === 0,
    positivePairedGoalDifference: sum(paired, 'goalDifference') > 0,
    positiveWdlScore: score > 0.5,
    offencesAcceptable: candidate.offencePer100Actions <= baseline.offencePer100Actions + preset.maximumOffenceIncreasePer100Actions
  };
  if (config.strictGate) Object.assign(gates, {
    practicallyUsefulWdlScore: score >= preset.minimumWdlScore,
    wdlUncertaintyClearOfBaseline: uncertainty.wdlScore95 !== null && uncertainty.wdlScore95[0] > preset.minimumWdlLower95,
    goalDifferenceUncertaintyPositive: uncertainty.meanGoalDifferencePerScenario95 !== null
      && uncertainty.meanGoalDifferencePerScenario95[0] > preset.minimumGoalDifferenceLower95,
    observedNodeCaps: candidate.maxNodes <= preset.requiredNodes && baseline.maxNodes <= preset.requiredNodes
  });
  return {scenarioCount: matches.length, distinctSeeds: paired.length, wins, draws, losses, wdlScore: score,
    goalDifference: candidate.goals - baseline.goals, candidate, baseline, paired, uncertainty,
    errors: errors.map(match => ({seed: match.seed, kickoff: match.kickoff, candidateColor: match.candidateColor, error: match.error, safetyLimitReached: match.safetyLimitReached, pendingShot: match.pendingShot})),
    promotionGate: {preset, checks: gates, passed: Object.values(gates).every(Boolean),
      note: config.strictGate ? 'Pre-registered strict screening gate: at least eight complete seed clusters, a useful score advantage and seed-cluster 95% intervals above parity. This finite set of fixed-horizon scenarios does not establish universal playing strength.'
        : 'A fixed screening gate, not a statistical proof of strength. Short-horizon or reduced-budget development runs cannot promote a model.'},
    note: 'Four scenarios per seed swap candidate color and kickoff. Goals/shots exclude any legal Casual warmup. Artificial horizons are not full timed matches; pending shots always resolve. Policies see a constant hidden RNG state.'};
}

export async function evaluatePaired({rules = engine, candidateModule = engine, baselineModule, modelWeights = null, modelScale = 80,
  seeds = [400000, 400001, 400002, 400003], split = 'test', trainingSeeds = [], nodeLimit = 1400,
  maxDepth = 8, extensions = true, actionLimit = 160, roundLimit = null, warmup = 0,
  foulsEnabled = false, record = false, strictGate = false, onScenario = null} = {}) {
  validateSeeds(seeds, split, trainingSeeds);
  integer(nodeLimit, 'nodeLimit'); integer(maxDepth, 'maxDepth');
  if (!baselineModule) throw new Error('A frozen baseline module is required');
  const common = {nodeLimit, maxDepth, extensions};
  const candidate = makeSearchPolicy(candidateModule, {...common, modelWeights, modelScale});
  const baseline = makeSearchPolicy(baselineModule, {...common, modelWeights: null});
  const config = {split, seeds: [...seeds], nodeLimit, maxDepth, extensions, actionLimit, roundLimit, warmup, foulsEnabled,
    modelScale,
    ...(strictGate ? {strictGate: true} : {})};
  const matches = [];
  for (const seed of seeds) for (const kickoff of TEAMS) {
    const initialState = createWarmStart({rules, seed, kickoff, warmup, foulsEnabled});
    for (const candidateColor of TEAMS) {
      const match = runEvaluationScenario({rules, seed, kickoff, candidateColor, initialState, nodeLimit, actionLimit, roundLimit, record,
        whitePolicy: candidateColor === 'white' ? candidate : baseline, blackPolicy: candidateColor === 'black' ? candidate : baseline});
      matches.push(match);
      if (onScenario) await onScenario(match, matches.length);
    }
  }
  return {format: 'football-chess-selfplay-evaluation-v1', createdAt: new Date().toISOString(), config, summary: summarizeEvaluation(matches, config), matches};
}

function workerResponse(worker, expectedType, message = null) {
  return new Promise((resolve, reject) => {
    const clean = () => {worker.off('message', onMessage); worker.off('error', onError); worker.off('exit', onExit);};
    const onError = error => {clean(); reject(error);};
    const onExit = code => {clean(); reject(new Error(`Evaluation worker exited before ${expectedType} (code ${code})`));};
    const onMessage = result => {
      clean();
      if (result?.type === 'error') reject(new Error(result.message || 'Evaluation worker failed'));
      else if (result?.type !== expectedType || message && result.index !== message.index) reject(new Error('Invalid evaluation worker response'));
      else resolve(result);
    };
    worker.once('message', onMessage); worker.once('error', onError); worker.once('exit', onExit);
    if (message) worker.postMessage(message);
  });
}

// Workers receive preassigned immutable scenario inputs and import each policy
// once. Only completion order varies; stored results retain the serial order.
export async function evaluatePairedParallel({candidatePath = new URL('../dist/engine.js', import.meta.url), baselinePath,
  rulesPath = new URL('../dist/engine.js', import.meta.url), modelWeights = null, modelScale = 80,
  seeds = [400000, 400001, 400002, 400003], split = 'test', trainingSeeds = [], nodeLimit = 1400,
  maxDepth = 8, extensions = true, actionLimit = 160, roundLimit = null, warmup = 0,
  foulsEnabled = false, record = false, workers = 1, strictGate = false, onScenario = null} = {}) {
  validateSeeds(seeds, split, trainingSeeds); integer(nodeLimit, 'nodeLimit'); integer(maxDepth, 'maxDepth');
  integer(workers, 'workers'); if (workers > 32) throw new Error('workers must be <= 32');
  if (!baselinePath) throw new Error('A frozen baseline path is required');
  const moduleUrl = filename => filename instanceof URL ? filename.href : pathToFileURL(path.resolve(filename)).href;
  const rulesUrl = moduleUrl(rulesPath), candidateUrl = moduleUrl(candidatePath), baselineUrl = moduleUrl(baselinePath);
  const rules = await import(rulesUrl), jobs = [];
  for (const seed of seeds) for (const kickoff of TEAMS) {
    const initialState = createWarmStart({rules, seed, kickoff, warmup, foulsEnabled});
    for (const candidateColor of TEAMS) jobs.push({index: jobs.length, seed, kickoff, candidateColor, initialState});
  }
  const workerCount = Math.min(workers, jobs.length), pool = [], matches = Array(jobs.length);
  const config = {split, seeds: [...seeds], nodeLimit, maxDepth, extensions, actionLimit, roundLimit, warmup, foulsEnabled,
    modelScale,
    workers: workerCount, resultOrder: 'seed, kickoff white/black, candidate color white/black',
    ...(strictGate ? {strictGate: true} : {})};
  let nextIndex = 0, completed = 0, failed = false;
  try {
    const runners = Array.from({length: workerCount}, async () => {
      const worker = new Worker(new URL('./evaluate-selfplay-worker.mjs', import.meta.url), {workerData: {
        rulesUrl, candidateUrl, baselineUrl, modelWeights, modelScale, nodeLimit, maxDepth, extensions, actionLimit, roundLimit, record}});
      pool.push(worker);
      await workerResponse(worker, 'ready');
      while (!failed && nextIndex < jobs.length) {
        const job = jobs[nextIndex++];
        const response = await workerResponse(worker, 'result', {type: 'run', ...job});
        matches[job.index] = response.match; completed++;
        if (onScenario) await onScenario(response.match, completed, job.index);
      }
    });
    await Promise.all(runners);
  } catch (error) {failed = true; throw error;}
  finally {await Promise.all(pool.map(worker => worker.terminate()));}
  return {format: 'football-chess-selfplay-evaluation-v1', createdAt: new Date().toISOString(), config,
    summary: summarizeEvaluation(matches, config), matches};
}

function parseArguments(args) {
  const result = {};
  for (let index = 0; index < args.length; index++) {
    if (!args[index].startsWith('--')) throw new Error(`Unexpected argument ${args[index]}`);
    const [name, inline] = args[index].slice(2).split('=');
    result[name] = inline ?? (args[index + 1]?.startsWith('--') || index + 1 === args.length ? true : args[++index]);
  }
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const args = parseArguments(process.argv.slice(2));
    if (!args.checkpoint || !args.baseline) throw new Error('Usage: node scripts/evaluate-selfplay.mjs --checkpoint file.json --baseline training/frozen/engine-v37.mjs [--engine immutable-engine-snapshot.mjs --split dev|test --seeds 400000,400001 --actions 160 --nodes 1400 --depth 8 --warmup 0 --workers 1 --strict-gate --out evaluation.json]');
    if (args.actions && args.rounds) throw new Error('Choose --actions or --rounds, not both');
    const checkpointPath = path.resolve(args.checkpoint), checkpointBytes = await readFile(checkpointPath);
    const checkpoint = JSON.parse(checkpointBytes.toString('utf8')), weights = validateCheckpoint(checkpoint);
    const split = args.split || 'test', start = SEED_PARTITIONS[split]?.[0];
    const seeds = args.seeds ? String(args.seeds).split(',').map(Number) : Array.from({length: 4}, (_, index) => start + index);
    const baselinePath = path.resolve(args.baseline), enginePath = args.engine ? path.resolve(args.engine)
      : fileURLToPath(new URL('../dist/engine.js', import.meta.url)), workerCount = Number(args.workers || 1);
    integer(workerCount, 'workers');
    const hashBytes = bytes => createHash('sha256').update(bytes).digest('hex');
    const hashFile = async filename => hashBytes(await readFile(filename));
    // Capture hashes before loading either policy or producing any results.
    // A query string avoids reusing the evaluator's default engine import.
    const [baselineSha256, currentRulesSha256] = await Promise.all([hashFile(baselinePath), hashFile(enginePath)]);
    const provenance = {checkpoint: checkpointPath, checkpointSha256: hashBytes(checkpointBytes), baseline: baselinePath,
      baselineSha256, engine: enginePath, currentRulesSha256, sourceHashesCapturedAt: new Date().toISOString(),
      checkpointTraining: checkpoint.training || null};
    const engineUrl = pathToFileURL(enginePath), baselineUrl = pathToFileURL(baselinePath);
    engineUrl.searchParams.set('evaluationSource', currentRulesSha256); baselineUrl.searchParams.set('evaluationSource', baselineSha256);
    const evaluate = workerCount > 1 ? evaluatePairedParallel : evaluatePaired;
    const [rules, baselineModule] = workerCount > 1 ? [null, null] : await Promise.all([import(engineUrl.href), import(baselineUrl.href)]);
    const result = await evaluate({rules, candidateModule: rules, baselineModule, baselinePath: baselineUrl,
      rulesPath: engineUrl, candidatePath: engineUrl, workers: workerCount, modelWeights: weights, modelScale: checkpoint.scale, split, seeds,
      trainingSeeds: checkpoint.training?.seeds || [], nodeLimit: Number(args.nodes || 1400), maxDepth: Number(args.depth || 8),
      actionLimit: Number(args.actions || 160), roundLimit: args.rounds ? Number(args.rounds) : null, warmup: Number(args.warmup || 0),
      foulsEnabled: args.fouls === true || args.fouls === 'true', record: args.record === true || args.record === 'true',
      strictGate: args['strict-gate'] === true || args['strict-gate'] === 'true',
      onScenario: match => process.stdout.write(`${JSON.stringify({seed: match.seed, kickoff: match.kickoff, candidateColor: match.candidateColor, score: match.score, actions: match.actions, error: match.error, elapsedMs: Math.round(match.elapsedMs)})}\n`)});
    const [checkpointAfter, baselineAfter, engineAfter] = await Promise.all([hashFile(checkpointPath), hashFile(baselinePath), hashFile(enginePath)]);
    result.provenance = {...provenance, sourceFilesUnchanged: checkpointAfter === provenance.checkpointSha256
      && baselineAfter === baselineSha256 && engineAfter === currentRulesSha256};
    if (!result.provenance.sourceFilesUnchanged) {
      result.summary.promotionGate.checks.immutableSources = false; result.summary.promotionGate.passed = false;
      process.stderr.write('Evaluation source files changed during the run; promotion rejected.\n'); process.exitCode = 1;
    }
    const output = path.resolve(args.out || `training/evaluation-${split}.json`);
    await mkdir(path.dirname(output), {recursive: true}); await writeFile(output, `${JSON.stringify(result, null, 2)}\n`);
    process.stdout.write(`${JSON.stringify({output, summary: result.summary})}\n`);
    if (result.summary.errors.length) process.exitCode = 1;
  } catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
}
