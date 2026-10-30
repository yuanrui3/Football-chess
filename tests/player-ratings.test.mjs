import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../dist/engine.js';
import {createPlayerRatings,restorePlayerRatings,recordPlayerRatings,playerRatingsSummary} from '../dist/player-ratings.js';
import {createMatchStats,restoreMatchStats,recordMatchTransition} from '../dist/match-stats.js';

const p=(id,x,y)=>({id,team:id.split('-')[0],type:id.split('-')[1][0],x,y});
function fixture(pieces,carrier,{phase='attackMove',attack=carrier.split('-')[0],fouls=false}={}){
  const g=E.createGame({seed:1604,mode:'local',foulsEnabled:fouls});
  g.pieces=[p('white-K',8,16),p('black-K',6,0),p('black-R2',13,0),...pieces];
  const owner=g.pieces.find(p=>p.id===carrier);
  Object.assign(g,{phase,attack,ball:{x:owner.x,y:owner.y,carrierId:carrier},restart:null,offside:null,pendingShot:null,lastAction:null,turn:1});
  return g;
}
function tracked(game){
  return {game,stats:createMatchStats(),step(next){this.stats=recordMatchTransition(this.stats,this.game,next);this.game=next;return this;},
    ready(){for(let n=0;n<3&&['attackMove','defendMove'].includes(this.game.phase);n++)this.step(E.skipMove(this.game));return this;},
    move(id,x,y,options){return this.step(E.applyMove(this.game,id,x,y,options));},
    kick(x,y,options){return this.step(E.applyKick(this.game,x,y,options));},
    shot(roll=0){this.ready();this.kick(6,-1);return this.step(E.skipMove(this.game,{roll}));},
    player(id){return playerRatingsSummary(this.stats.playerRatings,this.game).players.find(p=>p.pieceId===id);}};
}
const record=(before,after)=>recordPlayerRatings(createPlayerRatings(),before,after);
const directThreat=game=>Math.max(0,...E.legalKicks({...game,phase:'kick'}).filter(k=>k.goal===game.attack&&!k.offside).map(k=>E.shotModel(game,k.x,k.y).probability));

 test('an untouched full squad has stable IDs, neutral grades and no invented impact',()=>{
  const g=E.createGame({seed:7}),summary=playerRatingsSummary(createPlayerRatings(),g);
  assert.equal(summary.partial,false);assert.equal(summary.players.length,22);
  for(const player of summary.players){assert.equal(player.rating,6);assert.equal(player.impact,0);assert.equal(player.actions,0);assert.ok(player.notes.includes('Limited involvement'));}
});

test('a pawn using its full dribbling ability can outperform a queen doing the same routine step',()=>{
  const result=id=>{const g=fixture([p(id,3,9)],id),n=E.applyMove(g,id,3,8);return playerRatingsSummary(record(g,n),n).players.find(p=>p.pieceId===id);};
  const pawn=result('white-P1'),queen=result('white-Q');
  assert.ok(pawn.rating>queen.rating);assert.equal(pawn.impact,queen.impact,'equal absolute progress has a different native expectation');
  const g=fixture([p('white-Q',1,13)],'white-Q'),n=E.applyMove(g,'white-Q',1,5),long=playerRatingsSummary(record(g,n),n).players.find(p=>p.pieceId==='white-Q');
  assert.ok(long.impact>pawn.impact);assert.ok(long.rating>=pawn.rating-.1,'a full queen carry is judged against its larger native range');
});

test('routine sideways passing and the shared pawn bonus do not earn free merit',()=>{
  const run=tracked(fixture([p('white-Q',2,9),p('white-R1',10,9),p('white-P1',1,12)],'white-Q',{phase:'kick'}));
  run.kick(10,9);assert.equal(run.player('white-Q').rating,6);assert.equal(run.player('white-Q').impact,0);
  run.move('white-P1',2,12,{freePawn:true});assert.equal(run.player('white-P1').rating,6);assert.equal(run.player('white-P1').impact,0);
});

test('self-pass and return loops cannot manufacture new-territory progression',()=>{
  const run=tracked(fixture([p('white-P1',3,9)],'white-P1'));
  run.move('white-P1',3,8);const earned=run.stats.playerRatings.players['white-P1'].merit;
  run.ready().kick(3,9).move('white-P1',3,9).ready().kick(3,8).move('white-P1',3,8);
  assert.equal(run.stats.playerRatings.players['white-P1'].merit,earned);
  assert.equal(run.stats.playerRatings.players['white-P1'].counts.progressSquares,1);
});

