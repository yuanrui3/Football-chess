import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import * as B from '../frozen/dist/engine.js';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const candidatePath=path.resolve(process.argv[2] || './combined-checked.mjs');
const C=await import(pathToFileURL(candidatePath).href);
const reportPath=process.argv[3] || 'combined-rules-validation.json';
const digest=async p=>createHash('sha256').update(await readFile(p)).digest('hex');
const candidateSha256=await digest(candidatePath);
const report={candidateSha256,states:0,legalMoveQueries:0,kickQueries:0,normalizations:0,casualExactMatches:0,fullTransitionMatches:0,tacticalChecks:0,errors:[]};
const apply=(M,s,a)=>a.type==='cornerTaker'?M.selectCornerTaker(s,a.pieceId):a.type==='move'?M.applyMove(s,a.pieceId,a.x,a.y,{freePawn:!!a.freePawn}):a.type==='kick'?M.applyKick(s,a.x,a.y,{disguise:!!a.disguise,passRun:!!a.passRun}):M.skipMove(s);
for(const seed of [610017,610043])for(const foulsEnabled of [false,true]){
 let s=B.createGame({seed,kickoff:seed===610017?'white':'black',foulsEnabled});
 for(let action=0;action<160&&s.phase!=='finished';action++){
  const before=structuredClone(s);report.states++;
  for(const fn of ['currentTeam','legalKicks','shotModel','shotChance','offsideInfo','offsideFlaggedIds','paceInfo','progressInfo','positionActions','cornerTakers','keeperReboundTargets']){
   assert.deepEqual(C[fn](s),B[fn](s),`${fn} ${seed}/${foulsEnabled}/${action}`);
  }
  report.kickQueries++;
  for(const p of s.pieces)for(const freePawn of [false,true]){
   assert.deepEqual(C.legalMoves(s,p.id,{freePawn}),B.legalMoves(s,p.id,{freePawn}));report.legalMoveQueries++;
  }
  assert.deepEqual(C.normalizeGame(s),B.normalizeGame(s));report.normalizations++;
  const a=B.chooseAIAction(s,{difficulty:'casual',modelWeights:null}),b=C.chooseAIAction(s,{difficulty:'casual',modelWeights:null});
  assert.deepEqual(b,a,`Casual policy ${seed}/${foulsEnabled}/${action}`);report.casualExactMatches++;
  assert.deepEqual(s,before,'all queries preserve source state');
  if(action%40===0){
   const r=C.analyzeTacticalAction(s,{nodeLimit:128,maxDepth:3,modelWeights:null});
   assert.ok(r.stats.nodes<=128);assert.deepEqual(s,before);
   assert.deepEqual(C.analyzeTacticalAction({...s,randomState:0xffffffff},{nodeLimit:128,maxDepth:3,modelWeights:null}).action,r.action);
   apply(C,s,r.action);report.tacticalChecks++;
  }
  const next=apply(B,s,a);assert.deepEqual(apply(C,s,a),next,`Actual transition ${seed}/${foulsEnabled}/${action}`);report.fullTransitionMatches++;
  s=next;
 }
}
assert.equal(await digest(candidatePath),candidateSha256);
await writeFile(reportPath,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
