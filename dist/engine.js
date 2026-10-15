/** Football Chess, expanded rules. Coordinates: a15=(0,0), l1=(11,14). */
export const TYPES = Object.freeze(['K', 'Q', 'R', 'B', 'N', 'P']);
export const BOARD_WIDTH = 12;
export const BOARD_HEIGHT = 15;
export const GOAL_FILES = Object.freeze([4, 5, 6, 7]);

const TEAMS = ['white', 'black'];
const DIAGONALS = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
const STRAIGHTS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const DIRECTIONS = [...STRAIGHTS, ...DIAGONALS];
const KNIGHT = [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]];
const NAMES = {K: 'goalkeeper', Q: 'queen', R: 'rook', B: 'bishop', N: 'knight', P: 'pawn'};
const SQUAD = ['K', 'Q', 'R1', 'R2', 'B1', 'B2', 'N1', 'N2', 'P1', 'P2', 'P3'];
const other = team => team === 'white' ? 'black' : 'white';
const inside = (x, y) => Number.isInteger(x) && Number.isInteger(y) && x >= 0 && x < BOARD_WIDTH && y >= 0 && y < BOARD_HEIGHT;
export const isBox = (x, y) => inside(x, y) && GOAL_FILES.includes(x) && (y <= 1 || y >= BOARD_HEIGHT - 2);
const pieceAt = (state, x, y) => state.pieces.find(p => p.x === x && p.y === y);
const allowedSquare = (piece, x, y) => inside(x, y) && (!isBox(x, y) || piece.type === 'K');
const square = (x, y) => inside(x, y) ? `${'abcdefghijkl'[x]}${BOARD_HEIGHT - y}` : 'the net';
const title = team => team === 'white' ? 'White' : 'Black';
const copy = state => JSON.parse(JSON.stringify(state));
const addLog = (state, line) => { state.log = [...(state.log || []), line].slice(-80); };
const goalAt = (x, y) => GOAL_FILES.includes(x) ? (y === -1 ? 'white' : y === BOARD_HEIGHT ? 'black' : null) : null;
const distance = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
const freshBudget = () => ({normalUsed: false, pawnUsed: false});
const positionalTurn = state => state.phase === 'attackMove' || state.phase === 'defendMove';
const budgetFor = state => state.positionBudget || freshBudget();

function formation(kickoff) {
  const white = {K: [5, 14], Q: [5, 10], R1: [1, 11], R2: [10, 11], B1: [3, 11], B2: [8, 11], N1: [2, 12], N2: [9, 12], P1: [4, 9], P2: [6, 9], P3: [8, 9]};
  const locations = {white, black: Object.fromEntries(Object.entries(white).map(([id, [x, y]]) => [id, [BOARD_WIDTH - 1 - x, BOARD_HEIGHT - 1 - y]]))};
  locations[kickoff].Q = kickoff === 'white' ? [5, 7] : [6, 7];
  return TEAMS.flatMap(team => SQUAD.map(id => ({id: `${team}-${id}`, team, type: id[0], x: locations[team][id][0], y: locations[team][id][1]})));
}

function normalizeSeed(seed) {
  if (Number.isFinite(Number(seed))) return Number(seed) >>> 0;
  let value = 2166136261;
  for (const character of String(seed)) value = Math.imul(value ^ character.charCodeAt(0), 16777619) >>> 0;
  return value;
}

// Every actual random outcome advances a small, serializable PRNG. Planning and
// legal-action previews never consume it. Test rolls replace only the outcome.
function nextRoll(state, override) {
  if (override !== undefined && (!Number.isFinite(override) || override < 0 || override >= 1)) throw new Error('A test roll must be between 0 (inclusive) and 1 (exclusive).');
  state.randomState = (Math.imul(1664525, normalizeSeed(state.randomState ?? 1)) + 1013904223) >>> 0;
  return override === undefined ? state.randomState / 4294967296 : override;
}

