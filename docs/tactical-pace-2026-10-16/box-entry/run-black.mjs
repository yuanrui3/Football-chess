import * as rules from './engine.mjs';
import {runMatch,summary} from '../diagnosis/simulate.mjs';
import fs from 'node:fs';
import crypto from 'node:crypto';
const seed=202610162,kickoff='black',stem=`box-entry-${seed}-${kickoff}`,dir=new URL('.',import.meta.url);
const engineSha256=crypto.createHash('sha256').update(fs.readFileSync(new URL('./engine.mjs',import.meta.url))).digest('hex');
if(engineSha256!=='cf82976a68525fed680e85f60c483b022086f871c60ab39125d550974f940fc2')throw new Error('Frozen engine hash mismatch');
const result=runMatch({rules,whiteDifficulty:'tactical',blackDifficulty:'tactical',seed,kickoff,actionLimit:240,foulsEnabled:true,record:true,validate:true,label:stem,onStep:({step,state,stats,elapsedMs})=>{
 if(step%30===0){const progress={seed,kickoff,step,score:state.score,shots:stats.white.shots+stats.black.shots,xG:stats.white.xG+stats.black.xG,stalls:stats.white.stalls+stats.black.stalls,elapsedMs};fs.writeFileSync(new URL(`${stem}-progress.json`,dir),JSON.stringify(progress));console.log(JSON.stringify(progress));}
}});
result.engineSha256=engineSha256;result.protocol={actions:240,nodes:1400,depth:8,foulMode:true,extraPendingShotResolution:false};
fs.writeFileSync(new URL(`${stem}.json`,dir),JSON.stringify(result));
fs.writeFileSync(new URL(`${stem}-summary.json`,dir),JSON.stringify(summary([result]),null,2));
console.log(JSON.stringify({complete:stem,summary:summary([result])}));
