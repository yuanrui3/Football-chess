import test from 'node:test';
import assert from 'node:assert/strict';
import * as engine from '../dist/engine.js';

const {
  BOARD_WIDTH, BOARD_HEIGHT, GOAL_FILES, BOX_DEPTH, RULES_VERSION, inOwnBox, canOccupySquare, isBox, createGame, currentTeam,
  legalMoves, legalKicks, applyMove, applyKick, skipMove, chooseAIAction,
} = engine;
const clone = value => JSON.parse(JSON.stringify(value));
const other = team => team === 'white' ? 'black' : 'white';
const budget = (normalUsed = false, pawnUsed = false, dribbleUsed = false) => ({ normalUsed, pawnUsed, dribbleUsed });
const mirror = ([x, y]) => [BOARD_WIDTH - 1 - x, BOARD_HEIGHT - 1 - y];

// Preserve both complete teams. Reserve the central action squares and passing
// rays, then park uninvolved players on the touchlines away from those actions.
function fixture({ team = 'white', phase = 'attackMove', carrier = `${team}-R1`, positions = {}, ball, positionBudget = budget(), clear = [], seed = 73 } = {}) {
  const state = createGame({ mode: 'local', kickoff: team, seed });
  const assigned = { 'white-K': [5, 14], 'black-K': [6, 0], [carrier]: [2, 8], ...positions };
  const occupied = new Set(Object.values(assigned).map(pair => pair.join(',')));
  assert.equal(occupied.size, Object.keys(assigned).length, 'fixture assignments cannot overlap');
  for (const pair of clear) occupied.add(pair.join(','));
  const parking = Array.from({ length: BOARD_HEIGHT }, (_, y) => [[0, y], [BOARD_WIDTH-1, y]]).flat();
  for (const piece of state.pieces) {
    const spot = assigned[piece.id] || parking.find(pair => !occupied.has(pair.join(',')));
    assert.ok(spot, `parking exists for ${piece.id}`);
    [piece.x, piece.y] = spot;
    occupied.add(spot.join(','));
  }
  const owner = state.pieces.find(piece => piece.id === carrier);
  state.ball = ball || { x: owner.x, y: owner.y, carrierId: carrier };
  state.attack = team;
  state.phase = phase;
  state.positionBudget = clone(positionBudget);
  state.restart = null;
  state.releaseReason = null;
  state.pendingShot = null;
  state.offside = null;
  return state;
}

function integrity(state) {
  assert.equal(state.pieces.length, 22, 'the complete roster survives every action');
  assert.equal(new Set(state.pieces.map(piece => piece.id)).size, 22);
  assert.equal(new Set(state.pieces.map(piece => `${piece.x},${piece.y}`)).size, 22, 'no players overlap');
  for (const piece of state.pieces) {
    assert.ok(piece.x >= 0 && piece.x < BOARD_WIDTH && piece.y >= 0 && piece.y < BOARD_HEIGHT);
    assert.ok(canOccupySquare(piece,piece.x,piece.y), `${piece.id} respects current box access`);
  }
  if (state.ball.carrierId) {
    const carrier = state.pieces.find(piece => piece.id === state.ball.carrierId);
    assert.ok(carrier);
    assert.deepEqual({ x: state.ball.x, y: state.ball.y }, { x: carrier.x, y: carrier.y });
    assert.equal(carrier.team, state.attack);
  }
}

function move(state, id, x, y, options = {}) {
  const before = clone(state);
  assert.ok(legalMoves(state, id, options).some(candidate => candidate.x === x && candidate.y === y), `${id} can move to ${x},${y}`);
  const next = applyMove(state, id, x, y, options);
  assert.deepEqual(state, before, 'legal previews and transition preserve the undo snapshot');
  integrity(next);
  return next;
}

const permutations = values => values.length ? values.flatMap((value, i) => permutations(values.filter((_, j) => j !== i)).map(rest => [value, ...rest])) : [[]];
function attackFixture(team = 'white', carrierSuffix = 'R1') {
  const transform = pair => team === 'white' ? pair : mirror(pair);
  const carrierId = `${team}-${carrierSuffix}`;
  return fixture({ team, carrier: carrierId, positions: {
    [carrierId]: transform([2, 8]), [`${team}-R2`]: transform([8, 10]), [`${team}-P1`]: transform([9, 7]),
  }, clear: [[3, 8], [8, 9], [10, 7]].map(transform) });
}

