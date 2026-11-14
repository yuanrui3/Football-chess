const SIDES = ['white', 'black'];
const TOTAL_FIELDS = ['xG', 'ownGoalXG', 'goals', 'shots', 'ownGoalShots', 'resolvedShots',
  'tackles', 'tackleWins', 'tacklesConceded', 'stallingAwards', 'offsideAwards', 'fouls',
  'nodes', 'completedDepthTotal', 'decisions', 'searchDecisions', 'thinkMs', 'searchThinkMs'];
const MIRROR_FIELDS = [...TOTAL_FIELDS.filter(field => !field.endsWith('Ms')), 'maxNodes'];
const MAX_EXACT_HALVES = 25;
const DEFAULT_EXACT_WORK_LIMIT = 1_000_000;
const BOUND_TABLE_LIMIT = 65_536;

function mean(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function sampleDeviation(values, average) {
  return values.length > 1
    ? Math.sqrt(values.reduce((sum, value) => sum + (value - average) ** 2, 0) / (values.length - 1))
    : null;
}

function bootstrapInterval(values, samples) {
  if (values.length < 2) return null;
  if (values.every(value => value === values[0])) return [values[0], values[0]];
  let state = 0x51f15e;
  const ceiling = 2 ** 32 - 2 ** 32 % values.length;
  const draw = () => {
    do {
      state ^= state << 13;
      state ^= state >>> 17;
      state ^= state << 5;
    } while ((state >>> 0) >= ceiling);
    return (state >>> 0) % values.length;
  };
  const means = new Float64Array(samples);
  for (let sample = 0; sample < samples; sample++) {
    let sum = 0;
    for (let index = 0; index < values.length; index++) sum += values[draw()];
    means[sample] = sum / values.length;
  }
  means.sort();
  return [means[Math.floor(samples * 0.025)], means[Math.floor(samples * 0.975)]];
}

// Every finite double is an exact integer times a power of two. Put all signed
// effects on the same integer lattice so inclusive ties require no tolerance.
function integerEffects(values) {
  const buffer = new DataView(new ArrayBuffer(8));
  const parts = values.filter(value => value !== 0).map(value => {
    buffer.setFloat64(0, Math.abs(value));
    const bits = buffer.getBigUint64(0);
    const exponent = Number(bits >> 52n);
    const significand = (bits & ((1n << 52n) - 1n)) | (exponent ? 1n << 52n : 0n);
    return {significand: value < 0 ? -significand : significand, power: Math.max(1, exponent) - 1075};
  });
  if (!parts.length) return [];
  const commonPower = Math.min(...parts.map(part => part.power));
  const integers = parts.map(part => part.significand << BigInt(part.power - commonPower));
  const gcd = (a, b) => {
    while (b) [a, b] = [b, a % b];
    return a;
  };
  const divisor = integers.reduce((common, value) => gcd(common, value < 0 ? -value : value), 0n);
  return integers.map(value => value / divisor);
}

// This can finish large degenerate cases quickly. A whole subtree qualifies
// whenever the sum of all remaining weights fits within the remaining limit.
function prunedSubsetCount(weights, limit, workLimit) {
  const groups = [];
  for (const weight of weights) {
    if (groups.at(-1)?.weight === weight) groups.at(-1).size++;
    else groups.push({weight, size: 1});
  }
  let remainingWeight = 0n, remainingSize = 0;
  for (const group of groups.toReversed()) {
    remainingWeight += group.weight * BigInt(group.size);
    remainingSize += group.size;
    group.remainingWeight = remainingWeight;
    group.possibleSubsets = 1n << BigInt(remainingSize);
    group.choices = [1n];
    for (let count = 1; count <= group.size; count++) {
      group.choices.push(group.choices.at(-1) * BigInt(group.size - count + 1) / BigInt(count));
    }
  }
  let visits = 0;
  const exhausted = Symbol('subset count work limit');
  function count(index, available) {
    if (++visits > workLimit) throw exhausted;
    const group = groups[index];
    if (!group || available < groups.at(-1).weight) return 1n;
    if (available >= group.remainingWeight) return group.possibleSubsets;
    let total = 0n;
    for (let taken = 0; taken <= group.size && available >= 0n; taken++, available -= group.weight) {
      total += group.choices[taken] * count(index + 1, available);
    }
    return total;
  }
  try {
    return count(0, limit);
  } catch (error) {
    if (error !== exhausted) throw error;
    return null;
  }
}

function subsetSums(weights) {
  const sums = new Float64Array(2 ** weights.length);
  let length = 1;
  for (const weight of weights) {
    for (let index = 0; index < length; index++) sums[length + index] = sums[index] + weight;
    length *= 2;
  }
  return sums.sort();
}

function residualsFor(targets, high, low) {
  // Visit masks in Gray-code order to update the integer high sum in O(1).
  // Only masks involved in an ambiguous comparison need a BigInt residual.
  let sum = 0;
  const save = mask => {
    const frequencies = targets.get(sum);
    if (!frequencies) return;
    let residual = 0n;
    while (mask) {
      residual += low[31 - Math.clz32(mask & -mask)];
      mask &= mask - 1;
    }
    frequencies.set(residual, (frequencies.get(residual) ?? 0) + 1);
  };
  save(0);
  for (let index = 1; index < 2 ** high.length; index++) {
    const mask = index ^ (index >>> 1);
    const bit = index & -index;
    sum += (mask & bit ? 1 : -1) * high[31 - Math.clz32(bit)];
    save(mask);
  }
  for (const [key, frequencies] of targets) {
    targets.set(key, [...frequencies].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0));
  }
}

