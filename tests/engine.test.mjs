import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BOARD_WIDTH, BOARD_HEIGHT, GOAL_FILES, isBox,
  createGame, legalMoves, legalKicks, applyMove, applyKick,
  skipMove, chooseAIAction, currentTeam, shotChance, passAccuracy,
} from '../dist/engine.js';

const TEAM_IDS = ['K', 'Q', 'R1', 'R2', 'B1', 'B2', 'N1', 'N2', 'P1', 'P2', 'P3'];
const clone = value => JSON.parse(JSON.stringify(value));
const freshBudget = () => ({ normalUsed: false, pawnUsed: false });

// Park uninvolved players on the touchlines, preserving every member of the roster.
function fixture({ phase = 'attackMove', attack = 'white', carrier = 'white-R1', positions = {}, ball, budget, seed = 17, clear = [] } = {}) {
  const state = createGame({ mode: 'local', kickoff: attack, minutes: 10, seed });
  const assigned = { 'white-K': [4, 14], 'black-K': [7, 0], 'white-R1': [2, 10], ...positions };
  const occupied = new Set(Object.values(assigned).map(([x, y]) => `${x},${y}`));
  assert.equal(occupied.size, Object.keys(assigned).length, 'fixture overrides must not overlap');
  for (const [x, y] of clear) occupied.add(`${x},${y}`);
  const parking = Array.from({ length: 15 }, (_, y) => [[0, y], [11, y]]).flat();
  for (const p of state.pieces) {
    const location = assigned[p.id] || parking.find(([x, y]) => !occupied.has(`${x},${y}`));
    assert.ok(location, `parking exists for ${p.id}`);
    [p.x, p.y] = location;
    occupied.add(`${p.x},${p.y}`);
  }
  state.phase = phase;
  state.attack = attack;
  state.positionBudget = budget || freshBudget();
  state.score = { white: 0, black: 0 };
  const owner = state.pieces.find(p => p.id === carrier);
  state.ball = ball || { x: owner.x, y: owner.y, carrierId: carrier };
  return state;
}

function hasMove(state, id, x, y, options = {}) {
  return legalMoves(state, id, options).some(move => move.x === x && move.y === y);
}
function hasKick(state, x, y) {
  return legalKicks(state).some(kick => kick.x === x && kick.y === y);
}
function assertIntegrity(state) {
  assert.equal(state.pieces.length, 22, 'players are never captured');
  assert.equal(new Set(state.pieces.map(p => p.id)).size, 22);
  assert.equal(new Set(state.pieces.map(p => `${p.x},${p.y}`)).size, 22, 'players cannot share squares');
  for (const p of state.pieces) {
    assert.ok(p.x >= 0 && p.x < BOARD_WIDTH && p.y >= 0 && p.y < BOARD_HEIGHT, `${p.id} stays on pitch`);
    if (isBox(p.x, p.y)) assert.equal(p.type, 'K', `${p.id} cannot enter a goal area`);
  }
  if (state.ball.carrierId) {
    const carrier = state.pieces.find(p => p.id === state.ball.carrierId);
    assert.ok(carrier);
    assert.equal(state.ball.x, carrier.x);
    assert.equal(state.ball.y, carrier.y);
    assert.equal(state.attack, carrier.team);
  }
  if (state.phase === 'attackMove' || state.phase === 'defendMove') {
    assert.equal(typeof state.positionBudget.normalUsed, 'boolean');
    assert.equal(typeof state.positionBudget.pawnUsed, 'boolean');
    assert.equal(state.positionBudget.normalUsed && state.positionBudget.pawnUsed, false, 'spent budgets advance the phase');
  }
  if (state.phase === 'keeperReact') assert.ok(state.pendingShot, 'reaction must retain the declared shot');
}
function applyAction(state, action) {
  assert.ok(action);
  if (action.type === 'move') {
    const options = { freePawn: !!action.freePawn };
    assert.ok(hasMove(state, action.pieceId, action.x, action.y, options), 'AI move must be offered by legalMoves');
    return applyMove(state, action.pieceId, action.x, action.y, options);
  }
  if (action.type === 'kick') {
    assert.ok(hasKick(state, action.x, action.y), 'AI kick must be offered by legalKicks');
    return applyKick(state, action.x, action.y);
  }
  assert.equal(action.type, 'skip');
  return skipMove(state);
}
function declaredShot({ x = 4, keeper = [7, 0], attack = 'white' } = {}) {
  const white = attack === 'white';
  const y = white ? -1 : 15;
  const state = fixture({
    phase: 'kick', attack, carrier: `${attack}-R1`,
    positions: { [`${attack}-R1`]: [x, white ? 4 : 10], [`${white ? 'black' : 'white'}-K`]: keeper },
  });
  assert.ok(hasKick(state, x, y));
  return applyKick(state, x, y);
}

