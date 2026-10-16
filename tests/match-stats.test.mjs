import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,applyKick,applyMove,skipMove,actionTimeout,legalKicks,legalMoves,BOARD_WIDTH,BOARD_HEIGHT,GOAL_FILES,BOX_FILES,BOX_DEPTH,canOccupySquare,normalizeGame,cornerTakers,selectCornerTaker} from '../dist/engine.js';
import {createMatchStats,restoreMatchStats,recordMatchTransition,addPossessionTime,matchStatsSummary,normalizeGoalOrigin} from '../dist/match-stats.js';

const clone=value=>structuredClone(value);
const other=team=>team==='white'?'black':'white';
const mirror=([x,y])=>[BOARD_WIDTH-1-x,BOARD_HEIGHT-1-y];

// Each scenario retains the full roster and keeps uninvolved players off the
// central passing/shooting lanes. Outcomes use the engine's supported test rolls.
function fixture({team='white',carrier=`${team}-R1`,positions={},phase='kick',score={white:0,black:0}}={}){
  const state=createGame({mode:'local',kickoff:team,seed:1604});
  const transform=pair=>team==='white'?pair:mirror(pair);
  const assigned={'white-K':[8,16],'black-K':[8,0],'white-P2':[1,16],'white-P3':[2,16],'black-P2':[1,0],'black-P3':[2,0],[carrier]:transform([6,5]),...positions};
  const used=new Set(Object.values(assigned).map(at=>at.join(',')));
  assert.equal(used.size,Object.keys(assigned).length,'fixture assignments do not overlap');
  const parking=Array.from({length:BOARD_HEIGHT},(_,y)=>[[0,y],[BOARD_WIDTH-1,y]]).flat();
  for(const piece of state.pieces){
    const at=assigned[piece.id]||parking.find(pair=>!used.has(pair.join(',')));
    assert.ok(at,`parking for ${piece.id}`);
    [piece.x,piece.y]=at;used.add(at.join(','));
  }
  for(const piece of state.pieces){
    assert.ok(piece.x>=0&&piece.x<BOARD_WIDTH&&piece.y>=0&&piece.y<BOARD_HEIGHT,`${piece.id} is on the expanded pitch`);
    assert.ok(canOccupySquare(piece,piece.x,piece.y),`${piece.id} respects the current box eligibility rule`);
  }
  const owner=state.pieces.find(piece=>piece.id===carrier);
  Object.assign(state,{phase,attack:team,score:{...score},ball:{x:owner.x,y:owner.y,carrierId:carrier},restart:null,offside:null,pendingShot:null,lastAction:null});
  return state;
}

function tracked(state,stats=createMatchStats()){
  return {
    state,stats,
    step(next,options={}){
      const previousState=this.state,previousStats=this.stats;
      const unchanged=JSON.stringify({previousState,previousStats});
      this.stats=recordMatchTransition(previousStats,previousState,next,options);
      assert.equal(JSON.stringify({previousState,previousStats}),unchanged,'recording preserves the undo snapshot');
      this.state=next;
      return this;
    },
    ready(){
      if(this.state.phase==='cornerSelect')this.step(selectCornerTaker(this.state,cornerTakers(this.state)[0].id));
      for(let count=0;['attackMove','defendMove'].includes(this.state.phase)&&count<3;count++)this.step(skipMove(this.state));
      assert.ok(['kick','keeperRelease'].includes(this.state.phase),`ready to kick, received ${this.state.phase}`);
      return this;
    },
    kick(x,y,options={}){return this.step(applyKick(this.state,x,y,options));},
    shoot(x=6,y=-1,roll=0){
      this.ready();this.kick(x,y);assert.equal(this.state.phase,'keeperReact');
      return this.step(skipMove(this.state,{roll}),{matchSeconds:75});
    }
  };
}

function assisted({team='white',toSpace=false,provider='R2',scorer='R1'}={}){
  const transform=pair=>team==='white'?pair:mirror(pair),carrier=`${team}-${provider}`;
  const positions={[carrier]:transform([6,9]),[`${team}-${scorer}`]:transform(toSpace?[8,5]:[6,5])};
  const run=tracked(fixture({team,carrier,positions}));
  const [x,y]=transform([6,5]);run.kick(x,y,{roll:0});
  if(toSpace){
    assert.equal(run.state.ball.carrierId,null);
    assert.ok(legalMoves(run.state,`${team}-${scorer}`).some(move=>move.x===x&&move.y===y));
    run.step(applyMove(run.state,`${team}-${scorer}`,x,y));
  }
  return run;
}

function assertNoAccuracy(value){
  assert.equal(/pass.?accuracy/i.test(JSON.stringify(value)),false,'match statistics never invent pass accuracy');
}

test('restoration drops an assist candidate whose receiver no longer controls the ball',()=>{
  const run=assisted(),saved=clone(run.stats),changed=clone(run.state);
  const queen=changed.pieces.find(piece=>piece.id==='white-Q');
  changed.ball={x:queen.x,y:queen.y,carrierId:queen.id};
  assert.equal(saved.lastPass.receiverId,'white-R1');
  assert.equal(restoreMatchStats(saved,changed).lastPass,null);
  assert.equal(restoreMatchStats(saved,run.state).lastPass.receiverId,'white-R1','a valid saved assist survives');
});

test('new match statistics begin complete with zero counts and no possession percentage',()=>{
  const stats=createMatchStats(),summary=matchStatsSummary(stats);
  assert.equal(stats.version,2);assert.deepEqual(stats.pitch,{width:14,height:17});assert.equal(stats.partial,false);assert.deepEqual(stats.goals,[]);
  for(const team of ['white','black']){
    assert.deepEqual(stats.teams[team],{shots:0,onTarget:0,corners:0,possessionMs:0,fouls:0,yellowCards:0,redCards:0});
    assert.equal(summary.teams[team].possessionPercent,null);
  }
  assertNoAccuracy(stats);assertNoAccuracy(summary);
});

for(const team of ['white','black'])test(`${team} declared shot and actual goal count once with stable scorer ID`,()=>{
  const run=tracked(fixture({team}));
  const [x,y]=team==='white'?[6,-1]:[7,17];
  run.kick(x,y);
  assert.equal(run.stats.teams[team].shots,1);
  assert.equal(run.stats.teams[team].onTarget,0,'an unresolved shot is not yet on target');
  assert.equal(run.stats.goals.length,0);
  run.step(skipMove(run.state,{roll:0}),{matchSeconds:75});
  assert.equal(run.state.lastAction.type,'goal');
  assert.equal(run.stats.teams[team].shots,1);assert.equal(run.stats.teams[team].onTarget,1);
  assert.equal(run.stats.goals.length,1);
  assert.deepEqual(run.stats.goals[0],{team,scorerId:`${team}-R1`,assistId:null,ownGoal:false,turn:run.state.turn,matchSeconds:75,origin:team==='white'?{x:6,y:5}:{x:7,y:11},target:{x,y},distance:5.5});
  const otherTeam=other(team),kickoff=legalKicks(run.state).find(kick=>!kick.goal&&kick.accuracy===1&&kick.receiverId?.startsWith(`${otherTeam}-`));
  run.kick(kickoff.x,kickoff.y,{roll:0});run.ready();
  assert.equal(run.stats.teams[team].shots,1,'repositioning and next kickoff do not repeat the goal');
  assert.equal(run.stats.goals.length,1);assert.equal(run.stats.teams[otherTeam].shots,0);
});

