import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import * as Frozen from '../frozen/dist/engine.js';
import * as Candidate from './engine.mjs';
const clone=structuredClone;
function legal(E,state,a){
  if(a.type==='move')assert.ok(E.legalMoves(state,a.pieceId,{freePawn:!!a.freePawn}).some(m=>m.x===a.x&&m.y===a.y));
  else if(a.type==='kick')assert.ok(E.legalKicks(state).some(k=>k.x===a.x&&k.y===a.y));
  else if(a.type==='cornerTaker')assert.ok(E.cornerTakers(state).some(p=>p.id===a.pieceId));
  else{assert.equal(a.type,'skip');assert.ok(['attackMove','defendMove','passRun','keeperReact'].includes(state.phase)||!state.ball.carrierId);}
}
function apply(E,s,a){legal(E,s,a);return a.type==='move'?E.applyMove(s,a.pieceId,a.x,a.y,{freePawn:!!a.freePawn}):a.type==='kick'?E.applyKick(s,a.x,a.y,{passRun:!!a.passRun,disguise:!!a.disguise}):a.type==='cornerTaker'?E.selectCornerTaker(s,a.pieceId):E.skipMove(s);}
const report={baseSha256:createHash('sha256').update(await readFile(new URL('../frozen/dist/engine.js',import.meta.url))).digest('hex'),candidateSha256:createHash('sha256').update(await readFile(new URL('./engine.mjs',import.meta.url))).digest('hex'),tacticalStates:0,states:0,legalMoveQueries:0,kickQueries:0,normalizations:0,casualExactMatches:0,fullTransitionMatches:0,callbackSnapshotDepths:[],errors:[]};
let s=Frozen.createGame({seed:31,foulsEnabled:true}),firstState=clone(s),firstReport;
for(let i=0;i<16;i++){
 const before=clone(s),options={nodeLimit:1400,maxDepth:8,modelWeights:null};
 const expected=Frozen.analyzeTacticalAction(s,options),actual=Candidate.analyzeTacticalAction(s,options);
 assert.deepEqual(actual,expected,`natural Tactical decision${i}: full action/value/stats/PV equivalence`);assert.deepEqual(s,before);
 assert.ok(actual.stats.nodes<=1400);legal(Candidate,s,actual.action);
 if(!i)firstReport=clone(expected);
 const a=apply(Frozen,s,expected.action),b=apply(Candidate,s,actual.action);assert.deepEqual(a,b);s=a;report.tacticalStates++;
}
const watched=Candidate.analyzeTacticalAction(firstState,{nodeLimit:1400,maxDepth:8,modelWeights:null,onIteration:snapshot=>{
 report.callbackSnapshotDepths.push(snapshot.stats.completedDepth);legal(Candidate,firstState,snapshot.action);assert.equal(snapshot.stats.aborted,false);
 snapshot.action.type='consumer-mutated';snapshot.stats.nodes=1e9;if(snapshot.line[0])snapshot.line[0].action.type='consumer-mutated-line';snapshot.line.length=0;
}});
assert.deepEqual(watched,firstReport,'callback consumer cannot alter search action/value/stats/PV');assert.deepEqual(firstState,Frozen.createGame({seed:31,foulsEnabled:true}));
assert.deepEqual(report.callbackSnapshotDepths,Array.from({length:watched.stats.completedDepth},(_,i)=>i+1));assert.ok(report.callbackSnapshotDepths.length>0);
for(const foulsEnabled of [false,true])for(const kickoff of ['white','black']){
 let state=Frozen.createGame({seed:17,kickoff,foulsEnabled});
 assert.deepEqual(Candidate.createGame({seed:17,kickoff,foulsEnabled}),state);
 for(let i=0;i<160;i++){
  const before=clone(state);
  assert.deepEqual(Candidate.normalizeGame(state),Frozen.normalizeGame(state));report.normalizations++;
  for(const piece of state.pieces)for(const freePawn of [false,true]){assert.deepEqual(Candidate.legalMoves(state,piece.id,{freePawn}),Frozen.legalMoves(state,piece.id,{freePawn}));report.legalMoveQueries++;}
  assert.deepEqual(Candidate.legalKicks(state),Frozen.legalKicks(state));report.kickQueries++;
  for(const name of ['positionActions','offsideFlaggedIds','cornerTakers','disguisedShotTargets','progressInfo','paceInfo'])assert.deepEqual(Candidate[name](state),Frozen[name](state),`${name} matches`);
  for(const team of ['white','black'])assert.deepEqual(Candidate.offsideInfo(state,team),Frozen.offsideInfo(state,team));
  if(state.pendingShot)assert.deepEqual(Candidate.shotModel(state),Frozen.shotModel(state));
  const action=Frozen.chooseAIAction(state,{difficulty:'casual',modelWeights:null});
  assert.deepEqual(Candidate.chooseAIAction(state,{difficulty:'casual',modelWeights:null}),action);report.casualExactMatches++;
  const expected=apply(Frozen,state,action),actual=apply(Candidate,state,action);assert.deepEqual(actual,expected);report.fullTransitionMatches++;
  assert.deepEqual(state,before);state=expected;report.states++;
 }
}
report.passed=true;
await writeFile(new URL('./equivalence-report.json',import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
