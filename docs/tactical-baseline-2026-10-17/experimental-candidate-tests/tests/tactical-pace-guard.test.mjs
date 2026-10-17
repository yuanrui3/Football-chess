import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const expose=async path=>import('data:text/javascript;base64,'+Buffer.from(await readFile(path,'utf8')+'\nexport {looseBallValue,canCollect,forbiddenPaceCarry};').toString('base64'));
const New=await expose(new URL('../dist/engine.js',import.meta.url));
const other=t=>t==='white'?'black':'white';
const idFor=(id,team)=>team==='white'?id:id.replace(/^(white|black)/,other);
const point=(x,y,team)=>team==='white'?{x,y}:{x:13-x,y:16-y};
function fixture(team){
 const s=New.createGame({seed:371}),assigned={'white-K':[6,16],'black-K':[7,0],'white-Q':[5,10],'black-P1':[4,8]},used=new Set(Object.values(assigned).map(p=>p.join(',')));
 const parking=Array.from({length:17},(_,y)=>[[0,y],[13,y]]).flat();
 for(const p of s.pieces){const q=assigned[p.id]||parking.find(q=>!used.has(q.join(',')));[p.x,p.y]=q;used.add(q.join(','));}
 if(team==='black')for(const p of s.pieces){p.id=idFor(p.id,team);p.team=other(p.team);Object.assign(p,point(p.x,p.y,team));}
 const q=s.pieces.find(p=>p.id===idFor('white-Q',team));
 Object.assign(s,{phase:'kick',attack:team,ball:{x:q.x,y:q.y,carrierId:q.id},restart:null,offside:null,
  paceControl:{team,carrierId:q.id,dribbleRounds:4,dribbledThisRound:false,history:[],furthestAdvance:(team==='white'?-1:1)*q.y},
  ballProgress:{team,anchorY:q.y,rounds:0,pendingRelease:false,excludeRelease:false}});
 const target=point(5,8,team);return New.applyKick(s,target.x,target.y,{roll:0});
}
for(const team of ['white','black'])test(`${team}: loose-ball value does not credit an illegal fifth self-collection`,()=>{
 const s=fixture(team),before=structuredClone(s),queen=s.pieces.find(p=>p.id===idFor('white-Q',team));
 assert.equal(s.ball.carrierId,null);assert.equal(s.looseBallKickOrigin.pieceId,queen.id);assert.equal(New.paceInfo(s).dribbleRounds,4);
 const collectors=s.pieces.filter(p=>p.team===team&&!New.offsideFlaggedIds(s).includes(p.id)&&New.canCollect(s,p,s.ball));
 assert.deepEqual(collectors.map(p=>p.id),[queen.id]);
 assert.equal(New.forbiddenPaceCarry(s,queen,s.ball),true,'actual fifth carry rule applies to this loose self-pass');
 assert.ok(New.looseBallValue(s,team)<0,'opponent is favored when the only own collector is illegal');
 const attempted=New.applyMove(s,queen.id,s.ball.x,s.ball.y);
 assert.equal(attempted.lastAction.type,'stalling');assert.equal(attempted.lastAction.reason,'dribbleLimit');assert.equal(attempted.restart.team,other(team));
 const legal=structuredClone(s);legal.paceControl.dribbleRounds=3;
 assert.ok(New.looseBallValue(legal,team)>0,'the fourth collection is still credited');
 assert.equal(New.applyMove(legal,queen.id,legal.ball.x,legal.ball.y).lastAction.selfPassCollection,true);
 assert.deepEqual(s,before);
});
