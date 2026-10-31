/** Time on actual occupied squares, separate from lineup and rating positions. */
import {BOARD_WIDTH, BOARD_HEIGHT, BOX_FILES, BOX_DEPTH} from './engine.js?v=663af4ea26d5';

const outfieldId = id => typeof id === 'string' && /^(white|black)-(Q|[RBN][12]|P[123])$/.test(id);
const positive = value => Number.isFinite(value) && value > 0;
const validCell = key => /^(0|[1-9]\d*)$/.test(key) && Number(key) < BOARD_WIDTH * BOARD_HEIGHT;
export function createPlayerHeatmaps({partial = false} = {}) {
  return {version: 1, width: BOARD_WIDTH, height: BOARD_HEIGHT, partial: !!partial, players: {}};
}

export function restorePlayerHeatmaps(saved, {partial = true} = {}) {
  const fallback = () => createPlayerHeatmaps({partial});
  if (saved?.version !== 1 || saved.width !== BOARD_WIDTH || saved.height !== BOARD_HEIGHT || typeof saved.partial !== 'boolean'
      || !saved.players || typeof saved.players !== 'object' || Array.isArray(saved.players)) return fallback();
  const restored = createPlayerHeatmaps({partial: saved.partial});
  for (const [id, cells] of Object.entries(saved.players)) {
    if (!outfieldId(id) || !cells || typeof cells !== 'object' || Array.isArray(cells)
        || !Object.entries(cells).every(([key, ms]) => validCell(key) && positive(ms))
        || !Number.isFinite(Object.values(cells).reduce((sum, ms) => sum + ms, 0))) return fallback();
    restored.players[id] = {...cells};
  }
  return restored;
}

/** Caller supplies active clock time only; never sample animations or replays. */
export function addPlayerHeatmapTime(record, game, elapsedMs) {
  if (!positive(elapsedMs) || !game || game.restart || ['kickoff', 'finished'].includes(game.phase)) return record;
  const next = record ? {...record, players: {...record.players}} : createPlayerHeatmaps({partial: true});
  for (const piece of game.pieces || []) {
    if (!outfieldId(piece.id) || piece.type === 'K' || !Number.isInteger(piece.x) || !Number.isInteger(piece.y)
        || piece.x < 0 || piece.x >= BOARD_WIDTH || piece.y < 0 || piece.y >= BOARD_HEIGHT) continue;
    const key = piece.y * BOARD_WIDTH + piece.x, cells = next.players[piece.id] || {};
    next.players[piece.id] = {...cells, [key]: (cells[key] || 0) + elapsedMs};
  }
  return next;
}

export function playerHeatmapSummary(record, pieceId) {
  if (!outfieldId(pieceId)) return null;
  const data = restorePlayerHeatmaps(record), values = data.players[pieceId] || {};
  const totalMs = Object.values(values).reduce((sum, ms) => sum + ms, 0);
  const maximum = Math.max(0, ...Object.values(values)), rotated = pieceId.startsWith('black-');
  const cells = Object.entries(values).map(([key, ms]) => {
    const x = Number(key) % BOARD_WIDTH, y = Math.floor(Number(key) / BOARD_WIDTH);
    return {x: rotated ? BOARD_WIDTH - 1 - x : x, y: rotated ? BOARD_HEIGHT - 1 - y : y,
      square: `${String.fromCharCode(97 + x)}${BOARD_HEIGHT - y}`, ms, share: ms / totalMs, intensity: ms / maximum};
  }).sort((a, b) => b.ms - a.ms || a.square.localeCompare(b.square));
  return {partial: data.partial, totalMs, cells};
}

