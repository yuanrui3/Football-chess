import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import * as E from '../dist/engine.js';
import {runMatch,summary} from '../scripts/simulate.mjs';

function fixture({seed=1972,penalty=false,keeper=false,foulsEnabled=true}={}){
  const s=E.createGame({mode:'local',seed,foulsEnabled}),y=penalty?1:8,id=keeper?'black-K':'black-R1';
  const assigned={'white-K':[6,16],'black-K':[8,0],'white-Q':[6,y],[id]:[6,keeper?y-1:penalty?4:5]},used=new Set(Object.values(assigned).map(p=>p.join(',')));
  assert.equal(used.size,Object.keys(assigned).length);
  const parking=Array.from({length:E.BOARD_HEIGHT},(_,row)=>[[0,row],[E.BOARD_WIDTH-1,row]]).flat();
  for(const p of s.pieces){const at=assigned[p.id]||parking.find(p=>!used.has(p.join(',')));[p.x,p.y]=at;used.add(at.join(','));}
  Object.assign(s,{phase:'defendMove',attack:'white',ball:{x:6,y,carrierId:'white-Q'},restart:null,offside:null,lastAction:null,pendingShot:null,positionBudget:{normalUsed:false,pawnUsed:false,dribbleUsed:false},ballProgress:{team:'white',anchorY:y,rounds:0,pendingRelease:false,excludeRelease:false}});
  const action={type:'move',pieceId:id,x:5,y};assert.ok(E.legalMoves(s,id).some(m=>m.type==='tackle'&&m.x===action.x&&m.y===action.y));
  return {s,action};
}
function simulate(s,policy,actions=1,rules=E){const before=structuredClone(s),m=runMatch({rules,initialState:s,whitePolicy:policy,blackPolicy:policy,actionLimit:actions,record:true,validate:true});assert.deepEqual(s,before);assert.equal(m.error,null,JSON.stringify(m.error));return m;}
function dismiss(s,id){const p=s.pieces.find(p=>p.id===id);s.sentOff.push({...p,reason:'red',yellowCards:0});s.pieces=s.pieces.filter(p=>p.id!==id);s.discipline[id]={yellowCards:0,redCard:true};}

test('public simulation opts into fouls explicitly while default and initial-state modes are preserved',()=>{
  for(const foulsEnabled of [false,true]){const m=runMatch({foulsEnabled,actionLimit:0,record:true,validate:true});assert.equal(m.error,null);assert.equal(m.foulsEnabled,foulsEnabled);assert.equal(m.finalState.foulsEnabled,foulsEnabled);assert.deepEqual(m.activePlayers,{white:11,black:11});}
  assert.equal(runMatch({actionLimit:0,record:true}).foulsEnabled,false);
  const {s}=fixture();assert.equal(runMatch({initialState:s,foulsEnabled:false,actionLimit:0,record:true,validate:true}).foulsEnabled,true,'a supplied live state owns its mode');
  const legacy=fixture({foulsEnabled:false}),m=simulate(legacy.s,()=>legacy.action);assert.equal(m.events[0].result.type,'tackle');assert.equal(m.stats.black.fouls,0);assert.equal(m.finalState.pieces.length,22);
});

for(const [seed,card]of [[1972,'red'],[2023,'yellow'],[2152,null]])test(`seeded ${card||'plain'} foul is counted independently from the tackle and protected restart`,()=>{
  const {s,action}=fixture({seed}),m=simulate(s,()=>action),r=m.events[0].result;
  assert.equal(r.type,'foul');assert.equal(r.card,card);assert.equal(m.stats.black.tackles,1);assert.equal(m.stats.black.tackleWins,0);assert.equal(m.stats.black.fouls,1);assert.equal(m.stats.white.foulsWon,1);assert.equal(m.stats.black.role.R.fouls,1);
  assert.equal(m.stats.black.yellowCards,Number(card==='yellow'));assert.equal(m.stats.black.redCards,Number(card==='red'));assert.equal(m.finalState.restart.type,'freeKick');assert.equal(m.finalState.restart.team,'white');assert.equal(m.stats.white.restartTypes['awarded:freeKick'],1);
  assert.equal(m.activePlayers.black,card==='red'?10:11);assert.equal(m.dismissedPlayers.black,Number(card==='red'));
});

