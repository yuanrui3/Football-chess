import test from 'node:test';
import assert from 'node:assert/strict';
import * as e from '../dist/engine.js';

const clone = structuredClone;
const other = team => team === 'white' ? 'black' : 'white';
const freshBudget = () => ({normalUsed: false, pawnUsed: false, dribbleUsed: false});

// A tactical diagram still has both complete squads. Touchline parking keeps
// irrelevant bodies clear of the central continuation without removing them.
function fixture({phase = 'attackMove', carrier = 'white-Q', positions = {}, ball, budget} = {}) {
  const state = e.createGame({seed: 31029});
  const assigned = {'white-K': [6, 16], 'black-K': [7, 0], ...positions};
  const used = new Set(Object.values(assigned).map(point => point.join(',')));
  assert.equal(used.size, Object.keys(assigned).length, 'diagram has no overlapping assignments');
  const parking = Array.from({length: e.BOARD_HEIGHT}, (_, y) => [[0, y], [e.BOARD_WIDTH - 1, y]]).flat();
  for (const piece of state.pieces) {
    const location = assigned[piece.id] || parking.find(point => !used.has(point.join(',')));
    assert.ok(location);
    [piece.x, piece.y] = location;
    used.add(location.join(','));
  }
  const owner = state.pieces.find(piece => piece.id === carrier);
  state.phase = phase;
  state.attack = owner.team;
  state.ball = ball || {x: owner.x, y: owner.y, carrierId: owner.id};
  state.positionBudget = budget || freshBudget();
  state.restart = null;
  state.offside = null;
  state.pendingShot = null;
  state.releaseReason = phase === 'keeperRelease' ? 'backPass' : null;
  state.looseBallKickOrigin = null;
  state.ballProgress = {team: state.attack, anchorY: state.ball.y, rounds: 0, pendingRelease: false, excludeRelease: false};
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
  if (state.restart) swapped.restart = {...state.restart, team: other(state.restart.team), takerId: id(state.restart.takerId), spot: point(state.restart.spot)};
  if (state.ballProgress) swapped.ballProgress = {...state.ballProgress, team: other(state.ballProgress.team), anchorY: e.BOARD_HEIGHT - 1 - state.ballProgress.anchorY};
  if (state.looseBallKickOrigin) swapped.looseBallKickOrigin = {team: other(state.looseBallKickOrigin.team), pieceId: id(state.looseBallKickOrigin.pieceId)};
  if (state.offside) swapped.offside = {...state.offside, team: other(state.offside.team), kickerId: id(state.offside.kickerId), flaggedIds: state.offside.flaggedIds.map(id), ball: point(state.offside.ball), secondLastY: e.BOARD_HEIGHT - 1 - state.offside.secondLastY};
  return swapped;
}

function legalChoice(state, action) {
  assert.ok(action && typeof action === 'object');
  if (action.type === 'kick') {
    assert.ok(e.legalKicks(state).some(kick => kick.x === action.x && kick.y === action.y), 'chosen kick obeys the public rules');
  } else if (action.type === 'move') {
    assert.ok(e.legalMoves(state, action.pieceId, {freePawn: !!action.freePawn}).some(move => move.x === action.x && move.y === action.y), 'chosen move obeys the public rules');
  } else {
    assert.equal(action.type, 'skip');
    assert.ok(['attackMove', 'defendMove', 'keeperReact', 'finished'].includes(state.phase) || !state.ball.carrierId, 'fallback only skips a skippable phase');
  }
}

function apply(state, action, overrides = {}) {
  legalChoice(state, action);
  if (action.type === 'kick') return e.applyKick(state, action.x, action.y, overrides);
  if (action.type === 'move') return e.applyMove(state, action.pieceId, action.x, action.y, {freePawn: !!action.freePawn, ...overrides});
  return e.skipMove(state, overrides);
}

