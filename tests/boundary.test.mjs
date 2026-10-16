import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BOARD_WIDTH, BOARD_HEIGHT, GOAL_FILES, BOX_DEPTH, inOwnBox, canOccupySquare, isBox, createGame, currentTeam,
  legalMoves, legalKicks, applyMove, applyKick, skipMove, boundaryExit, cornerTakers, selectCornerTaker,
} from '../dist/engine.js';

const clone = value => JSON.parse(JSON.stringify(value));
const freshBudget = () => ({ normalUsed: false, pawnUsed: false, dribbleUsed: false });
const mirror = ([x, y]) => [BOARD_WIDTH - 1 - x, BOARD_HEIGHT - 1 - y];
const inside = ({x, y}) => x >= 0 && x < BOARD_WIDTH && y >= 0 && y < BOARD_HEIGHT;

// Keep all 22 players in every scenario; park uninvolved players far from the
// restart, reserving the actual passing rays so incidental blockers cannot
// change what the fixture exercises.
function fixture({attack = 'white', carrier = `${attack}-R1`, positions = {}, clear = [], focus = [0, 7], phase = 'kick', seed = 929} = {}) {
  const state = createGame({mode: 'local', kickoff: attack, seed});
  const assigned = {'white-K': [4, 14], 'black-K': [7, 0], [carrier]: [2, 13], ...positions};
  const occupied = new Set(Object.values(assigned).map(([x, y]) => `${x},${y}`));
  assert.equal(occupied.size, Object.keys(assigned).length, 'fixture assignments do not overlap');
  const reserved = new Set([...occupied, ...clear.map(([x, y]) => `${x},${y}`)]);
  const parking = Array.from({length: BOARD_HEIGHT}, (_, y) => Array.from({length: BOARD_WIDTH}, (_, x) => [x, y])).flat()
    .filter(([x, y]) => !isBox(x, y))
    .sort((a, b) => Math.hypot(b[0] - focus[0], b[1] - focus[1]) - Math.hypot(a[0] - focus[0], a[1] - focus[1]) || a[1] - b[1] || a[0] - b[0]);
  for (const piece of state.pieces) {
    const position = assigned[piece.id] || parking.find(([x, y]) => !reserved.has(`${x},${y}`));
    assert.ok(position, `parking exists for ${piece.id}`);
    [piece.x, piece.y] = position;
    reserved.add(`${piece.x},${piece.y}`);
  }
  const owner = state.pieces.find(piece => piece.id === carrier);
  state.attack = attack;
  state.phase = phase;
  state.positionBudget = freshBudget();
  state.ball = {x: owner.x, y: owner.y, carrierId: carrier};
  state.restart = null;
  state.pendingShot = null;
  state.releaseReason = null;
  return state;
}

function assertIntegrity(state) {
  assert.equal(state.pieces.length, 22, 'no players disappear at a restart');
  assert.equal(new Set(state.pieces.map(piece => piece.id)).size, 22);
  assert.equal(new Set(state.pieces.map(piece => `${piece.x},${piece.y}`)).size, 22, 'restart relocation does not overlap players');
  for (const piece of state.pieces) {
    assert.ok(inside(piece), `${piece.id} stays on the pitch`);
    assert.ok(canOccupySquare(piece,piece.x,piece.y), `${piece.id} respects box eligibility`);
  }
  assert.ok(inside(state.ball), 'the playable ball is inside the pitch');
  if (state.ball.carrierId) {
    const carrier = state.pieces.find(piece => piece.id === state.ball.carrierId);
    assert.ok(carrier);
    assert.deepEqual({x: state.ball.x, y: state.ball.y}, {x: carrier.x, y: carrier.y});
    assert.equal(carrier.team, state.attack);
  }
}

function raySquares(origin) {
  const squares = [];
  for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]) {
    for (let length = 1; length <= Math.max(BOARD_WIDTH,BOARD_HEIGHT); length++) {
      const [x, y] = [origin[0] + dx * length, origin[1] + dy * length];
      if (!inside({x,y})) break;
      squares.push([x,y]);
    }
  }
  return squares;
}

