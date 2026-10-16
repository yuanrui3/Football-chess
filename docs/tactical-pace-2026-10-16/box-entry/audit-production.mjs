import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import * as production from './production-engine.mjs';
import {applyAction} from '../diagnosis/simulate.mjs';
const dir=new URL('.',import.meta.url);
const full=process.argv.includes('--full');
const paths=[...(full?['box-entry-202610161-white-480.json','box-entry-480-202610162-black.json']
 :['box-entry-202610161-white.json','box-entry-202610162-black.json']),
 '../final/final-202610161-white.json','../final/final-202610162-black.json'];
const rows=paths.map(path=>{
 const match=JSON.parse(fs.readFileSync(new URL(path,dir),'utf8'));
 let state=production.createGame({mode:'local',seed:match.seed,kickoff:match.kickoff,minutes:10,foulsEnabled:true});
 for(const event of match.events){state=applyAction(production,state,event.action);assert.deepEqual(state,event.state,`${match.label} transition${event.step}`);}
 return {label:match.label,transitions:match.events.length,mismatches:0,score:state.score};
});
const productionEngineSha256=crypto.createHash('sha256').update(fs.readFileSync(new URL('./production-engine.mjs',dir))).digest('hex');
const frozenEngineSha256=crypto.createHash('sha256').update(fs.readFileSync(new URL('./engine.mjs',dir))).digest('hex');
const report={productionEngineSha256,frozenTrialEngineSha256:frozenEngineSha256,
 exactTransitionsReplayed:rows.reduce((sum,row)=>sum+row.transitions,0),mismatches:0,matches:rows,
 notes:['Production differs from the frozen box-entry trial engine only by an explanatory comment.',
 'The two prior C records are replayed under the expanded legal move set with their recorded actions, preserving every result; this does not assert identical AI choices under the new rule.']};
fs.writeFileSync(new URL(full?'production-replay-audit-480.json':'production-replay-audit.json',dir),JSON.stringify(report,null,2));
process.stdout.write(JSON.stringify(report,null,2)+'\n');
