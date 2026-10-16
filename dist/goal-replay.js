// A replay is a bounded recording of the match, never another engine run.
import {BOARD_WIDTH as W,BOARD_HEIGHT as H,GOAL_FILES,BOX_FILES,BOX_DEPTH,FILE_LABELS as FILES,RULES_VERSION,canOccupySquare} from './engine.js?v=db24debe7605';
const TEAMS=['white','black'];
const REPLAY_VERSION=2;
const geometry=()=>({width:W,height:H,goalFiles:[...GOAL_FILES],boxFiles:[...BOX_FILES],boxDepth:BOX_DEPTH});
const sameFiles=(value,expected)=>Array.isArray(value)&&value.length===expected.length&&value.every((file,index)=>file===expected[index]);
const validGeometry=value=>value&&value.width===W&&value.height===H&&value.boxDepth===BOX_DEPTH&&sameFiles(value.goalFiles,GOAL_FILES)&&sameFiles(value.boxFiles,BOX_FILES);
const currentStateGeometry=state=>state?.rulesVersion===RULES_VERSION&&state.boardDimensions?.width===W&&state.boardDimensions?.height===H;
const TEAM={white:'Ivory FC',black:'Obsidian FC'};
const NAMES={K:'Goalkeeper',Q:'Queen',R:'Rook',B:'Bishop',N:'Knight',P:'Pawn'};
const SYMBOLS={K:'♚',Q:'♛',R:'♜',B:'♝',N:'♞',P:'♟'};
const ACTIONS=new Set(['move','cornerTaker','tackle','tackleMiss','foul','kick','miss','interception','skip','shotAttempt','goal','save','blockedShot','shotMiss','out','offside','stalling','timeout']);
const ROSTER=['K','Q','R1','R2','B1','B2','N1','N2','P1','P2','P3'];
const IDS=new Set(TEAMS.flatMap(team=>ROSTER.map(id=>`${team}-${id}`)));
const MAX_FRAMES=12,MAX_BYTES=90000;
const clone=value=>structuredClone(value);
const integer=(value,min,max)=>Number.isInteger(value)&&value>=min&&value<=max;
const point=value=>value&&integer(value.x,-24,W+23)&&integer(value.y,-24,H+23);
const pitchPoint=value=>point(value)&&integer(value.x,0,W-1)&&integer(value.y,0,H-1);
const goalPoint=value=>point(value)&&GOAL_FILES.includes(value.x)&&(value.y===-1||value.y===H);
const samePoint=(a,b)=>a?.x===b?.x&&a?.y===b?.y;
const score=value=>value&&integer(value.white,0,9999)&&integer(value.black,0,9999);
const sameScore=(a,b)=>a?.white===b?.white&&a?.black===b?.black;
const coordinate=p=>GOAL_FILES.includes(p.x)&&(p.y===-1||p.y===H)?`${FILES[p.x].toUpperCase()} goal`:pitchPoint(p)?`${FILES[p.x]}${H-p.y}`:'outside the pitch';
const boxTeam=(x,y)=>BOX_FILES.includes(x)?(y<BOX_DEPTH?'black':y>=H-BOX_DEPTH?'white':null):null;

