import test from 'node:test';
import assert from 'node:assert/strict';
import {PDFDocument} from 'pdf-lib';
import {Journal,UncertainStep,BeforeEffectError} from '../src/journal.mjs';
import {lowestRate,runShipping} from '../src/pipeline.mjs';
import {shippingMessages} from '../src/messages.mjs';
import {composeLabelPDF} from '../src/pdfs.mjs';
import {emailDelivery,whatsappDelivery,signedEnvelope} from '../src/delivery.mjs';

class Storage {
  constructor(){this.map=new Map();this.tail=Promise.resolve();}
  async get(k){return structuredClone(this.map.get(k));}
  async put(k,v){this.map.set(k,structuredClone(v));}
  async delete(k){this.map.delete(k);}
  transaction(fn){const result=this.tail.then(()=>fn(this));this.tail=result.catch(()=>{});return result;}
}
const now=Date.UTC(2026,10,2,4);
const order=(id='order-1')=>({id,number:'#DEMO-1',fingerprint:'version-1',eligible:true,items:[{title:'Sample phone case',variant:'iPhone 17',quantity:1}],parcel:{weightGrams:100,lengthCm:26,widthCm:21,heightCm:3}});
async function label(size=[288,432]){const d=await PDFDocument.create();d.addPage(size);return d.save();}
function fixture(){
  const storage=new Storage(),counts={manifest:0,label:0,pickup:0,email:0,whatsapp:0},blobs=new Map();
  const row=order(), shipment={awb:'DEMO-AWB-1',orderId:row.id,fingerprint:row.fingerprint,state:'ready'};
  const p={id:'DEMO-PICKUP',status:'scheduled',day:'2026-11-02',slot:'14:00-18:00',location:'TEST'};
  const args={storage,now,config:{enabled:true,scope:'test',day:'2026-11-02',location:'TEST',slot:'14:00-18:00',downloadHost:'private.example.com'},
    carrier:{listEligibleOrders:async()=>[row],findShipment:async()=>null,quotes:async()=>[
      {id:'air',available:true,totalPaise:16000,currency:'INR',expiresAt:now+600000},
      {id:'surface',available:true,totalPaise:10634,currency:'INR',expiresAt:now+600000}],
      manifestImportedOrder:async(o,q)=>{counts.manifest++;assert.equal(q.id,'surface');return shipment;},
      assertReady:async()=>{},downloadLabel:async()=>{counts.label++;return label();},findPickup:async()=>null,
      createPickup:async()=>{counts.pickup++;return p;},assertPickupContains:async()=>{}},
    files:{find:async key=>blobs.has(key)?{id:key,private:true}:null,
      put:async(key,bytes)=>{blobs.set(key,bytes);return{id:key,private:true};},read:async id=>blobs.get(id),
      link:async id=>({url:`https://private.example.com/${encodeURIComponent(id)}?sig=demo`,expiresAt:now+7200000})},
    compose:composeLabelPDF,
    delivery:{email:async()=>{counts.email++;return{id:'email-1',status:'accepted'};},whatsapp:async()=>{counts.whatsapp++;return{id:'wa-1',status:'queued'};}}};
  return {args,counts,blobs,row,shipment,p};
}

