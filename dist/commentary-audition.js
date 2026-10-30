import {AUDITION_CLIPS} from './commentary-audition-clips.js?v=1c932a0a4de7';

// A single media element owns playback. Only its natural ended event starts
// the gap before another sentence; clip metadata never acts as a cutoff timer.
export function createAuditionPlayer({clips, audio, setTimer = setTimeout, clearTimer = clearTimeout, gapMs = 3000, onState = () => {}}) {
  const byId = new Map(clips.map(clip => [clip.id, clip]));
  let token = 0, timer = null, queue = [], current = null, status = 'idle', error = '', destroyed = false;
  const snapshot = () => ({status, clip: current, remaining: queue.length, error});
  const emit = () => onState(snapshot());
  function quietAudio() {
    audio.onplaying = audio.onended = audio.onerror = audio.onpause = null;
    audio.pause();
  }
  function stop() {
    token++;
    if (timer !== null) clearTimer(timer);
    timer = null; queue = []; current = null; status = 'idle'; error = '';
    quietAudio();
    try {audio.currentTime = 0;} catch {}
    emit();
  }
  function start(clip) {
    const ownToken = ++token;
    quietAudio(); current = clip; error = ''; status = 'loading';
    const valid = () => !destroyed && ownToken === token;
    const fail = () => {
      if (!valid()) return;
      token++; queue = []; status = 'error';
      error = 'This recording could not play. Try Play call again, or use its download link.';
      quietAudio(); emit();
    };
    audio.onplaying = () => {
      if (!valid()) return;
      // Replaying through the native controls is an explicit choice. Cancel
      // a pending sequence so its next call cannot cut that replay short.
      if (status === 'waiting') {
        if (timer !== null) clearTimer(timer);
        timer = null; queue = [];
      }
      status = 'playing'; emit();
    };
    audio.onpause = () => {if (valid() && status === 'playing' && !audio.ended) {status = 'paused'; emit();}};
    audio.onerror = fail;
    audio.onended = () => {
      if (!valid()) return;
      if (!queue.length) {status = 'finished'; emit(); return;}
      status = 'waiting'; emit();
      timer = setTimer(() => {
        timer = null;
        if (valid() && status === 'waiting' && queue.length) start(queue.shift());
      }, gapMs);
    };
    audio.src = clip.src;
    emit();
    try {Promise.resolve(audio.play()).catch(fail);} catch {fail();}
  }
  return {
    play(id) {
      if (destroyed || !byId.has(id)) return false;
      stop(); start(byId.get(id)); return true;
    },
    playVoice(voice) {
      const selected = clips.filter(clip => clip.voice === voice);
      if (destroyed || !selected.length) return false;
      stop(); queue = selected.slice(1); start(selected[0]); return true;
    },
    stop,
    getState: snapshot,
    destroy() {stop(); destroyed = true;}
  };
}

function mountAudition() {
  const $ = id => document.getElementById(id);
  const names = [...new Set(AUDITION_CLIPS.map(clip => clip.voice))];
  const descriptions = {Kirk: 'British · textured and animated', Tom: 'British · assured and authoritative', Mark: 'American · bright and excited'};
  const icons = {Kirk: '♜', Tom: '♝', Mark: '♞'};
  const situationNames = {analysis: 'Building an attack', danger: 'The defence opens', save: 'A save or loose ball', goal: 'The goal call'};
  const controls = new Map(), groups = new Map();
  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  for (const voice of names) {
    const option = el('option', '', voice); option.value = voice; $('auditionVoice').append(option);
    const group = el('section', 'audition-voice'); group.setAttribute('aria-label', `${voice} recordings`); groups.set(voice, group);
    const heading = el('div', 'audition-voice-heading'), title = el('div');
    title.append(el('h2', '', voice), el('p', '', descriptions[voice] || 'Male match commentator'));
    const emblem = el('span', '', icons[voice] || '♞'); emblem.setAttribute('aria-hidden', 'true');
    heading.append(title, emblem); group.append(heading);
    for (const [index, clip] of AUDITION_CLIPS.filter(clip => clip.voice === voice).entries()) {
      const situation = String(clip.situation).toLowerCase();
      const card = el('article', 'audition-call'), top = el('div', 'audition-call-top');
      top.append(el('span', 'audition-call-number', String(index + 1).padStart(2, '0')), el('h3', '', situationNames[situation] || clip.situation), el('span', 'audition-delivery', clip.delivery));
      const script = el('p', 'audition-script', `“${clip.text}”`), tools = el('div', 'audition-call-tools');
      const play = el('button', '', '▶ Play call'); play.type = 'button';
      play.setAttribute('aria-label', `Play ${voice}: ${situationNames[situation] || clip.situation}`);
      play.setAttribute('aria-pressed', 'false'); play.addEventListener('click', () => player.play(clip.id));
      const details = el('span', 'audition-duration');
      if (Number.isFinite(clip.durationSeconds)) details.textContent = `${clip.durationSeconds.toFixed(1)}s`;
      const download = el('a', '', 'Download ↗'); download.href = clip.src; download.download = `${clip.id}.mp3`;
      download.setAttribute('aria-label', `Download ${voice} ${clip.situation} recording`);
      tools.append(play, details, download); card.append(top, script, tools); group.append(card);
      controls.set(clip.id, {card, play});
    }
    $('auditionVoices').append(group);
  }
  const player = createAuditionPlayer({clips: AUDITION_CLIPS, audio: $('auditionAudio'), onState(state) {
    for (const [id, entry] of controls) {
      const active = state.clip?.id === id && !['idle', 'finished', 'error'].includes(state.status);
      entry.card.classList.toggle('active', active);
      entry.play.setAttribute('aria-pressed', String(active));
      entry.play.textContent = active && state.status === 'playing' ? '● Playing' : '▶ Play call';
    }
    const labels = {idle: 'READY WHEN YOU ARE', loading: 'LOADING RECORDING', playing: 'NOW PLAYING', paused: 'RECORDING PAUSED', waiting: 'NEXT CALL IN 3 SECONDS', finished: 'SAMPLE COMPLETE', error: 'PLAYBACK UNAVAILABLE'};
    $('auditionStatus').textContent = labels[state.status] || '';
    $('auditionCaption').textContent = state.clip ? `${state.clip.voice} · ${state.clip.text}` : state.status === 'finished' ? 'Compare another voice, or return to any call you want to hear again.' : 'Pick any call below, or play a full voice sample.';
    $('stopAudition').disabled = ['idle', 'finished'].includes(state.status);
    $('auditionError').hidden = !state.error; $('auditionError').textContent = state.error;
  }});
  function highlightVoice() {
    for (const [voice, group] of groups) group.classList.toggle('selected', voice === $('auditionVoice').value);
  }
  $('auditionVoice').addEventListener('change', () => {player.stop(); highlightVoice();});
  $('playSequence').addEventListener('click', () => player.playVoice($('auditionVoice').value));
  $('stopAudition').addEventListener('click', () => player.stop());
  window.addEventListener('pagehide', () => player.stop());
  highlightVoice();
}
if (typeof document !== 'undefined') mountAudition();
