import * as policy from './baseline-engine.mjs';
import * as shared from './shared-rules.mjs';
// Corner choice is the same real-play policy for all arena variants.
export function chooseAIAction(state, options) {
  return state.phase === 'cornerSelect' ? shared.chooseAIAction(state, {difficulty:'casual'}) : policy.chooseAIAction(state, options);
}
