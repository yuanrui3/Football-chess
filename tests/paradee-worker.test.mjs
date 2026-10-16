import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { KITTEN_ASSETS, PARADEE_ASSETS, KITTEN_VOICE, kittenTokenIds, paradeeTokenIds,
  kittenTokenChunks, kittenStyleVector, kittenSynthesisSpeed, createKittenPhonemizer,
  loadKittenEngine, loadParadeeEngine } from '../dist/paradee-worker.js';
import { preprocess } from '../dist/vendor/kitten/TextPreprocessor.js';

test('Kitten token ids use its native IPA alphabet and start/end/pad wrappers', () => {
  assert.deepEqual(Array.from(kittenTokenIds('h?i💫')), [0n, 50n, 6n, 51n, 10n, 0n]);
  assert.deepEqual(Array.from(kittenTokenIds('r')), [0n, 60n, 10n, 0n], 'no Misaki replacement of r');
  assert.throws(() => kittenTokenIds('💫'), /No supported/);
  assert.equal(paradeeTokenIds, kittenTokenIds);
});

test('long lines split into bounded independently wrapped chunks without losing phonemes', () => {
  const chunks = kittenTokenChunks(kittenTokenIds('h'.repeat(900)));
  assert.deepEqual(chunks.map((part) => part.length), [400, 400, 109]);
  for (const part of chunks) {
    assert.deepEqual([part[0], part.at(-2), part.at(-1)], [0n, 10n, 0n]);
    assert.ok(part.slice(1, -2).every((id) => id === 50n));
  }
  assert.equal(chunks.reduce((sum, part) => sum + part.length - 3, 0), 900);
});

test('Hugo uses the official male embedding and modest real speed controls', () => {
  assert.equal(KITTEN_VOICE.key, 'expr-voice-4-m');
  assert.equal(kittenSynthesisSpeed('normal'), 1.04 * .9);
  assert.equal(kittenSynthesisSpeed('urgent'), 1.10 * .9);
  assert.equal(kittenSynthesisSpeed('unknown'), kittenSynthesisSpeed('normal'));
});

test('style vectors select phoneme length, cap the row, validate shape and own their memory', () => {
  const voice = Float32Array.from({ length: 4 * 2 }, (_, index) => index);
  const selected = kittenStyleVector(voice, 2, 4, 2);
  assert.deepEqual(Array.from(selected), [4, 5]);
  selected[0] = -1; assert.equal(voice[4], 4);
  assert.deepEqual(Array.from(kittenStyleVector(voice, 80, 4, 2)), [6, 7]);
  assert.throws(() => kittenStyleVector(new Float32Array(9), 1, 4, 2), /wrong size/);
});

test('bundled Hugo bytes match the extracted official model voice', async () => {
  const bytes = await fs.readFile(new URL('../dist/vendor/kitten/hugo.bin', import.meta.url));
  assert.equal(bytes.length, 400 * 256 * 4);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), '1e036f1166acf869ba42d20a6f77ee13433f3959b44600af210e67b332cb53ca');
});

test('all default dependencies stay on this website, with no SDK or remote analytics', () => {
  assert.equal(PARADEE_ASSETS, KITTEN_ASSETS);
  for (const value of Object.values(KITTEN_ASSETS)) assert.ok(value.startsWith('./vendor/'));
  assert.ok(KITTEN_ASSETS.voice.endsWith('/hugo.bin'));
});

test('official English text preprocessing expands score numbers and preserves exclamations', () => {
  assert.equal(preprocess('  Obsidian lead 2 to 1!  '), 'Obsidian lead two to one!');
  assert.equal(preprocess('IvoryFC have 75% possession.'), 'Ivory F C have seventy-five percent possession.');
});

function fakePronunciation({ phonemes = 'hi', failedHandle = false } = {}) {
  const calls = [];
  return { calls, factory: async () => ({
    FS: { mkdir: (value) => calls.push(['mkdir', value]), writeFile: (...args) => calls.push(['write', ...args]) },
    UTF8ToString: (pointer) => { assert.equal(pointer, 19); return typeof phonemes === 'function' ? phonemes() : phonemes; },
    cwrap: (name) => ({
      phonemizer_create: (...args) => { calls.push(['create', ...args]); return failedHandle ? 0 : 7; },
      phonemizer_destroy: (handle) => calls.push(['destroy', handle]),
      phonemizer_phonemize: (handle, text) => { calls.push(['phonemize', handle, text]); return 19; },
      phonemizer_free_string: (pointer) => calls.push(['free', pointer]),
    })[name],
  }) };
}

test('pronunciation loader installs local data, selects en-us and frees every returned string', async () => {
  const fake = fakePronunciation();
  const frontend = await createKittenPhonemizer(fake.factory, 'rules text', 'dictionary text');
  assert.equal(frontend.phonemize('A shot!'), 'hi');
  assert.ok(fake.calls.some((call) => call[0] === 'create' && call.at(-1) === 'en-us'));
  assert.ok(fake.calls.some((call) => call[0] === 'write' && call.at(-1) === 'dictionary text'));
  assert.ok(fake.calls.some((call) => call[0] === 'free' && call[1] === 19));
  frontend.dispose(); assert.deepEqual(fake.calls.at(-1), ['destroy', 7]);
});

