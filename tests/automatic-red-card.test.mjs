import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as E from '../dist/engine.js';

const source = await readFile(new URL('../dist/engine.js', import.meta.url), 'utf8');
const internal = await import(`data:text/javascript;base64,${Buffer.from(source + '\nexport {tacticalSuccessors};').toString('base64')}`);
const other = team => team === 'white' ? 'black' : 'white';
const point = ([x, y], team) => team === 'white' ? {x, y} : {x: E.BOARD_WIDTH - 1 - x, y: E.BOARD_HEIGHT - 1 - y};
const playerId = (id, team) => team === 'white' ? id : id.replace(/^(white|black)/, other);
function fixture(team = 'white', {keeper = false, inside = false, cover = null, knight = false, enabled = true} = {}) {
  const s = E.createGame({mode: 'local', seed: 2152, foulsEnabled: enabled});
  const row = inside ? 2 : 4, attacker = knight ? 'white-N1' : 'white-Q', offender = keeper ? 'black-K' : 'black-R1';
  const positions = {'white-K': [6, 15], 'black-K': [6, 0], [attacker]: [6, row], [offender]: [6, row - 1],
    ...(cover ? {'black-B2': cover} : {})};
  const used = new Set(Object.values(positions).map(p => p.join(',')));
  const parking = Array.from({length: 8}, (_, i) => [[0, 9 + i], [13, 9 + i], [1, 9 + i], [12, 9 + i]]).flat();
  for (const p of s.pieces) {
    const q = positions[p.id] || parking.find(q => !used.has(q.join(','))); used.add(q.join(','));
    Object.assign(p, point(q, team)); p.id = playerId(p.id, team); if (team === 'black') p.team = other(p.team);
  }
  const carrierId = playerId(attacker, team), pieceId = playerId(offender, team), contact = point([6, row], team);
  Object.assign(s, {attack: team, phase: 'defendMove', positionBudget: {normalUsed: false, pawnUsed: false, dribbleUsed: false},
    ball: {...contact, carrierId}, ballProgress: {team, anchorY: contact.y, rounds: 0, pendingRelease: false, excludeRelease: false}});
  const target = point([5, row], team), action = {type: 'move', pieceId, ...target};
  const move = E.legalMoves(s, pieceId).find(m => m.type === 'tackle' && m.x === target.x && m.y === target.y);
  assert.ok(move, 'fixture offers a legal tackle');
  return {s, pieceId, carrierId, action, move, team};
}
const challenge = (f, roll) => E.applyMove(f.s, f.pieceId, f.action.x, f.action.y, {roll});
const nextSeed = n => (Math.imul(1664525, n) + 1013904223) >>> 0;

