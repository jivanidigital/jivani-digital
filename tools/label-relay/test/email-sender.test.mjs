import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {createHmac,createHash} from 'node:crypto';
import {signedEnvelope} from '../src/delivery.mjs';

const source=await fs.readFile(new URL('../apps-script/PackingEmail.gs',import.meta.url),'utf8');
function setup(){
  const rows=[['Request ID','Digest','State','IST time']];let sends=0,fail=false;
  const props={PE_ENABLED:'yes',PE_SECRET:'s'.repeat(32),PE_RECIPIENT:'owner@example.com',PE_SENDER_ALIAS:'shipping@example.com',PE_LOG_SHEET_ID:'test'};
  const sheet={getLastRow:()=>rows.length,appendRow:r=>rows.push(r),getRange:(r,c,n=1)=>({getValues:()=>rows.slice(r-1,r-1+n).map(x=>x.slice(c-1,c+2)),setValue:v=>{rows[r-1][c-1]=v;}})};
  const context=vm.createContext({Date,JSON,String,Math,Array,Error,
    PropertiesService:{getScriptProperties:()=>({getProperty:k=>props[k]})},
    ContentService:{MimeType:{JSON:'json'},createTextOutput:s=>({setMimeType:()=>JSON.parse(s)})},
    Utilities:{Charset:{UTF_8:'utf8'},DigestAlgorithm:{SHA_256:'sha256'},
      base64Encode:b=>Buffer.from(b).toString('base64'),base64Decode:s=>[...Buffer.from(s,'base64')],
      computeHmacSha256Signature:(s,k)=>[...createHmac('sha256',k).update(s).digest()],
      computeDigest:(_,s)=>[...createHash('sha256').update(s).digest()],
      newBlob:(bytes,mime,name)=>({bytes,mime,name}),formatDate:()=> 'test'},
    LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock:()=>{}})},
    SpreadsheetApp:{openById:()=>({getSheetByName:()=>sheet}),flush:()=>{}},
    MailApp:{getRemainingDailyQuota:()=>10},GmailApp:{getAliases:()=>['shipping@example.com'],sendEmail:(to,subject,text,options)=>{
      sends++;assert.equal(to,'owner@example.com');assert.equal(options.attachments.length,1);if(fail)throw Error('uncertain');
    }}});
  vm.runInContext(source,context);
  const body={id:'shipping:test:batch:TEST:2026-11-02',subject:'Label Relay shipping labels - 2026-11-02 - 1 parcel',text:'The PDF is attached.',html:'<p>PDF attached</p>',attachments:[{name:'Label Relay-labels.pdf',base64:Buffer.from('%PDF-demo').toString('base64')}]};
  return{context,body,props,rows,sends:()=>sends,setFail:()=>{fail=true;}};
}
async function send(f,envelope){return f.context.doPost({postData:{contents:JSON.stringify(envelope||await signedEnvelope(f.body,'s'.repeat(32)))}});}
test('sender accepts one attachment and deduplicates exact replay',async()=>{
  const f=setup();assert.equal((await send(f)).status,'accepted');assert.equal((await send(f)).status,'accepted');assert.equal(f.sends(),1);
});
test('sender timeout leaves durable started receipt and refuses duplicate',async()=>{
  const f=setup();f.setFail();assert.equal((await send(f)).status,'needs_review');assert.equal((await send(f)).status,'needs_review');assert.equal(f.sends(),1);assert.equal(f.rows[1][2],'started');
});
test('unsigned, stale and disabled requests cannot send',async()=>{
  const f=setup();const env=await signedEnvelope(f.body,'s'.repeat(32));env.signature='wrong';assert.equal((await send(f,env)).status,'rejected_before_send');
  assert.equal((await send(f,await signedEnvelope(f.body,'s'.repeat(32),Date.now()-600000))).status,'rejected_before_send');
  f.props.PE_ENABLED='no';assert.equal((await send(f)).status,'rejected_before_send');assert.equal(f.sends(),0);
});
test('changed payload under an accepted ID cannot send another email',async()=>{
  const f=setup();await send(f);f.body.text='changed';assert.equal((await send(f)).status,'needs_review');assert.equal(f.sends(),1);
});
test('sender rejects non-PDF payload, missing alias and extra attachment',async()=>{
  const f=setup();f.body.attachments[0].base64=Buffer.from('not pdf').toString('base64');assert.equal((await send(f)).status,'rejected_before_send');
  const g=setup();g.props.PE_SENDER_ALIAS='other@example.com';assert.equal((await send(g)).status,'rejected_before_send');
  const h=setup();h.body.attachments.push(h.body.attachments[0]);assert.equal((await send(h)).status,'rejected_before_send');assert.equal(h.sends(),0);
});
