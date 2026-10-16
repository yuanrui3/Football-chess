import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../dist/engine.js';

const other=t=>t==='white'?'black':'white';
const id=(v,t)=>t==='white'?v:v.replace(/^(white|black)/,other);
const point=([x,y],t)=>t==='white'?{x,y}:{x:E.BOARD_WIDTH-1-x,y:E.BOARD_HEIGHT-1-y};
const clone=s=>JSON.parse(JSON.stringify(s));
function fixture({team='white',phase='kick',carrier='white-R1',origin=[2,10],anchor=origin[1],rounds=2,positions={},loose=false}={}){
  const s=E.createGame({mode:'local',seed:178}),assigned={'white-K':[5,14],'black-K':[6,0],'black-N2':[10,0],[carrier]:origin,...positions};
  const used=new Set(Object.values(assigned).map(p=>p.join(',')));assert.equal(used.size,Object.keys(assigned).length);
  const park=Array.from({length:E.BOARD_HEIGHT-3},(_,i)=>[[0,3+i],[E.BOARD_WIDTH-1,3+i]]).flat();
  for(const p of s.pieces){const q=assigned[p.id]||park.find(q=>!used.has(q.join(',')));[p.x,p.y]=q;used.add(q.join(','));if(team==='black'){p.id=id(p.id,team);p.team=other(p.team);Object.assign(p,point(q,team));}}
  for(const p of s.pieces)assert.ok(E.canOccupySquare(p,p.x,p.y),`${p.id} occupies a legal current-pitch square`);
  const c=s.pieces.find(p=>p.id===id(carrier,team));s.ball={x:c.x,y:c.y,carrierId:loose?null:c.id};s.attack=team;s.phase=phase;s.restart=null;s.offside=null;s.pendingShot=null;s.releaseReason=null;
  s.positionBudget={normalUsed:false,pawnUsed:false,dribbleUsed:false};s.ballProgress={team,anchorY:point([0,anchor],team).y,rounds,pendingRelease:false,excludeRelease:false};return s;
}
const kick=(s,target,team)=>{const p=point(target,team);assert.ok(E.legalKicks(s).some(k=>k.x===p.x&&k.y===p.y));return E.applyKick(s,p.x,p.y,{roll:0});};
const ready=s=>E.skipMove(E.skipMove(s));
function assertFresh(s){assert.equal(s.ballProgress.rounds,0);assert.equal(s.ballProgress.anchorY,s.ball.y);assert.equal(s.restart,null);}

test('own-half eligibility is strict, mirrored and excludes the halfway row',()=>{
  for(let y=0;y<E.BOARD_HEIGHT;y++){assert.equal(E.isOwnHalf('white',y),y>E.MIDFIELD_RANK);assert.equal(E.isOwnHalf('black',y),y<E.MIDFIELD_RANK);assert.equal(E.isOwnHalf('white',y),E.isOwnHalf('black',E.BOARD_HEIGHT-1-y));}
  for(const y of [undefined,NaN,Infinity,-1,E.BOARD_HEIGHT,E.MIDFIELD_RANK+.5])for(const team of ['white','black'])assert.equal(E.isOwnHalf(team,y),false);
  assert.equal(E.isOwnHalf('unknown',10),false);
});

