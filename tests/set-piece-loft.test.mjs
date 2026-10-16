import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../dist/engine.js';

const other=t=>t==='white'?'black':'white';
const idFor=(id,team)=>team==='white'?id:id.replace(/^(white|black)/,other);
const pointFor=([x,y],team)=>team==='white'?{x,y}:{x:E.BOARD_WIDTH-1-x,y:E.BOARD_HEIGHT-1-y};
const types=['goalKick','corner','offside','stalling','timeout'];
function fixture({team='white',type='corner',carrier=type==='goalKick'?'white-K':'white-R1',positions={},phase='kick',origin=carrier==='white-K'?[6,16]:[3,14]}={}){
  const s=E.createGame({mode:'local',seed:9401}),assigned={'white-K':[6,16],'black-K':[8,2],'black-R2':[11,6],[carrier]:origin,...positions};
  const used=new Set(Object.values(assigned).map(p=>p.join(',')));assert.equal(used.size,Object.keys(assigned).length);
  const parking=Array.from({length:11},(_,i)=>[[0,6+i],[13,6+i]]).flat();
  for(const p of s.pieces){const q=assigned[p.id]||parking.find(q=>!used.has(q.join(',')));assert.ok(q);[p.x,p.y]=q;used.add(q.join(','));if(team==='black'){p.id=idFor(p.id,team);p.team=other(p.team);p.x=E.BOARD_WIDTH-1-p.x;p.y=E.BOARD_HEIGHT-1-p.y;}}
  const c=s.pieces.find(p=>p.id===idFor(carrier,team));s.ball={x:c.x,y:c.y,carrierId:c.id};s.attack=team;s.phase=phase;s.positionBudget={normalUsed:false,pawnUsed:false,dribbleUsed:false};
  s.restart=type?{type,team,takerId:c.id,spot:{x:c.x,y:c.y},indirect:['offside','stalling','timeout'].includes(type)}:null;
  s.offside=null;s.ballProgress={team,anchorY:c.y,rounds:0,pendingRelease:false,excludeRelease:false};return s;
}
const record=(s,p,team)=>{const q=pointFor(p,team);return E.legalKicks(s).find(k=>k.x===q.x&&k.y===q.y);};
const kick=(s,p,team,options)=>{const q=pointFor(p,team);return E.applyKick(s,q.x,q.y,options);};
const clone=s=>JSON.parse(JSON.stringify(s));
function assertLoft(k,id,p,team){assert.equal(k.lofted,true);assert.equal(k.bypassedPieceId,idFor(id,team));assert.deepEqual(k.bypassedSquare,pointFor(p,team));}

