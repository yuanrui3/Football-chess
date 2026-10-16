import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../dist/engine.js';

const other = team => team === 'white' ? 'black' : 'white';
const idFor = (id, team) => team === 'white' ? id : id.replace(/^(white|black)/, other);
const pointFor = ([x,y], team) => team === 'white' ? {x,y} : {x:11-x,y:14-y};
const ownBox = (team,p) => E.isBox(p.x,p.y) && (team === 'white' ? p.y >= 13 : p.y <= 1);
const clone = value => JSON.parse(JSON.stringify(value));
function fixture({team='white',phase='attackMove',carrier='white-R1',positions={}}={}) {
  const state=E.createGame({mode:'local',seed:73});
  const assigned={'white-K':[3,2],'black-K':[6,0],'white-R1':[4,4],'black-R2':[10,4],...positions};
  const used=new Set(Object.values(assigned).map(p=>p.join(',')));
  assert.equal(used.size,Object.keys(assigned).length);
  const parking=Array.from({length:15},(_,i)=>[[0,14-i],[11,14-i]]).flat();
  for(const piece of state.pieces){
    const position=assigned[piece.id]||parking.find(p=>!used.has(p.join(',')));
    [piece.x,piece.y]=position;used.add(position.join(','));
    if(team==='black'){
      piece.id=idFor(piece.id,team);piece.team=other(piece.team);
      piece.x=11-piece.x;piece.y=14-piece.y;
    }
  }
  const owner=state.pieces.find(p=>p.id===idFor(carrier,team));
  state.ball={x:owner.x,y:owner.y,carrierId:owner.id};state.attack=team;state.phase=phase;
  state.positionBudget={normalUsed:false,pawnUsed:false,dribbleUsed:false};
  state.ballProgress={team,anchorY:owner.y,rounds:0,pendingRelease:false,excludeRelease:false};
  state.offside=null;state.restart=null;
  return state;
}
const piece=(s,id,team)=>s.pieces.find(p=>p.id===idFor(id,team));
function moveTo(state,id,target,team,options){
  const point=pointFor(target,team);
  return E.legalMoves(state,idFor(id,team),options).find(move=>move.x===point.x&&move.y===point.y);
}
function assertIntegrity(state){
  assert.equal(state.pieces.length,22);assert.equal(new Set(state.pieces.map(p=>`${p.x},${p.y}`)).size,22);
  for(const p of state.pieces.filter(p=>p.type==='K'))assert.equal(ownBox(other(p.team),p),false);
}

