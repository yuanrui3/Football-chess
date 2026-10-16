import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as E from '../dist/engine.js';

// Inspect the real private chance enumerator without exposing a debug API in
// the playable engine. The appended exports do not change its implementation.
const source=await readFile(new URL('../dist/engine.js',import.meta.url),'utf8');
const internal=await import(`data:text/javascript;base64,${Buffer.from(source+'\nexport {tacticalSuccessors,tacticalStateKey};\n').toString('base64')}`);
const clone=structuredClone,other=t=>t==='white'?'black':'white';
function fixture({knight=false,enabled=true,inside=false}={}){
 const s=E.createGame({seed:4107,foulsEnabled:enabled}),carrier=knight?'white-N1':'white-Q',row=inside?2:4;
 const positions={'white-K':[7,15],'black-K':[7,0],[carrier]:[6,row],'black-R1':[6,row+2]},used=new Set(Object.values(positions).map(p=>p.join(',')));
 const parking=Array.from({length:E.BOARD_HEIGHT},(_,y)=>[[0,y],[E.BOARD_WIDTH-1,y]]).flat();
 for(const p of s.pieces){const q=positions[p.id]||parking.find(q=>!used.has(q.join(',')));Object.assign(p,{x:q[0],y:q[1]});used.add(q.join(','));}
 s.phase='defendMove';s.attack='white';s.ball={x:6,y:row,carrierId:carrier};s.ballProgress={team:'white',anchorY:row,rounds:0,pendingRelease:false,excludeRelease:false};
 const move=E.legalMoves(s,'black-R1').find(m=>m.type==='tackle');assert.ok(move);
 return {s,action:{type:'move',pieceId:'black-R1',x:move.x,y:move.y,freePawn:false}};
}
function assertMass(outcomes){assert.ok(Math.abs(outcomes.reduce((sum,o)=>sum+o.probability,0)-1)<1e-12);assert.ok(outcomes.every(o=>o.probability>0));}

test('real AI chance branches enumerate mutually exclusive foul/card and conditional knight outcomes',()=>{
 for(const knight of [false,true]){
  const {s,action}=fixture({knight}),before=clone(s),outcomes=internal.tacticalSuccessors(s,action);
  assert.deepEqual(outcomes.map(o=>o.probability),knight?[.02,.05,.03,.45,.45]:[.02,.05,.03,.9]);assertMass(outcomes);assert.deepEqual(s,before);
  assert.equal(outcomes[0].state.sentOff[0].id,'black-R1');assert.equal(outcomes[0].state.pieces.length,21);
  assert.equal(outcomes[1].state.discipline['black-R1'].yellowCards,1);assert.equal(outcomes[1].state.sentOff.length,0);
  for(const i of [0,1,2])assert.equal(outcomes[i].state.restart.type,'freeKick');
  assert.equal(outcomes[3].state.ball.carrierId,'black-R1');
  if(knight)assert.equal(outcomes[4].state.ball.carrierId,'white-N1');
  assert.ok(outcomes.every(o=>o.state.randomState===1),'planning discards the simulated PRNG after enumerating each branch');
  const nextSeed=(Math.imul(1664525,s.randomState)+1013904223)>>>0;
  for(const roll of knight?[.01,.045,.085,.325,.775]:[.01,.045,.085,.55]){
   const actual=E.applyMove(s,action.pieceId,action.x,action.y,{roll});
   assert.equal(actual.randomState,nextSeed,'each real outcome consumes exactly one combined referee draw');
  }
  assert.deepEqual(internal.tacticalSuccessors({...s,randomState:0},action),outcomes,'planning ignores the hidden future seed');
 }
});

test('second-yellow branches and all discipline-dependent futures have distinct cache keys',()=>{
 const {s,action}=fixture(),warned=clone(s);warned.discipline['black-R1']={yellowCards:1,redCard:false};
 const first=internal.tacticalSuccessors(s,action),second=internal.tacticalSuccessors(warned,action);
 assert.equal(first[1].state.pieces.length,22);assert.equal(second[1].state.pieces.length,21);assert.equal(second[1].state.sentOff[0].reason,'secondYellow');assertMass(second);
 const keys=[s,warned,{...s,foulsEnabled:false},{...s,winner:'white',finishReason:'forfeit'},
  {...s,sentOff:[{id:'black-P3',team:'black',type:'P',x:1,y:3,reason:'red',yellowCards:0}]},
  {...s,pieces:s.pieces.map(p=>p.id==='black-K'?{...p,originalType:'P',replacementKeeper:true}:p)}].map(internal.tacticalStateKey);
 assert.equal(new Set(keys).size,keys.length,'toggle, cards, departures, roles and terminal winner cannot share an analysis entry');
});

test('disabled Fouls keeps deterministic normal tackles and only the old knight chance pair',()=>{
 for(const knight of [false,true]){
  const {s,action}=fixture({knight,enabled:false}),outcomes=internal.tacticalSuccessors(s,action);assertMass(outcomes);
  assert.deepEqual(outcomes.map(o=>o.probability),knight?[.5,.5]:[1]);assert.ok(outcomes.every(o=>!o.state.sentOff.length));
  assert.ok(outcomes.every(o=>o.state.randomState===1),'planning remains independent of the live seed');
  const actual=E.applyMove(s,action.pieceId,action.x,action.y,{roll:.25});
  assert.equal(actual.randomState,knight?(Math.imul(1664525,s.randomState)+1013904223)>>>0:s.randomState);
 }
});

