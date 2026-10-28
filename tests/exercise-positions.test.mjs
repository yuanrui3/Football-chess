import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../dist/engine.js';
import {EXERCISES,createExercisePosition} from '../dist/exercise-positions.js';
import {createExerciseSession,applyExerciseAction,bestKeeperShotChance} from '../dist/exercise-session.js';
import {chooseExerciseAction} from '../dist/exercise-ai.js';

const byId=id=>EXERCISES.find(item=>item.id===id);
const EASY_EXERCISES=EXERCISES.filter(item=>item.difficulty==='easy');
function play(definition,actions=definition.exampleActions,{seed=1984,forceFinalRoll}={}) {
  let session=createExerciseSession(definition,{seed}),botActions=0;
  const transition=(action,bot=false)=>{
    const source=session,before=structuredClone(session);
    const overrides=session.game.phase==='keeperReact'&&forceFinalRoll!==undefined?{roll:forceFinalRoll}:{};
    session=applyExerciseAction(source,action,overrides);
    assert.deepEqual(source,before,'exercise application preserves every prior snapshot and RNG');
    if(bot)botActions++;
  };
  const respond=()=>{
    for(let allowance=0;session.status==='active'&&E.currentTeam(session.game)!==session.playerTeam;allowance++) {
      assert.ok(allowance<14,'the Tactical side must return a decision to the student');
      transition(chooseExerciseAction(session.game),true);
    }
  };
  for(const action of actions) {
    respond();
    assert.equal(session.status,'active','a canonical player step is never silently skipped');
    assert.equal(E.currentTeam(session.game),session.playerTeam);
    transition(action);
  }
  respond();
  return {session,botActions};
}

test('the first study set contains nine finishing studies and three defensive studies',()=>{
  assert.equal(EASY_EXERCISES.length,12);
  assert.equal(new Set(EXERCISES.map(d=>d.id)).size,EXERCISES.length);
  assert.equal(EASY_EXERCISES.filter(d=>d.side==='attack').length,9);
  assert.equal(EASY_EXERCISES.filter(d=>d.side==='defence').length,3);
  assert.deepEqual(Object.fromEntries(['one-on-one','through-ball','box-entry','defence'].map(theme=>[theme,EASY_EXERCISES.filter(d=>d.theme===theme).length])),
    {'one-on-one':3,'through-ball':3,'box-entry':3,defence:3});
  assert.ok(Object.isFrozen(EXERCISES));
  for(const d of EXERCISES) {
    assert.ok(Object.isFrozen(d));assert.ok(Object.isFrozen(d.position.pieces));
    assert.ok([3,4].includes(d.roundLimit));assert.equal(d.playerTeam,'white');
    assert.equal(d.hints.length,3);assert.ok(d.objective&&d.coachNote&&d.exampleActions.length);
    assert.ok(Object.isFrozen(d.goal));
  }
});

test('all diagrams are legal sparse positions with both goalkeepers and intact ball metadata',()=>{
  for(const d of EXERCISES) {
    const before=structuredClone(d),game=createExercisePosition(d,1984);
    assert.deepEqual(d,before,'constructing a position never edits the frozen definition');
    assert.equal(game.foulsEnabled,false);
    assert.ok(game.pieces.length>=5&&game.pieces.length<22,'these are reduced studies, not silently complete match squads');
    assert.equal(new Set(game.pieces.map(p=>p.id)).size,game.pieces.length);
    assert.equal(new Set(game.pieces.map(p=>p.x+','+p.y)).size,game.pieces.length);
    for(const p of game.pieces)assert.ok(E.canOccupySquare(p,p.x,p.y),`${d.id}: ${p.id} occupies a legal square`);
    for(const team of ['white','black'])assert.equal(game.pieces.filter(p=>p.team===team&&p.type==='K').length,1);
    assert.ok(game.pieces.filter(p=>p.team!==d.playerTeam).length>=2);
    const carrier=game.pieces.find(p=>p.id===game.ball.carrierId);
    assert.ok(carrier);assert.deepEqual({x:carrier.x,y:carrier.y},{x:game.ball.x,y:game.ball.y});
    assert.equal(carrier.team,game.attack);
    assert.deepEqual(createExercisePosition(d.id,1984),game,'id and definition construction agree');
    if(game.phase==='keeperReact')assert.ok(game.pendingShot&&game.pendingShot.scoringTeam==='black');
    else assert.equal(game.pendingShot,null);
  }
  assert.throws(()=>createExercisePosition('missing-study'),RangeError);
});

