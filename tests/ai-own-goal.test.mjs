import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,legalKicks,chooseAIAction,applyKick,skipMove,normalizeGame,BOARD_WIDTH as W,BOARD_HEIGHT as H,canOccupySquare} from '../dist/engine.js';
import {createMatchStats,recordMatchTransition,restoreMatchStats,matchStatsSummary,normalizeGoalOrigin} from '../dist/match-stats.js';
import {buildGoalReplay,restoreGoalReplay} from '../dist/goal-replay.js';

function pawnFixture(team,{blockAttackingShot=false}={}){
  const state=createGame({mode:'local',kickoff:team,seed:1503}),other=team==='white'?'black':'white';
  const rotate=([x,y])=>team==='white'?{x,y}:{x:W-1-x,y:H-1-y};
  const positions={'white-K':[8,H-1],'black-K':[5,0],'white-P3':[6,5],...(blockAttackingShot?{'white-P1':[6,4]}:{})};
  const used=new Set(Object.values(positions).map(point=>point.join())),parking=Array.from({length:H},(_,y)=>[[0,y],[W-1,y]]).flat();
  for(const piece of state.pieces){
    const at=positions[piece.id]||parking.find(point=>!used.has(point.join()));used.add(at.join());Object.assign(piece,rotate(at));
    if(team==='black'){piece.team=piece.team==='white'?'black':'white';piece.id=piece.id.replace(/^(white|black)/,side=>side==='white'?'black':'white');}
    assert.ok(canOccupySquare(piece,piece.x,piece.y));
  }
  const carrier=state.pieces.find(piece=>piece.id===`${team}-P3`);
  state.attack=team;state.phase='kick';state.ball={x:carrier.x,y:carrier.y,carrierId:carrier.id};state.lastAction=null;
  state.ballProgress={team,anchorY:carrier.y,rounds:0,pendingRelease:false,excludeRelease:false};
  assert.ok(team==='white'?carrier.y<8:carrier.y>8,'P3 starts in its opponent half');
  return {state,team,other,forward:rotate([6,-1]),backward:rotate([6,H])};
}

