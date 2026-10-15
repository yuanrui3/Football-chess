/** Football Chess rules engine. Coordinates: a11=(0,0), h1=(7,10). */
export const TYPES = Object.freeze(['K', 'Q', 'R', 'B', 'N', 'P']);

const TEAMS = ['white', 'black'];
const DIAGONALS = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
const STRAIGHTS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const DIRECTIONS = [...STRAIGHTS, ...DIAGONALS];
const KNIGHT = [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]];
const NAMES = {K: 'goalkeeper', Q: 'queen', R: 'rook', B: 'bishop', N: 'knight', P: 'pawn'};

const other = team => team === 'white' ? 'black' : 'white';
const inside = (x, y) => Number.isInteger(x) && Number.isInteger(y) && x >= 0 && x < 8 && y >= 0 && y < 11;
const box = (x, y) => (x === 3 || x === 4) && (y <= 1 || y >= 9);
const pieceAt = (state, x, y) => state.pieces.find(p => p.x === x && p.y === y);
const allowedSquare = (piece, x, y) => inside(x, y) && (!box(x, y) || piece.type === 'K');
const square = (x, y) => x >= 0 && x < 8 && y >= 0 && y < 11 ? `${'abcdefgh'[x]}${11 - y}` : 'the net';
const title = team => team === 'white' ? 'White' : 'Black';
const copy = state => JSON.parse(JSON.stringify(state));
const addLog = (state, line) => { state.log = [...(state.log || []), line].slice(-60); };
const goalAt = (x, y) => (x === 3 || x === 4) ? (y === -1 ? 'white' : y === 11 ? 'black' : null) : null;

function formation(kickoff) {
  const locations = {
    white: {K: [3, 10], Q: [4, 7], R: [1, 9], B: [5, 8], N: [6, 8], P: [2, 8]},
    black: {K: [4, 0], Q: [3, 3], R: [6, 1], B: [2, 2], N: [1, 2], P: [5, 2]}
  };
  locations[kickoff].Q = kickoff === 'white' ? [4, 5] : [3, 5];
  return TEAMS.flatMap(team => TYPES.map(type => ({id: `${team}-${type}`, team, type, x: locations[team][type][0], y: locations[team][type][1]})));
}

export function createGame({mode = 'solo', minutes = 10, kickoff = 'white'} = {}) {
  kickoff = TEAMS.includes(kickoff) ? kickoff : 'white';
  const pieces = formation(kickoff);
  const carrier = pieces.find(p => p.id === `${kickoff}-Q`);
  return {
    pieces,
    ball: {x: carrier.x, y: carrier.y, carrierId: carrier.id},
    attack: kickoff,
    phase: 'kickoff',
    score: {white: 0, black: 0},
    turn: 1,
    log: [`${title(kickoff)} has kick-off. Kick the ball to begin.`],
    lastAction: null,
    mode,
    minutes: Number.isFinite(Number(minutes)) && Number(minutes) > 0 ? Number(minutes) : 10
  };
}

export function currentTeam(state) {
  if (!state || state.phase === 'finished') return null;
  return state.phase === 'defendMove' ? other(state.attack) : state.attack;
}

function positionalTurn(state) {
  return state.phase === 'attackMove' || state.phase === 'defendMove';
}

function movementShape(piece) {
  if (piece.type === 'N') return {vectors: KNIGHT, range: 1};
  if (piece.type === 'P') return {vectors: [[0, piece.team === 'white' ? -1 : 1]], range: 1};
  if (piece.type === 'K') return {vectors: DIRECTIONS, range: 1};
  if (piece.type === 'B') return {vectors: DIAGONALS, range: 10};
  if (piece.type === 'R') return {vectors: STRAIGHTS, range: 10};
  return {vectors: DIRECTIONS, range: 10};
}

function canTackle(state, piece, carrier) {
  const dx = carrier.x - piece.x;
  const dy = carrier.y - piece.y;
  if (piece.type === 'N') return KNIGHT.some(([x, y]) => x === dx && y === dy);
  if (piece.type === 'P') return Math.abs(dx) === 1 && dy === (piece.team === 'white' ? -1 : 1);
  if (piece.type === 'K') return Math.max(Math.abs(dx), Math.abs(dy)) === 1;
  const straight = dx === 0 || dy === 0;
  const diagonal = Math.abs(dx) === Math.abs(dy);
  if (!(piece.type === 'Q' ? straight || diagonal : piece.type === 'R' ? straight : diagonal)) return false;
  const distance = Math.max(Math.abs(dx), Math.abs(dy));
  if (!distance) return false;
  const sx = Math.sign(dx), sy = Math.sign(dy);
  for (let step = 1; step < distance; step++) {
    if (pieceAt(state, piece.x + sx * step, piece.y + sy * step)) return false;
  }
  return true;
}

