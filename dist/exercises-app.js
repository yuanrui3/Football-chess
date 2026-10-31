import {BOARD_WIDTH as W, BOARD_HEIGHT as H, GOAL_FILES, BOX_FILES, BOX_DEPTH, currentTeam, canQuickRelease, legalMoves, legalKicks, disguisedShotTargets, cornerTakers, isBox, isGoalMouth, positionActions, applyKick} from './engine.js?v=bc58e8823cbc';
import {chooseExerciseAction} from './exercise-ai.js?v=6318b72b3ad6';
import {EXERCISES} from './exercise-positions.js?v=67887493e45d';
import {createExerciseSession, applyExerciseAction, bestKeeperShotChance} from './exercise-session.js?v=9f74b59a08c4';
import {createEvaluation} from './evaluation.js?v=9477bc2cb051';

export const EXERCISE_PROGRESS_KEY='football-chess-exercises-v1';
export const EXERCISE_THEME_LABELS=Object.freeze({'one-on-one':'One on one','through-ball':'Through balls','box-entry':'Into the box',defence:'Defend the finish'});
export const EXERCISE_DIFFICULTY_LABELS=Object.freeze({easy:'Easy',medium:'Medium',tough:'Tough'});
export const exerciseDifficulty=definition=>definition.difficulty||'easy';
export const exerciseRevision=definition=>Number.isInteger(definition?.revision)&&definition.revision>0?definition.revision:1;
export function filterExercises(catalog=EXERCISES,{theme='all',difficulty='all'}={}){
  return catalog.filter(def=>(theme==='all'||def.theme===theme)&&(difficulty==='all'||exerciseDifficulty(def)===difficulty));
}
export function selectFilteredExercise(catalog,filters,selectedId){
  const list=filterExercises(catalog,filters);
  return list.find(def=>def.id===selectedId)||list[0]||null;
}
export function nextFilteredExercise(catalog,filters,selectedId){
  const list=filterExercises(catalog,filters),index=list.findIndex(def=>def.id===selectedId);
  return list.length?list[(index+1)%list.length]:null;
}
/** An empty filter pauses the current study rather than playing it off-list. */
export function syncExerciseFilters(controller,catalog,filters,loadDefinition,{allowResume=true}={}){
  const selected=selectFilteredExercise(catalog,filters,controller.getState().session?.definitionId);
  if(!selected){controller.suspend();return null;}
  if(selected.id!==controller.getState().session?.definitionId)loadDefinition(selected);
  if(allowResume)controller.resume();
  return selected;
}
export function exercisePlanText(definition){
  return Number.isInteger(definition.planSteps)?`Illustrative plan: ${definition.planSteps} steps`:'Core tactical idea';
}
const TEAM={white:'Ivory FC',black:'Obsidian FC'};
const TYPES={K:'Goalkeeper',Q:'Queen',R:'Rook',B:'Bishop',N:'Knight',P:'Pawn'};
const SYMBOLS={K:'♚',Q:'♛',R:'♜',B:'♝',N:'♞',P:'♟'};
const FILES='abcdefghijklmn';
const xy=(x,y)=>`${FILES[x]}${H-y}`;
const pieceName=p=>`${TYPES[p.type]} ${p.id.split('-')[1]}`;
const percent=value=>`${Math.round((Number(value)||0)*100)}%`;
export function exerciseOutcomeText(definition){
  const goal=definition.goal||{};
  return goal.type==='defend'||definition.side==='defence'
    ?`Win possession before the finish, or hold the opponent’s finishing chance to ${percent(goal.maxOpponentShotXG)} or less. Any legal defensive plan can succeed.`
    :`Create and take any legal shot worth at least ${percent(goal.minShotXG)} against the best keeper reply. Any route to that chance can succeed.`;
}
export function exerciseCoachingItems(definition,progress={}){
  const items=[],goal=definition.goal||{};
  if(goal.requires==='through-ball')items.push({done:!!progress.throughBall,text:'Through ball collected by an onside teammate'});
  if(goal.requires==='box-entry')items.push({done:!!progress.boxEntry,text:'Ball reached the attacking box'});
  if(goal.minCompletedPasses>0)items.push({done:false,text:`Teammate passes observed: ${progress.completedPasses||0}`});
  return items;
}
const ballSVG='<svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="18" fill="#fff9e9" stroke="#23372f"/><path d="M20 11l9 6-3 10H14l-3-10zM3 17h8M29 17h8M20 11V2M14 27l-5 8M26 27l5 8" fill="#25392e" stroke="#25392e" stroke-width="1.5"/></svg>';

