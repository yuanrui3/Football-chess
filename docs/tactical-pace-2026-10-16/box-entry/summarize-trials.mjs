import fs from 'node:fs';
const dir=new URL('.',import.meta.url);
const full=process.argv.includes('--full');
const white=JSON.parse(fs.readFileSync(new URL(full?'white-comparison-480.json':'white-comparison.json',dir),'utf8'));
const black=JSON.parse(fs.readFileSync(new URL(full?'black-comparison-480.json':'black-comparison.json',dir),'utf8'));
function normalize(which,row){return{
 seed:row.seed??202610162,kickoff:row.kickoff??'black',actions:row.actions,score:row.score,
 shots:row.shots,resolvedShots:row.resolvedShots,pendingShots:row.pendingShots??row.shots-row.resolvedShots,
 xG:row.postReactionXG??row.xG,queenShots:row.queenShots??row.roles?.Q?.shots??0,
 queenGoals:row.queenGoals??row.roles?.Q?.goals??0,queenXG:row.queenXG??row.roles?.Q?.xG??0,
 entries:row.boxEntries??row.entries??[],variant:which};}
const matches=['reference','trial'].map(which=>({variant:which,matches:[normalize(which,white[which]),normalize(which,black[which])]}));
for(const group of matches){
 const m=group.matches,which=group.variant;
 group.totals={actions:m.reduce((n,x)=>n+x.actions,0),goals:m.reduce((n,x)=>n+x.score.white+x.score.black,0),
  shots:m.reduce((n,x)=>n+x.shots,0),resolvedShots:m.reduce((n,x)=>n+x.resolvedShots,0),pendingShots:m.reduce((n,x)=>n+x.pendingShots,0),
  postReactionXG:m.reduce((n,x)=>n+x.xG,0),queenShots:m.reduce((n,x)=>n+x.queenShots,0),queenGoals:m.reduce((n,x)=>n+x.queenGoals,0),
  queenXG:m.reduce((n,x)=>n+x.queenXG,0)};
 const entries=m.flatMap(x=>x.entries);
 group.totals.entries=entries.length;
 group.totals.entriesByType=entries.reduce((counts,e)=>(counts[e.type]=(counts[e.type]||0)+1,counts),{});
 group.totals.queenShotShare=group.totals.queenShots/group.totals.shots;
 group.totals.shotsByType={};
 for(const match of m){
  const raw=match.seed===202610161?white[which].shotOutcomes:black[which].resolutions;
  for(const shot of raw){const type=shot.shooterId?.split('-')[1][0]??shot.type;group.totals.shotsByType[type]=(group.totals.shotsByType[type]||0)+1;}
 }
}
const report={engineSha256:'cf82976a68525fed680e85f60c483b022086f871c60ab39125d550974f940fc2',
 productionEngineSha256:'db24debe7605f7c12f0734a4e4024553da2cd5acdeadcc420541a436789570d4',groups:matches,
 verdict:'Promising small trial: greater combined chance creation and no observed queen shot monopoly. Two matched action-budget games cannot establish long-term piece or attack-defense balance.',
 caveats:[`Matched${full?480:240} atomic actions per game, not timed full matches.`,
  'Goal scorer shares are unstable in this small two-match sample.',
  'Entry counts include crossing through a box and exiting in the same carrying move.',
  'Pending attempts, if present, are reported separately and excluded from resolved xG.']};
fs.writeFileSync(new URL(full?'trial-comparison-480.json':'trial-comparison.json',dir),JSON.stringify(report,null,2));
process.stdout.write(JSON.stringify(report,null,2)+'\n');