export function createGame({mode = 'solo', minutes = 10, kickoff = 'white', seed = Date.now()} = {}) {
  kickoff = TEAMS.includes(kickoff) ? kickoff : 'white';
  const pieces = formation(kickoff);
  const carrier = pieces.find(p => p.id === `${kickoff}-Q`);
  return {
    pieces, ball: {x: carrier.x, y: carrier.y, carrierId: carrier.id},
    attack: kickoff, phase: 'kickoff', positionBudget: freshBudget(), pendingShot: null,
    score: {white: 0, black: 0}, turn: 1, randomState: normalizeSeed(seed),
    log: [`${title(kickoff)} has kick-off. Kick the ball to begin.`], lastAction: null,
    mode, minutes: Number.isFinite(Number(minutes)) && Number(minutes) > 0 ? Number(minutes) : 10,
    rulesVersion: 2
  };
}

export function currentTeam(state) {
  if (!state || state.phase === 'finished') return null;
  if (state.phase === 'keeperReact') return state.pendingShot?.defendingTeam || other(state.attack);
  return state.phase === 'defendMove' ? other(state.attack) : state.attack;
}

function movementShape(piece) {
  if (piece.type === 'N') return {vectors: KNIGHT, range: 1};
  if (piece.type === 'P') return {vectors: STRAIGHTS, range: 1};
  if (piece.type === 'K') return {vectors: DIRECTIONS, range: 1};
  if (piece.type === 'B') return {vectors: DIAGONALS, range: 10};
  if (piece.type === 'R') return {vectors: STRAIGHTS, range: 10};
  return {vectors: DIRECTIONS, range: 10};
}

function canTackle(state, piece, carrier) {
  if (!carrier || carrier.team === piece.team) return false;
  const dx = carrier.x - piece.x, dy = carrier.y - piece.y;
  const reach = Math.max(Math.abs(dx), Math.abs(dy));
  if (!reach || reach > 10) return false;
  if (piece.type === 'N') return KNIGHT.some(([x, y]) => x === dx && y === dy);
  if (piece.type === 'P') return Math.abs(dx) === 1 && dy === (piece.team === 'white' ? -1 : 1);
  if (piece.type === 'K') return reach === 1;
  const straight = dx === 0 || dy === 0, diagonal = Math.abs(dx) === Math.abs(dy);
  if (!(piece.type === 'Q' ? straight || diagonal : piece.type === 'R' ? straight : diagonal)) return false;
  const sx = Math.sign(dx), sy = Math.sign(dy);
  for (let step = 1; step < reach; step++) if (pieceAt(state, piece.x + sx * step, piece.y + sy * step)) return false;
  return true;
}

function keeperReactionMoves(state, piece) {
  if (!piece || piece.type !== 'K' || piece.team !== currentTeam(state)) return [];
  return DIRECTIONS.map(([dx, dy]) => ({x: piece.x + dx, y: piece.y + dy, type: 'keeperMove'}))
    .filter(move => allowedSquare(piece, move.x, move.y) && !pieceAt(state, move.x, move.y));
}

export function legalMoves(state, pieceId, {freePawn = false} = {}) {
  const piece = state.pieces.find(p => p.id === pieceId);
  if (state.phase === 'keeperReact') return freePawn ? [] : keeperReactionMoves(state, piece);
  if (!positionalTurn(state) || !piece || piece.team !== currentTeam(state)) return [];
  const budget = budgetFor(state);
  if (freePawn ? budget.pawnUsed || piece.type !== 'P' : budget.normalUsed) return [];
  const moves = new Map(), shape = movementShape(piece);
  for (const [dx, dy] of shape.vectors) {
    for (let step = 1; step <= shape.range; step++) {
      const x = piece.x + dx * step, y = piece.y + dy * step;
      if (!inside(x, y) || pieceAt(state, x, y)) break;
      if (allowedSquare(piece, x, y)) moves.set(`${x},${y}`, {x, y, type: 'move', ...(freePawn ? {freePawn: true} : {})});
    }
  }
  if (!freePawn) {
    const carrier = state.pieces.find(p => p.id === state.ball.carrierId);
    if (canTackle(state, piece, carrier)) {
      for (const [dx, dy] of DIRECTIONS) {
        const x = carrier.x + dx, y = carrier.y + dy, occupant = pieceAt(state, x, y);
        if (distance(piece, {x, y}) <= 10 && allowedSquare(piece, x, y) && (!occupant || occupant.id === piece.id)) {
          moves.set(`${x},${y}`, {x, y, type: 'tackle', targetId: carrier.id, tackleProbability: carrier.type === 'N' ? 0.5 : 1});
        }
      }
    }
  }
  return [...moves.values()];
}

