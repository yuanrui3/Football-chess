import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as E from '../dist/engine.js';

// Inspect the real evaluation and bounded beam, while all sequence proofs use
// the playable engine's legalMoves/applyMove rather than a copied rule model.
const source = await readFile(new URL('../dist/engine.js', import.meta.url), 'utf8');
const I = await import(`data:text/javascript;base64,${Buffer.from(source + '\nexport {tacticalTackleRisk, rankedTacticalActions};').toString('base64')}`);
const fresh = () => ({normalUsed: false, pawnUsed: false, dribbleUsed: false});
const other = team => team === 'white' ? 'black' : 'white';
function fixture(positions = {}, carrier = 'white-Q') {
  const s = E.createGame({seed: 55});
  const assigned = {'white-K': [6, 16], 'black-K': [7, 0], 'white-Q': [6, 8], 'black-P1': [5, 6], ...positions};
  const used = new Set(Object.values(assigned).map(p => p.join(',')));
  const parking = Array.from({length: E.BOARD_HEIGHT}, (_, y) => [[0, y], [13, y]]).flat();
  for (const p of s.pieces) {
    const point = assigned[p.id] || parking.find(point => !used.has(point.join(',')));
    [p.x, p.y] = point; used.add(point.join(','));
  }
  const owner = s.pieces.find(p => p.id === carrier);
  Object.assign(s, {attack: owner.team, phase: 'defendMove', positionBudget: fresh(),
    ball: {x: owner.x, y: owner.y, carrierId: owner.id}, restart: null, offside: null,
    pendingShot: null, paceControl: null, ballProgress: {team: owner.team, anchorY: owner.y, rounds: 0, pendingRelease: false, excludeRelease: false}});
  assert.equal(new Set(s.pieces.map(p => `${p.x},${p.y}`)).size, 22);
  assert.ok(s.pieces.every(p => E.canOccupySquare(p, p.x, p.y)));
  return s;
}
function mirror(s) {
  const t = structuredClone(s), id = v => v?.replace(/^(white|black)/, other) ?? null;
  const point = p => ({x: E.BOARD_WIDTH - 1 - p.x, y: E.BOARD_HEIGHT - 1 - p.y});
  t.attack = other(s.attack); t.score = {white: s.score.black, black: s.score.white};
  t.pieces = s.pieces.map(p => ({...p, ...point(p), id: id(p.id), team: other(p.team)}));
  t.ball = {...point(s.ball), carrierId: id(s.ball.carrierId)};
  if (s.ballProgress) t.ballProgress = {...s.ballProgress, team: other(s.ballProgress.team), anchorY: E.BOARD_HEIGHT - 1 - s.ballProgress.anchorY};
  if (s.paceControl) t.paceControl = {...s.paceControl, team: other(s.paceControl.team), carrierId: id(s.paceControl.carrierId), history: []};
  if (s.offside) t.offside = {...s.offside, team: other(s.offside.team), flaggedIds: s.offside.flaggedIds.map(id)};
  return t;
}
const carrier = s => s.pieces.find(p => p.id === s.ball.carrierId);
const risk = s => I.tacticalTackleRisk(s, carrier(s));
const direct = s => s.pieces.filter(p => p.team === E.currentTeam(s)).flatMap(p => E.legalMoves(s, p.id).filter(m => m.type === 'tackle'));

test('a free orthogonal pawn step followed by its ordinary diagonal tackle is a real threat, either color', () => {
  for (const s of [fixture(), mirror(fixture())]) {
    const team = E.currentTeam(s), pawn = s.pieces.find(p => p.id === `${team}-P1`);
    assert.equal(direct(s).length, 0, 'no piece can tackle before the setup');
    assert.equal(risk(s), 1);
    const setup = E.legalMoves(s, pawn.id, {freePawn: true}).find(m => {
      const next = E.applyMove(s, pawn.id, m.x, m.y, {freePawn: true});
      return E.legalMoves(next, pawn.id).some(m => m.type === 'tackle');
    });
    assert.ok(setup);
    const after = E.applyMove(s, pawn.id, setup.x, setup.y, {freePawn: true});
    assert.equal(after.positionBudget.pawnUsed, true);
    assert.equal(after.positionBudget.normalUsed, false);
    const tackle = E.legalMoves(after, pawn.id).find(m => m.type === 'tackle');
    const won = E.applyMove(after, pawn.id, tackle.x, tackle.y);
    assert.equal(won.attack, team); assert.equal(won.ball.carrierId, pawn.id);
  }
});

