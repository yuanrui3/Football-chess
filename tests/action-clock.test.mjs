import test from 'node:test';
import assert from 'node:assert/strict';
import {createMatchClock, restoreMatchClock, tickMatchClock, settleMatchClock, rewindMatchClock} from '../dist/match-clock.js';
import {createGame, actionTimeout, skipMove, applyKick, legalKicks} from '../dist/engine.js';

const state = (phase = 'attackMove', fields = {}) => ({phase, attack:'white', turn:1,
  score:{white:1, black:0}, restart:null, lastAction:{type:'move'}, ...fields});
const overtime = finalChance => ({remaining:0, actionRemaining:10, fullTimePending:true, finalChance});
const settle = (clock, before, next, options) => settleMatchClock(clock,before,next,options);

test('two seconds left cannot end the match while a decision is idle', () => {
  const start=createMatchClock({remaining:2}), zero=tickMatchClock(start,2);
  assert.deepEqual(zero,{remaining:0,actionRemaining:28,fullTimePending:true,finalChance:null});
  assert.equal(tickMatchClock(zero,27).actionRemaining,1);
  assert.equal(tickMatchClock(zero,28).actionRemaining,0);
  assert.equal(start.remaining,2);
});

test('an expired final decision protects the opponent indirect restart and live round', () => {
  let game=createGame({seed:42});game.score.white=1;
  let clock=tickMatchClock(createMatchClock({remaining:2}),30);
  let next=actionTimeout(game), result=settle(clock,game,next,{timedOut:true});
  assert.equal(result.finish,false);
  assert.deepEqual(result.clock.finalChance,{team:'black',phase:'restart'});
  for(let i=0;i<2;i++){
    game=next;clock=result.clock;next=skipMove(game);result=settle(clock,game,next);
    assert.equal(result.finish,false);
  }
  assert.equal(next.phase,'kick');
  game=next;clock=result.clock;
  const kick=legalKicks(game).find(k=>!k.goal&&!k.receiverId);
  assert.ok(kick,'indirect kick has an empty-space destination');
  next=applyKick(game,kick.x,kick.y,{roll:0});result=settle(clock,game,next);
  assert.equal(result.finish,false,'the indirect kick first pass is not the end');
  assert.deepEqual(result.clock.finalChance,{team:'black',phase:'live'});
  for(let i=0;i<2;i++){
    game=next;clock=result.clock;next=skipMove(game);result=settle(clock,game,next);
  }
  assert.equal(result.finish,true,'the subsequent loose-ball round is complete');
});

test('a timeout just before zero also preserves the awarded attack', () => {
  const before=state('kick'), after=state('attackMove',{attack:'black',restart:{type:'timeout',team:'black'},lastAction:{type:'timeout'}});
  let result=settle({remaining:0.1,actionRemaining:0,fullTimePending:false,finalChance:null},before,after,{timedOut:true});
  assert.equal(result.finish,false);
  const clock=tickMatchClock(result.clock,0.2);
  result=settle(clock,after,state('defendMove',{attack:'black',restart:after.restart}));
  assert.equal(result.finish,false);
  assert.equal(result.clock.finalChance.team,'black');
});

test('an ordinary final action settles full time', () => {
  const result=settle(overtime(null),state(),state('attackMove',{lastAction:{type:'move'}}));
  assert.equal(result.finish,true);
  assert.equal(result.clock.actionRemaining,30);
});

test('a final shot must resolve its goalkeeper decision', () => {
  let result=settle(overtime(null),state('kick'),state('keeperReact'));
  assert.equal(result.finish,false);
  result=settle(result.clock,state('keeperReact'),state('kickoff',{score:{white:2,black:0}}));
  assert.equal(result.finish,true);
});

test('a final backpass must finish its compulsory release and possible shot', () => {
  let result=settle(overtime(null),state('kick'),state('keeperRelease'));
  assert.equal(result.finish,false);
  result=settle(result.clock,state('keeperRelease'),state('keeperReact'));
  assert.equal(result.finish,false);
  result=settle(result.clock,state('keeperReact'),state('attackMove',{attack:'black'}));
  assert.equal(result.finish,true);
});

test('a declared pass-and-run finishes its run before the whistle', () => {
  let result=settle(overtime(null),state('kick'),state('passRun'));
  assert.equal(result.finish,false);
  result=settle(result.clock,state('passRun'),state('attackMove'));
  assert.equal(result.finish,true,'the run does not buy another attacking round');
});

test('a final live chance completes an optional run without granting another chance', () => {
  let result=settle(overtime({team:'white',phase:'live'}),state('kick'),state('passRun'));
  assert.equal(result.finish,false);
  assert.deepEqual(result.clock.finalChance,{team:'white',phase:'release'});
  result=settle(result.clock,state('passRun'),state('attackMove'));
  assert.equal(result.finish,true);
  assert.equal(result.clock.finalChance,null);
});

