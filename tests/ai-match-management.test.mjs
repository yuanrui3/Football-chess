import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../dist/engine.js';

const EARLY={durationSeconds:600,remainingSeconds:600};
const LATE={durationSeconds:600,remainingSeconds:0};
const UNTIMED={durationSeconds:0,remainingSeconds:null};
const clone=structuredClone;
const withScore=(state,white,black)=>({...state,score:{white,black}});
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-10,`${a} matches ${b}`);
function diagram({phase='kick',positions={},carrier='white-Q'}={}){
  const state=E.createGame({seed:71029,foulsEnabled:false});
  const assigned={'white-K':[6,16],'black-K':[7,0],...positions};
  const used=new Set(Object.values(assigned).map(q=>q.join(',')));
  const parking=Array.from({length:E.BOARD_HEIGHT},(_,y)=>[[0,y],[13,y]]).flat();
  for(const piece of state.pieces){const q=assigned[piece.id]||parking.find(q=>!used.has(q.join(',')));[piece.x,piece.y]=q;used.add(q.join(','));}
  const owner=state.pieces.find(p=>p.id===carrier);
  Object.assign(state,{phase,attack:owner.team,ball:{x:owner.x,y:owner.y,carrierId:owner.id},
    restart:null,offside:null,pendingShot:null,looseBallKickOrigin:null,paceControl:null,
    positionBudget:{normalUsed:false,pawnUsed:false,dribbleUsed:false},
    ballProgress:{team:owner.team,anchorY:owner.y,rounds:0,pendingRelease:false,excludeRelease:false}});
  assert.equal(new Set(state.pieces.map(p=>`${p.x},${p.y}`)).size,22);
  assert.ok(state.pieces.every(p=>E.canOccupySquare(p,p.x,p.y)));
  return state;
}
function legal(state,action){
  if(action.type==='kick')assert.ok(E.legalKicks(state).some(k=>k.x===action.x&&k.y===action.y));
  else if(action.type==='move')assert.ok(E.legalMoves(state,action.pieceId,{freePawn:!!action.freePawn}).some(m=>m.x===action.x&&m.y===action.y));
  else assert.equal(action.type,'skip');
}
function midfield(){
  const positions={
    'white-K':[6,16],'white-Q':[1,1],'white-R1':[1,13],'white-R2':[8,5],
    'white-B1':[7,9],'white-B2':[13,10],'white-N1':[3,9],'white-N2':[9,10],
    'white-P1':[5,11],'white-P2':[8,7],'white-P3':[8,13],
    'black-K':[6,0],'black-Q':[6,8],'black-R1':[9,3],'black-R2':[1,0],
    'black-B1':[11,4],'black-B2':[2,4],'black-N1':[9,9],'black-N2':[4,6],
    'black-P1':[6,7],'black-P2':[6,4],'black-P3':[4,3],
  };
  const state=diagram({carrier:'white-B1',positions});state.turn=12;
  state.ballProgress.anchorY=8;
  return state;
}

test('one goal changes preferences only 2% early to 6% late, with a 12% absolute cap',()=>{
  const state=withScore(E.createGame({seed:1}),0,1);
  const early=E.matchTacticsProfile(state,'white',EARLY),late=E.matchTacticsProfile(state,'white',LATE);
  close(early.aggression,.02);close(late.aggression,.06);
  close(E.matchTacticsProfile(state,'white',{durationSeconds:600,remainingSeconds:300}).aggression,.03);
  assert.equal(late.mode,'chasing');assert.ok(late.risk<early.risk);
  for(const margin of[2,5,30]){
    const s=withScore(state,0,margin),p=E.matchTacticsProfile(s,'white',LATE);
    close(p.aggression,.12);
    for(const name of['progress','support','risk','cover','press','shot','control'])assert.ok(p[name]>=.88&&p[name]<=1.12);
  }
});

test('leading and trailing mirror, draws stay balanced, and branch score changes update the plan',()=>{
  const state=withScore(E.createGame({seed:2}),0,1);
  const white=E.matchTacticsProfile(state,'white',LATE),black=E.matchTacticsProfile(state,'black',LATE);
  close(white.aggression,-black.aggression);assert.equal(black.mode,'protecting');
  for(const name of['progress','support','risk','cover','press','shot','control'])close(white[name]+black[name],2);
  assert.equal(E.matchTacticsProfile(withScore(state,1,1),'white',LATE).aggression,0);
  assert.equal(E.matchTacticsProfile(withScore(state,2,1),'white',LATE).mode,'protecting');
});

