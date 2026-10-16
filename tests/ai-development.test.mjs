import test from 'node:test';
import assert from 'node:assert/strict';
import * as e from '../dist/engine.js';
const candidate=e;
const budget=()=>({normalUsed:false,pawnUsed:false,dribbleUsed:false});
function fixture({phase='attackMove',attack='white',carrier='white-Q',positions={},ball=null,origin=null,clear=[]}={}){
 const s=e.createGame({seed:17}); const assigned={'white-K':[6,16],'black-K':[7,0],...positions};
 const used=new Set(Object.values(assigned).map(p=>p.join(','))); for(const p of clear)used.add(p.join(','));
 const parking=Array.from({length:e.BOARD_HEIGHT},(_,y)=>[[0,y],[e.BOARD_WIDTH-1,y]]).flat();
 for(const p of s.pieces){let v=assigned[p.id]||parking.find(v=>!used.has(v.join(',')));if(!v)throw Error('parking exhausted');[p.x,p.y]=v;used.add(v.join(','));}
 s.phase=phase;s.attack=attack;s.positionBudget=budget();s.restart=null;s.offside=null;s.pendingShot=null;s.releaseReason=null;s.looseBallKickOrigin=origin;
 const p=s.pieces.find(p=>p.id===carrier);s.ball=ball||{x:p.x,y:p.y,carrierId:p.id};s.ballProgress={team:attack,anchorY:s.ball.y,rounds:0,pendingRelease:false,excludeRelease:false};return s;
}
function act(s,a,o={}){return a.type==='kick'?e.applyKick(s,a.x,a.y,o):a.type==='move'?e.applyMove(s,a.pieceId,a.x,a.y,{freePawn:a.freePawn,...o}):e.skipMove(s,o);}
function tackles(s){return s.pieces.filter(p=>p.team===e.currentTeam(s)).flatMap(p=>e.legalMoves(s,p.id).filter(m=>m.type==='tackle').map(m=>({...m,pieceId:p.id})));}

