import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../dist/engine.js';
import {TOUGH_ATTACK_EXERCISES} from '../dist/exercise-tough-attack.js';
import {createExercisePosition} from '../dist/exercise-positions.js';
import {createExerciseSession,applyExerciseAction,bestKeeperShotChance} from '../dist/exercise-session.js';
import {chooseExerciseAction,exerciseFinishes} from '../dist/exercise-ai.js';

const byId=id=>TOUGH_ATTACK_EXERCISES.find(d=>d.id===id);
function replay(definition,actions=definition.exampleActions,{seed=1984,forceFinalRoll}={}){
  let session=createExerciseSession(definition,{seed});const pendingShots=[],trace=[];
  const act=action=>{
    const before=session,copy=structuredClone(session);
    session=applyExerciseAction(session,action,session.game.phase==='keeperReact'&&forceFinalRoll!==undefined?{roll:forceFinalRoll}:{});
    assert.deepEqual(before,copy,'native session transitions preserve old positions and chance state');
    trace.push(session.game.lastAction?.type);
  };
  const respond=()=>{for(let i=0;session.status==='active'&&E.currentTeam(session.game)!==session.playerTeam;i++){
    assert.ok(i<14,'the study opponent returns control');
    if(session.game.phase==='keeperReact')pendingShots.push(session);
    const before=structuredClone(session.game),action=chooseExerciseAction(session.game);
    assert.deepEqual(session.game,before,'study analysis never consumes the live chance seed');
    act(action);
  }};
  for(const action of actions){respond();assert.equal(session.status,'active',`${definition.id}: every illustrative action is actually played`);act(action);}
  respond();return {session,pendingShots,trace};
}

test('six larger Tough attacks start both keepers centrally inside their goalmouths',()=>{
  assert.equal(TOUGH_ATTACK_EXERCISES.length,6);assert.equal(new Set(TOUGH_ATTACK_EXERCISES.map(d=>d.id)).size,6);
  for(const d of TOUGH_ATTACK_EXERCISES){
    assert.equal(d.difficulty,'tough');assert.equal(d.side,'attack');assert.ok((d.id==='tough-knight-wall-pass'?[5]:[3,4]).includes(d.planSteps));
    assert.equal(d.exampleActions.filter(a=>a.type!=='skip').length,d.planSteps);
    assert.equal(d.goal.requires,undefined);assert.equal(d.goal.minCompletedPasses,undefined);
    assert.ok(d.goal.minShotXG>=.1,'targets must remain meaningful scoring chances');
    assert.ok(d.revision>=2,'the prior displaced-keeper board is a distinct revision');
    assert.equal(d.hints.length,3);assert.ok(d.objective&&d.coachNote);
    const game=createExercisePosition(d);assert.ok(game.pieces.length>=14&&game.pieces.length<=18);
    assert.equal(new Set(game.pieces.map(p=>p.id)).size,game.pieces.length);
    assert.equal(new Set(game.pieces.map(p=>`${p.x},${p.y}`)).size,game.pieces.length);
    for(const p of game.pieces)assert.ok(E.canOccupySquare(p,p.x,p.y),`${d.id}: ${p.id} legal occupancy`);
    for(const team of ['white','black']){
      for(const [type,max]of Object.entries({K:1,Q:1,R:2,B:2,N:2,P:3}))assert.ok(game.pieces.filter(p=>p.team===team&&p.type===type).length<=max);
      const keeper=game.pieces.find(p=>p.team===team&&p.type==='K');
      assert.ok([6,7].includes(keeper.x),`${d.id}: ${team} keeper is central`);
      assert.ok(team==='white'?[15,16].includes(keeper.y):[0,1].includes(keeper.y));
      assert.ok(E.inOwnBox(team,keeper.x,keeper.y));
    }
    assert.equal(game.foulsEnabled,false);
  }
});

