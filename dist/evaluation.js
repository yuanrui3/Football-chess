/** One running analysis and one latest pending position; no game/chance mutations. */
const clone = value => typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value));
const FIELDS = ['pieces','ball','attack','phase','positionBudget','restart','offside','pendingShot',
  'ballProgress','paceControl','looseBallKickOrigin','releaseReason','passRun','rulesVersion','turn',
  'foulsEnabled','discipline','sentOff','winner','finishReason'];
export function evaluationPositionKey(game) {
  return JSON.stringify(FIELDS.map(key=>game?.[key]??null));
}
export function evaluationSnapshot(game) {
  const snapshot = clone(game);
  // Planning uses expected outcomes. The real match's future chance seed must
  // never leave the match controller or influence an analysis score.
  snapshot.randomState = 1;
  snapshot.score = {white:0,black:0};
  return snapshot;
}
export function formatEvaluation(state) {
  if (state?.terminal) return 'No active round';
  if (!Number.isFinite(state?.score)) return '—';
  if (Math.abs(state.score) < 0.005) return 'Level 0.00';
  return `${state.score > 0 ? 'Ivory' : 'Obsidian'} +${Math.abs(state.score).toFixed(2)}`;
}
export function createEvaluation({WorkerCtor = globalThis.Worker,onUpdate = ()=>{},
  workerUrl = new URL('./evaluation-worker.js?v=3b228aa23eaa',import.meta.url),setTimer = setTimeout,clearTimer = clearTimeout,
  timeoutMs = 12000} = {}) {
  let enabled=false,suspended=false,destroyed=false,worker=null,generation=0,serial=0;
  let latestInput=null,latestKey=null,running=null,pending=null,result=null;
  let view={enabled:false,status:'off',whiteValue:null,score:null,share:0.5,depth:0,nodes:0};
  const publish=(status,error=null)=>{
    view={enabled,status,whiteValue:null,score:null,share:0.5,depth:0,nodes:0,...result,...(error?{error}: {})};
    onUpdate({...view}); return view;
  };
  function terminate() {
    if(running?.timer!=null)clearTimer(running.timer);
    running=null;
    if(worker){worker.onmessage=worker.onerror=null;try{worker.terminate();}catch{}worker=null;}
  }
  function fail(message) {
    terminate();pending=null;result=null;generation++;publish('unavailable',message||'Analysis is unavailable.');
  }
  function usable(value) {
    return value && Number.isFinite(value.whiteValue) && Number.isFinite(value.score)
      && Number.isFinite(value.share) && value.share>=0 && value.share<=1
      && Number.isInteger(value.depth) && value.depth>=0 && Number.isInteger(value.nodes) && value.nodes>=0;
  }
  function ensureWorker() {
    if(worker)return true;
    if(typeof WorkerCtor!=='function'){fail('This browser cannot run background analysis.');return false;}
    try {
      worker=new WorkerCtor(workerUrl,{type:'module',name:'football-chess-evaluation'});
      worker.onmessage=({data})=>{
        const request=running;
        if(!request || data?.requestId!==request.id || request.generation!==generation || !enabled || suspended || destroyed)return;
        if(data.progress){
          if(request.key===latestKey && !pending && usable(data.progress)){result={...data.progress};publish('thinking');}
          return;
        }
        if(request.timer!=null)clearTimer(request.timer);
        running=null;
        if(data.error){fail(data.error);return;}
        if(request.key===latestKey && !pending){
          if(!usable(data.result)){fail('The engine returned no valid estimate.');return;}
          result={...data.result};publish('ready');
        }
        dispatch();
      };
      worker.onerror=()=>fail('The analysis worker stopped. Toggle analysis off and on to retry.');
      return true;
    }catch{fail('Background analysis could not start.');return false;}
  }
  function dispatch() {
    if(!enabled || suspended || destroyed || running || !pending)return;
    if(!ensureWorker())return;
    const request=pending;pending=null;
    running={...request,id:++serial,generation,timer:null};
    const id=running.id,epoch=generation;
    running.timer=setTimer(()=>{if(running?.id===id && generation===epoch)fail('Analysis took too long. Toggle it off and on to retry.');},timeoutMs);
    publish('thinking');
    try{worker.postMessage({type:'evaluate',requestId:id,position:request.position});}
    catch{fail('The position could not be sent to the analysis worker.');}
  }
  function queueLatest() {
    if(!latestInput)return publish(enabled?'queued':'off');
    pending={key:latestKey,position:evaluationSnapshot(latestInput)};
    if(enabled&&!suspended){publish('queued');dispatch();}
  }
  function update(game) {
    if(destroyed || !game)return false;
    const key=evaluationPositionKey(game);
    if(key===latestKey)return false;
    // Do not carry the previous round's bar into a new attack while its worker
    // is still running. Neutral/analysing is preferable to a stale advantage.
    if(latestInput&&(latestInput.turn!==game.turn||latestInput.attack!==game.attack||game.phase==='finished'))result=null;
    latestInput=clone(game);latestKey=key;
    if(enabled)queueLatest();return true;
  }
  function setEnabled(value) {
    if(destroyed)return false;
    const next=value===true;if(next===enabled)return enabled;
    enabled=next;generation++;terminate();pending=null;result=null;
    if(!enabled)publish('off');else if(suspended)publish('suspended');else queueLatest();
    return enabled;
  }
  function reset() {
    if(destroyed)return;
    generation++;terminate();pending=null;latestInput=null;latestKey=null;result=null;
    publish(enabled?(suspended?'suspended':'queued'):'off');
  }
  function suspend() {
    if(destroyed || suspended)return;
    suspended=true;generation++;terminate();pending=null;publish(enabled?'suspended':'off');
  }
  function resume() {
    if(destroyed || !suspended)return;
    suspended=false;if(enabled)queueLatest();else publish('off');
  }
  function destroy() {
    if(destroyed)return;
    enabled=false;generation++;terminate();pending=null;latestInput=null;latestKey=null;result=null;
    destroyed=true;publish('off');
  }
  return {update,setEnabled,reset,suspend,resume,destroy,getState:()=>({...view})};
}
