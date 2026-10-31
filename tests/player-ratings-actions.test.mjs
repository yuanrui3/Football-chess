import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../dist/engine.js';
import {createPlayerRatings,recordPlayerRatings,restorePlayerRatings,playerRatingsSummary} from '../dist/player-ratings.js';
import {createMatchStats,recordMatchTransition,restoreMatchStats} from '../dist/match-stats.js';
import {createMatchRecording,appendMatchRecording,recordingWithStatistics,encodeMatchFile,readMatchFile} from '../dist/match-archive.js';

const piece=(id,x,y)=>({id,team:id.split('-')[0],type:id.split('-')[1][0],x,y});
function fixture(players,carrier,{phase='attackMove'}={}){
  const game=E.createGame({seed:421,mode:'local',foulsEnabled:false});
  const defaults=[piece('white-K',8,16),piece('black-K',6,0),piece('black-R2',13,0)];
  game.pieces=[...defaults.filter(p=>!players.some(q=>q.id===p.id)),...players];
  const owner=game.pieces.find(p=>p.id===carrier);
  Object.assign(game,{phase,attack:owner.team,ball:{x:owner.x,y:owner.y,carrierId:carrier},restart:null,
    offside:null,pendingShot:null,lastAction:null,turn:1,positionBudget:{normalUsed:false,pawnUsed:false,dribbleUsed:false}});
  return game;
}
function track(game){
  return {game,ledger:createPlayerRatings(),step(next){assert.notEqual(next,this.game);this.ledger=recordPlayerRatings(this.ledger,this.game,next);this.game=next;return this;},
    move(id,x,y,options){return this.step(E.applyMove(this.game,id,x,y,options));},
    kick(x,y){return this.step(E.applyKick(this.game,x,y,{roll:0}));},
    ready(){for(let n=0;n<4&&['attackMove','defendMove','passRun'].includes(this.game.phase);n++)this.step(E.skipMove(this.game));return this;},
    player(id){return this.ledger.players[id];}};
}
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-10,`${a} = ${b}`);
const nextRound=game=>({...game,turn:game.turn+1,phase:'attackMove',positionBudget:{normalUsed:false,pawnUsed:false,dribbleUsed:false}});

test('retained dribbles and completed forward passes have distinct, accurate explanations',()=>{
  const run=track(fixture([piece('white-Q',3,12),piece('white-R1',3,7)],'white-Q'));
  run.move('white-Q',3,11).ready().kick(3,7);
  const p=run.player('white-Q');
  assert.equal(p.counts.forwardDribbles,1);assert.equal(p.counts.dribbleProgress,1);
  assert.equal(p.counts.forwardPasses,1);assert.equal(p.counts.passProgress,4);assert.equal(p.counts.progressSquares,5);
  const notes=playerRatingsSummary(run.ledger,run.game).players.find(p=>p.pieceId==='white-Q').notes.join(' ');
  assert.match(notes,/forward dribble with possession kept/);assert.match(notes,/successful forward pass/);
  assert.doesNotMatch(notes,/new squares/);
});

test('sideways and backward completed passes do not earn forward-progress credit',()=>{
  for(const target of [[7,10],[3,13]]){
    const run=track(fixture([piece('white-Q',3,10),piece('white-R1',...target)],'white-Q',{phase:'kick'})).kick(...target);
    assert.equal(run.game.ball.carrierId,'white-R1');assert.equal(run.player('white-Q').counts.forwardPasses,0);
    assert.equal(run.player('white-Q').merit,0);
  }
});

test('an onside forward run earns credit for a reachable passing option even without an immediate shot',()=>{
  const run=track(fixture([piece('white-Q',4,12),piece('white-R1',8,10)],'white-Q')).move('white-R1',8,8);
  assert.equal(run.game.lastAction.type,'move');
  assert.ok(E.legalKicks({...run.game,phase:'kick'}).some(k=>k.receiverId==='white-R1'&&!k.offside));
  assert.equal(run.player('white-R1').counts.forwardRuns,1);assert.equal(run.player('white-R1').counts.runProgress,2);
  assert.ok(run.player('white-R1').parts.progress>0);assert.equal(run.player('white-R1').counts.progressSquares,0);
});

