import {createGame, legalMoves, legalKicks, applyMove, applyKick, skipMove, chooseAIAction, currentTeam, BOARD_WIDTH as W, BOARD_HEIGHT as H, GOAL_FILES, isBox, shotChance} from './engine.js';

const $ = id => document.getElementById(id);
const NAMES = {K:'Goalkeeper',Q:'Queen',R:'Rook',B:'Bishop',N:'Knight',P:'Pawn'};
const SYMBOLS = {K:'♚',Q:'♛',R:'♜',B:'♝',N:'♞',P:'♟'};
const TEAM = {white:'Ivory FC',black:'Obsidian FC'};
const STORE = 'football-chess-match-v2';
const AI_PACES = [3000,1800,600];
const FILES = 'abcdefghijkl';
const coord = (x,y) => `${FILES[x]}${H-y}`;
const percent = chance => `${Math.round(chance*100)}%`;
const kickPhase = () => ['kick','kickoff','keeperRelease'].includes(game.phase);
const positionPhase = () => ['attackMove','defendMove'].includes(game.phase);
const ballSVG = '<svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="18" fill="#fff9e9" stroke="#23372f" stroke-width="1"/><path d="M20 11l9 6-3 10H14l-3-10zM3 17l8 0M29 17l8 0M20 11V2M14 27l-5 8M26 27l5 8" fill="#25392e" stroke="#25392e" stroke-width="1.5"/></svg>';
let game = createGame();
let stage='setup',paused=false,remaining=600,duration=10,flipped=false;
let selectedId=null,history=[],aiTimer=null,toastTimer=null,lastTick=Date.now();
let storageOK=true,aiPace=3000,lastComputerAction=null,freePawnMode=false,legacyMatch=false;
try {
  const saved=JSON.parse(localStorage.getItem(STORE)||'null');
  if(saved?.version===2&&saved.game?.pieces?.length===22&&['setup','playing','finished'].includes(saved.stage)) {
    game=saved.game;stage=saved.stage;remaining=saved.remaining;duration=saved.duration;flipped=!!saved.flipped;
    paused=stage==='playing';history=Array.isArray(saved.history)?saved.history.slice(-80):[];
    aiPace=AI_PACES.includes(saved.aiPace)?saved.aiPace:3000;lastComputerAction=saved.lastComputerAction||null;
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

function save(){try{localStorage.setItem(STORE,JSON.stringify({version:2,game,stage,paused,remaining,duration,flipped,aiPace,lastComputerAction,history:history.slice(-80)}));}catch{storageOK=false;$('saveNote').textContent='Match saving is unavailable in this browser.';}}
function toast(text){clearTimeout(toastTimer);$('toast').textContent=text;$('toast').classList.add('visible');toastTimer=setTimeout(()=>$('toast').classList.remove('visible'),3800);}
function isComputer(){return game.mode==='solo'&&currentTeam(game)==='black';}
function anyDialog(){return !!document.querySelector('dialog[open]');}
function blocked(){return stage!=='playing'||paused||anyDialog()||isComputer();}
function cancelAI(){clearTimeout(aiTimer);aiTimer=null;}
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
    if(ownHalf&&(piece.type==='K'?isBox(x,y):!isBox(x,y)))moves.push({x,y,type:'move'});
  }
  return moves;
}
function getTargets(){
  if(stage==='setup')return setupMoves(game.pieces.find(p=>p.id===selectedId));
  if(blocked())return [];
  if(kickPhase())return legalKicks(game);
  return selectedId?legalMoves(game,selectedId,{freePawn:positionPhase()&&freePawnMode}):[];
}
function addLine(points,className){
  const line=document.createElementNS('http://www.w3.org/2000/svg','polyline');line.classList.add(className);
  line.setAttribute('points',points.map(p=>`${p.x*100+50},${p.y*100+50}`).join(' '));
  document.querySelector('.pitch-markings').append(line);
}
function renderBoard(){
  for(const line of document.querySelectorAll('.trajectory,.computer-action-path,.shot-path'))line.remove();
  const targets=getTargets(),action=lastComputerAction?.action;
  const showTrace=action&&!['goal','shotAttempt'].includes(action.type);
  const shot=game.phase==='keeperReact'?game.pendingShot:null;
  for(const el of squares){
    const x=Number(el.dataset.x),y=Number(el.dataset.y),piece=game.pieces.find(p=>p.x===x&&p.y===y),target=targets.find(t=>t.x===x&&t.y===y);
    const last=game.lastAction?.to,isSelected=piece?.id===selectedId,hasBall=game.ball.x===x&&game.ball.y===y;
    el.className=['square',(x+y)%2?'checker':'',isBox(x,y)?'box':'',y===7&&(x===5||x===6)?'kickoff':'',isSelected?'selected':'',last?.x===x&&last?.y===y?'last-move':'',target?'legal':'',target?.type==='tackle'?'tackle':'',showTrace&&action.from?.x===x&&action.from?.y===y?'computer-from':'',showTrace&&action.to?.x===x&&action.to?.y===y?'computer-to':''].filter(Boolean).join(' ');
    el.setAttribute('aria-selected',String(isSelected));
    let label=coord(x,y)+(piece?`, ${TEAM[piece.team]} ${pieceLabel(piece)}`:', empty');
    if(hasBall)label+=', ball';if(target)label+=target.type==='tackle'?`, tackle landing, ${percent(target.tackleProbability ?? 1)} tackle success`:target.label?`, ${target.label}`:', legal move';
    if(target?.accuracy!==undefined)label+=`, ${percent(target.accuracy)} pass accuracy`;
    if(shot&&target)label+=`, opponent scoring chance ${percent(shotChance(game,shot.x,shot.y,{x,y}))} after this keeper move`;
    el.setAttribute('aria-label',label);el.title=label;
    el.innerHTML=piece?`<span class="piece ${piece.team}"><span>${SYMBOLS[piece.type]}</span>${hasBall?`<span class="ball">${ballSVG}</span>`:''}</span>`:hasBall?`<span class="ball loose">${ballSVG}</span>`:'';
    if(target?.accuracy<1)el.insertAdjacentHTML('beforeend',`<span class="accuracy-badge">${percent(target.accuracy)}</span>`);
    if(target?.type==='tackle'&&target.tackleProbability<1)el.insertAdjacentHTML('beforeend',`<span class="accuracy-badge tackle-chance">${percent(target.tackleProbability)}</span>`);
    if(shot&&target)el.insertAdjacentHTML('beforeend',`<span class="accuracy-badge keeper-chance">${percent(shotChance(game,shot.x,shot.y,{x,y}))}</span>`);
  }
  const topY=flipped?H:-1,bottomY=flipped?-1:H;
  for(const [id,y] of [['goalTop',topY],['goalBottom',bottomY]]){
    $(id).style.flexDirection=flipped?'row-reverse':'row';
    $(id).setAttribute('aria-label',`${y===-1?'Obsidian':'Ivory'} goal: choose a target`);
    for(const el of $(id).querySelectorAll('[data-goal-x]')){
      const x=Number(el.dataset.goalX),kick=targets.find(t=>t.x===x&&t.y===y&&t.goal),chance=shotChance(game,x,y);
      const aimed=shot?.x===x&&shot?.y===y;
      el.disabled=!kick;el.classList.toggle('available',!!kick);el.classList.toggle('shot-selected',aimed);el.dataset.goalY=y;
      el.innerHTML=`<span class="goal-file">${FILES[x].toUpperCase()}</span><span class="goal-odds">${percent(chance)}</span>`;
      const detail=`${y===-1?'Obsidian':'Ivory'} goal, column ${FILES[x]}, ${percent(chance)} scoring chance before keeper reaction`;
      el.setAttribute('aria-label',detail+(aimed?', shot committed':'')+(!kick?', unavailable shot':''));el.title=detail;
    }
  }
  document.querySelector('.pitch-area').classList.toggle('flipped',flipped);
  if(shot?.path)addLine(shot.path,'shot-path');
  else if(showTrace&&action.from&&action.to&&(action.from.x!==action.to.x||action.from.y!==action.to.y))addLine(action.path||[action.from,action.to],'computer-action-path');
}
function resetKickDetails(){
  if(game.phase==='keeperReact'&&game.pendingShot){
    const shot=game.pendingShot,chance=shotChance(game,shot.x,shot.y);
    $('shotOdds').textContent=`${percent(chance)} chance to score with the keeper here`;
    $('kickDetails').textContent='Select a lit square to move the keeper, or hold position to resolve the shot.';
  }else $('kickDetails').textContent=kickPhase()&&stage==='playing'?'Passes up to 10 squares: 100%. Longer passes lose 10 percentage points per extra square. Goal odds update after the keeper’s reaction.':'Each positioning turn: one normal move + one optional free pawn move.';
}
function render(){
  cancelAI();
  const acting=currentTeam(game),kicking=kickPhase(),positioning=positionPhase(),reacting=game.phase==='keeperReact',budget=game.positionBudget||{normalUsed:false,pawnUsed:false};
  if(stage==='playing'&&kicking)selectedId=game.ball.carrierId;
  if(stage==='playing'&&reacting)selectedId=game.pieces.find(p=>p.team===acting&&p.type==='K')?.id||null;
  if(positioning){if(budget.normalUsed&&!budget.pawnUsed)freePawnMode=true;else if(budget.pawnUsed&&!budget.normalUsed)freePawnMode=false;}
  $('setupPanel').hidden=stage!=='setup';$('turnPanel').hidden=stage==='setup';
  $('opponentControls').hidden=game.mode!=='solo';$('computerRecap').hidden=!lastComputerAction||game.mode!=='solo';$('computerActionText').textContent=lastComputerAction?.summary||'';
  $('whiteScore').textContent=game.score.white;$('blackScore').textContent=game.score.black;
  $('whiteSub').textContent=(game.mode==='solo'?'YOU':'PLAYER 1')+' · ATTACKING '+(flipped?'↓':'↑');$('blackSub').textContent=(game.mode==='solo'?'COMPUTER':'PLAYER 2')+' · ATTACKING '+(flipped?'↑':'↓');
  $('turnNumber').textContent=`POSSESSION ${String(game.turn).padStart(2,'0')}`;
  let heading,help,status;
  if(stage==='finished'){heading='Full time.';help='The final whistle has sounded. Start a new match to play again.';status='Full time. Thanks for playing.';}
  else if(paused){heading='Take a breath.';help='The match is paused. Resume when you’re ready.';status='Match paused.';}
  else if(isComputer()&&stage==='playing'){heading=reacting?'Computer’s keeper.':'Computer’s turn.';help=reacting?'Obsidian can move its keeper once before the shot is resolved.':kicking?'Obsidian is choosing a pass or shot.':'Obsidian is using its normal move and free pawn move.';status='Obsidian is thinking…';}
  else if(reacting){heading='Position your keeper.';help='The shot is committed. Move your king one square, or hold position. The displayed scoring chance is then rolled.';status=`${TEAM[acting]} · keeper reaction`;}
  else if(game.phase==='keeperRelease'){heading='King must release.';help='A teammate passed to the king. Choose an immediate kick; the king cannot move or hold this back-pass.';status=`${TEAM[acting]} · immediate keeper kick`;}
  else if(game.phase==='kickoff'){heading=game.mode==='solo'?'Your kickoff.':TEAM[acting]+' kicks off.';help='Choose a pass destination, or a lit goal cell to commit a shot.';status='Choose a pass to start play.';}
  else if(kicking){heading=teamLabel(acting)+' kick.';help='Choose a lit square to pass, or one of the four goal cells to shoot. The defending king gets one reaction move.';status=`${TEAM[acting]} · play the ball`;}
  else if(freePawnMode){heading=teamLabel(acting)+' free pawn.';help='Reposition one pawn by one square forward, back, left, or right. The bonus cannot tackle. You may skip it.';status=`${TEAM[acting]} · free pawn reposition`;}
  else {heading=teamLabel(acting)+(game.phase==='defendMove'?' response.':' move.');help=game.ball.carrierId?'Move one footballer up to 10 squares. You also have a free one-square pawn reposition. Knights jump with the ball; tackles against them succeed 50% of the time.':'Collect the loose ball. You have one normal move and one free pawn reposition.';status=`${TEAM[acting]} · ${game.phase==='defendMove'?'defence responds':'build the attack'}`;}
  if(stage==='setup')status='Arrange 11 footballers or kick off.';
  $('turnTitle').textContent=heading;$('actionHelp').textContent=help;$('boardStatus').textContent=status;
  const activePhase=kicking?'kick':reacting?'defendMove':game.phase;
  for(const el of document.querySelectorAll('[data-phase]'))el.classList.toggle('active',el.dataset.phase===activePhase);
  document.querySelector('.move-modes').hidden=!positioning||stage!=='playing';
  $('moveBudget').hidden=!positioning||stage!=='playing';$('moveBudget').textContent=`Normal move: ${budget.normalUsed?'used':'ready'} · Free pawn: ${budget.pawnUsed?'used':'ready'}`;
  $('normalMoveBtn').disabled=blocked()||budget.normalUsed;$('pawnMoveBtn').disabled=blocked()||budget.pawnUsed;
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
  $('selectionInfo').innerHTML=selected?`<span class="selection-icon">${SYMBOLS[selected.type]}</span><div><b>${pieceLabel(selected)} · ${coord(selected.x,selected.y)}</b><small>${stage==='setup'?'Choose a starting square.':kicking?'Choose a pass or a shot.':`${legalMoves(game,selected.id,{freePawn:positioning&&freePawnMode}).length} legal destinations`}</small></div>`:'<span class="selection-icon">♞</span><div><b>Select a footballer</b><small>Legal moves light up on the pitch.</small></div>';
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
  else if(game.lastAction?.type==='save')toast(`${TEAM[game.attack]} saves the shot and takes possession.`);
  else if(game.lastAction?.type==='miss')toast('The long pass missed its target. The ball is loose.');
  else if(game.lastAction?.type==='tackleMiss')toast('Tackle failed (50%). The knight keeps the ball; the regular move is used.');
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
  aiTimer=setTimeout(()=>{aiTimer=null;if(stage!=='playing'||paused||anyDialog()||!isComputer())return;
    try{const action=chooseAIAction(game);if(!action)throw new Error('No legal action found.');if(action.type==='move')commit(applyMove(game,action.pieceId,action.x,action.y,{freePawn:!!action.freePawn}));else if(action.type==='kick')commit(applyKick(game,action.x,action.y));else commit(skipMove(game));}
    catch(err){paused=true;render();toast('Play paused: '+err.message);}
  },aiPace);
}
function drawPreview(x,y){
  document.querySelector('.trajectory')?.remove();if(blocked())return;
  const target=getTargets().find(t=>t.x===x&&t.y===y);if(!target){resetKickDetails();return;}
  if(target.type==='tackle'){$('kickDetails').textContent=`Tackle success: ${percent(target.tackleProbability ?? 1)}. The defender moves to ${coord(x,y)}; a failed attempt uses the regular move and leaves the carrier with the ball.`;return;}
  if(game.phase==='keeperReact'&&game.pendingShot){const chance=shotChance(game,game.pendingShot.x,game.pendingShot.y,{x,y});$('shotOdds').textContent=`${percent(chance)} scoring chance if keeper moves to ${coord(x,y)}`;$('kickDetails').textContent=`Keeper preview: ${coord(x,y)} · opponent scores with ${percent(chance)} probability.`;return;}
  if(kickPhase()){if(target.path)addLine(target.path,'trajectory');$('kickDetails').textContent=target.goal?`Aim at ${FILES[x].toUpperCase()}: ${percent(shotChance(game,x,y))} before the keeper’s reaction.`:`Pass to ${coord(x,y)} · ${target.distance} squares · ${percent(target.accuracy)} accuracy.`;}
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
    if(kickPhase()){toast('Choose a highlighted pass destination or a lit goal cell.');return;}
    if(game.phase==='keeperReact'){toast('Only the king may react to this shot. Choose a lit square or hold the keeper.');return;}
    if(piece&&piece.team===currentTeam(game)){if(freePawnMode&&piece.type!=='P'){toast('Choose a pawn for the free reposition, or switch to Regular move.');return;}selectedId=piece.id;render();}
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
}
function refreshSetup(){cancelAI();game=createGame({mode:$('mode').value,minutes:Number($('duration').value)||10,kickoff:$('kickoff').value});duration=Number($('duration').value);remaining=duration*60;selectedId=null;lastComputerAction=null;freePawnMode=false;history=[];render();save();}
$('aiPace').addEventListener('change',()=>{const value=Number($('aiPace').value);aiPace=AI_PACES.includes(value)?value:3000;render();save();});
for(const id of ['mode','kickoff'])$(id).addEventListener('change',refreshSetup);
$('duration').addEventListener('change',()=>{duration=Number($('duration').value);remaining=duration*60;game.minutes=duration||10;render();save();});
$('normalMoveBtn').addEventListener('click',()=>{if(blocked()||game.positionBudget?.normalUsed)return;freePawnMode=false;selectedId=null;render();});
$('pawnMoveBtn').addEventListener('click',()=>{if(blocked()||game.positionBudget?.pawnUsed)return;freePawnMode=true;selectedId=null;render();});
$('startBtn').addEventListener('click',()=>{stage='playing';paused=false;selectedId=null;lastTick=Date.now();render();save();});
$('skipBtn').addEventListener('click',()=>{if(!blocked())commit(skipMove(game));});
$('pauseBtn').addEventListener('click',()=>{if(stage!=='playing')return;paused=!paused;lastTick=Date.now();render();save();});
$('undoBtn').addEventListener('click',()=>{if(!history.length||stage!=='playing')return;cancelAI();let entry=history.pop();if(game.mode==='solo')while(entry.actor!=='white'&&history.length)entry=history.pop();game=entry.game;selectedId=null;lastComputerAction=null;freePawnMode=false;render();save();toast('Last move undone.');});
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
