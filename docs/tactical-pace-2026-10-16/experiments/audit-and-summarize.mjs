import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {applyAction} from './simulate.mjs';
const cases=[{seed:202610161,kickoff:'white'},{seed:202610162,kickoff:'black'}];
const json=async relative=>JSON.parse(await readFile(new URL(relative,import.meta.url),'utf8'));
const variants={};let totalReplayed=0;
for(const name of ['keeper-reach','range-decay']){
 const rules=await import(`./${name}.mjs`),matches=[];
 for(const item of cases){
  const match=await json(`./${name}/${item.seed}-${item.kickoff}.json`);
  let state=rules.createGame({mode:'local',seed:item.seed,kickoff:item.kickoff,minutes:10,foulsEnabled:true});
  for(const event of match.events){
   state=applyAction(rules,state,event.action);
   if(JSON.stringify(state)!==JSON.stringify(event.state))throw new Error(`Replay mismatch ${name} ${item.seed} step${event.step}`);
   totalReplayed++;
  }
  const sum=key=>match.stats.white[key]+match.stats.black[key];
  matches.push({...item,actions:match.actions,score:match.score,shots:sum('shots'),resolvedShots:sum('resolvedShots'),xG:sum('xG'),goals:sum('goals'),stalls:sum('stalls'),corners:sum('cornersWon'),blockedShots:sum('blockedShots'),longPasses:sum('longPasses'),ordinaryRounds:sum('completedOrdinaryRounds'),meanShotDistance:sum('resolvedShots')?sum('shotDistance')/sum('resolvedShots'):null,error:match.error,elapsedMs:match.elapsedMs,exactReplayTransitions:match.events.length});
 }
 const fields=['actions','shots','resolvedShots','xG','goals','stalls','corners','blockedShots','longPasses','ordinaryRounds','exactReplayTransitions'];
 variants[name]={matches,totals:Object.fromEntries(fields.map(key=>[key,matches.reduce((n,m)=>n+m[key],0)])),sourceSha256:createHash('sha256').update(await readFile(new URL(`./${name}.mjs`,import.meta.url))).digest('hex')};
}
const baseline=[];
for(const item of cases){
 const log=await readFile(new URL(`../diagnosis/baseline-${item.seed}-${item.kickoff}.log`,import.meta.url),'utf8');
 const checkpoint=log.split('\n').map(line=>{try{return JSON.parse(line);}catch{return null;}}).find(row=>row?.step===240);
 if(!checkpoint)throw new Error('Missing paired 240-action baseline checkpoint');
 baseline.push(checkpoint);
}
const report={protocol:await json('./protocol.json'),pairedBaseline240:baseline,variants,geometry:(await json('./geometry-grid.json')).summary,audit:{exactReplayedTransitions:totalReplayed,mismatches:0},interpretation:['The screen uses exactly two predeclared seeds,240 atomic actions per case,unchanged1400-node Tactical on both sides,fouls ON. It is not a timed ten-minute match evaluation.','A keeper reach improves 80/200 synthetic open-lane best-shot cases but leaves perfectly aligned saves unchanged. Its match screen produces more shots, predominantly short queen attempts; one goal is not proof of a stable scoreline increase.','B distance decay improves long-shot geometry but produces only3 total attempts in the screen,including one zero-shot case; it does not address the main lack of legal chances.','Combined C was separately frozen before its outcomes, retaining original reach/distance coefficients and changing keeper save cap .94→.90 alongside the new anti-repetition and four-round carrier rules. Its match results are tracked separately by the parent task.']};
await writeFile(new URL('./screen-report.json',import.meta.url),JSON.stringify(report,null,2));
console.log(JSON.stringify({baseline,variants:Object.fromEntries(Object.entries(variants).map(([name,v])=>[name,v.totals])),audit:report.audit}));
