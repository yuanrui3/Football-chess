import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import * as E from '../dist/engine.js';

const other = team => team === 'white' ? 'black' : 'white';
const idFor = (id, team) => team === 'white' ? id : id.replace(/^(white|black)/, other);
const pointFor = ([x, y], team) => team === 'white' ? {x, y} : {x: E.BOARD_WIDTH - 1 - x, y: E.BOARD_HEIGHT - 1 - y};
const plain = value => JSON.parse(JSON.stringify(value));

function fixture(team = 'white') {
  const s = E.createGame({mode: 'local', kickoff: 'white', seed: 37});
  const assigned = {'white-K': [6, 15], 'black-K': [8, 0], 'black-R2': [10, 5],
    'white-N1': [3, 6], 'white-R1': [6, 4], 'white-R2': [4, 6], 'white-P1': [10, 12]};
  const occupied = new Set(Object.values(assigned).map(p => p.join(',')));
  const parking = Array.from({length: 7}, (_, i) => [0, 1, 12, 13].map(x => [x, 16 - i])).flat();
  for (const piece of s.pieces) {
    const p = assigned[piece.id] || parking.find(p => !occupied.has(p.join(',')));
    assert.ok(p, 'all 22 players have distinct parking squares');
    [piece.x, piece.y] = p; occupied.add(p.join(','));
  }
  if (team === 'black') for (const piece of s.pieces) {
    piece.id = idFor(piece.id, team); piece.team = other(piece.team);
    Object.assign(piece, pointFor([piece.x, piece.y], team));
  }
  const owner = s.pieces.find(p => p.id === idFor('white-N1', team));
  Object.assign(s, {phase: 'kick', attack: team, restart: null, offside: null, pendingShot: null,
    ball: {x: owner.x, y: owner.y, carrierId: owner.id},
    positionBudget: {normalUsed: false, pawnUsed: false, dribbleUsed: false},
    ballProgress: {team, anchorY: owner.y, rounds: 0, pendingRelease: false, excludeRelease: false}});
  assert.equal(s.pieces.length, 22);
  assert.ok(s.pieces.every(piece => E.canOccupySquare(piece, piece.x, piece.y)));
  return s;
}
function kickForward(s, team) {
  const target = pointFor([4, 4], team), before = structuredClone(s);
  assert.ok(E.legalKicks(s).some(k => k.x === target.x && k.y === target.y));
  assert.deepEqual(s, before, 'preview does not change the position');
  return E.applyKick(s, target.x, target.y, {roll: 0});
}
function collect(s, pieceId, team) {
  const target = pointFor([4, 4], team);
  assert.ok(E.legalMoves(s, pieceId).some(m => m.x === target.x && m.y === target.y));
  return E.applyMove(s, pieceId, target.x, target.y);
}

