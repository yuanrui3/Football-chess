import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import * as E from './frozen/selected-engine.mjs';
const report=JSON.parse(await readFile(new URL('./performance.json',import.meta.url),'utf8'));
const engine=await readFile(new URL('./frozen/selected-engine.mjs',import.meta.url));
if(createHash('sha256').update(engine).digest('hex')!==report.engineSha256)throw Error('This latency study requires its frozen C2 engine.');
const results=[];
for(const item of report.states){
 const state=item.snapshot?structuredClone(item.snapshot):E.createGame({seed:1632189751,foulsEnabled:true,kickoff:'white'});
 const start=performance.now(),analysis=E.analyzeTacticalAction(state),ms=performance.now()-start;
 results.push({snapshotId:item.snapshotId,phase:state.phase,ms,action:analysis.action,stats:analysis.stats});
}
console.log(JSON.stringify({engineSha256:report.engineSha256,states:results},null,2));
