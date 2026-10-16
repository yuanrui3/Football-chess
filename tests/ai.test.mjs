import test from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import {
  BOARD_WIDTH, BOARD_HEIGHT, MIDFIELD_RANK, isBox, inOwnBox, canOccupySquare, AI_DIFFICULTIES,
  createGame, currentTeam, chooseAIAction, legalMoves, legalKicks,
  applyMove, applyKick, skipMove, shotChance, positionActions,
  cornerTakers, selectCornerTaker,
} from '../dist/engine.js';

const DIFFICULTIES = ['casual', 'tactical'];
const clone = value => JSON.parse(JSON.stringify(value));
const freshBudget = () => ({ normalUsed: false, pawnUsed: false, dribbleUsed: false });

// Use complete teams even in focused scenarios. Parking at either touchline
// avoids accidental occupants in the central combinations being examined.
function fixture({ phase = 'attackMove', attack = 'white', carrier = 'white-R1', positions = {}, ball, budget, seed = 17, clear = [] } = {}) {
  const state = createGame({ mode: 'solo', kickoff: attack, seed });
  const assigned = { 'white-K': [6, 16], 'black-K': [7, 0], 'white-R1': [2, 10], ...positions };
  const occupied = new Set(Object.values(assigned).map(([x, y]) => `${x},${y}`));
  assert.equal(occupied.size, Object.keys(assigned).length, 'fixture overrides do not overlap');
  for (const [x, y] of clear) occupied.add(`${x},${y}`);
  const parking = Array.from({ length: BOARD_HEIGHT }, (_, y) => [[0, y], [BOARD_WIDTH - 1, y]]).flat();
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
  const state = fixture({ phase: 'kick', positions: { 'white-R1': [5, 4], 'black-K': [7, 0] } });
  return applyKick(state, 5, -1);
}

function restartFixture(type, phase = 'attackMove', team = 'white') {
  const transform = ([x, y]) => team === 'white' ? [x, y] : [BOARD_WIDTH - 1 - x, BOARD_HEIGHT - 1 - y];
  const takerId = `${team}-${type === 'goalKick' ? 'K' : 'R1'}`;
  const origin = type === 'goalKick' ? [6, BOARD_HEIGHT - 1]
    : type === 'corner' ? [0, 0]
      : type === 'throwIn' ? [0, MIDFIELD_RANK]
        : [6, MIDFIELD_RANK];
  const [x, y] = transform(origin), spot = { x, y };
  const state = fixture({ phase, attack: team, carrier: takerId, positions: { [takerId]: [x, y] } });
  state.restart = { type, team, takerId, spot, indirect: type === 'offside' };
  return state;
}

