import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
const expose=async p=>import('data:text/javascript;base64,'+Buffer.from(await readFile(new URL(p,import.meta.url),'utf8')+'\nexport {tacticalKnightCarryThreats,tacticalKnightCarryExposure,tacticalKickRank,tacticalShots,tacticalBasePositionValue};').toString('base64'));
const [B,C]=await Promise.all([expose('../engine-base.mjs'),expose('../engine.mjs')]);
const origin=JSON.parse(await readFile(new URL('../fixtures/native-knight-route.json',import.meta.url),'utf8'));
const other=t=>t==='white'?'black':'white',id=v=>v?.replace(/^(white|black)/,other)??null,point=p=>({x:13-p.x,y:16-p.y});
function mirror(s){const t=structuredClone(s);t.attack=other(s.attack);t.pieces=s.pieces.map(p=>({...p,...point(p),team:other(p.team),id:id(p.id)}));t.ball={...point(s.ball),carrierId:id(s.ball.carrierId)};t.score={white:s.score.black,black:s.score.white};if(s.offside)t.offside={...s.offside,team:other(s.offside.team),kickerId:id(s.offside.kickerId),flaggedIds:s.offside.flaggedIds.map(id),ball:point(s.offside.ball),secondLastY:16-s.offside.secondLastY};if(s.ballProgress)t.ballProgress={...s.ballProgress,team:other(s.ballProgress.team),anchorY:16-s.ballProgress.anchorY};if(s.paceControl)t.paceControl={...s.paceControl,team:other(s.paceControl.team),carrierId:id(s.paceControl.carrierId),history:[]};t.discipline=Object.fromEntries(Object.entries(s.discipline||{}).map(([key,v])=>[id(key),v]));return t;}
function act(s,a,roll=.5){if(a.type==='kick'){assert.ok(C.legalKicks(s).some(k=>k.x===a.x&&k.y===a.y));return C.applyKick(s,a.x,a.y,{roll,disguise:!!a.disguise});}if(a.type==='move'){assert.ok(C.legalMoves(s,a.pieceId,{freePawn:!!a.freePawn}).some(m=>m.x===a.x&&m.y===a.y));return C.applyMove(s,a.pieceId,a.x,a.y,{roll,freePawn:!!a.freePawn});}return C.skipMove(s,{roll});}
function defend(s,difficulty){let count=0;while(s.phase==='defendMove'&&count++<4){const a=B.chooseAIAction({...s,randomState:0},{difficulty,modelWeights:null});s=act(s,a);}assert.equal(s.phase,'kick');return s;}
for(const [label,original]of [['black',origin],['white',mirror(origin)]]){
 test(`${label} Tactical finds a legal knight receiving carry and values its native finish`,()=>{
  let s=defend(structuredClone(original),'casual');const before=structuredClone(s),carrier=s.pieces.find(p=>p.id===s.ball.carrierId),threat=C.tacticalKnightCarryThreats(s,carrier)[0];
  assert.ok(threat?.probability>.4);const kick=C.legalKicks(s).find(k=>k.x===threat.x&&k.y===threat.y);assert.ok(kick&&!kick.offside);
  assert.ok(C.tacticalKickRank(s,kick,s.attack)>B.tacticalKickRank(s,kick,s.attack)+300);
  const gain=C.tacticalBasePositionValue(s,s.attack)-B.tacticalBasePositionValue(s,s.attack);assert.ok(gain>0&&gain<=62.5,'future finishing value is bounded, not a guaranteed goal');
  const report=C.analyzeTacticalAction(s,{modelWeights:null});assert.ok(report.stats.nodes<=1400);assert.deepEqual(report.action,C.analyzeTacticalAction({...s,randomState:0xffffffff},{modelWeights:null}).action);
  assert.equal(report.action.x,threat.x);assert.equal(report.action.y,threat.y);assert.deepEqual(s,before);
  s=act(s,report.action);assert.equal(s.ball.carrierId,null);let steps=0,carried=false;
  while(s.phase==='attackMove'&&steps++<4){const a=C.chooseAIAction({...s,randomState:0},{difficulty:'tactical',modelWeights:null});const previous=s;s=act(s,a);if(previous.ball.carrierId===threat.pieceId&&a.type==='move'&&a.pieceId===threat.pieceId)carried=true;}
  assert.equal(s.phase,'defendMove');assert.equal(s.ball.carrierId,threat.pieceId);assert.ok(carried);assert.ok(C.tacticalShots(s,s.attack,true)>.7);
  const defense=B.chooseAIAction({...s,randomState:0},{difficulty:'casual',modelWeights:null}),challenge=C.legalMoves(s,defense.pieceId,{freePawn:!!defense.freePawn}).find(m=>m.x===defense.x&&m.y===defense.y);
  assert.equal(challenge.type,'tackle','an actual defensive policy challenges the receiving knight');assert.equal(challenge.cleanTackleProbability,.5);
  const won=act(s,defense,.2),escaped=act(s,defense,.8);assert.equal(won.attack,other(s.attack));assert.notEqual(won.ball.carrierId,threat.pieceId);assert.equal(escaped.ball.carrierId,threat.pieceId,'the native 50% resistance remains unchanged');
 });
 test(`${label} actual Tactical counterplay closes the knight route before the pass`,()=>{
  const casual=defend(structuredClone(original),'casual'),tactical=defend(structuredClone(original),'tactical');const carrier=casual.pieces.find(p=>p.id===casual.ball.carrierId),threats=C.tacticalKnightCarryThreats(casual,carrier);
  const oldExposure=C.tacticalKnightCarryExposure(casual,carrier,threats),remaining=C.tacticalKnightCarryExposure(tactical,tactical.pieces.find(p=>p.id===tactical.ball.carrierId),threats);assert.ok(remaining<oldExposure*.3);
  const response=C.analyzeTacticalAction(tactical,{modelWeights:null});assert.ok(response.stats.nodes<=1400);act(tactical,response.action);
  assert.deepEqual(C.chooseAIAction(tactical,{difficulty:'casual',modelWeights:null}),B.chooseAIAction(tactical,{difficulty:'casual',modelWeights:null}));
 });
}
