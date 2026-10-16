# Paradee local commentary

Live analysis · Paradee + Tom speaks the game engine’s factual, dynamically filled commentary using Paradee-8M. Tom’s generated recordings retain immediate shots, outcomes, goals and enable confirmations. No language-model API, speech-generation account or voice service is contacted during a match. Paradee has its own American English af_heart voice, distinct from Tom.

## Assets and loading

The model is 9,037,971 bytes; the model, phonemizer and CPU/WASM runtime together are about 23 MB before HTTP compression. They load only after an audio activation gesture in local mode. The separate 18.9 MB pronunciation source archive is served for source availability and is never fetched by inference. Public assets are bundled locally, so GitHub Pages needs no backend or API keys.

The ONNX runtime uses one CPU thread in a dedicated worker, without WebGPU or cross-origin isolation. Short lines use eSpeak pronunciation, Paradee’s upstream eSpeak-to-Misaki conversion, config.vocab and zero boundary tokens. Model inputs have at most 512 phoneme IDs. Plain eSpeak output without the conversion must not be used.

## Playback behavior

On/Start/Resume unlock browser audio and start a silent model warmup. Tom’s saved calls cover loading and slow/failed synthesis. Local routine speech has a 5.5-second generation deadline. Off, pause, dialogs, hidden tabs, pagehide, undo, resets, higher-priority events and mode changes cancel pending playback; worker results that arrive later are discarded. Inference is serialized without a speech backlog. A failed local Test voice does not substitute another voice.

Paradee remains restricted to Relaxed · 3 seconds. Existing unversioned recorded defaults migrate to local mode; explicit device choices and all versioned later choices are retained. The recorded-only and device modes remain available.

## Measured validation

The exact deployed worker, frontend and ONNX WASM assets were tested under Node on the available CPU. Full initialization and warmup took about 2.4–3.1 seconds. Warm synthesis took about 0.85–1.22 seconds for 3.1–3.75 seconds of audio. This is a CPU/WASM test, not a browser or mobile performance guarantee. Node RSS rose from about 37 MiB to 371 MiB during initialization: the 9 MB model size does not describe total runtime RAM. Browser memory use and speed can differ. See paradee-benchmark.json for the exact measurements and transcript.

All generated samples were finite, non-silent and unclipped. Runtime, transport and UI tests cover async cancellation, generation deadlines, priority, model failures and activation requirements. No browser-control capability was available in the build environment, so browser audio itself was not automatically exercised.

## Licenses and source

See dist/vendor/paradee/NOTICE.html for the Paradee Apache license, ONNX Runtime MIT license and notices, Phonemizer wrapper Apache license, eSpeak NG GPL license, and bundled pronunciation source/build materials. paradee-vendor-provenance.json records exact versions and file hashes. The project includes its source availability archive without downloading it into the running speech engine.
