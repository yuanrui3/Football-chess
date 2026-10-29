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
const count = value => Number.isSafeInteger(value) && value >= 0 ? value : 0;
const contributionLabel = (value, noun) => `${value} ${noun}${value === 1 ? '' : 's'}`;
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
      goals: count(record?.goals), assists: count(record?.assists),
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
  const boot = parent => {
    const ns = 'http://www.w3.org/2000/svg', svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 24 20');
    svg.setAttribute('class', 'player-rating-boot');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    const path = document.createElementNS(ns, 'path');
    path.setAttribute('d', 'M3 2h7l1.4 5 4 2.5 5 1.3q1.6 .4 1.6 2.2v2H2v-4.5l1-2Z M8 5h3 M9 7h3 M11 9l2-1 M5 15v2 M10 15v2 M17 15v2 M21 15v2');
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', 'currentColor');
    path.setAttribute('stroke-width', '1.6');
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round');
    svg.append(path); parent.append(svg); return svg;
  };
  const contributionIcon = (parent, kind, value) => {
    const label = contributionLabel(value, kind === 'goals' ? 'goal' : 'assist');
    const badge = make('span', `player-rating-contribution ${kind}`, undefined, parent);
    badge.setAttribute('title', label);
    badge.setAttribute('aria-hidden', 'true');
    if (kind === 'goals') make('span', 'player-rating-ball', '⚽', badge);
    else boot(badge);
    if (value > 1) make('span', 'player-rating-contribution-count', value > 99 ? '99+' : String(value), badge);
  };
  container.replaceChildren();
  container.classList.add('player-ratings');
  container.setAttribute('aria-label', 'End-of-match player ratings');
  const players = ratingsPitchPlayers(summary), best = ratingsPlayerOfMatch(players);
  make('h3', 'player-ratings-title', 'Player ratings');
  make('p', 'player-ratings-intro', 'Out of 10, relative to each piece’s abilities. 6.0 is the starting rating; quiet pieces stay near it.');
  const legend = make('p', 'player-ratings-contribution-legend');
  const goalLegend = make('span', '', undefined, legend);
  make('span', 'player-rating-ball', '⚽', goalLegend).setAttribute('aria-hidden', 'true');
  make('span', '', 'Goals', goalLegend);
  const assistLegend = make('span', '', undefined, legend); boot(assistLegend);
  make('span', '', 'Assists', assistLegend);
  make('span', 'player-ratings-recorded-note', 'Recorded match contributions', legend);
  if (summary.legacyMethod) make('p', 'player-ratings-legacy', 'These ratings use the earlier method. Start a new match for updated ability-relative ratings.');
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
    if (player.goals || player.assists) make('p', 'player-ratings-detail-contributions',
      [player.goals ? contributionLabel(player.goals, 'goal') : '', player.assists ? contributionLabel(player.assists, 'assist') : ''].filter(Boolean).join(' · '), detail);
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
      const button = make('button', `player-rating-piece ${team}${player.goals || player.assists ? ' has-contributions' : ''}${player.sentOff ? ' sent-off' : ''}${player.pieceId === best?.pieceId ? ' player-of-match' : ''}`, undefined, pitch);
      button.type = 'button';
      button.dataset.pieceId = player.pieceId;
      button.style.left = `${player.x}%`;
      button.style.top = `${player.y}%`;
      button.setAttribute('aria-pressed', 'false');
      button.setAttribute('aria-label', `${TEAM_NAMES[team]} ${NAMES[player.type]} ${player.shortId}, ${Number.isFinite(player.rating) ? `${ratingText(player.rating)} out of 10` : 'rating unavailable'}${player.goals ? `, ${contributionLabel(player.goals, 'goal')}` : ''}${player.assists ? `, ${contributionLabel(player.assists, 'assist')}` : ''}${player.sentOff ? ', sent off' : ''}${player.pieceId === best?.pieceId ? `, ${summary.partial ? 'top recorded rating' : 'player of the match'}` : ''}. Show rating details.`);
      const identity = make('span', 'player-rating-identity', undefined, button);
      make('span', 'player-rating-symbol', SYMBOLS[player.type], identity).setAttribute('aria-hidden', 'true');
      make('span', 'player-rating-id', player.shortId, identity);
      const scoreLine = make('span', 'player-rating-score-line', undefined, button);
      make('strong', `player-rating-score ${ratingBand(player.rating)}`, ratingText(player.rating), scoreLine);
      if (player.goals) contributionIcon(scoreLine, 'goals', player.goals);
      if (player.assists) contributionIcon(scoreLine, 'assists', player.assists);
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
