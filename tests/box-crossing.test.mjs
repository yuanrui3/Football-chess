import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../dist/engine.js';

const other=t=>t==='white'?'black':'white';
const idFor=(id,team)=>team==='white'?id:id.replace(/^(white|black)/,other);
const pointFor=([x,y],team,end='top')=>{const p={x,y:end==='top'?y:E.BOARD_HEIGHT-1-y};return team==='white'?p:{x:E.BOARD_WIDTH-1-p.x,y:E.BOARD_HEIGHT-1-p.y};};
function fixture({team='white',phase='attackMove',carrier='white-Q',positions={},end='top',ball}={}){
  const s=E.createGame({mode:'local',seed:41}),assigned={'white-K':[6,15],'black-K':[7,0],'white-Q':[11,8],...positions};
  const used=new Set(Object.values(assigned).map(p=>p.join(',')));assert.equal(used.size,Object.keys(assigned).length);
  const parking=Array.from({length:13},(_,i)=>[[0,4+i],[13,4+i]]).flat();
  for(const p of s.pieces){const q=assigned[p.id]||parking.find(q=>!used.has(q.join(',')));[p.x,p.y]=q;used.add(q.join(','));Object.assign(p,pointFor(q,team,end));if(team==='black'){p.id=idFor(p.id,team);p.team=other(p.team);}}
  // Kings remain ordinary off-box pieces here so testing either end never
  // accidentally grants access to an opponent's box.
  for(const p of s.pieces.filter(p=>p.type==='K')){const target=p.team==='white'?{x:1,y:15}:{x:12,y:1};assert.ok(!s.pieces.some(q=>q.id!==p.id&&q.x===target.x&&q.y===target.y));Object.assign(p,target);}
  const owner=s.pieces.find(p=>p.id===idFor(carrier,team));s.ball=ball?{...pointFor(ball,team,end),carrierId:null}:{x:owner.x,y:owner.y,carrierId:owner.id};
  s.phase=phase;s.attack=phase==='defendMove'?other(team):team;s.restart=null;s.offside=null;s.positionBudget={normalUsed:false,pawnUsed:false,dribbleUsed:false};s.ballProgress={team:s.attack,anchorY:s.ball.y,rounds:0,pendingRelease:false,excludeRelease:false};return s;
}
const contains=(moves,p)=>moves.some(m=>m.x===p.x&&m.y===p.y);
const rays=[['white-R1',[3,1],[7,1],[6,1],[5,1]],['white-Q',[3,1],[7,1],[6,1],[5,1]],['white-B1',[3,0],[6,3],[5,2],[4,1]]];
for(const team of ['white','black'])for(const end of ['top','bottom']){
  test(`${team}, ${end} box: clear off-ball rays cross the box but carrying rays cannot enter it`,()=>{
    for(const [id,origin,target]of rays)for(const carrying of [false,true]){
      const s=fixture({team,end,carrier:carrying?id:'white-R2',positions:{[id]:origin}}),destination=pointFor(target,team,end),before=JSON.stringify(s);
      assert.equal(contains(E.legalMoves(s,idFor(id,team)),destination),!carrying);
      assert.ok(E.movementCost(s.pieces.find(p=>p.id===idFor(id,team)),destination.x,destination.y)<=(carrying?E.DRIBBLE_RANGE:E.MOVE_RANGE));
      if(carrying){assert.throws(()=>E.applyMove(s,idFor(id,team),destination.x,destination.y),/not a legal move/);assert.equal(JSON.stringify(s),before);continue;}
      const next=E.applyMove(s,idFor(id,team),destination.x,destination.y);
      assert.deepEqual({x:next.pieces.find(p=>p.id===idFor(id,team)).x,y:next.pieces.find(p=>p.id===idFor(id,team)).y},destination);
      if(carrying)assert.equal(next.ball.carrierId,idFor(id,team));else assert.deepEqual(next.ball,s.ball);
      assert.equal(JSON.stringify(s),before);
    }
  });
  test(`${team}, ${end} box: occupied squares still stop slider movement through the box`,()=>{
    for(const [id,origin,target,blocker,before]of rays){
      const s=fixture({team,end,carrier:'white-R2',positions:{[id]:origin,'black-P1':blocker}}),moves=E.legalMoves(s,idFor(id,team)),destination=pointFor(target,team,end);
      assert.equal(contains(moves,destination),false);assert.ok(contains(moves,pointFor(before,team,end)));
      assert.throws(()=>E.applyMove(s,idFor(id,team),destination.x,destination.y),/not a legal move/);
    }
  });
  test(`${team}, ${end} box: long-range tackles cross the box within their five-square range`,()=>{
    for(const [id,origin,target]of [['white-R1',[3,1],[8,1]],['white-Q',[3,1],[8,1]],['white-B1',[3,0],[6,3]]]){
      const s=fixture({team,end,phase:'defendMove',carrier:'black-Q',positions:{[id]:origin,'black-Q':target}}),move=E.legalMoves(s,idFor(id,team)).find(m=>m.type==='tackle');
      assert.ok(move);assert.equal(move.tackleProbability,1);const next=E.applyMove(s,idFor(id,team),move.x,move.y);assert.equal(next.ball.carrierId,idFor(id,team));
    }
    const beyond=fixture({team,end,phase:'defendMove',carrier:'black-Q',positions:{'white-R1':[3,1],'black-Q':[9,1]}});
    assert.ok(E.legalMoves(beyond,idFor('white-R1',team)).every(m=>m.type!=='tackle'));
  });
  test(`${team}, ${end} box: sliders collect across clear box rays and knights retain their native jump`,()=>{
    for(const [id,origin,target]of [...rays,['white-N1',[3,2],[4,0]]]){
      const s=fixture({team,end,positions:{[id]:origin},ball:target}),destination=pointFor(target,team,end);
      assert.ok(contains(E.legalMoves(s,idFor(id,team)),destination));const next=E.applyMove(s,idFor(id,team),destination.x,destination.y);assert.equal(next.ball.carrierId,idFor(id,team));assert.equal(next.lastAction.collection,true);
    }
  });
}
for(const team of ['white','black'])test(`${team}: AI does not assume a rook can collect a nine-square pass across the box for fifteen movement points`,()=>{
  const s=fixture({team,phase:'kick',carrier:'white-P1',positions:{'white-P1':[10,11],'white-R1':[1,1],'white-Q':[0,16],'white-R2':[13,16],'white-B1':[0,15],'white-B2':[13,15],'white-N1':[0,14],'white-N2':[13,14],'white-P2':[0,13],'white-P3':[13,13],'black-N1':[0,1],'black-N2':[12,0]}});
  s.restart={type:'stalling',team,takerId:s.ball.carrierId,spot:{x:s.ball.x,y:s.ball.y},indirect:true};
  const target=pointFor([10,1],team),before=JSON.stringify(s);assert.ok(E.legalKicks(s).some(k=>k.x===target.x&&k.y===target.y));
  assert.equal(E.movementCost(s.pieces.find(p=>p.id===idFor('white-R1',team)),target.x,target.y),15);
  assert.equal(E.offsideInfo(s).flaggedIds.includes(idFor('white-R1',team)),false,'the potential collector is level with the last two defenders');
  const collecting={...s,restart:null,phase:'attackMove',ball:{...target,carrierId:null}};for(const p of s.pieces.filter(p=>p.team===team))assert.equal(contains(E.legalMoves(collecting,p.id),target),false);
  for(const difficulty of ['casual','tactical']){const a=E.chooseAIAction(s,{difficulty});assert.equal(a.type,'kick');assert.ok(a.x!==target.x||a.y!==target.y);assert.ok(E.legalKicks(s).some(k=>k.x===a.x&&k.y===a.y));assert.equal(JSON.stringify(s),before);}
});
