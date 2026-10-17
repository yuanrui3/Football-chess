/**
 * Small public-board features for the self-play value learner.
 *
 * These describe strategic potential with a fresh ordinary move and one shared
 * pawn/keeper bonus for either side. They deliberately do not toggle when an
 * action budget is spent. The engine's phase-aware tactical risk remains the
 * authority for an actual challenge. No feature consults the hidden RNG.
 *
 * Keep these two functions self-contained: the trainer copies them into the
 * deployed evaluator, so training and browser inference use identical math.
 */
export function rlBoardGeometry(state) {
  const rlWidth = 14, rlHeight = 17, rlMiddle = 8;
  const rlPieces = state.pieces || [];
  const rlBoard = Array(rlWidth * rlHeight).fill(null);
  for (const rlPiece of rlPieces) rlBoard[rlPiece.y * rlWidth + rlPiece.x] = rlPiece;
  const rlStraight = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const rlDirections = [...rlStraight, [1, 1], [1, -1], [-1, 1], [-1, -1]];
  const rlInside = (rlX, rlY) => Number.isInteger(rlX) && Number.isInteger(rlY) && rlX >= 0 && rlX < rlWidth && rlY >= 0 && rlY < rlHeight;
  const rlBox = (rlX, rlY) => rlX >= 4 && rlX <= 9 && (rlY < 3 || rlY >= 14);
  const rlOwnBox = (rlPiece, rlX, rlY) => rlBox(rlX, rlY) && (rlPiece.team === 'white' ? rlY >= 14 : rlY < 3);
  const rlAllowed = (rlPiece, rlX, rlY) => rlInside(rlX, rlY)
    && (!(rlX >= 5 && rlX <= 8 && (rlY === 0 || rlY === 16)) || rlPiece.type === 'K' && rlOwnBox(rlPiece, rlX, rlY))
    && (rlPiece.type !== 'K' || !rlBox(rlX, rlY) || rlOwnBox(rlPiece, rlX, rlY));
  const rlAt = (rlX, rlY) => rlInside(rlX, rlY) ? rlBoard[rlY * rlWidth + rlX] : null;
  const rlFlagged = rlPiece => state.offside?.team === rlPiece.team && (state.offside.flaggedIds || []).includes(rlPiece.id);
  const rlDistance = (rlA, rlB) => Math.max(Math.abs(rlA.x - rlB.x), Math.abs(rlA.y - rlB.y));
  const rlCarrier = rlPieces.find(rlPiece => rlPiece.id === state.ball?.carrierId);
  const rlDefenceLine = {};
  for (const rlTeam of ['white', 'black']) {
    const rlRanks = rlPieces.filter(rlPiece => rlPiece.team !== rlTeam).map(rlPiece => rlPiece.y)
      .sort((rlA, rlB) => rlTeam === 'white' ? rlA - rlB : rlB - rlA);
    rlDefenceLine[rlTeam] = rlRanks[1] ?? (rlTeam === 'white' ? rlHeight : -1);
  }
  function rlOnside(rlPiece, rlFrom = rlCarrier, rlRestart = state.restart) {
    if (!rlFrom || rlPiece.id === rlFrom.id || ['goalKick', 'corner', 'throwIn'].includes(rlRestart?.type)) return true;
    return rlPiece.team === 'white'
      ? rlPiece.y >= rlMiddle || rlPiece.y >= rlFrom.y || rlPiece.y >= rlDefenceLine.white
      : rlPiece.y <= rlMiddle || rlPiece.y <= rlFrom.y || rlPiece.y <= rlDefenceLine.black;
  }
  function rlShape(rlPiece, rlDx, rlDy, rlPassing = false, rlThrowing = false) {
    if (!rlDx && !rlDy) return false;
    if (rlThrowing) return !rlDx || !rlDy || Math.abs(rlDx) === Math.abs(rlDy);
    if (rlPiece.type === 'N') return Math.abs(rlDx) * Math.abs(rlDy) === 2;
    if (rlPiece.type === 'P') return (!rlDx || !rlDy) && (rlPassing || Math.abs(rlDx) + Math.abs(rlDy) === 1);
    if (rlPiece.type === 'K' && !rlPassing) return Math.max(Math.abs(rlDx), Math.abs(rlDy)) === 1;
    const rlStraightRay = !rlDx || !rlDy, rlDiagonalRay = Math.abs(rlDx) === Math.abs(rlDy);
    return rlPiece.type === 'R' ? rlStraightRay : rlPiece.type === 'B' ? rlDiagonalRay : rlStraightRay || rlDiagonalRay;
  }
  function rlCanMove(rlPiece, rlTarget, {carrying = rlPiece.id === rlCarrier?.id, passRun = false} = {}) {
    const rlDx = rlTarget.x - rlPiece.x, rlDy = rlTarget.y - rlPiece.y;
    if (!rlAllowed(rlPiece, rlTarget.x, rlTarget.y) || rlAt(rlTarget.x, rlTarget.y) || !rlShape(rlPiece, rlDx, rlDy)) return false;
    const rlJumping = rlPiece.type === 'N', rlSteps = rlJumping ? 1 : Math.max(Math.abs(rlDx), Math.abs(rlDy));
    let rlCost = 0, rlPreviousBox = rlBox(rlPiece.x, rlPiece.y);
    for (let rlStep = 1; rlStep <= rlSteps; rlStep++) {
      const rlX = rlPiece.x + (rlJumping ? rlDx : Math.sign(rlDx) * rlStep);
      const rlY = rlPiece.y + (rlJumping ? rlDy : Math.sign(rlDy) * rlStep);
      const rlInBox = rlBox(rlX, rlY);
      if (!rlAllowed(rlPiece, rlX, rlY) || rlAt(rlX, rlY) || passRun && !rlPreviousBox && rlInBox) return false;
      rlCost += rlInBox ? 2 : 1;
      if (rlCost > (carrying ? 8 : 10)) return false;
      rlPreviousBox = rlInBox;
    }
    // A passer cannot bypass the pass-and-run box-entry rule by collecting its
    // own loose pass after the run phase. Teammates may receive normally.
    const rlOrigin = state.looseBallKickOrigin;
    if (!rlCarrier && state.ball?.x === rlTarget.x && state.ball?.y === rlTarget.y && rlInTargetBox(rlTarget)
      && rlOrigin?.pieceId === rlPiece.id && !rlBox(rlOrigin.from?.x ?? rlPiece.x, rlOrigin.from?.y ?? rlPiece.y)) return false;
    return true;
  }
  const rlInTargetBox = rlTarget => rlBox(rlTarget.x, rlTarget.y);
  function rlCanPass(rlFrom, rlTarget, rlRestart = state.restart) {
    const rlDx = rlTarget.x - rlFrom.x, rlDy = rlTarget.y - rlFrom.y;
    const rlThrowing = rlRestart?.type === 'throwIn', rlJumping = rlFrom.type === 'N' && !rlThrowing;
    if (!rlInside(rlTarget.x, rlTarget.y) || !rlShape(rlFrom, rlDx, rlDy, true, rlThrowing)) return false;
    const rlSteps = Math.max(Math.abs(rlDx), Math.abs(rlDy));
    if (rlThrowing && rlSteps > 10) return false;
    if (rlJumping) return true;
    const rlBypass = ['goalKick', 'corner', 'offside', 'stalling', 'timeout', 'freeKick'].includes(rlRestart?.type) ? 1 : 0;
    let rlBlocked = 0;
    for (let rlStep = 1; rlStep < rlSteps; rlStep++) if (rlAt(rlFrom.x + Math.sign(rlDx) * rlStep, rlFrom.y + Math.sign(rlDy) * rlStep) && ++rlBlocked > rlBypass) return false;
    return true;
  }
  function rlDirectControl(rlPiece, rlTarget) {
    const rlDx = rlTarget.x - rlPiece.x, rlDy = rlTarget.y - rlPiece.y, rlReach = Math.max(Math.abs(rlDx), Math.abs(rlDy));
    if (!rlReach || rlReach > 10) return false;
    if (rlPiece.type === 'N') {
      if (Math.abs(rlDx) * Math.abs(rlDy) !== 2) return false;
    } else if (rlPiece.type === 'P') {
      if (Math.abs(rlDx) !== 1 || Math.abs(rlDy) !== 1) return false;
    } else if (rlPiece.type === 'K') {
      if (rlReach !== 1) return false;
    } else {
      if (rlReach > 5 || !rlShape(rlPiece, rlDx, rlDy)) return false;
      for (let rlStep = 1; rlStep < rlReach; rlStep++) {
        const rlX = rlPiece.x + Math.sign(rlDx) * rlStep, rlY = rlPiece.y + Math.sign(rlDy) * rlStep;
        if (!rlAllowed(rlPiece, rlX, rlY) || rlAt(rlX, rlY)) return false;
      }
    }
    return rlDirections.some(([rlX, rlY]) => {
      const rlLanding = {x: rlTarget.x + rlX, y: rlTarget.y + rlY};
      const rlOccupant = rlAt(rlLanding.x, rlLanding.y);
      return rlDistance(rlPiece, rlLanding) <= 10 && rlAllowed(rlPiece, rlLanding.x, rlLanding.y)
        && (!rlOccupant || rlOccupant.id === rlPiece.id);
    });
  }
  function rlControl(rlPiece, rlTarget, {bonus = true} = {}) {
    if (rlFlagged(rlPiece)) return 0;
    if (rlDirectControl(rlPiece, rlTarget)) return 1;
    if (!bonus || !['P', 'K'].includes(rlPiece.type) || rlPiece.id === rlCarrier?.id || rlDistance(rlPiece, rlTarget) > 2) return 0;
    const rlVectors = rlPiece.type === 'P' ? rlStraight : rlDirections;
    for (const [rlDx, rlDy] of rlVectors) {
      const rlMoved = {...rlPiece, x: rlPiece.x + rlDx, y: rlPiece.y + rlDy};
      if (!rlAllowed(rlPiece, rlMoved.x, rlMoved.y) || rlAt(rlMoved.x, rlMoved.y)) continue;
      // Temporarily vacate the origin for the ordinary tackle's landing check.
      rlBoard[rlPiece.y * rlWidth + rlPiece.x] = null;
      const rlControls = rlDirectControl(rlMoved, rlTarget);
      rlBoard[rlPiece.y * rlWidth + rlPiece.x] = rlPiece;
      if (rlControls) return 0.65;
    }
    return 0;
  }
  return {pieces: rlPieces, carrier: rlCarrier, at: rlAt, allowed: rlAllowed, onside: rlOnside,
    canMove: rlCanMove, canPass: rlCanPass, controls: rlControl, flagged: rlFlagged};
}

