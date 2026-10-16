import test from 'node:test';
import assert from 'node:assert/strict';
import * as engine from '../dist/engine.js';

const {createGame, legalMoves, legalKicks, applyMove, applyKick, skipMove, currentTeam, normalizeGame, shotModel, isBox} = engine;
const W=engine.BOARD_WIDTH,H=engine.BOARD_HEIGHT;
const clone = value => JSON.parse(JSON.stringify(value));
const other = team => team === 'white' ? 'black' : 'white';
const budget = (normalUsed = false, pawnUsed = false, dribbleUsed = false) => ({normalUsed, pawnUsed, dribbleUsed});
const mirror = ([x, y]) => [W-1-x, H-1-y];
const point = (team, pair) => team === 'white' ? pair : mirror(pair);
const pointObject = (team, pair) => {const [x,y]=point(team,pair);return {x,y};};
const id = (team, suffix) => `${team}-${suffix}`;

// Build a complete white-attacking position, then rotate it and exchange teams
// for the Black case. Reserve action paths so parked players cannot interfere.
function fixture({team = 'white', phase = 'kick', suffix = 'Q', positions = {}, clear = [], seed = 581} = {}) {
  const state = createGame({mode: 'local', kickoff: 'white', seed});
  const carrierId = `white-${suffix}`;
  const assigned = {'white-K': [6, H-1], 'black-K': [7, 0], [carrierId]: [1, 7], 'white-R2': [2, 10], 'white-P2': [8, 11], ...positions};
  const occupied = new Set(Object.values(assigned).map(pair => pair.join(',')));
  assert.equal(occupied.size, Object.keys(assigned).length);
  for (const pair of clear) occupied.add(pair.join(','));
  const parking = Array.from({length:H}, (_, y) => [[0,y], [W-1,y]]).flat();
  for (const piece of state.pieces) {
    const spot = assigned[piece.id] || parking.find(pair => !occupied.has(pair.join(',')));
    assert.ok(spot, `parking exists for ${piece.id}`);
    [piece.x, piece.y] = spot;
    occupied.add(spot.join(','));
  }
  state.phase = phase;
  state.positionBudget = budget();
  state.restart = null;
  state.offside = null;
  state.pendingShot = null;
  state.releaseReason = null;
  state.looseBallKickOrigin = null;
  const owner = state.pieces.find(piece => piece.id === carrierId);
  state.ball = {x: owner.x, y: owner.y, carrierId};
  state.ballProgress = {team: 'white', anchorY: owner.y, rounds: 0, pendingRelease: false, excludeRelease: false};
  if (team === 'black') {
    for (const piece of state.pieces) {
      piece.id = `${other(piece.team)}-${piece.id.split('-')[1]}`;
      piece.team = other(piece.team);
      [piece.x, piece.y] = mirror([piece.x, piece.y]);
    }
    state.attack = team;
    state.ball = {x: W-1-state.ball.x, y: H-1-state.ball.y, carrierId: id(team, suffix)};
    state.ballProgress = {...state.ballProgress, team, anchorY: H-1-state.ballProgress.anchorY};
  }
  return state;
}
function integrity(state) {
  assert.equal(state.pieces.length, 22);
  assert.equal(new Set(state.pieces.map(piece => piece.id)).size, 22);
  assert.equal(new Set(state.pieces.map(piece => `${piece.x},${piece.y}`)).size, 22);
  for (const piece of state.pieces) {
    assert.ok(piece.x >= 0 && piece.x < W && piece.y >= 0 && piece.y < H);
    assert.ok(engine.canOccupySquare(piece,piece.x,piece.y));
  }
  if (state.ball.carrierId) {
    const carrier = state.pieces.find(piece => piece.id === state.ball.carrierId);
    assert.equal(carrier.team, state.attack);
    assert.deepEqual({x: state.ball.x, y: state.ball.y}, {x: carrier.x, y: carrier.y});
  }
}
function move(state, team, suffix, pair, options = {}) {
  const [x, y] = point(team, pair), before = clone(state);
  assert.ok(legalMoves(state, id(team, suffix), options).some(candidate => candidate.x === x && candidate.y === y));
  const next = applyMove(state, id(team, suffix), x, y, options);
  assert.deepEqual(state, before);
  integrity(next);
  return next;
}
function pass(state, team, pair, options = {roll: 0}) {
  const [x, y] = point(team, pair), before = clone(state);
  assert.ok(legalKicks(state).some(candidate => candidate.x === x && candidate.y === y && !candidate.goal));
  const next = applyKick(state, x, y, options);
  assert.deepEqual(state, before);
  integrity(next);
  return next;
}
function looseQueenPass(team) {
  const state = fixture({team, clear: [[11, 7], [3, 10], [9, 11]]});
  const passed = pass(state, team, [11, 7]);
  assert.equal(passed.ball.carrierId, null);
  assert.deepEqual(passed.looseBallKickOrigin, {team, pieceId: id(team, 'Q'), from: pointObject(team,[1,7])});
  return passed;
}

