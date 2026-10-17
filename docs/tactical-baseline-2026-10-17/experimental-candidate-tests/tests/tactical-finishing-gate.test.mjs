import test from 'node:test';
import assert from 'node:assert/strict';
const E=await import('../dist/engine.js');
const other=t=>t==='white'?'black':'white';
function fixture(){
  const state=E.createGame({seed:7103});
  const positions={'white-K':[6,16],'black-K':[4,1],'white-R1':[7,6]};
  const used=new Set(Object.values(positions).map(p=>p.join(',')));
  const parking=Array.from({length:E.BOARD_HEIGHT},(_,y)=>[[0,y],[E.BOARD_WIDTH-1,y]]).flat();
  for(const p of state.pieces){const q=positions[p.id]||parking.find(q=>!used.has(q.join(',')));[p.x,p.y]=q;used.add(q.join(','));}
  Object.assign(state,{phase:'kick',attack:'white',ball:{x:7,y:6,carrierId:'white-R1'},positionBudget:{normalUsed:false,pawnUsed:false,dribbleUsed:false},restart:null,offside:null,pendingShot:null,paceControl:null,ballProgress:{team:'white',anchorY:6,rounds:0,pendingRelease:false,excludeRelease:false}});
  assert.equal(state.pieces.length,22);assert.equal(new Set(state.pieces.map(p=>`${p.x},${p.y}`)).size,22);
  assert.ok(state.pieces.every(p=>E.canOccupySquare(p,p.x,p.y)));
  return state;
}
function mirror(state){
  const id=v=>v?.replace(/^(white|black)/,other)??null,point=p=>({x:E.BOARD_WIDTH-1-p.x,y:E.BOARD_HEIGHT-1-p.y});
  const s=structuredClone(state);s.pieces=state.pieces.map(p=>({...p,...point(p),team:other(p.team),id:id(p.id)}));
  s.attack=other(state.attack);s.ball={...point(state.ball),carrierId:id(state.ball.carrierId)};
  s.ballProgress={...state.ballProgress,team:s.attack,anchorY:s.ball.y};return s;
}
function bestShot(state){
  let best=0;
  for(const kick of E.legalKicks(state).filter(k=>k.goal===state.attack&&!k.offside)){
    const pending=E.applyKick(state,kick.x,kick.y,{roll:0});
    assert.equal(pending.phase,'keeperReact');
    const keeper=pending.pieces.find(p=>p.team===E.currentTeam(pending)&&p.type==='K');
    best=Math.max(best,Math.min(E.shotChance(pending),...E.legalMoves(pending,keeper.id).map(m=>E.shotChance(pending,kick.x,kick.y,m))));
  }
  return best;
}
function point(s,x,y){return s.attack==='white'?{x,y}:{x:E.BOARD_WIDTH-1-x,y:E.BOARD_HEIGHT-1-y};}

// Public-rule counterexample: the current shot allows one reactive king step.
// Recycling creates a fresh defence with a normal step AND its shared bonus,
// then another reaction when the shot is declared. Those are distinct rights.
test('the delayed rook self-pass admits a legal two-step goalkeeper close-out, either color',()=>{
  for(let s of [fixture(),mirror(fixture())]){
    const initial=bestShot(s);assert.ok(initial>.67&&initial<.69);
    const team=s.attack,rook=`${team}-R1`,keeper=`${other(team)}-K`,target=point(s,7,3);
    const pass=E.legalKicks(s).find(k=>k.x===target.x&&k.y===target.y);assert.ok(pass&&!pass.goal&&pass.accuracy===1);
    s=E.applyKick(s,target.x,target.y,{roll:0});
    const collect=E.legalMoves(s,rook).find(m=>m.x===target.x&&m.y===target.y);assert.ok(collect);
    s=E.applyMove(s,rook,target.x,target.y);if(s.phase==='attackMove')s=E.skipMove(s);
    assert.equal(s.phase,'defendMove');assert.equal(s.positionBudget.normalUsed,false);assert.equal(s.positionBudget.pawnUsed,false);
    const free=point(s,5,0),normal=point(s,6,1);
    assert.ok(E.legalMoves(s,keeper,{freePawn:true}).some(m=>m.x===free.x&&m.y===free.y));
    s=E.applyMove(s,keeper,free.x,free.y,{freePawn:true});
    assert.equal(s.positionBudget.normalUsed,false);
    assert.ok(E.legalMoves(s,keeper).some(m=>m.x===normal.x&&m.y===normal.y));
    s=E.applyMove(s,keeper,normal.x,normal.y);assert.equal(s.phase,'kick');
    const delayed=bestShot(s);assert.ok(delayed<.24);assert.ok(initial-delayed>.43);
  }
});

test('handcrafted Tactical does not exchange this 67 percent finish for the known goalkeeper close-out, either color',()=>{
  for(const s of [fixture(),mirror(fixture())]){
    const before=structuredClone(s),report=E.analyzeTacticalAction(s,{modelWeights:null});
    const kick=E.legalKicks(s).find(k=>k.x===report.action.x&&k.y===report.action.y);
    assert.ok(kick&&kick.goal===s.attack,'take the immediate finish rather than a shallow-horizon self-pass');
    assert.deepEqual(s,before);assert.ok(report.stats.nodes<=1400);
  }
});
