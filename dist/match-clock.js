// An unfinished decision or an awarded attacking restart must settle before
// the final whistle can erase its outcome.
const TEAMS = ['white', 'black'];
const CHANCE_PHASES = ['restart', 'restartRelease', 'live', 'release', 'shot'];
const RELEASE_PHASES = ['keeperReact', 'keeperRelease', 'passRun'];
const clone = value => value == null ? null : {...value};
const seconds = (value, fallback, maximum = Infinity) => Number.isFinite(value) ? Math.max(0, Math.min(maximum, value)) : fallback;

export function createMatchClock({remaining = 600, actionSeconds = 30} = {}) {
  return {remaining: seconds(remaining, 600), actionRemaining: actionSeconds,
    fullTimePending: false, finalChance: null};
}

export function restoreMatchClock(saved = {}, {remaining = 600, actionSeconds = 30} = {}) {
  const matchRemaining = seconds(saved.remaining, seconds(remaining, 600));
  const chance = saved.finalChance;
  return {remaining: matchRemaining,
    actionRemaining: seconds(saved.actionRemaining, actionSeconds, actionSeconds),
    fullTimePending: !!saved.fullTimePending || matchRemaining === 0,
    finalChance: chance && TEAMS.includes(chance.team) && CHANCE_PHASES.includes(chance.phase)
      ? {team: chance.team, phase: chance.phase} : null};
}

export function tickMatchClock(clock, elapsed, {timed = true} = {}) {
  if (!timed) return {...clock, finalChance: clone(clock.finalChance)};
  const delta = seconds(elapsed, 0);
  const remaining = Math.max(0, clock.remaining - delta);
  return {...clock, remaining,
    actionRemaining: Math.max(0, clock.actionRemaining - delta),
    fullTimePending: clock.fullTimePending || remaining === 0,
    finalChance: clone(clock.finalChance)};
}

function nextChance(chance, before, next) {
  if (!chance) return null;
  if (before.score.white !== next.score.white || before.score.black !== next.score.black) return null;
  // A declared shot always resolves, even if it is an own-goal attempt.
  if (next.phase === 'keeperReact') return {...chance, phase: 'shot'};
  if (chance.phase === 'shot' || next.attack !== chance.team) return null;
  if (chance.phase === 'release') return ['keeperRelease', 'passRun'].includes(next.phase) ? {...chance} : null;
  if (chance.phase === 'restart' || chance.phase === 'restartRelease') {
    if (next.restart) return {...chance};
    return {...chance, phase: next.phase === 'keeperRelease' ? 'restartRelease' : 'live'};
  }
  // A new restart ends a live chance, including an offside/stalling offence.
  if (next.restart) return null;
  if (['kick', 'keeperRelease'].includes(before.phase)) {
    return ['keeperRelease', 'passRun'].includes(next.phase) ? {...chance, phase: 'release'} : null;
  }
  // A loose-ball round can finish without a kick or a carrier.
  if (before.phase === 'defendMove' && next.phase === 'attackMove' && next.turn > before.turn) return null;
  return {...chance};
}

export function settleMatchClock(clock, before, next, {timedOut = false, timed = true, actionSeconds = 30} = {}) {
  if (!timed) return {clock: {...clock, actionRemaining: actionSeconds, fullTimePending: false, finalChance: null}, finish: false};
  const protectedAward = timedOut && next.lastAction?.type === 'timeout' && next.restart?.type === 'timeout'
    || next.lastAction?.type === 'foul' && ['freeKick', 'penalty'].includes(next.restart?.type)
    || next.lastAction?.type === 'stalling' && next.restart?.type === 'stalling'
      && ['repetition', 'dribbleLimit'].includes(next.lastAction.reason || next.restart.reason);
  const finalChance = protectedAward
    ? {team: next.restart.team, phase: 'restart'}
    : nextChance(clock.finalChance, before, next);
  const updated = {...clock, actionRemaining: actionSeconds, finalChance};
  return {clock: updated,
    finish: updated.fullTimePending && !finalChance && !RELEASE_PHASES.includes(next.phase)};
}

// Undo may restore board state, but cannot manufacture thinking or match time.
export function rewindMatchClock(current, snapshot, options = {}) {
  const restored = restoreMatchClock(snapshot || {}, {remaining: current.remaining, ...options});
  const remaining = Math.min(current.remaining, restored.remaining);
  return {...restored, remaining,
    actionRemaining: Math.min(current.actionRemaining, restored.actionRemaining),
    fullTimePending: current.fullTimePending || restored.fullTimePending || remaining === 0};
}