export function exerciseMoveMode(game,mode){
  return ['passRun','keeperReact'].includes(game.phase)||mode==='dribble'&&game.phase!=='attackMove'?'offball':mode;
}
export function exerciseStartingPiece(game,playerTeam){
  if(game.phase==='keeperReact')return game.pieces.find(piece=>piece.team===playerTeam&&piece.type==='K')?.id||null;
  return game.pieces.find(piece=>piece.team===playerTeam&&piece.id===game.ball.carrierId)?.id||null;
}

/** A terminal review is an illustration, not another playable engine position. */
export function syncExerciseEvaluation(evaluation,view){
  if(!evaluation||!view?.session)return;
  if(view.session.status!=='active'){evaluation.suspend();return;}
  if(view.thinking||view.suspended){evaluation.suspend();evaluation.update(view.session.game);}
  else{evaluation.update(view.session.game);evaluation.resume();}
}

/** Completed iterations are useful before the final worker reply. Retained
 * estimates must be labelled as held instead of looking freshly analysed. */
export function exerciseEvaluationDisplay(value,{complete=false}={}){
  const available=value.enabled&&['ready','thinking','queued','suspended'].includes(value.status)
    &&Number.isFinite(value.score)&&Number.isFinite(value.share);
  const detail=available?`Ivory perspective · depth ${value.depth}, ${value.nodes} nodes. Heuristic round units, not xG or a win percentage.`:'';
  let info;
  if(complete)info=`Last available decision estimate · exercise complete${available?` · ${detail}`:'. No estimate was available.'}`;
  else if(!value.enabled||value.status==='off')info='Current-round analysis is off.';
  else if(value.status==='unavailable')info='Current-round estimate unavailable. The exercise can continue.';
  else if(value.status==='ready'&&available)info=`Current-round estimate · ${detail}`;
  else if(value.status==='thinking'&&available)info=`Provisional estimate · last available analysis · ${detail} Updating this round’s attack and defence.`;
  else if(available)info=`Last available estimate · ${detail} ${value.status==='suspended'?'Held while analysis is paused.':'Updating for the next decision.'}`;
  else info=value.status==='suspended'?'Analysis paused; the estimate resumes at the next decision.':'Analysing this round’s attack and defence…';
  return {available,share:available?Math.max(0,Math.min(1,value.share)):.5,
    scoreText:available?`${value.score>0?'+':''}${value.score.toFixed(2)}`:complete||['off','unavailable'].includes(value.status)?'—':'…',info};
}

export function readExerciseProgress(storage,catalog=EXERCISES){
  const empty=()=>({version:1,solved:{},solvedRevisions:{},previouslySolved:{},lastId:null});
  try{const value=JSON.parse(storage?.getItem(EXERCISE_PROGRESS_KEY)||'null'),progress=empty();
    for(const definition of catalog){
      const id=definition.id;
      if(value?.solved?.[id]!==true&&value?.previouslySolved?.[id]!==true)continue;
      const recorded=value?.solvedRevisions?.[id],revision=Number.isInteger(recorded)&&recorded>0?recorded:1;
      progress.solvedRevisions[id]=revision;
      if(revision>=exerciseRevision(definition))progress.solved[id]=true;
      else progress.previouslySolved[id]=true;
    }
    progress.lastId=catalog.some(def=>def.id===value?.lastId)?value.lastId:null;
    return progress;
  }catch{return empty();}
}
export function saveExerciseProgress(storage,progress){try{storage?.setItem(EXERCISE_PROGRESS_KEY,JSON.stringify(progress));return true;}catch{return false;}}
export function recordExerciseSolved(progress,id,catalog=EXERCISES){
  const definition=catalog.find(def=>def.id===id);
  if(!definition)return {...progress,solved:{...progress.solved}};
  const previouslySolved={...progress.previouslySolved};delete previouslySolved[id];
  return {...progress,version:1,lastId:id,solved:{...progress.solved,[id]:true},
    solvedRevisions:{...progress.solvedRevisions,[id]:exerciseRevision(definition)},previouslySolved};
}

/** One controller owns one exercise and one Tactical decision at a time.
 * Generation and board identity checks protect Retry/Undo/theme changes from
 * both late worker answers and already scheduled presentation timers.
 */
