import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as E from '/workspace/scratch/43be99f43c82/tactical-half-hour-20261017/defense-candidate/engine.mjs';

// Inspect evaluation without adding a gameplay/debug export to the engine.
const source = await readFile(new URL('/workspace/scratch/43be99f43c82/tactical-half-hour-20261017/defense-candidate/engine.mjs', import.meta.url), 'utf8');
const internal = await import(`data:text/javascript;base64,${Buffer.from(source + '\nexport {wideCrossingSupport,wideAttackValue,kickValue};').toString('base64')}`);
const other = team => team === 'white' ? 'black' : 'white';
const positions = {
  'white-K': [6,16], 'white-Q': [10,10], 'white-R1': [1,6], 'white-R2': [0,16],
  'white-B1': [0,12], 'white-B2': [0,14], 'white-N1': [1,13], 'white-N2': [1,11],
  'white-P1': [1,16], 'white-P2': [0,15], 'white-P3': [1,15],
  'black-K': [7,0], 'black-Q': [13,16], 'black-R1': [12,16], 'black-R2': [11,16],
  'black-B1': [12,15], 'black-B2': [11,15], 'black-N1': [12,14], 'black-N2': [13,14],
  'black-P1': [11,1], 'black-P2': [10,16], 'black-P3': [10,14]
};
function fixture({carrier = 'white-R1', changes = {}, pawnUsed = false} = {}) {
  const state = E.createGame({seed:17});
  for (const piece of state.pieces) [piece.x, piece.y] = changes[piece.id] || positions[piece.id];
  const owner = state.pieces.find(piece => piece.id === carrier);
  Object.assign(state, {phase:'attackMove', attack:'white', ball:{x:owner.x,y:owner.y,carrierId:owner.id},
    positionBudget:{normalUsed:false,pawnUsed,dribbleUsed:true}, restart:null, offside:null,
    pendingShot:null, paceControl:null, ballProgress:{team:'white',anchorY:owner.y,rounds:0,pendingRelease:false,excludeRelease:false}});
  assert.equal(new Set(state.pieces.map(piece => `${piece.x},${piece.y}`)).size, 22);
  assert.ok(state.pieces.every(piece => E.canOccupySquare(piece, piece.x, piece.y)));
  return state;
}
function mirror(state) {
  const result = structuredClone(state), id = value => value.replace(/^(white|black)/, other);
  result.attack = other(state.attack);
  result.pieces = state.pieces.map(piece => ({...piece,id:id(piece.id),team:other(piece.team),x:E.BOARD_WIDTH-1-piece.x,y:E.BOARD_HEIGHT-1-piece.y}));
  result.ball = {...state.ball,x:E.BOARD_WIDTH-1-state.ball.x,y:E.BOARD_HEIGHT-1-state.ball.y,carrierId:id(state.ball.carrierId)};
  result.ballProgress = {...state.ballProgress,team:result.attack,anchorY:result.ball.y};
  return result;
}
const carrier = state => state.pieces.find(piece => piece.id === state.ball.carrierId);
const support = state => internal.wideCrossingSupport(state, carrier(state));
const kickTo = (state, pieceId) => E.legalKicks({...state,phase:'kick'}).find(kick => kick.receiverId === pieceId);
function bestReactedFinish(state) {
  let best = 0;
  for (const kick of E.legalKicks({...state,phase:'kick'}).filter(kick => kick.goal === state.attack)) {
    const pending = E.applyKick({...state,phase:'kick'},kick.x,kick.y,{disguise:!!kick.disguise});
    const keeper = pending.pieces.find(piece => piece.type === 'K' && piece.team !== state.attack);
    const chances = [E.shotChance(pending),...E.legalMoves(pending,keeper.id).map(move => E.shotChance(pending,kick.x,kick.y,move))];
    best = Math.max(best,Math.min(...chances));
  }
  return best;
}

