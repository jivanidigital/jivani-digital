# D2C Label Relay

Part of **[D2C Ops Kit](https://github.com/opskits/d2c-ops-kit)** by [opskits](https://github.com/opskits): free, open-source tools for D2C brands, one repository per tool.

Free, open-source tools for direct-to-consumer (D2C) brands and small operations teams.

We are building this project in public, starting with practical shipping automation. This is a new project: there are no external adoption or download claims.

## Tools

| Tool | Purpose | Status |
| --- | --- | --- |
| [Label Relay](tools/label-relay/) | Retry-aware shipping-label workflows, private PDFs and email/WhatsApp delivery adapters | Early toolkit; 28 local offline tests; carrier integration and live acceptance pending |

## Get started

With Node 22+ and pnpm 10:

```sh
cd tools/label-relay
pnpm install --frozen-lockfile
pnpm test
node examples/messages.mjs
```

The tests use synthetic data and fake providers. They do not buy shipping, book pickups or send messages.

## Public development

The toolkit is free under the MIT license. There are no paid plans. Contributions, bug reports and documentation improvements are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md), [ROADMAP.md](ROADMAP.md) and [SECURITY.md](SECURITY.md).

Only reusable code and synthetic examples belong here. Never add customer data, real labels, credentials or business account configuration.

Each tool lives in its own folder. Future tools will be added when there is working code and documentation, rather than placeholder product claims.

## For AI contributors

Start with [AGENTS.md](AGENTS.md) and [docs/AI-HANDOVER.md](docs/AI-HANDOVER.md). Claude can use [CLAUDE.md](CLAUDE.md). See [CHANGELOG.md](CHANGELOG.md) for changes and [the application record](docs/claude-oss-application.md) for the Claude for Open Source submission context.