test('shot declaration, resolution and duplicate recording count one attempt and one actor decision',()=>{
  const run=tracked(fixture([p('white-R1',6,5)],'white-R1',{phase:'kick'}));
  run.kick(6,-1);assert.equal(run.stats.playerRatings.players['white-R1'].actions,1);assert.equal(run.stats.playerRatings.players['white-R1'].counts.shots,0);
  const before=run.game;run.step(E.skipMove(before,{roll:0}));
  const ledger=run.stats.playerRatings;assert.equal(ledger.players['white-R1'].actions,1);assert.equal(ledger.players['white-R1'].counts.shots,1);assert.equal(ledger.players['white-R1'].counts.goals,1);
  assert.equal(recordPlayerRatings(ledger,before,run.game),ledger,'an identical transition is idempotent');
});

test('earlier rating records retain their original chance-first result weighting',()=>{
  const g=fixture([p('white-R1',6,5)],'white-R1',{phase:'kick'}),pending=E.applyKick(g,6,-1),legacy=createPlayerRatings();legacy.version=1;
  const base=recordPlayerRatings(legacy,g,pending);
  const goal=E.skipMove(pending,{roll:0}),model=E.shotModel(pending),save=E.skipMove(pending,{roll:model.probability+model.keeperCornerProbability+model.keeperReboundProbability+model.caughtSaveProbability/2});
  assert.equal(save.lastAction.type,'save');
  const good=playerRatingsSummary(recordPlayerRatings(base,pending,goal),goal).players.find(p=>p.pieceId==='white-R1');
  const unlucky=playerRatingsSummary(recordPlayerRatings(base,pending,save),save).players.find(p=>p.pieceId==='white-R1');
  assert.ok(good.rating>=unlucky.rating);assert.ok(good.rating-unlucky.rating<.5,'one random result contributes only a modest residual');
});

test('accurate provision creates xG credit and roundtrip restoration preserves exactly the recorded ledger',()=>{
  const run=tracked(fixture([p('white-R2',6,9),p('white-R1',6,5)],'white-R2',{phase:'kick'}));
  run.kick(6,5).ready().kick(6,-1);
  const before=structuredClone(run.stats);run.stats=restoreMatchStats(before,run.game);
  assert.deepEqual(run.stats,before);
  run.step(E.skipMove(run.game,{roll:0}));
  assert.ok(run.stats.playerRatings.players['white-R2'].counts.createdXG>.04);
  assert.equal(run.stats.goals[0].assistId,'white-R2');
  assert.deepEqual(restoreMatchStats(structuredClone(run.stats),run.game),run.stats);
});

test('the knight’s native50% tackle evasion tempers both winning and losing the challenge',()=>{
  const g=fixture([p('white-P1',3,9),p('black-N1',4,8)],'black-N1',{phase:'defendMove',attack:'black'});
  const move=E.legalMoves(g,'white-P1').find(m=>m.type==='tackle');assert.equal(move.tackleProbability,.5);
  const result=roll=>{const n=E.applyMove(g,'white-P1',move.x,move.y,{roll});return playerRatingsSummary(record(g,n),n).players.find(p=>p.pieceId==='white-P1');};
  const win=result(.2),miss=result(.8);assert.ok(win.rating>=miss.rating);assert.ok(win.rating-miss.rating<.5);
});

test('a defending body receives measured screening credit but a wide shot or body block gives the keeper no save credit',()=>{
  const g=fixture([p('white-R1',6,5),p('black-P1',6,3)],'white-R1',{phase:'kick'}),pending=E.applyKick(g,6,-1),base=record(g,pending),model=E.shotModel(pending);
  const blocked=E.skipMove(pending,{roll:1-model.blockPossessionProbability/2});assert.equal(blocked.lastAction.type,'blockedShot');
  const ledger=recordPlayerRatings(base,pending,blocked);assert.ok(ledger.players['black-P1'].counts.screens>0);assert.ok(ledger.players['black-P1'].merit>0);assert.equal(ledger.players['black-K'].counts.saves,0);
  const wide=E.skipMove(pending,{roll:model.probability+model.saveProbability+model.missProbability/2});assert.equal(wide.lastAction.type,'shotMiss');
  const wideLedger=recordPlayerRatings(base,pending,wide);assert.equal(wideLedger.players['black-K'].counts.saves,0);assert.equal(wideLedger.players['black-K'].merit,0);
});

