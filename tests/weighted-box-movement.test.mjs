import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../dist/engine.js';

const other=t=>t==='white'?'black':'white';
const id=(v,t)=>t==='white'?v:v.replace(/^(white|black)/,other);
const point=([x,y],t,end='top')=>{const p={x,y:end==='top'?y:E.BOARD_HEIGHT-1-y};return t==='white'?p:{x:E.BOARD_WIDTH-1-p.x,y:E.BOARD_HEIGHT-1-p.y};};
function fixture({team='white',end='top',phase='attackMove',actor='white-R1',origin=[4,1],carrying=false,positions={},ball}={}){
 const s=E.createGame({mode:'local',seed:417}),assigned={'white-K':[1,15],'black-K':[12,1],'white-Q':[11,8],'white-R2':[11,9],[actor]:origin,...positions};
 const used=new Set(Object.values(assigned).map(p=>p.join(',')));assert.equal(used.size,Object.keys(assigned).length);
 const parking=Array.from({length:E.BOARD_HEIGHT},(_,y)=>[[0,y],[E.BOARD_WIDTH-1,y]]).flat();
 for(const p of s.pieces){const q=assigned[p.id]||parking.find(q=>!used.has(q.join(',')));assert.ok(q);used.add(q.join(','));Object.assign(p,point(q,team,end));p.id=id(p.id,team);if(team==='black')p.team=other(p.team);}
 const carrier=carrying?id(actor,team):id(phase==='defendMove'?'black-Q':actor==='white-Q'?'white-R2':'white-Q',team),owner=s.pieces.find(p=>p.id===carrier);
 s.attack=phase==='defendMove'?other(team):team;s.phase=phase;s.restart=null;s.offside=null;
 s.ball=ball?{...point(ball,team,end),carrierId:null}:{x:owner.x,y:owner.y,carrierId:owner.id};
 s.ballProgress={team:s.attack,anchorY:s.ball.y,rounds:0,pendingRelease:false,excludeRelease:false};
 assert.equal(new Set(s.pieces.map(p=>`${p.x},${p.y}`)).size,22);assert.ok(s.pieces.every(p=>E.canOccupySquare(p,p.x,p.y)));return s;
}
const offered=(s,actor,target,options={})=>E.legalMoves(s,actor,options).find(m=>m.x===target.x&&m.y===target.y);

test('movement points charge entered squares, preserve native geometry, and do not charge the origin',()=>{
 assert.equal(E.MOVE_RANGE,10);assert.equal(E.DRIBBLE_RANGE,8);assert.equal(E.BOX_MOVE_COST,2);
 const rook={id:'white-R1',team:'white',type:'R',x:4,y:1};
 assert.equal(E.movementCost(rook,4,1),0);assert.equal(E.movementCost(rook,3,1),1);assert.equal(E.movementCost({...rook,x:3},4,1),2);
 assert.equal(E.movementCost(rook,9,1),10);assert.equal(E.movementCost(rook,10,1),11);
 for(const [x,y]of [[5,2],[-1,1],[4,17],[4.5,1]])assert.equal(E.movementCost(rook,x,y),Infinity);
 assert.equal(E.movementCost(null,4,1),Infinity);
});

