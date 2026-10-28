/** Read-only current-round analysis. Past goals never enter this estimate. */
import {analyzeTacticalAction,currentTeam} from './engine.js?v=2c106a991787';

export const EVALUATION_GOAL_UNIT = 2000;
export function evaluationNumbers(value, actor, stats = {}) {
  if (!Number.isFinite(value) || !['white','black'].includes(actor)) throw new Error('The position could not be evaluated.');
  const whiteValue = actor === 'white' ? value : -value;
  const score = whiteValue / EVALUATION_GOAL_UNIT;
  return {whiteValue,score,share:0.5 + 0.48 * Math.tanh(score / 1.5),
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