for(const team of ['white','black']){
  test(`${team}: every eligible restart can bypass either team's first player and end on either team's second player`,()=>{
    for(const type of types)for(const firstTeam of ['white','black'])for(const secondTeam of ['white','black']){
      const x=type==='goalKick'?6:3,first=`${firstTeam}-P1`,second=`${secondTeam}-Q`;
      const s=fixture({team,type,positions:{[first]:[x,10],[second]:[x,7]}}),before=clone(s);
      const ground=record(s,[x,10],team);assert.equal(ground.receiverId,idFor(first,team));assert.equal(ground.lofted,undefined);
      assert.equal(record(s,[x,11],team).lofted,undefined);
      assertLoft(record(s,[x,9],team),first,[x,10],team);
      const target=record(s,[x,7],team);assertLoft(target,first,[x,10],team);assert.equal(target.receiverId,idFor(second,team));
      assert.equal(record(s,[x,6],team),undefined,'a second occupied square ends the ray');
      const firstResult=kick(s,[x,10],team,{roll:0});assert.equal(firstResult.ball.carrierId,idFor(first,team));assert.equal(firstResult.lastAction.lofted,undefined);
      const secondResult=kick(s,[x,7],team,{roll:0});assert.equal(secondResult.ball.carrierId,idFor(second,team));assertLoft(secondResult.lastAction,first,[x,10],team);
      assert.equal(secondResult.lastAction.type,secondTeam==='white'?'kick':'interception');
      assert.equal(secondResult.restart,null);assert.deepEqual(s,before);
    }
  });

  test(`${team}: a single-player loft preserves long-pass odds, scatter and out-of-bounds restarts`,()=>{
    for(const type of types){
      const x=type==='goalKick'?6:3,s=fixture({team,type,positions:{'black-P1':[x,10]}}),target=[x,1],k=record(s,target,team);
      assert.ok(k.distance>10);assert.equal(k.accuracy,E.passAccuracy(k.distance));assertLoft(k,'black-P1',[x,10],team);
      const complete=kick(s,target,team,{roll:k.accuracy-1e-7});assert.equal(complete.lastAction.type,'kick');assert.deepEqual({x:complete.ball.x,y:complete.ball.y},pointFor(target,team));assertLoft(complete.lastAction,'black-P1',[x,10],team);
      const landing=pointFor([2,3],team),miss=kick(s,target,team,{roll:k.accuracy,landing});assert.equal(miss.lastAction.type,'miss');assert.deepEqual({x:miss.ball.x,y:miss.ball.y},landing);assertLoft(miss.lastAction,'black-P1',[x,10],team);
      const out=kick(s,target,team,{roll:0.999,landing:pointFor([-2,1],team)});assert.equal(out.lastAction.type,'out');assert.equal(out.restart.type,'throwIn');assert.equal(out.restart.team,other(team));assertLoft(out.lastAction,'black-P1',[x,10],team);
      assert.equal(new Set(out.pieces.map(p=>`${p.x},${p.y}`)).size,22);
    }
  });

  test(`${team}: open play and throws still stop at the first player, and loft permission expires after the restart`,()=>{
    for(const type of [null,'throwIn']){
      const s=fixture({team,type,positions:{'black-P1':[3,12]}});
      assert.ok(record(s,[3,12],team));assert.equal(record(s,[3,11],team),undefined);assert.ok(E.legalKicks(s).every(k=>!k.lofted));
    }
    for(const type of types){
      const x=type==='goalKick'?6:3,s=fixture({team,type,positions:{'black-P1':[x,10],'white-Q':[x,7],'black-P2':[x,5]}});
      let next=kick(s,[x,7],team,{roll:0});next=E.skipMove(E.skipMove(next));assert.equal(next.phase,'kick');
      assert.ok(record(next,[x,5],team));assert.equal(record(next,[x,4],team),undefined);assert.ok(E.legalKicks(next).every(k=>!k.lofted));
    }
  });

  test(`${team}: ordinary shots never gain the set-piece passing bypass`,()=>{
    const clear=fixture({team,type:'corner',origin:[5,6]});assert.equal(record(clear,[5,-1],team).goal,team);
    for(const blocker of ['black-P1','white-P1','black-N1','white-N1']){
      const position=blocker.endsWith('N1')?[5,3]:[5,4];
      const s=fixture({team,type:'corner',origin:[5,6],positions:{[blocker]:position}});
      const shot=record(s,[5,-1],team);
      if(blocker.startsWith('white')) assert.equal(shot,undefined,'friendly bodies still stop ordinary shots');
      else { assert.equal(shot.goal,team);assert.ok(Math.abs(shot.shotModel.blockProbability-0.45)<1e-12);assert.equal(shot.lofted,undefined,'shot blocking is independent of set-piece passing loft'); }
      assertLoft(record(s,[5,2],team),blocker,position,team);
    }
    for(const type of ['goalKick','offside','stalling','timeout','throwIn'])assert.ok(E.legalKicks(fixture({team,type,origin:type==='goalKick'?[6,16]:[5,6]})).every(k=>!k.goal));
  });

  test(`${team}: free-kick lofts retain offside, while direct corner and goal-kick lofts keep their exemptions`,()=>{
    for(const type of types){
      const x=type==='goalKick'?6:3,s=fixture({team,type,positions:{'black-P1':[x,10],'white-Q':[x,1]}}),target=record(s,[x,1],team);
      assert.equal(target.offside,['offside','stalling','timeout'].includes(type));assertLoft(target,'black-P1',[x,10],team);
      const next=kick(s,[x,1],team,{roll:0});assertLoft(next.lastAction,'black-P1',[x,10],team);
      assert.equal(next.lastAction.type,['offside','stalling','timeout'].includes(type)?'offside':'kick');
    }
    for(const type of ['offside','stalling','timeout']){
      const s=fixture({team,type,positions:{'black-P1':[3,12],'white-Q':[3,9],'white-N1':[6,1]}}),next=kick(s,[3,9],team,{roll:0.999});
      assert.equal(next.lastAction.offsideReason,'boxKnight');assert.equal(next.randomState,s.randomState);assertLoft(next.lastAction,'black-P1',[3,12],team);
    }
  });

  test(`${team}: native knight kicks remain one L jump without the new loft allowance or metadata`,()=>{
    for(const type of ['corner','offside',null]){
      const s=fixture({team,type,carrier:'white-N1',origin:[3,10],positions:{'black-P1':[3,9],'white-Q':[4,8]}}),target=record(s,[4,8],team);
      assert.ok(target);assert.equal(target.lofted,undefined);assert.equal(target.receiverId,idFor('white-Q',team));
      assert.ok(E.legalKicks(s).every(k=>Math.abs(k.x-s.ball.x)*Math.abs(k.y-s.ball.y)===2&&!k.lofted));
    }
  });

  test(`${team}: every piece type can be the bypassed player, and goalkeeper receipt still forces immediate release`,()=>{
    for(const color of ['white','black'])for(const suffix of ['K','Q','R2','B1','N1','P1']){
      const blocker=`${color}-${suffix}`,s=fixture({team,type:'corner',positions:{[blocker]:[3,12]}});
      assertLoft(record(s,[3,9],team),blocker,[3,12],team);
      assert.equal(kick(s,[3,9],team,{roll:0}).lastAction.type,'kick');
    }
    const s=fixture({team,type:'corner',positions:{'black-P1':[3,12],'white-K':[3,9]}}),next=kick(s,[3,9],team,{roll:0});
    assert.equal(next.phase,'keeperRelease');assert.equal(next.releaseReason,'backPass');assertLoft(next.lastAction,'black-P1',[3,12],team);
    assert.equal(next.ball.carrierId,idFor('white-K',team));assert.ok(E.legalKicks(next).every(k=>!k.lofted),'an immediate keeper release is ordinary open play');
  });

  test(`${team}: both AI levels use a safe long goal-kick loft without changing state or peeking at future randomness`,()=>{
    const s=fixture({team,type:'goalKick',positions:{'white-Q':[6,5],'black-P1':[6,10],'black-N1':[4,3]}}),before=clone(s);
    for(const difficulty of ['casual','tactical']){
      const action=E.chooseAIAction(s,{difficulty}),target=pointFor([6,5],team);
      assert.deepEqual(action,{type:'kick',x:target.x,y:target.y,...(difficulty==='casual'?{passRun:true}:{})});
      const k=record(s,[6,5],team);assert.equal(k.distance,11);assert.equal(k.accuracy,0.9);assertLoft(k,'black-P1',[6,10],team);
      assert.deepEqual(E.chooseAIAction({...clone(s),randomState:123456789},{difficulty}),action);
      const next=kick(s,[6,5],team,{roll:0});assert.equal(next.ball.carrierId,idFor('white-Q',team));assert.deepEqual(s,before);
    }
  });
}

test('current normalization keeps already valid saved positions and declared shots intact',()=>{
  const state=fixture({type:'corner',origin:[5,6]});state.restart=null;const pending=E.applyKick(state,5,-1);pending.rulesVersion=14;
  const before=clone(pending),normalized=E.normalizeGame(pending);assert.equal(normalized.rulesVersion,17);
  assert.deepEqual(normalized.pendingShot,before.pendingShot);assert.deepEqual(normalized.pieces,before.pieces);assert.equal(normalized.randomState,before.randomState);assert.deepEqual(pending,before);
});
