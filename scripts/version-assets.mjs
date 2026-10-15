import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const asset=name=>path.join(root,'dist',name);
const hash=text=>createHash('sha256').update(text).digest('hex').slice(0,12);
const engineVersion=hash(await readFile(asset('engine.js'),'utf8'));
let app=await readFile(asset('app.js'),'utf8');
app=app.replace(/from ['"]\.\/engine\.js(?:\?v=[^'"]+)?['"]/,`from './engine.js?v=${engineVersion}'`);
await writeFile(asset('app.js'),app);
const appVersion=hash(app),cssVersion=hash(await readFile(asset('style.css'),'utf8'));
let html=await readFile(asset('index.html'),'utf8');
html=html.replace(/href="style\.css(?:\?v=[^"]+)?"/,`href="style.css?v=${cssVersion}"`)
  .replace(/src="app\.js(?:\?v=[^"]+)?"/,`src="app.js?v=${appVersion}"`);
await writeFile(asset('index.html'),html);
console.log('Versioned game assets:',{app:appVersion,engine:engineVersion,css:cssVersion});
