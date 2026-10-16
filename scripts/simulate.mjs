import * as baseline from '../dist/engine.js';
import {performance} from 'node:perf_hooks';
import {writeFile, mkdir} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import path from 'node:path';

const TEAMS = ['white','black'];
const other = team => team === 'white' ? 'black' : 'white';
const zeroRole = () => Object.fromEntries(['K','Q','R','B','N','P'].map(type=>[type,{actions:0,moves:0,dribbles:0,passes:0,shots:0,goals:0,tackles:0,tackleWins:0,collections:0}]));
const sideStats = () => ({actions:0,thinkMs:0,goals:0,shots:0,resolvedShots:0,xG:0,shotDistance:0,shotXG:[],catches:0,cornersWon:0,wideShots:0,passes:0,teammatePasses:0,spacePasses:0,interceptedPasses:0,inaccuratePasses:0,longPasses:0,selfCollections:0,collections:0,dribbles:0,dribbleDistance:0,tackles:0,tackleWins:0,turnoversWon:0,turnoversLost:0,stalls:0,offsides:0,restartsAwarded:0,restartsTaken:0,restartTypes:{},completedOrdinaryRounds:0,attackingThirdEntries:0,attackActions:0,role:zeroRole()});
function inc(obj,key,n=1){obj[key]=(obj[key]||0)+n;}
function entryZone(team,y){return team==='white'?y<=4:y>=10;}
function positional(phase){return ['attackMove','defendMove'].includes(phase);}
export function applyAction(rules,state,action){
  if(action.type==='kick') return rules.applyKick(state,action.x,action.y);
  if(action.type==='move') return rules.applyMove(state,action.pieceId,action.x,action.y,{freePawn:!!action.freePawn});
  return rules.skipMove(state);
}