function fixture({ phonemes = 'hi', voiceBytes, failRun, blockRun } = {}) {
  const runs = [], progress = [], imports = [], fetches = [], disposed = [];
  const pronunciation = fakePronunciation({ phonemes });
  const voice = Float32Array.from({ length: 400 * 256 }, (_, index) => index / 1000);
  let released = false;
  class Tensor {
    constructor(type, data, dims) { Object.assign(this, { type, data, dims }); }
    dispose() { disposed.push(this.type); }
  }
  const ort = { env: { wasm: {} }, Tensor, InferenceSession: {
    async create(bytes, options) {
      assert.deepEqual(Array.from(bytes), [1, 2, 3]);
      assert.deepEqual(options.executionProviders, ['wasm']);
      return { outputNames: ['waveform'], async run(feeds) {
        runs.push(feeds);
        if (blockRun) await blockRun();
        if (failRun) throw new Error('fake inference failure');
        return { waveform: { data: new Float32Array([.1, -.2, 0, 0]), dispose: () => disposed.push('output') } };
      }, release() { released = true; } };
    },
  } };
  const options = {
    fetchImpl: async (url) => {
      fetches.push(url);
      if (url.endsWith('hugo.bin')) return { ok: true, arrayBuffer: async () => voiceBytes ?? voice.buffer };
      if (url.endsWith('en_rules') || url.endsWith('en_list')) return { ok: true, text: async () => 'data' };
      return { ok: true, arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer };
    },
    importModule: async (url) => {
      imports.push(url);
      if (url.endsWith('ort.wasm.min.mjs')) return ort;
      if (url.endsWith('cephonemizer-runtime.js')) return { default: pronunciation.factory };
      if (url.endsWith('TextPreprocessor.js')) return { preprocess };
      throw new Error('Unexpected import');
    }, onProgress: (value) => progress.push(value),
  };
  return { options, runs, progress, imports, fetches, ort, voice, pronunciation, disposed, released: () => released };
}

test('exact worker pipeline warms CPU WASM and feeds native tokens, male style and speed tensors', async () => {
  const f = fixture();
  assert.equal(loadParadeeEngine, loadKittenEngine);
  const engine = await loadKittenEngine(f.options);
  assert.equal(f.ort.env.wasm.numThreads, 1); assert.equal(f.ort.env.wasm.proxy, false);
  assert.ok(f.ort.env.wasm.wasmPaths.endsWith('/vendor/paradee/'));
  assert.equal(f.runs.length, 1);
  assert.deepEqual(Array.from(f.runs[0].input_ids.data), [0n, 50n, 51n, 10n, 0n]);
  assert.deepEqual(f.runs[0].input_ids.dims, [1, 5]);
  assert.deepEqual(f.runs[0].style.dims, [1, 256]);
  assert.deepEqual(f.runs[0].style.data, f.voice.slice(2 * 256, 3 * 256));
  assert.ok(Math.abs(f.runs[0].speed.data[0] - .936) < 1e-6);
  const audio = await engine.synthesize('Obsidian lead 2 to 1!', { delivery: 'urgent' });
  assert.equal(audio.sampleRate, 24000); assert.equal(audio.samples.length, 2, 'bounded silence trim');
  assert.ok(Math.abs(f.runs[1].speed.data[0] - .99) < 1e-6);
  assert.ok(f.pronunciation.calls.some((call) => call[0] === 'phonemize' && call[2] === 'Obsidian lead two to one!'));
  assert.equal(f.progress.at(-1), 1); assert.equal(f.imports.length, 3);
  assert.ok(f.disposed.includes('output'));
  await engine.dispose(); assert.equal(f.released(), true);
  await assert.rejects(engine.synthesize('Closed.'), /closed/);
});

test('multi-chunk inference selects styles for each chunk and concatenates audio in order', async () => {
  const f = fixture({ phonemes: 'h'.repeat(900) });
  const engine = await loadKittenEngine({ ...f.options, warmup: false });
  const audio = await engine.synthesize('A long analytical line.');
  assert.deepEqual(f.runs.map((feeds) => feeds.input_ids.dims[1]), [400, 400, 109]);
  assert.deepEqual(f.runs[0].style.data, f.voice.slice(397 * 256, 398 * 256));
  assert.deepEqual(f.runs[2].style.data, f.voice.slice(106 * 256, 107 * 256));
  assert.equal(audio.samples.length, 6);
  await engine.dispose();
});

test('bad embedding size fails before graph allocation', async () => {
  const f = fixture({ voiceBytes: new Float32Array(3).buffer });
  await assert.rejects(loadKittenEngine(f.options), /wrong size/);
  assert.equal(f.runs.length, 0);
});

test('failed warmup releases graph and pronunciation handle', async () => {
  const f = fixture({ failRun: true });
  await assert.rejects(loadKittenEngine(f.options), /fake inference failure/);
  assert.equal(f.released(), true);
  assert.deepEqual(f.pronunciation.calls.at(-1), ['destroy', 7]);
  assert.equal(f.disposed.length, 3, 'all input tensors disposed on inference failure');
});

test('engine rejects overlap rather than queuing stale commentary', async () => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const f = fixture({ blockRun: () => gate });
  const engine = await loadKittenEngine({ ...f.options, warmup: false });
  const first = engine.synthesize('First line.');
  await assert.rejects(engine.synthesize('Stale line.'), /previous line/);
  release(); await first;
  await engine.dispose();
});
