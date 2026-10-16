import * as E from '../../dist/engine.js';
export {E};
export const clone=value=>structuredClone(value);
export const other=team=>team==='white'?'black':'white';
export const point=([x,y],team='white')=>team==='white'?{x,y}:{x:E.BOARD_WIDTH-1-x,y:E.BOARD_HEIGHT-1-y};
export const pieceId=(id,team='white')=>team==='white'?id:id.replace(/^(white|black)/,other);
const suffix={K:'K',Q:'Q',R:'R1',B:'B1',N:'N1',P:'P1'};
export function fixture({team='white',type='Q',origin=[6,3],keeper=[8,0]}={}){
 const state=E.createGame({mode:'local',seed:1984}),carrier=`white-${suffix[type]}`;
 let own=[6,15],opponent=[...keeper];
 if(type!=='K'&&origin.join()===own.join())own=[1,16];
 if(origin.join()===opponent.join())opponent=[4,1];
 const assigned={'white-K':own,'black-K':opponent,[carrier]:origin},used=new Set(Object.values(assigned).map(p=>p.join()));
 if(used.size!==Object.keys(assigned).length)throw Error('Overlapping shot fixture');
 const parking=Array.from({length:E.BOARD_HEIGHT},(_,y)=>[[0,y],[E.BOARD_WIDTH-1,y]]).flat();
 for(const p of state.pieces){const q=assigned[p.id]||parking.find(q=>!used.has(q.join()));used.add(q.join());Object.assign(p,point(q,team));if(team==='black'){p.id=pieceId(p.id,team);p.team=other(p.team);}}
 const owner=state.pieces.find(p=>p.id===pieceId(carrier,team));
 Object.assign(state,{ball:{x:owner.x,y:owner.y,carrierId:owner.id},phase:'kick',attack:team,restart:null,offside:null});
 state.ballProgress={team,anchorY:owner.y,rounds:0,pendingRelease:false,excludeRelease:false};return state;
}
export function model(state,file=6,keeper){const goal=point([file,-1],state.attack);return E.shotModel(state,goal.x,goal.y,keeper);}
export const rawAccuracy=m=>.98*E.SHOT_MODEL.finishingAccuracyMultiplier*Math.exp(-.018*m.distance-m.distancePenaltyRate*Math.max(0,m.distance-3)**2)*(.65+.35*Math.cos(m.shotAngleDegrees*Math.PI/180))*m.postAngleFactor*m.wideAngleFactor*m.centralLaneFactor;
export const clampAccuracy=p=>Math.max(.01,Math.min(.98,p));