function recordPiece(piece,discipline){
  const {id,type,team,x,y}=piece,result={id,type,team,x,y};
  if(piece.originalType!==undefined)result.originalType=piece.originalType;
  if(piece.replacementKeeper===true)result.replacementKeeper=true;
  const yellows=discipline?.[id]?.yellowCards??piece.yellowCards;
  if(yellows>0)result.yellowCards=yellows;
  return result;
}
function recordSentOff(entries){
  return (entries||[]).map(piece=>({...recordPiece(piece),reason:piece.reason,yellowCards:piece.yellowCards}));
}
function validIdentity(piece){
  if(!piece||!IDS.has(piece.id)||!TEAMS.includes(piece.team)||!NAMES[piece.type]||!piece.id.startsWith(`${piece.team}-`)||!pitchPoint(piece))return false;
  const native=piece.id.split('-')[1][0];
  return piece.replacementKeeper===true
    ?native!=='K'&&piece.type==='K'&&piece.originalType===native
    :piece.type===native&&piece.originalType===undefined&&(piece.replacementKeeper===undefined||piece.replacementKeeper===false);
}
function validPieces(pieces,sentOff=[]){
  if(!Array.isArray(pieces)||pieces.length<14||pieces.length>22||!Array.isArray(sentOff)||sentOff.length>8)return false;
  const ids=new Set(),occupied=new Set(),counts={white:0,black:0},keepers={white:0,black:0},departed=new Set();
  for(const piece of sentOff){
    if(!validIdentity(piece)||departed.has(piece.id)||!['red','secondYellow'].includes(piece.reason)||!integer(piece.yellowCards,0,2)||piece.reason==='secondYellow'&&piece.yellowCards!==2)return false;
    departed.add(piece.id);
  }
  for(const piece of pieces){
    if(!validIdentity(piece)||ids.has(piece.id)||departed.has(piece.id)||piece.yellowCards!==undefined&&!integer(piece.yellowCards,0,1))return false;
    const square=`${piece.x},${piece.y}`;
    // Same-size saved recordings may predate the keeper-only goal-front
    // cells. Preserve their historical outfield positions without making
    // those squares legal in the live engine or relaxing the king's box.
    const historicalGoalFront=piece.type!=='K'&&GOAL_FILES.includes(piece.x)&&(piece.y===0||piece.y===H-1);
    if(occupied.has(square)||!canOccupySquare(piece,piece.x,piece.y)&&!historicalGoalFront)return false;
    ids.add(piece.id);occupied.add(square);
    counts[piece.team]++;if(piece.type==='K')keepers[piece.team]++;
  }
  if(ids.size+departed.size!==IDS.size||TEAMS.some(team=>counts[team]<7||counts[team]>11||keepers[team]>1))return false;
  return [...pieces,...sentOff].every(piece=>!piece.replacementKeeper||departed.has(`${piece.team}-K`));
}

function recordAction(action){
  if(!action||!ACTIONS.has(action.type))return null;
  const result={type:action.type};
  for(const key of ['team','shootingTeam','pieceId','shooterId'])if(action[key]!==undefined)result[key]=action[key];
  for(const key of ['from','to','goalTarget'])if(point(action[key]))result[key]={x:action[key].x,y:action[key].y};
  const declaredDisguise=action.disguised===true&&action.type==='shotAttempt';
  if(Array.isArray(action.path)&&!declaredDisguise)result.path=action.path.slice(0,32).map(p=>({x:p.x,y:p.y}));
  if(action.disguised===true){
    result.disguised=true;
    if(Array.isArray(action.targetOptions))result.targetOptions=action.targetOptions.slice(0,2).map(target=>({x:target.x,y:target.y,...(Array.isArray(target.path)?{path:target.path.slice(0,32).map(p=>({x:p.x,y:p.y}))}:{})}));
    if(!declaredDisguise&&action.chosenTargetIndex!==undefined)result.chosenTargetIndex=action.chosenTargetIndex;
    for(const key of ['combinedProbability','targetProbability'])if(Number.isFinite(action[key]))result[key]=action[key];
    // The declaration records possibilities, never a committed single aim.
    if(declaredDisguise){delete result.to;delete result.goalTarget;}
  }
  if(action.keeperMove)result.keeperMove={pieceId:action.keeperMove.pieceId,from:{...action.keeperMove.from},to:{...action.keeperMove.to}};
  if(Number.isFinite(action.probability))result.probability=action.probability;
  if(action.ownGoal!==undefined)result.ownGoal=!!action.ownGoal;
  if(action.penalty===true||action.shotModel?.penalty===true)result.penalty=true;
  if(action.type==='foul'){
    for(const key of ['offenderId','targetId','sentOffId','card','secondYellow','outcome'])if(action[key]!==undefined)result[key]=action[key];
    for(const key of ['contactSpot','intendedTo'])if(point(action[key]))result[key]={x:action[key].x,y:action[key].y};
    if(action.keeperReplacement){const r=action.keeperReplacement;result.keeperReplacement={pieceId:r.pieceId,originalType:r.originalType,from:{...r.from},to:{...r.to}};}
  }
  if(action.type==='blockedShot'){result.blockerId=action.blockerId;result.outcome=action.outcome;}
  if(action.lofted){result.lofted=true;result.bypassedPieceId=action.bypassedPieceId;result.bypassedSquare={...action.bypassedSquare};}
  return result;
}

