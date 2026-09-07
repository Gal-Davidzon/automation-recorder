# Browser audit recorder extension

Load `extension/` as an unpacked Chrome/Edge extension, press **Start recording**,
perform a workflow, then export the local JSON record.

It records semantic DOM interactions, locators, sanitized page paths, element
bounds, and (when explicitly enabled) screenshots for click-like actions. It marks likely authentication actions
without retaining passwords, tokens, cookies, or OAuth assertions. Clipboard
text is deliberately redacted; the export preserves the operation only.

The extension is an evidence collector, not a replay engine. Feed its exported
events through `toBrowserAuditStep()` and `buildAuditDocument()` to make an
editable workflow specification, then approve its automation rules before a
host adapter is permitted to replay it.
