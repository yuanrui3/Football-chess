import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../dist/engine.js';
import {createMatchClock, settleMatchClock} from '../dist/match-clock.js';

const other = team => team === 'white' ? 'black' : 'white';
const budget = () => ({normalUsed:false,pawnUsed:false,dribbleUsed:false});
const mirror = ([x,y], team) => team === 'white' ? [x,y] : [E.BOARD_WIDTH-1-x,E.BOARD_HEIGHT-1-y];
const clone = value => structuredClone(value);

// Start with a real, full squad. The defending rook's inaccurate long pass
// crosses its own end line and awards the attacking team a corner.
function cornerFixture(team='white', {positions={}, noCandidates=false, occupiedCorner=false}={}) {
  const state=E.createGame({mode:'local',seed:61873}), defending=other(team);
  const base={
    [`${team}-K`]:[6,16], [`${defending}-K`]:[6,0], [`${defending}-R1`]:[2,13],
    [`${team}-Q`]:noCandidates?[4,10]:[3,5],
    ...(occupiedCorner?{[`${defending}-P3`]:[0,0]}:{}), ...positions
  };
  const used=new Set(Object.values(base).map(p=>p.join(',')));
  const parking=Array.from({length:E.BOARD_HEIGHT},(_,i)=>E.BOARD_HEIGHT-1-i)
    .flatMap(y=>[0,1,10,11,12,13,3].map(x=>[x,y]))
    .filter(([x,y])=>x!==2 && !E.isBox(x,y));
  for (const piece of state.pieces) {
    const point=base[piece.id] || parking.find(([x,y])=>!used.has(`${x},${y}`) && (piece.team!==team || !noCandidates || y>=E.MIDFIELD_RANK));
    assert.ok(point,`parking for ${piece.id}`); used.add(point.join(','));
    [piece.x,piece.y]=mirror(point,team);
  }
  // Positions above are expressed in the selected attacker's orientation.
  // IDs already refer to their actual teams, so only coordinates rotate.
  const rook=state.pieces.find(piece=>piece.id===`${defending}-R1`);
  state.attack=defending;state.phase='kick';state.positionBudget=budget();
  state.ball={x:rook.x,y:rook.y,carrierId:rook.id};state.restart=null;state.offside=null;
  const target=mirror([2,1],team), landing=mirror([2,-3],team);
  const kick=E.legalKicks(state).find(k=>k.x===target[0]&&k.y===target[1]);
  assert.ok(kick && kick.distance>10 && kick.accuracy<1);
  const awarded=E.applyKick(state,...target,{roll:.999999,landing:{x:landing[0],y:landing[1]}});
  assert.equal(awarded.restart.type,'corner');assert.equal(awarded.restart.team,team);
  return {before:state,awarded};
}

function checkRoster(state) {
  assert.equal(new Set(state.pieces.map(p=>p.id)).size,state.pieces.length);
  assert.equal(new Set(state.pieces.map(p=>`${p.x},${p.y}`)).size,state.pieces.length);
  for (const piece of state.pieces) assert.ok(E.canOccupySquare(piece,piece.x,piece.y),`${piece.id} has a legal square`);
  const carrier=state.pieces.find(p=>p.id===state.ball.carrierId);
  if (carrier) assert.deepEqual({x:state.ball.x,y:state.ball.y},{x:carrier.x,y:carrier.y});
}