test('attacking dribble, off-ball move and free pawn move work in all six orders for either side', () => {
  for (const team of ['white', 'black']) for (const order of permutations(['dribble', 'normal', 'pawn'])) {
    const transform = pair => team === 'white' ? pair : mirror(pair);
    const actions = {
      dribble: [`${team}-R1`, ...transform([3, 8]), {}],
      normal: [`${team}-R2`, ...transform([8, 9]), {}],
      pawn: [`${team}-P1`, ...transform([10, 7]), { freePawn: true }],
    };
    let state = attackFixture(team);
    const seed = state.randomState;
    const spent = new Set();
    for (const [i, kind] of order.entries()) {
      const oldBall = clone(state.ball);
      state = move(state, ...actions[kind]);
      spent.add(kind);
      assert.equal(state.randomState, seed, 'repositioning never draws a random outcome');
      if (kind !== 'dribble') assert.deepEqual(state.ball, oldBall, 'off-ball actions leave the ball alone');
      assert.equal(state.ball.carrierId, `${team}-R1`);
      if (i < 2) {
        assert.equal(state.phase, 'attackMove', `${team}: ${order.join(' → ')} retains unused actions`);
        assert.deepEqual(state.positionBudget, budget(spent.has('normal'), spent.has('pawn'), spent.has('dribble')));
        assert.equal(legalKicks(state).length, 0, 'the kicker must wait until positioning finishes');
      } else {
        assert.equal(state.phase, 'defendMove', 'all three spent actions advance automatically');
        assert.equal(currentTeam(state), other(team));
        assert.deepEqual(state.positionBudget, budget(), 'defending receives a clean budget');
      }
    }
    assert.deepEqual({ x: state.ball.x, y: state.ball.y }, { x: transform([3, 8])[0], y: transform([3, 8])[1] });
  }
});

test('a spent dribble cannot reuse an unused normal action and a spent normal action does not block the carrier', () => {
  let state = attackFixture();
  state = move(state, 'white-R1', 3, 8);
  assert.equal(state.positionBudget.normalUsed, false);
  assert.equal(state.positionBudget.dribbleUsed, true);
  assert.deepEqual(legalMoves(state, 'white-R1'), [], 'the ball carrier cannot spend the off-ball allowance');
  const before = clone(state);
  assert.throws(() => applyMove(state, 'white-R1', 4, 8));
  assert.deepEqual(state, before);
  assert.ok(legalMoves(state, 'white-R2').length, 'another player can still move');
  state = attackFixture();
  state = move(state, 'white-R2', 8, 9);
  assert.equal(state.positionBudget.normalUsed, true);
  assert.deepEqual(legalMoves(state, 'white-R2'), [], 'off-ball movement cannot repeat');
  assert.ok(legalMoves(state, 'white-R1').length, 'carrier still has its separate dribble');
  assert.ok(legalMoves(state, 'white-P1', { freePawn: true }).length);
});

test('every carrier gets exactly one dribble in every allowance order, with the shared bonus reserved for an off-ball pawn or king', () => {
  const dribbleTargets = { K: [5, 8], Q: [5, 8], R1: [5, 8], B1: [5, 7], N1: [6, 7], P1: [5, 8] };
  for (const team of ['white', 'black']) for (const [suffix, dribbleTarget] of Object.entries(dribbleTargets)) {
    for (const order of permutations(['dribble', 'normal', 'pawn'])) {
      const transform = pair => team === 'white' ? pair : mirror(pair);
      const carrierId = `${team}-${suffix}`, bonusId = `${team}-P2`;
      let state = fixture({ team, carrier: carrierId, positions: {
        [carrierId]: transform([4, 8]), [`${team}-R2`]: transform([8, 10]), [bonusId]: transform([9, 7]),
      }, clear: [[8, 9], [10, 7], dribbleTarget].map(transform) });
      const initial = clone(state), spent = new Set();
      const actions = {
        dribble: [carrierId, ...transform(dribbleTarget), {}],
        normal: [`${team}-R2`, ...transform([8, 9]), {}],
        pawn: [bonusId, ...transform([10, 7]), { freePawn: true }],
      };
      for (const kind of order) {
        const before = clone(state);
        assert.deepEqual(legalMoves(state, carrierId, { freePawn: true }), [], 'the pawn-or-king bonus cannot carry the ball, even before its dribble');
        assert.throws(() => applyMove(state, carrierId, ...transform(dribbleTarget), { freePawn: true }));
        assert.deepEqual(state, before, 'rejected carrier bonus preserves the saved/undo state');
        if (spent.has('dribble')) assert.deepEqual(legalMoves(state, carrierId), [], 'unused off-ball or pawn allowances cannot grant a second dribble');
        else assert.ok(legalMoves(state, carrierId).length, 'the sole dribble stays available until used');
        state = move(state, ...actions[kind]);
        spent.add(kind);
      }
      assert.equal(state.phase, 'defendMove', `${team} ${suffix} completes ${order.join(' → ')}`);
      const [x, y] = transform(dribbleTarget);
      assert.deepEqual(state.ball, { x, y, carrierId }, 'the ball travels only once in the complete attacking round');
      assert.equal(state.randomState, initial.randomState);
      assert.notDeepEqual(state.pieces.find(piece => piece.id === bonusId), initial.pieces.find(piece => piece.id === bonusId), 'another pawn still gets its free off-ball move');
    }
  }
});

