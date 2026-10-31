import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {createMatchStats,matchStatsSummary,shortPieceId} from '../dist/match-stats.js';

const source=await readFile(new URL('../dist/app.js',import.meta.url),'utf8');
const html=await readFile(new URL('../dist/index.html',import.meta.url),'utf8');
function section(start,end){
  const first=source.indexOf(start),last=source.indexOf(end,first+start.length);
  assert.ok(first>=0&&last>first,`source section exists: ${start}`);
  return source.slice(first,last);
}
const code=[
  section("$('pauseBtn').addEventListener('click'","$('undoBtn').addEventListener('click'"),
  section('function pauseStatsSnapshot(){','function renderMatchStats('),
  section("for(const el of document.querySelectorAll('[data-close]'))","setInterval(()=>{advanceClockNow();},250);"),
].join('\n');
function fixture(){
  const stats=createMatchStats();
  Object.assign(stats.teams.white,{shots:7,onTarget:3,corners:2,fouls:4,yellowCards:1,redCards:0,possessionMs:30000});
  Object.assign(stats.teams.black,{shots:5,onTarget:2,corners:1,fouls:2,yellowCards:2,redCards:1,possessionMs:10000});
  stats.goals=[
    {team:'white',scorerId:'white-R1',assistId:'white-B2',ownGoal:false,turn:4,matchSeconds:64,origin:null,target:null,distance:null},
    {team:'black',scorerId:'white-P3',assistId:null,ownGoal:true,turn:8,matchSeconds:124,origin:null,target:null,distance:null},
  ];
  return stats;
}
function harness({paused=false,shotFlight=null,stage='playing',stats=fixture(),history=[]}={}){
  const elements=new Map(),listeners=new Map(),calls=[];
  const element=id=>{
    if(!elements.has(id))elements.set(id,{
      id,open:false,hidden:false,textContent:'',innerHTML:'',dataset:{},
      addEventListener(event,fn){listeners.set(`${id}:${event}`,fn);},
      showModal(){calls.push(`show:${id}`);this.open=true;},
      close(){calls.push(`close:${id}`);this.open=false;listeners.get(`${id}:close`)?.();},
      getBoundingClientRect:()=>({left:0,right:500,top:0,bottom:500}),
    });
    return elements.get(id);
  };
  const dialog=element('pauseStatsDialog'),keep=element('pauseStatsKeepBtn'),close=element('pauseStatsCloseBtn');
  keep.dataset.close=close.dataset.close='pauseStatsDialog';
  const context=vm.createContext({
    $:element,paused,shotFlight,stage,matchStats:stats,history,remaining:436.4,duration:10,lastTick:123,
    game:{score:{white:1,black:1},phase:'attackMove'},TEAM:{white:'Ivory FC',black:'Obsidian FC'},
    matchStatsSummary,shortPieceId,voiceEnabled:true,voiceActivated:false,
    Date:{now:()=>1000},deadlineExpired:false,
    commentary:{getState:()=>({demo:false}),confirmEnabled:()=>calls.push('confirm')},
    resetVoiceover:()=>calls.push('resetVoice'),
    activateVoiceover(){context.voiceActivated=true;calls.push('activate');},
    advanceClockNow(){calls.push(`advance:${context.paused}`);return context.deadlineExpired;},
    render(){calls.push(`render:${context.paused}`);},save:()=>calls.push('save'),
    syncVoiceover:()=>calls.push(`voice:${context.paused}`),
    syncShotFlightPlayback:()=>calls.push(`flight:${context.paused}`),
    cancelAI:()=>calls.push('cancelAI'),updateClock:()=>calls.push('clock'),
    document:{querySelectorAll:selector=>selector==='[data-close]'?[keep,close]:selector==='dialog'?[dialog]:[]},
  });
  vm.runInContext(code,context,{filename:'real-pause-stats-handlers.js'});
  const fire=(id,event='click')=>{const fn=listeners.get(`${id}:${event}`);assert.equal(typeof fn,'function');fn({target:element(id),clientX:100,clientY:100});};
  return {context,element,dialog,calls,fire};
}

test('Pause opens current stats after settling the clock and freezes play without changing the match',()=>{
  const h=harness(),before=JSON.stringify({game:h.context.game,stats:h.context.matchStats});
  h.fire('pauseBtn');
  assert.equal(h.context.paused,true);assert.equal(h.dialog.open,true);
  assert.equal(h.context.stage,'playing');assert.equal(h.context.remaining,436.4);
  assert.equal(h.calls[0],'advance:false');
  assert.ok(h.calls.includes('voice:true'));assert.ok(h.calls.includes('flight:true'));assert.ok(h.calls.includes('cancelAI'));
  assert.equal(h.element('pauseStatsScore').textContent,'1 : 1');assert.equal(h.element('pauseStatsClock').textContent,'7:17 remaining');
  assert.match(h.element('pauseStatsRows').innerHTML,/<td>7<\/td><th scope="row">Shots<\/th><td>5<\/td>/);
  assert.match(h.element('pauseStatsRows').innerHTML,/<td>3<\/td><th scope="row">On target<\/th><td>2<\/td>/);
  assert.match(h.element('pauseStatsRows').innerHTML,/<td>2<\/td><th scope="row">Corners<\/th><td>1<\/td>/);
  assert.match(h.element('pauseStatsRows').innerHTML,/<td>75%<\/td><th scope="row">Possession<\/th><td>25%<\/td>/);
  assert.match(h.element('pauseStatsRows').innerHTML,/Yellow cards/);assert.match(h.element('pauseStatsRows').innerHTML,/Red cards/);
  assert.doesNotMatch(h.element('pauseStatsRows').innerHTML,/accuracy/i);
  assert.equal(JSON.stringify({game:h.context.game,stats:h.context.matchStats}),before,'opening stats cannot mutate records or finish play');
});

