import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {createGame,applyKick,analyzeTacticalAction} from '../dist/engine.js';
import {evaluatePosition,evaluationNumbers,EVALUATION_GOAL_UNIT} from '../dist/evaluation-worker.js';
import {createEvaluation,evaluationPositionKey,evaluationSnapshot,formatEvaluation} from '../dist/evaluation.js';

const fresh=()=>createGame({seed:271});
const reply=(score,extra={})=>({...evaluationNumbers(score*2000,'white',{completedDepth:4,nodes:800}),...extra});
function harness({WorkerAvailable=true}={}){
  const workers=[],updates=[],timers=new Map();let serial=0;
  class Worker {
    constructor(url,options){this.url=url;this.options=options;this.messages=[];this.terminations=0;workers.push(this);}
    postMessage(message){this.messages.push(structuredClone(message));}
    terminate(){this.terminations++;}
    send(data){this.onmessage?.({data});}
  }
  const controller=createEvaluation({WorkerCtor:WorkerAvailable?Worker:null,onUpdate:value=>updates.push(value),
    setTimer(fn){const id=++serial;timers.set(id,fn);return id;},clearTimer:id=>timers.delete(id)});
  return {controller,workers,updates,timers,worker:()=>workers.at(-1),finish(result=reply(.5)){const w=workers.at(-1),m=w.messages.at(-1);w.send({requestId:m.requestId,result});}};
}

test('analysis always reports Ivory perspective and its light fill is a bounded engine scale',()=>{
  const w=evaluationNumbers(1200,'white',{completedDepth:5,nodes:1400});
  const b=evaluationNumbers(-1200,'black',{completedDepth:5,nodes:1400});
  assert.equal(EVALUATION_GOAL_UNIT,2000);assert.deepEqual({...b,sideToMove:'white'},w);
  assert.equal(w.score,.6);assert.ok(w.share>.5&&w.share<1);
  assert.equal(evaluationNumbers(0,'white').share,.5);
  assert.ok(evaluationNumbers(-1e100,'white').share>=0);assert.ok(evaluationNumbers(1e100,'white').share<=1);
  assert.throws(()=>evaluationNumbers(NaN,'white'));
  assert.equal(formatEvaluation(w),'Ivory +0.60');
  assert.equal(formatEvaluation(evaluationNumbers(1200,'black')),'Obsidian +0.60');
  assert.equal(formatEvaluation({score:0}),'Level 0.00');
});

test('worker analysis fixes the handcrafted search budget and ignores caller model or variety preferences',()=>{
  const state=fresh();state.phase='defendMove';let options;
  const progress=[];
  const result=evaluatePosition(state,{onProgress:value=>progress.push(value),analyze:(position,config)=>{
    assert.notEqual(position,state);assert.deepEqual(position.score,{white:0,black:0});
    assert.equal(position.pieces,state.pieces);options=config;config.onIteration({value:-600,stats:{completedDepth:2,nodes:50}});
    return {value:-800,stats:{completedDepth:3,nodes:1400}};
  }});
  assert.equal(options.maxDepth,8);assert.equal(options.nodeLimit,1400);
  assert.equal(options.modelWeights,null);assert.equal(options.modelScale,80);assert.equal(options.selectionSeed,null);
  assert.equal(options.evaluationScope,'round');assert.equal(result.scope,'round');assert.equal(result.attackTeam,'white');
  assert.equal(result.sideToMove,'black');assert.equal(result.whiteValue,800);
  assert.equal(progress[0].whiteValue,600);assert.equal(result.depth,3);
});

test('a finished match has no active round and never fills the bar from the final score or forfeit',()=>{
  const state=fresh();state.phase='finished';state.score={white:1,black:3};
  let result=evaluatePosition(state,{analyze:()=>{throw Error('terminal positions need no search');}});
  assert.equal(result.terminal,true);assert.equal(result.winner,null);assert.equal(result.score,0);assert.equal(result.share,.5);assert.equal(result.roundActive,false);
  state.finishReason='forfeit';state.winner='white';
  result=evaluatePosition(state);assert.equal(result.winner,null);assert.equal(result.share,.5);assert.equal(formatEvaluation(result),'No active round');
  delete state.finishReason;state.score={white:2,black:2};
  result=evaluatePosition(state);assert.equal(result.winner,null);assert.equal(result.share,.5);assert.equal(formatEvaluation(result),'No active round');
});

