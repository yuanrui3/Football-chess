import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../dist/engine.js';

const other = team => team === 'white' ? 'black' : 'white';
const fresh = () => ({normalUsed: false, pawnUsed: false, dribbleUsed: false});
const point = ([x, y], team) => team === 'black' ? {x, y} : {x: E.BOARD_WIDTH - 1 - x, y: E.BOARD_HEIGHT - 1 - y};
const pieceId = (id, team) => team === 'black' ? id : id.replace(/^(white|black)/, other);

function fixture({team = 'black', foulsEnabled = false, setup = false} = {}) {
  const state = E.createGame({seed: 55, foulsEnabled});
  const assigned = {'white-K': [6, 16], 'black-K': [6, 0], 'white-N1': [6, setup ? 2 : 1]};
  const used = new Set(Object.values(assigned).map(p => p.join(',')));
  const parking = Array.from({length: E.BOARD_HEIGHT}, (_, y) => [[0, y], [E.BOARD_WIDTH - 1, y]]).flat();
  for (const piece of state.pieces) {
    const destination = assigned[piece.id] || parking.find(p => !used.has(p.join(',')));
    used.add(destination.join(','));
    Object.assign(piece, point(destination, team));
    piece.id = pieceId(piece.id, team);
    if (team === 'white') piece.team = other(piece.team);
  }
  const carrier = state.pieces.find(p => p.id === pieceId('white-N1', team));
  Object.assign(state, {attack: other(team), phase: 'defendMove', positionBudget: fresh(),
    ball: {x: carrier.x, y: carrier.y, carrierId: carrier.id}, restart: null, offside: null, pendingShot: null, paceControl: null,
    ballProgress: {team: carrier.team, anchorY: carrier.y, rounds: 0, pendingRelease: false, excludeRelease: false}});
  assert.equal(state.pieces.length, 22);
  assert.equal(new Set(state.pieces.map(p => `${p.x},${p.y}`)).size, 22);
  assert.ok(state.pieces.every(p => E.canOccupySquare(p, p.x, p.y)), 'all pieces occupy legal squares, including the reserved goal mouths');
  return state;
}

