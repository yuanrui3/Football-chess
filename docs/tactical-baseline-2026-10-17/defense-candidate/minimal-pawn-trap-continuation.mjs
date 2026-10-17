import {readFile,writeFile} from 'node:fs/promises';import * as C from './engine-minimal-reply-risk.mjs';
const prior=JSON.parse(await readFile('pawn-trap-full-risk-probe.json','utf8')),s0=prior.rows.find(r=>r.label==='strict').finalState;
let s=s0,rows=[];
for(let j=0;j<8;j++){
 const team=C.currentTeam(s),phase=s.phase,a=C.analyzeTacticalAction(s,{nodeLimit:1400,maxDepth:8,modelWeights:null}).action;
 const after=a.type==='move'?C.applyMove(s,a.pieceId,a.x,a.y,{freePawn:a.freePawn}):a.type==='kick'?C.applyKick(s,a.x,a.y,{disguise:a.disguise}):C.skipMove(s);
 rows.push({phase,team,action:a,result:after.lastAction,ball:after.ball,progress:C.progressInfo(after)});s=after;if(team==='white'&&a.type==='kick')break;
}
await writeFile('minimal-pawn-trap-continuation.json',JSON.stringify(rows,null,2)+'\n');console.log(JSON.stringify(rows.map(r=>({phase:r.phase,team:r.team,action:r.action,result:r.result.type,ball:r.ball,progress:r.progress}))));