test('keeper stops are credited by difficulty and a teammate’s backward shot is not a save achievement',()=>{
  const g=fixture([p('white-R1',6,5)],'white-R1',{phase:'kick'}),pending=E.applyKick(g,6,-1),model=E.shotModel(pending);
  const save=E.skipMove(pending,{roll:model.probability+model.keeperCornerProbability+model.keeperReboundProbability+model.caughtSaveProbability/2}),ledger=recordPlayerRatings(record(g,pending),pending,save);
  assert.equal(ledger.players['black-K'].counts.saves,1);
  const own=fixture([p('white-R1',6,12)],'white-R1',{phase:'kick'}),ownPending=E.applyKick(own,6,17),ownModel=E.shotModel(ownPending);
  const caught=E.skipMove(ownPending,{roll:ownModel.probability+ownModel.keeperCornerProbability+ownModel.caughtSaveProbability/2});assert.equal(caught.lastAction.type,'save');assert.equal(caught.lastAction.backPass,true);
  const ownLedger=recordPlayerRatings(record(own,ownPending),ownPending,caught);assert.equal(ownLedger.players['white-K'].counts.saves,0);assert.equal(ownLedger.players['white-K'].merit,0);
});

test('penalty conversion uses the same native80% expectation for pawn and queen',()=>{
  const result=id=>{const g=fixture([p(id,6,5)],id,{phase:'kick'});g.restart={type:'penalty',team:'white',takerId:id};const n=E.applyKick(g,6,-1),a=E.skipMove(n,{roll:0});return playerRatingsSummary(recordPlayerRatings(record(g,n),n,a),a).players.find(p=>p.pieceId===id);};
  const pawn=result('white-P1'),queen=result('white-Q');assert.equal(pawn.rating,queen.rating);assert.ok(pawn.rating<=6.3);
});

test('equal native shooting difficulty gives pawn and queen the same missed-chance debit',()=>{
  const result=id=>{
    const g=fixture([p(id,7,2)],id,{phase:'kick'}),pending=E.applyKick(g,7,-1),model=E.shotModel(pending);
    const saved=E.skipMove(pending,{roll:model.probability+model.keeperCornerProbability+model.keeperReboundProbability+model.caughtSaveProbability/2});
    assert.equal(saved.lastAction.type,'save');
    const ledger=recordPlayerRatings(record(g,pending),pending,saved);
    return {xg:model.probability,merit:ledger.players[id].merit,player:playerRatingsSummary(ledger,saved).players.find(p=>p.pieceId===id)};
  };
  const pawn=result('white-P1'),queen=result('white-Q');assert.equal(pawn.xg,queen.xg);
  assert.ok(pawn.xg>=.35);assert.ok(pawn.player.rating<6);assert.equal(pawn.player.rating,queen.player.rating);
  assert.ok(Math.abs(pawn.merit-queen.merit)<1e-9,'less powerful pieces are not punished more for the same native chance');
});

test('equal native lost-duel risk gives pawn and queen the same context-weighted debit',()=>{
  const result=id=>{
    const g=fixture([p(id,3,9),p('black-N1',4,8)],'black-N1',{phase:'defendMove',attack:'black'});
    const move=E.legalMoves(g,id).find(m=>m.type==='tackle');assert.equal(move.tackleProbability,.5);
    const n=E.applyMove(g,id,move.x,move.y,{roll:.8});assert.equal(n.lastAction.type,'tackleMiss');
    const ledger=record(g,n);return {merit:ledger.players[id].merit,player:playerRatingsSummary(ledger,n).players.find(p=>p.pieceId===id)};
  };
  const pawn=result('white-P1'),queen=result('white-Q');assert.ok(pawn.player.rating<6);assert.equal(pawn.player.rating,queen.player.rating);
  assert.ok(Math.abs(pawn.merit-queen.merit)<1e-9);
});

