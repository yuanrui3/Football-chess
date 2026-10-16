import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as E from '../dist/engine.js';
import {createMatchClock, settleMatchClock} from '../dist/match-clock.js';

const source = await readFile(new URL('../dist/engine.js', import.meta.url), 'utf8');
const internal = await import(`data:text/javascript;base64,${Buffer.from(source + '\nexport {tacticalSuccessors,tacticalStateKey};\n').toString('base64')}`);
const clone = structuredClone;
const other = team => team === 'white' ? 'black' : 'white';
const transform = (pair, team) => team === 'white' ? {x: pair[0], y: pair[1]} : {x: E.BOARD_WIDTH - 1 - pair[0], y: E.BOARD_HEIGHT - 1 - pair[1]};
const playerId = (id, team) => team === 'white' ? id : id.replace(/^(white|black)/, other);
const budget = () => ({normalUsed: false, pawnUsed: false, dribbleUsed: false});

// Full squads and legal squares keep restart ownership, nearest-player choice,
// offside, and tactical search identical to the playable game.
function fixture({team = 'white', phase = 'attackMove', carrier = 'white-Q', origin = [2,6], positions = {}, seed = 18409} = {}) {
  const state = E.createGame({mode: 'local', kickoff: team, seed});
  const assigned = {'white-K': [5,14], 'black-K': [6,0], 'black-N2': [10,0], [carrier]: origin, ...positions};
  const occupied = new Set(Object.values(assigned).map(pair => pair.join(',')));
  assert.equal(occupied.size, Object.keys(assigned).length, 'fixture assignments do not overlap');
  const parking = Array.from({length: E.BOARD_HEIGHT}, (_,y) => [[0,y],[E.BOARD_WIDTH-1,y]]).flat();
  for (const piece of state.pieces) {
    const pair = assigned[piece.id] || parking.find(pair => !occupied.has(pair.join(',')));
    occupied.add(pair.join(','));
    if (team === 'black') { piece.id = playerId(piece.id,team); piece.team = other(piece.team); }
    Object.assign(piece,transform(pair,team));
  }
  const holder = state.pieces.find(piece => piece.id === playerId(carrier,team));
  state.attack = team; state.phase = phase; state.ball = {x: holder.x,y: holder.y,carrierId: holder.id};
  state.restart = null; state.offside = null; state.pendingShot = null; state.passRun = null;
  state.releaseReason = null; state.looseBallKickOrigin = null; state.positionBudget = budget(); state.paceControl = null;
  state.ballProgress = {team,anchorY: state.ball.y,rounds: 0,pendingRelease: false,excludeRelease: false};
  integrity(state);
  return state;
}
function integrity(state) {
  assert.equal(state.pieces.length,22);
  assert.equal(new Set(state.pieces.map(piece => `${piece.x},${piece.y}`)).size,22);
  assert.ok(state.pieces.every(piece => E.canOccupySquare(piece,piece.x,piece.y)));
  if (state.ball.carrierId) {
    const piece = state.pieces.find(piece => piece.id === state.ball.carrierId);
    assert.ok(piece); assert.equal(piece.team,state.attack);
    assert.deepEqual({x: state.ball.x,y: state.ball.y},{x: piece.x,y: piece.y});
  }
}
function tracker(state, fields = {}) {
  return {team: state.attack,carrierId: state.ball.carrierId,dribbleRounds: 0,dribbledThisRound: false,history: [],furthestAdvance: state.attack === 'white' ? -state.ball.y : state.ball.y,...fields};
}
function ready(state) {
  let next = state;
  if (next.phase === 'attackMove') next = E.skipMove(next);
  if (next.phase === 'defendMove') next = E.skipMove(next);
  assert.ok(['kick','keeperRelease','kickoff'].includes(next.phase));
  return next;
}
function move(state,id,target,team=state.attack,options={}) {
  const point = transform(target,team), before = clone(state);
  assert.ok(E.legalMoves(state,playerId(id,team),options).some(move => move.x === point.x && move.y === point.y),`legal ${id} move to ${point.x},${point.y}`);
  const result = E.applyMove(state,playerId(id,team),point.x,point.y,options);
  assert.deepEqual(state,before,'actions leave Undo snapshots intact'); integrity(result); return result;
}
function kick(state,target,team=state.attack,options={roll:0}) {
  const point = transform(target,team), before = clone(state);
  assert.ok(E.legalKicks(state).some(kick => kick.x === point.x && kick.y === point.y),`legal kick to ${point.x},${point.y}`);
  const result = E.applyKick(state,point.x,point.y,options);
  assert.deepEqual(state,before); integrity(result); return result;
}
function assertPaceAward(state,team,reason,offence) {
  assert.equal(state.lastAction.type,'stalling'); assert.equal(state.lastAction.team,team);
  assert.equal(state.lastAction.reason,reason); assert.equal(state.restart.type,'stalling');
  assert.equal(state.restart.reason,reason); assert.equal(state.restart.team,other(team));
  assert.equal(state.restart.indirect,true); assert.equal(state.attack,other(team));
  assert.equal(state.phase,'attackMove'); assert.equal(state.ball.carrierId,state.restart.takerId);
  assert.ok(state.lastAction.triggeringAction); if (offence) assert.deepEqual(state.lastAction.offence,offence);
  assert.equal(E.paceInfo(state).active,false); integrity(state);
}

