import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../dist/engine.js';

const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-12,`${a} != ${b}`);
const other=t=>t==='white'?'black':'white';
const rotate=([x,y],team)=>team==='white'?{x,y}:{x:E.BOARD_WIDTH-1-x,y:E.BOARD_HEIGHT-1-y};
const id=(v,team)=>team==='white'?v:v.replace(/^(white|black)/,other);
function fixture(team='white',{inside=false,carrierType='Q',challengerType='R',enabled=true}={}){
  const s=E.createGame({mode:'local',seed:89317,foulsEnabled:enabled});
  const suffix={K:'K',Q:'Q',R:'R1',B:'B1',N:'N1',P:'P1'};
  const carrier=`white-${suffix[carrierType]}`,challenger=`black-${suffix[challengerType]}`;
  const cy=inside?2:3,origin=challengerType==='K'?[6,cy-1]:[6,cy+2];
  const placements={'white-K':[6,15],'black-K':[6,0],[carrier]:[6,cy],[challenger]:origin};
  const used=new Set(Object.values(placements).map(p=>p.join()));
  const parking=Array.from({length:E.BOARD_HEIGHT},(_,y)=>[[0,y],[E.BOARD_WIDTH-1,y]]).flat();
  for(const p of s.pieces){const q=placements[p.id]||parking.find(q=>!used.has(q.join()));used.add(q.join());Object.assign(p,rotate(q,team));if(team==='black'){p.id=id(p.id,team);p.team=other(p.team);}}
  s.attack=team;s.phase='defendMove';s.positionBudget={normalUsed:false,pawnUsed:false,dribbleUsed:false};
  const owner=s.pieces.find(p=>p.id===id(carrier,team));s.ball={x:owner.x,y:owner.y,carrierId:owner.id};
  s.ballProgress={team,anchorY:owner.y,rounds:0,pendingRelease:false,excludeRelease:false};
  const target=rotate([5,cy],team),pieceId=id(challenger,team);
  assert.ok(E.legalMoves(s,pieceId).some(m=>m.type==='tackle'&&m.x===target.x&&m.y===target.y));
  return {s,pieceId,target,carrierId:owner.id};
}
function challenge(f,roll){return E.applyMove(f.s,f.pieceId,f.target.x,f.target.y,{roll});}
function playRestart(s){
  assert.equal(s.phase,'attackMove');assert.ok(s.restart);
  s=E.skipMove(s);assert.equal(s.phase,'defendMove');s=E.skipMove(s);assert.equal(s.phase,'kick');return s;
}
const advanceRandom=v=>(Math.imul(1664525,v)+1013904223)>>>0;

