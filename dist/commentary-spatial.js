/** Technical commentary from public geometry and committed actions only.
 * No search, random draws, hidden shot targets, or rule mutations occur here.
 */
import {BOARD_WIDTH, BOARD_HEIGHT, BOARD_CENTER_X, TYPES, rlBoardGeometry, legalKicks, legalMoves, inOwnBox} from './engine.js?v=e7f3cce731e9';

const TEAMS = ['white', 'black'];
const NAMES = {white: 'Ivory', black: 'Obsidian'};
const ROLES = {K: 'keeper', Q: 'queen', R: 'rook', B: 'bishop', N: 'knight', P: 'pawn'};
const NUMBERS = {1: 'one', 2: 'two', 3: 'three'};
const CACHE = new WeakMap();
const other = team => team === 'white' ? 'black' : 'white';
const point = value => Number.isInteger(value?.x) && Number.isInteger(value?.y)
  && value.x >= 0 && value.x < BOARD_WIDTH && value.y >= 0 && value.y < BOARD_HEIGHT;
const distance = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
const gain = (team, from, to) => (team === 'white' ? -1 : 1) * (to.y - from.y);
const depth = (team, p) => team === 'white' ? p.y + 1 : BOARD_HEIGHT - p.y;
const central = p => Math.abs(p.x - BOARD_CENTER_X) <= 2.5;
const wide = p => Math.abs(p.x - BOARD_CENTER_X) >= 3.5;
const role = piece => `${ROLES[piece?.type] || 'player'}${NUMBERS[/([123])$/.exec(piece?.id || '')?.[1]] ? ` ${NUMBERS[/([123])$/.exec(piece.id)[1]]}` : ''}`;
const named = piece => `${NAMES[piece.team]}'s ${role(piece)}`;
const laneName = (a, b) => a.x === b.x ? 'vertical file' : a.y === b.y ? 'horizontal rank' : 'diagonal';

function validState(state) {
  if (!state || !TEAMS.includes(state.attack) || !['attackMove', 'defendMove', 'kick', 'passRun'].includes(state.phase)
    || state.restart || state.pendingShot || !point(state.ball) || !Number.isInteger(state.turn)
    || !Array.isArray(state.pieces) || !state.pieces.length) return false;
  if (state.boardDimensions && (state.boardDimensions.width !== BOARD_WIDTH || state.boardDimensions.height !== BOARD_HEIGHT)) return false;
  const ids = new Set(), squares = new Set();
  for (const piece of state.pieces) {
    if (!piece || typeof piece.id !== 'string' || !piece.id || !TEAMS.includes(piece.team) || !TYPES.includes(piece.type) || !point(piece)
      || ids.has(piece.id) || squares.has(`${piece.x},${piece.y}`)) return false;
    ids.add(piece.id); squares.add(`${piece.x},${piece.y}`);
  }
  if (state.ball.carrierId != null) {
    const carrier = state.pieces.find(piece => piece.id === state.ball.carrierId);
    if (!carrier || carrier.team !== state.attack || carrier.x !== state.ball.x || carrier.y !== state.ball.y) return false;
  }
  return true;
}

function context(state) {
  if (!validState(state)) return null;
  const cached = CACHE.get(state);
  if (cached) return cached;
  const carrier = state.pieces.find(piece => piece.id === state.ball.carrierId);
  if (!carrier || carrier.type === 'K') return null;
  const geometry = rlBoardGeometry(state);
  const kicks = legalKicks({...state, phase: 'kick'});
  const outlets = kicks.filter(kick => !kick.goal && !kick.offside && kick.receiverId)
    .map(kick => ({kick, piece: state.pieces.find(piece => piece.id === kick.receiverId)}))
    .filter(({piece}) => piece && piece.team === carrier.team && piece.type !== 'K' && piece.id !== carrier.id
      && geometry.onside(piece, carrier) && !geometry.flagged(piece));
  const result = {state, carrier, geometry, kicks, outlets,
    defenders: state.pieces.filter(piece => piece.team !== carrier.team),
    teammates: state.pieces.filter(piece => piece.team === carrier.team && piece.type !== 'K' && piece.id !== carrier.id)};
  CACHE.set(state, result);
  return result;
}

