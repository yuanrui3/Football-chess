import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame, currentTeam, legalMoves, legalKicks, applyMove, applyKick,
  skipMove, shotModel, offsideInfo, isBox, BOARD_WIDTH, BOARD_HEIGHT, MIDFIELD_RANK, canOccupySquare,
} from '../dist/engine.js';

const clone = value => JSON.parse(JSON.stringify(value));
const flipTeam = team => team === 'white' ? 'black' : 'white';
const idFor = (id, team) => team === 'white' ? id : id.replace(/^(white|black)/, flipTeam);
const pointFor = ([x, y], team) => team === 'white' ? {x,y} : {x:BOARD_WIDTH-1-x,y:BOARD_HEIGHT-1-y};

// Build white-attacking scenarios, then mirror the whole position for Black.
// Every fixture preserves all 22 players and keeps unused players off the rays.
function fixture({team = 'white', phase = 'kick', carrier = 'white-Q', positions = {}, seed = 17} = {}) {
  const state = createGame({mode: 'local', kickoff: 'white', seed});
  const assigned = {'white-K': [6, 15], 'black-K': [8, 0], 'black-R2': [9, 5], 'white-Q': [4, 8], 'white-R1': [4, 4], ...positions};
  const occupied = new Set(Object.values(assigned).map(p => p.join(',')));
  assert.equal(occupied.size, Object.keys(assigned).length, 'scenario assignments do not overlap');
  const parking = Array.from({length: 7}, (_, offset) => [0, 1, BOARD_WIDTH-2, BOARD_WIDTH-1].map(x => [x, BOARD_HEIGHT-1-offset])).flat();
  for (const piece of state.pieces) {
    const location = assigned[piece.id] || parking.find(p => !occupied.has(p.join(',')));
    assert.ok(location, `a parking square exists for ${piece.id}`);
    [piece.x, piece.y] = location;
    occupied.add(location.join(','));
  }
  state.phase = phase;
  state.positionBudget = { normalUsed: false, pawnUsed: false, dribbleUsed: false };
  const owner = state.pieces.find(p => p.id === carrier);
  state.ball = {x: owner.x, y: owner.y, carrierId: carrier};
  if (team === 'black') {
    for (const piece of state.pieces) {
      piece.id = idFor(piece.id, team);
      piece.team = flipTeam(piece.team);
      piece.x = BOARD_WIDTH - 1 - piece.x; piece.y = BOARD_HEIGHT - 1 - piece.y;
    }
    state.ball = {...state.ball, x: BOARD_WIDTH-1-state.ball.x, y: BOARD_HEIGHT-1-state.ball.y, carrierId: idFor(carrier, team)};
    state.attack = team;
  }
  state.ballProgress = {team:state.attack,anchorY:state.ball.y,rounds:0,pendingRelease:false,excludeRelease:false};
  assert.ok(state.pieces.every(piece=>canOccupySquare(piece,piece.x,piece.y)),'all fixture players occupy legal current-pitch squares');
  return state;
}

function hasMove(state, id, x, y, options = {}) {
  return legalMoves(state, id, options).some(move => move.x === x && move.y === y);
}
function kickAt(state, [x, y], team, options) {
  const target = pointFor([x, y], team);
  assert.ok(legalKicks(state).some(kick => kick.x === target.x && kick.y === target.y), 'fixture kick is legal');
  return applyKick(state, target.x, target.y, options);
}
function assertRestart(state, type, team) {
  assert.equal(state.restart?.type, type);
  assert.equal(state.restart.team, team);
  assert.equal(state.attack, team);
  assert.equal(state.phase, 'attackMove', 'the awarded side receives a full positioning round');
  assert.deepEqual(state.positionBudget, { normalUsed: false, pawnUsed: false, dribbleUsed: false });
  const taker = state.pieces.find(piece => piece.id === state.restart.takerId);
  assert.ok(taker);
  assert.equal(taker.team, team);
  assert.equal(state.ball.carrierId, taker.id);
  assert.deepEqual({x: state.ball.x, y: state.ball.y}, {x: taker.x, y: taker.y});
  assert.equal(state.pieces.length, 22);
  assert.equal(new Set(state.pieces.map(piece => `${piece.x},${piece.y}`)).size, 22);
  assert.deepEqual(legalMoves(state, taker.id), [], 'restart taker cannot dribble away');
  assert.equal(state.offside, null);
}

