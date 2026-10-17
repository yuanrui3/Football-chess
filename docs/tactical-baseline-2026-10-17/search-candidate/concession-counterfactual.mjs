import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import * as E from '../combined-v1/rules-engine.mjs';
import * as B from './baseline.mjs';
import * as Q from './engine.mjs';
const rows=JSON.parse(await fs.readFile(new URL('concession-audit.json',import.meta.url),'utf8')),row=rows.find(r=>r.step===174),before=row.state;
const apply=(s,a)=>a.type==='move'?E.applyMove(s,a.pieceId,a.x,a.y,{freePawn:!!a.freePawn}):E.skipMove(s);
const strip=s=>{s=structuredClone(s);delete s.log;delete s.lastAction;return s};
const branch=async(Eval,key)=>{
 const tackle=row.reports[key].action,miss=apply(before,tackle),report=Eval.analyzeTacticalAction(miss,{nodeLimit:1400,maxDepth:8,modelWeights:null}),finished=apply(miss,report.action);
 return{key,tackle,outcome:miss.lastAction.outcome,roll:miss.lastAction.roll,followup:report,finished};
};
const b=await branch(B,'Baseline'),q=await branch(Q,'Q1');
let identical=true;try{assert.deepEqual(strip(b.finished),strip(q.finished));}catch{identical=false;}
const result={sameRuleStateBefore176:identical,baseline:b,q1:q};
await fs.writeFile(new URL('concession-counterfactual.json',import.meta.url),JSON.stringify(result,null,2));
console.log(JSON.stringify({sameRuleStateBefore176:identical,baseline:{tackle:b.tackle,outcome:b.outcome,roll:b.roll,followup:b.followup.action},q1:{tackle:q.tackle,outcome:q.outcome,roll:q.roll,followup:q.followup.action}}));
