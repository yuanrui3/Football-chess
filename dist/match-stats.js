/** Match records are independent of engine decisions and replay playback. */
import {BOARD_WIDTH, BOARD_HEIGHT, GOAL_FILES, BOX_FILES, BOX_DEPTH} from './engine.js?v=db24debe7605';
const TEAMS = ['white', 'black'];
const SHOT_RESULTS = ['goal', 'save', 'shotMiss', 'blockedShot'];
const IDS = /^(white|black)-(K|Q|[RBN][12]|P[123])$/;
const isTeam = team => TEAMS.includes(team);
const isId = id => typeof id === 'string' && IDS.test(id);
const teamOf = id => isId(id) ? id.split('-')[0] : null;
const count = value => Number.isInteger(value) && value >= 0;
const finite = value => Number.isFinite(value) && value >= 0;
const copy = value => JSON.parse(JSON.stringify(value));
const emptyTeam = () => ({shots: 0, onTarget: 0, corners: 0, possessionMs: 0, fouls: 0, yellowCards: 0, redCards: 0});
const scoreOf = score => Object.fromEntries(TEAMS.map(team => [team, count(score?.[team]) ? score[team] : 0]));
const pitchPoint = point => point && Number.isInteger(point.x) && Number.isInteger(point.y) && point.x >= 0 && point.x < BOARD_WIDTH && point.y >= 0 && point.y < BOARD_HEIGHT ? {x: point.x, y: point.y} : null;
const goalPoint = point => point && GOAL_FILES.includes(point.x) && [-1, BOARD_HEIGHT].includes(point.y) ? {x: point.x, y: point.y} : null;
const maxShotDistance = Math.hypot(Math.max(GOAL_FILES.at(-1), BOARD_WIDTH - 1 - GOAL_FILES[0]), BOARD_HEIGHT - 0.5);
function locationFields(record = {}, shot = null) {
  const origin = pitchPoint(shot?.from) || pitchPoint(record.origin);
  const target = shot?.disguised ? null : goalPoint(shot ? {x: shot.x, y: shot.y} : null) || goalPoint(record.target);
  // Engine shooting distance ends on the goal plane between the pitch and goal
  // square, rather than at the centre of the decorative goal square.
  const distance = shot?.disguised ? null : origin && target ? Math.hypot(target.x - origin.x, (target.y < 0 ? -0.5 : BOARD_HEIGHT - 0.5) - origin.y)
    : finite(record.distance) && record.distance > 0 && record.distance <= maxShotDistance ? record.distance : null;
  return {origin, target, distance};
}
export function normalizeGoalOrigin(goal) {
  const origin = pitchPoint(goal?.origin);
  return origin ? goal.team === 'black' ? {x: BOARD_WIDTH - 1 - origin.x, y: BOARD_HEIGHT - 1 - origin.y} : origin : null;
}
const goalZone = origin => origin.y >= BOX_DEPTH + 3 ? 'distant' : !BOX_FILES.includes(origin.x) ? 'wide' : origin.y < BOX_DEPTH ? 'box' : 'central';
const emptyZones = () => ({box: 0, central: 0, wide: 0, distant: 0});
export const shortPieceId = id => isId(id) ? id.split('-')[1] : 'Unknown';

export function createMatchStats({partial = false, baselineScore = {white: 0, black: 0}} = {}) {
  return {version: 2, pitch: {width: BOARD_WIDTH, height: BOARD_HEIGHT}, partial: !!partial, baselineScore: scoreOf(baselineScore),
    teams: {white: emptyTeam(), black: emptyTeam()}, goals: [], foulEvents: [], lastPass: null, pendingShot: null};
}

