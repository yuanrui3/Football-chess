import test from 'node:test';
import assert from 'node:assert/strict';
import * as e from '../dist/engine.js';

const clone = structuredClone;
const other = team => team === 'white' ? 'black' : 'white';

function fixture({phase = 'attackMove', carrier = 'white-Q', positions = {}, budget} = {}) {
  const state = e.createGame({seed: 17});
  const assigned = {'white-K': [6, 16], 'black-K': [8, 0], 'white-Q': [6, 3], ...positions};
  const used = new Set(Object.values(assigned).map(point => point.join(',')));
  assert.equal(used.size, Object.keys(assigned).length);
  const parking = Array.from({length: e.BOARD_HEIGHT}, (_, y) => [[0, y], [e.BOARD_WIDTH - 1, y]]).flat();
  for (const piece of state.pieces) {
    const point = assigned[piece.id] || parking.find(point => !used.has(point.join(',')));
    assert.ok(point);
    [piece.x, piece.y] = point;
    used.add(point.join(','));
  }
  const owner = state.pieces.find(piece => piece.id === carrier);
  state.phase = phase;
  state.attack = owner.team;
  state.ball = {x: owner.x, y: owner.y, carrierId: owner.id};
  state.positionBudget = budget || {normalUsed: false, pawnUsed: false, dribbleUsed: false};
  state.ballProgress = {team: owner.team, anchorY: owner.y, rounds: 0, pendingRelease: false, excludeRelease: false};
  state.restart = null;
  state.offside = null;
  state.pendingShot = null;
  state.releaseReason = null;
  state.looseBallKickOrigin = null;
  assert.equal(state.pieces.length, 22);
  assert.equal(new Set(state.pieces.map(piece => `${piece.x},${piece.y}`)).size, 22);
  assert.ok(state.pieces.every(piece => e.canOccupySquare(piece, piece.x, piece.y)));
  return state;
}

function mirrored(state) {
  const swapped = clone(state), id = value => value?.replace(/^(white|black)/, other) ?? null;
  const point = value => value && ({x: e.BOARD_WIDTH - 1 - value.x, y: e.BOARD_HEIGHT - 1 - value.y});
  swapped.attack = other(state.attack);
  swapped.score = {white: state.score.black, black: state.score.white};
  swapped.pieces = state.pieces.map(piece => ({...piece, ...point(piece), id: id(piece.id), team: other(piece.team)}));
  swapped.ball = {...point(state.ball), carrierId: id(state.ball.carrierId)};
  swapped.ballProgress = {...state.ballProgress, team: other(state.ballProgress.team), anchorY: e.BOARD_HEIGHT - 1 - state.ballProgress.anchorY};
  if (state.restart) swapped.restart = {...state.restart, team: other(state.restart.team), takerId: id(state.restart.takerId), spot: point(state.restart.spot)};
  if (state.offside) swapped.offside = {...state.offside, team: other(state.offside.team), kickerId: id(state.offside.kickerId), flaggedIds: state.offside.flaggedIds.map(id), ball: point(state.offside.ball), secondLastY: e.BOARD_HEIGHT - 1 - state.offside.secondLastY};
  return swapped;
}

function legalChoice(state, action) {
  if (action.type === 'kick') {
    const kick = e.legalKicks(state).find(kick => kick.x === action.x && kick.y === action.y);
    assert.ok(kick, 'Casual uses an available kick');
    return kick;
  }
  if (action.type === 'move') {
    const move = e.legalMoves(state, action.pieceId, {freePawn: !!action.freePawn}).find(move => move.x === action.x && move.y === action.y);
    assert.ok(move, 'Casual respects movement and allowance rules');
    return move;
  }
  assert.equal(action.type, 'skip');
  assert.ok(['attackMove', 'defendMove', 'keeperReact'].includes(state.phase) || !state.ball.carrierId);
  return null;
}

