import * as rules from './engine.mjs';
import {runMatch,summary} from '../diagnosis/simulate.mjs';
import fs from 'node:fs';
import crypto from 'node:crypto';
const seed=202610162,kickoff='black',stem=`box-entry-480-${seed}-${kickoff}`,dir=new URL('.',import.meta.url);
const engineSha256=crypto.createHash('sha256').update(fs.readFileSync(new URL('./engine.mjs',import.meta.url))).digest('hex');
if(engineSha256!=='cf82976a68525fed680e85f60c483b022086f871c60ab39125d550974f940fc2')throw new Error('Frozen engine hash mismatch');
const prefixFile=new URL(`./box-entry-${seed}-${kickoff}.json`,dir),prefixText=fs.readFileSync(prefixFile,'utf8'),prefix=JSON.parse(prefixText);
if(prefix.actions!==240||prefix.events.length!==240||prefix.error||!prefix.finalState)throw new Error('Invalid completed prefix');
const prefixXG=prefix.stats.white.xG+prefix.stats.black.xG,prefixShots=prefix.stats.white.shots+prefix.stats.black.shots;
const tail=runMatch({rules,whiteDifficulty:'tactical',blackDifficulty:'tactical',seed,kickoff,initialState:prefix.finalState,actionLimit:240,foulsEnabled:true,record:true,validate:true,label:`${stem}-tail`,onStep:({step,state,stats,elapsedMs})=>{
 if(step%30===0){const progress={seed,kickoff,tailStep:step,totalStep:prefix.actions+step,score:state.score,shots:prefixShots+stats.white.shots+stats.black.shots,xG:prefixXG+stats.white.xG+stats.black.xG,elapsedMs};fs.writeFileSync(new URL(`${stem}-progress.json`,dir),JSON.stringify(progress));console.log(JSON.stringify(progress));}
}});
tail.engineSha256=engineSha256;tail.continuation={prefixFile:prefixFile.pathname,prefixSha256:crypto.createHash('sha256').update(prefixText).digest('hex'),prefixActions:240,initialState:prefix.finalState};
fs.writeFileSync(new URL(`${stem}-tail.json`,dir),JSON.stringify(tail));
if(tail.error)throw new Error(`Tail failed: ${JSON.stringify(tail.error)}`);
const originals=[...prefix.events,...tail.events.map(e=>({...e,step:e.step+prefix.actions}))];let sharedIndex=0;
const replayPolicy=()=>structuredClone(originals[sharedIndex++].action);
const full=runMatch({rules,whitePolicy:replayPolicy,blackPolicy:replayPolicy,whiteDifficulty:'tactical',blackDifficulty:'tactical',seed,kickoff,actionLimit:480,foulsEnabled:true,record:true,validate:true,label:stem});
if(full.error||sharedIndex!==originals.length||full.events.length!==originals.length)throw new Error('Stitched replay failed');
for(let i=0;i<originals.length;i++)if(JSON.stringify(full.events[i].state)!==JSON.stringify(originals[i].state))throw new Error(`Stitched transition mismatch at ${i+1}`);
full.stitchedReplayMs=full.elapsedMs;full.elapsedMs=prefix.elapsedMs+tail.elapsedMs;
for(const team of ['white','black'])full.stats[team].thinkMs=0;
for(let i=0;i<originals.length;i++){full.events[i].ms=originals[i].ms;full.stats[full.events[i].team].thinkMs+=originals[i].ms;}
full.engineSha256=engineSha256;full.continuation={method:'Computed240newAIactionsfromfrozenprefixfinalState;replayedall480actionsfromseedforstatsandexactstateaudit',prefixActions:240,tailActions:tail.actions,prefixSha256:tail.continuation.prefixSha256,tailFile:new URL(`${stem}-tail.json`,dir).pathname,exactReplayedTransitions:originals.length,mismatches:0,actualAITimingsRestored:true};
full.protocol={actions:480,nodes:1400,depth:8,foulMode:true,extraPendingShotResolution:false};
fs.writeFileSync(new URL(`${stem}.json`,dir),JSON.stringify(full));
fs.writeFileSync(new URL(`${stem}-summary.json`,dir),JSON.stringify(summary([full]),null,2));
console.log(JSON.stringify({complete:stem,summary:summary([full]),continuation:full.continuation}));
