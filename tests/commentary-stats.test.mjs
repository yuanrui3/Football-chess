import test from 'node:test';
import assert from 'node:assert/strict';
import {commentaryStatsLines,STAT_COMMENTARY_SCRIPTS} from '../dist/commentary-stats.js';
import {createMatchStats,matchStatsSummary} from '../dist/match-stats.js';
const state=()=>({attack:'white',phase:'attackMove',restart:null,pendingShot:null});
function summary({whiteShots=7,blackShots=3,whiteMs=63000,blackMs=37000,partial=false}={}) {
  const stats=createMatchStats({partial});
  Object.assign(stats.teams.white,{shots:whiteShots,onTarget:Math.min(3,whiteShots),possessionMs:whiteMs});
  Object.assign(stats.teams.black,{shots:blackShots,onTarget:Math.min(2,blackShots),possessionMs:blackMs});
  return matchStatsSummary(stats);
}

test('finite immutable whole-sentence scripts include exact count grammar and approximate percentages',()=>{
  assert.equal(Object.keys(STAT_COMMENTARY_SCRIPTS).length,106);
  assert.ok(Object.isFrozen(STAT_COMMENTARY_SCRIPTS));
  assert.equal(STAT_COMMENTARY_SCRIPTS.stat_shots_white_1.text,'Ivory have taken one shot so far.');
  assert.equal(STAT_COMMENTARY_SCRIPTS.stat_shots_white_7.text,'Ivory have taken seven shots so far.');
  assert.equal(STAT_COMMENTARY_SCRIPTS.stat_shots_white_30.text,'Ivory have taken thirty shots so far.');
  assert.equal(STAT_COMMENTARY_SCRIPTS.stat_possession_white_65.text,'Ivory have had about sixty five percent of the ball.');
  for(const value of Object.values(STAT_COMMENTARY_SCRIPTS))assert.ok(Object.isFrozen(value));
});

test('shot calls use each team actual public count and carry exact figures',()=>{
  const lines=commentaryStatsLines(summary(),state());
  for(const [team,count] of [['white',7],['black',3]]) {
    const call=lines.find(line=>line.team===team&&line.statsCommentary.type==='shots');
    assert.equal(call.clipKey,'stat_shots_'+team+'_'+count);assert.equal(call.statsCommentary.shots,count);
    assert.equal(call.text,STAT_COMMENTARY_SCRIPTS[call.clipKey].text);assert.equal(call.kind,'trend');
  }
  assert.equal(lines[0].team,'white');
});

test('rounding possession never changes the exact metadata or invents precise spoken numbers',()=>{
  const call=commentaryStatsLines(summary(),state()).find(line=>line.statsCommentary.type==='possession');
  assert.equal(call.team,'white');assert.equal(call.clipKey,'stat_possession_white_65');
  assert.equal(call.statsCommentary.possessionPercent,63);assert.equal(call.statsCommentary.spokenPossessionPercent,65);
  assert.match(call.text,/about sixty five percent/);assert.equal(call.statsCommentary.totalPossessionMs,100000);
});

test('possession mirrors sides and a level split follows current attacking team',()=>{
  const black=commentaryStatsLines(summary({whiteMs:37000,blackMs:63000}),state()).filter(line=>line.statsCommentary.type==='possession');
  assert.equal(black.length,1);assert.equal(black[0].team,'black');assert.equal(black[0].statsCommentary.possessionPercent,63);assert.match(black[0].text,/^Obsidian have had/);
  const equal=commentaryStatsLines(summary({whiteMs:30000,blackMs:30000}),{...state(),attack:'black'}).find(line=>line.statsCommentary.type==='possession');
  assert.equal(equal.team,'black');assert.equal(equal.clipKey,'stat_possession_black_50');
});

test('possession needs a full minute of recorded active play; raw early ratios are not enough',()=>{
  for(const total of [0,10000,59999]) {
    const lines=commentaryStatsLines(summary({whiteMs:total,blackMs:0}),state());
    assert.ok(!lines.some(line=>line.statsCommentary.type==='possession'));
    assert.ok(lines.some(line=>line.statsCommentary.type==='shots'));
  }
  assert.ok(commentaryStatsLines(summary({whiteMs:60000,blackMs:0}),state()).some(line=>line.clipKey==='stat_possession_white_100'));
});

test('small shot totals stay quiet, and very large totals use honest bounded wording',()=>{
  const quiet=commentaryStatsLines(summary({whiteShots:2,blackShots:1}),state());
  assert.ok(!quiet.some(line=>line.statsCommentary.type==='shots'));
  for(const shots of [31,52,100]) {
    const call=commentaryStatsLines(summary({whiteShots:shots}),state()).find(line=>line.team==='white'&&line.statsCommentary.type==='shots');
    assert.equal(call.clipKey,'stat_shots_white_over30');assert.equal(call.statsCommentary.shots,shots);
    assert.match(call.text,/more than thirty/);
  }
});

test('partial or unknown records are never announced as full match totals',()=>{
  const partial=summary({partial:true});assert.deepEqual(commentaryStatsLines(partial,state()),[]);
  delete partial.partial;assert.deepEqual(commentaryStatsLines(partial,state()),[]);
  assert.deepEqual(commentaryStatsLines(null,state()),[]);
});

test('invalid and contradictory possession metrics cannot produce a spoken possession claim',()=>{
  for(const mutate of [s=>s.teams.white.possessionMs=-1,s=>s.teams.black.possessionPercent=null,
    s=>s.teams.white.possessionPercent=100.1,s=>s.teams.white.possessionPercent=50,
    s=>s.teams.white.possessionMs=Infinity]) {
    const input=summary();mutate(input);
    assert.ok(!commentaryStatsLines(input,state()).some(line=>line.statsCommentary.type==='possession'));
  }
});

test('bad shot counts or impossible on-target totals are not narrated',()=>{
  for(const count of [-1,NaN,Infinity,3.2]) {
    const input=summary();input.teams.white.shots=count;
    assert.ok(!commentaryStatsLines(input,state()).some(line=>line.team==='white'&&line.statsCommentary.type==='shots'));
  }
  const input=summary();input.teams.white.onTarget=8;
  assert.ok(!commentaryStatsLines(input,state()).some(line=>line.team==='white'&&line.statsCommentary.type==='shots'));
});

test('stats wait through setup, restarts, pending shots and full time',()=>{
  for(const phase of ['kickoff','keeperReact','keeperRelease','finished'])assert.deepEqual(commentaryStatsLines(summary(),{...state(),phase}),[]);
  assert.deepEqual(commentaryStatsLines(summary(),{...state(),restart:{type:'corner'}}),[]);
  assert.deepEqual(commentaryStatsLines(summary(),{...state(),pendingShot:{}}),[]);
});

test('stats analysis is read-only and carries stable type/team keys',()=>{
  const input=summary(),position=state(),before=structuredClone({input,position});
  const first=commentaryStatsLines(input,position),second=commentaryStatsLines(input,position);
  assert.deepEqual(first,second);assert.deepEqual({input,position},before);
  assert.equal(first.find(line=>line.clipKey==='stat_shots_white_7').statsCommentary.key,'shots:white');
});
