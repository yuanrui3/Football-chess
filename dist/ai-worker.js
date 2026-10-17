import {chooseAIAction,analyzeTacticalAction} from './engine.js?v=df962903a48e';

if(typeof self!=='undefined')self.onmessage=({data})=>{
  const {requestId,state,difficulty}=data;
  // Playable Tactical uses handcrafted evaluation, including legacy requests.
  const options={difficulty,modelWeights:null};
  try{
    const action=difficulty==='tactical'
      ?analyzeTacticalAction(state,{modelWeights:null,onIteration:progress=>self.postMessage({requestId,progress})}).action
      :chooseAIAction(state,options);
    self.postMessage({requestId,action});
  }
  catch(error){self.postMessage({requestId,error:error instanceof Error?error.message:String(error)});}
};
