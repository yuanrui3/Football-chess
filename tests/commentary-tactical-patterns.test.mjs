import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../dist/engine.js';
import {createTacticalCommentary,TACTICAL_COMMENTARY_SCRIPTS} from '../dist/commentary-tactics.js';

const clone=structuredClone;
const other=t=>t==='white'?'black':'white';
const own=(team,id)=>`${team}-${id}`;
const spot=(team,x,y)=>team==='white'?{x,y}:{x:E.BOARD_WIDTH-1-x,y:E.BOARD_HEIGHT-1-y};
function fixture(placements,{team='white',phase='kick',carrier='white-Q',restart=null}={}) {
  const state=E.createGame({mode:'local',seed:173,foulsEnabled:false});
  const byId={'white-K':['K',6,16],'black-K':['K',7,0],'black-R2':['R',13,0],...placements};
  state.pieces=Object.entries(byId).map(([id,[type,x,y]])=>({id,type,x,y,team:id.split('-')[0]}));
  const p=state.pieces.find(p=>p.id===carrier);
  Object.assign(state,{phase,attack:'white',ball:{x:p.x,y:p.y,carrierId:p.id},turn:3,restart,
    pendingShot:null,offside:null,paceControl:null,passRun:null,looseBallKickOrigin:null,lastAction:null,
    positionBudget:{normalUsed:false,pawnUsed:false,dribbleUsed:false},
    ballProgress:{team:'white',anchorY:p.y,rounds:0,pendingRelease:false,excludeRelease:false}});
  assert.equal(new Set(state.pieces.map(p=>`${p.x},${p.y}`)).size,state.pieces.length);
  assert.ok(state.pieces.every(p=>E.canOccupySquare(p,p.x,p.y)));
  if(team==='white')return state;
  const mirror=value=>Array.isArray(value)?value.map(mirror):value&&typeof value==='object'
    ? Object.fromEntries(Object.entries(value).map(([key,v])=>[key,key==='x'?E.BOARD_WIDTH-1-v:key==='y'?E.BOARD_HEIGHT-1-v:key==='anchorY'?E.BOARD_HEIGHT-1-v:mirror(v)]))
    : typeof value==='string'?value.replace(/^(white|black)(?=-|$)/,m=>other(m)):value;
  return mirror(state);
}
function observer() {
  const analyser=createTacticalCommentary();
  const observe=(before,after,completedRound=false)=>{
    const input=clone({before,after});
    analyser.observe(before,after,{completedRound});
    analyser.lines(after);
    assert.deepEqual({before,after},input,'recognition never mutates positions or future randomness');
    return after;
  };
  return {analyser,observe,has:(state,key)=>analyser.lines(state).some(line=>line.clipKey===key),
    call:(state,key)=>analyser.lines(state).find(line=>line.clipKey===key)};
}
function pass(h,state,team,id) {
  while(state.phase!=='kick')state=h.observe(state,E.skipMove(state));
  const receiver=state.pieces.find(p=>p.id===own(team,id));
  const kick=E.legalKicks(state).find(k=>k.x===receiver.x && k.y===receiver.y && k.receiverId===receiver.id && !k.offside);
  assert.ok(kick,`${receiver.id} is a native legal onside receiver`);
  const next=E.applyKick(state,kick.x,kick.y,{roll:0});
  assert.equal(next.lastAction.type,'kick');assert.equal(next.lastAction.outcome,'complete');
  return h.observe(state,next,true);
}
function controlPosition(team='white',variant='good') {
  const placements={'white-Q':['Q',6,9],'white-R1':['R',6,7],'white-R2':['R',8,7],
    'white-B1':['B',8,9],'white-N1':['N',10,7]};
  if(variant==='blocked')placements['black-P1']=['P',9,8];
  if(variant==='offside') {placements['white-N1']=['N',12,5];placements['black-R2']=['R',13,6];}
  return fixture(placements,{team});
}
function prepareControl(h,team,variant='good') {
  let state=controlPosition(team,variant);
  for(const id of ['R1','R2','B1'])state=pass(h,state,team,id);
  return state;
}
function wingPosition(team='white',variant='good') {
  const x=variant==='adjacent'?3:1,c=variant==='adjacent'?4:6,n=variant==='adjacent'?4:5;
  const placements={'white-R1':['R',x,5],'white-Q':['Q',x,3],'white-R2':['R',c,5],
    'white-N1':['N',n,3],'white-B1':['B',variant==='adjacent'?1:3,6],
    'black-P1':['P',0,4],'black-R2':['R',12,1]};
  if(variant==='blocked')placements['black-P2']=['P',3,3];
  if(variant==='outnumbered')Object.assign(placements,{'black-P2':['P',0,5],'black-N1':['N',0,6],'black-B1':['B',0,3]});
  if(variant==='offside')placements['black-R2']=['R',12,4];
  return fixture(placements,{team,carrier:'white-R1'});
}

