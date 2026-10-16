import * as rules from '../baseline/engine.mjs';
import {runMatch, summary} from './simulate.mjs';
import fs from 'node:fs';
const seed=Number(process.argv[2]), kickoff=process.argv[3], stem=`baseline-${seed}-${kickoff}`;
const dir=new URL('.',import.meta.url);
const result=runMatch({rules,whiteDifficulty:'tactical',blackDifficulty:'tactical',seed,kickoff,actionLimit:480,foulsEnabled:true,record:true,validate:true,label:stem,onStep:({step,state,stats,elapsedMs})=>{
  if(step%30===0){const p={seed,kickoff,step,score:state.score,shots:stats.white.shots+stats.black.shots,xG:stats.white.xG+stats.black.xG,stalls:stats.white.stalls+stats.black.stalls,msPerAction:elapsedMs/step,elapsedMs};fs.writeFileSync(new URL(`${stem}-progress.json`,dir),JSON.stringify(p));process.stdout.write(JSON.stringify(p)+'\n');}
}});
fs.writeFileSync(new URL(`${stem}.json`,dir),JSON.stringify(result));
fs.writeFileSync(new URL(`${stem}-summary.json`,dir),JSON.stringify(summary([result]),null,2));
process.stdout.write(JSON.stringify({complete:stem,summary:summary([result])})+'\n');
