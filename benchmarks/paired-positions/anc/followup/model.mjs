import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';

export const MODEL = 'gemini-3.1-flash-lite';
const participant = new URL('./participant/', import.meta.url);
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

// A single independent generateContent body. The reference answer, pair
// membership and grading data never enter the model input.
export function buildRequest(item) {
  assert.equal(typeof item.prompt, 'string');
  assert.ok(item.prompt.length > 0);
  assert.equal(sha256(item.prompt), item.promptSha256, 'Prompt digest mismatch');
  assert.match(item.image, /^images\/[A-Za-z0-9_-]+\.png$/);
  const image = readFileSync(new URL(item.image, participant));
  assert.equal(sha256(image), item.imageSha256, 'Image digest mismatch');
  assert.ok(image.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')), 'Expected a PNG');
  return {
    contents:[{role:'user', parts:[
      {text:item.prompt},
      {inlineData:{mimeType:'image/png', data:image.toString('base64')}}
    ]}],
    generationConfig:{
      temperature:0, maxOutputTokens:4096, thinkingConfig:{thinkingLevel:'high'},
      responseMimeType:'application/json', responseJsonSchema:{type:'integer', enum:[1,2,3]}
    }
  };
}

// A non-completing, blocked, malformed or out-of-menu answer has no choice.
export function parseResponse(response) {
  if (!Array.isArray(response?.candidates) || response.candidates.length !== 1) return null;
  const [candidate] = response.candidates;
  const parts = candidate?.content?.parts;
  if (candidate?.finishReason !== 'STOP' || !Array.isArray(parts)) return null;
  const final = parts.filter(part => part?.thought !== true);
  if (final.some(part => typeof part?.text !== 'string')) return null;
  const text = final.map(part => part.text).join('');
  const match = /^[ \t\r\n]*([123])[ \t\r\n]*$/.exec(text);
  return match ? Number(match[1]) : null;
}

// node model.mjs request ITEM_ID > request.json   (writes exact frozen bytes)
// node model.mjs parse saved-gemini-response.json
if (import.meta.main) {
  const [command, argument, ...extra] = process.argv.slice(2);
  assert.ok(argument && extra.length === 0 && ['request','parse'].includes(command),
    'Usage: node model.mjs request ITEM_ID | node model.mjs parse RESPONSE_FILE');
  if (command === 'parse') {
    const response = JSON.parse(readFileSync(argument, 'utf8'));
    console.log(JSON.stringify(parseResponse(response)));
  } else {
    const lock = JSON.parse(readFileSync(new URL('./freeze.json', import.meta.url), 'utf8'));
    assert.equal(lock.model, MODEL);
    const manifest = readFileSync(new URL('items.json', participant));
    assert.equal(sha256(manifest), lock.files['participant/items.json'], 'Item manifest digest mismatch');
    const items = JSON.parse(manifest).items.filter(item => item.itemId === argument);
    assert.equal(items.length, 1, 'Expected one frozen item with the requested ID');
    const wire = JSON.stringify(buildRequest(items[0]));
    assert.equal(sha256(wire), lock.requests[argument], 'Request digest mismatch');
    process.stdout.write(wire);
  }
}
