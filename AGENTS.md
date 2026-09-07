# Automation Recorder: AI Maintainer Guide

This repository is a local-first, privacy-conscious foundation for turning
approved computer and browser work into auditable, editable workflow JSON. Its
goal is safe RPA-style automation: deterministic replay plus human-approved LLM
suggestions for unstructured pages and edge cases.

## Start here

```sh
npm test
npm run demo
npm run dashboard
```

The dashboard is deliberately loopback-only at `http://127.0.0.1:4311`; its
state lives under `.automation-recorder/` and is not committed. Read
[`docs/AI_GUIDE.md`](docs/AI_GUIDE.md) before changing capture, replay, or LLM
behavior.

## Architecture

| Location | Responsibility |
| --- | --- |
| `src/index.js` | Portable workflow schema, capture normalization, analysis, and replay contract. |
| `src/browser.js` | Browser audit conversion, redaction, audit Markdown, safe LLM review packet. |
| `extension/` | Chrome/Edge Manifest V3 evidence collector with explicit start/stop. |
| `src/dashboard-server.js` | Loopback local API and durable dashboard state. |
| `dashboard/` | Local editor, monitor, audit viewer, and analysis UI. |
| `test/engine.test.js` | Core behavioral and privacy regression tests. |

## Non-negotiable safety invariants

1. Never capture, persist, log, export, or send passwords, tokens, cookies,
   session values, OAuth assertions, raw clipboard contents, or unrestricted
   keystrokes.
2. Retain browser URL evidence only as `origin + pathname`, never queries,
   fragments, or form values.
3. Screenshots remain explicit opt-in and are suppressed near sensitive controls
   and pages with password fields.
4. LLMs may propose conditions, locators, and waits; they may not silently
   approve, execute, or expand a workflow. Human approval is required.
5. The dashboard stays loopback-only unless a separately designed,
   authenticated, encrypted multi-user deployment exists.
6. Missing replay targets and unmet conditions block execution. Never fall back
   to blind coordinate clicking.

## Change protocol

- Preserve portable JSON compatibility or include a documented migration.
- Prefer accessibility and semantic selectors over coordinates.
- Add or update a test for changes to redaction, replay blocking, analysis,
  persistence, or request validation.
- Run `npm test`, `npm run demo`, syntax checks for changed JavaScript, and
  `git diff --check` before committing.
- Update the README and AI guide when product boundaries, install steps, API,
  or safety guarantees change.
- Reproduce bugs with minimal redacted workflows first. Prioritize disclosure
  and unintended-action regressions over convenience work.

## Intentional limits

The extension records redacted browser evidence; it does not execute workflows.
The core defines an adapter contract but ships no native macOS/Windows hook,
desktop injector, or live LLM provider. These are permissioned integrations,
not evidence that this prototype is a production unattended RPA agent.
