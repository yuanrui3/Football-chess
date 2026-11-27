import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import * as game from '../native/engine.mjs';

const seed = 2026112709;
const ancestor = '../';
const fileHash = bytes => createHash('sha256').update(bytes).digest('hex');
const engineHash = fileHash(readFileSync(new URL(ancestor+'native/engine.mjs',import.meta.url)));
assert.equal(engineHash,'8c4e1d5fe428878d4d8a0aace338b2f12d1c50d1839e076b3990f1b7d99163c6');
const names = {K:'keeper',Q:'queen',B:'bishop',R:'rook',N:'knight',P:'pawn'};
const orders = ['NRB','NBR','RNB','RBN','BNR','BRN'];
const axial = [[0,1],[0,-1],[1,0],[-1,0]];
const diagonal = [[1,1],[1,-1],[-1,1],[-1,-1]];
const directions = [...axial,...diagonal];
const shift = ([x,y],[dx,dy],n=1) => [x+n*dx,y+n*dy];
const other = side => side==='white'?'black':'white';
const square = p => game.FILE_LABELS[p.x]+(17-p.y);

function randomSource(initial) {
  let state=initial;
  return (lo,hi) => {
    state=(Math.imul(1664525,state)+1013904223)>>>0;
    return lo+Math.floor((state/4294967296)*(hi-lo+1));
  };
}

function drawGeometry(rand) {
  const choose = list=>list[rand(0,list.length-1)];
  const rays = [...directions];
  const ray = () => rays.splice(rand(0,rays.length-1),1)[0];
  const carrier = [rand(4,9),rand(6,10)];
  const ordinary = shift(carrier,ray(),rand(2,5));
  const protectedAt = shift(carrier,ray(),rand(2,5));
  const bishop = shift(carrier,ray(),rand(2,5));
  const line = choose(directions);
  const distance = rand(3,5);
  const closed = shift(ordinary,line,rand(2,distance-1));
  const open = shift(closed,choose(axial.filter(([x,y])=>x*line[1]!==y*line[0])));
  return {carrier,ordinary,protectedAt,bishop,closed,open,keeper:[rand(5,8),16],
    defenders:[['K',[rand(5,8),0]],['P3',[rand(1,12),rand(1,2)]],
      ['Q',shift(ordinary,line,distance)],['R2',shift(protectedAt,choose(axial),rand(1,3))],
      ['B2',shift(bishop,choose(diagonal),rand(1,3))]]};
}

function nativeBoard(geometry,attack,protectedPiece,pawn) {
  const g=geometry;
  const state=game.createGame({mode:'local',seed:1,kickoff:attack,foulsEnabled:false});
  const roster=new Map(state.pieces.map(p=>[p.id,p]));
  const ordinaryPiece=protectedPiece==='N'?'R':'N';
  const ourPieces=[['K',g.keeper],['Q',g.carrier],[protectedPiece+'1',g.protectedAt],
    [ordinaryPiece+'1',g.ordinary],['B1',g.bishop]];
  state.pieces=[[attack,ourPieces],[other(attack),[...g.defenders,['P2',pawn]]]].flatMap(
    ([side,placements])=>placements.map(([suffix,[x,y]])=>({
      ...roster.get(side+'-'+suffix), x:attack==='white'?x:13-x, y:attack==='white'?y:16-y
    })));
  if (!state.pieces.every(p=>game.canOccupySquare(p,p.x,p.y)) ||
      new Set(state.pieces.map(square)).size!==state.pieces.length) return null;
  const queen=state.pieces.find(p=>p.id===attack+'-Q');
  Object.assign(state,{attack,phase:'kick',restart:null,log:[],ball:{x:queen.x,y:queen.y,carrierId:queen.id}});
  state.ballProgress.anchorY=queen.y;
  return state;
}

// Only pass legality and tackle availability come from the native engine.
// The experiment explicitly overrides tackle consequences for all receiver types.
function verifyBoard(state,protectedPiece,closed) {
  if (!state) return false;
  const kicks=game.legalKicks(state);
  for (const type of ['B','N','R']) {
    const receiverId=state.attack+'-'+type+'1';
    const pass=kicks.find(k=>k.receiverId===receiverId && !k.offside && !k.goal && !k.lofted && k.accuracy===1);
    if (!pass) return false;
    const received=game.applyKick(state,pass.x,pass.y,{roll:0.999});
    if (received.phase!=='attackMove' || received.ball.carrierId!==receiverId || received.restart) return false;
    const reply=game.skipMove(received);
    if (reply.phase!=='defendMove') return false;
    const tacklers=state.pieces.filter(p=>p.team!==state.attack && game.legalMoves(reply,p.id)
      .some(m=>m.type==='tackle' && m.targetId===receiverId));
    const ordinary=type!==protectedPiece && type!=='B';
    if (Boolean(tacklers.length)!==(!ordinary || !closed)) return false;
    if (ordinary && !closed && !tacklers.some(p=>p.type==='Q')) return false;
  }
  return true;
}

function publicPieces(state) {
  return state.pieces.map(p=>({id:p.id,type:p.type,team:p.team,square:square(p)}))
    .sort((a,b)=>a.id.localeCompare(b.id,'en'));
}

