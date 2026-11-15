import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const read = name => readFile(new URL(name, import.meta.url), 'utf8');
const digest = text => createHash('sha256').update(text).digest('hex');
const sum = values => values.reduce((total, value) => total + value, 0);
const mean = values => sum(values) / values.length;
const sides = ['candidate', 'baseline'];
const colors = ['white', 'black'];
const outcomes = ['win', 'draw', 'loss'];
const otherColor = color => colors.find(value => value !== color);
const count = (values, predicate) => values.filter(predicate).length;
const leg = game => [game.seed, game.candidateColor, game.kickoff].join(':');
const metrics = {
  goalDifference: game => game.candidate.goals - game.baseline.goals,
  wdlScoreAboveParity: game => ({win: 0.5, draw: 0, loss: -0.5})[game.candidateResult],
  xG: game => game.candidate.xG - game.baseline.xG,
};

function near(observed, recorded, label) {
  assert.ok(Math.abs(observed - recorded) < 1e-7, `${label}: ${observed} differs from ${recorded}`);
}

function percentile(sorted, fraction) {
  const index = (sorted.length - 1) * fraction;
  const lower = Math.floor(index);
  return sorted[lower] + (index - lower) * (sorted[Math.ceil(index)] - sorted[lower]);
}

function summarizeGames(games, recorded) {
  assert.equal(games.length, recorded.games);
  for (const outcome of outcomes) {
    assert.equal(count(games, game => game.candidateResult === outcome), recorded.wdl[outcome]);
  }
  for (const side of sides) {
    for (const [metric, total] of Object.entries(recorded[side])) {
      const values = games.map(game => game[side][metric]);
      const observed = metric === 'maxNodes' ? Math.max(...values) : sum(values);
      near(observed, total, metric);
    }
  }
}

function verifyTiming(games, timing, allowance) {
  for (const side of sides) {
    const records = games.map(game => game[side]);
    const samples = records.flatMap(row => row.searchMsSamples).sort((a, b) => a - b);
    const observed = {
      count: samples.length,
      meanMs: sum(records.map(row => row.searchThinkMs)) / samples.length,
      p50Ms: percentile(samples, 0.5),
      p95Ms: percentile(samples, 0.95),
      timeLimitHits: sum(records.map(row => row.timeLimitHits)),
      zeroDepthSearchDecisions: sum(records.map(row => row.zeroDepthSearchDecisions)),
      aboveAllowanceBy10Ms: count(samples, ms => ms > allowance + 10),
      aboveAllowanceBy25Ms: count(samples, ms => ms > allowance + 25),
    };
    for (const [key, value] of Object.entries(observed)) near(value, timing[side][key], key);
  }
  const ratio = timing.candidate.meanMs / timing.baseline.meanMs;
  near(ratio, timing.candidateToBaselineMeanRatio, 'candidate to baseline mean latency ratio');
}

function bootstrappedInterval(groups, equalNodes) {
  let state = 0x76f90843;
  function draw(values) {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return values[Math.floor((state >>> 0) / 2 ** 32 * values.length)];
  }
  const outcomes = Array.from({length: 20_000}, () => mean(groups.map(() => {
    const checkpoint = draw(groups);
    return mean(checkpoint.map(() => draw(checkpoint)));
  }))).sort((a, b) => a - b);
  return equalNodes ? [outcomes[500], outcomes[19500]] : [percentile(outcomes, 0.025), percentile(outcomes, 0.975)];
}

function verifyComparisons(study, byJob, equalNodes) {
  for (const [comparison, results] of Object.entries(study.comparisons)) {
    const [arm, opponent] = comparison.split('-vs-');
    for (const [metric, result] of Object.entries(results)) {
      const score = metrics[metric];
      const groups = study.schedule.map(({repeat, matchSeeds}) => {
        const games = byJob.get(`${arm}-${repeat}`);
        const reference = opponent === 'frozen' ? null
          : new Map(byJob.get(`${opponent}-${repeat}`).map(game => [leg(game), game]));
        return matchSeeds.map(seed => mean(games.filter(game => game.seed === seed).map(game => {
          return score(game) - (reference ? score(reference.get(leg(game))) : 0);
        })));
      });
      const means = groups.map(mean);
      near(mean(means), result.mean, comparison);
      means.forEach((value, i) => near(value, result.trainingRunMeans[i], comparison));
      bootstrappedInterval(groups, equalNodes).forEach((value, i) => near(value, result.percentile95[i], comparison));
    }
  }
}

