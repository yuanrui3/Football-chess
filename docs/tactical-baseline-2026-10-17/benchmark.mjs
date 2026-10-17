import {Worker, isMainThread, parentPort, workerData} from 'node:worker_threads';
import {readFile, writeFile, mkdir, copyFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pathToFileURL, fileURLToPath} from 'node:url';
import {performance} from 'node:perf_hooks';
import path from 'node:path';

const root=path.dirname(fileURLToPath(import.meta.url));
const frozenEngine=path.join(root,'frozen/dist/engine.js');
const digest=async p=>createHash('sha256').update(await readFile(p)).digest('hex');
const other=t=>t==='white'?'black':'white';

if(!isMainThread){
  const {runEvaluationScenario}=await import('./frozen/scripts/evaluate-selfplay.mjs');
  const [rules,candidate,baseline]=await Promise.all([workerData.rules,workerData.candidate,frozenEngine].map(p=>import(pathToFileURL(p).href)));
  const tactical=module=>state=>module.analyzeTacticalAction(state,{nodeLimit:workerData.nodes,maxDepth:workerData.depth,extensions:true,modelWeights:null});
  const candidatePolicy=tactical(candidate);
  const baselinePolicy=workerData.opponent==='tactical'?tactical(baseline):state=>baseline.chooseAIAction(state,{difficulty:'casual',modelWeights:null});
  parentPort.on('message',task=>{
    if(task.type!=='run')return;
    try{
      const initialState=rules.createGame({mode:'local',seed:task.seed,kickoff:task.kickoff,foulsEnabled:task.fouls});
      const match=runEvaluationScenario({rules,initialState,seed:task.seed,kickoff:task.kickoff,candidateColor:task.candidateColor,
        whitePolicy:task.candidateColor==='white'?candidatePolicy:baselinePolicy,
        blackPolicy:task.candidateColor==='black'?candidatePolicy:baselinePolicy,
        actionLimit:workerData.actions,nodeLimit:workerData.nodes,record:workerData.record});
      parentPort.postMessage({type:'result',index:task.index,match:{...match,foulsEnabled:task.fouls}});
    }catch(e){parentPort.postMessage({type:'fatal',index:task.index,error:e.stack});}
  });
  parentPort.postMessage({type:'ready'});
}else{
  const args={};for(let i=2;i<process.argv.length;i+=2){if(!process.argv[i]?.startsWith('--')||process.argv[i+1]===undefined)throw Error('Flags require values');args[process.argv[i].slice(2)]=process.argv[i+1];}
  const label=args.label??'baseline';
  const out=path.resolve(args.out??path.join(root,label));await mkdir(out,{recursive:true});
  const candidate=path.join(out,'candidate-engine.mjs');await copyFile(path.resolve(args.candidate??frozenEngine),candidate);
  const rules=path.join(out,'rules-engine.mjs');await copyFile(path.resolve(args.rules??frozenEngine),rules);
  const seeds=(args.seeds??'610017').split(',').map(Number);
  const fouls=args.fouls==='both'?[true,false]:[args.fouls!=='false'];
  const actions=Number(args.actions??480),nodes=Number(args.nodes??1400),depth=Number(args.depth??8),workers=Number(args.workers??2);
  if(!seeds.length||seeds.some(s=>!Number.isInteger(s))||![1,2,3].includes(workers)||![true,false].includes(args.record==='true')||actions<1)throw Error('Invalid config');
  const config={label,split:args.split??'dev',seeds,fouls,actions,nodes,depth,workers,opponent:args.opponent??'casual',record:args.record==='true',candidate,rules,
    modelWeights:null,candidateSha256:await digest(candidate),rulesSha256:await digest(rules),baselineSha256:await digest(frozenEngine),startedAt:new Date().toISOString()};
  await writeFile(path.join(out,'config.json'),JSON.stringify(config,null,2)+'\n');
  const tasks=[];for(const seed of seeds)for(const foul of fouls)for(const candidateColor of ['white','black'])for(const kickoff of ['white','black'])tasks.push({type:'run',index:tasks.length,seed,fouls:foul,candidateColor,kickoff});
  const matches=Array(tasks.length),started=performance.now();let cursor=0,completed=0;
  function summarize(){
    const done=matches.filter(Boolean);
    const aggregate=asCandidate=>{
      const sums={actions:0,goals:0,shots:0,resolvedShots:0,xG:0,stalls:0,repetitions:0,dribbleLimit:0,offsides:0,passes:0,dribbles:0,tackles:0,thinkMs:0,nodes:0,maxNodes:0,completedDepthTotal:0};
      const ts=[];for(const m of done){const color=asCandidate?m.candidateColor:other(m.candidateColor);for(const k of Object.keys(sums))sums[k]=k==='maxNodes'?Math.max(sums[k],m.stats[color][k]??0):sums[k]+(m.stats[color][k]??0);ts.push(...m.timings[color]);}
      ts.sort((a,b)=>a-b);return {...sums,meanThinkMs:sums.actions?sums.thinkMs/sums.actions:null,p95ThinkMs:ts.length?ts[Math.floor((ts.length-1)*.95)]:null,meanCompletedDepth:sums.actions?sums.completedDepthTotal/sums.actions:null};
    };
    const c=aggregate(true),b=aggregate(false),wdl={wins:0,draws:0,losses:0};for(const m of done)wdl[m.candidateResult==='win'?'wins':m.candidateResult==='loss'?'losses':'draws']++;
    return {config,completed:done.length,planned:tasks.length,wdl,wdlScore:done.length?(wdl.wins+.5*wdl.draws)/done.length:null,goalDifference:c.goals-b.goals,xGDifference:c.xG-b.xG,candidate:c,baseline:b,
      errors:done.filter(m=>m.error||m.safetyLimitReached||m.pendingShot).map(m=>({seed:m.seed,candidateColor:m.candidateColor,kickoff:m.kickoff,error:m.error,pendingShot:m.pendingShot,safetyLimitReached:m.safetyLimitReached})),wallMs:performance.now()-started,note:'Fixed atomic-action scenarios with launched shots settled; not timed soccer matches. Seeds pair both colors and both kickoffs. All policies mask hidden RNG and learned weights are disabled.'};
  }
  await Promise.all(Array.from({length:Math.min(workers,tasks.length)},()=>new Promise((resolve,reject)=>{
    const w=new Worker(new URL(import.meta.url),{workerData:{rules,candidate,opponent:config.opponent,nodes,depth,actions,record:config.record}});
    let finished=false;
    const dispatch=()=>{if(cursor<tasks.length)w.postMessage(tasks[cursor++]);else{finished=true;w.terminate();resolve();}};
    w.on('error',reject);w.on('exit',code=>{if(code&&!finished)reject(Error('Worker exited '+code));});
    w.on('message',async message=>{try{
      if(message.type==='ready')dispatch();
      else if(message.type==='fatal')reject(Error(message.error));
      else if(message.type==='result'){
        const m=message.match;matches[message.index]=m;completed++;
        const name=`match-${String(message.index).padStart(3,'0')}-${m.seed}-${m.foulsEnabled?'fouls':'clean'}-${m.candidateColor}-${m.kickoff}.json`;
        await writeFile(path.join(out,name),JSON.stringify(m)+'\n');
        await writeFile(path.join(out,'summary.json'),JSON.stringify(summarize(),null,2)+'\n');
        console.log(JSON.stringify({completed,planned:tasks.length,seed:m.seed,fouls:m.foulsEnabled,candidateColor:m.candidateColor,kickoff:m.kickoff,result:m.candidateResult,score:m.score,actions:m.actions,xG:[m.stats[m.candidateColor].xG,m.stats[other(m.candidateColor)].xG],shots:[m.stats[m.candidateColor].shots,m.stats[other(m.candidateColor)].shots],elapsedMs:Math.round(m.elapsedMs),error:m.error}));dispatch();
      }
    }catch(e){reject(e);}});
  })));
  const final=summarize();final.completedAt=new Date().toISOString();
  if(await digest(candidate)!==config.candidateSha256||await digest(rules)!==config.rulesSha256||await digest(frozenEngine)!==config.baselineSha256)throw Error('An immutable benchmark input changed during evaluation');
  await writeFile(path.join(out,'summary.json'),JSON.stringify(final,null,2)+'\n');console.log(JSON.stringify({done:true,summary:final}));
}
