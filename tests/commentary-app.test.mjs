import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {shortPieceId} from '../dist/match-stats.js';
const source=await readFile(new URL('../dist/app.js',import.meta.url),'utf8');
function section(start,end){const first=source.indexOf(start),last=source.indexOf(end,first+start.length);assert.ok(first>=0&&last>first);return source.slice(first,last);}
const handlers=[section('function syncVoiceover(){','function saveVoicePreference(){'),
 section("$('voiceToggle').addEventListener","$('voiceDemo').addEventListener"),
 section("window.addEventListener('pagehide'","document.addEventListener('visibilitychange'"),
 section("document.addEventListener('visibilitychange'",'\nrender();')].join('\n');
function harness(){
 const listeners=new Map(),elements=new Map(),calls={tests:0,confirmations:0,suspensions:0,resets:0,toasts:[],enabled:[]};
 const element=id=>{if(!elements.has(id))elements.set(id,{disabled:false,hasAttribute:()=>false,addEventListener:(event,fn)=>listeners.set(`${id}:${event}`,fn)});return elements.get(id);};
 const context=vm.createContext({$:element,voiceEnabled:false,voiceActivated:false,voiceLifecycle:'playing',voiceLastCaption:'',voiceLastContext:'',voiceCaptionDemo:false,
  aiPace:3000,paused:false,stage:'playing',dialogOpen:false,replayAutoContinue:false,game:{lastAction:null},
  document:{hidden:false,addEventListener:(event,fn)=>listeners.set(`document:${event}`,fn)},window:{addEventListener:(event,fn)=>listeners.set(`window:${event}`,fn)},
  commentary:{getState:()=>({supported:true}),testVoice(){calls.tests++;return true;},confirmEnabled(){calls.confirmations++;},reset(){calls.resets++;},setPace(){},setEnabled(value){calls.enabled.push(value);},suspend(){calls.suspensions++;}},
  evaluation:{suspend(){}},renderEvaluation(){},renderVoiceover(){},saveVoicePreference(){},advanceClockNow(){},save(){},toast:text=>calls.toasts.push(text)});
 context.anyDialog=()=>context.dialogOpen;vm.runInContext(handlers,context);
 return {context,calls,element,fire(id,event){const fn=listeners.get(`${id}:${event}`);assert.equal(typeof fn,'function');fn();}};
}
test('explicit Test Adam enables audio and plays one test without a model load',()=>{
 const h=harness();assert.equal(h.calls.tests,0);h.fire('voiceTest','click');assert.equal(h.calls.tests,1);assert.equal(h.context.voiceEnabled,true);assert.equal(h.context.voiceActivated,true);
});
test('the commentary toggle retains explicit On and Off behavior',()=>{
 const h=harness();h.fire('voiceToggle','click');assert.equal(h.context.voiceEnabled,true);assert.equal(h.calls.confirmations,1);
 h.fire('voiceToggle','click');assert.equal(h.context.voiceEnabled,false);assert.equal(h.calls.confirmations,1);assert.equal(h.calls.enabled.at(-1),false);
});
test('switching away from relaxed pace mutes and returning does not automatically re-enable',()=>{
 const h=harness();h.fire('voiceToggle','click');h.context.aiPace=1800;h.context.syncVoiceover();assert.equal(h.context.voiceEnabled,false);
 h.context.aiPace=3000;h.context.syncVoiceover();assert.equal(h.context.voiceEnabled,false);
});
test('voice testing is blocked by the pace and an open dialog',()=>{
 const h=harness();h.context.aiPace=600;h.fire('voiceTest','click');assert.equal(h.calls.tests,0);
 h.context.aiPace=3000;h.context.dialogOpen=true;h.fire('voiceTest','click');assert.equal(h.calls.tests,0);
});
test('pause and page hiding still suspend commentary',()=>{
 const h=harness();h.fire('voiceToggle','click');const before=h.calls.suspensions;
 h.context.paused=true;h.context.syncVoiceover();assert.ok(h.calls.suspensions>before);
 h.context.document.hidden=true;h.fire('document','visibilitychange');assert.equal(h.calls.enabled.at(-1),false);
});

test('analysis context names the assessed team and stable piece without changing the spoken caption', () => {
  const context=vm.createContext({TEAM:{white:'Ivory FC',black:'Obsidian FC'},shortPieceId});
  vm.runInContext(section('function commentaryContext(event){','function renderVoiceover(){'),context);
  assert.equal(context.commentaryContext({team:'black',clipKey:'performance_progress_rook',tactical:{pieceId:'black-R2'}}),
    'Obsidian FC · R2 · Player performance');
  assert.equal(context.commentaryContext({team:'white',clipKey:'shape_compact',tactical:{}}),'Ivory FC · Team shape');
  assert.equal(context.commentaryContext({team:null,clipKey:'shape_midfield_crowded',tactical:{centralPlayers:10}}),'Both teams · Crowded midfield · 10 central players');
  assert.equal(context.commentaryContext({team:'black',clipKey:'shape_high_line_black',tactical:{label:'Obsidian high line'}}),'Obsidian FC · Obsidian high line');
  assert.equal(context.commentaryContext({team:'black',clipKey:'tactic_counter',tactical:{}}),'Obsidian FC · Counterattack');
  assert.equal(context.commentaryContext({team:'white',clipKey:'tactic_control',tactical:{}}),'Ivory FC · Midfield control');
  assert.equal(context.commentaryContext({team:'black',clipKey:'tactic_pawn_trap',tactical:{pieceId:'black-P1'}}),'Obsidian FC · P1 · Pawn pressing trap');
  assert.equal(context.commentaryContext({team:'white',clipKey:'tactic_file_attack',tactical:{}}),'Ivory FC · Cleared shooting lane');
  assert.equal(context.commentaryContext({team:'black',clipKey:'stat_shots_black_7',statsCommentary:{shots:7,onTarget:3,possessionPercent:62.46}}),
    'Obsidian FC · Possession 62.5% · Shots 7 · On target 3');
  assert.equal(context.commentaryContext({kind:'goal',team:'black'}),'');
  assert.equal(context.commentaryContext({team:'invalid',clipKey:'shape_wide',tactical:{}}),'');
});
