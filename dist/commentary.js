/** Public match commentary only: no engine calls, seeds, hidden targets or AI search. */
const TEAM_NAMES = {white: 'Ivory', black: 'Obsidian'};
const PIECE_NAMES = {K: 'keeper', Q: 'queen', R: 'rook', B: 'bishop', N: 'knight', P: 'pawn'};
const NUMBERS = {'1': 'one', '2': 'two', '3': 'three'};
const RESULTS = ['goal', 'save', 'shotMiss', 'blockedShot'];
export const COMMENTARY_PRIORITY = Object.freeze({trend: 1, attempt: 2, outcome: 3, goal: 4});
export const COMMENTARY_PACE = 3000;
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
    const text = shot.penalty ? `${ownedPiece(shooterId)} takes the penalty!`
      : backwards ? `${ownedPiece(shooterId)} sends it towards their own goal!`
        : `${ownedPiece(shooterId)} shoots${distance > 8 ? ' from range' : ''}!`;
    return event('attempt', text, before, after, action, {shot: true});
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
        : `${cap(commentaryPiece(shooterId))}${shot.penalty ? ' converts the penalty' : ' scores'}!`;
      return event('goal', `GOAL for ${teamName(team)}! ${scorer}${assist} ${scoreText(after.score)}`, before, after, action, {shot: true, team, ownGoal});
    }
    if (action.type === 'save') {
      const keeperTeam = teamOf(action.keeperId) || action.team || shot.defendingTeam;
      const text = action.backPass ? `${teamName(keeperTeam)}'s keeper gathers the backward ball and must release it.`
        : action.outcome === 'corner' ? `${teamName(keeperTeam)}'s keeper turns it behind!${restartLine(action.restart)}`
          : `Saved by ${teamName(keeperTeam)}'s keeper! The keeper holds it.`;
      return event('outcome', text, before, after, action, {shot: true});
    }
    if (action.type === 'blockedShot') {
      const blocker = action.blockerId ? ownedPiece(action.blockerId) : `${teamName(action.team)}'s defender`;
      const ending = action.outcome === 'blocked' ? ' The defender takes possession.' : restartLine(action.restart);
      return event('outcome', `Blocked by ${blocker}!${ending}`, before, after, action, {shot: true});
    }
    return event('outcome', `${teamName(shootingTeam)} shoot wide!${restartLine(action.restart)}`, before, after, action, {shot: true});
  }
  if (action.type === 'foul' && after.restart?.type === 'penalty') {
    return event('outcome', `Penalty to ${teamName(after.restart.team)}! A foul inside the box.`, before, after, action);
  }
  return null;
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
  let text = null, shortText = null;
  if (previous && run.length <= 3 && gain >= 4) {
    text = `${teamName(team)} have won it back and broken forward. A quick switch of the initiative!`;
    shortText = `${teamName(team)} break forward. The initiative changes hands.`;
  } else if (recent.length >= 3 && gain >= 3) {
    const central = last.ball.x >= Math.floor(width / 3) && last.ball.x < Math.ceil(width * 2 / 3);
    text = central ? `${teamName(team)} are advancing through the centre. The fight is for central space.`
      : `${teamName(team)} are making ground on the wing, working the outer files.`;
    shortText = central ? `${teamName(team)} advance through the centre.` : `${teamName(team)} advance along the outer files.`;
  } else if (recent.length >= 3 && recent.every(sample => progress(sample) >= height * 2 / 3)) {
    text = `${teamName(team)} are keeping the ball in the attacking third. Sustained territorial pressure.`;
    shortText = `${teamName(team)} keep possession in the attacking third.`;
  } else if (recent.length >= 4 && Math.abs(gain) < 2) {
    text = `${teamName(team)} are circulating possession, but gaining little ground. The initiative is waiting to be taken.`;
    shortText = `${teamName(team)} circulate possession without gaining ground.`;
  }
  return text ? {kind: 'trend', priority: COMMENTARY_PRIORITY.trend, text, shortText, team, id: `trend:${last.turn}:${team}:${last.ball.x}:${last.ball.y}`} : null;
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
  {at: 0, kind: 'trend', text: 'Commentary demo. Ivory are advancing on the wing, working the outer files.'},
  {at: 5000, kind: 'attempt', text: "Ivory's rook two shoots from range!"},
  {at: 8500, kind: 'outcome', text: "Saved by Obsidian's keeper! The keeper holds it."},
  {at: 12500, kind: 'trend', text: 'Now Obsidian break forward. A quick switch of the initiative!'},
  {at: 17000, kind: 'goal', text: 'GOAL for Obsidian! Knight one scores! Ivory nil, Obsidian one.'}
].map((line, index) => Object.freeze({...line, priority: COMMENTARY_PRIORITY[line.kind], id: `demo:${index}`, demo: true})));

/**
 * No speech backlog. Priority calls replace lower-priority speech; stale calls drop.
 * UI must defer shot results until visible impact via observe(...,{deferResult:true})
 * then reveal(event). onCaption(text,event) also works when browser TTS is absent.
 */
