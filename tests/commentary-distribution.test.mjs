import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../dist/engine.js';
import {createTacticalCommentary} from '../dist/commentary-tactics.js';
import {commentaryPositionFacts} from '../dist/commentary-spatial.js';
import {ADAM_TACTICAL_CLIPS} from '../dist/adam-commentary-clips.js';
import {hugoCommentaryClip} from '../dist/hugo-commentary-clips.js';

const other=t=>t==='white'?'black':'white';
function mirror(s) {
  const swap=v=>typeof v==='string'?v.replace(/^(white|black)(?=-|$)/,other):v;
  return {...structuredClone(s),attack:other(s.attack),
    pieces:s.pieces.map(p=>({...p,id:swap(p.id),team:other(p.team),x:E.BOARD_WIDTH-1-p.x,y:E.BOARD_HEIGHT-1-p.y})),
    ball:{...s.ball,x:E.BOARD_WIDTH-1-s.ball.x,y:E.BOARD_HEIGHT-1-s.ball.y,carrierId:swap(s.ball.carrierId)}};
}
function position(kind='high') {
  const s=E.createGame({mode:'watch',seed:71,foulsEnabled:false});
  Object.assign(s,{phase:'attackMove',turn:1,restart:null,pendingShot:null,offside:null,passRun:null,lastAction:null});
  Object.assign(s.pieces.find(p=>p.id==='white-K'),{x:6,y:16});
  Object.assign(s.pieces.find(p=>p.id==='black-K'),{x:7,y:0});
  const black=[[1,6],[4,6],[8,6],[12,6],[2,7],[5,7],[9,7],[11,7],[3,8],[10,8]];
  s.pieces.filter(p=>p.team==='black'&&p.type!=='K').forEach((p,i)=>{[p.x,p.y]=black[i];});
  if(kind==='crowded') {
    const white=[[4,7],[6,7],[8,7],[5,9],[7,9],[1,12],[2,12],[10,12],[11,12],[12,12]];
    const blackCentre=[[5,7],[7,7],[9,7],[4,9],[6,9],[1,4],[2,4],[10,4],[11,4],[12,4]];
    for(const [team,positions] of [['white',white],['black',blackCentre]])
      s.pieces.filter(p=>p.team===team&&p.type!=='K').forEach((p,i)=>{[p.x,p.y]=positions[i];});
  }
  const q=s.pieces.find(p=>p.id==='white-Q');s.ball={x:q.x,y:q.y,carrierId:q.id};
  assert.equal(new Set(s.pieces.map(p=>`${p.x},${p.y}`)).size,s.pieces.length);
  assert.ok(s.pieces.every(p=>E.canOccupySquare(p,p.x,p.y)));
  return s;
}
function sample(a,s,count=1,{turnover=false,completedRound=true}={}) {
  for(let i=0;i<count;i++){
    const n=structuredClone(s);n.turn++;
    if(turnover){n.attack=other(s.attack);const q=n.pieces.find(p=>p.id===n.attack+'-Q');n.ball={x:q.x,y:q.y,carrierId:q.id};}
    n.lastAction={type:'skip',team:n.attack,pieceId:null};
    const frozen=structuredClone({s,n});a.observe(s,n,{completedRound});a.lines(n);
    assert.deepEqual({s,n},frozen,'commentary cannot move pieces or consume match randomness');s=n;
  }
  return s;
}
const call=(a,s,key)=>a.lines(s).find(l=>l.clipKey===key);

for(const team of ['black','white']) {
  test(`${team}: a broad high back line needs three distinct completed rounds and survives turnovers`,()=>{
    const a=createTacticalCommentary();let s=position();if(team==='white')s=mirror(s);
    const key='shape_high_line_'+team;
    s=sample(a,s,2,{turnover:true});assert.equal(call(a,s,key),undefined);
    s=sample(a,s,1,{turnover:true});const c=call(a,s,key);assert.ok(c);assert.equal(c.team,team);
    assert.equal(c.tactical.rounds,3);assert.ok(c.tactical.linePieceIds.length>=3);
    assert.match(c.text,new RegExp(team==='white'?'Ivory':'Obsidian'));
    assert.equal(hugoCommentaryClip(c,s,ADAM_TACTICAL_CLIPS).text,c.text);
    const retreated=structuredClone(s),p=retreated.pieces.find(p=>p.team===team&&p.type!=='K');
    p.x=team==='white'?0:13;p.y=team==='white'?13:3;
    assert.equal(call(a,retreated,key),undefined,'a defender dropping back invalidates even the unsampled current board');
  });
  test(`${team}: a high average position alone is not a defensive line`,()=>{
    for(const kind of ['deep','narrow','scattered']){
      const a=createTacticalCommentary();let s=position();
      const players=s.pieces.filter(p=>p.team==='black'&&p.type!=='K');
      if(kind==='deep'){players[0].x=0;players[0].y=3;}
      if(kind==='narrow')players.forEach((p,i)=>{p.x=i%2;p.y=6+Math.floor(i/2);});
      if(kind==='scattered')players.forEach((p,i)=>{p.x=i;p.y=i===0?6:11;});
      assert.equal(new Set(s.pieces.map(p=>`${p.x},${p.y}`)).size,s.pieces.length,kind+' uses a valid board');
      if(team==='white')s=mirror(s);s=sample(a,s,3);
      assert.equal(call(a,s,'shape_high_line_'+team),undefined,kind);
    }
  });
}

