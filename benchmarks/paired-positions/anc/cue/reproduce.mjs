import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {generateDesign} from './design.mjs';
import {score} from './score.mjs';

const bytes = name => readFileSync(new URL(name, import.meta.url));
const json = name => JSON.parse(bytes(name));
const digest = value => createHash('sha256').update(value).digest('hex');
const manifest = json('manifest.json');
const freeze = json('freeze.json');
const choices = json('choices.json');
const collection = json('collection.json');
const originalBase = '../llm-keeper-information-2026-11-25/arxiv/anc/';

// The only generator edits for distribution shortened its two import/data paths.
const originalDesign = bytes('design.mjs').toString('utf8')
  .replace("from '../native/engine.mjs'", "from '" + originalBase + "native/engine.mjs'")
  .replace("const ancestor = '../';", "const ancestor = '" + originalBase + "';");
assert.equal(digest(originalDesign), freeze.sourceHashes['design.mjs']);
for (const file of ['score.mjs', 'protocol.md']) {
  assert.equal(digest(bytes(file)), freeze.sourceHashes[file]);
}
for (const file of ['native/engine.mjs', 'pass/data.json', 'followup/bank.json']) {
  assert.equal(digest(bytes('../' + file)), freeze.sourceHashes[originalBase + file]);
}
assert.equal(digest(bytes('../followup/model.mjs')), freeze.sourceHashes['../llm-pass-transfer-mini/model.mjs']);
assert.equal(digest(bytes('manifest.json')), freeze.manifestSha256);
assert.deepEqual(generateDesign(), manifest);
assert.equal(manifest.layouts.length, 6);
assert.equal(manifest.items.length, 48);

// In each role assignment, the only state change is the defender's hidden pawn.
// Within each state, swapping protection swaps the two receiver squares.
for (const layout of manifest.layouts) {
  const hidden = (layout.attack === 'white' ? 'black' : 'white') + '-P2';
  for (const [closed, open] of Object.values(layout.variants)) {
    assert.deepEqual(closed.filter(p => p.id !== hidden), open.filter(p => p.id !== hidden));
    assert.notEqual(closed.find(p => p.id === hidden).square, open.find(p => p.id === hidden).square);
  }
  for (const world of [0, 1]) {
    const withKnight = layout.variants.N[world], withRook = layout.variants.R[world];
    for (const p of withKnight) {
      const receiver = p.team === layout.attack && ['N', 'R'].includes(p.type);
      const otherId = receiver ? layout.attack + (p.type === 'N' ? '-R1' : '-N1') : p.id;
      assert.equal(p.square, withRook.find(q => q.id === otherId).square);
    }
  }
  for (const protectedPiece of ['N', 'R']) {
    for (const signal of ['safe', 'unsafe']) {
      const pair = manifest.items.filter(i => i.layoutId === layout.layoutId &&
        i.protectedPiece === protectedPiece && i.signal === signal).sort((a, b) => a.reliability - b.reliability);
      assert.deepEqual(pair.map(i => i.reliability), [0.6, 0.9]);
      assert.ok(pair[0].prompt.includes('correct 60%'));
      assert.equal(pair[0].prompt.replace('correct 60%', 'correct 90%'), pair[1].prompt);
    }
  }
}
assert.equal(new Set(manifest.layouts.map(layout => layout.options.join(''))).size, 6);

// JSON property order and the absence of a trailing newline are part of the wire digest.
const schedule = manifest.items.map(({itemId, prompt}) => {
  assert.equal(digest(prompt).slice(0, 16), itemId);
  const body = JSON.stringify({
    contents: [{role: 'user', parts: [{text: prompt}]}],
    generationConfig: {
      temperature: 0, maxOutputTokens: 4096, thinkingConfig: {thinkingLevel: 'high'},
      responseMimeType: 'application/json', responseJsonSchema: {type: 'integer', enum: [1, 2, 3]}
    }
  });
  return {itemId, requestSha256: digest(body), order: digest('PFC-CUE-R1:20261127:' + itemId)};
}).sort((a, b) => a.order.localeCompare(b.order)).map(({itemId, requestSha256}) => ({itemId, requestSha256}));
assert.deepEqual(schedule, freeze.schedule);
assert.equal(collection.freezeSha256, digest(bytes('freeze.json')));
assert.equal(collection.choicesSha256, digest(bytes('choices.json')));
assert.equal(collection.study, freeze.study);
assert.equal(collection.requestedModel, freeze.model);
assert.ok(Date.parse(freeze.frozenUTC) <= Date.parse(collection.firstCompletionUTC));
assert.ok(Date.parse(collection.firstCompletionUTC) <= Date.parse(collection.lastCompletionUTC));
assert.deepEqual(choices.map(row => row.itemId), schedule.map(row => row.itemId));
for (const row of choices) assert.deepEqual(Object.keys(row).sort(), ['choice', 'itemId']);
const results = score(manifest, choices);
assert.deepEqual(results, json('results.json'));
assert.equal(collection.completed, results.overall.assigned);
assert.equal(collection.valid, results.overall.valid);
console.log(JSON.stringify({
  verifiedRequestHashes: schedule.length,
  layouts: manifest.layouts.length,
  overall: results.overall,
  favorableReversals: results.primaryFavorableCue,
  exposedControls: results.unfavorableCueControls,
  roleSwapChecks: results.roleSwapChecks
}, null, 2));
