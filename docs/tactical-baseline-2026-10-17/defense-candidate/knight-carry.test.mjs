import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import * as Rules from '../frozen/dist/engine.js';
const expose=async path=>import('data:text/javascript;base64,'+Buffer.from(await readFile(path,'utf8')+'\nexport {rankedTacticalActions,passThreats,tacticalKnightCarryThreats,tacticalKnightCarryExposure,projectedMove};').toString('base64'));
const C=await expose('./engine-knight-carry.mjs');
const B=await import('./engine.mjs');
const match=JSON.parse(await readFile('../combined-v1/match-001-610017-fouls-white-black.json','utf8'));
let original=Rules.createGame({mode:'local',seed:match.seed,kickoff:match.kickoff,foulsEnabled:match.foulsEnabled});
const apply=(M,s,a)=>a.type==='cornerTaker'?M.selectCornerTaker(s,a.pieceId):a.type==='move'?M.applyMove(s,a.pieceId,a.x,a.y,{freePawn:!!a.freePawn}):a.type==='kick'?M.applyKick(s,a.x,a.y,{disguise:!!a.disguise,passRun:!!a.passRun}):M.skipMove(s);
for(const e of match.events){if(e.step===168)break;original=apply(Rules,original,e.action);}
await writeFile('knight-carry-natural-state.json',JSON.stringify(original,null,2)+'\n');
const other=t=>t==='white'?'black':'white',sid=v=>v?.replace(/^(white|black)/,other)??null,point=p=>({x:13-p.x,y:16-p.y});
function mirror(s){const t=structuredClone(s);t.attack=other(s.attack);t.pieces=s.pieces.map(p=>({...p,...point(p),team:other(p.team),id:sid(p.id)}));t.ball={...point(s.ball),carrierId:sid(s.ball.carrierId)};t.score={white:s.score.black,black:s.score.white};
 if(s.offside)t.offside={...s.offside,team:other(s.offside.team),kickerId:sid(s.offside.kickerId),flaggedIds:s.offside.flaggedIds.map(sid),ball:point(s.offside.ball),secondLastY:16-s.offside.secondLastY};
 if(s.ballProgress)t.ballProgress={...s.ballProgress,team:other(s.ballProgress.team),anchorY:16-s.ballProgress.anchorY};
 if(s.paceControl)t.paceControl={...s.paceControl,team:other(s.paceControl.team),carrierId:sid(s.paceControl.carrierId),history:[]};
 t.discipline=Object.fromEntries(Object.entries(s.discipline||{}).map(([id,v])=>[sid(id),v]));return t;}
const results=[];
for(const [label,s]of [['natural',original],['mirror',mirror(original)]]){
 test(`${label}: Tactical sees a native receiving knight carry threat that immediate-shot defense misses`,()=>{
  const before=structuredClone(s),carrier=s.pieces.find(p=>p.id===s.ball.carrierId),team=carrier.team;
  const at=p=>team==='black'?p:point(p),receive=at({x:8,y:14}),finish=at({x:6,y:15}),knight=`${team}-N1`;
  const old=C.passThreats(s,carrier).filter(t=>t.pieceId===knight&&t.x===receive.x&&t.y===receive.y);
  assert.equal(old.length,0,'the current receiving square cannot itself make a native knight shot');
  const threats=C.tacticalKnightCarryThreats(s,carrier),target=threats.find(t=>t.pieceId===knight&&t.x===receive.x&&t.y===receive.y&&t.finishAt.x===finish.x&&t.finishAt.y===finish.y);
  assert.ok(target);assert.ok(target.probability>.3);assert.equal(target.collect,true);
  const goalkeeper=s.pieces.find(p=>p.id===`${other(team)}-K`),block=Rules.legalMoves(s,goalkeeper.id).find(m=>m.type==='move'&&m.x===finish.x&&m.y===finish.y);
  assert.ok(block,'the goalkeeper can occupy the knight’s central carrying destination');
  const defended=Rules.applyMove(s,goalkeeper.id,block.x,block.y);
  assert.equal(C.tacticalKnightCarryExposure(defended,defended.pieces.find(p=>p.id===carrier.id),[target]),0,'occupying the carrying landing is a real preventive defense');
  assert.deepEqual(C.chooseAIAction(s,{difficulty:'casual',modelWeights:null}),B.chooseAIAction(s,{difficulty:'casual',modelWeights:null}));
  const entries=C.rankedTacticalActions(s,9,true),top=entries[0];
  const projected=top.action.type==='move'?C.projectedMove(s,s.pieces.find(p=>p.id===top.action.pieceId),top.action):s;
  const remaining=projected.ball.carrierId===carrier.id?C.tacticalKnightCarryExposure(projected,projected.pieces.find(p=>p.id===carrier.id),threats):0;
  assert.ok(remaining<C.tacticalKnightCarryExposure(s,carrier,threats),'the primary Tactical defensive candidate addresses the real receiving-and-carrying threat');
  assert.deepEqual(s,before);
  results.push({label,threat:target,top,before:C.tacticalKnightCarryExposure(s,carrier,threats),after:remaining});
 });
 test(`${label}: native-knight threat search remains legal, pure, budgeted and seed blind`,()=>{
  const before=structuredClone(s),r=C.analyzeTacticalAction(s,{nodeLimit:1400,maxDepth:8,modelWeights:null});
  assert.ok(r.stats.nodes<=1400);apply(Rules,s,r.action);assert.deepEqual(s,before);
  assert.deepEqual(C.analyzeTacticalAction({...s,randomState:0xffffffff},{nodeLimit:1400,maxDepth:8,modelWeights:null}).action,r.action);
  results.push({label,action:r.action,stats:r.stats});
 });
}
after(async()=>{await writeFile('knight-carry-probe.json',JSON.stringify(results,null,2)+'\n');});
