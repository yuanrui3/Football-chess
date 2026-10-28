import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../dist/engine.js';
import {createExerciseSession,applyExerciseAction,bestKeeperShotChance,completedExerciseRound} from '../dist/exercise-session.js';

const clone=structuredClone;
const other=team=>team==='white'?'black':'white';
const move=(pieceId,x,y,freePawn=false)=>({type:'move',pieceId,x,y,...(freePawn?{freePawn:true}:{})});
const kick=(x,y,disguise=false)=>({type:'kick',x,y,...(disguise?{disguise:true}:{})});
const skip={type:'skip'};
function definition(placements={},options={}) {
  const defaultPieces={'white-K':['K',6,16],'black-K':['K',7,0],'black-R2':['R',13,0],
    'white-Q':['Q',6,1],...placements};
  return {id:options.id||'session-test',title:'Session test',objective:'Find a useful finish.',
    playerTeam:options.playerTeam||'white',side:options.side||'attack',roundLimit:options.roundLimit||3,
    position:{pieces:Object.entries(defaultPieces).map(([id,[type,x,y]])=>({id,type,x,y,team:id.split('-')[0]})),
      carrierId:options.carrier||'white-Q',phase:options.phase||'kick',attack:options.attack||'white',
      ...(options.budget?{positionBudget:options.budget}:{}),...(options.shot?{shot:options.shot}:{})},
    goal:options.goal||{type:'finish',minShotXG:.35}};
}
function start(placements,options){const session=createExerciseSession(definition(placements,options),{seed:991});
  assert.ok(session.game.pieces.every(piece=>E.canOccupySquare(piece,piece.x,piece.y)));
  assert.equal(new Set(session.game.pieces.map(piece=>piece.x+','+piece.y)).size,session.game.pieces.length);
  return session;}
function apply(session,action,overrides) {
  const before=clone(session),next=applyExerciseAction(session,action,overrides);
  assert.deepEqual(session,before,'exercise transitions preserve the previous position, grading state and RNG');
  return next;
}
function toKick(session) {
  for(let n=0;session.status==='active'&&session.game.phase!=='kick'&&n<6;n++)session=apply(session,skip);
  assert.equal(session.game.phase,'kick');return session;
}
function shoot(session,action=kick(6,-1)) {return apply(session,action);}
function resolve(session,{x,y,roll=0,targetRoll}={}) {
  return apply(session,x===undefined?skip:move(session.game.pieces.find(p=>p.type==='K'&&p.team===E.currentTeam(session.game)).id,x,y),{roll,targetRoll});
}

test('creation preserves definitions, accepts a stable seed and validates short objectives',()=>{
  const d=definition(),before=clone(d),a=createExerciseSession(d,{seed:73}),b=createExerciseSession(d,{seed:73});
  assert.deepEqual(a,b);assert.deepEqual(d,before);assert.equal(a.status,'active');assert.equal(a.roundsUsed,0);
  assert.equal(a.roundLimit,3);assert.equal(a.playerTeam,'white');
  assert.throws(()=>createExerciseSession({...d,roundLimit:5}),/three or four/);
  assert.throws(()=>createExerciseSession({...d,playerTeam:'purple'}),/valid player team/);
  assert.throws(()=>createExerciseSession({...d,goal:{type:'finish',minShotXG:1.2}}),/probabilities/);
  assert.throws(()=>createExerciseSession({...d,goal:{type:'finish',requires:'self-pass'}}),/objective/);
});

test('worst-keeper preview considers holding and every native reaction without touching future outcomes',()=>{
  const session=start(),pending=E.applyKick(session.game,6,-1),before=clone(pending);
  const expected=Math.min(E.shotModel(pending).probability,...E.legalMoves(pending,'black-K').map(m=>E.shotModel(pending,6,-1,m).probability));
  assert.equal(bestKeeperShotChance(pending),expected);
  assert.equal(bestKeeperShotChance({...pending,randomState:123456}),expected);
  assert.deepEqual(pending,before);assert.equal(bestKeeperShotChance(session.game),0);
  assert.ok(expected<E.shotModel(pending).probability,'holding the displaced keeper overstates this chance');
});