test('a caught save is one shot on target and no corner or goal',()=>{
  const run=tracked(fixture({positions:{'black-K':[6,0]}}));run.kick(6,-1);
  const model=run.state.lastAction.shotModel;
  assert.ok(model.caughtSaveProbability>0);
  run.step(skipMove(run.state,{roll:model.probability+model.cornerProbability+model.caughtSaveProbability/2}));
  assert.equal(run.state.lastAction.type,'save');assert.equal(run.state.lastAction.outcome,'saved');
  assert.equal(run.stats.teams.white.shots,1);assert.equal(run.stats.teams.white.onTarget,1);
  assert.equal(run.stats.teams.white.corners,0);assert.equal(run.stats.goals.length,0);
});

test('a parried shot awards one attacking corner, never a second shot during restart setup',()=>{
  const run=tracked(fixture({positions:{'black-K':[6,0]}}));run.kick(6,-1);
  const model=run.state.lastAction.shotModel;assert.ok(model.cornerProbability>0);
  run.step(skipMove(run.state,{roll:model.probability+model.cornerProbability/2}));
  assert.equal(run.state.lastAction.type,'save');assert.equal(run.state.restart.type,'corner');
  assert.equal(run.stats.teams.white.shots,1);assert.equal(run.stats.teams.white.onTarget,1);assert.equal(run.stats.teams.white.corners,1);
  run.ready();
  assert.equal(run.stats.teams.white.corners,1,'a protected repositioning round is not another award');
  const kick=legalKicks(run.state).find(candidate=>!candidate.goal&&candidate.accuracy===1&&!candidate.offside);
  run.kick(kick.x,kick.y,{roll:0});
  assert.equal(run.stats.teams.white.corners,1,'taking the corner is not another corner');
  assert.equal(run.stats.teams.white.shots,1);
});

test('an actual wide shot is a shot but is not on target or a corner',()=>{
  const run=tracked(fixture());run.kick(6,-1);run.step(skipMove(run.state,{roll:.999999}));
  assert.equal(run.state.lastAction.type,'shotMiss');assert.equal(run.state.restart.type,'goalKick');
  assert.deepEqual({...run.stats.teams.white,possessionMs:0},{shots:1,onTarget:0,corners:0,possessionMs:0,fouls:0,yellowCards:0,redCards:0});
  assert.equal(run.stats.goals.length,0);
});

for(const team of ['white','black'])test(`${team} long pass over its own end line awards the opponent a corner without a shot`,()=>{
  const transform=pair=>team==='white'?pair:mirror(pair),carrier=`${team}-R1`;
  const run=tracked(fixture({team,carrier,positions:{[carrier]:transform([2,1])}}));
  const [x,y]=transform([2,15]),[lx,ly]=transform([2,19]);
  run.kick(x,y,{roll:.999999,landing:{x:lx,y:ly}});
  assert.equal(run.state.lastAction.type,'out');assert.equal(run.state.restart.type,'corner');
  assert.equal(run.stats.teams[other(team)].corners,1);
  assert.equal(run.stats.teams[team].shots,0);assert.equal(run.stats.teams[other(team)].shots,0);
});

for(const team of ['white','black'])for(const toSpace of [false,true])test(`${team} accurate ${toSpace?'pass into space and teammate collection':'direct pass'} earns one assist through positioning`,()=>{
  const run=assisted({team,toSpace});const [x,y]=team==='white'?[6,-1]:[7,17];
  run.shoot(x,y);
  assert.equal(run.stats.goals[0].scorerId,`${team}-R1`);assert.equal(run.stats.goals[0].assistId,`${team}-R2`);
  assert.equal(run.stats.pendingShot,null);
});

test('the latest accurate teammate pass receives the assist; earlier providers do not',()=>{
  const run=tracked(fixture({carrier:'white-Q',positions:{'white-Q':[10,9],'white-R2':[6,9],'white-R1':[6,5]}}));
  run.kick(6,9,{roll:0});run.ready();run.kick(6,5,{roll:0});run.shoot();
  assert.equal(run.stats.goals[0].assistId,'white-R2');
});

test('the receiver may dribble before scoring without losing a valid assist',()=>{
  const run=assisted();run.step(applyMove(run.state,'white-R1',6,3));run.shoot();
  assert.equal(run.stats.goals[0].assistId,'white-R2');
});

test('a collected self pass never creates an assist',()=>{
  const run=tracked(fixture());run.kick(6,4,{roll:0});
  assert.equal(run.state.ball.carrierId,null);run.step(applyMove(run.state,'white-R1',6,4));
  assert.equal(run.state.lastAction.selfPassCollection,true);run.shoot();
  assert.equal(run.stats.goals[0].assistId,null);
});

test('an inaccurate long pass collected by a teammate is not an assist',()=>{
  const run=tracked(fixture({carrier:'white-R2',positions:{'white-R2':[6,13],'white-R1':[8,5]}}));
  run.kick(6,2,{roll:.999999,landing:{x:6,y:5}});assert.equal(run.state.lastAction.type,'miss');
  run.step(applyMove(run.state,'white-R1',6,5));run.shoot();
  assert.equal(run.stats.goals[0].assistId,null);
});

test('an inaccurate pass landing directly on the scorer does not create an assist',()=>{
  const run=tracked(fixture({carrier:'white-R2',positions:{'white-R2':[6,13],'white-R1':[8,5]}}));
  run.kick(6,2,{roll:.999999,landing:{x:8,y:5}});assert.equal(run.state.lastAction.type,'miss');
  assert.equal(run.state.ball.carrierId,'white-R1');
  // The rook first carries onto a goal file; a fortunate scatter still is not an assist.
  run.step(applyMove(run.state,'white-R1',6,5));run.shoot();
  assert.equal(run.stats.goals[0].assistId,null);
});

test('losing and regaining the ball clears the prior assist provider',()=>{
  const run=tracked(fixture({carrier:'white-R2',positions:{'white-R2':[6,9],'white-R1':[6,5],'black-R1':[8,5]}}));
  run.kick(6,5,{roll:0});run.ready();run.kick(8,5,{roll:0});assert.equal(run.state.lastAction.type,'interception');
  run.ready();run.kick(6,5,{roll:0});assert.equal(run.state.lastAction.type,'interception');
  run.shoot();assert.equal(run.stats.goals[0].assistId,null);
});

test('a restart clears the assist chain even before the restart is taken',()=>{
  const run=assisted();assert.ok(run.stats.lastPass);
  run.step(actionTimeout(run.state));assert.equal(run.state.restart.type,'timeout');
  assert.equal(run.stats.lastPass,null);assert.equal(run.stats.pendingShot,null);
});

test('a saved shot clears the previous assist, so a later regained ball is a new attack',()=>{
  const run=assisted();
  const king=run.state.pieces.find(piece=>piece.id==='black-K');
  // The fixture already has the keeper inside its box, away from this ray.
  assert.ok(king.y<=1);run.ready();run.kick(6,-1);
  const model=run.state.lastAction.shotModel;
  assert.ok(model.caughtSaveProbability>0);
  run.step(skipMove(run.state,{roll:model.probability+model.cornerProbability+model.caughtSaveProbability/2}));
  assert.equal(run.state.lastAction.outcome,'saved');assert.equal(run.stats.lastPass,null);assert.equal(run.stats.pendingShot,null);
});

test('own goals identify the responsible piece and scoring side without awarding an assist',()=>{
  const run=tracked(fixture({positions:{'white-R1':[6,12]}}));run.kick(6,17);
  run.step(skipMove(run.state,{roll:0}),{matchSeconds:90});
  assert.equal(run.state.lastAction.ownGoal,true);
  assert.deepEqual(run.stats.goals[0],{team:'black',scorerId:'white-R1',assistId:null,ownGoal:true,turn:run.state.turn,matchSeconds:90,origin:{x:6,y:12},target:{x:6,y:17},distance:4.5});
  assert.equal(run.stats.teams.black.shots,0,'own goals are not invented opposing shots');
  assert.equal(run.stats.teams.white.shots,0,'deliberate own-goal targets do not inflate attacking shots');
  assert.equal(run.stats.teams.white.onTarget,0);assert.deepEqual(matchStatsSummary(run.stats).scorers,[]);
});

