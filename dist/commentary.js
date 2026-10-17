/** Public match commentary only: no engine calls, seeds, hidden targets or AI search. */
import {COMMENTARY_CLIPS} from './commentary-clips.js?v=29cbe0d352e1';
const TEAM_NAMES = {white: 'Ivory', black: 'Obsidian'};
const PIECE_NAMES = {K: 'keeper', Q: 'queen', R: 'rook', B: 'bishop', N: 'knight', P: 'pawn'};
const NUMBERS = {'1': 'one', '2': 'two', '3': 'three'};
const RESULTS = ['goal', 'save', 'shotMiss', 'blockedShot'];
export const COMMENTARY_PRIORITY = Object.freeze({trend: 1, attempt: 2, outcome: 3, goal: 4});
export const COMMENTARY_PACE = 3000;
export const COMMENTARY_HEARTBEAT_MS = 12000;
export const COMMENTARY_ROUTINE_MS = 10000;
export const COMMENTARY_LOCAL_DEADLINE_MS = 5500;
const voiceId = voice => `${voice.voiceURI || voice.name || ''}|${voice.lang || ''}`;
const voiceRank = voice => (/natural|neural/i.test(voice.name) ? 100 : /google.*english|microsoft.*online/i.test(voice.name) ? 70 : 0)
  + (/^en[-_]US$/i.test(voice.lang) ? 15 : 0) + (voice.default ? 1 : 0);
export function commentaryVoices(voices = []) {
  return Array.from(voices).filter(voice => /^en(?:[-_]|$)/i.test(voice?.lang || ''))
    .sort((a, b) => voiceRank(b) - voiceRank(a) || a.name.localeCompare(b.name))
    .map(voice => ({id: voiceId(voice), name: voice.name, lang: voice.lang,
      preferred: /natural|neural|google.*english|microsoft.*online/i.test(voice.name),
      natural: /natural|neural/i.test(voice.name)}));
}
const teamName = team => TEAM_NAMES[team] || 'The team';
const teamOf = id => /^(white|black)-/.exec(id || '')?.[1] || null;
const opponent = team => team === 'white' ? 'black' : 'white';
const finite = value => typeof value === 'number' && Number.isFinite(value);
const point = value => finite(value?.x) && finite(value?.y);
const scoreText = score => `Ivory ${Number(score?.white) || 0}, Obsidian ${Number(score?.black) || 0}.`;
export function commentaryPiece(id) {
  const [, type, number] = /^(?:white|black)-([KQRBNP])([123]?)$/.exec(id || '') || [];
  return type ? `${PIECE_NAMES[type]}${number ? ` ${NUMBERS[number]}` : ''}` : 'player';
}
const ownedPiece = id => `${teamName(teamOf(id))}'s ${commentaryPiece(id)}`;
const cap = text => text.charAt(0).toUpperCase() + text.slice(1);
function variant(lines, ...facts) {
  let hash = 2166136261;
  for (const character of facts.join(':')) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619) >>> 0;
  return lines[hash % lines.length];
}
function goalContext(before, after, team) {
  const oldOwn = before.score?.[team], oldOther = before.score?.[opponent(team)];
  const own = after.score?.[team], other = after.score?.[opponent(team)];
  if (![oldOwn, oldOther, own, other].every(Number.isInteger)) return '';
  if (own === other && oldOwn < oldOther) return " They're level!";
  if (own < other) return ' They pull one back!';
  if (own > other && oldOwn === 0 && oldOther === 0) return ' The deadlock is broken!';
  if (own > other && oldOwn <= oldOther) return ' They take the lead!';
  if (own > other && oldOwn > oldOther) return ' They extend the lead!';
  return '';
}
function goalClip(before, after, team) {
  const oldOwn = before.score?.[team], oldOther = before.score?.[opponent(team)];
  const own = after.score?.[team], other = after.score?.[opponent(team)];
  if (![oldOwn, oldOther, own, other].every(Number.isInteger)) return 'goal_generic';
  if (own === other && oldOwn < oldOther) return 'goal_equalizer';
  if (own < other) return 'goal_pullback';
  if (own > other && oldOwn === 0 && oldOther === 0) return 'goal_opening';
  if (own > other && oldOwn <= oldOther) return 'goal_ahead';
  if (own > other && oldOwn > oldOther) return 'goal_extend';
  return 'goal_generic';
}
const restartClip = type => ({corner: 'corner', freeKick: 'free', stalling: 'indirect', offside: 'offside', timeout: 'timeout', throwIn: 'throw', goalKick: 'goalkick', penalty: 'penalty_award'}[type]);
const forwardGain = (team, from, to) => (team === 'white' ? -1 : 1) * (to.y - from.y);
function defenderLinesCrossed(state, team, from, to) {
  return new Set((state.pieces || []).filter(piece => piece.team !== team && piece.type !== 'K'
    && forwardGain(team, from, piece) > 0 && forwardGain(team, piece, to) > 0
    && Math.abs(piece.x - (from.x + (to.x - from.x) * (piece.y - from.y) / (to.y - from.y))) <= 2).map(piece => piece.y)).size;
}
function knightPocket(state, carrier) {
  return carrier?.type === 'N' && (carrier.team === 'white' ? carrier.y <= 5 : carrier.y >= 11)
    && !(state.pieces || []).some(piece => piece.team !== carrier.team && piece.type !== 'K'
      && Math.max(Math.abs(piece.x - carrier.x), Math.abs(piece.y - carrier.y)) <= 1);
}
function actionOf(before, after) {
  const action = after?.lastAction;
  return before?.phase === 'keeperReact' && action?.type === 'stalling' && RESULTS.includes(action.triggeringAction?.type)
    ? action.triggeringAction : action;
}
function event(kind, text, before, after, action, details = {}) {
  return {kind, priority: COMMENTARY_PRIORITY[kind], text,
    id: [after?.turn, action?.type, action?.pieceId, action?.from?.x, action?.from?.y, action?.to?.x, action?.to?.y,
      after?.score?.white, after?.score?.black].join(':'), ...details};
}
function restartLine(restart) {
  if (!restart?.team) return '';
  const type = {corner: 'Corner', goalKick: 'Goal kick', throwIn: 'Throw-in', freeKick: 'Free kick'}[restart.type];
  return type ? ` ${type} to ${teamName(restart.team)}.` : '';
}

