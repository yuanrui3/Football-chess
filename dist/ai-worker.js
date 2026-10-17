import {chooseAIAction,RL_VALUE_MODEL} from './engine.js?v=eeba82274585';

if(typeof self!=='undefined')self.onmessage=({data})=>{
  const {requestId,state,difficulty,learnedEvaluation}=data;
  const options={difficulty};
  if(typeof learnedEvaluation==='boolean')options.modelWeights=learnedEvaluation&&RL_VALUE_MODEL.trained?RL_VALUE_MODEL.weights:null;
  try{self.postMessage({requestId,action:chooseAIAction(state,options)});}
  catch(error){self.postMessage({requestId,error:error instanceof Error?error.message:String(error)});}
};
