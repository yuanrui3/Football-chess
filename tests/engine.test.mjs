import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame, legalMoves, legalKicks, applyMove, applyKick,
  skipMove, chooseAIAction, currentTeam,
} from '../dist/engine.js';

const HOME = {
  'white-K': [3, 10], 'white-Q': [0, 9], 'white-R': [7, 9],
  'white-B': [0, 8], 'white-N': [7, 8], 'white-P': [0, 7],
  'black-K': [4, 0], 'black-Q': [7, 1], 'black-R': [0, 1],
  'black-B': [7, 2], 'black-N': [0, 2], 'black-P': [7, 3],
};

function fixture({ phase = 'attackMove', attack = 'white', carrier = 'white-R', positions = {}, ball, mode = 'local' } = {}) {
  const state = createGame({ mode, kickoff: attack, minutes: 10 });
  for (const p of state.pieces) {
    [p.x, p.y] = positions[p.id] || HOME[p.id];
  }
  state.phase = phase;
  state.attack = attack;
  state.score = { white: 0, black: 0 };
  const owner = state.pieces.find(p => p.id === carrier);
  state.ball = ball || { x: owner.x, y: owner.y, carrierId: carrier };
  return state;
}

function hasMove(state, id, x, y) {
  return legalMoves(state, id).some(move => move.x === x && move.y === y);
}

function assertIntegrity(state) {
  assert.equal(state.pieces.length, 12, 'a tackle must never capture a piece');
  assert.equal(new Set(state.pieces.map(p => p.id)).size, 12);
  assert.equal(new Set(state.pieces.map(p => `${p.x},${p.y}`)).size, 12, 'pieces may not share a square');
  for (const p of state.pieces) {
    assert.ok(p.x >= 0 && p.x < 8 && p.y >= 0 && p.y < 11, `${p.id} must remain on the pitch`);
    const inBox = (p.x === 3 || p.x === 4) && (p.y < 2 || p.y > 8);
    if (inBox) assert.equal(p.id.endsWith('-K'), true, `${p.id} cannot enter the goal area`);
  }
  if (state.ball.carrierId) {
    const carrier = state.pieces.find(p => p.id === state.ball.carrierId);
    assert.ok(carrier);
    assert.equal(state.ball.x, carrier.x);
    assert.equal(state.ball.y, carrier.y);
    assert.equal(state.attack, carrier.team);
  }
}

function applyAction(state, action) {
  assert.ok(action, 'AI must return an action for a running game');
  if (action.type === 'move') {
    assert.ok(hasMove(state, action.pieceId, action.x, action.y), 'AI move must be in legalMoves');
    return applyMove(state, action.pieceId, action.x, action.y);
  }
  if (action.type === 'kick') {
    assert.ok(legalKicks(state).some(kick => kick.x === action.x && kick.y === action.y), 'AI kick must be in legalKicks');
    return applyKick(state, action.x, action.y);
  }
  assert.equal(action.type, 'skip');
  return skipMove(state);
}

test('both play modes create a legal 12-piece match and honor the kickoff team', () => {
  for (const mode of ['solo', 'local']) {
    for (const kickoff of ['white', 'black']) {
      const state = createGame({ mode, kickoff, minutes: 5 });
      assert.equal(state.mode, mode);
      assert.equal(state.phase, 'kickoff');
      assert.equal(currentTeam(state), kickoff);
      assert.ok(state.ball.carrierId.startsWith(kickoff));
      assert.ok(legalKicks(state).length > 0);
      assert.deepEqual(state.score, { white: 0, black: 0 });
      assertIntegrity(state);
    }
  }
});

test('kickoff starts with a kick and opens the ordinary three-phase cycle', () => {
  const state = createGame({ kickoff: 'white' });
  const kick = legalKicks(state).find(k => !k.goal);
  const next = applyKick(state, kick.x, kick.y);
  assert.equal(next.phase, 'attackMove');
  assertIntegrity(next);
});

