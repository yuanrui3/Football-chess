import {createGame, legalMoves, legalKicks, disguisedShotTargets, applyMove, applyKick, skipMove, chooseAIAction, currentTeam, cornerTakers, selectCornerTaker, BOARD_WIDTH as W, BOARD_HEIGHT as H, GOAL_FILES, BOX_FILES, BOX_DEPTH, CENTRAL_GOAL_FILES, MIDFIELD_RANK, inOwnBox, canOccupySquare, isBox, isGoalMouth, shotChance, shotModel, offsideInfo, LONG_TACKLE_RANGE, DRIBBLE_RANGE, FOUL_RULE, STALLING_RULE, PACE_RULE, ACTION_SECONDS, actionTimeout, progressInfo, paceInfo, positionActions, normalizeGame} from './engine.js?v=db24debe7605';
import {createMatchClock, restoreMatchClock, tickMatchClock, settleMatchClock, rewindMatchClock} from './match-clock.js?v=1fa32f5eed6c';
import {buildGoalReplay, restoreGoalReplay, createReplayPlayer} from './goal-replay.js?v=79837985ace2';
import {createMatchStats, restoreMatchStats, recordMatchTransition, addPossessionTime, matchStatsSummary, shortPieceId} from './match-stats.js?v=ed082e4db7ee';

const $ = id => document.getElementById(id);
const normalShotLegend = document.querySelector('.shot-legend').textContent;
const NAMES = {K:'Goalkeeper',Q:'Queen',R:'Rook',B:'Bishop',N:'Knight',P:'Pawn'};
const SYMBOLS = {K:'♚',Q:'♛',R:'♜',B:'♝',N:'♞',P:'♟'};
const TEAM = {white:'Ivory FC',black:'Obsidian FC'};
const STORE = 'football-chess-match-v4';
const SAVE_GEOMETRY = {width:W,height:H,boxWidth:BOX_FILES.length,boxDepth:BOX_DEPTH};
const AI_PACES = [3000,1800,600];
const MOVE_PATTERNS={K:'One square in any direction',Q:'Up to 10 movement points straight or diagonally',R:'Up to 10 movement points horizontally or vertically',B:'Up to 10 movement points diagonally',N:'One L-shaped jump over other pieces',P:'One square forward, back, left, or right'};
const DRIBBLE_PATTERNS={...MOVE_PATTERNS,Q:`Up to ${DRIBBLE_RANGE} movement points straight or diagonally`,R:`Up to ${DRIBBLE_RANGE} movement points horizontally or vertically`,B:`Up to ${DRIBBLE_RANGE} movement points diagonally`};
const KICK_PATTERNS={K:'Straight or diagonal kicks, like a queen',Q:'Straight or diagonal kicks',R:'Horizontal or vertical kicks',B:'Diagonal kicks',N:'One L-shaped kick over other pieces',P:'Forward, backward, left, or right kicks'};
const TACKLE_PATTERNS={K:'1 square in any direction',Q:`up to ${LONG_TACKLE_RANGE} squares straight or diagonally`,R:`up to ${LONG_TACKLE_RANGE} squares horizontally or vertically`,B:`up to ${LONG_TACKLE_RANGE} squares diagonally`,N:'one L-shaped jump',P:'1 square diagonally, forward or backward'};
const RESTART_NAMES={freeKick:'Free kick',penalty:'Penalty',throwIn:'Throw-in',corner:'Corner kick',goalKick:'Goal kick',offside:'Indirect free kick',stalling:'Stalling free kick',timeout:'Time-wasting free kick'};
const PACE_REASONS={repetition:{name:'Repetition free kick',label:'Repeated play',explanation:'Awarded against the possessing side for returning to the same ball square and controlling player for a third time in a repeated route without new forward progress.'},dribbleLimit:{name:'Carrying-limit free kick',label:'Carrying limit',explanation:'Awarded for carrying with the same player in a fifth round without a teammate taking control or a shot.'}};
const restartName=restart=>PACE_REASONS[restart?.reason]?.name||RESTART_NAMES[restart?.type]||'Restart';
const FILES = 'abcdefghijklmnopqrstuvwxyz'.slice(0,W);
const coord = (x,y) => `${FILES[x]}${H-y}`;
const percent = chance => `${Math.round(chance*100)}%`;
const shotPercent = chance => `${(chance*100).toFixed(1)}%`;
const kickPhase = () => ['kick','kickoff','keeperRelease'].includes(game.phase);
const positionPhase = () => ['attackMove','defendMove'].includes(game.phase);
const passRunPhase = () => game.phase==='passRun';
const cornerSelectPhase = () => game.phase==='cornerSelect';
const penaltyPending = () => game.phase==='keeperReact'&&game.pendingShot?.penalty===true;
const keeperCanReact = () => {if(penaltyPending())return false;const king=game.pieces.find(p=>p.type==='K'&&p.team===currentTeam(game));return !!king&&inOwnBox(king.team,king.x,king.y);};
const ballSVG = '<svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="18" fill="#fff9e9" stroke="#23372f" stroke-width="1"/><path d="M20 11l9 6-3 10H14l-3-10zM3 17l8 0M29 17l8 0M20 11V2M14 27l-5 8M26 27l5 8" fill="#25392e" stroke="#25392e" stroke-width="1.5"/></svg>';
let foulsEnabled=true;
let game = createGame({foulsEnabled});
let stage='setup',paused=false,remaining=600,duration=10,flipped=false;
let actionRemaining=ACTION_SECONDS,fullTimePending=false,finalChance=null;
let passRunSelected=false;
let disguiseSelected=true;
let selectedId=null,history=[],aiTimer=null,toastTimer=null,lastTick=Date.now();
let storageOK=true,aiPace=3000,aiDifficulty='casual',whiteDifficulty='casual',lastComputerAction=null,freePawnMode=false,dribbleMode=false,legacyMatch=false;
let aiWorker=null,aiWatchdog=null,aiGeneration=0;
let lastGoalReplay=null,replayAutoContinue=false,replayPendingResult=false;
let matchStats=createMatchStats();
let shotFlight=null,shotFlightGeneration=0;
try {
  const saved=JSON.parse(localStorage.getItem(STORE)||'null');
  const geometryMatches=saved?.version===4&&Object.entries(SAVE_GEOMETRY).every(([key,value])=>saved.geometry?.[key]===value)
    &&saved.game?.boardDimensions?.width===W&&saved.game?.boardDimensions?.height===H&&saved.game?.rulesVersion>=14;
  const positionsValid=Array.isArray(saved?.game?.pieces)&&saved.game.pieces.length>0&&saved.game.pieces.length<=22&&saved.game.pieces.every(piece=>Number.isInteger(piece.x)&&Number.isInteger(piece.y)&&piece.x>=0&&piece.x<W&&piece.y>=0&&piece.y<H);
  if(geometryMatches&&positionsValid&&['setup','playing','finished'].includes(saved.stage)) {
    game=upgradeSavedGame(saved.game);passRunSelected=!!saved.passRunSelected&&['kick','kickoff','keeperRelease'].includes(game.phase);disguiseSelected=saved.disguiseSelected!==false;foulsEnabled=game.foulsEnabled===true;game.mode=['solo','local','watch'].includes(game.mode)?game.mode:'solo';stage=saved.stage;remaining=saved.remaining;duration=saved.duration;flipped=!!saved.flipped;
    restoreClock(restoreMatchClock(saved,{remaining,actionSeconds:ACTION_SECONDS}));
    if(duration===0){fullTimePending=false;finalChance=null;}
    paused=stage==='playing';history=Array.isArray(saved.history)?saved.history.filter(entry=>entry?.game?.boardDimensions?.width===W&&entry.game.boardDimensions.height===H&&entry.game.rulesVersion>=14).slice(-80):[];
    matchStats=restoreMatchStats(saved.matchStats,game,{partial:stage!=='setup'});
    aiPace=AI_PACES.includes(saved.aiPace)?saved.aiPace:3000;lastComputerAction=saved.lastComputerAction||null;
    aiDifficulty=saved.aiDifficulty==='tactical'?'tactical':'casual';
    whiteDifficulty=saved.whiteDifficulty==='tactical'?'tactical':'casual';
    const replay=restoreGoalReplay(saved.lastGoalReplay);
    if(replay&&replay.score.white<=game.score.white&&replay.score.black<=game.score.black)lastGoalReplay=replay;
  } else {
    let old=null;
    for(const key of ['football-chess-match-v3','football-chess-match-v2','football-chess-match-v1']){
      try{const candidate=JSON.parse(localStorage.getItem(key)||'null');if(candidate?.game){old=candidate;break;}}catch{}
    }
    old=old||(saved?.game?saved:null);
    if(old){
      legacyMatch=true;aiPace=AI_PACES.includes(old.aiPace)?old.aiPace:3000;
      aiDifficulty=old.aiDifficulty==='tactical'?'tactical':'casual';whiteDifficulty=old.whiteDifficulty==='tactical'?'tactical':'casual';
      duration=[0,5,10,15].includes(old.duration)?old.duration:10;remaining=duration*60;flipped=!!old.flipped;
      foulsEnabled=typeof old.foulsEnabled==='boolean'?old.foulsEnabled:typeof old.game.foulsEnabled==='boolean'?old.game.foulsEnabled:true;
      game=createGame({foulsEnabled,mode:['solo','local','watch'].includes(old.game.mode)?old.game.mode:'solo',minutes:duration||10});
    }
  }
} catch {storageOK=false;}

const squares=[];
for(let y=0;y<H;y++)for(let x=0;x<W;x++) {
  const button=document.createElement('button');button.type='button';button.dataset.x=x;button.dataset.y=y;button.setAttribute('role','gridcell');
  $('board').append(button);squares.push(button);
}
$('ranks').innerHTML=Array.from({length:H},(_,i)=>`<span>${H-i}</span>`).join('');
document.querySelector('.file-labels').innerHTML=[...FILES].map(file=>`<span>${file}</span>`).join('');
$('board').setAttribute('aria-label',`${W} by ${H} football chess pitch`);
const markings=document.querySelector('.pitch-markings'),pitchWidth=W*100,pitchHeight=H*100,boxStart=BOX_FILES[0]*100,boxEnd=(BOX_FILES.at(-1)+1)*100,boxDepth=BOX_DEPTH*100;
markings.setAttribute('viewBox',`0 0 ${pitchWidth} ${pitchHeight}`);
markings.innerHTML=`<rect x="3" y="3" width="${pitchWidth-6}" height="${pitchHeight-6}" rx="1"/><path d="M0 ${pitchHeight/2}H${pitchWidth}M${boxStart} 0V${boxDepth}H${boxEnd}V0M${boxStart} ${pitchHeight}V${pitchHeight-boxDepth}H${boxEnd}V${pitchHeight}"/><circle cx="${pitchWidth/2}" cy="${pitchHeight/2}" r="110"/><circle class="centre-point" cx="${pitchWidth/2}" cy="${pitchHeight/2}" r="6"/>`;
for(const id of ['goalTop','goalBottom'])$(id).innerHTML=GOAL_FILES.map(x=>`<button type="button" data-goal-x="${x}" class="goal-cell" aria-label="Goal target ${FILES[x]}" disabled><span class="goal-file">${FILES[x]}</span><span class="goal-odds">—</span></button>`).join('');
$('mode').value=game.mode;$('duration').value=String(duration);$('kickoff').value=game.attack;$('aiPace').value=String(aiPace);
$('aiDifficulty').value=aiDifficulty;
$('whiteDifficulty').value=whiteDifficulty;$('foulsEnabled').checked=foulsEnabled;
const replayPlayer=createReplayPlayer({
  onComplete(){if(replayAutoContinue&&$('replayDialog').hasAttribute('open'))$('replayDialog').close();},
  onInteract(){replayAutoContinue=false;}
});