test('separate pieces of the same type retain distinct goal identities',()=>{
  const first=tracked(fixture());first.shoot();
  const second=tracked(fixture({carrier:'white-R2',score:first.state.score}),first.stats);second.shoot();
  assert.deepEqual(second.stats.goals.map(goal=>goal.scorerId),['white-R1','white-R2']);
  assert.equal(second.stats.teams.white.shots,2);assert.equal(second.stats.teams.white.onTarget,2);
  assertNoAccuracy(matchStatsSummary(second.stats));
});

test('possession accrues elapsed controlled-ball time for the attacker, including opponent thinking time',()=>{
  const state=fixture({phase:'attackMove'}),before=clone(state),stats=createMatchStats();
  const white=addPossessionTime(stats,state,3000),defending=skipMove(state),next=addPossessionTime(white,defending,1000);
  assert.equal(defending.phase,'defendMove');assert.equal(next.teams.white.possessionMs,4000);assert.equal(next.teams.black.possessionMs,0);
  const black=fixture({team:'black',phase:'attackMove'}),combined=addPossessionTime(next,black,1000),summary=matchStatsSummary(combined);
  assert.equal(summary.teams.white.possessionPercent,80);assert.equal(summary.teams.black.possessionPercent,20);
  assert.equal(stats.teams.white.possessionMs,0);assert.deepEqual(state,before);
});

test('kickoffs, protected restarts and finished games do not accrue possession',()=>{
  const base=fixture({phase:'attackMove'}),stats=createMatchStats(),cases=[];
  cases.push(createGame({seed:1}));
  cases.push({...clone(base),restart:{type:'corner',team:'white',takerId:'white-R1'}});
  cases.push({...clone(base),phase:'finished'});
  for(const state of cases){const next=addPossessionTime(stats,state,2000);assert.deepEqual(next.teams,stats.teams,`${state.phase}/${state.restart?.type||'open'} is neutral elapsed time`);}
  for(const elapsed of [0,-1,NaN,Infinity])assert.deepEqual(addPossessionTime(stats,base,elapsed).teams,stats.teams);
});

test('loose passes and shot flight retain the attacking team possession until opponent control',()=>{
  const state=fixture({phase:'attackMove'}),stats=createMatchStats();
  const loose={...clone(state),ball:{...state.ball,carrierId:null}};
  const shot=applyKick({...clone(state),phase:'kick'},6,-1);
  const next=addPossessionTime(addPossessionTime(stats,loose,2000),shot,1000);
  assert.equal(next.teams.white.possessionMs,3000);assert.equal(next.teams.black.possessionMs,0);
});

test('statistics and a pending assist survive a JSON save/reload and cloned undo snapshot',()=>{
  const run=assisted(),saved=clone(run.stats),serialized=JSON.stringify(run.stats);
  const restored=restoreMatchStats(JSON.parse(serialized),run.state);
  assert.deepEqual(restored,run.stats);
  const resumed=tracked(clone(run.state),restored);resumed.shoot();
  assert.equal(resumed.stats.goals[0].assistId,'white-R2');assert.equal(saved.goals.length,0);
  const undoStats=restoreMatchStats(saved,run.state);assert.deepEqual(undoStats,saved,'undo can restore the event ledger before a goal');
  assert.equal(undoStats.goals.length,0);
});

test('a pending shot remains one shot after a JSON save/reload before keeper reaction',()=>{
  const run=assisted();run.ready();run.kick(6,-1);
  const saved=restoreMatchStats(JSON.parse(JSON.stringify(run.stats)),run.state);
  assert.equal(saved.teams.white.shots,1);
  const resumed=tracked(clone(run.state),saved);resumed.step(skipMove(resumed.state,{roll:0}));
  assert.equal(resumed.stats.teams.white.shots,1);assert.equal(resumed.stats.teams.white.onTarget,1);
  assert.equal(resumed.stats.goals[0].assistId,'white-R2');
});

test('legacy saves report partial tracking and preserve the known score as a baseline',()=>{
  const game=fixture({score:{white:2,black:1}}),stats=restoreMatchStats(null,game);
  assert.equal(stats.partial,true);assert.deepEqual(stats.baselineScore,{white:2,black:1});
  assert.equal(stats.goals.length,0);assert.equal(stats.teams.white.shots,0);
  const next=tracked(game,stats);next.shoot();
  assert.equal(next.stats.partial,true);assert.equal(next.stats.goals.length,1);
  assert.deepEqual(next.stats.baselineScore,{white:2,black:1});
});

test('malformed statistics cannot inject unknown players, impossible counts, or invalid elapsed time',()=>{
  const run=assisted();run.shoot();
  const cases=[
    value=>value.version=9,
    value=>value.teams.white.shots=-1,
    value=>value.teams.black.possessionMs=Infinity,
    value=>value.teams.white.onTarget=value.teams.white.shots+1,
    value=>value.goals[0].scorerId='white-R9',
    value=>value.goals[0].assistId='black-Q',
    value=>value.goals[0].assistId=value.goals[0].scorerId,
    value=>value.goals[0].team='orange',
  ];
  for(const mutate of cases){const invalid=clone(run.stats);mutate(invalid);const restored=restoreMatchStats(invalid,run.state);assert.equal(restored.partial,true);assert.equal(restored.goals.length,0);}
});


test('goal and assist summary aggregates counts by individual stable IDs',()=>{
  const first=assisted();first.shoot();
  // Track the second pass again from its genuine source state, retaining the prior ledger.
  const source=fixture({carrier:'white-R2',score:first.state.score,positions:{'white-R2':[6,9],'white-R1':[6,5]}});
  const run=tracked(source,first.stats);run.kick(6,5,{roll:0});run.shoot();
  const third=tracked(fixture({carrier:'white-R2',score:run.state.score}),run.stats);third.shoot();
  const summary=matchStatsSummary(third.stats);
  assert.deepEqual(summary.scorers,[{team:'white',pieceId:'white-R1',count:2},{team:'white',pieceId:'white-R2',count:1}]);
  assert.deepEqual(summary.assists,[{team:'white',pieceId:'white-R2',count:2}]);
  assert.equal(summary.goals.length,3);assert.equal(summary.goals[2].assistId,null);
});

for(const outcome of ['goal','saved','wide'])test(`a legacy save during keeper reaction remains internally valid after ${outcome}`,()=>{
  const state=fixture({positions:{'black-K':[6,0]}}),pending=applyKick(state,6,-1),model=pending.lastAction.shotModel;
  const roll=outcome==='goal'?0:outcome==='saved'?model.probability+model.cornerProbability+model.caughtSaveProbability/2:.999999;
  const partial=restoreMatchStats(null,pending),run=tracked(pending,partial);
  run.step(skipMove(pending,{roll}));
  assert.equal(run.stats.partial,true);
  assert.ok(run.stats.teams.white.shots>=run.stats.teams.white.onTarget,'known on-target shots are included in shots');
  const restored=restoreMatchStats(JSON.parse(JSON.stringify(run.stats)),run.state);
  assert.deepEqual(restored,run.stats,'reloading does not discard a valid partial ledger');
});

test('an offside intervention aborts the attempted shot without inventing a shot statistic',()=>{
  const run=tracked(fixture({positions:{'white-N1':[5,1],'black-P2':[3,4],'black-P3':[4,5]}}));
  run.kick(6,-1);assert.equal(run.state.lastAction.type,'offside');
  assert.equal(run.stats.teams.white.shots,0);assert.equal(run.stats.teams.white.onTarget,0);
  assert.equal(run.stats.lastPass,null);assert.equal(run.stats.pendingShot,null);
});

