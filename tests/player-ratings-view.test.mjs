import test from 'node:test';
import assert from 'node:assert/strict';
import {ratingsPitchPlayers, ratingsPlayerOfMatch, renderPlayerRatings} from '../dist/player-ratings-view.js';
import {createPlayerHeatmaps} from '../dist/player-heatmaps.js';

class Element {
  constructor(tagName, document) {
    this.tagName = tagName; this.ownerDocument = document; this.children = []; this.attrs = {}; this.dataset = {}; this.style = {}; this.listeners = {};
    this.className = ''; this.textContent = ''; this.classList = {add: name => { this.className += ` ${name}`; }};
  }
  append(node) { this.children.push(node); }
  replaceChildren(...children) { this.children = children; }
  setAttribute(name, value) { this.attrs[name] = value; }
  addEventListener(type, listener) { this.listeners[type] = listener; }
}
const document = {createElement: tag => new Element(tag, document), createElementNS: (_namespace, tag) => new Element(tag, document)};
const descendants = node => node.children.flatMap(child => [child, ...descendants(child)]);
const text = node => [node.textContent, ...node.children.map(text)].join(' ');
const player = (pieceId, rating = 6, actions = 0, impact = 0) => ({pieceId, team: pieceId.split('-')[0], type: pieceId.split('-')[1][0], rating, actions, impact, notes: []});

test('ratings use 22 unique review slots and preserve missing/sent-off pieces without inventing scores', () => {
  const summary = {players: [{...player('white-P1', 7.8, 5, .5), sentOff: true}]};
  const before = structuredClone(summary), list = ratingsPitchPlayers(summary);
  assert.equal(list.length, 22); assert.equal(new Set(list.map(p => p.pieceId)).size, 22);
  for (const team of ['white', 'black']) {
    const own = list.filter(p => p.team === team);
    assert.equal(own.length, 11); assert.equal(new Set(own.map(p => `${p.x},${p.y}`)).size, 11);
    assert.ok(own.every(p => p.x > 0 && p.x < 100 && p.y > 0 && p.y < 100));
  }
  assert.equal(list.find(p => p.pieceId === 'white-P1').rating, 7.8);
  assert.equal(list.find(p => p.pieceId === 'white-P1').sentOff, true);
  assert.equal(list.find(p => p.pieceId === 'black-Q').rating, null);
  assert.deepEqual(summary, before);
});

test('a capable pawn can win the award and quiet or briefly involved pieces cannot take it', () => {
  const list = ratingsPitchPlayers({players: [player('white-Q', 7.5, 9, 2), player('white-P1', 8.2, 5, 1), player('black-K', 9, 1, 1)]});
  assert.equal(ratingsPlayerOfMatch(list).pieceId, 'white-P1');
  assert.equal(ratingsPlayerOfMatch(ratingsPitchPlayers({players: [player('white-Q', 6, 10)]})), null);
});

test('renderer exposes both pitches, all stable IDs and numeric ratings through real button semantics', () => {
  const root = new Element('section', document);
  renderPlayerRatings(root, {players: [player('white-P1', 8.2, 5, 1), player('black-Q', 6.5, 4, .2)]});
  const nodes = descendants(root), buttons = nodes.filter(n => n.tagName === 'button');
  assert.equal(buttons.length, 22); assert.ok(buttons.every(n => n.type === 'button' && n.listeners.click));
  assert.equal(nodes.filter(n => n.attrs.role === 'group').length, 2);
  const pawn = buttons.find(n => n.dataset.pieceId === 'white-P1');
  assert.match(pawn.attrs['aria-label'], /Ivory FC Pawn P1, 8\.2 out of 10/);
  assert.equal(pawn.attrs['aria-pressed'], 'true');
  assert.match(text(root), /Player of the match/); assert.match(text(root), /Lineup positions are arranged for review, not the final squares/);
});

