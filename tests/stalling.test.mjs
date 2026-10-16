import test from 'node:test';
import assert from 'node:assert/strict';
import * as engine from '../dist/engine.js';

const {
  BOARD_WIDTH, BOARD_HEIGHT, canOccupySquare, RULES_VERSION, createGame, currentTeam, legalMoves,
  legalKicks, applyMove, applyKick, skipMove, normalizeGame, chooseAIAction,
} = engine;
const clone = value => JSON.parse(JSON.stringify(value));
const other = team => team === 'white' ? 'black' : 'white';
const mirror = ([x, y]) => [BOARD_WIDTH - 1 - x, BOARD_HEIGHT - 1 - y];
const freshBudget = () => ({normalUsed: false, pawnUsed: false, dribbleUsed: false});
const tracker = (team, anchorY, rounds = 0, extra = {}) => ({team, anchorY, rounds, pendingRelease: false, excludeRelease: false, ...extra});

// Complete rosters matter here: nearest-player awards and offside must use the
// same 22 players as a live match, with no incidental passing-ray blockers.
function fixture({team = 'white', phase = 'attackMove', suffix = 'R1', positions = {}, ball, rounds = 0, anchorY, seed = 837} = {}) {
  const transform = pair => team === 'white' ? pair : mirror(pair);
  const carrierId = `${team}-${suffix}`;
  const state = createGame({mode: 'local', kickoff: team, seed});
  const assigned = {[`${team}-K`]: transform([5,14]), [`${other(team)}-K`]: transform([6,0]), [`${other(team)}-N2`]: transform([10,0]), [carrierId]: transform([2,10]), ...positions};
  const occupied = new Set(Object.values(assigned).map(pair => pair.join(',')));
  assert.equal(occupied.size, Object.keys(assigned).length, 'fixture assignments do not overlap');
  const parking = Array.from({length: 12}, (_, index) => [[0,index + 3],[BOARD_WIDTH-1,index + 3]]).flat().map(transform);
  for (const piece of state.pieces) {
    const spot = assigned[piece.id] || parking.find(pair => !occupied.has(pair.join(',')));
    assert.ok(spot, `parking exists for ${piece.id}`);
    [piece.x, piece.y] = spot;
    occupied.add(spot.join(','));
  }
  const carrier = state.pieces.find(piece => piece.id === carrierId);
  state.attack = team;
  state.phase = phase;
  state.ball = ball || {x: carrier.x, y: carrier.y, carrierId};
  state.positionBudget = freshBudget();
  state.restart = null;
  state.offside = null;
  state.pendingShot = null;
  state.releaseReason = null;
  state.ballProgress = tracker(team, anchorY ?? state.ball.y, rounds);
  return state;
}

function integrity(state) {
  assert.equal(state.pieces.length, 22);
  assert.equal(new Set(state.pieces.map(piece => piece.id)).size, 22);
  assert.equal(new Set(state.pieces.map(piece => `${piece.x},${piece.y}`)).size, 22, 'no restart overlaps another player');
  for (const piece of state.pieces) {
    assert.ok(piece.x >= 0 && piece.x < BOARD_WIDTH && piece.y >= 0 && piece.y < BOARD_HEIGHT);
    assert.ok(canOccupySquare(piece,piece.x,piece.y),'current box eligibility is respected');
  }
  if (state.ball.carrierId) {
    const carrier = state.pieces.find(piece => piece.id === state.ball.carrierId);
    assert.ok(carrier);
    assert.equal(carrier.team, state.attack);
    assert.deepEqual({x: state.ball.x,y: state.ball.y}, {x: carrier.x,y: carrier.y});
  }
}

