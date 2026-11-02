# Integration notes

This is an early toolkit, not a deployable fulfillment application.

## Carrier interface

`runShipping()` needs:

- `listEligibleOrders()` — authoritative pending/ready-to-pack orders with `id`,
  `number`, `eligible`, `cancelled`, `fingerprint`, and accurate `parcel`
  (`weightGrams`, `lengthCm`, `widthCm`, `heightCm`). The fingerprint covers address,
  payment/COD, items and parcel details; it should not change just because AWB status changes.
- `findShipment(sourceId)` — complete existing-shipment lookup. Null only means
  confirmed absence. A ready receipt has `awb`, `orderId`, `fingerprint`,
  `state: 'ready'`, and optional `labelVersion`.
- `quotes(order)` — all currently available services: `id`, `available`,
  `totalPaise`, `currency: 'INR'`, and numeric `expiresAt`. Quote totals include tax
  and all applicable charges. The first version supports INR only.
- `manifestImportedOrder(order,quote)` — revalidate the source order and quote,
  manifest that existing imported order, and return an authoritative AWB receipt.
  Never blindly retry a timeout or create another shipment to work around it.
- `assertReady(shipments)` — fail if cancelled, collected, replaced or uncertain.
- `downloadLabel(awb)` — one official PDF for that AWB, as Uint8Array.
- `findPickup(location,day)` / `createPickup({location,day,slot,awbs})` — return
  `{id,status:'scheduled',location,day,slot}` from provider evidence.
- `assertPickupContains(pickup,awbs)` — verify that each AWB is included.

The first version freezes one batch per location/day, limits it to 50 orders and
supports a 14:00–18:00 pickup slot. Additional batches or slot policies need deliberate
implementation. It rejects changed/cancelled orders rather than silently editing
a frozen batch. Source labels have an 8 MiB cumulative bound; email attachment
delivery has a 2 MiB bound. Split larger batches explicitly.

## Journal and uncertainty

Use strongly consistent transactional storage implementing `transaction`, `get`,
`put`, and `delete`, such as Durable Object storage. Eventually consistent KV is
not a substitute. Keep one coordination domain per account/warehouse.

Each step writes `started` before its external effect and `done` with a receipt
afterward. A timeout, restart or lost receipt stays blocked. Reconcile with
authoritative provider evidence through `Journal.reconcile`; never infer that a
timeout means nothing happened. Only a verified pre-effect rejection may clear a
claim for retry. This is not an exactly-once guarantee from external providers.

## Private PDFs

Provision an R2-compatible bucket with public access disabled. `privateFileStore`
needs a trusted HTTPS origin and a dedicated 32+ character signing secret. Map
only the intended GET route to `serveSignedPDF`. URLs are 24-hour bearer
capabilities: avoid public logging, disable analytics on that route and apply an
appropriate retention/lifecycle rule. Never commit real PDFs or links.

Original label bytes are cached by AWB/version. Combined PDF pages preserve 4x6
geometry or fit recognized 298x421 pt content proportionally. Unknown page sizes,
rotations and multi-page per-AWB exports fail. A physical printer/barcode acceptance
test is mandatory before real use.

## Email sender

Use a separate Apps Script project with the provided `.gs` file. Pre-create a
private spreadsheet tab `Packing Delivery Log` with headers:
`Request ID | Digest | State | IST time`.

Configure Script Properties: `PE_ENABLED` (defaults disabled), `PE_RECIPIENT`,
`PE_SENDER_ALIAS` (must be a verified alias), `PE_SECRET` (32+ random characters),
`PE_LOG_SHEET_ID`. Keys and recipients belong in secrets/configuration, not source.
The worker signs body + timestamp; the sender rejects stale or forged requests,
checks quota and attachment count/type, and stores a durable replay receipt before
sending. It scans a bounded ledger of 5,000 rows; archive it explicitly before the limit.
An accepted receipt means the mail API accepted the request, not inbox delivery.
Test the deployed Apps Script redirect behavior with one consenting recipient.

## WhatsApp

The provided adapter only calls an existing configurable `/notify` gateway.
It doesn't include that gateway implementation or create an approved template.
Keep provider keys in secrets and recipients in private configuration. Queued
messages are not marked delivered. Add verified provider receipt handling and
approved document templates in an adapter before claiming proactive PDF delivery.

## Before real activation

Verify carrier contracts, dependency installation, storage privacy, total-cost
quotes, source data accuracy, one-recipient email/WhatsApp tests, printer output
and operator controls. Start with explicit approval of one batch. No hidden live
credentials, demo network calls or automatic activation are supplied here.
