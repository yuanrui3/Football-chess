import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as E from '../dist/engine.js';
import {createExerciseController,readExerciseProgress,saveExerciseProgress,recordExerciseSolved,EXERCISE_PROGRESS_KEY,exerciseMoveMode,exerciseStartingPiece,syncExerciseEvaluation,exerciseEvaluationDisplay,filterExercises,selectFilteredExercise,nextFilteredExercise,exerciseDifficulty,exercisePlanText,syncExerciseFilters} from '../dist/exercises-app.js';

const def={id:'fixture',title:'A finishing study',playerTeam:'white',roundLimit:3};
function harness({worker=true,botFirst=false,solve=false,deterministic=false}={}){
  let time=0,timerSerial=0;
  const timers=new Map(),workers=[],states=[],errors=[],fallbacks=[],transitions=[];
  const makeSession=definition=>({definition,definitionId:definition.id,playerTeam:'white',status:'active',roundsUsed:0,roundLimit:3,
    game:{phase:botFirst?'defendMove':'attackMove',attack:'white',score:{white:0,black:0},pieces:[],ball:{x:6,y:8,carrierId:'white-Q'}}});
  const applyAction=(session,action)=>{
    transitions.push({session,action});
    if(action.type==='illegal')throw Error('That action is not legal.');
    const next=structuredClone(session);
    if(action.type==='human'){next.game.phase='defendMove';next.game.ball.x++;}
    else{next.game.phase='kick';next.game.lastAction={type:'skip',team:'black'};if(solve)next.status='solved';}
    return next;
  };
  class FakeWorker{
    constructor(){this.terminated=false;workers.push(this);}
    postMessage(data){this.request=data;}
    terminate(){this.terminated=true;}
    respond(data={action:{type:'bot'}}){this.onmessage?.({data:{requestId:this.request.requestId,...data}});}
  }
  const controller=createExerciseController({definition:def,makeSession,applyAction,
    workerFactory:worker?()=>new FakeWorker():null,now:()=>time,selectionSeed:deterministic?undefined:()=>123,delayMs:1000,watchdogMs:5000,
    chooseTactical:(state,options)=>{fallbacks.push({state,options});return {type:'bot'};},
    setTimer(fn,delay){const id=++timerSerial;timers.set(id,{at:time+delay,fn});return id;},clearTimer:id=>timers.delete(id),
    onChange:state=>states.push(state),onError:text=>errors.push(text)});
  function advance(ms){const end=time+ms;for(;;){const pending=[...timers].filter(([,t])=>t.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!pending)break;timers.delete(pending[0]);time=pending[1].at;pending[1].fn();}time=end;}
  return {controller,workers,states,errors,fallbacks,transitions,timers,advance};
}

test('opening a study does not start a bot or allow a move before Play exercise',()=>{
  const h=harness({botFirst:true});assert.equal(h.workers.length,0);assert.equal(h.controller.getState().started,false);
  assert.equal(h.controller.play({type:'human'}),false);assert.equal(h.transitions.length,0);
  h.controller.start();assert.equal(h.workers.length,1);assert.equal(h.workers[0].request.difficulty,'tactical');assert.equal(h.workers[0].request.selectionSeed,123);h.controller.destroy();
});

test('an early Tactical answer waits for the visible action pace and then returns control',()=>{
  const h=harness();h.controller.start();const before=h.controller.getState().session;
  assert.equal(h.controller.play({type:'human'}),true);const worker=h.workers[0];worker.respond();
  assert.equal(h.controller.getState().thinking,true);assert.equal(h.transitions.length,1);
  h.advance(999);assert.equal(h.transitions.length,1);h.advance(1);
  assert.equal(h.transitions.length,2);assert.equal(h.controller.getState().thinking,false);assert.equal(h.controller.getState().session.game.phase,'kick');
  assert.equal(before.game.ball.x,6,'the previous decision snapshot remains unchanged');h.controller.destroy();
});

for(const action of['load','retry','undo'])test(`${action} cancels a worker and its delayed commit without reviving it`,()=>{
  const h=harness();h.controller.start();h.controller.play({type:'human'});const worker=h.workers[0];worker.respond();
  if(action==='load')h.controller.load({...def,id:'another'});else h.controller[action]();
  const snapshot=structuredClone(h.controller.getState().session);assert.equal(worker.terminated,true);
  worker.respond();h.advance(6000);assert.deepEqual(h.controller.getState().session,snapshot);assert.equal(h.transitions.length,1);
  assert.equal(h.controller.getState().thinking,false);h.controller.destroy();
});