export function passAccuracy(kickDistance) {
  const length = Math.max(0, Number(kickDistance) || 0);
  return Math.max(0.25, Math.round((1 - Math.max(0, length - 10) * 0.1) * 100) / 100);
}

export function shotChance(state, x = state.pendingShot?.x, y = state.pendingShot?.y, keeperPosition) {
  const scoringTeam = goalAt(x, y) || (GOAL_FILES.includes(x) && y === 0 ? 'white' : GOAL_FILES.includes(x) && y === BOARD_HEIGHT - 1 ? 'black' : null);
  const defendingTeam = scoringTeam ? other(scoringTeam) : state.pendingShot?.defendingTeam;
  if (!defendingTeam) return 0;
  const keeper = keeperPosition || state.pieces.find(p => p.team === defendingTeam && p.type === 'K');
  if (!keeper) return 1;
  const impact = {x, y: scoringTeam === 'white' ? 0 : scoringTeam === 'black' ? BOARD_HEIGHT - 1 : Math.max(0, Math.min(BOARD_HEIGHT - 1, y))};
  const separation = distance(keeper, impact);
  return separation === 0 ? 0 : separation === 1 ? 0.25 : separation === 2 ? 0.5 : 1;
}

function kickRecord(state, carrier, x, y, path, receiver, goal) {
  const length = distance(carrier, {x, y});
  return {
    x, y, path, distance: length, accuracy: goal ? 1 : passAccuracy(length),
    ...(receiver ? {receiverId: receiver.id} : {}), ...(goal ? {goal, probability: shotChance(state, x, y)} : {}),
    label: goal ? 'Shoot at goal' : receiver ? `Pass to ${NAMES[receiver.type]}` : `Kick to ${square(x, y)}`
  };
}

function rawKicks(state) {
  const carrier = state.pieces.find(p => p.id === state.ball.carrierId);
  if (!carrier) return [];
  const kicks = [];
  if (carrier.type === 'N') {
    for (const [dx, dy] of KNIGHT) {
      const x = carrier.x + dx, y = carrier.y + dy, goal = goalAt(x, y);
      if (!inside(x, y) && !goal) continue;
      kicks.push(kickRecord(state, carrier, x, y, [{x: carrier.x, y: carrier.y}, {x, y}], pieceAt(state, x, y), goal));
    }
    return kicks;
  }
  const vectors = carrier.type === 'P' ? STRAIGHTS : carrier.type === 'B' ? DIAGONALS : carrier.type === 'R' ? STRAIGHTS : DIRECTIONS;
  for (const [dx, dy] of vectors) {
    const path = [{x: carrier.x, y: carrier.y}];
    // Ordinary passes stop at the first piece, including a goalkeeper.
    for (let step = 1; step <= BOARD_HEIGHT + 1; step++) {
      const x = carrier.x + dx * step, y = carrier.y + dy * step;
      if (!inside(x, y)) break;
      path.push({x, y});
      const receiver = pieceAt(state, x, y);
      kicks.push(kickRecord(state, carrier, x, y, [...path], receiver));
      if (receiver) break;
    }
    if (!dy) continue;
    // A shot has its own ray: the opposing keeper gets a reaction rather than
    // erasing a shot target simply by standing on that ray.
    const shotPath = [{x: carrier.x, y: carrier.y}];
    const defendingTeam = dy < 0 ? 'black' : 'white';
    for (let step = 1; step <= BOARD_HEIGHT + 1; step++) {
      const x = carrier.x + dx * step, y = carrier.y + dy * step;
      shotPath.push({x, y});
      if (!inside(x, y)) {
        const goal = goalAt(x, y);
        if (goal) kicks.push(kickRecord(state, carrier, x, y, [...shotPath], null, goal));
        break;
      }
      const obstacle = pieceAt(state, x, y);
      if (obstacle && !(obstacle.type === 'K' && obstacle.team === defendingTeam && obstacle.team !== carrier.team)) break;
    }
  }
  return kicks;
}