function fingerprint(attack,pieces) {
  const forms=[];
  for (const flipFile of [false,true]) for(const flipRank of [false,true]) {
    forms.push(pieces.map(p=>{
      const x=game.FILE_LABELS.indexOf(p.square[0]), y=Number(p.square.slice(1));
      return [p.team===attack?'A':'D',p.type,flipFile?13-x:x,flipRank?18-y:y].join(':');
    }).sort().join('|'));
  }
  return forms.sort()[0];
}

function makeLayouts() {
  const seen=new Set();
  for (const file of ['pass/data.json','followup/bank.json']) {
    const previous=JSON.parse(readFileSync(new URL(ancestor+file,import.meta.url),'utf8'));
    for (const board of previous.positions) seen.add(fingerprint(board.attack,board.pieces));
  }
  const rand=randomSource(seed), layouts=[];
  let proposals=0;
  while (layouts.length<orders.length) {
    assert.ok(++proposals<10000,'Could not generate a legal layout');
    const geometry=drawGeometry(rand);
    const attack=layouts.length%2===0?'white':'black';
    const variants={};
    for (const protectedPiece of ['R','N']) {
      const states=[geometry.closed,geometry.open].map(p=>nativeBoard(geometry,attack,protectedPiece,p));
      if (!states.every((state,i)=>verifyBoard(state,protectedPiece,i===0))) break;
      variants[protectedPiece]=states.map(publicPieces);
    }
    if (!variants.N || !variants.R) continue;
    const keys=Object.values(variants).flat().map(pieces=>fingerprint(attack,pieces));
    if (keys.some(k=>seen.has(k)) || new Set(keys).size!==4) continue;
    for (const k of keys) seen.add(k);
    layouts.push({layoutId:'board-'+(layouts.length+1),attack,options:[...orders[layouts.length]],variants});
  }
  return {layouts,proposals};
}

function renderPrompt(layout,protectedPiece,signal,reliability) {
  const ordinary=protectedPiece==='N'?'R':'N';
  const [safeState,unsafeState]=layout.variants[protectedPiece];
  const side=layout.attack, opponent=other(side), hiddenId=opponent+'-P2';
  const hidden=state=>state.find(p=>p.id===hiddenId).square;
  const roster=team=>safeState.filter(p=>p.team===team && p.id!==hiddenId)
    .map(p=>names[p.type]+' '+p.square).join(', ');
  const menu=layout.options.map((type,i)=>(i+1)+'. '+names[type]+' on '+
    safeState.find(p=>p.id===side+'-'+type+'1').square).join('\n');
  const report=signal==='safe'?'safe':'exposed';
  return [
    'Choose a pass in this partially observed Football Chess position. Maximize the probability that your team keeps possession after the next defensive challenge. All three passes are legal and arrive for certain. Your team then holds position. The defense takes a legal tackle whenever one is available.',
    'In this rule variant only the '+names[protectedPiece]+' has protection: if tackled it retains possession with probability 75%. Any other tackled receiver loses possession. Any receiver that cannot be tackled keeps possession. These rules specify all receiver abilities.',
    'Pitch coordinates (files a-n, ranks 1-17). Your side is '+side+' and your queen has the ball.\nYour players: '+roster(side)+'.\nVisible opposing players: '+roster(opponent)+'.',
    'One opposing pawn is hidden. Before receiving the scout report, its two possible squares are equally likely. On '+hidden(safeState)+' the '+names[ordinary]+' is safe (no legal tackle). On '+hidden(unsafeState)+' the '+names[ordinary]+' is exposed (a legal tackle exists). Both squares leave the '+names[protectedPiece]+' and the bishop exposed. These conditional tackle outcomes are given.',
    'The scout reports either SAFE or EXPOSED for the '+names[ordinary]+'. In each of the two possible states the report is correct '+Math.round(reliability*100)+'% of the time and gives the opposite report otherwise. The scout now reports: '+report.toUpperCase()+'.',
    'Choose one recipient:\n'+menu+'\nReturn just its option number.'
  ].join('\n\n');
}

export function generateDesign() {
  const {layouts,proposals}=makeLayouts(),items=[];
  for (const layout of layouts) for (const protectedPiece of ['R','N']) {
    const ordinary=protectedPiece==='N'?'R':'N';
    for (const signal of ['safe','unsafe']) for (const reliability of [0.6,0.9]) {
      const probSafe=signal==='safe'?reliability:1-reliability;
      const optimalPiece=probSafe>0.75?ordinary:protectedPiece;
      const prompt=renderPrompt(layout,protectedPiece,signal,reliability);
      items.push({itemId:fileHash(prompt).slice(0,16),layoutId:layout.layoutId,protectedPiece,
        signal,reliability,options:layout.options.slice(),optimal:1+layout.options.indexOf(optimalPiece),prompt});
    }
  }
  assert.equal(new Set(items.map(i=>i.itemId)).size,48);
  return {version:'PFC-CUE-1',seed,engineHash,proposals,layouts,items};
}

if (import.meta.main) console.log(JSON.stringify(generateDesign(),null,2));
