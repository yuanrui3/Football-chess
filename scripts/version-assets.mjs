import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const asset=name=>path.join(root,'dist',name);
const hash=text=>createHash('sha256').update(text).digest('hex').slice(0,12);
const engineVersion=hash(await readFile(asset('engine.js'),'utf8'));
let worker=await readFile(asset('ai-worker.js'),'utf8');
worker=worker.replace(/from ['"]\.\/engine\.js(?:\?v=[^'"]+)?['"]/,`from './engine.js?v=${engineVersion}'`);
await writeFile(asset('ai-worker.js'),worker);
const workerVersion=hash(worker);
let matchClock=await readFile(asset('match-clock.js'),'utf8');
matchClock=matchClock.replace(/from ['"]\.\/engine\.js(?:\?v=[^'"]+)?['"]/,`from './engine.js?v=${engineVersion}'`);
await writeFile(asset('match-clock.js'),matchClock);
const clockVersion=hash(matchClock);
async function versionEngineImport(name){
  let source=await readFile(asset(name),'utf8');
  source=source.replace(/from ['"]\.\/engine\.js(?:\?v=[^'"]+)?['"]/,`from './engine.js?v=${engineVersion}'`);
  await writeFile(asset(name),source);
  return hash(source);
}
const replayVersion=await versionEngineImport('goal-replay.js');
const playerRatingsVersion=await versionEngineImport('player-ratings.js');
const heatmapsVersion=await versionEngineImport('player-heatmaps.js');
const ratingsViewVersion=await versionImports('player-ratings-view.js',{'player-heatmaps.js':heatmapsVersion});
const ratingsCssVersion=hash(await readFile(asset('player-ratings.css'),'utf8'));
const statsVersion=await versionImports('match-stats.js',{'engine.js':engineVersion,'player-ratings.js':playerRatingsVersion,'player-heatmaps.js':heatmapsVersion});
const archiveStatsVersion=await versionImports('archive-statistics.js',{'match-stats.js':statsVersion});
const archiveVersion=await versionImports('match-archive.js',{'engine.js':engineVersion,'goal-replay.js':replayVersion,'archive-statistics.js':archiveStatsVersion});
const analysisVersion=await versionImports('match-analysis.js',{'engine.js':engineVersion,'match-stats.js':statsVersion});
const commentaryClipsVersion=hash(await readFile(asset('commentary-clips.js'),'utf8'));
const adamCommentaryVersion=hash(await readFile(asset('adam-commentary-clips.js'),'utf8'));
const hugoCommentaryVersion=hash(await readFile(asset('hugo-commentary-clips.js'),'utf8'));
const commentarySpatialVersion=await versionEngineImport('commentary-spatial.js');
const commentaryTacticsVersion=await versionEngineImport('commentary-tactics.js');
const commentaryStatsVersion=hash(await readFile(asset('commentary-stats.js'),'utf8'));
let commentary=await readFile(asset('commentary.js'),'utf8');
commentary=commentary.replace(/from ['"]\.\/adam-commentary-clips\.js(?:\?v=[^'"]+)?['"]/,`from './adam-commentary-clips.js?v=${adamCommentaryVersion}'`);
commentary=commentary.replace(/from ['"]\.\/commentary-clips\.js(?:\?v=[^'"]+)?['"]/,`from './commentary-clips.js?v=${commentaryClipsVersion}'`);
commentary=commentary.replace(/from ['"]\.\/hugo-commentary-clips\.js(?:\?v=[^'"]+)?['"]/,`from './hugo-commentary-clips.js?v=${hugoCommentaryVersion}'`);
commentary=commentary.replace(/from ['"]\.\/commentary-spatial\.js(?:\?v=[^'"]+)?['"]/,`from './commentary-spatial.js?v=${commentarySpatialVersion}'`);
commentary=commentary.replace(/from ['"]\.\/commentary-tactics\.js(?:\?v=[^'"]+)?['"]/,`from './commentary-tactics.js?v=${commentaryTacticsVersion}'`);
commentary=commentary.replace(/from ['"]\.\/commentary-stats\.js(?:\?v=[^'"]+)?['"]/,`from './commentary-stats.js?v=${commentaryStatsVersion}'`);
await writeFile(asset('commentary.js'),commentary);
const commentaryVersion=hash(commentary);
const paradeeWorkerVersion=hash(await readFile(asset('paradee-worker.js'),'utf8'));
let paradeeSpeech=await readFile(asset('paradee-speech.js'),'utf8');
paradeeSpeech=paradeeSpeech.replace(/['"]\.\/paradee-worker\.js(?:\?v=[^'"]+)?['"]/,`'./paradee-worker.js?v=${paradeeWorkerVersion}'`);
await writeFile(asset('paradee-speech.js'),paradeeSpeech);
const paradeeSpeechVersion=hash(paradeeSpeech);
// Training and analysis share the match engine. Version the dependency graph
// before its entry points so a deployed page never mixes cached rule versions.
async function versionImports(name, versions){
  let source=await readFile(asset(name),'utf8');
  for(const [dependency,version] of Object.entries(versions)){
    const escaped=dependency.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    source=source.replace(new RegExp(`(['"])\\./${escaped}(?:\\?v=[^'"]+)?\\1`,'g'),
      (_,quote)=>`${quote}./${dependency}?v=${version}${quote}`);
  }
  await writeFile(asset(name),source);
  return hash(source);
}
const evaluationWorkerVersion=await versionImports('evaluation-worker.js',{'engine.js':engineVersion});
const evaluationVersion=await versionImports('evaluation.js',{'engine.js':engineVersion,'evaluation-worker.js':evaluationWorkerVersion});
const mediumVersion=await versionImports('exercise-medium.js',{'engine.js':engineVersion});
const toughAttackVersion=await versionImports('exercise-tough-attack.js',{'engine.js':engineVersion});
const toughMixedVersion=await versionImports('exercise-tough-mixed.js',{'engine.js':engineVersion});
const toughDefenceVersion=await versionImports('exercise-tough-defence-extra.js',{'engine.js':engineVersion});
const midfieldVersion=await versionImports('exercise-midfield.js',{});
const midfieldGoalsVersion=await versionImports('exercise-midfield-goals.js',{'engine.js':engineVersion});
const positionsVersion=await versionImports('exercise-positions.js',{'engine.js':engineVersion,
  'exercise-medium.js':mediumVersion,'exercise-tough-attack.js':toughAttackVersion,
  'exercise-tough-mixed.js':toughMixedVersion,'exercise-tough-defence-extra.js':toughDefenceVersion,'exercise-midfield.js':midfieldVersion});