test('a wrong request ID cannot commit an action and human moves cannot race the bot',()=>{
  const h=harness();h.controller.start();h.controller.play({type:'human'});
  assert.equal(h.controller.play({type:'human'}),false);h.workers[0].respond({requestId:-1,action:{type:'bot'}});h.advance(1100);
  assert.equal(h.transitions.length,1);h.workers[0].respond();h.advance(0);assert.equal(h.transitions.length,2);h.controller.destroy();
});

test('worker failure uses only Tactical fallback with learned weights explicitly disabled',()=>{
  const h=harness();h.controller.start();h.controller.play({type:'human'});h.workers[0].onerror();h.advance(1000);
  assert.equal(h.fallbacks.length,1);assert.deepEqual(h.fallbacks[0].options,{difficulty:'tactical',modelWeights:null,selectionSeed:123});
  assert.equal(h.controller.getState().session.game.phase,'kick');h.controller.destroy();
});

test('without a worker the same Tactical policy is deferred and played at the chosen pace',()=>{
  const h=harness({worker:false});h.controller.start();h.controller.play({type:'human'});
  assert.equal(h.fallbacks.length,0);h.advance(0);assert.equal(h.fallbacks.length,1);assert.equal(h.transitions.length,1);
  h.advance(1000);assert.equal(h.transitions.length,2);h.controller.destroy();
});

test('watchdog recovery can use a completed Tactical iteration without running another policy',()=>{
  const h=harness();h.controller.start();h.controller.play({type:'human'});
  h.workers[0].respond({progress:{depth:3,action:{type:'bot'}}});h.advance(5000);
  assert.equal(h.fallbacks.length,0);assert.equal(h.transitions.length,2);assert.equal(h.controller.getState().thinking,false);h.controller.destroy();
});

test('an exercise result stops further bot scheduling and late worker answers',()=>{
  const h=harness({solve:true});h.controller.start();h.controller.play({type:'human'});const worker=h.workers[0];worker.respond();h.advance(1000);
  assert.equal(h.controller.getState().session.status,'solved');assert.equal(h.controller.play({type:'human'}),false);worker.respond();h.advance(6000);
  assert.equal(h.transitions.length,2);assert.equal(h.workers.length,1);h.controller.destroy();
});

test('illegal actions leave session and undo history intact',()=>{
  const h=harness();h.controller.start();const before=structuredClone(h.controller.getState().session);
  assert.equal(h.controller.play({type:'illegal'}),false);assert.deepEqual(h.controller.getState().session,before);assert.equal(h.controller.getState().canUndo,false);
  assert.deepEqual(h.errors,['That action is not legal.']);h.controller.destroy();
});

test('destroy invalidates a pending result and clears presentation timers',()=>{
  const h=harness();h.controller.start();h.controller.play({type:'human'});h.workers[0].respond();h.controller.destroy();h.advance(10000);
  assert.equal(h.transitions.length,1);assert.equal(h.timers.size,0);assert.equal(h.controller.start(),false);
});

test('exercise progress uses a distinct key and never replaces the saved full match',()=>{
  const data=new Map([['football-chess-match-v4','valuable saved match']]);
  const storage={getItem:key=>data.get(key)||null,setItem:(key,value)=>data.set(key,value)};
  const catalog=[def,{...def,id:'second'}];let progress=readExerciseProgress(storage,catalog);
  assert.deepEqual(progress,{version:1,solved:{},lastId:null});progress=recordExerciseSolved(progress,'fixture',catalog);assert.ok(saveExerciseProgress(storage,progress));
  assert.equal(data.get('football-chess-match-v4'),'valuable saved match');assert.equal(data.size,2);assert.equal(EXERCISE_PROGRESS_KEY,'football-chess-exercises-v1');
  assert.deepEqual(readExerciseProgress(storage,catalog),progress);assert.equal(recordExerciseSolved(progress,'unknown',catalog).solved.unknown,undefined);
});

