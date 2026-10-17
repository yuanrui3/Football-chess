import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const appURL = new URL('../dist/app.js', import.meta.url);
const app = readFileSync(appURL, 'utf8');
const html = readFileSync(new URL('../dist/index.html', import.meta.url), 'utf8');
const worker = readFileSync(new URL('../dist/ai-worker.js', import.meta.url), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));
const oldPreferenceKey = 'football-chess-self-play-v1';

// Execute production bootstrap and AI handlers at their browser boundary. The
// throwing model detects accidental checkpoint access; a stored legacy opt-in
// must neither be read on startup nor alter worker/fallback evaluation.
function section(start, end) {
  const from = app.indexOf(start), until = app.indexOf(end, from + start.length);
  assert.ok(from >= 0 && until > from, `Production source section exists: ${start}`);
  return app.slice(from, until);
}
function line(prefix) {
  const found = app.split('\n').find(value => value.startsWith(prefix));
  assert.ok(found, `Production source line exists: ${prefix}`);
  return found;
}
const bootstrap = section('const $ = id', 'let lastGoalReplay=');
const controls = ["$('aiDifficulty').addEventListener('change'", "$('whiteDifficulty').addEventListener('change'"].map(line).join('\n');
const computerHelpers = section('function isComputer(', 'function blocked(');
const cancelHelpers = section('function stopAIWorker(', 'function teamLabel(');
const scheduling = section('function scheduleAI(){', 'function drawPreview(').replaceAll('import.meta.url', JSON.stringify(appURL.href));

function harness({pref = {enabled: true}, mode = 'solo', actor = 'black', difficulty = 'tactical', whiteDifficulty = 'casual', hasWorker = true} = {}) {
  const elements = Object.fromEntries(['aiDifficulty', 'whiteDifficulty'].map(id => [id, {
    value: id === 'aiDifficulty' ? difficulty : whiteDifficulty,
    listeners: {}, addEventListener(kind, listener) {this.listeners[kind] = listener;}
  }]));
  const storage = new Map([[oldPreferenceKey, JSON.stringify(pref)]]), storageReads = [];
  let timerId = 0, dialogOpen = false;
  const timers = new Map(), workers = [], calls = [], commits = [], saves = [], applied = [];
  class FakeWorker {
    constructor(url, options) {this.url = url; this.options = options; this.messages = []; this.terminated = false; workers.push(this);}
    postMessage(message) {this.messages.push(structuredClone(message));}
    terminate() {this.terminated = true;}
  }
  const model = new Proxy({}, {get() {throw new Error('Playable UI must not access a learned checkpoint');}});
  const context = vm.createContext({
    URL, structuredClone, RL_VALUE_MODEL: model, window: {Worker: hasWorker ? FakeWorker : undefined},
    document: {querySelector: selector => selector === '.shot-legend' ? {textContent: 'Shot chance'} : selector === 'dialog[open]' && dialogOpen ? {} : null, getElementById: id => elements[id]},
    localStorage: {getItem: key => {storageReads.push(key); return storage.get(key) ?? null;}, setItem: (key, value) => storage.set(key, value)},
    W: 14, H: 17, BOX_FILES: [4,5,6,7,8,9], BOX_DEPTH: 3, DRIBBLE_RANGE: 8, LONG_TACKLE_RANGE: 5, ACTION_SECONDS: 30,
    createGame: () => ({mode, actor, turn: 4, ball: {x: 6, y: 8, carrierId: `${actor}-Q`}, randomState: 19}),
    setTimeout(fn, ms) {const id = ++timerId; timers.set(id, {fn, ms}); return id;}, clearTimeout: id => timers.delete(id),
    currentTeam: game => game.actor,
    chooseAIAction(game, options) {calls.push(plain(options)); return {type: 'skip'};},
    skipMove: game => ({...game, turn: game.turn + 1}),
    applyMove(game, pieceId, x, y, options) {applied.push({pieceId,x,y,...options}); return {...game,turn:game.turn+1,ball:{x,y,carrierId:pieceId}};},
    commit: game => commits.push(plain(game)), capture: state => plain(state), captureSave: state => saves.push(plain(state)),
    toast: () => {},
  });
  vm.runInContext(`
    ${bootstrap}
    aiDifficulty=${JSON.stringify(difficulty)};whiteDifficulty=${JSON.stringify(whiteDifficulty)};
    let shotFlight=null,voiceEnabled=true;
    ${computerHelpers}
    ${cancelHelpers}
    ${scheduling}
    function render(){scheduleAI();}
    function save(){captureSave({game,remaining,actionRemaining,voiceEnabled,aiPace,paused});}
    ${controls}
    globalThis.inspect=()=>capture({game,remaining,actionRemaining,voiceEnabled,aiPace,paused,aiGeneration});
    globalThis.start=()=>{stage='playing';render();};
    globalThis.cancel=()=>cancelAI();
    globalThis.setPaused=value=>{paused=value;};
    globalThis.setShotFlight=value=>{shotFlight=value?{}:null;};
    globalThis.setActor=value=>{game.actor=value;};
    globalThis.selectDifficulty=(id,value)=>{$(id).value=value;$(id).listeners.change();};
  `, context);
  return {elements, storage, storageReads, timers, workers, calls, commits, saves, applied,
    inspect: () => context.inspect(), start: () => context.start(), cancel: () => context.cancel(), setPaused: value => context.setPaused(value), setDialog: value => {dialogOpen = value;}, setShotFlight: value => context.setShotFlight(value), setActor: value => context.setActor(value),
    selectDifficulty: (id, value) => context.selectDifficulty(id, value),
    fire(ms) {const pending = [...timers].filter(([, timer]) => timer.ms === ms); assert.equal(pending.length, 1, `one ${ms} ms timer`); const [id, timer] = pending[0]; timers.delete(id); timer.fn();}
  };
}

