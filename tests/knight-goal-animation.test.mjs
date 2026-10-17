import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {E,fixture,other} from './helpers/shot-fixture.mjs';
import {buildGoalReplay,restoreGoalReplay} from '../dist/goal-replay.js';

const {BOARD_WIDTH:W,BOARD_HEIGHT:H,GOAL_FILES}=E;
const source=await readFile(new URL('../dist/app.js',import.meta.url),'utf8');
const css=await readFile(new URL('../dist/style.css',import.meta.url),'utf8');
const surround=Number(css.match(/\.board-surround\{[^}]*border:(\d+)px/)?.[1]);
const netHeight=Number([...css.matchAll(/\.goal-wrap\{[^}]*height:(\d+)px/g)].at(-1)?.[1]);
const netDivisor=Number(css.match(/\.goal-wrap\{[^}]*width:calc\(\(100% - 16px\)\/([\d.]+)\)/)?.[1]);
const plain=value=>JSON.parse(JSON.stringify(value));
function section(start,end){
  const from=source.indexOf(start),until=source.indexOf(end,from);
  assert.ok(from>=0&&until>from,`Production section exists: ${start}`);
  return source.slice(from,until);
}
class Element{
  constructor(){this.dataset={};this.style={};this.children=[];this.classes=new Set();this.classList={add:name=>this.classes.add(name),remove:(...names)=>names.forEach(name=>this.classes.delete(name)),toggle:(name,on)=>on?this.classes.add(name):this.classes.delete(name)};}
  append(...nodes){this.children.push(...nodes);}
  setAttribute(name,value){this[name]=String(value);}
  querySelectorAll(){return this.children;}
  querySelector(selector){return selector==='.goal-odds'?this.odds:null;}
  animate(frames,options){this.frames=frames;this.animationOptions=options;return {finished:Promise.resolve()};}
}
function liveFlight(before,after,{flipped=false,reduced=false}={}){
  const pitch=new Element(),area=new Element(),rows={goalTop:new Element(),goalBottom:new Element()};
  for(const row of Object.values(rows))for(const x of GOAL_FILES){const cell=new Element();cell.dataset.goalX=String(x);cell.odds={textContent:''};row.append(cell);}
  const context=vm.createContext({structuredClone,GOAL_FILES,W,H,flipped,shotFlightGeneration:0,shotFlight:null,ballSVG:'ball',
    game:after,shot:null,targets:[],disguiseTargets:[],previewShots:[],FILES:E.FILE_LABELS,
    window:{matchMedia:()=>({matches:reduced})},document:{createElement:()=>new Element(),body:{classList:{add(){}}},querySelector:()=>area},
    $:id=>id==='pitch'?pitch:rows[id],shotChance:()=>0,shotBlockLabel:()=>'',percent:String,currentTeam:E.currentTeam,render(){},save(){},announceShotImpact(){}});
  // Exercise the same orientation and target highlighting as the live board.
  vm.runInContext(section('  const topY=flipped?H:-1,bottomY=flipped?-1:H;','  const showOffside='),context);
  vm.runInContext(section('function resolvedShotAction(','function cancelShotFlight(')+section('function beginShotFlight(','\nfunction completeCommittedAction')+'\nglobalThis.begin=beginShotFlight;',context);
  assert.equal(context.begin(before,after,()=>{},()=>{},null,null),true);
  const highlight=section("  for(const id of ['goalTop','goalBottom'])for(const goal of $(id).children){",'  syncShotFlightPlayback();');
  vm.runInContext('function highlight(){const flight=shotFlight;'+highlight+'}\nhighlight();',context);
  return {flight:plain(context.shotFlight),ball:pitch.children[0].children[0],rows};
}
function knightGoal({team,kind}){
  const ownGoal=kind==='own goal',disguised=kind==='disguised';
  const origin=ownGoal?[4,H-2]:kind==='wing lob'?[3,0]:disguised?[6,1]:[4,1];
  const state=fixture({team,type:'N',origin}),scoringTeam=ownGoal?other(team):team;
  const targets=E.legalKicks(state).filter(kick=>kick.goal===scoringTeam).sort((a,b)=>a.x-b.x);
  assert.equal(targets.length,disguised?2:1,'fixture uses only native legal knight goal files');
  const before=E.applyKick(state,targets[0].x,targets[0].y,{disguise:disguised});
  assert.equal(before.phase,'keeperReact');
  const after=E.skipMove(before,{roll:0,targetRoll:.99});
  assert.equal(after.lastAction.type,'goal');
  if(disguised)assert.notEqual(after.lastAction.goalTarget.x,before.pendingShot.x,'the resolved file differs from the declaration');
  const replay=buildGoalReplay([{game:state},{game:before}],before,after);assert.ok(replay);
  return {before,after,replay};
}

