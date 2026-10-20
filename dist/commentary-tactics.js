/** Rolling match analysis from committed public actions and completed rounds.
 * Claims describe observed play, never hidden AI plans, predictions or ratings.
 */
import {BOARD_WIDTH, BOARD_HEIGHT, BOARD_CENTER_X, BOX_FILES, BOX_DEPTH} from './engine.js?v=df962903a48e';

const TEAMS = ['white', 'black'];
const ROLES = {Q:'queen', R:'rook', B:'bishop', N:'knight', P:'pawn', K:'keeper'};
const scripts = {
  tactic_counter: {text:'They won it back and drove forward quickly on the counterattack!', delivery:'urgent'},
  tactic_switch: {text:'They switched the attack across the pitch, changing the passing angle.', delivery:'normal'},
  tactic_combinations: {text:'Short passes linked different pieces and kept the ball moving.', delivery:'normal'},
  tactic_pressure: {text:'They kept possession in the final third over several rounds.', delivery:'normal'},
  tactic_centre: {text:'They progressed through the centre, gaining ground through the central files.', delivery:'normal'},
  tactic_wide: {text:'They advanced along the wing, making use of the outer files.', delivery:'normal'},
  tactic_patient: {text:'They circulated the ball but made little progress over recent rounds.', delivery:'normal'},
  shape_wide: {text:'Their attacking shape provided width on both sides of the pitch.', delivery:'normal'},
  shape_compact: {text:'Their defensive block stayed compact, with several pieces protecting central space.', delivery:'normal'},
  shape_crowded: {text:'Their attack clustered centrally, leaving little width across the pitch.', delivery:'normal'},
  shape_high_line: {text:'Their defensive line stayed high, leaving space behind the outfield pieces.', delivery:'normal'},
  shape_isolated: {text:'Their teammates remained far from the ball carrier over several rounds.', delivery:'normal'},
  shape_pawns: {text:'Their pawns stayed across the front of the box, screening central space.', delivery:'normal'},
  shape_balance: {text:'Their shape kept pieces behind the ball while others advanced.', delivery:'normal'},
  performance_keeper_reliable: {text:'The keeper made repeated saves and kept those shots out.', delivery:'normal'},
};
for (const role of ['queen','rook','bishop','knight','pawn']) {
  scripts[`performance_carry_${role}`] = {text:`The ${role} gained ground with repeated forward carries.`, delivery:'normal'};
  scripts[`performance_progress_${role}`] = {text:`The ${role} repeatedly moved the ball forward with completed passes.`, delivery:'normal'};
  scripts[`performance_ballwinner_${role}`] = {text:`The ${role} won possession with repeated successful tackles.`, delivery:'normal'};
  scripts[`performance_creator_${role}`] = {text:`The ${role} supplied repeated assists, helping turn attacks into goals.`, delivery:'normal'};
  scripts[`performance_finisher_${role}`] = {text:`The ${role} scored more than once, finishing those chances.`, delivery:'normal'};
  scripts[`performance_wasteful_${role}`] = {text:`The ${role} lost possession repeatedly while trying to advance the ball.`, delivery:'normal'};
}
export const TACTICAL_COMMENTARY_SCRIPTS = Object.freeze(Object.fromEntries(Object.entries(scripts)
  .map(([key,value]) => [key,Object.freeze(value)])));

const teamOf = id => /^(white|black)-/.exec(id || '')?.[1] || null;
const isTeam = team => TEAMS.includes(team);
const point = p => Number.isInteger(p?.x) && Number.isInteger(p?.y)
  && p.x >= 0 && p.x < BOARD_WIDTH && p.y >= 0 && p.y < BOARD_HEIGHT;
const gain = (team,from,to) => (team === 'white' ? -1 : 1) * (to.y-from.y);
const progress = (team,p) => team === 'white' ? BOARD_HEIGHT-1-p.y : p.y;
const central = p => Math.abs(p.x-BOARD_CENTER_X) <= 2.5;
const flank = p => p.x <= 3 ? -1 : p.x >= BOARD_WIDTH-4 ? 1 : 0;
const distance = (a,b) => Math.max(Math.abs(a.x-b.x),Math.abs(a.y-b.y));
const activeState = s => s && isTeam(s.attack) && point(s.ball) && Array.isArray(s.pieces)
  && !s.restart && !s.pendingShot && ['attackMove','defendMove','kick','passRun'].includes(s.phase);
const actionOf = (before,after) => before?.phase === 'keeperReact' && after?.lastAction?.type === 'stalling'
  ? after.lastAction.triggeringAction || after.lastAction : after?.lastAction;
const heldBy = (state,team) => !!state?.ball?.carrierId && state.pieces?.some(p=>p.id===state.ball.carrierId
  && p.team===team && p.x===state.ball.x && p.y===state.ball.y);
