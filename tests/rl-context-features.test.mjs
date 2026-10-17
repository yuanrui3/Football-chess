import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../dist/engine.js';
import {RL_CONTEXT_FEATURE_NAMES, rlContextValueFeatures} from '../scripts/rl-context-features.mjs';

const opposite = side => side === 'white' ? 'black' : 'white';
const index = name => RL_CONTEXT_FEATURE_NAMES.indexOf(name);
const feature = (state, name) => rlContextValueFeatures(state)[index(name)];
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-12, `${actual} != ${expected}`);
function fixture({phase = 'attackMove'} = {}) {
  const state = E.createGame({seed: 42});
  state.pieces = [
    {id: 'white-K', team: 'white', type: 'K', x: 6, y: 16},
    {id: 'black-K', team: 'black', type: 'K', x: 7, y: 0},
    {id: 'white-Q', team: 'white', type: 'Q', x: 6, y: 6},
    {id: 'black-P1', team: 'black', type: 'P', x: 5, y: 8},
    {id: 'black-Q', team: 'black', type: 'Q', x: 11, y: 3},
    {id: 'white-R1', team: 'white', type: 'R', x: 6, y: 4}
  ];
  state.ball = {x: 6, y: 6, carrierId: 'white-Q'};
  state.attack = 'white'; state.phase = phase; state.restart = null;
  state.positionBudget = {normalUsed: false, pawnUsed: false, dribbleUsed: false};
  state.ballProgress = {team: 'white', anchorY: 6, rounds: 0, excludeRelease: false};
  return state;
}
function mirror(state) {
  const result = structuredClone(state), id = value => value?.replace(/^(white|black)/, opposite) ?? null;
  result.attack = opposite(state.attack);
  result.pieces = state.pieces.map(piece => ({...piece, id: id(piece.id), team: opposite(piece.team), x: 13 - piece.x, y: 16 - piece.y}));
  result.ball = {...state.ball, x: 13 - state.ball.x, y: 16 - state.ball.y, carrierId: id(state.ball.carrierId)};
  if (state.ballProgress) result.ballProgress = {...state.ballProgress, team: opposite(state.ballProgress.team), anchorY: 16 - state.ballProgress.anchorY};
  if (state.paceControl) result.paceControl = {...state.paceControl, team: opposite(state.paceControl.team), carrierId: id(state.paceControl.carrierId)};
  if (state.offside) result.offside = {...state.offside, team: opposite(state.offside.team), flaggedIds: state.offside.flaggedIds.map(id)};
  if (state.restart) result.restart = {...state.restart, team: opposite(state.restart.team)};
  if (state.pendingShot) result.pendingShot = {...state.pendingShot, defendingTeam: opposite(state.pendingShot.defendingTeam)};
  return result;
}

test('28 normalized public features are pure and preserve the seven-feature prefix', () => {
  const state = fixture(), before = structuredClone(state), vector = rlContextValueFeatures(state);
  assert.equal(vector.length, 28); assert.equal(new Set(RL_CONTEXT_FEATURE_NAMES).size, 28);
  assert.ok(vector.every(value => Number.isFinite(value) && Math.abs(value) <= 1));
  assert.deepEqual(vector.slice(0, 7), E.rlValueFeatures(state).slice(0, 7));
  assert.deepEqual(rlContextValueFeatures({...state, randomState: 0xffffffff, score: {white: 55, black: 91}}), vector);
  assert.deepEqual(state, before);
});

test('requested perspective, rotation and color swap preserve antisymmetry', () => {
  const state = fixture();
  state.paceControl = {team: 'white', carrierId: 'white-Q', dribbleRounds: 2, dribbledThisRound: true};
  for (const phase of ['attackMove', 'defendMove', 'kick', 'keeperRelease', 'passRun', 'keeperReact', 'finished']) {
    state.phase = phase; state.pendingShot = phase === 'keeperReact' ? {defendingTeam: 'black'} : null;
    const white = rlContextValueFeatures(state), black = rlContextValueFeatures(state, 'black');
    const rotated = rlContextValueFeatures(mirror(state), 'black');
    white.forEach((value, position) => {close(value, -black[position]); close(value, rotated[position]);});
  }
});

