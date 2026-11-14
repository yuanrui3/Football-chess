/** Fixed-action, four-leg comparison under one live rules module. */
import {createHash} from 'node:crypto';
import {mkdir, open, readFile, realpath, rename, unlink, writeFile} from 'node:fs/promises';
import {availableParallelism, hostname} from 'node:os';
import path from 'node:path';
import {performance} from 'node:perf_hooks';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {isMainThread, parentPort, Worker, workerData} from 'node:worker_threads';

const SCHEMA_VERSION = 1;
const TEAMS = ['white', 'black'];
const SHOT_OUTCOMES = ['goal', 'save', 'shotMiss', 'blockedShot'];
const ACTION_TYPES = ['move', 'kick', 'cornerTaker', 'skip'];
const METRICS = ['xG', 'ownGoalXG', 'goals', 'shots', 'ownGoalShots', 'resolvedShots', 'tackles', 'tackleWins',
  'tacklesConceded', 'stallingAwards', 'offsideAwards', 'fouls', 'nodes', 'maxNodes', 'completedDepthTotal',
  'decisions', 'searchDecisions', 'thinkMs', 'searchThinkMs'];
const sha256 = value => createHash('sha256').update(value).digest('hex');
const other = team => team === 'white' ? 'black' : 'white';
const legKey = ({seed, candidateColor, kickoff}) => `${seed}:${candidateColor}:${kickoff}`;
const sideStats = () => Object.fromEntries(METRICS.map(metric => [metric, 0]));

function integer(value, name, min, max = Number.MAX_SAFE_INTEGER) {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new Error(`${name} must be an integer in [${min}, ${max}]`);
  return value;
}

function checkedHash(value, name) {
  if (value === undefined) return value;
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/i.test(value)) throw new Error(`${name} must be a SHA-256 digest`);
  return value.toLowerCase();
}

async function engineFile(file, expectedHash, label) {
  if (typeof file !== 'string' || !file.trim()) throw new Error(`${label} needs an engine path`);
  const filename = await realpath(path.resolve(file));
  const hash = sha256(await readFile(filename));
  if (expectedHash && expectedHash !== hash) throw new Error(`${label} engine SHA-256 mismatch: expected ${expectedHash}, got ${hash}`);
  return {filename, path: file, sha256: hash};
}

function checkSearchOptions(options, label) {
  if (options === undefined) return options;
  if (!options || Array.isArray(options) || typeof options !== 'object') throw new Error(`${label}.searchOptions must be an object`);
  const {chanceMassFloor, spillSamples, gateTokenShots, ...unknown} = options;
  if (Object.keys(unknown).length) throw new Error(`Unknown ${label}.searchOptions key: ${Object.keys(unknown)[0]}`);
  if (chanceMassFloor !== undefined && (!Number.isFinite(chanceMassFloor) || chanceMassFloor < 0 || chanceMassFloor > 1)) {
    throw new Error(`${label}.searchOptions.chanceMassFloor must be in [0, 1]`);
  }
  if (spillSamples !== undefined) integer(spillSamples, `${label}.searchOptions.spillSamples`, 0);
  if (gateTokenShots !== undefined && typeof gateTokenShots !== 'boolean') throw new Error(`${label}.searchOptions.gateTokenShots must be boolean`);
  return {chanceMassFloor, spillSamples, gateTokenShots};
}