test('pace policy allows four carrying rounds and uses a bounded three-occurrence repetition window', () => {
  assert.deepEqual(E.PACE_RULE,{maxDribbleRounds:4,repetitionOccurrences:3,maxCycleRounds:3,historyRounds:7});
  for (const team of ['white','black']) {
    const state = fixture({team}), before = clone(state), info = E.paceInfo(state);
    assert.equal(info.team,team); assert.equal(info.active,true); assert.equal(info.dribbleRounds,0);
    assert.equal(info.dribbleRoundsRemaining,4); assert.equal(info.warning,false);
    for (const piece of state.pieces) E.legalMoves(state,piece.id);
    E.legalKicks(state); assert.deepEqual(state,before,'previews do not spend a round or consume RNG');
  }
});

for (const team of ['white','black']) {
  test(`${team}: four same-player carrying rounds are allowed; the fifth self-pass collection awards the nearest opponent a free kick`, () => {
    let state = fixture({team,phase:'kick',origin:[2,8],positions:{'black-R1':[4,3]}});
    state = kick(state,[2,7],team);
    assert.equal(E.paceInfo(state).dribbleRounds,0,'a kick without carrying is not a dribble');
    for (let round=1;round<=4;round++) {
      state = move(state,'white-Q',[2,8-round],team);
      assert.equal(state.lastAction.selfPassCollection,true);
      assert.equal(E.paceInfo(state).dribbledThisRound,true);
      assert.equal(E.paceInfo(state).dribbleRounds,round-1,'the move is not an additional completed round');
      state = kick(ready(state),[2,7-round],team);
      assert.equal(state.restart,null,`round ${round} remains legal`);
      assert.equal(E.paceInfo(state).dribbleRounds,round);
    }
    const before = clone(state), offence = {x: state.ball.x,y: state.ball.y}, source = state.pieces.find(piece=>piece.id===playerId('white-Q',team));
    state = move(state,'white-Q',[2,3],team);
    assertPaceAward(state,team,'dribbleLimit',offence);
    assert.equal(state.restart.takerId,playerId('black-R1',team));
    assert.deepEqual(state.pieces.find(piece=>piece.id===source.id),source,'fifth carry is called before moving the offender');
    assert.equal(state.randomState,before.randomState,'the deterministic offence does not draw randomness');
  });

  test(`${team}: four rounds persist through skipped turns and an empty-space pass`, () => {
    let state = fixture({team}); state.paceControl = tracker(state,{dribbleRounds:4});
    state = ready(state);
    assert.equal(E.paceInfo(state).dribbleRounds,4);
    state = kick(state,[3,6],team);
    assert.equal(state.restart,null); assert.equal(E.paceInfo(state).dribbleRounds,4);
    const offence = {x:state.ball.x,y:state.ball.y};
    assertPaceAward(move(state,'white-Q',[3,6],team),team,'dribbleLimit',offence);
  });

  test(`${team}: a fifth ordinary dribble is called at the pre-move ball position and preserves score and discipline`, () => {
    const state = fixture({team,positions:{'black-B1':[2,5],'black-R1':[8,7]}});
    state.score = {white:2,black:1}; state.discipline[playerId('white-P1',team)] = {yellowCards:1,redCard:false};
    state.paceControl = tracker(state,{dribbleRounds:4});
    const before = clone(state), result = move(state,'white-Q',[8,6],team);
    assertPaceAward(result,team,'dribbleLimit',{x:state.ball.x,y:state.ball.y});
    assert.equal(result.restart.takerId,playerId('black-B1',team),'nearest player is measured from original ball, not intended destination');
    assert.deepEqual(result.score,before.score); assert.deepEqual(result.discipline,before.discipline);
    assert.equal(result.pieces.length,before.pieces.length); assert.equal(result.randomState,before.randomState);
  });

  test(`${team}: controlled teammate possession resets the carrying limit, while off-ball moves do not`, () => {
    let state = fixture({team,positions:{'white-R1':[8,6],'white-P1':[9,10],'black-P1':[9,4]}});
    state.paceControl = tracker(state,{dribbleRounds:4});
    state = move(state,'white-P1',[10,10],team,{freePawn:true});
    assert.equal(E.paceInfo(state).dribbleRounds,4);
    state = E.skipMove(state);
    state = move(state,'black-P1',[10,4],team,{freePawn:true});
    assert.equal(E.paceInfo(state).dribbleRounds,4);
    state = kick(ready(state),[8,6],team);
    assert.equal(E.paceInfo(state).dribbleRounds,0); assert.equal(E.paceInfo(state).carrierId,playerId('white-R1',team));
    const carried = move(state,'white-R1',[8,5],team);
    assert.equal(carried.restart,null); assert.equal(E.paceInfo(carried).dribbledThisRound,true);
  });

  test(`${team}: completed passing cycles penalize their possessing initiator, ignoring both sides' off-ball shuffles`, () => {
    let state = fixture({team,phase:'kick',positions:{'white-R1':[8,6],'white-P1':[9,10],'black-P1':[9,4]}});
    for (let round=1;round<=5;round++) {
      const target = round%2 ? [8,6] : [2,6];
      if (round>1) {
        state = move(state,'white-P1',round%2?[9,10]:[10,10],team,{freePawn:true});
        state = E.skipMove(state);
        state = move(state,'black-P1',round%2?[9,4]:[10,4],team,{freePawn:true});
        state = ready(state);
      }
      state = kick(state,target,team);
      if (round<5) { assert.equal(state.restart,null); assert.ok(E.paceInfo(state).historyRounds<=E.PACE_RULE.historyRounds); }
      else assertPaceAward(state,team,'repetition');
    }
  });

  test(`${team}: genuine forward progress clears a lateral passing repetition pattern`, () => {
    let state = fixture({team,phase:'kick',positions:{'white-R1':[8,6],'white-R2':[8,5]}});
    for (const target of [[8,6],[2,6],[8,6],[8,5]]) state = kick(ready(state),target,team);
    assert.equal(state.restart,null); assert.ok(E.paceInfo(state).historyRounds<=1,'new furthest completed advance clears stale repetition');
  });

  test(`${team}: an unchanged loose ball counts only completed rounds and eventually penalizes its attacking initiator`, () => {
    let state=kick(fixture({team,phase:'kick'}),[3,6],team);
    assert.equal(E.paceInfo(state).historyRounds,1);
    state=E.skipMove(state); assert.equal(E.paceInfo(state).historyRounds,1);
    state=E.skipMove(state); assert.equal(E.paceInfo(state).historyRounds,2); assert.equal(state.restart,null);
    state=E.skipMove(state); assert.equal(state.restart,null,'the defending reply alone is not the cause');
    assertPaceAward(E.skipMove(state),team,'repetition');
  });

  test(`${team}: a three-round queen-rook-knight passing loop is called on its third recurring endpoint`, () => {
    let state=fixture({team,phase:'kick',positions:{'white-R1':[4,6],'white-N1':[4,5]}});
    const route=[[4,6],[4,5],[2,6],[4,6],[4,5],[2,6],[4,6],[4,5]];
    for(let index=0;index<route.length;index++) {
      state=kick(ready(state),route[index],team);
      if(index<route.length-1) assert.equal(state.restart,null);
    }
    assertPaceAward(state,team,'repetition'); assert.equal(state.lastAction.cycleRounds,3);
  });

  test(`${team}: a shot declaration, interception and successful tackle reset the prior carrying streak`, () => {
    let shot=fixture({team,phase:'kick',origin:[6,4]}); shot.paceControl=tracker(shot,{dribbleRounds:4});
    shot=kick(shot,[6,-1],team); assert.equal(shot.phase,'keeperReact'); assert.equal(E.paceInfo(shot).dribbleRounds,0);
    let intercepted=fixture({team,phase:'kick',positions:{'black-R1':[8,6]}}); intercepted.paceControl=tracker(intercepted,{dribbleRounds:4});
    intercepted=kick(intercepted,[8,6],team); assert.equal(intercepted.lastAction.type,'interception'); assert.equal(intercepted.attack,other(team)); assert.equal(E.paceInfo(intercepted).dribbleRounds,0);
    let tackled=fixture({team,phase:'defendMove',positions:{'black-R1':[2,4]}}); tackled.paceControl=tracker(tackled,{dribbleRounds:4});
    const challenger=playerId('black-R1',team),choice=E.legalMoves(tackled,challenger).find(move=>move.type==='tackle'); assert.ok(choice);
    tackled=E.applyMove(tackled,challenger,choice.x,choice.y,{roll:0}); assert.equal(tackled.lastAction.type,'tackle'); assert.equal(tackled.attack,other(team)); assert.equal(E.paceInfo(tackled).dribbleRounds,0);
  });

  test(`${team}: forced goalkeeper release counts once and starts the new controller at zero carrying rounds`, () => {
    let state = fixture({team,phase:'kick',origin:[2,6],positions:{'white-K':[2,14],'white-R1':[4,12]}});
    state.paceControl = tracker(state,{dribbleRounds:4,history:[]});
    state = kick(state,[2,14],team); assert.equal(state.phase,'keeperRelease');
    assert.equal(E.paceInfo(state).dribbleRounds,0);
    const count = E.paceInfo(state).historyRounds;
    state = kick(state,[4,12],team);
    assert.equal(state.restart,null); assert.equal(E.paceInfo(state).dribbleRounds,0);
    assert.ok(E.paceInfo(state).historyRounds<=count+1,'two physical kicks cannot register two completed ordinary rounds');
  });

  test(`${team}: kickoff and protected restarts exclude preparation and taking kick from pace limits`, () => {
    for (const type of [null,'goalKick','corner','throwIn','offside','stalling','freeKick']) {
      let state = fixture({team,phase:type?'attackMove':'kickoff',carrier:type==='goalKick'?'white-K':'white-Q',origin:type==='goalKick'?[5,14]:[2,6]});
      if (type) state.restart={type,team,takerId:state.ball.carrierId,spot:{x:state.ball.x,y:state.ball.y},indirect:['offside','stalling'].includes(type)};
      state.paceControl = tracker(state,{dribbleRounds:4,history:['bad-history-that-must-not-be-used']});
      assert.equal(E.paceInfo(state).active,false);
      state = ready(state);
      const candidate = E.legalKicks(state).find(kick=>!kick.goal&&!kick.receiverId&&kick.accuracy===1);
      assert.ok(candidate,`${type||'kickoff'} permits a controlled restart pass`);
      state = E.applyKick(state,candidate.x,candidate.y,{roll:0});
      assert.equal(state.restart,null); assert.equal(E.paceInfo(state).dribbleRounds,0); assert.equal(E.paceInfo(state).historyRounds,0);
    }
  });

  test(`${team}: new pace free kicks survive the final whistle through their protected taking kick and one live round`, () => {
    const before = fixture({team}); before.paceControl=tracker(before,{dribbleRounds:4});
    let state = move(before,'white-Q',[3,6],team), clock={...createMatchClock({remaining:0}),fullTimePending:true};
    let settled=settleMatchClock(clock,before,state);
    assert.equal(settled.finish,false); assert.deepEqual(settled.clock.finalChance,{team:other(team),phase:'restart'}); clock=settled.clock;
    for (let turn=0;turn<2;turn++) { const next=E.skipMove(state); settled=settleMatchClock(clock,state,next); assert.equal(settled.finish,false); state=next; clock=settled.clock; }
    const choice=E.legalKicks(state).find(kick=>!kick.goal&&!kick.receiverId&&kick.accuracy===1); assert.ok(choice);
    let next=E.applyKick(state,choice.x,choice.y,{roll:0}); settled=settleMatchClock(clock,state,next); assert.equal(settled.finish,false); assert.equal(settled.clock.finalChance.phase,'live'); state=next; clock=settled.clock;
    for (let turn=0;turn<2;turn++) { next=E.skipMove(state); settled=settleMatchClock(clock,state,next); state=next; clock=settled.clock; }
    assert.equal(settled.finish,true,'the protected restart grants one live opportunity, not unlimited extra time');
  });

  test(`${team}: a repetition award is also protected at zero while the existing own-half progress call keeps its prior clock scope`, () => {
    let state=fixture({team,phase:'kick',positions:{'white-R1':[8,6]}}),before;
    for(const target of [[8,6],[2,6],[8,6],[2,6],[8,6]]) { before=ready(state); state=kick(before,target,team); }
    assertPaceAward(state,team,'repetition');
    const clock={...createMatchClock({remaining:0}),fullTimePending:true},protectedCall=settleMatchClock(clock,before,state);
    assert.equal(protectedCall.finish,false); assert.deepEqual(protectedCall.clock.finalChance,{team:other(team),phase:'restart'});
    const old=fixture({team,phase:'kick',carrier:'white-R1',origin:[2,10],positions:{'white-R2':[8,10]}});
    old.ballProgress.rounds=2; const called=kick(old,[8,10],team);
    assert.equal(called.restart.reason,'stalling'); assert.equal(settleMatchClock(clock,old,called).finish,true);
  });
}

