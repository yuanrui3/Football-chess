import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../dist/engine.js';
import {createCommentary} from '../dist/commentary.js';
import {commentaryPositionFacts, commentaryTransitionFact} from '../dist/commentary-spatial.js';

function position({phase = 'kick', support = false} = {}) {
  const state = E.createGame({mode: 'local', seed: 73, foulsEnabled: false});
  const placements = {'white-K': [6, 16], 'black-K': [7, 0], 'black-R2': [12, 3],
    'white-R1': support ? [6, 5] : [1, 4], 'white-Q': support ? [6, 8] : [6, 4]};
  state.pieces = state.pieces.filter(piece => placements[piece.id]).map(piece => ({...piece,
    x: placements[piece.id][0], y: placements[piece.id][1]}));
  const carrier = state.pieces.find(piece => piece.id === (support ? 'white-Q' : 'white-R1'));
  Object.assign(state, {attack: 'white', phase, turn: 1,
    positionBudget: {normalUsed: false, pawnUsed: false, dribbleUsed: false},
    ball: {x: carrier.x, y: carrier.y, carrierId: carrier.id}, pendingShot: null, restart: null, offside: null,
    passRun: null, lastAction: null, paceControl: null, looseBallKickOrigin: null,
    ballProgress: {team: 'white', anchorY: carrier.y, rounds: 0, pendingRelease: false, excludeRelease: false}});
  return state;
}
function completedCross() {
  const before = position(), after = E.applyKick(before, 6, 4, {roll: 0});
  const fact = commentaryTransitionFact(before, after);
  assert.equal(fact?.type, 'cross'); assert.equal(fact.live, false);
  return {before, after, fact};
}
function harness({snapshot = false, pendingAudio = false, playback = 'library'} = {}) {
  const audios = [], captions = [], timers = new Map();
  let time = 0, serial = 0;
  class Audio {
    constructor(src) {this.src = src; this.pauses = 0; audios.push(this);}
    play() {if (pendingAudio) return new Promise(resolve => {this.resolvePlay = resolve;});}
    pause() {this.pauses++;}
    removeAttribute() {}
    load() {}
  }
  const baseClip = {key: 'continuity', src: '/audio/hugo/continuity.mp3', voice: 'Hugo', ready: true,
    text: 'The queen had support along the file.', durationMs: 4800, snapshot};
  const controller = createCommentary({AudioCtor: Audio, speechSynthesis: null, Utterance: null,
    hugoClips: {continuity: baseClip},
    selectHugoClip: line => line.kind === 'trend' && line.spatial
      ? {...baseClip, text: snapshot ? baseClip.text : line.spatial.text} : null,
    now: () => time, onCaption: (text, event) => captions.push({text, event}),
    setTimer(fn, delay) {const id = ++serial; timers.set(id, {at: time + delay, fn}); return id;},
    clearTimer: id => timers.delete(id)});
  controller.setPace(3000); controller.setPlayback(playback); controller.setEnabled(true);
  return {controller, audios, captions, timers, pendingAudio, advance(ms) {time += ms;}};
}
function begin(h, state, fact) {
  h.controller.tick(state, {blocked: true});
  assert.equal(h.controller.reveal({kind: 'trend', priority: 1, text: fact.text, id: 'continuity:' + fact.key,
    clipKey: null, spatial: fact, team: fact.team}), true);
  assert.equal(h.audios.length, 1);
  assert.equal(h.controller.getState().audioStatus, h.pendingAudio ? 'loading' : 'playing');
  return h.audios[0];
}
const reaction = kind => ({kind, priority: kind === 'goal' ? 4 : 2,
  id: `continuity:${kind}`, text: kind === 'goal' ? 'A goal!' : 'A shot!',
  clipKey: kind === 'goal' ? 'goal_generic' : 'shot_normal', shot: true});

