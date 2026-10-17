import {readFile,writeFile} from 'node:fs/promises';import {performance} from 'node:perf_hooks';import * as B from './full-reply-risk-base.mjs';import * as C from './engine-full-reply-risk.mjs';
const states=JSON.parse(await readFile('possession-audit-states.json','utf8')),rows=[];
for(let i=0;i<8;i++){
 const entry=states[i*10],s=entry.state,before=structuredClone(s),row={source:entry.source,step:entry.step};
 for(const [name,M]of [['baseline',B],['strict',C]]){const start=performance.now(),r=M.analyzeTacticalAction(s,{nodeLimit:1400,maxDepth:8,modelWeights:null});row[name]={ms:performance.now()-start,nodes:r.stats.nodes,depth:r.stats.completedDepth,action:r.action};}
 if(JSON.stringify(before)!==JSON.stringify(s))throw Error('Mutation');rows.push(row);
}
const summarize=key=>{const xs=rows.map(r=>r[key].ms).sort((a,b)=>a-b);return{meanMs:xs.reduce((s,x)=>s+x,0)/xs.length,p95Ms:xs[Math.ceil(xs.length*.95)-1],meanDepth:rows.reduce((s,r)=>s+r[key].depth,0)/rows.length};};
const report={sampledDecisions:8,nodeLimit:1400,baseline:summarize('baseline'),strict:summarize('strict'),rows,note:'Wall-clock profiling shares CPU with other active validation and benchmarks; deterministic nodes/depth are comparable, timing is approximate.'};await writeFile('full-risk-profile.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
