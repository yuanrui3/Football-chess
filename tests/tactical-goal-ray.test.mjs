import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {E, fixture, pieceId} from './helpers/shot-fixture.mjs';

// Audit private goal-only geometry during real search without a production
// test hook. This is the original uncached walk, including live body checks.
const reference = `
function referenceGoalShotTargets(state, carrier) {
  if (!carrier) return [];
  const vectors = carrier.type === 'N' ? KNIGHT : carrier.type === 'P' || carrier.type === 'R' ? STRAIGHTS : carrier.type === 'B' ? DIAGONALS : DIRECTIONS;
  const targets = [];
  for (const [dx, dy] of vectors) {
    if (!dy) continue;
    const path = [{x: carrier.x, y: carrier.y}];
    for (let step = 1; step <= (carrier.type === 'N' ? 1 : BOARD_HEIGHT + 1); step++) {
      const x = carrier.x + dx * step, y = carrier.y + dy * step;
      path.push({x, y});
      if (!inside(x, y)) {
        if (goalAt(x, y) === carrier.team && !friendlyStopsShot(state, carrier, x, y)) targets.push({x, y, goal: carrier.team, path, distance: distance(carrier, {x, y})});
        break;
      }
      if (carrier.type === 'N') break;
      if (pieceAt(state, x, y)?.team === carrier.team) break;
    }
  }
  return targets.sort((a, b) => a.x - b.x);
}
let goalRayAuditCalls = 0;
function goalShotTargets(state, carrier) {
  const actual = productionGoalShotTargets(state, carrier);
  if (JSON.stringify(actual) !== JSON.stringify(referenceGoalShotTargets(state, carrier))) throw new Error('Cached goal targets or paths differ from the uncached walk');
  goalRayAuditCalls++;
  return actual;
}
export function goalRayAuditCount() {return goalRayAuditCalls;}
//# sourceURL=football-chess-goal-ray-audit.mjs
`;
const source = await readFile(new URL('../dist/engine.js', import.meta.url), 'utf8');
const anchor = 'function goalShotTargets(state, carrier) {';
assert.equal(source.split(anchor).length, 2, 'Expected one private goal-ray entry point');
const auditedSource = source.replace(anchor, 'function productionGoalShotTargets(state, carrier) {') + reference;
const I = await import(`data:text/javascript;base64,${Buffer.from(auditedSource).toString('base64')}`);
const settings = {nodeLimit: 700, maxDepth: 1, extensions: false};

function pendingShot(team = 'white', type = 'Q') {
  const state = fixture({team, type, origin: [6, 1]}), options = E.disguisedShotTargets(state);
  assert.equal(options.length, 2);
  return {state, options, pending: E.applyKick(state, options[0].x, options[0].y, {disguise: true})};
}

test('cached goal rays recheck friendly blockers and preserve delayed disguised shots', () => {
  for (const team of ['white', 'black']) for (const type of ['Q', 'N']) {
    const {state, options, pending} = pendingShot(team, type), saved = structuredClone(state);
    const warm = position => {
      const calls = I.goalRayAuditCount();
      assert.deepEqual(I.analyzeTacticalAction(position, settings), E.analyzeTacticalAction(position, settings));
      assert.ok(I.goalRayAuditCount() > calls, 'Exercise the private target generator during actual analysis');
    };
    warm(state);
    if (type === 'Q') {
      const blocked = structuredClone(state), blocker = blocked.pieces.find(piece => piece.id === pieceId('white-R1', team));
      Object.assign(blocker, options[0].path[1]);
      assert.equal(E.legalKicks(blocked).filter(target => target.goal === team).length, 1);
      assert.deepEqual(E.disguisedShotTargets(blocked), []);
      warm(blocked); // Same shooter key, newly occupied path.
      warm(state); // The obstruction disappears again.
    }
    assert.equal(pending.phase, 'keeperReact');
    assert.equal(pending.pendingShot.disguised, true);
    assert.equal(pending.randomState, state.randomState, 'Declaration must not reveal or sample an endpoint');
    const savedPending = structuredClone(pending);
    warm(pending);
    for (const targetRoll of [.25, .75]) {
      assert.deepEqual(I.skipMove(pending, {targetRoll, roll: 0}), E.skipMove(pending, {targetRoll, roll: 0}));
    }
    assert.deepEqual(state, saved);
    assert.deepEqual(pending, savedPending);
  }
});

test('onIteration public previews stay mutable and isolated across nested analysis and exceptions', () => {
  const {pending} = pendingShot(), saved = structuredClone(pending), expected = E.shotModel(pending);
  const preview = () => {
    const model = I.shotModel(pending), path = model.targetOptions[0].path;
    assert.equal(Object.isFrozen(path), false, 'A public preview must not expose a frozen private plan');
    assert.equal(Object.isFrozen(path[0]), false);
    path[0].x += 1000;
    path.push({x: -100, y: -100});
    assert.deepEqual(I.shotModel(pending), expected, 'Mutating one preview must not poison future plans');
  };
  let outerCalls = 0, innerCalls = 0;
  I.analyzeTacticalAction(E.createGame({seed: 2718}), {...settings, onIteration() {
    outerCalls++; preview();
    I.analyzeTacticalAction(E.createGame({seed: 3141}), {...settings, onIteration() {innerCalls++; preview();}});
    preview();
  }});
  assert.ok(outerCalls > 0 && innerCalls > 0, 'Both callback levels must complete an iteration');
  const failure = new Error('intentional iteration callback failure');
  assert.throws(() => I.analyzeTacticalAction(E.createGame({seed: 1618}), {...settings, onIteration() {
    preview(); throw failure;
  }}), error => error === failure);
  preview();
  assert.deepEqual(I.analyzeTacticalAction(E.createGame({seed: 1414}), settings), E.analyzeTacticalAction(E.createGame({seed: 1414}), settings));
  assert.deepEqual(pending, saved);
});
