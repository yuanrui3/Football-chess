import {performance} from 'node:perf_hooks';

const END = {kind: 'end'};
const SKIP = {type: 'skip'};
const KICK_PHASES = ['kick', 'kickoff', 'keeperRelease'];

function integer(value, name, min, max) {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}`);
  }
}

function randomSource(seed) {
  let state = (seed >>> 0) || 0x8fca1d3b;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x100000000;
  };
}

function checkedMass(outcomes) {
  const mass = outcomes.reduce((sum, outcome) => sum + outcome.probability, 0);
  if (Math.abs(mass - 1) > 1e-9 || outcomes.some(({probability}) => !Number.isFinite(probability) || probability <= 0)) {
    throw new Error('Successor probabilities do not sum to one');
  }
}

// Equal-mass strata give both methods the same bounded pre-shot dynamics. When
// the native list already fits, keep its original probabilities and states.
function stratify(outcomes, samples) {
  checkedMass(outcomes);
  if (outcomes.length <= samples) return outcomes;
  const counts = new Map();
  let index = 0, cumulative = outcomes[0].probability;
  for (let sample = 0; sample < samples; sample++) {
    const midpoint = (sample + 0.5) / samples;
    while (midpoint >= cumulative && index + 1 < outcomes.length) {
      cumulative += outcomes[++index].probability;
    }
    counts.set(index, (counts.get(index) ?? 0) + 1);
  }
  return [...counts].map(([outcome, count]) => ({state: outcomes[outcome].state, probability: count / samples}));
}

function nodeValue(node, estimates, horizon) {
  if (node.kind === 'end') return 0;
  if (node.kind === 'shot') return estimates[node.index];
  if (node.kind === 'chance') {
    let total = 0;
    for (const branch of node.branches) total += branch.probability * nodeValue(branch.next, estimates, horizon);
    return total;
  }
  if (!node.reaction && node.ply >= horizon) return 0;
  let value = node.maximize ? -Infinity : Infinity;
  for (const option of node.options) {
    const reply = nodeValue(option.next, estimates, horizon);
    value = node.maximize ? Math.max(value, reply) : Math.min(value, reply);
  }
  return value;
}

function choose(trial, estimates, horizon = trial.horizon) {
  if (!trial.rootActions.length) return {action: null, actionIndex: -1, value: 0, values: []};
  const values = trial.root.options.map(option => !trial.root.reaction && horizon === 0 ? 0 : nodeValue(option.next, estimates, horizon));
  const best = values.reduce((winner, value, index) => value > values[winner] + 1e-12 ? index : winner, 0);
  return {action: trial.rootActions[best], actionIndex: best, value: values[best], values};
}

function keeperActions(engine, state) {
  const team = engine.currentTeam(state);
  const keeper = state.pieces.find(piece => piece.team === team && piece.type === 'K');
  const legal = keeper ? engine.legalMoves(state, keeper.id) : [];
  return [SKIP, ...legal.map(({x, y}) => ({type: 'move', pieceId: keeper.id, x, y}))];
}

function shotActions(engine, state) {
  const team = engine.currentTeam(state);
  const shots = engine.legalKicks(state).filter(kick => kick.goal === team && kick.offsideReason !== 'boxKnight')
    .map(({x, y}) => ({type: 'kick', x, y}));
  const disguised = engine.disguisedShotTargets(state);
  if (disguised.length === 2 && shots.length) {
    const {x, y} = disguised[0];
    shots.push({type: 'kick', x, y, disguise: true});
  }
  return shots;
}

function choices(engine, state, ply, horizon, width) {
  if (state.phase === 'keeperReact') return keeperActions(engine, state);
  if (KICK_PHASES.includes(state.phase)) {
    const shots = shotActions(engine, state);
    if (ply + 1 >= horizon && shots.length) return shots;
    const setup = engine.rankedTacticalActions(state, width, ply === 0)
      .filter(entry => entry.category !== 'shot').slice(0, width).map(entry => entry.action);
    return [...shots, ...setup];
  }
  const actions = engine.rankedTacticalActions(state, width, ply === 0).slice(0, width).map(entry => entry.action);
  // Ending positioning is legal and independently useful when the costly part
  // of a plan has already happened. Always offer it in these three phases.
  if (['attackMove', 'defendMove', 'passRun'].includes(state.phase) && !actions.some(action => action.type === 'skip')) {
    actions.push(SKIP);
  }
  return actions;
}

function buildTrial(engine, position, {horizon = 5, width = 2, preShotSamples = 2, objective = 'goal'} = {}) {
  integer(horizon, 'horizon', 1, 8);
  integer(width, 'width', 1, 8);
  integer(preShotSamples, 'preShotSamples', 1, 16);
  if (!['goal', 'continuation'].includes(objective)) throw new Error('Unrecognized pilot objective');
  const started = performance.now();
  const team = engine.currentTeam(position.state), leaves = [];
  if (!team) throw new Error('Pilot position has no acting team');
  let nodeCount = 0, chanceNodes = 0, approximatedChanceNodes = 0, minShotPlies = Infinity;

  function expand(state, ply) {
    nodeCount++;
    const actor = engine.currentTeam(state), reaction = state.phase === 'keeperReact';
    if (!actor || (!reaction && ply >= horizon)) return END;
    const actions = choices(engine, state, ply, horizon, width);
    if (!actions.length) return END;
    const options = actions.map(action => {
      if (reaction) {
        const index = leaves.length;
        minShotPlies = Math.min(minShotPlies, ply);
        leaves.push({state, action, direction: state.pendingShot.scoringTeam === team ? 1 : -1});
        nodeCount++;
        return {action, next: {kind: 'shot', index}};
      }
      const outcomes = engine.tacticalSuccessors(state, action);
      if (outcomes.length === 1) return {action, next: expand(outcomes[0].state, ply + 1)};
      nodeCount++;
      chanceNodes++;
      if (outcomes.length > preShotSamples) approximatedChanceNodes++;
      const branches = stratify(outcomes, preShotSamples)
        .map(({probability, state: successor}) => ({probability, next: expand(successor, ply + 1)}));
      return {action, next: {kind: 'chance', branches}};
    });
    return {kind: 'decision', maximize: actor === team, reaction, ply, options};
  }

  const root = expand(position.state, 0);
  return {root, team, horizon, width, preShotSamples, objective, leaves, rootActions: root.options?.map(option => option.action) ?? [],
    leafCount: leaves.length, nodeCount, chanceNodes, approximatedChanceNodes,
    minShotPlies: Number.isFinite(minShotPlies) ? minShotPlies : null, preparationMs: performance.now() - started};
}

function shotDistribution(engine, trial, leaf) {
  const {state, action, direction} = leaf;
  if (trial.objective === 'goal') {
    const keeper = action.type === 'move' ? action : undefined;
    const p = engine.shotChance(state, state.pendingShot.x, state.pendingShot.y, keeper);
    if (!Number.isFinite(p) || p < 0 || p > 1) throw new Error('Invalid shot probability');
    // A Bernoulli with the public mixture has the same binary goal law as
    // sampling the disguised endpoint first and then resolving that shot.
    return {goalProbability: p, direction};
  }
  const outcomes = engine.tacticalSuccessors(state, action);
  checkedMass(outcomes);
  const opponent = trial.team === 'white' ? 'black' : 'white';
  const tally = new Map();
  for (const {state: next, probability} of outcomes) {
    const goal = (next.score[trial.team] - state.score[trial.team]) - (next.score[opponent] - state.score[opponent]);
    const possession = next.pieces.find(piece => piece.id === next.ball.carrierId)?.team ?? next.restart?.team;
    const value = goal || (possession === trial.team ? 0.1 : possession === opponent ? -0.1 : 0);
    tally.set(value, (tally.get(value) ?? 0) + probability);
  }
  return {outcomes: [...tally].map(([value, probability]) => ({value, probability}))};
}

function expectation(distribution) {
  if (!distribution.outcomes) return distribution.goalProbability * distribution.direction;
  return distribution.outcomes.reduce((sum, outcome) => sum + outcome.probability * outcome.value, 0);
}

function sampleOutcome(distribution, roll) {
  if (!distribution.outcomes) return roll < distribution.goalProbability ? distribution.direction : 0;
  for (const outcome of distribution.outcomes) {
    roll -= outcome.probability;
    if (roll < 0) return outcome.value;
  }
  return distribution.outcomes.at(-1).value;
}

function decide(engine, trial, {method, budgetMs, seed = 1} = {}) {
  if (!['known', 'sampled'].includes(method)) throw new Error('Unrecognized shot decision method');
  if (!Number.isFinite(budgetMs) || budgetMs < 0) throw new Error('Invalid decision budget');
  const started = performance.now(), deadline = started + budgetMs;
  const distributions = Array(trial.leafCount), sums = new Float64Array(trial.leafCount);
  const estimates = new Float64Array(trial.leafCount), random = randomSource(seed);
  let completedSweeps = 0, evaluatedLeaves = 0, outcomeSamples = 0, timedOut = false;
  let result = {action: trial.rootActions[0] ?? null, actionIndex: trial.rootActions.length ? 0 : -1, value: null, values: null};

  if (trial.rootActions.length && trial.leafCount) {
    // Shared traversal and accept only complete sweeps. The previous choice
    // survives a deadline so enumeration order gives no partly visited action
    // an advantage. A first-sweep timeout uses the common canonical action.
    sweeps: while (true) {
      for (let index = 0; index < trial.leafCount; index++) {
        if (performance.now() >= deadline) { timedOut = true; break sweeps; }
        if (distributions[index] === undefined) {
          distributions[index] = shotDistribution(engine, trial, trial.leaves[index]);
          evaluatedLeaves++;
        }
        if (method === 'known') estimates[index] = expectation(distributions[index]);
        else {
          sums[index] += sampleOutcome(distributions[index], random());
          estimates[index] = sums[index] / (completedSweeps + 1);
          outcomeSamples++;
        }
      }
      if (performance.now() >= deadline) { timedOut = true; break; }
      const next = choose(trial, estimates);
      if (performance.now() > deadline) { timedOut = true; break; }
      result = next;
      completedSweeps++;
      if (method === 'known') break;
    }
  }
  return {...result, elapsedMs: performance.now() - started, completedSweeps, evaluatedLeaves, outcomeSamples, timedOut};
}

export function makePlanner(engine) {
  if (typeof engine.rankedTacticalActions !== 'function' || typeof engine.tacticalSuccessors !== 'function') {
    throw new Error('The frozen engine needs the two read-only study exports');
  }
  return {
    buildTrial: (position, options) => buildTrial(engine, position, options),
    reference(trial, {horizon = trial.horizon} = {}) {
      integer(horizon, 'reference horizon', 0, trial.horizon);
      const exact = trial.leaves.map(leaf => expectation(shotDistribution(engine, trial, leaf)));
      return {...choose(trial, exact, horizon), horizon, reachableShot: trial.minShotPlies !== null && trial.minShotPlies <= horizon};
    },
    decide: (trial, options) => decide(engine, trial, options)
  };
}
