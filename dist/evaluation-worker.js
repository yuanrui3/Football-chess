/** Read-only current-round analysis. Past goals never enter this estimate. */
import {analyzeTacticalAction,currentTeam} from './engine.js?v=8a5f49b765ee';

export const EVALUATION_GOAL_UNIT = 2000;
// A single round's useful values are about 0–1 goal units. The former 1.5
// scale left even a near-certain finish looking close to the midpoint.
// This controls visual contrast only; it is not a probability conversion.
export const EVALUATION_DISPLAY_SCALE = 0.5;
export function evaluationNumbers(value, actor, stats = {}) {
  if (!Number.isFinite(value) || !['white','black'].includes(actor)) throw new Error('The position could not be evaluated.');
  const whiteValue = actor === 'white' ? value : -value;
  const score = whiteValue / EVALUATION_GOAL_UNIT;
  return {whiteValue,score,share:0.5 + 0.48 * Math.tanh(score / EVALUATION_DISPLAY_SCALE),
    depth:Number.isInteger(stats.completedDepth)?stats.completedDepth:0,
    nodes:Number.isInteger(stats.nodes)?stats.nodes:0,sideToMove:actor,terminal:false,scope:'round',roundActive:true};
}
export function evaluatePosition(position, {analyze = analyzeTacticalAction,onProgress} = {}) {
  if (!position || !Array.isArray(position.pieces) || !position.score) throw new Error('No valid position to analyse.');
  if (position.phase === 'finished') {
    return {...evaluationNumbers(0,'white'),terminal:true,winner:null,roundActive:false,attackTeam:null};
  }
  const actor = currentTeam(position), attackTeam=position.attack;
  // Normalize here as well as in the scoped engine entry point, so a worker
  // consumer cannot accidentally reintroduce a lead from the live scoreboard.
  const roundPosition={...position,score:{white:0,black:0}};
  const numbers=(value,stats)=>({...evaluationNumbers(value,actor,stats),attackTeam});
  const report = analyze(roundPosition,{maxDepth:8,nodeLimit:1400,modelWeights:null,modelScale:80,selectionSeed:null,evaluationScope:'round',
    onIteration: progress => onProgress?.(numbers(progress.value,progress.stats))});
  return numbers(report.value,report.stats);
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