function kick(state, x, y, options = {roll: 0}) {
  assert.ok(legalKicks(state).some(candidate => candidate.x === x && candidate.y === y), `legal kick to ${x},${y}`);
  const before = clone(state);
  const result = applyKick(state, x, y, options);
  assert.deepEqual(state, before, 'completion preserves saved and undo snapshots');
  integrity(result);
  return result;
}
function ready(state) {
  let next = state;
  if (next.phase === 'attackMove') next = skipMove(next);
  if (next.phase === 'defendMove') next = skipMove(next);
  return next;
}
function complete(state, x, y) { return kick(ready(state), x, y); }
function freshProgress(state) {
  assert.deepEqual(state.ballProgress, tracker(state.attack, state.ball.y), 'new possession/restart gets a full three-round window');
}
function assertStall(state, offendingTeam) {
  assert.equal(state.attack, other(offendingTeam));
  assert.equal(state.phase, 'attackMove');
  assert.equal(state.restart?.type, 'stalling');
  assert.equal(state.restart.reason, 'stalling');
  assert.equal(state.restart.indirect, true);
  assert.equal(state.restart.team, other(offendingTeam));
  assert.equal(state.ball.carrierId, state.restart.takerId);
  assert.equal(state.lastAction.type, 'stalling');
  assert.ok(state.lastAction.triggeringAction, 'the action causing the call remains available for animation/audit');
  freshProgress(state);
  integrity(state);
}

test('anti-stalling rule is a shared three-round, four-net-row policy with pure previews', () => {
  assert.deepEqual(engine.STALLING_RULE, {rounds: 3, minProgress: 4});
  for (const team of ['white','black']) {
    const state = fixture({team, rounds: 2});
    const before = clone(state);
    const info = engine.progressInfo(state);
    assert.equal(info.team, team);
    assert.equal(info.rounds, 2);
    assert.equal(info.roundsRemaining, 1);
    assert.equal(info.progress, 0);
    assert.equal(info.needed, 4);
    assert.equal(info.active, true);
    assert.equal(info.warning, true);
    for (const piece of state.pieces) {
      legalMoves(state, piece.id);
      legalMoves(state, piece.id, {freePawn:true});
    }
    legalKicks(state);
    assert.deepEqual(state, before, 'rule previews do not move the clock or consume randomness');
  }
});

test('sideways possession is allowed twice and called only on the third completed round for either side', () => {
  for (const team of ['white','black']) {
    const transform = pair => team === 'white' ? pair : mirror(pair);
    let state = fixture({team, positions:{[`${team}-R2`]:transform([8,10])}});
    const startingSeed = state.randomState;
    for (const [index,target] of [[0,[8,10]],[1,[2,10]],[2,[8,10]]]) {
      const position = skipMove(state);
      assert.equal(position.ballProgress.rounds, index, 'attacking positioning is not a completed round');
      const kicking = skipMove(position);
      assert.equal(kicking.ballProgress.rounds, index, 'defensive positioning is not a completed round');
      state = kick(kicking, ...transform(target));
      if (index < 2) {
        assert.equal(state.restart, null);
        assert.equal(state.attack, team);
        assert.equal(state.ballProgress.rounds, index + 1);
        assert.equal(state.ballProgress.anchorY, transform([2,10])[1]);
      } else assertStall(state, team);
    }
    assert.notEqual(state.randomState, startingSeed, 'actual passes still consume the normal seeded outcome');
  }
});

test('three rows fails at the deadline while four rows succeeds and starts a new window, mirrored', () => {
  for (const team of ['white','black']) for (const rows of [3,4]) {
    const transform = pair => team === 'white' ? pair : mirror(pair);
    const target = transform([2,12 - rows]);
    const initial = fixture({team,phase:'kick',rounds:2,positions:{[`${team}-R1`]:transform([2,12]),[`${team}-R2`]:target}});
    const result = kick(initial,...target);
    if (rows === 3) assertStall(result,team);
    else {
      assert.equal(result.attack,team);
      assert.equal(result.restart,null);
      freshProgress(result);
    }
  }
});

test('small advances accumulate over three rounds, and reaching four early refreshes the window', () => {
  for (const team of ['white','black']) {
    const transform = pair => team === 'white' ? pair : mirror(pair);
    let state = fixture({team, positions:{
      [`${team}-R1`]:transform([2,13]),[`${team}-R2`]:transform([2,12]),[`${team}-Q`]:transform([2,11]),[`${team}-N1`]:transform([2,9]),
    }});
    for (const [round,target] of [[1,[2,12]],[2,[2,11]]]) {
      state = complete(state,...transform(target));
      assert.equal(state.ballProgress.rounds,round);
      assert.equal(state.ballProgress.anchorY,transform([2,13])[1]);
      assert.equal(engine.progressInfo(state).progress,round);
    }
    state = complete(state,...transform([2,9]));
    assert.equal(state.restart,null);
    freshProgress(state);
    const early = fixture({team,phase:'kick',positions:{[`${team}-R1`]:transform([2,13]),[`${team}-R2`]:transform([2,9])}});
    const progressed = kick(early,...transform([2,9]));
    freshProgress(progressed);
  }
});

