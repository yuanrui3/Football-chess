// Replay the exact same engine actions through both grading methods. No clock
// or rating enters AI decisions; this is a bounded audit, not a win-rate study.
import * as E from '../dist/engine.js';
import * as R from '../dist/player-ratings.js';
import * as old from '../docs/keeper-ratings-v4/baseline-player-ratings.mjs';
import {createMatchStats,recordMatchTransition} from '../dist/match-stats.js';
import {applyAction} from './simulate.mjs';
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';

const matches=[];
for(const seed of [91001,91002,91003,91004,92001,92002])for(const kickoff of ['white','black']){
  let game=E.createGame({seed,kickoff,mode:'watch',foulsEnabled:false});
  let stats=createMatchStats(),previous=old.createPlayerRatings(),continued=old.createPlayerRatings();
  const checkpoints=[];
  for(let step=1;step<=1200&&game.phase!=='finished';step++){
    const before=game,priorStats=stats;
    const assistId=before.phase==='keeperReact'?priorStats.pendingShot?.assistId
      :priorStats.lastPass?.receiverId===before.ball?.carrierId?priorStats.lastPass.providerId:null;
    game=applyAction(E,before,E.chooseAIAction(before,{difficulty:'casual'}));
    stats=recordMatchTransition(stats,before,game);
    const context={assistId,passProviderId:priorStats.lastPass?.providerId||null};
    previous=old.recordPlayerRatings(previous,before,game,context);
    continued=R.recordPlayerRatings(continued,before,game,context);
    assert.deepEqual(continued,previous,'continuing method3 must retain its exact original grading');
    if([180,360,720,1200].includes(step)){
      const original=old.playerRatingsSummary(previous,game).players;
      const revised=R.playerRatingsSummary(stats.playerRatings,game).players;
      for(const player of revised.filter(p=>p.type!=='K'))assert.deepEqual(player,original.find(p=>p.pieceId===player.pieceId),'outfield grades and explanations must remain unchanged');
      checkpoints.push({step,score:game.score,players:revised.map(p=>({id:p.pieceId,type:p.type,old:original.find(o=>o.pieceId===p.pieceId).rating,revised:p.rating,
        ...(p.type==='K'?{saves:p.metrics.saves,conceded:p.metrics.goalsConceded,xGPrevented:p.metrics.xGPrevented,
          oldParts:previous.players[p.pieceId].parts,newParts:stats.playerRatings.players[p.pieceId].parts,
          positioningCost:stats.playerRatings.players[p.pieceId].keeperPosition.totalCost}:{})}))});
    }
  }
  const result={seed,kickoff,heldOut:seed>=92000,checkpoints};matches.push(result);
  console.log(JSON.stringify({seed,kickoff,keepers:checkpoints.at(-1).players.filter(p=>p.type==='K')}));
  if(seed===91002&&kickoff==='black')await writeFile(new URL('../docs/keeper-ratings-v4/example-match.json',import.meta.url),JSON.stringify({game,matchStats:stats}));
  await writeFile(new URL('../docs/keeper-ratings-v4/audit.json',import.meta.url),JSON.stringify({baselineCommit:'a24a5881caf25ce01eaacbbc66595f9160c76297',actionsPerMatch:1200,difficulty:'casual',foulsEnabled:false,matches},null,2));
}
