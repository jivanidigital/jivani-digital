import test from 'node:test';
import assert from 'node:assert/strict';
import {privateFileStore,serveSignedPDF} from '../src/private-files.mjs';
function fixture(){
  let now=1793574000000;const map=new Map();const secret='s'.repeat(32);
  const bucket={head:async k=>map.has(k)?{}:null,put:async(k,b)=>map.set(k,b),get:async k=>map.has(k)?{body:map.get(k),arrayBuffer:async()=>map.get(k).slice().buffer}:null};
  const opts={bucket,secret,origin:'https://private.example.com',clock:()=>now};
  return {store:privateFileStore(opts),opts,advance:()=>{now+=25*3600000;}};
}
test('private PDF can be reused and accessed with signed expiring link',async()=>{
  const f=fixture(),data=new TextEncoder().encode('%PDF-demo');await f.store.put('shipping:test',data,'application/pdf');
  assert.equal((await f.store.find('shipping:test')).private,true);assert.deepEqual(await f.store.read('shipping:test'),data);
  const link=await f.store.link('shipping:test');const r=await serveSignedPDF(new Request(link.url),f.opts);
  assert.equal(r.status,200);assert.equal(await r.text(),'%PDF-demo');assert.equal(r.headers.get('cache-control'),'private, no-store');
});
test('modified, unsigned and expired links cannot download',async()=>{
  const f=fixture(),link=await f.store.link('shipping:test');
  assert.equal((await serveSignedPDF(new Request(link.url.replace('signature=','signature=x')),f.opts)).status,403);
  assert.equal((await serveSignedPDF(new Request('https://private.example.com/shipping/labels'),f.opts)).status,403);
  f.advance();assert.equal((await serveSignedPDF(new Request(link.url),f.opts)).status,403);
});
test('missing originals fail instead of triggering another courier download',async()=>{
  const f=fixture();await assert.rejects(f.store.read('shipping:missing'),/Canonical PDF missing/);
  await assert.rejects(f.store.put('shipping:test',new TextEncoder().encode('bad'),'application/pdf'));
});