test('an off-ball pawn may still use its normal and free actions while the carrier retains its dribble', () => {
  let state = attackFixture();
  state = move(state, 'white-P1', 10, 7, { freePawn: true });
  state = move(state, 'white-P1', 10, 6);
  assert.equal(state.phase, 'attackMove');
  assert.deepEqual(state.positionBudget, budget(true, true, false));
  assert.ok(legalMoves(state, 'white-R1').length);
  state = move(state, 'white-R1', 3, 8);
  assert.equal(state.phase, 'defendMove');
});

test('collecting a loose ball with a normal move spends that move and then permits one dribble', () => {
  let state = fixture({ positions: { 'white-R1': [2, 8], 'white-P1': [9, 7] }, ball: { x: 3, y: 8, carrierId: null }, clear: [[3, 8], [4, 8], [10, 7]] });
  assert.equal(engine.positionActions(state).dribbleAvailable, false, 'a loose ball cannot be dribbled before collection');
  state = move(state, 'white-R1', 3, 8);
  assert.deepEqual(state.positionBudget, budget(true, false, false));
  assert.equal(engine.positionActions(state).dribbleAvailable, true);
  state = move(state, 'white-R1', 4, 8);
  assert.deepEqual(state.positionBudget, budget(true, false, true));
  state = move(state, 'white-P1', 10, 7, { freePawn: true });
  assert.equal(state.phase, 'defendMove');
});

test('free-pawn collection permits one subsequent dribble and a separate off-ball move in either order for either color', () => {
  for (const team of ['white', 'black']) for (const dribbleFirst of [false, true]) {
    const transform = pair => team === 'white' ? pair : mirror(pair);
    const [ballX, ballY] = transform([8, 7]);
    const carrierId = `${team}-P1`;
    let state = fixture({ team, carrier: carrierId, positions: { [carrierId]: transform([8, 8]), [`${team}-R2`]: transform([3, 9]) }, ball: { x: ballX, y: ballY, carrierId: null }, clear: [[8, 7], [8, 6], [3, 8]].map(transform) });
    state = move(state, carrierId, ...transform([8, 7]), { freePawn: true });
    assert.deepEqual(state.positionBudget, budget(false, true, false));
    assert.equal(state.lastAction.collection, true, 'collection is an off-ball move, not a carry');
    assert.deepEqual(legalMoves(state, carrierId, { freePawn: true }), []);
    const actions = {
      dribble: [carrierId, ...transform([8, 6])],
      normal: [`${team}-R2`, ...transform([3, 8])],
    };
    for (const kind of dribbleFirst ? ['dribble', 'normal'] : ['normal', 'dribble']) {
      state = move(state, ...actions[kind]);
      if (kind === 'dribble' && state.phase === 'attackMove') {
        assert.deepEqual(legalMoves(state, carrierId), [], 'collection cannot open a second carry after the sole dribble');
      }
    }
    assert.equal(state.phase, 'defendMove');
    const [x, y] = transform([8, 6]);
    assert.deepEqual(state.ball, { x, y, carrierId });
  }
});

test('collection as the last ordinary allowance opens a dribble instead of prematurely advancing', () => {
  for (const collectWithPawnBonus of [false, true]) {
    let state = fixture({ carrier: 'white-P1', positions: { 'white-P1': [8, 8], 'white-P2': [9, 9], 'white-R2': [3, 9] }, ball: { x: 8, y: 7, carrierId: null }, clear: [[8, 7], [8, 6], [10, 9], [3, 8]] });
    if (collectWithPawnBonus) state = move(state, 'white-R2', 3, 8);
    else state = move(state, 'white-P2', 10, 9, { freePawn: true });
    state = move(state, 'white-P1', 8, 7, { freePawn: collectWithPawnBonus });
    assert.equal(state.phase, 'attackMove', 'newly collected possession retains its carrier action');
    assert.deepEqual(state.positionBudget, budget(true, true, false));
    assert.ok(engine.positionActions(state).dribbleAvailable);
    state = move(state, 'white-P1', 8, 6);
    assert.equal(state.phase, 'defendMove');
  }
});

