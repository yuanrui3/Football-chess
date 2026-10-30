import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {E, fixture, point, pieceId, clone} from './helpers/shot-fixture.mjs';
import {createMatchClock, settleMatchClock, tickMatchClock} from '../dist/match-clock.js';
import {completedExerciseRound} from '../dist/exercise-session.js';
import {completedCommentaryRound} from '../dist/commentary.js';
import {runMatch} from '../scripts/simulate.mjs';
import {createMatchStats, recordMatchTransition} from '../dist/match-stats.js';

function scenario(team = 'white') {
  const before = fixture({team, type: 'R', origin: [6, 4], keeper: [6, 1]});
  const outlet = before.pieces.find(p => p.id === pieceId('black-Q', team));
  Object.assign(outlet, point([9, 4], team));
  const aim = point([6, -1], team), pending = E.applyKick(before, aim.x, aim.y);
  const m = E.shotModel(pending);
  const catchRoll = m.goalProbability + m.keeperCornerProbability + m.keeperReboundProbability + m.caughtSaveProbability / 2;
  const caught = E.skipMove(pending, {roll: catchRoll});
  return {before, pending, caught, outlet, model: m};
}

for (const team of ['white', 'black']) {
  test(`${team}: an opponent-shot catch permits an onside pass before either team moves`, () => {
    const {pending, caught, outlet} = scenario(team), original = clone(caught);
    assert.equal(caught.lastAction.outcome, 'saved');
    assert.equal(caught.releaseReason, 'catch');
    assert.equal(E.canQuickRelease(caught), true);
    assert.deepEqual(caught.pieces, pending.pieces);
    assert.equal(caught.restart, null);
    assert.equal(E.currentTeam(caught), outlet.team);
    assert.ok(caught.pieces.every(p => E.legalMoves(caught, p.id).length === 0));
    assert.ok(E.legalKicks(caught).some(k => k.receiverId === outlet.id && !k.offside));
    const distributed = E.applyKick(caught, outlet.x, outlet.y, {roll: 0});
    assert.equal(distributed.ball.carrierId, outlet.id);
    assert.equal(distributed.phase, 'attackMove');
    assert.equal(distributed.releaseReason, null);
    assert.equal(distributed.turn, caught.turn + 1);
    assert.deepEqual(distributed.pieces, pending.pieces, 'no defensive or attacking relocation before the pass');
    assert.equal(E.canQuickRelease(distributed), false);
    assert.equal(completedExerciseRound(caught, distributed), true);
    assert.equal(completedCommentaryRound(caught, distributed), true);
    assert.deepEqual(caught, original);
  });

  test(`${team}: holding keeps all normal actions without consuming a round or randomness`, () => {
    const {caught} = scenario(team), original = clone(caught), held = E.skipMove(caught);
    assert.equal(held.phase, 'attackMove');
    assert.equal(held.releaseReason, null);
    assert.equal(held.lastAction.heldCatch, true);
    for (const field of ['pieces', 'ball', 'ballProgress', 'paceControl', 'turn', 'randomState', 'offside']) assert.deepEqual(held[field], caught[field], field);
    assert.deepEqual(held.positionBudget, {normalUsed: false, pawnUsed: false, dribbleUsed: false});
    assert.equal(E.positionActions(held).dribbleAvailable, true);
    assert.equal(E.canQuickRelease(held), false);
    assert.equal(E.legalKicks(held).length, 0, 'declining cannot be undone by another free quick pass');
    assert.equal(E.skipMove(held).phase, 'defendMove');
    assert.equal(completedExerciseRound(caught, held), false);
    assert.equal(completedCommentaryRound(caught, held), false);
    assert.deepEqual(caught, original);
  });

  test(`${team}: a wide shot still requires both protected positioning turns`, () => {
    const {pending, caught, model} = scenario(team);
    const wide = E.skipMove(pending, {roll: model.goalProbability + model.saveProbability + model.missProbability / 2});
    assert.equal(wide.restart.type, 'goalKick');
    assert.equal(E.canQuickRelease(wide), false);
    assert.equal(wide.phase, 'attackMove');
    assert.equal(E.legalKicks(wide).length, 0);
    const response = E.skipMove(wide);
    assert.equal(response.phase, 'defendMove');
    assert.equal(E.legalKicks(response).length, 0);
    const ready = E.skipMove(response);
    assert.equal(ready.phase, 'kick');
    assert.ok(E.legalKicks(ready).length > 0);
    assert.deepEqual(caught.lastAction.shotModel, wide.lastAction.shotModel, 'quick distribution changes no shooting odds');
  });

  test(`${team}: reload preserves the offer, holding, and the chosen pass exactly`, () => {
    const {caught, outlet} = scenario(team), restored = E.normalizeGame(caught);
    assert.deepEqual(restored, caught);
    assert.deepEqual(E.skipMove(restored), E.skipMove(caught));
    assert.deepEqual(E.applyKick(restored, outlet.x, outlet.y, {roll: 0}), E.applyKick(caught, outlet.x, outlet.y, {roll: 0}));
    const held = E.skipMove(caught);
    assert.equal(E.canQuickRelease(E.normalizeGame(held)), false);
    const old = {...clone(held), rulesVersion: 19};
    assert.equal(E.canQuickRelease(E.normalizeGame(old)), false, 'historic saves do not gain a new action on reload');
  });

  test(`${team}: normal blockers and offside still constrain quick distribution`, () => {
    const {caught, outlet} = scenario(team);
    const blocker = caught.pieces.find(p => p.id === pieceId('white-B1', team));
    Object.assign(blocker, point([7, 2], team));
    assert.equal(E.legalKicks(caught).some(k => k.receiverId === outlet.id), false, 'a catch cannot loft through a blocker');
    const {caught: offside} = scenario(team);
    Object.assign(offside.pieces.find(p => p.id === outlet.id), point([6, 13], team));
    Object.assign(offside.pieces.find(p => p.id === pieceId('white-R1', team)), point([5, 4], team));
    const target = point([6, 13], team);
    assert.equal(E.legalKicks(offside).find(k => k.x === target.x && k.y === target.y)?.offside, true);
    const result = E.applyKick(offside, target.x, target.y, {roll: 0});
    assert.equal(result.lastAction.type, 'offside');
    assert.equal(result.restart.type, 'offside');
    assert.equal(E.canQuickRelease(result), false);
  });

  test(`${team}: timing out holds, and a catch at full time ends the match`, () => {
    const {pending, caught} = scenario(team), held = E.actionTimeout(caught);
    assert.equal(held.lastAction.heldCatch, true);
    assert.equal(held.lastAction.timedOutTeam, caught.attack);
    assert.equal(held.restart, null);
    assert.equal(held.turn, caught.turn);
    assert.equal(held.randomState, caught.randomState);
    const clock = tickMatchClock(createMatchClock({remaining: 1}), 1);
    assert.equal(settleMatchClock(clock, pending, caught).finish, true);
    assert.equal(settleMatchClock(createMatchClock(), pending, caught).finish, false);
  });

  test(`${team}: AI can distribute or hold without consuming the live random seed`, () => {
    const {caught} = scenario(team), before = clone(caught);
    assert.equal(E.chooseAIAction(caught, {difficulty: 'casual'}).type, 'kick', 'Casual uses a reliable outlet');
    for (const difficulty of ['casual', 'tactical']) {
      const action = E.chooseAIAction(caught, {difficulty});
      assert.ok(['skip', 'kick'].includes(action.type));
      const next = action.type === 'skip' ? E.skipMove(caught) : E.applyKick(caught, action.x, action.y, {roll: 0, passRun: action.passRun});
      assert.equal(E.canQuickRelease(next), false);
      assert.deepEqual(E.chooseAIAction({...caught, randomState: 12}, {difficulty}), action);
    }
    assert.deepEqual(caught, before);
  });

  test(`${team}: holding does not duplicate the shot, save, or keeper rating`, () => {
    const {before, pending, caught} = scenario(team);
    const declared = recordMatchTransition(createMatchStats(before), before, pending);
    const saved = recordMatchTransition(declared, pending, caught);
    const held = recordMatchTransition(saved, caught, E.skipMove(caught));
    assert.deepEqual(held.teams, saved.teams);
    assert.deepEqual(held.playerRatings.players, saved.playerRatings.players);
  });
}