export function legalKicks(state) {
  return ['kick', 'kickoff', 'keeperRelease'].includes(state.phase) ? rawKicks(state) : [];
}

function beginPosition(state, phase = 'attackMove') {
  state.phase = phase;
  state.positionBudget = freshBudget();
  state.pendingShot = null;
}

function advancePosition(state, previousPhase) {
  if (previousPhase === 'attackMove') beginPosition(state, 'defendMove');
  else if (state.ball.carrierId && state.pieces.some(p => p.id === state.ball.carrierId)) {
    state.phase = 'kick';
    state.positionBudget = freshBudget();
  } else {
    beginPosition(state);
    state.turn++;
    addLog(state, 'The ball is loose. A new positioning round begins.');
  }
}

function resolveShot(next, {roll, keeperMove} = {}) {
  const shot = next.pendingShot;
  if (!shot || next.phase !== 'keeperReact') throw new Error('There is no shot awaiting a goalkeeper reaction.');
  const keeper = next.pieces.find(p => p.type === 'K' && p.team === shot.defendingTeam);
  const probability = shotChance(next, shot.x, shot.y);
  const outcomeRoll = nextRoll(next, roll);
  const scored = probability === 1 || (probability > 0 && outcomeRoll < probability);
  const common = {pieceId: shot.shooterId, shooterId: shot.shooterId, shootingTeam: shot.shootingTeam, from: shot.from, goalTarget: {x: shot.x, y: shot.y}, probability, accuracy: probability, roll: outcomeRoll, shotPath: shot.path, ...(keeperMove ? {keeperMove} : {})};
  if (scored) {
    const conceded = shot.defendingTeam;
    next.score[shot.scoringTeam]++;
    next.pieces = formation(conceded);
    const kickoffPlayer = next.pieces.find(p => p.id === `${conceded}-Q`);
    next.ball = {x: kickoffPlayer.x, y: kickoffPlayer.y, carrierId: kickoffPlayer.id};
    next.attack = conceded;
    next.phase = 'kickoff';
    next.positionBudget = freshBudget();
    next.pendingShot = null;
    next.turn++;
    next.lastAction = {...common, type: 'goal', team: shot.scoringTeam, to: {x: shot.x, y: shot.y}, path: shot.path, outcome: 'goal', ownGoal: shot.scoringTeam !== shot.shootingTeam};
    addLog(next, `${title(shot.scoringTeam)} scores (${Math.round(probability * 100)}% chance)${shot.scoringTeam !== shot.shootingTeam ? ' — an own goal!' : '!'} ${next.score.white}–${next.score.black}. ${title(conceded)} kicks off.`);
  } else {
    // Normal games always have a keeper; this fallback also makes imported
    // scenario fixtures resolve without leaving an unplayable pending shot.
    const destination = keeper ? {x: keeper.x, y: keeper.y} : {x: shot.x, y: shot.y < 0 ? 0 : BOARD_HEIGHT - 1};
    next.ball = {...destination, carrierId: keeper?.id || null};
    next.attack = shot.defendingTeam;
    beginPosition(next);
    next.turn++;
    next.lastAction = {...common, type: 'save', team: shot.defendingTeam, keeperId: keeper?.id, to: destination, path: [...shot.path.slice(0, -1), destination], outcome: 'saved'};
    addLog(next, `${title(shot.defendingTeam)} goalkeeper saves (${Math.round(probability * 100)}% scoring chance). ${title(shot.defendingTeam)} takes possession.`);
  }
  return next;
}

