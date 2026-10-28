import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../dist/engine.js';

const fresh=()=>({normalUsed:false,pawnUsed:false,dribbleUsed:false});
const other=team=>team==='white'?'black':'white';
const rotate=(spot,team)=>team==='white'?spot:{x:E.BOARD_WIDTH-1-spot.x,y:E.BOARD_HEIGHT-1-spot.y};
const point=piece=>({x:piece.x,y:piece.y});
const piece=(state,id)=>state.pieces.find(p=>p.id===id);

function pending(team='white',side='left',{friendly=false,crowded=false,vacated=false}={}) {
  const state=E.createGame({mode:'watch',seed:61021,kickoff:team,foulsEnabled:true});
  const localCorner={x:side==='left'?0:E.BOARD_WIDTH-1,y:0},spot=rotate(localCorner,team);
  const owner=friendly?team:other(team),occupantId=owner+'-P1',takerId=team+'-Q';
  const horizontal=localCorner.x===0?1:-1;
  const assignments=new Map([
    [takerId,vacated?{x:localCorner.x,y:1}:{x:3,y:5}],
    [occupantId,localCorner],
    [team+'-K',{x:6,y:15}],
    [other(team)+'-K',{x:7,y:1}],
  ]);
  const blockers=crowded?[{x:localCorner.x+horizontal,y:0},{x:localCorner.x+horizontal,y:1},...(!vacated?[{x:localCorner.x,y:1}]:[])]:[];
  const available=state.pieces.filter(p=>!assignments.has(p.id));
  for(const [i,spot] of blockers.entries()) assignments.set(available[i].id,spot);
  const used=new Set([...assignments.values()].map(p=>`${p.x},${p.y}`));
  for(const p of state.pieces) {
    let at=assignments.get(p.id);
    if(!at) {
      outer:for(let y=6;y<=14;y++) for(let x=2;x<=11;x++) {
        const candidate={x,y},actual=rotate(candidate,team);
        if(!used.has(`${x},${y}`)&&E.canOccupySquare(p,actual.x,actual.y)) {at=candidate;break outer;}
      }
    }
    assert.ok(at,p.id);used.add(`${at.x},${at.y}`);Object.assign(p,rotate(at,team));
  }
  Object.assign(state,{attack:team,phase:'cornerSelect',ball:{...spot,carrierId:null},
    positionBudget:fresh(),restart:{type:'corner',team,takerId:null,spot,indirect:false},
    pendingShot:null,offside:null,passRun:null,looseBallKickOrigin:null,lastAction:null});
  state.discipline[occupantId]={yellowCards:1,redCard:false};
  return {state,spot,occupantId,takerId};
}
function integrity(state) {
  assert.equal(state.pieces.length,22);
  assert.equal(new Set(state.pieces.map(p=>p.id)).size,22);
  assert.equal(new Set(state.pieces.map(p=>`${p.x},${p.y}`)).size,22);
  for(const p of state.pieces)assert.ok(E.canOccupySquare(p,p.x,p.y),p.id);
  assert.deepEqual(point(piece(state,state.ball.carrierId)),point(state.ball));
}

for(const team of ['white','black'])for(const side of ['left','right'])for(const friendly of [false,true]) {
  test(`${team} ${side}: ${friendly?'friendly':'opponent'} occupant steps aside for a different corner taker`,()=>{
    const {state,spot,occupantId,takerId}=pending(team,side,{friendly}),before=structuredClone(state);
    const result=E.selectCornerTaker(state,takerId),clear=result.restart.clearance;
    assert.deepEqual(state,before,'selection never mutates its undo source');
    assert.deepEqual(point(piece(result,takerId)),spot);
    assert.deepEqual(result.ball,{...spot,carrierId:takerId});
    assert.equal(clear.pieceId,occupantId);assert.deepEqual(clear.from,spot);
    assert.deepEqual(point(piece(result,occupantId)),clear.to);
    assert.equal(Math.hypot(clear.to.x-spot.x,clear.to.y-spot.y),1,'use a nearest vacant legal square');
    for(const p of result.pieces.filter(p=>![takerId,occupantId].includes(p.id)))assert.deepEqual(p,piece(before,p.id));
    assert.deepEqual(result.discipline,before.discipline,'stepping away is not a foul or tackle');
    assert.deepEqual(result.score,before.score);assert.equal(result.randomState,before.randomState);
    assert.equal(result.turn,before.turn);assert.equal(result.phase,'attackMove');
    assert.deepEqual(result.positionBudget,fresh(),'neither positioning allowance is spent');
    assert.deepEqual(result.lastAction.restart.clearance,clear);
    assert.match(result.log.join('\n'),/steps away/);
    assert.deepEqual(E.legalMoves(result,takerId),[],'the selected taker stays locked');
    assert.deepEqual(E.normalizeGame(structuredClone(result)),result,'save/restore retains the clearance');
    assert.deepEqual(E.selectCornerTaker(structuredClone(state),takerId),result,'replaying selection is deterministic');
    integrity(result);
  });
}

