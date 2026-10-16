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
const statsVersion=await versionEngineImport('match-stats.js');
let app=await readFile(asset('app.js'),'utf8');
app=app.replace(/from ['"]\.\/engine\.js(?:\?v=[^'"]+)?['"]/,`from './engine.js?v=${engineVersion}'`);
app=app.replace(/['"]\.\/ai-worker\.js(?:\?v=[^'"]+)?['"]/,`'./ai-worker.js?v=${workerVersion}'`);
app=app.replace(/from ['"]\.\/match-clock\.js(?:\?v=[^'"]+)?['"]/,`from './match-clock.js?v=${clockVersion}'`);
app=app.replace(/from ['"]\.\/goal-replay\.js(?:\?v=[^'"]+)?['"]/,`from './goal-replay.js?v=${replayVersion}'`);
app=app.replace(/from ['"]\.\/match-stats\.js(?:\?v=[^'"]+)?['"]/,`from './match-stats.js?v=${statsVersion}'`);
await writeFile(asset('app.js'),app);
const appVersion=hash(app),cssVersion=hash(await readFile(asset('style.css'),'utf8'));
let html=await readFile(asset('index.html'),'utf8');
html=html.replace(/href="style\.css(?:\?v=[^"]+)?"/,`href="style.css?v=${cssVersion}"`)
  .replace(/src="app\.js(?:\?v=[^"]+)?"/,`src="app.js?v=${appVersion}"`);
await writeFile(asset('index.html'),html);
console.log('Versioned game assets:',{app:appVersion,engine:engineVersion,worker:workerVersion,replay:replayVersion,stats:statsVersion,clock:clockVersion,css:cssVersion});