export function applyMove(state, pieceId, x, y, {freePawn = false, roll} = {}) {
  const move = legalMoves(state, pieceId, {freePawn}).find(candidate => candidate.x === x && candidate.y === y);
  if (!move) throw new Error('That is not a legal move.');
  const next = copy(state), piece = next.pieces.find(p => p.id === pieceId), from = {x: piece.x, y: piece.y};
  piece.x = x; piece.y = y;
  if (state.phase === 'keeperReact') {
    addLog(next, `${title(piece.team)} goalkeeper reacts to ${square(x, y)}.`);
    return resolveShot(next, {roll, keeperMove: {pieceId, from, to: {x, y}}});
  }
  const previousAttack = state.attack, wasCarrier = next.ball.carrierId === piece.id;
  const tackling = move.type === 'tackle', probability = move.tackleProbability ?? 1;
  const outcomeRoll = tackling && probability < 1 ? nextRoll(next, roll) : undefined;
  const tackleSuccess = tackling && (probability === 1 || outcomeRoll < probability);
  const collection = !next.ball.carrierId && next.ball.x === x && next.ball.y === y;
  if (tackleSuccess || collection || wasCarrier) next.ball = {x, y, carrierId: piece.id};
  const turnover = (tackleSuccess || collection) && piece.team !== previousAttack;
  if (turnover) {
    next.attack = piece.team;
    beginPosition(next);
    next.turn++;
  } else {
    next.positionBudget = {...budgetFor(state), [freePawn ? 'pawnUsed' : 'normalUsed']: true};
    if (next.positionBudget.normalUsed && next.positionBudget.pawnUsed) advancePosition(next, state.phase);
  }
  const target = state.pieces.find(p => p.id === move.targetId);
  next.lastAction = {
    type: tackling ? tackleSuccess ? 'tackle' : 'tackleMiss' : 'move', team: piece.team, pieceId, from, to: {x, y},
    path: target ? [from, {x: target.x, y: target.y}, {x, y}] : [from, {x, y}], freePawn,
    ...(move.targetId ? {targetId: move.targetId} : {}), ...(collection ? {collection: true} : {}),
    ...(tackling ? {probability, tackleSuccess, outcome: tackleSuccess ? 'won' : 'evaded', ...(outcomeRoll !== undefined ? {roll: outcomeRoll} : {})} : {})
  };
  addLog(next, tackling
    ? tackleSuccess
      ? `${title(piece.team)} ${NAMES[piece.type]} wins the tackle (${Math.round(probability * 100)}% chance) and takes possession at ${square(x, y)}.`
      : `${title(piece.team)} ${NAMES[piece.type]} moves to ${square(x, y)}, but the knight evades the tackle (50% chance). The knight keeps the ball; the regular move is used.`
    : `${title(piece.team)} ${NAMES[piece.type]} ${wasCarrier ? 'dribbles' : 'moves'} to ${square(x, y)}${collection ? ' and collects the ball' : ''}${freePawn ? ' (free pawn move)' : ''}.`);
  return next;
}

export function skipMove(state, {roll} = {}) {
  if (state.phase === 'keeperReact') {
    const next = copy(state);
    addLog(next, `${title(currentTeam(state))} goalkeeper holds position.`);
    return resolveShot(next, {roll});
  }
  if (!positionalTurn(state)) {
    if (['kick', 'keeperRelease'].includes(state.phase) && !state.ball.carrierId) {
      const next = copy(state);
      beginPosition(next); next.turn++;
      next.lastAction = {type: 'skip', team: state.attack, phase: state.phase};
      addLog(next, 'The ball is loose. A new positioning round begins.');
      return next;
    }
    throw new Error('Only a positioning turn or goalkeeper reaction can be ended.');
  }
  const next = copy(state);
  next.lastAction = {type: 'skip', team: currentTeam(state), phase: state.phase};
  addLog(next, `${title(currentTeam(state))} ends its positioning turn.`);
  advancePosition(next, state.phase);
  return next;
}
export const endPositionTurn = skipMove;

