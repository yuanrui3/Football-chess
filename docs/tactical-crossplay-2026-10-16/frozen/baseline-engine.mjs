/** Football Chess, expanded rules. Coordinates: a17=(0,0), n1=(13,16). */
export const TYPES = Object.freeze(['K', 'Q', 'R', 'B', 'N', 'P']);
export const BOARD_WIDTH = 14;
export const BOARD_HEIGHT = 17;
export const GOAL_FILES = Object.freeze([5, 6, 7, 8]);
export const BOX_FILES = Object.freeze([4, 5, 6, 7, 8, 9]);
export const BOX_DEPTH = 3;
export const CENTRAL_GOAL_FILES = Object.freeze([6, 7]);
export const MIDFIELD_RANK = Math.floor(BOARD_HEIGHT / 2);
export const BOARD_CENTER_X = (BOARD_WIDTH - 1) / 2;
export const FILE_LABELS = 'abcdefghijklmn';
export const RULES_VERSION = 16;
export const ALLOW_OUTFIELD_BOXES = true;
export const LONG_TACKLE_RANGE = 5;
export const MOVE_RANGE = 10;
export const BOX_MOVE_COST = 2;
export const DRIBBLE_RANGE = 8;
export const ACTION_SECONDS = 30;
export const STALLING_RULE = Object.freeze({rounds: 3, minProgress: 4});
// Tunable board-game parameters, not fitted football statistics. Distance is in
// board squares and time is in abstract units set by ballSpeed.
export const SHOT_MODEL = Object.freeze({
  version: 13, ballSpeed: 6, blockPerDefender: 0.45, blockCornerShare: 0.85, knightGoalMultiplier: 1, finishingAccuracyMultiplier: 1.15,
  targetBase: 0.98, distanceDecay: 0.018, distancePenaltyStart: 3, longShotDecay: 0.06, rookLongShotDecay: 0.03, minOnTarget: 0.01, maxOnTarget: 0.98,
  angleFloor: 0.65, angleWeight: 0.35, postAngleFloor: 0.10, postAngleWeight: 0.90, postAngleExponent: 1.5,
  wideAngleStartDegrees: 45, wideAngleFullDegrees: 90, wideAngleAccuracyBonus: 0.25,
  centralLaneAccuracyBonus: 0.15,
  boxRadius: 0.4, boxDiveSpeed: 1.3, boxReactionDelay: 0.15, boxMaxSave: 0.94,
  outsideRadius: 0, outsideDiveSpeed: 0, outsideReactionDelay: 0, outsideMaxSave: 0,
  readinessBase: 0.35, readinessTime: 0.45,
  impactSpeedDecay: 0.08, parryMin: 0.05, parrySpeedWeight: 0.60, parryStretchWeight: 0.25, parryMax: 0.90
});

const TEAMS = ['white', 'black'];
const DIAGONALS = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
const STRAIGHTS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const DIRECTIONS = [...STRAIGHTS, ...DIAGONALS];
const KNIGHT = [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]];
const NAMES = {K: 'goalkeeper', Q: 'queen', R: 'rook', B: 'bishop', N: 'knight', P: 'pawn'};
const SQUAD = ['K', 'Q', 'R1', 'R2', 'B1', 'B2', 'N1', 'N2', 'P1', 'P2', 'P3'];
export const FOUL_RULE = Object.freeze({foul: 0.10, red: 0.02, yellow: 0.05, plain: 0.03, clean: 0.90, penaltyGoal: 0.80, penaltyFailure: 0.20, minimumPlayers: 7});
const other = team => team === 'white' ? 'black' : 'white';
const inside = (x, y) => Number.isInteger(x) && Number.isInteger(y) && x >= 0 && x < BOARD_WIDTH && y >= 0 && y < BOARD_HEIGHT;
export const isBox = (x, y) => inside(x, y) && BOX_FILES.includes(x) && (y < BOX_DEPTH || y >= BOARD_HEIGHT - BOX_DEPTH);
export const isGoalMouth = (x, y) => inside(x, y) && GOAL_FILES.includes(x) && (y === 0 || y === BOARD_HEIGHT - 1);
const pieceAt = (state, x, y) => state.pieces.find(p => p.x === x && p.y === y);
const allowedSquare = (piece, x, y) => inside(x, y)
  && (!isGoalMouth(x, y) || piece.type === 'K' && inOwnBox(piece.team, x, y))
  && (!isBox(x, y) || (piece.type === 'K' ? inOwnBox(piece.team, x, y) : ALLOW_OUTFIELD_BOXES || piece.type === 'N'));
export const canOccupySquare = (piece, x, y) => allowedSquare(piece, x, y);
const square = (x, y) => inside(x, y) ? `${FILE_LABELS[x]}${BOARD_HEIGHT - y}` : 'the net';
const title = team => team === 'white' ? 'White' : 'Black';
const copy = state => JSON.parse(JSON.stringify(state));
const addLog = (state, line) => { state.log = [...(state.log || []), line].slice(-80); };
const goalAt = (x, y) => GOAL_FILES.includes(x) ? (y === -1 ? 'white' : y === BOARD_HEIGHT ? 'black' : null) : null;
const shotScoringTeam = (x, y) => goalAt(x, y) || (GOAL_FILES.includes(x) && y === 0 ? 'white' : GOAL_FILES.includes(x) && y === BOARD_HEIGHT - 1 ? 'black' : null);
const distance = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
const freshBudget = () => ({normalUsed: false, pawnUsed: false, dribbleUsed: false});
const positionalTurn = state => state.phase === 'attackMove' || state.phase === 'defendMove';
// An older save spent a shared move on either the carrier or a teammate. When
// that move is already used, do not grant an extra carrier move on reload.
const budgetFor = state => ({normalUsed: !!state.positionBudget?.normalUsed, pawnUsed: !!state.positionBudget?.pawnUsed, dribbleUsed: state.positionBudget?.dribbleUsed === undefined ? !!state.positionBudget?.normalUsed : !!state.positionBudget.dribbleUsed});
const attackingCarrier = (state, piece) => state.phase === 'attackMove' && !state.restart && piece?.id === state.ball.carrierId && piece.team === state.attack;
const clamp = (number, minimum, maximum) => Math.max(minimum, Math.min(maximum, number));
export const inOwnBox = (team, x, y) => inside(x, y) && BOX_FILES.includes(x) && (team === 'black' ? y < BOX_DEPTH : team === 'white' ? y >= BOARD_HEIGHT - BOX_DEPTH : false);

// A loose pass can survive several positioning actions, which overwrite
// lastAction. Keep its kicker separately until somebody controls the ball.
function looseKickOrigin(state) {
  if (state.ball.carrierId) return null;
  const saved = state.looseBallKickOrigin;
  const previous = state.lastAction;
  const legacy = (Number(state.rulesVersion) || 0) < 9 && ['kick', 'miss'].includes(previous?.type)
    && !previous.receiverId && previous.to?.x === state.ball.x && previous.to?.y === state.ball.y
    ? {team: previous.team, pieceId: previous.pieceId, from: previous.from} : null;
  const origin = saved || legacy;
  const kicker = state.pieces.find(piece => piece.id === origin?.pieceId && piece.team === origin?.team);
  return kicker && kicker.team === state.attack ? {team: kicker.team, pieceId: kicker.id,
    ...(origin.from && inside(origin.from.x, origin.from.y) ? {from: {x: origin.from.x, y: origin.from.y}} : {})} : null;
}

function ownPassEntryForbidden(state, piece, target) {
  if (!isBox(target.x, target.y)) return false;
  if (state.ball.carrierId === piece.id) return !isBox(piece.x, piece.y);
  if (state.ball.carrierId || state.ball.x !== target.x || state.ball.y !== target.y) return false;
  const origin = looseKickOrigin(state);
  return origin?.pieceId === piece.id && !isBox(origin.from?.x ?? piece.x, origin.from?.y ?? piece.y);
}

const freshProgress = state => ({team: state.attack, anchorY: state.ball.y, rounds: 0, pendingRelease: false, excludeRelease: false});
export const isOwnHalf = (team, y) => Number.isInteger(y) && y >= 0 && y < BOARD_HEIGHT
  && (team === 'white' ? y > MIDFIELD_RANK : team === 'black' && y < MIDFIELD_RANK);
const netProgress = (team, anchorY, y) => ((team === 'white' ? -1 : 1) * (y - anchorY)) || 0;
function progressFor(state) {
  const tracker = state.ballProgress;
  if (!tracker || tracker.team !== state.attack || !TEAMS.includes(tracker.team)
      || !Number.isInteger(tracker.anchorY) || tracker.anchorY < 0 || tracker.anchorY >= BOARD_HEIGHT
      || !Number.isInteger(tracker.rounds) || tracker.rounds < 0 || tracker.rounds >= STALLING_RULE.rounds) return freshProgress(state);
  return {team: tracker.team, anchorY: tracker.anchorY, rounds: tracker.rounds, pendingRelease: !!tracker.pendingRelease, excludeRelease: !!tracker.excludeRelease,
    ...(tracker.releaseAlreadyCounted ? {releaseAlreadyCounted: true} : {})};
}

// A round ends at the resolved kick, not at its furthest dribble. Thus carrying
// forward and passing back does not manufacture progress. The preview remains
// useful during positioning without committing a new checkpoint too early.
export function progressInfo(state) {
  const saved = progressFor(state);
  const tracker = isOwnHalf(saved.team, saved.anchorY) ? saved : {...saved, anchorY: state.ball.y, rounds: 0};
  const progress = netProgress(tracker.team, tracker.anchorY, state.ball.y);
  const active = isOwnHalf(tracker.team, state.ball.y) && !state.restart && !['kickoff', 'keeperReact', 'finished'].includes(state.phase) && !tracker.excludeRelease;
  const needed = Math.max(0, STALLING_RULE.minProgress - progress);
  return {team: tracker.team, rounds: tracker.rounds, roundsRemaining: STALLING_RULE.rounds - tracker.rounds,
    anchorY: tracker.anchorY, progress, needed, active, warning: active && tracker.rounds >= STALLING_RULE.rounds - 1 && needed > 0};
}

function resetProgress(state) { state.ballProgress = freshProgress(state); }

function completeProgressRound(state, source) {
  if (source.restart || source.phase === 'kickoff') { resetProgress(state); return; }
  const tracker = progressFor(source);
  if (tracker.team !== state.attack || tracker.excludeRelease) { resetProgress(state); return; }
  // Only a completed round whose checkpoint and final ball are both in the
  // possessing team's own half spends its allowance. Crossing midfield and
  // passing back within that same round therefore cannot erase old rounds.
  if (!isOwnHalf(tracker.team, tracker.anchorY) || !isOwnHalf(tracker.team, state.ball.y)) { resetProgress(state); return; }
  const progress = netProgress(tracker.team, tracker.anchorY, state.ball.y);
  if (progress >= STALLING_RULE.minProgress) { resetProgress(state); return; }
  const rounds = tracker.rounds + 1;
  if (rounds < STALLING_RULE.rounds) {
    state.ballProgress = {...tracker, rounds, pendingRelease: false, excludeRelease: false};
    return;
  }
  const offence = {x: state.ball.x, y: state.ball.y}, triggeringAction = copy(state.lastAction);
  const restart = awardRestart(state, 'stalling', other(tracker.team), offence, {reason: 'stalling'});
  state.lastAction = {type: 'stalling', team: tracker.team, offence, progress, rounds,
    triggeringAction, restart: copy(restart), to: {...state.ball}, outcome: 'stalling'};
  addLog(state, `${title(tracker.team)} fails to advance the ball at least ${STALLING_RULE.minProgress} net squares in ${STALLING_RULE.rounds} completed rounds. ${title(restart.team)} has an indirect free kick near ${square(offence.x, offence.y)}. Both teams may reposition.`);
}

function finishKickProgress(state, source, backPass, interception) {
  if (interception) { resetProgress(state); return; }
  const tracker = progressFor(source);
  const excluded = !!source.restart || source.phase === 'kickoff' || tracker.excludeRelease;
  // A loose teammate pass already completed its round before a king picked
  // it up. Its compulsory release may make real progress, but cannot spend
  // a second round merely because that pass was collected in two actions.
  if (source.phase === 'keeperRelease' && tracker.releaseAlreadyCounted) {
    if (excluded || !isOwnHalf(tracker.team, tracker.anchorY) || !isOwnHalf(tracker.team, state.ball.y)
        || netProgress(tracker.team, tracker.anchorY, state.ball.y) >= STALLING_RULE.minProgress) resetProgress(state);
    else {
      const {releaseAlreadyCounted, ...continued} = tracker;
      state.ballProgress = {...continued, pendingRelease: false, excludeRelease: false};
    }
    return;
  }
  if (backPass) {
    state.ballProgress = {...(excluded ? freshProgress(state) : tracker), pendingRelease: true, excludeRelease: excluded};
  } else if (excluded) resetProgress(state);
  else completeProgressRound(state, source);
}

function formation(kickoff) {
  // A box screen, wide rooks, opposite-colour bishops and a forward knight.
  // Rotate the complete shape for the other side; only the kickoff queen moves.
  const white = {
    K: [CENTRAL_GOAL_FILES[0], BOARD_HEIGHT - 2], Q: [CENTRAL_GOAL_FILES[0], BOARD_HEIGHT - 5],
    R1: [1, BOARD_HEIGHT - 4], R2: [BOARD_WIDTH - 2, BOARD_HEIGHT - 4],
    B1: [2, BOARD_HEIGHT - 5], B2: [BOARD_WIDTH - 3, BOARD_HEIGHT - 5],
    N1: [3, MIDFIELD_RANK + 1], N2: [BOARD_WIDTH - 5, MIDFIELD_RANK + 2],
    P1: [CENTRAL_GOAL_FILES[0] - 1, BOARD_HEIGHT - BOX_DEPTH - 1],
    P2: [CENTRAL_GOAL_FILES[1], BOARD_HEIGHT - BOX_DEPTH - 1],
    P3: [BOX_FILES.at(-1), BOARD_HEIGHT - BOX_DEPTH - 1]
  };
  const locations = {white, black: Object.fromEntries(Object.entries(white).map(([id, [x, y]]) => [id, [BOARD_WIDTH - 1 - x, BOARD_HEIGHT - 1 - y]]))};
  locations[kickoff].Q = [CENTRAL_GOAL_FILES[kickoff === 'white' ? 0 : 1], MIDFIELD_RANK];
  return TEAMS.flatMap(team => SQUAD.map(id => ({id: `${team}-${id}`, team, type: id[0], x: locations[team][id][0], y: locations[team][id][1]})));
}

function disciplineFor(state) {
  return Object.fromEntries(TEAMS.flatMap(team => SQUAD.flatMap(suffix => {
    const id = `${team}-${suffix}`, saved = state.discipline?.[id], dismissed = state.sentOff?.find(piece => piece.id === id);
    return saved || dismissed ? [[id, {yellowCards: clamp(Math.floor(Number(saved?.yellowCards ?? dismissed?.yellowCards) || 0), 0, 2), redCard: !!saved?.redCard || !!dismissed}]] : [];
  })));
}

function resetActiveFormation(state, kickoff) {
  const active = new Map(state.pieces.map(piece => [piece.id, piece])), full = formation(kickoff);
  const pieces = full.filter(piece => active.has(piece.id)).map(piece => {
    const previous = active.get(piece.id);
    if (!previous.replacementKeeper) return {...piece};
    const keeperStart = full.find(candidate => candidate.id === `${piece.team}-K`);
    return {...piece, x: keeperStart.x, y: keeperStart.y, type: 'K', originalType: previous.originalType, replacementKeeper: true};
  });
  const candidates = pieces.filter(piece => piece.team === kickoff);
  const kickoffPlayer = candidates.find(piece => piece.id === `${kickoff}-Q` && piece.type !== 'K')
    || candidates.find(piece => piece.type !== 'K') || candidates[0];
  if (kickoffPlayer) Object.assign(kickoffPlayer, {x: CENTRAL_GOAL_FILES[kickoff === 'white' ? 0 : 1], y: MIDFIELD_RANK});
  state.pieces = pieces;
  return kickoffPlayer;
}

function forfeitIfShort(state) {
  const short = TEAMS.find(team => state.pieces.filter(piece => piece.team === team).length < FOUL_RULE.minimumPlayers);
  if (!short) return false;
  state.phase = 'finished'; state.winner = other(short); state.finishReason = 'forfeit'; state.forfeitingTeam = short;
  state.pendingShot = null; state.restart = null; state.releaseReason = null;
  return true;
}

