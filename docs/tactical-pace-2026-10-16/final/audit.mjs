import fs from 'node:fs';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import * as rules from './engine.mjs';
import * as productionRules from './production-engine.mjs';
import {applyAction, summary} from '../diagnosis/simulate.mjs';
const dir = new URL('.', import.meta.url);
const names = ['final-202610161-white', 'final-202610162-black'];
const matches = names.map(name => JSON.parse(fs.readFileSync(new URL(`${name}.json`, dir), 'utf8')));
const ruleKey = state => JSON.stringify([state.pieces.map(p => [p.id,p.team,p.type,p.x,p.y,p.originalType,p.replacementKeeper]),
  state.ball,state.attack,state.phase,state.positionBudget,state.restart,state.ballProgress,state.paceControl,state.offside,
  state.pendingShot,state.looseBallKickOrigin,state.releaseReason,state.passRun,state.discipline,state.sentOff,state.winner,state.finishReason]);
const details = matches.map(match => {
  assert.equal(match.error, null);
  assert.equal(match.actions, 480);
  let state = rules.createGame({mode:'local',seed:match.seed,kickoff:match.kickoff,minutes:10,foulsEnabled:true});
  let productionState = productionRules.createGame({mode:'local',seed:match.seed,kickoff:match.kickoff,minutes:10,foulsEnabled:true});
  const seen = new Map(), paceAwards = [], shotOutcomes = [], reasons = {}, scored = [];
  let maxRuleStateRepeat = 0, maxCarryingRounds = 0;
  for (const event of match.events) {
    const before = state;
    state = applyAction(rules, state, event.action);
    assert.deepEqual(state, event.state, `${match.label} exact transition ${event.step}`);
    productionState = applyAction(productionRules, productionState, event.action);
    assert.deepEqual(productionState, event.state, `${match.label} validation-only production fix preserves transition ${event.step}`);
    const key = ruleKey(state), count = (seen.get(key) || 0) + 1;
    seen.set(key, count); maxRuleStateRepeat = Math.max(maxRuleStateRepeat, count);
    maxCarryingRounds = Math.max(maxCarryingRounds, (state.paceControl?.dribbleRounds || 0) + (state.paceControl?.dribbledThisRound ? 1 : 0));
    const result = state.lastAction;
    if (result.type === 'stalling') {
      const reason = result.reason || result.restart?.reason || 'stalling';
      reasons[reason] = (reasons[reason] || 0) + 1;
      if (reason !== 'stalling') {
        if (reason === 'dribbleLimit') assert.equal(state.randomState, before.randomState, 'aborted fifth carry uses no random draws');
        assert.equal(state.restart.team, before.attack === 'white' ? 'black' : 'white');
        paceAwards.push({step:event.step,reason,offender:result.team,beneficiary:state.restart.team,
          pieceId:result.pieceId,offence:result.offence,cycleRounds:result.cycleRounds,rounds:result.rounds,
          history:before.paceControl?.history,triggeringAction:result.triggeringAction});
      }
    }
    if (before.phase === 'keeperReact') {
      const actual = result.type === 'stalling' ? result.triggeringAction : result;
      if (actual?.shotModel) shotOutcomes.push({step:event.step,team:before.pendingShot.shootingTeam,
        shooterId:before.pendingShot.shooterId,from:actual.from,goalTarget:actual.goalTarget,
        probability:actual.probability,distance:actual.shotModel.distance,outcome:actual.outcome,
        disguised:!!actual.disguised});
    }
    if (result.type === 'goal') scored.push({step:event.step,scorer:result.pieceId,team:result.team,from:result.from,
      probability:result.probability,score:state.score});
  }
  const attempts = match.stats.white.shots + match.stats.black.shots;
  const pendingShots = state.phase === 'keeperReact' ? 1 : 0;
  assert.equal(attempts, shotOutcomes.length + pendingShots);
  assert.ok(maxCarryingRounds <= rules.PACE_RULE.maxDribbleRounds);
  return {label:match.label,seed:match.seed,kickoff:match.kickoff,actions:match.actions,score:match.score,
    attempts,resolvedShots:shotOutcomes.length,pendingShots,postReactionXG:shotOutcomes.reduce((sum,x)=>sum+x.probability,0),
    paceAwardsByReason:reasons,paceAwards,maxBoardStateRepeat:match.maxExactRepeat,maxRuleStateRepeat,
    maxCarryingRounds,scored,shotOutcomes,checkpoints:match.checkpoints,
    exactTransitionsReplayed:match.events.length};
});
const combined = summary(matches);
const productionEngineSha256 = crypto.createHash('sha256').update(fs.readFileSync(new URL('./production-engine.mjs', import.meta.url))).digest('hex');
const report = {engineSha256:matches[0].engineSha256,productionEngineSha256,protocol:matches[0].protocol,aggregate:combined,matches:details,
  notes:['All transitions exactly replayed from original seeds.',
    'The production engine adds conservative malformed-save counter validation; every recorded valid-game transition exactly matches the frozen simulation engine.',
    'xG uses the actual goal target and goalkeeper reaction at resolution.',
    'Fixed atomic-action budget, not a timed 10-minute match.',
    'The shared simulation action counter includes any aborted fifth carry as a submitted move; paceAwards records these separately.',
    'Board repeat omits pace history for comparison with baseline; rule-state repeat includes pace and every other legal-future field except turn count, random seed and logs.']};
fs.writeFileSync(new URL('audit.json',dir),JSON.stringify(report,null,2));
process.stdout.write(JSON.stringify({engineSha256:report.engineSha256,aggregate:{matches:combined.matches,score:combined.score,
  shots:combined.totals.shots,xG:combined.totals.xG,maxBoardStateRepeat:combined.maxExactRepeat},
  matches:details.map(({paceAwards,shotOutcomes,...rest})=>rest)},null,2)+'\n');
