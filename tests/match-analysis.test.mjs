import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../dist/engine.js';
import {captureReplayFrame} from '../dist/goal-replay.js';
import {createMatchRecording,appendMatchRecording,recordingWithStatistics,matchReplay,encodeMatchFile,readMatchFile,restoreMatchRecording} from '../dist/match-archive.js';
import {createMatchStats,recordMatchTransition,addPossessionTime,matchStatsSummary} from '../dist/match-stats.js';
import {analyseMatch,recordedGoalIndices,recordedGoalClip} from '../dist/match-analysis.js';

function goalFixture({ownGoal=false}={}){
  const state=E.createGame({mode:'local',seed:39,foulsEnabled:true}),target={x:5,y:ownGoal?E.BOARD_HEIGHT:-1};
  const assigned={'white-K':[8,E.BOARD_HEIGHT-1],'black-K':[8,0],'white-R1':[5,ownGoal?E.BOARD_HEIGHT-5:4]};
  const used=new Set(Object.values(assigned).map(p=>p.join()));
  const parking=Array.from({length:E.BOARD_HEIGHT},(_,y)=>[[0,y],[E.BOARD_WIDTH-1,y]]).flat();
  for(const piece of state.pieces){const at=assigned[piece.id]||parking.find(p=>!used.has(p.join()));[piece.x,piece.y]=at;used.add(at.join());}
  const shooter=state.pieces.find(p=>p.id==='white-R1');state.phase='kick';state.ball={x:shooter.x,y:shooter.y,carrierId:shooter.id};
  const before=E.applyKick(state,target.x,target.y),after=E.skipMove(before,{roll:0});assert.equal(after.lastAction.type,'goal');
  const recording=createMatchRecording(state);appendMatchRecording(recording,state,before);appendMatchRecording(recording,before,after);recording.finished=true;
  let stats=createMatchStats();stats=addPossessionTime(stats,state,1000);stats=recordMatchTransition(stats,state,before);stats=recordMatchTransition(stats,before,after);
  return {state,before,after,stats,recording};
}
test('original match statistics, ratings and timed heatmaps survive a compressed file',async()=>{
  const f=goalFixture(),complete=recordingWithStatistics(f.recording,f.stats,f.after);
  const decoded=await readMatchFile((await encodeMatchFile(complete)).blob),replay=matchReplay(decoded),report=analyseMatch(replay);
  assert.equal(report.original,true);assert.deepEqual(report.summary,matchStatsSummary(f.stats));
  assert.deepEqual(replay.statistics.playerRatings,f.stats.playerRatings);assert.deepEqual(replay.statistics.playerHeatmaps,f.stats.playerHeatmaps);
  assert.equal(report.summary.teams.white.possessionPercent,100);assert.equal(report.summary.goals[0].scorerId,'white-R1');
  assert.match(report.paragraphs.join(' '),/Ivory won 1–0/);assert.ok(!f.recording.statistics,'export does not mutate the live recording');
});
test('older recordings reconstruct shots and scorers without manufacturing assists or possession',()=>{
  const {recording}=goalFixture(),report=analyseMatch(matchReplay(recording));
  assert.equal(report.original,false);assert.equal(report.summary.teams.white.shots,1);assert.equal(report.summary.teams.white.onTarget,1);
  assert.equal(report.seen.goals.length,1);assert.equal(report.summary.scorers[0].pieceId,'white-R1');
  assert.equal(report.summary.teams.white.possessionPercent,null);assert.deepEqual(report.summary.assists,[]);
  assert.match(report.coverage,/were not saved/);
});
test('own goals do not invent an attacking shot or credit the wrong scorer',()=>{
  const {recording}=goalFixture({ownGoal:true}),report=analyseMatch(matchReplay(recording));
  assert.equal(report.summary.teams.white.shots,0);assert.equal(report.summary.teams.black.shots,0);
  assert.equal(report.summary.goals[0].team,'black');assert.equal(report.summary.goals[0].ownGoal,true);
  assert.deepEqual(report.summary.scorers,[]);assert.match(report.paragraphs[0],/Obsidian won 1–0/);
});
test('goal clips end at the actual impact, with the original build-up and outcome',()=>{
  const {recording}=goalFixture(),replay=matchReplay(recording),indices=recordedGoalIndices(replay);
  assert.deepEqual(indices,[2]);const clip=recordedGoalClip(replay,indices[0]);assert.ok(clip);
  assert.equal(clip.frames.at(-1).ball.y,-1);assert.equal(replay.frames.at(-1).ball.y,8);
  assert.deepEqual(clip.frames,replay.frames.slice(0,3));assert.equal(recordedGoalClip(replay,0),null);
});
test('analysis is pure, deterministic and uses no new random draws',()=>{
  const replay=matchReplay(goalFixture().recording),before=structuredClone(replay),random=Math.random;
  try{Math.random=()=>{throw new Error('No RNG during analysis');};assert.deepEqual(analyseMatch(replay),analyseMatch(replay));assert.deepEqual(replay,before);}
  finally{Math.random=random;}
});
test('unfinished and partial recordings cannot claim a final win or complete tactical evidence',()=>{
  const {recording}=goalFixture();recording.finished=false;recording.partial=true;
  const report=analyseMatch(matchReplay(recording));assert.equal(report.headline,'The match so far');
  assert.match(report.paragraphs[0],/in-progress/);assert.match(report.coverage,/earlier play is missing/);
  assert.ok(!report.paragraphs.some(p=>/won |winner|xG was/.test(p)));
});
test('bad optional statistics are discarded without breaking the replay',()=>{
  const f=goalFixture(),value=recordingWithStatistics(f.recording,f.stats,f.after);value.statistics.teams.white.onTarget=999;
  const recording=restoreMatchRecording(value);assert.ok(recording);assert.equal(recording.statistics,undefined);
  assert.equal(analyseMatch(matchReplay(recording)).original,false);
});
test('statistics from a different game cannot be attached to a recording',()=>{
  const f=goalFixture();assert.equal(recordingWithStatistics(f.recording,f.stats,f.state).statistics,undefined);
});

