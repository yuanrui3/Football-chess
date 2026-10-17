import {fileURLToPath as auditFileURLToPath} from 'node:url';
process.chdir(auditFileURLToPath(new URL('.', import.meta.url)));
import {readFile,readdir,writeFile} from 'node:fs/promises';
import * as E from '../frozen/dist/engine.js';
const I=await import('data:text/javascript;base64,'+Buffer.from(await readFile('../frozen/dist/engine.js','utf8')+'\nexport {tacticalTackleRisk};').toString('base64'));
const apply=(s,a)=>a.type==='cornerTaker'?E.selectCornerTaker(s,a.pieceId):a.type==='move'?E.applyMove(s,a.pieceId,a.x,a.y,{freePawn:!!a.freePawn}):a.type==='kick'?E.applyKick(s,a.x,a.y,{disguise:!!a.disguise,passRun:!!a.passRun}):E.skipMove(s);
const recordedMatches=JSON.parse(await readFile('possession-audit.json','utf8')).matches;
const eligible=[],segments=[],matches=[],turnoverReasons={};let actualTackleAttempts=0,actualTackleWins=0,actualPasses=0,actualInterceptedPasses=0,actualSelfCollections=0;
for(const dir of ['baseline-v40','complete-v5']){
 for(const name of (await readdir('../'+dir)).filter(n=>/^match-.*610017.*\.json$/.test(n)&&recordedMatches.some(m=>m.directory===dir&&m.file===n)).sort()){
  const m=JSON.parse(await readFile('../'+dir+'/'+name,'utf8'));if(m.error||m.pendingShot)continue;
  let s=E.createGame({mode:'local',seed:m.seed,kickoff:m.kickoff,foulsEnabled:m.foulsEnabled}),owner=s.attack,actions=0,start=0;
  matches.push({directory:dir,file:name,actions:m.actions});
  for(const event of m.events){
   const carrier=s.pieces.find(p=>p.id===s.ball.carrierId);
   if(s.phase==='attackMove'&&!s.restart&&carrier&&!s.positionBudget.dribbleUsed&&E.legalMoves(s,carrier.id).length)eligible.push({source:dir+'/'+name,step:event.step,state:structuredClone(s)});
   if(event.team===owner)actions++;
   const next=apply(s,event.action),r=next.lastAction;
   if(['tackle','tackleMiss','foul'].includes(r?.type)&&event.action.type==='move')actualTackleAttempts++;
   if(r?.type==='tackle'&&r.tackleSuccess)actualTackleWins++;
   if(event.action.type==='kick'&&r?.type!=='shotAttempt'){actualPasses++;if(r?.type==='interception')actualInterceptedPasses++;}
   if(r?.selfPassCollection)actualSelfCollections++;
   if(next.attack!==owner){const reason=r?.type||'unknown';turnoverReasons[reason]=(turnoverReasons[reason]||0)+1;segments.push({source:dir+'/'+name,team:owner,start,end:event.step,ownActions:actions,reason});owner=next.attack;start=event.step+1;actions=0;}
   s=next;
  }
  segments.push({source:dir+'/'+name,team:owner,start,end:m.actions-1,ownActions:actions,reason:'horizon',censored:true});
 }
}
const sampled=Array.from({length:Math.min(80,eligible.length)},(_,i)=>eligible[Math.floor(i*eligible.length/Math.min(80,eligible.length))]);
const rows=[];
for(const item of sampled){
 const s=item.state,c=s.pieces.find(p=>p.id===s.ball.carrierId),before=structuredClone(s);
 let legal=0,safe=0,knightResisted=0,forcedPaceLoss=0;
 for(const move of E.legalMoves(s,c.id)){
  const after=E.applyMove(s,c.id,move.x,move.y);
  if(after.ball.carrierId!==c.id||after.attack!==c.team){forcedPaceLoss++;continue;}
  legal++;const carrier=after.pieces.find(p=>p.id===c.id),risk=I.tacticalTackleRisk(after,carrier);
  if(risk===0)safe++;if(risk>0&&risk<=.5)knightResisted++;
 }
 const kicking={...s,phase:'kick'};let teammate=0,safePasses=0,keeperPasses=0,unsafePasses=0;
 for(const k of E.legalKicks(kicking)){
  if(k.goal||k.offside||k.distance>10||k.accuracy!==1)continue;
  const receiver=s.pieces.find(p=>p.id===k.receiverId);if(!receiver||receiver.team!==c.team)continue;
  teammate++;const received=E.applyKick(kicking,k.x,k.y,{roll:0});
  if(received.lastAction.type==='offside')throw Error('offside pass survived filter');
  if(receiver.type==='K'){keeperPasses++;continue;}
  const risk=I.tacticalTackleRisk(received,received.pieces.find(p=>p.id===received.ball.carrierId));
  if(risk===0)safePasses++;else unsafePasses++;
 }
 if(JSON.stringify(before)!==JSON.stringify(s))throw Error('audit mutated state');
 rows.push({source:item.source,step:item.step,team:c.team,pieceType:c.type,position:{x:c.x,y:c.y},legalDribbleDestinations:legal,safeDribbleDestinations:safe,knightResistedDestinations:knightResisted,forcedPaceLoss,teammatePassesWithin10:teammate,safeOutfieldPasses:safePasses,keeperPasses,challengedOutfieldPasses:unsafePasses});
}
const avg=a=>a.reduce((s,x)=>s+x,0)/a.length,median=a=>{a=[...a].sort((a,b)=>a-b);return a[Math.floor(a.length/2)];};
const ends=segments.filter(s=>!s.censored),report={createdAt:new Date().toISOString(),method:'Completed DEV scenarios only, seed610017; frozen v40 shared rules19/shot15. 80 evenly spaced ordinary attacking decision states with a carrier and an available dribble. A safe destination has zero immediate clean-tackle risk according to the tested tacticalTackleRisk geometry, including one full normal challenge plus a shared pawn/king bonus setup. This is a geometric immediate-reply audit, not exhaustive adversarial multi-round search. Pass safety is measured on receipt before exploiting the receiver’s own available dribble; keeper back-passes are separate because release is mandatory. No hidden seed was used in calculating move safety.',matches,eligibleStates:eligible.length,sampledStates:rows.length,
 summary:{meanLegalDribbleDestinations:avg(rows.map(r=>r.legalDribbleDestinations)),medianLegalDribbleDestinations:median(rows.map(r=>r.legalDribbleDestinations)),meanSafeDribbleDestinations:avg(rows.map(r=>r.safeDribbleDestinations)),medianSafeDribbleDestinations:median(rows.map(r=>r.safeDribbleDestinations)),safeDribbleFraction:rows.reduce((s,r)=>s+r.safeDribbleDestinations,0)/rows.reduce((s,r)=>s+r.legalDribbleDestinations,0),statesWithAtLeastOneSafeDribble:rows.filter(r=>r.safeDribbleDestinations>0).length,statesWithAtLeastFiveSafeDribbles:rows.filter(r=>r.safeDribbleDestinations>=5).length,meanSafeOutfieldPasses:avg(rows.map(r=>r.safeOutfieldPasses)),meanKeeperBackPasses:avg(rows.map(r=>r.keeperPasses)),statesWithSafeDribbleOrSafeOutfieldPass:rows.filter(r=>r.safeDribbleDestinations||r.safeOutfieldPasses).length,meanTeammatePassesWithin10:avg(rows.map(r=>r.teammatePassesWithin10)),forcedPaceLossDestinations:rows.reduce((s,r)=>s+r.forcedPaceLoss,0)},
 replay:{completedPossessionSegments:ends.length,censoredPossessionSegments:segments.length-ends.length,meanOwnActionsPerCompletedSegment:avg(ends.map(s=>s.ownActions)),medianOwnActionsPerCompletedSegment:median(ends.map(s=>s.ownActions)),turnoverReasons,actualTackleAttempts,actualTackleWins,actualPasses,actualInterceptedPasses,actualSelfCollections},rows,segments};
await writeFile('possession-audit-states.json',JSON.stringify(sampled)+'\n');
await writeFile('possession-audit.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({sampledStates:report.sampledStates,eligibleStates:report.eligibleStates,matches:matches.length,summary:report.summary,replay:report.replay}));