test('an evaded tackle preserves the valid assist to a knight that then scores',()=>{
  const run=tracked(fixture({carrier:'white-Q',positions:{'white-Q':[4,5],'white-N1':[4,1],'black-N1':[2,2]}}));
  run.kick(4,1,{roll:0});run.step(skipMove(run.state));
  assert.equal(run.state.phase,'defendMove');
  const tackle=legalMoves(run.state,'black-N1').find(move=>move.type==='tackle');assert.ok(tackle);
  run.step(applyMove(run.state,'black-N1',tackle.x,tackle.y,{roll:.999999}));
  assert.equal(run.state.lastAction.type,'tackleMiss');
  run.shoot(5,-1);assert.equal(run.stats.goals[0].assistId,'white-Q');
});

test('the goalkeeper can earn an assist through its mandatory immediate back-pass release',()=>{
  const run=tracked(fixture({carrier:'white-Q',positions:{'white-Q':[5,13],'white-R1':[8,6]}}));
  run.kick(8,16,{roll:0});assert.equal(run.state.phase,'keeperRelease');
  run.kick(8,6,{roll:0});run.shoot(8,-1);
  assert.equal(run.stats.goals[0].scorerId,'white-R1');assert.equal(run.stats.goals[0].assistId,'white-K');
});


for(const team of ['white','black'])test(`${team} goal records the actual declaration origin through a keeper reaction and kickoff reset`,()=>{
  const run=tracked(fixture({team})),origin={x:run.state.ball.x,y:run.state.ball.y};
  const [x,y]=team==='white'?[6,-1]:[7,17];
  run.kick(x,y);const pending=clone(run.state),declaredStats=clone(run.stats),distance=pending.lastAction.shotModel.distance;
  assert.deepEqual(run.stats.pendingShot.origin,origin);assert.deepEqual(run.stats.pendingShot.target,{x,y});
  assert.equal(run.stats.pendingShot.distance,distance);
  const keeperId=`${other(team)}-K`,reaction=legalMoves(pending,keeperId).find(move=>move.x===7&&move.y===(team==='white'?1:15));assert.ok(reaction);
  run.step(applyMove(pending,keeperId,reaction.x,reaction.y,{roll:0}));assert.equal(run.state.lastAction.type,'goal');
  assert.deepEqual(run.stats.goals[0].origin,origin);assert.deepEqual(run.stats.goals[0].target,{x,y});assert.equal(run.stats.goals[0].distance,distance);
  const scorer=run.state.pieces.find(piece=>piece.id===`${team}-R1`);
  assert.notDeepEqual({x:scorer.x,y:scorer.y},origin,'kickoff formation is not recorded as the scoring location');
  assert.deepEqual(declaredStats.pendingShot.origin,origin,'recording does not mutate the pending undo snapshot');
});

test('a goal after a dribble uses the final shooting square rather than the pass receiving square',()=>{
  const run=assisted();run.step(applyMove(run.state,'white-R1',6,3));run.shoot();
  assert.deepEqual(run.stats.goals[0].origin,{x:6,y:3});assert.equal(run.stats.goals[0].distance,3.5);
  assert.equal(run.stats.goals[0].assistId,'white-R2');
});

test('own-goal origin and target remain actual pitch coordinates and normalize toward the credited goal',()=>{
  const run=tracked(fixture({positions:{'white-R1':[6,12]}}));run.shoot(6,17);
  const goal=run.stats.goals[0];assert.equal(goal.team,'black');assert.equal(goal.ownGoal,true);
  assert.deepEqual(goal.origin,{x:6,y:12});assert.deepEqual(goal.target,{x:6,y:17});
  assert.deepEqual(normalizeGoalOrigin(goal),{x:7,y:4});
});

test('mirrored goals normalize to the same attacking position without mutating the goal records',()=>{
  const white=tracked(fixture());white.shoot();const black=tracked(fixture({team:'black'}));black.shoot(7,17);
  const before=JSON.stringify([white.stats,black.stats]);
  assert.deepEqual(normalizeGoalOrigin(white.stats.goals[0]),{x:6,y:5});
  assert.deepEqual(normalizeGoalOrigin(black.stats.goals[0]),{x:6,y:5});
  assert.equal(JSON.stringify([white.stats,black.stats]),before);
  assert.equal(normalizeGoalOrigin({...white.stats.goals[0],origin:null}),null);
});

test('current-pitch recorded goals without location fields remain unmapped rather than using kickoff positions',()=>{
  const run=assisted();run.shoot();const saved=clone(run.stats);
  for(const key of ['origin','target','distance'])delete saved.goals[0][key];
  const restored=restoreMatchStats(saved,run.state),goal=restored.goals[0];
  assert.equal(restored.partial,false);assert.equal(restored.goals.length,1);assert.equal(goal.assistId,'white-R2');
  assert.equal(goal.origin,null);assert.equal(goal.target,null);assert.equal(goal.distance,null);
  assert.equal(normalizeGoalOrigin(goal),null);
});

test('invalid saved goal-location fields are dropped individually without discarding counters or goals',()=>{
  const run=assisted();run.shoot();
  const cases=[
    ['origin',{x:-1,y:5}],['origin',{x:14,y:5}],['origin',{x:6,y:17}],['origin',{x:4.5,y:5}],['origin',{x:NaN,y:5}],['origin',{x:'4',y:5}],
    ['target',{x:3,y:-1}],['target',{x:6,y:0}],['target',{x:7.5,y:-1}],['target',{x:4,y:16}],
    ['distance',-1],['distance',Infinity],['distance','5.5']
  ];
  for(const [field,value] of cases){
    const saved=clone(run.stats);saved.goals[0][field]=value;const before=clone(saved),restored=restoreMatchStats(saved,run.state);
    assert.deepEqual(saved,before,'restoration never repairs the original saved object in place');
    assert.equal(restored.partial,false);assert.deepEqual(restored.teams,run.stats.teams);assert.equal(restored.goals.length,1);
    assert.equal(restored.goals[0][field],field==='distance'?5.5:null,`${field} rejects ${JSON.stringify(value)}`);
    assert.equal(restored.goals[0].assistId,'white-R2');
  }
});

test('pending shot location survives JSON restoration and missing legacy metadata uses known declaration evidence',()=>{
  const run=assisted();run.ready();run.kick(6,-1);const saved=clone(run.stats);
  let restored=restoreMatchStats(JSON.parse(JSON.stringify(saved)),run.state);assert.deepEqual(restored.pendingShot,saved.pendingShot);
  for(const field of ['origin','target','distance'])delete saved.pendingShot[field];
  restored=restoreMatchStats(saved,run.state);
  assert.deepEqual(restored.pendingShot.origin,run.state.pendingShot.from);
  const resumed=tracked(clone(run.state),restored);resumed.step(skipMove(resumed.state,{roll:0}));
  assert.deepEqual(resumed.stats.goals[0].origin,{x:6,y:5});assert.equal(resumed.stats.goals[0].distance,5.5);
});

test('goal-map summaries clone locations and restoring an undo snapshot removes the undone marker',()=>{
  const run=assisted(),undoGame=clone(run.state),undoStats=clone(run.stats);run.shoot();
  const summary=matchStatsSummary(run.stats);assert.equal(summary.goals.length,1);summary.goals[0].origin.x=9;
  assert.deepEqual(run.stats.goals[0].origin,{x:6,y:5},'map rendering cannot alter the event ledger');
  assert.equal(matchStatsSummary(run.stats).goals.length,1,'repeated summaries do not append markers');
  const undone=restoreMatchStats(undoStats,undoGame);assert.equal(undone.goals.length,0);
  const replayed=tracked(undoGame,undone);replayed.shoot();assert.equal(replayed.stats.goals.length,1,'resolving after undo adds exactly one current goal');
});


