import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const source=await readFile(new URL('../dist/app.js',import.meta.url),'utf8');
test('live keeper-spill animation reaches the loose landing and keeps the ball visible',()=>{
  const start=source.indexOf('function beginShotFlight('),end=source.indexOf('\nfunction completeCommittedAction',start);
  assert.ok(start>0&&end>start);
  const element=()=>({dataset:{},style:{},children:[],append(...nodes){this.children.push(...nodes);},setAttribute(name,value){this[name]=value;}});
  const context=vm.createContext({structuredClone,GOAL_FILES:[5,6,7,8],W:14,H:17,shotFlightGeneration:0,shotFlight:null,ballSVG:'ball',
    resolvedShotAction:(_before,after)=>after.lastAction,window:{matchMedia:()=>({matches:true})},
    document:{createElement:element,body:{classList:{add(){}}}},$:()=>({append(){}}),render(){},save(){},announceShotImpact(){}});
  vm.runInContext(source.slice(start,end)+'\nglobalThis.begin=beginShotFlight;',context);
  const before={score:{white:0,black:0},log:[],pieces:[{id:'white-R1',team:'white',type:'R',x:6,y:5},{id:'black-K',team:'black',type:'K',x:7,y:0}],pendingShot:{x:6,y:-1,from:{x:6,y:5},shootingTeam:'white',defendingTeam:'black',shooterId:'white-R1'}};
  const landing={x:9,y:3},keeper={x:7,y:0},after={lastAction:{type:'save',outcome:'loose',keeperRebound:true,keeperId:'black-K',from:before.pendingShot.from,to:landing,reboundLanding:landing,shotModel:{target:{x:6,y:-.5},keeperPosition:keeper,closestPoint:{x:6,y:0}}}};
  assert.equal(context.begin(before,after,()=>{},()=>{},null,null),true);
  const flight=JSON.parse(JSON.stringify(context.shotFlight));
  assert.deepEqual(flight.points.at(-1),landing);assert.deepEqual(flight.points.at(-2),keeper);
  assert.match(flight.outcomeCaption,/loose ball/i);assert.doesNotMatch(flight.outcomeCaption,/catch|corner/i);
  assert.equal(flight.element.dataset.toX,'9');assert.equal(flight.element.dataset.toY,'3');
  assert.equal(flight.element.children[0].style.left,`${(landing.x+.5)/14*100}%`);
  assert.equal(flight.element.children[0].style.top,`${(landing.y+.5)/17*100}%`);
});

test('shot breakdown exposes loose rebounds separately from catches and corners',()=>{
  const start=source.indexOf('function outcomeBreakdown('),end=source.indexOf('\nfunction shotGeometry',start);
  assert.ok(start>0&&end>start);
  const context=vm.createContext({shotPercent:p=>`${Math.round(p*100)}%`});
  vm.runInContext(source.slice(start,end)+'\nglobalThis.describe=outcomeBreakdown;',context);
  const text=context.describe({goalProbability:.2,caughtSaveProbability:.3,keeperReboundProbability:.04,cornerProbability:.16,blockPossessionProbability:.05,blockOutProbability:.1,blockCornerProbability:.1,missProbability:.25});
  assert.match(text,/Loose rebound 4\.0%/);assert.match(text,/Catch 30\.0%/);assert.match(text,/Corner 16\.0%/);
});
