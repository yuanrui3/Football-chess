import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../dist/engine.js';
import {createMatchStats,recordMatchTransition,restoreMatchStats} from '../dist/match-stats.js';

const clone=structuredClone,other=t=>t==='white'?'black':'white';
const id=(value,team)=>team==='white'?value:value.replace(/^(white|black)/,other);
const point=([x,y],team='white',end='top')=>{const p={x,y:end==='top'?y:E.BOARD_HEIGHT-1-y};return team==='white'?p:{x:E.BOARD_WIDTH-1-p.x,y:E.BOARD_HEIGHT-1-p.y};};
function fixture({team='white',end='top',phase='attackMove',actor='white-R1',origin=[3,6],carrying=true,positions={},foulsEnabled=false}={}){
 const state=E.createGame({mode:'local',seed:1604,foulsEnabled}),assigned={'white-K':[1,15],'black-K':[12,1],'white-Q':[11,8],'black-N1':[11,0],'black-N2':[12,0],[actor]:origin,...positions};
 const used=new Set(Object.values(assigned).map(p=>p.join(',')));assert.equal(used.size,Object.keys(assigned).length,'distinct fixture assignments');
 const parking=Array.from({length:E.BOARD_HEIGHT},(_,y)=>[[0,y],[E.BOARD_WIDTH-1,y]]).flat();
 for(const piece of state.pieces){const p=assigned[piece.id]||parking.find(p=>!used.has(p.join(',')));assert.ok(p);used.add(p.join(','));Object.assign(piece,point(p,team,end));piece.id=id(piece.id,team);if(team==='black')piece.team=other(piece.team);}
 // Keep kings on ordinary field so either end tests the same restrictions.
 for(const piece of state.pieces.filter(p=>p.type==='K'))Object.assign(piece,piece.team==='white'?{x:1,y:15}:{x:12,y:1});
 assert.equal(new Set(state.pieces.map(p=>`${p.x},${p.y}`)).size,22);
 assert.ok(state.pieces.every(p=>E.canOccupySquare(p,p.x,p.y)),'every starting piece is eligible for its square');
 const owner=state.pieces.find(p=>p.id===id(carrying?actor:'white-R2',team));
 Object.assign(state,{phase,attack:team,ball:{x:owner.x,y:owner.y,carrierId:owner.id},restart:null,offside:null,pendingShot:null,positionBudget:{normalUsed:false,pawnUsed:false,dribbleUsed:false},ballProgress:{team,anchorY:owner.y,rounds:0,pendingRelease:false,excludeRelease:false}});
 return state;
}
const offered=(state,pieceId,p,options)=>E.legalMoves(state,pieceId,options).find(m=>m.x===p.x&&m.y===p.y);
function passFixture({team='white',origin=[3,6],receiver=[3,4],foulsEnabled=false}={}){
 return fixture({team,phase:'kick',origin,positions:{'white-R2':receiver},foulsEnabled});
}
function requestRun(state,team='white',options={}){const receiver=state.pieces.find(p=>p.id===id('white-R2',team));return E.applyKick(state,receiver.x,receiver.y,{roll:0,passRun:true,...options});}

for(const end of ['top','bottom'])test(`${end}: four goal-mouth cells admit only the defending king`,()=>{
 const y=end==='top'?0:E.BOARD_HEIGHT-1,defender=end==='top'?'black':'white';
 for(let x=0;x<E.BOARD_WIDTH;x++){
  assert.equal(E.isGoalMouth(x,y),E.GOAL_FILES.includes(x));
  for(const team of ['white','black'])for(const type of ['K','Q','R','B','N','P'])assert.equal(E.canOccupySquare({id:`${team}-${type}`,type,team},x,y),type==='K'?(!E.isBox(x,y)||team===defender):!E.GOAL_FILES.includes(x),`${team} ${type} at ${x},${y}`);
 }
 for(const x of E.GOAL_FILES)assert.equal(E.isGoalMouth(x,end==='top'?1:E.BOARD_HEIGHT-2),false);
 assert.equal(E.isGoalMouth(-1,y),false);assert.equal(E.isGoalMouth(E.GOAL_FILES[0],-1),false);
});