test('save restoration preserves a valid bounded pace tracker, old saves start fresh, malformed histories cannot create a penalty', () => {
  let state=fixture({phase:'kick',positions:{'white-R1':[8,6]}});
  for(const target of [[8,6],[2,6],[8,6]]) state=kick(ready(state),target);
  const before=clone(state),restored=E.normalizeGame(state);
  assert.deepEqual(state,before); assert.deepEqual(restored.paceControl,state.paceControl);
  assert.deepEqual(E.normalizeGame(clone(restored)),restored); assert.equal(restored.randomState,state.randomState);
  const legacy=clone(state); legacy.rulesVersion=17; delete legacy.paceControl;
  assert.equal(E.paceInfo(E.normalizeGame(legacy)).dribbleRounds,0);
  for(const malformed of [[],{},'oops',{team:'white',carrierId:'black-Q',dribbleRounds:4,history:Array(10000).fill('bad'),furthestAdvance:Infinity},tracker(state,{dribbleRounds:-1}),tracker(state,{dribbleRounds:NaN})]) {
    const damaged={...clone(state),paceControl:malformed},snapshot=clone(damaged),normalized=E.normalizeGame(damaged);
    assert.deepEqual(damaged,snapshot); assert.equal(normalized.randomState,state.randomState);
    const info=E.paceInfo(normalized); assert.ok(info.dribbleRounds>=0&&info.dribbleRounds<=4); assert.ok(info.historyRounds<=7);
    assert.equal(normalized.restart,null); assert.deepEqual(E.normalizeGame(clone(normalized)),normalized);
  }
});

