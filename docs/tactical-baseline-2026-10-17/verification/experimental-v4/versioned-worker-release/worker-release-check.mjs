import {Worker} from 'node:worker_threads';
import {writeFile,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';

const directory=new URL('./',import.meta.url);
const project=resolve(process.argv[2]||'/workspace/github/football-chess-pace');
const reportURL=new URL('worker-release-check.json',directory);
const wrapperURL=new URL('worker-release-wrapper.mjs',directory);
const digest=value=>createHash('sha256').update(value).digest('hex');
const [appSource,workerSource,engineSource,html]=await Promise.all(['app.js','ai-worker.js','engine.js','index.html'].map(name=>readFile(join(project,'dist',name),'utf8')));
const appURL=pathToFileURL(join(project,'dist/app.js'));
const workerReference=appSource.match(/new URL\(['"](\.\/ai-worker\.js\?v=[a-f0-9]+)['"],import\.meta\.url\)/)?.[1];
const appEngineReference=appSource.match(/from ['"](\.\/engine\.js\?v=[a-f0-9]+)['"]/)?.[1];
const workerEngineReference=workerSource.match(/from ['"](\.\/engine\.js\?v=[a-f0-9]+)['"]/)?.[1];
assert.ok(workerReference&&appEngineReference&&workerEngineReference,'the real app and worker must reference versioned modules');
const workerURL=new URL(workerReference,appURL),engineURL=new URL(appEngineReference,appURL);
const hashes={app:digest(appSource),worker:digest(workerSource),engine:digest(engineSource)};
assert.equal(workerURL.searchParams.get('v'),hashes.worker.slice(0,12),'app worker cache tag matches its actual file');
assert.equal(engineURL.searchParams.get('v'),hashes.engine.slice(0,12),'app engine cache tag matches its actual file');
assert.equal(new URL(workerEngineReference,workerURL).href,engineURL.href,'worker imports the exact versioned engine used by the app');
assert.equal(html.match(/src="app\.js\?v=([a-f0-9]+)"/)?.[1],hashes.app.slice(0,12),'HTML app cache tag is current');
const E=await import(engineURL.href);
await writeFile(wrapperURL,`import {parentPort} from 'node:worker_threads';\nimport {isDeepStrictEqual} from 'node:util';\nglobalThis.self={postMessage:value=>parentPort.postMessage(value)};\nawait import(${JSON.stringify(workerURL.href)});\nparentPort.on('message',data=>{const before=structuredClone(data.state);self.onmessage({data});parentPort.postMessage({requestId:data.requestId,inputVerification:{unchanged:isDeepStrictEqual(data.state,before)}});});\nparentPort.postMessage({ready:true,workerURL:${JSON.stringify(workerURL.href)}});\n`);

function legal(state,action){
  assert.ok(action&&typeof action==='object');
  if(action.type==='kick'){
    const kick=E.legalKicks(state).find(k=>k.x===action.x&&k.y===action.y);assert.ok(kick,'kick obeys public rules');
    if(action.disguise)assert.equal(E.disguisedShotTargets(state).length,2);
    return kick;
  }
  if(action.type==='move'){
    const move=E.legalMoves(state,action.pieceId,{freePawn:!!action.freePawn}).find(m=>m.x===action.x&&m.y===action.y);assert.ok(move,'move obeys public rules and action budgets');return move;
  }
  if(action.type==='cornerTaker'){assert.ok(E.cornerTakers(state).some(p=>p.id===action.pieceId));return null;}
  assert.equal(action.type,'skip');assert.ok(['attackMove','defendMove','passRun','keeperReact'].includes(state.phase)||!state.ball.carrierId);return null;
}
function apply(state,action){
  if(action.type==='kick')return E.applyKick(state,action.x,action.y,{roll:0,passRun:!!action.passRun,disguise:!!action.disguise});
  if(action.type==='move')return E.applyMove(state,action.pieceId,action.x,action.y,{roll:0,freePawn:!!action.freePawn});
  if(action.type==='cornerTaker')return E.selectCornerTaker(state,action.pieceId);
  return E.skipMove(state,{roll:0});
}
function legalPrincipalPrefix(initial,line){
  let state=initial;
  for(const step of line){
    assert.equal(step.phase,state.phase);assert.equal(step.team,E.currentTeam(state));
    const choice=legal(state,step.action);
    if(state.phase==='keeperReact'||step.action.type==='kick'&&choice&&!choice.goal&&choice.accuracy<1||step.action.type==='move'&&choice?.type==='tackle'&&choice.tackleProbability<1)break;
    state=apply(state,step.action);
  }
}
function reply(worker,request,state){
  return new Promise((resolveReply,rejectReply)=>{
    const snapshots=[],before=structuredClone(state);let final=null,verified=false,lastDepth=0;
    const cleanup=()=>{clearTimeout(timer);worker.off('message',onMessage);worker.off('error',onError);worker.off('exit',onExit);};
    const fail=error=>{cleanup();rejectReply(error);};
    const onError=error=>fail(error),onExit=code=>fail(new Error(`Worker exited before its final verified reply (${code})`));
    const timer=setTimeout(()=>fail(new Error('Versioned worker request timed out')),60000);
    const onMessage=message=>{try{
      assert.equal(message.requestId,request.requestId);
      assert.ok(!message.error,message.error);
      if(message.progress){
        const snapshot=message.progress;
        assert.ok(Number.isInteger(snapshot.stats?.completedDepth)&&snapshot.stats.completedDepth>lastDepth,'progress comes only from successively completed iterations');
        assert.equal(snapshot.stats.aborted,false);assert.ok(snapshot.stats.nodes<=1400);
        legal(state,snapshot.action);assert.ok(Array.isArray(snapshot.line));
        if(snapshot.line.length)assert.deepEqual(snapshot.line[0].action,snapshot.action);
        legalPrincipalPrefix(state,snapshot.line);assert.deepEqual(state,before);
        lastDepth=snapshot.stats.completedDepth;
        snapshots.push(structuredClone(snapshot));
        // Simulate a consumer editing its received progress. A later final
        // action must still equal an independent main-thread search result.
        snapshot.action.type='consumer-mutated';snapshot.stats.nodes=1e9;snapshot.line.length=0;
      }else if(message.inputVerification){assert.equal(message.inputVerification.unchanged,true,'worker planning preserves its received state');verified=true;}
      else{assert.ok(message.action,'wait for FINAL action rather than treating progress as the reply');legal(state,message.action);final=message.action;}
      if(final&&verified){cleanup();assert.deepEqual(state,before);resolveReply({action:final,snapshots});}
    }catch(error){fail(error);}};
    worker.on('message',onMessage);worker.once('error',onError);worker.once('exit',onExit);worker.postMessage(request);
  });
}
const worker=new Worker(wrapperURL),checks=[];
let report;
try{
  await new Promise((ready,reject)=>{
    const timer=setTimeout(()=>reject(new Error('Versioned worker did not become ready')),15000);
    worker.once('error',reject);
    worker.once('message',message=>{try{assert.equal(message.ready,true);assert.equal(message.workerURL,workerURL.href);clearTimeout(timer);worker.off('error',reject);ready();}catch(error){clearTimeout(timer);reject(error);}});
  });
  const kickoff=E.createGame({seed:210003,foulsEnabled:true});
  const openingPass=E.chooseAIAction(kickoff,{difficulty:'casual',modelWeights:null});
  const attackMove=E.applyKick(kickoff,openingPass.x,openingPass.y,{roll:0});assert.equal(attackMove.phase,'attackMove');
  for(const [stateIndex,state] of [kickoff,attackMove].entries()){
    const before=structuredClone(state),expected=E.analyzeTacticalAction(state,{modelWeights:null});
    assert.deepEqual(state,before);legal(state,expected.action);assert.ok(expected.stats.nodes<=1400);
    for(const learnedEvaluation of [false,true]){
      const requestId=checks.length+1;
      const result=await reply(worker,{requestId,state,difficulty:'tactical',learnedEvaluation,modelWeights:Array(37).fill(.25)},state);
      assert.deepEqual(result.action,expected.action,'legacy flags and supplied weights cannot change handcrafted worker selection');
      assert.ok(result.snapshots.length>0,'the real worker publishes completed iterations');
      const deepest=result.snapshots.at(-1);
      assert.equal(deepest.stats.completedDepth,expected.stats.completedDepth);assert.deepEqual(deepest.action,expected.action);assert.equal(deepest.value,expected.value);assert.deepEqual(deepest.line,expected.line);
      assert.deepEqual(state,before);apply(state,result.action);assert.deepEqual(state,before);
      checks.push({state:stateIndex,phase:state.phase,learnedEvaluation,modelWeightsForcedNull:true,progressDepths:result.snapshots.map(s=>s.stats.completedDepth),deepestCompletedDepth:deepest.stats.completedDepth,action:result.action,inputPreserved:true,progressLegal:true,passed:true});
    }
  }
  report={passed:true,actualVersionedWorker:true,project,workerURL:workerURL.href,engineURL:engineURL.href,hashes,checks};
}catch(error){report={passed:false,actualVersionedWorker:true,project,hashes,checks,error:error.stack||String(error)};process.exitCode=1;}
finally{await worker.terminate();}
await writeFile(reportURL,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
