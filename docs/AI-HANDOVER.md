# AI handover — 2 Nov 2026

## What we are building

D2C Label Relay (formerly jivanidigital/jivani-digital, "Jivani Digital Toolkit"; renamed and moved to opskits/d2c-label-relay on 7 Nov 2026) is a free, MIT-licensed tool for D2C brands and small operations teams. It is listed in the D2C Ops Kit index (opskits/d2c-ops-kit); new tools get their own d2c-<tool> repository. Label Relay lives at tools/label-relay. New tools should be added with working code, documentation and synthetic examples, not placeholder claims.

Ronak's company, Jivani Digital, is a digital marketing company. Public code remains free. Ronak may separately offer setup, customization, training, hosting and support to business owners who need help. No paid product or billing system is implemented here.

## What exists

Label Relay includes a transactional workflow journal and uncertain-result handling; lowest complete total-rate selection; one-download canonical label caching; labels-only PDF composition; signed expiring private PDF links; independent email/WhatsApp delivery adapters; and a disabled-by-default Apps Script email sender. Tests use synthetic orders/PDFs, fake providers and a sender VM. The 28 offline tests and GitHub CI checks passed on the implementation before this documentation change.

## What remains

Carrier-specific imported-order integration and reconciliation, runnable cloud deployment/bindings, sender configuration, real email/WhatsApp acceptance, and printed barcode verification. Existing adapters do not equal a complete ready-to-run service. Do not claim production readiness. Broader milestones include reusable WhatsApp automation, email automation for notifications/order updates/operational communication, and further D2C workflows driven by actual needs.

## Change history and next steps

PR #1 introduced the public toolkit and moved Label Relay into tools/label-relay, with shared roadmap/security/contribution docs and CI. This handover adds AI entry points and an application record. At preparation time PR #1 was still open; verify its state before further work. After merge, use a fresh branch from current main.

Next: produce a documented runnable sample with fake providers, then a verified carrier adapter and cloud deployment example. Keep real operational setup outside public examples. Record changes in CHANGELOG.md. Future PRs require Claude review and Ronak's merge; the initial one-time exception is exhausted by this initial setup.

## Claude subscription application

Ronak reported submission on 2 Nov 2026. The page called the offer Claude for Open Source, offering six months of Claude Ultra; Ronak also referred to it as the free Max program. Do not confuse the naming or claim approval. The project is new and does not demonstrate published adoption thresholds; the application asks for discretionary consideration. Pro subscription was reported by Ronak. See docs/claude-oss-application.md for the final prepared wording. No acceptance email or submitted-form receipt has been independently verified.
