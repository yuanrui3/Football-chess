import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const source=await readFile(new URL('../dist/app.js',import.meta.url),'utf8');
const html=await readFile(new URL('../dist/index.html',import.meta.url),'utf8');
const preference=source.slice(source.indexOf("try{const preference=JSON.parse(localStorage.getItem(VOICE_STORE)"),source.indexOf("\ntry {\n  const saved="));
const setup=source.slice(source.indexOf('commentary=createCommentary('),source.indexOf('\nfunction paintEvaluation'));
const save=source.slice(source.indexOf('function saveVoicePreference(){'),source.indexOf('function saveVoicePreference(){')+source.slice(source.indexOf('function saveVoicePreference(){')).indexOf('\n'));
function restore(saved){
 const result={voiceEnabled:false,VOICE_STORE:'voice',localStorage:{getItem:()=>saved===undefined?null:typeof saved==='string'?saved:JSON.stringify(saved)}};
 result.createCommentary=()=>({setPlayback(mode){result.playback=mode;}});
 vm.runInNewContext(preference+'\n'+setup,result);return result;
}
test('all previous voice choices migrate to Adam without changing the enabled preference',()=>{
 for(const enabled of [true,false])for(const mode of ['adam','device','recorded','local','library'])for(const playbackVersion of [undefined,3,4,5]){
  const result=restore({enabled,playback:mode,playbackVersion,voiceId:'old-device'});
  assert.equal(result.playback,'adam');assert.equal(result.voiceEnabled,enabled);
 }
 for(const stored of [undefined,'invalid JSON']){const result=restore(stored);assert.equal(result.playback,'adam');assert.equal(result.voiceEnabled,false);}
});
test('the simplified preference persists Adam and preserves mute',()=>{
 let written;const context={VOICE_STORE:'voice',voiceEnabled:false,localStorage:{setItem:(_key,value)=>written=JSON.parse(value)}};
 vm.runInNewContext(save+'\nsaveVoicePreference();',context);
 assert.deepEqual(written,{enabled:false,playback:'adam',playbackVersion:5});assert.equal(restore(written).voiceEnabled,false);
});
test('the match panel presents Adam and its playback controls without obsolete voice choices',()=>{
 const panel=html.slice(html.indexOf('<section class="commentary-panel"'),html.indexOf('</section>',html.indexOf('<section class="commentary-panel"')));
 assert.match(panel,/Adam · British match commentary/);assert.match(panel,/Test Adam/);assert.match(panel,/Match sample/);
 assert.doesNotMatch(panel,/<select|Hugo|Device voice|compare voices|commentary-audition/);
 assert.doesNotMatch(source,/createParadeeSpeech|voiceSelect|voicePlayback|warmLocal|unlockLocal/);
});