test('reusing a White base vector avoids changing perspective twice', () => {
  const state = fixture(), original = rlContextValueFeatures(state);
  assert.deepEqual(rlContextValueFeatures(state, 'white', original.slice(0, 7)), original);
  rlContextValueFeatures(state, 'black', original.slice(0, 7)).forEach((value, position) => close(value, -original[position]));
  assert.throws(() => rlContextValueFeatures(state, 'white', [1, 2]), /seven finite normalized/);
  assert.throws(() => rlContextValueFeatures(state, 'white', Array(7).fill(NaN)), /seven finite normalized/);
});

test('actual phase and spent budgets distinguish action opportunities', () => {
  const state = fixture();
  assert.equal(feature(state, 'actor'), 1);
  assert.equal(feature(state, 'ordinaryMoveTempo'), 1);
  assert.equal(feature(state, 'bonusMoveTempo'), 1);
  assert.equal(feature(state, 'dribbleTempo'), 1);
  state.phase = 'defendMove';
  assert.equal(feature(state, 'actor'), -1);
  assert.equal(feature(state, 'ordinaryMoveTempo'), -1);
  assert.equal(feature(state, 'dribbleTempo'), 0);
  state.positionBudget = {normalUsed: true, pawnUsed: true, dribbleUsed: true};
  assert.equal(feature(state, 'ordinaryMoveTempo'), 0);
  assert.equal(feature(state, 'bonusMoveTempo'), 0);
  state.phase = 'kick';
  assert.equal(feature(state, 'kickNowPossession'), 1);
});

test('a free pawn setup is exposed until its bonus or ordinary move has been spent', () => {
  const state = fixture({phase: 'defendMove'});
  assert.equal(feature(state, 'directTackleExposure'), 0);
  assert.equal(feature(state, 'bonusTackleExposure'), 1);
  state.positionBudget.pawnUsed = true;
  assert.equal(feature(state, 'bonusTackleExposure'), 0);
  state.positionBudget.pawnUsed = false; state.positionBudget.normalUsed = true;
  assert.equal(feature(state, 'bonusTackleExposure'), 0);
  state.positionBudget.normalUsed = false; state.foulsEnabled = true;
  close(feature(state, 'bonusTackleExposure'), 0.9);
  state.pieces.find(piece => piece.id === 'white-Q').type = 'N';
  close(feature(state, 'bonusTackleExposure'), 0.45);
});

test('direct pawn exposure is separate from a setup and vanishes in the kick phase', () => {
  const state = fixture({phase: 'defendMove'}), pawn = state.pieces.find(piece => piece.id === 'black-P1');
  pawn.y = 7;
  assert.equal(feature(state, 'directTackleExposure'), 1);
  assert.equal(feature(state, 'bonusTackleExposure'), 0);
  state.phase = 'kick';
  assert.equal(feature(state, 'directTackleExposure'), 0);
});

test('offside receivers do not create safe forward passes', () => {
  const state = fixture(), receiver = state.pieces.find(piece => piece.id === 'white-R1');
  assert.ok(feature(state, 'safeForwardOptions') > 0);
  receiver.y = 1;
  assert.equal(feature(state, 'safeForwardOptions'), 0);
  state.restart = {type: 'corner', team: 'white'};
  assert.ok(feature(state, 'safeForwardOptions') > 0);
});

test('central close carrier geometry beats a tight post-side view', () => {
  const state = fixture(), carrier = state.pieces.find(piece => piece.id === 'white-Q');
  carrier.y = 2; state.ball.y = 2;
  const central = feature(state, 'carrierGoalOpening');
  carrier.x = 12; state.ball.x = 12;
  assert.ok(feature(state, 'carrierGoalOpening') < central);
  assert.equal(feature(state, 'carrierInGoalBox'), 0);
  carrier.x = 6; state.ball.x = 6;
  assert.equal(feature(state, 'carrierInGoalBox'), 1);
});

