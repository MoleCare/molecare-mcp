# Security Policy

## Reporting a vulnerability

**Please do not open a public GitHub issue for security problems.**

Email **info@molecare.co.uk** with:

- what the issue is and where in the code it lives
- how to reproduce it
- what an attacker could do with it

You should get an acknowledgement within **3 working days**. We will tell you when
we have a fix and will credit you in the release notes unless you would rather we
did not.

## Scope

This repository is the MoleCare **MCP server** — a developer tool. In scope:

- vulnerabilities in this server's code (injection, SSRF, path traversal, unsafe
  deserialisation, rate-limit bypass)
- tool definitions that leak configuration or credentials into responses
- dependency vulnerabilities that are actually reachable from this code

Out of scope for this repo (but still worth telling us about at the same address):

- the MoleCare mobile apps, web app, or production API
- issues that require a contributor to have already put real production
  credentials in their own `.env`

## Data safety

MCP tools that accept a `userId` return **personal health data** if you configure
them against a real backend. That is a deliberate capability, not a bug — but it
means:

- the security boundary is your API's authentication, not this process
- run against `localhost` for development, demos, and screenshots
- never record a demo or file a bug report using real patient data
- never attach a real skin photo to an issue

If you believe a tool in this repo leaks data it should not, treat that as a
vulnerability and report it privately using the process above.