test('a defending loose-ball collection refreshes every allowance, including when the collector used the free pawn action', () => {
  for (const freePawn of [false, true]) {
    const initial = fixture({ phase: 'defendMove', carrier: 'black-P1', positions: { 'black-P1': [8, 8], 'black-R2': [3, 9] }, ball: { x: 8, y: 7, carrierId: null }, positionBudget: budget(freePawn, !freePawn, false), clear: [[8, 7], [8, 6], [3, 8]] });
    const state = move(initial, 'black-P1', 8, 7, { freePawn });
    assert.equal(state.attack, 'black');
    assert.equal(state.phase, 'attackMove');
    assert.deepEqual(state.positionBudget, budget());
    const actions = engine.positionActions(state);
    assert.ok(actions.normalAvailable && actions.pawnAvailable && actions.dribbleAvailable);
    assert.equal(state.randomState, initial.randomState, 'collection uses no random roll');
  }
});

test('a loose-ball round and a defending round still finish after normal plus free-pawn actions', () => {
  for (const phase of ['attackMove', 'defendMove']) {
    const team = phase === 'attackMove' ? 'white' : 'black';
    let state = fixture({ phase, positions: { [`${team}-R2`]: [8, 10], [`${team}-P1`]: [9, 7] }, ball: phase === 'attackMove' ? { x: 5, y: 5, carrierId: null } : undefined, clear: [[8, 9], [10, 7]] });
    assert.equal(engine.positionActions(state).dribbleAvailable, false);
    state = move(state, `${team}-R2`, 8, 9);
    state = move(state, `${team}-P1`, 10, 7, { freePawn: true });
    assert.equal(state.phase, phase === 'attackMove' ? 'defendMove' : 'kick');
  }
});

test('ending positioning can forfeit any remaining combination of the three allowances', () => {
  for (const first of ['none', 'dribble', 'normal', 'pawn']) {
    let state = attackFixture();
    if (first === 'dribble') state = move(state, 'white-R1', 3, 8);
    if (first === 'normal') state = move(state, 'white-R2', 8, 9);
    if (first === 'pawn') state = move(state, 'white-P1', 10, 7, { freePawn: true });
    const before = clone(state);
    const next = skipMove(state);
    assert.deepEqual(state, before);
    assert.equal(next.phase, 'defendMove');
    assert.deepEqual(next.positionBudget, budget());
    assert.equal(skipMove(next).phase, 'kick');
  }
});

test('winning possession opens fresh dribble, off-ball and pawn actions while failed knight tackles do not', () => {
  const initial = fixture({ phase: 'defendMove', carrier: 'white-N1', positions: { 'white-N1': [2, 7], 'black-R1': [2, 4], 'black-P1': [9, 7] }, clear: [[1, 7], [1, 6]] });
  const tackle = legalMoves(initial, 'black-R1').find(candidate => candidate.x === 1 && candidate.y === 7 && candidate.type === 'tackle');
  assert.ok(tackle);
  for (const [roll, success] of [[.499999, true], [.5, false]]) {
    const before = clone(initial);
    const next = applyMove(initial, 'black-R1', 1, 7, { roll });
    assert.deepEqual(initial, before);
    integrity(next);
    if (success) {
      assert.equal(next.attack, 'black');
      assert.equal(next.phase, 'attackMove');
      assert.deepEqual(next.positionBudget, budget());
      const actions = engine.positionActions(next);
      assert.ok(actions.dribbleAvailable && actions.normalAvailable && actions.pawnAvailable);
      assert.ok(legalMoves(next, 'black-R1').length);
    } else {
      assert.equal(next.phase, 'defendMove');
      assert.equal(next.ball.carrierId, 'white-N1');
      assert.deepEqual(next.positionBudget, budget(true, false, false));
      assert.equal(engine.positionActions(next).dribbleAvailable, false);
      assert.deepEqual(legalMoves(next, 'black-R1'), []);
    }
  }
});