const summary = JSON.parse(await read('summary.json'));
const allSeeds = new Set();
let totalGames = 0;
for (const [name, study] of Object.entries(summary.studies)) {
  const {actionLimit, foulsEnabled, nodeLimit, maxDepth, timeLimitMs} = study.protocol;
  const raw = await read(study.ledger);
  assert.equal(digest(raw), study.ledgerSha256);
  assert.ok(raw.endsWith('\n'));
  const lines = raw.slice(0, -1).split('\n');
  const games = lines.map(line => JSON.parse(line));
  assert.equal(games.length, study.games);
  for (const {matchSeeds, repeat, trainingSeed} of study.schedule) {
    assert.equal(trainingSeed, summary.training.repetitions[repeat - 1].seed);
    for (const seed of matchSeeds) {
      assert.ok(!allSeeds.has(seed));
      allSeeds.add(seed);
    }
  }
  const byJob = new Map();
  for (const job of study.jobs) {
    const rows = games.filter(game => game.arm === job.key);
    const plainText = lines.filter((_, i) => games[i].arm === job.key).join('\n') + '\n';
    assert.equal(digest(plainText), job.sourceLedgerSha256);
    assert.equal(job.key, `${job.arm}-${job.repeat}`);
    assert.deepEqual(job.matchSeeds, study.schedule[job.repeat - 1].matchSeeds);
    const expected = new Set(job.matchSeeds.flatMap(seed => colors.flatMap(candidateColor =>
      colors.map(kickoff => leg({seed, candidateColor, kickoff})))));
    assert.equal(expected.size, rows.length);
    for (const game of rows) {
      assert.ok(expected.delete(leg(game)));
      assert.equal(game.protocolId, job.protocolId);
      assert.equal(game.actionLimit, actionLimit);
      assert.equal(game.foulsEnabled, foulsEnabled);
      assert.equal(game.timing.node, study.protocol.nodeVersion);
      assert.equal(game.extraResolutionActions, Math.max(0, game.actions - actionLimit));
      assert.equal(game.candidateResult, game.winner === null ? 'draw' : game.winner === game.candidateColor ? 'win' : 'loss');
      const [candidate, baseline] = sides.map(side => game[side]);
      assert.equal(candidate.goals, game.score[game.candidateColor]);
      assert.equal(baseline.goals, game.score[otherColor(game.candidateColor)]);
      assert.equal(candidate.decisions + baseline.decisions, game.actions);
      for (const row of [candidate, baseline]) {
        assert.ok(row.maxNodes <= nodeLimit);
        assert.ok(row.completedDepthTotal <= maxDepth * row.searchDecisions);
        if (timeLimitMs === null) continue;
        assert.equal(row.searchMsSamples.length, row.searchDecisions);
        assert.ok(row.searchMsSamples.every(ms => Number.isFinite(ms) && ms >= 0));
        near(sum(row.searchMsSamples), row.searchThinkMs, 'per-game elapsed search time');
      }
    }
    byJob.set(job.key, rows);
  }
  assert.equal(sum([...byJob.values()].map(rows => rows.length)), games.length);
  for (const [arm, reports] of Object.entries(study.gamesByArm)) {
    const perRun = study.schedule.map(({repeat}) => byJob.get(`${arm}-${repeat}`));
    perRun.forEach((rows, i) => summarizeGames(rows, reports.perRun[i]));
    summarizeGames(perRun.flat(), reports.pooled);
    if (timeLimitMs !== null) verifyTiming(perRun.flat(), study.timing[arm], timeLimitMs);
  }
  verifyComparisons(study, byJob, timeLimitMs === null);
  totalGames += games.length;
  console.log(`${name}  ${games.length} verified records`);
}

assert.equal(totalGames, 168);
assert.equal(allSeeds.size, 18);
const {originalTimeReference: reference} = summary;
const frozen = Object.values(summary.studies['equal-nodes'].gamesByArm).map(arm => arm.pooled.baseline);
assert.equal(sum(frozen.map(row => row.searchDecisions)), reference.searchDecisions);
near(sum(frozen.map(row => row.searchThinkMs)), reference.searchThinkMs, 'original mean time numerator');
near(reference.searchThinkMs / reference.searchDecisions, reference.timeLimitMs, 'original mean time');
assert.equal(reference.timeLimitMs, summary.studies['original-time'].protocol.timeLimitMs);
console.log(`${totalGames} matches on ${allSeeds.size} seeds verified`);
