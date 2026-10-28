import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../dist/engine.js';
import {TOUGH_ATTACK_EXERCISES} from '../dist/exercise-tough-attack.js';
import {createExercisePosition} from '../dist/exercise-positions.js';
import {createExerciseSession,applyExerciseAction,bestKeeperShotChance} from '../dist/exercise-session.js';
import {chooseExerciseAction} from '../dist/exercise-ai.js';

const byId=id=>TOUGH_ATTACK_EXERCISES.find(d=>d.id===id);
function replay(definition,actions=definition.exampleActions,seed=1984){
  let session=createExerciseSession(definition,{seed});const pendingShots=[];
  const respond=()=>{for(let i=0;session.status==='active'&&E.currentTeam(session.game)!==session.playerTeam;i++){
    assert.ok(i<14,'the study opponent returns control');
    if(session.game.phase==='keeperReact')pendingShots.push(session);
    session=applyExerciseAction(session,chooseExerciseAction(session.game));
  }};
  for(const action of actions){respond();assert.equal(session.status,'active',`${definition.id}: every teaching action is actually played`);session=applyExerciseAction(session,action);}
  respond();return {session,pendingShots};
}

test('six Tough attacks use real larger squads and outcome-only objectives',()=>{
  assert.equal(TOUGH_ATTACK_EXERCISES.length,6);assert.equal(new Set(TOUGH_ATTACK_EXERCISES.map(d=>d.id)).size,6);
  for(const d of TOUGH_ATTACK_EXERCISES){
    assert.equal(d.difficulty,'tough');assert.equal(d.side,'attack');assert.ok([3,4].includes(d.planSteps));
    assert.equal(d.exampleActions.filter(a=>a.type!=='skip').length,d.planSteps);
    assert.equal(d.goal.requires,undefined);assert.equal(d.goal.minCompletedPasses,undefined);
    assert.equal(d.hints.length,3);assert.ok(d.objective&&d.coachNote);
    const game=createExercisePosition(d);assert.ok(game.pieces.length>=14&&game.pieces.length<=18);
    assert.equal(new Set(game.pieces.map(p=>p.id)).size,game.pieces.length);
    assert.equal(new Set(game.pieces.map(p=>`${p.x},${p.y}`)).size,game.pieces.length);
    for(const p of game.pieces)assert.ok(E.canOccupySquare(p,p.x,p.y),`${d.id}: ${p.id} legal occupancy`);
    for(const team of ['white','black'])for(const [type,max] of Object.entries({K:1,Q:1,R:2,B:2,N:2,P:3}))
      assert.ok(game.pieces.filter(p=>p.team===team&&p.type===type).length<=max);
    assert.equal(game.foulsEnabled,false);
  }
});

for(const d of TOUGH_ATTACK_EXERCISES)test(`${d.id}: teaching route survives the actual expanded study policy`,()=>{
  // Seeds check chance-state independence only. Distinct plans and defensive
  // responses below, rather than seeds alone, provide adversarial coverage.
  for(const seed of [1984,7,98765]){
    const {session}=replay(d,d.exampleActions,seed);
    assert.equal(session.status,'solved',`${d.id}: ${session.feedback}`);
    assert.ok(session.roundsUsed<=d.roundLimit);
    assert.ok(session.metrics.lastShotXG+1e-9>=d.goal.minShotXG);
    assert.ok(Math.abs(session.metrics.shotResult.actualReplyXG-session.metrics.shotResult.bestReplyXG)<1e-9,
      'the actual study keeper takes a strongest immediate response');
  }
});

test('initial positions do not hand out an immediate qualifying shot after removing all route gates',()=>{
  for(const d of TOUGH_ATTACK_EXERCISES){
    const game={...createExercisePosition(d),phase:'kick'};
    for(const target of E.legalKicks(game).filter(k=>k.goal==='white'&&!k.offside)){
      const pending=E.applyKick(game,target.x,target.y);
      assert.ok(bestKeeperShotChance(pending)<d.goal.minShotXG,d.id);
    }
  }
});

test('the formerly rejected one-pass and zero-pass solutions earn outcome credit',()=>{
  for(const [id,passes]of [['tough-wide-rook-relay',1],['tough-knight-wall-pass',1],['tough-clear-offside-runner',0]]){
    const d=byId(id),{session}=replay(d);
    assert.equal(session.status,'solved');assert.equal(session.progress.completedPasses,passes);
    assert.equal(session.progress.boxEntry,false,'a recorded teammate box receipt is not required');
  }
});

test('three distinct alternative player plans are accepted against the study opponent',()=>{
  const alternatives=[
    ['tough-knight-wall-pass',[{type:'kick',x:3,y:2},{type:'move',pieceId:'white-Q',x:6,y:1},{type:'move',pieceId:'white-N1',x:5,y:1},{type:'skip'},{type:'kick',x:6,y:-1}]],
    ['tough-knight-wall-pass',[{type:'kick',x:3,y:2},{type:'move',pieceId:'white-Q',x:4,y:2},{type:'move',pieceId:'white-N1',x:5,y:1},{type:'skip'},{type:'kick',x:6,y:-1}]],
    ['tough-clear-offside-runner',[{type:'move',pieceId:'white-N1',x:3,y:0},{type:'move',pieceId:'white-R1',x:6,y:3},{type:'skip'},{type:'kick',x:6,y:-1}]],
  ];
  for(const[id,actions]of alternatives)for(const seed of [1984,7,98765]){
    const {session}=replay(byId(id),actions,seed);assert.equal(session.status,'solved',`${id}: ${session.feedback}`);
  }
});

test('different legal keeper replies cannot turn a sound alternative into a wrong-route failure',()=>{
  for(const id of ['tough-wide-rook-relay','tough-knight-wall-pass']){
    const {pendingShots}=replay(byId(id)),pending=pendingShots.at(-1),game=pending.game;
    const keeper=game.pieces.find(p=>p.type==='K'&&p.team===E.currentTeam(game));
    const replies=[{type:'skip'},...E.legalMoves(game,keeper.id).map(m=>({type:'move',pieceId:keeper.id,x:m.x,y:m.y}))];
    assert.ok(replies.length>=3);
    for(const action of replies){const result=applyExerciseAction(pending,action);assert.equal(result.status,'solved');assert.equal(result.reason,'strong-finish');}
  }
});

test('omitting useful preparation fails for a real defensive reason, not a route quota',()=>{
  const wide=byId('tough-wide-rook-relay');
  const line=[{type:'kick',x:1,y:3},{type:'move',pieceId:'white-R2',x:6,y:3},{type:'skip'},{type:'kick',x:6,y:-1}];
  const {session}=replay(wide,line);assert.equal(session.status,'failed');assert.equal(session.reason,'weak-finish');
  assert.ok(session.metrics.lastShotXG<wide.goal.minShotXG);
  const offside=byId('tough-clear-offside-runner');
  const result=replay(offside,offside.exampleActions.slice(1)).session;
  assert.equal(result.status,'failed');assert.equal(result.reason,'possession-lost');
});
