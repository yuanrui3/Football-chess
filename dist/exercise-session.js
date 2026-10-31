/** Short, flexible Football Chess studies. Native rules decide legality; the
 * objective grades public geometry and shot quality, never a prescribed move
 * string or a favourable sampled goal. All session transitions are immutable.
 */
import {applyMove,applyKick,skipMove,selectCornerTaker,legalMoves,legalKicks,disguisedShotTargets,
  currentTeam,shotModel,offsideInfo,inOwnBox,MIDFIELD_RANK,BOARD_HEIGHT,STALLING_RULE,PACE_RULE} from './engine.js?v=eb0ab0924c73';
import {createExercisePosition} from './exercise-positions.js?v=da6cf3681b5d';
import {normalizeMidfieldGoal,midfieldGoalText,updateMidfieldProgress} from './exercise-midfield-goals.js?v=fec79958bb0c';

const TEAMS=['white','black'];
const other=team=>team==='white'?'black':'white';
const clone=value=>structuredClone(value);
const gain=(team,from,to)=>(team==='white'?-1:1)*(to.y-from.y);
const point=p=>Number.isInteger(p?.x)&&Number.isInteger(p?.y);
const heldBy=(game,team)=>game.pieces.some(piece=>piece.id===game.ball.carrierId
  &&piece.team===team&&piece.x===game.ball.x&&piece.y===game.ball.y);
const percentage=value=>`${Math.round(value*100)}%`;
const LIMIT_ACTIONS=96;
const square=p=>point(p)?`${'abcdefghijklmn'[p.x]}${BOARD_HEIGHT-p.y}`:'the ball';
const names={K:'goalkeeper',Q:'queen',R:'rook',B:'bishop',N:'knight',P:'pawn'};
const teamLabel=team=>team==='white'?'Ivory':'Obsidian';
const pieceLabel=p=>p?`${p.team==='white'?'Ivory':'Obsidian'} ${names[p.type]} ${p.id.split('-')[1]}`:'The player';

/** Keep the original short-study budget while accepting any legal route. */
export function exerciseRoundLimit(definition) {
  const base=definition.roundLimit??3;
  if(![3,4].includes(base))throw new RangeError('The core exercise budget is three or four possession rounds.');
  return base;
}

/** Describe the actual engine event, including the offender rather than just
 * the kicker for offside. Shared by live coaching and the last-action caption. */
export function exerciseActionExplanation(before,after) {
  const a=after.lastAction||{},find=id=>before.pieces.find(p=>p.id===id)||after.pieces.find(p=>p.id===id);
  if(a.type==='offside')return `${pieceLabel(find(a.offenderId))} was offside at ${square(a.offence)}${a.offsideReason==='boxKnight'?' and involved inside the attacking box when the ball was kicked':''}. ${teamLabel(a.restart.team)} has an indirect free kick.`;
  if(a.type==='tackle')return `${pieceLabel(find(a.pieceId))} tackled ${pieceLabel(find(a.targetId))} at ${square(find(a.targetId))} and won possession, landing on ${square(a.to)}.`;
  if(a.type==='interception')return `${pieceLabel(find(a.receiverId))} intercepted the pass at ${square(a.to)}.`;
  if(a.type==='save') {
    const keeper=pieceLabel(find(a.keeperId));
    if(a.outcome==='saved')return `${keeper} caught the shot at ${square(a.to)}.`;
    if(a.outcome==='corner')return `${keeper} tipped the shot out for a corner.`;
    return `${keeper} saved the shot; the ball is loose at ${square(a.to)}.`;
  }
  if(a.type==='shotMiss')return `The shot went wide. ${teamLabel(a.restart.team)} has a goal kick.`;
  if(a.type==='blockedShot')return `${pieceLabel(find(a.blockerId))} blocked the shot at ${square(a.blockedAt)}${a.outcome==='corner'?'; the ball went out for a corner':a.outcome==='out'?'; the ball went out':''}.`;
  if(a.type==='stalling') {
    const reason=a.reason==='dribbleLimit'?`The same player exceeded the ${PACE_RULE.maxDribbleRounds}-round dribbling limit`
      :a.reason==='repetition'?`The same ${a.cycleRounds}-round ball route repeated ${a.repetitions} times without new forward progress`
      :`The ball did not advance ${STALLING_RULE.minProgress} net squares in ${STALLING_RULE.rounds} rounds in the team's own half`;
    return `${reason}. ${teamLabel(a.restart.team)} has an indirect free kick at ${square(a.offence)}. This is a possession rule, separate from the exercise round limit.`;
  }
  if(a.type==='out')return `The ball went out for ${a.restart?.type==='corner'?'a corner':a.restart?.type==='goalKick'?'a goal kick':'a throw-in'}.`;
  if(a.type==='goal')return `${a.team==='white'?'Ivory':'Obsidian'} scored.`;
  if(a.type==='move'&&a.collection)return `${pieceLabel(find(a.pieceId))} collected the loose ball at ${square(a.to)}.`;
  return '';
}

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