const clone=structuredClone;
const other=t=>t==='white'?'black':'white';
function mirror(s){
 const t=clone(s),id=v=>v?.replace(/^(white|black)/,other)??null;
 t.attack=other(s.attack);t.score={white:s.score.black,black:s.score.white};
 t.pieces=s.pieces.map(p=>({...p,id:id(p.id),team:other(p.team),x:e.BOARD_WIDTH-1-p.x,y:e.BOARD_HEIGHT-1-p.y}));
 t.ball={x:e.BOARD_WIDTH-1-s.ball.x,y:e.BOARD_HEIGHT-1-s.ball.y,carrierId:id(s.ball.carrierId)};
 if(s.restart)t.restart={...s.restart,team:other(s.restart.team),takerId:id(s.restart.takerId),spot:{x:e.BOARD_WIDTH-1-s.restart.spot.x,y:e.BOARD_HEIGHT-1-s.restart.spot.y}};
 if(s.ballProgress)t.ballProgress={...s.ballProgress,team:other(s.ballProgress.team),anchorY:e.BOARD_HEIGHT-1-s.ballProgress.anchorY};
 if(s.looseBallKickOrigin)t.looseBallKickOrigin={team:other(s.looseBallKickOrigin.team),pieceId:id(s.looseBallKickOrigin.pieceId)};
 if(s.offside)t.offside={...s.offside,team:other(s.offside.team),kickerId:id(s.offside.kickerId),flaggedIds:s.offside.flaggedIds.map(id),ball:s.offside.ball?{x:e.BOARD_WIDTH-1-s.offside.ball.x,y:e.BOARD_HEIGHT-1-s.offside.ball.y}:undefined,secondLastY:e.BOARD_HEIGHT-1-s.offside.secondLastY};
 return t;
}
function selfPassState(){return fixture({positions:{'white-Q':[5,10],'white-R1':[1,4],'black-R1':[7,4]},ball:{x:5,y:4,carrierId:null},origin:{team:'white',pieceId:'white-Q'}});}
function offsideState(){const s=fixture({phase:'kick',carrier:'white-B2',positions:{'white-Q':[5,5],'white-R1':[1,6],'white-B2':[1,10],'black-Q':[0,6],'black-R1':[7,6],'black-R2':[11,6],'black-B1':[0,7],'black-B2':[11,7],'black-N1':[0,8],'black-N2':[11,8],'black-P1':[0,9],'black-P2':[11,9],'black-P3':[0,10]}});return e.applyKick(s,5,6);}
function kingState(){const s=fixture({phase:'defendMove',attack:'black',carrier:'black-Q',positions:{"white-K":[5,15],"white-Q":[5,7],"white-R1":[10,11],"white-R2":[6,8],"white-B1":[4,8],"white-B2":[9,10],"white-N1":[7,8],"white-N2":[7,6],"white-P1":[5,9],"white-P2":[6,9],"white-P3":[8,13],"black-K":[6,1],"black-Q":[10,13],"black-R1":[10,12],"black-R2":[1,3],"black-B1":[5,8],"black-B2":[2,4],"black-N1":[7,9],"black-N2":[5,6],"black-P1":[7,5],"black-P2":[5,5],"black-P3":[3,4]}});s.turn=10;s.ballProgress={team:'black',anchorY:12,rounds:1,pendingRelease:false,excludeRelease:false};return s;}
function legalChoice(s,a){
 if(a.type==='move')assert.ok(e.legalMoves(s,a.pieceId,{freePawn:!!a.freePawn}).some(m=>m.x===a.x&&m.y===a.y));
 else if(a.type==='kick')assert.ok(e.legalKicks(s).some(k=>k.x===a.x&&k.y===a.y));
 else{assert.equal(a.type,'skip');assert.ok(['attackMove','defendMove','keeperReact'].includes(s.phase));}
}
for(const difficulty of ['casual','tactical']){
 test(`${difficulty}: selects a teammate collector with a carry remaining rather than a self-collection with a guaranteed loss, either color`,()=>{
  const original=selfPassState();
  for(let s of [original,mirror(original)]){
   const team=s.attack;let steps=0;
   while(e.currentTeam(s)===team&&steps++<6){const a=candidate.chooseAIAction(s,{difficulty});legalChoice(s,a);s=act(s,a);}
   assert.equal(s.phase,'defendMove');
   assert.equal(s.ball.carrierId,`${team}-R1`,'rook can collect a teammate pass, then dribble out of the challenge');
   assert.equal(tackles(s).filter(m=>m.tackleProbability===1).length,0,'do not leave the collected ball exposed to an immediate guaranteed challenge');
  }
 });
 test(`${difficulty}: an offside collector yields to an eligible teammate, either color`,()=>{
  const original=offsideState();
  for(let s of [original,mirror(original)]){
   const team=s.attack;let steps=0;
   while(!s.ball.carrierId&&e.currentTeam(s)===team&&steps++<6){const a=candidate.chooseAIAction(s,{difficulty});legalChoice(s,a);s=act(s,a);assert.notEqual(s.lastAction.type,'offside');}
   assert.equal(s.attack,team);assert.equal(s.ball.carrierId,`${team}-R1`);
  }
 });
 test(`${difficulty}: the goalkeeper does not leave its box merely to chase an unshootable wide carrier`,()=>{
  const original=kingState();
  for(const s of [original,mirror(original)]){
   const a=candidate.chooseAIAction(s,{difficulty});legalChoice(s,a);const p=s.pieces.find(p=>p.id===a.pieceId);
   if(a.type==='move'&&p.type==='K')assert.ok(e.inOwnBox(p.team,a.x,a.y),'keeper protects the goal when there is no tackle or immediate goal ray');
  }
 });
 test(`${difficulty}: public-board choices preserve state and ignore future random values`,()=>{
  for(const base of [selfPassState(),offsideState(),kingState(),e.createGame({seed:55})]){
   const s=clone(base),before=clone(s),a=candidate.chooseAIAction(s,{difficulty});legalChoice(s,a);assert.deepEqual(s,before);
   for(const randomState of [0,0xffffffff,123456789])assert.deepEqual(candidate.chooseAIAction({...s,randomState},{difficulty}),a);
  }
 });
 test(`${difficulty}: 120 natural decisions remain legal with a complete, non-overlapping squad`,()=>{
  let s=e.createGame({seed:89922});
  for(let i=0;i<120;i++){
   const a=candidate.chooseAIAction(s,{difficulty});legalChoice(s,a);s=act(s,a);assert.equal(s.pieces.length,22);assert.equal(new Set(s.pieces.map(p=>`${p.x},${p.y}`)).size,22);
   assert.ok(s.pieces.every(p=>p.x>=0&&p.x<e.BOARD_WIDTH&&p.y>=0&&p.y<e.BOARD_HEIGHT&&e.canOccupySquare(p,p.x,p.y)));
   if(s.ball.carrierId){const p=s.pieces.find(p=>p.id===s.ball.carrierId);assert.equal(p.team,s.attack);assert.equal(p.x,s.ball.x);assert.equal(p.y,s.ball.y);}
  }
 });
}

