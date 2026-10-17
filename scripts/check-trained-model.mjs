// Exercise the existing tactical safety regressions with a supplied model ON.
// Only a temporary engine copy is changed; the playable source is untouched.
import {readFile, writeFile, mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL, fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {validateCheckpoint} from './evaluate-selfplay.mjs';

const args = {};
for (let i = 2; i < process.argv.length; i += 2) {
  if (!process.argv[i].startsWith('--') || !process.argv[i + 1]) throw new Error('Use --checkpoint FILE --engine FILE [--report FILE]');
  args[process.argv[i].slice(2)] = process.argv[i + 1];
}
if (!args.checkpoint || !args.engine) throw new Error('Use --checkpoint FILE --engine FILE [--report FILE]');
const checkpointBytes = await readFile(path.resolve(args.checkpoint));
const checkpoint = JSON.parse(checkpointBytes);
validateCheckpoint(checkpoint);
const engineBytes = await readFile(path.resolve(args.engine));
const source = engineBytes.toString('utf8');
const definition = `export const RL_VALUE_MODEL = Object.freeze({
  version: 2, algorithm: 'TD(lambda)', trained: true, enabled: true,
  scale: ${checkpoint.scale},
  featureNames: Object.freeze(${JSON.stringify(checkpoint.featureNames)}),
  weights: Object.freeze(${JSON.stringify(checkpoint.weights)}),
  checkpoint: 'temporary-model-safety-check'
});`;
const pattern = /export const RL_VALUE_MODEL = Object\.freeze\(\{[\s\S]*?\n\}\);/;
if (!pattern.test(source)) throw new Error('No replaceable engine model definition');
const directory = await mkdtemp(path.join(tmpdir(), 'football-model-safety-'));
const temporaryEngine = path.join(directory, 'engine.mjs');
await writeFile(temporaryEngine, source.replace(pattern, definition));
const temporaryUrl = pathToFileURL(temporaryEngine).href;
const root = fileURLToPath(new URL('..', import.meta.url));
const testFiles = [];
for (const name of ['pawn-tactical-awareness.test.mjs', 'crossing-support-ai.test.mjs']) {
  const text = await readFile(path.join(root, 'tests', name), 'utf8');
  const filename = path.join(directory, name);
  await writeFile(filename, text.replaceAll('../dist/engine.js', temporaryUrl));
  testFiles.push(filename);
}
const started = Date.now();
const child = spawn(process.execPath, ['--test', '--test-concurrency=2', ...testFiles], {stdio: 'inherit', execArgv: []});
const exitCode = await new Promise((resolve, reject) => {child.once('error', reject); child.once('exit', code => resolve(code));});
const report = {checkpoint: path.resolve(args.checkpoint),
  checkpointSha256: createHash('sha256').update(checkpointBytes).digest('hex'),
  engineSha256: createHash('sha256').update(engineBytes).digest('hex'),
  modelEnabledDuringChecks: true, modelScale: checkpoint.scale,
  regressions: ['pawn-tactical-awareness.test.mjs', 'crossing-support-ai.test.mjs'],
  passed: exitCode === 0, exitCode, elapsedMs: Date.now() - started};
if (args.report) await writeFile(path.resolve(args.report), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report));
process.exitCode = exitCode || 0;
