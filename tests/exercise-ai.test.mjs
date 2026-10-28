import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import * as E from '../dist/engine.js';
import {EXERCISE_SEARCH_PROFILE,analyzeExerciseAction,chooseExerciseAction,exerciseKeeperChance,
  exerciseFinishes,findExerciseCapture,analyzeExerciseDefense} from '../dist/exercise-ai.js';

function diagram(rows,{carrierId='white-Q',phase='defendMove',budget}={}){
  const state=E.createGame({seed:1984,foulsEnabled:false});
  state.pieces=rows.map(([id,x,y])=>({id,team:id.split('-')[0],type:id.split('-')[1][0],x,y}));
  const carrier=state.pieces.find(p=>p.id===carrierId);
  Object.assign(state,{attack:carrier.team,phase,ball:{x:carrier.x,y:carrier.y,carrierId},
    positionBudget:budget||{normalUsed:false,pawnUsed:false,dribbleUsed:false},
    restart:null,pendingShot:null,offside:null,paceControl:null,releaseReason:null,looseBallKickOrigin:null,
    ballProgress:{team:carrier.team,anchorY:carrier.y,rounds:0,pendingRelease:false,excludeRelease:false}});
  return state;
}
const apply=(state,action,roll=0)=>action.type==='move'
  ?E.applyMove(state,action.pieceId,action.x,action.y,{freePawn:!!action.freePawn,roll})
  :action.type==='kick'?E.applyKick(state,action.x,action.y,{disguise:!!action.disguise,roll})
    :E.skipMove(state,{roll});
function mirror(state){
  const source=structuredClone(state),id=s=>s.replace(/^(white|black)/,t=>t==='white'?'black':'white');
  source.pieces=state.pieces.map(p=>({...p,id:id(p.id),team:p.team==='white'?'black':'white',x:13-p.x,y:16-p.y}));
  source.ball={x:13-state.ball.x,y:16-state.ball.y,carrierId:id(state.ball.carrierId)};
  source.attack=source.attack==='white'?'black':'white';
  source.ballProgress={...source.ballProgress,team:source.attack,anchorY:16-state.ballProgress.anchorY};
  return source;
}
const pawns=(y=4)=>diagram([['white-K',6,16],['black-K',7,0],['white-Q',6,6],['black-P1',5,y]]);
const gap=()=>diagram([
  ['white-K',6,16],['white-B1',9,7],['white-N2',2,9],['white-P1',5,8],
  ['black-K',4,0],['black-R1',12,0],['black-B1',9,4],['black-N1',10,4],
  ['black-P1',4,4],['black-P2',8,5],['black-P3',6,6],['white-R1',1,6],
  ['white-R2',1,3],['white-N1',9,1]],{carrierId:'white-N1'});

test('study search widens the beam without changing the default match profile',()=>{
  assert.ok(EXERCISE_SEARCH_PROFILE.nodeLimit>1400);
  assert.ok(EXERCISE_SEARCH_PROFILE.searchWidths.root>9);
  assert.ok(EXERCISE_SEARCH_PROFILE.searchWidths.position>3);
  const state=pawns(),options={maxDepth:2,nodeLimit:300,extensions:false,modelWeights:null,modelScale:80};
  assert.deepEqual(E.analyzeTacticalAction(state,options),E.analyzeTacticalAction(state,{...options,
    searchWidths:{root:9,position:3,kick:2,bonus:1}}));
});

test('direct and bonus-then-tackle guaranteed wins cannot be pruned, either colour',()=>{
  for(const initial of [pawns(5),mirror(pawns(5)),pawns(),mirror(pawns())]){
    const before=structuredClone(initial),report=analyzeExerciseAction(initial);
    assert.equal(report.reason,'guaranteed-possession-win');
    assert.ok(report.line.length>=1&&report.line.length<=2);
    let state=initial;for(const step of report.line)state=apply(state,step.action);
    const defender=E.currentTeam(initial);
    assert.equal(state.attack,defender);
    assert.equal(state.pieces.find(p=>p.id===state.ball.carrierId).team,defender);
    assert.deepEqual(initial,before);
    assert.equal(report.stats.nodes,0);
  }
});

test('capture safeguards respect spent budgets, fouls and knight evasion probabilities',()=>{
  for(const name of ['normalUsed','pawnUsed']){
    const state=pawns();state.positionBudget[name]=true;
    assert.equal(findExerciseCapture(state).plan,null,name);
  }
  const withFouls=pawns(5);withFouls.foulsEnabled=true;
  assert.equal(findExerciseCapture(withFouls).plan,null,'a foul-prone tackle is not guaranteed');
  const knight=diagram([['white-K',6,16],['black-K',12,6],['white-N1',5,1],['black-P1',4,2]],
    {carrierId:'white-N1',budget:{normalUsed:false,pawnUsed:true,dribbleUsed:false}});
  assert.equal(findExerciseCapture(knight).plan,null);
  const report=analyzeExerciseAction(knight);
  assert.equal(report.reason,'exhaustive-local-defence');
  const move=E.legalMoves(knight,report.action.pieceId).find(m=>m.x===report.action.x&&m.y===report.action.y);
  assert.equal(move.type,'tackle');assert.equal(move.tackleProbability,.5);
  const miss=apply(knight,report.action,.999999);
  assert.equal(miss.ball.carrierId,'white-N1');
  const missChance=E.studyPositionMetrics(miss,'black').bestShotXG;
  assert.ok(Math.abs(report.expectedOpponentShotXG-.5*missChance)<1e-9,'evasion is weighted rather than forced to a win');
});

