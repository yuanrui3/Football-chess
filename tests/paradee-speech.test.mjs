import test from 'node:test';
import assert from 'node:assert/strict';
import { createParadeeSpeech } from '../dist/paradee-speech.js';

const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
function rig(overrides = {}) {
  const workers = [], contexts = [], states = [];
  const timers = new Map();
  let time = 1000, serial = 0;
  const setTimer = (fn, delay) => { const id = ++serial; timers.set(id, {at: time + delay, fn}); return id; };
  const clearTimer = id => timers.delete(id);
  class Worker {
    constructor(url, options) { this.url = url; this.options = options; this.messages = []; workers.push(this); }
    postMessage(value) { this.messages.push(value); }
    terminate() { this.terminated = true; }
    send(data) { this.onmessage?.({ data }); }
  }
  class AudioContext {
    constructor() { this.state = overrides.contextState || 'suspended'; this.sources = []; this.destination = {}; this.listeners = new Set(); this.resumeCalls = 0; contexts.push(this); }
    addEventListener(type, listener) { if (type === 'statechange') this.listeners.add(listener); }
    removeEventListener(type, listener) { if (type === 'statechange') this.listeners.delete(listener); }
    changeState(value) { this.state = value; for (const listener of [...this.listeners]) listener(); }
    resume() { this.resumeCalls++; this.changeState('running'); return Promise.resolve(); }
    close() { this.changeState('closed'); return Promise.resolve(); }
    createBuffer(channels, count, rate) { return { channels, count, rate, copyToChannel(samples) { this.samples = samples; } }; }
    createBufferSource() {
      const source = { start() { this.started = true; }, stop() { this.stopped = true; }, connect() {}, disconnect() {}, end() { this.onended?.(); } };
      this.sources.push(source); return source;
    }
  }
  const voice = createParadeeSpeech({ WorkerCtor: Worker, AudioContextCtor: AudioContext, onState: (s) => states.push(s), now: () => time, setTimer, clearTimer, ...overrides });
  async function loaded() { const promise = voice.load(); workers.at(-1).send({ type: 'ready' }); await promise; }
  function result(samples = new Float32Array([.1, -.1, .2])) {
    const request = workers.at(-1).messages.findLast((message) => message.type === 'synthesize');
    assert.ok(request, 'an inference request exists');
    workers.at(-1).send({ type: 'audio', id: request.id, samples, sampleRate: 24000 });
  }
  async function advance(ms) {
    const end = time + ms;
    for (;;) {
      const entry = [...timers].filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!entry) break;
      timers.delete(entry[0]); time = entry[1].at; entry[1].fn(); await flush();
    }
    time = end; await flush();
  }
  return { voice, workers, contexts, states, timers, loaded, result, advance, setTime(value) { time = value; } };
}

test('model and audio are both lazy; repeated load shares one worker', async () => {
  const r = rig();
  assert.equal(r.workers.length, 0); assert.equal(r.contexts.length, 0);
  const first = r.voice.load(), second = r.voice.load();
  assert.equal(first, second); assert.equal(r.workers.length, 1);
  assert.equal(r.workers[0].options.type, 'module');
  r.workers[0].send({ type: 'progress', progress: .45 });
  assert.equal(r.voice.getState().progress, .45);
  r.workers[0].send({ type: 'ready' });
  await first; assert.equal(r.voice.getState().ready, true);
  assert.equal(r.contexts.length, 0); r.voice.destroy();
});

test('unlock creates and resumes audio in the gesture without loading the model', async () => {
  const r = rig(); const promise = r.voice.unlock();
  assert.equal(r.contexts.length, 1); assert.equal(r.contexts[0].state, 'running');
  assert.equal(await promise, true); assert.equal(r.workers.length, 0); r.voice.destroy();
});

