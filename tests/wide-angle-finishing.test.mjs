import test from 'node:test';
import assert from 'node:assert/strict';
import {E,fixture,model,point,pieceId,clone,rawAccuracy,clampAccuracy} from './helpers/shot-fixture.mjs';
const close=(a,b,label='')=>assert.ok(Math.abs(a-b)<1e-10,`${label}: ${a} != ${b}`);
const bonus=degrees=>{const t=Math.max(0,Math.min(1,(degrees-45)/45));return 1+.25*t*t*(3-2*t);};
function mass(m){close(m.goalProbability+m.saveProbability+m.missProbability+m.blockProbability,1);close(m.onTargetProbability,m.goalProbability+m.saveProbability);close(m.keeperCornerProbability+m.caughtSaveProbability,m.saveProbability);}
test('wide-opening bonus is monotonic through both plateaus across the expanded pitch',()=>{
 const models=[];for(let x=0;x<E.BOARD_WIDTH;x++)for(let y=0;y<E.BOARD_HEIGHT;y++)models.push(model(fixture({type:'N',origin:[x,y],keeper:[10,5]}),5));models.sort((a,b)=>a.goalOpeningDegrees-b.goalOpeningDegrees);
 let previous=1,narrow=0,middle=0,wide=0;for(const m of models){close(m.wideAngleFactor,bonus(m.goalOpeningDegrees));assert.ok(m.wideAngleFactor>=previous-1e-12);previous=m.wideAngleFactor;if(m.goalOpeningDegrees<=45){assert.equal(m.wideAngleFactor,1);narrow++;}else if(m.goalOpeningDegrees>=90){assert.equal(m.wideAngleFactor,1.25);wide++;}else middle++;close(m.baseOnTargetProbability,clampAccuracy(rawAccuracy(m)));mass(m);}assert.ok(narrow&&middle&&wide);
});
for(const team of ['white','black']){
 test(`${team}: narrow views keep the wide-opening bonus off while receiving stronger post pressure`,()=>{
  for(const type of E.TYPES)for(const origin of [[3,1],[0,4],[5,8],[6,12],[2,15]]){const m=model(fixture({team,type,origin}),5);assert.ok(m.goalOpeningDegrees<=45);assert.equal(m.wideAngleFactor,1);assert.ok(m.postAngleFactor<=.25+.75*m.goalOpeningRatio+1e-12);close(m.baseOnTargetProbability,clampAccuracy(rawAccuracy(m)));mass(m);}
 });
 test(`${team}: a legal central queen finish gets the wide-opening and central-lane rewards`,()=>{
  const s=fixture({team,origin:[6,3]}),target=point([6,-1],team),m=model(s,6);assert.ok(E.legalKicks(s).some(k=>k.goal===team&&k.x===target.x&&k.y===target.y));assert.ok(m.wideAngleFactor>1);assert.equal(m.centralLaneFactor,1.15);const unbonused=clampAccuracy(rawAccuracy(m)/m.wideAngleFactor/m.centralLaneFactor);assert.ok(rawAccuracy(m)>rawAccuracy(m)/m.wideAngleFactor/m.centralLaneFactor);assert.ok(m.baseOnTargetProbability>=unbonused);if(unbonused<E.SHOT_MODEL.maxOnTarget)assert.ok(m.baseOnTargetProbability>unbonused);assert.ok(m.baseOnTargetProbability<=.98);mass(m);
 });
 test(`${team}: the two center files receive equal rewards, independent of the chosen goal target`,()=>{
  for(const x of E.CENTRAL_GOAL_FILES){const s=fixture({team,origin:[x,5]});for(const aim of E.GOAL_FILES){const m=model(s,aim);assert.equal(m.centralLaneFactor,1.15);close(m.baseOnTargetProbability,clampAccuracy(rawAccuracy(m)));}}
  for(const x of [E.GOAL_FILES[0],E.GOAL_FILES.at(-1),0,13])assert.equal(model(fixture({team,origin:[x,5]}),6).centralLaneFactor,1);
 });
 test(`${team}: in-box knight shots reach the maximum angular reward and respect the selected scoring rule`,()=>{
  const s=fixture({team,type:'N',origin:[6,1]}),target=point([5,-1],team),m=model(s,5);assert.ok(E.legalKicks(s).some(k=>k.goal===team&&k.x===target.x&&k.y===target.y));assert.ok(m.goalOpeningDegrees>=90);assert.equal(m.wideAngleFactor,1.25);assert.equal(m.centralLaneFactor,1.15);assert.equal(m.scoringMultiplier,E.SHOT_MODEL.knightGoalMultiplier);close(m.goalProbability,Math.min(1,m.baseGoalProbability*m.scoringMultiplier));mass(m);
 });
 test(`${team}: distance, keeper flight time and reach remain physical after the accuracy rewards`,()=>{
  const m=model(fixture({team,type:'R',origin:[5,3],keeper:[7,0]}),5);close(m.distance,3.5);close(m.timeToKeeper,.5);close(m.keeperPathDistance,2);const reach=.4+1.3*(.5-.15),conditional=.94*(1-Math.exp(-(.35+.5)/.45))*Math.exp(-((2/reach)**2));close(m.reach,reach);close(m.saveGivenOnTarget,conditional);close(m.goalProbability,clampAccuracy(rawAccuracy(m))*(1-conditional));mass(m);
 });
 test(`${team}: preview, saved declarations and keeper reactions preserve both accuracy rewards and RNG purity`,()=>{
  for(const [type,origin,file]of [['Q',[6,3],6],['R',[5,3],5],['N',[6,1],5]]){const s=fixture({team,type,origin}),before=clone(s),target=point([file,-1],team),preview=model(s,file);E.legalKicks(s);assert.deepEqual(s,before);assert.deepEqual(E.shotModel({...s,randomState:123456789},target.x,target.y),preview);const pending=E.applyKick(s,target.x,target.y),saved=clone(pending);saved.lastAction.shotModel={modelVersion:10,probability:.5};const restored=E.normalizeGame(saved),current=E.shotModel(restored);assert.equal(current.modelVersion,E.SHOT_MODEL.version);close(current.wideAngleFactor,preview.wideAngleFactor);close(current.centralLaneFactor,preview.centralLaneFactor);assert.deepEqual(restored.lastAction.shotModel,current);assert.equal(restored.randomState,pending.randomState);const keeperId=pieceId('black-K',team),move=E.legalMoves(restored,keeperId)[0];assert.ok(move);const expected=E.shotModel(restored,target.x,target.y,move),resolved=E.applyMove(restored,keeperId,move.x,move.y,{roll:0});assert.equal(resolved.lastAction.type,'goal');assert.deepEqual(resolved.lastAction.shotModel,expected);assert.deepEqual(resolved.lastAction.shotModel.origin,pending.pendingShot.from);mass(expected);}
 });
}
test('an invalid wide-angle preview never acquires a central-file scoring reward',()=>{
 for(const state of [null,{}, {pieces:[],ball:{x:NaN,y:0}}]){const m=E.shotModel(state,6,-1);assert.equal(m.probability,0);assert.equal(m.centralLaneFactor,1);assert.equal(m.wideAngleFactor,1);mass(m);}
});