for(const team of ['white','black']) {
  test(`${team}: midfield control needs three native rounds, three pieces and repeated usable outlets`,()=>{
    const h=observer();let state=controlPosition(team);
    for(const id of ['R1','R2'])state=pass(h,state,team,id);
    assert.equal(h.has(state,'tactic_control'),false);
    state=pass(h,state,team,'B1');
    const call=h.call(state,'tactic_control');assert.ok(call);assert.equal(call.tactical.rounds,3);
    assert.equal(call.tactical.minimumOutlets,2);assert.equal(call.tactical.evidenceScope,'rolling');
    assert.equal(call.tactical.label,'Midfield control');assert.equal(call.team,team);
  });
  test(`${team}: a nearby blocked or offside teammate is not midfield passing support`,()=>{
    for(const variant of ['blocked','offside']) {const h=observer(),state=prepareControl(h,team,variant);assert.equal(h.has(state,'tactic_control'),false,variant);}
  });
  test(`${team}: a wing overload requires two held rounds and a real central cross`,()=>{
    const h=observer();let state=wingPosition(team);
    state=pass(h,state,team,'Q');assert.equal(h.has(state,'tactic_wing_overload'),false);
    state=pass(h,state,team,'R1');const call=h.call(state,'tactic_wing_overload');assert.ok(call);
    assert.equal(call.tactical.attackers,3);assert.equal(call.tactical.defenders,1);
    assert.equal(call.tactical.receiverId,own(team,'R2'));
  });
  test(`${team}: close central passes, blocked crosses and equal local numbers are not a wing overload`,()=>{
    for(const variant of ['adjacent','blocked','outnumbered']) {
      const h=observer();let state=wingPosition(team,variant);state=pass(h,state,team,'Q');state=pass(h,state,team,'R1');
      assert.equal(h.has(state,'tactic_wing_overload'),false,variant);
    }
  });
  test(`${team}: the pawn's real bonus step then successful diagonal tackle is a pressing trap`,()=>{
    const h=observer();let state=fixture({'white-Q':['Q',6,4],'black-P1':['P',5,6]}, {team,phase:'defendMove'});
    const defender=other(team),p=spot(team,5,5),landing=spot(team,6,3);
    state=h.observe(state,E.applyMove(state,own(defender,'P1'),p.x,p.y,{freePawn:true}));
    assert.equal(h.has(state,'tactic_pawn_trap'),false);
    state=h.observe(state,E.applyMove(state,own(defender,'P1'),landing.x,landing.y));
    const call=h.call(state,'tactic_pawn_trap');assert.ok(call);assert.equal(call.team,defender);
    assert.equal(call.tactical.pieceId,own(defender,'P1'));
    const next=h.observe(state,E.skipMove(state));assert.ok(h.has(next,'tactic_pawn_trap'));
    h.analyser.reset();assert.equal(h.has(next,'tactic_pawn_trap'),false);
  });
  test(`${team}: a normal approach or evaded knight challenge does not establish a pawn trap`,()=>{
    const h=observer();let state=fixture({'white-N1':['N',6,4],'black-P1':['P',5,6]}, {team,phase:'defendMove',carrier:'white-N1'});
    const defender=other(team),p=spot(team,5,5),landing=spot(team,6,3);
    state=h.observe(state,E.applyMove(state,own(defender,'P1'),p.x,p.y,{freePawn:true}));
    state=h.observe(state,E.applyMove(state,own(defender,'P1'),landing.x,landing.y,{roll:0.99}));
    assert.equal(state.lastAction.type,'tackleMiss');assert.equal(h.has(state,'tactic_pawn_trap'),false);
    const normal=observer();state=fixture({'white-Q':['Q',6,4],'black-P1':['P',5,6]}, {team,phase:'defendMove'});
    state=normal.observe(state,E.applyMove(state,own(defender,'P1'),p.x,p.y));assert.equal(normal.has(state,'tactic_pawn_trap'),false);
  });
  test(`${team}: a quick nearby regain after an observed loss is counter-pressing`,()=>{
    const h=observer();let state=fixture({'white-Q':['Q',6,7],'white-R1':['R',7,10],'black-R1':['R',6,5]}, {team,phase:'defendMove'});
    const first=spot(team,7,7),second=spot(team,6,6);
    state=h.observe(state,E.applyMove(state,own(other(team),'R1'),first.x,first.y));
    assert.equal(h.has(state,'tactic_counterpress'),false);
    state=h.observe(state,E.skipMove(state));
    state=h.observe(state,E.applyMove(state,own(team,'R1'),second.x,second.y));
    const call=h.call(state,'tactic_counterpress');assert.ok(call);assert.equal(call.team,team);
    assert.equal(call.tactical.distanceFromLoss,1);assert.equal(call.tactical.opponentAdvance,0);
  });
  test(`${team}: a regain without an observed loss or after significant opponent progress is not a counter-press`,()=>{
    const h=observer();let state=fixture({'white-Q':['Q',6,7],'white-R1':['R',6,10],'black-R1':['R',6,5]}, {team,phase:'defendMove'});
    const first=spot(team,7,7),carry=spot(team,7,10),second=spot(team,6,9);
    state=h.observe(state,E.applyMove(state,own(other(team),'R1'),first.x,first.y));
    state=h.observe(state,E.applyMove(state,own(other(team),'R1'),carry.x,carry.y));
    state=h.observe(state,E.skipMove(state));
    const before=state;state=h.observe(state,E.applyMove(state,own(team,'R1'),second.x,second.y));
    assert.equal(h.has(state,'tactic_counterpress'),false,'three squares of opponent progress ends the counter-press window');
    const fresh=observer();fresh.observe(before,state);assert.equal(fresh.has(state,'tactic_counterpress'),false,'a regain alone cannot invent a prior loss');
  });
  test(`${team}: clearing an actual friendly blocker uncovers the rook file`,()=>{
    const h=observer();let state=fixture({'white-R1':['R',6,3],'white-P1':['P',6,2],'black-R2':['R',12,1]}, {team,phase:'attackMove',carrier:'white-R1'});
    const to=spot(team,5,2),goal=spot(team,6,-1);
    assert.equal(E.legalKicks({...state,phase:'kick'}).some(k=>k.goal===team && k.x===goal.x),false);
    state=h.observe(state,E.applyMove(state,own(team,'P1'),to.x,to.y,{freePawn:true}));
    const call=h.call(state,'tactic_file_attack');assert.ok(call);assert.equal(call.tactical.pieceId,own(team,'R1'));
    assert.equal(call.tactical.clearingPieceId,own(team,'P1'));
  });
  test(`${team}: an unrelated move cannot claim to clear a rook's already open file`,()=>{
    const h=observer();let state=fixture({'white-R1':['R',6,3],'white-P1':['P',5,2],'black-R2':['R',12,1]}, {team,phase:'attackMove',carrier:'white-R1'});
    const to=spot(team,4,2);state=h.observe(state,E.applyMove(state,own(team,'P1'),to.x,to.y,{freePawn:true}));
    assert.equal(h.has(state,'tactic_file_attack'),false);
  });
  test(`${team}: removing one friendly obstruction does not clear remaining enemy shot traffic`,()=>{
    const h=observer();let state=fixture({'white-R1':['R',6,4],'white-P1':['P',6,3],
      'black-P1':['P',6,2],'black-R2':['R',12,1]}, {team,phase:'attackMove',carrier:'white-R1'});
    const to=spot(team,5,3);state=h.observe(state,E.applyMove(state,own(team,'P1'),to.x,to.y,{freePawn:true}));
    const shots=E.legalKicks({...state,phase:'kick'}).filter(k=>k.goal===team&&!k.offside);
    assert.ok(shots.length);assert.ok(shots.some(k=>k.shotModel.blockerIds.length));
    assert.equal(h.has(state,'tactic_file_attack'),false);
  });
  test(`${team}: a cleared rook shot cannot begin a delayed call after the lane closes`,()=>{
    const h=observer();let state=fixture({'white-R1':['R',6,3],'white-P1':['P',6,2],'black-R2':['R',12,1]}, {team,phase:'attackMove',carrier:'white-R1'});
    const to=spot(team,5,2);state=h.observe(state,E.applyMove(state,own(team,'P1'),to.x,to.y,{freePawn:true}));
    assert.equal(h.has(state,'tactic_file_attack'),true);
    const closed=structuredClone(state);Object.assign(closed.pieces.find(p=>p.id===own(other(team),'R2')),spot(team,6,1));
    assert.equal(h.has(closed,'tactic_file_attack'),false);
  });
  test(`${team}: keeper distribution identifies a completed native loft beyond halfway`,()=>{
    const restart={type:'goalKick',team:'white',takerId:'white-K',spot:{x:6,y:15}};
    const h=observer();let state=fixture({'white-K':['K',6,15],'white-P1':['P',6,13],'white-R1':['R',6,7]}, {team,carrier:'white-K',restart});
    const receiver=state.pieces.find(p=>p.id===own(team,'R1'));
    const kick=E.legalKicks(state).find(k=>k.receiverId===receiver.id);assert.ok(kick.lofted);
    state=h.observe(state,E.applyKick(state,receiver.x,receiver.y,{roll:0}),true);
    const call=h.call(state,'tactic_keeper_launch');assert.ok(call);assert.equal(call.team,team);
    assert.equal(call.tactical.bypassedPieceId,own(team,'P1'));assert.equal(call.tactical.distance,8);
  });
  test(`${team}: a straight keeper pass without loft is not described as bypassing a player`,()=>{
    const restart={type:'goalKick',team:'white',takerId:'white-K',spot:{x:6,y:15}};
    const h=observer();let state=fixture({'white-K':['K',6,15],'white-R1':['R',6,7]}, {team,carrier:'white-K',restart});
    const receiver=state.pieces.find(p=>p.id===own(team,'R1'));
    state=h.observe(state,E.applyKick(state,receiver.x,receiver.y,{roll:0}),true);
    assert.equal(h.has(state,'tactic_keeper_launch'),false);
  });
}

