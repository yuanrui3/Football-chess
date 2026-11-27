import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import * as game from './engine.mjs';

const load = name => readFileSync(new URL(name, import.meta.url));
const sha = createHash('sha256').update(load('engine.mjs')).digest('hex');
assert.equal(sha, '8c4e1d5fe428878d4d8a0aace338b2f12d1c50d1839e076b3990f1b7d99163c6');
assert.equal(game.RULES_VERSION, 22);
const counts = {shotBoards:0, keeperReplies:0, ordinaryShotPayoffs:0, shotActionValues:0,
  passBoards:0, passActionValues:0, legalTackleLandings:0};

function restore(attack, carrierId, pieces) {
  const state = game.createGame({mode:'local', kickoff:attack, seed:1, foulsEnabled:false});
  const roster = new Map(state.pieces.map(p => [p.id,p]));
  state.pieces = pieces.map(({id,type,team,square}) => {
    const piece = roster.get(id);
    assert.ok(piece && piece.type === type && piece.team === team);
    assert.match(square, /^[a-n](?:[1-9]|1[0-7])$/);
    return {...piece, x:game.FILE_LABELS.indexOf(square[0]), y:game.BOARD_HEIGHT - Number(square.slice(1))};
  });
  const carrier = state.pieces.find(p => p.id === carrierId && p.team === attack);
  assert.ok(carrier);
  Object.assign(state, {attack, phase:'kick', restart:null, log:[],
    ball:{x:carrier.x, y:carrier.y, carrierId}});
  state.ballProgress.anchorY = carrier.y;
  return state;
}
const square = p => game.FILE_LABELS[p.x] + (game.BOARD_HEIGHT - p.y);
const close = (a,b,context) => assert.ok(Number.isFinite(a) && Number.isFinite(b) && Math.abs(a-b)<1e-12,context);
function winner(values) {
  const max = Math.max(...values);
  assert.equal(values.filter(v=>v===max).length,1);
  return values.indexOf(max) + 1;
}

function verifyShot(record) {
  const {id,board,options,replyTable,actionGoalProbabilities,best} = record;
  const state = restore(board.attacker,board.carrierId,board.pieces);
  const keeper = state.pieces.find(p=>p.type==='K' && p.team!==board.attacker);
  const targets = game.disguisedShotTargets(state);
  assert.equal(targets.length,2);
  assert.deepEqual(targets.map(t=>game.FILE_LABELS[t.x]),board.targets);
  const declarations = targets.map(t=>game.applyKick(state,t.x,t.y));
  const [first] = targets;
  const disguised = game.applyKick(state,first.x,first.y,{disguise:true});
  const moves = game.legalMoves(disguised,keeper.id);
  const replySet = moves.map(square).sort();
  for (const response of [...declarations,disguised]) {
    assert.equal(response.phase,'keeperReact',id);
    assert.deepEqual(game.legalMoves(response,keeper.id).map(square).sort(),replySet);
  }
  const saved = new Map(replyTable.map(r=>[r.square,r]));
  assert.equal(saved.size,replyTable.length);
  assert.deepEqual([...saved.keys()].sort(),[square(keeper),...replySet].sort());
  const values = [1,1,1];
  for (const move of [undefined,...moves]) {
    const entry = saved.get(square(move ?? keeper));
    assert.equal(entry.hold,move===undefined);
    assert.equal(entry.probabilities.length,2);
    const ordinary = targets.map((t,i)=>game.shotChance(declarations[i],t.x,t.y,move));
    const mixed = game.shotChance(disguised,first.x,first.y,move);
    close(mixed,(ordinary[0]+ordinary[1])/2,id+' disguised shot');
    for (const [i,p] of ordinary.entries()) close(p,entry.probabilities[i],id+' reply '+entry.square);
    for (const [i,p] of [...ordinary,mixed].entries()) values[i]=Math.min(values[i],p);
    counts.keeperReplies++;
    counts.ordinaryShotPayoffs+=2;
  }
  const [a,b] = board.targets;
  const labels = ['Declare file '+a,'Declare file '+b,'Disguise '+a+'/'+b];
  assert.deepEqual([...options].sort(),[...labels].sort());
  const ordered = options.map(label=>values[labels.indexOf(label)]);
  assert.equal(actionGoalProbabilities.length,3);
  for (const [i,v] of ordered.entries()) close(v,actionGoalProbabilities[i],id+' shot action '+(i+1));
  assert.equal(winner(ordered),best,id);
  counts.shotBoards++;
  counts.shotActionValues+=3;
}