export function legalMoves(state, pieceId) {
  if (!positionalTurn(state)) return [];
  const piece = state.pieces.find(p => p.id === pieceId);
  if (!piece || piece.team !== currentTeam(state)) return [];
  const moves = new Map();
  const shape = movementShape(piece);
  for (const [dx, dy] of shape.vectors) {
    for (let step = 1; step <= shape.range; step++) {
      const x = piece.x + dx * step, y = piece.y + dy * step;
      if (!inside(x, y)) break;
      if (pieceAt(state, x, y)) break;
      if (allowedSquare(piece, x, y)) moves.set(`${x},${y}`, {x, y, type: 'move'});
    }
  }
  const carrier = state.pieces.find(p => p.id === state.ball.carrierId);
  if (carrier && carrier.team !== piece.team && canTackle(state, piece, carrier)) {
    for (const [dx, dy] of DIRECTIONS) {
      const x = carrier.x + dx, y = carrier.y + dy;
      const occupant = pieceAt(state, x, y);
      if (allowedSquare(piece, x, y) && (!occupant || occupant.id === piece.id)) {
        // A destination shared by a normal move and a tackle always means tackle.
        moves.set(`${x},${y}`, {x, y, type: 'tackle', targetId: carrier.id});
      }
    }
  }
  return [...moves.values()];
}

function rawKicks(state) {
  const carrier = state.pieces.find(p => p.id === state.ball.carrierId);
  if (!carrier) return [];
  const kicks = [];
  if (carrier.type === 'N') {
    for (const [dx, dy] of KNIGHT) {
      const x = carrier.x + dx, y = carrier.y + dy;
      const goal = goalAt(x, y);
      if (!inside(x, y) && !goal) continue;
      const receiver = pieceAt(state, x, y);
      kicks.push({x, y, ...(goal ? {goal} : {}), path: [{x: carrier.x, y: carrier.y}, {x, y}], ...(receiver ? {receiverId: receiver.id} : {}), label: goal ? 'Shoot at goal' : receiver ? `Pass to ${NAMES[receiver.type]}` : `Kick to ${square(x, y)}`});
    }
    return kicks;
  }
  let vectors = carrier.type === 'P' ? [[0, carrier.team === 'white' ? -1 : 1]] : carrier.type === 'B' ? DIAGONALS : carrier.type === 'R' ? STRAIGHTS : DIRECTIONS;
  for (const [dx, dy] of vectors) {
    const path = [{x: carrier.x, y: carrier.y}];
    for (let step = 1; step <= 12; step++) {
      const x = carrier.x + dx * step, y = carrier.y + dy * step;
      const goal = goalAt(x, y);
      if (!inside(x, y)) {
        if (goal) kicks.push({x, y, goal, path: [...path, {x, y}], label: 'Shoot at goal'});
        break;
      }
      path.push({x, y});
      const receiver = pieceAt(state, x, y);
      kicks.push({x, y, path: [...path], ...(receiver ? {receiverId: receiver.id} : {}), label: receiver ? `Pass to ${NAMES[receiver.type]}` : `Kick to ${square(x, y)}`});
      if (receiver) break;
    }
  }
  // A pawn at the far border cannot promote or kick backwards. A forward
  // kick immediately hits that border and leaves the ball at its feet.
  if (!kicks.length) kicks.push({x: carrier.x, y: carrier.y, path: [{x: carrier.x, y: carrier.y}], receiverId: carrier.id, label: 'Ball stops at border'});
  return kicks;
}

export function legalKicks(state) {
  if (state.phase !== 'kick' && state.phase !== 'kickoff') return [];
  return rawKicks(state);
}

function advancePosition(state, previousPhase) {
  if (previousPhase === 'attackMove') {
    state.phase = 'defendMove';
  } else if (state.ball.carrierId) {
    state.phase = 'kick';
  } else {
    state.phase = 'attackMove';
    state.turn++;
    addLog(state, 'The ball is loose. A new positioning round begins.');
  }
}