test('short action patterns expire after later native play and explicit reset clears rolling assessments',()=>{
  const h=observer();let state=fixture({'white-R1':['R',6,3],'white-P1':['P',6,2],
    'white-Q':['Q',4,3],'white-R2':['R',4,5],'white-B1':['B',6,5],'black-R2':['R',12,1]},
    {phase:'attackMove',carrier:'white-R1'});
  state=h.observe(state,E.applyMove(state,'white-P1',5,2,{freePawn:true}));
  assert.equal(h.has(state,'tactic_file_attack'),true);
  for(const id of ['Q','R2','B1'])state=pass(h,state,'white',id);
  assert.equal(h.has(state,'tactic_file_attack'),false,'an old line clearance cannot keep returning after later rounds');
  const controlled=prepareControl(h,'white');assert.equal(h.has(controlled,'tactic_control'),true);
  const restart=E.actionTimeout(controlled);h.observe(controlled,restart);
  assert.deepEqual(h.analyser.lines(restart),[],'restart preparation has no invented open-play tactic');
  h.analyser.reset();assert.deepEqual(h.analyser.lines(controlled),[],'undo/new match reset removes the evidence');
});

test('new pattern recordings describe evidence rather than assigning a preset or claiming a guaranteed goal',()=>{
  for(const key of ['tactic_control','tactic_wing_overload','tactic_pawn_trap','tactic_counterpress','tactic_file_attack','tactic_keeper_launch']) {
    const script=TACTICAL_COMMENTARY_SCRIPTS[key];assert.ok(script);assert.ok(Object.isFrozen(script));
    assert.doesNotMatch(script.text,/they will|guaranteed|aggressive setup|defensive setup/i);
  }
});