function clockSnapshot(){return {remaining,actionRemaining,fullTimePending,finalChance:finalChance?{...finalChance}:null};}
function restoreClock(clock){({remaining,actionRemaining,fullTimePending,finalChance}=clock);}
function resetClock(){restoreClock(createMatchClock({remaining:duration*60,actionSeconds:ACTION_SECONDS}));lastTick=Date.now();}
function save(){flushClockElapsed();try{localStorage.setItem(STORE,JSON.stringify({version:4,geometry:SAVE_GEOMETRY,foulsEnabled,passRunSelected,disguiseSelected,game,stage,paused,remaining,duration,actionRemaining,fullTimePending,finalChance,flipped,aiPace,aiDifficulty,whiteDifficulty,lastComputerAction,lastGoalReplay,matchStats,history:history.slice(-80)}));}catch{storageOK=false;$('saveNote').textContent='Match saving is unavailable in this browser.';}}
function toast(text){clearTimeout(toastTimer);$('toast').textContent=text;$('toast').classList.add('visible');toastTimer=setTimeout(()=>$('toast').classList.remove('visible'),3800);}
function isComputer(team=currentTeam(game)){return game.mode==='watch'||game.mode==='solo'&&team==='black';}
function computerDifficulty(team=currentTeam(game)){return game.mode==='watch'&&team==='white'?whiteDifficulty:aiDifficulty;}
function anyDialog(){return !!document.querySelector('dialog[open]');}
function blocked(){return !!shotFlight||stage!=='playing'||paused||anyDialog()||isComputer();}
function stopAIWorker(){clearTimeout(aiWatchdog);aiWatchdog=null;if(aiWorker){aiWorker.terminate();aiWorker=null;}}
function cancelAI(){clearTimeout(aiTimer);aiTimer=null;stopAIWorker();aiGeneration++;}
function teamLabel(team){return game.mode==='solo'?(team==='white'?'Your':'Computer’s'):TEAM[team]+'’s';}
function pieceLabel(piece){return `${NAMES[piece.type]} ${shortPieceId(piece.id)}${piece.replacementKeeper?` (former ${NAMES[piece.originalType]?.toLowerCase()||'outfielder'})`:''}`;}
function yellowCards(piece,discipline=game.discipline){return Math.max(0,Number(discipline?.[piece.id]?.yellowCards)||0);}
function cardBadge(piece,discipline=game.discipline){return yellowCards(piece,discipline)>0?'<span class="yellow-card-badge" aria-hidden="true"></span>':'';}
function tackleOdds(target){
  const win=target.tackleProbability??1,foul=target.foulProbability??(game.foulsEnabled?FOUL_RULE.foul:0),evaded=Math.max(0,1-win-foul);
  return `${percent(win)} win${evaded>0?` · ${percent(evaded)} evaded`:''}${foul>0?` · ${percent(foul)} foul (${percent(FOUL_RULE.yellow)} yellow, ${percent(FOUL_RULE.red)} red of all attempts)`:''}`;
}
function foulDescription(action){
  const offender=game.pieces.find(piece=>piece.id===action.offenderId)||game.sentOff?.find(piece=>piece.id===action.offenderId),name=offender?`${TEAM[offender.team]} ${pieceLabel(offender)}`:`${TEAM[action.team]} ${shortPieceId(action.offenderId||action.pieceId)}`;
  const card=action.secondYellow?' · Second yellow: sent off':action.card==='red'?' · Red card: sent off':action.card==='yellow'?' · Yellow card':'';
  const award=action.outcome==='forfeit'?' · Match forfeited':game.restart?` · ${RESTART_NAMES[game.restart.type]||'Restart'} for ${TEAM[game.restart.team]}`:'';
  const replacement=game.pieces.find(piece=>piece.id===action.keeperReplacement?.pieceId);
  return `Foul by ${name}${card}${award}${replacement?` · ${shortPieceId(replacement.id)} takes over in goal`:''}.`;
}
function setupMoves(piece){
  if(!piece||(game.mode==='solo'&&piece.team==='black'))return [];
  const moves=[],carrier=game.ball.carrierId===piece.id;
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){
    const occupant=game.pieces.find(p=>p.x===x&&p.y===y);
    if(carrier){if(y===MIDFIELD_RANK&&CENTRAL_GOAL_FILES.includes(x)&&(!occupant||occupant.id===piece.id))moves.push({x,y,type:'move'});continue;}
    if(piece.team===game.attack&&piece.type!=='K'&&y===MIDFIELD_RANK&&occupant?.id===game.ball.carrierId){moves.push({x,y,type:'move'});continue;}
    if(occupant)continue;
    const ownHalf=piece.team==='white'?y>MIDFIELD_RANK:y<MIDFIELD_RANK;
    if(ownHalf&&(piece.type==='K'?inOwnBox(piece.team,x,y):canOccupySquare(piece,x,y)))moves.push({x,y,type:'move'});
  }
  return moves;
}
function getTargets(){
  if(stage==='setup')return setupMoves(game.pieces.find(p=>p.id===selectedId));
  if(blocked())return [];
  if(cornerSelectPhase())return cornerTakers(game).map(piece=>({x:piece.x,y:piece.y,type:'cornerTaker',pieceId:piece.id}));
  if(kickPhase())return legalKicks(game);
  if(positionPhase()&&selectedId&&!freePawnMode&&(selectedId===game.ball.carrierId)!==dribbleMode)return [];
  return selectedId?legalMoves(game,selectedId,{freePawn:positionPhase()&&freePawnMode}):[];
}
function upgradeSavedGame(state){return normalizeGame(state);}
function setMoveMode(mode){freePawnMode=mode==='pawn';dribbleMode=mode==='dribble';}
function isOffsideTarget(target){
  if(target.offside)return true;
  return (game.offside?.flaggedIds||[]).includes(selectedId)&&(target.type==='tackle'||(!game.ball.carrierId&&target.x===game.ball.x&&target.y===game.ball.y));
}
function accuracyLabel(){return game.restart?.type==='throwIn'?'throw':'pass';}
function disguiseChoices(){return kickPhase()&&game.restart?.type!=='penalty'?disguisedShotTargets(game):[];}
function goalChoiceNames(options){return options.map(target=>FILES[target.x].toUpperCase()).join(' or ');}
function shotPreviewModel(x,y,keeperPosition){
  const options=disguiseSelected?disguiseChoices():[];
  if(options.length!==2||!options.some(target=>target.x===x&&target.y===y))return shotModel(game,x,y,keeperPosition);
  const carrier=game.pieces.find(piece=>piece.id===game.ball.carrierId),target=options[0];
  const preview={...game,phase:'keeperReact',pendingShot:{shooterId:carrier.id,shooterType:carrier.type,shootingTeam:carrier.team,scoringTeam:carrier.team,defendingTeam:carrier.team==='white'?'black':'white',from:{x:carrier.x,y:carrier.y},x:target.x,y:target.y,path:target.path,distance:target.distance,disguised:true,targetOptions:options}};
  return shotModel(preview,target.x,target.y,keeperPosition);
}
function drawShotPaths(model,className){for(const targetModel of model.targetModels||[model])addLine([targetModel.origin,targetModel.target],className);}
function restartGuide(){
  const restart=game.restart;if(!restart)return '';
  if(cornerSelectPhase())return isComputer()?'The computer chooses a corner taker from its teammates in the attacking half. The middle rank does not count. The taker moves to the corner; both teams then resettle before the kick.':'Choose any teammate in the attacking half as the corner taker. The middle rank does not count. Select a highlighted player on the pitch or choose from the list. The taker moves to the corner; both teams then resettle before the kick.';
  if(restart.type==='penalty')return kickPhase()?'Choose any of the four attacking goal targets. Penalties have a fixed 80% conversion chance; piece pattern, distance and keeper position do not alter it. The keeper holds position.':'Both teams have a protected positioning round before the penalty. The taker stays locked at the foul spot; then choose a goal target for the fixed 80% penalty.';
  if(restart.type==='freeKick'&&kickPhase())return 'Take the free kick using the taker’s kicking pattern. Passes may loft over one intervening player; legal direct shots are allowed.';
  if(restart.type==='goalKick'&&kickPhase())return 'Both teams have resettled. The king must now pass from the goal box and may loft over one intervening player; a direct shot is not allowed.';
  if(kickPhase())return restart.type==='throwIn'?'Throw along any straight or diagonal direction. Accurate through 5 squares, unpredictable beyond 5, maximum 10. No direct goal.':restart.indirect?'Take an indirect free kick. A pass may loft over one intervening player; a direct shot is not allowed.':'The positioning round is complete. Take the corner using the taker’s kicking pattern. A pass may loft over one intervening player. Teammates obstruct ordinary shots; defenders may block them.';
  return `${restart.type==='stalling'?`${PACE_REASONS[restart.reason]?.explanation||'Awarded for insufficient forward progress in the possessing team’s own half.'} `:''}Both teams resettle before the restart: attacking side first, then defence. Each has one off-ball move and one shared pawn-or-king bonus. ${restart.type==='goalKick'?'The king':'The taker'} stays at the restart spot; no dribbling or tackling until the ball is played.`;
}
function renderRestart(){
  const restart=game.restart,taker=game.pieces.find(piece=>piece.id===restart?.takerId);
  $('restartPanel').hidden=!restart||stage!=='playing';
  const choosing=cornerSelectPhase()&&stage==='playing';
  $('cornerTakerChoice').hidden=!choosing;
  $('cornerTakerList').replaceChildren(...(choosing?cornerTakers(game):[]).map(piece=>{
    const button=document.createElement('button');button.type='button';button.dataset.cornerTaker=piece.id;button.disabled=blocked();
    const symbol=document.createElement('span');symbol.className=`corner-taker-symbol ${piece.team}`;symbol.textContent=SYMBOLS[piece.type];symbol.setAttribute('aria-hidden','true');
    const label=document.createElement('span');label.textContent=`${pieceLabel(piece)} · ${coord(piece.x,piece.y)}`;
    button.append(symbol,label);button.setAttribute('aria-label',`Choose ${TEAM[piece.team]} ${pieceLabel(piece)} at ${coord(piece.x,piece.y)} as corner taker`);return button;
  }));
  if(!restart)return;
  $('restartTitle').textContent=`${restartName(restart)} · ${TEAM[restart.team]}`;
  $('restartInfo').textContent=choosing?restartGuide():`${taker?pieceLabel(taker):'Nearest eligible player'} at ${coord(restart.spot.x,restart.spot.y)}. ${restart.cornerFallback?'No teammate was in the attacking half, so the nearest eligible player takes the corner. ':''}${restartGuide()}`;
  $('throwGuide').hidden=restart.type!=='throwIn';
  $('throwGuide').textContent='1–5 squares: 100% · 6: 85% · 7: 70% · 8: 55% · 9: 40% · 10: 25%';
}
function passRunGuide(){const passer=game.pieces.find(piece=>piece.id===game.passRun?.pieceId);return `${passer?pieceLabel(passer):'The passer'} may move once without the ball, using its normal movement pattern and ten-point budget. The run cannot enter either box, tackle or collect the ball. It spends the next off-ball move; the receiver’s dribble and shared pawn-or-king bonus remain. Skip to keep that off-ball move available.`;}
function renderProgress(){
  const info=progressInfo(game),pace=paceInfo(game),panel=$('progressPanel');
  const showPace=pace.active&&(pace.dribbleRounds>0||pace.dribbledThisRound||pace.repetitionWarning),warning=info.warning||showPace&&(pace.warning||pace.repetitionWarning);
  panel.hidden=stage!=='playing'||!info.active&&!showPace;
  panel.dataset.warning=String(warning);
  if(panel.hidden)return;
  $('progressTitle').textContent=`${TEAM[info.team]} · ${pace.repetitionWarning?'Break the repeated route':showPace&&pace.dribbleRoundsRemaining===0?'Pass or shoot before carrying again':info.warning?'Last round to progress':showPace&&pace.warning?'Share possession soon':'Keep the attack moving'}`;
  const net=info.progress>=0?`${info.progress} forward`:`${Math.abs(info.progress)} backward`;
  const messages=[];
  if(info.active)messages.push(`Own half · ${info.rounds}/${STALLING_RULE.rounds} rounds used · ${net} squares. ${info.needed>0?`Advance ${info.needed} more, finish the round at midfield or beyond, or shoot within ${info.roundsRemaining} ${info.roundsRemaining===1?'round':'rounds'} to avoid an indirect free kick.`:'Keep this forward gain through your kick to reset the count.'}`);
  if(showPace){const carrier=game.pieces.find(piece=>piece.id===pace.carrierId);messages.push(`${carrier?pieceLabel(carrier):'Same player'} · ${pace.dribbleRounds}/${PACE_RULE.maxDribbleRounds} completed dribbling rounds${pace.dribbledThisRound?' · carrying this round':''}. A fifth carry gives the nearest opponent an indirect free kick. Pass to a teammate or shoot to reset.`);}
  if(pace.repetitionWarning)messages.push('Repeating this route with the ball again without new forward progress can give the opponent an indirect free kick; defending moves are not penalised.');
  $('progressInfo').textContent=messages.join(' ');
}
function targetKind(target){
  if(stage==='setup')return 'setup';
  if(cornerSelectPhase())return 'corner';
  if(game.phase==='keeperReact')return 'keeper';
  if(target.type==='tackle')return 'tackle';
  if(kickPhase()){
    if(target.goal)return 'shot';
    if(game.restart?.type==='throwIn')return 'throw';
    const receiver=game.pieces.find(piece=>piece.id===target.receiverId);
    return receiver?(receiver.team===currentTeam(game)?'pass':'interception'):'kick';
  }
  if(selectedId===game.ball.carrierId)return 'dribble';
  if(!game.ball.carrierId&&target.x===game.ball.x&&target.y===game.ball.y)return 'collect';
  return 'offball';
}
function shotBlockLabel(model){const total=model?.blockerIds?.length||0;return total?(model.disguised?`${shotPercent(model.blockProbability)} average block chance across both possible paths`:`${total} defender${total===1?'':'s'} in the shot path, ${shotPercent(model.blockProbability)} block chance`):'';}
function targetDescription(target){
  const kind=targetKind(target),destination=coord(target.x,target.y);
  if(kind==='corner'){const taker=game.pieces.find(piece=>piece.id===target.pieceId);return `choose as corner taker${taker?`: ${pieceLabel(taker)}`:''}`;}
  const receiver=game.pieces.find(piece=>piece.id===target.receiverId);
  if(target.offsideReason==='boxKnight'){
    const attacker=game.pieces.find(piece=>piece.id===target.offsidePieceId);
    return `OFFSIDE: attacking ${attacker?pieceLabel(attacker):'player'}${attacker?` at ${coord(attacker.x,attacker.y)}`:''} in the opponent’s box is involved in play; this kick awards the opponents an indirect free kick`;
  }
  if(isOffsideTarget(target))return `OFFSIDE warning at ${destination}: touching this ball awards the opponents an indirect free kick`;
  if(target.lofted){
    const blocker=game.pieces.find(piece=>piece.id===target.bypassedPieceId),over=blocker?`${TEAM[blocker.team]} ${pieceLabel(blocker)} at ${coord(blocker.x,blocker.y)}`:'one intervening player';
    return `Lofted pass over ${over} to ${receiver?`${TEAM[receiver.team]} ${pieceLabel(receiver)}`:'space'} at ${destination}${receiver&&receiver.team!==currentTeam(game)?'; the opponent will intercept':''}; kicker stays in place`;
  }
  if(kind==='setup')return `Starting formation square ${destination}`;
  if(kind==='keeper')return `Keeper reaction to ${destination}`;
  if(kind==='tackle')return `Tackle toward ${destination}: ${tackleOdds(target)}`;
  if(kind==='dribble')return `Dribble to ${destination}, player and ball move together`;
  if(kind==='collect')return `Move to ${destination} and collect ${game.looseBallKickOrigin?.pieceId===selectedId?'your own pass; this also uses the dribble allowance':'the loose ball'}`;
  if(kind==='offball')return passRunPhase()?`Run the passer to ${destination}; ball stays with the receiver, next off-ball move is used`:`Move without ball to ${destination}, ball stays in place`;
  if(kind==='shot'&&game.restart?.type==='penalty')return `Penalty at ${FILES[target.x].toUpperCase()} · fixed 80% conversion chance; keeper holds position`;
  if(kind==='shot'){const model=shotPreviewModel(target.x,target.y),blocking=shotBlockLabel(model);return model.disguised?`Disguised shot at ${goalChoiceNames(model.targetOptions)}; each target 50%, chosen after the keeper reacts`:`Shoot at ${FILES[target.x].toUpperCase()}${target.goal!==currentTeam(game)?' into your own goal':''}${blocking?`; ${blocking}`:''}`;}
  if(kind==='throw')return `Throw ${receiver?`to ${TEAM[receiver.team]} ${pieceLabel(receiver)}`:'into space'} at ${destination}; thrower stays at the boundary`;
  if(kind==='pass')return `Pass to ${pieceLabel(receiver)} at ${destination}, kicker stays in place${passRunSelected&&receiver.type!=='K'?'; an accurate pass offers an optional passer run':receiver.type==='K'?'; the king must release immediately':''}`;
  if(kind==='interception')return `Kick to ${destination}, opposing ${pieceLabel(receiver)} will intercept`;
  return `Kick into space at ${destination}, ball will be loose`;
}
function renderActionContext(selected){
  const carrying=selected?.id===game.ball.carrierId,kicking=kickPhase(),reacting=game.phase==='keeperReact',running=passRunPhase();
  const ownCarrier=game.pieces.some(piece=>piece.id===game.ball.carrierId&&piece.team===currentTeam(game));
  const actions=positionActions(game);
  for(const [id,active]of [['offBallAction',(positionPhase()||running)&&actions.normalAvailable&&(!selected||!carrying)],['dribbleAction',actions.dribbleAvailable&&(!selected||carrying)],['kickAction',kicking]]){
    $(id).classList.toggle('active',stage==='playing'&&active);$(id).setAttribute('aria-current',stage==='playing'&&active?'true':'false');
  }
  $('kickAction').textContent=game.restart?.type==='throwIn'?'Throw-in':'Pass / shoot';
  let kind='offball',title='Move · dribble · pass / shoot',rule='Select a footballer to see its movement and kicking patterns. Moving a player and kicking the ball are separate actions.';
  if(stage==='finished'){title='Match complete';rule='Start a new match to choose your next action.';}
  else if(stage==='setup'){
    kind='setup';title=selected?'Arrange the formation':'Three ways to play';
    rule=selected?`Without the ball: ${MOVE_PATTERNS[selected.type]}. Dribble: ${DRIBBLE_PATTERNS[selected.type]}. ${KICK_PATTERNS[selected.type]}. Setup placement follows the starting-formation rules.`:'Move without the ball to find space. Dribble to carry it. Pass or shoot to send the ball while the player stays.';
  }else if(cornerSelectPhase()){kind='pass';title='Choose the corner taker';rule=restartGuide();}
  else if(running){kind='offball';title='Pass & Run · optional';rule=passRunGuide();}
  else if(game.mode==='watch'){kind=reacting?'keeper':kicking?'pass':'offball';title=penaltyPending()?'Penalty · fixed 80%':'Computer vs computer';rule=penaltyPending()?'The computer resolves the fixed 80% penalty; the keeper holds position.':'Both teams play automatically. Pause to study the position, or change either team’s difficulty and the pace beside the pitch.';}
  else if(reacting&&penaltyPending()){kind='keeper';title='Penalty · fixed 80%';rule='The penalty target is committed. The keeper holds position; resolve the fixed 80% conversion attempt. There is no extra keeper move.';}
  else if(reacting){kind='keeper';title=keeperCanReact()?'Keeper reaction':'Resolve shot';rule=game.pendingShot?.disguised?`The shooter can aim at ${goalChoiceNames(game.pendingShot.targetOptions)}, each 50%. The target is chosen only after your keeper decision. ${keeperCanReact()?'Move only the king one square, or hold.':'The king is outside its own box and has no saving reach or extra reaction.'} Displayed odds average both targets.`:keeperCanReact()?'The shot is already in flight. Move only the defending king one square, or hold. This extra reaction is separate from ordinary positioning.':'The king is outside its own box and has no saving reach or extra reaction. Resolve the committed shot; ordinary re-entry into the box restores goalkeeper abilities.';}
  else if(game.restart){kind='pass';title=selected?.id===game.restart.takerId&&!kicking?'Restart taker · locked':restartName(game.restart);rule=restartGuide();}
  else if(kicking&&selected){kind='pass';title='Pass / shoot';rule=`${pieceLabel(selected)} stays at ${coord(selected.x,selected.y)}; only the ball travels. ${KICK_PATTERNS[selected.type]}.${selected.type==='N'?' A goal cell must be one L-shaped jump away to shoot. Knights can enter either box with an ordinary dribble or an off-ball jump, or receive a pass there. Knights use the standard distance, angle and keeper scoring model.':' Kicks can travel beyond 10 squares with reduced pass accuracy.'}`;}
  else if(positionPhase()&&freePawnMode){kind='offball';title='Pawn or King · bonus';rule='Use one shared bonus to reposition a pawn or king without the ball. Pawns move one cardinal square; kings one square in any direction. It may collect a loose ball, but cannot dribble or tackle. The keeper’s shot reaction is separate.';}
  else if(selected){
    kind=carrying?'dribble':'offball';title=carrying?'Dribble with the ball':'Move without the ball';
    rule=`${carrying?'Player and ball move together.':'The ball stays in place unless this move collects it or wins a tackle.'} ${(carrying?DRIBBLE_PATTERNS:MOVE_PATTERNS)[selected.type]}. ${['Q','R','B'].includes(selected.type)?`Each entered box square costs 2 points; an ordinary square costs 1.${carrying?' The eight-point budget allows at most four entered squares on a route entirely inside a box.':''} `:''}${!carrying&&!freePawnMode?`Tackle reach: ${TACKLE_PATTERNS[selected.type]}. `:''}${selected.type==='K'?'The king may leave its own box but cannot enter the opponent’s box. ':carrying?'Ordinary dribbling may enter or cross either box. ':'Outfield players may enter either box without the ball. ' }The four goal-mouth squares are reserved for that goal’s own keeper. ${freePawnMode?'Uses the shared pawn-or-king bonus; no tackling or dribbling.':carrying?'Uses the dribble action; your separate off-ball move remains available until used.':'Uses the off-ball positioning action; the attacker’s dribble is separate.'}`;
  }else if(positionPhase()){
    title=ownCarrier?'Move without ball / dribble':'Move without the ball';
    rule=ownCarrier?'You may dribble once, move another player without the ball once, and use one pawn-or-king bonus without the ball, in any order. End positioning to leave unused actions.':'Move a teammate off the ball, collect a loose ball, or try a highlighted tackle against an opposing carrier. You can dribble after winning possession.';
  }
  $('actionContext').dataset.action=kind;$('actionType').textContent=title;$('actionRule').textContent=rule;
}
function addLine(points,className){
  const line=document.createElementNS('http://www.w3.org/2000/svg','polyline');line.setAttribute('class',className);
  line.setAttribute('points',points.map(p=>`${p.x*100+50},${p.y*100+50}`).join(' '));
  document.querySelector('.pitch-markings').append(line);
}
function clearKeeperOverlay(){for(const el of document.querySelectorAll('.keeper-reach,.keeper-coverage,.intercept-point'))el.remove();}
function drawKeeperOverlay(model){
  clearKeeperOverlay();if(model.penalty||!model.keeperPosition||!model.closestPoint)return;
  const svg=document.querySelector('.pitch-markings');
  for(const targetModel of model.targetModels||[model]){
    if(!targetModel.closestPoint)continue;
    const circle=document.createElementNS('http://www.w3.org/2000/svg','circle');circle.classList.add('keeper-reach');circle.setAttribute('cx',model.keeperPosition.x*100+50);circle.setAttribute('cy',model.keeperPosition.y*100+50);circle.setAttribute('r',targetModel.reach*100);svg.append(circle);
    addLine([model.keeperPosition,targetModel.closestPoint],'keeper-coverage');
    const dot=document.createElementNS('http://www.w3.org/2000/svg','circle');dot.classList.add('intercept-point');dot.setAttribute('cx',targetModel.closestPoint.x*100+50);dot.setAttribute('cy',targetModel.closestPoint.y*100+50);dot.setAttribute('r',8);svg.append(dot);
  }
}
function outcomeBreakdown(model){
  const outcomes=[['Goal',model.goalProbability],['Catch',model.caughtSaveProbability],['Corner',model.cornerProbability],['Defender possession',model.blockPossessionProbability],['Goal kick after block',Math.max(0,model.blockOutProbability-model.blockCornerProbability)],['Wide',model.missProbability]];
  return outcomes.filter(([label,p])=>label==='Goal'||p>0).map(([label,p])=>`${label} ${(p*100).toFixed(1)}%`).join(' · ');
}
function shotGeometry(model){if(model.penalty)return 'Penalty · fixed 80% conversion · keeper holds position · no piece or geometry bonuses';if(model.disguised)return `Disguised shot · ${goalChoiceNames(model.targetOptions)}, each 50% · Target chosen after the keeper reacts · Displayed outcomes average both paths${model.keeperInBox?' · Full box reach':' · No saving reach outside own box'}`;return `Shot ${model.distance.toFixed(1)} squares${model.keeperPosition?` · Keeper ${model.keeperPathDistance.toFixed(1)} squares off path`:''}${model.postAngleFactor<0.99?` · Tight-angle penalty: ${percent(1-model.postAngleFactor)}`:''}${model.wideAngleFactor>1.005?` · Wide-opening accuracy bonus: +${percent(model.wideAngleFactor-1)}`:''}${model.centralLaneFactor>1?` · Central-file accuracy bonus: +${percent(model.centralLaneFactor-1)}`:''}${model.shooterType==='R'&&model.distance>3?' · Rook long-range accuracy':''}${model.scoringMultiplier>1?` · Knight finishing ×${model.scoringMultiplier}, capped at 100%`:''}${model.blockProbability>0?` · ${model.blockerIds.length} defender${model.blockerIds.length===1?'':'s'} on path: ${shotPercent(model.blockProbability)} block chance`:''} · ${model.keeperInBox?'Full box reach':'No saving reach outside own box'}${model.saveProbability>0?` · Keeper parry if stopped: ${percent(model.parryGivenSave)}`:''}`;}
function showShotModel(model,caption='chance to score with the keeper here'){
  $('shotPanel').setAttribute('aria-label',model.penalty?'Penalty resolution':'Goalkeeper reaction');
  document.querySelector('.shot-legend').textContent=model.penalty?'Fixed 80% conversion. The remaining 20% is a catch if the keeper is inside its own box, otherwise a miss. The keeper holds position.':model.disguised?'Both dashed shot paths are possible, each with 50% probability. The keeper reacts before the target is chosen. Goal and other outcome odds are the average across both paths. The blue lines show coverage of both possibilities.':normalShotLegend;
  $('shotOdds').textContent=model.penalty?`${shotPercent(model.probability)} fixed penalty conversion`:`${shotPercent(model.probability)} ${model.disguised?'combined ':''}${caption}`;
  $('shotBreakdown').textContent=outcomeBreakdown(model);
  $('shotGeometry').textContent=shotGeometry(model)+(model.penalty?'':`. Keeper stops ${shotPercent(model.saveGivenOnTarget)} of on-target shots.`);
  drawKeeperOverlay(model);
}
function renderBoard(){
  for(const line of document.querySelectorAll('.trajectory,.computer-action-path,.shot-path,.offside-line,.throw-safe,.throw-limit'))line.remove();
  const targets=getTargets(),action=lastComputerAction?.action;
  const showTrace=action&&!['goal','shotAttempt'].includes(action.type);
  const shot=game.phase==='keeperReact'?game.pendingShot:null,disguiseTargets=!shot&&disguiseSelected?disguiseChoices():[];
  const previewShots=shot?[]:legalKicks({...game,phase:'kick'}).filter(kick=>kick.goal);
  const offside=offsideInfo(game),exempt=['throwIn','corner','goalKick','penalty'].includes(game.restart?.type);
  const controlledBySnapshotTeam=game.ball.carrierId?.startsWith(`${game.offside?.team}-`)&&game.phase!=='keeperReact';
  // With a teammate in control, the next pass takes a fresh snapshot. Current
  // position warnings must not inherit flags from the pass that reached them.
  const activeFlags=new Set(exempt||controlledBySnapshotTeam?[]:game.offside?.flaggedIds||[]),positionFlags=new Set(exempt?[]:offside.flaggedIds||[]);
  for(const el of squares){
    const x=Number(el.dataset.x),y=Number(el.dataset.y),piece=game.pieces.find(p=>p.x===x&&p.y===y),target=targets.find(t=>t.x===x&&t.y===y);
    const last=game.lastAction?.to,isSelected=piece?.id===selectedId,hasBall=game.ball.x===x&&game.ball.y===y;
    const kind=target?targetKind(target):null;
    el.className=['square',(x+y)%2?'checker':'',isBox(x,y)?'box':'',isGoalMouth(x,y)?'keeper-only':'',y===MIDFIELD_RANK&&CENTRAL_GOAL_FILES.includes(x)?'kickoff':'',isSelected?'selected':'',last?.x===x&&last?.y===y?'last-move':'',target?'legal':'',kind?`action-${kind}`:'',target?.type==='tackle'?'tackle':'',showTrace&&action.from?.x===x&&action.from?.y===y?'computer-from':'',showTrace&&action.to?.x===x&&action.to?.y===y?'computer-to':''].filter(Boolean).join(' ');
    if(kind)el.dataset.action=kind;else delete el.dataset.action;
    el.classList.toggle('loft-target',!!target?.lofted);
    const blockedLastShot=game.lastAction?.type==='blockedShot'&&piece?.id===game.lastAction.blockerId;el.classList.toggle('shot-blocker',blockedLastShot);
    el.classList.toggle('offside-flag',!!piece&&activeFlags.has(piece.id));el.classList.toggle('offside-position',!!piece&&positionFlags.has(piece.id)&&!activeFlags.has(piece.id));el.classList.toggle('offside-target',!!target&&isOffsideTarget(target));el.classList.toggle('restart-taker',!!piece&&piece.id===game.restart?.takerId);el.classList.toggle('corner-candidate',!!target&&cornerSelectPhase());
    el.setAttribute('aria-selected',String(isSelected));el.disabled=!!shotFlight;
    let label=coord(x,y)+(isGoalMouth(x,y)?`, ${TEAM[y===0?'black':'white']} goalkeeper-only goal-mouth square`:'')+(piece?`, ${TEAM[piece.team]} ${pieceLabel(piece)}`:', empty');
    if(yellowCards(piece||{})>0)label+=', yellow card';if(piece?.replacementKeeper)label+=', replacement goalkeeper';if(hasBall)label+=', ball';if(blockedLastShot)label+=', blocked the last shot';if(target)label+=`, ${targetDescription(target)}`;
    if(target?.accuracy!==undefined)label+=`, ${percent(target.accuracy)} ${accuracyLabel()} accuracy`;
    if(piece&&activeFlags.has(piece.id))label+=', offside at the previous kick; involvement will be penalised';else if(piece&&positionFlags.has(piece.id))label+=', in an offside position if a teammate plays the ball now';
    if(piece?.id===game.restart?.takerId)label+=', restart taker; locked until the restart';
    if(shot&&target)label+=`, opponent scoring chance ${percent(shotChance(game,shot.x,shot.y,{x,y}))} after this keeper move`;
    el.setAttribute('aria-label',label);el.title=label;
    el.innerHTML=piece?`<span class="piece ${piece.team}"><span>${SYMBOLS[piece.type]}</span>${hasBall?`<span class="ball">${ballSVG}</span>`:''}</span><span class="piece-id ${piece.team}" aria-hidden="true">${shortPieceId(piece.id)}</span>${cardBadge(piece)}`:hasBall?`<span class="ball loose">${ballSVG}</span>`:'';
    if(target?.accuracy<1)el.insertAdjacentHTML('beforeend',`<span class="accuracy-badge">${percent(target.accuracy)}</span>`);
    if(target?.lofted)el.insertAdjacentHTML('beforeend','<span class="loft-badge">LOFT</span>');
    if(blockedLastShot)el.insertAdjacentHTML('beforeend','<span class="shot-block-badge">BLOCK</span>');
    if(target&&isOffsideTarget(target))el.insertAdjacentHTML('beforeend','<span class="offside-badge">OFF</span>');
    else if(piece&&(activeFlags.has(piece.id)||positionFlags.has(piece.id)))el.insertAdjacentHTML('beforeend','<span class="offside-badge">!</span>');
    if(target?.type==='tackle'&&target.tackleProbability<1)el.insertAdjacentHTML('beforeend',`<span class="accuracy-badge tackle-chance">${percent(target.tackleProbability)}</span>`);
    if(shot&&target)el.insertAdjacentHTML('beforeend',`<span class="accuracy-badge keeper-chance">${percent(shotChance(game,shot.x,shot.y,{x,y}))}</span>`);
  }
  const topY=flipped?H:-1,bottomY=flipped?-1:H;
  for(const [id,y] of [['goalTop',topY],['goalBottom',bottomY]]){
    $(id).style.flexDirection=flipped?'row-reverse':'row';
    $(id).setAttribute('aria-label',`${y===-1?'Obsidian':'Ivory'} goal: choose a target`);
    for(const el of $(id).querySelectorAll('[data-goal-x]')){
      const x=Number(el.dataset.goalX),kick=targets.find(t=>t.x===x&&t.y===y&&t.goal);
      const possibleTargets=shot?.disguised?shot.targetOptions:disguiseTargets,paired=possibleTargets.some(target=>target.x===x&&target.y===y),preview=previewShots.find(candidate=>candidate.x===x&&candidate.y===y),aimed=shot?(shot.disguised?paired:shot.x===x&&shot.y===y):paired,canPreview=shot?aimed:!!preview,offsideShot=!shot&&preview?.offsideReason==='boxKnight';
      el.disabled=!kick;el.classList.toggle('available',!!kick);el.classList.toggle('shot-selected',aimed);el.classList.toggle('own-goal',!!kick&&kick.goal!==currentTeam(game));el.dataset.goalY=y;
      el.classList.toggle('disguised-target',paired);
      el.classList.toggle('offside-target',offsideShot);
      const previewModel=canPreview?(shot?shotModel(game,x,y):shotPreviewModel(x,y)):null,chance=previewModel?.probability??shotChance(game,x,y),blocking=shotBlockLabel(previewModel);
      el.classList.toggle('shot-through-defenders',!!blocking&&!offsideShot);
      el.innerHTML=`<span class="goal-file">${FILES[x].toUpperCase()}</span><span class="goal-odds">${offsideShot?'OFF':canPreview?percent(chance):'—'}</span>${paired?'<span class="goal-disguise-risk">50% AIM</span>':blocking&&!offsideShot?`<span class="goal-block-risk">BLOCK ${percent(previewModel.blockProbability)}</span>`:''}`;
      el.dataset.action='shot';
      const detail=offsideShot?targetDescription(preview):paired?`Disguised shot at ${goalChoiceNames(possibleTargets)}, each target 50%, chosen after keeper reaction; ${percent(chance)} combined scoring chance ${shot?'with the keeper here':'before keeper reaction'}`:canPreview&&(game.restart?.type==='penalty'||shot?.penalty)?`Penalty target ${FILES[x].toUpperCase()}: fixed 80% conversion; keeper holds position`:canPreview?`Shoot at ${y===-1?'Obsidian':'Ivory'} goal, column ${FILES[x]}, ${percent(chance)} scoring chance ${shot?'with the keeper here':'before keeper reaction'}${blocking?`, ${blocking}`:''}${kick&&kick.goal!==currentTeam(game)?', warning: own goal':''}`:`${y===-1?'Obsidian':'Ivory'} goal, column ${FILES[x]}, no legal shot from this position`;
      el.setAttribute('aria-label',detail+(shot&&aimed?(shot.disguised?', possible shot target':', shot committed'):'')+(!kick?', unavailable shot':''));el.title=detail;
    }
  }
  document.querySelector('.pitch-area').classList.toggle('flipped',flipped);
  const showOffside=stage==='playing'&&!shot&&game.ball.carrierId&&!exempt;
  $('offsideStatus').hidden=stage!=='playing';
  if(exempt)$('offsideStatus').textContent='No offside directly from this restart.';
  else if(offside.boxAttackerIds?.length)$('offsideStatus').textContent=`Offside attacker${offside.boxAttackerIds.length===1?'':'s'} in the opponent’s box: any teammate kick immediately awards an indirect free kick. Move the attacker onside or out of the box before kicking.`;
  else if(activeFlags.size)$('offsideStatus').textContent=`${activeFlags.size} player${activeFlags.size===1?' was':'s were'} offside at the previous kick. Returning onside does not clear that snapshot.`;
  else $('offsideStatus').textContent=`${positionFlags.size} player${positionFlags.size===1?' is':'s are'} beyond the current offside line. Level or behind the ball is onside.`;
  if(showOffside&&Number.isFinite(offside.secondLastY)){
    const lineY=game.attack==='white'?Math.min(game.ball.y,offside.secondLastY,MIDFIELD_RANK):Math.max(game.ball.y,offside.secondLastY,MIDFIELD_RANK);
    addLine([{x:-.5,y:lineY},{x:W-.5,y:lineY}],'offside-line');
  }
  if(stage==='playing'&&game.restart?.type==='throwIn'){
    for(const [range,className]of [[5,'throw-safe'],[10,'throw-limit']]){
      const rect=document.createElementNS('http://www.w3.org/2000/svg','rect');rect.classList.add(className);rect.setAttribute('x',(game.ball.x-range)*100);rect.setAttribute('y',(game.ball.y-range)*100);rect.setAttribute('width',(range*2+1)*100);rect.setAttribute('height',(range*2+1)*100);document.querySelector('.pitch-markings').append(rect);
    }
  }
  if(shot){const model=shotModel(game,shot.x,shot.y);drawShotPaths(model,'shot-path');}
  else if(showTrace&&action.from&&action.to&&(action.from.x!==action.to.x||action.from.y!==action.to.y))addLine(action.path||[action.from,action.to],'computer-action-path');
}
function resetKickDetails(){
  if(game.phase==='keeperReact'&&game.pendingShot){
    const shot=game.pendingShot;showShotModel(shotModel(game,shot.x,shot.y));
    $('kickDetails').textContent=penaltyPending()?'Penalty target committed. Resolve the fixed 80% attempt; the keeper cannot reposition.':shot.disguised?`Disguised shot: ${goalChoiceNames(shot.targetOptions)}, each 50%. The final target is chosen after the keeper decision. ${keeperCanReact()?'Move to a lit square or hold position.':'Resolve the shot; the king is outside its own box.'} Displayed scoring odds average both possibilities.`:game.mode==='watch'?`${TEAM[currentTeam(game)]} will ${keeperCanReact()?'choose a keeper reaction':'resolve the shot without a goalkeeper save'}. The shot’s scoring chance updates after that decision.`:keeperCanReact()?'Select a lit square to move the keeper, or hold position to resolve the shot.':'The king is outside its own box. Resolve the shot; no goalkeeper move or save is available.';
  }else{clearKeeperOverlay();$('kickDetails').textContent=passRunPhase()&&stage==='playing'?passRunGuide():game.mode==='watch'&&stage==='playing'?'Watching both computer teams. Each action plays at the selected pace; Pause holds the position.':game.restart&&stage==='playing'?restartGuide():stage==='setup'?'Move a player to find space · Dribble to carry the ball · Pass / shoot to send it.':kickPhase()&&stage==='playing'?'Pass / shoot: the player stays. OFF marks offside involvement. Long inaccurate balls may cross a boundary. Hover or focus to preview odds.':game.phase==='attackMove'?'Attack: one dribble + one off-ball move + one optional pawn-or-king bonus, in any order. The dashed line previews offside.':'Defence: one regular move or tackle + one optional pawn-or-king bonus. The dashed line previews offside.';}
}
function render(){
  if(shotFlight||stage!=='playing'||paused||anyDialog()||!isComputer())cancelAI();
  const acting=currentTeam(game),kicking=kickPhase(),positioning=positionPhase(),reacting=game.phase==='keeperReact',running=passRunPhase(),choosingCorner=cornerSelectPhase(),actions=positionActions(game),budget=actions.budget,watching=game.mode==='watch';
  if(stage==='playing'&&choosingCorner){selectedId=null;freePawnMode=false;dribbleMode=false;}
  if(stage==='playing'&&kicking)selectedId=game.ball.carrierId;
  if(stage==='playing'&&passRunPhase()){selectedId=game.passRun?.pieceId||null;freePawnMode=false;dribbleMode=false;}
  if(stage==='playing'&&reacting)selectedId=game.pieces.find(p=>p.team===acting&&p.type==='K')?.id||null;
  if(positioning){
    const available=freePawnMode?actions.pawnAvailable:dribbleMode?actions.dribbleAvailable:actions.normalAvailable;
    if(!available)setMoveMode(actions.normalAvailable?'normal':actions.dribbleAvailable?'dribble':actions.pawnAvailable?'pawn':'normal');
    if(dribbleMode)selectedId=game.ball.carrierId;
  }
  $('foulsEnabled').disabled=stage!=='setup';$('foulsEnabled').checked=foulsEnabled;
  $('setupPanel').hidden=stage!=='setup';$('turnPanel').hidden=stage==='setup';
  renderRestart();renderProgress();
  $('passRunChoice').hidden=!kicking||game.restart?.type==='penalty'||stage!=='playing'||watching||isComputer();$('passRunEnabled').checked=passRunSelected;$('passRunEnabled').disabled=blocked();
  const disguiseTargets=disguiseChoices();$('disguisedShotChoice').hidden=disguiseTargets.length!==2||stage!=='playing'||watching||isComputer();$('disguisedShotEnabled').checked=disguiseSelected;$('disguisedShotEnabled').disabled=blocked();
  $('disguisedShotGuide').textContent=disguiseTargets.length===2?`Aim at ${goalChoiceNames(disguiseTargets)}, each 50%. The keeper reacts before the final target is chosen. Uncheck to aim at one target.`:'Two legal goal targets, each 50%. The keeper reacts before the final target is chosen. Uncheck to aim at one target.';
  $('passRunPanel').hidden=!running||stage!=='playing';$('passRunInfo').textContent=running?passRunGuide():'';$('passRunPhase').hidden=!running||stage!=='playing';
  $('opponentControls').hidden=game.mode==='local';$('whiteComputerControls').hidden=!watching;$('computerRecap').hidden=!lastComputerAction||game.mode==='local';$('computerActionText').textContent=lastComputerAction?.summary||'';
  $('computerActionLabel').textContent=watching?`${TEAM[lastComputerAction?.actor]||'COMPUTER'} · LAST ACTION`:'COMPUTER’S LAST ACTION';
  $('aiDifficultyLabel').textContent=watching?'OBSIDIAN COMPUTER':'COMPUTER DIFFICULTY';$('aiPaceLabel').textContent=watching?'ACTION PACE':'OPPONENT PACE';
  $('difficultyHelp').textContent=watching?'Choose each team’s level. Casual reacts to the position; Tactical plans ahead. Level changes apply to the next decision.':aiDifficulty==='tactical'?'Plans ahead against your replies and weighs risky outcomes.':'Builds passing lanes, protects the ball, and covers likely receivers.';
  $('setupHint').textContent=watching?'Both computer teams play automatically. Use the starting formation, or arrange either side before watching.':'Use the starting formation, or select a piece and a square to arrange your half.';
  $('startBtn').innerHTML=`${watching?'Start watching':'Kick off'} <span>↗</span>`;
  $('whiteScore').textContent=game.score.white;$('blackScore').textContent=game.score.black;
  $('whiteSub').textContent=watching?`COMPUTER · ${whiteDifficulty==='tactical'?'TACTICAL':'CASUAL'} ${flipped?'↓':'↑'}`:(game.mode==='solo'?'YOU':'PLAYER 1')+' · ATTACKING '+(flipped?'↓':'↑');$('blackSub').textContent=watching?`COMPUTER · ${aiDifficulty==='tactical'?'TACTICAL':'CASUAL'} ${flipped?'↑':'↓'}`:(game.mode==='solo'?'COMPUTER':'PLAYER 2')+' · ATTACKING '+(flipped?'↑':'↓');
  $('turnNumber').textContent=`POSSESSION ${String(game.turn).padStart(2,'0')}`;
  let heading,help,status;
  if(stage==='finished'){heading='Full time.';help='The final whistle has sounded. Start a new match to play again.';status='Full time. Thanks for playing.';}
  else if(paused){heading='Take a breath.';help='The match is paused. Resume when you’re ready.';status='Match paused.';}
  else if(choosingCorner){heading=isComputer()?'Choosing a corner taker.':'Choose a corner taker.';help=restartGuide();status=`${TEAM[acting]} · ${isComputer()?'computer choosing corner taker':'choose a player in the attacking half'}`;}
  else if(running){heading='Pass complete · optional run.';help=passRunGuide();status=`${TEAM[acting]} · ${isComputer()?'choosing a passer run':'run the passer or skip'}`;}
  else if(isComputer()&&stage==='playing'){const name=watching?TEAM[acting]:'Obsidian',difficulty=computerDifficulty(acting);heading=watching?`${name} · ${reacting?'keeper reaction':'computer turn'}.`:reacting?'Computer’s keeper.':'Computer’s turn.';help=reacting?(penaltyPending()?`${name} resolves the penalty at a fixed 80% conversion chance; the keeper holds position.`:keeperCanReact()?`${name} can move its keeper once before the shot is resolved.`:`${name}’s king is outside its own box. The shot resolves without a goalkeeper reaction.`):game.restart?restartGuide():difficulty==='tactical'?`${name} is planning ahead and considering ${watching?'its opponent’s':'your'} replies.`:kicking?`${name} is choosing a pass or shot.`:`${name} is choosing its remaining positioning actions.`;status=`${name} · ${difficulty==='tactical'?'Tactical':'Casual'} · thinking…`;}
  else if(reacting&&penaltyPending()){heading='Resolve the penalty.';help='The target is committed. Penalties have a fixed 80% conversion chance; the keeper holds position. Resolve to see the shot.';status=`${TEAM[acting]} · penalty resolution`;}
  else if(reacting){heading=keeperCanReact()?'Position your keeper.':'Resolve the shot.';help=game.pendingShot?.disguised?`The shooter can aim at ${goalChoiceNames(game.pendingShot.targetOptions)}, each 50%. ${keeperCanReact()?'Move your king one square, or hold.':'Your king is outside its own box and has no saving reach.'} The target is chosen after your decision; displayed scoring odds average both targets.`:keeperCanReact()?'The shot is committed. Move your king one square, or hold position. The displayed scoring chance is then rolled.':'Your king is outside its own box, so it has no extra reaction or saving reach. Resolve the shot using the displayed chance.';status=`${TEAM[acting]} · ${keeperCanReact()?'keeper reaction':'shot resolution'}`;}
  else if(game.restart){heading=restartName(game.restart)+'.';help=restartGuide();status=`${TEAM[acting]} · ${restartName(game.restart)} · ${kicking?'take the restart':'positioning'}`;}
  else if(game.phase==='keeperRelease'){heading='King must release.';help='A teammate passed to the king. Choose an immediate kick; the king cannot move or hold this back-pass.';status=`${TEAM[acting]} · immediate keeper kick`;}
  else if(game.phase==='kickoff'){heading=game.mode==='solo'?'Your kickoff.':TEAM[acting]+' kicks off.';help='Choose a pass destination, or a lit goal cell to commit a shot.';status='Choose a pass to start play.';}
  else if(kicking){heading='Pass or shoot.';help='Only the carrier kicks; the player stays in place. Choose a blue pass / kick target or a gold goal cell. Shooting gives the defending king one reaction.';status=`${TEAM[acting]} · pass / shoot`;}
  else if(freePawnMode){heading=teamLabel(acting)+' pawn or king bonus.';help='Move one pawn or king without the ball, or collect a loose ball. Pawns move one cardinal square; kings one adjacent square. One shared bonus; no dribble or tackle.';status=`${TEAM[acting]} · pawn or king bonus`;}
  else {const ownCarrier=game.pieces.some(piece=>piece.id===game.ball.carrierId&&piece.team===acting);heading=teamLabel(acting)+(game.phase==='defendMove'?' response.':dribbleMode?' dribble.':' positioning.');help=ownCarrier?'Dribble once and move another player without the ball once, in either order. You also have one shared bonus for a pawn or king without the ball. End positioning to skip remaining actions.':game.ball.carrierId?'Move without the ball to defend, or attempt a highlighted tackle. Win possession before you can dribble; the opponent is carrying the ball.':'Move to collect the loose ball. After collecting, the attacking carrier can use a separate dribble if it remains available.';status=`${TEAM[acting]} · ${ownCarrier?'dribble + off-ball move':'off-ball positioning'}`;}
  if(stage==='setup')status=watching?'Computer vs computer · choose levels and start watching.':'Arrange 11 footballers or kick off.';
  $('turnTitle').textContent=heading;$('actionHelp').textContent=help;$('boardStatus').textContent=status;
  const activePhase=kicking?'kick':reacting?'defendMove':game.phase;
  for(const el of document.querySelectorAll('[data-phase]'))el.classList.toggle('active',el.dataset.phase===activePhase);
  $('attackPhaseText').innerHTML=game.restart?'Restart team positions<small>Off-ball move + pawn/king bonus</small>':'Dribble + off-ball move<small>Plus one pawn/king bonus</small>';
  document.querySelector('.action-kinds').hidden=choosingCorner&&stage==='playing';
  document.querySelector('.move-modes').hidden=watching||!positioning||stage!=='playing';
  const attackingRound=positioning&&game.phase==='attackMove'&&!game.restart;
  $('moveBudget').hidden=!positioning||stage!=='playing';$('moveBudget').textContent=`${attackingRound?'Off-ball move':'Regular action'}: ${budget.normalUsed?'used':'ready'}${attackingRound?` · Dribble: ${budget.dribbleUsed?'used':actions.dribbleAvailable?'ready':'unavailable'}`:''} · Pawn/King bonus: ${budget.pawnUsed?'used':'ready'}`;
  $('normalMoveBtn').disabled=blocked()||!actions.normalAvailable;$('pawnMoveBtn').disabled=blocked()||!actions.pawnAvailable;
  $('dribbleBtn').hidden=!attackingRound;$('dribbleBtn').disabled=blocked()||!actions.dribbleAvailable;document.querySelector('.move-modes').classList.toggle('has-dribble',attackingRound);
  $('normalMoveBtn').textContent=game.restart||attackingRound?'Off-ball move':'Move / tackle';
  $('normalMoveBtn').setAttribute('aria-pressed',String(!freePawnMode&&!dribbleMode));$('dribbleBtn').setAttribute('aria-pressed',String(dribbleMode));$('pawnMoveBtn').setAttribute('aria-pressed',String(freePawnMode));
  $('shotPanel').hidden=!reacting||stage!=='playing';
  if(reacting&&game.pendingShot)$('shotSummary').textContent=penaltyPending()?`Penalty aimed at ${FILES[game.pendingShot.x].toUpperCase()}. Fixed 80% conversion; the keeper holds position.`:game.pendingShot.disguised?`Disguised shot: ${goalChoiceNames(game.pendingShot.targetOptions)}, each 50%. Neither target is committed before the keeper decision.`:`Shot aimed at column ${FILES[game.pendingShot.x].toUpperCase()}. ${keeperCanReact()?`${TEAM[acting]} may move its king one square before resolution.`:'The defending king is outside its own box and has no goalkeeper reaction.'}`;
  $('skipBtn').hidden=watching||kicking||choosingCorner||stage==='finished';$('skipBtn').disabled=blocked()||choosingCorner;$('skipBtn').textContent=running?'Skip run →':reacting?(penaltyPending()?'Resolve penalty · 80%':keeperCanReact()?'Hold keeper · resolve shot':'Resolve shot · king outside box'):'End positioning · skip unused →';
  $('statsBtn').hidden=stage!=='finished';$('pauseBtn').disabled=stage!=='playing';$('pauseBtn').textContent=paused?'▶ Resume':'Ⅱ Pause';$('finishBtn').disabled=stage!=='playing'||duration>0;$('finishBtn').title=duration>0?'Timed matches end after the clock and final chance settle.':'Finish this untimed match.';$('undoBtn').disabled=!history.length||stage!=='playing'||anyDialog();
  $('replayBtn').disabled=!lastGoalReplay||anyDialog();
  document.body.classList.toggle('thinking',stage==='playing'&&isComputer()&&!paused);document.body.classList.toggle('paused',paused&&stage==='playing');
  const carrier=game.pieces.find(p=>p.id===game.ball.carrierId);
  $('possessionTeam').textContent=choosingCorner?TEAM[acting]:reacting?'Shot in flight':carrier?TEAM[carrier.team]:'Loose ball';
  $('possessionDetail').textContent=choosingCorner?'Corner awarded · choose the taker':reacting?`${TEAM[game.pendingShot.shootingTeam]} · ${penaltyPending()?'penalty · fixed 80%':'keeper may respond'}`:carrier?`${pieceLabel(carrier)} · ${coord(carrier.x,carrier.y)}`:`Available to collect · ${coord(game.ball.x,game.ball.y)}`;
  const selected=game.pieces.find(p=>p.id===selectedId);
  $('selectionInfo').innerHTML=choosingCorner&&stage==='playing'?'<span class="selection-icon">⚑</span><div><b>Choose the corner taker</b><small>Select a teammate in the attacking half.</small></div>':selected?`<span class="selection-icon">${SYMBOLS[selected.type]}</span><div><b>${pieceLabel(selected)} · ${coord(selected.x,selected.y)}</b><small>${stage==='setup'?'Choose a starting square.':running?'Optional run · uses next off-ball move':reacting?(penaltyPending()?'Penalty · keeper holds':'Keeper reaction'):kicking?'Pass / shoot · player stays':selected.id===game.restart?.takerId?'Restart taker · stays put':`${selected.id===game.ball.carrierId?'Dribble':'Move without ball'} · ${legalMoves(game,selected.id,{freePawn:positioning&&freePawnMode}).length} destinations`}</small></div>`:watching&&stage==='playing'?`<span class="selection-icon">♞</span><div><b>Watching ${TEAM[acting]}</b><small>Both teams are controlled by the computer.</small></div>`:'<span class="selection-icon">♞</span><div><b>Select a footballer</b><small>Move off the ball, or select the carrier to dribble.</small></div>';
  renderActionContext(selected);
  $('journal').replaceChildren(...game.log.slice(-12).reverse().map(line=>{const li=document.createElement('li');li.textContent=line.replaceAll('White','Ivory').replaceAll('Black','Obsidian');return li;}));$('feedCount').textContent=String(game.log.length).padStart(2,'0');
  if(!storageOK)$('saveNote').textContent='Match saving is unavailable in this browser.';
  renderBoard();resetKickDetails();paintShotFlight();updateClock();scheduleAI();
}
function updateClock(){
  const seconds=Math.ceil(Math.max(0,remaining));
  $('clock').textContent=duration===0?'∞':`${Math.floor(seconds/60).toString().padStart(2,'0')}:${(seconds%60).toString().padStart(2,'0')}`;
  $('matchState').textContent=shotFlight?(paused||anyDialog()?'SHOT PAUSED':'SHOT IN FLIGHT'):stage==='setup'?'PRE-MATCH':stage==='finished'?'FULL TIME':paused||anyDialog()?'PAUSED':fullTimePending?'STOPPAGE TIME':'LIVE';
  $('liveDot').classList.toggle('running',stage==='playing'&&!paused&&!anyDialog()&&!shotFlight);
  $('actionClock').textContent=duration===0?'∞':`${Math.ceil(actionRemaining)}s`;
  $('actionDeadline').dataset.warning=String(duration>0&&(actionRemaining<=10||fullTimePending));
  $('actionClockInfo').textContent=shotFlight?'The shot is playing; match and action clocks are paused.':duration===0?'No action limit.':stage==='finished'?'Match complete.':stage==='setup'?`${ACTION_SECONDS} seconds for each action in timed matches.`:paused||anyDialog()?'Action and match clocks are paused.':cornerSelectPhase()?'Choose a corner taker. If the action deadline expires, the computer automatically selects an eligible player; the corner is retained.':passRunPhase()?'Choose a passer run or skip it. The action deadline automatically skips this optional run; it does not concede a free kick.':fullTimePending&&finalChance?`${TEAM[finalChance.team]} has the final attacking chance. Deadlines complete actions automatically.`:fullTimePending?'Finish this decision before full time; timing out concedes a final free-kick attack.':`${TEAM[currentTeam(game)]}: act within ${ACTION_SECONDS}s or concede an indirect free kick.${finalChance?' An awarded free kick and its following attack are protected at full time.':''}`;
}
function flushClockElapsed(){
  const now=Date.now(),elapsed=Math.max(0,(now-lastTick)/1000);lastTick=now;
  if(stage!=='playing'||paused||anyDialog()||shotFlight)return false;
  matchStats=addPossessionTime(matchStats,game,elapsed*1000);
  if(duration===0)return false;
  restoreClock(tickMatchClock(clockSnapshot(),elapsed));
  return true;
}
function advanceClockNow(){
  if(!flushClockElapsed())return false;
  if(actionRemaining>0){updateClock();return false;}
  cancelAI();
  let next;
  if(fullTimePending&&finalChance){
    if(positionPhase()||passRunPhase()||game.phase==='keeperReact')next=skipMove(game);
    else{
      const action=chooseAIAction(game,{difficulty:'casual'});
      next=action?.type==='cornerTaker'?selectCornerTaker(game,action.pieceId):action?.type==='kick'?applyKick(game,action.x,action.y,{passRun:!!action.passRun,disguise:!!action.disguise}):skipMove(game);
    }
    toast('The action deadline expired; the final chance continues automatically.');
  }else next=actionTimeout(game);
  commit(next,{timedOut:true,clockAdvanced:true});
  return true;
}
function commit(next,{timedOut=false,clockAdvanced=false}={}){
  if(!clockAdvanced&&advanceClockNow())return;
  if(stage!=='playing'||paused||anyDialog()||shotFlight)return;
  cancelAI();
  const before=game,priorComputerAction=lastComputerAction,actor=currentTeam(game),settled=settleMatchClock(clockSnapshot(),before,next,{timedOut,timed:duration>0,actionSeconds:ACTION_SECONDS});
  history.push({game:structuredClone(game),actor,clock:clockSnapshot(),passRunSelected,disguiseSelected,matchStats:structuredClone(matchStats)});if(history.length>80)history.shift();const oldScore=game.score.white+game.score.black;
  matchStats=recordMatchTransition(matchStats,before,next,{matchSeconds:duration>0?Math.max(0,duration*60-settled.clock.remaining):null});
  game=next;passRunSelected=false;restoreClock(settled.clock);selectedId=null;freePawnMode=false;dribbleMode=false;lastTick=Date.now();
  const scored=game.score.white+game.score.black>oldScore;
  if(scored)lastGoalReplay=buildGoalReplay(history,before,game);
  lastComputerAction=isComputer(actor)?{actor,action:game.lastAction,summary:game.log.at(-1).replaceAll('White','Ivory').replaceAll('Black','Obsidian')}:null;
  const toastOutcome=()=>{
  if(game.score.white+game.score.black>oldScore)toast(`${TEAM[game.lastAction.team]} scores! ${game.score.white} : ${game.score.black}${game.lastAction.ownGoal?' · Own goal':''}`);
  else if(game.lastAction?.type==='foul')toast(foulDescription(game.lastAction));
  else if(game.lastAction?.type==='stalling')toast(`${PACE_REASONS[game.lastAction.reason]?.label||'Stalling'}: ${TEAM[game.restart.team]} wins an indirect free kick near the ball.`);
  else if(game.lastAction?.type==='timeout')toast(`Time wasting: ${TEAM[game.restart.team]} wins an indirect free kick near the ball.`);
  else if(game.lastAction?.type==='blockedShot'){const blocker=game.pieces.find(piece=>piece.id===game.lastAction.blockerId);toast(`Shot blocked${blocker?` by ${TEAM[blocker.team]} ${pieceLabel(blocker)}`:''}. ${game.restart?`${RESTART_NAMES[game.restart.type]||'Restart'} for ${TEAM[game.restart.team]}.`:`${TEAM[game.attack]} takes possession.`}`);}
  else if(game.restart)toast(`${RESTART_NAMES[game.restart.type]} for ${TEAM[game.restart.team]}. Position the teams, then restart.`);
  else if(game.lastAction?.type==='save')toast(`${TEAM[game.attack]} saves the shot and takes possession.`);
  else if(game.lastAction?.type==='miss')toast('The long pass missed its target. The ball is loose.');
  else if(game.lastAction?.type==='tackleMiss')toast('The knight evades the tackle and keeps the ball; the regular move is used.');
  else if(game.lastAction?.type==='shotMiss')toast(`Shot wide. ${TEAM[game.attack]} has a goal kick.`);
  };
  const finished=settled.finish||game.phase==='finished';
  if(finished){stage='finished';paused=false;game.phase='finished';selectedId=null;}
  const complete=()=>completeCommittedAction({finish:finished,scored});
  if(beginShotFlight(before,game,complete,toastOutcome,priorComputerAction))return;
  toastOutcome();complete();
}
// Presentation runs after the engine outcome is committed. It never rolls or
// replays an engine action, and never uses a relocated restart taker as a ball.
function resolvedShotAction(before,after){
  if(before.phase!=='keeperReact'||!before.pendingShot)return null;
  const action=after.lastAction?.type==='stalling'?after.lastAction.triggeringAction:after.lastAction;
  return ['goal','save','shotMiss','blockedShot'].includes(action?.type)?action:null;
}
function cancelShotFlight(){
  shotFlightGeneration++;
  if(!shotFlight)return;
  clearTimeout(shotFlight.timer);clearTimeout(shotFlight.revealTimer);try{shotFlight.animation?.cancel();}catch{}
  shotFlight.element?.remove();document.querySelectorAll('.live-shot-path').forEach(node=>node.remove());
  document.body.classList.remove('shot-in-flight');shotFlight=null;lastTick=Date.now();
}
function syncShotFlightPlayback(){
  const flight=shotFlight;if(!flight)return;
  const held=paused||anyDialog();flight.element.dataset.paused=String(held);
  if(held){
    if(flight.startedAt!==null){flight.remaining=Math.max(0,flight.remaining-(Date.now()-flight.startedAt));flight.startedAt=null;clearTimeout(flight.timer);clearTimeout(flight.revealTimer);flight.timer=null;flight.revealTimer=null;try{flight.animation?.pause();}catch{}}
  }else if(flight.startedAt===null){
    flight.startedAt=Date.now();try{flight.animation?.play();}catch{}
    const token=flight.token;
    if(!flight.revealed)flight.revealTimer=setTimeout(()=>{
      if(!shotFlight||shotFlight.token!==token)return;
      if(paused||anyDialog()){syncShotFlightPlayback();return;}
      revealShotFlight();
    },Math.max(0,flight.remaining-flight.duration*.14));
    flight.timer=setTimeout(()=>{
      if(!shotFlight||shotFlight.token!==token)return;
      if(paused||anyDialog()){syncShotFlightPlayback();return;}
      if(!shotFlight.revealed)revealShotFlight();
      const complete=shotFlight.complete;cancelShotFlight();complete();
    },flight.remaining);
  }
}
function revealShotFlight(){
  const flight=shotFlight;if(!flight||flight.revealed)return;
  flight.revealed=true;flight.caption=flight.outcomeCaption;flight.element.dataset.revealed='true';
  flight.element.setAttribute('aria-label',flight.caption);flight.element.querySelector('.shot-flight-caption').textContent=flight.caption;
  flight.toastOutcome();paintShotFlight();updateClock();
}
function paintShotFlight(){
  const flight=shotFlight;if(!flight)return;
  for(const el of squares){
    const x=Number(el.dataset.x),y=Number(el.dataset.y),piece=flight.pieces.find(p=>p.x===x&&p.y===y);
    el.className=['square',(x+y)%2?'checker':'',isBox(x,y)?'box':'',isGoalMouth(x,y)?'keeper-only':''].filter(Boolean).join(' ');delete el.dataset.action;el.disabled=true;el.setAttribute('aria-selected','false');
    const label=`${coord(x,y)}${isGoalMouth(x,y)?`, ${TEAM[y===0?'black':'white']} goalkeeper-only goal-mouth square`:''}${piece?`, ${TEAM[piece.team]} ${pieceLabel(piece)}`:', empty'}; shot in flight`;
    el.setAttribute('aria-label',label);el.title=label;
    el.innerHTML=piece?`<span class="piece ${piece.team}"><span>${SYMBOLS[piece.type]}</span></span><span class="piece-id ${piece.team}" aria-hidden="true">${shortPieceId(piece.id)}</span>${cardBadge(piece,flight.discipline)}`:'';
  }
  document.querySelectorAll('.trajectory,.computer-action-path,.shot-path,.offside-line,.throw-safe,.throw-limit').forEach(node=>node.remove());clearKeeperOverlay();
  if(!document.querySelector('.live-shot-path'))addLine(flight.points,'live-shot-path');
  const shownScore=flight.revealed?game.score:flight.score;$('whiteScore').textContent=shownScore.white;$('blackScore').textContent=shownScore.black;
  const shownLog=flight.revealed?game.log:flight.log;$('journal').replaceChildren(...shownLog.slice(-12).reverse().map(line=>{const li=document.createElement('li');li.textContent=line.replaceAll('White','Ivory').replaceAll('Black','Obsidian');return li;}));$('feedCount').textContent=String(shownLog.length).padStart(2,'0');
  const shownAction=flight.revealed?lastComputerAction:flight.priorComputerAction;$('computerRecap').hidden=!shownAction||game.mode==='local';$('computerActionText').textContent=shownAction?.summary||'';$('computerActionLabel').textContent=game.mode==='watch'?`${TEAM[shownAction?.actor]||'COMPUTER'} · LAST ACTION`:'COMPUTER’S LAST ACTION';
  $('turnTitle').textContent=paused?'Shot paused.':'Shot in flight.';$('actionHelp').textContent=flight.caption;
  $('boardStatus').textContent=paused?'Shot paused · Resume to continue':flight.caption;
  $('actionType').textContent='Shot in flight';$('actionRule').textContent='The ball is travelling. Pause to hold the flight; play resumes when it arrives.';
  const shooter=flight.pieces.find(piece=>piece.id===flight.shooterId);$('selectionInfo').innerHTML=shooter?`<span class="selection-icon">${SYMBOLS[shooter.type]}</span><div><b>${pieceLabel(shooter)} · ${coord(shooter.x,shooter.y)}</b><small>Shot committed · ball in flight</small></div>`:'';
  $('kickDetails').textContent='The shot outcome is recorded. Play and clocks resume after the ball arrives.';
  $('possessionTeam').textContent='Shot in flight';$('possessionDetail').textContent=`${TEAM[flight.shootingTeam]} · ${shortPieceId(flight.shooterId)}`;
  $('shotPanel').hidden=true;$('restartPanel').hidden=true;$('progressPanel').hidden=true;
  $('normalMoveBtn').disabled=true;$('dribbleBtn').disabled=true;$('pawnMoveBtn').disabled=true;$('skipBtn').disabled=true;$('finishBtn').disabled=true;$('replayBtn').disabled=true;$('statsBtn').hidden=true;
  $('pauseBtn').disabled=false;$('pauseBtn').textContent=paused?'▶ Resume':'Ⅱ Pause';
  for(const id of ['goalTop','goalBottom'])for(const goal of $(id).children){
    const aimed=Number(goal.dataset.goalX)===flight.goalTarget.x&&Number(goal.dataset.goalY)===flight.goalTarget.y;
    goal.disabled=true;goal.classList.remove('available','disguised-target');goal.classList.toggle('shot-selected',aimed);goal.querySelector('.goal-odds').textContent=aimed?'SHOT':'—';goal.querySelector('.goal-block-risk')?.remove();goal.querySelector('.goal-disguise-risk')?.remove();
    goal.setAttribute('aria-label',aimed?'Committed shot target; ball in flight':'Goal target unavailable while the ball is in flight');
  }
  syncShotFlightPlayback();
}
function beginShotFlight(before,after,complete,toastOutcome,priorComputerAction){
  const action=resolvedShotAction(before,after);if(!action)return false;
  const valid=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y),model=action.shotModel||{},goalTarget=action.goalTarget||{x:before.pendingShot.x,y:before.pendingShot.y};
  const origin=action.from||model.origin||before.pendingShot.from;if(!valid(origin))return false;
  const plane=valid(model.target)?model.target:{x:goalTarget.x,y:goalTarget.y<0?-.5:H-.5};
  let points=[origin],caption='',fade=false;
  if(action.type==='goal'){points.push(plane,goalTarget);caption=action.ownGoal?'Own goal.':'Goal!';}
  else if(action.type==='blockedShot'){
    points.push(action.blockedAt||before.pieces.find(p=>p.id===action.blockerId)||plane);fade=action.outcome!=='blocked';
    caption=action.outcome==='blocked'?'Defender blocks the shot and takes possession.':action.outcome==='corner'?'Defender blocks the shot out for a corner.':'Defender blocks the shot out for a goal kick.';
  }else if(action.type==='save'){
    points.push(valid(model.closestPoint)?model.closestPoint:plane);
    if(action.outcome==='corner'){caption='Keeper parries the shot out for a corner.';fade=true;}
    else{points.push(model.keeperPosition||action.to);caption='Keeper catches the shot.';}
  }else{
    const short=before.pendingShot.distance<=10;
    if(short){const left=goalTarget.x<=(GOAL_FILES[0]+GOAL_FILES.at(-1))/2;points.push({x:left?GOAL_FILES[0]-1:GOAL_FILES.at(-1)+1,y:plane.y});}
    else points.push(valid(action.exit)?action.exit:valid(action.landing)?action.landing:plane);
    caption='Shot wide.';fade=true;
  }
  points=points.filter(valid).map(({x,y})=>({x,y})).filter((p,index,list)=>!index||p.x!==list[index-1].x||p.y!==list[index-1].y);
  const distance=points.reduce((sum,p,index)=>sum+(index?Math.hypot(p.x-points[index-1].x,p.y-points[index-1].y):0),0),reduced=!!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const duration=reduced?220:Math.min(1350,Math.max(900,900+distance*18)),end=points.at(-1),element=document.createElement('div'),ball=document.createElement('span'),label=document.createElement('span');
  element.id='shotFlight';element.className='shot-flight';element.setAttribute('role','img');element.setAttribute('aria-label',reduced?caption:'Shot travelling…');
  Object.assign(element.dataset,{action:action.type,outcome:action.outcome||action.type,duration:String(duration),paused:'false',revealed:String(reduced),fromX:String(origin.x),fromY:String(origin.y),toX:String(end.x),toY:String(end.y)});
  ball.className='shot-flight-ball';ball.setAttribute('aria-hidden','true');ball.innerHTML=ballSVG;label.className='shot-flight-caption';label.textContent=reduced?caption:'Shot travelling…';element.append(ball,label);$('pitch').append(element);
  const place=p=>({left:`${(p.x+.5)/W*100}%`,top:`${(p.y+.5)/H*100}%`});Object.assign(ball.style,place(reduced?end:origin));
  const pieces=structuredClone(before.pieces),keeper=pieces.find(p=>p.type==='K'&&p.team===before.pendingShot.defendingTeam),keeperPosition=action.keeperMove?.to||model.keeperPosition;
  if(keeper&&valid(keeperPosition)){keeper.x=keeperPosition.x;keeper.y=keeperPosition.y;}
  const token=++shotFlightGeneration;shotFlight={token,element,ball,pieces,discipline:structuredClone(before.discipline||{}),score:{...before.score},log:[...before.log],priorComputerAction,points,goalTarget:{...goalTarget},caption:reduced?caption:'Shot travelling…',outcomeCaption:caption,revealed:reduced,toastOutcome,shootingTeam:before.pendingShot.shootingTeam,shooterId:before.pendingShot.shooterId,duration,remaining:duration,startedAt:null,timer:null,revealTimer:null,animation:null,complete};
  if(!reduced&&typeof ball.animate==='function'){
    let travelled=0;const frames=points.map((point,index)=>{if(index)travelled+=Math.hypot(point.x-points[index-1].x,point.y-points[index-1].y);return {...place(point),offset:distance?travelled/distance*.86:0,opacity:1};});
    if(frames.length===1)frames.push({...place(end),offset:.86,opacity:1});
    frames.push({...place(end),offset:1,opacity:fade?0:1});
    try{shotFlight.animation=ball.animate(frames,{duration,fill:'both',easing:'linear'});shotFlight.animation.finished?.catch(()=>{});}catch{Object.assign(ball.style,place(end));}
  }else Object.assign(ball.style,place(end));
  document.body.classList.add('shot-in-flight');render();save();if(reduced)toastOutcome();return true;
}
function completeCommittedAction({finish=false,scored=false}={}){
  if(finish){if(scored&&lastGoalReplay){replayPendingResult=true;openGoalReplay({automatic:true});}else{render();save();showResult();}return;}
  if(scored&&lastGoalReplay){if(!paused&&!anyDialog()){openGoalReplay({automatic:true});return;}}
  render();save();if(lastComputerAction)animateComputerMove(lastComputerAction.action);
}