function longGoalKick(team = 'white') {
  const transform = pair => team === 'white' ? pair : mirror(pair);
  const defending = other(team);
  const source = transform([2, 13]), target = transform([2, 1]), landing = transform([2, -3]);
  const state = fixture({ team, phase: 'kick', positions: {
    [`${team}-R1`]: source,
    [`${defending}-K`]: transform([7, 0]),
    [`${defending}-N1`]: transform([4, 0]),
  }, clear: Array.from({ length: BOARD_HEIGHT }, (_, y) => transform([2, y])) });
  const kick = legalKicks(state).find(candidate => candidate.x === target[0] && candidate.y === target[1]);
  assert.ok(kick && kick.distance > 10 && kick.accuracy < 1);
  const before = clone(state);
  const result = applyKick(state, ...target, { roll: .999999, landing: { x: landing[0], y: landing[1] } });
  assert.deepEqual(state, before);
  return result;
}

function assertGoalKick(state, team, phase = 'attackMove') {
  integrity(state);
  assert.equal(state.phase, phase);
  assert.equal(state.releaseReason, null);
  assert.equal(state.attack, team);
  assert.equal(currentTeam(state), phase === 'defendMove' ? other(team) : team);
  assert.equal(state.ball.carrierId, `${team}-K`, 'only the king takes a goal kick');
  assert.equal(state.restart.type, 'goalKick');
  assert.equal(state.restart.takerId, `${team}-K`);
  assert.equal(state.restart.team, team);
  assert.deepEqual(state.restart.spot, { x: state.ball.x, y: state.ball.y });
  assert.ok(isBox(state.ball.x, state.ball.y));
  assert.ok(inOwnBox(team,state.ball.x,state.ball.y));
  assert.deepEqual(legalMoves(state, state.ball.carrierId), [], 'the king is locked during resettling');
  assert.equal(engine.positionActions(state).dribbleAvailable, false);
  for (const piece of state.pieces) for (const freePawn of [false, true]) {
    assert.equal(legalMoves(state, piece.id, { freePawn }).some(move => move.type === 'tackle'), false, 'the restart ball is protected');
  }
  const kicks = legalKicks(state);
  if (phase === 'kick') {
    assert.ok(kicks.length, 'the king has a legal pass after both teams reposition');
    assert.equal(kicks.some(kick => kick.goal), false, 'a goal kick must be a pass rather than a direct shot');
  } else assert.deepEqual(kicks, [], 'neither team may skip the other positioning turn by kicking early');
  assert.throws(() => applyKick(state, GOAL_FILES[0], team === 'black' ? -1 : BOARD_HEIGHT));
}

test('long-pass end-line exits give both teams resettling before the king passes, even when a knight is nearer', () => {
  for (const shootingTeam of ['white', 'black']) {
    const result = longGoalKick(shootingTeam);
    assertGoalKick(result, other(shootingTeam));
    assert.deepEqual(result.positionBudget, budget());
    assert.equal(result.restart.reason ?? null, null);
    assertGoalKick(skipMove(result), other(shootingTeam), 'defendMove');
    assertGoalKick(skipMove(skipMove(result)), other(shootingTeam), 'kick');
  }
});

test('wide shots also allow resettling before the king passes and preserve the wide-shot record', () => {
  for (const team of ['white', 'black']) {
    const transform = pair => team === 'white' ? pair : mirror(pair);
    const state = fixture({ team, phase: 'kick', positions: { [`${team}-R1`]: transform([GOAL_FILES[0], 7]), [`${other(team)}-K`]: transform([7, 0]), [`${other(team)}-N1`]: transform([GOAL_FILES[1], 1]) }, clear: Array.from({ length: 8 }, (_, y) => transform([GOAL_FILES[0], y])) });
    const target = transform([GOAL_FILES[0], -1]);
    const declared = applyKick(state, ...target);
    assert.equal(declared.phase, 'keeperReact');
    const result = skipMove(declared, { roll: .999999 });
    assert.equal(result.lastAction.type, 'shotMiss');
    assert.equal(result.lastAction.outcome, 'wide');
    assertGoalKick(result, other(team));
  }
});

test('taking the goal kick after positioning clears the restart and opens ordinary actions with no direct-offside penalty', () => {
  const initial = skipMove(skipMove(longGoalKick()));
  const kick = legalKicks(initial).find(candidate => !candidate.goal && candidate.accuracy === 1);
  const before = clone(initial);
  const next = applyKick(initial, kick.x, kick.y, { roll: 0 });
  assert.deepEqual(initial, before);
  assert.equal(next.restart, null);
  assert.equal(next.releaseReason, null);
  assert.equal(next.phase, 'attackMove');
  assert.equal(next.offside, null, 'direct goal-kick receipt is exempt from offside');
  assert.deepEqual(next.positionBudget, budget());
  assert.equal(next.lastAction.restartType, 'goalKick');
  integrity(next);
});