function replaceDismissedKeeper(state, team, origin) {
  if (state.pieces.some(piece => piece.team === team && piece.type === 'K')) return null;
  const candidates = state.pieces.filter(piece => piece.team === team);
  candidates.sort((a, b) => Number(b.type === 'P') - Number(a.type === 'P')
    || Math.hypot(a.x - origin.x, a.y - origin.y) - Math.hypot(b.x - origin.x, b.y - origin.y) || a.id.localeCompare(b.id));
  const replacement = candidates[0];
  if (!replacement) return null;
  const squares = [];
  for (let y = 0; y < BOARD_HEIGHT; y++) for (let x = 0; x < BOARD_WIDTH; x++) {
    const occupant = pieceAt(state, x, y);
    if (inOwnBox(team, x, y) && (!occupant || occupant.id === replacement.id)) squares.push({x, y});
  }
  const orientation = team === 'white' ? 1 : -1;
  squares.sort((a, b) => Math.hypot(a.x - origin.x, a.y - origin.y) - Math.hypot(b.x - origin.x, b.y - origin.y)
    || orientation * (b.y - a.y) || orientation * (a.x - b.x));
  const from = {x: replacement.x, y: replacement.y}, destination = squares[0];
  if (!destination) throw new Error('No vacant own-box square is available for the replacement goalkeeper.');
  const originalType = replacement.originalType || replacement.type;
  Object.assign(replacement, destination, {type: 'K', originalType, replacementKeeper: true});
  if (state.ball.carrierId === replacement.id) Object.assign(state.ball, destination);
  return {pieceId: replacement.id, originalType, from, to: {...destination}};
}

function normalizeSeed(seed) {
  if (Number.isFinite(Number(seed))) return Number(seed) >>> 0;
  let value = 2166136261;
  for (const character of String(seed)) value = Math.imul(value ^ character.charCodeAt(0), 16777619) >>> 0;
  return value;
}

function shotShootingTeam(state, shot = state.pendingShot) {
  const shooter = state.pieces?.find(piece => piece.id === shot?.shooterId);
  return TEAMS.find(team => team === shooter?.team)
    || TEAMS.find(team => SQUAD.some(suffix => shot?.shooterId === `${team}-${suffix}`))
    || TEAMS.find(team => team === shot?.shootingTeam);
}

// Team labels in a saved declaration are redundant. The shooter identity and
// goal endpoint are authoritative; repairing labels never retargets the shot
// or changes its declared origin, offside snapshot, or random seed.
function canonicalizePendingShot(state) {
  const shot = state.pendingShot;
  if (!shot) return;
  const shootingTeam = shotShootingTeam(state, shot), scoringTeam = shotScoringTeam(shot.x, shot.y);
  if (shootingTeam) shot.shootingTeam = shootingTeam;
  if (scoringTeam) { shot.scoringTeam = scoringTeam; shot.defendingTeam = other(scoringTeam); }
}

// Every actual random outcome advances a small, serializable PRNG. Planning and
// legal-action previews never consume it. Test rolls replace only the outcome.
function nextRoll(state, override) {
  if (override !== undefined && (!Number.isFinite(override) || override < 0 || override >= 1)) throw new Error('A test roll must be between 0 (inclusive) and 1 (exclusive).');
  state.randomState = (Math.imul(1664525, normalizeSeed(state.randomState ?? 1)) + 1013904223) >>> 0;
  return override === undefined ? state.randomState / 4294967296 : override;
}