// A policy module supplies chooseAIAction; all actual transitions use one shared
// rules module. A match ends at an explicit atomic-action budget, not full time.
export function runMatch({rules=baseline,whitePolicy=rules,blackPolicy=rules,whiteDifficulty='casual',blackDifficulty='casual',seed=1,kickoff='white',actionLimit=480,roundLimit=null,initialState=null,record=false,label=null,validate=false}={}){
  let state=initialState?structuredClone(initialState):rules.createGame({mode:'local',seed,kickoff,minutes:10});
  const stats={white:sideStats(),black:sideStats()}, events=[], seen=new Map(),checkpoints={},roundCheckpoints={},possessions=[];
  const started=performance.now(); let actions=0,error=null, maxExactRepeat=0,pendingShotRound=false,possessionTeam=state.attack,possessionStart=0,possessionStartRounds=0;
  for(;actions<actionLimit&&state.phase!=='finished'&&!(roundLimit&&stats.white.completedOrdinaryRounds+stats.black.completedOrdinaryRounds>=roundLimit);actions++){
    const before=state,team=rules.currentTeam(before),policy=team==='white'?whitePolicy:blackPolicy,difficulty=team==='white'?whiteDifficulty:blackDifficulty;
    const start=performance.now(); let action;
    try {action=typeof policy==='function'?policy(before,{difficulty}):policy.chooseAIAction(before,{difficulty});}
    catch(e){error={step:actions,stage:'policy',message:e.message,phase:before.phase,team};break;}
    const ms=performance.now()-start;
    try {state=applyAction(rules,before,action);}
    catch(e){error={step:actions,stage:'apply',message:e.message,phase:before.phase,team,action};break;}
    if(validate){
      const slots=new Set(state.pieces.map(p=>`${p.x},${p.y}`));
      if(state.pieces.length!==22||slots.size!==22||state.pieces.some(p=>p.x<0||p.x>=12||p.y<0||p.y>=15)){error={step:actions,stage:'integrity',message:'Invalid piece occupancy'};break;}
      const carrier=state.pieces.find(p=>p.id===state.ball.carrierId);
      if(carrier&&(carrier.x!==state.ball.x||carrier.y!==state.ball.y||carrier.team!==state.attack)){error={step:actions,stage:'integrity',message:'Carrier mismatch'};break;}
    }
    const result=state.lastAction||{},actor=before.pieces.find(p=>p.id===action.pieceId),carrier=before.pieces.find(p=>p.id===before.ball.carrierId),s=stats[team];
    s.actions++;s.thinkMs+=ms;if(team===before.attack)s.attackActions++;
    const role=actor?s.role[actor.type]:action.type==='kick'&&carrier?s.role[carrier.type]:null;
    if(role)role.actions++;
    // Count the submitted action and phase, never a stale lastAction retained by
    // transitions. A reaction resolves exactly one attempted shot.
    if(before.phase==='keeperReact'&&['goal','save','shotMiss'].includes(result.type)){
      const shot=before.pendingShot,shooting=stats[shot.shootingTeam],details=result.shotModel||rules.shotModel(state,shot.x,shot.y);
      shooting.resolvedShots++;shooting.xG+=details.probability;shooting.shotDistance+=details.distance;shooting.shotXG.push(details.probability);
      if(result.type==='save'&&result.outcome==='saved')stats[shot.defendingTeam].catches++;
      if(result.outcome==='corner')shooting.cornersWon++;
      if(result.outcome==='wide')shooting.wideShots++;
      if(pendingShotRound)shooting.completedOrdinaryRounds++;
      if(state.score[shot.scoringTeam]>before.score[shot.scoringTeam]){
        stats[shot.scoringTeam].goals+=state.score[shot.scoringTeam]-before.score[shot.scoringTeam];
        const scoringRole=shooting.role[shot.shooterType||before.pieces.find(p=>p.id===shot.shooterId)?.type];
        if(shot.scoringTeam===shot.shootingTeam&&scoringRole)scoringRole.goals++;
      }
    }
    if(action.type==='kick'&&carrier){
      const kick=rules.legalKicks(before).find(k=>k.x===action.x&&k.y===action.y);
      if(kick?.goal){
        // An offside attacker in the box can stop the kick before a shot is
        // declared. Count the actual attempt, rather than the submitted target.
        if(state.phase==='keeperReact'&&result.type==='shotAttempt'){
          s.shots++;role.shots++;pendingShotRound=!before.restart&&before.phase!=='kickoff'&&!before.ballProgress?.excludeRelease;
        }
      }
      else{
        s.passes++;role.passes++;
        if((kick?.distance||0)>10)s.longPasses++;
        const intended=before.pieces.find(p=>p.x===action.x&&p.y===action.y);
        if(intended?.team===team)s.teammatePasses++;else if(!intended)s.spacePasses++;
        if(result.type==='interception')s.interceptedPasses++;
        if(['miss','out'].includes(result.type))s.inaccuratePasses++;
        if(before.restart){s.restartsTaken++;inc(s.restartTypes,`taken:${before.restart.type}`);}
        if(!before.restart&&before.phase!=='kickoff'&&!before.ballProgress?.excludeRelease&&!result.backPass)s.completedOrdinaryRounds++;
      }
    }
    if(action.type==='move'&&actor&&before.phase!=='keeperReact'){
      role.moves++;
      const legal=rules.legalMoves(before,actor.id,{freePawn:!!action.freePawn}).find(m=>m.x===action.x&&m.y===action.y);
      if(legal?.type==='tackle'){s.tackles++;role.tackles++;if(result.tackleSuccess){s.tackleWins++;role.tackleWins++;}}
      if(before.ball.carrierId===actor.id){s.dribbles++;role.dribbles++;s.dribbleDistance+=Math.max(Math.abs(actor.x-action.x),Math.abs(actor.y-action.y));}
      if(result.collection){s.collections++;role.collections++;if(result.selfPassCollection)s.selfCollections++;}
    }
    // Loose-ball cycles complete a possession round without a kick.
    if(before.phase==='defendMove'&&state.phase==='attackMove'&&!before.ball.carrierId&&!state.ball.carrierId&&!before.restart&&!state.restart&&before.attack===state.attack)stats[before.attack].completedOrdinaryRounds++;
    if(result.type==='stalling'&&before.phase!=='keeperReact')stats[result.team].stalls++;
    if(result.type==='offside'&&before.phase!=='keeperReact')stats[result.team].offsides++;
    if(state.restart&&(!before.restart||JSON.stringify(state.restart)!==JSON.stringify(before.restart))){
      stats[state.restart.team].restartsAwarded++;inc(stats[state.restart.team].restartTypes,`awarded:${state.restart.type}`);
    }
    if(before.attack!==state.attack){
      stats[state.attack].turnoversWon++;stats[before.attack].turnoversLost++;
      possessions.push({team:possessionTeam,actions:actions+1-possessionStart,ordinaryRounds:stats[possessionTeam].completedOrdinaryRounds-possessionStartRounds,end:result.type});
      possessionTeam=state.attack;possessionStart=actions+1;possessionStartRounds=stats[possessionTeam].completedOrdinaryRounds;
    }
    if(before.attack===state.attack&&!state.restart&&!['goal','shotMiss','save'].includes(result.type)&&!entryZone(state.attack,before.ball.y)&&entryZone(state.attack,state.ball.y))stats[state.attack].attackingThirdEntries++;
    const key=JSON.stringify([state.pieces.map(p=>[p.id,p.x,p.y]),state.ball,state.attack,state.phase,state.positionBudget,state.restart,state.ballProgress,state.offside]);
    const repeats=(seen.get(key)||0)+1;seen.set(key,repeats);maxExactRepeat=Math.max(maxExactRepeat,repeats);
    if(record)events.push({step:actions+1,team,phase:before.phase,action,ms,result:structuredClone(result),score:structuredClone(state.score),state:structuredClone(state)});
    if([120,240,480,720,960].includes(actions+1))checkpoints[actions+1]={score:structuredClone(state.score),shots:stats.white.shots+stats.black.shots,xG:stats.white.xG+stats.black.xG,resolvedShots:stats.white.resolvedShots+stats.black.resolvedShots,ordinaryRounds:stats.white.completedOrdinaryRounds+stats.black.completedOrdinaryRounds,stalls:stats.white.stalls+stats.black.stalls};
    const ordinaryRounds=stats.white.completedOrdinaryRounds+stats.black.completedOrdinaryRounds;
    if([20,30,40,50,60,80,100].includes(ordinaryRounds)&&!roundCheckpoints[ordinaryRounds])roundCheckpoints[ordinaryRounds]={actions:actions+1,score:structuredClone(state.score),shots:stats.white.shots+stats.black.shots,xG:stats.white.xG+stats.black.xG,stalls:stats.white.stalls+stats.black.stalls};
  }
  possessions.push({team:possessionTeam,actions:actions-possessionStart,ordinaryRounds:stats[possessionTeam].completedOrdinaryRounds-possessionStartRounds,end:'budget'});
  return {label,seed,kickoff,actionLimit,roundLimit,actions,error,whiteDifficulty,blackDifficulty,score:state.score,stats,turn:state.turn,phase:state.phase,maxExactRepeat,checkpoints,roundCheckpoints,possessions,elapsedMs:performance.now()-started,finalState:record?state:undefined,events:record?events:undefined};
}

