import {readFile,readdir,writeFile} from 'node:fs/promises';
import * as Rules from '../frozen/dist/engine.js';
const expose=async path=>import('data:text/javascript;base64,'+Buffer.from(await readFile(path,'utf8')+'\nexport {rankedTacticalActions,canCollect};').toString('base64'));
const [B,C]=await Promise.all([expose('../frozen/dist/engine.js'),expose('./engine.mjs')]);
const apply=(s,a)=>a.type==='cornerTaker'?Rules.selectCornerTaker(s,a.pieceId):a.type==='move'?Rules.applyMove(s,a.pieceId,a.x,a.y,{freePawn:!!a.freePawn}):a.type==='kick'?Rules.applyKick(s,a.x,a.y,{disguise:!!a.disguise,passRun:!!a.passRun}):Rules.skipMove(s);
let loose=0,wrong=0;const examples=[];
for(const name of (await readdir('../baseline-v40')).filter(n=>n.startsWith('match-')&&n.endsWith('.json'))){
 const m=JSON.parse(await readFile('../baseline-v40/'+name,'utf8'));let s=Rules.createGame({mode:'local',seed:m.seed,kickoff:m.kickoff,foulsEnabled:m.foulsEnabled});
 for(const e of m.events){
  if(!s.ball.carrierId&&['attackMove','defendMove'].includes(s.phase)){
   loose++;const old=B.rankedTacticalActions(s,9,true),fresh=C.rankedTacticalActions(s,9,true),p=s.pieces.find(p=>p.id===old[0]?.action?.pieceId);
   if(p?.type==='B'&&(p.x+p.y-s.ball.x-s.ball.y)%2!==0){wrong++;if(examples.length<4)examples.push({match:name,step:e.step,state:s,baseline:old.slice(0,3),candidate:fresh.slice(0,3)});}
  }
  s=apply(s,e.action);
 }
}
await writeFile('natural-second-balls.json',JSON.stringify({loose,wrong,examples},null,2)+'\n');console.log(JSON.stringify({loose,wrong,examples:examples.map(e=>({match:e.match,step:e.step,ball:e.state.ball,baseline:e.baseline[0],candidate:e.candidate[0]}))}));