export function createExerciseController({definition,makeSession=createExerciseSession,applyAction=applyExerciseAction,
  workerFactory=typeof Worker==='function'?()=>new Worker(new URL('./exercise-ai-worker.js?v=934fb3d22b80',import.meta.url),{type:'module',name:'football-chess-exercise-study'}):null,
  chooseTactical=chooseExerciseAction,now=()=>Date.now(),delayMs=1000,watchdogMs=20000,
  setTimer=(fn,ms)=>setTimeout(fn,ms),clearTimer=id=>clearTimeout(id),onChange=()=>{},onError=()=>{}}={}){
  let session=null,started=false,thinking=false,suspended=false,destroyed=false,generation=0,pending=null,lastAction=null;
  const history=[];
  const getState=()=>({session,started,thinking,suspended,canUndo:history.length>0,lastAction});
  const notify=()=>onChange(getState());
  function cancel(){generation++;if(pending){clearTimer(pending.timer);clearTimer(pending.watchdog);try{pending.worker?.terminate();}catch{}pending=null;}thinking=false;}
  function isCurrent(token,board){return !destroyed&&!suspended&&started&&session?.status==='active'&&pending?.token===token&&generation===token&&session.game===board&&currentTeam(board)!==session.playerTeam;}
  function scheduleBot(){
    if(destroyed||suspended||!started||session?.status!=='active'||currentTeam(session.game)===session.playerTeam)return;
    cancel();const token=generation,board=session.game,at=now();
    pending={token,board,timer:null,watchdog:null,worker:null,ready:false,progress:null};thinking=true;notify();
    const accept=action=>{
      if(!isCurrent(token,board)||pending.ready)return;
      pending.ready=true;clearTimer(pending.watchdog);try{pending.worker?.terminate();}catch{}
      pending.timer=setTimer(()=>{
        if(!isCurrent(token,board))return;
        const before=session;
        pending=null;thinking=false;
        try{session=applyAction(session,action);lastAction={actor:currentTeam(board),action,result:session.game.lastAction,before:board,after:session.game};}
        catch(error){session=before;onError(`The Tactical opponent could not complete this action. Retry the exercise. ${error.message||''}`);notify();return;}
        notify();scheduleBot();
      },Math.max(0,delayMs-(now()-at)));
    };
    const recover=()=>{
      if(!isCurrent(token,board)||pending.ready||pending.recovering)return;
      pending.recovering=true;clearTimer(pending.watchdog);try{pending.worker?.terminate();}catch{}
      pending.timer=setTimer(()=>{
        if(!isCurrent(token,board))return;
        try{accept(pending.progress||chooseTactical(board));}
        catch(error){cancel();onError(`Tactical analysis is unavailable. Retry the exercise. ${error.message||''}`);notify();}
      },0);
    };
    if(workerFactory){
      try{const worker=workerFactory();pending.worker=worker;
        worker.onmessage=({data})=>{
          if(!isCurrent(token,board)||data?.requestId!==token)return;
          if(data.progress?.action&&Number.isInteger(data.progress.depth??data.progress.stats?.completedDepth))pending.progress=data.progress.action;
          if(data.action)accept(data.action);else if(data.error)recover();
        };
        worker.onerror=recover;
        pending.watchdog=setTimer(recover,watchdogMs);
        worker.postMessage({requestId:token,state:board});
      }catch{recover();}
    }else recover();
  }
  function load(nextDefinition,{seed}={}){cancel();history.length=0;started=false;lastAction=null;session=makeSession(nextDefinition,seed===undefined?{}:{seed});notify();return session;}
  function start(){if(destroyed||suspended||started||!session||session.status!=='active')return false;started=true;notify();scheduleBot();return true;}
  function play(action){
    if(destroyed||suspended||!started||thinking||session?.status!=='active'||currentTeam(session.game)!==session.playerTeam)return false;
    const before=session;try{const next=applyAction(before,action);cancel();history.push(before);if(history.length>40)history.shift();session=next;lastAction={actor:session.playerTeam,action,result:next.game.lastAction,before:before.game,after:next.game};notify();scheduleBot();return true;}
    catch(error){onError(error.message||'Choose a highlighted legal action.');return false;}
  }
  function retry(){if(!session)return;const def=session.definition;load(def);start();}
  function undo(){if(!history.length||destroyed)return false;cancel();session=history.pop();started=true;lastAction=null;notify();scheduleBot();return true;}
  function suspend(){if(destroyed||suspended)return;cancel();suspended=true;notify();}
  function resume(){if(destroyed||!suspended)return;suspended=false;notify();scheduleBot();}
  function destroy(){cancel();destroyed=true;}
  if(definition)load(definition);
  return {getState,load,start,play,retry,undo,suspend,resume,destroy};
}

