import test from 'node:test';
import assert from 'node:assert/strict';
import {EXERCISES,createExercisePosition} from '../dist/exercise-positions.js';
import {BOARD_HEIGHT,GOAL_FILES,inOwnBox} from '../dist/engine.js';

const originalIds=['pick-the-open-file','knights-two-posts','queen-two-targets',
  'release-the-knight','diagonal-pocket','pass-down-the-channel','diagonal-delivery',
  'cross-to-the-middle','carry-inward','pawn-before-the-shot','screen-and-cover','cover-the-declared-aim'];

test('42 studies retain the first 36 IDs and add two midfield studies per tier',()=>{
  assert.equal(EXERCISES.length,42);
  assert.equal(new Set(EXERCISES.map(d=>d.id)).size,42);
  assert.deepEqual(EXERCISES.slice(0,12).map(d=>d.id),originalIds);
  for(const difficulty of ['easy','medium','tough']){
    const list=EXERCISES.filter(d=>d.difficulty===difficulty);
    assert.equal(list.length,14,difficulty);
    assert.equal(list.filter(d=>d.side==='attack').length,9,difficulty);
    assert.equal(list.filter(d=>d.side==='defence').length,3,difficulty);
    assert.equal(list.filter(d=>d.side==='midfield').length,2,difficulty);
  }
});

test('new plan lengths count student moves, passes and shots separately from ending positioning',()=>{
  for(const d of EXERCISES.filter(d=>d.difficulty!=='easy')){
    const range=d.difficulty==='medium'?[2,3]:d.id==='tough-knight-wall-pass'?[5]:[3,4];
    assert.ok(range.includes(d.planSteps),`${d.id}: expected ${range.join('–')} steps`);
    assert.equal(d.exampleActions.filter(a=>a.type!=='skip').length,d.planSteps,`${d.id}: truthful step label`);
    assert.ok([3,4].includes(d.roundLimit));
  }
});

test('larger study diagrams use legal pieces from the real squad inventory',()=>{
  const inventory={K:1,Q:1,R:2,B:2,N:2,P:3};
  for(const d of EXERCISES){
    const game=createExercisePosition(d),pieces=game.pieces;
    if(d.difficulty==='medium')assert.ok(pieces.length>=10&&pieces.length<=14,`${d.id}: Medium density`);
    if(d.difficulty==='tough')assert.ok(pieces.length>=14&&pieces.length<=18,`${d.id}: Tough density`);
    for(const team of ['white','black'])for(const [type,max]of Object.entries(inventory)){
      const squad=pieces.filter(p=>p.team===team&&p.type===type);
      assert.ok(squad.length<=max,`${d.id}: ${team} has too many ${type}`);
      for(const p of squad)assert.match(p.id,new RegExp(`^${team}-${type}${max===1?'':`[1-${max}]`}$`));
    }
  }
});

test('study keepers start in a natural goalmouth position and shade only toward a wide threat',()=>{
  const central=GOAL_FILES.slice(1,-1),leftPost=GOAL_FILES[0],rightPost=GOAL_FILES.at(-1);
  for(const d of EXERCISES){
    const game=createExercisePosition(d),ball=game.ball;
    for(const keeper of game.pieces.filter(p=>p.type==='K')){
      assert.ok(inOwnBox(keeper.team,keeper.x,keeper.y),`${d.id}: ${keeper.id} starts in its own box`);
      const home=keeper.team==='white'?BOARD_HEIGHT-1:0;
      assert.ok(Math.abs(keeper.y-home)<=1,`${d.id}: ${keeper.id} starts on the goal line or one square out`);
      const defending=keeper.team!==game.attack;
      const natural=central.includes(keeper.x)||defending&&(
        keeper.x===leftPost&&ball.x<=leftPost-2||keeper.x===rightPost&&ball.x>=rightPost+2);
      assert.ok(natural,`${d.id}: ${keeper.id} covers the centre or shades toward a genuinely wide ball`);
    }
  }
});