test('a ten-square self-pass collection consumes the dribble and regular move for either color', () => {
  for (const team of ['white', 'black']) {
    const passed = looseQueenPass(team), seed = passed.randomState;
    const collected = move(passed, team, 'Q', [11, 7]);
    assert.equal(collected.ball.carrierId, id(team, 'Q'));
    assert.deepEqual(collected.positionBudget, budget(true, false, true));
    assert.equal(collected.looseBallKickOrigin, null);
    assert.equal(engine.positionActions(collected).dribbleAvailable, false);
    assert.deepEqual(legalMoves(collected, id(team, 'Q')), [], 'passing to oneself cannot manufacture ten squares plus a carrier move');
    assert.equal(collected.randomState, seed);
    assert.ok(legalMoves(collected, id(team, 'P2'), {freePawn: true}).length, 'the independent off-ball pawn action remains available');
    const finished = move(collected, team, 'P2', [9, 11], {freePawn: true});
    assert.equal(finished.phase, 'defendMove');
  }
});

test('kick origin survives an intervening off-ball action and full loose-ball cycle before self-collection', () => {
  for (const team of ['white', 'black']) {
    let state = looseQueenPass(team);
    const origin = clone(state.looseBallKickOrigin), seed = state.randomState;
    state = move(state, team, 'R2', [3, 10]);
    assert.equal(state.lastAction.type, 'move', 'the latest action is deliberately no longer the original pass');
    assert.deepEqual(state.looseBallKickOrigin, origin);
    state = skipMove(skipMove(state));
    assert.equal(state.phase, 'attackMove');
    assert.deepEqual(state.looseBallKickOrigin, origin);
    const undo = clone(state), restored = normalizeGame(clone(state));
    assert.deepEqual(restored, state, 'serialized kick origin survives loading and undo migration');
    state = move(restored, team, 'Q', [11, 7]);
    assert.deepEqual(state.positionBudget, budget(true, false, true));
    assert.deepEqual(legalMoves(state, id(team, 'Q')), []);
    assert.equal(state.looseBallKickOrigin, null);
    assert.equal(state.randomState, seed);
    assert.deepEqual(move(normalizeGame(clone(undo)), team, 'Q', [11, 7]), state, 'undo/replay preserves the exact self-collection rule and future RNG');
  }
});

test('an intervening free pawn action cannot hide the kicker before an immediate self-collection', () => {
  for (const team of ['white', 'black']) {
    let state = looseQueenPass(team);
    const seed = state.randomState;
    state = move(state, team, 'P2', [9, 11], {freePawn: true});
    assert.deepEqual(state.looseBallKickOrigin, {team, pieceId: id(team, 'Q'), from: pointObject(team,[1,7])});
    state = move(state, team, 'Q', [11, 7]);
    assert.equal(state.phase, 'defendMove', 'collection spends the final ordinary action and the otherwise unused dribble');
    assert.equal(state.looseBallKickOrigin, null);
    assert.equal(state.randomState, seed);
  }
});

