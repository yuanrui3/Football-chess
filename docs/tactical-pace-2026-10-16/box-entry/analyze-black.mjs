import fs from 'node:fs';
import * as rules from './engine.mjs';
import {applyAction} from '../diagnosis/simulate.mjs';
const seed=202610162,kickoff='black',full=process.argv.includes('--full'),limit=full?480:240;
const box=(x,y)=>rules.BOX_FILES.includes(x)&&(y<rules.BOX_DEPTH||y>=rules.BOARD_HEIGHT-rules.BOX_DEPTH);
const opponentBox=(team,x,y)=>box(x,y)&&(team==='white'?y<rules.BOX_DEPTH:y>=rules.BOARD_HEIGHT-rules.BOX_DEPTH);
function analyze(match,limit){
 const events=match.events.slice(0,limit),initial=rules.createGame({mode:'local',seed,kickoff,minutes:10,foulsEnabled:true});
 let previous=initial;const entries=[],resolvedShots=[],shots=[],paceAwards=[],fouls=[],penalties=[];const roles={};
 for(let i=0;i<events.length;i++){
  const e=events[i],r=e.result,actor=previous.pieces.find(p=>p.id===e.action.pieceId);
  if(e.action.type==='move'&&actor&&previous.ball.carrierId===actor.id&&r.type==='move'&&r.to){
   const dx=r.to.x-actor.x,dy=r.to.y-actor.y,length=actor.type==='N'?1:Math.max(Math.abs(dx),Math.abs(dy));
   let wasBox=box(actor.x,actor.y),entered=false,opponentEntry=false;
   for(let k=1;k<=length;k++){const x=actor.type==='N'?r.to.x:actor.x+Math.sign(dx)*k,y=actor.type==='N'?r.to.y:actor.y+Math.sign(dy)*k,nowBox=box(x,y);if(!wasBox&&nowBox){entered=true;if(opponentBox(actor.team,x,y))opponentEntry=true;}wasBox=nowBox;}
   if(entered){
    const entry={step:e.step,team:actor.team,pieceId:actor.id,type:actor.type,from:{x:actor.x,y:actor.y},to:r.to,opponentEntry,shot:null};
    for(let j=i+1;j<events.length&&j<=i+16;j++){
     const later=events[j];
     if(later.result.type==='shotAttempt'&&(later.result.shooterId||later.result.pieceId)===actor.id){const resolution=events[j+1];entry.shot={step:later.step,actionsAfterEntry:later.step-e.step,disguised:!!later.result.disguised,resolved:resolution?.phase==='keeperReact',outcome:resolution?.result.outcome,xG:resolution?.result.shotModel?.probability??null};break;}
     if(later.state.attack!==actor.team||later.state.ball.carrierId&&later.state.ball.carrierId!==actor.id)break;
    }
    entries.push(entry);
   }
  }
  if(r.type==='foul')fouls.push({step:e.step,team:r.team,card:r.card||null,penalty:e.state.restart?.type==='penalty'});
  if(r.type==='shotAttempt'&&previous.restart?.type==='penalty')penalties.push({step:e.step,team:r.team,pieceId:r.pieceId});
  if(r.type==='shotAttempt'&&e.action.type==='kick')shots.push({step:e.step,pieceId:r.shooterId||r.pieceId,team:r.shootingTeam||r.team,disguised:!!r.disguised});
  if(e.phase==='keeperReact'&&r.shotModel){
   const detail={step:e.step,pieceId:r.shooterId,team:r.shootingTeam,type:r.shotModel.shooterType,origin:r.shotModel.origin,distance:r.shotModel.distance,xG:r.shotModel.probability,outcome:r.outcome,goal:r.type==='goal',blockers:r.shotModel.blockerIds?.length||0,disguised:!!r.disguised};resolvedShots.push(detail);
   const role=roles[detail.type]??={shots:0,goals:0,xG:0};role.shots++;role.goals+=detail.goal?1:0;role.xG+=detail.xG;
  }
  if(r.type==='stalling'&&r.reason)paceAwards.push({step:e.step,team:r.team,reason:r.reason});
  previous=e.state;
 }
 return {actions:events.length,score:events.at(-1).state.score,shots:shots.length,resolvedShots:resolvedShots.length,xG:resolvedShots.reduce((s,r)=>s+r.xG,0),entries,opponentDribbleEntries:entries.filter(e=>e.opponentEntry).length,roles,resolutions:resolvedShots,paceAwards,fouls,penalties};
}
const trial=JSON.parse(fs.readFileSync(new URL(`./${full?'box-entry-480':'box-entry'}-${seed}-${kickoff}.json`,import.meta.url),'utf8'));
const reference=JSON.parse(fs.readFileSync(new URL(`../final/final-${seed}-${kickoff}.json`,import.meta.url),'utf8'));
let replay=rules.createGame({mode:'local',seed,kickoff,minutes:10,foulsEnabled:true});
for(const event of trial.events){replay=applyAction(rules,replay,event.action);if(JSON.stringify(replay)!==JSON.stringify(event.state))throw new Error(`Trial replay mismatch at ${event.step}`);}
const report={seed,kickoff,actionLimit:limit,trial:analyze(trial,limit),reference:analyze(reference,limit),audit:{exactReplayedTransitions:trial.events.length,mismatches:0},note:'Fixed atomic-action comparison, not a timed match. Shot xG is read after the actual keeper reaction and target choice.'};
fs.writeFileSync(new URL(full?'./black-comparison-480.json':'./black-comparison.json',import.meta.url),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