test('selecting another player replaces its detail and active state without treating notes as HTML', () => {
  const root = new Element('section', document);
  renderPlayerRatings(root, {players: [player('white-P1', 8, 5, 1), {...player('black-Q', 5.8, 6, .4), notes: ['<img src=x onerror=alert(1)>']}]});
  const buttons = descendants(root).filter(n => n.tagName === 'button');
  const queen = buttons.find(n => n.dataset.pieceId === 'black-Q'); queen.listeners.click();
  assert.equal(queen.attrs['aria-pressed'], 'true');
  assert.equal(buttons.find(n => n.dataset.pieceId === 'white-P1').attrs['aria-pressed'], 'false');
  const detail = descendants(root).find(n => n.className === 'player-ratings-detail');
  assert.match(text(detail), /Obsidian FC · Queen Q/); assert.match(text(detail), /<img src=x onerror=alert\(1\)>/);
  assert.equal(descendants(detail).some(n => n.tagName === 'img'), false);
});

test('partial history is labelled and a second render clears the previous lineup and award', () => {
  const root = new Element('section', document);
  renderPlayerRatings(root, {partial: true, players: [player('white-P2', 8.2, 3, .5)]});
  assert.match(text(root), /Partial ratings/); assert.match(text(root), /Top recorded rating/); assert.doesNotMatch(text(root), /Player of the match/);
  renderPlayerRatings(root, {players: []});
  assert.equal(descendants(root).filter(n => n.tagName === 'button').length, 22);
  assert.doesNotMatch(text(root), /Top recorded rating/); assert.match(text(root), /No performance record/);
});

test('actual goals and assists appear beside ratings with counts, a legend and accessible explanations', () => {
  const root = new Element('section', document), summary = {players: [
    {...player('white-P1', 8, 5, .5), goals: 3, assists: 2},
    {...player('black-Q', 7, 4, .3), goals: 1, assists: 1},
  ]};
  const before = structuredClone(summary);
  renderPlayerRatings(root, summary);
  const nodes = descendants(root), buttons = nodes.filter(n => n.tagName === 'button');
  const pawn = buttons.find(n => n.dataset.pieceId === 'white-P1');
  assert.match(pawn.attrs['aria-label'], /3 goals, 2 assists/);
  const line = descendants(pawn).find(n => n.className === 'player-rating-score-line');
  assert.ok(line.children.some(n => n.className.startsWith('player-rating-score ')));
  assert.deepEqual(line.children.filter(n => n.className.startsWith('player-rating-contribution ')).map(n => n.attrs.title), ['3 goals', '2 assists']);
  assert.deepEqual(descendants(line).filter(n => n.className === 'player-rating-contribution-count').map(n => n.textContent), ['3', '2']);
  assert.equal(descendants(line).filter(n => n.tagName === 'svg').length, 1, 'the assist has a boot icon');
  const queen = buttons.find(n => n.dataset.pieceId === 'black-Q');
  assert.match(queen.attrs['aria-label'], /1 goal, 1 assist/);
  assert.equal(descendants(queen).filter(n => n.className === 'player-rating-contribution-count').length, 0, 'one contribution needs only its icon');
  const untouched = buttons.find(n => n.dataset.pieceId === 'black-P3');
  assert.equal(descendants(untouched).filter(n => n.className.startsWith('player-rating-contribution ')).length, 0);
  assert.match(text(root), /Goals.*Assists.*Recorded match contributions/);
  const detail = descendants(root).find(n => n.className === 'player-ratings-detail');
  assert.match(text(detail), /3 goals · 2 assists/);
  assert.deepEqual(summary, before);
});

