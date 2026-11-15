import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const DEFAULT_ROOT = new URL('../../', import.meta.url);
const PRESETS = ['aggressive', 'neutral', 'defensive'];
const MAX_ACTIONS = 240;
const MAX_GAMES = 72;
const GOOD_CHANCE = 0.10;
const WEAK_CHANCE = 0.05;
const SETS = {
  development: {
    natural: {reaction: 6, kick: 6, build: 5},
    requireTwoMoveCandidates: 2,
    shallow: ['knights-two-posts'],
    build: {
      'release-the-knight': 'exercise-easy-knight-channel',
      'medium-clear-file': 'exercise-medium-rook-clearance',
      'tough-knight-wall-pass': 'exercise-tough-wall-pass',
    },
  },
  holdout: {
    natural: {reaction: 10, kick: 10, build: 7},
    requireTwoMoveCandidates: 3,
    shallow: ['queen-two-targets'],
    build: {
      'medium-pawn-clear': 'exercise-medium-queen-clearance',
      'tough-wide-rook-relay': 'exercise-tough-flank',
      'tough-unlock-the-rook-battery': 'exercise-tough-mixed',
      'tough-find-the-protected-pocket': 'exercise-tough-mixed',
    },
  },
};

function sourceRoot(assetRoot) {
  if (assetRoot === undefined) return DEFAULT_ROOT;
  if (assetRoot instanceof URL || assetRoot.startsWith('file:')) {
    const url = new URL(assetRoot);
    if (!url.pathname.endsWith('/')) url.pathname += '/';
    return url;
  }
  return pathToFileURL(resolve(assetRoot) + '/');
}

// Separate the sample from earlier experiments and keep dev and test in
// different 2^29-wide ranges, even if a hash happens to collide across splits.
function gameSeed(split, index) {
  const hash = createHash('sha256').update(`football-chess-shot-probability-pilot-v1/${split}/${index}`).digest();
  return (split === 'development' ? 0x40000000 : 0x60000000) + (hash.readUInt32BE(0) & 0x1fffffff);
}

function act(engine, state, {type, pieceId, x, y, freePawn, passRun, disguise}) {
  switch (type) {
    case 'move': return engine.applyMove(state, pieceId, x, y, {freePawn});
    case 'kick': return engine.applyKick(state, x, y, {passRun, disguise});
    case 'cornerTaker': return engine.selectCornerTaker(state, pieceId);
    case 'skip': return engine.skipMove(state);
    default: throw new Error(`Unknown action type ${type}`);
  }
}

function visible(state) {
  return {...state, randomState: 0, log: [], lastAction: null};
}

function keeperChances(engine, pending) {
  if (pending.phase !== 'keeperReact' || pending.pendingShot.shootingTeam !== pending.pendingShot.scoringTeam) return [];
  const team = engine.currentTeam(pending);
  const keeper = pending.pieces.find(piece => piece.team === team && piece.type === 'K');
  if (!keeper) return [];
  return [undefined, ...engine.legalMoves(pending, keeper.id)].map(move => engine.shotModel(pending, undefined, undefined, move).goalProbability);
}

function shots(engine, state) {
  const kicks = engine.legalKicks(state);
  const pending = kicks.filter(kick => kick.goal === state.attack && !kick.offside)
    .map(kick => act(engine, state, {type: 'kick', ...kick}));
  const [disguise] = engine.disguisedShotTargets(state);
  if (disguise) pending.push(act(engine, state, {type: 'kick', ...disguise, disguise: true}));
  const chances = pending.filter(next => next.phase === 'keeperReact').map(next => {
    const probabilities = keeperChances(engine, next);
    return probabilities.length ? Math.min(...probabilities) : engine.shotModel(next).goalProbability;
  });
  return {chances, passes: kicks.filter(kick => !kick.goal && !kick.offside).length};
}

function bestImmediate(engine, state) {
  // A diagnostic on this geometry alone. The real phase and the defender's
  // right to move are retained in every position handed to the search.
  return Math.max(0, ...shots(engine, {...state, phase: 'kick'}).chances);
}

function singleMoveBest(engine, state) {
  let best = bestImmediate(engine, state);
  for (const piece of state.pieces) {
    if (piece.team !== state.attack) continue;
    for (const freePawn of [false, true]) {
      for (const move of engine.legalMoves(state, piece.id, {freePawn})) {
        const after = act(engine, state, {type: 'move', pieceId: piece.id, x: move.x, y: move.y, freePawn});
        if (after.attack === state.attack) best = Math.max(best, bestImmediate(engine, after));
      }
    }
  }
  return best;
}