test('a strong chance succeeds after a goal or a miss; the declaration waits for the Tactical keeper',()=>{
  const pending=shoot(start()),before=clone(pending);
  assert.equal(pending.status,'active');assert.ok(pending.pendingAssessment);assert.equal(pending.roundsUsed,0);
  const goal=resolve(pending,{x:6,y:0,roll:0}),miss=resolve(pending,{x:6,y:0,roll:.9999});
  assert.equal(goal.game.lastAction.type,'goal');assert.notEqual(miss.game.lastAction.type,'goal');
  assert.equal(goal.status,'solved');assert.equal(miss.status,'solved');assert.equal(goal.roundsUsed,1);
  assert.equal(goal.metrics.lastShotXG,miss.metrics.lastShotXG);assert.ok(goal.reviewGame);
  assert.equal(goal.reviewGame.pieces.find(p=>p.id==='black-K').x,6);
  assert.deepEqual(pending,before);assert.match(goal.feedback,/best legal response/);
});

test('a lucky poor shot fails and a poor keeper response cannot inflate the attacking grade',()=>{
  const pending=shoot(start({'white-Q':['Q',6,6]}));
  const goal=resolve(pending,{roll:0});assert.equal(goal.game.lastAction.type,'goal');
  assert.equal(goal.status,'failed');assert.equal(goal.reason,'weak-finish');assert.ok(goal.metrics.lastShotXG<.1);
  assert.ok(goal.metrics.shotResult.actualReplyXG>goal.metrics.shotResult.bestReplyXG);
});

test('different sufficiently strong aims solve the same position instead of requiring one move string',()=>{
  const session=start();
  const g=resolve(shoot(session,kick(6,-1)),{roll:.9}),i=resolve(shoot(session,kick(8,-1)),{roll:.9});
  assert.equal(g.status,'solved');assert.equal(i.status,'solved');
  assert.notEqual(g.metrics.lastShotXG,i.metrics.lastShotXG);
});

test('disguised shots are judged by the two-target expectation, not the favourable sampled target',()=>{
  const session=start({'white-Q':['Q',5,1]},{goal:{type:'finish',minShotXG:.5}});
  const pending=shoot(session,kick(5,-1,true));assert.equal(pending.game.pendingShot.disguised,true);
  const left=resolve(pending,{roll:.99,targetRoll:0}),right=resolve(pending,{roll:.99,targetRoll:.99});
  assert.equal(left.status,'solved');assert.equal(right.status,'solved');
  assert.equal(left.metrics.lastShotXG,right.metrics.lastShotXG);
  assert.equal(left.metrics.shotResult.actualReplyXG,right.metrics.shotResult.actualReplyXG);
  assert.notEqual(left.game.lastAction.goalTarget.x,right.game.lastAction.goalTarget.x);
});

test('an otherwise strong shot does not bypass the through-ball prerequisite',()=>{
  const pending=shoot(start({}, {goal:{type:'finish',minShotXG:.35,requires:'through-ball'}}));
  const result=resolve(pending,{roll:0});assert.equal(result.status,'failed');
  assert.equal(result.reason,'missing-theme');assert.match(result.feedback,/onside teammate/);
});

function throughPosition() {return start({'white-Q':['B',3,7],'white-N1':['N',5,4],
  'black-R2':['R',8,4]}, {goal:{type:'finish',minShotXG:.3,requires:'through-ball'}});}
test('an onside teammate collecting a genuine forward line-breaking space pass satisfies the theme',()=>{
  let session=throughPosition();
  session=apply(session,kick(7,3));assert.equal(session.roundsUsed,1);assert.equal(session.progress.throughBall,false);
  assert.equal(session.loosePass.throughCandidate,true);
  session=apply(session,move('white-N1',7,3));assert.equal(session.progress.throughBall,true);
  assert.equal(session.roundsUsed,1);assert.match(session.feedback,/onside teammate collected/);
  assert.equal(session.progress.completedPasses,1);
});

