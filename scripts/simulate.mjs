import * as baseline from '../dist/engine.js';
import {performance} from 'node:perf_hooks';
import {writeFile, mkdir} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import path from 'node:path';

const TEAMS = ['white','black'];
const other = team => team === 'white' ? 'black' : 'white';
const zeroRole = () => Object.fromEntries(['K','Q','R','B','N','P'].map(type=>[type,{actions:0,moves:0,dribbles:0,passes:0,shots:0,goals:0,tackles:0,tackleWins:0,collections:0,fouls:0,yellowCards:0,redCards:0}]));
const sideStats = () => ({actions:0,thinkMs:0,goals:0,shots:0,opponentGoalAttempts:0,ownGoalAttempts:0,resolvedShots:0,resolvedOpponentGoalAttempts:0,resolvedOwnGoalAttempts:0,xG:0,opponentGoalXG:0,ownGoalXG:0,shotDistance:0,shotXG:[],catches:0,cornersWon:0,wideShots:0,blockedShots:0,blocks:0,blockPossessions:0,passes:0,passRunsOffered:0,passRuns:0,passRunsSkipped:0,teammatePasses:0,spacePasses:0,interceptedPasses:0,inaccuratePasses:0,longPasses:0,selfCollections:0,collections:0,dribbles:0,dribbleDistance:0,tackles:0,tackleWins:0,fouls:0,foulsWon:0,yellowCards:0,redCards:0,secondYellows:0,penaltiesWon:0,penaltiesTaken:0,penaltyGoals:0,penaltyFailures:0,penaltiesSaved:0,turnoversWon:0,turnoversLost:0,stalls:0,offsides:0,restartsAwarded:0,restartsTaken:0,restartTypes:{},completedOrdinaryRounds:0,attackingThirdEntries:0,attackActions:0,role:zeroRole()});
function inc(obj,key,n=1){obj[key]=(obj[key]||0)+n;}
function entryZone(team,y,height=baseline.BOARD_HEIGHT){const depth=Math.floor(height/3);return team==='white'?y<depth:y>=height-depth;}
function positional(phase){return ['attackMove','defendMove'].includes(phase);}
export function applyAction(rules,state,action){
  if(action.type==='cornerTaker') return rules.selectCornerTaker(state,action.pieceId);
  if(action.type==='kick') return rules.applyKick(state,action.x,action.y,{passRun:!!action.passRun,disguise:!!action.disguise});
  if(action.type==='move') return rules.applyMove(state,action.pieceId,action.x,action.y,{freePawn:!!action.freePawn});
  return rules.skipMove(state);
}