test('an upper-boundary corner back-pass has JSON-stable pace metadata through the compulsory keeper release', () => {
  const state=fixture({phase:'kick',origin:[2,0],positions:{'white-K':[2,5]}});
  state.restart={type:'corner',team:'white',takerId:state.ball.carrierId,spot:{x:2,y:0},indirect:false};
  const release=kick(state,[2,5]); assert.equal(release.phase,'keeperRelease');
  assert.deepEqual(JSON.parse(JSON.stringify(release.paceControl)),release.paceControl,'saved and in-memory metadata must agree, including signed zero');
});

test('corrupted imported carrying metadata cannot invent an immediate fifth-carry offence', () => {
  for(const team of ['white','black']) {
    const state=fixture({team}),valid=tracker(state);
    const broken=[{...valid,carrierId:playerId('black-Q',team),dribbleRounds:4},{...valid,carrierId:'missing-player',dribbleRounds:4},{...valid,carrierId:null,dribbleRounds:4},
      ...[Infinity,NaN,-1,5,4.5,'4'].map(dribbleRounds=>({...valid,dribbleRounds})),{...valid,dribbleRounds:4,dribbledThisRound:'true'}];
    for(const paceControl of broken) {
      const damaged={...clone(state),paceControl},snapshot=clone(damaged),restored=E.normalizeGame(damaged);
      assert.deepEqual(damaged,snapshot); assert.equal(E.paceInfo(restored).dribbleRounds,0);
      assert.equal(move(restored,'white-Q',[3,6],team).restart,null,'the first real carry starts a fresh counter');
    }
  }
});

