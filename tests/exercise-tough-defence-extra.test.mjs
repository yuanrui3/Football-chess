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
    assert.ok(d.revision>=2);
    for(const keeper of d.position.pieces.filter(p=>p.type==='K')){
      assert.ok([6,7].includes(keeper.x),`${d.id}: ${keeper.id} begins centrally`);
      assert.ok(keeper.team==='white'?[15,16].includes(keeper.y):[0,1].includes(keeper.y));
      assert.ok(E.inOwnBox(keeper.team,keeper.x,keeper.y));
    }
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

test('both natural keeper defences accept the bonus and screen in either order',()=>{
  for(const d of TOUGH_DEFENCE_EXTRA){
    const [screen,bonus,reaction]=d.exampleActions;
    const result=play(d,[bonus,screen,reaction]).session;
    assert.equal(result.status,'solved',`${d.id}: ${result.feedback}`);
    assert.ok(result.metrics.testedThreatXG<=d.goal.maxOpponentShotXG);
  }
});

test('covering the far post needs a screen and an actual keeper reaction',()=>{
  for(const d of TOUGH_DEFENCE_EXTRA){
    const [screen,bonus,reaction]=d.exampleActions;
    const noScreen=play(d,[bonus,{type:'skip'},reaction]).session;
    assert.equal(noScreen.status,'failed',`${d.id}: the body screen matters`);
    assert.ok(noScreen.metrics.testedThreatXG>d.goal.maxOpponentShotXG);
    const held=play(d,[screen,bonus,{type:'skip'}]).session;
    assert.equal(held.status,'failed',`${d.id}: the declared-shot reaction matters`);
    assert.ok(held.metrics.testedThreatXG>d.goal.maxOpponentShotXG);
  }
});

test('neither natural keeper study starts with an immediate or bonus-assisted tackle',()=>{
  for(const d of TOUGH_DEFENCE_EXTRA){
    const game=createExerciseSession(d).game,own=game.pieces.filter(p=>p.team===d.playerTeam);
    for(const p of own){
      assert.ok(!E.legalMoves(game,p.id).some(m=>m.type==='tackle'),`${d.id}: ${p.id} immediate tackle`);
      for(const bonus of E.legalMoves(game,p.id,{freePawn:true})){
        const after=E.applyMove(game,p.id,bonus.x,bonus.y,{freePawn:true,roll:0});
        for(const challenger of own)assert.ok(!E.legalMoves(after,challenger.id).some(m=>m.type==='tackle'),
          `${d.id}: ${p.id} bonus must not enable ${challenger.id} capture`);
      }
    }
  }
});

test('natural keeper coverage alone or two preparations without a reaction cannot reach the Tough targets',()=>{
  for(const d of TOUGH_DEFENCE_EXTRA){
    const initial=createExerciseSession(d).game,targetX=d.id==='tough-open-the-keepers-return'?8:5;
    const actions=game=>game.pieces.filter(p=>p.team==='white').flatMap(p=>[false,true].flatMap(freePawn=>
      E.legalMoves(game,p.id,{freePawn}).map(m=>({pieceId:p.id,x:m.x,y:m.y,freePawn}))));
    const apply=(game,a)=>E.applyMove(game,a.pieceId,a.x,a.y,{freePawn:a.freePawn,roll:0});
    let checked=0,minChance=1;
    function inspect(game,length){
      assert.equal(game.attack,'black','no combination of at most two student moves wins possession');
      while(game.phase==='defendMove')game=E.skipMove(game);
      assert.equal(game.phase,'kick');
      const shot=E.applyKick(game,targetX,17);
      // One preparation plus any keeper reaction is a two-action solution.
      // Two preparations plus holding is the other two-action possibility.
      const chance=length===1?bestKeeperShotChance(shot):E.shotModel(shot).probability;
      assert.ok(chance>d.goal.maxOpponentShotXG,`${d.id}: ${length}-move route cannot cover the available threat`);
      checked++;minChance=Math.min(minChance,chance);
    }
    for(const first of actions(initial)){
      const next=apply(initial,first);inspect(next,1);
      if(next.phase==='defendMove')for(const second of actions(next))inspect(apply(next,second),2);
    }
    assert.ok(checked>1000);assert.ok(minChance>d.goal.maxOpponentShotXG);
  }
});
