import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../dist/engine.js';

const other=t=>t==='white'?'black':'white';
const suffix={K:'K',Q:'Q',R:'R1',B:'B1',N:'N1',P:'P1'};
const point=([x,y],t)=>t==='white'?{x,y}:{x:11-x,y:14-y};
const id=(v,t)=>t==='white'?v:v.replace(/^(white|black)/,other);
const close=(a,b,label='')=>assert.ok(Math.abs(a-b)<1e-12,`${label}: ${a} != ${b}`);
const clone=s=>JSON.parse(JSON.stringify(s));
function fixture({team='white',type='Q',origin=[5,2],keeper=[7,0]}={}){
  const s=E.createGame({mode:'local',seed:841}),carrier=`white-${suffix[type]}`;
  const ownKing=origin[0]===5&&origin[1]===13?[1,14]:[5,13];
  const assigned={'white-K':ownKing,'black-K':keeper,[carrier]:origin};
  const used=new Set(Object.values(assigned).map(p=>p.join(',')));assert.equal(used.size,Object.keys(assigned).length);
  const park=Array.from({length:15},(_,i)=>[[0,14-i],[11,14-i]]).flat();
  for(const p of s.pieces){const q=assigned[p.id]||park.find(q=>!used.has(q.join(',')));[p.x,p.y]=q;used.add(q.join(','));if(team==='black'){p.id=id(p.id,team);p.team=other(p.team);Object.assign(p,point(q,team));}}
  const c=s.pieces.find(p=>p.id===id(carrier,team));s.ball={x:c.x,y:c.y,carrierId:c.id};s.phase='kick';s.attack=team;s.restart=null;s.offside=null;
  s.ballProgress={team,anchorY:c.y,rounds:0,pendingRelease:false,excludeRelease:false};return s;
}
function model(s,file=5,keeper){const target=point([file,-1],s.attack);return E.shotModel(s,target.x,target.y,keeper);}
function v9Raw(m){return .98*Math.exp(-.018*m.distance-m.distancePenaltyRate*Math.max(0,m.distance-3)**2)*(.65+.35*Math.cos(m.shotAngleDegrees*Math.PI/180))*m.postAngleFactor;}
const clamped=p=>Math.min(.98,Math.max(.01,p));
const expectedBonus=degrees=>{const t=Math.max(0,Math.min(1,(degrees-45)/45));return 1+.25*t*t*(3-2*t);};
function conserved(m){
  close(m.goalProbability+m.saveProbability+m.missProbability,1);
  close(m.goalProbability+m.cornerProbability+m.caughtSaveProbability+m.missProbability,1);
  close(m.cornerProbability+m.caughtSaveProbability,m.saveProbability);
  close(m.onTargetProbability,m.goalProbability+m.saveProbability);
  assert.ok(m.goalProbability<=.98);assert.equal(m.scoringMultiplier,1);
}

test('visible-angle accuracy bonus is monotonic, unchanged through 45 degrees, and capped at a 25% raw increase from 90 degrees',()=>{
  assert.equal(E.SHOT_MODEL.version,10);assert.equal(E.createGame({seed:1}).rulesVersion,13);
  const models=[];
  for(let x=0;x<12;x++)for(let y=0;y<15;y++){
    const keeper=x===10&&y===5?[1,5]:[10,5];
    models.push(model(fixture({type:'N',origin:[x,y],keeper}),4));
  }
  models.sort((a,b)=>a.goalOpeningDegrees-b.goalOpeningDegrees);
  let previous=1,narrow=0,wide=0,intermediate=0;
  for(const m of models){
    close(m.wideAngleFactor,expectedBonus(m.goalOpeningDegrees));assert.ok(m.wideAngleFactor>=previous-1e-12);previous=m.wideAngleFactor;
    if(m.goalOpeningDegrees<=45){assert.equal(m.wideAngleFactor,1);narrow++;}
    else if(m.goalOpeningDegrees>=90){assert.equal(m.wideAngleFactor,1.25);wide++;}
    else{assert.ok(m.wideAngleFactor>1&&m.wideAngleFactor<1.25);intermediate++;}
    close(m.onTargetProbability,clamped(v9Raw(m)*m.wideAngleFactor));conserved(m);
  }
  assert.ok(narrow&&wide&&intermediate,'the sweep exercises both plateaus and the smooth transition');
});

