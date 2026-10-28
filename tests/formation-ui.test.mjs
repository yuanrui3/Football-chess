import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {
  createGame, normalizeGame, FORMATION_PRESETS, setStartingFormation,
  BOARD_WIDTH as W, BOARD_HEIGHT as H, MIDFIELD_RANK, CENTRAL_GOAL_FILES,
  inOwnBox, canOccupySquare,
} from '../dist/engine.js';

const source=readFileSync(new URL('../dist/app.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../dist/index.html',import.meta.url),'utf8');
const plain=value=>JSON.parse(JSON.stringify(value));
function section(start,end){
  const first=source.indexOf(start),last=source.indexOf(end,first+start.length);
  assert.ok(first>=0&&last>first,`real production section: ${start}`);
  return source.slice(first,last);
}
const helpers=section('function startingFormations(){',"$('aiPace').addEventListener('change'");
const controls=source.split('\n').find(line=>line.startsWith("for(const team of ['white','black'])$(team+'Formation').addEventListener('change'"));
const boardHandler=section("$('board').addEventListener('click'","$('cornerTakerList').addEventListener('click'");
const setupMoves=section('function setupMoves(piece){','function getTargets(){');
const newMatch=section('function newMatch(){',"$('newBtn').addEventListener('click'");
function harness({mode='watch',stage='setup',game=createGame({mode,seed:101})}={}){
  const elements=new Map(),listeners=new Map(),calls=[],saved=[];
  const element=id=>{
    if(!elements.has(id))elements.set(id,{
      value:'',disabled:false,textContent:'',dataset:{},
      addEventListener(event,callback){listeners.set(`${id}:${event}`,callback);},
    });
    return elements.get(id);
  };
  element('mode').value=mode;element('duration').value='10';element('kickoff').value=game.attack;
  const context=vm.createContext({
    game:plain(game),stage,duration:10,remaining:600,foulsEnabled:true,paused:false,
    selectedId:null,lastComputerAction:null,freePawnMode:false,dribbleMode:false,passRunSelected:false,
    history:[],lastGoalReplay:null,replayAutoContinue:false,replayPendingResult:false,
    evaluation:{reset(){}},
    $:element,FORMATION_PRESETS,setStartingFormation,createGame,W,H,MIDFIELD_RANK,CENTRAL_GOAL_FILES,inOwnBox,canOccupySquare,
    resetVoiceover:()=>calls.push('voice'),cancelAI:()=>calls.push('cancelAI'),cancelShotFlight:()=>calls.push('cancelShot'),
    replayPlayer:{stop:()=>calls.push('stopReplay')},resetClock:()=>calls.push('clock'),
    createMatchStats:()=>({fresh:true}),render(){context.renderFormationSetup();calls.push('render');},
    save(){saved.push(plain(context.game));},toast:message=>calls.push(message),
    getTargets(){const selected=context.game.pieces.find(piece=>piece.id===context.selectedId);return context.setupMoves(selected);},
    document:{querySelectorAll:()=>[]},
  });
  vm.runInContext([helpers,controls,setupMoves,boardHandler,newMatch].join('\n'),context);
  const change=(team,preset)=>{element(team+'Formation').value=preset;listeners.get(team+'Formation:change')();};
  const click=(x,y)=>listeners.get('board:click')({target:{closest:()=>({dataset:{x:String(x),y:String(y)}})}});
  context.renderFormationSetup();
  return{context,element,calls,saved,change,click};
}

