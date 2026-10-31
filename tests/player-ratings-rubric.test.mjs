import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../dist/engine.js';
import {createMatchStats,recordMatchTransition,restoreMatchStats} from '../dist/match-stats.js';
import {playerRatingsSummary} from '../dist/player-ratings.js';

const piece=(id,x,y)=>({id,team:id.split('-')[0],type:id.split('-')[1][0],x,y});
function fixture(players,carrier,{phase='kick',fouls=false}={}){
  const game=E.createGame({seed:421,mode:'local',foulsEnabled:fouls});
  game.pieces=[piece('white-K',7,16),piece('black-K',6,0),piece('black-R2',13,0),...players];
  const owner=game.pieces.find(p=>p.id===carrier);
  Object.assign(game,{phase,attack:owner.team,ball:{x:owner.x,y:owner.y,carrierId:carrier},restart:null,
    offside:null,pendingShot:null,lastAction:null,turn:1,positionBudget:{normalUsed:false,pawnUsed:false,dribbleUsed:false}});
  assert.equal(new Set(game.pieces.map(p=>p.id)).size,game.pieces.length);
  assert.equal(new Set(game.pieces.map(p=>`${p.x},${p.y}`)).size,game.pieces.length);
  return game;
}
function tracked(game,{legacy=false}={}){
  const stats=createMatchStats();if(legacy)stats.playerRatings.version=1;
  return {game,stats,
    step(next){this.stats=recordMatchTransition(this.stats,this.game,next);this.game=next;return this;},
    ready(){for(let n=0;['attackMove','defendMove','passRun'].includes(this.game.phase)&&n<4;n++)this.step(E.skipMove(this.game));assert.ok(['kick','keeperRelease'].includes(this.game.phase));return this;},
    kick(x,y,options={}){return this.step(E.applyKick(this.game,x,y,options));},
    move(id,x,y,options={}){return this.step(E.applyMove(this.game,id,x,y,options));},
    resolve(result='goal'){
      const model=E.shotModel(this.game);
      const roll=result==='goal'?0:result==='save'
        ?model.probability+model.keeperCornerProbability+model.keeperReboundProbability+model.caughtSaveProbability/2
        :result==='block'?1-model.blockPossessionProbability/2
        :model.probability+model.saveProbability+model.missProbability/2;
      const expected=result==='goal'?'goal':result==='save'?'save':result==='block'?'blockedShot':'shotMiss';
      this.step(E.skipMove(this.game,{roll}));assert.equal(this.game.lastAction.type,expected);return this;
    },
    player(id){return playerRatingsSummary(this.stats.playerRatings,this.game).players.find(p=>p.pieceId===id);},
  };
}
const highChance=()=>fixture([piece('white-R1',7,2)],'white-R1');
const count=(run,id,key)=>run.player(id).metrics[key];
const close=(actual,expected,message)=>assert.ok(Math.abs(actual-expected)<1e-9,message||`${actual} equals ${expected}`);

test('a missed native big chance hurts the new rating, while converting the same chance helps',()=>{
  for(const outcome of ['save','wide','goal']){
    const run=tracked(highChance()).kick(7,-1),xg=E.shotModel(run.game).probability;
    assert.ok(xg>.8,'this is a genuinely high-probability native chance');run.resolve(outcome);
    const scorer=run.player('white-R1');assert.equal(scorer.metrics.shots,1);
    close(scorer.metrics.xG,xg);
    if(outcome==='goal'){assert.ok(scorer.rating>6);assert.equal(scorer.metrics.goals,1);assert.equal(scorer.metrics.bigChancesMissed,0);}
    else{assert.ok(scorer.rating<6,`${outcome} must not be rewarded merely for having an easy chance`);assert.equal(scorer.metrics.goals,0);assert.equal(scorer.metrics.bigChancesMissed,1);}
  }
});

test('earlier rating records keep their earlier positive big-chance-miss calculation',()=>{
  const run=tracked(highChance(),{legacy:true}).kick(7,-1).resolve('save');
  assert.equal(run.stats.playerRatings.version,1);assert.ok(run.player('white-R1').rating>6);
  const restored=restoreMatchStats(structuredClone(run.stats),run.game);
  assert.deepEqual(restored,run.stats,'restoration never silently regrades a saved match');
});