export function createGame({mode = 'solo', minutes = 10, kickoff = 'white', seed = Date.now(), foulsEnabled = false} = {}) {
  kickoff = TEAMS.includes(kickoff) ? kickoff : 'white';
  const pieces = formation(kickoff);
  const carrier = pieces.find(p => p.id === `${kickoff}-Q`);
  return {
    pieces, ball: {x: carrier.x, y: carrier.y, carrierId: carrier.id},
    attack: kickoff, phase: 'kickoff', positionBudget: freshBudget(), pendingShot: null, releaseReason: null,
    score: {white: 0, black: 0}, turn: 1, randomState: normalizeSeed(seed),
    log: [`${title(kickoff)} has kick-off. Kick the ball to begin.`], lastAction: null,
    mode, minutes: Number.isFinite(Number(minutes)) && Number(minutes) > 0 ? Number(minutes) : 10,
    rulesVersion: RULES_VERSION, boardDimensions: {width: BOARD_WIDTH, height: BOARD_HEIGHT}, restart: null, offside: null, looseBallKickOrigin: null, passRun: null,
    foulsEnabled: foulsEnabled === true, discipline: disciplineFor({}), sentOff: [], winner: null, finishReason: null,
    ballProgress: {team: kickoff, anchorY: carrier.y, rounds: 0, pendingRelease: false, excludeRelease: false}
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
  if (piece.type === 'B') return {vectors: DIAGONALS, range: MOVE_RANGE};
  if (piece.type === 'R') return {vectors: STRAIGHTS, range: MOVE_RANGE};
  return {vectors: DIRECTIONS, range: MOVE_RANGE};
}

const enteredSquareCost = (x, y) => isBox(x, y) ? BOX_MOVE_COST : 1;
// Geometry-only cost of a native movement ray or one knight jump. Occupants
// are checked by legalMoves; the starting square is never charged.
export function movementCost(piece, x, y) {
  if (!piece || !inside(piece.x, piece.y) || !inside(x, y)) return Infinity;
  if (piece.x === x && piece.y === y) return 0;
  const shape = movementShape(piece), dx = x - piece.x, dy = y - piece.y;
  for (const [vx, vy] of shape.vectors) {
    const steps = vx ? dx / vx : dy / vy;
    if (!Number.isInteger(steps) || steps < 1 || steps > shape.range || vx * steps !== dx || vy * steps !== dy) continue;
    let cost = 0;
    for (let step = 1; step <= steps; step++) {
      const nextX = piece.x + vx * step, nextY = piece.y + vy * step;
      if (!allowedSquare(piece, nextX, nextY)) return Infinity;
      cost += enteredSquareCost(nextX, nextY);
    }
    return cost;
  }
  return Infinity;
}

function canTackle(state, piece, carrier) {
  if (!carrier || carrier.team === piece.team) return false;
  const dx = carrier.x - piece.x, dy = carrier.y - piece.y;
  const reach = Math.max(Math.abs(dx), Math.abs(dy));
  if (!reach || reach > 10) return false;
  if (piece.type === 'N') return KNIGHT.some(([x, y]) => x === dx && y === dy);
  if (piece.type === 'P') return Math.abs(dx) === 1 && Math.abs(dy) === 1;
  if (piece.type === 'K') return reach === 1;
  if (reach > LONG_TACKLE_RANGE) return false;
  const straight = dx === 0 || dy === 0, diagonal = Math.abs(dx) === Math.abs(dy);
  if (!(piece.type === 'Q' ? straight || diagonal : piece.type === 'R' ? straight : diagonal)) return false;
  const sx = Math.sign(dx), sy = Math.sign(dy);
  for (let step = 1; step < reach; step++) {
    const x = piece.x + sx * step, y = piece.y + sy * step;
    if (!allowedSquare(piece, x, y) || pieceAt(state, x, y)) return false;
  }
  return true;
}

function keeperReactionMoves(state, piece) {
  if (state.pendingShot?.penalty) return [];
  if (!piece || piece.type !== 'K' || piece.team !== currentTeam(state) || !inOwnBox(piece.team, piece.x, piece.y)) return [];
  return DIRECTIONS.map(([dx, dy]) => ({x: piece.x + dx, y: piece.y + dy, type: 'keeperMove'}))
    .filter(move => allowedSquare(piece, move.x, move.y) && !pieceAt(state, move.x, move.y));
}

export function legalMoves(state, pieceId, {freePawn = false} = {}) {
  const piece = state.pieces.find(p => p.id === pieceId);
  if (state.phase === 'keeperReact') return freePawn ? [] : keeperReactionMoves(state, piece);
  const running = state.phase === 'passRun';
  if ((!positionalTurn(state) && !running) || !piece || piece.team !== currentTeam(state) || state.restart?.takerId === piece.id) return [];
  if (running && (freePawn || !state.ball.carrierId || piece.id !== state.passRun?.pieceId || piece.id === state.ball.carrierId)) return [];
  const budget = budgetFor(state);
  if (freePawn && piece.id === state.ball.carrierId) return [];
  if (!running && (freePawn ? budget.pawnUsed || !['P', 'K'].includes(piece.type) : attackingCarrier(state, piece) ? budget.dribbleUsed : budget.normalUsed)) return [];
  const moves = new Map(), shape = movementShape(piece);
  const ownPassIntoBox = !state.ball.carrierId && ownPassEntryForbidden(state, piece, state.ball);
  const range = piece.id === state.ball.carrierId ? Math.min(shape.range, DRIBBLE_RANGE) : shape.range;
  const movementBudget = piece.id === state.ball.carrierId ? DRIBBLE_RANGE : MOVE_RANGE;
  for (const [dx, dy] of shape.vectors) {
    let movementPoints = 0;
    let previousInBox = isBox(piece.x, piece.y);
    for (let step = 1; step <= range; step++) {
      const x = piece.x + dx * step, y = piece.y + dy * step;
      if (!allowedSquare(piece, x, y) || pieceAt(state, x, y)) break;
      const enteringBox = !previousInBox && isBox(x, y);
      if ((piece.id === state.ball.carrierId || running) && enteringBox) break;
      movementPoints += enteredSquareCost(x, y);
      if (movementPoints > movementBudget) break;
      if (!(ownPassIntoBox && x === state.ball.x && y === state.ball.y)) moves.set(`${x},${y}`, {x, y, type: 'move', ...(freePawn ? {freePawn: true} : {})});
      previousInBox = isBox(x, y);
    }
  }
  if (!running && !freePawn && !state.restart) {
    const carrier = state.pieces.find(p => p.id === state.ball.carrierId);
    if (canTackle(state, piece, carrier)) {
      for (const [dx, dy] of DIRECTIONS) {
        const x = carrier.x + dx, y = carrier.y + dy, occupant = pieceAt(state, x, y);
        if (distance(piece, {x, y}) <= 10 && allowedSquare(piece, x, y) && (!occupant || occupant.id === piece.id)) {
          const cleanTackleProbability = carrier.type === 'N' ? 0.5 : 1;
          moves.set(`${x},${y}`, {x, y, type: 'tackle', targetId: carrier.id, tackleProbability: cleanTackleProbability * (state.foulsEnabled ? FOUL_RULE.clean : 1),
            ...(state.foulsEnabled ? {cleanTackleProbability, foulProbability: FOUL_RULE.foul} : {})});
        }
      }
    }
  }
  return [...moves.values()];
}

// The three budgets are independent: an attacker may dribble, move a player
// without the ball, and reposition one pawn or king without the ball, in any
// order. That shared bonus may collect a loose ball, but cannot carry it.
// Protected restarts
// retain only their two positioning actions because their taker cannot move.
export function positionActions(state) {
  const budget = budgetFor(state);
  if (state.phase === 'passRun') return {normalAvailable: legalMoves(state, state.passRun?.pieceId).length > 0, pawnAvailable: false, dribbleAvailable: false, budget};
  if (!positionalTurn(state)) return {normalAvailable: false, pawnAvailable: false, dribbleAvailable: false, budget};
  const carrier = state.pieces.find(piece => piece.id === state.ball.carrierId);
  const dribbleAvailable = !budget.dribbleUsed && attackingCarrier(state, carrier) && legalMoves(state, carrier.id).length > 0;
  return {normalAvailable: !budget.normalUsed, pawnAvailable: !budget.pawnUsed, dribbleAvailable: !!dribbleAvailable, budget};
}

export function passAccuracy(kickDistance) {
  const length = Math.max(0, Number(kickDistance) || 0);
  return Math.max(0.25, Math.round((1 - Math.max(0, length - 10) * 0.1) * 100) / 100);
}

export function throwAccuracy(kickDistance) {
  const length = Math.max(0, Number(kickDistance) || 0);
  return length > 10 ? 0 : Math.max(0.25, Math.round((1 - Math.max(0, length - 5) * 0.15) * 100) / 100);
}

// The grid's middle row is neutral. Offside is decided at the teammate's
// kick, not when a runner later reaches the ball; being level is onside.
export function offsideInfo(state, team = state?.pieces?.find(p => p.id === state?.ball?.carrierId)?.team || state?.attack) {
  const pieces = state?.pieces || [], ball = state?.ball || {x: 0, y: MIDFIELD_RANK};
  const defenders = pieces.filter(p => p.team !== team).map(p => p.y).sort((a, b) => team === 'white' ? a - b : b - a);
  const secondLastY = defenders[1] ?? (team === 'white' ? BOARD_HEIGHT : -1);
  const players = pieces.filter(p => p.team === team).map(p => {
    const inOpposingHalf = team === 'white' ? p.y < MIDFIELD_RANK : p.y > MIDFIELD_RANK;
    const beyondBall = team === 'white' ? p.y < ball.y : p.y > ball.y;
    const beyondDefenders = team === 'white' ? p.y < secondLastY : p.y > secondLastY;
    return {id: p.id, x: p.x, y: p.y, inOpposingHalf, beyondBall, beyondDefenders, offside: inOpposingHalf && beyondBall && beyondDefenders};
  });
  const flaggedIds = players.filter(p => p.offside).map(p => p.id);
  const boxAttackerIds = pieces.filter(p => p.team === team && p.type !== 'K' && (ALLOW_OUTFIELD_BOXES || p.type === 'N') && flaggedIds.includes(p.id) && inOwnBox(other(team), p.x, p.y)).map(p => p.id).sort();
  const boxKnightIds = boxAttackerIds.filter(id => pieces.find(p => p.id === id)?.type === 'N');
  return {team, ball: {x: ball.x, y: ball.y}, secondLastY, players, flaggedIds, boxKnightIds, boxAttackerIds, activeFlaggedIds: state?.offside?.team === team ? [...(state.offside.flaggedIds || [])] : []};
}

const offsideExempt = restart => ['goalKick', 'corner', 'throwIn', 'penalty'].includes(restart?.type);
const loftedRestart = restart => ['goalKick', 'corner', 'offside', 'stalling', 'timeout', 'freeKick'].includes(restart?.type);
function boxKnightOffenders(state, snapshot) {
  if (!snapshot) return [];
  return state.pieces.filter(piece => piece.team === snapshot.team && piece.type !== 'K' && (ALLOW_OUTFIELD_BOXES || piece.type === 'N')
    && piece.id !== snapshot.kickerId && (snapshot.flaggedIds || []).includes(piece.id)
    && inOwnBox(other(piece.team), piece.x, piece.y)).sort((a, b) => a.id.localeCompare(b.id));
}
function currentBoxKnights(state, carrier = state.pieces.find(piece => piece.id === state.ball.carrierId)) {
  if (!carrier || offsideExempt(state.restart)) return [];
  // Most candidate positions have no attacking knight in this tiny area.
  // Avoid sorting the whole defensive line in that common AI search case.
  const candidates = state.pieces.filter(piece => piece.team === carrier.team && piece.type !== 'K' && (ALLOW_OUTFIELD_BOXES || piece.type === 'N')
    && piece.id !== carrier.id && inOwnBox(other(carrier.team), piece.x, piece.y));
  if (!candidates.length) return [];
  const flags = offsideInfo(state, carrier.team).flaggedIds;
  return candidates.filter(piece => flags.includes(piece.id)).sort((a, b) => a.id.localeCompare(b.id));
}

function offsideSnapshot(state, kicker, restart) {
  if (offsideExempt(restart)) return null;
  const info = offsideInfo(state, kicker.team);
  return {team: kicker.team, kickerId: kicker.id, ball: info.ball, secondLastY: info.secondLastY, flaggedIds: info.flaggedIds.filter(id => id !== kicker.id)};
}
const flagged = (state, piece) => !!piece && state.offside?.team === piece.team && (state.offside.flaggedIds || []).includes(piece.id);

// Coordinates describe square centres; the ball is out only after the whole
// centre trajectory crosses the outer half-square. The first line wins.
export function boundaryExit(from, landing) {
  if (!from || !landing || ![from.x, from.y, landing.x, landing.y].every(Number.isFinite)) return null;
  const dx = landing.x - from.x, dy = landing.y - from.y, crossings = [];
  const add = (t, line) => { if (t >= 0 && t <= 1) crossings.push({t, line, x: from.x + dx * t, y: from.y + dy * t}); };
  if (landing.x < -0.5 && dx < 0) add((-0.5 - from.x) / dx, 'left');
  if (landing.x > BOARD_WIDTH - 0.5 && dx > 0) add((BOARD_WIDTH - 0.5 - from.x) / dx, 'right');
  if (landing.y < -0.5 && dy < 0) add((-0.5 - from.y) / dy, 'top');
  if (landing.y > BOARD_HEIGHT - 0.5 && dy > 0) add((BOARD_HEIGHT - 0.5 - from.y) / dy, 'bottom');
  crossings.sort((a, b) => a.t - b.t);
  if (!crossings.length) return null;
  const {t, ...exit} = crossings[0]; return exit;
}

const attackingHalf = (team, y) => team === 'white' ? y < MIDFIELD_RANK : y > MIDFIELD_RANK;
const eligibleCornerTakers = (state, team) => state.pieces.filter(piece => piece.team === team && attackingHalf(team, piece.y));

export function cornerTakers(state) {
  return state?.phase === 'cornerSelect' && state.restart?.type === 'corner'
    ? eligibleCornerTakers(state, state.restart.team).map(piece => ({...piece})) : [];
}

export function selectCornerTaker(state, pieceId) {
  if (!cornerTakers(state).some(piece => piece.id === pieceId)) throw new Error('Choose a corner taker from your attacking half.');
  const next = copy(state), chosen = next.pieces.find(piece => piece.id === pieceId);
  const from = {x: chosen.x, y: chosen.y}, pending = next.restart;
  const restart = awardRestart(next, 'corner', pending.team, pending.spot, {exit: pending.exit, reason: pending.reason, selectedTakerId: pieceId});
  next.lastAction = {type: 'cornerTaker', team: pending.team, pieceId, from, to: {x: chosen.x, y: chosen.y}, restart: copy(restart)};
  addLog(next, `${title(pending.team)} chooses ${NAMES[chosen.type]} ${pieceId.split('-')[1]} for the corner. Both teams may reposition before the kick.`);
  return next;
}

function awardRestart(state, type, team, requestedSpot, {exit, reason, selectedTakerId} = {}) {
  const origin = {x: clamp(Math.round(requestedSpot.x), 0, BOARD_WIDTH - 1), y: clamp(Math.round(requestedSpot.y), 0, BOARD_HEIGHT - 1)};
  const eligible = type === 'corner' ? eligibleCornerTakers(state, team) : [];
  if (type === 'corner' && !selectedTakerId && eligible.length) {
    state.ball = {...origin, carrierId: null}; state.attack = team;
    state.looseBallKickOrigin = null;
    beginPosition(state); state.phase = 'cornerSelect'; state.offside = null;
    state.restart = {type, team, takerId: null, spot: {...origin}, indirect: false, ...(exit ? {exit} : {}), ...(reason ? {reason} : {})};
    resetProgress(state);
    return state.restart;
  }
  const candidates = state.pieces.filter(p => p.team === team && (type !== 'goalKick' || p.type === 'K') && (!selectedTakerId || p.id === selectedTakerId));
  candidates.sort((a, b) => Math.hypot(a.x - origin.x, a.y - origin.y) - Math.hypot(b.x - origin.x, b.y - origin.y) || a.id.localeCompare(b.id));
  let taker, spot;
  for (const candidate of candidates) {
    const squares = [];
    for (let y = 0; y < BOARD_HEIGHT; y++) for (let x = 0; x < BOARD_WIDTH; x++) {
      const occupant = pieceAt(state, x, y);
      if (!allowedSquare(candidate, x, y) || (occupant && occupant.id !== candidate.id) || (type === 'goalKick' && !inOwnBox(team, x, y))) continue;
      squares.push({x, y});
    }
    squares.sort((a, b) => Math.hypot(a.x - origin.x, a.y - origin.y) - Math.hypot(b.x - origin.x, b.y - origin.y) || a.y - b.y || a.x - b.x);
    if (squares.length) { taker = candidate; spot = squares[0]; break; }
  }
  // A legal full squad always has a goalkeeper and room in its box. In an
  // incomplete imported scenario, never appoint a knight or outfield player
  // to take a goal kick in the missing goalkeeper's place.
  if (taker) { taker.x = spot.x; taker.y = spot.y; }
  else spot = origin;
  state.ball = {...spot, carrierId: taker?.id || null}; state.attack = team;
  state.looseBallKickOrigin = null;
  beginPosition(state); state.offside = null;
  state.restart = {type, team, takerId: taker?.id || null, spot: {...spot}, indirect: ['offside', 'stalling', 'timeout'].includes(type), ...(type === 'corner' && !eligible.length ? {cornerFallback: true} : {}), ...(exit ? {exit} : {}), ...(reason ? {reason} : {})};
  resetProgress(state);
  return state.restart;
}

// Restore both the live match and individual undo snapshots through this pure
// migration. Goal kicks belong to the king and give both teams a protected
// positioning turn. Keep any positioning already spent in older snapshots.
function repairForbiddenBoxPieces(state) {
  for (const piece of state.pieces.filter(candidate => isBox(candidate.x, candidate.y) && !allowedSquare(candidate, candidate.x, candidate.y)).sort((a, b) => a.id.localeCompare(b.id))) {
    const origin = {x: piece.x, y: piece.y}, squares = [];
    for (let y = 0; y < BOARD_HEIGHT; y++) for (let x = 0; x < BOARD_WIDTH; x++) {
      if (!isBox(x, y) && !pieceAt(state, x, y)) squares.push({x, y});
    }
    // Equal-distance repairs favor the team's own end, then its left flank.
    // These tie breaks rotate with the team, preserving 180-degree symmetry.
    const orientation = piece.team === 'white' ? 1 : -1;
    squares.sort((a, b) => Math.hypot(a.x - origin.x, a.y - origin.y) - Math.hypot(b.x - origin.x, b.y - origin.y)
      || orientation * (b.y - a.y) || orientation * (a.x - b.x));
    const destination = squares[0];
    if (!destination) continue;
    Object.assign(piece, destination);
    if (state.ball?.carrierId === piece.id) Object.assign(state.ball, destination);
    if (state.restart?.takerId === piece.id) state.restart.spot = {...destination};
  }
}

export function normalizeGame(state) {
  if (!state || typeof state !== 'object') return state;
  if (state.boardDimensions && (state.boardDimensions.width !== BOARD_WIDTH || state.boardDimensions.height !== BOARD_HEIGHT)
      || !state.boardDimensions && (Number(state.rulesVersion) || 0) < 14) {
    throw new RangeError(`This saved match uses a different pitch size. Start a new ${BOARD_WIDTH} × ${BOARD_HEIGHT} match.`);
  }
  const next = copy(state);
  next.foulsEnabled = next.foulsEnabled === true;
  next.sentOff = Array.isArray(next.sentOff) ? next.sentOff : [];
  next.discipline = disciplineFor(next);
  next.pieces = next.pieces.filter(piece => !next.discipline[piece.id]?.redCard);
  canonicalizePendingShot(next);
  next.winner ??= null; next.finishReason ??= null;
  if (next.foulsEnabled && !forfeitIfShort(next)) {
    for (const team of TEAMS) {
      if (next.sentOff.some(piece => piece.team === team && piece.type === 'K') && !next.pieces.some(piece => piece.team === team && piece.type === 'K')) {
        const original = next.sentOff.find(piece => piece.team === team && piece.type === 'K');
        replaceDismissedKeeper(next, team, original);
      }
    }
  }
  next.boardDimensions = {width: BOARD_WIDTH, height: BOARD_HEIGHT};
  next.positionBudget = budgetFor(state);
  // Older rules allowed a carrying pawn to spend its bonus separately from
  // its dribble. Spend the dribble only when the latest action proves that
  // carry happened in this round; pawnUsed alone may mean an off-ball move.
  const previousAction = next.lastAction;
  if ((Number(state.rulesVersion) || 0) < 7 && next.phase === 'attackMove'
      && previousAction?.type === 'move' && previousAction.freePawn
      && previousAction.pieceId === next.ball.carrierId && !previousAction.collection) {
    next.positionBudget.dribbleUsed = true;
  }
  next.restart ??= null;
  next.offside ??= null;
  if (next.phase === 'cornerSelect') {
    if (next.restart?.type === 'corner' && TEAMS.includes(next.restart.team)) {
      next.attack = next.restart.team;
      next.restart.takerId = null;
      next.ball = {x: next.restart.spot.x, y: next.restart.spot.y, carrierId: null};
      next.passRun = null;
      if (!eligibleCornerTakers(next, next.attack).length) {
        const pending = next.restart;
        awardRestart(next, 'corner', pending.team, pending.spot, {exit: pending.exit, reason: pending.reason});
      }
    } else beginPosition(next);
  }
  if (next.phase === 'passRun') {
    const runner = next.pieces.find(piece => piece.id === next.passRun?.pieceId);
    const receiver = next.pieces.find(piece => piece.id === next.ball.carrierId);
    if (!runner || runner.team !== next.attack || next.passRun.team !== next.attack
        || !receiver || receiver.team !== next.attack || receiver.type === 'K' || receiver.id === runner.id || next.restart) beginPosition(next);
  } else next.passRun = null;
  // Repair forbidden box occupants in malformed current-geometry snapshots,
  // including the earlier accidental king access to the opposing box.
  // Repair saved games and undo snapshots without displacing players, taking
  // an action, consuming randomness, or changing a declared shot's origin.
  repairForbiddenBoxPieces(next);
  if (!next.restart && next.phase === 'keeperRelease' && next.releaseReason === 'goalKick') {
    const carrier = next.pieces.find(piece => piece.id === next.ball.carrierId);
    const team = carrier?.team || next.attack;
    awardRestart(next, 'goalKick', team, next.ball);
  }
  if (next.restart?.type === 'goalKick' && ['attackMove', 'defendMove', 'kick', 'keeperRelease'].includes(next.phase)) {
    const restart = next.restart;
    const team = restart.team || next.attack;
    const taker = next.pieces.find(piece => piece.id === restart.takerId);
    const validTaker = taker?.type === 'K' && taker.team === team && next.ball.carrierId === taker.id && next.ball.x === taker.x && next.ball.y === taker.y && inOwnBox(taker.team, taker.x, taker.y);
    const phase = next.phase, budget = next.positionBudget;
    if (!validTaker) {
      awardRestart(next, 'goalKick', team, restart.spot || next.ball, {exit: restart.exit, reason: restart.reason});
      if (phase !== 'keeperRelease') { next.phase = phase; next.positionBudget = budget; }
    } else if (phase === 'keeperRelease') {
      beginPosition(next);
    }
    next.releaseReason = null;
  }
  const savedProgress = progressFor(next);
  // Field-wide progress counters from older saves cannot distinguish a
  // completed attacking-half round from a temporary dribble across halfway.
  // Give that old ruleset one fresh checkpoint; current saves/Undo keep theirs.
  // An in-flight forced release still retains its restart/kickoff exclusion.
  next.ballProgress = (Number(state.rulesVersion) || 0) < 13
    ? {...freshProgress(next), pendingRelease: savedProgress.pendingRelease, excludeRelease: savedProgress.excludeRelease}
    : savedProgress;
  next.looseBallKickOrigin = looseKickOrigin(next);
  // Old pending shots already have their kick-time snapshot. Knights cannot
  // move during keeper reaction, so their saved box squares are still exact.
  // Never reconstruct missing flags from a later defensive line or spend RNG.
  if ((Number(state.rulesVersion) || 0) < 10 && next.phase === 'keeperReact' && next.pendingShot
      && next.offside?.team === next.pendingShot.shootingTeam) {
    const shot = next.pendingShot;
    const offender = boxKnightOffenders(next, {...next.offside, kickerId: shot.shooterId})[0];
    if (offender) callOffside(next, offender, {pieceId: shot.shooterId, from: shot.from, intendedTo: {x: shot.x, y: shot.y}, path: shot.path, distance: shot.distance, offsideReason: 'boxKnight', offsidePieceId: offender.id});
  }
  // A shot already declared under older rules keeps its origin and random
  // seed, but its displayed and eventual odds use the current shared model.
  if (next.phase === 'keeperReact' && next.pendingShot && next.lastAction?.type === 'shotAttempt') {
    const details = shotModel(next);
    next.lastAction = {...next.lastAction, team: next.pendingShot.shootingTeam, probability: details.probability, shotModel: details};
  }
  next.rulesVersion = RULES_VERSION;
  return next;
}

const restartTurnMessage = restart => restart.type === 'goalKick' ? 'Both teams may reposition before the goalkeeper passes the ball into the pitch.' : 'Both teams may reposition before the restart.';

function restartForExit(state, from, landing, lastTouchTeam) {
  const exit = boundaryExit(from, landing);
  if (!exit) return null;
  if (exit.line === 'left' || exit.line === 'right') return awardRestart(state, 'throwIn', other(lastTouchTeam), {x: exit.line === 'left' ? 0 : BOARD_WIDTH - 1, y: exit.y}, {exit});
  const defendingTeam = exit.line === 'top' ? 'black' : 'white';
  const type = lastTouchTeam === defendingTeam ? 'corner' : 'goalKick';
  const team = type === 'corner' ? other(defendingTeam) : defendingTeam;
  const spot = type === 'corner' ? {x: exit.x < (BOARD_WIDTH - 1) / 2 ? 0 : BOARD_WIDTH - 1, y: exit.line === 'top' ? 0 : BOARD_HEIGHT - 1}
    : {x: clamp(Math.round(exit.x), BOX_FILES[0], BOX_FILES.at(-1)), y: exit.line === 'top' ? 0 : BOARD_HEIGHT - 1};
  return awardRestart(state, type, team, spot, {exit});
}

function callOffside(state, offender, common = {}) {
  const offence = {x: offender.x, y: offender.y};
  const restart = awardRestart(state, 'offside', other(offender.team), offence, {reason: 'offside'});
  state.turn++;
  state.lastAction = {...common, type: 'offside', team: offender.team, offenderId: offender.id, offence, restart: copy(restart), to: {...state.ball}, outcome: 'offside'};
  const involvement = common.offsideReason === 'boxKnight' ? 'is involved in play inside the opponent’s box and is offside' : 'is offside on involvement';
  addLog(state, `${title(offender.team)} ${NAMES[offender.type]} ${involvement} at ${square(offence.x, offence.y)}. ${title(other(offender.team))} has an indirect free kick.`);
  return state;
}

// Intersect the physical ball segment with occupied square interiors. A ray
// touching only a square's corner does not travel through that square.
function shotBodies(pieces, origin, target, shooterId, keeperId, keeperPosition) {
  const dx = target.x - origin.x, dy = target.y - origin.y;
  return pieces.flatMap(original => {
    if (original.id === shooterId) return [];
    const piece = original.id === keeperId && keeperPosition ? {...original, ...keeperPosition} : original;
    let entry = 0, exit = 1;
    for (const [start, delta, center] of [[origin.x, dx, piece.x], [origin.y, dy, piece.y]]) {
      if (!delta) { if (start <= center - 0.5 || start >= center + 0.5) return []; }
      else {
        const a = (center - 0.5 - start) / delta, b = (center + 0.5 - start) / delta;
        entry = Math.max(entry, Math.min(a, b)); exit = Math.min(exit, Math.max(a, b));
      }
    }
    return exit - entry > 1e-10 && exit > 0 && entry < 1 ? [{...piece, entry}] : [];
  }).sort((a, b) => a.entry - b.entry || a.id.localeCompare(b.id));
}

function friendlyStopsShot(state, carrier, x, y) {
  if (carrier.type === 'N') return false;
  const target = {x, y: y < 0 ? -0.5 : BOARD_HEIGHT - 0.5};
  return shotBodies(state.pieces, carrier, target, carrier.id).some(piece => piece.team === carrier.team);
}

export function shotModel(state, x = state?.pendingShot?.x, y = state?.pendingShot?.y, keeperPosition) {
  const scoringTeam = shotScoringTeam(x, y);
  const pieces = Array.isArray(state?.pieces) ? state.pieces : [];
  const carrier = pieces.find(p => p.id === state?.ball?.carrierId);
  const declaredShooter = pieces.find(p => p.id === state?.pendingShot?.shooterId);
  const shooterType = [state?.pendingShot?.shooterType, declaredShooter?.type, carrier?.type].find(type => TYPES.includes(type)) || null;
  const shooterId = state?.pendingShot?.shooterId || carrier?.id;
  const shootingTeam = shotShootingTeam(state || {}) || carrier?.team || state?.attack;
  const penalty = !!(state?.pendingShot?.penalty || state?.restart?.type === 'penalty');
  // A reaction moves only the keeper; the declared shot's origin stays fixed.
  const source = state?.pendingShot?.from || carrier || state?.ball;
  const validOrigin = source && inside(source.x, source.y);
  const origin = validOrigin ? {x: source.x, y: source.y} : {x: 0, y: 0};
  const target = scoringTeam ? {x, y: scoringTeam === 'white' ? -0.5 : BOARD_HEIGHT - 0.5} : {x: 0, y: 0};
  const invalid = {
    probability: 0, goalProbability: 0, baseGoalProbability: 0, scoringMultiplier: 1, saveProbability: 0, missProbability: 1, penalty,
    onTargetProbability: 0, baseOnTargetProbability: 0, saveGivenOnTarget: 0, cornerProbability: 0, keeperCornerProbability: 0, caughtSaveProbability: 0, blockerIds: [], blockerPositions: [], blockProbability: 0, blockOutProbability: 0, blockCornerProbability: 0, blockPossessionProbability: 0, arrivalSpeed: 0, keeperStretch: 0, parryGivenSave: 0, distance: 0, shotAngleDegrees: 0,
    goalDepth: 0, goalOpeningDegrees: 0, centralGoalOpeningDegrees: 0, goalOpeningRatio: 0, postAngleFactor: 0, wideAngleFactor: 1, centralLaneFactor: 1, finishingAccuracyMultiplier: SHOT_MODEL.finishingAccuracyMultiplier, shooterType, distancePenaltyRate: 0,
    keeperPathDistance: 0, timeToKeeper: 0, reach: 0, keeperInBox: false,
    closestPoint: {...origin}, keeperPosition: null, origin, target, modelVersion: SHOT_MODEL.version
  };
  if (!scoringTeam || !validOrigin) return invalid;
  const defendingTeam = other(scoringTeam);
  const defendingKeeper = pieces.find(p => p.team === defendingTeam && p.type === 'K');
  const candidate = keeperPosition || defendingKeeper;
  const keeper = candidate && inside(candidate.x, candidate.y) ? {x: candidate.x, y: candidate.y} : null;
  const dx = target.x - origin.x, dy = target.y - origin.y;
  const length = Math.hypot(dx, dy);
  if (!Number.isFinite(length) || length <= 0) return invalid;
  const ux = dx / length, uy = dy / length;
  const angleCos = clamp(Math.abs(dy) / length, 0, 1);
  // Compare the visible goal opening with a central shooter at the same
  // perpendicular depth. This penalizes tight post-side angles without
  // imposing another range penalty on central midfield attempts.
  const goalDepth = Math.abs(dy), leftPost = GOAL_FILES[0] - 0.5, rightPost = GOAL_FILES.at(-1) + 0.5;
  const goalOpening = Math.atan2((rightPost - leftPost) * goalDepth, goalDepth ** 2 + (leftPost - origin.x) * (rightPost - origin.x));
  const centralGoalOpening = 2 * Math.atan2((rightPost - leftPost) / 2, goalDepth);
  const goalOpeningRatio = clamp(centralGoalOpening > 0 ? goalOpening / centralGoalOpening : 0, 0, 1);
  const postAngleFactor = SHOT_MODEL.postAngleFloor + SHOT_MODEL.postAngleWeight * goalOpeningRatio ** SHOT_MODEL.postAngleExponent;
  // A larger view between the posts improves finishing. The smooth bonus uses
  // the absolute opening, so central midfield shots do not gain a flat boost.
  const openingDegrees = goalOpening * 180 / Math.PI;
  const openingGain = clamp((openingDegrees - SHOT_MODEL.wideAngleStartDegrees) / (SHOT_MODEL.wideAngleFullDegrees - SHOT_MODEL.wideAngleStartDegrees), 0, 1);
  const wideAngleFactor = 1 + SHOT_MODEL.wideAngleAccuracyBonus * openingGain ** 2 * (3 - 2 * openingGain);
  // Reward the shooter's central approach, rather than aiming into the middle
  // of the goal where a well-positioned keeper may still stop the attempt.
  const centralLaneFactor = CENTRAL_GOAL_FILES.includes(origin.x) ? 1 + SHOT_MODEL.centralLaneAccuracyBonus : 1;
  const distancePenaltyRate = shooterType === 'R' ? SHOT_MODEL.rookLongShotDecay : SHOT_MODEL.longShotDecay;
  // Rooks lose less accuracy beyond three squares; their close-shot curve is
  // shared with every other piece. There is no flat scoring multiplier.
  const excessDistance = Math.max(0, length - SHOT_MODEL.distancePenaltyStart);
  const onTarget = clamp(SHOT_MODEL.targetBase * SHOT_MODEL.finishingAccuracyMultiplier * Math.exp(-SHOT_MODEL.distanceDecay * length - distancePenaltyRate * excessDistance ** 2) * (SHOT_MODEL.angleFloor + SHOT_MODEL.angleWeight * angleCos) * postAngleFactor * wideAngleFactor * centralLaneFactor, SHOT_MODEL.minOnTarget, SHOT_MODEL.maxOnTarget);
  const rawProjection = keeper ? (keeper.x - origin.x) * ux + (keeper.y - origin.y) * uy : 0;
  const projection = clamp(rawProjection, 0, length);
  const closestPoint = {x: origin.x + projection * ux, y: origin.y + projection * uy};
  const clearance = keeper ? Math.hypot(keeper.x - closestPoint.x, keeper.y - closestPoint.y) : 0;
  const timeToKeeper = projection / SHOT_MODEL.ballSpeed;
  const keeperInBox = !!keeper && inOwnBox(defendingTeam, keeper.x, keeper.y);
  // Outside its own box, the king is an ordinary potential shot blocker; it
  // has no goalkeeper reach, reaction or parry.
  const radius = keeperInBox ? SHOT_MODEL.boxRadius : 0;
  const diveSpeed = keeperInBox ? SHOT_MODEL.boxDiveSpeed : 0;
  const delay = keeperInBox ? SHOT_MODEL.boxReactionDelay : 0;
  const maxSave = keeperInBox ? SHOT_MODEL.boxMaxSave : 0;
  const reach = keeperInBox ? radius + diveSpeed * Math.max(0, timeToKeeper - delay) : 0;
  const readiness = maxSave * (1 - Math.exp(-(SHOT_MODEL.readinessBase + timeToKeeper) / SHOT_MODEL.readinessTime));
  const saveGivenOnTarget = keeperInBox && reach > 0 && rawProjection >= 0 ? clamp(readiness * Math.exp(-((clearance / reach) ** 2)), 0, 1) : 0;
  const blockers = shooterType === 'N' ? [] : shotBodies(pieces, origin, target, shooterId, defendingKeeper?.id, keeper)
    .filter(piece => piece.team !== shootingTeam && !(piece.type === 'K' && inOwnBox(piece.team, piece.x, piece.y)));
  const rawBlockProbability = 1 - (1 - SHOT_MODEL.blockPerDefender) ** blockers.length;
  const unblocked = 1 - rawBlockProbability;
  const baseGoalProbability = unblocked * onTarget * (1 - saveGivenOnTarget);
  const scoringMultiplier = shooterType === 'N' ? SHOT_MODEL.knightGoalMultiplier : 1;
  const goalProbability = Math.min(1, baseGoalProbability * scoringMultiplier);
  const failureScale = baseGoalProbability < 1 ? (1 - goalProbability) / (1 - baseGoalProbability) : 0;
  const saveProbability = unblocked * onTarget * saveGivenOnTarget * failureScale;
  const missProbability = unblocked * (1 - onTarget) * failureScale;
  const blockProbability = rawBlockProbability * failureScale;
  // All shots currently share launch power. Travel to the keeper reduces the
  // arrival pace; a fast arrival or a stretched block is harder to hold.
  // This splits already-stopped shots without changing goal or wide odds.
  const arrivalSpeed = keeper ? SHOT_MODEL.ballSpeed * Math.exp(-SHOT_MODEL.impactSpeedDecay * projection) : 0;
  const keeperStretch = keeper && reach > 0 ? clamp(clearance / reach, 0, 1) : 0;
  const parryGivenSave = saveProbability > 0 ? clamp(SHOT_MODEL.parryMin + SHOT_MODEL.parrySpeedWeight * (arrivalSpeed / SHOT_MODEL.ballSpeed) ** 2 + SHOT_MODEL.parryStretchWeight * keeperStretch, SHOT_MODEL.parryMin, SHOT_MODEL.parryMax) : 0;
  const keeperCornerProbability = saveProbability * parryGivenSave;
  const blockOutProbability = blockProbability * SHOT_MODEL.blockCornerShare;
  const blockCornerProbability = shootingTeam === scoringTeam ? blockOutProbability : 0;
  const blockPossessionProbability = blockProbability - blockOutProbability;
  const cornerProbability = keeperCornerProbability + blockCornerProbability;
  const result = {
    probability: goalProbability, goalProbability, baseGoalProbability, scoringMultiplier, saveProbability,
    missProbability, baseOnTargetProbability: onTarget, cornerProbability, keeperCornerProbability, caughtSaveProbability: saveProbability - keeperCornerProbability,
    blockerIds: blockers.map(piece => piece.id), blockerPositions: blockers.map(({id, x, y}) => ({id, x, y})), blockProbability, blockOutProbability, blockCornerProbability, blockPossessionProbability,
    arrivalSpeed, keeperStretch, parryGivenSave, onTargetProbability: goalProbability + saveProbability, saveGivenOnTarget: goalProbability + saveProbability > 0 ? saveProbability / (goalProbability + saveProbability) : 0,
    distance: length, shotAngleDegrees: Math.acos(angleCos) * 180 / Math.PI,
    goalDepth, goalOpeningDegrees: openingDegrees, centralGoalOpeningDegrees: centralGoalOpening * 180 / Math.PI, goalOpeningRatio, postAngleFactor, wideAngleFactor, centralLaneFactor, finishingAccuracyMultiplier: SHOT_MODEL.finishingAccuracyMultiplier, shooterType, distancePenaltyRate,
    keeperPathDistance: clearance, timeToKeeper, reach, keeperInBox,
    closestPoint, keeperPosition: keeper, origin, target, modelVersion: SHOT_MODEL.version, penalty
  };
  if (!penalty) return result;
  const penaltySave = keeperInBox ? FOUL_RULE.penaltyFailure : 0;
  return {...result, probability: FOUL_RULE.penaltyGoal, goalProbability: FOUL_RULE.penaltyGoal, baseGoalProbability: FOUL_RULE.penaltyGoal, scoringMultiplier: 1,
    saveProbability: penaltySave, caughtSaveProbability: penaltySave, missProbability: keeperInBox ? 0 : FOUL_RULE.penaltyFailure,
    baseOnTargetProbability: FOUL_RULE.penaltyGoal + penaltySave, onTargetProbability: FOUL_RULE.penaltyGoal + penaltySave, saveGivenOnTarget: penaltySave / (FOUL_RULE.penaltyGoal + penaltySave),
    cornerProbability: 0, keeperCornerProbability: 0, parryGivenSave: 0, blockerIds: [], blockerPositions: [], blockProbability: 0, blockOutProbability: 0, blockCornerProbability: 0, blockPossessionProbability: 0};
}

export function shotChance(state, x = state?.pendingShot?.x, y = state?.pendingShot?.y, keeperPosition) {
  return shotModel(state, x, y, keeperPosition).probability;
}

function kickRecord(state, carrier, x, y, path, receiver, goal, boxWarning) {
  const length = distance(carrier, {x, y});
  const details = goal ? shotModel(state, x, y) : null;
  return {
    x, y, path, distance: length, accuracy: goal ? 1 : state.restart?.type === 'throwIn' ? throwAccuracy(length) : passAccuracy(length),
    ...(state.restart ? {restartType: state.restart.type} : {}),
    ...(receiver?.team === carrier.team ? {offside: !['goalKick', 'corner', 'throwIn'].includes(state.restart?.type) && offsideInfo(state, carrier.team).flaggedIds.includes(receiver.id)} : {}),
    ...boxWarning,
    ...(receiver ? {receiverId: receiver.id} : {}), ...(goal ? {goal, probability: details.probability, shotModel: details} : {}),
    label: goal ? 'Shoot at goal' : receiver ? `Pass to ${NAMES[receiver.type]}` : `Kick to ${square(x, y)}`
  };
}

function rawKicks(state) {
  const carrier = state.pieces.find(p => p.id === state.ball.carrierId);
  if (!carrier) return [];
  if (state.restart?.type === 'penalty') {
    const y = carrier.team === 'white' ? -1 : BOARD_HEIGHT;
    return GOAL_FILES.map(x => kickRecord(state, carrier, x, y, [{x: carrier.x, y: carrier.y}, {x, y}], null, carrier.team, {}));
  }
  const kicks = [], boxOffender = currentBoxKnights(state, carrier)[0];
  const boxWarning = boxOffender ? {offside: true, offsideReason: 'boxKnight', offsidePieceId: boxOffender.id} : {};
  if (carrier.type === 'N' && state.restart?.type !== 'throwIn') {
    for (const [dx, dy] of KNIGHT) {
      const x = carrier.x + dx, y = carrier.y + dy, goal = goalAt(x, y);
      if (!inside(x, y) && !goal || (goal && (['throwIn', 'goalKick'].includes(state.restart?.type) || state.restart?.indirect))) continue;
      kicks.push(kickRecord(state, carrier, x, y, [{x: carrier.x, y: carrier.y}, {x, y}], pieceAt(state, x, y), goal, boxWarning));
    }
    return kicks;
  }
  const vectors = state.restart?.type === 'throwIn' ? DIRECTIONS : carrier.type === 'P' ? STRAIGHTS : carrier.type === 'B' ? DIAGONALS : carrier.type === 'R' ? STRAIGHTS : DIRECTIONS;
  for (const [dx, dy] of vectors) {
    const path = [{x: carrier.x, y: carrier.y}];
    // The first occupied target remains an ordinary ground pass. Eligible
    // set pieces may instead loft over that one player; the second occupied
    // square can receive/intercept, and always ends this passing ray.
    let bypassed = null;
    for (let step = 1; step <= (state.restart?.type === 'throwIn' ? 10 : BOARD_HEIGHT + 1); step++) {
      const x = carrier.x + dx * step, y = carrier.y + dy * step;
      if (!inside(x, y)) break;
      path.push({x, y});
      const receiver = pieceAt(state, x, y);
      kicks.push({...kickRecord(state, carrier, x, y, [...path], receiver, undefined, boxWarning),
        ...(bypassed ? {lofted: true, bypassedPieceId: bypassed.id, bypassedSquare: {x: bypassed.x, y: bypassed.y}} : {})});
      if (receiver) {
        if (!loftedRestart(state.restart) || bypassed) break;
        bypassed = receiver;
      }
    }
    if (!dy || ['throwIn', 'goalKick'].includes(state.restart?.type) || state.restart?.indirect) continue;
    // Opposing bodies are probabilistic blockers. Teammates still stop shots.
    const shotPath = [{x: carrier.x, y: carrier.y}];
    for (let step = 1; step <= BOARD_HEIGHT + 1; step++) {
      const x = carrier.x + dx * step, y = carrier.y + dy * step;
      shotPath.push({x, y});
      if (!inside(x, y)) {
        const goal = goalAt(x, y);
        if (goal && !friendlyStopsShot(state, carrier, x, y)) kicks.push(kickRecord(state, carrier, x, y, [...shotPath], null, goal, boxWarning));
        break;
      }
      const obstacle = pieceAt(state, x, y);
      if (obstacle?.team === carrier.team) break;
    }
  }
  return kicks;
}

export function legalKicks(state) {
  return ['kick', 'kickoff', 'keeperRelease'].includes(state.phase) ? rawKicks(state) : [];
}

function beginPosition(state, phase = 'attackMove') {
  state.phase = phase;
  state.passRun = null;
  state.positionBudget = freshBudget();
  state.pendingShot = null;
  state.releaseReason = null;
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
    return !state.restart;
  }
  return false;
}