test('native analysis leaves both the live position and its future chance seed intact',()=>{
  const state=fresh(),before=structuredClone(state);
  state.pieces=state.pieces.filter(p=>['white-K','white-Q','black-K'].includes(p.id));
  const saved=structuredClone(state),result=evaluatePosition(state);
  assert.deepEqual(state,saved);assert.equal(state.randomState,before.randomState);
  assert.ok(Number.isFinite(result.score));assert.ok(result.nodes<=1400);
});

test('background controller is off by default and never sends the match random seed',()=>{
  const h=harness(),game=fresh(),before=structuredClone(game);
  h.controller.update(game);assert.equal(h.workers.length,0);assert.equal(h.controller.getState().status,'off');
  h.controller.setEnabled(true);assert.equal(h.workers.length,1);
  const request=h.worker().messages[0];assert.equal(request.position.randomState,1);assert.deepEqual(game,before);
  assert.notEqual(request.position,game);request.position.ball.x=1;assert.deepEqual(game,before);
  assert.equal(h.worker().options.type,'module');
  h.controller.destroy();
});

test('position identity ignores future chance state and UI-only settings',()=>{
  const state=fresh(),next=structuredClone(state);next.randomState=123456;next.mode='watch';
  assert.equal(evaluationPositionKey(state),evaluationPositionKey(next));
  assert.equal(evaluationSnapshot(state).randomState,1);assert.equal(state.randomState,271);
  const h=harness();h.controller.update(state);h.controller.setEnabled(true);h.controller.update(next);
  assert.equal(h.worker().messages.length,1);h.controller.destroy();
});

function roundDiagram({keeperX=8,blocker=false,phase='kick'}={}){
  const state=fresh();state.phase=phase;state.attack='white';
  state.pieces=[{id:'white-K',team:'white',type:'K',x:6,y:16},
    {id:'white-Q',team:'white',type:'Q',x:6,y:2},
    {id:'black-K',team:'black',type:'K',x:keeperX,y:0},
    {id:'black-R1',team:'black',type:'R',x:blocker?6:13,y:blocker?1:8}];
  state.ball={x:6,y:2,carrierId:'white-Q'};state.restart=null;state.offside=null;
  state.positionBudget={normalUsed:false,pawnUsed:false,dribbleUsed:false};
  state.ballProgress={team:'white',anchorY:2,rounds:0,pendingRelease:false,excludeRelease:false};
  state.pendingShot=null;state.paceControl=null;state.looseBallKickOrigin=null;
  return state;
}

test('identical current rounds evaluate identically at 0–0, 0–7 and 9–1, without mutating the score',()=>{
  const position=roundDiagram(),baseline=evaluatePosition(position);
  for(const score of [{white:0,black:7},{white:9,black:1}]){
    const variant={...structuredClone(position),score},before=structuredClone(variant);
    assert.deepEqual(evaluatePosition(variant),baseline);
    assert.deepEqual(variant,before);
    assert.equal(evaluationPositionKey(variant),evaluationPositionKey(position));
    assert.deepEqual(evaluationSnapshot(variant).score,{white:0,black:0});
  }
});

test('round scope stops at the kick boundary while default playing search remains identical',()=>{
  const position=roundDiagram(),before=structuredClone(position);
  const options={maxDepth:3,nodeLimit:1400,modelWeights:null,modelScale:80};
  assert.deepEqual(analyzeTacticalAction(position,options),analyzeTacticalAction(position,{...options,evaluationScope:'match'}));
  const round=analyzeTacticalAction(position,{...options,evaluationScope:'round'});
  assert.ok(round.stats.roundStops>0,'round boundaries are actual search leaves');
  assert.ok(round.line.length<=2,'a kick and its keeper reaction do not start the next positioning round');
  assert.deepEqual(position,before);
  assert.throws(()=>analyzeTacticalAction(position,{evaluationScope:'unknown'}));
});