test('knights may enter both boxes off the ball but cannot dribble into either', () => {
  for (const team of ['white', 'black']) for (const ballCarrier of [false, true]) {
    for (const [origin, target] of [[[3, 3], [4, 1]], [[3, 13], [4, 15]]]) {
      const state = fixture({team, phase: 'attackMove', carrier: ballCarrier ? 'white-N1' : 'white-Q', positions: {'white-K': [8, 14], 'white-N1': origin}});
      const id = idFor('white-N1', team), destination = pointFor(target, team);
      assert.equal(isBox(destination.x, destination.y), true);
      if(ballCarrier){
        assert.equal(hasMove(state,id,destination.x,destination.y),false);
        assert.throws(()=>applyMove(state,id,destination.x,destination.y),/not a legal move/);continue;
      }
      assert.ok(hasMove(state, id, destination.x, destination.y));
      const next = applyMove(state, id, destination.x, destination.y);
      assert.deepEqual(next.pieces.find(piece => piece.id === id), {...state.pieces.find(piece => piece.id === id), ...destination});
      assert.deepEqual(next.ball, state.ball);
      assert.equal(next.pieces.length, 22);
    }
  }
});

test('queen, rook, bishop and pawn enter a box off the ball while their carrying entry is denied', () => {
  for (const team of ['white', 'black']) {
    for (const [id, origin] of [['white-Q', [4, 3]], ['white-R1', [5, 3]], ['white-B1', [4, 3]], ['white-P1', [5, 3]]]) {
      const state = fixture({team, phase: 'attackMove', carrier:'white-N2',positions: {[id]: origin}});
      const target = pointFor([5, 2], team);
      assert.equal(hasMove(state, idFor(id, team), target.x, target.y), true);
      const carrying=clone(state),carrier=carrying.pieces.find(piece=>piece.id===idFor(id,team));
      carrying.ball={x:carrier.x,y:carrier.y,carrierId:carrier.id};
      assert.equal(hasMove(carrying,carrier.id,target.x,target.y),false);
    }
  }
});

test('a knight in either box can receive and carry a legal pass', () => {
  for (const team of ['white', 'black']) {
    const state = fixture({team, carrier: 'white-Q', positions: {'white-K': [8, 14], 'white-Q': [4, 12], 'white-N1': [6, 14]}});
    const next = kickAt(state, [6, 14], team, {roll: 0});
    assert.equal(next.ball.carrierId, idFor('white-N1', team));
    assert.equal(next.phase, 'attackMove');
    assert.equal(isBox(next.ball.x, next.ball.y), true);
  }
});