const sessionVersion=await versionImports('exercise-session.js',{'engine.js':engineVersion,'exercise-positions.js':positionsVersion,'exercise-midfield-goals.js':midfieldGoalsVersion});
const exerciseAiVersion=await versionImports('exercise-ai.js',{'engine.js':engineVersion});
const exerciseAiWorkerVersion=await versionImports('exercise-ai-worker.js',{'exercise-ai.js':exerciseAiVersion,'engine.js':engineVersion});
const solutionsVersion=hash(await readFile(asset('exercise-solutions.js'),'utf8'));
const solutionPlayerVersion=await versionImports('exercise-solution-player.js',{'engine.js':engineVersion,'exercise-session.js':sessionVersion,'exercise-ai.js':exerciseAiVersion});
const exercisesVersion=await versionImports('exercises-app.js',{'engine.js':engineVersion,'exercise-positions.js':positionsVersion,
  'exercise-midfield-goals.js':midfieldGoalsVersion,'exercise-session.js':sessionVersion,'evaluation.js':evaluationVersion,'exercise-ai.js':exerciseAiVersion,
  'exercise-ai-worker.js':exerciseAiWorkerVersion,'exercise-solutions.js':solutionsVersion,'exercise-solution-player.js':solutionPlayerVersion});
const exercisesCssVersion=hash(await readFile(asset('exercises.css'),'utf8'));
let app=await readFile(asset('app.js'),'utf8');
app=app.replace(/from ['"]\.\/engine\.js(?:\?v=[^'"]+)?['"]/,`from './engine.js?v=${engineVersion}'`);
app=app.replace(/['"]\.\/ai-worker\.js(?:\?v=[^'"]+)?['"]/,`'./ai-worker.js?v=${workerVersion}'`);
app=app.replace(/from ['"]\.\/match-clock\.js(?:\?v=[^'"]+)?['"]/,`from './match-clock.js?v=${clockVersion}'`);
app=app.replace(/from ['"]\.\/goal-replay\.js(?:\?v=[^'"]+)?['"]/,`from './goal-replay.js?v=${replayVersion}'`);
app=app.replace(/from ['"]\.\/match-archive\.js(?:\?v=[^'"]+)?['"]/,`from './match-archive.js?v=${archiveVersion}'`);
app=app.replace(/from ['"]\.\/match-analysis\.js(?:\?v=[^'"]+)?['"]/,`from './match-analysis.js?v=${analysisVersion}'`);
app=app.replace(/from ['"]\.\/match-stats\.js(?:\?v=[^'"]+)?['"]/,`from './match-stats.js?v=${statsVersion}'`);
app=app.replace(/from ['"]\.\/player-ratings\.js(?:\?v=[^'"]+)?['"]/,`from './player-ratings.js?v=${playerRatingsVersion}'`);
app=app.replace(/from ['"]\.\/player-ratings-view\.js(?:\?v=[^'"]+)?['"]/,`from './player-ratings-view.js?v=${ratingsViewVersion}'`);
app=app.replace(/from ['"]\.\/commentary\.js(?:\?v=[^'"]+)?['"]/,`from './commentary.js?v=${commentaryVersion}'`);
app=app.replace(/from ['"]\.\/paradee-speech\.js(?:\?v=[^'"]+)?['"]/,`from './paradee-speech.js?v=${paradeeSpeechVersion}'`);
app=app.replace(/from ['"]\.\/evaluation\.js(?:\?v=[^'"]+)?['"]/,`from './evaluation.js?v=${evaluationVersion}'`);
await writeFile(asset('app.js'),app);
const appVersion=hash(app),cssVersion=hash(await readFile(asset('style.css'),'utf8'));
// Keep the self-contained voice audition on the same cache-safe asset graph.
const auditionClipsVersion=hash(await readFile(asset('commentary-audition-clips.js'),'utf8'));
const auditionVersion=await versionImports('commentary-audition.js',{'commentary-audition-clips.js':auditionClipsVersion});
const auditionCssVersion=hash(await readFile(asset('commentary-audition.css'),'utf8'));
let auditionHtml=await readFile(asset('commentary-audition.html'),'utf8');
auditionHtml=auditionHtml.replace(/href="style\.css(?:\?v=[^"]+)?"/,`href="style.css?v=${cssVersion}"`)
  .replace(/href="commentary-audition\.css(?:\?v=[^"]+)?"/,`href="commentary-audition.css?v=${auditionCssVersion}"`)
  .replace(/src="commentary-audition\.js(?:\?v=[^"]+)?"/,`src="commentary-audition.js?v=${auditionVersion}"`);