test('a second yellow records its yellow and red, removes one player and preserves the card ledger',()=>{
  const {s,action}=fixture({seed:2023});s.discipline['black-R1']={yellowCards:1,redCard:false};const m=simulate(s,()=>action);
  assert.equal(m.events[0].result.secondYellow,true);assert.equal(m.stats.black.yellowCards,1);assert.equal(m.stats.black.redCards,1);assert.equal(m.stats.black.secondYellows,1);assert.deepEqual(m.finalState.discipline['black-R1'],{yellowCards:2,redCard:true});assert.equal(m.finalState.pieces.some(p=>p.id==='black-R1'),false);assert.equal(m.finalState.sentOff.length,1);
});

test('a dismissed goalkeeper is replaced by an active player with its original ID',()=>{
  const {s,action}=fixture({keeper:true}),m=simulate(s,()=>action),keeper=m.finalState.pieces.filter(p=>p.team==='black'&&p.type==='K');
  assert.equal(keeper.length,1);assert.notEqual(keeper[0].id,'black-K');assert.equal(keeper[0].replacementKeeper,true);assert.equal(keeper[0].originalType,'P');assert.equal(m.finalState.sentOff[0].id,'black-K');assert.equal(m.activePlayers.black,10);assert.equal(m.stats.black.role.K.redCards,1);
});

for(const [seed,outcome]of [[2152,'goal'],[2156,'save']])test(`a penalty ${outcome} is an opponent-goal attempt with complete separate penalty counters`,()=>{
  const {s,action}=fixture({seed,penalty:true}),policy=g=>!g.restart&&g.phase==='defendMove'&&g.turn===1?action:g.phase==='kick'?{type:'kick',x:6,y:-1}:{type:'skip'},m=simulate(s,policy,5),side=m.stats.white;
  assert.deepEqual(m.events.map(e=>e.result.type),['foul','skip','skip','shotAttempt',outcome],'both teams resettle before one penalty is taken');
  assert.equal(m.stats.black.fouls,1);assert.equal(side.penaltiesWon,1);assert.equal(side.penaltiesTaken,1);assert.equal(side.restartsTaken,1);assert.equal(side.restartTypes['taken:penalty'],1);assert.equal(side.shots,1);assert.equal(side.opponentGoalAttempts,1);assert.equal(side.ownGoalAttempts,0);assert.equal(side.resolvedShots,1);assert.equal(side.opponentGoalXG,.8);
  assert.equal(side.penaltyGoals,Number(outcome==='goal'));assert.equal(side.penaltyFailures,Number(outcome!=='goal'));assert.equal(m.stats.black.penaltiesSaved,Number(outcome==='save'));assert.equal(m.events[3].state.pendingShot.penalty,true);assert.equal(m.events[4].result.shotModel.goalProbability,.8);
});

test('a goal reset retains all dismissals instead of resurrecting the full squad',()=>{
  const {s,action}=fixture(),red=E.applyMove(s,action.pieceId,action.x,action.y),shooter=red.pieces.find(p=>p.id==='white-R1');Object.assign(shooter,{x:6,y:3});Object.assign(red,{phase:'kick',restart:null,offside:null,ball:{x:6,y:3,carrierId:shooter.id},ballProgress:{team:'white',anchorY:3,rounds:0,pendingRelease:false,excludeRelease:false}});
  const m=simulate(red,g=>g.phase==='keeperReact'?{type:'skip'}:{type:'kick',x:6,y:-1},2);assert.equal(m.events[1].result.type,'goal');assert.equal(m.finalState.pieces.length,21);assert.equal(m.finalState.pieces.some(p=>p.id==='black-R1'),false);assert.equal(m.finalState.discipline['black-R1'].redCard,true);assert.equal(m.dismissedPlayers.black,1);
});

test('falling below seven players ends by forfeit and is not reported as a scoreless draw',()=>{
  const {s,action}=fixture();for(const id of ['black-P1','black-P2','black-P3','black-B2'])dismiss(s,id);const m=simulate(s,()=>action,5);
  assert.equal(m.actions,1);assert.equal(m.finishReason,'forfeit');assert.equal(m.winner,'white');assert.equal(m.forfeitingTeam,'black');assert.deepEqual(m.activePlayers,{white:11,black:6});assert.equal(m.stats.black.redCards,1);assert.equal(m.finalState.restart,null);
  const total=summary([m]);assert.equal(total.forfeits,1);assert.deepEqual(total.outcomes,{whiteWins:1,draws:0,blackWins:0});
});

