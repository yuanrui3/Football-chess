import {parentPort} from 'node:worker_threads';
import {isDeepStrictEqual} from 'node:util';
globalThis.self={postMessage:value=>parentPort.postMessage(value)};
await import("file:///workspace/github/football-chess-pace/dist/ai-worker.js?v=410f29e715d9");
parentPort.on('message',data=>{const before=structuredClone(data.state);self.onmessage({data});parentPort.postMessage({requestId:data.requestId,inputVerification:{unchanged:isDeepStrictEqual(data.state,before)}});});
parentPort.postMessage({ready:true,workerURL:"file:///workspace/github/football-chess-pace/dist/ai-worker.js?v=410f29e715d9"});
