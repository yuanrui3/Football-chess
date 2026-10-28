/** Small opening smoke study; not a formation-strength benchmark.
 * Run: node scripts/analyze-formations.mjs --out=/absolute/output.json
 * Every match uses the same rules and fixed atomic-action budget, not a clock.
 */
import * as rules from '../dist/engine.js';
import {runMatch} from './simulate.mjs';
import {writeFile} from 'node:fs/promises';
const names=['aggressive','neutral','defensive'];
const args=Object.fromEntries(process.argv.slice(2).map(x=>x.replace(/^--/,'').split('=')));
const coord=p=>'abcdefghijklmn'[p.x]+(17-p.y);
const own=(state,team)=>state.pieces.filter(p=>p.team===team);
const target=(state,piece)=>({...structuredClone(state),phase:'kick',attack:piece.team,ball:{x:piece.x,y:piece.y,carrierId:piece.id},restart:null,offside:null});
function outlets(state,piece){return rules.legalKicks(target(state,piece)).filter(k=>k.receiverId&&k.receiverId.startsWith(piece.team+'-')&&!k.offside).map(k=>({receiver:k.receiverId.split('-')[1],at:coord({x:k.x,y:k.y}),distance:k.distance,accuracy:k.accuracy}));}
const geometry=names.map(name=>{
 const g=rules.createGame({seed:7021,formations:{white:name,black:name},kickoff:'white'});
 const home=rules.createGame({seed:7021,formations:{white:name,black:name},kickoff:'black'});
 const q=g.pieces.find(p=>p.id==='white-Q'),keeper=g.pieces.find(p=>p.id==='white-K');
 return {name,home:Object.fromEntries(own(home,'white').map(p=>[p.id.split('-')[1],coord(p)])),kickoffOutlets:outlets(g,q),keeperOpenPlayOutlets:outlets(home,keeper),allAccurateConnections:own(home,'white').flatMap(p=>outlets(home,p).filter(k=>k.accuracy===1).map(k=>({from:p.id.split('-')[1],to:k.receiver}))),outfieldMeanRank:own(home,'white').filter(p=>p.type!=='K').reduce((s,p)=>s+17-p.y,0)/10,frontPlayers:own(home,'white').filter(p=>17-p.y>=7).map(p=>p.id.split('-')[1])};
});
const matches=[];
const compact=m=>({seed:m.seed,kickoff:m.kickoff,label:m.label,score:m.score,actions:m.actions,error:m.error,elapsedMs:m.elapsedMs,stats:Object.fromEntries(['white','black'].map(t=>[t,Object.fromEntries(['shots','resolvedShots','xG','goals','teammatePasses','spacePasses','dribbles','tackles','tackleWins','stalls','offsides','attackingThirdEntries','completedOrdinaryRounds'].map(k=>[k,m.stats[t][k]]))]))});
for(const white of names)for(const black of names)for(const seed of [7021,7022])for(const kickoff of ['white','black']){
 const initialState=rules.createGame({mode:'watch',seed,kickoff,formations:{white,black},foulsEnabled:true});
 const m=runMatch({rules,initialState,seed,kickoff,actionLimit:120,whiteDifficulty:'casual',blackDifficulty:'casual',foulsEnabled:true,validate:true,label:{white,black,policy:'casual'}});
 matches.push(compact(m));
 if(m.error)throw new Error(JSON.stringify(m.error));
}
const tactical=[];
for(const preset of names)for(const kickoff of ['white','black']){
 let selection=7021;
 const policy=state=>rules.analyzeTacticalAction(state,{maxDepth:3,nodeLimit:180,selectionSeed:selection++}).action;
 const initialState=rules.createGame({mode:'watch',seed:7021,kickoff,formations:{white:preset,black:preset},foulsEnabled:true});
 const m=runMatch({rules,initialState,seed:7021,kickoff,actionLimit:48,whitePolicy:policy,blackPolicy:policy,foulsEnabled:true,validate:true,label:{white:preset,black:preset,policy:'bounded tactical depth3/nodes180'}});
 tactical.push(compact(m));
 if(m.error)throw new Error(JSON.stringify(m.error));
}
function aggregate(list){return names.map(preset=>{const rows=[],opponents=[];for(const m of list)for(const team of ['white','black'])if(m.label[team]===preset){rows.push(m.stats[team]);opponents.push(m.stats[team==='white'?'black':'white']);}return {preset,teamWindows:rows.length,...Object.fromEntries(['shots','resolvedShots','xG','goals','stalls','offsides','attackingThirdEntries','completedOrdinaryRounds'].map(k=>[k,rows.reduce((s,r)=>s+r[k],0)])),shotsAgainst:opponents.reduce((s,r)=>s+r.shots,0),xGAgainst:opponents.reduce((s,r)=>s+r.xG,0)};});}
const result={geometry,design:'36 casual opening windows, each120 atomic actions; all9 ordered preset pairings, seeds7021/7022 and both kickoffs. 6 bounded tactical mirror windows, each48 actions, depth3/nodes180; not full tactical-strength matches. Fouls enabled. xG counted after keeper reaction, goals sampled. Fixed action windows are not timed matches; no win-rate or scoreline claims.',casual:aggregate(matches),boundedTactical:aggregate(tactical),matches,tactical};
if(args.out)await writeFile(args.out,JSON.stringify(result,null,2));
console.log(JSON.stringify({geometry,casual:result.casual,boundedTactical:result.boundedTactical,windows:matches.length+tactical.length,errors:matches.concat(tactical).filter(m=>m.error).length,elapsedMs:matches.concat(tactical).reduce((s,m)=>s+m.elapsedMs,0)},null,2));
