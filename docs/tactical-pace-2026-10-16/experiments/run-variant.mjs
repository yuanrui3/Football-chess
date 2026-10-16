import {runMatch,summary} from './simulate.mjs';
import {writeFile,mkdir} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
const name=process.argv[2];
if(!['keeper-reach','range-decay'].includes(name))throw new Error('Expected frozen variant name');
const rules=await import(`./${name}.mjs`);
const outDir=path.resolve(import.meta.dirname,name);await mkdir(outDir,{recursive:true});
const cases=[{seed:202610161,kickoff:'white'},{seed:202610162,kickoff:'black'}];
const matches=[];
for(const item of cases){
  const result=runMatch({rules,...item,actionLimit:240,foulsEnabled:true,whiteDifficulty:'tactical',blackDifficulty:'tactical',record:true,validate:true,label:name});
  matches.push(result);await writeFile(path.join(outDir,`${item.seed}-${item.kickoff}.json`),JSON.stringify(result));
  process.stdout.write(JSON.stringify({name,seed:item.seed,kickoff:item.kickoff,score:result.score,actions:result.actions,shots:result.stats.white.shots+result.stats.black.shots,xG:result.stats.white.xG+result.stats.black.xG,error:result.error,elapsedMs:result.elapsedMs})+'\n');
}
const aggregate=summary(matches);await writeFile(path.join(outDir,'summary.json'),JSON.stringify(aggregate,null,2));
process.stdout.write(JSON.stringify({name,summary:{score:aggregate.score,rates:aggregate.rates,maxExactRepeat:aggregate.maxExactRepeat,errors:aggregate.errors}})+'\n');