test('pitch constants and four-wide two-deep goal areas match the expanded board', () => {
  assert.equal(BOARD_WIDTH, 12);
  assert.equal(BOARD_HEIGHT, 15);
  assert.deepEqual(GOAL_FILES, [4, 5, 6, 7]);
  for (const x of GOAL_FILES) {
    for (const y of [0, 1, 13, 14]) assert.equal(isBox(x, y), true);
    assert.equal(isBox(x, 2), false);
    assert.equal(isBox(x, 12), false);
  }
  assert.equal(isBox(3, 0), false);
  assert.equal(isBox(8, 14), false);
});

test('both modes and kickoff teams create eleven players per side with the requested roster', () => {
  for (const mode of ['solo', 'local']) for (const kickoff of ['white', 'black']) {
    const state = createGame({ mode, kickoff, minutes: 5, seed: 123 });
    assert.equal(state.mode, mode);
    assert.equal(state.phase, 'kickoff');
    assert.equal(currentTeam(state), kickoff);
    assert.equal(state.ball.carrierId, `${kickoff}-Q`);
    for (const team of ['white', 'black']) {
      assert.deepEqual(state.pieces.filter(p => p.team === team).map(p => p.id).sort(), TEAM_IDS.map(id => `${team}-${id}`).sort());
      assert.deepEqual(state.pieces.filter(p => p.team === team).map(p => p.type).sort(), ['K', 'Q', 'R', 'R', 'B', 'B', 'N', 'N', 'P', 'P', 'P'].sort());
    }
    assert.ok(legalKicks(state).length);
    assert.deepEqual(state.score, { white: 0, black: 0 });
    assertIntegrity(state);
  }
});

test('kickoff opens a fresh positioning budget and skip ends a positional turn', () => {
  const state = createGame({ seed: 31 });
  const kick = legalKicks(state).find(k => !k.goal && k.accuracy === 1);
  const next = applyKick(state, kick.x, kick.y);
  assert.equal(next.phase, 'attackMove');
  assert.deepEqual(next.positionBudget, freshBudget());
  const defend = skipMove(next);
  assert.equal(defend.phase, 'defendMove');
  assert.equal(currentTeam(defend), 'black');
  const final = skipMove(defend);
  assert.equal(final.phase, final.ball.carrierId ? 'kick' : 'attackMove');
  assertIntegrity(final);
});

test('a normal move preserves the bonus pawn option until used or ended', () => {
  const state = fixture({ positions: { 'white-R1': [2, 8], 'white-P1': [8, 8] } });
  const next = applyMove(state, 'white-R1', 3, 8);
  assert.equal(next.phase, 'attackMove');
  assert.deepEqual(next.positionBudget, { normalUsed: true, pawnUsed: false });
  assert.deepEqual(legalMoves(next, 'white-R1'), []);
  assert.equal(hasMove(next, 'white-P1', 8, 7, { freePawn: true }), true);
  assert.deepEqual(next.ball, { x: 3, y: 8, carrierId: 'white-R1' });
  const defend = applyMove(next, 'white-P1', 8, 7, { freePawn: true });
  assert.equal(defend.phase, 'defendMove');
  assert.deepEqual(defend.positionBudget, freshBudget());
  assertIntegrity(defend);
});