test('a completed cross explanation finishes across the next normal attacker and defender moves', () => {
  const h = harness(), {after, fact} = completedCross(), audio = begin(h, after, fact);
  h.advance(3000);
  const advanced = E.applyMove(after, 'white-Q', 7, 4);
  assert.notEqual(advanced, after); assert.equal(advanced.lastAction?.type, 'move');
  h.controller.observe(after, advanced);
  assert.equal(audio.pauses, 0, 'an ordinary carry cannot invalidate a completed cross');
  h.advance(3000);
  const response = E.skipMove(advanced);
  assert.equal(response.phase, 'defendMove');
  h.controller.observe(advanced, response);
  const defended = E.applyMove(response, 'black-R2', 13, 3);
  assert.notEqual(defended, response);
  h.controller.observe(response, defended);
  assert.equal(audio.pauses, 0, 'the reply move must not clip a historical explanation');
  assert.equal(h.audios.length, 1, 'routine actions are not queued behind the sentence');
  assert.equal(h.controller.getState().speaking, true);
  audio.onended(); assert.equal(h.controller.getState().speaking, false);
  h.controller.destroy();
});

for (const kind of ['attempt', 'goal']) test(`${kind} still interrupts a completed-action explanation`, () => {
  const h = harness(), {after, fact} = completedCross(), audio = begin(h, after, fact), late = audio.onended;
  assert.equal(h.controller.reveal(reaction(kind)), true);
  assert.ok(audio.pauses > 0); assert.equal(h.captions.at(-1).event.kind, kind);
  late(); assert.equal(h.captions.at(-1).event.kind, kind);
  assert.equal(h.controller.getState().speaking, true);
  h.controller.destroy();
});

for (const change of ['turnover', 'restart']) test(`a ${change} ends the preceding attack's completed-action explanation`, () => {
  const h = harness(), {after, fact} = completedCross(), audio = begin(h, after, fact);
  const next = structuredClone(after);
  if (change === 'turnover') {next.attack = 'black'; next.ball = {x: 12, y: 3, carrierId: 'black-R2'};}
  else next.restart = {type: 'corner', team: 'white'};
  next.turn++; next.lastAction = null;
  h.controller.observe(after, next);
  assert.ok(audio.pauses > 0); assert.equal(h.controller.getState().speaking, false);
  h.controller.destroy();
});

for (const change of ['mute', 'pace', 'pause', 'reset']) test(`${change} immediately stops a completed-action explanation`, () => {
  const h = harness(), {after, fact} = completedCross(), audio = begin(h, after, fact), late = audio.onplaying;
  if (change === 'mute') h.controller.setEnabled(false);
  else if (change === 'pace') h.controller.setPace(1800);
  else if (change === 'pause') h.controller.suspend();
  else h.controller.reset();
  assert.ok(audio.pauses > 0); assert.equal(h.controller.getState().speaking, false);
  assert.equal(h.timers.size, 0); late();
  assert.equal(h.controller.getState().speaking, false);
  assert.equal(h.captions.at(-1).text, '');
  h.controller.destroy();
});

test('an urgent current-position claim still stops when its native evidence disappears', () => {
  const state = position({support: true, phase: 'defendMove'});
  state.pieces.push({id: 'black-R1', team: 'black', type: 'R', x: 6, y: 10});
  const fact = commentaryPositionFacts(state).find(value => value.type === 'pressing');
  assert.ok(fact); assert.equal(fact.live, true); assert.equal(fact.urgent, true);
  const h = harness(), audio = begin(h, state, fact);
  const next = E.applyMove(state, 'black-R1', 7, 10);
  assert.notEqual(next, state);
  h.controller.observe(state, next);
  assert.ok(audio.pauses > 0, 'a vanished current tackle threat must not be spoken as still present');
  h.controller.destroy();
});


function supportPosition() {
  const state = position({support: true, phase: 'defendMove'});
  const fact = commentaryPositionFacts(state).find(value => value.type === 'support');
  assert.ok(fact); assert.equal(fact.live, true);
  return {state, fact};
}
function changeSupport(state) {
  const next = structuredClone(state), supporter = next.pieces.find(piece => piece.id === 'white-R1');
  Object.assign(supporter, {x: 7, y: 5});
  next.turn++; next.lastAction = {type: 'move', team: 'white', pieceId: supporter.id,
    from: {x: 6, y: 5}, to: {x: 7, y: 5}};
  return next;
}

test('a started snapshot clip finishes when the next routine action changes its original support lane', () => {
  const h = harness({snapshot: true}), {state, fact} = supportPosition(), audio = begin(h, state, fact);
  assert.match(h.captions.at(-1).text, /had support/);
  h.advance(3000);
  const next = changeSupport(state);
  assert.ok(!commentaryPositionFacts(next).some(value => value.key === fact.key));
  h.controller.observe(state, next);
  assert.equal(audio.pauses, 0, 'a truthful past-tense sentence must not be cut at the next action');
  assert.equal(h.controller.getState().speaking, true);
  audio.onended(); assert.equal(h.controller.getState().speaking, false);
  h.controller.destroy();
});