test('corrupt, inaccessible or stale progress does not block training',()=>{
  assert.deepEqual(readExerciseProgress({getItem(){throw Error('denied');}},[def]),{version:1,solved:{},lastId:null});
  assert.deepEqual(readExerciseProgress({getItem:()=>'{bad'},[def]),{version:1,solved:{},lastId:null});
  const clean=readExerciseProgress({getItem:()=>JSON.stringify({solved:{fixture:true,deleted:true,second:'yes'},lastId:'deleted'})},[def]);
  assert.deepEqual(clean,{version:1,solved:{fixture:true},lastId:null});assert.equal(saveExerciseProgress({setItem(){throw Error('full');}},clean),false);
});

test('the exercise page makes objectives, alternatives, study rounds and optional analysis explicit',async()=>{
  const html=await readFile(new URL('../dist/exercises.html',import.meta.url),'utf8');
  assert.match(html,/Several plans can work/);assert.match(html,/against the best keeper reply/);assert.match(html,/not by a lucky goal or an unlucky save/);
  for(const id of['themeFilter','difficultyFilter','tierCounts','filteredCount','difficultyLabel','planLength','exerciseBoard','playBtn','hintBtn','retryBtn','nextBtn','undoBtn','analysisEnabled'])assert.ok(html.includes(`id="${id}"`));
  assert.match(html,/Current-round estimate/);assert.match(html,/optional help/);assert.doesNotMatch(html,/id="analysisEnabled"[^>]*checked/);
  assert.match(html,/12 Easy · 12 Medium · 12 Tough/);assert.match(html,/0 \/ 36/);
  assert.match(html,/Ending positioning and the bot’s replies do not count/);assert.match(html,/Plan lengths are a guide/);
});

const levelCatalog=[
  {id:'old-easy',theme:'one-on-one',roundLimit:3},
  {id:'medium-cross',difficulty:'medium',theme:'box-entry',planSteps:3,roundLimit:4},
  {id:'medium-finish',difficulty:'medium',theme:'one-on-one',planSteps:2,roundLimit:3},
  {id:'tough-cross',difficulty:'tough',theme:'box-entry',planSteps:4,roundLimit:4},
  {id:'tough-cross-two',difficulty:'tough',theme:'box-entry',planSteps:3,roundLimit:4},
];
test('difficulty and theme filters intersect while older studies default to Easy',()=>{
  assert.equal(exerciseDifficulty(levelCatalog[0]),'easy');
  assert.deepEqual(filterExercises(levelCatalog,{difficulty:'easy'}).map(d=>d.id),['old-easy']);
  assert.deepEqual(filterExercises(levelCatalog,{difficulty:'medium',theme:'box-entry'}).map(d=>d.id),['medium-cross']);
  assert.equal(filterExercises(levelCatalog,{theme:'box-entry'}).length,3);
  assert.deepEqual(filterExercises(levelCatalog),levelCatalog);
});
test('changing level chooses a matching study and Next stays inside both filters',()=>{
  const filters={difficulty:'tough',theme:'box-entry'};
  assert.equal(selectFilteredExercise(levelCatalog,filters,'medium-cross').id,'tough-cross');
  assert.equal(selectFilteredExercise(levelCatalog,filters,'tough-cross-two').id,'tough-cross-two');
  assert.equal(nextFilteredExercise(levelCatalog,filters,'tough-cross').id,'tough-cross-two');
  assert.equal(nextFilteredExercise(levelCatalog,filters,'tough-cross-two').id,'tough-cross');
  assert.equal(nextFilteredExercise(levelCatalog,filters,'old-easy').id,'tough-cross');
  const empty={difficulty:'easy',theme:'defence'};
  assert.equal(selectFilteredExercise(levelCatalog,empty,'old-easy'),null);assert.equal(nextFilteredExercise(levelCatalog,empty,'old-easy'),null);
});
test('an empty filter suspends the hidden study and cancels an in-flight Tactical reply',()=>{
  const h=harness({botFirst:true});h.controller.start();const stale=h.workers[0],snapshot=structuredClone(h.controller.getState().session),loads=[];
  assert.equal(syncExerciseFilters(h.controller,[def],{difficulty:'medium'},d=>loads.push(d)),null);
  assert.equal(h.controller.getState().suspended,true);assert.equal(stale.terminated,true);
  stale.respond();h.advance(6000);assert.deepEqual(h.controller.getState().session,snapshot);assert.equal(h.transitions.length,0);assert.deepEqual(loads,[]);
  assert.equal(h.controller.play({type:'human'}),false,'the off-list position cannot change progress');
  assert.equal(syncExerciseFilters(h.controller,[def],{},d=>loads.push(d)).id,def.id);
  assert.equal(h.controller.getState().suspended,false);assert.equal(h.workers.length,2);assert.deepEqual(loads,[],'the matching study resumes without resetting the decision');
  h.controller.destroy();
});
test('a matching filter loads a visible study but does not resume a background page',()=>{
  const h=harness(),other={...def,id:'medium',difficulty:'medium'},loads=[];
  h.controller.suspend();
  const selected=syncExerciseFilters(h.controller,[def,other],{difficulty:'medium'},d=>{loads.push(d.id);h.controller.load(d);},{allowResume:false});
  assert.equal(selected.id,'medium');assert.deepEqual(loads,['medium']);assert.equal(h.controller.getState().session.definitionId,'medium');
  assert.equal(h.controller.getState().suspended,true);assert.equal(h.workers.length,0);h.controller.destroy();
});
test('expected plan length is distinct from the possession-round allowance',()=>{
  assert.equal(exercisePlanText(levelCatalog[0]),'Core tactical idea');
  assert.equal(exercisePlanText(levelCatalog[1]),'Typical plan: 3 steps');
  assert.equal(levelCatalog[1].roundLimit,4);
});
test('adding difficulty tiers preserves solved Easy IDs and the previous selected study',()=>{
  const stored={version:1,solved:{'old-easy':true},lastId:'old-easy'};
  const progress=readExerciseProgress({getItem:key=>key===EXERCISE_PROGRESS_KEY?JSON.stringify(stored):null},levelCatalog);
  assert.deepEqual(progress,stored);
  assert.equal(selectFilteredExercise(levelCatalog,{difficulty:'all',theme:'all'},progress.lastId).id,'old-easy');
  const next=recordExerciseSolved(progress,'medium-cross',levelCatalog);
  assert.deepEqual(next.solved,{'old-easy':true,'medium-cross':true});
  assert.deepEqual(progress,stored,'extending progress does not mutate old records');
});