test('a scattered pass retains its original kicker until collection and cannot open another dribble', () => {
  for (const team of ['white', 'black']) {
    let state = fixture({team, positions: {'white-Q': [1, 12]}, clear: [[1, 0], [1, 4]]});
    const [landingX, landingY] = point(team, [1, 4]);
    state = pass(state, team, [1, 0], {roll: .99, landing: {x: landingX, y: landingY}});
    assert.equal(state.lastAction.type, 'miss');
    assert.equal(state.ball.carrierId, null);
    assert.deepEqual(state.looseBallKickOrigin, {team, pieceId: id(team, 'Q'), from: pointObject(team,[1,12])});
    const seed = state.randomState;
    state = move(normalizeGame(clone(state)), team, 'Q', [1, 4]);
    assert.equal(state.lastAction.selfPassCollection, true);
    assert.deepEqual(state.positionBudget, budget(true, false, true));
    assert.equal(state.randomState, seed);
    assert.deepEqual(legalMoves(state, id(team, 'Q')), []);
  }
});

test('a pawn collecting its own pass spends the dribble through either collection allowance', () => {
  for (const team of ['white', 'black']) for (const freePawn of [false, true]) {
    let state = fixture({team, suffix: 'P1', positions: {'white-P1': [8, 8]}, clear: [[8, 7], [8, 6], [3, 10]]});
    state = pass(state, team, [8, 7]);
    const seed = state.randomState;
    state = move(state, team, 'P1', [8, 7], {freePawn});
    assert.deepEqual(state.positionBudget, budget(!freePawn, freePawn, true));
    assert.equal(state.looseBallKickOrigin, null);
    assert.deepEqual(legalMoves(state, id(team, 'P1')), []);
    assert.deepEqual(legalMoves(state, id(team, 'P1'), {freePawn: true}), []);
    assert.equal(state.randomState, seed);
    if (freePawn) {
      assert.ok(legalMoves(state, id(team, 'R2')).length);
      state = move(state, team, 'R2', [3, 10]);
      assert.equal(state.phase, 'defendMove');
    } else assert.ok(legalMoves(state, id(team, 'P2'), {freePawn: true}).length);
  }
});

test('a different teammate collecting a pass still retains its one dribble, including a free pawn collection', () => {
  for (const team of ['white', 'black']) for (const freePawn of [false, true]) {
    let state = fixture({team, positions: {'white-Q': [1, 7], 'white-P1': [8, 8]}, clear: [[8, 7], [8, 6]]});
    state = pass(state, team, [8, 7]);
    state = move(state, team, 'P1', [8, 7], {freePawn});
    assert.deepEqual(state.positionBudget, budget(!freePawn, freePawn, false));
    assert.equal(state.looseBallKickOrigin, null);
    assert.ok(engine.positionActions(state).dribbleAvailable);
    state = move(state, team, 'P1', [8, 6]);
    assert.deepEqual(state.positionBudget, budget(!freePawn, freePawn, true));
  }
});

test('opponent collection clears pass origin and starts a normal fresh attacking turn', () => {
  for (const team of ['white', 'black']) for (const freePawn of [false, true]) {
    let state = fixture({team, positions: {'black-P1': [8, 8]}, clear: [[8, 7], [8, 6]]});
    state = pass(state, team, [8, 7]);
    state = skipMove(state);
    const defender = other(team), [x, y] = point(team, [8, 7]);
    state = applyMove(state, id(defender, 'P1'), x, y, {freePawn});
    integrity(state);
    assert.equal(state.attack, defender);
    assert.equal(state.phase, 'attackMove');
    assert.equal(state.looseBallKickOrigin, null);
    assert.deepEqual(state.positionBudget, budget());
    assert.ok(engine.positionActions(state).dribbleAvailable);
  }
});