test('bonus pawn can be used first and normal move can then finish the turn', () => {
  const state = fixture({ positions: { 'white-R1': [2, 8], 'white-P1': [8, 8] } });
  const bonus = applyMove(state, 'white-P1', 9, 8, { freePawn: true });
  assert.equal(bonus.phase, 'attackMove');
  assert.deepEqual(bonus.positionBudget, { normalUsed: false, pawnUsed: true });
  assert.deepEqual(legalMoves(bonus, 'white-P1', { freePawn: true }), []);
  const defend = applyMove(bonus, 'white-R1', 3, 8);
  assert.equal(defend.phase, 'defendMove');
  assert.deepEqual(defend.positionBudget, freshBudget());
});

test('one pawn may take both its bonus and normal moves but cannot take either twice', () => {
  const state = fixture({ positions: { 'white-P1': [8, 8] } });
  const bonus = applyMove(state, 'white-P1', 8, 7, { freePawn: true });
  const defend = applyMove(bonus, 'white-P1', 8, 6);
  assert.equal(defend.phase, 'defendMove');
  assert.equal(hasMove(defend, 'white-P1', 8, 5), false);
  assert.equal(hasMove(defend, 'white-P1', 8, 5, { freePawn: true }), false);
});

test('both teams receive a free pawn option in their positioning turn', () => {
  const state = fixture({ phase: 'defendMove', positions: { 'black-P1': [8, 8] } });
  assert.equal(hasMove(state, 'black-P1', 8, 7, { freePawn: true }), true);
  assert.equal(hasMove(state, 'white-P1', 1, 6, { freePawn: true }), false);
  const bonus = applyMove(state, 'black-P1', 8, 7, { freePawn: true });
  assert.equal(bonus.phase, 'defendMove');
  assert.equal(currentTeam(bonus), 'black');
  assert.equal(skipMove(bonus).phase, 'kick');
});

test('pawns move one square forward, backward, left and right for both teams', () => {
  for (const attack of ['white', 'black']) {
    const id = `${attack}-P1`;
    const state = fixture({ attack, positions: { [id]: [8, 7] } });
    for (const [x, y] of [[8, 6], [8, 8], [7, 7], [9, 7]]) {
      assert.equal(hasMove(state, id, x, y), true);
      assert.equal(hasMove(state, id, x, y, { freePawn: true }), true);
    }
    assert.equal(hasMove(state, id, 9, 6), false);
    assert.equal(hasMove(state, id, 8, 5), false);
  }
});

test('a bonus pawn is restricted to empty cardinal squares and cannot tackle', () => {
  const state = fixture({ phase: 'defendMove', positions: { 'white-R1': [7, 7], 'black-P1': [6, 6], 'black-P2': [6, 5] } });
  const normal = legalMoves(state, 'black-P1');
  assert.ok(normal.some(m => m.type === 'tackle'));
  const bonus = legalMoves(state, 'black-P1', { freePawn: true });
  assert.ok(bonus.length);
  assert.equal(bonus.some(m => m.type === 'tackle'), false);
  assert.equal(bonus.some(m => m.x === 6 && m.y === 5), false);
  assert.equal(hasMove(state, 'black-R1', 5, 5, { freePawn: true }), false);
});

test('wrong-team, blocked, and invalid bonus actions reject without mutating input', () => {
  const state = fixture({ positions: { 'white-R1': [2, 8], 'white-P1': [4, 8] } });
  const before = clone(state);
  assert.equal(hasMove(state, 'white-R1', 5, 8), false);
  assert.throws(() => applyMove(state, 'white-R1', 5, 8));
  assert.throws(() => applyMove(state, 'black-K', 6, 0));
  assert.throws(() => applyMove(state, 'white-R1', 3, 8, { freePawn: true }));
  assert.deepEqual(state, before);
});

test('rook, bishop and queen normal movement is capped at ten squares', () => {
  for (const [type, from, ten, eleven] of [
    ['R1', [2, 13], [2, 3], [2, 2]],
    ['B1', [0, 12], [10, 2], [11, 1]],
    ['Q', [3, 13], [3, 3], [3, 2]],
  ]) {
    const id = `white-${type}`;
    const state = fixture({ positions: { 'white-R1': [9, 7], [id]: from }, clear: [ten, eleven] });
    assert.equal(hasMove(state, id, ...ten), true, `${type} can move ten squares`);
    assert.equal(hasMove(state, id, ...eleven), false, `${type} cannot move eleven squares`);
  }
});

