import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const appURL = new URL('../dist/app.js', import.meta.url);
const app = readFileSync(appURL, 'utf8');
const html = readFileSync(new URL('../dist/index.html', import.meta.url), 'utf8');
const worker = readFileSync(new URL('../dist/ai-worker.js', import.meta.url), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));
const checkpoint = (enabled = false, trained = true) => ({trained, enabled, weights: [.1, .2, .3, .4, .5, .6, .7]});

// Execute the production handlers in a small browser boundary. This needs no DOM
// dependency and tests request cancellation without invoking a costly AI search.
// Separate browser smoke checks cover the full page; no implementation is copied.
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
const preference = section('let rlEnabled=', 'let lastGoalReplay=');
const rendering = section('  const tacticalSelected=', "  $('setupHint')");
const controls = ["$('aiDifficulty').addEventListener('change'", "$('whiteDifficulty').addEventListener('change'", "$('selfPlayEnabled').addEventListener('change'"].map(line).join('\n');
const computerHelpers = section('function isComputer(', 'function blocked(');
const cancelHelpers = section('function stopAIWorker(', 'function teamLabel(');
const scheduling = section('function scheduleAI(){', 'function drawPreview(').replaceAll('import.meta.url', JSON.stringify(appURL.href));

function harness({model = checkpoint(), pref, mode = 'solo', actor = 'black', difficulty = 'casual', whiteDifficulty = 'casual', hasWorker = true} = {}) {
  const elements = Object.fromEntries(['selfPlayChoice', 'selfPlayEnabled', 'selfPlayNote', 'aiDifficulty', 'whiteDifficulty'].map(id => [id, {
    value: id === 'aiDifficulty' ? difficulty : id === 'whiteDifficulty' ? whiteDifficulty : '',
    hidden: false, disabled: false, checked: false, textContent: '', listeners: {},
    addEventListener(kind, listener) {this.listeners[kind] = listener;}
  }]));
  const storage = new Map();
  if (pref !== undefined) storage.set('football-chess-self-play-v1', JSON.stringify(pref));
  let timerId = 0;
  const timers = new Map(), workers = [], calls = [], commits = [], saves = [];
  class FakeWorker {
    constructor(url, options) {this.url = url; this.options = options; this.messages = []; this.terminated = false; workers.push(this);}
    postMessage(message) {this.messages.push(structuredClone(message));}
    terminate() {this.terminated = true;}
  }
  const context = vm.createContext({
    URL, structuredClone, RL_VALUE_MODEL: model, window: {Worker: hasWorker ? FakeWorker : undefined},
    document: {querySelector: () => null}, $: id => elements[id],
    localStorage: {getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value)},
    setTimeout(fn, ms) {const id = ++timerId; timers.set(id, {fn, ms}); return id;}, clearTimeout: id => timers.delete(id),
    currentTeam: game => game.actor,
    chooseAIAction(game, options) {calls.push(plain(options)); return {type: 'skip'};},
    skipMove: game => ({...game, turn: game.turn + 1}),
    commit: game => commits.push(plain(game)),
    capture: state => plain(state), captureSave: state => saves.push(plain(state)),
    toast: () => {},
  });
  vm.runInContext(`
    const RL_STORE='football-chess-self-play-v1';
    let game=${JSON.stringify({mode, actor, turn: 4, ball: {x: 6, y: 8, carrierId: 'black-Q'}, randomState: 19})};
    let aiDifficulty=${JSON.stringify(difficulty)}, whiteDifficulty=${JSON.stringify(whiteDifficulty)};
    let stage='setup',paused=false,shotFlight=null,aiPace=3000,aiTimer=null,aiWorker=null,aiWatchdog=null,aiGeneration=0;
    let remaining=600,actionRemaining=12,voiceEnabled=true;
    ${preference}
    ${computerHelpers}
    ${cancelHelpers}
    ${scheduling}
    function renderSelfPlay(){const watching=game.mode==='watch';${rendering}}
    function render(){renderSelfPlay();scheduleAI();}
    function save(){captureSave({game,remaining,actionRemaining,voiceEnabled,aiPace,paused,rlEnabled});}
    ${controls}
    renderSelfPlay();
    globalThis.inspect=()=>capture({game,remaining,actionRemaining,voiceEnabled,aiPace,paused,rlEnabled,aiGeneration});
    globalThis.start=()=>{stage='playing';render();};
    globalThis.selectModel=enabled=>{$('selfPlayEnabled').checked=enabled;$('selfPlayEnabled').listeners.change();};
    globalThis.selectDifficulty=(id,value)=>{$(id).value=value;$(id).listeners.change();};
  `, context);
  return {elements, storage, timers, workers, calls, commits, saves,
    inspect: () => context.inspect(), start: () => context.start(), selectModel: value => context.selectModel(value),
    selectDifficulty: (id, value) => context.selectDifficulty(id, value),
    firePace() {const pending = [...timers].filter(([, timer]) => timer.ms === 3000); assert.equal(pending.length, 1, 'one AI pace timer'); const [id, timer] = pending[0]; timers.delete(id); timer.fn();}
  };
}

