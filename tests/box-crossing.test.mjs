import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../dist/engine.js';

const other=t=>t==='white'?'black':'white';
const idFor=(id,team)=>team==='white'?id:id.replace(/^(white|black)/,other);
const pointFor=([x,y],team,end='top')=>{const p={x,y:end==='top'?y:14-y};return team==='white'?p:{x:11-p.x,y:14-p.y};};
function fixture({team='white',phase='attackMove',carrier='white-Q',positions={},end='top',ball}={}){
  const s=E.createGame({mode:'local',seed:41}),assigned={'white-K':[5,13],'black-K':[6,0],'white-Q':[9,7],...positions};
  const used=new Set(Object.values(assigned).map(p=>p.join(',')));assert.equal(used.size,Object.keys(assigned).length);
  const parking=Array.from({length:11},(_,i)=>[[0,4+i],[11,4+i]]).flat();
  for(const p of s.pieces){const q=assigned[p.id]||parking.find(q=>!used.has(q.join(',')));[p.x,p.y]=q;used.add(q.join(','));const target=pointFor(q,team,end);p.x=target.x;p.y=target.y;if(team==='black'){p.id=idFor(p.id,team);p.team=other(p.team);}}
  // Flipping the tested end should not put the unaffected goalkeepers in the
  // opponent's box. Keep them on ordinary field squares in these fixtures.
  for(const p of s.pieces.filter(p=>p.type==='K')){const target=p.team==='white'?{x:1,y:13}:{x:10,y:1};assert.ok(!s.pieces.some(q=>q.id!==p.id&&q.x===target.x&&q.y===target.y));Object.assign(p,target);}
  const owner=s.pieces.find(p=>p.id===idFor(carrier,team));s.ball=ball?{...pointFor(ball,team,end),carrierId:null}:{x:owner.x,y:owner.y,carrierId:owner.id};
  s.phase=phase;s.attack=phase==='defendMove'?other(team):team;s.restart=null;s.offside=null;s.positionBudget={normalUsed:false,pawnUsed:false,dribbleUsed:false};s.ballProgress={team:s.attack,anchorY:s.ball.y,rounds:0,pendingRelease:false,excludeRelease:false};return s;
}
const contains=(moves,p)=>moves.some(m=>m.x===p.x&&m.y===p.y);
for(const team of ['white','black'])for(const end of ['top','bottom']){
  test(`${team}, ${end} box: slider movement and dribbling stop before the first forbidden square`,()=>{
    for(const [id,origin,target,before]of[['white-R1',[3,1],[8,1],[2,1]],['white-Q',[3,1],[8,1],[2,1]],['white-B1',[3,0],[5,2],[2,1]]])for(const carrying of [false,true]){
      const s=fixture({team,end,carrier:carrying?id:'white-Q',positions:{[id]:origin,...(id==='white-Q'&&!carrying?{'white-R1':[9,6]}:{})}});
      if(id==='white-Q'&&!carrying){const r=s.pieces.find(p=>p.id===idFor('white-R1',team));s.ball={x:r.x,y:r.y,carrierId:r.id};}
      const moves=E.legalMoves(s,idFor(id,team)),blocked=pointFor(target,team,end),allowed=pointFor(before,team,end),copy=JSON.stringify(s);
      assert.equal(contains(moves,blocked),false);assert.equal(contains(moves,pointFor([4,1],team,end)),false);
      assert.ok(contains(moves,allowed),'the ordinary ray in the other direction remains available');
      assert.throws(()=>E.applyMove(s,idFor(id,team),blocked.x,blocked.y),/not a legal move/);assert.equal(JSON.stringify(s),copy);
    }
  });

  test(`${team}, ${end} box: slider tackle rays cannot cross forbidden squares to a carrier beyond`,()=>{
    for(const [id,origin,carrier]of[['white-R1',[3,1],[8,1]],['white-Q',[3,1],[8,1]],['white-B1',[3,0],[5,2]]]){
      const s=fixture({team,end,phase:'defendMove',carrier:'black-Q',positions:{[id]:origin,'black-Q':carrier}});
      assert.ok(E.legalMoves(s,idFor(id,team)).every(move=>move.type!=='tackle'));
    }
    // Reaching the very first boundary square and landing outside the box is
    // still allowed: the tackle has no forbidden intermediate square.
    const edge=fixture({team,end,phase:'defendMove',carrier:'black-N1',positions:{'white-Q':[3,1],'black-N1':[4,1]}});
    assert.ok(E.legalMoves(edge,idFor('white-Q',team)).some(move=>move.type==='tackle'));
  });

  test(`${team}, ${end} box: collection cannot cross the box, while a knight can collect with its native jump`,()=>{
    for(const [id,origin,target]of[['white-R1',[3,1],[8,1]],['white-Q',[3,1],[8,1]],['white-B1',[3,0],[5,2]]]){
      const s=fixture({team,end,positions:{[id]:origin},ball:target}),destination=pointFor(target,team,end);
      assert.equal(contains(E.legalMoves(s,idFor(id,team)),destination),false);
    }
    const s=fixture({team,end,positions:{'white-N1':[3,2]},ball:[4,0]}),destination=pointFor([4,0],team,end);
    assert.ok(contains(E.legalMoves(s,idFor('white-N1',team)),destination));
    const collected=E.applyMove(s,idFor('white-N1',team),destination.x,destination.y);assert.equal(collected.ball.carrierId,idFor('white-N1',team));
  });
}

