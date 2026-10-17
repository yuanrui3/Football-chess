import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import * as Rules from '../combined-v1/rules-engine.mjs';
import * as Baseline from './baseline.mjs';
import * as Q1 from './engine.mjs';
import * as Combined from '../combined-v1/candidate-engine.mjs';
const match=JSON.parse(await fs.readFile(new URL('../combined-v1/match-001-610017-fouls-white-black.json',import.meta.url),'utf8'));
let state=Rules.createGame({mode:'local',seed:match.seed,kickoff:match.kickoff,foulsEnabled:match.foulsEnabled});
const apply=(s,a)=>a.type==='kick'?Rules.applyKick(s,a.x,a.y,{passRun:!!a.passRun,disguise:!!a.disguise}):a.type==='move'?Rules.applyMove(s,a.pieceId,a.x,a.y,{freePawn:!!a.freePawn}):a.type==='cornerTaker'?Rules.selectCornerTaker(s,a.pieceId):Rules.skipMove(s);
const states=[];
for(const e of match.events){
 if([156,157,162,163,168,169,174,175].includes(e.step))states.push({step:e.step,recorded:e.action,state:structuredClone(state)});
 state=apply(state,e.action);assert.deepEqual(state.lastAction,e.result,`Replayexact at${e.step}`);
 if(e.step===177)break;
}
const results=[];
for(const c of states){
 const row={...c,reports:{}};
 for(const [name,E]of Object.entries({Baseline,Q1,Combined})){
  const t=performance.now(),r=E.analyzeTacticalAction(c.state,{nodeLimit:1400,maxDepth:8,modelWeights:null});row.reports[name]={...r,ms:performance.now()-t};
 }
 results.push(row);console.log(JSON.stringify({step:row.step,recorded:row.recorded,reports:row.reports}));
}
await fs.writeFile(new URL('concession-audit.json',import.meta.url),JSON.stringify(results,null,2));