function shapeReplay(high){
  const game=E.createGame({mode:'local',seed:1}),pieces=game.pieces;
  const places={'white-K':[6,16],'black-K':[7,0],'white-Q':[6,3],
    'white-R1':[0,12],'white-R2':[13,12],'white-B1':[4,8],'white-B2':[6,8],'white-N1':[8,8],'white-N2':[9,9],
    'white-P1':[3,13],'white-P2':[6,13],'white-P3':[10,13],
    'black-Q':[4,7],'black-R1':[1,6],'black-R2':[12,6],'black-B1':[6,7],'black-B2':[8,7],
    'black-N1':[10,7],'black-N2':[3,6],'black-P1':[5,6],'black-P2':[7,6],'black-P3':[9,6]};
  if(!high)places['black-R1']=[1,2];
  for(const p of pieces)[p.x,p.y]=places[p.id];game.ball={x:6,y:3,carrierId:'white-Q'};
  const initial=captureReplayFrame(game),frames=[initial];
  frames.push({...structuredClone(initial),action:{type:'kick',team:'white',pieceId:'white-N1',from:{x:5,y:3},to:{x:6,y:3}}});
  for(let i=0;i<100;i++){
    const frame=structuredClone(initial);frame.pieces.find(p=>p.id==='white-R1').y=11+i%2;
    frame.action={type:'move',team:'white',pieceId:'white-R1',from:{x:0,y:12-i%2},to:{x:0,y:11+i%2}};frames.push(frame);
  }
  return {kind:'match',frames,score:{white:0,black:0},partial:false,capped:false,finished:true,statistics:null};
}
test('a sustained high line and crowded centre require repeated observed positions',()=>{
  const report=analyseMatch(shapeReplay(true)),text=report.paragraphs.join(' ');
  assert.match(text,/Obsidian held a high line in 25 of 25/);assert.match(text,/Midfield was crowded in 25 of 25/);
  assert.ok(!/caused|because|lucky|unlucky/.test(text));
});
test('one deep outfield defender prevents an invented high-line claim',()=>{
  const report=analyseMatch(shapeReplay(false));assert.ok(!report.paragraphs.some(p=>/held a high line/.test(p)));
});
test('a fleeting high position cannot be called a sustained high line',()=>{
  const replay=shapeReplay(true);replay.frames=replay.frames.slice(0,10);
  assert.ok(!analyseMatch(replay).paragraphs.some(p=>/held a high line|Midfield was crowded/.test(p)));
});
