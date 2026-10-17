import {readFile,writeFile} from 'node:fs/promises';
import * as E from './engine.mjs';
const originalPath='../frozen/dist/engine.js';
const expose=async path=>import('data:text/javascript;base64,'+Buffer.from(await readFile(path,'utf8')+'\nexport {rankedTacticalActions,looseBallValue,canCollect};').toString('base64'));
const [B,C]=await Promise.all([expose(originalPath),expose('./engine.mjs')]);
let seed=606017;function rnd(n){seed=(Math.imul(seed,1664525)+1013904223)>>>0;return Math.floor(seed/4294967296*n);}
let cases=0,baselineWrong=0,candidateWrong=0;const examples=[];
for(let trial=0;trial<240;trial++){
 const s=E.createGame({seed:1}),used=new Set();
 for(const p of s.pieces){let x,y;do{x=rnd(14);y=p.type==='K'?(p.team==='white'?14+rnd(3):rnd(3)):rnd(17);}while(used.has(x+','+y)||!E.canOccupySquare(p,x,y));p.x=x;p.y=y;used.add(x+','+y);}
 let x,y;do{x=rnd(14);y=rnd(17);}while(used.has(x+','+y)||E.isGoalMouth(x,y));
 Object.assign(s,{attack:'white',phase:'attackMove',ball:{x,y,carrierId:null},offside:null,restart:null,looseBallKickOrigin:null,positionBudget:{normalUsed:false,pawnUsed:false,dribbleUsed:false},ballProgress:{team:'white',anchorY:y,rounds:0,pendingRelease:false,excludeRelease:false}});
 if(s.pieces.some(p=>p.team==='white'&&B.canCollect(s,p,s.ball)))continue;
 const b=B.rankedTacticalActions(s,9,true),c=C.rankedTacticalActions(s,9,true);
 const bad=a=>{const p=s.pieces.find(p=>p.id===a?.pieceId);return p?.type==='B'&&(p.x+p.y-x-y)%2!==0;};
 cases++;baselineWrong+=Number(bad(b[0]?.action));candidateWrong+=Number(bad(c[0]?.action));
 if(bad(b[0]?.action)&&examples.length<4)examples.push({trial,state:s,baseline:b.slice(0,3),candidate:c.slice(0,3),values:[B.looseBallValue(s,'white'),C.looseBallValue(s,'white')]});
}
const report={cases,baselineWrong,candidateWrong,examples};await writeFile('probe-defense.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({cases,baselineWrong,candidateWrong,examples:examples.map(e=>({trial:e.trial,ball:e.state.ball,baseline:e.baseline[0],candidate:e.candidate[0],values:e.values}))}));