for(const team of ['white','black']){
  for(const difficulty of ['casual','tactical'])test(`${team} ${difficulty}: opponent-half P3 does not aim at its own net when that is the only available shot`,()=>{
    const {state,other}=pawnFixture(team,{blockAttackingShot:true}),before=structuredClone(state),kicks=legalKicks(state);
    assert.ok(kicks.some(kick=>kick.goal===other),'human play retains the legal own-net target');
    assert.ok(!kicks.some(kick=>kick.goal===team),'a teammate stops the attacking shot so shot diversity cannot substitute an own goal');
    assert.ok(kicks.some(kick=>!kick.goal&&!kick.offside),'a legal non-shot alternative exists');
    const action=chooseAIAction(state,{difficulty});assert.equal(action.type,'kick');
    const chosen=kicks.find(kick=>kick.x===action.x&&kick.y===action.y);assert.ok(chosen);
    assert.notEqual(chosen.goal,other,'bot policy excludes a deliberate own-goal attempt');
    assert.deepEqual(state,before,'the decision preserves pieces, cards, progress and random seed');
  });

  test(`${team} P3 scores a legitimate opponent-half goal with correct engine, scorer, replay and saved attribution`,()=>{
    const {state,forward}=pawnFixture(team),initial=createMatchStats(),before=applyKick(state,forward.x,forward.y);
    assert.equal(before.pendingShot.shootingTeam,team);assert.equal(before.pendingShot.scoringTeam,team);assert.equal(before.pendingShot.shooterId,`${team}-P3`);
    const declared=recordMatchTransition(initial,state,before),after=skipMove(before,{roll:0});
    assert.equal(after.lastAction.type,'goal');assert.equal(after.lastAction.team,team);assert.equal(after.lastAction.shootingTeam,team);
    assert.equal(after.lastAction.shooterId,`${team}-P3`);assert.equal(after.lastAction.ownGoal,false);
    const stats=recordMatchTransition(declared,before,after,{matchSeconds:42}),summary=matchStatsSummary(stats),goal=summary.goals[0];
    assert.equal(goal.team,team);assert.equal(goal.scorerId,`${team}-P3`);assert.equal(goal.ownGoal,false);
    assert.deepEqual(goal.origin,{x:state.ball.x,y:state.ball.y},'the map receives the actual pitch origin');
    assert.deepEqual(goal.target,forward);assert.deepEqual(normalizeGoalOrigin(goal),{x:6,y:5});
    assert.deepEqual(summary.scorers,[{team,pieceId:`${team}-P3`,count:1}]);
    const restored=restoreMatchStats(JSON.parse(JSON.stringify(stats)),after);assert.deepEqual(restored,stats);
    assert.deepEqual(matchStatsSummary(restored).scorers,summary.scorers);
    const replay=buildGoalReplay([{game:state},{game:before}],before,after);assert.ok(replay);
    assert.equal(replay.team,team);assert.equal(replay.shootingTeam,team);assert.equal(replay.ownGoal,false);assert.equal(replay.shooterId,`${team}-P3`);
    assert.deepEqual(restoreGoalReplay(JSON.parse(JSON.stringify(replay))),replay);
  });

  test(`${team}: a human may still shoot backward and an actual own goal is distinguished from P3's legitimate goal`,()=>{
    const {state,other,backward}=pawnFixture(team),before=applyKick(state,backward.x,backward.y),after=skipMove(before,{roll:0});
    assert.equal(before.pendingShot.shootingTeam,team);assert.equal(before.pendingShot.scoringTeam,other);
    assert.equal(after.lastAction.type,'goal');assert.equal(after.lastAction.team,other);assert.equal(after.lastAction.ownGoal,true);
    let stats=recordMatchTransition(createMatchStats(),state,before);stats=recordMatchTransition(stats,before,after);
    const summary=matchStatsSummary(stats);assert.equal(summary.goals[0].scorerId,`${team}-P3`);assert.equal(summary.goals[0].ownGoal,true);
    assert.deepEqual(summary.scorers,[]);assert.deepEqual(restoreMatchStats(stats,after),stats);
  });

  for(const metadata of ['missing','contradictory'])test(`${team} P3 legitimate goal retains its scorer when restored in-flight shooting-team metadata is ${metadata}`,()=>{
    const {state,other,forward}=pawnFixture(team),pending=applyKick(state,forward.x,forward.y);
    if(metadata==='missing')delete pending.pendingShot.shootingTeam;else pending.pendingShot.shootingTeam=other;
    const serialized=JSON.stringify(pending),restored=normalizeGame(JSON.parse(serialized));
    assert.equal(restored.pendingShot.shootingTeam,team,'stable shooter identity supplies the canonical team on reload');
    for(const before of [restored,pending]){
      const after=skipMove(before,{roll:0});
      assert.equal(after.lastAction.type,'goal');assert.equal(after.lastAction.team,team);assert.equal(after.lastAction.shootingTeam,team);
      assert.equal(after.lastAction.ownGoal,false,'resolving an unnormalized incomplete snapshot must also use the actual shooter');
      const stats=recordMatchTransition(createMatchStats(),before,after),summary=matchStatsSummary(stats);
      assert.equal(summary.goals[0].scorerId,`${team}-P3`);assert.equal(summary.goals[0].ownGoal,false);
      assert.deepEqual(summary.scorers,[{team,pieceId:`${team}-P3`,count:1}]);
    }
    assert.equal(JSON.stringify(pending),serialized,'normalization and either resolution preserve the supplied saved snapshot');
  });

  for(const metadata of ['missing','contradictory'])test(`${team}: the actual target determines both goal teams when pending metadata is ${metadata}`,()=>{
    for(const ownGoal of [false,true]){
      const {state,other,forward,backward}=pawnFixture(team),target=ownGoal?backward:forward,scoringTeam=ownGoal?other:team,defendingTeam=ownGoal?team:other;
      const pending=applyKick(state,target.x,target.y);
      if(metadata==='missing'){delete pending.pendingShot.scoringTeam;delete pending.pendingShot.defendingTeam;delete pending.lastAction.team;}
      else{pending.pendingShot.scoringTeam=defendingTeam;pending.pendingShot.defendingTeam=scoringTeam;pending.lastAction.team=other;}
      const original=structuredClone(pending),restored=normalizeGame(JSON.parse(JSON.stringify(pending)));
      assert.equal(restored.pendingShot.scoringTeam,scoringTeam);assert.equal(restored.pendingShot.defendingTeam,defendingTeam);
      assert.equal(restored.lastAction.team,team,'the restored declaration credits the actual shooter, independently of the goal endpoint');
      assert.deepEqual(restored.pendingShot.from,pending.pendingShot.from);assert.equal(restored.pendingShot.x,target.x);assert.equal(restored.pendingShot.y,target.y);
      assert.equal(restored.randomState,pending.randomState);
      for(const before of [pending,restored]){
        const after=skipMove(before,{roll:0});assert.equal(after.lastAction.type,'goal');
        assert.equal(after.lastAction.team,scoringTeam);assert.equal(after.lastAction.shootingTeam,team);assert.equal(after.lastAction.ownGoal,ownGoal);
        assert.equal(after.score[scoringTeam],1);assert.equal(after.score[defendingTeam],0);
        assert.deepEqual(after.lastAction.from,pending.pendingShot.from);assert.deepEqual(after.lastAction.to,target);
      }
      assert.deepEqual(pending,original,'repairing metadata never changes the supplied saved shot');
    }
  });
}