test('current shot and keeper geometry change the round estimate, but irrelevant raw material does not',()=>{
  const clear=evaluatePosition(applyKick(roundDiagram({keeperX:9}),6,-1));
  const covered=evaluatePosition(applyKick(roundDiagram({keeperX:6}),6,-1));
  const screened=evaluatePosition(applyKick(roundDiagram({keeperX:9,blocker:true}),6,-1));
  assert.ok(clear.whiteValue>covered.whiteValue,'covering the shooting file improves the defence');
  assert.ok(clear.whiteValue>screened.whiteValue,'a body on the shot route improves the defence');
  const position=roundDiagram(),remote=structuredClone(position);
  remote.pieces.push({id:'black-P1',team:'black',type:'P',x:13,y:15});
  const options={evaluationScope:'round',maxDepth:1,nodeLimit:1,modelWeights:null,modelScale:80};
  assert.equal(analyzeTacticalAction(position,options).value,analyzeTacticalAction(remote,options).value);
});

test('clear scoring chances have strong visual contrast while a quiet kickoff stays close to the centre',()=>{
  const clear=evaluatePosition(applyKick(roundDiagram({keeperX:9}),6,-1));
  const covered=evaluatePosition(applyKick(roundDiagram({keeperX:6}),6,-1));
  const screened=evaluatePosition(applyKick(roundDiagram({keeperX:9,blocker:true}),6,-1));
  assert.ok(clear.score>.9&&clear.score<1.05,'the native round value detects the near-certain finish');
  assert.ok(clear.share>.94&&clear.share<.99,'a near-certain finish must look decisively asymmetric');
  assert.ok(clear.share>screened.share&&screened.share>covered.share,'the bar preserves the keeper and blocker ordering');
  assert.ok(clear.share-covered.share>.15,'proper keeper coverage must make a visible difference');
  const kickoff=evaluatePosition(fresh());
  assert.ok(Math.abs(kickoff.share-.5)<.08,'ordinary possession alone must not look like a decisive finish');
});

test('an equivalent Obsidian scoring chance produces the opposite bar with the same strength',()=>{
  const original=roundDiagram({keeperX:9}),mirror=structuredClone(original);
  const swap=id=>id.startsWith('white-')?id.replace('white-','black-'):id.replace('black-','white-');
  mirror.pieces=original.pieces.map(p=>({...p,id:swap(p.id),team:p.team==='white'?'black':'white',x:13-p.x,y:16-p.y}));
  mirror.ball={x:13-original.ball.x,y:16-original.ball.y,carrierId:swap(original.ball.carrierId)};
  mirror.attack='black';mirror.ballProgress={...mirror.ballProgress,team:'black',anchorY:16-original.ballProgress.anchorY};
  const ivory=evaluatePosition(applyKick(original,6,-1)),obsidian=evaluatePosition(applyKick(mirror,7,17));
  assert.ok(obsidian.share<.06,'a near-certain Obsidian finish must favor the dark side');
  assert.ok(Math.abs(ivory.score+obsidian.score)<1e-8);
  assert.ok(Math.abs(ivory.share+obsidian.share-1)<1e-8);
});

test('a resolved penalty values only this round goal or stop, without kickoff formations or a counterattack',()=>{
  const position=roundDiagram();position.score={white:4,black:9};
  position.restart={type:'penalty',team:'white',takerId:'white-Q',spot:{x:6,y:2},indirect:false};
  const pending=applyKick(position,6,-1),saved=structuredClone(pending),result=evaluatePosition(pending);
  // Native penalties are exactly80% goal,20% caught save, with no corners or
  // rebound. A current-round goal is2000 and a stopped attack is−80.
  assert.ok(Math.abs(result.whiteValue-(.8*2000+.2*(-80)))<1e-8);
  assert.deepEqual(pending,saved);assert.equal(result.sideToMove,'black');
  const altered=structuredClone(pending);
  altered.pieces.find(p=>p.id==='white-K').x=8;
  assert.equal(evaluatePosition(altered).whiteValue,result.whiteValue,'next-kickoff home values do not leak into a completed goal');
});