function analysis(state, options = {}) {
  const before = clone(state);
  const report = e.analyzeTacticalAction(state, options);
  assert.deepEqual(state, before, 'search leaves the playable and undo snapshot intact');
  legalChoice(state, report.action);
  assert.ok(Number.isFinite(report.value), 'the reported evaluation is finite');
  for (const name of ['nodes', 'completedDepth', 'cacheHits', 'extensions', 'cutoffs']) {
    assert.ok(Number.isInteger(report.stats[name]) && report.stats[name] >= 0, `${name} is a nonnegative diagnostic count`);
  }
  assert.equal(typeof report.stats.aborted, 'boolean');
  if (options.nodeLimit !== undefined) assert.ok(report.stats.nodes <= options.nodeLimit, 'all expanded nodes, including extensions, fit the deterministic allowance');
  assert.ok(Array.isArray(report.line));
  if (report.line.length) {
    assert.deepEqual(report.line[0].action, report.action);
    assert.equal(report.line[0].team, e.currentTeam(state));
    assert.equal(report.line[0].phase, state.phase);
  }
  return report;
}

test('iterative Tactical analysis retains a legal completed answer when its next iteration is interrupted', () => {
  const state = e.createGame({seed: 31029});
  const shallow = analysis(state, {maxDepth: 1, nodeLimit: 20000});
  assert.equal(shallow.stats.completedDepth, 1);
  assert.equal(shallow.stats.aborted, false);
  const interrupted = analysis(state, {maxDepth: 8, nodeLimit: shallow.stats.nodes});
  assert.equal(interrupted.stats.completedDepth, 1, 'the complete first iteration survives the next iteration exhausting its allowance');
  assert.equal(interrupted.stats.aborted, true);
  assert.deepEqual(interrupted.action, shallow.action, 'an incomplete root scan must not replace the completed iteration');
  assert.equal(interrupted.value, shallow.value);
  const tiny = analysis(state, {maxDepth: 8, nodeLimit: 1});
  assert.equal(tiny.stats.aborted, true);
  assert.equal(tiny.stats.completedDepth, 0);
});

test('bounded Tactical analysis is repeatable and never consults the future outcome seed', () => {
  const state = fixture({phase: 'defendMove', carrier: 'white-N1', positions: {'white-N1': [5, 7], 'black-R1': [5, 3]}});
  const options = {maxDepth: 4, nodeLimit: 450};
  const first = analysis(state, options);
  for (const randomState of [0, 0xffffffff, 873591]) {
    const changedSeed = {...clone(state), randomState};
    const again = analysis(changedSeed, options);
    assert.deepEqual(again, first, 'action, reported value and node allocation depend on the visible board only');
  }
});

test('transposition reuse preserves the fully completed result of the uncached search', () => {
  const state = fixture({positions: {'white-Q': [5, 8], 'white-P1': [3, 8], 'white-P2': [8, 10], 'black-Q': [8, 4]}});
  const options = {maxDepth: 3, nodeLimit: 50000, extensions: false};
  const cached = analysis(state, {...options, useCache: true});
  const uncached = analysis(state, {...options, useCache: false});
  assert.equal(cached.stats.completedDepth, options.maxDepth);
  assert.equal(uncached.stats.completedDepth, options.maxDepth);
  assert.equal(cached.stats.aborted, false);
  assert.equal(uncached.stats.aborted, false);
  assert.deepEqual(cached.action, uncached.action);
  assert.ok(Math.abs(cached.value - uncached.value) < 1e-8, 'cache entries do not change minimax or probability values');
  assert.equal(uncached.stats.cacheHits, 0);
  assert.ok(cached.stats.cacheHits > 0, 'commuting positioning actions or completed iterations reuse a known position');
  assert.ok(cached.stats.nodes < uncached.stats.nodes, 'reuse saves actual expansions rather than merely counting lookups');
});