test('own-goal blame follows stable shooting identity and never credits the opponent’s phantom scorer',()=>{
  const run=tracked(fixture([p('white-R1',6,12)],'white-R1',{phase:'kick'}));run.kick(6,17).step(E.skipMove(run.game,{roll:0}));
  assert.equal(run.game.lastAction.type,'goal');assert.equal(run.stats.goals[0].team,'black');assert.equal(run.player('white-R1').metrics.ownGoals,1);assert.ok(run.player('white-R1').notes.includes('1 own goal'));assert.ok(run.player('white-R1').rating<6);
  assert.equal(run.stats.playerRatings.players['white-R1'].counts.goals,0);
});

test('future random seed is neither consulted nor mutated by rating analysis',()=>{
  const g=fixture([p('white-R1',6,5),p('black-P1',6,3)],'white-R1',{phase:'kick'}),n=E.applyKick(g,6,-1),a=E.skipMove(n,{roll:0});
  const original=JSON.stringify({g,n,a});
  const expected=recordPlayerRatings(record(g,n),n,a);
  for(const state of [g,n,a])Object.defineProperty(state,'randomState',{enumerable:true,get(){throw new Error('rating must not read future randomness');}});
  const actual=recordPlayerRatings(record(g,n),n,a);assert.deepEqual(actual,expected);
  for(const state of [g,n,a])Object.defineProperty(state,'randomState',{enumerable:true,value:1,writable:true});
  assert.ok(original.length>0);assert.equal(actual.players['white-R1'].counts.shots,1);
});

test('missing or invalid old telemetry is visibly partial and does not reconstruct past achievements',()=>{
  const g=E.createGame({seed:7}),old=createMatchStats();delete old.playerRatings;
  const restored=restoreMatchStats(old,g);assert.equal(restored.partial,false);assert.equal(restored.playerRatings.partial,true);assert.equal(playerRatingsSummary(restored.playerRatings,g).players.length,22);
  assert.ok(playerRatingsSummary(restored.playerRatings,g).players.every(p=>p.rating===6&&p.impact===0));
  const bad=createPlayerRatings();bad.players.invalid={merit:NaN};assert.equal(restorePlayerRatings(bad,g).partial,true);
});

test('the rating ledger is immutable and restoring an undo snapshot reproduces the original decision',()=>{
  const g=fixture([p('white-P1',3,9)],'white-P1'),n=E.applyMove(g,'white-P1',3,8),initial=createPlayerRatings(),unchanged=JSON.stringify({g,n,initial});
  const first=recordPlayerRatings(initial,g,n);assert.equal(JSON.stringify({g,n,initial}),unchanged);
  const restored=restorePlayerRatings(structuredClone(initial),g);assert.deepEqual(recordPlayerRatings(restored,g,n),first);
});

test('a promoted emergency keeper retains its stable identity, actual abilities and sent-off teammates',()=>{
  const g=E.createGame({seed:7}),ledger=createPlayerRatings(),removed=g.pieces.find(p=>p.id==='white-K'),pawn=g.pieces.find(p=>p.id==='white-P1');
  g.sentOff=[{...removed,reason:'red'}];g.pieces=g.pieces.filter(p=>p.id!==removed.id);pawn.type='K';pawn.originalType='P';pawn.replacementKeeper=true;
  const summary=playerRatingsSummary(ledger,g),replacement=summary.players.find(p=>p.pieceId==='white-P1');assert.equal(summary.players.length,22);assert.equal(replacement.type,'K');assert.equal(summary.players.find(p=>p.pieceId==='white-K').sentOff,true);
});

