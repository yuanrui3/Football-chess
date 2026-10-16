import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../dist/engine.js';

const other=t=>t==='white'?'black':'white';
const W=E.BOARD_WIDTH,H=E.BOARD_HEIGHT;
const transform=(team,[x,y])=>team==='white'?[x,y]:[W-1-x,H-1-y];
function fixture(team='white',keeper=[6,3],phase='kick'){
  const state=E.createGame({mode:'local',kickoff:team,seed:17});
  const positions={
    [`${team}-R1`]:transform(team,[5,5]),
    [`${other(team)}-K`]:transform(team,keeper),
    [`${team}-K`]:transform(team,[6,H-E.BOX_DEPTH]),
  };
  const occupied=new Set(Object.values(positions).map(p=>p.join(',')));
  const parking=Array.from({length:H},(_,y)=>[[0,y],[W-1,y]]).flat();
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
const goal=(team,x=5)=>team==='white'?{x,y:-1}:{x:W-1-x,y:H};

test('shot model is version 12 and outside-keeper save parameters are zero',()=>{
  assert.equal(E.SHOT_MODEL.version,13);
  for(const key of ['outsideRadius','outsideDiveSpeed','outsideReactionDelay','outsideMaxSave'])assert.equal(E.SHOT_MODEL[key],0);
});

for(const team of ['white','black']){
  const defending=other(team),keeperId=`${defending}-K`;
  test(`${team}: own-box boundaries alone enable probabilistic saves`,()=>{
    for(const keeper of E.BOX_FILES.flatMap(x=>Array.from({length:E.BOX_DEPTH},(_,y)=>[x,y]))){
      const state=fixture(team,keeper),target=goal(team),model=E.shotModel(state,target.x,target.y);
      assert.equal(model.modelVersion,13);
      assert.equal(model.keeperInBox,true);assert.ok(model.reach>0);assert.ok(model.saveProbability>0);
    }
    for(const keeper of [[3,0],[10,0],[3,1],[10,1],[3,2],[10,2],[5,E.BOX_DEPTH],[5,H-E.BOX_DEPTH]]){
      const state=fixture(team,keeper),target=goal(team),model=E.shotModel(state,target.x,target.y);
      assert.equal(model.keeperInBox,false);
      for(const field of ['reach','saveProbability','keeperCornerProbability','caughtSaveProbability','saveGivenOnTarget','parryGivenSave'])assert.equal(model[field],0,field);
      assert.equal(model.cornerProbability,model.blockCornerProbability,'only an ordinary-body block may create an outside-king corner');
      assert.equal(model.probability,model.onTargetProbability);
      for(const field of ['probability','reach','keeperPathDistance','saveProbability'])assert.ok(Number.isFinite(model[field]),field);
    }
  });

  test(`${team}: outside king intercepts ordinary passes and probabilistically blocks shots`,()=>{
    const state=fixture(team,[5,E.BOX_DEPTH]),[kx,ky]=transform(team,[5,E.BOX_DEPTH]),target=goal(team);
    const kicks=E.legalKicks(state);
    assert.equal(kicks.some(k=>k.x===target.x&&k.y===target.y),true);
    const model=E.shotModel(state,target.x,target.y);
    assert.deepEqual(model.blockerIds,[keeperId]);assert.ok(Math.abs(model.blockProbability-.45)<1e-12);
    assert.equal(model.saveProbability,0);assert.equal(model.reach,0);
    assert.ok(model.goalProbability>0&&model.goalProbability<model.baseOnTargetProbability);
    const pending=E.applyKick(state,target.x,target.y);
    assert.deepEqual(E.legalMoves(pending,keeperId),[],'ordinary-body blocking does not grant a keeper reaction');
    const blocked=E.skipMove(pending,{roll:.999999});
    assert.equal(blocked.lastAction.type,'blockedShot');assert.equal(blocked.ball.carrierId,keeperId);
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
    const state=fixture(team,[6,E.BOX_DEPTH]),target=goal(team),declared=E.applyKick(state,target.x,target.y);
    assert.equal(declared.phase,'keeperReact');assert.deepEqual(E.legalMoves(declared,keeperId),[]);
    for(const difficulty of ['casual','tactical'])assert.deepEqual(E.chooseAIAction(declared,{difficulty}),{type:'skip'});
    const keeper=declared.pieces.find(p=>p.id===keeperId),[x,y]=transform(team,[6,E.BOX_DEPTH-1]);
    assert.throws(()=>E.applyMove(declared,keeperId,x,y),/not a legal move/);
    const scored=E.skipMove(declared,{roll:0});assert.equal(scored.lastAction.type,'goal');assert.equal(scored.lastAction.shotModel.saveProbability,0);
    const wide=E.skipMove(declared,{roll:0.999999});assert.equal(wide.lastAction.type,'shotMiss');assert.notEqual(wide.lastAction.outcome,'saved');
    assert.equal(keeper.x,transform(team,[6,E.BOX_DEPTH])[0]);
  });

  test(`${team}: ordinary re-entry restores keeper saves and reactions`,()=>{
    const state=fixture(team,[6,E.BOX_DEPTH],'defendMove'),[x,y]=transform(team,[6,E.BOX_DEPTH-1]);
    assert.ok(E.legalMoves(state,keeperId).some(m=>m.x===x&&m.y===y&&m.type==='move'));
    const reentered=E.applyMove(state,keeperId,x,y),target=goal(team);
    assert.equal(E.shotModel(reentered,target.x,target.y).keeperInBox,true);
    assert.ok(E.shotModel(reentered,target.x,target.y).saveProbability>0);
    reentered.phase='kick';reentered.positionBudget={normalUsed:false,pawnUsed:false,dribbleUsed:false};
    const declared=E.applyKick(reentered,target.x,target.y);
    assert.ok(E.legalMoves(declared,keeperId).length>0);
  });

  test(`${team}: outside king keeps ordinary one-square move and pass capabilities`,()=>{
    const state=fixture(team,[6,E.BOX_DEPTH],'defendMove'),keeper=state.pieces.find(p=>p.id===keeperId);
    const moves=E.legalMoves(state,keeperId).filter(m=>m.type==='move');
    assert.ok(moves.length);assert.ok(moves.every(m=>Math.max(Math.abs(m.x-keeper.x),Math.abs(m.y-keeper.y))===1));
    state.attack=defending;state.phase='kick';state.ball={x:keeper.x,y:keeper.y,carrierId:keeperId};
    assert.ok(E.legalKicks(state).some(k=>!k.goal&&Math.max(Math.abs(k.x-keeper.x),Math.abs(k.y-keeper.y))>1));
  });
}
