/**
 * Match-only, ability-relative ratings. These are an explainable v1 heuristic,
 * not learned population percentiles or a win-probability model. Raw impact is
 * kept separate from the 1–10 grade. Native legal kick geometry and the native
 * shot model measure lanes/support; no search, roll, random seed or future state
 * is inspected. Small role allowances below reflect Q's many rays, R's shooting
 * range, B's diagonals, N's jumps and P's restricted movement. They are declared
 * tuning constants, not empirically calibrated player values.
 *
 * Movement credit uses native forward capacity (P/K1, N2, long pieces8;
 * passes N2, other pieces10), retained control and new territory only. The
 * shared pawn/king bonus gets no automatic credit. Per-possession frontiers,
 * per-round category caps and a meaningful-shot floor suppress loop farming.
 * Method2 credits chances created while debiting missed big chances and lost
 * duels. Keeper performance uses conditional on-target xG prevented; ordinary
 * best legal positioning is its native expectation. Method3 increases useful
 * shot-stopping credit and distinguishes a worsening position from a forgone
 * optimal improvement. Method1/2 records keep their original calculation so a
 * finished or resumed older match is never silently regraded.
 * Missing old telemetry starts a partial record; it is never reconstructed from
 * a scorer list or the last80 undo states.
 */
import {BOARD_WIDTH, BOARD_HEIGHT, DRIBBLE_RANGE, GOAL_FILES, inOwnBox, legalKicks, legalMoves, shotModel} from '../../dist/engine.js?v=466456fd862d';

const IDS=/^(white|black)-(K|Q|[RBN][12]|P[123])$/;
const TEAMS=['white','black'],TYPES=['K','Q','R','B','N','P'];
const METHOD_VERSION=3;
const supportedLedger=saved=>[1,2,METHOD_VERSION].includes(saved?.version);
const CATEGORIES=['progress','creation','finishing','defending','goalkeeping','mistakes'];
const COUNTS=['goals','shots','xG','createdXG','tackles','tackleAttempts','interceptions','screens','support','saves','fouls','yellowCards','redCards','turnovers','progressSquares'];
const V2_COUNTS=['assists','keyPasses','bigChancesCreated','bigChancesMissed','duelsLost','lineClearances','penaltiesCommitted','penaltySaves','keeperXGFaced','goalsConceded','xGPrevented','errorsLeadingGoals','ownGoals'];
const V3_COUNTS=['keeperAdjustedXGPrevented'];
// This threshold describes a big chance in this game's probability model; it
// is not a calibrated real-football provider's definition.
const BIG_CHANCE_XG=.35;
const ALLOWANCE={
  Q:{creation:.32,finishing:.36,defending:.24},R:{creation:.27,finishing:.30,defending:.22},
  B:{creation:.24,finishing:.27,defending:.20},N:{creation:.22,finishing:.24,defending:.18},
  P:{creation:.16,finishing:.16,defending:.14},K:{creation:.25,finishing:.32,defending:.22},
};
const copy=value=>JSON.parse(JSON.stringify(value));
const clamp=(n,lo,hi)=>Math.max(lo,Math.min(hi,n));
const finite=n=>Number.isFinite(n);
const validId=id=>typeof id==='string'&&IDS.test(id);
const teamOf=id=>validId(id)?id.split('-')[0]:null;
const typeOf=id=>validId(id)?id.split('-')[1][0]:null;
const other=team=>team==='white'?'black':'white';
const point=p=>p&&Number.isInteger(p.x)&&Number.isInteger(p.y)&&p.x>=0&&p.x<BOARD_WIDTH&&p.y>=0&&p.y<BOARD_HEIGHT?{x:p.x,y:p.y}:null;
const progress=(team,p)=>point(p)?team==='white'?BOARD_HEIGHT-1-p.y:p.y:0;
const emptyCounts=version=>Object.fromEntries([...COUNTS,...(version>=2?V2_COUNTS:[]),...(version>=3?V3_COUNTS:[])].map(key=>[key,0]));
const emptyParts=()=>Object.fromEntries(CATEGORIES.map(key=>[key,0]));
const frontier=()=>({team:null,depth:0,threat:0,support:{}});

