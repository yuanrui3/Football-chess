import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../dist/engine.js';
import {createCommentary} from '../dist/commentary.js';
import {COMMENTARY_CLIPS} from '../dist/commentary-clips.js';
import {commentaryPositionFacts, commentaryTransitionFact} from '../dist/commentary-spatial.js';
import {HUGO_COMMENTARY_CLIPS, hugoCommentaryClip} from '../dist/hugo-commentary-clips.js';

const fresh = () => ({normalUsed: false, pawnUsed: false, dribbleUsed: false});
function board({carrier = 'white-Q', phase = 'kick', positions = {}, budget = fresh()} = {}) {
  const state = E.createGame({mode: 'local', seed: 73, foulsEnabled: false});
  const placements = {'white-K': [6, 16], 'black-K': [7, 0], 'black-R2': [12, 3], ...positions};
  state.pieces = state.pieces.filter(piece => placements[piece.id]).map(piece => ({...piece,
    x: placements[piece.id][0], y: placements[piece.id][1]}));
  const owner = state.pieces.find(piece => piece.id === carrier);
  assert.ok(owner);
  Object.assign(state, {attack: 'white', phase, positionBudget: {...budget},
    ball: {x: owner.x, y: owner.y, carrierId: owner.id}, pendingShot: null, restart: null, offside: null,
    passRun: null, lastAction: null, paceControl: null, looseBallKickOrigin: null,
    ballProgress: {team: 'white', anchorY: owner.y, rounds: 0, pendingRelease: false, excludeRelease: false}});
  assert.equal(new Set(state.pieces.map(piece => `${piece.x},${piece.y}`)).size, state.pieces.length);
  assert.ok(state.pieces.every(piece => E.canOccupySquare(piece, piece.x, piece.y)));
  return state;
}
const positionFact = (state, type) => {
  const fact = commentaryPositionFacts(state).find(fact => fact.type === type);
  assert.ok(fact, `native fixture supplies ${type}`);
  return {state, fact};
};
const transitionFact = (before, after, type, options) => {
  const fact = commentaryTransitionFact(before, after, options);
  assert.equal(fact?.type, type, `native transition supplies ${type}`);
  return {state: after, fact};
};
const kickTo = (state, id, options) => {
  const target = typeof id === 'string' ? state.pieces.find(piece => piece.id === id) : id;
  return E.applyKick({...state, phase: 'kick'}, target.x, target.y, {roll: 0, ...options});
};
const spatialLine = fact => ({kind: 'trend', priority: 1, text: fact.text, id: `library:${fact.key}`,
  clipKey: null, spatial: fact, team: fact.team, delivery: fact.urgent ? 'urgent' : 'normal'});

