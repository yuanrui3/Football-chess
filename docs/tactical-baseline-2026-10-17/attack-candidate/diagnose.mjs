import * as E from './engine-original.mjs';
import {runMatch} from '/workspace/github/football-chess-pace/scripts/simulate.mjs';
import {writeFile} from 'node:fs/promises';
const decisions=[];
const tactical=(s)=>{const before=JSON.stringify(s),r=E.analyzeTacticalAction({...s,randomState:0},{modelWeights:null});if(before!==JSON.stringify(s))throw Error('mutated');decisions.push({phase:s.phase,carrier:s.ball.carrierId,ball:{...s.ball},budget:s.positionBudget,action:r.action,value:r.value,stats:r.stats});return r.action;};
const match=runMatch({rules:E,whitePolicy:tactical,blackPolicy:s=>E.chooseAIAction({...s,randomState:0},{difficulty:'casual',modelWeights:null}),seed:610017,kickoff:'white',actionLimit:160,foulsEnabled:true,record:true,validate:true});
await writeFile(new URL('diagnosis-original.json',import.meta.url),JSON.stringify({decisions,match},null,2));
console.log(JSON.stringify({score:match.score,stats:match.stats,error:match.error,depths:decisions.reduce((a,d)=>(a[d.stats.completedDepth]=(a[d.stats.completedDepth]||0)+1,a),{})}));
