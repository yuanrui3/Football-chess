import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../dist/engine.js';

const clone=structuredClone, other=t=>t==='white'?'black':'white';
const id=(v,t)=>t==='white'?v:v.replace(/^(white|black)/,other);
const point=([x,y],t)=>t==='white'?{x,y}:{x:E.BOARD_WIDTH-1-x,y:E.BOARD_HEIGHT-1-y};
// Exact full-roster position before Tactical seed902774113/White step120.
// B1 deliberately kicks toward its own goal; K's natural next roll catches it.
function recordedPosition(team='white',{rounds=2,phase='kick',restart=false}={}){
 const s=E.createGame({mode:'local',seed:902774113}),locations={
  'white-K':[6,16],'white-Q':[4,8],'white-R1':[1,8],'white-R2':[8,8],
  'white-B1':[0,12],'white-B2':[5,12],'white-N1':[2,7],'white-N2':[10,12],
  'white-P1':[4,11],'white-P2':[9,9],'white-P3':[7,9],
  'black-K':[7,0],'black-Q':[3,9],'black-R1':[7,3],'black-R2':[1,6],
  'black-B1':[8,7],'black-B2':[9,11],'black-N1':[10,13],'black-N2':[13,7],
  'black-P1':[7,2],'black-P2':[6,9],'black-P3':[4,6],
 };
 for(const p of s.pieces){const location=point(locations[p.id],team);p.id=id(p.id,team);if(team==='black')p.team=other(p.team);Object.assign(p,location);assert.ok(E.canOccupySquare(p,p.x,p.y));}
 s.attack=team;s.phase=phase;s.turn=24;s.randomState=3666636444;
 s.ball={...point([0,12],team),carrierId:id('white-B1',team)};
 s.ballProgress={team,anchorY:point([0,10],team).y,rounds,pendingRelease:false,excludeRelease:false};
 if(restart)s.restart={type:'corner',team,takerId:s.ball.carrierId,spot:{x:s.ball.x,y:s.ball.y},indirect:false};
 return s;
}
function declare(s,team){const aim=point([5,E.BOARD_HEIGHT],team);assert.ok(E.legalKicks(s).some(k=>k.x===aim.x&&k.y===aim.y));return E.applyKick(s,aim.x,aim.y);}
function naturalCatch(pending,team){const move=point([5,16],team);assert.ok(E.legalMoves(pending,id('white-K',team)).some(m=>m.x===move.x&&m.y===move.y));return E.applyMove(pending,id('white-K',team),move.x,move.y);}
function release(s,team){const receiver=point([5,12],team);assert.ok(E.legalKicks(s).some(k=>k.x===receiver.x&&k.y===receiver.y));return E.applyKick(s,receiver.x,receiver.y,{roll:0});}

for(const team of ['white','black']){
 test(`${team}: a real seeded teammate backward-shot catch forces immediate release and preserves the original progress window`,()=>{
  for(const rounds of [0,1,2]){
   const source=recordedPosition(team,{rounds}),pending=declare(source,team),before=clone(pending),caught=naturalCatch(pending,team);
   assert.equal(caught.lastAction.type,'save');assert.equal(caught.lastAction.outcome,'saved');assert.equal(caught.lastAction.backPass,true);
   assert.equal(caught.phase,'keeperRelease');assert.equal(caught.releaseReason,'backPass');assert.equal(caught.ball.carrierId,id('white-K',team));
   assert.equal(caught.restart,null);assert.deepEqual(caught.score,source.score);assert.deepEqual(pending,before);
   assert.equal(caught.ballProgress.rounds,rounds);assert.equal(caught.ballProgress.anchorY,source.ballProgress.anchorY);
   assert.equal(caught.ballProgress.pendingRelease,true);assert.equal(caught.ballProgress.excludeRelease,false);
   assert.equal(caught.ballProgress.releaseAlreadyCounted,undefined,'the original shot round has not ended at this catch');
   assert.equal(caught.randomState,(Math.imul(1664525,pending.randomState)+1013904223)>>>0);
   assert.ok(Math.abs(caught.lastAction.roll-.08933599549345672)<1e-12);
   assert.ok(Math.abs(caught.lastAction.shotModel.goalProbability-.014439705259851115*E.SHOT_MODEL.finishingAccuracyMultiplier)<1e-12,'keeper odds are unchanged by the release rule');
   assert.deepEqual(E.legalMoves(caught,id('white-K',team)),[]);assert.deepEqual(E.legalMoves(caught,id('white-K',team),{freePawn:true}),[]);
   assert.throws(()=>E.skipMove(caught));
   const saved=clone(caught),restored=E.normalizeGame(caught);assert.deepEqual(restored,caught);assert.deepEqual(caught,saved);
   const result=release(restored,team);
   if(rounds===2){
    assert.equal(result.lastAction.type,'stalling');assert.equal(result.restart.team,other(team));assert.equal(result.lastAction.triggeringAction.type,'kick','the deferred round ends at distribution, not the catch');
   }else{
    assert.equal(result.restart,null);assert.equal(result.ball.carrierId,id('white-B2',team));assert.equal(result.ballProgress.rounds,rounds+1);
    assert.equal(result.ballProgress.anchorY,source.ballProgress.anchorY);assert.equal(result.ballProgress.pendingRelease,false);
   }
   assert.deepEqual(release(E.normalizeGame(clone(caught)),team),result,'reload/Undo produces the same release, outcome and random state');
  }
 });

 test(`${team}: kickoff and restart exclusions survive the caught backward shot and its compulsory release`,()=>{
  for(const options of [{phase:'kickoff'},{restart:true}]){
   const pending=declare(recordedPosition(team,options),team);assert.equal(pending.ballProgress.excludeRelease,true);
   const caught=naturalCatch(pending,team);assert.equal(caught.phase,'keeperRelease');assert.equal(caught.ballProgress.pendingRelease,true);assert.equal(caught.ballProgress.excludeRelease,true);
   const next=release(E.normalizeGame(clone(caught)),team);assert.equal(next.restart,null);assert.equal(next.ballProgress.rounds,0);assert.equal(next.ballProgress.pendingRelease,false);assert.equal(next.ballProgress.excludeRelease,false);
  }
 });

 test(`${team}: both AI levels distribute immediately after this catch without peeking at or consuming the future seed`,()=>{
  const caught=naturalCatch(declare(recordedPosition(team,{rounds:1}),team),team),before=clone(caught);
  for(const difficulty of ['casual','tactical']){
   const action=E.chooseAIAction(caught,{difficulty});assert.equal(action.type,'kick');assert.ok(E.legalKicks(caught).some(k=>k.x===action.x&&k.y===action.y));
   assert.deepEqual(E.chooseAIAction({...caught,randomState:0},{difficulty}),action);assert.deepEqual(caught,before);
  }
 });
}

test('a king catching its own attempted own goal keeps the existing self-kick accounting',()=>{
 const s=recordedPosition('white',{rounds:0}),king=s.pieces.find(p=>p.id==='white-K');s.ball={x:king.x,y:king.y,carrierId:king.id};
 const pending=E.applyKick(s,king.x,E.BOARD_HEIGHT),m=E.shotModel(pending);assert.ok(m.caughtSaveProbability>0);
 const caught=E.skipMove(pending,{roll:m.goalProbability+m.keeperCornerProbability+m.caughtSaveProbability/2});
 assert.equal(caught.lastAction.type,'save');assert.equal(caught.phase,'attackMove');assert.equal(caught.releaseReason,null);assert.equal(caught.lastAction.backPass,undefined);assert.equal(caught.ballProgress.rounds,1);
});