for (const team of ['white', 'black']) {
  test(`${team}: knight can collect its own forward loose kick beyond the defensive line`, () => {
    const knight = idFor('white-N1', team);
    let s = kickForward(fixture(team), team);
    assert.equal(s.ball.carrierId, null);
    assert.ok(s.offside.flaggedIds.includes(idFor('white-R1', team)), 'a genuinely offside teammate is retained');
    assert.ok(!E.offsideFlaggedIds(s).includes(knight));
    s = collect(s, knight, team);
    assert.equal(s.ball.carrierId, knight); assert.equal(s.attack, team); assert.equal(s.restart, null);
    assert.equal(s.lastAction.selfPassCollection, true);
    assert.equal(s.positionBudget.normalUsed, true);
    assert.equal(s.positionBudget.dribbleUsed, true, 'self-collection still consumes the carrying allowance');
    assert.equal(E.legalMoves(s, knight).length, 0, 'collection cannot grant another dribble in the same round');
    assert.equal(E.paceInfo(s).dribbledThisRound, true);
  });

  test(`${team}: self-collection remains legal after defensive repositioning and saved-game restoration`, () => {
    let s = kickForward(fixture(team), team);
    const snapshot = structuredClone(s.offside), randomState = s.randomState;
    s = E.skipMove(s);
    const target = pointFor([10, 6], team);
    s = E.applyMove(s, idFor('black-R2', team), target.x, target.y);
    s = E.skipMove(s);
    s = E.normalizeGame(plain(s));
    assert.deepEqual(s.offside, snapshot, 'defender movement and reload preserve the original kick-time flags');
    assert.equal(s.randomState, randomState);
    s = collect(s, idFor('white-N1', team), team);
    assert.equal(s.lastAction.type, 'move'); assert.equal(s.restart, null);
    assert.equal(s.ball.carrierId, idFor('white-N1', team));
  });

  test(`${team}: the fifth own-kick collection is a carrying-limit offence, not offside`, () => {
    let s = fixture(team);
    const knight = idFor('white-N1', team);
    s.paceControl = {team, carrierId: knight, dribbleRounds: 4, dribbledThisRound: false,
      history: [], furthestAdvance: (team === 'white' ? -1 : 1) * s.ball.y};
    s = kickForward(s, team);
    assert.equal(s.restart, null, 'sending the ball loose is still legal after four carries');
    assert.equal(E.paceInfo(s).dribbleRounds, 4);
    assert.ok(!E.offsideFlaggedIds(s).includes(knight));
    const before = structuredClone(s), result = collect(s, knight, team);
    assert.equal(result.lastAction.type, 'stalling');
    assert.equal(result.lastAction.reason, 'dribbleLimit');
    assert.equal(result.restart.type, 'stalling');
    assert.equal(result.restart.indirect, true); assert.equal(result.restart.team, other(team));
    assert.deepEqual(result.lastAction.offence, {x: before.ball.x, y: before.ball.y});
    assert.deepEqual(result.pieces.find(p => p.id === knight), before.pieces.find(p => p.id === knight), 'offence is called before moving the knight');
    assert.equal(result.randomState, before.randomState);
  });

  test(`${team}: stale flags cannot penalize the kicker or erase a genuinely offside teammate`, () => {
    const s = kickForward(fixture(team), team), knight = idFor('white-N1', team), teammate = idFor('white-R1', team);
    s.offside.flaggedIds.push(knight, idFor('black-R2', team), 'missing-piece');
    const before = structuredClone(s);
    assert.deepEqual(E.offsideFlaggedIds(s), [teammate]);
    assert.deepEqual(s, before, 'sanitizing the preview is pure');
    const rawCollected = collect(s, knight, team);
    assert.equal(rawCollected.lastAction.type, 'move'); assert.equal(rawCollected.restart, null);
    const loaded = E.normalizeGame(plain(s));
    assert.deepEqual(loaded.offside.flaggedIds, [teammate]);
    assert.equal(loaded.offside.kickerId, knight);
    assert.equal(loaded.randomState, s.randomState);
    const penalized = collect(loaded, teammate, team);
    assert.equal(penalized.lastAction.type, 'offside'); assert.equal(penalized.restart.team, other(team));
  });

  test(`${team}: onside teammate may run beyond the line after the kick and receive the loose ball`, () => {
    let s = kickForward(fixture(team), team);
    const rook = idFor('white-R2', team), run = pointFor([4, 3], team);
    assert.ok(!E.offsideFlaggedIds(s).includes(rook));
    s = E.applyMove(s, rook, run.x, run.y);
    assert.ok(E.offsideInfo(s).flaggedIds.includes(rook), 'the current geometry would flag a hypothetical new kick');
    s = E.skipMove(E.skipMove(s));
    s = collect(s, rook, team);
    assert.equal(s.lastAction.type, 'move'); assert.equal(s.ball.carrierId, rook); assert.equal(s.restart, null);
  });

  test(`${team}: knight may pass directly to an onside teammate, while an offside L-square receiver is penalized`, () => {
    for (const onside of [true, false]) {
      const s = fixture(team), receiverId = idFor('white-R2', team), target = pointFor([4, 4], team);
      Object.assign(s.pieces.find(p => p.id === receiverId), target);
      if (onside) Object.assign(s.pieces.find(p => p.id === idFor('black-R2', team)), pointFor([10, 4], team));
      const preview = E.legalKicks(s).find(k => k.x === target.x && k.y === target.y);
      assert.equal(preview?.receiverId, receiverId);
      assert.equal(preview.offside, !onside);
      const next = E.applyKick(s, target.x, target.y, {roll: 0});
      if (onside) {
        assert.equal(next.lastAction.type, 'kick'); assert.equal(next.ball.carrierId, receiverId); assert.equal(next.restart, null);
      } else {
        assert.equal(next.lastAction.type, 'offside'); assert.equal(next.lastAction.offenderId, receiverId);
        assert.equal(next.restart.team, other(team));
      }
    }
  });

  test(`${team}: being a previous kicker does not exempt the knight from a later teammate pass`, () => {
    let s = kickForward(fixture(team), team);
    const oldKicker = idFor('white-N1', team), teammate = idFor('white-R2', team);
    s = collect(s, teammate, team);
    // A later attacking position: the knight is ahead of this new passer and
    // the defensive line. Its old own-kick exemption must not persist.
    Object.assign(s.pieces.find(p => p.id === oldKicker), pointFor([3, 3], team));
    Object.assign(s.pieces.find(p => p.id === teammate), pointFor([3, 6], team));
    Object.assign(s, {phase: 'kick', ball: {...pointFor([3, 6], team), carrierId: teammate}});
    const target = pointFor([3, 3], team);
    const preview = E.legalKicks(s).find(k => k.x === target.x && k.y === target.y);
    assert.equal(preview?.offside, true);
    const next = E.applyKick(s, target.x, target.y, {roll: 0});
    assert.equal(next.lastAction.type, 'offside'); assert.equal(next.lastAction.offenderId, oldKicker);
    assert.equal(next.restart.team, other(team));
  });
}