function liveFact(type, team, text, ids, details = {}) {
  // Role order matters: A supporting carrier B is a different fact from B
  // supporting carrier A, even though the same two pieces are involved.
  return {type, key: [type, team, ...new Set(ids.filter(Boolean))].join(':'), text, team, live: true, ...details};
}
function pastFact(type, team, text, before, after, action, ids, details = {}) {
  return {type, key: [type, team, after.turn, action.pieceId, action.from.x, action.from.y, action.to.x, action.to.y, ...ids.filter(Boolean)].join(':'),
    text, team, live: false, ...details};
}
function nativeRay(piece, target) {
  const dx = target.x - piece.x, dy = target.y - piece.y;
  if (!dx && !dy || piece.type === 'N') return false;
  const straight = !dx || !dy, diagonal = Math.abs(dx) === Math.abs(dy);
  return ['P', 'R'].includes(piece.type) ? straight : piece.type === 'B' ? diagonal : straight || diagonal;
}
function laneBlocker(ctx, target) {
  const {carrier, geometry, state} = ctx;
  if (!nativeRay(carrier, target) || !geometry.onside(target, carrier) || geometry.flagged(target)
    || geometry.canPass(carrier, target) || distance(carrier, target) > 8) return null;
  const steps = distance(carrier, target), sx = Math.sign(target.x - carrier.x), sy = Math.sign(target.y - carrier.y);
  for (let step = 1; step < steps; step++) {
    const piece = state.pieces.find(piece => piece.x === carrier.x + sx * step && piece.y === carrier.y + sy * step);
    if (piece) return piece.team !== carrier.team ? piece : null;
  }
  return null;
}
function shotCorridor(carrier, piece) {
  if (gain(carrier.team, carrier, piece) <= 0) return false;
  const goalY = carrier.team === 'white' ? -0.5 : BOARD_HEIGHT - 0.5;
  const t = (piece.y - carrier.y) / (goalY - carrier.y);
  if (t <= 0 || t > 1.15) return false;
  const left = carrier.x + (4.5 - carrier.x) * t, right = carrier.x + (8.5 - carrier.x) * t;
  return piece.x >= Math.min(left, right) - 0.75 && piece.x <= Math.max(left, right) + 0.75;
}
function directTackles(state, piece, carrier) {
  return legalMoves(state, piece.id).some(move => move.type === 'tackle' && move.targetId === carrier.id);
}
function pawnSetup(ctx, piece) {
  const {state, carrier, geometry} = ctx;
  if (state.phase !== 'defendMove' || state.positionBudget?.normalUsed || state.positionBudget?.pawnUsed
    || piece.type !== 'P' || geometry.flagged(piece) || directTackles(state, piece, carrier)) return false;
  return legalMoves(state, piece.id, {freePawn: true}).some(move => {
    const projected = {...state, pieces: state.pieces.map(player => player.id === piece.id ? {...player, x: move.x, y: move.y} : player),
      positionBudget: {...state.positionBudget, normalUsed: false, pawnUsed: true}};
    return directTackles(projected, {...piece, x: move.x, y: move.y}, carrier);
  });
}

