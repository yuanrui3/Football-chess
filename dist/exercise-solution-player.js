import {currentTeam,RULES_VERSION} from './engine.js?v=eb0ab0924c73';
import {createExerciseSession,applyExerciseAction} from './exercise-session.js?v=876c8b619b1e';
import {EXERCISE_AI_VERSION} from './exercise-ai.js?v=a8ecd5614d1f';

// Reconstruct a separate, verified demonstration. Never borrow the live attempt.
export function exerciseSolutionFrames(definition,library){
  const record=library?.examples?.[definition?.id];
  if(library?.format!==1||library.rulesVersion!==RULES_VERSION||library.aiVersion!==EXERCISE_AI_VERSION||record?.revision!==(definition.revision||1)
    ||!Array.isArray(record.actions)||!record.actions.length||record.actions.length>96)
    throw Error('This example solution needs updating. You can still play the exercise.');
  let session=createExerciseSession(definition,{seed:record.seed});
  const view=lastAction=>({session,started:true,thinking:false,suspended:false,canUndo:false,lastAction,solution:true});
  const frames=[view(null)];
  for(const action of record.actions){
    if(session.status!=='active')throw Error('This example solution ends too early.');
    const before=session.game,actor=currentTeam(before);session=applyExerciseAction(session,action);
    frames.push(view({actor,action,result:session.game.lastAction,before,after:session.game}));
  }
  if(session.status!=='solved')throw Error('This example no longer meets the exercise target. You can still try your own plan.');
  return frames;
}

/** Timer generations protect pause, seek, exit and exercise switches. */
export function createExerciseSolutionPlayer({delayMs=1500,setTimer=(fn,ms)=>setTimeout(fn,ms),clearTimer=id=>clearTimeout(id),onChange=()=>{}}={}){
  let frames=[],index=0,playing=false,timer=null,generation=0;
  const getState=()=>({active:frames.length>0,frame:frames[index]||null,index,total:Math.max(0,frames.length-1),playing});
  const notify=()=>onChange(getState());
  function cancel(){generation++;if(timer!==null)clearTimer(timer);timer=null;}
  function schedule(){if(!playing||index>=frames.length-1)return;const token=generation;
    timer=setTimer(()=>{if(token!==generation||!playing)return;timer=null;index++;if(index===frames.length-1)playing=false;notify();schedule();},delayMs);
  }
  function load(next,{autoplay=true}={}){cancel();frames=next;index=0;playing=autoplay&&frames.length>1;notify();schedule();}
  function pause(){cancel();playing=false;notify();}
  function play(){if(!frames.length)return;cancel();if(index===frames.length-1)index=0;playing=frames.length>1;notify();schedule();}
  function seek(next){cancel();playing=false;index=Math.max(0,Math.min(frames.length-1,Math.floor(Number(next)||0)));notify();}
  function stop(){cancel();frames=[];index=0;playing=false;notify();}
  return {getState,load,pause,play,seek,previous:()=>seek(index-1),next:()=>seek(index+1),restart:()=>{if(frames.length){index=0;play();}},stop};
}
