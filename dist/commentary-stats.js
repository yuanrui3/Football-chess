/** Match-stat commentary from the public recorded summary, never AI estimates. */
const TEAMS = ['white', 'black'];
const words = ['zero','one','two','three','four','five','six','seven','eight','nine','ten',
  'eleven','twelve','thirteen','fourteen','fifteen','sixteen','seventeen','eighteen','nineteen'];
function numberWords(value) {
  if (value < 20) return words[value];
  if (value === 100) return 'one hundred';
  const tens = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
  return tens[Math.floor(value / 10)] + (value % 10 ? ' ' + words[value % 10] : '');
}
const scripts = {};
for (const team of TEAMS) {
  const name=team==='white' ? 'Ivory' : 'Obsidian';
  for (let shots = 0; shots <= 30; shots++) {
    scripts[`stat_shots_${team}_${shots}`] = {text:`${name} have taken ${numberWords(shots)} ${shots === 1 ? 'shot' : 'shots'} so far.`, delivery:'normal'};
  }
  scripts[`stat_shots_${team}_over30`] = {text:`${name} have taken more than thirty shots so far.`, delivery:'normal'};
  for (let percent = 0; percent <= 100; percent += 5) {
    scripts[`stat_possession_${team}_${percent}`] = {text:`${name} have had about ${numberWords(percent)} percent of the ball.`, delivery:'normal'};
  }
}
export const STAT_COMMENTARY_SCRIPTS = Object.freeze(Object.fromEntries(Object.entries(scripts)
  .map(([key,value]) => [key,Object.freeze(value)])));

const count = value => Number.isInteger(value) && value >= 0;
const duration = value => Number.isFinite(value) && value >= 0;
const percentage = value => Number.isFinite(value) && value >= 0 && value <= 100;
const activeState = state => state && TEAMS.includes(state.attack) && !state.restart && !state.pendingShot
  && ['attackMove','defendMove','kick','passRun'].includes(state.phase);

/** Exact statistics remain attached for the context label. Prepared possession
 * speech rounds to five percentage points and explicitly says "about".
 * An incomplete restored record cannot masquerade as whole-match statistics.
 */
export function commentaryStatsLines(summary, state) {
  if (!activeState(state) || summary?.partial !== false || !summary.teams
      || !TEAMS.every(team => summary.teams[team])) return [];
  const output = [];
  function add(type, team, clipKey, metadata, rank) {
    const script = STAT_COMMENTARY_SCRIPTS[clipKey];
    if (!script) return;
    const key = `${type}:${team}`;
    const value = type === 'shots' ? metadata.shots : metadata.spokenPossessionPercent;
    output.push({kind:'trend',priority:1,text:script.text,delivery:script.delivery,clipKey,team,
      id:`stats:${key}:${value}`,statsCommentary:{type,key,team,rank,...metadata}});
  }
  for (const team of TEAMS) {
    const record = summary.teams[team];
    if (!count(record.shots) || !count(record.onTarget) || record.onTarget > record.shots) continue;
    const metadata = {shots:record.shots,onTarget:record.onTarget,
      possessionPercent:percentage(record.possessionPercent) ? record.possessionPercent : null};
    if (record.shots >= 3) add('shots',team,record.shots > 30 ? `stat_shots_${team}_over30` : `stat_shots_${team}_${record.shots}`,
      metadata,70+Math.min(30,record.shots)/100+(state.attack===team ? .001 : 0));
  }
  const total = TEAMS.reduce((sum,team) => sum+(duration(summary.teams[team].possessionMs) ? summary.teams[team].possessionMs : NaN),0);
  const validPossession = total >= 60000 && TEAMS.every(team => {
    const record=summary.teams[team];
    return percentage(record.possessionPercent)
      && Math.abs(record.possessionPercent-record.possessionMs/total*100)<1e-7;
  });
  if (validPossession) {
    // One side describes the shared possession split; don't announce its
    // complementary percentage as a separate update moments later.
    const white=summary.teams.white.possessionPercent,black=summary.teams.black.possessionPercent;
    const team=white===black ? state.attack : white>black ? 'white' : 'black',record=summary.teams[team];
    const spokenPossessionPercent=Math.max(0,Math.min(100,Math.round(record.possessionPercent/5)*5));
    add('possession',team,`stat_possession_${team}_${spokenPossessionPercent}`,
      {shots:count(record.shots) ? record.shots : null,onTarget:count(record.onTarget) ? record.onTarget : null,
        possessionPercent:record.possessionPercent,spokenPossessionPercent,totalPossessionMs:total},55);
  }
  return output.sort((a,b) => b.statsCommentary.rank-a.statsCommentary.rank || a.team.localeCompare(b.team));
}