test('pawn setup risk respects current defensive budgets, but attacking moves face fresh defender budgets', () => {
  for (const s of [fixture(), mirror(fixture())]) {
    for (const spent of ['normalUsed', 'pawnUsed']) {
      const used = structuredClone(s); used.positionBudget[spent] = true;
      assert.equal(risk(used), 0, `${spent} prevents a two-action setup in this reply`);
    }
    const attacking = structuredClone(s); attacking.phase = 'attackMove';
    attacking.positionBudget = {normalUsed: true, pawnUsed: true, dribbleUsed: true};
    assert.equal(risk(attacking), 1, 'the attacker cannot spend the opponent\'s next budget');
    const kicking = structuredClone(s); kicking.phase = 'kick';
    assert.equal(risk(kicking), 0, 'there is no defensive reposition before an already available kick');
    for (const type of ['corner', 'freeKick', 'goalKick', 'throwIn']) {
      const protectedRestart = structuredClone(s); protectedRestart.restart = {type, team: s.attack, takerId: s.ball.carrierId};
      assert.equal(risk(protectedRestart), 0, 'protected restarts prohibit tackles during settling');
    }
  }
});

test('occupied setup squares, distant pawns, and offside involvement do not create imaginary tackles', () => {
  const occupied = fixture({'white-P3': [5, 7]});
  const distant = fixture({'black-P1': [5, 5]});
  const flagged = fixture(); flagged.offside = {team: 'black', flaggedIds: ['black-P1']};
  for (const s of [occupied, distant, flagged, mirror(occupied), mirror(distant), mirror(flagged)]) assert.equal(risk(s), 0);
  const normalOnly = fixture();
  assert.ok(E.legalMoves(normalOnly, 'black-P1').some(m => m.x === 5 && m.y === 7));
  const afterNormal = E.applyMove(normalOnly, 'black-P1', 5, 7);
  assert.equal(risk(afterNormal), 0, 'using the ordinary move to approach cannot also spend it on a tackle');
});

test('an existing diagonal tackle still works after the bonus has been spent, either color', () => {
  const base = fixture({'black-P1': [5, 7]}); base.positionBudget.pawnUsed = true;
  for (const s of [base, mirror(base)]) {
    assert.ok(direct(s).length); assert.equal(risk(s), 1);
    s.positionBudget.normalUsed = true; assert.equal(risk(s), 0);
  }
});

test('risk uses the real knight resistance and clean-tackle probability, either color', () => {
  const base = fixture({'white-Q': [6, 10], 'white-N1': [6, 8]}, 'white-N1');
  for (const s of [base, mirror(base)]) {
    assert.equal(risk(s), 0.5); s.foulsEnabled = true; assert.equal(risk(s), 0.45);
    const defender = E.currentTeam(s), pawn = `${defender}-P1`;
    const setup = E.legalMoves(s, pawn, {freePawn: true}).find(m => {
      const next = E.applyMove(s, pawn, m.x, m.y, {freePawn: true});
      return E.legalMoves(next, pawn).some(m => m.type === 'tackle');
    });
    const next = E.applyMove(s, pawn, setup.x, setup.y, {freePawn: true});
    assert.equal(E.legalMoves(next, pawn).find(m => m.type === 'tackle').tackleProbability, risk(s));
  }
});