export function createPlayerRatings({partial=false}={}){
  return {version:METHOD_VERSION,partial:!!partial,transitions:0,players:{},frontier:frontier(),roundKey:null,caps:{},lastKey:null,errorCandidate:null};
}
function ensure(ledger,p){
  if(!p||!validId(p.id)||!TYPES.includes(p.type)||p.team!==teamOf(p.id))return null;
  const player=ledger.players[p.id]||={pieceId:p.id,team:p.team,type:p.type,nativeType:typeOf(p.id),start:point(p),actions:0,impact:0,merit:0,parts:emptyParts(),counts:emptyCounts(ledger.version)};
  player.type=p.type;return player;
}
function roster(ledger,game){for(const p of [...(game?.sentOff||[]),...(game?.pieces||[])])ensure(ledger,p);}
function validRecord(p,id,version){
  return p&&p.pieceId===id&&validId(id)&&p.team===teamOf(id)&&TYPES.includes(p.type)&&p.nativeType===typeOf(id)
    &&(p.start===null||!!point(p.start))&&Number.isInteger(p.actions)&&p.actions>=0&&p.actions<1e7
    &&finite(p.impact)&&finite(p.merit)&&Math.abs(p.impact)<1e7&&Math.abs(p.merit)<1e7
    &&CATEGORIES.every(k=>finite(p.parts?.[k])&&Math.abs(p.parts[k])<1e7)
    &&COUNTS.every(k=>finite(p.counts?.[k])&&p.counts[k]>=0&&p.counts[k]<1e7)
    &&(version<2||V2_COUNTS.every(k=>finite(p.counts?.[k])&&(k==='xGPrevented'||p.counts[k]>=0)&&Math.abs(p.counts[k])<1e7)
      &&Math.abs(p.counts.xGPrevented-(p.counts.keeperXGFaced-p.counts.goalsConceded))<1e-6)
    &&(version<3||V3_COUNTS.every(k=>finite(p.counts?.[k])&&Math.abs(p.counts[k])<1e7)
      &&p.counts.keeperAdjustedXGPrevented<=p.counts.xGPrevented+1e-6);
}
const validError=c=>c===null||c&&validId(c.pieceId)&&teamOf(c.pieceId)===c.team&&Number.isInteger(c.turn)&&c.turn>=0&&Number.isInteger(c.passes)&&c.passes>=0&&c.passes<=1;
export function restorePlayerRatings(saved,game,{partial=true}={}){
  const valid=supportedLedger(saved)&&typeof saved.partial==='boolean'&&Number.isInteger(saved.transitions)&&saved.transitions>=0
    &&saved.players&&typeof saved.players==='object'&&!Array.isArray(saved.players)&&Object.keys(saved.players).length<=22
    &&Object.entries(saved.players).every(([id,p])=>validRecord(p,id,saved.version))
    &&saved.frontier&&[null,...TEAMS].includes(saved.frontier.team)&&finite(saved.frontier.depth)&&saved.frontier.depth>=0&&saved.frontier.depth<BOARD_HEIGHT
    &&finite(saved.frontier.threat)&&saved.frontier.threat>=0&&saved.frontier.threat<=1
    &&saved.frontier.support&&typeof saved.frontier.support==='object'&&Object.entries(saved.frontier.support).every(([id,n])=>validId(id)&&finite(n)&&n>=0&&n<=1)
    &&(saved.roundKey===null||typeof saved.roundKey==='string')&&(saved.lastKey===null||typeof saved.lastKey==='string')
    &&saved.caps&&typeof saved.caps==='object'&&Object.entries(saved.caps).length<=132&&Object.values(saved.caps).every(n=>finite(n)&&n>=0&&n<=2)
    &&(saved.version<2||validError(saved.errorCandidate));
  // Preserve a valid snapshot exactly: restore must be equivalent to undo.
  if(valid)return copy(saved);
  const fresh=createPlayerRatings({partial});roster(fresh,game);return fresh;
}
function add(ledger,p,category,impact,merit){
  if(!p||!finite(impact)||!finite(merit))return;
  if(merit>0){
    const key=`${p.pieceId}:${category}`,used=ledger.caps[key]||0,available=Math.max(0,1.5-used),fraction=merit?Math.min(1,available/merit):1;
    impact*=fraction;merit*=fraction;ledger.caps[key]=used+merit;
  }
  p.impact+=impact;p.merit+=merit;p.parts[category]+=merit;
}
function award(ledger,p,category,impact){add(ledger,p,category,impact,impact/(ALLOWANCE[p?.type]?.[category]||.22));}
function shooting(game){return {...game,phase:'kick'};}
function bestThreat(game){
  if(!game?.ball?.carrierId||game.restart?.indirect)return 0;
  try{return Math.max(0,...legalKicks(shooting(game)).filter(k=>k.goal===game.attack&&!k.offside).map(k=>shotModel(game,k.x,k.y).probability));}catch{return 0;}
}
function supportThreat(game,p){
  if(!p||game.ball?.carrierId===p.id||p.team!==game.attack||game.restart)return 0;
  try{
    const delivery=legalKicks(shooting(game)).find(k=>k.receiverId===p.id&&!k.offside&&!k.goal);
    if(!delivery)return 0;
    const received={...game,phase:'kick',ball:{x:p.x,y:p.y,carrierId:p.id},offside:null,pendingShot:null};
    return bestThreat(received)*clamp(delivery.accuracy??1,0,1);
  }catch{return 0;}
}
function resetFrontier(ledger,game){
  ledger.frontier={team:game.attack,depth:progress(game.attack,game.ball),threat:bestThreat(game),support:{}};
}
function defensiveContext(team,spot,threat=0){
  const depth=progress(team,spot);
  return 1+.25*Math.max(0,1-depth/6)+.35*clamp(threat,0,1);
}
function rememberError(ledger,loser,before,after){
  if(ledger.version<2||!loser||after.restart||after.attack===loser.team)return;
  const depth=progress(loser.team,before.ball),threat=bestThreat(after);
  // Ambiguous scatter and probabilistic knight escapes are not labelled as
  // errors. Callers only supply high-certainty avoidable possession losses.
  if(depth<=Math.floor((BOARD_HEIGHT-1)/2)&&(depth<=5||inOwnBox(loser.team,before.ball.x,before.ball.y)||threat>=.08))
    ledger.errorCandidate={pieceId:loser.pieceId,team:loser.team,turn:after.turn,passes:0};
}
function forwardCredit(ledger,p,from,to,mode){
  if(!p||!point(from)||!point(to))return;
  const gain=Math.max(0,progress(p.team,to)-Math.max(progress(p.team,from),ledger.frontier.depth));
  ledger.frontier.depth=Math.max(ledger.frontier.depth,progress(p.team,to));
  if(!gain)return;
  const capacity=mode==='pass'?(p.type==='N'?2:10):p.type==='N'?2:['P','K'].includes(p.type)?1:DRIBBLE_RANGE;
  const used=Math.min(gain,capacity),impact=.012*used;
  add(ledger,p,'progress',impact,.12*used/capacity);p.counts.progressSquares+=used;
}
function transitionKey(before,after,action){
  return JSON.stringify([before.turn,before.phase,after.turn,after.phase,action.type,action.pieceId,action.from,action.to,action.outcome,action.card]);
}
function publicState(game){
  // Explicit inputs keep RNG state out even of incidental object spreads.
  return {phase:game.phase,pieces:game.pieces,ball:game.ball,attack:game.attack,restart:game.restart,
    offside:game.offside,pendingShot:game.pendingShot,turn:game.turn,lastAction:game.lastAction,
    sentOff:game.sentOff,positionBudget:game.positionBudget,foulsEnabled:game.foulsEnabled,
    looseBallKickOrigin:game.looseBallKickOrigin};
}