test('speak waits for inference then resolves only when playback ends', async () => {
  const r = rig(); await r.loaded(); await r.voice.unlock();
  let began = 0, finished = false;
  const promise = r.voice.speak('The queen switches play.', { onPlaying: () => began++ }).then((x) => { finished = true; return x; });
  await flush(); assert.equal(r.voice.getState().status, 'generating');
  assert.equal(r.contexts[0].sources.length, 0);
  r.result(); await flush(); assert.equal(began, 1);
  assert.equal(r.contexts[0].sources[0].started, true); assert.equal(finished, false);
  r.contexts[0].sources[0].end();
  assert.deepEqual(await promise, { spoken: true });
  assert.equal(r.voice.getState().status, 'ready'); r.voice.destroy();
});

test('no queue accumulates while an inference is in progress', async () => {
  const r = rig(); await r.loaded(); await r.voice.unlock();
  const first = r.voice.speak('A counterattack is on.'); await flush();
  assert.deepEqual(await r.voice.speak('A second stale line.'), { spoken: false, reason: 'busy' });
  assert.equal(r.workers[0].messages.filter((m) => m.type === 'synthesize').length, 1);
  r.voice.cancel(); assert.deepEqual(await first, { spoken: false, reason: 'cancelled' });
  assert.deepEqual(await r.voice.speak('Still waiting.'), { spoken: false, reason: 'busy' });
  r.result(); await flush(); assert.equal(r.contexts[0].sources.length, 0);
  assert.equal(r.voice.getState().busy, false); r.voice.destroy();
});

test('urgent match delivery reaches synthesis while unknown delivery stays normal', async () => {
  for (const [delivery, expected] of [['urgent', 'urgent'], ['shout-forever', 'normal']]) {
    const r = rig(); await r.loaded();
    const pending = r.voice.synthesize('Ivory break forward!', {delivery});
    await flush();
    assert.equal(r.workers[0].messages.at(-1).delivery, expected);
    r.result(); await pending; r.voice.destroy();
  }
});

test('Off during inference immediately resolves cancelled and stale audio never plays', async () => {
  const r = rig(); await r.loaded(); await r.voice.unlock();
  let called = 0; const first = r.voice.speak('Obsidian build from the back.', { onPlaying: () => called++ });
  await flush(); r.voice.cancel();
  assert.deepEqual(await first, { spoken: false, reason: 'cancelled' });
  r.result(); await flush();
  assert.equal(r.contexts[0].sources.length, 0); assert.equal(called, 0); r.voice.destroy();
});

test('cancel during first download does not speak after the model becomes ready', async () => {
  const r = rig(); await r.voice.unlock();
  const promise = r.voice.speak('Aurora press high.'); await flush(); r.voice.cancel();
  assert.deepEqual(await promise, { spoken: false, reason: 'cancelled' });
  r.workers[0].send({ type: 'ready' }); await flush();
  assert.equal(r.workers[0].messages.some((m) => m.type === 'synthesize'), false);
  assert.equal(r.voice.getState().ready, true); r.voice.destroy();
});

test('expired synthesis is dropped before audio or onPlaying starts', async () => {
  const r = rig(); await r.loaded(); await r.voice.unlock();
  let called = 0; const promise = r.voice.speak('They threaten the box.', { expiresAt: 6500, onPlaying: () => called++ });
  await flush(); r.setTime(6500); r.result(); await flush();
  assert.deepEqual(await promise, { spoken: false, reason: 'expired' });
  assert.equal(r.contexts[0].sources.length, 0); assert.equal(called, 0); r.voice.destroy();
});

test('an onPlaying callback can cancel before the sound starts', async () => {
  const r = rig(); await r.loaded(); await r.voice.unlock();
  const promise = r.voice.speak('The attack gathers pace.', { onPlaying: () => r.voice.cancel() });
  await flush(); r.result(); await flush();
  assert.deepEqual(await promise, { spoken: false, reason: 'cancelled' });
  assert.equal(r.contexts[0].sources[0].started, undefined); r.voice.destroy();
});