export function rlBoardFeatures(state, team) {
  const rlGeometry = rlBoardGeometry(state), rlPieces = rlGeometry.pieces;
  const rlClamp = rlValue => Math.max(0, Math.min(1, rlValue));
  const rlRaw = {white: {centerControl: 0, openFiles: 0, defensiveCover: 0, centralReceivers: 0},
    black: {centerControl: 0, openFiles: 0, defensiveCover: 0, centralReceivers: 0}};
  const rlDistance = (rlA, rlB) => Math.max(Math.abs(rlA.x - rlB.x), Math.abs(rlA.y - rlB.y));
  const rlAccuracy = rlLength => Math.max(0.25, 1 - Math.max(0, rlLength - 10) * 0.1);
  const rlProgress = (rlTeam, rlY) => rlTeam === 'white' ? 16 - rlY : rlY;
  for (const rlSide of ['white', 'black']) {
    const rlOwn = rlPieces.filter(rlPiece => rlPiece.team === rlSide);
    let rlCenterWeight = 0;
    for (let rlY = 5; rlY <= 11; rlY++) for (let rlX = 4; rlX <= 9; rlX++) {
      const rlTarget = {x: rlX, y: rlY}, rlWeight = 1 - Math.abs(rlX - 6.5) * 0.12 - Math.abs(rlY - 8) * 0.06;
      let rlBest = 0, rlSecond = 0;
      for (const rlPiece of rlOwn) {
        const rlControl = rlGeometry.flagged(rlPiece) ? 0 : rlPiece.x === rlX && rlPiece.y === rlY ? 0.4 : rlGeometry.controls(rlPiece, rlTarget);
        if (rlControl > rlBest) { rlSecond = rlBest; rlBest = rlControl; } else if (rlControl > rlSecond) rlSecond = rlControl;
      }
      // Max plus a small supporting defender bonus; a crowd cannot farm the
      // feature simply by attacking the same square with many pieces.
      rlRaw[rlSide].centerControl += (rlBest + rlSecond * 0.2) * rlWeight;
      rlCenterWeight += 1.2 * rlWeight;
    }
    rlRaw[rlSide].centerControl /= rlCenterWeight;
    let rlFiles = 0;
    for (const rlPiece of rlOwn) {
      if (!['Q', 'R'].includes(rlPiece.type) || rlGeometry.flagged(rlPiece)) continue;
      const rlForward = rlSide === 'white' ? -1 : 1;
      let rlCost = 0, rlLane = 0;
      for (let rlStep = 1; rlStep <= 10; rlStep++) {
        const rlTarget = {x: rlPiece.x, y: rlPiece.y + rlForward * rlStep};
        if (!rlGeometry.allowed(rlPiece, rlTarget.x, rlTarget.y)) break;
        const rlOccupant = rlGeometry.at(rlTarget.x, rlTarget.y);
        if (rlOccupant) {
          if (rlOccupant.team === rlSide && rlOccupant.type !== 'K' && rlGeometry.onside(rlOccupant, rlPiece, null)) {
            rlLane += 2 * rlAccuracy(rlStep) * (Math.abs(rlOccupant.x - 6.5) <= 2.5 ? 1 : 0.5);
          }
          break;
        }
        rlCost += rlTarget.x >= 4 && rlTarget.x <= 9 && (rlTarget.y < 3 || rlTarget.y >= 14) ? 2 : 1;
        if (rlCost > (rlPiece.id === rlGeometry.carrier?.id ? 8 : 10)) break;
        const rlCentrality = 0.55 + (1 - Math.abs(rlPiece.x - 6.5) / 6.5) * 0.45;
        rlLane += (0.5 + rlProgress(rlSide, rlTarget.y) / 16 * 0.5) * rlCentrality;
      }
      rlFiles += rlClamp(rlLane / 10);
    }
    // At most the three original major pieces can contribute a full file.
    rlRaw[rlSide].openFiles = rlClamp(rlFiles / 3);
    const rlBall = state.ball || {x: 6.5, y: 8};
    const rlBallHome = rlProgress(rlSide, rlBall.y);
    let rlCover = 0;
    for (const rlPiece of rlOwn) {
      if (rlPiece.type === 'K' || rlGeometry.flagged(rlPiece) || !rlGeometry.allowed(rlPiece, rlPiece.x, rlPiece.y)) continue;
      const rlHome = rlProgress(rlSide, rlPiece.y);
      if (rlHome >= rlBallHome || rlDistance(rlPiece, rlBall) > 7 || rlBallHome <= 0) continue;
      const rlAxis = 6.5 + (rlBall.x - 6.5) * rlHome / rlBallHome;
      const rlOffset = Math.abs(rlPiece.x - rlAxis);
      if (rlOffset <= 3) rlCover += 1 - rlOffset / 6;
    }
    rlRaw[rlSide].defensiveCover = rlClamp(rlCover / 3);
  }
  const rlCarrier = rlGeometry.carrier;
  if (rlCarrier) {
    const rlSide = rlCarrier.team, rlOpponents = rlPieces.filter(rlPiece => rlPiece.team !== rlSide);
    const rlReceiving = [];
    for (const rlReceiver of rlPieces) {
      if (rlReceiver.team !== rlSide || rlReceiver.id === rlCarrier.id || rlReceiver.type === 'K'
        || Math.abs(rlReceiver.x - 6.5) > 2.5 || rlProgress(rlSide, rlReceiver.y) < 8
        || !rlGeometry.allowed(rlReceiver, rlReceiver.x, rlReceiver.y) || rlGeometry.flagged(rlReceiver)
        || !rlGeometry.onside(rlReceiver, rlCarrier) || !rlGeometry.canPass(rlCarrier, rlReceiver)) continue;
      let rlRisk = 0;
      for (const rlDefender of rlOpponents) rlRisk = Math.max(rlRisk, rlGeometry.controls(rlDefender, rlReceiver));
      if (rlReceiver.type === 'N') rlRisk *= 0.5;
      const rlLength = rlDistance(rlCarrier, rlReceiver);
      const rlAccuracyValue = state.restart?.type === 'throwIn'
        ? Math.max(0.25, 1 - Math.max(0, rlLength - 5) * 0.15) : rlAccuracy(rlLength);
      rlReceiving.push(rlAccuracyValue * (1 - rlRisk * 0.75) * (0.5 + rlProgress(rlSide, rlReceiver.y) / 32));
    }
    rlReceiving.sort((rlA, rlB) => rlB - rlA);
    rlRaw[rlSide].centralReceivers = rlClamp(((rlReceiving[0] || 0) + (rlReceiving[1] || 0) * 0.5) / 1.5);
  }
  const rlSign = team === 'black' ? -1 : 1;
  return Object.fromEntries(Object.keys(rlRaw.white).map(rlName => [rlName,
    (rlRaw.white[rlName] - rlRaw.black[rlName]) * rlSign || 0]));
}