function validAction(action){
  if(action===null)return true;
  if(!action||!ACTIONS.has(action.type))return false;
  for(const key of ['team','shootingTeam'])if(action[key]!==undefined&&!TEAMS.includes(action[key]))return false;
  for(const key of ['pieceId','shooterId','offenderId','targetId','sentOffId'])if(action[key]!==undefined&&!IDS.has(action[key]))return false;
  for(const key of ['from','to','goalTarget'])if(action[key]!==undefined&&!point(action[key]))return false;
  if(action.path!==undefined&&(!Array.isArray(action.path)||action.path.length<1||action.path.length>32||!action.path.every(point)))return false;
  if(action.probability!==undefined&&(!Number.isFinite(action.probability)||action.probability<0||action.probability>1))return false;
  if(action.ownGoal!==undefined&&typeof action.ownGoal!=='boolean')return false;
  if(action.penalty!==undefined&&(action.penalty!==true||!['shotAttempt','goal','save','shotMiss'].includes(action.type)||action.keeperMove))return false;
  if(action.disguised!==undefined){
    const options=action.targetOptions;
    if(action.disguised!==true||action.penalty||!['shotAttempt','goal','save','shotMiss','blockedShot'].includes(action.type)||!pitchPoint(action.from)||!Array.isArray(options)||options.length!==2||!options.every(goalPoint)||options[0].y!==options[1].y||options[0].x===options[1].x)return false;
    const shootingTeam=action.shootingTeam||action.pieceId?.split('-')[0];
    if(!TEAMS.includes(shootingTeam)||options[0].y!==(shootingTeam==='white'?-1:H))return false;
    if(options.some(target=>target.path!==undefined&&(!Array.isArray(target.path)||target.path.length<2||target.path.length>32||!target.path.every(point)||!samePoint(target.path[0],action.from)||!samePoint(target.path.at(-1),target))))return false;
    for(const key of ['combinedProbability','targetProbability'])if(action[key]!==undefined&&(!Number.isFinite(action[key])||action[key]<0||action[key]>1))return false;
    if(action.targetProbability!==undefined&&action.targetProbability!==.5)return false;
    if(action.type==='shotAttempt'){
      if(action.chosenTargetIndex!==undefined||action.to!==undefined||action.path!==undefined||action.goalTarget!==undefined)return false;
    }else if(!integer(action.chosenTargetIndex,0,1)||!samePoint(action.goalTarget||action.to,options[action.chosenTargetIndex]))return false;
  }else if(action.targetOptions!==undefined||action.chosenTargetIndex!==undefined||action.combinedProbability!==undefined||action.targetProbability!==undefined)return false;
  if(action.type==='foul'){
    if(!IDS.has(action.offenderId)||!IDS.has(action.targetId)||action.pieceId!==action.offenderId||!action.offenderId.startsWith(`${action.team}-`)||action.targetId.startsWith(`${action.team}-`)||action.card!==null&&!['yellow','red'].includes(action.card)||typeof action.secondYellow!=='boolean'||action.secondYellow&&action.card!=='red'||!['freeKick','penalty','forfeit'].includes(action.outcome)||!pitchPoint(action.from)||!pitchPoint(action.contactSpot)||!pitchPoint(action.intendedTo))return false;
    if(action.sentOffId!==undefined&&(action.card!=='red'||action.sentOffId!==action.offenderId))return false;
    const replacement=action.keeperReplacement;
    if(replacement&&(!IDS.has(replacement.pieceId)||replacement.pieceId.split('-')[1][0]==='K'||replacement.originalType!==replacement.pieceId.split('-')[1][0]||!pitchPoint(replacement.from)||!pitchPoint(replacement.to)||replacement.pieceId.split('-')[0]!==action.offenderId.split('-')[0]))return false;
  }
  if(action.type==='blockedShot'&&(!IDS.has(action.blockerId)||!['corner','blocked','out'].includes(action.outcome)))return false;
  if(action.lofted!==undefined){
    if(action.lofted!==true||!['kick','miss','interception','out','offside'].includes(action.type)||!IDS.has(action.bypassedPieceId)||!pitchPoint(action.bypassedSquare))return false;
  }else if(action.bypassedPieceId!==undefined||action.bypassedSquare!==undefined)return false;
  const move=action.keeperMove;
  return !move||(IDS.has(move.pieceId)&&pitchPoint(move.from)&&pitchPoint(move.to)&&boxTeam(move.from.x,move.from.y)===move.pieceId.split('-')[0]&&Math.max(Math.abs(move.from.x-move.to.x),Math.abs(move.from.y-move.to.y))<=1);
}