test('replaying a complete batch creates no duplicate AWB, PDF download, pickup or messages',async()=>{
  const f=fixture();const first=await runShipping(f.args);const second=await runShipping(f.args);
  assert.equal(first.status,'submitted');assert.equal(second.delivery.whatsapp.status,'queued');
  assert.deepEqual(f.counts,{manifest:1,label:1,pickup:1,email:1,whatsapp:1});
  const labels=await PDFDocument.load(f.blobs.get(first.artifacts.labels.id));assert.equal(labels.getPageCount(),1);
});
test('concurrent claims never duplicate an external effect',async()=>{
  const j=new Journal(new Storage());let calls=0;
  const all=await Promise.allSettled([j.once('awb',async()=>{calls++;await new Promise(r=>setTimeout(r,10));return 'receipt';}),j.once('awb',async()=>{calls++;return 'bad';})]);
  assert.equal(calls,1);assert.equal(all.filter(r=>r.status==='rejected').length,1);
});
test('ambiguous manifest result stops replay and never blindly retries',async()=>{
  const f=fixture();f.args.carrier.manifestImportedOrder=async()=>{f.counts.manifest++;throw new Error('timeout after request');};
  await assert.rejects(runShipping(f.args));await assert.rejects(runShipping(f.args),UncertainStep);assert.equal(f.counts.manifest,1);
});
test('provider-confirmed before-send rejection can be retried',async()=>{
  const j=new Journal(new Storage());await assert.rejects(j.once('x',async()=>{throw new BeforeEffectError();}));
  assert.equal(await j.once('x',async()=>42),42);
});
test('reconciliation requires confirmed evidence and never resets unknown outcomes',async()=>{
  const j=new Journal(new Storage());await assert.rejects(j.once('pickup',async()=>{throw Error('timeout');}));
  await assert.rejects(j.reconcile('pickup',async()=>({confirmed:false})),UncertainStep);
  await j.reconcile('pickup',async()=>({confirmed:true,value:{id:'verified-pickup'}}));
  assert.deepEqual(await j.once('pickup',async()=>{throw Error('must not repeat');}),{id:'verified-pickup'});
});
test('WhatsApp proceeds if email outcome is uncertain; replay does not resend either',async()=>{
  const f=fixture();f.args.delivery.email=async()=>{f.counts.email++;throw new Error('timeout');};
  const result=await runShipping(f.args);assert.equal(result.status,'needs_review');assert.equal(result.delivery.whatsapp.status,'queued');
  await runShipping(f.args);assert.equal(f.counts.email,1);assert.equal(f.counts.whatsapp,1);assert.equal(f.counts.label,1);
});
test('existing ready shipment and matching pickup are reused',async()=>{
  const f=fixture();f.args.carrier.findShipment=async()=>f.shipment;f.args.carrier.findPickup=async()=>f.p;
  await runShipping(f.args);assert.equal(f.counts.manifest,0);assert.equal(f.counts.pickup,0);
});
test('no orders means no pickup, downloads or notifications',async()=>{
  const f=fixture();f.args.carrier.listEligibleOrders=async()=>[];assert.equal((await runShipping(f.args)).status,'empty');
  assert.deepEqual(f.counts,{manifest:0,label:0,pickup:0,email:0,whatsapp:0});
});
test('disabled configuration fails before even reading orders',async()=>{
  const f=fixture();f.args.config.enabled=false;await assert.rejects(runShipping(f.args),/disabled/);assert.equal(f.counts.manifest,0);
});
test('changed/cancelled order stops a frozen batch',async()=>{
  const f=fixture();await runShipping(f.args);f.row.cancelled=true;await assert.rejects(runShipping(f.args),/Order changed/);assert.equal(f.counts.label,1);
});
test('lowest rate uses total including all charges, stable ties and rejects incomplete quotes',()=>{
  const good={id:'surface',available:true,totalPaise:10634,currency:'INR',expiresAt:now+1000};
  assert.equal(lowestRate([good,{...good,id:'air',totalPaise:20000}],now).id,'surface');
  assert.throws(()=>lowestRate([good,{...good,id:'unknown',totalPaise:undefined}],now),/Invalid/);
  assert.throws(()=>lowestRate([{...good,expiresAt:now-1}],now),/expired/);
});
test('duplicate source IDs or AWB mismatch halt shipping',async()=>{
  const f=fixture();f.args.carrier.listEligibleOrders=async()=>[f.row,f.row];await assert.rejects(runShipping(f.args),/duplicate/);
  const g=fixture();g.args.carrier.findShipment=async()=>({...g.shipment,orderId:'wrong'});await assert.rejects(runShipping(g.args),/not safe/);
});
test('wrong pickup slot does not send a report saying booked',async()=>{
  const f=fixture();f.args.carrier.findPickup=async()=>({...f.p,slot:'18:00-21:00'});await assert.rejects(runShipping(f.args),/not confirmed/);assert.equal(f.counts.email,0);
});
test('wrong-sized and multi-page labels stop instead of cropping barcodes',async()=>{
  await assert.rejects(composeLabelPDF({orders:[order()],shipments:[{awb:'x'}],labelBytes:[await label([595,842])]}),/not a recognized/);
  const d=await PDFDocument.create();d.addPage([288,432]);d.addPage([288,432]);
  await assert.rejects(composeLabelPDF({orders:[order()],shipments:[{awb:'x'}],labelBytes:[await d.save()]}),/exactly one/);
});
test('merged labels preserve 4x6 and produce no packing list',async()=>{
  const result=await composeLabelPDF({orders:[order(),order('2')],shipments:[{awb:'A'},{awb:'B'}],labelBytes:[await label(),await label()]});
  assert.deepEqual(Object.keys(result),['labels']);
  const p=await PDFDocument.load(result.labels);assert.equal(p.getPageCount(),2);
  for(const page of p.getPages())assert.deepEqual(page.getSize(),{width:288,height:432});
});
test('observed carrier 298x421 export fits within 4x6 without clipping',async()=>{
  const d=await PDFDocument.create();d.addPage([298,421]).drawText('SAMPLE LABEL - DO NOT SHIP',{x:10,y:400,size:10});
  const result=await composeLabelPDF({orders:[order()],shipments:[{awb:'DEMO'}],labelBytes:[await d.save()]});
  const p=await PDFDocument.load(result.labels);assert.deepEqual(p.getPage(0).getSize(),{width:288,height:432});
});
function report(){return{day:'2026-11-02',orders:[order()],pickup:{status:'scheduled',id:'P',day:'2026-11-02',slot:'14:00-18:00',location:'TEST'},links:{labels:{url:'https://private.example.com/labels?sig=a&x=b',expiresAt:now+7200000},packing:{url:'https://private.example.com/packing?sig=b',expiresAt:now+7200000}},now,allowedHost:'private.example.com'};}
test('messages escape HTML, avoid subject emojis, omit packing list and preserve link expiry',()=>{
  const r=report();r.orders[0].number='<img src=x onerror=alert(1)>';const m=shippingMessages(r);
  assert.ok(m.email.html.includes('&lt;img'));assert.ok(!m.email.html.includes('<img'));assert.ok(/^[\x20-\x7e]+$/.test(m.email.subject));
  assert.ok(m.whatsapp.split('\n').length<=15);assert.match(m.email.text,/PDF.*attached/);assert.ok(m.email.html.includes('&amp;x=b'));
  assert.ok(!m.email.text.includes('packing list'));
});
test('expired/wrong-host links and unconfirmed pickup cannot masquerade as ready',()=>{
  const r=report();r.links.labels.expiresAt=now;assert.throws(()=>shippingMessages(r));
  const s=report();s.links.labels.url='https://attacker.example/labels';assert.throws(()=>shippingMessages(s));
  const u=report();u.pickup={};assert.match(shippingMessages(u).email.text,/not confirmed/);
});
test('email adapter sends one saved attachment in a verifiable signed envelope',async()=>{
  const bytes=await label();let sent;
  const fn=emailDelivery({endpoint:'https://script.google.com/macros/s/demo/exec',secret:'s'.repeat(32),files:{read:async()=>bytes},fetcher:async(_,options)=>{sent=JSON.parse(options.body);return Response.json({id:'batch',status:'accepted'});}});
  await fn({email:{subject:'s',text:'t',html:'h'},artifacts:{labels:{id:'l'},packing:{id:'p'}},batchId:'batch'});
  assert.equal(JSON.parse(sent.body).attachments.length,1);assert.equal((await signedEnvelope(JSON.parse(sent.body),'s'.repeat(32),sent.timestamp)).signature,sent.signature);
});
test('WhatsApp adapter uses only /notify and reports queued distinctly',async()=>{
  let target,body;
  const fn=whatsappDelivery({workerOrigin:'https://worker.example.com',key:'secret',to:'910000000000',fetcher:async(url,o)=>{target=url;body=JSON.parse(o.body);return Response.json({ok:true,via:'queued'});}});
  assert.equal((await fn({whatsapp:'text',batchId:'test'})).status,'queued');assert.equal(target,'https://worker.example.com/notify');assert.equal(body.text,'text');
});
