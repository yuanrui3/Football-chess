import {fileURLToPath as auditFileURLToPath} from 'node:url';
process.chdir(auditFileURLToPath(new URL('.', import.meta.url)));
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import * as E from './movement-sensitivity-engine.mjs';

// A read-only filter of already-legal first carries. No rule constant is changed.
// Run from this directory; the engine snapshot and 80 input states are portable.
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const stateBytes=await readFile('possession-audit-states.json');
const states=JSON.parse(stateBytes);
const prior=JSON.parse(await readFile('possession-full-reply-audit.json','utf8'));
const priorRows=new Map(prior.rows.map(r=>[`${r.source}:${r.step}`,r]));
const caps=[6,7,8];
let replyStates=0,bonusQueries=0,candidateMoves=0,excludedPossessionAwards=0;

function directTackle(s){
  const team=E.currentTeam(s),flags=new Set(E.offsideFlaggedIds(s));
  for(const p of s.pieces)if(p.team===team&&!flags.has(p.id)){
    const move=E.legalMoves(s,p.id).find(m=>m.type==='tackle');
    if(move)return {probability:move.tackleProbability,pieceId:p.id,x:move.x,y:move.y};
  }
  return null;
}
function fullReply(s){
  const reply=s.phase==='attackMove'?E.skipMove(s):s;
  if(reply.phase!=='defendMove')throw Error(`Expected defendMove, got ${reply.phase}`);
  replyStates++;
  const immediate=directTackle(reply);
  if(immediate)return {...immediate,bonus:null};
  for(const p of reply.pieces)if(p.team===E.currentTeam(reply)&&['P','K'].includes(p.type)){
    for(const m of E.legalMoves(reply,p.id,{freePawn:true})){
      bonusQueries++;
      const after=E.applyMove(reply,p.id,m.x,m.y,{freePawn:true});
      const tackle=directTackle(after);
      if(tackle)return {...tackle,bonus:{pieceId:p.id,x:m.x,y:m.y}};
    }
  }
  return {probability:0,bonus:null};
}

const rows=[];
for(const entry of states){
  const s=entry.state,before=JSON.stringify(s),carrier=s.pieces.find(p=>p.id===s.ball.carrierId);
  const destinations=[],excluded=[];
  for(const m of E.legalMoves(s,carrier.id)){
    candidateMoves++;
    const cost=E.movementCost(carrier,m.x,m.y);
    const after=E.applyMove(s,carrier.id,m.x,m.y);
    if(after.ball.carrierId!==carrier.id||after.attack!==carrier.team){
      excludedPossessionAwards++;excluded.push({x:m.x,y:m.y,cost,result:after.lastAction?.type,reason:after.lastAction?.reason});continue;
    }
    if(cost>8||!Number.isFinite(cost))throw Error('Legal retained carry exceeded current dribble cap');
    const challenge=fullReply(after);
    destinations.push({x:m.x,y:m.y,cost,safe:challenge.probability===0,forwardSquares:carrier.team==='white'?carrier.y-m.y:m.y-carrier.y,challenge});
  }
  const passRow=priorRows.get(`${entry.source}:${entry.step}`);
  if(!passRow)throw Error('Missing original row');
  const baselineSafe=destinations.filter(d=>d.safe).length;
  if(destinations.length!==passRow.dribbles||baselineSafe!==passRow.safeDribbles)throw Error('Current legal-rule snapshot disagrees with original exact audit');
  const byCap=Object.fromEntries(caps.map(cap=>{
    const available=destinations.filter(d=>d.cost<=cap),safe=available.filter(d=>d.safe);
    return [cap,{legal:available.length,safe:safe.length,safeForward:safe.filter(d=>d.forwardSquares>0).length,maxSafeForwardSquares:safe.length?Math.max(...safe.map(d=>d.forwardSquares)):null}];
  }));
  rows.push({source:entry.source,step:entry.step,team:carrier.team,pieceType:carrier.type,carrierId:carrier.id,position:{x:carrier.x,y:carrier.y},safeOutfieldPasses:passRow.safeOutfieldPasses,teammatePassesWithin10:passRow.teammatePasses,keeperBackPasses:passRow.keeperPasses,byCap,destinations,excluded});
  if(JSON.stringify(s)!==before)throw Error('Sensitivity audit mutated input state');
}

