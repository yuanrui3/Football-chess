import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as E from '../dist/engine.js';

// Keep the playable API small; inspect the actual bounded candidate builder and
// evaluation rather than copying either policy into a test implementation.
const source=await readFile(new URL('../dist/engine.js',import.meta.url),'utf8');
const I=await import(`data:text/javascript;base64,${Buffer.from(source+'\nexport {rankedTacticalActions,tacticalOutlets,tacticalPositionValue};\n').toString('base64')}`);
const clone=structuredClone,other=t=>t==='white'?'black':'white';
function fixture(){
 const s=E.createGame({seed:811});
 const positions={'white-K':[6,16],'black-K':[8,0],'white-Q':[1,5],'white-R1':[5,5],'black-R1':[12,1]};
 const used=new Set(Object.values(positions).map(p=>p.join(',')));
 const parking=Array.from({length:9},(_,i)=>[[0,8+i],[13,8+i]]).flat();
 for(const p of s.pieces){const q=positions[p.id]||parking.find(q=>!used.has(q.join(',')));[p.x,p.y]=q;used.add(q.join(','));}
 Object.assign(s,{phase:'attackMove',attack:'white',ball:{x:1,y:5,carrierId:'white-Q'},positionBudget:{normalUsed:false,pawnUsed:true,dribbleUsed:true},restart:null,offside:null,pendingShot:null,releaseReason:null,ballProgress:{team:'white',anchorY:5,rounds:0,pendingRelease:false,excludeRelease:false}});
 assert.ok(s.pieces.every(p=>E.canOccupySquare(p,p.x,p.y)));
 return s;
}
function mirror(s){
 const t=clone(s),id=v=>v?.replace(/^(white|black)/,other)??null,point=p=>({x:E.BOARD_WIDTH-1-p.x,y:E.BOARD_HEIGHT-1-p.y});
 t.attack=other(s.attack);t.score={white:s.score.black,black:s.score.white};
 t.pieces=s.pieces.map(p=>({...p,...point(p),id:id(p.id),team:other(p.team)}));t.ball={...point(s.ball),carrierId:id(s.ball.carrierId)};
 t.ballProgress={...s.ballProgress,team:other(s.ballProgress.team),anchorY:E.BOARD_HEIGHT-1-s.ballProgress.anchorY};return t;
}
function carrier(s){return s.pieces.find(p=>p.id===s.ball.carrierId);}
function receivedShotChance(s){
 const ready={...s,phase:'kick'};let best=0;
 for(const kick of E.legalKicks(ready).filter(k=>k.goal===s.attack)){
  const pending=E.applyKick(ready,kick.x,kick.y),keeper=pending.pieces.find(p=>p.type==='K'&&p.team!==s.attack);
  best=Math.max(best,Math.min(...[undefined,...E.legalMoves(pending,keeper.id)].map(move=>E.shotChance(pending,kick.x,kick.y,move))));
 }
 return best;
}

test('Tactical retains a real off-ball box runner and delivery in its bounded beam, either color',()=>{
 for(const s of [fixture(),mirror(fixture())]){
  const entries=I.rankedTacticalActions(s,9,true),run=entries.find(entry=>entry.category==='boxRun');
  assert.ok(run,'a purposeful box run survives the root beam alongside ordinary support');
  assert.notEqual(run.action.pieceId,s.ball.carrierId);
  const moved=E.applyMove(s,run.action.pieceId,run.action.x,run.action.y,{freePawn:!!run.action.freePawn});
  assert.equal(moved.ball.carrierId,s.ball.carrierId,'the run is off ball');
  assert.ok(E.isBox(run.action.x,run.action.y)&&!E.inOwnBox(s.attack,run.action.x,run.action.y));
  const kicking={...moved,phase:'kick'},delivery=E.legalKicks(kicking).find(k=>k.receiverId===run.action.pieceId&&!k.offside);
  assert.ok(delivery,'the carrier can make the legal onside delivery to this actual runner');
  const received=E.applyKick(kicking,delivery.x,delivery.y,{roll:0});
  assert.equal(received.ball.carrierId,run.action.pieceId);
  assert.ok(receivedShotChance(received)>.5,'the retained run creates an actual high quality receiving shot');
 }
});

test('Tactical receiving opportunities reward usable finishes and discard an offside receiver',()=>{
 const before=fixture(),moved=E.applyMove(before,'white-R1',5,1),after=I.tacticalOutlets(moved,carrier(moved));
 assert.ok(after.best>I.tacticalOutlets(before,carrier(before)).best+.1);
 const offside=clone(moved);Object.assign(offside.pieces.find(p=>p.id==='black-R1'),{x:12,y:3});
 assert.ok(E.legalKicks({...offside,phase:'kick'}).find(k=>k.receiverId==='white-R1')?.offside);
 assert.ok(I.tacticalOutlets(offside,carrier(offside)).best<after.best,'an illegal receiving finish is not counted as an attacking outlet');
});