export function initExercisePage(){
  const $=id=>document.getElementById(id);
  let storage=null;try{storage=window.localStorage;}catch{}
  let progress=readExerciseProgress(storage),selectedId=null,moveMode='offball',hintsUsed=0,passRun=false,disguise=false;
  let state=null,controller=null,evaluation=null,lastBoard=null,focusedSquare=null,filterBlocked=false;
  const squares=[];
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){
    const button=document.createElement('button');button.type='button';button.dataset.x=x;button.dataset.y=y;button.setAttribute('role','gridcell');button.tabIndex=-1;
    $('exerciseBoard').append(button);squares.push(button);
  }
  $('ranks').textContent='';for(let rank=H;rank>=1;rank--){const span=document.createElement('span');span.textContent=rank;$('ranks').append(span);}
  $('files').textContent='';for(const file of FILES){const span=document.createElement('span');span.textContent=file;$('files').append(span);}
  for(const [id,y]of[['goalTop',-1],['goalBottom',H]])for(const x of GOAL_FILES){
    const button=document.createElement('button');button.type='button';button.className='goal-cell';button.dataset.x=x;button.dataset.y=y;
    button.innerHTML=`<span class="goal-file">${FILES[x].toUpperCase()}</span><span class="goal-odds">—</span>`;$(id).append(button);
  }
  const isKick=game=>['kick','kickoff','keeperRelease'].includes(game.phase);
  const playable=()=>!filterBlocked&&state?.started&&!state.suspended&&!state.thinking&&state.session.status==='active'&&currentTeam(state.session.game)===state.session.playerTeam;
  function targets(){
    if(!playable())return [];
    const game=state.session.game;
    if(isKick(game))return legalKicks(game).filter(k=>!k.goal||k.goal===state.session.playerTeam);
    if(game.phase==='cornerSelect')return cornerTakers(game).map(piece=>({x:piece.x,y:piece.y,type:'cornerTaker',pieceId:piece.id}));
    const piece=game.pieces.find(p=>p.id===selectedId);
    if(!piece)return [];
    if(game.phase==='attackMove'&&!game.restart&&moveMode!=='bonus'&&(piece.id===game.ball.carrierId)!==(moveMode==='dribble'))return [];
    return legalMoves(game,piece.id,{freePawn:moveMode==='bonus'});
  }
  function setMode(mode){moveMode=mode;const game=state.session.game;if(mode==='dribble')selectedId=game.ball.carrierId;else if(selectedId===game.ball.carrierId)selectedId=null;render(state);}
  function save(){saveExerciseProgress(storage,progress);}
  const filters=()=>({theme:$('themeFilter').value,difficulty:$('difficultyFilter').value});
  function renderLibrary(){
    const list=filterExercises(EXERCISES,filters());
    $('solvedCount').textContent=`${Object.keys(progress.solved).length} / ${EXERCISES.length}`;
    $('tierCounts').textContent=Object.entries(EXERCISE_DIFFICULTY_LABELS).map(([id,label])=>`${EXERCISES.filter(def=>exerciseDifficulty(def)===id).length} ${label}`).join(' · ');
    for(const option of $('difficultyFilter').options)option.textContent=option.value==='all'?`All levels (${EXERCISES.length})`:`${EXERCISE_DIFFICULTY_LABELS[option.value]} (${EXERCISES.filter(def=>exerciseDifficulty(def)===option.value).length})`;
    $('filteredCount').textContent=`${list.length} ${list.length===1?'exercise':'exercises'} shown`;
    $('nextBtn').disabled=!list.length;
    $('exerciseList').replaceChildren(...list.map(def=>{
      const index=EXERCISES.indexOf(def),button=document.createElement('button');button.type='button';button.className='exercise-card'+(progress.solved[def.id]?' solved':progress.previouslySolved[def.id]?' previously-solved':'');button.dataset.exerciseId=def.id;button.setAttribute('aria-pressed',String(def.id===state?.session.definitionId));
      const difficulty=exerciseDifficulty(def),level=EXERCISE_DIFFICULTY_LABELS[difficulty];
      button.setAttribute('aria-label',`${index+1}. ${def.title}, ${level}, ${EXERCISE_THEME_LABELS[def.theme]}, ${exercisePlanText(def)}, up to ${def.roundLimit} possession rounds${progress.solved[def.id]?', solved':progress.previouslySolved[def.id]?', updated position, previous version solved':''}`);
      const number=document.createElement('span');number.className='exercise-number';number.textContent=progress.solved[def.id]?'✓':String(index+1).padStart(2,'0');
      const copy=document.createElement('span'),badge=document.createElement('span'),title=document.createElement('b'),detail=document.createElement('small');
      badge.className=`exercise-level ${difficulty}`;badge.textContent=level;title.textContent=def.title;detail.textContent=`${EXERCISE_THEME_LABELS[def.theme]} · ${Number.isInteger(def.planSteps)?`${def.planSteps} steps`:'Core idea'}`;copy.append(badge,title,detail);
      if(progress.previouslySolved[def.id]){const revision=document.createElement('small');revision.className='exercise-revision-note';revision.textContent='Updated position · previous version solved';copy.append(revision);}
      button.append(number,copy);return button;
    }));
    if(!list.length){const empty=document.createElement('p');empty.className='exercise-empty';empty.textContent='No exercises match both filters. Choose another level or theme.';$('exerciseList').append(empty);}
  }
  function phaseCopy(game){
    if(state.thinking)return ['TACTICAL · STUDY ANALYSIS','The opponent is thinking.','Expanded Tactical search is checking its reply. The next human decision will unlock automatically.'];
    if(game.phase==='keeperReact')return ['KEEPER REACTION','Move the keeper or hold.','Choose a highlighted adjacent square, or hold position to resolve the shot.'];
    if(canQuickRelease(game))return ['QUICK DISTRIBUTION','Distribute the catch, or hold.','Pass before either team repositions, or Hold & organise to keep the normal positioning round.'];
    if(game.phase==='keeperRelease')return ['IMMEDIATE RELEASE','The keeper must kick now.','A teammate passed to the king. Choose a legal pass or shot; it cannot move first.'];
    if(game.phase==='passRun')return ['OPTIONAL RUN','Run the passer, or skip.','This uses your next ordinary off-ball move. It cannot enter a box or collect the ball.'];
    if(game.phase==='cornerSelect')return ['CORNER','Choose the taker.','Select one of your highlighted players in the attacking half.'];
    if(isKick(game))return ['PASS / SHOOT','Send the ball.','Click a highlighted teammate or empty square to pass, or a lit goal target to shoot.'];
    if(game.phase==='defendMove')return ['DEFENSIVE POSITIONING','Stop the finishing chance.','Move a defender, choose a tackle landing beside the carrier, or use the shared pawn / king bonus first.'];
    return ['ATTACKING POSITIONING','Create the next chance.','You may dribble once, move one teammate and use one shared pawn / king bonus, in any order. Then end positioning.'];
  }
  function trace(game){
    const shot=state.session.status!=='active'&&state.session.metrics?.shotResult;
    const action=state.lastAction?.result;
    const from=shot?.from||action?.from,to=shot?.target||action?.to;
    $('actionTrace').replaceChildren();
    if(!from||!to||![from.x,from.y,to.x,to.y].every(Number.isFinite))return;
    const line=document.createElementNS('http://www.w3.org/2000/svg','line');line.setAttribute('x1',from.x*100+50);line.setAttribute('y1',from.y*100+50);line.setAttribute('x2',to.x*100+50);line.setAttribute('y2',to.y*100+50);if(shot)line.setAttribute('class','shot');$('actionTrace').append(line);
  }
  function renderBoard(game){
    const legal=targets(),selected=game.pieces.find(p=>p.id===selectedId),carrier=game.ball.carrierId;
    const last=state.lastAction?.result;
    for(const button of squares){
      const x=Number(button.dataset.x),y=Number(button.dataset.y),piece=game.pieces.find(p=>p.x===x&&p.y===y),target=legal.find(t=>t.x===x&&t.y===y);
      button.className=['square',(x+y)%2?'checker':'',isBox(x,y)?'box':'',isGoalMouth(x,y)?'keeper-only':'',piece?.id===selectedId?'selected':'',target?'legal':'',target?.type==='tackle'?'tackle':'',last?.from?.x===x&&last?.from?.y===y?'computer-from':'',last?.to?.x===x&&last?.to?.y===y?'computer-to':''].filter(Boolean).join(' ');
      button.disabled=!playable();button.setAttribute('aria-selected',String(piece?.id===selectedId));
      const label=`${xy(x,y)}, ${piece?`${TEAM[piece.team]} ${pieceName(piece)}${piece.id===carrier?', ball':''}`:'empty'}${target?`, ${target.type==='tackle'?'tackle landing':isKick(game)?target.receiverId?'pass target':'pass into space':moveMode==='bonus'?'bonus move':piece?.id===carrier?'dribble target':'move target'}`:''}`;
      button.setAttribute('aria-label',label);button.title=label;
      button.innerHTML=piece?`<span class="piece ${piece.team}"><span>${SYMBOLS[piece.type]}</span>${piece.id===carrier?`<span class="ball">${ballSVG}</span>`:''}</span><span class="piece-id ${piece.team}" aria-hidden="true">${piece.id.split('-')[1]}</span>`:!carrier&&game.ball.x===x&&game.ball.y===y?`<span class="ball loose">${ballSVG}</span>`:'';
      button.tabIndex=focusedSquare?focusedSquare.x===x&&focusedSquare.y===y?0:-1:selected?selected.x===x&&selected.y===y?0:-1:x===game.ball.x&&y===game.ball.y?0:-1;
    }
    const choices=playable()&&isKick(game)?disguisedShotTargets(game):[];
    $('disguiseChoice').hidden=choices.length!==2;$('disguiseEnabled').checked=disguise;
    for(const id of['goalTop','goalBottom'])for(const button of $(id).children){
      const x=Number(button.dataset.x),y=Number(button.dataset.y),kick=legal.find(k=>k.x===x&&k.y===y&&k.goal===state.session.playerTeam);
      let chance=null;if(kick){try{const pending=applyKick(game,x,y,{disguise:disguise&&choices.length===2});if(pending.phase==='keeperReact')chance=bestKeeperShotChance(pending);}catch{}}
      button.disabled=!kick;button.classList.toggle('available',!!kick);button.querySelector('.goal-odds').textContent=chance===null?'—':percent(chance);
      button.setAttribute('aria-label',kick?`Shoot at ${FILES[x].toUpperCase()} goal, ${percent(chance)} chance against the best keeper reply`:`${FILES[x].toUpperCase()} goal target unavailable`);
    }
    trace(game);
  }
  function actionDescription(){
    const last=state.lastAction;if(!last)return '';
    const result=last.result||{},piece=last.before.pieces.find(p=>p.id===(result.pieceId||last.action.pieceId||last.before.ball.carrierId));
    const who=piece?`${TEAM[piece.team]} ${pieceName(piece)}`:TEAM[last.actor];
    if(result.type==='skip')return `${who} ${result.heldCatch?'held the catch to organise':last.before.phase==='keeperReact'?'held the keeper':'ended positioning'}.`;
    if(result.type==='tackle'||result.type==='tackleMiss')return `${who} challenged${result.outcome==='won'?' and won possession':' but the knight kept the ball'}.`;
    if(last.action.type==='kick')return `${who} ${last.after.pendingShot?'shot at goal':`passed to ${xy(last.action.x,last.action.y)}`}.`;
    return result.to?`${who} moved to ${xy(result.to.x,result.to.y)}${result.freePawn?' with the shared bonus':''}.`:`${who} completed its action.`;
  }
  function render(view){
    state=view;const session=view.session;if(!session)return;
    const def=session.definition,game=session.status!=='active'&&session.reviewGame?session.reviewGame:session.game;
    moveMode=exerciseMoveMode(game,moveMode);
    if(lastBoard!==session.game){
      lastBoard=session.game;focusedSquare=null;
      if(!game.pieces.some(p=>p.id===selectedId&&p.team===currentTeam(game)))selectedId=null;
      if(playable()&&(isKick(game)||game.phase==='passRun'))selectedId=game.phase==='passRun'?game.passRun?.pieceId:game.ball.carrierId;
      if(playable()&&game.phase==='keeperReact'){selectedId=game.pieces.find(p=>p.type==='K'&&p.team===session.playerTeam)?.id;moveMode='offball';}
    }
    $('exerciseTitle').textContent=def.title;$('themeLabel').textContent=EXERCISE_THEME_LABELS[def.theme]||'Tactical exercise';$('exerciseObjective').textContent=exerciseOutcomeText(def);
    $('difficultyLabel').textContent=EXERCISE_DIFFICULTY_LABELS[exerciseDifficulty(def)];$('difficultyLabel').className=`exercise-level ${exerciseDifficulty(def)}`;
    $('planLength').textContent=`${exercisePlanText(def)} · up to ${def.roundLimit} possession rounds.`;
    $('qualityGoal').textContent='The result earns credit. A shorter or stronger legal alternative is welcome; hints describe one possible idea.';
    $('roundCounter').textContent=`${Math.min(session.roundsUsed,session.roundLimit)} / ${session.roundLimit} rounds`;
    $('sideLabel').textContent=`YOU · ${TEAM[session.playerTeam].toUpperCase()} ${session.playerTeam==='white'?'↑':'↓'}`;
    $('playBtn').hidden=view.started;$('playBtn').disabled=filterBlocked;$('actionPanel').hidden=filterBlocked||!view.started||session.status!=='active';$('feedbackPanel').hidden=filterBlocked||session.status==='active';
    $('undoBtn').disabled=filterBlocked||!view.canUndo;$('retryBtn').disabled=filterBlocked||!view.started&&session.roundsUsed===0;
    const coaching=exerciseCoachingItems(def,session.progress),coachingNodes=[];
    if(coaching.length){const label=document.createElement('small');label.className='exercise-coaching-label';label.textContent='Optional coaching · does not affect credit';coachingNodes.push(label);}
    $('requirements').replaceChildren(...coachingNodes,...coaching.map(r=>{const item=document.createElement('span');item.className=r.done?'done':'';item.textContent=`${r.done?'✓':'○'} ${r.text}`;return item;}));
    const [phase,title,help]=phaseCopy(game);$('phaseLabel').textContent=phase;$('phaseTitle').textContent=title;$('actionHelp').textContent=help;
    $('boardStatus').textContent=filterBlocked?'No exercises match both filters. The current study is paused; change the level or theme to continue.':!view.started?'Study the position, then Play exercise.':session.status!=='active'?session.feedback:view.thinking?`${TEAM[currentTeam(session.game)]} · Tactical is checking an expanded set of replies…`:help;
    const positional=['attackMove','defendMove'].includes(game.phase),budget=game.positionBudget||{};
    $('positionModes').hidden=!positional||!!game.restart;
    const availability=positional?positionActions(game):null;
    $('offballBtn').disabled=!playable()||!!budget.normalUsed;$('bonusBtn').disabled=!playable()||!!budget.pawnUsed;$('dribbleBtn').disabled=!playable()||game.phase!=='attackMove'||!!game.restart||!!budget.dribbleUsed||!availability?.dribbleAvailable;
    for(const [id,mode]of[['offballBtn','offball'],['dribbleBtn','dribble'],['bonusBtn','bonus']])$(id).setAttribute('aria-pressed',String(moveMode===mode));
    $('budgetInfo').textContent=positional?`${budget.normalUsed?'Off-ball used':'Off-ball available'} · ${budget.pawnUsed?'Bonus used':'Pawn / King bonus available'}${game.phase==='attackMove'&&!game.restart?` · ${budget.dribbleUsed?'Dribble used':'Dribble available'}`:''}`:'';
    const selected=game.pieces.find(p=>p.id===selectedId);$('selectedInfo').textContent=selected?`${pieceName(selected)} · ${xy(selected.x,selected.y)}`:'Select a piece to see legal destinations.';
    $('passRunChoice').hidden=!playable()||!isKick(game)||!!game.restart;$('passRunEnabled').checked=passRun;
    $('endBtn').disabled=!playable()||!(positional||canQuickRelease(game)||game.phase==='keeperReact'||game.phase==='passRun'||isKick(game)&&!game.ball.carrierId);
    $('endBtn').textContent=canQuickRelease(game)?'Hold & organise →':game.phase==='keeperReact'?'Hold keeper / resolve →':game.phase==='passRun'?'Skip run →':isKick(game)&&!game.ball.carrierId?'Continue loose-ball play →':'End positioning →';
    if(session.status!=='active'){
      $('feedbackPanel').dataset.result=session.status;$('feedbackLabel').textContent=session.status==='solved'?'EXERCISE SOLVED':'TRY A DIFFERENT PLAN';$('feedbackTitle').textContent=session.feedbackTitle||(session.status==='solved'?'Good continuation.':'Try another continuation.');$('feedbackText').textContent=session.feedback;$('reviewPlan').textContent=def.coachNote?`One possible idea, not a required solution: ${def.coachNote}`:'';
      const result=session.metrics?.shotResult;$('shotQuality').textContent=result?def.goal.type==='defend'&&Number.isFinite(result.testedThreatXG)
        ?`Defensive threat checked: ${percent(result.testedThreatXG)} · strongest available shot: ${percent(result.bestOpponentShotXG)} · chosen shot after your reaction: ${percent(result.actualReplyXG)}.`
        :`Chance against the best keeper reply: ${percent(result.bestReplyXG)}${Number.isFinite(result.actualReplyXG)?` · after the actual reply: ${percent(result.actualReplyXG)}`:''}.`:'';
      if(session.status==='solved'&&!progress.solved[def.id]){progress=recordExerciseSolved(progress,def.id);save();}
    }
    $('hintBtn').disabled=filterBlocked||hintsUsed>=(def.hints?.length||0);$('hintBtn').firstChild.textContent=hintsUsed?`Next hint (${hintsUsed}/${def.hints.length}) `:'Show a hint ';
    $('hintsList').replaceChildren(...(def.hints||[]).slice(0,hintsUsed).map(text=>{const li=document.createElement('li');li.textContent=text;return li;}));
    $('lastActionPanel').hidden=!view.lastAction;$('lastActionText').textContent=actionDescription();renderLibrary();renderBoard(game);
    if(evaluation){syncExerciseEvaluation(evaluation,view);renderEvaluation(evaluation.getState());}
  }
  function loadDefinition(def){
    evaluation?.setEnabled(false);evaluation?.reset();$('analysisEnabled').checked=false;$('evaluationRail').hidden=true;$('evaluationInfo').hidden=true;
    selectedId=null;moveMode='offball';hintsUsed=0;passRun=false;disguise=false;lastBoard=null;$('errorMessage').textContent='';
    controller.load(def);progress={...progress,lastId:def.id};save();
  }
  controller=createExerciseController({onChange:render,onError:text=>{$('errorMessage').textContent=text;}});
  function renderEvaluation(value){
    const display=exerciseEvaluationDisplay(value,{complete:state?.session.status!=='active'});
    $('evaluationRail').hidden=!value.enabled;$('evaluationInfo').hidden=!value.enabled;
    $('evaluationFill').style.height=`${display.share*100}%`;
    $('evaluationScore').textContent=display.scoreText;
    $('evaluationInfo').textContent=display.info;
  }
  evaluation=createEvaluation({onUpdate:renderEvaluation});
  $('exerciseList').addEventListener('click',event=>{const id=event.target.closest('[data-exercise-id]')?.dataset.exerciseId;const def=EXERCISES.find(def=>def.id===id);if(def)loadDefinition(def);});
  const filterChanged=()=>{
    filterBlocked=!selectFilteredExercise(EXERCISES,filters(),state?.session.definitionId);
    syncExerciseFilters(controller,EXERCISES,filters(),loadDefinition,{allowResume:!document.hidden});
    render(controller.getState());
  };
  $('themeFilter').addEventListener('change',filterChanged);$('difficultyFilter').addEventListener('change',filterChanged);
  $('playBtn').addEventListener('click',()=>{selectedId=exerciseStartingPiece(state.session.game,state.session.playerTeam);moveMode=state.session.game.phase==='attackMove'?'dribble':'offball';$('errorMessage').textContent='';controller.start();});
  $('retryBtn').addEventListener('click',()=>{const def=state.session.definition;loadDefinition(def);controller.start();});
  $('undoBtn').addEventListener('click',()=>{$('errorMessage').textContent='';selectedId=null;controller.undo();});
  $('nextBtn').addEventListener('click',()=>{const next=nextFilteredExercise(EXERCISES,filters(),state.session.definitionId);if(next)loadDefinition(next);});
  $('hintBtn').addEventListener('click',()=>{hintsUsed=Math.min(hintsUsed+1,state.session.definition.hints?.length||0);render(state);});
  $('offballBtn').addEventListener('click',()=>setMode('offball'));$('dribbleBtn').addEventListener('click',()=>setMode('dribble'));$('bonusBtn').addEventListener('click',()=>setMode('bonus'));
  $('passRunEnabled').addEventListener('change',()=>{passRun=$('passRunEnabled').checked;});$('disguiseEnabled').addEventListener('change',()=>{disguise=$('disguiseEnabled').checked;render(state);});
  $('endBtn').addEventListener('click',()=>{$('errorMessage').textContent='';controller.play({type:'skip'});});
  $('analysisEnabled').addEventListener('change',()=>{if(state.session.status!=='active')evaluation.suspend();evaluation.setEnabled($('analysisEnabled').checked);syncExerciseEvaluation(evaluation,state);renderEvaluation(evaluation.getState());});
  $('exerciseBoard').addEventListener('click',event=>{
    const button=event.target.closest('[data-x]');if(!button||!playable())return;
    const x=Number(button.dataset.x),y=Number(button.dataset.y),game=state.session.game,target=targets().find(t=>t.x===x&&t.y===y),piece=game.pieces.find(p=>p.x===x&&p.y===y);
    $('errorMessage').textContent='';
    if(target){
      if(target.type==='cornerTaker')controller.play({type:'cornerTaker',pieceId:target.pieceId});
      else if(isKick(game))controller.play({type:'kick',x,y,passRun});
      else controller.play({type:'move',pieceId:selectedId,x,y,freePawn:moveMode==='bonus'});
      return;
    }
    if(piece?.team===state.session.playerTeam){selectedId=piece.id;if(game.phase==='attackMove'&&!game.restart&&piece.id===game.ball.carrierId)moveMode='dribble';else if(moveMode==='dribble')moveMode='offball';render(state);}
    else $('errorMessage').textContent='Select a piece, then choose one of its highlighted legal destinations.';
  });
  $('exerciseBoard').addEventListener('keydown',event=>{
    const button=event.target.closest('[data-x]');if(!button)return;
    const direction={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[event.key];if(!direction)return;
    event.preventDefault();const x=Math.max(0,Math.min(W-1,Number(button.dataset.x)+direction[0])),y=Math.max(0,Math.min(H-1,Number(button.dataset.y)+direction[1]));focusedSquare={x,y};for(const square of squares)square.tabIndex=Number(square.dataset.x)===x&&Number(square.dataset.y)===y?0:-1;squares[y*W+x].focus();
  });
  for(const id of['goalTop','goalBottom'])$(id).addEventListener('click',event=>{const button=event.target.closest('[data-x]');if(!button||!playable()||button.disabled)return;$('errorMessage').textContent='';controller.play({type:'kick',x:Number(button.dataset.x),y:Number(button.dataset.y),disguise});});
  window.addEventListener('pagehide',()=>{controller.suspend();evaluation.suspend();});
  window.addEventListener('pageshow',()=>{if(!filterBlocked)controller.resume();syncExerciseEvaluation(evaluation,state);renderEvaluation(evaluation.getState());});
  document.addEventListener('visibilitychange',()=>{if(document.hidden){controller.suspend();evaluation.suspend();}else{if(!filterBlocked)controller.resume();syncExerciseEvaluation(evaluation,state);renderEvaluation(evaluation.getState());}});
  loadDefinition(selectFilteredExercise(EXERCISES,filters(),progress.lastId)||EXERCISES[0]);
  return {controller,evaluation};
}
if(typeof document!=='undefined'&&document.getElementById('exerciseBoard'))initExercisePage();