test('unmapped goals reject invalid stored distances while valid geometry recomputes physical distance',()=>{
  const run=tracked(fixture());run.shoot();
  for(const distance of [-1,0,Infinity,NaN,21,'5.5']){
    const saved=clone(run.stats);saved.goals[0].origin=null;saved.goals[0].target=null;saved.goals[0].distance=distance;
    const restored=restoreMatchStats(saved,run.state);assert.equal(restored.goals[0].distance,null);
  }
  const saved=clone(run.stats);saved.goals[0].distance=19;
  const restored=restoreMatchStats(saved,run.state);assert.equal(restored.goals[0].distance,5.5,'goal plane is half a square beyond the pitch');
});

test('location-zone totals classify actual goals and identify unknown legacy origins',()=>{
  let stats=createMatchStats(),score={white:0,black:0},lastGame;
  const goals=[
    {carrier:'white-R1',origin:[6,BOX_DEPTH+3],target:[6,-1]},
    {carrier:'white-R1',origin:[6,BOX_DEPTH],target:[6,-1]},
    {carrier:'white-N1',origin:[6,1],target:[7,-1]},
    {carrier:'white-B1',origin:[3,2],target:[6,-1]}
  ];
  for(const {carrier,origin,target} of goals){
    const run=tracked(fixture({carrier,positions:{[carrier]:origin},score}),stats);run.shoot(...target);
    stats=run.stats;score=run.state.score;lastGame=run.state;
  }
  const summary=matchStatsSummary(stats);
  assert.equal(summary.goalLocations.known,4);assert.equal(summary.goalLocations.unknown,0);
  assert.deepEqual(summary.goalLocations.zones,{box:1,central:1,wide:1,distant:1});
  assert.deepEqual(summary.goalLocations.byTeam.white.zones,summary.goalLocations.zones);
  assert.equal(summary.goalLocations.byTeam.black.known,0);
  const saved=clone(stats);delete saved.goals[0].origin;
  const legacy=matchStatsSummary(restoreMatchStats(saved,lastGame));
  assert.equal(legacy.goalLocations.known,3);assert.equal(legacy.goalLocations.unknown,1);
  assert.equal(legacy.goalLocations.zones.distant,0);
});

test('statistics schema records the pitch and refuses to reinterpret old-pitch records',()=>{
  const run=tracked(fixture());run.shoot();
  assert.deepEqual(run.stats.pitch,{width:BOARD_WIDTH,height:BOARD_HEIGHT});assert.equal(run.stats.version,2);
  for(const mutate of [value=>value.version=1,value=>value.pitch={width:12,height:15},value=>delete value.pitch]){
    const saved=clone(run.stats);mutate(saved);const restored=restoreMatchStats(saved,run.state);
    assert.equal(restored.partial,true);assert.equal(restored.goals.length,0);
    assert.deepEqual(restored.baselineScore,run.state.score,'the old score remains known without inventing goal locations');
    assert.equal(matchStatsSummary(restored).goalLocations.unknown,1);
  }
});

test('new-pitch far-edge coordinates survive restoration while the next file and rank are rejected',()=>{
  const run=tracked(fixture());run.shoot();const saved=clone(run.stats);
  saved.goals[0].origin={x:13,y:16};
  const restored=restoreMatchStats(saved,run.state);assert.deepEqual(restored.goals[0].origin,{x:13,y:16});
  assert.deepEqual(normalizeGoalOrigin({...restored.goals[0],team:'black'}),{x:0,y:0});
  for(const origin of [{x:14,y:16},{x:13,y:17}]){
    const malformed=clone(saved);malformed.goals[0].origin=origin;
    assert.equal(restoreMatchStats(malformed,run.state).goals[0].origin,null);
  }
});

for(const team of ['white','black'])for(const x of [4,9])test(`${team} goal from box wing file ${x} maps inside the six-file box`,()=>{
  const transform=point=>team==='white'?point:mirror(point),carrier=`${team}-N1`,origin=transform([x,1]),target=transform([x===4?5:8,-1]);
  const run=tracked(fixture({team,carrier,positions:{[carrier]:origin}}));run.shoot(...target);
  assert.deepEqual(normalizeGoalOrigin(run.stats.goals[0]),{x,y:1});
  const locations=matchStatsSummary(run.stats).goalLocations;
  assert.equal(locations.zones.box,1);assert.equal(locations.zones.wide,0);
  assert.equal(GOAL_FILES.includes(x),false,'these extra box files are outside the four-file goal');
});

for(const team of ['white','black'])for(const outcome of ['corner','blocked'])test(`${team} defender-block ${outcome} resolves one shot without an on-target shot or assist`,()=>{
  const enemy=other(team),transform=point=>team==='white'?point:mirror(point),carrier=`${team}-R2`,blockerId=`${enemy}-N1`;
  const run=tracked(fixture({team,carrier,positions:{
    [carrier]:transform([6,9]),[`${team}-R1`]:transform([6,5]),[blockerId]:transform([6,3])
  }}));
  const receiver=transform([6,5]),target=transform([6,-1]);
  run.kick(...receiver,{roll:0});run.ready();run.kick(...target);
  assert.equal(run.state.phase,'keeperReact');assert.equal(run.stats.teams[team].shots,1);
  assert.equal(run.stats.pendingShot.assistId,`${team}-R2`,'the build-up has a valid potential assist before the block');
  const model=run.state.lastAction.shotModel;
  assert.ok(model.blockCornerProbability>0);assert.ok(model.blockPossessionProbability>0);
  assert.ok(Math.abs(model.probability+model.saveProbability+model.missProbability+model.blockProbability-1)<1e-10);
  const blockStart=model.probability+model.saveProbability+model.missProbability;
  const roll=outcome==='corner'?blockStart+model.blockCornerProbability/2:blockStart+model.blockCornerProbability+model.blockPossessionProbability/2;
  const declaredGame=clone(run.state),declaredStats=clone(run.stats);
  run.step(skipMove(run.state,{roll}));
  assert.equal(run.state.lastAction.type,'blockedShot');assert.equal(run.state.lastAction.outcome,outcome);assert.equal(run.state.lastAction.blockerId,blockerId);
  assert.equal(run.stats.teams[team].shots,1);assert.equal(run.stats.teams[team].onTarget,0);
  assert.equal(run.stats.teams[team].corners,outcome==='corner'?1:0);assert.equal(run.stats.teams[enemy].shots,0);
  assert.equal(run.stats.goals.length,0);assert.equal(run.stats.pendingShot,null);assert.equal(run.stats.lastPass,null);
  assert.deepEqual(matchStatsSummary(run.stats).assists,[]);
  if(outcome==='corner'){
    assert.equal(run.state.restart.type,'corner');assert.equal(run.state.restart.team,team);
    run.ready();assert.equal(run.stats.teams[team].corners,1,'repositioning does not duplicate the corner');
  }else{
    assert.equal(run.state.ball.carrierId,blockerId);assert.equal(run.state.attack,enemy);
  }
  const restored=restoreMatchStats(JSON.parse(JSON.stringify(run.stats)),run.state);assert.deepEqual(restored,run.stats);
  const snapshot=JSON.stringify(run.stats);matchStatsSummary(run.stats);matchStatsSummary(run.stats);
  assert.equal(JSON.stringify(run.stats),snapshot,'replaying or rendering statistics cannot add another block event');
  // Undo restores the declaration ledger, and a second resolution replaces the
  // undone result rather than retaining the old corner or adding another shot.
  const undone=restoreMatchStats(declaredStats,declaredGame),repeated=tracked(declaredGame,undone);
  assert.equal(undone.teams[team].corners,0);assert.equal(undone.teams[team].shots,1);
  repeated.step(skipMove(repeated.state,{roll}));
  assert.equal(repeated.stats.teams[team].shots,1);assert.equal(repeated.stats.teams[team].onTarget,0);
  assert.equal(repeated.stats.teams[team].corners,outcome==='corner'?1:0);assert.equal(repeated.stats.goals.length,0);
});

