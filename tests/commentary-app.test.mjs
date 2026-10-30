import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {shortPieceId} from '../dist/match-stats.js';

// Run the real app handlers with a pending model load. No browser, model,
// network, board simulation or copied request-cancellation logic is needed.
const source = await readFile(new URL('../dist/app.js', import.meta.url), 'utf8');
function section(start, end) {
  const first = source.indexOf(start), last = source.indexOf(end, first + start.length);
  assert.ok(first >= 0 && last > first, `app handler section exists: ${start}`);
  return source.slice(first, last);
}
const handlers = [
  section('function syncVoiceover(){', 'function saveVoicePreference(){'),
  section("$('voiceToggle').addEventListener", "$('voiceSelect').addEventListener"),
  section("$('voiceTest').addEventListener", "$('voiceDemo').addEventListener"),
  section("window.addEventListener('pagehide'", "document.addEventListener('visibilitychange'"),
  section("document.addEventListener('visibilitychange'", '\nrender();'),
].join('\n');

function harness() {
  let resolveLoad;
  const loaded = new Promise(resolve => {resolveLoad = resolve;});
  const listeners = new Map(), elements = new Map();
  const calls = {tests: 0, confirmations: 0, loads: 0, resets: 0, toasts: []};
  const element = id => {
    if (!elements.has(id)) elements.set(id, {
      value: '', disabled: false, hasAttribute: () => false,
      addEventListener: (event, callback) => listeners.set(`${id}:${event}`, callback),
    });
    return elements.get(id);
  };
  const context = vm.createContext({
    $: element, voiceEnabled: false, voiceActivated: false, voicePlayback: 'local',
    voiceTestRequest: 0, voiceLifecycle: 'playing', voiceLastCaption: '', voiceLastContext: '', voiceCaptionDemo: false,
    aiPace: 3000, paused: false, stage: 'playing', dialogOpen: false, replayAutoContinue: false,
    game: {lastAction: null},
    document: {hidden: false, addEventListener: (event, callback) => listeners.set(`document:${event}`, callback)},
    window: {addEventListener: (event, callback) => listeners.set(`window:${event}`, callback)},
    commentary: {
      getState: () => ({supported: true, voices: []}),
      unlockLocal: () => Promise.resolve(true),
      warmLocal() {calls.loads++; return loaded;},
      testVoice() {calls.tests++; return true;},
      confirmEnabled() {calls.confirmations++; return true;},
      reset() {calls.resets++;},
      setPace() {}, setEnabled() {}, setPlayback() {}, suspend() {},
    },
    evaluation:{suspend(){}},renderEvaluation(){},
    renderVoiceover() {}, saveVoicePreference() {}, advanceClockNow() {}, save() {},
    toast: text => calls.toasts.push(text),
  });
  context.anyDialog = () => context.dialogOpen;
  vm.runInContext(handlers, context, {filename: 'extracted-commentary-app-handlers.js'});
  const fire = (id, event) => {
    const callback = listeners.get(`${id}:${event}`);
    assert.equal(typeof callback, 'function', `${id} ${event} listener exists`);
    callback();
  };
  return {context, calls, element, fire, resolveLoad};
}
const flush = () => new Promise(resolve => setImmediate(resolve));
function beginLoad(h) {
  h.fire('voiceTest', 'click');
  assert.ok(h.calls.loads > 0, 'the explicit test is waiting for its real load promise');
  assert.equal(h.calls.tests, 0);
}

test('an uninterrupted explicit Load & test plays once when the model becomes ready', async () => {
  const h = harness(); beginLoad(h); h.resolveLoad(true); await flush();
  assert.equal(h.calls.tests, 1);
  assert.deepEqual(h.calls.toasts, []);
});

