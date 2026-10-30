import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../dist/engine.js';
import * as R from '../dist/player-ratings.js';

const piece=(id,x,y)=>({id,team:id.split('-')[0],type:id.split('-')[1][0],x,y});
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-9,`${a} ≈ ${b}`);
function fixture({x=7,y=2,keeperX=6,turn=1,penalty=false,phase='kick'}={}){
 const g=E.createGame({seed:771,mode:'local',foulsEnabled:false});
 g.pieces=[piece('white-K',7,16),piece('black-K',keeperX,0),piece('black-R2',13,0),piece('white-R1',x,y)];
 Object.assign(g,{phase,attack:'white',turn,ball:{x,y,carrierId:'white-R1'},offside:null,pendingShot:null,lastAction:null,
  positionBudget:{normalUsed:false,pawnUsed:false,dribbleUsed:false},restart:penalty?{type:'penalty',team:'white',takerId:'white-R1',spot:{x,y}}:null});
 return g;
}
function resolve(g,ledger,{goal=false,penalty=false}={}){
 const pending=E.applyKick(g,g.ball.x,-1),id='black-K';
 ledger=R.recordPlayerRatings(ledger,g,pending);
 const keeper=pending.pieces.find(p=>p.id===id),choices=[{x:keeper.x,y:keeper.y,hold:true},...E.legalMoves(pending,id)];
 const best=choices.map(at=>({at,model:E.shotModel(pending,undefined,undefined,at)})).sort((a,b)=>a.model.probability-b.model.probability)[0];
 const m=best.model,roll=goal?0:m.probability+m.keeperCornerProbability+m.keeperReboundProbability+m.caughtSaveProbability/2;
 const after=best.at.hold?E.skipMove(pending,{roll}):E.applyMove(pending,id,best.at.x,best.at.y,{roll});
 assert.equal(after.lastAction.type,goal?'goal':'save');
 ledger=R.recordPlayerRatings(ledger,pending,after);
 return {ledger,game:after,model:m,player:R.playerRatingsSummary(ledger,after).players.find(p=>p.pieceId===id)};
}

test('method3 makes a useful native save and penalty save more visible without free baseline points',()=>{
 assert.equal(R.createPlayerRatings().version,3);
 for(const penalty of [false,true]){
  const game=fixture({penalty}),old=R.createPlayerRatings();old.version=2;
  const previous=resolve(game,old),current=resolve(game,R.createPlayerRatings());
  assert.ok(current.player.rating>previous.player.rating);
  close(current.player.metrics.xGPrevented,previous.player.metrics.xGPrevented);
  assert.equal(current.player.metrics.saves,1);
  if(penalty){assert.equal(current.player.metrics.penaltySaves,1);assert.ok(current.player.rating>=7.3);}
 }
 const quiet=R.playerRatingsSummary(R.createPlayerRatings(),E.createGame());
 assert.ok(quiet.players.every(p=>p.rating===6&&p.impact===0));
});

test('an isolated goal still loses merit, with blame tempered for an unavoidable high-xG chance',()=>{
 const goal=resolve(fixture(),R.createPlayerRatings(),{goal:true});
 assert.ok(goal.player.rating<6);assert.ok(goal.player.metrics.xGPrevented<0);
 const old=R.createPlayerRatings();old.version=2;
 const previous=resolve(fixture(),old,{goal:true});
 assert.ok(goal.player.rating>previous.player.rating,'a sampled concession is not punished more harshly than the earlier method');
});

test('below-expectation aggregate stopping remains negative even after several successful saves',()=>{
 let ledger=R.createPlayerRatings(),result;
 for(const [index,goal]of [false,false,true].entries()){
  result=resolve(fixture({turn:index*3+1}),ledger,{goal});ledger=result.ledger;
 }
 assert.equal(result.player.metrics.saves,2);assert.equal(result.player.metrics.goalsConceded,1);
 assert.ok(result.player.metrics.xGPrevented<0);
 assert.ok(ledger.players['black-K'].parts.goalkeeping<0,'positive per-save weighting cannot conceal a negative aggregate xG balance');
 close(ledger.players['black-K'].parts.goalkeeping,.60*result.player.metrics.keeperAdjustedXGPrevented);
 assert.ok(result.player.rating<6);
});

test('a useful but nonoptimal keeper reposition does not incur a fictitious missed-save penalty',()=>{
 const g=fixture({phase:'defendMove'}),threat=game=>Math.max(0,...E.legalKicks({...game,phase:'kick'}).filter(k=>k.goal==='white').map(k=>E.shotModel(game,k.x,k.y).probability));
 const before=threat(g),moves=E.legalMoves(g,'black-K').filter(m=>m.type!=='tackle').map(m=>({m,next:E.applyMove(g,'black-K',m.x,m.y)}));
 const best=Math.min(...moves.map(o=>threat(o.next))),choice=moves.find(o=>threat(o.next)<before-.01&&threat(o.next)>best+.005);
 assert.ok(choice,'there is a real improvement that is not the best available square');
 const old=R.createPlayerRatings();old.version=2;
 const oldResult=R.recordPlayerRatings(old,g,choice.next),current=R.recordPlayerRatings(R.createPlayerRatings(),g,choice.next);
 assert.ok(oldResult.players['black-K'].parts.defending<0);
 assert.equal(current.players['black-K'].parts.defending,0,'useful positioning is routine, never free positive merit');
 assert.ok(current.players['black-K'].impact>0);
});

test('method2 snapshots remain intact and continue with their original save coefficient',()=>{
 const old=R.createPlayerRatings();old.version=2;
 const first=resolve(fixture(),old),snapshot=structuredClone(first.ledger);
 const restored=R.restorePlayerRatings(snapshot,first.game);
 assert.deepEqual(restored,snapshot);
 const summary=R.playerRatingsSummary(restored,first.game);
 assert.equal(summary.methodVersion,2);assert.equal(summary.legacyMethod,true);
 close(restored.players['black-K'].parts.goalkeeping,.80*first.player.metrics.xGPrevented);
 const second=resolve(fixture({turn:5}),restored);
 assert.equal(second.ledger.version,2);
 close(second.ledger.players['black-K'].parts.goalkeeping,.80*second.player.metrics.xGPrevented);
 assert.equal('keeperAdjustedXGPrevented'in second.player.metrics,false);
});

test('method3 signed cumulative assessment is restored without regrading and rejects invalid telemetry',()=>{
 const result=resolve(fixture(),R.createPlayerRatings(),{goal:true});
 assert.ok(result.player.metrics.keeperAdjustedXGPrevented<0);
 assert.deepEqual(R.restorePlayerRatings(structuredClone(result.ledger),result.game),result.ledger);
 const bad=structuredClone(result.ledger);bad.players['black-K'].counts.keeperAdjustedXGPrevented=NaN;
 const fresh=R.restorePlayerRatings(bad,result.game);assert.equal(fresh.partial,true);assert.equal(fresh.version,3);
 assert.equal(fresh.players['black-K'].merit,0);
});
