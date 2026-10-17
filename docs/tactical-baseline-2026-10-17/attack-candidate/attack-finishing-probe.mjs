import * as candidate from './engine-finish-55.mjs';
import * as old from './engine-original.mjs';
import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const scan=JSON.parse(await readFile(new URL('../qa/finishing-scan.json',import.meta.url),'utf8'));
const row=scan.suspects.find(row=>row.type==='R'&&row.x===7&&row.y===6),s=row.state,before=structuredClone(s),a=candidate.analyzeTacticalAction(s,{modelWeights:null});
assert.deepEqual(s,before);assert.ok(candidate.legalKicks(s).find(k=>k.x===a.action.x&&k.y===a.action.y)?.goal==='white');assert.deepEqual(a.action,candidate.analyzeTacticalAction({...s,randomState:123456},{modelWeights:null}).action);
const report={bestShot:row.best,baseline:old.analyzeTacticalAction(s,{modelWeights:null}),candidate:a,goalChosen:true};
await writeFile(new URL('attack-finishing-probe.json',import.meta.url),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
