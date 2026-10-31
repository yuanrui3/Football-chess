// Re-run each illustrative human plan against the actual exercise opponent.
// Chance outcomes use the ordinary seed; no forced goals or tackle misses.
import {Worker,isMainThread,parentPort,workerData} from 'node:worker_threads';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import path from 'node:path';
import {EXERCISES} from '../dist/exercise-positions.js';
import {EXERCISE_SOLUTIONS} from '../dist/exercise-solutions.js';
import {createExerciseSession,applyExerciseAction} from '../dist/exercise-session.js';
import {currentTeam} from '../dist/engine.js';
import {analyzeExerciseAction,EXERCISE_AI_VERSION} from '../dist/exercise-ai.js';

if(isMainThread){
  const args=process.argv.slice(2),arg=name=>args[args.indexOf(name)+1];
  const out=path.resolve(args.includes('--output')?arg('--output'):'docs/exercise-defence-depth-2026-10-31/audit.json');
  const definitions=args.includes('--definitions')?JSON.parse(await readFile(arg('--definitions'),'utf8')):EXERCISES;
  const wanted=args.includes('--only')?arg('--only').split(',').map(Number):definitions.map((_,i)=>i+1);
  const records=[];let cursor=0;await mkdir(path.dirname(out),{recursive:true});
  const save=()=>writeFile(out,JSON.stringify({aiVersion:EXERCISE_AI_VERSION,seed:1984,
    requested:wanted.length,completed:records.length,solved:records.filter(r=>r.status==='solved').length,
    records:[...records].sort((a,b)=>a.number-b.number)},null,2)+'\n');
  // Serialize writes while keeping independent studies in separate workers.
  let writes=Promise.resolve();
  async function slot(){while(cursor<wanted.length){const number=wanted[cursor++];
    const result=await new Promise((resolve,reject)=>{
      let result;const worker=new Worker(new URL(import.meta.url),{workerData:{number,definition:definitions[number-1]}});
      worker.on('message',value=>{result=value;});worker.on('error',reject);
      worker.on('exit',code=>code||!result?reject(Error(`Exercise ${number} audit failed`)):resolve(result));
    });records.push(result);writes=writes.then(save);await writes;
    console.log(JSON.stringify({number,title:result.title,status:result.status,xg:result.xg,
      error:result.error,replyChanged:result.replyChanged,seconds:result.seconds}));
  }}
  await Promise.all(Array.from({length:4},slot));await writes;
}else{
  const {number,definition}=workerData,seed=1984,trace=[],start=performance.now();
  let session=createExerciseSession(definition,{seed}),error=null;
  function act(action,analysis=null){
    const before=session.game,actor=currentTeam(before),at=performance.now();
    session=applyExerciseAction(session,action);
    trace.push({actor,phase:before.phase,action,result:session.game.lastAction,
      rounds:session.roundsUsed,...(analysis?{analysis}:{}),applyMs:performance.now()-at});
  }
  function reply(){for(let n=0;session.status==='active'&&currentTeam(session.game)!==session.playerTeam;n++){
    if(n>=18)throw Error('Study opponent did not return control');
    const at=performance.now(),report=analyzeExerciseAction(session.game);
    act(report.action,{reason:report.reason,stats:report.stats,line:report.line,
      expectedOpponentShotXG:report.expectedOpponentShotXG,ms:performance.now()-at});
  }}
  let nextHuman=0;
  try{for(const action of definition.exampleActions){reply();if(session.status!=='active')throw Error(`Example ended before human action ${nextHuman+1}`);act(action);nextHuman++;}reply();}
  catch(e){error=e.message;}
  const original=EXERCISE_SOLUTIONS.examples[definition.id]?.actions||[];
  parentPort.postMessage({number,id:definition.id,title:definition.title,revision:definition.revision||1,
    status:error?'illegal':session.status,error,nextHuman,xg:session.metrics.lastShotXG,
    rounds:session.roundsUsed,limit:session.roundLimit,target:definition.goal,
    feedback:session.feedback,replyChanged:JSON.stringify(trace.map(s=>s.action))!==JSON.stringify(original),
    seconds:Math.round((performance.now()-start)/100)/10,trace,finalGame:session.game});
}
