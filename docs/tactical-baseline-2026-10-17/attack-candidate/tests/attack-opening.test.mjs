import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const internals=async name=>import('data:text/javascript;base64,'+Buffer.from(await readFile(new URL(name,import.meta.url),'utf8')+'\nexport {rankedTacticalActions,tacticalShots};').toString('base64'));
const [old,E]=await Promise.all([internals('../engine-original.mjs'),internals('../engine-opening-v1.mjs')]);
const other=team=>team==='white'?'black':'white';
function fixture(team){
 const s=E.createGame({seed:18});const assigned={'white-K':[6,16],'black-K':[8,0],'white-Q':[6,3],'white-B1':[6,2],'black-R1':[12,1]},used=new Set(Object.values(assigned).map(p=>p.join()));
 const parking=Array.from({length:17},(_,y)=>[[0,y],[13,y]]).flat();
 for(const p of s.pieces){const q=assigned[p.id]||parking.find(q=>!used.has(q.join()));[p.x,p.y]=q;used.add(q.join());}
 Object.assign(s,{phase:'attackMove',attack:'white',ball:{x:6,y:3,carrierId:'white-Q'},positionBudget:{normalUsed:false,pawnUsed:true,dribbleUsed:true},restart:null,offside:null,pendingShot:null,releaseReason:null});
 if(team==='black'){
  s.attack='black';s.pieces=s.pieces.map(p=>({...p,team:other(p.team),id:p.id.replace(/^(white|black)/,other),x:13-p.x,y:16-p.y}));s.ball={x:7,y:13,carrierId:'black-Q'};
 }
 assert.ok(s.pieces.every(p=>E.canOccupySquare(p,p.x,p.y)));assert.equal(E.offsideInfo(s,team).boxAttackerIds.length,0);return s;
}
for(const team of ['white','black'])test(`${team} Tactical orders a real shot-lane clearance ahead of unrelated support`,()=>{
 const s=fixture(team),before=structuredClone(s),first=E.rankedTacticalActions(s,9,true)[0].action;
 assert.equal(E.tacticalShots(s,team,true),0);assert.equal(first.pieceId,`${team}-B1`);
 assert.ok(E.legalMoves(s,first.pieceId).some(a=>a.x===first.x&&a.y===first.y));
 const moved=E.applyMove(s,first.pieceId,first.x,first.y,{freePawn:!!first.freePawn});assert.ok(E.tacticalShots(moved,team,true)>.7);
 const previous=old.rankedTacticalActions(s,9,true)[0].action,prior=old.applyMove(s,previous.pieceId,previous.x,previous.y,{freePawn:!!previous.freePawn});
 assert.equal(old.tacticalShots(prior,team,true),0,'the previous first-ranked support move leaves the shot blocked');
 assert.deepEqual(s,before,'ordering is pure');
 const inner=E.rankedTacticalActions(s,3,false)[0].action;
 assert.equal(inner.pieceId,`${team}-B1`,'inner ordering also opens the carrier finish');
 const changedSeed={...s,randomState:98765};assert.deepEqual(E.chooseAIAction(s,{difficulty:'tactical',modelWeights:null}),E.chooseAIAction(changedSeed,{difficulty:'tactical',modelWeights:null}));
 assert.deepEqual(E.chooseAIAction(s,{difficulty:'casual',modelWeights:null}),old.chooseAIAction(s,{difficulty:'casual',modelWeights:null}),'Casual unchanged');
});