test('normalization migrates older knight goal-kick takers without losing resettling progress or randomness', () => {
  for (const team of ['white', 'black']) for (const phase of ['attackMove', 'defendMove', 'kick']) {
    const transform = pair => team === 'white' ? pair : mirror(pair);
    const knightId = `${team}-N1`, spot = transform([4, 14]);
    const state = fixture({ team, carrier: knightId, phase, positions: { [knightId]: spot, [`${team}-K`]: transform([7, 12]) }, positionBudget: { normalUsed: true, pawnUsed: false } });
    state.restart = { type: 'goalKick', team, takerId: knightId, spot: { x: spot[0], y: spot[1] }, indirect: false, exit: { x: spot[0], y: team === 'white' ? 14.5 : -.5, line: team === 'white' ? 'bottom' : 'top' } };
    const before = clone(state);
    const normalized = engine.normalizeGame(state);
    assert.deepEqual(state, before, 'save migration is pure');
    assert.equal(normalized.randomState, state.randomState, 'migration never consumes a roll');
    assert.deepEqual(normalized.score, state.score);
    assert.deepEqual(normalized.positionBudget, budget(true, false, true), 'spent old positioning actions stay spent');
    assert.deepEqual(normalized.pieces.find(piece => piece.id === knightId), state.pieces.find(piece => piece.id === knightId), 'the previous knight taker is not displaced');
    assert.deepEqual(normalized.restart.exit, state.restart.exit);
    assertGoalKick(normalized, team, phase);
    assert.deepEqual(engine.normalizeGame(normalized), normalized, 'repeated save loading is stable');
  }
});

test('version-five immediate goal kicks migrate to a fresh protected round, including metadata-less saves', () => {
  for (const team of ['white', 'black']) for (const hasMetadata of [true, false]) {
    const state = longGoalKick(other(team));
    state.rulesVersion = 5;
    state.phase = 'keeperRelease';
    state.releaseReason = 'goalKick';
    state.positionBudget = budget(true, true, true);
    if (!hasMetadata) { delete state.restart; delete state.offside; }
    const before = clone(state), normalized = engine.normalizeGame(state);
    assert.deepEqual(state, before, 'loading must not mutate the saved match or undo snapshot');
    assert.equal(normalized.rulesVersion, RULES_VERSION);
    assert.equal(normalized.randomState, state.randomState);
    assert.deepEqual(normalized.score, state.score);
    assert.deepEqual(normalized.positionBudget, budget(), 'both teams receive a fresh round after an old immediate restart');
    assertGoalKick(normalized, team);
    if (hasMetadata) {
      assert.deepEqual(normalized.pieces, state.pieces, 'a valid goalkeeper already at the spot stays there');
      assert.deepEqual(normalized.restart, state.restart);
    }
    assert.deepEqual(engine.normalizeGame(normalized), normalized);
  }
});

test('normalizing existing resettling saves preserves phase, spent budget and every position at all restart stages', () => {
  for (const team of ['white', 'black']) for (const phase of ['attackMove', 'defendMove', 'kick']) {
    for (const [normalUsed, pawnUsed] of [[false, false], [true, false], [false, true]]) {
      const state = longGoalKick(other(team));
      state.phase = phase;
      state.positionBudget = budget(normalUsed, pawnUsed, false);
      state.rulesVersion = 5;
      const before = clone(state), normalized = engine.normalizeGame(state);
      assert.deepEqual(state, before);
      assert.deepEqual(normalized, { ...state, rulesVersion: RULES_VERSION }, 'valid protected restart is preserved exactly except the version');
      assert.deepEqual(engine.normalizeGame(normalized), normalized);
      assertGoalKick(normalized, team, phase);
    }
  }
});

test('a teammate back-pass still forces the king to release immediately and is not migrated into a restart', () => {
  for (const team of ['white', 'black']) {
    const transform = pair => team === 'white' ? pair : mirror(pair);
    const state = fixture({ team, phase: 'kick', positions: { [`${team}-R1`]: transform([5, 10]), [`${team}-K`]: transform([5, 14]) }, clear: [[5, 11], [5, 12], [5, 13]].map(transform) });
    const target = transform([5, 14]);
    const released = applyKick(state, ...target, { roll: 0 });
    assert.equal(released.phase, 'keeperRelease');
    assert.equal(released.releaseReason, 'backPass');
    assert.equal(released.restart, null);
    const before = clone(released), normalized = engine.normalizeGame(released);
    assert.deepEqual(released, before);
    assert.deepEqual(normalized, released);
    for (const piece of normalized.pieces) for (const freePawn of [false, true]) assert.deepEqual(legalMoves(normalized, piece.id, { freePawn }), []);
    assert.throws(() => skipMove(normalized));
    assert.ok(legalKicks(normalized).length);
    assert.deepEqual(engine.normalizeGame(normalized), normalized);
  }
});