async function loadProtocol(configPath) {
  const config = JSON.parse(await readFile(configPath, 'utf8'));
  const {arm, rules, rulesSha256, seeds, actionLimit = 240, foulsEnabled = true,
    initialClusters = seeds?.length, candidate, baseline} = config;
  if (typeof arm !== 'string' || !arm.trim()) throw new Error('An arm label is required');
  if (!Array.isArray(seeds) || !seeds.length || new Set(seeds).size !== seeds.length) throw new Error('Seeds must be nonempty and unique');
  for (const seed of seeds) integer(seed, 'seed', 1, 0xffffffff);
  integer(actionLimit, 'actionLimit', 1);
  integer(initialClusters, 'initialClusters', 1, seeds.length);
  if (foulsEnabled !== true) throw new Error('This tournament requires fouls to be enabled');

  async function loadSide(side, label) {
    if (!side || typeof side !== 'object') throw new Error(`${label} configuration is required`);
    const {engine, sha256: expectedHash, policy = 'tactical', nodeLimit = 1400, maxDepth = 8} = side;
    if (!['tactical', 'casual'].includes(policy)) throw new Error(`${label}.policy must be tactical or casual`);
    const searchOptions = checkSearchOptions(side.searchOptions, label);
    if (policy === 'casual' && searchOptions !== undefined) throw new Error(`${label}.searchOptions requires Tactical policy`);
    return {file: await engineFile(engine, checkedHash(expectedHash, `${label}.sha256`), label), policy,
      nodeLimit: integer(nodeLimit, `${label}.nodeLimit`, 1, 50000), maxDepth: integer(maxDepth, `${label}.maxDepth`, 1, 12), searchOptions};
  }

  const [rulesFile, candidateSide, baselineSide] = await Promise.all([
    engineFile(rules, checkedHash(rulesSha256, 'rulesSha256'), 'Rules'), loadSide(candidate, 'candidate'), loadSide(baseline, 'baseline')]);
  const settings = side => ({policy: side.policy, nodeLimit: side.nodeLimit, maxDepth: side.maxDepth, searchOptions: side.searchOptions});
  const reference = ({path, sha256}) => ({path, sha256});
  const manifest = {schemaVersion: SCHEMA_VERSION, arm, seeds, initialClusters, actionLimit, foulsEnabled,
    rules: reference(rulesFile), candidate: {...reference(candidateSide.file), ...settings(candidateSide)},
    baseline: {...reference(baselineSide.file), ...settings(baselineSide)}};
  const protocolId = sha256(JSON.stringify(manifest));
  const identicalPolicies = candidateSide.file.sha256 === baselineSide.file.sha256
    && JSON.stringify(settings(candidateSide)) === JSON.stringify(settings(baselineSide));
  if (arm.toLowerCase() === 'null' && !identicalPolicies) throw new Error('The null arm requires byte-identical engines and policy settings');
  const workerConfig = {arm, protocolId, actionLimit, foulsEnabled, rulesUrl: pathToFileURL(rulesFile.filename).href,
    candidate: {...settings(candidateSide), url: pathToFileURL(candidateSide.file.filename).href},
    baseline: {...settings(baselineSide), url: pathToFileURL(baselineSide.file.filename).href}};
  return {manifest: {protocolId, ...manifest}, workerConfig, identicalPolicies, files: [rulesFile, candidateSide.file, baselineSide.file]};
}

async function verifyFiles(files) {
  await Promise.all(files.map(async file => {
    if (sha256(await readFile(file.filename)) !== file.sha256) throw new Error(`Engine changed during the run: ${file.path}`);
  }));
}

function makePolicy(engine, {policy, nodeLimit, maxDepth, searchOptions}) {
  if (policy === 'casual') {
    if (typeof engine.chooseAIAction !== 'function') throw new Error('Casual engine must export chooseAIAction');
    return state => ({action: engine.chooseAIAction(state, {difficulty: 'casual'}), nodes: 0, depth: 0});
  }
  if (typeof engine.analyzeTacticalAction !== 'function') throw new Error('Tactical engine must export analyzeTacticalAction');
  const options = {nodeLimit, maxDepth, ...(searchOptions === undefined ? {} : {searchOptions})};
  return state => {
    const {action, stats} = engine.analyzeTacticalAction(state, options);
    return {action, nodes: integer(stats?.nodes, 'search nodes', 0, nodeLimit),
      depth: integer(stats?.completedDepth, 'completed depth', 0, maxDepth)};
  };
}