test('forward then backward movement cannot reset the checkpoint before the round finishes', () => {
  for (const team of ['white','black']) {
    const transform = pair => team === 'white' ? pair : mirror(pair);
    const initial = fixture({team,suffix:'Q',rounds:2,positions:{[`${team}-R2`]:transform([6,10])}});
    const carried = applyMove(initial,`${team}-Q`,...transform([2,6]));
    assert.equal(engine.progressInfo(carried).progress,4);
    assert.equal(carried.ballProgress.rounds,2,'a transient advance does not erase previous completed rounds');
    assert.equal(carried.ballProgress.anchorY,initial.ballProgress.anchorY);
    const result = complete(carried,...transform([6,10]));
    assertStall(result,team);
  }
});

test('dribbles, off-ball moves and the shared pawn or king bonus do not each count as a possession round', () => {
  for (const team of ['white','black']) for(const useKing of [false,true]) {
    const transform = pair => team === 'white' ? pair : mirror(pair);
    let state = fixture({team,rounds:1,positions:{
      [`${team}-R2`]:transform([8,11]),[`${team}-P1`]:transform([9,9]),
      [`${other(team)}-R2`]:transform([8,3]),[`${other(team)}-P1`]:transform([9,4]),
    }});
    for (const action of [
      [`${team}-R1`,...transform([3,10]),{}],
      [`${team}-R2`,...transform([8,10]),{}],
      useKing ? [`${team}-K`,...transform([6,14]),{freePawn:true}] : [`${team}-P1`,...transform([10,9]),{freePawn:true}],
      [`${other(team)}-R2`,...transform([8,4]),{}],
      useKing ? [`${other(team)}-K`,...transform([7,0]),{freePawn:true}] : [`${other(team)}-P1`,...transform([10,4]),{freePawn:true}],
    ]) {
      state = applyMove(state,...action);
      assert.equal(state.ballProgress.rounds,1);
      assert.equal(state.restart,null);
    }
    assert.equal(state.phase,'kick');
    state = kick(state,...transform([8,10]));
    assert.equal(state.ballProgress.rounds,2,'only the eventual pass completes the round');
  }
});

test('a same-side loose pass counts, and uncollected full positioning cycles cannot stall forever', () => {
  for (const team of ['white','black']) {
    const transform = pair => team === 'white' ? pair : mirror(pair);
    let state = fixture({team,phase:'kick'});
    state = kick(state,...transform([5,10]));
    assert.equal(state.ball.carrierId,null);
    assert.equal(state.ballProgress.rounds,1);
    state = skipMove(state);
    assert.equal(state.ballProgress.rounds,1);
    state = skipMove(state);
    assert.equal(state.ballProgress.rounds,2);
    assert.equal(state.phase,'attackMove');
    state = skipMove(skipMove(state));
    assertStall(state,team);
  }
});

test('same-side loose-ball collection preserves the window, whereas opponent collection resets it', () => {
  for (const team of ['white','black']) for (const opposing of [false,true]) {
    const transform = pair => team === 'white' ? pair : mirror(pair);
    const collector = opposing ? other(team) : team;
    const ball = transform([3,10]);
    const state = fixture({team,phase:opposing?'defendMove':'attackMove',rounds:2,
      ball:{x:ball[0],y:ball[1],carrierId:null},positions:{[`${collector}-R2`]:transform([3,11])}});
    const result = applyMove(state,`${collector}-R2`,...ball);
    assert.equal(result.ball.carrierId,`${collector}-R2`);
    if (opposing) freshProgress(result);
    else assert.deepEqual(result.ballProgress,state.ballProgress,'collection is not a new possession when the attacker already owns the loose-ball phase');
  }
});