for(const team of ['white','black'])for(const end of ['top','bottom'])test(`${team}, ${end}: all outfield carriers cannot enter a box, but off-ball players may`,()=>{
 for(const [actor,origin,destination]of [['white-Q',[3,1],[4,1]],['white-R1',[3,1],[4,1]],['white-B1',[3,3],[4,2]],['white-N1',[3,3],[4,1]],['white-P1',[3,1],[4,1]]]){
  const target=point(destination,team,end),pieceId=id(actor,team),carrying=fixture({team,end,actor,origin}),before=clone(carrying);
  assert.equal(offered(carrying,pieceId,target),undefined,'carrier entry prohibited');assert.throws(()=>E.applyMove(carrying,pieceId,target.x,target.y),/not a legal move/);assert.deepEqual(carrying,before,'rejected entry is pure');
  const offball=fixture({team,end,actor,origin,carrying:false});assert.ok(offered(offball,pieceId,target),'off-ball entry remains available');
 }
});

for(const team of ['white','black'])for(const end of ['top','bottom'])test(`${team}, ${end}: dribble cannot cross a box corner and emerge outside`,()=>{
 for(const actor of ['white-Q','white-B1']){
  const state=fixture({team,end,actor,origin:[3,1]}),target=point([5,3],team,end),pieceId=id(actor,team);
  assert.equal(E.isBox(target.x,target.y),false);assert.ok(E.movementCost(state.pieces.find(p=>p.id===pieceId),target.x,target.y)<=E.DRIBBLE_RANGE);
  assert.equal(offered(state,pieceId,target),undefined,'crossed box square prohibits entire carry path');
  const offball=fixture({team,end,actor,origin:[3,1],carrying:false});assert.ok(offered(offball,pieceId,target),'same ordinary off-ball ray stays legal');
 }
});

for(const team of ['white','black'])for(const end of ['top','bottom'])test(`${team}, ${end}: existing box carrier may dribble within and exit, then cannot re-enter`,()=>{
 const state=fixture({team,end,origin:[4,1]}),pieceId=id('white-R1',team),inside=point([5,1],team,end),outside=point([3,1],team,end);
 assert.ok(offered(state,pieceId,inside));assert.ok(offered(state,pieceId,outside));
 let exited=E.applyMove(state,pieceId,outside.x,outside.y);exited=E.skipMove(exited);exited=E.skipMove(exited);const collect=point([3,2],team,end);exited=E.applyKick(exited,collect.x,collect.y,{roll:0});exited=E.applyMove(exited,pieceId,collect.x,collect.y);
 assert.equal(exited.phase,'attackMove');assert.equal(offered(exited,pieceId,point([4,2],team,end)),undefined,'later possession does not preserve permission after exiting');
});

for(const team of ['white','black'])test(`${team}: legacy goal-mouth occupant repairs deterministically with carrier and restart spot`,()=>{
 const state=passFixture({team}),piece=state.pieces.find(p=>p.id===id('white-R1',team)),illegal=point([6,0],team);Object.assign(piece,illegal);state.ball={...illegal,carrierId:piece.id};state.restart={type:'corner',team,takerId:piece.id,spot:{...illegal},indirect:false};state.rulesVersion=15;
 const before=clone(state),restored=E.normalizeGame(state),repaired=restored.pieces.find(p=>p.id===piece.id);
 assert.deepEqual(state,before);assert.equal(E.isGoalMouth(repaired.x,repaired.y),false);assert.ok(E.canOccupySquare(repaired,repaired.x,repaired.y));assert.deepEqual(restored.ball,{x:repaired.x,y:repaired.y,carrierId:piece.id});assert.deepEqual(restored.restart.spot,{x:repaired.x,y:repaired.y});assert.deepEqual(E.normalizeGame(clone(state)),restored);assert.deepEqual(E.normalizeGame(restored),restored);
});