for (const change of ['turnover', 'restart']) test(`a started past-tense snapshot finishes over a ${change}`, () => {
  const h = harness({snapshot: true}), {state, fact} = supportPosition(), audio = begin(h, state, fact);
  const next = structuredClone(state);
  if (change === 'turnover') {next.attack = 'black'; next.ball = {x: 12, y: 3, carrierId: 'black-R2'};}
  else next.restart = {type: 'corner', team: 'white'};
  next.turn++; next.lastAction = null;
  h.controller.observe(state, next);
  assert.equal(audio.pauses, 0, 'a later possession or restart does not undo the historical fact');
  assert.equal(h.controller.getState().speaking, true);
  h.controller.destroy();
});

test('a snapshot whose audio has not started cannot begin after its live evidence changes', async () => {
  const h = harness({snapshot: true, pendingAudio: true}), {state, fact} = supportPosition();
  const audio = begin(h, state, fact), latePlaying = audio.onplaying;
  assert.equal(h.controller.getState().audioStatus, 'loading');
  const next = changeSupport(state);
  h.controller.observe(state, next);
  assert.ok(audio.pauses > 0); assert.equal(h.controller.getState().speaking, false);
  latePlaying(); audio.resolvePlay(); await Promise.resolve();
  assert.equal(h.controller.getState().speaking, false);
  assert.equal(h.captions.at(-1).text, '');
  h.controller.destroy();
});

for (const kind of ['attempt', 'goal']) test(`${kind} preempts a started snapshot without reviving it later`, () => {
  const h = harness({snapshot: true}), {state, fact} = supportPosition(), audio = begin(h, state, fact);
  const late = audio.onended;
  assert.equal(h.controller.reveal(reaction(kind)), true);
  assert.ok(audio.pauses > 0); assert.equal(h.captions.at(-1).event.kind, kind);
  late(); assert.equal(h.captions.at(-1).event.kind, kind);
  h.controller.destroy();
});

for (const change of ['pendingShot', 'finished']) test(`${change} immediately stops even a started snapshot`, () => {
  const h = harness({snapshot: true}), {state, fact} = supportPosition(), audio = begin(h, state, fact);
  const next = structuredClone(state);
  if (change === 'pendingShot') {next.pendingShot = {shooterId: 'white-Q'}; next.phase = 'keeperReact';}
  else next.phase = 'finished';
  h.controller.tick(next, {blocked: true});
  assert.ok(audio.pauses > 0); assert.equal(h.controller.getState().speaking, false);
  h.controller.destroy();
});

for (const change of ['mute', 'pace', 'pause', 'reset']) test(`${change} still cancels a started snapshot immediately`, () => {
  const h = harness({snapshot: true}), {state, fact} = supportPosition(), audio = begin(h, state, fact);
  const late = audio.onplaying;
  if (change === 'mute') h.controller.setEnabled(false);
  else if (change === 'pace') h.controller.setPace(1800);
  else if (change === 'pause') h.controller.suspend();
  else h.controller.reset();
  assert.ok(audio.pauses > 0); assert.equal(h.controller.getState().speaking, false);
  assert.equal(h.timers.size, 0); late();
  assert.equal(h.controller.getState().speaking, false);
  assert.equal(h.captions.at(-1).text, '');
  h.controller.destroy();
});

test('duplicate browser playback notifications cannot cancel an already-started truthful snapshot', async () => {
  const h = harness({snapshot: true, pendingAudio: true}), {state, fact} = supportPosition();
  const audio = begin(h, state, fact);
  audio.onplaying();
  assert.equal(h.controller.getState().audioStatus, 'playing');
  const next = changeSupport(state);
  h.controller.observe(state, next);
  assert.equal(audio.pauses, 0);
  audio.resolvePlay(); await Promise.resolve();
  assert.equal(audio.pauses, 0, 'play promise completion must not revalidate a sentence already in progress');
  audio.onplaying();
  assert.equal(audio.pauses, 0, 'duplicate playing events are harmless after the valid first start');
  assert.equal(h.controller.getState().speaking, true);
  h.controller.destroy();
});
