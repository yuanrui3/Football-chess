// Paradee-8M (Apache-2.0), eSpeak phonemes converted using Paradee's own
// browser adapter. All weights and runtime files are served by this website.
export const PARADEE_ASSETS = Object.freeze({
  runtime: './vendor/paradee/ort.wasm.min.mjs',
  phonemizer: './vendor/paradee/phonemizer.js',
  misaki: './vendor/paradee/misaki.js',
  config: './vendor/paradee/config.json',
  model: './vendor/paradee/paradee.onnx',
  wasmBase: './vendor/paradee/',
});

export function paradeeTokenIds(phonemes, vocab) {
  const ids = [0];
  for (const character of String(phonemes)) {
    if (Object.hasOwn(vocab, character)) ids.push(vocab[character]);
    if (ids.length === 511) break;
  }
  ids.push(0);
  if (ids.length <= 2) throw new Error('No supported speech sounds were produced.');
  return BigInt64Array.from(ids, (value) => BigInt(value));
}

// Kokoro's English cleanup, followed by upstream web/misaki.js conversion.
export function cleanParadeePhonemes(value) {
  return String(value).replace(/ʲ/g, 'j').replace(/r/g, 'ɹ').replace(/x/g, 'k').replace(/ɬ/g, 'l')
    .replace(/(?<=[a-zɹː])(?=hˈʌndɹɪd)/g, ' ').replace(/ z(?=[;:,.!?—…"“”()]|$)/g, 'z')
    .replace(/nˈaɪnti/g, 'nˈaɪndi');
}

async function downloadModel(url, fetchImpl, onProgress) {
  const response = await fetchImpl(url);
  if (!response.ok) throw new Error(`The local speech model could not load (${response.status}).`);
  const total = Number(response.headers?.get('content-length')) || 0;
  if (!response.body?.getReader) return new Uint8Array(await response.arrayBuffer());
  const reader = response.body.getReader();
  const chunks = [];
  let received = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value); received += value.byteLength;
    if (total > 0) onProgress(Math.min(.8, .05 + .75 * received / total));
  }
  const bytes = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}

export async function loadParadeeEngine({
  assets = {},
  fetchImpl = (url) => fetch(url),
  importModule = (url) => import(url),
  onProgress = () => {},
  warmup = true,
} = {}) {
  const urls = Object.fromEntries(Object.entries({ ...PARADEE_ASSETS, ...assets })
    .map(([key, value]) => [key, new URL(value, import.meta.url).href]));
  onProgress(.01);
  const [ort, phonemizer, adapter, configResponse, modelBytes] = await Promise.all([
    importModule(urls.runtime), importModule(urls.phonemizer), importModule(urls.misaki),
    fetchImpl(urls.config), downloadModel(urls.model, fetchImpl, onProgress),
  ]);
  if (!configResponse.ok) throw new Error(`The local voice configuration could not load (${configResponse.status}).`);
  const config = await configResponse.json();
  const vocab = config.vocab;
  if (!vocab || !Object.keys(vocab).length) throw new Error('The local voice vocabulary is missing.');
  // One CPU thread works without cross-origin isolation or SharedArrayBuffer.
  ort.env.wasm.numThreads = 1;
  ort.env.wasm.proxy = false;
  ort.env.wasm.wasmPaths = urls.wasmBase;
  onProgress(.83);
  const session = await ort.InferenceSession.create(modelBytes, {
    executionProviders: ['wasm'], graphOptimizationLevel: 'all',
  });
  onProgress(.93);
  let busy = false;
  async function synthesize(text) {
    if (busy) throw new Error('The local voice is still generating its previous line.');
    busy = true;
    try {
      const line = String(text || '').trim().slice(0, 600);
      if (!line) throw new Error('Speech text is empty.');
      const parts = await phonemizer.phonemize(line, 'en-us');
      const phonemes = adapter.toMisaki(cleanParadeePhonemes(parts.join(' ')));
      const ids = paradeeTokenIds(phonemes, vocab);
      const output = await session.run({
        input_ids: new ort.Tensor('int64', ids, [1, ids.length]),
        speed: new ort.Tensor('float32', new Float32Array([1]), [1]),
      });
      const waveform = output.waveform;
      if (!waveform?.data?.length) throw new Error('The local voice returned no waveform.');
      // Own the output buffer; ORT may recycle its internal tensor allocations.
      const samples = new Float32Array(waveform.data);
      return { samples, sampleRate: 24000 };
    } finally { busy = false; }
  }
  if (warmup) {
    try { await synthesize('Ready.'); }
    catch (error) { await session.release?.(); throw error; }
  }
  onProgress(1);
  return { synthesize, dispose: () => session.release?.() };
}

// The exports also allow testing the exact browser WASM path under Node. This
// message loop is installed only in a real DedicatedWorkerGlobalScope.
if (typeof self !== 'undefined' && typeof self.postMessage === 'function' && typeof document === 'undefined') {
  let engine = null;
  let loading = null;
  let busy = false;
  self.onmessage = async ({ data = {} }) => {
    if (data.type === 'load') {
      if (engine) { self.postMessage({ type: 'ready' }); return; }
      if (loading) return;
      loading = loadParadeeEngine({ assets: data.assets,
        onProgress: (progress) => self.postMessage({ type: 'progress', progress }),
      });
      try {
        engine = await loading;
        self.postMessage({ type: 'ready' });
      } catch (error) {
        self.postMessage({ type: 'error', stage: 'load', message: error?.message || String(error) });
      } finally { loading = null; }
    } else if (data.type === 'synthesize') {
      if (!engine || busy) {
        self.postMessage({ type: 'error', stage: 'synthesize', id: data.id,
          message: busy ? 'The local voice is busy.' : 'The local voice is not ready.' });
        return;
      }
      busy = true;
      try {
        const audio = await engine.synthesize(data.text);
        self.postMessage({ type: 'audio', id: data.id, samples: audio.samples.buffer,
          sampleRate: audio.sampleRate }, [audio.samples.buffer]);
      } catch (error) {
        self.postMessage({ type: 'error', stage: 'synthesize', id: data.id, message: error?.message || String(error) });
      } finally { busy = false; }
    }
  };
}
