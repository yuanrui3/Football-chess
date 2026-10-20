import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../dist/engine.js';
import {createCommentary, COMMENTARY_TACTICAL_REPEAT_MS} from '../dist/commentary.js';
import {commentaryPositionFacts} from '../dist/commentary-spatial.js';
import {TACTICAL_COMMENTARY_SCRIPTS} from '../dist/commentary-tactics.js';
import {HUGO_COMMENTARY_CLIPS, hugoCommentaryClip} from '../dist/hugo-commentary-clips.js';
import {COMMENTARY_CLIPS} from '../dist/commentary-clips.js';

// The real engine commits all passes, skips and round boundaries. Sparse squads
// isolate the commentary evidence; every occupied square and pass is native.
function passingPosition() {
  const state = E.createGame({mode: 'local', seed: 991, foulsEnabled: false});
  const placements = {
    'white-K': [6, 16], 'black-K': [7, 0], 'black-R1': [13, 0], 'black-R2': [12, 0],
    'white-Q': [6, 9], 'white-R1': [6, 7], 'white-R2': [6, 5],
    'white-B1': [6, 3], 'white-N1': [8, 1], 'white-N2': [6, 2],
  };
  state.pieces = state.pieces.filter(piece => placements[piece.id]).map(piece => ({...piece,
    x: placements[piece.id][0], y: placements[piece.id][1]}));
  Object.assign(state, {attack: 'white', phase: 'kick', turn: 1,
    ball: {x: 6, y: 9, carrierId: 'white-Q'}, pendingShot: null, restart: null,
    offside: null, passRun: null, lastAction: null, paceControl: null, looseBallKickOrigin: null,
    positionBudget: {normalUsed: false, pawnUsed: false, dribbleUsed: false},
    ballProgress: {team: 'white', anchorY: 9, rounds: 0, pendingRelease: false, excludeRelease: false}});
  assert.equal(new Set(state.pieces.map(piece => `${piece.x},${piece.y}`)).size, state.pieces.length);
  assert.ok(state.pieces.every(piece => E.canOccupySquare(piece, piece.x, piece.y)));
  return state;
}

function harness({pendingAudio = false} = {}) {
  let time = 0, nextTimer = 0;
  const timers = new Map(), audios = [], captions = [], deviceCalls = [];
  const local = {loads: 0, speaks: 0, cancels: 0,
    getState: () => ({ready: true, supported: true, unlocked: true}),
    load() {this.loads++; return Promise.resolve(true);},
    speak() {this.speaks++; throw Error('Prepared commentary must not synthesize speech.');},
    cancel() {this.cancels++;}};
  class Audio {
    constructor(src) {this.src = src; this.pauses = 0; audios.push(this);}
    play() {if (pendingAudio) return new Promise(resolve => {this.resolvePlay = resolve;});}
    pause() {this.pauses++;}
    removeAttribute() {}
    load() {}
  }
  class Utterance {constructor(text) {this.text = text;}}
  const controller = createCommentary({AudioCtor: Audio, localSpeech: local,
    speechSynthesis: {speak: value => deviceCalls.push(value), cancel() {}}, Utterance,
    now: () => time, onCaption: (text, event) => captions.push({text, event}),
    setTimer(fn, delay) {const id = ++nextTimer; timers.set(id, {at: time + delay, fn}); return id;},
    clearTimer: id => timers.delete(id)});
  controller.setPace(3000); controller.setPlayback('library'); controller.setEnabled(true);
  function advance(ms) {
    const end = time + ms;
    for (;;) {
      const next = [...timers].filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break;
      timers.delete(next[0]); time = next[1].at; next[1].fn();
    }
    time = end;
  }
  const finish = () => {const current = audios.at(-1); current?.onended?.();};
  return {controller, timers, audios, captions, local, deviceCalls, advance, finish,
    get time() {return time;}, get last() {return captions.at(-1);}};
}