test('positional phases alternate attacker, defender, then attacker kick', () => {
  const state = fixture();
  assert.equal(currentTeam(state), 'white');
  const defending = skipMove(state);
  assert.equal(defending.phase, 'defendMove');
  assert.equal(currentTeam(defending), 'black');
  const kicking = skipMove(defending);
  assert.equal(kicking.phase, 'kick');
  assert.equal(currentTeam(kicking), 'white');
});

test('wrong-team and blocked positional moves are rejected without mutating state', () => {
  const state = fixture({ positions: { 'white-R': [0, 5], 'white-P': [2, 5] } });
  const before = JSON.stringify(state);
  assert.equal(hasMove(state, 'white-R', 3, 5), false);
  assert.throws(() => applyMove(state, 'white-R', 3, 5));
  assert.throws(() => applyMove(state, 'black-Q', 6, 1));
  assert.equal(JSON.stringify(state), before);
});

test('moving the carrier carries the ball and preserves the input state', () => {
  const state = fixture({ positions: { 'white-R': [0, 5] } });
  const before = JSON.stringify(state);
  const next = applyMove(state, 'white-R', 1, 5);
  assert.deepEqual(next.ball, { x: 1, y: 5, carrierId: 'white-R' });
  assert.equal(next.phase, 'defendMove');
  assert.equal(JSON.stringify(state), before);
  assertIntegrity(next);
});

test('a pass cannot travel beyond the first teammate on its ray', () => {
  const state = fixture({ phase: 'kick', positions: { 'white-R': [0, 5], 'white-P': [3, 5] } });
  const kicks = legalKicks(state);
  assert.ok(kicks.some(k => k.x === 3 && k.y === 5));
  assert.equal(kicks.some(k => k.y === 5 && k.x > 3), false);
  const next = applyKick(state, 3, 5);
  assert.equal(next.ball.carrierId, 'white-P');
  assert.equal(next.attack, 'white');
  assert.equal(next.phase, 'attackMove');
  assertIntegrity(next);
});

test('an opposing piece intercepts the first occupied square and becomes attacker', () => {
  const state = fixture({ phase: 'kick', positions: { 'white-R': [0, 5], 'black-P': [3, 5] } });
  const kicks = legalKicks(state);
  assert.equal(kicks.some(k => k.y === 5 && k.x > 3), false);
  const next = applyKick(state, 3, 5);
  assert.equal(next.ball.carrierId, 'black-P');
  assert.equal(next.attack, 'black');
  assert.equal(next.phase, 'attackMove');
  assert.equal(currentTeam(next), 'black');
  assertIntegrity(next);
});

test('defensive tackle transfers possession, leaves the old carrier, and captures nobody', () => {
  const state = fixture({ phase: 'defendMove', positions: { 'white-R': [4, 5], 'black-R': [0, 5] } });
  const tackle = legalMoves(state, 'black-R').find(m => m.type === 'tackle');
  assert.ok(tackle, 'the unobstructed rook must be able to tackle');
  const next = applyMove(state, 'black-R', tackle.x, tackle.y);
  assert.equal(next.ball.carrierId, 'black-R');
  assert.equal(next.attack, 'black');
  assert.equal(next.phase, 'attackMove');
  assert.deepEqual(next.pieces.find(p => p.id === 'white-R'), state.pieces.find(p => p.id === 'white-R'));
  const defender = next.pieces.find(p => p.id === 'black-R');
  assert.equal(Math.max(Math.abs(defender.x - 4), Math.abs(defender.y - 5)), 1);
  assertIntegrity(next);
});

test('pieces without the ball cannot be captured or tackled', () => {
  const state = fixture({ phase: 'defendMove', positions: { 'white-R': [4, 5], 'white-P': [2, 3], 'black-R': [0, 3] } });
  assert.equal(legalMoves(state, 'black-R').some(m => m.type === 'tackle'), false);
  assert.equal(hasMove(state, 'black-R', 2, 3), false);
  assert.equal(hasMove(state, 'black-R', 3, 3), false);
});

