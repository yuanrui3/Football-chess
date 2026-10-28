import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FORMATION_PRESETS, BOARD_WIDTH, BOARD_HEIGHT, MIDFIELD_RANK,
  createGame, setStartingFormation, normalizeGame, canOccupySquare, inOwnBox,
  legalKicks, applyKick, skipMove,
} from '../dist/engine.js';

const keys = Object.keys(FORMATION_PRESETS);
const teams = ['white', 'black'];
const clone = value => structuredClone(value);
const xy = piece => [piece.x, piece.y];
const player = (state, team, suffix) => state.pieces.find(piece => piece.id === `${team}-${suffix}`);
const rotate = ([x, y]) => [BOARD_WIDTH - 1 - x, BOARD_HEIGHT - 1 - y];
const neutral = {
  K: [6, 15], Q: [6, 12], R1: [1, 13], R2: [12, 13],
  B1: [2, 12], B2: [11, 12], N1: [3, 9], N2: [9, 10],
  P1: [5, 13], P2: [7, 13], P3: [9, 13],
};

test('Neutral preserves the existing starting shape exactly and preset definitions cannot be mutated', () => {
  assert.deepEqual(FORMATION_PRESETS.neutral.positions, neutral);
  assert.deepEqual(keys, ['aggressive', 'neutral', 'defensive']);
  assert.ok(Object.isFrozen(FORMATION_PRESETS));
  for (const preset of Object.values(FORMATION_PRESETS)) {
    assert.ok(preset.name && preset.description && preset.strength && preset.tradeoff);
    assert.ok(Object.isFrozen(preset));
    assert.ok(Object.isFrozen(preset.positions));
    assert.ok(Object.values(preset.positions).every(Object.isFrozen));
  }
  assert.throws(() => {FORMATION_PRESETS.neutral.positions.K[0] = 0;}, TypeError);
});

test('all nine preset pairings and either kickoff are legal, on their own halves, and have accurate non-keeper kickoff outlets', () => {
  for (const white of keys) for (const black of keys) for (const kickoff of teams) for (const mode of ['solo', 'local', 'watch']) {
    const formations = {white, black}, state = createGame({mode, kickoff, formations, seed: 42});
    assert.deepEqual(state.formations, formations);
    assert.equal(state.pieces.length, 22);
    assert.equal(new Set(state.pieces.map(piece => piece.id)).size, 22);
    assert.equal(new Set(state.pieces.map(piece => `${piece.x},${piece.y}`)).size, 22);
    for (const team of teams) {
      const squad = state.pieces.filter(piece => piece.team === team);
      assert.equal(squad.length, 11);
      assert.deepEqual(Object.fromEntries(['K', 'Q', 'R', 'B', 'N', 'P'].map(type => [type, squad.filter(piece => piece.type === type).length])), {K: 1, Q: 1, R: 2, B: 2, N: 2, P: 3});
      for (const piece of squad) {
        assert.ok(canOccupySquare(piece, piece.x, piece.y), piece.id);
        if (piece.id === `${kickoff}-Q`) assert.equal(piece.y, MIDFIELD_RANK);
        else assert.ok(team === 'white' ? piece.y > MIDFIELD_RANK : piece.y < MIDFIELD_RANK, `${piece.id} is in its own half`);
      }
      const keeper = player(state, team, 'K');
      assert.ok(inOwnBox(team, keeper.x, keeper.y));
      const bishops = ['B1', 'B2'].map(suffix => player(state, team, suffix));
      assert.notEqual((bishops[0].x + bishops[0].y) % 2, (bishops[1].x + bishops[1].y) % 2);
      for (const suffix of ['P1', 'P2', 'P3']) assert.deepEqual(xy(player(state, team, suffix)), team === 'white' ? neutral[suffix] : rotate(neutral[suffix]));
    }
    const safeOutlets = legalKicks(state).filter(kick => {
      const receiver = state.pieces.find(piece => piece.id === kick.receiverId);
      return receiver?.team === kickoff && receiver.type !== 'K' && kick.accuracy === 1 && !kick.offside;
    });
    assert.ok(safeOutlets.length > 0, `${white}/${black}/${kickoff} has a native accurate teammate kickoff`);
    assert.deepEqual(state.ball, {x: kickoff === 'white' ? 6 : 7, y: MIDFIELD_RANK, carrierId: `${kickoff}-Q`});
  }
});