function throwFixture(suffix = 'N1', {attack = 'black', positions = {}, seed = 929} = {}) {
  const carrier = `${attack}-${suffix}`, spot = {x: 0, y: 7};
  const state = fixture({attack, carrier, positions: {[carrier]: [0,7], ...positions}, clear: raySquares([0,7]), seed});
  state.restart = {type: 'throwIn', team: attack, takerId: carrier, spot, indirect: true};
  return state;
}

function longPass({attack = 'white', side = 'left', ownEnd = false, positions = {}, seed = 929} = {}) {
  const transform = pair => attack === 'white' ? pair : mirror(pair);
  const source = transform(ownEnd ? [2,1] : [2,13]);
  const target = transform(ownEnd ? [2,13] : [2,1]);
  const landing = transform(side === 'end' ? ownEnd ? [2,17] : [2,-3] : [-3,1]);
  const clear = Array.from({length: BOARD_HEIGHT}, (_, y) => transform([2,y]));
  const focus = transform(side === 'end' ? ownEnd ? [0,14] : [2,0] : [0,7]);
  const carrier = `${attack}-R1`;
  const state = fixture({attack, carrier, positions: {[carrier]: source, ...positions}, clear, focus, seed});
  return {state, target, landing};
}

function forceLongExit(options = {}) {
  const {state, target, landing} = longPass(options);
  const kick = legalKicks(state).find(kick => kick.x === target[0] && kick.y === target[1]);
  assert.ok(kick && kick.distance > 10 && kick.accuracy < 1, 'scenario offers an inaccurate long pass');
  const result = applyKick(state, ...target, {roll: .999999, landing: {x: landing[0], y: landing[1]}});
  return {state, result};
}

function almostEqual(actual, expected, label = '') {
  assert.ok(Math.abs(actual - expected) < 1e-10, `${label}: ${actual} differs from ${expected}`);
}

test('boundary exits use the first crossed line, including mirror-image diagonals', () => {
  assert.equal(boundaryExit({x:2,y:13}, {x:2,y:1}), null);
  for (const [from, landing, expected] of [
    [{x:2,y:13}, {x:-3,y:1}, {x:-.5,y:7,line:'left'}],
    [{x:BOARD_WIDTH-3,y:BOARD_HEIGHT-14}, {x:BOARD_WIDTH+2,y:BOARD_HEIGHT-2}, {x:BOARD_WIDTH-.5,y:BOARD_HEIGHT-8,line:'right'}],
    [{x:2,y:13}, {x:2,y:-3}, {x:2,y:-.5,line:'top'}],
    [{x:BOARD_WIDTH-3,y:BOARD_HEIGHT-14}, {x:BOARD_WIDTH-3,y:BOARD_HEIGHT+2}, {x:BOARD_WIDTH-3,y:BOARD_HEIGHT-.5,line:'bottom'}],
    [{x:2,y:7}, {x:-2,y:-10}, {x:4/17,y:-.5,line:'top'}],
  ]) {
    const exit = boundaryExit(from, landing);
    assert.ok(exit);
    assert.equal(exit.line, expected.line);
    almostEqual(exit.x, expected.x);
    almostEqual(exit.y, expected.y);
  }
});

test('long passes crossing either touchline award the other team a throw and fresh full round', () => {
  for (const attack of ['white','black']) {
    const {state, result} = forceLongExit({attack});
    const before = clone(state);
    assert.equal(result.restart.type, 'throwIn');
    assert.equal(result.restart.team, attack === 'white' ? 'black' : 'white');
    assert.equal(result.restart.exit.line, attack === 'white' ? 'left' : 'right');
    assert.equal(result.attack, result.restart.team);
    assert.equal(currentTeam(result), result.restart.team);
    assert.equal(result.phase, 'attackMove');
    assert.deepEqual(result.positionBudget, freshBudget());
    assert.equal(result.ball.carrierId, result.restart.takerId);
    assert.deepEqual(result.score, state.score);
    assert.deepEqual(state, before);
    assertIntegrity(result);
  }
});

