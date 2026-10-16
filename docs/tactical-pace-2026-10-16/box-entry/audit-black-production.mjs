import * as rules from '../../../dist/engine.js';
import {applyAction} from '../diagnosis/simulate.mjs';
import fs from 'node:fs';
import crypto from 'node:crypto';
const seed=202610162,kickoff='black',file=new URL(`./box-entry-480-${seed}-${kickoff}.json`,import.meta.url);
const match=JSON.parse(fs.readFileSync(file,'utf8'));
let state=rules.createGame({mode:'local',seed,kickoff,minutes:10,foulsEnabled:true});
for(const event of match.events){state=applyAction(rules,state,event.action);if(JSON.stringify(state)!==JSON.stringify(event.state))throw new Error(`Production transition mismatch at ${event.step}`);}
const report={seed,kickoff,exactReplayedTransitions:match.events.length,mismatches:0,productionSha256:crypto.createHash('sha256').update(fs.readFileSync(new URL('../../../dist/engine.js', import.meta.url))).digest('hex'),frozenSha256:match.engineSha256};
fs.writeFileSync(new URL('./black-production-audit.json',import.meta.url),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
