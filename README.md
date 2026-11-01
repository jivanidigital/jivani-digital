# Label Relay

A small, open-source toolkit for reliable shipping-label workflows. An early
component of a broader automation ecosystem being built for direct-to-consumer
(D2C) brands.

**Status: v0.1.0, an early-stage toolkit with tested components. It is not a
turnkey shipping integration or a production-ready fulfillment service.** There
are no claimed external users, downloads or adoption metrics at launch.

## What it does

- Records workflow steps in strongly consistent transactional storage, so a retry
  doesn't blindly repeat an AWB, pickup or notification after an uncertain result.
- Selects the cheapest complete, unexpired shipping quote by total price.
- Reuses existing AWBs and pickup requests through injected carrier adapters.
- Caches one original PDF per AWB/version and merges labels without a packing list.
- Preserves 4x6 vector pages; proportionally fits recognized 298x421 pt exports into
  a 4x6 page without cropping. Barcode readability needs a real printer test.
- Provides private object storage and HMAC-signed links that expire in 24 hours.
- Builds concise email and WhatsApp messages with order numbers and pickup details.
- Sends a saved PDF as an email attachment through a disabled-by-default Apps Script
  sender, with request authentication and a durable replay log.
- Tracks email and WhatsApp independently, including accepted versus queued status.

The goal is a cloud-run workflow: the packer receives a ready-to-print PDF and
doesn't need to learn an AI assistant or keep the owner's computer running.

## What it does not do yet

It has no production carrier adapter, deployed cloud service or automatic schedule.
Carrier account eligibility, imported-order manifestation, current all-inclusive
quotes, pickup membership and existing-shipment lookups need provider-specific
implementation and acceptance tests. Don't substitute a generic create-shipment
endpoint for an imported order without verifying duplicate protection.

The optional WhatsApp adapter targets a deployment-specific `/notify` gateway; it
is not a standalone official WhatsApp API integration. You must supply that gateway
or implement a compatible one. Closed-window messages may queue until the owner
replies, and download links can expire meanwhile. An emailed attachment remains
usable. Approved proactive document templates and delivery receipts are future work.

## Try it locally

Node.js 22 or newer and pnpm 10:

```sh
pnpm install --frozen-lockfile
pnpm test
node examples/messages.mjs
```

The tests use synthetic orders and PDF pages, fake carrier/storage services and a
VM of the Apps Script sender. They don't contact a courier, send email/WhatsApp,
book a pickup or require credentials. Initial local verification: 28 passing tests.
CI performs a clean dependency installation and reruns them.

## Example message (fictional data)

```text
Shipping labels - 2026-11-02
2 parcels | #DEMO-1, #DEMO-2
Pickup: 2 Nov 2026, 2-6 PM at Sample Warehouse.
Labels PDF: <private expiring link>
Forward the PDF to the packer. Print once at 100% on 4x6.
```

## Structure

| File | Purpose |
| --- | --- |
| `src/pipeline.mjs` | Order snapshot, AWB/label/pickup sequence and independent delivery steps |
| `src/journal.mjs` | Transactional step claims, replay receipts and evidence-based reconciliation |
| `src/pdfs.mjs` | Labels-only PDF composition |
| `src/private-files.mjs` | Private Cloudflare R2-compatible storage and signed PDF access |
| `src/messages.mjs` | Email text/HTML and WhatsApp text |
| `src/delivery.mjs` | Signed email requests and gateway notification adapter |
| `apps-script/PackingEmail.gs` | Optional sender-only Apps Script project; disabled until configured |
| `test/` | Offline workflow, security, PDF and sender tests |

## Integration contract

See [INTEGRATION.md](INTEGRATION.md). The engine requires injected carrier,
transactional journal, private file-store, PDF composer and delivery adapters.
The toolkit starts no network service or scheduler by itself.

## Roadmap for the D2C ecosystem

1. Verify a real carrier adapter without duplicate shipments or pickups.
2. Test cloud deployment, email delivery and label/barcode readability.
3. Add provider-independent webhooks, observability and fulfillment integrations.
4. Explore shared order and exception workflows for small D2C teams.

These are development goals, not features or integrations claimed to exist today.

## Contributing

Bug reports, synthetic carrier fixtures, documentation and adapter contributions
are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) and [SECURITY.md](SECURITY.md).
Never attach a real shipping label or customer export to a public issue.

MIT licensed. Third-party dependencies retain their own licenses.
