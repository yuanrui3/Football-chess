import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,applyKick,applyMove,skipMove,BOARD_WIDTH as W,BOARD_HEIGHT as H,GOAL_FILES,BOX_FILES,BOX_DEPTH} from '../dist/engine.js';
import {buildGoalReplay,restoreGoalReplay} from '../dist/goal-replay.js';

const clone=value=>structuredClone(value);
function fixture({team='white',ownGoal=false,knight=false,keeperFrom=null,extraPositions={}}={}){
  const state=createGame({mode:'local',kickoff:team,seed:39});
  const scoringTeam=ownGoal?(team==='white'?'black':'white'):team;
  const top=scoringTeam==='white';
  const shooterId=`${team}-${knight?'N1':'R1'}`;
  const assigned={'white-K':[5,H-1],'black-K':[8,0],[shooterId]:knight?[top?4:9,top?1:H-2]:[top?5:8,top?4:H-5]};
  if(keeperFrom)assigned['black-K']=[keeperFrom.x,keeperFrom.y];
  Object.assign(assigned,extraPositions);
  const occupied=new Set(Object.values(assigned).map(([x,y])=>`${x},${y}`));
  const parking=Array.from({length:H},(_,y)=>[[0,y],[W-1,y]]).flat();
  for(const piece of state.pieces){const at=assigned[piece.id]||parking.find(([x,y])=>!occupied.has(`${x},${y}`));[piece.x,piece.y]=at;occupied.add(`${piece.x},${piece.y}`);}
  const shooter=state.pieces.find(piece=>piece.id===shooterId);
  state.phase='kick';state.attack=team;state.ball={x:shooter.x,y:shooter.y,carrierId:shooter.id};state.lastAction=null;
  return {state,target:{x:top?5:8,y:top?-1:H}};
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
  assert.deepEqual(final.ball,{x:5,y:-1,carrierId:null});
  assert.deepEqual(final.action.path,after.lastAction.path);
  assert.equal(final.action.probability,after.lastAction.probability);
  assert.equal(replay.goalTurn,after.turn);
});

test('keeper reaction in the scoring frame comes from the recorded move',()=>{
  const {before,after,replay}=recordedGoal({moveKeeper:{x:7,y:1}});assert.ok(replay);
  const final=replay.frames.at(-1),keeper=final.pieces.find(piece=>piece.id==='black-K');
  assert.deepEqual({x:keeper.x,y:keeper.y},{x:7,y:1});
  assert.deepEqual(final.action.keeperMove,after.lastAction.keeperMove);
  assert.deepEqual(final.pieces.filter(piece=>piece.id!=='black-K'),before.pieces.filter(piece=>piece.id!=='black-K'));
});

test('a lofted restart in the real goal build-up keeps its bypass metadata through storage',()=>{
  const {state,target}=fixture(),taker=state.pieces.find(piece=>piece.id==='white-R2'),blocker=state.pieces.find(piece=>piece.id==='black-P1');
  Object.assign(taker,{x:5,y:H-BOX_DEPTH-1});Object.assign(blocker,{x:5,y:8});
  state.ball={x:taker.x,y:taker.y,carrierId:taker.id};
  state.restart={type:'stalling',team:'white',takerId:taker.id,spot:{x:taker.x,y:taker.y},indirect:true};
  const received=applyKick(state,5,4,{roll:0});
  assert.equal(received.lastAction.lofted,true);assert.equal(received.ball.carrierId,'white-R1');
  const defence=skipMove(received),ready=skipMove(defence),before=applyKick(ready,target.x,target.y),after=skipMove(before,{roll:0});
  const replay=buildGoalReplay([state,received,defence,ready,before].map(game=>({game})),before,after);assert.ok(replay);
  const loft=replay.frames.find(frame=>frame.action?.lofted);assert.ok(loft);
  assert.equal(loft.action.bypassedPieceId,blocker.id);assert.deepEqual(loft.action.bypassedSquare,{x:5,y:8});
  assert.match(loft.caption,/lofts a pass over one player/);
  assert.deepEqual(restoreGoalReplay(JSON.parse(JSON.stringify(replay))),replay);
  const invalid=clone(replay);invalid.frames.find(frame=>frame.action?.lofted).action.bypassedPieceId='unknown';
  assert.equal(restoreGoalReplay(invalid),null);
});

for(const team of ['white','black'])for(const ownGoal of [false,true]){
  test(`${team} ${ownGoal?'own goal':'goal'} identifies shooter and scoring team separately`,()=>{
    const {replay}=recordedGoal({team,ownGoal});assert.ok(replay);
    assert.equal(replay.shootingTeam,team);assert.equal(replay.ownGoal,ownGoal);
    assert.equal(replay.team,ownGoal?(team==='white'?'black':'white'):team);
    assert.equal(replay.shooterId,`${team}-R1`);
    assert.equal(replay.frames.at(-1).ball.y,replay.team==='white'?-1:H);
  });
}

