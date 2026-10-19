import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../dist/engine.js';
import {commentaryPositionFacts, commentaryTransitionFact} from '../dist/commentary-spatial.js';

const other = team => team === 'white' ? 'black' : 'white';
const point = ([x, y], team) => team === 'white' ? {x, y} : {x: E.BOARD_WIDTH - 1 - x, y: E.BOARD_HEIGHT - 1 - y};
const idFor = (id, team) => team === 'white' ? id : id.replace(/^(white|black)/, other);
const fresh = () => ({normalUsed: false, pawnUsed: false, dribbleUsed: false});

// Small legal public boards isolate the relevant geometry without asking an AI
// to generate a convenient example. All actual transitions use the game rules.
function fixture({team = 'white', carrier = 'white-Q', phase = 'kick', positions = {}, budget = fresh()} = {}) {
  const state = E.createGame({mode: 'local', seed: 73, foulsEnabled: false});
  const placements = {'white-K': [6, 16], 'black-K': [7, 0], 'black-R2': [12, 3], ...positions};
  state.pieces = state.pieces.filter(piece => placements[piece.id]).map(piece => ({...piece,
    id: idFor(piece.id, team), team: team === 'white' ? piece.team : other(piece.team),
    ...point(placements[piece.id], team)}));
  const owner = state.pieces.find(piece => piece.id === idFor(carrier, team));
  assert.ok(owner, 'fixture names a real carrier');
  Object.assign(state, {attack: team, phase, positionBudget: {...budget},
    ball: {x: owner.x, y: owner.y, carrierId: owner.id}, pendingShot: null, restart: null, offside: null,
    passRun: null, lastAction: null, paceControl: null, looseBallKickOrigin: null,
    ballProgress: {team, anchorY: owner.y, rounds: 0, pendingRelease: false, excludeRelease: false}});
  assert.equal(new Set(state.pieces.map(piece => `${piece.x},${piece.y}`)).size, state.pieces.length);
  assert.ok(state.pieces.every(piece => E.canOccupySquare(piece, piece.x, piece.y)));
  return state;
}

const fact = (state, type, field, id) => commentaryPositionFacts(state)
  .find(value => value.type === type && (!field || value[field] === id));
const kickTo = (state, target) => {
  const destination = typeof target === 'string' ? state.pieces.find(piece => piece.id === target) : target;
  assert.ok(E.legalKicks({...state, phase: 'kick'}).some(kick => kick.x === destination.x && kick.y === destination.y));
  return E.applyKick({...state, phase: 'kick'}, destination.x, destination.y, {roll: 0});
};