const timeText = ms => ms < 1000 ? '<1s' : `${Math.floor(ms / 60000)}m ${Math.floor(ms / 1000) % 60}s`;
export function renderPlayerHeatmap(container, record, pieceId) {
  const summary = playerHeatmapSummary(record, pieceId);
  if (!summary) return;
  const document = container.ownerDocument;
  const make = (tag, className, text, parent = container) => {
    const node = document.createElement(tag); node.className = className;
    if (text !== undefined) node.textContent = text;
    parent.append(node); return node;
  };
  const panel = make('section', 'player-heatmap');
  panel.setAttribute('aria-label', `${pieceId} heatmap`);
  make('h5', 'player-heatmap-title', 'Heatmap · time on each square', panel);
  if (!summary.totalMs) {
    make('p', 'player-heatmap-empty', summary.partial
      ? 'No heatmap was recorded for this player. Heatmaps are available for play recorded after this update.'
      : 'No active playing time was recorded for this player.', panel);
    return;
  }
  if (summary.partial) make('p', 'player-heatmap-partial', 'Partial heatmap: only play recorded since this update is included.', panel);
  const layout = make('div', 'player-heatmap-layout', undefined, panel);
  const figure = make('div', 'player-heatmap-figure', undefined, layout);
  make('p', 'player-heatmap-direction', 'ATTACKS ↑', figure);
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `-0.15 -0.15 ${BOARD_WIDTH + .3} ${BOARD_HEIGHT + .3}`);
  svg.setAttribute('class', 'player-heatmap-pitch'); svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', `${pieceId} heatmap, attacking upwards. ${summary.cells.length} occupied square${summary.cells.length === 1 ? '' : 's'} in ${timeText(summary.totalMs)} of recorded active play.`);
  figure.append(svg);
  const draw = (tag, attrs, text, parent = svg) => {
    const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
    if (text !== undefined) node.textContent = text;
    parent.append(node); return node;
  };
  draw('rect', {width: BOARD_WIDTH, height: BOARD_HEIGHT, fill: '#254d3b'});
  for (const cell of summary.cells) {
    const rect = draw('rect', {x: cell.x, y: cell.y, width: 1, height: 1, 'data-square': cell.square,
      fill: `hsl(${Math.round(55 * (1 - cell.intensity))} 92% ${Math.round(75 - 30 * cell.intensity)}%)`});
    draw('title', {}, `${cell.square}: ${timeText(cell.ms)} · ${(cell.share * 100).toFixed(1)}%`, rect);
  }
  const grid = [...Array(BOARD_WIDTH - 1)].map((_, i) => `M${i + 1} 0V${BOARD_HEIGHT}`)
    .concat([...Array(BOARD_HEIGHT - 1)].map((_, i) => `M0 ${i + 1}H${BOARD_WIDTH}`)).join(' ');
  draw('path', {d: grid, fill: 'none', stroke: '#ffffff', 'stroke-width': .025, opacity: .2});
  const markings = draw('g', {fill: 'none', stroke: '#f1f4d5', 'stroke-width': .06, 'pointer-events': 'none'});
  draw('rect', {width: BOARD_WIDTH, height: BOARD_HEIGHT}, undefined, markings);
  draw('path', {d: `M0 ${BOARD_HEIGHT / 2}H${BOARD_WIDTH}`}, undefined, markings);
  draw('circle', {cx: BOARD_WIDTH / 2, cy: BOARD_HEIGHT / 2, r: 1.7}, undefined, markings);
  for (const y of [0, BOARD_HEIGHT - BOX_DEPTH]) draw('rect', {x: BOX_FILES[0], y, width: BOX_FILES.length, height: BOX_DEPTH}, undefined, markings);
  const info = make('div', 'player-heatmap-info', undefined, layout);
  make('p', 'player-heatmap-total', `${timeText(summary.totalMs)} recorded · ${summary.cells.length} square${summary.cells.length === 1 ? '' : 's'}`, info);
  const legend = make('div', 'player-heatmap-legend', undefined, info);
  make('span', '', 'Less time', legend); make('i', '', undefined, legend).setAttribute('aria-hidden', 'true'); make('span', '', 'More time', legend);
  make('h6', '', 'Most-used squares', info);
  const list = make('ol', 'player-heatmap-squares', undefined, info);
  for (const cell of summary.cells.slice(0, 3)) make('li', '', `${cell.square} · ${timeText(cell.ms)} · ${(cell.share * 100).toFixed(1)}%`, list);
  make('p', 'player-heatmap-note', 'Actual occupied squares, with this team attacking up. Labels use original pitch coordinates. Colours are scaled to this player’s busiest square; green means no recorded time.', info);
  make('p', 'player-heatmap-note', 'Pauses, replays, shot animations, kickoff and restart preparation are excluded.', panel);
}
