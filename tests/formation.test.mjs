import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BOARD_WIDTH, BOARD_HEIGHT, createGame, currentTeam, isBox,
  legalKicks, applyKick, skipMove, normalizeGame,
} from '../dist/engine.js';

const WHITE_HOME = {
  K: [6, 15], Q: [6, 12], R1: [1, 13], R2: [12, 13],
  B1: [2, 12], B2: [11, 12], N1: [3, 9], N2: [9, 10],
  P1: [5, 13], P2: [7, 13], P3: [9, 13],
};
const clone = value => JSON.parse(JSON.stringify(value));
const other = team => team === 'white' ? 'black' : 'white';
const rotate = ([x, y]) => [BOARD_WIDTH - 1 - x, BOARD_HEIGHT - 1 - y];
const point = (team, coordinates) => team === 'white' ? coordinates : rotate(coordinates);
const player = (state, team, suffix) => state.pieces.find(piece => piece.id === `${team}-${suffix}`);
const xy = piece => [piece.x, piece.y];
const home = (team, suffix) => point(team, WHITE_HOME[suffix]);
const freshBudget = () => ({normalUsed: false, pawnUsed: false, dribbleUsed: false});

function expectedLocation(team, suffix, kickoff) {
  return suffix === 'Q' && team === kickoff ? team === 'white' ? [6, 8] : [7, 8] : home(team, suffix);
}
function assertRoster(state) {
  assert.equal(state.pieces.length, 22);
  assert.equal(new Set(state.pieces.map(piece => piece.id)).size, 22);
  assert.equal(new Set(state.pieces.map(piece => `${piece.x},${piece.y}`)).size, 22, 'the new formation never overlaps players');
  for (const piece of state.pieces) {
    assert.ok(piece.x >= 0 && piece.x < BOARD_WIDTH && piece.y >= 0 && piece.y < BOARD_HEIGHT);
    if (isBox(piece.x, piece.y)) assert.equal(piece.type, 'K', 'the formation reserves the boxes for its goalkeepers');
  }
}
function asKicker(state, team, suffix) {
  const next = clone(state), kicker = player(next, team, suffix);
  next.phase = 'kick';
  next.attack = team;
  next.ball = {x: kicker.x, y: kicker.y, carrierId: kicker.id};
  next.positionBudget = freshBudget();
  next.ballProgress = {team, anchorY: kicker.y, rounds: 0, pendingRelease: false, excludeRelease: false};
  return next;
}
function receiverKick(state, team, suffix, receiverSuffix) {
  const kicking = asKicker(state, team, suffix), receiver = player(kicking, team, receiverSuffix);
  const kick = legalKicks(kicking).find(candidate => candidate.x === receiver.x && candidate.y === receiver.y && candidate.receiverId === receiver.id);
  assert.ok(kick, `${team} ${suffix} has a clear passing connection to ${receiverSuffix}`);
  assert.equal(kick.goal, undefined);
  return {kicking, kick, receiver};
}

test('both modes and kickoff choices use the selected asymmetric formation with only the kickoff queen advanced', () => {
  for (const mode of ['solo', 'local']) for (const kickoff of ['white', 'black']) {
    const state = createGame({mode, kickoff, seed: 31});
    assertRoster(state);
    for (const team of ['white', 'black']) for (const [suffix] of Object.entries(WHITE_HOME)) {
      const piece = player(state, team, suffix);
      assert.equal(piece.team, team);
      assert.equal(piece.type, suffix[0]);
      assert.deepEqual(xy(piece), expectedLocation(team, suffix, kickoff), `${mode} ${kickoff} kickoff: ${piece.id}`);
    }
    const queen = player(state, kickoff, 'Q');
    assert.equal(state.phase, 'kickoff');
    assert.equal(currentTeam(state), kickoff);
    assert.deepEqual(state.ball, {x: queen.x, y: queen.y, carrierId: queen.id});
    assert.deepEqual(state.positionBudget, freshBudget());
    assert.equal(state.rulesVersion, 17, 'the larger pitch uses the current rules version');
  }
});