function countResidualPairs(left, right, limit) {
  let total = 0, eligible = 0, index = right.length - 1;
  for (const [, frequency] of right) eligible += frequency;
  for (const [value, frequency] of left) {
    while (index >= 0 && value + right[index][0] > limit) eligible -= right[index--][1];
    if (!eligible) break;
    total += frequency * eligible;
  }
  return total;
}

function halfSubsetCount(weights, limit, totalWeight, workLimit) {
  // Sort compact exact high bits first. The sum of those bits fits in 52 bits,
  // and the omitted residual across a pair is strictly less than n * unit.
  const shift = BigInt(Math.max(0, totalWeight.toString(2).length - 52));
  const unit = 1n << shift;
  const highLimit = Number(limit >> shift);
  const safeLimit = shift ? highLimit - weights.length : highLimit;
  const halves = [weights.filter((_, index) => index % 2 === 0), weights.filter((_, index) => index % 2 === 1)];
  const high = halves.map(half => half.map(weight => Number(weight >> shift)));
  const [left, right] = high.map(subsetSums);
  const leftTargets = new Map(), rightTargets = new Map(), ambiguous = [];
  let count = 0, safe = right.length - 1, possible = right.length - 1;
  for (let start = 0, end = 0; start < left.length; start = end) {
    const value = left[start];
    end = start + 1;
    while (end < left.length && left[end] === value) end++;
    while (safe >= 0 && value + right[safe] > safeLimit) safe--;
    count += (end - start) * (safe + 1);
    if (!shift) continue;
    while (possible >= 0 && value + right[possible] > highLimit) possible--;
    if (possible < 0) break;
    for (let index = safe + 1; index <= possible;) {
      const other = right[index++];
      if (ambiguous.length >= workLimit) return null;
      if (!leftTargets.has(value)) leftTargets.set(value, new Map());
      if (!rightTargets.has(other)) rightTargets.set(other, new Map());
      ambiguous.push([value, other]);
      while (index <= possible && right[index] === other) index++;
    }
  }
  if (ambiguous.length) {
    const low = halves.map(half => half.map(weight => weight % unit));
    residualsFor(leftTargets, high[0], low[0]);
    residualsFor(rightTargets, high[1], low[1]);
    for (const [a, b] of ambiguous) {
      count += countResidualPairs(leftTargets.get(a), rightTargets.get(b), limit - BigInt(a + b) * unit);
    }
  }
  return BigInt(count);
}

