import test from 'node:test';
import assert from 'node:assert/strict';
import {createTacticalCommentary,TACTICAL_COMMENTARY_SCRIPTS} from '../dist/commentary-tactics.js';
import {BOARD_WIDTH,BOARD_HEIGHT} from '../dist/engine.js';

const other=t=>t==='white'?'black':'white';
function position(team='white') {
  const pieces=[
    ['white-K','K',6,15],['white-Q','Q',6,10],['white-R1','R',2,9],['white-R2','R',11,9],
    ['white-B1','B',5,8],['white-B2','B',8,8],['white-N1','N',3,6],['white-N2','N',10,6],
    ['white-P1','P',4,12],['white-P2','P',6,12],['white-P3','P',9,12],
    ['black-K','K',6,1],['black-Q','Q',6,5],['black-R1','R',4,3],['black-R2','R',9,3],
    ['black-B1','B',5,4],['black-B2','B',8,4],['black-N1','N',2,7],['black-N2','N',11,7],
    ['black-P1','P',4,5],['black-P2','P',7,5],['black-P3','P',9,5],
  ].map(([id,type,x,y])=>({id,type,x,y,team:id.split('-')[0]}));
  const s={pieces,attack:'white',phase:'attackMove',turn:1,ball:{x:6,y:10,carrierId:'white-Q'},score:{white:0,black:0},restart:null,pendingShot:null,lastAction:null};
  return team==='white'?s:mirror(s);
}
function mirror(s) {
  const out=structuredClone(s),id=v=>typeof v==='string'?v.replace(/^(white|black)/,m=>other(m)):v;
  out.attack=other(s.attack);out.score={white:s.score.black,black:s.score.white};
  out.pieces=s.pieces.map(p=>({...p,id:id(p.id),team:other(p.team),x:BOARD_WIDTH-1-p.x,y:BOARD_HEIGHT-1-p.y}));
  out.ball={...s.ball,x:BOARD_WIDTH-1-s.ball.x,y:BOARD_HEIGHT-1-s.ball.y,carrierId:id(s.ball.carrierId)};
  return out;
}
function step(before,{type='move',pieceId=before.ball.carrierId,team=before.attack,to=null,receiverId=null,outcome=null,attack=before.attack,phase='attackMove',completed=true,...details}={}) {
  const after=structuredClone(before),actor=before.pieces.find(p=>p.id===pieceId);
  const from=actor?{x:actor.x,y:actor.y}:{x:before.ball.x,y:before.ball.y};
  to ||= {x:from.x,y:from.y};
  after.turn++;after.attack=attack;after.phase=phase;
  after.lastAction={type,team,pieceId,from,to:{...to},...(receiverId?{receiverId}:{}),...(outcome?{outcome}:{}),...details};
  if(type==='kick'||['miss','out','interception','offside'].includes(type)) {
    after.ball={...to,carrierId:receiverId};
    const receiver=after.pieces.find(p=>p.id===receiverId);if(receiver)Object.assign(receiver,to);
  } else if(type==='move'||type==='tackle') {
    const moved=after.pieces.find(p=>p.id===pieceId);if(moved)Object.assign(moved,to);
    if(before.ball.carrierId===pieceId||type==='tackle')after.ball={...to,carrierId:pieceId};
  }
  return after;
}
function sample(a,s,n=6) {
  for(let i=0;i<n;i++) {const next=step(s,{pieceId:null});a.observe(s,next,{completedRound:true});s=next;}
  return s;
}
const keys=(a,s)=>a.lines(s).map(l=>l.clipKey);

test('script bank is finite, immutable and exact; calls are historical observations without ratings',()=>{
  assert.equal(Object.keys(TACTICAL_COMMENTARY_SCRIPTS).length,45);
  assert.ok(Object.isFrozen(TACTICAL_COMMENTARY_SCRIPTS));
  for(const v of Object.values(TACTICAL_COMMENTARY_SCRIPTS)) {
    assert.ok(v.text&&['normal','urgent'].includes(v.delivery));
    assert.doesNotMatch(v.text,/accuracy|rating|percent|4-3-3|will score/i);
  }
});