/** Current, revalidatable tactical facts. Every key names its involved pieces. */
export function commentaryPositionFacts(state) {
  try {
    const ctx = context(state);
    if (!ctx) return [];
    const {carrier, geometry, kicks, defenders, outlets} = ctx, facts = [];
    const outfield = defenders.filter(piece => piece.type !== 'K');
    const keeper = defenders.find(piece => piece.type === 'K');
    const attackingShots = kicks.filter(kick => kick.goal === carrier.team && !kick.offside);
    if (depth(carrier.team, carrier) <= 5 && keeper && inOwnBox(keeper.team, keeper.x, keeper.y)
      && attackingShots.length && attackingShots.every(kick => !kick.shotModel?.blockerIds?.length)
      && !outfield.some(piece => geometry.controls(piece, carrier, {bonus: true}) > 0 || shotCorridor(carrier, piece))) {
      facts.push(liveFact('oneOnOne', carrier.team,
        `${named(carrier)} is one on one with the keeper!`, [carrier.id, keeper.id],
        {pieceId: carrier.id, keeperId: keeper.id, urgent: true}));
    }
    if (state.phase === 'defendMove') {
      for (const defender of defenders) {
        if (!geometry.flagged(defender) && directTackles(state, defender, carrier)) facts.push(liveFact('pressing', defender.team,
          `${named(defender)} has the ${role(carrier)} under pressure!`, [carrier.id, defender.id],
          {pieceId: defender.id, carrierId: carrier.id, defenderId: defender.id, urgent: true}));
        else if (pawnSetup(ctx, defender)) facts.push(liveFact('pawnSetup', defender.team,
          `${named(defender)} can use a free step for a diagonal challenge.`, [carrier.id, defender.id],
          {pieceId: defender.id, carrierId: carrier.id, defenderId: defender.id}));
      }
    }
    const screenedShot = attackingShots.find(kick => kick.shotModel?.blockerIds?.length);
    const shotBlocker = screenedShot && defenders.find(piece => piece.id === screenedShot.shotModel.blockerIds[0]);
    if (shotBlocker) facts.push(liveFact('shotTraffic', carrier.team,
      `${named(shotBlocker)} screens a shooting lane; the ${role(carrier)} faces traffic.`,
      [carrier.id, shotBlocker.id], {pieceId: carrier.id, defenderId: shotBlocker.id}));
    if (wide(carrier) && depth(carrier.team, carrier) <= 8) {
      for (const {piece: receiver} of outlets) {
        if (central(receiver) && depth(carrier.team, receiver) <= 6 && Math.abs(receiver.x - carrier.x) >= 3) {
          facts.push(liveFact('crossSupport', carrier.team,
            `${named(carrier)} can cross to the ${role(receiver)} in the middle.`, [carrier.id, receiver.id],
            {pieceId: carrier.id, receiverId: receiver.id, supporterId: receiver.id}));
        }
      }
    }
    for (const target of ctx.teammates) {
      if (gain(carrier.team, carrier, target) < 0) continue;
      const blocker = laneBlocker(ctx, target);
      if (blocker) facts.push(liveFact('blockedLane', blocker.team,
        `${named(blocker)} screens the ${role(carrier)}'s passing lane to the ${role(target)}.`, [carrier.id, blocker.id, target.id],
        {pieceId: carrier.id, receiverId: target.id, defenderId: blocker.id}));
    }
    for (const {piece: receiver} of [...outlets].sort((a, b) => distance(carrier, a.piece) - distance(carrier, b.piece) || a.piece.id.localeCompare(b.piece.id))) {
      if (distance(carrier, receiver) <= 5) facts.push(liveFact('support', carrier.team,
        carrier.type === 'N'
          ? `${named(receiver)} offers the ${role(carrier)} an L-shaped jumping pass.`
          : `${named(receiver)} supports the ${role(carrier)} along an open ${laneName(carrier, receiver)}.`, [carrier.id, receiver.id],
        {pieceId: carrier.id, receiverId: receiver.id, supporterId: receiver.id}));
    }
    return facts;
  } catch { return []; }
}

function isCross(team, from, to) {
  return wide(from) && depth(team, from) <= 8 && central(to) && depth(team, to) <= 6 && Math.abs(to.x - from.x) >= 3;
}
function nearbyLineDefenders(ctx, from, to) {
  const dy = to.y - from.y;
  if (!dy) return [];
  return ctx.defenders.filter(piece => piece.type !== 'K' && gain(ctx.carrier.team, from, piece) > 0 && gain(ctx.carrier.team, piece, to) > 0
    && Math.abs(piece.x - (from.x + (to.x - from.x) * (piece.y - from.y) / dy)) <= 2);
}