test('a protected restart can include a run before its following live attack', () => {
  let result=settle(overtime({team:'white',phase:'restart'}),state('kick',{restart:{type:'freeKick',team:'white'}}),state('passRun'));
  assert.equal(result.finish,false);
  assert.deepEqual(result.clock.finalChance,{team:'white',phase:'live'});
  result=settle(result.clock,state('passRun'),state('attackMove'));
  assert.equal(result.finish,false);
  assert.deepEqual(result.clock.finalChance,{team:'white',phase:'live'});
});

test('indirect restart backpass release does not use the following live round', () => {
  let result=settle(overtime({team:'white',phase:'restart'}),state('kick',{restart:{type:'timeout'}}),state('keeperRelease'));
  assert.equal(result.finish,false);
  assert.equal(result.clock.finalChance.phase,'restartRelease');
  result=settle(result.clock,state('keeperRelease'),state('attackMove'));
  assert.equal(result.finish,false);
  assert.equal(result.clock.finalChance.phase,'live');
});

test('final live round pass ends the opportunity, but a keeper release is completed', () => {
  const clock=overtime({team:'white',phase:'live'});
  assert.equal(settle(clock,state('kick'),state()).finish,true);
  let result=settle(clock,state('kick'),state('keeperRelease'));
  assert.equal(result.finish,false);
  assert.equal(result.clock.finalChance.phase,'release');
  result=settle(result.clock,state('keeperRelease'),state());
  assert.equal(result.finish,true);
});

test('shot outcome ends a final opportunity even when the save creates a corner', () => {
  let result=settle(overtime({team:'white',phase:'live'}),state('kick'),state('keeperReact'));
  assert.equal(result.finish,false);
  assert.equal(result.clock.finalChance.phase,'shot');
  result=settle(result.clock,state('keeperReact'),state('attackMove',{restart:{type:'corner',team:'white'}}));
  assert.equal(result.finish,true);
});

test('loss of possession or an offence ends the final chance', () => {
  const clock=overtime({team:'white',phase:'live'});
  assert.equal(settle(clock,state(),state('attackMove',{attack:'black'})).finish,true);
  assert.equal(settle(clock,state(),state('attackMove',{restart:{type:'offside',team:'black'}})).finish,true);
});

test('a completed opportunity before zero is not carried into unrelated later play', () => {
  const clock={remaining:1,actionRemaining:12,fullTimePending:false,finalChance:{team:'white',phase:'live'}};
  const result=settle(clock,state('kick'),state());
  assert.equal(result.finish,false);
  assert.equal(result.clock.finalChance,null);
  assert.equal(settle(tickMatchClock(result.clock,1),state(),state()).finish,true);
});

test('untimed matches neither consume deadline nor receive overtime state', () => {
  const clock=createMatchClock({remaining:0});
  assert.deepEqual(tickMatchClock(clock,100,{timed:false}),clock);
  const result=settle({...clock,fullTimePending:true},state(),state(),{timed:false});
  assert.equal(result.finish,false);
  assert.equal(result.clock.fullTimePending,false);
});

test('restoration preserves deadline zero and an awarded final attack', () => {
  const saved={remaining:0,actionRemaining:0,fullTimePending:true,finalChance:{team:'black',phase:'restart'}};
  assert.deepEqual(restoreMatchClock(saved),saved);
  assert.deepEqual(restoreMatchClock({remaining:17}),{remaining:17,actionRemaining:30,fullTimePending:false,finalChance:null});
  assert.equal(restoreMatchClock({remaining:0}).fullTimePending,true);
  assert.equal(restoreMatchClock({actionRemaining:900,finalChance:{team:'purple',phase:'live'}}).actionRemaining,30);
  assert.equal(restoreMatchClock({actionRemaining:-4}).actionRemaining,0);
});

test('Undo cannot restore fresh thinking time or extra match time', () => {
  const current={remaining:5,actionRemaining:7,fullTimePending:false,finalChance:null};
  const snapshot={remaining:30,actionRemaining:27,fullTimePending:false,finalChance:{team:'white',phase:'live'}};
  const result=rewindMatchClock(current,snapshot);
  assert.equal(result.remaining,5);
  assert.equal(result.actionRemaining,7);
  assert.deepEqual(result.finalChance,snapshot.finalChance);
  assert.equal(rewindMatchClock(current,null).actionRemaining,7);
  assert.equal(rewindMatchClock(overtime(null),snapshot).fullTimePending,true);
});

test('clock transforms preserve their inputs and tolerate invalid elapsed time', () => {
  const original=overtime({team:'white',phase:'live'}),snapshot=structuredClone(original);
  tickMatchClock(original,-100);tickMatchClock(original,NaN);
  settle(original,state('kick'),state());rewindMatchClock(original,{actionRemaining:1});
  assert.deepEqual(original,snapshot);
});