test('opposing end-line last touches yield goal kicks, while own end-line last touches yield corners', () => {
  for (const attack of ['white','black']) {
    const opposing = attack === 'white' ? 'black' : 'white';
    for (const ownEnd of [false,true]) {
      const {state, result} = forceLongExit({attack, side:'end', ownEnd});
      assert.equal(result.restart.type, ownEnd ? 'corner' : 'goalKick');
      assert.equal(result.restart.team, opposing);
      assert.equal(result.restart.exit.line, (attack === 'white') === ownEnd ? 'bottom' : 'top');
      const taker = result.pieces.find(piece => piece.id === result.restart.takerId);
      if (!ownEnd) {
        assert.equal(taker.type, 'K', 'only the king takes goal kicks');
        assert.equal(taker.id, `${opposing}-K`);
        assert.ok(isBox(taker.x,taker.y));
        assert.ok(inOwnBox(opposing,taker.x,taker.y));
        assert.equal(result.phase,'attackMove');
        assert.equal(result.releaseReason,null);
        assert.deepEqual(legalKicks(result), [], 'both teams reposition before the goal kick');
        const ready = skipMove(skipMove(result));
        assert.ok(legalKicks(ready).length, 'the king distributes after both positioning turns');
        assert.equal(legalKicks(ready).some(kick=>kick.goal),false,'the king must distribute');
      } else {
        assert.equal(taker.y, opposing === 'black' ? BOARD_HEIGHT-1 : 0);
        assert.ok([0,BOARD_WIDTH-1].includes(taker.x), 'corner taker is at the nearest pitch corner');
      }
      assert.equal(result.phase,'attackMove');
      assert.deepEqual(result.score,state.score);
      assertIntegrity(result);
    }
  }
});

test('nearest taker ties use a stable player id and occupied restart spots preserve every other player', () => {
  for (const attack of ['white','black']) {
    const award = attack === 'white' ? 'black' : 'white';
    const transform = pair => attack === 'white' ? pair : mirror(pair);
    const positions = {
      [`${award}-B1`]: transform([1,7]), [`${award}-N1`]: transform([0,8]),
      [`${attack}-P1`]: transform([0,7]),
    };
    const {state,result} = forceLongExit({attack,positions});
    assert.equal(result.restart.takerId,`${award}-B1`);
    const requested=transform([0,7]);
    assert.notDeepEqual({x:result.ball.x,y:result.ball.y},{x:requested[0],y:requested[1]},'occupied spot needs a nearby vacant square');
    for(const piece of state.pieces.filter(piece=>piece.id!==result.restart.takerId)) {
      assert.deepEqual(result.pieces.find(candidate=>candidate.id===piece.id),piece,'restart does not displace uninvolved players');
    }
    const replay = forceLongExit({attack,positions}).result;
    assert.deepEqual(replay,result,'equal distances produce a deterministic taker and vacant square');
    assertIntegrity(result);
  }
});

test('goal kicks always select the king even when a knight is closer to the restart spot', () => {
  for(const attack of ['white','black']) {
    const defending=attack==='white'?'black':'white';
    const transform=pair=>attack==='white'?pair:mirror(pair);
    const {state,result}=forceLongExit({attack,side:'end',positions:{[`${defending}-N1`]:transform([3,2])}});
    assert.equal(result.restart.type,'goalKick');
    assert.equal(result.restart.takerId,`${defending}-K`);
    assert.equal(result.phase,'attackMove');
    assert.equal(result.releaseReason,null);
    assert.deepEqual(result.pieces.find(piece=>piece.id===`${defending}-N1`),state.pieces.find(piece=>piece.id===`${defending}-N1`),'the nearer knight stays in place');
    for (const piece of state.pieces.filter(piece=>piece.id!==`${defending}-K`)) assert.deepEqual(result.pieces.find(candidate=>candidate.id===piece.id),piece,'only the king can be relocated');
    assertIntegrity(result);
  }
});