for (const pref of [{enabled: true}, {enabled: false}, {enabled: 'yes'}, null]) {
  test(`handcrafted UI ignores old self-play preference ${JSON.stringify(pref)}`, () => {
    const ui = harness({pref});
    assert.equal(ui.storageReads.includes(oldPreferenceKey), false);
    ui.start(); ui.fire(3000);
    assert.equal(ui.workers.length, 1);
    const message = ui.workers[0].messages[0];
    assert.equal(message.difficulty, 'tactical');
    assert.equal(Object.hasOwn(message, 'learnedEvaluation'), false);
    assert.equal(Object.hasOwn(message, 'modelWeights'), false);
    assert.equal(ui.storage.get(oldPreferenceKey), JSON.stringify(pref), 'archived preference need not be destroyed');
  });
  test(`handcrafted fallback forces null weights despite old preference ${JSON.stringify(pref)}`, () => {
    const ui = harness({pref, hasWorker: false});
    ui.start(); ui.fire(3000);
    assert.deepEqual(ui.calls, [{difficulty: 'tactical', modelWeights: null}]);
    assert.equal(ui.commits.length, 1);
  });
}

test('Watch mode uses handcrafted Tactical for either computer', () => {
  for (const actor of ['white', 'black']) {
    const ui = harness({mode: 'watch', actor, difficulty: 'tactical', whiteDifficulty: 'tactical'});
    ui.start(); ui.fire(3000);
    assert.equal(ui.workers[0].messages[0].difficulty, 'tactical');
    assert.equal(Object.hasOwn(ui.workers[0].messages[0], 'learnedEvaluation'), false);
  }
});

test('cancelled worker results cannot commit or change the match', () => {
  const ui = harness({mode: 'watch'});
  ui.start(); ui.fire(3000);
  const worker = ui.workers[0], message = worker.messages[0], callback = worker.onmessage;
  const before = ui.inspect(); ui.cancel(); const after = ui.inspect();
  assert.equal(worker.terminated, true);
  assert.equal([...ui.timers.values()].some(timer => timer.ms === 4000), false);
  assert.equal(after.aiGeneration, before.aiGeneration + 1);
  for (const key of ['game', 'remaining', 'actionRemaining', 'voiceEnabled', 'aiPace', 'paused']) assert.deepEqual(after[key], before[key]);
  callback({data: {requestId: message.requestId, action: {type: 'skip'}}});
  assert.equal(ui.commits.length, 0);
  ui.selectDifficulty('aiDifficulty', 'casual');
  ui.fire(3000);
  assert.deepEqual(ui.calls, [{difficulty: 'casual', modelWeights: null}]);
});