// Reusing a public snapshot after editing an observable piece must not retain
// analysis of the old board. Equality to a fresh clone checks the contract.
test('Casual choices on an edited snapshot equal choices on a fresh identical board',()=>{
 const s=fixture({phase:'defendMove',carrier:'white-B1',positions:{"white-K":[5,15],"white-Q":[5,7],"white-R1":[1,11],"white-R2":[10,4],"white-B1":[4,8],"white-B2":[9,10],"white-N1":[3,8],"white-N2":[8,9],"white-P1":[4,12],"white-P2":[6,11],"white-P3":[8,12],"black-K":[6,1],"black-Q":[6,4],"black-R1":[10,3],"black-R2":[1,3],"black-B1":[9,4],"black-B2":[2,4],"black-N1":[8,6],"black-N2":[3,5],"black-P1":[7,2],"black-P2":[5,2],"black-P3":[3,2]}});
 s.turn=2;s.ballProgress={team:'white',anchorY:10,rounds:0,pendingRelease:false,excludeRelease:false};
 candidate.chooseAIAction(s,{difficulty:'casual'});
 const carrier=s.pieces.find(p=>p.id==='white-B1');carrier.x=9;carrier.y=2;s.ball={x:9,y:2,carrierId:carrier.id};
 const afterEdit=candidate.chooseAIAction(s,{difficulty:'casual'});
 const fresh=candidate.chooseAIAction(clone(s),{difficulty:'casual'});
 assert.deepEqual(afterEdit,fresh);
});