test('restart takers stay locked through both positioning turns and opponents cannot tackle before the kick', () => {
  const {result:initial}=forceLongExit({positions:{'black-B1':[1,7],'white-R2':[0,8]}});
  const takerId=initial.restart.takerId;
  assert.equal(takerId,'black-B1');
  assert.deepEqual(legalMoves(initial,takerId),[],'taker cannot dribble away from restart');
  assert.deepEqual(legalMoves(initial,takerId,{freePawn:true}),[]);
  assert.deepEqual(legalKicks(initial),[],'restart has its complete positioning round first');
  const defending=skipMove(initial);
  assert.equal(defending.phase,'defendMove');
  assert.deepEqual(defending.restart,initial.restart);
  for(const piece of defending.pieces) assert.equal(legalMoves(defending,piece.id).some(move=>move.type==='tackle'),false);
  assert.throws(()=>applyMove(defending,'white-R2',0,6),'a premature tackle is rejected');
  const kicking=skipMove(defending);
  assert.equal(kicking.phase,'kick');
  assert.deepEqual(kicking.restart,initial.restart);
  const kick=legalKicks(kicking).find(kick=>kick.accuracy===1&&!kick.receiverId);
  assert.ok(kick);
  const released=applyKick(kicking,kick.x,kick.y,{roll:0});
  assert.equal(released.restart,null,'only taking the restart releases its protection');
  assertIntegrity(initial);
  assertIntegrity(defending);
  assertIntegrity(kicking);
  assertIntegrity(released);
});

test('throw-ins use eight rays for every piece with five certain squares and a hard ten-square cap', () => {
  for(const suffix of ['K','Q','R1','B1','N1','P1']) {
    const state=throwFixture(suffix);
    const kicks=legalKicks(state);
    for(const [x,y] of [[1,7],[0,6],[1,6],[1,8]]) assert.ok(kicks.some(kick=>kick.x===x&&kick.y===y),`${suffix} throws along the universal restart pattern`);
    for(const [length,accuracy] of [[1,1],[5,1],[6,.85],[7,.7],[8,.55],[9,.4],[10,.25]]) {
      const kick=kicks.find(kick=>kick.x===length&&kick.y===7);
      assert.ok(kick,`${suffix} can throw ${length} squares`);
      almostEqual(kick.accuracy,accuracy,`${suffix} accuracy at ${length}`);
      assert.equal(kick.distance,length);
    }
    assert.equal(kicks.some(kick=>kick.x===11&&kick.y===7),false,`${suffix} cannot throw eleven squares`);
    assert.equal(kicks.some(kick=>kick.distance>10),false);
    assert.equal(kicks.some(kick=>kick.goal),false,'throw-ins cannot directly score');
    assert.equal(kicks.some(kick=>kick.x===1&&kick.y===5),false,'knights also use rays for a throw rather than an L');
    assertIntegrity(state);
  }
});

test('throw miss threshold, short-throw certainty, and out-of-bounds scatter respect the restart model', () => {
  const state=throwFixture('N1');
  for(const [roll,success] of [[.849999,true],[.85,false]]) {
    const next=applyKick(state,6,7,{roll,landing:{x:6,y:8}});
    assert.equal(next.lastAction.outcome,success?'complete':'inaccurate');
    assert.equal(next.restart,null);
    assert.deepEqual(next.ball,success?{x:6,y:7,carrierId:null}:{x:6,y:8,carrierId:null});
    assertIntegrity(next);
  }
  const certain=applyKick(state,5,7,{roll:.999999,landing:{x:-10,y:7}});
  assert.deepEqual(certain.ball,{x:5,y:7,carrierId:null});
  assert.equal(certain.restart,null,'short throw ignores a scatter override because it is certain');
  const outside=applyKick(state,6,7,{roll:.99,landing:{x:-3,y:7}});
  assert.equal(outside.restart.type,'throwIn');
  assert.equal(outside.restart.team,'white','a failed throw going out hands the restart to the opponent');
  assertIntegrity(outside);
});

test('long-pass misses may land loose inside, while short ordinary passes never scatter outside', () => {
  const {state,target}=longPass();
  const insideMiss=applyKick(state,...target,{roll:.999999,landing:{x:3,y:5}});
  assert.equal(insideMiss.restart,null);
  assert.deepEqual(insideMiss.ball,{x:3,y:5,carrierId:null});
  assert.equal(insideMiss.lastAction.outcome,'inaccurate');
  const certain=applyKick(state,2,3,{roll:.999999,landing:{x:-50,y:-50}});
  assert.deepEqual(certain.ball,{x:2,y:3,carrierId:null});
  assert.equal(certain.restart,null);
  assertIntegrity(insideMiss);
  assertIntegrity(certain);
});

