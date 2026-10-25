import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../dist/engine.js';
import {createCommentary} from '../dist/commentary.js';
import {commentaryPositionFacts} from '../dist/commentary-spatial.js';
import {COMMENTARY_CLIPS} from '../dist/commentary-clips.js';

function position() {
  const state=E.createGame({mode:'watch',seed:73,foulsEnabled:false});
  const placements={'white-K':[6,16],'black-K':[7,0],'white-Q':[6,4],
    'white-R1':[6,6],'black-R2':[12,3]};
  state.pieces=state.pieces.filter(p=>placements[p.id]).map(p=>({...p,
    x:placements[p.id][0],y:placements[p.id][1]}));
  Object.assign(state,{attack:'white',phase:'kick',turn:1,
    ball:{x:6,y:4,carrierId:'white-Q'},restart:null,pendingShot:null,offside:null,
    passRun:null,lastAction:null,paceControl:null,looseBallKickOrigin:null,
    positionBudget:{normalUsed:false,pawnUsed:false,dribbleUsed:false},
    ballProgress:{team:'white',anchorY:4,rounds:0,pendingRelease:false,excludeRelease:false}});
  assert.ok(state.pieces.every(p=>E.canOccupySquare(p,p.x,p.y)));
  return state;
}
function harness({playback='library',pendingRecorded=false}={}) {
  let time=0,serial=0;
  const audios=[],captions=[],jobs=[],timers=new Map();
  const clip={key:'cutoff-hugo',voice:'Hugo',text:'The queen had support along an open vertical file.',
    src:'/audio/hugo/cutoff-hugo.mp3',durationMs:4800,snapshot:true,ready:true};
  class Audio {
    constructor(src){this.src=src;this.pauses=0;this.duration=4.8;this.currentTime=0;audios.push(this);}
    play(){
      if(pendingRecorded&&this.src===clip.src)return new Promise(resolve=>{this.resolvePlay=resolve;});
      this.onplaying?.();return Promise.resolve();
    }
    pause(){this.pauses++;}
    removeAttribute(){}
    load(){}
  }
  const local={cancels:0,getState:()=>({ready:true,supported:true,status:'ready',unlocked:true}),
    load:()=>Promise.resolve(true),
    speak(text,options){return new Promise(resolve=>jobs.push({text,options,resolve}));},
    cancel(){this.cancels++;}};
  const controller=createCommentary({AudioCtor:Audio,localSpeech:local,speechSynthesis:null,Utterance:null,
    hugoClips:{cutoff:clip},selectHugoClip:line=>line.kind==='trend'?clip:null,
    now:()=>time,onCaption:(text,event)=>captions.push({text,event}),
    setTimer(fn,delay){const id=++serial;timers.set(id,{at:time+delay,fn});return id;},
    clearTimer:id=>timers.delete(id)});
  controller.setPace(3000);controller.setPlayback(playback);controller.setEnabled(true);
  function advance(ms){
    const end=time+ms;
    for(;;){const next=[...timers].filter(([,t])=>t.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];
      if(!next)break;timers.delete(next[0]);time=next[1].at;next[1].fn();}
    time=end;
  }
  return {controller,audios,captions,jobs,local,timers,advance,now:()=>time,clip,playback};
}
function begin(h,{startLocal=true}={}) {
  const state=position(),fact=commentaryPositionFacts(state).find(f=>f.type==='support');
  assert.ok(fact,'the native board has a legal support lane');
  h.controller.tick(state,{blocked:true});
  assert.equal(h.controller.reveal({kind:'trend',priority:1,id:'hugo-support',text:fact.text,
    spatial:fact,team:fact.team,clipKey:null}),true);
  if(h.playback==='local'&&startLocal){assert.equal(h.jobs.length,1);h.jobs[0].options.onPlaying();}
  return state;
}
function shoot(h,before) {
  const after=E.applyKick(before,6,-1,{roll:0});
  assert.equal(after.phase,'keeperReact');assert.equal(after.lastAction.type,'shotAttempt');
  h.controller.observe(before,after,{pace:3000});
  return after;
}
const reaction=(kind,id=kind)=>({kind,priority:{attempt:2,outcome:3,goal:4}[kind],id,shot:true,
  text:`Committed ${kind}.`,clipKey:kind==='goal'?'goal_generic':kind==='outcome'?'save_hold':'shot_normal'});
