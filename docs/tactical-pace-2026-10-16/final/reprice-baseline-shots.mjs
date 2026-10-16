import fs from 'node:fs';
import * as oldRules from '../baseline/engine.mjs';
import * as newRules from './engine.mjs';
const dir = new URL('.',import.meta.url), rows=[];
for(const name of ['baseline-202610161-white','baseline-202610162-black']) {
 const match=JSON.parse(fs.readFileSync(new URL(`../diagnosis/${name}.json`,dir),'utf8'));
 for(let index=1;index<match.events.length;index++) {
  const event=match.events[index],before=match.events[index-1].state;
  if(before.phase!=='keeperReact') continue;
  const result=event.result.type==='stalling'?event.result.triggeringAction:event.result;
  if(!result?.shotModel) continue;
  const state=structuredClone(before),shot=state.pendingShot;
  if(result.keeperMove) Object.assign(state.pieces.find(p=>p.id===result.keeperMove.pieceId),result.keeperMove.to);
  if(result.disguised) {
   const option=shot.targetOptions[result.chosenTargetIndex];Object.assign(shot,option);
   delete shot.disguised;delete shot.targetOptions;
  }
  const oldModel=oldRules.shotModel(state),newModel=newRules.shotModel(state);
  rows.push({match:name,step:event.step,shooterId:shot.shooterId,from:shot.from,target:{x:shot.x,y:shot.y},
   oldProbability:oldModel.probability,newProbability:newModel.probability,increase:newModel.probability-oldModel.probability,
   oldSaveGivenOnTarget:oldModel.saveGivenOnTarget,newSaveGivenOnTarget:newModel.saveGivenOnTarget});
 }
}
const report={rows,count:rows.length,oldXG:rows.reduce((sum,row)=>sum+row.oldProbability,0),
 newXG:rows.reduce((sum,row)=>sum+row.newProbability,0),note:'Same recorded shot origins, actual goal targets and final keeper reaction squares. This isolates the model change; actual selfplay may select different actions.'};
fs.writeFileSync(new URL('repriced-baseline-shots.json',dir),JSON.stringify(report,null,2));
process.stdout.write(JSON.stringify(report,null,2)+'\n');
