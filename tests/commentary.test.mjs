import test from 'node:test';
import assert from 'node:assert/strict';
import {createCommentary, commentaryEvent, commentaryPiece, commentaryVoices, analyseCommentaryTrend, completedCommentaryRound, COMMENTARY_DEMO} from '../dist/commentary.js';
import {E, fixture, point} from './helpers/shot-fixture.mjs';
import {createMatchStats, recordMatchTransition} from '../dist/match-stats.js';

const clone = structuredClone;
function shot({team = 'white', type = 'Q', blocker = false} = {}) {
  const before = fixture({team, type, origin: [6, 3], keeper: [8, 0]});
  if (blocker) Object.assign(before.pieces.find(p => p.id === `${team === 'white' ? 'black' : 'white'}-P1`), point([6, 2], team));
  const aim = point([6, -1], team), pending = E.applyKick(before, aim.x, aim.y);
  return {before, pending, model: E.shotModel(pending)};
}
function clockHarness({supported = true, fail = false, enabled = true, voices} = {}) {
  let time = 0, serial = 0;
  const timers = new Map(), captions = [], spoken = [];
  const speech = {cancelled: 0, speak(value) {if (fail) throw Error('Speech unavailable'); spoken.push(value);}, cancel() {this.cancelled++;}};
  const listeners = new Map();
  if (voices !== undefined) Object.assign(speech, {getVoices: () => voices, addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: name => listeners.delete(name)});
  class Utterance {constructor(text) {this.text = text;}}
  const controller = createCommentary({speechSynthesis: supported ? speech : null, Utterance: supported ? Utterance : null,
    onCaption: (text, event) => captions.push({text, event}), now: () => time,
    setTimer(fn, delay) {const id = ++serial; timers.set(id, {at: time + delay, fn}); return id;}, clearTimer: id => timers.delete(id)});
  controller.setPace(3000); if (enabled) controller.setEnabled(true);
  const advance = ms => {
    const end = time + ms;
    for (;;) {
      const next = [...timers].filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break;
      timers.delete(next[0]); time = next[1].at; next[1].fn();
    }
    time = end;
  };
  return {controller, speech, spoken, captions, timers, advance, listeners};
}
const line = (kind, id = kind) => ({kind, priority: {trend: 1, attempt: 2, outcome: 3, goal: 4}[kind], text: `${kind} commentary`, id});