/** Strongest immediate legal finish before a target is declared. Each target
 * gets its own best legal keeper response; a disguise uses its fair mixture.
 * The preview does not resolve a shot or inspect the future chance seed.
 */
export function bestAvailableShotChance(game) {
  if(!game||!['kick','kickoff','keeperRelease'].includes(game.phase))return 0;
  const team=currentTeam(game),shots=legalKicks(game).filter(kick=>kick.goal===team&&!kick.offside);
  const chances=shots.map(kick=>{
    const pending=applyKick(game,kick.x,kick.y);
    return pending.phase==='keeperReact'&&pending.pendingShot?.scoringTeam===team?bestKeeperShotChance(pending):0;
  });
  const pair=disguisedShotTargets(game);
  if(pair.length===2) {
    const pending=applyKick(game,pair[0].x,pair[0].y,{disguise:true});
    if(pending.phase==='keeperReact'&&pending.pendingShot?.scoringTeam===team)chances.push(bestKeeperShotChance(pending));
  }
  return Math.max(0,...chances);
}

/** A possession round ends at its kick (after any compulsory keeper release),
 * resolved shot, loose-ball round boundary, or possession-ending challenge.
 * Individual dribbles, off-ball moves and bonuses do not spend separate rounds.
 */
export function completedExerciseRound(before,after) {
  if(!before||!after||before===after||before.restart||before.phase==='kickoff'||after.lastAction?.heldCatch)return false;
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
  if(type==='possession')return normalizeMidfieldGoal(source);
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
  // Route annotations support coaching only. The result, not the route used to
  // reach it, decides whether a legal attempt solves the exercise.
  return {...source,type,requires,minShotXG,maxOpponentShotXG,boxEntryMode,minCompletedPasses,grading:'outcome'};
}
function outcomeObjective(goal) {
  if(goal.type==='possession')return midfieldGoalText(goal);
  return goal.type==='finish'
    ?`Create and take a shot worth at least ${percentage(goal.minShotXG)} against the keeper's best legal response. Any legal route can succeed.`
    :`Win possession or hold the opponent's next finishing chance to ${percentage(goal.maxOpponentShotXG)} or less.`;
}
function assessment(game,playerTeam,progress,strongestAvailableXG=null) {
  const shot=game.pendingShot;
  if(!shot)return null;
  const bestReplyXG=bestKeeperShotChance(game),opponentShot=shot.shootingTeam===other(playerTeam)&&shot.scoringTeam===other(playerTeam);
  return {shootingTeam:shot.shootingTeam,scoringTeam:shot.scoringTeam,
    bestReplyXG,bestOpponentShotXG:opponentShot?Math.max(bestReplyXG,strongestAvailableXG??bestReplyXG):null,
    throughBall:progress.throughBall,boxEntry:progress.boxEntry,completedPasses:progress.completedPasses,
    playerShot:shot.shootingTeam===playerTeam&&shot.scoringTeam===playerTeam};
}
export function createExerciseSession(definition,options={}) {
  if(!definition||typeof definition.id!=='string')throw new TypeError('Choose an exercise definition.');
  const playerTeam=definition.playerTeam||'white';
  if(!TEAMS.includes(playerTeam))throw new RangeError('Choose a valid player team.');
  const roundLimit=exerciseRoundLimit(definition);
  const seed=typeof options==='number'?options:options.seed??definition.seed??1984;
  const goal=objectiveOf(definition),game=createExercisePosition(definition,seed);
  const progress={throughBall:false,boxEntry:false,completedPasses:0,...(goal.type==='possession'?{securedReplies:0,midfieldReplyExposed:false}:{})};
  const session={definitionId:definition.id,definition:clone({...definition,goal}),playerTeam,
    game,status:'active',roundLimit,roundsUsed:0,actionCount:0,progress,
    pendingAssessment:game.phase==='keeperReact'?assessment(game,playerTeam,progress):null,
    loosePass:null,reviewGame:null,notice:null,feedbackTitle:'Find a useful plan',
    feedback:outcomeObjective(goal),reason:null,
    metrics:{bestShotXG:0,lastShotXG:null,lastOpponentShotXG:null,bestOpponentShotXG:null,testedThreatXG:null,shotCount:0,shotResult:null},events:[]};
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
  Object.assign(session,{status,reason,notice:null,feedbackTitle:title,feedback:message});
}
function continuePlay(session,title,message) {
  session.notice={title,text:message};
  session.feedbackTitle=title;session.feedback=message;
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
  if(session.definition.goal.type==='possession'){session.pendingAssessment=null;return false;}
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
    else if(pending.bestReplyXG+1e-9>=goal.minShotXG)
      end(session,'solved','strong-finish','Strong chance created',
        `Your finish is worth ${percentage(pending.bestReplyXG)} against the keeper's best legal response. Your legal route meets the finishing objective, even if the sampled shot is saved or misses.`);
    else continuePlay(session,'Keep building your attack',
      `${exerciseActionExplanation(before,after)} That finish was worth ${percentage(pending.bestReplyXG)} against the best keeper reply; the target is ${percentage(goal.minShotXG)}. Keep playing to create a stronger chance.`);
    return true;
  }
  if(goal.type==='defend'&&pending.shootingTeam===other(session.playerTeam)
      &&pending.scoringTeam===other(session.playerTeam)) {
    const strongestAvailableXG=Number.isFinite(pending.bestOpponentShotXG)?pending.bestOpponentShotXG:pending.bestReplyXG;
    const testedThreatXG=Math.max(actualReplyXG,strongestAvailableXG);
    session.metrics.lastOpponentShotXG=actualReplyXG;
    session.metrics.bestOpponentShotXG=strongestAvailableXG;
    session.metrics.testedThreatXG=testedThreatXG;
    Object.assign(session.metrics.shotResult,{bestOpponentShotXG:strongestAvailableXG,testedThreatXG});
    if(testedThreatXG<=goal.maxOpponentShotXG+1e-9)
      end(session,'solved','weak-opponent-finish','Danger reduced',
        `The tested finishing threat was ${percentage(testedThreatXG)}, at or below the ${percentage(goal.maxOpponentShotXG)} target. This checks the opponent's strongest available aim and your actual keeper response, not the sampled goal or save.`);
    else end(session,'failed','strong-opponent-finish','Too much danger remains',
      strongestAvailableXG>actualReplyXG+1e-9
        ?`The declared shot was worth ${percentage(actualReplyXG)} after your response, but another legal shooting choice offered ${percentage(strongestAvailableXG)} even against its best keeper reply. Limit every available finish to ${percentage(goal.maxOpponentShotXG)} or win possession.`
        :`The opponent still had a ${percentage(actualReplyXG)} chance after your response. Reduce it to ${percentage(goal.maxOpponentShotXG)} or win possession before the finish.`);
    return true;
  }
  return false;
}

