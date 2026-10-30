import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const source = await readFile(new URL('../dist/commentary-audition.js', import.meta.url), 'utf8');
const {createAuditionPlayer} = await import(`data:text/javascript;base64,${Buffer.from(source.replace(/^import \{AUDITION_CLIPS\} from [^;]+;/m, 'const AUDITION_CLIPS = [];')).toString('base64')}`);
const clips = ['analysis', 'danger', 'save', 'goal'].map(situation => ({id: `kirk-${situation}`, voice: 'Kirk', situation, text: `${situation} is a whole sentence.`, src: `${situation}.mp3`, durationSeconds: 1}));
clips.push({id: 'tom-goal', voice: 'Tom', situation: 'goal', text: 'A goal.', src: 'tom.mp3', durationSeconds: 20});
function harness({reject = false} = {}) {
  const states = [], timers = new Map(); let serial = 0;
  const audio = {src: '', currentTime: 0, ended: false, playing: false, pauses: 0, plays: [],
    pause() {this.playing = false; this.pauses++; this.onpause?.();},
    play() {this.plays.push(this.src); if (reject) return Promise.reject(Error('autoplay denied')); return Promise.resolve();}};
  const player = createAuditionPlayer({clips, audio, onState: state => states.push(state), setTimer(fn, ms) {const id = ++serial; timers.set(id, {fn, ms}); return id;}, clearTimer(id) {timers.delete(id);}});
  return {player, audio, states, timers,
    playing() {audio.playing = true; audio.ended = false; audio.onplaying?.();},
    end() {audio.playing = false; audio.ended = true; audio.onended?.();},
    runGap() {const entries = [...timers.entries()]; for (const [id, {fn}] of entries) {timers.delete(id); fn();}}};
}

test('a four-call sample waits for natural audio completion, never a duration estimate', () => {
  const h = harness(); assert.equal(h.player.playVoice('Kirk'), true); h.playing();
  assert.equal(h.player.getState().status, 'playing');
  assert.equal(h.timers.size, 0, 'a one-second metadata duration creates no cutoff or next-call timer');
  assert.deepEqual(h.audio.plays, ['analysis.mp3']);
  for (const [index, situation] of ['analysis', 'danger', 'save', 'goal'].entries()) {
    assert.equal(h.player.getState().clip.situation, situation);
    h.end();
    if (index < 3) {
      assert.equal(h.player.getState().status, 'waiting');
      assert.deepEqual([...h.timers.values()].map(timer => timer.ms), [3000]);
      assert.equal(h.audio.plays.length, index + 1, 'the gap follows the complete sentence');
      h.runGap(); h.playing();
    }
  }
  assert.equal(h.player.getState().status, 'finished'); assert.equal(h.timers.size, 0);
  assert.deepEqual(h.audio.plays, ['analysis.mp3', 'danger.mp3', 'save.mp3', 'goal.mp3']);
});

test('explicit stop during a sentence prevents stale events from continuing the sample', () => {
  const h = harness(); h.player.playVoice('Kirk'); h.playing();
  const staleEnd = h.audio.onended, stalePlaying = h.audio.onplaying;
  h.player.stop(); staleEnd(); stalePlaying(); h.runGap();
  assert.equal(h.player.getState().status, 'idle'); assert.equal(h.audio.playing, false);
  assert.equal(h.audio.currentTime, 0); assert.equal(h.audio.plays.length, 1);
});

test('explicit stop during the gap cancels the next recording', () => {
  const h = harness(); h.player.playVoice('Kirk'); h.end();
  const staleGap = [...h.timers.values()][0].fn;
  h.player.stop(); staleGap();
  assert.equal(h.timers.size, 0); assert.equal(h.audio.plays.length, 1);
  assert.equal(h.player.getState().status, 'idle');
});

