import test from 'node:test';
import assert from 'node:assert/strict';
import {E,fixture,point,pieceId} from './helpers/shot-fixture.mjs';
import {createMatchClock,settleMatchClock,tickMatchClock} from '../dist/match-clock.js';
function award(team,penalty){
  const y=penalty?2:3,s=fixture({team,origin:[6,y]});s.foulsEnabled=true;s.phase='defendMove';
  const challenger=s.pieces.find(p=>p.id===pieceId('black-R1',team));Object.assign(challenger,point([6,y+2],team));
  const landing=point([5,y],team),after=E.applyMove(s,challenger.id,landing.x,landing.y,{roll:.08});
  assert.equal(after.lastAction.type,'foul');assert.equal(after.restart.type,penalty?'penalty':'freeKick');return {before:s,after};
}
for(const team of ['white','black'])for(const penalty of [false,true])test(`${team}: a foul ${penalty?'penalty':'free kick'} survives the final whistle through preparation and shot resolution`,()=>{
  let {before,after}=award(team,penalty),clock={...createMatchClock({remaining:0}),fullTimePending:true};
  const original=structuredClone({before,after,clock});let settled=settleMatchClock(clock,before,after);assert.equal(settled.finish,false);assert.deepEqual(settled.clock.finalChance,{team,phase:'restart'});assert.deepEqual({before,after,clock},original);
  clock=settled.clock;before=after;
  for(let i=0;i<2;i++){after=E.skipMove(before);settled=settleMatchClock(clock,before,after);assert.equal(settled.finish,false);clock=settled.clock;before=after;}
  assert.equal(before.phase,'kick');const target=E.legalKicks(before).find(k=>k.goal===team);assert.ok(target);
  after=E.applyKick(before,target.x,target.y);settled=settleMatchClock(clock,before,after);assert.equal(settled.finish,false);assert.equal(settled.clock.finalChance.phase,'shot');
  before=after;after=E.skipMove(before,{roll:0});settled=settleMatchClock(settled.clock,before,after);assert.equal(after.lastAction.type,'goal');assert.equal(settled.finish,true);assert.equal(settled.clock.finalChance,null);
});
test('a foul awarded just before zero preserves the protected attack after the clock expires',()=>{
  const {before,after}=award('white',true),saved=settleMatchClock(createMatchClock({remaining:1}),before,after);assert.equal(saved.finish,false);assert.equal(saved.clock.finalChance.phase,'restart');
  const expired=tickMatchClock(saved.clock,1),prepared=E.skipMove(after),settled=settleMatchClock(expired,after,prepared);assert.equal(settled.finish,false);assert.equal(settled.clock.fullTimePending,true);assert.equal(settled.clock.finalChance.team,'white');
});
test('a foul penalty miss or catch ends the final chance after its shot resolves',()=>{
  let {before,after}=award('white',true),clock={...createMatchClock({remaining:0}),fullTimePending:true};clock=settleMatchClock(clock,before,after).clock;before=after;
  for(let i=0;i<2;i++){after=E.skipMove(before);clock=settleMatchClock(clock,before,after).clock;before=after;}
  const target=E.legalKicks(before)[0];after=E.applyKick(before,target.x,target.y);clock=settleMatchClock(clock,before,after).clock;before=after;after=E.skipMove(before,{roll:.9});assert.equal(after.lastAction.type,'save');const settled=settleMatchClock(clock,before,after);assert.equal(settled.finish,true);assert.equal(settled.clock.finalChance,null);
});
