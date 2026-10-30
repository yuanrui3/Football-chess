import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../dist/engine.js';
import * as R from '../dist/player-ratings.js';

const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} ≈ ${b}`);
const piece=(id,x,y)=>({id,team:id.split('-')[0],type:id.split('-')[1][0],x,y});
function fixture({turn=1,phase='defendMove',keeperX=6}={}){
  const game=E.createGame({seed:771,mode:'local',foulsEnabled:false});
  game.pieces=[piece('white-K',7,16),piece('black-K',keeperX,0),piece('black-R2',13,0),piece('white-R1',7,2)];
  Object.assign(game,{phase,attack:'white',turn,ball:{x:7,y:2,carrierId:'white-R1'},offside:null,pendingShot:null,lastAction:null,
    positionBudget:{normalUsed:false,pawnUsed:false,dribbleUsed:false},restart:null});
  return game;
}
const keeper=ledger=>ledger.players['black-K'];
const rated=(ledger,game)=>R.playerRatingsSummary(ledger,game).players.find(p=>p.pieceId==='black-K');
function cycle(ledger,turn=1){
  const game=fixture({turn}),away=E.applyMove(game,'black-K',5,0);
  const first=R.recordPlayerRatings(ledger,game,away);
  const back=E.applyMove(away,'black-K',6,0,{freePawn:true});
  return {first,ledger:R.recordPlayerRatings(first,away,back),game:back};
}
function resolved(ledger,{goal=false,turn=1,keeperX=6,best=true}={}){
  const game=fixture({turn,phase:'kick',keeperX}),pending=E.applyKick(game,7,-1);
  ledger=R.recordPlayerRatings(ledger,game,pending);
  const k=pending.pieces.find(p=>p.id==='black-K');
  const choices=[{x:k.x,y:k.y,hold:true},...(best?E.legalMoves(pending,k.id):[])];
  const choice=choices.map(at=>({at,model:E.shotModel(pending,undefined,undefined,at)})).sort((a,b)=>a.model.probability-b.model.probability)[0];
  const m=choice.model,roll=goal?0:m.probability+m.keeperCornerProbability+m.keeperReboundProbability+m.caughtSaveProbability/2;
  const after=choice.at.hold?E.skipMove(pending,{roll}):E.applyMove(pending,k.id,choice.at.x,choice.at.y,{roll});
  assert.equal(after.lastAction.type,goal?'goal':'save');
  return {ledger:R.recordPlayerRatings(ledger,pending,after),game:after,model:m};
}

test('correcting a keeper position in the same sequence fully refunds the original deduction',()=>{
  const result=cycle(R.createPlayerRatings());
  assert.ok(keeper(result.first).parts.defending<0);
  close(keeper(result.ledger).parts.defending,0);close(keeper(result.ledger).keeperPosition.totalCost,0);
  assert.equal(rated(result.ledger,result.game).rating,6);
  assert.equal(keeper(result.ledger).counts.saves,0);
});

test('repeated movement cycles cannot farm positive ratings or accumulate phantom penalties',()=>{
  let ledger=R.createPlayerRatings(),result;
  for(let turn=1;turn<=40;turn++){result=cycle(ledger,turn);ledger=result.ledger;}
  close(keeper(ledger).merit,0);close(keeper(ledger).keeperPosition.totalCost,0);
  assert.equal(rated(ledger,result.game).rating,6);
});

test('ordinary positioning costs at most .12 per sequence and .35 over a long match',()=>{
  let ledger=R.createPlayerRatings(),game;
  for(let turn=1;turn<=80;turn++){
    const before=fixture({turn}),next=E.applyMove(before,'black-K',5,0);
    ledger=R.recordPlayerRatings(ledger,before,next);game=next;
    assert.ok(keeper(ledger).keeperPosition.sequenceCost<=.12);
    assert.ok(keeper(ledger).parts.defending>=-.35-1e-9);
  }
  close(keeper(ledger).parts.defending,-.35);
  assert.ok(rated(ledger,game).rating>=5.6);
});

test('a new round cannot refund a positioning decision from an earlier round',()=>{
  const before=fixture(),away=E.applyMove(before,'black-K',5,0);
  let ledger=R.recordPlayerRatings(R.createPlayerRatings(),before,away),cost=keeper(ledger).merit;
  const nextRound={...away,turn:away.turn+1,phase:'defendMove',positionBudget:{normalUsed:false,pawnUsed:false,dribbleUsed:false}};
  const back=E.applyMove(nextRound,'black-K',6,0);
  ledger=R.recordPlayerRatings(ledger,nextRound,back);
  close(keeper(ledger).merit,cost);
});

test('shot declaration closes the refundable positioning sequence',()=>{
  const before=fixture(),away=E.applyMove(before,'black-K',5,0);
  let ledger=R.recordPlayerRatings(R.createPlayerRatings(),before,away);
  const kick={...away,phase:'kick'},shot=E.applyKick(kick,7,-1);
  ledger=R.recordPlayerRatings(ledger,kick,shot);
  assert.equal(keeper(ledger).keeperPosition.key,null);
  assert.ok(keeper(ledger).keeperPosition.totalCost>0);
});

test('save and undo preserve a pending positioning refund exactly',()=>{
  const before=fixture(),away=E.applyMove(before,'black-K',5,0);
  const first=R.recordPlayerRatings(R.createPlayerRatings(),before,away),snapshot=JSON.parse(JSON.stringify(first));
  const restored=R.restorePlayerRatings(snapshot,away);assert.deepEqual(restored,snapshot);
  const back=E.applyMove(away,'black-K',6,0,{freePawn:true});
  assert.deepEqual(R.recordPlayerRatings(restored,away,back),R.recordPlayerRatings(first,away,back));
  assert.deepEqual(first,snapshot,'the saved undo entry is unchanged');
});

test('invalid positioning telemetry starts a partial record instead of granting a refund',()=>{
  const {first,game}=cycle(R.createPlayerRatings());
  for(const field of ['netThreat','sequenceCost','totalCost']){
    const bad=structuredClone(first);keeper(bad).keeperPosition[field]=NaN;
    const restored=R.restorePlayerRatings(bad,game);
    assert.equal(restored.partial,true);assert.equal(keeper(restored).merit,0);
  }
});

test('method3 saves retain their original grades, formulas and pending history',()=>{
  const legacy=R.createPlayerRatings();legacy.version=3;
  const result=cycle(legacy),saved=structuredClone(result.ledger);
  assert.ok(keeper(saved).merit<0);
  assert.deepEqual(R.restorePlayerRatings(saved,result.game),saved);
  assert.equal(rated(saved,result.game).rating,5.8);
  assert.equal(R.playerRatingsSummary(saved,result.game).legacyMethod,true);
});

test('negative keeper merit has the same initial sensitivity as positive credit, while outfield curves remain unchanged',()=>{
  const game=fixture(),ledger=cycle(R.createPlayerRatings()).ledger;
  keeper(ledger).merit=-1;
  const out=ledger.players['white-R1'];out.merit=-1;
  const summary=R.playerRatingsSummary(ledger,game);
  assert.equal(summary.players.find(p=>p.pieceId==='black-K').rating,5);
  assert.equal(summary.players.find(p=>p.pieceId==='white-R1').rating,4.1);
  keeper(ledger).merit=1;assert.equal(rated(ledger,game).rating,7);
});

test('strong stopping outranks routine outfield play while poor stopping can still grade below six',()=>{
  let ledger=R.createPlayerRatings(),result;
  for(let i=0;i<3;i++){result=resolved(ledger,{turn:i*3+1});ledger=result.ledger;}
  assert.ok(rated(ledger,result.game).rating>=7);
  assert.ok(rated(ledger,result.game).rating>R.playerRatingsSummary(ledger,result.game).players.find(p=>p.pieceId==='black-R2').rating);
  const poor=resolved(R.createPlayerRatings(),{goal:true});
  assert.ok(rated(poor.ledger,poor.game).rating<6);
});

test('cumulative stopping credit is independent of shot order, including saves above the old positive cap',()=>{
  const hardSave=resolved(R.createPlayerRatings(),{keeperX:4,best:false});
  assert.ok(keeper(hardSave.ledger).parts.goalkeeping>1.5,'the scenario exercises the old clipping threshold');
  const results=[];
  for(const goals of [[false,true,true],[true,true,false]]){
    let ledger=R.createPlayerRatings(),result;
    for(const [i,goal] of goals.entries()){
      result=resolved(ledger,{goal,turn:i*3+1,keeperX:4,best:false});ledger=result.ledger;
    }
    results.push(result);
  }
  close(keeper(results[0].ledger).parts.goalkeeping,keeper(results[1].ledger).parts.goalkeeping);
  close(keeper(results[0].ledger).counts.keeperAdjustedXGPrevented,keeper(results[1].ledger).counts.keeperAdjustedXGPrevented);
  assert.equal(rated(results[0].ledger,results[0].game).rating,rated(results[1].ledger,results[1].game).rating);
});

test('keeper reactions do not debit self-created difficulty twice',()=>{
  const result=resolved(R.createPlayerRatings(),{keeperX:4,best:false});
  const p=keeper(result.ledger),balance=p.counts.keeperAdjustedXGPrevented;
  assert.ok(p.counts.xGPrevented>balance);
  close(p.parts.goalkeeping,(balance>=0?1.8:.6)*balance);
});
