import {createGame, legalMoves, legalKicks, applyMove, applyKick, skipMove, chooseAIAction, currentTeam, BOARD_WIDTH as W, BOARD_HEIGHT as H, GOAL_FILES, isBox, shotChance, shotModel, offsideInfo, LONG_TACKLE_RANGE, DRIBBLE_RANGE, STALLING_RULE, ACTION_SECONDS, actionTimeout, progressInfo, positionActions, normalizeGame} from './engine.js?v=773c08c98207';
import {createMatchClock, restoreMatchClock, tickMatchClock, settleMatchClock, rewindMatchClock} from './match-clock.js?v=73476bff5019';

const $ = id => document.getElementById(id);
const NAMES = {K:'Goalkeeper',Q:'Queen',R:'Rook',B:'Bishop',N:'Knight',P:'Pawn'};
const SYMBOLS = {K:'♚',Q:'♛',R:'♜',B:'♝',N:'♞',P:'♟'};
const TEAM = {white:'Ivory FC',black:'Obsidian FC'};
const STORE = 'football-chess-match-v2';
const AI_PACES = [3000,1800,600];
const MOVE_PATTERNS={K:'One square in any direction',Q:'Up to 10 squares straight or diagonally',R:'Up to 10 squares horizontally or vertically',B:'Up to 10 squares diagonally',N:'One L-shaped jump over other pieces',P:'One square forward, back, left, or right'};
const DRIBBLE_PATTERNS={...MOVE_PATTERNS,Q:`Up to ${DRIBBLE_RANGE} squares straight or diagonally`,R:`Up to ${DRIBBLE_RANGE} squares horizontally or vertically`,B:`Up to ${DRIBBLE_RANGE} squares diagonally`};
const KICK_PATTERNS={K:'Straight or diagonal kicks, like a queen',Q:'Straight or diagonal kicks',R:'Horizontal or vertical kicks',B:'Diagonal kicks',N:'One L-shaped kick over other pieces',P:'Forward, backward, left, or right kicks'};
const TACKLE_PATTERNS={K:'1 square in any direction',Q:`up to ${LONG_TACKLE_RANGE} squares straight or diagonally`,R:`up to ${LONG_TACKLE_RANGE} squares horizontally or vertically`,B:`up to ${LONG_TACKLE_RANGE} squares diagonally`,N:'one L-shaped jump',P:'1 square diagonally, forward or backward'};
const RESTART_NAMES={throwIn:'Throw-in',corner:'Corner kick',goalKick:'Goal kick',offside:'Indirect free kick',stalling:'Stalling free kick',timeout:'Time-wasting free kick'};
const FILES = 'abcdefghijkl';
const coord = (x,y) => `${FILES[x]}${H-y}`;
const percent = chance => `${Math.round(chance*100)}%`;
const shotPercent = chance => `${(chance*100).toFixed(1)}%`;
const kickPhase = () => ['kick','kickoff','keeperRelease'].includes(game.phase);
const positionPhase = () => ['attackMove','defendMove'].includes(game.phase);
const keeperCanReact = () => {const king=game.pieces.find(p=>p.type==='K'&&p.team===currentTeam(game));return !!king&&GOAL_FILES.includes(king.x)&&(king.team==='white'?king.y>=H-2:king.y<=1);};
const ballSVG = '<svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="18" fill="#fff9e9" stroke="#23372f" stroke-width="1"/><path d="M20 11l9 6-3 10H14l-3-10zM3 17l8 0M29 17l8 0M20 11V2M14 27l-5 8M26 27l5 8" fill="#25392e" stroke="#25392e" stroke-width="1.5"/></svg>';
let game = createGame();
let stage='setup',paused=false,remaining=600,duration=10,flipped=false;
let actionRemaining=ACTION_SECONDS,fullTimePending=false,finalChance=null;
let selectedId=null,history=[],aiTimer=null,toastTimer=null,lastTick=Date.now();
let storageOK=true,aiPace=3000,aiDifficulty='casual',whiteDifficulty='casual',lastComputerAction=null,freePawnMode=false,dribbleMode=false,legacyMatch=false;
let aiWorker=null,aiWatchdog=null,aiGeneration=0;
try {
  const saved=JSON.parse(localStorage.getItem(STORE)||'null');
  if(saved?.version===2&&saved.game?.pieces?.length===22&&['setup','playing','finished'].includes(saved.stage)) {
    game=upgradeSavedGame(saved.game);game.mode=['solo','local','watch'].includes(game.mode)?game.mode:'solo';stage=saved.stage;remaining=saved.remaining;duration=saved.duration;flipped=!!saved.flipped;
    restoreClock(restoreMatchClock(saved,{remaining,actionSeconds:ACTION_SECONDS}));
    if(duration===0){fullTimePending=false;finalChance=null;}
    paused=stage==='playing';history=Array.isArray(saved.history)?saved.history.slice(-80):[];
    aiPace=AI_PACES.includes(saved.aiPace)?saved.aiPace:3000;lastComputerAction=saved.lastComputerAction||null;
    aiDifficulty=saved.aiDifficulty==='tactical'?'tactical':'casual';
    whiteDifficulty=saved.whiteDifficulty==='tactical'?'tactical':'casual';
  } else {
    const old=JSON.parse(localStorage.getItem('football-chess-match-v1')||'null');
    if(old?.game){legacyMatch=true;aiPace=AI_PACES.includes(old.aiPace)?old.aiPace:3000;duration=[0,5,10,15].includes(old.duration)?old.duration:10;remaining=duration*60;flipped=!!old.flipped;game=createGame({mode:old.game.mode,minutes:duration||10});}
  }
} catch {storageOK=false;}

const squares=[];
for(let y=0;y<H;y++)for(let x=0;x<W;x++) {
  const button=document.createElement('button');button.type='button';button.dataset.x=x;button.dataset.y=y;button.setAttribute('role','gridcell');
  $('board').append(button);squares.push(button);
}
$('ranks').innerHTML=Array.from({length:H},(_,i)=>`<span>${H-i}</span>`).join('');
$('mode').value=game.mode;$('duration').value=String(duration);$('kickoff').value=game.attack;$('aiPace').value=String(aiPace);
$('aiDifficulty').value=aiDifficulty;
$('whiteDifficulty').value=whiteDifficulty;

