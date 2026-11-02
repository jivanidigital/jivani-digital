import { Journal } from './journal.mjs';
import { shippingMessages } from './messages.mjs';

const required = (v, message) => { if (!v) throw new Error(message); return v; };
export function lowestRate(rates, now) {
  required(Array.isArray(rates) && rates.length, 'No rates');
  const available = rates.filter(r => r.available === true);
  required(available.length, 'No available shipping service');
  for (const r of available) {
    required(r.id && Number.isSafeInteger(r.totalPaise) && r.totalPaise >= 0 && r.currency === 'INR' &&
      Number.isFinite(r.expiresAt) && r.expiresAt > now, 'Invalid, incomplete or expired quote');
  }
  return [...available].sort((a,b) => a.totalPaise - b.totalPaise || a.id.localeCompare(b.id))[0];
}

function validateOrders(orders) {
  required(Array.isArray(orders) && orders.length <= 50, 'Batch limit is 50 orders');
  const ids = new Set();
  for (const o of orders) {
    required(o.id && !ids.has(o.id), 'Missing or duplicate source order ID'); ids.add(o.id);
    required(o.eligible === true && !o.cancelled && o.number && o.fingerprint, 'Ineligible or unversioned order');
    required(o.parcel && ['weightGrams','lengthCm','widthCm','heightCm'].every(k => Number.isFinite(o.parcel[k]) && o.parcel[k] > 0), 'Accurate parcel details required');
  }
}

/** All adapters are injected. No live provider is called without reviewed bindings. */
export async function runShipping({ storage, carrier, files, compose, delivery, config, now = Date.now() }) {
  required(config.enabled === true, 'Shipping is disabled pending review and activation');
  required(/^\d{4}-\d{2}-\d{2}$/.test(config.day) && config.location && config.scope, 'Missing batch scope');
  required(config.slot === '14:00-18:00', 'Only the confirmed 2-6 PM pickup slot is supported');
  const journal = new Journal(storage);
  const prefix = `shipping:${config.scope}`;
  // Freeze the daily set. New orders belong in an explicitly separate batch.
  const batchKey = `${prefix}:batch:${config.location}:${config.day}`;
  const orders = await journal.once(`${batchKey}:orders`, async () => {
    const rows = await carrier.listEligibleOrders();
    validateOrders(rows);
    return [...rows].sort((a,b) => a.id.localeCompare(b.id));
  });
  if (!orders.length) return { status: 'empty', parcels: 0 };
  // Validate frozen order versions again before ANY shipment mutation on each run.
  const fresh = await carrier.listEligibleOrders();
  for (const o of orders) required(fresh.some(f => f.id === o.id && f.fingerprint === o.fingerprint && f.eligible && !f.cancelled), 'Order changed; stop and review batch');
  const shipments = [];
  for (const order of orders) {
    // Order identity is global across days; replay never creates a second AWB.
    const shipment = await journal.once(`${prefix}:order:${order.id}:awb`, async () => {
      const existing = await carrier.findShipment(order.id);
      if (existing) {
        required(existing.orderId === order.id && existing.fingerprint === order.fingerprint && existing.awb && existing.state === 'ready', 'Existing shipment is not safe to pack');
        return existing;
      }
      const quote = lowestRate(await carrier.quotes(order), now);
      // This API must manifest the EXISTING imported carrier order, not create a duplicate.
      const made = await carrier.manifestImportedOrder(order, quote);
      required(made?.awb && made.orderId === order.id && made.fingerprint === order.fingerprint && made.state === 'ready', 'Missing or mismatched AWB receipt');
      return made;
    });
    required(shipment.orderId === order.id && shipment.fingerprint === order.fingerprint && shipment.awb && shipment.state === 'ready', 'Cached shipment differs from current order');
    required(!shipments.some(s => s.awb === shipment.awb), 'One AWB cannot label two orders');
    shipments.push(shipment);
  }
  // Never print a shipment that has since been cancelled, collected or replaced.
  await carrier.assertReady(shipments);
  const labels = [];
  for (const s of shipments) {
    const key = `${prefix}:label:${s.awb}:${s.labelVersion || '1'}`;
    labels.push(await journal.once(key, async () => {
      const stored = await files.find(key);
      if (stored) return required(stored.private === true && stored.id, 'Label storage must be private') && stored;
      const bytes = await carrier.downloadLabel(s.awb);
      const ref = await files.put(key, bytes, 'application/pdf');
      required(ref?.private === true && ref.id, 'Label storage must be private');
      return ref;
    }));
  }
  const artifacts = await journal.once(`${batchKey}:pdfs`, async () => {
    const labelBytes=[];let total=0;
    for(const ref of labels){
      const data=await files.read(ref.id);total+=data.length;
      required(total<=8*1024*1024,'Split batch: source labels exceed memory budget');
      labelBytes.push(data);
    }
    const result = await compose({ orders, shipments, labelBytes });
    const labelRef = await files.put(`${batchKey}:labels`, result.labels, 'application/pdf');
    required(labelRef?.private && labelRef.id, 'Private PDF required');
    return { labels: labelRef };
  });
  const pickup = await journal.once(`${prefix}:pickup:${config.location}:${config.day}`, async () => {
    const p = await carrier.findPickup(config.location, config.day) || await carrier.createPickup({
      location: config.location, day: config.day, slot: config.slot, awbs: shipments.map(s => s.awb)
    });
    required(p?.id && p.status === 'scheduled' && p.day === config.day && p.location === config.location && p.slot === config.slot,
      'Pickup is not confirmed for the requested date and slot');
    await carrier.assertPickupContains(p, shipments.map(s => s.awb));
    return p;
  });
  const links = { labels: await files.link(artifacts.labels.id) };
  const messages = shippingMessages({ day: config.day, orders, pickup, links, now, allowedHost: config.downloadHost });
  const results = {};
  // Independent channels. Failure/uncertainty in one must not stop the other.
  for (const channel of ['email','whatsapp']) {
    try {
      results[channel] = await journal.once(`${batchKey}:delivery:${channel}`, async () => {
        const receipt = await delivery[channel]({ ...messages, artifacts, batchId: batchKey });
        required(receipt?.id && ['accepted','queued','delivered'].includes(receipt.status), 'Missing delivery receipt');
        return receipt;
      });
    } catch (error) { results[channel] = { status: 'needs_review', reason: error.name }; }
  }
  return { status: Object.values(results).every(r => r.status !== 'needs_review') ? 'submitted' : 'needs_review', parcels: orders.length, pickup, artifacts, delivery: results };
}