test('back-pass and forced king release finish one round, with the penalty deferred until the king releases', () => {
  for (const team of ['white','black']) for (const rounds of [1,2]) {
    const transform = pair => team === 'white' ? pair : mirror(pair);
    const state = fixture({team,phase:'kick',rounds,positions:{
      [`${team}-R1`]:transform([4,10]),[`${team}-K`]:transform([4,14]),[`${team}-R2`]:transform([6,12]),
    }});
    const release = kick(state,...transform([4,14]));
    assert.equal(release.phase,'keeperRelease');
    assert.equal(release.releaseReason,'backPass');
    assert.equal(release.restart,null,'the king must receive a legal immediate release before adjudication');
    assert.equal(release.ballProgress.rounds,rounds);
    assert.equal(release.ballProgress.pendingRelease,true);
    assert.throws(()=>skipMove(release));
    const result = kick(release,...transform([6,12]));
    if (rounds === 2) assertStall(result,team);
    else {
      assert.equal(result.ballProgress.rounds,2,'two physical kicks count once');
      assert.equal(result.ballProgress.pendingRelease,false);
      assert.equal(result.restart,null);
    }
  }
});

function restartFixture(type,team) {
  const transform = pair => team === 'white' ? pair : mirror(pair);
  const source = type === 'goalKick' ? [5,14] : type === 'corner' ? [0,0] : type === 'throwIn' ? [0,7] : [2,7];
  const suffix = type === 'goalKick' ? 'K':'R1';
  const takerId = `${team}-${suffix}`;
  const spot = transform(source);
  const state = fixture({team,suffix,rounds:2,positions:{[takerId]:spot}});
  state.restart = {type,team,takerId,spot:{x:spot[0],y:spot[1]},indirect:['offside','stalling'].includes(type)};
  return state;
}

test('kickoff and every protected restart exclude both positioning and the taking kick from the countdown', () => {
  for (const team of ['white','black']) {
    const kickoff = fixture({team,phase:'kickoff',rounds:2});
    assert.equal(engine.progressInfo(kickoff).active,false);
    const afterKickoff = kick(kickoff,...(team === 'white' ? [3,10]:mirror([3,10])));
    freshProgress(afterKickoff);
    for (const type of ['goalKick','corner','throwIn','offside','stalling']) {
      let state = restartFixture(type,team);
      const before = clone(state.ballProgress);
      assert.equal(engine.progressInfo(state).active,false);
      state = skipMove(state);
      assert.deepEqual(state.ballProgress,before);
      state = skipMove(state);
      assert.deepEqual(state.ballProgress,before);
      const target = legalKicks(state).find(candidate=>!candidate.goal && candidate.accuracy === 1 && !candidate.receiverId);
      assert.ok(target,`${type} has an ordinary restart pass`);
      state = kick(state,target.x,target.y);
      assert.equal(state.restart,null);
      freshProgress(state);
    }
  }
});

test('an excluded kickoff or restart back-pass chain starts counting only after the forced king release', () => {
  for (const team of ['white','black']) for (const phase of ['kickoff','kick']) {
    const transform = pair => team === 'white' ? pair : mirror(pair);
    const state = fixture({team,phase,rounds:2,positions:{
      [`${team}-R1`]:transform([0,12]),[`${team}-K`]:transform([5,12]),[`${team}-R2`]:transform([7,12]),
    }});
    if (phase === 'kick') state.restart={type:'throwIn',team,takerId:`${team}-R1`,spot:{x:state.ball.x,y:state.ball.y},indirect:true};
    const release = kick(state,...transform([5,12]));
    assert.equal(release.phase,'keeperRelease');
    assert.equal(release.ballProgress.excludeRelease,true);
    const result = kick(release,...transform([7,12]));
    assert.equal(result.restart,null);
    freshProgress(result);
  }
});