test('tackles cannot land more than ten squares from their starting square', () => {
  const state = fixture({ phase: 'defendMove', positions: { 'white-R1': [2, 12], 'black-R1': [2, 2] } });
  const moves = legalMoves(state, 'black-R1');
  assert.ok(moves.some(m => m.type === 'tackle' && m.x === 2 && m.y === 11));
  assert.equal(moves.some(m => m.type === 'tackle' && m.y === 13), false);
  for (const move of moves) assert.ok(Math.max(Math.abs(move.x - 2), Math.abs(move.y - 2)) <= 10);
});

test('tackling transfers possession without capturing and resets both budgets', () => {
  const state = fixture({ phase: 'defendMove', budget: { normalUsed: false, pawnUsed: true }, positions: { 'white-R1': [6, 7], 'black-R1': [2, 7] } });
  const tackle = legalMoves(state, 'black-R1').find(m => m.type === 'tackle');
  assert.ok(tackle);
  const next = applyMove(state, 'black-R1', tackle.x, tackle.y);
  assert.equal(next.ball.carrierId, 'black-R1');
  assert.equal(next.attack, 'black');
  assert.equal(next.phase, 'attackMove');
  assert.deepEqual(next.positionBudget, freshBudget());
  assert.deepEqual(next.pieces.find(p => p.id === 'white-R1'), state.pieces.find(p => p.id === 'white-R1'));
  assertIntegrity(next);
});

test('players without the ball cannot be captured or tackled', () => {
  const state = fixture({ phase: 'defendMove', positions: { 'white-R1': [6, 7], 'white-P1': [4, 5], 'black-R1': [2, 5] } });
  assert.equal(legalMoves(state, 'black-R1').some(m => m.type === 'tackle'), false);
  assert.equal(hasMove(state, 'black-R1', 4, 5), false);
  assert.equal(hasMove(state, 'black-R1', 5, 5), false);
});

test('knights dribble over intervening defenders and carry the ball to an empty L destination', () => {
  const state = fixture({ carrier: 'white-N1', positions: { 'white-N1': [5, 7], 'black-P1': [5, 6], 'black-P2': [6, 7] } });
  assert.equal(hasMove(state, 'white-N1', 6, 5), true);
  const next = applyMove(state, 'white-N1', 6, 5);
  assert.deepEqual(next.ball, { x: 6, y: 5, carrierId: 'white-N1' });
  assertIntegrity(next);
});

test('a knight carrying the ball cannot be tackled by any opposing piece type', () => {
  const cases = [['R1', [2, 7]], ['B1', [3, 5]], ['Q', [3, 7]], ['N1', [4, 5]], ['P1', [4, 6]], ['K', [4, 7]]];
  for (const [suffix, location] of cases) {
    const id = `black-${suffix}`;
    const state = fixture({ phase: 'defendMove', carrier: 'white-N1', positions: { 'white-N1': [5, 7], [id]: location } });
    assert.equal(legalMoves(state, id).some(m => m.type === 'tackle'), false, `${suffix} cannot tackle a knight`);
  }
});

test('only kings can enter either expanded goal area', () => {
  for (const [id, from, to] of [
    ['white-B1', [3, 2], [4, 1]], ['white-R1', [6, 2], [6, 1]],
    ['white-N1', [3, 3], [4, 1]], ['white-P1', [7, 12], [7, 13]],
  ]) {
    const state = fixture({ positions: { [id]: from } });
    assert.equal(hasMove(state, id, ...to), false);
  }
  const state = fixture({ positions: { 'white-K': [3, 2] } });
  assert.equal(hasMove(state, 'white-K', 4, 1), true);
});

test('ordinary passes stop at the first teammate or opposing interceptor', () => {
  for (const receiver of ['white-P1', 'black-P1']) {
    const state = fixture({ phase: 'kick', positions: { 'white-R1': [2, 7], [receiver]: [6, 7] } });
    assert.equal(hasKick(state, 6, 7), true);
    assert.equal(legalKicks(state).some(k => k.y === 7 && k.x > 6), false);
    const next = applyKick(state, 6, 7);
    assert.equal(next.ball.carrierId, receiver);
    assert.equal(next.attack, receiver.split('-')[0]);
    assert.equal(next.phase, 'attackMove');
    assert.deepEqual(next.positionBudget, freshBudget());
    assertIntegrity(next);
  }
});