for(const team of ['white','black']){
  test(`${team}: the king cannot move or dribble across the opponent-box boundary`,()=>{
    for(const carrier of ['white-R1','white-K'])for(const [origin,target]of[
      [[3,0],[4,0]],[[3,1],[4,1]],[[4,2],[4,1]],[[5,2],[5,1]],[[6,2],[6,1]],[[7,2],[7,1]],[[8,1],[7,1]],[[8,0],[7,0]],
    ]){
      const state=fixture({team,carrier,positions:{'white-K':origin}}),before=clone(state),point=pointFor(target,team);
      assert.equal(moveTo(state,'white-K',target,team),undefined);
      assert.throws(()=>E.applyMove(state,idFor('white-K',team),point.x,point.y),/not a legal move/);
      assert.deepEqual(state,before);
    }
  });

  test(`${team}: the king keeps ordinary-field and own-box movement, dribbling and passing`,()=>{
    for(const carrier of ['white-R1','white-K'])for(const [origin,target]of[
      [[3,2],[3,1]],[[5,12],[5,13]],[[5,13],[6,12]],
    ]){
      const state=fixture({team,carrier,positions:{'white-K':origin}}),point=pointFor(target,team);
      assert.ok(moveTo(state,'white-K',target,team));
      const moved=E.applyMove(state,idFor('white-K',team),point.x,point.y);assertIntegrity(moved);
      if(carrier==='white-K')assert.deepEqual(moved.ball,{...point,carrierId:idFor('white-K',team)});
    }
    const state=fixture({team,phase:'kick',carrier:'white-K',positions:{'white-K':[3,2]}});
    assert.ok(E.legalKicks(state).some(kick=>Math.max(Math.abs(kick.x-state.ball.x),Math.abs(kick.y-state.ball.y))>1),'passing pattern remains queen-like');
  });

  test(`${team}: king tackles and loose-ball collections cannot land in the opponent box`,()=>{
    const state=fixture({team,phase:'defendMove',carrier:'black-N1',positions:{'black-N1':[4,2]}});
    state.attack=other(team);
    const moves=E.legalMoves(state,idFor('white-K',team));
    assert.ok(moves.some(move=>move.type==='tackle'),'a reachable tackle outside the box remains legal');
    assert.ok(moves.every(move=>!ownBox(other(team),move)));
    const blocked=pointFor([4,1],team);
    assert.throws(()=>E.applyMove(state,idFor('white-K',team),blocked.x,blocked.y),/not a legal move/);
    const loose=fixture({team});loose.ball={...blocked,carrierId:null};
    assert.equal(moveTo(loose,'white-K',[4,1],team),undefined);
    const outside=pointFor([3,1],team);loose.ball={...outside,carrierId:null};
    assert.ok(moveTo(loose,'white-K',[3,1],team));
    assert.equal(E.applyMove(loose,idFor('white-K',team),outside.x,outside.y).ball.carrierId,idFor('white-K',team));
  });

  test(`${team}: knights retain movement and dribbling access to both boxes`,()=>{
    for(const carrier of ['white-R1','white-N1'])for(const [origin,target]of[[[3,2],[4,0]],[[3,12],[4,14]]]){
      const state=fixture({team,carrier,positions:{'white-K':[5,13],'white-N1':origin}}),point=pointFor(target,team);
      assert.ok(moveTo(state,'white-N1',target,team));
      const next=E.applyMove(state,idFor('white-N1',team),point.x,point.y);assertIntegrity(next);
      if(carrier==='white-N1')assert.equal(next.ball.carrierId,idFor('white-N1',team));
    }
  });

  test(`${team}: new restart placement cannot put a king inside the opponent box`,()=>{
    const state=fixture({team,carrier:'black-N1',positions:{'white-K':[3,0],'black-N1':[5,0]}});
    state.attack=other(team);
    const restarted=E.actionTimeout(state);
    assert.equal(restarted.restart.team,team);assert.equal(restarted.restart.takerId,idFor('white-K',team));
    assert.equal(ownBox(other(team),piece(restarted,'white-K',team)),false);
    const king=piece(restarted,'white-K',team);
    assert.deepEqual(restarted.restart.spot,{x:king.x,y:king.y});assertIntegrity(restarted);
  });

  test(`${team}: saved or undone illegal kings move to a nearest vacant ordinary square without spending an action or RNG`,()=>{
    for(const version of [undefined,5,9,10,11]){
      const state=fixture({team,positions:{'white-K':[5,0]}});
      state.rulesVersion=version;state.positionBudget={normalUsed:true,pawnUsed:false,dribbleUsed:true};
      state.score={white:2,black:1};state.turn=17;state.minutes=8;
      const before=clone(state),normalized=E.normalizeGame(state),king=piece(normalized,'white-K',team);
      assert.deepEqual({x:king.x,y:king.y},pointFor([5,2],team),'equal distance favors the team’s own end');
      assert.equal(E.isBox(king.x,king.y),false);assert.equal(normalized.rulesVersion,11);
      assert.deepEqual(normalized.positionBudget,before.positionBudget);assert.deepEqual(normalized.score,before.score);
      assert.equal(normalized.phase,before.phase);assert.equal(normalized.turn,before.turn);assert.equal(normalized.minutes,before.minutes);
      assert.equal(normalized.randomState,before.randomState);assert.deepEqual(normalized.log,before.log);
      for(const p of before.pieces.filter(p=>p.id!==king.id))assert.deepEqual(normalized.pieces.find(q=>q.id===p.id),p);
      assert.deepEqual(clone(state),before);assert.deepEqual(E.normalizeGame(clone(normalized)),normalized);assertIntegrity(normalized);
    }
  });

  test(`${team}: occupied migration destinations are preserved and remaining equal-distance choices rotate with the team`,()=>{
    const state=fixture({team,positions:{'white-K':[5,0],'white-P1':[5,2],'white-R2':[3,0]}}),before=clone(state);
    const normalized=E.normalizeGame(state),king=piece(normalized,'white-K',team);
    assert.deepEqual({x:king.x,y:king.y},pointFor([4,2],team));
    assert.deepEqual(piece(normalized,'white-P1',team),piece(before,'white-P1',team));
    assert.deepEqual(piece(normalized,'white-R2',team),piece(before,'white-R2',team));assertIntegrity(normalized);
  });

  test(`${team}: repair follows a king carrying the ball or taking a protected restart`,()=>{
    for(const restart of [false,true]){
      const state=fixture({team,carrier:'white-K',positions:{'white-K':[5,0]}});
      if(restart)state.restart={type:'offside',team,takerId:state.ball.carrierId,spot:{x:state.ball.x,y:state.ball.y},indirect:true};
      const before=clone(state),normalized=E.normalizeGame(state),point=pointFor([5,2],team);
      assert.deepEqual(normalized.ball,{...point,carrierId:idFor('white-K',team)});
      if(restart){assert.deepEqual(normalized.restart.spot,point);assert.equal(normalized.restart.takerId,before.restart.takerId);assert.deepEqual(E.legalMoves(normalized,normalized.restart.takerId),[]);}
      assert.deepEqual(normalized.positionBudget,before.positionBudget);assert.equal(normalized.randomState,before.randomState);assertIntegrity(normalized);
    }
  });

  test(`${team}: pending-shot repairs preserve the declared origin and refresh cached odds, including a legacy king shooter`,()=>{
    for(const carrier of ['white-R1','white-K']){
      const state=fixture({team,phase:'kick',carrier,positions:{'white-K':[5,0]}}),target=pointFor(carrier==='white-K'?[5,-1]:[4,-1],team);
      const pending=E.applyKick(state,target.x,target.y);assert.equal(pending.phase,'keeperReact');
      pending.rulesVersion=10;pending.lastAction.shotModel={stale:true};pending.lastAction.probability=1;
      const before=clone(pending),normalized=E.normalizeGame(pending);
      assert.deepEqual(normalized.pendingShot,before.pendingShot);assert.deepEqual(normalized.lastAction.from,before.lastAction.from);
      assert.deepEqual(normalized.lastAction.shotModel,E.shotModel(normalized));
      assert.deepEqual(normalized.lastAction.shotModel.origin,before.pendingShot.from);
      assert.equal(normalized.lastAction.probability,E.shotModel(normalized).probability);
      if(carrier==='white-K')assert.deepEqual(normalized.ball,{...pointFor([5,2],team),carrierId:idFor('white-K',team)});
      assert.equal(normalized.randomState,before.randomState);assert.deepEqual(pending,before);
      assert.deepEqual(E.normalizeGame(clone(normalized)),normalized);assertIntegrity(normalized);
    }
  });
}

test('both illegally placed kings can be repaired together without overlap or moving other players',()=>{
  const state=fixture({positions:{'white-K':[5,0],'black-K':[6,14]}}),before=clone(state),normalized=E.normalizeGame(state);
  assert.deepEqual({x:piece(normalized,'white-K','white').x,y:piece(normalized,'white-K','white').y},{x:5,y:2});
  assert.deepEqual({x:piece(normalized,'black-K','white').x,y:piece(normalized,'black-K','white').y},{x:6,y:12});
  for(const p of before.pieces.filter(p=>p.type!=='K'))assert.deepEqual(normalized.pieces.find(q=>q.id===p.id),p);
  assert.equal(normalized.randomState,before.randomState);assertIntegrity(normalized);
});
