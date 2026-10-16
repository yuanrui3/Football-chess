import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../dist/engine.js';

const other=t=>t==='white'?'black':'white';
const transform=(team,[x,y])=>team==='white'?[x,y]:[11-x,14-y];
function fixture(team='white',keeper=[6,2],phase='kick'){
  const state=E.createGame({mode:'local',kickoff:team,seed:17});
  const positions={
    [`${team}-R1`]:transform(team,[5,5]),
    [`${other(team)}-K`]:transform(team,keeper),
    [`${team}-K`]:transform(team,[6,13]),
  };
  const occupied=new Set(Object.values(positions).map(p=>p.join(',')));
  const parking=Array.from({length:15},(_,y)=>[[0,y],[11,y]]).flat();
  for(const piece of state.pieces){
    const pos=positions[piece.id]||parking.find(p=>!occupied.has(p.join(',')));
    [piece.x,piece.y]=pos;occupied.add(pos.join(','));
  }
  state.attack=team;state.phase=phase;state.restart=null;state.offside=null;
  const shooter=state.pieces.find(p=>p.id===`${team}-R1`);
  state.ball={x:shooter.x,y:shooter.y,carrierId:shooter.id};
  state.ballProgress={team,anchorY:shooter.y,rounds:0,pendingRelease:false,excludeRelease:false};
  return state;
}
const goal=(team,x=5)=>team==='white'?{x,y:-1}:{x:11-x,y:15};

test('shot model is version 9 and legacy outside parameters are zero',()=>{
  assert.equal(E.SHOT_MODEL.version,9);
  for(const key of ['outsideRadius','outsideDiveSpeed','outsideReactionDelay','outsideMaxSave'])assert.equal(E.SHOT_MODEL[key],0);
});

for(const team of ['white','black']){
  const defending=other(team),keeperId=`${defending}-K`;
  test(`${team}: own-box boundaries alone enable probabilistic saves`,()=>{
    for(const keeper of [[4,0],[7,0],[4,1],[7,1]]){
      const state=fixture(team,keeper),target=goal(team),model=E.shotModel(state,target.x,target.y);
      assert.equal(model.keeperInBox,true);assert.ok(model.reach>0);assert.ok(model.saveProbability>0);
    }
    for(const keeper of [[3,0],[8,0],[3,1],[8,1],[5,2],[5,13]]){
      const state=fixture(team,keeper),target=goal(team),model=E.shotModel(state,target.x,target.y);
      assert.equal(model.keeperInBox,false);
      for(const field of ['reach','saveProbability','cornerProbability','caughtSaveProbability','saveGivenOnTarget','parryGivenSave'])assert.equal(model[field],0,field);
      assert.equal(model.probability,model.onTargetProbability);
      for(const field of ['probability','reach','keeperPathDistance','saveProbability'])assert.ok(Number.isFinite(model[field]),field);
    }
  });

  test(`${team}: outside king intercepts its occupied square and blocks the ray`,()=>{
    const state=fixture(team,[5,2]),[kx,ky]=transform(team,[5,2]),target=goal(team);
    const kicks=E.legalKicks(state);
    assert.equal(kicks.some(k=>k.x===target.x&&k.y===target.y),false);
    assert.equal(kicks.some(k=>k.x===kx&&k.y===ky&&k.receiverId===keeperId),true);
    const intercepted=E.applyKick(state,kx,ky);
    assert.equal(intercepted.lastAction.type,'interception');assert.equal(intercepted.ball.carrierId,keeperId);assert.equal(intercepted.attack,defending);
    const ordinary=structuredClone(state);ordinary.pieces.find(p=>p.id===keeperId).type='R';
    assert.deepEqual(E.legalKicks(ordinary).map(k=>[k.x,k.y,k.goal||null]),kicks.map(k=>[k.x,k.y,k.goal||null]));
  });

  test(`${team}: own-box king on a shot ray retains its keeper role`,()=>{
    const state=fixture(team,[5,1]),target=goal(team);
    assert.ok(E.legalKicks(state).some(k=>k.x===target.x&&k.y===target.y&&k.goal===team));
    const declared=E.applyKick(state,target.x,target.y);
    assert.equal(declared.phase,'keeperReact');assert.ok(E.legalMoves(declared,keeperId).length>0);
  });

  test(`${team}: outside king cannot react, even one step from its own box`,()=>{
    const state=fixture(team,[6,2]),target=goal(team),declared=E.applyKick(state,target.x,target.y);
    assert.equal(declared.phase,'keeperReact');assert.deepEqual(E.legalMoves(declared,keeperId),[]);
    for(const difficulty of ['casual','tactical'])assert.deepEqual(E.chooseAIAction(declared,{difficulty}),{type:'skip'});
    const keeper=declared.pieces.find(p=>p.id===keeperId),[x,y]=transform(team,[6,1]);
    assert.throws(()=>E.applyMove(declared,keeperId,x,y),/not a legal move/);
    const scored=E.skipMove(declared,{roll:0});assert.equal(scored.lastAction.type,'goal');assert.equal(scored.lastAction.shotModel.saveProbability,0);
    const wide=E.skipMove(declared,{roll:0.999999});assert.equal(wide.lastAction.type,'shotMiss');assert.notEqual(wide.lastAction.outcome,'saved');
    assert.equal(keeper.x,transform(team,[6,2])[0]);
  });

  test(`${team}: ordinary re-entry restores keeper saves and reactions`,()=>{
    const state=fixture(team,[6,2],'defendMove'),[x,y]=transform(team,[6,1]);
    assert.ok(E.legalMoves(state,keeperId).some(m=>m.x===x&&m.y===y&&m.type==='move'));
    const reentered=E.applyMove(state,keeperId,x,y),target=goal(team);
    assert.equal(E.shotModel(reentered,target.x,target.y).keeperInBox,true);
    assert.ok(E.shotModel(reentered,target.x,target.y).saveProbability>0);
    reentered.phase='kick';reentered.positionBudget={normalUsed:false,pawnUsed:false,dribbleUsed:false};
    const declared=E.applyKick(reentered,target.x,target.y);
    assert.ok(E.legalMoves(declared,keeperId).length>0);
  });

  test(`${team}: outside king keeps ordinary one-square move and pass capabilities`,()=>{
    const state=fixture(team,[6,2],'defendMove'),keeper=state.pieces.find(p=>p.id===keeperId);
    const moves=E.legalMoves(state,keeperId).filter(m=>m.type==='move');
    assert.ok(moves.length);assert.ok(moves.every(m=>Math.max(Math.abs(m.x-keeper.x),Math.abs(m.y-keeper.y))===1));
    state.attack=defending;state.phase='kick';state.ball={x:keeper.x,y:keeper.y,carrierId:keeperId};
    assert.ok(E.legalKicks(state).some(k=>!k.goal&&Math.max(Math.abs(k.x-keeper.x),Math.abs(k.y-keeper.y))>1));
  });
}