test('integrity validation rejects invalid initial cards, duplicate IDs and undersized live teams before policy execution',()=>{
  const corruptions=[s=>{s.pieces[1].id=s.pieces[2].id;},s=>{s.discipline['white-N1']={yellowCards:2,redCard:false};},s=>{s.discipline['white-N1']={yellowCards:0,redCard:true};},s=>{for(const id of ['black-P1','black-P2','black-P3','black-B2','black-N1'])dismiss(s,id);}];
  for(const corrupt of corruptions){const s=E.createGame({foulsEnabled:true,seed:1});corrupt(s);const m=runMatch({initialState:s,actionLimit:0,validate:true});assert.equal(m.error?.stage,'integrity');assert.equal(m.actions,0);}
});

test('integrity validation detects resurrection even if a faulty policy module erases the dismissal ledger',()=>{
  const {s,action}=fixture(),red=E.applyMove(s,action.pieceId,action.x,action.y),bad={...E,skipMove:state=>{const n=E.skipMove(state),p=n.sentOff.pop();n.pieces.push({...p});delete n.discipline[p.id];return n;}};
  const m=runMatch({rules:bad,initialState:red,whitePolicy:()=>({type:'skip'}),blackPolicy:()=>({type:'skip'}),actionLimit:1,record:true,validate:true});assert.equal(m.error?.stage,'integrity');assert.match(m.error.message,/dismissed player was restored/);
});

for(const run of [false,true])test(`public simulation forwards passRun and ${run?'spends':'preserves'} the next normal allowance`,()=>{
  const {s}=fixture({seed:1900}),q=s.pieces.find(p=>p.id==='white-Q'),receiver=s.pieces.find(p=>p.id==='white-P1');Object.assign(q,{x:3,y:3});Object.assign(receiver,{x:3,y:6});Object.assign(s,{phase:'kick',ball:{x:3,y:3,carrierId:q.id},ballProgress:{team:'white',anchorY:3,rounds:0,pendingRelease:false,excludeRelease:false}});
  const policy=g=>g.phase==='kick'?{type:'kick',x:3,y:6,passRun:true}:run?{type:'move',pieceId:q.id,x:6,y:3}:{type:'skip'},m=simulate(s,policy,2),pending=m.events[0].state;
  assert.equal(pending.phase,'passRun');assert.equal(pending.passRun.pieceId,q.id);assert.equal(E.legalMoves(pending,q.id).some(move=>move.x===5&&move.y===1),false,'the passer cannot use the run to enter the box');assert.equal(m.finalState.phase,'attackMove');assert.equal(m.finalState.passRun,null);assert.deepEqual(m.finalState.positionBudget,{normalUsed:run,pawnUsed:false,dribbleUsed:false});assert.equal(m.finalState.ball.carrierId,receiver.id);assert.equal(m.stats.white.passRunsOffered,1);assert.equal(m.stats.white.passRuns,Number(run));assert.equal(m.stats.white.passRunsSkipped,Number(!run));assert.equal(m.stats.white.completedOrdinaryRounds,1);
});

test('the public CLI accepts --fouls and an explicit --fouls=false',()=>{
  const out=mkdtempSync(path.join(tmpdir(),'football-foul-sim-')),script=fileURLToPath(new URL('../scripts/simulate.mjs',import.meta.url));
  try{for(const [arg,enabled]of [['--fouls',true],['--fouls=false',false]]){const name=enabled?'on':'off',result=spawnSync(process.execPath,[script,'--seeds=1','--actions=0',arg,`--out=${out}`,`--name=${name}`],{encoding:'utf8'});assert.equal(result.status,0,result.stderr);const data=JSON.parse(readFileSync(path.join(out,`${name}-summary.json`)));assert.deepEqual(data.foulsEnabled,[enabled]);assert.equal(data.completed,2);assert.equal(data.errors.length,0);}}
  finally{rmSync(out,{recursive:true,force:true});}
});