function resolveShot(next, {roll, keeperMove, landing} = {}) {
  canonicalizePendingShot(next);
  const shot = next.pendingShot;
  if (!shot || next.phase !== 'keeperReact') throw new Error('There is no shot awaiting a goalkeeper reaction.');
  next.looseBallKickOrigin = null;
  const keeper = next.pieces.find(p => p.type === 'K' && p.team === shot.defendingTeam);
  const details = shotModel(next, shot.x, shot.y), probability = details.probability;
  const outcomeRoll = nextRoll(next, roll);
  const keeperCornerEnd = probability + details.keeperCornerProbability;
  const caughtEnd = probability + details.saveProbability;
  const wideEnd = 1 - details.blockProbability;
  const blockOutEnd = 1 - details.blockPossessionProbability;
  const outcome = outcomeRoll < probability ? 'goal' : outcomeRoll < keeperCornerEnd ? 'keeperCorner'
    : outcomeRoll < caughtEnd ? 'saved' : outcomeRoll < wideEnd ? 'wide' : outcomeRoll < blockOutEnd ? 'blockOut' : 'blocked';
  const common = {pieceId: shot.shooterId, shooterId: shot.shooterId, shootingTeam: shot.shootingTeam, from: shot.from, goalTarget: {x: shot.x, y: shot.y}, probability, accuracy: probability, roll: outcomeRoll, shotModel: details, shotPath: shot.path, ...(keeperMove ? {keeperMove} : {})};
  if (outcome === 'goal') {
    const conceded = shot.defendingTeam;
    next.score[shot.scoringTeam]++;
    const kickoffPlayer = resetActiveFormation(next, conceded);
    next.ball = {x: kickoffPlayer.x, y: kickoffPlayer.y, carrierId: kickoffPlayer.id};
    next.attack = conceded;
    next.phase = 'kickoff';
    next.positionBudget = freshBudget();
    next.pendingShot = null;
    next.releaseReason = null; next.restart = null; next.offside = null;
    resetProgress(next);
    next.turn++;
    next.lastAction = {...common, type: 'goal', team: shot.scoringTeam, to: {x: shot.x, y: shot.y}, path: shot.path, outcome: 'goal', ownGoal: shot.scoringTeam !== shot.shootingTeam};
    addLog(next, `${title(shot.scoringTeam)} scores (${Math.round(probability * 100)}% chance)${shot.scoringTeam !== shot.shootingTeam ? ' — an own goal!' : '!'} ${next.score.white}–${next.score.black}. ${title(conceded)} kicks off.`);
  } else if (outcome === 'keeperCorner' || outcome === 'saved') {
    if (outcome === 'keeperCorner') {
      const endY = shot.scoringTeam === 'white' ? -1 : BOARD_HEIGHT;
      const restart = restartForExit(next, shot.from, {x: shot.x, y: endY}, shot.defendingTeam);
      next.turn++;
      next.lastAction = {...common, type: 'save', team: shot.defendingTeam, keeperId: keeper?.id, to: {...next.ball}, path: shot.path, outcome: 'corner', tippedOut: true, restart: copy(restart)};
      addLog(next, `${title(shot.defendingTeam)} goalkeeper parries the shot out (${Math.round(details.parryGivenSave * 100)}% parry chance if stopped). ${title(shot.scoringTeam)} has a corner and a full positioning round.`);
      return next;
    }
    const destination = keeper ? {x: keeper.x, y: keeper.y} : {x: shot.x, y: shot.y < 0 ? 0 : BOARD_HEIGHT - 1};
    next.ball = {...destination, carrierId: keeper?.id || null};
    next.attack = shot.defendingTeam; next.restart = null;
    const sameTeamSave = shot.shootingTeam === shot.defendingTeam;
    const teammateBackPass = sameTeamSave && keeper && shot.shooterId !== keeper.id;
    if (!sameTeamSave) resetProgress(next);
    // A deliberate save does not erase a teammate-kick offside snapshot.
    beginPosition(next); next.turn++;
    if (teammateBackPass) {
      next.phase = 'keeperRelease'; next.releaseReason = 'backPass';
      next.ballProgress = {...progressFor(next), pendingRelease: true};
    }
    next.lastAction = {...common, type: 'save', team: shot.defendingTeam, keeperId: keeper?.id, to: destination, path: [...shot.path.slice(0, -1), destination], outcome: 'saved', ...(teammateBackPass ? {backPass:true} : {})};
    addLog(next, teammateBackPass
      ? `${title(shot.defendingTeam)} goalkeeper catches a teammate’s backward kick and must immediately release the ball.`
      : `${title(shot.defendingTeam)} goalkeeper saves (${Math.round(probability * 100)}% scoring chance). ${title(shot.defendingTeam)} takes possession.`);
    if (sameTeamSave && !teammateBackPass) completeProgressRound(next, next);
  } else if (outcome === 'wide') {
    let missedLanding = {x: shot.x, y: shot.y};
    if (shot.distance > 10 && !shot.penalty) {
      const radius = Math.max(1, Math.ceil((shot.distance - 10) / 2) + 1);
      const sideways = Math.floor(nextRoll(next) * (radius * 4 + 1)) - radius * 2;
      const overshoot = 1 + Math.floor(nextRoll(next) * radius);
      missedLanding = landingOverride(landing) || {x: shot.x + sideways, y: shot.y < 0 ? -overshoot : BOARD_HEIGHT - 1 + overshoot};
    }
    const restart = restartForExit(next, shot.from, missedLanding, shot.shootingTeam)
      || awardRestart(next, 'goalKick', shot.defendingTeam, {x: shot.x, y: shot.y < 0 ? 0 : BOARD_HEIGHT - 1});
    next.turn++;
    next.lastAction = {...common, type: 'shotMiss', team: restart.team, keeperId: keeper?.id, to: {...next.ball}, landing: missedLanding, exit: restart.exit, path: [...shot.path.slice(0, -1), missedLanding], outcome: 'wide', restart: copy(restart)};
    addLog(next, `${title(shot.shootingTeam)} shoots wide (${Math.round(details.missProbability * 100)}% miss chance). ${title(restart.team)} has a ${restart.type === 'throwIn' ? 'throw-in' : restart.type === 'corner' ? 'corner' : 'goal kick'}. ${restartTurnMessage(restart)}`);
  } else {
    const blocker = next.pieces.find(piece => piece.id === details.blockerIds[0]);
    if (!blocker) throw new Error('A blocked shot requires a defending piece on its path.');
    const blockedAt = {x: blocker.x, y: blocker.y};
    next.offside = null;
    if (outcome === 'blockOut') {
      const restart = restartForExit(next, shot.from, {x: shot.x, y: shot.y}, blocker.team);
      next.turn++;
      next.lastAction = {...common, type: 'blockedShot', team: blocker.team, blockerId: blocker.id, blockedAt, to: {...next.ball}, path: shot.path, outcome: restart.type === 'corner' ? 'corner' : 'out', restart: copy(restart)};
      addLog(next, `${title(blocker.team)} ${NAMES[blocker.type]} blocks the shot out. ${title(restart.team)} has a ${restart.type === 'corner' ? 'corner' : 'goal kick'}. ${restartTurnMessage(restart)}`);
    } else {
      next.ball = {...blockedAt, carrierId: blocker.id}; next.attack = blocker.team; next.restart = null;
      beginPosition(next); resetProgress(next); next.turn++;
      next.lastAction = {...common, type: 'blockedShot', team: blocker.team, blockerId: blocker.id, receiverId: blocker.id, blockedAt, to: blockedAt, path: [{...shot.from}, {...blockedAt}], outcome: 'blocked'};
      addLog(next, `${title(blocker.team)} ${NAMES[blocker.type]} blocks the shot and takes possession at ${square(blocker.x, blocker.y)}.`);
    }
  }
  return next;
}