test('a stalled side gives the nearest rival a protected indirect restart near the ball, preserving the full roster', () => {
  for (const team of ['white','black']) {
    const transform = pair => team === 'white' ? pair : mirror(pair);
    const award = other(team);
    const initial = fixture({team,phase:'kick',rounds:2,positions:{
      [`${team}-R2`]:transform([8,10]),[`${award}-B1`]:transform([8,9]),[`${award}-P1`]:transform([9,10]),
    }});
    const result = kick(initial,...transform([8,10]));
    assertStall(result,team);
    assert.equal(result.restart.takerId,`${award}-B1`,'nearest-player ties use stable player ids');
    assert.ok(Math.hypot(result.ball.x-transform([8,10])[0],result.ball.y-transform([8,10])[1])<=1,'occupied ball square resolves to an adjacent free square');
    for (const piece of initial.pieces.filter(piece=>piece.id!==result.restart.takerId)) assert.deepEqual(result.pieces.find(candidate=>candidate.id===piece.id),piece,'only the appointed taker relocates');
    assert.deepEqual(legalMoves(result,result.restart.takerId),[]);
    assert.deepEqual(legalKicks(result),[]);
    const defending = skipMove(result);
    assert.equal(currentTeam(defending),team);
    assert.equal(defending.phase,'defendMove');
    for(const piece of defending.pieces) assert.equal(legalMoves(defending,piece.id).some(move=>move.type==='tackle'),false);
    const taking = skipMove(defending);
    assert.equal(taking.phase,'kick');
    assert.ok(legalKicks(taking).length);
    assert.equal(legalKicks(taking).some(candidate=>candidate.goal),false,'an anti-stalling free kick cannot score directly');
    const repeat = kick(initial,...transform([8,10]));
    assert.deepEqual(repeat,result,'award and vacancy choice are deterministic');
  }
});

test('interceptions and successful tackles start fresh windows while failed knight tackles preserve the deadline', () => {
  for (const team of ['white','black']) {
    const transform = pair => team === 'white' ? pair : mirror(pair);
    const opponent = other(team);
    const interception = fixture({team,phase:'kick',rounds:2,positions:{[`${opponent}-R2`]:transform([2,8])}});
    const intercepted = kick(interception,...transform([2,8]));
    assert.equal(intercepted.lastAction.type,'interception');
    freshProgress(intercepted);
    const tackleState=fixture({team,suffix:'N1',phase:'defendMove',rounds:2,positions:{[`${opponent}-R2`]:transform([2,7])}});
    const move=legalMoves(tackleState,`${opponent}-R2`).find(candidate=>candidate.type==='tackle');
    assert.ok(move);
    for(const [roll,success] of [[.49,true],[.5,false]]) {
      const next=applyMove(tackleState,`${opponent}-R2`,move.x,move.y,{roll});
      if(success) freshProgress(next);
      else assert.deepEqual(next.ballProgress,tackleState.ballProgress);
    }
  }
});

test('opponent-goal shots reset on declaration, and goal, catch, corner and wide resolution each start fresh', () => {
  for (const team of ['white','black']) {
    const transform = pair => team === 'white' ? pair : mirror(pair);
    const opponent=other(team),target=transform([6,-1]);
    const initial=fixture({team,phase:'kick',rounds:2,positions:{[`${team}-R1`]:transform([6,4]),[`${opponent}-K`]:transform([6,0])}});
    const reaction=kick(initial,...target);
    assert.equal(reaction.phase,'keeperReact');
    freshProgress(reaction);
    assert.equal(engine.progressInfo(reaction).active,false);
    const model=engine.shotModel(reaction,...target);
    assert.ok(model.goalProbability>0&&model.cornerProbability>0&&model.caughtSaveProbability>0&&model.missProbability>0);
    const choices=[
      [0,'goal'],
      [model.goalProbability+model.cornerProbability/2,'save'],
      [model.goalProbability+model.cornerProbability+model.caughtSaveProbability/2,'save'],
      [.999999,'shotMiss'],
    ];
    for(const [roll,type] of choices) {
      const result=skipMove(reaction,{roll});
      assert.equal(result.lastAction.type,type);
      freshProgress(result);
      integrity(result);
    }
  }
});

test('an own-goal attempt does not count as purposeful attacking progress before it resolves', () => {
  for(const team of ['white','black']) {
    const transform=pair=>team==='white'?pair:mirror(pair);
    const state=fixture({team,phase:'kick',rounds:2,positions:{[`${team}-R1`]:transform([6,10]),[`${team}-K`]:transform([8,16])}});
    const target=transform([6,BOARD_HEIGHT]);
    const pending=kick(state,...target);
    assert.equal(pending.phase,'keeperReact');
    assert.deepEqual(pending.ballProgress,state.ballProgress,'a shot toward your own goal cannot erase the attacking deadline');
    freshProgress(skipMove(pending,{roll:0}));
  }
});