function scatterSquare(state, target) {
  let candidates = DIRECTIONS.map(([dx, dy]) => ({x: target.x + dx, y: target.y + dy})).filter(p => inside(p.x, p.y) && !pieceAt(state, p.x, p.y));
  if (!candidates.length) {
    let closest = Infinity;
    for (let y = 0; y < BOARD_HEIGHT; y++) for (let x = 0; x < BOARD_WIDTH; x++) {
      if (pieceAt(state, x, y)) continue;
      const length = distance(target, {x, y});
      if (length < closest) { closest = length; candidates = [{x, y}]; }
      else if (length === closest) candidates.push({x, y});
    }
  }
  return candidates[Math.floor(nextRoll(state) * candidates.length)] || target;
}

export function applyKick(state, x, y, {roll} = {}) {
  const kick = legalKicks(state).find(candidate => candidate.x === x && candidate.y === y);
  if (!kick) throw new Error('That is not a legal kick.');
  const next = copy(state), carrier = state.pieces.find(p => p.id === state.ball.carrierId), from = {x: carrier.x, y: carrier.y};
  if (kick.goal) {
    next.pendingShot = {x, y, shooterId: carrier.id, shootingTeam: carrier.team, scoringTeam: kick.goal, defendingTeam: other(kick.goal), from, path: kick.path, distance: kick.distance};
    next.phase = 'keeperReact';
    next.lastAction = {type: 'shotAttempt', team: carrier.team, pieceId: carrier.id, from, to: {x, y}, path: kick.path, goalTarget: {x, y}, probability: shotChance(state, x, y), outcome: 'pending'};
    addLog(next, `${title(carrier.team)} ${NAMES[carrier.type]} shoots toward ${'abcdefghijkl'[x]}! ${title(other(kick.goal))} may move its goalkeeper or hold before the shot resolves.`);
    return next;
  }
  const accuracy = kick.accuracy, outcomeRoll = nextRoll(next, roll), successful = accuracy === 1 || outcomeRoll < accuracy;
  next.turn++;
  if (!successful) {
    const scattered = scatterSquare(next, {x, y});
    next.ball = {...scattered, carrierId: null};
    next.attack = carrier.team;
    beginPosition(next);
    next.lastAction = {type: 'miss', team: carrier.team, pieceId: carrier.id, from, to: scattered, intendedTo: {x, y}, path: [...kick.path.slice(0, -1), scattered], distance: kick.distance, accuracy, probability: accuracy, roll: outcomeRoll, outcome: 'inaccurate'};
    addLog(next, `${title(carrier.team)} ${NAMES[carrier.type]}'s long pass goes astray (${Math.round(accuracy * 100)}% accuracy). The ball is loose at ${square(scattered.x, scattered.y)}.`);
    return next;
  }
  const receiver = next.pieces.find(p => p.id === kick.receiverId), interception = receiver && receiver.team !== carrier.team;
  next.ball = {x, y, carrierId: receiver?.id || null};
  next.attack = receiver?.team || carrier.team;
  beginPosition(next);
  const backPass = receiver && receiver.type === 'K' && receiver.team === carrier.team && receiver.id !== carrier.id;
  if (backPass) next.phase = 'keeperRelease';
  next.lastAction = {type: interception ? 'interception' : 'kick', team: carrier.team, pieceId: carrier.id, from, to: {x, y}, path: kick.path, distance: kick.distance, accuracy, probability: accuracy, roll: outcomeRoll, outcome: interception ? 'interception' : 'complete', ...(receiver ? {receiverId: receiver.id} : {}), ...(backPass ? {backPass: true} : {})};
  addLog(next, receiver
    ? interception ? `${title(receiver.team)} ${NAMES[receiver.type]} intercepts at ${square(x, y)}.`
      : backPass ? `${title(carrier.team)} passes back to the goalkeeper. The goalkeeper must immediately release the ball.`
      : `${title(carrier.team)} passes to the ${NAMES[receiver.type]} at ${square(x, y)} (${Math.round(accuracy * 100)}% accuracy).`
    : `${title(carrier.team)} kicks to ${square(x, y)} (${Math.round(accuracy * 100)}% accuracy). The ball is loose.`);
  return next;
}

