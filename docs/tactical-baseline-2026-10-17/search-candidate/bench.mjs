import fs from 'node:fs/promises';
import * as B from './baseline.mjs';
import * as C from './engine.mjs';
import {fixture} from '/workspace/github/football-chess-pace/tests/helpers/shot-fixture.mjs';
const cases=[];
for(const [type,origin,keeper] of [['Q',[6,1],[6,0]],['R',[5,3],[8,0]],['N',[6,1],[8,0]],['Q',[6,6],[6,1]]]){
 const s=fixture({type,origin,keeper});cases.push({name:`${type}-${origin.join()}`,state:s});
}
for(const phase of ['kickoff','attackMove','defendMove']){let s=B.createGame({seed:31});s.phase=phase;cases.push({name:phase,state:s});}
const reports=[];
for(const c of cases){
 const report={name:c.name};
 for(const [name,E] of [['baseline',B],['candidate',C]]){const t=performance.now(),r=E.analyzeTacticalAction(c.state,{nodeLimit:1400,maxDepth:8,modelWeights:null});report[name]={ms:performance.now()-t,...r};}
 reports.push(report);console.log(JSON.stringify(report));
}
await fs.writeFile(new URL('benchmark.json',import.meta.url),JSON.stringify(reports,null,2));