/** A deterministic line describing a committed, public transition. No timing or speech. */
export function commentaryEvent(before, after, {stats} = {}) {
  if (!before || !after || before === after) return null;
  const action = actionOf(before, after);
  if (!action) return null;
  if (action.type === 'shotAttempt' && before.phase !== 'keeperReact' && after.phase === 'keeperReact') {
    const shot = after.pendingShot || {}, shooterId = action.pieceId || shot.shooterId;
    const backwards = shot.scoringTeam && shot.shootingTeam && shot.scoringTeam !== shot.shootingTeam;
    const distance = point(action.from) && point(action.to) ? Math.hypot(action.to.x - action.from.x, action.to.y - action.from.y) : 0;
    const source = ownedPiece(shooterId), piece = commentaryPiece(shooterId), carrier = before.pieces?.find(player => player.id === shooterId);
    const choices = distance > 8 ? [`${source} takes it on from distance!`, `${source} lets fly from range!`, `${source} shoots from range!`]
      : distance <= 4 ? [`A chance for ${teamName(teamOf(shooterId))}! ${cap(piece)} shoots!`, `${source} shoots from close range!`, `${source} goes for goal!`]
        : [`${source} shoots!`, `${source} goes for goal!`, `${source} has a go!`];
    if (knightPocket(before, carrier)) choices.push(`The knight finds a pocket of space. ${teamName(carrier.team)} go for goal!`);
    const text = shot.penalty ? `${source} takes the penalty!`
      : backwards ? `${ownedPiece(shooterId)} sends it towards their own goal!`
        : variant(choices, after.turn, shooterId, action.from?.x, action.from?.y);
    const clipKey = shot.penalty ? 'shot_penalty' : backwards ? 'shot_ownward'
      : distance > 8 ? variant(['shot_long', 'shot_long_2'], after.turn, shooterId)
        : distance <= 4 ? variant(['shot_close', 'shot_close_2'], after.turn, shooterId)
          : variant(['shot_normal', 'shot_normal_2'], after.turn, shooterId);
    return event('attempt', text, before, after, action, {shot: true, clipKey});
  }
  if (before.phase === 'keeperReact' && RESULTS.includes(action.type)) {
    const shot = before.pendingShot || {}, shooterId = action.shooterId || action.pieceId || shot.shooterId;
    const shootingTeam = teamOf(shooterId) || action.shootingTeam || shot.shootingTeam;
    if (action.type === 'goal') {
      const team = action.team || shot.scoringTeam;
      const ownGoal = !!(team && shootingTeam && team !== shootingTeam);
      const record = Array.isArray(stats?.goals) ? stats.goals.findLast(goal => goal.team === team && goal.scorerId === shooterId && goal.turn === after.turn) : null;
      const assist = !ownGoal && !shot.penalty && record?.assistId && teamOf(record.assistId) === team && record.assistId !== shooterId
        ? ` Assisted by ${commentaryPiece(record.assistId)}.` : '';
      const scorer = ownGoal ? `An own goal by ${ownedPiece(shooterId)}!`
        : `${cap(commentaryPiece(shooterId))}${shot.penalty ? ' converts the penalty' : variant([' scores', ' finds the net', ' finishes it'], after.turn, shooterId)}!`;
      return event('goal', `GOAL for ${teamName(team)}! ${scorer}${goalContext(before, after, team)}${assist} ${scoreText(after.score)}`, before, after, action, {shot: true, team, ownGoal, clipKey: ownGoal ? 'goal_own' : goalClip(before, after, team)});
    }
    if (action.type === 'save') {
      const keeperTeam = teamOf(action.keeperId) || action.team || shot.defendingTeam;
      const text = action.backPass ? `${teamName(keeperTeam)}'s keeper gathers the backward ball and must release it.`
        : action.outcome === 'loose' ? variant([`Saved! ${teamName(keeperTeam)}'s keeper palms it away — the ball is loose! Who can get there first?`, `What a stop by ${teamName(keeperTeam)}'s keeper! It spills back into play — the rebound is alive!`], after.turn, shooterId)
        : action.outcome === 'corner' ? `${variant([`${teamName(keeperTeam)}'s keeper turns it behind!`, `Saved, and behind! ${teamName(keeperTeam)}'s keeper keeps it out!`], after.turn, shooterId)}${restartLine(action.restart)}`
          : variant([`Saved by ${teamName(keeperTeam)}'s keeper! The keeper holds it.`, `${teamName(keeperTeam)}'s keeper keeps it out, and holds on!`, `Denied by ${teamName(keeperTeam)}'s keeper! The ball is safe.`], after.turn, shooterId);
      return event('outcome', text, before, after, action, {shot: true, keeperRebound: action.outcome === 'loose', clipKey: action.backPass ? 'keeper_release' : action.outcome === 'loose' ? null : action.outcome === 'corner' ? 'save_corner' : 'save_hold'});
    }
    if (action.type === 'blockedShot') {
      const blocker = action.blockerId ? ownedPiece(action.blockerId) : `${teamName(action.team)}'s defender`;
      const ending = action.outcome === 'blocked' ? ' The defender takes possession.' : restartLine(action.restart);
      return event('outcome', `${variant([`Blocked by ${blocker}!`, `${cap(blocker)} gets in the way! Shot blocked!`], after.turn, shooterId)}${ending}`, before, after, action,
        {shot: true, clipKey: action.outcome === 'blocked' ? 'block_possession' : action.restart?.type === 'corner' ? 'block_corner' : null});
    }
    return event('outcome', `${variant([`${teamName(shootingTeam)} shoot wide!`, `Wide! ${teamName(shootingTeam)} can't find the target.`], after.turn, shooterId)}${restartLine(action.restart)}`, before, after, action, {shot: true, clipKey: 'miss'});
  }
  if (action.type === 'foul' && after.restart?.type === 'penalty') {
    return event('outcome', `Penalty to ${teamName(after.restart.team)}! A foul inside the box.`, before, after, action, {clipKey: 'penalty_award'});
  }
  if (after.restart && (before.restart?.type !== after.restart.type || before.restart?.team !== after.restart.team)) {
    const restart = {corner: 'a corner', freeKick: 'a free kick', stalling: 'an indirect free kick', offside: 'an indirect free kick for offside', timeout: 'an indirect free kick', throwIn: 'a throw-in', goalKick: 'a goal kick'}[after.restart.type];
    if (restart) return event('trend', `${teamName(after.restart.team)} have ${restart}. Both teams can reset their shape.`, before, after, action, {routine: true, clipKey: restartClip(after.restart.type)});
  }
  if (before.phase === 'kickoff' && ['kick', 'miss'].includes(action.type)) {
    return event('trend', `${teamName(action.team)} take the kickoff. The contest for space begins.`, before, after, action, {routine: true, clipKey: 'kickoff'});
  }
  if (before.attack !== after.attack && !after.restart && ['tackle', 'interception', 'move'].includes(action.type)) {
    return event('trend', variant([`${teamName(after.attack)} win it back. A change of possession.`, `${teamName(after.attack)} regain possession. The initiative changes hands.`], after.turn, action.pieceId), before, after, action, {routine: true, clipKey: 'turnover'});
  }
  if (action.type === 'kick' && action.outcome === 'complete' && before.attack === after.attack && point(action.from) && point(action.to)) {
    const advance = (action.team === 'white' ? -1 : 1) * (action.to.y - action.from.y);
    const passer = before.pieces?.find(piece => piece.id === action.pieceId);
    if (advance >= 3 && passer?.type === 'Q' && defenderLinesCrossed(before, action.team, action.from, action.to) >= 2)
      return event('trend', `${teamName(action.team)}'s queen breaks the lines with that forward pass.`, before, after, action, {routine: true, clipKey: 'queen_linebreak'});
    if (advance >= 3 && passer?.type === 'R' && action.from.x === action.to.x && (action.to.x < 4 || action.to.x > 9))
      return event('trend', `${teamName(action.team)}'s rook plays it up the wide channel.`, before, after, action, {routine: true, clipKey: 'rook_wide'});
    if (advance >= 3 && passer?.type === 'B' && Math.abs(action.to.x - action.from.x) === Math.abs(action.to.y - action.from.y))
      return event('trend', `${teamName(action.team)}'s bishop angles a diagonal pass forward.`, before, after, action, {routine: true, clipKey: 'bishop_diagonal'});
    if (advance >= 3) return event('trend', `${teamName(action.team)} send the ball forward${action.to.x < 4 || action.to.x > 9 ? ' on the wing' : ' through the centre'}.`, before, after, action, {routine: true, clipKey: action.to.x < 4 || action.to.x > 9 ? 'forward_wide' : 'forward_centre'});
    if (Math.abs(action.to.x - action.from.x) >= 5 && advance >= -1) return event('trend', variant([`${teamName(action.team)} switch play across the files.`, `${teamName(action.team)} move it across the pitch, switching the point of attack.`], after.turn), before, after, action, {routine: true, clipKey: 'switch'});
  }
  return null;
}

/** Current visible facts for quiet passages; no forecast, hidden targets or exact moves. */
export function commentarySituation(state, {index = 0} = {}) {
  if (!state || state.pendingShot || ['keeperReact', 'finished'].includes(state.phase) || !TEAM_NAMES[state.attack] || !point(state.ball)) return null;
  const team = state.attack, name = teamName(team), carrier = state.pieces?.find(piece => piece.id === state.ball.carrierId);
  const advance = team === 'white' ? 16 - state.ball.y : state.ball.y;
  const zone = advance < 6 ? 'their own half' : advance >= 11 ? 'the attacking third' : 'midfield';
  const central = state.ball.x >= 4 && state.ball.x <= 9;
  const facts = [], add = (text, clipKey) => facts.push({text, clipKey});
  if (state.restart) {
    const type = {corner: 'corner', freeKick: 'free kick', stalling: 'indirect free kick', offside: 'indirect free kick for offside', timeout: 'indirect free kick', throwIn: 'throw-in', goalKick: 'goal kick', penalty: 'penalty'}[state.restart.type];
    if (type && TEAM_NAMES[state.restart.team]) {
      add(`${teamName(state.restart.team)} are preparing their ${type}.`, restartClip(state.restart.type));
      add('The teams are reorganising for the restart.', restartClip(state.restart.type));
    }
  } else if (state.phase === 'kickoff') {
    add(`${name} are ready for the kickoff.`, 'kickoff');
    add('The pieces are set. The next attack starts from the centre.', 'kickoff');
  } else if (carrier && carrier.team === team) {
    const zoneClip = advance < 6 ? 'build_back' : advance >= 11 ? 'final_third' : 'midfield';
    add(advance < 6 ? `${name} are building from the back.` : advance >= 11 ? `${name} are in the final third, looking for a way through.` : `${name} have possession in midfield. The contest is in the centre.`, zoneClip);
    add(`${name}'s attack runs through the ${PIECE_NAMES[carrier.type] || 'ball carrier'} in ${zone}.`, zoneClip);
    add(central ? `${name} have possession through the middle.` : `${name} have it out wide. Width in this attack.`, central ? 'central_possession' : 'wide_possession');
    if (carrier.type === 'R' && !central) add(`${name}'s rook has it in the wide channel.`, 'wide_possession');
    else if (carrier.type === 'Q') add(central ? `${name}'s queen is central to this buildup.` : `${name}'s queen has possession on the wing.`, central ? 'central_possession' : 'wide_possession');
    else if (knightPocket(state, carrier)) add(`${name}'s knight has found a pocket of space in the final third.`, 'knight_pocket');
    else add(advance >= 11 ? `${name} are in the final third. The ball is close to goal.`
      : advance < 6 ? `${name} have possession deep. The buildup starts here.` : `${name} have it in midfield. The battle for the centre continues.`, zoneClip);
    const nearby = (state.pieces || []).filter(piece => piece.team !== team && piece.type !== 'K'
      && Math.max(Math.abs(piece.x - carrier.x), Math.abs(piece.y - carrier.y)) <= 2);
    if (nearby.length >= 2) add(`Defenders are close to ${name}'s ball carrier. Space is tight here.`, 'tight_space');
  } else {
    add(`The ball is loose in ${zone}. ${name} are looking to collect it.`, 'loose_ball');
    add(`No piece controls the ball yet. Play is ${central ? 'in the central files' : 'out on the flank'}.`, 'loose_ball');
  }
  if (Number.isInteger(state.score?.white) && Number.isInteger(state.score?.black)) {
    add(state.score.white === state.score.black ? 'The score is level. The next goal could change the game.'
      : `${teamName(state.score.white > state.score.black ? 'white' : 'black')} lead. ${scoreText(state.score)}`, state.score.white === state.score.black ? 'level_score' : 'leader');
  }
  if (!facts.length) return null;
  return {kind: 'trend', priority: COMMENTARY_PRIORITY.trend, ...facts[Math.abs(index) % facts.length], id: `situation:${state.turn}:${index}`, heartbeat: true};
}

/** Conservative trend descriptions from completed rounds, not imagined tactics. */
export function analyseCommentaryTrend(samples, {height = 17, width = 14} = {}) {
  const last = samples?.at(-1);
  if (!last || !TEAM_NAMES[last.team] || !point(last.ball)) return null;
  const team = last.team, progress = sample => team === 'white' ? height - 1 - sample.ball.y : sample.ball.y;
  const run = [];
  for (let index = samples.length - 1; index >= 0 && samples[index].team === team; index--) run.unshift(samples[index]);
  const recent = run.slice(-4), first = recent[0];
  const gain = progress(last) - progress(first);
  const previous = samples[samples.length - run.length - 1];
  let text = null, shortText = null, clipKey = null;
  if (previous && run.length <= 3 && gain >= 4) {
    text = `${teamName(team)} win it back, and they're away on the break!`;
    shortText = `${teamName(team)} break forward. The initiative changes hands.`;
    clipKey = 'counter';
  } else if (recent.length >= 3 && gain >= 3) {
    const central = last.ball.x >= Math.floor(width / 3) && last.ball.x < Math.ceil(width * 2 / 3);
    text = central ? `${teamName(team)} are advancing through the centre. The fight is for central space.`
      : `${teamName(team)} are making ground on the wing, working the outer files.`;
    shortText = central ? `${teamName(team)} advance through the centre.` : `${teamName(team)} advance along the outer files.`;
    clipKey = central ? 'advance_centre' : 'advance_wide';
  } else if (recent.length >= 3 && recent.every(sample => progress(sample) >= height * 2 / 3)) {
    text = `${teamName(team)} are keeping the ball in the attacking third. Sustained territorial pressure.`;
    shortText = `${teamName(team)} keep possession in the attacking third.`;
    clipKey = 'pressure';
  } else if (recent.length >= 4 && Math.abs(gain) < 2) {
    text = `${teamName(team)} are circulating possession, but gaining little ground. The initiative is waiting to be taken.`;
    shortText = `${teamName(team)} circulate possession without gaining ground.`;
    clipKey = 'patient';
  }
  return text ? {kind: 'trend', priority: COMMENTARY_PRIORITY.trend, text, shortText, clipKey, team, id: `trend:${last.turn}:${team}:${last.ball.x}:${last.ball.y}`} : null;
}

/** Mirror ordinary round boundaries without counting each positioning action. */
export function completedCommentaryRound(before, after) {
  if (!before || !after || before === after || before.attack !== after.attack || before.restart || after.restart
      || ['kickoff', 'keeperReact', 'finished'].includes(before.phase) || ['kickoff', 'keeperReact', 'keeperRelease', 'finished'].includes(after.phase)) return false;
  const action = after.lastAction || {};
  if (['kick', 'miss'].includes(action.type) && ['kick', 'keeperRelease'].includes(before.phase)) {
    return !before.ballProgress?.excludeRelease && !(before.phase === 'keeperRelease' && before.ballProgress?.releaseAlreadyCounted);
  }
  return !after.ball?.carrierId && after.phase === 'attackMove'
    && (before.phase === 'defendMove' || ['kick', 'keeperRelease'].includes(before.phase) && action.type === 'skip');
}

export const COMMENTARY_DEMO = Object.freeze([
  {at: 0, kind: 'trend', text: 'Commentary demo. Ivory are advancing on the wing, working the outer files.', clipKey: 'demo'},
  {at: 5000, kind: 'attempt', text: "Ivory's rook two shoots from range!", clipKey: 'shot_long'},
  {at: 8500, kind: 'outcome', text: "Saved by Obsidian's keeper! The keeper holds it.", clipKey: 'save_hold'},
  {at: 12500, kind: 'trend', text: 'Now Obsidian break forward. A quick switch of the initiative!', clipKey: 'counter'},
  {at: 17000, kind: 'goal', text: 'GOAL for Obsidian! Knight one scores! Ivory nil, Obsidian one.', clipKey: 'goal_generic'}
].map((line, index) => Object.freeze({...line, priority: COMMENTARY_PRIORITY[line.kind], id: `demo:${index}`, demo: true})));

/**
 * No speech backlog. Priority calls replace lower-priority speech; stale calls drop.
 * UI must defer shot results until visible impact via observe(...,{deferResult:true})
 * then reveal(event). onCaption(text,event) also works when browser TTS is absent.
 */
export function createCommentary({speechSynthesis = globalThis.speechSynthesis,
  Utterance = globalThis.SpeechSynthesisUtterance, AudioCtor = globalThis.Audio, clips = COMMENTARY_CLIPS,
  localSpeech = null,
  onCaption = () => {}, onVoicesChanged = () => {}, onPlaybackChanged = () => {}, now = () => Date.now(),
  setTimer = (fn, delay) => setTimeout(fn, delay), clearTimer = id => clearTimeout(id)} = {}) {
  let enabled = false, destroyed = false, epoch = 0, pace = 1200, active = null, watchdog = null;
  let lastSpoken = -Infinity, lastTrend = -Infinity, lastAttempt = -Infinity, demo = false, situationIndex = 0, lastText = '', cueSequence = 0;
  const samples = [], seen = new Set(), spoken = new Set(), demoTimers = new Set();
  const speechSupported = !!(speechSynthesis && typeof speechSynthesis.speak === 'function' && typeof Utterance === 'function');
  const recordedSupported = typeof AudioCtor === 'function' && Object.values(clips).some(clip => clip?.src && clip?.text);
  const localSupported = !!(localSpeech && typeof localSpeech.speak === 'function' && typeof localSpeech.load === 'function');
  let playback = localSupported ? 'local' : recordedSupported ? 'recorded' : 'device', audioStatus = 'idle', warming = null;
  let availableVoices = [], voiceOptions = [], chosenVoiceId = null, selectedVoice = null;
  function refreshVoices() {
    try {availableVoices = typeof speechSynthesis?.getVoices === 'function' ? Array.from(speechSynthesis.getVoices()) : [];} catch {availableVoices = [];}
    voiceOptions = commentaryVoices(availableVoices);
    const selected = voiceOptions.find(voice => voice.id === chosenVoiceId) || voiceOptions[0];
    selectedVoice = selected ? availableVoices.find(voice => voiceId(voice) === selected.id) : null;
    try {onVoicesChanged(voiceOptions.map(voice => ({...voice})));} catch {}
    return voiceOptions.map(voice => ({...voice}));
  }
  const voiceListener = () => {if (!destroyed) refreshVoices();};
  if (typeof speechSynthesis?.addEventListener === 'function') speechSynthesis.addEventListener('voiceschanged', voiceListener);
  refreshVoices();
  const caption = (text, line) => {try {onCaption(text, line);} catch { /* UI callback cannot alter a match. */ }};
  const deviceSupported = () => speechSupported && (typeof speechSynthesis.getVoices !== 'function' || !!selectedVoice);
  const status = value => {if (audioStatus !== value) {audioStatus = value; try {onPlaybackChanged(value);} catch {}}};
  function localState() {
    if (!localSupported) return {status: 'unavailable', supported: false, ready: false, progress: 0};
    try {return {supported: true, ...localSpeech.getState?.()};} catch {return {status: 'error', supported: true, ready: false, progress: 0};}
  }
  function stopAudio(audio) {
    if (!audio) return;
    audio.onended = audio.onerror = audio.onplaying = null;
    try {audio.pause();} catch {}
    try {audio.currentTime = 0;} catch {}
    try {audio.removeAttribute?.('src'); audio.load?.();} catch {}
  }
  function clearActiveTimers(current) {
    if (watchdog !== null) clearTimer(watchdog);
    watchdog = null;
    if (current?.loadTimer !== undefined) clearTimer(current.loadTimer);
  }
  const remember = (set, key) => {set.add(key); if (set.size > 120) set.delete(set.values().next().value);};
  function cancelActive({preserveGoal = false} = {}) {
    if (preserveGoal && active?.event.kind === 'goal' && !active.event.demo) return;
    const previous = active; active = null;
    clearActiveTimers(previous); stopAudio(previous?.audio);
    if (previous?.transport === 'device' && speechSupported) {try {speechSynthesis.cancel();} catch { /* Captions remain available. */ }}
    if (previous?.transport === 'local') {try {localSpeech.cancel();} catch {}}
    status('idle');
    caption('', null);
  }
  function stopDemo() {
    for (const id of demoTimers) clearTimer(id);
    demoTimers.clear(); demo = false;
  }
  function finish(token) {
    if (active?.token !== token) return;
    const previous = active; active = null; clearActiveTimers(previous); stopAudio(previous?.audio);
    status('idle'); caption('', null);
  }
  function speak(line, {demoCall = false, explicit = false} = {}) {
    if (!enabled || pace !== COMMENTARY_PACE || destroyed || !line?.text || !COMMENTARY_PRIORITY[line.kind]) return false;
    if (demo && !demoCall) return false;
    if (!demoCall && line.epoch !== undefined && line.epoch !== epoch) return false;
    const at = now(), ttl = line.kind === 'goal' ? 30000 : line.kind === 'outcome' ? 12000 : 6000;
    if (!demoCall && finite(line.createdAt) && at - line.createdAt > ttl) return false;
    if (spoken.has(line.id)) return false;
    if (active && line.priority <= active.event.priority && line.kind !== 'goal') return false;
    if (!demoCall && !explicit && line.kind === 'trend' && (at - lastTrend < COMMENTARY_ROUTINE_MS || at - lastSpoken < COMMENTARY_ROUTINE_MS)) return false;
    if (!demoCall && line.kind === 'attempt' && at - lastAttempt < (pace < 700 ? 3000 : 1200)) return false;
    const useLocal = playback === 'local' && (line.kind === 'trend' || line.keeperRebound === true) && line.clipKey !== 'enable'
      && localSupported && localState().ready;
    const clip = playback === 'recorded' || playback === 'local' ? clips[line.clipKey] : null;
    let text = useLocal ? line.text : clip?.text || (pace < 700 && line.kind === 'trend' && line.shortText ? line.shortText : line.text);
    if (!demoCall && !explicit && line.kind === 'trend' && text === lastText) return false;
    cancelActive();
    const token = {}, spokenEvent = {...line, text};
    active = {token, event: spokenEvent, transport: 'caption'};
    remember(spoken, line.id); lastSpoken = at; lastText = text;
    if (line.kind === 'trend') lastTrend = at;
    if (line.kind === 'attempt') lastAttempt = at;
    caption(text, spokenEvent);
    function armWatchdog() {
      if (watchdog !== null) clearTimer(watchdog);
      const duration = Math.min(18000, Math.max(2200, text.split(/\s+/).length * 430 + 1200));
      watchdog = setTimer(() => {
        if (active?.token !== token) return;
        // Some browsers never fire end/error after switching tabs.
        if (active.transport === 'device' && speechSupported) {try {speechSynthesis.cancel();} catch {}}
        if (active.transport === 'local') {try {localSpeech.cancel();} catch {}}
        finish(token);
      }, active?.transport === 'recorded' ? Math.max(12000, duration) : duration);
    }
    function device(fallback = false) {
      if (active?.token !== token) return;
      // The male commentary mode must not silently substitute an arbitrary
      // browser voice when both local synthesis and the saved call fail.
      if (playback === 'local') {status('unavailable'); return;}
      if (!deviceSupported()) {status('unavailable'); return;}
      active.transport = 'device';
      status(fallback ? 'fallback' : 'playing');
      try {
        const utterance = new Utterance(text);
        if (selectedVoice) utterance.voice = selectedVoice;
        utterance.lang = selectedVoice?.lang || 'en-US';
        utterance.rate = line.kind === 'goal' ? 1.06 : line.kind === 'attempt' ? 1.04 : line.kind === 'outcome' ? 1.02 : 1;
        utterance.pitch = 1;
        utterance.volume = 1;
        utterance.onend = () => finish(token);
        utterance.onerror = () => {if (active?.token === token) status('unavailable');};
        speechSynthesis.speak(utterance);
      } catch {if (active?.token === token) status('unavailable');}
    }
    function recorded(fallbackFromLocal = false) {
      if (active?.token !== token) return;
      if (fallbackFromLocal && clip?.text) {
        // Generic recordings cannot announce the live names or score from the proposed line.
        text = clip.text; lastText = text; active.event = {...line, text}; caption(text, active.event);
      }
      if (!clip || !recordedSupported) {armWatchdog(); device(playback !== 'device'); return;}
      let audio;
      function fallback() {
        if (active?.token !== token || active.transport !== 'recorded') return;
        clearTimer(active.loadTimer); stopAudio(audio); active.audio = null; active.transport = 'caption';
        // A failed request cannot return later and speak a superseded match moment.
        if (!demoCall && finite(line.createdAt) && now() - line.createdAt > ttl) {finish(token); return;}
        device(true);
      }
      try {
        audio = new AudioCtor(clip.src);
        active.audio = audio; active.transport = 'recorded'; audio.preload = 'auto'; audio.volume = 1;
        armWatchdog();
        status('loading');
        const playing = () => {
          if (active?.token !== token || active.transport !== 'recorded') {stopAudio(audio); return;}
          clearTimer(active.loadTimer); status('playing');
        };
        audio.onended = () => finish(token); audio.onerror = fallback; audio.onplaying = playing;
        active.loadTimer = setTimer(fallback, 5000);
        const started = audio.play();
        if (started && typeof started.then === 'function') started.then(playing, fallback);
        else playing();
      } catch {if (active?.token === token) {active.transport = 'recorded'; fallback();}}
    }
    if (useLocal) {
      active.transport = 'local'; status('generating');
      const deadline = Math.min(at + COMMENTARY_LOCAL_DEADLINE_MS, finite(line.createdAt) ? line.createdAt + ttl : Infinity);
      function fallbackLocal() {
        if (active?.token !== token || active.transport !== 'local') return;
        clearTimer(active.loadTimer); active.loadTimer = undefined;
        try {localSpeech.cancel();} catch {}
        active.transport = 'caption';
        if (line.localOnly) {finish(token); status('unavailable'); return;}
        if (!demoCall && finite(line.createdAt) && now() - line.createdAt > ttl) {finish(token); return;}
        recorded(true);
      }
      active.loadTimer = setTimer(fallbackLocal, Math.max(0, deadline - at));
      try {
        const delivery = line.keeperRebound === true || ['counter', 'pressure', 'queen_linebreak', 'final_third', 'knight_pocket', 'advance_centre', 'advance_wide', 'test'].includes(line.clipKey) ? 'urgent' : 'normal';
        Promise.resolve(localSpeech.speak(text, {expiresAt: deadline, delivery, onPlaying() {
          if (active?.token !== token || active.transport !== 'local') return;
          clearTimer(active.loadTimer); active.loadTimer = undefined; status('playing'); armWatchdog();
        }})).then(result => {
          if (active?.token !== token || active.transport !== 'local') return;
          if (result?.spoken) finish(token); else fallbackLocal();
        }, fallbackLocal);
      } catch {fallbackLocal();}
    } else if (playback === 'recorded' || playback === 'local') recorded();
    else {armWatchdog(); device();}
    return true;
  }
  function observe(before, after, options = {}) {
    if (destroyed || !before || !after || before === after) return null;
    if (finite(options.pace)) setPace(options.pace);
    let line = commentaryEvent(before, after, options);
    if (after.restart || ['kickoff', 'finished'].includes(after.phase) || line?.kind === 'goal') samples.length = 0;
    const turnover = !after.restart && before.attack !== after.attack && point(after.ball) && TEAM_NAMES[after.attack];
    if ((completedCommentaryRound(before, after) || turnover) && point(after.ball) && TEAM_NAMES[after.attack]) {
      const sample = {turn: after.turn, team: after.attack, ball: {x: after.ball.x, y: after.ball.y}};
      if (samples.at(-1)?.turn !== sample.turn) {samples.push(sample); if (samples.length > 10) samples.shift();}
      if (!line) line = analyseCommentaryTrend(samples);
    }
    if (!line || seen.has(line.id)) return null;
    remember(seen, line.id);
    const deferred = !!(options.deferResult && (line.kind === 'goal' || line.shot && line.kind === 'outcome'));
    const stamped = {...line, createdAt: now(), epoch, ...(deferred ? {deferred: true} : {})};
    if (!deferred) speak(stamped);
    return stamped;
  }
  function reset() {
    epoch++; stopDemo(); cancelActive(); samples.length = 0; seen.clear(); spoken.clear();
    lastSpoken = lastTrend = lastAttempt = -Infinity; situationIndex = 0; lastText = '';
  }
  function setPace(value) {
    if (!finite(value)) return;
    pace = Math.max(0, value);
    if (pace !== COMMENTARY_PACE) {enabled = false; reset();}
  }
  return {
    observe,
    tick(state, {blocked = false} = {}) {
      if (blocked || !enabled || pace !== COMMENTARY_PACE || destroyed || demo || active || now() - lastSpoken < COMMENTARY_HEARTBEAT_MS) return false;
      if (!state || state.pendingShot || ['keeperReact', 'finished'].includes(state.phase)) return false;
      const latest = samples.at(-1);
      if (!state.restart && latest?.team === state.attack && state.turn >= latest.turn && state.turn - latest.turn <= 8) {
        const trend = analyseCommentaryTrend(samples);
        if (trend && trend.text !== lastText && speak({...trend, createdAt: now(), epoch})) return true;
      }
      for (let attempt = 0; attempt < 6; attempt++) {
        const line = commentarySituation(state, {index: situationIndex++});
        if (!line) return false;
        if (line.text !== lastText && speak({...line, createdAt: now(), epoch})) return true;
      }
      return false;
    },
    confirmEnabled() {return speak({kind: 'trend', priority: 1, text: 'Commentary is on. I will follow the match.', clipKey: 'enable', id: `confirmation:${epoch}:${++cueSequence}`}, {explicit: true});},
    testVoice() {
      if (playback === 'local' && !localState().ready) return false;
      return speak({kind: 'trend', priority: 1, text: playback === 'local'
        ? 'Ivory surge forward! The queen switches play, and Obsidian scramble across.'
        : 'Football Chess commentary. This is your selected voice.', clipKey: 'test', localOnly: playback === 'local', id: `voice-test:${epoch}:${++cueSequence}`}, {explicit: true});
    },
    reveal: line => speak(line?.deferred ? {...line, createdAt: now(), deferred: false} : line),
    setEnabled(value) {enabled = !!value && !destroyed && pace === COMMENTARY_PACE; if (!enabled) reset(); return enabled;},
    setPace,
    unlockLocal() {
      if (!localSupported || !enabled || pace !== COMMENTARY_PACE || playback !== 'local' || destroyed) return Promise.resolve(false);
      try {return Promise.resolve(localSpeech.unlock?.()).catch(() => false);} catch {return Promise.resolve(false);}
    },
    warmLocal() {
      if (!localSupported || !enabled || pace !== COMMENTARY_PACE || playback !== 'local' || destroyed) return Promise.resolve(false);
      if (!warming) {
        try {warming = Promise.resolve(localSpeech.load()).then(() => !!localState().ready, () => false)
          .finally(() => {warming = null; try {onPlaybackChanged(audioStatus);} catch {}});} catch {return Promise.resolve(false);}
      }
      return warming;
    },
    setPlayback(value) {
      if (!['recorded', 'device', 'local'].includes(value)) return false;
      if (playback !== value) {stopDemo(); cancelActive(); playback = value; status('idle');}
      return true;
    },
    refreshVoices,
    setVoice(id) {
      if (id !== null && !voiceOptions.some(voice => voice.id === id)) return false;
      chosenVoiceId = id; refreshVoices(); return true;
    },
    suspend({preserveGoal = false} = {}) {stopDemo(); cancelActive({preserveGoal});},
    reset,
    demo() {
      if (!enabled || pace !== COMMENTARY_PACE || destroyed) return false;
      reset(); demo = true;
      for (const line of COMMENTARY_DEMO) {
        if (!line.at) {speak({...line, id: `${epoch}:${line.id}`}, {demoCall: true}); continue;}
        const id = setTimer(() => {demoTimers.delete(id); speak({...line, id: `${epoch}:${line.id}`}, {demoCall: true});}, line.at);
        demoTimers.add(id);
      }
      const end = setTimer(() => {demoTimers.delete(end); demo = false;}, 25000);
      demoTimers.add(end); return true;
    },
    getState: () => ({enabled, supported: playback === 'local' ? (localSupported && localState().supported !== false) || recordedSupported : playback === 'recorded' ? recordedSupported || deviceSupported() : deviceSupported(),
      playback, recordedSupported, localSupported: localSupported && localState().supported !== false, localState: localState(), audioStatus, speaking: !!active, demo, pace, allowed: pace === COMMENTARY_PACE,
      voices: voiceOptions.map(voice => ({...voice})), voiceId: selectedVoice ? voiceId(selectedVoice) : null,
      voiceName: selectedVoice?.name || null,
      quality: selectedVoice ? /natural|neural/i.test(selectedVoice.name) ? 'natural' : voiceRank(selectedVoice) >= 70 ? 'enhanced' : 'standard' : 'unavailable'}),
    destroy() {reset(); enabled = false; destroyed = true;
      try {localSpeech?.destroy?.();} catch {}
      if (typeof speechSynthesis?.removeEventListener === 'function') speechSynthesis.removeEventListener('voiceschanged', voiceListener);
    }
  };
}
