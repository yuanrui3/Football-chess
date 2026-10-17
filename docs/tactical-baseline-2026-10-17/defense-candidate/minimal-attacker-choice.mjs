import {readFile,writeFile} from 'node:fs/promises';import assert from 'node:assert/strict';
const source=await readFile('./engine-minimal-reply-risk.mjs','utf8'),C=await import('data:text/javascript;base64,'+Buffer.from(source+'\nexport{tacticalFullReplyRisk};').toString('base64'));
const misses=JSON.parse(await readFile('possession-full-reply-audit.json','utf8')).counterexamples,rows=[];
for(const m of [misses[1],misses[4]]){
 let s=structuredClone(m.state),original=s.pieces.find(p=>p.id===s.ball.carrierId),safe=0;
 for(const move of C.legalMoves(s,original.id)){const after=C.applyMove(s,original.id,move.x,move.y);if(after.ball.carrierId===original.id&&!C.tacticalFullReplyRisk(after,after.pieces.find(p=>p.id===original.id)))safe++;}
 assert.ok(safe>0);const seq=[];
 for(let j=0;j<4&&s.phase==='attackMove';j++){
  const r=C.analyzeTacticalAction(s,{nodeLimit:1400,maxDepth:8,modelWeights:null}),a=r.action;assert.ok(r.stats.nodes<=1400);
  const before=structuredClone(s);const after=a.type==='move'?C.applyMove(s,a.pieceId,a.x,a.y,{freePawn:a.freePawn}):C.skipMove(s);
  assert.deepEqual(s,before);seq.push({action:a,stats:r.stats});s=after;
 }
 const carrier=s.pieces.find(p=>p.id===s.ball.carrierId),risk=C.tacticalFullReplyRisk(s,carrier);
 rows.push({source:m.source,step:m.step,safeAlternatives:safe,sequence:seq,finalCarrier:carrier,risk,phase:s.phase});
 assert.equal(risk,0,'choose an actually safe continuation rather than a discovered-tackle trap');
}
await writeFile('minimal-attacker-choice.json',JSON.stringify(rows,null,2)+'\n');console.log(JSON.stringify(rows));