test('an accurate pass ends the analysed round, but a backpass completes the compulsory keeper release',()=>{
  const position=roundDiagram();position.pieces.find(p=>p.id==='white-Q').type='R';
  Object.assign(position.pieces.find(p=>p.id==='white-Q'),{x:0,y:10});
  position.ball={x:0,y:10,carrierId:'white-Q'};
  const options={evaluationScope:'round',maxDepth:4,nodeLimit:1400,modelWeights:null,modelScale:80};
  const passing=analyzeTacticalAction(position,options);
  assert.equal(passing.line.length,1,'a rook pass cannot spend the next positioning round');
  assert.equal(passing.line[0].phase,'kick');assert.ok(passing.stats.roundStops>0);
  // Make the keeper the only teammate receiver on the rook's file. The root
  // pass family includes that100% backpass; its release must be expanded.
  const backpass=roundDiagram();const passer=backpass.pieces.find(p=>p.id==='white-Q');
  Object.assign(passer,{type:'R',x:6,y:10});backpass.ball={x:6,y:10,carrierId:passer.id};
  const release=analyzeTacticalAction(backpass,options);
  assert.ok(release.stats.keeperReleaseContinuations>0,'immediate king releases are inside the analysed round');
});

test('rapid updates keep only one running request and the newest pending board',()=>{
  const h=harness(),a=fresh(),b=structuredClone(a),c=structuredClone(a);b.turn++;c.turn+=2;
  h.controller.update(a);h.controller.setEnabled(true);const first=h.worker().messages[0];
  h.controller.update(b);h.controller.update(c);assert.equal(h.worker().messages.length,1);
  h.worker().send({requestId:first.requestId,progress:reply(8)});
  assert.equal(h.controller.getState().score,null,'an old position cannot paint a provisional score');
  h.worker().send({requestId:first.requestId,result:reply(8)});
  assert.equal(h.worker().messages.length,2);assert.equal(h.worker().messages[1].position.turn,c.turn);
  assert.equal(h.controller.getState().score,null,'the stale final score is discarded too');
  h.finish(reply(-.25));assert.equal(h.controller.getState().status,'ready');assert.equal(h.controller.getState().score,-.25);
  assert.equal(h.workers.length,1);h.controller.destroy();
});

test('a new round clears the previous round estimate before its worker reply',()=>{
  const h=harness(),game=fresh();h.controller.update(game);h.controller.setEnabled(true);h.finish(reply(.8));
  assert.equal(h.controller.getState().score,.8);
  h.controller.update({...game,turn:game.turn+1});
  assert.equal(h.controller.getState().score,null);assert.equal(h.controller.getState().share,.5);
  h.finish(reply(.1));assert.equal(h.controller.getState().score,.1);
  h.controller.update({...game,turn:game.turn+1,attack:'black'});
  assert.equal(h.controller.getState().score,null);h.controller.destroy();
});

test('completed search iterations can update the estimate while their current search continues',()=>{
  const h=harness();h.controller.update(fresh());h.controller.setEnabled(true);const m=h.worker().messages[0];
  h.worker().send({requestId:m.requestId,progress:reply(.2,{depth:2,nodes:100})});
  assert.equal(h.controller.getState().status,'thinking');assert.equal(h.controller.getState().depth,2);
  h.finish(reply(.4));assert.equal(h.controller.getState().status,'ready');assert.equal(h.controller.getState().score,.4);
  h.controller.destroy();
});

