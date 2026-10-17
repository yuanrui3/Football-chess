import test from 'node:test';
import assert from 'node:assert/strict';
import * as e from '../dist/engine.js';
import {rlBoardFeatures, rlBoardGeometry} from '../scripts/rl-features.mjs';

const other = team => team === 'white' ? 'black' : 'white';
function fixture(positions = {}, {carrier = 'white-Q', phase = 'attackMove', attack = 'white'} = {}) {
  const state = e.createGame({seed: 17});
  const assigned = {'white-K': [6, 16], 'black-K': [7, 0], ...positions};
  const used = new Set(Object.values(assigned).map(p => p.join(',')));
  const parking = Array.from({length: e.BOARD_HEIGHT}, (_, y) => [[0, y], [13, y]]).flat();
  for (const piece of state.pieces) {
    const target = assigned[piece.id] || parking.find(p => !used.has(p.join(',')));
    assert.ok(target); [piece.x, piece.y] = target; used.add(target.join(','));
  }
  const holder = state.pieces.find(p => p.id === carrier);
  state.ball = {x: holder.x, y: holder.y, carrierId: carrier};
  state.attack = attack; state.phase = phase; state.restart = null; state.offside = null;
  state.positionBudget = {normalUsed: false, pawnUsed: false, dribbleUsed: false};
  assert.equal(state.pieces.length, 22);
  assert.equal(new Set(state.pieces.map(p => `${p.x},${p.y}`)).size, 22);
  assert.ok(state.pieces.every(p => e.canOccupySquare(p, p.x, p.y)));
  return state;
}
function mirror(state) {
  const result = structuredClone(state), id = value => value?.replace(/^(white|black)/, other) ?? null;
  result.attack = other(state.attack);
  result.pieces = state.pieces.map(p => ({...p, id: id(p.id), team: other(p.team), x: 13 - p.x, y: 16 - p.y}));
  result.ball = {...state.ball, x: 13 - state.ball.x, y: 16 - state.ball.y, carrierId: id(state.ball.carrierId)};
  if (state.offside) result.offside = {...state.offside, team: other(state.offside.team), flaggedIds: state.offside.flaggedIds.map(id)};
  if (state.restart) result.restart = {...state.restart, team: other(state.restart.team), takerId: id(state.restart.takerId)};
  if (state.looseBallKickOrigin) result.looseBallKickOrigin = {...state.looseBallKickOrigin, pieceId: id(state.looseBallKickOrigin.pieceId), team: other(state.looseBallKickOrigin.team),
    ...(state.looseBallKickOrigin.from ? {from: {x: 13 - state.looseBallKickOrigin.from.x, y: 16 - state.looseBallKickOrigin.from.y}} : {})};
  return result;
}
function close(a, b, message = '') { assert.ok(Math.abs(a - b) < 1e-12, `${message}: ${a} vs ${b}`); }

test('feature vectors are finite, bounded, side antisymmetric and public-board only', () => {
  const state = fixture({'white-Q': [6, 8], 'white-R1': [4, 10], 'white-N1': [7, 6], 'black-Q': [9, 6], 'black-P1': [5, 7]});
  const before = structuredClone(state), white = rlBoardFeatures(state, 'white'), black = rlBoardFeatures(state, 'black');
  assert.deepEqual(Object.keys(white), ['centerControl', 'openFiles', 'defensiveCover', 'centralReceivers']);
  for (const name of Object.keys(white)) {
    assert.ok(Number.isFinite(white[name]) && Math.abs(white[name]) <= 1, name);
    close(white[name], -black[name], name);
  }
  assert.deepEqual(state, before);
  for (const randomState of [0, 0xffffffff, 111111]) assert.deepEqual(rlBoardFeatures({...state, randomState}, 'white'), white);
  // Strategic potential does not get farmed by spending or resetting budgets.
  assert.deepEqual(rlBoardFeatures({...state, positionBudget: {normalUsed: true, pawnUsed: true, dribbleUsed: true}, phase: 'defendMove'}, 'white'), white);
});

test('180 degree rotation and color swap preserve the mover-perspective vector', () => {
  const states = [e.createGame({seed: 2}), fixture({'white-Q': [2, 6], 'white-B1': [6, 10], 'white-R1': [2, 12], 'white-N1': [4, 5], 'black-P1': [5, 5]})];
  for (let i = 0; i < 18; i++) {
    const state = e.createGame({seed: i + 50});
    const slots = [];
    for (let y = 0; y < 17; y++) for (let x = 0; x < 14; x++) slots.push([x, y]);
    let seed = i + 1; const used = new Set();
    for (const piece of state.pieces) {
      let target;
      do { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; target = slots[seed % slots.length]; }
      while (used.has(target.join(',')) || !e.canOccupySquare(piece, ...target));
      [piece.x, piece.y] = target; used.add(target.join(','));
    }
    const carrier = state.pieces.find(p => p.id === 'white-Q');
    state.ball = {x: carrier.x, y: carrier.y, carrierId: carrier.id};
    states.push(state);
  }
  for (const state of states) {
    const direct = rlBoardFeatures(state, 'white'), rotated = rlBoardFeatures(mirror(state), 'black');
    for (const name of Object.keys(direct)) close(direct[name], rotated[name], name);
  }
});

