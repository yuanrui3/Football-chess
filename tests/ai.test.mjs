import test from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import {
  BOARD_WIDTH, BOARD_HEIGHT, isBox, AI_DIFFICULTIES,
  createGame, currentTeam, chooseAIAction, legalMoves, legalKicks,
  applyMove, applyKick, skipMove, shotChance,
} from '../dist/engine.js';

const DIFFICULTIES = ['casual', 'tactical'];
const clone = value => JSON.parse(JSON.stringify(value));
const freshBudget = () => ({ normalUsed: false, pawnUsed: false });

// Use complete teams even in focused scenarios. Parking at either touchline
// avoids accidental occupants in the central combinations being examined.
function fixture({ phase = 'attackMove', attack = 'white', carrier = 'white-R1', positions = {}, ball, budget, seed = 17, clear = [] } = {}) {
  const state = createGame({ mode: 'solo', kickoff: attack, seed });
  const assigned = { 'white-K': [4, 14], 'black-K': [7, 0], 'white-R1': [2, 10], ...positions };
  const occupied = new Set(Object.values(assigned).map(([x, y]) => `${x},${y}`));
  assert.equal(occupied.size, Object.keys(assigned).length, 'fixture overrides do not overlap');
  for (const [x, y] of clear) occupied.add(`${x},${y}`);
  const parking = Array.from({ length: BOARD_HEIGHT }, (_, y) => [[0, y], [11, y]]).flat();
  for (const piece of state.pieces) {
    const location = assigned[piece.id] || parking.find(([x, y]) => !occupied.has(`${x},${y}`));
    assert.ok(location, `parking exists for ${piece.id}`);
    [piece.x, piece.y] = location;
    occupied.add(`${piece.x},${piece.y}`);
  }
  state.phase = phase;
  state.attack = attack;
  state.positionBudget = budget || freshBudget();
  const owner = state.pieces.find(piece => piece.id === carrier);
  state.ball = ball || { x: owner.x, y: owner.y, carrierId: carrier };
  return state;
}

function reactionFixture() {
  const state = fixture({ phase: 'kick', positions: { 'white-R1': [4, 4], 'black-K': [6, 0] } });
  return applyKick(state, 4, -1);
}

function restartFixture(type, phase = 'attackMove') {
  const takerId = type === 'goalKick' ? 'white-K' : 'white-R1';
  const spot = type === 'goalKick' ? { x: 5, y: 14 }
    : type === 'corner' ? { x: 0, y: 0 }
      : type === 'throwIn' ? { x: 0, y: 7 }
        : { x: 5, y: 7 };
  const state = fixture({ phase, carrier: takerId, positions: { [takerId]: [spot.x, spot.y] } });
  state.restart = { type, team: 'white', takerId, spot, indirect: type === 'offside' };
  return state;
}

