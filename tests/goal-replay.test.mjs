import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,applyKick,applyMove,skipMove} from '../dist/engine.js';
import {buildGoalReplay,restoreGoalReplay} from '../dist/goal-replay.js';

const clone=value=>structuredClone(value);
function fixture({team='white',ownGoal=false,knight=false}={}){
  const state=createGame({mode:'local',kickoff:team,seed:39});
  const scoringTeam=ownGoal?(team==='white'?'black':'white'):team;
  const top=scoringTeam==='white';
  const shooterId=`${team}-${knight?'N1':'R1'}`;
  const assigned={'white-K':[4,14],'black-K':[7,0],[shooterId]:knight?[top?3:8,top?1:13]:[top?4:7,top?4:10]};
  const occupied=new Set(Object.values(assigned).map(([x,y])=>`${x},${y}`));
  const parking=Array.from({length:15},(_,y)=>[[0,y],[11,y]]).flat();
  for(const piece of state.pieces){const at=assigned[piece.id]||parking.find(([x,y])=>!occupied.has(`${x},${y}`));[piece.x,piece.y]=at;occupied.add(`${piece.x},${piece.y}`);}
  const shooter=state.pieces.find(piece=>piece.id===shooterId);
  state.phase='kick';state.attack=team;state.ball={x:shooter.x,y:shooter.y,carrierId:shooter.id};state.lastAction=null;
  return {state,target:{x:top?4:7,y:top?-1:15}};
}
function recordedGoal(options={}){
  const {state,target}=fixture(options),pending=applyKick(state,target.x,target.y);
  assert.equal(pending.phase,'keeperReact');
  const before=clone(pending);
  const after=options.moveKeeper
    ?applyMove(pending,`${pending.pendingShot.defendingTeam}-K`,options.moveKeeper.x,options.moveKeeper.y,{roll:0})
    :skipMove(pending,{roll:0});
  assert.equal(after.lastAction.type,'goal');
  const history=[{game:state,actor:options.team||'white'},{game:pending,actor:pending.pendingShot.defendingTeam}];
  return {state,before,after,history,replay:buildGoalReplay(history,before,after)};
}

test('goal recording preserves actual pre-goal positions, shot path and final score',()=>{
  const {before,after,replay}=recordedGoal();assert.ok(replay);
  assert.equal(replay.frames.length,3);assert.deepEqual(replay.score,{white:1,black:0});
  const final=replay.frames.at(-1);
  assert.deepEqual(final.pieces,before.pieces);
  assert.notDeepEqual(final.pieces,after.pieces,'kickoff reset is not presented as the goal scene');
  assert.deepEqual(final.ball,{x:4,y:-1,carrierId:null});
  assert.deepEqual(final.action.path,after.lastAction.path);
  assert.equal(final.action.probability,after.lastAction.probability);
  assert.equal(replay.goalTurn,after.turn);
});

test('keeper reaction in the scoring frame comes from the recorded move',()=>{
  const {before,after,replay}=recordedGoal({moveKeeper:{x:6,y:1}});assert.ok(replay);
  const final=replay.frames.at(-1),keeper=final.pieces.find(piece=>piece.id==='black-K');
  assert.deepEqual({x:keeper.x,y:keeper.y},{x:6,y:1});
  assert.deepEqual(final.action.keeperMove,after.lastAction.keeperMove);
  assert.deepEqual(final.pieces.filter(piece=>piece.id!=='black-K'),before.pieces.filter(piece=>piece.id!=='black-K'));
});

for(const team of ['white','black'])for(const ownGoal of [false,true]){
  test(`${team} ${ownGoal?'own goal':'goal'} identifies shooter and scoring team separately`,()=>{
    const {replay}=recordedGoal({team,ownGoal});assert.ok(replay);
    assert.equal(replay.shootingTeam,team);assert.equal(replay.ownGoal,ownGoal);
    assert.equal(replay.team,ownGoal?(team==='white'?'black':'white'):team);
    assert.equal(replay.shooterId,`${team}-R1`);
    assert.equal(replay.frames.at(-1).ball.y,replay.team==='white'?-1:15);
  });
}

test('knight L-shaped goal records its actual jump without inventing a ray',()=>{
  const {after,replay}=recordedGoal({knight:true});assert.ok(replay);
  assert.equal(replay.frames.at(-1).action.path.length,2);
  assert.deepEqual(replay.frames.at(-1).action.path,after.lastAction.path);
});

test('outside-box king replay correctly describes the lack of goalkeeper reaction',()=>{
  const {state,target}=fixture(),king=state.pieces.find(piece=>piece.id==='black-K');king.x=8;king.y=2;
  const before=applyKick(state,target.x,target.y),after=skipMove(before,{roll:0});
  const replay=buildGoalReplay([{game:state},{game:before}],before,after);assert.ok(replay);
  assert.match(replay.frames.at(-1).caption,/outside its box; no keeper reaction/);
  assert.equal(replay.frames.at(-1).action.keeperMove,undefined);
});

