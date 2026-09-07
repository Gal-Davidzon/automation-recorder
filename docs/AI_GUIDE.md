# AI Integration, Installation, and Maintenance Guide

Automation Recorder is a local-first foundation for observing approved desktop
or browser workflows, converting them to portable JSON, and improving them with
deterministic analysis and human-reviewed LLM suggestions. It is written to be
usable by people and coding agents such as Codex, Claude, Cursor, and local
agents.

## Product goal

The goal is smarter RPA without surveillance or uncontrolled clicking:

1. A user explicitly starts and stops recording.
2. A host adapter collects minimal, redacted actions and context.
3. The result becomes an editable workflow plus audit document.
4. Multiple recordings reveal repeated blocks and likely conditions.
5. An LLM can propose fallback locators, waits, and edge-case branches from a
   sanitized review packet.
6. A human accepts changes, then a replay adapter checks every step before
   acting.

This is a working prototype of the workflow core, browser evidence collector,
and local dashboard. It is **not** an unattended production RPA product, a
keylogger, a credential manager, or a replacement for an authenticated desktop
agent.

## Install and run

### Core and dashboard

Requirements: a current Node.js runtime with ES module and `node --test`
support. No package installation is needed.

```sh
git clone <your-private-repository-url>
cd automation-recorder
npm test
npm run demo
npm run dashboard
```

Open `http://127.0.0.1:4311`. The server only permits loopback binding and
persists local state in `.automation-recorder/state.json`.

### Browser companion

1. Open the Chrome or Edge extensions page.
2. Enable Developer mode.
3. Choose **Load unpacked**, selecting the `extension/` directory.
4. Pin the extension and press **Start recording** on an approved page.
5. Use **Stop and export** for a redacted recording.

Read [`../extension/README.md`](../extension/README.md) for its exact scope.
The extension collects evidence only; it does not replay clicks or authenticate
to services.

## Privacy and security model

The browser companion records selected DOM interactions, semantic locators,
element bounds, and a sanitized page path. Screenshot references require
explicit opt-in. It must never store raw clipboard text, passwords, form
secrets, cookies, tokens, OAuth assertions, URL queries/fragments, or an
unrestricted keyboard stream. Authentication is described only by method (such
as `passkey` or `OAuth provider`); credentials and session material never go in
a workflow.

## Data flow and extension points

```text
capture adapter (browser / macOS / Windows / host tool)
    -> normalized recording JSON
    -> createWorkflow() / captureRecording()
    -> audit document + dashboard
    -> analyzeRecordings() for repeated blocks and conditions
    -> sanitized buildLLMReviewRequest() (optional)
    -> human approval of edited workflow
    -> replayWorkflow() through a permissioned adapter
```

### Key interfaces

- `captureRecording(source, events)` accepts normalized adapter events.
- `createWorkflow(definition)` validates the portable workflow model.
- `analyzeRecordings(recordings)` finds repeated action sequences and context
  differences that may imply conditions.
- `replayWorkflow(workflow, adapter)` requires target verification before every
  action; failure blocks execution.
- `buildAuditDocument(recording)` yields human-editable Markdown evidence.
- `buildLLMReviewRequest(recording)` creates an advisory-only redacted packet.
  Call providers outside this project and require human approval before applying
  a proposed edit.

The loopback dashboard APIs are:

| Endpoint | Purpose |
| --- | --- |
| `GET /api/state` | Read local workflows and run history. |
| `POST /api/workflows` | Create a validated workflow. |
| `PATCH /api/workflows/:id` | Edit a validated workflow. |
| `DELETE /api/workflows/:id` | Remove a local workflow. |
| `POST /api/runs` | Queue a local run record. |
| `POST /api/analysis` | Analyze recordings deterministically. |
| `GET /api/audit/:id` | Retrieve a generated audit document. |

## Building adapters

Adapters must be narrow, explicit, and permissioned. Browser adapters should
prefer semantic DOM or accessibility locators. macOS adapters require user-
granted Accessibility/Input Monitoring and a visible stop control; Windows
adapters should be signed and narrowly scoped. Codex, Claude, Cursor, and cloud
agents can consume exported redacted JSON or invoke a local authenticated
adapter, but a cloud-only agent cannot safely observe or control a desktop.

A replay adapter must separate target inspection from action execution and fail
closed on a missing target, changed page identity, unsafe condition, expired
approval, or authentication request. Never add a blind coordinate fallback
after inspection fails.

## LLM rules

Use a model for interpretation, not unsupervised authority. It may propose
reusable blocks, waits, semantic locators, or modal branches. It may not read
unapproved sensitive evidence, handle credentials, ignore failed target checks,
or execute its own proposal. Preserve the `buildLLMReviewRequest()` redaction
boundary, show what leaves the device, version every proposal, and audit human
acceptance or rejection.

## Bug-fix protocol

1. Reproduce using minimal redacted data.
2. Classify disclosure, unauthorized-capture, unintended-replay, and corruption
   risks as highest priority.
3. Add a regression test when practical.
4. Fix the narrowest owning layer.
5. Run `npm test`, `npm run demo`, JavaScript syntax checks, and `git diff
   --check`.
6. Update this guide and `AGENTS.md` when guarantees change.

If a report contains a secret, redact it locally and rewrite the reproduction
using synthetic data before sharing it with an AI or issue tracker.

## Intentional boundaries and planned work

- The extension records redacted evidence but does not replay workflows.
- No native macOS/Windows collector or desktop replay provider ships yet.
- The LLM request builder is provider-neutral; no live model integration exists.
- The dashboard is local, not a multi-user hosted service.
- Analysis returns candidates; humans decide whether they represent real
reusable blocks or conditions.

Keep these boundaries explicit in code, documentation, and future integrations.