function tackleFoul(next, source, piece, carrier, from, intendedTo, outcomeRoll) {
  next.discipline = disciplineFor(next);
  const ledger = next.discipline[piece.id] ||= {yellowCards: 0, redCard: false}, contactSpot = {x: carrier.x, y: carrier.y};
  let card = outcomeRoll < FOUL_RULE.red ? 'red' : outcomeRoll < FOUL_RULE.red + FOUL_RULE.yellow ? 'yellow' : null;
  if (card === 'yellow') ledger.yellowCards++;
  const secondYellow = card === 'yellow' && ledger.yellowCards >= 2;
  if (secondYellow) card = 'red';
  let keeperReplacement;
  if (card === 'red') {
    ledger.redCard = true;
    next.sentOff = [...(next.sentOff || []), {...piece, reason: secondYellow ? 'secondYellow' : 'red', yellowCards: ledger.yellowCards}];
    next.pieces = next.pieces.filter(candidate => candidate.id !== piece.id);
  }
  const forfeited = card === 'red' && forfeitIfShort(next);
  if (!forfeited && card === 'red' && piece.type === 'K') keeperReplacement = replaceDismissedKeeper(next, piece.team, from);
  const type = inOwnBox(piece.team, contactSpot.x, contactSpot.y) ? 'penalty' : 'freeKick';
  const restart = forfeited ? null : awardRestart(next, type, carrier.team, contactSpot, {reason: 'foul'});
  next.offside = null; next.looseBallKickOrigin = null; next.turn++;
  next.lastAction = {type: 'foul', team: piece.team, pieceId: piece.id, offenderId: piece.id, targetId: carrier.id,
    from, intendedTo, contactSpot, to: {...next.ball}, path: [from, contactSpot, intendedTo], card, secondYellow,
    probability: FOUL_RULE.foul, roll: outcomeRoll, ...(card === 'red' ? {sentOffId: piece.id} : {}), ...(keeperReplacement ? {keeperReplacement} : {}),
    restart: restart ? copy(restart) : null, outcome: forfeited ? 'forfeit' : type};
  addLog(next, `${title(piece.team)} ${NAMES[piece.type]} fouls the ${NAMES[carrier.type]} at ${square(contactSpot.x, contactSpot.y)}.${card ? ` ${secondYellow ? 'Second yellow: sent off.' : card === 'red' ? 'Red card: sent off.' : 'Yellow card.'}` : ''}${forfeited ? ` ${title(next.winner)} wins by forfeit; fewer than ${FOUL_RULE.minimumPlayers} opponents remain.` : ` ${title(carrier.team)} has a ${type === 'penalty' ? 'penalty (80% scoring chance)' : 'direct free kick'}. Both teams may reposition.`}`);
  return next;
}

export function applyMove(state, pieceId, x, y, {freePawn = false, roll, landing} = {}) {
  const move = legalMoves(state, pieceId, {freePawn}).find(candidate => candidate.x === x && candidate.y === y);
  if (!move) throw new Error('That is not a legal move.');
  const next = copy(state), piece = next.pieces.find(p => p.id === pieceId), from = {x: piece.x, y: piece.y};
  next.ballProgress = progressFor(state);
  if (state.phase !== 'keeperReact' && flagged(state, piece) && (move.type === 'tackle' || (!state.ball.carrierId && state.ball.x === x && state.ball.y === y))) {
    piece.x = x; piece.y = y;
    return callOffside(next, piece, {pieceId, from, intendedTo: {x, y}});
  }
  piece.x = x; piece.y = y;
  if (state.phase === 'passRun') {
    beginPosition(next);
    next.positionBudget.normalUsed = true;
    next.lastAction = {type: 'move', team: piece.team, pieceId, from, to: {x, y}, path: [from, {x, y}], passRun: true, freePawn: false};
    addLog(next, `${title(piece.team)} ${NAMES[piece.type]} follows its pass to ${square(x, y)}. The regular off-ball move is used.`);
    return next;
  }
  if (state.phase === 'keeperReact') {
    addLog(next, `${title(piece.team)} goalkeeper reacts to ${square(x, y)}.`);
    return resolveShot(next, {roll, landing, keeperMove: {pieceId, from, to: {x, y}}});
  }
  const previousAttack = state.attack, wasCarrier = next.ball.carrierId === piece.id;
  const tackling = move.type === 'tackle', probability = move.tackleProbability ?? 1;
  const withFouls = tackling && state.foulsEnabled === true;
  const cleanProbability = move.cleanTackleProbability ?? probability;
  const outcomeRoll = tackling && (withFouls || cleanProbability < 1) ? nextRoll(next, roll) : undefined;
  const carrierBefore = state.pieces.find(candidate => candidate.id === state.ball.carrierId);
  if (withFouls && outcomeRoll < FOUL_RULE.foul) return tackleFoul(next, state, piece, carrierBefore, from, {x, y}, outcomeRoll);
  const tackleSuccess = tackling && (withFouls ? outcomeRoll < FOUL_RULE.foul + FOUL_RULE.clean * cleanProbability : cleanProbability === 1 || outcomeRoll < cleanProbability);
  const collection = !next.ball.carrierId && next.ball.x === x && next.ball.y === y;
  const kickOrigin = looseKickOrigin(state);
  const selfPassCollection = collection && kickOrigin?.pieceId === piece.id && kickOrigin.team === piece.team;
  if (tackleSuccess || collection || wasCarrier) next.ball = {x, y, carrierId: piece.id};
  next.looseBallKickOrigin = tackleSuccess || collection || wasCarrier ? null : kickOrigin;
  const turnover = (tackleSuccess || collection) && piece.team !== previousAttack;
  if ((tackleSuccess || collection || wasCarrier) && state.offside && piece.team !== state.offside.team) next.offside = null;
  if (turnover) {
    next.attack = piece.team;
    beginPosition(next);
    resetProgress(next);
    next.turn++;
  } else {
    const usedBudget = freePawn ? 'pawnUsed' : wasCarrier && attackingCarrier(state, piece) ? 'dribbleUsed' : 'normalUsed';
    next.positionBudget = {...budgetFor(state), [usedBudget]: true};
    if (selfPassCollection) next.positionBudget.dribbleUsed = true;
    if (next.positionBudget.normalUsed && next.positionBudget.pawnUsed && !positionActions(next).dribbleAvailable) advancePosition(next, state.phase);
  }
  const target = state.pieces.find(p => p.id === move.targetId);
  const collectedBackPass = collection && piece.type === 'K' && kickOrigin?.team === piece.team && kickOrigin.pieceId !== piece.id;
  if (collectedBackPass) {
    next.phase = 'keeperRelease'; next.releaseReason = 'backPass';
    next.ballProgress = {...progressFor(next), pendingRelease: true, releaseAlreadyCounted: true};
  }
  next.lastAction = {
    type: tackling ? tackleSuccess ? 'tackle' : 'tackleMiss' : 'move', team: piece.team, pieceId, from, to: {x, y},
    path: target ? [from, {x: target.x, y: target.y}, {x, y}] : [from, {x, y}], freePawn,
    ...(move.targetId ? {targetId: move.targetId} : {}), ...(collection ? {collection: true} : {}),
    ...(selfPassCollection ? {selfPassCollection: true} : {}),
    ...(collectedBackPass ? {backPass: true} : {}),
    ...(tackling ? {probability, tackleSuccess, outcome: tackleSuccess ? 'won' : 'evaded', ...(withFouls ? {cleanTackleProbability: cleanProbability, foulProbability: FOUL_RULE.foul} : {}), ...(outcomeRoll !== undefined ? {roll: outcomeRoll} : {})} : {})
  };
  addLog(next, tackling
    ? tackleSuccess
      ? `${title(piece.team)} ${NAMES[piece.type]} wins the tackle (${Math.round(probability * 100)}% chance) and takes possession at ${square(x, y)}.`
      : `${title(piece.team)} ${NAMES[piece.type]} moves to ${square(x, y)}, but the knight evades the tackle (50% chance). The knight keeps the ball; the regular move is used.`
    : `${title(piece.team)} ${NAMES[piece.type]} ${wasCarrier ? 'dribbles' : 'moves'} to ${square(x, y)}${collection ? ' and collects the ball' : ''}${freePawn ? ` (free ${piece.type === 'K' ? 'king' : 'pawn'} move)` : ''}${selfPassCollection ? '; collecting its own pass uses the dribble allowance' : ''}${collectedBackPass ? '; the goalkeeper must immediately release the back-pass' : ''}.`);
  if (!turnover && !state.restart && state.phase === 'defendMove' && next.phase === 'attackMove' && !next.ball.carrierId) completeProgressRound(next, state);
  return next;
}

export function skipMove(state, {roll, landing} = {}) {
  if (state.phase === 'passRun') {
    const next = copy(state);
    beginPosition(next);
    next.lastAction = {type: 'skip', team: state.attack, phase: 'passRun', passRun: true};
    addLog(next, `${title(state.attack)} declines the follow-up run. The regular positioning move remains available.`);
    return next;
  }
  if (state.phase === 'keeperReact') {
    const next = copy(state);
    const keeper = state.pieces.find(piece => piece.type === 'K' && piece.team === currentTeam(state));
    addLog(next, keeper && inOwnBox(keeper.team, keeper.x, keeper.y)
      ? `${title(currentTeam(state))} goalkeeper holds position.`
      : `${title(currentTeam(state))} king is outside its own box and has no goalkeeper reaction. The shot resolves.`);
    return resolveShot(next, {roll, landing});
  }
  if (!positionalTurn(state)) {
    if (['kick', 'keeperRelease'].includes(state.phase) && !state.ball.carrierId) {
      const next = copy(state);
      next.ballProgress = progressFor(state);
      beginPosition(next); next.turn++;
      next.lastAction = {type: 'skip', team: state.attack, phase: state.phase};
      addLog(next, 'The ball is loose. A new positioning round begins.');
      completeProgressRound(next, state);
      return next;
    }
    throw new Error('Only a positioning turn or goalkeeper reaction can be ended.');
  }
  const next = copy(state);
  next.ballProgress = progressFor(state);
  next.lastAction = {type: 'skip', team: currentTeam(state), phase: state.phase};
  addLog(next, `${title(currentTeam(state))} ends its positioning turn.`);
  const completedLooseRound = advancePosition(next, state.phase);
  if (completedLooseRound) completeProgressRound(next, state);
  return next;
}
export const endPositionTurn = skipMove;

// The UI owns elapsed wall-clock time; applying the consequence here keeps it
// deterministic across local play, AI play, restoration and undo. A goalkeeper
// timing out may not erase a declared shot, so it holds and resolves normally.
export function actionTimeout(state) {
  const team = currentTeam(state);
  if (!TEAMS.includes(team)) return copy(state);
  if (state.phase === 'cornerSelect') {
    const action = chooseAIAction(state, {difficulty: 'casual'});
    const next = selectCornerTaker(state, action.pieceId);
    next.lastAction.timedOutTeam = team;
    addLog(next, `${title(team)} runs out of corner-selection time; a taker is chosen automatically.`);
    return next;
  }
  if (state.phase === 'passRun') {
    const next = skipMove(state);
    next.lastAction.timedOutTeam = team;
    addLog(next, `${title(team)} runs out of follow-up run time and declines the optional run. Regular positioning remains available.`);
    return next;
  }
  if (state.phase === 'keeperReact') {
    const next = skipMove(state);
    next.lastAction = {...next.lastAction, timedOutTeam: team};
    addLog(next, `${title(team)} runs out of action time; the goalkeeper holds position and the shot resolves.`);
    return next;
  }
  const next = copy(state), offence = {x: state.ball.x, y: state.ball.y};
  const restart = awardRestart(next, 'timeout', other(team), offence, {reason: 'actionTimeout'});
  next.turn++;
  next.lastAction = {type: 'timeout', team, timedOutTeam: team, offence,
    to: {...next.ball}, restart: copy(restart), outcome: 'timeout'};
  addLog(next, `${title(team)} runs out of action time. ${title(restart.team)} has an indirect free kick near ${square(offence.x, offence.y)}. Both teams may reposition.`);
  return next;
}

