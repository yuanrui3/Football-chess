import test from 'node:test';
import assert from 'node:assert/strict';
import {MIDFIELD_EXERCISES} from '../dist/exercise-midfield.js';
import {EXERCISES} from '../dist/exercise-positions.js';
import {createExerciseSession,applyExerciseAction} from '../dist/exercise-session.js';
import {normalizeMidfieldGoal,inExerciseZone,midfieldGoalText} from '../dist/exercise-midfield-goals.js';
import {exerciseOutcomeText,filterExercises,readExerciseProgress} from '../dist/exercises-app.js';
import {legalMoves} from '../dist/engine.js';
import {findExerciseCapture} from '../dist/exercise-ai.js';

const p=(id,x,y)=>({id,team:id.split('-')[0],type:id.split('-')[1][0],x,y});
const zone={x0:4,x1:10,y0:6,y1:10};
const move=(pieceId,x,y,freePawn=false)=>({type:'move',pieceId,x,y,freePawn});
const skip={type:'skip'};
const definition=(changes={})=>({id:'midfield-test',title:'Midfield test',side:'midfield',playerTeam:'white',roundLimit:3,
  goal:{type:'possession',kind:'protect',zone,secureReplies:2},
  position:{pieces:[p('white-K',6,16),p('black-K',6,0),p('white-Q',6,8),p('white-R1',9,8),p('black-P1',2,3)],carrierId:'white-Q',phase:'attackMove',attack:'white'},...changes});
const apply=(s,a,overrides)=>applyExerciseAction(s,a,overrides);
const oneReply=s=>apply(apply(s,skip),skip);

test('six midfield studies append without renumbering the existing studies and expose both themes',()=>{
  assert.deepEqual(EXERCISES.slice(36).map(d=>d.id),MIDFIELD_EXERCISES.map(d=>d.id));
  for(const level of ['easy','medium','tough'])for(const theme of ['switch-play','protect-ball']){
    const choices=filterExercises(EXERCISES,{difficulty:level,theme});assert.equal(choices.length,1);
    const d=choices[0];assert.equal(d.side,'midfield');assert.equal(d.goal.type,'possession');
    assert.equal(d.exampleActions.filter(a=>a.type!=='skip').length,d.planSteps);
    assert.equal(createExerciseSession(d).status,'active','opening a study cannot complete it');
    assert.match(exerciseOutcomeText(d),/No shot|no shot/);
  }
  const old=EXERCISES[0],progress=readExerciseProgress({getItem:()=>JSON.stringify({version:1,solved:{[old.id]:true},solvedRevisions:{[old.id]:old.revision},lastId:old.id})});
  assert.equal(progress.solved[old.id],true);assert.equal(progress.lastId,old.id);
});

test('midfield target bounds and defensive reply counts are validated',()=>{
  const g=definition().goal;
  for(const change of [{secureReplies:0},{secureReplies:4},{secureReplies:1.5},{kind:'finish'},
    {zone:{...zone,x0:-1}},{zone:{...zone,x1:14}},{zone:{...zone,y1:17}},{zone:{...zone,y0:11}},{zone:{...zone,x0:4.5}}])
    assert.throws(()=>normalizeMidfieldGoal({...g,...change}),/midfield/);
  assert.ok(inExerciseZone({x:4,y:6},zone));assert.ok(inExerciseZone({x:10,y:10},zone));
  assert.equal(inExerciseZone({x:11,y:10},zone),false);
  assert.match(midfieldGoalText(g),/e7–k11/);
});

test('ordinary defence and bonus are a single reply; a second retained possession completes the study without a shot',()=>{
  const original=createExerciseSession(definition()),copy=structuredClone(original);
  let s=apply(original,skip);
  s=apply(s,move('black-P1',2,4));assert.equal(s.progress.securedReplies,0);
  s=apply(s,move('black-P1',3,4,true));assert.equal(s.progress.securedReplies,1);assert.equal(s.status,'active');
  s=apply(s,{type:'kick',x:9,y:8});assert.equal(s.progress.securedReplies,1);
  s=oneReply(s);assert.equal(s.status,'solved');assert.equal(s.reason,'midfield-controlled');
  assert.equal(s.progress.securedReplies,2);assert.equal(s.metrics.shotResult,null);
  assert.equal(s.roundsUsed,1);assert.deepEqual(original,copy);
});

