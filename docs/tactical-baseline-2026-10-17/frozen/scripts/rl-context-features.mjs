import {rlBoardGeometry, rlBoardFeatures} from './rl-features.mjs';

// Public state features for the second, contextual TD value family. The first
// seven retain the original feature meaning. All values are in White's frame;
// Black receives their exact negative. baseVector, when supplied, is always the
// original seven-component WHITE vector, regardless of requested team.
// The browser embeds this file after removing only the import above.
export const RL_CONTEXT_FEATURE_NAMES = Object.freeze([
  'possession', 'ballProgress', 'material', 'centerControl', 'openFiles', 'defensiveCover', 'centralReceivers',
  'actor', 'ordinaryMoveTempo', 'bonusMoveTempo', 'dribbleTempo', 'kickNowPossession',
  'carrierDepthSquared', 'carrierCentrality', 'carrierGoalOpening', 'carrierInGoalBox',
  'directTackleExposure', 'bonusTackleExposure', 'safePassOptions', 'safeForwardOptions',
  'centralPassQuality', 'finishingPassQuality', 'nearbyDefenderPressure', 'keeperDisplacement',
  'dribbleLimitPressure', 'ownHalfStallPressure', 'advancedCenterControl', 'advancedOpenFiles'
]);

export function rlContextValueFeatures(state, team = 'white', baseVector = null) {
  const clamp01 = value => Math.max(0, Math.min(1, Number(value) || 0));
  const sign = side => side === 'white' ? 1 : side === 'black' ? -1 : 0;
  const distance = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
  const progress = piece => clamp01((piece.team === 'white' ? 16 - piece.y : piece.y) / 16);
  const geometry = rlBoardGeometry(state), pieces = geometry.pieces, carrier = geometry.carrier;
  const owner = carrier?.team || state.restart?.team, possession = sign(owner);
  let original;
  if (baseVector) {
    if (baseVector.length !== 7 || !Array.from(baseVector).every(value => Number.isFinite(value) && Math.abs(value) <= 1)) {
      throw new TypeError('Context baseVector must contain seven finite normalized White features.');
    }
    original = Array.from(baseVector);
  } else {
    const material = {Q: 150, R: 105, B: 100, N: 90, P: 55, K: 0};
    const board = rlBoardFeatures(state, 'white');
    original = [possession, carrier ? possession * progress(carrier) : 0,
      Math.max(-1, Math.min(1, pieces.reduce((sum, piece) => sum + sign(piece.team) * (material[piece.type] || 0), 0) / 905)),
      board.centerControl, board.openFiles, board.defensiveCover, board.centralReceivers];
  }
  const phase = state.phase, positional = phase === 'attackMove' || phase === 'defendMove';
  const actorTeam = phase === 'finished' ? null : phase === 'keeperReact'
    ? state.pendingShot?.defendingTeam || (state.attack === 'white' ? 'black' : 'white')
    : phase === 'defendMove' ? (state.attack === 'white' ? 'black' : 'white') : state.attack;
  const actor = sign(actorTeam), budget = state.positionBudget || {};
  const normalUsed = !!budget.normalUsed, pawnUsed = !!budget.pawnUsed;
  const dribbleUsed = budget.dribbleUsed === undefined ? normalUsed : !!budget.dribbleUsed;
  const ordinaryTempo = positional && !normalUsed ? actor : 0;
  const bonusTempo = positional && !pawnUsed ? actor : 0;
  const dribbleTempo = phase === 'attackMove' && !state.restart && carrier?.team === state.attack && !dribbleUsed ? actor : 0;
  const kickNow = ['kick', 'kickoff', 'keeperRelease'].includes(phase) ? possession : 0;
  let depthSquared = 0, centrality = 0, opening = 0, inGoalBox = 0, directExposure = 0, bonusExposure = 0;
  let safeOptions = 0, forwardOptions = 0, centralQuality = 0, finishingQuality = 0, pressure = 0, keeperDisplacement = 0;
  let dribblePressure = 0, stallPressure = 0;
  if (carrier) {
    const side = carrier.team, ownSign = sign(side), opponents = pieces.filter(piece => piece.team !== side);
    const depth = progress(carrier), goalY = side === 'white' ? -0.5 : 16.5;
    const angleAt = piece => {
      const perpendicular = Math.abs(goalY - piece.y);
      return clamp01(Math.atan2(4 * perpendicular, perpendicular * perpendicular + (4.5 - piece.x) * (8.5 - piece.x)) / Math.PI);
    };
    depthSquared = ownSign * depth * depth;
    centrality = ownSign * clamp01(1 - Math.abs(carrier.x - 6.5) / 6.5);
    opening = ownSign * angleAt(carrier);
    inGoalBox = carrier.x >= 4 && carrier.x <= 9 && (side === 'white' ? carrier.y < 3 : carrier.y >= 14) ? ownSign : 0;
    // A fresh defensive response follows attack positioning/pass-and-run;
    // during a defensive response, honor the actual remaining action budget.
    const challenge = !state.restart && (phase === 'attackMove' || phase === 'passRun' || phase === 'defendMove' && !normalUsed);
    if (challenge) {
      const allowBonus = phase !== 'defendMove' || !pawnUsed;
      let direct = false, setup = false;
      for (const piece of opponents) {
        direct ||= geometry.controls(piece, carrier, {bonus: false}) > 0;
        if (allowBonus && ['P', 'K'].includes(piece.type)) setup ||= geometry.controls(piece, carrier) > 0;
      }
      const clean = (state.foulsEnabled ? 0.9 : 1) * (carrier.type === 'N' ? 0.5 : 1);
      directExposure = ownSign * (direct ? clean : 0);
      bonusExposure = ownSign * (!direct && setup ? clean : 0);
    }
    // Receiving potential uses a fresh subsequent challenge, matching the
    // strategic seven-feature family, rather than the current spent budgets.
    const accuracy = length => state.restart?.type === 'throwIn'
      ? Math.max(0.25, 1 - Math.max(0, length - 5) * 0.15)
      : Math.max(0.25, 1 - Math.max(0, length - 10) * 0.1);
    for (const receiver of pieces) {
      if (receiver.team !== side || receiver.id === carrier.id || receiver.type === 'K' || geometry.flagged(receiver)
        || !geometry.onside(receiver, carrier) || !geometry.canPass(carrier, receiver)) continue;
      let risk = 0;
      for (const defender of opponents) risk = Math.max(risk, geometry.controls(defender, receiver));
      if (receiver.type === 'N') risk *= 0.5;
      const quality = accuracy(distance(carrier, receiver)) * (1 - risk * 0.9);
      safeOptions += quality;
      if (progress(receiver) > depth) forwardOptions += quality;
      if (Math.abs(receiver.x - 6.5) <= 2.5 && progress(receiver) >= 0.5) centralQuality = Math.max(centralQuality, quality * progress(receiver));
      finishingQuality = Math.max(finishingQuality, quality * angleAt(receiver) * progress(receiver));
    }
    safeOptions = ownSign * clamp01(safeOptions / 3);
    forwardOptions = ownSign * clamp01(forwardOptions / 3);
    centralQuality *= ownSign; finishingQuality *= ownSign;
    const nearest = opponents.filter(piece => !geometry.flagged(piece)).reduce((minimum, piece) => Math.min(minimum, distance(carrier, piece)), 5);
    pressure = ownSign * clamp01(1 - nearest / 5);
    const keeper = opponents.find(piece => piece.type === 'K');
    keeperDisplacement = ownSign * (keeper ? clamp01(Math.hypot(keeper.x - 6.5, keeper.y - (side === 'white' ? 0 : 16)) / 8) : 1);
    const pace = state.paceControl;
    if (!state.restart && phase !== 'kickoff' && pace?.team === side && pace.carrierId === carrier.id) {
      dribblePressure = ownSign * clamp01((Number(pace.dribbleRounds) + (pace.dribbledThisRound ? 1 : 0)) / 4);
    }
    const tracker = state.ballProgress, ownHalf = side === 'white' ? carrier.y > 8 : carrier.y < 8;
    const anchorOwnHalf = tracker && (side === 'white' ? tracker.anchorY > 8 : tracker.anchorY < 8);
    if (ownHalf && anchorOwnHalf && tracker.team === side && !tracker.excludeRelease && !state.restart && !['kickoff', 'keeperReact', 'finished'].includes(phase)) {
      const advance = (side === 'white' ? -1 : 1) * (carrier.y - tracker.anchorY);
      stallPressure = ownSign * clamp01(Number(tracker.rounds) / 3) * clamp01((4 - advance) / 4);
    }
  }
  const ballZone = clamp01(Math.abs((state.ball?.y ?? 8) - 8) / 8);
  const vector = [...original, actor, ordinaryTempo, bonusTempo, dribbleTempo, kickNow,
    depthSquared, centrality, opening, inGoalBox, directExposure, bonusExposure, safeOptions, forwardOptions,
    centralQuality, finishingQuality, pressure, keeperDisplacement, dribblePressure, stallPressure,
    original[3] * ballZone, original[4] * ballZone];
  // Canonicalize signed zero before perspective conversion for stable hashes.
  return vector.map(value => team === 'black' ? -(value || 0) : value || 0);
}
