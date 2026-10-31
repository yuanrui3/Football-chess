import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {EXERCISES} from '../dist/exercise-positions.js';
import {EXERCISE_SOLUTIONS} from '../dist/exercise-solutions.js';
import {EXERCISE_AI_VERSION} from '../dist/exercise-ai.js';
import {exerciseSolutionFrames,createExerciseSolutionPlayer} from '../dist/exercise-solution-player.js';
import {createExerciseSession,applyExerciseAction} from '../dist/exercise-session.js';
import {syncExerciseEvaluation} from '../dist/exercises-app.js';

test('every current exercise has a recorded example for this engine',()=>{
  assert.deepEqual(Object.keys(EXERCISE_SOLUTIONS.examples),EXERCISES.map(d=>d.id));
  const hash=createHash('sha256').update(readFileSync(new URL('../dist/engine.js',import.meta.url))).digest('hex');
  assert.equal(EXERCISE_SOLUTIONS.engineHash,hash,'Regenerate example replies after an engine change');
  const aiHash=createHash('sha256').update(readFileSync(new URL('../dist/exercise-ai.js',import.meta.url))).digest('hex');
  assert.equal(EXERCISE_SOLUTIONS.aiVersion,EXERCISE_AI_VERSION);
  assert.equal(EXERCISE_SOLUTIONS.aiHash,aiHash,'Regenerate example replies after an exercise opponent change');
});
for(const definition of EXERCISES)test(`${definition.id}: every recorded action is legal and the example meets the actual objective`,()=>{
  const original=structuredClone(EXERCISE_SOLUTIONS),frames=exerciseSolutionFrames(definition,EXERCISE_SOLUTIONS);
  assert.equal(frames.length,original.examples[definition.id].actions.length+1);
  assert.equal(frames[0].session.actionCount,0);assert.equal(frames[0].lastAction,null);
  assert.equal(frames.at(-1).session.status,'solved');assert.ok(frames.at(-1).session.roundsUsed<=definition.roundLimit);
  for(const [i,frame] of frames.entries()){
    assert.equal(frame.solution,true);assert.equal(frame.session.actionCount,i);
    assert.equal(frame.thinking,false);assert.equal(frame.canUndo,false);
    if(i){assert.equal(frame.lastAction.before,frames[i-1].session.game);assert.equal(frame.lastAction.after,frame.session.game);}
  }
  assert.deepEqual(EXERCISE_SOLUTIONS,original,'playback does not rewrite the recorded line');
});
test('demonstrating exercise 30 uses a separate session and preserves an in-progress attempt',()=>{
  const definition=EXERCISES[29];let attempt=createExerciseSession(definition,{seed:1991});
  attempt=applyExerciseAction(attempt,definition.exampleActions[0]);const before=structuredClone(attempt);
  const frames=exerciseSolutionFrames(definition,EXERCISE_SOLUTIONS);
  assert.equal(frames[0].session.game.ball.carrierId,'white-K');
  assert.deepEqual(frames[1].lastAction.action,{type:'kick',x:6,y:9});
  assert.equal(frames[1].session.game.ball.carrierId,'white-R1');
  assert.deepEqual(attempt,before);assert.notEqual(frames[0].session,attempt);
});
test('outdated, incomplete and illegal examples are rejected before presentation',()=>{
  const definition=EXERCISES[29],id=definition.id;
  for(const change of [data=>data.rulesVersion--,data=>data.aiVersion--,data=>data.examples[id].revision--,data=>data.examples[id].actions.pop(),data=>data.examples[id].actions[0]={type:'move',pieceId:'missing',x:0,y:0}]){
    const data=structuredClone(EXERCISE_SOLUTIONS);change(data);assert.throws(()=>exerciseSolutionFrames(definition,data));
  }
});
function harness(){
  let serial=0;const timers=new Map(),changes=[];
  const player=createExerciseSolutionPlayer({setTimer(fn){const id=++serial;timers.set(id,fn);return id;},clearTimer:id=>timers.delete(id),onChange:s=>changes.push(s)});
  return {player,timers,changes,tick(){assert.equal(timers.size,1);const [id,fn]=timers.entries().next().value;timers.delete(id);fn();}};
}
const sample=()=>exerciseSolutionFrames(EXERCISES[29],EXERCISE_SOLUTIONS);
test('autoplay shows both teams, stops on the result and plays again from the initial board',()=>{
  const h=harness(),frames=sample();h.player.load(frames);
  for(let i=1;i<frames.length;i++){h.tick();assert.equal(h.player.getState().index,i);}
  assert.equal(h.player.getState().playing,false);assert.equal(h.timers.size,0);
  assert.ok(h.changes.some(s=>s.frame.lastAction?.actor==='black'));
  h.player.play();assert.equal(h.player.getState().index,0);assert.equal(h.timers.size,1);
});
test('pause and single steps cannot be advanced by stale timer callbacks',()=>{
  const h=harness();h.player.load(sample());const stale=[...h.timers.values()][0];
  h.player.pause();stale();assert.equal(h.player.getState().index,0);
  h.player.next();assert.equal(h.player.getState().index,1);assert.equal(h.player.getState().playing,false);assert.equal(h.timers.size,0);
  h.player.previous();assert.equal(h.player.getState().index,0);h.player.previous();assert.equal(h.player.getState().index,0);
  h.player.seek(999);assert.equal(h.player.getState().index,h.player.getState().total);
});
test('exit, a different exercise and restart reject callbacks from the old playback',()=>{
  for(const action of ['stop','load','restart']){
    const h=harness();h.player.load(sample());h.tick();const stale=[...h.timers.values()][0];
    if(action==='load')h.player.load(exerciseSolutionFrames(EXERCISES[0],EXERCISE_SOLUTIONS));else h.player[action]();
    const state=h.player.getState();stale();assert.deepEqual(h.player.getState(),state);
    assert.equal(state.index,0);assert.equal(state.active,action!=='stop');
  }
});
test('demonstration positions suspend optional evaluation without changing its live board',()=>{
  const calls=[],evaluation={suspend:()=>calls.push('suspend'),update:()=>calls.push('update'),resume:()=>calls.push('resume')};
  syncExerciseEvaluation(evaluation,sample()[1]);assert.deepEqual(calls,['suspend']);
});