test('icons use supplied recorded counts even with partial ratings, and malformed counts never invent a contribution', () => {
  const players = ratingsPitchPlayers({players: [
    {...player('white-R1'), goals: -1, assists: 1.4},
    {...player('white-R2'), goals: '2', assists: Infinity},
    {...player('black-B1'), goals: 101, assists: 0},
  ]});
  assert.ok(players.filter(p => p.team === 'white').every(p => p.goals === 0 && p.assists === 0));
  const root = new Element('section', document);
  renderPlayerRatings(root, {partial: true, players: [{...player('black-B1'), goals: 101, assists: 0}]});
  const bishop = descendants(root).find(n => n.tagName === 'button' && n.dataset.pieceId === 'black-B1');
  assert.match(bishop.attrs['aria-label'], /101 goals/);
  assert.equal(descendants(bishop).find(n => n.className === 'player-rating-contribution-count').textContent, '99+');
  assert.match(text(root), /Partial ratings/);
});

test('earlier rating methods are labelled without treating a complete match as partial', () => {
  const root = new Element('section', document);
  renderPlayerRatings(root, {legacyMethod: true, partial: false, players: [{...player('white-P1', 7.5, 5, .5), goals: 2}]});
  assert.match(text(root), /These saved ratings use the earlier method/);
  assert.match(text(root), /New matches use the updated ability-relative ratings/);
  assert.doesNotMatch(text(root), /Partial ratings/);
  assert.match(text(root), /Player of the match/);
  renderPlayerRatings(root, {methodVersion: 2, legacyMethod: false, players: []});
  assert.doesNotMatch(text(root), /earlier method/);
});

test('selecting any outfield player shows their recorded map; switching to a keeper removes it', () => {
  const root = new Element('section', document), heatmaps = createPlayerHeatmaps();
  heatmaps.players['white-P1'] = {'118': 3000, '132': 1000};
  heatmaps.players['black-Q'] = {'212': 2000};
  renderPlayerRatings(root, {players: [player('white-P1', 8, 5, 1)]}, heatmaps);
  const buttons = descendants(root).filter(n => n.tagName === 'button');
  for (const button of buttons) {
    button.listeners.click();
    const maps = descendants(root).filter(n => n.className === 'player-heatmap');
    assert.equal(maps.length, button.dataset.pieceId.endsWith('-K') ? 0 : 1);
  }
  buttons.find(n => n.dataset.pieceId === 'white-P1').listeners.click();
  assert.match(text(root), /0m 4s recorded · 2 squares/);
  assert.match(text(root), /g9 · 0m 3s · 75.0%/);
  buttons.find(n => n.dataset.pieceId === 'black-Q').listeners.click();
  const svg = descendants(root).find(n => n.attrs.class === 'player-heatmap-pitch');
  assert.match(svg.attrs['aria-label'], /black-Q heatmap, attacking upwards/);
  const cell = descendants(svg).find(n => n.attrs['data-square'] === 'c2');
  assert.equal(cell.attrs.x, '11'); assert.equal(cell.attrs.y, '1');
  assert.doesNotMatch(text(root), /75.0%/);
  buttons.find(n => n.dataset.pieceId === 'black-K').listeners.click();
  assert.equal(descendants(root).some(n => n.className === 'player-heatmap'), false);
});

test('missing and partial heatmaps are labelled, and a new report clears the previous map', () => {
  const root = new Element('section', document), summary = {players: [player('white-P1', 8, 5, 1)]};
  renderPlayerRatings(root, summary);
  assert.match(text(root), /No heatmap was recorded for this player/);
  assert.equal(descendants(root).some(n => n.attrs.class === 'player-heatmap-pitch'), false);
  const heatmaps = createPlayerHeatmaps({partial: true});heatmaps.players['white-P1'] = {'118': 3000};
  renderPlayerRatings(root, summary, heatmaps);
  assert.match(text(root), /Partial heatmap/);assert.match(text(root), /0m 3s recorded/);
  renderPlayerRatings(root, summary, createPlayerHeatmaps());
  assert.doesNotMatch(text(root), /Partial heatmap|0m 3s recorded/);
  assert.match(text(root), /No active playing time was recorded/);
});