const sum=(items,fn)=>items.reduce((a,v)=>a+fn(v),0);
export function summary(matches){
  const n=matches.length,totalScore=sum(matches,m=>m.score.white+m.score.black), sides={};
  for(const team of TEAMS){
    const totals=sideStats();
    for(const match of matches){const s=match.stats[team];for(const key of Object.keys(totals)){
      if(typeof totals[key]==='number')totals[key]+=s[key]||0;
      else if(key==='shotXG')totals[key].push(...s[key]);
      else if(key==='restartTypes')for(const [type,count]of Object.entries(s[key]))inc(totals[key],type,count);
      else if(key==='role')for(const type of Object.keys(totals.role))for(const field of Object.keys(totals.role[type]))totals.role[type][field]+=s.role[type][field];
    }}
    sides[team]=totals;
  }
  const totals={};for(const key of Object.keys(sides.white))if(typeof sides.white[key]==='number')totals[key]=sides.white[key]+sides.black[key];
  const histogram={};for(const m of matches)inc(histogram,`${m.score.white}-${m.score.black}`);
  const outcomes={whiteWins:matches.filter(m=>m.score.white>m.score.black).length,draws:matches.filter(m=>m.score.white===m.score.black).length,blackWins:matches.filter(m=>m.score.white<m.score.black).length};
  const checkpoints={};for(const step of [120,240,480,720,960]){const subset=matches.map(m=>m.checkpoints?.[step]).filter(Boolean);if(subset.length)checkpoints[step]={matches:subset.length,goals:sum(subset,c=>c.score.white+c.score.black),goalsPerMatch:sum(subset,c=>c.score.white+c.score.black)/subset.length,shotsPerMatch:sum(subset,c=>c.shots)/subset.length,xGPerMatch:sum(subset,c=>c.xG)/subset.length,roundsPerMatch:sum(subset,c=>c.ordinaryRounds)/subset.length,stallsPerMatch:sum(subset,c=>c.stalls)/subset.length};}
  const segments=matches.flatMap(m=>m.possessions||[]),possession={segments:segments.length,meanActions:sum(segments,p=>p.actions)/segments.length,meanRounds:sum(segments,p=>p.ordinaryRounds)/segments.length,whiteActionShare:sum(segments,p=>p.team==='white'?p.actions:0)/sum(segments,p=>p.actions)};
  const roundCheckpoints={};for(const round of [20,30,40,50,60,80,100]){const subset=matches.map(m=>m.roundCheckpoints?.[round]).filter(Boolean);if(subset.length)roundCheckpoints[round]={matches:subset.length,actionsPerMatch:sum(subset,c=>c.actions)/subset.length,goalsPerMatch:sum(subset,c=>c.score.white+c.score.black)/subset.length,shotsPerMatch:sum(subset,c=>c.shots)/subset.length,xGPerMatch:sum(subset,c=>c.xG)/subset.length,stallsPerMatch:sum(subset,c=>c.stalls)/subset.length};}
  return {matches:n,completed:matches.filter(m=>!m.error).length,errors:matches.filter(m=>m.error).map(m=>({seed:m.seed,kickoff:m.kickoff,error:m.error})),actionBudget:[...new Set(matches.map(m=>m.actionLimit))],roundBudget:[...new Set(matches.map(m=>m.roundLimit||null))],actions:sum(matches,m=>m.actions),outcomes,scoreHistogram:histogram,checkpoints,roundCheckpoints,possession,score: {white:sides.white.goals,black:sides.black.goals,total:totalScore,perMatch:n?totalScore/n:0,goalless:matches.filter(m=>m.score.white+m.score.black===0).length,atMostOne:matches.filter(m=>m.score.white+m.score.black<=1).length,atLeastSix:matches.filter(m=>m.score.white+m.score.black>=6).length},totals,sides,rates:{shotsPerMatch:totals.shots/n,xGPerMatch:totals.xG/n,goalsPer100Actions:totalScore/sum(matches,m=>m.actions)*100,actionsPerGoal:totalScore?sum(matches,m=>m.actions)/totalScore:null,conversion:totals.resolvedShots?totalScore/totals.resolvedShots:0,meanShotXG:totals.resolvedShots?totals.xG/totals.resolvedShots:0,meanShotDistance:totals.resolvedShots?totals.shotDistance/totals.resolvedShots:0,teammatePassShare:totals.passes?totals.teammatePasses/totals.passes:0,stallsPerMatch:totals.stalls/n,ordinaryRoundsPerMatch:totals.completedOrdinaryRounds/n,thinkMsPerAction:totals.actions?totals.thinkMs/totals.actions:0},maxExactRepeat:Math.max(0,...matches.map(m=>m.maxExactRepeat)),elapsedMs:sum(matches,m=>m.elapsedMs),note:'Fixed atomic-action or ordinary-round budget. These are not timed 10-minute matches; animation, decision pace, and stoppages affect wall-clock match totals.'};
}