test('the existing shared king bonus also permits a legal setup without inventing extra moves', () => {
  const s = fixture({'white-Q': [6, 3], 'black-K': [6, 1], 'black-P1': [0, 16]});
  assert.equal(risk(s), 1); assert.equal(direct(s).length, 0);
  const next = E.applyMove(s, 'black-K', 5, 2, {freePawn: true});
  assert.ok(E.legalMoves(next, 'black-K').some(m => m.type === 'tackle'));
  s.positionBudget.pawnUsed = true; assert.equal(risk(s), 0);
});

test('a geometrical knight attack with every tackle landing occupied is not a real challenge', () => {
  const ring = [[5, 7], [6, 7], [7, 7], [5, 8], [7, 8], [5, 9], [6, 9], [7, 9]];
  const names = ['white-R1', 'white-R2', 'white-B1', 'white-B2', 'white-N1', 'white-N2', 'white-P1', 'white-P2'];
  const s = fixture(Object.fromEntries([['black-P1', [0, 16]], ['black-N1', [5, 6]], ...names.map((id, i) => [id, ring[i]])]));
  assert.equal(direct(s).length, 0); assert.equal(risk(s), 0);
});

function naturalTrap() {
  // Seed55, action13: the former engine carried f8 -> f14, overlooking an
  // e14 -> e15 bonus setup and ordinary pawn tackle in the opponent's reply.
  const positions = {'white-K':[6,16],'white-Q':[5,9],'white-R1':[1,13],'white-R2':[12,13],'white-B1':[4,10],'white-B2':[11,12],'white-N1':[3,9],'white-N2':[8,12],'white-P1':[5,12],'white-P2':[7,13],'white-P3':[9,13],'black-K':[6,0],'black-Q':[7,4],'black-R1':[12,3],'black-R2':[1,10],'black-B1':[11,4],'black-B2':[2,4],'black-N1':[10,7],'black-N2':[6,7],'black-P1':[8,4],'black-P2':[6,3],'black-P3':[4,3]};
  const s = fixture(positions); s.phase = 'attackMove'; s.turn = 4;
  s.positionBudget = {normalUsed: true, pawnUsed: false, dribbleUsed: false};
  s.ballProgress = {team: 'white', anchorY: 12, rounds: 2, pendingRelease: false, excludeRelease: false};
  s.paceControl = {team: 'white', carrierId: 'white-Q', dribbleRounds: 0, dribbledThisRound: false, history: ['5,9:white-B1'], furthestAdvance: -9};
  return s;
}

test('the bounded inner reply retains a pawn setup that the previous beam pruned, either color', () => {
  const trap = E.applyMove(naturalTrap(), 'white-Q', 5, 3);
  for (let s of [trap, mirror(trap)]) {
    s = E.skipMove(s);
    assert.equal(s.phase, 'defendMove'); assert.equal(direct(s).length, 0); assert.equal(risk(s), 1);
    const entries = I.rankedTacticalActions(s, 3, false), setup = entries.find(entry => entry.category === 'tackleSetup');
    assert.ok(setup, 'the attacking search must see the same two-action defence that the live defender can choose');
    assert.ok(entries.length <= 3, 'candidate width and the 1,400-node allowance do not increase');
    const after = E.applyMove(s, setup.action.pieceId, setup.action.x, setup.action.y, {freePawn: true});
    const tackle = E.legalMoves(after, setup.action.pieceId).find(m => m.type === 'tackle');
    assert.ok(tackle); assert.equal(E.applyMove(after, setup.action.pieceId, tackle.x, tackle.y).attack, E.currentTeam(s));
  }
});

test('Tactical avoids the reproducible free-pawn trap when a safe productive carry exists, either color', () => {
  for (const s of [naturalTrap(), mirror(naturalTrap())]) {
    const before = structuredClone(s), report = E.analyzeTacticalAction(s);
    assert.equal(report.action.type, 'move'); assert.equal(report.action.pieceId, s.ball.carrierId);
    const after = E.applyMove(s, report.action.pieceId, report.action.x, report.action.y, {freePawn: !!report.action.freePawn});
    assert.equal(risk(after), 0, 'the selected carrier square survives the upcoming pawn reposition and tackle');
    assert.ok(report.stats.nodes <= 1400); assert.deepEqual(s, before);
  }
});
