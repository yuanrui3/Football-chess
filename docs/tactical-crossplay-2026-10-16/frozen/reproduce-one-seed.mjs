import * as rules from './shared-rules.mjs';
import {runMatch} from './simulate.mjs';
const args=Object.fromEntries(process.argv.slice(2).map(a=>a.replace(/^--/,'').split('=')));
const variant=args.variant||'c2',seed=Number(args.seed||1632189751),actions=Object.hasOwn(args,'actions')?Number(args.actions):720;
if(!['baseline','c1','c2'].includes(variant)||!Number.isInteger(seed)||!Number.isInteger(actions)||actions<0)throw new Error('Use --variant=baseline|c1|c2 --seed=integer [--actions=720]');
const tactical=await import(`./${variant}-policy.mjs`),matches=[];
for(const tacticalColor of ['white','black'])for(const kickoff of ['white','black']){
  const m=runMatch({rules,whitePolicy:tacticalColor==='white'?tactical:rules,blackPolicy:tacticalColor==='black'?tactical:rules,whiteDifficulty:tacticalColor==='white'?'tactical':'casual',blackDifficulty:tacticalColor==='black'?'tactical':'casual',seed,kickoff,actionLimit:actions,foulsEnabled:true,validate:true,label:variant});
  matches.push({...m,tacticalColor});
  process.stderr.write(JSON.stringify({variant,seed,tacticalColor,kickoff,actions:m.actions,score:m.score,error:m.error})+'\n');
}
process.stdout.write(JSON.stringify({variant,seed,matches},null,2)+'\n');