test('worker errors and watchdog fallback cannot reactivate learned weights', () => {
  for (const failure of ['message', 'error', 'watchdog']) {
    const ui = harness(); ui.start(); ui.fire(3000);
    const worker = ui.workers[0], requestId = worker.messages[0].requestId;
    if (failure === 'message') worker.onmessage({data: {requestId, error: 'search failed'}});
    else if (failure === 'error') worker.onerror({preventDefault() {}});
    else ui.fire(4000);
    assert.deepEqual(ui.calls, [{difficulty: failure === 'watchdog' ? 'casual' : 'tactical', modelWeights: null}]);
    assert.equal(ui.commits.length, 1);
    assert.equal(worker.terminated, true);
  }
});

test('playable worker ignores legacy learned opt-in and supplied model weights', () => {
  const source = worker.replace(/^import[^\n]+\n/, '');
  for (const requested of [undefined, false, true]) for (const difficulty of ['casual', 'tactical']) {
    const calls = [], messages = [], self = {postMessage: message => messages.push(message)};
    const forbiddenModel = new Proxy({}, {get() {throw new Error('Worker accessed learned checkpoint');}});
    vm.runInNewContext(source, {self, RL_VALUE_MODEL: forbiddenModel,
      chooseAIAction: (state, options) => {calls.push(plain(options)); return {type: 'skip'};},
      analyzeTacticalAction: (state, options) => {assert.equal(options.modelWeights, null); assert.equal(typeof options.onIteration, 'function'); calls.push({modelWeights: null}); return {action: {type: 'skip'}};}
    });
    self.onmessage({data: {requestId: 8, state: {}, difficulty, modelWeights: [.5,.5,.5,.5,.5,.5,.5], ...(requested === undefined ? {} : {learnedEvaluation: requested})}});
    assert.deepEqual(calls, [difficulty === 'tactical' ? {modelWeights: null} : {difficulty: 'casual', modelWeights: null}]);
    assert.deepEqual(plain(messages), [{requestId: 8, action: {type: 'skip'}}]);
  }
});

const progress = (requestId, depth, x = depth + 2) => ({data: {requestId, progress: {action: {type: 'move', pieceId: 'black-Q', x, y: 8}, stats: {completedDepth: depth}}}});

test('completed progress waits for the watchdog and uses the deepest completed answer', () => {
  const ui = harness(); ui.start(); ui.fire(3000);
  const worker = ui.workers[0], requestId = worker.messages[0].requestId;
  worker.onmessage(progress(requestId, 1, 4));
  worker.onmessage(progress(requestId, 3, 6));
  worker.onmessage(progress(requestId, 2, 5));
  assert.equal(ui.commits.length, 0, 'iteration updates do not act early');
  assert.equal(worker.terminated, false);
  ui.fire(4000);
  assert.deepEqual(ui.applied, [{pieceId: 'black-Q', x: 6, y: 8, freePawn: false}]);
  assert.equal(ui.calls.length, 0, 'a completed Tactical answer replaces the Casual timeout fallback');
  assert.equal(ui.commits.length, 1);
  assert.equal(worker.terminated, true);
});

test('wrong request IDs and incomplete iteration progress never become a timeout answer', () => {
  const ui = harness(); ui.start(); ui.fire(3000);
  const worker = ui.workers[0], requestId = worker.messages[0].requestId;
  worker.onmessage(progress(requestId + 1, 8));
  worker.onmessage(progress(requestId, 0));
  worker.onmessage(progress(requestId, 1.5));
  assert.equal(ui.commits.length, 0);
  ui.fire(4000);
  assert.deepEqual(ui.calls, [{difficulty: 'casual', modelWeights: null}]);
  assert.equal(ui.applied.length, 0);
});

