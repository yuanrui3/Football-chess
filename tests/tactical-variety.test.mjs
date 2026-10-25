import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import * as E from '../dist/engine.js';

const opening=E.createGame({mode:'watch',seed:31029});
const reports=new Map();
const key=action=>JSON.stringify(action);
function report(seed){
 if(!reports.has(seed))reports.set(seed,E.analyzeTacticalAction(opening,{selectionSeed:seed,modelWeights:null}));
 return reports.get(seed);
}
function legal(state,action){
 if(action.type==='kick')assert.ok(E.legalKicks(state).some(k=>k.x===action.x&&k.y===action.y));
 else if(action.type==='move')assert.ok(E.legalMoves(state,action.pieceId,{freePawn:!!action.freePawn}).some(m=>m.x===action.x&&m.y===action.y));
 else if(action.type==='cornerTaker')assert.ok(E.cornerTakers(state).some(p=>p.id===action.pieceId));
 else assert.equal(action.type,'skip');
}
function diagram({phase='kick',positions={},carrier='white-Q'}={}){
 const s=E.createGame({seed:11,foulsEnabled:false});
 const assigned={'white-K':[6,16],'black-K':[12,7],...positions},used=new Set(Object.values(assigned).map(p=>p.join(',')));
 const parking=Array.from({length:E.BOARD_HEIGHT},(_,y)=>[[0,y],[13,y]]).flat();
 for(const piece of s.pieces){const q=assigned[piece.id]||parking.find(q=>!used.has(q.join(',')));[piece.x,piece.y]=q;used.add(q.join(','));}
 const owner=s.pieces.find(p=>p.id===carrier);
 Object.assign(s,{phase,attack:owner.team,ball:{x:owner.x,y:owner.y,carrierId:owner.id},restart:null,offside:null,pendingShot:null,
  positionBudget:{normalUsed:false,pawnUsed:true,dribbleUsed:false},ballProgress:{team:owner.team,anchorY:owner.y,rounds:0,pendingRelease:false,excludeRelease:false}});
 assert.ok(s.pieces.every(p=>E.canOccupySquare(p,p.x,p.y)));return s;
}

test('fresh Tactical selection seeds produce several legal real kickoff plans within a tiny verified score band',()=>{
 const before=structuredClone(opening),actions=[];
 for(let seed=0;seed<6;seed++){
  const result=report(seed);actions.push(key(result.action));legal(opening,result.action);
  assert.ok(result.variety.eligible>=2);
  assert.ok(result.variety.scoreLoss<=E.TACTICAL_VARIETY.scoreWindow+1e-8);
  assert.ok(result.stats.nodes<=1400);assert.ok(result.stats.completedDepth>=1);
  const selected=result.variety.choices.find(c=>key(c.action)===key(result.action));
  assert.equal(selected.exact,true,'a search bound must never masquerade as an equal alternative');
  assert.notEqual(selected.category,'shot','opening variety does not substitute an inferior speculative shot');
  assert.deepEqual(result.line[0].action,result.action);
 }
 assert.ok(new Set(actions).size>=3,'variety reaches the actual opening, rather than only synthetic ties');
 assert.deepEqual(opening,before,'selection never consumes match randomness or changes the board');
 assert.equal(E.TACTICAL_VARIETY.scoreWindow/2000,.004);
});

test('an explicit selection seed is reproducible and independent of future gameplay outcome values',()=>{
 const first=report(1);
 const again=E.analyzeTacticalAction({...structuredClone(opening),randomState:0xffffffff},{selectionSeed:1,modelWeights:null});
 assert.deepEqual(again,first);
 assert.deepEqual(E.chooseAIAction(opening,{difficulty:'tactical',selectionSeed:1,modelWeights:null}),first.action);
});

test('omitting variety keeps deterministic analysis and Casual ignores selection seeds',()=>{
 const deterministic=E.analyzeTacticalAction(opening,{modelWeights:null,maxDepth:1,nodeLimit:1400});
 assert.equal(deterministic.variety,undefined);
 const casual=E.chooseAIAction(opening,{difficulty:'casual'});
 for(const selectionSeed of [0,1,0xffffffff])assert.deepEqual(E.chooseAIAction(opening,{difficulty:'casual',selectionSeed}),casual);
});

test('a clear close-range finishing choice stays a shot rather than a random pass',()=>{
 const s=diagram({positions:{'white-Q':[6,3]}}),before=structuredClone(s);
 for(const selectionSeed of [1,2,3]){
  const a=E.analyzeTacticalAction(s,{selectionSeed,modelWeights:null,maxDepth:2,nodeLimit:700}).action;legal(s,a);
  assert.equal(a.type,'kick');assert.ok(E.legalKicks(s).some(k=>k.x===a.x&&k.y===a.y&&k.goal==='white'));
 }
 assert.deepEqual(s,before);
});

test('a clear possession-winning defensive reply does not turn into a quiet random move',()=>{
 const s=diagram({phase:'defendMove',positions:{'white-Q':[5,7],'black-R1':[5,3]}});
 for(const selectionSeed of [1,2,3]){
  const a=E.analyzeTacticalAction(s,{selectionSeed,modelWeights:null,maxDepth:2,nodeLimit:700}).action;legal(s,a);
  assert.equal(a.type,'move');assert.equal(a.pieceId,'black-R1');
  assert.ok(E.legalMoves(s,a.pieceId).some(m=>m.x===a.x&&m.y===a.y&&m.type==='tackle'&&m.tackleProbability===1),'different safe tackle landing squares still win possession');
 }
});

test('the common keeper reaction remains deterministic for every selection seed',()=>{
 const s=E.applyKick(diagram({positions:{'white-Q':[6,3]}}),6,-1);
 assert.equal(s.phase,'keeperReact');const expected=E.chooseAIAction(s,{difficulty:'casual'});
 for(const selectionSeed of [1,2,3])assert.deepEqual(E.analyzeTacticalAction(s,{selectionSeed,modelWeights:null}).action,expected);
});

test('worker and completed-iteration recovery forward the same selection seed as direct Tactical',async()=>{
 const worker=await readFile(new URL('../dist/ai-worker.js',import.meta.url),'utf8'),messages=[];
 const self={postMessage:message=>messages.push(message)};let captured;
 vm.runInNewContext(worker.replace(/^import[^\n]*\n/,''),{self,chooseAIAction:E.chooseAIAction,analyzeTacticalAction(state,options){captured=options.selectionSeed;return E.analyzeTacticalAction(state,options);}});
 self.onmessage({data:{requestId:7,state:opening,difficulty:'tactical',selectionSeed:1}});
 assert.equal(captured,1);assert.deepEqual(messages.at(-1).action,report(1).action);
 const progress=messages.filter(m=>m.progress);assert.ok(progress.length);
 assert.deepEqual(progress.at(-1).progress.action,messages.at(-1).action,'watchdog recovery keeps the varied completed answer');
 assert.ok(messages.every(m=>m.requestId===7));
});