test('crowded midfield counts both sides around halfway, persists across possession and names both sides',()=>{
  const a=createTacticalCommentary();let s=position('crowded');
  s=sample(a,s,2,{turnover:true});assert.equal(call(a,s,'shape_midfield_crowded'),undefined);
  s=sample(a,s,1,{turnover:true});const c=call(a,s,'shape_midfield_crowded');assert.ok(c);
  assert.equal(c.team,null);assert.equal(c.tactical.centralPlayers,10);
  assert.equal(c.tactical.whitePlayers,5);assert.equal(c.tactical.blackPlayers,5);
  assert.equal(hugoCommentaryClip(c,s,ADAM_TACTICAL_CLIPS).text,c.text);
  const opened=structuredClone(s);opened.pieces.filter(p=>p.team==='black'&&p.type!=='K').slice(0,3)
    .forEach((p,i)=>{p.x=i;p.y=5;});
  assert.equal(call(a,opened,'shape_midfield_crowded'),undefined,'stale congestion cannot be selected before a new round is recorded');
  a.reset();assert.equal(call(a,s,'shape_midfield_crowded'),undefined);
});

test('a narrow attack or an end-line crowd is not an overcrowded midfield',()=>{
  for(const kind of ['oneSide','endLine','sparse','duplicate']){
    const a=createTacticalCommentary();let s=position('crowded');
    if(kind==='oneSide')s.pieces.filter(p=>p.team==='black'&&p.type!=='K').slice(0,4).forEach((p,i)=>{p.x=i;p.y=3;});
    if(kind==='endLine')s.pieces.filter(p=>p.type!=='K'&&p.y>=7&&p.y<=9).forEach(p=>p.y-=6);
    if(kind==='sparse')s.pieces=s.pieces.filter(p=>p.type==='K'||p.x>=4&&p.x<=9&&p.y>=7&&p.y<=9);
    if(kind==='duplicate')Object.assign(s.pieces[1],{x:s.pieces[0].x,y:s.pieces[0].y});
    else assert.equal(new Set(s.pieces.map(p=>`${p.x},${p.y}`)).size,s.pieces.length,kind+' uses a valid board');
    s=sample(a,s,3);assert.equal(call(a,s,'shape_midfield_crowded'),undefined,kind);
  }
});

test('subactions, duplicated rounds, and restarts cannot manufacture persistent distribution',()=>{
  const a=createTacticalCommentary();let s=position('crowded');
  s=sample(a,s,4,{completedRound:false});assert.equal(call(a,s,'shape_midfield_crowded'),undefined);
  s=sample(a,s,1);for(let i=0;i<3;i++){const n={...structuredClone(s),lastAction:{type:'skip',team:s.attack,pieceId:'subaction-'+i}};a.observe(s,n,{completedRound:true});s=n;}
  assert.equal(call(a,s,'shape_midfield_crowded'),undefined);
  const restart={...structuredClone(s),turn:s.turn+1,restart:{type:'throwIn',team:s.attack},lastAction:{type:'out'}};
  a.observe(s,restart,{completedRound:true});s={...restart,restart:null};
  s=sample(a,s,2);assert.equal(call(a,s,'shape_midfield_crowded'),undefined);
});

test('a clear short passing segment does not claim that the entire file is open',()=>{
  const s=E.createGame({seed:13,foulsEnabled:false});
  const points={'white-K':[6,16],'black-K':[7,0],'white-Q':[6,8],'white-R1':[6,6],'black-R1':[6,3],'black-R2':[12,1]};
  s.pieces=s.pieces.filter(p=>points[p.id]).map(p=>({...p,x:points[p.id][0],y:points[p.id][1]}));
  Object.assign(s,{phase:'kick',turn:1,attack:'white',restart:null,pendingShot:null,offside:null,ball:{x:6,y:8,carrierId:'white-Q'}});
  const f=commentaryPositionFacts(s).find(f=>f.type==='support'&&f.receiverId==='white-R1');assert.ok(f);
  const clip=hugoCommentaryClip({kind:'trend',spatial:f},s,ADAM_TACTICAL_CLIPS);assert.ok(clip);
  assert.doesNotMatch(f.text,/open.*file|open.*rank|open.*diagonal/i);assert.doesNotMatch(clip.text,/open.*file|open.*rank|open.*diagonal/i);
  const blocked=structuredClone(s);Object.assign(blocked.pieces.find(p=>p.id==='black-R1'),{x:6,y:7});
  assert.equal(commentaryPositionFacts(blocked).some(f=>f.type==='support'&&f.receiverId==='white-R1'),false);
});
