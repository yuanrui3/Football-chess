import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {score} from './score.mjs';

const sha = text => createHash('sha256').update(text).digest('hex');
const distance = (a,b) => Math.max(Math.abs(a.x-b.x),Math.abs(a.rank-b.rank));
const best = values => 1 + values.indexOf(Math.max(...values));
const square = p => p.x + ',' + p.rank;
function allowed(piece,p) {
  if (p.x<0 || p.x>=14 || p.rank<1 || p.rank>17) return false;
  const goal = p.x>=5 && p.x<=8 && (p.rank===1 || p.rank===17);
  if (piece.type!=='K') return !goal;
  const enemyBox = p.x>=4 && p.x<=9 && (piece.team==='white' ? p.rank>=15 : p.rank<=3);
  return !enemyBox;
}
function reaches(d,r,occupied) {
  const dx=r.x-d.x, dr=r.rank-d.rank, n=distance(d,r);
  if (d.type==='N') return Math.abs(dx*dr)===2;
  if (d.type==='P') return Math.abs(dx)===1 && Math.abs(dr)===1;
  if (d.type==='K') return n===1;
  if (n===0 || n>5) return false;
  const ray=dx===0 || dr===0, diagonal=Math.abs(dx)===Math.abs(dr);
  if (!(d.type==='Q' ? ray || diagonal : d.type==='R' ? ray : diagonal)) return false;
  if (occupied) for (let i=1;i<n;i++) {
    const p={x:d.x+i*Math.sign(dx),rank:d.rank+i*Math.sign(dr)};
    if (!allowed(d,p) || occupied.has(square(p))) return false;
  }
  return true;
}
function landings(d,r,occupied) {
  if (!reaches(d,r,occupied)) return 0;
  let count=0;
  for (let dx=-1;dx<=1;dx++) for (let dr=-1;dr<=1;dr++) {
    if (dx===0 && dr===0) continue;
    const p={x:r.x+dx,rank:r.rank+dr}, occupant=occupied.get(square(p));
    if (distance(d,p)<=10 && allowed(d,p) && (!occupant || occupant.id===d.id)) count++;
  }
  return count;
}
export function reproduce(data) {
  const {protocol,pairs,positions} = data;
  const choices=Object.fromEntries(['gemini','firstOption','farthestDefender','geometryNoBlockers','postHocKnightElseFirst']
    .map(n=>[n,new Map()]));
  let landingCount=0;
  const schedule=[];
  for (const b of positions) {
    const wire=JSON.stringify({contents:[{role:'user',parts:[{text:b.prompt}]}],generationConfig:protocol.generationConfig});
    assert.equal(sha(wire),b.wireHash);
    schedule.push({itemId:b.itemId,wireHash:b.wireHash});
    const {attack,carrier,pieces,options}=b;
    assert.equal(sha(JSON.stringify({attack,carrier,pieces,options})).slice(0,16),b.itemId);
    const players=pieces.map(p=>({...p,x:p.square.charCodeAt(0)-97,rank:Number(p.square.slice(1))}));
    const opponents=players.filter(p=>p.team!==attack);
    const occupied=new Map(players.map(p=>[square(p),p]));
    const receivers=options.map(id=>players.find(p=>p.id===id));
    assert.ok(receivers.every(r=>r.team===attack && r.id!==carrier));
    const nearest=[], open=[];
    for (const [i,r] of receivers.entries()) {
      nearest.push(Math.min(...opponents.map(d=>distance(d,r))));
      const cost=r.type==='N' ? 0.5 : 1;
      open.push(1 - (opponents.some(d=>reaches(d,r,null)) ? cost : 0));
      const tacklers=[];
      for (const d of opponents) {
        const n=landings(d,r,occupied);
        landingCount+=n;
        if (n) tacklers.push({pieceId:d.id,takeaway:cost});
      }
      const oracle=b.oracle[i], sorted=v=>[...v].sort((a,b)=>a.pieceId.localeCompare(b.pieceId));
      assert.equal(oracle.receiverId,r.id);
      assert.equal(oracle.passAccuracy,1);
      assert.equal(oracle.retention,1-(tacklers.length?cost:0));
      assert.deepEqual(sorted(oracle.tacklers),sorted(tacklers));
    }
    choices.gemini.set(b.itemId,b.geminiChoice);
    choices.firstOption.set(b.itemId,1);
    choices.farthestDefender.set(b.itemId,best(nearest));
    choices.geometryNoBlockers.set(b.itemId,best(open));
    const knight=receivers.findIndex(p=>p.type==='N');
    choices.postHocKnightElseFirst.set(b.itemId,knight<0 ? 1 : knight+1);
  }
  assert.equal(sha(JSON.stringify(schedule)),protocol.scheduleSha256);
  const policies=Object.fromEntries(Object.entries(choices).map(([name,v])=>[name,score(positions,pairs,v)]));
  return {tackleLandings:landingCount,policies};
}
if (import.meta.main) {
  const data=JSON.parse(readFileSync(new URL('data.json',import.meta.url),'utf8'));
  console.log(JSON.stringify(reproduce(data),null,2));
}
