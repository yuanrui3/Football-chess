import * as base from '../baseline/engine.mjs';
import * as reach from './keeper-reach.mjs';
import * as range from './range-decay.mjs';
import * as final from '../final/engine.mjs';
import {writeFile} from 'node:fs/promises';
function fixture(type,x,y,keeperX){
 const state=base.createGame({mode:'local',seed:1984}),carrier=`white-${type==='R'?'R1':'Q'}`;
 const assigned={'white-K':[6,15],'black-K':[keeperX,0],[carrier]:[x,y]},used=new Set(Object.values(assigned).map(p=>p.join()));
 const parking=Array.from({length:17},(_,j)=>[[0,j],[13,j]]).flat();
 for(const p of state.pieces){const q=assigned[p.id]||parking.find(q=>!used.has(q.join()));used.add(q.join());Object.assign(p,{x:q[0],y:q[1]});}
 Object.assign(state,{ball:{x,y,carrierId:carrier},phase:'kick',attack:'white',restart:null,offside:null});
 state.ballProgress={team:'white',anchorY:y,rounds:0,pendingRelease:false,excludeRelease:false};return state;
}
const rows=[];
for(const type of ['R','Q'])for(let y=3;y<=8;y++)for(let x=4;x<=9;x++)for(let keeperX=5;keeperX<=8;keeperX++){
 const state=fixture(type,x,y,keeperX),baseShots=base.legalKicks(state).filter(k=>k.goal==='white');
 if(!baseShots.length)continue;
 const row={type,x,y,keeperX,variants:{}};
 for(const [name,E]of Object.entries({baseline:base,'keeper-reach':reach,'range-decay':range,'combined-c':final})){
  let best=0,bestTarget=null,bestDistance=null;
  for(const kick of E.legalKicks(state).filter(k=>k.goal==='white')){
   const shot=E.applyKick(state,kick.x,kick.y),action=E.chooseAIAction(shot,{difficulty:'casual'}),keeper=action.type==='move'?{x:action.x,y:action.y}:undefined;
   const model=E.shotModel(shot,kick.x,kick.y,keeper);
   if(model.probability>best){best=model.probability;bestTarget={x:kick.x,y:kick.y};bestDistance=model.distance;}
  }
  row.variants[name]={best,bestTarget,bestDistance};
 }
 rows.push(row);
}
const summarize=subset=>({positions:subset.length,...Object.fromEntries(['baseline','keeper-reach','range-decay','combined-c'].map(name=>[name,{meanBestChance:subset.reduce((s,r)=>s+r.variants[name].best,0)/subset.length,positionsAbove10pct:subset.filter(r=>r.variants[name].best>=.1).length,positionsAbove20pct:subset.filter(r=>r.variants[name].best>=.2).length,improvedVersusBase:subset.filter(r=>r.variants[name].best-r.variants.baseline.best>1e-9).length}]))});
const summary={note:'Synthetic open-lane geometry grid, not match samples. R/Q origins files e–j, y3–8; keeper files f–i at y0, allowed one reaction. Ordinary targets only, no blockers or disguised shots.',overall:summarize(rows),central:summarize(rows.filter(r=>[6,7].includes(r.x))),wide:summarize(rows.filter(r=>![6,7].includes(r.x))),byType:Object.fromEntries(['R','Q'].map(type=>[type,summarize(rows.filter(r=>r.type===type))]))};
await writeFile(new URL('./geometry-grid.json',import.meta.url),JSON.stringify({summary,rows},null,2));console.log(JSON.stringify(summary));
