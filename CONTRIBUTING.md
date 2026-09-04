# Contributing to MoleCare MCP

Thanks for being here. This server is small, self-contained, and easy to run
locally — which makes it a good place to make a first open-source contribution.

## The one rule that is not negotiable

**This project must never produce, imply, or imitate a medical diagnosis.**

MoleCare MCP exposes *educational* dermatology knowledge and *operational*
tooling. It is not a medical device and is not regulated as one. Any change that
moves a tool's output closer to "this lesion is/isn't melanoma" will be declined,
however good the code is.

In practice, that means:

| Fine | Not fine |
|---|---|
| "The ABCDE criteria describe asymmetry, border, colour, diameter, evolution." | "This mole scores 4/5 on ABCDE, likely melanoma." |
| "Irregular borders are one feature clinicians assess." | "Irregular border detected — seek urgent care." |
| Returning a model confidence with an explicit non-diagnostic disclaimer | Returning a confidence as a verdict |
| Adding a SNOMED CT / ICD-10 lookup | Adding a triage or urgency score |

If you are unsure which side of the line a change sits on, open an issue and ask
before writing the code. Nobody will mind.

## Getting set up

```bash
git clone https://github.com/MoleCare/molecare-mcp.git
cd molecare-mcp
npm install
npm run build
npm start
```

You need **Node 18+**. You do *not* need credentials, an AWS account, a database,
or a MoleCare API key — with no `.env` present the server runs in mock mode and
returns synthetic data. That is the intended development mode.

Iterate with auto-reload:

```bash
npm run dev
```

Inspect the tool surface interactively:

```bash
npm run inspect
```

## Mock-first

Every client in `src/api/` must work with no credentials configured. If you add a
tool that talks to an external service, it needs a mock path that returns
plausible synthetic data when the relevant env var is unset. This keeps the repo
runnable for contributors, safe for demos and screenshots, and testable in CI.

Defaults must point at `localhost` or `example.com`. Never commit a real hostname,
account ID, bucket name, on-call address, or Slack channel.

## Before you open a pull request

- [ ] `npm test` passes (build plus the mock-mode and clinical-boundary checks)
- [ ] The server starts and the tool appears in `npm run inspect`
- [ ] New tools have a Zod schema for their inputs and a clear description string
- [ ] Anything medical carries a non-diagnostic disclaimer in the response
- [ ] No secrets, real hostnames, or personal data in code, tests, or examples
- [ ] No patient photos — ever, including in test fixtures

## Pull requests

Keep them focused; one concern per PR. Describe *what a user can now do* that they
could not before. If it changes a tool's response shape, say so explicitly — MCP
clients depend on it.

Small PRs get reviewed quickly. Large refactors are best discussed in an issue first.

## Good places to start

Issues tagged [`good first issue`](https://github.com/MoleCare/molecare-mcp/labels/good%20first%20issue)
are scoped so you do not need context on the wider MoleCare platform. If none are
open, these are always welcome:

- Test coverage for `src/api/*` mock paths
- Better Zod validation and error messages on tool inputs
- Additional dermatology knowledge resources under `molecare://knowledge/*`
- Docs for running against a self-hosted MoleCare-compatible API

## Reporting security issues

Do **not** open a public issue for a vulnerability. See [SECURITY.md](./SECURITY.md).

## Licence

By contributing you agree that your contributions are licensed under the
[Apache-2.0 licence](./LICENSE) that covers this project.