const flush=async()=>{await Promise.resolve();await Promise.resolve();await Promise.resolve();};

for(const result of ['outcome','goal'])test(`a started Hugo sentence finishes before the latest ${result}; the earlier shot call is replaced`,async()=>{
  const h=harness(),before=begin(h),hugo=h.audios[0],ended=hugo.onended;
  h.advance(3000);shoot(h,before);
  assert.equal(hugo.pauses,0,'a shot action must not cut the sentence in progress');
  assert.equal(h.audios.length,1,'the attempt waits instead of overlapping or replacing Hugo');
  assert.equal(h.controller.reveal(reaction(result)),true);
  assert.equal(hugo.pauses,0);assert.equal(h.audios.length,1);
  h.advance(1000);ended();await flush();
  assert.equal(h.audios.length,2,'only the latest result should follow the completed sentence');
  assert.equal(h.audios[1].src,COMMENTARY_CLIPS[result==='goal'?'goal_generic':'save_hold'].src);
  assert.equal(h.captions.at(-1).event.kind,result);
  const reactionEnd=h.audios[1].onended;reactionEnd();await flush();
  assert.equal(h.audios.length,2,'the obsolete attempt is never replayed afterward');
  h.controller.destroy();
});

test('a queued shot attempt can follow Hugo if no result has superseded it',async()=>{
  const h=harness(),before=begin(h),hugo=h.audios[0],ended=hugo.onended;
  h.advance(3000);shoot(h,before);assert.equal(hugo.pauses,0);assert.equal(h.audios.length,1);
  h.advance(1000);ended();await flush();
  assert.equal(h.audios.length,2);assert.equal(h.captions.at(-1).event.kind,'attempt');
  h.controller.destroy();
});

test('a late shot attempt expires instead of becoming a stale post-sentence announcement',async()=>{
  const h=harness(),before=begin(h),hugo=h.audios[0],ended=hugo.onended;
  h.advance(1000);shoot(h,before);
  h.advance(7000);ended();await flush();
  assert.equal(h.audios.length,1,'a seven-second-old attempt must not play after Hugo');
  assert.equal(h.controller.getState().speaking,false);
  h.controller.destroy();
});

for(const change of ['mute','pause','reset','pace','mode'])test(`${change} immediately stops Hugo and clears the waiting reaction`,async()=>{
  const h=harness();begin(h);const hugo=h.audios[0],ended=hugo.onended;
  assert.equal(h.controller.reveal(reaction('goal')),true);
  assert.equal(hugo.pauses,0,'the goal should wait until the user stops playback');
  if(change==='mute')h.controller.setEnabled(false);
  else if(change==='pause')h.controller.suspend();
  else if(change==='reset')h.controller.reset();
  else if(change==='pace')h.controller.setPace(1800);
  else h.controller.setPlayback('recorded');
  assert.ok(hugo.pauses>0);ended();h.advance(60000);await flush();
  assert.equal(h.audios.length,1,'the cancelled waiting goal must never return');
  assert.equal(h.controller.getState().speaking,false);
  h.controller.destroy();
});

test('automatic replay preserves an in-progress Hugo sentence and its queued goal',async()=>{
  const h=harness();begin(h);const hugo=h.audios[0],ended=hugo.onended;
  h.controller.reveal(reaction('goal'));
  h.controller.suspend({preserveGoal:true,preserveHugo:true});
  h.controller.suspend({preserveGoal:true,preserveHugo:true});
  assert.equal(hugo.pauses,0,'the automatic replay lifecycle must not undo sentence protection');
  ended();await flush();
  assert.equal(h.audios.length,2);assert.equal(h.audios[1].src,COMMENTARY_CLIPS.goal_generic.src);
  h.controller.destroy();
});

test('a full-time state does not cut a started Hugo sentence before its queued goal',async()=>{
  const h=harness(),state=begin(h),hugo=h.audios[0],ended=hugo.onended;
  h.controller.reveal(reaction('goal'));
  const fulltime={...state,phase:'finished',pendingShot:null};
  h.controller.tick(fulltime,{blocked:true});
  h.controller.suspend({preserveGoal:true,preserveHugo:true});
  assert.equal(hugo.pauses,0);ended();await flush();
  assert.equal(h.audios.length,2);assert.equal(h.captions.at(-1).event.kind,'goal');
  h.controller.destroy();
});