function commit(h, before, after) {
  assert.notEqual(after, before); h.controller.observe(before, after); return after;
}
function pass(h, state, receiverId) {
  while (state.phase !== 'kick') {
    const next = E.skipMove(state); state = commit(h, state, next);
    assert.ok(!state.restart && !state.pendingShot);
  }
  const receiver = state.pieces.find(piece => piece.id === receiverId);
  const legal = E.legalKicks(state).find(kick => kick.x === receiver.x && kick.y === receiver.y && !kick.goal);
  assert.ok(legal && !legal.offside, `the ${receiverId} pass is legal and onside`);
  const next = E.applyKick(state, receiver.x, receiver.y, {roll: 0});
  assert.equal(next.lastAction.type, 'kick'); assert.equal(next.lastAction.outcome, 'complete');
  assert.equal(next.ball.carrierId, receiverId);
  return commit(h, state, next);
}
function prepare(h, count = 4) {
  let state = passingPosition();
  for (const id of ['white-R1', 'white-R2', 'white-B1', 'white-N1'].slice(0, count)) state = pass(h, state, id);
  // Finish the earlier brief event call without deleting the observed rounds.
  h.controller.suspend(); h.advance(12000);
  return state;
}
function beginMacro(h, state) {
  assert.equal(h.controller.tick(state), true);
  assert.ok(h.last.event?.tactical, 'rolling analysis leads the next routine update');
  const key = h.last.event.clipKey, clip = HUGO_COMMENTARY_CLIPS[key];
  assert.equal(h.last.text, clip.text); assert.equal(h.audios.at(-1).src, clip.src);
  assert.equal(h.last.event.voice, 'Hugo'); assert.equal(h.last.event.snapshot, true);
  return {event: h.last.event, audio: h.audios.at(-1)};
}
const reaction = kind => ({kind, priority: kind === 'goal' ? 4 : 2,
  id: `macro-delivery:${kind}`, text: kind === 'goal' ? 'A goal!' : 'A shot!', shot: true,
  clipKey: kind === 'goal' ? 'goal_generic' : 'shot_normal'});
// Delivery policy fixtures carry an already verified public assessment. Geometry
// and event thresholds are tested independently in commentary-tactics.test.mjs.
function assessment(key, id, evidence = {}) {
  return {kind: 'trend', priority: 1, ...TACTICAL_COMMENTARY_SCRIPTS[key], clipKey: key, id, team: 'white',
    tactical: {type: key, key: key + ':white:' + (evidence.pieceId || ''), rank: 83,
      live: false, observedSerial: 1, ...evidence}};
}

test('every tactical, formation and performance script has its exact ready Hugo recording', () => {
  assert.equal(Object.keys(TACTICAL_COMMENTARY_SCRIPTS).length, 45);
  for (const [key, script] of Object.entries(TACTICAL_COMMENTARY_SCRIPTS)) {
    const clip = hugoCommentaryClip(assessment(key, key), passingPosition());
    assert.equal(clip, HUGO_COMMENTARY_CLIPS[key]); assert.equal(clip.ready, true);
    assert.equal(clip.text, script.text); assert.equal(clip.snapshot, true);
    assert.equal(clip.delivery, script.delivery); assert.ok(clip.durationMs > 0 && clip.sha256);
  }
});

test('a single native pass cannot produce formation or individual-performance verdicts', () => {
  const h = harness(); pass(h, passingPosition(), 'white-R1');
  assert.ok(!h.captions.some(value => value.event?.tactical));
  assert.equal(h.local.loads, 0); assert.equal(h.local.speaks, 0); h.controller.destroy();
});

test('verified multi-round combinations lead existing spatial details with exact recorded captions', () => {
  const h = harness(), state = prepare(h);
  assert.ok(commentaryPositionFacts(state).length, 'concrete spatial details are available too');
  const untouched = structuredClone(state), {event} = beginMacro(h, state);
  assert.equal(event.clipKey, 'tactic_combinations'); assert.equal(event.tactical.passes, 3);
  assert.deepEqual(state, untouched, 'commentary never changes the match or random state');
  assert.equal(h.local.loads, 0); assert.equal(h.local.speaks, 0); assert.equal(h.deviceCalls.length, 0);
  h.controller.destroy();
});

test('three broader updates leave room for one spatial detail even when a counter-cycle is eligible', () => {
  const h = harness(), state = prepare(h), broad = [];
  for (let i = 0; i < 3; i++) {
    if (i) h.advance(12000);
    broad.push(beginMacro(h, state).event.clipKey); h.finish();
  }
  assert.deepEqual(broad, ['tactic_combinations', 'tactic_pressure', 'tactic_centre']);
  h.advance(30000); // The first macro's 45-second repeat gate has now elapsed.
  assert.equal(h.controller.tick(state), true);
  assert.ok(h.last.event.spatial, 'the fourth update gives a concrete tactical detail');
  assert.ok(!h.last.event.tactical);
  h.controller.destroy();
});