export function restoreMatchStats(saved, game, {partial = true} = {}) {
  const fallback = () => {
    const stats = createMatchStats({partial, baselineScore: partial ? game?.score : undefined});
    // A restored old match can already have a committed shot in flight. Its
    // known attempt belongs in the partial record so a save cannot exceed shots.
    const shot = game?.pendingShot;
    const shootingTeam = teamOf(shot?.shooterId);
    if (game?.phase === 'keeperReact' && shot && shootingTeam) {
      if (shot.scoringTeam === shootingTeam) stats.teams[shootingTeam].shots = 1;
      stats.pendingShot = {team: shootingTeam, shooterId: shot.shooterId, assistId: null, ...locationFields({}, shot)};
    }
    return stats;
  };
  if (saved?.version !== 2 || saved.pitch?.width !== BOARD_WIDTH || saved.pitch?.height !== BOARD_HEIGHT || typeof saved.partial !== 'boolean' || !Array.isArray(saved.goals)
      || !TEAMS.every(team => count(saved.baselineScore?.[team]) && ['shots', 'onTarget', 'corners'].every(key => count(saved.teams?.[team]?.[key])) && finite(saved.teams?.[team]?.possessionMs) && ['fouls', 'yellowCards', 'redCards'].every(key => saved.teams?.[team]?.[key] === undefined || count(saved.teams[team][key])))) return fallback();
  if (!saved.goals.every(goal => goal && isTeam(goal.team) && isId(goal.scorerId) && (goal.assistId === null || isId(goal.assistId))
      && typeof goal.ownGoal === 'boolean' && count(goal.turn) && (goal.matchSeconds === null || finite(goal.matchSeconds))
      && (teamOf(goal.scorerId) !== goal.team ? goal.assistId === null : !goal.assistId || teamOf(goal.assistId) === goal.team && goal.assistId !== goal.scorerId))) return fallback();
  const foulEvents = saved.foulEvents === undefined ? [] : saved.foulEvents;
  if (!Array.isArray(foulEvents) || !foulEvents.every(event => event && isTeam(event.team) && teamOf(event.offenderId) === event.team && teamOf(event.fouledId) === (event.team === 'white' ? 'black' : 'white')
      && [null, 'yellow', 'red'].includes(event.card) && typeof event.secondYellow === 'boolean' && (!event.secondYellow || event.card === 'red')
      && count(event.turn) && (event.matchSeconds === null || finite(event.matchSeconds)))) return fallback();
  if (!TEAMS.every(team => saved.teams[team].onTarget <= saved.teams[team].shots
      && saved.baselineScore[team] + saved.goals.filter(goal => goal.team === team).length === (game?.score?.[team] ?? 0))) return fallback();
  const restored = createMatchStats({partial: saved.partial, baselineScore: saved.baselineScore});
  for (const team of TEAMS) for (const key of ['shots', 'onTarget', 'corners', 'possessionMs', 'fouls', 'yellowCards', 'redCards']) restored.teams[team][key] = saved.teams[team][key] ?? 0;
  // Stable player identity and the credited side decide whether a goal is an
  // own goal. Older pending-shot saves could lose shootingTeam and persist a
  // contradictory redundant flag; keep the verified goal and repair that flag.
  restored.goals = saved.goals.map(goal => {const {team, scorerId, assistId, turn, matchSeconds} = goal; return {team, scorerId, assistId, ownGoal: teamOf(scorerId) !== team, turn, matchSeconds, ...locationFields(goal)};});
  if (saved.goals.some((goal, index) => goal.ownGoal !== restored.goals[index].ownGoal)) {
    for (const team of TEAMS) {
      const knownGoals = restored.goals.filter(goal => goal.team === team && !goal.ownGoal).length;
      restored.teams[team].onTarget = Math.max(restored.teams[team].onTarget, knownGoals);
      restored.teams[team].shots = Math.max(restored.teams[team].shots, knownGoals);
    }
  }
  restored.foulEvents = foulEvents.map(({team, offenderId, fouledId, card, secondYellow, turn, matchSeconds}) => ({team, offenderId, fouledId, card, secondYellow, turn, matchSeconds}));
  const pass = saved.lastPass;
  if (pass && isTeam(pass.team) && teamOf(pass.providerId) === pass.team && (pass.receiverId === null || teamOf(pass.receiverId) === pass.team && pass.receiverId !== pass.providerId)) restored.lastPass = {team: pass.team, providerId: pass.providerId, receiverId: pass.receiverId};
  const shot = saved.pendingShot;
  if (shot && isTeam(shot.team) && teamOf(shot.shooterId) === shot.team && (shot.assistId === null || teamOf(shot.assistId) === shot.team && shot.assistId !== shot.shooterId)
      && game?.phase === 'keeperReact' && game.pendingShot?.shooterId === shot.shooterId) restored.pendingShot = {team: shot.team, shooterId: shot.shooterId, assistId: shot.assistId, ...locationFields(shot, game.pendingShot)};
  // Unknown or inconsistent possession history must never manufacture an assist.
  if (game?.restart || game?.phase === 'kickoff' || game?.phase === 'finished' || restored.lastPass?.team !== game?.attack) restored.lastPass = null;
  if (restored.lastPass && (restored.lastPass.receiverId
    ? game?.ball?.carrierId !== restored.lastPass.receiverId : game?.ball?.carrierId !== null)) restored.lastPass = null;
  return restored;
}

