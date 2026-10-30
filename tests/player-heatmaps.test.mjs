import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {createGame} from '../dist/engine.js';
import {createPlayerHeatmaps, restorePlayerHeatmaps, addPlayerHeatmapTime, playerHeatmapSummary} from '../dist/player-heatmaps.js';
import {createMatchStats, restoreMatchStats, addPossessionTime, recordMatchTransition} from '../dist/match-stats.js';

const live = () => ({...createGame({seed: 12}), phase: 'attackMove', restart: null});
test('time weights actual occupied squares for all 20 outfield pieces without recording keepers or mutating inputs', () => {
  const game = live(), blank = createPlayerHeatmaps(), before = structuredClone(game);
  const first = addPlayerHeatmapTime(blank, game, 1000);
  assert.equal(Object.keys(first.players).length, 20);
  assert.deepEqual(blank.players, {}); assert.deepEqual(game, before);
  const pawn = game.pieces.find(p => p.id === 'white-P1'), original = {x: pawn.x, y: pawn.y};
  pawn.x = 6; pawn.y = 8;
  const second = addPlayerHeatmapTime(first, game, 3000), summary = playerHeatmapSummary(second, pawn.id);
  assert.equal(summary.totalMs, 4000); assert.equal(summary.cells.length, 2);
  assert.deepEqual(summary.cells[0], {x: 6, y: 8, square: 'g9', ms: 3000, share: .75, intensity: 1});
  assert.equal(summary.cells[1].x, original.x); assert.equal(summary.cells[1].y, original.y);
  assert.equal(playerHeatmapSummary(first, pawn.id).totalMs, 1000);
  assert.equal(playerHeatmapSummary(second, 'white-K'), null);
  assert.equal(playerHeatmapSummary(second, 'black-K'), null);
});

test('black rotates both axes to attack upwards while preserving original square labels', () => {
  const game = live(), q = game.pieces.find(p => p.id === 'black-Q');q.x = 2;q.y = 15;
  const summary = playerHeatmapSummary(addPlayerHeatmapTime(createPlayerHeatmaps(), game, 1000), q.id);
  assert.deepEqual(summary.cells[0], {x: 11, y: 1, square: 'c2', ms: 1000, share: 1, intensity: 1});
});

test('sent-off players keep earlier positions and earn no time after leaving the pitch', () => {
  const game = live(); let data = addPlayerHeatmapTime(createPlayerHeatmaps(), game, 2500);
  game.pieces = game.pieces.filter(p => p.id !== 'white-N1');
  data = addPlayerHeatmapTime(data, game, 4000);
  assert.equal(playerHeatmapSummary(data, 'white-N1').totalMs, 2500);
  assert.equal(playerHeatmapSummary(data, 'black-N1').totalMs, 6500);
});

test('an outfielder promoted to goalkeeper stops accumulating outfield time', () => {
  const game = live(), first = addPlayerHeatmapTime(createPlayerHeatmaps(), game, 1000);
  game.pieces.find(p => p.id === 'white-R1').type = 'K';
  const next = addPlayerHeatmapTime(first, game, 2000);
  assert.equal(playerHeatmapSummary(next, 'white-R1').totalMs, 1000);
});

test('kickoff, restart preparation, full time and invalid intervals add no occupancy', () => {
  const blank = createPlayerHeatmaps();
  for (const game of [{...live(), phase: 'kickoff'}, {...live(), phase: 'finished'}, {...live(), restart: {type: 'goalKick'}}]) {
    assert.equal(addPlayerHeatmapTime(blank, game, 1000), blank);
  }
  for (const ms of [0, -5, NaN, Infinity, '100']) assert.equal(addPlayerHeatmapTime(blank, live(), ms), blank);
});