test('same presets have exact color-rotation symmetry, and selected teams can use different shapes', () => {
  for (const preset of keys) {
    const white = createGame({kickoff: 'white', formations: {white: preset, black: preset}, seed: 67});
    const black = createGame({kickoff: 'black', formations: {white: preset, black: preset}, seed: 67});
    for (const piece of white.pieces) {
      const counterpart = player(black, piece.team === 'white' ? 'black' : 'white', piece.id.split('-')[1]);
      assert.deepEqual(xy(counterpart), rotate(xy(piece)));
    }
    assert.equal(white.randomState, black.randomState);
  }
  const mixed = createGame({formations: {white: 'aggressive', black: 'defensive'}});
  assert.deepEqual(xy(player(mixed, 'white', 'B1')), [4, 10]);
  assert.deepEqual(xy(player(mixed, 'black', 'B1')), rotate([2, 13]));
});

test('changing one preset preserves the opponent manual arrangement and a manually chosen kickoff taker', () => {
  const state = createGame({seed: 76});
  Object.assign(player(state, 'white', 'Q'), {x: 3, y: 9});
  Object.assign(player(state, 'white', 'N1'), {x: 6, y: 8});
  Object.assign(player(state, 'white', 'R1'), {x: 0, y: 11});
  state.ball = {x: 6, y: 8, carrierId: 'white-N1'};
  const before = clone(state), result = setStartingFormation(state, 'black', 'defensive');
  assert.deepEqual(state, before, 'changing setup is pure');
  assert.deepEqual(result.pieces.filter(piece => piece.team === 'white'), before.pieces.filter(piece => piece.team === 'white'));
  assert.deepEqual(result.ball, before.ball);
  assert.equal(result.randomState, before.randomState);
  assert.deepEqual(result.formations, {white: 'neutral', black: 'defensive'});

  const reset = setStartingFormation(result, 'white', 'aggressive');
  assert.deepEqual(reset.pieces.filter(piece => piece.team === 'black'), result.pieces.filter(piece => piece.team === 'black'));
  assert.deepEqual(reset.ball, {x: 6, y: 8, carrierId: 'white-Q'});
  assert.deepEqual(xy(player(reset, 'white', 'N1')), [3, 9]);
  assert.deepEqual(reset.formations, {white: 'aggressive', black: 'defensive'});
  assert.equal(reset.randomState, state.randomState);
});

test('explicit setup edits reject invalid choices and live play; imported choices fall back without moving live pieces', () => {
  const state = createGame({seed: 1337});
  for (const bad of ['toString', 'constructor', '__proto__', '', null, 3]) {
    assert.throws(() => setStartingFormation(state, 'white', bad), /Choose Aggressive/);
  }
  assert.throws(() => setStartingFormation(state, 'green', 'aggressive'), /Choose Ivory/);
  assert.throws(() => setStartingFormation({...state, phase: 'attackMove'}, 'white', 'aggressive'), /before kickoff/);
  const old = clone(state);
  delete old.formations;
  old.phase = 'defendMove';
  Object.assign(player(old, 'white', 'B1'), {x: 0, y: 10});
  const before = clone(old), restored = normalizeGame(old);
  assert.deepEqual(old, before);
  assert.deepEqual(restored.pieces, old.pieces);
  assert.deepEqual(restored.ball, old.ball);
  assert.equal(restored.randomState, old.randomState);
  assert.deepEqual(restored.formations, {white: 'neutral', black: 'neutral'});
  const imported = normalizeGame({...old, formations: {white: 'constructor', black: 'aggressive'}});
  assert.deepEqual(imported.formations, {white: 'neutral', black: 'aggressive'});
  assert.deepEqual(imported.pieces, old.pieces);
  assert.deepEqual(createGame({formations: {white: 'unknown', black: 'defensive'}}).formations, {white: 'neutral', black: 'defensive'});
  assert.deepEqual(normalizeGame(restored), restored, 'saved choices and live positions round-trip without further repair');
});