for(const d of TOUGH_ATTACK_EXERCISES)test(`${d.id}: a real route survives the actual study defence with natural keepers`,()=>{
  const {session,trace}=replay(d);
  assert.equal(session.status,'solved',`${d.id}: ${session.feedback}`);
  assert.ok(session.roundsUsed<=d.roundLimit);
  assert.ok(session.metrics.lastShotXG+1e-9>=d.goal.minShotXG);
  assert.ok(!trace.includes('tackleMiss'),'the route does not depend on a lucky failed knight tackle');
  assert.ok(Math.abs(session.metrics.shotResult.actualReplyXG-session.metrics.shotResult.bestReplyXG)<1e-9,
    'the study keeper uses a strongest immediate response');
});

test('none of the larger natural-keeper positions starts with a qualifying direct shot or disguise',()=>{
  for(const d of TOUGH_ATTACK_EXERCISES){
    const game={...createExercisePosition(d),phase:'kick'};
    const best=exerciseFinishes(game)[0]?.probability??0;
    assert.ok(best<d.goal.minShotXG,`${d.id}: initial ${best} must be below ${d.goal.minShotXG}`);
  }
});

test('deeper defence refutes the old k11 support square by preparing a rook screen',()=>{
  const buildup=byId('tough-sweeper-to-bishop'),alternative=structuredClone(buildup.exampleActions);
  alternative[1]={type:'move',pieceId:'white-Q',x:10,y:6};
  const first=replay(buildup,alternative).session;
  assert.equal(first.status,'active');assert.ok(first.metrics.lastShotXG<buildup.goal.minShotXG);
  assert.ok(first.game.lastAction.shotModel.blockerIds.includes('black-R1'));
});

test('different positioning orders and offside-clearance choices earn the same outcome credit',()=>{
  const link=byId('tough-knight-wall-pass'),alternative=structuredClone(link.exampleActions);
  [alternative[3],alternative[4]]=[alternative[4],alternative[3]];
  const first=replay(link,alternative).session;
  assert.equal(first.status,'solved');assert.ok(first.metrics.lastShotXG>=link.goal.minShotXG);
  const offside=byId('tough-clear-offside-runner'),second=structuredClone(offside.exampleActions);
  second[0]={type:'move',pieceId:'white-N1',x:3,y:0};
  assert.equal(replay(offside,second).session.status,'solved');
});

test('keeper buildup needs its actual supporting screen rather than an extra pass quota',()=>{
  const d=byId('tough-sweeper-to-bishop');
  const result=replay(d,d.exampleActions.filter((_,i)=>i!==1)).session;
  assert.notEqual(result.status,'solved');assert.equal(result.reason,null);assert.ok(result.notice);
  assert.ok(result.metrics.lastShotXG<.09&&result.metrics.lastShotXG<d.goal.minShotXG);
});

test('all legal goalkeeper replies grade a sound route by its best-reply quality',()=>{
  for(const id of ['tough-wide-rook-relay','tough-knight-wall-pass','tough-sweeper-to-bishop']){
    const {pendingShots}=replay(byId(id)),pending=pendingShots.at(-1),game=pending.game;
    const keeper=game.pieces.find(p=>p.type==='K'&&p.team===E.currentTeam(game));
    const replies=[{type:'skip'},...E.legalMoves(game,keeper.id).map(m=>({type:'move',pieceId:keeper.id,x:m.x,y:m.y}))];
    assert.ok(replies.length>=3);assert.ok(bestKeeperShotChance(game)>=pending.definition.goal.minShotXG);
    for(const action of replies){const result=applyExerciseAction(pending,action);assert.equal(result.status,'solved');assert.equal(result.reason,'strong-finish');}
  }
});

test('a good natural-keeper finish still earns credit when its final outcome is forced to miss',()=>{
  const d=byId('tough-sweeper-to-bishop'),result=replay(d,d.exampleActions,{forceFinalRoll:.999999}).session;
  assert.equal(result.status,'solved');assert.equal(result.metrics.shotResult.goal,false);
});