const pieceRole = id => ROLES[/^(?:white|black)-([KQRBNP])/.exec(id || '')?.[1]];

function snapshot(state, round, serial) {
  return {round,serial,team:state.attack,turn:state.turn,ball:{x:state.ball.x,y:state.ball.y,carrierId:state.ball.carrierId || null},
    pieces:state.pieces.filter(p => p && isTeam(p.team) && ROLES[p.type] && point(p))
      .map(({id,team,type,x,y})=>({id,team,type,x,y}))};
}

/** A controller owns this bounded analyser and resets it for undo/new matches.
 * Observe may be called for every subaction; only completedRound records shape.
 */
export function createTacticalCommentary() {
  let serial = 0, round = 0, lastRound = null, turnover = null, lastAttack = null;
  const seen = new Set(), snapshots = [], possession = [], events = [];
  const goalSeen = new Set();
  function clearSequence() {snapshots.length=0; possession.length=0; turnover=null; lastRound=null;}
  function reset() {
    serial=round=0; lastRound=null; turnover=null; lastAttack=null;
    seen.clear(); snapshots.length=0; possession.length=0; events.length=0; goalSeen.clear();
  }
  function addEvent(type,pieceId,details={}) {
    if (!pieceRole(pieceId) || !isTeam(teamOf(pieceId))) return;
    events.push({type,pieceId,team:teamOf(pieceId),serial,round,...details});
  }
  function rememberGoal(stats,action,before,after) {
    const scorerId=action.shooterId || action.pieceId,team=action.team;
    if(action.type!=='goal' || teamOf(scorerId)!==team || !isTeam(team)
        || !Number.isFinite(before.score?.[team]) || after.score?.[team]!==before.score[team]+1) return;
    const key=[team,scorerId,after.turn].join(':');
    if(goalSeen.has(key)) return;
    goalSeen.add(key);addEvent('goal',scorerId,{goalTurn:after.turn});
    const record=Array.isArray(stats?.goals) ? stats.goals.find(g=>g.team===team&&g.scorerId===scorerId
      &&g.turn===after.turn&&g.ownGoal!==true) : null;
    if(record?.assistId && record.assistId!==scorerId && teamOf(record.assistId)===team)
      addEvent('assist',record.assistId,{goalTurn:after.turn,scorerId});
    while(goalSeen.size>120) goalSeen.delete(goalSeen.values().next().value);
  }
  function observe(before,after,{stats,completedRound=false}={}) {
    if (!before || !after || before===after || !isTeam(after.attack)) return;
    const a=actionOf(before,after);
    if (!a?.type) return;
    const fingerprint=JSON.stringify([after.turn,before.phase,after.phase,a.type,a.team,a.pieceId,a.shooterId,
      a.from?.x,a.from?.y,a.to?.x,a.to?.y,a.receiverId,a.outcome,after.attack,after.score?.white,after.score?.black]);
    if (seen.has(fingerprint)) return;
    seen.add(fingerprint); while(seen.size>160) seen.delete(seen.values().next().value);
    serial++;
    const changed=before.attack!==after.attack;
    const resetSequence=!!after.restart || ['kickoff','finished'].includes(after.phase);
    const genuineWin=changed && !before.restart && !after.restart && before.phase!=='kickoff'
      && ['tackle','interception','move','save','blockedShot'].includes(a.type)
      && !(a.type==='save' && a.backPass) && point(after.ball) && heldBy(after,after.attack);
    if (changed || resetSequence) {
      clearSequence();
      if(genuineWin) turnover={team:after.attack,from:{x:after.ball.x,y:after.ball.y},round,serial};
    }
    lastAttack=after.attack;
    const actorId=a.shooterId || a.pieceId;
    const actor=before.pieces?.find(p=>p.id===actorId);
    const actorTeam=actor?.team || teamOf(actorId);
    const complete=a.type==='kick' && a.outcome==='complete' && actorTeam===before.attack
      && actorTeam===after.attack && !before.restart && before.phase!=='kickoff' && point(a.from) && point(a.to);
    if (complete) {
      const receiver=after.pieces?.find(p=>p.id===after.ball?.carrierId && p.team===actorTeam && p.id!==actorId);
      const pass={type:'pass',serial,round,team:actorTeam,pieceId:actorId,receiverId:receiver?.id || null,
        from:{x:a.from.x,y:a.from.y},to:{x:a.to.x,y:a.to.y},gain:gain(actorTeam,a.from,a.to),
        length:distance(a.from,a.to)};
      possession.push(pass);
      if(receiver && actor?.type!=='K' && pass.gain>=2) addEvent('progress',actorId,{gain:pass.gain,receiverId:receiver.id});
    }
    if(a.type==='move' && actor?.type!=='K' && actorTeam===before.attack && actorTeam===after.attack
        && before.ball?.carrierId===actorId && after.ball?.carrierId===actorId && !a.collection
        && !a.passRun && point(a.from) && point(a.to) && gain(actorTeam,a.from,a.to)>0)
      addEvent('carry',actorId,{gain:gain(actorTeam,a.from,a.to)});
    if (a.type==='tackle' && a.outcome==='won' && changed && actorTeam===after.attack)
      addEvent('tackle',actorId);
    const failedAdvance=actorTeam===before.attack && actor?.type!=='K' && point(a.from) && point(a.to)
      && gain(actorTeam,a.from,a.to)>=1 && ['miss','interception','out','offside'].includes(a.type)
      && (after.attack!==actorTeam || after.restart?.team && after.restart.team!==actorTeam);
    if(failedAdvance) addEvent('loss',actorId);
    if (a.type==='save' && !a.backPass && before.phase==='keeperReact'
        && isTeam(before.pendingShot?.shootingTeam) && before.pendingShot.shootingTeam!==teamOf(a.keeperId) && pieceRole(a.keeperId)==='keeper')
      addEvent('save',a.keeperId);
    rememberGoal(stats,a,before,after);
    if(completedRound && activeState(after)) {
      const roundKey=[after.turn,after.attack].join(':');
      if(roundKey!==lastRound) {round++;lastRound=roundKey;snapshots.push(snapshot(after,round,serial));}
    }
    while(snapshots.length>10) snapshots.shift();
    while(possession.length>18 || possession[0] && round-possession[0].round>6) possession.shift();
    while(events.length>100 || events[0] && (serial-events[0].serial>120 || round-events[0].round>24)) events.shift();
    if(turnover && (round-turnover.round>3 || serial-turnover.serial>18 || turnover.team!==after.attack)) turnover=null;
  }
  function lines(state,{stats}={}) {
    if(!activeState(state) || lastAttack!==state.attack) return [];
    const output=[],team=state.attack;
    const add=(clipKey,callTeam,evidence,rank) => {
      const script=TACTICAL_COMMENTARY_SCRIPTS[clipKey];
      if(!script) return;
      const key=[clipKey,callTeam,evidence.pieceId || ''].join(':');
      output.push({kind:'trend',priority:1,text:script.text,delivery:script.delivery,clipKey,team:callTeam,
        id:`tactical:${key}:${serial}`,tactical:{type:clipKey,key,rank,live:false,observedSerial:serial,...evidence}});
    };
    const recent=snapshots.filter(s=>s.team===team).slice(-6),last=recent.at(-1),first=recent[0];
    if(turnover && turnover.team===team && gain(team,turnover.from,state.ball)>=4
        && round-turnover.round>=1 && round-turnover.round<=3)
      add('tactic_counter',team,{rounds:round-turnover.round,forwardGain:gain(team,turnover.from,state.ball),turnoverSerial:turnover.serial},100);
    const passes=possession.filter(p=>p.team===team && round-p.round<=4 && p.receiverId),lastPass=passes.at(-1);
    if(lastPass && serial-lastPass.serial<=7) {
      const run=passes.slice(-5),start=run.find(p=>flank(p.from) && flank(lastPass.to)===-flank(p.from));
      if(start && Math.abs(lastPass.to.x-start.from.x)>=7 && gain(team,start.from,lastPass.to)>=-2)
        add('tactic_switch',team,{passes:run.filter(p=>p.serial>=start.serial).length,from:start.from,to:lastPass.to},92);
      const short=passes.slice(-3);
      if(short.length===3 && short.every(p=>p.length<=5) && new Set(short.flatMap(p=>[p.pieceId,p.receiverId])).size>=3)
        add('tactic_combinations',team,{passes:3,pieceIds:[...new Set(short.flatMap(p=>[p.pieceId,p.receiverId]))]},80);
    }
    if(recent.length>=3) {
      const lastThree=recent.slice(-3),delta=gain(team,first.ball,last.ball);
      if(lastThree.every(s=>heldBy(s,team) && progress(team,s.ball)>=Math.ceil((BOARD_HEIGHT-1)*2/3)))
        add('tactic_pressure',team,{rounds:3,minimumProgress:Math.min(...lastThree.map(s=>progress(team,s.ball)))},76);
      if(delta>=4 && recent.filter(s=>central(s.ball)).length>=Math.ceil(recent.length*.75))
        add('tactic_centre',team,{rounds:recent.length,forwardGain:delta},72);
      if(delta>=4 && recent.filter(s=>flank(s.ball)).length>=Math.ceil(recent.length*.75))
        add('tactic_wide',team,{rounds:recent.length,forwardGain:delta},72);
      if(recent.length>=4 && passes.length>=3 && Math.abs(delta)<2
          && Math.max(...recent.map(s=>progress(team,s.ball)))-Math.min(...recent.map(s=>progress(team,s.ball)))<=3)
        add('tactic_patient',team,{rounds:recent.length,forwardGain:delta,passes:passes.length},55);
      const attackPieces=s=>s.pieces.filter(p=>p.team===team && p.type!=='K');
      const defendTeam=team==='white'?'black':'white';
      const defendPieces=s=>s.pieces.filter(p=>p.team===defendTeam && p.type!=='K');
      const stable=predicate=>recent.length>=6 && recent.every(predicate);
      if(stable(s=>{const advanced=attackPieces(s).filter(p=>progress(team,p)>=BOARD_HEIGHT/2);return advanced.some(p=>flank(p)<0)&&advanced.some(p=>flank(p)>0);}))
        add('shape_wide',team,{rounds:6},67);
      if(stable(s=>{const advanced=attackPieces(s).filter(p=>progress(team,p)>=BOARD_HEIGHT/2);return advanced.length>=4&&advanced.every(central);}))
        add('shape_crowded',team,{rounds:6},68);
      if(stable(s=>{const pieces=defendPieces(s).filter(p=>progress(defendTeam,p)<=8);return pieces.length>=4&&pieces.filter(central).length>=4&&Math.max(...pieces.map(p=>p.y))-Math.min(...pieces.map(p=>p.y))<=4&&Math.max(...pieces.map(p=>p.x))-Math.min(...pieces.map(p=>p.x))<=6;}))
        add('shape_compact',defendTeam,{rounds:6},64);
      if(stable(s=>{const pieces=defendPieces(s);return pieces.length>=6&&pieces.every(p=>progress(defendTeam,p)>=6);}))
        add('shape_high_line',defendTeam,{rounds:6,minimumHomeDistance:6},69);
      if(stable(s=>{const teammates=attackPieces(s).filter(p=>p.id!==s.ball.carrierId);return heldBy(s,team)&&teammates.length>0&&teammates.every(p=>distance(p,s.ball)>4);}))
        add('shape_isolated',team,{rounds:6,minimumTeammateDistance:5},70);
      if(stable(s=>{const pawns=s.pieces.filter(p=>p.team===defendTeam&&p.type==='P'&&BOX_FILES.includes(p.x)
          &&progress(defendTeam,p)>=BOX_DEPTH&&progress(defendTeam,p)<=BOX_DEPTH+2);return pawns.length>=2&&Math.max(...pawns.map(p=>p.x))-Math.min(...pawns.map(p=>p.x))>=2;}))
        add('shape_pawns',defendTeam,{rounds:6},65);
      if(stable(s=>{const pieces=attackPieces(s),behind=pieces.filter(p=>gain(team,p,s.ball)>0).length,ahead=pieces.filter(p=>gain(team,s.ball,p)>0).length;return behind>=3&&ahead>=3;}))
        add('shape_balance',team,{rounds:6},59);
    }
    const groups=new Map();
    for(const e of events) {const group=groups.get(e.pieceId)||[];group.push(e);groups.set(e.pieceId,group);}
    for(const [pieceId,record] of groups) {
      const role=pieceRole(pieceId),callTeam=teamOf(pieceId);
      if(!state.pieces.some(p=>p.id===pieceId)) continue;
      const count=type=>record.filter(e=>e.type===type).length;
      if(role==='keeper') {if(count('save')>=3)add('performance_keeper_reliable',callTeam,{pieceId,saves:count('save')},85);continue;}
      const forward=record.filter(e=>e.type==='progress'),totalGain=forward.reduce((n,e)=>n+e.gain,0);
      if(forward.length>=2 && totalGain>=6)add(`performance_progress_${role}`,callTeam,{pieceId,completedForwardPasses:forward.length,forwardGain:totalGain},83);
      const carries=record.filter(e=>e.type==='carry'),carriedGain=carries.reduce((n,e)=>n+e.gain,0);
      if(carries.length>=2 && carriedGain>=6)add(`performance_carry_${role}`,callTeam,{pieceId,forwardCarries:carries.length,forwardGain:carriedGain},82);
      if(count('tackle')>=2)add(`performance_ballwinner_${role}`,callTeam,{pieceId,successfulTackles:count('tackle')},86);
      if(count('assist')>=2)add(`performance_creator_${role}`,callTeam,{pieceId,verifiedAssists:count('assist')},90);
      if(count('goal')>=2)add(`performance_finisher_${role}`,callTeam,{pieceId,goals:count('goal')},91);
      if(count('loss')>=3)add(`performance_wasteful_${role}`,callTeam,{pieceId,forwardPossessionLosses:count('loss')},60);
    }
    return output.sort((a,b)=>b.tactical.rank-a.tactical.rank||a.clipKey.localeCompare(b.clipKey)||a.team.localeCompare(b.team));
  }
  return {observe,lines,reset};
}