test('a cutoff bound tied with the best score cannot replace a proven stronger defensive continuation', () => {
  // This diagram originated after action 215 of a Casual game, seed 53003;
  // its keeper was moved into the new 14×17 own box. The original bug treated
  // a pruned R2 branch's upper bound as an exact tie and replaced the proven
  // stronger B2 continuation. Both cache modes must still finish with that
  // continuation and the same recalculated value on the expanded pitch.
  const state = fixture({phase: 'defendMove', carrier: 'black-N1', positions: {
    'white-K': [6, 15], 'white-Q': [7, 5], 'white-R1': [2, 9], 'white-R2': [6, 4],
    'white-B1': [9, 3], 'white-B2': [1, 2], 'white-N1': [1, 3], 'white-N2': [6, 5],
    'white-P1': [2, 8], 'white-P2': [6, 7], 'white-P3': [8, 6],
    'black-K': [7, 1], 'black-Q': [0, 6], 'black-R1': [8, 3], 'black-R2': [3, 6],
    'black-B1': [3, 8], 'black-B2': [2, 1], 'black-N1': [5, 5], 'black-N2': [3, 7],
    'black-P1': [6, 6], 'black-P2': [5, 8], 'black-P3': [4, 4],
  }});
  state.turn = 40;
  state.randomState = 1511478564;
  state.offside = {team: 'black', kickerId: 'black-K', ball: {x: 7, y: 1}, secondLastY: 9, flaggedIds: []};
  state.ballProgress = {team: 'black', anchorY: 4, rounds: 0, pendingRelease: false, excludeRelease: false};
  const expected = {type: 'move', pieceId: 'white-B2', x: 5, y: 6, freePawn: false};
  const options = {maxDepth: 5, nodeLimit: 50000, extensions: false};
  for (const useCache of [true, false]) {
    const report = analysis(state, {...options, useCache});
    assert.equal(report.stats.completedDepth, options.maxDepth);
    assert.equal(report.stats.aborted, false);
    assert.deepEqual(report.action, expected, 'preserve the genuinely best defensive continuation when another branch only ties its bound');
    assert.equal(report.value, -93.8, 'the verified defensive continuation retains its value after non-goal utility is scaled by 0.35');
  }
});

test('Tactical horizon extensions resolve a close finish instead of valuing an unresolved shot as possession, either color', () => {
  const original = fixture({phase: 'kick', carrier: 'white-R1', positions: {'white-R1': [5, 3], 'black-K': [8, 0]}});
  for (const state of [original, mirrored(original)]) {
    const report = analysis(state, {maxDepth: 1, nodeLimit: 12000});
    assert.equal(report.stats.completedDepth, 1);
    assert.ok(report.stats.extensions > 0, 'the horizon is extended through a declared shot and keeper response');
    const shot = e.legalKicks(state).find(kick => kick.x === report.action.x && kick.y === report.action.y);
    assert.equal(shot?.goal, state.attack, 'take the close finish rather than postpone it for a weak pass');
    const pending = apply(state, report.action, {roll: 0});
    assert.equal(pending.phase, 'keeperReact');
    const keeper = e.chooseAIAction(pending, {difficulty: 'tactical'});
    assert.equal(apply(pending, keeper, {roll: 0}).score[state.attack], state.score[state.attack] + 1);
  }
});

test('Tactical wins certain possession during its defensive turn, either color', () => {
  const original = fixture({phase: 'defendMove', positions: {'white-Q': [5, 5], 'black-R1': [5, 9]}});
  for (let state of [original, mirrored(original)]) {
    const actor = e.currentTeam(state);
    let wonBy = null;
    // Repositioning the bonus pawn before tackling is a valid combination.
    // Judge the completed defending turn, rather than forcing one action order.
    for (let count = 0; count < 3 && state.phase === 'defendMove' && state.attack !== actor; count++) {
      const report = analysis(state, {maxDepth: 5, nodeLimit: 1400});
      if (report.action.type === 'move') {
        const move = e.legalMoves(state, report.action.pieceId, {freePawn: !!report.action.freePawn}).find(move => move.x === report.action.x && move.y === report.action.y);
        if (move.type === 'tackle') {
          assert.equal(move.tackleProbability, 1);
          wonBy = report.action.pieceId;
        }
      }
      state = apply(state, report.action, {roll: 0});
    }
    assert.ok(wonBy, 'use the guaranteed possession-winning challenge before finishing defence');
    assert.equal(state.attack, actor);
    assert.equal(state.ball.carrierId, wonBy);
  }
});

