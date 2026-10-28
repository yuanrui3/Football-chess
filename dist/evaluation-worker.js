/** Read-only advantage analysis. This worker never applies a move to the match. */
import {analyzeTacticalAction,currentTeam} from './engine.js?v=1711834496ff';

export const EVALUATION_GOAL_UNIT = 2000;
export function evaluationNumbers(value, actor, stats = {}) {
  if (!Number.isFinite(value) || !['white','black'].includes(actor)) throw new Error('The position could not be evaluated.');
  const whiteValue = actor === 'white' ? value : -value;
  const score = whiteValue / EVALUATION_GOAL_UNIT;
  return {whiteValue,score,share:0.5 + 0.48 * Math.tanh(score / 1.5),
    depth:Number.isInteger(stats.completedDepth)?stats.completedDepth:0,
    nodes:Number.isInteger(stats.nodes)?stats.nodes:0,sideToMove:actor,terminal:false};
}
export function evaluatePosition(position, {analyze = analyzeTacticalAction,onProgress} = {}) {
  if (!position || !Array.isArray(position.pieces) || !position.score) throw new Error('No valid position to analyse.');
  if (position.phase === 'finished') {
    const winner = position.finishReason === 'forfeit' ? position.winner
      : position.score.white > position.score.black ? 'white' : position.score.black > position.score.white ? 'black' : null;
    const whiteValue = position.finishReason === 'forfeit' && winner
      ? (winner === 'white' ? 1 : -1) * EVALUATION_GOAL_UNIT * 5
      : (position.score.white-position.score.black) * EVALUATION_GOAL_UNIT;
    return {...evaluationNumbers(whiteValue,'white'),terminal:true,winner,
      share:winner === 'white'?1:winner === 'black'?0:0.5};
  }
  const actor = currentTeam(position);
  const report = analyze(position,{maxDepth:8,nodeLimit:1400,modelWeights:null,modelScale:80,selectionSeed:null,
    onIteration: progress => onProgress?.(evaluationNumbers(progress.value,actor,progress.stats))});
  return evaluationNumbers(report.value,actor,report.stats);
}

if (typeof self !== 'undefined') self.onmessage = ({data}) => {
  if (data?.type !== 'evaluate') return;
  const requestId = data.requestId;
  try {
    const result = evaluatePosition(data.position,{onProgress:progress=>self.postMessage({requestId,progress})});
    self.postMessage({requestId,result});
  } catch (error) {
    self.postMessage({requestId,error:error instanceof Error?error.message:'Analysis is unavailable.'});
  }
};
