import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../dist/engine.js';
import {createCommentary} from '../dist/commentary.js';
import {commentaryPositionFacts} from '../dist/commentary-spatial.js';

// Full squads, legal occupied squares and a genuine public carrier. No policy,
// search, random draw or simulated match is needed to test speech transport.
function position({oneOnOne = false, phase = 'attackMove'} = {}) {
  const state = E.createGame({mode: 'local', seed: 1984});
  const assigned = {
    'white-Q': oneOnOne ? [6, 3] : [6, 8],
    'white-K': [6, 15], 'black-K': [6, 1],
    'white-R1': oneOnOne ? [2, 12] : [6, 5],
    'black-R1': oneOnOne ? [13, 12] : [10, 4],
    ...(oneOnOne ? {'black-N1': [7, 6]} : {}),
  };
  const used = new Set(Object.values(assigned).map(pair => pair.join(',')));
  assert.equal(used.size, Object.keys(assigned).length);
  const parking = Array.from({length: E.BOARD_HEIGHT}, (_, y) => [[0, y], [E.BOARD_WIDTH - 1, y]]).flat();
  for (const piece of state.pieces) {
    const square = assigned[piece.id] || parking.find(pair => !used.has(pair.join(',')));
    used.add(square.join(','));
    [piece.x, piece.y] = square;
    assert.ok(E.canOccupySquare(piece, piece.x, piece.y), `${piece.id} has a legal square`);
  }
  const carrier = state.pieces.find(piece => piece.id === 'white-Q');
  Object.assign(state, {attack: 'white', phase, turn: 1,
    ball: {x: carrier.x, y: carrier.y, carrierId: carrier.id},
    restart: null, offside: null, pendingShot: null, passRun: null,
    lastAction: null, releaseReason: null, looseBallKickOrigin: null});
  state.positionBudget = {normalUsed: false, pawnUsed: false, dribbleUsed: false};
  state.ballProgress = {team: 'white', anchorY: carrier.y, rounds: 0, pendingRelease: false, excludeRelease: false};
  assert.equal(new Set(state.pieces.map(piece => `${piece.x},${piece.y}`)).size, 22);
  return state;
}

function reposition(before, id, x, y) {
  const after = structuredClone(before), piece = after.pieces.find(value => value.id === id);
  const from = {x: piece.x, y: piece.y};
  assert.ok(!after.pieces.some(value => value.id !== id && value.x === x && value.y === y));
  Object.assign(piece, {x, y});
  assert.ok(E.canOccupySquare(piece, x, y));
  after.turn++;
  after.phase = before.phase === 'defendMove' ? 'kick' : 'defendMove';
  after.lastAction = {type: 'move', team: piece.team, pieceId: id, from, to: {x, y}};
  return after;
}

