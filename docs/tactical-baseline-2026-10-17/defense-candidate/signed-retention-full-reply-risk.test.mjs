import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
const expose=async p=>import('data:text/javascript;base64,'+Buffer.from(await readFile(p,'utf8')+'\nexport {tacticalTackleRisk,tacticalFullReplyRisk,rankedTacticalActions};').toString('base64'));
const C=await expose('./engine-signed-collection-risk.mjs'),B=await import('./full-reply-risk-base.mjs');
const misses=JSON.parse(await readFile('possession-full-reply-audit.json','utf8')).counterexamples;
const other=t=>t==='white'?'black':'white',id=v=>v?.replace(/^(white|black)/,other)??null,point=p=>({x:13-p.x,y:16-p.y});
function mirror(s){const t=structuredClone(s);t.attack=other(s.attack);t.pieces=s.pieces.map(p=>({...p,...point(p),team:other(p.team),id:id(p.id)}));t.ball={...point(s.ball),carrierId:id(s.ball.carrierId)};t.score={white:s.score.black,black:s.score.white};t.sentOff=(s.sentOff||[]).map(p=>({...p,...point(p),team:other(p.team),id:id(p.id)}));
 if(s.offside)t.offside={...s.offside,team:other(s.offside.team),kickerId:id(s.offside.kickerId),flaggedIds:s.offside.flaggedIds.map(id),ball:point(s.offside.ball),secondLastY:16-s.offside.secondLastY};
 if(s.ballProgress)t.ballProgress={...s.ballProgress,team:other(s.ballProgress.team),anchorY:16-s.ballProgress.anchorY};
 if(s.paceControl)t.paceControl={...s.paceControl,team:other(s.paceControl.team),carrierId:id(s.paceControl.carrierId),history:[]};
 t.discipline=Object.fromEntries(Object.entries(s.discipline||{}).map(([k,v])=>[id(k),v]));return t;}
for(const [i,miss]of misses.entries())for(const [label,s]of [['original',miss.afterCarry],['mirror',mirror(miss.afterCarry)]])test(`counterexample${i} ${label}: Tactical sees and preserves a legal discovered tackle without changing Casual`,()=>{
 const before=structuredClone(s),carrier=s.pieces.find(p=>p.id===s.ball.carrierId);
 assert.equal(C.tacticalTackleRisk(s,carrier),0,'legacy shared helper missed the vacated line');
 assert.equal(C.tacticalFullReplyRisk(s,carrier),.9);
 const reply=s.phase==='attackMove'?C.skipMove(s):s;
 const choices=C.rankedTacticalActions(reply,3,false),setup=choices.find(x=>x.category==='tackleSetup');
 assert.ok(setup,'bounded inner beam retains a bonus that enables an ordinary challenge');
 const a=setup.action,after=C.applyMove(reply,a.pieceId,a.x,a.y,{freePawn:true}),flags=new Set(C.offsideFlaggedIds(after));
 const tackles=after.pieces.filter(p=>p.team===C.currentTeam(after)&&!flags.has(p.id)).flatMap(p=>C.legalMoves(after,p.id).filter(m=>m.type==='tackle').map(m=>({...m,pieceId:p.id})));
 assert.ok(tackles.length);const won=C.applyMove(after,tackles[0].pieceId,tackles[0].x,tackles[0].y,{roll:.2});assert.equal(won.attack,C.currentTeam(reply));
 assert.deepEqual(C.chooseAIAction(s,{difficulty:'casual',modelWeights:null}),B.chooseAIAction(s,{difficulty:'casual',modelWeights:null}));
 assert.deepEqual(s,before);
 const attackEntries=C.rankedTacticalActions(miss.state,9,true);
 assert.ok(!attackEntries.some(e=>e.category==='safeDribble'&&e.action.x===miss.carry.x&&e.action.y===miss.carry.y),'vulnerable carry is no longer classified safe');
});