for(const team of ['white','black'])test(`${team} own-goal-target block out awards a goal kick without a corner, shot, or phantom scorer`,()=>{
  const enemy=other(team),transform=point=>team==='white'?point:mirror(point),carrier=`${team}-R1`,blockerId=`${enemy}-N1`;
  const run=tracked(fixture({team,carrier,positions:{[carrier]:transform([6,12]),[blockerId]:transform([6,14])}}));
  run.kick(...transform([6,17]));const model=run.state.lastAction.shotModel;
  assert.equal(model.blockCornerProbability,0);assert.ok(model.blockOutProbability>0);
  const roll=model.probability+model.saveProbability+model.missProbability+model.blockOutProbability/2;
  run.step(skipMove(run.state,{roll}));
  assert.equal(run.state.lastAction.type,'blockedShot');assert.equal(run.state.lastAction.outcome,'out');
  assert.equal(run.state.restart.type,'goalKick');assert.equal(run.state.restart.team,team);
  for(const side of [team,enemy]){
    assert.equal(run.stats.teams[side].shots,0);assert.equal(run.stats.teams[side].onTarget,0);assert.equal(run.stats.teams[side].corners,0);
  }
  assert.equal(run.stats.goals.length,0);assert.equal(run.stats.pendingShot,null);assert.equal(run.stats.lastPass,null);
  assert.deepEqual(restoreMatchStats(JSON.parse(JSON.stringify(run.stats)),run.state),run.stats);
});

for(const team of ['white','black'])test(`${team} a stalling-wrapped same-team own-goal catch clears the pending shot without inflating soccer statistics`,()=>{
  const transform=point=>team==='white'?point:mirror(point),carrier=`${team}-K`,origin=transform([6,16]);
  const state=fixture({team,carrier,positions:{[carrier]:origin}});
  state.ballProgress={team,anchorY:transform([0,10])[1],rounds:2,pendingRelease:false,excludeRelease:false};
  const run=tracked(state);run.kick(...transform([6,BOARD_HEIGHT]));assert.ok(run.stats.pendingShot);
  const model=run.state.lastAction.shotModel;run.step(skipMove(run.state,{roll:model.probability+model.keeperCornerProbability+model.caughtSaveProbability/2}));
  assert.equal(run.state.lastAction.type,'stalling');assert.equal(run.state.lastAction.triggeringAction.type,'save');
  assert.equal(run.stats.teams[team].shots,0);assert.equal(run.stats.teams[team].onTarget,0);assert.equal(run.stats.teams[team].corners,0);
  assert.equal(run.stats.pendingShot,null);assert.equal(run.stats.lastPass,null);assert.equal(run.stats.goals.length,0);
  assert.deepEqual(restoreMatchStats(JSON.parse(JSON.stringify(run.stats)),run.state),run.stats);
});

test('schema-two saves from before foul tracking restore zero disciplinary counts without losing existing statistics',()=>{
  const run=tracked(fixture());run.shoot();const saved=clone(run.stats);delete saved.foulEvents;
  for(const team of ['white','black'])for(const field of ['fouls','yellowCards','redCards'])delete saved.teams[team][field];
  const restored=restoreMatchStats(saved,run.state);
  assert.equal(restored.partial,false);assert.deepEqual(restored.goals,run.stats.goals);assert.deepEqual(restored.foulEvents,[]);
  for(const team of ['white','black'])for(const field of ['fouls','yellowCards','redCards'])assert.equal(restored.teams[team][field],0);
});

function foulFixture({team='white',offenderSuffix='Q',penalty=false}={}){
  const enemy=other(team),transform=point=>team==='white'?point:mirror(point),carrier=`${team}-R1`,offenderId=`${enemy}-${offenderSuffix}`;
  const victim=penalty?[6,1]:[6,6],offender=penalty?[7,2]:[6,3];
  const state=fixture({team,phase:'defendMove',carrier,positions:{[carrier]:transform(victim),[offenderId]:transform(offender)}});
  state.foulsEnabled=true;state.discipline={};state.sentOff=[];
  const move=legalMoves(state,offenderId).find(move=>move.type==='tackle'&&move.targetId===carrier);assert.ok(move,'a real defender can attempt the tackle');
  return {state,offenderId,fouledId:carrier,move,team,enemy,transform};
}

for(const team of ['white','black'])for(const [card,roll] of [[null,.08],['yellow',.04],['red',.01]])test(`${team} attack: actual ${card||'plain'} foul records the offending side and stable player IDs`,()=>{
  const f=foulFixture({team}),run=tracked(f.state);run.step(applyMove(run.state,f.offenderId,f.move.x,f.move.y,{roll}),{matchSeconds:123});
  assert.equal(run.state.lastAction.type,'foul');assert.equal(run.state.lastAction.card,card);assert.equal(run.state.restart.type,'freeKick');
  const side=run.stats.teams[f.enemy];assert.equal(side.fouls,1);assert.equal(side.yellowCards,card==='yellow'?1:0);assert.equal(side.redCards,card==='red'?1:0);
  assert.equal(run.stats.teams[team].fouls,0);assert.equal(run.stats.goals.length,0);assert.equal(run.stats.pendingShot,null);assert.equal(run.stats.lastPass,null);
  assert.deepEqual(run.stats.foulEvents,[{team:f.enemy,offenderId:f.offenderId,fouledId:f.fouledId,card,secondYellow:false,turn:run.state.turn,matchSeconds:123}]);
  assert.deepEqual(restoreMatchStats(JSON.parse(JSON.stringify(run.stats)),run.state),run.stats);
  if(card==='red'){assert.ok(!run.state.pieces.some(piece=>piece.id===f.offenderId));assert.ok(run.state.sentOff.some(piece=>piece.id===f.offenderId));}
  const summary=matchStatsSummary(run.stats);summary.foulEvents[0].offenderId='white-P3';assert.equal(run.stats.foulEvents[0].offenderId,f.offenderId,'rendering summaries cannot alter the event ledger');
});

for(const team of ['white','black'])test(`${team} attack: a second yellow contributes a second caution and one dismissal`,()=>{
  const first=foulFixture({team}),run=tracked(first.state);run.step(applyMove(run.state,first.offenderId,first.move.x,first.move.y,{roll:.04}));
  const second=foulFixture({team});second.state.discipline=clone(run.state.discipline);second.state.turn=run.state.turn+1;
  const continued=tracked(second.state,run.stats);continued.step(applyMove(continued.state,second.offenderId,second.move.x,second.move.y,{roll:.04}));
  assert.equal(continued.state.lastAction.card,'red');assert.equal(continued.state.lastAction.secondYellow,true);
  assert.equal(continued.stats.teams[second.enemy].fouls,2);assert.equal(continued.stats.teams[second.enemy].yellowCards,2);assert.equal(continued.stats.teams[second.enemy].redCards,1);
  assert.equal(continued.stats.foulEvents[1].card,'red');assert.equal(continued.stats.foulEvents[1].secondYellow,true);
  assert.deepEqual(restoreMatchStats(JSON.parse(JSON.stringify(continued.stats)),continued.state),continued.stats);
});

