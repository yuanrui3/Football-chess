#!/usr/bin/env node
/** Build complete Hugo sentences locally using the deployed Kitten WASM model.
 * No network, service credentials, cloned voices, or fragment splicing are used.
 * Usage: node scripts/build-hugo-commentary-library.mjs [--workers 4] [--plan|--check]
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {Worker, isMainThread, parentPort, workerData} from 'node:worker_threads';
import {COMMENTARY_CLIPS} from '../dist/commentary-clips.js';
import {TACTICAL_COMMENTARY_SCRIPTS} from '../dist/commentary-tactics.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.join(root, 'dist/audio/hugo');
const modulePath = path.join(root, 'dist/hugo-commentary-clips.js');
const provenancePath = path.join(root, 'docs/hugo-commentary-library-provenance.json');
const scratch = process.env.HUGO_LIBRARY_SCRATCH || path.join(os.tmpdir(), 'football-chess-hugo-library');
const run = promisify(execFile);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const encodingIdentity = 'mono 24000Hz 64kbps MP3; loudnorm I=-16 TP=-1.5 LRA=11';
const roles = ['queen', 'rook', 'bishop', 'knight', 'pawn'];
const defenders = [...roles, 'keeper'];
const definitions = [];
const add = (key, text, delivery = 'normal') => definitions.push({key, text, delivery});
add('hugo_enable', 'Hugo here. Let’s follow the tactics!', 'urgent');
add('hugo_test', 'Hugo here! The queen has support, and the rook goes wide.', 'urgent');
add('hugo_demo', 'Commentary sample. The bishop supports the queen along an open diagonal.');
for (const role of roles) {
  const lanes = role === 'queen' ? ['vertical', 'horizontal', 'diagonal'] : role === 'rook' || role === 'pawn'
    ? ['vertical', 'horizontal'] : role === 'bishop' ? ['diagonal'] : ['jump'];
  for (const lane of lanes) add(`support_${role}_${lane}`, lane === 'jump'
    ? 'The knight had an L-shaped jumping pass to a teammate.'
    : `The ${role} had support along an open ${lane === 'vertical' ? 'vertical file' : lane === 'horizontal' ? 'horizontal rank' : 'diagonal'}.`);
  add(`one_on_one_${role}`, `The ${role} was one on one with the keeper!`, 'urgent');
  add(`cross_support_${role}`, `The ${role} could cross to a teammate in the middle.`);
  add(`cross_${role}`, `A cross into the middle, finding the ${role}.`);
  add(`cutback_${role}`, `A cutback into the middle, finding the ${role}.`);
  add(`through_ball_${role}`, `A through ball! The onside ${role} had a route to collect.`, 'urgent');
  add(`one_two_${role}`, `A one-two! The ${role} received the return after its run.`);
  add(`link_up_${role}`, `The ${role} linked the passes, receiving and moving it on.`);
  add(`run_${role}`, `The ${role} made a forward run and was available for a pass.`);
  add(`dribble_space_${role}`, `The ${role} carried forward into space, beyond immediate tackling threats.`);
  for (const carrier of roles) add(`pass_run_${role}_${carrier}`, `The ${role} ran after passing; the ${carrier} kept possession.`);
}
for (const role of defenders) {
  add(`pressing_${role}`, `The ${role} had the ball carrier under pressure!`, 'urgent');
  add(`blocked_lane_${role}`, `The ${role} screened the passing lane to a teammate.`);
  add(`shot_traffic_${role}`, `The ${role} screened a shooting lane. The attack faced traffic.`);
  add(`press_move_${role}`, `The ${role} closed down the carrier, moving into tackling range.`);
  add(`screen_move_${role}`, `The ${role} cut the ball carrier’s passing lane to a teammate.`);
}
add('pawn_setup', 'The pawn had a free step for a diagonal challenge.');
add('cross_loose', 'A cross into the middle. The ball stayed loose.');
add('cutback_loose', 'A cutback into the middle. The ball stayed loose.');
const routineKeys = ['kickoff', 'turnover', 'counter', 'forward_centre', 'forward_wide', 'switch', 'queen_linebreak',
  'rook_wide', 'bishop_diagonal', 'knight_pocket', 'build_back', 'midfield', 'final_third', 'central_possession',
  'wide_possession', 'tight_space', 'loose_ball', 'level_score', 'leader', 'advance_centre', 'advance_wide',
  'pressure', 'patient', 'corner', 'throw', 'free', 'indirect', 'goalkick', 'offside', 'timeout'];
for (const key of routineKeys) add(`routine_${key}`, COMMENTARY_CLIPS[key].text,
  COMMENTARY_CLIPS[key].delivery === 'calm' ? 'normal' : 'urgent');

for (const [key, script] of Object.entries(TACTICAL_COMMENTARY_SCRIPTS)) add(key, script.text, script.delivery);

// A spatial recording describes the verified position when playback began.
// Its past-tense wording can finish over subsequent routine actions.
for (const definition of definitions) if (!definition.key.startsWith('routine_') && !definition.key.startsWith('hugo_')) definition.snapshot = true;

const selectorSource = String.raw`
const ROLE = Object.freeze({Q:'queen', R:'rook', B:'bishop', N:'knight', P:'pawn', K:'keeper'});
/** Select from already established facts; the controller owns live-fact revalidation.
 * No names, hidden decisions, game search, random draws, or tactical inference occur here.
 * null means use the existing fallback rather than make an unsupported claim.
 */
