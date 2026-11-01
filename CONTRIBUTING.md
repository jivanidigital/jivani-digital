# Contributing

This is an early project. Small, reviewable contributions are welcome.

1. Open an issue describing the bug or proposed integration. Use synthetic data.
2. Install dependencies with `pnpm install --frozen-lockfile` on Node 22+.
3. Add a regression test for behavioral changes and run `pnpm test`.
4. Open a pull request explaining behavior, validation and any provider assumptions.

Don't add real customer data, labels, credentials, account IDs or private links.
Carrier adapters must verify existing AWBs/pickups and handle uncertain mutations
without blind retries. Do not add live sending or shipment creation to tests.
Keep integrations disabled until the operator configures and tests them.

Contributions are made under the repository's MIT license. Be respectful and
constructive in discussions.
