import {createGame, legalMoves, legalKicks, applyMove, applyKick, skipMove, chooseAIAction, currentTeam, BOARD_WIDTH as W, BOARD_HEIGHT as H, GOAL_FILES, isBox, shotChance, shotModel, offsideInfo} from './engine.js?v=11c82d4f8cf0';

const $ = id => document.getElementById(id);
const NAMES = {K:'Goalkeeper',Q:'Queen',R:'Rook',B:'Bishop',N:'Knight',P:'Pawn'};
const SYMBOLS = {K:'♚',Q:'♛',R:'♜',B:'♝',N:'♞',P:'♟'};
const TEAM = {white:'Ivory FC',black:'Obsidian FC'};
const STORE = 'football-chess-match-v2';
const AI_PACES = [3000,1800,600];
const MOVE_PATTERNS={K:'One square in any direction',Q:'Up to 10 squares straight or diagonally',R:'Up to 10 squares horizontally or vertically',B:'Up to 10 squares diagonally',N:'One L-shaped jump over other pieces',P:'One square forward, back, left, or right'};
const KICK_PATTERNS={K:'Straight or diagonal kicks, like a queen',Q:'Straight or diagonal kicks',R:'Horizontal or vertical kicks',B:'Diagonal kicks',N:'One L-shaped kick over other pieces',P:'Forward, backward, left, or right kicks'};
const RESTART_NAMES={throwIn:'Throw-in',corner:'Corner kick',goalKick:'Goal kick',offside:'Indirect free kick'};
const FILES = 'abcdefghijkl';
const coord = (x,y) => `${FILES[x]}${H-y}`;
const percent = chance => `${Math.round(chance*100)}%`;
const shotPercent = chance => `${(chance*100).toFixed(1)}%`;
const kickPhase = () => ['kick','kickoff','keeperRelease'].includes(game.phase);
const positionPhase = () => ['attackMove','defendMove'].includes(game.phase);
const ballSVG = '<svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="18" fill="#fff9e9" stroke="#23372f" stroke-width="1"/><path d="M20 11l9 6-3 10H14l-3-10zM3 17l8 0M29 17l8 0M20 11V2M14 27l-5 8M26 27l5 8" fill="#25392e" stroke="#25392e" stroke-width="1.5"/></svg>';
let game = createGame();
let stage='setup',paused=false,remaining=600,duration=10,flipped=false;
let selectedId=null,history=[],aiTimer=null,toastTimer=null,lastTick=Date.now();
let storageOK=true,aiPace=3000,aiDifficulty='casual',lastComputerAction=null,freePawnMode=false,legacyMatch=false;
let aiWorker=null,aiWatchdog=null,aiGeneration=0;
try {
  const saved=JSON.parse(localStorage.getItem(STORE)||'null');
  if(saved?.version===2&&saved.game?.pieces?.length===22&&['setup','playing','finished'].includes(saved.stage)) {
    game=upgradeSavedGame(saved.game);stage=saved.stage;remaining=saved.remaining;duration=saved.duration;flipped=!!saved.flipped;
    paused=stage==='playing';history=Array.isArray(saved.history)?saved.history.slice(-80):[];
    aiPace=AI_PACES.includes(saved.aiPace)?saved.aiPace:3000;lastComputerAction=saved.lastComputerAction||null;
    aiDifficulty=saved.aiDifficulty==='tactical'?'tactical':'casual';
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
$('mode').value=game.mode==='local'?'local':'solo';$('duration').value=String(duration);$('kickoff').value=game.attack;$('aiPace').value=String(aiPace);
$('aiDifficulty').value=aiDifficulty;

function save(){try{localStorage.setItem(STORE,JSON.stringify({version:2,game,stage,paused,remaining,duration,flipped,aiPace,aiDifficulty,lastComputerAction,history:history.slice(-80)}));}catch{storageOK=false;$('saveNote').textContent='Match saving is unavailable in this browser.';}}
function toast(text){clearTimeout(toastTimer);$('toast').textContent=text;$('toast').classList.add('visible');toastTimer=setTimeout(()=>$('toast').classList.remove('visible'),3800);}
function isComputer(){return game.mode==='solo'&&currentTeam(game)==='black';}
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
  return selectedId?legalMoves(game,selectedId,{freePawn:positionPhase()&&freePawnMode}):[];
}
function upgradeSavedGame(state){
  state.restart??=null;state.offside??=null;
  if(state.phase==='keeperRelease'&&state.releaseReason==='goalKick'&&state.ball.carrierId){
    state.restart={type:'goalKick',team:state.attack,takerId:state.ball.carrierId,spot:{x:state.ball.x,y:state.ball.y},indirect:false};
    state.phase='attackMove';state.positionBudget={normalUsed:false,pawnUsed:false};state.releaseReason=null;
  }
  return state;
}
function isOffsideTarget(target){
  if(target.offside)return true;
  return (game.offside?.flaggedIds||[]).includes(selectedId)&&(target.type==='tackle'||(!game.ball.carrierId&&target.x===game.ball.x&&target.y===game.ball.y));
}
function accuracyLabel(){return game.restart?.type==='throwIn'?'throw':'pass';}
function restartGuide(){
  const restart=game.restart;if(!restart)return '';
  if(kickPhase())return restart.type==='throwIn'?'Throw along any straight or diagonal direction. Accurate through 5 squares, unpredictable beyond 5, maximum 10. No direct goal.':restart.indirect?'Take an indirect free kick. Pass or find space; a direct shot is not allowed.':'The positioning round is complete. Take the restart using the taker’s kicking pattern.';
  return 'Position the teams, then take the restart. The taker stays at the restart spot; the ball cannot be tackled before it is played.';
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
  if(isOffsideTarget(target))return `OFFSIDE warning at ${destination}: touching this ball awards the opponents an indirect free kick`;
  if(kind==='setup')return `Starting formation square ${destination}`;
  if(kind==='keeper')return `Keeper reaction to ${destination}`;
  if(kind==='tackle')return `Tackle landing at ${destination}, ${percent(target.tackleProbability??1)} tackle success`;
  if(kind==='dribble')return `Dribble to ${destination}, player and ball move together`;
  if(kind==='collect')return `Move to ${destination} and collect the loose ball`;
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
  for(const [id,active]of [['offBallAction',positionPhase()&&(!selected||!carrying)],['dribbleAction',positionPhase()&&!game.restart&&ownCarrier&&(!selected||carrying)],['kickAction',kicking]]){
    $(id).classList.toggle('active',stage==='playing'&&active);$(id).setAttribute('aria-current',stage==='playing'&&active?'true':'false');
  }
  $('kickAction').textContent=game.restart?.type==='throwIn'?'Throw-in':'Pass / shoot';
  let kind='offball',title='Move · dribble · pass / shoot',rule='Select a footballer to see its movement and kicking patterns. Moving a player and kicking the ball are separate actions.';
  if(stage==='finished'){title='Match complete';rule='Start a new match to choose your next action.';}
  else if(stage==='setup'){
    kind='setup';title=selected?'Arrange the formation':'Three ways to play';
    rule=selected?`${MOVE_PATTERNS[selected.type]}. With the ball: the same movement is a dribble. ${KICK_PATTERNS[selected.type]}. Setup placement follows the starting-formation rules.`:'Move without the ball to find space. Dribble to carry it. Pass or shoot to send the ball while the player stays.';
  }else if(reacting){kind='keeper';title='Keeper reaction';rule='The shot is already in flight. Move only the defending king one square, or hold. This extra reaction is separate from ordinary positioning.';}
  else if(game.restart){kind='pass';title=selected?.id===game.restart.takerId&&!kicking?'Restart taker · locked':RESTART_NAMES[game.restart.type];rule=restartGuide();}
  else if(kicking&&selected){kind='pass';title='Pass / shoot';rule=`${pieceLabel(selected)} stays at ${coord(selected.x,selected.y)}; only the ball travels. ${KICK_PATTERNS[selected.type]}.${selected.type==='N'?' A goal cell must be one L-shaped jump away to shoot. Knights enter both boxes and double their scoring chance, capped at 100%.':' Kicks can travel beyond 10 squares with reduced pass accuracy.'}`;}
  else if(selected){
    kind=carrying?'dribble':'offball';title=carrying?'Dribble with the ball':'Move without the ball';
    rule=`${carrying?'Player and ball move together.':'The ball stays in place unless this move collects it or wins a tackle.'} ${MOVE_PATTERNS[selected.type]}. ${selected.type==='N'?'Knights may enter both goal boxes. ':''}${freePawnMode?'Uses the free pawn action; no tackling.':'Uses your regular positioning action.'}`;
  }else if(positionPhase()){
    title=ownCarrier?'Move without ball / dribble':'Move without the ball';
    rule=ownCarrier?'Select a teammate to move off the ball, or the carrier to dribble. Use one regular action plus an optional free pawn action.':'Move a teammate off the ball, collect a loose ball, or try a highlighted tackle against an opposing carrier. You can dribble after winning possession.';
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
function shotGeometry(model){return `Shot ${model.distance.toFixed(1)} squares · Keeper ${model.keeperPathDistance.toFixed(1)} squares off path · ${model.keeperInBox?'Full box reach':'Reduced outside-box reach'}${model.saveProbability>0?` · Parry if stopped: ${percent(model.parryGivenSave)}`:''}${model.scoringMultiplier>1?` · Knight chip ×${model.scoringMultiplier} (100% cap)`:''}`;}
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
      const aimed=shot?.x===x&&shot?.y===y,canPreview=shot?aimed:previewShots.some(candidate=>candidate.x===x&&candidate.y===y);
      el.disabled=!kick;el.classList.toggle('available',!!kick);el.classList.toggle('shot-selected',aimed);el.classList.toggle('own-goal',!!kick&&kick.goal!==currentTeam(game));el.dataset.goalY=y;
      el.innerHTML=`<span class="goal-file">${FILES[x].toUpperCase()}</span><span class="goal-odds">${canPreview?percent(chance):'—'}</span>`;
      el.dataset.action='shot';
      const detail=canPreview?`Shoot at ${y===-1?'Obsidian':'Ivory'} goal, column ${FILES[x]}, ${percent(chance)} scoring chance ${shot?'with the keeper here':'before keeper reaction'}${kick&&kick.goal!==currentTeam(game)?', warning: own goal':''}`:`${y===-1?'Obsidian':'Ivory'} goal, column ${FILES[x]}, no legal shot from this position`;
      el.setAttribute('aria-label',detail+(aimed?', shot committed':'')+(!kick?', unavailable shot':''));el.title=detail;
    }
  }
  document.querySelector('.pitch-area').classList.toggle('flipped',flipped);
  const showOffside=stage==='playing'&&!shot&&game.ball.carrierId&&!exempt;
  $('offsideStatus').hidden=stage!=='playing';
  if(exempt)$('offsideStatus').textContent='No offside directly from this restart.';
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
    $('kickDetails').textContent='Select a lit square to move the keeper, or hold position to resolve the shot.';
  }else{clearKeeperOverlay();$('kickDetails').textContent=game.restart&&stage==='playing'?restartGuide():stage==='setup'?'Move a player to find space · Dribble to carry the ball · Pass / shoot to send it.':kickPhase()&&stage==='playing'?'Pass / shoot: the player stays. OFF marks offside involvement. Long inaccurate balls may cross a boundary. Hover or focus to preview odds.':'Positioning: move without the ball or dribble with it, plus one optional free pawn action. The dashed line previews offside at the next kick.';}
}
function render(){
  cancelAI();
  const acting=currentTeam(game),kicking=kickPhase(),positioning=positionPhase(),reacting=game.phase==='keeperReact',budget=game.positionBudget||{normalUsed:false,pawnUsed:false};
  if(stage==='playing'&&kicking)selectedId=game.ball.carrierId;
  if(stage==='playing'&&reacting)selectedId=game.pieces.find(p=>p.team===acting&&p.type==='K')?.id||null;
  if(positioning){if(budget.normalUsed&&!budget.pawnUsed)freePawnMode=true;else if(budget.pawnUsed&&!budget.normalUsed)freePawnMode=false;}
  $('setupPanel').hidden=stage!=='setup';$('turnPanel').hidden=stage==='setup';
  renderRestart();
  $('opponentControls').hidden=game.mode!=='solo';$('computerRecap').hidden=!lastComputerAction||game.mode!=='solo';$('computerActionText').textContent=lastComputerAction?.summary||'';
  $('difficultyHelp').textContent=aiDifficulty==='tactical'?'Plans ahead against your replies and weighs risky outcomes.':'Reacts to the current position with straightforward tactics.';
  $('whiteScore').textContent=game.score.white;$('blackScore').textContent=game.score.black;
  $('whiteSub').textContent=(game.mode==='solo'?'YOU':'PLAYER 1')+' · ATTACKING '+(flipped?'↓':'↑');$('blackSub').textContent=(game.mode==='solo'?'COMPUTER':'PLAYER 2')+' · ATTACKING '+(flipped?'↑':'↓');
  $('turnNumber').textContent=`POSSESSION ${String(game.turn).padStart(2,'0')}`;
  let heading,help,status;
  if(stage==='finished'){heading='Full time.';help='The final whistle has sounded. Start a new match to play again.';status='Full time. Thanks for playing.';}
  else if(paused){heading='Take a breath.';help='The match is paused. Resume when you’re ready.';status='Match paused.';}
  else if(isComputer()&&stage==='playing'){heading=reacting?'Computer’s keeper.':'Computer’s turn.';help=reacting?'Obsidian can move its keeper once before the shot is resolved.':aiDifficulty==='tactical'?'Obsidian is planning ahead and considering your replies.':kicking?'Obsidian is choosing a pass or shot.':'Obsidian is using its normal move and free pawn move.';status=`Obsidian · ${aiDifficulty==='tactical'?'Tactical':'Casual'} · thinking…`;}
  else if(reacting){heading='Position your keeper.';help='The shot is committed. Move your king one square, or hold position. The displayed scoring chance is then rolled.';status=`${TEAM[acting]} · keeper reaction`;}
  else if(game.restart){heading=RESTART_NAMES[game.restart.type]+'.';help=restartGuide();status=`${TEAM[acting]} · ${RESTART_NAMES[game.restart.type]} · ${kicking?'take the restart':'positioning'}`;}
  else if(game.phase==='keeperRelease'){heading='King must release.';help='A teammate passed to the king. Choose an immediate kick; the king cannot move or hold this back-pass.';status=`${TEAM[acting]} · immediate keeper kick`;}
  else if(game.phase==='kickoff'){heading=game.mode==='solo'?'Your kickoff.':TEAM[acting]+' kicks off.';help='Choose a pass destination, or a lit goal cell to commit a shot.';status='Choose a pass to start play.';}
  else if(kicking){heading='Pass or shoot.';help='Only the carrier kicks; the player stays in place. Choose a blue pass / kick target or a gold goal cell. Shooting gives the defending king one reaction.';status=`${TEAM[acting]} · pass / shoot`;}
  else if(freePawnMode){heading=teamLabel(acting)+' free pawn.';help='Move one pawn without the ball, dribble if it carries it, or collect a loose ball. One cardinal square; no tackle or kick. You may skip it.';status=`${TEAM[acting]} · free pawn action`;}
  else {const ownCarrier=game.pieces.some(piece=>piece.id===game.ball.carrierId&&piece.team===acting);heading=teamLabel(acting)+(game.phase==='defendMove'?' response.':' positioning.');help=ownCarrier?'Select a teammate to move without the ball, or the carrier to dribble. Both use the regular positioning action; passing and shooting happen in the kicking phase.':game.ball.carrierId?'Move without the ball to defend, or attempt a highlighted tackle. Win possession before you can dribble; the opponent is carrying the ball.':'Move to collect the loose ball. You have one regular positioning action and one free pawn action.';status=`${TEAM[acting]} · ${ownCarrier?'move / dribble':'off-ball positioning'}`;}
  if(stage==='setup')status='Arrange 11 footballers or kick off.';
  $('turnTitle').textContent=heading;$('actionHelp').textContent=help;$('boardStatus').textContent=status;
  const activePhase=kicking?'kick':reacting?'defendMove':game.phase;
  for(const el of document.querySelectorAll('[data-phase]'))el.classList.toggle('active',el.dataset.phase===activePhase);
  document.querySelector('.move-modes').hidden=!positioning||stage!=='playing';
  $('moveBudget').hidden=!positioning||stage!=='playing';$('moveBudget').textContent=`Regular action: ${budget.normalUsed?'used':'ready'} · Free pawn: ${budget.pawnUsed?'used':'ready'}`;
  $('normalMoveBtn').disabled=blocked()||budget.normalUsed;$('pawnMoveBtn').disabled=blocked()||budget.pawnUsed;
  $('normalMoveBtn').textContent=game.restart?'Off-ball move':'Move / dribble';
  $('normalMoveBtn').setAttribute('aria-pressed',String(!freePawnMode));$('pawnMoveBtn').setAttribute('aria-pressed',String(freePawnMode));
  $('shotPanel').hidden=!reacting||stage!=='playing';
  if(reacting&&game.pendingShot)$('shotSummary').textContent=`Shot aimed at column ${FILES[game.pendingShot.x].toUpperCase()}. ${TEAM[acting]} may move its king one square before resolution.`;
  $('skipBtn').hidden=kicking||stage==='finished';$('skipBtn').disabled=blocked();$('skipBtn').textContent=reacting?'Hold keeper · resolve shot':budget.normalUsed?'Skip free pawn · end turn':'End positioning turn →';
  $('pauseBtn').disabled=stage!=='playing';$('pauseBtn').textContent=paused?'▶ Resume':'Ⅱ Pause';$('finishBtn').disabled=stage!=='playing';$('undoBtn').disabled=!history.length||stage!=='playing'||anyDialog();
  document.body.classList.toggle('thinking',stage==='playing'&&isComputer()&&!paused);document.body.classList.toggle('paused',paused&&stage==='playing');
  const carrier=game.pieces.find(p=>p.id===game.ball.carrierId);
  $('possessionTeam').textContent=reacting?'Shot in flight':carrier?TEAM[carrier.team]:'Loose ball';
  $('possessionDetail').textContent=reacting?`${TEAM[game.pendingShot.shootingTeam]} · keeper may respond`:carrier?`${pieceLabel(carrier)} · ${coord(carrier.x,carrier.y)}`:`Available to collect · ${coord(game.ball.x,game.ball.y)}`;
  const selected=game.pieces.find(p=>p.id===selectedId);
  $('selectionInfo').innerHTML=selected?`<span class="selection-icon">${SYMBOLS[selected.type]}</span><div><b>${pieceLabel(selected)} · ${coord(selected.x,selected.y)}</b><small>${stage==='setup'?'Choose a starting square.':reacting?'Keeper reaction':kicking?'Pass / shoot · player stays':`${selected.id===game.ball.carrierId?'Dribble':'Move without ball'} · ${legalMoves(game,selected.id,{freePawn:positioning&&freePawnMode}).length} destinations`}</small></div>`:'<span class="selection-icon">♞</span><div><b>Select a footballer</b><small>Move off the ball, or select the carrier to dribble.</small></div>';
  renderActionContext(selected);
  $('journal').replaceChildren(...game.log.slice(-12).reverse().map(line=>{const li=document.createElement('li');li.textContent=line.replaceAll('White','Ivory').replaceAll('Black','Obsidian');return li;}));$('feedCount').textContent=String(game.log.length).padStart(2,'0');
  if(!storageOK)$('saveNote').textContent='Match saving is unavailable in this browser.';
  renderBoard();resetKickDetails();updateClock();scheduleAI();
}
function updateClock(){const seconds=Math.ceil(Math.max(0,remaining));$('clock').textContent=duration===0?'∞':`${Math.floor(seconds/60).toString().padStart(2,'0')}:${(seconds%60).toString().padStart(2,'0')}`;$('matchState').textContent=stage==='setup'?'PRE-MATCH':stage==='finished'?'FULL TIME':paused||anyDialog()?'PAUSED':'LIVE';$('liveDot').classList.toggle('running',stage==='playing'&&!paused&&!anyDialog());}
function commit(next){
  const actor=currentTeam(game);history.push({game:structuredClone(game),actor});if(history.length>80)history.shift();const oldScore=game.score.white+game.score.black;
  game=next;selectedId=null;freePawnMode=false;
  lastComputerAction=actor==='black'&&game.mode==='solo'?{action:game.lastAction,summary:game.log.at(-1).replaceAll('White','Ivory').replaceAll('Black','Obsidian')}:null;
  if(game.score.white+game.score.black>oldScore)toast(`${TEAM[game.lastAction.team]} scores! ${game.score.white} : ${game.score.black}${game.lastAction.ownGoal?' · Own goal':''}`);
  else if(game.restart)toast(`${RESTART_NAMES[game.restart.type]} for ${TEAM[game.restart.team]}. Position the teams, then restart.`);
  else if(game.lastAction?.type==='save')toast(`${TEAM[game.attack]} saves the shot and takes possession.`);
  else if(game.lastAction?.type==='miss')toast('The long pass missed its target. The ball is loose.');
  else if(game.lastAction?.type==='tackleMiss')toast('Tackle failed (50%). The knight keeps the ball; the regular move is used.');
  else if(game.lastAction?.type==='shotMiss')toast(`Shot wide. ${TEAM[game.attack]} has a goal kick.`);
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
  if(stage!=='playing'||paused||anyDialog()||!isComputer())return;
  const requestId=aiGeneration;
  const stillCurrent=()=>requestId===aiGeneration&&stage==='playing'&&!paused&&!anyDialog()&&isComputer();
  const fail=err=>{if(!stillCurrent())return;stopAIWorker();paused=true;render();toast('Play paused: '+err.message);};
  const receive=action=>{
    if(!stillCurrent())return;stopAIWorker();
    try{if(!action)throw new Error('No legal action found.');if(action.type==='move')commit(applyMove(game,action.pieceId,action.x,action.y,{freePawn:!!action.freePawn}));else if(action.type==='kick')commit(applyKick(game,action.x,action.y));else commit(skipMove(game));}catch(err){fail(err);}
  };
  const fallback=(difficulty=aiDifficulty)=>{if(!stillCurrent())return;stopAIWorker();try{receive(chooseAIAction(game,{difficulty}));}catch(err){fail(err);}};
  aiTimer=setTimeout(()=>{
    aiTimer=null;if(!stillCurrent())return;
    if(aiDifficulty==='tactical'&&typeof window.Worker==='function'){
      try{
        aiWorker=new window.Worker(new URL('./ai-worker.js?v=c5d3cccec881',import.meta.url),{type:'module',name:'football-chess-tactical'});
        aiWorker.onmessage=event=>{if(!stillCurrent()||event.data?.requestId!==requestId)return;if(event.data.error)fallback();else receive(event.data.action);};
        aiWorker.onerror=event=>{event.preventDefault?.();fallback();};
        aiWatchdog=setTimeout(()=>fallback('casual'),4000);
        aiWorker.postMessage({requestId,state:game,difficulty:aiDifficulty});
      }catch{fallback();}
    }else fallback();
  },aiPace);
}
function drawPreview(x,y){
  document.querySelector('.trajectory')?.remove();if(blocked())return;
  const target=getTargets().find(t=>t.x===x&&t.y===y);if(!target){resetKickDetails();return;}
  if(target.type==='tackle'){$('kickDetails').textContent=`Tackle success: ${percent(target.tackleProbability ?? 1)}. The defender moves to ${coord(x,y)}; a failed attempt uses the regular move and leaves the carrier with the ball.`;return;}
  if(game.phase==='keeperReact'&&game.pendingShot){const model=shotModel(game,game.pendingShot.x,game.pendingShot.y,{x,y});showShotModel(model,`scoring chance if keeper moves to ${coord(x,y)}`);$('kickDetails').textContent=`Keeper preview: ${coord(x,y)} · ${outcomeBreakdown(model)}`;return;}
  if(kickPhase()){
    if(target.goal){const model=shotModel(game,x,y);addLine([model.origin,model.target],'trajectory');drawKeeperOverlay(model);$('kickDetails').textContent=`${targetDescription(target)} · ${shotGeometry(model)}. ${outcomeBreakdown(model)} before the keeper’s reaction.`;}
    else{clearKeeperOverlay();if(target.path)addLine(target.path,'trajectory');$('kickDetails').textContent=`${targetDescription(target)} · ${target.distance} squares · ${percent(target.accuracy)} ${accuracyLabel()} accuracy. ${target.distance>10?'An inaccurate landing can cross a boundary. ':''}The player stays in place.`;}
  }else $('kickDetails').textContent=`${targetDescription(target)}. ${stage==='setup'?'Formation only; no turn used.':freePawnMode?'Uses the free pawn action.':'Uses the regular positioning action; passing and shooting happen later.'}`;
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
  if(blocked()){if(paused)toast('Resume the match to play.');return;}
  try{
    if(target){if(kickPhase())commit(applyKick(game,x,y));else commit(applyMove(game,selectedId,x,y,{freePawn:positionPhase()&&freePawnMode}));return;}
    if(kickPhase()){toast(game.restart?.type==='throwIn'?'Choose a highlighted throw target within 10 squares. Throws cannot score directly.':'Choose a highlighted pass destination or a lit goal cell.');return;}
    if(game.phase==='keeperReact'){toast('Only the king may react to this shot. Choose a lit square or hold the keeper.');return;}
    if(piece&&piece.team===currentTeam(game)){if(freePawnMode&&piece.type!=='P'){toast('Choose a pawn for the free action, or switch to Move / dribble.');return;}selectedId=piece.id;render();}
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
function refreshSetup(){cancelAI();game=createGame({mode:$('mode').value,minutes:Number($('duration').value)||10,kickoff:$('kickoff').value});duration=Number($('duration').value);remaining=duration*60;selectedId=null;lastComputerAction=null;freePawnMode=false;history=[];render();save();}
$('aiPace').addEventListener('change',()=>{const value=Number($('aiPace').value);aiPace=AI_PACES.includes(value)?value:3000;render();save();});
$('aiDifficulty').addEventListener('change',()=>{aiDifficulty=$('aiDifficulty').value==='tactical'?'tactical':'casual';$('aiDifficulty').value=aiDifficulty;render();save();});
for(const id of ['mode','kickoff'])$(id).addEventListener('change',refreshSetup);
$('duration').addEventListener('change',()=>{duration=Number($('duration').value);remaining=duration*60;game.minutes=duration||10;render();save();});
$('normalMoveBtn').addEventListener('click',()=>{if(blocked()||game.positionBudget?.normalUsed)return;freePawnMode=false;selectedId=null;render();});
$('pawnMoveBtn').addEventListener('click',()=>{if(blocked()||game.positionBudget?.pawnUsed)return;freePawnMode=true;selectedId=null;render();});
$('startBtn').addEventListener('click',()=>{stage='playing';paused=false;selectedId=null;lastTick=Date.now();render();save();});
$('skipBtn').addEventListener('click',()=>{if(!blocked())commit(skipMove(game));});
$('pauseBtn').addEventListener('click',()=>{if(stage!=='playing')return;paused=!paused;lastTick=Date.now();render();save();});
$('undoBtn').addEventListener('click',()=>{if(!history.length||stage!=='playing')return;cancelAI();let entry=history.pop();if(game.mode==='solo')while(entry.actor!=='white'&&history.length)entry=history.pop();game=upgradeSavedGame(entry.game);selectedId=null;lastComputerAction=null;freePawnMode=false;render();save();toast('Last move undone.');});
$('flipBtn').addEventListener('click',()=>{flipped=!flipped;render();save();});
function finishMatch(){if(stage!=='playing')return;cancelAI();stage='finished';paused=false;game.phase='finished';selectedId=null;render();save();showResult();}
function showResult(){const winner=game.score.white===game.score.black?null:game.score.white>game.score.black?'white':'black';$('resultTitle').textContent=winner?TEAM[winner]+' wins.':'Honours even.';$('resultScore').textContent=`${game.score.white} : ${game.score.black}`;$('resultText').textContent=winner?'A well-played match. The next move is a fresh start.':'Nothing between the sides. Settle it in a rematch.';$('resultDialog').showModal();}
$('finishBtn').addEventListener('click',finishMatch);
function newMatch(){cancelAI();for(const dialog of document.querySelectorAll('dialog[open]'))dialog.close();stage='setup';paused=false;remaining=duration*60;selectedId=null;lastComputerAction=null;freePawnMode=false;history=[];game=createGame({mode:game.mode,minutes:duration||10,kickoff:$('kickoff').value});lastTick=Date.now();render();save();}
$('newBtn').addEventListener('click',()=>{if(stage==='playing'){$('confirmDialog').showModal();cancelAI();updateClock();}else newMatch();});$('confirmNewBtn').addEventListener('click',newMatch);$('rematchBtn').addEventListener('click',newMatch);
function openRules(){$('rulesDialog').showModal();cancelAI();updateClock();}
$('rulesBtn').addEventListener('click',openRules);$('detailsBtn').addEventListener('click',openRules);
for(const el of document.querySelectorAll('[data-close]'))el.addEventListener('click',()=>$(el.dataset.close).close());
for(const dialog of document.querySelectorAll('dialog')){dialog.addEventListener('close',()=>{lastTick=Date.now();render();});dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();}});}
setInterval(()=>{const now=Date.now(),elapsed=(now-lastTick)/1000;lastTick=now;if(stage==='playing'&&!paused&&!anyDialog()&&duration>0){remaining=Math.max(0,remaining-elapsed);updateClock();if(remaining<=0)finishMatch();}},250);
setInterval(()=>{if(stage==='playing')save();},5000);window.addEventListener('pagehide',save);
render();
if(stage==='playing'&&paused)toast('Your match is restored. Press Resume to continue.');
else if(legacyMatch)toast('The new 12×15 rules need a fresh match. Your opponent pace is retained.');
if(stage==='finished')showResult();