for(const [label,enabled,roll] of [['disabled',false,.01],['enabled clean',true,.5]])test(`${label} successful tackle adds no disciplinary event`,()=>{
  const f=foulFixture(),run=tracked(f.state);run.state.foulsEnabled=enabled;run.step(applyMove(run.state,f.offenderId,f.move.x,f.move.y,{roll}));
  assert.equal(run.state.lastAction.type,'tackle');assert.deepEqual(run.stats.foulEvents,[]);
  for(const team of ['white','black'])for(const key of ['fouls','yellowCards','redCards'])assert.equal(run.stats.teams[team][key],0);
});

for(const team of ['white','black'])for(const outcome of ['goal','saved'])test(`${team} awarded penalty ${outcome} is one normal shot without a build-up assist`,()=>{
  const enemy=other(team),transform=point=>team==='white'?point:mirror(point),carrier=`${team}-R2`,offenderId=`${enemy}-Q`;
  const run=tracked(fixture({team,carrier,positions:{[carrier]:transform([6,5]),[`${team}-R1`]:transform([6,1]),[offenderId]:transform([7,2])}}));
  run.state.foulsEnabled=true;run.state.discipline={};run.state.sentOff=[];
  run.kick(...transform([6,1]),{roll:0});assert.equal(run.stats.lastPass.providerId,carrier);
  run.step(skipMove(run.state));const tackle=legalMoves(run.state,offenderId).find(move=>move.type==='tackle'&&move.targetId===`${team}-R1`);assert.ok(tackle);
  run.step(applyMove(run.state,offenderId,tackle.x,tackle.y,{roll:.08}));assert.equal(run.state.restart.type,'penalty');assert.equal(run.stats.lastPass,null);
  run.ready();const penalty=legalKicks(run.state).find(kick=>kick.goal===team);assert.ok(penalty);run.kick(penalty.x,penalty.y);
  assert.equal(run.state.pendingShot.penalty,true);assert.equal(run.state.lastAction.shotModel.penalty,true);assert.equal(run.state.lastAction.shotModel.probability,.8);
  assert.equal(run.stats.teams[team].shots,1);assert.equal(run.stats.pendingShot.assistId,null);
  run.step(skipMove(run.state,{roll:outcome==='goal'?0:.9}));assert.equal(run.state.lastAction.type,outcome==='goal'?'goal':'save');
  assert.equal(run.stats.teams[team].shots,1);assert.equal(run.stats.teams[team].onTarget,1);assert.equal(run.stats.goals.length,outcome==='goal'?1:0);
  if(outcome==='goal')assert.equal(run.stats.goals[0].assistId,null);
  assert.equal(run.stats.teams[enemy].fouls,1);assert.equal(run.stats.foulEvents.length,1);assert.deepEqual(restoreMatchStats(clone(run.stats),run.state),run.stats);
});

for(const team of ['white','black'])test(`${team} red-carded keeper keeps its own event ID while the replacement keeper preserves another stable ID`,()=>{
  const f=foulFixture({team,offenderSuffix:'K',penalty:true}),run=tracked(f.state);run.step(applyMove(run.state,f.offenderId,f.move.x,f.move.y,{roll:.01}));
  assert.equal(run.state.lastAction.type,'foul');assert.ok(!run.state.pieces.some(piece=>piece.id===f.offenderId));
  const replacement=run.state.pieces.find(piece=>piece.team===f.enemy&&piece.type==='K');assert.ok(replacement);assert.notEqual(replacement.id,f.offenderId);
  assert.equal(replacement.replacementKeeper,true);assert.ok(replacement.originalType);
  assert.equal(run.stats.foulEvents[0].offenderId,f.offenderId);assert.equal(run.stats.teams[f.enemy].redCards,1);assert.equal(run.stats.teams[f.enemy].fouls,1);
  assert.deepEqual(restoreMatchStats(JSON.parse(JSON.stringify(run.stats)),run.state),run.stats,'sent-off and promoted IDs remain valid ledger references');
});

test('a scorer remains credited after that same stable player ID is sent off',()=>{
  const scored=tracked(fixture());scored.shoot();const f=foulFixture({team:'black',offenderSuffix:'R1'});f.state.score={...scored.state.score};
  const run=tracked(f.state,scored.stats);run.step(applyMove(run.state,f.offenderId,f.move.x,f.move.y,{roll:.01}));
  assert.equal(f.offenderId,'white-R1');assert.ok(!run.state.pieces.some(piece=>piece.id==='white-R1'));
  assert.equal(run.stats.goals[0].scorerId,'white-R1');assert.deepEqual(matchStatsSummary(run.stats).scorers,[{team:'white',pieceId:'white-R1',count:1}]);
  assert.deepEqual(restoreMatchStats(clone(run.stats),run.state),run.stats);
});

for(const team of ['white','black'])test(`${team} forfeit below seven active opponents adds no invented goals`,()=>{
  const f=foulFixture({team}),removed=f.state.pieces.filter(piece=>piece.team===f.enemy&&!['K','Q'].includes(piece.type)).slice(0,4);
  for(const piece of removed){f.state.pieces=f.state.pieces.filter(active=>active.id!==piece.id);f.state.discipline[piece.id]={yellowCards:0,redCard:true};f.state.sentOff.push({...piece,reason:'red',yellowCards:0});}
  assert.equal(f.state.pieces.filter(piece=>piece.team===f.enemy).length,7);
  const run=tracked(f.state,createMatchStats({partial:true}));run.step(applyMove(run.state,f.offenderId,f.move.x,f.move.y,{roll:.01}));
  assert.equal(run.state.phase,'finished');assert.equal(run.state.finishReason,'forfeit');assert.equal(run.state.winner,team);
  assert.equal(run.state.pieces.filter(piece=>piece.team===f.enemy).length,6);assert.deepEqual(run.state.score,{white:0,black:0});
  assert.equal(run.stats.goals.length,0);assert.equal(run.stats.foulEvents.length,1);assert.equal(run.stats.teams[f.enemy].redCards,1);
  assert.deepEqual(matchStatsSummary(run.stats).scorers,[]);assert.deepEqual(restoreMatchStats(clone(run.stats),run.state),run.stats);
});

test('Undo and restart repositioning preserve exactly one foul and card event',()=>{
  const f=foulFixture(),beforeGame=clone(f.state),beforeStats=createMatchStats(),run=tracked(f.state,beforeStats);
  run.step(applyMove(run.state,f.offenderId,f.move.x,f.move.y,{roll:.04}));const event=clone(run.stats.foulEvents[0]);
  run.ready();assert.deepEqual(run.stats.foulEvents,[event]);assert.equal(run.stats.teams.black.fouls,1);assert.equal(run.stats.teams.black.yellowCards,1);
  const undoStats=restoreMatchStats(beforeStats,beforeGame);assert.deepEqual(undoStats.foulEvents,[]);assert.equal(undoStats.teams.black.fouls,0);
  const repeated=tracked(beforeGame,undoStats);repeated.step(applyMove(repeated.state,f.offenderId,f.move.x,f.move.y,{roll:.04}));
  assert.equal(repeated.stats.foulEvents.length,1);assert.equal(repeated.stats.teams.black.yellowCards,1);
});

test('malformed saved disciplinary counters and event references are rejected safely',()=>{
  const f=foulFixture(),run=tracked(f.state);run.step(applyMove(run.state,f.offenderId,f.move.x,f.move.y,{roll:.04}));
  const cases=[value=>value.teams.black.fouls=-1,value=>value.teams.black.yellowCards=.5,value=>value.teams.black.redCards=Infinity,
    value=>value.foulEvents=null,value=>value.foulEvents=[null],value=>value.foulEvents=[{}],value=>value.foulEvents[0].offenderId='black-Q9',value=>value.foulEvents[0].fouledId='black-P1',
    value=>value.foulEvents[0].card='blue',value=>value.foulEvents[0].secondYellow=true,value=>value.foulEvents[0].turn=-1,value=>value.foulEvents[0].matchSeconds=Infinity];
  for(const mutate of cases){const saved=clone(run.stats);mutate(saved);const restored=restoreMatchStats(saved,run.state);assert.equal(restored.partial,true);assert.deepEqual(restored.foulEvents,[]);}
});