const goalDistance = (team, y) => team === 'white' ? y + 1 : BOARD_HEIGHT - y;
function bestShot(state, team) {
  let probability = 0;
  for (const kick of rawKicks(state)) if (kick.goal === team) probability = Math.max(probability, shotChance(state, kick.x, kick.y));
  return probability;
}

function reactedShotChance(state, kick) {
  const keeper = state.pieces.find(p => p.type === 'K' && p.team === other(kick.goal));
  let probability = shotChance(state, kick.x, kick.y);
  if (!keeper) return probability;
  for (const [dx, dy] of DIRECTIONS) {
    const position = {x: keeper.x + dx, y: keeper.y + dy};
    if (allowedSquare(keeper, position.x, position.y) && !pieceAt(state, position.x, position.y)) probability = Math.min(probability, shotChance(state, kick.x, kick.y, position));
  }
  return probability;
}

function kickValue(state, kick, team) {
  if (kick.goal) return kick.goal === team ? reactedShotChance(state, kick) * 1400 - 90 : -3000;
  const carrier = state.pieces.find(p => p.id === state.ball.carrierId), receiver = state.pieces.find(p => p.id === kick.receiverId);
  const progress = goalDistance(team, carrier.y) - goalDistance(team, kick.y);
  let value = progress * 8 + 5.5 - Math.abs(kick.x - 5.5);
  if (receiver) {
    if (receiver.team !== team) return -700 - progress;
    const projected = {...state, ball: {x: receiver.x, y: receiver.y, carrierId: receiver.id}};
    value += 55 + bestShot(projected, team) * 350 + ({Q: 14, R: 11, B: 9, N: 30, P: 4, K: -20})[receiver.type];
    if (state.pieces.some(p => p.team !== team && canTackle(projected, p, receiver))) value -= 65 * (receiver.type === 'N' ? 0.5 : 1);
  } else {
    const target = {x: kick.x, y: kick.y};
    const ownDistance = Math.min(...state.pieces.filter(p => p.team === team && allowedSquare(p, kick.x, kick.y)).map(p => distance(p, target)));
    const enemyDistance = Math.min(...state.pieces.filter(p => p.team !== team && allowedSquare(p, kick.x, kick.y)).map(p => distance(p, target)));
    // Cap the race advantage: an empty square beside our own keeper must not
    // outweigh moving the attack forward merely because opponents are far away.
    value += Math.max(-3, Math.min(3, enemyDistance - ownDistance)) * 12 - 35;
    if (isBox(kick.x, kick.y)) value -= 70;
  }
  return value * kick.accuracy - (1 - kick.accuracy) * 100;
}

function projectedMove(state, piece, move) {
  const moved = {...piece, x: move.x, y: move.y};
  const ball = state.ball.carrierId === piece.id || move.type === 'tackle' || (!state.ball.carrierId && state.ball.x === move.x && state.ball.y === move.y)
    ? {x: move.x, y: move.y, carrierId: piece.id} : state.ball;
  return {...state, pieces: state.pieces.map(p => p.id === piece.id ? moved : p), ball};
}

