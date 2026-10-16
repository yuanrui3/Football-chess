import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../dist/engine.js';
const other=t=>t==='white'?'black':'white';
const id=(v,t)=>t==='white'?v:v.replace(/^(white|black)/,other);
const point=([x,y],t)=>t==='white'?{x,y}:{x:E.BOARD_WIDTH-1-x,y:E.BOARD_HEIGHT-1-y};
const clone=s=>JSON.parse(JSON.stringify(s));
function fixture({team='white',phase='kick',carrier='white-R1',origin=[2,12],positions={}}={}){
  const s=E.createGame({mode:'local',seed:373}),assigned={'white-K':[6,15],'black-K':[7,1],'black-R2':[12,4],[carrier]:origin,...positions};
  const used=new Set(Object.values(assigned).map(p=>p.join(',')));assert.equal(used.size,Object.keys(assigned).length);
  const parking=side=>Array.from({length:17},(_,i)=>[side==='white'?[0,16-i]:[1,16-i],side==='white'?[13,16-i]:[12,16-i]]).flat();
  for(const p of s.pieces){const q=assigned[p.id]||parking(p.team).find(q=>!used.has(q.join(',')));assert.ok(q);[p.x,p.y]=q;used.add(q.join(','));if(team==='black'){p.id=id(p.id,team);p.team=other(p.team);Object.assign(p,point(q,team));}}
  const c=s.pieces.find(p=>p.id===id(carrier,team));s.ball={x:c.x,y:c.y,carrierId:c.id};s.phase=phase;s.attack=team;s.restart=null;s.offside=null;
  s.positionBudget={normalUsed:false,pawnUsed:false,dribbleUsed:false};s.ballProgress={team,anchorY:c.y,rounds:0,pendingRelease:false,excludeRelease:false};return s;
}
function kick(s,target,team,options={roll:0}){const p=point(target,team);assert.ok(E.legalKicks(s).some(k=>k.x===p.x&&k.y===p.y));return E.applyKick(s,p.x,p.y,options);}
function integrity(s){assert.equal(s.pieces.length,22);assert.equal(new Set(s.pieces.map(p=>`${p.x},${p.y}`)).size,22);for(const p of s.pieces){assert.ok(p.x>=0&&p.x<14&&p.y>=0&&p.y<17);assert.ok(E.canOccupySquare(p,p.x,p.y));}}

test('pitch, goals, boxes and midfield have independent centered dimensions',()=>{
  assert.equal(E.BOARD_WIDTH,14);assert.equal(E.BOARD_HEIGHT,17);assert.equal(E.RULES_VERSION,17);
  assert.deepEqual(E.GOAL_FILES,[5,6,7,8]);assert.deepEqual(E.BOX_FILES,[4,5,6,7,8,9]);assert.equal(E.BOX_DEPTH,3);
  assert.deepEqual(E.CENTRAL_GOAL_FILES,[6,7]);assert.equal(E.MIDFIELD_RANK,8);assert.equal(E.BOARD_CENTER_X,6.5);assert.equal(E.FILE_LABELS,'abcdefghijklmn');
  let cells=0;for(let y=-1;y<=17;y++)for(let x=-1;x<=14;x++){
    const expected=x>=4&&x<=9&&(y===0||y===1||y===2||y===14||y===15||y===16);assert.equal(E.isBox(x,y),expected,`${x},${y}`);if(expected)cells++;
  }assert.equal(cells,36);
  for(let y=0;y<17;y++){assert.equal(E.isOwnHalf('white',y),y>8);assert.equal(E.isOwnHalf('black',y),y<8);}
});

test('the new formation is legal, mirrored, screened by pawns and supplied by opposite-color bishops',()=>{
  for(const mode of ['solo','local'])for(const kickoff of ['white','black']){
    const s=E.createGame({mode,kickoff,seed:1});integrity(s);assert.deepEqual(s.boardDimensions,{width:14,height:17});assert.equal(s.rulesVersion,17);
    for(const team of ['white','black']){
      const own=s.pieces.filter(p=>p.team===team),king=own.find(p=>p.type==='K'),pawns=own.filter(p=>p.type==='P'),rooks=own.filter(p=>p.type==='R'),bishops=own.filter(p=>p.type==='B');
      assert.equal(own.length,11);assert.ok(E.inOwnBox(team,king.x,king.y));assert.equal(king.y,team==='white'?15:1);
      assert.ok(pawns.every(p=>p.y===(team==='white'?13:3)));assert.deepEqual(rooks.map(p=>p.x).sort((a,b)=>a-b),[1,12]);
      assert.notEqual((bishops[0].x+bishops[0].y)%2,(bishops[1].x+bishops[1].y)%2);
      assert.ok(own.some(p=>p.type==='N'&&p.y===(team==='white'?9:7)));
      for(const p of own)assert.ok(E.isOwnHalf(team,p.y)||p.id===`${kickoff}-Q`&&p.y===8);
    }
    const queen=s.pieces.find(p=>p.id===`${kickoff}-Q`);assert.deepEqual(s.ball,{x:kickoff==='white'?6:7,y:8,carrierId:queen.id});
  }
  const a=E.createGame({kickoff:'white',seed:1}),b=E.createGame({kickoff:'black',seed:1});
  for(const p of a.pieces){const q=b.pieces.find(q=>q.id===p.id.replace(/^(white|black)/,other));assert.deepEqual(q,{...p,id:q.id,team:other(p.team),x:13-p.x,y:16-p.y});}
});