function validatePolicyAction(rules, state, action, validateAction) {
  if (!ACTION_TYPES.includes(action?.type)) throw new Error('Policy returned an unsupported action');
  for (const flag of ['freePawn', 'passRun', 'disguise']) {
    if (action[flag] !== undefined && typeof action[flag] !== 'boolean') throw new Error(`Invalid policy action flag: ${flag}`);
  }
  if (action.type === 'move') {
    const move = rules.legalMoves(state, action.pieceId, {freePawn: !!action.freePawn})
      .find(entry => entry.x === action.x && entry.y === action.y);
    if (!move) throw new Error('Illegal policy move');
    return move.type === 'tackle';
  }
  if (action.type !== 'skip' || !rules.canQuickRelease(state)) validateAction(rules, state, action);
  return false;
}

function recordTransition(stats, before, after, team, tackle) {
  const result = after.lastAction;
  const event = result?.triggeringAction ?? result;
  if (after.phase === 'keeperReact') {
    if (before.phase === 'keeperReact' || result?.type !== 'shotAttempt') throw new Error('Invalid pending-shot transition');
    const shot = after.pendingShot;
    stats[shot.shootingTeam][shot.shootingTeam === shot.scoringTeam ? 'shots' : 'ownGoalShots']++;
  }
  if (before.phase === 'keeperReact') {
    if (!SHOT_OUTCOMES.includes(event?.type)) throw new Error('Keeper reaction did not resolve the shot');
    const shot = before.pendingShot;
    const probability = event.shotModel?.goalProbability ?? event.shotModel?.probability;
    if (!Number.isFinite(probability) || probability < 0 || probability > 1) throw new Error('Resolved shot lacks valid post-reaction xG');
    const shooting = stats[shot.shootingTeam];
    shooting[shot.shootingTeam === shot.scoringTeam ? 'xG' : 'ownGoalXG'] += probability;
    shooting.resolvedShots++;
  }
  if (tackle) {
    stats[team].tackles++;
    if (event.tackleSuccess) {
      stats[team].tackleWins++;
      stats[other(team)].tacklesConceded++;
    }
    if (event.type === 'foul') stats[team].fouls++;
  }
  if (result?.type === 'stalling') stats[result.restart.team].stallingAwards++;
  if (result?.type === 'offside') stats[result.restart.team].offsideAwards++;
}