test('the provider gets key-pass, big-chance-created and xA credit even when the finish is saved',()=>{
  for(const outcome of ['goal','save']){
    const run=tracked(fixture([piece('white-R2',7,7),piece('white-R1',7,2)],'white-R2'));
    run.kick(7,2).ready().kick(7,-1);const xg=E.shotModel(run.game).probability;assert.ok(xg>.8);run.resolve(outcome);
    const provider=run.player('white-R2');assert.equal(provider.metrics.keyPasses,1);assert.equal(provider.metrics.bigChancesCreated,1);
    assert.equal(provider.metrics.assists,outcome==='goal'?1:0);close(provider.metrics.createdXG,xg);assert.ok(provider.rating>6);
  }
});

test('keeper xG prevented measures only on-target chances and survives a negative saved balance',()=>{
  for(const outcome of ['save','goal']){
    const run=tracked(highChance()).kick(7,-1),model=E.shotModel(run.game);
    const conditional=model.probability/(model.probability+model.saveProbability);run.resolve(outcome);
    const keeper=run.player('black-K');close(keeper.metrics.keeperXGFaced,conditional);
    assert.equal(keeper.metrics.saves,outcome==='save'?1:0);assert.equal(keeper.metrics.goalsConceded,outcome==='goal'?1:0);
    close(keeper.metrics.xGPrevented,conditional-(outcome==='goal'?1:0));
    if(outcome==='goal')assert.ok(keeper.metrics.xGPrevented<0);
    assert.deepEqual(restoreMatchStats(structuredClone(run.stats),run.game),run.stats,'signed keeper totals are valid persistent telemetry');
  }
});

test('wide attempts and defender blocks give the keeper no save or on-target xG achievement',()=>{
  const wide=tracked(highChance()).kick(7,-1).resolve('wide');
  const block=tracked(fixture([piece('white-R1',6,5),piece('black-P1',6,3)],'white-R1')).kick(6,-1).resolve('block');
  for(const run of [wide,block])for(const key of ['saves','keeperXGFaced','goalsConceded','xGPrevented'])assert.equal(count(run,'black-K',key),0,key);
});

test('a stopped penalty is a penalty save and uses the native eighty-percent on-target xG',()=>{
  const game=fixture([piece('white-Q',6,5)],'white-Q');game.restart={type:'penalty',team:'white',takerId:'white-Q'};
  const run=tracked(game).kick(6,-1);assert.equal(E.shotModel(run.game).probability,.8);run.resolve('save');
  assert.equal(count(run,'black-K','penaltySaves'),1);assert.equal(count(run,'black-K','saves'),1);
  close(count(run,'black-K','keeperXGFaced'),.8);close(count(run,'black-K','xGPrevented'),.8);
  assert.equal(count(run,'white-Q','bigChancesMissed'),1);
});

test('losing a native fifty-percent knight duel hurts and winning that same duel helps',()=>{
  const game=fixture([piece('white-P1',3,9),piece('black-N1',4,8)],'black-N1',{phase:'defendMove'});
  const move=E.legalMoves(game,'white-P1').find(m=>m.type==='tackle');assert.equal(move.tackleProbability,.5);
  for(const [roll,won]of [[.2,true],[.8,false]]){
    const run=tracked(structuredClone(game)).move('white-P1',move.x,move.y,{roll});
    const defender=run.player('white-P1');assert.equal(defender.metrics.duelsLost,won?0:1);assert.equal(defender.metrics.tackles,won?1:0);
    assert.ok(won?defender.rating>6:defender.rating<6);
  }
});

test('line clearances require an actual body block inside the goal files on the last two ranks',()=>{
  const cases=[
    {shooter:piece('white-R1',6,4),blocker:piece('black-P1',6,1),target:6,expected:1},
    {shooter:piece('white-R1',6,5),blocker:piece('black-P1',6,3),target:6,expected:0},
    {shooter:piece('white-B1',1,3),blocker:piece('black-P1',3,1),target:5,expected:0},
  ];
  for(const item of cases){
    const game=fixture([item.shooter,item.blocker],item.shooter.id),run=tracked(game).kick(item.target,-1);
    assert.equal(count(run,'black-P1','lineClearances'),0,'standing in a lane is not already a line clearance');run.resolve('block');
    assert.equal(count(run,'black-P1','lineClearances'),item.expected);assert.ok(count(run,'black-P1','screens')>0);
  }
});

function dangerousTurnover(extra=[]){
  const game=fixture([piece('white-R1',6,13),piece('black-R1',6,12),...extra],'white-R1');
  const run=tracked(game).kick(6,12);assert.equal(run.game.lastAction.type,'interception');assert.equal(run.game.attack,'black');return run;
}
test('a direct dangerous own-half turnover is attributed only when the following attack scores',()=>{
  const run=dangerousTurnover();assert.equal(count(run,'white-R1','errorsLeadingGoals'),0);
  run.ready().kick(6,17).resolve('goal');assert.equal(count(run,'white-R1','errorsLeadingGoals'),1);
  assert.equal(count(run,'black-R1','errorsLeadingGoals'),0);assert.equal(count(run,'black-R1','goals'),1);
  assert.deepEqual(restoreMatchStats(structuredClone(run.stats),run.game),run.stats);
});