export function addPossessionTime(stats, game, elapsedMs) {
  if (!finite(elapsedMs) || !elapsedMs || !isTeam(game?.attack) || game.restart || ['kickoff', 'finished'].includes(game.phase)) return stats;
  const next = copy(stats);
  next.teams[game.attack].possessionMs += elapsedMs;
  return next;
}

export function recordMatchTransition(stats, before, after, {matchSeconds = null} = {}) {
  if (!after || after === before) return stats;
  const next = copy(stats), recordedAction = after.lastAction || {};
  // A caught own-goal attempt can complete a stalling round. The outer action
  // carries the penalty while its triggering action still resolves the shot.
  const action = before.phase === 'keeperReact' && recordedAction.type === 'stalling' && SHOT_RESULTS.includes(recordedAction.triggeringAction?.type)
    ? recordedAction.triggeringAction : recordedAction;
  if (action.type === 'foul') {
    const offenderId = action.offenderId || action.pieceId, fouledId = action.fouledId || action.targetId;
    const team = teamOf(offenderId), card = [null, 'yellow', 'red'].includes(action.card) ? action.card : null, secondYellow = !!action.secondYellow;
    if (isTeam(team) && teamOf(fouledId) === (team === 'white' ? 'black' : 'white')) {
      next.teams[team].fouls++;
      if (card === 'yellow' || secondYellow) next.teams[team].yellowCards++;
      if (card === 'red') next.teams[team].redCards++;
      next.foulEvents.push({team, offenderId, fouledId, card, secondYellow, turn: count(after.turn) ? after.turn : 0,
        matchSeconds: finite(matchSeconds) ? matchSeconds : null});
    }
    next.lastPass = null; next.pendingShot = null;
  }
  const newShot = after.phase === 'keeperReact' && before.phase !== 'keeperReact' && action.type === 'shotAttempt';
  const resolution = before.phase === 'keeperReact' && SHOT_RESULTS.includes(action.type);
  const shootingTeam = teamOf(before.pendingShot?.shooterId) || teamOf(action.shooterId || action.pieceId) || before.pendingShot?.shootingTeam || action.shootingTeam;
  if (newShot && isTeam(action.team) && after.pendingShot?.scoringTeam === action.team) next.teams[action.team].shots++;
  if (resolution && isTeam(shootingTeam) && before.pendingShot?.scoringTeam === shootingTeam && ['goal', 'save'].includes(action.type)) next.teams[shootingTeam].onTarget++;
  if (['save', 'out', 'shotMiss', 'blockedShot'].includes(action.type) && action.restart?.type === 'corner' && isTeam(action.restart.team)) next.teams[action.restart.team].corners++;
  if (resolution && action.type === 'goal' && isTeam(action.team)) {
    const scorerId = action.shooterId || action.pieceId || before.pendingShot?.shooterId;
    if (isId(scorerId)) {
      const ownGoal = teamOf(scorerId) !== action.team;
      const assistId = !ownGoal && next.pendingShot?.shooterId === scorerId && next.pendingShot?.team === action.team ? next.pendingShot.assistId : null;
      // A disguised attempt has no committed target until after keeper reaction.
      // Record the actual goal endpoint, not the first public target option.
      const target=goalPoint(action.goalTarget)||goalPoint(action.to);
      const resolvedShot=target?{...before.pendingShot,disguised:false,from:before.pendingShot?.from||action.from,x:target.x,y:target.y}:before.pendingShot;
      next.goals.push({team: action.team, scorerId, assistId, ownGoal, turn: count(after.turn) ? after.turn : 0,
        matchSeconds: finite(matchSeconds) ? matchSeconds : null, ...locationFields(next.pendingShot || {}, resolvedShot)});
    }
  }
  if (resolution) {next.lastPass = null; next.pendingShot = null; return next;}
  if (after.restart || before.attack !== after.attack || ['offside', 'out', 'interception', 'miss', 'stalling', 'timeout', 'tackle'].includes(action.type)) next.lastPass = null;
  if (newShot) {
    const pass = next.lastPass;
    next.pendingShot = {team: action.team, shooterId: action.pieceId,
      assistId: !after.pendingShot?.penalty && pass?.team === action.team && pass.receiverId === action.pieceId && pass.providerId !== action.pieceId ? pass.providerId : null, ...locationFields({}, after.pendingShot)};
    next.lastPass = null;
  } else if (action.type === 'kick') {
    // Inaccurate balls are never assists, even if scatter finds a teammate.
    if (action.outcome === 'complete' && isId(action.pieceId) && isTeam(action.team)) {
      const receiverId = after.ball?.carrierId || null;
      next.lastPass = receiverId === action.pieceId || receiverId && teamOf(receiverId) !== action.team ? null
        : {team: action.team, providerId: action.pieceId, receiverId};
    } else next.lastPass = null;
  } else if (action.collection && next.lastPass) {
    const pass = next.lastPass, receiverId = after.ball?.carrierId;
    next.lastPass = receiverId && teamOf(receiverId) === pass.team && receiverId !== pass.providerId
      ? {...pass, receiverId} : null;
  }
  return next;
}

