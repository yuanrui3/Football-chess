import assert from 'node:assert/strict';

const valid = x => Number.isInteger(x) && x >= 1 && x <= 3;
const group = () => ({pairs:0, bothValid:0, changedReceiver:0, bothCorrect:0});

// A receiver ID is the semantic action shared by the two boards of a pair.
export function score(positions, pairs, choices) {
  assert.equal(positions.length, 80);
  assert.equal(pairs.length, 40);
  assert.equal(choices.size, 80);
  const byId = new Map(positions.map(row => [row.itemId, row]));
  assert.equal(byId.size, 80);
  const covered = new Set();
  const counts = {validBoards:0, correctBoards:0, decisions:80,
    meanRetentionLossValid:null, switch:group(), stay:group()};
  let loss = 0;
  for (const p of pairs) {
    assert.ok(['switch','stay'].includes(p.condition));
    const category = counts[p.condition];
    category.pairs++;
    assert.equal(p.items.length, 2);
    const decisions = p.items.map(id => {
      assert.ok(!covered.has(id) && byId.has(id) && choices.has(id));
      covered.add(id);
      const b = byId.get(id), choice = choices.get(id);
      assert.ok(choice === null || valid(choice));
      assert.equal(new Set(b.options).size, 3);
      assert.deepEqual(b.options, b.oracle.map(v => v.receiverId));
      const retention = b.oracle.map(v => v.retention), maximum = Math.max(...retention);
      const best = retention.indexOf(maximum);
      assert.equal(retention.filter(v => v === maximum).length, 1);
      assert.equal(b.answer, best + 1);
      const correct = choice === b.answer;
      if (choice !== null) {
        counts.validBoards++;
        loss += maximum - retention[choice - 1];
      }
      if (correct) counts.correctBoards++;
      return {action:choice === null ? null : b.options[choice - 1], best:b.options[best], correct};
    });
    const [a,b] = decisions;
    assert.equal(a.best !== b.best, p.condition === 'switch');
    if (a.action !== null && b.action !== null) {
      category.bothValid++;
      if (a.action !== b.action) category.changedReceiver++;
    }
    if (a.correct && b.correct) category.bothCorrect++;
  }
  assert.equal(covered.size, 80);
  assert.equal(counts.switch.pairs, 20);
  assert.equal(counts.stay.pairs, 20);
  if (counts.validBoards) counts.meanRetentionLossValid = loss / counts.validBoards;
  return counts;
}
