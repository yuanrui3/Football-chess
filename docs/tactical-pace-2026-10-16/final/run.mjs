import * as rules from './engine.mjs';
import {runMatch, summary} from '../diagnosis/simulate.mjs';
import fs from 'node:fs';
import crypto from 'node:crypto';
const seed = Number(process.argv[2]), kickoff = process.argv[3], stem = `final-${seed}-${kickoff}`;
const dir = new URL('.', import.meta.url);
const engineSha256 = crypto.createHash('sha256').update(fs.readFileSync(new URL('./engine.mjs', import.meta.url))).digest('hex');
const result = runMatch({rules, whiteDifficulty: 'tactical', blackDifficulty: 'tactical', seed, kickoff,
  actionLimit: 480, foulsEnabled: true, record: true, validate: true, label: stem,
  onStep: ({step, state, stats, elapsedMs}) => {
    if (step % 30 === 0) {
      const p = {seed, kickoff, step, score: state.score, shots: stats.white.shots + stats.black.shots,
        xG: stats.white.xG + stats.black.xG, stalls: stats.white.stalls + stats.black.stalls, msPerAction: elapsedMs / step, elapsedMs};
      fs.writeFileSync(new URL(`${stem}-progress.json`, dir), JSON.stringify(p));
      process.stdout.write(JSON.stringify(p) + '\n');
    }
  }});
result.engineSha256 = engineSha256;
result.protocol = {actions: 480, nodes: 1400, depth: 8, foulMode: true, extraPendingShotResolution: false};
fs.writeFileSync(new URL(`${stem}.json`, dir), JSON.stringify(result));
fs.writeFileSync(new URL(`${stem}-summary.json`, dir), JSON.stringify(summary([result]), null, 2));
process.stdout.write(JSON.stringify({complete: stem, summary: summary([result])}) + '\n');
