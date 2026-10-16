import * as rules from './engine.mjs';
import {runMatch,summary} from '../diagnosis/simulate.mjs';
import fs from 'node:fs';
const dir=new URL('.',import.meta.url),stem='box-entry-202610161-white';
const result=runMatch({rules,whiteDifficulty:'tactical',blackDifficulty:'tactical',seed:202610161,kickoff:'white',
 actionLimit:240,foulsEnabled:true,record:true,validate:true,label:stem,onStep:({step,state,stats,elapsedMs})=>{
  if(step%30===0){const p={step,score:state.score,shots:stats.white.shots+stats.black.shots,xG:stats.white.xG+stats.black.xG,
   stalls:stats.white.stalls+stats.black.stalls,elapsedMs};
   fs.writeFileSync(new URL(`${stem}-progress.json`,dir),JSON.stringify(p));process.stdout.write(JSON.stringify(p)+'\n');}
 }});
result.engineSha256='cf82976a68525fed680e85f60c483b022086f871c60ab39125d550974f940fc2';
result.protocol={actionLimit:240,nodes:1400,foulsEnabled:true,record:true,validate:true,extraResolutionActions:0};
fs.writeFileSync(new URL(`${stem}.json`,dir),JSON.stringify(result));
fs.writeFileSync(new URL(`${stem}-summary.json`,dir),JSON.stringify(summary([result]),null,2));
process.stdout.write(JSON.stringify({complete:stem,score:result.score,attempts:result.stats.white.shots+result.stats.black.shots,
 resolved:result.stats.white.resolvedShots+result.stats.black.resolvedShots,xG:result.stats.white.xG+result.stats.black.xG,phase:result.phase,error:result.error})+'\n');