function playGame({rules, candidate, baseline, candidateTactical, baselineTactical, arm, protocolId,
  actionLimit, foulsEnabled, workers, applyAction, checkIntegrity, publicDecisionState, validateAction}, {seed, candidateColor, kickoff}) {
  let state = rules.createGame({mode: 'local', seed, kickoff, foulsEnabled});
  checkIntegrity(rules, state);
  if (state.foulsEnabled !== true) throw new Error('Shared rules did not enable fouls');
  const stats = {white: sideStats(), black: sideStats()};
  const trajectory = createHash('sha256');
  let actions = 0;
  while (state.phase !== 'finished' && (actions < actionLimit || state.phase === 'keeperReact')) {
    const before = state;
    const team = rules.currentTeam(before);
    if (!TEAMS.includes(team)) throw new Error('Shared rules did not identify the decision maker');
    const policy = team === candidateColor ? candidate : baseline;
    const isSearchDecision = (team === candidateColor ? candidateTactical : baselineTactical) && before.phase !== 'keeperReact';
    const visible = publicDecisionState(before);
    const visibleSnapshot = JSON.stringify(visible);
    const started = performance.now();
    const {action, nodes, depth} = policy(visible);
    const elapsed = performance.now() - started;
    if (JSON.stringify(visible) !== visibleSnapshot) throw new Error('Policy mutated its input');
    const tackle = validatePolicyAction(rules, before, action, validateAction);
    const beforeSnapshot = JSON.stringify(before);
    state = applyAction(rules, before, action);
    if (JSON.stringify(before) !== beforeSnapshot) throw new Error('Shared rules mutated their input');
    checkIntegrity(rules, state, before);
    const side = stats[team];
    side.decisions++;
    side.thinkMs += elapsed;
    side.nodes += nodes;
    side.maxNodes = Math.max(side.maxNodes, nodes);
    side.completedDepthTotal += depth;
    if (isSearchDecision) {
      side.searchDecisions++;
      side.searchThinkMs += elapsed;
    }
    recordTransition(stats, before, state, team, tackle);
    trajectory.update(`${JSON.stringify([team, before.phase, action, state.lastAction, state.randomState])}\n`);
    actions++;
  }
  for (const team of TEAMS) {
    const side = stats[team];
    side.goals = state.score[team];
    if (side.shots + side.ownGoalShots !== side.resolvedShots) throw new Error('A declared shot was not resolved');
  }
  const {score, phase, finishReason} = state;
  const winner = phase === 'finished' && state.winner ? state.winner
    : score.white > score.black ? 'white' : score.black > score.white ? 'black' : null;
  return {schemaVersion: SCHEMA_VERSION, protocolId, arm, seed, candidateColor, kickoff, actions, actionLimit, foulsEnabled,
    extraResolutionActions: Math.max(0, actions - actionLimit), score, phase, finishReason, winner,
    candidateResult: winner === null ? 'draw' : winner === candidateColor ? 'win' : 'loss',
    finalStateHash: sha256(JSON.stringify(state)), trajectoryHash: trajectory.digest('hex'), timing: {workers, node: process.version},
    candidate: stats[candidateColor], baseline: stats[other(candidateColor)]};
}

function allLegs(seeds) {
  return seeds.flatMap(seed => TEAMS.flatMap(candidateColor => TEAMS.map(kickoff => ({seed, candidateColor, kickoff}))));
}

async function readGames(output, protocol, resumeFile) {
  let bytes;
  try {
    bytes = await readFile(output);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return [];
  }
  const complete = bytes.lastIndexOf(10) + 1;
  const allowed = new Set(allLegs(protocol.seeds).map(legKey));
  const games = bytes.subarray(0, complete).toString('utf8').trimEnd().split('\n').filter(Boolean).map((line, index) => {
    let game;
    try {
      game = JSON.parse(line);
    } catch (error) {
      throw new Error(`Malformed game record on line ${index + 1}`, {cause: error});
    }
    if (game.schemaVersion !== SCHEMA_VERSION || game.protocolId !== protocol.protocolId || game.arm !== protocol.arm
      || game.foulsEnabled !== protocol.foulsEnabled || game.actionLimit !== protocol.actionLimit || !allowed.delete(legKey(game))
      || !Number.isInteger(game.actions) || game.actions < 1 || game.actions > protocol.actionLimit + 1 || game.phase === 'keeperReact'
      || !['win', 'draw', 'loss'].includes(game.candidateResult) || !/^[a-f0-9]{64}$/.test(game.finalStateHash)
      || !/^[a-f0-9]{64}$/.test(game.trajectoryHash)
      || !['candidate', 'baseline'].every(side => METRICS.every(metric => Number.isFinite(game[side]?.[metric]) && game[side][metric] >= 0))) {
      throw new Error(`Invalid, duplicate or incompatible game record on line ${index + 1}`);
    }
    return game;
  });
  if (resumeFile && complete < bytes.length) await resumeFile.truncate(complete);
  return games;
}