test('building and restoring replay are pure and clones cannot mutate match snapshots',()=>{
  const {state,before,after,history}=recordedGoal(),input=JSON.stringify({state,before,after,history});
  const replay=buildGoalReplay(history,before,after),restored=restoreGoalReplay(replay);
  assert.equal(JSON.stringify({state,before,after,history}),input);
  assert.equal(before.randomState,history.at(-1).game.randomState);
  restored.frames.at(-1).pieces[0].x=10;
  assert.notEqual(restored.frames.at(-1).pieces[0].x,replay.frames.at(-1).pieces[0].x);
  replay.frames[0].ball.x=8;assert.equal(JSON.stringify({state,before,after,history}),input);
});

test('recording caps build-up at twelve frames including the goal freeze',()=>{
  const {state,before,after}=recordedGoal(),history=[];
  for(let index=0;index<30;index++){
    const game=clone(state);game.lastAction={type:'skip',team:index%2?'white':'black',phase:index%2?'attackMove':'defendMove'};
    game.pieces.find(piece=>piece.id==='white-P1').y=8+index%6;
    // Keep this independently constructed state legal and unique.
    const pawn=game.pieces.find(piece=>piece.id==='white-P1');
    const occupant=game.pieces.find(piece=>piece.id!==pawn.id&&piece.x===pawn.x&&piece.y===pawn.y);
    if(occupant){const original=state.pieces.find(piece=>piece.id===pawn.id);occupant.x=original.x;occupant.y=original.y;}
    history.push({game});
  }
  history.push({game:before});
  const replay=buildGoalReplay(history,before,after);assert.ok(replay);assert.equal(replay.frames.length,12);assert.equal(replay.frames.at(-1).action.type,'goal');
});

test('build-up stops at the previous score change and malformed legacy snapshot',()=>{
  const {state,before,after}=recordedGoal();
  const previousScore=clone(state);previousScore.score.white=1;
  let replay=buildGoalReplay([{game:previousScore},{game:state},{game:before}],before,after);
  assert.equal(replay.frames.length,3);
  const legacy=clone(state),king=legacy.pieces.find(piece=>piece.id==='white-K');king.x=5;king.y=0;
  replay=buildGoalReplay([{game:state},{game:legacy},{game:before}],before,after);
  assert.ok(replay);assert.equal(replay.frames.length,2,'invalid history is omitted, not repositioned');
  assert.deepEqual(replay.frames[0].pieces,before.pieces);
});

test('replay survives JSON storage with a bounded known schema',()=>{
  const {replay}=recordedGoal();replay.unrelated='ignored';replay.frames[0].unrelated='ignored';
  const restored=restoreGoalReplay(JSON.parse(JSON.stringify(replay)));assert.ok(restored);
  assert.equal(restored.unrelated,undefined);assert.equal(restored.frames[0].unrelated,undefined);
  assert.deepEqual(restoreGoalReplay(restored),restored);
});

test('stored replay rejects malformed geometry, scores, ownership and excessive data',()=>{
  const {replay}=recordedGoal();
  const cases=[
    value=>value.version=2,
    value=>value.frames.push(...Array.from({length:12},()=>clone(value.frames[0]))),
    value=>value.frames[0].pieces.pop(),
    value=>value.frames[0].pieces[0].x=12,
    value=>{value.frames[0].pieces[1].x=value.frames[0].pieces[0].x;value.frames[0].pieces[1].y=value.frames[0].pieces[0].y;},
    value=>{const king=value.frames[0].pieces.find(piece=>piece.id==='white-K');king.x=5;king.y=0;},
    value=>{const queen=value.frames[0].pieces.find(piece=>piece.id==='white-Q');queen.x=6;queen.y=1;},
    value=>value.frames[0].ball.carrierId='imaginary',
    value=>value.frames[0].ball.x=8,
    value=>value.frames.at(-1).ball.y=0,
    value=>value.score.white=8,
    value=>value.team='green',
    value=>value.ownGoal=true,
    value=>value.frames.at(-1).action.path=Array.from({length:33},()=>({x:0,y:0})),
    value=>delete value.frames.at(-1).action.probability,
    value=>value.frames.at(-1).pieces.find(piece=>piece.id==='white-R1').y=6,
    value=>value.frames[0].caption='x'.repeat(281),
    value=>value.extra='x'.repeat(90001)
  ];
  for(const mutate of cases){const malformed=clone(replay);mutate(malformed);assert.equal(restoreGoalReplay(malformed),null);}
  assert.equal(restoreGoalReplay(null),null);
  const cyclic={};cyclic.self=cyclic;assert.equal(restoreGoalReplay(cyclic),null);
});

test('non-goals and missing pending-shot evidence do not create replays',()=>{
  const {before,after,history}=recordedGoal();
  assert.equal(buildGoalReplay(history,before,{...after,lastAction:{type:'save'}}),null);
  assert.equal(buildGoalReplay(history,{...before,pendingShot:null},after),null);
  assert.equal(buildGoalReplay(history,{...before,phase:'kickoff'},after),null);
});
