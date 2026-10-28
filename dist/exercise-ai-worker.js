import {analyzeExerciseAction} from './exercise-ai.js?v=d139e7cf8e65';

if(typeof self!=='undefined')self.onmessage=({data})=>{
  const {requestId,state}=data||{};
  try{
    const report=analyzeExerciseAction(state,{onIteration:progress=>self.postMessage({requestId,progress})});
    self.postMessage({requestId,action:report.action,analysis:{stats:report.stats,reason:report.reason}});
  }catch(error){self.postMessage({requestId,error:error instanceof Error?error.message:String(error)});}
};
