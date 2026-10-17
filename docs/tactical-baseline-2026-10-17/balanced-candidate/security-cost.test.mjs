import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
const expose=async p=>import('data:text/javascript;base64,'+Buffer.from(await readFile(new URL(p,import.meta.url),'utf8')+'\nexport {tacticalBasePositionValue,tacticalTackleRisk};').toString('base64'));
const [B,C]=await Promise.all([expose('../frozen/dist/engine.js'),expose('./engine-25.mjs')]);const other=t=>t==='white'?'black':'white';
function fixture(team,bonus,foulsEnabled){const s=B.createGame({seed:739,foulsEnabled});const pos={'white-K':[6,16],'black-K':[8,0],'white-Q':[6,9],'black-P1':bonus?[6,8]:[5,8]},used=new Set(Object.values(pos).map(p=>p.join()));const parking=Array.from({length:17},(_,y)=>[[0,y],[13,y]]).flat();for(const p of s.pieces){const q=pos[p.id]||parking.find(q=>!used.has(q.join()));[p.x,p.y]=q;used.add(q.join());}
Object.assign(s,{phase:'defendMove',attack:'white',ball:{x:6,y:9,carrierId:'white-Q'},positionBudget:{normalUsed:false,pawnUsed:false,dribbleUsed:true},restart:null,offside:null,pendingShot:null,paceControl:null,ballProgress:{team:'white',anchorY:9,rounds:0,pendingRelease:false,excludeRelease:false}});
if(team==='black'){s.attack='black';s.pieces=s.pieces.map(p=>({...p,team:other(p.team),id:p.id.replace(/^(white|black)/,other),x:13-p.x,y:16-p.y}));s.ball={x:7,y:7,carrierId:'black-Q'};s.ballProgress={...s.ballProgress,team:'black',anchorY:7};}return s;}
for(const team of ['white','black'])for(const bonus of [false,true])for(const fouls of [false,true])test(`${team} ${bonus?'bonus setup':'direct'} ${fouls?'fouls':'clean'}: lowering possession preserves the exact defensive-challenge penalty`,()=>{
const s=fixture(team,bonus,fouls),owner=s.pieces.find(p=>p.id===s.ball.carrierId),safe=structuredClone(s);safe.positionBudget.normalUsed=true;
assert.equal(C.tacticalTackleRisk(s,owner),fouls?.9:1);assert.equal(C.tacticalTackleRisk(safe,owner),0);
const oldPenalty=B.tacticalBasePositionValue(safe,team)-B.tacticalBasePositionValue(s,team),newPenalty=C.tacticalBasePositionValue(safe,team)-C.tacticalBasePositionValue(s,team);
assert.ok(Math.abs(oldPenalty-newPenalty)<1e-8,`${oldPenalty} versus ${newPenalty}`);assert.ok(Math.abs(newPenalty-(fouls?.9:1)*520*.35)<1e-8);
});
for(const team of ['white','black'])for(const bonus of [false,true])for(const fouls of [false,true])test(`${team} ${bonus?'bonus setup':'direct'} ${fouls?'fouls':'clean'}: escape availability keeps its original risk discount`,()=>{
const trapped=fixture(team,bonus,fouls);trapped.phase='attackMove';const escape=structuredClone(trapped);escape.positionBudget.dribbleUsed=false;
const owner=trapped.pieces.find(p=>p.id===trapped.ball.carrierId);assert.equal(C.tacticalTackleRisk(trapped,owner),fouls?.9:1);assert.equal(C.tacticalTackleRisk(escape,owner),fouls?.9:1);
const oldDiscount=B.tacticalBasePositionValue(escape,team)-B.tacticalBasePositionValue(trapped,team),newDiscount=C.tacticalBasePositionValue(escape,team)-C.tacticalBasePositionValue(trapped,team);
assert.ok(Math.abs(oldDiscount-newDiscount)<1e-8,`${oldDiscount} versus ${newDiscount}`);assert.ok(Math.abs(newDiscount-(fouls?.9:1)*(520-65)*.35)<1e-8);
});
