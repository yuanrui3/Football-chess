import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from './engine.mjs';
import * as Baseline from './baseline.mjs';
import * as Progress from './engine-progress.mjs';
import {fixture} from '/workspace/github/football-chess-pace/tests/helpers/shot-fixture.mjs';
for(const team of ['white','black']) {
 test(`${team}: close-shot search completes within1400 nodes after resolving every chance branch`,()=>{
  const state=fixture({team,type:'Q',origin:[6,1],keeper:[6,0]}),before=structuredClone(state);
  const r=E.analyzeTacticalAction(state,{maxDepth:8,nodeLimit:1400,modelWeights:null});
  assert.ok(r.stats.completedDepth>=1);assert.ok(r.stats.nodes<=1400);
  assert.equal(r.action.type,'kick');assert.ok(E.legalKicks(state).some(k=>k.goal===team&&k.x===r.action.x&&k.y===r.action.y));
  assert.deepEqual(state,before);
  for(const randomState of [0,0xffffffff])assert.deepEqual(E.analyzeTacticalAction({...state,randomState},{maxDepth:8,nodeLimit:1400,modelWeights:null}),r);
 });
 test(`${team}: settling a shot changes no nominal-depth values when extensions disabled`,()=>{
  const state=fixture({team,type:'R',origin:[5,3],keeper:[8,0]}),options={maxDepth:2,nodeLimit:20000,extensions:false,modelWeights:null};
  const a=Baseline.analyzeTacticalAction(state,options),b=E.analyzeTacticalAction(state,options);
  assert.equal(a.stats.completedDepth,2);assert.equal(b.stats.completedDepth,2);
  assert.equal(a.value,b.value);assert.deepEqual(a.action,b.action);assert.deepEqual(a.line,b.line);
 });
}
test('completed-iteration progress snapshots cannot mutate search state or change the final answer',()=>{
 const state=E.createGame({seed:31}),before=structuredClone(state),options={maxDepth:8,nodeLimit:600,modelWeights:null};
 const ordinary=Progress.analyzeTacticalAction(state,options),seen=[];
 const watched=Progress.analyzeTacticalAction(state,{...options,onIteration:snapshot=>{seen.push(snapshot.stats.completedDepth);snapshot.action.type='invalid';snapshot.stats.nodes=1e9;snapshot.line.length=0;}});
 assert.deepEqual(watched,ordinary);assert.deepEqual(state,before);
 assert.deepEqual(seen,Array.from({length:ordinary.stats.completedDepth},(_,i)=>i+1));assert.ok(seen.length>0);
});