test('both teams have accessible independent three-way choices defaulting to Neutral',()=>{
  for(const team of ['white','black']){
    const select=html.match(new RegExp(`<select id="${team}Formation"[^>]*>(.*?)</select>`,'s'));
    assert.ok(select);assert.match(select[0],new RegExp(`aria-describedby="${team}FormationHelp"`));
    assert.deepEqual([...select[1].matchAll(/<option value="([^"]+)"/g)].map(match=>match[1]),['aggressive','neutral','defensive']);
    assert.match(select[1],/<option value="neutral" selected>/);
    assert.match(html,new RegExp(`<label[^>]*for="${team}Formation"`));
  }
  assert.match(html,/Changing a setup resets only that team/);
  assert.match(html,/After a goal each side returns to its selected preset/);
});

for(const mode of ['solo','local','watch'])test(`${mode}: changing one team's preset preserves the other team's manual placement`,()=>{
  const h=harness({mode});
  for(const team of ['white','black']){
    const other=team==='white'?'black':'white';
    const custom=h.context.game.pieces.find(piece=>piece.id===other+'-B1');
    custom.x=other==='white'?0:13;custom.y=other==='white'?14:2;
    const untouched=plain(h.context.game.pieces.filter(piece=>piece.team===other));
    const seed=h.context.game.randomState;
    h.change(team,'aggressive');
    assert.equal(h.context.game.formations[team],'aggressive');
    assert.deepEqual(plain(h.context.game.pieces.filter(piece=>piece.team===other)),untouched);
    assert.equal(h.context.game.randomState,seed,'choosing a setup does not consume outcome randomness');
    assert.equal(h.element(team+'Formation').value,'aggressive');
    assert.ok(h.saved.length>0);assert.equal(h.saved.at(-1).formations[team],'aggressive');
  }
});

test('a preset remains manually editable through the existing board setup handler',()=>{
  const h=harness({mode:'local'});h.change('white','aggressive');
  const piece=h.context.game.pieces.find(piece=>piece.id==='white-B1');
  h.click(piece.x,piece.y);
  assert.equal(h.context.selectedId,piece.id);
  h.click(0,14);
  assert.deepEqual([piece.x,piece.y],[0,14]);
  assert.equal(h.context.selectedId,null);
  assert.equal(h.context.game.formations.white,'aggressive','manual edits retain the selected post-goal template');
  const saved=plain(h.saved.at(-1));
  assert.deepEqual([saved.pieces.find(p=>p.id===piece.id).x,saved.pieces.find(p=>p.id===piece.id).y],[0,14]);
  const loaded=harness({game:normalizeGame(saved),mode:'local'});
  assert.equal(loaded.element('whiteFormation').value,'aggressive');
  assert.deepEqual(plain(loaded.context.game.pieces),saved.pieces,'restoring the selector cannot reapply its template over custom squares');
});

for(const stage of ['playing','finished'])test(`preset controls are locked during ${stage} and cannot rearrange the board`,()=>{
  const game=createGame({mode:'watch',formations:{white:'defensive',black:'aggressive'},seed:23});
  const h=harness({game,stage}),before=plain(h.context.game);
  assert.equal(h.element('whiteFormation').disabled,true);assert.equal(h.element('blackFormation').disabled,true);
  h.change('white','aggressive');
  assert.deepEqual(plain(h.context.game),before);assert.equal(h.element('whiteFormation').value,'defensive');
  assert.equal(h.saved.length,0);
});

test('new match and kickoff/mode refresh retain independently selected presets',()=>{
  const h=harness();h.change('white','defensive');h.change('black','aggressive');
  h.element('kickoff').value='black';h.context.refreshSetup();
  assert.deepEqual(plain(h.context.game.formations),{white:'defensive',black:'aggressive'});
  assert.equal(h.context.game.attack,'black');
  h.context.stage='finished';h.context.newMatch();
  assert.equal(h.context.stage,'setup');
  assert.deepEqual(plain(h.context.game.formations),{white:'defensive',black:'aggressive'});
  assert.equal(h.element('whiteFormation').disabled,false);assert.equal(h.element('blackFormation').value,'aggressive');
});

test('legacy state without preset names renders Neutral without changing valid custom coordinates',()=>{
  const game=createGame({mode:'local',seed:4});delete game.formations;
  game.pieces.find(piece=>piece.id==='white-R1').x=0;
  const h=harness({game,mode:'local'}),before=plain(h.context.game);
  assert.equal(h.element('whiteFormation').value,'neutral');assert.equal(h.element('blackFormation').value,'neutral');
  assert.deepEqual(plain(h.context.game),before);
});

test('help explains strengths and tradeoffs from the selected preset metadata',()=>{
  const h=harness();h.change('white','defensive');
  const help=h.element('whiteFormationHelp').textContent;
  assert.ok(help.includes(FORMATION_PRESETS.defensive.strength));
  assert.ok(help.includes(FORMATION_PRESETS.defensive.tradeoff));
  assert.match(help,/Strength:.*Tradeoff:/);
  assert.match(source,/renderFormationSetup\(\);/);
});