test('opposite kickoff choices are exact 180-degree color counterparts', () => {
  for (const mode of ['solo', 'local']) {
    const whiteKickoff = createGame({mode, kickoff: 'white', seed: 42});
    const blackKickoff = createGame({mode, kickoff: 'black', seed: 42});
    for (const piece of whiteKickoff.pieces) {
      const counterpart = player(blackKickoff, other(piece.team), piece.id.split('-')[1]);
      assert.equal(counterpart.type, piece.type);
      assert.deepEqual(xy(counterpart), rotate(xy(piece)), `${piece.id} has its rotated opposite-color counterpart`);
    }
    assert.deepEqual([blackKickoff.ball.x, blackKickoff.ball.y], rotate([whiteKickoff.ball.x, whiteKickoff.ball.y]));
    assert.equal(blackKickoff.ball.carrierId, 'black-Q');
    assert.equal(blackKickoff.randomState, whiteKickoff.randomState);
  }
});

test('every formation player starts in its own half, with complete rosters and legal goalkeepers', () => {
  for (const kickoff of ['white', 'black']) {
    const state = createGame({kickoff, seed: 9});
    assertRoster(state);
    for (const team of ['white', 'black']) {
      const squad = state.pieces.filter(piece => piece.team === team);
      assert.equal(squad.length, 11);
      assert.deepEqual(Object.fromEntries(['K', 'Q', 'R', 'B', 'N', 'P'].map(type => [type, squad.filter(piece => piece.type === type).length])), {K: 1, Q: 1, R: 2, B: 2, N: 2, P: 3});
      for (const piece of squad) {
        if (piece.id === `${kickoff}-Q`) assert.equal(piece.y, 8, 'only the kickoff queen occupies the neutral row');
        else assert.ok(team === 'white' ? piece.y > 8 : piece.y < 8, `${piece.id} stays in its own half`);
      }
      const keeper = player(state, team, 'K');
      assert.equal(isBox(keeper.x, keeper.y), true);
      assert.equal(keeper.y, team === 'white' ? 15 : 1, 'the keeper starts one row in from its own goal line');
    }
  }
});

test('the wide rooks connect accurately to the nearest pawn in front of the expanded box', () => {
  for (const kickoff of ['white', 'black']) for (const team of ['white', 'black']) for (const [from, to, expectedDistance] of [['R1', 'P1', 4], ['R2', 'P3', 3]]) {
    const state = createGame({kickoff, seed: 12});
    const {kicking, kick, receiver} = receiverKick(state, team, from, to);
    assert.equal(kick.distance, expectedDistance);
    assert.equal(kick.accuracy, 1);
    assert.equal(kick.path.length, expectedDistance + 1, 'the path includes its start and every traveled square');
    const before = clone(kicking), received = applyKick(kicking, receiver.x, receiver.y, {roll: 0});
    assert.deepEqual(kicking, before);
    assert.equal(received.ball.carrierId, receiver.id);
    assert.deepEqual(received.pieces, state.pieces, 'a pass connects the rooks without relocating either player');
  }
});

test('opposite-color bishops, the second bishop outlet and the home queen support the advanced knights behind the pawn screen', () => {
  for (const team of ['white', 'black']) {
    // The other team kicks off so this side's queen remains at its home square.
    const state = createGame({kickoff: other(team), seed: 26});
    const b1 = player(state, team, 'B1'), b2 = player(state, team, 'B2');
    assert.notEqual((b1.x + b1.y) % 2, (b2.x + b2.y) % 2, 'the bishop pair covers both square colors');
    for (const [from, to, expectedDistance] of [['B2', 'N2', 2], ['Q', 'N1', 3]]) {
      const {kick} = receiverKick(state, team, from, to);
      assert.equal(kick.distance, expectedDistance);
      assert.equal(kick.accuracy, 1);
    }
    const {kicking, receiver} = receiverKick(state, team, 'Q', 'N1');
    const received = applyKick(kicking, receiver.x, receiver.y, {roll: 0});
    assert.equal(received.ball.carrierId, `${team}-N1`);
    assert.equal(received.restart, null, 'the home-half knight outlet is onside');
    for (const suffix of ['N1', 'N2']) {
      const knight = player(state, team, suffix);
      assert.ok(team === 'white' ? knight.y < b1.y : knight.y > b1.y, 'both knights start ahead of the bishop line');
    }
    const keeper = player(state, team, 'K'), pawns = ['P1', 'P2', 'P3'].map(suffix => player(state, team, suffix));
    assert.deepEqual(pawns.map(pawn => pawn.y), Array(3).fill(keeper.y + (team === 'white' ? -2 : 2)), 'all three pawns screen in front of the three-row keeper box');
    assert.deepEqual(pawns.map(pawn => pawn.x).sort((a, b) => a - b), team === 'white' ? [5, 7, 9] : [4, 6, 8]);
    for (const pawn of pawns.slice(0, 2)) assert.equal(Math.abs(pawn.x - keeper.x), 1, 'the first two pawns flank the keeper diagonally');
  }
});