const interruptions = [
  ['Off then On', h => {h.fire('voiceToggle', 'click'); h.fire('voiceToggle', 'click');}],
  ['another playback mode then Local', h => {
    h.element('voicePlayback').value = 'library'; h.fire('voicePlayback', 'change');
    h.element('voicePlayback').value = 'local'; h.fire('voicePlayback', 'change');
  }],
  ['match reset', h => {h.context.resetVoiceover();}],
  ['pace away then back', h => {
    h.context.aiPace = 1800; h.context.syncVoiceover();
    h.context.aiPace = 3000; h.context.voiceEnabled = true; h.context.activateVoiceover(); h.context.syncVoiceover();
  }],
  ['pause then resume', h => {
    h.context.paused = true; h.context.syncVoiceover();
    h.context.paused = false; h.context.syncVoiceover();
  }],
  ['dialog open then close', h => {
    h.context.dialogOpen = true; h.context.syncVoiceover();
    h.context.dialogOpen = false; h.context.syncVoiceover();
  }],
  ['page hide then reactivation', h => {h.fire('window', 'pagehide'); h.context.activateVoiceover();}],
  ['hidden tab then visible', h => {
    h.context.document.hidden = true; h.fire('document', 'visibilitychange');
    h.context.document.hidden = false; h.fire('document', 'visibilitychange');
  }],
];
for (const [name, interrupt] of interruptions) {
  test(`${name} cannot revive an older pending voice test after loading finishes`, async () => {
    const h = harness(); beginLoad(h); interrupt(h);
    assert.equal(h.context.voiceEnabled, true, 'final enabled state alone cannot distinguish the cancelled request');
    assert.equal(h.context.voicePlayback, 'local');
    assert.equal(h.context.aiPace, 3000);
    assert.equal(h.context.document.hidden, false);
    h.resolveLoad(true); await flush();
    assert.equal(h.calls.tests, 0, 'the cancelled activation must remain silent');
    assert.deepEqual(h.calls.toasts, []);
    // Cancellation invalidates the old request, not later explicit tests.
    h.fire('voiceTest', 'click'); await flush();
    assert.equal(h.calls.tests, 1, 'a new user test still works after the model is ready');
  });
}


test('analysis context names the assessed team and stable piece without changing the spoken caption', () => {
  const context=vm.createContext({TEAM:{white:'Ivory FC',black:'Obsidian FC'},shortPieceId});
  vm.runInContext(section('function commentaryContext(event){','function renderVoiceover(){'),context);
  assert.equal(context.commentaryContext({team:'black',clipKey:'performance_progress_rook',tactical:{pieceId:'black-R2'}}),
    'Obsidian FC · R2 · Player performance');
  assert.equal(context.commentaryContext({team:'white',clipKey:'shape_compact',tactical:{}}),'Ivory FC · Team shape');
  assert.equal(context.commentaryContext({team:null,clipKey:'shape_midfield_crowded',tactical:{centralPlayers:10}}),'Both teams · Crowded midfield · 10 central players');
  assert.equal(context.commentaryContext({team:'black',clipKey:'shape_high_line_black',tactical:{label:'Obsidian high line'}}),'Obsidian FC · Obsidian high line');
  assert.equal(context.commentaryContext({team:'black',clipKey:'tactic_counter',tactical:{}}),'Obsidian FC · Counterattack');
  assert.equal(context.commentaryContext({team:'white',clipKey:'tactic_control',tactical:{}}),'Ivory FC · Midfield control');
  assert.equal(context.commentaryContext({team:'black',clipKey:'tactic_pawn_trap',tactical:{pieceId:'black-P1'}}),'Obsidian FC · P1 · Pawn pressing trap');
  assert.equal(context.commentaryContext({team:'white',clipKey:'tactic_file_attack',tactical:{}}),'Ivory FC · Cleared shooting lane');
  assert.equal(context.commentaryContext({team:'black',clipKey:'stat_shots_black_7',statsCommentary:{shots:7,onTarget:3,possessionPercent:62.46}}),
    'Obsidian FC · Possession 62.5% · Shots 7 · On target 3');
  assert.equal(context.commentaryContext({kind:'goal',team:'black'}),'');
  assert.equal(context.commentaryContext({team:'invalid',clipKey:'shape_wide',tactical:{}}),'');
});
