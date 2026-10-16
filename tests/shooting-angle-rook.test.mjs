import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../dist/engine.js';

const other=t=>t==='white'?'black':'white';
const suffix={K:'K',Q:'Q',R:'R1',B:'B1',N:'N1',P:'P1'};
const point=([x,y],team)=>team==='white'?{x,y}:{x:11-x,y:14-y};
const id=(value,team)=>team==='white'?value:value.replace(/^(white|black)/,other);
const clone=s=>JSON.parse(JSON.stringify(s));
const close=(a,b,label='')=>assert.ok(Math.abs(a-b)<1e-12,`${label}: ${a} != ${b}`);
function fixture({team='white',type='Q',origin=[4,7],keeper=[6,0]}={}){
  const s=E.createGame({mode:'local',seed:1984}),carrier=`white-${suffix[type]}`;
  const assigned={'white-K':[5,13],'black-K':keeper,[carrier]:origin};
  const used=new Set(Object.values(assigned).map(p=>p.join(',')));assert.equal(used.size,Object.keys(assigned).length);
  const parking=Array.from({length:15},(_,i)=>[[0,14-i],[11,14-i]]).flat();
  for(const p of s.pieces){const q=assigned[p.id]||parking.find(q=>!used.has(q.join(',')));[p.x,p.y]=q;used.add(q.join(','));if(team==='black'){p.id=id(p.id,team);p.team=other(p.team);Object.assign(p,point(q,team));}}
  const owner=s.pieces.find(p=>p.id===id(carrier,team));s.ball={x:owner.x,y:owner.y,carrierId:owner.id};s.phase='kick';s.attack=team;s.restart=null;s.offside=null;
  s.ballProgress={team,anchorY:owner.y,rounds:0,pendingRelease:false,excludeRelease:false};return s;
}
const model=(s,file=4,keeper)=>{const target=point([file,-1],s.attack);return E.shotModel(s,target.x,target.y,keeper);};
const scoringFields=['probability','goalProbability','baseGoalProbability','scoringMultiplier','saveProbability','missProbability','onTargetProbability','baseOnTargetProbability','saveGivenOnTarget','cornerProbability','caughtSaveProbability','arrivalSpeed','keeperStretch','parryGivenSave','distance','shotAngleDegrees','goalDepth','goalOpeningDegrees','centralGoalOpeningDegrees','goalOpeningRatio','postAngleFactor','keeperPathDistance','timeToKeeper','reach'];
function conserved(m){
  close(m.goalProbability+m.saveProbability+m.missProbability,1,'three outcomes');
  close(m.goalProbability+m.cornerProbability+m.caughtSaveProbability+m.missProbability,1,'handling outcomes');
  close(m.cornerProbability+m.caughtSaveProbability,m.saveProbability,'save split');
  close(m.onTargetProbability,m.goalProbability+m.saveProbability,'on target');
  assert.equal(m.scoringMultiplier,1);
}

test('model version 9 adds a shared visible-goal penalty and a rook-only weaker long-distance curve',()=>{
  assert.equal(E.SHOT_MODEL.version,9);assert.equal(E.SHOT_MODEL.longShotDecay,.06);assert.equal(E.SHOT_MODEL.rookLongShotDecay,.03);
  assert.equal(E.SHOT_MODEL.distancePenaltyStart,3);assert.equal(E.SHOT_MODEL.postAngleFloor,.25);assert.equal(E.SHOT_MODEL.postAngleWeight,.75);
  assert.equal(E.createGame({seed:1}).rulesVersion,13,'matches use the current progress-migration rules version');
});

