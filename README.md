# Automation Recorder

A privacy-conscious, cross-platform foundation for recording desktop workflows,
replaying them safely, and learning where workflows share a reusable path or
need a condition.

For installation, AI integration, privacy boundaries, bug-fix expectations, and
the intentionally unbuilt pieces, read the [AI integration guide](docs/AI_GUIDE.md).
Coding agents should begin with [AGENTS.md](AGENTS.md).

## Install

Requirements: a current Node.js runtime. This project has no package
dependencies.

```sh
git clone <your-private-repository-url>
cd automation-recorder
npm test
npm run dashboard
```

Open `http://127.0.0.1:4311` for the local dashboard. To record browser
evidence, load the `extension/` directory as an unpacked extension in Chrome or
Edge; the detailed steps are in [`extension/README.md`](extension/README.md).

## What works now

- A portable JSON workflow format for click, text, shortcut, wait, and other
  normalized actions.
- A capture-source contract so macOS, Windows, Linux, browser, Codex, Cursor,
  or cloud-host adapters can feed the same recorder.
- Replay with a required target check before every action. A missing target
  blocks the workflow instead of blindly clicking.
- Analysis over multiple recordings to find repeated action blocks and propose
  high-confidence context conditions.
- A Chrome/Edge Manifest V3 companion in [`extension/`](extension/) that records
  browser DOM interactions, semantic locators, element bounds, screenshots,
  copy/paste metadata, and authentication markers.
- An editable Markdown audit document and a redacted LLM-review request for
  suggesting—not executing—conditions, waits, and fallback locators.

Run the tests and a small analysis/replay example:

```sh
npm test
npm run demo
npm run dashboard
```

`npm run dashboard` starts a local-only control plane at
`http://127.0.0.1:4311`. It manages editable workflows, queues and monitors
runs, provides deterministic analysis, and opens audit documents. Its state is
stored locally in `.automation-recorder/state.json`; no cloud service is
started.

## Browser audit trail

Load [`extension/`](extension/) as an unpacked Chrome/Edge extension. It has an
explicit start/stop control and keeps data local until you export it. Every
click-like action can receive a screenshot reference after explicit opt-in; the
action ledger also stores a sanitized page path, semantic DOM target, replay
locators, and bounds.

Authentication is documented as a method (password form, OAuth provider,
passkey, or unknown) without retaining credentials, session cookies, OAuth
assertions, or tokens. Clipboard events record the operation only; the text is
never placed in extension messages or local storage. Screenshots are opt-in and
are suppressed around sensitive fields or pages containing password controls.

The audit document becomes the editable RPA-style specification: adjust the
locator order, insert preconditions/waits, attach conditions, mark human
approvals, then send the redacted workflow to an LLM reviewer for proposed edge
cases. Suggestions must be reviewed and accepted before replay.

## Platform architecture

```text
macOS Input Monitoring / Windows hook / browser driver
                 │ normalized actions
                 ▼
         captureRecording() ──► JSON recordings ──► analyzeRecordings()
                 │                                      │
                 └──────────────► reusable workflow ◄───┘
                                             │
                                 replayWorkflow() + host adapter
                                             │
                 native desktop input / Playwright / Codex or Cursor tool
```

The core deliberately does not contain native keylogging or input injection.
Each installed host owns that small, permissioned provider. On macOS the
provider needs Accessibility and Input Monitoring permissions; on Windows it
needs a signed native hook/input provider. A cloud-only agent cannot observe a
local desktop without a local companion app, but it can analyze exported
recordings and author/edit the portable workflow JSON.

## Next build slices

1. Electron/Tauri companion with explicit start/stop recording and redaction.
2. Native macOS and Windows providers that turn OS events into semantic targets
   using accessibility APIs before falling back to coordinates.
3. A visual workflow editor for approving suggested repeated blocks and
   conditions.
4. Host adapters for browser automation, Codex/Cursor MCP tools, and a local
   desktop runner.

Never record passwords, private-message contents, or unrestricted keystrokes;
the production capture provider should use allowlists, redact text fields, and
require a visible recording indicator.

Capture is cancellable and defaults to a 10,000-step safety limit; native
providers should stop their source immediately when recording stops.