for(const team of ['white','black']){
  test(`${team}: pre-version-13 saves receive one fresh progress checkpoint while current saves and Undo preserve it`,()=>{
    for(const version of [undefined,5,9,12])for(const row of [5,E.MIDFIELD_RANK,10]){
      const s=fixture({team,origin:[2,row],anchor:10});if(version===undefined)delete s.rulesVersion;else s.rulesVersion=version;
      const before=clone(s),migrated=E.normalizeGame(s),expected={team,anchorY:s.ball.y,rounds:0,pendingRelease:false,excludeRelease:false};
      assert.equal(migrated.rulesVersion,E.RULES_VERSION);assert.deepEqual(migrated.ballProgress,expected);
      assert.deepEqual(migrated,{...before,rulesVersion:E.RULES_VERSION,ballProgress:expected});assert.deepEqual(s,before);
      assert.deepEqual(E.normalizeGame(clone(migrated)),migrated);
    }
  });

  test(`${team}: an old field-wide counter outside the own half cannot follow a return into the own half`,()=>{
    const s=fixture({team,origin:[2,5],anchor:10,positions:{'white-R2':[2,10],'white-Q':[8,10]}});s.rulesVersion=12;
    const migrated=E.normalizeGame(s);assertFresh(migrated);
    const returned=kick(migrated,[2,10],team);assertFresh(returned);assert.equal(E.progressInfo(returned).roundsRemaining,3);
    const next=kick(ready(returned),[8,10],team);assert.equal(next.restart,null);assert.equal(next.ballProgress.rounds,1);
  });

  test(`${team}: a current saved transient dribble keeps two rounds, while the one-time old-save migration grants a fresh window`,()=>{
    const initial=fixture({team,phase:'attackMove',carrier:'white-Q',positions:{'white-R2':[6,10]}}),p=point([2,6],team);
    const carried=E.applyMove(initial,id('white-Q',team),p.x,p.y),before=clone(carried),restored=E.normalizeGame(clone(carried));
    assert.equal(restored.rulesVersion,E.RULES_VERSION);assert.deepEqual(restored,before);assert.equal(restored.ballProgress.rounds,2);
    assert.equal(kick(ready(restored),[6,10],team).restart.type,'stalling');
    const legacy=clone(carried);legacy.rulesVersion=12;const migrated=E.normalizeGame(legacy);
    assert.equal(migrated.ballProgress.rounds,0);assert.equal(migrated.ballProgress.anchorY,migrated.ball.y);
    assertFresh(kick(ready(migrated),[6,10],team));assert.deepEqual(carried,before);
  });

  test(`${team}: migrating a forced keeper release retains its pending and restart-exclusion flags`,()=>{
    for(const excluded of [null,'corner','kickoff']){
      const s=fixture({team,phase:excluded==='kickoff'?'kickoff':'kick',carrier:'white-Q',origin:[4,10],positions:{'white-K':[4,14],'white-R2':[6,12]}});
      if(excluded==='corner')s.restart={type:'corner',team,takerId:s.ball.carrierId,spot:{x:s.ball.x,y:s.ball.y},indirect:false};
      const release=kick(s,[4,14],team);release.rulesVersion=12;const before=clone(release),migrated=E.normalizeGame(release);
      assert.equal(migrated.phase,'keeperRelease');assert.equal(migrated.releaseReason,'backPass');assert.equal(migrated.ballProgress.pendingRelease,true);
      assert.equal(migrated.ballProgress.excludeRelease,!!excluded);assert.equal(migrated.ballProgress.rounds,0);assert.equal(migrated.ballProgress.anchorY,migrated.ball.y);
      assert.deepEqual(migrated.positionBudget,before.positionBudget);assert.equal(migrated.randomState,before.randomState);assert.deepEqual(release,before);assert.throws(()=>E.skipMove(migrated));
      const completed=kick(migrated,[6,12],team);assert.equal(completed.restart,null);assert.equal(completed.ballProgress.rounds,excluded?0:1);
      assert.equal(completed.ballProgress.pendingRelease,false);assert.equal(completed.ballProgress.excludeRelease,false);
    }
  });

  test(`${team}: migrating protected restart positioning keeps its phase, spent movement and locked taker`,()=>{
    for(const type of ['goalKick','corner','throwIn','offside','stalling','timeout']){
      const goalKick=type==='goalKick',s=fixture({team,phase:'attackMove',carrier:goalKick?'white-K':'white-R1',origin:goalKick?[5,14]:[2,10]});s.rulesVersion=12;
      s.restart={type,team,takerId:s.ball.carrierId,spot:{x:s.ball.x,y:s.ball.y},indirect:['offside','stalling','timeout'].includes(type)};s.positionBudget.normalUsed=true;
      const before=clone(s),migrated=E.normalizeGame(s);assert.equal(migrated.rulesVersion,E.RULES_VERSION);assert.equal(migrated.ballProgress.rounds,0);assert.equal(migrated.ballProgress.anchorY,migrated.ball.y);
      assert.deepEqual(migrated.restart,before.restart);assert.deepEqual(migrated.positionBudget,before.positionBudget);assert.equal(migrated.phase,before.phase);assert.deepEqual(E.legalMoves(migrated,migrated.restart.takerId),[]);
      assert.equal(migrated.randomState,before.randomState);assert.deepEqual(s,before);assert.deepEqual(E.normalizeGame(clone(migrated)),migrated);
      const completed=kick(ready(migrated),goalKick?[5,10]:[8,10],team);assertFresh(completed);
    }
  });

  test(`${team}: an excluded pending own-goal shot keeps its declared origin and exclusion across migration`,()=>{
    const s=fixture({team,phase:'keeperRelease',carrier:'white-K',origin:[5,14]});s.releaseReason='backPass';s.ballProgress.pendingRelease=true;s.ballProgress.excludeRelease=true;
    const target=point([5,E.BOARD_HEIGHT],team),pending=E.applyKick(s,target.x,target.y,{roll:0});pending.rulesVersion=12;
    const before=clone(pending),migrated=E.normalizeGame(pending);assert.equal(migrated.phase,'keeperReact');assert.equal(migrated.ballProgress.excludeRelease,true);assert.equal(migrated.ballProgress.rounds,0);
    assert.deepEqual(migrated.pendingShot,before.pendingShot);assert.equal(migrated.randomState,before.randomState);assert.deepEqual(pending,before);
    const m=E.shotModel(migrated),caught=E.skipMove(migrated,{roll:m.goalProbability+m.cornerProbability+m.caughtSaveProbability/2});assert.equal(caught.lastAction.type,'save');assertFresh(caught);
  });

  test(`${team}: progress warnings apply only to a current own-half ball, without mutating retained round accounting`,()=>{
    for(const row of [0,5,E.MIDFIELD_RANK,E.MIDFIELD_RANK+1,10,E.BOARD_HEIGHT-1]){
      const s=fixture({team,origin:[2,row],anchor:10}),before=clone(s),info=E.progressInfo(s);
      assert.equal(info.active,row>E.MIDFIELD_RANK);assert.equal(info.warning,row>E.MIDFIELD_RANK);assert.deepEqual(s,before);
    }
    const returning=fixture({team,origin:[2,10],anchor:5}),before=clone(returning),info=E.progressInfo(returning);
    assert.equal(info.active,true);assert.equal(info.warning,false);assert.equal(info.rounds,0);assert.equal(info.roundsRemaining,3);assert.equal(info.anchorY,returning.ball.y);assert.equal(info.progress,0);assert.deepEqual(returning,before);
  });

  test(`${team}: ending a round at halfway or in the opponent half clears the old own-half deadline`,()=>{
    for(const row of [E.MIDFIELD_RANK,E.MIDFIELD_RANK-1]){
      const s=fixture({team,positions:{'white-R2':[2,row]}}),next=kick(s,[2,row],team);
      assertFresh(next);assert.equal(E.progressInfo(next).active,false);
    }
    const own=fixture({team,origin:[2,12],positions:{'white-R2':[2,9]}}),penalty=kick(own,[2,9],team);
    assert.equal(penalty.restart.type,'stalling');assert.equal(penalty.lastAction.progress,3);assert.equal(penalty.lastAction.rounds,3);
  });

  test(`${team}: repeated sideways possession and loose-ball cycles outside the own half have no stalling deadline`,()=>{
    for(const row of [5,E.MIDFIELD_RANK]){
      let s=fixture({team,origin:[2,row],positions:{'white-R2':[8,row]}});
      for(let n=0;n<6;n++){s=kick(s,n%2?[2,row]:[8,row],team);assertFresh(s);s=ready(s);}
      let loose=fixture({team,phase:'attackMove',origin:[2,row],loose:true});
      for(let n=0;n<6;n++){loose=ready(loose);assert.equal(loose.phase,'attackMove');assertFresh(loose);assert.equal(E.progressInfo(loose).active,false);}
    }
  });

  test(`${team}: returning from halfway or the opponent half starts three fresh own-half rounds without counting the return`,()=>{
    for(const start of [5,E.MIDFIELD_RANK]){
      let s=fixture({team,origin:[2,start],anchor:start,positions:{'white-R2':[2,10],'white-Q':[8,10]}});
      s=kick(s,[2,10],team);assertFresh(s);assert.equal(E.progressInfo(s).roundsRemaining,3);
      for(const [n,target]of [[1,[8,10]],[2,[2,10]],[3,[8,10]]]){
        s=kick(ready(s),target,team);
        if(n<3){assert.equal(s.restart,null);assert.equal(s.ballProgress.rounds,n);}
        else{assert.equal(s.restart.type,'stalling');assert.equal(s.restart.team,other(team));}
      }
    }
  });

  test(`${team}: crossing midfield while dribbling and passing back before the round ends cannot erase two old rounds`,()=>{
    let s=fixture({team,phase:'attackMove',carrier:'white-Q',positions:{'white-R2':[6,10]}}),p=point([2,6],team);
    s=E.applyMove(s,id('white-Q',team),p.x,p.y);assert.equal(s.ballProgress.rounds,2);assert.equal(E.progressInfo(s).active,false);assert.equal(E.progressInfo(s).warning,false);
    s=kick(ready(s),[6,10],team);assert.equal(s.restart.type,'stalling');assert.equal(s.lastAction.rounds,3);assert.equal(s.lastAction.progress,0);
  });

  test(`${team}: a forced goalkeeper release completes one round and preserves the correct own-half checkpoint`,()=>{
    for(const startingOwn of [false,true]){
      let s=fixture({team,phase:startingOwn?'attackMove':'kick',carrier:'white-Q',origin:[4,startingOwn?10:6],anchor:startingOwn?10:6,positions:{'white-K':[4,14],'white-R2':[6,12]}});
      if(startingOwn){const p=point([4,6],team);s=E.applyMove(s,id('white-Q',team),p.x,p.y);s=ready(s);}
      const release=kick(s,[4,14],team);assert.equal(release.phase,'keeperRelease');assert.equal(release.ballProgress.rounds,2);assert.equal(release.ballProgress.pendingRelease,true);
      if(!startingOwn){assert.equal(E.progressInfo(release).rounds,0);assert.equal(E.progressInfo(release).roundsRemaining,3);}
      const completed=kick(release,[6,12],team);
      if(startingOwn)assert.equal(completed.restart.type,'stalling');else assertFresh(completed);
    }
  });

  test(`${team}: protected restart kicks and kickoff remain excluded inside the own half`,()=>{
    for(const type of ['goalKick','corner','throwIn','offside','stalling','timeout',null]){
      const goalKick=type==='goalKick',s=fixture({team,phase:type?'kick':'kickoff',carrier:goalKick?'white-K':'white-R1',origin:goalKick?[5,14]:[2,10]});
      if(type)s.restart={type,team,takerId:s.ball.carrierId,spot:{x:s.ball.x,y:s.ball.y},indirect:['offside','stalling','timeout'].includes(type)};
      const next=kick(s,goalKick?[5,10]:[8,10],team);assertFresh(next);assert.equal(E.progressInfo(next).active,true);
    }
  });

  test(`${team}: save and Undo normalization retain raw checkpoints while previews and the returning round use a fresh own-half window`,()=>{
    const s=fixture({team,origin:[2,5],anchor:10}),before=clone(s),normalized=E.normalizeGame(s);
    assert.deepEqual(normalized,s);assert.equal(E.progressInfo(normalized).active,false);assert.deepEqual(s,before);
    const returning=fixture({team,origin:[2,10],anchor:5,positions:{'white-R2':[8,10]}}),saved=clone(returning),restored=E.normalizeGame(saved);
    assert.deepEqual(restored.ballProgress,returning.ballProgress);assert.equal(E.progressInfo(restored).roundsRemaining,3);
    assertFresh(kick(restored,[8,10],team));assert.equal(restored.randomState,returning.randomState);assert.deepEqual(saved,returning);
  });
}
