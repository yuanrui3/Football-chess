/** Match records are independent of engine decisions and replay playback. */
const TEAMS = ['white', 'black'];
const IDS = /^(white|black)-(K|Q|[RBN][12]|P[123])$/;
const isTeam = team => TEAMS.includes(team);
const isId = id => typeof id === 'string' && IDS.test(id);
const teamOf = id => isId(id) ? id.split('-')[0] : null;
const count = value => Number.isInteger(value) && value >= 0;
const finite = value => Number.isFinite(value) && value >= 0;
const copy = value => JSON.parse(JSON.stringify(value));
const emptyTeam = () => ({shots: 0, onTarget: 0, corners: 0, possessionMs: 0});
const scoreOf = score => Object.fromEntries(TEAMS.map(team => [team, count(score?.[team]) ? score[team] : 0]));
const pitchPoint = point => point && Number.isInteger(point.x) && Number.isInteger(point.y) && point.x >= 0 && point.x < 12 && point.y >= 0 && point.y < 15 ? {x: point.x, y: point.y} : null;
const goalPoint = point => point && [4, 5, 6, 7].includes(point.x) && [-1, 15].includes(point.y) ? {x: point.x, y: point.y} : null;
function locationFields(record = {}, shot = null) {
  const origin = pitchPoint(shot?.from) || pitchPoint(record.origin);
  const target = goalPoint(shot ? {x: shot.x, y: shot.y} : null) || goalPoint(record.target);
  // Engine shooting distance ends on the goal plane between the pitch and goal
  // square, rather than at the centre of the decorative goal square.
  const distance = origin && target ? Math.hypot(target.x - origin.x, (target.y < 0 ? -0.5 : 14.5) - origin.y)
    : finite(record.distance) && record.distance > 0 && record.distance <= 20 ? record.distance : null;
  return {origin, target, distance};
}
export function normalizeGoalOrigin(goal) {
  const origin = pitchPoint(goal?.origin);
  return origin ? goal.team === 'black' ? {x: 11 - origin.x, y: 14 - origin.y} : origin : null;
}
const goalZone = origin => origin.y >= 5 ? 'distant' : origin.x < 4 || origin.x > 7 ? 'wide' : origin.y < 2 ? 'box' : 'central';
const emptyZones = () => ({box: 0, central: 0, wide: 0, distant: 0});
export const shortPieceId = id => isId(id) ? id.split('-')[1] : 'Unknown';

export function createMatchStats({partial = false, baselineScore = {white: 0, black: 0}} = {}) {
  return {version: 1, partial: !!partial, baselineScore: scoreOf(baselineScore),
    teams: {white: emptyTeam(), black: emptyTeam()}, goals: [], lastPass: null, pendingShot: null};
}

export function restoreMatchStats(saved, game, {partial = true} = {}) {
  const fallback = () => {
    const stats = createMatchStats({partial, baselineScore: partial ? game?.score : undefined});
    // A restored old match can already have a committed shot in flight. Its
    // known attempt belongs in the partial record so a save cannot exceed shots.
    const shot = game?.pendingShot;
    if (game?.phase === 'keeperReact' && shot && isTeam(shot.shootingTeam) && teamOf(shot.shooterId) === shot.shootingTeam) {
      if (shot.scoringTeam === shot.shootingTeam) stats.teams[shot.shootingTeam].shots = 1;
      stats.pendingShot = {team: shot.shootingTeam, shooterId: shot.shooterId, assistId: null, ...locationFields({}, shot)};
    }
    return stats;
  };
  if (saved?.version !== 1 || typeof saved.partial !== 'boolean' || !Array.isArray(saved.goals)
      || !TEAMS.every(team => count(saved.baselineScore?.[team]) && ['shots', 'onTarget', 'corners'].every(key => count(saved.teams?.[team]?.[key])) && finite(saved.teams?.[team]?.possessionMs))) return fallback();
  if (!saved.goals.every(goal => isTeam(goal.team) && isId(goal.scorerId) && (goal.assistId === null || isId(goal.assistId))
      && typeof goal.ownGoal === 'boolean' && count(goal.turn) && (goal.matchSeconds === null || finite(goal.matchSeconds))
      && (goal.ownGoal ? teamOf(goal.scorerId) !== goal.team && goal.assistId === null : teamOf(goal.scorerId) === goal.team && (!goal.assistId || teamOf(goal.assistId) === goal.team && goal.assistId !== goal.scorerId)))) return fallback();
  if (!TEAMS.every(team => saved.teams[team].onTarget <= saved.teams[team].shots
      && saved.baselineScore[team] + saved.goals.filter(goal => goal.team === team).length === (game?.score?.[team] ?? 0))) return fallback();
  const restored = createMatchStats({partial: saved.partial, baselineScore: saved.baselineScore});
  for (const team of TEAMS) for (const key of ['shots', 'onTarget', 'corners', 'possessionMs']) restored.teams[team][key] = saved.teams[team][key];
  restored.goals = saved.goals.map(goal => {const {team, scorerId, assistId, ownGoal, turn, matchSeconds} = goal; return {team, scorerId, assistId, ownGoal, turn, matchSeconds, ...locationFields(goal)};});
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
  const next = copy(stats), action = after.lastAction || {};
  const newShot = after.phase === 'keeperReact' && before.phase !== 'keeperReact' && action.type === 'shotAttempt';
  const resolution = before.phase === 'keeperReact' && ['goal', 'save', 'shotMiss'].includes(action.type);
  const shootingTeam = before.pendingShot?.shootingTeam || action.shootingTeam;
  if (newShot && isTeam(action.team) && after.pendingShot?.scoringTeam === action.team) next.teams[action.team].shots++;
  if (resolution && isTeam(shootingTeam) && before.pendingShot?.scoringTeam === shootingTeam && ['goal', 'save'].includes(action.type)) next.teams[shootingTeam].onTarget++;
  if (['save', 'out', 'shotMiss'].includes(action.type) && action.restart?.type === 'corner' && isTeam(action.restart.team)) next.teams[action.restart.team].corners++;
  if (resolution && action.type === 'goal' && isTeam(action.team)) {
    const scorerId = action.shooterId || action.pieceId || before.pendingShot?.shooterId;
    if (isId(scorerId)) {
      const ownGoal = !!action.ownGoal || teamOf(scorerId) !== action.team;
      const assistId = !ownGoal && next.pendingShot?.shooterId === scorerId && next.pendingShot?.team === action.team ? next.pendingShot.assistId : null;
      next.goals.push({team: action.team, scorerId, assistId, ownGoal, turn: count(after.turn) ? after.turn : 0,
        matchSeconds: finite(matchSeconds) ? matchSeconds : null, ...locationFields(next.pendingShot || {}, before.pendingShot)});
    }
  }
  if (resolution) {next.lastPass = null; next.pendingShot = null; return next;}
  if (after.restart || before.attack !== after.attack || ['offside', 'out', 'interception', 'miss', 'stalling', 'timeout', 'tackle'].includes(action.type)) next.lastPass = null;
  if (newShot) {
    const pass = next.lastPass;
    next.pendingShot = {team: action.team, shooterId: action.pieceId,
      assistId: pass?.team === action.team && pass.receiverId === action.pieceId && pass.providerId !== action.pieceId ? pass.providerId : null, ...locationFields({}, after.pendingShot)};
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
  return {partial: stats.partial, baselineScore: {...stats.baselineScore}, teams, goals: copy(stats.goals), goalLocations,
    scorers: contributions('scorerId', goal => !goal.ownGoal), assists: contributions('assistId', goal => !!goal.assistId)};
}
