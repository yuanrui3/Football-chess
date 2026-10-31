import {chooseAIAction,analyzeTacticalAction} from './engine.js?v=663af4ea26d5';

if(typeof self!=='undefined')self.onmessage=({data})=>{
  const {requestId,state,difficulty,selectionSeed,matchContext}=data;
  // Playable Tactical uses handcrafted evaluation, including legacy requests.
  const options={difficulty,modelWeights:null,matchContext};
  try{
    const action=difficulty==='tactical'
      ?analyzeTacticalAction(state,{modelWeights:null,selectionSeed,matchContext,onIteration:progress=>self.postMessage({requestId,progress})}).action
      :chooseAIAction(state,options);
    self.postMessage({requestId,action});
  }
  catch(error){self.postMessage({requestId,error:error instanceof Error?error.message:String(error)});}
};
