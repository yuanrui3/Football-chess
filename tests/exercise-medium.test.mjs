import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../dist/engine.js';
import {MEDIUM_EXERCISES} from '../dist/exercise-medium.js';
import {createExercisePosition} from '../dist/exercise-positions.js';
import {createExerciseSession,applyExerciseAction,bestKeeperShotChance} from '../dist/exercise-session.js';
import {chooseExerciseAction} from '../dist/exercise-ai.js';

function replay(definition,actions=definition.exampleActions,{finalRoll}={}){
  let session=createExerciseSession(definition,{seed:1984});
  const act=action=>{session=applyExerciseAction(session,action,
    session.game.phase==='keeperReact'&&finalRoll!==undefined?{roll:finalRoll}:{});};
  const reply=()=>{for(let n=0;session.status==='active'&&E.currentTeam(session.game)!==session.playerTeam;n++){
    assert.ok(n<18,'the expanded study opponent returns a decision');
    act(chooseExerciseAction(session.game));
  }};
  for(const action of actions){reply();assert.equal(session.status,'active',`${definition.id}: every illustrative action is used`);assert.equal(E.currentTeam(session.game),'white');act(action);}
  reply();return session;
}
const byId=id=>MEDIUM_EXERCISES.find(d=>d.id===`medium-${id}`);
const initialChances=d=>{const g={...createExercisePosition(d),phase:'kick'};
  const shots=E.legalKicks(g).filter(k=>k.goal==='white'&&!k.offside).map(k=>({type:'kick',x:k.x,y:k.y}));
  const pair=E.disguisedShotTargets(g);if(pair.length===2)shots.push({type:'kick',x:pair[0].x,y:pair[0].y,disguise:true});
  return shots.map(a=>bestKeeperShotChance(E.applyKick(g,a.x,a.y,{disguise:!!a.disguise})));};

 test('Medium keeps twelve larger legal studies and outcome-based two or three step examples',()=>{
  assert.equal(MEDIUM_EXERCISES.length,12);assert.equal(new Set(MEDIUM_EXERCISES.map(d=>d.id)).size,12);
  assert.equal(MEDIUM_EXERCISES.filter(d=>d.side==='attack').length,9);assert.equal(MEDIUM_EXERCISES.filter(d=>d.side==='defence').length,3);
  for(const d of MEDIUM_EXERCISES){
    assert.equal(d.difficulty,'medium');assert.ok([2,3].includes(d.planSteps));assert.equal(d.exampleActions.filter(a=>a.type!=='skip').length,d.planSteps);
    assert.equal(d.hints.length,3);assert.ok(d.objective&&d.coachNote);assert.equal(d.goal.requires,undefined);assert.equal(d.goal.minCompletedPasses,undefined);
    if(d.side==='attack')assert.ok(d.goal.minShotXG>=.1,'a useful finish is required, not a tiny threshold');
    const g=createExercisePosition(d);assert.ok(g.pieces.length>=10&&g.pieces.length<=14);assert.equal(g.foulsEnabled,false);
    assert.equal(new Set(g.pieces.map(p=>p.id)).size,g.pieces.length);assert.equal(new Set(g.pieces.map(p=>`${p.x},${p.y}`)).size,g.pieces.length);
    for(const p of g.pieces)assert.ok(E.canOccupySquare(p,p.x,p.y),`${d.id}: legal ${p.id}`);
    for(const team of ['white','black'])for(const[type,max]of Object.entries({K:1,Q:1,R:2,B:2,N:2,P:3}))assert.ok(g.pieces.filter(p=>p.team===team&&p.type===type).length<=max);
  }
});

test('both keepers start naturally near their own goal, with near-post shading only against a wide ball',()=>{
  for(const d of MEDIUM_EXERCISES){const g=createExercisePosition(d);
    for(const k of g.pieces.filter(p=>p.type==='K')){
      const depth=k.team==='black'?k.y:16-k.y;
      assert.ok(depth===0||depth===1,`${d.id}: ${k.id} starts on or one square off the goal line`);
      assert.ok(E.inOwnBox(k.team,k.x,k.y));assert.ok(k.x>=5&&k.x<=8);
      if(k.team===g.attack)assert.ok([6,7].includes(k.x),`${d.id}: inactive keeper is central`);
      else if(k.x===5)assert.ok(g.ball.x<=3,`${d.id}: left-post shade matches a left-wing ball`);
      else if(k.x===8)assert.ok(g.ball.x>=10,`${d.id}: right-post shade matches a right-wing ball`);
    }
  }
});

