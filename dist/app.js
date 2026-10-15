import {createGame, legalMoves, legalKicks, applyMove, applyKick, skipMove, chooseAIAction, currentTeam} from './engine.js';

const $ = id => document.getElementById(id);
const NAMES = {K:'Goalkeeper',Q:'Queen',R:'Rook',B:'Bishop',N:'Knight',P:'Pawn'};
const SYMBOLS = {K:'♚',Q:'♛',R:'♜',B:'♝',N:'♞',P:'♟'};
const TEAM = {white:'Ivory FC',black:'Obsidian FC'};
const STORE = 'football-chess-match-v1';
const coord = (x,y) => `${'abcdefgh'[x]}${11-y}`;
const isBox = (x,y) => (x===3||x===4)&&(y<2||y>8);
const ballSVG = '<svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="18" fill="#fff9e9" stroke="#23372f" stroke-width="1"/><path d="M20 11l9 6-3 10H14l-3-10zM3 17l8 0M29 17l8 0M20 11V2M14 27l-5 8M26 27l5 8" fill="#25392e" stroke="#25392e" stroke-width="1.5"/></svg>';
let game = createGame();
let stage = 'setup', paused = false, remaining = 600, duration = 10, flipped = false;
let selectedId = null, history = [], aiTimer = null, toastTimer = null, lastTick = Date.now();
let storageOK = true;
try {
  const saved = JSON.parse(localStorage.getItem(STORE)||'null');
  if (saved && saved.version===1 && saved.game?.pieces?.length===12 && ['setup','playing','finished'].includes(saved.stage)) {
    game = saved.game; stage = saved.stage; remaining = saved.remaining;
    duration = saved.duration; flipped = !!saved.flipped;
    paused = stage==='playing'; history = Array.isArray(saved.history)?saved.history.slice(-80):[];
  }
} catch { storageOK = false; }

const squares=[];
for (let y=0;y<11;y++) for (let x=0;x<8;x++) {
  const button=document.createElement('button');
  button.type='button';button.dataset.x=x;button.dataset.y=y;button.setAttribute('role','gridcell');
  $('board').append(button); squares.push(button);
}
$('ranks').innerHTML=Array.from({length:11},(_,i)=>`<span>${11-i}</span>`).join('');
$('mode').value=game.mode==='local'?'local':'solo';
$('duration').value=String(duration);
$('kickoff').value=game.attack;

function save() {
  try {localStorage.setItem(STORE,JSON.stringify({version:1,game,stage,paused,remaining,duration,flipped,history:history.slice(-80)}));}
  catch {storageOK=false;$('saveNote').textContent='Match saving is unavailable in this browser.';}
}
function toast(text) {
  clearTimeout(toastTimer);$('toast').textContent=text;$('toast').classList.add('visible');
  toastTimer=setTimeout(()=>$('toast').classList.remove('visible'),3200);
}
function isComputer() {return game.mode==='solo'&&currentTeam(game)==='black';}
function blocked() {return stage!=='playing'||paused||anyDialog()||isComputer();}
function anyDialog() {return !!document.querySelector('dialog[open]');}
function cancelAI(){clearTimeout(aiTimer);aiTimer=null;}
function teamLabel(team) {return game.mode==='solo'?(team==='white'?'Your':'Computer’s'):TEAM[team]+'’s';}

function setupMoves(piece) {
  if(!piece||(game.mode==='solo'&&piece.team==='black'))return [];
  const moves=[];
  const isCarrier=game.ball.carrierId===piece.id;
  for(let y=0;y<11;y++)for(let x=0;x<8;x++) {
    const occupant=game.pieces.find(p=>p.x===x&&p.y===y);
    if(isCarrier){if(y===5&&(x===3||x===4)&&(!occupant||occupant.id===piece.id))moves.push({x,y,type:'move'});continue;}
    if(piece.team===game.attack&&piece.type!=='K'&&y===5&&occupant?.id===game.ball.carrierId){moves.push({x,y,type:'move'});continue;}
    if(occupant)continue;
    const ownHalf=piece.team==='white'?y>=6:y<=4;
    const valid=piece.type==='K'?isBox(x,y):!isBox(x,y);
    if(ownHalf&&valid)moves.push({x,y,type:'move'});
  }
  return moves;
}
function getTargets() {
  if(stage==='setup')return setupMoves(game.pieces.find(p=>p.id===selectedId));
  if(blocked())return [];
  if(game.phase==='kick'||game.phase==='kickoff')return legalKicks(game);
  return selectedId?legalMoves(game,selectedId):[];
}

