import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const shieldTypes = ['N', 'R'];
const signals = ['safe', 'unsafe'];
const reliabilities = [0.9, 0.6];
const count = (rows, predicate) => rows.filter(predicate).length;
const mean = values => values.length
  ? Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(8))
  : null;

function scoreItem(item, choice) {
  assert.ok(choice === null || [1, 2, 3].includes(choice), 'Use a one-based choice, or null for an invalid answer');
  assert.deepEqual([...item.options].sort(), ['B', 'N', 'R']);
  assert.ok(shieldTypes.includes(item.protectedPiece));
  assert.ok(signals.includes(item.signal) && reliabilities.includes(item.reliability));
  const ordinaryPiece = item.protectedPiece === 'N' ? 'R' : 'N';
  // The two states have equal prior mass and cue errors are symmetric.
  const probabilitySafe = item.signal === 'safe' ? item.reliability : 1 - item.reliability;
  const values = {[ordinaryPiece]: probabilitySafe, [item.protectedPiece]: 0.75, B: 0};
  const best = probabilitySafe > 0.75 ? ordinaryPiece : item.protectedPiece;
  assert.equal(item.options[item.optimal - 1], best, 'Design answer does not match the Bayesian action values');
  const piece = choice === null ? null : item.options[choice - 1];
  const role = piece === null ? 'invalid' : piece === 'B' ? 'bishop' :
    piece === item.protectedPiece ? 'protected' : 'ordinary';
  return {
    layoutId: item.layoutId, protectedPiece: item.protectedPiece, ordinaryPiece,
    signal: item.signal, reliability: item.reliability, piece, role,
    correct: piece === best, chosenValue: piece === null ? null : values[piece],
    optimalValue: values[best],
  };
}

function summarize(rows) {
  const valid = rows.filter(row => row.piece !== null);
  return {
    assigned: rows.length, valid: valid.length, correct: count(rows, row => row.correct),
    pieceChoices: Object.fromEntries(['N', 'R', 'B'].map(piece => [piece, count(rows, row => row.piece === piece)])),
    roleChoices: Object.fromEntries(['protected', 'ordinary', 'bishop'].map(role => [role, count(rows, row => row.role === role)])),
    meanRetentionOnValid: mean(valid.map(row => row.chosenValue)),
    meanOptimalRetentionOnValid: mean(valid.map(row => row.optimalValue)),
    meanShortfallFromCueOraclePpOnValid: mean(valid.map(row => 100 * (row.optimalValue - row.chosenValue))),
  };
}

function reliabilityPair(layout, protectedPiece, signal) {
  return reliabilities.map(reliability => {
    const cell = layout.filter(row =>
      row.protectedPiece === protectedPiece && row.signal === signal && row.reliability === reliability);
    assert.equal(cell.length, 1, 'Each layout must contain one decision per factorial cell');
    return cell[0];
  });
}

function favorablePattern([high, low]) {
  if (high.role === 'invalid' || low.role === 'invalid') return 'invalid';
  if (high.role === 'bishop' || low.role === 'bishop') return 'includesBishop';
  if (high.role === low.role) return high.role === 'protected' ? 'bothProtected' : 'bothOrdinary';
  return high.role === 'ordinary' ? 'correctReversal' : 'oppositeReversal';
}

const favorablePolicies = {
  evidenceSensitive: row => row.reliability === 0.9 ? row.ordinaryPiece : row.protectedPiece,
  alwaysKnight: () => 'N',
  alwaysRook: () => 'R',
  alwaysProtected: row => row.protectedPiece,
  alwaysOrdinary: row => row.ordinaryPiece,
  alwaysBishop: () => 'B',
};

