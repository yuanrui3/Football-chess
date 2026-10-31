// Portable recordings contain observed positions and outcomes, never AI seeds.
// Delta frames remove unchanged pieces; gzip removes repeated field names.
import {BOARD_WIDTH as W,BOARD_HEIGHT as H,RULES_VERSION} from './engine.js?v=bc58e8823cbc';
import {captureReplayFrame,validReplayFrame,validRosterTransition,buildGoalReplay} from './goal-replay.js?v=756c713355c1';
import {restoreArchiveStatistics} from './archive-statistics.js?v=c1008bd99b24';

export const MATCH_FORMAT='football-chess-match';
export const MAX_RECORDING_STEPS=20000;
export const MAX_FILE_BYTES=32*1024*1024;
const MAX_JSON_BYTES=32*1024*1024;
const latest=new WeakMap();
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const isGoal=frame=>frame.action?.type==='goal'&&(frame.ball.y===-1||frame.ball.y===H);
const failure=()=>new Error('This file is not a supported Football Chess match recording.');

function cleanFrame(frame){
  if(!validReplayFrame(frame,isGoal(frame),true))throw failure();
  return {...captureReplayFrame({...frame,lastAction:frame.action}),caption:frame.caption};
}
function pushFrame(recording,frame){
  if(recording.steps.length>=MAX_RECORDING_STEPS){recording.capped=true;return;}
  const before=latest.get(recording);
  if(!before)throw failure();
  const delta={a:frame.action,c:frame.caption};
  const changed=frame.pieces.filter(piece=>!equal(piece,before.pieces.find(old=>old.id===piece.id)));
  const removed=before.pieces.filter(piece=>!frame.pieces.some(next=>next.id===piece.id)).map(piece=>piece.id);
  if(changed.length)delta.p=changed;
  if(removed.length)delta.r=removed;
  if(!equal(frame.ball,before.ball))delta.b=frame.ball;
  if(!equal(frame.score,before.score))delta.s=frame.score;
  if(!equal(frame.sentOff,before.sentOff))delta.o=frame.sentOff;
  recording.steps.push(delta);latest.set(recording,frame);
}
export function createMatchRecording(game,{partial=false,finished=false}={}){
  const initial=captureReplayFrame(game);
  initial.caption=partial?'The available recording begins here.':'Kickoff · The match begins.';
  const recording={format:MATCH_FORMAT,version:1,rulesVersion:game.rulesVersion||RULES_VERSION,board:{width:W,height:H},partial:!!partial,finished:!!finished,capped:false,initial,steps:[]};
  latest.set(recording,initial);return recording;
}
export function appendMatchRecording(recording,before,after){
  if(recording.capped)return;
  const scored=after.score.white+after.score.black>before.score.white+before.score.black;
  if(scored){
    const goal=buildGoalReplay([],before,after)?.frames.at(-1);
    if(goal)pushFrame(recording,goal);
  }
  const frame=captureReplayFrame(after);
  if(scored&&frame.action?.type==='goal'){
    frame.action=null;frame.caption='The teams reset for kickoff.';
  }
  pushFrame(recording,frame);
}
function framesOf(value){
  if(!value||value.format!==MATCH_FORMAT||value.version!==1||!Number.isInteger(value.rulesVersion)||value.rulesVersion<14||value.rulesVersion>RULES_VERSION||value.board?.width!==W||value.board?.height!==H||typeof value.partial!=='boolean'||typeof value.finished!=='boolean'||typeof value.capped!=='boolean'||!Array.isArray(value.steps)||value.steps.length>MAX_RECORDING_STEPS)throw failure();
  let frame=cleanFrame(value.initial);
  const frames=[frame];
  for(const step of value.steps){
    if(!step||typeof step!=='object'||Array.isArray(step)||Object.keys(step).some(key=>!['p','r','b','s','o','a','c'].includes(key)))throw failure();
    if(step.p!==undefined&&(!Array.isArray(step.p)||step.p.length>22||new Set(step.p.map(p=>p?.id)).size!==step.p.length))throw failure();
    if(step.r!==undefined&&(!Array.isArray(step.r)||step.r.length>1||step.r.some(id=>!frame.pieces.some(p=>p.id===id))))throw failure();
    if(step.p?.some(p=>!frame.pieces.some(old=>old.id===p?.id)||step.r?.includes(p?.id)))throw failure();
    const next=cleanFrame({pieces:frame.pieces.filter(p=>!step.r?.includes(p.id)).map(p=>step.p?.find(change=>change.id===p.id)||p),sentOff:step.o??frame.sentOff,ball:step.b??frame.ball,score:step.s??frame.score,action:step.a,caption:step.c});
    if(!validRosterTransition(frame,next))throw failure();
    const dw=next.score.white-frame.score.white,db=next.score.black-frame.score.black;
    if(dw<0||db<0||dw+db>1||(dw+db===1&&next.action?.type!=='goal'))throw failure();
    if(isGoal(next)&&(dw+db!==1||next.action.team!==(dw?'white':'black')))throw failure();
    frames.push(next);frame=next;
  }
  return frames;
}
export function restoreMatchRecording(value){
  try{
    const frames=framesOf(value),recording={format:MATCH_FORMAT,version:1,rulesVersion:value.rulesVersion,board:{width:W,height:H},partial:value.partial,finished:value.finished,capped:value.capped,initial:frames[0],steps:[]};
    latest.set(recording,frames[0]);
    // Re-encode only the known fields. Imported objects never reach the UI.
    for(const frame of frames.slice(1))pushFrame(recording,frame);
    const statistics=restoreArchiveStatistics(value.statistics,frames.at(-1));
    if(statistics)recording.statistics=statistics;
    return recording;
  }catch{return null;}
}
export function matchReplay(value){
  try{const frames=framesOf(value);return {kind:'match',frames,score:{...frames.at(-1).score},partial:value.partial,finished:value.finished,capped:value.capped,statistics:restoreArchiveStatistics(value.statistics,frames.at(-1))};}catch{return null;}
}
export function recordingWithStatistics(recording,statistics,game){
  const value={...recording};delete value.statistics;
  if(!recording.capped&&recordingMatchesGame(recording,game)){
    const restored=restoreArchiveStatistics(statistics,captureReplayFrame(game));
    if(restored)value.statistics=restored;
  }
  latest.set(value,latest.get(recording));return value;
}
export function rewindMatchRecording(recording,length){
  if(!Number.isInteger(length)||length<0||length>recording.steps.length)return false;
  recording.steps.length=length;recording.finished=false;recording.capped=false;
  delete recording.statistics;
  latest.set(recording,framesOf(recording).at(-1));return true;
}
export function recordingMatchesGame(recording,game){
  const frame=latest.get(recording),actual=captureReplayFrame(game);
  return !!frame&&['pieces','sentOff','ball','score'].every(key=>equal(frame[key],actual[key]));
}
export function recordingFromLegacy(value){
  if(value?.version!==4||value.geometry?.width!==W||value.geometry?.height!==H||!value.game||!Array.isArray(value.history)||value.history.length>80)throw failure();
  const states=[...value.history.map(entry=>entry?.game),value.game];
  if(states.some(state=>!state||state.boardDimensions?.width!==W||state.boardDimensions?.height!==H||state.rulesVersion<14||state.rulesVersion>RULES_VERSION))throw failure();
  const recording=createMatchRecording(states[0],{partial:true,finished:value.stage==='finished'});
  for(let i=1;i<states.length;i++)appendMatchRecording(recording,states[i-1],states[i]);
  const restored=restoreMatchRecording(recording);if(!restored)throw failure();return recordingWithStatistics(restored,value.matchStats,value.game);
}
export async function encodeMatchFile(recording,{compressed=true}={}){
  if(!restoreMatchRecording(recording))throw failure();
  const json=JSON.stringify(recording);
  if(new TextEncoder().encode(json).byteLength>MAX_JSON_BYTES)throw new Error('This recording is too large to export.');
  const blob=new Blob([json],{type:'application/json'});
  if(compressed&&typeof CompressionStream==='function')return {blob:await new Response(blob.stream().pipeThrough(new CompressionStream('gzip'))).blob(),extension:'fcmatch'};
  return {blob,extension:'json'};
}
export async function readMatchFile(file){
  if(!file||file.size===0||file.size>MAX_FILE_BYTES)throw new Error('Choose a match file no larger than 32 MB.');
  const header=new Uint8Array(await file.slice(0,2).arrayBuffer());
  let stream=file.stream();
  if(header[0]===0x1f&&header[1]===0x8b){
    if(typeof DecompressionStream!=='function')throw new Error('This browser cannot open compressed recordings. Use the JSON download instead.');
    stream=stream.pipeThrough(new DecompressionStream('gzip'));
  }
  const reader=stream.getReader(),decoder=new TextDecoder('utf-8',{fatal:true});let bytes=0,text='';
  try{
    while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>MAX_JSON_BYTES){await reader.cancel();throw new Error('The expanded match file is too large.');}text+=decoder.decode(value,{stream:true});}
    text+=decoder.decode();
  }catch(error){if(bytes>MAX_JSON_BYTES)throw error;throw new Error('The match file is damaged or unreadable.');}
  let value;try{value=JSON.parse(text);}catch{throw new Error('The match file does not contain valid JSON.');}
  if(value?.format===MATCH_FORMAT){const recording=restoreMatchRecording(value);if(!recording)throw failure();return recording;}
  // The old device save contains only the recent undo history.
  if(value?.recording){const recording=restoreMatchRecording(value.recording);if(recording)return value.game?recordingWithStatistics(recording,value.matchStats||recording.statistics,value.game):recording;}
  try{return recordingFromLegacy(value);}catch{throw failure();}
}