test('dribble and own-half stall pressure reflect the possessing player only', () => {
  const state = fixture(), carrier = state.pieces.find(piece => piece.id === 'white-Q');
  state.paceControl = {team: 'white', carrierId: carrier.id, dribbleRounds: 3, dribbledThisRound: true};
  assert.equal(feature(state, 'dribbleLimitPressure'), 1);
  state.paceControl.carrierId = 'white-R1';
  assert.equal(feature(state, 'dribbleLimitPressure'), 0);
  carrier.y = 10; state.ball.y = 10;
  state.ballProgress = {team: 'white', anchorY: 11, rounds: 2, excludeRelease: false};
  close(feature(state, 'ownHalfStallPressure'), 0.5);
  state.restart = {type: 'freeKick', team: 'white'};
  assert.equal(feature(state, 'ownHalfStallPressure'), 0);
});

test('a loose ball has no invented carrier geometry or exposure', () => {
  const state = fixture(); state.ball.carrierId = null;
  for (const name of ['carrierDepthSquared', 'carrierCentrality', 'carrierGoalOpening', 'directTackleExposure', 'bonusTackleExposure', 'safePassOptions']) {
    assert.equal(feature(state, name), 0, name);
  }
});

test('keeper bonus setups correspond to legal reposition-then-tackle actions', () => {
  const state = fixture({phase: 'defendMove'});
  const king = state.pieces.find(piece => piece.id === 'black-K');
  Object.assign(king, {x: 5, y: 8});
  Object.assign(state.pieces.find(piece => piece.id === 'black-P1'), {x: 0, y: 8});
  assert.equal(feature(state, 'bonusTackleExposure'), 1);
  assert.ok(E.legalMoves(state, king.id, {freePawn: true}).some(move => move.x === 5 && move.y === 7));
  const repositioned = E.applyMove(state, king.id, 5, 7, {freePawn: true});
  assert.ok(E.legalMoves(repositioned, king.id).some(move => move.type === 'tackle'));
  assert.equal(feature(repositioned, 'directTackleExposure'), 1);
  assert.equal(feature(repositioned, 'bonusTackleExposure'), 0);
});

test('a king cannot use its bonus setup to enter the opponent box', () => {
  const state = fixture({phase: 'defendMove'});
  const carrier = state.pieces.find(piece => piece.id === 'white-Q');
  Object.assign(carrier, {x: 6, y: 15}); state.ball = {x: 6, y: 15, carrierId: carrier.id};
  Object.assign(state.pieces.find(piece => piece.id === 'black-K'), {x: 5, y: 13});
  Object.assign(state.pieces.find(piece => piece.id === 'black-P1'), {x: 0, y: 8});
  assert.equal(feature(state, 'bonusTackleExposure'), 0);
  assert.ok(!E.legalMoves(state, 'black-K', {freePawn: true}).some(move => move.y >= 14 && move.x >= 4 && move.x <= 9));
});

test('real back-pass, pass-and-run and shot declarations encode their acting side correctly', () => {
  const state = fixture({phase: 'kick'});
  const release = E.applyKick(state, 6, 16, {roll: 0});
  assert.equal(release.phase, 'keeperRelease');
  assert.equal(E.currentTeam(release), 'white');
  assert.equal(feature(release, 'actor'), 1);
  assert.equal(feature(release, 'kickNowPossession'), 1);
  assert.equal(feature(release, 'directTackleExposure'), 0);
  assert.equal(feature(release, 'bonusMoveTempo'), 0);
  const run = E.applyKick(state, 6, 4, {roll: 0, passRun: true});
  assert.equal(run.phase, 'passRun');
  assert.equal(feature(run, 'actor'), E.currentTeam(run) === 'white' ? 1 : -1);
  assert.equal(feature(run, 'ordinaryMoveTempo'), 0);
  assert.ok(E.positionActions(run).normalAvailable);
  const ready = structuredClone(state);
  ready.pieces.find(piece => piece.id === 'white-R1').x = 7;
  const shot = E.applyKick(ready, 6, -1);
  assert.equal(shot.phase, 'keeperReact');
  assert.equal(E.currentTeam(shot), 'black');
  assert.equal(feature(shot, 'actor'), -1);
  assert.equal(feature(shot, 'kickNowPossession'), 0);
  assert.equal(feature(shot, 'directTackleExposure'), 0);
  assert.equal(feature(shot, 'bonusTackleExposure'), 0);
  assert.equal(feature({...shot, phase: 'finished'}, 'actor'), 0);
});
