import * as base from '../baseline/engine.mjs';
import * as reach from './keeper-reach.mjs';
import * as range from './range-decay.mjs';
import * as final from '../final/engine.mjs';
import {writeFile} from 'node:fs/promises';
function fixture(type,y,file=6){
 const state=base.createGame({mode:'local',seed:1984}),carrier=`white-${type==='R'?'R1':'Q'}`;
 const assigned={'white-K':[6,15],'black-K':[6,0],[carrier]:[file,y]},used=new Set(Object.values(assigned).map(p=>p.join()));
 const parking=Array.from({length:17},(_,j)=>[[0,j],[13,j]]).flat();
 for(const p of state.pieces){const q=assigned[p.id]||parking.find(q=>!used.has(q.join()));used.add(q.join());Object.assign(p,{x:q[0],y:q[1]});}
 Object.assign(state,{ball:{x:file,y,carrierId:carrier},phase:'kick',attack:'white',restart:null,offside:null});
 state.ballProgress={team:'white',anchorY:y,rounds:0,pendingRelease:false,excludeRelease:false};return state;
}
const rows=[];
for(const type of ['R','Q'])for(const y of [3,4,5,6,7,8])for(const [name,E]of Object.entries({baseline:base,'keeper-reach':reach,'range-decay':range,'combined-c':final})){
 const state=fixture(type,y),shot=E.applyKick(state,6,-1),action=E.chooseAIAction(shot,{difficulty:'casual'}),keeper=action.type==='move'?{x:action.x,y:action.y}:undefined;
 const m=E.shotModel(shot,6,-1,keeper);rows.push({type,distance:m.distance,variant:name,goal:m.probability,onTarget:m.onTarget,saveGivenOnTarget:m.saveGivenOnTarget,keeperPosition:m.keeperPosition,reach:m.reach});
}
await writeFile(new URL('./geometry-audit.json',import.meta.url),JSON.stringify(rows,null,2));
console.log(JSON.stringify(rows));
