import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {createGame,applyKick,skipMove} from '../dist/engine.js';
import {createMatchStats,restoreMatchStats,recordMatchTransition,matchStatsSummary,shortPieceId} from '../dist/match-stats.js';
import {playerRatingsSummary} from '../dist/player-ratings.js';

const source=await readFile(new URL('../dist/app.js',import.meta.url),'utf8');
const start=source.indexOf('function renderMatchStats(){');
const end=source.indexOf("$('finishBtn').addEventListener",start);
assert.ok(start>=0&&end>start);
function report(game,stats){
  const elements=new Map(),renders=[];
  const $=id=>{
    if(!elements.has(id))elements.set(id,{id,hidden:false,open:false,textContent:'',innerHTML:'',showModal(){this.open=true;}});
    return elements.get(id);
  };
  const context=vm.createContext({game,matchStats:stats,$,TEAM:{white:'Ivory FC',black:'Obsidian FC'},
    matchStatsSummary,shortPieceId,playerRatingsSummary,
    renderPlayerRatings:(container,summary)=>renders.push({container,summary}),renderGoalMap:()=>{},
    coord:(x,y)=>`${String.fromCharCode(97+x)}${17-y}`});
  vm.runInContext(source.slice(start,end),context);
  return {$,renders,context,show:()=>vm.runInContext('showResult()',context)};
}

test('full time automatically includes both complete rating lineups without changing the match',()=>{
  const game=createGame({seed:15}),stats=createMatchStats();game.phase='finished';
  const before=JSON.stringify({game,stats}),h=report(game,stats);h.show();
  assert.equal(h.$('resultDialog').open,true);
  assert.equal(h.renders.length,1);assert.equal(h.renders[0].container.id,'playerRatings');
  const players=h.renders[0].summary.players;
  assert.equal(players.length,22);assert.equal(new Set(players.map(p=>p.pieceId)).size,22);
  assert.ok(players.every(p=>p.rating===6));
  assert.equal(JSON.stringify({game,stats}),before);
  h.show();assert.deepEqual(h.renders[1].summary,h.renders[0].summary,'reopening the report does not earn more credit');
});

test('the full-time pitch uses committed match contributions and a new match clears them',()=>{
  let game=createGame({seed:19,foulsEnabled:false});
  const q=game.pieces.find(p=>p.id==='white-Q');q.x=6;q.y=2;
  Object.assign(game,{phase:'kick',attack:'white',ball:{x:q.x,y:q.y,carrierId:q.id},offside:null,restart:null});
  let stats=createMatchStats();const pending=applyKick(game,6,-1);stats=recordMatchTransition(stats,game,pending);
  const scored=skipMove(pending,{roll:0});assert.equal(scored.lastAction.type,'goal');
  stats=recordMatchTransition(stats,pending,scored);game={...scored,phase:'finished'};
  const h=report(game,stats);h.show();
  const scorer=h.renders[0].summary.players.find(p=>p.pieceId==='white-Q');
  assert.ok(scorer.rating>6);assert.ok(scorer.actions>0);
  assert.equal(h.$('resultScore').textContent,'1 : 0');
  h.context.game={...createGame({seed:20}),phase:'finished'};h.context.matchStats=createMatchStats();h.show();
  assert.ok(h.renders.at(-1).summary.players.every(p=>p.rating===6));
  assert.equal(h.$('resultScore').textContent,'0 : 0');
});

test('old finished matches retain their result and explicitly identify incomplete rating history',()=>{
  const game={...createGame({seed:21}),phase:'finished'},saved=createMatchStats();delete saved.playerRatings;
  const stats=restoreMatchStats(saved,game),h=report(game,stats);h.show();
  assert.equal(h.$('resultScore').textContent,'0 : 0');
  assert.equal(h.renders[0].summary.partial,true);
  assert.equal(h.renders[0].summary.players.length,22);
});
