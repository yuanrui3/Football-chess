import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../dist/engine.js';
import {createCommentary} from '../dist/commentary.js';
import {COMMENTARY_CLIPS} from '../dist/commentary-clips.js';
import {STAT_COMMENTARY_SCRIPTS,commentaryStatsLines} from '../dist/commentary-stats.js';

function position() {
  const s=E.createGame({mode:'watch',seed:93,foulsEnabled:false});
  const places={'white-K':[6,16],'black-K':[7,0],'white-Q':[6,4],'white-R1':[6,6],'black-R2':[12,3]};
  s.pieces=s.pieces.filter(p=>places[p.id]).map(p=>({...p,x:places[p.id][0],y:places[p.id][1]}));
  Object.assign(s,{attack:'white',phase:'kick',turn:1,ball:{x:6,y:4,carrierId:'white-Q'},
    restart:null,pendingShot:null,lastAction:null,offside:null,passRun:null,paceControl:null,
    looseBallKickOrigin:null,positionBudget:{normalUsed:false,pawnUsed:false,dribbleUsed:false},
    ballProgress:{team:'white',anchorY:4,rounds:0,pendingRelease:false,excludeRelease:false}});
  return s;
}
function summary({whiteShots=0,blackShots=0,whitePossession=62.4,totalMs=100000,partial=false}={}) {
  const whiteMs=totalMs*whitePossession/100,blackMs=totalMs-whiteMs;
  return {partial,goals:[],teams:{
    white:{shots:whiteShots,onTarget:Math.min(2,whiteShots),possessionMs:whiteMs,
      possessionPercent:totalMs?whiteMs/totalMs*100:null},
    black:{shots:blackShots,onTarget:Math.min(2,blackShots),possessionMs:blackMs,
      possessionPercent:totalMs?blackMs/totalMs*100:null}}};
}
const statClips=Object.fromEntries(Object.entries(STAT_COMMENTARY_SCRIPTS).map(([key,script])=>[key,
  {key,...script,src:`/qa-stat/${key}.mp3`,snapshot:true,voice:'Hugo',ready:true,durationMs:4800}]));
function harness({pendingAudio=false}={}) {
  let time=0,serial=0;
  const audios=[],captions=[],timers=new Map();
  const local={loads:0,speaks:0,getState:()=>({ready:true,supported:true,status:'ready'}),
    load(){this.loads++;return Promise.resolve();},speak(){this.speaks++;return Promise.resolve({spoken:false});},cancel(){}};
  class Audio {
    constructor(src){this.src=src;this.pauses=0;this.duration=4.8;this.currentTime=0;audios.push(this);}
    play(){if(pendingAudio&&this.src.startsWith('/qa-stat/'))return new Promise(resolve=>{this.resolvePlay=resolve;});
      this.onplaying?.();return Promise.resolve();}
    pause(){this.pauses++;}
    removeAttribute(){}
    load(){}
  }
  const controller=createCommentary({AudioCtor:Audio,localSpeech:local,speechSynthesis:null,Utterance:null,
    hugoClips:statClips,selectHugoClip:line=>statClips[line.clipKey]||null,
    onCaption:(text,event)=>captions.push({text,event}),now:()=>time,
    setTimer(fn,delay){const id=++serial;timers.set(id,{at:time+delay,fn});return id;},clearTimer:id=>timers.delete(id)});
  controller.setPace(3000);controller.setPlayback('library');controller.setEnabled(true);
  function advance(ms){const end=time+ms;
    for(;;){const next=[...timers].filter(([,v])=>v.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];
      if(!next)break;timers.delete(next[0]);time=next[1].at;next[1].fn();}time=end;}
  const stats=()=>audios.filter(a=>a.src.startsWith('/qa-stat/'));
  const lastStat=()=>[...captions].reverse().find(c=>c.text&&c.event?.statsCommentary);
  const end=()=>{for(const audio of [...audios])audio.onended?.();};
  return {controller,audios,captions,local,timers,advance,stats,lastStat,end};
}
const flush=async()=>{await Promise.resolve();await Promise.resolve();await Promise.resolve();};
const reaction=(kind)=>({kind,priority:kind==='goal'?4:2,id:`stat-reaction:${kind}`,shot:true,
  text:`Committed ${kind}`,clipKey:kind==='goal'?'goal_generic':'shot_normal'});