function landingOverride(landing) {
  if (landing === undefined) return null;
  if (!landing || !Number.isInteger(landing.x) || !Number.isInteger(landing.y)) throw new Error('A test landing must contain integer x and y.');
  return {x: landing.x, y: landing.y};
}

function scatterSquare(state, target, kickDistance, isThrow, override) {
  const radius = isThrow ? Math.max(1, Math.ceil((kickDistance - 5) / 2)) : Math.max(1, Math.ceil((kickDistance - 10) / 2) + 1);
  const [dx, dy] = DIRECTIONS[Math.floor(nextRoll(state) * DIRECTIONS.length)];
  const spread = 1 + Math.floor(nextRoll(state) * radius);
  return landingOverride(override) || {x: target.x + dx * spread, y: target.y + dy * spread};
}

export function applyKick(state, x, y, {roll, landing, passRun = false} = {}) {
  const kick = legalKicks(state).find(candidate => candidate.x === x && candidate.y === y);
  if (!kick) throw new Error('That is not a legal kick.');
  const next = copy(state), carrier = state.pieces.find(p => p.id === state.ball.carrierId), from = {x: carrier.x, y: carrier.y};
  next.ballProgress = progressFor(state);
  const restart = state.restart;
  next.offside = offsideSnapshot(state, carrier, restart); next.restart = null;
  next.looseBallKickOrigin = null;
  const loft = kick.lofted ? {lofted: true, bypassedPieceId: kick.bypassedPieceId, bypassedSquare: {...kick.bypassedSquare}} : {};
  const boxOffender = boxKnightOffenders(next, next.offside)[0];
  if (boxOffender) return callOffside(next, boxOffender, {pieceId: carrier.id, from, intendedTo: {x, y}, path: kick.path, distance: kick.distance, accuracy: kick.accuracy, ...loft, offsideReason: 'boxKnight', offsidePieceId: boxOffender.id});
  if (kick.goal) {
    next.pendingShot = {x, y, shooterId: carrier.id, shooterType: carrier.type, shootingTeam: carrier.team, scoringTeam: kick.goal, defendingTeam: other(kick.goal), from, path: kick.path, distance: kick.distance, ...(restart?.type === 'penalty' ? {penalty: true} : {})};
    next.phase = 'keeperReact'; next.releaseReason = null;
    if (kick.goal === carrier.team) resetProgress(next);
    else if (restart || state.phase === 'kickoff' || progressFor(state).excludeRelease) next.ballProgress = {...freshProgress(next), excludeRelease: true};
    const details = shotModel(next, x, y);
    next.lastAction = {type: 'shotAttempt', team: carrier.team, pieceId: carrier.id, from, to: {x, y}, path: kick.path, goalTarget: {x, y}, probability: details.probability, shotModel: details, outcome: 'pending'};
    const keeper = state.pieces.find(piece => piece.type === 'K' && piece.team === other(kick.goal));
    const reaction = keeper && inOwnBox(keeper.team, keeper.x, keeper.y)
      ? `${title(other(kick.goal))} may move its goalkeeper or hold before the shot resolves.`
      : `${title(other(kick.goal))} has no goalkeeper reaction while its king is outside its own box. Resolve the shot.`;
    addLog(next, `${title(carrier.team)} ${NAMES[carrier.type]} shoots toward ${FILE_LABELS[x]}! ${reaction}`);
    return next;
  }
  const accuracy = kick.accuracy, outcomeRoll = nextRoll(next, roll), successful = accuracy === 1 || outcomeRoll < accuracy;
  const destination = successful ? {x, y} : scatterSquare(next, {x, y}, kick.distance, restart?.type === 'throwIn', landing);
  const common = {team: carrier.team, pieceId: carrier.id, from, intendedTo: {x, y}, distance: kick.distance, accuracy, probability: accuracy, roll: outcomeRoll, ...(restart ? {restartType: restart.type} : {}), ...loft};
  if (!successful) {
    const boundaryRestart = restartForExit(next, from, destination, carrier.team);
    if (boundaryRestart) {
      next.turn++;
      next.lastAction = {...common, type: 'out', to: {...next.ball}, landing: destination, exit: boundaryRestart.exit, path: [...kick.path.slice(0, -1), destination], outcome: 'out', restart: copy(boundaryRestart)};
      addLog(next, `${title(carrier.team)} ${restart?.type === 'throwIn' ? 'throw' : 'long pass'} goes out. ${title(boundaryRestart.team)} has a ${boundaryRestart.type === 'throwIn' ? 'throw-in' : boundaryRestart.type === 'corner' ? 'corner' : 'goal kick'}. ${restartTurnMessage(boundaryRestart)}`);
      return next;
    }
  }
  const receiver = pieceAt(next, destination.x, destination.y), interception = receiver && receiver.team !== carrier.team;
  if (receiver && flagged(next, receiver)) return callOffside(next, receiver, {...common, path: [...kick.path.slice(0, -1), destination]});
  next.turn++;
  next.ball = {...destination, carrierId: receiver?.id || null}; next.attack = receiver?.team || carrier.team;
  next.looseBallKickOrigin = receiver ? null : {team: carrier.team, pieceId: carrier.id, from};
  if (interception) next.offside = null;
  beginPosition(next);
  const backPass = receiver && receiver.type === 'K' && receiver.team === carrier.team && receiver.id !== carrier.id;
  if (backPass) { next.phase = 'keeperRelease'; next.releaseReason = 'backPass'; }
  next.lastAction = {...common, type: interception ? 'interception' : successful ? 'kick' : 'miss', to: destination, path: [...kick.path.slice(0, -1), destination], outcome: interception ? 'interception' : successful ? 'complete' : 'inaccurate', ...(receiver ? {receiverId: receiver.id} : {}), ...(backPass ? {backPass: true} : {})};
  addLog(next, receiver
    ? interception ? `${title(receiver.team)} ${NAMES[receiver.type]} intercepts at ${square(destination.x, destination.y)}.`
      : backPass ? `${title(carrier.team)} passes back to the goalkeeper. The goalkeeper must immediately release the ball.`
      : `${title(carrier.team)} ${restart?.type === 'throwIn' ? 'throws' : kick.lofted ? 'lofts a pass' : 'passes'} to the ${NAMES[receiver.type]} at ${square(destination.x, destination.y)} (${Math.round(accuracy * 100)}% accuracy).`
    : `${title(carrier.team)} ${successful ? kick.lofted ? 'lofts the ball' : 'kicks' : 'scatters the ball'} to ${square(destination.x, destination.y)} (${Math.round(accuracy * 100)}% accuracy). The ball is loose.`);
  finishKickProgress(next, state, backPass, interception);
  if (passRun && successful && receiver?.team === carrier.team && receiver.type !== 'K' && !backPass && next.phase === 'attackMove' && !next.restart) {
    next.phase = 'passRun';
    next.passRun = {pieceId: carrier.id, team: carrier.team};
    next.lastAction.passRunAvailable = true;
    addLog(next, `${title(carrier.team)} ${NAMES[carrier.type]} may follow its pass with the regular off-ball move, or decline the run.`);
  }
  return next;
}

const goalDistance = (team, y) => team === 'white' ? y + 1 : BOARD_HEIGHT - y;
function reactedShotChance(state, kick) {
  const keeper = state.pieces.find(p => p.type === 'K' && p.team === other(kick.goal));
  let probability = shotChance(state, kick.x, kick.y);
  if (!keeper || !inOwnBox(keeper.team, keeper.x, keeper.y)) return probability;
  for (const [dx, dy] of DIRECTIONS) {
    const position = {x: keeper.x + dx, y: keeper.y + dy};
    if (allowedSquare(keeper, position.x, position.y) && !pieceAt(state, position.x, position.y)) probability = Math.min(probability, shotChance(state, kick.x, kick.y, position));
  }
  return probability;
}

function progressRank(state, team, y, completesRound = false) {
  const tracker = progressFor(state);
  if (tracker.team !== team || state.restart || state.phase === 'kickoff' || tracker.excludeRelease
    || !isOwnHalf(team, y) || !isOwnHalf(team, tracker.anchorY)) return 0;
  const direction = team === 'white' ? -1 : 1;
  const net = direction * (y - tracker.anchorY), advance = direction * (y - state.ball.y);
  const urgency = tracker.rounds + 1;
  let value = advance * (4 + tracker.rounds * 4);
  if (net >= STALLING_RULE.minProgress) value += urgency * 30;
  else if (completesRound) value -= tracker.rounds >= STALLING_RULE.rounds - 1 ? 650 : urgency * 12;
  return value;
}

function attackingShotRank(state, kick, team) {
  if (kick.goal !== team) return -5000;
  const chance = reactedShotChance(state, kick);
  // A token attempt from the other end of the pitch is usually a giveaway,
  // even when it clears the progress clock. Keep genuine finishes attractive.
  return chance * 2000 - (chance < 0.04 ? 850 : 90);
}

// Public geometry, rather than geometric proximity alone, decides who can
// collect a pass. A rook next to a diagonal target may still need two turns.
function receivingState(state, receiver) {
  return {...state, restart: null, phase: 'attackMove', ball: {x: receiver.x, y: receiver.y, carrierId: receiver.id}};
}

function receiverValue(state, receiver, canDribble = true) {
  const projected = receivingState(state, receiver);
  const risk = tacticalTackleRisk(projected, receiver);
  return 75 + tacticalShots(projected, receiver.team, true) * 320
    + ({Q: 20, R: 13, B: 12, N: 26, P: 0, K: -30})[receiver.type]
    - Math.max(0, Math.abs(receiver.x - BOARD_CENTER_X) - 2) * 18
    - risk * (canDribble ? 45 : 460);
}

function passLane(state, carrier, target) {
  const dx = target.x - carrier.x, dy = target.y - carrier.y;
  if (!dx && !dy) return false;
  const throwing = state.restart?.type === 'throwIn', jumping = carrier.type === 'N' && !throwing;
  const vectors = throwing ? DIRECTIONS : jumping ? KNIGHT : carrier.type === 'P' || carrier.type === 'R' ? STRAIGHTS : carrier.type === 'B' ? DIAGONALS : DIRECTIONS;
  for (const [vx, vy] of vectors) {
    const steps = vx ? dx / vx : dy / vy;
    if (!Number.isInteger(steps) || steps < 1 || (jumping && steps !== 1) || (throwing && steps > 10) || vx * steps !== dx || vy * steps !== dy) continue;
    if (!jumping) {
      let blockers = 0;
      for (let step = 1; step < steps; step++) if (pieceAt(state, carrier.x + vx * step, carrier.y + vy * step)) blockers++;
      if (blockers > (loftedRestart(state.restart) ? 1 : 0)) continue;
    }
    return true;
  }
  return false;
}

function onsideAtKick(state, piece, carrier) {
  if (piece.id === carrier.id || ['goalKick', 'corner', 'throwIn'].includes(state.restart?.type)) return true;
  if ((piece.team === 'white' ? piece.y >= MIDFIELD_RANK || piece.y >= carrier.y : piece.y <= MIDFIELD_RANK || piece.y <= carrier.y)) return true;
  const defenders = state.pieces.filter(p => p.team !== piece.team).map(p => p.y).sort((a, b) => piece.team === 'white' ? a - b : b - a);
  return piece.team === 'white' ? piece.y >= (defenders[1] ?? BOARD_HEIGHT) : piece.y <= (defenders[1] ?? -1);
}

function spacePassValue(state, kick, team) {
  const carrier = state.pieces.find(piece => piece.id === state.ball.carrierId);
  const collectors = state.pieces.filter(piece => piece.team === team && canCollect(state, piece, kick) && onsideAtKick(state, piece, carrier));
  if (!collectors.length) return -290;
  // The attacking team moves first after its pass. A teammate may collect and
  // then carry; collecting one's own pass has already spent that carry.
  return Math.max(...collectors.map(piece => {
    const moved = {...piece, x: kick.x, y: kick.y};
    const projected = {...state, pieces: state.pieces.map(p => p.id === piece.id ? moved : p)};
    return receiverValue(projected, moved, piece.id !== carrier.id) - 35;
  }));
}

function kickValue(state, kick, team) {
  if (kick.offside) return -10000;
  if (kick.goal) return attackingShotRank(state, kick, team);
  const carrier = state.pieces.find(p => p.id === state.ball.carrierId), receiver = state.pieces.find(p => p.id === kick.receiverId);
  const progress = Math.max(3, goalDistance(team, carrier.y)) - Math.max(3, goalDistance(team, kick.y));
  let value = progress * 10 + BOARD_CENTER_X - Math.abs(kick.x - BOARD_CENTER_X);
  if (receiver) {
    if (receiver.team !== team) return -900 - progress;
    value += receiverValue(state, receiver);
  } else value += spacePassValue(state, kick, team);
  value += progressRank(state, team, kick.y, receiver?.type !== 'K');
  return value * kick.accuracy - (1 - kick.accuracy) * 200;
}

function projectedMove(state, piece, move) {
  const moved = {...piece, x: move.x, y: move.y};
  const ball = state.ball.carrierId === piece.id || move.type === 'tackle' || (!state.ball.carrierId && state.ball.x === move.x && state.ball.y === move.y)
    ? {x: move.x, y: move.y, carrierId: piece.id} : state.ball;
  return {...state, pieces: state.pieces.map(p => p.id === piece.id ? moved : p), ball};
}

function supportPotential(state, piece, carrier) {
  if (piece.type === 'K' || !carrier || piece.id === carrier.id) return 0;
  if (!onsideAtKick(state, piece, carrier)) return -70;
  if (!passLane(state, carrier, piece)) return 0;
  const progress = goalDistance(piece.team, carrier.y) - goalDistance(piece.team, piece.y);
  return 26 + progress * 3 + receiverValue(state, piece) * 0.22;
}

// A defender should cover the next receiving lane as well as the ball's
// present shooting lane. The shortlist is cached only for this immutable board;
// no choice, random seed, or prior match is remembered.
const passThreatCache = new WeakMap();
function passThreats(state, carrier) {
  const cached = passThreatCache.get(state);
  if (cached) return cached;
  const threats = [];
  for (const kick of rawKicks(state)) {
    if (kick.goal || kick.offside || kick.accuracy < 0.7) continue;
    const occupant = pieceAt(state, kick.x, kick.y);
    if (occupant && occupant.team !== carrier.team) continue;
    const collectors = occupant ? [occupant] : state.pieces.filter(piece => piece.team === carrier.team && canCollect(state, piece, kick) && onsideAtKick(state, piece, carrier));
    for (const piece of collectors) {
      const moved = {...piece, x: kick.x, y: kick.y};
      const received = receivingState({...state, pieces: state.pieces.map(p => p.id === piece.id ? moved : p)}, moved);
      const probability = tacticalShots(received, carrier.team, true);
      if (probability > 0.035) threats.push({x: kick.x, y: kick.y, pieceId: piece.id, collect: !occupant, probability, accuracy: kick.accuracy, canDribble: occupant || piece.id !== carrier.id});
    }
  }
  threats.sort((a, b) => b.probability - a.probability);
  const result = threats.slice(0, 8);
  passThreatCache.set(state, result);
  return result;
}

function passExposure(state, carrier, threats) {
  let best = 0;
  for (const threat of threats) {
    const receiver = state.pieces.find(piece => piece.id === threat.pieceId);
    const occupant = pieceAt(state, threat.x, threat.y);
    if (!receiver || occupant && occupant.id !== receiver.id || !passLane(state, carrier, threat)) continue;
    if (threat.collect && !canCollect(state, receiver, threat)) continue;
    if (!onsideAtKick(state, receiver, carrier)) continue;
    const moved = {...receiver, x: threat.x, y: threat.y};
    const received = receivingState({...state, pieces: state.pieces.map(piece => piece.id === receiver.id ? moved : piece)}, moved);
    const risk = tacticalTackleRisk(received, moved);
    best = Math.max(best, tacticalShots(received, carrier.team, true) * threat.accuracy * (1 - risk * (threat.canDribble ? 0.2 : 1)));
  }
  return best;
}

function keeperHomeValue(piece) {
  const goalY = piece.team === 'white' ? BOARD_HEIGHT - 1 : 0;
  return (inOwnBox(piece.team, piece.x, piece.y) ? 25 : -25)
    - Math.abs(piece.y - goalY) * 12 - Math.abs(piece.x - BOARD_CENTER_X) * 3;
}