for (const team of ['white','black']) {
  test(`${team}: corner chooser offers every active piece type strictly in the attacking half`,()=>{
    const positions={
      [`${team}-K`]:[1,5],[`${team}-Q`]:[3,5],[`${team}-R1`]:[4,5],
      [`${team}-B1`]:[5,5],[`${team}-N1`]:[6,5],[`${team}-P1`]:[7,5],
      [`${team}-R2`]:[4,8],[`${team}-B2`]:[5,9],[`${team}-N2`]:[6,10],
      [`${team}-P2`]:[7,11],[`${team}-P3`]:[8,12]
    };
    const {before,awarded}=cornerFixture(team,{positions});
    assert.equal(awarded.phase,'cornerSelect');assert.equal(E.currentTeam(awarded),team);
    assert.equal(awarded.ball.carrierId,null);assert.equal(awarded.restart.takerId,null);
    assert.deepEqual(awarded.pieces,before.pieces,'award does not relocate a player before selection');
    const snapshot=clone(awarded), candidates=E.cornerTakers(awarded);
    assert.deepEqual(candidates.map(p=>p.id).sort(),['K','Q','R1','B1','N1','P1'].map(s=>`${team}-${s}`).sort());
    assert.deepEqual([...new Set(candidates.map(p=>p.type))].sort(),E.TYPES.slice().sort());
    assert.deepEqual(awarded,snapshot,'candidate previews do not mutate the state');
    for (const piece of awarded.pieces) assert.deepEqual(E.legalMoves(awarded,piece.id),[]);
    assert.deepEqual(E.legalKicks(awarded),[]);
    for (const invalid of [`${team}-R2`,`${team}-B2`,`${other(team)}-Q`,'missing']) {
      assert.throws(()=>E.selectCornerTaker(awarded,invalid));
      assert.deepEqual(awarded,snapshot,'invalid selection leaves its undo snapshot intact');
    }
    for (const candidate of candidates) {
      const next=E.selectCornerTaker(awarded,candidate.id);
      assert.equal(next.phase,'attackMove');assert.equal(next.attack,team);
      assert.equal(next.restart.takerId,candidate.id);assert.equal(next.ball.carrierId,candidate.id);
      assert.deepEqual(next.positionBudget,budget(),'selection is not a positioning move');
      assert.equal(next.randomState,awarded.randomState,'selection uses no randomness');
      assert.equal(next.turn,awarded.turn,'selection is part of the same restart');
      const corner=mirror([0,0],team);
      assert.deepEqual({x:next.ball.x,y:next.ball.y},{x:corner[0],y:corner[1]});
      for (const piece of next.pieces.filter(p=>p.id!==candidate.id)) assert.deepEqual(piece,awarded.pieces.find(p=>p.id===piece.id));
      assert.deepEqual(awarded,snapshot,'selection preserves the input');checkRoster(next);
    }
  });

  test(`${team}: chosen corner taker remains locked through a full protected positioning round`,()=>{
    const {awarded}=cornerFixture(team), chosen=E.cornerTakers(awarded).find(p=>p.type==='Q');
    let state=E.selectCornerTaker(awarded,chosen.id);
    const restart=clone(state.restart), ball=clone(state.ball);
    for (const phase of ['attackMove','defendMove']) {
      assert.equal(state.phase,phase);assert.deepEqual(E.legalMoves(state,chosen.id),[]);
      assert.deepEqual(E.legalMoves(state,chosen.id,{freePawn:true}),[]);assert.deepEqual(E.legalKicks(state),[]);
      for (const p of state.pieces) assert.equal(E.legalMoves(state,p.id).some(m=>m.type==='tackle'),false);
      state=E.skipMove(state);assert.deepEqual(state.restart,restart);assert.deepEqual(state.ball,ball);
    }
    assert.equal(state.phase,'kick');assert.ok(E.legalKicks(state).length);
    assert.throws(()=>E.selectCornerTaker(state,chosen.id),'an established taker cannot be reselected');
  });

  test(`${team}: occupied corner relocates only the selected taker to the nearest legal vacant square`,()=>{
    const {awarded}=cornerFixture(team,{occupiedCorner:true}), selected=E.cornerTakers(awarded).find(p=>p.type==='Q');
    const next=E.selectCornerTaker(awarded,selected.id), corner=mirror([0,0],team);
    assert.notDeepEqual([next.ball.x,next.ball.y],corner);
    assert.equal(Math.hypot(next.ball.x-corner[0],next.ball.y-corner[1]),1);
    for (const p of next.pieces.filter(p=>p.id!==selected.id)) assert.deepEqual(p,awarded.pieces.find(q=>q.id===p.id));
    checkRoster(next);
  });

  test(`${team}: no attacking-half candidate retains a deterministic automatic nearest-player fallback`,()=>{
    const {before,awarded}=cornerFixture(team,{noCandidates:true});
    assert.equal(awarded.phase,'attackMove');assert.ok(awarded.restart.takerId);
    assert.equal(awarded.ball.carrierId,awarded.restart.takerId);
    const spot=mirror([0,0],team), expected=before.pieces.filter(p=>p.team===team)
      .sort((a,b)=>Math.hypot(a.x-spot[0],a.y-spot[1])-Math.hypot(b.x-spot[0],b.y-spot[1])||a.id.localeCompare(b.id))[0];
    assert.equal(awarded.restart.takerId,expected.id);assert.deepEqual(E.cornerTakers(awarded),[]);checkRoster(awarded);
  });

  test(`${team}: candidate selection and automatic action timeout survive save/Undo without extra draws`,()=>{
    const {awarded}=cornerFixture(team), snapshot=clone(awarded), restored=E.normalizeGame(clone(awarded));
    assert.deepEqual(restored,awarded);assert.equal(restored.phase,'cornerSelect');
    const timed=E.actionTimeout(awarded);assert.equal(timed.phase,'attackMove');
    assert.equal(timed.restart.type,'corner');assert.equal(timed.restart.team,team);
    assert.ok(E.cornerTakers(awarded).some(p=>p.id===timed.restart.takerId));
    assert.equal(timed.randomState,awarded.randomState);assert.equal(timed.turn,awarded.turn);
    assert.deepEqual(E.actionTimeout(restored),timed,'save restoration retains deterministic selection');
    assert.deepEqual(E.normalizeGame(snapshot),awarded,'undo recovers the pending chooser');
    assert.deepEqual(awarded,snapshot);checkRoster(timed);
  });

  test(`${team}: dismissed pieces cannot be corner candidates even when their last square was attacking`,()=>{
    const {awarded}=cornerFixture(team), removed=awarded.pieces.find(p=>p.id===`${team}-Q`);
    awarded.pieces=awarded.pieces.filter(p=>p.id!==removed.id);awarded.sentOff=[{...removed,reason:'red',yellowCards:0}];
    awarded.discipline[removed.id]={yellowCards:0,redCard:true};
    assert.equal(E.cornerTakers(awarded).some(p=>p.id===removed.id),false);
    assert.throws(()=>E.selectCornerTaker(awarded,removed.id));
  });

  test(`${team}: selecting a rook retains the corner's one-player loft and direct-receipt offside exemption`,()=>{
    const positions={[`${team}-R1`]:[3,5],[`${team}-N1`]:[4,0],[`${other(team)}-P1`]:[1,0]};
    const {awarded}=cornerFixture(team,{positions});
    let ready=E.selectCornerTaker(awarded,`${team}-R1`);
    ready=E.skipMove(E.skipMove(ready));
    const target=mirror([4,0],team), pass=E.legalKicks(ready).find(k=>k.x===target[0]&&k.y===target[1]);
    assert.ok(pass?.lofted);assert.equal(pass.bypassedPieceId,`${other(team)}-P1`);
    assert.equal(pass.receiverId,`${team}-N1`);assert.equal(pass.offside,false);
    const received=E.applyKick(ready,...target,{roll:0});
    assert.equal(received.ball.carrierId,`${team}-N1`);assert.equal(received.offside,null);
    assert.equal(received.restart,null);assert.equal(received.lastAction.outcome,'complete');checkRoster(received);
  });

  test(`${team}: a saved chooser falls back safely if its final eligible taker was dismissed`,()=>{
    const {awarded}=cornerFixture(team), removed=awarded.pieces.find(p=>p.id===`${team}-Q`);
    awarded.pieces=awarded.pieces.filter(p=>p.id!==removed.id);awarded.sentOff=[{...removed,reason:'red',yellowCards:0}];
    awarded.discipline[removed.id]={yellowCards:0,redCard:true};
    assert.deepEqual(E.cornerTakers(awarded),[]);
    const before=clone(awarded), restored=E.normalizeGame(awarded);
    assert.equal(restored.phase,'attackMove');assert.equal(restored.restart.type,'corner');
    assert.equal(restored.restart.cornerFallback,true);assert.ok(restored.restart.takerId);
    assert.equal(restored.randomState,awarded.randomState);assert.deepEqual(awarded,before);
    assert.ok(!restored.pieces.some(p=>p.id===removed.id));checkRoster(restored);
  });

  test(`${team}: corner selection does not alter fixed-80-percent penalty takers or outcomes`,()=>{
    const {awarded}=cornerFixture(team,{positions:{[`${team}-P1`]:[6,2]}}), taker=awarded.pieces.find(p=>p.id===`${team}-P1`);
    const penalty={...awarded,phase:'kick',ball:{x:taker.x,y:taker.y,carrierId:taker.id},restart:{type:'penalty',team,takerId:taker.id,spot:{x:taker.x,y:taker.y},indirect:false}};
    assert.deepEqual(E.cornerTakers(penalty),[]);assert.throws(()=>E.selectCornerTaker(penalty,taker.id));
    const kicks=E.legalKicks(penalty);assert.equal(kicks.length,4);
    for(const kick of kicks){
      const pending=E.applyKick(penalty,kick.x,kick.y);
      assert.equal(E.shotModel(pending).goalProbability,.8);
      assert.equal(E.skipMove(pending,{roll:.799999}).lastAction.type,'goal');
      assert.equal(E.skipMove(pending,{roll:.8}).lastAction.type,'save');
    }
  });
}