test('Tactical card evaluation values a removed teammate even when the current carrier is unchanged',()=>{
 const s=fixture(),removed=clone(s),piece=removed.pieces.find(p=>p.id==='white-B2');
 removed.pieces=removed.pieces.filter(p=>p.id!==piece.id);removed.sentOff=[{...piece,reason:'red',yellowCards:0}];removed.discipline[piece.id]={yellowCards:0,redCard:true};
 assert.ok(I.tacticalPositionValue(removed,'white')<I.tacticalPositionValue(s,'white')-50,'red-card branches include the persistent loss of a legal teammate');
 const warned=clone(s);warned.discipline['white-B2']={yellowCards:1,redCard:false};
 assert.ok(I.tacticalPositionValue(warned,'white')<I.tacticalPositionValue(s,'white'));
});

test('Tactical uses the ordinary post-pass movement phase instead of a redundant opt-in run phase',()=>{
 const s=fixture();s.phase='keeperRelease';s.releaseReason='backPass';s.ball={x:6,y:16,carrierId:'white-K'};
 const action=E.chooseAIAction(s,{difficulty:'tactical'});
 assert.equal(action.type,'kick');assert.ok(!action.passRun);
 const next=E.applyKick(s,action.x,action.y,{roll:0,passRun:!!action.passRun});
 assert.notEqual(next.phase,'passRun');
 if(next.phase==='attackMove')assert.equal(next.positionBudget.normalUsed,false,'the same regular off-ball run budget remains available');
});

function previousDeferredFinish(){
 const s=E.createGame({seed:1632189751,foulsEnabled:true});
 const positions={'white-K':[6,16],'white-Q':[7,3],'white-R1':[1,6],'white-R2':[3,5],'white-B1':[11,3],'white-B2':[11,12],'white-N1':[2,6],'white-N2':[9,10],'white-P1':[6,3],'white-P2':[7,5],'white-P3':[8,12],'black-K':[7,0],'black-Q':[6,2],'black-R1':[2,12],'black-R2':[8,3],'black-B1':[2,1],'black-B2':[0,4],'black-N1':[10,7],'black-N2':[4,6],'black-P1':[6,5],'black-P2':[5,4],'black-P3':[4,5]};
 for(const p of s.pieces)[p.x,p.y]=positions[p.id];
 Object.assign(s,{phase:'kick',attack:'white',ball:{x:6,y:3,carrierId:'white-P1'},positionBudget:{normalUsed:false,pawnUsed:false,dribbleUsed:false},restart:null,offside:null,pendingShot:null,releaseReason:null,turn:36,ballProgress:{team:'white',anchorY:3,rounds:0,pendingRelease:false,excludeRelease:false}});return s;
}

test('Tactical converts a real 10.9% finish instead of perpetually valuing a backward recycle, either color',()=>{
 // Development game 1632189751, action193. The previous policy controlled
 // possession for 240 actions without a shot, and recycled this very finish.
 for(const s of [previousDeferredFinish(),mirror(previousDeferredFinish())]){
  const before=clone(s),chance=receivedShotChance(s);assert.ok(chance>.10&&chance<.12);
  const report=E.analyzeTacticalAction(s),kick=E.legalKicks(s).find(k=>k.x===report.action.x&&k.y===report.action.y);
  assert.equal(kick?.goal,s.attack,'take the credible finish after the real keeper reply and block risk');
  assert.deepEqual(s,before,'planning does not spend outcomes or edit the live snapshot');
  assert.ok(report.stats.nodes<=1400,'the improvement does not buy a larger search budget');
 }
});

test('Tactical still supplies a better receiving finish instead of shooting every legal opportunity',()=>{
 const s=fixture();Object.assign(s.pieces.find(p=>p.id==='white-Q'),{x:6,y:6});
 Object.assign(s.pieces.find(p=>p.id==='white-R1'),{x:8,y:4});Object.assign(s.pieces.find(p=>p.id==='black-K'),{x:5,y:0});
 s.phase='kick';s.foulsEnabled=true;s.ball={x:6,y:6,carrierId:'white-Q'};s.positionBudget={normalUsed:false,pawnUsed:false,dribbleUsed:false};s.ballProgress.anchorY=6;
 const shotChance=receivedShotChance(s);assert.ok(shotChance>0,'a real shot is available now');
 const action=E.chooseAIAction(s,{difficulty:'tactical'}),kick=E.legalKicks(s).find(k=>k.x===action.x&&k.y===action.y);
 assert.equal(kick?.receiverId,'white-R1');assert.ok(!kick.goal);
 const received=E.applyKick(s,action.x,action.y,{roll:0});
 assert.ok(receivedShotChance(received)>shotChance+.1,'the chosen accurate pass opens a substantially better actual finish');
});

test('Tactical treats a pending protected corner as owned possession rather than a loose-ball race',()=>{
 const s=fixture();s.phase='cornerSelect';s.restart={type:'corner',team:'white',takerId:null,spot:{x:0,y:0},indirect:false};s.ball={x:0,y:0,carrierId:null};
 const loose={...clone(s),phase:'attackMove',restart:null};
 assert.ok(I.tacticalPositionValue(s,'white')>I.tacticalPositionValue(loose,'white'));
 const closeDefender=clone(s);Object.assign(closeDefender.pieces.find(p=>p.id==='black-R1'),{x:0,y:1});
 assert.equal(I.tacticalPositionValue(closeDefender,'white'),I.tacticalPositionValue(s,'white'),'a nearby opponent cannot collect the protected restart');
 assert.equal(I.tacticalPositionValue(s,'white'),-I.tacticalPositionValue(s,'black'),'the same ownership credit applies to either side');
});