test('forced keeper release remains a kick even when deeper search values a future reposition, either color', () => {
  const original = fixture({phase: 'keeperRelease', carrier: 'white-K', positions: {'white-K': [6, 16], 'white-Q': [6, 11], 'white-R1': [2, 12]}});
  for (const state of [original, mirrored(original)]) {
    const report = analysis(state, {maxDepth: 4, nodeLimit: 650});
    assert.equal(report.action.type, 'kick');
    const next = apply(state, report.action, {roll: 0});
    assert.notEqual(next.ball.carrierId, state.ball.carrierId, 'forced distribution cannot leave the keeper holding the ball');
    assert.equal(next.releaseReason, null);
  }
});

test('the principal continuation obeys real phase ownership and independent movement allowances', () => {
  const original = fixture({phase: 'defendMove', positions: {'white-Q': [5, 5], 'black-R1': [5, 9]}});
  for (let state of [original, mirrored(original)]) {
    const report = analysis(state, {maxDepth: 3, nodeLimit: 5000});
    assert.ok(report.line.length >= 2, 'a completed search exposes more than its root choice');
    const teams = [];
    for (const step of report.line) {
      assert.equal(step.phase, state.phase);
      assert.equal(step.team, e.currentTeam(state));
      legalChoice(state, step.action);
      teams.push(step.team);
      // The diagnostic line picks a representative outcome at chance nodes.
      // Its deterministic prefix can be replayed exactly without assuming a
      // favourable tackle, pass scatter or keeper save from the hidden seed.
      if (state.phase === 'keeperReact') break;
      if (step.action.type === 'kick') {
        const kick = e.legalKicks(state).find(kick => kick.x === step.action.x && kick.y === step.action.y);
        if (!kick.goal && kick.accuracy < 1) break;
      } else if (step.action.type === 'move') {
        const move = e.legalMoves(state, step.action.pieceId, {freePawn: !!step.action.freePawn}).find(move => move.x === step.action.x && move.y === step.action.y);
        if (move.type === 'tackle' && move.tackleProbability < 1) break;
      }
      state = apply(state, step.action, {roll: 0});
    }
    assert.ok(teams.some((team, index) => index && team === teams[index - 1]), 'successive actions may belong to one team rather than alternating after every action');
  }
});

test('editing observable rule state between Tactical decisions never reuses the previous decision cache', () => {
  const state = fixture({positions: {'white-Q': [5, 8], 'white-R1': [2, 8], 'white-P1': [4, 10], 'black-R1': [8, 5]}});
  const options = {maxDepth: 3, nodeLimit: 500};
  analysis(state, options);
  const edits = [
    value => { value.positionBudget = {normalUsed: true, pawnUsed: false, dribbleUsed: true}; },
    value => { value.phase = 'defendMove'; value.positionBudget = freshBudget(); },
    value => { value.phase = 'kick'; value.restart = {type: 'stalling', team: 'white', takerId: 'white-Q', spot: {x: 5, y: 8}, indirect: true}; },
    value => { value.restart = null; value.phase = 'attackMove'; value.offside = {team: 'white', kickerId: 'white-R1', flaggedIds: ['white-P1'], ball: {x: 2, y: 8}, secondLastY: 11}; },
    value => { value.offside = null; value.ballProgress = {team: 'white', anchorY: 8, rounds: 2, pendingRelease: false, excludeRelease: false}; },
    value => { const queen = value.pieces.find(piece => piece.id === 'white-Q'); queen.x = 6; value.ball.x = 6; },
  ];
  for (const edit of edits) {
    edit(state);
    const reused = analysis(state, options), fresh = analysis(clone(state), options);
    assert.deepEqual(reused, fresh, 'in-place edits equal a fresh identical snapshot, including the complete search report');
  }
});