test('Tactical search treats pace history as rule-relevant while remaining seed-blind and bounded', () => {
  const state=fixture({phase:'kick',positions:{'white-R1':[8,6]}}), four={...clone(state),paceControl:tracker(state,{dribbleRounds:4})};
  const keys=[state,four,{...four,paceControl:{...four.paceControl,dribbledThisRound:true}},{...four,paceControl:{...four.paceControl,history:['8,6:white-R1']}}].map(internal.tacticalStateKey);
  assert.equal(new Set(keys).size,keys.length,'same pitch with a different carrying limit or repetition history cannot share a cache entry');
  const options={maxDepth:2,nodeLimit:120},before=clone(four),a=E.analyzeTacticalAction(four,options),b=E.analyzeTacticalAction({...clone(four),randomState:987654321},options);
  assert.deepEqual(four,before); assert.deepEqual(a.action,b.action); assert.equal(a.value,b.value);
  assert.ok(a.stats.nodes<=options.nodeLimit); assert.ok(b.stats.nodes<=options.nodeLimit);
  const target=E.legalKicks(four).find(kick=>!kick.goal&&kick.accuracy===1),action={type:'kick',x:target.x,y:target.y};
  assert.deepEqual(internal.tacticalSuccessors(four,action),internal.tacticalSuccessors({...clone(four),randomState:0},action));
});

test('both bots can decline an illegal fifth carry and preserve the side\'s passing opportunity', () => {
  for(const team of ['white','black']) {
    const state=fixture({team,positions:{'white-R1':[8,6]}}); state.paceControl=tracker(state,{dribbleRounds:4});
    const before=clone(state),choices=[E.chooseAIAction(state,{difficulty:'casual'}),E.analyzeTacticalAction(state,{maxDepth:2,nodeLimit:120}).action];
    for(const action of choices) {
      assert.ok(!(action.type==='move'&&action.pieceId===state.ball.carrierId),'a safe pass or positioning choice remains instead of conceding a known carrying offence');
      const next=action.type==='move'?E.applyMove(state,action.pieceId,action.x,action.y,{freePawn:!!action.freePawn}):E.skipMove(state);
      assert.equal(next.restart,null);
    }
    assert.deepEqual(state,before);
  }
});
