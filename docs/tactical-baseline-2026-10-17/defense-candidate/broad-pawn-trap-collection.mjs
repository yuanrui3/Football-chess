import {readFile,writeFile} from 'node:fs/promises';
const source=await readFile('../selected-candidate/engine.mjs','utf8'),C=await import('data:text/javascript;base64,'+Buffer.from(source+'\nexport{tacticalFullReplyRisk};').toString('base64'));
const prior=JSON.parse(await readFile('pawn-trap-full-risk-probe.json','utf8'));let s=prior.rows.find(r=>r.label==='strict').finalState,rows=[],kicked=false,collection=null;
for(let j=0;j<16;j++){
 const team=C.currentTeam(s),phase=s.phase,a=C.analyzeTacticalAction(s,{nodeLimit:1400,maxDepth:8,modelWeights:null}).action;
 const after=a.type==='move'?C.applyMove(s,a.pieceId,a.x,a.y,{freePawn:a.freePawn}):a.type==='kick'?C.applyKick(s,a.x,a.y,{disguise:a.disguise}):C.skipMove(s);
 rows.push({phase,team,action:a,result:after.lastAction.type,ball:after.ball,progress:C.progressInfo(after)});s=after;
 if(team==='white'&&a.type==='kick')kicked=true;
 if(kicked&&s.ball.carrierId&&s.attack==='white'){
  const risk=C.tacticalFullReplyRisk(s,s.pieces.find(p=>p.id===s.ball.carrierId));collection={risk,carrier:s.ball.carrierId,position:{x:s.ball.x,y:s.ball.y},phase:s.phase};break;
 }
 if(s.attack!=='white')break;
}
await writeFile('broad-pawn-trap-collection.json',JSON.stringify({rows,collection,finalState:s},null,2)+'\n');console.log(JSON.stringify({rows,collection}));