export function recordPlayerRatings(saved,before,after,{assistId=null,passProviderId=null}={}){
  if(!before||!after||before===after)return saved;
  before=publicState(before);after=publicState(after);
  const ledger=supportedLedger(saved)?copy(saved):createPlayerRatings({partial:true});
  let action=after.lastAction||{};
  if(action.type==='stalling'&&before.phase==='keeperReact'&&['goal','save','shotMiss','blockedShot'].includes(action.triggeringAction?.type))action=action.triggeringAction;
  const key=transitionKey(before,after,action);if(key===ledger.lastKey)return saved;
  roster(ledger,before);roster(ledger,after);
  const roundKey=`${before.turn}:${before.attack}`;
  if(ledger.roundKey!==roundKey){ledger.roundKey=roundKey;ledger.caps={};}
  if(ledger.frontier.team!==before.attack)resetFrontier(ledger,before);
  ledger.lastKey=key;ledger.transitions++;
  const actor=ledger.players[action.pieceId||action.offenderId],oldActor=before.pieces?.find(p=>p.id===actor?.pieceId);
  const resolving=before.phase==='keeperReact'&&['goal','save','shotMiss','blockedShot'].includes(action.type);
  if(actor&&!resolving&&!['skip','cornerTaker'].includes(action.type))actor.actions++;
  const get=id=>ledger.players[id];
  if(ledger.version>=2&&ledger.errorCandidate){
    const candidate=ledger.errorCandidate,within=after.turn-candidate.turn<=2;
    if(resolving){
      const shot=before.pendingShot;
      if(within&&!before.restart&&action.type==='goal'&&action.team===other(candidate.team)
        &&shot?.shootingTeam===action.team&&shot.scoringTeam===action.team){
        const offender=get(candidate.pieceId);
        if(offender){offender.counts.errorsLeadingGoals++;award(ledger,offender,'mistakes',-.12);}
      }
      ledger.errorCandidate=null;
    }else if(!within||before.restart||after.restart||after.attack===candidate.team)ledger.errorCandidate=null;
    else if(action.type==='kick'&&action.outcome==='complete'&&action.team===other(candidate.team)){
      candidate.passes++;
      if(candidate.passes>1)ledger.errorCandidate=null;
    }
  }

  if(resolving){
    const shot=before.pendingShot,shooter=get(shot?.shooterId),own=shot?.scoringTeam!==shot?.shootingTeam;
    const model=action.disguised?shotModel({...before,pieces:before.pieces.map(p=>p.id===action.keeperMove?.pieceId?{...p,...action.keeperMove.to}:p)}):action.shotModel||shotModel(before);
    const xg=clamp(model.probability||0,0,1);
    if(shooter){
      shooter.counts.shots++;shooter.counts.xG+=xg;
      if(own){if(action.type==='goal'){award(ledger,shooter,'mistakes',-.35);if(ledger.version>=2)shooter.counts.ownGoals++;}}
      else{
        const goal=action.type==='goal';if(goal)shooter.counts.goals++;
        // Method 1's chance-heavy weights are retained for saved matches.
        // Method 2 below separately penalizes wasted scoring opportunities.
        const quality=.4*Math.max(0,xg-.08),residual=.10*((goal?1:0)-xg);
        if(ledger.version<2){
          if(shot.penalty){const performance=.08*((goal?1:0)-xg);add(ledger,shooter,'finishing',performance,performance/.22);}
          else award(ledger,shooter,'finishing',quality+residual);
        }else{
          if(!goal&&xg>=BIG_CHANCE_XG)shooter.counts.bigChancesMissed++;
          // Useful chances earn credit, but wasting an easy finish must still
          // be negative. The native probability tempers sampled result blame.
          const performance=.12*Math.max(0,xg-.08)+.30*((goal?1:0)-xg);
          if(shot.penalty)add(ledger,shooter,'finishing',.30*((goal?1:0)-xg),.30*((goal?1:0)-xg)/.22);
          else if(performance<0)add(ledger,shooter,'finishing',performance,performance/.32);
          else award(ledger,shooter,'finishing',performance);
        }
        const provider=get(assistId);
        if(provider&&provider.team===shooter.team&&provider!==shooter&&!shot.penalty){
          provider.counts.createdXG+=xg;
          if(ledger.version<2)award(ledger,provider,'creation',.5*Math.max(0,xg-.08));
          else{
            provider.counts.keyPasses++;
            if(xg>=BIG_CHANCE_XG)provider.counts.bigChancesCreated++;
            if(goal)provider.counts.assists++;
            award(ledger,provider,'creation',.20*Math.max(0,xg-.08)+(goal?.04:0));
          }
        }
      }
    }
    if(!own){
      const live={...before,pieces:before.pieces.map(p=>p.id===action.keeperMove?.pieceId?{...p,...action.keeperMove.to}:p)};
      for(const id of model.blockerIds||[]){
        const blocker=get(id);if(!blocker||blocker.team!==shot.defendingTeam)continue;
        const without=shotModel({...live,pieces:live.pieces.filter(p=>p.id!==id)}).probability;
        const prevented=Math.max(0,without-xg);
        if(prevented>.005){
          blocker.counts.screens++;award(ledger,blocker,'defending',.3*prevented);
          const spot=live.pieces.find(p=>p.id===id);
          if(ledger.version>=2&&action.type==='blockedShot'&&action.blockerId===id&&spot
            &&GOAL_FILES.includes(spot.x)&&inOwnBox(spot.team,spot.x,spot.y)&&progress(spot.team,spot)<=1)blocker.counts.lineClearances++;
        }
      }
      const keeperPiece=before.pieces?.find(p=>p.type==='K'&&p.team===shot.defendingTeam),keeper=get(keeperPiece?.id);
      if(keeper&&['save','goal'].includes(action.type)&&!action.backPass){
        keeper.actions++;
        const heldModel=shotModel(before),held=heldModel.probability;
        const alternatives=[heldModel,...legalMoves(before,keeper.pieceId).map(move=>shotModel(before,undefined,undefined,move))];
        const bestModel=alternatives.reduce((best,candidate)=>candidate.probability<best.probability?candidate:best,heldModel),best=bestModel.probability;
        const reaction=Math.max(-.5,best-xg),coverage=Math.max(-.5,held-xg);
        const savedGoal=action.type==='save';if(savedGoal)keeper.counts.saves++;
        const residual=.12*((savedGoal?1:0)-(model.saveGivenOnTarget||0));
        // Coverage is useful raw impact, but using the keeper's ordinary best
        // legal reaction is the native expectation, not exceptional execution.
        if(ledger.version<2)add(ledger,keeper,'goalkeeping',.25*coverage+residual,(.25*reaction+residual)/.20);
        else{
          const onTarget=model.probability+model.saveProbability;
          const expected=onTarget>0?clamp(model.probability/onTarget,0,1):0;
          const conceded=action.type==='goal'?1:0,prevented=expected-conceded;
          keeper.counts.keeperXGFaced+=expected;keeper.counts.goalsConceded+=conceded;
          keeper.counts.xGPrevented=keeper.counts.keeperXGFaced-keeper.counts.goalsConceded;
          if(savedGoal&&shot.penalty)keeper.counts.penaltySaves++;
          // Conditional on-target xG excludes wide and body-blocked attempts.
          // The metric keeps its full signed value; the grade tempers one
          // random result and separately checks the chosen legal coverage.
          const bestOnTarget=bestModel.probability+bestModel.saveProbability;
          const nativeExpected=bestOnTarget>0?clamp(bestModel.probability/bestOnTarget,0,1):0;
          const selfCreatedDifficulty=Math.max(0,expected-nativeExpected);
          // A poor reaction must not manufacture a "harder" save and then earn
          // a better grade for surviving it. Keep the factual metric, remove
          // only that self-created difficulty from the execution assessment.
          const adjustedPrevention=prevented-selfCreatedDifficulty;
          // Other roles receive credit for useful completed work, while the
          // earlier keeper residual was near zero in expectation and then met
          // the steeper negative grade curve. Reward actual xG-weighted stops
          // more clearly, with tempered blame for a sampled concession.
          let performance=.80*adjustedPrevention;
          if(ledger.version>=3){
            const prior=keeper.counts.keeperAdjustedXGPrevented;
            const next=prior+adjustedPrevention;
            const grade=value=>(value>=0?1.8:.60)*value;
            keeper.counts.keeperAdjustedXGPrevented=next;
            // Assess the cumulative signed balance, not each shot's sign:
            // two routine stops must not outweigh a costly conceded goal
            // when total prevention is still below expectation.
            performance=grade(next)-grade(prior);
          }
          add(ledger,keeper,'goalkeeping',.25*coverage+.20*prevented,1.25*reaction+performance);
        }
      }
    }
  }else if(actor&&['tackle','tackleMiss'].includes(action.type)){
    actor.counts.tackleAttempts++;if(action.type==='tackle')actor.counts.tackles++;
    const odds=clamp(action.probability??1,0,1),threat=bestThreat(before),won=action.type==='tackle';
    if(ledger.version<2)award(ledger,actor,'defending',odds*(.06+.25*threat)+.06*((won?1:0)-odds));
    else{
      const context=defensiveContext(actor.team,before.ball,threat);
      if(won)award(ledger,actor,'defending',context*(odds*(.04+.18*threat)+.02*(1-odds)));
      else{actor.counts.duelsLost++;const loss=-context*odds*(.025+.10*threat);add(ledger,actor,'defending',loss,loss/.22);}
    }
    if(won){const lost=get(before.ball?.carrierId);if(lost){
      lost.counts.turnovers++;
      award(ledger,lost,'mistakes',-odds*(.04+.10*threat)*(ledger.version>=2?defensiveContext(lost.team,before.ball):1));
      if(ledger.version>=2){lost.counts.duelsLost++;if(odds>=.9)rememberError(ledger,lost,before,after);}
    }}
  }else if(actor&&action.type==='foul'){
    actor.counts.fouls++;if(action.card==='yellow'||action.secondYellow)actor.counts.yellowCards++;if(action.card==='red')actor.counts.redCards++;
    if(ledger.version<2)award(ledger,actor,'mistakes',-(.06+(action.outcome==='penalty'?.08:0)+(action.card==='yellow'?.04:action.card==='red'?.14:0)));
    else{
      const penalty=action.outcome==='penalty'||action.restart?.type==='penalty';if(penalty)actor.counts.penaltiesCommitted++;
      award(ledger,actor,'mistakes',-(.05+(penalty?.14:0)+(action.card==='yellow'?.05:action.card==='red'?.15:0))*defensiveContext(actor.team,before.ball));
    }
  }else if(actor&&['offside','stalling','timeout'].includes(action.type)){
    actor.counts.turnovers++;award(ledger,actor,'mistakes',-.12);
  }else if(actor&&['interception','out','miss'].includes(action.type)&&after.attack!==before.attack){
    actor.counts.turnovers++;
    const uncertain=(action.accuracy??1)<1?.35:1,danger=.5+Math.max(0,8-progress(actor.team,before.ball))/8;
    award(ledger,actor,'mistakes',-.12*uncertain*danger);
    if(ledger.version>=2&&action.type==='interception'&&(action.accuracy??1)===1)rememberError(ledger,actor,before,after);
    const interceptor=get(action.receiverId);
    if(action.type==='interception'&&interceptor&&interceptor.team!==actor.team){interceptor.counts.interceptions++;award(ledger,interceptor,'defending',.08*uncertain);}
  }

  if(!resolving&&actor&&action.type==='kick'&&action.outcome==='complete'&&after.ball?.carrierId&&teamOf(after.ball.carrierId)===actor.team&&after.ball.carrierId!==actor.pieceId){
    forwardCredit(ledger,actor,action.from,action.to,'pass');
  }else if(!resolving&&actor&&action.type==='move'&&after.ball?.carrierId===actor.pieceId&&after.attack===before.attack){
    if(before.ball?.carrierId===actor.pieceId)forwardCredit(ledger,actor,action.from,action.to,'dribble');
    else if(action.collection&&!action.selfPassCollection){
      const provider=get(passProviderId);
      if(provider&&provider.team===actor.team&&provider!==actor)forwardCredit(ledger,provider,before.looseBallKickOrigin?.from||before.ball,action.to,'pass');
    }
  }
  if(!resolving&&actor&&action.type==='move'&&before.ball?.carrierId&&before.ball.carrierId===after.ball?.carrierId&&actor.pieceId!==before.ball.carrierId&&!before.restart){
    const oldThreat=bestThreat(before),newThreat=bestThreat(after),same=actor.team===before.attack;
    const delta=same?Math.max(0,newThreat-Math.max(oldThreat,ledger.frontier.threat)):oldThreat-newThreat;
    // Outfield screens use symmetric credit: reopening a lane cancels closing
    // it. A keeper's ordinary legal coverage is already its expected role,
    // including the shared bonus, just as a routine best shot reaction is.
    if(!same&&actor.type==='K'&&ledger.version>=2){
      let best=oldThreat;
      for(const move of ledger.version===2?legalMoves(before,actor.pieceId,{freePawn:!!action.freePawn}):[]){
        // Tackles receive their separate probability-aware contribution. Only
        // legal off-ball keeper positions compete with this positioning move.
        if(move.type==='tackle')continue;
        const candidate={...before,pieces:before.pieces.map(p=>p.id===actor.pieceId?{...p,x:move.x,y:move.y}:p)};
        best=Math.min(best,bestThreat(candidate));
      }
      // A normal move is not a missed save merely because another square
      // would have improved coverage more. Method3 debits only a position
      // that actually worsens the available threat; no positive move farming.
      const relative=Math.max(-.5,(ledger.version===2?best:oldThreat)-newThreat);
      add(ledger,actor,'defending',.3*(oldThreat-newThreat),.3*(ledger.version===2?relative:Math.min(0,relative))/ALLOWANCE.K.defending);
      if(delta>.02)actor.counts.screens++;
    }else if(Math.abs(delta)>.02){award(ledger,actor,same?'creation':'defending',.3*delta);if(!same&&delta>0)actor.counts.screens++;}
    if(same){
      const oldSupport=supportThreat(before,oldActor),newSupport=supportThreat(after,after.pieces.find(p=>p.id===actor.pieceId));
      const support=Math.max(0,newSupport-Math.max(oldSupport,ledger.frontier.support[actor.pieceId]||0));
      if(support>.04){actor.counts.support++;award(ledger,actor,'creation',.2*support);}
      ledger.frontier.support[actor.pieceId]=Math.max(ledger.frontier.support[actor.pieceId]||0,newSupport);
      ledger.frontier.threat=Math.max(ledger.frontier.threat,newThreat);
    }
  }
  if(after.attack!==before.attack)resetFrontier(ledger,after);
  return ledger;
}

