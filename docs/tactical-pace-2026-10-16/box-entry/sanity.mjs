import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as trial from './engine.mjs';
import * as base from '../final/production-engine.mjs';
function fixture(type='Q',x=6,y=3) {
 const state=trial.createGame({seed:17});
 state.pieces=[{id:'white-Q',type,team:'white',x,y},{id:'white-K',type:'K',team:'white',x:6,y:15},
  {id:'black-K',type:'K',team:'black',x:2,y:1},{id:'white-R1',type:'R',team:'white',x:0,y:8}];
 Object.assign(state,{phase:'attackMove',attack:'white',ball:{x,y,carrierId:'white-Q'},offside:null,restart:null,
  positionBudget:{normalUsed:false,pawnUsed:false,dribbleUsed:false},paceControl:null,
  ballProgress:{team:'white',anchorY:y,rounds:0,pendingRelease:false,excludeRelease:false}});
 return state;
}
const has=(engine,state,x,y)=>engine.legalMoves(state,'white-Q').some(move=>move.x===x&&move.y===y);
const rows=[];
let state=fixture();
assert.equal(has(base,state,6,2),false);assert.equal(has(trial,state,6,2),true);
rows.push('Queen can now carry from outside into the opposing box.');
const entered=trial.applyMove(state,'white-Q',6,2);
assert.equal(entered.ball.carrierId,'white-Q');assert.equal(entered.ball.y,2);
assert.equal(entered.paceControl.dribbledThisRound,true);
rows.push('An actual entry keeps controlled possession and consumes the existing carrying allowance.');
state=fixture('Q',4,1);
assert.equal(has(trial,state,8,1),true);assert.equal(has(trial,state,9,1),false);
rows.push('Inside-box movement permits four entered squares, costing eight points; five remain illegal.');
state=fixture();assert.equal(has(trial,state,6,0),false);
rows.push('The four goal-front cells remain keeper-only.');
state=fixture('K',4,3);assert.equal(has(trial,state,4,2),false);
rows.push('A king still cannot enter the opposing box.');
state=fixture();state.ball={x:6,y:2,carrierId:null};state.looseBallKickOrigin={pieceId:'white-Q',team:'white',from:{x:6,y:3}};
assert.equal(has(trial,state,6,2),false);
rows.push('Collecting an own loose pass inside the box from outside remains illegal.');
state=fixture();state.phase='passRun';state.passRun={pieceId:'white-Q',team:'white'};
state.ball={x:0,y:8,carrierId:'white-R1'};assert.equal(has(trial,state,6,2),false);
rows.push('Pass-and-run still cannot enter the box.');
state=fixture();state.paceControl={team:'white',carrierId:'white-Q',dribbleRounds:4,dribbledThisRound:false,history:[],furthestAdvance:-3};
const stopped=trial.applyMove(state,'white-Q',6,2);assert.equal(stopped.lastAction.reason,'dribbleLimit');
assert.deepEqual(stopped.lastAction.offence,{x:6,y:3});
rows.push('The fifth carrying round is stopped before box entry and awards the opponent an indirect free kick.');
fs.writeFileSync(new URL('sanity.json',import.meta.url),JSON.stringify({passed:rows.length,checks:rows},null,2));
process.stdout.write(JSON.stringify({passed:rows.length,checks:rows},null,2)+'\n');