test('passing into a goal area alone never scores', () => {
  const state = fixture({ phase: 'kick', positions: { 'white-R1': [5, 4] } });
  const next = applyKick(state, 5, 0);
  assert.deepEqual(next.score, { white: 0, black: 0 });
  assert.deepEqual(next.ball, { x: 5, y: 0, carrierId: null });
});

test('pass accuracy is certain through ten squares then falls by ten points to a 25% floor', () => {
  for (const [distance, expected] of [[1, 1], [10, 1], [11, .9], [12, .8], [13, .7], [14, .6], [18, .25], [50, .25]]) {
    assert.ok(Math.abs(passAccuracy(distance) - expected) < 1e-10, `distance ${distance}`);
  }
  const state = fixture({ phase: 'kick', positions: { 'white-R1': [2, 13] } });
  for (const y of [3, 2, 1, 0]) {
    const kick = legalKicks(state).find(k => k.x === 2 && k.y === y);
    assert.ok(kick);
    assert.equal(kick.distance, 13 - y);
    assert.ok(Math.abs(kick.accuracy - passAccuracy(13 - y)) < 1e-10);
  }
});

test('an accurate long pass arrives below its probability threshold and fails at that threshold', () => {
  const state = fixture({ phase: 'kick', positions: { 'white-R1': [2, 13], 'white-P1': [2, 2] } });
  const hit = applyKick(state, 2, 2, { roll: .899999 });
  assert.equal(hit.ball.carrierId, 'white-P1');
  const miss = applyKick(state, 2, 2, { roll: .9 });
  assert.equal(miss.ball.carrierId, null);
  assert.notDeepEqual({ x: miss.ball.x, y: miss.ball.y }, { x: 2, y: 2 });
  assert.equal(miss.pieces.some(p => p.x === miss.ball.x && p.y === miss.ball.y), false, 'miss scatters onto an empty square');
  assertIntegrity(hit);
  assertIntegrity(miss);
});

test('long pass failure is seeded, reproducible and preserves its input', () => {
  const state = fixture({ phase: 'kick', seed: 112, positions: { 'white-R1': [2, 13], 'white-P1': [2, 0] } });
  const before = clone(state);
  const first = applyKick(state, 2, 0, { roll: .99 });
  const second = applyKick(state, 2, 0, { roll: .99 });
  assert.deepEqual(first, second);
  assert.deepEqual(state, before);
  assert.notEqual(first.randomState, state.randomState, 'scatter consumes seeded randomness');
  assertIntegrity(first);
});

test('kings receive a teammate pass only for an immediate release kick', () => {
  const state = fixture({ phase: 'kick', positions: { 'white-R1': [4, 10] } });
  const next = applyKick(state, 4, 14);
  assert.equal(next.phase, 'keeperRelease');
  assert.equal(currentTeam(next), 'white');
  assert.equal(next.ball.carrierId, 'white-K');
  assert.ok(legalKicks(next).length);
  assert.deepEqual(legalMoves(next, 'white-K'), []);
  assert.throws(() => applyMove(next, 'white-K', 5, 14));
  assert.throws(() => skipMove(next));
  const kick = legalKicks(next).find(k => k.x !== 4 || k.y !== 14);
  const released = applyKick(next, kick.x, kick.y, { roll: 0 });
  assert.notEqual(released.phase, 'keeperRelease');
  assertIntegrity(released);
});

test('an opposing king intercepting an ordinary pass may hold the ball normally', () => {
  const state = fixture({ phase: 'kick', positions: { 'white-R1': [7, 4] } });
  assert.equal(hasKick(state, 7, 0), true);
  const next = applyKick(state, 7, 0);
  assert.equal(next.ball.carrierId, 'black-K');
  assert.equal(next.attack, 'black');
  assert.equal(next.phase, 'attackMove');
  assert.deepEqual(next.positionBudget, freshBudget());
  assertIntegrity(next);
});

