import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../dist/engine.js';
const other = t => t === 'white' ? 'black' : 'white';
const id = (v, team) => team === 'white' ? v : v.replace(/^(white|black)/, other);
const point = ([x, y], team) => team === 'white' ? {x, y} : {x: E.BOARD_WIDTH - 1 - x, y: E.BOARD_HEIGHT - 1 - y};
function fixture({team = 'white', carrier = 'white-Q', phase = 'attackMove', positions = {}, ball} = {}) {
  const s = E.createGame({seed: 591}), assigned = {'white-K': [6, 15], 'black-K': [7, 1], 'white-Q': [6, 8], 'white-P1': [2, 12], ...positions};
  const used = new Set(Object.values(assigned).map(p => p.join(',')));
  assert.equal(used.size, Object.keys(assigned).length);
  const parking = Array.from({length: E.BOARD_HEIGHT}, (_, y) => [[0, y], [E.BOARD_WIDTH - 1, y]]).flat();
  for (const p of s.pieces) {
    const q = assigned[p.id] || parking.find(q => !used.has(q.join(','))); assert.ok(q); used.add(q.join(','));
    Object.assign(p, point(q, team)); p.id = id(p.id, team); if (team === 'black') p.team = other(p.team);
  }
  const owner = s.pieces.find(p => p.id === id(carrier, team));
  s.phase = phase; s.attack = owner.team; s.restart = null; s.offside = null;
  s.ball = ball ? {...point([ball.x, ball.y], team), carrierId: ball.carrierId && id(ball.carrierId, team)} : {x: owner.x, y: owner.y, carrierId: owner.id};
  s.ballProgress = {team: s.attack, anchorY: s.ball.y, rounds: 0, pendingRelease: false, excludeRelease: false}; return s;
}
function move(s, pieceId, destination, freePawn = false) {
  const p = point(destination, s.attack), actor = id(pieceId, s.attack);
  assert.ok(E.legalMoves(s, actor, {freePawn}).some(m => m.x === p.x && m.y === p.y));
  return E.applyMove(s, actor, p.x, p.y, {freePawn});
}