for(const team of ['white','black']){
  test(`${team}: all four goal files are reachable and the extra box files do not become goals`,()=>{
    for(let x=0;x<14;x++){
      const s=fixture({team,origin:[x,6]}),target=point([x,-1],team),shot=E.legalKicks(s).find(k=>k.x===target.x&&k.y===target.y);
      assert.equal(!!shot,x>=5&&x<=8);if(shot)assert.equal(shot.goal,team);
    }
  });

  test(`${team}: expanded files and ranks are playable while moves remain within the new bounds`,()=>{
    const s=fixture({team,phase:'attackMove',origin:[12,8]}),target=point([13,8],team);
    assert.ok(E.legalMoves(s,id('white-R1',team)).some(m=>m.x===target.x&&m.y===target.y));
    const moved=E.applyMove(s,id('white-R1',team),target.x,target.y);assert.ok(moved.log.at(-1).includes(team==='white'?'n9':'a9'));integrity(moved);
    const n=fixture({team,phase:'attackMove',carrier:'white-N1',origin:[12,15]});
    assert.ok(E.legalMoves(n,id('white-N1',team)).length);for(const move of E.legalMoves(n,id('white-N1',team)))assert.ok(move.x>=0&&move.x<14&&move.y>=0&&move.y<17);
  });

  test(`${team}: wider boxes admit off-ball outfield players and their own king while excluding opposing kings and new dribble entries`,()=>{
    assert.equal(E.ALLOW_OUTFIELD_BOXES,true);
    const knight=fixture({team,phase:'attackMove',carrier:'white-Q',origin:[2,10],positions:{'white-N1':[8,3]}}),target=point([9,1],team);
    assert.ok(E.legalMoves(knight,id('white-N1',team)).some(m=>m.x===target.x&&m.y===target.y));
    assert.ok(E.isBox(target.x,target.y));assert.ok(!E.GOAL_FILES.includes(target.x));
    const carrying=clone(knight),carrier=carrying.pieces.find(piece=>piece.id===id('white-N1',team));
    carrying.ball={x:carrier.x,y:carrier.y,carrierId:carrier.id};
    assert.ok(!E.legalMoves(carrying,carrier.id).some(m=>m.x===target.x&&m.y===target.y));
    for(const type of ['K','Q','R1','B1','P1']){
      const s=fixture({team,phase:'attackMove',carrier:'white-N2',origin:[2,10],positions:{[`white-${type}`]:type==='B1'?[3,2]:[3,1]}}),p=point([4,1],team);
      assert.equal(E.legalMoves(s,id(`white-${type}`,team)).some(m=>m.x===p.x&&m.y===p.y),type!=='K');
      if(type!=='K')assert.ok(E.canOccupySquare(s.pieces.find(p=>p.id===id(`white-${type}`,team)),p.x,p.y));
    }
    const king=fixture({team,phase:'attackMove',positions:{'white-K':[4,13]}}),own=point([4,14],team);
    assert.ok(E.legalMoves(king,id('white-K',team)).some(m=>m.x===own.x&&m.y===own.y));
  });

  test(`${team}: offside and the progress half use the new neutral middle row`,()=>{
    for(const row of [7,8,9]){
      const s=fixture({team,positions:{'white-Q':[2,row],'black-R2':[12,10]}}),q=s.pieces.find(p=>p.id===id('white-Q',team)),info=E.offsideInfo(s);
      assert.equal(info.secondLastY,point([0,10],team).y);assert.equal(info.flaggedIds.includes(q.id),row===7);
      const next=kick(s,[2,row],team);assert.equal(next.lastAction.type,row===7?'offside':'kick');
      if(row!==7)assert.equal(E.progressInfo(next).active,row===9);
    }
  });

  test(`${team}: boundary restarts use the new touchlines, end lines and the six-wide goal box`,()=>{
    const s=fixture({team,origin:[2,14]}),target=[2,1];assert.ok(E.legalKicks(s).find(k=>k.x===point(target,team).x&&k.y===point(target,team).y).accuracy<1);
    const goalKick=kick(s,target,team,{roll:.999,landing:point([4,-3],team)});
    assert.equal(goalKick.restart.type,'goalKick');assert.equal(goalKick.restart.team,other(team));
    assert.deepEqual(goalKick.restart.spot,point([4,0],team));assert.ok(E.inOwnBox(other(team),goalKick.ball.x,goalKick.ball.y));assert.ok(!E.GOAL_FILES.includes(goalKick.ball.x));integrity(goalKick);
    const corner=kick(s,target,team,{roll:.999,landing:point([2,20],team)});assert.equal(corner.restart.type,'corner');
    assert.equal(corner.phase,'cornerSelect');assert.equal(corner.restart.takerId,null);
    assert.deepEqual(corner.restart.spot,point([0,16],team),'the pending corner retains the physical end-line spot until a taker is chosen');
    const taker=E.cornerTakers(corner)[0], selected=E.selectCornerTaker(corner,taker.id);
    assert.deepEqual(selected.restart.spot,point([1,16],team),'the occupied corner keeps its player, so the selected taker uses the adjacent end-line square');integrity(selected);
    const thrown=kick(s,target,team,{roll:.999,landing:point([17,1],team)});assert.equal(thrown.restart.type,'throwIn');assert.equal(thrown.restart.spot.x,point([13,0],team).x);assert.ok(thrown.restart.spot.y>=0&&thrown.restart.spot.y<17);integrity(thrown);
  });

  test(`${team}: a goal resets every piece to the expanded formation and a centered kickoff`,()=>{
    const s=fixture({team,origin:[6,4]}),pending=kick(s,[6,-1],team),scored=E.skipMove(pending,{roll:0});
    assert.equal(scored.lastAction.type,'goal');assert.equal(scored.score[team],1);assert.equal(scored.attack,other(team));assert.equal(scored.phase,'kickoff');
    assert.deepEqual(scored.pieces,E.createGame({kickoff:other(team),seed:373}).pieces);assert.deepEqual(scored.boardDimensions,{width:14,height:17});integrity(scored);
  });

  test(`${team}: valid current-geometry outfield box occupants survive normalization without displacement or randomness`,()=>{
    for(const suffix of ['Q','R1','B1','P1']){
      const s=fixture({team,carrier:`white-${suffix}`,origin:[4,0]}),before=clone(s),normalized=E.normalizeGame(s),p=normalized.pieces.find(p=>p.id===id(`white-${suffix}`,team));
      assert.deepEqual({x:p.x,y:p.y},point([4,0],team));assert.deepEqual(normalized.ball,{x:p.x,y:p.y,carrierId:p.id});assert.equal(normalized.randomState,before.randomState);assert.deepEqual(s,before);
      for(const q of before.pieces.filter(q=>q.id!==p.id))assert.deepEqual(normalized.pieces.find(p=>p.id===q.id),q);
      assert.deepEqual(E.normalizeGame(clone(normalized)),normalized);integrity(normalized);
    }
  });

  test(`${team}: every offside outfield box occupant is involved at the kick, even away from the shot path`,()=>{
    for(const suffix of ['Q','R1','B1','N1','P1']){
      const s=fixture({team,carrier:'white-R2',origin:[5,6],positions:{[`white-${suffix}`]:[4,1]}}),offender=id(`white-${suffix}`,team),aim=point([5,-1],team),before=clone(s);
      assert.ok(E.offsideInfo(s).boxAttackerIds.includes(offender));
      const shot=E.legalKicks(s).find(k=>k.x===aim.x&&k.y===aim.y);assert.ok(shot?.goal);assert.equal(shot.offside,true);assert.equal(shot.offsidePieceId,offender);
      const stopped=E.applyKick(s,aim.x,aim.y);assert.equal(stopped.lastAction.type,'offside');assert.equal(stopped.lastAction.offenderId,offender);
      assert.equal(stopped.pendingShot,null);assert.equal(stopped.randomState,s.randomState);assert.deepEqual(s,before);
      const corner=fixture({team,carrier:'white-R2',origin:[0,0],positions:{[`white-${suffix}`]:[4,1]}}),pass=point([2,0],team);
      corner.restart={type:'corner',team,takerId:id('white-R2',team),spot:{x:corner.ball.x,y:corner.ball.y},indirect:false};
      const restarted=E.applyKick(corner,pass.x,pass.y,{roll:0});assert.notEqual(restarted.lastAction.type,'offside');
    }
  });
}

test('old pitch dimensions or old untagged saves are rejected without translating their coordinates',()=>{
  for(const dimensions of [{width:12,height:15},{width:14,height:15},{width:12,height:17}]){
    const s=E.createGame({seed:1});s.boardDimensions=dimensions;const before=clone(s);assert.throws(()=>E.normalizeGame(s),/different pitch size.*14 × 17/);assert.deepEqual(s,before);
  }
  const old=E.createGame({seed:1});delete old.boardDimensions;old.rulesVersion=13;assert.throws(()=>E.normalizeGame(old),/different pitch size/);
  const legacyFixture=E.createGame({seed:1});legacyFixture.rulesVersion=6;const before=clone(legacyFixture),normalized=E.normalizeGame(legacyFixture);
  assert.equal(normalized.rulesVersion,17);assert.deepEqual(normalized.boardDimensions,{width:14,height:17});assert.deepEqual(normalized.pieces,before.pieces);assert.equal(normalized.randomState,before.randomState);assert.deepEqual(legacyFixture,before);
});
