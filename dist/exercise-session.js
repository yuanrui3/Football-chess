/** Short, flexible Football Chess studies. Native rules decide legality; the
 * objective grades public geometry and shot quality, never a prescribed move
 * string or a favourable sampled goal. All session transitions are immutable.
 */
import {applyMove,applyKick,skipMove,selectCornerTaker,legalMoves,
  currentTeam,shotModel,offsideInfo,inOwnBox,MIDFIELD_RANK} from './engine.js?v=2c106a991787';
import {createExercisePosition} from './exercise-positions.js?v=80d49d7c93f1';

const TEAMS=['white','black'];
const other=team=>team==='white'?'black':'white';
const clone=value=>structuredClone(value);
const gain=(team,from,to)=>(team==='white'?-1:1)*(to.y-from.y);
const point=p=>Number.isInteger(p?.x)&&Number.isInteger(p?.y);
const heldBy=(game,team)=>game.pieces.some(piece=>piece.id===game.ball.carrierId
  &&piece.team===team&&piece.x===game.ball.x&&piece.y===game.ball.y);
const percentage=value=>`${Math.round(value*100)}%`;
const LIMIT_ACTIONS=96;

/** Minimum expected goal probability over every legal keeper response, including
 * holding. For a disguise, shotModel returns the fair two-target mixture. This
 * function neither samples an outcome nor examines the future random state.
 */
export function bestKeeperShotChance(pending) {
  if(pending?.phase!=='keeperReact'||!pending.pendingShot)return 0;
  const shot=pending.pendingShot;
  const keeper=pending.pieces.find(piece=>piece.team===shot.defendingTeam&&piece.type==='K');
  const chances=[shotModel(pending).probability];
  if(keeper)for(const move of legalMoves(pending,keeper.id))
    chances.push(shotModel(pending,shot.x,shot.y,move).probability);
  return Math.max(0,Math.min(1,...chances.filter(Number.isFinite)));
}

/** A possession round ends at its kick (after any compulsory keeper release),
 * resolved shot, loose-ball round boundary, or possession-ending challenge.
 * Individual dribbles, off-ball moves and bonuses do not spend separate rounds.
 */
export function completedExerciseRound(before,after) {
  if(!before||!after||before===after||before.restart||before.phase==='kickoff')return false;
  if(before.phase==='keeperReact')return after.phase!=='keeperReact';
  if(['kick','keeperRelease'].includes(before.phase)) {
    if(['keeperReact','keeperRelease'].includes(after.phase))return false;
    return !(before.phase==='keeperRelease'&&before.ballProgress?.releaseAlreadyCounted);
  }
  if(['attackMove','defendMove'].includes(before.phase)&&before.attack!==after.attack)return true;
  return before.phase==='defendMove'&&after.phase==='attackMove'&&!after.ball.carrierId
    &&after.turn>before.turn;
}

function objectiveOf(definition) {
  const source=definition.goal||{},type=source.type||(definition.side==='defence'?'defend':'finish');
  if(!['finish','defend'].includes(type))throw new RangeError('Choose a finishing or defending exercise.');
  const requires=source.requires||(source.requireThroughBall?'through-ball':source.requireBoxEntry?'box-entry':null);
  if(![null,'through-ball','box-entry'].includes(requires))throw new RangeError('Unknown exercise objective.');
  const minShotXG=source.minShotXG??0.30,maxOpponentShotXG=source.maxOpponentShotXG??0.15;
  if(!Number.isFinite(minShotXG)||minShotXG<=0||minShotXG>1
    ||!Number.isFinite(maxOpponentShotXG)||maxOpponentShotXG<0||maxOpponentShotXG>=1)
    throw new RangeError('Exercise chance thresholds must be probabilities.');
  const boxEntryMode=source.boxEntryMode||'pass';
  if(!['pass','either'].includes(boxEntryMode))throw new RangeError('Unknown box-entry objective.');
  const minCompletedPasses=source.minCompletedPasses??0;
  if(!Number.isInteger(minCompletedPasses)||minCompletedPasses<0||minCompletedPasses>3)
    throw new RangeError('A combination requires between zero and three completed outfield passes.');
  return {...source,type,requires,minShotXG,maxOpponentShotXG,boxEntryMode,minCompletedPasses};
}
function assessment(game,playerTeam,progress) {
  const shot=game.pendingShot;
  if(!shot)return null;
  return {shootingTeam:shot.shootingTeam,scoringTeam:shot.scoringTeam,
    bestReplyXG:bestKeeperShotChance(game),prerequisiteMet:true,
    throughBall:progress.throughBall,boxEntry:progress.boxEntry,completedPasses:progress.completedPasses,
    playerShot:shot.shootingTeam===playerTeam&&shot.scoringTeam===playerTeam};
}
export function createExerciseSession(definition,options={}) {
  if(!definition||typeof definition.id!=='string')throw new TypeError('Choose an exercise definition.');
  const playerTeam=definition.playerTeam||'white';
  if(!TEAMS.includes(playerTeam))throw new RangeError('Choose a valid player team.');
  const roundLimit=definition.roundLimit??3;
  if(![3,4].includes(roundLimit))throw new RangeError('A short exercise lasts three or four possession rounds.');
  const seed=typeof options==='number'?options:options.seed??definition.seed??1984;
  const goal=objectiveOf(definition),game=createExercisePosition(definition,seed);
  const progress={throughBall:false,boxEntry:false,completedPasses:0};
  const session={definitionId:definition.id,definition:clone({...definition,goal}),playerTeam,
    game,status:'active',roundLimit,roundsUsed:0,actionCount:0,progress,
    pendingAssessment:game.phase==='keeperReact'?assessment(game,playerTeam,progress):null,
    loosePass:null,reviewGame:null,feedbackTitle:'Find a useful plan',
    feedback:definition.objective||'Create a strong chance within the round limit.',reason:null,
    metrics:{bestShotXG:0,lastShotXG:null,lastOpponentShotXG:null,shotCount:0,shotResult:null},events:[]};
  if(session.pendingAssessment) {
    session.pendingAssessment.prerequisiteMet=prerequisite(session);
    session.pendingAssessment.prerequisiteMessage=missingPrerequisite(session);
  }
  return session;
}