test('goal declarations wait for the defending goalkeeper before resolving the score', () => {
  const state = fixture({ phase: 'kick', positions: { 'white-R1': [4, 4], 'black-K': [7, 0] } });
  const before = clone(state);
  const reaction = applyKick(state, 4, -1);
  assert.equal(reaction.phase, 'keeperReact');
  assert.equal(currentTeam(reaction), 'black');
  assert.ok(reaction.pendingShot);
  assert.deepEqual(reaction.score, { white: 0, black: 0 });
  assert.deepEqual(legalKicks(reaction), []);
  assert.deepEqual(legalMoves(reaction, 'black-Q'), []);
  assert.deepEqual(legalMoves(reaction, 'black-P1', { freePawn: true }), []);
  assert.deepEqual(state, before);
});

test('goalkeeper reaction is one empty adjacent step and changes the final shot probability', () => {
  const reaction = declaredShot({ x: 4, keeper: [7, 0] });
  assert.equal(shotChance(reaction, 4, -1), 1);
  assert.equal(hasMove(reaction, 'black-K', 5, 0), false);
  assert.equal(hasMove(reaction, 'black-K', 6, 0), true);
  const result = applyMove(reaction, 'black-K', 6, 0, { roll: .6 });
  assert.deepEqual(result.score, { white: 0, black: 0 });
  assert.equal(result.ball.carrierId, 'black-K');
  assert.equal(result.phase, 'attackMove');
  assertIntegrity(result);
});

test('a goalkeeper standing on a shot ray does not prevent selecting the net', () => {
  const state = fixture({ phase: 'kick', positions: { 'white-R1': [4, 4], 'black-K': [4, 0] } });
  assert.equal(hasKick(state, 4, 0), true, 'ordinary pass to the keeper remains legal');
  assert.equal(hasKick(state, 4, -1), true, 'goal aim remains available beyond keeper');
  const result = skipMove(applyKick(state, 4, -1), { roll: 0 });
  assert.equal(result.score.white, 0);
  assert.equal(result.ball.carrierId, 'black-K');
});

test('outfield players still intercept a shot before the net', () => {
  const state = fixture({ phase: 'kick', positions: { 'white-R1': [4, 6], 'black-P1': [4, 3] } });
  assert.equal(hasKick(state, 4, 3), true);
  assert.equal(hasKick(state, 4, -1), false);
});

test('shot tiers use the goal impact square and Chebyshev keeper distance on either end', () => {
  for (const [attack, y] of [['white', -1], ['black', 15]]) {
    const endY = attack === 'white' ? 0 : 14;
    const keeperId = `${attack === 'white' ? 'black' : 'white'}-K`;
    for (const [distance, expected] of [[0, 0], [1, .25], [2, .5], [3, 1]]) {
      const state = fixture({ phase: 'kick', attack, carrier: `${attack}-R1`, positions: { [`${attack}-R1`]: [4, 7], [keeperId]: [4 + distance, endY] } });
      assert.equal(shotChance(state, 4, y), expected);
    }
    const state = fixture({ phase: 'kick', attack, carrier: `${attack}-R1`, positions: { [`${attack}-R1`]: [4, 7], [keeperId]: [4, endY + (endY === 0 ? 2 : -2)] } });
    assert.equal(shotChance(state, 4, y), .5, 'keeper depth contributes to Chebyshev distance');
  }
});

for (const [distance, chance] of [[0, 0], [1, .25], [2, .5], [3, 1]]) {
  test(`${chance * 100}% shot tier resolves deterministic probability boundaries`, () => {
    const reaction = declaredShot({ x: 4, keeper: [4 + distance, 0] });
    const rolls = chance === 0 ? [[0, false], [.999999, false]]
      : chance === 1 ? [[0, true], [.999999, true]]
      : [[0, true], [chance - .000001, true], [chance, false], [.999999, false]];
    for (const [roll, scores] of rolls) {
      const result = skipMove(reaction, { roll });
      assert.equal(result.score.white, scores ? 1 : 0, `roll ${roll}`);
      if (scores) {
        assert.equal(result.phase, 'kickoff');
        assert.equal(result.attack, 'black');
        assert.equal(result.ball.carrierId, 'black-Q');
      } else {
        assert.equal(result.phase, 'attackMove');
        assert.equal(result.attack, 'black');
        assert.equal(result.ball.carrierId, 'black-K');
        assert.deepEqual(result.positionBudget, freshBudget());
      }
      assertIntegrity(result);
    }
  });
}