test('allowed-square geometry matches every engine piece on every board square', () => {
  const state = fixture(), geometry = rlBoardGeometry(state);
  for (const piece of state.pieces) for (let y = 0; y < 17; y++) for (let x = 0; x < 14; x++) {
    assert.equal(geometry.allowed(piece, x, y), e.canOccupySquare(piece, x, y), `${piece.id} at ${x},${y}`);
  }
});

test('native movement matches engine blockers, king/pawn limits, dribbling and weighted box costs', () => {
  const base = fixture({'white-Q': [6, 8], 'white-R1': [4, 11], 'white-B1': [2, 9], 'white-N1': [8, 6], 'white-P1': [9, 11],
    'black-Q': [10, 7], 'black-R1': [7, 4], 'black-B1': [11, 9], 'black-N1': [5, 4], 'black-P1': [4, 6]});
  for (const state of [base, mirror(base)]) {
    const geometry = rlBoardGeometry(state);
    for (const piece of state.pieces.filter(p => p.team === state.attack)) {
      const allowed = new Set(e.legalMoves(state, piece.id).filter(m => m.type === 'move').map(m => `${m.x},${m.y}`));
      for (let y = 0; y < 17; y++) for (let x = 0; x < 14; x++) {
        assert.equal(geometry.canMove(piece, {x, y}), allowed.has(`${x},${y}`), `${piece.id} to ${x},${y}`);
      }
    }
  }
});

test('a rook controls five squares but can move ten; an occupied file stops both rays', () => {
  const state = fixture({'white-Q': [3, 8], 'white-R1': [4, 13]}), geometry = rlBoardGeometry(state);
  const rook = state.pieces.find(p => p.id === 'white-R1');
  assert.equal(geometry.controls(rook, {x: 4, y: 8}, {bonus: false}), 1);
  assert.equal(geometry.controls(rook, {x: 4, y: 7}, {bonus: false}), 0);
  assert.equal(geometry.canMove(rook, {x: 4, y: 3}), true);
  const blockState = fixture({'white-Q': [3, 8], 'white-R1': [4, 13], 'white-P1': [4, 11]}), blocked = rlBoardGeometry(blockState);
  const blockedRook = blockState.pieces.find(p => p.id === rook.id);
  assert.equal(blocked.controls(blockedRook, {x: 4, y: 8}), 0);
  assert.equal(blocked.canMove(blockedRook, {x: 4, y: 3}), false);
});