test('paused or cancelled requests ignore progress and cannot commit a stored answer', () => {
  for (const paused of [true, false]) {
    const ui = harness(); ui.start(); ui.fire(3000);
    const worker = ui.workers[0], callback = worker.onmessage, requestId = worker.messages[0].requestId;
    if (paused) {
      ui.setPaused(true); callback(progress(requestId, 3)); ui.setPaused(false); ui.fire(4000);
      assert.deepEqual(ui.calls, [{difficulty: 'casual', modelWeights: null}]);
    } else {
      callback(progress(requestId, 1)); ui.cancel(); callback(progress(requestId, 3));
      assert.equal(ui.timers.size, 0);
      assert.equal(ui.calls.length, 0);
    }
    assert.equal(ui.applied.length, 0);
    assert.equal(ui.commits.length, paused ? 1 : 0);
  }
});

test('a final worker answer commits directly after progress and clears the watchdog', () => {
  const ui = harness(); ui.start(); ui.fire(3000);
  const worker = ui.workers[0], requestId = worker.messages[0].requestId;
  worker.onmessage(progress(requestId, 1, 4));
  worker.onmessage({data: {requestId, action: {type: 'move', pieceId: 'black-Q', x: 7, y: 8}}});
  assert.deepEqual(ui.applied, [{pieceId: 'black-Q', x: 7, y: 8, freePawn: false}]);
  assert.equal(ui.commits.length, 1);
  assert.equal(ui.calls.length, 0);
  assert.equal([...ui.timers.values()].some(timer => timer.ms === 4000), false);
});

test('worker failures use a completed Tactical answer before invoking fallback', () => {
  for (const failure of ['message', 'error']) {
    const ui = harness(); ui.start(); ui.fire(3000);
    const worker = ui.workers[0], requestId = worker.messages[0].requestId;
    worker.onmessage(progress(requestId, 2, 5));
    if (failure === 'message') worker.onmessage({data: {requestId, error: 'later iteration failed'}});
    else worker.onerror({preventDefault() {}});
    assert.deepEqual(ui.applied, [{pieceId: 'black-Q', x: 5, y: 8, freePawn: false}]);
    assert.equal(ui.calls.length, 0);
    assert.equal(ui.commits.length, 1);
  }
});

test('worker forwards complete iterations with the original request ID before its final answer', () => {
  const source = worker.replace(/^import[^\n]+\n/, ''), messages = [], self = {postMessage: message => messages.push(plain(message))};
  vm.runInNewContext(source, {self, chooseAIAction: () => {throw new Error('Tactical must use iterative analysis');},
    analyzeTacticalAction(state, options) {
      assert.equal(options.modelWeights, null);
      options.onIteration({action: {type: 'skip'}, stats: {completedDepth: 1}});
      options.onIteration({action: {type: 'move', pieceId: 'black-Q', x: 6, y: 8}, stats: {completedDepth: 2}});
      return {action: {type: 'move', pieceId: 'black-Q', x: 7, y: 8}};
    }
  });
  self.onmessage({data: {requestId: 14, state: {}, difficulty: 'tactical', learnedEvaluation: true}});
  assert.deepEqual(messages, [
    {requestId: 14, progress: {action: {type: 'skip'}, stats: {completedDepth: 1}}},
    {requestId: 14, progress: {action: {type: 'move', pieceId: 'black-Q', x: 6, y: 8}, stats: {completedDepth: 2}}},
    {requestId: 14, action: {type: 'move', pieceId: 'black-Q', x: 7, y: 8}}
  ]);
});