test('cancel during playback stops immediately and future speech still works', async () => {
  const r = rig(); await r.loaded(); await r.voice.unlock();
  const first = r.voice.speak('They work it down the wing.'); await flush(); r.result(); await flush();
  const old = r.contexts[0].sources[0]; r.voice.cancel();
  assert.equal(old.stopped, true); assert.deepEqual(await first, { spoken: false, reason: 'cancelled' });
  const next = r.voice.speak('Here comes the queen.'); await flush(); r.result(); await flush();
  r.contexts[0].sources[1].end(); assert.deepEqual(await next, { spoken: true }); r.voice.destroy();
});

test('an AbortSignal cancels synthesis and stale output stays silent', async () => {
  const r = rig(); await r.loaded(); const controller = new AbortController();
  const promise = r.voice.synthesize('The bishop finds space.', { signal: controller.signal });
  await flush(); controller.abort();
  await assert.rejects(promise, (error) => error.code === 'CANCELLED');
  r.result(); await flush(); assert.equal(r.contexts.length, 0); r.voice.destroy();
});

test('synthesize exposes actual samples separately without autoplay', async () => {
  const r = rig(); await r.loaded();
  const promise = r.voice.synthesize('A forward pass.'); await flush(); r.result();
  const audio = await promise; assert.equal(audio.sampleRate, 24000);
  assert.deepEqual(Array.from(audio.samples), Array.from(new Float32Array([.1, -.1, .2])));
  assert.equal(r.contexts.length, 0); r.voice.destroy();
});

test('speak never automatically creates or resumes an audio context', async () => {
  const r = rig(); await r.loaded();
  const promise = r.voice.speak('A move through midfield.'); await flush(); r.result();
  assert.deepEqual(await promise, { spoken: false, reason: 'audio_locked' });
  assert.equal(r.contexts.length, 0); r.voice.destroy();
});

test('load errors are visible and an explicit load can retry cleanly', async () => {
  const r = rig(); const first = r.voice.load();
  r.workers[0].send({ type: 'error', stage: 'load', message: 'Model not found' });
  await assert.rejects(first, /Model not found/); assert.equal(r.voice.getState().error, 'Model not found');
  assert.equal(r.workers[0].terminated, true);
  await r.loaded(); assert.equal(r.voice.getState().ready, true); assert.equal(r.voice.getState().error, null);
  r.voice.destroy();
});

test('invalid audio returns a usable failure rather than playing corrupt samples', async () => {
  const r = rig(); await r.loaded(); await r.voice.unlock();
  const promise = r.voice.speak('The ball moves forward.'); await flush(); r.result(new Float32Array([NaN]));
  assert.deepEqual(await promise, { spoken: false, reason: 'generation_failed' });
  assert.equal(r.contexts[0].sources.length, 0); r.voice.destroy();
});

test('destroy terminates inference and audio, settles pending work and blocks future use', async () => {
  const r = rig(); await r.loaded(); await r.voice.unlock();
  const promise = r.voice.speak('A dangerous cross.'); await flush(); r.voice.destroy();
  assert.deepEqual(await promise, { spoken: false, reason: 'cancelled' });
  assert.equal(r.workers[0].terminated, true); assert.equal(r.contexts[0].state, 'closed');
  assert.equal(r.voice.getState().status, 'closed');
  assert.deepEqual(await r.voice.speak('No more.'), { spoken: false, reason: 'destroyed' });
});

test('unsupported browsers stay lazy and fail clearly', async () => {
  const r = rig({ WorkerCtor: null, AudioContextCtor: null });
  assert.equal(r.voice.getState().supported, false);
  assert.equal(await r.voice.unlock(), false);
  await assert.rejects(r.voice.load(), (error) => error.code === 'UNSUPPORTED');
  assert.equal(r.workers.length, 0); r.voice.destroy();
});