export function hugoCommentaryClip(line, state) {
  if (!line || line.kind !== 'trend') return null;
  const alias = {enable:'hugo_enable', test:'hugo_test', demo:'hugo_demo'};
  let key = alias[line.clipKey] || line.clipKey;
  if (!['hugo_enable', 'hugo_test', 'hugo_demo'].includes(key) && !/^(?:tactic_|performance_|shape_)/.test(key || '')) {
    const f = line.spatial;
    if (!f) key = 'routine_' + line.clipKey;
    else {
      const pieces = Array.isArray(state?.pieces) ? state.pieces : [];
      const find = id => typeof id === 'string' ? pieces.find(p => p.id === id) : null;
      const role = id => ROLE[find(id)?.type] || null;
      const actor = role(f.pieceId);
      const defender = role(f.defenderId || f.pieceId);
      const receiver = role(f.receiverId);
      const runner = role(f.runnerId || f.pieceId);
      const carrier = role(f.carrierId || f.pieceId);
      switch (f.type) {
        case 'support': {
          const from = find(f.pieceId), to = find(f.receiverId);
          if (!from || !to || !actor) return null;
          const dx = Math.abs(from.x - to.x), dy = Math.abs(from.y - to.y);
          const lane = actor === 'knight' ? ((dx === 1 && dy === 2 || dx === 2 && dy === 1) ? 'jump' : null)
            : dx === 0 && dy > 0 ? 'vertical' : dy === 0 && dx > 0 ? 'horizontal' : dx > 0 && dx === dy ? 'diagonal' : null;
          key = lane ? 'support_' + actor + '_' + lane : null;
          break;
        }
        case 'oneOnOne': key = actor && 'one_on_one_' + actor; break;
        case 'pressing': key = defender && 'pressing_' + defender; break;
        case 'pawnSetup': key = defender === 'pawn' && 'pawn_setup'; break;
        case 'crossSupport': key = actor && 'cross_support_' + actor; break;
        case 'blockedLane': key = defender && 'blocked_lane_' + defender; break;
        case 'shotTraffic': key = defender && 'shot_traffic_' + defender; break;
        case 'cross': case 'cutback':
          key = f.receiverId ? (receiver && f.type + '_' + receiver) : f.type + '_loose'; break;
        case 'throughBall': key = runner && 'through_ball_' + runner; break;
        case 'oneTwo': key = receiver && 'one_two_' + receiver; break;
        case 'linkUp': key = actor && 'link_up_' + actor; break;
        case 'pressMove': key = defender && 'press_move_' + defender; break;
        case 'screenMove': key = defender && 'screen_move_' + defender; break;
        case 'passRun': key = runner && receiver && 'pass_run_' + runner + '_' + receiver; break;
        case 'run': key = runner && 'run_' + runner; break;
        case 'dribbleSpace': key = carrier && 'dribble_space_' + carrier; break;
        default: return null;
      }
    }
  }
  const clip = HUGO_COMMENTARY_CLIPS[key];
  return clip?.ready && clip.durationMs > 0 && clip.sha256 ? clip : null;
}
`;

async function atomicWrite(filename, content) {
  const temporary = filename + '.tmp';
  await fs.writeFile(temporary, content);
  await fs.rename(temporary, filename);
}
function stats(samples) {
  let energy = 0, peak = 0, nonFinite = 0;
  for (const value of samples) {
    if (!Number.isFinite(value)) nonFinite++;
    else {energy += value * value; peak = Math.max(peak, Math.abs(value));}
  }
  return {samples:samples.length, rms:Math.sqrt(energy / Math.max(1, samples.length)), peak, nonFinite};
}
function floatWav(samples, sampleRate) {
  const buffer = Buffer.alloc(44 + samples.length * 4);
  buffer.write('RIFF'); buffer.writeUInt32LE(buffer.length - 8, 4); buffer.write('WAVE', 8);
  buffer.write('fmt ', 12); buffer.writeUInt32LE(16, 16); buffer.writeUInt16LE(3, 20);
  buffer.writeUInt16LE(1, 22); buffer.writeUInt32LE(sampleRate, 24); buffer.writeUInt32LE(sampleRate * 4, 28);
  buffer.writeUInt16LE(4, 32); buffer.writeUInt16LE(32, 34); buffer.write('data', 36);
  buffer.writeUInt32LE(samples.length * 4, 40);
  for (let i = 0; i < samples.length; i++) buffer.writeFloatLE(samples[i], 44 + i * 4);
  return buffer;
}
async function inspectMp3(filename) {
  const {stdout} = await run('ffprobe', ['-v','error','-show_entries','format=duration:stream=sample_rate,channels','-of','json',filename]);
  const probe = JSON.parse(stdout);
  const {stdout:pcm} = await run('ffmpeg', ['-hide_banner','-loglevel','error','-i',filename,'-f','f32le','-acodec','pcm_f32le','-ac','1','pipe:1'], {encoding:'buffer',maxBuffer:16*1024*1024});
  const values = new Float32Array(pcm.buffer, pcm.byteOffset, pcm.byteLength / 4);
  const audio = stats(values);
  const durationMs = Math.round(Number(probe.format.duration) * 1000);
  if (!(durationMs > 200) || audio.nonFinite || audio.rms < 0.00001) throw new Error('Silent or invalid MP3: ' + filename);
  return {durationMs,decodedAudio:audio,sampleRate:Number(probe.streams[0].sample_rate),channels:probe.streams[0].channels};
}

async function synthesizeWorker() {
  const {loadKittenEngine} = await import('../dist/paradee-worker.js');
  const started = performance.now();
  const engine = await loadKittenEngine({
    fetchImpl:async url => {
      const bytes = await fs.readFile(fileURLToPath(url));
      return {ok:true,headers:{get:key=>key === 'content-length' ? String(bytes.byteLength) : null},
        arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
        json:async()=>JSON.parse(bytes.toString()),text:async()=>bytes.toString()};
    },
    importModule:async url => {
      const module = await import(url);
      if (url.endsWith('ort.wasm.min.mjs')) module.env.wasm.wasmBinary = new Uint8Array(await fs.readFile(path.join(root,'dist/vendor/paradee/ort-wasm-simd-threaded.wasm')));
      return module;
    },
  });
  parentPort.postMessage({type:'ready',worker:workerData.number,initializationMs:performance.now()-started});
  parentPort.on('message', async job => {
    if (job.type === 'close') {await engine.dispose(); parentPort.close(); return;}
    try {
      const start = performance.now();
      const {samples,sampleRate} = await engine.synthesize(job.definition.text, {delivery:job.definition.delivery});
      const inferenceMs = performance.now() - start;
      const inputAudio = stats(samples);
      if (!samples.length || inputAudio.nonFinite || inputAudio.rms < 0.00001) throw new Error('Silent or invalid model waveform');
      const wav = path.join(scratch, job.definition.key + '.wav');
      const temporary = path.join(scratch, job.definition.key + '.mp3');
      await fs.writeFile(wav, floatWav(samples,sampleRate));
      await run('ffmpeg',['-hide_banner','-loglevel','error','-y','-i',wav,'-ac','1','-ar','24000',
        '-af','loudnorm=I=-16:TP=-1.5:LRA=11','-c:a','libmp3lame','-b:a','64k','-threads','1',temporary]);
      const inspection = await inspectMp3(temporary);
      const bytes = await fs.readFile(temporary);
      const receipt = {...job.definition,identity:job.identity,sha256:sha(bytes),bytes:bytes.length,...inspection,
        inputAudio,inferenceMs,modelDurationMs:Math.round(samples.length / sampleRate * 1000)};
      await fs.rename(temporary,path.join(output,job.definition.key+'.mp3'));
      await atomicWrite(path.join(scratch,job.definition.key+'.json'),JSON.stringify(receipt,null,2)+'\n');
      await fs.unlink(wav);
      parentPort.postMessage({type:'complete',receipt});
    } catch (error) {parentPort.postMessage({type:'failure',key:job.definition.key,error:error.stack || String(error)});}
  });
}

async function main() {
  const vendor = JSON.parse(await fs.readFile(path.join(root,'docs/kitten-vendor-provenance.json'),'utf8'));
  const runtimeFiles = {};
  for (const relative of ['dist/paradee-worker.js', ...vendor.runtime_files.map(name=>'dist/'+name)]) {
    const bytes = await fs.readFile(path.join(root,relative)); runtimeFiles[relative] = {bytes:bytes.length,sha256:sha(bytes)};
    const pin = vendor.files[relative.replace(/^dist\//,'')];
    if (pin && (pin.sha256 !== runtimeFiles[relative].sha256 || pin.bytes !== bytes.length)) throw new Error('Deployed runtime pin differs: '+relative);
  }
  // Scripts have separate exact text/delivery checks. Changing one sentence
  // never invalidates unrelated audio made with the same runtime and encoding.
  const identity = sha(JSON.stringify({runtimeFiles,encoding:encodingIdentity}));
  let previous = null;
  try {previous = JSON.parse(await fs.readFile(provenancePath,'utf8'));} catch {}
  const sameRuntime = previous && JSON.stringify(previous.runtimeFiles) === JSON.stringify(runtimeFiles)
    && previous.encoding?.format === 'MP3' && previous.encoding?.channels === 1 && previous.encoding?.sampleRate === 24000
    && previous.encoding?.bitrate === '64k' && previous.encoding?.filter === 'loudnorm=I=-16:TP=-1.5:LRA=11';
  const previousClips = new Map((sameRuntime ? previous.clips : []).map(clip=>[clip.key,clip]));
  if (process.argv.includes('--check')) {
    // Verification is strictly read-only and works in a clean clone: no /tmp
    // receipts, engine initialization, manifest writes, or directory creation.
    if (!previous || !sameRuntime || previous.status !== 'complete'
      || previous.completedClips !== definitions.length || previous.clips.length !== definitions.length) throw new Error('Tracked Hugo library is incomplete or its runtime identity differs.');
    const {HUGO_COMMENTARY_CLIPS} = await import(pathToFileURL(modulePath).href + '?verify=' + Date.now());
    if (Object.keys(HUGO_COMMENTARY_CLIPS).length !== definitions.length) throw new Error('Manifest clip count differs.');
    let totalBytes = 0;
    for (const definition of definitions) {
      const clip = previousClips.get(definition.key), manifest = HUGO_COMMENTARY_CLIPS[definition.key];
      if (!clip?.ready || clip.text !== definition.text || clip.delivery !== definition.delivery || clip.voice !== 'Hugo' || !!clip.snapshot !== !!definition.snapshot
        || !manifest?.ready || manifest.text !== clip.text || manifest.sha256 !== clip.sha256
        || manifest.durationMs !== clip.durationMs || !!manifest.snapshot !== !!definition.snapshot) throw new Error('Tracked script or manifest differs: '+definition.key);
      const filename = path.join(output,definition.key+'.mp3');
      const bytes = await fs.readFile(filename);
      if (sha(bytes) !== clip.sha256 || bytes.length !== clip.bytes) throw new Error('MP3 integrity differs: '+definition.key);
      if (fileURLToPath(manifest.src) !== filename) throw new Error('Manifest URL differs: '+definition.key);
      const inspection = await inspectMp3(filename);
      if (inspection.durationMs !== clip.durationMs || inspection.sampleRate !== 24000 || inspection.channels !== 1) throw new Error('MP3 format differs: '+definition.key);
      totalBytes += bytes.length;
    }
    console.log(JSON.stringify({type:'checked',clips:definitions.length,bytes:totalBytes,readOnly:true}));
    return;
  }
  await Promise.all([fs.mkdir(output,{recursive:true}),fs.mkdir(scratch,{recursive:true})]);
  const receipts = new Map();
  for (const definition of definitions) {
    const candidates = [previousClips.get(definition.key)];
    try {candidates.unshift(JSON.parse(await fs.readFile(path.join(scratch,definition.key+'.json'),'utf8')));} catch {}
    for (const receipt of candidates) {
      try {
        const compatible = receipt && (receipt.identity === identity || sameRuntime && receipt.identity === previous.identity);
        const bytes = await fs.readFile(path.join(output,definition.key+'.mp3'));
        if (compatible && receipt.text === definition.text && receipt.delivery === definition.delivery && receipt.sha256 === sha(bytes)) {
          receipts.set(definition.key,{...receipt,identity}); break;
        }
      } catch {}
    }
  }
  const ffmpeg = (await run('ffmpeg',['-version'])).stdout.split('\n')[0];
  const buildStarted = sameRuntime ? previous.buildStarted : new Date().toISOString();
  const passStarted = new Date().toISOString();
  const workers = [];
  async function writeManifests() {
    const entries = definitions.map(definition => {
      const receipt = receipts.get(definition.key);
      return {...definition,voice:'Hugo',ready:!!receipt,durationMs:receipt?.durationMs ?? null,sha256:receipt?.sha256 ?? null};
    });
    const source = '/** Offline whole-sentence Hugo commentary. Generated by scripts/build-hugo-commentary-library.mjs. */\n'
      + 'const entries = ' + JSON.stringify(entries,null,2) + ';\n'
      + 'export const HUGO_COMMENTARY_CLIPS = Object.freeze(Object.fromEntries(entries.map(clip => [clip.key, Object.freeze({...clip, src:new URL(`./audio/hugo/${clip.key}.mp3?v=${clip.sha256?.slice(0,12) || "pending"}`, import.meta.url).href})])));\n'
      + selectorSource;
    const provenance = {feature:'Prepared whole-sentence Hugo technical match commentary',status:receipts.size === definitions.length ? 'complete' : 'building',
      plannedClips:definitions.length,completedClips:receipts.size,buildStarted,updatedAt:new Date().toISOString(),identity,
      scriptsSha256:sha(JSON.stringify(definitions)),
      model:vendor.model,voice:vendor.voice,frontend:vendor.frontend,licenses:vendor.licenses,runtimeFiles,
      synthesis:{backend:'Deployed onnxruntime-web 1.24.3 WASM',threadsPerWorker:1,maxConcurrentWorkers:4,
        externalServices:false,voiceCloning:false,fragmentSplicing:false,completeSentences:true,
        normalSpeed:0.936,urgentSpeed:0.99},
      encoding:{ffmpeg,format:'MP3',channels:1,sampleRate:24000,bitrate:'64k',filter:'loudnorm=I=-16:TP=-1.5:LRA=11'},
      scriptsSource:{technical:'Original project-authored factual scripts in this generator',routine:'Exact project-authored trend texts from dist/commentary-clips.js',
        tactical:{file:'dist/commentary-tactics.js',definitionsSha256:sha(JSON.stringify(TACTICAL_COMMENTARY_SCRIPTS))},
        generator:'scripts/build-hugo-commentary-library.mjs',generatorSha256:sha(await fs.readFile(fileURLToPath(import.meta.url)))},
      selection:'Current fact IDs select past-tense piece-role snapshots; tactical evidence selects rolling-analysis sentences. No team names or IDs are spliced into recordings. Shot/result/goal calls remain outside this library.',
      workerInitialization:[...(sameRuntime ? previous.workerInitialization || [] : []),...workers.map(worker=>worker.measurement).filter(Boolean)],
      clips:definitions.map(definition=>({...definition,...(receipts.get(definition.key)||{}),voice:'Hugo',file:'dist/audio/hugo/'+definition.key+'.mp3',ready:receipts.has(definition.key)}))};
    await atomicWrite(modulePath,source);
    await atomicWrite(provenancePath,JSON.stringify(provenance,null,2)+'\n');
  }
  await writeManifests();
  console.log(JSON.stringify({type:'manifest',planned:definitions.length,ready:receipts.size,modulePath,identity}));
  if (process.argv.includes('--plan')) return;
  const queue = definitions.filter(definition=>!receipts.has(definition.key));
  if (!queue.length) {console.log(JSON.stringify({type:'complete',clips:receipts.size,resumed:true})); return;}
  const workerFlag = process.argv.indexOf('--workers');
  const requested = workerFlag >= 0 ? Number(process.argv[workerFlag+1]) : 4;
  const count = Math.max(1,Math.min(4,Number.isFinite(requested)?Math.floor(requested):4,queue.length));
  let writes = Promise.resolve();
  let failed = false;
  await new Promise((resolve,reject)=>{
    let active = 0;
    const dispatch = worker => {
      const definition = queue.shift();
      if (!definition) {worker.postMessage({type:'close'}); return;}
      active++; worker.postMessage({type:'synthesize',definition,identity});
    };
    for (let index=0;index<count;index++) {
      const worker = new Worker(fileURLToPath(import.meta.url),{workerData:{number:index+1}});
      workers.push(worker);
      worker.on('message', message=>{
        if (message.type === 'ready') {
          worker.measurement = {worker:message.worker,initializationMs:message.initializationMs,passStarted};
          console.log(JSON.stringify(message)); dispatch(worker);
        } else if (message.type === 'complete') {
          active--; receipts.set(message.receipt.key,message.receipt);
          writes = writes.then(writeManifests);
          console.log(JSON.stringify({type:'clip',key:message.receipt.key,ready:receipts.size,total:definitions.length,
            inferenceMs:Math.round(message.receipt.inferenceMs),durationMs:message.receipt.durationMs}));
          dispatch(worker);
        } else if (message.type === 'failure') {
          failed = true;
          for (const running of workers) running.terminate();
          reject(new Error(message.key+': '+message.error));
        }
      });
      worker.on('error',error=>{failed=true; for(const running of workers) running.terminate(); reject(error);});
      worker.on('exit',code=>{
        if (!failed && code !== 0) {failed=true; for(const running of workers) running.terminate(); reject(new Error('Hugo synthesis worker exited with code '+code));}
        else if (!failed && !queue.length && active === 0 && workers.every(w=>w.threadId === -1)) resolve();
      });
    }
  });
  await writes;
  await writeManifests();
  if (receipts.size !== definitions.length) throw new Error(`Incomplete: ${receipts.size}/${definitions.length}`);
  console.log(JSON.stringify({type:'complete',clips:receipts.size,bytes:[...receipts.values()].reduce((sum,r)=>sum+r.bytes,0)}));
}

if (isMainThread) await main(); else await synthesizeWorker();