test('playable controls retain both difficulties and describe handcrafted search', () => {
  const options = html.match(/<select id="aiDifficulty">([\s\S]*?)<\/select>/)?.[1];
  assert.ok(options);
  assert.deepEqual([...options.matchAll(/<option value="([^"]+)"/g)].map(match => match[1]), ['casual', 'tactical']);
  assert.doesNotMatch(html, /selfPlayChoice|selfPlayEnabled|Self-play model/);
  assert.doesNotMatch(app, /RL_STORE|rlEnabled|RL_VALUE_MODEL|learnedEvaluation|football-chess-self-play-v1/);
  assert.match(html, /Tactical uses handcrafted evaluation and bounded look-ahead search/);
});


test('Tactical computes immediately but holds an early final answer until the chosen pace', () => {
  const ui = harness(); ui.start();
  assert.equal(ui.workers.length, 1, 'search starts before the three-second timer fires');
  const worker = ui.workers[0], requestId = worker.messages[0].requestId;
  assert.equal([...ui.timers.values()].some(timer => timer.ms === 3000), true);
  assert.equal([...ui.timers.values()].some(timer => timer.ms === 4000), true, 'watchdog starts with computation');
  worker.onmessage({data: {requestId, action: {type: 'move', pieceId: 'black-Q', x: 4, y: 8}}});
  assert.equal(worker.terminated, true);
  assert.equal(ui.commits.length, 0, 'a faster engine cannot move before the visible pace expires');
  assert.equal(ui.applied.length, 0);
  assert.equal([...ui.timers.values()].some(timer => timer.ms === 4000), false);
  ui.fire(3000);
  assert.deepEqual(ui.applied, [{pieceId: 'black-Q', x: 4, y: 8, freePawn: false}]);
  assert.equal(ui.commits.length, 1);
  assert.equal(ui.calls.length, 0);
});

test('a Tactical answer arriving after the pace expires commits when it is ready', () => {
  const ui = harness(); ui.start();
  const worker = ui.workers[0], requestId = worker.messages[0].requestId;
  ui.fire(3000);
  assert.equal(ui.commits.length, 0);
  assert.equal(worker.terminated, false);
  worker.onmessage({data: {requestId, action: {type: 'skip'}}});
  assert.equal(ui.commits.length, 1);
  assert.equal(worker.terminated, true);
});

test('cancelling a paced pending answer discards it and any later worker messages', () => {
  const ui = harness(); ui.start();
  const worker = ui.workers[0], callback = worker.onmessage, requestId = worker.messages[0].requestId;
  callback({data: {requestId, action: {type: 'skip'}}});
  assert.equal(ui.commits.length, 0);
  ui.cancel();
  assert.equal(ui.timers.size, 0);
  callback({data: {requestId, action: {type: 'skip'}}});
  assert.equal(ui.commits.length, 0);
  assert.equal(ui.calls.length, 0);
});

test('an early worker failure defers synchronous fallback until the pace expires', () => {
  const ui = harness(); ui.start();
  ui.workers[0].onerror({preventDefault() {}});
  assert.equal(ui.calls.length, 0);
  assert.equal(ui.commits.length, 0);
  ui.fire(3000);
  assert.deepEqual(ui.calls, [{difficulty: 'tactical', modelWeights: null}]);
  assert.equal(ui.commits.length, 1);
});

test('progress before the pace remains provisional until completion or the original watchdog', () => {
  const ui = harness(); ui.start();
  const worker = ui.workers[0], requestId = worker.messages[0].requestId;
  worker.onmessage(progress(requestId, 2, 5));
  assert.equal(ui.commits.length, 0);
  ui.fire(3000);
  assert.equal(ui.commits.length, 0, 'pace expiry alone does not interrupt a still-running search');
  ui.fire(4000);
  assert.deepEqual(ui.applied, [{pieceId: 'black-Q', x: 5, y: 8, freePawn: false}]);
  assert.equal(ui.calls.length, 0);
});

test('pace expiry rechecks pause, dialog, shot flight and actor guards before a cached move', () => {
  for (const block of [ui => ui.setPaused(true), ui => ui.setDialog(true), ui => ui.setShotFlight(true), ui => ui.setActor('white')]) {
    const ui = harness(); ui.start();
    const worker = ui.workers[0], requestId = worker.messages[0].requestId;
    worker.onmessage({data: {requestId, action: {type: 'skip'}}});
    block(ui); ui.fire(3000);
    assert.equal(ui.commits.length, 0);
    assert.equal(ui.calls.length, 0);
  }
});