test('knight shots use ordinary goal likelihood without a finishing multiplier for either side', () => {
  for (const team of ['white', 'black']) for (const keeper of [[5, 0], [8, 0]]) {
    const knight = fixture({team, carrier: 'white-N1', positions: {'white-N1': [4, 1], 'black-K': keeper}});
    const ordinary = clone(knight);
    ordinary.pieces.find(piece => piece.id === idFor('white-N1', team)).type = 'Q';
    const target = pointFor([5, -1], team);
    const base = shotModel(ordinary, target.x, target.y), model = shotModel(knight, target.x, target.y);
    assert.equal(model.shooterType, 'N');
    assert.equal(base.shooterType, 'Q');
    for(const field of ['distance','goalOpeningDegrees','goalOpeningRatio','postAngleFactor','wideAngleFactor','centralLaneFactor','distancePenaltyRate','baseOnTargetProbability','keeperPathDistance','timeToKeeper','reach','keeperInBox'])assert.equal(model[field],base[field],`${field} uses the ordinary model`);
    assert.equal(model.scoringMultiplier, 1);
    assert.equal(model.probability, model.goalProbability);
    assert.equal(model.baseGoalProbability, base.goalProbability);
    assert.equal(model.goalProbability,base.goalProbability);
    const failureScale=(1-model.goalProbability)/(1-base.goalProbability);
    assert.ok(Math.abs(model.saveProbability-base.saveProbability*failureScale)<1e-12);
    assert.ok(Math.abs(model.missProbability-base.missProbability*failureScale)<1e-12);
    assert.ok(Math.abs(model.goalProbability + model.saveProbability + model.missProbability + model.blockProbability - 1) < 1e-12);
    assert.deepEqual({...model,shooterType:base.shooterType},base,'the full ordinary shot distribution is preserved');
  }
});

test('the declared knight shooter type survives goalkeeper reactions and serialization', () => {
  for (const team of ['white', 'black']) {
    const state = fixture({team, carrier: 'white-N1', positions: {'white-N1': [4, 1], 'black-K': [5, 0]}});
    const pending = kickAt(state, [5, -1], team);
    assert.equal(pending.pendingShot.shooterType, 'N');
    const restored = clone(pending);
    const model = shotModel(restored);
    assert.equal(model.scoringMultiplier, 1);
    const next = skipMove(restored, {roll: Math.max(0, model.goalProbability - 1e-8)});
    assert.equal(next.lastAction.type, 'goal');
    assert.equal(next.lastAction.shotModel.scoringMultiplier, 1);
    assert.equal(next.score[team], 1);
    assert.equal(next.pieces.length, 22);
  }
});

test('knights retain their 50 percent tackle protection while carrying the ball inside either box', () => {
  for (const team of ['white', 'black']) {
    const state = fixture({team, phase: 'defendMove', carrier: 'white-N1', positions: {'white-N1': [5, 1], 'black-R1': [4, 1]}});
    const id = idFor('black-R1', team), target = pointFor([4, 2], team);
    const tackle = legalMoves(state, id).find(move => move.type === 'tackle' && move.x === target.x && move.y === target.y);
    assert.equal(tackle?.tackleProbability, 0.5);
    const avoided = applyMove(state, id, target.x, target.y, {roll: 0.5});
    assert.equal(avoided.lastAction.type, 'tackleMiss');
    assert.equal(avoided.ball.carrierId, idFor('white-N1', team));
    const won = applyMove(state, id, target.x, target.y, {roll: 0.499999});
    assert.equal(won.lastAction.type, 'tackle');
    assert.equal(won.ball.carrierId, id);
    assert.equal(won.pieces.length, 22);
  }
});

test('a receiver strictly beyond the ball and second-last opponent is offside in either attacking direction', () => {
  for (const team of ['white', 'black']) {
    const state = fixture({team});
    const info = offsideInfo(state);
    assert.ok(info.players.find(piece => piece.id === idFor('white-R1', team)).offside);
    const next = kickAt(state, [4, 4], team, {roll: 0});
    assertRestart(next, 'offside', flipTeam(team));
    assert.equal(next.restart.indirect, true);
    assert.equal(next.lastAction.type, 'offside');
  }
});

test('being level with the second-last opponent or the ball is onside', () => {
  for (const team of ['white', 'black']) {
    for (const positions of [
      {'white-R1': [4, 5]},
      {'white-Q': [4, 4], 'white-R1': [7, 4]},
    ]) {
      const state = fixture({team, positions});
      const receiver = state.pieces.find(piece => piece.id === idFor('white-R1', team));
      const info = offsideInfo(state);
      assert.equal(info.players.find(piece => piece.id === receiver.id).offside, false);
      const next = applyKick(state, receiver.x, receiver.y, {roll: 0});
      assert.equal(next.restart, null);
      assert.equal(next.ball.carrierId, receiver.id);
      assert.equal(next.attack, team);
    }
  }
});