for(const team of ['white','black'])test(`${team}: the actual shot total and team are spoken using exact prepared text without model work`,()=>{
  const h=harness(),state=position(),data=summary({whiteShots:team==='white'?7:0,blackShots:team==='black'?7:0,totalMs:0});
  assert.ok(commentaryStatsLines(data,state).some(l=>l.clipKey===`stat_shots_${team}_7`));
  assert.equal(h.controller.tick(state,{stats:data}),true);
  assert.equal(h.stats().length,1);assert.equal(h.stats()[0].src,statClips[`stat_shots_${team}_7`].src);
  const spoken=h.lastStat();assert.equal(spoken.text,STAT_COMMENTARY_SCRIPTS[`stat_shots_${team}_7`].text);
  assert.match(spoken.text,team==='white'?/Ivory have taken seven shots/:/Obsidian have taken seven shots/);
  assert.equal(spoken.event.statsCommentary.shots,7);assert.equal(spoken.event.team,team);
  assert.equal(spoken.event.voice,'Hugo');assert.equal(h.local.loads,0);assert.equal(h.local.speaks,0);
  h.controller.destroy();
});

test('possession speech says about the rounded bucket while preserving exact measured metadata',()=>{
  const h=harness(),state=position(),data=summary({whitePossession:62.4});
  assert.equal(h.controller.tick(state,{stats:data}),true);
  assert.equal(h.stats().length,1);
  const spoken=h.lastStat();assert.equal(spoken.event.clipKey,'stat_possession_white_60');
  assert.equal(spoken.text,'Ivory have had about sixty percent of the ball.');
  assert.equal(spoken.event.statsCommentary.spokenPossessionPercent,60);
  assert.ok(Math.abs(spoken.event.statsCommentary.possessionPercent-62.4)<1e-8);
  assert.equal(h.local.loads,0);assert.equal(h.local.speaks,0);h.controller.destroy();
});

test('one global sixty-second stats cooldown applies across both teams and topics',()=>{
  const h=harness(),state=position();
  h.controller.tick(state,{stats:summary({whiteShots:4,blackShots:0,whitePossession:62.4})});h.end();
  assert.equal(h.stats().length,1);assert.equal(h.lastStat().event.clipKey,'stat_shots_white_4');
  h.advance(12000);h.controller.tick(state,{stats:summary({whiteShots:4,blackShots:6,whitePossession:70})});h.end();
  assert.equal(h.stats().length,1,'a changed opposing count and possession topic still share the global cooldown');
  h.advance(48000);h.controller.tick(state,{stats:summary({whiteShots:4,blackShots:6,whitePossession:70})});h.end();
  assert.equal(h.stats().length,2);assert.equal(h.lastStat().event.clipKey,'stat_possession_white_70');
  h.advance(12000);h.controller.tick(state,{stats:summary({whiteShots:4,blackShots:6,whitePossession:75})});h.end();
  assert.equal(h.stats().length,2,'switching back to the possession topic cannot bypass the same timer');
  h.advance(48000);h.controller.tick(state,{stats:summary({whiteShots:4,blackShots:6,whitePossession:75})});
  assert.equal(h.stats().length,3);assert.equal(h.lastStat().event.clipKey,'stat_shots_black_6');
  h.controller.destroy();
});

test('an unchanged shot total is not repeated after the time cooldown, but a new total can be',()=>{
  const h=harness(),state=position();
  h.controller.tick(state,{stats:summary({whiteShots:4,totalMs:0})});h.end();
  h.advance(61000);h.controller.tick(state,{stats:summary({whiteShots:4,totalMs:0})});h.end();
  assert.equal(h.stats().length,1);
  h.advance(12000);h.controller.tick(state,{stats:summary({whiteShots:5,totalMs:0})});
  assert.equal(h.stats().length,2);assert.equal(h.lastStat().event.clipKey,'stat_shots_white_5');
  h.controller.destroy();
});

test('possession changes within the same spoken bucket are suppressed after cooldown',()=>{
  const h=harness(),state=position();
  h.controller.tick(state,{stats:summary({whitePossession:62.4})});h.end();
  h.advance(61000);h.controller.tick(state,{stats:summary({whitePossession:62.1})});h.end();
  assert.equal(h.stats().length,1,'a tiny change within about sixty percent is not new commentary');
  h.advance(12000);h.controller.tick(state,{stats:summary({whitePossession:67.6})});
  assert.equal(h.stats().length,2);assert.equal(h.lastStat().event.clipKey,'stat_possession_white_70');
  h.controller.destroy();
});