export function applyMove(state, pieceId, x, y) {
  if (!positionalTurn(state)) throw new Error('A piece cannot move in this phase.');
  const move = legalMoves(state, pieceId).find(m => m.x === x && m.y === y);
  if (!move) throw new Error('That is not a legal move.');
  const next = copy(state);
  const piece = next.pieces.find(p => p.id === pieceId);
  const from = {x: piece.x, y: piece.y};
  const previousAttack = state.attack;
  piece.x = x;
  piece.y = y;
  const wasCarrier = next.ball.carrierId === piece.id;
  const collection = !next.ball.carrierId && next.ball.x === x && next.ball.y === y;
  if (move.type === 'tackle' || collection || wasCarrier) {
    next.ball = {x, y, carrierId: piece.id};
  }
  const turnover = (move.type === 'tackle' || collection) && piece.team !== previousAttack;
  if (turnover) {
    next.attack = piece.team;
    next.phase = 'attackMove';
    next.turn++;
  } else {
    advancePosition(next, state.phase);
  }
  next.lastAction = {type: move.type === 'tackle' ? 'tackle' : 'move', team: piece.team, pieceId, from, to: {x, y}, ...(move.targetId ? {targetId: move.targetId} : {}), ...(collection ? {collection: true} : {})};
  addLog(next, move.type === 'tackle'
    ? `${title(piece.team)} ${NAMES[piece.type]} tackles and takes possession at ${square(x, y)}.`
    : `${title(piece.team)} ${NAMES[piece.type]} ${wasCarrier ? 'dribbles' : 'moves'} to ${square(x, y)}${collection ? ' and collects the ball' : ''}.`);
  return next;
}

export function skipMove(state) {
  if (!positionalTurn(state)) throw new Error('Only a positional move can be skipped.');
  const next = copy(state);
  next.lastAction = {type: 'skip', team: currentTeam(state), phase: state.phase};
  addLog(next, `${title(currentTeam(state))} holds position.`);
  advancePosition(next, state.phase);
  return next;
}

export function applyKick(state, x, y) {
  const kick = legalKicks(state).find(k => k.x === x && k.y === y);
  if (!kick) throw new Error('That is not a legal kick.');
  const next = copy(state);
  const carrier = state.pieces.find(p => p.id === state.ball.carrierId);
  const from = {x: carrier.x, y: carrier.y};
  if (kick.goal) {
    const scoringTeam = kick.goal;
    const conceded = other(scoringTeam);
    next.score[scoringTeam]++;
    next.pieces = formation(conceded);
    const kickoffPlayer = next.pieces.find(p => p.id === `${conceded}-Q`);
    next.ball = {x: kickoffPlayer.x, y: kickoffPlayer.y, carrierId: kickoffPlayer.id};
    next.attack = conceded;
    next.phase = 'kickoff';
    next.turn++;
    next.lastAction = {type: 'goal', team: scoringTeam, pieceId: carrier.id, from, to: {x, y}, path: kick.path, ownGoal: scoringTeam !== carrier.team};
    addLog(next, `${title(scoringTeam)} scores${scoringTeam !== carrier.team ? ' — an own goal!' : '!'} ${next.score.white}–${next.score.black}. ${title(conceded)} kicks off.`);
    return next;
  }
  const receiver = next.pieces.find(p => p.id === kick.receiverId);
  next.ball = {x, y, carrierId: receiver ? receiver.id : null};
  next.attack = receiver ? receiver.team : state.attack;
  next.phase = 'attackMove';
  next.turn++;
  const interception = receiver && receiver.team !== carrier.team;
  const borderStop = receiver?.id === carrier.id && carrier.x === x && carrier.y === y;
  next.lastAction = {type: interception ? 'interception' : 'kick', team: carrier.team, pieceId: carrier.id, from, to: {x, y}, path: kick.path, ...(receiver ? {receiverId: receiver.id} : {}), ...(borderStop ? {borderStop: true} : {})};
  addLog(next, borderStop ? `${title(carrier.team)} kicks into the border. The ball stays at ${square(x, y)}.` : receiver
    ? interception ? `${title(receiver.team)} ${NAMES[receiver.type]} intercepts at ${square(x, y)}.` : `${title(carrier.team)} passes to the ${NAMES[receiver.type]} at ${square(x, y)}.`
    : `${title(carrier.team)} kicks to ${square(x, y)}. The ball is loose.`);
  return next;
}

const goalDistance = (team, y) => team === 'white' ? y + 1 : 11 - y;
const distance = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

function shotThreat(state, team) {
  return rawKicks(state).some(k => k.goal === team);
}