test('knight L-shaped goal records its actual jump without inventing a ray',()=>{
  const {after,replay}=recordedGoal({knight:true});assert.ok(replay);
  assert.equal(replay.frames.at(-1).action.path.length,2);
  assert.deepEqual(replay.frames.at(-1).action.path,after.lastAction.path);
});

test('outside-box king replay correctly describes the lack of goalkeeper reaction',()=>{
  const {state,target}=fixture(),king=state.pieces.find(piece=>piece.id==='black-K');king.x=10;king.y=2;
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

test('replay geometry identifies the expanded pitch, separate goal and keeper-box widths',()=>{
  const {replay}=recordedGoal();
  assert.equal(replay.version,2);
  assert.deepEqual(replay.board,{width:14,height:17,goalFiles:[5,6,7,8],boxFiles:[4,5,6,7,8,9],boxDepth:3});
  assert.deepEqual(replay.board,{width:W,height:H,goalFiles:[...GOAL_FILES],boxFiles:[...BOX_FILES],boxDepth:BOX_DEPTH});
  assert.ok(replay.frames[0].pieces.some(piece=>piece.x===13),'actual pieces in file n survive capture');
  assert.match(replay.frames.at(-1).caption,/from f13 to the F goal/);
  for(const board of [undefined,{...replay.board,width:12,height:15},{...replay.board,goalFiles:[4,5,6,7]},
      {...replay.board,boxFiles:[5,6,7,8]},{...replay.board,boxDepth:4}]){
    const old=clone(replay);old.board=board;assert.equal(restoreGoalReplay(old),null);
  }
  const oldVersion=clone(replay);oldVersion.version=1;delete oldVersion.board;
  assert.equal(restoreGoalReplay(oldVersion),null,'old recordings are not rescaled onto the new board');
});

test('goal capture excludes wrong-size and unstamped historical matches even when their coordinates fit',()=>{
  const {state,before,after}=recordedGoal();
  for(const change of [s=>s.boardDimensions={width:12,height:15},s=>{s.rulesVersion=13;delete s.boardDimensions;}]){
    const old=clone(state);change(old);
    const replay=buildGoalReplay([{game:state},{game:old},{game:before}],before,after);
    assert.ok(replay);assert.equal(replay.frames.length,2,'history stops at the old pitch');
    const oldBefore=clone(before);change(oldBefore);
    assert.equal(buildGoalReplay([],oldBefore,after),null);
    const oldAfter=clone(after);change(oldAfter);
    assert.equal(buildGoalReplay([],before,oldAfter),null);
  }
});

test('own keeper may occupy the new box wings, which are not extra goal mouths',()=>{
  for(const x of [4,9]){
    const {replay}=recordedGoal({keeperFrom:{x,y:0}});assert.ok(replay);
    assert.equal(replay.frames.at(-1).pieces.find(piece=>piece.id==='black-K').x,x);
    assert.deepEqual(restoreGoalReplay(clone(replay)),replay);
    const falseGoal=clone(replay);falseGoal.frames.at(-1).ball.x=x;falseGoal.frames.at(-1).action.to.x=x;
    assert.equal(restoreGoalReplay(falseGoal),null,'box wings cannot become goals');
    const forbidden=clone(replay);
    for(const frame of forbidden.frames){const king=frame.pieces.find(piece=>piece.id==='white-K');king.x=x;king.y=1;}
    assert.equal(restoreGoalReplay(forbidden),null,'opposing kings cannot enter either new box wing');
  }
});

test('recordings accept every outfield type in either six-wide three-deep box under the selected rules',()=>{
  for(const team of ['white','black'])for(const suffix of ['Q','R2','B1','N1','P1'])for(const spot of [[4,BOX_DEPTH-1],[9,H-BOX_DEPTH]]){
    const {replay}=recordedGoal({extraPositions:{'black-N2':[9,0],[`${team}-${suffix}`]:spot}});
    assert.ok(replay,`${team}-${suffix} at${spot}`);
    assert.deepEqual(restoreGoalReplay(clone(replay)),replay);
    const recorded=replay.frames.at(-1).pieces.find(piece=>piece.id===`${team}-${suffix}`);
    assert.deepEqual({x:recorded.x,y:recorded.y},{x:spot[0],y:spot[1]});
  }
});

test('a reaction can leave an own-box wing but cannot begin outside the keeper box',()=>{
  const {replay}=recordedGoal({keeperFrom:{x:4,y:0},moveKeeper:{x:3,y:1}});assert.ok(replay);
  assert.deepEqual(replay.frames.at(-1).action.keeperMove,{pieceId:'black-K',from:{x:4,y:0},to:{x:3,y:1}});
  assert.deepEqual(restoreGoalReplay(clone(replay)),replay,'leaving the box is recorded as the real ordinary-body outcome');
  const invalid=clone(replay),final=invalid.frames.at(-1);
  for(const frame of invalid.frames.slice(0,-1)){const king=frame.pieces.find(piece=>piece.id==='black-K');king.x=4;king.y=3;}
  const king=final.pieces.find(piece=>piece.id==='black-K');king.x=5;king.y=2;
  final.action.keeperMove={pieceId:'black-K',from:{x:4,y:3},to:{x:5,y:2}};
  assert.equal(restoreGoalReplay(invalid),null,'an outside-box king has no keeper reaction to record');
});

test('a real defender block remains visible in a later goal replay and survives JSON storage',()=>{
  const {state,target}=fixture(),blocker=state.pieces.find(piece=>piece.id==='black-P1');
  Object.assign(blocker,{x:5,y:BOX_DEPTH});
  const firstShot=applyKick(state,target.x,target.y),blocked=skipMove(firstShot,{roll:.999999});
  assert.equal(blocked.lastAction.type,'blockedShot');assert.equal(blocked.lastAction.outcome,'blocked');
  assert.equal(blocked.ball.carrierId,blocker.id);
  const repositioned=skipMove(blocked),ready=skipMove(repositioned);
  const recovered=applyKick(ready,5,4),defence=skipMove(recovered),shotReady=skipMove(defence);
  assert.equal(recovered.ball.carrierId,'white-R1','the blocker passes into the adjacent opponent');
  const before=applyKick(shotReady,target.x,target.y),after=skipMove(before,{roll:0});
  assert.equal(after.lastAction.type,'goal');
  const replay=buildGoalReplay([state,firstShot,blocked,repositioned,ready,recovered,defence,shotReady,before].map(game=>({game})),before,after);
  assert.ok(replay);
  const frame=replay.frames.find(frame=>frame.action?.type==='blockedShot');assert.ok(frame);
  assert.equal(frame.action.blockerId,blocker.id);assert.equal(frame.action.outcome,'blocked');
  assert.match(frame.caption,/pawn blocks the shot; the defending side recovers possession/);
  assert.deepEqual(restoreGoalReplay(clone(replay)),replay);
  for(const mutate of [a=>a.blockerId='unknown',a=>a.outcome='invented']){
    const invalid=clone(replay);mutate(invalid.frames.find(frame=>frame.action?.type==='blockedShot').action);
    assert.equal(restoreGoalReplay(invalid),null);
  }
});

for(const ownGoal of [false,true])test(`a real block ${ownGoal?'out for a goal kick':'out for a corner'} remains in the next goal replay`,()=>{
  const {state,target}=fixture({ownGoal}),blocker=state.pieces.find(piece=>piece.id==='black-P1');
  Object.assign(blocker,{x:target.x,y:ownGoal?H-4:BOX_DEPTH});
  const history=[state],take=next=>{history.push(next);return next;};
  let current=take(applyKick(state,target.x,target.y));
  current=take(skipMove(current,{roll:.75}));
  assert.equal(current.lastAction.type,'blockedShot');assert.equal(current.lastAction.outcome,ownGoal?'out':'corner');
  assert.equal(current.restart.type,ownGoal?'goalKick':'corner');
  if(!ownGoal)current=take(applyMove(current,'white-R1',4,4));
  current=take(skipMove(current));current=take(skipMove(current));
  current=take(applyKick(current,ownGoal?8:4,ownGoal?H-5:4,{roll:0}));
  assert.equal(current.ball.carrierId,'white-R1');
  if(!ownGoal)current=take(applyMove(current,'white-R1',5,4));
  current=take(skipMove(current));current=take(skipMove(current));
  const before=take(applyKick(current,ownGoal?8:5,-1)),after=skipMove(before,{roll:0});
  assert.equal(after.lastAction.type,'goal');
  const replay=buildGoalReplay(history.map(game=>({game})),before,after);assert.ok(replay);
  const frame=replay.frames.find(frame=>frame.action?.type==='blockedShot');assert.ok(frame);
  assert.equal(frame.action.outcome,ownGoal?'out':'corner');
  assert.match(frame.caption,ownGoal?/out for a goal kick/:/conceding a corner/);
  assert.deepEqual(restoreGoalReplay(clone(replay)),replay);
});

test('stored replay rejects malformed geometry, scores, ownership and excessive data',()=>{
  const {replay}=recordedGoal();
  const cases=[
    value=>value.version=1,
    value=>value.frames.push(...Array.from({length:12},()=>clone(value.frames[0]))),
    value=>value.frames[0].pieces.pop(),
    value=>value.frames[0].pieces[0].x=W,
    value=>{value.frames[0].pieces[1].x=value.frames[0].pieces[0].x;value.frames[0].pieces[1].y=value.frames[0].pieces[0].y;},
    value=>{const king=value.frames[0].pieces.find(piece=>piece.id==='white-K');king.x=5;king.y=0;},
    value=>{const queen=value.frames[0].pieces.find(piece=>piece.id==='white-Q');queen.team='black';},
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