test('accurate teammate receipts, interceptions, and boundary restarts clear any earlier loose-pass origin', () => {
  for (const team of ['white', 'black']) {
    for (const opposing of [false, true]) {
      const receiver = opposing ? 'black-R1' : 'white-R1';
      const state = fixture({team, positions: {[receiver]: [8, 7]}});
      state.looseBallKickOrigin = {team, pieceId: id(team, 'P2')};
      const received = pass(state, team, [8, 7]);
      assert.equal(received.looseBallKickOrigin, null);
      assert.ok(received.ball.carrierId);
    }
    const state = fixture({team, positions: {'white-Q': [1, 12]}, clear: [[1, 0]]});
    state.looseBallKickOrigin = {team, pieceId: id(team, 'P2')};
    const outside = point(team, [-1, 0]);
    const restarted = pass(state, team, [1, 0], {roll: .99, landing: {x: outside[0], y: outside[1]}});
    assert.ok(restarted.restart);
    assert.equal(restarted.looseBallKickOrigin, null);
  }
});

test('version-nine migration infers an old loose pass only when the immediately saved kick proves its origin', () => {
  for (const team of ['white', 'black']) {
    const current = looseQueenPass(team), old = clone(current);
    old.rulesVersion = 8;
    delete old.looseBallKickOrigin;
    const before = clone(old), migrated = normalizeGame(old);
    assert.deepEqual(old, before);
    assert.equal(migrated.rulesVersion,17);
    assert.deepEqual(migrated.looseBallKickOrigin, {team, pieceId: id(team, 'Q'), from: pointObject(team,[1,7])});
    assert.equal(migrated.randomState, old.randomState);
    assert.deepEqual(normalizeGame(migrated), migrated);
    const collected = move(migrated, team, 'Q', [11, 7]);
    assert.equal(collected.positionBudget.dribbleUsed, true);
    for (const modify of [
      state => { state.lastAction.type = 'skip'; },
      state => { state.lastAction.to.x = (state.ball.x + 1) % W; },
      state => { state.lastAction.receiverId = id(team, 'R2'); },
      state => { state.lastAction.pieceId = 'missing-piece'; },
      state => { state.lastAction.team = other(team); },
    ]) {
      const uncertain = clone(old);
      modify(uncertain);
      assert.equal(normalizeGame(uncertain).looseBallKickOrigin, null, 'uncertain history cannot invent a self-pass origin');
    }
    const explicit = clone(current);
    explicit.lastAction = {type: 'skip', team};
    assert.deepEqual(normalizeGame(explicit).looseBallKickOrigin, current.looseBallKickOrigin, 'current serialized provenance does not depend on the last action');
  }
});

function assertTimeoutRestart(state, next) {
  const offendingTeam = currentTeam(state), winner = other(offendingTeam), ballBefore = state.ball;
  const nearest = state.pieces.filter(piece => piece.team === winner).sort((a, b) => Math.hypot(a.x - ballBefore.x, a.y - ballBefore.y) - Math.hypot(b.x - ballBefore.x, b.y - ballBefore.y) || a.id.localeCompare(b.id))[0];
  assert.equal(next.phase, 'attackMove');
  assert.equal(next.attack, winner);
  assert.equal(next.restart?.type, 'timeout');
  assert.equal(next.restart?.reason, 'actionTimeout');
  assert.equal(next.restart?.indirect, true);
  assert.equal(next.restart.takerId, nearest.id, 'the nearest opposing player takes the indirect free kick');
  assert.equal(next.ball.carrierId, nearest.id);
  assert.deepEqual(next.positionBudget, budget());
  assert.equal(next.offside, null);
  assert.equal(next.pendingShot, null);
  assert.equal(next.releaseReason, null);
  assert.equal(next.looseBallKickOrigin, null);
  assert.equal(next.randomState, state.randomState, 'clock enforcement itself is deterministic');
  assert.equal(next.turn, state.turn + 1);
  assert.deepEqual(next.score, state.score);
  assert.equal(next.ballProgress.team, winner);
  assert.equal(next.ballProgress.rounds, 0);
  assert.deepEqual(legalMoves(next, nearest.id), [], 'the restart taker is protected and fixed while both teams settle');
  integrity(next);
  let settled = skipMove(next);
  assert.equal(settled.phase, 'defendMove');
  settled = skipMove(settled);
  assert.equal(settled.phase, 'kick');
  assert.ok(legalKicks(settled).length);
  assert.ok(legalKicks(settled).every(kick => !kick.goal), 'the timeout award is indirect');
}

