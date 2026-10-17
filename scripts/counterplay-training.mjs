// Counterplay experience generation. The learner is deliberately frozen for a
// rollout; the caller applies genuine TD(lambda) updates afterward, in order.
import {chooseTrainingAction, planningView, seededRandom, deriveSeed, applyAction, assertLegalAction, goalReward} from './rl-training.mjs';

export function featureNamesFor(rules, length = null) {
  const shot = rules.RL_SHOT_FEATURE_NAMES;
  if (shot && (!length || length === shot.length)) return [...shot];
  const context = rules.RL_CONTEXT_FEATURE_NAMES;
  if (context && (!length || length === context.length)) return [...context];
  // The legacy family stays reproducible even when a contextual model becomes
  // the browser's default and RL_VALUE_MODEL.featureNames therefore changes.
  const names = ['possession','ballProgress','material','centerControl','openFiles','defensiveCover','centralReceivers'];
  if (length && names.length !== length) throw new Error(`Engine does not expose ${length} model features.`);
  return [...names];
}
export function counterplayFeatures(rules, state, length) {
  const fn = rules.RL_SHOT_FEATURE_NAMES?.length === length ? rules.rlShotFeatures : rules.RL_CONTEXT_FEATURE_NAMES?.length === length ? (rules.rlContextFeatures ?? rules.rlContextValueFeatures) : rules.rlValueFeatures;
  if (typeof fn !== 'function') throw new Error('No compatible value feature encoder.');
  const vector = fn(state,'white');
  if (vector.length !== length || vector.some(x=>!Number.isFinite(x))) throw new Error('Feature dimension mismatch or invalid value.');
  return vector;
}
export function createCounterLearner({weights, alpha=.003, gamma=.995, lambda=.97, maxWeight=4, residualScale=80, searchBackupAlpha=0}={}) {
  if (!Array.isArray(weights) || !weights.length || weights.some(x=>!Number.isFinite(x)||Math.abs(x)>maxWeight)) throw new Error('Invalid weights.');
  if (!(alpha>0&&alpha<=1&&gamma>=0&&gamma<=1&&lambda>=0&&lambda<=1&&maxWeight>0&&maxWeight<=4)) throw new Error('Invalid TD parameters.');
  if (![80,320].includes(residualScale)) throw new Error('The residual scale must be 80 or 320.');
  if (!(searchBackupAlpha>=0&&searchBackupAlpha<=1&&Number.isFinite(searchBackupAlpha))) throw new Error('Invalid search backup learning rate.');
  return {weights:[...weights],eligibility:weights.map(()=>0),alpha,gamma,lambda,maxWeight,residualScale,searchBackupAlpha,updates:0};
}
export function residualPrediction(features,weights) {
  if (features.length!==weights.length) throw new Error('Value dimensions differ.');
  return Math.tanh(features.reduce((sum,x,i)=>sum+x*weights[i],0));
}
export function priorValue(rules,state,residualScale=80) {
  if (state.phase==='finished') return 0;
  return (rules.tacticalBasePositionValue(state,'white')-2000*(state.score.white-state.score.black))/residualScale;
}
export function expectedPriorUpdate(learner,transition) {
  const before=[...learner.weights], prediction=residualPrediction(transition.features,before);
  const target=transition.outcomes.reduce((sum,item)=>sum+item.probability*((2000/(learner.residualScale??80))*item.reward+(item.terminal?0:learner.gamma*(item.prior+residualPrediction(item.features,before)))),0);
  const delta=target-transition.prior-prediction;
  learner.eligibility=learner.eligibility.map((trace,i)=>learner.gamma*learner.lambda*trace+(1-prediction*prediction)*transition.features[i]);
  learner.weights=before.map((w,i)=>Math.max(-learner.maxWeight,Math.min(learner.maxWeight,w+learner.alpha*delta*learner.eligibility[i])));
  learner.updates++;
  return {delta,prediction,target,updateL1:learner.weights.reduce((sum,w,i)=>sum+Math.abs(w-before[i]),0)};
}