for(const team of ['white','black'])test(`${team}: crowded corner uses the chosen player's newly vacated square`,()=>{
  const {state,spot,occupantId,takerId}=pending(team,'left',{crowded:true,vacated:true});
  const origin=point(piece(state,takerId)),result=E.selectCornerTaker(state,takerId);
  assert.deepEqual(result.restart.clearance.to,origin);
  assert.deepEqual(point(piece(result,takerId)),spot);assert.deepEqual(point(piece(result,occupantId)),origin);
  integrity(result);
});

for(const team of ['white','black'])test(`${team}: a fully crowded adjacent ring clears to the nearest legal square further away`,()=>{
  const {state,spot,occupantId,takerId}=pending(team,'right',{crowded:true}),before=structuredClone(state);
  const result=E.selectCornerTaker(state,takerId),to=result.restart.clearance.to;
  assert.equal(Math.hypot(to.x-spot.x,to.y-spot.y),2);
  assert.deepEqual(point(piece(result,occupantId)),to);
  assert.deepEqual(result.positionBudget,fresh());assert.equal(result.randomState,before.randomState);
  integrity(result);
});

for(const team of ['white','black'])test(`${team}: choosing the player already at the flag does not move another player`,()=>{
  const {state,spot,occupantId}=pending(team,'left',{friendly:true}),before=structuredClone(state);
  const result=E.selectCornerTaker(state,occupantId);
  assert.equal(result.restart.clearance,undefined);assert.deepEqual(result.pieces,before.pieces);
  assert.deepEqual(result.ball,{...spot,carrierId:occupantId});integrity(result);
});

for(const team of ['white','black'])test(`${team}: selection timeout clears an occupied flag without an additional random draw`,()=>{
  const {state,spot,occupantId}=pending(team,'right');
  const result=E.actionTimeout(state);
  assert.equal(result.phase,'attackMove');assert.deepEqual(point(result.ball),spot);
  assert.equal(result.restart.clearance.pieceId,occupantId);
  assert.equal(result.randomState,state.randomState);assert.deepEqual(result.positionBudget,fresh());
  integrity(result);
});

for(const team of ['white','black'])test(`${team}: automatic fallback also clears the flag when no teammate is in the attacking half`,()=>{
  const state=E.createGame({mode:'local',kickoff:team,seed:441}),spot=rotate({x:0,y:0},team),occupantId=other(team)+'-P1';
  Object.assign(piece(state,occupantId),spot);
  Object.assign(state,{attack:team,phase:'cornerSelect',ball:{...spot,carrierId:null},positionBudget:fresh(),
    restart:{type:'corner',team,takerId:null,spot,indirect:false},pendingShot:null,offside:null,passRun:null,lastAction:null});
  assert.deepEqual(E.cornerTakers(state),[]);
  const before=structuredClone(state),result=E.normalizeGame(state);
  assert.deepEqual(state,before);assert.equal(result.restart.cornerFallback,true);
  assert.equal(result.restart.clearance.pieceId,occupantId);
  assert.deepEqual(point(result.ball),spot);assert.equal(result.randomState,before.randomState);
  assert.deepEqual(result.positionBudget,fresh());integrity(result);
});

// Corner clearance uses legal-square rules even when the occupant is a king
// outside its box. It never grants the king access to the opposite box.
for(const team of ['white','black'])test(`${team}: a goalkeeper at the flag also moves to a legal ordinary square`,()=>{
  const {state,spot,takerId,occupantId}=pending(team,'left',{friendly:true});
  const keeper=piece(state,team+'-K'),pawn=piece(state,occupantId),oldKing=point(keeper);
  Object.assign(keeper,spot);Object.assign(pawn,oldKing);
  const result=E.selectCornerTaker(state,takerId);
  assert.equal(result.restart.clearance.pieceId,keeper.id);
  assert.ok(E.canOccupySquare(piece(result,keeper.id),result.restart.clearance.to.x,result.restart.clearance.to.y));
  assert.deepEqual(point(result.ball),spot);integrity(result);
});