for (const [name, model, pref, expected] of [
  ['untrained', checkpoint(false, false), undefined, false],
  ['unpromoted', checkpoint(), undefined, false],
  ['promoted', checkpoint(true), undefined, true],
  ['explicit opt-in', checkpoint(), {enabled: true}, true],
  ['explicit opt-out', checkpoint(true), {enabled: false}, false],
  ['malformed preference', checkpoint(true), {enabled: 'no'}, true],
  ['untrained opt-in', checkpoint(false, false), {enabled: true}, false],
]) test(`self-play UI: ${name} has safe availability and default`, () => {
  const ui = harness({model, pref});
  assert.equal(ui.inspect().rlEnabled, expected);
  assert.equal(ui.elements.selfPlayChoice.hidden, !model.trained);
  assert.equal(ui.elements.selfPlayEnabled.checked, expected);
  assert.equal(ui.elements.selfPlayEnabled.disabled, true, 'Casual does not use the learned model');
  ui.selectDifficulty('aiDifficulty', 'tactical');
  assert.equal(ui.elements.selfPlayEnabled.disabled, !model.trained);
  assert.match(ui.elements.selfPlayNote.textContent, model.enabled ? /held-out match check/ : /Experimental.*baseline remains/);
});

test('self-play UI: either Tactical team activates the option in Watch mode', () => {
  const ui = harness({mode: 'watch'});
  assert.equal(ui.elements.selfPlayEnabled.disabled, true);
  ui.selectDifficulty('whiteDifficulty', 'tactical');
  assert.equal(ui.elements.selfPlayEnabled.disabled, false);
  ui.selectDifficulty('whiteDifficulty', 'casual');
  assert.equal(ui.elements.selfPlayEnabled.disabled, true);
  ui.selectDifficulty('aiDifficulty', 'tactical');
  assert.equal(ui.elements.selfPlayEnabled.disabled, false);
});

test('self-play UI: an explicit preference is separately persisted and restored', () => {
  const ui = harness({difficulty: 'tactical'});
  ui.selectModel(true);
  const pref = JSON.parse(ui.storage.get('football-chess-self-play-v1'));
  assert.deepEqual(pref, {enabled: true});
  assert.equal(harness({pref}).inspect().rlEnabled, true);
  ui.selectModel(false);
  assert.equal(harness({model: checkpoint(true), pref: JSON.parse(ui.storage.get('football-chess-self-play-v1'))}).inspect().rlEnabled, false);
});

for (const enabled of [false, true]) {
  test(`self-play AI scheduling: worker uses explicit ${enabled} and toggle cancels stale results`, () => {
    const ui = harness({model: checkpoint(true), pref: {enabled}, difficulty: 'tactical', mode: 'watch'});
    ui.start(); ui.firePace();
    const worker = ui.workers[0], message = worker.messages[0], callback = worker.onmessage;
    assert.equal(message.learnedEvaluation, enabled);
    assert.equal(message.difficulty, 'tactical');
    const before = ui.inspect(); ui.selectModel(!enabled); const after = ui.inspect();
    assert.equal(worker.terminated, true);
    assert.equal([...ui.timers.values()].some(timer => timer.ms === 4000), false, 'old watchdog is removed');
    assert.equal(after.aiGeneration, before.aiGeneration + 1);
    for (const key of ['game', 'remaining', 'actionRemaining', 'voiceEnabled', 'aiPace', 'paused']) assert.deepEqual(after[key], before[key], `${key} is unchanged`);
    callback({data: {requestId: message.requestId, action: {type: 'skip'}}});
    assert.equal(ui.commits.length, 0, 'old result cannot commit');
    ui.firePace();
    assert.equal(ui.workers[1].messages[0].learnedEvaluation, !enabled);
  });
  test(`self-play AI scheduling: main-thread fallback uses explicit ${enabled}`, () => {
    const model = checkpoint(true), ui = harness({model, pref: {enabled}, difficulty: 'tactical', hasWorker: false});
    ui.start(); ui.firePace();
    assert.deepEqual(ui.calls, [{difficulty: 'tactical', modelWeights: enabled ? model.weights : null}]);
    assert.equal(ui.commits.length, 1);
  });
}

test('self-play UI: changing choice before a pending action discards its old pace timer', () => {
  const ui = harness({difficulty: 'tactical'});
  ui.start(); const oldTimer = [...ui.timers.keys()][0]; ui.selectModel(true);
  assert.equal(ui.timers.has(oldTimer), false);
  ui.firePace();
  assert.equal(ui.workers.length, 1);
  assert.equal(ui.workers[0].messages[0].learnedEvaluation, true);
});

test('self-play worker: legacy requests retain defaults and explicit booleans respect training availability', () => {
  const source = worker.replace(/^import[^\n]+\n/, '');
  for (const model of [checkpoint(true), checkpoint(false, false)]) for (const requested of [undefined, false, true]) {
    const calls = [], messages = [], self = {postMessage: message => messages.push(message)};
    vm.runInNewContext(source, {self, RL_VALUE_MODEL: model, chooseAIAction: (state, options) => {calls.push(plain(options)); return {type: 'skip'};}});
    self.onmessage({data: {requestId: 8, state: {}, difficulty: 'tactical', ...(requested === undefined ? {} : {learnedEvaluation: requested})}});
    const expected = {difficulty: 'tactical', ...(requested === undefined ? {} : {modelWeights: requested && model.trained ? model.weights : null})};
    assert.deepEqual(calls, [expected]);
    assert.deepEqual(plain(messages), [{requestId: 8, action: {type: 'skip'}}]);
  }
});

test('self-play controls keep the two difficulties and describe offline evaluation accurately', () => {
  const options = html.match(/<select id="aiDifficulty">([\s\S]*?)<\/select>/)?.[1];
  assert.ok(options);
  assert.deepEqual([...options.matchAll(/<option value="([^"]+)"/g)].map(match => match[1]), ['casual', 'tactical']);
  assert.match(html, /id="selfPlayChoice" hidden/);
  assert.match(html, /id="selfPlayEnabled" aria-describedby="selfPlayNote"/);
  assert.match(html, /trained offline through self-play/);
  assert.match(html, /without downloads or browser training/);
});