function subsetCountAtMost(weights, capacity) {
  const counts = Array(capacity + 1).fill(0n);
  counts[0] = 1n;
  let reachable = 0, zeroWeights = 0;
  for (const weight of weights) {
    if (weight === 0) {
      zeroWeights++;
    } else if (weight <= capacity) {
      reachable = Math.min(capacity, reachable + weight);
      for (let sum = reachable; sum >= weight; sum--) counts[sum] += counts[sum - weight];
    }
  }
  return counts.reduce((sum, count) => sum + count, 0n) << BigInt(zeroWeights);
}

function subsetCountBounds(weights, limit) {
  // Rounding each weight down can only admit extra subsets. Rounding up can
  // only exclude valid subsets. The resulting counts bound the raw test.
  const unit = limit / BigInt(BOUND_TABLE_LIMIT) + 1n;
  const capacity = Number(limit / unit);
  const down = weights.map(weight => Number(weight / unit));
  const upper = subsetCountAtMost(down, capacity);
  if (unit === 1n) return [upper, upper];
  const up = weights.map(weight => Number((weight + unit - 1n) / unit));
  return [subsetCountAtMost(up, capacity), upper];
}

export function exactSignFlipTest(effects, workLimit = DEFAULT_EXACT_WORK_LIMIT) {
  if (!effects.length || effects.some(effect => !Number.isFinite(effect))) {
    throw new Error('Exact sign flips need a nonempty set of finite effects');
  }
  if (!Number.isSafeInteger(workLimit) || workLimit < 1) throw new Error('Invalid exact sign-flip work limit');
  const integers = integerEffects(effects);
  const signedTotal = integers.reduce((sum, value) => sum + value, 0n);
  const observed = signedTotal < 0 ? -signedTotal : signedTotal;
  const denominator = 1n << BigInt(integers.length);
  let numerator = denominator;
  if (observed) {
    const weights = integers.map(value => value < 0 ? -value : value)
      .sort((a, b) => a > b ? -1 : a < b ? 1 : 0);
    const totalWeight = weights.reduce((sum, value) => sum + value, 0n);
    const limit = (totalWeight - observed) / 2n;
    let count = prunedSubsetCount(weights, limit, workLimit);
    if (count === null && weights.length <= 2 * MAX_EXACT_HALVES) {
      count = halfSubsetCount(weights, limit, totalWeight, workLimit);
    }
    if (count === null) {
      const [lower, upper] = subsetCountBounds(weights, limit);
      if (lower !== upper) {
        return {status: 'work-limit', pValue: null, nonzeroClusters: integers.length, workLimit,
          exactPValueBounds: {lower: Number(2n * lower) / Number(denominator),
            upper: Number(2n * upper) / Number(denominator), lowerNumerator: String(2n * lower),
            upperNumerator: String(2n * upper), denominator: String(denominator)}};
      }
      count = lower;
    }
    numerator = 2n * count;
  }
  return {status: 'computed', pValue: Number(numerator) / Number(denominator), nonzeroClusters: integers.length,
    numerator: String(numerator), denominator: String(denominator)};
}

function addSide(totals, side) {
  for (const field of TOTAL_FIELDS) {
    if (!Number.isFinite(side[field]) || side[field] < 0) throw new Error(`Invalid side metric ${field}`);
    totals[field] += side[field];
  }
  if (!Number.isSafeInteger(side.maxNodes) || side.maxNodes < 0) throw new Error('Invalid maximum node count');
  totals.maxNodes = Math.max(totals.maxNodes, side.maxNodes);
}

function sideSummary(totals) {
  return {...totals, meanMsPerDecision: totals.decisions ? totals.thinkMs / totals.decisions : null,
    meanSearchMsPerDecision: totals.searchDecisions ? totals.searchThinkMs / totals.searchDecisions : null,
    meanNodes: totals.searchDecisions ? totals.nodes / totals.searchDecisions : null,
    meanCompletedDepth: totals.searchDecisions ? totals.completedDepthTotal / totals.searchDecisions : null};
}