export function searchBackupTarget(rules,state,decision,residualScale=80) {
  if (!(decision.completedDepth>0)||!Number.isFinite(decision.searchValue)||Math.abs(decision.searchValue)>=1e5||state.phase==='finished') return null;
  const actor=rules.currentTeam(state); if (!['white','black'].includes(actor)) return null;
  const value=((actor==='white'?1:-1)*decision.searchValue-rules.tacticalBasePositionValue(state,'white'))/residualScale;
  return Math.max(-.95,Math.min(.95,value));
}
export function searchBackupUpdate(learner,features,target) {
  if (!learner.searchBackupAlpha||target===null||!Number.isFinite(target)) return {applied:false,updateL1:0};
  const before=[...learner.weights], prediction=residualPrediction(features,before), delta=target-prediction;
  learner.weights=before.map((weight,i)=>Math.max(-learner.maxWeight,Math.min(learner.maxWeight,weight+learner.searchBackupAlpha*delta*(1-prediction*prediction)*features[i])));
  return {applied:true,prediction,delta,updateL1:learner.weights.reduce((sum,w,i)=>sum+Math.abs(w-before[i]),0)};
}

export function chooseOpponent(episode, {baselineFraction = .75, poolWeights = null, seed = 200000} = {}) {
  if (!(baselineFraction >= 0 && baselineFraction <= 1)) throw new RangeError('baselineFraction must be in [0,1].');
  const random = seededRandom(deriveSeed(seed, episode, 'opponent'));
  if (random() < baselineFraction) return 'baseline';
  return poolWeights && episode % 2 ? 'checkpoint' : 'selfplay';
}