test('untimed matches have a mild score adjustment, while missing or malformed clock context is neutral',()=>{
  const state=withScore(E.createGame({seed:3}),0,1);
  close(E.matchTacticsProfile(state,'white',UNTIMED).aggression,.03);
  for(const context of[undefined,null,{},-1,{durationSeconds:-1,remainingSeconds:0},
    {durationSeconds:Infinity,remainingSeconds:0},{durationSeconds:600,remainingSeconds:-1},
    {durationSeconds:600,remainingSeconds:601},{durationSeconds:600,remainingSeconds:'1'},
    {durationSeconds:0,remainingSeconds:2}]){
    assert.equal(E.matchTacticsProfile(state,'white',context).aggression,0);
  }
});

test('invalid public context cannot revive private management metadata from an old analysis state',()=>{
  const state=withScore(midfield(),0,2),contaminated={...clone(state),aiMatchContext:LATE};
  const invalid={durationSeconds:-1,remainingSeconds:0};
  assert.deepEqual(E.chooseAIAction(contaminated,{difficulty:'casual',matchContext:invalid}),E.chooseAIAction(state,{difficulty:'casual'}));
  const options={maxDepth:2,nodeLimit:400,modelWeights:null};
  assert.deepEqual(E.analyzeTacticalAction(contaminated,{...options,matchContext:invalid}),E.analyzeTacticalAction(state,options));
  assert.deepEqual(contaminated.aiMatchContext,LATE,'read-only analysis does not repair the caller in place');
});

test('a level game retains its decision, and missing or invalid management preserves the complete legacy report',()=>{
  const state=E.createGame({seed:71029}),before=clone(state);
  for(const difficulty of['casual','tactical'])assert.deepEqual(
    E.chooseAIAction(state,{difficulty,modelWeights:null,selectionSeed:3,matchContext:LATE}),
    E.chooseAIAction(state,{difficulty,modelWeights:null,selectionSeed:3}));
  const options={maxDepth:3,nodeLimit:550,modelWeights:null,selectionSeed:3};
  const baseline=E.analyzeTacticalAction(state,options);
  assert.deepEqual(E.analyzeTacticalAction(state,{...options,matchContext:{durationSeconds:-1,remainingSeconds:0}}),baseline);
  const level=E.analyzeTacticalAction(state,{...options,matchContext:LATE});
  assert.deepEqual(level.action,baseline.action);assert.equal(level.value,baseline.value);
  assert.deepEqual(state,before);assert.equal(state.aiMatchContext,undefined);
});

test('a real midfield choice modestly prefers forward space when chasing and a controlled teammate when leading',()=>{
  const state=midfield(),before=clone(state);
  const behind=withScore(state,0,1),ahead=withScore(state,1,0);
  const chase=E.chooseAIAction(behind,{difficulty:'casual',matchContext:LATE});
  const protect=E.chooseAIAction(ahead,{difficulty:'casual',matchContext:LATE});
  legal(behind,chase);legal(ahead,protect);
  assert.equal(chase.type,'kick');assert.equal(protect.type,'kick');
  assert.ok(chase.y<state.ball.y,'the chasing side uses an onside forward delivery');
  assert.ok(protect.y>chase.y,'the leading side retains a more conservative option');
  assert.ok(state.pieces.some(p=>p.team==='white'&&p.x===protect.x&&p.y===protect.y));
  assert.deepEqual(state,before);
});

test('Tactical applies context in its bounded search while preserving the 2000 point goal value',()=>{
  const state=midfield(),options={maxDepth:3,nodeLimit:700,modelWeights:null};
  const behind=E.analyzeTacticalAction(withScore(state,0,1),{...options,matchContext:LATE});
  const ahead=E.analyzeTacticalAction(withScore(state,1,0),{...options,matchContext:LATE});
  legal(state,behind.action);legal(state,ahead.action);
  assert.ok(behind.stats.nodes<=700&&ahead.stats.nodes<=700);
  assert.ok(Math.abs((ahead.value-behind.value)-4000)<40,'management is a small positional preference beside one full goal');
  assert.ok(Math.abs((ahead.value-behind.value)-4000)>.01,'both actor preferences reach searched leaf values');
});