test('a switch needs control in the area after a full reply, rather than just a completed pass',()=>{
  const d=definition({goal:{type:'possession',kind:'switch',zone:{x0:9,x1:13,y0:6,y1:10},secureReplies:1}});
  let s=oneReply(createExerciseSession(d));assert.equal(s.status,'active');assert.equal(s.progress.securedReplies,0);
  s=apply(s,{type:'kick',x:9,y:8});assert.equal(s.status,'active');
  // A different receiving square is accepted without comparing example actions.
  s=apply(s,move('white-R1',10,8));s=oneReply(s);
  assert.equal(s.status,'solved');assert.equal(s.game.ball.x,10);
});

test('a loose ball in the target cannot complete a switch',()=>{
  const d=definition({goal:{type:'possession',kind:'switch',zone:{x0:9,x1:13,y0:6,y1:10},secureReplies:1}});
  d.position.pieces=d.position.pieces.filter(p=>p.id!=='white-R1');
  let s=oneReply(createExerciseSession(d));s=apply(s,{type:'kick',x:10,y:8});
  assert.equal(s.game.ball.carrierId,null);s=oneReply(s);
  assert.equal(s.status,'active');assert.equal(s.progress.securedReplies,0);
});

test('moving outside the area resets protection, even before the next reply',()=>{
  let s=oneReply(createExerciseSession(definition()));assert.equal(s.progress.securedReplies,1);
  s=apply(s,{type:'kick',x:9,y:8});s=apply(s,move('white-R1',11,8));
  assert.equal(s.progress.securedReplies,0);assert.equal(s.status,'active');
});

test('losing the ball resets protection, while a lucky knight evasion cannot earn a safe reply',()=>{
  for(const knight of [false,true]){
    const d=definition();d.position.pieces=d.position.pieces.filter(p=>p.id!=='white-Q'&&p.id!=='black-P1');
    const id=knight?'white-N1':'white-Q';d.position.pieces.push(p(id,6,8),p('black-P1',5,7));d.position.carrierId=id;
    let s=apply(createExerciseSession(d),skip);
    const tackle=legalMoves(s.game,'black-P1').find(m=>m.type==='tackle');assert.ok(tackle);
    s=apply(s,move('black-P1',tackle.x,tackle.y),{roll:.999999});
    if(knight){assert.equal(s.game.lastAction.type,'tackleMiss');s=apply(s,skip);assert.equal(s.game.ball.carrierId,id);}
    else assert.equal(s.game.attack,'black');
    assert.equal(s.progress.securedReplies,0);assert.equal(s.status,'active');
  }
});

test('a restart cannot count as secure midfield control',()=>{
  const d=definition({goal:{type:'possession',kind:'protect',zone:{x0:0,x1:13,y0:0,y1:16},secureReplies:2}});
  d.position.pieces=d.position.pieces.filter(p=>p.id!=='white-R1');d.position.pieces.find(p=>p.id==='white-Q').x=0;
  let s=oneReply(createExerciseSession(d));assert.equal(s.progress.securedReplies,1);
  s=apply(s,{type:'kick',x:13,y:8},{roll:.999999,landing:{x:14,y:8}});assert.ok(s.game.restart);
  assert.equal(s.progress.securedReplies,0);assert.equal(s.status,'active');
});

test('the protection diagrams contain real challenges; standing still or omitting the support is unsafe',()=>{
  let s=apply(createExerciseSession(MIDFIELD_EXERCISES[3]),skip);
  assert.ok(findExerciseCapture(s.game).plan,'the initial rook line threatens the queen');
  s=apply(createExerciseSession(MIDFIELD_EXERCISES[4]),move('white-Q',7,9));s=apply(s,skip);
  assert.ok(findExerciseCapture(s.game).plan,'the unblocked pawn approach allows a bonus-assisted tackle');
});