test('only kings can move into either four-square goal area', () => {
  const bishop = fixture({ positions: { 'white-B': [2, 2] } });
  assert.equal(hasMove(bishop, 'white-B', 3, 1), false);
  const rook = fixture({ positions: { 'white-R': [3, 2] } });
  assert.equal(hasMove(rook, 'white-R', 3, 1), false);
  const king = fixture({ positions: { 'white-K': [2, 2] } });
  assert.equal(hasMove(king, 'white-K', 3, 1), true);
  const ownGoalArea = fixture({ positions: { 'white-B': [2, 8] } });
  assert.equal(hasMove(ownGoalArea, 'white-B', 3, 9), false);
});

test('landing the ball inside the goal area does not by itself score', () => {
  const state = fixture({ phase: 'kick', positions: { 'white-R': [3, 3] } });
  const next = applyKick(state, 3, 0);
  assert.deepEqual(next.score, { white: 0, black: 0 });
  assert.equal(next.ball.carrierId, null);
  assert.equal(next.ball.x, 3);
  assert.equal(next.ball.y, 0);
});

test('crossing the opponent net scores and gives the conceding side kickoff', () => {
  const state = fixture({ phase: 'kick', positions: { 'white-R': [3, 3] } });
  assert.ok(legalKicks(state).some(k => k.x === 3 && k.y === -1));
  const next = applyKick(state, 3, -1);
  assert.deepEqual(next.score, { white: 1, black: 0 });
  assert.equal(next.phase, 'kickoff');
  assert.equal(next.attack, 'black');
  assert.ok(next.ball.carrierId.startsWith('black'));
  assertIntegrity(next);
});

test('the opposite net can be scored in and an own goal credits the opponent', () => {
  const state = fixture({ phase: 'kick', positions: { 'white-R': [4, 7], 'white-K': [3, 10] } });
  assert.ok(legalKicks(state).some(k => k.x === 4 && k.y === 11));
  const next = applyKick(state, 4, 11);
  assert.deepEqual(next.score, { white: 0, black: 1 });
  assert.equal(next.phase, 'kickoff');
  assert.equal(next.attack, 'white');
  assertIntegrity(next);
});

test('a goalkeeper blocks a goal-bound shot before the net', () => {
  const state = fixture({ phase: 'kick', positions: { 'white-R': [3, 3], 'black-K': [3, 0] } });
  const kicks = legalKicks(state);
  assert.equal(kicks.some(k => k.x === 3 && k.y === -1), false);
  const next = applyKick(state, 3, 0);
  assert.deepEqual(next.score, { white: 0, black: 0 });
  assert.equal(next.ball.carrierId, 'black-K');
  assert.equal(next.attack, 'black');
  assertIntegrity(next);
});

test('the ball stops at the side edge rather than leaving the pitch', () => {
  const state = fixture({ phase: 'kick', positions: { 'white-R': [4, 5] } });
  const next = applyKick(state, 7, 5);
  assert.equal(next.ball.x, 7);
  assert.equal(next.ball.y, 5);
  assert.equal(next.ball.carrierId, null);
  assert.equal(legalKicks(state).some(k => k.x > 7), false);
});

test('a loose pass can be collected during the attack positional move', () => {
  const state = fixture({ phase: 'kick', positions: { 'white-R': [0, 5], 'white-N': [1, 3] } });
  const loose = applyKick(state, 2, 5);
  assert.equal(loose.ball.carrierId, null);
  assert.equal(loose.attack, 'white');
  assert.equal(loose.phase, 'attackMove');
  const collected = applyMove(loose, 'white-N', 2, 5);
  assert.equal(collected.ball.carrierId, 'white-N');
  assert.equal(collected.phase, 'defendMove');
  assertIntegrity(collected);
});

