import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../dist/engine.js';

const other = team => team === 'white' ? 'black' : 'white';
const idFor = (id, team) => team === 'white' ? id : id.replace(/^(white|black)/, other);
const pointFor = ([x, y], team) => team === 'white' ? {x, y} : {x: E.BOARD_WIDTH - 1 - x, y: E.BOARD_HEIGHT - 1 - y};
const clone = value => JSON.parse(JSON.stringify(value));

// Complete rosters, mirrored by 180 degrees: spare players stay off the central
// rays and do not accidentally become the second-last defender.
function fixture({team = 'white', phase = 'kick', carrier = 'white-R1', positions = {}} = {}) {
  const state = E.createGame({mode: 'local', seed: 73});
  const assigned = {'white-K': [6, 15], 'white-R1': [5, 5], 'white-N1': [6, 1], 'black-K': [7, 0], 'black-R2': [11, 4], ...positions};
  const occupied = new Set(Object.values(assigned).map(point => point.join(',')));
  assert.equal(occupied.size, Object.keys(assigned).length);
  const parking = Array.from({length: E.BOARD_HEIGHT}, (_, index) => [[0,E.BOARD_HEIGHT-1-index],[E.BOARD_WIDTH-1,E.BOARD_HEIGHT-1-index]]).flat();
  for (const piece of state.pieces) {
    const location = assigned[piece.id] || parking.find(point => !occupied.has(point.join(',')));
    [piece.x, piece.y] = location; occupied.add(location.join(','));
    if (team === 'black') {
      piece.id = idFor(piece.id, team); piece.team = other(piece.team);
      piece.x = E.BOARD_WIDTH - 1 - piece.x; piece.y = E.BOARD_HEIGHT - 1 - piece.y;
    }
  }
  state.phase = phase; state.attack = team; state.restart = null; state.offside = null;
  state.positionBudget = {normalUsed: false, pawnUsed: false, dribbleUsed: false};
  const owner = state.pieces.find(piece => piece.id === idFor(carrier, team));
  state.ball = {x: owner.x, y: owner.y, carrierId: owner.id};
  state.ballProgress = {team, anchorY: owner.y, rounds: 0, pendingRelease: false, excludeRelease: false};
  assert.ok(state.pieces.every(piece=>E.canOccupySquare(piece,piece.x,piece.y)),'all fixture players occupy legal current-pitch squares');
  return state;
}
function kick(state, point, team, options) {
  const target = pointFor(point, team);
  assert.ok(E.legalKicks(state).some(candidate => candidate.x === target.x && candidate.y === target.y));
  return E.applyKick(state, target.x, target.y, options);
}
function assertOffside(state, original, team, offender = 'white-N1') {
  assert.equal(state.lastAction.type, 'offside');
  assert.equal(state.lastAction.offsideReason, 'boxKnight');
  assert.equal(state.lastAction.offenderId, idFor(offender, team));
  assert.equal(state.lastAction.offsidePieceId, idFor(offender, team));
  assert.equal(state.restart.type, 'offside'); assert.equal(state.restart.team, other(team));
  assert.equal(state.restart.indirect, true); assert.equal(state.phase, 'attackMove');
  assert.equal(state.pendingShot, null); assert.equal(state.offside, null);
  assert.deepEqual(state.positionBudget, {normalUsed: false, pawnUsed: false, dribbleUsed: false});
  assert.deepEqual(state.score, original.score); assert.equal(state.randomState, original.randomState);
  assert.equal(state.pieces.length, 22); assert.equal(new Set(state.pieces.map(piece => `${piece.x},${piece.y}`)).size, 22);
  assert.deepEqual(E.legalMoves(state, state.restart.takerId), []);
}

