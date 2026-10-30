import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {ADAM_EVENT_CLIPS, ADAM_TACTICAL_CLIPS} from '../dist/adam-commentary-clips.js';
import {COMMENTARY_CLIPS} from '../dist/commentary-clips.js';
import {HUGO_COMMENTARY_CLIPS} from '../dist/hugo-commentary-clips.js';

const plan=JSON.parse(await readFile(new URL('../docs/adam-commentary-plan.json',import.meta.url),'utf8'));
const sources=[['events',ADAM_EVENT_CLIPS,COMMENTARY_CLIPS],['tactics',ADAM_TACTICAL_CLIPS,HUGO_COMMENTARY_CLIPS]];

test('Adam covers every existing event and factual tactical selector key',()=>{
  for(const [group,clips,legacy]of sources){
    assert.deepEqual(Object.keys(clips).sort(),Object.keys(legacy).sort());
    assert.deepEqual(Object.keys(clips).sort(),Object.keys(plan[group]).sort());
    for(const [key,clip]of Object.entries(clips)){
      assert.equal(clip.key,key);assert.equal(clip.voice,'Adam');assert.equal(clip.ready,true);
      assert.equal(clip.snapshot,plan[group][key].snapshot);
      assert.equal(clip.text,plan[group][key].text);
      const variants=clip.variants||[clip];
      assert.equal(variants.length,plan[group][key].recordingIds.length);
      assert.deepEqual(variants.map(v=>v.id),plan[group][key].recordingIds);
      for(const v of variants){assert.equal(v.key,key);assert.equal(v.voice,'Adam');assert.equal(v.snapshot,clip.snapshot);assert.doesNotMatch(v.text,/\b(?:Hugo|Tom)\b|\[[^\]]+\]/);}
    }
  }
});

test('each complete Adam asset exists, matches its digest, and has measured duration',async()=>{
  const unique=new Map(sources.flatMap(([,clips])=>Object.values(clips).flatMap(c=>c.variants||[c])).map(c=>[c.id,c]));
  assert.equal(unique.size,plan.recordings.length);
  for(const clip of unique.values()){
    assert.ok(clip.durationMs>=1000&&clip.durationMs<=15000,clip.id);
    assert.match(clip.sha256,/^[0-9a-f]{64}$/);
    const url=new URL(clip.src);assert.equal(url.protocol,'file:');assert.ok(url.pathname.includes('/dist/audio/adam/'));
    assert.equal(url.search,`?v=${clip.sha256.slice(0,12)}`);
    const bytes=await readFile(fileURLToPath(url));assert.ok(bytes.length>1000);assert.equal(bytes.length,clip.bytes);
    assert.equal(createHash('sha256').update(bytes).digest('hex'),clip.sha256);
  }
});

test('Adam missed-shot variants do not invent which boundary restart follows',()=>{
  for(const clip of ADAM_EVENT_CLIPS.miss.variants||[ADAM_EVENT_CLIPS.miss])assert.doesNotMatch(clip.text,/goal kick|corner|throw-in/i);
});
