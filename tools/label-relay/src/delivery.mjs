import { BeforeEffectError } from './journal.mjs';
const base64 = bytes => { let s=''; for (const x of bytes) s+=String.fromCharCode(x); return btoa(s); };

export async function signedEnvelope(body, secret, timestamp=Date.now()) {
  if (!secret || secret.length < 32) throw new BeforeEffectError('A dedicated delivery signing secret is required');
  const raw=JSON.stringify(body), enc=new TextEncoder();
  const key=await crypto.subtle.importKey('raw',enc.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const signature=base64(new Uint8Array(await crypto.subtle.sign('HMAC',key,enc.encode(`${timestamp}.${raw}`))));
  return {timestamp,body:raw,signature};
}

/** Email: The attachment use the saved bytes, never download labels again. */
export function emailDelivery({endpoint,secret,files,fetcher=fetch}) {
  return async ({email,artifacts,batchId}) => {
    if (!/^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec$/.test(endpoint||'')) throw new BeforeEffectError('Reviewed Apps Script endpoint required');
    const attachments=[];
    for (const kind of ['labels']) {
      const bytes=await files.read(artifacts[kind].id);
      if (bytes.length>2*1024*1024) throw new BeforeEffectError('Split oversized batch before delivery');
      attachments.push({name:`Label Relay-${kind}.pdf`,base64:base64(bytes)});
    }
    const response=await fetcher(endpoint,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(await signedEnvelope({id:batchId,...email,attachments},secret))});
    // An HTTP failure can happen after Gmail accepted the email. Never retry it blindly.
    if (!response.ok) throw new Error('Email outcome uncertain');
    const receipt=await response.json();
    if (receipt.status==='rejected_before_send') throw new BeforeEffectError('Email sender rejected before sending');
    if (!receipt.id || receipt.status!=='accepted') throw new Error('Email needs reconciliation');
    return receipt;
  };
}

/** Existing /notify preserves closed-window team queuing. Links are the supported fallback. */
export function whatsappDelivery({workerOrigin,key,to,fetcher=fetch}) {
  return async ({whatsapp,batchId}) => {
    if (!/^https:\/\/[^/]+$/.test(workerOrigin||'') || !key || !/^\d{11,15}$/.test(to||'')) throw new BeforeEffectError('Configured worker and owner required');
    const response=await fetcher(`${workerOrigin}/notify`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({key,to,text:whatsapp})});
    if (!response.ok) throw new Error('WhatsApp outcome uncertain');
    const result=await response.json();
    if (!result.ok) throw new Error('WhatsApp needs reconciliation');
    // Queued is not delivered. Keep the distinction in the batch receipt.
    return {id:`${batchId}:whatsapp`,status:result.via==='queued'?'queued':'accepted'};
  };
}
