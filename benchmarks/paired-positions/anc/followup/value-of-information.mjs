import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read = path => JSON.parse(readFileSync(new URL(path,import.meta.url),'utf8'));
const mean = values => values.reduce((total,value)=>total+value,0)/values.length;
const tolerance = 1e-12;

function shots() {
  const positions = read('../positions.json');
  return [...Map.groupBy(positions,b=>b.pair)].map(([id,boards])=>{
    assert.equal(boards[0].kind,boards[1].kind);
    return {id,kind:boards[0].kind,boards:boards.map(b=>({
      id:b.id,values:b.actionGoalProbabilities,best:b.best,
      attack:b.board.attacker,carrier:b.board.carrierId,pieces:b.board.pieces,
      actions:b.options.map(label=>label.startsWith('Disguise ') ?
        'Disguise '+label.slice('Disguise '.length).split('/').sort().join('/') : label)
    }))};
  });
}
function passes(file) {
  const bank=read(file), byId=new Map(bank.positions.map(b=>[b.itemId,b]));
  return bank.pairs.map(p=>({id:p.pairId,kind:p.condition,edit:p.edit,boards:p.items.map(id=>{
    const b=byId.get(id);
    assert.deepEqual(b.oracle.map(r=>r.receiverId),b.options);
    return {id,actions:b.options,values:b.oracle.map(r=>r.retention),best:b.answer,
      attack:b.attack,carrier:b.carrier,pieces:b.pieces};
  })}));
}

function evaluate(pair) {
  assert.equal(pair.boards.length,2);
  const actions=pair.boards[0].actions;
  assert.equal(new Set(actions).size,3);
  const members=pair.boards.map(b=>{
    assert.deepEqual([...b.actions].sort(),[...actions].sort());
    assert.equal(b.values.length,actions.length);
    assert.ok(b.values.every(v=>Number.isFinite(v) && v>=0 && v<=1));
    const maximum=Math.max(...b.values);
    assert.equal(b.values.filter(v=>v===maximum).length,1);
    assert.equal(b.values[b.best-1],maximum);
    return {id:b.id,values:actions.map(a=>b.values[b.actions.indexOf(a)]),optimalAction:b.actions[b.best-1]};
  });
  const [a,b]=members;
  assert.equal(pair.kind,a.optimalAction===b.optimalAction ? 'stay' : 'switch');
  const fixedActionValues=actions.map((_,i)=>(a.values[i]+b.values[i])/2);
  const knownMember=(Math.max(...a.values)+Math.max(...b.values))/2;
  const hiddenMember=Math.max(...fixedActionValues);
  const gain=knownMember-hiddenMember;
  assert.ok(gain>=-tolerance);
  if (pair.kind==='stay') assert.ok(Math.abs(gain)<tolerance);
  else assert.ok(gain>0);
  return {id:pair.id,kind:pair.kind,edit:pair.edit,actions,members,fixedActionValues,
    optimalFixedActions:actions.filter((_,i)=>Math.abs(fixedActionValues[i]-hiddenMember)<tolerance),
    knownMember,hiddenMember,gain};
}
function maskedObservation(pair) {
  const [a,b]=pair.boards;
  const byId=new Map(b.pieces.map(p=>[p.id,p]));
  const changed=a.pieces.filter(p=>p.square!==byId.get(p.id)?.square);
  assert.equal(changed.length,1);
  const mover=changed[0];
  assert.notEqual(mover.team,a.attack);
  assert.deepEqual([mover.type,mover.team],[byId.get(mover.id).type,byId.get(mover.id).team]);
  const hide=board=>JSON.stringify([board.attack,board.carrier,board.actions,
    board.pieces.filter(p=>p.id!==mover.id).map(p=>[p.id,p.type,p.team,p.square]).sort((x,y)=>x[0].localeCompare(y[0],'en'))]);
  const observation=hide(a);
  assert.equal(observation,hide(b));
  return observation;
}
function verifyAndEvaluate(pairs) {
  assert.equal(new Set(pairs.map(maskedObservation)).size,pairs.length);
  return pairs.map(evaluate);
}
function summarize(rows) {
  const out={};
  for (const group of ['switch','stay','all']) {
    const selected=group==='all' ? rows : rows.filter(p=>p.kind===group);
    out[group]={pairs:selected.length,meanKnownMember:mean(selected.map(p=>p.knownMember)),
      meanHiddenMember:mean(selected.map(p=>p.hiddenMember)),
      meanGainPercentagePoints:100*mean(selected.map(p=>p.gain))};
  }
  return out;
}
const originalShots=verifyAndEvaluate(shots());
const originalPasses=verifyAndEvaluate(passes('../pass/data.json'));
const followupPasses=verifyAndEvaluate(passes('bank.json'));
assert.deepEqual([originalShots.length,originalPasses.length,followupPasses.length],[60,40,8]);
const example=followupPasses.find(p=>p.id==='m02');
assert.ok(example);
console.log(JSON.stringify({originalShots:summarize(originalShots),originalPasses:summarize(originalPasses),
  followupPasses:summarize(followupPasses),workedFollowupPair:example},null,2));
