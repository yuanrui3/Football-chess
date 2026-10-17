import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const expose=async path=>import('data:text/javascript;base64,'+Buffer.from(await readFile(path,'utf8')+'\nexport {rankedTacticalActions,looseBallValue,canCollect};').toString('base64'));
const C=await expose(new URL('../dist/engine.js',import.meta.url));
const {examples}=JSON.parse(await readFile(new URL('./fixtures/tactical-second-ball.json',import.meta.url),'utf8'));
const other=t=>t==='white'?'black':'white';
const mirror=s=>{const t=structuredClone(s),id=v=>v?.replace(/^(white|black)/,other)??null,point=p=>({x:13-p.x,y:16-p.y});t.attack=other(s.attack);t.pieces=s.pieces.map(p=>({...p,...point(p),team:other(p.team),id:id(p.id)}));t.ball={...point(s.ball),carrierId:id(s.ball.carrierId)};t.ballProgress={...s.ballProgress,team:other(s.ballProgress.team),anchorY:16-s.ballProgress.anchorY};return t;};
for(const [index,example] of examples.entries()) for(const [orientation,s] of ['white','black'].map((team,i)=>[team,i?mirror(example.state):example.state])){
 test(`loose-ball fixture${index} ${orientation}: real native collection lane displaces impossible bishop pursuit`,()=>{
  const before=structuredClone(s),fresh=C.rankedTacticalActions(s,9,true);
  const first=fresh[0].action,piece=s.pieces.find(p=>p.id===first.pieceId);
  assert.equal(first.type,'move');
  const advanced=C.applyMove(s,first.pieceId,first.x,first.y,{freePawn:first.freePawn});
  const moved=advanced.pieces.find(p=>p.id===first.pieceId);
  assert.ok(C.canCollect(advanced,moved,advanced.ball),'the approach creates an actual next-move collection, not mere proximity');
  assert.ok(piece.type!=='B'||(piece.x+piece.y-s.ball.x-s.ball.y)%2===0);
  assert.equal(fresh.length<=9,true);
  assert.deepEqual(s,before);
  assert.ok(C.looseBallValue(s,'white') + C.looseBallValue(s,'black') === 0,'leaf race is antisymmetric');
 });
}