function scenarios() {
  const reaction = reactionFixture();
  const backPass = applyKick(fixture({ phase: 'kick', positions: { 'white-R1': [6, 12] } }), 6, 16);
  const goalKick = skipMove(reaction, { roll: 0.999999 });
  const cornerSelect = restartFixture('corner', 'cornerSelect');
  cornerSelect.restart.takerId = null;
  cornerSelect.ball.carrierId = null;
  return [
    ['white kick-off', createGame({ kickoff: 'white', seed: 17 })],
    ['black kick-off', createGame({ kickoff: 'black', seed: 17 })],
    ['attack with both moves', fixture({ positions: { 'white-P1': [8, 8], 'black-P1': [8, 5] } })],
    ['defence with both moves', fixture({ phase: 'defendMove', positions: { 'white-R1': [4, 7], 'black-N1': [6, 8], 'black-P1': [8, 5] } })],
    ['attack with only bonus pawn remaining', fixture({ budget: { normalUsed: true, pawnUsed: false, dribbleUsed: true }, positions: { 'white-P1': [8, 8] } })],
    ['defence with only bonus pawn remaining', fixture({ phase: 'defendMove', budget: { normalUsed: true, pawnUsed: false, dribbleUsed: false }, positions: { 'black-P1': [8, 8] } })],
    ['attack with only normal move remaining', fixture({ budget: { normalUsed: false, pawnUsed: true, dribbleUsed: true }, positions: { 'white-P1': [8, 8] } })],
    ['attack with only dribble remaining', fixture({ budget: { normalUsed: true, pawnUsed: true, dribbleUsed: false }, positions: { 'white-P1': [8, 8] } })],
    ['defence with only normal move remaining', fixture({ phase: 'defendMove', budget: { normalUsed: false, pawnUsed: true, dribbleUsed: false }, positions: { 'black-P1': [8, 8] } })],
    ['ordinary kick', fixture({ phase: 'kick', positions: { 'white-R1': [4, 6], 'black-K': [6, 0] } })],
    ['long pass decision', fixture({ phase: 'kick', positions: { 'white-R1': [2, 13], 'white-P1': [2, 0] } })],
    ['loose ball attack', fixture({ ball: { x: 6, y: 5, carrierId: null }, positions: { 'white-N1': [5, 7] } })],
    ['loose ball defence', fixture({ phase: 'defendMove', ball: { x: 6, y: 5, carrierId: null }, positions: { 'black-N1': [5, 7] } })],
    ['knight tackle', fixture({ phase: 'defendMove', carrier: 'white-N1', positions: { 'white-N1': [5, 7], 'black-R1': [5, 3] } })],
    ['keeper reaction', reaction],
    ['back-pass immediate release', backPass],
    ['wide shot goal kick positioning', goalKick],
    ['corner taker selection', cornerSelect],
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
    assert.ok(canOccupySquare(piece, piece.x, piece.y), 'pieces obey the current goal-area access rules');
    if (piece.type === 'K' && isBox(piece.x, piece.y)) assert.ok(inOwnBox(piece.team, piece.x, piece.y), 'a king only enters its own box');
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
    assert.equal(typeof state.positionBudget.dribbleUsed, 'boolean');
    const actions = positionActions(state);
    assert.ok(actions.normalAvailable || actions.pawnAvailable || actions.dribbleAvailable, 'a positioning phase retains an available action');
  }
  if (state.phase === 'keeperReact') assert.ok(state.pendingShot);
  if (state.phase === 'keeperRelease') {
    assert.equal(state.releaseReason, 'backPass');
    assert.equal(state.pieces.find(piece => piece.id === state.ball.carrierId)?.type, 'K');
  } else assert.equal(state.releaseReason, null);
  if (state.restart) {
    assert.ok(['cornerSelect', 'attackMove', 'defendMove', 'kick'].includes(state.phase), 'dead-ball restarts select a taker if necessary, then retain their positioning round');
    assert.equal(state.restart.team, state.attack);
    if (state.phase === 'cornerSelect') {
      assert.equal(state.restart.type, 'corner');
      assert.equal(state.restart.takerId, null);
      assert.equal(state.ball.carrierId, null);
      assert.ok(cornerTakers(state).length > 0, 'pending selection has an eligible attacking-half player');
    }
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
    if (state.restart.type === 'goalKick') {
      assert.equal(state.ball.carrierId, `${state.attack}-K`);
      assert.equal(legalKicks(state).some(kick => kick.goal), false, 'a goal kick requires distribution after repositioning');
    }
  }
}

function selectedMove(state, action) {
  if (action.type !== 'move') return null;
  return legalMoves(state, action.pieceId, { freePawn: !!action.freePawn }).find(move => move.x === action.x && move.y === action.y);
}

