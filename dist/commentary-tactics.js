/** Rolling match analysis from committed public actions and completed rounds.
 * Claims describe observed play, never hidden AI plans, predictions or ratings.
 */
import {BOARD_WIDTH, BOARD_HEIGHT, BOARD_CENTER_X, BOX_FILES, BOX_DEPTH, legalKicks, legalMoves} from './engine.js?v=466456fd862d';

const TEAMS = ['white', 'black'];
const ROLES = {Q:'queen', R:'rook', B:'bishop', N:'knight', P:'pawn', K:'keeper'};
const scripts = {
  tactic_control: {text:'They controlled midfield with connected pieces and more than one passing route.', delivery:'normal'},
  tactic_wing_overload: {text:'They built numbers on the wing, with a central receiver available for the cross.', delivery:'normal'},
  tactic_pawn_trap: {text:'The pawn used its free step, then won the ball with a diagonal tackle. A clever pressing trap!', delivery:'urgent'},
  tactic_counterpress: {text:'They won the ball back near where they lost it. Quick counter-pressing!', delivery:'urgent'},
  tactic_file_attack: {text:'They cleared a shooting file for the rook, opening a direct route to goal.', delivery:'normal'},
  tactic_keeper_launch: {text:'The keeper lifted the ball over a player and found a teammate beyond halfway.', delivery:'normal'},
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
  shape_high_line_white: {text:'Ivory maintained a high defensive line, leaving space behind their outfield players.', delivery:'normal'},
  shape_high_line_black: {text:'Obsidian maintained a high defensive line, leaving space behind their outfield players.', delivery:'normal'},
  shape_midfield_crowded: {text:'The centre of the pitch was crowded, with both sides packing players around halfway.', delivery:'normal'},
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
const PATTERN_LABELS = Object.freeze({tactic_control:'Midfield control',tactic_wing_overload:'Wing overload',
  tactic_pawn_trap:'Pawn pressing trap',tactic_counterpress:'Counter-press',tactic_file_attack:'Cleared shooting lane',
  tactic_keeper_launch:'Keeper distribution',shape_high_line_white:'Ivory high line',shape_high_line_black:'Obsidian high line',
  shape_midfield_crowded:'Crowded midfield'});

// Shape is independent of possession. Observe several completed rounds, then
// check the current board again before offering (or starting) a recording.
function validDistribution(state) {
  const pieces=state?.pieces;
  return activeState(state) && Array.isArray(pieces) && pieces.length>0
    && pieces.every(p=>p && typeof p.id==='string' && isTeam(p.team) && ROLES[p.type] && point(p))
    && new Set(pieces.map(p=>p.id)).size===pieces.length
    && new Set(pieces.map(p=>`${p.x},${p.y}`)).size===pieces.length;
}
function distribution(state) {
  if(!validDistribution(state)) return null;
  const players=state.pieces.filter(p=>p.type!=='K'),high={};
  for(const team of TEAMS) {
    const side=players.filter(p=>p.team===team),back=Math.min(...side.map(p=>progress(team,p)));
    const line=side.filter(p=>progress(team,p)<=back+2);
    high[team]=side.length>=6 && back>=Math.floor((BOARD_HEIGHT-1)/2)-2
      && line.length>=3 && Math.max(...line.map(p=>p.x))-Math.min(...line.map(p=>p.x))>=4
      ? {minimumHomeDistance:back,linePieceIds:line.map(p=>p.id).sort()} : null;
  }
  const middle=players.filter(p=>central(p) && Math.abs(p.y-(BOARD_HEIGHT-1)/2)<=2);
  const counts=Object.fromEntries(TEAMS.map(team=>[team,middle.filter(p=>p.team===team).length]));
  return {high,crowded:players.length>=12 && middle.length>=8 && counts.white>=3 && counts.black>=3
    ? {centralPlayers:middle.length,whitePlayers:counts.white,blackPlayers:counts.black} : null};
}

function clearRookShot(state,rookId,target) {
  const rook=state.pieces?.find(p=>p.id===rookId && p.type==='R');
  if(!rook || state.ball?.carrierId!==rook.id || state.attack!==rook.team) return false;
  const kick=nativeKicks(state).find(k=>k.goal===rook.team && !k.offside && k.x===target.x && k.y===target.y);
  return !!kick && Array.isArray(kick.shotModel?.blockerIds) && !kick.shotModel.blockerIds.length
    && !state.pieces.some(p=>p.id!==rook.id && p.type!=='K' && p.x===rook.x && gain(rook.team,rook,p)>0);
}

// Read-only native previews preserve blockers, kicking patterns and kick-time
// offside. Nearness alone is never evidence of a usable passing connection.
function nativeKicks(state) {
  try {return legalKicks({...state,phase:'kick'});} catch {return [];}
}
function nativeOutlets(state) {
  const carrier=state.pieces?.find(p=>p.id===state.ball?.carrierId && p.team===state.attack);
  if(!carrier) return [];
  return nativeKicks(state).filter(k=>!k.goal && !k.offside && k.receiverId && k.receiverId!==carrier.id)
    .map(k=>({kick:k,piece:state.pieces.find(p=>p.id===k.receiverId && p.team===carrier.team && p.type!=='K')}))
    .filter(value=>value.piece);
}
function patternGeometry(state) {
  const carrier=state.pieces?.find(p=>p.id===state.ball?.carrierId && p.team===state.attack);
  if(!carrier || carrier.type==='K') return {outletIds:[],wing:null};
  const outlets=nativeOutlets(state),side=flank(carrier),team=carrier.team;
  const attackers=state.pieces.filter(p=>p.team===team && p.type!=='K' && distance(p,carrier)<=4 && flank(p)===side);
  const defenders=state.pieces.filter(p=>p.team!==team && distance(p,carrier)<=4);
  const receiver=outlets.find(({piece})=>central(piece) && Math.abs(piece.x-carrier.x)>=3
    && progress(team,piece)>=BOARD_HEIGHT-6 && gain(team,carrier,piece)>=-2);
  return {outletIds:outlets.map(({piece})=>piece.id),wing:side && progress(team,carrier)>Math.floor((BOARD_HEIGHT-1)/2)
    && attackers.length>=3 && attackers.length>defenders.length && receiver
    ? {side,carrierId:carrier.id,receiverId:receiver.piece.id,attackers:attackers.length,defenders:defenders.length} : null};
}
function nativeMoveMatches(state,action) {
  try {return legalMoves(state,action.pieceId,{freePawn:!!action.freePawn})
    .some(move=>move.x===action.to?.x && move.y===action.to?.y && (action.type!=='tackle' || move.type==='tackle' && move.targetId===action.targetId));}
  catch {return false;}
}

function snapshot(state, round, serial) {
  return {round,serial,team:state.attack,turn:state.turn,ball:{x:state.ball.x,y:state.ball.y,carrierId:state.ball.carrierId || null},
    geometry:patternGeometry(state),
    pieces:state.pieces.filter(p => p && isTeam(p.team) && ROLES[p.type] && point(p))
      .map(({id,team,type,x,y})=>({id,team,type,x,y}))};
}

/** A controller owns this bounded analyser and resets it for undo/new matches.
 * Observe may be called for every subaction; only completedRound records shape.
 */
export function createTacticalCommentary() {
  let serial = 0, round = 0, lastRound = null, turnover = null, lastAttack = null;
  let pawnSetup=null;
  const seen = new Set(), snapshots = [], possession = [], events = [];
  const patterns=[],losses=new Map();
  const distributionHistory=[];
  let lastDistributionRound=null;
  const goalSeen = new Set();
  function clearSequence() {snapshots.length=0; possession.length=0; turnover=null; lastRound=null;}
  function reset() {
    serial=round=0; lastRound=null; turnover=null; lastAttack=null;
    seen.clear(); snapshots.length=0; possession.length=0; events.length=0; goalSeen.clear();
    patterns.length=0;losses.clear();pawnSetup=null;
    distributionHistory.length=0;lastDistributionRound=null;
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
    const actorId=a.shooterId || a.pieceId;
    const actor=before.pieces?.find(p=>p.id===actorId);
    const actorTeam=actor?.team || teamOf(actorId);
    const addPattern=(key,team,evidence,rank)=>patterns.push({key,team,evidence,rank,serial,round});
    const genuineWin=changed && !before.restart && !after.restart && before.phase!=='kickoff'
      && ['tackle','interception','move','save','blockedShot'].includes(a.type)
      && !(a.type==='save' && a.backPass) && point(after.ball) && heldBy(after,after.attack);
    if(resetSequence || before.restart || before.phase==='kickoff') {patterns.length=0;losses.clear();pawnSetup=null;}
    if(resetSequence || before.restart || before.phase==='kickoff' || !validDistribution(after)) {
      distributionHistory.length=0;lastDistributionRound=null;
    }
    if(changed) patterns.length=0;
    for(const lost of losses.values()) if(before.attack!==lost.team && after.attack===before.attack && point(after.ball))
      lost.opponentAdvance=Math.max(lost.opponentAdvance,gain(before.attack,lost.from,after.ball));
    if(genuineWin) {
      const lost=losses.get(after.attack);
      if(lost && serial-lost.serial<=8 && round-lost.round<=1 && lost.opponentAdvance<3
          && distance(lost.from,after.ball)<=3 && (a.type==='interception' || a.type==='tackle' && a.outcome==='won'))
        addPattern('tactic_counterpress',after.attack,{pieceId:after.ball.carrierId,lossSerial:lost.serial,
          regainSerial:serial,distanceFromLoss:distance(lost.from,after.ball),opponentAdvance:lost.opponentAdvance},93);
      if(heldBy(before,before.attack)) losses.set(before.attack,{team:before.attack,from:{x:before.ball.x,y:before.ball.y},
        serial,round,opponentAdvance:Math.max(0,gain(after.attack,before.ball,after.ball))});
    }
    const setup=pawnSetup;
    if(setup && serial===setup.serial+1 && before.phase==='defendMove' && !before.restart && !after.restart
        && a.type==='tackle' && a.outcome==='won' && a.freePawn===false && actor?.type==='P'
        && actor.id===setup.pieceId && a.targetId===setup.carrierId && before.attack===setup.attack
        && before.ball.carrierId===setup.carrierId && before.positionBudget?.pawnUsed===true
        && before.positionBudget?.normalUsed===false && nativeMoveMatches(before,a) && genuineWin)
      addPattern('tactic_pawn_trap',actor.team,{pieceId:actor.id,carrierId:setup.carrierId,
        setupFrom:setup.from,setupTo:setup.to,contactSquare:{x:before.ball.x,y:before.ball.y},tackleSerial:serial},94);
    pawnSetup=null;
    if(a.type==='move' && a.freePawn===true && actor?.type==='P' && before.phase==='defendMove'
        && after.phase==='defendMove' && actor.team!==before.attack && !before.restart && !after.restart
        && heldBy(before,before.attack) && heldBy(after,before.attack)
        && before.positionBudget?.normalUsed===false && before.positionBudget?.pawnUsed===false
        && after.positionBudget?.pawnUsed===true && after.positionBudget?.normalUsed===false && nativeMoveMatches(before,a))
      pawnSetup={pieceId:actor.id,carrierId:before.ball.carrierId,attack:before.attack,serial,from:{...a.from},to:{...a.to}};
    if(a.type==='move' && actor && actor.team===before.attack && actor.id!==before.ball?.carrierId
        && !before.restart && !after.restart && !changed && nativeMoveMatches(before,a)) {
      const rook=before.pieces.find(p=>p.id===before.ball.carrierId && p.type==='R');
      const sameRook=rook && after.pieces.find(p=>p.id===rook.id && p.x===rook.x && p.y===rook.y);
      if(sameRook && after.ball.carrierId===rook.id && actor.x===rook.x && gain(rook.team,rook,actor)>0) {
        const oldShots=nativeKicks(before).filter(k=>k.goal===rook.team && !k.offside);
        const opened=nativeKicks(after).find(k=>k.goal===rook.team && !k.offside && !oldShots.some(old=>old.x===k.x && old.y===k.y));
        if(opened && clearRookShot(after,rook.id,opened)) addPattern('tactic_file_attack',rook.team,{pieceId:rook.id,clearingPieceId:actor.id,
          goalTarget:{x:opened.x,y:opened.y},clearedFrom:{...a.from},clearedTo:{...a.to}},89);
      }
    }
    if(before.restart?.type==='goalKick' && actor?.type==='K' && a.type==='kick' && a.outcome==='complete'
        && a.lofted===true && a.receiverId===after.ball?.carrierId && !after.restart && !changed) {
      const receiver=after.pieces.find(p=>p.id===a.receiverId && p.team===actor.team && p.type!=='K');
      const native=nativeKicks(before).find(k=>k.x===a.to?.x && k.y===a.to?.y && k.receiverId===receiver?.id
        && k.lofted && k.bypassedPieceId===a.bypassedPieceId && !k.offside);
      if(receiver && native && progress(actor.team,receiver)>Math.floor((BOARD_HEIGHT-1)/2))
        addPattern('tactic_keeper_launch',actor.team,{pieceId:actor.id,receiverId:receiver.id,
          bypassedPieceId:a.bypassedPieceId,from:{...a.from},to:{...a.to},distance:a.distance},88);
    }
    if (changed || resetSequence) {
      clearSequence();
      if(genuineWin) turnover={team:after.attack,from:{x:after.ball.x,y:after.ball.y},round,serial};
    }
    lastAttack=after.attack;
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
      if(validDistribution(after) && after.turn!==lastDistributionRound) {
        lastDistributionRound=after.turn;distributionHistory.push(distribution(after));
        if(distributionHistory.length>3) distributionHistory.shift();
      }
    }
    while(snapshots.length>10) snapshots.shift();
    while(possession.length>18 || possession[0] && round-possession[0].round>6) possession.shift();
    while(events.length>100 || events[0] && (serial-events[0].serial>120 || round-events[0].round>24)) events.shift();
    if(turnover && (round-turnover.round>3 || serial-turnover.serial>18 || turnover.team!==after.attack)) turnover=null;
    while(patterns.length>12 || patterns[0] && (serial-patterns[0].serial>8 || round-patterns[0].round>2)) patterns.shift();
    for(const [team,lost] of losses) if(serial-lost.serial>8 || round-lost.round>1) losses.delete(team);
  }
  function lines(state,{stats}={}) {
    if(!activeState(state) || lastAttack!==state.attack) return [];
    const output=[],team=state.attack;
    const add=(clipKey,callTeam,evidence,rank) => {
      const script=TACTICAL_COMMENTARY_SCRIPTS[clipKey];
      if(!script) return;
      const key=[clipKey,callTeam,evidence.pieceId || ''].join(':');
      output.push({kind:'trend',priority:1,text:script.text,delivery:script.delivery,clipKey,team:callTeam,
        id:`tactical:${key}:${serial}`,tactical:{type:clipKey,key,rank,live:false,evidenceScope:'rolling',observedSerial:serial,
          ...(PATTERN_LABELS[clipKey]?{label:PATTERN_LABELS[clipKey]}:{}),...evidence}});
    };
    const recent=snapshots.filter(s=>s.team===team).slice(-6),last=recent.at(-1),first=recent[0];
    if(turnover && turnover.team===team && gain(team,turnover.from,state.ball)>=4
        && round-turnover.round>=1 && round-turnover.round<=3)
      add('tactic_counter',team,{rounds:round-turnover.round,forwardGain:gain(team,turnover.from,state.ball),turnoverSerial:turnover.serial},100);
    const passes=possession.filter(p=>p.team===team && round-p.round<=4 && p.receiverId),lastPass=passes.at(-1);
    for(const pattern of patterns) if(pattern.team===team && (pattern.key!=='tactic_file_attack'
        || clearRookShot(state,pattern.evidence.pieceId,pattern.evidence.goalTarget)))
      add(pattern.key,team,{...pattern.evidence,patternSerial:pattern.serial},pattern.rank);
    const currentDistribution=distribution(state);
    if(distributionHistory.length===3 && currentDistribution) {
      for(const side of TEAMS) if(currentDistribution.high[side] && distributionHistory.every(s=>s.high[side]))
        add(`shape_high_line_${side}`,side,{rounds:3,...currentDistribution.high[side]},78);
      if(currentDistribution.crowded && distributionHistory.every(s=>s.crowded))
        add('shape_midfield_crowded',null,{rounds:3,...currentDistribution.crowded},79);
    }
    const lastThree=recent.slice(-3),middle=s=>central(s.ball) && progress(team,s.ball)>=5 && progress(team,s.ball)<=11;
    const connected=passes.slice(-3);
    if(lastThree.length===3 && lastThree.every(s=>heldBy(s,team) && middle(s) && s.geometry.outletIds.length>=2)
        && connected.length===3 && new Set(connected.flatMap(p=>[p.pieceId,p.receiverId])).size>=3)
      add('tactic_control',team,{rounds:3,pieceIds:[...new Set(connected.flatMap(p=>[p.pieceId,p.receiverId]))],
        minimumOutlets:Math.min(...lastThree.map(s=>s.geometry.outletIds.length))},87);
    const wing=recent.slice(-2);
    if(wing.length===2 && wing.every(s=>s.geometry.wing) && wing[0].geometry.wing.side===wing[1].geometry.wing.side)
      add('tactic_wing_overload',team,{rounds:2,...wing[1].geometry.wing},86);
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
      const stable=predicate=>recent.length>=6 && recent.every(predicate) && predicate(state);
      if(stable(s=>{const advanced=attackPieces(s).filter(p=>progress(team,p)>=BOARD_HEIGHT/2);return advanced.some(p=>flank(p)<0)&&advanced.some(p=>flank(p)>0);}))
        add('shape_wide',team,{rounds:6},67);
      if(stable(s=>{const advanced=attackPieces(s).filter(p=>progress(team,p)>=BOARD_HEIGHT/2);return advanced.length>=4&&advanced.every(central);}))
        add('shape_crowded',team,{rounds:6},68);
      if(stable(s=>{const pieces=defendPieces(s).filter(p=>progress(defendTeam,p)<=8);return pieces.length>=4&&pieces.filter(central).length>=4&&Math.max(...pieces.map(p=>p.y))-Math.min(...pieces.map(p=>p.y))<=4&&Math.max(...pieces.map(p=>p.x))-Math.min(...pieces.map(p=>p.x))<=6;}))
        add('shape_compact',defendTeam,{rounds:6},64);
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
    return output.sort((a,b)=>b.tactical.rank-a.tactical.rank||a.clipKey.localeCompare(b.clipKey)||String(a.team).localeCompare(String(b.team)));
  }
  return {observe,lines,reset};
}
