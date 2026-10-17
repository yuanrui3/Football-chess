// Small, dependency-free semi-gradient TD(lambda) learner. Values always use
// White's perspective: Football Chess can give one team consecutive actions.
export const FEATURE_NAMES = Object.freeze(['possession', 'ballProgress', 'material', 'centerControl', 'openFiles', 'defensiveCover', 'centralReceivers']);
export const RESIDUAL_SCALE = 80;

export function validateVector(vector, length = FEATURE_NAMES.length, label = 'vector') {
  if (!Array.isArray(vector) || vector.length !== length || vector.some(value => !Number.isFinite(value))) throw new TypeError(`${label} must contain ${length} finite numbers.`);
  return vector;
}

export function valuePrediction(features, weights) {
  validateVector(features); validateVector(weights);
  return Math.tanh(features.reduce((sum, feature, index) => sum + feature * weights[index], 0));
}

export function createLearner({weights = Array(FEATURE_NAMES.length).fill(0), alpha = 0.035, gamma = 0.995, lambda = 0.85, maxWeight = 4} = {}) {
  validateVector(weights, FEATURE_NAMES.length, 'weights');
  if (!(alpha > 0 && alpha <= 1) || !(gamma >= 0 && gamma <= 1) || !(lambda >= 0 && lambda <= 1) || !(maxWeight > 0 && maxWeight <= 4 && Number.isFinite(maxWeight))) throw new RangeError('Invalid TD learning parameters (weights are bounded at four).');
  if (weights.some(weight => Math.abs(weight) > maxWeight)) throw new RangeError('Initial weights exceed the configured bound.');
  return {weights: [...weights], eligibility: weights.map(() => 0), alpha, gamma, lambda, maxWeight, updates: 0};
}

export function resetEligibility(learner) {
  learner.eligibility.fill(0);
}

export function goalReward(before, after) {
  const difference = state => Number(state.score.white) - Number(state.score.black);
  const reward = difference(after) - difference(before);
  if (!Number.isFinite(reward)) throw new TypeError('The goal ledger must be finite.');
  return reward;
}

export function tdLambdaUpdate(learner, features, nextFeatures, reward, {terminal = false} = {}) {
  validateVector(features); validateVector(nextFeatures);
  if (!Number.isFinite(reward)) throw new TypeError('The TD reward must be finite.');
  const before = [...learner.weights];
  const prediction = valuePrediction(features, before);
  const bootstrap = terminal ? 0 : valuePrediction(nextFeatures, before);
  const target = reward + learner.gamma * bootstrap;
  const delta = target - prediction;
  const gradientScale = 1 - prediction * prediction;
  learner.eligibility = learner.eligibility.map((trace, index) => learner.gamma * learner.lambda * trace + gradientScale * features[index]);
  learner.weights = before.map((weight, index) => Math.max(-learner.maxWeight, Math.min(learner.maxWeight, weight + learner.alpha * delta * learner.eligibility[index])));
  learner.updates++;
  return {prediction, bootstrap, target, delta, reward, terminal, updateL1: learner.weights.reduce((sum, value, index) => sum + Math.abs(value - before[index]), 0)};
}

