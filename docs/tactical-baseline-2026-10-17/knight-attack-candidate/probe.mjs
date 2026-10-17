import {readFile,writeFile} from 'node:fs/promises';
const expose=async p=>import('data:text/javascript;base64,'+Buffer.from(await readFile(new URL(p,import.meta.url),'utf8')+'\nexport {tacticalKnightCarryThreats,tacticalKnightCarryExposure,tacticalKickRank,tacticalShots};').toString('base64'));
const [B,C]=await Promise.all([expose('./engine-base.mjs'),expose('./engine.mjs')]);
const origin=JSON.parse(await readFile(new URL('../defense-candidate/knight-carry-natural-state.json',import.meta.url),'utf8'));
const apply=(E,s,a,roll=.5)=>a.type==='kick'?E.applyKick(s,a.x,a.y,{roll,disguise:!!a.disguise}):a.type==='move'?E.applyMove(s,a.pieceId,a.x,a.y,{roll,freePawn:!!a.freePawn}):E.skipMove(s,{roll});
const results=[];
for(const opponent of ['casual','tactical']){
 let s=structuredClone(origin),pre=[];for(let i=0;i<4&&s.phase==='defendMove';i++){const a=B.chooseAIAction({...s,randomState:0},{difficulty:opponent,modelWeights:null});pre.push({a,before:s.phase});s=apply(B,s,a);}
 const owner=s.pieces.find(p=>p.id===s.ball.carrierId),threats=C.tacticalKnightCarryThreats(s,owner),old=B.analyzeTacticalAction(s,{modelWeights:null}),fresh=C.analyzeTacticalAction(s,{modelWeights:null});
 const kicks=C.legalKicks(s),ranked=kicks.filter(k=>!k.goal&&!k.offside).map(k=>({x:k.x,y:k.y,receiver:k.receiverId,old:B.tacticalKickRank(s,k,s.attack),new:C.tacticalKickRank(s,k,s.attack)})).sort((a,b)=>b.new-a.new).slice(0,6);
 const trace=[];let after=s;for(let i=0;i<16&&after.attack===s.attack&&after.phase!=='keeperReact';i++){const actor=C.currentTeam(after),a=actor===s.attack?C.chooseAIAction({...after,randomState:0},{difficulty:'tactical',modelWeights:null}):B.chooseAIAction({...after,randomState:0},{difficulty:opponent,modelWeights:null});const before=after;after=apply(C,after,a,.5);trace.push({phase:before.phase,actor,a,result:after.lastAction.type,ball:after.ball,shot:after.ball.carrierId?C.tacticalShots(after,s.attack,true):0});}
 results.push({opponent,pre,threats,old:old.action,fresh:fresh.action,stats:fresh.stats,ranked,trace,finalPhase:after.phase,finalAttack:after.attack});console.log(JSON.stringify(results.at(-1)));
}
await writeFile(new URL('probe.json',import.meta.url),JSON.stringify(results,null,2));