/** Highest-priority spatial fact about an already committed public action. */
export function commentaryTransitionFact(before, after, {passes = []} = {}) {
  try {
    if (!validState(before) || !validState(after)) return null;
    const action = after.lastAction;
    if (!action || !['kick', 'move'].includes(action.type) || !point(action.from) || !point(action.to)) return null;
    const actorBefore = before.pieces.find(piece => piece.id === action.pieceId);
    const actor = after.pieces.find(piece => piece.id === action.pieceId);
    if (!actorBefore || !actor || action.team !== actor.team || actorBefore.team !== actor.team
      || actorBefore.x !== action.from.x || actorBefore.y !== action.from.y) return null;
    const team = actor.team, beforeCtx = context(before), afterCtx = context(after);
    const details = {pieceId: actor.id};
    const make = (type, text, ids = [], extra = {}) => pastFact(type, team, text, before, after, action, ids, {...details, ...extra});
    if (action.type === 'kick') {
      if (!beforeCtx || beforeCtx.carrier.id !== actor.id || action.outcome !== 'complete' || before.attack !== after.attack
        || after.ball.x !== action.to.x || after.ball.y !== action.to.y) return null;
      const receiver = after.pieces.find(piece => piece.id === action.receiverId && piece.id === after.ball.carrierId && piece.team === team);
      if (action.receiverId && !receiver) return null;
      const declared = beforeCtx.kicks.find(kick => !kick.goal && !kick.offside && kick.x === action.to.x && kick.y === action.to.y);
      if (!declared) return null;
      if (isCross(team, action.from, action.to)) {
        const cutback = gain(team, action.from, action.to) < 0;
        return make(cutback ? 'cutback' : 'cross', receiver
          ? `${named(actor)} ${cutback ? 'cut back into the middle' : 'crossed into the middle'}, finding the ${role(receiver)}.`
          : `${named(actor)} ${cutback ? 'cut back into the middle' : 'crossed into the middle'}; the ball stayed loose.`,
        [receiver?.id], {receiverId: receiver?.id || null});
      }
      if (!after.ball.carrierId && gain(team, action.from, action.to) >= 3 && nearbyLineDefenders(beforeCtx, action.from, action.to).length >= 2) {
        const geometry = rlBoardGeometry(after);
        const runner = beforeCtx.teammates.find(piece => beforeCtx.geometry.onside(piece, actorBefore)
          && !geometry.flagged(piece) && geometry.canMove(piece, after.ball)
          && legalMoves(after, piece.id).some(move => move.type === 'move' && move.x === after.ball.x && move.y === after.ball.y));
        if (runner) return make('throughBall', `Through ball from ${named(actor)}; the onside ${role(runner)} had a route.`,
          [runner.id], {runnerId: runner.id, urgent: true});
      }
      if (receiver && receiver.id !== actor.id && receiver.type !== 'K') {
        const prior = Array.isArray(passes) ? passes.filter(pass => pass && TEAMS.includes(pass.team) && Number.isInteger(pass.turn)
          && !(pass.turn === after.turn && pass.pieceId === actor.id && pass.receiverId === receiver.id)).at(-1) : null;
        if (prior?.team === team && prior.receiverId === actor.id && prior.turn <= after.turn && after.turn - prior.turn <= 6) {
          if (prior.pieceId === receiver.id && prior.ran === true) return make('oneTwo', `${named(actor)} found the ${role(receiver)} after its run. One-two completed!`,
            [receiver.id], {receiverId: receiver.id});
          if (prior.pieceId !== receiver.id) return make('linkUp', `${named(actor)} linked play, receiving then finding the ${role(receiver)}.`,
            [prior.pieceId, receiver.id], {receiverId: receiver.id, previousPasserId: prior.pieceId});
        }
      }
      return null;
    }
    if (actor.x !== action.to.x || actor.y !== action.to.y || !beforeCtx || !afterCtx
      || beforeCtx.carrier.id !== afterCtx.carrier.id || before.attack !== after.attack) return null;
    const carrier = afterCtx.carrier;
    if (actor.team !== carrier.team && before.phase === 'defendMove') {
      const newControl = afterCtx.geometry.controls(actor, carrier, {bonus: false}) > 0;
      const oldControl = beforeCtx.geometry.controls(actorBefore, beforeCtx.carrier, {bonus: false}) > 0;
      if (newControl && !oldControl && distance(actor, carrier) < distance(actorBefore, beforeCtx.carrier)) {
        return make('pressMove', `${named(actor)} closed down the ${role(carrier)}, moving into tackling range.`,
          [carrier.id], {defenderId: actor.id, carrierId: carrier.id});
      }
      for (const target of afterCtx.teammates) {
        const oldTarget = before.pieces.find(piece => piece.id === target.id);
        if (oldTarget && beforeCtx.outlets.some(outlet => outlet.piece.id === oldTarget.id)
          && laneBlocker(afterCtx, target)?.id === actor.id) {
          return make('screenMove', `${named(actor)} cut the ${role(carrier)}'s passing lane to the ${role(target)}.`,
            [carrier.id, target.id], {defenderId: actor.id, carrierId: carrier.id, receiverId: target.id});
        }
      }
      return null;
    }
    if (actor.team !== carrier.team) return null;
    if (actor.id !== carrier.id) {
      if (action.passRun === true && before.phase === 'passRun' && before.passRun?.pieceId === actor.id) {
        return make('passRun', `${named(actor)} ran after passing; the ${role(carrier)} kept possession.`,
          [carrier.id], {runnerId: actor.id, receiverId: carrier.id});
      }
      if (gain(team, action.from, action.to) >= 2 && afterCtx.geometry.onside(actor, carrier) && !afterCtx.geometry.flagged(actor)
        && afterCtx.outlets.some(outlet => outlet.piece.id === actor.id)) {
        const alreadyAvailable = beforeCtx.outlets.some(outlet => outlet.piece.id === actor.id);
        return make('run', alreadyAvailable
          ? `${named(actor)} ran forward, staying available for an onside pass.`
          : `${named(actor)} ran forward, opening an onside outlet for the ${role(carrier)}.`,
          [carrier.id], {runnerId: actor.id, carrierId: carrier.id});
      }
      return null;
    }
    if (gain(team, action.from, action.to) >= 2 && !afterCtx.defenders.some(piece => afterCtx.geometry.controls(piece, carrier, {bonus: true}) > 0)) {
      return make('dribbleSpace', `${named(actor)} carried forward into space, beyond immediate tackling threats.`, [], {carrierId: carrier.id});
    }
    return null;
  } catch { return null; }
}