test('starting any individual call replaces the current source and drops its old queue', () => {
  const h = harness(); h.player.playVoice('Kirk'); h.playing();
  const staleEnd = h.audio.onended;
  h.player.play('tom-goal'); h.playing(); staleEnd();
  assert.equal(h.player.getState().clip.id, 'tom-goal'); assert.equal(h.player.getState().remaining, 0);
  assert.equal(h.audio.src, 'tom.mp3'); assert.ok(h.audio.pauses >= 2);
  h.end(); h.runGap(); assert.equal(h.audio.plays.length, 2);
});

test('native pause holds a sentence without advancing its queue, and resume remains the same call', () => {
  const h = harness(); h.player.playVoice('Kirk'); h.playing(); h.audio.pause();
  assert.equal(h.player.getState().status, 'paused'); assert.equal(h.timers.size, 0);
  h.playing(); assert.equal(h.player.getState().status, 'playing');
  assert.equal(h.player.getState().clip.id, 'kirk-analysis'); assert.equal(h.player.getState().remaining, 3);
});

test('native replay during a gap cancels the sample so the next call cannot cut it off', () => {
  const h = harness(); h.player.playVoice('Kirk'); h.end();
  const staleGap = [...h.timers.values()][0].fn;
  h.playing(); staleGap();
  assert.equal(h.player.getState().status, 'playing');
  assert.equal(h.player.getState().remaining, 0); assert.equal(h.timers.size, 0);
  assert.equal(h.player.getState().clip.id, 'kirk-analysis');
  assert.deepEqual(h.audio.plays, ['analysis.mp3']);
  h.end(); assert.equal(h.player.getState().status, 'finished');
});

test('replaying a completed call through native controls still updates playback and permits stop', () => {
  const h = harness(); h.player.play('tom-goal'); h.end();
  assert.equal(h.player.getState().status, 'finished');
  h.playing(); assert.equal(h.player.getState().status, 'playing');
  assert.equal(h.player.getState().clip.id, 'tom-goal');
  h.player.stop(); assert.equal(h.audio.playing, false); assert.equal(h.player.getState().status, 'idle');
});

test('a playback failure stops the sequence and exposes a recoverable error', async () => {
  const h = harness({reject: true}); h.player.playVoice('Kirk');
  await Promise.resolve(); await Promise.resolve();
  assert.equal(h.player.getState().status, 'error'); assert.equal(h.player.getState().remaining, 0);
  assert.match(h.player.getState().error, /download link/); assert.equal(h.timers.size, 0);
  h.player.stop(); assert.equal(h.player.getState().error, '');
});

test('unknown clips and voices do not interrupt the current source', () => {
  const h = harness(); h.player.play('tom-goal');
  assert.equal(h.player.play('missing'), false); assert.equal(h.player.playVoice('missing'), false);
  assert.equal(h.player.getState().clip.id, 'tom-goal'); assert.equal(h.audio.plays.length, 1);
});

test('destroy cancels all future playback and ignores late media completion', () => {
  const h = harness(); h.player.playVoice('Kirk'); h.end(); const gap = [...h.timers.values()][0].fn;
  h.player.destroy(); gap(); assert.equal(h.player.play('tom-goal'), false);
  assert.equal(h.audio.plays.length, 1); assert.equal(h.timers.size, 0);
});

test('audition explicitly separates scripted examples from the live match and uses one native player', async () => {
  const html = await readFile(new URL('../dist/commentary-audition.html', import.meta.url), 'utf8');
  const main = await readFile(new URL('../dist/index.html', import.meta.url), 'utf8');
  assert.equal((html.match(/<audio\b/g) || []).length, 1);
  assert.match(html, /scripted audition situations/); assert.match(html, /does not change your live match commentator/);
  assert.match(html, /Relaxed · 3 seconds/); assert.match(html, /natural end/);
  assert.match(main, /href="\.\/commentary-audition\.html"/);
  assert.doesNotMatch(source, /fetch\(|generate_speech|speechSynthesis|new Audio/);
  assert.match(source, /clip\.text/); assert.doesNotMatch(source, /durationSeconds\s*\*/);
});