test('penalty chance trees use exactly the fixed80/20 real goal and catch/miss transitions',()=>{
 for(const outside of [false,true]){
  const {s,action}=fixture({inside:true});if(outside)Object.assign(s.pieces.find(p=>p.id==='black-K'),{x:3,y:3});
  const foul=E.applyMove(s,action.pieceId,action.x,action.y,{roll:.08}),ready=E.skipMove(E.skipMove(foul)),kick=E.legalKicks(ready)[0],pending=E.applyKick(ready,kick.x,kick.y),before=clone(pending);
  const outcomes=internal.tacticalSuccessors(pending,{type:'skip'});assertMass(outcomes);assert.deepEqual(outcomes.map(o=>o.probability),[.8,.2]);
  assert.equal(outcomes[0].state.score.white,1);assert.equal(outcomes[0].state.phase,'kickoff');
  if(outside){assert.equal(outcomes[1].state.restart.type,'goalKick');assert.equal(outcomes[1].state.attack,'black');}
  else{assert.equal(outcomes[1].state.ball.carrierId,'black-K');assert.equal(outcomes[1].state.phase,'attackMove');}
  assert.deepEqual(E.legalMoves(pending,'black-K'),[]);assert.deepEqual(pending,before);
 }
});

test('red-card forfeit branches are terminal and bounded Tactical analysis remains finite and pure',()=>{
 const {s,action}=fixture(),removed=['black-Q','black-B1','black-N2','black-P3'];
 s.sentOff=s.pieces.filter(p=>removed.includes(p.id)).map(p=>({...p,reason:'red',yellowCards:0}));
 for(const p of s.sentOff)s.discipline[p.id]={yellowCards:0,redCard:true};s.pieces=s.pieces.filter(p=>!removed.includes(p.id));
 const before=clone(s),outcomes=internal.tacticalSuccessors(s,action);assertMass(outcomes);
 assert.equal(outcomes[0].state.phase,'finished');assert.equal(outcomes[0].state.winner,'white');assert.equal(outcomes[0].state.finishReason,'forfeit');assert.equal(outcomes[0].state.pieces.filter(p=>p.team==='black').length,6);
 for(const useCache of [false,true]){
  const report=E.analyzeTacticalAction(s,{maxDepth:2,nodeLimit:400,useCache});assert.ok(Number.isFinite(report.value));assert.ok(report.action);assert.deepEqual(s,before);
 }
});

test('editing a warning in place never reuses a previous Tactical result or consumes the live seed',()=>{
 const {s}=fixture({knight:true}),options={maxDepth:2,nodeLimit:500};
 E.analyzeTacticalAction(s,options);s.discipline['black-R1']={yellowCards:1,redCard:false};const before=clone(s);
 const report=E.analyzeTacticalAction(s,options);assert.deepEqual(report,E.analyzeTacticalAction(clone(s),options));assert.deepEqual(s,before);
 assert.deepEqual(report,E.analyzeTacticalAction({...s,randomState:0xffffffff},options));
});

test('AI enumerates an opted-in pass run only on the successful controlled-pass branch',()=>{
 const {s}=fixture();s.phase='kick';
 Object.assign(s.pieces.find(p=>p.id==='white-Q'),{x:6,y:14});
 Object.assign(s.pieces.find(p=>p.id==='white-R1'),{x:6,y:3});
 Object.assign(s.pieces.find(p=>p.id==='black-R1'),{x:12,y:6});
 Object.assign(s.pieces.find(p=>p.id==='black-N1'),{x:11,y:1});
 s.ball={x:6,y:14,carrierId:'white-Q'};s.ballProgress={team:'white',anchorY:14,rounds:0,pendingRelease:false,excludeRelease:false};
 const before=clone(s),outcomes=internal.tacticalSuccessors(s,{type:'kick',x:6,y:3,passRun:true});assertMass(outcomes);
 assert.equal(outcomes[0].probability,.9);assert.equal(outcomes[0].state.phase,'passRun');assert.deepEqual(outcomes[0].state.passRun,{pieceId:'white-Q',team:'white'});
 assert.ok(outcomes.slice(1).every(o=>o.state.phase!=='passRun'),'inaccurate landings cannot grant a run even if somebody receives them');
 assert.deepEqual(s,before);assert.deepEqual(internal.tacticalSuccessors({...s,randomState:0}, {type:'kick',x:6,y:3,passRun:true}),outcomes);
});

test('both bots resolve a pass-run choice legally without peeking at the live seed',()=>{
 const {s}=fixture();s.phase='kick';Object.assign(s.pieces.find(p=>p.id==='white-R1'),{x:4,y:4});
 const run=E.applyKick(s,4,4,{roll:0,passRun:true}),before=clone(run);
 assert.equal(run.phase,'passRun');
 assert.notEqual(internal.tacticalStateKey(run),internal.tacticalStateKey({...run,passRun:{pieceId:'white-B1',team:'white'}}));
 for(const difficulty of ['casual','tactical']){
  const action=E.chooseAIAction(run,{difficulty});assert.ok(['skip','move'].includes(action.type));
  const next=action.type==='move'?E.applyMove(run,action.pieceId,action.x,action.y,{freePawn:action.freePawn}):E.skipMove(run);
  assert.equal(next.phase,'attackMove');assert.equal(next.positionBudget.normalUsed,action.type==='move');assert.equal(next.randomState,run.randomState);
  if(action.type==='move'){assert.equal(action.pieceId,'white-Q');assert.equal(!!action.freePawn,false);}
  assert.deepEqual(action,E.chooseAIAction({...run,randomState:0xffffffff},{difficulty}));assert.deepEqual(run,before);
 }
});