async function verifyManifest(output, manifest, create = false) {
  const filename = `${output}.manifest.json`;
  let existing;
  try {
    existing = JSON.parse(await readFile(filename, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    if (!create) throw new Error(`Missing tournament manifest: ${filename}`);
    try {
      if ((await readFile(output)).length) throw new Error('Cannot resume a nonempty log without its tournament manifest');
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    const temp = `${filename}.${process.pid}.tmp`;
    await writeFile(temp, `${JSON.stringify(manifest, null, 2)}\n`, {flag: 'wx'});
    await rename(temp, filename);
    return;
  }
  if (JSON.stringify(existing) !== JSON.stringify(manifest)) throw new Error('Tournament manifest does not match the protocol or engine hashes');
}

async function acquireLock(output) {
  const filename = `${output}.lock`;
  let lock;
  try {
    lock = await open(filename, 'wx');
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    throw new Error(`Tournament output is locked: ${filename}. Remove the lock only after confirming its process has exited.`);
  }
  try {
    await lock.writeFile(`${JSON.stringify({pid: process.pid, host: hostname()})}\n`);
  } finally {
    await lock.close();
  }
  return () => unlink(filename);
}

function nextGame(worker, leg, signal) {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    function cleanup() {
      worker.off('message', receive);
      signal.removeEventListener('abort', cancel);
    }
    function receive(message) {
      cleanup();
      if (message.error) reject(new Error(message.error));
      else resolve(message.game);
    }
    function cancel() {
      cleanup();
      reject(signal.reason);
    }
    worker.on('message', receive);
    signal.addEventListener('abort', cancel, {once: true});
    worker.postMessage(leg);
  });
}

async function runGames(output, protocol, seeds, requestedWorkers) {
  await mkdir(path.dirname(output), {recursive: true});
  const unlock = await acquireLock(output);
  const controller = new AbortController();
  const interrupt = () => controller.abort(new Error('Interrupted. Completed games can be resumed.'));
  process.once('SIGINT', interrupt);
  process.once('SIGTERM', interrupt);
  const workers = [];
  let log, resumeOffset;
  try {
    await verifyManifest(output, protocol.manifest, true);
    try {
      log = await open(output, 'r+');
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      log = await open(output, 'wx+');
    }
    const games = await readGames(output, protocol.manifest, log);
    resumeOffset = (await log.stat()).size;
    const seen = new Set(games.map(legKey));
    const legs = allLegs(seeds).filter(leg => !seen.has(legKey(leg)));
    const concurrency = Math.min(legs.length, requestedWorkers);
    let cursor = 0, written = 0, logOffset = resumeOffset;
    let pendingWrite = Promise.resolve();
    const consume = async worker => {
      while (cursor < legs.length) {
        controller.signal.throwIfAborted();
        const leg = legs[cursor++];
        const game = await nextGame(worker, leg, controller.signal);
        if (legKey(game) !== legKey(leg)) throw new Error('Worker returned the wrong match');
        pendingWrite = pendingWrite.then(async () => {
          const line = Buffer.from(`${JSON.stringify(game)}\n`);
          let lineOffset = 0;
          while (lineOffset < line.length) {
            const {bytesWritten} = await log.write(line, lineOffset, line.length - lineOffset, logOffset + lineOffset);
            if (!bytesWritten) throw new Error('Could not append a complete game record');
            lineOffset += bytesWritten;
          }
          logOffset += line.length;
          await log.sync();
          games.push(game);
          written++;
          console.error(`${protocol.manifest.arm}: ${written}/${legs.length} new games (${game.seed}, ${game.candidateColor}, ${game.kickoff} kickoff)`);
        });
        await pendingWrite;
      }
    };
    for (let index = 0; index < concurrency; index++) {
      const worker = new Worker(new URL(import.meta.url), {workerData: {...protocol.workerConfig, workers: concurrency}});
      workers.push(worker);
      worker.on('error', error => controller.abort(error));
      worker.once('exit', code => controller.abort(new Error(`Tournament worker exited with code ${code}`)));
    }
    const outcomes = await Promise.allSettled(workers.map(worker => consume(worker).catch(error => {
      controller.abort(error);
      throw error;
    })));
    const failure = outcomes.find(outcome => outcome.status === 'rejected');
    if (failure) throw failure.reason;
    controller.signal.throwIfAborted();
    return games;
  } finally {
    try {
      await Promise.allSettled(workers.map(worker => worker.terminate()));
      try {
        await verifyFiles(protocol.files);
      } catch (error) {
        if (resumeOffset !== undefined) await log.truncate(resumeOffset);
        throw error;
      } finally {
        await log?.close();
      }
    } finally {
      await unlock();
      process.removeListener('SIGINT', interrupt);
      process.removeListener('SIGTERM', interrupt);
    }
  }
}

function parseArguments(argv) {
  const [command, ...flags] = argv;
  if (!['run', 'report'].includes(command)) {
    throw new Error('Usage: node scripts/paired-tournament.mjs <run|report> --config ARM.json --out GAMES.jsonl [--clusters N] [--workers N] [--skip-exact]');
  }
  const args = {command};
  for (let index = 0; index < flags.length; index++) {
    const key = flags[index];
    if (!['--config', '--out', '--clusters', '--workers', '--skip-exact', '--exact-work-limit'].includes(key) || Object.hasOwn(args, key)) {
      throw new Error(`Unknown or duplicate flag: ${key}`);
    }
    if (key === '--skip-exact') args[key] = true;
    else {
      const value = flags[++index];
      if (!value || value.startsWith('--')) throw new Error(`Missing value for ${key}`);
      args[key] = value;
    }
  }
  if (!args['--config'] || !args['--out']) throw new Error('--config and --out are required');
  return args;
}

async function main(argv) {
  const args = parseArguments(argv);
  const protocol = await loadProtocol(args['--config']);
  const {manifest} = protocol;
  const clusterCount = args['--clusters'] === undefined ? manifest.initialClusters
    : integer(Number(args['--clusters']), '--clusters', 1, manifest.seeds.length);
  const seeds = manifest.seeds.slice(0, clusterCount);
  const output = path.resolve(args['--out']);
  const workers = args['--workers'] === undefined ? Math.min(4, availableParallelism()) : integer(Number(args['--workers']), '--workers', 1);
  const exactWorkLimit = args['--exact-work-limit'] === undefined ? undefined
    : integer(Number(args['--exact-work-limit']), '--exact-work-limit', 1);
  let games;
  if (args.command === 'run') games = await runGames(output, protocol, seeds, workers);
  else {
    await verifyManifest(output, manifest);
    games = await readGames(output, manifest);
    await verifyFiles(protocol.files);
  }
  const selected = new Set(seeds);
  const {summarizeTournament} = await import('./paired-tournament-stats.mjs');
  const result = summarizeTournament(games.filter(game => selected.has(game.seed)), {expectedSeeds: seeds,
    identicalPolicies: protocol.identicalPolicies, exactSignFlip: !args['--skip-exact'], exactWorkLimit});
  console.log(JSON.stringify({arm: manifest.arm, protocolId: manifest.protocolId, ...result}, null, 2));
}

if (!isMainThread) {
  const [rules, candidateEngine, baselineEngine, {applyAction}, {checkIntegrity, publicDecisionState, validateAction}] = await Promise.all([
    import(workerData.rulesUrl), import(workerData.candidate.url), import(workerData.baseline.url),
    import('./simulate.mjs'), import('./evaluate-selfplay.mjs')]);
  const gameConfig = {...workerData, rules, candidate: makePolicy(candidateEngine, workerData.candidate),
    baseline: makePolicy(baselineEngine, workerData.baseline), candidateTactical: workerData.candidate.policy === 'tactical',
    baselineTactical: workerData.baseline.policy === 'tactical', applyAction, checkIntegrity, publicDecisionState, validateAction};
  parentPort.on('message', leg => {
    try {
      parentPort.postMessage({game: playGame(gameConfig, leg)});
    } catch (error) {
      parentPort.postMessage({error: `Game ${legKey(leg)}: ${error.stack}`});
    }
  });
} else if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await main(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
