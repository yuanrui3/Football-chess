/** Expanded, deterministic Tactical analysis for study opponents only.
 * Exact local checks supplement the bounded search; this is not a proof of
 * globally optimal play. Match opponents keep their ordinary search profile.
 */
import {analyzeTacticalAction,currentTeam,legalMoves,legalKicks,
  applyMove,applyKick,skipMove,shotModel,disguisedShotTargets,studyPositionMetrics} from './engine.js?v=8a5f49b765ee';

export const EXERCISE_SEARCH_PROFILE=Object.freeze({maxDepth:12,nodeLimit:12000,extensions:false,
  searchWidths:Object.freeze({root:24,position:8,kick:6,bonus:4})});
const clone=value=>structuredClone(value);
const actionFor=(piece,move,freePawn=false)=>({type:'move',pieceId:piece.id,x:move.x,y:move.y,freePawn});
const hasBall=(state,team)=>state.pieces.some(p=>p.team===team&&p.id===state.ball.carrierId);

/** Every legal hold/keeper move, with the declared disguise mixture intact. */
export function exerciseKeeperChance(pending){
  if(pending.phase!=='keeperReact'||!pending.pendingShot)return 0;
  const keeper=pending.pieces.find(p=>p.type==='K'&&p.team===currentTeam(pending));
  let probability=shotModel(pending).probability;
  for(const move of keeper?legalMoves(pending,keeper.id):[])
    probability=Math.min(probability,shotModel(pending,pending.pendingShot.x,pending.pendingShot.y,move).probability);
  return probability;
}

/** No goal target or legal two-target disguise is hidden by a beam cutoff. */
export function exerciseFinishes(state){
  if(!['kick','kickoff','keeperRelease'].includes(state.phase)||!state.ball.carrierId)return [];
  const team=currentTeam(state),actions=legalKicks(state)
    .filter(k=>k.goal===team&&!k.offside).map(k=>({type:'kick',x:k.x,y:k.y}));
  const pair=disguisedShotTargets(state);
  if(pair.length===2)actions.push({type:'kick',x:pair[0].x,y:pair[0].y,disguise:true});
  return actions.flatMap(action=>{
    const pending=applyKick(state,action.x,action.y,{disguise:!!action.disguise});
    return pending.phase==='keeperReact'?[{action,probability:exerciseKeeperChance(pending)}]:[];
  }).sort((a,b)=>b.probability-a.probability);
}

/** Exhaustive direct and one-shared-bonus guaranteed possession wins.
 * The public tackle probability must be 100%; uncertain knight challenges and
 * fouls remain chance branches in the ordinary search, never sampled here.
 */
export function findExerciseCapture(state){
  const team=currentTeam(state),carrier=state.pieces.find(p=>p.id===state.ball.carrierId);
  let checked=0;
  if(!['defendMove','attackMove'].includes(state.phase)||!carrier||carrier.team===team||state.foulsEnabled)
    return {plan:null,checked};
  const captureFrom=position=>{
    for(const piece of position.pieces)if(piece.team===team)
      for(const move of legalMoves(position,piece.id))if(move.type==='tackle'&&(move.tackleProbability??1)>=1){
        checked++;
        const action=actionFor(piece,move),after=applyMove(position,piece.id,move.x,move.y,{roll:0});
        if(after.attack===team&&hasBall(after,team))return action;
      }
    return null;
  };
  const direct=captureFrom(state);
  if(direct)return {plan:[{action:direct,team,phase:state.phase}],checked};
  for(const piece of state.pieces)if(piece.team===team)
    for(const move of legalMoves(state,piece.id,{freePawn:true})){
      checked++;
      const action=actionFor(piece,move,true),prepared=applyMove(state,piece.id,move.x,move.y,{freePawn:true,roll:0});
      if(currentTeam(prepared)!==team||prepared.attack!==state.attack)continue;
      const capture=captureFrom(prepared);
      if(capture)return {plan:[{action,team,phase:state.phase},{action:capture,team,phase:prepared.phase}],checked};
    }
  return {plan:null,checked};
}

/** Solve the remaining defensive positioning phase, including both orders of
 * the normal and shared bonus moves. Chance tackles are expected values over
 * success and evasion, never a lucky assumed win. The primary objective is the
 * attacker's best legal finish after its keeper reply; native outlet-aware
 * positional value breaks ties between equally safe immediate defences.
 */