test('late messages from a failed worker cannot mark a replacement ready', async () => {
  const r = rig(); const first = r.voice.load(); const old = r.workers[0];
  old.send({ type: 'error', stage: 'load', message: 'First load failed' });
  await assert.rejects(first);
  const second = r.voice.load(); old.send({ type: 'ready' });
  assert.equal(r.voice.getState().ready, false);
  r.workers[1].send({ type: 'ready' }); await second; r.voice.destroy();
});

test('an explicit gesture resumes an interrupted audio context instead of leaving Hugo silent', async () => {
  const r = rig({contextState: 'interrupted'});
  assert.equal(await r.voice.unlock(), true);
  assert.equal(r.contexts[0].resumeCalls, 1);
  assert.equal(r.voice.getState().audioState, 'running');
  assert.equal(r.voice.getState().unlocked, true);
  r.contexts[0].changeState('interrupted');
  assert.equal(r.voice.getState().unlocked, false);
  assert.equal(r.voice.getState().audioState, 'interrupted');
  assert.equal(await r.voice.unlock(), true);
  assert.equal(r.contexts[0].resumeCalls, 2);
  r.voice.destroy();
});

test('a closed audio context is recreated on the next gesture and old listeners are removed', async () => {
  const r = rig(); await r.voice.unlock();
  const old = r.contexts[0];
  assert.equal(old.listeners.size, 1);
  old.changeState('closed');
  assert.equal(r.voice.getState().unlocked, false);
  assert.equal(await r.voice.unlock(), true);
  assert.equal(r.contexts.length, 2);
  assert.equal(old.listeners.size, 0);
  assert.equal(r.contexts[1].listeners.size, 1);
  assert.equal(r.voice.getState().audioState, 'running');
  r.voice.destroy();
  assert.equal(r.contexts[1].listeners.size, 0);
});

test('a late rejection from an old resume cannot lock a replacement running audio context', async () => {
  const contexts = [];
  let rejectOldResume;
  class DelayedContext {
    constructor() { this.state = 'suspended'; this.listeners = new Set(); contexts.push(this); }
    addEventListener(type, listener) { if (type === 'statechange') this.listeners.add(listener); }
    removeEventListener(type, listener) { if (type === 'statechange') this.listeners.delete(listener); }
    changeState(value) { this.state = value; for (const listener of [...this.listeners]) listener(); }
    resume() {
      if (contexts[0] === this) return new Promise((resolve, reject) => { rejectOldResume = reject; });
      this.changeState('running'); return Promise.resolve();
    }
    close() { this.changeState('closed'); return Promise.resolve(); }
  }
  const r = rig({AudioContextCtor: DelayedContext});
  const oldUnlock = r.voice.unlock();
  contexts[0].changeState('closed');
  assert.equal(await r.voice.unlock(), true);
  assert.equal(contexts.length, 2);
  assert.equal(contexts[0].listeners.size, 0);
  rejectOldResume(new Error('The old audio context could not resume.'));
  assert.equal(await oldUnlock, false);
  assert.equal(r.voice.getState().unlocked, true);
  assert.equal(r.voice.getState().audioState, 'running');
  assert.equal(r.voice.getState().error, null);
  r.voice.destroy();
});

test('interruption during inference prevents false playback and a new gesture restores speech', async () => {
  const r = rig(); await r.loaded(); await r.voice.unlock();
  const pending = r.voice.speak('The bishop is supporting the queen.'); await flush();
  r.contexts[0].changeState('interrupted');
  r.result();
  assert.deepEqual(await pending, {spoken: false, reason: 'audio_locked'});
  assert.equal(r.contexts[0].sources.length, 0);
  assert.equal(r.voice.getState().audioState, 'interrupted');
  assert.equal(await r.voice.unlock(), true);
  const retry = r.voice.speak('The rook has a crossing option.'); await flush(); r.result(); await flush();
  assert.equal(r.contexts[0].sources[0].started, true);
  r.contexts[0].sources[0].end();
  assert.deepEqual(await retry, {spoken: true});
  r.voice.destroy();
});