for (const team of ['white', 'black']) for (const foulsEnabled of [false, true]) {
  const label = `${team}, fouls ${foulsEnabled ? 'on' : 'off'}`;
  const king = `${team}-K`, knight = `${other(team)}-N1`;

  test(`${label}: the keeper can cleanly win or miss a native-range knight tackle in its own box`, () => {
    const state = fixture({team, foulsEnabled}), before = structuredClone(state);
    const moves = E.legalMoves(state, king).filter(move => move.type === 'tackle');
    assert.ok(moves.length);
    assert.ok(moves.every(move => move.targetId === knight && move.tackleProbability === (foulsEnabled ? .45 : .5)));
    assert.ok(E.legalMoves(state, king, {freePawn: true}).every(move => move.type === 'move'), 'the bonus itself never tackles');
    const tackle = moves.find(move => E.inOwnBox(team, move.x, move.y));
    assert.ok(tackle, 'the keeper may land inside its own box');
    const nextSeed = (Math.imul(1664525, state.randomState) + 1013904223) >>> 0;
    const won = E.applyMove(state, king, tackle.x, tackle.y, {roll: foulsEnabled ? .549999 : .499999});
    assert.equal(won.lastAction.type, 'tackle');
    assert.equal(won.ball.carrierId, king); assert.equal(won.attack, team); assert.equal(won.phase, 'attackMove');
    assert.equal(won.pieces.length, 22); assert.equal(won.randomState, nextSeed);
    const missed = E.applyMove(state, king, tackle.x, tackle.y, {roll: foulsEnabled ? .55 : .5});
    assert.equal(missed.lastAction.type, 'tackleMiss'); assert.equal(missed.lastAction.outcome, 'evaded');
    assert.deepEqual(missed.ball, state.ball); assert.equal(missed.ball.carrierId, knight);
    assert.equal(missed.positionBudget.normalUsed, true); assert.equal(missed.positionBudget.pawnUsed, false);
    assert.equal(missed.phase, 'defendMove'); assert.equal(missed.pieces.length, 22); assert.equal(missed.randomState, nextSeed);
    assert.deepEqual(E.legalMoves(missed, king), [], 'the failed tackle spends the ordinary action');
    assert.ok(E.legalMoves(missed, king, {freePawn: true}).length, 'the shared bonus remains available');
    assert.match(missed.log.at(-1), /knight evades the tackle/);
    assert.deepEqual(state, before, 'previews and both resolutions preserve the source state');
    if (foulsEnabled) {
      const foul = E.applyMove(state, king, tackle.x, tackle.y, {roll: .08});
      assert.equal(foul.lastAction.type, 'foul'); assert.equal(foul.restart.type, 'penalty');
      assert.equal(foul.restart.team, other(team)); assert.equal(foul.pieces.length, 22);
    }
  });

  test(`${label}: a bonus king step sets up one ordinary knight challenge, with no extra challenge after a miss`, () => {
    const state = fixture({team, foulsEnabled, setup: true});
    assert.ok(!E.legalMoves(state, king).some(move => move.type === 'tackle'), 'the knight starts beyond native king range');
    const destination = point([6, 1], team), setup = E.applyMove(state, king, destination.x, destination.y, {freePawn: true});
    assert.equal(setup.positionBudget.pawnUsed, true); assert.equal(setup.positionBudget.normalUsed, false);
    assert.equal(setup.randomState, state.randomState); assert.deepEqual(setup.ball, state.ball);
    const tackle = E.legalMoves(setup, king).find(move => move.type === 'tackle');
    assert.ok(tackle); assert.equal(tackle.tackleProbability, foulsEnabled ? .45 : .5);
    const missed = E.applyMove(setup, king, tackle.x, tackle.y, {roll: .9});
    assert.equal(missed.lastAction.type, 'tackleMiss'); assert.equal(missed.ball.carrierId, knight); assert.equal(missed.phase, 'kick');
    assert.deepEqual(E.legalMoves(missed, king), []); assert.deepEqual(E.legalMoves(missed, king, {freePawn: true}), []);
    const spent = structuredClone(state); spent.positionBudget.normalUsed = true;
    const repositioned = E.applyMove(spent, king, destination.x, destination.y, {freePawn: true});
    assert.equal(repositioned.phase, 'kick'); assert.deepEqual(E.legalMoves(repositioned, king), [], 'a bonus cannot supply a second ordinary action');
  });

  test(`${label}: Tactical executes a legal keeper challenge, including a bonus setup when necessary`, () => {
    for (const requiresSetup of [false, true]) {
      let state = fixture({team, foulsEnabled, setup: requiresSetup}), challenged = false, bonusSetup = false;
      for (let count = 0; count < 3 && state.phase === 'defendMove'; count++) {
        const before = structuredClone(state), report = E.analyzeTacticalAction(state), action = report.action;
        assert.deepEqual(state, before); assert.ok(report.stats.nodes <= 1400);
        if (action.type === 'skip') { state = E.skipMove(state); continue; }
        assert.equal(action.type, 'move');
        const move = E.legalMoves(state, action.pieceId, {freePawn: !!action.freePawn})
          .find(move => move.x === action.x && move.y === action.y);
        assert.ok(move, 'the AI uses the real phase and remaining action budgets');
        if (action.pieceId === king && action.freePawn) bonusSetup = true;
        if (move.type === 'tackle') {
          assert.equal(action.pieceId, king); assert.equal(!!action.freePawn, false); assert.equal(move.targetId, knight);
          challenged = true;
        }
        state = E.applyMove(state, action.pieceId, action.x, action.y, {freePawn: !!action.freePawn, roll: .4});
        if (challenged) break;
      }
      assert.equal(challenged, true, 'the keeper takes a profitable available challenge before ending its reply');
      if (requiresSetup) assert.equal(bonusSetup, true, 'the ordinary action is saved for the challenge');
      assert.equal(state.lastAction.type, 'tackle'); assert.equal(state.ball.carrierId, king); assert.equal(state.attack, team);
    }
  });
}