test('vacating a defensive screen or abandoning the goalkeeper box loses measured coverage credit',()=>{
  let g=fixture([p('black-R1',6,12),p('white-R1',4,13)],'black-R1',{phase:'defendMove',attack:'black'});
  let ledger=createPlayerRatings(),n=E.applyMove(g,'white-R1',6,13);ledger=recordPlayerRatings(ledger,g,n);
  const first=ledger.players['white-R1'].merit;assert.ok(first>0);
  // Fresh native defensive decisions with exactly the same live shot geometry.
  const again=state=>({...state,phase:'defendMove',turn:state.turn+1,positionBudget:{normalUsed:false,pawnUsed:false,dribbleUsed:false}});
  g=again(n);n=E.applyMove(g,'white-R1',4,13);ledger=recordPlayerRatings(ledger,g,n);
  assert.ok(Math.abs(ledger.players['white-R1'].merit)<1e-9,'reopening exactly the same lane cancels its defensive merit');
  g=again(n);n=E.applyMove(g,'white-R1',6,13);ledger=recordPlayerRatings(ledger,g,n);assert.ok(ledger.players['white-R1'].merit<=first+1e-9,'repeated screening never exceeds the single useful screen');
  g=fixture([p('black-R1',6,10)],'black-R1',{phase:'defendMove',attack:'black'});Object.assign(g.pieces.find(p=>p.id==='white-K'),{x:6,y:14});
  n=E.applyMove(g,'white-K',5,13);const abandoned=record(g,n);
  assert.ok(abandoned.players['white-K'].merit<0);assert.ok(playerRatingsSummary(abandoned,n).players.find(p=>p.pieceId==='white-K').rating<6);
});

test('keeper reaction credit uses native difficulty and cannot reward deliberately worse coverage',()=>{
  const g=fixture([p('white-R1',7,5)],'white-R1',{phase:'kick'}),pending=E.applyKick(g,7,-1),base=record(g,pending);
  const keeper=pending.pieces.find(p=>p.id==='black-K');
  const choices=[{type:'hold',x:keeper.x,y:keeper.y},...E.legalMoves(pending,keeper.id).map(move=>({...move,type:'move'}))]
    .map(move=>({move,model:E.shotModel(pending,undefined,undefined,move)})).sort((a,b)=>a.model.probability-b.model.probability);
  const best=choices[0],worst=choices.at(-1);assert.ok(worst.model.probability>best.model.probability+.02);
  const resolve=choice=>{const roll=choice.model.probability+choice.model.keeperCornerProbability+choice.model.keeperReboundProbability+choice.model.caughtSaveProbability/2;
    return choice.move.type==='hold'?E.skipMove(pending,{roll}):E.applyMove(pending,keeper.id,choice.move.x,choice.move.y,{roll});};
  const good=resolve(best),poor=resolve(worst);assert.equal(good.lastAction.type,'save');assert.equal(poor.lastAction.type,'save');
  const goodLedger=recordPlayerRatings(base,pending,good),poorLedger=recordPlayerRatings(base,pending,poor);
  const expectedSaveResidual=1.8*best.model.probability/(best.model.probability+best.model.saveProbability);
  assert.ok(Math.abs(goodLedger.players[keeper.id].parts.goalkeeping-expectedSaveResidual)<1e-9,'best execution earns performance credit only for its on-target expected goals prevented');
  assert.ok(poorLedger.players[keeper.id].merit<=goodLedger.players[keeper.id].merit,'self-created difficulty cannot improve credit for saving the same shot');
});

for(const freePawn of [false,true])test(`ordinary keeper ${freePawn?'bonus':'normal'} coverage uses its native legal positioning baseline`,()=>{
  const g=fixture([p('white-R1',7,2)],'white-R1',{phase:'defendMove'}),id='black-K';
  if(freePawn)g.positionBudget={normalUsed:true,pawnUsed:false,dribbleUsed:false};
  const choices=E.legalMoves(g,id,{freePawn}).filter(move=>move.type!=='tackle')
    .map(move=>({move,next:E.applyMove(g,id,move.x,move.y,{freePawn})}))
    .map(choice=>({...choice,threat:directThreat(choice.next)})).sort((a,b)=>a.threat-b.threat);
  const best=choices[0],worst=choices.at(-1);assert.ok(best.threat<directThreat(g)-.02);
  const bestLedger=record(g,best.next),bestPlayer=playerRatingsSummary(bestLedger,best.next).players.find(p=>p.pieceId===id);
  assert.equal(bestLedger.version,4);assert.ok(bestPlayer.impact>0,'ordinary coverage remains real raw impact');
  assert.equal(bestPlayer.rating,6,'a routine best legal coverage move is expected, not an exceptional performance');
  assert.ok(Math.abs(bestLedger.players[id].parts.defending)<1e-9);
  assert.ok(worst.threat>best.threat+.02);
  const poorLedger=record(g,worst.next);assert.ok(poorLedger.players[id].merit<0,'worse available coverage is still a meaningful error');
  const summary=playerRatingsSummary(bestLedger,best.next);assert.equal(summary.methodVersion,4);assert.equal(summary.legacyMethod,false);
  if(freePawn)assert.equal(E.legalMoves(g,id).length,0,'the bonus baseline does not invent an already spent normal move');
});