for(const team of ['white','black']){
  test(`${team}: narrow-angle and midfield shots preserve the complete version-nine accuracy formula`,()=>{
    for(const type of E.TYPES)for(const origin of [[3,0],[0,4],[4,7],[5,10],[2,12]]){
      const s=fixture({team,type,origin}),m=model(s,4);assert.ok(m.goalOpeningDegrees<=45);assert.equal(m.wideAngleFactor,1);
      close(m.onTargetProbability,clamped(v9Raw(m)));assert.equal(m.distancePenaltyRate,type==='R'?.03:.06);
      conserved(m);
    }
  });

  test(`${team}: a legal central queen finish improves up to the existing 98% on-target cap`,()=>{
    const s=fixture({team}),target=point([5,-1],team),m=model(s),before=clamped(v9Raw(m));
    assert.ok(E.legalKicks(s).some(k=>k.x===target.x&&k.y===target.y&&k.goal===team));
    assert.ok(m.goalOpeningDegrees>45&&m.goalOpeningDegrees<90);assert.ok(m.wideAngleFactor>1);
    assert.ok(m.onTargetProbability>before);assert.equal(m.onTargetProbability,.98);assert.ok(m.goalProbability<1);
    close(m.goalProbability,m.onTargetProbability*(1-m.saveGivenOnTarget));conserved(m);
  });

  test(`${team}: a legal in-box knight finish reaches the same 25% raw bonus without a knight identity multiplier`,()=>{
    const s=fixture({team,type:'N',origin:[5,1]}),target=point([4,-1],team),m=model(s,4);
    assert.ok(E.legalKicks(s).some(k=>k.x===target.x&&k.y===target.y&&k.goal===team));
    assert.ok(m.goalOpeningDegrees>=90);assert.equal(m.wideAngleFactor,1.25);assert.equal(m.scoringMultiplier,1);
    close(m.onTargetProbability,clamped(v9Raw(m)*1.25));conserved(m);
    const q=clone(s);q.pieces.find(p=>p.id===q.ball.carrierId).type='Q';const ordinary=model(q,4);
    for(const key of ['wideAngleFactor','onTargetProbability','goalProbability','saveProbability','missProbability'])close(m[key],ordinary[key],key);
  });

  test(`${team}: distance, goalkeeper reach, conditional save and parry geometry are unchanged by the wide-angle bonus`,()=>{
    const s=fixture({team,origin:[4,2],keeper:[6,0]}),m=model(s,4);
    assert.ok(m.wideAngleFactor>1);close(m.distance,2.5);close(m.timeToKeeper,2/6);close(m.keeperPathDistance,2);
    const reach=.4+1.3*(2/6-.15),conditional=.94*(1-Math.exp(-(.35+2/6)/.45))*Math.exp(-((2/reach)**2));
    close(m.reach,reach);close(m.saveGivenOnTarget,conditional);
    const speed=6*Math.exp(-.08*2),stretch=Math.min(1,2/reach),parry=Math.min(.9,Math.max(.05,.05+.6*(speed/6)**2+.25*stretch));
    close(m.arrivalSpeed,speed);close(m.keeperStretch,stretch);close(m.parryGivenSave,parry);
    close(m.goalProbability,clamped(v9Raw(m)*m.wideAngleFactor)*(1-conditional));
    close(m.saveProbability,clamped(v9Raw(m)*m.wideAngleFactor)*conditional);conserved(m);
  });

  test(`${team}: previews, saved pending shots and actual keeper reactions retain the bonus without consuming outcome randomness`,()=>{
    for(const [type,origin,file]of [['Q',[5,2],5],['R',[4,2],4],['N',[5,1],4]]){
      const s=fixture({team,type,origin}),before=clone(s),target=point([file,-1],team),preview=model(s,file);
      assert.ok(preview.wideAngleFactor>1);E.legalKicks(s);assert.deepEqual(s,before);
      assert.deepEqual(E.shotModel({...s,randomState:123456789},target.x,target.y),preview);
      const pending=E.applyKick(s,target.x,target.y),saved=clone(pending);saved.lastAction.shotModel={modelVersion:9,probability:.5};saved.lastAction.probability=.5;
      const savedBefore=clone(saved),restored=E.normalizeGame(saved),current=E.shotModel(restored);
      assert.equal(current.modelVersion,10);assert.equal(current.shooterType,type);close(current.wideAngleFactor,preview.wideAngleFactor);
      assert.deepEqual(restored.lastAction.shotModel,current);assert.equal(restored.randomState,pending.randomState);
      assert.deepEqual(restored.pendingShot,pending.pendingShot);assert.deepEqual(saved,savedBefore);assert.deepEqual(E.normalizeGame(clone(restored)),restored);
      const keeperId=id('black-K',team),moves=E.legalMoves(restored,keeperId);assert.ok(moves.length);
      moves.sort((a,b)=>E.shotModel(restored,target.x,target.y,a).probability-E.shotModel(restored,target.x,target.y,b).probability);
      const move=moves[0],expected=E.shotModel(restored,target.x,target.y,move),resolved=E.applyMove(restored,keeperId,move.x,move.y,{roll:0});
      assert.equal(resolved.lastAction.type,'goal');assert.deepEqual(resolved.lastAction.shotModel,expected);
      assert.deepEqual(resolved.lastAction.shotModel.origin,pending.pendingShot.from);assert.notEqual(resolved.randomState,pending.randomState);
      assert.deepEqual(s,before);conserved(resolved.lastAction.shotModel);
    }
  });
}

test('all pieces have mirrored angle bonuses and conserve probability at both goals',()=>{
  for(const type of E.TYPES)for(const origin of [[3,0],[3,1],[4,2],[5,2],[5,7],[4,12]]){
    const a=model(fixture({type,origin}),4),b=model(fixture({team:'black',type,origin}),4);
    for(const key of ['wideAngleFactor','postAngleFactor','goalOpeningDegrees','distancePenaltyRate','distance','reach','saveGivenOnTarget','parryGivenSave','onTargetProbability','goalProbability','saveProbability','cornerProbability','caughtSaveProbability','missProbability'])close(a[key],b[key],key);
    assert.equal(a.shooterType,type);assert.equal(b.shooterType,type);conserved(a);conserved(b);
  }
});

test('invalid wide-angle previews remain finite and cannot gain scoring probability',()=>{
  for(const state of [null,{}, {pieces:[],ball:{x:NaN,y:0}}]){
    const m=E.shotModel(state,4,-1);assert.equal(m.goalProbability,0);assert.ok(Number.isFinite(m.wideAngleFactor));conserved(m);
  }
});
