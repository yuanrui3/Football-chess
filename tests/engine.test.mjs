import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BOARD_WIDTH, BOARD_HEIGHT, GOAL_FILES, BOX_FILES, BOX_DEPTH, SHOT_MODEL, isBox, canOccupySquare,
  createGame, legalMoves, legalKicks, applyMove, applyKick,
  skipMove, chooseAIAction, currentTeam, shotChance, shotModel, passAccuracy, positionActions, cornerTakers, selectCornerTaker,
} from '../dist/engine.js';

const TEAM_IDS = ['K', 'Q', 'R1', 'R2', 'B1', 'B2', 'N1', 'N2', 'P1', 'P2', 'P3'];
const clone = value => JSON.parse(JSON.stringify(value));
const freshBudget = () => ({ normalUsed: false, pawnUsed: false, dribbleUsed: false });

// Park uninvolved players on the touchlines, preserving every member of the roster.
function fixture({ phase = 'attackMove', attack = 'white', carrier = 'white-R1', positions = {}, ball, budget, seed = 17, clear = [] } = {}) {
  const state = createGame({ mode: 'local', kickoff: attack, minutes: 10, seed });
  const assigned = { 'white-K': [5, BOARD_HEIGHT-1], 'black-K': [8, 0], 'white-R1': [2, 10], ...positions };
  const occupied = new Set(Object.values(assigned).map(([x, y]) => `${x},${y}`));
  assert.equal(occupied.size, Object.keys(assigned).length, 'fixture overrides must not overlap');
  for (const [x, y] of clear) occupied.add(`${x},${y}`);
  const parking = Array.from({ length: BOARD_HEIGHT }, (_, y) => [[0,y], [BOARD_WIDTH-1,y]]).flat();
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
    assert.ok(canOccupySquare(p,p.x,p.y),`${p.id} occupies a permitted square`);
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
    assert.equal(typeof state.positionBudget.dribbleUsed, 'boolean');
    const actions = positionActions(state);
    assert.ok(actions.normalAvailable || actions.pawnAvailable || actions.dribbleAvailable, 'spent available actions advance the phase');
  }
  if (state.phase === 'keeperReact') assert.ok(state.pendingShot, 'reaction must retain the declared shot');
  if (state.phase === 'keeperRelease') {
    assert.equal(state.releaseReason, 'backPass');
    assert.equal(state.pieces.find(p => p.id === state.ball.carrierId)?.type, 'K');
    assert.deepEqual(legalMoves(state, state.ball.carrierId), []);
  } else assert.equal(state.releaseReason, null, 'release reasons are cleared after the forced kick');
  if (state.restart) {
    assert.ok(['cornerSelect', 'attackMove', 'defendMove', 'kick'].includes(state.phase), 'all dead-ball restarts retain their positioning round');
    if(state.phase==='cornerSelect') {
      assert.equal(state.restart.type,'corner');assert.equal(state.restart.takerId,null);
      assert.equal(state.ball.carrierId,null);assert.ok(cornerTakers(state).length,'a chooser has an eligible attacking-half player');
    }
    assert.equal(state.restart.team, state.attack);
    assert.equal(state.restart.takerId, state.ball.carrierId);
    assert.deepEqual({ x: state.ball.x, y: state.ball.y }, state.restart.spot);
    assert.deepEqual(legalMoves(state, state.restart.takerId), [], 'the restart taker stays at the spot until kicking');
    for (const player of state.pieces) assert.equal(legalMoves(state, player.id).some(move => move.type === 'tackle'), false, 'dead-ball restarts prohibit tackling');
  }
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
    return applyKick(state, action.x, action.y,{passRun:!!action.passRun});
  }
  if(action.type==='cornerTaker') {
    assert.ok(cornerTakers(state).some(piece=>piece.id===action.pieceId),'AI corner taker must be offered by cornerTakers');
    return selectCornerTaker(state,action.pieceId);
  }
  assert.equal(action.type, 'skip');
  return skipMove(state);
}
function declaredShot({ x = 5, keeper = [8, 0], attack = 'white' } = {}) {
  const white = attack === 'white';
  const y = white ? -1 : BOARD_HEIGHT;
  const state = fixture({
    phase: 'kick', attack, carrier: `${attack}-R1`,
    positions: { [`${attack}-R1`]: [x, white ? 4 : BOARD_HEIGHT-5], [`${white ? 'black' : 'white'}-K`]: keeper },
  });
  assert.ok(hasKick(state, x, y));
  return applyKick(state, x, y);
}

function almostEqual(actual, expected, label = '') {
  assert.ok(Math.abs(actual - expected) < 1e-10, `${label}: expected ${expected}, got ${actual}`);
}