test('self-chasing, a non-line-breaking forward pass and a backward space pass do not satisfy through-ball',()=>{
  let self=throughPosition();self=apply(self,kick(7,3));self=apply(self,move('white-Q',7,3));
  assert.equal(self.progress.throughBall,false);assert.equal(self.game.lastAction.selfPassCollection,true);
  let simple=start({'white-Q':['Q',6,7],'white-R1':['R',6,3]}, {goal:{type:'finish',requires:'through-ball',minShotXG:.3}});
  simple=apply(simple,kick(6,5));simple=apply(simple,move('white-R1',6,5));
  assert.equal(simple.progress.throughBall,false);
  let back=start({'white-Q':['Q',6,7],'white-R1':['R',6,11]}, {goal:{type:'finish',requires:'through-ball',minShotXG:.3}});
  back=apply(back,kick(6,9));back=apply(back,move('white-R1',6,9));assert.equal(back.progress.throughBall,false);
});

test('an offside receiver cannot gain the through-ball badge',()=>{
  let session=start({'white-Q':['B',3,7],'white-N1':['N',7,3],'black-R2':['R',8,4]},
    {goal:{type:'finish',requires:'through-ball',minShotXG:.3}});
  session=apply(session,kick(7,3));assert.equal(session.status,'failed');
  assert.equal(session.game.lastAction.type,'offside');assert.equal(session.progress.throughBall,false);
});

test('a completed pass into the opposing box qualifies; an own-box pass does not',()=>{
  let forward=start({'white-Q':['R',1,2],'white-N1':['N',6,2]},
    {goal:{type:'finish',requires:'box-entry',boxEntryMode:'pass',minShotXG:.3}});
  forward=apply(forward,kick(6,2));assert.equal(forward.progress.boxEntry,true);
  let back=start({'white-Q':['R',1,14],'white-N1':['N',6,14]},
    {goal:{type:'finish',requires:'box-entry',boxEntryMode:'pass',minShotXG:.3}});
  back=apply(back,kick(6,14));assert.equal(back.progress.boxEntry,false);
});

test('teammate collection inside the opposing box counts as box delivery, unlike a self-pass',()=>{
  let session=start({'white-Q':['Q',6,4],'white-N1':['N',4,3]},
    {goal:{type:'finish',requires:'box-entry',boxEntryMode:'pass',minShotXG:.3}});
  session=apply(session,kick(6,2));session=apply(session,move('white-N1',6,2));
  assert.equal(session.progress.boxEntry,true);assert.equal(session.progress.throughBall,false);
  let own=start({'white-Q':['Q',6,4]},
    {goal:{type:'finish',requires:'box-entry',boxEntryMode:'pass',minShotXG:.3}});
  own=apply(own,kick(6,2));assert.throws(()=>apply(own,move('white-Q',6,2)),/legal move/);
  assert.equal(own.progress.boxEntry,false);
});

test('ordinary dribbling into the box meets an either-entry objective but not a pass-only objective',()=>{
  for(const mode of ['pass','either']) {
    let session=start({'white-Q':['Q',6,4]}, {phase:'attackMove',goal:{type:'finish',requires:'box-entry',boxEntryMode:mode,minShotXG:.3}});
    session=apply(session,move('white-Q',6,2));assert.equal(session.progress.boxEntry,mode==='either');
    assert.equal(session.roundsUsed,0);
  }
});

test('dribble, teammate move and shared bonus are subactions, not three rounds',()=>{
  let session=start({'white-Q':['Q',6,7],'white-R1':['R',4,7],'white-P1':['P',9,10]}, {phase:'attackMove'});
  session=apply(session,move('white-Q',6,6));session=apply(session,move('white-R1',4,6));
  session=apply(session,move('white-P1',8,10,true));
  assert.equal(session.game.phase,'defendMove');assert.equal(session.roundsUsed,0);assert.equal(session.status,'active');
});

test('three completed possession rounds exhaust a three-round exercise, without charging defensive skips',()=>{
  let session=start({'white-Q':['Q',6,7],'white-R1':['R',6,5],'white-R2':['R',8,5],'white-B1':['B',8,7]});
  session=apply(session,kick(6,5));assert.equal(session.roundsUsed,1);
  session=toKick(session);assert.equal(session.roundsUsed,1);session=apply(session,kick(8,5));
  assert.equal(session.roundsUsed,2);session=toKick(session);session=apply(session,kick(8,7));
  assert.equal(session.roundsUsed,3);assert.equal(session.status,'failed');assert.equal(session.reason,'round-limit');
});

