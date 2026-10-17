import {readFile,readdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.dirname(fileURLToPath(import.meta.url));
// Keep preregistered test outcomes blind until the parent explicitly locks a
// candidate and requests --unblind. Development reports must never leak them.
const unblind=process.argv.includes('--unblind');
const authorization=unblind?JSON.parse(await readFile(path.join(root,'unblinding-authorization.json'),'utf8')):{rounds:[]};
const allowedTestSeeds=new Set(authorization.rounds.flatMap(round=>round.authorizedSeeds));
const names=(await readdir(root,{withFileTypes:true})).filter(d=>d.isDirectory()&&(unblind||!d.name.includes('heldout'))).map(d=>d.name)
  .concat('refinement-v7/finish-preserved-v7-dev');
const other=t=>t==='white'?'black':'white';
const key=m=>[m.seed,m.foulsEnabled,m.candidateColor,m.kickoff].join('/');
function prefix(m,limit){
  if(!m.events)return null;
  const events=m.events.slice(0,limit);if(events.at(-1)?.result?.type==='shotAttempt'&&m.events[limit])events.push(m.events[limit]);
  const c=m.candidateColor,b=other(c),s={};for(const t of [c,b])s[t]={goals:0,shots:0,xG:0,stalls:0,offsides:0};
  for(const e of events){
    if(e.result.type==='shotAttempt')s[e.team].shots++;
    const r=e.phase==='keeperReact'&&e.result.type==='stalling'&&e.result.triggeringAction?.shotModel?e.result.triggeringAction:e.result;
    if(e.phase==='keeperReact'&&['goal','save','shotMiss','blockedShot'].includes(r.type))s[r.shootingTeam].xG+=r.shotModel.probability;
    if(e.result.type==='stalling')s[e.result.team].stalls++;
    if(e.result.type==='offside'&&e.phase!=='keeperReact')s[e.result.team].offsides++;
  }
  const score=events.at(-1)?.score??m.initialScore;for(const t of [c,b])s[t].goals=score[t]-m.initialScore[t];
  return {key:key(m),actions:events.length,candidate:s[c],baseline:s[b]};
}
const batches=[];
for(const name of names){
  try{
    const directory=path.join(root,name),config=JSON.parse(await readFile(path.join(directory,'config.json'),'utf8'));
    if(config.label==='portable-smoke')continue; // four one-action infrastructure checks, not study games
    const isTest=['heldout','test'].includes(config.split)||name.includes('heldout');
    if(isTest&&(!unblind||!config.seeds.every(seed=>allowedTestSeeds.has(seed))))continue;
    const files=(await readdir(directory)).filter(n=>/^match-.*\.json$/.test(n)).sort();
    const matches=await Promise.all(files.map(f=>readFile(path.join(directory,f),'utf8').then(JSON.parse)));
    const summary=JSON.parse(await readFile(path.join(directory,'summary.json'),'utf8'));
    batches.push({label:name,config,summary,matches,prefix:matches.map(m=>prefix(m,160)).filter(Boolean)});
  }catch(e){if(!['ENOENT','ENOTDIR'].includes(e.code))throw e;}
}
const baseline=batches.find(b=>b.label==='baseline-v40');
const frozenControlSha=baseline?.config.candidateSha256;
const metrics=legs=>{
  const totals={wins:0,draws:0,losses:0,goalsFor:0,goalsAgainst:0,xGFor:0,xGAgainst:0,shotsFor:0,shotsAgainst:0,stallsFor:0,stallsAgainst:0};
  for(const l of legs){const c=l.candidate,b=l.baseline;totals[c.goals===b.goals?'draws':c.goals>b.goals?'wins':'losses']++;totals.goalsFor+=c.goals;totals.goalsAgainst+=b.goals;totals.xGFor+=c.xG;totals.xGAgainst+=b.xG;totals.shotsFor+=c.shots;totals.shotsAgainst+=b.shots;totals.stallsFor+=c.stalls;totals.stallsAgainst+=b.stalls;}
  return {legs:legs.length,...totals};
};
const fullLeg=m=>({key:key(m),candidate:m.stats[m.candidateColor],baseline:m.stats[other(m.candidateColor)],actionLimit:m.actionLimit});
const rows=batches.map(batch=>{
  const testBatch=['heldout','test'].includes(batch.config.split)||batch.label.includes('heldout');
  const controlBatches=batches.filter(c=>c.config.candidateSha256===frozenControlSha&&c.config.opponent===batch.config.opponent
    &&c.config.nodes===batch.config.nodes&&c.config.depth===batch.config.depth
    &&(['heldout','test'].includes(c.config.split)||c.label.includes('heldout'))===testBatch
    &&c.config.seeds.some(seed=>batch.config.seeds.includes(seed)));
  const controlByKey=new Map();
  for(const c of controlBatches)for(const m of c.matches)if(!controlByKey.has(key(m))||controlByKey.get(key(m)).actions<m.actions)controlByKey.set(key(m),m);
  const controlBatch={label:controlBatches.map(c=>c.label).join('+')||null,matches:[...controlByKey.values()],prefix:[...controlByKey.values()].map(m=>prefix(m,160)).filter(Boolean)};
  const controls=new Map((controlBatch?.prefix??[]).map(l=>[l.key,l]));
  const fullControls=new Map((controlBatch?.matches??[]).map(m=>[key(m),fullLeg(m)]));
  const controlMatches=new Map((controlBatch?.matches??[]).map(m=>[key(m),m]));
  const paired=batch.prefix.filter(l=>controls.has(l.key)),control=paired.map(l=>controls.get(l.key));
  const fullPaired=batch.matches.map(fullLeg).filter(l=>fullControls.has(l.key)&&fullControls.get(l.key).actionLimit===l.actionLimit);
  const firstGoals=batch.matches.map(m=>({key:key(m),candidate:m.events?.find(e=>e.result.type==='goal'&&e.result.team===m.candidateColor)?.step??null,
    opponent:m.events?.find(e=>e.result.type==='goal'&&e.result.team!==m.candidateColor)?.step??null,
    any:m.events?.find(e=>e.result.type==='goal')?.step??null}));
  const scored=firstGoals.map(g=>g.candidate).filter(x=>x!==null).sort((a,b)=>a-b);
  const checkpoints=Object.fromEntries([160,200,240,480].map(limit=>{
    const eligible=batch.matches.filter(m=>m.actions>=limit||m.terminal),legs=eligible.map(m=>prefix(m,limit)).filter(Boolean);
    return [limit,legs.length?metrics(legs):null];
  }));
  const commonCheckpoints=Object.fromEntries([160,200,240,480].map(limit=>{
    const pairs=batch.matches.filter(m=>(m.actions>=limit||m.terminal)&&controlMatches.has(key(m)))
      .map(m=>[prefix(m,limit),prefix(controlMatches.get(key(m)),limit)]).filter(p=>p.every(Boolean));
    return [limit,{candidate:metrics(pairs.map(p=>p[0])),control:metrics(pairs.map(p=>p[1]))}];
  }));
  return {label:batch.label,split:batch.config.split,seeds:batch.config.seeds,controlLabel:controlBatch?.label??null,planned:batch.summary.planned,completed:batch.matches.length,actions:batch.config.actions,opponent:batch.config.opponent,fouls:batch.config.fouls,sha256:batch.config.candidateSha256,
    full:{wdl:batch.summary.wdl,goals:[batch.summary.candidate.goals,batch.summary.baseline.goals],xG:[batch.summary.candidate.xG,batch.summary.baseline.xG],shots:[batch.summary.candidate.shots,batch.summary.baseline.shots],stalls:[batch.summary.candidate.stalls,batch.summary.baseline.stalls],meanThinkMs:batch.summary.candidate.meanThinkMs,p95ThinkMs:batch.summary.candidate.p95ThinkMs,meanDepth:batch.summary.candidate.meanCompletedDepth,errors:batch.summary.errors.length},
    prefix160:metrics(batch.prefix),commonPrefix160:{candidate:metrics(paired),control:metrics(control)},
    commonFullHorizon:{candidate:metrics(fullPaired),control:metrics(fullPaired.map(l=>fullControls.get(l.key)))},
    firstGoalActions:{scoredLegs:scored.length,noCandidateGoalLegs:batch.matches.length-scored.length,
      medianConditionalOnScoring:scored.length?(scored.length%2?scored[(scored.length-1)/2]:(scored[scored.length/2-1]+scored[scored.length/2])/2):null,legs:firstGoals},checkpoints,commonCheckpoints};
});
const result={updatedAt:new Date().toISOString(),baseline:'baseline-v40',rows,note:'Full horizons and atomic 160-action prefixes are separate. Common-prefix comparisons use exactly matched seed/fouls/color/kickoff legs. Whole seed clusters, not individual legs, are independent samples.'};
await writeFile(path.join(root,'comparison-progress.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