function scenarios() {
  const reaction = reactionFixture();
  const backPass = applyKick(fixture({ phase: 'kick', positions: { 'white-R1': [4, 10] } }), 4, 14);
  const goalKick = skipMove(reaction, { roll: 0.999999 });
  return [
    ['white kick-off', createGame({ kickoff: 'white', seed: 17 })],
    ['black kick-off', createGame({ kickoff: 'black', seed: 17 })],
    ['attack with both moves', fixture({ positions: { 'white-P1': [8, 8], 'black-P1': [8, 5] } })],
    ['defence with both moves', fixture({ phase: 'defendMove', positions: { 'white-R1': [4, 7], 'black-N1': [6, 8], 'black-P1': [8, 5] } })],
    ['attack with only bonus pawn remaining', fixture({ budget: { normalUsed: true, pawnUsed: false }, positions: { 'white-P1': [8, 8] } })],
    ['defence with only bonus pawn remaining', fixture({ phase: 'defendMove', budget: { normalUsed: true, pawnUsed: false }, positions: { 'black-P1': [8, 8] } })],
    ['attack with only normal move remaining', fixture({ budget: { normalUsed: false, pawnUsed: true }, positions: { 'white-P1': [8, 8] } })],
    ['defence with only normal move remaining', fixture({ phase: 'defendMove', budget: { normalUsed: false, pawnUsed: true }, positions: { 'black-P1': [8, 8] } })],
    ['ordinary kick', fixture({ phase: 'kick', positions: { 'white-R1': [4, 6], 'black-K': [6, 0] } })],
    ['long pass decision', fixture({ phase: 'kick', positions: { 'white-R1': [2, 13], 'white-P1': [2, 0] } })],
    ['loose ball attack', fixture({ ball: { x: 6, y: 5, carrierId: null }, positions: { 'white-N1': [5, 7] } })],
    ['loose ball defence', fixture({ phase: 'defendMove', ball: { x: 6, y: 5, carrierId: null }, positions: { 'black-N1': [5, 7] } })],
    ['knight tackle', fixture({ phase: 'defendMove', carrier: 'white-N1', positions: { 'white-N1': [5, 7], 'black-R1': [5, 3] } })],
    ['keeper reaction', reaction],
    ['back-pass immediate release', backPass],
    ['wide shot goal-kick round', goalKick],
    ...['goalKick', 'corner', 'throwIn', 'offside'].flatMap(type =>
      ['attackMove', 'defendMove', 'kick'].map(phase => [`${type} restart ${phase}`, restartFixture(type, phase)])),
  ];
}

function assertIntegrity(state) {
  assert.equal(state.pieces.length, 22, 'all players remain on the pitch');
  assert.equal(new Set(state.pieces.map(piece => piece.id)).size, 22);
  assert.equal(new Set(state.pieces.map(piece => `${piece.x},${piece.y}`)).size, 22, 'players occupy distinct squares');
  for (const team of ['white', 'black']) {
    assert.equal(state.pieces.filter(piece => piece.team === team).length, 11);
    assert.deepEqual(state.pieces.filter(piece => piece.team === team).map(piece => piece.type).sort(), ['K', 'Q', 'R', 'R', 'B', 'B', 'N', 'N', 'P', 'P', 'P'].sort());
  }
  for (const piece of state.pieces) {
    assert.ok(piece.x >= 0 && piece.x < BOARD_WIDTH && piece.y >= 0 && piece.y < BOARD_HEIGHT, `${piece.id} stays on the pitch`);
    if (isBox(piece.x, piece.y)) assert.ok(['K', 'N'].includes(piece.type), 'only kings and knights occupy goal areas');
  }
  if (state.ball.carrierId) {
    const carrier = state.pieces.find(piece => piece.id === state.ball.carrierId);
    assert.ok(carrier);
    assert.deepEqual({ x: state.ball.x, y: state.ball.y }, { x: carrier.x, y: carrier.y });
    assert.equal(carrier.team, state.attack);
  }
  if (['attackMove', 'defendMove'].includes(state.phase)) {
    assert.equal(typeof state.positionBudget.normalUsed, 'boolean');
    assert.equal(typeof state.positionBudget.pawnUsed, 'boolean');
    assert.equal(state.positionBudget.normalUsed && state.positionBudget.pawnUsed, false);
  }
  if (state.phase === 'keeperReact') assert.ok(state.pendingShot);
  if (state.phase === 'keeperRelease') {
    assert.equal(state.releaseReason, 'backPass');
    assert.equal(state.pieces.find(piece => piece.id === state.ball.carrierId)?.type, 'K');
  } else assert.equal(state.releaseReason, null);
  if (state.restart) {
    assert.ok(['attackMove', 'defendMove', 'kick'].includes(state.phase), 'restart proceeds through a full round before its kick');
    assert.equal(state.restart.team, state.attack);
    assert.equal(state.restart.takerId, state.ball.carrierId);
    assert.deepEqual({ x: state.ball.x, y: state.ball.y }, state.restart.spot);
    assert.deepEqual(legalMoves(state, state.restart.takerId), [], 'restart taker cannot dribble');
    for (const piece of state.pieces) {
      assert.equal(legalMoves(state, piece.id).some(move => move.type === 'tackle'), false, 'dead-ball restarts cannot be tackled');
    }
    if (state.restart.type === 'throwIn' && state.phase === 'kick') {
      for (const kick of legalKicks(state)) {
        assert.ok(kick.distance <= 10, 'AI throw targets stay within the hard limit');
        assert.equal(!!kick.goal, false, 'a throw cannot score directly');
      }
    }
    if (state.restart.indirect) assert.equal(legalKicks(state).some(kick => kick.goal), false, 'offside restart cannot score directly');
  }
}