test('interrupted playback settles unsuccessfully, rather than claiming the unheard call finished', async () => {
  const r = rig(); await r.loaded(); await r.voice.unlock();
  const pending = r.voice.speak('The queen is under pressure.'); await flush(); r.result(); await flush();
  const source = r.contexts[0].sources[0];
  assert.equal(source.started, true);
  r.contexts[0].changeState('interrupted');
  assert.deepEqual(await pending, {spoken: false, reason: 'audio_interrupted'});
  assert.equal(source.stopped, true);
  assert.equal(r.voice.getState().unlocked, false);
  r.voice.destroy();
});

test('an interruption between the onPlaying hook and source.start cannot produce false success', async () => {
  const r = rig(); await r.loaded(); await r.voice.unlock();
  const pending = r.voice.speak('The knight is making a run.', {onPlaying() {r.contexts[0].changeState('interrupted');}});
  await flush(); r.result();
  assert.deepEqual(await pending, {spoken: false, reason: 'audio_interrupted'});
  assert.equal(r.contexts[0].sources[0].started, undefined);
  r.voice.destroy();
});

test('a hung inference is bounded, terminates its worker and can load a clean replacement', async () => {
  const r = rig({generationTimeoutMs: 30000}); await r.loaded(); await r.voice.unlock();
  const old = r.workers[0], pending = r.voice.speak('The bishop has found a passing lane.'); await flush();
  const oldRequest = old.messages.at(-1);
  await r.advance(29999);
  assert.equal(old.terminated, undefined);
  assert.equal(r.voice.getState().busy, true);
  await r.advance(1);
  assert.deepEqual(await pending, {spoken: false, reason: 'generation_timeout'});
  assert.equal(old.terminated, true);
  assert.equal(r.voice.getState().busy, false);
  assert.equal(r.voice.getState().ready, false);
  assert.match(r.voice.getState().error, /took too long/);
  const loading = r.voice.load();
  old.send({type: 'audio', id: oldRequest.id, samples: new Float32Array([.1]), sampleRate: 24000});
  old.send({type: 'ready'});
  assert.equal(r.voice.getState().ready, false);
  r.workers[1].send({type: 'ready'}); await loading;
  const retry = r.voice.speak('The rook supports the attack.'); await flush(); r.result(); await flush();
  r.contexts[0].sources[0].end();
  assert.deepEqual(await retry, {spoken: true});
  assert.equal(r.timers.size, 0, 'successful audio clears the generation watchdog');
  r.voice.destroy();
});

test('cancelled inference may drain but its watchdog prevents perpetual busy without output', async () => {
  const r = rig({generationTimeoutMs: 1000}); await r.loaded();
  const pending = r.voice.speak('The queen advances.'); await flush();
  r.voice.cancel();
  assert.deepEqual(await pending, {spoken: false, reason: 'cancelled'});
  assert.equal(r.voice.getState().busy, true);
  assert.deepEqual(await r.voice.speak('Another call.'), {spoken: false, reason: 'busy'});
  await r.advance(1000);
  assert.equal(r.voice.getState().busy, false);
  assert.equal(r.workers[0].terminated, true);
  assert.equal(r.contexts.length, 0);
  r.voice.destroy();
});

test('a returned worker error and destroy both clear generation watchdogs', async () => {
  const r = rig({generationTimeoutMs: 1000}); await r.loaded();
  const failed = r.voice.speak('The rook switches play.'); await flush();
  const worker = r.workers[0], request = worker.messages.at(-1);
  worker.send({type: 'error', stage: 'synthesize', id: request.id, message: 'Inference failed'});
  assert.deepEqual(await failed, {spoken: false, reason: 'generation_failed'});
  assert.equal(r.timers.size, 0);
  const cancelled = r.voice.speak('The bishop supports.'); await flush();
  assert.equal(r.timers.size, 1);
  r.voice.destroy();
  assert.deepEqual(await cancelled, {spoken: false, reason: 'cancelled'});
  assert.equal(r.timers.size, 0);
});
