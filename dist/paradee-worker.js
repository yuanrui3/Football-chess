// KittenTTS Nano 0.8 int8 with the official male Hugo voice. The old worker
// filename and exported aliases keep the existing controller compatible.
// All inference dependencies are local; no SDK telemetry is included.
import { encode } from './vendor/kitten/TextCleaner.js';

export const KITTEN_ASSETS = Object.freeze({
  runtime: './vendor/paradee/ort.wasm.min.mjs',
  phonemizer: './vendor/kitten/cephonemizer-runtime.js',
  preprocessor: './vendor/kitten/TextPreprocessor.js',
  rules: './vendor/kitten/en_rules', list: './vendor/kitten/en_list',
  model: './vendor/kitten/kitten-nano-int8.onnx', voice: './vendor/kitten/hugo.bin',
  wasmBase: './vendor/paradee/',
});
export const PARADEE_ASSETS = KITTEN_ASSETS;
export const KITTEN_VOICE = Object.freeze({ name: 'Hugo', key: 'expr-voice-4-m', rows: 400, columns: 256, speedPrior: .9 });

// Native IPA and the upstream symbol table, with no Kokoro/Misaki conversion.
export function kittenTokenIds(phonemes) {
  const ids = encode(String(phonemes));
  if (ids.length <= 3) throw new Error('No supported speech sounds were produced.');
  return BigInt64Array.from(ids, (value) => BigInt(value));
}
export const paradeeTokenIds = kittenTokenIds;

// Match the SDK's 400-token default, retaining start/end/pad on every chunk.
export function kittenTokenChunks(ids, maxTokens = 400) {
  const maxBody = Math.max(1, Math.floor(maxTokens) - 3);
  const body = ids.slice(1, -2), chunks = [];
  for (let start = 0; start < body.length; start += maxBody) {
    chunks.push(BigInt64Array.from([0n, ...body.slice(start, start + maxBody), 10n, 0n]));
  }
  return chunks;
}

export function kittenStyleVector(voice, phonemeCount, rows = 400, columns = 256) {
  if (!(voice instanceof Float32Array) || voice.length !== rows * columns) {
    throw new Error('The local male voice embedding has the wrong size.');
  }
  const row = Math.min(Math.max(0, phonemeCount), rows - 1);
  return voice.slice(row * columns, (row + 1) * columns);
}

export function kittenSynthesisSpeed(delivery = 'normal', speedPrior = .9) {
  // True model duration/speed control; no fake pitch shift or emotion prompt.
  return (delivery === 'urgent' ? 1.10 : 1.04) * speedPrior;
}