export function matchStatsSummary(stats) {
  const total = TEAMS.reduce((sum, team) => sum + stats.teams[team].possessionMs, 0);
  const teams = Object.fromEntries(TEAMS.map(team => [team, {...stats.teams[team], possessionPercent: total ? stats.teams[team].possessionMs / total * 100 : null}]));
  const contributions = (key, filter) => {
    const records = new Map();
    for (const goal of stats.goals) if (filter(goal)) {
      const pieceId = goal[key], record = records.get(pieceId) || {team: teamOf(pieceId), pieceId, count: 0};
      record.count++; records.set(pieceId, record);
    }
    return [...records.values()].sort((a, b) => b.count - a.count || a.pieceId.localeCompare(b.pieceId));
  };
  const goalLocations = {known: 0, unknown: 0, zones: emptyZones(), byTeam: {white: {known: 0, unknown: stats.baselineScore.white, zones: emptyZones()}, black: {known: 0, unknown: stats.baselineScore.black, zones: emptyZones()}}};
  for (const goal of stats.goals) {
    const origin = normalizeGoalOrigin(goal), team = goalLocations.byTeam[goal.team];
    if (origin) {const zone = goalZone(origin); team.known++; team.zones[zone]++; goalLocations.zones[zone]++;}
    else team.unknown++;
  }
  for (const team of TEAMS) {goalLocations.known += goalLocations.byTeam[team].known; goalLocations.unknown += goalLocations.byTeam[team].unknown;}
  return {partial: stats.partial, baselineScore: {...stats.baselineScore}, teams, goals: copy(stats.goals), foulEvents: copy(stats.foulEvents || []), goalLocations,
    scorers: contributions('scorerId', goal => !goal.ownGoal), assists: contributions('assistId', goal => !!goal.assistId)};
}