test('a teammate pass to the keeper and its compulsory release complete one round',()=>{
  let session=start({'white-Q':['Q',6,7],'white-R1':['R',1,11]});
  session=apply(session,kick(6,16));assert.equal(session.game.phase,'keeperRelease');assert.equal(session.roundsUsed,0);
  session=apply(session,kick(1,11));assert.equal(session.roundsUsed,1);assert.equal(session.status,'active');
});

test('collecting a previously counted loose teammate pass with the keeper does not charge another round',()=>{
  let session=start({'white-K':['K',6,15],'white-Q':['Q',6,7]});
  session=apply(session,kick(6,14));assert.equal(session.roundsUsed,1);
  session=apply(session,move('white-K',6,14,true));assert.equal(session.game.phase,'keeperRelease');
  session=apply(session,kick(6,7));assert.equal(session.roundsUsed,1);
});

function defendShot(goal={type:'defend',maxOpponentShotXG:.4}) {
  return start({'white-K':['K',6,16],'white-Q':['Q',0,12],'white-R1':['R',0,16],
    'black-Q':['Q',7,15]}, {side:'defence',phase:'keeperReact',carrier:'black-Q',attack:'black',
      shot:{x:7,y:17},goal});
}
test('defending grades the actual keeper response and accepts sound defence even when the shot goes in',()=>{
  const session=defendShot(),good=resolve(session,{x:7,y:16,roll:0});
  assert.equal(good.game.lastAction.type,'goal');assert.equal(good.status,'solved');
  assert.ok(good.metrics.lastOpponentShotXG<=.4);
  const bad=resolve(session,{roll:.99999});assert.notEqual(bad.game.lastAction.type,'goal');
  assert.equal(bad.status,'failed');assert.ok(bad.metrics.lastOpponentShotXG>.4);
});

test('a clean possession win completes defence before a finish; a failed knight tackle does not',()=>{
  let session=start({'white-Q':['Q',0,10],'white-P1':['P',5,5],'black-Q':['Q',6,4]},
    {side:'defence',phase:'defendMove',attack:'black',carrier:'black-Q',goal:{type:'defend',maxOpponentShotXG:.15}});
  session=apply(session,move('white-P1',6,3));assert.equal(session.status,'solved');assert.equal(session.reason,'possession-won');
  let knight=start({'white-Q':['Q',0,10],'white-P1':['P',5,5],'black-N1':['N',6,4]},
    {side:'defence',phase:'defendMove',attack:'black',carrier:'black-N1',goal:{type:'defend',maxOpponentShotXG:.15}});
  knight=apply(knight,move('white-P1',6,3),{roll:.99});assert.equal(knight.game.lastAction.type,'tackleMiss');
  assert.equal(knight.status,'active');
});

test('innocuous movement never solves defence, while possession lost by the attacker ends its attempt',()=>{
  let defence=start({'white-Q':['Q',0,10],'white-P1':['P',5,5],'black-Q':['Q',6,4]},
    {side:'defence',phase:'defendMove',attack:'black',carrier:'black-Q',goal:{type:'defend',maxOpponentShotXG:.15}});
  defence=apply(defence,move('white-Q',0,11));assert.equal(defence.status,'active');
  let attack=start({'white-Q':['Q',6,4],'black-P1':['P',5,5]}, {phase:'defendMove'});
  attack=apply(attack,move('black-P1',6,3));assert.equal(attack.status,'failed');assert.equal(attack.reason,'possession-lost');
});

test('illegal actions throw without mutation and late bot actions cannot change a terminal result',()=>{
  const session=start(),before=clone(session);assert.throws(()=>applyExerciseAction(session,move('black-K',1,10)),/legal move/);
  assert.throws(()=>applyExerciseAction(session,{type:'dance'}),/Unknown/);assert.deepEqual(session,before);
  const solved=resolve(shoot(session),{roll:.99}),done=clone(solved);
  assert.deepEqual(applyExerciseAction(solved,{type:'skip'}),done);assert.deepEqual(solved,done);
});

test('a qualifying finish resolves on the final allowed round before the deadline is judged',()=>{
  let session=start({'white-Q':['Q',6,7],'white-R1':['R',6,5],'white-N1':['N',6,1]});
  session=apply(session,kick(6,5));session=toKick(session);session=apply(session,kick(6,1));
  assert.equal(session.roundsUsed,2);session=toKick(session);session=shoot(session,kick(5,-1));
  assert.equal(session.status,'active');assert.equal(session.roundsUsed,2);
  session=resolve(session,{roll:.99});assert.equal(session.roundsUsed,3);assert.equal(session.status,'solved');
});