function integrityProblem(rules,state,previous){
  if(!['kickoff','attackMove','defendMove','kick','keeperRelease','keeperReact','passRun','cornerSelect','finished'].includes(state.phase))return 'Unknown game phase';
  const pieces=state.pieces,sentOff=state.sentOff??[],discipline=state.discipline??{};
  if(!Array.isArray(pieces)||!Array.isArray(sentOff)||pieces.some(p=>!p||typeof p!=='object')||sentOff.some(p=>!p||typeof p!=='object')||!discipline||typeof discipline!=='object'||Array.isArray(discipline))return 'Invalid roster or discipline data';
  const validId=piece=>piece&&/^(white|black)-(K|Q|R[12]|B[12]|N[12]|P[123])$/.test(piece.id)&&piece.id.startsWith(piece.team+'-');
  const activeIds=new Set(pieces.map(p=>p.id)),dismissedIds=new Set(sentOff.map(p=>p.id));
  if(pieces.length!==22-sentOff.length||activeIds.size!==pieces.length||dismissedIds.size!==sentOff.length
      ||pieces.some(p=>!validId(p)||dismissedIds.has(p.id))||sentOff.some(p=>!validId(p)))return 'Invalid active/dismissed player IDs or count';
  const slots=new Set(pieces.map(p=>`${p.x},${p.y}`));
  if(slots.size!==pieces.length||pieces.some(p=>!Number.isInteger(p.x)||!Number.isInteger(p.y)||p.x<0||p.x>=rules.BOARD_WIDTH||p.y<0||p.y>=rules.BOARD_HEIGHT
      ||!['K','Q','R','B','N','P'].includes(p.type)||typeof rules.canOccupySquare==='function'&&!rules.canOccupySquare(p,p.x,p.y)))return 'Invalid piece occupancy';
  for(const [id,card]of Object.entries(discipline)){
    if(!activeIds.has(id)&&!dismissedIds.has(id)||!card||!Number.isInteger(card.yellowCards)||card.yellowCards<0||card.yellowCards>2
        ||typeof card.redCard!=='boolean'||card.yellowCards===2&&!card.redCard||card.redCard!==dismissedIds.has(id))return 'Invalid card ledger';
  }
  if(sentOff.some(p=>!discipline[p.id]?.redCard||p.yellowCards!==undefined&&p.yellowCards!==discipline[p.id].yellowCards))return 'Dismissal missing its red card';
  if(previous){
    if((previous.sentOff||[]).some(p=>!dismissedIds.has(p.id)))return 'A dismissed player was restored';
    for(const [id,card]of Object.entries(previous.discipline||{}))if((discipline[id]?.yellowCards||0)<card.yellowCards||card.redCard&&!discipline[id]?.redCard)return 'Cards were erased';
  }
  const minimum=rules.FOUL_RULE?.minimumPlayers??7,short=TEAMS.filter(team=>pieces.filter(p=>p.team===team).length<minimum);
  if(short.length&&(state.phase!=='finished'||state.finishReason!=='forfeit'||short.length!==1||state.forfeitingTeam!==short[0]||state.winner!==other(short[0])))return 'Too few players without a valid forfeit';
  if(!short.length&&state.finishReason==='forfeit')return 'Forfeit without a short team';
  if(!short.length&&TEAMS.some(team=>pieces.filter(p=>p.team===team&&p.type==='K').length!==1))return 'A live team must have one goalkeeper';
  const carrier=pieces.find(p=>p.id===state.ball?.carrierId);
  if(state.ball?.carrierId&&!carrier||carrier&&(carrier.x!==state.ball.x||carrier.y!==state.ball.y||carrier.team!==state.attack))return 'Carrier mismatch';
  if(state.phase==='cornerSelect'){
    if(state.restart?.type!=='corner'||state.restart.team!==state.attack||state.restart.takerId!=null||state.ball.carrierId!=null
        ||state.ball.x!==state.restart.spot?.x||state.ball.y!==state.restart.spot?.y||typeof rules.cornerTakers!=='function'||!rules.cornerTakers(state).length)return 'Invalid pending corner selection';
  }
  if(state.phase==='passRun'){
    const runner=pieces.find(p=>p.id===state.passRun?.pieceId);
    if(!runner||runner.team!==state.attack||state.passRun.team!==state.attack||!carrier||runner.id===carrier.id||state.restart||state.positionBudget?.normalUsed)return 'Invalid pass-and-run phase';
  }else if(state.passRun!=null)return 'Pass-and-run metadata outside its phase';
  return null;
}

