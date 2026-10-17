import {RL_CONTEXT_FEATURE_NAMES} from './rl-context-features.mjs';

// Exact public shooting/outlet metrics are supplied by the engine's existing
// tactical calculations. This encoder never approximates the shot model.
// contextWhite is always the normalized 28-feature WHITE vector.
export const RL_SHOT_FEATURE_NAMES = Object.freeze([
  ...RL_CONTEXT_FEATURE_NAMES,
  'carrierKing', 'carrierQueen', 'carrierRook', 'carrierBishop', 'carrierKnight', 'carrierPawn',
  'bestShot', 'bestOutlet', 'secondOutlet'
]);

export function rlShotValueFeatures(state, team = 'white', contextWhite, metrics = {}) {
  if (!contextWhite || contextWhite.length !== 28
    || !Array.from(contextWhite).every(value => Number.isFinite(value) && Math.abs(value) <= 1)) {
    throw new TypeError('Shot contextWhite must contain 28 finite normalized White features.');
  }
  const carrier = (state.pieces || []).find(piece => piece.id === state.ball?.carrierId);
  const carrierSign = carrier?.team === 'white' ? 1 : carrier?.team === 'black' ? -1 : 0;
  const probability = name => {
    const value = metrics[name] ?? 0;
    if (!Number.isFinite(value)) throw new TypeError(`Shot metric ${name} must be finite.`);
    return carrierSign * Math.max(0, Math.min(1, value));
  };
  const oneHot = ['K', 'Q', 'R', 'B', 'N', 'P'].map(type => carrier?.type === type ? carrierSign : 0);
  const vector = [...contextWhite, ...oneHot,
    probability('bestShot'), probability('bestOutlet'), probability('secondOutlet')];
  return vector.map(value => team === 'black' ? -(value || 0) : value || 0);
}