function checkMirror(white, black) {
  const sharedFields = ['trajectoryHash', 'finalStateHash', 'winner', 'actions', 'extraResolutionActions', 'phase', 'finishReason'];
  if (!white.finalStateHash || !white.trajectoryHash || sharedFields.some(field => white[field] !== black[field])
      || SIDES.some(team => white.score[team] !== black.score[team])
      || MIRROR_FIELDS.some(field => white.candidate[field] !== black.baseline[field]
        || white.baseline[field] !== black.candidate[field])) {
    throw new Error(`Identical-policy mirror mismatch for seed ${white.seed}, ${white.kickoff} kickoff`);
  }
}

export function summarizeTournament(games, {bootstrapSamples = 20_000, exactSignFlip = true,
  exactWorkLimit, expectedSeeds, identicalPolicies = false} = {}) {
  if (!Number.isSafeInteger(bootstrapSamples) || bootstrapSamples < 1) throw new Error('Invalid bootstrap sample count');
  const allowedSeeds = expectedSeeds === undefined ? null : new Set(expectedSeeds);
  const bySeed = new Map();
  for (const game of games) {
    const {seed, candidateColor, kickoff} = game;
    if (!Number.isSafeInteger(seed) || !SIDES.includes(candidateColor) || !SIDES.includes(kickoff)
        || allowedSeeds && !allowedSeeds.has(seed)) throw new Error('Invalid tournament game identity');
    if (game.error || game.phase === 'keeperReact') throw new Error(`Unsettled or invalid game for seed ${seed}`);
    if (!bySeed.has(seed)) bySeed.set(seed, new Map());
    const legs = bySeed.get(seed), key = `${kickoff}:${candidateColor}`;
    if (legs.has(key)) throw new Error(`Duplicate game for seed ${seed}, ${key}`);
    legs.set(key, game);
  }
  const clusters = [], incompleteSeeds = [], differences = [];
  const candidate = Object.fromEntries([...TOTAL_FIELDS, 'maxNodes'].map(field => [field, 0]));
  const baseline = {...candidate};
  const candidateWDL = {win: 0, draw: 0, loss: 0};
  for (const [seed, legs] of [...bySeed].sort(([a], [b]) => a - b)) {
    if (legs.size !== 4) {
      incompleteSeeds.push(seed);
      continue;
    }
    let difference = 0;
    for (const kickoff of SIDES) {
      const white = legs.get(`${kickoff}:white`), black = legs.get(`${kickoff}:black`);
      if (identicalPolicies) checkMirror(white, black);
      const paired = [white, black].map(game => {
        addSide(candidate, game.candidate);
        addSide(baseline, game.baseline);
        if (!Object.hasOwn(candidateWDL, game.candidateResult)) throw new Error(`Invalid game result for seed ${seed}`);
        candidateWDL[game.candidateResult]++;
        return game.candidate.xG - game.baseline.xG;
      });
      differences.push(...paired);
      difference += paired[0] + paired[1];
    }
    clusters.push({seed, xGDiff: difference / 4});
  }
  const effects = clusters.map(cluster => cluster.xGDiff), average = mean(effects);
  return {games: games.length, analyzedGames: differences.length, completeClusters: clusters.length, incompleteSeeds,
    missingSeeds: allowedSeeds ? [...allowedSeeds].filter(seed => !bySeed.has(seed)) : [],
    identicalPolicyMirrors: identicalPolicies ? clusters.length * 2 : null,
    candidate: sideSummary(candidate), baseline: sideSummary(baseline), candidateWDL, clusters,
    xGDiff: {mean: average, seedClusterSD: sampleDeviation(effects, average),
      perGameSD: sampleDeviation(differences, average), percentile95: bootstrapInterval(effects, bootstrapSamples),
      bootstrapSamples: effects.length > 1 ? bootstrapSamples : 0,
      exactSignFlip: !exactSignFlip ? {status: 'disabled', pValue: null}
        : effects.length ? exactSignFlipTest(effects, exactWorkLimit) : {status: 'no-complete-clusters', pValue: null}}};
}
