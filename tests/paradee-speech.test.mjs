import test from 'node:test';
import assert from 'node:assert/strict';
import { createParadeeSpeech } from '../dist/paradee-speech.js';

const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
function rig(overrides = {}) {
  const workers = [], contexts = [], states = [];
  let time = 1000;
  class Worker {
    constructor(url, options) { this.url = url; this.options = options; this.messages = []; workers.push(this); }
    postMessage(value) { this.messages.push(value); }
    terminate() { this.terminated = true; }
    send(data) { this.onmessage?.({ data }); }
  }
  class AudioContext {
    constructor() { this.state = 'suspended'; this.sources = []; this.destination = {}; contexts.push(this); }
    resume() { this.state = 'running'; return Promise.resolve(); }
    close() { this.state = 'closed'; return Promise.resolve(); }
    createBuffer(channels, count, rate) { return { channels, count, rate, copyToChannel(samples) { this.samples = samples; } }; }
    createBufferSource() {
      const source = { start() { this.started = true; }, stop() { this.stopped = true; }, connect() {}, disconnect() {}, end() { this.onended?.(); } };
      this.sources.push(source); return source;
    }
  }
  const voice = createParadeeSpeech({ WorkerCtor: Worker, AudioContextCtor: AudioContext, onState: (s) => states.push(s), now: () => time, ...overrides });
  async function loaded() { const promise = voice.load(); workers.at(-1).send({ type: 'ready' }); await promise; }
  function result(samples = new Float32Array([.1, -.1, .2])) {
    const request = workers.at(-1).messages.findLast((message) => message.type === 'synthesize');
    assert.ok(request, 'an inference request exists');
    workers.at(-1).send({ type: 'audio', id: request.id, samples, sampleRate: 24000 });
  }
  return { voice, workers, contexts, states, loaded, result, setTime(value) { time = value; } };
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