export function applyExerciseAction(session,action,overrides={}) {
  if(!session||!session.game||!session.definition)throw new TypeError('Start an exercise first.');
  if(session.status!=='active')return clone(session);
  const before=session.game,after=act(before,action,overrides),next=clone(session);
  next.game=after;next.actionCount++;next.reviewGame=null;
  // Keep a setback visible across automatic bot replies, until the next human
  // decision. It must not disappear before the student gets control again.
  if(currentTeam(before)===next.playerTeam)next.notice=null;
  const progressBefore=clone(next.progress);
  updateProgress(next,before,after);
  const midfieldSolved=updateMidfieldProgress(next,before,after);
  if(completedExerciseRound(before,after))next.roundsUsed++;
  const actor=currentTeam(before),a=after.lastAction||{};
  next.events.push({number:next.actionCount,team:actor,phase:before.phase,action:clone(action),
    result:a.type,roundsUsed:next.roundsUsed,throughBall:next.progress.throughBall,boxEntry:next.progress.boxEntry});
  if(next.events.length>LIMIT_ACTIONS)next.events.shift();
  if(after.phase==='keeperReact'&&before.phase!=='keeperReact') {
    const opponentShot=after.pendingShot?.shootingTeam===other(next.playerTeam)&&after.pendingShot?.scoringTeam===other(next.playerTeam);
    next.pendingAssessment=assessment(after,next.playerTeam,next.progress,
      opponentShot?bestAvailableShotChance(before):null);
    next.feedbackTitle='Keeper responds';
    next.feedback=next.definition.goal.type==='possession'?'The shot is committed, but this study is completed by securing midfield possession.':'The shot is committed. Its quality will be checked after the goalkeeper response.';
    return next;
  }
  const shotAssessed=before.phase==='keeperReact'&&after.phase!=='keeperReact'&&finishShot(next,before,after);
  if(next.status!=='active')return next;
  const goal=next.definition.goal,opponent=other(next.playerTeam);
  if(midfieldSolved){
    end(next,'solved','midfield-controlled',goal.kind==='switch'?'Switch secured':'Possession protected',
      `Your outfield player controls the ball in the target area after ${next.progress.securedReplies} complete defensive ${next.progress.securedReplies===1?'reply':'replies'}. Your legal route meets the midfield objective; no finish is required.`);
    return next;
  }
  if(goal.type==='defend'&&before.attack===opponent&&after.attack===next.playerTeam
      &&((!after.restart&&heldBy(after,next.playerTeam)&&(
        a.type==='tackle'&&a.outcome==='won'||a.type==='interception'||a.type==='move'&&a.collection))
        ||after.restart?.team===next.playerTeam&&a.type==='offside')) {
    end(next,'solved','possession-won','Finishing threat stopped',
      'You won possession or forced offside before the opponent could finish. The defensive objective is complete.');
    return next;
  }
  if(goal.type!=='defend'&&after.score[opponent]>before.score[opponent]) {
    end(next,'failed','goal-conceded','Goal conceded',
      'The opponent scored before you completed the objective. Undo a decision or retry a different plan.');
    return next;
  }
  if(goal.type!=='defend'&&!shotAssessed&&before.attack===next.playerTeam
      &&(after.attack!==next.playerTeam||after.restart?.team===opponent))
    continuePlay(next,'Win it back and continue',
      `${exerciseActionExplanation(before,after)||'The opponent took possession.'} The exercise is still open: win the ball back and ${goal.type==='possession'?'start a new possession streak':'build another attack'}.`);
  if(after.phase==='finished') {
    end(next,'failed','position-ended','The line has ended','The position ended before the objective was completed. Retry a different plan.');
    return next;
  }
  if(next.roundsUsed>=next.roundLimit) {
    end(next,'failed','round-limit','Round limit reached',
      `${exerciseActionExplanation(before,after)} ${shotAssessed?`The chance was ${percentage(next.metrics.lastShotXG)}; the target is ${percentage(goal.minShotXG)}. `:''}The ${next.roundLimit} possession rounds are complete. Undo a decision or retry to explore another route.`.trim());
    return next;
  }
  if(next.actionCount>=LIMIT_ACTIONS) {
    end(next,'failed','action-limit','Study action limit reached',
      'This attempt reached the action limit. Undo a decision or retry to explore another route.');
    return next;
  }
  if(next.notice)return next;
  if(goal.type==='possession'){
    next.feedbackTitle='Midfield control';
    next.feedback=`${next.progress.securedReplies} / ${goal.secureReplies} clean defensive replies secured. ${outcomeObjective(goal)}`;
    if(a.type==='tackleMiss')continuePlay(next,'Keep the ball out of tackling reach',
      'The knight evaded a 50% tackle. You still have the ball, but that defensive reply cannot count as clean protection. Find a safer route.');
    return next;
  }
  if(next.progress.throughBall&&!progressBefore.throughBall) {
    next.feedbackTitle='Through ball completed';
    next.feedback='An onside teammate collected your pass beyond the defensive line. Now create the finishing chance.';
  } else if(next.progress.boxEntry&&!progressBefore.boxEntry) {
    next.feedbackTitle='Ball delivered into the box';
    next.feedback='You found a box entry. Now create a strong finish; other legal finishing routes also count.';
  } else {
    next.feedbackTitle=actor===next.playerTeam?'Plan in progress':'Tactical reply played';
    next.feedback=`${next.roundLimit-next.roundsUsed} possession rounds remain. ${outcomeObjective(goal)}`;
  }
  return next;
}
