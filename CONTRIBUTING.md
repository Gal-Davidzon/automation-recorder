# Contributing

Automation Recorder handles workflow evidence, so correctness and privacy are
product requirements.

## Local setup

Use a recent Node.js version with ES module and built-in test-runner support.
There are no runtime package dependencies.

```sh
git clone <your-private-repository-url>
cd automation-recorder
npm test
npm run demo
npm run dashboard
```

For the browser companion, follow [`extension/README.md`](extension/README.md)
to load it as an unpacked Chrome or Edge extension.

## Before committing

1. Read [`AGENTS.md`](AGENTS.md) and [`docs/AI_GUIDE.md`](docs/AI_GUIDE.md).
2. Keep unrelated working-tree changes intact.
3. Add a focused regression test for a behavior change or bug fix.
4. Run:

   ```sh
   npm test
   npm run demo
   node --check src/index.js src/browser.js src/dashboard-server.js
   git diff --check
   ```

5. Describe the user-visible result, safety implications, and validation.

## Privacy review checklist

- No credential, session, token, raw clipboard, or free-form sensitive text is
  added to a recording, log, test fixture, screenshot, or LLM request.
- URLs exclude query strings and fragments.
- Screenshots stay opt-in and avoid password or sensitive controls.
- Replay stops safely when an expected target or precondition is absent.
- LLM output remains a reviewable proposal until human acceptance.

## Bug reports

Provide a redacted minimal workflow or sequence, expected and actual behavior,
OS/browser/Node version, and whether the issue risks unintended actions or data
exposure. Never include credentials, tokens, full clipboard data, or unredacted
customer pages.