function renderBoard() {
  document.querySelector('.trajectory')?.remove();
  const targets=getTargets();
  for(const el of squares) {
    const x=Number(el.dataset.x),y=Number(el.dataset.y);
    const piece=game.pieces.find(p=>p.x===x&&p.y===y);
    const target=targets.find(t=>t.x===x&&t.y===y);
    const last=game.lastAction?.to;
    const isSelected=piece?.id===selectedId;
    el.className=['square',(x+y)%2?'checker':'',isBox(x,y)?'box':'',y===5&&(x===3||x===4)?'kickoff':'',isSelected?'selected':'',last?.x===x&&last?.y===y?'last-move':'',target?'legal':'',target?.type==='tackle'?'tackle':''].filter(Boolean).join(' ');
    el.setAttribute('aria-selected',String(isSelected));
    let label=coord(x,y)+(piece?`, ${TEAM[piece.team]} ${NAMES[piece.type]}`:', empty');
    const hasBall=game.ball.x===x&&game.ball.y===y;
    if(hasBall)label+=', ball';
    if(target)label+=target.type==='tackle'?', tackle landing':target.label?`, ${target.label}`:', legal move';
    el.setAttribute('aria-label',label);el.title=label;
    el.innerHTML=piece?`<span class="piece ${piece.team}"><span>${SYMBOLS[piece.type]}</span>${hasBall?`<span class="ball">${ballSVG}</span>`:''}</span>`:hasBall?`<span class="ball loose">${ballSVG}</span>`:'';
  }
  const topY=flipped?11:-1,bottomY=flipped?-1:11;
  for(const [id,y] of [['goalTop',topY],['goalBottom',bottomY]]) {
    const kick=targets.find(t=>t.y===y&&t.goal);
    const el=$(id);el.disabled=!kick;el.classList.toggle('available',!!kick);el.dataset.y=y;
    el.textContent=kick?'SHOOT → GOAL':y===-1?'OBSIDIAN GOAL':'IVORY GOAL';
    el.setAttribute('aria-label',kick?`Shoot into ${y===-1?'Obsidian':'Ivory'} goal`:`${y===-1?'Obsidian':'Ivory'} goal`);
  }
  document.querySelector('.pitch-area').classList.toggle('flipped',flipped);
}

