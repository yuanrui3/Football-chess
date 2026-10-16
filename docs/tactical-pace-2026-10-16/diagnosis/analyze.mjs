import fs from 'node:fs';
import * as rules from '../baseline/engine.mjs';
const dir=new URL('.',import.meta.url);
const teams=['white','black'],other=t=>t==='white'?'black':'white';
const avg=v=>v.length?v.reduce((a,b)=>a+b,0)/v.length:0;
const coord=p=>!p?'?':`${rules.FILE_LABELS[p.x]??p.x}${17-p.y}`;
const key=s=>JSON.stringify([s.score,s.pieces.map(p=>[p.id,p.x,p.y]),s.ball,s.attack,s.phase,s.positionBudget,s.restart?.type,s.restart?.team,s.offside?.flaggedIds,s.discipline]);
function reacted(s,k,disguise=false){
  let p;try{p=rules.applyKick(s,k.x,k.y,{disguise});}catch{return null;}
  if(p.phase!=='keeperReact')return null;
  const keeper=p.pieces.find(a=>a.team===other(k.goal)&&a.type==='K');
  const positions=[keeper,...(keeper?rules.legalMoves(p,keeper.id):[])].filter(Boolean);
  const models=positions.length?positions.map(pos=>rules.shotModel(p,k.x,k.y,pos)):[rules.shotModel(p,k.x,k.y)];
  models.sort((a,b)=>a.probability-b.probability);
  return {k:{x:k.x,y:k.y,disguise},model:models[0],beforeReaction:rules.shotModel(p,k.x,k.y).probability};
}
function analyze(m){
 const initial=rules.createGame({mode:'local',seed:m.seed,kickoff:m.kickoff,minutes:10,foulsEnabled:true});
 const seen=new Map(),repeats=[],kickChoices=[],shots=[],dribbleRuns=[],carrierMoves=[],teamTokens={white:[],black:[]};
 let run=null;
 for(let i=0;i<m.events.length;i++){
  const e=m.events[i],s=i?m.events[i-1].state:initial,r=e.result,a=e.action,c=s.pieces.find(p=>p.id===s.ball.carrierId),actor=s.pieces.find(p=>p.id===a.pieceId);
  const k=key(e.state),prior=seen.get(k)||[];
  if(prior.length&&e.step-prior.at(-1)>1)repeats.push({step:e.step,previous:prior.at(-1),cycleLength:e.step-prior.at(-1),phase:e.state.phase,attack:e.state.attack,ball:coord(e.state.ball),carrier:e.state.ball.carrierId});
  seen.set(k,[...prior,e.step]);
  if(a.type==='move'&&actor){
    const token=JSON.stringify([s.phase,a.type,a.pieceId,actor.x,actor.y,a.x,a.y,!!a.freePawn]);
    teamTokens[e.team].push({step:e.step,token,actor:a.pieceId,from:coord(actor),to:coord(a)});
  }
  if(run&&e.state.ball.carrierId&&e.state.ball.carrierId!==run.pieceId){dribbleRuns.push(run);run=null;}
  if(a.type==='move'&&actor&&(c?.id===actor.id||r.selfPassCollection)&&s.phase==='attackMove'&&!s.restart){
    const d={step:e.step,pieceId:actor.id,from:coord(actor),to:coord(a),turn:s.turn,ballY:s.ball.y,selfPassCollection:!!r.selfPassCollection};carrierMoves.push(d);
    if(!run||run.pieceId!==actor.id){if(run)dribbleRuns.push(run);run={pieceId:actor.id,start:e.step,end:e.step,count:0,moves:[]};}
    run.count++;run.end=e.step;run.moves.push(d);
  }
  if(run&&((e.state.attack!==s.attack)||e.state.restart||r.type==='goal'||a.type==='kick'&&e.state.ball.carrierId&&e.state.ball.carrierId!==run.pieceId)){
    dribbleRuns.push(run);run=null;
  }
  if(a.type==='kick'){
    const allGoal=rules.legalKicks(s).filter(k=>k.goal===s.attack),legal=allGoal.filter(k=>!k.offside);
    const noFriends={...s,pieces:s.pieces.filter(p=>p.team!==s.attack||p.id===s.ball.carrierId)};
    const geometricGoals=rules.legalKicks(noFriends).filter(k=>k.goal===s.attack).length;
    const possibilities=legal.map(k=>reacted(s,k)).filter(Boolean),pair=rules.disguisedShotTargets(s);
    if(pair.length===2){const p=reacted(s,pair[0],true);if(p)possibilities.push(p);}
    possibilities.sort((a,b)=>b.model.probability-a.model.probability);
    const best=possibilities[0];
    kickChoices.push({step:e.step,team:e.team,pieceId:c?.id,pieceType:c?.type,origin:coord(c),goalDistance:c?(c.team==='white'?c.y+1:17-c.y):null,legalGoals:legal.length,geometricGoals,friendlySuppressed:!allGoal.length&&geometricGoals>0,offsideSuppressed:allGoal.length>0&&!legal.length,best:best?{target:coord(best.k),disguise:best.k.disguise,probability:best.model.probability,beforeReaction:best.beforeReaction,onTarget:best.model.onTargetProbability,saveGivenOnTarget:best.model.saveGivenOnTarget,blockers:best.model.blockerIds,blockProbability:best.model.blockProbability,distance:best.model.distance}:null,selected:a,outcome:r.type,attempt:r.type==='shotAttempt'});
  }
  if(s.phase==='keeperReact')shots.push({step:e.step,team:s.pendingShot.shootingTeam,pieceId:s.pendingShot.shooterId,origin:coord(s.pendingShot.from),target:coord(r.goalTarget||{x:s.pendingShot.x,y:s.pendingShot.y}),outcome:r.type,detail:r.outcome,model:r.shotModel});
 }
 if(run)dribbleRuns.push(run);
 const tokenRepeats=[];
 for(const team of teams){const arr=teamTokens[team];for(let length=1;length<=8;length++)for(let start=0;start+length*3<=arr.length;start++){
   const pattern=arr.slice(start,start+length).map(a=>a.token).join('|');
   if(arr.slice(start+length,start+length*2).map(a=>a.token).join('|')!==pattern||arr.slice(start+length*2,start+length*3).map(a=>a.token).join('|')!==pattern)continue;
   if(start&&arr.slice(start-1,start-1+length).map(a=>a.token).join('|')===pattern)continue;
   tokenRepeats.push({team,length,startStep:arr[start].step,endStep:arr[start+length*3-1].step,moves:arr.slice(start,start+length*3).map(({token,...v})=>v)});
 }}
 const opportunities=kickChoices.filter(k=>k.best),declined=opportunities.filter(k=>!k.attempt).sort((a,b)=>b.best.probability-a.best.probability);
 const shotUnavailableReasons={noGoalGeometry:kickChoices.filter(k=>!k.geometricGoals).length,friendlyBlock:kickChoices.filter(k=>k.friendlySuppressed).length,offsideBoxInterference:kickChoices.filter(k=>k.offsideSuppressed).length};
 return {seed:m.seed,kickoff:m.kickoff,score:m.score,actions:m.actions,error:m.error,shotCount:shots.length,kickCount:kickChoices.length,shotUnavailableReasons,shots:shots.map(s=>({...s,model:undefined,...(s.model?{probability:s.model.probability,onTarget:s.model.onTargetProbability,saveGivenOnTarget:s.model.saveGivenOnTarget,blockers:s.model.blockerIds,blockProbability:s.model.blockProbability,distance:s.model.distance}: {})})),opportunities:opportunities.length,declinedCount:declined.length,opportunityThresholds:Object.fromEntries([0.01,0.04,0.08,0.1,0.2,0.3].map(t=>[t,{available:opportunities.filter(k=>k.best.probability>=t).length,declined:declined.filter(k=>k.best.probability>=t).length}])),meanActualShotXG:avg(shots.map(s=>s.model?.probability||0)),meanBestOpportunityXG:avg(opportunities.map(k=>k.best.probability)),meanBestOnTarget:avg(opportunities.map(k=>k.best.onTarget)),meanBestSaveGivenOnTarget:avg(opportunities.map(k=>k.best.saveGivenOnTarget)),meanBestBlockProbability:avg(opportunities.map(k=>k.best.blockProbability)),meanBestShotDistance:avg(opportunities.map(k=>k.best.distance)),goalDistanceAtKick: Object.fromEntries([3,5,8,12,18].map((n,i,all)=>[`${i?all[i-1]+1:0}-${n}`,kickChoices.filter(k=>k.goalDistance>(i?all[i-1]:-1)&&k.goalDistance<=n).length])),topDeclinedShots:declined.slice(0,12),largestDribbleRuns:dribbleRuns.sort((a,b)=>b.count-a.count).slice(0,10),maxCarrierRun:Math.max(0,...dribbleRuns.map(r=>r.count)),exactPositionRepeats:repeats,teamMoveCycleRepeats:tokenRepeats,allKickChoices:kickChoices,carrierMoves};
}
const paths=process.argv.slice(2),results=paths.map(p=>analyze(JSON.parse(fs.readFileSync(p))));
for(let i=0;i<results.length;i++){const name=paths[i].split('/').at(-1).replace('.json','-analysis.json');fs.writeFileSync(new URL(name,dir),JSON.stringify(results[i],null,2));}
console.log(JSON.stringify(results.map(({allKickChoices,carrierMoves,...r})=>r),null,2));