test('pitch constants distinguish four-wide goals from six-wide three-deep keeper boxes', () => {
  assert.equal(BOARD_WIDTH,14);
  assert.equal(BOARD_HEIGHT,17);
  assert.deepEqual(GOAL_FILES,[5,6,7,8]);
  assert.deepEqual(BOX_FILES,[4,5,6,7,8,9]);
  assert.equal(BOX_DEPTH,3);
  for (const x of BOX_FILES) {
    for(const y of [0,1,2,14,15,16])assert.equal(isBox(x,y),true);
    assert.equal(isBox(x,BOX_DEPTH),false);
    assert.equal(isBox(x,BOARD_HEIGHT-BOX_DEPTH-1),false);
  }
  assert.equal(isBox(3, 0), false);
  assert.equal(isBox(10,16),false);
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

test('a carrier dribble preserves the independent no-ball and bonus pawn options', () => {
  const state = fixture({ positions: { 'white-R1': [2, 8], 'white-P1': [8, 8] } });
  const next = applyMove(state, 'white-R1', 3, 8);
  assert.equal(next.phase, 'attackMove');
  assert.deepEqual(next.positionBudget, { normalUsed: false, pawnUsed: false, dribbleUsed: true });
  assert.deepEqual(legalMoves(next, 'white-R1'), []);
  assert.equal(hasMove(next, 'white-P1', 8, 7, { freePawn: true }), true);
  assert.deepEqual(next.ball, { x: 3, y: 8, carrierId: 'white-R1' });
  const positioned = applyMove(next, 'white-P1', 8, 7);
  assert.equal(positioned.phase, 'attackMove');
  assert.deepEqual(positioned.positionBudget, { normalUsed: true, pawnUsed: false, dribbleUsed: true });
  const defend = applyMove(positioned, 'white-P1', 8, 6, { freePawn: true });
  assert.equal(defend.phase, 'defendMove');
  assert.deepEqual(defend.positionBudget, freshBudget());
  assertIntegrity(defend);
});

test('bonus pawn can be used before dribbling and a no-ball move can finish the turn', () => {
  const state = fixture({ positions: { 'white-R1': [2, 8], 'white-P1': [8, 8] } });
  const bonus = applyMove(state, 'white-P1', 9, 8, { freePawn: true });
  assert.equal(bonus.phase, 'attackMove');
  assert.deepEqual(bonus.positionBudget, { normalUsed: false, pawnUsed: true, dribbleUsed: false });
  assert.deepEqual(legalMoves(bonus, 'white-P1', { freePawn: true }), []);
  const dribbled = applyMove(bonus, 'white-R1', 3, 8);
  assert.equal(dribbled.phase, 'attackMove');
  assert.deepEqual(dribbled.positionBudget, { normalUsed: false, pawnUsed: true, dribbleUsed: true });
  const defend = applyMove(dribbled, 'white-P1', 9, 7);
  assert.equal(defend.phase, 'defendMove');
  assert.deepEqual(defend.positionBudget, freshBudget());
});

test('one pawn may take both its bonus and normal moves but cannot take either twice', () => {
  const state = fixture({ budget: { normalUsed: false, pawnUsed: false, dribbleUsed: true }, positions: { 'white-P1': [8, 8] } });
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

test('pawns tackle one diagonal square forward or backward for both teams', () => {
  for (const defendingTeam of ['white', 'black']) for (const dx of [-1, 1]) for (const dy of [-1, 1]) {
    const attack = defendingTeam === 'white' ? 'black' : 'white';
    const defenderId = `${defendingTeam}-P1`, carrierId = `${attack}-R1`;
    const state = fixture({ phase: 'defendMove', attack, carrier: carrierId, positions: { [defenderId]: [6, 7], [carrierId]: [6 + dx, 7 + dy] } });
    const before = clone(state), tackles = legalMoves(state, defenderId).filter(move => move.type === 'tackle');
    assert.ok(tackles.length, `${defendingTeam} pawn reaches diagonal ${dx},${dy}`);
    assert.ok(tackles.every(move => move.targetId === carrierId && move.tackleProbability === 1));
    const bonus = legalMoves(state, defenderId, { freePawn: true });
    assert.equal(bonus.some(move => move.type === 'tackle'), false, 'the free-pawn allowance still cannot tackle');
    assert.ok(bonus.every(move => Math.abs(move.x - 6) + Math.abs(move.y - 7) === 1), 'free movement remains one cardinal step');
    const next = applyMove(state, defenderId, tackles[0].x, tackles[0].y, { roll: .999999 });
    assert.deepEqual(state, before, 'tackle previews and resolution preserve the undo state');
    assert.equal(next.attack, defendingTeam);
    assert.equal(next.ball.carrierId, defenderId);
    assert.equal(next.pieces.length, 22);
    assert.equal(next.randomState, state.randomState, 'ordinary pawn tackles remain certain');
    assert.deepEqual(next.positionBudget, freshBudget());
    assertIntegrity(next);
  }
});

test('backward pawn tackles on knights retain the 50 percent success rule', () => {
  for (const defendingTeam of ['white', 'black']) for (const dx of [-1, 1]) {
    const attack = defendingTeam === 'white' ? 'black' : 'white';
    const defenderId = `${defendingTeam}-P1`, carrierId = `${attack}-N1`;
    const dy = defendingTeam === 'white' ? 1 : -1;
    const state = fixture({ phase: 'defendMove', attack, carrier: carrierId, positions: { [defenderId]: [6, 7], [carrierId]: [6 + dx, 7 + dy] } });
    const tackle = legalMoves(state, defenderId).find(move => move.type === 'tackle');
    assert.ok(tackle);
    assert.equal(tackle.tackleProbability, .5);
    const success = applyMove(state, defenderId, tackle.x, tackle.y, { roll: .499999 });
    const miss = applyMove(state, defenderId, tackle.x, tackle.y, { roll: .5 });
    assert.equal(success.ball.carrierId, defenderId);
    assert.equal(miss.ball.carrierId, carrierId);
    assert.equal(miss.phase, 'defendMove');
    assert.deepEqual(miss.positionBudget, { normalUsed: true, pawnUsed: false, dribbleUsed: false });
    assert.equal(success.randomState, miss.randomState, 'both outcomes consume the same seeded draw');
    assertIntegrity(success);
    assertIntegrity(miss);
  }
});

test('pawn tackling gains backward diagonals without gaining cardinal or longer reach', () => {
  for (const defendingTeam of ['white', 'black']) for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0], [2, 2], [-2, -2]]) {
    const attack = defendingTeam === 'white' ? 'black' : 'white';
    const defenderId = `${defendingTeam}-P1`, carrierId = `${attack}-R1`;
    const state = fixture({ phase: 'defendMove', attack, carrier: carrierId, positions: { [defenderId]: [6, 7], [carrierId]: [6 + dx, 7 + dy] } });
    assert.equal(legalMoves(state, defenderId).some(move => move.type === 'tackle'), false);
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

test('rook, bishop and queen retain ten-square movement and uncapped passing after shorter tackle reach', () => {
  for (const [type, from, ten, eleven] of [
    ['R1', [2, 13], [2, 3], [2, 2]],
    ['B1', [0, 12], [10, 2], [11, 1]],
    ['Q', [3, 13], [3, 3], [3, 2]],
  ]) {
    const id = `white-${type}`;
    const state = fixture({ carrier: 'white-P3', positions: { 'white-R1': [9, 7], [id]: from }, clear: [ten, eleven] });
    assert.equal(hasMove(state, id, ...ten), true, `${type} can move ten squares`);
    assert.equal(hasMove(state, id, ...eleven), false, `${type} cannot move eleven squares`);
    const dribble = { ...clone(state), ball: { x: from[0], y: from[1], carrierId: id } };
    assert.equal(hasMove(dribble, id, ...ten), false, `${type} cannot carry the ball beyond the eight-square dribble limit`);
    const kicks = legalKicks({ ...dribble, phase: 'kick' });
    assert.equal(kicks.find(kick => kick.x === ten[0] && kick.y === ten[1])?.accuracy, 1, `${type} passes ten squares with full accuracy`);
    assert.equal(kicks.find(kick => kick.x === eleven[0] && kick.y === eleven[1])?.accuracy, .9, `${type} can still attempt an eleven-square pass`);
  }
});

test('queen, rook and bishop tackle reach is five squares to the carrier for both teams', () => {
  for (const defendingTeam of ['white', 'black']) {
    const attack = defendingTeam === 'white' ? 'black' : 'white';
    for (const [type, five, six, blocker] of [
      ['Q', [2, 5], [2, 4], [2, 8]],
      ['Q', [7, 5], [8, 4], [4, 8]],
      ['R1', [2, 5], [2, 4], [2, 8]],
      ['B1', [7, 5], [8, 4], [4, 8]],
    ]) {
      const defenderId = `${defendingTeam}-${type}`, carrierId = `${attack}-Q`;
      const positions = { 'white-R1': [9, 10], [defenderId]: [2, 10] };
      const atFive = fixture({ phase: 'defendMove', attack, carrier: carrierId, positions: { ...positions, [carrierId]: five } });
      const tackles = legalMoves(atFive, defenderId).filter(move => move.type === 'tackle');
      assert.ok(tackles.length, `${defenderId} can reach a clear carrier five squares away`);
      assert.ok(tackles.every(move => move.tackleProbability === 1 && move.targetId === carrierId));
      assert.ok(tackles.some(move => Math.max(Math.abs(move.x - 2), Math.abs(move.y - 10)) === 6), 'an adjacent landing can be six squares away: reach is measured to the carrier');
      for (const move of tackles) assert.ok(Math.max(Math.abs(move.x - 2), Math.abs(move.y - 10)) <= 10, 'the existing global landing limit remains in force');

      const atSix = fixture({ phase: 'defendMove', attack, carrier: carrierId, positions: { ...positions, [carrierId]: six } });
      assert.equal(legalMoves(atSix, defenderId).some(move => move.type === 'tackle'), false, `${defenderId} cannot reach a carrier six squares away`);
      const attemptedLanding = tackles.find(move => Math.max(Math.abs(move.x - 2), Math.abs(move.y - 10)) === 6);
      const before = clone(atSix);
      assert.throws(() => applyMove(atSix, defenderId, attemptedLanding.x, attemptedLanding.y), 'rejected tackle destinations cannot bypass the range check');
      assert.deepEqual(atSix, before);

      const blocked = fixture({ phase: 'defendMove', attack, carrier: carrierId, positions: { ...positions, [carrierId]: five, [`${defendingTeam}-P1`]: blocker } });
      assert.equal(legalMoves(blocked, defenderId).some(move => move.type === 'tackle'), false, 'shorter tackle reach still requires a clear path');
    }
  }
});

test('five-square tackles against knights retain their 50% success rate', () => {
  for (const defendingTeam of ['white', 'black']) {
    const attack = defendingTeam === 'white' ? 'black' : 'white';
    for (const [type, target] of [['Q', [2, 5]], ['R1', [2, 5]], ['B1', [7, 5]]]) {
      const defenderId = `${defendingTeam}-${type}`, carrierId = `${attack}-N1`;
      const state = fixture({ phase: 'defendMove', attack, carrier: carrierId, positions: { 'white-R1': [9, 10], [defenderId]: [2, 10], [carrierId]: target } });
      const tackle = legalMoves(state, defenderId).find(move => move.type === 'tackle');
      assert.ok(tackle, `${defenderId} reaches a knight at five squares`);
      assert.equal(tackle.tackleProbability, .5);
      assert.equal(applyMove(state, defenderId, tackle.x, tackle.y, { roll: .499999 }).ball.carrierId, defenderId);
      assert.equal(applyMove(state, defenderId, tackle.x, tackle.y, { roll: .5 }).ball.carrierId, carrierId);
    }
  }
});

test('tackling transfers possession without capturing and resets all positioning actions', () => {
  const state = fixture({ phase: 'defendMove', budget: { normalUsed: false, pawnUsed: true, dribbleUsed: false }, positions: { 'white-R1': [6, 7], 'black-R1': [2, 7] } });
  const tackle = legalMoves(state, 'black-R1').find(m => m.type === 'tackle');
  assert.ok(tackle);
  assert.equal(tackle.tackleProbability, 1, 'ordinary carriers remain certain to tackle');
  const next = applyMove(state, 'black-R1', tackle.x, tackle.y, { roll: .999999 });
  assert.equal(next.ball.carrierId, 'black-R1');
  assert.equal(next.attack, 'black');
  assert.equal(next.phase, 'attackMove');
  assert.deepEqual(next.positionBudget, freshBudget());
  assert.equal(next.randomState, state.randomState, 'certain tackles consume no randomness');
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

test('every opposing piece type can attempt a reachable knight tackle at 50%', () => {
  const cases = [['R1', [2, 7]], ['B1', [3, 5]], ['Q', [3, 7]], ['N1', [4, 5]], ['P1', [4, 6]], ['K', [4, 7]]];
  for (const [suffix, location] of cases) {
    const id = `black-${suffix}`;
    const state = fixture({ phase: 'defendMove', carrier: 'white-N1', positions: { 'white-N1': [5, 7], [id]: location } });
    const before = clone(state);
    const tackles = legalMoves(state, id).filter(m => m.type === 'tackle');
    assert.ok(tackles.length, `${suffix} can challenge a reachable knight`);
    for (const tackle of tackles) {
      assert.equal(tackle.targetId, 'white-N1');
      assert.equal(tackle.tackleProbability, .5);
    }
    assert.equal(legalMoves(state, id, { freePawn: true }).some(m => m.type === 'tackle'), false, 'bonus pawn actions cannot challenge');
    assert.deepEqual(state, before, 'tackle previews preserve state and randomness');
  }
});

test('knight tackle probability boundaries resolve possession without capturing either player', () => {
  for (const [roll, success] of [[0, true], [.499999, true], [.5, false], [.999999, false]]) {
    const state = fixture({ phase: 'defendMove', carrier: 'white-N1', positions: { 'white-N1': [5, 7], 'black-R1': [2, 7] } });
    const before = clone(state);
    const next = applyMove(state, 'black-R1', 6, 7, { roll });
    assert.deepEqual(state, before, 'undo snapshot is preserved');
    assert.equal(next.attack, success ? 'black' : 'white', `roll ${roll}`);
    assert.equal(next.ball.carrierId, success ? 'black-R1' : 'white-N1');
    assert.deepEqual(next.ball, success ? { x: 6, y: 7, carrierId: 'black-R1' } : state.ball);
    assert.equal(next.phase, success ? 'attackMove' : 'defendMove');
    assert.deepEqual(next.positionBudget, success ? freshBudget() : { normalUsed: true, pawnUsed: false, dribbleUsed: false });
    assert.equal(next.turn, state.turn + (success ? 1 : 0));
    assert.deepEqual(next.pieces.find(p => p.id === 'white-N1'), state.pieces.find(p => p.id === 'white-N1'), 'target knight stays on its square');
    assert.deepEqual(next.pieces.find(p => p.id === 'black-R1'), { ...state.pieces.find(p => p.id === 'black-R1'), x: 6, y: 7 }, 'challenger reaches the selected landing on either outcome');
    assert.equal(next.lastAction.type, success ? 'tackle' : 'tackleMiss');
    assert.equal(next.lastAction.probability, .5);
    assert.equal(next.lastAction.tackleSuccess, success);
    assert.equal(next.lastAction.targetId, 'white-N1');
    assert.deepEqual(next.lastAction.path, [{ x: 2, y: 7 }, { x: 5, y: 7 }, { x: 6, y: 7 }]);
    assert.notEqual(next.randomState, state.randomState, 'attempt consumes one random outcome');
    assertIntegrity(next);
  }
});

test('a failed knight tackle spends the normal action and retains the available free pawn action', () => {
  const state = fixture({ phase: 'defendMove', carrier: 'white-N1', positions: { 'white-N1': [5, 7], 'black-R1': [2, 7], 'black-P1': [8, 8] } });
  const miss = applyMove(state, 'black-R1', 6, 7, { roll: .5 });
  assert.deepEqual(legalMoves(miss, 'black-R1'), [], 'another normal challenge is unavailable');
  assert.equal(hasMove(miss, 'black-P1', 8, 7, { freePawn: true }), true);
  const afterPawn = applyMove(miss, 'black-P1', 8, 7, { freePawn: true });
  assert.equal(afterPawn.phase, 'kick');
  assert.equal(afterPawn.attack, 'white');
  assert.deepEqual(afterPawn.ball, state.ball);
  assert.equal(afterPawn.randomState, miss.randomState, 'ordinary pawn movement consumes no randomness');
  assertIntegrity(afterPawn);
});

test('a knight tackle after the bonus pawn action starts a new attack on success or ends defense on failure', () => {
  const state = fixture({ phase: 'defendMove', carrier: 'white-N1', budget: { normalUsed: false, pawnUsed: true, dribbleUsed: false }, positions: { 'white-N1': [5, 7], 'black-R1': [2, 7] } });
  for (const [roll, success] of [[0, true], [.5, false]]) {
    const next = applyMove(state, 'black-R1', 6, 7, { roll });
    assert.equal(next.phase, success ? 'attackMove' : 'kick');
    assert.equal(next.attack, success ? 'black' : 'white');
    assert.equal(next.ball.carrierId, success ? 'black-R1' : 'white-N1');
    assert.deepEqual(next.positionBudget, freshBudget());
    assertIntegrity(next);
  }
});

test('knight tackle seeds reproduce either outcome and previews and AI planning consume no randomness', () => {
  const outcomes = new Set();
  for (const seed of [0, 1000, 2000, 3000]) {
    const state = fixture({ phase: 'defendMove', carrier: 'white-N1', seed, positions: { 'white-N1': [5, 7], 'black-R1': [2, 7] } });
    const before = clone(state);
    for (let index = 0; index < 3; index++) {
      for (const piece of state.pieces) legalMoves(state, piece.id);
      legalKicks(state);
      assert.deepEqual(chooseAIAction(state), chooseAIAction(state));
    }
    assert.deepEqual(state, before);
    const next = applyMove(state, 'black-R1', 6, 7);
    assert.deepEqual(applyMove(state, 'black-R1', 6, 7), next, 'replaying the same snapshot reproduces the random outcome');
    assert.deepEqual(state, before);
    outcomes.add(next.lastAction.tackleSuccess);
    assertIntegrity(next);
  }
  assert.deepEqual([...outcomes].sort(), [false, true]);
});

test('blocked and unreachable knight challenges are rejected before consuming randomness', () => {
  for (const positions of [
    { 'white-N1': [5, 7], 'black-R1': [2, 6] },
    { 'white-N1': [5, 7], 'black-R1': [2, 7], 'black-P1': [3, 7] },
  ]) {
    const state = fixture({ phase: 'defendMove', carrier: 'white-N1', positions });
    const before = clone(state);
    assert.equal(legalMoves(state, 'black-R1').some(m => m.type === 'tackle'), false);
    assert.throws(() => applyMove(state, 'black-R1', 6, 7, { roll: 0 }));
    assert.deepEqual(state, before);
  }
});

test('outfield players can enter either box off the ball; kings enter only their own and carriers cannot dribble into either', () => {
  for (const [id, from, to] of [
    ['white-B1',[3,BOX_DEPTH],[4,BOX_DEPTH-1]],['white-R1',[6,BOX_DEPTH],[6,BOX_DEPTH-1]],
    ['white-P1',[7,BOARD_HEIGHT-BOX_DEPTH-1],[7,BOARD_HEIGHT-BOX_DEPTH]],
  ]) {
    const state = fixture({ carrier:id==='white-R1'?'white-Q':'white-R1',positions: { [id]: from } });
    assert.equal(hasMove(state,id,...to),true);
  }
  const state = fixture({ positions: { 'white-K': [3, 2] } });
  assert.equal(hasMove(state, 'white-K', 4, 1), false);
  const ownBox=fixture({positions:{'white-K':[3,BOARD_HEIGHT-BOX_DEPTH-1]}});
  assert.equal(hasMove(ownBox,'white-K',4,BOARD_HEIGHT-BOX_DEPTH),true);
  for (const [attack, carrier, from, to] of [
    ['white', 'white-N1', [3, 3], [4, 1]],
    ['white','white-N1',[3,BOARD_HEIGHT-4],[4,BOARD_HEIGHT-2]],
    ['black', 'black-N1', [8, 3], [7, 1]],
    ['black','black-N1',[10,BOARD_HEIGHT-4],[9,BOARD_HEIGHT-2]],
  ]) {
    const knight = fixture({ attack, carrier:`${attack}-R1`, positions: { [carrier]: from } });
    assert.equal(hasMove(knight, carrier, ...to), true, `${carrier} can enter either box off the ball`);
    assertIntegrity(applyMove(knight, carrier, ...to));
    const carrying=clone(knight),piece=carrying.pieces.find(piece=>piece.id===carrier);
    carrying.ball={x:piece.x,y:piece.y,carrierId:carrier};
    assert.equal(hasMove(carrying,carrier,...to),false,`${carrier} cannot jump into either box while carrying the ball`);
  }
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

test('an accurate onside long pass arrives below its probability threshold and fails at that threshold', () => {
  const state = fixture({ phase: 'kick', positions: { 'white-R1': [2, 13], 'white-P1': [2, 2], 'black-R1': [10, 1] } });
  assert.equal(legalKicks(state).find(kick => kick.x === 2 && kick.y === 2).offside, false, 'a second defender keeps the receiver onside so the test isolates accuracy');
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
  const state = fixture({ phase: 'kick', positions: { 'white-R1': [5, 10] } });
  const next = applyKick(state,5,BOARD_HEIGHT-1);
  assert.equal(next.phase, 'keeperRelease');
  assert.equal(next.releaseReason, 'backPass');
  assert.equal(currentTeam(next), 'white');
  assert.equal(next.ball.carrierId, 'white-K');
  assert.ok(legalKicks(next).length);
  assert.deepEqual(legalMoves(next, 'white-K'), []);
  assert.throws(() => applyMove(next,'white-K',6,BOARD_HEIGHT-1));
  assert.throws(() => skipMove(next));
  const kick = legalKicks(next).find(k=>k.x!==5||k.y!==BOARD_HEIGHT-1);
  const released = applyKick(next, kick.x, kick.y, { roll: 0 });
  assert.notEqual(released.phase, 'keeperRelease');
  assert.equal(released.releaseReason, null);
  assertIntegrity(released);
});

test('an opposing king intercepting an ordinary pass may hold the ball normally', () => {
  const state = fixture({ phase: 'kick', positions: { 'white-R1': [8, 4] } });
  assert.equal(hasKick(state,8,0),true);
  const next=applyKick(state,8,0);
  assert.equal(next.ball.carrierId, 'black-K');
  assert.equal(next.attack, 'black');
  assert.equal(next.phase, 'attackMove');
  assert.deepEqual(next.positionBudget, freshBudget());
  assertIntegrity(next);
});

test('goal declarations wait for the defending goalkeeper before resolving the score', () => {
  const state = fixture({ phase: 'kick', positions: { 'white-R1': [5, 4], 'black-K': [8, 0] } });
  const before = clone(state);
  const reaction = applyKick(state, 5, -1);
  assert.equal(reaction.phase, 'keeperReact');
  assert.equal(currentTeam(reaction), 'black');
  assert.ok(reaction.pendingShot);
  assert.equal(reaction.rulesVersion,17);
  assert.deepEqual(reaction.pendingShot.from, { x: 5, y: 4 });
  assert.equal(reaction.lastAction.shotModel.modelVersion,13);
  assert.deepEqual(reaction.lastAction.shotModel, shotModel(state, 5, -1));
  assert.deepEqual(reaction.score, { white: 0, black: 0 });
  assert.deepEqual(legalKicks(reaction), []);
  assert.deepEqual(legalMoves(reaction, 'black-Q'), []);
  assert.deepEqual(legalMoves(reaction, 'black-P1', { freePawn: true }), []);
  assert.deepEqual(state, before);
});

test('goalkeeper reaction is one empty adjacent step and changes the final shot probability', () => {
  const reaction = declaredShot({ x: 5, keeper: [8, 0] });
  const before = shotModel(reaction);
  assert.equal(hasMove(reaction,'black-K',6,0),false);
  assert.equal(hasMove(reaction,'black-K',7,0),true);
  const after = shotModel(reaction, 5, -1, { x: 7, y: 0 });
  assert.ok(after.probability < before.probability, 'stepping toward the shot lowers its scoring probability');
  const result = applyMove(reaction,'black-K',7,0,{roll:after.probability+after.cornerProbability+after.caughtSaveProbability/2});
  assert.deepEqual(result.score, { white: 0, black: 0 });
  assert.equal(result.ball.carrierId, 'black-K');
  assert.equal(result.phase, 'attackMove');
  assert.deepEqual(result.lastAction.shotModel.origin, { x: 5, y: 4 }, 'keeper movement cannot change the declared origin');
  assert.deepEqual(result.lastAction.shotModel, after);
  assert.deepEqual(result.lastAction.keeperMove, { pieceId: 'black-K', from: { x: 8, y: 0 }, to: { x: 7, y: 0 } });
  assertIntegrity(result);
});

test('a goalkeeper standing on a shot ray does not prevent selecting the net', () => {
  const state = fixture({ phase: 'kick', positions: { 'white-R1': [5, 4], 'black-K': [5, 0] } });
  assert.equal(hasKick(state,5,0),true,'ordinary pass to the keeper remains legal');
  assert.equal(hasKick(state, 5, -1), true, 'goal aim remains available beyond keeper');
  const reaction = applyKick(state, 5, -1);
  const model = shotModel(reaction);
  assert.ok(model.probability > 0, 'an aligned goalkeeper is strong but does not guarantee a save');
  const result = skipMove(reaction, { roll: model.probability + model.cornerProbability + model.caughtSaveProbability / 2 });
  assert.equal(result.score.white, 0);
  assert.equal(result.ball.carrierId, 'black-K');
});

test('outfield players intercept ordinary passes and give shots a probabilistic block before the net', () => {
  const state = fixture({ phase: 'kick', positions: { 'white-R1': [5, 6], 'black-P1': [5, 3] } });
  assert.equal(hasKick(state,5,3),true);
  assert.equal(hasKick(state,5,-1),true);
  const model=shotModel(state,5,-1);
  assert.deepEqual(model.blockerIds,['black-P1']);
  almostEqual(model.blockProbability,.45);
  almostEqual(model.blockOutProbability,.45*.85);
  almostEqual(model.blockPossessionProbability,.45*.15);
  almostEqual(model.blockCornerProbability,model.blockOutProbability);
  almostEqual(model.goalProbability+model.saveProbability+model.missProbability+model.blockProbability,1);
  almostEqual(model.goalProbability+model.keeperCornerProbability+model.caughtSaveProbability+model.missProbability+model.blockOutProbability+model.blockPossessionProbability,1);
  const clear=clone(state);clear.pieces.find(piece=>piece.id==='black-P1').x=6;
  assert.ok(model.goalProbability>0&&model.goalProbability<shotChance(clear,5,-1));
  const blocked=skipMove(applyKick(state,5,-1),{roll:.999999});
  assert.equal(blocked.lastAction.type,'blockedShot');assert.equal(blocked.ball.carrierId,'black-P1');
});

test('the shot preview exposes Euclidean distance, goal-plane geometry and complete probabilities', () => {
  const state = fixture({ phase: 'kick', positions: { 'white-R1': [5, 6], 'black-K': [6, 0] } });
  const model = shotModel(state, 5, -1);
  assert.equal(model.modelVersion,13);
  assert.equal(SHOT_MODEL.finishingAccuracyMultiplier,1.15);
  assert.equal(model.finishingAccuracyMultiplier,1.15);
  assert.deepEqual(model.origin, { x: 5, y: 6 });
  assert.deepEqual(model.target, { x: 5, y: -.5 });
  assert.equal(model.distance, 6.5);
  assert.equal(model.shotAngleDegrees, 0);
  assert.equal(model.keeperPathDistance, 1);
  assert.deepEqual(model.closestPoint, { x: 5, y: 0 });
  assert.deepEqual(model.keeperPosition, { x: 6, y: 0 });
  assert.equal(model.timeToKeeper, 1);
  assert.equal(model.keeperInBox, true);
  almostEqual(model.reach, .4 + 1.3 * (1 - .15));
  almostEqual(model.postAngleFactor,.1+.9*model.goalOpeningRatio**1.5);
  almostEqual(model.onTargetProbability,Math.max(.01,Math.min(.98,.98*1.15*Math.exp(-.018*6.5-.03*(6.5-3)**2)*model.postAngleFactor*model.wideAngleFactor*model.centralLaneFactor)));
  almostEqual(model.goalProbability, model.onTargetProbability * (1 - model.saveGivenOnTarget));
  almostEqual(model.saveProbability, model.onTargetProbability * model.saveGivenOnTarget);
  almostEqual(model.missProbability, 1 - model.onTargetProbability);
  almostEqual(model.probability + model.saveProbability + model.missProbability + model.blockProbability, 1);
  assert.equal(shotChance(state, 5, -1), model.goalProbability);
  assert.equal(model.probability, model.goalProbability);
  const kick = legalKicks(state).find(k=>k.goal&&k.x===5&&k.y===-1);
  assert.deepEqual(kick.shotModel, model);
  assert.equal(kick.probability, model.probability);
});

test('close shots are more dangerous while longer flight gives a fixed keeper more reach', () => {
  const near = fixture({ phase: 'kick', positions: { 'white-R1': [5, 3], 'black-K': [6, 0] } });
  const far = fixture({ phase: 'kick', positions: { 'white-R1': [5, 10], 'black-K': [6, 0] } });
  const a = shotModel(near, 5, -1), b = shotModel(far, 5, -1);
  assert.equal(a.keeperPathDistance, b.keeperPathDistance);
  assert.ok(a.probability > b.probability);
  assert.ok(a.onTargetProbability > b.onTargetProbability);
  assert.ok(a.timeToKeeper < b.timeToKeeper);
  assert.ok(a.reach < b.reach);
  assert.ok(a.saveGivenOnTarget < b.saveGivenOnTarget);
});

test('extra distance pressure starts beyond three squares with a shared close-shot distance curve', () => {
  assert.equal(SHOT_MODEL.version,13);
  assert.equal(SHOT_MODEL.distancePenaltyStart, 3);
  assert.equal(SHOT_MODEL.longShotDecay, .06);
  assert.equal(SHOT_MODEL.minOnTarget, .01);
  for(const [x,y]of [[6,1],[4,1],[3,0]]){
    const carrier='white-N1';
    const state = fixture({ phase: 'kick', carrier, positions: { [carrier]: [x, y] } });
    assert.equal(hasKick(state, 5, -1), true);
    const model = shotModel(state, 5, -1);
    assert.ok(model.distance <= 3, 'short-range fixture stays inside the protected range');
    const angleCos = Math.cos(model.shotAngleDegrees * Math.PI / 180);
    const expectedAccuracy=Math.max(.01,Math.min(.98,.98*1.15*Math.exp(-.018*model.distance)*(.65+.35*angleCos)*model.postAngleFactor*model.wideAngleFactor*model.centralLaneFactor));
    almostEqual(model.baseOnTargetProbability, expectedAccuracy, 'close shots retain the shared distance curve and receive both goal-opening adjustments');
  }
});

test('central straight shots lose accuracy progressively with range and settle at the one-percent floor', () => {
  let previous = 1;
  for(let y=BOX_DEPTH;y<=12;y++){
    const state = fixture({ phase: 'kick', carrier: 'white-Q', positions: { 'white-Q': [6,y] } });
    const model = shotModel(state, 6, -1);
    assert.ok(model.onTargetProbability <= previous, `accuracy cannot rise at distance ${model.distance}`);
    assert.equal(model.centralLaneFactor,1.15);
    const expected=Math.max(.01,Math.min(.98,.98*1.15*Math.exp(-.018*model.distance-.06*Math.max(0,model.distance-3)**2)*model.postAngleFactor*model.wideAngleFactor*model.centralLaneFactor));
    almostEqual(model.onTargetProbability, expected);
    if(previous<.98&&model.onTargetProbability>.01)assert.ok(model.onTargetProbability<previous,'accuracy strictly decreases between its explicit cap and floor');
    previous = model.onTargetProbability;
  }
  assert.equal(previous, .01, 'very long shots retain a one-percent on-target floor');
});

test('an ordinary midfield shot retains strong range pressure before and after keeper reaction', () => {
  const state=fixture({phase:'kick',carrier:'white-Q',positions:{'white-Q':[5,8],'black-K':[7,0]}});
  const held = shotModel(state, 5, -1);
  const reaction = applyKick(state, 5, -1);
  const after = [held, ...legalMoves(reaction, 'black-K').map(move => shotModel(reaction, 5, -1, move))];
  const bestReaction = Math.min(...after.map(model => model.goalProbability));
  const previousAccuracy = Math.max(.01,Math.min(.98,.98*1.15*Math.exp(-.018*held.distance)*held.postAngleFactor*held.wideAngleFactor*held.centralLaneFactor));
  const previousHoldChance = previousAccuracy * (1 - held.saveGivenOnTarget);
  almostEqual(held.distance,8.5);
  assert.ok(previousHoldChance>.63&&previousHoldChance<.64,'removing range pressure while retaining the finishing and angle adjustments would make this midfield attempt excessively strong');
  assert.ok(held.goalProbability>.10&&held.goalProbability<.11,'the higher finishing baseline still limits the holding-keeper chance to about 10%');
  assert.ok(bestReaction>.04&&bestReaction<.05,'best keeper reaction reduces this midfield attempt below 5%');
  assert.ok(held.goalProbability < previousHoldChance / 3, 'range penalty cuts midfield scoring chance by more than two thirds');
});

test('stopped close shots arrive faster and are more likely to be parried than equally aligned distant shots', () => {
  assert.equal(SHOT_MODEL.impactSpeedDecay, .08);
  assert.equal(SHOT_MODEL.parryMin, .05);
  assert.equal(SHOT_MODEL.parrySpeedWeight, .60);
  assert.equal(SHOT_MODEL.parryStretchWeight, .25);
  assert.equal(SHOT_MODEL.parryMax, .90);
  const near = fixture({ phase: 'kick', positions: { 'white-R1': [5, 3], 'black-K': [5, 0] } });
  const far = fixture({ phase: 'kick', positions: { 'white-R1': [5, 12], 'black-K': [5, 0] } });
  const a = shotModel(near, 5, -1), b = shotModel(far, 5, -1);
  assert.equal(a.keeperPathDistance, 0);
  assert.equal(b.keeperPathDistance, 0);
  assert.ok(a.arrivalSpeed > b.arrivalSpeed);
  assert.ok(a.parryGivenSave > b.parryGivenSave);
  for (const [model, travel] of [[a, 3], [b, 12]]) {
    almostEqual(model.arrivalSpeed, 6 * Math.exp(-.08 * travel));
    almostEqual(model.parryGivenSave, .05 + .60 * Math.exp(-.16 * travel));
    almostEqual(model.cornerProbability, model.saveProbability * model.parryGivenSave);
    almostEqual(model.caughtSaveProbability, model.saveProbability * (1 - model.parryGivenSave));
    almostEqual(model.goalProbability + model.keeperCornerProbability + model.caughtSaveProbability + model.missProbability + model.blockProbability, 1);
  }
});

test('a keeper stretching to the same-speed shot parries a greater share of saves than an aligned keeper', () => {
  const state = fixture({ phase: 'kick', positions: { 'white-R1': [5, 5], 'black-K': [5, 0] } });
  const aligned = shotModel(state, 5, -1), stretching = shotModel(state, 5, -1, { x: 6, y: 0});
  almostEqual(aligned.arrivalSpeed, stretching.arrivalSpeed);
  assert.equal(aligned.keeperPathDistance, 0);
  assert.ok(stretching.keeperPathDistance > 0);
  assert.ok(stretching.parryGivenSave > aligned.parryGivenSave);
  almostEqual(stretching.parryGivenSave - aligned.parryGivenSave, .25 * Math.min(1, stretching.keeperPathDistance / stretching.reach));
});

test('parry splitting preserves the established goal, total-save and miss probabilities', () => {
  for (const [origin, keeper] of [[[5, 3], [6, 0]], [[5, 7], [7, 0]], [[5, 12], [5, 1]]]) {
    const state = fixture({ phase: 'kick', positions: { 'white-R1': origin, 'black-K': keeper } });
    const model = shotModel(state, 5, -1);
    const onTarget=Math.max(.01,Math.min(.98,.98*1.15*Math.exp(-.018*model.distance-.03*Math.max(0,model.distance-3)**2)*model.postAngleFactor*model.wideAngleFactor*model.centralLaneFactor));
    const time = (origin[1] - keeper[1]) / 6;
    const reach = .4 + 1.3 * Math.max(0, time - .15);
    const saveGivenTarget = .94 * (1 - Math.exp(-(.35 + time) / .45)) * Math.exp(-((Math.abs(keeper[0] - origin[0]) / reach) ** 2));
    almostEqual(model.goalProbability, onTarget * (1 - saveGivenTarget));
    almostEqual(model.saveProbability, onTarget * saveGivenTarget);
    almostEqual(model.missProbability, 1 - onTarget);
    almostEqual(model.keeperCornerProbability + model.caughtSaveProbability, model.saveProbability);
  }
});

test('parry rates stay capped in the own box and outside or absent keepers cannot generate saves or corners', () => {
  // Isolate the geometry model's cap with two legal box occupants at the same
  // depth. Piece-specific kicking shapes are tested independently.
  const capState=fixture({phase:'kick',carrier:'white-R1',positions:{'white-R1':[5,0],'black-K':[6,0]}});
  const capped = shotModel(capState, 5, -1);
  assert.equal(capped.keeperInBox, true);
  almostEqual(capped.parryGivenSave, .9);
  assert.ok(capped.saveProbability > 0);
  almostEqual(capped.cornerProbability, capped.saveProbability * .9);
  const noKeeper = clone(capState);
  noKeeper.pieces = noKeeper.pieces.filter(piece => piece.id !== 'black-K');
  const empty = shotModel(noKeeper, 5, -1);
  assert.equal(empty.parryGivenSave, 0);
  assert.equal(empty.saveProbability, 0);
  assert.equal(empty.cornerProbability, 0);
  assert.equal(empty.caughtSaveProbability, 0);
  const outside=shotModel(capState,5,-1,{x:6,y:BOX_DEPTH});
  assert.equal(outside.keeperInBox, false);
  for (const key of ['reach', 'parryGivenSave', 'saveProbability', 'cornerProbability', 'caughtSaveProbability']) assert.equal(outside[key], 0, key);
  const invalid = shotModel(capState, 3, -1);
  for (const key of ['arrivalSpeed', 'parryGivenSave', 'cornerProbability', 'caughtSaveProbability']) assert.equal(invalid[key], 0, key);
});

test('knight finishing uses shared base scoring with conditional parry physics and total probability mass', () => {
  for (const keeper of [[5, 0], [8, 0]]) {
    const knight = fixture({ phase: 'kick', carrier: 'white-N1', positions: { 'white-N1': [4, 1], 'black-K': keeper } });
    const ordinary = clone(knight);
    ordinary.pieces.find(piece => piece.id === 'white-N1').type = 'Q';
    const base = shotModel(ordinary, 5, -1), model = shotModel(knight, 5, -1);
    assert.equal(SHOT_MODEL.knightGoalMultiplier,1);
    assert.equal(model.scoringMultiplier,1);
    almostEqual(model.baseGoalProbability,base.goalProbability);
    almostEqual(model.goalProbability,base.goalProbability);
    almostEqual(model.arrivalSpeed,base.arrivalSpeed);
    if(model.saveProbability>0)almostEqual(model.parryGivenSave,base.parryGivenSave);
    else assert.equal(model.parryGivenSave,0,'a certain chip leaves no save branch to split');
    almostEqual(model.cornerProbability, model.saveProbability * model.parryGivenSave);
    almostEqual(model.goalProbability + model.keeperCornerProbability + model.caughtSaveProbability + model.missProbability + model.blockProbability, 1);
    assert.ok(model.goalProbability<1,'normal finishing does not gain an artificial guaranteed goal');
  }
});

test('a shot farther from the keeper is more likely to score without probability tiers', () => {
  const state = fixture({ phase: 'kick', positions: { 'white-R1': [5, 6] } });
  let previous = -1;
  for (const x of [5,6,7,8]) {
    const model = shotModel(state, 5, -1, { x, y: 0 });
    assert.ok(model.probability > previous);
    assert.ok(model.probability > 0 && model.probability < 1, 'no legal shot is a guaranteed goal or save');
    previous = model.probability;
  }
});

test('mirror-image shots have matching geometry and probabilities at either goal', () => {
  const upper = fixture({ phase: 'kick', positions: { 'white-R1': [5, 6], 'black-K': [7, 1] } });
  const lower=fixture({phase:'kick',attack:'black',carrier:'black-R1',positions:{'black-R1':[8,BOARD_HEIGHT-7],'white-K':[6,BOARD_HEIGHT-2]}});
  const a = shotModel(upper, 5, -1), b = shotModel(lower, 8, BOARD_HEIGHT);
  for (const key of ['probability', 'goalProbability', 'saveProbability', 'missProbability', 'onTargetProbability', 'saveGivenOnTarget', 'distance', 'shotAngleDegrees', 'keeperPathDistance', 'timeToKeeper', 'reach', 'arrivalSpeed', 'keeperStretch', 'parryGivenSave', 'cornerProbability', 'caughtSaveProbability']) almostEqual(a[key], b[key], key);
  assert.equal(a.keeperInBox, b.keeperInBox);
  assert.deepEqual(b.target,{x:8,y:BOARD_HEIGHT-.5});
  almostEqual(a.closestPoint.x,BOARD_WIDTH-1-b.closestPoint.x);
  almostEqual(a.closestPoint.y,BOARD_HEIGHT-1-b.closestPoint.y);
});

test('angled shots have a lower on-target probability than straight shots', () => {
  const state = fixture({ phase: 'kick', positions: { 'white-R1': [7, 7], 'black-K': [5, 10] } });
  const straight = shotModel(state, 7, -1), angled = shotModel(state, 5, -1);
  assert.equal(straight.shotAngleDegrees, 0);
  almostEqual(angled.distance, Math.hypot(2, 7.5));
  almostEqual(angled.shotAngleDegrees, Math.atan2(2, 7.5) * 180 / Math.PI);
  assert.ok(angled.onTargetProbability < straight.onTargetProbability);
  almostEqual(angled.onTargetProbability,Math.max(.01,Math.min(.98,.98*1.15*Math.exp(-.018*angled.distance-.03*(angled.distance-3)**2)*(.65+.35*Math.cos(angled.shotAngleDegrees*Math.PI/180))*angled.postAngleFactor*angled.wideAngleFactor*angled.centralLaneFactor)));
});

test('the keeper is compared with the finite shot segment and cannot save from behind the shooter', () => {
  const state = fixture({ phase: 'kick', positions: { 'white-R1': [5, 6], 'black-K': [6, 8] } });
  const model = shotModel(state, 5, -1);
  assert.deepEqual(model.closestPoint, { x: 5, y: 6 });
  almostEqual(model.keeperPathDistance, Math.sqrt(5));
  assert.equal(model.timeToKeeper, 0);
  assert.equal(model.saveGivenOnTarget, 0);
  assert.equal(model.saveProbability, 0);
  assert.equal(model.probability, model.onTargetProbability);
  const inFront = shotModel(state, 5, -1, { x: 6, y: 4 });
  assert.deepEqual(inFront.closestPoint, { x: 5, y: 4 });
  assert.equal(inFront.keeperPathDistance, 1);
  assert.ok(inFront.timeToKeeper > 0);
  assert.equal(inFront.saveGivenOnTarget, 0, 'being in front is insufficient while outside the own box');
  const inBox = shotModel(state, 5, -1, { x: 6, y: 1 });
  assert.deepEqual(inBox.closestPoint, { x: 5, y: 1 });
  assert.equal(inBox.keeperPathDistance, 1);
  assert.ok(inBox.timeToKeeper > inFront.timeToKeeper);
  assert.ok(inBox.saveGivenOnTarget > 0, 'a keeper in front and inside its own box can save');
});

test('only the defending keeper own box grants any saving reach or readiness', () => {
  const state = fixture({ phase: 'kick', positions: { 'white-R1': [5, 7], 'black-K': [5, 1] } });
  const inBox = shotModel(state, 5, -1);
  const outside=shotModel(state,5,-1,{x:5,y:BOX_DEPTH});
  assert.equal(inBox.keeperInBox, true);
  assert.equal(outside.keeperInBox, false);
  assert.ok(inBox.reach > outside.reach);
  assert.ok(inBox.saveGivenOnTarget > outside.saveGivenOnTarget);
  assert.ok(inBox.probability < outside.probability);
  assert.equal(outside.reach, 0);
  assert.equal(outside.saveGivenOnTarget, 0);
  const otherBox=shotModel(state,5,-1,{x:5,y:BOARD_HEIGHT-1});
  assert.equal(otherBox.keeperInBox, false, 'the opponent box is not the keeper own box');
  assert.equal(otherBox.reach, 0);
  assert.equal(otherBox.saveProbability, 0);
});

test('shot model probabilities stay finite and total one across all goals and keeper squares', () => {
  for (const attack of ['white', 'black']) {
    const shooter = `${attack}-R1`, keeper = `${attack === 'white' ? 'black' : 'white'}-K`;
    for (const origin of [[3, 2], [6, 7], [10, 12]]) {
      const state=fixture({phase:'kick',attack,carrier:shooter,positions:{[shooter]:origin,[keeper]:[6,attack==='white'?0:BOARD_HEIGHT-1]}});
      for(const x of GOAL_FILES)for(const position of [{x:4,y:0},{x:9,y:1},{x:10,y:8},{x:4,y:BOARD_HEIGHT-1}]){
        const model=shotModel(state,x,attack==='white'?-1:BOARD_HEIGHT,position);
        assert.equal(model.modelVersion,13);assert.ok(model.distance>0,'each sampled goal is the current external goal plane');
        for (const key of ['probability', 'saveProbability', 'missProbability', 'onTargetProbability', 'saveGivenOnTarget', 'keeperStretch', 'parryGivenSave', 'cornerProbability', 'caughtSaveProbability']) assert.ok(Number.isFinite(model[key]) && model[key] >= 0 && model[key] <= 1, key);
        for (const key of ['distance', 'keeperPathDistance', 'timeToKeeper', 'reach', 'shotAngleDegrees']) assert.ok(Number.isFinite(model[key]) && model[key] >= 0, key);
        almostEqual(model.goalProbability + model.saveProbability + model.missProbability + model.blockProbability, 1);
        almostEqual(model.goalProbability + model.keeperCornerProbability + model.caughtSaveProbability + model.missProbability + model.blockProbability, 1);
        assert.ok(model.arrivalSpeed >= 0 && model.arrivalSpeed <= SHOT_MODEL.ballSpeed);
        assert.ok(model.parryGivenSave <= SHOT_MODEL.parryMax);
        if (model.saveProbability > 0) assert.ok(model.parryGivenSave >= SHOT_MODEL.parryMin);
      }
    }
  }
});

test('one seeded shot roll partitions exact goal, parried corner, caught save and wide boundaries', () => {
  const reaction = declaredShot({ x: 5, keeper: [6, 0] });
  const model = shotModel(reaction), epsilon = 1e-7;
  assert.equal(model.blockProbability,0,'this keeper-only fixture isolates goal, parry, catch and wide intervals');
  const cornerStart = model.goalProbability, caughtStart = cornerStart + model.cornerProbability, wideStart = model.onTargetProbability;
  assert.ok(model.cornerProbability > epsilon && model.caughtSaveProbability > epsilon);
  const cases = [
    [0, 'goal'], [cornerStart - epsilon, 'goal'],
    [cornerStart, 'corner'], [cornerStart + epsilon, 'corner'], [caughtStart - epsilon, 'corner'],
    [caughtStart, 'saved'], [caughtStart + epsilon, 'saved'], [wideStart - epsilon, 'saved'],
    [wideStart, 'wide'], [wideStart + epsilon, 'wide'], [.999999, 'wide'],
  ];
  const randomStates = new Set();
  for (const [roll, outcome] of cases) {
    const before = clone(reaction);
    const result = skipMove(reaction, { roll });
    assert.deepEqual(reaction, before, 'resolution preserves the saved reaction snapshot');
    assert.equal(result.lastAction.outcome, outcome, `roll ${roll}`);
    assert.equal(result.pendingShot, null);
    assert.equal(result.turn, reaction.turn + 1);
    assert.deepEqual(result.lastAction.shotModel, model);
    assert.equal(result.lastAction.roll, roll);
    randomStates.add(result.randomState);
    assert.deepEqual(result.score, { white: outcome === 'goal' ? 1 : 0, black: 0 });
    if (outcome === 'goal') {
      assert.equal(result.attack, 'black');
      assert.equal(result.phase, 'kickoff');
      assert.equal(result.ball.carrierId, 'black-Q');
      assert.equal(result.lastAction.type, 'goal');
    } else if (outcome === 'corner') {
      assert.equal(result.attack, 'white');
      assert.equal(result.phase, 'cornerSelect');
      assert.equal(result.restart.type, 'corner');
      assert.equal(result.restart.team, 'white');
      assert.equal(result.lastAction.type, 'save');
      assert.equal(result.lastAction.tippedOut, true);
      assert.deepEqual(result.positionBudget, freshBudget());
    } else {
      assert.equal(result.attack, 'black');
      assert.equal(result.phase, 'attackMove', 'caught saves and goal kicks permit positioning');
      assert.equal(result.ball.carrierId, 'black-K');
      assert.equal(result.lastAction.type, outcome === 'saved' ? 'save' : 'shotMiss');
      assert.equal(result.releaseReason, null);
      if (outcome === 'saved') {
        assert.equal(result.restart, null);
        assert.deepEqual(result.pieces, reaction.pieces, 'a caught save preserves all piece positions');
      } else {
        assert.equal(result.restart.type, 'goalKick');
        assert.equal(result.restart.team, 'black');
        assert.equal(result.restart.takerId, 'black-K');
        assert.equal(result.restart.indirect, false);
        assert.deepEqual(result.ball, { ...result.restart.spot, carrierId: result.restart.takerId });
        for (const player of result.pieces.filter(p => p.id !== result.restart.takerId)) {
          assert.deepEqual(player, reaction.pieces.find(p => p.id === player.id), 'a restart relocates only its taker');
        }
      }
      assert.deepEqual(result.positionBudget, freshBudget());
    }
    assertIntegrity(result);
  }
  assert.equal(randomStates.size, 1, 'all four short-shot outcomes consume exactly one seeded draw');
  assert.notEqual([...randomStates][0], reaction.randomState);
});

test('a wide shot gives both teams protected positioning before the defending king passes', () => {
  for (const attack of ['white', 'black']) {
    const white = attack === 'white', defending = white ? 'black' : 'white', keeperId = `${defending}-K`;
    const reaction = declaredShot({ x: 5, keeper: [9, 7], attack });
    const result = skipMove(reaction, { roll: .999999 });
    const keeper = result.pieces.find(p => p.id === keeperId);
    assert.equal(result.phase, 'attackMove');
    assert.equal(result.releaseReason, null);
    assert.equal(result.restart.type, 'goalKick');
    assert.equal(result.restart.team, defending);
    assert.equal(result.restart.takerId, keeperId, 'only the king takes a goal kick');
    assert.equal(result.lastAction.type, 'shotMiss');
    assert.equal(result.lastAction.outcome, 'wide');
    assert.deepEqual(result.score, reaction.score);
    assert.equal(isBox(keeper.x, keeper.y), true, 'goal-kick taker is inside its own goal box');
    assert.ok(white?keeper.y<BOX_DEPTH:keeper.y>=BOARD_HEIGHT-BOX_DEPTH,'the restart is at the defending end');
    for (const p of result.pieces.filter(p => p.id !== keeperId)) assert.deepEqual(p, reaction.pieces.find(q => q.id === p.id));
    assert.deepEqual(result.ball, { x: keeper.x, y: keeper.y, carrierId: keeperId });
    assert.equal(currentTeam(result), defending);
    assert.deepEqual(legalMoves(result, keeperId), [], 'the taker cannot dribble before taking the restart');
    assert.throws(() => applyMove(result, keeperId, keeper.x - 1, keeper.y));
    assert.deepEqual(legalKicks(result), [], 'the king cannot kick before positioning finishes');
    const opponentPositioning = skipMove(result);
    assert.equal(opponentPositioning.phase, 'defendMove');
    assert.equal(currentTeam(opponentPositioning), attack);
    const ready = skipMove(opponentPositioning);
    assert.equal(ready.phase, 'kick');
    const kicks = legalKicks(ready);
    assert.equal(kicks.some(k => k.goal), false, 'a goal kick must be distributed rather than shot directly');
    const kick = kicks.find(k => !k.goal && k.accuracy === 1 && !k.receiverId);
    assert.ok(kick);
    const released = applyKick(ready, kick.x, kick.y, { roll: 0 });
    assert.equal(released.releaseReason, null);
    assert.equal(released.restart, null, 'the restart ends when its kick is taken');
    assertIntegrity(result);
    assertIntegrity(released);
  }
});

test('keeper AI chooses the reaction with the smallest current shot probability', () => {
  const reaction = declaredShot({ x: 5, keeper: [7, 0] });
  const before = clone(reaction);
  const choices = [shotChance(reaction), ...legalMoves(reaction, 'black-K').map(move => shotChance(reaction, 5, -1, move))];
  const action = chooseAIAction(reaction);
  const selected = action.type === 'move' ? shotChance(reaction, 5, -1, { x: action.x, y: action.y }) : shotChance(reaction);
  almostEqual(selected, Math.min(...choices));
  assert.deepEqual(reaction, before);
});

test('the lower goal credits black and restarts with white kickoff', () => {
  const reaction=declaredShot({x:8,keeper:[5,BOARD_HEIGHT-1],attack:'black'});
  const result = skipMove(reaction, { roll: 0 });
  assert.deepEqual(result.score, { white: 0, black: 1 });
  assert.equal(result.phase, 'kickoff');
  assert.equal(result.attack, 'white');
  assertIntegrity(result);
});

test('a loose ball can be collected and defensive collection resets all positioning actions', () => {
  for (const [phase, team] of [['attackMove', 'white'], ['defendMove', 'black']]) {
    const id = `${team}-N1`;
    const state = fixture({ phase, carrier: null, positions: { [id]: [5, 7] }, ball: { x: 6, y: 5, carrierId: null }, budget: { normalUsed: false, pawnUsed: true, dribbleUsed: false } });
    const next = applyMove(state, id, 6, 5);
    assert.equal(next.ball.carrierId, id);
    assert.equal(next.attack, team);
    assert.equal(next.phase, 'attackMove');
    assert.deepEqual(next.positionBudget, phase === 'defendMove' ? freshBudget() : { normalUsed: true, pawnUsed: true, dribbleUsed: false });
    if (phase === 'attackMove') {
      assert.ok(positionActions(next).dribbleAvailable, 'collecting retains the independent dribble action');
      assert.equal(skipMove(next).phase, 'defendMove', 'the attacker may decline the remaining dribble');
    }
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

test('knights score only when a single L-shaped kick lands on a goal square', () => {
  for (const attack of ['white', 'black']) {
    const mirror=([x,y])=>attack==='white'?[x,y]:[BOARD_WIDTH-1-x,BOARD_HEIGHT-1-y];
    const defending = attack === 'white' ? 'black' : 'white';
    for (const [origin, blockers] of [
      [[4,1],[[4,0],[5,1]]],
      [[3,0],[[4,0],[4,1]]],
    ]) {
      const carrier = `${attack}-N1`, keeper = `${defending}-K`;
      const [x,y]=mirror([5,-1]);
      const state = fixture({
        phase: 'kick', attack, carrier,
        positions: {
          [carrier]:mirror(origin),[keeper]:mirror([7,0]),
          // Defenders occupy legal box squares beside the jump; the four
          // goal-front cells themselves are reserved for the goalkeeper.
          [`${defending}-N1`]:mirror(blockers[0]),
          [`${defending}-N2`]:mirror(blockers[1]),
        },
      });
      assertIntegrity(state);
      const goals = legalKicks(state).filter(kick => kick.goal);
      assert.equal(goals.length, 1, 'only the reachable goal file is offered');
      const kick = goals[0];
      assert.deepEqual({ x: kick.x, y: kick.y }, { x, y });
      const dx = Math.abs(kick.x - state.ball.x), dy = Math.abs(kick.y - state.ball.y);
      assert.deepEqual([dx, dy].sort(), [1, 2]);
      assert.equal(kick.path.length, 2, 'jump path contains only origin and target');
      assert.ok(kick.shotModel.distance < 3, 'short knight shot avoids the extra distance penalty');
      const reaction = applyKick(state, x, y);
      assert.equal(reaction.phase, 'keeperReact', 'jumping the blockers still allows the keeper reaction');
      assert.equal(currentTeam(reaction), defending);
      assert.deepEqual(reaction.lastAction.shotModel, shotModel(state, x, y));
      const move = legalMoves(reaction, keeper)[0];
      assert.ok(move, 'defending keeper has a reaction move');
      const expected = shotModel(reaction, x, y, move);
      const result = applyMove(reaction, keeper, move.x, move.y, { roll: 0 });
      assert.deepEqual(result.lastAction.shotModel, expected, 'the knight chip modifier and keeper reaction are retained during resolution');
      assert.equal(result.lastAction.outcome, 'goal');
      assert.equal(result.score[attack], 1);
      assertIntegrity(result);
    }
    const midfield = fixture({ phase: 'kick', attack, carrier: `${attack}-N1`, positions: { [`${attack}-N1`]: [5, 7] } });
    assert.deepEqual(legalKicks(midfield).filter(kick => kick.goal), [], 'a knight cannot extend or repeat its L to shoot from midfield');
  }
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
    const y=team==='white'?0:BOARD_HEIGHT-1;
    const border = fixture({ phase: 'kick', attack: team, carrier, positions: { [carrier]: [2, y] } });
    assert.ok(legalKicks(border).length > 0);
    assert.equal(hasKick(border,2,y===0?1:BOARD_HEIGHT-2),true,'pawn can kick back onto the pitch');
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
  shotModel(reaction);
  shotChance(reaction);
  for(const move of legalMoves(reaction,'black-K'))shotModel(reaction,5,-1,move);
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
  const reaction=declaredShot({x:5,keeper:[7,0]});
  const resolved = applyAction(reaction, chooseAIAction(reaction));
  assert.notEqual(resolved.phase, 'keeperReact');
  assertIntegrity(resolved);
  const backpass=fixture({phase:'kick',positions:{'white-R1':[5,10]}});
  const release=applyKick(backpass,5,BOARD_HEIGHT-1);
  const action = chooseAIAction(release);
  assert.equal(action.type, 'kick');
  assertIntegrity(applyAction(release, action));
  const goalKick = skipMove(declaredShot({ keeper: [8, 7] }), { roll: .999999 });
  assert.equal(goalKick.restart.type, 'goalKick');
  assert.equal(goalKick.releaseReason, null);
  assert.equal(goalKick.lastAction.type, 'shotMiss');
  const ready = skipMove(skipMove(goalKick));
  const goalKickAction = chooseAIAction(ready);
  assert.equal(goalKickAction.type, 'kick', 'the AI distributes once both teams have repositioned');
  const goalKickReleased = applyAction(ready, goalKickAction);
  assertIntegrity(goalKickReleased);
  assert.equal(goalKickReleased.restart, null, 'taking the required pass completes the restart');
  assert.equal(goalKickReleased.releaseReason, null);
});

test('AI remains legal across extended play, every phase and the expanded positioning budget', () => {
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
  const state=fixture({phase:'kick',positions:{'white-R1':[5,4],'black-K':[6,0]},seed:983});
  const reaction=applyKick(state,5,-1);
  assert.equal(reaction.randomState, state.randomState);
  const result = skipMove(reaction);
  assert.notEqual(result.randomState, reaction.randomState);
  assert.equal(result.pendingShot, null);
  assert.deepEqual(skipMove(reaction), result, 'saved reaction state reproduces the outcome');
});

test('different seeds produce reproducible goals, corners, caught saves and wide shots', () => {
  const outcomes = new Set();
  for(const seed of Array.from({length:32},(_,index)=>index*1000)){
    const state=fixture({phase:'kick',positions:{'white-R1':[5,4],'black-K':[6,0]},seed});
    const reaction=applyKick(state,5,-1);
    const result = skipMove(reaction);
    assert.deepEqual(skipMove(reaction), result);
    outcomes.add(result.lastAction.outcome);
    assertIntegrity(result);
  }
  assert.deepEqual([...outcomes].sort(), ['corner', 'goal', 'saved', 'wide']);
});

test('an own goal credits the other side and gives the conceding side kickoff', () => {
  const state=fixture({phase:'kick',positions:{'white-R1':[8,BOARD_HEIGHT-5]}});
  const reaction=applyKick(state,8,BOARD_HEIGHT);
  assert.equal(currentTeam(reaction), 'white');
  const result = skipMove(reaction, { roll: 0 });
  assert.deepEqual(result.score, { white: 0, black: 1 });
  assert.equal(result.phase, 'kickoff');
  assert.equal(result.attack, 'white');
  assert.equal(result.lastAction.ownGoal, true);
  assertIntegrity(result);
});