test('a 30-second action deadline penalizes the current actor in every ordinary phase and color', () => {
  assert.equal(engine.ACTION_SECONDS, 30);
  assert.equal(typeof engine.actionTimeout, 'function');
  for (const team of ['white', 'black']) for (const phase of ['kickoff', 'attackMove', 'defendMove', 'kick', 'keeperRelease']) {
    const suffix = phase === 'keeperRelease' ? 'K' : 'Q';
    const state = fixture({team, phase, suffix, positions: {'black-R1': [3, 7], 'white-K': [6,H-1]}});
    if (phase === 'keeperRelease') state.releaseReason = 'backPass';
    state.positionBudget = budget(true, true, true);
    state.looseBallKickOrigin = {team, pieceId: id(team, 'P2')};
    state.offside = {team, flaggedIds: [id(team, 'R2')]};
    const before = clone(state), next = engine.actionTimeout(state);
    assert.deepEqual(state, before, `${team} ${phase} expiration preserves its undo snapshot`);
    assertTimeoutRestart(state, next);
    assert.deepEqual(engine.actionTimeout(clone(state)), next, 'undo and replay cannot reroll the deterministic restart');
  }
});

test('loose-ball and protected-restart actors cannot stall the clock or retain an earlier restart', () => {
  for (const team of ['white', 'black']) for (const phase of ['attackMove', 'defendMove', 'kick']) {
    for (const kind of ['loose', 'goalKick', 'corner', 'throwIn', 'offside', 'stalling', 'timeout']) {
      const state = fixture({team, phase, suffix: kind === 'goalKick' ? 'K' : 'Q', positions: {'white-K': [6,H-1], 'black-R1': [3, 7]}});
      if (kind === 'loose') state.ball.carrierId = null;
      else state.restart = {type: kind, team, takerId: state.ball.carrierId, spot: {x: state.ball.x, y: state.ball.y}, indirect: ['offside', 'stalling', 'timeout'].includes(kind)};
      const before = clone(state), next = engine.actionTimeout(state);
      assert.deepEqual(state, before);
      assertTimeoutRestart(state, next);
    }
  }
});

test('keeper reaction expiration resolves the declared shot by holding with the normal seeded outcome', () => {
  for (const team of ['white', 'black']) for (const seed of [1, 73, 581, 901]) {
    const state = fixture({team, seed, suffix: 'N1', positions: {'white-N1': [4,1], 'black-K': [5,0]}});
    const [x, y] = point(team, [5,-1]);
    const pending = applyKick(state, x, y), before = clone(pending);
    const expected = skipMove(pending), next = engine.actionTimeout(pending);
    assert.deepEqual(pending, before);
    assert.equal(next.lastAction.timedOutTeam, other(team));
    assert.equal(next.lastAction.type, expected.lastAction.type);
    assert.equal(next.lastAction.roll, expected.lastAction.roll);
    assert.deepEqual(next.lastAction.shotModel, expected.lastAction.shotModel);
    for (const key of ['score', 'pieces', 'ball', 'phase', 'attack', 'restart', 'pendingShot', 'offside', 'randomState', 'turn']) assert.deepEqual(next[key], expected[key], `${key}: expiration cannot cancel or reroll the attacker's shot`);
    assert.notEqual(next.randomState, pending.randomState);
    assert.deepEqual(engine.actionTimeout(clone(pending)), next, 'pending-shot serialization preserves the automatic hold outcome');
    integrity(next);
  }
});

test('finished matches ignore action expiration without mutating state or consuming random outcomes', () => {
  const state = fixture();
  state.phase = 'finished';
  const before = clone(state), next = engine.actionTimeout(state);
  assert.deepEqual(state, before);
  assert.deepEqual(next, before);
  assert.notEqual(next, state, 'the no-op still preserves pure transition semantics');
});