test('players in their own half or exactly on halfway are onside', () => {
  for (const team of ['white', 'black']) for (const row of [MIDFIELD_RANK, MIDFIELD_RANK+1]) {
    const state = fixture({team, positions: {'white-Q': [4, 10], 'white-R1': [4, row], 'black-R2': [9, 12]}});
    const info = offsideInfo(state);
    assert.equal(info.players.find(piece => piece.id === idFor('white-R1', team)).offside, false);
    const next = kickAt(state, [4, row], team, {roll: 0});
    assert.equal(next.ball.carrierId, idFor('white-R1', team));
    assert.equal(next.restart, null);
  }
});

test('the second-last opponent is computed from all eleven players rather than assuming the keeper is last', () => {
  for (const team of ['white', 'black']) {
    const state = fixture({team, positions: {'black-K': [8, 10], 'black-R1': [9, 0], 'black-R2': [9, 5]}});
    const info = offsideInfo(state);
    assert.equal(info.secondLastY, team === 'white' ? 5 : BOARD_HEIGHT-1-5);
    assert.equal(info.players.find(piece => piece.id === idFor('white-R1', team)).offside, true);
    assertRestart(kickAt(state, [4, 4], team, {roll: 0}), 'offside', flipTeam(team));
  }
});

test('an offside-positioned player may move without involvement, but returning onside does not erase the kick-time flag', () => {
  for (const team of ['white', 'black']) {
    const state = fixture({team, positions: {'white-R1': [3, 4]}});
    let next = kickAt(state, [4, 6], team, {roll: 0});
    assert.ok(next.offside.flaggedIds.includes(idFor('white-R1', team)));
    const snapshot = clone(next.offside);
    let target = pointFor([3, 6], team);
    next = applyMove(next, idFor('white-R1', team), target.x, target.y);
    assert.equal(next.restart, null, 'running alone is not an offside offence');
    assert.deepEqual(next.offside, snapshot);
    next = skipMove(next);
    assert.equal(currentTeam(next), flipTeam(team));
    target = pointFor([9, 1], team);
    next = applyMove(next, idFor('black-R2', team), target.x, target.y);
    assert.deepEqual(next.offside, snapshot, 'moving the defensive line does not rewrite the snapshot');
    next = skipMove(next);
    target = pointFor([4, 6], team);
    next = applyMove(next, idFor('white-R1', team), target.x, target.y);
    assertRestart(next, 'offside', flipTeam(team));
  }
});

test('an onside runner may go beyond the defensive line after the kick and collect the ball', () => {
  for (const team of ['white', 'black']) {
    const state = fixture({team, positions: {'white-R1': [3, 5]}});
    let next = kickAt(state, [4, 3], team, {roll: 0});
    assert.equal(next.offside?.flaggedIds.includes(idFor('white-R1', team)) || false, false);
    let target = pointFor([3, 3], team);
    next = applyMove(next, idFor('white-R1', team), target.x, target.y);
    next = skipMove(skipMove(next));
    target = pointFor([4, 3], team);
    next = applyMove(next, idFor('white-R1', team), target.x, target.y);
    assert.equal(next.restart, null);
    assert.equal(next.ball.carrierId, idFor('white-R1', team));
  }
});

