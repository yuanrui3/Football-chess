import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {E,fixture,point} from './helpers/shot-fixture.mjs';
const source=readFileSync(new URL('../dist/app.js',import.meta.url),'utf8');
const section=(from,to)=>source.slice(source.indexOf(from),source.indexOf(to,source.indexOf(from)+1));
for(const team of ['white','black'])test(`${team}: own-goal preview and keeper reaction omit odds while normal shots retain them`,()=>{
 const elements=Object.fromEntries(['shotPanel','shotOdds','shotBreakdown','shotGeometry'].map(id=>[id,{textContent:'',setAttribute(k,v){this[k]=v;}}]));
 const legend={textContent:''},context=vm.createContext({game:fixture({team,type:'R',origin:[5,13]}),H:17,$:id=>elements[id],document:{querySelector:()=>legend},drawKeeperOverlay(){},normalShotLegend:'Normal shot',percent:p=>`${Math.round(p*100)}%`,shotPercent:p=>`${(p*100).toFixed(1)}%`});
 vm.runInContext(section('function matchJournalText(', 'function renderBoard()')+'\nglobalThis.show=showShotModel;globalThis.own=ownGoalTarget;globalThis.journal=matchJournalText;',context);
 for(const own of [true,false]){
  const target=point([5,own?17:-1],team);context.game=fixture({team,type:'R',origin:[5,13]});
  assert.equal(context.own(target.y),own);
  for(const pending of [false,true]){
   if(pending)context.game=E.applyKick(context.game,target.x,target.y);
   const before=structuredClone(context.game),model=E.shotModel(context.game,target.x,target.y);context.show(model);
   const text=[elements.shotOdds.textContent,elements.shotBreakdown.textContent,elements.shotGeometry.textContent,legend.textContent].join(' ');
   if(own){assert.match(text,/Own goal warning/);assert.doesNotMatch(text,/%/);}else assert.match(text,/%/);
   assert.deepEqual(context.game,before,'presentation leaves the probabilities and outcome RNG untouched');
  }
 }
 assert.equal(context.journal('Black scores (42% chance) — an own goal! 0–1.'),'Obsidian scores — an own goal! 0–1.');
 assert.match(context.journal('White scores (42% chance)! 1–0.'),/42% chance/);
});