for(const team of ['white','black']) test(`${team}: counter needs a real turnover and four squares of gain within three rounds`,()=>{
  const a=createTacticalCommentary();let before=position(team);before.attack=other(team);
  const q=before.pieces.find(p=>p.id===team+'-Q');
  let s=step(before,{type:'tackle',pieceId:q.id,team,attack:team,to:{x:q.x,y:q.y},outcome:'won'});
  a.observe(before,s,{completedRound:false});assert.ok(!keys(a,s).includes('tactic_counter'));
  const to={x:q.x,y:q.y+(team==='white'?-4:4)},next=step(s,{to});
  a.observe(s,next,{completedRound:true});assert.ok(keys(a,next).includes('tactic_counter'));
  const call=a.lines(next).find(l=>l.clipKey==='tactic_counter');assert.equal(call.tactical.forwardGain,4);
  assert.equal(call.team,team);assert.equal(call.tactical.live,false);
  s=sample(a,next,4);assert.ok(!keys(a,s).includes('tactic_counter'),'the counter window expires');
});

test('initial kickoff and kick-based restart changes never manufacture a counterattack',()=>{
  for(const kind of ['kickoff','restart']) {
    const a=createTacticalCommentary(),before=position();before.attack='black';
    if(kind==='kickoff')before.phase='kickoff';else before.restart={type:'freeKick',team:'black'};
    const after=step(before,{type:'kick',pieceId:'white-Q',team:'white',attack:'white',to:{x:6,y:5},outcome:'complete',receiverId:'white-N1'});
    after.restart=null;a.observe(before,after,{completedRound:true});
    assert.ok(!keys(a,after).includes('tactic_counter'));
  }
});

test('single and multi-pass cross-pitch switches require reaching the opposite wing',()=>{
  const a=createTacticalCommentary();let s=position();
  Object.assign(s.pieces.find(p=>p.id==='white-Q'),{x:1,y:10});s.ball={x:1,y:10,carrierId:'white-Q'};
  let next=step(s,{type:'kick',to:{x:6,y:8},receiverId:'white-B1',outcome:'complete'});
  a.observe(s,next,{completedRound:true});assert.ok(!keys(a,next).includes('tactic_switch'));
  s=next;next=step(s,{type:'kick',to:{x:11,y:7},receiverId:'white-R2',outcome:'complete'});
  a.observe(s,next,{completedRound:true});assert.ok(keys(a,next).includes('tactic_switch'));
  const b=createTacticalCommentary();b.observe(s,next,{completedRound:true});
  assert.ok(!keys(b,next).includes('tactic_switch'),'starting in the centre is not already a switch');
});

test('three short passes through distinct pieces identify combinations, rather than one pass or self-passes',()=>{
  const a=createTacticalCommentary();let s=position();
  for(const [receiverId,to] of [['white-B1',{x:6,y:8}],['white-R1',{x:6,y:6}],['white-N1',{x:6,y:4}]]) {
    const n=step(s,{type:'kick',receiverId,to,outcome:'complete'});a.observe(s,n,{completedRound:true});s=n;
  }
  assert.ok(keys(a,s).includes('tactic_combinations'));
  const b=createTacticalCommentary();s=position();
  for(let i=0;i<3;i++){const n=step(s,{type:'kick',receiverId:'white-Q',to:{x:6,y:9-i},outcome:'complete'});b.observe(s,n,{completedRound:true});s=n;}
  assert.ok(!keys(b,s).includes('tactic_combinations'));
});

for(const team of ['white','black']) test(`${team}: sustained territory needs completed rounds and mirrors direction`,()=>{
  const a=createTacticalCommentary();let s=position(team),q=s.pieces.find(p=>p.id===team+'-Q');
  q.y=team==='white'?4:12;s.ball={x:q.x,y:q.y,carrierId:q.id};
  s=sample(a,s,2);assert.ok(!keys(a,s).includes('tactic_pressure'));
  s=sample(a,s,1);assert.ok(keys(a,s).includes('tactic_pressure'));
  const b=createTacticalCommentary();s=position(team);s=sample(b,s,3);assert.ok(!keys(b,s).includes('tactic_pressure'));
});

test('loose final-third balls do not establish sustained possession',()=>{
  const a=createTacticalCommentary();let s=position();s.ball={x:6,y:3,carrierId:null};
  s=sample(a,s,3);assert.ok(!keys(a,s).includes('tactic_pressure'));
});

test('a keeper loose save or loose block is not a held possession regain',()=>{
  for(const type of ['save','blockedShot']) {
    const a=createTacticalCommentary();let before=position();before.attack='black';before.phase='keeperReact';before.pendingShot={shootingTeam:'black'};
    let after=step(before,{type,pieceId:'black-Q',team:'white',attack:'white',outcome:'loose',keeperId:'white-K'});
    after.pendingShot=null;after.ball={x:6,y:12,carrierId:null};
    a.observe(before,after,{completedRound:false});
    const next=step(after,{pieceId:'white-Q',to:{x:6,y:6}});next.ball={x:6,y:6,carrierId:'white-Q'};
    a.observe(after,next,{completedRound:true});assert.ok(!keys(a,next).includes('tactic_counter'));
  }
});