export function generateCounterplayEpisode(rules, frozen, weights, {
  seed = 200000, episode = 0, actions = 384, epsilon = .10,
  candidateWidth = 8, policy = 'beam', nodeLimit = 128,
  baselineNodes = 128, baselineDepth = 8, baselinePolicy = 'tactical',
  baselineFraction = .75, poolWeights = null, warmup = 0,
  foulsEnabled = true, initialState = null, traceLimit = 12, residualScale=80,searchBackupAlpha=0,
} = {}) {
  if (!Number.isInteger(actions) || actions < 1 || !Number.isInteger(warmup) || warmup < 0) throw new RangeError('Invalid rollout length.');
  const environmentSeed = (Number(seed) + episode) >>> 0;
  const behaviorSeed = deriveSeed(seed, episode, 'behavior');
  const random = seededRandom(behaviorSeed), learnerTeam = episode % 2 ? 'black' : 'white';
  const opponent = chooseOpponent(episode, {baselineFraction, poolWeights, seed});
  const frozenWeights = [...weights];
  let state = initialState ? structuredClone(initialState) : rules.createGame({seed: environmentSeed, kickoff: Math.floor(episode / 2) % 2 ? 'black' : 'white', mode: 'local', foulsEnabled});
  let warmupActions=0;
  for (let step = 0; step < warmup && state.phase !== 'finished'; step++) {
    const action = frozen.chooseAIAction(planningView(state), {difficulty: 'casual'});
    assertLegalAction(rules, state, action); state = applyAction(rules, state, action); warmupActions++;
  }
  const initialScore = {...state.score};
  const stats = {episode, environmentSeed, behaviorSeed, learnerTeam, opponent, kickoff: state.attack, warmup,warmupActions, actions: 0, learnerActions: 0, opponentActions: 0, exploredActions: 0, publicExpectedGoalMass: 0, publicExpectedSignedReward: 0, goalEvents: [], trace: [], initialScore, score: null, terminal: false, truncated: false};
  const transitions = [];
  // Settle a pending shot even if its declaration was the final budgeted action.
  while ((stats.actions < actions || state.phase === 'keeperReact') && state.phase !== 'finished') {
    const before = state, team = rules.currentTeam(before), learnerTurn = team === learnerTeam;
    let decision;
    if (learnerTurn) decision = chooseTrainingAction(rules, before, frozenWeights, {random, epsilon, candidateWidth, policy, nodeLimit,residualScale});
    else if (opponent === 'baseline') {
      if (baselinePolicy === 'tactical') decision = {action: frozen.analyzeTacticalAction(planningView(before), {nodeLimit: baselineNodes, maxDepth: baselineDepth}).action, explored: false};
      else decision = chooseTrainingAction(frozen, before, null, {random, epsilon: 0, candidateWidth, policy: baselinePolicy, nodeLimit: baselineNodes});
    } else decision = chooseTrainingAction(rules, before, opponent === 'checkpoint' ? poolWeights : frozenWeights, {random, epsilon: 0, candidateWidth, policy, nodeLimit,residualScale});
    assertLegalAction(rules, before, decision.action);
    const publicOutcomes=rules.tacticalSuccessors(planningView(before),decision.action);
    const probability=publicOutcomes.reduce((s,o)=>s+o.probability,0);
    if (!publicOutcomes.length||Math.abs(probability-1)>1e-7||publicOutcomes.some(o=>!Number.isFinite(o.probability)||o.probability<0)) throw new Error('Invalid public chance outcomes.');
    const expected={features:counterplayFeatures(rules,before,weights.length),prior:priorValue(rules,before,residualScale),outcomes:publicOutcomes.map(o=>({probability:o.probability,reward:goalReward(before,o.state),features:counterplayFeatures(rules,o.state,weights.length),prior:priorValue(rules,o.state,residualScale),terminal:o.state.phase==='finished'}))};
    if (searchBackupAlpha>0&&(learnerTurn||opponent==='selfplay')) expected.searchTarget=searchBackupTarget(rules,before,decision,residualScale);
    stats.publicExpectedGoalMass+=expected.outcomes.reduce((sum,o)=>sum+o.probability*Math.abs(o.reward),0);
    stats.publicExpectedSignedReward+=expected.outcomes.reduce((sum,o)=>sum+o.probability*o.reward,0);
    state = applyAction(rules, before, decision.action);
    const reward = goalReward(before, state), terminal = state.phase === 'finished';
    transitions.push({...expected,actualReward:reward,actualTerminal:terminal});
    const item = {step: stats.actions, team, phase: before.phase, learnerTurn, action: decision.action, explored: !!decision.explored, reward};
    if (stats.trace.length < traceLimit || reward) stats.trace.push(item);
    if (reward) stats.goalEvents.push({...item, score: {...state.score}});
    stats.actions++; stats.learnerActions += Number(learnerTurn); stats.opponentActions += Number(!learnerTurn); stats.exploredActions += Number(!!decision.explored);
    if (stats.actions > actions + 2) throw new Error('Pending shot did not settle.');
  }
  stats.score = {...state.score}; stats.terminal = state.phase === 'finished'; stats.truncated = !stats.terminal;
  stats.winner = state.winner ?? null; stats.finishReason = state.finishReason ?? null;
  stats.learnerGoals = state.score[learnerTeam] - initialScore[learnerTeam];
  const opposing = learnerTeam === 'white' ? 'black' : 'white';
  stats.opponentGoals = state.score[opposing] - initialScore[opposing];
  stats.goalDifference = stats.learnerGoals - stats.opponentGoals;
  stats.policyWeights = frozenWeights;
  return {stats, transitions};
}

export function replayCounterplayEpisode(learner, rollout) {
  learner.eligibility.fill(0);
  const stats = {...rollout.stats, initialWeights: [...learner.weights], updateL1: 0, deltaL1: 0, nonzeroDeltaUpdates: 0, predictionAbsMax: 0,searchBackupUpdates:0,searchBackupUpdateL1:0};
  for (const transition of rollout.transitions) {
    const update = expectedPriorUpdate(learner, transition);
    stats.updateL1 += update.updateL1; stats.deltaL1 += Math.abs(update.delta);
    stats.nonzeroDeltaUpdates += Number(Math.abs(update.delta) > 1e-12);
    stats.predictionAbsMax = Math.max(stats.predictionAbsMax, Math.abs(update.prediction));
    stats.finalBootstrap = transition.actualTerminal?0:update.target;
    const fitted=searchBackupUpdate(learner,transition.features,transition.searchTarget??null);
    stats.searchBackupUpdates+=Number(fitted.applied); stats.searchBackupUpdateL1+=fitted.updateL1; stats.updateL1+=fitted.updateL1;
  }
  stats.finalWeights = [...learner.weights];
  return stats;
}