function moveValue(state, projected, piece, move, team, beforeThreat) {
  if (move.type === 'tackle') return 12000 * (move.tackleProbability ?? 1);
  const afterPiece = projected.pieces.find(p => p.id === piece.id), carrier = projected.pieces.find(p => p.id === projected.ball.carrierId);
  const forward = goalDistance(team, piece.y) - goalDistance(team, move.y);
  let value = 0;
  if (!state.ball.carrierId) {
    if (carrier?.id === piece.id) return 5000 + (piece.type === 'N' ? 30 : 0);
    value += (distance(piece, state.ball) - distance(afterPiece, state.ball)) * 30;
  } else if (carrier?.team === team) {
    if (carrier.id === piece.id) {
      value += forward * 12 + bestShot(projected, team) * 600;
      if (projected.pieces.some(p => p.team !== team && canTackle(projected, p, carrier))) value -= 180 * (carrier.type === 'N' ? 0.5 : 1);
    } else {
      value += forward * 1.8 + (distance(piece, carrier) - distance(afterPiece, carrier)) * 2;
      if (piece.type === 'K') value -= Math.abs(move.y - (team === 'white' ? BOARD_HEIGHT - 1 : 0)) * 5;
    }
  } else if (carrier) {
    value += (distance(piece, carrier) - distance(afterPiece, carrier)) * 5;
    value += (beforeThreat - bestShot(projected, carrier.team)) * 900;
    if (piece.type === 'K') value += 6 - Math.abs(move.y - (team === 'white' ? BOARD_HEIGHT - 1 : 0)) * 3 - Math.abs(move.x - 5.5);
  }
  value += (5.5 - Math.abs(move.x - 5.5)) * 0.3;
  value += ((move.x * 17 + move.y * 13 + state.turn * 7 + piece.id.length) % 23) / 100;
  return value;
}

export function chooseAIAction(state) {
  if (!state || state.phase === 'finished') return {type: 'skip'};
  const team = currentTeam(state);
  if (state.phase === 'keeperReact') {
    const keeper = state.pieces.find(p => p.team === team && p.type === 'K');
    let best = {type: 'skip'}, bestChance = shotChance(state), bestTie = keeper ? Math.abs(keeper.y - (team === 'white' ? BOARD_HEIGHT - 1 : 0)) : Infinity;
    for (const move of keeper ? legalMoves(state, keeper.id) : []) {
      const chance = shotChance(state, state.pendingShot.x, state.pendingShot.y, move), tie = Math.abs(move.y - (team === 'white' ? BOARD_HEIGHT - 1 : 0));
      if (chance < bestChance || (chance === bestChance && tie < bestTie)) {
        best = {type: 'move', pieceId: keeper.id, x: move.x, y: move.y, freePawn: false}; bestChance = chance; bestTie = tie;
      }
    }
    return best;
  }
  if (['kick', 'kickoff', 'keeperRelease'].includes(state.phase)) {
    let best = null, value = -Infinity;
    for (const kick of legalKicks(state)) {
      const candidateValue = kickValue(state, kick, team);
      if (candidateValue > value) { best = kick; value = candidateValue; }
    }
    return best ? {type: 'kick', x: best.x, y: best.y} : {type: 'skip'};
  }
  if (!positionalTurn(state)) return {type: 'skip'};
  const carrier = state.pieces.find(p => p.id === state.ball.carrierId);
  const beforeThreat = carrier && carrier.team !== team ? bestShot(state, carrier.team) : 0;
  let best = {type: 'skip'}, bestValue = -0.5;
  for (const piece of state.pieces) {
    if (piece.team !== team) continue;
    for (const freePawn of [false, true]) {
      for (const move of legalMoves(state, piece.id, {freePawn})) {
        const projected = projectedMove(state, piece, move);
        const value = moveValue(state, projected, piece, move, team, beforeThreat) + (freePawn ? 0.01 : 0);
        if (value > bestValue) { best = {type: 'move', pieceId: piece.id, x: move.x, y: move.y, freePawn}; bestValue = value; }
      }
    }
  }
  return best;
}
