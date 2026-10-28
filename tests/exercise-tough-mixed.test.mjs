import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../dist/engine.js';
import {TOUGH_MIXED_EXERCISES} from '../dist/exercise-tough-mixed.js';
import {createExerciseSession,applyExerciseAction} from '../dist/exercise-session.js';

const byId=id=>TOUGH_MIXED_EXERCISES.find(d=>d.id===id);
function play(definition,actions=definition.exampleActions,seed=1984){
  let session=createExerciseSession(definition,{seed}),botActions=0;
  const act=action=>{session=applyExerciseAction(session,action);};
  const respond=()=>{for(let i=0;session.status==='active'&&E.currentTeam(session.game)!==session.playerTeam;i++){
    assert.ok(i<15,'Tactical must return a decision');act(E.chooseAIAction(session.game,{difficulty:'tactical'}));botActions++;
  }};
  for(const action of actions){respond();assert.equal(session.status,'active','every example step must actually be played');assert.equal(E.currentTeam(session.game),session.playerTeam);act(action);}
  respond();return {session,botActions};
}

test('four crowded mixed Tough studies respect the real squad and stated plan lengths',()=>{
  assert.equal(TOUGH_MIXED_EXERCISES.length,4);
  assert.equal(TOUGH_MIXED_EXERCISES.filter(d=>d.side==='attack').length,3);
  assert.equal(TOUGH_MIXED_EXERCISES.filter(d=>d.side==='defence').length,1);
  for(const d of TOUGH_MIXED_EXERCISES){
    assert.equal(d.difficulty,'tough');assert.ok([3,4].includes(d.planSteps));
    assert.equal(d.exampleActions.filter(a=>a.type!=='skip').length,d.planSteps);
    assert.ok(d.position.pieces.length>=14&&d.position.pieces.length<=18);
    assert.equal(new Set(d.position.pieces.map(p=>p.id)).size,d.position.pieces.length);
    assert.equal(new Set(d.position.pieces.map(p=>`${p.x},${p.y}`)).size,d.position.pieces.length);
    for(const p of d.position.pieces)assert.ok(E.canOccupySquare(p,p.x,p.y),`${d.id}: ${p.id} legal`);
    for(const team of ['white','black'])for(const [type,max]of Object.entries({K:1,Q:1,R:2,B:2,N:2,P:3})){
      const count=d.position.pieces.filter(p=>p.team===team&&p.type===type).length;
      assert.ok(count<=max,`${d.id}: ${team} ${type} count`);if(type==='K')assert.equal(count,1);
    }
    assert.equal(d.hints.length,3);assert.ok(d.coachNote&&d.objective);
  }
});
for(const d of TOUGH_MIXED_EXERCISES)test(`${d.id}: full Tactical replies solve the real line over three seeds`,()=>{
  for(const seed of [1984,7,98765]){
    const {session,botActions}=play(d,d.exampleActions,seed);
    assert.equal(session.status,'solved',`${seed}: ${session.feedback}`);
    assert.ok(session.roundsUsed<=d.roundLimit);assert.ok(botActions>0);
    if(d.side==='attack')assert.ok(session.metrics.lastShotXG+1e-9>=d.goal.minShotXG);
    else assert.ok(session.metrics.lastOpponentShotXG<=d.goal.maxOpponentShotXG+1e-9);
  }
});

test('the delivery clearance accepts another safe bishop destination',()=>{
  const d=byId('tough-clear-the-delivery-diagonal');
  const line=d.exampleActions.map((a,i)=>i?{...a}:{type:'move',pieceId:'white-B1',x:11,y:2});
  assert.equal(play(d,line).session.status,'solved');
});
test('the coordinated screen accepts either preparation order',()=>{
  const d=byId('tough-pawn-screen-keeper-route'),[king,pawn,reaction]=d.exampleActions;
  assert.equal(play(d,[pawn,king,reaction]).session.status,'solved');
});
test('a defender cannot solve the crowded keeper study by an immediate or bonus-setup tackle',()=>{
  const d=byId('tough-pawn-screen-keeper-route'),game=createExerciseSession(d).game;
  const own=game.pieces.filter(p=>p.team==='white');
  for(const p of own){
    assert.ok(!E.legalMoves(game,p.id).some(m=>m.type==='tackle'),`${p.id} has no immediate possession win`);
    for(const bonus of E.legalMoves(game,p.id,{freePawn:true})){
      const after=E.applyMove(game,p.id,bonus.x,bonus.y,{freePawn:true});
      for(const challenger of own)assert.ok(!E.legalMoves(after,challenger.id).some(m=>m.type==='tackle'),`${p.id} bonus does not enable ${challenger.id} two-action shortcut`);
    }
  }
});
test('both clearance routes require actually clearing their friendly blocker',()=>{
  const delivery=byId('tough-clear-the-delivery-diagonal');
  assert.throws(()=>play(delivery,delivery.exampleActions.slice(1)),/not a legal kick/);
  const battery=byId('tough-unlock-the-rook-battery');
  assert.throws(()=>play(battery,battery.exampleActions.filter((_,i)=>i!==1)),/not a legal move/);
});
test('the new pawn screen is necessary rather than a pawn shuffled along the same shot path',()=>{
  const d=byId('tough-pawn-screen-keeper-route'),[king,,reaction]=d.exampleActions;
  const {session}=play(d,[king,{type:'skip'},reaction]);
  assert.equal(session.status,'failed');assert.ok(session.metrics.lastOpponentShotXG>d.goal.maxOpponentShotXG);
});
