import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {createGame} from '../dist/engine.js';
import {evaluatePosition,evaluationNumbers,EVALUATION_GOAL_UNIT} from '../dist/evaluation-worker.js';
import {createEvaluation,evaluationPositionKey,evaluationSnapshot,formatEvaluation} from '../dist/evaluation.js';

const fresh=()=>createGame({seed:271});
const reply=(score,extra={})=>({whiteValue:score*2000,score,share:.5+.48*Math.tanh(score/1.5),depth:4,nodes:800,sideToMove:'white',terminal:false,...extra});
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
    assert.equal(position,state);options=config;config.onIteration({value:-600,stats:{completedDepth:2,nodes:50}});
    return {value:-800,stats:{completedDepth:3,nodes:1400}};
  }});
  assert.equal(options.maxDepth,8);assert.equal(options.nodeLimit,1400);
  assert.equal(options.modelWeights,null);assert.equal(options.modelScale,80);assert.equal(options.selectionSeed,null);
  assert.equal(result.sideToMove,'black');assert.equal(result.whiteValue,800);
  assert.equal(progress[0].whiteValue,600);assert.equal(result.depth,3);
});

test('terminal scores and forfeits use their real result instead of the search finished-state zero',()=>{
  const state=fresh();state.phase='finished';state.score={white:1,black:3};
  let result=evaluatePosition(state,{analyze:()=>{throw Error('terminal positions need no search');}});
  assert.equal(result.terminal,true);assert.equal(result.winner,'black');assert.equal(result.score,-2);assert.equal(result.share,0);
  state.finishReason='forfeit';state.winner='white';
  result=evaluatePosition(state);assert.equal(result.winner,'white');assert.equal(result.share,1);assert.equal(formatEvaluation(result),'Ivory wins');
  delete state.finishReason;state.score={white:2,black:2};
  result=evaluatePosition(state);assert.equal(result.winner,null);assert.equal(result.share,.5);assert.equal(formatEvaluation(result),'Draw');
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
  assert.match(app,/EVALUATION_STORE = 'football-chess-analysis-v1'/);
  assert.match(app,/evaluation\.setEnabled\(evaluationEnabled\)/);
});