for(const team of ['white','black'])for(const kind of ['native jump','wing lob','disguised','own goal'])for(const flipped of [false,true]){
  test(`${team} knight ${kind}: live flight and replay follow the actual goal file${flipped?' with the board rotated':''}`,()=>{
    const {before,after,replay}=knightGoal({team,kind}),snapshot=JSON.stringify({before,after}),action=after.lastAction;
    const {flight,ball,rows}=liveFlight(before,after,{flipped});
    const final=restoreGoalReplay(JSON.parse(JSON.stringify(replay))).frames.at(-1);
    assert.deepEqual(flight.points,action.path,'live flight follows the recorded native jump without an invented goal-line bend');
    assert.deepEqual(flight.points,final.action.path,'live flight and replay use the same resolved trajectory');
    assert.deepEqual(flight.goalTarget,action.goalTarget);
    assert.deepEqual(flight.points.at(-1),{x:final.ball.x,y:final.ball.y});
    const x=action.goalTarget.x,y=action.goalTarget.y;
    assert.equal(flight.element.dataset.toX,String(x));assert.equal(flight.element.dataset.toY,String(y));
    assert.equal(ball.frames.at(-1).left,`${(x+.5)/W*100}%`);assert.equal(ball.frames.at(-1).top,`${(y+.5)/H*100}%`);
    const goalRow=(y===-1)!==flipped?rows.goalTop:rows.goalBottom;
    const selected=Object.values(rows).flatMap(row=>row.children).filter(cell=>cell.classes.has('shot-selected'));
    assert.equal(selected.length,1);assert.equal(Number(selected[0].dataset.goalX),x);assert.equal(Number(selected[0].dataset.goalY),y);
    assert.ok(goalRow.children.includes(selected[0]));assert.equal(goalRow.style.flexDirection,flipped?'row-reverse':'row');
    const displayed=flipped?[...goalRow.children].reverse():goalRow.children;
    const screenFile=GOAL_FILES[0]+displayed.indexOf(selected[0]);
    assert.equal(screenFile,flipped?W-1-x:x,'rotated ball endpoint and visible goal column agree');
    // The net has fixed CSS depth, while flight coordinates scale with the
    // pitch. Check the actual final keyframe against responsive net bounds.
    assert.ok(surround>0&&netHeight>0&&netDivisor>0);
    for(const areaWidth of [280,410,600])for(const padding of [0,5]){
      const contentWidth=areaWidth-2*padding,pitchWidth=contentWidth-2*surround,pitchHeight=pitchWidth*H/W;
      const ballX=parseFloat(ball.frames.at(-1).left)/100,ballY=parseFloat(ball.frames.at(-1).top)/100;
      const screenX=surround+(flipped?1-ballX:ballX)*pitchWidth,screenY=flipped?1-ballY:ballY;
      const depth=(goalRow===rows.goalTop?-screenY:screenY-1)*pitchHeight-surround;
      const netWidth=pitchWidth/netDivisor,slotWidth=netWidth/GOAL_FILES.length;
      const slotLeft=(contentWidth-netWidth)/2+displayed.indexOf(selected[0])*slotWidth;
      assert.ok(screenX>slotLeft&&screenX<slotLeft+slotWidth,'ball finishes inside the actual goal file');
      assert.ok(depth>0&&depth<netHeight,'ball finishes inside the fixed-depth visible net');
    }
    const reduced=liveFlight(before,after,{flipped,reduced:true}).ball;
    assert.equal(reduced.style.left,ball.frames.at(-1).left);assert.equal(reduced.style.top,ball.frames.at(-1).top);
    assert.equal(JSON.stringify({before,after}),snapshot,'presentation does not modify the engine result');
  });
}