test('saved pending knight shots refresh stale bonuses with the selected current model after loading or undo', () => {
  for (const team of ['white', 'black']) {
    const initial = fixture({team, suffix: 'N1', positions: {'white-N1': [4,1], 'black-K': [5,0]}});
    const [x, y] = point(team, [5,-1]);
    const pending = applyKick(initial, x, y), legacy = clone(pending);
    legacy.rulesVersion = 8;
    legacy.lastAction.probability = 1;
    legacy.lastAction.shotModel = {...legacy.lastAction.shotModel, probability: 1, goalProbability: 1, scoringMultiplier:99, modelVersion: 6};
    const before = clone(legacy), restored = normalizeGame(legacy);
    assert.deepEqual(legacy, before);
    assert.equal(restored.rulesVersion,17);
    assert.equal(restored.randomState, legacy.randomState);
    assert.equal(restored.pendingShot.shooterType, 'N', 'movement identity is retained independently of scoring strength');
    const details = shotModel(restored);
    assert.equal(details.modelVersion,13);
    assert.equal(engine.SHOT_MODEL.knightGoalMultiplier,1);
    assert.equal(details.scoringMultiplier,1);
    assert.equal(details.goalProbability,details.baseGoalProbability);
    assert.deepEqual(restored.lastAction.shotModel, details);
    assert.equal(restored.lastAction.probability, details.goalProbability);
    assert.deepEqual(skipMove(restored),skipMove(pending),'restoration cannot retain stale odds or an obsolete scoring bonus');
    assert.deepEqual(normalizeGame(clone(restored)), restored);
  }
});

test('close-range shooting curves remain shared without a knight finishing bonus', () => {
  for (const team of ['white', 'black']) for (const keeper of [[5,0],[8,0]]) {
    const state = fixture({team, suffix: 'N1', positions: {'white-N1': [4,1], 'black-K': keeper}});
    const [x, y] = point(team, [5,-1]);
    const reference = shotModel(state, x, y);
    for (const type of ['K', 'Q', 'R', 'B', 'N', 'P']) {
      const changed = clone(state);
      changed.pieces.find(piece => piece.id === id(team, 'N1')).type = type;
      const model = shotModel(changed, x, y);
      assert.equal(model.shooterType, type);
      assert.equal(model.distancePenaltyRate, type === 'R' ? .03 : .06);
      for(const key of ['baseOnTargetProbability','baseGoalProbability','distance','postAngleFactor','wideAngleFactor','centralLaneFactor','goalOpeningRatio','arrivalSpeed','keeperPathDistance','timeToKeeper','reach','keeperInBox','blockerIds'])assert.deepEqual(model[key],reference[key],`${type}: shared base curve and geometry`);
      assert.equal(model.scoringMultiplier,1);
      assert.equal(model.goalProbability,Math.min(1,model.baseGoalProbability*model.scoringMultiplier));
      assert.ok(Math.abs(model.goalProbability+model.saveProbability+model.missProbability+model.blockProbability-1)<1e-12);
    }
  }
});

test('both AI policies respect the consumed self-collection dribble and take timeout indirect restarts legally', () => {
  for (const difficulty of ['casual', 'tactical']) for (const team of ['white', 'black']) {
    const collected = move(looseQueenPass(team), team, 'Q', [11, 7]);
    const before = clone(collected), action = engine.chooseAIAction(collected, {difficulty});
    assert.deepEqual(collected, before, 'planning cannot rewrite pass provenance or budgets');
    assert.ok(action);
    if (action.type === 'move') {
      assert.notEqual(action.pieceId, id(team, 'Q'), 'an AI cannot dribble after retrieving its own pass');
      assert.ok(legalMoves(collected, action.pieceId, {freePawn: !!action.freePawn}).some(move => move.x === action.x && move.y === action.y));
    } else assert.equal(action.type, 'skip');
    let restarted = engine.actionTimeout(fixture({team, phase: 'kick'}));
    restarted = skipMove(skipMove(restarted));
    const restartAction = engine.chooseAIAction(restarted, {difficulty});
    assert.equal(restartAction.type, 'kick');
    assert.ok(legalKicks(restarted).some(kick => !kick.goal && kick.x === restartAction.x && kick.y === restartAction.y));
    integrity(applyKick(restarted, restartAction.x, restartAction.y, {roll: 0}));
  }
});
