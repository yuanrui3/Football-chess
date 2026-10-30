import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const source=await readFile(new URL('../dist/app.js',import.meta.url),'utf8');
const preference=source.slice(source.indexOf("try{const preference=JSON.parse(localStorage.getItem(VOICE_STORE)"),source.indexOf("\ntry {\n  const saved="));
const save=source.slice(source.indexOf('function saveVoicePreference(){'),source.indexOf('function saveVoicePreference(){')+source.slice(source.indexOf('function saveVoicePreference(){')).indexOf('\n'));
function restore(saved){
 const result={voiceEnabled:false,voicePreferredId:'',voicePlayback:'adam',VOICE_STORE:'voice',localStorage:{getItem:()=>saved===undefined?null:typeof saved==='string'?saved:JSON.stringify(saved)}};
 vm.runInNewContext(preference,result);return result;
}

test('new users and old default library users choose Adam without enabling audio',()=>{
 for(const stored of [undefined,{enabled:false,playback:'library',playbackVersion:3},'bad JSON']){
  const p=restore(stored);assert.equal(p.voicePlayback,'adam');assert.equal(p.voiceEnabled,false);
 }
 const p=restore({enabled:true,playback:'library',playbackVersion:3,voiceId:'device-id'});
 assert.equal(p.voicePlayback,'adam');assert.equal(p.voiceEnabled,true);assert.equal(p.voicePreferredId,'device-id');
});
test('explicit legacy choices stay available and a later alternative choice is not remigrated',()=>{
 for(const mode of ['device','recorded'])assert.equal(restore({playback:mode}).voicePlayback,mode);
 assert.equal(restore({playback:'local',playbackVersion:3}).voicePlayback,'local');
 for(const mode of ['adam','local','library','device','recorded'])assert.equal(restore({playback:mode,playbackVersion:4}).voicePlayback,mode);
});
test('persisted voice settings use migration version4 and preserve the off toggle',()=>{
 let written;
 const context={VOICE_STORE:'voice',voiceEnabled:false,voicePreferredId:'',voicePlayback:'library',localStorage:{setItem:(_key,value)=>{written=JSON.parse(value);}}};
 vm.runInNewContext(save+'\nsaveVoicePreference();',context);
 assert.deepEqual(written,{enabled:false,voiceId:'',playback:'library',playbackVersion:4});
 assert.equal(restore(written).voicePlayback,'library');
});
