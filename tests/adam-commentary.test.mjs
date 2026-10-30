import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../dist/engine.js';
import {createCommentary} from '../dist/commentary.js';
import {COMMENTARY_CLIPS} from '../dist/commentary-clips.js';
import {HUGO_COMMENTARY_CLIPS} from '../dist/hugo-commentary-clips.js';
import {commentaryPositionFacts} from '../dist/commentary-spatial.js';

function position() {
  const state=E.createGame({mode:'watch',seed:73,foulsEnabled:false});
  const placements={'white-K':[6,16],'black-K':[7,0],'white-Q':[6,4],'white-R1':[6,6],'black-R2':[12,3]};
  state.pieces=state.pieces.filter(p=>placements[p.id]).map(p=>({...p,x:placements[p.id][0],y:placements[p.id][1]}));
  Object.assign(state,{attack:'white',phase:'kick',turn:1,ball:{x:6,y:4,carrierId:'white-Q'},
    restart:null,pendingShot:null,offside:null,passRun:null,lastAction:null,paceControl:null,looseBallKickOrigin:null,
    positionBudget:{normalUsed:false,pawnUsed:false,dribbleUsed:false},
    ballProgress:{team:'white',anchorY:4,rounds:0,pendingRelease:false,excludeRelease:false}});
  return state;
}
const line=(kind,id=kind)=>({kind,priority:{trend:1,attempt:2,outcome:3,goal:4}[kind],id,
  text:`Proposed ${kind} caption.`,clipKey:{trend:'enable',attempt:'shot_normal',outcome:'save_hold',goal:'goal_generic'}[kind],
  ...(kind==='trend'?{}:{shot:true})});
function harness({delayed=false,missing=false}={}) {
  let time=0,serial=0;
  const audios=[],captions=[],timers=new Map();
  const adapt=(clips,folder)=>Object.fromEntries(Object.entries(clips).map(([key,c])=>[key,{...c,key,voice:'Adam',
    ready:true,durationMs:14000,sha256:'a'.repeat(64),text:c.text.replaceAll('Hugo','Adam'),src:`/adam/${folder}/${key}.mp3`} ]));
  const adamClips=adapt(COMMENTARY_CLIPS,'events'),adamTacticalClips=adapt(HUGO_COMMENTARY_CLIPS,'tactics');
  adamClips.goal_generic.variants=[1,2].map(n=>({...adamClips.goal_generic,text:`Adam goal variation ${n}!`,src:`/adam/events/goal_generic_${n}.mp3`}));
  if(missing)delete adamClips.save_hold;
  class Audio {
    constructor(src){this.src=src;this.pauses=0;this.currentTime=0;this.duration=14;audios.push(this);}
    play(){if(delayed)return new Promise(resolve=>{this.resolvePlay=resolve;});this.onplaying?.();}
    pause(){this.pauses++;}removeAttribute(){}load(){}
  }
  const controller=createCommentary({AudioCtor:Audio,speechSynthesis:null,Utterance:null,adamClips,adamTacticalClips,
    now:()=>time,onCaption:(text,event)=>captions.push({text,event}),
    setTimer(fn,delay){const id=++serial;timers.set(id,{at:time+delay,fn});return id;},clearTimer:id=>timers.delete(id)});
  controller.setPace(3000);assert.equal(controller.setPlayback('adam'),true);controller.setEnabled(true);
  function advance(ms){const end=time+ms;for(;;){const next=[...timers].filter(([,t])=>t.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!next)break;timers.delete(next[0]);time=next[1].at;next[1].fn();}time=end;}
  return {controller,audios,captions,timers,advance,adamClips,adamTacticalClips};
}

for(const kind of ['trend','attempt','outcome','goal'])test(`Adam finishes a started ${kind} before the next goal reaction`,()=>{
  const h=harness();
  try {
    h.controller.reveal(line(kind,'first-'+kind));const current=h.audios[0];
    assert.equal(h.captions.at(-1).event.voice,'Adam');
    h.advance(3000);assert.equal(h.controller.reveal(line('goal','following-goal')),true);
    assert.equal(current.pauses,0,'an automatic reaction cannot clip any started Adam call');
    assert.equal(h.audios.length,1);assert.equal(h.controller.getState().pendingReaction,'goal');
    for(let second=4;second<=13;second++){current.currentTime=second;h.advance(1000);assert.equal(current.pauses,0);}
    current.onended();assert.equal(h.audios.length,2);assert.equal(h.captions.at(-1).event.id,'following-goal');
  } finally {h.controller.destroy();}
});

test('Adam retains only the latest highest-priority reaction and never queues routine observations',()=>{
  const h=harness();
  try {
    h.controller.reveal(line('trend','analysis'));const current=h.audios[0];
    assert.equal(h.controller.reveal(line('attempt','shot')),true);
    assert.equal(h.controller.reveal(line('outcome','save')),true);
    assert.equal(h.controller.reveal(line('goal','older-goal')),true);
    assert.equal(h.controller.reveal(line('goal','latest-goal')),true);
    assert.equal(h.controller.reveal(line('outcome','late-lower-priority-save')),false);
    assert.equal(h.controller.reveal(line('trend','stale-routine')),false);
    assert.equal(current.pauses,0);current.onended();
    assert.equal(h.audios.length,2);assert.equal(h.captions.at(-1).event.id,'latest-goal');
    h.audios[1].onended();assert.equal(h.audios.length,2,'superseded shots, saves and trends must not return');
  } finally {h.controller.destroy();}
});

