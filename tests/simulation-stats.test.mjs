import test from 'node:test';
import assert from 'node:assert/strict';
import * as rules from '../dist/engine.js';
import {runMatch,summary} from '../scripts/simulate.mjs';

const other=team=>team==='white'?'black':'white';
const mirror=([x,y])=>[11-x,14-y];

// Keep both full squads. An outside-box defending king makes the seeded goal
// deterministic while the offside case adds an active attacking box knight.
function fixture(team,{offside=false}={}){
  const state=rules.createGame({mode:'local',kickoff:team,seed:1}),enemy=other(team);
  const transform=pair=>team==='white'?pair:mirror(pair);
  const assigned={
    [`${team}-K`]:transform([7,14]),[`${enemy}-K`]:transform([8,3]),
    [`${team}-R1`]:transform([4,5]),[`${team}-P2`]:transform([1,14]),[`${team}-P3`]:transform([2,14]),
    [`${enemy}-P2`]:transform(offside?[3,4]:[1,0]),[`${enemy}-P3`]:transform(offside?[3,5]:[2,0]),
    ...(offside?{[`${team}-N1`]:transform([5,0])}:{})
  };
  const occupied=new Set(Object.values(assigned).map(pair=>pair.join(',')));
  const parking=Array.from({length:9},(_,row)=>[[0,row+3],[11,row+3]]).flat().map(transform);
  for(const piece of state.pieces){const at=assigned[piece.id]||parking.find(pair=>!occupied.has(pair.join(',')));[piece.x,piece.y]=at;occupied.add(at.join(','));}
  const carrier=state.pieces.find(piece=>piece.id===`${team}-R1`);
  Object.assign(state,{phase:'kick',attack:team,ball:{x:carrier.x,y:carrier.y,carrierId:carrier.id},lastAction:null,restart:null,offside:null,pendingShot:null});
  return {state,goal:transform([4,-1]),pass:transform([4,4])};
}

function simulate(initialState,policy,actionLimit){
  const before=structuredClone(initialState),match=runMatch({initialState,whitePolicy:policy,blackPolicy:policy,actionLimit,record:true,validate:true});
  assert.equal(match.error,null);assert.deepEqual(initialState,before,'public simulation preserves caller snapshots');
  return match;
}

for(const team of ['white','black']){
  test(`${team} public simulation counts an actual declared goal shot once`,()=>{
    const {state,goal}=fixture(team),policy=game=>game.phase==='keeperReact'?{type:'skip'}:{type:'kick',x:goal[0],y:goal[1]};
    const match=simulate(state,policy,2),side=match.stats[team];
    assert.deepEqual(match.events.map(event=>event.result.type),['shotAttempt','goal']);
    assert.equal(side.shots,1);assert.equal(side.resolvedShots,1);assert.equal(side.goals,1);assert.equal(side.role.R.shots,1);assert.equal(side.role.R.goals,1);
    assert.equal(side.passes,0);assert.equal(side.offsides,0);assert.equal(match.score[team],1);
    assert.equal(match.stats[other(team)].shots,0);
    const aggregate=summary([match]);assert.equal(aggregate.totals.shots,1);assert.equal(aggregate.totals.resolvedShots,1);assert.equal(aggregate.rates.conversion,1);
  });

  test(`${team} public simulation excludes a goal-target kick stopped by an offside box attacker`,()=>{
    const {state,goal}=fixture(team,{offside:true});
    assert.ok(rules.legalKicks(state).some(kick=>kick.x===goal[0]&&kick.y===goal[1]&&kick.goal&&kick.offsideReason==='boxKnight'));
    const match=simulate(state,()=>({type:'kick',x:goal[0],y:goal[1]}),1),side=match.stats[team];
    assert.equal(match.events[0].result.type,'offside');assert.equal(match.finalState.restart.type,'offside');
    assert.equal(side.shots,0);assert.equal(side.resolvedShots,0);assert.equal(side.role.R.shots,0);assert.equal(side.xG,0);assert.equal(side.shotXG.length,0);
    assert.equal(side.offsides,1);assert.equal(side.passes,0);assert.equal(side.goals,0);
    const aggregate=summary([match]);assert.equal(aggregate.totals.shots,0);assert.equal(aggregate.totals.resolvedShots,0);assert.equal(aggregate.totals.offsides,1);
  });

  test(`${team} public simulation records an ordinary pass without a shot`,()=>{
    const {state,pass}=fixture(team),match=simulate(state,()=>({type:'kick',x:pass[0],y:pass[1]}),1),side=match.stats[team];
    assert.equal(match.events[0].result.type,'kick');assert.equal(side.passes,1);assert.equal(side.role.R.passes,1);
    assert.equal(side.shots,0);assert.equal(side.resolvedShots,0);assert.equal(side.role.R.shots,0);assert.equal(side.offsides,0);assert.equal(side.xG,0);
  });
}
