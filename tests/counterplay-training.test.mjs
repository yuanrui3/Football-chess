import test from 'node:test';
import assert from 'node:assert/strict';
import {createLearner, FEATURE_NAMES, expectedTrainingLeaf, chooseTrainingAction} from '../scripts/rl-training.mjs';
import {chooseOpponent, generateCounterplayEpisode, replayCounterplayEpisode, createCounterLearner, expectedPriorUpdate, priorValue,searchBackupTarget,searchBackupUpdate,featureNamesFor,counterplayFeatures,residualPrediction} from '../scripts/counterplay-training.mjs';
import {parseArguments,enrichCounterplayMetadata,migrateFeatureCheckpoint} from '../scripts/train-counterplay.mjs';
import {RL_CONTEXT_FEATURE_NAMES} from '../scripts/rl-context-features.mjs';
import {RL_SHOT_FEATURE_NAMES} from '../scripts/rl-shot-features.mjs';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const zero = () => Array(FEATURE_NAMES.length).fill(0);
function toy() {
  const rules = {
    createGame: ({seed,kickoff}) => ({phase:'kick',team:'white',attack:kickoff,step:0,score:{white:0,black:0},randomState:seed}),
    currentTeam: s => s.team,
    rankedTacticalActions: () => [{action:{type:'kick',x:0,y:0}}],
    tacticalSuccessors: (s,a) => [{probability:1,state:rules.applyKick(s,a.x)}],
    tacticalBasePositionValue: s => 1000*(s.score.white-s.score.black),
    rlValuePrediction: () => 0,
    rlValueFeatures: s => [s.team==='white'?1:-1,.5,0,0,0,0,0],
    legalKicks: () => [{x:0,y:0}],
    applyKick: s => ({...s,randomState:s.randomState+3,step:s.step+1,team:s.step===0?'white':'black',phase:s.step===2?'finished':'kick',score:{...s.score,[s.team]:s.score[s.team]+1}}),
    chooseAIAction: () => ({type:'kick',x:0,y:0}),
    analyzeTacticalAction: s => {assert.equal(s.randomState,1); return {action:{type:'kick',x:0,y:0}};},
  }; return rules;
}
test('counterplay alternates learner colors, keeps consecutive actions, and uses fixed-white goal rewards',()=>{
  const rules=toy(), first=generateCounterplayEpisode(rules,rules,zero(),{actions:3,episode:0,baselineFraction:1});
  assert.equal(first.stats.learnerTeam,'white'); assert.equal(first.stats.learnerActions,2); assert.equal(first.stats.opponentActions,1);
  assert.deepEqual(first.transitions.map(t=>t.actualReward),[1,1,-1]);
  const other=generateCounterplayEpisode(rules,rules,zero(),{actions:3,episode:1,baselineFraction:1});
  assert.equal(other.stats.learnerTeam,'black'); assert.equal(other.stats.learnerActions,1); assert.equal(other.stats.goalDifference,-1);
  assert.deepEqual(first.stats.policyWeights,zero());
});
test('7/28/37 encoders dispatch independently and zero-extension preserves predictions without inventing experience',()=>{
  const rules={RL_CONTEXT_FEATURE_NAMES,RL_SHOT_FEATURE_NAMES,RL_VALUE_MODEL:{featureNames:RL_SHOT_FEATURE_NAMES},rlValueFeatures:()=>Array(7).fill(.1),rlContextFeatures:()=>Array(28).fill(.2),rlShotFeatures:()=>Array(37).fill(.3)};
  assert.equal(featureNamesFor(rules).length,37); assert.equal(featureNamesFor(rules,28).length,28); assert.equal(featureNamesFor(rules,7).length,7);
  assert.equal(counterplayFeatures(rules,{},37)[0],.3); assert.equal(counterplayFeatures(rules,{},28)[0],.2); assert.equal(counterplayFeatures(rules,{},7)[0],.1);
  const prior={featureNames:[...RL_CONTEXT_FEATURE_NAMES],weights:Array(28).fill(.1),initialWeights:Array(28).fill(0),training:{episodes:24,totalTransitions:8960,goalEvents:17,originInitialWeights:Array(28).fill(0)}};
  const migrated=migrateFeatureCheckpoint(prior,RL_SHOT_FEATURE_NAMES,{sourceCheckpointSha256:'original-sha',targetEngineSha256:'shot-engine-sha'});
  assert.equal(migrated.weights.length,37); assert.deepEqual(migrated.weights.slice(28),Array(9).fill(0));
  assert.equal(migrated.training.totalTransitions,8960); assert.equal(migrated.training.goalEvents,17); assert.equal(migrated.training.episodes,24);
  assert.equal(migrated.migrations[0].addedTrainingTransitions,0); assert.equal(migrated.migrations[0].sourceCheckpointSha256,'original-sha');
  assert.equal(residualPrediction(Array(28).fill(.2),prior.weights),residualPrediction([...Array(28).fill(.2),...Array(9).fill(.9)],migrated.weights));
  assert.throws(()=>migrateFeatureCheckpoint(prior,[...RL_SHOT_FEATURE_NAMES].reverse()));
});
test('rollouts are deterministic, do not update weights, and TD replay truly updates them',()=>{
  const rules=toy(), weights=zero(), config={actions:3,episode:2,epsilon:.3};
  const a=generateCounterplayEpisode(rules,rules,weights,config), b=generateCounterplayEpisode(rules,rules,weights,config);
  assert.deepEqual(a,b); assert.deepEqual(weights,zero());
  const learner=createCounterLearner({weights:zero()}), result=replayCounterplayEpisode(learner,a);
  assert.equal(learner.updates,3); assert.ok(result.updateL1>0); assert.ok(learner.weights.some(x=>x!==0)); assert.equal(result.finalBootstrap,0);
});
test('a constant zero prior and zero-reward trajectory from zero has no fabricated update',()=>{
  const learner=createCounterLearner({weights:zero()});
  replayCounterplayEpisode(learner,{stats:{},transitions:[{features:[1,.5,1,1,1,1,1],prior:0,outcomes:[{probability:1,features:zero(),prior:0,reward:0,terminal:false}],actualTerminal:false}]});
  assert.deepEqual(learner.weights,zero());
});
test('the expected target preserves the deployed handcrafted prior and integrates public chance',()=>{
  const learner=createCounterLearner({weights:zero(),alpha:.001,gamma:.99,lambda:0});
  const features=[1,0,0,0,0,0,0];
  const transition={features,prior:2,outcomes:[{probability:.2,features,prior:3,reward:1,terminal:false},{probability:.8,features,prior:1,reward:0,terminal:false}]};
  const expected=.2*(25+.99*3)+.8*.99-2, update=expectedPriorUpdate(learner,transition);
  assert.ok(Math.abs(update.delta-expected)<1e-12); assert.ok(Math.abs(learner.weights[0]-.001*expected)<1e-12);
  const rules=toy(); assert.equal(priorValue(rules,{phase:'kick',score:{white:2,black:1}}),(1000-2000)/80);
  assert.equal(priorValue(rules,{phase:'finished',score:{white:2,black:1}}),0);
});
test('the potential correction telescopes, leaving only discounted goals and a fixed initial offset',()=>{
  const gamma=.995, priors=[2,-.5,3,0], rewards=[0,1,0];
  const shaped=rewards.reduce((sum,reward,i)=>sum+gamma**i*(25*reward+gamma*priors[i+1]-priors[i]),0);
  const goalOnly=rewards.reduce((sum,reward,i)=>sum+gamma**i*25*reward,0);
  assert.ok(Math.abs(shaped-(goalOnly-priors[0]))<1e-12);
});
test('generic contextual models retain dimensions and terminal continuation is zero',()=>{
  const learner=createCounterLearner({weights:Array(28).fill(0),alpha:.001,gamma:.99,lambda:.97});
  const features=Array(28).fill(.1);
  expectedPriorUpdate(learner,{features,prior:2,outcomes:[{probability:1,reward:1,prior:100,features,terminal:true}]});
  assert.equal(learner.weights.length,28); assert.ok(learner.weights.every(x=>Math.abs(x-.0023)<1e-12));
});
test('S320 scales the prior, goal reward, beam behavior, and Tactical request consistently',()=>{
  const rules=toy();
  assert.equal(priorValue(rules,{phase:'kick',score:{white:2,black:1}},320),-1000/320);
  const learner=createCounterLearner({weights:[0],residualScale:320,alpha:.001,gamma:0,lambda:0});
  const update=expectedPriorUpdate(learner,{features:[1],prior:0,outcomes:[{probability:1,reward:1,features:[0],prior:0,terminal:true}]});
  assert.equal(update.target,6.25);
  rules.rankedTacticalActions=()=>[0,1].map(x=>({action:{type:'kick',x,y:0}}));
  rules.tacticalSuccessors=(s,a)=>[{probability:1,state:{...s,quality:a.x}}];
  rules.tacticalBasePositionValue=s=>s.quality===0?40:0;
  rules.rlValuePrediction=s=>s.quality===1?.2:0;
  const state=rules.createGame({seed:99});
  assert.equal(chooseTrainingAction(rules,state,zero(),{residualScale:80}).action.x,0);
  assert.equal(chooseTrainingAction(rules,state,zero(),{residualScale:320}).action.x,1);
  assert.equal(expectedTrainingLeaf(rules,{...state,quality:1},zero(),320),64);
  rules.analyzeTacticalAction=(s,o)=>{assert.equal(o.modelScale,320);return {action:{type:'kick',x:1,y:0}};};
  chooseTrainingAction(rules,state,zero(),{policy:'tactical',residualScale:320});
  assert.equal(parseArguments(['--residual-scale','320']).residualScale,320);
  assert.throws(()=>parseArguments(['--residual-scale','160']));
});
test('search-backup target uses actor perspective, cancels the score ledger, and ignores incomplete or extreme searches',()=>{
  const rules=toy(); rules.tacticalBasePositionValue=s=>2000*(s.score.white-s.score.black)+17;
  const state={phase:'kick',team:'white',score:{white:2,black:1}}, decision={completedDepth:2,searchValue:2049};
  assert.equal(searchBackupTarget(rules,state,decision,320),.1);
  assert.equal(searchBackupTarget(rules,{...state,team:'black'},{...decision,searchValue:-2049},320),.1);
  assert.equal(searchBackupTarget(rules,{...state,score:{white:0,black:0}},{...decision,searchValue:49},320),.1);
  assert.equal(searchBackupTarget(rules,state,decision,80),.4);
  assert.equal(searchBackupTarget(rules,state,{...decision,completedDepth:0},320),null);
  assert.equal(searchBackupTarget(rules,state,{...decision,searchValue:1e6},320),null);
  assert.equal(searchBackupTarget(rules,state,{...decision,searchValue:Infinity},320),null);
  assert.equal(searchBackupTarget(rules,state,{...decision,searchValue:10000},320),.95);
});
test('search-backup fitting has the exact tanh gradient, is optional, and excludes frozen baseline reports',()=>{
  const off=createCounterLearner({weights:[.2]}), before=[...off.weights];
  assert.equal(searchBackupUpdate(off,[1],.4).applied,false); assert.deepEqual(off.weights,before);
  const learner=createCounterLearner({weights:[.2],searchBackupAlpha:.0003});
  const prediction=Math.tanh(.2); searchBackupUpdate(learner,[1],.4);
  assert.ok(Math.abs(learner.weights[0]-(.2+.0003*(.4-prediction)*(1-prediction**2)))<1e-12);
  const rules=toy(); rules.tacticalBasePositionValue=()=>0;
  rules.analyzeTacticalAction=()=>({action:{type:'kick',x:0,y:0},value:10,stats:{completedDepth:1,nodes:8}});
  const rollout=generateCounterplayEpisode(rules,rules,zero(),{actions:3,policy:'tactical',epsilon:0,baselineFraction:1,searchBackupAlpha:.0003});
  assert.equal(rollout.transitions.filter(t=>t.searchTarget!==undefined&&t.searchTarget!==null).length,2);
  assert.equal(rollout.transitions[2].searchTarget,undefined,'frozen opponent is not a teacher');
  const stats=replayCounterplayEpisode(createCounterLearner({weights:zero(),searchBackupAlpha:.0003}),rollout);
  assert.equal(stats.searchBackupUpdates,2); assert.ok(stats.searchBackupUpdateL1>0);
  assert.equal(parseArguments(['--search-backup-alpha','.0003']).searchBackupAlpha,.0003);
  assert.throws(()=>parseArguments(['--search-backup-alpha','-1']));
});
test('color-reflected expected TD updates are identical and do not depend on a sampled goal',()=>{
  const first=createCounterLearner({weights:[.2,-.1]}),second=createCounterLearner({weights:[.2,-.1]});
  const transition={features:[.4,-.2],prior:.3,outcomes:[{probability:.3,reward:1,features:[.2,.1],prior:.5,terminal:false},{probability:.7,reward:0,features:[.3,-.1],prior:.1,terminal:false}]};
  const reflected={features:transition.features.map(x=>-x),prior:-transition.prior,outcomes:transition.outcomes.map(o=>({...o,reward:-o.reward,prior:-o.prior,features:o.features.map(x=>-x)}))};
  expectedPriorUpdate(first,transition); expectedPriorUpdate(second,reflected); assert.deepEqual(first.weights,second.weights);
});
test('real-engine worker rollout reproduces the same one-episode weights as serial rollout',async()=>{
  const dir=await mkdtemp(path.join(tmpdir(),'football-counterplay-'));
  try {
    const engine=path.join(dir,'engine.mjs'); await writeFile(engine,await readFile(new URL('../dist/engine.js',import.meta.url),'utf8'));
    const cli=new URL('../scripts/train-counterplay.mjs',import.meta.url).pathname;
    const common=['--episodes','1','--actions','12','--seed','230001','--engine',engine,'--baseline-fraction','1','--baseline-nodes','8'];
    await Promise.all([1,2].map(workers=>promisify(execFile)(process.execPath,[cli,...common,'--workers',String(workers),'--out',path.join(dir,String(workers))])));
    const [serial,parallel]=await Promise.all([1,2].map(n=>readFile(path.join(dir,String(n),'training-episodes.json'),'utf8').then(JSON.parse)));
    assert.deepEqual(serial,parallel); assert.equal(serial[0].actions,12);
    const model=JSON.parse(await readFile(path.join(dir,'2','model.json'),'utf8')); assert.equal(model.training.totalTransitions,12); assert.equal(model.training.seeds[0],230001);
  } finally {await rm(dir,{recursive:true,force:true});}
});
test('opponent pools and CLI configurations are deterministic and validated',()=>{
  assert.equal(chooseOpponent(3,{baselineFraction:1}),'baseline');
  assert.equal(chooseOpponent(3,{baselineFraction:0,poolWeights:zero()}),'checkpoint');
  assert.equal(chooseOpponent(2,{baselineFraction:0,poolWeights:zero()}),'selfplay');
  assert.throws(()=>chooseOpponent(0,{baselineFraction:2}));
  assert.equal(parseArguments(['--workers','2','--baseline-nodes','256']).baselineNodes,256);
  assert.throws(()=>parseArguments(['--workers','0'])); assert.throws(()=>parseArguments(['--baseline-fraction','2']));
});
test('checkpoint goal counts exclude warmup and run lineage retains training hyperparameters',()=>{
  const prior={training:{whiteGoals:3,blackGoals:2,searchBackupUpdates:3,runs:[{seed:120000,episodes:8}]},config:{seed:120000,alpha:.001,baselineNodes:128,baselineFraction:.5}};
  const episodes=[{score:{white:9,black:8},initialScore:{white:8,black:6},goalEvents:[{reward:1},{reward:-1},{reward:-1}],searchBackupUpdates:5}];
  const config={seed:140000,actions:160,alpha:.0005,baselineNodes:1400,baselineFraction:1,warmup:80};
  const result=enrichCounterplayMetadata({training:{whiteGoals:12,blackGoals:10}},episodes,config,prior);
  assert.equal(result.training.whiteGoals,4); assert.equal(result.training.blackGoals,4);
  assert.equal(result.training.searchBackupUpdates,8);
  assert.equal(result.training.runs[0].alpha,.001); assert.equal(result.training.runs[1].alpha,.0005);
  assert.equal(result.training.runs[1].baselineNodes,1400); assert.equal(result.training.runs[1].warmup,80);
});