for (const team of ['white', 'black']) {
  test(`${team}: pawn and king share one off-ball bonus in either spending order`, () => {
    for (const first of ['K', 'P1']) {
      const s = fixture({team}), before = structuredClone(s), piece = `white-${first}`, destination = first === 'K' ? [5, 15] : [2, 11];
      const next = move(s, piece, destination, true), second = first === 'K' ? 'P1' : 'K';
      assert.equal(next.positionBudget.pawnUsed, true); assert.equal(next.positionBudget.normalUsed, false);
      assert.deepEqual(E.legalMoves(next, id(`white-${second}`, team), {freePawn: true}), []);
      assert.equal(next.randomState, s.randomState); assert.deepEqual(next.ball, s.ball); assert.deepEqual(s, before);
    }
  });

  test(`${team}: a king may take one normal step and one bonus step, in either order`, () => {
    for (const firstFree of [true, false]) {
      const s = fixture({team}), first = move(s, 'white-K', [6, 14], firstFree), second = move(first, 'white-K', [7, 14], !firstFree);
      const king = second.pieces.find(p => p.id === id('white-K', team)); assert.deepEqual({x: king.x, y: king.y}, point([7, 14], team));
      assert.equal(second.positionBudget.normalUsed, true); assert.equal(second.positionBudget.pawnUsed, true);
      assert.equal(second.randomState, s.randomState);
    }
  });

  test(`${team}: the bonus never carries or tackles, and keeps king box restrictions`, () => {
    const carrying = fixture({team, carrier: 'white-K'});
    assert.deepEqual(E.legalMoves(carrying, id('white-K', team), {freePawn: true}), []); assert.ok(E.legalMoves(carrying, id('white-K', team)).length);
    const defend = fixture({team, carrier: 'black-Q', phase: 'defendMove', positions: {'white-K': [6, 14], 'black-Q': [7, 13]}});
    // In this fixture currentTeam is the selected team's king, even though
    // possession belongs to the opponent.
    assert.equal(E.currentTeam(defend), team);
    assert.ok(E.legalMoves(defend, id('white-K', team)).some(m => m.type === 'tackle'));
    assert.ok(E.legalMoves(defend, id('white-K', team), {freePawn: true}).every(m => m.type === 'move'));
    const own = fixture({team, positions: {'white-K': [4, 13]}}), home = point([4, 14], team);
    assert.ok(E.legalMoves(own, id('white-K', team), {freePawn: true}).some(m => m.x === home.x && m.y === home.y));
    const away = fixture({team, positions: {'white-K': [3, 1]}}), forbidden = point([4, 1], team);
    for (const freePawn of [false, true]) assert.ok(!E.legalMoves(away, id('white-K', team), {freePawn}).some(m => m.x === forbidden.x && m.y === forbidden.y));
  });

  test(`${team}: bonus collection of an opponent's loose ball gives ordinary king possession`, () => {
    const s = fixture({team, carrier: 'black-Q', phase: 'defendMove', ball: {x: 6, y: 14, carrierId: null}});
    s.looseBallKickOrigin = {team: other(team), pieceId: id('black-Q', team)};
    const destination = point([6, 14], team), next = E.applyMove(s, id('white-K', team), destination.x, destination.y, {freePawn: true});
    assert.equal(next.ball.carrierId, id('white-K', team)); assert.equal(next.phase, 'attackMove'); assert.equal(next.releaseReason, null);
    assert.equal(next.attack, team); assert.equal(next.positionBudget.pawnUsed, false, 'winning possession starts a fresh attacking turn'); assert.equal(next.randomState, s.randomState);
  });

  test(`${team}: collecting a loose back-pass forces release without spending the same progress round twice`, () => {
    const s = fixture({team, carrier: 'white-R1', phase: 'kick', positions: {'white-R1': [6, 12], 'white-Q': [5, 13]}});
    s.ballProgress.rounds = 1;
    const landing = point([6, 14], team), passed = E.applyKick(s, landing.x, landing.y, {roll: 0});
    assert.equal(passed.ball.carrierId, null); assert.equal(passed.ballProgress.rounds, 2);
    const collected = move(passed, 'white-K', [6, 14], true), before = structuredClone(collected);
    assert.equal(collected.phase, 'keeperRelease'); assert.equal(collected.releaseReason, 'backPass');
    assert.equal(collected.ballProgress.rounds, 2); assert.equal(collected.ballProgress.pendingRelease, true); assert.equal(collected.ballProgress.releaseAlreadyCounted, true);
    assert.equal(collected.randomState, passed.randomState); assert.deepEqual(E.legalMoves(collected, id('white-K', team)), []);
    const restored = E.normalizeGame(collected); assert.deepEqual(restored, collected); assert.deepEqual(collected, before);
    const receiver = point([5, 13], team), released = E.applyKick(restored, receiver.x, receiver.y, {roll: 0});
    assert.equal(released.ball.carrierId, id('white-Q', team)); assert.equal(released.ballProgress.rounds, 2); assert.equal(released.restart, null);
    assert.equal(released.ballProgress.pendingRelease, false); assert.equal('releaseAlreadyCounted' in released.ballProgress, false);
    const previousRng = released.randomState;
    for (const difficulty of ['casual', 'tactical']) { E.chooseAIAction(collected, {difficulty}); assert.deepEqual(collected, before); }
    const kicking = {...released, phase: 'kick'}, backward = point([5, 12], team), penalized = E.applyKick(kicking, backward.x, backward.y, {roll: 0});
    assert.equal(penalized.lastAction.type, 'stalling'); assert.equal(penalized.restart.team, other(team));
    assert.notEqual(penalized.randomState, previousRng);
  });

  test(`${team}: collecting the king's own loose pass spends its carry but does not create a teammate back-pass`, () => {
    const s = fixture({team, ball: {x: 6, y: 14, carrierId: null}});
    s.looseBallKickOrigin = {team, pieceId: id('white-K', team)};
    const next = move(s, 'white-K', [6, 14], true);
    assert.equal(next.lastAction.selfPassCollection, true); assert.equal(next.positionBudget.dribbleUsed, true);
    assert.equal(next.releaseReason, null); assert.equal(next.phase, 'attackMove'); assert.equal(next.ballProgress.releaseAlreadyCounted, undefined);
  });

  test(`${team}: spending the king bonus neither pauses the deadline nor consumes referee randomness`, () => {
    const s = fixture({team}), moved = move(s, 'white-K', [5, 15], true), before = structuredClone(moved), expired = E.actionTimeout(moved);
    assert.equal(expired.lastAction.type, 'timeout'); assert.equal(expired.lastAction.timedOutTeam, team);
    assert.equal(expired.restart.type, 'timeout'); assert.equal(expired.restart.team, other(team)); assert.equal(expired.restart.indirect, true);
    assert.equal(expired.randomState, s.randomState); assert.equal(expired.phase, 'attackMove'); assert.deepEqual(moved, before);
    assert.deepEqual(expired.positionBudget, {normalUsed: false, pawnUsed: false, dribbleUsed: false});
  });
}
