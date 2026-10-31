import test from 'node:test';
import assert from 'node:assert/strict';
import * as e from '../dist/engine.js';
import {captureReplayFrame,buildGoalReplay} from '../dist/goal-replay.js';
import {createMatchRecording,appendMatchRecording,restoreMatchRecording,rewindMatchRecording,recordingMatchesGame,recordingFromLegacy,matchReplay,encodeMatchFile,readMatchFile,MAX_FILE_BYTES,MAX_RECORDING_STEPS} from '../dist/match-archive.js';

const copy=value=>structuredClone(value);
function act(game,action){
  return action.type==='kick'?e.applyKick(game,action.x,action.y,{passRun:!!action.passRun,disguise:!!action.disguise}):action.type==='move'?e.applyMove(game,action.pieceId,action.x,action.y,{freePawn:!!action.freePawn}):action.type==='cornerTaker'?e.selectCornerTaker(game,action.pieceId):e.skipMove(game);
}
function shortMatch(){
  const game=e.createGame({mode:'local',seed:39}),recording=createMatchRecording(game),target=e.legalKicks(game)[0];
  const next=e.applyKick(game,target.x,target.y);appendMatchRecording(recording,game,next);return {game,next,recording};
}
test('JSON and gzip round-trip exactly the same observed match',async()=>{
  const {recording}=shortMatch(),original=JSON.stringify(recording);
  for(const compressed of [false,true]){
    const encoded=await encodeMatchFile(recording,{compressed});
    assert.equal(encoded.extension,compressed?'fcmatch':'json');
    const decoded=await readMatchFile(encoded.blob);
    assert.deepEqual(matchReplay(decoded),matchReplay(recording));
    if(compressed)assert.ok(encoded.blob.size<original.length/2);
  }
  assert.equal(JSON.stringify(recording),original);
});
test('reload continues the recording and Undo removes discarded future actions',()=>{
  const {game,next,recording}=shortMatch(),restored=restoreMatchRecording(JSON.parse(JSON.stringify(recording)));
  assert.ok(recordingMatchesGame(restored,next));assert.ok(!recordingMatchesGame(restored,game));
  const length=restored.steps.length,after=e.skipMove(next);appendMatchRecording(restored,next,after);
  assert.ok(rewindMatchRecording(restored,length));assert.ok(recordingMatchesGame(restored,next));
  assert.equal(restored.steps.length,length);assert.equal(rewindMatchRecording(restored,-1),false);
  assert.ok(rewindMatchRecording(restored,0));assert.ok(recordingMatchesGame(restored,game));
});
test('700 native actions preserve every position, outcome, card and goal impact',async()=>{
  let game=e.createGame({mode:'watch',seed:39,foulsEnabled:true});
  const recording=createMatchRecording(game),expected=[captureReplayFrame(game)];
  expected[0].caption='Kickoff · The match begins.';
  const outcomes=new Set();let goals=0;
  for(let i=0;i<700&&game.phase!=='finished';i++){
    const next=act(game,e.chooseAIAction(game));outcomes.add(next.lastAction?.type);
    if(next.score.white+next.score.black>game.score.white+game.score.black){
      const impact=buildGoalReplay([],game,next)?.frames.at(-1);assert.ok(impact);expected.push(impact);goals++;
    }
    const frame=captureReplayFrame(next);
    if(next.lastAction?.type==='goal'){frame.action=null;frame.caption='The teams reset for kickoff.';}
    expected.push(frame);appendMatchRecording(recording,game,next);game=next;
  }
  assert.ok(goals>=1);for(const type of ['move','kick','save','shotMiss','foul','goal'])assert.ok(outcomes.has(type),type);
  const replay=matchReplay(recording);assert.ok(replay);assert.deepEqual(replay.frames,expected);
  assert.deepEqual(replay.score,game.score);assert.ok(recordingMatchesGame(restoreMatchRecording(recording),game));
  const compact=await encodeMatchFile(recording);assert.ok(compact.blob.size<JSON.stringify(recording).length*.2);
  assert.deepEqual(matchReplay(await readMatchFile(compact.blob)).frames,expected);
});
test('legacy device saves retain only available history and are labelled partial',async()=>{
  const {game,next}=shortMatch(),legacy={version:4,geometry:{width:e.BOARD_WIDTH,height:e.BOARD_HEIGHT},history:[{game}],game:next,stage:'playing'};
  const recording=recordingFromLegacy(legacy);assert.equal(recording.partial,true);assert.equal(recording.steps.length,1);
  assert.deepEqual((await readMatchFile(new Blob([JSON.stringify(legacy)]))).steps,recording.steps);
  const wrapped=await readMatchFile(new Blob([JSON.stringify({...legacy,recording})]));assert.deepEqual(wrapped,recording);
});
for(const [name,change] of [
  ['future format',r=>r.version++],['future rules',r=>r.rulesVersion=999],['wrong pitch',r=>r.board.width=12],
  ['invalid square',r=>r.initial.pieces[0].x=999],['duplicate player',r=>r.initial.pieces[0]=r.initial.pieces[1]],
  ['invalid ball carrier',r=>r.initial.ball.carrierId='nobody'],['unknown action',r=>r.steps[0].a={type:'execute'}],
  ['missing caption',r=>delete r.steps[0].c],['long caption',r=>r.steps[0].c='x'.repeat(281)],
  ['score decrease',r=>{r.initial.score.white=1;r.steps[0].s={white:0,black:0};}],
  ['fabricated score jump',r=>r.steps[0].s={white:3,black:0}],['extra delta field',r=>r.steps[0].script='alert(1)'],
  ['unknown changed player',r=>r.steps[0].p=[{id:'white-X'}]],['unknown removal',r=>r.steps[0].r=['white-X']],
  ['unexplained dismissal',r=>r.steps[0].r=['white-P1']],['too many steps',r=>r.steps=Array(MAX_RECORDING_STEPS+1).fill(r.steps[0])]
])test(`rejects ${name}`,()=>{const {recording}=shortMatch();change(recording);assert.equal(restoreMatchRecording(recording),null);assert.equal(matchReplay(recording),null);});
test('invalid files, excessive input and excessive decompressed output are rejected',async()=>{
  await assert.rejects(readMatchFile(new Blob(['not json'])),/valid JSON/);
  await assert.rejects(readMatchFile(new Blob([Uint8Array.of(31,139,1,2,3)])),/damaged/);
  await assert.rejects(readMatchFile({size:MAX_FILE_BYTES+1}),/32 MB/);
  const bomb=await new Response(new Blob([' '.repeat(MAX_FILE_BYTES+1)]).stream().pipeThrough(new CompressionStream('gzip'))).blob();
  await assert.rejects(readMatchFile(bomb),/expanded match file is too large/);
});
test('JSON fallback remains available without browser gzip support',async()=>{
  const original=globalThis.CompressionStream;
  try{globalThis.CompressionStream=undefined;const file=await encodeMatchFile(shortMatch().recording);assert.equal(file.extension,'json');assert.ok(await readMatchFile(file.blob));}
  finally{globalThis.CompressionStream=original;}
});