for(const d of EASY_EXERCISES) test(`${d.id}: an illustrative route succeeds against the study opponent within the round limit`,()=>{
  for(const seed of [1984]) {
    const {session,botActions}=play(d,d.exampleActions,{seed});
    assert.equal(session.status,'solved',`${d.id}, seed ${seed}: ${session.feedback}`);
    assert.ok(session.roundsUsed<=d.roundLimit);
    if(d.side==='attack') {
      assert.ok(botActions>0,'the native Tactical goalkeeper must respond');
      assert.ok(session.metrics.lastShotXG>=d.goal.minShotXG-1e-9);
    } else if(d.id==='pawn-before-the-shot')assert.equal(session.reason,'possession-won');
    else assert.ok(session.metrics.lastOpponentShotXG<=d.goal.maxOpponentShotXG+1e-9);
  }
});

test('different knight targets and a queen single aim or disguise all satisfy the same objective',()=>{
  const knight=byId('knights-two-posts');
  for(const action of [{type:'kick',x:5,y:-1},{type:'kick',x:7,y:-1},{type:'kick',x:5,y:-1,disguise:true}])
    assert.equal(play(knight,[action]).session.status,'solved');
  const queen=byId('queen-two-targets');
  for(const action of [{type:'kick',x:6,y:-1},{type:'kick',x:8,y:-1},{type:'kick',x:6,y:-1,disguise:true}])
    assert.equal(play(queen,[action]).session.status,'solved');
});

test('the cross admits a stronger carry before shooting, rather than enforcing the example route',()=>{
  const d=byId('cross-to-the-middle'),baseline=play(d).session;
  const alternative=play(d,[{type:'kick',x:7,y:2},{type:'move',pieceId:'white-Q',x:8,y:1},{type:'skip'},{type:'kick',x:8,y:-1}]).session;
  assert.equal(alternative.status,'solved');assert.equal(alternative.progress.boxEntry,true);
  assert.ok(alternative.metrics.lastShotXG>baseline.metrics.lastShotXG+.25);
});

test('screening and keeper bonus may be played in either order',()=>{
  const d=byId('screen-and-cover');
  const alternative=play(d,[{type:'move',pieceId:'white-K',x:7,y:16,freePawn:true},
    {type:'move',pieceId:'white-R1',x:6,y:13},{type:'move',pieceId:'white-K',x:6,y:16}]).session;
  assert.equal(alternative.status,'solved');assert.ok(alternative.metrics.lastOpponentShotXG<.15);
});

test('the illustrative through-ball routes cross a nearby defensive line',()=>{
  for(const d of EASY_EXERCISES.filter(d=>d.theme==='through-ball')) {
    const game=createExercisePosition(d),action=d.exampleActions[0];
    const after=E.applyKick(game,action.x,action.y);
    assert.equal(after.ball.carrierId,null,'the teaching delivery is into space');
    assert.equal(after.lastAction.outcome,'complete');
    const a=after.lastAction,gain=(from,to)=>from.y-to.y;
    assert.ok(gain(a.from,a.to)>=2);
    assert.ok(game.pieces.some(p=>p.team==='black'&&p.type!=='K'&&gain(a.from,p)>0&&gain(p,a.to)>0
      &&Math.abs(p.x-(a.from.x+(a.to.x-a.from.x)*(p.y-a.from.y)/(a.to.y-a.from.y)))<=2));
  }
});

test('the wide-carry study starts with a poor shot and rewards a real improvement in angle',()=>{
  const d=byId('carry-inward'),game=createExercisePosition(d),shooting={...game,phase:'kick'};
  const initial=E.legalKicks(shooting).filter(k=>k.goal==='white'&&!k.offside)
    .map(k=>bestKeeperShotChance(E.applyKick(shooting,k.x,k.y)));
  assert.ok(Math.max(...initial)<.1);
  const result=play(d).session;assert.ok(result.metrics.lastShotXG>.8);
});

test('good finishes still solve when the native outcome is deliberately forced to miss',()=>{
  const d=byId('pick-the-open-file'),result=play(d,d.exampleActions,{forceFinalRoll:.999999}).session;
  assert.equal(result.status,'solved');assert.equal(result.metrics.shotResult.goal,false);
  assert.ok(result.metrics.lastShotXG>.9);
});
