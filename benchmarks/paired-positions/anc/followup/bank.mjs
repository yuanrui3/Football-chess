import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync, writeFileSync} from 'node:fs';
import * as game from '../native/engine.mjs';

const seed = 274196013;
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const engineSha256 = hash(readFileSync(new URL('../native/engine.mjs', import.meta.url)));
assert.equal(engineSha256, '8c4e1d5fe428878d4d8a0aace338b2f12d1c50d1839e076b3990f1b7d99163c6');
let random = seed;
function integer(low, high) {
  random = (Math.imul(1664525, random) + 1013904223) >>> 0;
  return low + Math.floor(random / 4294967296 * (high - low + 1));
}
const pick = items => items[integer(0, items.length - 1)];
function shuffled(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = integer(0, i);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
const straight = [[0,1],[0,-1],[1,0],[-1,0]];
const diagonal = [[1,1],[1,-1],[-1,1],[-1,-1]];
const rays = [...straight, ...diagonal];
const step = (p, v, n=1) => [p[0] + v[0]*n, p[1] + v[1]*n];
const opponent = team => team === 'white' ? 'black' : 'white';
const square = p => game.FILE_LABELS[p.x] + (17 - p.y);
const distance = (a,b) => Math.max(Math.abs(a.x-b.x), Math.abs(a.y-b.y));
const ids = ['B1', 'R1', 'N1'];

// All proposals use the same reduced roster. The editing pawn is always P2.
// Each target is on a separate ray from its passing queen.
function proposal(stratum, kind, attack, protectedId) {
  const origin = [integer(3,10), integer(5,11)];
  const directions = shuffled(rays);
  const receivers = Object.fromEntries(ids.map((id,i) => [id, step(origin,directions[i],integer(2,5))]));
  const target = receivers[protectedId];
  const alternateId = protectedId === 'B1' ? 'R1' : 'B1';
  const vector = pick(stratum === 'blocker' && kind === 'stay' ? straight : rays);
  const length = integer(3,5);
  let slider = step(target, vector, length);
  let start, finish;
  if (stratum === 'blocker') {
    const offset = integer(1,length-2);
    start = step(target,vector,offset);
    if (kind === 'stay') {
      finish = step(start,vector);
    } else {
      const offLine = straight.filter(([x,y]) => x * vector[1] !== y * vector[0]);
      finish = step(start,pick(offLine));
    }
  } else {
    // A control's queen does not nominally attack the protected recipient.
    slider = step(slider,pick(straight));
    // On switches the editing pawn drops its direct attack. On stays the
    // knight loses a redundant tackler while the best ordinary receiver stays safe.
    start = step(kind === 'switch' ? target : receivers.N1, pick(diagonal));
    finish = step(start,pick(straight));
  }
  const attackLayout = [['Q',origin],['K',[integer(5,8),16]],...Object.entries(receivers)];
  const defenceLayout = [
    ['K',[integer(5,8),0]], ['P3',[integer(0,13),integer(1,2)]], ['Q',slider],
    ['R2',step(receivers[alternateId],pick(straight),integer(1,5))],
    ['B2',step(receivers.N1,pick(diagonal),integer(1,5))]
  ];
  const states = [start,finish].map(pawn => {
    const state = game.createGame({mode:'local',seed:1,kickoff:attack,foulsEnabled:false});
    const roster = new Map(state.pieces.map(p => [p.id,p]));
    const layout = [[attack,attackLayout],[opponent(attack),[...defenceLayout,['P2',pawn]]]];
    state.pieces = layout.flatMap(([team, pieces]) => pieces.map(([id, [x,y]]) => {
      const player = roster.get(team + '-' + id);
      return {...player,x:attack==='white'?x:13-x,y:attack==='white'?y:16-y};
    }));
    const queen = state.pieces.find(p => p.team===attack && p.type==='Q');
    Object.assign(state,{attack,phase:'kick',restart:null,log:[],ball:{x:queen.x,y:queen.y,carrierId:queen.id}});
    state.ballProgress.anchorY = queen.y;
    return state;
  });
  if (states.some(s => !s.pieces.every(p => game.canOccupySquare(p,p.x,p.y)) ||
      new Set(s.pieces.map(square)).size !== s.pieces.length)) return;
  return states;
}

// This diagnostic policy knows the shape and five-square range, but ignores
// intervening bodies and the availability of a tackle landing. It receives no labels.
function nominalThreat(d,p) {
  const x = Math.abs(d.x-p.x), y = Math.abs(d.y-p.y);
  if (d.type==='P') return x===1 && y===1;
  if (d.type==='N') return x*y===2;
  if (d.type==='K') return Math.max(x,y)===1;
  if (Math.max(x,y)>5) return false;
  const axial = x===0 || y===0, diagonal = x===y;
  return d.type==='R' ? axial : d.type==='B' ? diagonal : axial || diagonal;
}

function beforeScreen(d,p,other) {
  const steps = distance(d,p);
  if (steps<2) return false;
  for (let j=1;j<steps;j++) {
    if (other.x===d.x+j*Math.sign(p.x-d.x) && other.y===d.y+j*Math.sign(p.y-d.y)) return true;
  }
  return false;
}

function oracle(state, order) {
  const allKicks = game.legalKicks(state);
  const defenders = state.pieces.filter(p => p.team!==state.attack);
  const rows = [];
  for (const id of order) {
    const p = state.pieces.find(p => p.id===state.attack+'-'+id);
    const pass = allKicks.find(k => k.x===p.x && k.y===p.y && k.receiverId===p.id && !k.goal && !k.offside && !k.lofted && k.accuracy===1);
    if (!pass) return;
    const received = game.applyKick(state,p.x,p.y,{roll:0.999});
    if (received.phase!=='attackMove' || received.ball.carrierId!==p.id || received.restart) return;
    const reply = game.skipMove(received);
    assert.equal(reply.phase,'defendMove');
    assert.equal(game.skipMove(reply).ball.carrierId,p.id);
    const tacklers = [];
    for (const defender of defenders) {
      const moves = game.legalMoves(reply,defender.id).filter(m => m.type==='tackle' && m.targetId===p.id);
      if (!moves.length) continue;
      const probability = moves[0].tackleProbability;
      for (const m of moves) {
        assert.equal(m.tackleProbability,probability);
        for (const roll of [0.25,0.75]) {
          const end = game.applyMove(reply,defender.id,m.x,m.y,{roll});
          assert.equal(end.ball.carrierId,roll<probability?defender.id:p.id);
        }
      }
      tacklers.push({pieceId:defender.id,takeaway:probability,landings:moves.length});
    }
    const nominal = defenders.filter(d => nominalThreat(d,p));
    const nominalRetention = nominal.length ? (p.type==='N'?0.5:0) : 1;
    const retention = 1-Math.max(0,...tacklers.map(t => t.takeaway));
    rows.push({receiverId:p.id,passAccuracy:1,retention,tacklers,geometryRetention:nominalRetention});
  }
  return rows;
}

function accept(states, strata, kind, protectedId) {
  const atk = states[0].attack, side = opponent(atk);
  const protectedFull = atk+'-'+protectedId, moverId = side+'-P2', sliderId = side+'-Q';
  for (const [i,s] of states.entries()) {
    const dst = s.pieces.find(p => p.id===protectedFull);
    const queen = s.pieces.find(p => p.id===sliderId), pawn=s.pieces.find(p => p.id===moverId);
    if (strata==='blocker') {
      if (!nominalThreat(queen,dst) || beforeScreen(queen,dst,pawn)!==(i===0 || kind==='stay')) return;
      if (s.pieces.some(p => p.id!==moverId && beforeScreen(queen,dst,p))) return;
    } else if (nominalThreat(queen,dst)) return;
  }
  const results = states.map(s => oracle(s,ids));
  if (results.some(r=>!r)) return;
  for (const [i,rows] of results.entries()) {
    for (const r of rows) {
      let want = r.receiverId.endsWith('-N1') ? 0.5 : 0;
      if (r.receiverId===protectedFull) {
        const protectedNow = kind==='stay' || (strata==='blocker' ? i===0 : i===1);
        want = protectedNow ? 1 : 0;
        const ids = r.tacklers.map(t=>t.pieceId);
        if (strata==='blocker' && !protectedNow && !ids.includes(sliderId)) return;
        if (strata==='control' && !protectedNow && !ids.includes(moverId)) return;
      }
      if (r.retention!==want) return;
      if (strata==='control' && r.geometryRetention!==r.retention) return;
      if (strata==='blocker' && r.geometryRetention!==(r.receiverId.endsWith('-N1')?0.5:0)) return;
    }
  }
  if (strata==='control' && kind==='stay') {
    const knightTacklers = results.map(rows=>rows[2].tacklers.map(t=>t.pieceId));
    if (!knightTacklers[0].includes(moverId) || knightTacklers[1].includes(moverId)) return;
  }
  return results;
}

// Normalize team relative to attack, positions under both axis reflections,
// and arbitrary names for same-type pieces. Compare even if menus are reordered.
function fingerprint(board) {
  const signatures = [];
  for (const flipFile of [false,true]) for (const flipRank of [false,true]) {
    signatures.push(board.pieces.map(p => {
      const x=game.FILE_LABELS.indexOf(p.square[0]), y=Number(p.square.slice(1));
      return [p.team===board.attack?'A':'D',p.type,flipFile?13-x:x,flipRank?18-y:y].join(':');
    }).sort().join('|'));
  }
  return signatures.sort()[0];
}

const publicPieces = s => s.pieces.map(p => ({id:p.id,team:p.team,type:p.type,square:square(p)})).sort((a,b)=>a.id.localeCompare(b.id,'en'));
const originalBank = JSON.parse(readFileSync(new URL('../pass/data.json',import.meta.url)));
// Discard all original response/key fields before checking for geometric overlap.
const used = new Set(originalBank.positions.map(({attack,pieces}) => fingerprint({attack,pieces})));
const positions = [], pairs = [], slotCounts=[0,0,0];
const permutations = [[0,1,2],[0,2,1],[1,0,2],[1,2,0],[2,0,1],[2,1,0]];
let proposals=0;
for (const stratum of ['blocker','control']) for (const condition of ['switch','stay']) for (const attack of ['white','black']) {
  const protectedId = (condition==='switch') === (attack==='white') ? 'B1' : 'R1';
  while (true) {
    assert.ok(++proposals<250000,'Exhausted generated proposals');
    const states=proposal(stratum,condition,attack,protectedId);
    if (!states) continue;
    const pieces=states.map(publicPieces);
    const fingerprints=pieces.map(p=>fingerprint({pieces:p,attack}));
    if (fingerprints[0]===fingerprints[1] || fingerprints.some(f=>used.has(f))) continue;
    const results=accept(states,stratum,condition,protectedId);
    if (!results) continue;
    const best=results.map(rows=>rows.findIndex(r=>r.retention===Math.max(...rows.map(o=>o.retention))));
    const orders=shuffled(permutations).map(order=>{
      const next=slotCounts.slice();
      for (const v of best) next[order.indexOf(v)]++;
      return {order,next,imbalance:next.reduce((sum,n)=>sum+n*n,0)};
    });
    orders.sort((a,b)=>a.imbalance-b.imbalance);
    const {order,next}=orders[0];
    slotCounts.splice(0,3,...next);
    const pairId='m'+(pairs.length+1).toString().padStart(2,'0');
    const edited=opponent(attack)+'-P2';
    const records=states.map((state,i)=>{
      const oracle=order.map(j=>results[i][j]);
      const o=oracle.map(row=>row.retention), g=oracle.map(row=>row.geometryRetention);
      assert.equal(o.filter(v=>v===Math.max(...o)).length,1);
      assert.equal(g.filter(v=>v===Math.max(...g)).length,1);
      const board={attack,carrier:state.ball.carrierId,pieces:pieces[i],options:oracle.map(r=>r.receiverId)};
      return {itemId:hash(JSON.stringify(board)).slice(0,16),...board,answer:1+o.indexOf(Math.max(...o)),oracle,geometryChoice:1+g.indexOf(Math.max(...g))};
    });
    const delta=records[0].pieces.filter((p,k)=>p.square!==records[1].pieces[k].square);
    assert.equal(delta.length,1); assert.equal(delta[0].id,edited);
    const changes=states.map(s=>s.pieces.find(p=>p.id===edited));
    assert.equal(Math.abs(changes[0].x-changes[1].x)+Math.abs(changes[0].y-changes[1].y),1);
    assert.equal(records[0].answer!==records[1].answer,condition==='switch');
    assert.deepEqual(records[0].options,records[1].options);
    pairs.push({pairId,condition,stratum,attack,items:records.map(r=>r.itemId),edit:{pieceId:edited,from:square(changes[0]),to:square(changes[1])}});
    positions.push(...records);for(const k of fingerprints) used.add(k);
    break;
  }
}
assert.equal(new Set(positions.map(p=>p.itemId)).size,16);
assert.ok(Math.max(...slotCounts)-Math.min(...slotCounts)<=2);
const bank={version:1,seed,engineSha256,proposals,slotCounts,pairs,positions};
const serialized=JSON.stringify(bank,null,2)+'\n';
const target=new URL('bank.json',import.meta.url);
if (process.argv.includes('--write')) writeFileSync(target,serialized);
else assert.equal(readFileSync(target,'utf8'),serialized,'Frozen bank has changed');
console.log(JSON.stringify({pairs:pairs.length,boards:positions.length,proposals,slotCounts,bankSha256:hash(serialized)}));