for(const team of ['white','black'])test(`${team} P3 opponent-goal finish is an ordinary scorer, never an own goal`,()=>{
 const transform=pair=>team==='white'?pair:mirror(pair),scorerId=`${team}-P3`,run=tracked(fixture({team,carrier:scorerId,positions:{[scorerId]:transform([6,1])}}));
 const target=transform([6,-1]);run.shoot(...target,0);
 assert.equal(run.state.lastAction.type,'goal');assert.equal(run.state.lastAction.team,team);assert.equal(!!run.state.lastAction.ownGoal,false);
 assert.equal(run.stats.teams[team].shots,1);assert.equal(run.stats.teams[team].onTarget,1);assert.equal(run.stats.goals.length,1);assert.equal(run.stats.goals[0].scorerId,scorerId);assert.equal(run.stats.goals[0].team,team);assert.equal(run.stats.goals[0].ownGoal,false);
 assert.deepEqual(matchStatsSummary(run.stats).scorers,[{team,pieceId:scorerId,count:1}]);assert.deepEqual(restoreMatchStats(clone(run.stats),run.state),run.stats);
});

for(const team of ['white','black'])test(`${team} restored P3 shot missing redundant shooting team still records an ordinary goal`,()=>{
 const transform=pair=>team==='white'?pair:mirror(pair),scorerId=`${team}-P3`,run=tracked(fixture({team,carrier:scorerId,positions:{[scorerId]:transform([6,5])}}));
 run.kick(...transform([6,-1]));const legacy=clone(run.state);delete legacy.pendingShot.shootingTeam;
 const restored=normalizeGame(legacy),resolved=skipMove(restored,{roll:0});run.state=legacy;run.step(resolved);
 assert.equal(run.stats.teams[team].shots,1);assert.equal(run.stats.teams[team].onTarget,1);assert.equal(run.stats.goals[0].scorerId,scorerId);assert.equal(run.stats.goals[0].team,team);assert.equal(run.stats.goals[0].ownGoal,false);assert.deepEqual(matchStatsSummary(run.stats).scorers,[{team,pieceId:scorerId,count:1}]);
});

for(const team of ['white','black'])test(`${team} statistics ignore a contradictory own-goal action flag when scorer and beneficiary match`,()=>{
 const run=tracked(fixture({team})),target=team==='white'?[6,-1]:[7,17];run.kick(...target);const resolved=skipMove(run.state,{roll:0});resolved.lastAction.ownGoal=true;run.step(resolved);
 assert.equal(run.stats.goals[0].ownGoal,false);assert.deepEqual(matchStatsSummary(run.stats).scorers,[{team,pieceId:`${team}-R1`,count:1}]);
});

for(const team of ['white','black'])test(`${team} historical false own-goal record restores scorer and only proven minimum shot counters`,()=>{
 const run=tracked(fixture({team}));run.shoot(...(team==='white'?[6,-1]:[7,17]));const saved=clone(run.stats);saved.goals[0].ownGoal=true;saved.teams[team].shots=0;saved.teams[team].onTarget=0;saved.teams[team].corners=3;saved.teams[team].possessionMs=1234;const snapshot=clone(saved);
 const restored=restoreMatchStats(saved,run.state);assert.deepEqual(saved,snapshot,'repair preserves saved source and undo snapshot');assert.equal(restored.partial,false);assert.equal(restored.goals[0].ownGoal,false);assert.equal(restored.teams[team].shots,1);assert.equal(restored.teams[team].onTarget,1);assert.equal(restored.teams[team].corners,3);assert.equal(restored.teams[team].possessionMs,1234);assert.deepEqual(matchStatsSummary(restored).scorers,[{team,pieceId:`${team}-R1`,count:1}]);assert.deepEqual(restoreMatchStats(clone(restored),run.state),restored,'canonical repair is idempotent');
 saved.teams[team].shots=7;saved.teams[team].onTarget=3;const higher=restoreMatchStats(saved,run.state);assert.equal(higher.teams[team].shots,7);assert.equal(higher.teams[team].onTarget,3,'existing higher counters are never reduced');
 const wrongScore=clone(run.state);wrongScore.score[team]++;assert.equal(restoreMatchStats(saved,wrongScore).partial,true,'repair never bypasses score-ledger validation');
});

test('historical cross-team own goal remains an own goal even if its redundant flag says otherwise',()=>{
 const run=tracked(fixture({positions:{'white-R1':[6,12]}}));run.kick(6,17);run.step(skipMove(run.state,{roll:0}));const saved=clone(run.stats);saved.goals[0].ownGoal=false;const restored=restoreMatchStats(saved,run.state);
 assert.equal(restored.goals[0].team,'black');assert.equal(restored.goals[0].scorerId,'white-R1');assert.equal(restored.goals[0].ownGoal,true);assert.equal(restored.goals[0].assistId,null);assert.deepEqual(matchStatsSummary(restored).scorers,[]);assert.equal(restored.teams.black.shots,0);assert.equal(restored.teams.white.shots,0);assert.equal(restored.teams.black.onTarget,0);
 saved.goals[0].assistId='black-Q';assert.equal(restoreMatchStats(saved,run.state).partial,true,'an impossible own-goal assist still rejects the ledger');
});

for(const team of ['white','black'])for(const suffix of ['Q','N1'])test(`${team} ${suffix} disguised goal counts one attempt and maps the actual second target after reload`,()=>{
 const transform=pair=>team==='white'?pair:mirror(pair),carrier=`${team}-${suffix}`;
 const state=fixture({team,carrier,positions:{[carrier]:transform([6,1]),[`${other(team)}-K`]:transform([5,0])}}),run=tracked(state);
 const targets=legalKicks(state).filter(kick=>kick.goal===team).sort((a,b)=>a.x-b.x);assert.equal(targets.length,2);
 run.kick(targets[0].x,targets[0].y,{disguise:true});assert.equal(run.state.pendingShot.disguised,true);
 assert.equal(run.stats.teams[team].shots,1);assert.equal(run.stats.teams[team].onTarget,0);
 assert.equal(run.stats.pendingShot.target,null);assert.equal(run.stats.pendingShot.distance,null,'unresolved aim is not recorded as a committed endpoint');
 run.stats=restoreMatchStats(clone(run.stats),normalizeGame(clone(run.state)));
 assert.equal(run.stats.teams[team].shots,1);assert.equal(run.stats.pendingShot.target,null);assert.equal(run.stats.pendingShot.distance,null);
 run.step(skipMove(run.state,{roll:0,targetRoll:.99}),{matchSeconds:123});
 assert.equal(run.state.lastAction.type,'goal');assert.equal(run.state.lastAction.chosenTargetIndex,1);
 assert.equal(run.stats.teams[team].shots,1);assert.equal(run.stats.teams[team].onTarget,1);assert.equal(run.stats.goals.length,1);
 const goal=run.stats.goals[0];assert.deepEqual(goal.origin,{x:state.ball.x,y:state.ball.y});
 assert.deepEqual(goal.target,{x:targets[1].x,y:targets[1].y});assert.notDeepEqual(goal.target,{x:targets[0].x,y:targets[0].y});
 assert.equal(goal.distance,Math.hypot(goal.target.x-goal.origin.x,(goal.target.y<0?-.5:BOARD_HEIGHT-.5)-goal.origin.y));
 assert.equal(goal.scorerId,carrier);assert.equal(goal.ownGoal,false);assert.equal(goal.assistId,null);
 assert.deepEqual(restoreMatchStats(clone(run.stats),run.state),run.stats);
});