for (const team of ['white', 'black']) {
  test(`${team}: offside box knights are involved in every teammate kick, including the original keeper screen`, () => {
    const state = fixture({team, positions: {'white-N2': [8, 1]}}), before = clone(state);
    const info = E.offsideInfo(state);
    assert.deepEqual(info.boxKnightIds, [idFor('white-N1', team), idFor('white-N2', team)].sort());
    const target = pointFor([5, -1], team), kicks = E.legalKicks(state);
    const shot = kicks.find(candidate => candidate.x === target.x && candidate.y === target.y);
    assert.equal(shot.goal, team, 'the shot path remains clear; offside adjudicates involvement');
    for (const candidate of kicks) {
      assert.equal(candidate.offside, true); assert.equal(candidate.offsideReason, 'boxKnight');
      assert.equal(candidate.offsidePieceId, idFor('white-N1', team));
    }
    for (const target of [[5, -1],[4, 5]]) assertOffside(kick(state, target, team), state, team);
    assert.deepEqual(state, before, 'previews and kicks leave the source immutable');
  });

  test(`${team}: automatic box offside is decided before inaccurate-pass RNG or out-of-bounds scatter`, () => {
    const state = fixture({team, positions: {'white-R1': [5, 12]}});
    const target = pointFor([5, 1], team);
    assert.ok(E.legalKicks(state).find(candidate => candidate.x === target.x && candidate.y === target.y).accuracy < 1);
    const first = kick(state, [5, 1], team, {roll: 0});
    const second = kick(state, [5, 1], team, {roll: 0.999, landing: pointFor([5, -3], team)});
    assert.deepEqual(first, second); assertOffside(first, state, team);
  });

  test(`${team}: level with the ball or second-last defender is onside inside the box`, () => {
    for (const scenario of [
      {carrier: 'white-N2', positions: {'white-N2': [8, 1]}, target: [7, -1]},
      {positions: {'black-R2': [9, 1]}, target: [5, -1]},
    ]) {
      const state = fixture({team, ...scenario});
      assert.equal(E.offsideInfo(state).boxKnightIds.length, 0);
      const next = kick(state, scenario.target, team);
      assert.equal(next.phase, 'keeperReact'); assert.notEqual(next.lastAction.type, 'offside');
    }
    const ahead = fixture({team, positions: {'white-N1': [6, 1], 'black-R2': [9, 2]}});
    assertOffside(kick(ahead, [5, -1], team), ahead, team);
  });

  test(`${team}: own-box knights, outside-box attackers, and the knight shooter do not trigger automatic involvement`, () => {
    for (const square of [[7, 14],[3, 1],[6, 3]]) {
      const state = fixture({team, positions: {'white-N1': square}});
      assert.equal(E.offsideInfo(state).boxKnightIds.length, 0);
      const next = kick(state, [5, -1], team);
      assert.equal(next.phase, 'keeperReact'); assert.notEqual(next.lastAction.type, 'offside');
      if (square[1] < E.MIDFIELD_RANK) assert.ok(next.offside.flaggedIds.includes(idFor('white-N1', team)), 'ordinary delayed involvement remains active outside the box');
    }
    const shooter = fixture({team, carrier: 'white-N1'});
    assert.equal(E.offsideInfo(shooter).boxKnightIds.length, 0);
    assert.equal(kick(shooter, [5, -1], team).phase, 'keeperReact');
  });

  test(`${team}: entering or leaving the box before the kick changes involvement; movement alone is not an offence`, () => {
    const id = idFor('white-N1', team);
    for (const enter of [false, true]) {
      let state = fixture({team, phase: 'attackMove', positions: {'white-N1': enter ? [4, 3] : [6, 2]}});
      const destination = pointFor(enter ? [6, 2] : [4, 3], team);
      state = E.applyMove(state, id, destination.x, destination.y);
      assert.equal(state.restart, null);
      state = E.skipMove(E.skipMove(state)); assert.equal(state.phase, 'kick');
      const next = kick(state, [5, -1], team);
      if (enter) assertOffside(next, state, team);
      else assert.equal(next.phase, 'keeperReact');
    }
  });

  test(`${team}: the final defensive positioning, rather than a stale preview, sets the offside line`, () => {
    let state = fixture({team, phase: 'defendMove', positions: {'black-R2': [9, 4]}});
    assert.equal(E.offsideInfo(state).boxKnightIds.length, 1);
    const destination = pointFor([9, 1], team);
    state = E.applyMove(state, idFor('black-R2', team), destination.x, destination.y);
    state = E.skipMove(state); assert.equal(state.phase, 'kick');
    assert.equal(E.offsideInfo(state).boxKnightIds.length, 0);
    assert.equal(kick(state, [5, -1], team).phase, 'keeperReact');
  });

  test(`${team}: direct goal kicks, corners and throws exempt box knights, but the next teammate kick does not`, () => {
    for (const type of ['goalKick','corner','throwIn']) {
      const state = fixture({team, carrier: type === 'goalKick' ? 'white-K' : 'white-R1', positions: type === 'goalKick' ? {'white-K': [5, 14]} : {'white-B1': [4, 5]}});
      state.restart = {type, team, takerId: state.ball.carrierId, spot: {x: state.ball.x, y: state.ball.y}, indirect: false};
      assert.ok(E.legalKicks(state).every(candidate => candidate.offsideReason !== 'boxKnight'));
      let next = kick(state, type === 'goalKick' ? [5, 5] : [4, 5], team);
      assert.equal(next.restart, null); assert.equal(next.offside, null);
      next = E.skipMove(E.skipMove(next)); assert.equal(next.phase, 'kick');
      assertOffside(kick(next, type === 'goalKick' ? [4, 5] : [5, 4], team), next, team);
    }
    for (const type of ['offside','stalling','timeout']) {
      const state = fixture({team});
      state.restart = {type, team, takerId: state.ball.carrierId, spot: {x: state.ball.x, y: state.ball.y}, indirect: true};
      assertOffside(kick(state, [4, 5], team), state, team);
    }
  });

  test(`${team}: save migration uses stored kick-time flags, without a new line test or random draw`, () => {
    const outside = fixture({team, positions: {'white-N1': [3, 2]}});
    const pending = kick(outside, [5, -1], team);
    assert.ok(pending.offside.flaggedIds.includes(idFor('white-N1', team)));
    const knight = pending.pieces.find(piece => piece.id === idFor('white-N1', team));
    Object.assign(knight, pointFor([6, 1], team)); pending.rulesVersion = 9;
    // A later line would make the knight level/onside, but cannot rewrite the
    // old declaration. Only the serialized snapshot is authoritative here.
    Object.assign(pending.pieces.find(piece => piece.id === idFor('black-R2', team)), pointFor([9, 0], team));
    assert.equal(E.offsideInfo(pending).boxKnightIds.length, 0);
    const before = clone(pending), migrated = E.normalizeGame(clone(pending));
    assertOffside(migrated, pending, team); assert.equal(migrated.rulesVersion, E.RULES_VERSION);
    assert.deepEqual(pending, before); assert.deepEqual(E.normalizeGame(clone(migrated)), migrated);
    for (const snapshot of [null, {...pending.offside, flaggedIds: []}]) {
      const unflagged = clone(pending); unflagged.offside = snapshot;
      const normalized = E.normalizeGame(unflagged);
      assert.equal(normalized.phase, 'keeperReact'); assert.equal(normalized.randomState, pending.randomState);
    }
  });

  test(`${team}: with only the off-ball action remaining, both AI levels clear an offside box knight without mutation or RNG`, () => {
    const state = fixture({team, phase: 'attackMove'});
    state.positionBudget={normalUsed:false,pawnUsed:true,dribbleUsed:true};
    const before = clone(state);
    for (const difficulty of ['casual','tactical']) {
      let next=clone(state),actions=0;
      while(next.phase==='attackMove'&&actions++<4){
        const snapshot=clone(next),action=E.chooseAIAction(next,{difficulty});
        assert.deepEqual(E.chooseAIAction(clone(next),{difficulty}),action);
        assert.deepEqual(next,snapshot,'planning preserves every positioning snapshot');
        next=action.type==='move'?E.applyMove(next,action.pieceId,action.x,action.y,{freePawn:action.freePawn}):E.skipMove(next);
      }
      assert.equal(next.phase,'defendMove','judge the completed positioning turn, allowing the shared bonus before clearance');
      assert.equal(E.offsideInfo(next).boxAttackerIds.length, 0);
      assert.equal(next.randomState,state.randomState,'clearance uses no random outcome');
      assert.deepEqual(state, before);
    }
  });
}