const app = readFileSync(new URL('../dist/app.js', import.meta.url), 'utf8');
function uiHarness(state, selectedId) {
  const from = app.indexOf('function offsideWarnings('), until = app.indexOf('function accuracyLabel(', from);
  assert.ok(from >= 0 && until > from, 'production warning helpers can be executed without a DOM');
  const context = vm.createContext({game: state, selectedId, offsideInfo: E.offsideInfo, offsideFlaggedIds: E.offsideFlaggedIds});
  vm.runInContext(app.slice(from, until), context);
  return {warnings: () => vm.runInContext('offsideWarnings()', context),
    target: target => {context.target = target; return vm.runInContext('isOffsideTarget(target)', context);}};
}

test('loose-ball UI uses kick-time flags, never hypothetical flags from a later defensive line', () => {
  for (const team of ['white', 'black']) {
    let s = kickForward(fixture(team), team);
    const rook = idFor('white-R2', team), run = pointFor([4, 3], team);
    s = E.applyMove(s, rook, run.x, run.y);
    const ui = uiHarness(s, rook), warning = ui.warnings();
    assert.equal(warning.positionFlags.size, 0);
    assert.deepEqual([...warning.activeFlags], [idFor('white-R1', team)]);
    assert.equal(ui.target({...pointFor([4, 4], team), type: 'move'}), false);
    const flagged = uiHarness(s, idFor('white-R1', team));
    assert.equal(flagged.target({...pointFor([4, 4], team), type: 'move'}), true);
    const noSnapshot = structuredClone(s); noSnapshot.offside = null;
    const clear = uiHarness(noSnapshot, rook).warnings();
    assert.equal(clear.positionFlags.size, 0); assert.equal(clear.activeFlags.size, 0);
  }
});

test('UI ignores a stale kicker flag while retaining teammate involvement and restart exemptions', () => {
  for (const team of ['white', 'black']) {
    const s = kickForward(fixture(team), team), knight = idFor('white-N1', team);
    s.offside.flaggedIds.push(knight, idFor('black-R2', team));
    const ui = uiHarness(s, knight);
    assert.equal(ui.target({...pointFor([4, 4], team), type: 'move'}), false);
    assert.deepEqual([...ui.warnings().activeFlags], [idFor('white-R1', team)]);
    for (const type of ['throwIn', 'corner', 'goalKick', 'penalty']) {
      const restart = structuredClone(s); restart.restart = {type, team};
      const warning = uiHarness(restart, knight).warnings();
      assert.equal(warning.exempt, true); assert.equal(warning.positionFlags.size, 0); assert.equal(warning.activeFlags.size, 0);
    }
    const pending = structuredClone(s); pending.phase = 'keeperReact';
    assert.equal(uiHarness(pending, knight).warnings().positionFlags.size, 0);
  }
});