test('a same-team catch of an own-goal attempt cannot erase the deadline, while excluded kickoff chains remain exempt', () => {
  for(const team of ['white','black']) for(const phase of ['kick','kickoff']) {
    const transform=pair=>team==='white'?pair:mirror(pair);
    const initial=fixture({team,suffix:'K',phase,rounds:2,anchorY:transform([5,10])[1],positions:{[`${team}-K`]:transform([5,14])}});
    const target=transform([5,BOARD_HEIGHT]);
    const pending=kick(initial,...target);
    assert.equal(pending.ballProgress.rounds,phase==='kick'?2:0);
    const model=engine.shotModel(pending,...target);
    assert.ok(model.caughtSaveProbability>0,'the keeper has a caught-save outcome at its own goal');
    const caughtRoll=model.goalProbability+model.cornerProbability+model.caughtSaveProbability/2;
    const caught=skipMove(pending,{roll:caughtRoll});
    if(phase==='kick') {
      assertStall(caught,team);
      assert.equal(caught.lastAction.triggeringAction.type,'save','the same-side caught save completes the original attacking round');
    } else {
      assert.equal(caught.attack,team);
      assert.equal(caught.restart,null);
      freshProgress(caught);
    }
  }
});

test('a corner back-pass keeps the forced own-goal shot excluded while an outside king cannot catch it', () => {
  for(const team of ['white','black']) {
    const transform=pair=>team==='white'?pair:mirror(pair);
    const state=fixture({team,suffix:'Q',phase:'kick',rounds:2,positions:{
      [`${team}-Q`]:transform([0,0]),[`${team}-K`]:transform([5,5]),
    }});
    state.restart={type:'corner',team,takerId:`${team}-Q`,spot:{x:state.ball.x,y:state.ball.y},indirect:false};
    const release=kick(state,...transform([5,5]));
    assert.equal(release.phase,'keeperRelease');
    assert.equal(release.ballProgress.excludeRelease,true);
    const target=transform([5,BOARD_HEIGHT]);
    const pending=kick(release,...target);
    assert.equal(pending.phase,'keeperReact');
    assert.equal(pending.ballProgress.excludeRelease,true,'declaration preserves the restart exclusion through the keeper reaction');
    const model=engine.shotModel(pending,...target);
    assert.equal(model.keeperInBox,false,'the corner can reach this king at midfield, outside its own box');
    for(const key of ['saveProbability','cornerProbability','caughtSaveProbability']) assert.equal(model[key],0,key);
    assert.deepEqual(legalMoves(pending,`${team}-K`),[],'the outside king gets no extra keeper move');
    for(const [roll,outcome] of [[0,'goal'],[.999999,'shotMiss']]) {
      const resolved=skipMove(pending,{roll});
      assert.equal(resolved.lastAction.type,outcome);
      if(outcome==='goal') {
        assert.equal(resolved.attack,team,'the conceding team takes kickoff after its own goal');
        assert.equal(resolved.restart,null);
      } else {
        assert.equal(resolved.attack,team==='white'?'black':'white');
        assert.equal(resolved.restart.type,'corner','a last touch by the defending side across its own end line awards the opponents a corner');
      }
      freshProgress(resolved);
    }
  }
});

test('out-of-bounds and offside calls supersede the countdown and award fresh restart windows', () => {
  for(const team of ['white','black']) {
    const transform=pair=>team==='white'?pair:mirror(pair);
    const state=fixture({team,phase:'kick',rounds:2,positions:{[`${team}-R1`]:transform([2,13])}});
    const landing=transform([-3,1]);
    const out=kick(state,...transform([2,1]),{roll:.999999,landing:{x:landing[0],y:landing[1]}});
    assert.equal(out.lastAction.type,'out');
    assert.equal(out.restart.type,'throwIn');
    freshProgress(out);
    const offside=fixture({team,phase:'kick',rounds:2,positions:{[`${team}-P1`]:transform([2,0]),[`${other(team)}-N2`]:transform([10,3])}});
    const called=kick(offside,...transform([2,0]));
    assert.equal(called.lastAction.type,'offside');
    assert.equal(called.restart.type,'offside');
    freshProgress(called);
  }
});