for(const team of ['white','black'])test(`${team}: AI does not pass to empty space assuming a rook can collect across the box`,()=>{
  const s=E.createGame({mode:'local',seed:811});
  const positions={'white-K':[5,14],'white-P1':[8,10],'white-R1':[3,0],'white-Q':[0,14],'white-R2':[11,14],'white-B1':[0,13],'white-B2':[11,13],'white-N1':[0,12],'white-N2':[11,12],'white-P2':[0,11],'white-P3':[11,11],'black-K':[5,1],'black-N1':[2,0],'black-N2':[1,0]};
  const used=new Set(Object.values(positions).map(p=>p.join(','))),parking=Array.from({length:15},(_,y)=>[[0,y],[11,y]]).flat().filter(p=>!used.has(p.join(','))&&p[1]>4);
  for(const p of s.pieces){const q=positions[p.id]||parking.shift();[p.x,p.y]=q;if(team==='black'){const target=pointFor(q,team);p.x=target.x;p.y=target.y;p.id=idFor(p.id,team);p.team=other(p.team);}}
  const carrier=s.pieces.find(p=>p.id===idFor('white-P1',team));s.ball={x:carrier.x,y:carrier.y,carrierId:carrier.id};s.phase='kick';s.attack=team;
  s.restart={type:'stalling',team,takerId:carrier.id,spot:{x:carrier.x,y:carrier.y},indirect:true};s.ballProgress={team,anchorY:carrier.y,rounds:0,pendingRelease:false,excludeRelease:false};
  const before=JSON.stringify(s),uncollectable=pointFor([8,0],team);
  assert.ok(E.legalKicks(s).some(k=>k.x===uncollectable.x&&k.y===uncollectable.y),'the ball itself can legally be passed to the empty target');
  const collecting={...s,restart:null,phase:'attackMove',ball:{...uncollectable,carrierId:null}};
  for(const p of s.pieces.filter(p=>p.team===team))assert.equal(contains(E.legalMoves(collecting,p.id),uncollectable),false,'no teammate can collect the remote pass in one move');
  for(const difficulty of ['casual','tactical']){
    const action=E.chooseAIAction(s,{difficulty});assert.equal(action.type,'kick');
    assert.ok(action.x!==uncollectable.x||action.y!==uncollectable.y);
    assert.ok(E.legalKicks(s).some(k=>k.x===action.x&&k.y===action.y));assert.equal(JSON.stringify(s),before);
  }
});