for (const team of ['white', 'black']) {
  test(`${team}: support means a clear native passing outlet, not a nearby piece behind a blocker`, () => {
    const positions = {'white-Q': [6, 8], 'white-R1': [6, 5]};
    const clear = fixture({team, positions}), receiver = idFor('white-R1', team);
    assert.ok(fact(clear, 'support', 'supporterId', receiver));
    for (const blocker of ['white-B1', 'black-B1']) {
      const blocked = fixture({team, positions: {...positions, [blocker]: [6, 6]}});
      assert.equal(fact(blocked, 'support', 'supporterId', receiver), undefined);
    }
    const wrongShape = fixture({team, carrier: 'white-R1', positions: {'white-R1': [6, 8], 'white-B1': [7, 6]}});
    assert.equal(fact(wrongShape, 'support', 'supporterId', idFor('white-B1', team)), undefined);
  });

  test(`${team}: offside receivers are not advertised as support`, () => {
    const positions = {'white-Q': [6, 7], 'white-R1': [6, 4], 'black-R2': [12, 4]};
    const onside = fixture({team, positions}), receiver = idFor('white-R1', team);
    assert.ok(fact(onside, 'support', 'supporterId', receiver), 'level with the second-last defender is onside');
    const offside = fixture({team, positions: {...positions, 'white-R1': [6, 3]}});
    assert.ok(E.offsideInfo(offside).flaggedIds.includes(receiver));
    assert.equal(fact(offside, 'support', 'supporterId', receiver), undefined);
  });

  test(`${team}: a knight has an L-shaped outlet through traffic, not an adjacent straight outlet`, () => {
    const positions = {'white-N1': [6, 8], 'white-R1': [8, 7], 'white-B1': [7, 8]};
    const state = fixture({team, carrier: 'white-N1', positions}), receiver = idFor('white-R1', team);
    const support = fact(state, 'support', 'supporterId', receiver);
    assert.ok(support);
    assert.match(support.text, /L-shaped jumping pass/);
    assert.doesNotMatch(support.text, /diagonal/, 'a knight jumping pass is not described as a bishop-like diagonal');
    const wrong = fixture({team, carrier: 'white-N1', positions: {...positions, 'white-R1': [6, 7]}});
    assert.equal(fact(wrong, 'support', 'supporterId', receiver), undefined);
  });

  test(`${team}: a real wide final-third delivery is a cross, while a midfield lateral pass is not`, () => {
    const cross = fixture({team, carrier: 'white-R1', positions: {'white-R1': [1, 4], 'white-Q': [6, 4]}});
    const receiver = idFor('white-Q', team);
    assert.ok(fact(cross, 'crossSupport', 'supporterId', receiver));
    assert.equal(commentaryTransitionFact(cross, kickTo(cross, receiver))?.type, 'cross');
    const midfield = fixture({team, carrier: 'white-R1', positions: {'white-R1': [1, 10], 'white-Q': [6, 10]}});
    assert.equal(fact(midfield, 'crossSupport', 'supporterId', receiver), undefined);
    assert.ok(!['cross', 'cutback'].includes(commentaryTransitionFact(midfield, kickTo(midfield, receiver))?.type));
  });

  test(`${team}: a backward wide delivery into the central final third is a cutback`, () => {
    const before = fixture({team, carrier: 'white-B1', positions: {'white-B1': [1, 1], 'white-Q': [4, 4]}});
    const after = kickTo(before, idFor('white-Q', team));
    assert.equal(commentaryTransitionFact(before, after)?.type, 'cutback');
  });

  test(`${team}: a through ball into empty space needs a native onside teammate collection run`, () => {
    const positions = {'white-Q': [4, 8], 'white-B1': [7, 6], 'black-K': [6, 1],
      'black-R1': [5, 5], 'black-B1': [3, 5], 'black-R2': [13, 12]};
    const before = fixture({team, positions}), destination = point([4, 3], team), after = kickTo(before, destination);
    assert.equal(after.ball.carrierId, null);
    assert.ok(E.legalMoves(after, idFor('white-B1', team)).some(move => move.x === destination.x && move.y === destination.y));
    const through = commentaryTransitionFact(before, after);
    assert.equal(through?.type, 'throughBall');
    assert.equal(through.runnerId, idFor('white-B1', team));
    assert.equal(through.live, false, 'the delivery is an observed transition, not a guaranteed future collection');

    // B(5,4) can still collect diagonally at (4,3), but was offside at the kick.
    const offside = fixture({team, positions: {...positions, 'white-B1': [5, 4]}});
    assert.ok(E.offsideInfo(offside).flaggedIds.includes(idFor('white-B1', team)));
    assert.notEqual(commentaryTransitionFact(offside, kickTo(offside, destination))?.type, 'throughBall');
    const noRunner = fixture({team, positions: Object.fromEntries(Object.entries(positions).filter(([id]) => id !== 'white-B1'))});
    assert.notEqual(commentaryTransitionFact(noRunner, kickTo(noRunner, destination))?.type, 'throughBall',
      'the passer cannot be invented as its own receiving teammate');
  });

  test(`${team}: a free pawn reposition can set up pressure only while the ordinary challenge remains`, () => {
    const positions = {'white-Q': [6, 8], 'black-P1': [5, 6]};
    const before = fixture({team, phase: 'defendMove', positions}), pawn = idFor('black-P1', team);
    assert.ok(fact(before, 'pawnSetup', 'defenderId', pawn));
    const destination = point([5, 7], team), after = E.applyMove(before, pawn, destination.x, destination.y, {freePawn: true});
    assert.ok(E.legalMoves(after, pawn).some(move => move.type === 'tackle'));
    assert.ok(fact(after, 'pressing', 'defenderId', pawn));
    const spent = fixture({team, phase: 'defendMove', positions, budget: {...fresh(), normalUsed: true}});
    assert.equal(fact(spent, 'pawnSetup', 'defenderId', pawn), undefined);
    const spentDirect = structuredClone(after); spentDirect.positionBudget.normalUsed = true;
    assert.equal(fact(spentDirect, 'pressing', 'defenderId', pawn), undefined);
  });

  test(`${team}: backward pawn tackles count as pressure; a nearby wrong-shape rook does not`, () => {
    const pawn = fixture({team, phase: 'defendMove', positions: {'white-Q': [6, 8], 'black-P1': [5, 9]}});
    assert.ok(fact(pawn, 'pressing', 'defenderId', idFor('black-P1', team)));
    const rook = fixture({team, phase: 'defendMove', positions: {'white-Q': [6, 8], 'black-R1': [7, 6]}});
    assert.equal(fact(rook, 'pressing', 'defenderId', idFor('black-R1', team)), undefined);
  });

  test(`${team}: a one-on-one requires a genuine shot and includes backward knight challenge threats`, () => {
    const positions = {'white-Q': [6, 3], 'black-K': [6, 1], 'black-R2': [13, 12]};
    const open = fixture({team, positions});
    assert.ok(E.legalKicks(open).some(kick => kick.goal === team && !kick.offside));
    assert.ok(fact(open, 'oneOnOne'));
    const challenged = fixture({team, positions: {...positions, 'black-N1': [8, 4]}});
    const defense = {...challenged, phase: 'defendMove', positionBudget: fresh()};
    assert.ok(E.legalMoves(defense, idFor('black-N1', team)).some(move => move.type === 'tackle'));
    assert.equal(fact(challenged, 'oneOnOne'), undefined);
    const screened = fixture({team, positions: {...positions, 'black-R2': [13, 1], 'white-R1': [6, 2]}});
    assert.equal(fact(screened, 'oneOnOne'), undefined, 'a teammate across the only native shooting ray removes the chance');
  });

  test(`${team}: a body crossed by the shot segment prevents a clear one-on-one even without tackle control`, () => {
    const state = fixture({team, positions: {'white-Q': [2, 3], 'white-K': [6, 15], 'black-K': [6, 1],
      'black-B1': [3, 3], 'black-R1': [13, 12], 'black-R2': null}});
    const bishop = idFor('black-B1', team), shots = E.legalKicks(state).filter(kick => kick.goal === team && !kick.offside);
    assert.equal(shots.length, 1, 'the carrier has only one native attacking shot');
    assert.ok(shots[0].shotModel.blockerIds.includes(bishop), 'the exact shot-square intersection includes the body on the shooter rank');
    assert.ok(!E.legalMoves({...state, phase: 'defendMove', positionBudget: fresh()}, bishop).some(move => move.type === 'tackle'),
      'the bishop cannot tackle horizontally, so checking tackle control alone misses this obstruction');
    assert.equal(fact(state, 'oneOnOne'), undefined);
    assert.ok(fact(state, 'shotTraffic'), 'commentary can describe the real shot through traffic instead');
  });

  test(`${team}: screening is an opponent cutting a previously open native passing lane`, () => {
    const before = fixture({team, phase: 'defendMove', positions: {'white-Q': [6, 8], 'white-R1': [6, 4], 'black-B1': [4, 4]}});
    const receiver = idFor('white-R1', team), defender = idFor('black-B1', team), destination = point([6, 6], team);
    assert.ok(E.legalKicks({...before, phase: 'kick'}).some(kick => kick.receiverId === receiver && !kick.offside));
    const after = E.applyMove(before, defender, destination.x, destination.y);
    const screened = commentaryTransitionFact(before, after);
    assert.equal(screened?.type, 'screenMove'); assert.equal(screened.defenderId, defender); assert.equal(screened.receiverId, receiver);
    assert.ok(fact(after, 'blockedLane', 'defenderId', defender));

    const friendly = fixture({team, positions: {'white-Q': [6, 8], 'white-R1': [6, 4], 'white-B1': [6, 6]}});
    assert.equal(fact(friendly, 'blockedLane', 'receiverId', receiver), undefined,
      'friendly congestion is not credited to an opposing screening defender');
    const jumping = fixture({team, carrier: 'white-N1', positions: {'white-N1': [6, 8], 'white-R1': [8, 7], 'black-B1': [7, 8]}});
    assert.equal(fact(jumping, 'blockedLane', 'receiverId', receiver), undefined,
      'an intervening body cannot screen a knight jump pass');
  });

  test(`${team}: a forward off-ball run is described as support only when it opens an onside native connection`, () => {
    const before = fixture({team, phase: 'attackMove', positions: {'white-Q': [6, 8], 'white-B1': [9, 9]}});
    const runner = idFor('white-B1', team), destination = point([7, 7], team);
    const after = E.applyMove(before, runner, destination.x, destination.y);
    assert.equal(commentaryTransitionFact(before, after)?.type, 'run');
    const offsideBefore = fixture({team, phase: 'attackMove', positions: {'white-Q': [6, 4], 'white-B1': [9, 5], 'black-R2': [12, 4]}});
    const offsideDestination = point([7, 3], team), offsideAfter = E.applyMove(offsideBefore, runner, offsideDestination.x, offsideDestination.y);
    assert.ok(E.offsideInfo(offsideAfter).flaggedIds.includes(runner));
    assert.notEqual(commentaryTransitionFact(offsideBefore, offsideAfter)?.type, 'run');
  });

  test(`${team}: a forward run that preserves an existing outlet does not invent a newly opened lane`, () => {
    const before = fixture({team, phase: 'attackMove', positions: {'white-Q': [6, 8], 'white-R1': [6, 6]}});
    const runner = idFor('white-R1', team), destination = point([6, 4], team);
    assert.ok(fact(before, 'support', 'supporterId', runner), 'the runner was already a clear receiving option');
    const after = E.applyMove(before, runner, destination.x, destination.y), run = commentaryTransitionFact(before, after);
    assert.equal(run?.type, 'run');
    assert.match(run.text, /staying available/);
    assert.doesNotMatch(run.text, /opened|new lane/, 'changing depth does not necessarily create a passing lane that was absent before');
  });

  test(`${team}: carrying into space is not claimed when the destination exposes a native challenge`, () => {
    const positions = {'white-Q': [6, 8]}, destination = point([6, 5], team), carrier = idFor('white-Q', team);
    const before = fixture({team, phase: 'attackMove', positions});
    assert.equal(commentaryTransitionFact(before, E.applyMove(before, carrier, destination.x, destination.y))?.type, 'dribbleSpace');
    const exposed = fixture({team, phase: 'attackMove', positions: {...positions, 'black-B1': [8, 3]}});
    const after = E.applyMove(exposed, carrier, destination.x, destination.y);
    assert.ok(E.legalMoves({...after, phase: 'defendMove', positionBudget: fresh()}, idFor('black-B1', team)).some(move => move.type === 'tackle'));
    assert.notEqual(commentaryTransitionFact(exposed, after)?.type, 'dribbleSpace');
  });

  test(`${team}: pass-and-run availability is not an executed run, and one-two needs observed run evidence`, () => {
    const before = fixture({team, positions: {'white-Q': [6, 8], 'white-B1': [6, 6]}});
    const receiver = before.pieces.find(piece => piece.id === idFor('white-B1', team));
    const passed = E.applyKick(before, receiver.x, receiver.y, {passRun: true, roll: 0});
    assert.equal(passed.lastAction.passRunAvailable, true);
    assert.notEqual(commentaryTransitionFact(before, passed)?.type, 'passRun');
    const destination = point([7, 7], team), run = E.applyMove(passed, idFor('white-Q', team), destination.x, destination.y);
    assert.equal(run.lastAction.passRun, true);
    assert.equal(commentaryTransitionFact(passed, run)?.type, 'passRun');
    const returned = kickTo(run, idFor('white-Q', team));
    const prior = {team, pieceId: idFor('white-Q', team), receiverId: idFor('white-B1', team),
      from: point([6, 8], team), to: point([6, 6], team), turn: passed.turn, ran: true};
    assert.equal(commentaryTransitionFact({...run, phase: 'kick'}, returned, {passes: [prior]})?.type, 'oneTwo');
    assert.notEqual(commentaryTransitionFact({...run, phase: 'kick'}, returned, {passes: [{...prior, ran: false}]})?.type, 'oneTwo');
  });
}