test('shape needs six stable completed rounds; subactions and replayed transitions do not inflate it',()=>{
  const a=createTacticalCommentary();let s=position();
  s=sample(a,s,5);assert.ok(!keys(a,s).some(k=>k.startsWith('shape_')));
  const next=step(s,{pieceId:null});a.observe(s,next,{completedRound:false});a.observe(s,next,{completedRound:true});
  assert.ok(!keys(a,next).some(k=>k.startsWith('shape_')),'a repeated observed transition does not add a round');
  s=sample(a,next,1);const shape=a.lines(s).filter(l=>l.clipKey.startsWith('shape_'));
  assert.ok(shape.length);assert.ok(shape.every(l=>l.tactical.rounds===6));
});

test('a flat but full-width defence is not a compact block',()=>{
  const a=createTacticalCommentary();let s=position();
  for(const [i,p] of s.pieces.filter(p=>p.team==='black'&&p.type!=='K').entries()){p.x=i===0?0:i===9?13:3+i%7;p.y=4;}
  s=sample(a,s,6);assert.ok(!keys(a,s).includes('shape_compact'));
  const b=createTacticalCommentary();s=position();
  for(const [i,p] of s.pieces.filter(p=>p.team==='black'&&p.type!=='K').entries()){p.x=4+i%6;p.y=3+Math.floor(i/6);}
  s=sample(b,s,6);assert.ok(keys(b,s).includes('shape_compact'));
});

test('no absent-teammate isolation or one-frame shape claims',()=>{
  const a=createTacticalCommentary();let s=position();s.pieces=s.pieces.filter(p=>p.team!=='white'||['white-K','white-Q'].includes(p.id));
  s=sample(a,s,6);assert.ok(!keys(a,s).includes('shape_isolated'));
  const b=createTacticalCommentary();s=position();s.pieces.filter(p=>p.team==='white'&&p.type!=='K'&&p.id!=='white-Q').forEach(p=>{p.x=0;p.y=16;});
  s=sample(b,s,6);assert.ok(keys(b,s).includes('shape_isolated'));
});

test('forward passing performance is credited to the actual piece, not a role aggregate',()=>{
  const a=createTacticalCommentary();let s=position();
  for(let i=0;i<2;i++) {
    s.ball={x:6,y:12,carrierId:'white-Q'};Object.assign(s.pieces.find(p=>p.id==='white-Q'),{x:6,y:12});
    const next=step(s,{type:'kick',to:{x:6,y:9},receiverId:'white-R1',outcome:'complete'});
    a.observe(s,next,{completedRound:true});s=next;
  }
  const call=a.lines(s).find(l=>l.clipKey==='performance_progress_queen');
  assert.equal(call.tactical.pieceId,'white-Q');assert.equal(call.tactical.completedForwardPasses,2);assert.equal(call.tactical.forwardGain,6);
  assert.equal(call.text,TACTICAL_COMMENTARY_SCRIPTS[call.clipKey].text);
  const b=createTacticalCommentary();s=position();
  for(const pieceId of ['white-R1','white-R2','white-R1']) {
    s.ball={x:2,y:10,carrierId:pieceId};Object.assign(s.pieces.find(p=>p.id===pieceId),{x:2,y:10});
    const next=step(s,{type:'kick',to:{x:2,y:8},receiverId:'white-B1',outcome:'complete'});b.observe(s,next,{completedRound:true});s=next;
  }
  assert.ok(!keys(b,s).includes('performance_progress_rook'));
});

test('carrying performance requires two observed carrier moves and at least six forward squares',()=>{
  for(const gains of [[3,3],[1,1],[6]]) {
    const a=createTacticalCommentary();let s=position();
    for(const amount of gains) {const next=step(s,{to:{x:s.ball.x,y:s.ball.y-amount}});a.observe(s,next,{completedRound:true});s=next;}
    const call=a.lines(s).find(l=>l.clipKey==='performance_carry_queen');
    assert.equal(!!call,gains.length>=2&&gains.reduce((a,b)=>a+b,0)>=6);
    if(call){assert.equal(call.tactical.forwardCarries,2);assert.equal(call.tactical.forwardGain,6);assert.doesNotMatch(call.text,/unopposed|safe|unmarked/);}
  }
});

test('off-ball moves and ball collections never count as forward dribbles',()=>{
  const a=createTacticalCommentary();let s=position();
  for(let i=0;i<3;i++) {const n=step(s,{pieceId:'white-R1',to:{x:2,y:8-i*2}});a.observe(s,n,{completedRound:true});s=n;}
  assert.ok(!keys(a,s).some(k=>k.startsWith('performance_carry_')));
});