test('defender collecting a loose ball becomes the next attacker', () => {
  const state = fixture({ phase: 'defendMove', positions: { 'black-N': [1, 3] }, carrier: null, ball: { x: 2, y: 5, carrierId: null } });
  const next = applyMove(state, 'black-N', 2, 5);
  assert.equal(next.ball.carrierId, 'black-N');
  assert.equal(next.attack, 'black');
  assert.equal(next.phase, 'attackMove');
  assertIntegrity(next);
});

test('a loose ball permits the game to advance without an impossible kick', () => {
  let state = fixture({ carrier: null, ball: { x: 2, y: 5, carrierId: null } });
  state = skipMove(state);
  state = skipMove(state);
  if (state.phase === 'kick') {
    assert.deepEqual(legalKicks(state), []);
    state = skipMove(state);
  }
  assert.equal(state.phase, 'attackMove');
  assertIntegrity(state);
});

test('knight kicks are L-shaped hops and may jump intervening pieces', () => {
  const state = fixture({ phase: 'kick', carrier: 'white-N', positions: { 'white-N': [2, 5], 'black-P': [2, 4] } });
  assert.ok(legalKicks(state).some(k => k.x === 3 && k.y === 3));
  const next = applyKick(state, 3, 3);
  assert.equal(next.ball.x, 3);
  assert.equal(next.ball.y, 3);
  assert.equal(next.ball.carrierId, null);
  assertIntegrity(next);
});

test('king kicks may travel beyond one square while king positional moves may not', () => {
  const state = fixture({ phase: 'kick', carrier: 'white-K', positions: { 'white-K': [3, 5] } });
  assert.ok(legalKicks(state).some(k => k.x === 3 && k.y === 2));
  const moving = { ...state, phase: 'attackMove' };
  assert.equal(hasMove(moving, 'white-K', 3, 3), false);
});

test('a pawn stranded at the far border can stop the ball and advance the turn', () => {
  for (const [team, y] of [['white', 0], ['black', 10]]) {
    const carrier = `${team}-P`;
    const state = fixture({
      phase: 'kick', attack: team, carrier,
      positions: { [carrier]: [1, y] },
    });
    const kicks = legalKicks(state);
    assert.equal(kicks.length, 1, 'the border-stop fallback is the stranded pawn\'s only kick');
    assert.equal(kicks[0].x, 1);
    assert.equal(kicks[0].y, y);
    const next = applyKick(state, 1, y);
    assert.equal(next.phase, 'attackMove');
    assert.equal(next.attack, team);
    assert.deepEqual(next.ball, { x: 1, y, carrierId: carrier });
    assert.deepEqual(next.score, { white: 0, black: 0 });
    assert.equal(next.lastAction.borderStop, true);
    assertIntegrity(next);
  }
});

test('AI collects an available loose ball instead of only approaching it', () => {
  const state = fixture({
    carrier: null,
    positions: { 'white-N': [1, 3] },
    ball: { x: 2, y: 5, carrierId: null },
  });
  const action = chooseAIAction(state);
  assert.deepEqual(action, { type: 'move', pieceId: 'white-N', x: 2, y: 5 });
  const next = applyAction(state, action);
  assert.equal(next.ball.carrierId, 'white-N');
  assertIntegrity(next);
});

test('AI chooses legal actions through extended play in both modes', () => {
  for (const mode of ['solo', 'local']) {
    let state = createGame({ mode, kickoff: 'white' });
    const phases = new Set();
    for (let i = 0; i < 160 && state.phase !== 'finished'; i++) {
      phases.add(state.phase);
      state = applyAction(state, chooseAIAction(state));
      assertIntegrity(state);
    }
    assert.ok(phases.has('kickoff'));
    assert.ok(phases.has('attackMove'));
    assert.ok(phases.has('defendMove'));
    assert.ok(phases.has('kick'));
  }
});