function clockSnapshot(){return {remaining,actionRemaining,fullTimePending,finalChance:finalChance?{...finalChance}:null};}
function restoreClock(clock){({remaining,actionRemaining,fullTimePending,finalChance}=clock);}
function resetClock(){restoreClock(createMatchClock({remaining:duration*60,actionSeconds:ACTION_SECONDS}));lastTick=Date.now();}
function save(){flushClockElapsed();try{localStorage.setItem(STORE,JSON.stringify({version:2,game,stage,paused,remaining,duration,actionRemaining,fullTimePending,finalChance,flipped,aiPace,aiDifficulty,whiteDifficulty,lastComputerAction,history:history.slice(-80)}));}catch{storageOK=false;$('saveNote').textContent='Match saving is unavailable in this browser.';}}
function toast(text){clearTimeout(toastTimer);$('toast').textContent=text;$('toast').classList.add('visible');toastTimer=setTimeout(()=>$('toast').classList.remove('visible'),3800);}
function isComputer(team=currentTeam(game)){return game.mode==='watch'||game.mode==='solo'&&team==='black';}
function computerDifficulty(team=currentTeam(game)){return game.mode==='watch'&&team==='white'?whiteDifficulty:aiDifficulty;}
function anyDialog(){return !!document.querySelector('dialog[open]');}
function blocked(){return stage!=='playing'||paused||anyDialog()||isComputer();}
function stopAIWorker(){clearTimeout(aiWatchdog);aiWatchdog=null;if(aiWorker){aiWorker.terminate();aiWorker=null;}}
function cancelAI(){clearTimeout(aiTimer);aiTimer=null;stopAIWorker();aiGeneration++;}
function teamLabel(team){return game.mode==='solo'?(team==='white'?'Your':'Computer’s'):TEAM[team]+'’s';}
function pieceLabel(piece){return `${NAMES[piece.type]}${/\d$/.test(piece.id)?' '+piece.id.at(-1):''}`;}
function setupMoves(piece){
  if(!piece||(game.mode==='solo'&&piece.team==='black'))return [];
  const moves=[],carrier=game.ball.carrierId===piece.id;
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){
    const occupant=game.pieces.find(p=>p.x===x&&p.y===y);
    if(carrier){if(y===7&&(x===5||x===6)&&(!occupant||occupant.id===piece.id))moves.push({x,y,type:'move'});continue;}
    if(piece.team===game.attack&&piece.type!=='K'&&y===7&&occupant?.id===game.ball.carrierId){moves.push({x,y,type:'move'});continue;}
    if(occupant)continue;
    const ownHalf=piece.team==='white'?y>=8:y<=6;
    if(ownHalf&&(piece.type==='K'?isBox(x,y):piece.type==='N'||!isBox(x,y)))moves.push({x,y,type:'move'});
  }
  return moves;
}
function getTargets(){
  if(stage==='setup')return setupMoves(game.pieces.find(p=>p.id===selectedId));
  if(blocked())return [];
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
function restartGuide(){
  const restart=game.restart;if(!restart)return '';
  if(restart.type==='goalKick'&&kickPhase())return 'Both teams have resettled. The king must now pass from the goal box; a direct shot is not allowed.';
  if(kickPhase())return restart.type==='throwIn'?'Throw along any straight or diagonal direction. Accurate through 5 squares, unpredictable beyond 5, maximum 10. No direct goal.':restart.indirect?'Take an indirect free kick. Pass or find space; a direct shot is not allowed.':'The positioning round is complete. Take the restart using the taker’s kicking pattern.';
  return `${restart.type==='stalling'?'Awarded for insufficient forward progress. ':''}Both teams resettle before the restart: attacking side first, then defence. Each has one off-ball move and a free pawn action. ${restart.type==='goalKick'?'The king':'The taker'} stays at the restart spot; no dribbling or tackling until the ball is played.`;
}
function renderRestart(){
  const restart=game.restart,taker=game.pieces.find(piece=>piece.id===restart?.takerId);
  $('restartPanel').hidden=!restart||stage!=='playing';
  if(!restart)return;
  $('restartTitle').textContent=`${RESTART_NAMES[restart.type]||'Restart'} · ${TEAM[restart.team]}`;
  $('restartInfo').textContent=`${taker?pieceLabel(taker):'Nearest eligible player'} at ${coord(restart.spot.x,restart.spot.y)}. ${restartGuide()}`;
  $('throwGuide').hidden=restart.type!=='throwIn';
  $('throwGuide').textContent='1–5 squares: 100% · 6: 85% · 7: 70% · 8: 55% · 9: 40% · 10: 25%';
}
function renderProgress(){
  const info=progressInfo(game),panel=$('progressPanel');
  panel.hidden=stage!=='playing'||!info.active;
  panel.dataset.warning=String(info.warning);
  if(panel.hidden)return;
  $('progressTitle').textContent=`${TEAM[info.team]} · ${info.warning?'Last round to progress':'Keep the attack moving'}`;
  const net=info.progress>=0?`${info.progress} forward`:`${Math.abs(info.progress)} backward`;
  $('progressInfo').textContent=`${info.rounds}/${STALLING_RULE.rounds} rounds used · ${net} squares. ${info.needed>0?`Advance ${info.needed} more toward goal or shoot within ${info.roundsRemaining} ${info.roundsRemaining===1?'round':'rounds'} to avoid an indirect free kick.`:'Keep this forward gain through your kick to reset the count.'}`;
}
function targetKind(target){
  if(stage==='setup')return 'setup';
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
function targetDescription(target){
  const kind=targetKind(target),destination=coord(target.x,target.y);
  const receiver=game.pieces.find(piece=>piece.id===target.receiverId);
  if(target.offsideReason==='boxKnight'){
    const knight=game.pieces.find(piece=>piece.id===target.offsidePieceId);
    return `OFFSIDE: attacking knight${knight?` at ${coord(knight.x,knight.y)}`:''} in the opponent’s box is involved in play; this kick awards the opponents an indirect free kick`;
  }
  if(isOffsideTarget(target))return `OFFSIDE warning at ${destination}: touching this ball awards the opponents an indirect free kick`;
  if(kind==='setup')return `Starting formation square ${destination}`;
  if(kind==='keeper')return `Keeper reaction to ${destination}`;
  if(kind==='tackle')return `Tackle landing at ${destination}, ${percent(target.tackleProbability??1)} tackle success`;
  if(kind==='dribble')return `Dribble to ${destination}, player and ball move together`;
  if(kind==='collect')return `Move to ${destination} and collect ${game.looseBallKickOrigin?.pieceId===selectedId?'your own pass; this also uses the dribble allowance':'the loose ball'}`;
  if(kind==='offball')return `Move without ball to ${destination}, ball stays in place`;
  if(kind==='shot')return `Shoot at ${FILES[target.x].toUpperCase()}${target.goal!==currentTeam(game)?' into your own goal':''}`;
  if(kind==='throw')return `Throw ${receiver?`to ${TEAM[receiver.team]} ${pieceLabel(receiver)}`:'into space'} at ${destination}; thrower stays at the boundary`;
  if(kind==='pass')return `Pass to ${pieceLabel(receiver)} at ${destination}, kicker stays in place`;
  if(kind==='interception')return `Kick to ${destination}, opposing ${pieceLabel(receiver)} will intercept`;
  return `Kick into space at ${destination}, ball will be loose`;
}
function renderActionContext(selected){
  const carrying=selected?.id===game.ball.carrierId,kicking=kickPhase(),reacting=game.phase==='keeperReact';
  const ownCarrier=game.pieces.some(piece=>piece.id===game.ball.carrierId&&piece.team===currentTeam(game));
  const actions=positionActions(game);
  for(const [id,active]of [['offBallAction',positionPhase()&&actions.normalAvailable&&(!selected||!carrying)],['dribbleAction',actions.dribbleAvailable&&(!selected||carrying)],['kickAction',kicking]]){
    $(id).classList.toggle('active',stage==='playing'&&active);$(id).setAttribute('aria-current',stage==='playing'&&active?'true':'false');
  }
  $('kickAction').textContent=game.restart?.type==='throwIn'?'Throw-in':'Pass / shoot';
  let kind='offball',title='Move · dribble · pass / shoot',rule='Select a footballer to see its movement and kicking patterns. Moving a player and kicking the ball are separate actions.';
  if(stage==='finished'){title='Match complete';rule='Start a new match to choose your next action.';}
  else if(stage==='setup'){
    kind='setup';title=selected?'Arrange the formation':'Three ways to play';
    rule=selected?`Without the ball: ${MOVE_PATTERNS[selected.type]}. Dribble: ${DRIBBLE_PATTERNS[selected.type]}. ${KICK_PATTERNS[selected.type]}. Setup placement follows the starting-formation rules.`:'Move without the ball to find space. Dribble to carry it. Pass or shoot to send the ball while the player stays.';
  }else if(game.mode==='watch'){kind=reacting?'keeper':kicking?'pass':'offball';title='Computer vs computer';rule='Both teams play automatically. Pause to study the position, or change either team’s difficulty and the pace beside the pitch.';}
  else if(reacting){kind='keeper';title=keeperCanReact()?'Keeper reaction':'Resolve shot';rule=keeperCanReact()?'The shot is already in flight. Move only the defending king one square, or hold. This extra reaction is separate from ordinary positioning.':'The king is outside its own box and has no saving reach or extra reaction. Resolve the committed shot; ordinary re-entry into the box restores goalkeeper abilities.';}
  else if(game.restart){kind='pass';title=selected?.id===game.restart.takerId&&!kicking?'Restart taker · locked':RESTART_NAMES[game.restart.type];rule=restartGuide();}
  else if(kicking&&selected){kind='pass';title='Pass / shoot';rule=`${pieceLabel(selected)} stays at ${coord(selected.x,selected.y)}; only the ball travels. ${KICK_PATTERNS[selected.type]}.${selected.type==='N'?' A goal cell must be one L-shaped jump away to shoot. Knights enter both boxes and use the same scoring model as every other piece.':' Kicks can travel beyond 10 squares with reduced pass accuracy.'}`;}
  else if(positionPhase()&&freePawnMode){kind='offball';title='Free pawn · off ball';rule='Reposition one pawn that does not carry the ball by one square forward, back, left, or right. It may collect a loose ball, but cannot dribble or tackle. A carrying pawn uses the single Dribble action.';}
  else if(selected){
    kind=carrying?'dribble':'offball';title=carrying?'Dribble with the ball':'Move without the ball';
    rule=`${carrying?'Player and ball move together.':'The ball stays in place unless this move collects it or wins a tackle.'} ${(carrying?DRIBBLE_PATTERNS:MOVE_PATTERNS)[selected.type]}. ${!carrying&&!freePawnMode?`Tackle reach: ${TACKLE_PATTERNS[selected.type]}. `:''}${selected.type==='N'?'Knights may enter both goal boxes. ':''}${freePawnMode?'Uses the free pawn action; no tackling.':carrying?'Uses the dribble action; your separate off-ball move remains available until used.':'Uses the off-ball positioning action; the attacker’s dribble is separate.'}`;
  }else if(positionPhase()){
    title=ownCarrier?'Move without ball / dribble':'Move without the ball';
    rule=ownCarrier?'You may dribble once, move another player without the ball once, and reposition a pawn without the ball for free, in any order. End positioning to leave unused actions.':'Move a teammate off the ball, collect a loose ball, or try a highlighted tackle against an opposing carrier. You can dribble after winning possession.';
  }
  $('actionContext').dataset.action=kind;$('actionType').textContent=title;$('actionRule').textContent=rule;
}
function addLine(points,className){
  const line=document.createElementNS('http://www.w3.org/2000/svg','polyline');line.classList.add(className);
  line.setAttribute('points',points.map(p=>`${p.x*100+50},${p.y*100+50}`).join(' '));
  document.querySelector('.pitch-markings').append(line);
}
function clearKeeperOverlay(){for(const el of document.querySelectorAll('.keeper-reach,.keeper-coverage,.intercept-point'))el.remove();}
function drawKeeperOverlay(model){
  clearKeeperOverlay();if(!model.keeperPosition||!model.closestPoint)return;
  const svg=document.querySelector('.pitch-markings'),circle=document.createElementNS('http://www.w3.org/2000/svg','circle');
  circle.classList.add('keeper-reach');circle.setAttribute('cx',model.keeperPosition.x*100+50);circle.setAttribute('cy',model.keeperPosition.y*100+50);circle.setAttribute('r',model.reach*100);svg.append(circle);
  addLine([model.keeperPosition,model.closestPoint],'keeper-coverage');
  const dot=document.createElementNS('http://www.w3.org/2000/svg','circle');dot.classList.add('intercept-point');dot.setAttribute('cx',model.closestPoint.x*100+50);dot.setAttribute('cy',model.closestPoint.y*100+50);dot.setAttribute('r',8);svg.append(dot);
}
function outcomeBreakdown(model){
  if(model.cornerProbability>0){
    const goal=Math.round(model.goalProbability*1000),caught=Math.round((model.saveProbability-model.cornerProbability)*1000),corner=Math.round(model.cornerProbability*1000);
    return `Goal ${(goal/10).toFixed(1)}% · Catch ${(caught/10).toFixed(1)}% · Corner ${(corner/10).toFixed(1)}% · Wide ${((1000-goal-caught-corner)/10).toFixed(1)}%`;
  }
  const goal=Math.round(model.goalProbability*1000),saved=Math.round(model.saveProbability*1000),wide=1000-goal-saved;
  return `Goal ${(goal/10).toFixed(1)}% · Save ${(saved/10).toFixed(1)}% · Wide ${(wide/10).toFixed(1)}%`;
}
function shotGeometry(model){return `Shot ${model.distance.toFixed(1)} squares · Keeper ${model.keeperPathDistance.toFixed(1)} squares off path · ${model.keeperInBox?'Full box reach':'No saving reach outside own box'}${model.saveProbability>0?` · Parry if stopped: ${percent(model.parryGivenSave)}`:''}`;}
function showShotModel(model,caption='chance to score with the keeper here'){
  $('shotOdds').textContent=`${shotPercent(model.probability)} ${caption}`;
  $('shotBreakdown').textContent=outcomeBreakdown(model);
  $('shotGeometry').textContent=shotGeometry(model)+`. Keeper stops ${shotPercent(model.saveGivenOnTarget)} of on-target shots.`;
  drawKeeperOverlay(model);
}
function renderBoard(){
  for(const line of document.querySelectorAll('.trajectory,.computer-action-path,.shot-path,.offside-line,.throw-safe,.throw-limit'))line.remove();
  const targets=getTargets(),action=lastComputerAction?.action;
  const showTrace=action&&!['goal','shotAttempt'].includes(action.type);
  const shot=game.phase==='keeperReact'?game.pendingShot:null;
  const previewShots=shot?[]:legalKicks({...game,phase:'kick'}).filter(kick=>kick.goal);
  const offside=offsideInfo(game),exempt=['throwIn','corner','goalKick'].includes(game.restart?.type),activeFlags=new Set(game.offside?.flaggedIds||[]),positionFlags=new Set(exempt?[]:offside.flaggedIds||[]);
  for(const el of squares){
    const x=Number(el.dataset.x),y=Number(el.dataset.y),piece=game.pieces.find(p=>p.x===x&&p.y===y),target=targets.find(t=>t.x===x&&t.y===y);
    const last=game.lastAction?.to,isSelected=piece?.id===selectedId,hasBall=game.ball.x===x&&game.ball.y===y;
    const kind=target?targetKind(target):null;
    el.className=['square',(x+y)%2?'checker':'',isBox(x,y)?'box':'',y===7&&(x===5||x===6)?'kickoff':'',isSelected?'selected':'',last?.x===x&&last?.y===y?'last-move':'',target?'legal':'',kind?`action-${kind}`:'',target?.type==='tackle'?'tackle':'',showTrace&&action.from?.x===x&&action.from?.y===y?'computer-from':'',showTrace&&action.to?.x===x&&action.to?.y===y?'computer-to':''].filter(Boolean).join(' ');
    if(kind)el.dataset.action=kind;else delete el.dataset.action;
    el.classList.toggle('offside-flag',!!piece&&activeFlags.has(piece.id));el.classList.toggle('offside-position',!!piece&&positionFlags.has(piece.id)&&!activeFlags.has(piece.id));el.classList.toggle('offside-target',!!target&&isOffsideTarget(target));el.classList.toggle('restart-taker',!!piece&&piece.id===game.restart?.takerId);
    el.setAttribute('aria-selected',String(isSelected));
    let label=coord(x,y)+(piece?`, ${TEAM[piece.team]} ${pieceLabel(piece)}`:', empty');
    if(hasBall)label+=', ball';if(target)label+=`, ${targetDescription(target)}`;
    if(target?.accuracy!==undefined)label+=`, ${percent(target.accuracy)} ${accuracyLabel()} accuracy`;
    if(piece&&activeFlags.has(piece.id))label+=', offside at the previous kick; involvement will be penalised';else if(piece&&positionFlags.has(piece.id))label+=', in an offside position if a teammate plays the ball now';
    if(piece?.id===game.restart?.takerId)label+=', restart taker; locked until the restart';
    if(shot&&target)label+=`, opponent scoring chance ${percent(shotChance(game,shot.x,shot.y,{x,y}))} after this keeper move`;
    el.setAttribute('aria-label',label);el.title=label;
    el.innerHTML=piece?`<span class="piece ${piece.team}"><span>${SYMBOLS[piece.type]}</span>${hasBall?`<span class="ball">${ballSVG}</span>`:''}</span>`:hasBall?`<span class="ball loose">${ballSVG}</span>`:'';
    if(target?.accuracy<1)el.insertAdjacentHTML('beforeend',`<span class="accuracy-badge">${percent(target.accuracy)}</span>`);
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
      const x=Number(el.dataset.goalX),kick=targets.find(t=>t.x===x&&t.y===y&&t.goal),chance=shotChance(game,x,y);
      const preview=previewShots.find(candidate=>candidate.x===x&&candidate.y===y),aimed=shot?.x===x&&shot?.y===y,canPreview=shot?aimed:!!preview,offsideShot=!shot&&preview?.offsideReason==='boxKnight';
      el.disabled=!kick;el.classList.toggle('available',!!kick);el.classList.toggle('shot-selected',aimed);el.classList.toggle('own-goal',!!kick&&kick.goal!==currentTeam(game));el.dataset.goalY=y;
      el.classList.toggle('offside-target',offsideShot);
      el.innerHTML=`<span class="goal-file">${FILES[x].toUpperCase()}</span><span class="goal-odds">${offsideShot?'OFF':canPreview?percent(chance):'—'}</span>`;
      el.dataset.action='shot';
      const detail=offsideShot?targetDescription(preview):canPreview?`Shoot at ${y===-1?'Obsidian':'Ivory'} goal, column ${FILES[x]}, ${percent(chance)} scoring chance ${shot?'with the keeper here':'before keeper reaction'}${kick&&kick.goal!==currentTeam(game)?', warning: own goal':''}`:`${y===-1?'Obsidian':'Ivory'} goal, column ${FILES[x]}, no legal shot from this position`;
      el.setAttribute('aria-label',detail+(aimed?', shot committed':'')+(!kick?', unavailable shot':''));el.title=detail;
    }
  }
  document.querySelector('.pitch-area').classList.toggle('flipped',flipped);
  const showOffside=stage==='playing'&&!shot&&game.ball.carrierId&&!exempt;
  $('offsideStatus').hidden=stage!=='playing';
  if(exempt)$('offsideStatus').textContent='No offside directly from this restart.';
  else if(offside.boxKnightIds?.length)$('offsideStatus').textContent=`Offside knight${offside.boxKnightIds.length===1?'':'s'} in the opponent’s box: any teammate kick immediately awards an indirect free kick. Move onside or leave the box before kicking.`;
  else if(activeFlags.size)$('offsideStatus').textContent=`${activeFlags.size} player${activeFlags.size===1?' was':'s were'} offside at the previous kick. Returning onside does not clear that snapshot.`;
  else $('offsideStatus').textContent=`${positionFlags.size} player${positionFlags.size===1?' is':'s are'} beyond the current offside line. Level or behind the ball is onside.`;
  if(showOffside&&Number.isFinite(offside.secondLastY)){
    const lineY=game.attack==='white'?Math.min(game.ball.y,offside.secondLastY,7):Math.max(game.ball.y,offside.secondLastY,7);
    addLine([{x:-.5,y:lineY},{x:W-.5,y:lineY}],'offside-line');
  }
  if(stage==='playing'&&game.restart?.type==='throwIn'){
    for(const [range,className]of [[5,'throw-safe'],[10,'throw-limit']]){
      const rect=document.createElementNS('http://www.w3.org/2000/svg','rect');rect.classList.add(className);rect.setAttribute('x',(game.ball.x-range)*100);rect.setAttribute('y',(game.ball.y-range)*100);rect.setAttribute('width',(range*2+1)*100);rect.setAttribute('height',(range*2+1)*100);document.querySelector('.pitch-markings').append(rect);
    }
  }
  if(shot){const model=shotModel(game,shot.x,shot.y);addLine([model.origin,model.target],'shot-path');}
  else if(showTrace&&action.from&&action.to&&(action.from.x!==action.to.x||action.from.y!==action.to.y))addLine(action.path||[action.from,action.to],'computer-action-path');
}
function resetKickDetails(){
  if(game.phase==='keeperReact'&&game.pendingShot){
    const shot=game.pendingShot;showShotModel(shotModel(game,shot.x,shot.y));
    $('kickDetails').textContent=game.mode==='watch'?`${TEAM[currentTeam(game)]} will ${keeperCanReact()?'choose a keeper reaction':'resolve the shot without a goalkeeper save'}. The shot’s scoring chance updates after that decision.`:keeperCanReact()?'Select a lit square to move the keeper, or hold position to resolve the shot.':'The king is outside its own box. Resolve the shot; no goalkeeper move or save is available.';
  }else{clearKeeperOverlay();$('kickDetails').textContent=game.mode==='watch'&&stage==='playing'?'Watching both computer teams. Each action plays at the selected pace; Pause holds the position.':game.restart&&stage==='playing'?restartGuide():stage==='setup'?'Move a player to find space · Dribble to carry the ball · Pass / shoot to send it.':kickPhase()&&stage==='playing'?'Pass / shoot: the player stays. OFF marks offside involvement. Long inaccurate balls may cross a boundary. Hover or focus to preview odds.':game.phase==='attackMove'?'Attack: one dribble + one off-ball move + one optional free pawn action, in any order. The dashed line previews offside.':'Defence: one regular move or tackle + one optional free pawn action. The dashed line previews offside.';}
}
function render(){
  if(stage!=='playing'||paused||anyDialog()||!isComputer())cancelAI();
  const acting=currentTeam(game),kicking=kickPhase(),positioning=positionPhase(),reacting=game.phase==='keeperReact',actions=positionActions(game),budget=actions.budget,watching=game.mode==='watch';
  if(stage==='playing'&&kicking)selectedId=game.ball.carrierId;
  if(stage==='playing'&&reacting)selectedId=game.pieces.find(p=>p.team===acting&&p.type==='K')?.id||null;
  if(positioning){
    const available=freePawnMode?actions.pawnAvailable:dribbleMode?actions.dribbleAvailable:actions.normalAvailable;
    if(!available)setMoveMode(actions.normalAvailable?'normal':actions.dribbleAvailable?'dribble':actions.pawnAvailable?'pawn':'normal');
    if(dribbleMode)selectedId=game.ball.carrierId;
  }
  $('setupPanel').hidden=stage!=='setup';$('turnPanel').hidden=stage==='setup';
  renderRestart();renderProgress();
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
  else if(isComputer()&&stage==='playing'){const name=watching?TEAM[acting]:'Obsidian',difficulty=computerDifficulty(acting);heading=watching?`${name} · ${reacting?'keeper reaction':'computer turn'}.`:reacting?'Computer’s keeper.':'Computer’s turn.';help=reacting?(keeperCanReact()?`${name} can move its keeper once before the shot is resolved.`:`${name}’s king is outside its own box. The shot resolves without a goalkeeper reaction.`):game.restart?restartGuide():difficulty==='tactical'?`${name} is planning ahead and considering ${watching?'its opponent’s':'your'} replies.`:kicking?`${name} is choosing a pass or shot.`:`${name} is choosing its remaining positioning actions.`;status=`${name} · ${difficulty==='tactical'?'Tactical':'Casual'} · thinking…`;}
  else if(reacting){heading=keeperCanReact()?'Position your keeper.':'Resolve the shot.';help=keeperCanReact()?'The shot is committed. Move your king one square, or hold position. The displayed scoring chance is then rolled.':'Your king is outside its own box, so it has no extra reaction or saving reach. Resolve the shot using the displayed chance.';status=`${TEAM[acting]} · ${keeperCanReact()?'keeper reaction':'shot resolution'}`;}
  else if(game.restart){heading=RESTART_NAMES[game.restart.type]+'.';help=restartGuide();status=`${TEAM[acting]} · ${RESTART_NAMES[game.restart.type]} · ${kicking?'take the restart':'positioning'}`;}
  else if(game.phase==='keeperRelease'){heading='King must release.';help='A teammate passed to the king. Choose an immediate kick; the king cannot move or hold this back-pass.';status=`${TEAM[acting]} · immediate keeper kick`;}
  else if(game.phase==='kickoff'){heading=game.mode==='solo'?'Your kickoff.':TEAM[acting]+' kicks off.';help='Choose a pass destination, or a lit goal cell to commit a shot.';status='Choose a pass to start play.';}
  else if(kicking){heading='Pass or shoot.';help='Only the carrier kicks; the player stays in place. Choose a blue pass / kick target or a gold goal cell. Shooting gives the defending king one reaction.';status=`${TEAM[acting]} · pass / shoot`;}
  else if(freePawnMode){heading=teamLabel(acting)+' free pawn.';help='Move one pawn that does not carry the ball, or collect a loose ball. One cardinal square; no dribble, tackle, or kick. You may skip it.';status=`${TEAM[acting]} · free pawn action`;}
  else {const ownCarrier=game.pieces.some(piece=>piece.id===game.ball.carrierId&&piece.team===acting);heading=teamLabel(acting)+(game.phase==='defendMove'?' response.':dribbleMode?' dribble.':' positioning.');help=ownCarrier?'Dribble once and move another player without the ball once, in either order. You also have a free pawn action for a pawn without the ball. End positioning to skip remaining actions.':game.ball.carrierId?'Move without the ball to defend, or attempt a highlighted tackle. Win possession before you can dribble; the opponent is carrying the ball.':'Move to collect the loose ball. After collecting, the attacking carrier can use a separate dribble if it remains available.';status=`${TEAM[acting]} · ${ownCarrier?'dribble + off-ball move':'off-ball positioning'}`;}
  if(stage==='setup')status=watching?'Computer vs computer · choose levels and start watching.':'Arrange 11 footballers or kick off.';
  $('turnTitle').textContent=heading;$('actionHelp').textContent=help;$('boardStatus').textContent=status;
  const activePhase=kicking?'kick':reacting?'defendMove':game.phase;
  for(const el of document.querySelectorAll('[data-phase]'))el.classList.toggle('active',el.dataset.phase===activePhase);
  $('attackPhaseText').innerHTML=game.restart?'Restart team positions<small>Off-ball move + free pawn</small>':'Dribble + off-ball move<small>Plus one free pawn action</small>';
  document.querySelector('.move-modes').hidden=watching||!positioning||stage!=='playing';
  const attackingRound=positioning&&game.phase==='attackMove'&&!game.restart;
  $('moveBudget').hidden=!positioning||stage!=='playing';$('moveBudget').textContent=`${attackingRound?'Off-ball move':'Regular action'}: ${budget.normalUsed?'used':'ready'}${attackingRound?` · Dribble: ${budget.dribbleUsed?'used':actions.dribbleAvailable?'ready':'unavailable'}`:''} · Free pawn: ${budget.pawnUsed?'used':'ready'}`;
  $('normalMoveBtn').disabled=blocked()||!actions.normalAvailable;$('pawnMoveBtn').disabled=blocked()||!actions.pawnAvailable;
  $('dribbleBtn').hidden=!attackingRound;$('dribbleBtn').disabled=blocked()||!actions.dribbleAvailable;document.querySelector('.move-modes').classList.toggle('has-dribble',attackingRound);
  $('normalMoveBtn').textContent=game.restart||attackingRound?'Off-ball move':'Move / tackle';
  $('normalMoveBtn').setAttribute('aria-pressed',String(!freePawnMode&&!dribbleMode));$('dribbleBtn').setAttribute('aria-pressed',String(dribbleMode));$('pawnMoveBtn').setAttribute('aria-pressed',String(freePawnMode));
  $('shotPanel').hidden=!reacting||stage!=='playing';
  if(reacting&&game.pendingShot)$('shotSummary').textContent=`Shot aimed at column ${FILES[game.pendingShot.x].toUpperCase()}. ${keeperCanReact()?`${TEAM[acting]} may move its king one square before resolution.`:'The defending king is outside its own box and has no goalkeeper reaction.'}`;
  $('skipBtn').hidden=watching||kicking||stage==='finished';$('skipBtn').disabled=blocked();$('skipBtn').textContent=reacting?(keeperCanReact()?'Hold keeper · resolve shot':'Resolve shot · king outside box'):'End positioning · skip unused →';
  $('pauseBtn').disabled=stage!=='playing';$('pauseBtn').textContent=paused?'▶ Resume':'Ⅱ Pause';$('finishBtn').disabled=stage!=='playing'||duration>0;$('finishBtn').title=duration>0?'Timed matches end after the clock and final chance settle.':'Finish this untimed match.';$('undoBtn').disabled=!history.length||stage!=='playing'||anyDialog();
  document.body.classList.toggle('thinking',stage==='playing'&&isComputer()&&!paused);document.body.classList.toggle('paused',paused&&stage==='playing');
  const carrier=game.pieces.find(p=>p.id===game.ball.carrierId);
  $('possessionTeam').textContent=reacting?'Shot in flight':carrier?TEAM[carrier.team]:'Loose ball';
  $('possessionDetail').textContent=reacting?`${TEAM[game.pendingShot.shootingTeam]} · keeper may respond`:carrier?`${pieceLabel(carrier)} · ${coord(carrier.x,carrier.y)}`:`Available to collect · ${coord(game.ball.x,game.ball.y)}`;
  const selected=game.pieces.find(p=>p.id===selectedId);
  $('selectionInfo').innerHTML=selected?`<span class="selection-icon">${SYMBOLS[selected.type]}</span><div><b>${pieceLabel(selected)} · ${coord(selected.x,selected.y)}</b><small>${stage==='setup'?'Choose a starting square.':reacting?'Keeper reaction':kicking?'Pass / shoot · player stays':selected.id===game.restart?.takerId?'Restart taker · stays put':`${selected.id===game.ball.carrierId?'Dribble':'Move without ball'} · ${legalMoves(game,selected.id,{freePawn:positioning&&freePawnMode}).length} destinations`}</small></div>`:watching&&stage==='playing'?`<span class="selection-icon">♞</span><div><b>Watching ${TEAM[acting]}</b><small>Both teams are controlled by the computer.</small></div>`:'<span class="selection-icon">♞</span><div><b>Select a footballer</b><small>Move off the ball, or select the carrier to dribble.</small></div>';
  renderActionContext(selected);
  $('journal').replaceChildren(...game.log.slice(-12).reverse().map(line=>{const li=document.createElement('li');li.textContent=line.replaceAll('White','Ivory').replaceAll('Black','Obsidian');return li;}));$('feedCount').textContent=String(game.log.length).padStart(2,'0');
  if(!storageOK)$('saveNote').textContent='Match saving is unavailable in this browser.';
  renderBoard();resetKickDetails();updateClock();scheduleAI();
}
function updateClock(){
  const seconds=Math.ceil(Math.max(0,remaining));
  $('clock').textContent=duration===0?'∞':`${Math.floor(seconds/60).toString().padStart(2,'0')}:${(seconds%60).toString().padStart(2,'0')}`;
  $('matchState').textContent=stage==='setup'?'PRE-MATCH':stage==='finished'?'FULL TIME':paused||anyDialog()?'PAUSED':fullTimePending?'STOPPAGE TIME':'LIVE';
  $('liveDot').classList.toggle('running',stage==='playing'&&!paused&&!anyDialog());
  $('actionClock').textContent=duration===0?'∞':`${Math.ceil(actionRemaining)}s`;
  $('actionDeadline').dataset.warning=String(duration>0&&(actionRemaining<=10||fullTimePending));
  $('actionClockInfo').textContent=duration===0?'No action limit.':stage==='finished'?'Match complete.':stage==='setup'?`${ACTION_SECONDS} seconds for each action in timed matches.`:paused||anyDialog()?'Action and match clocks are paused.':fullTimePending&&finalChance?`${TEAM[finalChance.team]} has the final attacking chance. Deadlines complete actions automatically.`:fullTimePending?'Finish this decision before full time; timing out concedes a final free-kick attack.':`${TEAM[currentTeam(game)]}: act within ${ACTION_SECONDS}s or concede an indirect free kick.${finalChance?' An awarded free kick and its following attack are protected at full time.':''}`;
}
function flushClockElapsed(){
  const now=Date.now(),elapsed=Math.max(0,(now-lastTick)/1000);lastTick=now;
  if(stage!=='playing'||paused||anyDialog()||duration===0)return false;
  restoreClock(tickMatchClock(clockSnapshot(),elapsed));
  return true;
}
function advanceClockNow(){
  if(!flushClockElapsed())return false;
  if(actionRemaining>0){updateClock();return false;}
  cancelAI();
  let next;
  if(fullTimePending&&finalChance){
    if(positionPhase()||game.phase==='keeperReact')next=skipMove(game);
    else{
      const action=chooseAIAction(game,{difficulty:'casual'});
      next=action?.type==='kick'?applyKick(game,action.x,action.y):skipMove(game);
    }
    toast('The action deadline expired; the final chance continues automatically.');
  }else next=actionTimeout(game);
  commit(next,{timedOut:true,clockAdvanced:true});
  return true;
}
function commit(next,{timedOut=false,clockAdvanced=false}={}){
  if(!clockAdvanced&&advanceClockNow())return;
  if(stage!=='playing'||paused||anyDialog())return;
  cancelAI();
  const before=game,actor=currentTeam(game),settled=settleMatchClock(clockSnapshot(),before,next,{timedOut,timed:duration>0,actionSeconds:ACTION_SECONDS});
  history.push({game:structuredClone(game),actor,clock:clockSnapshot()});if(history.length>80)history.shift();const oldScore=game.score.white+game.score.black;
  game=next;restoreClock(settled.clock);selectedId=null;freePawnMode=false;dribbleMode=false;lastTick=Date.now();
  lastComputerAction=isComputer(actor)?{actor,action:game.lastAction,summary:game.log.at(-1).replaceAll('White','Ivory').replaceAll('Black','Obsidian')}:null;
  if(game.score.white+game.score.black>oldScore)toast(`${TEAM[game.lastAction.team]} scores! ${game.score.white} : ${game.score.black}${game.lastAction.ownGoal?' · Own goal':''}`);
  else if(game.lastAction?.type==='stalling')toast(`Stalling: ${TEAM[game.restart.team]} wins an indirect free kick near the ball.`);
  else if(game.lastAction?.type==='timeout')toast(`Time wasting: ${TEAM[game.restart.team]} wins an indirect free kick near the ball.`);
  else if(game.restart)toast(`${RESTART_NAMES[game.restart.type]} for ${TEAM[game.restart.team]}. Position the teams, then restart.`);
  else if(game.lastAction?.type==='save')toast(`${TEAM[game.attack]} saves the shot and takes possession.`);
  else if(game.lastAction?.type==='miss')toast('The long pass missed its target. The ball is loose.');
  else if(game.lastAction?.type==='tackleMiss')toast('Tackle failed (50%). The knight keeps the ball; the regular move is used.');
  else if(game.lastAction?.type==='shotMiss')toast(`Shot wide. ${TEAM[game.attack]} has a goal kick.`);
  if(settled.finish){finishMatch();return;}
  render();save();if(lastComputerAction)animateComputerMove(lastComputerAction.action);
}
function animateComputerMove(action){
  if(!['move','tackle','tackleMiss'].includes(action?.type)||window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)return;
  const destination=squares[action.to.y*W+action.to.x],piece=destination?.querySelector('.piece');if(!piece?.animate)return;
  const size=destination.getBoundingClientRect().width,rotation=flipped?' rotate(180deg)':'';destination.classList.add('computer-animating');
  const animation=piece.animate([{transform:`translate(${(action.from.x-action.to.x)*size}px,${(action.from.y-action.to.y)*size}px)${rotation}`},{transform:`translate(0,0)${rotation}`}],{duration:550,easing:'cubic-bezier(.22,.61,.36,1)'});
  animation.finished.then(()=>destination.classList.remove('computer-animating')).catch(()=>destination.classList.remove('computer-animating'));
}
function scheduleAI(){
  if(stage!=='playing'||paused||anyDialog()||!isComputer()||aiTimer!==null||aiWorker)return;
  const requestId=aiGeneration,actor=currentTeam(game),difficulty=computerDifficulty(actor);
  const stillCurrent=()=>requestId===aiGeneration&&actor===currentTeam(game)&&stage==='playing'&&!paused&&!anyDialog()&&isComputer();
  const fail=err=>{if(!stillCurrent())return;stopAIWorker();paused=true;render();toast('Play paused: '+err.message);};
  const receive=action=>{
    if(!stillCurrent())return;stopAIWorker();
    try{if(!action)throw new Error('No legal action found.');if(action.type==='move')commit(applyMove(game,action.pieceId,action.x,action.y,{freePawn:!!action.freePawn}));else if(action.type==='kick')commit(applyKick(game,action.x,action.y));else commit(skipMove(game));}catch(err){fail(err);}
  };
  const fallback=(level=difficulty)=>{if(!stillCurrent())return;stopAIWorker();try{receive(chooseAIAction(game,{difficulty:level}));}catch(err){fail(err);}};
  aiTimer=setTimeout(()=>{
    aiTimer=null;if(!stillCurrent())return;
    if(difficulty==='tactical'&&typeof window.Worker==='function'){
      try{
        aiWorker=new window.Worker(new URL('./ai-worker.js?v=37b308f712f4',import.meta.url),{type:'module',name:'football-chess-tactical'});
        aiWorker.onmessage=event=>{if(!stillCurrent()||event.data?.requestId!==requestId)return;if(event.data.error)fallback();else receive(event.data.action);};
        aiWorker.onerror=event=>{event.preventDefault?.();fallback();};
        aiWatchdog=setTimeout(()=>fallback('casual'),4000);
        aiWorker.postMessage({requestId,state:game,difficulty});
      }catch{fallback();}
    }else fallback();
  },aiPace);
}
function drawPreview(x,y){
  document.querySelector('.trajectory')?.remove();if(blocked())return;
  const target=getTargets().find(t=>t.x===x&&t.y===y);if(!target){resetKickDetails();return;}
  if(target.type==='tackle'){const defender=game.pieces.find(piece=>piece.id===selectedId);$('kickDetails').textContent=`Tackle success: ${percent(target.tackleProbability ?? 1)}. ${defender?`${pieceLabel(defender)} reach: ${TACKLE_PATTERNS[defender.type]}. `:''}The defender moves to ${coord(x,y)}; a failed attempt uses the regular move and leaves the carrier with the ball.`;return;}
  if(game.phase==='keeperReact'&&game.pendingShot){const model=shotModel(game,game.pendingShot.x,game.pendingShot.y,{x,y});showShotModel(model,`scoring chance if keeper moves to ${coord(x,y)}`);$('kickDetails').textContent=`Keeper preview: ${coord(x,y)} · ${outcomeBreakdown(model)}`;return;}
  if(kickPhase()){
    if(target.offsideReason==='boxKnight'){clearKeeperOverlay();$('kickDetails').textContent=targetDescription(target);}
    else if(target.goal){const model=shotModel(game,x,y);addLine([model.origin,model.target],'trajectory');drawKeeperOverlay(model);$('kickDetails').textContent=`${targetDescription(target)} · ${shotGeometry(model)}. ${outcomeBreakdown(model)} before the keeper’s reaction.`;}
    else{clearKeeperOverlay();if(target.path)addLine(target.path,'trajectory');$('kickDetails').textContent=`${targetDescription(target)} · ${target.distance} squares · ${percent(target.accuracy)} ${accuracyLabel()} accuracy. ${target.distance>10?'An inaccurate landing can cross a boundary. ':''}The player stays in place.`;}
  }else $('kickDetails').textContent=`${targetDescription(target)}. ${stage==='setup'?'Formation only; no turn used.':freePawnMode?'Uses the free pawn action.':targetKind(target)==='dribble'?'Uses the separate dribble action; the off-ball allowance is independent.':'Uses the off-ball positioning action; passing and shooting happen later.'}`;
}
$('board').addEventListener('pointerover',event=>{const el=event.target.closest('.square');if(el)drawPreview(Number(el.dataset.x),Number(el.dataset.y));});
$('board').addEventListener('focusin',event=>{const el=event.target.closest('.square');if(el)drawPreview(Number(el.dataset.x),Number(el.dataset.y));});
$('board').addEventListener('pointerleave',()=>{document.querySelector('.trajectory')?.remove();resetKickDetails();});
$('board').addEventListener('click',event=>{
  const el=event.target.closest('.square');if(!el)return;const x=Number(el.dataset.x),y=Number(el.dataset.y),piece=game.pieces.find(p=>p.x===x&&p.y===y),target=getTargets().find(t=>t.x===x&&t.y===y);
  if(stage==='setup'){
    if(target&&selectedId){const selected=game.pieces.find(p=>p.id===selectedId);if(piece&&piece.id!==selected.id){piece.x=selected.x;piece.y=selected.y;}selected.x=x;selected.y=y;if(selected.id===game.ball.carrierId||piece?.id===game.ball.carrierId)game.ball={x,y,carrierId:selected.id};selectedId=null;save();render();return;}
    if(piece){selectedId=piece.id;if(game.mode==='solo'&&piece.team==='black')toast('Arrange Ivory FC, or choose two players to arrange both teams.');render();}return;
  }
  if(blocked()){if(paused)toast(game.mode==='watch'?'Resume the match to continue watching.':'Resume the match to play.');return;}
  try{
    if(target){if(kickPhase())commit(applyKick(game,x,y));else commit(applyMove(game,selectedId,x,y,{freePawn:positionPhase()&&freePawnMode}));return;}
    if(kickPhase()){toast(game.restart?.type==='throwIn'?'Choose a highlighted throw target within 10 squares. Throws cannot score directly.':'Choose a highlighted pass destination or a lit goal cell.');return;}
    if(game.phase==='keeperReact'){toast(keeperCanReact()?'Only the king may react to this shot. Choose a lit square or hold the keeper.':'The king is outside its own box and cannot react. Choose Resolve shot.');return;}
    if(piece&&piece.team===currentTeam(game)){
      if(freePawnMode&&(piece.type!=='P'||piece.id===game.ball.carrierId)){toast('Choose a pawn without the ball for the free action. A carrying pawn must use Dribble, once per attacking turn.');return;}
      if(!freePawnMode){const actions=positionActions(game),carrying=piece.id===game.ball.carrierId;
        if(carrying&&!actions.dribbleAvailable){toast(game.restart?'The restart taker must stay in place until the restart.':'The dribble is used or unavailable. Choose an off-ball player or a free pawn action.');return;}
        if(!carrying&&!actions.normalAvailable){toast('Your off-ball move is used. Choose Dribble or Free pawn if available.');return;}
        setMoveMode(carrying?'dribble':'normal');
      }
      selectedId=piece.id;render();
    }
    else if(piece)toast(`It is ${TEAM[currentTeam(game)]}’s move. Tackles against knights have a 50% success rate.`);
  }catch(err){toast(err.message);}
});
$('board').addEventListener('keydown',event=>{
  const el=event.target.closest('.square');if(!el)return;const dirs={ArrowUp:[0,-1],ArrowDown:[0,1],ArrowLeft:[-1,0],ArrowRight:[1,0]};
  if(event.key==='Escape'){selectedId=null;render();return;}if(!dirs[event.key])return;event.preventDefault();let[dx,dy]=dirs[event.key];if(flipped){dx=-dx;dy=-dy;}
  const x=Math.max(0,Math.min(W-1,Number(el.dataset.x)+dx)),y=Math.max(0,Math.min(H-1,Number(el.dataset.y)+dy));squares[y*W+x].focus();
});
for(const id of ['goalTop','goalBottom']){
  $(id).addEventListener('click',event=>{const el=event.target.closest('[data-goal-x]');if(!el||blocked()||el.disabled)return;const x=Number(el.dataset.goalX),y=Number(el.dataset.goalY);const kick=legalKicks(game).find(k=>k.goal&&k.x===x&&k.y===y);if(kick)commit(applyKick(game,x,y));});
  $(id).addEventListener('pointerover',event=>{const el=event.target.closest('[data-goal-x]');if(el)drawPreview(Number(el.dataset.goalX),Number(el.dataset.goalY));});
  $(id).addEventListener('focusin',event=>{const el=event.target.closest('[data-goal-x]');if(el)drawPreview(Number(el.dataset.goalX),Number(el.dataset.goalY));});
  $(id).addEventListener('pointerleave',()=>{document.querySelector('.trajectory')?.remove();resetKickDetails();});
}
function refreshSetup(){if(stage!=='setup')return;cancelAI();game=createGame({mode:$('mode').value,minutes:Number($('duration').value)||10,kickoff:$('kickoff').value});duration=Number($('duration').value);resetClock();selectedId=null;lastComputerAction=null;freePawnMode=false;dribbleMode=false;history=[];render();save();}
$('aiPace').addEventListener('change',()=>{const value=Number($('aiPace').value);aiPace=AI_PACES.includes(value)?value:3000;render();save();});
$('aiDifficulty').addEventListener('change',()=>{aiDifficulty=$('aiDifficulty').value==='tactical'?'tactical':'casual';$('aiDifficulty').value=aiDifficulty;render();save();});
$('whiteDifficulty').addEventListener('change',()=>{whiteDifficulty=$('whiteDifficulty').value==='tactical'?'tactical':'casual';$('whiteDifficulty').value=whiteDifficulty;render();save();});
for(const id of ['mode','kickoff'])$(id).addEventListener('change',refreshSetup);
$('duration').addEventListener('change',()=>{if(stage!=='setup')return;duration=Number($('duration').value);resetClock();game.minutes=duration||10;render();save();});
$('normalMoveBtn').addEventListener('click',()=>{if(blocked()||!positionActions(game).normalAvailable)return;setMoveMode('normal');selectedId=null;render();});
$('dribbleBtn').addEventListener('click',()=>{if(blocked()||!positionActions(game).dribbleAvailable)return;setMoveMode('dribble');selectedId=game.ball.carrierId;render();});
$('pawnMoveBtn').addEventListener('click',()=>{if(blocked()||!positionActions(game).pawnAvailable)return;setMoveMode('pawn');selectedId=null;render();});
$('startBtn').addEventListener('click',()=>{if(stage!=='setup')return;resetClock();stage='playing';paused=false;selectedId=null;render();save();});
$('skipBtn').addEventListener('click',()=>{if(!blocked())commit(skipMove(game));});
$('pauseBtn').addEventListener('click',()=>{if(stage!=='playing'||advanceClockNow())return;paused=!paused;lastTick=Date.now();render();save();});
$('undoBtn').addEventListener('click',()=>{if(!history.length||stage!=='playing'||anyDialog()||advanceClockNow())return;cancelAI();let entry=history.pop();if(game.mode==='solo')while(entry.actor!=='white'&&history.length)entry=history.pop();game=upgradeSavedGame(entry.game);if(game.mode==='watch')paused=true;restoreClock(rewindMatchClock(clockSnapshot(),entry.clock,{actionSeconds:ACTION_SECONDS}));selectedId=null;lastComputerAction=null;freePawnMode=false;dribbleMode=false;lastTick=Date.now();render();save();toast(game.mode==='watch'?'Last computer action undone. Press Resume to continue.':'Last move undone.');});
$('flipBtn').addEventListener('click',()=>{flipped=!flipped;render();save();});
function finishMatch(){if(stage!=='playing')return;cancelAI();stage='finished';paused=false;game.phase='finished';selectedId=null;render();save();showResult();}
function showResult(){const winner=game.score.white===game.score.black?null:game.score.white>game.score.black?'white':'black';$('resultTitle').textContent=winner?TEAM[winner]+' wins.':'Honours even.';$('resultScore').textContent=`${game.score.white} : ${game.score.black}`;$('resultText').textContent=winner?'A well-played match. The next move is a fresh start.':'Nothing between the sides. Settle it in a rematch.';$('resultDialog').showModal();}
$('finishBtn').addEventListener('click',()=>{if(stage==='playing'&&duration===0)finishMatch();});
function newMatch(){cancelAI();for(const dialog of document.querySelectorAll('dialog[open]'))dialog.close();stage='setup';paused=false;resetClock();selectedId=null;lastComputerAction=null;freePawnMode=false;dribbleMode=false;history=[];game=createGame({mode:game.mode,minutes:duration||10,kickoff:$('kickoff').value});render();save();}
$('newBtn').addEventListener('click',()=>{if(stage==='playing'){if(advanceClockNow())return;$('confirmDialog').showModal();cancelAI();updateClock();}else newMatch();});$('confirmNewBtn').addEventListener('click',newMatch);$('rematchBtn').addEventListener('click',newMatch);
function openRules(){advanceClockNow();$('rulesDialog').showModal();cancelAI();updateClock();}
$('rulesBtn').addEventListener('click',openRules);$('detailsBtn').addEventListener('click',openRules);
for(const el of document.querySelectorAll('[data-close]'))el.addEventListener('click',()=>$(el.dataset.close).close());
for(const dialog of document.querySelectorAll('dialog')){dialog.addEventListener('close',()=>{lastTick=Date.now();render();});dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();}});}
setInterval(()=>{advanceClockNow();},250);
setInterval(()=>{if(stage==='playing')save();},5000);window.addEventListener('pagehide',()=>{advanceClockNow();save();});
render();
if(stage==='playing'&&paused)toast('Your match is restored. Press Resume to continue.');
else if(legacyMatch)toast('The new 12×15 rules need a fresh match. Your opponent pace is retained.');
if(stage==='finished')showResult();
