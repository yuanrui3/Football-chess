import test from 'node:test';
import assert from 'node:assert/strict';
import { PARADEE_ASSETS, cleanParadeePhonemes, paradeeTokenIds, loadParadeeEngine } from '../dist/paradee-worker.js';

test('phoneme ids preserve known characters, skip unknown ones and add two pad boundaries', () => {
  assert.deepEqual(Array.from(paradeeTokenIds('h?e💫l', { h: 4, e: 7, l: 9 })), [0n, 4n, 7n, 9n, 0n]);
  assert.throws(() => paradeeTokenIds('💫', { h: 4 }), /No supported/);
});

test('model input never exceeds 512 tokens and retains its final boundary', () => {
  const ids = paradeeTokenIds('a'.repeat(800), { a: 8 });
  assert.equal(ids.length, 512); assert.equal(ids[0], 0n); assert.equal(ids.at(-1), 0n);
});

test('English cleanup applies the upstream pronunciation fixes before Misaki conversion', () => {
  assert.equal(cleanParadeePhonemes('r x ɬ ʲ nˈaɪnti z.'), 'ɹ k l j nˈaɪndiz.');
});

test('worker defaults only reference bundled same-site assets', () => {
  for (const value of Object.values(PARADEE_ASSETS)) assert.ok(value.startsWith('./vendor/paradee/'));
});

test('exact worker pipeline loads CPU WASM, warms silently and passes character tokens to the graph', async () => {
  const runs = [], progress = [], imports = [];
  let released = false;
  class Tensor {
    constructor(type, data, dims) { Object.assign(this, { type, data, dims }); }
  }
  const ort = { env: { wasm: {} }, Tensor, InferenceSession: {
    async create(bytes, options) {
      assert.deepEqual(Array.from(bytes), [1, 2, 3]);
      assert.deepEqual(options.executionProviders, ['wasm']);
      return { async run(feeds) { runs.push(feeds); return { waveform: { data: new Float32Array([.1, -.2]) } }; },
        release() { released = true; } };
    },
  } };
  const engine = await loadParadeeEngine({
    fetchImpl: async (url) => url.endsWith('config.json')
      ? { ok: true, json: async () => ({ vocab: { h: 5, i: 7 } }) }
      : { ok: true, arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer },
    importModule: async (url) => {
      imports.push(url);
      if (url.endsWith('ort.wasm.min.mjs')) return ort;
      if (url.endsWith('phonemizer.js')) return { phonemize: async () => ['hi'] };
      if (url.endsWith('misaki.js')) return { toMisaki: (value) => value };
      throw new Error('Unexpected import');
    },
    onProgress: (value) => progress.push(value),
  });
  assert.equal(ort.env.wasm.numThreads, 1); assert.equal(ort.env.wasm.proxy, false);
  assert.ok(ort.env.wasm.wasmPaths.endsWith('/vendor/paradee/'));
  assert.equal(runs.length, 1, 'one silent warmup');
  assert.deepEqual(Array.from(runs[0].input_ids.data), [0n, 5n, 7n, 0n]);
  assert.deepEqual(runs[0].input_ids.dims, [1, 4]);
  assert.deepEqual(Array.from(runs[0].speed.data), [1]);
  const audio = await engine.synthesize('A real line.');
  assert.equal(audio.sampleRate, 24000); assert.equal(audio.samples.length, 2);
  assert.equal(runs.length, 2); assert.equal(progress.at(-1), 1); assert.equal(imports.length, 3);
  await engine.dispose(); assert.equal(released, true);
});