test('piece names preserve stable player numbers and team names are football names', () => {
  assert.equal(commentaryPiece('white-N2'), 'knight two');
  assert.equal(commentaryPiece('black-P3'), 'pawn three');
  assert.equal(commentaryPiece('black-K'), 'keeper');
  assert.equal(commentaryPiece('<script>'), 'player');
  const {before, pending} = shot({team: 'black'});
  assert.match(commentaryEvent(before, pending).text, /Obsidian's queen shoots/);
});

for (const team of ['white', 'black']) {
  test(`${team}: engine-generated attempt and all six shooting outcomes describe public facts`, () => {
    const {before, pending, model} = shot({team, blocker: true});
    const untouched = clone({before, pending});
    assert.equal(commentaryEvent(before, pending).kind, 'attempt');
    assert.doesNotMatch(commentaryEvent(before, pending).text, /goal for|saved|blocked|wide/i);
    const branches = [
      ['goalProbability', 'goal', /GOAL for/],
      ['keeperCornerProbability', 'outcome', /keeper turns it behind.*Corner/],
      ['caughtSaveProbability', 'outcome', /Saved.*holds it/],
      ['missProbability', 'outcome', /shoot wide.*Goal kick/],
      ['blockOutProbability', 'outcome', /Blocked.*Corner/],
      ['blockPossessionProbability', 'outcome', /Blocked.*takes possession/]
    ];
    let start = 0;
    for (const [key, kind, message] of branches) {
      assert.ok(model[key] > 0, `${key} has a genuine nonzero branch`);
      const after = E.skipMove(pending, {roll: start + model[key] / 2});
      const result = commentaryEvent(pending, after);
      assert.equal(result.kind, kind); assert.match(result.text, message);
      assert.equal(result.shot, true);
      start += model[key];
    }
    assert.deepEqual({before, pending}, untouched, 'narration never mutates game state or consumes random draws');
  });
}

test('a disguised shot never announces the chosen target or future result', () => {
  const before = fixture({type: 'N', origin: [6, 1]});
  const options = E.disguisedShotTargets(before), pending = E.applyKick(before, options[0].x, options[0].y, {disguise: true});
  const event = commentaryEvent(before, pending);
  assert.match(event.text, /knight one shoots!/); assert.doesNotMatch(event.text, /[a-n]\d|50|left|right|goal for/i);
  assert.equal(pending.pendingShot.chosenTargetIndex, undefined);
});

test('an actual own goal celebrates the beneficiary and identifies the opposing scorer', () => {
  const before = fixture({origin: [6, 3]});
  Object.assign(before.pieces.find(p => p.id === 'white-K'), {x: 8, y: 16});
  const pending = E.applyKick(before, 6, E.BOARD_HEIGHT);
  const after = E.skipMove(pending, {roll: 0});
  assert.equal(after.lastAction.type, 'goal'); assert.equal(after.score.black, 1);
  const event = commentaryEvent(pending, after);
  assert.equal(event.ownGoal, true); assert.match(event.text, /^GOAL for Obsidian! An own goal by Ivory's queen!/);
  assert.match(event.text, /Ivory 0, Obsidian 1/); assert.doesNotMatch(event.text, /queen scores/);
});

test('goal credits a verified scorer and assist from match statistics, never guesses one', () => {
  const {before, pending} = shot();
  const initial = createMatchStats(); initial.lastPass = {team: 'white', providerId: 'white-B2', receiverId: 'white-Q'};
  const attempted = recordMatchTransition(initial, before, pending), after = E.skipMove(pending, {roll: 0});
  const stats = recordMatchTransition(attempted, pending, after);
  assert.match(commentaryEvent(pending, after, {stats}).text, /Queen scores! Assisted by bishop two/);
  assert.doesNotMatch(commentaryEvent(pending, after).text, /Assisted/);
  stats.goals[0].assistId = 'black-B2';
  assert.doesNotMatch(commentaryEvent(pending, after, {stats}).text, /Assisted/);
});

test('a penalty call distinguishes taking and converting; it cannot manufacture an assist', () => {
  const {before, pending} = shot(); pending.pendingShot.penalty = true;
  assert.match(commentaryEvent(before, pending).text, /takes the penalty/);
  const after = E.skipMove(pending, {roll: 0});
  const stats = {goals: [{team: 'white', scorerId: 'white-Q', assistId: 'white-B1', turn: after.turn}]};
  const goal = commentaryEvent(pending, after, {stats});
  assert.match(goal.text, /converts the penalty/); assert.doesNotMatch(goal.text, /Assisted/);
});

test('a stalling wrapper preserves the actual shot result and backward catches are releases', () => {
  const {pending} = shot(), after = E.skipMove(pending, {roll: 0});
  const wrapped = {...after, lastAction: {type: 'stalling', triggeringAction: after.lastAction}};
  assert.equal(commentaryEvent(pending, wrapped).text, commentaryEvent(pending, after).text);
  const caught = {...after, lastAction: {...after.lastAction, type: 'save', team: 'white', keeperId: 'white-K', backPass: true, outcome: 'saved'}};
  assert.match(commentaryEvent(pending, caught).text, /gathers the backward ball and must release/);
  assert.doesNotMatch(commentaryEvent(pending, caught).text, /Saved/);
});

test('unchanged states, keeper previews and non-shot moves produce no event', () => {
  const {before, pending} = shot();
  assert.equal(commentaryEvent(before, before), null);
  assert.equal(commentaryEvent(pending, clone(pending)), null);
  const move = {...before, lastAction: {type: 'move', pieceId: 'white-Q'}};
  assert.equal(commentaryEvent(before, move), null);
});

test('voice starts OFF; enabling never replays old match events', () => {
  const h = clockHarness({enabled: false}), {before, pending} = shot();
  assert.equal(h.controller.getState().enabled, false);
  h.controller.observe(before, pending); assert.equal(h.spoken.length, 0);
  h.controller.setEnabled(true); h.controller.observe(before, pending);
  assert.equal(h.spoken.length, 0);
});

test('a deferred goal is silent before impact and survives a long pause, but not Undo/reset', () => {
  const h = clockHarness(), {before, pending} = shot(), goal = E.skipMove(pending, {roll: 0});
  h.controller.observe(before, pending); const deferred = h.controller.observe(pending, goal, {deferResult: true});
  assert.equal(h.spoken.length, 1); assert.equal(deferred.kind, 'goal');
  assert.ok(h.captions.every(caption => !/GOAL for/.test(caption.text)));
  h.controller.suspend(); h.advance(120000);
  assert.equal(h.controller.reveal(deferred), true); assert.match(h.spoken.at(-1).text, /GOAL for/);
  h.controller.reset(); assert.equal(h.controller.reveal(deferred), false);
});

test('shot outcomes preempt attempt, goals preempt analysis, and old callbacks cannot clear a goal', () => {
  const h = clockHarness();
  h.controller.reveal(line('trend')); const old = h.spoken.at(-1);
  h.controller.reveal(line('attempt')); assert.equal(h.speech.cancelled, 1);
  h.controller.reveal(line('outcome')); assert.equal(h.speech.cancelled, 2);
  h.controller.reveal(line('goal')); assert.equal(h.speech.cancelled, 3);
  old.onend(); old.onerror();
  assert.equal(h.controller.getState().speaking, true); assert.equal(h.captions.at(-1).event.kind, 'goal');
  assert.equal(h.controller.reveal(line('trend', 'late-trend')), false, 'no analysis is queued behind the goal');
});

test('automatic replay may preserve the goal call; manual replay and OFF stop it', () => {
  const h = clockHarness(); h.controller.reveal(line('goal'));
  h.controller.suspend({preserveGoal: true}); assert.equal(h.speech.cancelled, 0);
  h.controller.suspend(); assert.equal(h.speech.cancelled, 1);
  assert.equal(h.controller.reveal(line('goal')), false, 'manual replay cannot duplicate the call');
  h.controller.reveal(line('goal', 'new-goal')); h.controller.setEnabled(false);
  assert.equal(h.controller.getState().speaking, false); assert.equal(h.timers.size, 0); assert.equal(h.captions.at(-1).text, '');
  assert.equal(h.controller.reveal(line('goal', 'while-off')), false);
});

test('absent or failing speech synthesis leaves readable captions without throwing', () => {
  for (const options of [{supported: false}, {fail: true}]) {
    const h = clockHarness(options);
    assert.doesNotThrow(() => h.controller.reveal(line('goal')));
    assert.equal(h.captions.at(-1).text, 'goal commentary');
    h.advance(20000); assert.equal(h.controller.getState().speaking, false); assert.equal(h.captions.at(-1).text, '');
  }
});

test('a speech engine that never ends is cancelled by the watchdog', () => {
  const h = clockHarness(); h.controller.reveal(line('goal')); h.advance(20000);
  assert.equal(h.speech.cancelled, 1); assert.equal(h.controller.getState().speaking, false);
});

test('stale ordinary events drop and repeated impact hooks cannot announce twice', () => {
  const h = clockHarness(); h.advance(20000);
  assert.equal(h.controller.reveal({...line('attempt'), createdAt: 0}), false);
  const {pending} = shot(), goal = E.skipMove(pending, {roll: 0});
  h.controller.observe(pending, goal); h.controller.observe(pending, goal);
  assert.equal(h.spoken.length, 1);
});

test('voice is exclusive to exactly three-second pace and switching pace cancels immediately', () => {
  const h = clockHarness(); h.controller.reveal(line('goal'));
  h.controller.setPace(100);
  assert.equal(h.controller.getState().enabled, false); assert.equal(h.controller.getState().speaking, false);
  assert.equal(h.controller.setEnabled(true), false); assert.equal(h.controller.demo(), false);
  assert.equal(h.controller.reveal(line('goal', 'g2')), false); assert.equal(h.timers.size, 0);
  for (const pace of [0, 300, 1200, 2999, 3001, 5000]) {
    h.controller.setPace(pace); assert.equal(h.controller.setEnabled(true), false);
  }
  h.controller.setPace(3000); assert.equal(h.controller.getState().enabled, false);
  assert.equal(h.controller.setEnabled(true), true); assert.equal(h.controller.reveal(line('goal', 'g3')), true);
});

test('short demo is explicitly marked and OFF cancels every future demo line', () => {
  const h = clockHarness(); assert.equal(h.controller.demo(), true);
  assert.match(h.spoken[0].text, /Commentary demo/); assert.equal(h.captions.at(-1).event.demo, true);
  h.advance(5000); assert.equal(h.spoken.length, 2);
  h.controller.setEnabled(false); assert.equal(h.timers.size, 0); h.advance(60000);
  assert.equal(h.spoken.length, 2); assert.equal(h.controller.getState().demo, false);
  assert.equal(h.controller.demo(), false); assert.equal(COMMENTARY_DEMO.at(-1).kind, 'goal');
});

test('demo cannot mix with live observations and starting a match reset stops the sample', () => {
  const h = clockHarness(), {before, pending} = shot(); h.controller.demo();
  h.controller.observe(before, pending); assert.equal(h.spoken.length, 1);
  h.controller.reset(); h.advance(60000); assert.equal(h.spoken.length, 1);
  h.controller.observe(before, pending); assert.equal(h.spoken.length, 2);
});

test('completed-round detector excludes off-ball, free pawn, pass-and-run and deferred keeper release', () => {
  const before = {attack: 'white', phase: 'attackMove', turn: 3, ball: {x: 6, y: 5, carrierId: 'white-Q'}};
  for (const phase of ['attackMove', 'defendMove', 'kick', 'passRun']) {
    const after = {...before, phase, turn: 4, lastAction: {type: 'move', freePawn: true}};
    assert.equal(completedCommentaryRound(before, after), false);
  }
  const kick = {...before, phase: 'kick'};
  const after = {...before, turn: 4, lastAction: {type: 'kick'}};
  assert.equal(completedCommentaryRound(kick, after), true);
  assert.equal(completedCommentaryRound(kick, {...after, phase: 'keeperRelease'}), false);
  assert.equal(completedCommentaryRound({...kick, phase: 'keeperRelease', ballProgress: {releaseAlreadyCounted: true}}, after), false);
  assert.equal(completedCommentaryRound({...kick, restart: {type: 'corner'}}, after), false);
});

test('three positioning clicks cannot fabricate territorial pressure', () => {
  const h = clockHarness();
  for (let turn = 1; turn <= 4; turn++) {
    const before = {phase: 'attackMove', attack: 'white', turn, ball: {x: 6, y: 2, carrierId: 'white-Q'}};
    const after = {...before, turn: turn + 1, lastAction: {type: 'move', freePawn: true, pieceId: 'white-P1'}};
    assert.equal(h.controller.observe(before, after), null);
  }
  assert.equal(h.spoken.length, 0);
});

test('trend language follows observed ball progress, territory and possession switches', () => {
  const samples = (team, ys, xs = []) => ys.map((y, index) => ({team, turn: index, ball: {x: xs[index] ?? 6, y}}));
  assert.equal(analyseCommentaryTrend(samples('white', [8, 7])), null);
  assert.match(analyseCommentaryTrend(samples('white', [8, 6, 4])).text, /advancing through the centre/);
  assert.match(analyseCommentaryTrend(samples('black', [8, 10, 12], [12, 12, 12])).text, /wing.*outer files/);
  assert.match(analyseCommentaryTrend(samples('white', [3, 3, 3])).text, /attacking third/);
  assert.match(analyseCommentaryTrend(samples('black', [6, 6, 6, 6])).text, /gaining little ground/);
  const counter = [...samples('white', [8]), ...samples('black', [5, 7, 10])];
  assert.match(analyseCommentaryTrend(counter).text, /won it back and broken forward/);
  assert.equal(analyseCommentaryTrend(samples('black', [5, 5])), null, 'a turnover alone does not invent a counterattack');
});

test('three-second pace retains the full explanation and other paces cannot speak it', () => {
  const samples = [8, 6, 4].map((y, turn) => ({team: 'white', turn, ball: {x: 6, y}}));
  const event = analyseCommentaryTrend(samples), normal = clockHarness(), fast = clockHarness();
  fast.controller.setPace(100);
  assert.equal(normal.controller.reveal(event), true); assert.equal(fast.controller.reveal(event), false);
  assert.equal(normal.spoken[0].text, event.text);
  assert.equal(fast.spoken.length, 0);
  assert.match(event.shortText, /Ivory advance through the centre/);
  assert.equal(normal.captions.at(-1).text, event.text, 'captions match what is spoken');
});

test('English voice ranking chooses an available natural voice and uses neutral delivery for goals', () => {
  const legacy = {voiceURI: 'legacy', name: 'Microsoft David Desktop', lang: 'en-US', default: true};
  const natural = {voiceURI: 'natural', name: 'Microsoft Aria Online Natural', lang: 'en-US'};
  const foreign = {voiceURI: 'foreign', name: 'French Neural', lang: 'fr-FR'};
  const voices = [legacy, foreign, natural], h = clockHarness({voices});
  assert.equal(commentaryVoices(voices).length, 2);
  assert.equal(h.controller.getState().voiceName, natural.name);
  assert.equal(h.controller.getState().quality, 'natural');
  h.controller.reveal(line('goal'));
  assert.equal(h.spoken[0].voice, natural); assert.equal(h.spoken[0].pitch, 1); assert.equal(h.spoken[0].rate, 1);
  assert.equal(h.controller.setVoice(commentaryVoices([legacy])[0].id), true);
  assert.equal(h.controller.getState().voiceName, legacy.name); assert.equal(h.controller.getState().quality, 'standard');
  assert.equal(h.controller.setVoice('missing'), false);
  assert.equal(h.controller.setVoice(null), true); assert.equal(h.controller.getState().voiceName, natural.name);
});

test('asynchronously loaded voices update selection and an empty catalog never uses the bad default', () => {
  const voices = [], h = clockHarness({voices});
  h.controller.reveal(line('goal')); assert.equal(h.spoken.length, 0);
  assert.equal(h.controller.getState().quality, 'unavailable');
  voices.push({voiceURI: 'google', name: 'Google US English', lang: 'en-US'});
  h.listeners.get('voiceschanged')();
  assert.equal(h.controller.getState().voiceName, 'Google US English');
  h.controller.reveal(line('goal', 'loaded')); assert.equal(h.spoken.at(-1).voice, voices[0]);
  h.controller.destroy(); assert.equal(h.listeners.size, 0);
});

test('a goal clears old territorial history before the next kickoff', () => {
  const h = clockHarness();
  for (let turn = 1; turn <= 2; turn++) {
    const before = {phase: 'kick', attack: 'white', turn, ball: {x: 6, y: 2, carrierId: 'white-Q'}};
    h.controller.observe(before, {...before, phase: 'attackMove', turn: turn + 1, lastAction: {type: 'kick'}});
  }
  const {pending} = shot(); h.controller.observe(pending, E.skipMove(pending, {roll: 0}));
  const next = {phase: 'kick', attack: 'white', turn: 20, ball: {x: 6, y: 2, carrierId: 'white-Q'}};
  assert.equal(h.controller.observe(next, {...next, phase: 'attackMove', turn: 21, lastAction: {type: 'kick'}}), null);
});
