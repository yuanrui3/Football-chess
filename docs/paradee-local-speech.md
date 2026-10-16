# Local male match commentary

**Live analysis · Hugo + Tom** speaks the game engine’s factual, dynamically filled commentary with **Hugo**, a male voice from [KittenTTS Nano 0.8 int8](https://huggingface.co/KittenML/kitten-tts-nano-0.8-int8). Tom’s expressive British recordings retain immediate shots, outcomes, goals and enable confirmations. No language-model API, speech-generation account or voice service is contacted during a match. Hugo and Tom are distinct voices.

Hugo uses the model’s stock male voice embedding. The existing `paradee-*` code and documentation filenames remain for compatibility.

## Assets and loading

The model is 24,369,971 bytes, with a 409,600-byte Hugo voice embedding. The model, pronunciation frontend and CPU/WASM runtime together are 38,387,736 bytes (about 38 MB) before HTTP compression. They load only after an audio activation gesture in local mode. The separate pronunciation source archive is served for source availability and is never fetched by inference. Public assets are bundled locally, so GitHub Pages needs no backend or API keys.

The ONNX runtime uses one CPU thread in a dedicated worker, without WebGPU or cross-origin isolation. The pronunciation frontend produces the phoneme tokens expected by KittenTTS. The selected Hugo embedding is indexed by phoneme length. Output is 24 kHz mono audio.

## Delivery and playback

Short, energetic football phrases and a livelier delivery pace accompany attacking play. KittenTTS has no emotion-prompt control: energetic wording and delivery speed help the local analysis, while Tom’s recorded reactions provide the expressive shot and goal calls.

On/Start/Resume unlock browser audio and start a silent model warmup. Tom’s saved calls cover loading and slow/failed synthesis. If Tom’s audio also fails, the call remains in captions. Device speech is a fallback only in recorded-only mode. Local routine speech has a 5.5-second generation deadline. Off, pause, dialogs, hidden tabs, pagehide, undo, resets, higher-priority events and mode changes cancel pending playback; worker results that arrive later are discarded. Inference is serialized without a speech backlog. A failed local Test voice does not substitute another voice.

Commentary remains restricted to Relaxed · 3 seconds. Existing unversioned recorded defaults migrate to local mode; explicit device choices and all versioned later choices are retained. The recorded-only and device modes remain available. Test voice auditions Hugo with a short football call without changing the match.

## Validation and performance

The exact deployed frontend and ONNX WASM graph were tested under Node on the available CPU. Initialization and silent warmup took 1.85 seconds; four warm calls took 2.11–3.30 seconds to generate 3.06–4.51 seconds of finite, unclipped audio. Node RSS rose to about 405 MiB. These are CPU/WASM measurements under Node, not a browser or mobile guarantee. See `kitten-benchmark.json` for the measured lines and timings.

Model file size describes neither total runtime memory nor first-load time. Browser memory use and speed depend on the device. The earlier Paradee measurements in `paradee-benchmark.json` are historical and do not describe KittenTTS.

Runtime, transport and UI checks cover async cancellation, generation deadlines, priority, model failures and activation requirements. No browser-control capability was available in the build environment, so browser audio itself was not automatically exercised.

## Licenses and source

See `dist/vendor/kitten/NOTICE.html` for the model, ONNX runtime and pronunciation component licenses and source availability. `kitten-vendor-provenance.json` records exact versions and file hashes. The pronunciation source archive is included for source availability without downloading it into the running speech engine.