function throwFixture(){
 const s=fixture({phase:'defendMove',carrier:'white-B1',positions:{'white-B1':[0,4],'white-R1':[5,4],'black-B1':[8,8],'black-K':[7,0]}});
 s.restart={type:'throwIn',team:'white',takerId:'white-B1',spot:{x:0,y:4},indirect:false};return s;
}
function afterReceiverShotThreat(state,target,receiverId){
 const kicking={...state,phase:'kick'};
 const kick=e.legalKicks(kicking).find(k=>k.x===target.x&&k.y===target.y&&k.receiverId===receiverId);
 if(!kick)return 0;
 const received=e.applyKick(kicking,target.x,target.y,{roll:0});
 if(received.ball.carrierId!==receiverId)return 0;
 return bestReactedShotThreat(received);
}
function bestReactedShotThreat(state){
 let best=0;
 for(const shot of e.legalKicks({...state,phase:'kick'}).filter(k=>k.goal===state.attack)){
  const pending=e.applyKick({...state,phase:'kick'},shot.x,shot.y);
  const keeper=pending.pieces.find(p=>p.type==='K'&&p.team!==state.attack);
  const reactions=[undefined,...e.legalMoves(pending,keeper.id)];
  best=Math.max(best,Math.min(...reactions.map(move=>e.shotChance(pending,shot.x,shot.y,move))));
 }
 return best;
}
function verifyReceiverPress(state,target,receiverId){
 // A press may leave the geometric shot ray clear: the receiver still has an
 // attacking positioning turn and the defence gets a reply before any shot.
 const kicking=state.phase==='defendMove'?e.skipMove(state):state;
 assert.equal(kicking.phase,'kick');
 const received=e.applyKick(kicking,target.x,target.y,{roll:0});
 assert.equal(received.ball.carrierId,receiverId);
 const held=e.skipMove(received),defendingTeam=e.currentTeam(held);
 const replies=position=>position.pieces.filter(p=>p.team===e.currentTeam(position)).flatMap(piece=>
  [false,true].flatMap(freePawn=>e.legalMoves(position,piece.id,{freePawn}).map(move=>({...move,pieceId:piece.id,freePawn}))))
  .sort((a,b)=>Number(b.type==='tackle')-Number(a.type==='tackle')||Number(b.pieceId.endsWith('-K'))-Number(a.pieceId.endsWith('-K')));
 assert.ok(replies(held).some(move=>move.type==='tackle'&&move.targetId===receiverId&&move.tackleProbability===1),
  'an uncovered receiving ray is acceptable only with a real guaranteed tackle on the receiver');
 const carries=[null,...e.legalMoves(received,receiverId)];
 for(const carry of carries){
  let attackPosition=carry?e.applyMove(received,receiverId,carry.x,carry.y):received;
  if(attackPosition.phase==='attackMove')attackPosition=e.skipMove(attackPosition);
  assert.equal(attackPosition.phase,'defendMove');
  const shotBefore=bestReactedShotThreat(attackPosition);
  const answers=[null,...replies(attackPosition)];
  const satisfactory=position=>{
   if(position.attack===defendingTeam)return true;
   const kicking=position.phase==='defendMove'?e.skipMove(position):position;
   return bestReactedShotThreat(kicking)<=shotBefore*(1-e.SHOT_MODEL.blockPerDefender)+1e-10;
  };
  assert.ok(answers.some(answer=>{
   const defended=answer?e.applyMove(attackPosition,answer.pieceId,answer.x,answer.y,{freePawn:answer.freePawn,roll:0}):attackPosition;
   if(satisfactory(defended))return true;
   // A king can combine its normal and shared bonus steps before the kick.
   // Test that real defensive round, rather than only one action from it.
   return defended.phase==='defendMove'&&replies(defended).some(reply=>satisfactory(e.applyMove(defended,reply.pieceId,reply.x,reply.y,{freePawn:reply.freePawn,roll:0})));
  }),`holding or carrying to ${carry?`${carry.x},${carry.y}`:'the receiving square'} must have a legal reply that wins the ball or reduces the shot by at least one defender's block`);
 }
}
for(const difficulty of ['casual','tactical'])test(`${difficulty}: covers a straight throw from a bishop as a real receiving threat, either color`,()=>{
 const original=throwFixture();
 for(const s of [original,mirror(original)]){
  const receiverId=`${s.attack}-R1`,receiver=s.pieces.find(p=>p.id===receiverId),target={x:receiver.x,y:receiver.y};
  const before=afterReceiverShotThreat(s,target,receiverId);assert.ok(before>0.4,'the legal straight throw feeds a dangerous rook');
  const a=candidate.chooseAIAction(s,{difficulty});legalChoice(s,a);
  const next=act(s,a),after=afterReceiverShotThreat(next,target,receiverId);
  if(!(after<before-0.05))verifyReceiverPress(next,target,receiverId);
 }
});