test('pass-and-run uses the next off-ball action without spending a second round',()=>{
  let session=start({'white-Q':['Q',6,7],'white-R1':['R',6,5]});
  session=apply(session,{...kick(6,5),passRun:true});assert.equal(session.game.phase,'passRun');assert.equal(session.roundsUsed,1);
  session=apply(session,move('white-Q',5,6));assert.equal(session.game.phase,'attackMove');
  assert.equal(session.game.positionBudget.normalUsed,true);assert.equal(session.roundsUsed,1);
});

test('a themed exercise starting with a committed shot cannot invent prerequisite evidence',()=>{
  const session=start({}, {phase:'keeperReact',shot:{x:6,y:-1},
    goal:{type:'finish',minShotXG:.35,requires:'box-entry'}});
  assert.equal(session.pendingAssessment.prerequisiteMet,false);
  const result=resolve(session,{roll:0});assert.equal(result.status,'failed');assert.equal(result.reason,'missing-theme');
});

test('a legal on-restart teammate collection retains the native direct-receipt offside exemption',()=>{
  let session=start({'white-Q':['Q',4,4],'white-N1':['N',4,3],'black-R2':['R',9,4]},
    {goal:{type:'finish',requires:'box-entry',boxEntryMode:'pass',minShotXG:.3}});
  assert.ok(E.offsideInfo(session.game,'white').flaggedIds.includes('white-N1'));
  session.game.restart={type:'throwIn',team:'white',takerId:'white-Q',spot:{x:4,y:4},indirect:false};
  session=apply(session,kick(6,2));session=apply(session,move('white-N1',6,2));
  assert.equal(session.progress.boxEntry,true);assert.equal(session.game.lastAction.type,'move');
});

test('combination objectives default to zero passes and reject invalid pass counts',()=>{
  const d=definition();
  assert.equal(createExerciseSession(d).definition.goal.minCompletedPasses,0);
  for(const minCompletedPasses of [-1,1.5,4,'2',NaN,Infinity])
    assert.throws(()=>createExerciseSession({...d,goal:{...d.goal,minCompletedPasses}}),/zero and three/);
  for(const minCompletedPasses of [0,1,2,3])
    assert.equal(createExerciseSession({...d,goal:{...d.goal,minCompletedPasses}}).definition.goal.minCompletedPasses,minCompletedPasses);
});

test('two genuine teammate passes qualify a combination before its finishing shot',()=>{
  let session=start({'white-Q':['Q',6,7],'white-R1':['R',6,5],'white-N1':['N',6,1]},
    {goal:{type:'finish',minShotXG:.35,minCompletedPasses:2}});
  session=apply(session,kick(6,5));assert.equal(session.progress.completedPasses,1);
  session=toKick(session);session=apply(session,kick(6,1));assert.equal(session.progress.completedPasses,2);
  session=toKick(session);session=shoot(session,kick(5,-1));
  assert.equal(session.pendingAssessment.completedPasses,2);
  assert.equal(session.pendingAssessment.prerequisiteMet,true);
  session=resolve(session,{roll:.9999});assert.equal(session.status,'solved');
  assert.equal(session.roundsUsed,3);
});

test('a lucky direct goal cannot skip a pass combination and receives specific feedback',()=>{
  let session=start({}, {goal:{type:'finish',minShotXG:.35,minCompletedPasses:2}});
  session=shoot(session);const pending=clone(session);
  session=resolve(session,{roll:0});
  assert.equal(session.game.lastAction.type,'goal');assert.equal(session.status,'failed');
  assert.equal(session.reason,'missing-theme');assert.match(session.feedback,/at least 2 teammate passes/);
  assert.match(session.feedback,/0 completed/);assert.doesNotMatch(session.feedback,/opposing box/);
  assert.equal(pending.pendingAssessment.prerequisiteMet,false);
});