await writeFile(asset('commentary-audition.html'),auditionHtml);
let html=await readFile(asset('index.html'),'utf8');
html=html.replace(/href="style\.css(?:\?v=[^"]+)?"/,`href="style.css?v=${cssVersion}"`)
  .replace(/href="player-ratings\.css(?:\?v=[^"]+)?"/,`href="player-ratings.css?v=${ratingsCssVersion}"`)
  .replace(/src="app\.js(?:\?v=[^"]+)?"/,`src="app.js?v=${appVersion}"`);
await writeFile(asset('index.html'),html);
let exercisesHtml=await readFile(asset('exercises.html'),'utf8');
exercisesHtml=exercisesHtml.replace(/href="(?:\.\/)?style\.css(?:\?v=[^"]+)?"/,`href="style.css?v=${cssVersion}"`)
  .replace(/href="(?:\.\/)?exercises\.css(?:\?v=[^"]+)?"/,`href="exercises.css?v=${exercisesCssVersion}"`)
  .replace(/src="(?:\.\/)?exercises-app\.js(?:\?v=[^"]+)?"/,`src="exercises-app.js?v=${exercisesVersion}"`);
await writeFile(asset('exercises.html'),exercisesHtml);
console.log('Versioned game assets:',{app:appVersion,engine:engineVersion,worker:workerVersion,replay:replayVersion,stats:statsVersion,commentary:commentaryVersion,commentaryClips:commentaryClipsVersion,hugoCommentary:hugoCommentaryVersion,commentarySpatial:commentarySpatialVersion,commentaryTactics:commentaryTacticsVersion,commentaryStats:commentaryStatsVersion,paradeeWorker:paradeeWorkerVersion,paradeeSpeech:paradeeSpeechVersion,clock:clockVersion,css:cssVersion,evaluation:evaluationVersion,evaluationWorker:evaluationWorkerVersion,positions:positionsVersion,session:sessionVersion,exercises:exercisesVersion,exercisesCss:exercisesCssVersion});