for(const change of ['shot count','possession bucket'])test(`pending prepared stats cannot start after the ${change} changes`,async()=>{
  const h=harness({pendingAudio:true}),state=position();
  const old=change==='shot count'?summary({whiteShots:4,totalMs:0}):summary({whitePossession:62.4});
  const next=change==='shot count'?summary({whiteShots:5,totalMs:0}):summary({whitePossession:64});
  h.controller.tick(state,{stats:old});assert.equal(h.stats().length,1);
  const audio=h.stats()[0],late=audio.onplaying;
  assert.equal(h.controller.getState().audioStatus,'loading');
  h.controller.tick(state,{stats:next,blocked:true});
  late();audio.resolvePlay();await flush();
  assert.ok(audio.pauses>0,'changed statistics must be rejected before the first valid playback start');
  assert.equal(h.controller.getState().speaking,false);h.controller.destroy();
});

test('pending possession remains valid if only the exact value changes within the same spoken bucket',async()=>{
  const h=harness({pendingAudio:true}),state=position();
  h.controller.tick(state,{stats:summary({whitePossession:62.4})});const audio=h.stats()[0];assert.ok(audio);
  h.controller.tick(state,{stats:summary({whitePossession:62.1}),blocked:true});
  audio.onplaying?.();audio.resolvePlay();await flush();
  assert.equal(audio.pauses,0,'the spoken about-sixty-percent observation is still valid');
  assert.equal(h.controller.getState().audioStatus,'playing');h.controller.destroy();
});

for(const stop of ['reset','Off'])test(`${stop} clears statistic history and stops the current clip immediately`,()=>{
  const h=harness(),state=position(),data=summary({whiteShots:4,totalMs:0});
  h.controller.tick(state,{stats:data});const old=h.stats()[0],late=old.onended;assert.ok(old);
  if(stop==='reset')h.controller.reset();else{h.controller.setEnabled(false);h.controller.setEnabled(true);}
  assert.ok(old.pauses>0);late();
  assert.equal(h.controller.getState().speaking,false);
  h.controller.tick(state,{stats:data});assert.equal(h.stats().length,2,'a new activation can report the newly supplied full record');
  h.controller.destroy();
});

test('a started statistics sentence finishes before the latest shot result, with no obsolete attempt afterward',async()=>{
  const h=harness(),state=position();h.controller.tick(state,{stats:summary({whiteShots:7,totalMs:0})});
  const hugo=h.stats()[0],ended=hugo.onended;assert.ok(hugo);
  h.advance(1000);h.controller.reveal(reaction('attempt'));h.controller.reveal(reaction('goal'));
  assert.equal(hugo.pauses,0);assert.equal(h.audios.length,1);
  ended();await flush();
  assert.equal(h.audios.length,2);assert.equal(h.audios[1].src,COMMENTARY_CLIPS.goal_generic.src);
  h.audios[1].onended();await flush();assert.equal(h.audios.length,2);
  h.controller.destroy();
});

test('partial records and possession histories shorter than a minute do not become whole-match stat speech',()=>{
  for(const data of [summary({whiteShots:7,partial:true}),summary({whiteShots:0,totalMs:59000})]){
    const h=harness();h.controller.tick(position(),{stats:data});
    assert.equal(h.stats().length,0);h.controller.destroy();
  }
});


test('possession receives the next reserved stats slot even when both shot totals have increased',()=>{
  const h=harness(),state=position();
  h.controller.tick(state,{stats:summary({whiteShots:7,blackShots:4,whitePossession:62.4})});h.end();
  assert.equal(h.lastStat().event.statsCommentary.type,'shots');
  assert.equal(h.lastStat().event.team,'white');
  h.advance(60000);h.controller.tick(state,{stats:summary({whiteShots:8,blackShots:6,whitePossession:65})});
  const spoken=h.lastStat();
  assert.equal(h.stats().length,2);assert.equal(spoken.event.statsCommentary.type,'possession');
  assert.equal(spoken.text,'Ivory have had about sixty five percent of the ball.');
  h.controller.destroy();
});

test('the next shot-count slot covers the other team instead of always choosing the higher count',()=>{
  const h=harness(),state=position();
  h.controller.tick(state,{stats:summary({whiteShots:7,blackShots:4,whitePossession:62.4})});h.end();
  h.advance(60000);h.controller.tick(state,{stats:summary({whiteShots:8,blackShots:6,whitePossession:65})});h.end();
  h.advance(60000);h.controller.tick(state,{stats:summary({whiteShots:9,blackShots:8,whitePossession:70})});
  const spoken=h.lastStat();
  assert.equal(h.stats().length,3);assert.equal(spoken.event.statsCommentary.type,'shots');
  assert.equal(spoken.event.team,'black');assert.equal(spoken.event.statsCommentary.shots,8);
  assert.equal(spoken.text,'Obsidian have taken eight shots so far.');
  h.controller.destroy();
});