function longShot(attack='white',sourceY=12) {
  const transform=pair=>attack==='white'?pair:mirror(pair);
  const shooter=`${attack}-R1`, target=transform([GOAL_FILES[0],-1]);
  const state=fixture({attack,carrier:shooter,positions:{[shooter]:transform([GOAL_FILES[0],sourceY])},clear:Array.from({length:BOARD_HEIGHT},(_,y)=>transform([GOAL_FILES[0],y])),focus:transform([0,7])});
  const kick=legalKicks(state).find(kick=>kick.x===target[0]&&kick.y===target[1]&&kick.goal);
  assert.ok(kick?.distance>10);
  return {state,reaction:applyKick(state,...target),transform};
}

test('long shots going wide may cross a touchline first, while short wide shots still yield goal kicks', () => {
  for(const attack of ['white','black']) {
    const {state,reaction,transform}=longShot(attack), [lx,ly]=transform([-3,7]);
    const before=clone(reaction);
    const result=skipMove(reaction,{roll:.999999,landing:{x:lx,y:ly}});
    assert.equal(result.lastAction.outcome,'wide');
    assert.equal(result.restart.type,'throwIn');
    assert.equal(result.restart.team,attack==='white'?'black':'white');
    assert.equal(result.restart.exit.line,attack==='white'?'left':'right');
    assert.equal(result.phase,'attackMove');
    assert.deepEqual(result.score,state.score);
    assert.deepEqual(reaction,before);
    assertIntegrity(result);
  }
  const short=fixture({positions:{'white-R1':[GOAL_FILES[0],4]},clear:Array.from({length:4},(_,y)=>[GOAL_FILES[0],y])});
  const reaction=applyKick(short,GOAL_FILES[0],-1);
  const result=skipMove(reaction,{roll:.999999,landing:{x:-20,y:7}});
  assert.equal(result.restart.type,'goalKick','short-shot wide resolution ignores long-shot scatter override');
  assert.equal(result.restart.team,'black');
  assertIntegrity(result);
});

test('short and long stopped shots distinguish catches from keeper last-touch corners without extra outcome draws', () => {
  for(const attack of ['white','black']) for(const range of ['short','long']) {
    const defending=attack==='white'?'black':'white';
    const transform=pair=>attack==='white'?pair:mirror(pair);
    const shooter=`${attack}-R1`, source=transform([GOAL_FILES[0],range==='short'?3:12]);
    const state=fixture({attack,carrier:shooter,positions:{[shooter]:source,[`${defending}-K`]:transform([GOAL_FILES[1],0])},clear:Array.from({length:BOARD_HEIGHT},(_,y)=>transform([GOAL_FILES[0],y])),focus:transform([0,7])});
    const reaction=applyKick(state,...transform([GOAL_FILES[0],-1]));
    const model=reaction.lastAction.shotModel;
    assert.ok(model.saveProbability>0&&model.cornerProbability>0&&model.caughtSaveProbability>0);
    const caughtRoll=model.goalProbability+model.cornerProbability+model.caughtSaveProbability/2;
    for(const [roll,outcome] of [[model.goalProbability+model.cornerProbability/2,'corner'],[caughtRoll,'saved']]) {
      const before=clone(reaction);
      const result=skipMove(reaction,{roll});
      assert.equal(result.lastAction.outcome,outcome,`${attack} ${range}`);
      assert.deepEqual(reaction,before);
      assert.deepEqual(result.score,reaction.score);
      if(outcome==='corner') {
        assert.equal(result.restart.type,'corner');
        assert.equal(result.restart.team,attack,'defending keeper touch awards attacking corner');
        assert.equal(result.lastAction.tippedOut,true);
        assert.equal(result.phase,'cornerSelect');
        assert.equal(result.restart.takerId,null);
        const selected=selectCornerTaker(result,cornerTakers(result)[0].id);
        assert.equal(selected.phase,'attackMove');
      } else {
        assert.equal(result.restart,null);
        assert.equal(result.ball.carrierId,`${defending}-K`);
      }
      const alternate=skipMove(reaction,{roll:caughtRoll});
      assert.equal(result.randomState,alternate.randomState,'catch or parry uses the same single seeded outcome draw');
      assertIntegrity(result);
    }
  }
});

