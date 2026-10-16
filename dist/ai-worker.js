import {chooseAIAction} from './engine.js?v=5592db35b1fa';

if(typeof self!=='undefined')self.onmessage=({data})=>{
  const {requestId,state,difficulty}=data;
  try{self.postMessage({requestId,action:chooseAIAction(state,{difficulty})});}
  catch(error){self.postMessage({requestId,error:error instanceof Error?error.message:String(error)});}
};