export function analyzeExerciseDefense(state,{stateLimit=12000}={}){
  if(state.phase!=='defendMove'||state.foulsEnabled)return null;
  const defender=currentTeam(state),attacker=state.attack,memo=new Map();
  const cap=Math.max(1,Math.min(12000,Math.floor(stateLimit)||1)),ABORT=Symbol('local study budget');
  let states=0,bestRoot=null;
  const key=s=>JSON.stringify([s.pieces.map(p=>[p.id,p.type,p.x,p.y]),s.ball,s.attack,s.phase,
    s.positionBudget,s.offside,s.restart,s.ballProgress,s.paceControl,s.turn]);
  const leaf=s=>{
    if(s.attack!==attacker&&hasBall(s,defender))return {threat:0,positionValue:100000,line:[]};
    const metrics=studyPositionMetrics(s,defender);
    return {threat:s.attack===attacker?metrics.bestShotXG:0,positionValue:metrics.positionValue,line:[]};
  };
  const actions=s=>[{action:{type:'skip'},probability:1},...s.pieces.filter(p=>p.team===defender).flatMap(piece=>
    [false,true].flatMap(freePawn=>legalMoves(s,piece.id,{freePawn}).map(move=>({
      action:actionFor(piece,move,freePawn),probability:move.type==='tackle'?(move.tackleProbability??1):1}))))];
  const successors=(s,{action,probability})=>{
    if(action.type==='skip')return [{probability:1,state:skipMove(s)}];
    const apply=roll=>applyMove(s,action.pieceId,action.x,action.y,{freePawn:action.freePawn,roll});
    return probability>=1?[{probability:1,state:apply(0)}]
      :[{probability,state:apply(probability/2)},{probability:1-probability,state:apply((1+probability)/2)}]
        .filter(outcome=>outcome.probability>0);
  };
  const better=(a,b)=>!b||a.threat<b.threat-1e-10
    ||Math.abs(a.threat-b.threat)<=1e-10&&a.positionValue>b.positionValue+1e-8;
  const candidate=(s,entry,depth)=>{
    let threat=0,positionValue=0,likely=null;
    for(const outcome of successors(s,entry)){
      const child=solve(outcome.state,depth+1);
      threat+=outcome.probability*child.threat;positionValue+=outcome.probability*child.positionValue;
      if(!likely||outcome.probability>likely.probability)likely={probability:outcome.probability,line:child.line};
    }
    return {threat,positionValue,line:[{action:entry.action,team:defender,phase:s.phase},...(likely?.line||[])]};
  };
  function solve(s,depth=0){
    const id=key(s);if(memo.has(id))return memo.get(id);
    if(states>=cap)throw ABORT;states++;
    if(s.attack!==attacker||s.phase!=='defendMove'||currentTeam(s)!==defender){const result=leaf(s);memo.set(id,result);return result;}
    // A native defending phase has at most one ordinary and one shared bonus.
    // This guard only protects malformed imported positions, not normal lines.
    if(depth>=3){const result=leaf(skipMove(s));memo.set(id,result);return result;}
    let best=null;
    for(const entry of actions(s)){
      const result=candidate(s,entry,depth);
      if(better(result,best))best=result;
      if(depth===0)bestRoot=best;
    }
    memo.set(id,best);return best;
  }
  let complete=true,result;
  try{result=solve(state);}catch(error){if(error!==ABORT)throw error;complete=false;result=bestRoot;}
  // Skip is the first fully evaluated legal root candidate, so even a small
  // allowance yields an honest completed result rather than a random fallback.
  result ||= {...leaf(skipMove(state)),line:[{action:{type:'skip'},team:defender,phase:state.phase}]};
  return {action:result.line[0].action,value:-result.threat*2000,line:result.line,
    expectedOpponentShotXG:result.threat,reason:complete?'exhaustive-local-defence':'bounded-local-defence',
    stats:{nodes:states,completedDepth:complete?2:0,localStates:states,localComplete:complete}};
}

export function analyzeExerciseAction(state,{onIteration,
  nodeLimit=EXERCISE_SEARCH_PROFILE.nodeLimit,maxDepth=EXERCISE_SEARCH_PROFILE.maxDepth}={}){
  if(!state||state.phase==='finished')return {action:{type:'skip'},value:0,
    stats:{nodes:0,completedDepth:0,guardStates:0},line:[],reason:'finished'};
  // Own a private snapshot and erase future chance state before any guard or
  // search. Neither live state nor a caller's callback can alter this decision.
  const source=clone(state);source.randomState=1;source.log=[];source.lastAction=null;
  const team=currentTeam(source),capture=findExerciseCapture(source);
  if(capture.plan){
    const report={action:capture.plan[0].action,value:2000,line:capture.plan,
      stats:{nodes:0,completedDepth:0,guardStates:capture.checked},reason:'guaranteed-possession-win'};
    onIteration?.(clone(report));return report;
  }
  const defense=analyzeExerciseDefense(source,{stateLimit:nodeLimit});
  if(defense){
    defense.stats.guardStates=capture.checked;
    onIteration?.(clone(defense));return defense;
  }
  const finishes=exerciseFinishes(source),bestFinish=finishes[0];
  const normalize=report=>{
    const result={...report,stats:{...report.stats,guardStates:capture.checked,examinedFinishes:finishes.length},
      reason:source.phase==='keeperReact'?'exact-keeper-response':'expanded-tactical-search'};
    if(bestFinish&&report.action?.type==='kick'
        &&legalKicks(source).some(k=>k.goal===team&&k.x===report.action.x&&k.y===report.action.y)){
      result.action={...bestFinish.action};result.immediateShotXG=bestFinish.probability;
      if(JSON.stringify(result.action)!==JSON.stringify(report.action)){
        // This value explicitly describes the immediate finish, not the old
        // principal variation of a different aim.
        result.value=bestFinish.probability*2000;result.reason='strongest-legal-finish';
        result.line=[{action:{...result.action},team,phase:source.phase}];
      }
    }
    return result;
  };
  const report=analyzeTacticalAction(source,{maxDepth,nodeLimit,modelWeights:null,modelScale:80,selectionSeed:null,
    searchWidths:EXERCISE_SEARCH_PROFILE.searchWidths,extensions:EXERCISE_SEARCH_PROFILE.extensions,
    onIteration:progress=>onIteration?.(clone(normalize(progress)))});
  return normalize(report);
}

export function chooseExerciseAction(state,options){return analyzeExerciseAction(state,options).action;}