function geometryKey(engine, state) {
  const rotate = state.attack === 'black';
  const coordinates = ({x, y}) => rotate ? [engine.BOARD_WIDTH - 1 - x, engine.BOARD_HEIGHT - 1 - y] : [x, y];
  const id = player => rotate && player ? player.replace(/^(white|black)-/, (_, team) => team === 'white' ? 'black-' : 'white-') : player;
  const board = state.pieces.map(piece => [id(piece.id), piece.type, ...coordinates(piece)]).sort(([a], [b]) => a.localeCompare(b));
  const shot = state.pendingShot;
  const targets = shot ? (shot.targetOptions ?? [shot]).map(coordinates).sort(([a], [b]) => a - b) : null;
  return JSON.stringify([state.phase, board, coordinates(state.ball), id(state.ball.carrierId), state.positionBudget, state.restart?.type, targets]);
}

function buildWitness(engine, history, declaration, shotStep, requireTwoMoves = false) {
  const shooter = declaration.pendingShot.shootingTeam;
  const keeper = keeperChances(engine, declaration);
  if (!keeper.length) return null;
  const witnessChance = Math.min(...keeper);
  if (witnessChance < GOOD_CHANCE) return null;
  let steps = 0;
  let best = null;
  for (let index = history.length - 1; index >= Math.max(0, history.length - 12); index--) {
    const {state, action} = history[index];
    if (state.attack !== shooter || state.phase === 'keeperReact') break;
    if (engine.currentTeam(state) === shooter && action.type !== 'skip' && action.type !== 'cornerTaker') steps++;
    const span = shotStep - index + 1;
    if (state.phase !== 'attackMove' || steps < 2 || span < 4) continue;
    const immediateChance = bestImmediate(engine, state);
    if (immediateChance > WEAK_CHANCE) continue;
    const candidate = {state, step: index, setupSteps: steps, declarationSpan: span, witnessChance, immediateChance};
    // Prefer a witnessed line close to a six-decision search horizon. This
    // creates a tactical challenge set, rather than a prevalence sample.
    if (best && Math.abs(span - 5) >= Math.abs(best.declarationSpan - 5)) continue;
    if (requireTwoMoves) {
      candidate.singleMoveBestChance = singleMoveBest(engine, state);
      if (candidate.singleMoveBestChance >= GOOD_CHANCE) continue;
    }
    best = candidate;
  }
  return best;
}

function rollout(engine, seed, index, preferredKind, seen, requireTwoMoves) {
  const kickoff = index % 2 ? 'black' : 'white';
  const formations = {white: PRESETS[Math.floor(index / 2) % 3], black: PRESETS[Math.floor(index / 5) % 3]};
  let state = engine.createGame({mode: 'local', seed, kickoff, formations, foulsEnabled: true});
  const history = [];
  for (let step = 0; step < MAX_ACTIONS && state.phase !== 'finished'; step++) {
    if (preferredKind === 'reaction' && state.phase === 'keeperReact' && !state.pendingShot.penalty) {
      const chances = keeperChances(engine, state);
      if (chances.length > 1 && Math.max(...chances) - Math.min(...chances) >= 0.02 && !seen.has(geometryKey(engine, state))) {
        return {state, step, aimOptions: state.pendingShot.targetOptions?.length ?? 1, reactionCount: chances.length,
          keeperMinChance: Math.min(...chances), keeperMaxChance: Math.max(...chances), kickoff, formations};
      }
    }
    if (preferredKind === 'kick' && state.phase === 'kick' && !state.restart && !seen.has(geometryKey(engine, state))) {
      const {chances, passes} = shots(engine, state);
      const bestChance = Math.max(0, ...chances);
      if (bestChance >= 0.04 && passes > 0) return {state, step, aimOptions: chances.length, passOptions: passes, bestChance, kickoff, formations};
    }
    const action = engine.chooseAIAction(visible(state), {difficulty: 'casual'});
    const next = act(engine, state, action);
    if (preferredKind === 'build' && next.phase === 'keeperReact' && !next.pendingShot.penalty) {
      const witness = buildWitness(engine, history, next, step, requireTwoMoves);
      if (witness && !seen.has(geometryKey(engine, witness.state))) return {...witness, kickoff, formations};
    }
    history.push({state, action});
    state = next;
  }
  return null;
}

