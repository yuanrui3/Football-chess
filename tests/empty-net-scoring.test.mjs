import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {E,fixture,point,pieceId,other} from './helpers/shot-fixture.mjs';

const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-12,`${a} != ${b}`);
const mass=m=>m.goalProbability+m.caughtSaveProbability+m.keeperReboundProbability+m.cornerProbability+m.missProbability+m.blockPossessionProbability;
const clear=(team,options={})=>fixture({team,type:'R',origin:[5,5],keeper:[3,5],...options});
const engineSource=await readFile(new URL('../dist/engine.js',import.meta.url),'utf8');
const {tacticalShots}=await import(`data:text/javascript;base64,${Buffer.from(engineSource+'\nexport {tacticalShots};').toString('base64')}`);
for(const team of ['white','black']){
  test(`${team}: unguarded legal shots match ordinary pass accuracy across distance and piece types`,()=>{
    for(const [type,origin,file] of [['R',[5,9],5],['R',[5,10],5],['R',[5,11],5],['R',[5,16],5],['Q',[6,9],6],['Q',[1,5],7],['B',[13,7],5],['N',[6,1],5],['K',[5,4],5]]){
      const s=clear(team,{type,origin}),target=point([file,-1],team),before=structuredClone(s);
      const kick=E.legalKicks(s).find(k=>k.goal===team&&k.x===target.x&&k.y===target.y);assert.ok(kick,`${type} ${origin}`);
      const expected=E.passAccuracy(Math.max(Math.abs(target.x-s.ball.x),Math.abs(target.y-s.ball.y))),m=kick.shotModel;
      assert.equal(m.emptyNet,true);assert.deepEqual(m.blockerIds,[]);
      close(kick.probability,expected);close(m.emptyNetPassDistance,kick.distance);close(m.baseOnTargetProbability,expected);
      assert.equal(m.scoringMultiplier,1);close(m.missProbability,1-expected);close(m.saveProbability,0);close(mass(m),1);
      const pending=E.applyKick(s,target.x,target.y);
      assert.deepEqual(E.shotModel(pending),m);assert.deepEqual(E.legalMoves(pending,`${other(team)}-K`),[]);
      const scored=E.skipMove(pending,{roll:expected-1e-8});assert.equal(scored.lastAction.type,'goal');close(scored.lastAction.probability,expected);
      if(expected<1)assert.equal(E.skipMove(pending,{roll:expected}).lastAction.type,'shotMiss');
      else assert.equal(E.skipMove(pending,{roll:.999999}).lastAction.type,'goal');
      assert.deepEqual(s,before);
    }
  });

  test(`${team}: outside keepers and outfield defenders retain ordinary blocking on unguarded shots`,()=>{
    const s=clear(team,{origin:[5,10],keeper:[5,3]}),target=point([5,-1],team);
    Object.assign(s.pieces.find(p=>p.id===pieceId('black-N1',team)),point([5,1],team));
    const m=E.shotModel(s,target.x,target.y);close(m.probability,.9*.55**2);close(m.blockProbability,1-.55**2);close(mass(m),1);
    assert.deepEqual(m.blockerIds,[`${other(team)}-K`,pieceId('black-N1',team)]);
    const pending=E.applyKick(s,target.x,target.y),blocked=E.skipMove(pending,{roll:.999999});
    assert.equal(blocked.lastAction.type,'blockedShot');assert.equal(blocked.ball.carrierId,`${other(team)}-K`);
  });

  test(`${team}: a keeper leaving the box during reaction updates both preview and actual resolution`,()=>{
    const s=clear(team,{origin:[5,10],keeper:[4,2]}),target=point([5,-1],team),outside=point([3,2],team);
    const pending=E.applyKick(s,target.x,target.y),keeperId=`${other(team)}-K`,preview=E.shotModel(pending,target.x,target.y,outside);
    assert.equal(E.shotModel(pending).emptyNet,false);assert.equal(preview.emptyNet,true);close(preview.probability,.9);
    const result=E.applyMove(pending,keeperId,outside.x,outside.y,{roll:.89});
    assert.equal(result.lastAction.type,'goal');assert.deepEqual(result.lastAction.shotModel,preview);
  });

  test(`${team}: no-keeper and set-piece attempts obey the same unguarded-goal rule`,()=>{
    const s=clear(team,{origin:[5,10]}),target=point([5,-1],team);
    const missing=structuredClone(s);missing.pieces=missing.pieces.filter(p=>p.id!==`${other(team)}-K`);
    close(E.shotChance(missing,target.x,target.y),.9);
    for(const type of ['freeKick','penalty']){
      const restart={type,team,takerId:s.ball.carrierId,spot:{x:s.ball.x,y:s.ball.y},indirect:false};
      const m=E.shotModel({...s,restart},target.x,target.y);close(m.probability,.9);assert.equal(m.scoringMultiplier,1);close(mass(m),1);
      if(type==='penalty')close(tacticalShots({...s,restart},team),.9);
    }
  });

  test(`${team}: disguised shots use each endpoint's pass accuracy without a second finishing penalty`,()=>{
    const s=clear(team,{type:'Q',origin:[6,1]}),options=E.disguisedShotTargets(s);assert.equal(options.length,2);
    const pending=E.applyKick(s,options[0].x,options[0].y,{disguise:true}),m=E.shotModel(pending);
    assert.equal(m.emptyNet,true);close(m.probability,1);close(mass(m),1);
    for(const targetRoll of [0,.75])assert.equal(E.skipMove(pending,{targetRoll,roll:.999999}).lastAction.type,'goal');
    const old=structuredClone(pending);old.lastAction.probability=.01;old.lastAction.shotModel={modelVersion:18};
    const restored=E.normalizeGame(old);close(restored.lastAction.probability,1);assert.equal(restored.randomState,pending.randomState);
  });
}

test('shot explanation identifies pass accuracy without claiming unused shot bonuses',async()=>{
  const source=await readFile(new URL('../dist/app.js',import.meta.url),'utf8'),start=source.indexOf('function shotGeometry('),end=source.indexOf('\nfunction ',start+1);
  const context=vm.createContext({shotPercent:p=>`${(p*100).toFixed(1)}%`,percent:p=>`${Math.round(p*100)}%`,goalChoiceNames:()=> 'F or H'});
  vm.runInContext(source.slice(start,end)+'\nglobalThis.explain=shotGeometry;',context);
  const model=E.shotModel(clear('white',{origin:[5,10]}),5,-1),text=context.explain(model);
  assert.match(text,/11.0 squares.*pass accuracy: 90.0%/i);assert.match(text,/Clear path/);
  assert.doesNotMatch(text,/angle penalty|accuracy bonus|Rook long-range|scoring ×2/);
});
