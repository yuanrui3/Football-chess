import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../dist/engine.js';
import {TOUGH_ATTACK_EXERCISES} from '../dist/exercise-tough-attack.js';
import {createExercisePosition} from '../dist/exercise-positions.js';
import {createExerciseSession,applyExerciseAction} from '../dist/exercise-session.js';

function replay(definition,actions=definition.exampleActions,seed=1984){
  let session=createExerciseSession(definition,{seed});
  const respond=()=>{for(let i=0;session.status==='active'&&E.currentTeam(session.game)!==session.playerTeam;i++){
    assert.ok(i<14,'the full Tactical bot must return control');
    session=applyExerciseAction(session,E.chooseAIAction(session.game,{difficulty:'tactical',modelWeights:null}));
  }};
  for(const action of actions){respond();assert.equal(session.status,'active',`${definition.id}: every example action is used`);session=applyExerciseAction(session,action);}
  respond();return session;
}

test('Tough attacking combinations have more legal players and three or four meaningful decisions',()=>{
  assert.equal(TOUGH_ATTACK_EXERCISES.length,6);
  assert.equal(new Set(TOUGH_ATTACK_EXERCISES.map(d=>d.id)).size,6);
  for(const d of TOUGH_ATTACK_EXERCISES){
    assert.equal(d.difficulty,'tough');assert.equal(d.side,'attack');assert.ok([3,4].includes(d.planSteps));
    assert.equal(d.exampleActions.filter(a=>a.type!=='skip').length,d.planSteps);
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

for(const d of TOUGH_ATTACK_EXERCISES)test(`${d.id}: combination succeeds against full Tactical across three seeds`,()=>{
  for(const seed of[1984,7,98765]){
    const result=replay(d,d.exampleActions,seed);
    assert.equal(result.status,'solved',`${d.id}, seed${seed}: ${result.feedback}`);
    assert.ok(result.roundsUsed<=d.roundLimit);
    assert.ok(result.metrics.lastShotXG>=d.goal.minShotXG-1e-9);
    assert.ok(result.progress.completedPasses>=d.goal.minCompletedPasses);
    if(d.goal.requires==='box-entry')assert.equal(result.progress.boxEntry,true);
    if(d.goal.requires==='through-ball')assert.equal(result.progress.throughBall,true);
  }
});

test('no Tough attack can be solved by an immediate shot or a lucky early finish',()=>{
  for(const d of TOUGH_ATTACK_EXERCISES){
    const session=createExerciseSession(d),game={...session.game,phase:'kick'};
    for(const action of E.legalKicks(game).filter(k=>k.goal==='white')){
      let direct={...session,game};direct=applyExerciseAction(direct,{type:'kick',x:action.x,y:action.y});
      if(direct.game.phase==='keeperReact')direct=applyExerciseAction(direct,{type:'skip'});
      assert.notEqual(direct.status,'solved',`${d.id} cannot bypass its stated combination objective`);
    }
  }
});

test('the jumping wall pass accepts a disguised finish instead of the example single aim',()=>{
  const d=TOUGH_ATTACK_EXERCISES.find(d=>d.id==='tough-knight-wall-pass');
  const actions=structuredClone(d.exampleActions);actions.at(-1).disguise=true;
  assert.equal(replay(d,actions).status,'solved');
});

test('moving closer in the queen relay loses to the keeper rather than padding the line',()=>{
  const d=TOUGH_ATTACK_EXERCISES.find(d=>d.id==='tough-wide-rook-relay');
  const actions=structuredClone(d.exampleActions);actions[3]={type:'move',pieceId:'white-Q',x:8,y:2};
  const result=replay(d,actions.slice(0,-1));assert.equal(result.status,'failed');assert.equal(result.reason,'possession-lost');
});

test('the offside box runner must be removed before attempting the cross',()=>{
  const d=TOUGH_ATTACK_EXERCISES.find(d=>d.id==='tough-clear-offside-runner');
  const result=replay(d,d.exampleActions.slice(1,3));
  assert.equal(result.status,'failed');assert.equal(result.reason,'possession-lost');
});
