/** Internal worker protocol for evaluate-selfplay.mjs; no independent CLI. */
import {parentPort, workerData} from 'node:worker_threads';
import {makeSearchPolicy, runEvaluationScenario} from './evaluate-selfplay.mjs';

if (!parentPort || !workerData) throw new Error('Use evaluate-selfplay.mjs --workers N');
try {
  const {rulesUrl, candidateUrl, baselineUrl, modelWeights, modelScale, nodeLimit, maxDepth, extensions, actionLimit, roundLimit, record} = workerData;
  const [rules, candidateModule, baselineModule] = await Promise.all([import(rulesUrl), import(candidateUrl), import(baselineUrl)]);
  const common = {nodeLimit, maxDepth, extensions};
  const candidate = makeSearchPolicy(candidateModule, {...common, modelWeights, modelScale});
  const baseline = makeSearchPolicy(baselineModule, {...common, modelWeights: null});
  parentPort.on('message', message => {
    try {
      if (message?.type !== 'run' || !Number.isInteger(message.index) || message.index < 0) throw new Error('Invalid evaluation worker task');
      const {index, seed, kickoff, candidateColor, initialState} = message;
      const match = runEvaluationScenario({rules, seed, kickoff, candidateColor, initialState, nodeLimit, actionLimit, roundLimit, record,
        whitePolicy: candidateColor === 'white' ? candidate : baseline, blackPolicy: candidateColor === 'black' ? candidate : baseline});
      parentPort.postMessage({type: 'result', index, match});
    } catch (error) {parentPort.postMessage({type: 'error', index: message?.index, message: error.message});}
  });
  parentPort.postMessage({type: 'ready'});
} catch (error) {parentPort.postMessage({type: 'error', message: error.message});}
