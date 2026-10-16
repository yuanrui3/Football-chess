import fs from 'node:fs';
import assert from 'node:assert/strict';
import * as trial from './engine.mjs';
import * as base from '../final/production-engine.mjs';
import {applyAction} from '../diagnosis/simulate.mjs';
const dir=new URL('.',import.meta.url);
function analyze(match,rules,limit=240) {
 let state=rules.createGame({mode:'local',seed:match.seed,kickoff:match.kickoff,minutes:10,foulsEnabled:true});
 const out={seed:match.seed,kickoff:match.kickoff,actions:Math.min(match.events.length,limit),shots:0,resolvedShots:0,
  postReactionXG:0,queenShots:0,queenGoals:0,queenXG:0,boxEntries:[],shotsInsideOpponentBox:0,penaltiesAwarded:0,
  cards:{yellow:0,red:0},paceAwards:{},shotOutcomes:[]};
 for(const event of match.events.slice(0,limit)) {
  const before=state;state=applyAction(rules,state,event.action);
  assert.deepEqual(state,event.state,`Exact replay ${match.label} action ${event.step}`);
  const result=state.lastAction;
  if(result.type==='shotAttempt'&&state.phase==='keeperReact') {
   out.shots++;const shot=state.pendingShot;
   if(shot.shooterType==='Q')out.queenShots++;
   if(rules.inOwnBox(shot.defendingTeam,shot.from.x,shot.from.y))out.shotsInsideOpponentBox++;
  }
  if(before.phase==='keeperReact') {
   const actual=result.type==='stalling'?result.triggeringAction:result;
   if(actual?.shotModel) {
    out.resolvedShots++;out.postReactionXG+=actual.probability;
    if(before.pendingShot.shooterType==='Q')out.queenXG+=actual.probability;
    if(actual.type==='goal'&&before.pendingShot.shooterType==='Q')out.queenGoals++;
    out.shotOutcomes.push({step:event.step,shooterId:before.pendingShot.shooterId,from:actual.from,
     probability:actual.probability,outcome:actual.outcome});
   }
  }
  if(result.type==='move'&&before.phase==='attackMove'&&!before.restart&&event.action.pieceId===before.ball.carrierId) {
   const actor=before.pieces.find(p=>p.id===event.action.pieceId);
   const dx=result.to.x-result.from.x,dy=result.to.y-result.from.y;
   const steps=actor.type==='N'?1:Math.max(Math.abs(dx),Math.abs(dy));
   const path=actor.type==='N'?[result.to]:Array.from({length:steps},(_,i)=>({x:result.from.x+Math.sign(dx)*(i+1),y:result.from.y+Math.sign(dy)*(i+1)}));
   let previouslyInside=rules.isBox(result.from.x,result.from.y);
   for(const point of path) {
    const nowInside=rules.isBox(point.x,point.y);
    if(!previouslyInside&&nowInside)out.boxEntries.push({step:event.step,pieceId:actor.id,type:actor.type,team:actor.team,
     from:result.from,to:result.to,entrySquare:point,crossedThrough:!rules.isBox(result.to.x,result.to.y),
     opponentBox:rules.inOwnBox(actor.team==='white'?'black':'white',point.x,point.y)});
    previouslyInside=nowInside;
   }
  }
  if(result.type==='foul') {
   if(state.restart?.type==='penalty')out.penaltiesAwarded++;
   if(result.card==='yellow'||result.secondYellow)out.cards.yellow++;
   if(result.card==='red')out.cards.red++;
  }
  if(result.type==='stalling') {const reason=result.reason||result.restart?.reason||'stalling';out.paceAwards[reason]=(out.paceAwards[reason]||0)+1;}
 }
 out.score=state.score;out.phase=state.phase;out.pendingShots=state.phase==='keeperReact'?1:0;
 out.queenShotShare=out.shots?out.queenShots/out.shots:0;
 out.queenGoalShare=state.score.white+state.score.black?out.queenGoals/(state.score.white+state.score.black):0;
 out.boxEntriesByType=out.boxEntries.reduce((counts,e)=>(counts[e.type]=(counts[e.type]||0)+1,counts),{});
 out.pendingShot=state.phase==='keeperReact'?{shooterId:state.pendingShot.shooterId,from:state.pendingShot.from,
  probabilityBeforeReaction:rules.shotModel(state).probability}:null;
 assert.equal(out.shots,out.resolvedShots+out.pendingShots);
 return out;
}
const full=process.argv.includes('--full'),limit=full?480:240;
const reference=JSON.parse(fs.readFileSync(new URL('../final/final-202610161-white.json',dir),'utf8'));
const alternate=JSON.parse(fs.readFileSync(new URL(full?'box-entry-202610161-white-480.json':'box-entry-202610161-white.json',dir),'utf8'));
assert.equal(alternate.error,null);assert.equal(alternate.actions,limit);
const report={reference:analyze(reference,base,limit),trial:analyze(alternate,trial,limit),
 note:`Matched first${limit} atomic actions; exact transition replay for both; pending attempts are excluded from resolved post-reaction xG. Frozen rule comparison.`};
fs.writeFileSync(new URL(full?'white-comparison-480.json':'white-comparison.json',dir),JSON.stringify(report,null,2));
process.stdout.write(JSON.stringify(report,null,2)+'\n');