function choose(state) {
  const before = clone(state), action = e.chooseAIAction(state, {difficulty: 'casual'});
  assert.deepEqual(state, before, 'planning preserves the complete live snapshot');
  legalChoice(state, action);
  return action;
}

function apply(state, action) {
  legalChoice(state, action);
  if (action.type === 'kick') return e.applyKick(state, action.x, action.y, {roll: 0});
  if (action.type === 'move') return e.applyMove(state, action.pieceId, action.x, action.y, {freePawn: !!action.freePawn, roll: 0});
  return e.skipMove(state, {roll: 0});
}

function reactedChance(state, kick) {
  const pending = e.applyKick({...state, phase: 'kick'}, kick.x, kick.y, {roll: 0});
  if (pending.phase !== 'keeperReact') return 0;
  const keeper = pending.pieces.find(piece => piece.type === 'K' && piece.team === e.currentTeam(pending));
  return Math.min(e.shotChance(pending), ...e.legalMoves(pending, keeper.id).map(move => e.shotChance(pending, kick.x, kick.y, move)));
}

function bestFinish(state) {
  const kicking = {...state, phase: 'kick'};
  return Math.max(0, ...e.legalKicks(kicking).filter(kick => kick.goal === state.attack && !kick.offside).map(kick => reactedChance(kicking, kick)));
}

function finishAttackPositioning(state) {
  const actions = [];
  for (let count = 0; count < 5 && state.phase === 'attackMove'; count++) {
    const action = choose(state);
    actions.push(action);
    state = apply(state, action);
  }
  assert.equal(state.phase, 'defendMove', 'the attack finishes its positioning without cycling');
  return {state, actions};
}

test('Casual preserves a strong finish through positioning instead of repeating its former backward dribble, either color', () => {
  const original = fixture();
  const before = bestFinish(original);
  assert.ok(before > 0.65, 'a clear close chance survives the best legal keeper reaction');
  // Retreating one row abandons a substantially better existing finish.
  const abandoned = e.applyMove(original, 'white-Q', 6, 4);
  assert.ok(bestFinish(abandoned) < before - 0.10, 'retreating loses at least ten percentage points under the current finishing model');
  for (const start of [original, mirrored(original)]) {
    const initial = bestFinish(start);
    const {state, actions} = finishAttackPositioning(start);
    assert.ok(bestFinish(state) >= initial - 1e-10, 'support or pawn moves must preserve an already good finish');
    assert.ok(actions.some(action => action.type === 'move' && action.pieceId !== start.ball.carrierId), 'teammates may still reposition before the shot');
    const kicking = e.skipMove(state);
    assert.equal(kicking.phase, 'kick');
    const action = choose(kicking), kick = legalChoice(kicking, action);
    assert.equal(kick.goal, kicking.attack, 'take the finish after the defence declines to reposition');
    assert.ok(reactedChance(kicking, kick) >= initial - 1e-10);
  }
});

test('Casual takes a strong open finish at the kick rather than substituting a pass, either color', () => {
  const original = fixture({phase: 'kick', carrier: 'white-R1', positions: {'white-Q': [4, 10], 'white-R1': [6, 2], 'black-K': [9, 0]}});
  for (const state of [original, mirrored(original)]) {
    const best = bestFinish(state);
    assert.ok(best > 0.6);
    const action = choose(state), kick = legalChoice(state, action);
    assert.equal(kick.goal, state.attack);
    assert.ok(reactedChance(state, kick) >= best - 1e-10, 'choose the best finish after accounting for the keeper reaction');
  }
});

