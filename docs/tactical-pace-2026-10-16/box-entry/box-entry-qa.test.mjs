import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from './engine.mjs';
const clone=structuredClone,other=t=>t==='white'?'black':'white';
const id=(value,t)=>t==='white'?value:value.replace(/^(white|black)/,other);
const point=([x,y],team='white',end='top')=>{const p={x,y:end==='top'?y:E.BOARD_HEIGHT-1-y};return team==='white'?p:{x:E.BOARD_WIDTH-1-p.x,y:E.BOARD_HEIGHT-1-p.y};};
function fixture({team='white',end='top',phase='attackMove',actor='white-R1',origin=[3,1],carrying=true,positions={}}={}){
 const s=E.createGame({mode:'local',seed:1604}),assigned={'white-K':[1,15],'black-K':[12,1],'white-Q':[11,8],'black-N1':[11,0],'black-N2':[12,0],[actor]:origin,...positions};
 const used=new Set(Object.values(assigned).map(p=>p.join(',')));assert.equal(used.size,Object.keys(assigned).length);
 const parking=Array.from({length:E.BOARD_HEIGHT},(_,y)=>[[0,y],[E.BOARD_WIDTH-1,y]]).flat();
 for(const p of s.pieces){const q=assigned[p.id]||parking.find(q=>!used.has(q.join(',')));assert.ok(q);used.add(q.join(','));Object.assign(p,point(q,team,end));p.id=id(p.id,team);if(team==='black')p.team=other(p.team);}
 for(const p of s.pieces.filter(p=>p.type==='K'&&p.id!==id(actor,team)))Object.assign(p,p.team==='white'?{x:1,y:15}:{x:12,y:1});
 const owner=s.pieces.find(p=>p.id===id(carrying?actor:'white-R2',team));
 Object.assign(s,{phase,attack:team,ball:{x:owner.x,y:owner.y,carrierId:owner.id},restart:null,offside:null,pendingShot:null,paceControl:null,positionBudget:{normalUsed:false,pawnUsed:false,dribbleUsed:false},ballProgress:{team,anchorY:owner.y,rounds:0,pendingRelease:false,excludeRelease:false}});
 assert.equal(new Set(s.pieces.map(p=>`${p.x},${p.y}`)).size,22);assert.ok(s.pieces.every(p=>E.canOccupySquare(p,p.x,p.y)));return s;
}
const offered=(s,p,target,options)=>E.legalMoves(s,p,options).find(m=>m.x===target.x&&m.y===target.y);
for(const team of ['white','black'])for(const end of ['top','bottom']){
 test(`${team}/${end}: every outfield type can carry into a free box square without an RNG draw`,()=>{
  for(const [actor,origin,target]of [['white-Q',[3,1],[4,1]],['white-R1',[3,1],[4,1]],['white-B1',[3,3],[4,2]],['white-N1',[3,3],[4,1]],['white-P1',[3,1],[4,1]]]){
   const s=fixture({team,end,actor,origin}),before=clone(s),to=point(target,team,end),pieceId=id(actor,team);assert.ok(offered(s,pieceId,to));
   const next=E.applyMove(s,pieceId,to.x,to.y);assert.deepEqual(next.ball,{...to,carrierId:pieceId});assert.equal(next.randomState,s.randomState);assert.equal(next.positionBudget.dribbleUsed,true);assert.deepEqual(s,before);
  }
 });
 test(`${team}/${end}: box entry and corner traversal obey weighted eight-point carrying budget`,()=>{
  for(const actor of ['white-Q','white-R1']){
   const s=fixture({team,end,actor,origin:[2,1]}),piece=s.pieces.find(p=>p.id===id(actor,team)),allowed=point([6,1],team,end),denied=point([7,1],team,end);
   assert.equal(E.movementCost(piece,allowed.x,allowed.y),7);assert.equal(E.movementCost(piece,denied.x,denied.y),9);assert.ok(offered(s,piece.id,allowed));assert.equal(offered(s,piece.id,denied),undefined);
  }
  for(const actor of ['white-Q','white-B1']){const s=fixture({team,end,actor}),to=point([5,3],team,end);assert.equal(E.movementCost(s.pieces.find(p=>p.id===id(actor,team)),to.x,to.y),3);assert.ok(offered(s,id(actor,team),to));}
  const s=fixture({team,end,origin:[4,1]}),piece=id('white-R1',team);assert.ok(offered(s,piece,point([8,1],team,end)));assert.equal(offered(s,piece,point([9,1],team,end)),undefined);
 });
 test(`${team}/${end}: occupied box squares still stop ordinary carriers and knights still jump`,()=>{
  const r=fixture({team,end,origin:[3,1],positions:{'black-P1':[5,1]}});assert.ok(offered(r,id('white-R1',team),point([4,1],team,end)));assert.equal(offered(r,id('white-R1',team),point([6,1],team,end)),undefined);
  const n=fixture({team,end,actor:'white-N1',origin:[3,3],positions:{'black-P1':[4,2]}});assert.ok(offered(n,id('white-N1',team),point([4,1],team,end)));
 });
 test(`${team}/${end}: goal-mouth reservations remain absolute for outfield carriers`,()=>{
  const y=end==='top'?0:E.BOARD_HEIGHT-1;
  for(const x of E.GOAL_FILES)for(const type of ['Q','R','B','N','P'])assert.equal(E.canOccupySquare({team,type,id:`${team}-${type}`},x,y),false);
  const s=fixture({team,end,origin:[6,1]}),to=point([6,0],team,end);assert.equal(offered(s,id('white-R1',team),to),undefined);
 });
}
for(const team of ['white','black']){
 test(`${team}: own king can re-enter carrying, while opponent-box entry remains forbidden`,()=>{
  const s=fixture({team,actor:'white-K',origin:[3,15]}),piece=id('white-K',team),to=point([4,15],team);assert.ok(offered(s,piece,to));const entered=E.applyMove(s,piece,to.x,to.y);assert.ok(E.inOwnBox(team,entered.ball.x,entered.ball.y));
  const enemy=fixture({team,actor:'white-K',origin:[3,1]});assert.equal(offered(enemy,piece,point([4,1],team)),undefined);
 });
 test(`${team}: pass-and-run still cannot enter or cross a box`,()=>{
  const s=fixture({team,phase:'kick',origin:[3,1],positions:{'white-R2':[3,4]}}),receiver=s.pieces.find(p=>p.id===id('white-R2',team)),run=E.applyKick(s,receiver.x,receiver.y,{roll:0,passRun:true}),passer=id('white-R1',team);assert.equal(run.phase,'passRun');
  for(const target of [[4,1],[5,3]])assert.equal(offered(run,passer,point(target,team)),undefined);
  assert.ok(offered(E.skipMove(run),passer,point([4,1],team)),'ordinary off-ball entry remains distinct from the optional immediate run');
 });
 test(`${team}: own loose box pass cannot be collected by its outside kicker, but a teammate may receive`,()=>{
  const s=fixture({team,phase:'kick',actor:'white-Q',origin:[3,1],positions:{'white-R2':[4,4]}}),to=point([4,2],team),loose=E.applyKick(s,to.x,to.y,{roll:0}),q=id('white-Q',team),r=id('white-R2',team);
  assert.equal(offered(loose,q,to),undefined);assert.ok(offered(loose,r,to));const entered=point([4,1],team),staged=E.applyMove(loose,q,entered.x,entered.y);assert.deepEqual(staged.looseBallKickOrigin.from,point([3,1],team));
  let next=E.skipMove(E.skipMove(staged));if(next.phase==='kick')next=E.skipMove(next);assert.equal(offered(next,q,to),undefined);assert.equal(offered(E.normalizeGame(next),q,to),undefined);
 });
 test(`${team}: protected restart and compulsory keeper release still grant no carrier positioning`,()=>{
  for(const type of ['corner','throwIn','freeKick','stalling']){const s=fixture({team}),piece=s.ball.carrierId;s.restart={type,team,takerId:piece,spot:{x:s.ball.x,y:s.ball.y},indirect:type==='stalling'};assert.deepEqual(E.legalMoves(s,piece),[]);}
  const s=fixture({team,phase:'kick',actor:'white-Q',origin:[1,11]}),k=s.pieces.find(p=>p.id===id('white-K',team)),release=E.applyKick(s,k.x,k.y,{roll:0});assert.equal(release.phase,'keeperRelease');assert.deepEqual(E.legalMoves(release,k.id),[]);assert.throws(()=>E.skipMove(release));
 });
 test(`${team}: a fifth carrying round is still called before a newly legal box entry`,()=>{
  const s=fixture({team}),piece=s.ball.carrierId;s.paceControl={team,carrierId:piece,dribbleRounds:4,dribbledThisRound:false,history:[],furthestAdvance:team==='white'?-s.ball.y:s.ball.y};const to=point([4,1],team);assert.ok(offered(s,piece,to));const result=E.applyMove(s,piece,to.x,to.y);assert.equal(result.restart.reason,'dribbleLimit');assert.deepEqual(result.lastAction.offence,{x:s.ball.x,y:s.ball.y});assert.equal(result.attack,other(team));
 });
}
