const clean = v => String(v ?? '').replace(/[\r\n\x00-\x1f]/g, ' ').trim();
const escape = v => clean(v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const wa = v => clean(v).replace(/[*_~`]/g, '');

export function privateLink(link, now, allowedHost) {
  const u = new URL(link.url);
  if (u.protocol !== 'https:' || u.hostname !== allowedHost || u.port || u.hash || u.username || u.password ||
      !Number.isFinite(link.expiresAt) || link.expiresAt < now + 3600000) {
    throw new Error('Expected a private HTTPS link valid for at least one hour');
  }
  return u.href; // Storage adapter must sign expiring links.
}

export function shippingMessages({ day, orders, pickup, links, now, allowedHost }) {
  if (!orders.length) throw new Error('Do not send an empty shipping report');
  const labelUrl = privateLink(links.labels, now, allowedHost);
  const confirmed = pickup?.status === 'scheduled' && pickup.id;
  const pickupText = confirmed
    ? `Pickup: ${clean(pickup.day)}, ${clean(pickup.slot)} IST at ${clean(pickup.location)} (request ${clean(pickup.id)}).`
    : 'Pickup is not confirmed. Do not assume the courier is booked.';
  const numbers=orders.map(o=>clean(o.number));
  const summary=numbers.slice(0,8).join(', ')+(numbers.length>8?` + ${numbers.length-8} more`:'');
  const instructions = 'Forward the attached PDF to the packer. Open it in their own computer account and print one copy on configured label printer using Label Relay 4x6, 4 x 6 inches, portrait, 100% scale. No ChatGPT login is needed.';
  const subject = `Label Relay shipping labels - ${clean(day)} - ${orders.length} parcel${orders.length === 1 ? '' : 's'}`;
  const text = [subject,'',`Orders: ${summary}`,pickupText,'','The shipping labels PDF is attached.',instructions,'',`Private labels link: ${labelUrl}`,'The link expires; keep the attached PDF.'].join('\n');
  const html = `<h2>${escape(subject)}</h2><p><b>Orders:</b> ${escape(summary)}</p><p>${escape(pickupText)}</p><p>The shipping labels PDF is attached.</p><p>${escape(instructions)}</p><p><a href="${escape(labelUrl)}">Download shipping labels</a></p><p>The private link expires. Keep the attached PDF.</p>`;
  const whatsapp = [`*Label Relay shipping labels - ${wa(day)}*`,`${orders.length} parcels | ${wa(summary)}`,wa(pickupText),'',`Labels PDF: ${labelUrl}`,'','Forward the PDF to the packer.','Print once on the computer: Label Relay 4x6, 100%.','No ChatGPT login needed.'].join('\n');
  return { email: { subject, text, html }, whatsapp };
}