test('old normal-used saves cannot gain a second dribble while untouched saves receive the new allowance', () => {
  for (const normalUsed of [false, true]) {
    const state = attackFixture();
    state.positionBudget = { normalUsed, pawnUsed: false };
    const before = clone(state);
    const normalized = engine.normalizeGame(state);
    assert.deepEqual(state, before);
    assert.deepEqual(normalized.positionBudget, budget(normalUsed, false, normalUsed));
    assert.equal(engine.positionActions(normalized).dribbleAvailable, !normalUsed);
    assert.equal(legalMoves(normalized, 'white-R1').length > 0, !normalUsed);
  }
});

function legacyBonusCarry(team = 'white', rulesVersion = 6) {
  const transform = pair => team === 'white' ? pair : mirror(pair);
  const carrierId = `${team}-P1`;
  const initial = fixture({ team, carrier: carrierId, positions: { [carrierId]: transform([8, 8]), [`${team}-R2`]: transform([3, 9]) }, clear: [[8, 7], [8, 6], [3, 8]].map(transform) });
  const moved = move(initial, carrierId, ...transform([8, 7]));
  // The old engine recorded this same carry against the bonus, leaving the
  // ordinary dribble unused. This is a real saved-match/undo shape from v6.
  moved.positionBudget = budget(false, true, false);
  moved.lastAction.freePawn = true;
  moved.rulesVersion = rulesVersion;
  return moved;
}

test('loading or undoing a legacy bonus carry keeps its dribble spent while refreshing the old progress checkpoint', () => {
  for (const team of ['white', 'black']) for (const version of [undefined, 5, 6]) {
    const state = legacyBonusCarry(team, version);
    if (version === undefined) delete state.rulesVersion;
    const snapshot = JSON.parse(JSON.stringify(state)), before = clone(snapshot);
    const normalized = engine.normalizeGame(snapshot);
    assert.deepEqual(snapshot, before, 'a cached match or undo snapshot remains unmodified');
    assert.deepEqual(normalized, { ...before, rulesVersion: RULES_VERSION, positionBudget: budget(false, true, true), ballProgress: {...before.ballProgress, anchorY: before.ball.y, rounds: 0} }, 'only the rules version, progress checkpoint and already-used carry allowance change');
    assert.equal(normalized.randomState, before.randomState, 'loading consumes no future random outcome');
    assert.deepEqual(legalMoves(normalized, `${team}-P1`), [], 'the past bonus carry counts as the one permitted dribble');
    assert.deepEqual(legalMoves(normalized, `${team}-P1`, { freePawn: true }), []);
    assert.ok(legalMoves(normalized, `${team}-R2`).length, 'the separate off-ball allowance remains available');
    assert.deepEqual(engine.normalizeGame(normalized), normalized, 'loading and then undoing the migrated state is idempotent');
  }
});

test('legacy migration distinguishes bonus collection, off-ball moves and unrelated phases from an extra carry', () => {
  const collection = fixture({ carrier: 'white-P1', positions: { 'white-P1': [8, 8] }, ball: { x: 8, y: 7, carrierId: null }, clear: [[8, 7], [8, 6]] });
  const collected = move(collection, 'white-P1', 8, 7, { freePawn: true });
  collected.rulesVersion = 6;
  const offBall = move(attackFixture(), 'white-P1', 10, 7, { freePawn: true });
  offBall.rulesVersion = 6;
  const currentVersion = legacyBonusCarry('white', 7);
  const defending = legacyBonusCarry();
  defending.phase = 'defendMove';
  const noAction = legacyBonusCarry();
  noAction.lastAction = null;
  const unrelatedAction = legacyBonusCarry();
  unrelatedAction.lastAction.type = 'kick';
  for (const [name, state] of [['collection', collected], ['off-ball bonus', offBall], ['current version', currentVersion], ['defending phase', defending], ['no previous action', noAction], ['non-move action', unrelatedAction]]) {
    const before = clone(state), normalized = engine.normalizeGame(state);
    assert.deepEqual(state, before, `${name}: normalization is pure`);
    assert.deepEqual(normalized, { ...before, rulesVersion: RULES_VERSION, ballProgress: {...before.ballProgress, anchorY: before.ball.y, rounds: 0} }, `${name}: the dribble allowance must not be consumed without evidence of a carry`);
    assert.equal(normalized.randomState, before.randomState);
    assert.deepEqual(engine.normalizeGame(normalized), normalized);
  }
  const restoredCollection = engine.normalizeGame(collected);
  assert.ok(legalMoves(restoredCollection, 'white-P1').length, 'a pawn that just collected can still make its one dribble after loading');
});