function openGoalReplay({automatic=false}={}){
  if(shotFlight||!lastGoalReplay||anyDialog())return;
  if(!automatic&&stage==='playing'&&advanceClockNow())return;
  if(anyDialog())return;
  cancelAI();replayAutoContinue=automatic;
  $('replayDialog').showModal();replayPlayer.load(lastGoalReplay,{autoplay:true});
  lastTick=Date.now();render();save();
}
function animateComputerMove(action){
  if(!['move','tackle','tackleMiss'].includes(action?.type)||window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)return;
  const destination=squares[action.to.y*W+action.to.x],piece=destination?.querySelector('.piece');if(!piece?.animate)return;
  const size=destination.getBoundingClientRect().width,rotation=flipped?' rotate(180deg)':'';destination.classList.add('computer-animating');
  const animation=piece.animate([{transform:`translate(${(action.from.x-action.to.x)*size}px,${(action.from.y-action.to.y)*size}px)${rotation}`},{transform:`translate(0,0)${rotation}`}],{duration:550,easing:'cubic-bezier(.22,.61,.36,1)'});
  animation.finished.then(()=>destination.classList.remove('computer-animating')).catch(()=>destination.classList.remove('computer-animating'));
}
function scheduleAI(){
  if(shotFlight||stage!=='playing'||paused||anyDialog()||!isComputer()||aiTimer!==null||aiWorker)return;
  const requestId=aiGeneration,actor=currentTeam(game),difficulty=computerDifficulty(actor);
  const stillCurrent=()=>requestId===aiGeneration&&actor===currentTeam(game)&&stage==='playing'&&!paused&&!anyDialog()&&!shotFlight&&isComputer();
  const fail=err=>{if(!stillCurrent())return;stopAIWorker();paused=true;render();toast('Play paused: '+err.message);};
  const receive=action=>{
    if(!stillCurrent())return;stopAIWorker();
    try{if(!action)throw new Error('No legal action found.');if(action.type==='cornerTaker')commit(selectCornerTaker(game,action.pieceId));else if(action.type==='move')commit(applyMove(game,action.pieceId,action.x,action.y,{freePawn:!!action.freePawn}));else if(action.type==='kick')commit(applyKick(game,action.x,action.y,{passRun:!!action.passRun,disguise:!!action.disguise}));else commit(skipMove(game));}catch(err){fail(err);}
  };
  const fallback=(level=difficulty)=>{if(!stillCurrent())return;stopAIWorker();try{receive(chooseAIAction(game,{difficulty:level}));}catch(err){fail(err);}};
  aiTimer=setTimeout(()=>{
    aiTimer=null;if(!stillCurrent())return;
    if(difficulty==='tactical'&&typeof window.Worker==='function'){
      try{
        aiWorker=new window.Worker(new URL('./ai-worker.js?v=de2c8c1f88e1',import.meta.url),{type:'module',name:'football-chess-tactical'});
        aiWorker.onmessage=event=>{if(!stillCurrent()||event.data?.requestId!==requestId)return;if(event.data.error)fallback();else receive(event.data.action);};
        aiWorker.onerror=event=>{event.preventDefault?.();fallback();};
        aiWatchdog=setTimeout(()=>fallback('casual'),4000);
        aiWorker.postMessage({requestId,state:game,difficulty});
      }catch{fallback();}
    }else fallback();
  },aiPace);
}
function drawPreview(x,y){
  document.querySelectorAll('.trajectory').forEach(line=>line.remove());if(blocked())return;
  const target=getTargets().find(t=>t.x===x&&t.y===y);if(!target){resetKickDetails();return;}
  if(cornerSelectPhase()){$('kickDetails').textContent=`${targetDescription(target)}. This selection moves the taker to the corner; both positioning rounds remain available.`;return;}
  if(target.type==='tackle'){const defender=game.pieces.find(piece=>piece.id===selectedId);$('kickDetails').textContent=`Tackle outcomes: ${tackleOdds(target)}. ${defender?`${pieceLabel(defender)} reach: ${TACKLE_PATTERNS[defender.type]}. `:''}A clean attempt moves the defender to ${coord(x,y)}; evasion uses the regular move and leaves the carrier with the ball.${game.foulsEnabled?' A foul stops play and awards a free kick or penalty.':''}`;return;}
  if(game.phase==='keeperReact'&&game.pendingShot){const model=shotModel(game,game.pendingShot.x,game.pendingShot.y,{x,y});showShotModel(model,`scoring chance if keeper moves to ${coord(x,y)}`);$('kickDetails').textContent=`Keeper preview: ${coord(x,y)} · ${outcomeBreakdown(model)}`;return;}
  if(kickPhase()){
    if(target.offsideReason==='boxKnight'){clearKeeperOverlay();$('kickDetails').textContent=targetDescription(target);}
    else if(target.goal){const model=shotPreviewModel(x,y);drawShotPaths(model,'trajectory');drawKeeperOverlay(model);$('kickDetails').textContent=`${targetDescription(target)} · ${shotGeometry(model)}. ${outcomeBreakdown(model)}${model.penalty?'.':' before the keeper’s reaction.'}`;}
    else{clearKeeperOverlay();if(target.path)addLine(target.path,target.lofted?'trajectory lofted-trajectory':'trajectory');$('kickDetails').textContent=`${targetDescription(target)} · ${target.distance} squares · ${percent(target.accuracy)} ${accuracyLabel()} accuracy. ${target.distance>10?'An inaccurate landing can cross a boundary. ':''}The player stays in place.`;}
  }else $('kickDetails').textContent=`${targetDescription(target)}. ${stage==='setup'?'Formation only; no turn used.':passRunPhase()?'Uses the next off-ball move; the receiver keeps the ball.':freePawnMode?'Uses the shared pawn-or-king bonus.':targetKind(target)==='dribble'?'Uses the separate dribble action; the off-ball allowance is independent.':'Uses the off-ball positioning action; passing and shooting happen later.'}`;
}
$('board').addEventListener('pointerover',event=>{const el=event.target.closest('.square');if(el)drawPreview(Number(el.dataset.x),Number(el.dataset.y));});
$('board').addEventListener('focusin',event=>{const el=event.target.closest('.square');if(el)drawPreview(Number(el.dataset.x),Number(el.dataset.y));});
$('board').addEventListener('pointerleave',()=>{document.querySelectorAll('.trajectory').forEach(line=>line.remove());resetKickDetails();});
$('board').addEventListener('click',event=>{
  const el=event.target.closest('.square');if(!el)return;const x=Number(el.dataset.x),y=Number(el.dataset.y),piece=game.pieces.find(p=>p.x===x&&p.y===y),target=getTargets().find(t=>t.x===x&&t.y===y);
  if(stage==='setup'){
    if(target&&selectedId){const selected=game.pieces.find(p=>p.id===selectedId);if(piece&&piece.id!==selected.id){piece.x=selected.x;piece.y=selected.y;}selected.x=x;selected.y=y;if(selected.id===game.ball.carrierId||piece?.id===game.ball.carrierId)game.ball={x,y,carrierId:selected.id};selectedId=null;save();render();return;}
    if(piece){selectedId=piece.id;if(game.mode==='solo'&&piece.team==='black')toast('Arrange Ivory FC, or choose two players to arrange both teams.');render();}return;
  }
  if(blocked()){if(paused)toast(game.mode==='watch'?'Resume the match to continue watching.':'Resume the match to play.');return;}
  try{
    if(cornerSelectPhase()){if(target)commit(selectCornerTaker(game,target.pieceId));else toast('Choose one of your highlighted players in the attacking half as the corner taker.');return;}
    if(target){if(kickPhase())commit(applyKick(game,x,y,{passRun:passRunSelected,disguise:disguiseSelected&&!!target.goal&&disguiseChoices().some(choice=>choice.x===x&&choice.y===y)}));else commit(applyMove(game,selectedId,x,y,{freePawn:positionPhase()&&freePawnMode}));return;}
    if(kickPhase()){toast(game.restart?.type==='throwIn'?'Choose a highlighted throw target within 10 squares. Throws cannot score directly.':'Choose a highlighted pass destination or a lit goal cell.');return;}
    if(game.phase==='keeperReact'){toast(penaltyPending()?'The keeper holds position for a penalty. Choose Resolve penalty.':keeperCanReact()?'Only the king may react to this shot. Choose a lit square or hold the keeper.':'The king is outside its own box and cannot react. Choose Resolve shot.');return;}
    if(passRunPhase()){toast('Only the passer can make this optional run. Choose a lit square or Skip run.');return;}
    if(piece&&piece.team===currentTeam(game)){
      if(freePawnMode&&(!['P','K'].includes(piece.type)||piece.id===game.ball.carrierId)){toast('Choose a pawn or king without the ball for the shared bonus. A carrier cannot use it to dribble.');return;}
      if(!freePawnMode){const actions=positionActions(game),carrying=piece.id===game.ball.carrierId;
        if(carrying&&!actions.dribbleAvailable){toast(game.restart?'The restart taker must stay in place until the restart.':'The dribble is used or unavailable. Choose an off-ball player or the pawn-or-king bonus.');return;}
        if(!carrying&&!actions.normalAvailable){toast('Your off-ball move is used. Choose Dribble or Pawn or King if available.');return;}
        setMoveMode(carrying?'dribble':'normal');
      }
      selectedId=piece.id;render();
    }
    else if(piece)toast(`It is ${TEAM[currentTeam(game)]}’s move. Select one of your players to see its legal tackles and their odds.`);
  }catch(err){toast(err.message);}
});
$('cornerTakerList').addEventListener('click',event=>{
  const button=event.target.closest('[data-corner-taker]');if(!button||blocked()||!cornerSelectPhase())return;
  try{commit(selectCornerTaker(game,button.dataset.cornerTaker));}catch(error){toast(error.message);}
});
$('board').addEventListener('keydown',event=>{
  const el=event.target.closest('.square');if(!el)return;const dirs={ArrowUp:[0,-1],ArrowDown:[0,1],ArrowLeft:[-1,0],ArrowRight:[1,0]};
  if(event.key==='Escape'){selectedId=null;render();return;}if(!dirs[event.key])return;event.preventDefault();let[dx,dy]=dirs[event.key];if(flipped){dx=-dx;dy=-dy;}
  const x=Math.max(0,Math.min(W-1,Number(el.dataset.x)+dx)),y=Math.max(0,Math.min(H-1,Number(el.dataset.y)+dy));squares[y*W+x].focus();
});
for(const id of ['goalTop','goalBottom']){
  $(id).addEventListener('click',event=>{const el=event.target.closest('[data-goal-x]');if(!el||blocked()||el.disabled)return;const x=Number(el.dataset.goalX),y=Number(el.dataset.goalY);const kick=legalKicks(game).find(k=>k.goal&&k.x===x&&k.y===y);if(kick)commit(applyKick(game,x,y,{passRun:passRunSelected,disguise:disguiseSelected&&disguiseChoices().some(choice=>choice.x===x&&choice.y===y)}));});
  $(id).addEventListener('pointerover',event=>{const el=event.target.closest('[data-goal-x]');if(el)drawPreview(Number(el.dataset.goalX),Number(el.dataset.goalY));});
  $(id).addEventListener('focusin',event=>{const el=event.target.closest('[data-goal-x]');if(el)drawPreview(Number(el.dataset.goalX),Number(el.dataset.goalY));});
  $(id).addEventListener('pointerleave',()=>{document.querySelectorAll('.trajectory').forEach(line=>line.remove());resetKickDetails();});
}
function refreshSetup(){if(stage!=='setup')return;cancelAI();replayPlayer.stop();lastGoalReplay=null;replayAutoContinue=false;replayPendingResult=false;game=createGame({foulsEnabled,mode:$('mode').value,minutes:Number($('duration').value)||10,kickoff:$('kickoff').value});duration=Number($('duration').value);resetClock();selectedId=null;lastComputerAction=null;freePawnMode=false;dribbleMode=false;passRunSelected=false;history=[];matchStats=createMatchStats();render();save();}
$('aiPace').addEventListener('change',()=>{const value=Number($('aiPace').value);aiPace=AI_PACES.includes(value)?value:3000;render();save();});
$('aiDifficulty').addEventListener('change',()=>{aiDifficulty=$('aiDifficulty').value==='tactical'?'tactical':'casual';$('aiDifficulty').value=aiDifficulty;render();save();});
$('whiteDifficulty').addEventListener('change',()=>{whiteDifficulty=$('whiteDifficulty').value==='tactical'?'tactical':'casual';$('whiteDifficulty').value=whiteDifficulty;render();save();});
for(const id of ['mode','kickoff'])$(id).addEventListener('change',refreshSetup);
$('passRunEnabled').addEventListener('change',()=>{if(!kickPhase()||blocked()){$('passRunEnabled').checked=passRunSelected;return;}passRunSelected=!!$('passRunEnabled').checked;render();save();});
$('disguisedShotEnabled').addEventListener('change',()=>{if(disguiseChoices().length!==2||blocked()){$('disguisedShotEnabled').checked=disguiseSelected;return;}disguiseSelected=!!$('disguisedShotEnabled').checked;render();save();});
$('foulsEnabled').addEventListener('change',()=>{if(stage!=='setup'){$('foulsEnabled').checked=foulsEnabled;return;}foulsEnabled=!!$('foulsEnabled').checked;refreshSetup();});
$('duration').addEventListener('change',()=>{if(stage!=='setup')return;duration=Number($('duration').value);resetClock();game.minutes=duration||10;render();save();});
$('normalMoveBtn').addEventListener('click',()=>{if(blocked()||!positionActions(game).normalAvailable)return;setMoveMode('normal');selectedId=null;render();});
$('dribbleBtn').addEventListener('click',()=>{if(blocked()||!positionActions(game).dribbleAvailable)return;setMoveMode('dribble');selectedId=game.ball.carrierId;render();});
$('pawnMoveBtn').addEventListener('click',()=>{if(blocked()||!positionActions(game).pawnAvailable)return;setMoveMode('pawn');selectedId=null;render();});
$('startBtn').addEventListener('click',()=>{if(stage!=='setup')return;resetClock();stage='playing';paused=false;selectedId=null;render();save();});
$('skipBtn').addEventListener('click',()=>{if(!blocked())commit(skipMove(game));});
$('pauseBtn').addEventListener('click',()=>{if(stage!=='playing'&&!shotFlight||advanceClockNow())return;paused=!paused;lastTick=Date.now();render();save();});
$('undoBtn').addEventListener('click',()=>{if(!history.length||stage!=='playing'||anyDialog()||advanceClockNow())return;cancelShotFlight();cancelAI();let entry=history.pop();if(game.mode==='solo')while(entry.actor!=='white'&&history.length)entry=history.pop();game=upgradeSavedGame(entry.game);passRunSelected=!!entry.passRunSelected&&['kick','kickoff','keeperRelease'].includes(game.phase);disguiseSelected=entry.disguiseSelected!==false;foulsEnabled=game.foulsEnabled===true;matchStats=restoreMatchStats(entry.matchStats,game,{partial:true});if(lastGoalReplay&&(game.score.white<lastGoalReplay.score.white||game.score.black<lastGoalReplay.score.black))lastGoalReplay=null;if(game.mode==='watch')paused=true;restoreClock(rewindMatchClock(clockSnapshot(),entry.clock,{actionSeconds:ACTION_SECONDS}));selectedId=null;lastComputerAction=null;freePawnMode=false;dribbleMode=false;lastTick=Date.now();render();save();toast(game.mode==='watch'?'Last computer action undone. Press Resume to continue.':'Last move undone.');});
$('flipBtn').addEventListener('click',()=>{flipped=!flipped;render();save();});
$('replayBtn').addEventListener('click',()=>openGoalReplay());
function finishMatch({replayGoal=false}={}){if(stage!=='playing'||shotFlight)return;flushClockElapsed();cancelAI();stage='finished';paused=false;game.phase='finished';selectedId=null;if(replayGoal&&lastGoalReplay){replayPendingResult=true;openGoalReplay({automatic:true});}else{render();save();showResult();}}
function renderGoalMap(summary){
  const NS='http://www.w3.org/2000/svg',svg=$('statsGoalMap');
  svg.replaceChildren();
  const draw=(tag,attrs={},parent=svg,text='')=>{const node=document.createElementNS(NS,tag);for(const [key,value] of Object.entries(attrs))node.setAttribute(key,String(value));if(text)node.textContent=text;parent.append(node);return node;};
  draw('title',{id:'statsMapTitle'},svg,'Goal origins at both ends of the pitch');
  draw('desc',{},svg,'Each marker shows the original pitch square where the scoring shot was taken. Ivory FC attacks the upper goal and Obsidian FC attacks the lower goal.');
  const cell=20,left=30,top=30,width=W*cell,height=H*cell,centreX=left+width/2,centreY=top+height/2,boxX=left+BOX_FILES[0]*cell,boxWidth=BOX_FILES.length*cell,depth=BOX_DEPTH*cell,goalX=left+GOAL_FILES[0]*cell,goalWidth=GOAL_FILES.length*cell;
  svg.setAttribute('viewBox',`0 0 ${width+60} ${height+80}`);
  draw('rect',{x:left,y:top,width,height,rx:1,class:'stats-map-pitch'});
  for(const zoneY of [top,top+height-(BOX_DEPTH+3)*cell]){
    draw('rect',{x:left,y:zoneY,width:BOX_FILES[0]*cell,height:(BOX_DEPTH+3)*cell,class:'stats-map-wide-zone'});
    draw('rect',{x:boxX+boxWidth,y:zoneY,width:width-(BOX_FILES.at(-1)+1)*cell,height:(BOX_DEPTH+3)*cell,class:'stats-map-wide-zone'});
  }
  draw('rect',{x:boxX,y:top+depth,width:boxWidth,height:3*cell,class:'stats-map-central-zone'});
  draw('rect',{x:boxX,y:top+height-depth-3*cell,width:boxWidth,height:3*cell,class:'stats-map-central-zone'});
  draw('rect',{x:goalX,y:top-cell,width:goalWidth,height:cell,class:'stats-map-goal'});draw('rect',{x:goalX,y:top+height,width:goalWidth,height:cell,class:'stats-map-goal'});
  draw('rect',{x:boxX,y:top,width:boxWidth,height:depth,class:'stats-map-box'});draw('rect',{x:boxX,y:top+height-depth,width:boxWidth,height:depth,class:'stats-map-box'});
  draw('line',{x1:left,y1:centreY,x2:left+width,y2:centreY,class:'stats-map-line'});draw('circle',{cx:centreX,cy:centreY,r:29,class:'stats-map-line'});draw('circle',{cx:centreX,cy:centreY,r:2,class:'stats-map-centre'});
  draw('text',{x:centreX,y:7,'text-anchor':'middle',class:'stats-map-direction'},svg,'IVORY FC ATTACKS ↑');
  draw('text',{x:centreX,y:height+70,'text-anchor':'middle',class:'stats-map-direction'},svg,'OBSIDIAN FC ATTACKS ↓');
  const groups=new Map();
  summary.goals.forEach((goal,index)=>{const origin=goal.origin;if(!origin)return;const key=`${origin.x},${origin.y}`;if(!groups.has(key))groups.set(key,{origin,goals:[]});groups.get(key).goals.push({goal,index});});
  let selectedMarker=null;
  const timeOf=goal=>goal.matchSeconds===null?`Round ${goal.turn}`:`${Math.floor(goal.matchSeconds/60)}:${String(Math.floor(goal.matchSeconds%60)).padStart(2,'0')}`;
  const describe=({goal,index})=>`Goal ${index+1}: ${TEAM[goal.team]}, ${shortPieceId(goal.scorerId)}${goal.ownGoal?` own goal by ${TEAM[goal.scorerId.split('-')[0]]}`:''}, ${timeOf(goal)}, shot from ${coord(goal.origin.x,goal.origin.y)}${goal.distance!==null?`, ${goal.distance.toFixed(1)} squares`:''}`;
  const select=(group,marker)=>{if(selectedMarker)selectedMarker.classList.remove('selected');selectedMarker=marker;marker.classList.add('selected');$('statsMapSelectionTitle').textContent=`${group.goals.length} goal${group.goals.length===1?'':'s'} from this square`;$('statsMapSelection').innerHTML=group.goals.map(({goal,index})=>`<li><span class="stats-team-dot ${goal.team}" aria-hidden="true"></span><span><b>${TEAM[goal.team]} · ${shortPieceId(goal.scorerId)}${goal.ownGoal?' (OG)':''}</b><small>${timeOf(goal)} · From ${coord(goal.origin.x,goal.origin.y)}${goal.distance!==null?` · ${goal.distance.toFixed(1)} squares`:''}${goal.ownGoal?` · By ${TEAM[goal.scorerId.split('-')[0]]}`:''}</small></span></li>`).join('');};
  for(const group of groups.values()){
    const {origin,goals}=group,x=left+(origin.x+0.5)*cell,y=top+(origin.y+0.5)*cell,teams=new Set(goals.map(({goal})=>goal.team)),mixed=teams.size>1,team=goals[0].goal.team;
    const detail=goals.map(describe).join('; '),marker=draw('g',{class:`stats-map-marker ${mixed?'mixed':team}${goals.some(({goal})=>goal.ownGoal)?' own-goal':''}`,tabindex:0,role:'button','aria-label':`${goals.length} goal${goals.length===1?'':'s'} from this square. ${detail}. Show goal details.`,'data-goal-count':goals.length,'data-origin-x':goals[0].goal.origin.x,'data-origin-y':goals[0].goal.origin.y,'data-pitch-x':origin.x,'data-pitch-y':origin.y});
    draw('title',{},marker,detail);draw('circle',{cx:x,cy:y,r:8},marker);
    if(mixed)draw('path',{d:`M ${x} ${y-8} A 8 8 0 0 1 ${x} ${y+8} Z`,class:'stats-map-split'},marker);
    draw('text',{x,y:y+2.5,'text-anchor':'middle',class:'stats-map-id'},marker,goals.length===1?shortPieceId(goals[0].goal.scorerId):`×${goals.length}`);
    marker.addEventListener('click',()=>select(group,marker));marker.addEventListener('focus',()=>select(group,marker));marker.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();select(group,marker);}});
    if(!selectedMarker)select(group,marker);
  }
  if(!groups.size){$('statsMapSelectionTitle').textContent='Goal origin details';$('statsMapSelection').innerHTML='<li class="stats-empty">No goal locations recorded.</li>';}
  const info=summary.goalLocations;
  $('statsMapNote').textContent=`${info.known} goal${info.known===1?'':'s'} mapped.${info.unknown?` ${info.unknown} goal${info.unknown===1?' has':'s have'} no recorded location.`:''} Original pitch positions: Ivory attacks the upper goal; Obsidian attacks the lower goal. Select a marker for scorer IDs and times; a number groups goals from the same square.`;
  const zones=[['Inside keeper box','box'],['Central approach','central'],['Wide close','wide'],['Further out','distant']];
  $('statsGoalZoneRows').innerHTML=zones.map(([label,key])=>`<tr><td>${info.byTeam.white.zones[key]}</td><th scope="row">${label}</th><td>${info.byTeam.black.zones[key]}</td></tr>`).join('');
}
function renderMatchStats(){
  const summary=matchStatsSummary(matchStats),white=summary.teams.white,black=summary.teams.black;
  const rows=[['Shots',white.shots,black.shots],['On target',white.onTarget,black.onTarget],['Corners',white.corners,black.corners],['Fouls',white.fouls||0,black.fouls||0],['Yellow cards',white.yellowCards||0,black.yellowCards||0],['Red cards',white.redCards||0,black.redCards||0],['Possession',white.possessionPercent===null?'—':`${Math.round(white.possessionPercent)}%`,black.possessionPercent===null?'—':`${100-Math.round(white.possessionPercent)}%`]];
  $('matchStatsRows').innerHTML=rows.map(([label,w,b])=>`<tr><td>${w}</td><th scope="row">${label}</th><td>${b}</td></tr>`).join('');
  $('statsPartial').hidden=!summary.partial;
  $('statsPossessionNote').textContent='Possession measures active play time, including loose balls and shots in flight. Pauses, replays, kickoff and restart preparation are excluded.';
  renderGoalMap(summary);
  const contributions=(items,empty)=>items.length?items.map(item=>`<li><span class="stats-team-dot ${item.team}" aria-hidden="true"></span><span>${TEAM[item.team]} · <b>${shortPieceId(item.pieceId)}</b></span><strong>${item.count}</strong></li>`).join(''):`<li class="stats-empty">${empty}</li>`;
  $('statsScorers').innerHTML=contributions(summary.scorers,'No recorded goals.');
  $('statsAssists').innerHTML=contributions(summary.assists,'No recorded assists.');
  $('statsFoulMode').textContent=game.foulsEnabled?'Fouls and cards enabled.':'Fouls and cards disabled for this match.';
  $('statsSentOff').innerHTML=game.sentOff?.length?game.sentOff.map(piece=>`<li><span class="stats-team-dot ${piece.team}" aria-hidden="true"></span><span>${TEAM[piece.team]} · <b>${shortPieceId(piece.id)}</b><small>${piece.reason==='secondYellow'?'Second yellow card':'Red card'}</small></span></li>`).join(''):'<li class="stats-empty">No players sent off.</li>';
  $('statsGoalLog').innerHTML=summary.goals.length?summary.goals.map(goal=>{
    const time=goal.matchSeconds===null?`Round ${goal.turn}`:`${Math.floor(goal.matchSeconds/60)}:${String(Math.floor(goal.matchSeconds%60)).padStart(2,'0')}`;
    return `<li><time>${time}</time><span><b>${TEAM[goal.team]} · ${shortPieceId(goal.scorerId)}${goal.ownGoal?' (own goal)':''}</b><small>${goal.ownGoal?`By ${TEAM[goal.scorerId.split('-')[0]]}`:goal.assistId?`Assist: ${shortPieceId(goal.assistId)}`:'Unassisted'}${goal.origin?` · From ${coord(goal.origin.x,goal.origin.y)}${goal.distance!==null?` · ${goal.distance.toFixed(1)} squares`:''}`:' · Location not recorded'}</small></span></li>`;
  }).join(''):'<li class="stats-empty">No recorded goals.</li>';
  const earlier=summary.baselineScore.white+summary.baselineScore.black;
  $('statsPartial').textContent=`Stats recorded from this update.${earlier?` ${earlier} earlier goal${earlier===1?' has':'s have'} no recorded scorer.`:''}`;
}
function showResult(){const forfeited=game.finishReason==='forfeit',winner=forfeited&&['white','black'].includes(game.winner)?game.winner:game.score.white===game.score.black?null:game.score.white>game.score.black?'white':'black';$('resultTitle').textContent=winner?TEAM[winner]+(forfeited?' wins by forfeit.':' wins.'):'Honours even.';$('resultScore').textContent=`${game.score.white} : ${game.score.black}`;$('resultText').textContent=forfeited?`${TEAM[game.winner==='white'?'black':'white']} has fewer than seven active players. The score shown is the actual score when play stopped.`:winner?'A well-played match. The next move is a fresh start.':'Nothing between the sides. Settle it in a rematch.';renderMatchStats();if(!$('resultDialog').open)$('resultDialog').showModal();}
$('finishBtn').addEventListener('click',()=>{if(stage==='playing'&&duration===0)finishMatch();});
$('statsBtn').addEventListener('click',()=>{if(stage==='finished'&&!shotFlight)showResult();});
function newMatch(){cancelShotFlight();cancelAI();replayPlayer.stop();replayAutoContinue=false;replayPendingResult=false;lastGoalReplay=null;stage='setup';paused=false;for(const dialog of document.querySelectorAll('dialog[open]'))dialog.close();resetClock();selectedId=null;lastComputerAction=null;freePawnMode=false;dribbleMode=false;passRunSelected=false;history=[];game=createGame({foulsEnabled,mode:game.mode,minutes:duration||10,kickoff:$('kickoff').value});matchStats=createMatchStats();render();save();}
$('newBtn').addEventListener('click',()=>{if(stage==='playing'){if(advanceClockNow())return;$('confirmDialog').showModal();syncShotFlightPlayback();cancelAI();updateClock();}else newMatch();});$('confirmNewBtn').addEventListener('click',newMatch);$('rematchBtn').addEventListener('click',newMatch);
function openRules(){advanceClockNow();$('rulesDialog').showModal();syncShotFlightPlayback();cancelAI();updateClock();}
$('rulesBtn').addEventListener('click',openRules);$('detailsBtn').addEventListener('click',openRules);
for(const el of document.querySelectorAll('[data-close]'))el.addEventListener('click',()=>$(el.dataset.close).close());
for(const dialog of document.querySelectorAll('dialog')){dialog.addEventListener('close',()=>{if(dialog.id==='replayDialog'){replayPlayer.stop();replayAutoContinue=false;const showFinalResult=replayPendingResult;replayPendingResult=false;if(showFinalResult&&stage==='finished')showResult();}lastTick=Date.now();render();});dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();}});}
setInterval(()=>{advanceClockNow();},250);
setInterval(()=>{if(stage==='playing')save();},5000);window.addEventListener('pagehide',()=>{advanceClockNow();save();});
render();
if(stage==='playing'&&paused)toast('Your match is restored. Press Resume to continue.');
else if(legacyMatch){toast('The 14×17 pitch needs a fresh match. Your settings are retained.');save();}
if(stage==='finished')showResult();