test('unreachable and offside forward runs do not earn movement credit',()=>{
  const unreachable=track(fixture([piece('white-Q',4,12),piece('white-R1',8,11)],'white-Q')).move('white-R1',8,9);
  assert.equal(unreachable.player('white-R1').counts.forwardRuns,0);assert.equal(unreachable.player('white-R1').merit,0);
  const offside=track(fixture([piece('white-Q',4,11),piece('white-R1',8,9),piece('black-R2',13,9)],'white-Q')).move('white-R1',8,7);
  assert.equal(offside.player('white-R1').counts.forwardRuns,0);assert.equal(offside.player('white-R1').merit,0);
});

test('returning to the same forward-run frontier cannot farm credit across rounds',()=>{
  const run=track(fixture([piece('white-Q',4,12),piece('white-R1',8,10)],'white-Q')).move('white-R1',8,8);
  const merit=run.player('white-R1').merit;
  run.game=nextRound(run.game);run.move('white-R1',8,10);run.game=nextRound(run.game);run.move('white-R1',8,8);
  assert.equal(run.player('white-R1').counts.forwardRuns,1);near(run.player('white-R1').merit,merit);
});

test('a keeper carry earns one fifth of the equivalent pawn movement credit for either team',()=>{
  for(const team of ['white','black']){
    const y=team==='white'?12:4,to=team==='white'?11:5;
    const carry=type=>{const id=`${team}-${type}`;return track(fixture([piece(id,3,y)],id)).move(id,3,to).player(id);};
    const keeper=carry('K'),pawn=carry('P1');
    assert.equal(keeper.counts.forwardDribbles,1);assert.equal(keeper.counts.dribbleProgress,1);
    near(keeper.parts.progress,pawn.parts.progress*.2);near(keeper.impact,pawn.impact*.2);
    assert.equal(keeper.counts.possessionKeeps,0);
  }
});

test('a keeper running forward off the ball earns no generic run credit',()=>{
  const run=track(fixture([piece('white-Q',4,14),piece('white-K',8,11)],'white-Q')).move('white-K',8,10);
  assert.ok(E.legalKicks({...run.game,phase:'kick'}).some(k=>k.receiverId==='white-K'&&!k.offside));
  assert.equal(run.player('white-K').counts.forwardRuns,0);assert.equal(run.player('white-K').parts.progress,0);
  assert.equal(run.player('white-K').merit,0);
});

test('keeper forward distribution retains full progress weight',()=>{
  const pass=type=>{const id=`white-${type}`;return track(fixture([piece(id,3,12),piece('white-R1',3,7)],id,{phase:'kick'})).kick(3,7).player(id);};
  const keeper=pass('K'),queen=pass('Q');
  assert.equal(keeper.counts.forwardPasses,1);near(keeper.parts.progress,queen.parts.progress);near(keeper.impact,queen.impact);
});

test('surviving a native knight tackle earns small, probability-weighted retention credit only once per possession',()=>{
  const game=fixture([piece('white-P1',3,9),piece('black-N1',4,8)],'black-N1',{phase:'defendMove'});
  const move=E.legalMoves(game,'white-P1').find(m=>m.type==='tackle');assert.ok(move);
  const run=track(game).move('white-P1',move.x,move.y,{roll:.8});assert.equal(run.game.lastAction.type,'tackleMiss');
  const p=run.player('black-N1');assert.equal(p.counts.possessionKeeps,1);near(p.impact,.01);
  run.game={...game,turn:2};run.move('white-P1',move.x,move.y,{roll:.8});
  assert.equal(run.player('black-N1').counts.possessionKeeps,1);near(run.player('black-N1').impact,.01);
});

test('escaping a native tackle threat by dribble or completed pass earns retention credit',()=>{
  for(const mode of ['move','pass']){
    const run=track(fixture([piece('white-Q',3,9),piece('white-R1',1,9),piece('black-P1',4,8)],'white-Q',{phase:mode==='move'?'attackMove':'kick'}));
    if(mode==='move')run.move('white-Q',3,11);else run.kick(1,9);
    assert.equal(run.player('white-Q').counts.possessionKeeps,1,mode);
    assert.equal(run.player('white-Q').counts.forwardPasses,0);assert.equal(run.player('white-Q').counts.forwardDribbles,0);
    near(run.player('white-Q').impact,.015);
  }
});