function selectedMove(state, action) {
  if (action.type !== 'move') return null;
  return legalMoves(state, action.pieceId, { freePawn: !!action.freePawn }).find(move => move.x === action.x && move.y === action.y);
}

function applyAction(state, action, overrides = {}) {
  assert.ok(action && typeof action === 'object', 'AI returns an action');
  if (action.type === 'move') {
    assert.ok(selectedMove(state, action), 'AI move is offered by the shared rules engine');
    const piece = state.pieces.find(candidate => candidate.id === action.pieceId);
    assert.ok(Math.max(Math.abs(action.x - piece.x), Math.abs(action.y - piece.y)) <= 10);
    return applyMove(state, action.pieceId, action.x, action.y, { freePawn: !!action.freePawn, ...overrides });
  }
  if (action.type === 'kick') {
    assert.ok(legalKicks(state).some(kick => kick.x === action.x && kick.y === action.y), 'AI kick is offered by the shared rules engine');
    return applyKick(state, action.x, action.y, overrides);
  }
  assert.equal(action.type, 'skip');
  assert.ok(['attackMove', 'defendMove', 'keeperReact'].includes(state.phase) || !state.ball.carrierId, 'AI only skips a skippable phase');
  return skipMove(state, overrides);
}

function assertPureChoice(state, difficulty) {
  const before = clone(state);
  const action = chooseAIAction(state, { difficulty });
  assert.deepEqual(state, before, `${difficulty} planning preserves the complete undo snapshot and PRNG`);
  return action;
}

test('two named levels preserve the previous default and reject unknown levels safely', () => {
  assert.deepEqual(AI_DIFFICULTIES, DIFFICULTIES);
  for (const [name, state] of scenarios().filter(([name]) => ['white kick-off', 'attack with both moves', 'keeper reaction'].includes(name))) {
    const casual = chooseAIAction(state, { difficulty: 'casual' });
    assert.deepEqual(chooseAIAction(state), casual, `${name}: omitted options preserve Casual`);
    for (const difficulty of ['impossible', '', null, 4]) assert.deepEqual(chooseAIAction(state, { difficulty }), casual, `${name}: invalid difficulty falls back to Casual`);
  }
  for (const difficulty of DIFFICULTIES) assert.deepEqual(chooseAIAction({ ...createGame(), phase: 'finished' }, { difficulty }), { type: 'skip' });
});

