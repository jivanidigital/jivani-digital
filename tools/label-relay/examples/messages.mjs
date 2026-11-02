import {shippingMessages} from '../src/messages.mjs';
// Offline example: no credentials, provider requests or real data.
const now=Date.now();
const message=shippingMessages({day:'2026-11-02',orders:[{number:'#DEMO-1'},{number:'#DEMO-2'}],
  pickup:{status:'scheduled',id:'DEMO-PICKUP',day:'2 Nov 2026',slot:'14:00-18:00',location:'Sample Warehouse'},
  links:{labels:{url:'https://private.example.com/sample-labels?signature=DEMO',expiresAt:now+86400000}},now,allowedHost:'private.example.com'});
console.log('OFFLINE SAMPLE ONLY - NOT SENT\n\n'+message.email.text+'\n\n'+message.whatsapp);