test('repeated successful tackles count while evaded or foul tackles do not',()=>{
  for(const successful of [true,false]) {
    const a=createTacticalCommentary();let s=position();
    for(let i=0;i<2;i++) {
      s.attack='black';const next=step(s,{type:successful?'tackle':'tackleMiss',team:'white',pieceId:'white-N1',attack:successful?'white':'black',outcome:successful?'won':'evaded'});
      a.observe(s,next,{completedRound:false});s=next;
    }
    assert.equal(keys(a,s).includes('performance_ballwinner_knight'),successful);
  }
});

test('creator and finisher need actual matching goal transitions and verified same-team assists',()=>{
  const a=createTacticalCommentary();let s=position(),goals=[];
  for(let i=0;i<2;i++) {
    const n=step(s,{type:'goal',pieceId:'white-N1',team:'white'});n.score.white++;
    goals.push({team:'white',scorerId:'white-N1',assistId:'white-B1',turn:n.turn,ownGoal:false});
    a.observe(s,n,{stats:{goals},completedRound:false});s=n;
  }
  assert.ok(keys(a,s).includes('performance_creator_bishop'));assert.ok(keys(a,s).includes('performance_finisher_knight'));
  const b=createTacticalCommentary(),before=position(),after=step(before,{pieceId:null});
  b.observe(before,after,{stats:{goals:[{team:'white',scorerId:'white-N1',assistId:'white-B1',turn:after.turn,ownGoal:false}]}});
  assert.ok(!keys(b,after).some(k=>/creator|finisher/.test(k)));
});

test('keeper performance excludes backpasses and same-team shots',()=>{
  for(const backPass of [false,true]) {
    const a=createTacticalCommentary();let s=position();
    for(let i=0;i<3;i++) {
      s.phase='keeperReact';s.pendingShot={shootingTeam:backPass?'black':'white'};
      const n=step(s,{type:'save',pieceId:'white-Q',team:'black',keeperId:'black-K',backPass});
      n.pendingShot=null;a.observe(s,n,{completedRound:false});s=n;
    }
    assert.equal(keys(a,s).includes('performance_keeper_reliable'),!backPass);
  }
});

test('loss commentary requires real forward possession losses and makes no decision-quality judgment',()=>{
  for(const lost of [true,false]) {
    const a=createTacticalCommentary();let s=position();
    for(let i=0;i<3;i++) {
      s.attack='white';s.ball={x:6,y:10,carrierId:'white-Q'};
      const n=step(s,{type:lost?'interception':'miss',pieceId:'white-Q',to:{x:6,y:7},attack:lost?'black':'white',outcome:lost?'interception':'inaccurate'});
      a.observe(s,n,{completedRound:false});s=n;
    }
    assert.equal(keys(a,s).includes('performance_wasteful_queen'),lost);
  }
});

test('turnovers/restarts clear old shape and reset clears sequence and player performance',()=>{
  const a=createTacticalCommentary();let s=sample(a,position(),6);
  assert.ok(keys(a,s).some(k=>k.startsWith('shape_')));
  let next=step(s,{type:'tackle',team:'black',pieceId:'black-Q',attack:'black',outcome:'won'});a.observe(s,next,{});s=next;
  assert.ok(!keys(a,s).some(k=>k.startsWith('shape_')));
  s=sample(a,s,6);next=step(s,{pieceId:null});next.restart={type:'freeKick',team:s.attack};a.observe(s,next,{});
  assert.deepEqual(a.lines(next),[]);
  a.reset();assert.deepEqual(a.lines(position()),[]);
});

test('performance contributions expire after the bounded observation window',()=>{
  const a=createTacticalCommentary();let s=position();
  for(let i=0;i<2;i++){const next=step(s,{to:{x:6,y:s.ball.y-3}});a.observe(s,next,{completedRound:true});s=next;}
  assert.ok(keys(a,s).includes('performance_carry_queen'));
  for(let i=0;i<121;i++){const next=step(s,{pieceId:null});a.observe(s,next,{completedRound:false});s=next;}
  assert.ok(!keys(a,s).includes('performance_carry_queen'));
});

test('observing and analysing never mutate board, hidden targets, stats or random seed',()=>{
  const a=createTacticalCommentary(),before=position(),after=step(before,{pieceId:null}),stats={goals:[]};
  before.seed=17;after.seed=18;const saved=JSON.stringify({before,after,stats});
  a.observe(before,after,{stats,completedRound:true});a.lines(after,{stats});
  assert.equal(JSON.stringify({before,after,stats}),saved);
});
