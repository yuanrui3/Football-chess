import assert from 'node:assert/strict';

const groups = ['switch', 'stay', 'all'];

// A digit identifies a menu slot only on its own board. Decode each menu separately.
function semanticMenu(options) {
  assert.equal(options.length, 3);
  const menu = options.map(label => {
    const declared = /^Declare file ([a-n])$/.exec(label);
    if (declared) return 'declare ' + declared[1];
    const mixed = /^Disguise ([a-n])\/([a-n])$/.exec(label);
    assert.ok(mixed && mixed[1] !== mixed[2], 'Unexpected shot label ' + label);
    return 'disguise ' + mixed.slice(1).sort().join('/');
  });
  const files = menu.filter(label => label.startsWith('declare ')).map(label => label.at(-1)).sort();
  assert.equal(new Set(files).size, 2);
  assert.ok(menu.includes('disguise ' + files.join('/')));
  return menu;
}

export function summarizeChoices(keys, predictions) {
  assert.equal(new Set(keys.map(k => k.id)).size, keys.length);
  assert.equal(predictions.size, keys.length);
  const counts = Object.fromEntries(groups.map(group => [group,
    {totalPairs: 0, bothValid: 0, changed: 0, unchanged: 0, bothCorrect: 0}]));
  for (const pair of Map.groupBy(keys, key => key.pair).values()) {
    assert.deepEqual(pair.map(k => k.member).sort(), ['a','b']);
    const menus = pair.map(k => semanticMenu(k.options));
    assert.deepEqual(menus[0].toSorted(), menus[1].toSorted());
    const optimum = pair.map((k, i) => {
      assert.ok(Number.isInteger(k.answer) && k.answer >= 0 && k.answer < 3);
      return menus[i][k.answer];
    });
    const kind = optimum[0] === optimum[1] ? 'stay' : 'switch';
    assert.ok(pair.every(k => k.kind === kind));
    const choices = pair.map((k, i) => {
      const index = predictions.get(k.id);
      if (index === null) return null;
      assert.ok(Number.isInteger(index) && index >= 0 && index < 3, 'Missing or invalid index for ' + k.id);
      return menus[i][index];
    });
    for (const group of [kind, 'all']) {
      const c = counts[group];
      c.totalPairs++;
      if (choices.includes(null)) continue;
      c.bothValid++;
      if (choices[0] === choices[1]) c.unchanged++;
      else c.changed++;
      if (choices.every((choice, i) => choice === optimum[i])) c.bothCorrect++;
    }
  }
  return counts;
}
