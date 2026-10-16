import test from 'node:test';
import assert from 'node:assert/strict';
import {createCommentary, commentaryEvent, commentaryPiece, commentaryVoices, commentarySituation, analyseCommentaryTrend, completedCommentaryRound, COMMENTARY_DEMO} from '../dist/commentary.js';
import {E, fixture, point} from './helpers/shot-fixture.mjs';
import {createMatchStats, recordMatchTransition} from '../dist/match-stats.js';
import {COMMENTARY_CLIPS, COMMENTARY_RECORDING} from '../dist/commentary-clips.js';

const clone = structuredClone;
function shot({team = 'white', type = 'Q', blocker = false} = {}) {
  const before = fixture({team, type, origin: [6, 3], keeper: [8, 0]});
  if (blocker) Object.assign(before.pieces.find(p => p.id === `${team === 'white' ? 'black' : 'white'}-P1`), point([6, 2], team));
  const aim = point([6, -1], team), pending = E.applyKick(before, aim.x, aim.y);
  return {before, pending, model: E.shotModel(pending)};
}
function clockHarness({supported = true, fail = false, enabled = true, voices, AudioCtor, clips, onPlaybackChanged} = {}) {
  let time = 0, serial = 0;
  const timers = new Map(), captions = [], spoken = [];
  const speech = {cancelled: 0, speak(value) {if (fail) throw Error('Speech unavailable'); spoken.push(value);}, cancel() {this.cancelled++;}};
  const listeners = new Map();
  if (voices !== undefined) Object.assign(speech, {getVoices: () => voices, addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: name => listeners.delete(name)});
  class Utterance {constructor(text) {this.text = text;}}
  const controller = createCommentary({speechSynthesis: supported ? speech : null, Utterance: supported ? Utterance : null,
    AudioCtor, ...(clips ? {clips} : {}), onPlaybackChanged,
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
  assert.match(commentaryEvent(before, pending).text, /Obsidian's queen (shoots|goes for goal|has a go)/);
});

for (const team of ['white', 'black']) {
  test(`${team}: engine-generated attempt and all six shooting outcomes describe public facts`, () => {
    const {before, pending, model} = shot({team, blocker: true});
    const untouched = clone({before, pending});
    assert.equal(commentaryEvent(before, pending).kind, 'attempt');
    assert.doesNotMatch(commentaryEvent(before, pending).text, /goal for|saved|blocked|wide/i);
    const branches = [
      ['goalProbability', 'goal', /GOAL for/],
      ['keeperCornerProbability', 'outcome', /(turns it behind|behind!.*keeps it out).*Corner/],
      ['caughtSaveProbability', 'outcome', /(Saved.*holds it|keeps it out.*holds on|Denied.*ball is safe)/],
      ['missProbability', 'outcome', /(shoot wide|Wide!).*Goal kick/],
      ['blockOutProbability', 'outcome', /[Bb]locked.*Corner/],
      ['blockPossessionProbability', 'outcome', /[Bb]locked.*takes possession/]
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
  assert.match(event.text, /knight one (shoots|goes for goal|has a go)/); assert.doesNotMatch(event.text, /[a-n]\d|50|left|right|goal for/i);
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
  assert.match(commentaryEvent(pending, after, {stats}).text, /Queen (scores|finds the net|finishes it)!.*Assisted by bishop two/);
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
  assert.match(analyseCommentaryTrend(counter).text, /win it back.*away on the break/);
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

test('English voice ranking chooses a natural voice and gives goals modest pace without raised pitch', () => {
  const legacy = {voiceURI: 'legacy', name: 'Microsoft David Desktop', lang: 'en-US', default: true};
  const natural = {voiceURI: 'natural', name: 'Microsoft Aria Online Natural', lang: 'en-US'};
  const foreign = {voiceURI: 'foreign', name: 'French Neural', lang: 'fr-FR'};
  const voices = [legacy, foreign, natural], h = clockHarness({voices});
  assert.equal(commentaryVoices(voices).length, 2);
  assert.equal(h.controller.getState().voiceName, natural.name);
  assert.equal(h.controller.getState().quality, 'natural');
  h.controller.reveal(line('goal'));
  assert.equal(h.spoken[0].voice, natural); assert.equal(h.spoken[0].pitch, 1); assert.equal(h.spoken[0].rate, 1.06);
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

test('enabling confirmation is immediate and a quiet match receives a factual update every twelve seconds', () => {
  const h = clockHarness(), state = fixture({origin: [6, 8]});
  assert.equal(h.controller.confirmEnabled(), true); assert.match(h.spoken[0].text, /Commentary is on/);
  h.advance(11999); assert.equal(h.controller.tick(state), false);
  h.advance(1); assert.equal(h.controller.tick(state), true); assert.match(h.spoken.at(-1).text, /Ivory have possession in midfield/);
  h.advance(12000); assert.equal(h.controller.tick(state), true);
  assert.match(h.spoken.at(-1).text, /attack runs through the queen in midfield/);
  assert.notEqual(h.spoken.at(-1).text, h.spoken.at(-2).text);
  assert.equal(h.controller.tick(state), false, 'a one-second UI tick never produces a backlog');
});

test('heartbeat rejects blocked or unresolved states and cannot interrupt a goal call', () => {
  const h = clockHarness(), {before, pending} = shot();
  assert.equal(h.controller.tick(before, {blocked: true}), false);
  assert.equal(h.controller.tick(pending), false); assert.equal(commentarySituation(pending), null);
  assert.equal(h.controller.tick({...before, phase: 'finished'}), false);
  h.controller.reveal(line('goal')); h.advance(12000);
  // A fresh goal may be longer than a routine call and always retains priority.
  h.controller.reveal({...line('goal', 'second-goal'), text: Array(40).fill('Goal').join(' ')});
  h.advance(12000); assert.equal(h.controller.tick(before), false);
  assert.equal(h.captions.at(-1).event.kind, 'goal');
  h.controller.setPace(1200); assert.equal(h.controller.tick(before), false); assert.equal(h.controller.confirmEnabled(), false);
});

test('situation updates rotate supported facts and describe loose balls without claiming a carrier', () => {
  const state = fixture({type: 'B', origin: [2, 5]});
  const texts = Array.from({length: 5}, (_, index) => commentarySituation(state, {index}).text);
  assert.match(texts[0], /final third/); assert.match(texts[1], /attack runs through the bishop/);
  assert.match(texts[2], /out wide/); assert.match(texts[3], /final third.*close to goal/);
  assert.match(Array.from({length: 7}, (_, index) => commentarySituation(state, {index}).text).join(' '), /score is level/);
  const loose = {...state, ball: {...state.ball, carrierId: null}};
  assert.match(commentarySituation(loose).text, /ball is loose/);
  assert.doesNotMatch(commentarySituation(loose, {index: 1}).text, /bishop.*possession/i);
});

test('real turnovers, progressive passes and restarts have factual routine calls', () => {
  const before = fixture({origin: [6, 8]});
  const moved = {...before, attack: 'black', lastAction: {type: 'tackle', pieceId: 'black-R1', team: 'black'}};
  assert.match(commentaryEvent(before, moved).text, /Obsidian (win it back|regain possession)/);
  const passed = {...before, lastAction: {type: 'kick', outcome: 'complete', team: 'white', from: {x: 6, y: 8}, to: {x: 6, y: 4}}};
  assert.match(commentaryEvent(before, passed).text, /send the ball forward through the centre/);
  for (const type of ['corner', 'throwIn', 'freeKick', 'stalling', 'goalKick', 'offside', 'timeout']) {
    const after = {...before, restart: {type, team: 'white'}, lastAction: {type: 'out'}};
    assert.match(commentaryEvent(before, after).text, /Ivory have/);
    assert.equal(commentaryEvent({...before, restart: after.restart}, after), null, 'the same restart is not re-announced on every repositioning action');
  }
});

test('routine event calls obey ten-second cooldown and never delay a shot or goal', () => {
  const h = clockHarness(); h.controller.reveal({...line('trend', 'r1'), text: 'Ivory win possession.'}); h.advance(6000);
  assert.equal(h.controller.reveal({...line('trend', 'r2'), text: 'Obsidian win possession.'}), false);
  assert.equal(h.controller.reveal(line('attempt')), true);
  assert.equal(h.controller.reveal(line('goal')), true); assert.equal(h.captions.at(-1).event.kind, 'goal');
  h.advance(12000); assert.equal(h.controller.reveal({...line('trend', 'r3'), text: 'Ivory have a corner.'}), true);
});

test('short voice test uses the chosen natural voice and changes no match state', () => {
  const natural = {name: 'English Natural', voiceURI: 'natural', lang: 'en-US'}, h = clockHarness({voices: [natural]});
  assert.equal(h.controller.testVoice(), true); assert.equal(h.spoken[0].voice, natural);
  assert.match(h.spoken[0].text, /selected voice/);
  h.controller.setEnabled(false); assert.equal(h.controller.testVoice(), false);
});

test('goal celebrations distinguish breaking the deadlock, equalising, taking the lead and chasing', () => {
  const {pending} = shot(), scored = E.skipMove(pending, {roll: 0});
  const cases = [
    [{white: 0, black: 0}, {white: 1, black: 0}, /deadlock is broken/],
    [{white: 1, black: 1}, {white: 2, black: 1}, /take the lead/],
    [{white: 0, black: 1}, {white: 1, black: 1}, /They're level/],
    [{white: 0, black: 2}, {white: 1, black: 2}, /pull one back/],
    [{white: 1, black: 0}, {white: 2, black: 0}, /extend the lead/]
  ];
  for (const [beforeScore, afterScore, context] of cases) {
    const line = commentaryEvent({...pending, score: beforeScore}, {...scored, score: afterScore});
    assert.match(line.text, context); assert.match(line.text, /GOAL for Ivory/);
    assert.ok(line.text.split(/\s+/).length <= 25, 'goal call fits the commentary rhythm');
  }
});

test('shot vocabulary varies deterministically and never calls a short effort a long shot', () => {
  const {before, pending} = shot(), lines = new Set();
  for (let turn = 1; turn <= 12; turn++) {
    const state = {...pending, turn}, line = commentaryEvent(before, state);
    assert.deepEqual(commentaryEvent(before, state), line);
    assert.doesNotMatch(line.text, /from (distance|range)/); lines.add(line.text);
  }
  assert.ok(lines.size >= 3);
  const long = shot(); long.pending.lastAction = {...long.pending.lastAction, from: {x: 6, y: 10}};
  assert.match(commentaryEvent(long.before, long.pending).text, /from (distance|range)/);
});

test('football descriptions of queen lines, wide rook channels and bishop diagonals require board evidence', () => {
  const before = fixture({origin: [6, 10]});
  const pass = {type: 'kick', team: 'white', pieceId: 'white-Q', outcome: 'complete', from: {x: 6, y: 10}, to: {x: 6, y: 4}};
  const after = {...before, lastAction: pass};
  Object.assign(before.pieces.find(p => p.id === 'black-P1'), {x: 5, y: 8});
  Object.assign(before.pieces.find(p => p.id === 'black-P2'), {x: 7, y: 6});
  assert.match(commentaryEvent(before, after).text, /queen breaks the lines/);
  Object.assign(before.pieces.find(p => p.id === 'black-P1'), {x: 0, y: 8});
  Object.assign(before.pieces.find(p => p.id === 'black-P2'), {x: 13, y: 6});
  assert.doesNotMatch(commentaryEvent(before, after).text, /breaks the lines/);
  const rookPass = {...pass, pieceId: 'white-R1', from: {x: 1, y: 10}, to: {x: 1, y: 5}};
  assert.match(commentaryEvent(before, {...after, lastAction: rookPass}).text, /rook.*wide channel/);
  const bishopPass = {...pass, pieceId: 'white-B1', from: {x: 2, y: 10}, to: {x: 6, y: 6}};
  assert.match(commentaryEvent(before, {...after, lastAction: bishopPass}).text, /bishop.*diagonal pass/);
  assert.doesNotMatch(commentaryEvent(before, {...after, lastAction: {...bishopPass, to: {x: 5, y: 6}}}).text, /diagonal pass/);
});

test('knight pockets and close defenders are described only when their visible positions support it', () => {
  const open = fixture({type: 'N', origin: [6, 3]});
  assert.match(commentarySituation(open, {index: 3}).text, /knight.*pocket of space/);
  Object.assign(open.pieces.find(p => p.id === 'black-P1'), {x: 5, y: 3});
  assert.doesNotMatch(commentarySituation(open, {index: 3}).text, /pocket/);
  Object.assign(open.pieces.find(p => p.id === 'black-P2'), {x: 7, y: 3});
  assert.match(commentarySituation(open, {index: 4}).text, /Defenders are close.*Space is tight/);
});

test('a fresh measured buildup leads the heartbeat, while stale or opposing samples cannot', () => {
  function buildup() {
    const h = clockHarness(); h.controller.confirmEnabled();
    for (const [turn, y] of [[1, 8], [2, 6], [3, 4]]) {
      const before = {phase: 'defendMove', attack: 'white', turn, ball: {x: 6, y: y + 1, carrierId: null}};
      h.controller.observe(before, {...before, phase: 'attackMove', turn: turn + 1, ball: {x: 6, y, carrierId: null}, lastAction: {type: 'skip'}});
    }
    h.advance(12000); return h;
  }
  const state = {phase: 'attackMove', attack: 'white', turn: 4, ball: {x: 6, y: 4, carrierId: null}};
  const fresh = buildup(); assert.equal(fresh.controller.tick(state), true);
  assert.match(fresh.spoken.at(-1).text, /advancing through the centre/);
  const stale = buildup(); stale.controller.tick({...state, turn: 20});
  assert.doesNotMatch(stale.spoken.at(-1).text, /advancing through/);
  const other = buildup(); other.controller.tick({...state, attack: 'black'});
  assert.doesNotMatch(other.spoken.at(-1).text, /Ivory are advancing/);
  const hidden = buildup(); assert.equal(hidden.controller.tick({...state, phase: 'keeperReact', pendingShot: {}}), false);
});

function audioHarness(options = {}) {
  const audios = [], statuses = [];
  class Audio {
    constructor(src) {this.src = src; this.paused = 0; this.loaded = 0; audios.push(this);}
    play() {return options.play?.(this);}
    pause() {this.paused++;}
    removeAttribute(name) {if (name === 'src') this.src = '';}
    load() {this.loaded++;}
  }
  const h = clockHarness({...options, AudioCtor: Audio, onPlaybackChanged: value => statuses.push(value)});
  return {...h, audios, statuses};
}
const recordedLine = (kind, key, id = key) => ({...line(kind, id), clipKey: key});

test('recorded commentary works without a speech engine or an English device voice', () => {
  const h = audioHarness({supported: false});
  assert.equal(h.controller.getState().playback, 'recorded');
  assert.equal(h.controller.getState().supported, true);
  assert.equal(h.controller.confirmEnabled(), true);
  assert.match(h.audios[0].src, /\/audio\/commentary\/enable\.mp3$/);
  assert.equal(h.audios[0].volume, 1); assert.equal(h.audios[0].preload, 'auto');
  assert.equal(h.captions.at(-1).text, COMMENTARY_CLIPS.enable.text);
  assert.equal(h.controller.getState().audioStatus, 'playing');
  h.audios[0].onended(); assert.equal(h.controller.getState().speaking, false);
  h.controller.setPlayback('device'); assert.equal(h.controller.getState().supported, false);
  assert.equal(h.controller.setPlayback('not-a-mode'), false);
  const emptyVoices = audioHarness({voices: []}); emptyVoices.controller.setPlayback('device');
  assert.equal(emptyVoices.controller.getState().supported, false);
});

test('recorded captions match the exact generic call, rather than a different score or named player', () => {
  const h = audioHarness(), {before, pending} = shot(), goal = E.skipMove(pending, {roll: 0});
  const attempt = h.controller.observe(before, pending);
  assert.ok(COMMENTARY_CLIPS[attempt.clipKey]);
  assert.equal(h.captions.at(-1).text, COMMENTARY_CLIPS[attempt.clipKey].text);
  assert.equal(h.spoken.length, 0);
  const deferred = h.controller.observe(pending, goal, {deferResult: true});
  assert.equal(deferred.clipKey, 'goal_opening'); assert.equal(h.audios.length, 1);
  h.controller.reveal(deferred);
  assert.equal(h.audios.length, 2); assert.equal(h.captions.at(-1).text, COMMENTARY_CLIPS.goal_opening.text);
  assert.equal(h.spoken.length, 0); assert.doesNotMatch(h.captions.at(-1).text, /Ivory|Obsidian|queen|\d/);
});

test('recorded shot outcomes and goal contexts map to factually matching clips', () => {
  const {before, pending, model} = shot({blocker: true});
  let start = 0;
  for (const [branch, key] of [['goalProbability', 'goal_opening'], ['keeperCornerProbability', 'save_corner'],
    ['caughtSaveProbability', 'save_hold'], ['missProbability', 'miss'], ['blockOutProbability', 'block_corner'],
    ['blockPossessionProbability', 'block_possession']]) {
    const after = E.skipMove(pending, {roll: start + model[branch] / 2});
    assert.equal(commentaryEvent(pending, after).clipKey, key); start += model[branch];
  }
  const scored = E.skipMove(pending, {roll: 0});
  for (const [oldScore, newScore, key] of [
    [{white: 0, black: 1}, {white: 1, black: 1}, 'goal_equalizer'],
    [{white: 1, black: 1}, {white: 2, black: 1}, 'goal_ahead'],
    [{white: 1, black: 0}, {white: 2, black: 0}, 'goal_extend'],
    [{white: 0, black: 2}, {white: 1, black: 2}, 'goal_pullback']])
    assert.equal(commentaryEvent({...pending, score: oldScore}, {...scored, score: newScore}).clipKey, key);
  pending.pendingShot.penalty = true;
  assert.equal(commentaryEvent(before, pending).clipKey, 'shot_penalty');
});

test('failed recorded playback falls back once using exactly the same words', async () => {
  const h = audioHarness({play: () => Promise.reject(Error('Playback blocked'))});
  h.controller.testVoice(); const staleError = h.audios[0].onerror;
  await Promise.resolve();
  assert.equal(h.spoken.length, 1); assert.equal(h.spoken[0].text, COMMENTARY_CLIPS.test.text);
  assert.equal(h.captions.at(-1).text, h.spoken[0].text);
  assert.equal(h.controller.getState().audioStatus, 'fallback');
  staleError(); assert.equal(h.spoken.length, 1);
});

test('late audio promises and callbacks cannot speak after OFF, reset or preemption', async () => {
  for (const stop of ['off', 'reset', 'goal']) {
    let reject;
    const h = audioHarness({play: () => new Promise((resolve, fail) => {reject = fail;})});
    h.controller.testVoice(); const old = h.audios[0], oldError = old.onerror, oldEnd = old.onended, oldReject = reject;
    if (stop === 'off') h.controller.setEnabled(false);
    else if (stop === 'reset') h.controller.reset();
    else h.controller.reveal(recordedLine('goal', 'goal_generic'));
    oldReject(Error('Late rejection')); oldError(); oldEnd(); await Promise.resolve();
    assert.equal(h.spoken.length, 0); assert.ok(old.paused > 0); assert.equal(old.src, '');
    if (stop === 'goal') assert.equal(h.captions.at(-1).text, COMMENTARY_CLIPS.goal_generic.text);
    else {assert.equal(h.controller.getState().speaking, false); assert.equal(h.timers.size, 0);}
  }
  let resolve;
  const h = audioHarness({play: () => new Promise(done => {resolve = done;})});
  h.controller.testVoice(); h.controller.setEnabled(false); const pauses = h.audios[0].paused;
  resolve(); await Promise.resolve(); assert.ok(h.audios[0].paused > pauses); assert.equal(h.spoken.length, 0);
});

test('audio priority, replay preservation and three-second-only restriction match device speech', () => {
  const h = audioHarness(); h.controller.reveal(recordedLine('trend', 'build_back'));
  const oldEnd = h.audios[0].onended;
  h.controller.reveal(recordedLine('attempt', 'shot_normal'));
  h.controller.reveal(recordedLine('outcome', 'save_hold'));
  h.controller.reveal(recordedLine('goal', 'goal_generic'));
  assert.equal(h.audios.length, 4); assert.ok(h.audios.slice(0, 3).every(audio => audio.paused > 0));
  oldEnd(); assert.equal(h.controller.getState().speaking, true);
  assert.equal(h.controller.reveal(recordedLine('trend', 'midfield')), false);
  h.controller.suspend({preserveGoal: true}); assert.equal(h.audios[3].paused, 0);
  h.controller.setPace(1200); assert.ok(h.audios[3].paused > 0); assert.equal(h.controller.getState().enabled, false);
  assert.equal(h.controller.setEnabled(true), false); assert.equal(h.timers.size, 0);
});

test('recorded heartbeat skips duplicate clip words and keeps twelve-second cadence', () => {
  const h = audioHarness(), state = fixture({origin: [6, 8]});
  h.controller.confirmEnabled(); h.audios.at(-1).onended();
  const calls = [];
  for (let index = 0; index < 10; index++) {
    h.advance(12000); assert.equal(h.controller.tick(state), true);
    calls.push(h.captions.at(-1).text); h.audios.at(-1).onended();
  }
  assert.equal(h.audios.length, 11);
  assert.ok(calls.every((text, index) => !index || text !== calls[index - 1]));
  assert.equal(h.controller.tick(state), false);
});

test('audio load timeout is fresh-only, mode switch stops it, and unsupported audio remains captioned', () => {
  const h = audioHarness({play: () => new Promise(() => {})});
  h.controller.testVoice(); h.advance(5000);
  assert.equal(h.spoken.length, 1); assert.equal(h.controller.getState().audioStatus, 'fallback');
  h.controller.setPlayback('device'); assert.equal(h.controller.getState().speaking, false);
  assert.equal(h.controller.getState().playback, 'device');
  const silent = audioHarness({supported: false, play: () => {throw Error('No audio');}});
  silent.controller.testVoice(); assert.equal(silent.controller.getState().audioStatus, 'unavailable');
  assert.equal(silent.captions.at(-1).text, COMMENTARY_CLIPS.test.text);
  silent.controller.setEnabled(false); assert.equal(silent.timers.size, 0);
});

test('the static bank credits the stock voice and every source URL stays within the app audio directory', () => {
  assert.equal(Object.keys(COMMENTARY_CLIPS).length, 55);
  assert.equal(COMMENTARY_RECORDING.voice, 'Tom'); assert.equal(COMMENTARY_RECORDING.provider, 'Runway');
  for (const [key, clip] of Object.entries(COMMENTARY_CLIPS)) {
    assert.equal(clip.key, key); assert.ok(clip.text.length > 15);
    assert.match(clip.src, new RegExp(`/audio/commentary/${key}\\.mp3$`));
    assert.ok(['calm', 'urgent', 'excited'].includes(clip.delivery));
  }
});
