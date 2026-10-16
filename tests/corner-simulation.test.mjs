import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../dist/engine.js';
import {runMatch} from '../scripts/simulate.mjs';

function pendingCorner(team){
  const s=E.createGame({mode:'local',kickoff:team,seed:5298323,foulsEnabled:true});
  Object.assign(s.pieces.find(p=>p.id===`${team}-N1`),team==='white'?{x:3,y:6}:{x:10,y:10});
  const spot=team==='white'?{x:0,y:0}:{x:E.BOARD_WIDTH-1,y:E.BOARD_HEIGHT-1};
  Object.assign(s,{phase:'cornerSelect',attack:team,ball:{...spot,carrierId:null},restart:{type:'corner',team,takerId:null,spot,indirect:false},pendingShot:null,offside:null,lastAction:null});
  return s;
}

for(const team of ['white','black'])test(`${team} public simulation forwards the corner choice without adding a kick or another corner award`,()=>{
  const s=pendingCorner(team),taker=E.cornerTakers(s)[0];assert.ok(taker);
  const before=structuredClone(s),m=runMatch({initialState:s,whitePolicy:()=>({type:'cornerTaker',pieceId:taker.id}),blackPolicy:()=>({type:'cornerTaker',pieceId:taker.id}),actionLimit:1,record:true,validate:true});
  assert.equal(m.error,null,JSON.stringify(m.error));assert.deepEqual(s,before);
  assert.equal(m.finalState.phase,'attackMove');assert.equal(m.finalState.restart.takerId,taker.id);assert.equal(m.finalState.ball.carrierId,taker.id);
  assert.equal(m.finalState.seed,s.seed);assert.equal(m.finalState.turn,s.turn);assert.equal(m.events[0].result.type,'cornerTaker');
  for(const metric of ['passes','shots','dribbles','completedOrdinaryRounds','restartsTaken','restartsAwarded'])assert.equal(m.stats[team][metric],0,metric);
});

for(const corrupt of [s=>s.restart.takerId=s.pieces[0].id,s=>s.ball.carrierId=s.pieces[0].id,s=>s.ball.x=1,s=>s.restart.team='black'])test('public simulation rejects corrupt pending corner selection '+String(corrupt),()=>{
  const s=pendingCorner('white');corrupt(s);const m=runMatch({initialState:s,actionLimit:0,validate:true});assert.equal(m.error?.stage,'integrity');assert.equal(m.actions,0);
});
