import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../dist/engine.js';
import {createCommentary,COMMENTARY_LOCAL_DEADLINE_MS} from '../dist/commentary.js';

// Native transitions establish the rolling evidence. Injected audio only lets
// the test hold the gap between selecting a sentence and hearing its first word.
function passingPosition() {
  const state=E.createGame({mode:'local',seed:991,foulsEnabled:false});
  const placements={
    'white-K':[6,16],'black-K':[7,0],'black-R1':[13,0],'black-R2':[12,0],
    'white-Q':[6,9],'white-R1':[6,7],'white-R2':[6,5],
    'white-B1':[6,3],'white-N1':[8,1],'white-N2':[6,2],
  };
  state.pieces=state.pieces.filter(piece=>placements[piece.id]).map(piece=>({...piece,
    x:placements[piece.id][0],y:placements[piece.id][1]}));
  Object.assign(state,{attack:'white',phase:'kick',turn:1,
    ball:{x:6,y:9,carrierId:'white-Q'},pendingShot:null,restart:null,offside:null,passRun:null,
    lastAction:null,paceControl:null,looseBallKickOrigin:null,
    positionBudget:{normalUsed:false,pawnUsed:false,dribbleUsed:false},
    ballProgress:{team:'white',anchorY:9,rounds:0,pendingRelease:false,excludeRelease:false}});
  assert.ok(state.pieces.every(piece=>E.canOccupySquare(piece,piece.x,piece.y)));
  assert.equal(new Set(state.pieces.map(piece=>piece.x+','+piece.y)).size,state.pieces.length);
  return state;
}
function harness() {
  let time=0,serial=0;
  const timers=new Map(),audios=[],jobs=[],captions=[];
  const fixture={ready:true,voice:'Hugo',snapshot:true,durationMs:6000,src:'/audio/fixture.mp3',text:'Verified match analysis.'};
  class Audio {
    constructor(src){this.src=src;this.pauses=0;this.currentTime=0;this.duration=6;audios.push(this);}
    play(){return new Promise(resolve=>{this.resolvePlay=resolve;});}
    pause(){this.pauses++;} removeAttribute(){} load(){}
  }
  const local={cancels:0,getState:()=>({ready:true,supported:true,unlocked:true}),load:()=>Promise.resolve(true),
    speak(text,options){return new Promise(resolve=>jobs.push({text,options,resolve}));},cancel(){this.cancels++;}};
  const controller=createCommentary({AudioCtor:Audio,localSpeech:local,speechSynthesis:null,Utterance:null,
    hugoClips:{fixture},selectHugoClip:line=>line.kind==='trend'?{...fixture,key:line.clipKey,text:line.text,src:'/audio/'+line.clipKey+'.mp3'}:null,
    now:()=>time,onCaption:(text,event)=>captions.push({text,event}),
    setTimer(fn,delay){const id=++serial;timers.set(id,{at:time+delay,fn});return id;},clearTimer:id=>timers.delete(id)});
  controller.setPace(3000);controller.setPlayback('library');controller.setEnabled(true);
  function advance(ms){const end=time+ms;for(;;){const next=[...timers].filter(([,v])=>v.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!next)break;timers.delete(next[0]);time=next[1].at;next[1].fn();}time=end;}
  return {controller,audios,jobs,local,advance,jump:ms=>{time+=ms;},get last(){return captions.at(-1);}};
}
function commit(h,before,after){assert.notEqual(before,after);h.controller.observe(before,after);return after;}
function prepare(h) {
  let state=passingPosition();
  for(const id of ['white-R1','white-R2','white-B1','white-N1']) {
    while(state.phase!=='kick')state=commit(h,state,E.skipMove(state));
    const receiver=state.pieces.find(piece=>piece.id===id);
    assert.ok(E.legalKicks(state).some(k=>k.receiverId===id&&!k.offside));
    const next=E.applyKick(state,receiver.x,receiver.y,{roll:0});
    assert.equal(next.lastAction.outcome,'complete');state=commit(h,state,next);
  }
  h.controller.suspend();h.advance(12000);return state;
}
function begin(h,state,mode) {
  h.controller.setPlayback(mode);
  assert.equal(h.controller.tick(state),true);
  assert.equal(h.last.event.clipKey,'tactic_combinations');
  assert.equal(h.last.event.tactical.evidenceScope,'rolling');
  return mode==='local'?h.jobs.at(-1):h.audios.at(-1);
}
function start(item,mode) {if(mode==='local')item.options.onPlaying({durationMs:6000});else item.onplaying();}
function ordinaryMove(h,state) {
  const move=E.legalMoves(state,'white-B1').find(m=>m.type==='move'&&m.x===5&&m.y===4);
  assert.ok(move,'the off-ball bishop has a native diagonal move');
  return commit(h,state,E.applyMove(state,'white-B1',move.x,move.y));
}
function turnover(h,state) {
  state=commit(h,state,E.skipMove(state));
  assert.equal(state.phase,'defendMove');
  const tackle=E.legalMoves(state,'black-K').find(m=>m.type==='tackle');
  assert.ok(tackle,'the native keeper can challenge the adjacent knight');
  const next=E.applyMove(state,'black-K',tackle.x,tackle.y,{roll:0});
  assert.equal(next.lastAction.type,'tackle');assert.equal(next.lastAction.outcome,'won');
  assert.equal(next.attack,'black');return commit(h,state,next);
}
for(const mode of ['library','local']) {
  test(`${mode}: a native rolling assessment survives a routine action before first playback`,()=>{
    const h=harness();try {
      const state=prepare(h),before=structuredClone(state),item=begin(h,state,mode);
      ordinaryMove(h,state);start(item,mode);
      assert.deepEqual(state,before,'analysis and playback do not mutate the source board or RNG');
      assert.equal(h.controller.getState().audioStatus,'playing');
      assert.equal(h.last.event.clipKey,'tactic_combinations');
    }finally{h.controller.destroy();}
  });
  test(`${mode}: delayed rolling audio cannot start after a native turnover`,async()=>{
    const h=harness();try {
      const state=prepare(h),item=begin(h,state,mode),late=mode==='local'?item.options.onPlaying:item.onplaying;
      turnover(h,state);late();
      assert.equal(h.controller.getState().speaking,false);assert.equal(h.last.text,'');
      if(mode==='local'){assert.ok(h.local.cancels>0);item.resolve({spoken:true});}
      else {assert.ok(item.pauses>0);item.resolvePlay();}
      await Promise.resolve();await Promise.resolve();late();
      assert.equal(h.controller.getState().speaking,false,'late completion cannot revive superseded tactical audio');
    }finally{h.controller.destroy();}
  });
  test(`${mode}: delayed rolling audio cannot start after a native restart award`,()=>{
    const h=harness();try {
      const state=prepare(h),item=begin(h,state,mode);
      const restarted=E.actionTimeout(state);assert.equal(restarted.restart.type,'timeout');
      commit(h,state,restarted);start(item,mode);
      assert.equal(h.controller.getState().speaking,false);assert.equal(h.last.text,'');
    }finally{h.controller.destroy();}
  });
  test(`${mode}: an expired pending tactical sentence cannot be revived by its late start`,()=>{
    const h=harness();try {
      const state=prepare(h),item=begin(h,state,mode),late=mode==='local'?item.options.onPlaying:item.onplaying;
      // Simulate a busy main thread: real time passes before overdue timers run.
      h.jump(COMMENTARY_LOCAL_DEADLINE_MS+1);
      late();assert.equal(h.controller.getState().speaking,false);
    }finally{h.controller.destroy();}
  });
  test(`${mode}: started rolling speech finishes after turnover and the goal waits behind it`,async()=>{
    const h=harness();try {
      const state=prepare(h),item=begin(h,state,mode),late=mode==='local'?item.options.onPlaying:item.onplaying;
      start(item,mode);const cancellationCount=h.local.cancels;
      turnover(h,state);
      assert.equal(h.controller.getState().speaking,true);
      assert.equal(h.controller.getState().audioStatus,'playing');
      assert.equal(h.local.cancels,cancellationCount);
      if(mode==='library')assert.equal(item.pauses,0);
      assert.equal(h.controller.reveal({kind:'goal',priority:4,id:'freshness-goal:'+mode,
        text:'A goal!',shot:true,clipKey:'goal_generic'}),true);
      assert.equal(h.controller.getState().pendingReaction,'goal');
      late();assert.equal(h.controller.getState().audioStatus,'playing','duplicate start cannot cut the completed observation');
      if(mode==='local'){item.resolve({spoken:true});await Promise.resolve();await Promise.resolve();}
      else item.onended();
      assert.equal(h.last.event.kind,'goal');assert.equal(h.last.event.voice,'Tom');
      assert.equal(h.controller.getState().pendingReaction,null);
    }finally{h.controller.destroy();}
  });
}
test('the rolling scope is required for analyser validation; explicit delivery assessments retain their contract',()=>{
  const h=harness();try {
    const explicit={kind:'trend',priority:1,id:'explicit-assessment',text:'A supplied assessment.',clipKey:'tactic_counter',
      tactical:{type:'tactic_counter',key:'tactic_counter:white:',observedSerial:1},team:'white'};
    assert.equal(h.controller.reveal({...explicit,id:'unobserved-rolling',tactical:{...explicit.tactical,evidenceScope:'rolling'}}),false);
    assert.equal(h.controller.reveal(explicit),true);
    h.audios.at(-1).onplaying();assert.equal(h.controller.getState().audioStatus,'playing');
  }finally{h.controller.destroy();}
});
