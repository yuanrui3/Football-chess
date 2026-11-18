import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';

const bootstrapSamples = 20_000;
const bootstrapSeed = 0xb3854b19;
const formations = ['aggressive', 'neutral', 'defensive'];
const expectedLegs = ['black/black', 'black/white', 'white/black', 'white/white'];
const input = new URL('./transfer-pairs.jsonl', import.meta.url);

if (process.argv.length > 2) throw new Error('Usage: node verify-transfer.mjs');

function close(actual, expected, label, tolerance = 1e-9) {
  assert.ok(Number.isFinite(actual) && Math.abs(actual - expected) <= tolerance,
    `${label}: expected ${expected}, received ${actual}`);
}

function validateMetrics(values, label) {
  assert.ok(Array.isArray(values) && values.length === 8, `${label} needs eight metrics`);
  assert.ok(values.every(value => Number.isFinite(value) && value >= 0), `${label} has invalid metrics`);
  for (const index of [2, 3, 5, 7]) {
    assert.ok(Number.isSafeInteger(values[index]), `${label} has a non-integer goal or decision count`);
  }
  if (values[5] === 0) assert.equal(values[4], 0, `${label} has time without candidate decisions`);
  if (values[7] === 0) assert.equal(values[6], 0, `${label} has time without baseline decisions`);
}

function validateSchedule(rows) {
  assert.equal(rows.length, 480, 'Expected 480 paired game records');
  const seeds = new Set();
  const pairCounts = new Map();
  const groups = [];
  for (let offset = 0; offset < rows.length; offset += 4) {
    const group = rows.slice(offset, offset + 4);
    const first = group[0];
    assert.ok(Number.isSafeInteger(first.seed) && first.seed >= 0 && first.seed <= 0xffffffff,
      'Invalid rule seed');
    assert.ok(!seeds.has(first.seed), `Repeated seed group ${first.seed}`);
    seeds.add(first.seed);
    assert.ok(formations.includes(first.whiteFormation) && formations.includes(first.blackFormation),
      `Invalid formations for seed ${first.seed}`);
    const pair = `${first.whiteFormation}/${first.blackFormation}`;
    assert.notEqual(pair, 'neutral/neutral', 'Transfer excludes neutral/neutral');
    pairCounts.set(pair, (pairCounts.get(pair) ?? 0) + 1);
    for (const row of group) {
      assert.equal(row.seed, first.seed, 'Seed groups must occupy four consecutive lines');
      assert.equal(row.whiteFormation, first.whiteFormation, 'White formation changed within a seed');
      assert.equal(row.blackFormation, first.blackFormation, 'Black formation changed within a seed');
      assert.equal(typeof row.sameTrajectory, 'boolean', 'Missing trajectory-match flag');
      validateMetrics(row.small, `Small model, seed ${row.seed}`);
      validateMetrics(row.large, `Large model, seed ${row.seed}`);
    }
    assert.deepEqual(group.map(row => `${row.candidateColor}/${row.kickoff}`).sort(), expectedLegs,
      `Missing or duplicate color/kickoff leg for seed ${first.seed}`);
    groups.push(group);
  }
  assert.equal(seeds.size, 120);
  assert.equal(pairCounts.size, 8);
  for (const [pair, count] of pairCounts) assert.equal(count, 15, `Unbalanced formation pair ${pair}`);
  return {groups, formationSeedGroups: Object.fromEntries(pairCounts)};
}

function summarize(rows, arm) {
  const totals = Array(8).fill(0);
  for (const row of rows) {
    for (let index = 0; index < totals.length; index++) totals[index] += row[arm][index];
  }
  const [candidateXG, baselineXG, candidateGoals, baselineGoals,
    candidateSearchMs, candidateSearchCount, baselineSearchMs, baselineSearchCount] = totals;
  assert.ok(candidateSearchCount > 0 && baselineSearchCount > 0, 'No search decisions');
  const wdl = {
    win: rows.filter(row => row[arm][2] > row[arm][3]).length,
    draw: rows.filter(row => row[arm][2] === row[arm][3]).length,
    loss: rows.filter(row => row[arm][2] < row[arm][3]).length,
  };
  const candidateMeanMs = candidateSearchMs / candidateSearchCount;
  const baselineMeanMs = baselineSearchMs / baselineSearchCount;
  return {games: rows.length, wdl, candidateGoals, baselineGoals, candidateXG, baselineXG,
    xGPerGame: (candidateXG - baselineXG) / rows.length,
    goalsPerGame: (candidateGoals - baselineGoals) / rows.length,
    signedMatchPointsPerGame: (wdl.win - wdl.loss) / rows.length,
    timing: {candidateSearchCount, baselineSearchCount, candidateMeanMs, baselineMeanMs,
      guidedToFastMeanRatio: candidateMeanMs / baselineMeanMs}};
}