function spatialCases() {
  const cases = [];
  cases.push(positionFact(board({positions: {'white-Q': [6, 8], 'white-R1': [6, 5]}}), 'support'));
  cases.push(positionFact(board({phase: 'defendMove', positions: {'white-Q': [6, 8], 'black-R1': [6, 10]}}), 'pressing'));
  cases.push(positionFact(board({phase: 'defendMove', positions: {'white-Q': [6, 8], 'black-P1': [5, 6]}}), 'pawnSetup'));
  const cross = board({carrier: 'white-R1', positions: {'white-R1': [1, 4], 'white-Q': [6, 4]}});
  cases.push(positionFact(cross, 'crossSupport'));
  cases.push(positionFact(board({positions: {'white-Q': [6, 8], 'white-R1': [6, 4], 'black-B1': [6, 6]}}), 'blockedLane'));
  cases.push(positionFact(board({positions: {'white-Q': [6, 3], 'black-K': [6, 1], 'black-R2': [13, 12]}}), 'oneOnOne'));
  cases.push(positionFact(board({positions: {'white-Q': [2, 3], 'black-K': [6, 1], 'black-B1': [3, 3], 'black-R2': [13, 12]}}), 'shotTraffic'));
  cases.push(transitionFact(cross, kickTo(cross, 'white-Q'), 'cross'));
  const cutback = board({carrier: 'white-B1', positions: {'white-B1': [1, 1], 'white-Q': [4, 4]}});
  cases.push(transitionFact(cutback, kickTo(cutback, 'white-Q'), 'cutback'));
  const through = board({positions: {'white-Q': [4, 8], 'white-B1': [7, 6], 'black-K': [6, 1],
    'black-R1': [5, 5], 'black-B1': [3, 5], 'black-R2': [13, 12]}});
  cases.push(transitionFact(through, kickTo(through, {x: 4, y: 3}), 'throughBall'));
  const link = board({positions: {'white-Q': [6, 8], 'white-B1': [6, 6], 'white-R1': [8, 4]}});
  const received = kickTo(link, 'white-B1'), linked = kickTo(received, 'white-R1');
  cases.push(transitionFact({...received, phase: 'kick'}, linked, 'linkUp', {passes: [{team: 'white',
    pieceId: 'white-Q', receiverId: 'white-B1', from: {x: 6, y: 8}, to: {x: 6, y: 6}, turn: received.turn, ran: false}]}));
  const oneTwo = board({positions: {'white-Q': [6, 8], 'white-R1': [6, 5]}});
  const pass = kickTo(oneTwo, 'white-R1', {passRun: true}), ran = E.applyMove(pass, 'white-Q', 6, 7);
  cases.push(transitionFact(pass, ran, 'passRun'));
  cases.push(transitionFact({...ran, phase: 'kick'}, kickTo(ran, 'white-Q'), 'oneTwo', {passes: [{team: 'white',
    pieceId: 'white-Q', receiverId: 'white-R1', from: {x: 6, y: 8}, to: {x: 6, y: 5}, turn: pass.turn, ran: true}]}));
  const press = board({phase: 'defendMove', positions: {'white-Q': [6, 8], 'black-P1': [5, 6]}});
  cases.push(transitionFact(press, E.applyMove(press, 'black-P1', 5, 7, {freePawn: true}), 'pressMove'));
  const screen = board({phase: 'defendMove', positions: {'white-Q': [6, 8], 'white-R1': [6, 4], 'black-B1': [4, 4]}});
  cases.push(transitionFact(screen, E.applyMove(screen, 'black-B1', 6, 6), 'screenMove'));
  const run = board({phase: 'attackMove', positions: {'white-Q': [6, 8], 'white-B1': [9, 9]}});
  cases.push(transitionFact(run, E.applyMove(run, 'white-B1', 7, 7), 'run'));
  const dribble = board({phase: 'attackMove', positions: {'white-Q': [6, 8]}});
  cases.push(transitionFact(dribble, E.applyMove(dribble, 'white-Q', 6, 5), 'dribbleSpace'));
  assert.equal(new Set(cases.map(({fact}) => fact.type)).size, 17);
  return cases;
}

