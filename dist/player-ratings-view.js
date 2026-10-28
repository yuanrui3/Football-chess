/** End-of-match ratings review. This is a lineup diagram, not final locations. */
const TEAMS = ['white', 'black'];
const TEAM_NAMES = {white: 'Ivory FC', black: 'Obsidian FC'};
const NAMES = {K: 'Goalkeeper', Q: 'Queen', R: 'Rook', B: 'Bishop', N: 'Knight', P: 'Pawn'};
const SYMBOLS = {K: '♚', Q: '♛', R: '♜', B: '♝', N: '♞', P: '♟'};
const SLOTS = [
  ['K', 50, 90],
  ['R1', 18, 71], ['P1', 50, 71], ['R2', 82, 71],
  ['B1', 18, 51], ['P2', 50, 51], ['B2', 82, 51],
  ['N1', 18, 31], ['P3', 50, 31], ['N2', 82, 31],
  ['Q', 50, 11],
];
const number = value => Number.isFinite(value) ? value : 0;
const ratingText = value => Number.isFinite(value) ? value.toFixed(1) : '—';
const signed = value => `${value >= 0 ? '+' : '−'}${Math.abs(value).toFixed(2)}`;
const ratingBand = value => !Number.isFinite(value) ? 'unrated' : value >= 8 ? 'excellent' : value >= 7 ? 'strong' : value < 5.5 ? 'low' : 'steady';

/** Stable, collision-free review slots, including sent-off or unrecorded pieces. */
export function ratingsPitchPlayers(summary = {}) {
  const records = new Map((Array.isArray(summary.players) ? summary.players : [])
    .filter(player => player && typeof player.pieceId === 'string')
    .map(player => [player.pieceId, player]));
  return TEAMS.flatMap(team => SLOTS.map(([shortId, x, y]) => {
    const pieceId = `${team}-${shortId}`, record = records.get(pieceId);
    return {
      pieceId, shortId, team, x, y,
      type: NAMES[record?.type] ? record.type : shortId[0],
      rating: Number.isFinite(record?.rating) ? Math.max(1, Math.min(10, record.rating)) : null,
      impact: number(record?.impact), actions: Math.max(0, Math.floor(number(record?.actions))),
      notes: Array.isArray(record?.notes) ? record.notes.filter(note => typeof note === 'string') : [],
      sentOff: record?.sentOff === true,
    };
  }));
}

/** Quiet baseline ratings do not win an individual award. */
export function ratingsPlayerOfMatch(players) {
  return players.filter(player => Number.isFinite(player.rating) && player.rating >= 6.5 && player.actions >= 3)
    .sort((a, b) => b.rating - a.rating || b.impact - a.impact || b.actions - a.actions || a.pieceId.localeCompare(b.pieceId))[0] || null;
}