test('the lower goal credits black and restarts with white kickoff', () => {
  const reaction = declaredShot({ x: 7, keeper: [4, 14], attack: 'black' });
  const result = skipMove(reaction, { roll: .99 });
  assert.deepEqual(result.score, { white: 0, black: 1 });
  assert.equal(result.phase, 'kickoff');
  assert.equal(result.attack, 'white');
  assertIntegrity(result);
});

test('a loose ball can be collected and defensive collection resets both budgets', () => {
  for (const [phase, team] of [['attackMove', 'white'], ['defendMove', 'black']]) {
    const id = `${team}-N1`;
    const state = fixture({ phase, carrier: null, positions: { [id]: [5, 7] }, ball: { x: 6, y: 5, carrierId: null }, budget: { normalUsed: false, pawnUsed: true } });
    const next = applyMove(state, id, 6, 5);
    assert.equal(next.ball.carrierId, id);
    assert.equal(next.attack, team);
    assert.equal(next.phase, phase === 'defendMove' ? 'attackMove' : 'defendMove');
    assert.deepEqual(next.positionBudget, freshBudget());
    assertIntegrity(next);
  }
});

test('loose ball positioning rounds can end without entering an impossible kick phase', () => {
  let state = fixture({ carrier: null, ball: { x: 8, y: 7, carrierId: null } });
  state = skipMove(skipMove(state));
  assert.equal(state.phase, 'attackMove');
  assert.deepEqual(legalKicks(state), []);
  assertIntegrity(state);
});

test('knight kicks still hop in an L over intervening pieces', () => {
  const state = fixture({ phase: 'kick', carrier: 'white-N1', positions: { 'white-N1': [5, 7], 'black-P1': [5, 6], 'black-P2': [6, 7] } });
  assert.equal(hasKick(state, 6, 5), true);
  const next = applyKick(state, 6, 5);
  assert.deepEqual(next.ball, { x: 6, y: 5, carrierId: null });
});

test('king kicks can travel beyond one square while positional king moves cannot', () => {
  const state = fixture({ phase: 'kick', carrier: 'white-K', positions: { 'white-K': [8, 7] } });
  assert.equal(hasKick(state, 8, 3), true);
  assert.equal(hasMove({ ...state, phase: 'attackMove' }, 'white-K', 8, 5), false);
});

test('pawns can kick in all four cardinal directions and are never stranded at the far border', () => {
  for (const team of ['white', 'black']) {
    const carrier = `${team}-P1`;
    const state = fixture({ phase: 'kick', attack: team, carrier, positions: { [carrier]: [8, 7] } });
    for (const [x, y] of [[8, 6], [8, 8], [7, 7], [9, 7]]) {
      const kick = legalKicks(state).find(k => k.x === x && k.y === y);
      assert.ok(kick);
      assert.equal(kick.accuracy, 1);
      const next = applyKick(state, x, y, { roll: .999999 });
      assert.deepEqual(next.ball, { x, y, carrierId: null });
      assertIntegrity(next);
    }
    const y = team === 'white' ? 0 : 14;
    const border = fixture({ phase: 'kick', attack: team, carrier, positions: { [carrier]: [2, y] } });
    assert.ok(legalKicks(border).length > 0);
    assert.equal(hasKick(border, 2, y === 0 ? 1 : 13), true, 'pawn can kick back onto the pitch');
  }
});

test('legal previews and AI choices do not mutate state or consume seeded randomness', () => {
  for (const phase of ['attackMove', 'defendMove', 'kick']) {
    const state = fixture({ phase, positions: { 'white-P1': [8, 8], 'black-P1': [8, 5] } });
    const before = clone(state);
    for (const piece of state.pieces) {
      legalMoves(state, piece.id);
      legalMoves(state, piece.id, { freePawn: true });
    }
    legalKicks(state);
    assert.deepEqual(chooseAIAction(state), chooseAIAction(state));
    assert.deepEqual(state, before);
  }
  const reaction = declaredShot();
  const before = clone(reaction);
  chooseAIAction(reaction);
  assert.deepEqual(reaction, before);
});

