import test from 'node:test';
import assert from 'node:assert/strict';
import {createCommentary} from '../dist/commentary.js';
import {HUGO_COMMENTARY_CLIPS} from '../dist/hugo-commentary-clips.js';

function harness({mode='library', delayed=false, clipDurationMs=14000}={}) {
  let time=0, serial=0;
  const timers=new Map(), audios=[],jobs=[];
  const clip={src:'/audio/hugo/sentence-audit.mp3',text:'A counterattack opened.',voice:'Hugo',ready:true,snapshot:true,durationMs:clipDurationMs};
  class Audio {
    constructor(src){this.src=src;this.pauses=0;this.currentTime=0;this.duration=src===clip.src?clipDurationMs/1000:4.824;audios.push(this);}
    play(){if(delayed)return new Promise(resolve=>{this.resolvePlay=resolve;});this.onplaying?.();}
    pause(){this.pauses++;} removeAttribute(){} load(){}
  }
  const local={cancels:0,getState:()=>({ready:true,supported:true,unlocked:true}),load:()=>Promise.resolve(),
    speak(text,options){return new Promise(resolve=>jobs.push({text,options,resolve}));},cancel(){this.cancels++;}};
  const controller=createCommentary({AudioCtor:Audio,localSpeech:local,speechSynthesis:null,Utterance:null,
    hugoClips:{audit:clip},selectHugoClip:line=>line.kind==='trend'?(line.demo?HUGO_COMMENTARY_CLIPS.hugo_demo:clip):null,
    now:()=>time,setTimer(fn,delay){const id=++serial;timers.set(id,{at:time+delay,fn});return id;},clearTimer:id=>timers.delete(id)});
  controller.setPace(3000);controller.setPlayback(mode);controller.setEnabled(true);
  function advance(ms){const end=time+ms;for(;;){const next=[...timers].filter(([,t])=>t.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!next)break;timers.delete(next[0]);time=next[1].at;next[1].fn();}time=end;}
  return {controller,audios,jobs,local,advance};
}
const line={kind:'trend',priority:1,id:'audit-actual-duration',text:'A counterattack opened.'};

test('a valid long local waveform cannot be cut by a word-count speech estimate',async()=>{
  const h=harness({mode:'local'});
  try {
    assert.equal(h.controller.reveal(line),true);
    h.jobs[0].options.onPlaying({durationMs:9000});
    h.advance(3000);
    assert.equal(h.local.cancels,0,'three-word text estimate must not stop a known nine-second waveform');
    assert.equal(h.controller.getState().speaking,true);
    h.advance(6000);h.jobs[0].resolve({spoken:true});await Promise.resolve();await Promise.resolve();
    assert.equal(h.controller.getState().speaking,false,'the real playback completion ends the utterance');
  } finally {h.controller.destroy();}
});

test('a recorded waveform remains intact beyond twelve seconds when its real duration is longer',()=>{
  const h=harness({clipDurationMs:14000});
  try {
    assert.equal(h.controller.reveal(line),true);const audio=h.audios[0];
    for(let second=1;second<=13;second++){audio.currentTime=second;h.advance(1000);}
    assert.equal(audio.pauses,0,'a fixed twelve-second watchdog must not truncate a valid fourteen-second clip');
    assert.equal(h.controller.getState().speaking,true);
    audio.currentTime=14;audio.onended();
    assert.equal(h.controller.getState().speaking,false);
  } finally {h.controller.destroy();}
});

test('the demo waits for its first actual Hugo ending rather than chopping it at the five-second cue',()=>{
  const h=harness({delayed:true});
  try {
    assert.equal(h.controller.demo(),true);const audio=h.audios[0];
    const durationMs=HUGO_COMMENTARY_CLIPS.hugo_demo.durationMs;
    assert.ok(durationMs>0,'the real demo recording has measured duration');
    const loadDelay=Math.max(500,5500-durationMs),ended=audio.onended;
    h.advance(loadDelay);audio.onplaying();
    h.advance(5000-loadDelay);
    assert.equal(audio.pauses,0,'measured speech plus load latency must finish after the scheduled5s shot cue');
    assert.equal(h.audios.length,1,'demo shot waits for the sentence boundary');
    h.advance(durationMs+loadDelay-5000);ended();
    assert.equal(h.audios.length,2,'the scheduled demo shot can follow natural Hugo completion');
  } finally {h.controller.destroy();}
});

test('a buffering recording is not cut while its media position keeps progressing',()=>{
  const h=harness({clipDurationMs:14000});
  try {
    h.controller.reveal(line);const audio=h.audios[0];
    for(let i=1;i<=26;i++) {audio.currentTime=i*.5;h.advance(2000);assert.equal(audio.pauses,0);}
    assert.equal(h.controller.getState().speaking,true,'52 wall-clock seconds do not override 13 seconds of real playback');
    audio.currentTime=14;audio.onended();assert.equal(h.controller.getState().speaking,false);
  } finally {h.controller.destroy();}
});