test('exercise Tactical replies are deterministic by default, preserving canonical training lines',()=>{
  const h=harness({botFirst:true,deterministic:true});h.controller.start();assert.equal(h.workers[0].request.selectionSeed,null);h.controller.destroy();
});

test('page suspension cancels work and can resume safely after a BFCache return',()=>{
  const h=harness();h.controller.start();h.controller.play({type:'human'});const stale=h.workers[0];
  h.controller.suspend();assert.equal(h.controller.getState().suspended,true);assert.equal(stale.terminated,true);stale.respond();h.advance(6000);assert.equal(h.transitions.length,1);
  assert.equal(h.controller.play({type:'human'}),false);h.controller.resume();assert.equal(h.workers.length,2);assert.equal(h.controller.getState().thinking,true);
  h.workers[1].respond();h.advance(1000);assert.equal(h.transitions.length,2);assert.equal(h.controller.getState().suspended,false);h.controller.destroy();
});

test('bonus mode cannot trap the passer in an optional normal run',()=>{
  let game=E.createGame({seed:19,foulsEnabled:false,mode:'local'});
  const spots={'white-K':[6,16],'black-K':[7,0],'black-R1':[13,0],'white-Q':[3,7],'white-R1':[6,7],'white-P1':[0,10]};
  game.pieces=game.pieces.filter(p=>spots[p.id]).map(p=>({...p,x:spots[p.id][0],y:spots[p.id][1]}));
  Object.assign(game,{phase:'attackMove',attack:'white',ball:{x:3,y:7,carrierId:'white-Q'},positionBudget:{normalUsed:false,pawnUsed:false,dribbleUsed:false},restart:null,offside:null,passRun:null,pendingShot:null});
  game=E.applyMove(game,'white-P1',0,9,{freePawn:true});game=E.skipMove(game);game=E.skipMove(game);game=E.applyKick(game,6,7,{passRun:true});
  assert.equal(game.phase,'passRun');assert.equal(E.legalMoves(game,'white-Q',{freePawn:true}).length,0);
  assert.equal(exerciseMoveMode(game,'bonus'),'offball');assert.ok(E.legalMoves(game,'white-Q',{freePawn:exerciseMoveMode(game,'bonus')==='bonus'}).length>0);
});

