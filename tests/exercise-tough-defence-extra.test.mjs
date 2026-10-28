import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../dist/engine.js';
import {TOUGH_DEFENCE_EXTRA} from '../dist/exercise-tough-defence-extra.js';
import {createExerciseSession,applyExerciseAction,bestKeeperShotChance} from '../dist/exercise-session.js';
import {chooseExerciseAction,exerciseFinishes} from '../dist/exercise-ai.js';

function play(def,actions=def.exampleActions,seed=1984){
  let session=createExerciseSession(def,{seed});const trace=[];
  const apply=(action,bot=false)=>{const before=structuredClone(session),source=session;
    session=applyExerciseAction(session,action);assert.deepEqual(source,before);
    trace.push({action,bot,result:session.game.lastAction?.type});};
  const respond=()=>{for(let allowance=0;session.status==='active'&&E.currentTeam(session.game)!==session.playerTeam;allowance++){
    assert.ok(allowance<16);const game=session.game,action=chooseExerciseAction(game);
    if(action.type==='kick'&&['kick','keeperRelease'].includes(game.phase)){
      const finishes=exerciseFinishes(game),chosen=finishes.find(f=>f.action.x===action.x&&f.action.y===action.y&&!!f.action.disguise===!!action.disguise);
      if(chosen)assert.ok(chosen.probability>=finishes[0].probability-1e-9,'the opponent aims at its strongest legal finish');
    }
    apply(action,true);}};
  for(const action of actions){respond();assert.equal(session.status,'active');apply(action);}
  respond();return {session,trace};
}

test('extra Tough defences use legal crowded diagrams and genuine three/four-step plans',()=>{
  for(const d of TOUGH_DEFENCE_EXTRA){
    assert.equal(d.difficulty,'tough');assert.equal(d.side,'defence');assert.ok([3,4].includes(d.planSteps));
    assert.equal(d.exampleActions.filter(a=>a.type!=='skip').length,d.planSteps);
    assert.ok(d.position.pieces.length>=14&&d.position.pieces.length<=18);
    assert.equal(new Set(d.position.pieces.map(p=>`${p.x},${p.y}`)).size,d.position.pieces.length);
    for(const p of d.position.pieces)assert.ok(E.canOccupySquare(p,p.x,p.y),`${d.id}: ${p.id}`);
    for(const team of ['white','black'])for(const[type,cap]of Object.entries({K:1,Q:1,R:2,B:2,N:2,P:3}))
      assert.ok(d.position.pieces.filter(p=>p.team===team&&p.type===type).length<=cap);
    const game=createExerciseSession(d).game;
    assert.deepEqual(game.pieces.filter(p=>p.team===d.playerTeam).flatMap(p=>E.legalMoves(game,p.id).filter(m=>m.type==='tackle')),[],
      `${d.id}: an immediate challenge cannot bypass the plan`);
  }
});

for(const d of TOUGH_DEFENCE_EXTRA)test(`${d.id}: expanded study replies across three seeds`,()=>{
  for(const seed of [1984,7,98765]){
    const {session,trace}=play(d,d.exampleActions,seed);
    assert.equal(session.status,'solved',`${d.id},${seed}: ${session.feedback}`);
    assert.ok(session.roundsUsed<=d.roundLimit);assert.ok(trace.some(t=>t.bot));
    assert.ok(session.reason==='possession-won'||session.metrics.testedThreatXG<=d.goal.maxOpponentShotXG);
  }
});

test('the illustrated keeper return obeys blocked entries and rewards a real saving reaction',()=>{
  const d=TOUGH_DEFENCE_EXTRA.find(d=>d.id==='tough-open-the-keepers-return');
  const game=createExerciseSession(d).game;
  assert.equal(E.inOwnBox('white',3,15),false);
  assert.ok(E.legalMoves(game,'white-K').every(m=>!E.inOwnBox('white',m.x,m.y)),
    'friendly players close every immediate box entry');
  assert.throws(()=>play(d,d.exampleActions.slice(1)),/legal move/);
  assert.throws(()=>play(d,[d.exampleActions[0],d.exampleActions[2]]),/legal move/);
  const held=play(d,[...d.exampleActions.slice(0,2),{type:'skip'}]).session;
  assert.equal(held.status,'failed');assert.ok(held.metrics.lastOpponentShotXG>.9);
});

test('different legal rook clearances can open the gateway for an effective defence',()=>{
  const d=TOUGH_DEFENCE_EXTRA.find(d=>d.id==='tough-clear-the-box-gateway'),game=createExerciseSession(d).game;
  assert.equal(E.inOwnBox('white',3,13),false);
  for(const freePawn of [false,true])assert.ok(E.legalMoves(game,'white-K',{freePawn}).every(m=>!E.inOwnBox('white',m.x,m.y)),
    'the blocked e3 gateway prevents a direct king entry with either budget');
  assert.throws(()=>play(d,d.exampleActions.slice(1)),/legal move/);
  assert.throws(()=>play(d,[d.exampleActions[0],d.exampleActions[2]]),/legal move/);
  const held=play(d,[...d.exampleActions.slice(0,2),{type:'skip'}]).session;
  assert.equal(held.status,'failed');assert.ok(held.metrics.lastOpponentShotXG>.9);
  for(const x of [2,1]){
    const alternative=play(d,[{type:'move',pieceId:'white-R1',x,y:14},...d.exampleActions.slice(1)]).session;
    assert.equal(alternative.status,'solved');assert.ok(alternative.metrics.testedThreatXG<.28);
  }
});

test('the gateway has no one/two-action capture or shot-covering shortcut',()=>{
  const d=TOUGH_DEFENCE_EXTRA.find(d=>d.id==='tough-clear-the-box-gateway'),initial=createExerciseSession(d).game;
  const actions=game=>game.pieces.filter(p=>p.team==='white').flatMap(p=>[false,true].flatMap(freePawn=>
    E.legalMoves(game,p.id,{freePawn}).map(m=>({pieceId:p.id,x:m.x,y:m.y,freePawn}))));
  const apply=(game,a)=>E.applyMove(game,a.pieceId,a.x,a.y,{freePawn:a.freePawn});
  let checked=0,minChance=1;
  function inspect(game,length){
    assert.equal(game.attack,'black','no combination of at most two student moves wins possession');
    while(game.phase==='defendMove')game=E.skipMove(game);
    assert.equal(game.phase,'kick');
    const shot=E.applyKick(game,5,17);
    // One preparation plus any keeper reaction is a two-action solution.
    // Two preparations plus holding is the other two-action possibility.
    const chance=length===1?bestKeeperShotChance(shot):E.shotModel(shot).probability;
    assert.ok(chance>d.goal.maxOpponentShotXG,`a ${length}-move route cannot cover the available F-file threat`);
    checked++;minChance=Math.min(minChance,chance);
  }
  for(const first of actions(initial)){
    const next=apply(initial,first);inspect(next,1);
    if(next.phase==='defendMove')for(const second of actions(next))inspect(apply(next,second),2);
  }
  assert.ok(checked>1000);assert.ok(minChance>.5);
});