for(const team of ['white','black']){
  test(`${team}: a legal near-post queen shot receives the physical goal-opening penalty before the accuracy clamp`,()=>{
    const s=fixture({team,origin:[3,0],keeper:[7,0]}),before=clone(s),target=point([4,-1],team);
    assert.ok(E.legalKicks(s).some(k=>k.x===target.x&&k.y===target.y&&k.goal===team));
    const m=model(s),opening=Math.atan2(4.5,.5)-Math.atan2(.5,.5),central=2*Math.atan2(2,.5);
    close(m.goalDepth,.5);close(m.goalOpeningDegrees,opening*180/Math.PI);close(m.centralGoalOpeningDegrees,central*180/Math.PI);
    close(m.goalOpeningRatio,opening/central);close(m.postAngleFactor,.25+.75*opening/central);
    assert.ok(m.postAngleFactor>.44&&m.postAngleFactor<.45,'post-side angle more than halves this old on-target chance');
    const oldAccuracy=.98*Math.exp(-.018*m.distance-.06*Math.max(0,m.distance-3)**2)*(.65+.35*Math.cos(m.shotAngleDegrees*Math.PI/180));
    close(m.onTargetProbability,oldAccuracy*m.postAngleFactor);assert.ok(m.onTargetProbability<.35);
    const anotherAim=model(s,7);close(anotherAim.postAngleFactor,m.postAngleFactor,'the visible opening depends on the shooter, not the aim square');
    conserved(m);assert.deepEqual(s,before);
  });

  test(`${team}: normalized opening uses a central reference at the same depth, retaining central long-shot accuracy`,()=>{
    for(const row of [3,7,10,12]){
      const central=model(fixture({team,origin:[5,row]}),5),wide=model(fixture({team,origin:[1,row]}),4);
      close(central.centralGoalOpeningDegrees,2*Math.atan2(2,row+.5)*180/Math.PI);
      assert.ok(central.goalOpeningRatio>wide.goalOpeningRatio);assert.ok(central.postAngleFactor>wide.postAngleFactor);
      if(row>=7)assert.ok(central.postAngleFactor>.995,'central midfield accuracy receives less than half a percent extra penalty');
    }
  });

  test(`${team}: rooks gain accuracy only beyond three squares, with no close-shot or flat scoring multiplier`,()=>{
    for(const row of [2,3,5,7,10,12]){
      const r=model(fixture({team,type:'R',origin:[4,row]})),q=model(fixture({team,type:'Q',origin:[4,row]}));
      assert.equal(r.shooterType,'R');assert.equal(r.distancePenaltyRate,.03);assert.equal(q.distancePenaltyRate,.06);
      close(r.postAngleFactor,q.postAngleFactor);close(r.saveGivenOnTarget,q.saveGivenOnTarget);close(r.parryGivenSave,q.parryGivenSave);
      if(r.distance<=3){close(r.onTargetProbability,q.onTargetProbability);close(r.goalProbability,q.goalProbability);}
      else{assert.ok(r.onTargetProbability>q.onTargetProbability);assert.ok(r.goalProbability>q.goalProbability);}
      if(q.onTargetProbability>.01)close(r.onTargetProbability/q.onTargetProbability,Math.exp(.03*Math.max(0,r.distance-3)**2));
      conserved(r);conserved(q);
    }
  });

  test(`${team}: knights share the new near-post penalty and retain ordinary finishing probabilities`,()=>{
    const n=model(fixture({team,type:'N',origin:[3,1],keeper:[7,0]})),q=model(fixture({team,type:'Q',origin:[3,1],keeper:[7,0]}));
    assert.equal(n.shooterType,'N');assert.equal(n.distancePenaltyRate,.06);close(n.postAngleFactor,.625);
    for(const key of scoringFields)close(n[key],q[key],key);
    assert.ok(n.goalProbability<.56&&n.goalProbability>.55,'the old near-post knight chance is reduced without restoring its removed multiplier');
    conserved(n);
  });

  test(`${team}: long-range accuracy remains monotonic and all piece types retain finite conserved probability mass`,()=>{
    for(const type of E.TYPES){
      let previous=1;
      for(const row of [2,3,5,7,10,12]){
        const m=model(fixture({team,type,origin:[5,row]}),5);assert.ok(m.onTargetProbability<previous||m.onTargetProbability===.01);previous=m.onTargetProbability;
        for(const key of scoringFields)assert.ok(Number.isFinite(m[key]),key);
        for(const key of ['goalProbability','saveProbability','missProbability','onTargetProbability','saveGivenOnTarget','parryGivenSave','goalOpeningRatio'])assert.ok(m[key]>=0&&m[key]<=1,key);
        assert.ok(m.postAngleFactor>=.25&&m.postAngleFactor<=1);conserved(m);
      }
      const distant=model(fixture({team,type,origin:[0,14],keeper:[10,5]}),7);
      close(distant.onTargetProbability,.01);assert.equal(distant.saveProbability,0);conserved(distant);
    }
  });

  test(`${team}: pending rook identity takes precedence over the live ball carrier and survives legacy ID lookup`,()=>{
    const initial=fixture({team,type:'R'}),target=point([4,-1],team),pending=E.applyKick(initial,target.x,target.y),before=clone(pending);
    const expected=E.shotModel(pending);assert.equal(expected.shooterType,'R');assert.equal(expected.distancePenaltyRate,.03);
    const changed=clone(pending),q=changed.pieces.find(p=>p.id===id('white-Q',team));changed.ball={x:q.x,y:q.y,carrierId:q.id};
    assert.deepEqual(E.shotModel(changed),expected);
    delete changed.pendingShot.shooterType;assert.deepEqual(E.shotModel(changed),expected,'legacy snapshots identify the declared shooter by ID');
    changed.pendingShot.shooterType='N';const knight=E.shotModel(changed);assert.equal(knight.shooterType,'N');assert.equal(knight.distancePenaltyRate,.06);assert.ok(knight.onTargetProbability<expected.onTargetProbability);
    assert.deepEqual(pending,before);
  });

  test(`${team}: load, Undo and the keeper reaction use the current rook model without changing the declared origin or random seed`,()=>{
    const initial=fixture({team,type:'R'}),target=point([4,-1],team),pending=E.applyKick(initial,target.x,target.y);pending.lastAction.shotModel={modelVersion:8,probability:1};pending.lastAction.probability=1;
    const before=clone(pending),restored=E.normalizeGame(pending),expected=E.shotModel(restored);
    assert.equal(expected.modelVersion,9);assert.equal(expected.shooterType,'R');assert.equal(expected.distancePenaltyRate,.03);
    assert.deepEqual(restored.lastAction.shotModel,expected);assert.equal(restored.lastAction.probability,expected.probability);
    assert.equal(restored.randomState,before.randomState);assert.deepEqual(restored.pendingShot,before.pendingShot);assert.deepEqual(pending,before);assert.deepEqual(E.normalizeGame(clone(restored)),restored);
    const keeperId=id('black-K',team),move=E.legalMoves(restored,keeperId)[0];assert.ok(move);
    const reacted=E.applyMove(restored,keeperId,move.x,move.y,{roll:0});assert.equal(reacted.lastAction.shotModel.shooterType,'R');assert.equal(reacted.lastAction.shotModel.distancePenaltyRate,.03);
    assert.deepEqual(reacted.lastAction.shotModel.origin,before.pendingShot.from);
  });
}