test('terminal exercise reviews freeze analysis without submitting a synthetic second keeper reaction',()=>{
  const calls=[],evaluation={suspend:()=>calls.push(['suspend']),resume:()=>calls.push(['resume']),update:game=>calls.push(['update',game])};
  const game={phase:'kick'},reviewGame={phase:'keeperReact',keeperAlreadyReacted:true};
  const view={session:{status:'solved',game,reviewGame},thinking:false,suspended:false};
  syncExerciseEvaluation(evaluation,view);syncExerciseEvaluation(evaluation,{...view,suspended:true});
  assert.deepEqual(calls,[['suspend'],['suspend']]);
  calls.length=0;syncExerciseEvaluation(evaluation,{...view,session:{...view.session,status:'active'}});
  assert.deepEqual(calls,[['update',game],['resume']],'Undo or Retry resumes analysis of the actual current board only');
  calls.length=0;syncExerciseEvaluation(evaluation,{...view,session:{...view.session,status:'active'},thinking:true});
  assert.deepEqual(calls,[['suspend'],['update',game]]);
});

test('a strong completed iteration paints its real exercise fill while further analysis continues',()=>{
  const value={enabled:true,status:'thinking',score:1.6,share:.96,depth:4,nodes:800};
  const provisional=exerciseEvaluationDisplay(value),ready=exerciseEvaluationDisplay({...value,status:'ready'});
  assert.equal(provisional.available,true);assert.equal(provisional.share,.96);assert.equal(provisional.scoreText,'+1.60');
  assert.match(provisional.info,/Provisional estimate · last available analysis/);assert.match(provisional.info,/depth 4, 800 nodes/);
  assert.equal(ready.share,provisional.share);assert.match(ready.info,/^Current-round estimate/);
});

test('retained exercise estimates stay visible with an explicit held or updating label',()=>{
  const value={enabled:true,status:'suspended',score:-.7,share:.1,depth:3,nodes:400};
  const held=exerciseEvaluationDisplay(value),queued=exerciseEvaluationDisplay({...value,status:'queued'});
  assert.equal(held.share,.1);assert.equal(held.scoreText,'-0.70');assert.match(held.info,/Last available estimate/);assert.match(held.info,/Held while analysis is paused/);
  assert.equal(queued.share,.1);assert.match(queued.info,/Last available estimate/);assert.match(queued.info,/Updating for the next decision/);
  const complete=exerciseEvaluationDisplay(value,{complete:true});
  assert.equal(complete.share,.1);assert.match(complete.info,/Last available decision estimate · exercise complete/);
});

test('exercise analysis never fabricates a neutral score when none is available or analysis is off',()=>{
  for(const status of ['thinking','queued','suspended','ready']){
    const missing=exerciseEvaluationDisplay({enabled:true,status,score:null,share:.96});
    assert.equal(missing.available,false);assert.equal(missing.share,.5);assert.equal(missing.scoreText,'…');
  }
  for(const status of ['off','unavailable']){
    const hidden=exerciseEvaluationDisplay({enabled:status!=='off',status,score:1.6,share:.96});
    assert.equal(hidden.available,false);assert.equal(hidden.share,.5);assert.equal(hidden.scoreText,'—');
  }
  const complete=exerciseEvaluationDisplay({enabled:true,status:'suspended',score:null,share:.5},{complete:true});
  assert.equal(complete.scoreText,'—');assert.match(complete.info,/No estimate was available/);
});

test('starting a defensive exercise selects the human keeper rather than the opposing shooter',()=>{
  const game={phase:'keeperReact',ball:{carrierId:'black-Q'},pieces:[{id:'black-Q',team:'black',type:'Q'},{id:'white-K',team:'white',type:'K'}]};
  assert.equal(exerciseStartingPiece(game,'white'),'white-K');game.phase='defendMove';
  assert.equal(exerciseStartingPiece(game,'white'),null);game.pieces[0].team='white';
  assert.equal(exerciseStartingPiece(game,'white'),'black-Q');
});
