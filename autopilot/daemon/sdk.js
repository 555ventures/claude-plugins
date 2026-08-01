#!/usr/bin/env node
'use strict'
// sdk.js — the ONLY file in this repo allowed to `require("@anthropic-ai/claude-agent-sdk")`
// (D2, D10). Quarantining the import here means `session.js` (and every other daemon module)
// can be required and unit-tested with an injected `queryImpl` — `npm test` never needs
// `autopilot/node_modules` present (AC-20260801-02-8) — while the daemon's real entry point
// still gets the live SDK by requiring this module lazily.
//
// Deliberately does NOT: reshape or validate the SDK's `query` export, retry, or add any
// options defaulting — all Options/canUseTool/outcome-classification logic lives in
// session.js, which treats this module as the sole seam to swap for a fake in tests.
//
// Exit codes: n/a — library module, not a CLI entry point.

const { query } = require('@anthropic-ai/claude-agent-sdk')

module.exports = { query }