test('spatial inspection is pure and cannot consume randomness or mutate public game snapshots', () => {
  const before = fixture({positions: {'white-Q': [6, 8], 'white-R1': [6, 5]}}), after = kickTo(before, 'white-R1');
  const snapshot = structuredClone({before, after});
  for (let count = 0; count < 3; count++) {
    commentaryPositionFacts(before); commentaryPositionFacts(after); commentaryTransitionFact(before, after);
  }
  assert.deepEqual({before, after}, snapshot);
});

test('loose balls, restarts, keeper reactions and malformed boards do not invent normal possession tactics', () => {
  const normal = fixture({positions: {'white-Q': [6, 8], 'white-R1': [6, 5]}});
  const states = [null, undefined, {}, {...normal, pieces: null}, {...normal, ball: null},
    {...normal, ball: {...normal.ball, carrierId: null}},
    {...normal, ball: {...normal.ball, carrierId: 'white-missing'}},
    {...normal, phase: 'kickoff'}, {...normal, phase: 'finished'},
    {...normal, phase: 'keeperReact', pendingShot: {shooterId: 'white-Q'}},
    {...normal, restart: {type: 'corner', team: 'white'}},
    {...normal, pieces: normal.pieces.map(piece => piece.id === 'white-Q' ? {...piece, x: NaN} : piece)}];
  for (const state of states) {
    assert.doesNotThrow(() => commentaryPositionFacts(state));
    assert.deepEqual(commentaryPositionFacts(state), []);
    assert.doesNotThrow(() => commentaryTransitionFact(state, state));
    assert.equal(commentaryTransitionFact(state, state), null);
  }
});