test('invalid quick-release snapshots cannot retain the optional catch phase', () => {
  const {caught} = scenario();
  for (const mutate of [s => {s.ball.carrierId = 'black-Q';}, s => {s.attack = 'white';}, s => {s.pieces.find(p => p.id === 'black-K').y = 3;s.ball.y = 3;}]) {
    const invalid = clone(caught); mutate(invalid);
    assert.equal(E.canQuickRelease(invalid), false);
    assert.equal(E.normalizeGame(invalid).releaseReason, null);
  }
});

test('match and study controls distinguish an optional catch from a compulsory back-pass', async () => {
  const app = await readFile(new URL('../dist/app.js', import.meta.url), 'utf8');
  const studies = await readFile(new URL('../dist/exercises-app.js', import.meta.url), 'utf8');
  assert.match(app, /kicking&&!quickRelease/);
  assert.match(app, /quickRelease\?'Hold & organise/);
  assert.match(app, /Catch · distribute now/);
  assert.match(studies, /canQuickRelease\(game\)\?'Hold & organise/);
});

for (const team of ['white', 'black']) test(`${team}: simulation counts the resolved shot once and holding as no new round`, () => {
  const {before} = scenario(team), aim = point([6, -1], team);
  const forced = {...E, skipMove(state) {
    if (state.phase !== 'keeperReact') return E.skipMove(state);
    const m = E.shotModel(state);
    return E.skipMove(state, {roll: m.goalProbability + m.keeperCornerProbability + m.keeperReboundProbability + m.caughtSaveProbability / 2});
  }};
  const policy = state => state.phase === 'kick' ? {type: 'kick', ...aim} : {type: 'skip'};
  const result = runMatch({rules: forced, initialState: before, whitePolicy: policy, blackPolicy: policy, actionLimit: 3, validate: true});
  assert.equal(result.error, null);
  assert.equal(result.stats[team].completedOrdinaryRounds, 1);
  assert.equal(result.stats[team === 'white' ? 'black' : 'white'].completedOrdinaryRounds, 0);
  assert.equal(result.stats[team].shots, 1);
  assert.equal(result.stats[team].resolvedShots, 1);
});