test('horizontal and 180-degree mirrored shots have the same opening penalty and outcome probabilities',()=>{
  for(const type of ['Q','R','N'])for(const origin of [[3,0],[3,1],[4,2],[5,7],[4,12]]){
    const a=model(fixture({type,origin,keeper:[7,0]})),b=model(fixture({team:'black',type,origin,keeper:[7,0]}));
    for(const key of scoringFields)close(a[key],b[key],key);
    const reflected=model(fixture({type,origin:[11-origin[0],origin[1]],keeper:[4,0]}),7);
    for(const key of scoringFields)close(a[key],reflected[key],key);
  }
});

test('invalid shot inputs expose finite zero-valued geometry diagnostics and preserve probability mass',()=>{
  for(const state of [null,{}, {pieces:[],ball:{x:NaN,y:0}}, {...fixture({type:'R'}),pendingShot:{from:{x:Infinity,y:0},shooterType:'R'}}]){
    const m=E.shotModel(state,4,-1);assert.equal(m.modelVersion,9);
    for(const key of ['goalDepth','goalOpeningDegrees','centralGoalOpeningDegrees','goalOpeningRatio','postAngleFactor','distancePenaltyRate'])assert.equal(m[key],0,key);
    for(const key of scoringFields)assert.ok(Number.isFinite(m[key]),key);conserved(m);
  }
  const m=E.shotModel(fixture({type:'R'}),2,-1);assert.equal(m.goalProbability,0);assert.equal(m.distancePenaltyRate,0);assert.equal(m.shooterType,'R');conserved(m);
});