export function renderPlayerRatings(container, summary = {}) {
  if (!container) return;
  const document = container.ownerDocument;
  const make = (tag, className, text, parent = container) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    parent.append(node);
    return node;
  };
  container.replaceChildren();
  container.classList.add('player-ratings');
  container.setAttribute('aria-label', 'End-of-match player ratings');
  const players = ratingsPitchPlayers(summary), best = ratingsPlayerOfMatch(players);
  make('h3', 'player-ratings-title', 'Player ratings');
  make('p', 'player-ratings-intro', 'Out of 10, relative to each piece’s abilities. 6.0 is the starting rating; quiet pieces stay near it.');
  if (summary.partial) make('p', 'player-ratings-partial', 'Partial ratings: only actions recorded since this update are included.');
  if (best) {
    const award = make('p', 'player-ratings-award');
    make('span', 'player-ratings-award-star', '★', award).setAttribute('aria-hidden', 'true');
    make('span', '', `${summary.partial ? 'Top recorded rating' : 'Player of the match'} · ${TEAM_NAMES[best.team]} · ${best.shortId}`, award);
    make('strong', '', ratingText(best.rating), award);
  }
  const pitches = make('div', 'player-ratings-pitches');
  const buttons = new Map();
  let selectedButton = null;
  const detail = document.createElement('div');
  detail.className = 'player-ratings-detail';
  detail.setAttribute('aria-live', 'polite');
  detail.setAttribute('aria-atomic', 'true');
  const select = player => {
    selectedButton?.setAttribute('aria-pressed', 'false');
    selectedButton = buttons.get(player.pieceId);
    selectedButton?.setAttribute('aria-pressed', 'true');
    detail.replaceChildren();
    const heading = make('div', 'player-ratings-detail-heading', undefined, detail);
    make('h4', '', `${TEAM_NAMES[player.team]} · ${NAMES[player.type]} ${player.shortId}`, heading);
    make('strong', `player-rating-score ${ratingBand(player.rating)}`, ratingText(player.rating), heading);
    make('p', 'player-ratings-detail-meta', Number.isFinite(player.rating)
      ? `Impact ${signed(player.impact)} · ${player.actions} recorded action${player.actions === 1 ? '' : 's'}${player.sentOff ? ' · Sent off' : ''}`
      : 'No performance record is available for this piece.', detail);
    const notes = make('ul', 'player-ratings-detail-notes', undefined, detail);
    for (const note of player.notes.length ? player.notes : [player.actions ? 'Rating accounts for this piece’s recorded contributions and native abilities.' : 'Limited involvement. No extra credit for an unused piece.']) make('li', '', note, notes);
    make('p', 'player-ratings-impact-note', 'Impact shows the contribution before adjustment for piece abilities. Ratings are a game heuristic.', detail);
  };
  for (const team of TEAMS) {
    const panel = make('section', `player-ratings-team ${team}`, undefined, pitches);
    const heading = make('h4', 'player-ratings-team-name', undefined, panel);
    make('span', `stats-team-dot ${team}`, undefined, heading).setAttribute('aria-hidden', 'true');
    make('span', '', TEAM_NAMES[team], heading);
    make('p', 'player-ratings-direction', 'REVIEW LINEUP · ATTACKS ↑', panel);
    const pitch = make('div', 'player-ratings-pitch', undefined, panel);
    pitch.setAttribute('role', 'group');
    pitch.setAttribute('aria-label', `${TEAM_NAMES[team]} ratings pitch`);
    const markings = make('div', 'player-ratings-markings', undefined, pitch);
    markings.setAttribute('aria-hidden', 'true');
    make('span', 'ratings-box top', undefined, markings);
    make('span', 'ratings-box bottom', undefined, markings);
    make('span', 'ratings-centre', undefined, markings);
    for (const player of players.filter(player => player.team === team)) {
      const button = make('button', `player-rating-piece ${team}${player.sentOff ? ' sent-off' : ''}${player.pieceId === best?.pieceId ? ' player-of-match' : ''}`, undefined, pitch);
      button.type = 'button';
      button.dataset.pieceId = player.pieceId;
      button.style.left = `${player.x}%`;
      button.style.top = `${player.y}%`;
      button.setAttribute('aria-pressed', 'false');
      button.setAttribute('aria-label', `${TEAM_NAMES[team]} ${NAMES[player.type]} ${player.shortId}, ${Number.isFinite(player.rating) ? `${ratingText(player.rating)} out of 10` : 'rating unavailable'}${player.sentOff ? ', sent off' : ''}${player.pieceId === best?.pieceId ? `, ${summary.partial ? 'top recorded rating' : 'player of the match'}` : ''}. Show rating details.`);
      const identity = make('span', 'player-rating-identity', undefined, button);
      make('span', 'player-rating-symbol', SYMBOLS[player.type], identity).setAttribute('aria-hidden', 'true');
      make('span', 'player-rating-id', player.shortId, identity);
      make('strong', `player-rating-score ${ratingBand(player.rating)}`, ratingText(player.rating), button);
      if (player.sentOff) make('span', 'player-rating-dismissal', 'OFF', button);
      else if (player.pieceId === best?.pieceId) make('span', 'player-rating-best', '★', button).setAttribute('aria-hidden', 'true');
      button.addEventListener('click', () => select(player));
      buttons.set(player.pieceId, button);
    }
  }
  make('p', 'player-ratings-lineup-note', 'Lineup positions are arranged for review, not the final squares. Select a piece to see its contribution.');
  container.append(detail);
  select(best || [...players].sort((a, b) => b.actions - a.actions || a.pieceId.localeCompare(b.pieceId))[0]);
}