function act(game,action,overrides) {
  if(!action||typeof action!=='object')throw new TypeError('Choose a legal exercise action.');
  if(action.type==='move')return applyMove(game,action.pieceId,action.x,action.y,
    {...overrides,freePawn:!!action.freePawn});
  if(action.type==='kick')return applyKick(game,action.x,action.y,
    {...overrides,passRun:!!action.passRun,disguise:!!action.disguise});
  if(action.type==='skip')return skipMove(game,overrides);
  if(action.type==='cornerTaker')return selectCornerTaker(game,action.pieceId);
  throw new RangeError('Unknown exercise action.');
}
function end(session,status,reason,title,message) {
  Object.assign(session,{status,reason,feedbackTitle:title,feedback:message});
}
function prerequisite(session,progress=session.progress) {
  const goal=session.definition.goal;
  return progress.completedPasses>=goal.minCompletedPasses
    &&(goal.requires==='through-ball'?progress.throughBall
      :goal.requires==='box-entry'?progress.boxEntry:true);
}
function missingPrerequisite(session) {
  const goal=session.definition.goal,progress=session.progress,messages=[];
  if(progress.completedPasses<goal.minCompletedPasses)
    messages.push(`Complete at least ${goal.minCompletedPasses} teammate passes to outfield players before finishing (${progress.completedPasses} completed). Self-passes and passes to the keeper do not count.`);
  if(goal.requires==='through-ball'&&!progress.throughBall)
    messages.push('First play a forward ball through the defensive line into space and have an onside teammate collect it.');
  if(goal.requires==='box-entry'&&!progress.boxEntry)
    messages.push(goal.boxEntryMode==='either'
      ?'First carry into the opposing box or deliver the ball there to a teammate.'
      :'First deliver the ball into the opposing box to a teammate; a self-pass does not meet this objective.');
  return messages.join(' ');
}
function rememberLoosePass(before,after,playerTeam) {
  const a=after.lastAction,actor=before.pieces.find(piece=>piece.id===a?.pieceId);
  if(a?.type!=='kick'||a.outcome!=='complete'||actor?.team!==playerTeam
    ||after.attack!==playerTeam||after.ball.carrierId||!point(a.from)||!point(a.to))return null;
  const flags=['goalKick','corner','throwIn','penalty'].includes(before.restart?.type)
    ?[]:offsideInfo(before,playerTeam).flaggedIds||[];
  const eligibleIds=before.pieces.filter(piece=>piece.team===playerTeam&&piece.id!==actor.id
    &&piece.type!=='K'&&!flags.includes(piece.id)).map(piece=>piece.id);
  const crossed=before.pieces.some(piece=>piece.team!==playerTeam&&piece.type!=='K'
    &&gain(playerTeam,a.from,piece)>0&&gain(playerTeam,piece,a.to)>0
    &&Math.abs(piece.x-(a.from.x+(a.to.x-a.from.x)*(piece.y-a.from.y)/(a.to.y-a.from.y)))<=2);
  return {kickerId:actor.id,team:playerTeam,target:{x:a.to.x,y:a.to.y},eligibleIds,
    throughCandidate:gain(playerTeam,a.from,a.to)>=2&&crossed
      &&(playerTeam==='white'?a.to.y<MIDFIELD_RANK:a.to.y>MIDFIELD_RANK),
    boxCandidate:inOwnBox(other(playerTeam),a.to.x,a.to.y)};
}
function updateProgress(session,before,after) {
  const a=after.lastAction||{},team=session.playerTeam;
  const actor=before.pieces.find(piece=>piece.id===a.pieceId);
  const carrier=after.pieces.find(piece=>piece.id===after.ball.carrierId);
  const priorLoose=session.loosePass;
  if(a.type==='kick'&&a.outcome==='complete'&&actor?.team===team&&after.attack===team) {
    if(carrier&&carrier.team===team&&carrier.id!==actor.id&&carrier.type!=='K') {
      session.progress.completedPasses++;
      if(inOwnBox(other(team),carrier.x,carrier.y))session.progress.boxEntry=true;
    }
    session.loosePass=rememberLoosePass(before,after,team);
  } else if(priorLoose&&a.type==='move'&&a.collection&&!a.selfPassCollection
      &&actor?.team===team&&actor.id!==priorLoose.kickerId&&carrier?.id===actor.id
      &&priorLoose.eligibleIds.includes(actor.id)
      &&actor.id!==before.looseBallKickOrigin?.pieceId
      &&after.ball.x===priorLoose.target.x&&after.ball.y===priorLoose.target.y) {
    if(priorLoose.throughCandidate)session.progress.throughBall=true;
    if(priorLoose.boxCandidate&&inOwnBox(other(team),carrier.x,carrier.y))session.progress.boxEntry=true;
    session.progress.completedPasses++;
    session.loosePass=null;
  }
  if(session.definition.goal.boxEntryMode==='either'&&a.type==='move'&&!a.freePawn&&!a.collection
      &&actor?.team===team&&before.ball.carrierId===actor.id&&after.ball.carrierId===actor.id
      &&!inOwnBox(other(team),a.from?.x,a.from?.y)&&inOwnBox(other(team),a.to?.x,a.to?.y))
    session.progress.boxEntry=true;
  if(after.restart||after.attack!==team||after.ball.carrierId
      ||session.loosePass&&(after.ball.x!==session.loosePass.target.x||after.ball.y!==session.loosePass.target.y))
    session.loosePass=null;
}
function reviewShot(before,after) {
  const review=clone(before),move=after.lastAction?.keeperMove;
  if(move) {
    const keeper=review.pieces.find(piece=>piece.id===move.pieceId);
    if(keeper)Object.assign(keeper,move.to);
  }
  review.lastAction=clone(after.lastAction);
  return review;
}
function finishShot(session,before,after) {
  const pending=session.pendingAssessment||assessment(before,session.playerTeam,session.progress);
  if(!pending)return false;
  const a=after.lastAction?.type==='stalling'&&after.lastAction.triggeringAction?.shotModel
    ?after.lastAction.triggeringAction:after.lastAction||{};
  const actualReplyXG=Number.isFinite(a.combinedProbability)?a.combinedProbability:a.shotModel?.probability;
  if(!Number.isFinite(actualReplyXG))return false;
  const goal=session.definition.goal;
  session.reviewGame=reviewShot(before,after);
  session.metrics.shotResult={from:clone(before.pendingShot.from),target:clone(a.goalTarget||{
    x:before.pendingShot.x,y:before.pendingShot.y}),bestReplyXG:pending.bestReplyXG,
    actualReplyXG,outcome:a.outcome||a.type,goal:a.type==='goal'};
  session.pendingAssessment=null;
  if(goal.type==='finish'&&pending.shootingTeam===session.playerTeam) {
    session.metrics.shotCount++;
    session.metrics.lastShotXG=pending.bestReplyXG;
    session.metrics.bestShotXG=Math.max(session.metrics.bestShotXG,pending.bestReplyXG);
    if(pending.scoringTeam!==session.playerTeam)
      end(session,'failed','own-goal','Wrong goal','That attempt was aimed at your own goal. Retry and attack the opposite net.');
    else if(!pending.prerequisiteMet)
      end(session,'failed','missing-theme','Complete the combination',pending.prerequisiteMessage||missingPrerequisite(session));
    else if(pending.bestReplyXG+1e-9>=goal.minShotXG)
      end(session,'solved','strong-finish','Strong chance created',
        `Your finish is worth ${percentage(pending.bestReplyXG)} against the keeper's best legal response. Shot quality solves the exercise, even if the sampled shot is saved or misses.`);
    else end(session,'failed','weak-finish','Improve the chance',
      `That finish is worth ${percentage(pending.bestReplyXG)} against the keeper's best legal response; the target is ${percentage(goal.minShotXG)}. Look for a better angle, closer receiver or clearer shooting route.`);
    return true;
  }
  if(goal.type==='defend'&&pending.shootingTeam===other(session.playerTeam)
      &&pending.scoringTeam===other(session.playerTeam)) {
    session.metrics.lastOpponentShotXG=actualReplyXG;
    if(actualReplyXG<=goal.maxOpponentShotXG+1e-9)
      end(session,'solved','weak-opponent-finish','Danger reduced',
        `Your defence left a ${percentage(actualReplyXG)} chance, at or below the ${percentage(goal.maxOpponentShotXG)} target. The decision is judged by chance quality, not the sampled goal or save.`);
    else end(session,'failed','strong-opponent-finish','Too much danger remains',
      `The opponent still had a ${percentage(actualReplyXG)} chance after your response. Reduce it to ${percentage(goal.maxOpponentShotXG)} or win possession before the finish.`);
    return true;
  }
  return false;
}