async function downloadModel(url, fetchImpl, onProgress) {
  const response = await fetchImpl(url);
  if (!response.ok) throw new Error(`The local speech model could not load (${response.status}).`);
  const total = Number(response.headers?.get('content-length')) || 0;
  if (!response.body?.getReader) return new Uint8Array(await response.arrayBuffer());
  const reader = response.body.getReader(), chunks = [];
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

async function responseText(response, label) {
  if (!response.ok) throw new Error(`The local voice ${label} could not load (${response.status}).`);
  return response.text();
}

// Match the SDK's CEPhonemizer C API, with local rules and dictionary.
export async function createKittenPhonemizer(factory, rules, list) {
  const module = await factory();
  module.FS.mkdir('/cephonemizer');
  module.FS.writeFile('/cephonemizer/en_rules', rules);
  module.FS.writeFile('/cephonemizer/en_list', list);
  const create = module.cwrap('phonemizer_create', 'number', ['string', 'string', 'string']);
  const destroy = module.cwrap('phonemizer_destroy', null, ['number']);
  const phonemize = module.cwrap('phonemizer_phonemize', 'number', ['number', 'string']);
  const free = module.cwrap('phonemizer_free_string', null, ['number']);
  const handle = create('/cephonemizer/en_rules', '/cephonemizer/en_list', 'en-us');
  if (!handle) throw new Error('The local speech pronunciation data could not initialize.');
  return {
    phonemize(text) {
      const pointer = phonemize(handle, text);
      if (!pointer) throw new Error('The local voice could not pronounce this line.');
      try { return module.UTF8ToString(pointer); } finally { free(pointer); }
    },
    dispose() { destroy(handle); },
  };
}

export async function loadKittenEngine({
  assets = {}, fetchImpl = (url) => fetch(url), importModule = (url) => import(url),
  onProgress = () => {}, warmup = true, voiceInfo = KITTEN_VOICE,
} = {}) {
  const urls = Object.fromEntries(Object.entries({ ...KITTEN_ASSETS, ...assets })
    .map(([key, value]) => [key, new URL(value, import.meta.url).href]));
  onProgress(.01);
  const [ort, pronunciationModule, preprocessor, rules, list, voiceResponse, modelBytes] = await Promise.all([
    importModule(urls.runtime), importModule(urls.phonemizer), importModule(urls.preprocessor),
    fetchImpl(urls.rules).then((response) => responseText(response, 'pronunciation rules')),
    fetchImpl(urls.list).then((response) => responseText(response, 'pronunciation dictionary')),
    fetchImpl(urls.voice), downloadModel(urls.model, fetchImpl, onProgress),
  ]);
  if (!voiceResponse.ok) throw new Error(`The local male voice could not load (${voiceResponse.status}).`);
  const voice = new Float32Array(await voiceResponse.arrayBuffer());
  kittenStyleVector(voice, 0, voiceInfo.rows, voiceInfo.columns);
  const pronunciation = await createKittenPhonemizer(pronunciationModule.default, rules, list);
  ort.env.wasm.numThreads = 1;
  ort.env.wasm.proxy = false;
  ort.env.wasm.wasmPaths = urls.wasmBase;
  onProgress(.83);
  let session;
  try {
    session = await ort.InferenceSession.create(modelBytes, {
      executionProviders: ['wasm'], graphOptimizationLevel: 'all',
    });
  } catch (error) { pronunciation.dispose(); throw error; }
  onProgress(.93);
  let busy = false, disposed = false;
  async function synthesize(text, { delivery = 'normal' } = {}) {
    if (disposed) throw new Error('The local voice has been closed.');
    if (busy) throw new Error('The local voice is still generating its previous line.');
    busy = true;
    try {
      const line = preprocessor.preprocess(String(text || '').trim().slice(0, 600));
      if (!line) throw new Error('Speech text is empty.');
      const chunks = kittenTokenChunks(kittenTokenIds(pronunciation.phonemize(line)));
      const segments = [];
      for (const ids of chunks) {
        const feeds = {
          input_ids: new ort.Tensor('int64', ids, [1, ids.length]),
          style: new ort.Tensor('float32', kittenStyleVector(voice, ids.length - 3, voiceInfo.rows, voiceInfo.columns), [1, voiceInfo.columns]),
          speed: new ort.Tensor('float32', new Float32Array([kittenSynthesisSpeed(delivery, voiceInfo.speedPrior)]), [1]),
        };
        let output;
        try {
          output = await session.run(feeds);
          const waveform = output.waveform ?? output[session.outputNames?.[0]];
          if (!waveform?.data?.length) throw new Error('The local male voice returned no waveform.');
          // Match upstream's bounded trailing trim: <=250 ms at amplitude .005.
          let end = waveform.data.length;
          const minEnd = Math.max(0, end - 6000);
          while (end > minEnd && Math.abs(waveform.data[end - 1]) <= .005) end--;
          if (end === 0) throw new Error('The local male voice returned only silence.');
          const samples = new Float32Array(waveform.data.slice(0, end));
          if (!samples.every(Number.isFinite)) throw new Error('The local male voice returned invalid audio.');
          segments.push(samples);
        } finally {
          for (const tensor of Object.values(feeds)) tensor.dispose?.();
          for (const tensor of Object.values(output ?? {})) tensor.dispose?.();
        }
      }
      const samples = new Float32Array(segments.reduce((sum, segment) => sum + segment.length, 0));
      let offset = 0;
      for (const segment of segments) { samples.set(segment, offset); offset += segment.length; }
      return { samples, sampleRate: 24000 };
    } finally { busy = false; }
  }
  async function dispose() {
    if (disposed) return;
    disposed = true; pronunciation.dispose(); await session.release?.();
  }
  if (warmup) {
    try { await synthesize('Ready.'); } catch (error) { await dispose(); throw error; }
  }
  onProgress(1);
  return { synthesize, dispose };
}
export const loadParadeeEngine = loadKittenEngine;

if (typeof self !== 'undefined' && typeof self.postMessage === 'function' && typeof document === 'undefined') {
  let engine = null, loading = null, busy = false;
  self.onmessage = async ({ data = {} }) => {
    if (data.type === 'load') {
      if (engine) { self.postMessage({ type: 'ready' }); return; }
      if (loading) return;
      loading = loadKittenEngine({ assets: data.assets,
        onProgress: (progress) => self.postMessage({ type: 'progress', progress }),
      });
      try { engine = await loading; self.postMessage({ type: 'ready' }); }
      catch (error) { self.postMessage({ type: 'error', stage: 'load', message: error?.message || String(error) }); }
      finally { loading = null; }
    } else if (data.type === 'synthesize') {
      if (!engine || busy) {
        self.postMessage({ type: 'error', stage: 'synthesize', id: data.id,
          message: busy ? 'The local voice is busy.' : 'The local voice is not ready.' }); return;
      }
      busy = true;
      try {
        const audio = await engine.synthesize(data.text, { delivery: data.delivery });
        self.postMessage({ type: 'audio', id: data.id, samples: audio.samples.buffer,
          sampleRate: audio.sampleRate }, [audio.samples.buffer]);
      } catch (error) {
        self.postMessage({ type: 'error', stage: 'synthesize', id: data.id, message: error?.message || String(error) });
      } finally { busy = false; }
    }
  };
}
