import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BOARD_WIDTH, BOARD_HEIGHT, DRIBBLE_RANGE, createGame, canOccupySquare, movementCost,
  legalMoves, legalKicks, applyMove, positionActions,
} from '../dist/engine.js';

const straight = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const diagonal = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
const inside = ([x, y]) => x >= 0 && x < BOARD_WIDTH && y >= 0 && y < BOARD_HEIGHT;
const clone = value => JSON.parse(JSON.stringify(value));
const key = ([x, y]) => `${x},${y}`;

// Preserve both full squads while keeping the tested ray/short move area empty.
function fixture(team, suffix, origin, { vector, carrying = true, phase = 'attackMove' } = {}) {
  const state = createGame({ mode: 'local', kickoff: team, seed: 812 });
  const id = `${team}-${suffix}`;
  const reserved = new Set([key(origin)]);
  if (vector) {
    for (let step = 1; ; step++) {
      const target = [origin[0] + vector[0] * step, origin[1] + vector[1] * step];
      if (!inside(target)) break;
      reserved.add(key(target));
    }
  } else {
    for (let dx = -2; dx <= 2; dx++) for (let dy = -2; dy <= 2; dy++) {
      reserved.add(key([origin[0] + dx, origin[1] + dy]));
    }
  }
  const spaces = Array.from({ length: BOARD_HEIGHT }, (_, y) =>
    Array.from({ length: BOARD_WIDTH }, (_, x) => [x, y])).flat();
  for (const piece of state.pieces) {
    const spot = piece.id === id ? origin : spaces.find(([x, y]) =>
      !reserved.has(key([x, y])) && canOccupySquare(piece,x,y));
    assert.ok(spot, `parking exists for ${piece.id}`);
    [piece.x, piece.y] = spot;
    reserved.add(key(spot));
  }
  const owner = state.pieces.find(piece => piece.id === (carrying ? id : `${team}-P3`));
  state.phase = phase;
  state.ball = { x: owner.x, y: owner.y, carrierId: owner.id };
  return state;
}

const rayCases = [
  ['Q', [...straight, ...diagonal]],
  ['R1', straight],
  ['B1', diagonal],
];
const originFor = ([dx, dy]) => [dx > 0 ? 1 : dx < 0 ? BOARD_WIDTH - 2 : 2,
  dy > 0 ? 2 : dy < 0 ? BOARD_HEIGHT - 3 : Math.floor(BOARD_HEIGHT / 2)];
const targetAt = (origin, vector, step) => [origin[0] + vector[0] * step, origin[1] + vector[1] * step];
const offered = (state, id, target) => legalMoves(state, id).some(move => move.x === target[0] && move.y === target[1]);

test('both sides can dribble eight open-field ray squares, but nine and ten are rejected in every piece direction', () => {
  assert.equal(DRIBBLE_RANGE, 8);
  for (const team of ['white', 'black']) for (const [suffix, vectors] of rayCases) for (const vector of vectors) {
    const origin = originFor(vector), id = `${team}-${suffix}`;
    const state = fixture(team, suffix, origin, { vector });
    const before = clone(state), eight = targetAt(origin, vector, 8);
    assert.equal(movementCost(state.pieces.find(p=>p.id===id),...eight),8,'this fixture isolates the ordinary outside-box limit');
    assert.ok(offered(state, id, eight), `${id} may dribble eight along ${vector}`);
    for (const step of [9, 10]) {
      const target = targetAt(origin, vector, step);
      assert.equal(offered(state, id, target), false, `${id} cannot dribble ${step} along ${vector}`);
      assert.throws(() => applyMove(state, id, ...target));
    }
    assert.deepEqual(state, before, 'previewing/rejecting long carries leaves the match untouched');
    const moved = applyMove(state, id, ...eight);
    assert.deepEqual(moved.ball, { x: eight[0], y: eight[1], carrierId: id });
    assert.deepEqual(moved.positionBudget, { normalUsed: false, pawnUsed: false, dribbleUsed: true });
    assert.deepEqual(legalMoves(moved, id), [], 'the shorter range still permits only one carry');
    assert.equal(positionActions(moved).normalAvailable, true, 'the separate off-ball move remains');
  }
});

test('the same queens, rooks and bishops still move nine and ten open-field squares without the ball', () => {
  for (const team of ['white', 'black']) for (const [suffix, vectors] of rayCases) for (const vector of vectors) {
    const origin = originFor(vector), id = `${team}-${suffix}`;
    const state = fixture(team, suffix, origin, { vector, carrying: false });
    for (const step of [9, 10]) {
      const target = targetAt(origin, vector, step);
      assert.equal(movementCost(state.pieces.find(p=>p.id===id),...target),step);
      assert.ok(offered(state, id, target), `${id} keeps its ${step}-square off-ball move along ${vector}`);
      const moved = applyMove(state, id, ...target);
      assert.deepEqual(moved.ball, state.ball, 'off-ball movement leaves possession in place');
      assert.deepEqual(moved.positionBudget, { normalUsed: true, pawnUsed: false, dribbleUsed: false });
    }
  }
});

test('the dribble cap leaves ten-square certain passes and longer inaccurate passes available', () => {
  for (const team of ['white', 'black']) for (const [suffix, baseOrigin, baseVector] of [
    ['Q', [2, BOARD_HEIGHT - 2], [0, -1]], ['R1', [2, BOARD_HEIGHT - 2], [0, -1]], ['B1', [0, BOARD_HEIGHT - 3], [1, -1]],
  ]) {
    const mirror = ([x, y]) => team === 'white' ? [x, y] : [BOARD_WIDTH - 1 - x, BOARD_HEIGHT - 1 - y];
    const origin = mirror(baseOrigin), vector = team === 'white' ? baseVector : baseVector.map(value => -value);
    const state = fixture(team, suffix, origin, { vector, phase: 'kick' });
    const kicks = legalKicks(state);
    for (const [step, accuracy] of [[10, 1], [11, .9]]) {
      const target = targetAt(origin, vector, step);
      const pass = kicks.find(kick => kick.x === target[0] && kick.y === target[1]);
      assert.ok(pass, `${team} ${suffix} can pass ${step} squares`);
      assert.equal(pass.accuracy, accuracy);
    }
  }
});

test('kings, pawns and knights retain their short dribble patterns for either side', () => {
  const knight = [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]];
  for (const team of ['white', 'black']) for (const [suffix, vectors] of [
    ['K', [...straight, ...diagonal]], ['P1', straight], ['N1', knight],
  ]) {
    const origin = [Math.floor(BOARD_WIDTH / 2) - 1, Math.floor(BOARD_HEIGHT / 2)], id = `${team}-${suffix}`;
    const state = fixture(team, suffix, origin);
    assert.deepEqual(new Set(legalMoves(state, id).map(move => key([move.x, move.y]))),
      new Set(vectors.map(vector => key(targetAt(origin, vector, 1)))));
    assert.deepEqual(legalMoves(state, id, { freePawn: true }), [], 'the free pawn action never carries the ball');
    const destination = targetAt(origin, vectors[0], 1);
    const moved = applyMove(state, id, ...destination);
    assert.deepEqual(moved.ball, { x: destination[0], y: destination[1], carrierId: id });
    assert.deepEqual(legalMoves(moved, id), [], 'no piece gets a second dribble');
  }
});