test('direct receipts from throws, corners, and goal kicks are exempt from offside', () => {
  for(const attack of ['white','black']) {
    const defending=attack==='white'?'black':'white';
    const transform=pair=>attack==='white'?pair:mirror(pair);
    const blackSuffixes=['Q','R1','R2','B1','B2','N1','N2','P1','P2','P3'];
    const defenders=Object.fromEntries(blackSuffixes.map((suffix,index)=>[`${defending}-${suffix}`,transform([9+(index%2),4+Math.floor(index/2)])]));
    defenders[`${defending}-K`]=transform([7,0]);
    for(const [type,suffix,origin,target] of [
      ['throwIn','B1',[0,3],[4,3]],
      ['corner','R1',[0,0],[4,0]],
      ['goalKick','K',[4,14],[4,1]],
    ]) {
      const carrier=`${attack}-${suffix}`, recipient=`${attack}-N1`;
      const from=transform(origin), to=transform(target);
      const clear=raySquares(from);
      const state=fixture({attack,carrier,positions:{...defenders,[carrier]:from,[recipient]:to},clear,focus:from});
      state.restart={type,team:attack,takerId:carrier,spot:{x:from[0],y:from[1]},indirect:false};
      const kick=legalKicks(state).find(kick=>kick.x===to[0]&&kick.y===to[1]);
      assert.ok(kick,`${type} offers direct receiver`);
      const result=applyKick(state,...to,{roll:0});
      assert.notEqual(result.lastAction.outcome,'offside',`${type} direct reception is exempt`);
      assert.equal(result.ball.carrierId,recipient);
      assert.equal(result.restart,null);
      assertIntegrity(result);
    }
  }
});

test('restart previews preserve inputs and seeded long-pass scatter can reproduce in-play balls and exits', () => {
  const seen=new Set();
  for(let seed=0;seed<32;seed++) {
    const {state,target}=longPass({seed:seed*1000});
    const before=clone(state);
    for(let repeat=0;repeat<3;repeat++) {
      legalKicks(state);
      for(const piece of state.pieces) {
        legalMoves(state,piece.id);
        legalMoves(state,piece.id,{freePawn:true});
      }
    }
    assert.deepEqual(state,before);
    const a=applyKick(state,...target,{roll:.999999});
    const b=applyKick(state,...target,{roll:.999999});
    assert.deepEqual(a,b,'same saved RNG and action produce the same scatter and taker');
    assert.deepEqual(state,before,'resolving a kick preserves an undo snapshot');
    assert.notEqual(a.randomState,state.randomState);
    seen.add(a.restart?.type||'inPlay');
    assertIntegrity(a);
  }
  assert.ok(seen.has('inPlay'),'the long-pass model can miss inside the pitch');
  assert.ok(seen.has('goalKick'),'the same near-end-line aim can scatter over the line');
});