test('waiting and moving while unpressured cannot farm possession credit',()=>{
  const run=track(fixture([piece('white-Q',3,9)],'white-Q'));
  run.step(E.skipMove(run.game));assert.equal(run.player('white-Q').counts.possessionKeeps,0);
  run.game=nextRound(run.game);run.move('white-Q',3,11);
  assert.equal(run.player('white-Q').counts.possessionKeeps,0);assert.equal(run.player('white-Q').merit,0);
});

test('method4 restore preserves historical grades; continuation adds the new counters prospectively',()=>{
  const run=track(fixture([piece('white-P1',3,9)],'white-P1')).move('white-P1',3,8);
  const old=structuredClone(run.ledger);old.version=4;
  delete old.frontier.runs;delete old.frontier.retained;
  for(const p of Object.values(old.players))for(const key of ['forwardDribbles','dribbleProgress','forwardPasses','passProgress','forwardRuns','runProgress','possessionKeeps','legacyProgressSquares'])delete p.counts[key];
  assert.deepEqual(restorePlayerRatings(old,run.game),old);
  const summary=playerRatingsSummary(old,run.game);assert.equal(summary.legacyMethod,true);
  assert.match(summary.players.find(p=>p.pieceId==='white-P1').notes.join(' '),/Retained forward ball progress/);
  const before=nextRound(run.game),after=E.skipMove(before),updated=recordPlayerRatings(old,before,after);
  assert.equal(updated.version,5);near(updated.players['white-P1'].merit,old.players['white-P1'].merit);
  assert.equal(updated.players['white-P1'].counts.legacyProgressSquares,1);assert.equal(updated.players['white-P1'].counts.forwardDribbles,0);
  assert.deepEqual(restorePlayerRatings(updated,after),updated);assert.equal(recordPlayerRatings(updated,before,after),updated);
  const freshBefore=nextRound(after),freshAfter=E.applyMove(freshBefore,'white-P1',3,7),latest=recordPlayerRatings(updated,freshBefore,freshAfter);
  assert.equal(latest.players['white-P1'].counts.forwardDribbles,1);assert.equal(latest.players['white-P1'].counts.legacyProgressSquares,1);
});

test('new action counters and frontier survive statistics and compressed match round trips',async()=>{
  const before=fixture([piece('white-Q',3,12)],'white-Q');
  const parking=Array.from({length:E.BOARD_HEIGHT},(_,y)=>[[0,y],[13,y]]).flat();
  for(const p of E.createGame().pieces)if(!before.pieces.some(q=>q.id===p.id)){
    const [x,y]=parking.find(([x,y])=>!before.pieces.some(q=>q.x===x&&q.y===y));before.pieces.push({...p,x,y});
  }
  const after=E.applyMove(before,'white-Q',3,10);
  const stats=recordMatchTransition(createMatchStats(),before,after),recording=createMatchRecording(before);
  appendMatchRecording(recording,before,after);
  assert.deepEqual(restoreMatchStats(stats,after),stats);
  const saved=recordingWithStatistics(recording,stats,after),encoded=await encodeMatchFile(saved),decoded=await readMatchFile(encoded.blob);
  assert.deepEqual(decoded.statistics.playerRatings,stats.playerRatings);
});

test('invalid counters or farming frontiers cannot enter restored ratings',()=>{
  const run=track(fixture([piece('white-P1',3,9)],'white-P1')).move('white-P1',3,8);
  for(const corrupt of [r=>r.players['white-P1'].counts.dribbleProgress++,r=>r.players['white-P1'].counts.forwardRuns=-1,r=>r.frontier.runs['white-P1']=99,r=>r.frontier.retained['white-P1']='yes']){
    const bad=structuredClone(run.ledger);corrupt(bad);const restored=restorePlayerRatings(bad,run.game);
    assert.equal(restored.partial,true);assert.equal(restored.transitions,0);
  }
});
