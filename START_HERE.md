# Football Chess — source code, published version 31

This is the editable source for the game published on October 16, 2026:
https://football-chess-pitch.mellowguppy9.chatgpt.site

Source commit: `163749912ea85f6b0c9e2ead74da0a8d2438b27c`
Rules version: 17. Shot model: 13.

Includes the latest Queen/Knight two-target disguised shots and aim-based corner placement.

## Run the game locally

Extract the ZIP, then open PowerShell in the extracted `football-chess` folder.
With Python 3 installed, run:

```powershell
py -m http.server 8000 --directory dist
```

Open http://localhost:8000 in your browser. Keep the terminal open while playing;
press Ctrl+C to stop the server. Use the HTTP address so JavaScript modules and
the AI worker load correctly.

There is no build step and no npm installation is required. `dist/` contains
the actual readable HTML, CSS and JavaScript source, rather than generated or
minified bundles. The optional Google Fonts stylesheet has local font fallbacks.

On macOS or Linux, use `python3` instead of `py` in the command above.

## Main files

| File | Purpose |
| --- | --- |
| `dist/engine.js` | Rules, legal actions, shot probabilities, Casual and Tactical AI |
| `dist/app.js` | Board interface, input, saved matches and ball animation |
| `dist/ai-worker.js` | Runs AI decisions in a background worker |
| `dist/goal-replay.js` | Goal recording and replay playback |
| `dist/match-stats.js` | Match statistics, scorers, assists and goal locations |
| `dist/match-clock.js` | Match time, action deadlines and final chances |
| `dist/index.html`, `dist/style.css` | Page, rulebook and styling |
| `tests/` | Automated rule, AI, replay and statistics tests |
| `scripts/simulate.mjs` | AI-vs-AI simulation harness |
| `docs/` | Historical experiments, reports and frozen benchmark sources |

## Tests and simulations

These commands need Node.js. The source was developed with Node.js 24.19.0.
Run them from the extracted project folder:

```powershell
npm test
npm run simulate -- --seeds=2 --actions=480 --out=simulation-results
```

Add `--difficulty=tactical` to the simulation arguments to use Tactical bots.
The complete test suite takes a few minutes. Historical benchmark reports in
`docs/` describe their frozen rules and may predate the latest game changes.

## Editing

Edit the files directly. After changing game assets, refresh their cache versions:

```powershell
node scripts/version-assets.mjs
```

Then reload the browser. `README.md` documents the full game rules and AI design.
Hosting-account configuration and Git history are omitted from this portable copy.