test('a later goal after two completed opponent passes does not inherit the earlier turnover blame',()=>{
  const game=fixture([piece('white-R1',6,13),piece('white-R2',13,15),piece('black-R1',6,12),piece('black-Q',8,14)],'white-R1');
  Object.assign(game.pieces.find(p=>p.id==='black-R2'),{x:8,y:12});
  const run=tracked(game).kick(6,12).ready().kick(8,12).ready().kick(8,14).ready().kick(8,17).resolve('goal');
  assert.equal(count(run,'white-R1','errorsLeadingGoals'),0);assert.equal(count(run,'black-Q','goals'),1);
});

test('a foul restart breaks the causal chain from an earlier dangerous turnover',()=>{
  const game=fixture([piece('white-R1',6,13),piece('black-R1',6,12),piece('white-P2',5,13)],'white-R1',{fouls:true});
  const run=tracked(game).kick(6,12);run.step(E.skipMove(run.game));
  const tackle=E.legalMoves(run.game,'white-P2').find(m=>m.type==='tackle');assert.ok(tackle);
  run.move('white-P2',tackle.x,tackle.y,{roll:.09});assert.equal(run.game.lastAction.type,'foul');assert.equal(run.game.restart.type,'freeKick');
  run.ready().kick(6,17).resolve('goal');
  assert.equal(count(run,'white-R1','errorsLeadingGoals'),0,'the eventual free-kick goal is not attributed to the earlier intercepted passer');
});

test('recovering possession clears the old error candidate before a different player loses it again',()=>{
  const game=fixture([piece('white-R1',6,13),piece('black-R1',6,12),piece('white-P2',5,13)],'white-R1');
  Object.assign(game.pieces.find(p=>p.id==='black-R2'),{x:5,y:10});
  const run=tracked(game).kick(6,12);run.step(E.skipMove(run.game));
  const recovery=E.legalMoves(run.game,'white-P2').find(m=>m.type==='tackle');assert.ok(recovery);
  run.move('white-P2',recovery.x,recovery.y);assert.equal(run.game.attack,'white');run.step(E.skipMove(run.game));
  const loss=E.legalMoves(run.game,'black-R2').find(m=>m.type==='tackle'&&m.x===5&&m.y===13);assert.ok(loss);
  run.move('black-R2',loss.x,loss.y).ready().kick(5,17).resolve('goal');
  assert.equal(count(run,'white-R1','errorsLeadingGoals'),0,'the earlier passer cannot inherit blame after a possession recovery');
  assert.equal(count(run,'white-P2','errorsLeadingGoals'),1,'the separate immediate dangerous loss has the correct stable player identity');
});

test('a non-dangerous midfield turnover is not labelled an error merely because a later attack scores',()=>{
  const game=fixture([piece('white-R1',0,8),piece('white-R2',13,15),piece('black-B1',0,10),piece('black-Q',4,14)],'white-R1');
  const run=tracked(game).kick(0,10),threat=Math.max(0,...E.legalKicks({...run.game,phase:'kick'}).filter(k=>k.goal==='black'&&!k.offside).map(k=>E.shotModel(run.game,k.x,k.y).probability));
  assert.ok(threat<.08);run.ready().kick(4,14).ready().kick(7,17).resolve('goal');
  assert.equal(count(run,'white-R1','errorsLeadingGoals'),0);assert.equal(count(run,'black-Q','goals'),1);
});

test('a box foul records a committed penalty and yellow card against the actual tackler',()=>{
  const game=fixture([piece('white-P1',5,15),piece('white-R1',9,15),piece('black-Q',6,14)],'black-Q',{phase:'defendMove',fouls:true});
  const move=E.legalMoves(game,'white-P1').find(m=>m.type==='tackle');assert.ok(move);
  const run=tracked(game).move('white-P1',move.x,move.y,{roll:.04});assert.equal(run.game.lastAction.type,'foul');assert.equal(run.game.lastAction.outcome,'penalty');
  assert.equal(count(run,'white-P1','fouls'),1);assert.equal(count(run,'white-P1','yellowCards'),1);assert.equal(count(run,'white-P1','penaltiesCommitted'),1);
  assert.equal(count(run,'white-K','penaltiesCommitted'),0);assert.ok(run.player('white-P1').rating<6);
});
