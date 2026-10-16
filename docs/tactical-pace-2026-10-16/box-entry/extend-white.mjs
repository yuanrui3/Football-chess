import fs from 'node:fs';
import assert from 'node:assert/strict';
import * as rules from './engine.mjs';
import {runMatch,summary} from '../diagnosis/simulate.mjs';
const dir=new URL('.',import.meta.url),stem='box-entry-202610161-white';
const prefix=JSON.parse(fs.readFileSync(new URL(`${stem}.json`,dir),'utf8'));
assert.equal(prefix.actions,240);assert.equal(prefix.error,null);
const started=Date.now();
const tail=runMatch({rules,initialState:prefix.finalState,whiteDifficulty:'tactical',blackDifficulty:'tactical',
 seed:prefix.seed,kickoff:prefix.kickoff,actionLimit:240,foulsEnabled:true,record:true,validate:true,label:`${stem}-continuation`,
 onStep:({step,state,stats,elapsedMs})=>{
  if(step%30===0){const p={step:240+step,score:state.score,
   shots:prefix.stats.white.shots+prefix.stats.black.shots+stats.white.shots+stats.black.shots,
   xG:prefix.stats.white.xG+prefix.stats.black.xG+stats.white.xG+stats.black.xG,elapsedMs};
   fs.writeFileSync(new URL(`${stem}-480-progress.json`,dir),JSON.stringify(p));process.stdout.write(JSON.stringify(p)+'\n');}
 }});
fs.writeFileSync(new URL(`${stem}-continuation.json`,dir),JSON.stringify(tail));
assert.equal(tail.error,null);assert.equal(tail.actions,240);
const originalEvents=[...prefix.events,...tail.events];let index=0;
const recordedPolicy=()=>structuredClone(originalEvents[index++].action);
const full=runMatch({rules,whitePolicy:recordedPolicy,blackPolicy:recordedPolicy,whiteDifficulty:'tactical',blackDifficulty:'tactical',
 seed:prefix.seed,kickoff:prefix.kickoff,actionLimit:480,foulsEnabled:true,record:true,validate:true,label:`${stem}-480`});
assert.equal(full.error,null);assert.equal(full.actions,480);
for(let i=0;i<480;i++){assert.deepEqual(full.events[i].state,originalEvents[i].state,`stitch transition ${i+1}`);full.events[i].ms=originalEvents[i].ms;}
for(const team of ['white','black'])full.stats[team].thinkMs=prefix.stats[team].thinkMs+tail.stats[team].thinkMs;
full.elapsedMs=prefix.elapsedMs+tail.elapsedMs;
full.engineSha256=prefix.engineSha256;
full.continuation={prefixActions:240,additionalActions:240,prefixFile:`${stem}.json`,tailFile:`${stem}-continuation.json`,
 exactStateAssertions:480,method:'Resume saved state for next240 decisions; replay combined recorded action policy from original seed to recompute all480 action statistics and checkpoints',
 noExtraPendingResolution:true,continuationWallMs:Date.now()-started};
fs.writeFileSync(new URL(`${stem}-480.json`,dir),JSON.stringify(full));
fs.writeFileSync(new URL(`${stem}-480-summary.json`,dir),JSON.stringify(summary([full]),null,2));
process.stdout.write(JSON.stringify({complete:full.label,score:full.score,shots:full.stats.white.shots+full.stats.black.shots,
 xG:full.stats.white.xG+full.stats.black.xG,phase:full.phase,error:full.error})+'\n');