test('protecting an existing shot does not freeze a carrier facing a guaranteed defensive challenge, either color', () => {
  const original = fixture({positions: {'black-R1': [6, 7]}, budget: {normalUsed: true, pawnUsed: true, dribbleUsed: false}});
  for (const state of [original, mirrored(original)]) {
    const danger = {...state, phase: 'defendMove', positionBudget: {normalUsed: false, pawnUsed: true, dribbleUsed: false}};
    const tackles = value => value.pieces.filter(piece => piece.team === e.currentTeam(value)).flatMap(piece => e.legalMoves(value, piece.id).filter(move => move.type === 'tackle' && move.tackleProbability === 1));
    assert.ok(tackles(danger).length > 0);
    const action = choose(state);
    assert.equal(action.type, 'move');
    assert.equal(action.pieceId, state.ball.carrierId, 'use the available carry to escape rather than hold the attractive shooting square');
    const next = apply(state, action);
    assert.equal(next.phase, 'defendMove');
    assert.equal(next.attack, state.attack);
    assert.equal(tackles(next).length, 0, 'the dribble removes the immediate certain loss of possession');
  }
});

test('Casual attempts a useful moderate rook shot from midfield when its passes have no safe receiving outlet, either color', () => {
  const original = fixture({phase: 'kick', carrier: 'white-R1', positions: {'white-Q': [4, 10], 'white-R1': [7, 8], 'black-K': [4, 2]}});
  for (const state of [original, mirrored(original)]) {
    const best = bestFinish(state);
    assert.ok(best > 0.25 && best < 0.45, 'this is a worthwhile attempt below the strong-finish priority threshold');
    assert.equal(e.legalKicks(state).filter(kick => kick.receiverId && state.pieces.find(piece => piece.id === kick.receiverId)?.team === state.attack).length, 0, 'there is no direct teammate receiving option on a rook passing ray');
    const action = choose(state), kick = legalChoice(state, action);
    assert.equal(kick.goal, state.attack, 'do not let a purely positional passing reward outweigh a useful unpressured shot');
  }
});

test('the finishing preference retains goal-kick, throw and indirect-free-kick restrictions, either color', () => {
  for (const type of ['goalKick', 'throwIn', 'offside', 'stalling', 'timeout']) {
    const taker = type === 'goalKick' ? 'white-K' : type === 'throwIn' ? 'white-R1' : 'white-Q';
    const original = fixture({phase: 'kick', carrier: taker, positions: type === 'throwIn' ? {'white-R1': [0, 4]} : {}});
    original.restart = {type, team: 'white', takerId: taker, spot: {x: original.ball.x, y: original.ball.y}, indirect: ['offside', 'stalling', 'timeout'].includes(type)};
    for (const state of [original, mirrored(original)]) {
      const action = choose(state), kick = legalChoice(state, action);
      assert.equal(action.type, 'kick');
      assert.equal(!!kick.goal, false, `${type} never becomes a direct attempt on goal`);
      if (type === 'throwIn') assert.ok(kick.distance <= 10);
      assert.notEqual(apply(state, action).phase, 'keeperReact');
    }
  }
});

test('Casual clears an offside box knight before choosing a finish, either color', () => {
  const original = fixture({positions: {'white-N1': [9, 1]}});
  for (const state of [original, mirrored(original)]) {
    assert.equal(e.offsideInfo(state).boxKnightIds.length, 1);
    assert.ok(e.legalKicks({...state, phase: 'kick'}).some(kick => kick.goal === state.attack && kick.offsideReason === 'boxKnight'));
    const prepared = finishAttackPositioning(state).state;
    assert.equal(e.offsideInfo(prepared).boxKnightIds.length, 0, 'clear the involved offside attacker during positioning');
    const kicking = e.skipMove(prepared), action = choose(kicking), kick = legalChoice(kicking, action);
    assert.equal(!!kick.offside, false);
    assert.notEqual(apply(kicking, action).lastAction.type, 'offside');
  }
});

test('Casual finishing decisions are pure and independent of upcoming random outcomes', () => {
  const scenarios = [fixture(), fixture({phase: 'kick'}), fixture({positions: {'black-R1': [6, 7]}, budget: {normalUsed: true, pawnUsed: true, dribbleUsed: false}})];
  for (const state of scenarios) {
    const expected = choose(state);
    for (const randomState of [0, 0xffffffff, 912175]) assert.deepEqual(choose({...clone(state), randomState}), expected);
  }
});
