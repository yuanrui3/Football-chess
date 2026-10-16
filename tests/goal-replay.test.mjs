import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,applyKick,applyMove,skipMove,legalKicks,legalMoves,canOccupySquare,BOARD_WIDTH as W,BOARD_HEIGHT as H,GOAL_FILES,BOX_FILES,BOX_DEPTH,selectCornerTaker} from '../dist/engine.js';
import {buildGoalReplay,restoreGoalReplay,createReplayPlayer} from '../dist/goal-replay.js';

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

// Mirror a complete, legal challenge rather than manufacturing a replay card.
function foulFixture({team='white',inside=true,keeper=false}={}){
  const state=createGame({mode:'local',seed:89317,foulsEnabled:true}),other=team==='white'?'black':'white';
  const cy=inside?BOX_DEPTH-1:BOX_DEPTH,offenderId=`${other}-${keeper?'K':'R1'}`,carrierId=`${team}-Q`;
  const rotate=([x,y])=>team==='white'?{x,y}:{x:W-1-x,y:H-1-y};
  const placements={'white-K':[6,H-2],'black-K':[6,0],'white-Q':[6,cy],[`black-${keeper?'K':'R1'}`]:[6,keeper?cy-1:cy+2]};
  const used=new Set(Object.values(placements).map(p=>p.join())),parking=Array.from({length:H},(_,y)=>[[0,y],[W-1,y]]).flat();
  for(const piece of state.pieces){
    const at=placements[piece.id]||parking.find(p=>!used.has(p.join()));used.add(at.join());Object.assign(piece,rotate(at));
    if(team==='black'){piece.team=piece.team==='white'?'black':'white';piece.id=piece.id.replace(/^(white|black)/,v=>v==='white'?'black':'white');}
  }
  const carrier=state.pieces.find(piece=>piece.id===carrierId);
  state.attack=team;state.phase='defendMove';state.positionBudget={normalUsed:false,pawnUsed:false,dribbleUsed:false};
  state.ball={x:carrier.x,y:carrier.y,carrierId};state.lastAction=null;
  return {state,offenderId,carrierId,target:rotate([5,cy]),team,other};
}
function recordedFoulGoal(options={}){
  const f=foulFixture(options),history=[f.state],take=game=>{history.push(game);return game;};
  const awarded=take(applyMove(f.state,f.offenderId,f.target.x,f.target.y,{roll:options.roll??.01}));
  assert.equal(awarded.lastAction.type,'foul');
  const defence=take(skipMove(awarded)),ready=take(skipMove(defence));
  const shot=legalKicks(ready).find(kick=>kick.goal===f.team);assert.ok(shot);
  const before=take(applyKick(ready,shot.x,shot.y));
  const keeper=before.pieces.find(piece=>piece.team===f.other&&piece.type==='K');
  const reaction=options.moveKeeper?legalMoves(before,keeper.id)[0]:null;
  if(options.moveKeeper)assert.ok(reaction,'an ordinary free-kick shot allows the promoted keeper to react');
  const after=reaction?applyMove(before,keeper.id,reaction.x,reaction.y,{roll:0}):skipMove(before,{roll:0});
  assert.equal(after.lastAction.type,'goal');
  return {...f,awarded,before,after,history,replay:buildGoalReplay(history.map(game=>({game})),before,after)};
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
  if(current.phase==='cornerSelect')current=take(selectCornerTaker(current,'white-Q'));
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
  if(!ownGoal){
    const selection=replay.frames.find(frame=>frame.action?.type==='cornerTaker');
    assert.ok(selection,'the chosen corner taker is preserved in the scoring build-up');
    assert.equal(selection.action.pieceId,'white-Q');assert.match(selection.caption,/chooses the queen as corner taker/);
  }
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

for(const team of ['white','black']){
  test(`${team}: a red card and penalty goal keep the real reduced roster through JSON storage`,()=>{
    const {replay,awarded,before,after,offenderId}=recordedFoulGoal({team});assert.ok(replay);
    assert.equal(replay.frames[0].pieces.length,22);
    const foul=replay.frames.find(frame=>frame.action?.type==='foul');assert.ok(foul);
    assert.equal(foul.pieces.length,21);assert.equal(foul.action.sentOffId,offenderId);
    assert.equal(foul.action.outcome,'penalty');assert.deepEqual(foul.action.contactSpot,awarded.lastAction.contactSpot);
    assert.deepEqual(foul.sentOff,awarded.sentOff);assert.match(foul.caption,/Red card.*penalty is awarded/);
    for(const frame of replay.frames.slice(replay.frames.indexOf(foul))){
      assert.ok(!frame.pieces.some(piece=>piece.id===offenderId));assert.equal(frame.sentOff.length,1);
    }
    assert.equal(before.pendingShot.penalty,true);
    assert.equal(replay.frames.at(-2).action.penalty,true);
    assert.equal(replay.frames.at(-1).action.penalty,true);assert.equal(replay.frames.at(-1).action.probability,.8);
    assert.equal(replay.frames.at(-1).action.keeperMove,undefined);
    assert.deepEqual(replay.frames.at(-1).action.path,after.lastAction.path);
    assert.match(replay.frames.at(-1).caption,/scores a penalty.*Keeper holds for the penalty/);
    assert.equal(after.pieces.length,21,'the subsequent kickoff does not resurrect the dismissed player');
    assert.deepEqual(restoreGoalReplay(JSON.parse(JSON.stringify(replay))),replay);
    const movedKeeper=clone(replay),final=movedKeeper.frames.at(-1),keeper=final.pieces.find(piece=>piece.type==='K'&&piece.team!==team);
    final.action.keeperMove={pieceId:keeper.id,from:{x:keeper.x,y:keeper.y},to:{x:keeper.x,y:keeper.y}};
    assert.equal(restoreGoalReplay(movedKeeper),null,'penalties cannot acquire a keeper reaction in storage');
  });

  test(`${team}: a dismissed goalkeeper is replaced under its teammate's original ID and can react later`,()=>{
    const {replay,awarded,offenderId}=recordedFoulGoal({team,inside:false,keeper:true,moveKeeper:true});assert.ok(replay);
    const replacement=awarded.pieces.find(piece=>piece.replacementKeeper),foul=replay.frames.find(frame=>frame.action?.type==='foul');
    assert.ok(replacement);assert.notEqual(replacement.id,offenderId);assert.equal(replacement.originalType,'P');
    assert.deepEqual(foul.action.keeperReplacement,awarded.lastAction.keeperReplacement);
    const original=replay.frames[0].pieces.find(piece=>piece.id===replacement.id);
    assert.equal(original.type,'P');assert.equal(original.replacementKeeper,undefined);
    const promoted=foul.pieces.find(piece=>piece.id===replacement.id);
    assert.equal(promoted.type,'K');assert.equal(promoted.originalType,'P');assert.equal(promoted.replacementKeeper,true);
    assert.match(foul.caption,/Red card.*free kick.*takes over in goal/);
    assert.equal(replay.frames.at(-1).action.keeperMove.pieceId,replacement.id);
    assert.deepEqual(restoreGoalReplay(clone(replay)),replay);
    const invented=clone(replay);
    invented.frames.find(frame=>frame.action?.type==='foul').action.keeperReplacement.originalType='Q';
    assert.equal(restoreGoalReplay(invented),null,'the retained ID bounds the original role');
  });

  test(`${team}: plain fouls and yellow cards retain their distinct captions and on-field roles`,()=>{
    for(const [roll,card]of [[.08,null],[.04,'yellow']]){
      const {replay,offenderId}=recordedFoulGoal({team,roll});assert.ok(replay);
      const foul=replay.frames.find(frame=>frame.action?.type==='foul'),offender=foul.pieces.find(piece=>piece.id===offenderId);
      assert.equal(foul.action.card,card);assert.equal(foul.pieces.length,22);assert.deepEqual(foul.sentOff,[]);
      assert.equal(offender.type,'R');assert.equal(offender.yellowCards,card?1:undefined);
      assert.equal(/Yellow card/.test(foul.caption),!!card);
      assert.deepEqual(restoreGoalReplay(clone(replay)),replay);
    }
  });
}

test('a real second yellow produces one dismissal and preserves its two-card ledger',()=>{
  const f=foulFixture(),first=applyMove(f.state,f.offenderId,f.target.x,f.target.y,{roll:.04});
  const positioned=clone(first);positioned.restart=null;positioned.phase='defendMove';positioned.positionBudget={normalUsed:false,pawnUsed:false,dribbleUsed:false};
  const second=applyMove(positioned,f.offenderId,6,3,{roll:.04});assert.equal(second.lastAction.secondYellow,true);
  const defence=skipMove(second),ready=skipMove(defence),shot=legalKicks(ready).find(kick=>kick.goal===f.team);
  const before=applyKick(ready,shot.x,shot.y),after=skipMove(before,{roll:0});
  const replay=buildGoalReplay([f.state,first,positioned,second,defence,ready,before].map(game=>({game})),before,after);assert.ok(replay);
  const foul=replay.frames.find(frame=>frame.action?.secondYellow);
  assert.equal(foul.action.card,'red');assert.match(foul.caption,/second yellow means a red card/);
  assert.deepEqual(foul.sentOff.map(piece=>[piece.id,piece.reason,piece.yellowCards]),[[f.offenderId,'secondYellow',2]]);
  assert.deepEqual(restoreGoalReplay(clone(replay)),replay);
});

test('a full legacy schema-two replay without card or role metadata still restores safely',()=>{
  const legacy=clone(recordedGoal().replay);
  for(const frame of legacy.frames){delete frame.sentOff;for(const piece of frame.pieces){delete piece.yellowCards;delete piece.originalType;delete piece.replacementKeeper;}}
  const restored=restoreGoalReplay(legacy);assert.ok(restored);
  assert.ok(restored.frames.every(frame=>frame.pieces.length===22&&frame.sentOff.length===0));
  assert.equal(restored.version,2);assert.deepEqual(restoreGoalReplay(restored),restored);
});

test('same-size historical goal-front occupants remain in their recorded cells after the live rule reserves them for the keeper',()=>{
  const legacy=clone(recordedGoal().replay);
  for(const frame of legacy.frames){const knight=frame.pieces.find(piece=>piece.id==='black-N2');knight.x=5;knight.y=0;assert.equal(canOccupySquare(knight,5,0),false);}
  const restored=restoreGoalReplay(legacy);assert.ok(restored);
  for(const frame of restored.frames)assert.deepEqual(frame.pieces.find(piece=>piece.id==='black-N2'),legacy.frames[0].pieces.find(piece=>piece.id==='black-N2'));
  const opposingKing=clone(legacy);
  for(const frame of opposingKing.frames){const king=frame.pieces.find(piece=>piece.id==='white-K');king.x=6;king.y=0;}
  assert.equal(restoreGoalReplay(opposingKing),null,'historical outfield compatibility does not allow kings into the opponent box');
});

test('a seven-a-side goal remains recordable with all eight departed original IDs accounted for',()=>{
  const {state,target}=fixture(),ids=['Q','R2','B1','B2'];
  const removed=state.pieces.filter(piece=>ids.includes(piece.id.split('-')[1]));
  state.pieces=state.pieces.filter(piece=>!removed.includes(piece));state.sentOff=removed.map(piece=>({...piece,reason:'red',yellowCards:0}));
  const before=applyKick(state,target.x,target.y),after=skipMove(before,{roll:0});
  const replay=buildGoalReplay([{game:state},{game:before}],before,after);assert.ok(replay);
  assert.ok(replay.frames.every(frame=>frame.pieces.length===14&&frame.sentOff.length===8));
  assert.deepEqual(restoreGoalReplay(clone(replay)),replay);
  const missing=clone(replay);missing.frames[0].sentOff.pop();assert.equal(restoreGoalReplay(missing),null);
});

test('stored card replays reject missing ledgers, resurrected players and invented keeper promotions',()=>{
  const {replay}=recordedFoulGoal({inside:false,keeper:true}),foulIndex=replay.frames.findIndex(frame=>frame.action?.type==='foul');
  assert.ok(replay);
  const mutations=[
    value=>delete value.frames[foulIndex].sentOff,
    value=>value.frames[foulIndex].sentOff.push(clone(value.frames[foulIndex].sentOff[0])),
    value=>value.frames[foulIndex].sentOff[0].reason='injury',
    value=>value.frames[foulIndex].action.card='yellow',
    value=>value.frames[foulIndex].action.offenderId='white-K',
    value=>value.frames[foulIndex].action.targetId=value.frames[foulIndex].action.offenderId,
    value=>delete value.frames[foulIndex].action.keeperReplacement,
    value=>value.frames[foulIndex].pieces.find(piece=>piece.replacementKeeper).originalType='Q',
    value=>{const next=value.frames[foulIndex+1],departed=next.sentOff.pop();next.pieces.push({...departed,reason:undefined,yellowCards:undefined});},
    value=>value.frames[foulIndex+1].sentOff[0].x++,
    value=>{const promoted=value.frames[0].pieces.find(piece=>piece.id==='white-P1');promoted.type='K';promoted.originalType='P';promoted.replacementKeeper=true;},
    value=>{const promoted=value.frames[foulIndex].pieces.find(piece=>piece.replacementKeeper);promoted.x=5;promoted.y=H-1;},
  ];
  for(const mutate of mutations){const invalid=clone(replay);mutate(invalid);assert.equal(restoreGoalReplay(invalid),null);}
});

// A small DOM surface exercises playback state, independently of app rendering.
function replayDOM(){
  class Element{
    constructor(tag='div'){this.tagName=tag;this.children=[];this.style={};this.dataset={};this.attributes=new Map();this.listeners=new Map();this.className='';this.hidden=false;this.textContent='';}
    append(...nodes){for(const node of nodes){node.remove();node.parentElement=this;this.children.push(node);}}
    replaceChildren(...nodes){for(const child of [...this.children])child.remove();this.append(...nodes);}
    remove(){if(this.parentElement){const siblings=this.parentElement.children;siblings.splice(siblings.indexOf(this),1);this.parentElement=null;}}
    setAttribute(name,value){this.attributes.set(name,String(value));if(name==='class')this.className=String(value);}
    getAttribute(name){return this.attributes.get(name)??null;}
    get firstElementChild(){return this.children[0]??null;}
    getBoundingClientRect(){return {width:350};}
    querySelectorAll(selector){const classes=selector.split(',').map(value=>value.trim().slice(1)),result=[];for(const child of this.children){if(classes.some(name=>child.className.split(' ').includes(name)))result.push(child);result.push(...child.querySelectorAll(selector));}return result;}
    addEventListener(type,handler){if(!this.listeners.has(type))this.listeners.set(type,[]);this.listeners.get(type).push(handler);}
    fire(type){for(const handler of this.listeners.get(type)||[])handler({target:this});}
  }
  const ids=['replayPitch','replayBoard','replayOverlay','replayBall','replayPlayBtn','replayPrevBtn','replayNextBtn','replayRestartBtn','replayScrub','replayStep','replayCaption','replayScore','replayMoment','replayTitle','replayDetails'];
  const nodes=Object.fromEntries(ids.map(id=>[id,new Element()]));
  return {nodes,document:{getElementById:id=>nodes[id],createElement:tag=>new Element(tag),createElementNS:(_namespace,tag)=>new Element(tag)}};
}

test('scrubbing a keeper dismissal hides the departed ID, changes the retained pawn role and reverses both',()=>{
  const {replay,awarded,offenderId}=recordedFoulGoal({keeper:true,inside:false}),replacement=awarded.pieces.find(piece=>piece.replacementKeeper);
  const dom=replayDOM(),previousDocument=globalThis.document;globalThis.document=dom.document;
  try{
    let completions=0,interactions=0;
    const player=createReplayPlayer({onComplete:()=>completions++,onInteract:()=>interactions++});
    assert.equal(dom.nodes.replayBoard.children.length,W*H);
    assert.equal(player.load(replay,{autoplay:false}),true);
    const tokens=()=>dom.nodes.replayPitch.children.filter(node=>node.className==='replay-token');
    const token=id=>tokens().find(node=>node.dataset.pieceId===id);
    const seek=index=>{dom.nodes.replayScrub.value=String(index);dom.nodes.replayScrub.fire('input');};
    assert.equal(tokens().filter(node=>!node.hidden).length,22);
    assert.equal(token(replacement.id).firstElementChild.textContent,'♟');
    seek(replay.frames.findIndex(frame=>frame.action?.type==='foul'));
    assert.equal(token(offenderId).hidden,true);assert.equal(token(offenderId).style.display,'none');
    assert.equal(token(offenderId).getAttribute('aria-hidden'),'true');
    assert.equal(tokens().filter(node=>!node.hidden).length,21);
    assert.equal(token(replacement.id).firstElementChild.textContent,'♚');assert.equal(token(replacement.id).dataset.pieceRole,'K');
    assert.equal(token(replacement.id).dataset.replacementKeeper,'true');assert.match(token(replacement.id).getAttribute('aria-label'),/originally pawn/);
    assert.equal(dom.nodes.replayMoment.textContent,'RED CARD');
    seek(0);
    assert.equal(token(offenderId).hidden,false);assert.equal(token(offenderId).style.display,'');assert.equal(token(offenderId).getAttribute('aria-hidden'),'false');
    assert.equal(token(replacement.id).firstElementChild.textContent,'♟');assert.equal(token(replacement.id).dataset.replacementKeeper,'false');
    seek(replay.frames.length-1);assert.equal(token(offenderId).hidden,true);
    assert.equal(player.load(recordedGoal().replay,{autoplay:false}),true);
    assert.equal(tokens().filter(node=>!node.hidden).length,22,'loading another full-roster goal clears the previous hidden state');
    assert.equal(token(replacement.id).firstElementChild.textContent,'♟');
    assert.equal(completions,0);assert.equal(interactions,3);player.stop();
  }finally{if(previousDocument===undefined)delete globalThis.document;else globalThis.document=previousDocument;}
});

test('replay shows and clears yellow-card badges while penalty frames use their own label and odds',()=>{
  const {replay,offenderId}=recordedFoulGoal({roll:.04}),dom=replayDOM(),previousDocument=globalThis.document;globalThis.document=dom.document;
  try{
    const player=createReplayPlayer();assert.equal(player.load(replay,{autoplay:false}),true);
    const token=dom.nodes.replayPitch.children.find(node=>node.dataset.pieceId===offenderId),seek=index=>{dom.nodes.replayScrub.value=String(index);dom.nodes.replayScrub.fire('input');};
    assert.equal(token.querySelectorAll('.yellow-card-badge').length,0);
    seek(replay.frames.findIndex(frame=>frame.action?.type==='foul'));
    assert.equal(token.querySelectorAll('.yellow-card-badge').length,1);assert.match(token.getAttribute('aria-label'),/yellow card/);
    assert.equal(dom.nodes.replayMoment.textContent,'YELLOW CARD');
    seek(replay.frames.length-2);assert.equal(dom.nodes.replayMoment.textContent,'PENALTY');
    assert.match(dom.nodes.replayDetails.textContent,/80% penalty scoring chance/);
    seek(0);assert.equal(token.querySelectorAll('.yellow-card-badge').length,0);assert.doesNotMatch(token.getAttribute('aria-label'),/yellow card/);
    player.stop();
  }finally{if(previousDocument===undefined)delete globalThis.document;else globalThis.document=previousDocument;}
});

function recordedDisguisedGoal({team='white',knight=false}={}){
  const shooterId=`${team}-${knight?'N1':'Q'}`,spot=team==='white'?[6,1]:[7,H-2];
  const {state}=fixture({team,knight,extraPositions:{[shooterId]:spot,'black-K':[5,0]}});
  state.ball={x:spot[0],y:spot[1],carrierId:shooterId};
  const target=legalKicks(state).filter(kick=>kick.goal===team).sort((a,b)=>a.x-b.x)[0];assert.ok(target);
  const before=applyKick(state,target.x,target.y,{disguise:true});
  assert.equal(before.pendingShot.disguised,true);assert.equal(before.pendingShot.targetOptions.length,2);
  const after=skipMove(before,{roll:0,targetRoll:.99});assert.equal(after.lastAction.type,'goal');
  const replay=buildGoalReplay([{game:state},{game:before}],before,after);assert.ok(replay);
  return {state,before,after,replay};
}

for(const team of ['white','black'])for(const knight of [false,true])test(`${team} ${knight?'knight':'queen'} replay declares two possibilities and records only the actual goal trajectory`,()=>{
  const {before,after,replay}=recordedDisguisedGoal({team,knight}),declaration=replay.frames.at(-2),final=replay.frames.at(-1);
  assert.equal(declaration.action.disguised,true);assert.equal(declaration.action.targetOptions.length,2);
  assert.equal(declaration.action.to,undefined);assert.equal(declaration.action.path,undefined);assert.equal(declaration.action.chosenTargetIndex,undefined);
  assert.match(declaration.caption,/50\/50.*after the keeper reacts/);
  assert.deepEqual(declaration.action.targetOptions.map(({x,y})=>({x,y})),before.pendingShot.targetOptions.map(({x,y})=>({x,y})));
  assert.equal(final.action.chosenTargetIndex,1);assert.deepEqual(final.ball,{...after.lastAction.goalTarget,carrierId:null});
  assert.deepEqual(final.action.path,after.lastAction.path);assert.equal(final.action.probability,after.lastAction.probability);
  assert.equal(final.action.combinedProbability,after.lastAction.combinedProbability);assert.equal(final.action.targetProbability,.5);
  assert.match(final.caption,/actual target is revealed after the keeper reacts/);
  assert.deepEqual(restoreGoalReplay(JSON.parse(JSON.stringify(replay))),replay);
});

test('disguised replay scrub shows both declared paths, then only the actual resolved path',()=>{
  const {replay}=recordedDisguisedGoal(),dom=replayDOM(),previousDocument=globalThis.document;globalThis.document=dom.document;
  try{
    const player=createReplayPlayer();assert.equal(player.load(replay,{autoplay:false}),true);
    const seek=index=>{dom.nodes.replayScrub.value=String(index);dom.nodes.replayScrub.fire('input');};
    seek(replay.frames.length-2);
    assert.equal(dom.nodes.replayOverlay.querySelectorAll('.replay-action-line').length,2);
    assert.equal(dom.nodes.replayMoment.textContent,'SHOT DECLARED');assert.match(dom.nodes.replayCaption.textContent,/50\/50/);
    assert.match(dom.nodes.replayDetails.textContent,/combined chance.*at the chosen target/);
    seek(replay.frames.length-1);assert.equal(dom.nodes.replayOverlay.querySelectorAll('.replay-action-line').length,1);
    assert.equal(dom.nodes.replayMoment.textContent,'GOAL');
    seek(0);assert.equal(dom.nodes.replayOverlay.querySelectorAll('.replay-action-line').length,0);
    player.stop();
  }finally{if(previousDocument===undefined)delete globalThis.document;else globalThis.document=previousDocument;}
});

test('stored disguised replay rejects revealed declarations, invalid target pairs and forged chosen indices',()=>{
  const {replay}=recordedDisguisedGoal(),declaration=value=>value.frames.at(-2).action,final=value=>value.frames.at(-1).action;
  const mutations=[
    value=>declaration(value).chosenTargetIndex=0,
    value=>declaration(value).to={...declaration(value).targetOptions[0]},
    value=>declaration(value).path=[declaration(value).from,declaration(value).targetOptions[0]],
    value=>declaration(value).targetOptions.pop(),
    value=>declaration(value).targetOptions[1]={...declaration(value).targetOptions[0]},
    value=>declaration(value).targetOptions[0].path[0].x++,
    value=>declaration(value).targetOptions[0].y=H,
    value=>final(value).chosenTargetIndex=0,
    value=>final(value).targetProbability=.7,
    value=>final(value).combinedProbability=1.1,
    value=>delete final(value).disguised,
  ];
  for(const mutate of mutations){const invalid=clone(replay);mutate(invalid);assert.equal(restoreGoalReplay(invalid),null);}
});