const sum=(a,key)=>a.reduce((n,r)=>n+r[key],0);
const median=a=>[...a].sort((a,b)=>a-b)[Math.floor(a.length/2)];
function summarize(cap,subset=rows){
  const a=subset.map(r=>r.byCap[cap]),legal=sum(a,'legal'),safe=sum(a,'safe');
  return {states:subset.length,legalDestinations:legal,safeDestinations:safe,meanLegalDestinations:legal/subset.length,meanSafeDestinations:safe/subset.length,medianSafeDestinations:median(a.map(r=>r.safe)),safeDestinationFraction:legal?safe/legal:0,statesWithSafeDribble:a.filter(r=>r.safe>0).length,statesWithFiveSafeDribbles:a.filter(r=>r.safe>=5).length,statesWithSafeForwardDribble:a.filter(r=>r.safeForward>0).length,statesWithSafeDribbleOrSafeOutfieldPass:subset.filter(r=>r.byCap[cap].safe>0||r.safeOutfieldPasses>0).length};
}
const summaries=Object.fromEntries(caps.map(cap=>[cap,summarize(cap)]));
const comparison=Object.fromEntries([6,7].map(cap=>[cap,{
  removedLegalDestinations:summaries[8].legalDestinations-summaries[cap].legalDestinations,
  removedSafeDestinations:summaries[8].safeDestinations-summaries[cap].safeDestinations,
  statesLosingLastSafeDribble:rows.filter(r=>r.byCap[8].safe>0&&r.byCap[cap].safe===0).map(r=>({source:r.source,step:r.step,pieceType:r.pieceType,safeAt8:r.byCap[8].safe,safeOutfieldPasses:r.safeOutfieldPasses})),
  statesLosingAllSafeDribbleAndPassOptions:rows.filter(r=>r.byCap[8].safe>0&&r.byCap[cap].safe===0&&!r.safeOutfieldPasses).map(r=>({source:r.source,step:r.step,pieceType:r.pieceType})),
}]));
const byPiece=Object.fromEntries([...new Set(rows.map(r=>r.pieceType))].sort().map(type=>[type,Object.fromEntries(caps.map(cap=>[cap,summarize(cap,rows.filter(r=>r.pieceType===type))]))]));
const report={
  createdAt:new Date().toISOString(),status:'Read-only hypothetical first-dribble sensitivity; no rules changed',
  method:'Filter each current legal first dribble by actual movementCost <=6, <=7 or <=8. Native piece geometry, obstacles, two-point box entry costs and budgets remain unchanged. Actually apply every candidate first and exclude awards or loss of carrier possession. For each retained destination enumerate every eligible direct ordinary tackle and every legal shared P/K bonus followed by any eligible ordinary tackle, respecting snapshot offside flags. Immediate clean-tackle availability only; no future attacking move optimization or balance/win-rate claim. Existing safe-on-receipt passes are held fixed and do not include a receiver carrying away.',
  dataset:'Same 80 evenly spaced ordinary attacking states from seven completed development scenarios, seed610017, two policies and paired colors/kickoffs. No held-out files accessed.',
  inputs:{engine:'movement-sensitivity-engine.mjs',engineSha256:digest(await readFile('movement-sensitivity-engine.mjs')),states:'possession-audit-states.json',statesSha256:digest(stateBytes),passAudit:'possession-full-reply-audit.json',passAuditSha256:digest(await readFile('possession-full-reply-audit.json')),rulesVersion:E.RULES_VERSION,dribbleRange:E.DRIBBLE_RANGE},
  sampledStates:rows.length,summaryByCap:summaries,comparisonTo8:comparison,byPieceType:byPiece,
  work:{candidateMoves,excludedPossessionAwards,replyStates,bonusQueries,originalAuditAgreement:true},rows
};
await writeFile('dribble-range-sensitivity.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({sampledStates:report.sampledStates,summaryByCap:summaries,comparisonTo8:comparison,byPieceType:byPiece,work:report.work,inputs:report.inputs}));