function verifyPass(record) {
  const {attack,carrier,pieces,options,oracle,answer,itemId} = record;
  const state = restore(attack,carrier,pieces);
  const kicks = game.legalKicks(state), values = [];
  assert.equal(options.length,3);
  assert.deepEqual(oracle.map(o=>o.receiverId),options);
  for (const [i,id] of options.entries()) {
    const receiver = state.pieces.find(p=>p.id===id && p.team===attack);
    const kick = kicks.find(k=>k.x===receiver.x && k.y===receiver.y && k.receiverId===id);
    assert.ok(kick && !kick.offside && !kick.goal && !kick.lofted);
    assert.equal(kick.accuracy,1);
    assert.equal(kick.accuracy,oracle[i].passAccuracy);
    const done = game.applyKick(state,receiver.x,receiver.y,{roll:0.999});
    assert.equal(done.phase,'attackMove');
    assert.equal(done.ball.carrierId,id);
    const reply = game.skipMove(done);
    assert.equal(reply.phase,'defendMove');
    assert.equal(game.skipMove(reply).ball.carrierId,id);
    const tacklers = [];
    for (const defender of reply.pieces.filter(p=>p.team!==attack)) {
      const tackles = game.legalMoves(reply,defender.id).filter(m=>m.type==='tackle');
      for (const m of tackles) {
        assert.equal(m.targetId,id);
        assert.equal(m.tackleProbability,tackles[0].tackleProbability);
        assert.ok([0.5,1].includes(m.tackleProbability));
        // Each roll represents one equal-mass half of the uniform outcome space.
        for (const roll of [0.25,0.75]) {
          const end = game.applyMove(reply,defender.id,m.x,m.y,{roll});
          assert.equal(end.ball.carrierId,roll<m.tackleProbability ? defender.id : id);
        }
        counts.legalTackleLandings++;
      }
      if (tackles.length) tacklers.push({pieceId:defender.id,takeaway:tackles[0].tackleProbability});
    }
    const sorted = rows=>[...rows].sort((a,b)=>a.pieceId.localeCompare(b.pieceId));
    assert.deepEqual(sorted(tacklers),sorted(oracle[i].tacklers),itemId);
    const retention = 1 - Math.max(0,...tacklers.map(t=>t.takeaway));
    assert.equal(retention,oracle[i].retention,itemId);
    values.push(retention);
    counts.passActionValues++;
  }
  assert.equal(winner(values),answer,itemId);
  counts.passBoards++;
}

const shots = JSON.parse(load('../positions.json'));
const {positions:passes,pairs:passPairs} = JSON.parse(load('../pass/data.json'));
assert.equal(new Set(shots.map(s=>s.id)).size,120);
assert.equal(new Set(passes.map(p=>p.itemId)).size,80);
for (const s of shots) verifyShot(s);
for (const p of passes) verifyPass(p);
const shotPairs = Map.groupBy(shots,s=>s.pair);
assert.equal(shotPairs.size,60);
for (const members of shotPairs.values()) {
  assert.equal(members.length,2);
  const [a,b]=members;
  const choice = r => {
    const label=r.options[r.best-1];
    return label.startsWith('Disguise ') ? 'Disguise '+label.slice(9).split('/').sort().join('/') : label;
  };
  assert.equal(a.kind,b.kind);
  assert.equal(a.kind,choice(a)===choice(b) ? 'stay' : 'switch');
}
const passChoice = new Map(passes.map(p=>[p.itemId,p.options[p.answer-1]]));
assert.equal(passPairs.length,40);
assert.deepEqual(passPairs.flatMap(p=>p.items).sort(),[...passChoice.keys()].sort());
for (const p of passPairs) {
  assert.equal(p.items.length,2);
  const [a,b]=p.items.map(id=>passChoice.get(id));
  assert.equal(p.condition,a===b ? 'stay' : 'switch');
}
assert.deepEqual(counts,{shotBoards:120,keeperReplies:601,ordinaryShotPayoffs:1202,shotActionValues:360,
  passBoards:80,passActionValues:240,legalTackleLandings:1640});
console.log(JSON.stringify({rulesVersion:game.RULES_VERSION,engineSha256:sha,...counts},null,2));