function applyAction(state, action, overrides = {}) {
  assert.ok(action && typeof action === 'object', 'AI returns an action');
  if (action.type === 'cornerTaker') {
    assert.equal(state.phase, 'cornerSelect');
    assert.ok(cornerTakers(state).some(piece => piece.id === action.pieceId), 'AI chooses a publicly eligible corner taker');
    return selectCornerTaker(state, action.pieceId);
  }
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
        if (action.freePawn) {
          assert.equal(state.positionBudget.pawnUsed, false, `${name}: spent bonus move cannot be reused`);
          assert.ok(['P', 'K'].includes(state.pieces.find(piece => piece.id === action.pieceId).type));
          assert.notEqual(action.pieceId, state.ball.carrierId, `${name}: the shared pawn/king bonus is reserved for an off-ball player`);
        } else if (state.phase === 'attackMove' && action.pieceId === state.ball.carrierId) {
          assert.equal(state.positionBudget.dribbleUsed, false, `${name}: spent dribble cannot be reused`);
        } else assert.equal(state.positionBudget.normalUsed, false, `${name}: spent no-ball action cannot be reused`);
      }
    }
    const sorted = [...timings].sort((a, b) => a - b);
    t.diagnostic(`${timings.length} representative decisions: median ${sorted[Math.floor(sorted.length / 2)].toFixed(1)} ms; maximum ${Math.max(...timings).toFixed(1)} ms`);
  });

  test(`${difficulty}: both sides complete protected goal-kick, corner and throw positioning before restarting`, () => {
    for (const team of ['white', 'black']) for (const type of ['goalKick', 'corner', 'throwIn']) {
      let state = restartFixture(type, 'attackMove', team);
      const phases = [], restart = clone(state.restart), ball = clone(state.ball);
      for (let index = 0; state.restart && index < 7; index++) {
        phases.push(state.phase);
        assertIntegrity(state);
        const action = assertPureChoice(state, difficulty);
        if (state.phase === 'kick') assert.equal(action.type, 'kick', 'the restart must be taken after resettling');
        else {
          assert.notEqual(action.type, 'kick', 'no early restart bypasses either team positioning');
          assert.notEqual(action.pieceId, restart.takerId, 'the dead-ball taker remains locked');
          assert.equal(selectedMove(state, action)?.type === 'tackle', false);
        }
        const next = applyAction(state, action, { roll: 0 });
        if (action.type !== 'kick') {
          assert.deepEqual(next.restart, restart);
          assert.deepEqual(next.ball, ball);
          assert.equal(next.randomState, state.randomState, 'resettling draws no random outcomes');
        }
        state = next;
      }
      assert.ok(phases.includes('attackMove') && phases.includes('defendMove') && phases.includes('kick'), 'both protected positioning turns occur before the kick');
      assert.equal(state.restart, null, 'the AI finishes the restart without a loop');
      assert.equal(state.releaseReason, null);
      assertIntegrity(state);
    }
  });

  test(`${difficulty}: hidden outcome seeds never change a visible-board decision`, () => {
    for (const [name, state] of scenarios().filter(([name]) => ['white kick-off', 'attack with both moves', 'defence with only normal move remaining', 'long pass decision', 'knight tackle', 'keeper reaction', 'back-pass immediate release', 'wide shot goal kick positioning'].includes(name))) {
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
    const state = fixture({ phase: 'defendMove', carrier: 'white-N1', positions: { 'white-N1': [5, 7], 'black-R1': [5, 3] }, budget: { normalUsed: false, pawnUsed: true, dribbleUsed: false } });
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

test('both levels avoid an attacking dribble exposed to an immediate short-range queen reply, at either end', () => {
  const original = fixture({
    carrier: 'white-B1',
    positions: { 'white-B1': [9, 7], 'white-R1': [9, 10], 'black-R1': [8, 2] },
    budget: { normalUsed: true, pawnUsed: true, dribbleUsed: false },
  });
  for (const state of [original, mirroredState(original)]) for (const difficulty of DIFFICULTIES) {
    const next = applyAction(state, assertPureChoice(state, difficulty));
    assert.equal(next.phase, 'defendMove', 'compare decisions before the same opponent reply opportunity');
    assert.equal(next.attack, state.attack);
    assert.ok(next.ball.carrierId);
    assert.equal(guaranteedTackles(next).length, 0, `${difficulty} retains possession outside immediate tackling lines`);
    assertIntegrity(next);
  }
});