for(const d of MEDIUM_EXERCISES)test(`${d.id}: natural keepers retain a valid route against actual expanded analysis`,()=>{
  const result=replay(d);assert.equal(result.status,'solved',result.feedback);assert.ok(result.roundsUsed<=d.roundLimit);
  if(d.side==='attack')assert.ok(result.metrics.lastShotXG>=d.goal.minShotXG-1e-9);
  else if(result.reason!=='possession-won')assert.ok(result.metrics.testedThreatXG<=d.goal.maxOpponentShotXG+1e-9);
});

test('initial shots cannot meet an attacking objective and defenders have no immediate one-action capture',()=>{
  for(const d of MEDIUM_EXERCISES){
    if(d.side==='attack')assert.ok(Math.max(0,...initialChances(d))<d.goal.minShotXG,d.id);
    else{const g=createExercisePosition(d);for(const p of g.pieces.filter(p=>p.team==='white'))assert.equal(E.legalMoves(g,p.id).some(m=>m.type==='tackle'),false,`${d.id}: ${p.id}`);}
  }
});

test('different bishop clearances and a different rook vacancy earn full outcome credit',()=>{
  for(const[id,first]of[
    ['clear-file',{type:'move',pieceId:'white-B1',x:7,y:4}],
    ['clear-and-carry',{type:'move',pieceId:'white-B1',x:10,y:3}],
    ['vacate-receiver-lane',{type:'move',pieceId:'white-R1',x:6,y:3}],
  ]){const d=byId(id),actions=structuredClone(d.exampleActions);actions[0]=first;assert.equal(replay(d,actions).status,'solved',id);}
});

test('the pawn can clear either side and the queen may choose another sound final lane',()=>{
  const pawn=byId('pawn-clear'),left=structuredClone(pawn.exampleActions);left[0].x=6;assert.equal(replay(pawn,left).status,'solved');
  const d=byId('queen-through-collection'),actions=structuredClone(d.exampleActions);
  actions.splice(2,0,{type:'move',pieceId:'white-Q',x:7,y:3});actions[actions.length-1]={type:'kick',x:7,y:-1};
  const result=replay(d,actions);assert.equal(result.status,'solved');assert.ok(result.metrics.lastShotXG>=d.goal.minShotXG);
});

test('rook-screen defence can use the king bonus first, and bishop screening admits either preparation order',()=>{
  const rook=byId('def-screen-rook');assert.equal(replay(rook,[{type:'move',pieceId:'white-K',x:7,y:16,freePawn:true},rook.exampleActions[0],{type:'skip'}]).status,'solved');
  const bishop=byId('def-screen-bishop');assert.equal(replay(bishop,[bishop.exampleActions[1],bishop.exampleActions[0],bishop.exampleActions[2]]).status,'solved');
  const sweeper=byId('def-sweeper-keeper');assert.equal(replay(sweeper,[{type:'move',pieceId:'white-K',x:6,y:14,freePawn:true},{type:'move',pieceId:'white-K',x:7,y:14}]).status,'solved');
});

test('a useful naturally covered finish still earns credit when its native roll misses',()=>{
  const result=replay(byId('clear-file'),undefined,{finalRoll:.999999});assert.equal(result.status,'solved');assert.equal(result.metrics.shotResult.goal,false);
});

test('the leading deliveries really cross a nearby defensive line and the weighted rook retreat remains legal',()=>{
  for(const id of ['through-collect-finish','queen-through-collection'])assert.equal(replay(byId(id)).progress.throughBall,true,id);
  const d=byId('def-screen-rook'),g=createExercisePosition(d),r=g.pieces.find(p=>p.id==='white-R1');assert.equal(E.movementCost(r,7,14),10);
  const held=replay(d,[d.exampleActions[0],{type:'skip'},{type:'skip'}]);assert.equal(held.status,'failed');assert.ok(held.metrics.testedThreatXG>d.goal.maxOpponentShotXG);
});

test('revised natural positions have newer revisions while an unchanged central bishop defence keeps its prior credit',()=>{
  for(const d of MEDIUM_EXERCISES){if(d.id==='medium-def-screen-bishop')assert.equal(d.revision??1,1);else assert.ok(d.revision>=2);}
  assert.ok(byId('rook-relay').revision>=3);assert.ok(byId('queen-through-collection').revision>=3);
});