test('Tactical completes a real central supporting run for an isolated wide carrier, either colour', () => {
  const original = fixture();
  for (let state of [original,mirror(original)]) {
    const team = state.attack;
    assert.equal(support(state).best,0);
    for (let actionCount=0; state.phase==='attackMove' && actionCount<4; actionCount++) {
      const snapshot = structuredClone(state), action = E.chooseAIAction(state,{difficulty:'tactical'});
      assert.deepEqual(state,snapshot,'planning does not mutate the original board');
      if (action.type === 'move') {
        assert.ok(E.legalMoves(state,action.pieceId,{freePawn:!!action.freePawn}).some(move => move.x===action.x && move.y===action.y));
        state = E.applyMove(state,action.pieceId,action.x,action.y,{freePawn:!!action.freePawn});
      } else state = E.skipMove(state);
    }
    assert.equal(state.phase,'defendMove');
    assert.equal(state.ball.carrierId,`${team}-R1`);
    const receiver = state.pieces.find(piece => piece.id === `${team}-Q`);
    assert.ok(Math.abs(receiver.x-E.BOARD_CENTER_X)<=2.5,'the supporting runner reaches the centre');
    const cross = kickTo(state,receiver.id);
    assert.ok(cross && !cross.offside && cross.accuracy===1,'the runner is a real legal receiving target');
    const received = E.applyKick({...state,phase:'kick'},cross.x,cross.y,{roll:0});
    assert.equal(received.ball.carrierId,receiver.id);
    assert.ok(bestReactedFinish(received)>0.05,'the central delivery creates a genuine finish');
  }
});

test('cross support respects rook, bishop and knight passing geometry instead of mere central proximity', () => {
  const cases = [
    {carrier:'white-R1',changes:{'white-R1':[1,4],'white-Q':[6,4]}},
    {carrier:'white-B1',changes:{'white-B1':[1,7],'white-Q':[6,2]}},
    {carrier:'white-N1',changes:{'white-N1':[3,4],'white-Q':[5,3]}}
  ];
  for (const options of cases) for (const state of [fixture(options),mirror(fixture(options))]) {
    const receiverId = `${state.attack}-Q`;
    assert.ok(kickTo(state,receiverId));
    assert.ok(support(state).best>0);
    const receiver = state.pieces.find(piece => piece.id===receiverId);
    const wrong = structuredClone(state);
    Object.assign(wrong.pieces.find(piece => piece.id===receiverId),{x:receiver.x,y:receiver.y+(state.attack==='white'?1:-1)});
    assert.equal(kickTo(wrong,receiverId),undefined);
    assert.equal(support(wrong).best,0,'a nearby central piece outside the actual passing pattern cannot receive a cross');
  }
});

test('friendly and opposing intervening pieces invalidate a ray cross', () => {
  for (const blocker of ['white-N1','black-N1']) {
    const original = fixture({changes:{'white-R1':[1,4],'white-Q':[6,4],[blocker]:[3,4]}});
    for (const state of [original,mirror(original)]) {
      assert.equal(kickTo(state,`${state.attack}-Q`),undefined);
      assert.equal(support(state).best,0);
    }
  }
});

test('offside forward receivers do not count; an onside central cutback behind the ball does', () => {
  const offside = fixture({carrier:'white-B1',changes:{'white-B1':[1,7],'white-Q':[6,2],'black-P1':[11,5]}});
  const cutback = fixture({carrier:'white-B1',changes:{'white-B1':[1,2],'white-Q':[5,6],'black-P1':[11,5]}});
  for (const state of [offside,mirror(offside)]) {
    assert.ok(kickTo(state,`${state.attack}-Q`)?.offside);
    assert.equal(support(state).best,0);
  }
  for (const state of [cutback,mirror(cutback)]) {
    assert.equal(kickTo(state,`${state.attack}-Q`)?.offside,false);
    assert.ok(support(state).best>0);
  }
});

test('a long pass wide values an existing central delivery while retaining its accuracy penalty', () => {
  const supported = fixture({carrier:'white-B2',changes:{'white-B2':[12,15],'black-B1':[13,10],'white-R1':[1,4],'white-Q':[6,4]}});
  const isolated = fixture({carrier:'white-B2',changes:{'white-B2':[12,15],'black-B1':[13,10],'white-R1':[1,4],'white-Q':[6,5]}});
  for (const [good,bad] of [[supported,isolated],[mirror(supported),mirror(isolated)]]) {
    const crossSetup = kickTo(good,`${good.attack}-R1`), blindWide = kickTo(bad,`${bad.attack}-R1`);
    assert.ok(crossSetup && blindWide && crossSetup.accuracy<1);
    const value = internal.kickValue(good,crossSetup,good.attack);
    assert.ok(value>internal.kickValue(bad,blindWide,bad.attack),'the wide receiver has someone useful to cross to');
    assert.ok(value<internal.kickValue(good,{...crossSetup,accuracy:1},good.attack),'the incoming eleven-square pass remains less reliable');
  }
});