test('a flagged player challenging a saved ball concedes the indirect restart before taking possession', () => {
  for (const team of ['white', 'black']) {
    const state = fixture({team, phase: 'defendMove', carrier: 'black-K', positions: {'black-K': [5, 1], 'white-R1': [4, 1]}});
    state.attack = flipTeam(team);
    state.offside = {team, kickerId: idFor('white-Q', team), ball: pointFor([4, 8], team), secondLastY: team === 'white' ? 5 : BOARD_HEIGHT-1-5, flaggedIds: [idFor('white-R1', team)], exempt: false};
    const target = pointFor([4, 2], team);
    assert.ok(legalMoves(state, idFor('white-R1', team)).some(move => move.type === 'tackle' && move.x === target.x && move.y === target.y));
    const next = applyMove(state, idFor('white-R1', team), target.x, target.y, {roll: 0});
    assertRestart(next, 'offside', flipTeam(team));
    assert.equal(next.randomState, state.randomState, 'offside is adjudicated before any tackle outcome');
  }
});

function savedShotWithFlaggedRunner(team) {
  const state = fixture({team, positions: {'white-Q': [5, 4], 'white-N1': [4, 3], 'black-K': [5, 1]}});
  const pending = kickAt(state, [5, -1], team);
  assert.equal(pending.phase, 'keeperReact');
  assert.ok(pending.offside.flaggedIds.includes(idFor('white-N1', team)));
  const model = shotModel(pending);
  assert.ok(model.saveProbability > 0);
  const saved = skipMove(pending, {roll: model.goalProbability + model.cornerProbability + model.caughtSaveProbability / 2});
  assert.equal(saved.lastAction.type, 'save');
  assert.equal(saved.restart, null);
  assert.equal(saved.ball.carrierId, idFor('black-K', team));
  assert.deepEqual(saved.offside, pending.offside, 'the save preserves the shooter-team snapshot');
  return saved;
}

test('an actual goalkeeper save retains the shot-time offside snapshot for a runner challenging the saved ball', () => {
  for (const team of ['white', 'black']) {
    let state = savedShotWithFlaggedRunner(team);
    state = skipMove(state);
    const id = idFor('white-N1', team), tackle = legalMoves(state, id).find(move => move.type === 'tackle');
    assert.ok(tackle);
    const next = applyMove(clone(state), id, tackle.x, tackle.y);
    assertRestart(next, 'offside', flipTeam(team));
  }
});

test('the goalkeeper deliberately dribbling after a save resets the old offside snapshot', () => {
  for (const team of ['white', 'black']) {
    const saved = savedShotWithFlaggedRunner(team), target = pointFor([6, 0], team);
    const next = applyMove(saved, idFor('black-K', team), target.x, target.y);
    assert.equal(next.offside, null);
    assert.equal(next.ball.carrierId, idFor('black-K', team));
  }
});

test('a deliberate opponent interception resets the new kick-time snapshot', () => {
  for (const team of ['white', 'black']) {
    const state = fixture({team, positions: {'black-R1': [4, 6]}});
    const next = kickAt(state, [4, 6], team, {roll: 0});
    assert.equal(next.lastAction.type, 'interception');
    assert.equal(next.offside, null);
    assert.equal(next.ball.carrierId, idFor('black-R1', team));
  }
});

test('an opponent deliberately collecting the loose ball resets an active offside snapshot', () => {
  for (const team of ['white', 'black']) {
    const state = fixture({team, positions: {'white-R1': [3, 4], 'black-R1': [5, 6]}});
    let next = kickAt(state, [4, 6], team, {roll: 0});
    assert.ok(next.offside.flaggedIds.includes(idFor('white-R1', team)));
    next = skipMove(next);
    const target = pointFor([4, 6], team);
    next = applyMove(next, idFor('black-R1', team), target.x, target.y);
    assert.equal(next.ball.carrierId, idFor('black-R1', team));
    assert.equal(next.offside, null);
    assert.equal(next.restart, null);
  }
});