function goalFixture(formations, kickoff, dismissed = false) {
  const state = createGame({formations, kickoff, seed: 67, foulsEnabled: true});
  if (dismissed) {
    const sentOff = ['black-K', 'black-Q'].map(id => state.pieces.find(piece => piece.id === id));
    state.sentOff = sentOff.map(piece => ({...piece, yellowCards: 0}));
    for (const piece of sentOff) state.discipline[piece.id] = {yellowCards: 0, redCard: true};
    state.pieces = state.pieces.filter(piece => !sentOff.some(sent => sent.id === piece.id));
    Object.assign(player(state, 'black', 'P1'), {type: 'K', originalType: 'P', replacementKeeper: true});
  }
  const shootingTeam = kickoff === 'white' ? 'black' : 'white';
  const upper = shootingTeam === 'white', shooterId = `${shootingTeam}-R1`;
  const assigned = {
    'white-K': [6, 15], 'black-K': [7, 1],
    ...(dismissed ? {'black-P1': [7, 1]} : {}),
    [shooterId]: upper ? [5, 3] : [8, 13],
  };
  const occupied = new Set();
  const parking = Array.from({length: BOARD_HEIGHT}, (_, y) => [[0, y], [13, y]]).flat();
  for (const piece of state.pieces) {
    const spot = assigned[piece.id] || parking.find(pair => !occupied.has(pair.join(',')));
    [piece.x, piece.y] = spot;
    occupied.add(spot.join(','));
  }
  const shooter = state.pieces.find(piece => piece.id === shooterId);
  state.attack = shootingTeam;
  state.ball = {x: shooter.x, y: shooter.y, carrierId: shooter.id};
  state.phase = 'kick';
  const x = upper ? 5 : 8, y = upper ? -1 : BOARD_HEIGHT;
  assert.ok(legalKicks(state).some(kick => kick.x === x && kick.y === y && kick.goal === shootingTeam));
  return {state, x, y};
}

test('a goal resets each team to its own selected preset, regardless of the previous live arrangement', () => {
  for (const white of keys) for (const black of keys) for (const kickoff of teams) {
    const formations = {white, black}, {state, x, y} = goalFixture(formations, kickoff), before = clone(state);
    const pending = applyKick(state, x, y), result = skipMove(pending, {roll: 0});
    assert.equal(result.lastAction.type, 'goal');
    const expected = createGame({formations, kickoff, seed: 67, foulsEnabled: true});
    assert.deepEqual(result.pieces, expected.pieces);
    assert.deepEqual(result.ball, expected.ball);
    assert.deepEqual(result.formations, formations);
    assert.deepEqual(state, before);
  }
});

test('goal reset keeps dismissals and replacement keeper while honoring mixed presets and a dismissed kickoff queen', () => {
  const formations = {white: 'aggressive', black: 'defensive'};
  const {state, x, y} = goalFixture(formations, 'black', true);
  const result = skipMove(applyKick(state, x, y), {roll: 0});
  assert.equal(result.lastAction.type, 'goal');
  assert.equal(result.pieces.length, 20);
  assert.equal(new Set(result.pieces.map(piece => `${piece.x},${piece.y}`)).size, 20);
  assert.ok(!result.pieces.some(piece => ['black-K', 'black-Q'].includes(piece.id)));
  assert.deepEqual(result.sentOff, state.sentOff);
  assert.deepEqual(result.discipline, state.discipline);
  const replacement = player(result, 'black', 'P1');
  assert.equal(replacement.type, 'K');
  assert.equal(replacement.replacementKeeper, true);
  assert.equal(replacement.originalType, 'P');
  assert.deepEqual(xy(replacement), rotate(FORMATION_PRESETS.defensive.positions.K));
  assert.equal(result.ball.carrierId, 'black-R1');
  assert.deepEqual(xy(player(result, 'black', 'R1')), [7, MIDFIELD_RANK]);
  assert.deepEqual(xy(player(result, 'black', 'N1')), rotate(FORMATION_PRESETS.defensive.positions.N1));
});