export async function runTournament({seeds=[1,2],kickoffs=TEAMS,outDir=null,name='tournament',onMatch=null,...options}={}){
  const matches=[];if(outDir)await mkdir(outDir,{recursive:true});
  for(const seed of seeds)for(const kickoff of kickoffs){
    const match=runMatch({...options,seed,kickoff});matches.push(match);
    if(outDir)await writeFile(path.join(outDir,`${name}-${seed}-${kickoff}.json`),JSON.stringify(match));
    if(onMatch)await onMatch(match,matches.length);
  }
  const aggregate=summary(matches);
  if(outDir)await writeFile(path.join(outDir,`${name}-summary.json`),JSON.stringify(aggregate,null,2));
  return {matches,summary:aggregate};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  const args=Object.fromEntries(process.argv.slice(2).map(a=>a.replace(/^--/,'').split('=')));
  const count=Number(args.seeds||48),start=Number(args.start||10000),difficulty=args.difficulty||'casual';
  const moduleFor=async name=>name?await import(pathToFileURL(path.resolve(name)).href):baseline;
  const rules=await moduleFor(args.rules),whitePolicy=args.white?await moduleFor(args.white):rules,blackPolicy=args.black?await moduleFor(args.black):rules;
  const result=await runTournament({rules,whitePolicy,blackPolicy,seeds:Array.from({length:count},(_,i)=>start+i),whiteDifficulty:args['white-difficulty']||difficulty,blackDifficulty:args['black-difficulty']||difficulty,actionLimit:Number(args.actions||480),roundLimit:args.rounds?Number(args.rounds):null,outDir:args.out||path.resolve('simulation-results'),name:args.name||'baseline',record:args.record==='true',validate:true,onMatch:(m,i)=>{if(i%8===0||m.error)process.stdout.write(JSON.stringify({done:i,seed:m.seed,kickoff:m.kickoff,score:m.score,actions:m.actions,error:m.error,elapsedMs:Math.round(m.elapsedMs)})+'\n');}});
  process.stdout.write(JSON.stringify({summary:result.summary},null,2)+'\n');
}
