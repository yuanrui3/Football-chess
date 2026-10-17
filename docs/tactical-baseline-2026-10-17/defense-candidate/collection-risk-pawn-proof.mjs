import {readFile,writeFile} from 'node:fs/promises';import vm from 'node:vm';
import * as B from './full-reply-risk-base.mjs';
const src=await readFile('./engine-collection-risk.mjs','utf8'),C=await import('data:text/javascript;base64,'+Buffer.from(src+'\nexport {tacticalFullReplyRisk,tacticalTackleRisk};').toString('base64'));
const tests=await readFile('/workspace/github/football-chess-pace/tests/pawn-tactical-awareness.test.mjs','utf8');
const natural=tests.slice(tests.indexOf('function naturalTrap()'),tests.indexOf("test('the bounded inner reply",tests.indexOf('function naturalTrap()')));
const context=vm.createContext({fixture:positions=>{const s=B.createGame({seed:55});for(const p of s.pieces)Object.assign(p,{x:positions[p.id][0],y:positions[p.id][1]});const c=s.pieces.find(p=>p.id==='white-Q');Object.assign(s,{attack:'white',phase:'defendMove',ball:{x:c.x,y:c.y,carrierId:c.id},restart:null,offside:null,pendingShot:null,paceControl:null,positionBudget:{normalUsed:false,pawnUsed:false,dribbleUsed:false}});return s;}});
vm.runInContext(natural+'\nglobalThis.state=naturalTrap();',context);const state=context.state,rows=[];let s=structuredClone(state),kicked=false,finished=false;
for(let j=0;j<20;j++){
 const team=C.currentTeam(s),phase=s.phase,a=C.analyzeTacticalAction(s,{nodeLimit:1400,maxDepth:8,modelWeights:null}).action;
 const next=a.type==='move'?C.applyMove(s,a.pieceId,a.x,a.y,{freePawn:a.freePawn}):a.type==='kick'?C.applyKick(s,a.x,a.y,{disguise:a.disguise}):C.skipMove(s);
 rows.push({team,phase,action:a,result:next.lastAction.type,ball:next.ball,progress:C.progressInfo(next)});s=next;
 if(team==='white'&&a.type==='kick')kicked=true;
 if(kicked&&s.phase==='defendMove'&&s.attack==='white'&&s.ball.carrierId){finished=true;break;}
 if(s.attack!=='white')break;
}
const carrier=s.pieces.find(p=>p.id===s.ball.carrierId),risk=carrier?C.tacticalFullReplyRisk(s,carrier):null;
await writeFile('collection-risk-pawn-proof.json',JSON.stringify({rows,finished,risk,finalState:s},null,2)+'\n');console.log(JSON.stringify({rows,finished,risk}));