test('turning analysis off terminates its worker and cannot revive a late result',()=>{
  const h=harness();h.controller.update(fresh());h.controller.setEnabled(true);
  const w=h.worker(),late=w.onmessage,m=w.messages[0];h.controller.setEnabled(false);
  assert.equal(w.terminations,1);assert.equal(h.timers.size,0);late({data:{requestId:m.requestId,result:reply(5)}});
  assert.equal(h.controller.getState().status,'off');assert.equal(h.controller.getState().score,null);
  h.controller.setEnabled(true);assert.equal(h.workers.length,2);h.finish(reply(.1));assert.equal(h.controller.getState().score,.1);h.controller.destroy();
});

test('reset and suspend invalidate old generations, with only the latest board resumed',()=>{
  const h=harness(),a=fresh();h.controller.update(a);h.controller.setEnabled(true);
  const first=h.worker(),late=first.onmessage,m=first.messages[0];h.controller.reset();
  h.controller.update(a);late({data:{requestId:m.requestId,result:reply(8)}});assert.equal(h.controller.getState().score,null);
  h.finish(reply(.3));h.controller.suspend();const b=structuredClone(a);b.turn+=5;h.controller.update(b);
  assert.equal(h.controller.getState().status,'suspended');const count=h.workers.length;h.controller.resume();
  assert.equal(h.workers.length,count+1);assert.equal(h.worker().messages[0].position.turn,b.turn);
  h.finish(reply(.7));assert.equal(h.controller.getState().score,.7);h.controller.destroy();
});

test('a missing worker, worker error, malformed reply or timeout never runs synchronous AI',()=>{
  const absent=harness({WorkerAvailable:false});absent.controller.update(fresh());absent.controller.setEnabled(true);
  assert.equal(absent.controller.getState().status,'unavailable');assert.equal(absent.workers.length,0);
  for(const kind of ['error','malformed','timeout']){
    const h=harness();h.controller.update(fresh());h.controller.setEnabled(true);const w=h.worker(),m=w.messages[0];
    if(kind==='error')w.onerror();else if(kind==='malformed')w.send({requestId:m.requestId,result:{score:NaN}});else [...h.timers.values()][0]();
    assert.equal(h.controller.getState().status,'unavailable',kind);assert.equal(w.terminations,1);assert.equal(h.timers.size,0);
    h.controller.destroy();
  }
});

const app=await readFile(new URL('../dist/app.js',import.meta.url),'utf8');
test('main match holds analysis before a shot result is visible, including hidden-tab updates',()=>{
  const start=app.indexOf('function renderEvaluation(){'),end=app.indexOf('function applyVoicePreference(){',start);
  assert.ok(start>=0&&end>start);
  const calls=[],game=fresh(),context=vm.createContext({game,shotFlight:{revealed:false},document:{hidden:false},
    evaluation:{suspend:()=>calls.push('suspend'),update:s=>calls.push(s),resume:()=>calls.push('resume')},paintEvaluation:()=>calls.push('paint')});
  vm.runInContext(app.slice(start,end),context);context.renderEvaluation();
  assert.deepEqual(calls,['suspend','paint'],'the resolved future game was never sent to the worker');
  calls.length=0;context.shotFlight.revealed=true;context.renderEvaluation();assert.equal(calls[0],game);
  calls.length=0;context.shotFlight=null;context.document.hidden=true;context.renderEvaluation();assert.deepEqual(calls,['suspend','paint']);
});

test('main analysis UI names an estimate and uses separate preferences without a probability aria value',async()=>{
  const html=await readFile(new URL('../dist/index.html',import.meta.url),'utf8');
  assert.match(html,/id="evaluationRail"[^>]+role="img"/);assert.doesNotMatch(html,/id="evaluationRail"[^>]+aria-valuenow/);
  assert.match(html,/neither expected goals nor a calibrated win probability/);
  assert.match(html,/current attack against the defence, independently of the match score/);
  assert.match(app,/Current-round advantage/);assert.match(app,/Match score excluded/);
  assert.match(app,/EVALUATION_STORE = 'football-chess-analysis-v1'/);
  assert.match(app,/evaluation\.setEnabled\(evaluationEnabled\)/);
});
