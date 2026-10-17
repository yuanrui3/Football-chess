import {readFile,readdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
const directory=path.resolve(process.argv[2]),limit=Number(process.argv[3]??160),other=t=>t==='white'?'black':'white';
const matches=[];
for(const name of (await readdir(directory)).filter(n=>/^match-.*\.json$/.test(n)).sort()){
  const m=JSON.parse(await readFile(path.join(directory,name),'utf8'));
  if(!m.events)throw Error('Requires --record true');
  let events=m.events.slice(0,limit);
  if(events.at(-1)?.result?.type==='shotAttempt'&&m.events[limit])events.push(m.events[limit]);
  const stats=Object.fromEntries(['white','black'].map(t=>[t,{actions:0,goals:0,shots:0,resolvedShots:0,xG:0,stalls:0,offsides:0}]));
  for(const e of events){
    stats[e.team].actions++;
    if(e.result?.type==='shotAttempt')stats[e.team].shots++;
    const r=e.phase==='keeperReact'&&e.result.type==='stalling'&&e.result.triggeringAction?.shotModel?e.result.triggeringAction:e.result;
    if(e.phase==='keeperReact'&&['goal','save','shotMiss','blockedShot'].includes(r.type)){
      stats[r.shootingTeam].resolvedShots++;stats[r.shootingTeam].xG+=r.shotModel.probability;
    }
    if(e.result?.type==='stalling')stats[e.result.team].stalls++;
    if(e.result?.type==='offside'&&e.phase!=='keeperReact')stats[e.result.team].offsides++;
  }
  const score=events.at(-1)?.score??m.initialScore;
  for(const t of ['white','black']){
    stats[t].goals=score[t]-m.initialScore[t];
    const ts=m.timings[t].slice(0,stats[t].actions).sort((a,b)=>a-b);
    stats[t].meanThinkMs=ts.reduce((a,b)=>a+b,0)/ts.length;
    stats[t].p95ThinkMs=ts[Math.floor((ts.length-1)*.95)];
  }
  const c=m.candidateColor,b=other(c);
  matches.push({source:name,seed:m.seed,kickoff:m.kickoff,candidateColor:c,foulsEnabled:m.foulsEnabled,actions:events.length,score,candidateResult:score[c]===score[b]?'draw':score[c]>score[b]?'win':'loss',candidate:stats[c],baseline:stats[b]});
}
const wdl={wins:0,draws:0,losses:0};for(const m of matches)wdl[m.candidateResult==='win'?'wins':m.candidateResult==='loss'?'losses':'draws']++;
const sums=side=>Object.fromEntries(['goals','shots','resolvedShots','xG','stalls','offsides'].map(k=>[k,matches.reduce((s,m)=>s+m[side][k],0)]));
const report={prefixActions:limit,matches:matches.length,wdl,candidate:sums('candidate'),baseline:sums('baseline'),legs:matches,note:'Exact prefix of the same deterministic policies and environment trajectory; any launched shot at the prefix boundary is settled.'};
await writeFile(path.join(directory,`prefix-${limit}.json`),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
