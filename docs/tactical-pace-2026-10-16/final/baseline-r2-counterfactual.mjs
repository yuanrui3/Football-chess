import fs from 'node:fs';
import assert from 'node:assert/strict';
import * as rules from './production-engine.mjs';
import {applyAction} from '../diagnosis/simulate.mjs';
const dir = new URL('.',import.meta.url);
const baseline = JSON.parse(fs.readFileSync(new URL('../diagnosis/baseline-202610161-white.json',dir),'utf8'));
const previous = baseline.events.find(event=>event.step===437).state;
let state = rules.normalizeGame({...structuredClone(previous),paceControl:null});
assert.equal(state.ball.carrierId,'white-R2');
assert.equal(state.phase,'attackMove');
const initialState = structuredClone(state), trace = [];
for(const event of baseline.events.filter(event=>event.step>=438&&event.step<=458)) {
  const before = state;
  state = applyAction(rules,state,event.action);
  const row = {step:event.step,phase:before.phase,action:event.action,resultType:state.lastAction.type,
    carrierId:state.ball.carrierId,ball:state.ball,dribbleRounds:state.paceControl?.dribbleRounds??null,
    dribbledThisRound:state.paceControl?.dribbledThisRound??false};
  if(state.lastAction.type==='stalling') Object.assign(row,{reason:state.lastAction.reason,offence:state.lastAction.offence,
    restart:state.restart,triggeringAction:state.lastAction.triggeringAction});
  if(event.step<458) {
    assert.deepEqual(state.pieces,event.state.pieces,`same actual board at ${event.step}`);
    assert.deepEqual(state.ball,event.state.ball,`same actual ball at ${event.step}`);
    assert.equal(state.randomState,event.state.randomState,`same actual random stream at ${event.step}`);
  } else {
    assert.equal(state.lastAction.reason,'dribbleLimit');
    assert.equal(state.lastAction.rounds,5);
    assert.deepEqual(state.lastAction.offence,{x:4,y:9});
    assert.equal(state.restart.team,'black');
    assert.equal(state.randomState,before.randomState);
    const attempted = state.lastAction.triggeringAction;
    const r2 = state.pieces.find(piece=>piece.id==='white-R2');
    assert.deepEqual({x:r2.x,y:r2.y},attempted.from,'fifth collection is stopped before moving R2');
  }
  trace.push(row);
}
const report = {sourceLabel:baseline.label,seed:baseline.seed,kickoff:baseline.kickoff,
  sourceRange:{stateAfter:437,actionsFrom:438,actionsThrough:458},initialState,trace,
  result:state.lastAction,
  notes:['Controlled handoff to R2 already occurred before step438, so a fresh same-player carrying allowance is exact for this counterfactual.',
    'Original recorded actions, board occupancy, ball and PRNG stream remain identical through step457.',
    'The new fifth-carry rule changes step458 before R2 can collect its own pass; nearest Black player receives the existing protected indirect free kick.']};
fs.writeFileSync(new URL('baseline-r2-counterfactual.json',dir),JSON.stringify(report,null,2));
process.stdout.write(JSON.stringify({trace:trace.filter(row=>row.action.pieceId==='white-R2'||row.action.type==='kick'),result:report.result},null,2)+'\n');