test('the full normal/bonus reply finds the concrete keeper double-step omitted by the match beam',()=>{
  const initial=gap(),before=structuredClone(initial);
  let ordinary=initial;
  for(let i=0;E.currentTeam(ordinary)==='black'&&ordinary.attack==='white'&&i<4;i++)
    ordinary=apply(ordinary,E.chooseAIAction(ordinary,{difficulty:'tactical',modelWeights:null}));
  const ordinaryThreat=E.studyPositionMetrics(ordinary,'black').bestShotXG;
  const report=analyzeExerciseAction(initial);
  assert.equal(report.reason,'exhaustive-local-defence');assert.equal(report.stats.localComplete,true);
  assert.ok(report.stats.localStates>100&&report.stats.localStates<=12000);
  assert.ok(report.expectedOpponentShotXG<=.429788);
  assert.ok(report.expectedOpponentShotXG<ordinaryThreat-.005,'the expanded reply measurably reduces the strongest immediate finish');
  assert.deepEqual(report.line.map(s=>[s.action.pieceId,s.action.x,s.action.y,s.action.freePawn]),
    [['black-K',5,0,false],['black-K',6,0,true]]);
  assert.deepEqual(initial,before);
});

test('an interrupted local search returns a completed legal candidate and reports its limit honestly',()=>{
  const state=gap(),report=analyzeExerciseDefense(state,{stateLimit:3});
  assert.equal(report.stats.localComplete,false);assert.equal(report.reason,'bounded-local-defence');
  assert.ok(report.stats.localStates<=3);assert.ok(Number.isFinite(report.expectedOpponentShotXG));
  assert.doesNotThrow(()=>apply(state,report.action));
});

test('keeper responses minimize every legal declaration including the blind two-target mixture',()=>{
  const state=diagram([['white-K',6,16],['black-K',7,0],['white-Q',6,1],['black-R1',13,8]],{phase:'kick'});
  const options=exerciseFinishes(state);
  assert.ok(options.some(o=>o.action.disguise));
  for(const finish of options){
    const pending=apply(state,finish.action),report=analyzeExerciseAction(pending);
    const actual=report.action.type==='move'
      ?E.shotModel(pending,pending.pendingShot.x,pending.pendingShot.y,report.action).probability:E.shotModel(pending).probability;
    assert.ok(Math.abs(actual-exerciseKeeperChance(pending))<1e-10);
    assert.equal(report.reason,'exact-keeper-response');
  }
});

test('expanded search examines all immediate finishes and preserves the strongest aim when shooting',()=>{
  const state=diagram([['white-K',6,16],['black-K',8,0],['white-Q',6,1],['black-R1',13,8]],{phase:'kick'});
  const before=structuredClone(state),iterations=[];
  const report=analyzeExerciseAction(state,{nodeLimit:400,maxDepth:3,onIteration:r=>{iterations.push(r);r.action.x=99;}});
  assert.equal(report.action.type,'kick');
  const shot=exerciseFinishes(state).find(x=>JSON.stringify(x.action)===JSON.stringify(report.action));
  assert.ok(shot);assert.equal(shot.probability,exerciseFinishes(state)[0].probability);
  assert.ok(report.stats.examinedFinishes>=2);assert.ok(report.stats.nodes<=400);
  assert.ok(iterations.length>0);assert.notEqual(report.action.x,99);assert.deepEqual(state,before);
});

test('study decisions and reports do not consult the future chance seed',()=>{
  const state=gap(),baseline=analyzeExerciseAction(state);
  for(const randomState of [0,0xffffffff,912345])
    assert.deepEqual(analyzeExerciseAction({...structuredClone(state),randomState}),baseline);
  assert.deepEqual(chooseExerciseAction(pawns()),analyzeExerciseAction(pawns()).action);
});

test('the worker streams expanded results and retains the request identifier',async()=>{
  const source=(await readFile(new URL('../dist/exercise-ai-worker.js',import.meta.url),'utf8')).replace(/^import[^\n]*\n/,'');
  const messages=[],context=vm.createContext({self:{postMessage:m=>messages.push(m)},analyzeExerciseAction(state,{onIteration}){
    assert.equal(state.phase,'defendMove');const report={action:{type:'skip'},stats:{nodes:12,completedDepth:2},reason:'exhaustive-local-defence'};
    onIteration(report);return report;
  }});
  vm.runInContext(source,context);context.self.onmessage({data:{requestId:81,state:{phase:'defendMove'}}});
  assert.equal(messages.length,2);assert.equal(messages[0].requestId,81);
  assert.equal(messages[0].progress.stats.completedDepth,2);assert.equal(messages[1].action.type,'skip');
  assert.equal(messages[1].analysis.reason,'exhaustive-local-defence');
});