test('started locally synthesized Hugo also finishes before a queued goal',async()=>{
  const h=harness({playback:'local'}),before=begin(h),job=h.jobs[0];
  h.advance(3000);shoot(h,before);h.controller.reveal(reaction('goal'));
  assert.equal(h.local.cancels,0,'local speech must have the same finish-sentence protection');
  assert.equal(h.audios.length,0);
  job.resolve({spoken:true});await flush();
  assert.equal(h.audios.length,1);assert.equal(h.audios[0].src,COMMENTARY_CLIPS.goal_generic.src);
  h.controller.destroy();
});

test('local generation that has not begun speaking can be cancelled for the current shot',async()=>{
  const h=harness({playback:'local'}),before=begin(h,{startLocal:false}),job=h.jobs[0];
  shoot(h,before);assert.ok(h.local.cancels>0);assert.equal(h.audios.length,1);
  assert.equal(h.captions.at(-1).event.kind,'attempt');
  job.options.onPlaying();job.resolve({spoken:true});await flush();
  assert.equal(h.audios.length,1);assert.equal(h.captions.at(-1).event.kind,'attempt');
  h.controller.destroy();
});

test('a prepared clip still loading is replaced by the current shot and cannot start later',async()=>{
  const h=harness({pendingRecorded:true}),before=begin(h),old=h.audios[0],late=old.onplaying;
  assert.equal(h.controller.getState().audioStatus,'loading');
  shoot(h,before);assert.ok(old.pauses>0);assert.equal(h.audios.length,2);
  late();old.resolvePlay();await flush();
  assert.equal(h.audios.length,2);assert.equal(h.captions.at(-1).event.kind,'attempt');
  h.controller.destroy();
});

test('a newer same-priority outcome replaces the older waiting outcome',async()=>{
  const h=harness();begin(h);const hugo=h.audios[0],ended=hugo.onended;
  h.controller.reveal(reaction('outcome','first-save'));
  h.controller.reveal({...reaction('outcome','later-miss'),clipKey:'miss',text:'Committed miss.'});
  assert.equal(hugo.pauses,0);assert.equal(h.audios.length,1);
  ended();await flush();
  assert.equal(h.audios.length,2);assert.equal(h.audios[1].src,COMMENTARY_CLIPS.miss.src);
  h.controller.destroy();
});

test('a later lower-priority attempt cannot displace a waiting goal',async()=>{
  const h=harness();begin(h);const hugo=h.audios[0],ended=hugo.onended;
  h.controller.reveal(reaction('goal','goal-before-later-attempt'));
  h.controller.reveal(reaction('attempt','later-attempt'));
  assert.equal(hugo.pauses,0);assert.equal(h.audios.length,1);
  ended();await flush();
  assert.equal(h.audios.length,2);assert.equal(h.audios[1].src,COMMENTARY_CLIPS.goal_generic.src);
  h.controller.destroy();
});

for(const queued of [false,true])test(`a failed started recording ${queued?'releases its waiting goal':'does not block a new goal behind a silent caption'}`,async()=>{
  const h=harness();begin(h);const hugo=h.audios[0],failed=hugo.onerror;
  if(queued)h.controller.reveal(reaction('goal','goal-after-recording-error'));
  failed();await flush();
  if(!queued)h.controller.reveal(reaction('goal','goal-after-recording-error'));
  assert.equal(h.audios.length,2,'once audio fails there is no speaking sentence left to wait for');
  assert.equal(h.audios.at(-1).src,COMMENTARY_CLIPS.goal_generic.src);
  assert.equal(h.captions.at(-1).event.kind,'goal');
  h.controller.destroy();
});

for(const queued of [false,true])test(`failed started local playback ${queued?'releases its waiting goal':'does not leave a silent protected caption'}`,async()=>{
  const h=harness({playback:'local'});begin(h);const job=h.jobs[0];
  if(queued)h.controller.reveal(reaction('goal','goal-after-local-error'));
  job.resolve({spoken:false,reason:'audio_interrupted'});await flush();
  if(!queued)h.controller.reveal(reaction('goal','goal-after-local-error'));
  assert.equal(h.audios.length,1,'a failed voice must release match reactions immediately');
  assert.equal(h.audios[0].src,COMMENTARY_CLIPS.goal_generic.src);
  assert.equal(h.captions.at(-1).event.kind,'goal');
  h.controller.destroy();
});