function pairedEffects(groups) {
  const values = groups.map(group => ({
    xG: group.reduce((sum, row) => sum
      + (row.large[0] - row.large[1]) - (row.small[0] - row.small[1]), 0),
    points: group.reduce((sum, row) => sum
      + Math.sign(row.large[2] - row.large[3]) - Math.sign(row.small[2] - row.small[3]), 0),
  }));
  const games = groups.length * 4;
  const xGSamples = [];
  const pointSamples = [];
  let rng = bootstrapSeed;
  // Keep the original schedule order and draw stream. Each draw retains all four legs.
  for (let sample = 0; sample < bootstrapSamples; sample++) {
    let xG = 0;
    let points = 0;
    for (let draw = 0; draw < groups.length; draw++) {
      rng ^= rng << 13;
      rng ^= rng >>> 17;
      rng ^= rng << 5;
      const index = Math.floor((rng >>> 0) / 2 ** 32 * groups.length);
      xG += values[index].xG;
      points += values[index].points;
    }
    xGSamples.push(xG / games);
    pointSamples.push(points / games);
  }
  function estimate(metric, samples) {
    samples.sort((left, right) => left - right);
    return {estimate: values.reduce((sum, group) => sum + group[metric], 0) / games,
      interval95: [samples[Math.ceil(samples.length * 0.025) - 1],
        samples[Math.ceil(samples.length * 0.975) - 1]]};
  }
  return {xGPerGame: estimate('xG', xGSamples), signedMatchPointsPerGame: estimate('points', pointSamples)};
}

const bytes = await readFile(input);
const rows = bytes.toString('utf8').trimEnd().split(/\r?\n/).map(JSON.parse);
const {groups, formationSeedGroups} = validateSchedule(rows);
const small = summarize(rows, 'small');
const large = summarize(rows, 'large');
const difference = pairedEffects(groups);

assert.deepEqual(small.wdl, {win: 33, draw: 414, loss: 33});
assert.deepEqual(large.wdl, {win: 35, draw: 413, loss: 32});
assert.equal(small.candidateGoals, 36);
assert.equal(small.baselineGoals, 36);
assert.equal(large.candidateGoals, 38);
assert.equal(large.baselineGoals, 35);
close(small.xGPerGame, 0.007570902519975678, '10k xG margin per game');
close(large.xGPerGame, -0.005314193194883187, '30k xG margin per game');
close(difference.xGPerGame.estimate, -0.012885095714858867, 'Paired xG difference');
close(difference.xGPerGame.interval95[0], -0.023345189604841252, 'Paired xG lower bound');
close(difference.xGPerGame.interval95[1], -0.0031390326883787493, 'Paired xG upper bound');
close(difference.signedMatchPointsPerGame.estimate, 0.00625, 'Paired signed-point difference');
close(difference.signedMatchPointsPerGame.interval95[0], -0.016666666666666666, 'Signed-point lower bound');
close(difference.signedMatchPointsPerGame.interval95[1], 0.029166666666666667, 'Signed-point upper bound');
close(small.timing.guidedToFastMeanRatio, 0.8499309588072593, '10k time ratio');
close(large.timing.guidedToFastMeanRatio, 1.0312568124970336, '30k time ratio');

const sameTrajectory = rows.filter(row => row.sameTrajectory);
assert.equal(sameTrajectory.length, 110, 'Expected 110 matching trajectories');
for (const row of sameTrajectory) {
  for (const index of [0, 1, 2, 3, 5, 7]) {
    close(row.small[index], row.large[index], `Matched-trajectory metric ${index}, seed ${row.seed}`);
  }
}
const matchedSmall = summarize(sameTrajectory, 'small');
const matchedLarge = summarize(sameTrajectory, 'large');
close(matchedSmall.timing.baselineMeanMs, 151.4017922497465, 'Matched 10k-arm Fast time', 1e-6);
close(matchedLarge.timing.baselineMeanMs, 126.62267046211699, 'Matched 30k-arm Fast time', 1e-6);

console.log(JSON.stringify({verification: 'passed', inputSha256: createHash('sha256').update(bytes).digest('hex'),
  pairedGames: rows.length, totalGames: rows.length * 2, seedGroups: groups.length, formationSeedGroups,
  bootstrap: {samples: bootstrapSamples, seed: '0xb3854b19', unit: 'Four-leg seed group',
    interval: 'Nearest-rank percentile 95%'},
  models: {'10000': small, '30000': large}, difference30000Minus10000: difference,
  sameTrajectory: {pairedGames: sameTrajectory.length, small: matchedSmall.timing, large: matchedLarge.timing},
  timingScope: 'Per-arm observed engine-call means on each policy\u2019s positions during concurrent matches. '
    + 'The matching-trajectory flag is supplied by the archive.'}, null, 2));