test('a queued Adam attempt expires rather than announcing an old shot after the sentence',()=>{
  const h=harness();
  try {
    h.controller.reveal(line('trend','analysis'));const current=h.audios[0];
    h.controller.reveal(line('attempt','expired-attempt'));h.advance(7000);current.onended();
    assert.equal(h.audios.length,1);assert.equal(h.controller.getState().speaking,false);
  } finally {h.controller.destroy();}
});

for(const control of ['mute','pause','reset','pace','mode','destroy'])test(`${control} immediately cancels Adam and the queued reaction`,()=>{
  const h=harness();
  try {
    h.controller.reveal(line('attempt','active-shot'));const current=h.audios[0],oldEnded=current.onended;
    h.controller.reveal(line('goal','queued-goal'));
    if(control==='mute')h.controller.setEnabled(false);
    else if(control==='pause')h.controller.suspend();
    else if(control==='reset')h.controller.reset();
    else if(control==='pace')h.controller.setPace(1800);
    else if(control==='mode')h.controller.setPlayback('library');
    else h.controller.destroy();
    assert.ok(current.pauses>0);oldEnded();h.advance(60000);
    assert.equal(h.audios.length,1);assert.equal(h.controller.getState().speaking,false);
    assert.equal(h.controller.getState().pendingReaction,null);assert.equal(h.timers.size,0);
  } finally {h.controller.destroy();}
});

for(const kind of ['attempt','outcome','goal'])test(`automatic replay and full time preserve a started Adam ${kind}`,()=>{
  const h=harness();
  try {
    const game=position();h.controller.tick(game,{blocked:true});h.controller.reveal(line(kind,'active-'+kind));
    const current=h.audios[0];h.controller.reveal(line('goal','queued-final-goal'));
    h.controller.tick({...game,phase:'finished'},{blocked:true});
    h.controller.suspend({preserveGoal:true,preserveHugo:true});
    assert.equal(current.pauses,0);assert.equal(h.audios.length,1);current.onended();
    assert.equal(h.captions.at(-1).event.id,'queued-final-goal');
  } finally {h.controller.destroy();}
});

test('Adam varies repeated event recordings and captions exactly the selected whole sentence without match RNG',()=>{
  const h=harness(),game=position(),before=structuredClone(game),sources=[];
  try {
    h.controller.tick(game,{blocked:true});
    const possibilities=[h.adamClips.goal_generic,...h.adamClips.goal_generic.variants];
    for(let i=0;i<5;i++){
      h.controller.reveal(line('goal','variation-'+i));const audio=h.audios.at(-1),caption=h.captions.at(-1);
      const selected=possibilities.find(c=>c.src===audio.src);assert.ok(selected);
      assert.equal(caption.text,selected.text);assert.equal(caption.event.voice,'Adam');
      if(sources.length)assert.notEqual(audio.src,sources.at(-1),'the immediately previous variation should not repeat');
      sources.push(audio.src);audio.onended();
    }
    assert.equal(new Set(sources).size,3);assert.deepEqual(game,before,'audio variation does not consume or mutate match randomness');
  } finally {h.controller.destroy();}
});

test('Adam uses native support evidence and never starts a vanished pending spatial claim',()=>{
  const h=harness({delayed:true}),game=position(),fact=commentaryPositionFacts(game).find(f=>f.type==='support');
  assert.ok(fact);
  try {
    h.controller.tick(game,{blocked:true});
    assert.equal(h.controller.reveal({kind:'trend',priority:1,id:'native-support',text:fact.text,spatial:fact,team:fact.team}),true);
    const current=h.audios[0],latePlaying=current.onplaying,next=structuredClone(game);
    const supporter=next.pieces.find(p=>p.id==='white-R1');supporter.x=7;next.turn++;next.lastAction=null;
    assert.ok(!commentaryPositionFacts(next).some(f=>f.key===fact.key));
    h.controller.tick(next,{blocked:true});latePlaying();
    assert.ok(current.pauses>0);assert.equal(h.controller.getState().speaking,false);
    assert.equal(h.audios.length,1);
  } finally {h.controller.destroy();}
});

test('missing Adam audio never silently substitutes the old commentator',()=>{
  const h=harness({missing:true});
  try {
    h.controller.reveal(line('outcome','missing-save'));
    assert.equal(h.audios.length,0);assert.equal(h.controller.getState().audioStatus,'unavailable');
  } finally {h.controller.destroy();}
});

test('Adam stays disabled outside Relaxed pace and returning to it does not silently enable speech',()=>{
  const h=harness();
  try {
    for(const pace of [600,1800,0]){
      h.controller.setPace(pace);assert.equal(h.controller.setEnabled(true),false);
      assert.equal(h.controller.reveal(line('goal','not-allowed-'+pace)),false);
    }
    h.controller.setPace(3000);assert.equal(h.controller.getState().enabled,false);
    assert.equal(h.audios.length,0);assert.equal(h.controller.setEnabled(true),true);
    assert.equal(h.controller.reveal(line('goal','allowed')),true);
  } finally {h.controller.destroy();}
});