const fakeLibrary = Object.freeze({
  support: {key: 'support', text: 'The rook offers support to the queen.', src: '/audio/hugo/support.mp3', ready: true},
  crossSupport: {key: 'crossSupport', text: 'The rook has a central option for the cross.', src: '/audio/hugo/crossSupport.mp3', ready: true},
  hugo_enable: {key: 'hugo_enable', text: 'Commentary is on. Follow the match with me.', src: '/audio/hugo/enable.mp3', ready: true},
  hugo_test: {key: 'hugo_test', text: 'The queen has support. The attack is building.', src: '/audio/hugo/test.mp3', ready: true},
  hugo_demo: {key: 'hugo_demo', text: 'Commentary demo. The queen has support.', src: '/audio/hugo/demo.mp3', ready: true},
});
const selectFake = line => line.kind === 'trend' ? fakeLibrary[line.spatial?.type || line.clipKey] || null : null;
function harness({hugoClips = fakeLibrary, selectHugoClip = selectFake, failAudio = false} = {}) {
  let time = 0, serial = 0;
  const timers = new Map(), audios = [], captions = [], deviceCalls = [];
  const local = {loads: 0, speaks: 0, unlocks: 0, cancels: 0,
    getState: () => ({ready: true, supported: true, status: 'ready'}),
    load() {this.loads++; return Promise.resolve();},
    speak() {this.speaks++; return Promise.resolve({spoken: true});},
    unlock() {this.unlocks++; return Promise.resolve(true);}, cancel() {this.cancels++;}};
  class Audio {
    constructor(src) {this.src = src; this.requestedSrc = src; this.pauses = 0; audios.push(this);}
    play() {if (failAudio) throw new Error('media unavailable');}
    pause() {this.pauses++;}
    removeAttribute() {}
    load() {}
  }
  class Utterance {constructor(text) {this.text = text;}}
  const controller = createCommentary({AudioCtor: Audio, localSpeech: local, hugoClips, selectHugoClip,
    speechSynthesis: {speak: utterance => deviceCalls.push(utterance), cancel() {}}, Utterance,
    onCaption: (text, event) => captions.push({text, event}), now: () => time,
    setTimer(fn, delay) {const id = ++serial; timers.set(id, {at: time + delay, fn}); return id;},
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
  return {controller, local, audios, captions, timers, advance, deviceCalls,
    setAudioFailure(value) {failAudio = !!value;}};
}
function revealFact(h, state, fact, id = `library:${fact.key}`) {
  h.controller.tick(state, {blocked: true});
  return h.controller.reveal({...spatialLine(fact), id});
}
const reaction = (kind, id = kind) => ({kind, priority: {attempt: 2, outcome: 3, goal: 4}[kind],
  id, text: `${kind} live commentary`, clipKey: kind === 'attempt' ? 'shot_normal' : kind === 'outcome' ? 'save_hold' : 'goal_generic'});

test('every spatial fact has a ready, whole-sentence Hugo recording that preserves its technical meaning', () => {
  const keywords = {support: /support|option|pass/i, pressing: /press|pressure|clos/i, pawnSetup: /pawn|free step/i,
    crossSupport: /cross|middle|central/i, blockedLane: /lane|screen|block/i, oneOnOne: /one.on.one/i,
    shotTraffic: /traffic|shooting|screen/i, cross: /cross|middle/i, cutback: /cut.?back|back.*middle/i,
    throughBall: /through ball/i, linkUp: /link|combin/i, passRun: /run|ran/i, oneTwo: /one.two/i,
    pressMove: /clos|press|tackl/i, screenMove: /lane|screen|block/i, run: /run|ran|support/i,
    dribbleSpace: /space|carr|dribbl/i};
  for (const {state, fact} of spatialCases()) {
    const snapshot = structuredClone({state, fact}), line = spatialLine(fact), clip = hugoCommentaryClip(line, state);
    assert.ok(clip, `a verified recording exists for ${fact.type}`);
    assert.equal(clip.ready, true); assert.equal(clip.voice, 'Hugo');
    assert.match(clip.text, keywords[fact.type]);
    if (fact.type === 'cross') assert.match(clip.text, /finding the queen/i,
      'the queen receives this cross; the rook is the crosser');
    if (fact.type === 'throughBall') assert.match(clip.text, /onside bishop/i,
      'the bishop has the collection route; the queen made the delivery');
    if (fact.type === 'oneTwo') assert.match(clip.text, /queen received the return/i,
      'the queen receives the return; the rook played it');
    if (fact.type === 'pressing') assert.match(clip.text, /rook had the ball carrier under pressure/i,
      'the rook supplies pressure against the queen, not the reverse');
    if (fact.type === 'passRun') assert.match(clip.text, /queen ran after passing; the rook kept possession/i);
    assert.doesNotMatch(clip.text, /Ivory|Obsidian|\b(?:queen|rook|bishop|knight|pawn) (?:one|two|three)\b/i,
      'role-based audio does not invent a team or stable player number');
    assert.ok(Object.values(HUGO_COMMENTARY_CLIPS).some(value => value === clip));
    assert.deepEqual({state, fact}, snapshot, 'selecting a recording never alters spatial evidence');
  }
});

test('the prepared knight support call describes an L-shaped jump rather than a ray pass', () => {
  const state = board({carrier: 'white-N1', positions: {'white-N1': [6, 8], 'white-R1': [8, 7], 'white-B1': [7, 8]}});
  const {fact} = positionFact(state, 'support'), clip = hugoCommentaryClip(spatialLine(fact), state);
  assert.ok(clip); assert.match(clip.text, /L-shaped|jump/i);
  assert.doesNotMatch(clip.text, /vertical|horizontal|diagonal/);
  const wrong = structuredClone(state);
  Object.assign(wrong.pieces.find(piece => piece.id === 'white-R1'), {x: 6, y: 7});
  assert.equal(hugoCommentaryClip(spatialLine(fact), wrong), null, 'a malformed adjacent target cannot select a knight passing clip');
});

test('the Hugo selector never announces a shot result or invents an unsupported piece role', () => {
  const state = board({positions: {'white-Q': [6, 8], 'white-R1': [6, 5]}});
  for (const kind of ['attempt', 'outcome', 'goal']) {
    assert.equal(hugoCommentaryClip({kind, clipKey: 'hugo_test', text: 'Unresolved moment'}, state), null,
      'non-analysis calls remain on the dedicated match-reaction path');
  }
  for (const spatial of [
    {type: 'inventedTactic', pieceId: 'white-Q'},
    {type: 'oneOnOne', pieceId: 'missing-player'},
    {type: 'pawnSetup', defenderId: 'white-Q', pieceId: 'white-Q'},
    {type: 'support', pieceId: 'missing-player', receiverId: 'white-R1'},
  ]) assert.equal(hugoCommentaryClip({kind: 'trend', clipKey: null, spatial}, state), null);
});

test('library speech captions exactly match the selected file, with no local model work', async () => {
  const h = harness(), {state, fact} = positionFact(board({positions: {'white-Q': [6, 8], 'white-R1': [6, 5]}}), 'support');
  assert.equal(revealFact(h, state, fact), true);
  assert.equal(h.audios[0].requestedSrc, fakeLibrary.support.src);
  assert.equal(h.captions.at(-1).text, fakeLibrary.support.text);
  assert.equal(h.captions.at(-1).event.text, fakeLibrary.support.text);
  assert.equal(h.captions.at(-1).event.voice, 'Hugo');
  assert.notEqual(fakeLibrary.support.text, fact.text, 'the audible generic role wording is used as the caption');
  assert.equal(await h.controller.warmLocal(), false); assert.equal(await h.controller.unlockLocal(), false);
  assert.equal(h.local.loads, 0); assert.equal(h.local.speaks, 0); assert.equal(h.local.unlocks, 0);
  assert.equal(h.deviceCalls.length, 0);
  h.controller.destroy();
});

test('library enable, test and demo use their prepared Hugo clips without downloading a voice model', () => {
  for (const [operation, key] of [['confirmEnabled', 'hugo_enable'], ['testVoice', 'hugo_test'], ['demo', 'hugo_demo']]) {
    const h = harness(); assert.equal(h.controller[operation](), true);
    assert.equal(h.audios[0].requestedSrc, fakeLibrary[key].src);
    assert.equal(h.captions.at(-1).text, fakeLibrary[key].text);
    assert.equal(h.captions.at(-1).event.voice, 'Hugo');
    assert.equal(h.local.loads, 0); assert.equal(h.local.speaks, 0); assert.equal(h.deviceCalls.length, 0);
    h.controller.destroy();
  }
});

test('library mode retains truthful captions when a verified clip is missing or cannot play', () => {
  const {state, fact} = positionFact(board({positions: {'white-Q': [6, 8], 'white-R1': [6, 5]}}), 'support');
  for (const options of [{selectHugoClip: () => null}, {failAudio: true}]) {
    const h = harness(options); assert.equal(revealFact(h, state, fact), true);
    assert.equal(h.captions.at(-1).text, options.failAudio ? fakeLibrary.support.text : fact.text);
    assert.equal(h.deviceCalls.length, 0); assert.equal(h.local.speaks, 0); assert.equal(h.local.loads, 0);
    h.controller.destroy();
  }
});

test('an explicit voice test can replace a failed or active routine call, while a real goal keeps priority', () => {
  const {state, fact} = positionFact(board({positions: {'white-Q': [6, 8], 'white-R1': [6, 5]}}), 'support');
  const failed = harness({failAudio: true}); revealFact(failed, state, fact);
  assert.equal(failed.controller.getState().audioStatus, 'unavailable');
  failed.setAudioFailure(false);
  assert.equal(failed.controller.testVoice(), true, 'a failed routine caption cannot block an explicit retry');
  assert.equal(failed.audios.at(-1).requestedSrc, fakeLibrary.hugo_test.src);
  assert.equal(failed.captions.at(-1).text, fakeLibrary.hugo_test.text);
  assert.equal(failed.captions.at(-1).event.voice, 'Hugo');
  assert.equal(failed.local.loads, 0); assert.equal(failed.local.speaks, 0);
  failed.controller.destroy();

  const active = harness(); assert.equal(active.controller.confirmEnabled(), true);
  assert.equal(active.controller.testVoice(), true, 'Test voice works immediately after switching commentary on');
  assert.ok(active.audios[0].pauses > 0);
  assert.equal(active.audios[1].requestedSrc, fakeLibrary.hugo_test.src);
  assert.equal(active.controller.reveal(reaction('goal')), true);
  const count = active.audios.length;
  assert.equal(active.controller.testVoice(), false, 'an explicit voice audition cannot interrupt a real goal');
  assert.equal(active.audios.length, count); assert.equal(active.captions.at(-1).event.kind, 'goal');
  active.controller.destroy();
});

test('shots and goals preempt prepared analysis, use Tom, and cannot be cleared by old audio callbacks', () => {
  const h = harness(), {state, fact} = positionFact(board({positions: {'white-Q': [6, 8], 'white-R1': [6, 5]}}), 'support');
  revealFact(h, state, fact);
  const old = h.audios[0], ended = old.onended, playing = old.onplaying;
  assert.equal(h.controller.reveal(reaction('attempt')), true);
  assert.ok(old.pauses > 0);
  assert.equal(h.audios[1].requestedSrc, COMMENTARY_CLIPS.shot_normal.src);
  assert.equal(h.captions.at(-1).event.voice, 'Tom');
  assert.equal(h.controller.reveal(reaction('goal')), true);
  assert.equal(h.captions.at(-1).text, COMMENTARY_CLIPS.goal_generic.text);
  ended(); playing();
  assert.equal(h.captions.at(-1).event.kind, 'goal'); assert.equal(h.controller.getState().speaking, true);
  assert.equal(h.audios.length, 3, 'preempted technical audio is not queued for later');
  assert.equal(h.local.speaks, 0); assert.equal(h.local.loads, 0);
  h.controller.destroy();
});

test('a keeper rebound uses the saved loose-ball call, not a catch or a corner, in library mode', () => {
  const h = harness();
  assert.equal(h.controller.reveal({kind: 'outcome', priority: 3, id: 'keeper-rebound',
    text: 'Saved, but the ball spilled loose!', keeperRebound: true, shot: true, clipKey: null}), true);
  assert.equal(h.audios.length, 1); assert.equal(h.audios[0].requestedSrc, COMMENTARY_CLIPS.loose_ball.src);
  assert.equal(h.captions.at(-1).text, COMMENTARY_CLIPS.loose_ball.text);
  assert.equal(h.captions.at(-1).event.voice, 'Tom');
  assert.doesNotMatch(h.captions.at(-1).text, /holds|caught|corner/i);
  assert.equal(h.local.loads, 0); assert.equal(h.local.speaks, 0); assert.equal(h.deviceCalls.length, 0);
  h.controller.destroy();
});

test('mute and changing away from three-second pace immediately stop prepared audio', () => {
  const {state, fact} = positionFact(board({positions: {'white-Q': [6, 8], 'white-R1': [6, 5]}}), 'support');
  for (const stop of [h => h.controller.setEnabled(false), h => h.controller.setPace(1800)]) {
    const h = harness(); revealFact(h, state, fact);
    const old = h.audios[0], late = old.onplaying;
    stop(h); assert.ok(old.pauses > 0); assert.equal(h.controller.getState().speaking, false);
    assert.equal(h.timers.size, 0); late();
    assert.equal(h.audios.length, 1); assert.equal(h.captions.at(-1).text, '');
    h.controller.setPace(3000); assert.equal(h.controller.getState().enabled, false);
    assert.equal(h.local.speaks, 0); assert.equal(h.local.loads, 0);
    h.controller.destroy();
  }
});

test('a still-valid support clip survives irrelevant movement, while loss of its lane cancels stale audio', () => {
  const {state, fact} = positionFact(board({phase: 'defendMove', positions: {'white-Q': [6, 8], 'white-R1': [6, 5]}}), 'support');
  const h = harness(); revealFact(h, state, fact);
  const audio = h.audios[0], late = audio.onplaying;
  const quiet = E.applyMove(state, 'black-R2', 13, 3);
  assert.ok(commentaryPositionFacts(quiet).some(value => value.key === fact.key));
  h.controller.observe(state, quiet);
  assert.equal(audio.pauses, 0, 'an irrelevant defender shuffle does not starve a still-correct analysis clip');
  const changed = structuredClone(quiet), supporter = changed.pieces.find(piece => piece.id === 'white-R1');
  Object.assign(supporter, {x: 7, y: 5}); changed.turn++;
  changed.lastAction = {type: 'move', team: 'white', pieceId: supporter.id, from: {x: 6, y: 5}, to: {x: 7, y: 5}};
  assert.ok(!commentaryPositionFacts(changed).some(value => value.key === fact.key));
  h.controller.observe(quiet, changed);
  assert.ok(audio.pauses > 0); assert.equal(h.controller.getState().speaking, false);
  const caption = h.captions.at(-1).text; late();
  assert.equal(h.captions.at(-1).text, caption);
  assert.equal(h.controller.reveal({...spatialLine(fact), id: 'stale-support'}), false);
  assert.equal(h.local.speaks, 0); assert.equal(h.local.loads, 0);
  h.controller.destroy();
});

test('prepared technical calls retain routine throttling and do not queue behind active speech', () => {
  const state = board({carrier: 'white-R1', positions: {'white-R1': [1, 4], 'white-Q': [6, 4]}});
  const support = positionFact(state, 'support').fact, crossing = positionFact(state, 'crossSupport').fact;
  const h = harness(); revealFact(h, state, support);
  assert.equal(h.controller.reveal(spatialLine(crossing)), false, 'equal-priority calls cannot interrupt or queue');
  h.audios[0].onended(); assert.equal(h.audios.length, 1);
  h.advance(9999); assert.equal(h.controller.reveal({...spatialLine(crossing), id: 'too-soon'}), false);
  h.advance(1); assert.equal(h.controller.reveal({...spatialLine(crossing), id: 'after-routine-gap'}), true);
  assert.equal(h.audios.length, 2); assert.equal(h.captions.at(-1).text, fakeLibrary.crossSupport.text);
  assert.equal(h.local.speaks, 0); assert.equal(h.local.loads, 0);
  h.controller.destroy();
});