// A policy module supplies chooseAIAction; all actual transitions use one shared
// rules module. A match ends at an explicit atomic-action budget, not full time.
export function runMatch({rules=baseline,whitePolicy=rules,blackPolicy=rules,whiteDifficulty='casual',blackDifficulty='casual',seed=1,kickoff='white',actionLimit=480,roundLimit=null,initialState=null,foulsEnabled=false,record=false,label=null,validate=false}={}){
  let state=initialState?structuredClone(initialState):rules.createGame({mode:'local',seed,kickoff,minutes:10,foulsEnabled});
  const stats={white:sideStats(),black:sideStats()}, events=[], seen=new Map(),checkpoints={},roundCheckpoints={},possessions=[];
  const started=performance.now(); let actions=0,error=null, maxExactRepeat=0,pendingShotRound=false,possessionTeam=state.attack,possessionStart=0,possessionStartRounds=0;
  const initialProblem=validate?integrityProblem(rules,state):null;
  if(initialProblem)error={step:0,stage:'integrity',message:initialProblem};
  for(;!error&&actions<actionLimit&&state.phase!=='finished'&&!(roundLimit&&stats.white.completedOrdinaryRounds+stats.black.completedOrdinaryRounds>=roundLimit);actions++){
    const before=state,team=rules.currentTeam(before),policy=team==='white'?whitePolicy:blackPolicy,difficulty=team==='white'?whiteDifficulty:blackDifficulty;
    const start=performance.now(); let action;
    try {action=typeof policy==='function'?policy(before,{difficulty}):policy.chooseAIAction(before,{difficulty});}
    catch(e){error={step:actions,stage:'policy',message:e.message,phase:before.phase,team};break;}
    const ms=performance.now()-start;
    try {state=applyAction(rules,before,action);}
    catch(e){error={step:actions,stage:'apply',message:e.message,phase:before.phase,team,action};break;}
    if(validate){
      const problem=integrityProblem(rules,state,before);
      if(problem){error={step:actions,stage:'integrity',message:problem};break;}
    }
    const result=state.lastAction||{},actor=before.pieces.find(p=>p.id===action.pieceId),carrier=before.pieces.find(p=>p.id===before.ball.carrierId),s=stats[team];
    s.actions++;s.thinkMs+=ms;if(team===before.attack)s.attackActions++;
    const role=actor?s.role[actor.type]:action.type==='kick'&&carrier?s.role[carrier.type]:null;
    if(role)role.actions++;
    // Count the submitted action and phase, never a stale lastAction retained by
    // transitions. A reaction resolves exactly one attempted shot.
    // A same-team catch can complete the progress deadline and wrap that save
    // in a stalling award. Its stored triggeringAction is still the resolution.
    const shotResult=before.phase==='keeperReact'&&result.type==='stalling'&&result.triggeringAction?.shotModel?result.triggeringAction:result;
    if(before.phase==='keeperReact'&&['goal','save','shotMiss','blockedShot'].includes(shotResult.type)){
      const shot=before.pendingShot,shooting=stats[shot.shootingTeam],details=shotResult.shotModel||rules.shotModel(state,shot.x,shot.y),ownGoalAttempt=shot.scoringTeam!==shot.shootingTeam;
      shooting.resolvedShots++;shooting.xG+=details.probability;shooting.shotDistance+=details.distance;shooting.shotXG.push(details.probability);
      shooting[ownGoalAttempt?'resolvedOwnGoalAttempts':'resolvedOpponentGoalAttempts']++;
      shooting[ownGoalAttempt?'ownGoalXG':'opponentGoalXG']+=details.probability;
      if(shotResult.type==='save'&&shotResult.outcome==='saved')stats[shot.defendingTeam].catches++;
      if(shotResult.outcome==='corner')stats[shotResult.restart?.team||state.restart?.team||shot.scoringTeam].cornersWon++;
      if(shotResult.type==='blockedShot'){shooting.blockedShots++;stats[shotResult.team].blocks++;if(shotResult.outcome==='blocked')stats[shotResult.team].blockPossessions++;}
      if(shotResult.outcome==='wide')shooting.wideShots++;
      if(shot.penalty){
        if(shotResult.type==='goal')shooting.penaltyGoals++;else shooting.penaltyFailures++;
        if(shotResult.type==='save'&&shotResult.outcome==='saved')stats[shot.defendingTeam].penaltiesSaved++;
      }
      if(pendingShotRound&&state.phase!=='keeperRelease')shooting.completedOrdinaryRounds++;
      if(state.score[shot.scoringTeam]>before.score[shot.scoringTeam]){
        stats[shot.scoringTeam].goals+=state.score[shot.scoringTeam]-before.score[shot.scoringTeam];
        const scoringRole=shooting.role[shot.shooterType||before.pieces.find(p=>p.id===shot.shooterId)?.type];
        if(shot.scoringTeam===shot.shootingTeam&&scoringRole)scoringRole.goals++;
      }
    }
    if(action.type==='kick'&&carrier){
      const kick=rules.legalKicks(before).find(k=>k.x===action.x&&k.y===action.y);
      if(before.restart){s.restartsTaken++;inc(s.restartTypes,`taken:${before.restart.type}`);}
      if(kick?.goal){
        // An offside attacker in the box can stop the kick before a shot is
        // declared. Count the actual attempt, rather than the submitted target.
        if(state.phase==='keeperReact'&&result.type==='shotAttempt'){
          s.shots++;s[kick.goal===team?'opponentGoalAttempts':'ownGoalAttempts']++;role.shots++;pendingShotRound=!before.restart&&before.phase!=='kickoff'&&!before.ballProgress?.excludeRelease&&!before.ballProgress?.releaseAlreadyCounted;
          if(before.restart?.type==='penalty')s.penaltiesTaken++;
        }
      }
      else{
        s.passes++;role.passes++;
        if((kick?.distance||0)>10)s.longPasses++;
        const intended=before.pieces.find(p=>p.x===action.x&&p.y===action.y);
        if(intended?.team===team)s.teammatePasses++;else if(!intended)s.spacePasses++;
        if(result.type==='interception')s.interceptedPasses++;
        if(['miss','out'].includes(result.type))s.inaccuratePasses++;
        if(!before.restart&&before.phase!=='kickoff'&&!before.ballProgress?.excludeRelease&&!before.ballProgress?.releaseAlreadyCounted&&!result.backPass)s.completedOrdinaryRounds++;
      }
    }
    if(action.type==='kick'&&state.phase==='passRun'&&result.passRunAvailable)s.passRunsOffered++;
    if(before.phase==='passRun'){
      if(action.type==='move'&&result.passRun)s.passRuns++;
      else if(action.type==='skip')s.passRunsSkipped++;
    }
    if(action.type==='move'&&result.type==='foul'){
      const offender=stats[result.team],victim=stats[other(result.team)];offender.fouls++;victim.foulsWon++;if(role)role.fouls++;
      if(result.card==='yellow'||result.secondYellow){offender.yellowCards++;if(role)role.yellowCards++;}
      if(result.card==='red'){offender.redCards++;if(role)role.redCards++;}
      if(result.secondYellow)offender.secondYellows++;
      if(state.restart?.type==='penalty')stats[state.restart.team].penaltiesWon++;
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
    if(result.type==='stalling')stats[result.team].stalls++;
    if(result.type==='offside'&&before.phase!=='keeperReact')stats[result.team].offsides++;
    if(result.type!=='cornerTaker'&&state.restart&&(!before.restart||JSON.stringify(state.restart)!==JSON.stringify(before.restart))){
      stats[state.restart.team].restartsAwarded++;inc(stats[state.restart.team].restartTypes,`awarded:${state.restart.type}`);
    }
    if(before.attack!==state.attack){
      stats[state.attack].turnoversWon++;stats[before.attack].turnoversLost++;
      possessions.push({team:possessionTeam,actions:actions+1-possessionStart,ordinaryRounds:stats[possessionTeam].completedOrdinaryRounds-possessionStartRounds,end:result.type});
      possessionTeam=state.attack;possessionStart=actions+1;possessionStartRounds=stats[possessionTeam].completedOrdinaryRounds;
    }
    if(before.attack===state.attack&&!state.restart&&!['goal','shotMiss','save','blockedShot'].includes(result.type)&&!entryZone(state.attack,before.ball.y,rules.BOARD_HEIGHT)&&entryZone(state.attack,state.ball.y,rules.BOARD_HEIGHT))stats[state.attack].attackingThirdEntries++;
    const key=JSON.stringify([state.pieces.map(p=>[p.id,p.x,p.y]),state.ball,state.attack,state.phase,state.positionBudget,state.restart,state.ballProgress,state.offside,state.passRun,state.discipline,state.sentOff,state.winner,state.finishReason]);
    const repeats=(seen.get(key)||0)+1;seen.set(key,repeats);maxExactRepeat=Math.max(maxExactRepeat,repeats);
    if(record)events.push({step:actions+1,team,phase:before.phase,action,ms,result:structuredClone(result),score:structuredClone(state.score),state:structuredClone(state)});
    if([120,240,480,720,960].includes(actions+1))checkpoints[actions+1]={score:structuredClone(state.score),shots:stats.white.shots+stats.black.shots,xG:stats.white.xG+stats.black.xG,resolvedShots:stats.white.resolvedShots+stats.black.resolvedShots,ordinaryRounds:stats.white.completedOrdinaryRounds+stats.black.completedOrdinaryRounds,stalls:stats.white.stalls+stats.black.stalls};
    const ordinaryRounds=stats.white.completedOrdinaryRounds+stats.black.completedOrdinaryRounds;
    if([20,30,40,50,60,80,100].includes(ordinaryRounds)&&!roundCheckpoints[ordinaryRounds])roundCheckpoints[ordinaryRounds]={actions:actions+1,score:structuredClone(state.score),shots:stats.white.shots+stats.black.shots,xG:stats.white.xG+stats.black.xG,stalls:stats.white.stalls+stats.black.stalls};
  }
  possessions.push({team:possessionTeam,actions:actions-possessionStart,ordinaryRounds:stats[possessionTeam].completedOrdinaryRounds-possessionStartRounds,end:state.finishReason||'budget'});
  return {label,seed,kickoff,actionLimit,roundLimit,actions,error,whiteDifficulty,blackDifficulty,foulsEnabled:state.foulsEnabled===true,score:state.score,stats,turn:state.turn,phase:state.phase,winner:state.winner??null,finishReason:state.finishReason??null,forfeitingTeam:state.forfeitingTeam??null,activePlayers:Object.fromEntries(TEAMS.map(team=>[team,state.pieces.filter(p=>p.team===team).length])),dismissedPlayers:Object.fromEntries(TEAMS.map(team=>[team,(state.sentOff||[]).filter(p=>p.team===team).length])),maxExactRepeat,checkpoints,roundCheckpoints,possessions,elapsedMs:performance.now()-started,finalState:record?state:undefined,events:record?events:undefined};
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
      else if(key==='role')for(const type of Object.keys(totals.role))for(const field of Object.keys(totals.role[type]))totals.role[type][field]+=s.role[type]?.[field]||0;
    }}
    sides[team]=totals;
  }
  const totals={};for(const key of Object.keys(sides.white))if(typeof sides.white[key]==='number')totals[key]=sides.white[key]+sides.black[key];
  const histogram={};for(const m of matches)inc(histogram,`${m.score.white}-${m.score.black}`);
  const winner=m=>m.finishReason==='forfeit'?m.winner:m.score.white>m.score.black?'white':m.score.black>m.score.white?'black':null;
  const outcomes={whiteWins:matches.filter(m=>winner(m)==='white').length,draws:matches.filter(m=>winner(m)===null).length,blackWins:matches.filter(m=>winner(m)==='black').length};
  const checkpoints={};for(const step of [120,240,480,720,960]){const subset=matches.map(m=>m.checkpoints?.[step]).filter(Boolean);if(subset.length)checkpoints[step]={matches:subset.length,goals:sum(subset,c=>c.score.white+c.score.black),goalsPerMatch:sum(subset,c=>c.score.white+c.score.black)/subset.length,shotsPerMatch:sum(subset,c=>c.shots)/subset.length,xGPerMatch:sum(subset,c=>c.xG)/subset.length,roundsPerMatch:sum(subset,c=>c.ordinaryRounds)/subset.length,stallsPerMatch:sum(subset,c=>c.stalls)/subset.length};}
  const segments=matches.flatMap(m=>m.possessions||[]),possession={segments:segments.length,meanActions:sum(segments,p=>p.actions)/segments.length,meanRounds:sum(segments,p=>p.ordinaryRounds)/segments.length,whiteActionShare:sum(segments,p=>p.team==='white'?p.actions:0)/sum(segments,p=>p.actions)};
  const roundCheckpoints={};for(const round of [20,30,40,50,60,80,100]){const subset=matches.map(m=>m.roundCheckpoints?.[round]).filter(Boolean);if(subset.length)roundCheckpoints[round]={matches:subset.length,actionsPerMatch:sum(subset,c=>c.actions)/subset.length,goalsPerMatch:sum(subset,c=>c.score.white+c.score.black)/subset.length,shotsPerMatch:sum(subset,c=>c.shots)/subset.length,xGPerMatch:sum(subset,c=>c.xG)/subset.length,stallsPerMatch:sum(subset,c=>c.stalls)/subset.length};}
  return {matches:n,completed:matches.filter(m=>!m.error).length,errors:matches.filter(m=>m.error).map(m=>({seed:m.seed,kickoff:m.kickoff,error:m.error})),actionBudget:[...new Set(matches.map(m=>m.actionLimit))],roundBudget:[...new Set(matches.map(m=>m.roundLimit||null))],foulsEnabled:[...new Set(matches.map(m=>m.foulsEnabled===true))],forfeits:matches.filter(m=>m.finishReason==='forfeit').length,actions:sum(matches,m=>m.actions),outcomes,scoreHistogram:histogram,checkpoints,roundCheckpoints,possession,score: {white:sides.white.goals,black:sides.black.goals,total:totalScore,perMatch:n?totalScore/n:0,goalless:matches.filter(m=>m.score.white+m.score.black===0).length,atMostOne:matches.filter(m=>m.score.white+m.score.black<=1).length,atLeastSix:matches.filter(m=>m.score.white+m.score.black>=6).length},totals,sides,rates:{shotsPerMatch:totals.shots/n,xGPerMatch:totals.xG/n,goalsPer100Actions:totalScore/sum(matches,m=>m.actions)*100,actionsPerGoal:totalScore?sum(matches,m=>m.actions)/totalScore:null,conversion:totals.resolvedShots?totalScore/totals.resolvedShots:0,meanShotXG:totals.resolvedShots?totals.xG/totals.resolvedShots:0,meanShotDistance:totals.resolvedShots?totals.shotDistance/totals.resolvedShots:0,teammatePassShare:totals.passes?totals.teammatePasses/totals.passes:0,stallsPerMatch:totals.stalls/n,ordinaryRoundsPerMatch:totals.completedOrdinaryRounds/n,thinkMsPerAction:totals.actions?totals.thinkMs/totals.actions:0},maxExactRepeat:Math.max(0,...matches.map(m=>m.maxExactRepeat)),elapsedMs:sum(matches,m=>m.elapsedMs),note:'Fixed atomic-action or ordinary-round budget. These are not timed 10-minute matches; animation, decision pace, and stoppages affect wall-clock match totals.'};
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
  const foulsEnabled=Object.hasOwn(args,'fouls')&&!['false','0','off'].includes(String(args.fouls).toLowerCase());
  const result=await runTournament({rules,whitePolicy,blackPolicy,seeds:Array.from({length:count},(_,i)=>start+i),whiteDifficulty:args['white-difficulty']||difficulty,blackDifficulty:args['black-difficulty']||difficulty,actionLimit:Number(args.actions||480),roundLimit:args.rounds?Number(args.rounds):null,foulsEnabled,outDir:args.out||path.resolve('simulation-results'),name:args.name||'baseline',record:args.record==='true',validate:true,onMatch:(m,i)=>{if(i%8===0||m.error)process.stdout.write(JSON.stringify({done:i,seed:m.seed,kickoff:m.kickoff,score:m.score,actions:m.actions,error:m.error,elapsedMs:Math.round(m.elapsedMs)})+'\n');}});
  process.stdout.write(JSON.stringify({summary:result.summary},null,2)+'\n');
}