test('both teams can use normal and free-pawn positioning before goal kicks, corners and throws', () => {
  for (const attack of ['white', 'black']) for (const type of ['goalKick', 'corner', 'throwIn']) {
    const opposing=attack==='white'?'black':'white', transform=pair=>attack==='white'?pair:mirror(pair);
    const positions={'white-P1':[8,8],'black-P1':[8,6],[`${opposing}-B1`]:transform(type==='corner'?[1,13]:type==='goalKick'?[1,1]:[1,7])};
    let {result:state}=forceLongExit({attack,side:type==='throwIn'?'left':'end',ownEnd:type==='corner',positions});
    assert.equal(state.restart.type,type);
    if(state.phase==='cornerSelect') state=selectCornerTaker(state,cornerTakers(state)[0].id);
    const restart=clone(state.restart), ball=clone(state.ball), randomState=state.randomState;
    for(const expectedPhase of ['attackMove','defendMove']) {
      assert.equal(state.phase,expectedPhase);
      assert.deepEqual(state.positionBudget,freshBudget());
      assert.deepEqual(legalKicks(state),[],'a kick waits for both positioning phases');
      assert.deepEqual(legalMoves(state,restart.takerId),[],'the taker cannot carry the dead ball');
      for(const piece of state.pieces) assert.equal(legalMoves(state,piece.id).some(move=>move.type==='tackle'),false,'the restart is protected from every tackle');
      const pawn=state.pieces.find(piece=>piece.type==='P'&&legalMoves(state,piece.id,{freePawn:true}).length);
      assert.ok(pawn,'a free pawn reposition is available');
      const bonus=legalMoves(state,pawn.id,{freePawn:true})[0];
      state=applyMove(state,pawn.id,bonus.x,bonus.y,{freePawn:true});
      assert.equal(state.phase,expectedPhase,'using the bonus leaves the normal positioning action');
      assert.deepEqual(state.positionBudget,{ normalUsed: false, pawnUsed: true, dribbleUsed: false });
      const mover=state.pieces.find(piece=>piece.id!==restart.takerId&&legalMoves(state,piece.id).length);
      assert.ok(mover,'a normal reposition is available');
      const move=legalMoves(state,mover.id)[0];
      assert.notEqual(move.type,'tackle');
      state=applyMove(state,mover.id,move.x,move.y);
      assert.deepEqual(state.restart,restart);
      assert.deepEqual(state.ball,ball,'repositions cannot disturb the dead ball');
      assert.equal(state.randomState,randomState,'repositioning draws no random outcomes');
      assertIntegrity(state);
    }
    assert.equal(state.phase,'kick');
    assert.deepEqual(state.positionBudget,freshBudget());
    assert.ok(legalKicks(state).length);
    if(type==='goalKick'||type==='throwIn') assert.equal(legalKicks(state).some(kick=>kick.goal),false,'goal kicks and throws must distribute');
  }
});

test('seeded long-shot misses naturally produce both goal kicks and touchline throws', () => {
  const seen=new Set();
  for(let seed=0;seed<48;seed++) {
    // The wider pitch needs a deeper, higher-scatter shot to sample a
    // touchline-first miss naturally rather than overriding its landing.
    const {state}=longShot('white',BOARD_HEIGHT-3);
    state.randomState=seed*1000;
    const reaction=applyKick(state,GOAL_FILES[0],-1), before=clone(reaction);
    const result=skipMove(reaction,{roll:.999999});
    assert.deepEqual(skipMove(reaction,{roll:.999999}),result,'saved shot RNG reproduces the landing and restart');
    assert.deepEqual(reaction,before);
    seen.add(result.restart.type);
    assertIntegrity(result);
  }
  assert.ok(seen.has('goalKick'));
  assert.ok(seen.has('throwIn'),'unclamped shot dispersion can cross a touchline first');
});

test('a throw cannot score directly and a knight throw stops at the first interceptor', () => {
  for(const attack of ['white','black']) {
    const transform=pair=>attack==='white'?pair:mirror(pair);
    const from=transform([0,GOAL_FILES[0]-1]), target=transform([GOAL_FILES[0],-1]), carrier=`${attack}-B1`;
    const state=fixture({attack,carrier,positions:{[carrier]:from},clear:raySquares(from),focus:from});
    assert.ok(legalKicks(state).some(kick=>kick.goal&&kick.x===target[0]&&kick.y===target[1]),'fixture normally has a direct diagonal shot');
    state.restart={type:'throwIn',team:attack,takerId:carrier,spot:{x:from[0],y:from[1]},indirect:false};
    assert.equal(legalKicks(state).some(kick=>kick.goal),false,'throw rule suppresses a geometrically reachable goal');
    assert.throws(()=>applyKick(state,...target));
  }
  const state=throwFixture('N1',{positions:{'white-P1':[2,7]}});
  assert.ok(legalKicks(state).some(kick=>kick.x===2&&kick.y===7&&kick.receiverId==='white-P1'));
  assert.equal(legalKicks(state).some(kick=>kick.x===3&&kick.y===7),false,'throwing overrides the knight jump pattern');
  const intercepted=applyKick(state,2,7,{roll:0});
  assert.equal(intercepted.ball.carrierId,'white-P1');
  assert.equal(intercepted.lastAction.outcome,'interception');
  assert.equal(intercepted.restart,null);
  assertIntegrity(intercepted);
});