export function score(design, choices) {
  assert.ok(Array.isArray(choices), 'Expected an array of {itemId, choice} objects');
  const byId = new Map(choices.map(row => [row.itemId, row.choice]));
  assert.equal(byId.size, choices.length, 'Duplicate response item ID');
  const expectedIds = design.items.map(item => item.itemId);
  assert.equal(new Set(expectedIds).size, expectedIds.length, 'Duplicate stimulus ID');
  assert.deepEqual([...byId.keys()].sort(), [...expectedIds].sort(), 'Choices must cover the complete frozen manifest');
  const rows = design.items.map(item => scoreItem(item, byId.get(item.itemId)));
  const layouts = Map.groupBy(rows, row => row.layoutId);
  const favorablePairs = [], unfavorablePairs = [], favorableByLayout = [];
  for (const [layoutId, layout] of layouts) {
    const positive = layout.filter(row => row.signal === 'safe');
    assert.equal(layout.length, 8);
    for (const protectedPiece of shieldTypes) {
      const favorable = reliabilityPair(layout, protectedPiece, 'safe');
      favorablePairs.push({layoutId, protectedPiece, pattern: favorablePattern(favorable)});
      const unfavorable = reliabilityPair(layout, protectedPiece, 'unsafe');
      unfavorablePairs.push({
        layoutId, protectedPiece,
        bothValid: unfavorable.every(row => row.piece !== null),
        bothCorrect: unfavorable.every(row => row.correct),
      });
    }
    // On the four positive-cue trials, each candidate policy predicts a distinct four-choice vector.
    const matches = Object.entries(favorablePolicies)
      .filter(([, predict]) => positive.every(row => row.piece === predict(row)));
    assert.ok(matches.length <= 1);
    const pattern = positive.some(row => row.piece === null) ? 'invalid' : (matches[0]?.[0] ?? 'mixed');
    favorableByLayout.push({layoutId, pattern});
  }

  const byCell = [], roleSwapChecks = [];
  for (const signal of signals) {
    for (const reliability of reliabilities) {
      const atReliability = rows.filter(row => row.signal === signal && row.reliability === reliability);
      for (const protectedPiece of shieldTypes) {
        byCell.push({signal, reliability, protectedPiece,
          ...summarize(atReliability.filter(row => row.protectedPiece === protectedPiece))});
      }
      const matched = [...Map.groupBy(atReliability, row => row.layoutId).values()];
      roleSwapChecks.push({
        signal, reliability, assigned: matched.length,
        bothValid: count(matched, pair => pair.every(row => row.piece !== null)),
        bothCorrectAcrossSwap: count(matched, pair => pair.every(row => row.correct)),
        knightAcrossSwap: count(matched, pair => pair.every(row => row.piece === 'N')),
        rookAcrossSwap: count(matched, pair => pair.every(row => row.piece === 'R')),
      });
    }
  }
  const pairCounts = rows => ({
    assigned: rows.length, bothValid: count(rows, row => row.pattern !== 'invalid'),
    correctReversals: count(rows, row => row.pattern === 'correctReversal'),
    patterns: Object.fromEntries(['correctReversal', 'oppositeReversal', 'bothProtected',
      'bothOrdinary', 'includesBishop', 'invalid'].map(pattern => [pattern, count(rows, row => row.pattern === pattern)])),
  });
  return {
    primaryFavorableCue: {
      ...pairCounts(favorablePairs),
      byProtectedPiece: Object.fromEntries(shieldTypes.map(type =>
        [type, pairCounts(favorablePairs.filter(pair => pair.protectedPiece === type))])),
      layoutsCorrectUnderBothRoleAssignments: count(favorableByLayout, row => row.pattern === 'evidenceSensitive'),
      layoutsAssigned: layouts.size,
    },
    unfavorableCueControls: {
      assigned: unfavorablePairs.length, bothValid: count(unfavorablePairs, row => row.bothValid),
      bothCorrect: count(unfavorablePairs, row => row.bothCorrect),
    },
    overall: summarize(rows), byCell, roleSwapChecks,
    favorableChoicePatternsAcrossBothRoles: favorableByLayout,
    favorableReversalsByLayoutAndRole: favorablePairs,
  };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const choicesFile = process.argv[2];
  assert.ok(choicesFile, 'Usage: node score.mjs choices.json');
  const {generateDesign} = await import('./design.mjs');
  const choices = JSON.parse(readFileSync(choicesFile, 'utf8'));
  console.log(JSON.stringify(score(generateDesign(), choices), null, 2));
}