async function exercisePositions(engine, config, assetRoot) {
  const root = sourceRoot(assetRoot);
  const [{createExercisePosition}, {EXERCISE_SOLUTIONS}] = await Promise.all([
    import(new URL('dist/exercise-positions.js', root).href), import(new URL('dist/exercise-solutions.js', root).href),
  ]);
  const result = [];
  for (const exercise of config.shallow) {
    const {seed, actions} = EXERCISE_SOLUTIONS.examples[exercise];
    const state = createExercisePosition(exercise, seed);
    const family = `exercise-${exercise}`;
    const {chances, passes} = shots(engine, state);
    if (chances.length < 2 || !passes) throw new Error(`Expected several choices in ${exercise}`);
    result.push({id: `${family}-kick`, family, kind: 'kick', state, source: 'exercise', exercise,
      aimOptions: chances.length, passOptions: passes, bestChance: Math.max(...chances)});
    const action = {...actions[0], disguise: true};
    const declaration = act(engine, state, action);
    const reaction = keeperChances(engine, declaration);
    if (reaction.length < 2) throw new Error(`Expected a goalkeeper choice in ${exercise}`);
    result.push({id: `${family}-reaction`, family, kind: 'reaction', state: declaration, source: 'exercise', exercise,
      aimOptions: declaration.pendingShot.targetOptions.length, reactionCount: reaction.length,
      keeperMinChance: Math.min(...reaction), keeperMaxChance: Math.max(...reaction)});
  }
  for (const [exercise, family] of Object.entries(config.build)) {
    const {seed, actions} = EXERCISE_SOLUTIONS.examples[exercise];
    let state = createExercisePosition(exercise, seed);
    const history = [];
    for (const action of actions) {
      const next = act(engine, state, action);
      if (next.phase === 'keeperReact') {
        const witness = buildWitness(engine, history, next, history.length);
        if (!witness) throw new Error(`Missing legal buildup witness for ${exercise}`);
        result.push({id: `exercise-${exercise}-build`, family, kind: 'build', source: 'exercise', exercise, ...witness});
        break;
      }
      history.push({state, action});
      state = next;
    }
  }
  return result;
}

async function buildPositionSet(engine, {split, assetRoot}, excluded = []) {
  const config = SETS[split];
  const exercise = await exercisePositions(engine, config, assetRoot);
  const result = [];
  const seen = new Set(excluded.map(position => geometryKey(engine, position.state)));
  for (const position of exercise) {
    const key = geometryKey(engine, position.state);
    if (seen.has(key)) throw new Error(`Repeated exercise geometry in ${position.id}`);
    seen.add(key);
  }
  const counts = {reaction: 0, kick: 0, build: 0};
  const kinds = Object.keys(counts);
  const usedSeeds = new Set();
  for (let index = 0; !kinds.every(kind => counts[kind] === config.natural[kind]) && index < MAX_GAMES; index++) {
    const order = kinds.map((_, offset) => kinds[(index + offset) % kinds.length]);
    const selected = order.find(kind => counts[kind] < config.natural[kind]);
    const seed = gameSeed(split, index);
    if (usedSeeds.has(seed)) throw new Error(`Duplicate ${split} seed ${seed}`);
    usedSeeds.add(seed);
    const requireTwoMoves = selected === 'build' && counts.build < config.requireTwoMoveCandidates;
    const position = rollout(engine, seed, index, selected, seen, requireTwoMoves);
    if (!position) continue;
    const family = `game-${seed}`;
    result.push({id: `${family}-${selected}-${position.step}`, family, kind: selected, source: 'casual-self-play', seed, ...position});
    seen.add(geometryKey(engine, position.state));
    counts[selected]++;
  }
  for (const kind of kinds) {
    if (counts[kind] !== config.natural[kind]) throw new Error(`Only found ${counts[kind]} of ${config.natural[kind]} natural ${kind} positions for ${split}`);
  }
  return [...result, ...exercise].map(position => ({...position,
    ...(position.kind === 'build' ? {singleMoveBestChance: position.singleMoveBestChance ?? singleMoveBest(engine, position.state)} : {}),
    state: visible(position.state)}));
}

export async function collectPositions(engine, {split, assetRoot} = {}) {
  if (split === 'dev') split = 'development';
  if (!Object.hasOwn(SETS, split)) throw new Error('Choose development or holdout positions');
  // Casual openings can replay identically with distinct seeds. Exclude their
  // canonical board geometry across splits, including color-rotated copies.
  const excluded = split === 'holdout' ? await buildPositionSet(engine, {split: 'development', assetRoot}) : [];
  return buildPositionSet(engine, {split, assetRoot}, excluded);
}