function frameCaption(state){
  const action=state.lastAction,piece=state.pieces.find(p=>p.id===action?.pieceId),name=piece?NAMES[piece.type]:'Player';
  if(!action)return 'The build-up begins.';
  const side=TEAM[action.team]||'';
  if(action.type==='shotAttempt')return action.disguised?`${side} ${name.toLowerCase()} disguises a shot from ${coordinate(action.from)}: the ${action.targetOptions.map(coordinate).join(' or ')} (50/50), chosen after the keeper reacts.`:action.shotModel?.penalty||action.penalty?`${side} takes a penalty from ${coordinate(action.from)} toward the ${coordinate(action.to)}.`:`${side} ${name.toLowerCase()} shoots from ${coordinate(action.from)} toward the ${coordinate(action.to)}.`;
  if(action.type==='foul'){
    const offender=piece||state.sentOff?.find(p=>p.id===action.offenderId),role=offender?NAMES[offender.type].toLowerCase():'player';
    const card=action.card==='red'?(action.secondYellow?' A second yellow means a red card.':' Red card.'):action.card==='yellow'?' Yellow card.':'';
    const award=action.outcome==='penalty'?' A penalty is awarded.':action.outcome==='forfeit'?' The match is forfeited.':' A free kick is awarded.';
    const replacement=action.keeperReplacement?` ${action.keeperReplacement.pieceId.split('-')[1]} takes over in goal.`:'';
    return `${side} ${role} commits a foul.${card}${award}${replacement}`;
  }
  if(action.type==='move')return `${side} ${name.toLowerCase()} moves to ${coordinate(action.to)}.`;
  if(action.type==='cornerTaker')return `${side} chooses the ${name.toLowerCase()} as corner taker at ${coordinate(action.to)}.`;
  if(action.type==='tackle')return `${side} wins possession with a tackle.`;
  if(action.type==='tackleMiss')return `${side} attempts a tackle; the knight keeps the ball.`;
  if(['kick','miss','interception'].includes(action.type))return `${side} ${action.lofted?'lofts a pass over one player toward':'plays the ball toward'} ${coordinate(action.to)}${action.type==='miss'?' — inaccurate pass':action.type==='interception'?' — intercepted':''}.`;
  if(action.type==='skip')return `${side} ends positioning.`;
  if(action.type==='save')return `${side} makes the save.`;
  if(action.type==='blockedShot'){
    const blocker=state.pieces.find(piece=>piece.id===action.blockerId);
    return `${blocker?`${TEAM[blocker.team]} ${NAMES[blocker.type].toLowerCase()}`:'A defender'} blocks the shot${action.outcome==='corner'?', conceding a corner.':action.outcome==='out'?' out for a goal kick.':'; the defending side recovers possession.'}`;
  }
  if(action.type==='shotMiss')return 'The previous shot goes wide.';
  if(action.type==='goal')return 'The teams prepare for kickoff.';
  return `${side} prepares the next passage of play.`;
}

function recordFrame(state){
  return {pieces:state.pieces.map(piece=>recordPiece(piece,state.discipline)),sentOff:recordSentOff(state.sentOff),ball:{x:state.ball.x,y:state.ball.y,carrierId:state.ball.carrierId??null},score:{...state.score},action:recordAction(state.lastAction),caption:frameCaption(state)};
}

function validFrame(frame,isGoal){
  if(!frame||!validPieces(frame.pieces,frame.sentOff)||!score(frame.score)||!validAction(frame.action)||typeof frame.caption!=='string'||frame.caption.length>280)return false;
  if(frame.action?.keeperMove&&frame.pieces.find(piece=>piece.id===frame.action.keeperMove.pieceId)?.type!=='K')return false;
  if(frame.action?.disguised&&!['Q','N'].includes(frame.pieces.find(piece=>piece.id===(frame.action.shooterId||frame.action.pieceId))?.type))return false;
  if(frame.action?.type==='foul'){
    const action=frame.action,offender=frame.pieces.find(piece=>piece.id===action.offenderId),dismissed=frame.sentOff?.find(piece=>piece.id===action.offenderId),replacement=action.keeperReplacement;
    if(!frame.pieces.some(piece=>piece.id===action.targetId))return false;
    if(action.card==='red'){
      if(action.sentOffId!==action.offenderId||offender||!dismissed||dismissed.reason!==(action.secondYellow?'secondYellow':'red'))return false;
    }else if(!offender||action.card==='yellow'&&offender.yellowCards!==1)return false;
    if(replacement){const keeper=frame.pieces.find(piece=>piece.id===replacement.pieceId);if(dismissed?.type!=='K'||!keeper?.replacementKeeper||keeper.originalType!==replacement.originalType||keeper.x!==replacement.to.x||keeper.y!==replacement.to.y)return false;}
  }
  const ball=frame.ball;
  if(!ball||!point(ball)||ball.carrierId!==null&&!IDS.has(ball.carrierId))return false;
  if(isGoal)return ball.carrierId===null&&GOAL_FILES.includes(ball.x)&&(ball.y===-1||ball.y===H)&&frame.action?.type==='goal';
  if(!pitchPoint(ball))return false;
  const carrier=frame.pieces.find(p=>p.id===ball.carrierId);
  return ball.carrierId===null||!!carrier&&carrier.x===ball.x&&carrier.y===ball.y;
}