for (const difficulty of DIFFICULTIES) {
  test(`${difficulty}: legal and pure across every phase and positioning budget`, t => {
    const timings = [];
    for (const [name, state] of scenarios()) {
      assertIntegrity(state);
      const start = performance.now();
      const action = assertPureChoice(state, difficulty);
      timings.push(performance.now() - start);
      const next = applyAction(state, action);
      assertIntegrity(next);
      if (state.phase === 'keeperRelease') assert.equal(action.type, 'kick', `${name}: release cannot be delayed`);
      if (['attackMove', 'defendMove'].includes(state.phase) && action.type === 'move') {
        if (state.positionBudget.normalUsed) {
          assert.equal(action.freePawn, true, `${name}: spent normal move cannot be reused`);
          assert.equal(state.pieces.find(piece => piece.id === action.pieceId).type, 'P');
        }
        if (state.positionBudget.pawnUsed) assert.equal(!!action.freePawn, false, `${name}: spent bonus move cannot be reused`);
      }
    }
    const sorted = [...timings].sort((a, b) => a - b);
    t.diagnostic(`${timings.length} representative decisions: median ${sorted[Math.floor(sorted.length / 2)].toFixed(1)} ms; maximum ${Math.max(...timings).toFixed(1)} ms`);
  });

  test(`${difficulty}: hidden outcome seeds never change a visible-board decision`, () => {
    for (const [name, state] of scenarios().filter(([name]) => ['white kick-off', 'attack with both moves', 'defence with only normal move remaining', 'long pass decision', 'knight tackle', 'keeper reaction', 'back-pass immediate release', 'wide shot goal-kick round'].includes(name))) {
      const baseline = assertPureChoice(state, difficulty);
      for (const randomState of [0, 0xffffffff, 123456789]) {
        const differentFuture = { ...state, randomState };
        assert.deepEqual(assertPureChoice(differentFuture, difficulty), baseline, `${name}: policy must not peek at the upcoming PRNG outcome`);
      }
    }
  });

  test(`${difficulty}: keeper chooses the minimum scoring chance using the same reaction rules`, () => {
    const state = reactionFixture();
    const action = assertPureChoice(state, difficulty);
    const options = [shotChance(state), ...legalMoves(state, 'black-K').map(move => shotChance(state, state.pendingShot.x, state.pendingShot.y, move))];
    const chosen = action.type === 'move' ? shotChance(state, state.pendingShot.x, state.pendingShot.y, action) : shotChance(state);
    assert.ok(Math.abs(chosen - Math.min(...options)) < 1e-10, 'difficulty never adds goalkeeper reach or changes shot odds');
  });

  test(`${difficulty}: a chosen knight tackle has both fair 50% outcomes`, () => {
    const state = fixture({ phase: 'defendMove', carrier: 'white-N1', positions: { 'white-N1': [5, 7], 'black-R1': [5, 3] }, budget: { normalUsed: false, pawnUsed: true } });
    const action = assertPureChoice(state, difficulty);
    const move = selectedMove(state, action);
    assert.equal(move?.type, 'tackle', 'take the available possession-winning tackle');
    assert.equal(move.tackleProbability, 0.5);
    const success = applyAction(state, action, { roll: 0.499999 });
    const failure = applyAction(state, action, { roll: 0.5 });
    assert.equal(success.ball.carrierId, action.pieceId);
    assert.equal(failure.ball.carrierId, 'white-N1');
    assert.equal(success.lastAction.probability, 0.5);
    assert.equal(failure.lastAction.probability, 0.5);
    assert.equal(success.randomState, failure.randomState, 'either outcome consumes the same single real random draw');
    assertIntegrity(success);
    assertIntegrity(failure);
  });

  test(`${difficulty}: full-roster play remains legal for 140 consecutive actions`, t => {
    let state = createGame({ seed: 912, kickoff: difficulty === 'casual' ? 'white' : 'black' });
    const phases = new Set();
    let bonusMoves = 0;
    const timings = [];
    for (let index = 0; index < 140; index++) {
      phases.add(state.phase);
      const start = performance.now();
      const action = assertPureChoice(state, difficulty);
      timings.push(performance.now() - start);
      if (action.freePawn) bonusMoves++;
      state = applyAction(state, action);
      assertIntegrity(state);
    }
    for (const phase of ['kickoff', 'attackMove', 'defendMove', 'kick']) assert.ok(phases.has(phase), `${phase} occurs during ordinary play`);
    assert.ok(bonusMoves > 0, 'bonus pawn moves are used');
    const sorted = [...timings].sort((a, b) => a - b);
    t.diagnostic(`140 legal actions; ${bonusMoves} bonus moves; score ${state.score.white}–${state.score.black}; median ${sorted[70].toFixed(1)} ms; p95 ${sorted[Math.floor(sorted.length * .95)].toFixed(1)} ms; maximum ${Math.max(...timings).toFixed(1)} ms`);
  });
}

