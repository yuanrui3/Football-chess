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
export const RULES_VERSION = 19;
export const ALLOW_OUTFIELD_BOXES = true;
export const LONG_TACKLE_RANGE = 5;
export const MOVE_RANGE = 10;
export const BOX_MOVE_COST = 2;
export const DRIBBLE_RANGE = 8;
export const ACTION_SECONDS = 30;
export const STALLING_RULE = Object.freeze({rounds: 3, minProgress: 4});
export const PACE_RULE = Object.freeze({maxDribbleRounds: 4, repetitionOccurrences: 3, maxCycleRounds: 3, historyRounds: 7});
// Tunable board-game parameters, not fitted football statistics. Distance is in
// board squares and time is in abstract units set by ballSpeed.
export const SHOT_MODEL = Object.freeze({
  version: 15, ballSpeed: 6, blockPerDefender: 0.45, blockCornerShare: 0.85, knightGoalMultiplier: 1, finishingAccuracyMultiplier: 1.15,
  parryInPlayShare: 0.20, reboundBoxMargin: 2,
  targetBase: 0.98, distanceDecay: 0.018, distancePenaltyStart: 3, longShotDecay: 0.06, rookLongShotDecay: 0.03, minOnTarget: 0.01, maxOnTarget: 0.98,
  angleFloor: 0.65, angleWeight: 0.35, postAngleFloor: 0.10, postAngleWeight: 0.90, postAngleExponent: 1.5,
  wideAngleStartDegrees: 45, wideAngleFullDegrees: 90, wideAngleAccuracyBonus: 0.25,
  centralLaneAccuracyBonus: 0.15,
  boxRadius: 0.4, boxDiveSpeed: 1.3, boxReactionDelay: 0.15, boxMaxSave: 0.90,
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

// Only the possessing side's completed rounds enter this history. Defensive
// replies and free off-ball shuffles cannot make the responding side guilty,
// or disguise a recurring ball route. A loose self-pass retains its kicker's
// identity until a different player actually controls the ball.
const ballAdvance = state => ((state.attack === 'white' ? -1 : 1) * state.ball.y) || 0;
const paceOwner = state => state.ball.carrierId || looseKickOrigin(state)?.pieceId || null;
const freshPace = state => ({team: state.attack, carrierId: paceOwner(state), dribbleRounds: 0,
  dribbledThisRound: false, history: [], furthestAdvance: ballAdvance(state)});
function paceFor(state) {
  const saved = state.paceControl, fresh = freshPace(state);
  if (!saved || saved.team !== state.attack || !TEAMS.includes(saved.team)) return fresh;
  // Imported/corrupted metadata must not invent four previous carries for a
  // different player. Live counters already satisfy these finite invariants.
  const validCarrier = saved.carrierId === null || state.pieces.some(piece => piece.id === saved.carrierId && piece.team === saved.team);
  if (!validCarrier || !Number.isInteger(saved.dribbleRounds) || saved.dribbleRounds < 0 || saved.dribbleRounds > PACE_RULE.maxDribbleRounds
      || typeof saved.dribbledThisRound !== 'boolean' || saved.carrierId === null && (saved.dribbleRounds || saved.dribbledThisRound)) return fresh;
  const carrierId = saved.carrierId || fresh.carrierId;
  const validKey = key => typeof key === 'string' && key.length < 70
    && /^(?:[0-9]|1[0-3]),(?:[0-9]|1[0-6]):(?:white|black)-(?:K|Q|R[12]|B[12]|N[12]|P[123])$/.test(key)
    && key.split(':')[1].startsWith(`${saved.team}-`);
  return {team: saved.team, carrierId,
    dribbleRounds: clamp(Math.floor(Number(saved.dribbleRounds) || 0), 0, PACE_RULE.maxDribbleRounds),
    dribbledThisRound: !!saved.dribbledThisRound && !!carrierId,
    history: Array.isArray(saved.history) ? saved.history.filter(validKey).slice(-PACE_RULE.historyRounds) : [],
    furthestAdvance: Number.isFinite(saved.furthestAdvance) ? clamp(saved.furthestAdvance, -BOARD_HEIGHT + 1, BOARD_HEIGHT - 1) || 0 : fresh.furthestAdvance};
}
const resetPace = state => { state.paceControl = null; };
function repeatedPacePeriod(history, occurrences = PACE_RULE.repetitionOccurrences) {
  for (let period = 1; period <= PACE_RULE.maxCycleRounds; period++) {
    if (history.length <= period * (occurrences - 1)) continue;
    const last = history.length - 1;
    if (Array.from({length: occurrences - 1}, (_, index) => history[last] === history[last - (index + 1) * period]).every(Boolean)
        && Array.from({length: period}, (_, offset) => history[last - offset] === history[last - period - offset]).every(Boolean)) return period;
  }
  return 0;
}
export function paceInfo(state) {
  const tracker = paceFor(state), active = !state.restart && !['kickoff', 'keeperReact', 'finished'].includes(state.phase);
  const spent = tracker.dribbleRounds + (tracker.dribbledThisRound ? 1 : 0);
  const repetitionWarning = active && !!repeatedPacePeriod(tracker.history, 2);
  return {team: tracker.team, active, carrierId: tracker.carrierId, dribbleRounds: tracker.dribbleRounds,
    dribbledThisRound: tracker.dribbledThisRound, dribbleRoundsRemaining: Math.max(0, PACE_RULE.maxDribbleRounds - spent),
    warning: active && (spent >= PACE_RULE.maxDribbleRounds - 1 || repetitionWarning), repetitionWarning, historyRounds: tracker.history.length};
}
function paceHandoff(state, pieceId) {
  const tracker = paceFor(state);
  if (pieceId !== tracker.carrierId) Object.assign(tracker, {carrierId: pieceId, dribbleRounds: 0, dribbledThisRound: false});
  state.paceControl = tracker;
}
function forbiddenPaceCarry(state, piece, move) {
  if (state.restart || state.phase !== 'attackMove' || piece.team !== state.attack) return false;
  const carry = state.ball.carrierId === piece.id || !state.ball.carrierId && move.x === state.ball.x && move.y === state.ball.y
    && looseKickOrigin(state)?.pieceId === piece.id;
  if (!carry) return false;
  const tracker = paceFor(state);
  return tracker.carrierId === piece.id && tracker.dribbleRounds >= PACE_RULE.maxDribbleRounds;
}
function paceFreeKick(state, team, offence, reason, details, triggeringAction) {
  const restart = awardRestart(state, 'stalling', other(team), offence, {reason});
  state.lastAction = {type: 'stalling', team, reason, offence, ...details, triggeringAction: copy(triggeringAction),
    restart: copy(restart), to: {...state.ball}, outcome: 'stalling'};
  addLog(state, reason === 'dribbleLimit'
    ? `${title(team)} attempts a fifth dribbling round with the same player. ${title(restart.team)} has an indirect free kick near ${square(offence.x, offence.y)}. Both teams may reposition.`
    : `${title(team)} repeats a ${details.cycleRounds}-round ball route for the third time without new forward progress. ${title(restart.team)} has an indirect free kick near ${square(offence.x, offence.y)}. Both teams may reposition.`);
  return state;
}
function completePaceRound(state, source) {
  const tracker = state.paceControl ? paceFor(state) : paceFor(source);
  if (source.restart || source.phase === 'kickoff' || state.restart || state.attack !== source.attack) { resetPace(state); return; }
  if (tracker.dribbledThisRound) tracker.dribbleRounds = Math.min(PACE_RULE.maxDribbleRounds, tracker.dribbleRounds + 1);
  tracker.dribbledThisRound = false;
  const advance = ballAdvance(state);
  if (advance > tracker.furthestAdvance) { tracker.history = []; tracker.furthestAdvance = advance; }
  const owner = paceOwner(state) || tracker.carrierId;
  if (owner) tracker.history = [...tracker.history, `${state.ball.x},${state.ball.y}:${owner}`].slice(-PACE_RULE.historyRounds);
  state.paceControl = tracker;
  const cycleRounds = repeatedPacePeriod(tracker.history);
  if (cycleRounds) paceFreeKick(state, state.attack, {x: state.ball.x, y: state.ball.y}, 'repetition',
    {cycleRounds, repetitions: PACE_RULE.repetitionOccurrences}, state.lastAction);
}

function completeAttackingRound(state, source) {
  completeProgressRound(state, source);
  if (!state.restart) completePaceRound(state, source);
}

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
  if (interception) { resetProgress(state); resetPace(state); return; }
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
  } else if (excluded) { resetProgress(state); resetPace(state); }
  else completeAttackingRound(state, source);
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
  const options = validatedDisguisedOptions(state, shot);
  if (options.length === 2) {
    Object.assign(shot, options[0], {disguised: true, targetOptions: options});
    shot.shooterType = state.pieces.find(piece => piece.id === shot.shooterId).type;
    shot.scoringTeam = shootingTeam; shot.defendingTeam = other(shootingTeam);
    delete shot.chosenTargetIndex; delete shot.actualTarget; delete shot.targetRoll;
  } else {
    delete shot.disguised; delete shot.targetOptions;
  }
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
    ballProgress: {team: kickoff, anchorY: carrier.y, rounds: 0, pendingRelease: false, excludeRelease: false}, paceControl: null
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
      if (running && enteringBox) break;
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
  return {team, ball: {x: ball.x, y: ball.y}, secondLastY, players, flaggedIds, boxKnightIds, boxAttackerIds, activeFlaggedIds: state?.offside?.team === team ? offsideFlaggedIds(state) : []};
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
// Only teammates can offend at a kick. Keep that invariant even when loading
// a stale snapshot; never reconstruct flags from a later defensive line.
export function offsideFlaggedIds(state) {
  const snapshot = state?.offside;
  if (!snapshot) return [];
  return (snapshot.flaggedIds || []).filter(id => id !== snapshot.kickerId
    && state.pieces.some(piece => piece.id === id && piece.team === snapshot.team));
}
const flagged = (state, piece) => !!piece && state.offside?.team === piece.team
  && piece.id !== state.offside.kickerId && (state.offside.flaggedIds || []).includes(piece.id);

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
  resetPace(state);
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
  if (next.offside) next.offside.flaggedIds = offsideFlaggedIds(next);
  if (next.phase === 'cornerSelect') {
    if (next.restart?.type === 'corner' && TEAMS.includes(next.restart.team)) {
      next.attack = next.restart.team;
      if (!inside(next.restart.spot?.x, next.restart.spot?.y)) {
        next.restart.spot = {x: Number(next.ball?.x) > BOARD_CENTER_X ? BOARD_WIDTH - 1 : 0, y: next.attack === 'white' ? 0 : BOARD_HEIGHT - 1};
      }
      next.restart.takerId = null;
      next.restart.indirect = false;
      next.ball = {x: next.restart.spot.x, y: next.restart.spot.y, carrierId: null};
      next.passRun = null; next.offside = null; next.pendingShot = null; next.looseBallKickOrigin = null;
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
  if (next.paceControl != null) next.paceControl = (Number(state.rulesVersion) || 0) < 18 || next.restart || next.phase === 'kickoff' || next.phase === 'keeperReact'
    ? null : paceFor(next);
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
    if (next.pendingShot.disguised) {
      const shot = next.pendingShot;
      Object.assign(next.lastAction, {disguised: true, targetOptions: copy(shot.targetOptions), targetProbability: 0.5,
        to: {x: shot.x, y: shot.y}, goalTarget: {x: shot.x, y: shot.y}, path: copy(shot.path)});
      delete next.lastAction.chosenTargetIndex; delete next.lastAction.actualTarget; delete next.lastAction.targetRoll;
    } else {
      delete next.lastAction.disguised; delete next.lastAction.targetOptions; delete next.lastAction.targetProbability;
    }
  }
  next.rulesVersion = RULES_VERSION;
  return next;
}

const restartTurnMessage = restart => restart.type === 'goalKick' ? 'Both teams may reposition before the goalkeeper passes the ball into the pitch.' : 'Both teams may reposition before the restart.';

function restartForExit(state, from, landing, lastTouchTeam, {cornerTargetX} = {}) {
  const exit = boundaryExit(from, landing);
  if (!exit) return null;
  if (exit.line === 'left' || exit.line === 'right') return awardRestart(state, 'throwIn', other(lastTouchTeam), {x: exit.line === 'left' ? 0 : BOARD_WIDTH - 1, y: exit.y}, {exit});
  const defendingTeam = exit.line === 'top' ? 'black' : 'white';
  const type = lastTouchTeam === defendingTeam ? 'corner' : 'goalKick';
  const team = type === 'corner' ? other(defendingTeam) : defendingTeam;
  const cornerX = Number.isFinite(cornerTargetX) ? cornerTargetX : exit.x;
  const spot = type === 'corner' ? {x: cornerX < (BOARD_WIDTH - 1) / 2 ? 0 : BOARD_WIDTH - 1, y: exit.line === 'top' ? 0 : BOARD_HEIGHT - 1}
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

// A goalkeeper spill is a loose ball, never an automatic touch by a nearby
// piece. The stable, public list is shared by live play and chance search.
export function keeperReboundTargets(state, shot = state?.pendingShot) {
  const scoringTeam = shot?.scoringTeam || shotScoringTeam(shot?.x, shot?.y);
  const defendingTeam = shot?.defendingTeam || (scoringTeam ? other(scoringTeam) : null);
  if (!TEAMS.includes(defendingTeam)) return [];
  const margin = SHOT_MODEL.reboundBoxMargin;
  const minX = Math.max(0, BOX_FILES[0] - margin), maxX = Math.min(BOARD_WIDTH - 1, BOX_FILES.at(-1) + margin);
  const minY = defendingTeam === 'black' ? 0 : Math.max(0, BOARD_HEIGHT - BOX_DEPTH - margin);
  const maxY = defendingTeam === 'black' ? Math.min(BOARD_HEIGHT - 1, BOX_DEPTH - 1 + margin) : BOARD_HEIGHT - 1;
  const occupied = new Set((state?.pieces || []).map(piece => `${piece.x},${piece.y}`));
  const targets = [];
  for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
    if (!isGoalMouth(x, y) && !occupied.has(`${x},${y}`)) targets.push({x, y});
  }
  return targets;
}

function singleShotModel(state, x = state?.pendingShot?.x, y = state?.pendingShot?.y, keeperPosition) {
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
    onTargetProbability: 0, baseOnTargetProbability: 0, saveGivenOnTarget: 0, cornerProbability: 0, keeperCornerProbability: 0, keeperReboundProbability: 0, caughtSaveProbability: 0, blockerIds: [], blockerPositions: [], blockProbability: 0, blockOutProbability: 0, blockCornerProbability: 0, blockPossessionProbability: 0, arrivalSpeed: 0, keeperStretch: 0, parryGivenSave: 0, distance: 0, shotAngleDegrees: 0,
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
  const parryProbability = saveProbability * parryGivenSave;
  // Teammate backward kicks keep their compulsory-release pipeline; live
  // goalkeeper spills are saves of an opponent's shot.
  const keeperReboundProbability = shootingTeam !== defendingTeam ? parryProbability * SHOT_MODEL.parryInPlayShare : 0;
  const keeperCornerProbability = parryProbability - keeperReboundProbability;
  const blockOutProbability = blockProbability * SHOT_MODEL.blockCornerShare;
  const blockCornerProbability = shootingTeam === scoringTeam ? blockOutProbability : 0;
  const blockPossessionProbability = blockProbability - blockOutProbability;
  const cornerProbability = keeperCornerProbability + blockCornerProbability;
  const result = {
    probability: goalProbability, goalProbability, baseGoalProbability, scoringMultiplier, saveProbability,
    missProbability, baseOnTargetProbability: onTarget, cornerProbability, keeperCornerProbability, keeperReboundProbability, caughtSaveProbability: saveProbability - parryProbability,
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
    cornerProbability: 0, keeperCornerProbability: 0, keeperReboundProbability: 0, parryGivenSave: 0, blockerIds: [], blockerPositions: [], blockProbability: 0, blockOutProbability: 0, blockCornerProbability: 0, blockPossessionProbability: 0};
}

// A disguised declaration contains two public possibilities, never a selected
// endpoint. Every keeper preview evaluates the same fair 50/50 mixture.
export function shotModel(state, x = state?.pendingShot?.x, y = state?.pendingShot?.y, keeperPosition) {
  const options = validatedDisguisedOptions(state, state?.pendingShot);
  if (options.length !== 2) return singleShotModel(state, x, y, keeperPosition);
  const targetModels = options.map(option => singleShotModel({...state, pendingShot: {...state.pendingShot, ...option}}, option.x, option.y, keeperPosition));
  const result = {...targetModels[0]};
  for (const key of Object.keys(result)) if (typeof result[key] === 'number') result[key] = (targetModels[0][key] + targetModels[1][key]) / 2;
  result.saveGivenOnTarget = result.onTargetProbability > 0 ? result.saveProbability / result.onTargetProbability : 0;
  result.parryGivenSave = result.saveProbability > 0 ? (result.keeperCornerProbability + result.keeperReboundProbability) / result.saveProbability : 0;
  result.blockerIds = [...new Set(targetModels.flatMap(model => model.blockerIds))];
  result.blockerPositions = result.blockerIds.map(id => targetModels.flatMap(model => model.blockerPositions).find(piece => piece.id === id));
  return {...result, disguised: true, targetOptions: options, targetModels};
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

// Goal-only geometry is shared by threat evaluation and saved declarations.
// It does not generate passes, consume randomness, or introduce new kick rays.
function goalShotTargets(state, carrier) {
  if (!carrier) return [];
  const vectors = carrier.type === 'N' ? KNIGHT : carrier.type === 'P' || carrier.type === 'R' ? STRAIGHTS : carrier.type === 'B' ? DIAGONALS : DIRECTIONS;
  const targets = [];
  for (const [dx, dy] of vectors) {
    if (!dy) continue;
    const path = [{x: carrier.x, y: carrier.y}];
    for (let step = 1; step <= (carrier.type === 'N' ? 1 : BOARD_HEIGHT + 1); step++) {
      const x = carrier.x + dx * step, y = carrier.y + dy * step;
      path.push({x, y});
      if (!inside(x, y)) {
        if (goalAt(x, y) === carrier.team && !friendlyStopsShot(state, carrier, x, y)) targets.push({x, y, goal: carrier.team, path, distance: distance(carrier, {x, y})});
        break;
      }
      if (carrier.type === 'N') break;
      if (pieceAt(state, x, y)?.team === carrier.team) break;
    }
  }
  return targets.sort((a, b) => a.x - b.x);
}

function eligibleDisguisedPair(state, targets) {
  const carrier = state.pieces?.find(piece => piece.id === state.ball?.carrierId);
  if (!carrier || !['Q', 'N'].includes(carrier.type) || ['penalty', 'throwIn', 'goalKick'].includes(state.restart?.type)
      || state.restart?.indirect || currentBoxKnights(state, carrier).length) return [];
  const options = targets.filter(target => target.goal === carrier.team && !target.offside).sort((a, b) => a.x - b.x);
  return options.length === 2 ? options : [];
}

export function disguisedShotTargets(state) {
  if (!state || !['kick', 'kickoff', 'keeperRelease'].includes(state.phase)) return [];
  return eligibleDisguisedPair(state, legalKicks(state));
}

function validatedDisguisedOptions(state, shot) {
  if (!shot?.disguised || shot.penalty || !Array.isArray(shot.targetOptions) || shot.targetOptions.length !== 2 || !inside(shot.from?.x, shot.from?.y)) return [];
  const declared = state.pieces?.find(piece => piece.id === shot.shooterId);
  if (!declared || !['Q', 'N'].includes(declared.type)) return [];
  const carrier = {...declared, ...shot.from};
  const snapshot = {...state, pieces: state.pieces.map(piece => piece.id === carrier.id ? carrier : piece)};
  const legal = goalShotTargets(snapshot, carrier);
  const options = shot.targetOptions.map(option => legal.find(target => target.x === option?.x && target.y === option?.y));
  if (options.some(option => !option) || options[0].x === options[1].x && options[0].y === options[1].y) return [];
  if (!options.some(option => option.x === shot.x && option.y === shot.y)) return [];
  // Rebuild paths and distance from the immutable origin, never saved labels.
  return options.sort((a, b) => a.x - b.x).map(({x, y, path, distance}) => ({x, y, path, distance}));
}

function kickingChoices(state) {
  const kicks = legalKicks(state), pair = eligibleDisguisedPair(state, kicks);
  return pair.length === 2 ? [...kicks, {...pair[0], disguise: true, targetOptions: pair}] : kicks;
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

function resolveShot(next, {roll, targetRoll, keeperMove, landing} = {}) {
  canonicalizePendingShot(next);
  const declaration = next.pendingShot;
  if (!declaration || next.phase !== 'keeperReact') throw new Error('There is no shot awaiting a goalkeeper reaction.');
  resetPace(next);
  const targetOptions = validatedDisguisedOptions(next, declaration);
  const combinedProbability = targetOptions.length === 2 ? shotChance(next) : null;
  // Delaying the target draw until this point means no stored secret, seed
  // inspection, preview or keeper policy can reveal the eventual destination.
  const chosenTargetIndex = targetOptions.length === 2 ? (nextRoll(next, targetRoll) < 0.5 ? 0 : 1) : null;
  const shot = chosenTargetIndex === null ? declaration : {...declaration, ...targetOptions[chosenTargetIndex]};
  next.looseBallKickOrigin = null;
  const keeper = next.pieces.find(p => p.type === 'K' && p.team === shot.defendingTeam);
  const details = singleShotModel({...next, pendingShot: shot}, shot.x, shot.y), probability = details.probability;
  const outcomeRoll = nextRoll(next, roll);
  const keeperCornerEnd = probability + details.keeperCornerProbability;
  const keeperReboundEnd = keeperCornerEnd + details.keeperReboundProbability;
  const caughtEnd = probability + details.saveProbability;
  const wideEnd = 1 - details.blockProbability;
  const blockOutEnd = 1 - details.blockPossessionProbability;
  const outcome = outcomeRoll < probability ? 'goal' : outcomeRoll < keeperCornerEnd ? 'keeperCorner'
    : outcomeRoll < keeperReboundEnd ? 'keeperRebound' : outcomeRoll < caughtEnd ? 'saved'
      : outcomeRoll < wideEnd ? 'wide' : outcomeRoll < blockOutEnd ? 'blockOut' : 'blocked';
  const common = {pieceId: shot.shooterId, shooterId: shot.shooterId, shootingTeam: shot.shootingTeam, from: shot.from, goalTarget: {x: shot.x, y: shot.y}, probability, accuracy: probability, roll: outcomeRoll, shotModel: details, shotPath: shot.path,
    ...(chosenTargetIndex === null ? {} : {disguised: true, targetOptions, chosenTargetIndex, targetProbability: 0.5, combinedProbability}), ...(keeperMove ? {keeperMove} : {})};
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
  } else if (outcome === 'keeperRebound') {
    const targets = keeperReboundTargets(next, shot);
    if (!targets.length) throw new Error('A goalkeeper rebound requires an empty landing square near the box.');
    const reboundRoll = nextRoll(next);
    const destination = landingOverride(landing) || targets[Math.floor(reboundRoll * targets.length)];
    if (!targets.some(target => target.x === destination.x && target.y === destination.y)) {
      throw new Error('A rebound landing must be an empty square near the defending box, outside the goal mouth.');
    }
    const parryPoint = keeper ? {x: keeper.x, y: keeper.y} : details.closestPoint;
    const path = [shot.from, parryPoint, destination].filter((point, index, points) => !index || point.x !== points[index - 1].x || point.y !== points[index - 1].y);
    next.ball = {...destination, carrierId: null}; next.attack = shot.shootingTeam; next.restart = null;
    next.releaseReason = null;
    // A save cannot put an offside attacker back onside. The loose ball is
    // contested through the normal positioning phases with the old snapshot.
    beginPosition(next); next.turn++;
    next.lastAction = {...common, type: 'save', team: shot.defendingTeam, keeperId: keeper?.id,
      to: {...destination}, path, outcome: 'loose', keeperRebound: true,
      reboundLanding: {...destination}, reboundRoll};
    addLog(next, `${title(shot.defendingTeam)} goalkeeper parries the ball loose at ${square(destination.x, destination.y)}. Play continues; the shot-time offside flags still apply.`);
  } else if (outcome === 'keeperCorner' || outcome === 'saved') {
    if (outcome === 'keeperCorner') {
      const endY = shot.scoringTeam === 'white' ? -1 : BOARD_HEIGHT;
      const restart = restartForExit(next, shot.from, {x: shot.x, y: endY}, shot.defendingTeam, {cornerTargetX: shot.x});
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
    if (sameTeamSave && !teammateBackPass) completeAttackingRound(next, next);
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
    // A reflex body block, like a keeper save, retains the kick-time snapshot.
    // A boundary restart or the defender's next deliberate play clears it.
    if (outcome === 'blockOut') {
      const restart = restartForExit(next, shot.from, {x: shot.x, y: shot.y}, blocker.team, {cornerTargetX: shot.x});
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

export function applyMove(state, pieceId, x, y, {freePawn = false, roll, targetRoll, landing} = {}) {
  const move = legalMoves(state, pieceId, {freePawn}).find(candidate => candidate.x === x && candidate.y === y);
  if (!move) throw new Error('That is not a legal move.');
  const next = copy(state), piece = next.pieces.find(p => p.id === pieceId), from = {x: piece.x, y: piece.y};
  next.ballProgress = progressFor(state);
  if (state.phase !== 'keeperReact' && flagged(state, piece) && (move.type === 'tackle' || (!state.ball.carrierId && state.ball.x === x && state.ball.y === y))) {
    piece.x = x; piece.y = y;
    return callOffside(next, piece, {pieceId, from, intendedTo: {x, y}});
  }
  const kickOrigin = looseKickOrigin(state);
  const selfPassCollection = !state.ball.carrierId && state.ball.x === x && state.ball.y === y
    && kickOrigin?.pieceId === piece.id && kickOrigin.team === piece.team;
  const ordinaryDribble = !state.restart && state.phase === 'attackMove'
    && (attackingCarrier(state, piece) || selfPassCollection);
  if (ordinaryDribble) {
    paceHandoff(next, piece.id);
    if (next.paceControl.dribbleRounds >= PACE_RULE.maxDribbleRounds) {
      next.turn++;
      return paceFreeKick(next, piece.team, {x: state.ball.x, y: state.ball.y}, 'dribbleLimit',
        {pieceId, rounds: next.paceControl.dribbleRounds + 1},
        {type: 'move', team: piece.team, pieceId, from, to: {x, y}, path: [from, {x, y}], attempted: true,
          ...(selfPassCollection ? {collection: true, selfPassCollection: true} : {})});
    }
    next.paceControl.dribbledThisRound = true;
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
    return resolveShot(next, {roll, targetRoll, landing, keeperMove: {pieceId, from, to: {x, y}}});
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
  if (tackleSuccess || collection || wasCarrier) next.ball = {x, y, carrierId: piece.id};
  next.looseBallKickOrigin = tackleSuccess || collection || wasCarrier ? null : kickOrigin;
  const turnover = (tackleSuccess || collection) && piece.team !== previousAttack;
  if ((tackleSuccess || collection || wasCarrier) && state.offside && piece.team !== state.offside.team) next.offside = null;
  if (turnover) {
    next.attack = piece.team;
    beginPosition(next);
    resetProgress(next);
    resetPace(next);
    next.turn++;
  } else {
    if (collection && !selfPassCollection && !state.restart) paceHandoff(next, piece.id);
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
  if (!turnover && !state.restart && state.phase === 'defendMove' && next.phase === 'attackMove' && !next.ball.carrierId) completeAttackingRound(next, state);
  return next;
}

export function skipMove(state, {roll, targetRoll, landing} = {}) {
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
    return resolveShot(next, {roll, targetRoll, landing});
  }
  if (!positionalTurn(state)) {
    if (['kick', 'keeperRelease'].includes(state.phase) && !state.ball.carrierId) {
      const next = copy(state);
      next.ballProgress = progressFor(state);
      beginPosition(next); next.turn++;
      next.lastAction = {type: 'skip', team: state.attack, phase: state.phase};
      addLog(next, 'The ball is loose. A new positioning round begins.');
      completeAttackingRound(next, state);
      return next;
    }
    throw new Error('Only a positioning turn or goalkeeper reaction can be ended.');
  }
  const next = copy(state);
  next.ballProgress = progressFor(state);
  next.lastAction = {type: 'skip', team: currentTeam(state), phase: state.phase};
  addLog(next, `${title(currentTeam(state))} ends its positioning turn.`);
  const completedLooseRound = advancePosition(next, state.phase);
  if (completedLooseRound) completeAttackingRound(next, state);
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

export function applyKick(state, x, y, {roll, landing, passRun = false, disguise = false} = {}) {
  const kick = legalKicks(state).find(candidate => candidate.x === x && candidate.y === y);
  if (!kick) throw new Error('That is not a legal kick.');
  const options = disguise ? disguisedShotTargets(state) : [];
  if (disguise && (options.length !== 2 || !options.some(option => option.x === x && option.y === y))) throw new Error('A disguised shot needs two legal opponent-goal targets for the queen or knight.');
  const next = copy(state), carrier = state.pieces.find(p => p.id === state.ball.carrierId), from = {x: carrier.x, y: carrier.y};
  next.ballProgress = progressFor(state);
  next.paceControl = paceFor(state);
  const restart = state.restart;
  next.offside = offsideSnapshot(state, carrier, restart); next.restart = null;
  next.looseBallKickOrigin = null;
  const loft = kick.lofted ? {lofted: true, bypassedPieceId: kick.bypassedPieceId, bypassedSquare: {...kick.bypassedSquare}} : {};
  const boxOffender = boxKnightOffenders(next, next.offside)[0];
  if (boxOffender) return callOffside(next, boxOffender, {pieceId: carrier.id, from, intendedTo: {x, y}, path: kick.path, distance: kick.distance, accuracy: kick.accuracy, ...loft, offsideReason: 'boxKnight', offsidePieceId: boxOffender.id});
  if (kick.goal) {
    resetPace(next);
    const declaration = disguise ? options[0] : kick;
    const targetOptions = options.map(({x, y, path, distance}) => ({x, y, path, distance}));
    next.pendingShot = {x: declaration.x, y: declaration.y, shooterId: carrier.id, shooterType: carrier.type, shootingTeam: carrier.team, scoringTeam: kick.goal, defendingTeam: other(kick.goal), from, path: declaration.path, distance: declaration.distance,
      ...(disguise ? {disguised: true, targetOptions} : {}), ...(restart?.type === 'penalty' ? {penalty: true} : {})};
    next.phase = 'keeperReact'; next.releaseReason = null;
    if (kick.goal === carrier.team) resetProgress(next);
    else if (restart || state.phase === 'kickoff' || progressFor(state).excludeRelease) next.ballProgress = {...freshProgress(next), excludeRelease: true};
    const details = shotModel(next, x, y);
    next.lastAction = {type: 'shotAttempt', team: carrier.team, pieceId: carrier.id, from, to: {x: declaration.x, y: declaration.y}, path: declaration.path, goalTarget: {x: declaration.x, y: declaration.y},
      ...(disguise ? {disguised: true, targetOptions, targetProbability: 0.5} : {}), probability: details.probability, shotModel: details, outcome: 'pending'};
    const keeper = state.pieces.find(piece => piece.type === 'K' && piece.team === other(kick.goal));
    const reaction = keeper && inOwnBox(keeper.team, keeper.x, keeper.y)
      ? `${title(other(kick.goal))} may move its goalkeeper or hold before the shot resolves.`
      : `${title(other(kick.goal))} has no goalkeeper reaction while its king is outside its own box. Resolve the shot.`;
    addLog(next, `${title(carrier.team)} ${NAMES[carrier.type]} ${disguise ? `disguises a shot toward ${targetOptions.map(option => FILE_LABELS[option.x]).join(' or ')} (50/50; the target is chosen after the goalkeeper reacts)` : `shoots toward ${FILE_LABELS[x]}`}! ${reaction}`);
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
  if (receiver?.team === carrier.team) paceHandoff(next, receiver.id);
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
  const carrier = state.pieces.find(piece => piece.id === state.ball.carrierId);
  const preview = kick.disguise && carrier ? {...state, pendingShot: {x: kick.x, y: kick.y, from: {x: carrier.x, y: carrier.y},
    shooterId: carrier.id, shooterType: carrier.type, shootingTeam: carrier.team, scoringTeam: kick.goal,
    defendingTeam: other(kick.goal), disguised: true, targetOptions: kick.targetOptions}} : state;
  let probability = shotChance(preview, kick.x, kick.y);
  if (!keeper || !inOwnBox(keeper.team, keeper.x, keeper.y)) return probability;
  for (const [dx, dy] of DIRECTIONS) {
    const position = {x: keeper.x + dx, y: keeper.y + dy};
    if (allowedSquare(keeper, position.x, position.y) && !pieceAt(state, position.x, position.y)) probability = Math.min(probability, shotChance(preview, kick.x, kick.y, position));
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
    - risk * (canDribble ? 45 : 460) + wideAttackValue(projected, receiver) * 0.6;
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
  if (forbiddenPaceCarry(state, piece, move)) return -16000;
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
      value += (wideCrossingSupport(projected, carrier).best - wideCrossingSupport(state, originalCarrier).best) * 240;
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
    for (const kick of kickingChoices(state)) {
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
    return best ? {type: 'kick', x: best.x, y: best.y, ...(best.disguise ? {disguise: true} : {}), ...(receiver?.team === team && receiver.type !== 'K' ? {passRun: true} : {})} : {type: 'skip'};
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
  const shots = goalShotTargets(state, carrier), pair = eligibleDisguisedPair(state, shots);
  let best = shots.reduce((value, shot) => Math.max(value, react ? reactedShotChance(state, shot) : shotChance(state, shot.x, shot.y)), 0);
  if (pair.length === 2) {
    const choice = {...pair[0], disguise: true, targetOptions: pair};
    // Without a keeper reaction, a fair mixture cannot exceed its best single
    // target. The reaction-aware value captures the actual information gain.
    if (react) best = Math.max(best, reactedShotChance(state, choice));
  }
  return best;
}

// A positioning reply has one ordinary challenge and one shared pawn/king
// reposition. The latter cannot tackle, but the same piece may use it to set
// up its ordinary tackle. Attacking moves face the defender's fresh budgets;
// defensive moves must respect the budgets already spent in this reply.
function tacticalChallengeBudget(state, carrier) {
  if (!carrier || state.restart) return null;
  if (state.phase === 'attackMove' || state.phase === 'passRun') return freshBudget();
  if (state.phase === 'defendMove' && currentTeam(state) !== carrier.team) return budgetFor(state);
  return null;
}

function tacticalTackleLanding(state, piece, carrier) {
  if (!canTackle(state, piece, carrier) || flagged(state, piece)) return false;
  return DIRECTIONS.some(([dx, dy]) => {
    const x = carrier.x + dx, y = carrier.y + dy;
    const occupant = pieceAt(state, x, y);
    // A reposition vacates the piece's original square. Its old occupancy may
    // therefore be ignored, just as its actual square is legal for a tackle.
    return distance(piece, {x, y}) <= 10 && allowedSquare(piece, x, y) && (!occupant || occupant.id === piece.id);
  });
}

function tacticalTackleSetup(state, piece, move, carrier, budget = tacticalChallengeBudget(state, carrier)) {
  if (!budget || budget.normalUsed || budget.pawnUsed || !['P', 'K'].includes(piece.type)
    || piece.team === carrier.team || flagged(state, piece) || distance(piece, carrier) > 2) return false;
  const dx = Math.abs(move.x - piece.x), dy = Math.abs(move.y - piece.y);
  if (piece.type === 'P' ? dx + dy !== 1 : Math.max(dx, dy) !== 1) return false;
  const moved = {...piece, x: move.x, y: move.y};
  if (!canTackle(state, moved, carrier) || pieceAt(state, move.x, move.y) || !allowedSquare(piece, move.x, move.y)) return false;
  return tacticalTackleLanding(state, moved, carrier);
}

function tacticalTackleRisk(state, carrier) {
  const budget = tacticalChallengeBudget(state, carrier);
  if (!budget || budget.normalUsed) return 0;
  for (const piece of state.pieces) {
    if (piece.team === carrier.team || flagged(state, piece)) continue;
    if (tacticalTackleLanding(state, piece, carrier)) return (carrier.type === 'N' ? 0.5 : 1) * (state.foulsEnabled ? FOUL_RULE.clean : 1);
    // One bonus step plus one adjacent tackle cannot reach beyond two squares.
    if (!budget.pawnUsed && ['P', 'K'].includes(piece.type) && distance(piece, carrier) <= 2) {
      const vectors = piece.type === 'P' ? STRAIGHTS : DIRECTIONS;
      if (vectors.some(([dx, dy]) => tacticalTackleSetup(state, piece, {x: piece.x + dx, y: piece.y + dy}, carrier, budget))) {
        return (carrier.type === 'N' ? 0.5 : 1) * (state.foulsEnabled ? FOUL_RULE.clean : 1);
      }
    }
  }
  return 0;
}

// Off-ball box runs provide receiving chances alongside direct carrying entry.
// Merely rewarding a nearby teammate cannot distinguish a useful cut-back
// receiver from a crowd of pieces that the carrier cannot actually reach.
// These are public, immediate receiving opportunities, not assumed future goals.
const tacticalOutletCache = new WeakMap();
function tacticalOutlets(state, carrier) {
  const cached = tacticalOutletCache.get(state);
  if (cached) return cached;
  if (!carrier) return {best: 0, second: 0};
  const chances = [];
  for (const receiver of state.pieces) {
    if (receiver.team !== carrier.team || receiver.id === carrier.id || receiver.type === 'K'
      || !onsideAtKick(state, receiver, carrier) || !passLane(state, carrier, receiver)) continue;
    const received = receivingState(state, receiver);
    const accuracy = state.restart?.type === 'throwIn' ? throwAccuracy(distance(carrier, receiver)) : passAccuracy(distance(carrier, receiver));
    // The receiver gets its positioning turn, but has to survive a defensive
    // reply before shooting. Exposed receivers are substantially less useful.
    const chance = tacticalShots(received, carrier.team, true) * accuracy
      * (1 - tacticalTackleRisk(received, receiver) * 0.8);
    if (chance > 0) chances.push(chance);
  }
  chances.sort((a, b) => b - a);
  const result = {best: chances[0] || 0, second: chances[1] || 0};
  tacticalOutletCache.set(state, result);
  return result;
}

// A wide attack needs a real central delivery, not merely a teammate close to
// the touchline. Only onside receivers reachable by this carrier's own passing
// pattern count, and their finish includes accuracy, keeper reaction and the
// defensive reply. This is a soft preference: a useful direct shot can still
// justify an isolated wing position.
const crossingSupportCache = new WeakMap();
function wideCrossingSupport(state, carrier) {
  if (!carrier || carrier.type === 'K' || Math.abs(carrier.x - BOARD_CENTER_X) < 3.5
    || goalDistance(carrier.team, carrier.y) > 8) return {wide: false, best: 0, second: 0, direct: 0};
  const cached = crossingSupportCache.get(state);
  if (cached) return cached;
  const chances = [];
  for (const receiver of state.pieces) {
    if (receiver.team !== carrier.team || receiver.id === carrier.id || receiver.type === 'K'
      || Math.abs(receiver.x - BOARD_CENTER_X) > 2.5 || goalDistance(receiver.team, receiver.y) > 7
      || !allowedSquare(receiver, receiver.x, receiver.y) || !onsideAtKick(state, receiver, carrier)
      || !passLane(state, carrier, receiver)) continue;
    const received = receivingState(state, receiver);
    const accuracy = state.restart?.type === 'throwIn' ? throwAccuracy(distance(carrier, receiver)) : passAccuracy(distance(carrier, receiver));
    const chance = tacticalShots(received, carrier.team, true) * accuracy
      * (1 - tacticalTackleRisk(received, receiver) * 0.8);
    if (chance > 0) chances.push(chance);
  }
  chances.sort((a, b) => b - a);
  const result = {wide: true, best: chances[0] || 0, second: chances[1] || 0, direct: tacticalShots(state, carrier.team, true)};
  crossingSupportCache.set(state, result);
  return result;
}

function wideAttackValue(state, carrier) {
  const support = wideCrossingSupport(state, carrier);
  if (!support.wide) return 0;
  const isolation = 1 - Math.min(1, Math.max(support.best, support.direct) / 0.2);
  return support.best * 160 + support.second * 35
    - isolation * (18 + Math.max(0, 6 - goalDistance(carrier.team, carrier.y)) * 5);
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

// BEGIN GENERATED RL BOARD FEATURES — source: scripts/rl-features.mjs
/**
 * Small public-board features for the self-play value learner.
 *
 * These describe strategic potential with a fresh ordinary move and one shared
 * pawn/keeper bonus for either side. They deliberately do not toggle when an
 * action budget is spent. The engine's phase-aware tactical risk remains the
 * authority for an actual challenge. No feature consults the hidden RNG.
 *
 * Keep these two functions self-contained: the trainer copies them into the
 * deployed evaluator, so training and browser inference use identical math.
 */
export function rlBoardGeometry(state) {
  const rlWidth = 14, rlHeight = 17, rlMiddle = 8;
  const rlPieces = state.pieces || [];
  const rlBoard = Array(rlWidth * rlHeight).fill(null);
  for (const rlPiece of rlPieces) rlBoard[rlPiece.y * rlWidth + rlPiece.x] = rlPiece;
  const rlStraight = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const rlDirections = [...rlStraight, [1, 1], [1, -1], [-1, 1], [-1, -1]];
  const rlInside = (rlX, rlY) => Number.isInteger(rlX) && Number.isInteger(rlY) && rlX >= 0 && rlX < rlWidth && rlY >= 0 && rlY < rlHeight;
  const rlBox = (rlX, rlY) => rlX >= 4 && rlX <= 9 && (rlY < 3 || rlY >= 14);
  const rlOwnBox = (rlPiece, rlX, rlY) => rlBox(rlX, rlY) && (rlPiece.team === 'white' ? rlY >= 14 : rlY < 3);
  const rlAllowed = (rlPiece, rlX, rlY) => rlInside(rlX, rlY)
    && (!(rlX >= 5 && rlX <= 8 && (rlY === 0 || rlY === 16)) || rlPiece.type === 'K' && rlOwnBox(rlPiece, rlX, rlY))
    && (rlPiece.type !== 'K' || !rlBox(rlX, rlY) || rlOwnBox(rlPiece, rlX, rlY));
  const rlAt = (rlX, rlY) => rlInside(rlX, rlY) ? rlBoard[rlY * rlWidth + rlX] : null;
  const rlFlagged = rlPiece => state.offside?.team === rlPiece.team && (state.offside.flaggedIds || []).includes(rlPiece.id);
  const rlDistance = (rlA, rlB) => Math.max(Math.abs(rlA.x - rlB.x), Math.abs(rlA.y - rlB.y));
  const rlCarrier = rlPieces.find(rlPiece => rlPiece.id === state.ball?.carrierId);
  const rlDefenceLine = {};
  for (const rlTeam of ['white', 'black']) {
    const rlRanks = rlPieces.filter(rlPiece => rlPiece.team !== rlTeam).map(rlPiece => rlPiece.y)
      .sort((rlA, rlB) => rlTeam === 'white' ? rlA - rlB : rlB - rlA);
    rlDefenceLine[rlTeam] = rlRanks[1] ?? (rlTeam === 'white' ? rlHeight : -1);
  }
  function rlOnside(rlPiece, rlFrom = rlCarrier, rlRestart = state.restart) {
    if (!rlFrom || rlPiece.id === rlFrom.id || ['goalKick', 'corner', 'throwIn'].includes(rlRestart?.type)) return true;
    return rlPiece.team === 'white'
      ? rlPiece.y >= rlMiddle || rlPiece.y >= rlFrom.y || rlPiece.y >= rlDefenceLine.white
      : rlPiece.y <= rlMiddle || rlPiece.y <= rlFrom.y || rlPiece.y <= rlDefenceLine.black;
  }
  function rlShape(rlPiece, rlDx, rlDy, rlPassing = false, rlThrowing = false) {
    if (!rlDx && !rlDy) return false;
    if (rlThrowing) return !rlDx || !rlDy || Math.abs(rlDx) === Math.abs(rlDy);
    if (rlPiece.type === 'N') return Math.abs(rlDx) * Math.abs(rlDy) === 2;
    if (rlPiece.type === 'P') return (!rlDx || !rlDy) && (rlPassing || Math.abs(rlDx) + Math.abs(rlDy) === 1);
    if (rlPiece.type === 'K' && !rlPassing) return Math.max(Math.abs(rlDx), Math.abs(rlDy)) === 1;
    const rlStraightRay = !rlDx || !rlDy, rlDiagonalRay = Math.abs(rlDx) === Math.abs(rlDy);
    return rlPiece.type === 'R' ? rlStraightRay : rlPiece.type === 'B' ? rlDiagonalRay : rlStraightRay || rlDiagonalRay;
  }
  function rlCanMove(rlPiece, rlTarget, {carrying = rlPiece.id === rlCarrier?.id, passRun = false} = {}) {
    const rlDx = rlTarget.x - rlPiece.x, rlDy = rlTarget.y - rlPiece.y;
    if (!rlAllowed(rlPiece, rlTarget.x, rlTarget.y) || rlAt(rlTarget.x, rlTarget.y) || !rlShape(rlPiece, rlDx, rlDy)) return false;
    const rlJumping = rlPiece.type === 'N', rlSteps = rlJumping ? 1 : Math.max(Math.abs(rlDx), Math.abs(rlDy));
    let rlCost = 0, rlPreviousBox = rlBox(rlPiece.x, rlPiece.y);
    for (let rlStep = 1; rlStep <= rlSteps; rlStep++) {
      const rlX = rlPiece.x + (rlJumping ? rlDx : Math.sign(rlDx) * rlStep);
      const rlY = rlPiece.y + (rlJumping ? rlDy : Math.sign(rlDy) * rlStep);
      const rlInBox = rlBox(rlX, rlY);
      if (!rlAllowed(rlPiece, rlX, rlY) || rlAt(rlX, rlY) || passRun && !rlPreviousBox && rlInBox) return false;
      rlCost += rlInBox ? 2 : 1;
      if (rlCost > (carrying ? 8 : 10)) return false;
      rlPreviousBox = rlInBox;
    }
    // A passer cannot bypass the pass-and-run box-entry rule by collecting its
    // own loose pass after the run phase. Teammates may receive normally.
    const rlOrigin = state.looseBallKickOrigin;
    if (!rlCarrier && state.ball?.x === rlTarget.x && state.ball?.y === rlTarget.y && rlInTargetBox(rlTarget)
      && rlOrigin?.pieceId === rlPiece.id && !rlBox(rlOrigin.from?.x ?? rlPiece.x, rlOrigin.from?.y ?? rlPiece.y)) return false;
    return true;
  }
  const rlInTargetBox = rlTarget => rlBox(rlTarget.x, rlTarget.y);
  function rlCanPass(rlFrom, rlTarget, rlRestart = state.restart) {
    const rlDx = rlTarget.x - rlFrom.x, rlDy = rlTarget.y - rlFrom.y;
    const rlThrowing = rlRestart?.type === 'throwIn', rlJumping = rlFrom.type === 'N' && !rlThrowing;
    if (!rlInside(rlTarget.x, rlTarget.y) || !rlShape(rlFrom, rlDx, rlDy, true, rlThrowing)) return false;
    const rlSteps = Math.max(Math.abs(rlDx), Math.abs(rlDy));
    if (rlThrowing && rlSteps > 10) return false;
    if (rlJumping) return true;
    const rlBypass = ['goalKick', 'corner', 'offside', 'stalling', 'timeout', 'freeKick'].includes(rlRestart?.type) ? 1 : 0;
    let rlBlocked = 0;
    for (let rlStep = 1; rlStep < rlSteps; rlStep++) if (rlAt(rlFrom.x + Math.sign(rlDx) * rlStep, rlFrom.y + Math.sign(rlDy) * rlStep) && ++rlBlocked > rlBypass) return false;
    return true;
  }
  function rlDirectControl(rlPiece, rlTarget) {
    const rlDx = rlTarget.x - rlPiece.x, rlDy = rlTarget.y - rlPiece.y, rlReach = Math.max(Math.abs(rlDx), Math.abs(rlDy));
    if (!rlReach || rlReach > 10) return false;
    if (rlPiece.type === 'N') {
      if (Math.abs(rlDx) * Math.abs(rlDy) !== 2) return false;
    } else if (rlPiece.type === 'P') {
      if (Math.abs(rlDx) !== 1 || Math.abs(rlDy) !== 1) return false;
    } else if (rlPiece.type === 'K') {
      if (rlReach !== 1) return false;
    } else {
      if (rlReach > 5 || !rlShape(rlPiece, rlDx, rlDy)) return false;
      for (let rlStep = 1; rlStep < rlReach; rlStep++) {
        const rlX = rlPiece.x + Math.sign(rlDx) * rlStep, rlY = rlPiece.y + Math.sign(rlDy) * rlStep;
        if (!rlAllowed(rlPiece, rlX, rlY) || rlAt(rlX, rlY)) return false;
      }
    }
    return rlDirections.some(([rlX, rlY]) => {
      const rlLanding = {x: rlTarget.x + rlX, y: rlTarget.y + rlY};
      const rlOccupant = rlAt(rlLanding.x, rlLanding.y);
      return rlDistance(rlPiece, rlLanding) <= 10 && rlAllowed(rlPiece, rlLanding.x, rlLanding.y)
        && (!rlOccupant || rlOccupant.id === rlPiece.id);
    });
  }
  function rlControl(rlPiece, rlTarget, {bonus = true} = {}) {
    if (rlFlagged(rlPiece)) return 0;
    if (rlDirectControl(rlPiece, rlTarget)) return 1;
    if (!bonus || !['P', 'K'].includes(rlPiece.type) || rlPiece.id === rlCarrier?.id || rlDistance(rlPiece, rlTarget) > 2) return 0;
    const rlVectors = rlPiece.type === 'P' ? rlStraight : rlDirections;
    for (const [rlDx, rlDy] of rlVectors) {
      const rlMoved = {...rlPiece, x: rlPiece.x + rlDx, y: rlPiece.y + rlDy};
      if (!rlAllowed(rlPiece, rlMoved.x, rlMoved.y) || rlAt(rlMoved.x, rlMoved.y)) continue;
      // Temporarily vacate the origin for the ordinary tackle's landing check.
      rlBoard[rlPiece.y * rlWidth + rlPiece.x] = null;
      const rlControls = rlDirectControl(rlMoved, rlTarget);
      rlBoard[rlPiece.y * rlWidth + rlPiece.x] = rlPiece;
      if (rlControls) return 0.65;
    }
    return 0;
  }
  return {pieces: rlPieces, carrier: rlCarrier, at: rlAt, allowed: rlAllowed, onside: rlOnside,
    canMove: rlCanMove, canPass: rlCanPass, controls: rlControl, flagged: rlFlagged};
}

export function rlBoardFeatures(state, team) {
  const rlGeometry = rlBoardGeometry(state), rlPieces = rlGeometry.pieces;
  const rlClamp = rlValue => Math.max(0, Math.min(1, rlValue));
  const rlRaw = {white: {centerControl: 0, openFiles: 0, defensiveCover: 0, centralReceivers: 0},
    black: {centerControl: 0, openFiles: 0, defensiveCover: 0, centralReceivers: 0}};
  const rlDistance = (rlA, rlB) => Math.max(Math.abs(rlA.x - rlB.x), Math.abs(rlA.y - rlB.y));
  const rlAccuracy = rlLength => Math.max(0.25, 1 - Math.max(0, rlLength - 10) * 0.1);
  const rlProgress = (rlTeam, rlY) => rlTeam === 'white' ? 16 - rlY : rlY;
  for (const rlSide of ['white', 'black']) {
    const rlOwn = rlPieces.filter(rlPiece => rlPiece.team === rlSide);
    let rlCenterWeight = 0;
    for (let rlY = 5; rlY <= 11; rlY++) for (let rlX = 4; rlX <= 9; rlX++) {
      const rlTarget = {x: rlX, y: rlY}, rlWeight = 1 - Math.abs(rlX - 6.5) * 0.12 - Math.abs(rlY - 8) * 0.06;
      let rlBest = 0, rlSecond = 0;
      for (const rlPiece of rlOwn) {
        const rlControl = rlGeometry.flagged(rlPiece) ? 0 : rlPiece.x === rlX && rlPiece.y === rlY ? 0.4 : rlGeometry.controls(rlPiece, rlTarget);
        if (rlControl > rlBest) { rlSecond = rlBest; rlBest = rlControl; } else if (rlControl > rlSecond) rlSecond = rlControl;
      }
      // Max plus a small supporting defender bonus; a crowd cannot farm the
      // feature simply by attacking the same square with many pieces.
      rlRaw[rlSide].centerControl += (rlBest + rlSecond * 0.2) * rlWeight;
      rlCenterWeight += 1.2 * rlWeight;
    }
    rlRaw[rlSide].centerControl /= rlCenterWeight;
    let rlFiles = 0;
    for (const rlPiece of rlOwn) {
      if (!['Q', 'R'].includes(rlPiece.type) || rlGeometry.flagged(rlPiece)) continue;
      const rlForward = rlSide === 'white' ? -1 : 1;
      let rlCost = 0, rlLane = 0;
      for (let rlStep = 1; rlStep <= 10; rlStep++) {
        const rlTarget = {x: rlPiece.x, y: rlPiece.y + rlForward * rlStep};
        if (!rlGeometry.allowed(rlPiece, rlTarget.x, rlTarget.y)) break;
        const rlOccupant = rlGeometry.at(rlTarget.x, rlTarget.y);
        if (rlOccupant) {
          if (rlOccupant.team === rlSide && rlOccupant.type !== 'K' && rlGeometry.onside(rlOccupant, rlPiece, null)) {
            rlLane += 2 * rlAccuracy(rlStep) * (Math.abs(rlOccupant.x - 6.5) <= 2.5 ? 1 : 0.5);
          }
          break;
        }
        rlCost += rlTarget.x >= 4 && rlTarget.x <= 9 && (rlTarget.y < 3 || rlTarget.y >= 14) ? 2 : 1;
        if (rlCost > (rlPiece.id === rlGeometry.carrier?.id ? 8 : 10)) break;
        const rlCentrality = 0.55 + (1 - Math.abs(rlPiece.x - 6.5) / 6.5) * 0.45;
        rlLane += (0.5 + rlProgress(rlSide, rlTarget.y) / 16 * 0.5) * rlCentrality;
      }
      rlFiles += rlClamp(rlLane / 10);
    }
    // At most the three original major pieces can contribute a full file.
    rlRaw[rlSide].openFiles = rlClamp(rlFiles / 3);
    const rlBall = state.ball || {x: 6.5, y: 8};
    const rlBallHome = rlProgress(rlSide, rlBall.y);
    let rlCover = 0;
    for (const rlPiece of rlOwn) {
      if (rlPiece.type === 'K' || rlGeometry.flagged(rlPiece) || !rlGeometry.allowed(rlPiece, rlPiece.x, rlPiece.y)) continue;
      const rlHome = rlProgress(rlSide, rlPiece.y);
      if (rlHome >= rlBallHome || rlDistance(rlPiece, rlBall) > 7 || rlBallHome <= 0) continue;
      const rlAxis = 6.5 + (rlBall.x - 6.5) * rlHome / rlBallHome;
      const rlOffset = Math.abs(rlPiece.x - rlAxis);
      if (rlOffset <= 3) rlCover += 1 - rlOffset / 6;
    }
    rlRaw[rlSide].defensiveCover = rlClamp(rlCover / 3);
  }
  const rlCarrier = rlGeometry.carrier;
  if (rlCarrier) {
    const rlSide = rlCarrier.team, rlOpponents = rlPieces.filter(rlPiece => rlPiece.team !== rlSide);
    const rlReceiving = [];
    for (const rlReceiver of rlPieces) {
      if (rlReceiver.team !== rlSide || rlReceiver.id === rlCarrier.id || rlReceiver.type === 'K'
        || Math.abs(rlReceiver.x - 6.5) > 2.5 || rlProgress(rlSide, rlReceiver.y) < 8
        || !rlGeometry.allowed(rlReceiver, rlReceiver.x, rlReceiver.y) || rlGeometry.flagged(rlReceiver)
        || !rlGeometry.onside(rlReceiver, rlCarrier) || !rlGeometry.canPass(rlCarrier, rlReceiver)) continue;
      let rlRisk = 0;
      for (const rlDefender of rlOpponents) rlRisk = Math.max(rlRisk, rlGeometry.controls(rlDefender, rlReceiver));
      if (rlReceiver.type === 'N') rlRisk *= 0.5;
      const rlLength = rlDistance(rlCarrier, rlReceiver);
      const rlAccuracyValue = state.restart?.type === 'throwIn'
        ? Math.max(0.25, 1 - Math.max(0, rlLength - 5) * 0.15) : rlAccuracy(rlLength);
      rlReceiving.push(rlAccuracyValue * (1 - rlRisk * 0.75) * (0.5 + rlProgress(rlSide, rlReceiver.y) / 32));
    }
    rlReceiving.sort((rlA, rlB) => rlB - rlA);
    rlRaw[rlSide].centralReceivers = rlClamp(((rlReceiving[0] || 0) + (rlReceiving[1] || 0) * 0.5) / 1.5);
  }
  const rlSign = team === 'black' ? -1 : 1;
  return Object.fromEntries(Object.keys(rlRaw.white).map(rlName => [rlName,
    (rlRaw.white[rlName] - rlRaw.black[rlName]) * rlSign || 0]));
}

// END GENERATED RL BOARD FEATURES

// BEGIN GENERATED RL CONTEXT FEATURES — source: scripts/rl-context-features.mjs
// Public state features for the second, contextual TD value family. The first
// seven retain the original feature meaning. All values are in White's frame;
// Black receives their exact negative. baseVector, when supplied, is always the
// original seven-component WHITE vector, regardless of requested team.
// The browser embeds this file after removing only the import above.
export const RL_CONTEXT_FEATURE_NAMES = Object.freeze([
  'possession', 'ballProgress', 'material', 'centerControl', 'openFiles', 'defensiveCover', 'centralReceivers',
  'actor', 'ordinaryMoveTempo', 'bonusMoveTempo', 'dribbleTempo', 'kickNowPossession',
  'carrierDepthSquared', 'carrierCentrality', 'carrierGoalOpening', 'carrierInGoalBox',
  'directTackleExposure', 'bonusTackleExposure', 'safePassOptions', 'safeForwardOptions',
  'centralPassQuality', 'finishingPassQuality', 'nearbyDefenderPressure', 'keeperDisplacement',
  'dribbleLimitPressure', 'ownHalfStallPressure', 'advancedCenterControl', 'advancedOpenFiles'
]);

export function rlContextValueFeatures(state, team = 'white', baseVector = null) {
  const clamp01 = value => Math.max(0, Math.min(1, Number(value) || 0));
  const sign = side => side === 'white' ? 1 : side === 'black' ? -1 : 0;
  const distance = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
  const progress = piece => clamp01((piece.team === 'white' ? 16 - piece.y : piece.y) / 16);
  const geometry = rlBoardGeometry(state), pieces = geometry.pieces, carrier = geometry.carrier;
  const owner = carrier?.team || state.restart?.team, possession = sign(owner);
  let original;
  if (baseVector) {
    if (baseVector.length !== 7 || !Array.from(baseVector).every(value => Number.isFinite(value) && Math.abs(value) <= 1)) {
      throw new TypeError('Context baseVector must contain seven finite normalized White features.');
    }
    original = Array.from(baseVector);
  } else {
    const material = {Q: 150, R: 105, B: 100, N: 90, P: 55, K: 0};
    const board = rlBoardFeatures(state, 'white');
    original = [possession, carrier ? possession * progress(carrier) : 0,
      Math.max(-1, Math.min(1, pieces.reduce((sum, piece) => sum + sign(piece.team) * (material[piece.type] || 0), 0) / 905)),
      board.centerControl, board.openFiles, board.defensiveCover, board.centralReceivers];
  }
  const phase = state.phase, positional = phase === 'attackMove' || phase === 'defendMove';
  const actorTeam = phase === 'finished' ? null : phase === 'keeperReact'
    ? state.pendingShot?.defendingTeam || (state.attack === 'white' ? 'black' : 'white')
    : phase === 'defendMove' ? (state.attack === 'white' ? 'black' : 'white') : state.attack;
  const actor = sign(actorTeam), budget = state.positionBudget || {};
  const normalUsed = !!budget.normalUsed, pawnUsed = !!budget.pawnUsed;
  const dribbleUsed = budget.dribbleUsed === undefined ? normalUsed : !!budget.dribbleUsed;
  const ordinaryTempo = positional && !normalUsed ? actor : 0;
  const bonusTempo = positional && !pawnUsed ? actor : 0;
  const dribbleTempo = phase === 'attackMove' && !state.restart && carrier?.team === state.attack && !dribbleUsed ? actor : 0;
  const kickNow = ['kick', 'kickoff', 'keeperRelease'].includes(phase) ? possession : 0;
  let depthSquared = 0, centrality = 0, opening = 0, inGoalBox = 0, directExposure = 0, bonusExposure = 0;
  let safeOptions = 0, forwardOptions = 0, centralQuality = 0, finishingQuality = 0, pressure = 0, keeperDisplacement = 0;
  let dribblePressure = 0, stallPressure = 0;
  if (carrier) {
    const side = carrier.team, ownSign = sign(side), opponents = pieces.filter(piece => piece.team !== side);
    const depth = progress(carrier), goalY = side === 'white' ? -0.5 : 16.5;
    const angleAt = piece => {
      const perpendicular = Math.abs(goalY - piece.y);
      return clamp01(Math.atan2(4 * perpendicular, perpendicular * perpendicular + (4.5 - piece.x) * (8.5 - piece.x)) / Math.PI);
    };
    depthSquared = ownSign * depth * depth;
    centrality = ownSign * clamp01(1 - Math.abs(carrier.x - 6.5) / 6.5);
    opening = ownSign * angleAt(carrier);
    inGoalBox = carrier.x >= 4 && carrier.x <= 9 && (side === 'white' ? carrier.y < 3 : carrier.y >= 14) ? ownSign : 0;
    // A fresh defensive response follows attack positioning/pass-and-run;
    // during a defensive response, honor the actual remaining action budget.
    const challenge = !state.restart && (phase === 'attackMove' || phase === 'passRun' || phase === 'defendMove' && !normalUsed);
    if (challenge) {
      const allowBonus = phase !== 'defendMove' || !pawnUsed;
      let direct = false, setup = false;
      for (const piece of opponents) {
        direct ||= geometry.controls(piece, carrier, {bonus: false}) > 0;
        if (allowBonus && ['P', 'K'].includes(piece.type)) setup ||= geometry.controls(piece, carrier) > 0;
      }
      const clean = (state.foulsEnabled ? 0.9 : 1) * (carrier.type === 'N' ? 0.5 : 1);
      directExposure = ownSign * (direct ? clean : 0);
      bonusExposure = ownSign * (!direct && setup ? clean : 0);
    }
    // Receiving potential uses a fresh subsequent challenge, matching the
    // strategic seven-feature family, rather than the current spent budgets.
    const accuracy = length => state.restart?.type === 'throwIn'
      ? Math.max(0.25, 1 - Math.max(0, length - 5) * 0.15)
      : Math.max(0.25, 1 - Math.max(0, length - 10) * 0.1);
    for (const receiver of pieces) {
      if (receiver.team !== side || receiver.id === carrier.id || receiver.type === 'K' || geometry.flagged(receiver)
        || !geometry.onside(receiver, carrier) || !geometry.canPass(carrier, receiver)) continue;
      let risk = 0;
      for (const defender of opponents) risk = Math.max(risk, geometry.controls(defender, receiver));
      if (receiver.type === 'N') risk *= 0.5;
      const quality = accuracy(distance(carrier, receiver)) * (1 - risk * 0.9);
      safeOptions += quality;
      if (progress(receiver) > depth) forwardOptions += quality;
      if (Math.abs(receiver.x - 6.5) <= 2.5 && progress(receiver) >= 0.5) centralQuality = Math.max(centralQuality, quality * progress(receiver));
      finishingQuality = Math.max(finishingQuality, quality * angleAt(receiver) * progress(receiver));
    }
    safeOptions = ownSign * clamp01(safeOptions / 3);
    forwardOptions = ownSign * clamp01(forwardOptions / 3);
    centralQuality *= ownSign; finishingQuality *= ownSign;
    const nearest = opponents.filter(piece => !geometry.flagged(piece)).reduce((minimum, piece) => Math.min(minimum, distance(carrier, piece)), 5);
    pressure = ownSign * clamp01(1 - nearest / 5);
    const keeper = opponents.find(piece => piece.type === 'K');
    keeperDisplacement = ownSign * (keeper ? clamp01(Math.hypot(keeper.x - 6.5, keeper.y - (side === 'white' ? 0 : 16)) / 8) : 1);
    const pace = state.paceControl;
    if (!state.restart && phase !== 'kickoff' && pace?.team === side && pace.carrierId === carrier.id) {
      dribblePressure = ownSign * clamp01((Number(pace.dribbleRounds) + (pace.dribbledThisRound ? 1 : 0)) / 4);
    }
    const tracker = state.ballProgress, ownHalf = side === 'white' ? carrier.y > 8 : carrier.y < 8;
    const anchorOwnHalf = tracker && (side === 'white' ? tracker.anchorY > 8 : tracker.anchorY < 8);
    if (ownHalf && anchorOwnHalf && tracker.team === side && !tracker.excludeRelease && !state.restart && !['kickoff', 'keeperReact', 'finished'].includes(phase)) {
      const advance = (side === 'white' ? -1 : 1) * (carrier.y - tracker.anchorY);
      stallPressure = ownSign * clamp01(Number(tracker.rounds) / 3) * clamp01((4 - advance) / 4);
    }
  }
  const ballZone = clamp01(Math.abs((state.ball?.y ?? 8) - 8) / 8);
  const vector = [...original, actor, ordinaryTempo, bonusTempo, dribbleTempo, kickNow,
    depthSquared, centrality, opening, inGoalBox, directExposure, bonusExposure, safeOptions, forwardOptions,
    centralQuality, finishingQuality, pressure, keeperDisplacement, dribblePressure, stallPressure,
    original[3] * ballZone, original[4] * ballZone];
  // Canonicalize signed zero before perspective conversion for stable hashes.
  return vector.map(value => team === 'black' ? -(value || 0) : value || 0);
}
// END GENERATED RL CONTEXT FEATURES

// BEGIN GENERATED RL SHOT FEATURES — source: scripts/rl-shot-features.mjs

// Exact public shooting/outlet metrics are supplied by the engine's existing
// tactical calculations. This encoder never approximates the shot model.
// contextWhite is always the normalized 28-feature WHITE vector.
export const RL_SHOT_FEATURE_NAMES = Object.freeze([
  ...RL_CONTEXT_FEATURE_NAMES,
  'carrierKing', 'carrierQueen', 'carrierRook', 'carrierBishop', 'carrierKnight', 'carrierPawn',
  'bestShot', 'bestOutlet', 'secondOutlet'
]);

export function rlShotValueFeatures(state, team = 'white', contextWhite, metrics = {}) {
  if (!contextWhite || contextWhite.length !== 28
    || !Array.from(contextWhite).every(value => Number.isFinite(value) && Math.abs(value) <= 1)) {
    throw new TypeError('Shot contextWhite must contain 28 finite normalized White features.');
  }
  const carrier = (state.pieces || []).find(piece => piece.id === state.ball?.carrierId);
  const carrierSign = carrier?.team === 'white' ? 1 : carrier?.team === 'black' ? -1 : 0;
  const probability = name => {
    const value = metrics[name] ?? 0;
    if (!Number.isFinite(value)) throw new TypeError(`Shot metric ${name} must be finite.`);
    return carrierSign * Math.max(0, Math.min(1, value));
  };
  const oneHot = ['K', 'Q', 'R', 'B', 'N', 'P'].map(type => carrier?.type === type ? carrierSign : 0);
  const vector = [...contextWhite, ...oneHot,
    probability('bestShot'), probability('bestOutlet'), probability('secondOutlet')];
  return vector.map(value => team === 'black' ? -(value || 0) : value || 0);
}
// END GENERATED RL SHOT FEATURES

// The shipped checkpoint is changed only after a separate self-play evaluation.
// Training is offline; the browser runs the selected bounded value residual.
export const RL_VALUE_MODEL = Object.freeze({
  version: 3, algorithm: 'TD(lambda)', trained: true, enabled: false, scale: 320,
  featureNames: Object.freeze(["possession", "ballProgress", "material", "centerControl", "openFiles", "defensiveCover", "centralReceivers", "actor", "ordinaryMoveTempo", "bonusMoveTempo", "dribbleTempo", "kickNowPossession", "carrierDepthSquared", "carrierCentrality", "carrierGoalOpening", "carrierInGoalBox", "directTackleExposure", "bonusTackleExposure", "safePassOptions", "safeForwardOptions", "centralPassQuality", "finishingPassQuality", "nearbyDefenderPressure", "keeperDisplacement", "dribbleLimitPressure", "ownHalfStallPressure", "advancedCenterControl", "advancedOpenFiles", "carrierKing", "carrierQueen", "carrierRook", "carrierBishop", "carrierKnight", "carrierPawn", "bestShot", "bestOutlet", "secondOutlet"]),
  weights: Object.freeze([-0.01425146961320564, 0.07040803333568386, 0, -0.002730327691800118, -0.0310497311658628, 0.025475191748680355, 0.027416743955999974, 0.004114277046353949, 0.040913160668107955, 0.04325215651664718, 0.007962721968753975, 0.013533691710675543, 0.10801807740412118, 0.0811998987399577, 0.0851675181581559, 0.21534015212939853, 0.009985636627395973, 0.015943580577194385, -0.010962197326639493, -0.005232734520152212, 0.04409023319851366, 0.01848264921865399, -0.0011036237304129163, 0.006893377213235784, -0.08284384634253265, -0.025062788215518092, -0.0014397247653857523, -0.019941044057763636, 0.002508275084385383, 0.01249400651340931, 0.014678665963848286, 0.0022959060227724236, 0.01494628667754824, -0.00038388463317953156, 0.014095916605158059, 0.0011177251985286334, -3.6201392114262285e-05]),
  checkpoint: "counterplay-2026-10-16-shot-0032", checkpointSha256: "18c42fe6a0ed25b567dcb31a2acc45c18bc1c4bcfc56d0a727196c7d4b0fd869", trainingSegments: 32, trainingTransitions: 10241,
});

export function rlValidateWeights(weights) {
  if (weights === null) return null;
  if ((!Array.isArray(weights) && !ArrayBuffer.isView(weights)) || ![7, RL_CONTEXT_FEATURE_NAMES.length, RL_SHOT_FEATURE_NAMES.length].includes(weights.length)
    || !Array.from(weights).every(value => Number.isFinite(value) && Math.abs(value) <= 4)) {
    throw new Error('The learned value model requires 7, 28 or 37 finite weights, each between -4 and 4.');
  }
  return Array.from(weights);
}

export function rlValueFeatures(state, team = 'white') {
  const owner = state.pieces.find(piece => piece.id === state.ball.carrierId);
  const possessionTeam = owner?.team || state.restart?.team;
  const possession = possessionTeam === 'white' ? 1 : possessionTeam === 'black' ? -1 : 0;
  const progress = owner ? possession * clamp((owner.team === 'white' ? BOARD_HEIGHT - 1 - owner.y : owner.y) / (BOARD_HEIGHT - 1), 0, 1) : 0;
  const values = {Q: 150, R: 105, B: 100, N: 90, P: 55, K: 0};
  const material = clamp(state.pieces.reduce((sum, piece) => sum + (piece.team === 'white' ? 1 : -1) * (values[piece.type] || 0), 0) / 905, -1, 1);
  const board = rlBoardFeatures(state, 'white');
  const vector = [possession, progress, material, board.centerControl, board.openFiles, board.defensiveCover, board.centralReceivers];
  return team === 'black' ? vector.map(value => -value) : vector;
}

export function rlContextFeatures(state, team = 'white') {
  return rlContextValueFeatures(state, team, rlValueFeatures(state, 'white'));
}

export function rlShotFeatures(state, team = 'white') {
  const carrier = state.pieces.find(piece => piece.id === state.ball.carrierId);
  const outlets = carrier ? tacticalOutlets(state, carrier) : {best: 0, second: 0};
  return rlShotValueFeatures(state, team, rlContextFeatures(state, 'white'), {
    bestShot: carrier ? tacticalShots(state, carrier.team, true) : 0,
    bestOutlet: outlets.best, secondOutlet: outlets.second,
  });
}

export function rlValuePrediction(state, team = 'white', weights = RL_VALUE_MODEL.weights) {
  const checked = rlValidateWeights(weights);
  if (!checked || checked.every(value => value === 0)) return 0;
  const features = checked.length === RL_SHOT_FEATURE_NAMES.length ? rlShotFeatures(state, team) : checked.length === RL_CONTEXT_FEATURE_NAMES.length ? rlContextFeatures(state, team) : rlValueFeatures(state, team);
  return Math.tanh(features.reduce((sum, feature, index) => sum + feature * checked[index], 0));
}

export function rlValidateScale(scale) {
  if (![80, 320].includes(scale)) throw new Error('The learned residual scale must be 80 or 320.');
  return scale;
}

function rlDefaultScale(weights) {
  return weights?.length === 7 ? 80 : RL_VALUE_MODEL.scale;
}

function tacticalPositionValue(state, team, modelWeights = RL_VALUE_MODEL.enabled ? RL_VALUE_MODEL.weights : null, modelScale = rlDefaultScale(modelWeights)) {
  const base = tacticalBasePositionValue(state, team);
  if (!modelWeights || state.phase === 'finished') return base;
  return base + modelScale * rlValuePrediction(state, team, modelWeights);
}

function tacticalBasePositionValue(state, team) {
  if (state.phase === 'finished' && state.winner) return state.winner === team ? 1000000 : -1000000;
  let value = (state.score[team] - state.score[other(team)]) * 2000;
  // Losing a player removes an attacking outlet and a defensive reply for the
  // rest of the match. The old leaf ignored this until a minimum-roster forfeit.
  const material = {Q: 150, R: 105, B: 100, N: 90, P: 55, K: 0};
  for (const piece of state.pieces) {
    value += (piece.team === team ? 1 : -1) * ((material[piece.type] || 0)
      - (state.discipline?.[piece.id]?.yellowCards ? 8 : 0));
  }
  const carrier = state.pieces.find(piece => piece.id === state.ball.carrierId);
  if (!carrier && state.phase === 'cornerSelect' && state.restart?.type === 'corner') {
    return value + (state.restart.team === team ? 1 : -1) * 215 * 0.35;
  }
  if (!carrier) return value + looseBallValue(state, team) * 0.35;
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
  if (!state.restart && state.phase !== 'kickoff') {
    const pace = paceFor(state);
    if (pace.carrierId === carrier.id) possession -= pace.dribbleRounds * 14 + (pace.dribbleRounds >= PACE_RULE.maxDribbleRounds ? 80 : 0);
  }
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
  const finishingOutlets = tacticalOutlets(state, carrier);
  possession += finishingOutlets.best * 250 + finishingOutlets.second * 60;
  possession += wideAttackValue(state, carrier);
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
  value += sign * possession * 0.35;
  for (const keeper of state.pieces.filter(piece => piece.type === 'K')) {
    const positioning = keeperHomeValue(keeper);
    value += (keeper.team === team ? 1 : -1) * positioning * 0.35;
  }
  return value;
}

function tacticalMoveRank(state, piece, move, beforeThreat, fast = false, threats = []) {
  if (forbiddenPaceCarry(state, piece, move)) return -16000;
  const projected = projectedMove(state, piece, move);
  const carrier = projected.pieces.find(p => p.id === projected.ball.carrierId), moved = projected.pieces.find(p => p.id === piece.id);
  if (!fast) {
    let rank = moveValue(state, projected, piece, move, piece.team, beforeThreat);
    if (carrier?.team === piece.team && carrier.id !== piece.id) {
      const previous = state.pieces.find(p => p.id === state.ball.carrierId);
      rank += (tacticalOutlets(projected, carrier).best - tacticalOutlets(state, previous).best) * 850;
    }
    return rank;
  }
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
      + (wideCrossingSupport(projected, carrier).best - wideCrossingSupport(state, original).best) * 240
      + (tacticalOutlets(projected, carrier).best - tacticalOutlets(state, original).best) * 850
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
  const team = currentTeam(state);
  if (state.phase === 'finished' || !team) return [];
  // A keeper's immediate objective is to minimize this declared shot's chance,
  // rather than spend branching budget rediscovering all nine possible moves.
  if (state.phase === 'keeperReact') return [{action: chooseCasualAction(state), rank: 0}];
  let candidates = [];
  if (state.phase === 'cornerSelect') {
    candidates = cornerTakers(state).map(piece => ({action: {type: 'cornerTaker', pieceId: piece.id}, rank: cornerTakerRank(state, piece), category: 'cornerTaker'}));
  } else if (['kick', 'kickoff', 'keeperRelease'].includes(state.phase)) {
    candidates = kickingChoices(state).filter(kick => !kick.goal || kick.goal === team).map(kick => {
      // The ordinary attacking phase already permits the original passer's
      // off-ball run, with the same shared movement budget. Avoid inserting an
      // optional pass-run/decline phase that spends a search ply on no new right.
      return {action: {type: 'kick', x: kick.x, y: kick.y, ...(kick.disguise ? {disguise: true} : {})}, rank: tacticalKickRank(state, kick, team), category: kick.goal ? 'shot' : kick.receiverId ? 'pass' : 'space'};
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
        const boxRun = !carrying && carrier?.team === team && isBox(move.x, move.y) && !inOwnBox(team, move.x, move.y);
        const tackleSetup = freePawn && carrier && carrier.team !== team && tacticalTackleSetup(state, piece, move, carrier);
        candidates.push({action: {type: 'move', pieceId: piece.id, x: move.x, y: move.y, freePawn}, rank: tacticalMoveRank(state, piece, move, beforeThreat, !root, threats) + (freePawn ? 0.01 : 0), category: tackleSetup ? 'tackleSetup' : freePawn ? 'pawn' : move.type === 'tackle' ? 'tackle' : carrying ? safeDribble ? 'safeDribble' : 'dribble' : boxRun ? 'boxRun' : 'support'});
      }
    }
  }
  candidates.sort((a, b) => b.rank - a.rank);
  let shortlist = candidates.slice(0, width);
  // A greedy shot-blocking rank must never prune every possession-winning
  // reply. Likewise, consider an actual shot alongside a pass in kicking turns.
  if (!root && width > 1) {
    const categories = positionalTurn(state) ? ['tackle', 'tackleSetup', 'safeDribble', 'boxRun', 'support'] : ['shot', 'pass'];
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
    const wanted = positionalTurn(state) ? ['tackleSetup', 'pawn', 'boxRun', 'support', 'safeDribble', 'dribble', 'tackle'] : ['shot', 'pass', 'space'];
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
  const source = planningState(state);
  const apply = (roll, landing, targetRoll) => {
    const next = action.type === 'cornerTaker' ? selectCornerTaker(source, action.pieceId)
      : action.type === 'kick' ? applyKick(source, action.x, action.y, {roll, landing, passRun: !!action.passRun, disguise: !!action.disguise})
      : action.type === 'move' ? applyMove(source, action.pieceId, action.x, action.y, {freePawn: !!action.freePawn, roll, targetRoll, landing})
        : skipMove(source, {roll, targetRoll, landing});
    return planningState(next);
  };
  if (state.phase === 'keeperReact') {
    const declaration = state.pendingShot, options = validatedDisguisedOptions(state, declaration);
    const shots = options.length === 2 ? options.map(option => ({...declaration, ...option})) : [declaration];
    return shots.flatMap((shot, targetIndex) => {
      const model = singleShotModel({...state, pendingShot: shot}, shot.x, shot.y, action.type === 'move' ? action : undefined);
      const targetRoll = options.length === 2 ? (targetIndex + 0.5) / 2 : undefined;
      let start = 0;
      return [model.goalProbability, model.keeperCornerProbability, model.keeperReboundProbability, model.caughtSaveProbability, model.missProbability, model.blockOutProbability, model.blockPossessionProbability].flatMap((conditionalProbability, index) => {
        const roll = Math.min(1 - Number.EPSILON, start + conditionalProbability / 2); start += conditionalProbability;
        const probability = conditionalProbability / shots.length;
        if (probability <= 0) return [];
        if (index === 2) {
          const reboundState = action.type === 'move' ? {...state, pieces: state.pieces.map(piece => piece.id === action.pieceId ? {...piece, x: action.x, y: action.y} : piece)} : state;
          const targets = keeperReboundTargets(reboundState, shot);
          return targets.map(landing => ({probability: probability / targets.length, state: apply(roll, landing, targetRoll)}));
        }
        if (index !== 4 || shot.distance <= 10 || shot.penalty) return [{probability, state: apply(roll, undefined, targetRoll)}];
        // A bounded, symmetric quadrature covers side-line and end-line risk.
        // Each disguised target retains its own physical scatter distribution.
        const radius = Math.max(1, Math.ceil((shot.distance - 10) / 2) + 1);
        const meanOvershoot = (radius + 1) / 2;
        const depths = [...new Set([Math.floor(meanOvershoot), Math.ceil(meanOvershoot)])];
        return [-2 * radius, -radius, 0, radius, 2 * radius].flatMap(offset => depths.map(depth => ({
          probability: probability / (5 * depths.length),
          state: apply(roll, {x: shot.x + offset, y: shot.y < 0 ? -depth : BOARD_HEIGHT - 1 + depth}, targetRoll)
        })));
      });
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
    budgetFor(state), state.score, state.restart, state.offside, state.pendingShot, state.ballProgress, state.paceControl,
    state.looseBallKickOrigin, state.releaseReason, state.passRun, state.rulesVersion, state.turn, state.foulsEnabled, state.discipline, state.sentOff, state.winner, state.finishReason]);
}
const tacticalActionKey = action => JSON.stringify([action.type, action.pieceId, action.x, action.y, !!action.freePawn, !!action.passRun, !!action.disguise]);
const SEARCH_ABORT = Symbol('Tactical search allowance exhausted');

function tacticalUnsettled(state) {
  if (state.phase === 'keeperReact' || state.phase === 'keeperRelease' || state.phase === 'kick' || state.phase === 'passRun' || state.phase === 'cornerSelect') return true;
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
export function analyzeTacticalAction(state, {maxDepth = AI_SEARCH.depth, nodeLimit = AI_SEARCH.nodes, useCache = true, extensions = true, onIteration,
  modelWeights = RL_VALUE_MODEL.enabled ? RL_VALUE_MODEL.weights : null, modelScale = rlDefaultScale(modelWeights)} = {}) {
  modelWeights = rlValidateWeights(modelWeights);
  modelScale = rlValidateScale(modelScale);
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
    const value = tacticalPositionValue(position, team, modelWeights, modelScale);
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
      // A worker may deliver completed iterations while the next one searches.
      // Isolate the callback's snapshot so a consumer cannot mutate search
      // actions, cached principal variations or diagnostic counters.
      if (typeof onIteration === 'function') onIteration({action: copy(completed.action), value: completed.value,
        stats: {...stats}, line: copy(completed.line)});
    } catch (error) {
      if (error !== SEARCH_ABORT) throw error;
      stats.aborted = true; break;
    }
  }
  return {action: completed.action, value: completed.value, stats, line: completed.line};
}

function chooseTacticalAction(state, modelWeights, modelScale) {
  return analyzeTacticalAction(state, {modelWeights, modelScale}).action;
}

export function chooseAIAction(state, {difficulty = 'casual', modelWeights = RL_VALUE_MODEL.enabled ? RL_VALUE_MODEL.weights : null, modelScale = rlDefaultScale(modelWeights)} = {}) {
  // Keep geometry reuse within a decision, while allowing custom setups or
  // API callers to edit an existing state object between decisions.
  if (state && typeof state === 'object') { passThreatCache.delete(state); tacticalOutletCache.delete(state); crossingSupportCache.delete(state); }
  return difficulty === 'tactical' ? chooseTacticalAction(state, modelWeights, modelScale) : chooseCasualAction(state);
}
