import assert from 'node:assert/strict';

const indexInMenu = i => Number.isInteger(i) && i >= 0 && i < 3;

function indexKeys(keys) {
  assert.ok(Array.isArray(keys) && keys.length, 'Expected paired answer keys');
  const byId = new Map(), pairs = new Map();
  for (const k of keys) {
    assert.ok(typeof k.id === 'string' && k.id.length && !byId.has(k.id), 'Missing or duplicate board ID');
    assert.ok(typeof k.pair === 'string' && k.pair.length && ['a', 'b'].includes(k.member), k.id + ' pair member');
    assert.ok(['switch', 'stay'].includes(k.kind), k.id + ' pair type');
    assert.ok(Array.isArray(k.options) && k.options.length === 3 && new Set(k.options).size === 3, k.id + ' menu');
    const declarations = k.options.filter(label => /^Declare file [f-i]$/.test(label));
    const disguise = k.options.find(label => /^Disguise [f-i]\/[f-i]$/.test(label));
    assert.ok(declarations.length === 2 && disguise, k.id + ' shot labels');
    assert.deepEqual(disguise.slice('Disguise '.length).split('/').sort(),
      declarations.map(label => label.at(-1)).sort(), k.id + ' disguise targets');
    assert.ok(indexInMenu(k.answer) && indexInMenu(k.heuristic), k.id + ' key indices');
    assert.ok(Array.isArray(k.values) && k.values.length === 3 && k.values.every(
      (p, i) => Number.isFinite(p) && p >= 0 && p <= 1 && (i === k.answer || p < k.values[k.answer])
    ), k.id + ' expected finite probabilities and a unique best shot');
    byId.set(k.id, k);
    if (!pairs.has(k.pair)) pairs.set(k.pair, []);
    pairs.get(k.pair).push(k);
  }
  for (const [name, members] of pairs) {
    assert.equal(members.length, 2, name + ' needs two boards');
    const [a, b] = members;
    assert.ok(a.member !== b.member && a.kind === b.kind, name + ' inconsistent pair membership');
    assert.deepEqual([...a.options].sort(), [...b.options].sort(), name + ' target labels');
    assert.equal(a.options[a.answer] !== b.options[b.answer], a.kind === 'switch', name + ' switch/stay');
  }
  return {byId, pairs: [...pairs.values()]};
}

function gradeArm(rows, byId) {
  assert.ok(Array.isArray(rows));
  const results = new Map();
  for (const {id, answer} of rows) {
    assert.ok(byId.has(id) && !results.has(id), 'Unknown or duplicate response for ' + id);
    assert.ok(answer === null || indexInMenu(answer), id + ' expected decoded answer index or null');
    const k = byId.get(id);
    const chosen = answer === null ? null : k.options[answer];
    results.set(id, {answer, chosen, correct: answer === k.answer,
      regretPP: answer === null ? null : 100 * (k.values[k.answer] - k.values[answer])});
  }
  assert.equal(results.size, byId.size, 'Incomplete response coverage');
  return results;
}

function solved(pair, arm) {
  return pair.every(k => arm.get(k.id).correct);
}

function summarize(arm, pairs) {
  const results = [...arm.values()];
  const valid = results.filter(r => r.answer !== null);
  const breakdown = kind => {
    const group = pairs.filter(([a]) => a.kind === kind);
    return {pairs: group.length, solved: group.filter(p => solved(p, arm)).length};
  };
  const switched = breakdown('switch'), stayed = breakdown('stay');
  return {
    boards: results.length, correct: results.filter(r => r.correct).length, valid: valid.length,
    invalid: results.length - valid.length, pairs: pairs.length, solvedPairs: switched.solved + stayed.solved,
    switch: switched, stay: stayed, choseDisguise: valid.filter(r => r.chosen.startsWith('Disguise ')).length,
    meanRegretPP: valid.length ? valid.reduce((sum, r) => sum + r.regretPP, 0) / valid.length : null,
  };
}

function matched(outcomes) {
  const counts = {total: outcomes.length, leftOnly: 0, rightOnly: 0, both: 0, neither: 0};
  for (const [left, right] of outcomes) {
    if (left && right) counts.both++;
    else if (left) counts.leftOnly++;
    else if (right) counts.rightOnly++;
    else counts.neither++;
  }
  return counts;
}

// Under equal arm probabilities the signs of discordant independent pairs
// are Bernoulli(1/2). Sum the two symmetric tails, counting the center once.
function exactTwoSidedP({leftOnly, rightOnly}) {
  const n = leftOnly + rightOnly;
  let mass = 2 ** -n, lowerTail = mass;
  for (let i = 1; i <= Math.min(leftOnly, rightOnly); i++) {
    mass *= (n - i + 1) / i;
    lowerTail += mass;
  }
  return Math.min(1, 2 * lowerTail);
}

export function compareShots(keys, leftRows, rightRows) {
  const {byId, pairs} = indexKeys(keys);
  const left = gradeArm(leftRows, byId), right = gradeArm(rightRows, byId);
  const items = matched(keys.map(k => [left.get(k.id).correct, right.get(k.id).correct]));
  const paired = matched(pairs.map(p => [solved(p, left), solved(p, right)]));
  const baseline = policy => summarize(gradeArm(keys.map(k => ({id: k.id, answer: policy(k)})), byId), pairs);
  return {
    left: summarize(left, pairs), right: summarize(right, pairs),
    matched: {items, pairs: {...paired, exactTwoSidedP: exactTwoSidedP(paired)}},
    baselines: {farTarget: baseline(k => k.heuristic),
      alwaysDisguise: baseline(k => k.options.findIndex(label => label.startsWith('Disguise ')))},
    boardDiagnostics: keys.map(k => ({id: k.id, pair: k.pair, member: k.member, kind: k.kind,
      bestIndex: k.answer, bestShot: k.options[k.answer], left: left.get(k.id), right: right.get(k.id)})),
  };
}