export function playerRatingsSummary(saved,game){
  const ledger=supportedLedger(saved)?copy(saved):createPlayerRatings({partial:true});roster(ledger,game);
  const sentOff=new Set((game?.sentOff||[]).map(p=>p.id));
  const players=Object.values(ledger.players).map(p=>{
    const rating=clamp(6+(p.merit>=0?4*Math.tanh(p.merit/4):5*Math.tanh(p.merit/2.5)),1,10);
    const notes=[];const c=p.counts;
    if(c.goals)notes.push(`${c.goals} goal${c.goals===1?'':'s'}`);
    if(ledger.version>=2&&c.assists)notes.push(`${c.assists} assist${c.assists===1?'':'s'}`);
    if(c.shots)notes.push(`${c.xG.toFixed(2)} xG from ${c.shots} shot${c.shots===1?'':'s'}`);
    if(c.createdXG>.04)notes.push(`${c.createdXG.toFixed(2)} xG supplied`);
    if(ledger.version>=2){
      if(c.keyPasses)notes.push(`${c.keyPasses} key pass${c.keyPasses===1?'':'es'} leading to a shot`);
      if(c.bigChancesCreated)notes.push(`${c.bigChancesCreated} big chance${c.bigChancesCreated===1?'':'s'} created`);
      if(c.bigChancesMissed)notes.push(`${c.bigChancesMissed} big chance${c.bigChancesMissed===1?'':'s'} missed`);
    }
    if(c.tackles)notes.push(`${c.tackles} tackle${c.tackles===1?'':'s'} won`);
    if(c.interceptions)notes.push(`${c.interceptions} interception${c.interceptions===1?'':'s'}`);
    if(c.screens)notes.push('Reduced shooting lanes');
    if(c.support)notes.push('Provided receiving support');
    if(c.saves)notes.push(`${c.saves} save${c.saves===1?'':'s'}`);
    if(ledger.version>=2){
      if(c.keeperXGFaced||c.goalsConceded){
        notes.push(`${c.keeperXGFaced.toFixed(2)} on-target xG faced; ${c.goalsConceded} goal${c.goalsConceded===1?'':'s'} conceded`);
        notes.push(`${c.xGPrevented>=0?'+':''}${c.xGPrevented.toFixed(2)} xG prevented`);
      }
      if(c.penaltySaves)notes.push(`${c.penaltySaves} penalty save${c.penaltySaves===1?'':'s'}`);
      if(c.lineClearances)notes.push(`${c.lineClearances} goal-line clearance${c.lineClearances===1?'':'s'}`);
      if(c.duelsLost)notes.push(`${c.duelsLost} duel${c.duelsLost===1?'':'s'} lost`);
      if(c.penaltiesCommitted)notes.push(`${c.penaltiesCommitted} penalty${c.penaltiesCommitted===1?'':'s'} conceded`);
      if(c.errorsLeadingGoals)notes.push(`${c.errorsLeadingGoals} clear error${c.errorsLeadingGoals===1?'':'s'} leading to a goal`);
      if(c.ownGoals)notes.push(`${c.ownGoals} own goal${c.ownGoals===1?'':'s'}`);
    }
    if(c.progressSquares)notes.push(`Advanced into ${Math.round(c.progressSquares)} new square${c.progressSquares===1?'':'s'}`);
    if(c.turnovers)notes.push(`${c.turnovers} possession loss${c.turnovers===1?'':'es'}`);
    if(c.redCards)notes.push('Sent off');else if(c.yellowCards)notes.push('Yellow card');
    if(!notes.length)notes.push(p.actions<2?'Limited involvement':'Routine play');
    return {pieceId:p.pieceId,team:p.team,type:p.type,rating:Math.round(rating*10)/10,impact:Math.round(p.impact*1000)/1000,actions:p.actions,
      notes,sentOff:sentOff.has(p.pieceId),start:p.start,involvement:p.actions<2?'Limited involvement':'Recorded involvement',
      ...(ledger.version>=2?{metrics:copy(c)}:{})};
  }).sort((a,b)=>a.team.localeCompare(b.team)||a.pieceId.localeCompare(b.pieceId));
  return {partial:ledger.partial,methodVersion:ledger.version,legacyMethod:ledger.version<METHOD_VERSION,players};
}
