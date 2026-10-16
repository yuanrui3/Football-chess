import * as rules from '../../../dist/engine.js';
import {applyAction} from '../diagnosis/simulate.mjs';
import fs from 'node:fs';
const results=[];
for(const [seed,kickoff]of[[202610161,'white'],[202610162,'black']]){
 const file=new URL(`../final/final-${seed}-${kickoff}.json`,import.meta.url),match=JSON.parse(fs.readFileSync(file,'utf8'));
 let state=rules.createGame({mode:'local',seed,kickoff,minutes:10,foulsEnabled:true});
 for(const event of match.events){state=applyAction(rules,state,event.action);if(JSON.stringify(state)!==JSON.stringify(event.state))throw new Error(`Reference replay mismatch at ${seed} step${event.step}`);}
 results.push({seed,kickoff,exactReplayedTransitions:match.events.length,mismatches:0});
}
fs.writeFileSync(new URL('./c-reference-replay-audit.json',import.meta.url),JSON.stringify({results},null,2));console.log(JSON.stringify({results}));
