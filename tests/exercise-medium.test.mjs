import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../dist/engine.js';
import {MEDIUM_EXERCISES} from '../dist/exercise-medium.js';
import {createExercisePosition} from '../dist/exercise-positions.js';
import {createExerciseSession,applyExerciseAction,bestKeeperShotChance} from '../dist/exercise-session.js';

function replay(definition,actions=definition.exampleActions,seed=1984){
  let session=createExerciseSession(definition,{seed});
  const reply=()=>{for(let n=0;session.status==='active'&&E.currentTeam(session.game)!==session.playerTeam;n++){
    assert.ok(n<14,'the full Tactical bot returns a decision');
    session=applyExerciseAction(session,E.chooseAIAction(session.game,{difficulty:'tactical',modelWeights:null}));
  }};
  for(const action of actions){reply();assert.equal(session.status,'active',`${definition.id}: no unused canonical actions`);assert.equal(E.currentTeam(session.game),'white');session=applyExerciseAction(session,action);}
  reply();return session;
}
const byId=id=>MEDIUM_EXERCISES.find(d=>d.id===`medium-${id}`);

test('Medium contains twelve larger positions, nine attacking and three defending, with two or three meaningful decisions',()=>{
  assert.equal(MEDIUM_EXERCISES.length,12);assert.equal(new Set(MEDIUM_EXERCISES.map(d=>d.id)).size,12);
  assert.equal(MEDIUM_EXERCISES.filter(d=>d.side==='attack').length,9);
  assert.equal(MEDIUM_EXERCISES.filter(d=>d.side==='defence').length,3);
  for(const d of MEDIUM_EXERCISES){
    assert.equal(d.difficulty,'medium');assert.ok([2,3].includes(d.planSteps));
    assert.equal(d.exampleActions.filter(a=>a.type!=='skip').length,d.planSteps);
    assert.equal(d.hints.length,3);assert.ok(d.objective&&d.coachNote);
    const g=createExercisePosition(d);assert.ok(g.pieces.length>=10&&g.pieces.length<=14);
    assert.equal(new Set(g.pieces.map(p=>p.id)).size,g.pieces.length);
    assert.equal(new Set(g.pieces.map(p=>`${p.x},${p.y}`)).size,g.pieces.length);
    for(const p of g.pieces)assert.ok(E.canOccupySquare(p,p.x,p.y),`${d.id}: legal ${p.id}`);
    for(const team of ['white','black'])for(const[type,max]of Object.entries({K:1,Q:1,R:2,B:2,N:2,P:3}))
      assert.ok(g.pieces.filter(p=>p.team===team&&p.type===type).length<=max);
    assert.equal(g.foulsEnabled,false);
  }
});
for(const d of MEDIUM_EXERCISES)test(`${d.id}: canonical combination solves against full Tactical over three seeds`,()=>{
  for(const seed of[1984,7,98765]){
    const session=replay(d,d.exampleActions,seed);assert.equal(session.status,'solved',session.feedback);
    assert.ok(session.roundsUsed<=d.roundLimit);
    if(d.side==='attack'){
      assert.ok(session.metrics.lastShotXG>=d.goal.minShotXG-1e-9);
      if(d.goal.requires==='through-ball')assert.equal(session.progress.throughBall,true);
      if(d.goal.requires==='box-entry')assert.equal(session.progress.boxEntry,true);
      if(d.goal.minCompletedPasses)assert.ok(session.progress.completedPasses>=d.goal.minCompletedPasses);
    }else if(session.reason!=='possession-won')assert.ok(session.metrics.lastOpponentShotXG<=d.goal.maxOpponentShotXG+1e-9);
  }
});

test('no Medium attack is an immediate qualifying shot and no defence is a direct one-action tackle',()=>{
  for(const d of MEDIUM_EXERCISES){
    const g=createExercisePosition(d);
    if(d.side==='attack'){
      const game={...g,phase:'kick'};
      const qualifies=E.legalKicks(game).filter(k=>k.goal==='white'&&!k.offside).some(k=>{
        const options=[k,...(E.disguisedShotTargets(game).length===2?[{...k,disguise:true}]:[])];
        return options.some(a=>bestKeeperShotChance(E.applyKick(game,a.x,a.y,{disguise:!!a.disguise}))>=d.goal.minShotXG
          &&!d.goal.requires&&!(d.goal.minCompletedPasses>0));
      });assert.equal(qualifies,false,d.id);
    }else for(const piece of g.pieces.filter(p=>p.team==='white'))
      assert.equal(E.legalMoves(g,piece.id).some(m=>m.type==='tackle'),false,`${d.id}: no immediate tackle bypass`);
  }
});

test('the pawn clearance admits either sideways bonus, and coordinated screening permits the opposite action order',()=>{
  const d=byId('pawn-clear'),actions=structuredClone(d.exampleActions);actions[0].x=6;
  assert.equal(replay(d,actions).status,'solved');
  for(const id of ['def-screen-rook','def-screen-bishop']){
    const d=byId(id),actions=[d.exampleActions[1],d.exampleActions[0],d.exampleActions[2]];
    assert.equal(replay(d,actions).status,'solved');
  }
});

test('the rook needs both clearance and shorter shooting distance, rather than a padded approach',()=>{
  const d=byId('clear-file');
  assert.throws(()=>replay(d,d.exampleActions.slice(1)),/legal move/);
  const withoutCarry=[d.exampleActions[0],{type:'skip'},d.exampleActions.at(-1)],result=replay(d,withoutCarry);
  assert.equal(result.status,'failed');assert.equal(result.reason,'weak-finish');assert.ok(result.metrics.lastShotXG<.3);
});

test('the rook screen uses the ten-point weighted movement limit, and holding after the bonus still leaves too much danger',()=>{
  const d=byId('def-screen-rook'),g=createExercisePosition(d),rook=g.pieces.find(p=>p.id==='white-R1');
  assert.equal(E.movementCost(rook,7,14),10);
  const actions=[...d.exampleActions.slice(0,2),{type:'skip'}],result=replay(d,actions);
  assert.equal(result.status,'failed');assert.equal(result.reason,'strong-opponent-finish');assert.ok(result.metrics.lastOpponentShotXG>.35);
});