export function createCommentary({speechSynthesis = globalThis.speechSynthesis,
  Utterance = globalThis.SpeechSynthesisUtterance, onCaption = () => {}, onVoicesChanged = () => {}, now = () => Date.now(),
  setTimer = (fn, delay) => setTimeout(fn, delay), clearTimer = id => clearTimeout(id)} = {}) {
  let enabled = false, destroyed = false, epoch = 0, pace = 1200, active = null, watchdog = null;
  let lastSpoken = -Infinity, lastTrend = -Infinity, lastAttempt = -Infinity, demo = false;
  const samples = [], seen = new Set(), spoken = new Set(), demoTimers = new Set();
  const supported = !!(speechSynthesis && typeof speechSynthesis.speak === 'function' && typeof Utterance === 'function');
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
  const remember = (set, key) => {set.add(key); if (set.size > 120) set.delete(set.values().next().value);};
  function cancelActive({preserveGoal = false} = {}) {
    if (preserveGoal && active?.event.kind === 'goal' && !active.event.demo) return;
    if (watchdog !== null) clearTimer(watchdog);
    watchdog = null;
    const previous = active; active = null;
    if (previous && supported) {try {speechSynthesis.cancel();} catch { /* Captions remain available. */ }}
    caption('', null);
  }
  function stopDemo() {
    for (const id of demoTimers) clearTimer(id);
    demoTimers.clear(); demo = false;
  }
  function finish(token) {
    if (active?.token !== token) return;
    if (watchdog !== null) clearTimer(watchdog);
    watchdog = null; active = null; caption('', null);
  }
  function speak(line, {demoCall = false} = {}) {
    if (!enabled || pace !== COMMENTARY_PACE || destroyed || !line?.text || !COMMENTARY_PRIORITY[line.kind]) return false;
    if (demo && !demoCall) return false;
    if (!demoCall && line.epoch !== undefined && line.epoch !== epoch) return false;
    const at = now(), ttl = line.kind === 'goal' ? 30000 : line.kind === 'outcome' ? 12000 : 6000;
    if (!demoCall && finite(line.createdAt) && at - line.createdAt > ttl) return false;
    if (spoken.has(line.id)) return false;
    if (active && line.priority <= active.event.priority && line.kind !== 'goal') return false;
    if (!demoCall && line.kind === 'trend' && (at - lastTrend < (pace < 700 ? 30000 : 20000) || at - lastSpoken < (pace < 700 ? 12000 : 8000))) return false;
    if (!demoCall && line.kind === 'attempt' && at - lastAttempt < (pace < 700 ? 3000 : 1200)) return false;
    cancelActive();
    const text = pace < 700 && line.kind === 'trend' && line.shortText ? line.shortText : line.text;
    const token = {}, spokenEvent = {...line, text};
    active = {token, event: spokenEvent};
    remember(spoken, line.id); lastSpoken = at;
    if (line.kind === 'trend') lastTrend = at;
    if (line.kind === 'attempt') lastAttempt = at;
    caption(text, spokenEvent);
    const duration = Math.min(18000, Math.max(2200, text.split(/\s+/).length * 430 + 1200));
    watchdog = setTimer(() => {
      if (active?.token !== token) return;
      // Some browsers never fire end/error after switching tabs.
      if (supported) {try {speechSynthesis.cancel();} catch {}}
      finish(token);
    }, duration);
    if (supported && (typeof speechSynthesis.getVoices !== 'function' || selectedVoice)) {
      try {
        const utterance = new Utterance(text);
        if (selectedVoice) utterance.voice = selectedVoice;
        utterance.lang = selectedVoice?.lang || 'en-US';
        utterance.rate = 1;
        utterance.pitch = 1;
        utterance.volume = 1;
        utterance.onend = () => finish(token);
        utterance.onerror = () => { /* Keep captions for their natural reading duration. */ };
        speechSynthesis.speak(utterance);
      } catch { /* Caption-only fallback, with the same timing. */ }
    }
    return true;
  }
  function observe(before, after, options = {}) {
    if (destroyed || !before || !after || before === after) return null;
    if (finite(options.pace)) setPace(options.pace);
    let line = commentaryEvent(before, after, options);
    if (after.restart || ['kickoff', 'finished'].includes(after.phase) || line?.kind === 'goal') samples.length = 0;
    const turnover = !after.restart && before.attack !== after.attack && point(after.ball) && TEAM_NAMES[after.attack];
    if (!line && (completedCommentaryRound(before, after) || turnover) && point(after.ball) && TEAM_NAMES[after.attack]) {
      const sample = {turn: after.turn, team: after.attack, ball: {x: after.ball.x, y: after.ball.y}};
      if (samples.at(-1)?.turn !== sample.turn) {samples.push(sample); if (samples.length > 10) samples.shift();}
      line = analyseCommentaryTrend(samples);
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
    lastSpoken = lastTrend = lastAttempt = -Infinity;
  }
  function setPace(value) {
    if (!finite(value)) return;
    pace = Math.max(0, value);
    if (pace !== COMMENTARY_PACE) {enabled = false; reset();}
  }
  return {
    observe,
    reveal: line => speak(line?.deferred ? {...line, createdAt: now(), deferred: false} : line),
    setEnabled(value) {enabled = !!value && !destroyed && pace === COMMENTARY_PACE; if (!enabled) reset(); return enabled;},
    setPace,
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
    getState: () => ({enabled, supported, speaking: !!active, demo, pace, allowed: pace === COMMENTARY_PACE,
      voices: voiceOptions.map(voice => ({...voice})), voiceId: selectedVoice ? voiceId(selectedVoice) : null,
      voiceName: selectedVoice?.name || null,
      quality: selectedVoice ? /natural|neural/i.test(selectedVoice.name) ? 'natural' : voiceRank(selectedVoice) >= 70 ? 'enhanced' : 'standard' : 'unavailable'}),
    destroy() {reset(); enabled = false; destroyed = true;
      if (typeof speechSynthesis?.removeEventListener === 'function') speechSynthesis.removeEventListener('voiceschanged', voiceListener);
    }
  };
}