function moveValue(state, projected, piece, move, team, beforeThreat) {
  const afterPiece = projected.pieces.find(p => p.id === piece.id), carrier = projected.pieces.find(p => p.id === projected.ball.carrierId);
  if (flagged(state, piece) && (move.type === 'tackle' || !state.ball.carrierId && state.ball.x === move.x && state.ball.y === move.y)) return -12000;
  if (move.type === 'tackle') return 12000 * (move.tackleProbability ?? 1) + tacticalShots(projected, team, true) * 500 - tacticalTackleRisk(projected, carrier) * 80;
  const forward = goalDistance(team, piece.y) - goalDistance(team, move.y);
  let value = 0;
  if (carrier?.team === team) value += (currentBoxKnights(state).length - currentBoxKnights(projected).length) * 16000;
  if (!state.ball.carrierId) {
    if (carrier?.id === piece.id) {
      const origin = looseKickOrigin(state);
      return 5000 + receiverValue(projected, carrier, origin?.pieceId !== piece.id && !budgetFor(state).dribbleUsed);
    }
    value += (distance(piece, state.ball) - distance(afterPiece, state.ball)) * (piece.type === 'K' ? 1 : 16);
  } else if (carrier?.team === team) {
    if (carrier.id === piece.id) {
      const originalCarrier = state.pieces.find(p => p.id === piece.id);
      value += forward * 11 + (tacticalShots(projected, team, true) - tacticalShots(state, team, true)) * 650;
      value += progressRank(state, team, move.y);
      value += (tacticalTackleRisk(state, originalCarrier) - tacticalTackleRisk(projected, carrier)) * 680;
    } else {
      const originalCarrier = state.pieces.find(p => p.id === state.ball.carrierId);
      value += supportPotential(projected, afterPiece, carrier) - supportPotential(state, piece, originalCarrier);
      value += (tacticalTackleRisk(state, originalCarrier) - tacticalTackleRisk(projected, carrier)) * 450;
      value += forward * 0.6 + (distance(piece, carrier) - distance(afterPiece, carrier)) * 0.4;
      if (piece.type === 'K') value += keeperHomeValue(afterPiece) - keeperHomeValue(piece);
    }
  } else if (carrier) {
    value += (distance(piece, carrier) - distance(afterPiece, carrier)) * (piece.type === 'K' ? 0.5 : 3);
    value += (beforeThreat - tacticalShots(projected, carrier.team, true)) * 1300;
    const threats = passThreats(state, state.pieces.find(p => p.id === state.ball.carrierId));
    value += (passExposure(state, state.pieces.find(p => p.id === state.ball.carrierId), threats) - passExposure(projected, carrier, threats)) * 900;
    if (canTackle(projected, afterPiece, carrier)) value += 12;
    if (piece.type === 'K') value += keeperHomeValue(afterPiece) - keeperHomeValue(piece);
  }
  value += (BOARD_CENTER_X - Math.abs(move.x - BOARD_CENTER_X)) * 0.1;
  value += ((move.x * 17 + move.y * 13 + state.turn * 7 + piece.id.length) % 23) / 100;
  return value;
}

function cornerTakerRank(state, piece) {
  const placed = selectCornerTaker(state, piece.id);
  const kicking = {...placed, phase: 'kick'};
  let best = -Infinity;
  for (const kick of legalKicks(kicking)) best = Math.max(best, kickValue(kicking, kick, piece.team));
  // Keep a central box receiver available for the delivery and avoid taking
  // the goalkeeper away from its goal unless there is no useful alternative.
  return best - (piece.type === 'K' ? 180 : 0)
    - (isBox(piece.x, piece.y) && !inOwnBox(piece.team, piece.x, piece.y) ? 25 : 0);
}

function chooseCornerAction(state) {
  let best = null, value = -Infinity;
  for (const piece of cornerTakers(state)) {
    const rank = cornerTakerRank(state, piece);
    if (rank > value) { best = piece; value = rank; }
  }
  return best ? {type: 'cornerTaker', pieceId: best.id} : {type: 'skip'};
}

function chooseCasualAction(state) {
  if (!state || state.phase === 'finished') return {type: 'skip'};
  if (state.phase === 'cornerSelect') return chooseCornerAction(state);
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
    let best = null, value = -Infinity, finish = null, finishChance = 0.45;
    for (const kick of legalKicks(state)) {
      if (kick.goal && kick.goal !== team) continue;
      const candidateValue = kickValue(state, kick, team);
      if (candidateValue > value) { best = kick; value = candidateValue; }
      // A strong legal finish is the purpose of the build-up. Do not pass it
      // up for a positional reward; the keeper's best reaction is included.
      if (kick.goal === team && !kick.offside) {
        const chance = reactedShotChance(state, kick);
        if (chance >= finishChance) { finish = kick; finishChance = chance; }
      }
    }
    if (finish) best = finish;
    const receiver = state.pieces.find(piece => piece.id === best?.receiverId);
    return best ? {type: 'kick', x: best.x, y: best.y, ...(receiver?.team === team && receiver.type !== 'K' ? {passRun: true} : {})} : {type: 'skip'};
  }
  if (!positionalTurn(state) && state.phase !== 'passRun') return {type: 'skip'};
  const carrier = state.pieces.find(p => p.id === state.ball.carrierId);
  const beforeThreat = carrier && carrier.team !== team ? tacticalShots(state, carrier.team, true) : 0;
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

export const AI_DIFFICULTIES = Object.freeze(['casual', 'tactical']);

// Tactical searches the real phase machine, including consecutive actions by
// one side and public chance outcomes. Work is bounded by deterministic nodes,
// not elapsed time or the live random seed.
const AI_SEARCH = Object.freeze({depth: 8, roots: 9, nodes: 1400, extensions: 3});

// Inspect only goal rays when ranking positions. Building every ordinary pass
// (and its complete animation path) here would dominate the search cost.
function tacticalShots(state, team, react = false) {
  const carrier = state.pieces.find(piece => piece.id === state.ball.carrierId);
  if (!carrier || carrier.team !== team || ['throwIn', 'goalKick'].includes(state.restart?.type) || state.restart?.indirect || currentBoxKnights(state, carrier).length) return 0;
  if (state.restart?.type === 'penalty') return FOUL_RULE.penaltyGoal;
  const vectors = carrier.type === 'N' ? KNIGHT : carrier.type === 'P' || carrier.type === 'R' ? STRAIGHTS : carrier.type === 'B' ? DIAGONALS : DIRECTIONS;
  let best = 0;
  for (const [dx, dy] of vectors) {
    if (!dy) continue;
    for (let step = 1; step <= (carrier.type === 'N' ? 1 : BOARD_HEIGHT + 1); step++) {
      const x = carrier.x + dx * step, y = carrier.y + dy * step;
      if (!inside(x, y)) {
        if (goalAt(x, y) === team && !friendlyStopsShot(state, carrier, x, y)) best = Math.max(best, react ? reactedShotChance(state, {x, y, goal: team}) : shotChance(state, x, y));
        break;
      }
      if (carrier.type === 'N') break;
      const obstacle = pieceAt(state, x, y);
      if (obstacle?.team === carrier.team) break;
    }
  }
  return best;
}

function tacticalTackleRisk(state, carrier) {
  if (!carrier) return 0;
  return state.pieces.some(piece => piece.team !== carrier.team && canTackle(state, piece, carrier)) ? (carrier.type === 'N' ? 0.5 : 1) * (state.foulsEnabled ? FOUL_RULE.clean : 1) : 0;
}

function canCollect(state, piece, target) {
  if (!allowedSquare(piece, target.x, target.y) || pieceAt(state, target.x, target.y)) return false;
  if (ownPassEntryForbidden(state, piece, target)) return false;
  if (movementCost(piece, target.x, target.y) > MOVE_RANGE) return false;
  const shape = movementShape(piece), dx = target.x - piece.x, dy = target.y - piece.y;
  for (const [vx, vy] of shape.vectors) {
    const steps = vx ? dx / vx : dy / vy;
    if (!Number.isInteger(steps) || steps < 1 || steps > shape.range || vx * steps !== dx || vy * steps !== dy) continue;
    let clear = true;
    for (let step = 1; step < steps; step++) {
      const x = piece.x + vx * step, y = piece.y + vy * step;
      if (!allowedSquare(piece, x, y) || pieceAt(state, x, y)) { clear = false; break; }
    }
    if (clear) return true;
  }
  return false;
}

function looseBallValue(state, team) {
  const sides = Object.fromEntries(TEAMS.map(side => {
    const players = state.pieces.filter(piece => piece.team === side && allowedSquare(piece, state.ball.x, state.ball.y));
    const nearest = players.length ? Math.min(...players.map(piece => distance(piece, state.ball))) : 30;
    const collectors = players.filter(piece => !flagged(state, piece) && canCollect(state, piece, state.ball));
    return [side, {nearest, collectors}];
  }));
  const actor = currentTeam(state), budget = budgetFor(state);
  if (positionalTurn(state)) {
    const canUse = sides[actor].collectors.some(piece => !budget.normalUsed || (['P', 'K'].includes(piece.type) && !budget.pawnUsed));
    if (canUse) return actor === team ? 185 : -185;
  }
  const race = clamp(sides[other(team)].nearest - sides[team].nearest, -4, 4);
  return race * 28 + (sides[team].collectors.length ? 22 : 0) - (sides[other(team)].collectors.length ? 22 : 0);
}

function tacticalPositionValue(state, team) {
  if (state.phase === 'finished' && state.winner) return state.winner === team ? 1000000 : -1000000;
  let value = (state.score[team] - state.score[other(team)]) * 2000;
  const carrier = state.pieces.find(piece => piece.id === state.ball.carrierId);
  if (!carrier) return value + looseBallValue(state, team);
  const sign = carrier.team === team ? 1 : -1;
  const risk = tacticalTackleRisk(state, carrier);
  // A dangerous-looking pass is less valuable when the opponent can win the
  // receiver immediately. Actual tackles in the tree still use their real odds.
  const threat = tacticalShots(state, carrier.team, true);
  const kickNow = ['kick', 'kickoff', 'keeperRelease', 'keeperReact'].includes(state.phase);
  const canEscape = state.phase === 'attackMove' && !budgetFor(state).dribbleUsed && !state.restart;
  const challengePending = state.phase === 'attackMove' || state.phase === 'defendMove' && !budgetFor(state).normalUsed;
  let possession = 215 + (BOARD_HEIGHT - Math.max(3, goalDistance(carrier.team, carrier.y))) * 7;
  possession += threat * 450 - risk * (kickNow || !challengePending ? 0 : canEscape ? 65 : 520);
  possession += carrier.type === 'N' ? 24 : carrier.type === 'K' ? -20 : 0;
  possession += (BOARD_CENTER_X - Math.abs(carrier.x - BOARD_CENTER_X)) * 2;
  if (!state.restart && state.phase !== 'kickoff' && isOwnHalf(carrier.team, carrier.y)) {
    const tracker = progressFor(state);
    if (tracker.team === carrier.team && !tracker.excludeRelease && isOwnHalf(carrier.team, tracker.anchorY)) {
      const net = (carrier.team === 'white' ? -1 : 1) * (carrier.y - tracker.anchorY);
      possession += Math.min(STALLING_RULE.minProgress, net) * (3 + tracker.rounds * 3);
      if (net < STALLING_RULE.minProgress) possession -= tracker.rounds * 40;
    }
  }
  const support = state.pieces.filter(piece => piece.team === carrier.team && piece.id !== carrier.id && piece.type !== 'K')
    .map(piece => distance(piece, carrier)).sort((a, b) => a - b).slice(0, 2);
  possession += support.reduce((sum, length) => sum + Math.max(0, 5 - length) * 3, 0);
  // A nearby teammate only helps if the ball can actually reach them. Reward
  // several onside outlets and support on both flanks, with diminishing returns.
  const outlets = state.pieces.filter(piece => piece.team === carrier.team && piece.id !== carrier.id && piece.type !== 'K'
    && onsideAtKick(state, piece, carrier) && passLane(state, carrier, piece));
  const outletAccuracy = length => state.restart?.type === 'throwIn' ? throwAccuracy(length) : passAccuracy(length);
  possession += Math.min(3, outlets.reduce((sum, piece) => sum + outletAccuracy(distance(piece, carrier)), 0)) * 12;
  if (outlets.some(piece => piece.x < carrier.x) && outlets.some(piece => piece.x > carrier.x)) possession += 10;
  // An end-line run needs a finish or a central outlet. Reaching the deepest
  // row alone should not outweigh an attack that can actually reach the goal.
  const centralOutlet = outlets.some(piece => Math.abs(piece.x - BOARD_CENTER_X) <= 2.5 && goalDistance(piece.team, piece.y) <= 6);
  possession -= Math.max(0, Math.abs(carrier.x - BOARD_CENTER_X) - 2) * Math.max(0, 5 - goalDistance(carrier.team, carrier.y))
    * (threat > 0.08 || centralOutlet ? 1 : 4);
  // Defenders between a central carrier and their own goal provide cover even
  // before an immediate shot exists. This also values a screen behind a press.
  const cover = state.pieces.filter(piece => piece.team !== carrier.team && piece.type !== 'K'
    && Math.abs(piece.x - carrier.x) <= 2
    && (carrier.team === 'white' ? piece.y < carrier.y : piece.y > carrier.y)
    && distance(piece, carrier) <= 5).length;
  possession -= Math.min(2, cover) * 12;
  value += sign * possession;
  for (const keeper of state.pieces.filter(piece => piece.type === 'K')) {
    const positioning = keeperHomeValue(keeper);
    value += (keeper.team === team ? 1 : -1) * positioning;
  }
  return value;
}

function tacticalMoveRank(state, piece, move, beforeThreat, fast = false, threats = []) {
  const projected = projectedMove(state, piece, move);
  if (!fast) return moveValue(state, projected, piece, move, piece.team, beforeThreat);
  const carrier = projected.pieces.find(p => p.id === projected.ball.carrierId), moved = projected.pieces.find(p => p.id === piece.id);
  if (flagged(state, piece) && (move.type === 'tackle' || !state.ball.carrierId && state.ball.x === move.x && state.ball.y === move.y)) return -12000;
  const home = piece.type === 'K' ? keeperHomeValue(moved) - keeperHomeValue(piece) : 0;
  if (move.type === 'tackle') return 12000 * (move.tackleProbability ?? 1) - tacticalTackleRisk(projected, carrier) * 120;
  if (!state.ball.carrierId) return projected.ball.carrierId === piece.id
    ? 1000 + tacticalShots(projected, piece.team, true) * 600 - tacticalTackleRisk(projected, moved) * 160
    : (distance(piece, state.ball) - distance(moved, state.ball)) * 12 + home;
  if (carrier?.team === piece.team) {
    if (carrier.id === piece.id) return (Math.max(3, goalDistance(piece.team, piece.y)) - Math.max(3, goalDistance(piece.team, move.y))) * 10
      + (tacticalShots(projected, piece.team, true) - tacticalShots(state, piece.team, true)) * 700
      + (tacticalTackleRisk(state, piece) - tacticalTackleRisk(projected, carrier)) * 680 + progressRank(state, piece.team, move.y);
    const original = state.pieces.find(p => p.id === carrier.id);
    return supportPotential(projected, moved, carrier) - supportPotential(state, piece, original)
      + (tacticalTackleRisk(state, original) - tacticalTackleRisk(projected, carrier)) * 450
      + home;
  }
  if (!carrier) return 0;
  // Inner search orders defensive moves with the same public threats, using
  // lane geometry instead of recomputing every receiving shot for every move.
  let covered = 0;
  for (const threat of threats) {
    const receiver = projected.pieces.find(p => p.id === threat.pieceId);
    const occupant = pieceAt(projected, threat.x, threat.y);
    if (!receiver || occupant && occupant.id !== receiver.id || !onsideAtKick(projected, receiver, carrier) || !passLane(projected, carrier, threat)
      || threat.collect && !canCollect(projected, receiver, threat)) covered += threat.probability * threat.accuracy;
  }
  return (beforeThreat - tacticalShots(projected, carrier.team, true)) * 1300 + covered * 650
    + (distance(piece, carrier) - distance(moved, carrier)) * 3
    + (canTackle(projected, moved, carrier) ? 15 : 0) + home;
}

function tacticalKickRank(state, kick, team) {
  return kickValue(state, kick, team);
}

