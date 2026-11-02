// Cloudflare R2 bucket MUST have public access disabled. No KV/list polling.
const bytes = s => new TextEncoder().encode(s);
const b64 = b => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const unb64 = s => Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
const headers = {'content-type':'application/pdf','cache-control':'private, no-store','referrer-policy':'no-referrer','x-content-type-options':'nosniff','content-security-policy':"sandbox; default-src 'none'"};
async function signingKey(secret,usage) {
  if(!secret || secret.length<32)throw Error('Dedicated 32-character signing secret required');
  return crypto.subtle.importKey('raw',bytes(secret),{name:'HMAC',hash:'SHA-256'},false,[usage]);
}
function objectId(id){if(typeof id!=='string'||!id.startsWith('shipping:')||id.length>600||/[\r\n]/.test(id))throw Error('Invalid artifact ID');return id;}

export function privateFileStore({bucket,origin,secret,clock=Date.now}) {
  const base=new URL(origin);if(base.protocol!=='https:'||base.pathname!=='/'||base.search||base.hash||base.username||base.password)throw Error('HTTPS origin required');
  return {
    async find(key){objectId(key);const h=await bucket.head(key);return h?{id:key,private:true}:null;},
    async put(key,data,mime){
      objectId(key);if(mime!=='application/pdf'||!(data instanceof Uint8Array)||data.length>8*1024*1024||new TextDecoder().decode(data.slice(0,5))!=='%PDF-')throw Error('Expected bounded PDF bytes');
      // Orchestrator owns the single-flight journal. R2 PUT uses one stable key.
      await bucket.put(key,data,{httpMetadata:{contentType:mime}});return{id:key,private:true};
    },
    async read(id){const o=await bucket.get(objectId(id));if(!o)throw Error('Canonical PDF missing; do not silently download another');return new Uint8Array(await o.arrayBuffer());},
    async link(id){
      objectId(id);const expiresAt=clock()+24*3600000;
      const token=b64(bytes(JSON.stringify({id,expiresAt})));
      const sig=b64(await crypto.subtle.sign('HMAC',await signingKey(secret,'sign'),bytes(token)));
      return{url:`${base.origin}/shipping/labels?token=${token}&signature=${sig}`,expiresAt};
    }
  };
}

export async function serveSignedPDF(request,{bucket,secret,clock=Date.now}) {
  if(request.method!=='GET')return new Response('Method not allowed',{status:405,headers:{allow:'GET'}});
  const u=new URL(request.url);let data;
  try {
    const token=u.searchParams.get('token')||'',sig=u.searchParams.get('signature')||'';
    if(token.length>1500||sig.length>100||!await crypto.subtle.verify('HMAC',await signingKey(secret,'verify'),unb64(sig),bytes(token)))throw Error('Signature');
    data=JSON.parse(new TextDecoder().decode(unb64(token)));objectId(data.id);
    if(!Number.isFinite(data.expiresAt)||data.expiresAt<=clock()||data.expiresAt>clock()+24*3600000)throw Error('Expiry');
  }catch{return new Response('This private link is invalid or expired.',{status:403,headers:{'cache-control':'no-store'}});}
  const object=await bucket.get(data.id);
  if(!object)return new Response('PDF unavailable',{status:404,headers:{'cache-control':'no-store'}});
  return new Response(object.body,{headers:{...headers,'content-disposition':'attachment; filename="Label Relay-labels.pdf"'}});
}