// Swap the two levels between colors for each seed, so each level gets one
// first kick-off. This is a reproducible integration smoke test, not an Elo test.
test('mixed-level matches remain legal with swapped colors and identical match seeds', t => {
  const reports = [];
  for (const seed of [17, 2026]) for (const tacticalTeam of ['white', 'black']) {
    let state = createGame({ seed, kickoff: 'white' });
    let shots = 0, goals = 0, tackles = 0;
    for (let index = 0; index < 120; index++) {
      const difficulty = currentTeam(state) === tacticalTeam ? 'tactical' : 'casual';
      state = applyAction(state, assertPureChoice(state, difficulty));
      assertIntegrity(state);
      shots += state.lastAction?.type === 'shotAttempt';
      goals += state.lastAction?.type === 'goal';
      tackles += state.lastAction?.type === 'tackle';
    }
    reports.push({ seed, tacticalTeam, score: state.score, shots, goals, tackles });
  }
  t.diagnostic(`Four 120-action mixed-level smoke matches (no strength assertion): ${JSON.stringify(reports)}`);
});

function mirroredState(state) {
  const swapTeam = team => team === 'white' ? 'black' : 'white';
  const swapId = id => id?.replace(/^(white|black)/, swapTeam) ?? null;
  return {
    ...clone(state),
    attack: swapTeam(state.attack),
    score: { white: state.score.black, black: state.score.white },
    pieces: state.pieces.map(piece => ({ ...piece, id: swapId(piece.id), team: swapTeam(piece.team), x: BOARD_WIDTH - 1 - piece.x, y: BOARD_HEIGHT - 1 - piece.y })),
    ball: { x: BOARD_WIDTH - 1 - state.ball.x, y: BOARD_HEIGHT - 1 - state.ball.y, carrierId: swapId(state.ball.carrierId) },
  };
}

function guaranteedTackles(state) {
  return state.pieces.filter(piece => piece.team === currentTeam(state)).flatMap(piece =>
    legalMoves(state, piece.id).filter(move => move.type === 'tackle' && move.tackleProbability === 1)
      .map(move => ({ type: 'move', pieceId: piece.id, x: move.x, y: move.y, freePawn: false })));
}

test('Tactical avoids an attacking dribble exposed to an immediate short-range queen reply, at either end', () => {
  const original = fixture({
    carrier: 'white-B1',
    positions: { 'white-B1': [9, 7], 'white-R1': [9, 10], 'black-R1': [8, 2] },
    budget: { normalUsed: false, pawnUsed: true },
  });
  for (const state of [original, mirroredState(original)]) {
    const casualAction = assertPureChoice(state, 'casual');
    const casualNext = applyAction(state, casualAction);
    assert.equal(casualNext.phase, 'defendMove');
    const replies = guaranteedTackles(casualNext);
    assert.ok(replies.length, 'the greedy attack has a concrete legal possession-losing reply');
    assert.ok(replies.some(reply => {
      const defender = casualNext.pieces.find(piece => piece.id === reply.pieceId);
      return defender.type === 'Q' && Math.max(Math.abs(defender.x - casualNext.ball.x), Math.abs(defender.y - casualNext.ball.y)) <= 5;
    }), 'the refutation uses the new five-square tackle reach');
    const refutation = applyAction(casualNext, replies[0]);
    assert.notEqual(refutation.attack, state.attack);
    assert.equal(refutation.ball.carrierId, replies[0].pieceId, 'the opponent wins the ball without relying on randomness');

    const tacticalAction = assertPureChoice(state, 'tactical');
    assert.notDeepEqual(tacticalAction, casualAction);
    const tacticalNext = applyAction(state, tacticalAction);
    assert.equal(tacticalNext.phase, 'defendMove', 'compare both decisions before the same opponent reply opportunity');
    assert.equal(tacticalNext.attack, state.attack);
    assert.ok(tacticalNext.ball.carrierId);
    assert.equal(guaranteedTackles(tacticalNext).length, 0, 'the stronger level retains possession outside immediate tackling lines');
    assertIntegrity(tacticalNext);
  }
});