for(const team of ['white','black'])for(const end of ['top','bottom']){
 test(`${team}, ${end}: queens and rooks already inside can traverse five box squares off-ball or four while carrying`,()=>{
  for(const actor of ['white-Q','white-R1'])for(const carrying of [false,true]){
   const origin=[4,1],s=fixture({team,end,actor,origin,carrying}),piece=s.pieces.find(p=>p.id===id(actor,team)),last=point([carrying?8:9,1],team,end),tooFar=point([carrying?9:10,1],team,end),before=structuredClone(s);
   assert.equal(E.movementCost(piece,last.x,last.y),carrying?8:10);assert.ok(offered(s,piece.id,last));assert.equal(offered(s,piece.id,tooFar),undefined);
   assert.throws(()=>E.applyMove(s,piece.id,tooFar.x,tooFar.y),/not a legal move/);assert.deepEqual(s,before);
   const moved=E.applyMove(s,piece.id,last.x,last.y);assert.equal(moved.randomState,s.randomState);
   assert.equal(moved.positionBudget[carrying?'dribbleUsed':'normalUsed'],true);
   assert.deepEqual(moved.ball,carrying?{...last,carrierId:piece.id}:s.ball);
  }
 });

 test(`${team}, ${end}: mixed rays sum ordinary and box entries, including diagonals and exits`,()=>{
  for(const [actor,origin,destination,cost]of [
   ['white-R1',[2,1],[6,1],7],['white-R1',[2,1],[7,1],9],['white-R1',[8,1],[2,1],10],
   ['white-B1',[4,5],[9,0],8],['white-B1',[3,6],[9,0],9],['white-B1',[2,7],[9,0],10],['white-B1',[1,8],[9,0],11],
  ])for(const carrying of [false,true]){
   const s=fixture({team,end,actor,origin,carrying}),p=s.pieces.find(p=>p.id===id(actor,team)),target=point(destination,team,end);
   assert.equal(E.movementCost(p,target.x,target.y),cost);assert.equal(!!offered(s,p.id,target),cost<=(carrying?8:10)&&(!carrying||E.isBox(p.x,p.y)), 'off-ball entry and carrying exits retain weighted costs; carrying entry is forbidden');
  }
 });

 test(`${team}, ${end}: loose-ball collection shares the ten-point limit and occupied squares still stop rays`,()=>{
  for(const destination of [[9,1],[10,1]]){
   const s=fixture({team,end,ball:destination}),target=point(destination,team,end),actor=id('white-R1',team);
   assert.equal(!!offered(s,actor,target),destination[0]===9);
   if(destination[0]===9){const next=E.applyMove(s,actor,target.x,target.y);assert.equal(next.ball.carrierId,actor);assert.equal(next.lastAction.collection,true);}
  }
  const blocked=fixture({team,end,origin:[3,1],positions:{'white-P1':[5,1]}}),actor=id('white-R1',team);
  assert.ok(offered(blocked,actor,point([4,1],team,end)));assert.equal(offered(blocked,actor,point([6,1],team,end)),undefined);
 });

 test(`${team}, ${end}: native knight jumps keep their shape and tackle reach/abstract landings stay unchanged`,()=>{
  for(const carrying of [false,true]){
   const knight=fixture({team,end,actor:'white-N1',origin:[3,3],carrying,positions:{'black-P1':[4,2]}}),actor=id('white-N1',team),target=point([4,1],team,end),p=knight.pieces.find(p=>p.id===actor);
   assert.equal(E.movementCost(p,target.x,target.y),2);assert.equal(!!offered(knight,actor,target),!carrying);
  }
  const challenged=fixture({team,end,phase:'defendMove',origin:[3,1],positions:{'black-Q':[8,1]}}),tackler=id('white-R1',team),farLanding=point([9,1],team,end);
  assert.equal(E.movementCost(challenged.pieces.find(p=>p.id===tackler),farLanding.x,farLanding.y),12);
  assert.equal(offered(challenged,tackler,farLanding)?.type,'tackle','a five-square challenge retains its existing adjacent landing rule');
  const beyond=fixture({team,end,phase:'defendMove',origin:[3,1],positions:{'black-Q':[9,1]}});assert.ok(E.legalMoves(beyond,tackler).every(m=>m.type!=='tackle'));
 });

 test(`${team}, ${end}: passing across the box keeps geometric accuracy instead of movement costs`,()=>{
  const s=fixture({team,end,phase:'kick',origin:[3,1],carrying:true}),target=point([11,1],team,end),p=s.pieces.find(p=>p.id===s.ball.carrierId);
  assert.ok(E.movementCost(p,target.x,target.y)>10);
  const pass=E.legalKicks(s).find(k=>k.x===target.x&&k.y===target.y);assert.ok(pass);assert.equal(pass.distance,8);assert.equal(pass.accuracy,1);
 });
}

test('pawns, kings, the shared bonus and keeper reactions keep their one-step patterns',()=>{
 for(const team of ['white','black'])for(const actor of ['white-P1','white-K']){
  const s=fixture({team,actor,origin:[4,13]}),p=s.pieces.find(p=>p.id===id(actor,team)),target=point([4,14],team);
  assert.equal(E.movementCost(p,target.x,target.y),2);
  for(const freePawn of [false,true])assert.ok(offered(s,p.id,target,{freePawn}));
  const tooFar=point([4,15],team);assert.equal(E.movementCost(p,tooFar.x,tooFar.y),Infinity);assert.equal(offered(s,p.id,tooFar),undefined);
 }
 const s=fixture({phase:'kick',origin:[5,6],carrying:true,positions:{'black-K':[7,1]}}),pending=E.applyKick(s,5,-1),keeper=pending.pieces.find(p=>p.id==='black-K');
 // This reaction is separate from weighted positioning or the shared bonus.
 assert.equal(E.legalMoves(pending,keeper.id).length,8);assert.deepEqual(E.legalMoves(pending,keeper.id,{freePawn:true}),[]);
});

test('normalization and planning preserve spent action budgets, state and the native RNG',()=>{
 const s=fixture({origin:[4,1],carrying:true}),before=structuredClone(s),target={x:8,y:1},moved=E.applyMove(s,'white-R1',target.x,target.y);
 assert.equal(moved.positionBudget.dribbleUsed,true);const restored=E.normalizeGame(moved);assert.deepEqual(restored.positionBudget,moved.positionBudget);assert.deepEqual(E.legalMoves(restored,'white-R1'),[]);
 for(const difficulty of ['casual','tactical']){const a=E.chooseAIAction(s,{difficulty});assert.deepEqual(s,before);if(a.type==='move')assert.ok(offered(s,a.pieceId,a,{freePawn:a.freePawn}));}
 assert.equal(restored.randomState,s.randomState);
});
