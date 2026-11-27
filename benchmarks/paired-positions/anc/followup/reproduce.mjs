import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {MODEL,buildRequest} from './model.mjs';
import {score} from './score.mjs';

const read = name => readFileSync(new URL(name,import.meta.url));
const json = name => JSON.parse(read(name));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const lock = json('freeze.json');
assert.equal(sha(read('freeze.json')),'e594ff0c97abadee9c897f6538d1ec6c2b626c046c464cf8bf9100c60536451c');
assert.equal(lock.model,MODEL);
assert.equal(sha(read('../native/engine.mjs')),lock.nativeEngineSha256);
for (const [name,digest] of Object.entries(lock.files)) {
  if (['bank.mjs','grade.mjs','protocol.md'].includes(name)) continue;
  assert.equal(sha(read(name)),digest,name);
}
// Only the three URLs for sibling inputs were shortened in the public generator.
const publicGenerator=read('bank.mjs').toString('utf8');
const originalGenerator=publicGenerator.replaceAll("'../native/","'../llm-keeper-information-2026-11-25/arxiv/anc/native/")
  .replaceAll("'../pass/","'../llm-keeper-information-2026-11-25/arxiv/anc/pass/");
assert.equal(sha(originalGenerator),lock.files['bank.mjs']);
const bank = json('bank.json');
const generated = JSON.parse(execFileSync(process.execPath,[fileURLToPath(new URL('bank.mjs',import.meta.url))],{encoding:'utf8'}));
assert.equal(generated.bankSha256,lock.files['bank.json']);
const manifest = json('participant/items.json');
const html = read('participant/quiz.html').toString('utf8');
const embedded = html.match(/<script type="application\/json" id="item-manifest">([^<]*)<\/script>/);
assert.ok(embedded);
assert.deepEqual(JSON.parse(embedded[1]),manifest);
const ids = manifest.items.map(item=>item.itemId);
const boards = new Map(bank.positions.map(b=>[b.itemId,b]));
assert.equal(ids.length,16);
assert.equal(boards.size,16);
assert.equal(bank.pairs.length,8);
assert.equal(new Set(ids).size,16);
assert.deepEqual([...ids].sort(),bank.pairs.flatMap(p=>p.items).sort());
assert.deepEqual([...ids].sort(),Object.keys(lock.requests).sort());
assert.equal(manifest.quizId,lock.quizId);
for (const item of manifest.items) {
  assert.deepEqual(item.options,boards.get(item.itemId).options);
  assert.equal(sha(JSON.stringify(buildRequest(item))),lock.requests[item.itemId],item.itemId);
}
const evidence = json('comparison.json');
assert.equal(sha(read('comparison.json')),'5d44b4fbe0b63219151677b16495f81a219d5d8135f1a715762ddc287e675f47');
assert.equal(evidence.runReceiptSha256,'3d9c2f1587a0b4cb0204eb11cc58133f586453fcda02c91db1a6c03b7ddd1d43');
assert.deepEqual(evidence.scores.returnedModelVersions,[MODEL]);
assert.match(evidence.authorResponse,/^PFC-PASS-X1\|[123]{16}$/);
assert.equal(evidence.decisions.length,16);
const submission=Array.from(evidence.authorResponse.split('|')[1],Number);
const humanChoices=new Map(), modelChoices=new Map();
const pairByItem = new Map(bank.pairs.flatMap(p=>p.items.map(id=>[id,p])));
const knights={author:0,gemini:0,optimal:0};
for (const [i,id] of ids.entries()) {
  const b=boards.get(id), row=evidence.decisions[i];
  assert.equal(row.question,i+1);
  assert.equal(row.itemId,id);
  assert.equal(row.pairId,pairByItem.get(id).pairId);
  assert.equal(row.optimal,b.answer);
  assert.equal(row.author,submission[i]);
  humanChoices.set(id,row.author);
  modelChoices.set(id,row.gemini);
  for (const name of Object.keys(knights)) {
    const receiver=b.pieces.find(p=>p.id===b.options[row[name]-1]);
    assert.ok(receiver);
    if (receiver.type==='N') knights[name]++;
  }
}
const human=score(humanChoices,boards,bank.pairs), gemini=score(modelChoices,boards,bank.pairs);
const matched={both:0,humanOnly:0,geminiOnly:0,neither:0};
const pairTable=bank.pairs.map(p=>{
  const h=human.byPair.get(p.pairId),g=gemini.byPair.get(p.pairId);
  const group=h ? (g?'both':'humanOnly') : (g?'geminiOnly':'neither');
  matched[group]++;
  return {pair:p.pairId,group:p.stratum,condition:p.condition,authorSolved:h,geminiSolved:g};
});
const primary={...matched,humanMinusGeminiPairs:matched.humanOnly-matched.geminiOnly};
assert.deepEqual(primary,evidence.scores.primary);
assert.deepEqual(human.result,evidence.scores.human);
assert.deepEqual(gemini.result,evidence.scores.gemini);
assert.deepEqual(knights,evidence.descriptiveKnightChoiceCounts);
const tackles = bank.positions.flatMap(b=>b.oracle).flatMap(row=>row.tacklers);

// Post hoc comparison conditional on the available receivers and their engine payoffs.
function compareReceiverChoices(positions,choiceFor) {
  const qualified={boards:0,safeOrdinaryChosen:0,exposedKnightChosen:0,otherReceiverChosen:0,invalid:0};
  const excluded={knightOptimal:{boards:0,correct:0},noKnight:{boards:0,correct:0},other:{boards:0,correct:0}};
  for (const b of positions) {
    const options=b.options.map((id,i)=>{
      assert.equal(b.oracle[i].receiverId,id);
      return {type:b.pieces.find(p=>p.id===id).type,value:b.oracle[i].retention};
    });
    const knights=options.filter(o=>o.type==='N');
    const safeOrdinary=options.filter(o=>o.type!=='N' && o.value===1);
    const choice=choiceFor(b);
    assert.ok(choice===null || [1,2,3].includes(choice));
    if (knights.length===1 && knights[0].value===0.5 && safeOrdinary.length===1 && options[b.answer-1]===safeOrdinary[0]) {
      assert.deepEqual(options.map(o=>o.value).sort((a,b)=>a-b),[0,0.5,1]);
      qualified.boards++;
      if (choice===null) qualified.invalid++;
      else if (options[choice-1]===safeOrdinary[0]) qualified.safeOrdinaryChosen++;
      else if (options[choice-1]===knights[0]) qualified.exposedKnightChosen++;
      else qualified.otherReceiverChosen++;
    } else {
      const group=knights.length===0 ? excluded.noKnight : options[b.answer-1].type==='N' ? excluded.knightOptimal : excluded.other;
      group.boards++;
      if (choice===b.answer) group.correct++;
    }
  }
  return {qualified,excluded};
}
const samePayoffComparison={
  originalPasses:compareReceiverChoices(json('../pass/data.json').positions,b=>b.geminiChoice),
  followupPasses:compareReceiverChoices(bank.positions,b=>modelChoices.get(b.itemId))
};
console.log(JSON.stringify({
  quiz:manifest.quizId, boards:boards.size, pairs:bank.pairs.length, proposals:generated.proposals,
  verifiedRequestHashes:ids.length, nativePassValues:bank.positions.reduce((sum,b)=>sum+b.oracle.length,0),
  nativeTackleLandings:tackles.reduce((sum,t)=>sum+t.landings,0),
  primary,author:human.result,gemini:gemini.result,pairTable,postHocKnightChoices:knights,
  postHocGeminiReceiverChoices:samePayoffComparison
},null,2));