function goalFixture(mode, shootingTeam, scoringTeam) {
  const state = createGame({mode, kickoff: other(shootingTeam), seed: 67});
  const shooterId = `${shootingTeam}-R1`;
  const upper = scoringTeam === 'white';
  const assigned = {'white-K': [6, 15], 'black-K': [7, 1], [shooterId]: upper ? [5, 3] : [8, 13]};
  const occupied = new Set(Object.values(assigned).map(pair => pair.join(',')));
  const parking = Array.from({length: 17}, (_, y) => [[0, y], [13, y]]).flat();
  for (const piece of state.pieces) {
    const spot = assigned[piece.id] || parking.find(pair => !occupied.has(pair.join(',')));
    assert.ok(spot);
    [piece.x, piece.y] = spot;
    occupied.add(spot.join(','));
  }
  state.score = {white: 2, black: 4};
  state.turn = 11;
  const kicking = asKicker(state, shootingTeam, 'R1');
  return {state: kicking, x: upper ? 5 : 8, y: upper ? -1 : 17};
}

test('goals at either end, including own goals, reset all 22 players to the new formation and the conceding kickoff', () => {
  for (const mode of ['solo', 'local']) for (const shootingTeam of ['white', 'black']) for (const scoringTeam of ['white', 'black']) {
    const {state, x, y} = goalFixture(mode, shootingTeam, scoringTeam), before = clone(state);
    const shot = legalKicks(state).find(kick => kick.x === x && kick.y === y && kick.goal === scoringTeam);
    assert.ok(shot, 'the actual ray reaches the intended goal');
    const pending = applyKick(state, x, y);
    assert.equal(pending.phase, 'keeperReact');
    assert.ok(pending.lastAction.probability > 0, 'zero is a valid test roll inside this goal probability');
    const result = skipMove(pending, {roll: 0});
    assert.deepEqual(state, before, 'the pre-goal undo snapshot is untouched');
    assert.equal(result.lastAction.type, 'goal');
    assert.equal(result.lastAction.ownGoal, shootingTeam !== scoringTeam);
    assert.equal(result.score[scoringTeam], before.score[scoringTeam] + 1);
    assert.equal(result.score[other(scoringTeam)], before.score[other(scoringTeam)]);
    assert.equal(result.mode, mode);
    assert.equal(result.turn, before.turn + 1);
    const conceding = other(scoringTeam), fresh = createGame({mode, kickoff: conceding, seed: 67});
    assert.deepEqual(result.pieces, fresh.pieces, 'every reset position uses the selected formation, not the previous live/custom arrangement');
    assert.deepEqual(result.ball, fresh.ball);
    assert.equal(result.attack, conceding);
    assert.equal(result.phase, 'kickoff');
    assert.deepEqual(result.positionBudget, freshBudget());
    assert.equal(result.pendingShot, null);
    assert.equal(result.restart, null);
    assert.equal(result.offside, null);
    assert.equal(result.looseBallKickOrigin, null);
    assertRoster(result);
  }
});

test('loading or undoing an active custom position preserves every coordinate and the seeded match state', () => {
  for (const mode of ['solo', 'local']) for (const shootingTeam of ['white', 'black']) {
    const {state} = goalFixture(mode, shootingTeam, shootingTeam);
    for (const phase of ['attackMove', 'defendMove', 'kick', 'finished']) {
      const snapshot = clone(state);
      snapshot.phase = phase;
      snapshot.positionBudget = {normalUsed: true, pawnUsed: false, dribbleUsed: false};
      const before = clone(snapshot), restored = normalizeGame(snapshot);
      assert.deepEqual(snapshot, before);
      assert.deepEqual(restored, before, `${mode} ${phase}: changing defaults must never rearrange a saved or undone match`);
      assert.deepEqual(normalizeGame(clone(restored)), restored);
      assert.equal(restored.rulesVersion, 17);
    }
    const legacy = clone(state);
    legacy.rulesVersion = 13;
    delete legacy.looseBallKickOrigin;
    const migrated = normalizeGame(legacy);
    assert.deepEqual(migrated.pieces, legacy.pieces, 'an older rule tag with current board dimensions preserves valid custom positions');
    assert.deepEqual(migrated.ball, legacy.ball);
    assert.equal(migrated.rulesVersion, 17);
    assert.equal(migrated.randomState, legacy.randomState);
  }
});