function harness({ready = true, playback = 'local'} = {}) {
  let time = 0, serial = 0;
  const timers = new Map(), captions = [], jobs = [], audios = [], deviceCalls = [];
  const local = {
    loads: 0, cancels: 0,
    getState: () => ({ready, supported: true, status: ready ? 'ready' : 'idle', unlocked: true}),
    load() {this.loads++; return Promise.resolve();},
    speak(text, settings) {return new Promise((resolve, reject) => jobs.push({text, settings, resolve, reject}));},
    cancel() {this.cancels++;},
  };
  class Audio {
    constructor(src) {this.src = src; audios.push(this);}
    play() {}
    pause() {}
    removeAttribute() {}
    load() {}
  }
  class Utterance {constructor(text) {this.text = text;}}
  const controller = createCommentary({localSpeech: local, AudioCtor: Audio,
    speechSynthesis: {speak: value => deviceCalls.push(value), cancel() {}}, Utterance,
    now: () => time,
    onCaption: (text, event) => captions.push({text, event}),
    setTimer(fn, delay) {const id = ++serial; timers.set(id, {at: time + delay, fn}); return id;},
    clearTimer: id => timers.delete(id)});
  controller.setPace(3000);
  controller.setEnabled(true);
  controller.setPlayback(playback);
  function advance(ms) {
    const end = time + ms;
    for (;;) {
      const next = [...timers].filter(([, value]) => value.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break;
      timers.delete(next[0]); time = next[1].at; next[1].fn();
    }
    time = end;
  }
  return {controller, local, captions, jobs, audios, deviceCalls, timers, advance};
}

const flush = async () => {await Promise.resolve(); await Promise.resolve(); await Promise.resolve();};
async function finish(job) {job.settings.onPlaying(); job.resolve({spoken: true}); await flush();}
function beginSpatial(h, state) {
  assert.equal(h.controller.tick(state), true);
  const caption = h.captions.at(-1);
  assert.ok(caption.event?.spatial?.live, 'the heartbeat selects a live spatial observation');
  assert.equal(caption.event.clipKey, null, 'fresh technical text is not represented by an unrelated recording');
  assert.ok(commentaryPositionFacts(state).some(fact => fact.key === caption.event.spatial.key));
  return caption;
}

test('Hugo voices a past-tense observation while retaining the exact current fact for start validation', async () => {
  const h = harness(), state = position(), untouched = structuredClone(state);
  const caption = beginSpatial(h, state);
  assert.equal(h.jobs.length, 1);
  assert.equal(h.jobs[0].text, caption.text);
  assert.equal(h.jobs[0].text, "Ivory's rook one supported the queen along an open vertical file.");
  assert.equal(caption.event.spatial.text, "Ivory's rook one supports the queen along an open vertical file.");
  assert.match(caption.text, /queen|rook/i);
  assert.equal(caption.event.snapshot, true);
  assert.equal(h.audios.length, 0); assert.equal(h.deviceCalls.length, 0);
  assert.deepEqual(state, untouched, 'speech selection cannot change the board or random state');
  await finish(h.jobs[0]);
  assert.equal(h.controller.getState().speaking, false);
  h.controller.destroy();
});

test('a genuine one-on-one reaches Hugo with explicit urgent delivery', async () => {
  const h = harness(), caption = beginSpatial(h, position({oneOnOne: true}));
  assert.equal(caption.event.spatial.type, 'oneOnOne');
  assert.equal(h.jobs[0].settings.delivery, 'urgent');
  assert.match(h.jobs[0].text, /one.on.one|1.on.1/i);
  await finish(h.jobs[0]); h.controller.destroy();
});

for (const delay of [6500, 8500]) test(`a still-current spatial call can begin after ${delay}ms within the twelve-second local window`, async () => {
  const h = harness(), state = position(), caption = beginSpatial(h, state), job = h.jobs[0];
  assert.equal(job.settings.expiresAt, 12000);
  h.advance(delay);
  assert.equal(h.controller.getState().audioStatus, 'generating');
  assert.equal(h.local.cancels, 0); assert.equal(h.jobs.length, 1);
  assert.equal(h.controller.tick(state), false, 'quiet UI polling cannot queue another call or cancel a valid fact');
  job.settings.onPlaying();
  assert.equal(h.controller.getState().audioStatus, 'playing');
  assert.equal(h.captions.at(-1).text, caption.text);
  job.resolve({spoken: true}); await flush();
  assert.equal(h.controller.getState().speaking, false);
  assert.equal(h.audios.length, 0); assert.equal(h.deviceCalls.length, 0);
  h.controller.destroy();
});

for (const options of [{ready: false, playback: 'local'}, {ready: true, playback: 'recorded'}]) {
  test(`${options.playback}, local ready=${options.ready}: technical captions never become an unrelated recording or device voice`, () => {
    const h = harness(options), caption = beginSpatial(h, position());
    assert.equal(h.jobs.length, 0); assert.equal(h.audios.length, 0); assert.equal(h.deviceCalls.length, 0);
    assert.equal(h.captions.at(-1).text, caption.event.spatial.text);
    assert.equal(h.local.loads, 0, 'a match observation does not start a model download');
    h.controller.destroy();
  });
}

test('explicit device mode may speak the same technical explanation', () => {
  const h = harness({playback: 'device'}), caption = beginSpatial(h, position());
  assert.equal(h.deviceCalls.length, 1); assert.equal(h.deviceCalls[0].text, caption.text);
  assert.equal(h.jobs.length, 0); assert.equal(h.audios.length, 0);
  h.controller.destroy();
});

for (const failure of ['busy', 'deadline']) {
  test(`a ${failure} local spatial call preserves its factual caption without an unrelated fallback`, async () => {
    const h = harness(), caption = beginSpatial(h, position()), job = h.jobs[0];
    if (failure === 'busy') {job.resolve({spoken: false, reason: 'busy'}); await flush();}
    else {
      h.advance(11999);
      assert.equal(h.local.cancels, 0); assert.equal(h.controller.getState().audioStatus, 'generating');
      h.advance(1);
    }
    assert.equal(h.local.cancels, 1, 'failed or expired generation is cancelled once');
    assert.equal(h.audios.length, 0); assert.equal(h.deviceCalls.length, 0);
    assert.equal(h.captions.at(-1).text, caption.text);
    job.settings.onPlaying(); job.resolve({spoken: true}); await flush();
    assert.equal(h.audios.length, 0); assert.equal(h.deviceCalls.length, 0);
    assert.equal(h.controller.getState().audioStatus === 'playing', false, 'an expired or failed call cannot start later');
    h.controller.destroy();
  });
}

test('an irrelevant defender shuffle retains a still-valid support explanation', async () => {
  const before = position({phase: 'defendMove'}), h = harness(), caption = beginSpatial(h, before);
  assert.equal(caption.event.spatial.type, 'support');
  const after = reposition(before, 'black-R1', 11, 4);
  assert.ok(commentaryPositionFacts(after).some(fact => fact.key === caption.event.spatial.key), 'the named relationship still exists');
  h.controller.observe(before, after);
  assert.equal(h.local.cancels, 0); assert.equal(h.jobs.length, 1);
  assert.equal(h.captions.at(-1).text, caption.text);
  await finish(h.jobs[0]); h.controller.destroy();
});

test('defending-side pressure validates before local speech, then finishes naturally across a real turnover', async () => {
  const before = position({phase: 'defendMove'});
  Object.assign(before.pieces.find(piece => piece.id === 'black-R1'), {x: 6, y: 10});
  before.foulsEnabled = false;
  const h = harness(), caption = beginSpatial(h, before), job = h.jobs[0];
  assert.equal(caption.event.spatial.type, 'pressing');
  assert.equal(caption.event.spatial.team, 'black');
  assert.equal(before.attack, 'white', 'the team supplying pressure is the defending side');

  h.advance(1000);
  assert.equal(h.controller.tick(before), false, 'an unchanged one-second UI tick adds no speech');
  assert.equal(h.local.cancels, 0);
  assert.equal(h.controller.getState().audioStatus, 'generating');

  const pawn = before.pieces.find(piece => piece.id === 'black-P1');
  assert.deepEqual({x: pawn.x, y: pawn.y}, {x: 0, y: 7});
  const after = E.applyMove(before, pawn.id, 1, 7, {freePawn: true});
  assert.equal(after.phase, 'defendMove', 'the bonus step leaves the normal defensive action available');
  assert.ok(commentaryPositionFacts(after).some(fact => fact.key === caption.event.spatial.key));
  h.controller.observe(before, after);
  assert.equal(h.local.cancels, 0); assert.equal(h.jobs.length, 1);
  job.settings.onPlaying();
  assert.equal(h.controller.getState().audioStatus, 'playing', 'still-valid defending-side analysis can begin playback');

  const tackle = E.legalMoves(after, 'black-R1').find(move => move.type === 'tackle' && move.targetId === 'white-Q');
  assert.ok(tackle, 'the described rook pressure is backed by a legal tackle');
  const won = E.applyMove(after, 'black-R1', tackle.x, tackle.y);
  assert.equal(won.attack, 'black'); assert.equal(won.lastAction.type, 'tackle');
  h.controller.observe(after, won);
  assert.equal(h.local.cancels, 0, 'a new possession does not interrupt the begun historical observation');
  assert.match(h.captions.at(-1).text, /had the queen under pressure/);
  const textAfterTurnover = h.captions.at(-1).text;
  job.settings.onPlaying();
  assert.equal(h.local.cancels, 0, 'a duplicate local playback notification cannot revalidate begun speech');
  assert.equal(h.captions.at(-1).text, textAfterTurnover);
  job.resolve({spoken: true}); await flush();
  assert.equal(h.captions.at(-1).text, '');
  assert.equal(h.controller.getState().audioStatus === 'playing', false);
  h.controller.destroy();
});

test('a same-team pass reversing the support roles invalidates the old carrier-specific call', async () => {
  const before = position({phase: 'kick'}), h = harness(), caption = beginSpatial(h, before), job = h.jobs[0];
  assert.equal(caption.event.spatial.type, 'support');
  assert.equal(caption.event.spatial.pieceId, 'white-Q');
  assert.equal(caption.event.spatial.receiverId, 'white-R1');
  const after = E.applyKick(before, 6, 5, {roll: 0});
  assert.equal(after.attack, before.attack, 'the passing team has retained possession');
  assert.equal(after.ball.carrierId, 'white-R1');
  const facts = commentaryPositionFacts(after);
  const reverse = facts.find(fact => fact.type === 'support' && fact.pieceId === 'white-R1' && fact.receiverId === 'white-Q');
  assert.ok(reverse, 'the same pair now has the opposite carrier/supporter roles');
  assert.notEqual(reverse.key, caption.event.spatial.key, 'fact identities preserve the direction of the relationship');
  assert.ok(!facts.some(fact => fact.key === caption.event.spatial.key));
  h.controller.observe(before, after);
  assert.equal(h.local.cancels, 1);
  const textAfterPass = h.captions.at(-1).text;
  job.settings.onPlaying(); job.resolve({spoken: true}); await flush();
  assert.equal(h.captions.at(-1).text, textAfterPass);
  assert.equal(h.controller.getState().audioStatus === 'playing', false);
  assert.equal(h.jobs.length, 1);
  h.controller.destroy();
});

test('controller pass history recognizes a completed one-two only after the passer actually ran', () => {
  for (const run of [true, false]) {
    const h = harness();
    let state = position({phase: 'kick'});
    const commit = next => {
      const line = h.controller.observe(state, next);
      state = next;
      return line;
    };
    commit(E.applyKick(state, 6, 5, {passRun: true, roll: 0}));
    assert.equal(state.phase, 'passRun');
    assert.equal(state.ball.carrierId, 'white-R1');
    if (run) {
      const moved = commit(E.applyMove(state, 'white-Q', 6, 7));
      assert.equal(state.lastAction.passRun, true);
      assert.equal(moved?.spatial?.type, 'passRun');
    } else {
      commit(E.skipMove(state));
      assert.equal(state.lastAction.type, 'skip');
      assert.equal(state.lastAction.passRun, true, 'an offered run was declined, not performed');
    }
    for (let skip = 0; state.phase !== 'kick' && skip < 2; skip++) commit(E.skipMove(state));
    assert.equal(state.phase, 'kick');
    const queen = state.pieces.find(piece => piece.id === 'white-Q');
    const returned = commit(E.applyKick(state, queen.x, queen.y, {roll: 0}));
    assert.equal(state.ball.carrierId, queen.id);
    if (run) {
      assert.equal(returned?.spatial?.type, 'oneTwo');
      assert.match(returned.text, /one.two/i);
      assert.equal(returned.spatial.receiverId, 'white-Q');
      assert.equal(returned.spatial.pieceId, 'white-R1');
      assert.equal(h.jobs.length, 1, 'the factual return metadata is available even when routine audio is throttled');
    } else {
      assert.notEqual(returned?.spatial?.type, 'oneTwo', 'declining the run cannot fabricate a one-two');
    }
    h.controller.destroy();
  }
});

test('moving the named supporter off its passing line cancels stale spatial speech', async () => {
  const before = position(), h = harness(), caption = beginSpatial(h, before);
  assert.equal(caption.event.spatial.type, 'support');
  const after = reposition(before, 'white-R1', 7, 5);
  assert.ok(!commentaryPositionFacts(after).some(fact => fact.key === caption.event.spatial.key), 'the original support claim no longer holds');
  const job = h.jobs[0]; h.controller.observe(before, after);
  assert.equal(h.local.cancels, 1); assert.equal(h.controller.getState().speaking, false);
  const textAfterCancellation = h.captions.at(-1).text;
  job.settings.onPlaying(); job.resolve({spoken: true}); await flush();
  assert.equal(h.captions.at(-1).text, textAfterCancellation);
  assert.equal(h.controller.getState().audioStatus === 'playing', false, 'late synthesis cannot revive an invalid observation');
  h.controller.destroy();
});

test('a still-valid support pair cancels its old sentence when the passing lane changes shape', async () => {
  const before = position(), h = harness(), caption = beginSpatial(h, before), job = h.jobs[0];
  assert.equal(caption.event.spatial.type, 'support');
  assert.match(caption.text, /vertical file/);
  const after = E.applyMove(before, 'white-R1', 9, 5);
  const changed = commentaryPositionFacts(after).find(fact => fact.key === caption.event.spatial.key);
  assert.ok(changed, 'the same carrier/supporter relationship still has an open native pass');
  assert.match(changed.text, /diagonal/);
  assert.notEqual(changed.text, caption.text, 'the previous vertical-file wording is no longer true');
  h.controller.observe(before, after);
  assert.equal(h.local.cancels, 1);
  const textAfterMove = h.captions.at(-1).text;
  job.settings.onPlaying(); job.resolve({spoken: true}); await flush();
  assert.equal(h.captions.at(-1).text, textAfterMove);
  assert.equal(h.controller.getState().audioStatus === 'playing', false);
  assert.equal(h.audios.length, 0); assert.equal(h.deviceCalls.length, 0);
  h.controller.destroy();
});

test('a knight arriving in covering range invalidates the pending one-on-one call', async () => {
  const before = position({oneOnOne: true, phase: 'defendMove'}), h = harness(), caption = beginSpatial(h, before);
  assert.equal(caption.event.spatial.type, 'oneOnOne');
  const after = reposition(before, 'black-N1', 8, 4);
  assert.ok(!commentaryPositionFacts(after).some(fact => fact.key === caption.event.spatial.key));
  h.controller.observe(before, after);
  assert.equal(h.local.cancels, 1); assert.equal(h.controller.getState().speaking, false);
  h.jobs[0].settings.onPlaying(); h.jobs[0].resolve({spoken: true}); await flush();
  assert.equal(h.controller.getState().audioStatus === 'playing', false);
  h.controller.destroy();
});

for (const stop of ['goal', 'off']) {
  test(`${stop} preempts spatial synthesis and its late result stays silent`, async () => {
    const h = harness(); beginSpatial(h, position()); const job = h.jobs[0];
    h.advance(8500); assert.equal(h.controller.getState().audioStatus, 'generating');
    if (stop === 'off') h.controller.setEnabled(false);
    else h.controller.reveal({kind: 'goal', priority: 4, text: 'GOAL for Ivory!', clipKey: 'goal_generic', id: 'spatial-test-goal'});
    const caption = h.captions.at(-1).text;
    assert.equal(h.local.cancels, 1); assert.equal(h.audios.length, stop === 'goal' ? 1 : 0);
    job.settings.onPlaying(); job.resolve({spoken: true}); await flush();
    assert.equal(h.captions.at(-1).text, caption); assert.equal(h.jobs.length, 1);
    assert.equal(h.deviceCalls.length, 0); assert.equal(h.controller.getState().speaking, stop === 'goal');
    h.controller.destroy();
  });
}

test('spatial heartbeats keep the twelve-second cadence and never queue repeated one-second ticks', async () => {
  const h = harness(); beginSpatial(h, position()); await finish(h.jobs[0]);
  h.advance(11999);
  assert.equal(h.controller.tick(position({oneOnOne: true})), false);
  assert.equal(h.jobs.length, 1);
  h.advance(1);
  assert.equal(h.controller.tick(position({oneOnOne: true})), true);
  assert.equal(h.jobs.length, 2);
  for (let i = 0; i < 5; i++) {h.advance(1000); assert.equal(h.controller.tick(position({oneOnOne: true})), false);}
  assert.equal(h.jobs.length, 2, 'current analysis never accumulates a speech backlog');
  h.controller.destroy();
});

test('historical technical events retain the ten-second routine throttle', async () => {
  const h = harness(); beginSpatial(h, position()); await finish(h.jobs[0]);
  const historical = {kind: 'trend', priority: 1, text: 'The bishop moved up to support the queen.', clipKey: null,
    spatial: {type: 'supportRun', key: 'past-support-run', live: false, urgent: false, team: 'white'}, id: 'past-support-run'};
  h.advance(9999); assert.equal(h.controller.reveal(historical), false); assert.equal(h.jobs.length, 1);
  h.advance(1); assert.equal(h.controller.reveal(historical), true); assert.equal(h.jobs.length, 2);
  assert.equal(h.jobs[1].text, historical.text);
  h.controller.destroy();
});

test('technical narration remains gated to the three-second pace', () => {
  const h = harness(); h.controller.setPace(1200);
  assert.equal(h.controller.setEnabled(true), false);
  assert.equal(h.controller.tick(position()), false);
  assert.equal(h.jobs.length, 0); assert.equal(h.audios.length, 0); assert.equal(h.deviceCalls.length, 0);
  h.controller.destroy();
});