test('current scorer and assist IDs stay distinct and own goals retain their credited side',()=>{
  const h=harness();h.fire('pauseBtn');
  assert.match(h.element('pauseStatsScorers').innerHTML,/Ivory FC · <b>R1<\/b>/);
  assert.doesNotMatch(h.element('pauseStatsScorers').innerHTML,/P3/);
  assert.match(h.element('pauseStatsAssists').innerHTML,/Ivory FC · <b>B2<\/b>/);
  assert.match(h.element('pauseStatsGoalLog').innerHTML,/Obsidian FC · P3 \(own goal\)/);
  assert.match(h.element('pauseStatsGoalLog').innerHTML,/By Ivory FC/);
  assert.match(h.element('pauseStatsGoalLog').innerHTML,/Assist: B2/);
});

for(const id of ['pauseStatsKeepBtn','pauseStatsCloseBtn'])test(`${id} closes stats and retains the paused board`,()=>{
  const h=harness();h.fire('pauseBtn');h.calls.length=0;h.fire(id);
  assert.equal(h.dialog.open,false);assert.equal(h.context.paused,true);assert.equal(h.context.stage,'playing');
  assert.deepEqual(h.calls,['close:pauseStatsDialog','render:true']);
});

test('native dialog close, including Escape, keeps the game paused',()=>{
  const h=harness();h.fire('pauseBtn');h.dialog.close();
  assert.equal(h.context.paused,true);assert.equal(h.context.lastTick,1000);assert.equal(h.context.stage,'playing');
  assert.equal(/id="pauseStatsDialog"[^>]*onclose=/.test(html),false);
});

for(const control of ['pauseStatsResumeBtn','pauseBtn'])test(`${control} resumes once and closes paused stats without resetting clocks or score`,()=>{
  const h=harness();h.fire('pauseBtn');const before=JSON.stringify(h.context.game);h.calls.length=0;
  h.fire(control);
  assert.equal(h.context.paused,false);assert.equal(h.dialog.open,false);assert.equal(h.context.stage,'playing');
  assert.equal(h.context.remaining,436.4);assert.equal(h.context.lastTick,1000);assert.equal(JSON.stringify(h.context.game),before);
  assert.ok(h.calls.includes('activate'));assert.ok(h.calls.includes('render:false'));assert.equal(h.calls.filter(x=>x==='confirm').length,1);
});

test('stats refresh on every subsequent pause and can display partial or untimed records',()=>{
  const h=harness();h.fire('pauseBtn');h.fire('pauseStatsResumeBtn');
  h.context.matchStats.teams.white.shots=9;h.context.matchStats.partial=true;h.context.matchStats.baselineScore.white=2;h.context.duration=0;
  h.fire('pauseBtn');
  assert.match(h.element('pauseStatsRows').innerHTML,/<td>9<\/td><th scope="row">Shots/);
  assert.equal(h.element('pauseStatsClock').textContent,'Untimed match');assert.equal(h.element('pauseStatsPartial').hidden,false);
  assert.match(h.element('pauseStatsPartial').textContent,/2 earlier goals have no recorded scorer/);
});

test('pausing an unrevealed flying shot does not reveal its committed goal or stats early',()=>{
  const before=createMatchStats();before.teams.white.shots=1;
  const h=harness({stage:'finished',shotFlight:{revealed:false,score:{white:0,black:0}},history:[{matchStats:before}]});
  h.fire('pauseBtn');
  assert.equal(h.context.paused,true);assert.equal(h.dialog.open,true);assert.equal(h.element('pauseStatsScore').textContent,'0 : 0');
  assert.match(h.element('pauseStatsRows').innerHTML,/<td>1<\/td><th scope="row">Shots/);
  assert.doesNotMatch(h.element('pauseStatsGoalLog').innerHTML,/R1|P3/);assert.equal(h.element('pauseStatsShotNote').hidden,false);
  h.fire('pauseStatsResumeBtn');assert.equal(h.context.paused,false);assert.equal(h.context.stage,'finished','resuming an animation never starts a new match');
  h.context.shotFlight.revealed=true;h.fire('pauseBtn');assert.equal(h.element('pauseStatsScore').textContent,'1 : 1');
});

test('setup, finished matches and expiring actions do not open a false pause panel',()=>{
  for(const stage of ['setup','finished']){const h=harness({stage});h.fire('pauseBtn');assert.equal(h.dialog.open,false);assert.equal(h.context.paused,false);}
  const h=harness();h.context.deadlineExpired=true;h.fire('pauseBtn');assert.equal(h.dialog.open,false);assert.equal(h.context.paused,false);
});

test('pause stats markup has unique IDs and clear close/resume controls',()=>{
  const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
  assert.equal(new Set(ids).size,ids.length);
  assert.match(html,/<h2 id="pauseStatsTitle">Match paused<\/h2>/);
  assert.match(html,/aria-label="Close stats and keep match paused"/);
  assert.match(html,/id="pauseStatsResumeBtn">Resume match/);
  assert.match(html,/data-close="pauseStatsDialog">Keep paused/);
});