export function applyExerciseAction(session,action,overrides={}) {
  if(!session||!session.game||!session.definition)throw new TypeError('Start an exercise first.');
  if(session.status!=='active')return clone(session);
  const before=session.game,after=act(before,action,overrides),next=clone(session);
  next.game=after;next.actionCount++;
  const progressBefore=clone(next.progress);
  updateProgress(next,before,after);
  if(completedExerciseRound(before,after))next.roundsUsed++;
  const actor=currentTeam(before),a=after.lastAction||{};
  next.events.push({number:next.actionCount,team:actor,phase:before.phase,action:clone(action),
    result:a.type,roundsUsed:next.roundsUsed,throughBall:next.progress.throughBall,boxEntry:next.progress.boxEntry});
  if(next.events.length>LIMIT_ACTIONS)next.events.shift();
  if(after.phase==='keeperReact'&&before.phase!=='keeperReact') {
    next.pendingAssessment=assessment(after,next.playerTeam,next.progress);
    next.pendingAssessment.prerequisiteMet=prerequisite(next);
    next.pendingAssessment.prerequisiteMessage=missingPrerequisite(next);
    next.feedbackTitle='Keeper responds';
    next.feedback='The shot is committed. Its quality will be checked after the goalkeeper response.';
    return next;
  }
  if(before.phase==='keeperReact'&&after.phase!=='keeperReact'&&finishShot(next,before,after))return next;
  const goal=next.definition.goal,opponent=other(next.playerTeam);
  if(goal.type==='defend'&&before.attack===opponent&&after.attack===next.playerTeam
      &&((!after.restart&&heldBy(after,next.playerTeam)&&(
        a.type==='tackle'&&a.outcome==='won'||a.type==='interception'||a.type==='move'&&a.collection))
        ||after.restart?.team===next.playerTeam&&a.type==='offside')) {
    end(next,'solved','possession-won','Finishing threat stopped',
      'You won possession or forced offside before the opponent could finish. The defensive objective is complete.');
    return next;
  }
  if(goal.type==='finish'&&(after.attack!==next.playerTeam||after.restart?.team===opponent)) {
    end(next,'failed','possession-lost','The attack broke down',
      'The Tactical opponent stopped the attack before a qualifying finish. Retry and protect the receiver from its strongest reply.');
    return next;
  }
  if(after.phase==='finished') {
    end(next,'failed','position-ended','The line has ended','The position ended before the objective was completed. Retry a different plan.');
    return next;
  }
  if(next.roundsUsed>=next.roundLimit||next.actionCount>=LIMIT_ACTIONS) {
    end(next,'failed','round-limit','Round limit reached',
      `The exercise allows ${next.roundLimit} completed possession rounds. Look for a more direct route to the objective.`);
    return next;
  }
  if(next.progress.throughBall&&!progressBefore.throughBall) {
    next.feedbackTitle='Through ball completed';
    next.feedback='An onside teammate collected your pass beyond the defensive line. Now create the finishing chance.';
  } else if(next.progress.boxEntry&&!progressBefore.boxEntry) {
    next.feedbackTitle='Ball delivered into the box';
    next.feedback='The box-entry objective is met. Find a strong finish before the remaining rounds run out.';
  } else {
    next.feedbackTitle=actor===next.playerTeam?'Plan in progress':'Tactical reply played';
    next.feedback=`${next.roundLimit-next.roundsUsed} possession rounds remain. ${next.definition.objective||'Improve the position and complete the objective.'}`;
  }
  return next;
}