for (const team of ['white', 'black']) {
  test(`${team}: last-defender fouls override every card partition and preserve the one-draw foul chance`, () => {
    for (const inside of [false, true]) for (const roll of [0, .019999, .02, .069999, .07, .099999, .1, .999999]) {
      const f = fixture(team, {inside}), before = structuredClone(f.s), after = challenge(f, roll);
      assert.equal(f.move.automaticRedReason, 'lastDefender'); assert.equal(f.move.foulProbability, .1);
      assert.deepEqual(f.s, before); assert.equal(after.randomState, nextSeed(f.s.randomState));
      if (roll >= .1) { assert.equal(after.lastAction.type, 'tackle'); assert.equal(after.pieces.length, 22); continue; }
      assert.equal(after.lastAction.card, 'red'); assert.equal(after.lastAction.automaticRedReason, 'lastDefender');
      assert.equal(after.lastAction.secondYellow, false); assert.deepEqual(after.discipline[f.pieceId], {yellowCards: 0, redCard: true});
      assert.equal(after.pieces.length, 21); assert.equal(after.restart.type, inside ? 'penalty' : 'freeKick');
      assert.equal(after.sentOff[0].automaticRedReason, 'lastDefender');
      assert.deepEqual(E.normalizeGame(after), after, 'reload retains the exact dismissal and reason');
    }
  });

  test(`${team}: only other defending outfielders strictly between the rows supply cover, on any file`, () => {
    for (const [cover, expected] of [[[0, 1], false], [[13, 3], false], [[0, 0], true], [[0, 4], true], [[0, 5], true]]) {
      const f = fixture(team, {cover}), after = challenge(f, .08);
      assert.equal(f.move.automaticRedReason === 'lastDefender', expected);
      assert.equal(after.lastAction.card, expected ? 'red' : null);
    }
    const f = fixture(team), friend = f.s.pieces.find(p => p.id === playerId('white-B2', team));
    Object.assign(friend, point([7, 2], team));
    assert.equal(challenge(f, .08).lastAction.card, 'red', 'an attacking teammate is not defensive cover');
  });

  test(`${team}: a warning plus an automatic red stays a straight red; ordinary two yellows still dismiss`, () => {
    for (const cover of [null, [0, 1]]) {
      const f = fixture(team, {cover}); f.s.discipline[f.pieceId] = {yellowCards: 1, redCard: false};
      const after = challenge(f, .04);
      assert.equal(after.lastAction.card, 'red'); assert.equal(after.lastAction.secondYellow, !!cover);
      assert.equal(after.discipline[f.pieceId].yellowCards, cover ? 2 : 1); assert.equal(after.pieces.length, 21);
      assert.equal(after.sentOff[0].reason, cover ? 'secondYellow' : 'red');
    }
  });

  test(`${team}: keeper fouls use the contact square, even when the keeper starts inside the box`, () => {
    const outside = fixture(team, {keeper: true, cover: [0, 1]});
    Object.assign(outside.s.pieces.find(p => p.id === outside.pieceId), point([6, 2], team));
    Object.assign(outside.s.pieces.find(p => p.id === outside.carrierId), point([6, 3], team));
    Object.assign(outside.s.ball, point([6, 3], team)); Object.assign(outside.action, point([5, 3], team));
    const red = challenge(outside, .08);
    assert.equal(red.lastAction.card, 'red'); assert.equal(red.lastAction.automaticRedReason, 'keeperOutsideBox');
    assert.equal(red.restart.type, 'freeKick'); assert.equal(red.pieces.length, 21);
    const inside = fixture(team, {keeper: true, inside: true});
    Object.assign(inside.s.pieces.find(p => p.id === inside.pieceId), point([6, 3], team));
    const plain = challenge(inside, .08);
    assert.equal(plain.lastAction.card, null); assert.equal(plain.lastAction.automaticRedReason, undefined);
    assert.equal(plain.restart.type, 'penalty'); assert.equal(plain.pieces.length, 22);
  });

  test(`${team}: a keeper red promotes the nearest pawn, or nearest teammate when no pawn remains`, () => {
    for (const noPawns of [false, true]) {
      const f = fixture(team, {keeper: true}), defending = other(team);
      if (noPawns) for (const pawn of [...f.s.pieces].filter(p => p.team === defending && p.type === 'P')) {
        f.s.pieces = f.s.pieces.filter(p => p.id !== pawn.id); f.s.sentOff.push({...pawn, reason: 'red', yellowCards: 0});
        f.s.discipline[pawn.id] = {yellowCards: 0, redCard: true};
      }
      const origin = f.s.pieces.find(p => p.id === f.pieceId);
      const expected = f.s.pieces.filter(p => p.team === defending && p.id !== f.pieceId)
        .sort((a, b) => Number(b.type === 'P') - Number(a.type === 'P')
          || Math.hypot(a.x - origin.x, a.y - origin.y) - Math.hypot(b.x - origin.x, b.y - origin.y) || a.id.localeCompare(b.id))[0];
      const after = challenge(f, .08), keeper = after.pieces.find(p => p.team === defending && p.type === 'K');
      assert.equal(keeper.id, expected.id); assert.equal(keeper.originalType, expected.type); assert.equal(keeper.replacementKeeper, true);
      assert.ok(E.inOwnBox(defending, keeper.x, keeper.y)); assert.equal(after.pieces.filter(p => p.team === defending).length, noPawns ? 7 : 10);
      assert.equal(after.lastAction.keeperReplacement.pieceId, expected.id); assert.deepEqual(E.normalizeGame(after), after);
    }
  });

  test(`${team}: a keeper red at seven players forfeits before assigning a replacement`, () => {
    const f = fixture(team, {keeper: true}), removed = f.s.pieces.filter(p => p.team === other(team) && p.type !== 'K').slice(0, 4);
    for (const p of removed) { f.s.sentOff.push({...p, reason: 'red', yellowCards: 0}); f.s.discipline[p.id] = {yellowCards: 0, redCard: true}; }
    f.s.pieces = f.s.pieces.filter(p => !removed.includes(p));
    const after = challenge(f, .08);
    assert.equal(after.phase, 'finished'); assert.equal(after.winner, team); assert.equal(after.finishReason, 'forfeit');
    assert.equal(after.lastAction.keeperReplacement, undefined); assert.equal(after.restart, null);
  });

  test(`${team}: automatic reds are disabled with Fouls mode and do not change knight evasion`, () => {
    for (const enabled of [false, true]) for (const [roll, kind] of [[.1, 'tackle'], [.9, 'tackleMiss']]) {
      const f = fixture(team, {enabled, knight: true}), after = challenge(f, roll);
      assert.equal(after.lastAction.type, kind); assert.equal(after.pieces.length, 22);
    }
    const f = fixture(team, {enabled: false}); assert.equal(f.move.automaticRedReason, undefined);
    assert.equal(challenge(f, .01).lastAction.type, 'tackle'); assert.equal(challenge(f, .01).randomState, f.s.randomState);
  });

  test(`${team}: AI enumerates the same 10% automatic red, including keeper replacement`, () => {
    for (const keeper of [false, true]) for (const knight of [false, true]) {
      const f = fixture(team, {keeper, knight}), before = structuredClone(f.s), outcomes = internal.tacticalSuccessors(f.s, f.action);
      assert.deepEqual(outcomes.map(o => o.probability), knight ? [.1, .45, .45] : [.1, .9]);
      const foul = outcomes[0].state;
      assert.equal(foul.discipline[f.pieceId].redCard, true); assert.equal(foul.pieces.length, 21);
      assert.equal(foul.sentOff[0].automaticRedReason, keeper ? 'keeperOutsideBox' : 'lastDefender');
      assert.equal(foul.pieces.some(p => p.replacementKeeper), keeper);
      assert.deepEqual(f.s, before); assert.deepEqual(internal.tacticalSuccessors({...f.s, randomState: 0}, f.action), outcomes);
    }
  });
}