const other=t=>t==='white'?'black':'white';
const rotate=([x,y],team)=>team==='white'?{x,y}:{x:e.BOARD_WIDTH-1-x,y:e.BOARD_HEIGHT-1-y};
const id=(v,team)=>team==='white'?v:v.replace(/^(white|black)/,other);
function foulFixture(team='white',{inside=false,carrierType='Q',challengerType='R',enabled=true}={}){
  const s=e.createGame({mode:'local',seed:89317,foulsEnabled:enabled});
  const suffix={K:'K',Q:'Q',R:'R1',B:'B1',N:'N1',P:'P1'};
  const carrier=`white-${suffix[carrierType]}`,challenger=`black-${suffix[challengerType]}`;
  const cy=inside?2:3,origin=challengerType==='K'?[6,cy-1]:[6,cy+2];
  // Generic card-partition tests need cover; automatic reds have separate fixtures.
  const placements={'white-K':[6,15],'black-K':[6,0],'black-B2':[1,1],[carrier]:[6,cy],[challenger]:origin};
  const used=new Set(Object.values(placements).map(p=>p.join()));
  const parking=Array.from({length:e.BOARD_HEIGHT},(_,y)=>[[0,y],[e.BOARD_WIDTH-1,y]]).flat();
  for(const p of s.pieces){const q=placements[p.id]||parking.find(q=>!used.has(q.join()));used.add(q.join());Object.assign(p,rotate(q,team));if(team==='black'){p.id=id(p.id,team);p.team=other(p.team);}}
  s.attack=team;s.phase='defendMove';s.positionBudget={normalUsed:false,pawnUsed:false,dribbleUsed:false};
  const owner=s.pieces.find(p=>p.id===id(carrier,team));s.ball={x:owner.x,y:owner.y,carrierId:owner.id};
  s.ballProgress={team,anchorY:owner.y,rounds:0,pendingRelease:false,excludeRelease:false};
  const target=rotate([5,cy],team),pieceId=id(challenger,team);
  assert.ok(e.legalMoves(s,pieceId).some(m=>m.type==='tackle'&&m.x===target.x&&m.y===target.y));
  return {s,pieceId,target,carrierId:owner.id};
}
function challenge(f,roll){return e.applyMove(f.s,f.pieceId,f.target.x,f.target.y,{roll});}

for(const variant of ['red','secondYellow','keeper','forfeit'])test(`recorded ${variant} keeps dismissal and replacement identities`,()=>{
  const f=foulFixture('white',{challengerType:variant==='keeper'?'K':'R'});
  if(variant==='secondYellow')f.s.discipline[f.pieceId]={yellowCards:1,redCard:false};
  if(variant==='forfeit'){
    const removed=f.s.pieces.filter(p=>['black-Q','black-B1','black-B2','black-N2'].includes(p.id));
    f.s.pieces=f.s.pieces.filter(p=>!removed.includes(p));
    f.s.sentOff=removed.map(p=>({...p,reason:'red',yellowCards:0}));
    for(const p of removed)f.s.discipline[p.id]={yellowCards:0,redCard:true};
  }
  const recording=createMatchRecording(f.s,{partial:true}),after=challenge(f,variant==='secondYellow'?.04:.01);
  appendMatchRecording(recording,f.s,after);const restored=restoreMatchRecording(recording);assert.ok(restored);
  const final=matchReplay(restored).frames.at(-1);assert.equal(final.action.card,'red');
  assert.ok(!final.pieces.some(p=>p.id===f.pieceId));assert.equal(final.sentOff.at(-1).id,f.pieceId);
  if(variant==='keeper')assert.ok(final.pieces.some(p=>p.replacementKeeper&&p.type==='K'&&p.id!=='black-K'));
  if(variant==='forfeit'){assert.equal(after.phase,'finished');assert.equal(final.pieces.filter(p=>p.team==='black').length,6);}
});