test('identical seeds yield identical random match histories', () => {
  let a = createGame({ seed: 912 });
  let b = createGame({ seed: 912 });
  for (let index = 0; index < 90; index++) {
    const actionA = chooseAIAction(a);
    const actionB = chooseAIAction(b);
    assert.deepEqual(actionA, actionB);
    a = applyAction(a, actionA);
    b = applyAction(b, actionB);
    assert.deepEqual(a, b);
  }
});

test('AI returns legal actions in keeper reaction and forced release phases', () => {
  const reaction = declaredShot({ x: 4, keeper: [6, 0] });
  const resolved = applyAction(reaction, chooseAIAction(reaction));
  assert.notEqual(resolved.phase, 'keeperReact');
  assertIntegrity(resolved);
  const backpass = fixture({ phase: 'kick', positions: { 'white-R1': [4, 10] } });
  const release = applyKick(backpass, 4, 14);
  const action = chooseAIAction(release);
  assert.equal(action.type, 'kick');
  assertIntegrity(applyAction(release, action));
});

test('AI remains legal across extended play, every new phase and both positioning budgets', () => {
  const phases = new Set();
  let bonusMoves = 0;
  for (const [mode, seed] of [['solo', 123], ['local', 456], ['solo', 789]]) {
    let state = createGame({ mode, seed });
    for (let index = 0; index < 220 && state.phase !== 'finished'; index++) {
      phases.add(state.phase);
      const action = chooseAIAction(state);
      if (action.freePawn) bonusMoves++;
      const before = clone(state);
      const next = applyAction(state, action);
      assert.deepEqual(state, before, 'AI execution preserves previous state for undo');
      if (action.type === 'move') {
        const from = state.pieces.find(p => p.id === action.pieceId);
        assert.ok(Math.max(Math.abs(action.x - from.x), Math.abs(action.y - from.y)) <= 10);
      }
      state = next;
      assertIntegrity(state);
    }
  }
  for (const phase of ['kickoff', 'attackMove', 'defendMove', 'kick']) assert.ok(phases.has(phase), `AI visits ${phase}`);
  assert.ok(bonusMoves > 0, 'AI uses its free pawn option');
});


test('a declared shot consumes randomness only after its goalkeeper reaction resolves', () => {
  const state = fixture({ phase: 'kick', positions: { 'white-R1': [4, 4], 'black-K': [5, 0] }, seed: 983 });
  const reaction = applyKick(state, 4, -1);
  assert.equal(reaction.randomState, state.randomState);
  const result = skipMove(reaction);
  assert.notEqual(result.randomState, reaction.randomState);
  assert.equal(result.pendingShot, null);
  assert.deepEqual(skipMove(reaction), result, 'saved reaction state reproduces the outcome');
});

test('different seeds produce both goals and saves for a probabilistic shot', () => {
  const outcomes = new Set();
  for (const seed of [0, 1000, 2000, 3000]) {
    const state = fixture({ phase: 'kick', positions: { 'white-R1': [4, 4], 'black-K': [5, 0] }, seed });
    const result = skipMove(applyKick(state, 4, -1));
    outcomes.add(result.score.white);
    assertIntegrity(result);
  }
  assert.deepEqual([...outcomes].sort(), [0, 1]);
});

test('an own goal credits the other side and gives the conceding side kickoff', () => {
  const state = fixture({ phase: 'kick', positions: { 'white-R1': [7, 10] } });
  const reaction = applyKick(state, 7, 15);
  assert.equal(currentTeam(reaction), 'white');
  const result = skipMove(reaction, { roll: .99 });
  assert.deepEqual(result.score, { white: 0, black: 1 });
  assert.equal(result.phase, 'kickoff');
  assert.equal(result.attack, 'white');
  assert.equal(result.lastAction.ownGoal, true);
  assertIntegrity(result);
});
