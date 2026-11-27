import assert from 'node:assert/strict';

const point = square => ({x: square.charCodeAt(0) - 97, y: Number(square.slice(1))});
const squareName = ({x, y}) => String.fromCharCode(97 + x) + y;

function menuChoice(item, targetIndex) {
  const {targets} = item.board;
  const label = targetIndex === 2 ? 'Disguise ' + targets.join('/') : 'Declare file ' + targets[targetIndex];
  const index = item.options.indexOf(label);
  assert.ok(index >= 0, 'Missing shot ' + label);
  return index;
}

function bestAction(item, rows) {
  const values = [Math.min(...rows.map(r => r[0])), Math.min(...rows.map(r => r[1])),
    Math.min(...rows.map(([first, second]) => (first + second) / 2))];
  const best = Math.max(...values);
  const winner = [2, 0, 1].find(i => best - values[i] <= 1e-12);
  return {index: menuChoice(item, winner), values};
}

function geometry(item) {
  const {board} = item;
  const keeper = board.pieces.find(p => p.team !== board.attacker && p.type === 'K');
  const shooter = board.pieces.find(p => p.id === board.carrierId);
  const origin = point(keeper.square);
  const otherPieces = board.pieces.filter(p => p.id !== keeper.id);
  const occupiedSquares = new Set(otherPieces.map(p => p.square));
  const replies = [];
  for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
    const dest = {x: origin.x + dx, y: origin.y + dy};
    if (dest.x < 0 || dest.x > 13 || dest.y < 1 || dest.y > 17 || occupiedSquares.has(squareName(dest))) continue;
    replies.push(dest);
  }
  const goalRank = board.attacker === 'white' ? 17.5 : 0.5;
  const targets = board.targets.map(file => ({x: file.charCodeAt(0) - 97, y: goalRank}));
  return {origin, shooter, source: point(shooter.square), otherPieces, targets, replies};
}

function inOwnBox(attacker, p) {
  return p.x >= 4 && p.x <= 9 && (attacker === 'black' ? p.y <= 3 : p.y >= 15);
}

// Interior intersection excludes touching a corner or travelling along a cell edge.
function crossesCell(source, target, center) {
  let lo = 0, hi = 1;
  for (const axis of ['x', 'y']) {
    const delta = target[axis] - source[axis];
    if (delta === 0) {
      if (Math.abs(source[axis] - center[axis]) >= 0.5) return false;
      continue;
    }
    const first = (center[axis] - 0.5 - source[axis]) / delta;
    const last = (center[axis] + 0.5 - source[axis]) / delta;
    lo = Math.max(lo, Math.min(first, last));
    hi = Math.min(hi, Math.max(first, last));
  }
  return hi - lo > 1e-10;
}

function keeperMultiplier(source, target, keeper) {
  const dx = target.x - source.x, dy = target.y - source.y;
  const projection = ((keeper.x - source.x) * dx + (keeper.y - source.y) * dy) / (dx * dx + dy * dy);
  if (projection < 0) return 1;
  const u = Math.min(projection, 1);
  const distance = Math.hypot(source.x + u * dx - keeper.x, source.y + u * dy - keeper.y);
  return 1 - Math.exp(-distance * distance);
}

// Only a public item enters these policies. No engine, table, pair ID, or answer key is consulted.
export function coordinatePolicies(item) {
  const {origin, shooter, source, otherPieces, targets, replies} = geometry(item);
  const side = item.board.attacker;
  const gaps = targets.map(t => Math.abs(origin.x - t.x));
  const farther = gaps[0] === gaps[1] ? 2 : gaps[0] > gaps[1] ? 0 : 1;
  const covered = targets.map(t => replies.some(p => p.x === t.x && inOwnBox(side, p)));
  let reachable = farther;
  if (covered[0] && covered[1]) reachable = 2;
  else if (covered[0] || covered[1]) reachable = covered[0] ? 1 : 0;
  const defenders = otherPieces.filter(p => p.team !== side).map(p => point(p.square));
  const rows = replies.map(dest => {
    const inside = inOwnBox(side, dest);
    const bodies = inside ? defenders : [...defenders, dest];
    return targets.map(t => {
      const blocked = shooter.type === 'N' ? 0 : bodies.filter(body => crossesCell(source, t, body)).length;
      return 0.55 ** blocked * (inside ? keeperMultiplier(source, t, dest) : 1);
    });
  });
  return {fartherFile: menuChoice(item, farther), alwaysDisguise: menuChoice(item, 2),
    reachableFiles: menuChoice(item, reachable), simplifiedGeometry: bestAction(item, rows).index,
    firstMenuOption: 0, secondMenuOption: 1, thirdMenuOption: 2};
}
