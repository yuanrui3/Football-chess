import test from 'node:test';
import assert from 'node:assert/strict';
import {E,fixture,model,point,pieceId,clone,rawAccuracy,clampAccuracy} from './helpers/shot-fixture.mjs';
const close=(a,b,label='')=>assert.ok(Math.abs(a-b)<1e-10,`${label}: ${a} != ${b}`);
const fields=['probability','baseGoalProbability','scoringMultiplier','saveProbability','missProbability','onTargetProbability','baseOnTargetProbability','cornerProbability','keeperCornerProbability','caughtSaveProbability','blockProbability','blockOutProbability','blockPossessionProbability','arrivalSpeed','keeperStretch','parryGivenSave','distance','shotAngleDegrees','goalDepth','goalOpeningDegrees','centralGoalOpeningDegrees','goalOpeningRatio','postAngleFactor','wideAngleFactor','centralLaneFactor','keeperPathDistance','timeToKeeper','reach'];
function conserved(m){close(m.goalProbability+m.saveProbability+m.missProbability+m.blockProbability,1);close(m.blockOutProbability+m.blockPossessionProbability,m.blockProbability);close(m.keeperCornerProbability+m.caughtSaveProbability,m.saveProbability);close(m.onTargetProbability,m.goalProbability+m.saveProbability);for(const f of fields)assert.ok(Number.isFinite(m[f]),f);}
test('current model has stronger post penalties, the rook distance curve and the central-lane reward',()=>{
 assert.equal(E.SHOT_MODEL.version,13);assert.equal(E.SHOT_MODEL.finishingAccuracyMultiplier,1.15);assert.equal(E.SHOT_MODEL.postAngleFloor,.10);assert.equal(E.SHOT_MODEL.postAngleWeight,.90);assert.equal(E.SHOT_MODEL.postAngleExponent,1.5);assert.equal(E.SHOT_MODEL.centralLaneAccuracyBonus,.15);assert.equal(E.SHOT_MODEL.rookLongShotDecay,.03);assert.equal(E.SHOT_MODEL.longShotDecay,.06);assert.equal(E.createGame().rulesVersion,E.RULES_VERSION);
});
for(const team of ['white','black']){
 test(`${team}: a legal wide queen finish has a stronger physical opening penalty`,()=>{
  const s=fixture({team,origin:[3,1]}),before=clone(s),target=point([5,-1],team),m=model(s,5);
  assert.ok(E.legalKicks(s).some(k=>k.goal===team&&k.x===target.x&&k.y===target.y));
  const opening=Math.atan2(5.5,1.5)-Math.atan2(1.5,1.5),central=2*Math.atan2(2,1.5),ratio=opening/central;
  close(m.goalDepth,1.5);close(m.goalOpeningDegrees,opening*180/Math.PI);close(m.goalOpeningRatio,ratio);close(m.postAngleFactor,.1+.9*ratio**1.5);assert.ok(m.postAngleFactor<.25+.75*ratio);assert.equal(m.centralLaneFactor,1);close(m.baseOnTargetProbability,clampAccuracy(rawAccuracy(m)));conserved(m);assert.deepEqual(s,before);
 });
 test(`${team}: visible opening depends on the origin rather than which legal post is aimed at`,()=>{
  const s=fixture({team,type:'N',origin:[6,1]}),a=model(s,5),b=model(s,8);
  for(const f of ['goalOpeningDegrees','goalOpeningRatio','postAngleFactor','wideAngleFactor','centralLaneFactor'])close(a[f],b[f],f);
 });
 test(`${team}: central distant shots retain a normalized opening close to one`,()=>{
  for(const y of [4,8,12,15]){const c=model(fixture({team,origin:[6,y]}),6),w=model(fixture({team,origin:[1,y]}),5);assert.ok(c.postAngleFactor>w.postAngleFactor);if(y>=8)assert.ok(c.postAngleFactor>.99);assert.equal(c.centralLaneFactor,1.15);assert.equal(w.centralLaneFactor,1);}
 });
 test(`${team}: rooks gain range accuracy with identical close finishing and keeper geometry`,()=>{
  for(const y of [3,4,6,8,12,15]){const r=model(fixture({team,type:'R',origin:[5,y]}),5),q=model(fixture({team,type:'Q',origin:[5,y]}),5);assert.equal(r.distancePenaltyRate,.03);assert.equal(q.distancePenaltyRate,.06);close(r.reach,q.reach);close(r.saveGivenOnTarget,q.saveGivenOnTarget);if(r.distance>3){assert.ok(r.baseOnTargetProbability>=q.baseOnTargetProbability);if(q.baseOnTargetProbability>.01&&r.baseOnTargetProbability<.98)close(r.baseOnTargetProbability/q.baseOnTargetProbability,Math.exp(.03*(r.distance-3)**2));}conserved(r);conserved(q);}
  const r=model(fixture({team,type:'R',origin:[5,2]}),5),q=model(fixture({team,type:'Q',origin:[5,2]}),5);close(r.baseOnTargetProbability,q.baseOnTargetProbability);
 });
 test(`${team}: knight finishing follows the selected multiplier without changing its distance curve`,()=>{
  const n=model(fixture({team,type:'N',origin:[4,1]}),5),q=model(fixture({team,type:'Q',origin:[4,1]}),5);
  assert.equal(n.distancePenaltyRate,.06);close(n.baseOnTargetProbability,q.baseOnTargetProbability);close(n.baseGoalProbability,q.baseGoalProbability);assert.equal(n.scoringMultiplier,E.SHOT_MODEL.knightGoalMultiplier);close(n.goalProbability,Math.min(1,n.baseGoalProbability*E.SHOT_MODEL.knightGoalMultiplier));assert.equal(q.scoringMultiplier,1);conserved(n);
 });
 test(`${team}: accuracy decreases between its close cap and far floor for every piece`,()=>{
  for(const type of E.TYPES){let previous=1;for(const y of [3,4,6,8,12,15]){const m=model(fixture({team,type,origin:[6,y]}),6);assert.ok(m.baseOnTargetProbability<=previous+1e-12);previous=m.baseOnTargetProbability;conserved(m);}const far=model(fixture({team,type,origin:[0,16],keeper:[10,5]}),8);close(far.baseOnTargetProbability,.01);}
 });
 test(`${team}: declared shooter identity survives a different carrier and legacy ID fallback`,()=>{
  const s=fixture({team,type:'R',origin:[5,6]}),target=point([5,-1],team),pending=E.applyKick(s,target.x,target.y),expected=E.shotModel(pending),changed=clone(pending);
  changed.ball.carrierId=pieceId('white-N1',team);assert.deepEqual(E.shotModel(changed),expected);delete changed.pendingShot.shooterType;assert.deepEqual(E.shotModel(changed),expected);assert.equal(expected.shooterType,'R');assert.equal(expected.distancePenaltyRate,.03);
 });
 test(`${team}: reload and keeper resolution preserve committed origin and seeded outcomes`,()=>{
  const s=fixture({team,type:'R',origin:[5,6]}),target=point([5,-1],team),pending=E.applyKick(s,target.x,target.y),before=clone(pending);pending.lastAction.shotModel={modelVersion:10,probability:1};
  const restored=E.normalizeGame(pending),m=E.shotModel(restored);assert.equal(m.modelVersion,E.SHOT_MODEL.version);assert.deepEqual(restored.lastAction.shotModel,m);assert.equal(restored.randomState,before.randomState);assert.deepEqual(restored.pendingShot,before.pendingShot);assert.deepEqual(E.normalizeGame(clone(restored)),restored);
  const keeperId=pieceId('black-K',team),move=E.legalMoves(restored,keeperId)[0];assert.ok(move);const resolved=E.applyMove(restored,keeperId,move.x,move.y,{roll:0});assert.deepEqual(resolved.lastAction.shotModel.origin,before.pendingShot.from);assert.equal(resolved.lastAction.shotModel.shooterType,'R');
 });
}
test('horizontal and half-turn reflections retain all model probabilities and physical geometry',()=>{
 for(const type of ['Q','R','N'])for(const origin of [[3,1],[5,3],[6,4],[6,8],[5,12]]){const a=model(fixture({type,origin,keeper:[8,0]}),5),b=model(fixture({team:'black',type,origin,keeper:[8,0]}),5),c=model(fixture({type,origin:[13-origin[0],origin[1]],keeper:[5,0]}),8);for(const f of fields){close(a[f],b[f],f);close(a[f],c[f],f);}}
});
test('invalid shot previews remain finite, conserve mass and expose no scoring opportunity',()=>{
 for(const state of [null,{}, {pieces:[],ball:{x:NaN,y:0}}, {...fixture(),pendingShot:{from:{x:Infinity,y:0}}}]){const m=E.shotModel(state,5,-1);assert.equal(m.modelVersion,E.SHOT_MODEL.version);assert.equal(m.probability,0);conserved(m);}const m=E.shotModel(fixture(),3,-1);assert.equal(m.probability,0);conserved(m);
});