for(const team of ['white','black']){
  test(`${team}: tackle draw partitions 2% red, 5% yellow, 3% uncarded fouls and 90% clean challenges`,()=>{
    for(const [roll,kind] of [[0,'red'],[.019999,'red'],[.02,'yellow'],[.069999,'yellow'],[.07,'plain'],[.099999,'plain'],[.1,'clean'],[.999999,'clean']]){
      const f=fixture(team),before=structuredClone(f.s),after=challenge(f,roll),record=after.discipline?.[f.pieceId];
      assert.deepEqual(f.s,before,'a tackle preserves the caller snapshot');
      assert.equal(after.randomState,advanceRandom(before.randomState),'exactly one referee draw per enabled attempt');
      if(kind==='clean'){
        assert.equal(after.lastAction.type,'tackle');assert.equal(after.ball.carrierId,f.pieceId);assert.equal(after.restart,null);assert.ok(!record?.redCard);assert.equal(after.pieces.length,22);
      }else{
        assert.equal(after.lastAction.type,'foul');assert.equal(after.attack,team);assert.equal(after.restart.type,'freeKick');assert.equal(after.restart.team,team);assert.equal(after.phase,'attackMove');
        assert.equal(record?.yellowCards||0,kind==='yellow'?1:0);assert.equal(!!record?.redCard,kind==='red');
        assert.equal(after.pieces.length,kind==='red'?21:22);assert.equal(after.sentOff.length,kind==='red'?1:0);assert.deepEqual(after.score,before.score);
      }
    }
  });
  test(`${team}: clean knight tackles remain 50% conditional on no foul`,()=>{
    for(const [roll,type] of [[.1,'tackle'],[.549999,'tackle'],[.55,'tackleMiss'],[.999999,'tackleMiss']]){
      const f=fixture(team,{carrierType:'N'}),after=challenge(f,roll);assert.equal(after.lastAction.type,type);assert.equal(after.randomState,advanceRandom(f.s.randomState));
      assert.equal(after.ball.carrierId,type==='tackle'?f.pieceId:f.carrierId);assert.equal(after.restart,null);assert.equal(after.sentOff.length,0);
    }
  });
  test(`${team}: disabling Fouls preserves certain ordinary tackles and the old random stream`,()=>{
    const f=fixture(team,{enabled:false}),after=challenge(f,.01);assert.equal(after.lastAction.type,'tackle');assert.equal(after.ball.carrierId,f.pieceId);assert.equal(after.randomState,f.s.randomState);assert.equal(after.pieces.length,22);
  });
  test(`${team}: a second yellow dismisses the same stable player once`,()=>{
    const f=fixture(team),first=challenge(f,.04);assert.equal(first.discipline[f.pieceId].yellowCards,1);
    f.s=structuredClone(first);f.s.restart=null;f.s.phase='defendMove';f.s.positionBudget={normalUsed:false,pawnUsed:false,dribbleUsed:false};
    const second=challenge(f,.04);assert.equal(second.lastAction.type,'foul');assert.equal(second.discipline[f.pieceId].yellowCards,2);assert.equal(second.discipline[f.pieceId].redCard,true);
    assert.equal(second.sentOff.filter(p=>p.id===f.pieceId).length,1);assert.ok(!second.pieces.some(p=>p.id===f.pieceId));assert.equal(second.pieces.length,21);
    assert.deepEqual(E.normalizeGame(structuredClone(second)),second,'save/reload retains the dismissal without another card or draw');
  });
  test(`${team}: a foul at the carrier contact square in the defender box becomes a fixed 80% penalty`,()=>{
    const f=fixture(team,{inside:true}),awarded=challenge(f,.08);assert.equal(awarded.restart.type,'penalty');assert.equal(awarded.restart.team,team);
    const ready=playRestart(awarded),shots=E.legalKicks(ready);assert.equal(shots.length,4);assert.ok(shots.every(k=>k.goal===team));
    for(const shot of shots){
      const pending=E.applyKick(ready,shot.x,shot.y),before=structuredClone(pending),m=E.shotModel(pending);assert.equal(pending.pendingShot.penalty,true);assert.equal(m.goalProbability,.8);assert.equal(m.blockProbability,0);close(m.saveProbability,.2);assert.equal(m.missProbability,0);
      const keeper=pending.pieces.find(p=>p.type==='K'&&p.team===other(team));assert.deepEqual(E.legalMoves(pending,keeper.id),[],'fixed penalty has no extra keeper positioning choice');
      const scored=E.skipMove(pending,{roll:.799999}),saved=E.skipMove(pending,{roll:.8});assert.equal(scored.lastAction.type,'goal');assert.equal(scored.score[team],1);assert.equal(saved.lastAction.type,'save');assert.equal(saved.ball.carrierId,keeper.id);assert.deepEqual(pending,before);
    }
  });
  test(`${team}: a penalty still has 80% scoring odds with the king outside its own box and cannot grant an outside save`,()=>{
    const f=fixture(team,{inside:true}),keeper=f.s.pieces.find(p=>p.type==='K'&&p.team===other(team));Object.assign(keeper,rotate([3,3],team));
    const ready=playRestart(challenge(f,.08)),shot=E.legalKicks(ready)[0],pending=E.applyKick(ready,shot.x,shot.y),m=E.shotModel(pending);assert.equal(m.goalProbability,.8);assert.equal(m.saveProbability,0);close(m.missProbability,.2);
    const miss=E.skipMove(pending,{roll:.81});assert.equal(miss.lastAction.type,'shotMiss');assert.equal(miss.restart.type,'goalKick');assert.equal(miss.restart.team,other(team));
  });
  test(`${team}: red cards survive a penalty goal and the new kickoff formation`,()=>{
    const f=fixture(team,{inside:true}),awarded=challenge(f,.01);assert.equal(awarded.pieces.length,21);const ready=playRestart(awarded),shot=E.legalKicks(ready)[0],goal=E.skipMove(E.applyKick(ready,shot.x,shot.y),{roll:0});
    assert.equal(goal.lastAction.type,'goal');assert.equal(goal.phase,'kickoff');assert.equal(goal.pieces.length,21);assert.ok(!goal.pieces.some(p=>p.id===f.pieceId));assert.equal(goal.discipline[f.pieceId].redCard,true);assert.equal(goal.sentOff.length,1);
    assert.equal(goal.ball.carrierId,goal.pieces.find(p=>p.id===goal.ball.carrierId)?.id);assert.equal(new Set(goal.pieces.map(p=>`${p.x},${p.y}`)).size,21);
  });
  test(`${team}: a dismissed king gets an automatic replacement with a stable original player ID`,()=>{
    const f=fixture(team,{challengerType:'K'}),after=challenge(f,.01),keepers=after.pieces.filter(p=>p.type==='K'&&p.team===other(team));assert.equal(keepers.length,1);
    const replacement=keepers[0];assert.notEqual(replacement.id,f.pieceId);assert.equal(replacement.replacementKeeper,true);assert.equal(replacement.originalType,'P');assert.ok(E.inOwnBox(replacement.team,replacement.x,replacement.y));assert.ok(!after.pieces.some(p=>p.id===f.pieceId));
    assert.equal(after.sentOff.find(p=>p.id===f.pieceId)?.type,'K');assert.deepEqual(E.normalizeGame(structuredClone(after)),after);
    const ready=playRestart(after),shot=E.legalKicks(ready).find(k=>k.goal===team);assert.ok(shot);const goal=E.skipMove(E.applyKick(ready,shot.x,shot.y),{roll:0});assert.equal(goal.pieces.length,21);assert.ok(!goal.pieces.some(p=>p.id===f.pieceId));assert.equal(goal.pieces.find(p=>p.id===replacement.id)?.type,'K');assert.equal(goal.pieces.filter(p=>p.type==='K'&&p.team===other(team)).length,1);
  });
  test(`${team}: a foul in the attacking team's own box remains a free kick`,()=>{
    const f=fixture(team),carrier=f.s.pieces.find(p=>p.id===f.carrierId),challenger=f.s.pieces.find(p=>p.id===f.pieceId),keeper=f.s.pieces.find(p=>p.type==='K'&&p.team===team);
    Object.assign(keeper,rotate([4,16],team));Object.assign(carrier,rotate([6,14],team));Object.assign(challenger,rotate([6,12],team));f.s.ball={x:carrier.x,y:carrier.y,carrierId:carrier.id};f.target=rotate([5,14],team);
    const after=challenge(f,.08);assert.equal(after.restart.type,'freeKick');assert.equal(after.restart.team,team);
  });
  test(`${team}: falling below seven active players ends the match without inventing goals`,()=>{
    const f=fixture(team),dismissed=['black-Q','black-B1','black-B2','black-N2'].map(v=>id(v,team));
    const removed=f.s.pieces.filter(p=>dismissed.includes(p.id));f.s.pieces=f.s.pieces.filter(p=>!dismissed.includes(p.id));
    f.s.sentOff=removed.map(p=>({...p,reason:'red',yellowCards:0}));for(const p of removed)f.s.discipline[p.id]={yellowCards:0,redCard:true};
    assert.equal(f.s.pieces.filter(p=>p.team===other(team)).length,7);const after=challenge(f,.01);assert.equal(after.phase,'finished');assert.equal(after.winner,team);assert.equal(after.finishReason,'forfeit');assert.equal(after.pieces.filter(p=>p.team===other(team)).length,6);assert.deepEqual(after.score,{white:0,black:0});assert.equal(after.sentOff.length,5);
  });

}

test('current-board older saves restore with Fouls disabled and no invented cards',()=>{
  const old=E.createGame({seed:6});delete old.foulsEnabled;delete old.discipline;delete old.sentOff;old.rulesVersion=14;
  const before=structuredClone(old),restored=E.normalizeGame(old);assert.equal(restored.foulsEnabled,false);assert.ok(Object.entries(restored.discipline).every(([pieceId,c])=>old.pieces.some(p=>p.id===pieceId)&&c.yellowCards===0&&c.redCard===false));assert.deepEqual(restored.sentOff,[]);assert.deepEqual(old,before);assert.equal(restored.randomState,old.randomState);
});