test('self-pass collections and direct keeper receipts do not inflate combination progress',()=>{
  let self=throughPosition();self=apply(self,kick(7,3));self=apply(self,move('white-Q',7,3));
  assert.equal(self.game.lastAction.selfPassCollection,true);assert.equal(self.progress.completedPasses,0);
  let keeper=start({'white-Q':['Q',6,7],'white-R1':['R',1,11]},
    {goal:{type:'finish',minShotXG:.35,minCompletedPasses:2}});
  keeper=apply(keeper,kick(6,16));assert.equal(keeper.game.phase,'keeperRelease');
  assert.equal(keeper.progress.completedPasses,0);
  keeper=apply(keeper,kick(1,11));assert.equal(keeper.progress.completedPasses,1,
    'the keeper release is one outfield delivery, not a two-pass combination');
});

function combinedThroughPosition() {
  return start({'white-Q':['B',3,7],'white-N1':['N',5,4],'white-Q2':['Q',5,2],
    'black-R2':['R',8,4],'black-R1':['R',12,1]},
  {goal:{type:'finish',minShotXG:.1,requires:'through-ball',minCompletedPasses:2},roundLimit:4});
}
test('a through-ball collection and a second teammate pass jointly satisfy both prerequisites',()=>{
  let session=combinedThroughPosition();
  session=apply(session,kick(7,3));session=apply(session,move('white-N1',7,3));
  assert.equal(session.progress.throughBall,true);assert.equal(session.progress.completedPasses,1);
  session=toKick(session);session=apply(session,kick(5,2));
  assert.equal(session.progress.completedPasses,2);
  session=toKick(session);session=shoot(session,kick(8,-1));
  assert.equal(session.pendingAssessment.prerequisiteMet,true);
  session=resolve(session,{roll:.9999});assert.equal(session.status,'solved');
});

test('the through-ball badge alone cannot substitute for the required second pass',()=>{
  let session=combinedThroughPosition();
  session=apply(session,kick(7,3));session=apply(session,move('white-N1',7,3));
  session=apply(session,move('white-N1',8,1));session=toKick(session);session=shoot(session,kick(7,-1));
  assert.equal(session.pendingAssessment.throughBall,true);
  assert.equal(session.pendingAssessment.completedPasses,1);
  assert.equal(session.pendingAssessment.prerequisiteMet,false);
  session=resolve(session,{roll:0});assert.equal(session.status,'failed');
  assert.match(session.feedback,/at least 2 teammate passes/);
  assert.doesNotMatch(session.feedback,/First play a forward ball/);
});

test('two direct passes do not substitute for a required through ball',()=>{
  let session=start({'white-Q':['Q',6,7],'white-R1':['R',6,5],'white-N1':['N',6,1]},
    {goal:{type:'finish',minShotXG:.35,minCompletedPasses:2,requires:'through-ball'}});
  session=apply(session,kick(6,5));session=toKick(session);session=apply(session,kick(6,1));
  session=toKick(session);session=shoot(session,kick(5,-1));
  assert.equal(session.pendingAssessment.completedPasses,2);assert.equal(session.pendingAssessment.prerequisiteMet,false);
  session=resolve(session,{roll:0});assert.equal(session.status,'failed');
  assert.match(session.feedback,/onside teammate/);assert.doesNotMatch(session.feedback,/at least 2 teammate passes/);
});

test('combination evidence and feedback are fixed when the shot is committed',()=>{
  const pending=shoot(start({}, {goal:{type:'finish',minShotXG:.35,minCompletedPasses:2}}));
  const altered=clone(pending);altered.progress.completedPasses=2;
  const result=resolve(altered,{roll:0});
  assert.equal(result.status,'failed');assert.match(result.feedback,/0 completed/);
  assert.equal(pending.progress.completedPasses,0);
});

test('a three-pass build-up still leaves its shot on the fourth allowed possession round',()=>{
  let session=start({'white-Q':['Q',6,7],'white-R1':['R',6,5],
    'white-R2':['R',8,5],'white-N1':['N',8,1]},
  {roundLimit:4,goal:{type:'finish',minShotXG:.2,minCompletedPasses:3}});
  for(const [x,y]of [[6,5],[8,5],[8,1]]) {
    session=apply(session,kick(x,y));session=toKick(session);
  }
  assert.equal(session.roundsUsed,3);assert.equal(session.progress.completedPasses,3);
  session=shoot(session,kick(7,-1));assert.equal(session.status,'active');
  session=resolve(session,{roll:.9999});assert.equal(session.status,'solved');
  assert.equal(session.roundsUsed,4);
});
