# Match commentary audio

The game includes original football-chess commentary scripts, generated on 16 October 2026 with Runway’s stock British voice **Tom** using its expressive speech model. These are AI-generated calls; no Derek Rae, Stewart Robson or other named commentator voice has been cloned or included.

The generated MP3 files are bundled under `dist/audio/commentary/`; the script and event mapping are in `dist/commentary-clips.js` and `dist/commentary.js`. Playback is local to the website and sends no match data to an audio service. Runway credentials and private asset URLs are not included.

Runway’s published [commercial-use guidance](https://help.runwayml.com/hc/en-us/articles/21668707517587-Can-I-use-the-content-I-made-in-Runway-for-commercial-purposes) permits use of generated content without its own noncommercial restriction, subject to the [terms](https://runway.com/terms-ofuse) and [usage policy](https://runway.com/safety/usage-policy). This bank was generated through the user’s authenticated Runway workspace. It does not contain voice models, stock preview recordings, or access to the speech-generation service. Keep this provenance with redistributed project copies.

`commentary-audio-provenance.json` records each original script, generation task ID, file size, duration and SHA-256 hash. It contains no authentication tokens or private download URLs.

The Match commentary control offers Hugo’s live analysis in a local male voice with these recorded reactions by default; recorded-only and device voices remain available. In Hugo + Tom mode, Tom covers local model failures and captions cover saved-audio failures. Recorded-only mode can fall back to a device voice. Recorded calls use generic football language so the same clip can serve both teams; names, precise scores and assists remain available in the match display. Each result is revealed only with the visible shot outcome. The existing three-second pace restriction, immediate mute and speech priority rules apply to both playback choices.
