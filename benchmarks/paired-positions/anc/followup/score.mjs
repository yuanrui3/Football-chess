import assert from 'node:assert/strict';

export function score(choices, boards, pairs) {
  const byPair = new Map();
  const result = {validBoards:0, correctBoards:0, solvedPairs:0,
    switch:{total:0, bothValid:0, changedReceiver:0, solved:0},
    stay:{total:0, bothValid:0, changedReceiver:0, solved:0}, byStratum:{},
    meanRetentionLossPercentagePointsOnValidChoices:null};
  let loss = 0;
  for (const pair of pairs) {
    const category = result[pair.condition];
    category.total++;
    const stratum = result.byStratum[pair.stratum] ??= {pairs:0, solved:0};
    stratum.pairs++;
    const receivers = [], correct = [];
    for (const id of pair.items) {
      const board = boards.get(id), choice = choices.get(id);
      assert.ok(choice === null || [1,2,3].includes(choice));
      const values = board.oracle.map(row => row.retention);
      assert.equal(values.filter(v => v === Math.max(...values)).length, 1);
      assert.equal(board.answer, 1 + values.indexOf(Math.max(...values)));
      correct.push(choice === board.answer);
      receivers.push(choice === null ? null : board.options[choice - 1]);
      if (choice === null) continue;
      result.validBoards++;
      result.correctBoards += Number(choice === board.answer);
      loss += values[board.answer - 1] - values[choice - 1];
    }
    if (receivers.every(r => r !== null)) {
      category.bothValid++;
      category.changedReceiver += Number(receivers[0] !== receivers[1]);
    }
    const solved = correct.every(Boolean);
    result.solvedPairs += Number(solved);
    category.solved += Number(solved);
    stratum.solved += Number(solved);
    byPair.set(pair.pairId, solved);
  }
  if (result.validBoards) result.meanRetentionLossPercentagePointsOnValidChoices = 100 * loss / result.validBoards;
  return {result, byPair};
}