test('save round trips and undo snapshots restore heatmaps without retaining later time', () => {
  const game = live(), first = addPossessionTime(createMatchStats(), game, 1200), saved = JSON.stringify(first);
  let later = addPossessionTime(first, game, 4000);
  const after = {...game, lastAction: {type: 'skip'}};
  later = recordMatchTransition(later, game, after);
  assert.equal(playerHeatmapSummary(later.playerHeatmaps, 'white-Q').totalMs, 5200);
  const undo = restoreMatchStats(JSON.parse(saved), game);
  assert.deepEqual(undo.playerHeatmaps, first.playerHeatmaps);
  const resumed = addPossessionTime(undo, game, 500);
  assert.equal(playerHeatmapSummary(resumed.playerHeatmaps, 'white-Q').totalMs, 1700);
  assert.equal(playerHeatmapSummary(restoreMatchStats(JSON.parse(JSON.stringify(resumed)), {...game, phase: 'finished'}).playerHeatmaps, 'white-Q').totalMs, 1700);
  assert.equal(playerHeatmapSummary(createMatchStats().playerHeatmaps, 'white-Q').totalMs, 0);
});

test('legacy saved matches show unavailable or partial data without inventing earlier positions', () => {
  const game = live(), saved = createMatchStats(); delete saved.playerHeatmaps;
  const restored = restoreMatchStats(saved, game);
  assert.equal(restored.partial, false, 'heatmap migration does not invalidate existing match stats');
  assert.deepEqual(playerHeatmapSummary(restored.playerHeatmaps, 'white-Q'), {partial: true, totalMs: 0, cells: []});
  const resumed = addPossessionTime(restored, game, 700);
  assert.equal(playerHeatmapSummary(resumed.playerHeatmaps, 'white-Q').partial, true);
  assert.equal(playerHeatmapSummary(resumed.playerHeatmaps, 'white-Q').totalMs, 700);
  assert.equal(restoreMatchStats(saved, game, {partial: false}).playerHeatmaps.partial, false, 'pre-match setup has no missing playing time');
});

test('invalid saved geometry, identities, cells and times cannot manufacture a map', () => {
  const valid = addPlayerHeatmapTime(createPlayerHeatmaps(), live(), 1000);
  for (const mutate of [s => s.width = 12, s => s.version = 99, s => s.players['white-K'] = {'0': 100},
    s => s.players['white-Q'] = {'238': 100}, s => s.players['white-Q'] = {'-1': 100},
    s => s.players['white-Q'] = {'1': -2}, s => s.players['white-Q'] = {'1': Infinity},
    s => s.players['white-Q'] = {'1': '100'}, s => s.players = []]) {
    const bad = structuredClone(valid); mutate(bad);
    assert.deepEqual(restorePlayerHeatmaps(bad), createPlayerHeatmaps({partial: true}));
  }
});

const app = await readFile(new URL('../dist/app.js', import.meta.url), 'utf8');
test('actual app clock records in timed and untimed play, excluding pauses, dialogs, animations and full time', () => {
  const code = app.slice(app.indexOf('function flushClockElapsed(){'), app.indexOf('function advanceClockNow(){'));
  for (const duration of [0, 10]) for (const blocked of ['none', 'paused', 'dialog', 'shotFlight', 'finished', 'setup']) {
    const context = vm.createContext({Date: {now: () => 2000}, lastTick: 1000, game: live(), matchStats: createMatchStats(),
      stage: ['finished', 'setup'].includes(blocked) ? blocked : 'playing', paused: blocked === 'paused',
      anyDialog: () => blocked === 'dialog', shotFlight: blocked === 'shotFlight', duration, addPossessionTime,
      restoreClock: () => {}, tickMatchClock: () => ({}), clockSnapshot: () => ({})});
    vm.runInContext(code + '\nflushClockElapsed();', context);
    assert.equal(playerHeatmapSummary(context.matchStats.playerHeatmaps, 'white-Q').totalMs, blocked === 'none' ? 1000 : 0, `${duration}: ${blocked}`);
    vm.runInContext('flushClockElapsed();', context);
    assert.equal(playerHeatmapSummary(context.matchStats.playerHeatmaps, 'white-Q').totalMs, blocked === 'none' ? 1000 : 0, 'same interval is not counted twice');
  }
});