test('other boundary restarts retain their positioning round and cannot gain a carrier dribble', () => {
  for (const type of ['corner', 'throwIn', 'offside']) {
    let state = attackFixture();
    state.restart = { type, team: 'white', takerId: state.ball.carrierId, spot: { x: state.ball.x, y: state.ball.y }, indirect: type === 'offside' };
    assert.equal(engine.positionActions(state).dribbleAvailable, false);
    assert.deepEqual(legalMoves(state, state.ball.carrierId), []);
    assert.deepEqual(legalKicks(state), []);
    state = move(state, 'white-R2', 8, 9);
    state = move(state, 'white-P1', 10, 7, { freePawn: true });
    assert.equal(state.phase, 'defendMove', `${type} requires no extra locked-carrier action`);
    state = skipMove(state);
    assert.equal(state.phase, 'kick');
    assert.equal(state.restart.type, type);
    assert.ok(legalKicks(state).length);
  }
});

function applyAI(state, action) {
  if (action.type === 'move') return move(state, action.pieceId, action.x, action.y, { freePawn: !!action.freePawn });
  if (action.type === 'kick') {
    assert.ok(legalKicks(state).some(kick => kick.x === action.x && kick.y === action.y));
    return applyKick(state, action.x, action.y, { roll: .8 });
  }
  assert.equal(action.type, 'skip');
  return skipMove(state);
}

for (const difficulty of ['casual', 'tactical']) test(`${difficulty} AI respects all new action-budget combinations and protected goal kicks`, () => {
  const states = [];
  for (const normalUsed of [false, true]) for (const pawnUsed of [false, true]) for (const dribbleUsed of [false, true]) {
    if (normalUsed && pawnUsed && dribbleUsed) continue;
    const state = attackFixture();
    state.positionBudget = budget(normalUsed, pawnUsed, dribbleUsed);
    states.push(state);
  }
  states.push(longGoalKick('white'), longGoalKick('black'));
  for (const state of states) {
    const before = clone(state);
    const action = chooseAIAction(state, { difficulty });
    assert.deepEqual(state, before, 'planning leaves the board, allowances and future roll untouched');
    if (state.phase === 'keeperRelease') assert.equal(action.type, 'kick', 'the AI must release immediately');
    const next = applyAI(state, action);
    integrity(next);
    if (action.type === 'move' && !action.freePawn && action.pieceId === state.ball.carrierId) assert.equal(state.positionBudget.dribbleUsed, false);
    if (action.type === 'move' && !action.freePawn && action.pieceId !== state.ball.carrierId) assert.equal(state.positionBudget.normalUsed, false);
    for (const randomState of [0, 0xffffffff]) assert.deepEqual(chooseAIAction({ ...state, randomState }, { difficulty }), action, 'AI never uses the hidden future roll to choose');
  }
});

for (const difficulty of ['casual', 'tactical']) test(`${difficulty} AI never double-dribbles the pawn in the seed-one opening regression for either color`, () => {
  for (const team of ['white', 'black']) {
    let state = createGame({ mode: 'solo', seed: 1, kickoff: team });
    const carrierId = `${team}-P1`, carrier = state.pieces.find(piece => piece.id === carrierId);
    state.phase = 'attackMove';
    state.ball = { x: carrier.x, y: carrier.y, carrierId };
    let carries = 0, freePawnMoves = 0;
    for (let step = 0; step < 4 && state.phase === 'attackMove'; step++) {
      const before = clone(state), action = chooseAIAction(state, { difficulty });
      assert.deepEqual(state, before, 'planning preserves the match and future random outcome');
      if (action.type === 'move' && action.pieceId === state.ball.carrierId) {
        carries++;
        assert.equal(!!action.freePawn, false, 'neither AI policy may turn the bonus into another carry');
        assert.ok(carries <= 1, 'a single attacking round permits only one dribble');
      }
      if (action.freePawn) freePawnMoves++;
      state = applyAI(state, action);
    }
    assert.equal(state.phase, 'defendMove', 'the three independent allowances complete the attacking round');
    assert.equal(carries, 1, 'the regression actually exercises the carrier action');
    assert.equal(freePawnMoves, 1, 'the off-ball pawn bonus is still used');
    assert.equal(state.ball.carrierId, carrierId);
  }
});