test('Tactical can choose a pressing queen response when chasing and deeper rook cover when protecting',()=>{
  const state=diagram({phase:'defendMove',carrier:'black-N1',positions:{
    'white-K':[6,16],'white-Q':[8,6],'white-R1':[11,7],'white-R2':[7,10],
    'white-B1':[3,11],'white-B2':[12,11],'white-N1':[3,9],'white-N2':[7,9],
    'white-P1':[8,12],'white-P2':[8,9],'white-P3':[10,13],
    'black-K':[6,0],'black-Q':[12,14],'black-R1':[9,6],'black-R2':[1,3],
    'black-B1':[11,4],'black-B2':[2,4],'black-N1':[3,14],'black-N2':[10,7],
    'black-P1':[7,8],'black-P2':[5,8],'black-P3':[4,4],
  }});state.turn=23;
  const options={modelWeights:null,maxDepth:4,nodeLimit:1400,matchContext:LATE};
  const chase=E.analyzeTacticalAction(withScore(state,0,2),options),protect=E.analyzeTacticalAction(withScore(state,2,0),options);
  legal(state,chase.action);legal(state,protect.action);
  assert.equal(chase.action.pieceId,'white-Q');assert.equal(protect.action.pieceId,'white-R2');
  assert.ok(protect.action.y>chase.action.y,'the conservative reply covers a deeper rank');
  assert.equal(chase.stats.completedDepth,4);assert.equal(protect.stats.completedDepth,4);
});

test('strong close-range finishes are still taken by both difficulty levels in every match situation',()=>{
  const state=diagram({positions:{'white-Q':[6,1]}}),before=clone(state);
  for(const difficulty of['casual','tactical'])for(const score of[[0,0],[0,2],[2,0]]){
    const s=withScore(state,...score),a=E.chooseAIAction(s,{difficulty,modelWeights:null,matchContext:LATE});legal(s,a);
    assert.equal(a.type,'kick');assert.ok(E.legalKicks(s).some(k=>k.x===a.x&&k.y===a.y&&k.goal==='white'));
  }
  assert.deepEqual(state,before);
});

test('guaranteed defensive tackles and goalkeeper reactions retain their native safety priorities',()=>{
  const defence=diagram({phase:'defendMove',positions:{'white-Q':[5,7],'black-R1':[5,3]}});
  const pending=E.applyKick(diagram({positions:{'white-Q':[6,1]}}),6,-1);
  const keeper=E.chooseAIAction(pending,{difficulty:'casual'});
  for(const difficulty of['casual','tactical'])for(const score of[[0,2],[2,0]]){
    const s=withScore(defence,...score),a=E.chooseAIAction(s,{difficulty,modelWeights:null,matchContext:LATE});legal(s,a);
    assert.equal(a.type,'move');assert.equal(a.pieceId,'black-R1');
    assert.ok(E.legalMoves(s,a.pieceId).some(m=>m.x===a.x&&m.y===a.y&&m.type==='tackle'&&m.tackleProbability===1));
    assert.deepEqual(E.chooseAIAction(withScore(pending,...score),{difficulty,modelWeights:null,matchContext:LATE}),keeper);
  }
});

test('current-round analysis ignores all match management even when a caller passes a private context',()=>{
  const state=withScore(midfield(),0,2),options={evaluationScope:'round',maxDepth:2,nodeLimit:500,modelWeights:null};
  const baseline=E.analyzeTacticalAction(state,options);
  assert.deepEqual(E.analyzeTacticalAction({...state,aiMatchContext:LATE},{...options,matchContext:LATE}),baseline);
});

test('management does not consume chance state, change legality or mutate the live game',()=>{
  const state=withScore(midfield(),0,1),before=clone(state);
  const options={modelWeights:null,maxDepth:3,nodeLimit:500,matchContext:LATE};
  const first=E.analyzeTacticalAction(state,options);
  const future={...clone(state),randomState:0xffffffff};
  assert.deepEqual(E.analyzeTacticalAction(future,options),first);
  assert.deepEqual(state,before);assert.equal(state.aiMatchContext,undefined);
});