function rankedTacticalActions(state, width, root = false) {
  if (state.phase === 'cornerSelect') return [{action: chooseCasualAction(state), rank: 0}];
  const team = currentTeam(state);
  if (state.phase === 'finished' || !team) return [];
  // A keeper's immediate objective is to minimize this declared shot's chance,
  // rather than spend branching budget rediscovering all nine possible moves.
  if (state.phase === 'keeperReact') return [{action: chooseCasualAction(state), rank: 0}];
  let candidates = [];
  if (['kick', 'kickoff', 'keeperRelease'].includes(state.phase)) {
    candidates = legalKicks(state).filter(kick => !kick.goal || kick.goal === team).map(kick => {
      const receiver = state.pieces.find(piece => piece.id === kick.receiverId);
      return {action: {type: 'kick', x: kick.x, y: kick.y, ...(receiver?.team === team && receiver.type !== 'K' ? {passRun: true} : {})}, rank: tacticalKickRank(state, kick, team), category: kick.goal ? 'shot' : kick.receiverId ? 'pass' : 'space'};
    });
  } else if (positionalTurn(state) || state.phase === 'passRun') {
    const carrier = state.pieces.find(piece => piece.id === state.ball.carrierId);
    const beforeThreat = carrier && carrier.team !== team ? tacticalShots(state, carrier.team, true) : 0;
    const threats = !root && carrier && carrier.team !== team ? passThreats(state, carrier).slice(0, 3) : [];
    candidates.push({action: {type: 'skip'}, rank: -0.5, category: 'skip'});
    for (const piece of state.pieces) if (piece.team === team) {
      for (const freePawn of [false, true]) for (const move of legalMoves(state, piece.id, {freePawn})) {
        const carrying = piece.id === carrier?.id;
        const safeDribble = carrying && !tacticalTackleRisk(projectedMove(state, piece, move), {...piece, x: move.x, y: move.y});
        candidates.push({action: {type: 'move', pieceId: piece.id, x: move.x, y: move.y, freePawn}, rank: tacticalMoveRank(state, piece, move, beforeThreat, !root, threats) + (freePawn ? 0.01 : 0), category: freePawn ? 'pawn' : move.type === 'tackle' ? 'tackle' : carrying ? safeDribble ? 'safeDribble' : 'dribble' : 'support'});
      }
    }
  }
  candidates.sort((a, b) => b.rank - a.rank);
  let shortlist = candidates.slice(0, width);
  // A greedy shot-blocking rank must never prune every possession-winning
  // reply. Likewise, consider an actual shot alongside a pass in kicking turns.
  if (!root && width > 1) {
    const categories = positionalTurn(state) ? ['tackle', 'safeDribble', 'support'] : ['shot', 'pass'];
    shortlist = [];
    for (const category of categories) {
      const candidate = candidates.find(entry => entry.category === category);
      if (candidate && shortlist.length < width) shortlist.push(candidate);
    }
    for (const candidate of candidates) if (shortlist.length < width && !shortlist.includes(candidate)) shortlist.push(candidate);
    shortlist.sort((a, b) => b.rank - a.rank);
  }
  // Root diversity gives both a safe pass and a shot, or a supporting move and
  // a dribble, a chance to survive the inexpensive first-stage ranking.
  if (root) {
    const wanted = positionalTurn(state) ? ['pawn', 'support', 'safeDribble', 'dribble', 'tackle'] : ['shot', 'pass', 'space'];
    shortlist = [];
    for (const category of wanted) {
      const candidate = candidates.find(entry => entry.category === category);
      if (candidate) shortlist.push(candidate);
    }
    for (const candidate of candidates) if (shortlist.length < width && !shortlist.includes(candidate)) shortlist.push(candidate);
    shortlist.sort((a, b) => b.rank - a.rank);
  }
  return shortlist;
}

function planningState(state) {
  // Planning never reads or consumes the live PRNG. Chance branches below
  // enumerate pass scatter and use symmetric samples for a wide shot.
  return {...state, randomState: 1, log: [], lastAction: null};
}

function tacticalSuccessors(state, action) {
  if (action.type === 'cornerTaker') return [{probability: 1, state: selectCornerTaker(state, action.pieceId)}];
  const source = planningState(state);
  const apply = (roll, landing) => {
    const next = action.type === 'kick' ? applyKick(source, action.x, action.y, {roll, landing, passRun: !!action.passRun})
      : action.type === 'move' ? applyMove(source, action.pieceId, action.x, action.y, {freePawn: !!action.freePawn, roll, landing})
        : skipMove(source, {roll, landing});
    return planningState(next);
  };
  if (state.phase === 'keeperReact') {
    const model = shotModel(state, state.pendingShot.x, state.pendingShot.y, action.type === 'move' ? action : undefined);
    const shot = state.pendingShot;
    let start = 0;
    return [model.goalProbability, model.keeperCornerProbability, model.caughtSaveProbability, model.missProbability, model.blockOutProbability, model.blockPossessionProbability].flatMap((probability, index) => {
      const roll = Math.min(1 - Number.EPSILON, start + probability / 2); start += probability;
      if (probability <= 0) return [];
      if (index !== 3 || shot.distance <= 10) return [{probability, state: apply(roll)}];
      // A bounded, symmetric quadrature covers side-line and end-line risk.
      // Actual play samples every integer offset; this planning approximation
      // uses five equally weighted lateral samples and the mean overshoot.
      const radius = Math.max(1, Math.ceil((shot.distance - 10) / 2) + 1);
      const meanOvershoot = (radius + 1) / 2;
      const depths = [...new Set([Math.floor(meanOvershoot), Math.ceil(meanOvershoot)])];
      return [-2 * radius, -radius, 0, radius, 2 * radius].flatMap(offset => depths.map(depth => ({
        probability: probability / (5 * depths.length),
        state: apply(roll, {x: shot.x + offset, y: shot.y < 0 ? -depth : BOARD_HEIGHT - 1 + depth})
      })));
    });
  }
  let probability = 1, kick;
  if (action.type === 'kick') {
    kick = legalKicks(state).find(candidate => candidate.x === action.x && candidate.y === action.y);
    if (kick.offsideReason === 'boxKnight') return [{probability: 1, state: apply(0)}];
    if (!kick.goal) probability = kick.accuracy;
  } else if (action.type === 'move') {
    const move = legalMoves(state, action.pieceId, {freePawn: !!action.freePawn}).find(candidate => candidate.x === action.x && candidate.y === action.y);
    if (move.type === 'tackle' && state.foulsEnabled) {
      const clean = move.cleanTackleProbability ?? 1;
      return [[FOUL_RULE.red, FOUL_RULE.red / 2],
        [FOUL_RULE.yellow, FOUL_RULE.red + FOUL_RULE.yellow / 2],
        [FOUL_RULE.plain, FOUL_RULE.red + FOUL_RULE.yellow + FOUL_RULE.plain / 2],
        [FOUL_RULE.clean * clean, FOUL_RULE.foul + FOUL_RULE.clean * clean / 2],
        [FOUL_RULE.clean * (1 - clean), FOUL_RULE.foul + FOUL_RULE.clean * clean + FOUL_RULE.clean * (1 - clean) / 2]]
        .filter(([chance]) => chance > 0).map(([chance, roll]) => ({probability: chance, state: apply(roll)}));
    }
    if (move.type === 'tackle') probability = move.tackleProbability ?? 1;
  }
  if (probability >= 1) return [{probability: 1, state: apply(0)}];
  const success = {probability, state: apply(probability / 2)}, missRoll = (1 + probability) / 2;
  if (!kick) return [success, {probability: 1 - probability, state: apply(missRoll)}];
  // Unlike the live seed, this complete conditional scatter distribution is
  // public information: eight directions and every allowed radius, uniformly.
  const radius = state.restart?.type === 'throwIn' ? Math.max(1, Math.ceil((kick.distance - 5) / 2)) : Math.max(1, Math.ceil((kick.distance - 10) / 2) + 1);
  const misses = DIRECTIONS.flatMap(([dx, dy]) => Array.from({length: radius}, (_, index) => ({
    probability: (1 - probability) / (DIRECTIONS.length * radius),
    state: apply(missRoll, {x: kick.x + dx * (index + 1), y: kick.y + dy * (index + 1)})
  })));
  return [success, ...misses];
}

// The table belongs to one decision. Include every rule-relevant field: two
// identical boards can have different legal futures because of spent actions,
// offside, self-pass collection, an indirect restart, or the progress deadline.
function tacticalStateKey(state) {
  return JSON.stringify([state.pieces.map(p => [p.id, p.team, p.type, p.x, p.y, p.originalType, p.replacementKeeper]), state.ball, state.attack, state.phase,
    budgetFor(state), state.score, state.restart, state.offside, state.pendingShot, state.ballProgress,
    state.looseBallKickOrigin, state.releaseReason, state.passRun, state.rulesVersion, state.turn, state.foulsEnabled, state.discipline, state.sentOff, state.winner, state.finishReason]);
}
const tacticalActionKey = action => JSON.stringify([action.type, action.pieceId, action.x, action.y, !!action.freePawn, !!action.passRun]);
const SEARCH_ABORT = Symbol('Tactical search allowance exhausted');

function tacticalUnsettled(state) {
  if (state.phase === 'keeperReact' || state.phase === 'keeperRelease' || state.phase === 'kick' || state.phase === 'passRun') return true;
  const carrier = state.pieces.find(p => p.id === state.ball.carrierId);
  if (!carrier) return positionalTurn(state) && state.pieces.some(piece => piece.team === currentTeam(state) && !flagged(state, piece)
    && canCollect(state, piece, state.ball) && (!budgetFor(state).normalUsed || ['P', 'K'].includes(piece.type) && !budgetFor(state).pawnUsed));
  if (state.restart || state.phase === 'kickoff') return false;
  // Complete a live defensive turn through its pending kick, rather than
  // compare an advanced carrier with an attack whose kick has already settled.
  if (state.phase === 'defendMove') return true;
  if (state.phase === 'attackMove' && Object.values(budgetFor(state)).some(Boolean)) return true;
  if (positionalTurn(state) && tacticalTackleRisk(state, carrier)) {
    if (state.phase === 'defendMove' && !budgetFor(state).normalUsed) return true;
    if (state.phase === 'attackMove' && (!budgetFor(state).dribbleUsed || !budgetFor(state).normalUsed)) return true;
  }
  return tacticalShots(state, carrier.team, true) > 0.08;
}

// Public diagnostics make budgets, completed iterations and cache equivalence
// reproducible in tests and simulations. The controller still receives just an
// action through chooseAIAction; no analysis state enters a saved match.
export function analyzeTacticalAction(state, {maxDepth = AI_SEARCH.depth, nodeLimit = AI_SEARCH.nodes, useCache = true, extensions = true} = {}) {
  maxDepth = clamp(Math.floor(Number(maxDepth) || 1), 1, 12);
  nodeLimit = clamp(Math.floor(Number(nodeLimit) || 1), 1, 50000);
  const stats = {nodes: 0, completedDepth: 0, cacheHits: 0, extensions: 0, cutoffs: 0, aborted: false};
  if (!state || state.phase === 'finished') return {action: {type: 'skip'}, value: 0, stats, line: []};
  const source = planningState(state), team = currentTeam(source);
  const table = new Map(), ordering = new Map(), actionsCache = new Map(), values = new Map(), successors = new Map(), keys = new WeakMap();
  let cachedSuccessorCount = 0;
  const keyFor = position => {
    if (!keys.has(position)) keys.set(position, tacticalStateKey(position));
    return keys.get(position);
  };
  const evaluate = position => {
    const key = keyFor(position);
    if (useCache && values.has(key)) return values.get(key);
    const value = tacticalPositionValue(position, team);
    if (useCache) values.set(key, value);
    return value;
  };
  const actionsFor = (position, root = false) => {
    const budget = budgetFor(position), owner = position.pieces.find(p => p.id === position.ball.carrierId);
    const pawnOnly = positionalTurn(position) && budget.normalUsed
      && (position.phase !== 'attackMove' || !!position.restart || !owner || budget.dribbleUsed);
    const width = root ? AI_SEARCH.roots : position.phase === 'keeperReact' || pawnOnly ? 1
      : ['kick', 'kickoff', 'keeperRelease'].includes(position.phase) ? 2 : 3;
    const key = `${keyFor(position)}|${root ? 'root' : 'inner'}`;
    if (useCache && actionsCache.has(key)) return actionsCache.get(key);
    const actions = rankedTacticalActions(position, width, root);
    if (useCache) actionsCache.set(key, actions);
    return actions;
  };
  const outcomesFor = (position, action) => {
    const key = `${keyFor(position)}|${tacticalActionKey(action)}`;
    if (useCache && successors.has(key)) return successors.get(key);
    const outcomes = tacticalSuccessors(position, action);
    if (useCache && cachedSuccessorCount + outcomes.length <= 2000) {
      successors.set(key, outcomes); cachedSuccessorCount += outcomes.length;
    }
    return outcomes;
  };
  const expand = () => {
    if (stats.nodes >= nodeLimit) throw SEARCH_ABORT;
    stats.nodes++;
  };
  function search(position, depth, extra, alpha = -Infinity, beta = Infinity, root = false) {
    const positionKey = keyFor(position), cacheKey = `${positionKey}|${Math.max(0, depth)}|${extra}|${root ? 'root' : 'inner'}`;
    const originalAlpha = alpha, originalBeta = beta;
    const cached = useCache ? table.get(cacheKey) : null;
    if (cached) {
      stats.cacheHits++;
      if (cached.flag === 'exact') return cached;
      if (cached.flag === 'lower') alpha = Math.max(alpha, cached.value);
      else beta = Math.min(beta, cached.value);
      if (alpha >= beta) return cached;
    }
    expand();
    const forcedShot = position.phase === 'keeperReact';
    const extending = depth <= 0 && (forcedShot || extra > 0 && tacticalUnsettled(position));
    if (position.phase === 'finished' || depth <= 0 && !extending) {
      const result = {value: evaluate(position), action: null, line: [], flag: 'exact'};
      if (useCache) table.set(cacheKey, result);
      return result;
    }
    if (extending) stats.extensions++;
    const candidates = actionsFor(position, root);
    if (!candidates.length) return {value: evaluate(position), action: null, line: [], flag: 'exact'};
    // Ordering changes the order searched, never which moves survive the beam.
    // Preserve the original rank index for equal-score tie breaks.
    const preferred = ordering.get(positionKey);
    const ordered = candidates.map((entry, index) => ({...entry, index}));
    ordered.sort((a, b) => Number(tacticalActionKey(b.action) === preferred) - Number(tacticalActionKey(a.action) === preferred) || a.index - b.index);
    const maximizing = currentTeam(position) === team;
    let bestValue = maximizing ? -Infinity : Infinity, bestIndex = Infinity, bestAction = null, bestLine = [];
    for (const {action, index} of ordered) {
      const outcomes = outcomesFor(position, action);
      let value = 0, likely = null, continuation = [], deterministicChild = null;
      for (const outcome of outcomes) {
        // A weighted chance result must average exact children. An ordinary
        // alpha/beta bound on one random outcome is not an expectation bound.
        const child = search(outcome.state, depth - 1, extending ? Math.max(0, extra - 1) : extra,
          outcomes.length === 1 ? alpha : -Infinity, outcomes.length === 1 ? beta : Infinity);
        value += outcome.probability * child.value;
        if (outcomes.length === 1) deterministicChild = child;
        if (!likely || outcome.probability > likely.probability) { likely = outcome; continuation = child.line; }
      }
      // A fail-low/high bound equal to the incumbent is not proof of a tie.
      // Resolve it before a canonical earlier move can replace that incumbent.
      if (index < bestIndex && Math.abs(value - bestValue) <= 1e-8 && deterministicChild && deterministicChild.flag !== 'exact') {
        const child = search(outcomes[0].state, depth - 1, extending ? Math.max(0, extra - 1) : extra);
        value = child.value; continuation = child.line;
      }
      if (bestAction === null || (maximizing ? value > bestValue + 1e-8 : value < bestValue - 1e-8)
        || Math.abs(value - bestValue) <= 1e-8 && index < bestIndex) {
        bestValue = value; bestIndex = index; bestAction = action;
        bestLine = [{action, team: currentTeam(position), phase: position.phase}, ...continuation];
      }
      if (maximizing) alpha = Math.max(alpha, bestValue); else beta = Math.min(beta, bestValue);
      if (alpha >= beta) { stats.cutoffs++; break; }
    }
    const flag = bestValue <= originalAlpha ? 'upper' : bestValue >= originalBeta ? 'lower' : 'exact';
    const result = {value: bestValue, action: bestAction, line: bestLine, flag};
    if (useCache) table.set(cacheKey, result);
    ordering.set(positionKey, tacticalActionKey(bestAction));
    return result;
  }
  const candidates = actionsFor(source, true);
  let completed = {action: candidates[0]?.action || {type: 'skip'}, value: evaluate(source), line: []};
  // Keep the actual goalkeeper policy common to both levels.
  if (source.phase === 'keeperReact') {
    const action = chooseCasualAction(source);
    return {action, value: outcomesFor(source, action).reduce((sum, outcome) => sum + outcome.probability * evaluate(outcome.state), 0),
      stats, line: [{action, team, phase: source.phase}]};
  }
  for (let depth = 1; depth <= maxDepth; depth++) {
    try {
      const result = search(source, depth, extensions ? AI_SEARCH.extensions : 0, -Infinity, Infinity, true);
      completed = result; stats.completedDepth = depth;
    } catch (error) {
      if (error !== SEARCH_ABORT) throw error;
      stats.aborted = true; break;
    }
  }
  return {action: completed.action, value: completed.value, stats, line: completed.line};
}

function chooseTacticalAction(state) {
  return analyzeTacticalAction(state).action;
}

export function chooseAIAction(state, {difficulty = 'casual'} = {}) {
  // Keep geometry reuse within a decision, while allowing custom setups or
  // API callers to edit an existing state object between decisions.
  if (state && typeof state === 'object') passThreatCache.delete(state);
  return difficulty === 'tactical' ? chooseTacticalAction(state) : chooseCasualAction(state);
}