function validRosterTransition(previous,current){
  const oldOff=new Set((previous.sentOff||[]).map(piece=>piece.id)),newOff=new Set((current.sentOff||[]).map(piece=>piece.id));
  if([...oldOff].some(id=>!newOff.has(id)))return false;
  const removed=previous.pieces.filter(piece=>!current.pieces.some(p=>p.id===piece.id));
  if(removed.length>1||current.pieces.some(piece=>!previous.pieces.some(p=>p.id===piece.id)))return false;
  const addedOff=[...newOff].filter(id=>!oldOff.has(id)),action=current.action;
  if(addedOff.length!==removed.length||removed.some(piece=>!addedOff.includes(piece.id)))return false;
  if(removed.length&&(action?.type!=='foul'||action.card!=='red'||action.sentOffId!==removed[0].id))return false;
  for(const piece of previous.sentOff||[]){
    const recorded=(current.sentOff||[]).find(p=>p.id===piece.id);
    if(JSON.stringify(recordSentOff([piece]))!==JSON.stringify(recordSentOff([recorded])))return false;
  }
  if(removed.length){
    const old=removed[0],departed=current.sentOff.find(piece=>piece.id===old.id);
    if(departed.type!==old.type||departed.originalType!==old.originalType||!!departed.replacementKeeper!==!!old.replacementKeeper||departed.reason!==(action.secondYellow?'secondYellow':'red'))return false;
  }
  for(const piece of current.pieces){
    const old=previous.pieces.find(p=>p.id===piece.id);
    if(piece.type!==old.type||piece.originalType!==old.originalType||!!piece.replacementKeeper!==!!old.replacementKeeper){
      const r=action?.keeperReplacement;
      if(action?.type!=='foul'||!r||removed[0]?.type!=='K'||r.pieceId!==piece.id||piece.type!=='K'||!piece.replacementKeeper||piece.originalType!==old.type||old.x!==r.from.x||old.y!==r.from.y||piece.x!==r.to.x||piece.y!==r.to.y)return false;
    }
  }
  return true;
}

/** Validate local storage without normalising or inventing historical positions. */
export function restoreGoalReplay(value){
  try{
    if(!value||JSON.stringify(value).length>MAX_BYTES||value.version!==REPLAY_VERSION||!validGeometry(value.board)||!score(value.score)||!TEAMS.includes(value.team)||!TEAMS.includes(value.shootingTeam)||typeof value.ownGoal!=='boolean'||value.ownGoal!==(value.team!==value.shootingTeam)||!IDS.has(value.shooterId)||!value.shooterId.startsWith(`${value.shootingTeam}-`)||!integer(value.goalTurn,0,1000000000)||!Array.isArray(value.frames)||value.frames.length<2||value.frames.length>MAX_FRAMES)return null;
    const frames=value.frames;
    if(!frames.every((frame,index)=>validFrame(frame,index===frames.length-1)))return null;
    if(frames.slice(1).some((frame,index)=>!validRosterTransition(frames[index],frame)))return null;
    const final=frames.at(-1),previous=frames.at(-2),other=value.team==='white'?'black':'white';
    if(!sameScore(value.score,final.score)||final.score[value.team]!==previous.score[value.team]+1||final.score[other]!==previous.score[other]||!frames.slice(0,-1).every(frame=>sameScore(frame.score,previous.score))||final.action.team!==value.team||final.action.shootingTeam!==value.shootingTeam||final.action.pieceId!==value.shooterId||final.action.ownGoal!==value.ownGoal||!Number.isFinite(final.action.probability)||!pitchPoint(final.action.from)||!point(final.action.to)||final.action.to.x!==final.ball.x||final.action.to.y!==final.ball.y||final.ball.y!==(value.team==='white'?-1:H))return null;
    if(final.action.disguised||previous.action?.disguised){
      if(!final.action.disguised||!previous.action?.disguised||previous.action.type!=='shotAttempt'||JSON.stringify(final.action.targetOptions)!==JSON.stringify(previous.action.targetOptions)||!samePoint(final.action.from,previous.action.from))return null;
    }
    for(const piece of previous.pieces){
      const recorded=final.pieces.find(p=>p.id===piece.id),move=final.action.keeperMove;
      if(move?.pieceId===piece.id){if(piece.x!==move.from.x||piece.y!==move.from.y||recorded.x!==move.to.x||recorded.y!==move.to.y)return null;}
      else if(recorded.x!==piece.x||recorded.y!==piece.y)return null;
    }
    // Keep a known, bounded schema. Extra stored properties never reach the UI.
    return {version:REPLAY_VERSION,board:geometry(),score:{...value.score},team:value.team,shootingTeam:value.shootingTeam,ownGoal:value.ownGoal,shooterId:value.shooterId,goalTurn:value.goalTurn,frames:frames.map(frame=>({pieces:frame.pieces.map(piece=>recordPiece(piece)),sentOff:recordSentOff(frame.sentOff),ball:{...frame.ball},score:{...frame.score},action:recordAction(frame.action),caption:frame.caption}))};
  }catch{return null;}
}