function kickValue(state, kick, team) {
  if (kick.goal) return kick.goal === team ? 100000 : -100000;
  const carrier = state.pieces.find(p => p.id === state.ball.carrierId);
  const receiver = state.pieces.find(p => p.id === kick.receiverId);
  const progress = goalDistance(team, carrier.y) - goalDistance(team, kick.y);
  const centrality = 3.5 - Math.abs(kick.x - 3.5);
  let value = progress * 3 + centrality;
  if (receiver) {
    if (receiver.team !== team) return -500 - progress;
    const projected = {...state, ball: {x: receiver.x, y: receiver.y, carrierId: receiver.id}};
    value += 45 + (shotThreat(projected, team) ? 160 : 0);
    value += ({Q: 12, R: 10, B: 8, N: 8, P: 3, K: -12})[receiver.type];
    const hostile = state.pieces.filter(p => p.team !== team);
    if (hostile.some(p => canTackle(projected, p, receiver))) value -= 40;
  } else {
    const target = {x: kick.x, y: kick.y};
    const ownDistance = Math.min(...state.pieces.filter(p => p.team === team && allowedSquare(p, kick.x, kick.y)).map(p => distance(p, target)));
    const enemyDistance = Math.min(...state.pieces.filter(p => p.team !== team && allowedSquare(p, kick.x, kick.y)).map(p => distance(p, target)));
    value -= 22;
    value += (enemyDistance - ownDistance) * 9;
  }
  return value;
}

function positionValue(before, after, action, team) {
  if (after.attack === team && before.attack !== team) return 20000;
  const carrier = after.pieces.find(p => p.id === after.ball.carrierId);
  const isDefense = before.phase === 'defendMove';
  let value = !before.ball.carrierId && carrier?.team === team ? 1500 : 0;
  if (carrier) {
    const threats = rawKicks(after).filter(k => k.goal === carrier.team).length;
    value += threats * (carrier.team === team ? 800 : -2000);
    if (carrier.team === team) {
      value += 12 * (11 - goalDistance(team, carrier.y));
      if (after.pieces.some(p => p.team !== team && canTackle(after, p, carrier))) value -= 130;
    }
  }
  if (action.type === 'skip') return value - 1;
  const piece = after.pieces.find(p => p.id === action.pieceId);
  const oldPiece = before.pieces.find(p => p.id === action.pieceId);
  const forward = goalDistance(team, oldPiece.y) - goalDistance(team, piece.y);
  if (!carrier) {
    const approach = distance(oldPiece, after.ball) - distance(piece, after.ball);
    value += approach * 22;
    if (after.ball.carrierId === piece.id) value += 500;
  } else if (carrier.team === team) {
    if (piece.id === carrier.id) value += forward * 12;
    else value += forward * 1.5 + (distance(oldPiece, carrier) - distance(piece, carrier)) * 2;
  } else {
    value += (distance(oldPiece, carrier) - distance(piece, carrier)) * 3;
    const ownNetY = team === 'white' ? 10 : 0;
    const homeDistance = Math.abs(piece.y - ownNetY);
    if (piece.type === 'K') value += 9 - homeDistance * 2 - Math.abs(piece.x - 3.5) * 2;
  }
  if (piece.type === 'K' && carrier?.team === team && carrier.id !== piece.id) {
    const homeY = team === 'white' ? 10 : 0;
    value -= Math.abs(piece.y - homeY) * 4;
  }
  value += (3.5 - Math.abs(piece.x - 3.5)) * 0.3;
  if (isDefense && carrier?.team !== team && shotThreat(before, carrier?.team)) value -= shotThreat(after, carrier?.team) ? 500 : 0;
  // Deterministic tie-breaking keeps saved matches and previews reproducible.
  value += (((piece.x * 17 + piece.y * 13 + before.turn * 7 + piece.type.charCodeAt(0)) % 23) / 100);
  return value;
}

export function chooseAIAction(state) {
  if (!state || state.phase === 'finished') return {type: 'skip'};
  const team = currentTeam(state);
  if (state.phase === 'kick' || state.phase === 'kickoff') {
    const kicks = legalKicks(state);
    if (!kicks.length) return {type: 'skip'};
    let best = kicks[0], bestValue = -Infinity;
    for (const kick of kicks) {
      const value = kickValue(state, kick, team);
      if (value > bestValue) { best = kick; bestValue = value; }
    }
    return {type: 'kick', x: best.x, y: best.y};
  }
  let bestAction = {type: 'skip'};
  let bestValue = positionValue(state, skipMove(state), bestAction, team);
  for (const piece of state.pieces.filter(p => p.team === team)) {
    for (const move of legalMoves(state, piece.id)) {
      const action = {type: 'move', pieceId: piece.id, x: move.x, y: move.y};
      const after = applyMove(state, piece.id, move.x, move.y);
      const value = positionValue(state, after, action, team);
      if (value > bestValue) { bestValue = value; bestAction = action; }
    }
  }
  return bestAction;
}
