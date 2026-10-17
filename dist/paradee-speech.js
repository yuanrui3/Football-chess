// Local speech transport (legacy filename). Inference stays in a worker; playback begins
// only after the current request, deadline and user audio permission are checked.
export const PARADEE_SAMPLE_RATE = 24000;

function speechError(message, code) {
  const error = new Error(message);
  error.code = code;
  return error;
}

export function createParadeeSpeech({
  WorkerCtor = globalThis.Worker,
  AudioContextCtor = globalThis.AudioContext || globalThis.webkitAudioContext,
  workerUrl = new URL('./paradee-worker.js?v=7b278aba28ef', import.meta.url),
  assets = {},
  onState = () => {},
  now = () => Date.now(),
  setTimer = (fn, delay) => setTimeout(fn, delay),
  clearTimer = (id) => clearTimeout(id),
  loadTimeoutMs = 90000,
} = {}) {
  const supported = typeof WorkerCtor === 'function' && typeof AudioContextCtor === 'function';
  let worker = null;
  let context = null;
  let disposed = false;
  let ready = false;
  let unlocked = false;
  let loading = null;
  let loadResolve = null;
  let loadReject = null;
  let loadTimer = null;
  let generation = null;
  let active = null;
  let source = null;
  let finishPlayback = null;
  let serial = 0;
  let state = { status: supported ? 'idle' : 'unsupported', progress: 0, ready: false,
    supported, unlocked: false, error: null, busy: false };

  function publish(patch) {
    state = { ...state, ...patch, ready, unlocked, busy: !!(active || generation) };
    try { onState({ ...state }); } catch { /* UI callbacks cannot stop playback cleanup. */ }
  }
  function resting() {
    publish({ status: generation ? 'generating' : loading ? 'loading' : ready ? 'ready' : supported ? 'idle' : 'unsupported' });
  }
  function endJob(job, value, error) {
    if (!job || job.finished) return;
    job.finished = true;
    if (job.signal && job.abort) job.signal.removeEventListener('abort', job.abort);
    if (active === job) active = null;
    if (error) job.reject(error); else job.resolve(value);
    resting();
  }
  function stopSource() {
    const current = source;
    source = null;
    const finish = finishPlayback;
    finishPlayback = null;
    if (finish) finish({ spoken: false, reason: 'cancelled' });
    if (!current) return;
    current.onended = null;
    try { current.stop(); } catch { /* Already ended or not started. */ }
    try { current.disconnect(); } catch { /* Already disconnected. */ }
  }
  function cancel() {
    const job = active;
    stopSource();
    if (job) endJob(job, { spoken: false, reason: 'cancelled' },
      job.kind === 'synthesize' || job.kind === 'play' ? speechError('Speech cancelled.', 'CANCELLED') : null);
  }
  function failWorker(error) {
    const message = error?.message || String(error || 'The local speech worker failed.');
    if (loadTimer !== null) clearTimer(loadTimer);
    loadTimer = null;
    ready = false;
    const rejectLoad = loadReject;
    loadResolve = loadReject = null;
    loading = null;
    if (worker) worker.terminate();
    worker = null;
    const pending = generation;
    generation = null;
    publish({ status: 'error', error: message, progress: 0 });
    if (rejectLoad) rejectLoad(speechError(message, 'LOAD_FAILED'));
    if (pending) pending.reject(speechError(message, 'GENERATION_FAILED'));
  }
  function receive(event) {
    const data = event?.data || {};
    if (disposed) return;
    if (data.type === 'progress') {
      if (!ready) publish({ status: 'loading', progress: Math.max(0, Math.min(1, Number(data.progress) || 0)) });
    } else if (data.type === 'ready') {
      if (loadTimer !== null) clearTimer(loadTimer);
      loadTimer = null;
      ready = true;
      const resolve = loadResolve;
      loadResolve = loadReject = null;
      loading = null;
      publish({ status: 'ready', progress: 1, error: null });
      if (resolve) resolve(true);
    } else if (data.type === 'audio' && generation?.id === data.id) {
      const pending = generation;
      generation = null;
      const samples = data.samples instanceof Float32Array ? data.samples : new Float32Array(data.samples);
      if (!samples.length || samples.some((sample) => !Number.isFinite(sample))) {
        pending.reject(speechError('The local voice returned invalid audio.', 'GENERATION_FAILED'));
      } else {
        pending.resolve({ samples, sampleRate: Number(data.sampleRate) || PARADEE_SAMPLE_RATE });
      }
      resting();
    } else if (data.type === 'error') {
      if (data.stage === 'load' || !ready) {
        failWorker(speechError(data.message || 'Could not load the local voice.', 'LOAD_FAILED'));
      } else if (generation?.id === data.id) {
        const pending = generation;
        generation = null;
        publish({ status: 'error', error: data.message || 'Could not generate speech.' });
        pending.reject(speechError(data.message || 'Could not generate speech.', 'GENERATION_FAILED'));
      }
    }
  }
  function load() {
    if (disposed) return Promise.reject(speechError('The local voice was closed.', 'DESTROYED'));
    if (!supported) return Promise.reject(speechError('This browser cannot run the local voice.', 'UNSUPPORTED'));
    if (ready) return Promise.resolve(true);
    if (loading) return loading;
    publish({ status: 'loading', progress: 0, error: null });
    loading = new Promise((resolve, reject) => { loadResolve = resolve; loadReject = reject; });
    const promise = loading;
    try {
      const created = new WorkerCtor(workerUrl, { type: 'module', name: 'male-match-commentary' });
      worker = created;
      created.onmessage = (event) => { if (worker === created) receive(event); };
      created.onerror = (event) => {
        if (worker === created) failWorker(speechError(event?.message || 'The local speech worker failed.', 'WORKER_FAILED'));
      };
      loadTimer = setTimer(() => failWorker(speechError('The local voice took too long to load. Try again.', 'LOAD_TIMEOUT')), loadTimeoutMs);
      worker.postMessage({ type: 'load', assets });
    } catch (error) { failWorker(error); }
    return promise;
  }
  // Call directly inside On / Start / Test's user gesture, before awaiting a download.
  function unlock() {
    if (disposed || !supported) return Promise.resolve(false);
    try {
      context ||= new AudioContextCtor({ latencyHint: 'interactive' });
      const resumed = context.state === 'suspended' ? context.resume() : Promise.resolve();
      return Promise.resolve(resumed).then(() => {
        if (disposed) return false;
        unlocked = context.state === 'running' || context.state === undefined;
        publish({ error: unlocked ? null : 'Click Start or Test voice to allow audio.' });
        return unlocked;
      }).catch((error) => {
        publish({ error: error?.message || 'Audio permission is needed.' });
        return false;
      });
    } catch (error) {
      publish({ error: error?.message || 'Audio could not start.' });
      return Promise.resolve(false);
    }
  }
  function begin(kind, options, run) {
    if (disposed) return kind === 'speak' ? Promise.resolve({ spoken: false, reason: 'destroyed' }) : Promise.reject(speechError('The local voice was closed.', 'DESTROYED'));
    if (active || generation) return kind === 'speak' ? Promise.resolve({ spoken: false, reason: 'busy' }) : Promise.reject(speechError('The local voice is busy.', 'BUSY'));
    if (options.signal?.aborted) return kind === 'speak' ? Promise.resolve({ spoken: false, reason: 'cancelled' }) : Promise.reject(speechError('Speech cancelled.', 'CANCELLED'));
    let job;
    const promise = new Promise((resolve, reject) => {
      job = { id: ++serial, kind, resolve, reject, finished: false, signal: options.signal };
    });
    active = job;
    if (job.signal) {
      job.abort = () => { if (active === job) cancel(); };
      job.signal.addEventListener('abort', job.abort, { once: true });
    }
    publish({ error: null });
    Promise.resolve().then(() => run(job)).then((value) => endJob(job, value), (error) => {
      if (job.finished) return;
      publish({ error: error?.message || 'The local voice could not speak.' });
      endJob(job, { spoken: false, reason: error?.code?.toLowerCase() || 'error' }, kind === 'speak' ? null : error);
    });
    return promise;
  }
  function expired(options) { return Number.isFinite(options.expiresAt) && now() >= options.expiresAt; }
  async function generate(text, job, options = {}) {
    await load();
    if (job.finished || disposed) throw speechError('Speech cancelled.', 'CANCELLED');
    return new Promise((resolve, reject) => {
      generation = { id: job.id, resolve, reject };
      publish({ status: 'generating', error: null });
      try { worker.postMessage({ type: 'synthesize', id: job.id, text,
        delivery: options.delivery === 'urgent' ? 'urgent' : 'normal' }); }
      catch (error) { generation = null; reject(error); }
    });
  }
  async function playBuffer(audio, options, job) {
    if (job.finished || disposed) throw speechError('Speech cancelled.', 'CANCELLED');
    if (expired(options)) return { spoken: false, reason: 'expired' };
    if (!context || !unlocked || context.state === 'suspended') throw speechError('Click Start or Test voice to allow audio.', 'AUDIO_LOCKED');
    const samples = audio?.samples instanceof Float32Array ? audio.samples : new Float32Array(audio?.samples || []);
    if (!samples.length) throw speechError('The local voice returned no audio.', 'EMPTY_AUDIO');
    const buffer = context.createBuffer(1, samples.length, audio.sampleRate || PARADEE_SAMPLE_RATE);
    buffer.copyToChannel(samples, 0);
    const current = context.createBufferSource();
    current.buffer = buffer;
    current.connect(context.destination);
    source = current;
    return new Promise((resolve, reject) => {
      finishPlayback = resolve;
      current.onended = () => {
        finishPlayback = null;
        if (source === current) source = null;
        try { current.disconnect(); } catch { /* Already disconnected. */ }
        resolve({ spoken: true });
      };
      // A callback may cancel the request, so check again before starting sound.
      if (job.finished || disposed || expired(options)) {
        current.onended = null;
        stopSource();
        resolve({ spoken: false, reason: job.finished ? 'cancelled' : 'expired' });
        return;
      }
      try {
        options.onPlaying?.();
        if (job.finished || disposed || expired(options)) {
          current.onended = null;
          stopSource();
          resolve({ spoken: false, reason: job.finished ? 'cancelled' : 'expired' });
          return;
        }
        current.start();
        publish({ status: 'speaking', error: null });
      } catch (error) { stopSource(); reject(error); }
    });
  }
  function speak(text, options = {}) {
    const line = String(text || '').trim().slice(0, 600);
    if (!line) return Promise.resolve({ spoken: false, reason: 'empty' });
    return begin('speak', options, async (job) => {
      if (expired(options)) return { spoken: false, reason: 'expired' };
      const audio = await generate(line, job, options);
      return playBuffer(audio, options, job);
    });
  }
  function synthesize(text, options = {}) {
    const line = String(text || '').trim().slice(0, 600);
    if (!line) return Promise.reject(speechError('Speech text is empty.', 'EMPTY_TEXT'));
    return begin('synthesize', options, (job) => generate(line, job, options));
  }
  function play(audio, options = {}) { return begin('play', options, (job) => playBuffer(audio, options, job)); }
  function destroy() {
    if (disposed) return;
    cancel();
    disposed = true;
    if (loadTimer !== null) clearTimer(loadTimer);
    loadTimer = null;
    if (loadReject) loadReject(speechError('The local voice was closed.', 'DESTROYED'));
    loadResolve = loadReject = null;
    loading = null;
    if (generation) generation.reject(speechError('The local voice was closed.', 'DESTROYED'));
    generation = null;
    worker?.terminate();
    worker = null;
    ready = false;
    if (context?.close) Promise.resolve(context.close()).catch(() => {});
    context = null;
    unlocked = false;
    publish({ status: 'closed' });
  }
  return { load, unlock, speak, synthesize, play, cancel, getState: () => ({ ...state }), destroy };
}