// Behavior exploration and the game's stochastic outcomes have separate
// streams. The policy never reads the game's hidden randomState.
export function seededRandom(seed) {
  let state = Number(seed) >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

export function deriveSeed(seed, episode, stream = 'environment') {
  let hash = Number(seed) >>> 0;
  for (const char of `${stream}:${episode}`) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0;
  return hash || 1;
}

export function planningView(state) {
  return {...state, randomState: 1, log: [], lastAction: null};
}

export function applyAction(rules, state, action) {
  if (action.type === 'cornerTaker') return rules.selectCornerTaker(state, action.pieceId);
  if (action.type === 'kick') return rules.applyKick(state, action.x, action.y, {passRun: !!action.passRun, disguise: !!action.disguise});
  if (action.type === 'move') return rules.applyMove(state, action.pieceId, action.x, action.y, {freePawn: !!action.freePawn});
  if (action.type === 'skip') return rules.skipMove(state);
  throw new TypeError(`Unknown action ${action.type}.`);
}

export function assertLegalAction(rules, state, action) {
  if (action.type === 'kick' && rules.legalKicks(state).some(kick => kick.x === action.x && kick.y === action.y)) return;
  if (action.type === 'move' && rules.legalMoves(state, action.pieceId, {freePawn: !!action.freePawn}).some(move => move.x === action.x && move.y === action.y)) return;
  if (action.type === 'cornerTaker' && rules.cornerTakers(state).some(piece => piece.id === action.pieceId)) return;
  if (action.type === 'skip' && (['attackMove', 'defendMove', 'keeperReact', 'passRun', 'finished'].includes(state.phase) || !state.ball?.carrierId && state.phase !== 'cornerSelect')) return;
  throw new Error(`Policy returned an illegal action in ${state.phase}: ${JSON.stringify(action)}`);
}

export function expectedTrainingLeaf(rules, state, weights, residualScale = RESIDUAL_SCALE) {
  // A shot declaration is not a settled possession position. Complete the
  // forced public keeper reply and every goal/save/miss branch before judging
  // it, without consulting the real match's hidden random stream.
  if (state.phase === 'keeperReact') {
    const source = planningView(state);
    const reply = rules.chooseAIAction(source, {difficulty: 'casual'});
    const outcomes = rules.tacticalSuccessors(source, reply);
    const mass = outcomes.reduce((sum, item) => sum + item.probability, 0);
    if (!outcomes.length || !Number.isFinite(mass) || Math.abs(mass - 1) > 1e-7 || outcomes.some(item => !Number.isFinite(item.probability) || item.probability < 0 || item.state.phase === 'keeperReact')) throw new Error('A keeper reply must resolve the shot with normalized public chance outcomes.');
    return outcomes.reduce((sum, item) => sum + item.probability * expectedTrainingLeaf(rules, item.state, weights, residualScale), 0);
  }
  return rules.tacticalBasePositionValue(state, 'white') + (state.phase === 'finished' || !weights ? 0 : residualScale * rules.rlValuePrediction(state, 'white', weights));
}

export function chooseTrainingAction(rules, state, weights, {random = seededRandom(1), epsilon = 0, candidateWidth = 6, policy = 'beam', nodeLimit = 96, residualScale = RESIDUAL_SCALE} = {}) {
  if (![80,320].includes(residualScale)) throw new RangeError('The residual scale must be 80 or 320.');
  const source = planningView(state);
  const candidates = rules.rankedTacticalActions(source, candidateWidth, false);
  if (!candidates.length) return {action: rules.chooseAIAction(source, {difficulty: 'casual'}), explored: false, candidates: 0};
  if (epsilon > 0 && random() < epsilon) {
    const index = Math.min(candidates.length - 1, Math.floor(random() * candidates.length));
    return {action: candidates[index].action, explored: true, candidates: candidates.length};
  }
  if (policy === 'tactical') {
    const report=rules.analyzeTacticalAction(source, {nodeLimit, modelWeights: weights, modelScale: residualScale});
    return {action:report.action,explored:false,candidates:candidates.length,searchValue:report.value,completedDepth:report.stats?.completedDepth??0,searchNodes:report.stats?.nodes??0};
  }
  if (policy === 'casual') return {action: rules.chooseAIAction(source, {difficulty: 'casual'}), explored: false, candidates: candidates.length};
  if (policy !== 'beam') throw new RangeError(`Unknown behavior policy ${policy}.`);
  const sign = rules.currentTeam(source) === 'white' ? 1 : -1;
  let action = candidates[0].action, best = -Infinity;
  for (const candidate of candidates) {
    const successors = rules.tacticalSuccessors(source, candidate.action);
    const probability = successors.reduce((sum, item) => sum + item.probability, 0);
    if (!successors.length || !Number.isFinite(probability) || Math.abs(probability - 1) > 1e-7 || successors.some(item => !Number.isFinite(item.probability) || item.probability < 0)) throw new Error('Chance successors must sum to one.');
    const expected = successors.reduce((sum, item) => sum + item.probability * expectedTrainingLeaf(rules, item.state, weights, residualScale), 0);
    const value = sign * expected;
    if (value > best + 1e-10) {best = value; action = candidate.action;}
  }
  return {action, explored: false, candidates: candidates.length, expectedValue: best * sign};
}

export function trainEpisode(rules, learner, {seed = 1, episode = 0, actions = 384, epsilon = 0.12, candidateWidth = 6, policy = 'beam', nodeLimit = 96, foulsEnabled = false, initialState = null, traceLimit = 12} = {}) {
  if (!Number.isInteger(actions) || actions < 1) throw new RangeError('actions must be a positive integer.');
  resetEligibility(learner);
  const environmentSeed = (Number(seed) + episode) >>> 0, behaviorSeed = deriveSeed(seed, episode, 'behavior');
  const random = seededRandom(behaviorSeed);
  let state = initialState ? structuredClone(initialState) : rules.createGame({seed: environmentSeed, kickoff: episode % 2 ? 'black' : 'white', mode: 'local', foulsEnabled});
  const initialWeights = [...learner.weights];
  const stats = {episode, environmentSeed, behaviorSeed, kickoff: state.attack, actions: 0, exploredActions: 0, goalEvents: [], trace: [], updateL1: 0, deltaL1: 0, nonzeroDeltaUpdates: 0, predictionAbsMax: 0, score: null, terminal: false, truncated: false, finalBootstrap: null, initialWeights};
  while (stats.actions < actions && state.phase !== 'finished') {
    const before = state, features = rules.rlValueFeatures(before, 'white');
    const decision = chooseTrainingAction(rules, before, learner.weights, {random, epsilon, candidateWidth, policy, nodeLimit});
    assertLegalAction(rules, before, decision.action);
    state = applyAction(rules, before, decision.action);
    const reward = goalReward(before, state), terminal = state.phase === 'finished';
    const nextFeatures = rules.rlValueFeatures(state, 'white');
    const update = tdLambdaUpdate(learner, features, nextFeatures, reward, {terminal});
    const item = {step: stats.actions, team: rules.currentTeam(before), phase: before.phase, action: decision.action, explored: decision.explored, reward, prediction: update.prediction, bootstrap: update.bootstrap, delta: update.delta, updateL1: update.updateL1};
    if (stats.trace.length < traceLimit || reward) stats.trace.push(item);
    if (reward) stats.goalEvents.push({...item, score: {...state.score}, scoringPiece: state.lastAction?.scorerId ?? state.lastAction?.shooterId ?? null});
    stats.actions++; stats.exploredActions += Number(decision.explored);
    stats.updateL1 += update.updateL1; stats.deltaL1 += Math.abs(update.delta);
    stats.nonzeroDeltaUpdates += Number(Math.abs(update.delta) > 1e-12);
    stats.predictionAbsMax = Math.max(stats.predictionAbsMax, Math.abs(update.prediction));
    stats.finalBootstrap = update.bootstrap;
  }
  stats.score = {...state.score}; stats.terminal = state.phase === 'finished';
  stats.winner = state.winner ?? null; stats.finishReason = state.finishReason ?? null;
  stats.truncated = !stats.terminal && stats.actions >= actions;
  stats.finalWeights = [...learner.weights];
  stats.finalBootstrap = stats.terminal ? 0 : rules.rlValuePrediction(state, 'white', learner.weights);
  // Truncating a research episode does not invent full time or zero the value
  // of its last position. Only the engine's true terminal states do that.
  return {state, stats};
}

export function evaluateEpisode(rules, weights, {seed = 1, game = 0, actions = 384, policy = 'tactical', baselinePolicy = 'tactical', candidateWidth = 6, nodeLimit = 1400, foulsEnabled = false, traceLimit = 8} = {}) {
  const learnerTeam = game % 2 ? 'black' : 'white';
  const pair = Math.floor(game / 2), environmentSeed = deriveSeed(seed, pair, 'diagnostic-evaluation');
  let state = rules.createGame({seed: environmentSeed, kickoff: 'white', mode: 'local', foulsEnabled});
  const stats = {game, pair, environmentSeed, learnerTeam, actions: 0, goalEvents: [], trace: [], score: null, outcome: null, terminal: false, truncated: false};
  const frozenWeights = [...weights];
  while (stats.actions < actions && state.phase !== 'finished') {
    const before = state, team = rules.currentTeam(before), learned = team === learnerTeam;
    const selected = chooseTrainingAction(rules, before, learned ? frozenWeights : null, {epsilon: 0, candidateWidth, policy: learned ? policy : baselinePolicy, nodeLimit});
    assertLegalAction(rules, before, selected.action);
    state = applyAction(rules, before, selected.action);
    const reward = goalReward(before, state), item = {step: stats.actions, team, phase: before.phase, action: selected.action};
    if (stats.trace.length < traceLimit || reward) stats.trace.push(item);
    if (reward) stats.goalEvents.push({...item, reward, score: {...state.score}});
    stats.actions++;
  }
  stats.score = {...state.score}; stats.terminal = state.phase === 'finished'; stats.truncated = !stats.terminal && stats.actions >= actions;
  stats.goalDifference = state.score[learnerTeam] - state.score[learnerTeam === 'white' ? 'black' : 'white'];
  stats.outcome = state.winner ? state.winner === learnerTeam ? 'win' : 'loss' : stats.goalDifference > 0 ? 'win' : stats.goalDifference < 0 ? 'loss' : 'draw';
  return {state, stats};
}
