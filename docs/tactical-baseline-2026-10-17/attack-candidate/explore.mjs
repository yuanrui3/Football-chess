import {readFile} from 'node:fs/promises';
const importInternals=async name=>import('data:text/javascript;base64,'+Buffer.from(await readFile(new URL(name,import.meta.url),'utf8')+'\nexport {rankedTacticalActions,tacticalShots};').toString('base64'));
const [old,e]=await Promise.all([importInternals('engine-original.mjs'),importInternals('engine-opening-v1.mjs')]);
const s=e.createGame({seed:18});const assigned={'white-K':[6,16],'black-K':[8,0],'white-Q':[6,3],'white-B1':[6,2],'black-R1':[12,1]};const used=new Set(Object.values(assigned).map(p=>p.join()));const parking=Array.from({length:17},(_,y)=>[[0,y],[13,y]]).flat();
for(const p of s.pieces){const q=assigned[p.id]||parking.find(q=>!used.has(q.join()));[p.x,p.y]=q;used.add(q.join());}
Object.assign(s,{phase:'attackMove',attack:'white',ball:{x:6,y:3,carrierId:'white-Q'},positionBudget:{normalUsed:false,pawnUsed:true,dribbleUsed:true},restart:null,offside:null,pendingShot:null,releaseReason:null});
console.log('before',e.tacticalShots(s,'white',true));
for(const [label,rules] of [['old',old],['new',e]]){const actions=rules.rankedTacticalActions(s,9,true);console.log(label,actions);const a=actions[0].action;let next=a.type==='skip'?rules.skipMove(s):rules.applyMove(s,a.pieceId,a.x,a.y,{freePawn:a.freePawn});console.log('after',e.tacticalShots(next,'white',true));}