test('legacy migration gives older saves a fresh full window and preserves current saved/undo windows without RNG use', () => {
  for(const team of ['white','black']) for(const phase of ['attackMove','defendMove','kick','keeperRelease']) {
    let state=fixture({team,phase,rounds:2});
    if(phase==='keeperRelease') {
      const king=state.pieces.find(piece=>piece.id===`${team}-K`);
      state.ball={x:king.x,y:king.y,carrierId:king.id};
      state.releaseReason='backPass';
      state.ballProgress=tracker(team,team==='white'?10:4,2,{pendingRelease:true});
    }
    const before=clone(state),seed=state.randomState;
    const normalized=normalizeGame(state);
    assert.deepEqual(state,before);
    assert.equal(normalized.rulesVersion,RULES_VERSION);
    assert.deepEqual(normalized.ballProgress,state.ballProgress,'in-progress windows survive save restoration and Undo');
    assert.equal(normalized.randomState,seed);
    assert.deepEqual(normalizeGame(normalized),normalized,'migration is idempotent');
    const legacy=clone(state);
    legacy.rulesVersion=7;
    delete legacy.ballProgress;
    const legacyBefore=clone(legacy),upgraded=normalizeGame(legacy);
    assert.deepEqual(legacy,legacyBefore);
    assert.equal(upgraded.rulesVersion,RULES_VERSION);
    assert.equal(upgraded.randomState,seed);
    assert.equal(engine.progressInfo(upgraded).roundsRemaining,3,'old snapshots cannot receive an immediate historical penalty');
    assert.equal(upgraded.ballProgress.rounds,0);
    assert.equal(upgraded.ballProgress.anchorY,legacy.ball.y);
    assert.deepEqual(normalizeGame(upgraded),upgraded);
  }
});

function applyAction(state,action) {
  if(action.type==='move') {
    assert.ok(legalMoves(state,action.pieceId,{freePawn:!!action.freePawn}).some(move=>move.x===action.x&&move.y===action.y));
    return applyMove(state,action.pieceId,action.x,action.y,{freePawn:!!action.freePawn,roll:0});
  }
  if(action.type==='kick') return kick(state,action.x,action.y);
  assert.equal(action.type,'skip');
  return skipMove(state,{roll:0});
}

test('both AI levels obey the same mirrored anti-stalling deadline and choose a safe forward pass when it is available', () => {
  for(const difficulty of ['casual','tactical']) for(const team of ['white','black']) {
    const transform=pair=>team==='white'?pair:mirror(pair);
    const state=fixture({team,phase:'kick',rounds:2,positions:{[`${team}-R1`]:transform([2,12]),[`${team}-R2`]:transform([2,8])}});
    const before=clone(state),action=chooseAIAction(state,{difficulty});
    assert.deepEqual(state,before,`${difficulty} planning preserves tracker, position and future random sequence`);
    const next=applyAction(state,action);
    assert.notEqual(next.restart?.type,'stalling',`${difficulty} does not choose a known deadline turnover when progress is available`);
    assert.equal(next.attack,team);
    assert.ok(next.phase==='keeperReact'||next.ballProgress.rounds===0,'AI either advances at least four net rows or shoots toward the opponent');
    integrity(next);
    const doomed=fixture({team,phase:'kick',rounds:2,positions:{[`${team}-R2`]:transform([8,10])}});
    assertStall(kick(doomed,...transform([8,10])),team,'manual and AI teams share the same penalty');
  }
});

test('both AI levels can resettle and take a protected anti-stalling free kick legally', () => {
  for(const difficulty of ['casual','tactical']) for(const team of ['white','black']) {
    let state=restartFixture('stalling',team);
    for(let index=0;state.restart&&index<7;index++) {
      const before=clone(state),action=chooseAIAction(state,{difficulty});
      assert.deepEqual(state,before);
      if(state.phase==='kick') assert.equal(action.type,'kick');
      else {
        assert.notEqual(action.type,'kick');
        assert.notEqual(action.pieceId,state.restart.takerId);
      }
      state=applyAction(state,action);
      integrity(state);
    }
    assert.equal(state.restart,null,`${difficulty} completes both positioning turns and the indirect restart`);
    freshProgress(state);
  }
});