/** Capture a real goal before the engine's kickoff formation replaces the scene. */
export function buildGoalReplay(history,before,after){
  if(after?.lastAction?.type!=='goal'||before?.phase!=='keeperReact'||!before.pendingShot||!currentStateGeometry(before)||!currentStateGeometry(after))return null;
  try{
    const action=after.lastAction,states=[];
    // Older undo entries may contain positions from previous rule versions.
    // Stop at the last invalid snapshot; never repair a recording's coordinates.
    const candidates=Array.isArray(history)?history.map(entry=>entry.game):[];
    if(candidates.at(-1)!==before)candidates.push(before);
    let lastKey=null;
    for(let index=candidates.length-1;index>=0&&states.length<MAX_FRAMES-1;index--){
      const state=candidates[index];
      if(!currentStateGeometry(state)||!sameScore(state.score,before.score)||!validPieces(state.pieces,state.sentOff))break;
      const frame=recordFrame(state);
      if(!validFrame(frame,false))break;
      const key=JSON.stringify(frame);
      if(key===lastKey)continue;
      states.push(frame);lastKey=key;
    }
    states.reverse();
    const final=recordFrame(before),move=action.keeperMove;
    if(move){const keeper=final.pieces.find(piece=>piece.id===move.pieceId);if(!keeper)return null;keeper.x=move.to.x;keeper.y=move.to.y;}
    final.ball={x:action.to.x,y:action.to.y,carrierId:null};final.score={...after.score};final.action=recordAction(action);
    const shooter=before.pieces.find(piece=>piece.id===action.pieceId);
    const penalty=action.shotModel?.penalty||action.penalty;
    const held=penalty?' Keeper holds for the penalty.':action.shotModel?.keeperInBox?' Keeper holds position.':' The king is outside its box; no keeper reaction.';
    final.caption=`${TEAM[action.team]} ${action.ownGoal?'benefits from an own goal':penalty?'scores a penalty':'scores'}! ${shooter?NAMES[shooter.type]: 'Shot'} from ${coordinate(action.from)} to the ${coordinate(action.to)}.${action.disguised?' The actual target is revealed after the keeper reacts.':''}${move?` Keeper reacts from ${coordinate(move.from)} to ${coordinate(move.to)}.`:held}`;
    return restoreGoalReplay({version:REPLAY_VERSION,board:geometry(),score:{...after.score},team:action.team,shootingTeam:action.shootingTeam,ownGoal:!!action.ownGoal,shooterId:action.pieceId,goalTurn:after.turn,frames:[...states,final]});
  }catch{return null;}
}