test('pawn control includes backward diagonals and a legal free reposition, never a free tackle', () => {
  const state = fixture({'white-Q': [7, 8], 'black-P1': [6, 10]}, {phase: 'defendMove'}), geometry = rlBoardGeometry(state);
  const pawn = state.pieces.find(p => p.id === 'black-P1');
  for (const [dx, dy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) assert.equal(geometry.controls(pawn, {x: pawn.x + dx, y: pawn.y + dy}, {bonus: false}), 1);
  assert.equal(geometry.controls(pawn, {x: 7, y: 8}, {bonus: false}), 0);
  assert.equal(geometry.controls(pawn, {x: 7, y: 8}), 0.65);
  const setup = e.legalMoves(state, pawn.id, {freePawn: true}).find(m => m.x === 6 && m.y === 9);
  assert.equal(setup?.type, 'move');
  const moved = e.applyMove(state, pawn.id, 6, 9, {freePawn: true});
  assert.ok(e.legalMoves(moved, pawn.id).some(m => m.type === 'tackle'));
  const blockedState = fixture({'white-Q': [7, 8], 'black-P1': [6, 10], 'black-P2': [6, 9]}, {phase: 'defendMove'});
  assert.equal(rlBoardGeometry(blockedState).controls(blockedState.pieces.find(p => p.id === pawn.id), {x: 7, y: 8}), 0);
});

test('a pawn carrying the ball cannot use its free off-ball reposition to extend control', () => {
  const state = fixture({'white-P1': [6, 10]}, {carrier: 'white-P1'}), geometry = rlBoardGeometry(state);
  assert.equal(geometry.controls(state.pieces.find(p => p.id === 'white-P1'), {x: 7, y: 8}), 0);
});

test('knights jump intervening blockers and only control their L targets', () => {
  const state = fixture({'white-Q': [3, 8], 'white-N1': [6, 9], 'white-P1': [6, 8], 'black-P1': [7, 8]}), geometry = rlBoardGeometry(state);
  const knight = state.pieces.find(p => p.id === 'white-N1');
  assert.equal(geometry.canMove(knight, {x: 7, y: 7}), true);
  assert.equal(geometry.controls(knight, {x: 7, y: 7}), 1);
  assert.equal(geometry.controls(knight, {x: 6, y: 7}), 0);
  assert.equal(geometry.canPass(knight, {x: 7, y: 7}), true);
  assert.equal(geometry.canPass(knight, {x: 8, y: 5}), false);
});

test('normal and one-bypass set-piece pass geometry matches the public kick list', () => {
  const positions = {'white-Q': [6, 8], 'white-R1': [6, 6], 'white-B1': [8, 6], 'white-N1': [7, 6], 'white-P1': [4, 8], 'black-P1': [6, 3]};
  for (const carrier of ['white-Q', 'white-R1', 'white-B1', 'white-N1', 'white-P1', 'white-K']) for (const restart of [null, {type: 'corner'}, {type: 'throwIn'}]) {
    const state = fixture(positions, {carrier, phase: 'kick'}); state.restart = restart;
    const geometry = rlBoardGeometry(state), from = geometry.carrier;
    const kicks = new Set(e.legalKicks(state).filter(k => k.y >= 0 && k.y < 17).map(k => `${k.x},${k.y}`));
    for (let y = 0; y < 17; y++) for (let x = 0; x < 14; x++) assert.equal(geometry.canPass(from, {x, y}), kicks.has(`${x},${y}`), `${carrier} ${restart?.type} ${x},${y}`);
  }
});

test('receiving opportunities require a central onside target and the passer native geometry', () => {
  const base = fixture({'white-Q': [2, 8], 'white-R1': [6, 8], 'black-Q': [11, 3], 'black-R1': [10, 4]});
  assert.ok(rlBoardFeatures(base, 'white').centralReceivers > 0);
  const diagonal = fixture({'white-Q': [2, 8], 'white-R1': [6, 7], 'black-Q': [11, 3], 'black-R1': [10, 4]});
  assert.equal(rlBoardFeatures(diagonal, 'white').centralReceivers, 0);
  const offside = fixture({'white-Q': [2, 7], 'white-R1': [6, 3], 'black-Q': [11, 6], 'black-R1': [10, 5]});
  assert.equal(rlBoardGeometry(offside).onside(offside.pieces.find(p => p.id === 'white-R1')), false);
  assert.equal(rlBoardFeatures(offside, 'white').centralReceivers, 0);
  // A receiver behind the ball is onside even when beyond the defensive line.
  const behind = fixture({'white-Q': [2, 3], 'white-R1': [6, 3], 'black-Q': [11, 6], 'black-R1': [10, 5]});
  assert.equal(rlBoardGeometry(behind).onside(behind.pieces.find(p => p.id === 'white-R1')), true);
  assert.ok(rlBoardFeatures(behind, 'white').centralReceivers > 0);
});

test('a usable rook file is worth less when blocked; empty unrelated columns earn nothing', () => {
  const open = fixture({'white-Q': [3, 8], 'white-R1': [4, 13], 'white-P1': [3, 12]});
  const blocked = fixture({'white-Q': [3, 8], 'white-R1': [4, 13], 'white-P1': [4, 12]});
  assert.ok(rlBoardFeatures(open, 'white').openFiles > rlBoardFeatures(blocked, 'white').openFiles);
  const noMajor = structuredClone(open); noMajor.pieces = noMajor.pieces.filter(p => !['Q', 'R'].includes(p.type)); noMajor.ball.carrierId = null;
  assert.equal(rlBoardFeatures(noMajor, 'white').openFiles, 0);
});

test('a goalward screen improves defensive cover over a piece chasing ahead of the ball', () => {
  const covered = fixture({'white-Q': [6, 8], 'white-P1': [6, 10]});
  const exposed = fixture({'white-Q': [6, 8], 'white-P1': [6, 6]});
  assert.ok(rlBoardFeatures(covered, 'white').defensiveCover > rlBoardFeatures(exposed, 'white').defensiveCover);
});

test('king opponent-box and goal-mouth restrictions also constrain free setup control', () => {
  const state = fixture({'white-Q': [3, 8], 'white-K': [4, 3]}), geometry = rlBoardGeometry(state);
  const keeper = state.pieces.find(p => p.id === 'white-K');
  assert.equal(geometry.canMove(keeper, {x: 4, y: 2}), false);
  assert.equal(geometry.allowed(keeper, 6, 0), false);
  assert.equal(geometry.allowed(keeper, 6, 16), true);
  assert.equal(geometry.canMove(state.pieces.find(p => p.id === 'white-Q'), {x: 6, y: 0}), false);
});

test('pass-and-run and own loose-pass collection cannot manufacture an illegal box entry', () => {
  const state = fixture({'white-Q': [4, 3]}, {carrier: 'white-Q'}), geometry = rlBoardGeometry(state);
  const queen = state.pieces.find(p => p.id === 'white-Q');
  assert.equal(geometry.canMove(queen, {x: 4, y: 2}, {carrying: false, passRun: true}), false);
  assert.equal(geometry.canMove(queen, {x: 4, y: 2}), true);
  state.ball = {x: 4, y: 2, carrierId: null};
  state.looseBallKickOrigin = {team: 'white', pieceId: queen.id, from: {x: 4, y: 3}};
  assert.equal(rlBoardGeometry(state).canMove(queen, {x: 4, y: 2}), false);
});