test('existing selected corners do not regain a chooser when saved games are normalized',()=>{
  const {awarded}=cornerFixture(), chosen=E.selectCornerTaker(awarded,'white-Q');
  const before=clone(chosen);assert.deepEqual(E.normalizeGame(chosen),chosen);assert.deepEqual(chosen,before);
  assert.deepEqual(E.cornerTakers(chosen),[]);assert.throws(()=>E.selectCornerTaker(chosen,'white-Q'));
});

test('a corner created by the final declared shot does not grant another shot after full time',()=>{
  const {awarded}=cornerFixture(), before={...clone(awarded),phase:'keeperReact',restart:null,attack:'white'};
  const clock={...createMatchClock({remaining:0}),fullTimePending:true,finalChance:{team:'white',phase:'shot'}};
  const result=settleMatchClock(clock,before,awarded);
  assert.equal(result.finish,true);assert.equal(result.clock.finalChance,null);
});

for (const team of ['white','black']) for (const invalidSpot of [undefined,{x:-100,y:999}]) {
  test(`${team}: an incomplete saved corner spot is repaired without consuming a choice or randomness (${invalidSpot?'outside':'missing'})`,()=>{
    const {awarded}=cornerFixture(team), saved=clone(awarded);
    saved.restart.spot=invalidSpot;saved.restart.indirect=true;
    saved.ball.x=E.BOARD_WIDTH-1;
    saved.passRun={team,pieceId:`${team}-Q`};
    saved.looseBallKickOrigin={team,pieceId:`${team}-Q`};
    saved.offside={team,flaggedIds:[`${team}-Q`]};
    const before=clone(saved), restored=E.normalizeGame(saved);
    assert.deepEqual(saved,before);assert.equal(restored.randomState,saved.randomState);
    assert.equal(restored.phase,'cornerSelect');assert.equal(restored.restart.takerId,null);
    assert.deepEqual(restored.restart.spot,{x:E.BOARD_WIDTH-1,y:team==='white'?0:E.BOARD_HEIGHT-1});
    assert.deepEqual(restored.ball,{...restored.restart.spot,carrierId:null});
    assert.equal(restored.restart.indirect,false);assert.equal(restored.passRun,null);
    assert.equal(restored.looseBallKickOrigin,null);assert.equal(restored.offside,null);
    assert.ok(E.cornerTakers(restored).length>0);checkRoster(restored);
  });
}