/** A separate board and timer: playback never touches the live game or clock. */
export function createReplayPlayer({onComplete=()=>{},onInteract=()=>{}}={}){
  const $=id=>document.getElementById(id),pitch=$('replayPitch'),board=$('replayBoard'),overlay=$('replayOverlay'),ball=$('replayBall');
  const tokens=new Map(),animations=new Set();
  let replay=null,index=0,timer=null,playing=false,completed=false;
  const svg=(name,attributes)=>{const node=document.createElementNS('http://www.w3.org/2000/svg',name);for(const [key,value]of Object.entries(attributes))node.setAttribute(key,String(value));return node;};
  overlay.replaceChildren(
    svg('rect',{x:3,y:103,width:W*100-6,height:H*100-6}),
    svg('path',{d:`M0 ${100+H*50}H${W*100}M${BOX_FILES[0]*100} 100V${100+BOX_DEPTH*100}H${(BOX_FILES.at(-1)+1)*100}V100M${BOX_FILES[0]*100} ${(H+1)*100}V${(H+1-BOX_DEPTH)*100}H${(BOX_FILES.at(-1)+1)*100}V${(H+1)*100}`}),
    svg('circle',{cx:W*50,cy:100+H*50,r:110})
  );
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){
    const square=document.createElement('div');square.className=`replay-square${(x+y)%2?' checker':''}${boxTeam(x,y)?' box':''}`;square.setAttribute('role','gridcell');square.setAttribute('aria-label',`${FILES[x]}${H-y}`);board.append(square);
  }
  const clearTimer=()=>{clearTimeout(timer);timer=null;};
  function clearAnimations(){for(const animation of animations)animation.cancel?.();animations.clear();}
  function animate(element,frames){
    if(!playing||!element.animate||window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)return;
    const animation=element.animate(frames,{duration:720,easing:'ease-in-out'});animations.add(animation);animation.finished.then(()=>animations.delete(animation)).catch(()=>animations.delete(animation));
  }
  function controls(){
    $('replayPlayBtn').textContent=playing?'Ⅱ Pause':'▶ Play';$('replayPlayBtn').setAttribute('aria-pressed',String(playing));
    $('replayPrevBtn').disabled=!replay||index===0;$('replayNextBtn').disabled=!replay||index===replay.frames.length-1;
    $('replayScrub').value=String(index);$('replayStep').textContent=replay?`${index+1} / ${replay.frames.length}`:'0 / 0';
  }
  function renderFrame(previous=null){
    if(!replay)return;
    clearAnimations();const frame=replay.frames[index],goal=index===replay.frames.length-1;
    $('replayCaption').textContent=frame.caption;$('replayScore').textContent=`${frame.score.white} : ${frame.score.black}`;
    $('replayStep').setAttribute('aria-label',goal?'Goal scored':`Build-up step ${index+1}`);
    const size=pitch.getBoundingClientRect().width/W;
    const activeIds=new Set(frame.pieces.map(piece=>piece.id));
    for(const [id,token]of tokens){token.hidden=!activeIds.has(id);token.style.display=token.hidden?'none':'';token.setAttribute('aria-hidden',String(token.hidden));}
    for(const piece of frame.pieces){
      let token=tokens.get(piece.id);
      if(!token){token=document.createElement('span');token.className='replay-token';token.dataset.pieceId=piece.id;token.setAttribute('role','img');const disc=document.createElement('span');disc.className=`piece ${piece.team}`;disc.textContent=SYMBOLS[piece.type];token.append(disc);pitch.append(token);tokens.set(piece.id,token);}
      token.hidden=false;token.style.display='';token.setAttribute('aria-hidden','false');
      token.firstElementChild.textContent=SYMBOLS[piece.type];token.dataset.pieceRole=piece.type;
      token.dataset.replacementKeeper=String(!!piece.replacementKeeper);
      token.querySelectorAll('.yellow-card-badge').forEach(badge=>badge.remove());
      if(piece.yellowCards){const badge=document.createElement('span');badge.className='yellow-card-badge';badge.setAttribute('aria-hidden','true');token.append(badge);}
      token.style.left=`${piece.x/W*100}%`;token.style.top=`${piece.y/H*100}%`;token.setAttribute('aria-label',`${TEAM[piece.team]} ${NAMES[piece.type]} at ${coordinate(piece)}${piece.replacementKeeper?` (${piece.id.split('-')[1]}, originally ${NAMES[piece.originalType].toLowerCase()})`:''}${piece.yellowCards?', yellow card':''}`);
      const from=previous?.pieces.find(p=>p.id===piece.id);
      if(from&&(from.x!==piece.x||from.y!==piece.y))animate(token,[{transform:`translate(${(from.x-piece.x)*size}px,${(from.y-piece.y)*size}px)`},{transform:'translate(0,0)'}]);
    }
    ball.style.left=`${(frame.ball.x+.5)/W*100}%`;ball.style.top=`${(frame.ball.y+.5)/H*100}%`;ball.setAttribute('aria-label',goal?'Ball in the goal':`Ball at ${coordinate(frame.ball)}`);
    if(previous&&(previous.ball.x!==frame.ball.x||previous.ball.y!==frame.ball.y)){
      const recorded=frame.action?.path||[],start=recorded.findIndex(p=>p.x===previous.ball.x&&p.y===previous.ball.y);
      const path=start>=0?recorded.slice(start):[previous.ball];
      if(path.at(-1)?.x!==frame.ball.x||path.at(-1)?.y!==frame.ball.y)path.push(frame.ball);
      animate(ball,path.map(p=>({transform:`translate(calc(-50% + ${(p.x-frame.ball.x)*size}px),calc(-50% + ${(p.y-frame.ball.y)*size}px))`})));
    }
    overlay.querySelectorAll('.replay-action-line,.replay-keeper-line').forEach(el=>el.remove());
    const action=frame.action;
    function line(points,className){const el=document.createElementNS('http://www.w3.org/2000/svg','polyline');el.setAttribute('class',className);el.setAttribute('points',points.map(p=>`${p.x*100+50},${p.y*100+150}`).join(' '));overlay.append(el);}
    if(action?.type==='shotAttempt'&&action.disguised){
      for(const target of action.targetOptions)line(target.path?.length>1?target.path:[action.from,target],'replay-action-line');
    }else if(action?.path?.length>1)line(action.path,'replay-action-line');
    if(action?.keeperMove)line([action.keeperMove.from,action.keeperMove.to],'replay-keeper-line');
    $('replayMoment').textContent=goal?'GOAL':action?.type==='foul'?action.card==='red'?'RED CARD':action.card==='yellow'?'YELLOW CARD':'FOUL':action?.penalty?'PENALTY':action?.type==='shotAttempt'?'SHOT DECLARED':action?.lofted?'LOFTED PASS':'BUILD-UP';
    controls();
  }
  function schedule(){
    clearTimer();if(!playing||!replay)return;
    timer=setTimeout(()=>{
      timer=null;if(!playing)return;
      if(index===replay.frames.length-1){playing=false;controls();if(!completed){completed=true;onComplete();}return;}
      const previous=replay.frames[index];index++;renderFrame(previous);schedule();
    },index===replay.frames.length-1?1600:1050);
  }
  function manual(action){onInteract();clearTimer();clearAnimations();action();controls();}
  $('replayPlayBtn').addEventListener('click',()=>manual(()=>{playing=!playing;if(playing){if(index===replay.frames.length-1){index=0;completed=false;renderFrame();}schedule();}}));
  $('replayRestartBtn').addEventListener('click',()=>manual(()=>{index=0;completed=false;playing=true;renderFrame();schedule();}));
  $('replayPrevBtn').addEventListener('click',()=>manual(()=>{playing=false;index=Math.max(0,index-1);renderFrame();}));
  $('replayNextBtn').addEventListener('click',()=>manual(()=>{playing=false;index=Math.min(replay.frames.length-1,index+1);renderFrame();}));
  $('replayScrub').addEventListener('input',()=>manual(()=>{playing=false;index=Math.max(0,Math.min(replay.frames.length-1,Math.trunc(Number($('replayScrub').value))||0));renderFrame();}));
  return {
    load(value,{autoplay=true}={}){
      clearTimer();clearAnimations();replay=restoreGoalReplay(value);playing=false;index=0;completed=false;if(!replay)return false;
      const shooter=replay.frames.at(-1).pieces.find(piece=>piece.id===replay.shooterId);
      $('replayTitle').textContent=`${TEAM[replay.team]} ${replay.ownGoal?'· Own goal':'· Goal'}`;
      const goalAction=replay.frames.at(-1).action;
      const chance=goalAction.disguised&&Number.isFinite(goalAction.combinedProbability)?`${Math.round(goalAction.combinedProbability*100)}% combined chance · ${Math.round(goalAction.probability*100)}% at the chosen target`:`${Math.round(goalAction.probability*100)}% ${goalAction.penalty?'penalty scoring chance':'finishing chance after the keeper’s decision'}`;
      $('replayDetails').textContent=`${TEAM[replay.shootingTeam]} ${shooter?NAMES[shooter.type].toLowerCase():'player'} · ${chance}`;
      $('replayScrub').max=String(replay.frames.length-1);playing=!!autoplay;renderFrame();schedule();return true;
    },
    stop(){clearTimer();clearAnimations();playing=false;controls();}
  };
}