test('a started macro observation finishes over the next native carrying action', () => {
  const h = harness(), state = prepare(h), {audio} = beginMacro(h, state);
  h.advance(3000);
  const move = E.legalMoves(state, state.ball.carrierId).find(candidate => candidate.type === 'move');
  assert.ok(move);
  const next = E.applyMove(state, state.ball.carrierId, move.x, move.y);
  assert.notEqual(next, state); commit(h, state, next);
  assert.equal(audio.pauses, 0); assert.equal(h.controller.getState().speaking, true);
  assert.equal(h.local.loads, 0); assert.equal(h.local.speaks, 0);
  h.controller.destroy();
});

for (const kind of ['attempt', 'goal']) test(`${kind} preempts macro analysis with Tom and old callbacks stay silent`, () => {
  const h = harness(), state = prepare(h), {audio} = beginMacro(h, state), late = audio.onended;
  assert.equal(h.controller.reveal(reaction(kind)), true); assert.ok(audio.pauses > 0);
  assert.equal(h.last.event.voice, 'Tom'); assert.equal(h.last.event.kind, kind);
  assert.equal(h.last.text, COMMENTARY_CLIPS[kind === 'goal' ? 'goal_generic' : 'shot_normal'].text);
  late(); assert.equal(h.last.event.kind, kind); h.controller.destroy();
});

test('tactical key cooldown remains 45 seconds and does not postpone a later fresh call', () => {
  const h = harness(), first = assessment('tactic_counter', 'counter:1', {forwardGain: 4, rounds: 2});
  assert.equal(COMMENTARY_TACTICAL_REPEAT_MS, 45000);
  assert.equal(h.controller.reveal(first), true); h.finish();
  h.advance(10000); assert.equal(h.controller.confirmEnabled(), true); h.finish();
  h.advance(34999);
  assert.equal(h.controller.reveal({...first, id: 'counter:2'}), false);
  h.advance(1); assert.equal(h.controller.reveal({...first, id: 'counter:3'}), true);
  assert.equal(h.last.text, TACTICAL_COMMENTARY_SCRIPTS.tactic_counter.text);
  h.controller.destroy();
});

test('unchanged player totals cannot repeat a verdict, but a new observed contribution can', () => {
  const h = harness(), first = assessment('performance_progress_queen', 'performance:1',
    {pieceId: 'white-Q', completedForwardPasses: 3, forwardGain: 6});
  assert.equal(h.controller.reveal(first), true); h.finish();
  h.advance(10000); h.controller.confirmEnabled(); h.finish(); h.advance(35000);
  assert.equal(h.controller.reveal({...first, id: 'performance:same', tactical: {...first.tactical, observedSerial: 99}}), false,
    'new observation serials cannot turn unchanged totals into a fresh evaluation');
  assert.equal(h.controller.reveal({...first, id: 'performance:new', tactical: {...first.tactical,
    observedSerial: 100, completedForwardPasses: 4, forwardGain: 8}}), true);
  assert.equal(h.last.text, HUGO_COMMENTARY_CLIPS.performance_progress_queen.text);
  h.controller.destroy();
});

test('reset clears multi-round evidence and an old stamped analysis cannot return', () => {
  const h = harness(), state = prepare(h), {event} = beginMacro(h, state);
  h.controller.reset();
  assert.equal(h.controller.reveal(event), false, 'the old epoch is invalid after undo/new match');
  assert.equal(h.controller.tick(state), true, 'an ordinary spatial observation is still possible');
  assert.ok(!h.last.event.tactical, 'a single current board cannot recreate the erased history');
  h.controller.destroy();
});

test('a delayed prepared assessment cannot start after mute/reset, even if its play promise resolves', async () => {
  for (const cancel of [h => h.controller.setEnabled(false), h => h.controller.reset()]) {
    const h = harness({pendingAudio: true});
    assert.equal(h.controller.reveal(assessment('shape_wide', 'pending-shape', {rounds: 6})), true);
    const audio = h.audios.at(-1), late = audio.onplaying;
    assert.equal(h.controller.getState().audioStatus, 'loading');
    cancel(h); audio.resolvePlay(); await Promise.resolve(); await Promise.resolve(); late();
    assert.ok(audio.pauses > 0); assert.equal(h.last.text, '');
    assert.equal(h.controller.getState().speaking, false);
    assert.equal(h.local.loads, 0); assert.equal(h.local.speaks, 0); assert.equal(h.deviceCalls.length, 0);
    h.controller.destroy();
  }
});