for(const team of ['white','black'])test(`${team}: post-pass run is opt-in, only the passer may run, and it spends the upcoming off-ball move`,()=>{
 const state=passFixture({team}),before=clone(state),receiver=state.pieces.find(p=>p.id===id('white-R2',team)),ordinary=E.applyKick(state,receiver.x,receiver.y,{roll:0}),run=requestRun(state,team),passer=id('white-R1',team);
 assert.deepEqual(state,before);assert.equal(ordinary.phase,'attackMove');assert.equal(ordinary.passRun,null);assert.equal(run.phase,'passRun');assert.deepEqual(run.passRun,{pieceId:passer,team});assert.equal(E.currentTeam(run),team);assert.equal(run.ball.carrierId,receiver.id);
 assert.deepEqual(E.legalMoves(run,receiver.id),[]);assert.deepEqual(E.legalMoves(run,id('white-P1',team),{freePawn:true}),[]);assert.deepEqual(E.legalKicks(run),[]);
 const target=point([4,6],team),move=offered(run,passer,target);assert.ok(move);assert.equal(move.type,'move');const moved=E.applyMove(run,passer,target.x,target.y);
 assert.equal(moved.phase,'attackMove');assert.equal(moved.passRun,null);assert.equal(moved.lastAction.passRun,true);assert.equal(moved.positionBudget.normalUsed,true);assert.equal(moved.positionBudget.dribbleUsed,false);assert.equal(moved.positionBudget.pawnUsed,false);assert.deepEqual(moved.ball,run.ball);assert.equal(E.positionActions(moved).normalAvailable,false);assert.equal(E.positionActions(moved).dribbleAvailable,true);assert.equal(E.positionActions(moved).pawnAvailable,true);assert.equal(moved.randomState,run.randomState,'off-ball run does not draw random outcomes');
 assert.throws(()=>E.applyMove(run,receiver.id,receiver.x+1,receiver.y),/not a legal move/);
});

for(const team of ['white','black'])test(`${team}: declining run preserves the ordinary positioning allowance and reload/Undo choices`,()=>{
 const state=passFixture({team}),run=requestRun(state,team),before=clone(run),stats=recordMatchTransition(createMatchStats(),state,run),restored=E.normalizeGame(clone(run));assert.deepEqual(restored,run);assert.deepEqual(restoreMatchStats(clone(stats),restored),stats);
 const skipped=E.skipMove(run);assert.equal(skipped.phase,'attackMove');assert.equal(skipped.passRun,null);assert.equal(skipped.lastAction.passRun,true);assert.equal(skipped.positionBudget.normalUsed,false);assert.equal(E.positionActions(skipped).normalAvailable,true);assert.deepEqual(run,before);
 assert.deepEqual(E.skipMove(restored),skipped,'reloaded option resolves identically');assert.deepEqual(requestRun(clone(state),team),run,'undo to pass snapshot can choose same run without duplicate randomness');
});

for(const team of ['white','black'])test(`${team}: post-pass run obeys ten weighted points and the same no-box-entry path rule`,()=>{
 const state=passFixture({team,origin:[3,1],receiver:[3,4]}),run=requestRun(state,team),passer=id('white-R1',team);
 for(const p of [[4,1],[5,3]])assert.equal(offered(run,passer,point(p,team)),undefined,'run cannot enter or traverse box');
 const rangeRun=requestRun(passFixture({team,origin:[3,1],receiver:[1,1]}),team);assert.ok(offered(rangeRun,passer,point([3,11],team)),'ten ordinary squares available');assert.equal(offered(rangeRun,passer,point([3,12],team)),undefined,'eleven squares forbidden');
 const skipped=E.skipMove(run);assert.ok(offered(skipped,passer,point([4,1],team)),'declining the run retains a normal off-ball box entry');
 const within=passFixture({team,origin:[4,1],receiver:[4,4]}),insideRun=requestRun(within,team);assert.ok(offered(insideRun,passer,point([8,1],team)),'four entered box squares cost eight');assert.ok(offered(insideRun,passer,point([9,1],team)),'five entered box squares cost ten');assert.equal(offered(insideRun,passer,point([10,1],team)),undefined,'exit after six box squares exceeds ten');assert.ok(offered(insideRun,passer,point([3,1],team)),'inside passer may exit');
});