test('direct goal kicks, corner kicks, and throw-ins exempt the first recipient from offside', () => {
  // Metadata fixtures isolate each exemption from the geometry of its boundary.
  for (const team of ['white', 'black']) for (const type of ['goalKick', 'corner', 'throwIn']) {
    const state = type === 'goalKick'
      ? fixture({team, phase: 'kick', carrier: 'white-K', positions: {'white-K': [5, 15], 'white-R1': [5, 4]}})
      : fixture({team});
    state.restart = {type, team, takerId: state.ball.carrierId, spot: {x: state.ball.x, y: state.ball.y}, indirect: false};
    const next = kickAt(state, type === 'goalKick' ? [5, 4] : [4, 4], team, {roll: 0});
    assert.equal(next.restart, null);
    assert.equal(next.ball.carrierId, idFor('white-R1', team));
    assert.equal(next.attack, team);
    assert.equal(next.offside?.flaggedIds.length || 0, 0);
  }
});

test('the direct-restart exemption ends after its initial kick', () => {
  for (const team of ['white', 'black']) {
    const state = fixture({team, positions: {'white-Q': [1, 8], 'white-R1': [1, 4], 'white-N1': [1, 2]}});
    state.restart = {type: 'throwIn', team, takerId: state.ball.carrierId, spot: {x: state.ball.x, y: state.ball.y}, indirect: false};
    let next = kickAt(state, [1, 4], team, {roll: 0});
    assert.equal(next.ball.carrierId, idFor('white-R1', team));
    assert.equal(next.restart, null);
    next = skipMove(skipMove(next));
    next = kickAt(next, [1, 2], team, {roll: 0});
    assertRestart(next, 'offside', flipTeam(team));
  }
});

test('offside indirect free kicks do not receive the boundary-restart exemption', () => {
  for (const team of ['white', 'black']) {
    const state = fixture({team});
    state.restart = {type: 'offside', team, takerId: state.ball.carrierId, spot: {x: state.ball.x, y: state.ball.y}, indirect: true};
    assertRestart(kickAt(state, [4, 4], team, {roll: 0}), 'offside', flipTeam(team));
  }
});

test('offside previews and adjudication are immutable, deterministic, and survive a JSON round trip', () => {
  const state = fixture(), before = clone(state);
  offsideInfo(state);
  legalKicks(state);
  for (const piece of state.pieces) legalMoves(state, piece.id);
  assert.deepEqual(state, before);
  const first = kickAt(state, [4, 4], 'white', {roll: 0});
  const second = kickAt(clone(state), [4, 4], 'white', {roll: 0});
  assert.deepEqual(first, second);
  assert.deepEqual(state, before);
  assert.deepEqual(clone(first), first);
});

test('offside awards the nearest defending player and leaves the offending player on the pitch', () => {
  for (const team of ['white', 'black']) {
    const state = fixture({team}), offender = state.pieces.find(piece => piece.id === idFor('white-R1', team));
    const next = kickAt(state, [4, 4], team, {roll: 0});
    assert.equal(next.restart.takerId, idFor('black-R2', team), 'the rook is nearer the offence than the goalkeeper or parked defenders');
    assert.deepEqual(next.pieces.find(piece => piece.id === offender.id), offender);
    assert.equal(next.pieces.length, 22);
  }
});

test('offside restart locks its taker, disables tackles, and preserves both teams full movement budgets', () => {
  let state = kickAt(fixture(), [4, 4], 'white', {roll: 0});
  assertRestart(state, 'offside', 'black');
  const restart = clone(state.restart);
  state = skipMove(state);
  assert.equal(state.phase, 'defendMove');
  assert.deepEqual(state.positionBudget, { normalUsed: false, pawnUsed: false, dribbleUsed: false });
  for (const piece of state.pieces) assert.equal(legalMoves(state, piece.id).some(move => move.type === 'tackle'), false);
  assert.deepEqual(state.restart, restart);
  state = skipMove(state);
  assert.equal(state.phase, 'kick');
  assert.deepEqual(state.restart, restart);
  assert.equal(legalKicks(state).some(kick => !!kick.goal), false, 'an indirect offside kick cannot score directly');
  assert.ok(legalKicks(state).length, 'the restart has legal distribution choices');
});