test('earlier rating methods retain their original score, continuation and save identity',()=>{
  const g=fixture([p('white-R1',7,2)],'white-R1',{phase:'defendMove'}),n=E.applyMove(g,'black-K',7,0,{freePawn:true});
  const legacy=createPlayerRatings();legacy.version=1;
  const old=recordPlayerRatings(legacy,g,n),summary=playerRatingsSummary(old,n),king=summary.players.find(p=>p.pieceId==='black-K');
  assert.equal(old.version,1);assert.equal(summary.methodVersion,1);assert.equal(summary.legacyMethod,true);
  assert.equal(king.rating,6.8,'an already earned earlier-method rating is not silently recalculated');
  const saved=JSON.parse(JSON.stringify(old)),restored=restorePlayerRatings(saved,n);assert.deepEqual(restored,old);
  assert.deepEqual(playerRatingsSummary(restored,n),summary);
  const next=E.skipMove(n),continued=recordPlayerRatings(restored,n,next);
  assert.equal(continued.version,1);assert.equal(playerRatingsSummary(continued,next).players.find(p=>p.pieceId==='black-K').rating,6.8);
  assert.equal(createPlayerRatings().version,4,'only new matches start the revised rating method');
});

test('disguised shots use the fair pre-reveal mixture for either sampled goal target',()=>{
  const g=fixture([p('white-Q',6,1)],'white-Q',{phase:'kick'}),pending=E.applyKick(g,6,-1,{disguise:true}),base=record(g,pending);
  assert.equal(pending.pendingShot.disguised,true);
  const first=E.skipMove(pending,{roll:0,targetRoll:0}),second=E.skipMove(pending,{roll:0,targetRoll:.99});
  assert.notDeepEqual(first.lastAction.goalTarget,second.lastAction.goalTarget);
  const a=recordPlayerRatings(base,pending,first),b=recordPlayerRatings(base,pending,second);
  assert.equal(a.players['white-Q'].counts.xG,b.players['white-Q'].counts.xG);assert.equal(a.players['white-Q'].merit,b.players['white-Q'].merit);
});

test('native fouls and dismissal preserve the offender’s rating and identity after removal',()=>{
  const g=fixture([p('white-P1',3,9),p('black-Q',4,8)],'black-Q',{phase:'defendMove',attack:'black',fouls:true}),move=E.legalMoves(g,'white-P1').find(m=>m.type==='tackle');
  const n=E.applyMove(g,'white-P1',move.x,move.y,{roll:0});assert.equal(n.lastAction.type,'foul');assert.equal(n.lastAction.card,'red');
  const ledger=record(g,n),summary=playerRatingsSummary(ledger,n),pawn=summary.players.find(p=>p.pieceId==='white-P1');
  assert.equal(ledger.players['white-P1'].counts.fouls,1);assert.equal(ledger.players['white-P1'].counts.redCards,1);assert.equal(pawn.sentOff,true);assert.ok(pawn.rating<6);
});

test('a collected native through ball credits the provider’s new territory only when a teammate secures it',()=>{
  const run=tracked(fixture([p('white-R2',6,9),p('white-R1',8,5)],'white-R2',{phase:'kick'}));
  run.kick(6,5);
  assert.equal(run.game.ball.carrierId,null);assert.deepEqual(run.game.looseBallKickOrigin.from,{x:6,y:9});
  assert.equal(run.stats.playerRatings.players['white-R2'].counts.progressSquares,0,'a loose delivery has not secured territory yet');
  run.move('white-R1',6,5);
  assert.equal(run.game.lastAction.collection,true);assert.equal(run.game.ball.carrierId,'white-R1');
  assert.equal(run.stats.playerRatings.players['white-R2'].counts.progressSquares,4,'the passer receives the retained forward progress');
  assert.ok(run.stats.playerRatings.players['white-R2'].impact>0);
  assert.equal(run.stats.playerRatings.players['white-R1'].counts.progressSquares,0,'collecting is not also counted as a dribble from the passer’s square');
});