for(const team of ['white','black'])test(`${team}: empty target, inaccurate pass and back-pass never offer the optional run`,()=>{
 const state=passFixture({team}),empty=point([3,5],team),loose=E.applyKick(state,empty.x,empty.y,{roll:0,passRun:true});assert.notEqual(loose.phase,'passRun');assert.equal(loose.passRun,null);assert.equal(loose.ball.carrierId,null);
 const long=passFixture({team,origin:[3,14],receiver:[3,2]}),miss=requestRun(long,team,{roll:.999,landing:point([2,2],team)});assert.notEqual(miss.phase,'passRun');assert.equal(miss.passRun,null);assert.notEqual(miss.ball.carrierId,id('white-R2',team));
 const back=passFixture({team,origin:[1,11],receiver:[3,4]}),keeper=back.pieces.find(p=>p.id===id('white-K',team)),caught=E.applyKick(back,keeper.x,keeper.y,{roll:0,passRun:true});assert.equal(caught.phase,'keeperRelease');assert.equal(caught.passRun,null);assert.equal(caught.ball.carrierId,keeper.id);
});

test('post-pass run has no tackles, collection, shared bonus, foul draw or extra pass event',()=>{
 const state=passFixture({foulsEnabled:true}),run=requestRun(state),stats=recordMatchTransition(createMatchStats(),state,run),target={x:4,y:6},moved=E.applyMove(run,'white-R1',target.x,target.y),next=recordMatchTransition(stats,run,moved);
 assert.ok(E.legalMoves(run,'white-R1').every(move=>move.type==='move'));assert.deepEqual(E.legalMoves(run,'white-R1',{freePawn:true}),[]);assert.equal(next.lastPass.providerId,'white-R1');assert.equal(next.lastPass.receiverId,'white-R2');assert.deepEqual(next.foulEvents,[]);assert.equal(next.teams.white.shots,0);assert.equal(moved.randomState,run.randomState);
 assert.equal(run.ball.carrierId,'white-R2','eligible run keeps the teammate in control');
});

for(const team of ['white','black'])test(`${team}: action timeout declines the optional run without conceding possession`,()=>{
 const run=requestRun(passFixture({team}),team),next=E.actionTimeout(run);assert.equal(next.phase,'attackMove');assert.equal(next.passRun,null);assert.equal(next.positionBudget.normalUsed,false);assert.equal(next.restart,null);assert.equal(next.lastAction.passRun,true);assert.equal(next.lastAction.timedOutTeam,team);assert.deepEqual(next.score,run.score);
});

for(const team of ['white','black'])test(`${team}: a loose self-pass cannot bypass the no-box-entry rule, while a teammate can collect`,()=>{
 const state=fixture({team,phase:'kick',actor:'white-Q',origin:[3,1],positions:{'white-R2':[4,4]}}),target=point([4,2],team),passer=id('white-Q',team),receiver=id('white-R2',team);
 const loose=E.applyKick(state,target.x,target.y,{roll:0});assert.equal(loose.ball.carrierId,null);assert.deepEqual(loose.looseBallKickOrigin.from,point([3,1],team));assert.equal(offered(loose,passer,target),undefined,'original outside passer cannot collect its own box pass');assert.ok(offered(loose,receiver,target),'teammate may collect a legitimate box pass');
 const teammate=E.applyMove(loose,receiver,target.x,target.y);assert.equal(teammate.ball.carrierId,receiver);
 const staged=E.applyMove(loose,passer,...Object.values(point([4,1],team)));assert.equal(staged.ball.carrierId,null);assert.deepEqual(staged.looseBallKickOrigin.from,point([3,1],team),'off-ball reposition retains kick-time origin');
 let next=E.skipMove(staged);next=E.skipMove(next);if(next.phase==='kick')next=E.skipMove(next);assert.equal(next.phase,'attackMove');assert.equal(offered(next,passer,target),undefined,'entering first without the ball cannot erase the kick-time restriction');
 assert.equal(offered(E.normalizeGame(clone(next)),passer,target),undefined,'reload preserves the same self-pass restriction');
});
