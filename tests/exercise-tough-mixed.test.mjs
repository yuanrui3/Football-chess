import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../dist/engine.js';
import {TOUGH_MIXED_EXERCISES} from '../dist/exercise-tough-mixed.js';
import {createExerciseSession,applyExerciseAction,bestKeeperShotChance} from '../dist/exercise-session.js';
import {chooseExerciseAction,exerciseFinishes,exerciseKeeperChance} from '../dist/exercise-ai.js';

const byId=id=>TOUGH_MIXED_EXERCISES.find(d=>d.id===id);
function play(definition,actions=definition.exampleActions,seed=1984){
  let session=createExerciseSession(definition,{seed}),botActions=0;
  const act=action=>{session=applyExerciseAction(session,action);};
  const respond=()=>{for(let i=0;session.status==='active'&&E.currentTeam(session.game)!==session.playerTeam;i++){
    assert.ok(i<15,'the study opponent must return a decision');
    const game=session.game,action=chooseExerciseAction(game);
    if(game.phase==='keeperReact'){
      const chance=E.shotModel(game,game.pendingShot.x,game.pendingShot.y,action.type==='move'?action:undefined).probability;
      assert.ok(Math.abs(chance-exerciseKeeperChance(game))<1e-9,'every legal keeper response is checked');
    }
    if(action.type==='kick'&&['kick','keeperRelease'].includes(game.phase)){
      const finishes=exerciseFinishes(game),chosen=finishes.find(f=>f.action.x===action.x&&f.action.y===action.y&&!!f.action.disguise===!!action.disguise);
      if(chosen)assert.ok(chosen.probability>=finishes[0].probability-1e-9,'the opponent uses its strongest available aim');
    }
    act(action);botActions++;
  }};
  for(const action of actions){respond();assert.equal(session.status,'active','every example step must actually be played');assert.equal(E.currentTeam(session.game),session.playerTeam);act(action);}
  respond();return {session,botActions};
}

test('four crowded mixed Tough studies respect natural keepers, the real squad and stated plan lengths',()=>{
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
    for(const keeper of d.position.pieces.filter(p=>p.type==='K')){
      assert.ok([6,7].includes(keeper.x),`${d.id}: ${keeper.id} begins centrally`);
      assert.ok(keeper.team==='white'?[15,16].includes(keeper.y):[0,1].includes(keeper.y));
      assert.ok(E.inOwnBox(keeper.team,keeper.x,keeper.y));
    }
    assert.equal(d.hints.length,3);assert.ok(d.coachNote&&d.objective);
  }
});
for(const d of TOUGH_MIXED_EXERCISES)test(`${d.id}: expanded study replies solve the real line over three seeds`,()=>{
  for(const seed of [1984,7,98765]){
    const {session,botActions}=play(d,d.exampleActions,seed);
    assert.equal(session.status,'solved',`${seed}: ${session.feedback}`);
    assert.ok(session.roundsUsed<=d.roundLimit);assert.ok(botActions>0);
    if(d.side==='attack')assert.ok(session.metrics.lastShotXG+1e-9>=d.goal.minShotXG);
    else assert.ok(session.metrics.lastOpponentShotXG<=d.goal.maxOpponentShotXG+1e-9);
  }
});

test('different legal bishop clearances earn the same outcome-based credit',()=>{
  const d=byId('tough-clear-the-delivery-diagonal');
  for(const [x,y]of [[7,2],[5,4]]){
    const line=d.exampleActions.map((a,i)=>i?{...a}:{type:'move',pieceId:'white-B1',x,y});
    assert.equal(play(d,line).session.status,'solved');
  }
});
test('the coordinated screen accepts either preparation order',()=>{
  const d=byId('tough-pawn-screen-keeper-route'),[rook,pawn,reaction]=d.exampleActions;
  const result=play(d,[pawn,rook,reaction]).session;
  assert.equal(result.status,'solved');assert.ok(result.metrics.testedThreatXG<=d.goal.maxOpponentShotXG);
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
test('the illustrated straight delivery and dribble remain subject to real blocking rules',()=>{
  const delivery=byId('tough-clear-the-delivery-diagonal');
  assert.throws(()=>play(delivery,delivery.exampleActions.slice(1)),/not a legal kick/);
  const battery=byId('tough-unlock-the-rook-battery');
  assert.throws(()=>play(battery,battery.exampleActions.filter((_,i)=>i!==1)),/not a legal move/);
});
test('the rook battery accepts a different supporting bishop destination',()=>{
  const d=byId('tough-unlock-the-rook-battery'),line=d.exampleActions.map((a,i)=>i===1?{...a,x:7,y:1}:{...a});
  const result=play(d,line).session;
  assert.equal(result.status,'solved');assert.ok(result.metrics.lastShotXG>=d.goal.minShotXG);
});
test('the new pawn screen is necessary rather than a pawn shuffled along the same shot path',()=>{
  const d=byId('tough-pawn-screen-keeper-route'),[rook,,reaction]=d.exampleActions;
  const {session}=play(d,[rook,{type:'skip'},reaction]);
  assert.equal(session.status,'failed');assert.ok(session.metrics.lastOpponentShotXG>d.goal.maxOpponentShotXG);
});
test('the rebuilt pressing cage has no immediate or two-action finishing defence',()=>{
  const d=byId('tough-pawn-screen-keeper-route'),initial=createExerciseSession(d).game;
  const actions=game=>game.pieces.filter(p=>p.team==='white').flatMap(p=>[false,true].flatMap(freePawn=>
    E.legalMoves(game,p.id,{freePawn}).map(m=>({pieceId:p.id,x:m.x,y:m.y,freePawn}))));
  const apply=(game,a)=>E.applyMove(game,a.pieceId,a.x,a.y,{freePawn:a.freePawn,roll:0});
  let checked=0,minChance=1;
  const inspect=(game,length)=>{
    assert.equal(game.attack,'black','a one/two-move route does not already win possession');
    while(game.phase==='defendMove')game=E.skipMove(game);
    const pending=E.applyKick(game,7,17);
    const chance=length===1?bestKeeperShotChance(pending):E.shotModel(pending).probability;
    assert.ok(chance>d.goal.maxOpponentShotXG,'the native strongest H-file threat still exceeds the target');
    checked++;minChance=Math.min(minChance,chance);
  };
  for(const first of actions(initial)){
    const next=apply(initial,first);inspect(next,1);
    if(next.phase==='defendMove')for(const second of actions(next))inspect(apply(next,second),2);
  }
  assert.ok(checked>1800);assert.ok(minChance>d.goal.maxOpponentShotXG);
});
