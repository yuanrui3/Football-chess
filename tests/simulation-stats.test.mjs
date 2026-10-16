import test from 'node:test';
import assert from 'node:assert/strict';
import * as rules from '../dist/engine.js';
import {runMatch,summary} from '../scripts/simulate.mjs';

const other=team=>team==='white'?'black':'white';
const mirror=([x,y])=>[rules.BOARD_WIDTH-1-x,rules.BOARD_HEIGHT-1-y];

// Keep both full squads. An outside-box defending king makes the seeded goal
// deterministic while the offside case adds an active attacking box knight.
function fixture(team,{offside=false,block=false,seed=1}={}){
  const state=rules.createGame({mode:'local',kickoff:team,seed}),enemy=other(team);
  const transform=pair=>team==='white'?pair:mirror(pair);
  const assigned={
    [`${team}-K`]:transform([8,16]),[`${enemy}-K`]:transform([10,3]),
    [`${team}-R1`]:transform([6,5]),[`${team}-P2`]:transform([1,16]),[`${team}-P3`]:transform([2,16]),
    [`${enemy}-P2`]:transform(offside?[3,4]:[1,0]),[`${enemy}-P3`]:transform(offside?[3,5]:[2,0]),
    ...(offside?{[`${team}-N1`]:transform([5,1])}:{}),
    ...(block?{[`${enemy}-N1`]:transform([6,3])}:{})
  };
  const occupied=new Set(Object.values(assigned).map(pair=>pair.join(',')));
  const parking=Array.from({length:9},(_,row)=>[[0,row+3],[rules.BOARD_WIDTH-1,row+3]]).flat().map(transform);
  for(const piece of state.pieces){const at=assigned[piece.id]||parking.find(pair=>!occupied.has(pair.join(',')));[piece.x,piece.y]=at;occupied.add(at.join(','));}
  const carrier=state.pieces.find(piece=>piece.id===`${team}-R1`);
  Object.assign(state,{phase:'kick',attack:team,ball:{x:carrier.x,y:carrier.y,carrierId:carrier.id},lastAction:null,restart:null,offside:null,pendingShot:null});
  return {state,goal:transform([6,-1]),pass:transform([6,4])};
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


for(const team of ['white','black'])for(const outcome of ['corner','blocked'])test(`${team} public simulation includes a defender-block ${outcome} in resolved shots`,()=>{
  // These first PRNG draws lie inside the final two disjoint shot intervals:
  // seed 1200 -> 0.7011... (block out), seed 1800 -> 0.9337... (block control).
  const {state,goal}=fixture(team,{block:true,seed:outcome==='corner'?1200:1800});
  const policy=game=>game.phase==='keeperReact'?{type:'skip'}:{type:'kick',x:goal[0],y:goal[1]};
  const match=simulate(state,policy,2),side=match.stats[team],resolved=match.events[1].result;
  assert.deepEqual(match.events.map(event=>event.result.type),['shotAttempt','blockedShot']);assert.equal(resolved.outcome,outcome);
  assert.equal(side.shots,1);assert.equal(side.resolvedShots,1);assert.equal(side.blockedShots,1);assert.equal(side.role.R.shots,1);
  assert.equal(side.completedOrdinaryRounds,1);assert.equal(side.goals,0);assert.equal(side.cornersWon,outcome==='corner'?1:0);
  assert.equal(match.stats[other(team)].blocks,1);assert.equal(match.stats[other(team)].blockPossessions,outcome==='blocked'?1:0);
  assert.equal(side.xG,resolved.shotModel.probability);assert.equal(side.shotXG.length,1);assert.equal(side.shotDistance,resolved.shotModel.distance);
  const aggregate=summary([match]);assert.equal(aggregate.totals.shots,1);assert.equal(aggregate.totals.resolvedShots,1);assert.equal(aggregate.totals.blockedShots,1);
  assert.equal(aggregate.totals.cornersWon,outcome==='corner'?1:0);
});

function ownGoalCatchFixture(team){
  const {state}=fixture(team,{seed:1500}),transform=pair=>team==='white'?pair:mirror(pair),king=state.pieces.find(piece=>piece.id===`${team}-K`),origin=transform([6,16]);
  [king.x,king.y]=origin;state.ball={x:king.x,y:king.y,carrierId:king.id};
  state.ballProgress={team,anchorY:transform([0,10])[1],rounds:2,pendingRelease:false,excludeRelease:false};
  return {state,target:transform([6,rules.BOARD_HEIGHT])};
}

for(const team of ['white','black'])test(`${team} public simulation resolves an own-goal catch wrapped by the stalling penalty`,()=>{
  const {state,target}=ownGoalCatchFixture(team),policy=game=>game.phase==='keeperReact'?{type:'skip'}:{type:'kick',x:target[0],y:target[1]},match=simulate(state,policy,2),side=match.stats[team];
  assert.deepEqual(match.events.map(event=>event.result.type),['shotAttempt','stalling']);
  const save=match.events[1].result.triggeringAction;assert.equal(save.type,'save');assert.equal(save.outcome,'saved');
  assert.equal(side.shots,1,'legacy harness shots count all submitted goal targets');assert.equal(side.ownGoalAttempts,1);assert.equal(side.opponentGoalAttempts,0);
  assert.equal(side.resolvedShots,1);assert.equal(side.resolvedOwnGoalAttempts,1);assert.equal(side.resolvedOpponentGoalAttempts,0);
  assert.equal(side.catches,1);assert.equal(side.stalls,1);assert.equal(side.completedOrdinaryRounds,1);assert.equal(side.goals,0);
  assert.equal(side.xG,save.shotModel.probability);assert.equal(side.ownGoalXG,save.shotModel.probability);assert.equal(side.opponentGoalXG,0);
});

test('public simulation can resolve an inherited pending own-goal catch without inventing a declaration',()=>{
  const {state,target}=ownGoalCatchFixture('white'),pending=rules.applyKick(state,...target),match=simulate(pending,()=>({type:'skip'}),1),side=match.stats.white;
  assert.equal(match.events[0].result.type,'stalling');assert.equal(match.events[0].result.triggeringAction.type,'save');
  assert.equal(side.shots,0);assert.equal(side.ownGoalAttempts,0);assert.equal(side.resolvedShots,1);assert.equal(side.resolvedOwnGoalAttempts,1);
  assert.equal(side.catches,1);assert.equal(side.stalls,1);assert.ok(side.ownGoalXG>0);assert.equal(side.opponentGoalXG,0);
});

test('public simulation does not treat a stalling-wrapped ordinary pass as a resolved shot',()=>{
  const {state}=fixture('white'),rook=state.pieces.find(piece=>piece.id==='white-R1'),receiver=state.pieces.find(piece=>piece.id==='white-R2');
  Object.assign(rook,{x:6,y:10});Object.assign(receiver,{x:8,y:10});state.ball={x:6,y:10,carrierId:rook.id};
  state.ballProgress={team:'white',anchorY:10,rounds:2,pendingRelease:false,excludeRelease:false};
  const match=simulate(state,()=>({type:'kick',x:8,y:10}),1),side=match.stats.white;
  assert.equal(match.events[0].result.type,'stalling');assert.equal(match.events[0].result.triggeringAction.type,'kick');
  assert.equal(side.passes,1);assert.equal(side.stalls,1);assert.equal(side.shots,0);assert.equal(side.resolvedShots,0);assert.equal(side.xG,0);
});

function backwardReleaseFixture(team,{loose=false}={}){
  const {state}=fixture(team,{seed:1000}),transform=pair=>team==='white'?pair:mirror(pair);
  const set=(suffix,point)=>Object.assign(state.pieces.find(piece=>piece.id===`${team}-${suffix}`),Object.fromEntries(['x','y'].map((key,index)=>[key,transform(point)[index]])));
  set('R1',[6,12]);set('K',loose?[6,15]:[7,16]);if(loose)set('Q',[5,13]);
  const source=transform([6,12]);state.ball={x:source[0],y:source[1],carrierId:`${team}-R1`};
  state.ballProgress={team,anchorY:source[1],rounds:0,pendingRelease:false,excludeRelease:false};
  return {state,transform};
}

for(const team of ['white','black'])test(`${team} public round accounting waits for distribution after a teammate own-goal catch`,()=>{
  const {state,transform}=backwardReleaseFixture(team);
  const policy=game=>{
    const target=transform(game.phase==='keeperReact'?[6,16]:game.phase==='keeperRelease'?[6,12]:[6,rules.BOARD_HEIGHT]);
    return game.phase==='keeperReact'?{type:'move',pieceId:`${team}-K`,x:target[0],y:target[1]}:{type:'kick',x:target[0],y:target[1]};
  };
  const caught=simulate(state,policy,2);assert.equal(caught.finalState.phase,'keeperRelease');assert.equal(caught.events[1].result.type,'save');
  assert.equal(caught.stats[team].resolvedOwnGoalAttempts,1);assert.equal(caught.stats[team].completedOrdinaryRounds,0,'a teammate catch defers the original round');
  const released=simulate(state,policy,3);assert.equal(released.events[2].result.type,'kick');assert.equal(released.finalState.ball.carrierId,`${team}-R1`);
  assert.equal(released.stats[team].completedOrdinaryRounds,1,'distribution completes exactly the original round');
});

for(const team of ['white','black'])test(`${team} a loose back-pass collection and forced release do not complete the counted round twice`,()=>{
  const {state,transform}=backwardReleaseFixture(team,{loose:true});
  const policy=game=>{
    const target=transform(game.phase==='keeperRelease'?[5,13]:[6,14]);
    return game.phase==='attackMove'?{type:'move',pieceId:`${team}-K`,x:target[0],y:target[1],freePawn:true}:{type:'kick',x:target[0],y:target[1]};
  };
  const collected=simulate(state,policy,2);assert.equal(collected.finalState.phase,'keeperRelease');assert.equal(collected.finalState.ballProgress.releaseAlreadyCounted,true);
  assert.equal(collected.stats[team].completedOrdinaryRounds,1);
  const released=simulate(state,policy,3);assert.equal(released.finalState.ball.carrierId,`${team}-Q`);assert.equal(released.finalState.ballProgress.releaseAlreadyCounted,undefined);
  assert.equal(released.stats[team].completedOrdinaryRounds,1,'release adds no second completion for the loose pass');
});

test('a counted loose back-pass released into another own-goal shot cannot add a second ordinary round',()=>{
  const {state,transform}=backwardReleaseFixture('white',{loose:true}),passed=rules.applyKick(state,...transform([6,14])),collected=rules.applyMove(passed,'white-K',...transform([6,14]),{freePawn:true});
  assert.equal(collected.ballProgress.releaseAlreadyCounted,true);collected.randomState=1500;
  const match=simulate(collected,game=>game.phase==='keeperReact'?{type:'skip'}:{type:'kick',x:6,y:rules.BOARD_HEIGHT},2);
  assert.deepEqual(match.events.map(event=>event.result.type),['shotAttempt','save']);assert.equal(match.events[1].result.outcome,'saved');
  assert.equal(match.stats.white.ownGoalAttempts,1);assert.equal(match.stats.white.resolvedOwnGoalAttempts,1);
  assert.equal(match.stats.white.completedOrdinaryRounds,0,'the inherited loose-pass round was already counted before this release');
});