function render() {
  cancelAI();
  const acting=currentTeam(game),kickPhase=['kick','kickoff'].includes(game.phase);
  if(stage==='playing'&&kickPhase)selectedId=game.ball.carrierId;
  $('setupPanel').hidden=stage!=='setup';$('turnPanel').hidden=stage==='setup';
  $('whiteScore').textContent=game.score.white;$('blackScore').textContent=game.score.black;
  $('whiteSub').textContent=(game.mode==='solo'?'YOU':'PLAYER 1')+' · ATTACKING '+(flipped?'↓':'↑');
  $('blackSub').textContent=(game.mode==='solo'?'COMPUTER':'PLAYER 2')+' · ATTACKING '+(flipped?'↑':'↓');
  $('turnNumber').textContent=`POSSESSION ${String(game.turn).padStart(2,'0')}`;
  let heading,help,status;
  if(stage==='finished') {heading='Full time.';help='The final whistle has sounded. Start a new match to play again.';status='Full time. Thanks for playing.';}
  else if(paused) {heading='Take a breath.';help='The match is paused. Resume when you’re ready.';status='Match paused.';}
  else if(isComputer()&&stage==='playing') {heading='Computer’s turn.';help=kickPhase?'Obsidian is choosing a pass or shot.':'Obsidian is finding its next move.';status='Obsidian is thinking…';}
  else if(game.phase==='kickoff') {heading=game.mode==='solo'?'Your kickoff.':TEAM[acting]+' kicks off.';help='Select a lit square to kick the ball. A lit goal is a scoring chance.';status='Choose a pass to start play.';}
  else if(game.phase==='kick') {heading=teamLabel(acting)+' pass.';help='Choose a lit square to pass. Click a lit goal to shoot. The first piece in the path takes possession.';status=`${TEAM[acting]} · play the ball`;}
  else if(game.phase==='defendMove') {heading=teamLabel(acting)+' response.';help='Move a defender to close a lane. Red squares let you tackle the carrier. You may also hold position.';status=`${TEAM[acting]} · defence responds`;}
  else {heading=teamLabel(acting)+' move.';help=game.ball.carrierId?'Select a footballer, then a lit square. Move the carrier to dribble, or create space with a teammate.':'The ball is loose. Move a footballer onto it to take possession.';status=`${TEAM[acting]} · build the attack`;}
  if(stage==='setup')status='Arrange your team or kick off.';
  $('turnTitle').textContent=heading;$('actionHelp').textContent=help;$('boardStatus').textContent=status;
  for(const el of document.querySelectorAll('[data-phase]'))el.classList.toggle('active',el.dataset.phase===(game.phase==='kickoff'?'kick':game.phase));
  $('skipBtn').hidden=kickPhase||stage==='finished';$('skipBtn').disabled=blocked();
  $('pauseBtn').disabled=stage!=='playing';$('pauseBtn').textContent=paused?'▶ Resume':'Ⅱ Pause';
  $('finishBtn').disabled=stage!=='playing';$('undoBtn').disabled=!history.length||stage==='setup'||stage==='finished'||anyDialog();
  document.body.classList.toggle('thinking',stage==='playing'&&isComputer()&&!paused);
  document.body.classList.toggle('paused',paused&&stage==='playing');
  const carrier=game.pieces.find(p=>p.id===game.ball.carrierId);
  $('possessionTeam').textContent=carrier?TEAM[carrier.team]:'Loose ball';
  $('possessionDetail').textContent=carrier?`${NAMES[carrier.type]} · ${coord(carrier.x,carrier.y)}`:`Available to collect · ${coord(game.ball.x,game.ball.y)}`;
  const selected=game.pieces.find(p=>p.id===selectedId);
  $('selectionInfo').innerHTML=selected?`<span class="selection-icon">${SYMBOLS[selected.type]}</span><div><b>${NAMES[selected.type]} · ${coord(selected.x,selected.y)}</b><small>${stage==='setup'?'Choose a starting square.':kickPhase?'Choose a pass or a shot.':`${legalMoves(game,selected.id).length} legal destinations`}</small></div>`:'<span class="selection-icon">♞</span><div><b>Select a footballer</b><small>Legal moves light up on the pitch.</small></div>';
  const entries=game.log.slice(-12).reverse();
  $('journal').replaceChildren(...entries.map(line=>{const li=document.createElement('li');li.textContent=line.replaceAll('White','Ivory').replaceAll('Black','Obsidian');return li;}));
  $('feedCount').textContent=String(game.log.length).padStart(2,'0');
  if(!storageOK)$('saveNote').textContent='Match saving is unavailable in this browser.';
  renderBoard();updateClock();scheduleAI();
}
function updateClock() {
  const seconds=Math.ceil(Math.max(0,remaining));
  $('clock').textContent=duration===0?'∞':`${Math.floor(seconds/60).toString().padStart(2,'0')}:${(seconds%60).toString().padStart(2,'0')}`;
  $('matchState').textContent=stage==='setup'?'PRE-MATCH':stage==='finished'?'FULL TIME':paused||anyDialog()?'PAUSED':'LIVE';
  $('liveDot').classList.toggle('running',stage==='playing'&&!paused&&!anyDialog());
}
function commit(next) {
  const actor=currentTeam(game);
  history.push({game:structuredClone(game),actor});if(history.length>80)history.shift();
  const oldScore=game.score.white+game.score.black;
  game=next;selectedId=null;
  if(game.score.white+game.score.black>oldScore)toast(`${TEAM[game.lastAction.team]} scores! ${game.score.white} : ${game.score.black}${game.lastAction.ownGoal?' · Own goal':''}`);
  render();save();
}
function scheduleAI() {
  if(stage!=='playing'||paused||anyDialog()||!isComputer())return;
  aiTimer=setTimeout(()=>{
    aiTimer=null;
    if(stage!=='playing'||paused||anyDialog()||!isComputer())return;
    try {
      const action=chooseAIAction(game);
      if(!action)throw new Error('No legal action found.');
      if(action.type==='move')commit(applyMove(game,action.pieceId,action.x,action.y));
      else if(action.type==='kick')commit(applyKick(game,action.x,action.y));
      else commit(skipMove(game));
    }catch(err){paused=true;render();toast('Play paused: '+err.message);}
  },600);
}
function drawPath(x,y) {
  document.querySelector('.trajectory')?.remove();
  if(blocked()||!['kick','kickoff'].includes(game.phase))return;
  const target=legalKicks(game).find(t=>t.x===x&&t.y===y);if(!target)return;
  const line=document.createElementNS('http://www.w3.org/2000/svg','polyline');line.classList.add('trajectory');
  line.setAttribute('points',target.path.map(p=>`${p.x*100+50},${p.y*100+50}`).join(' '));
  line.setAttribute('stroke','#f0ed9b');line.setAttribute('stroke-width','5');line.setAttribute('stroke-dasharray','12 9');
  document.querySelector('.pitch-markings').append(line);
}
$('board').addEventListener('pointerover',event=>{const square=event.target.closest('.square');if(square)drawPath(Number(square.dataset.x),Number(square.dataset.y));});
$('board').addEventListener('pointerleave',()=>document.querySelector('.trajectory')?.remove());
$('board').addEventListener('click',event=>{
  const el=event.target.closest('.square');if(!el)return;
  const x=Number(el.dataset.x),y=Number(el.dataset.y),piece=game.pieces.find(p=>p.x===x&&p.y===y);
  const target=getTargets().find(t=>t.x===x&&t.y===y);
  if(stage==='setup') {
    if(target&&selectedId) {
      const selected=game.pieces.find(p=>p.id===selectedId);
      if(piece&&piece.id!==selected.id){piece.x=selected.x;piece.y=selected.y;}
      selected.x=x;selected.y=y;
      if(selected.id===game.ball.carrierId||piece?.id===game.ball.carrierId)game.ball={x,y,carrierId:selected.id};
      selectedId=null;save();render();return;
    }
    if(piece){selectedId=piece.id;if(game.mode==='solo'&&piece.team==='black')toast('You can arrange Ivory FC. Choose two players to arrange both teams.');render();}
    return;
  }
  if(blocked()){if(paused)toast('Resume the match to play.');return;}
  try {
    if(target) {
      if(['kick','kickoff'].includes(game.phase))commit(applyKick(game,x,y));
      else commit(applyMove(game,selectedId,x,y));
      return;
    }
    if(['kick','kickoff'].includes(game.phase)){toast('Choose a highlighted pass destination or a lit goal.');return;}
    if(piece&&piece.team===currentTeam(game)){selectedId=piece.id;render();}
    else if(piece)toast(`It is ${TEAM[currentTeam(game)]}’s move. Red squares beside the carrier show tackle landings.`);
  } catch(err){toast(err.message);}
});
$('board').addEventListener('keydown',event=>{
  const el=event.target.closest('.square');if(!el)return;
  const dirs={ArrowUp:[0,-1],ArrowDown:[0,1],ArrowLeft:[-1,0],ArrowRight:[1,0]};
  if(event.key==='Escape'){selectedId=null;render();return;}
  if(!dirs[event.key])return;event.preventDefault();
  let [dx,dy]=dirs[event.key];if(flipped){dx=-dx;dy=-dy;}
  const x=Math.max(0,Math.min(7,Number(el.dataset.x)+dx)),y=Math.max(0,Math.min(10,Number(el.dataset.y)+dy));
  squares[y*8+x].focus();
});
for(const id of ['goalTop','goalBottom'])$(id).addEventListener('click',()=>{
  if(blocked())return;
  const kick=legalKicks(game).find(k=>k.goal&&k.y===Number($(id).dataset.y));
  if(kick)commit(applyKick(game,kick.x,kick.y));
});
function refreshSetup(){cancelAI();game=createGame({mode:$('mode').value,minutes:Number($('duration').value)||10,kickoff:$('kickoff').value});duration=Number($('duration').value);remaining=duration*60;selectedId=null;history=[];render();save();}
for(const id of ['mode','kickoff'])$(id).addEventListener('change',refreshSetup);
$('duration').addEventListener('change',()=>{duration=Number($('duration').value);remaining=duration*60;game.minutes=duration||10;render();save();});
$('startBtn').addEventListener('click',()=>{stage='playing';paused=false;selectedId=null;lastTick=Date.now();render();save();});
$('skipBtn').addEventListener('click',()=>{if(!blocked())commit(skipMove(game));});
$('pauseBtn').addEventListener('click',()=>{if(stage!=='playing')return;paused=!paused;lastTick=Date.now();render();save();});
$('undoBtn').addEventListener('click',()=>{
  if(!history.length||stage!=='playing')return;cancelAI();
  let entry=history.pop();
  if(game.mode==='solo')while(entry.actor!=='white'&&history.length)entry=history.pop();
  game=entry.game;selectedId=null;render();save();toast('Last move undone.');
});
$('flipBtn').addEventListener('click',()=>{flipped=!flipped;render();save();});
function finishMatch() {
  if(stage!=='playing')return;
  cancelAI();stage='finished';paused=false;game.phase='finished';selectedId=null;
  render();save();showResult();
}
function showResult() {
  const winner=game.score.white===game.score.black?null:game.score.white>game.score.black?'white':'black';
  $('resultTitle').textContent=winner?TEAM[winner]+' wins.':'Honours even.';
  $('resultScore').textContent=`${game.score.white} : ${game.score.black}`;
  $('resultText').textContent=winner?'A well-played match. The next move is a fresh start.':'Nothing between the sides. Settle it in a rematch.';
  $('resultDialog').showModal();
}
$('finishBtn').addEventListener('click',finishMatch);
function newMatch() {
  cancelAI();for(const dialog of document.querySelectorAll('dialog[open]'))dialog.close();
  stage='setup';paused=false;remaining=duration*60;selectedId=null;history=[];
  game=createGame({mode:game.mode,minutes:duration||10,kickoff:$('kickoff').value});
  lastTick=Date.now();render();save();
}
$('newBtn').addEventListener('click',()=>{if(stage==='playing'){$('confirmDialog').showModal();cancelAI();updateClock();}else newMatch();});
$('confirmNewBtn').addEventListener('click',newMatch);$('rematchBtn').addEventListener('click',newMatch);
function openRules(){$('rulesDialog').showModal();cancelAI();updateClock();}
$('rulesBtn').addEventListener('click',openRules);$('detailsBtn').addEventListener('click',openRules);
for(const el of document.querySelectorAll('[data-close]'))el.addEventListener('click',()=>$(el.dataset.close).close());
for(const dialog of document.querySelectorAll('dialog')) {
  dialog.addEventListener('close',()=>{lastTick=Date.now();render();});
  dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();}});
}
setInterval(()=>{
  const now=Date.now(),elapsed=(now-lastTick)/1000;lastTick=now;
  if(stage==='playing'&&!paused&&!anyDialog()&&duration>0){remaining=Math.max(0,remaining-elapsed);updateClock();if(remaining<=0)finishMatch();}
},250);
setInterval(()=>{if(stage==='playing')save();},5000);
window.addEventListener('pagehide',save);
render();
if(stage==='playing'&&paused)toast('Your match is restored. Press Resume to continue.');
if(stage==='finished')showResult();
