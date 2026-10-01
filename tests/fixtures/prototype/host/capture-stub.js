#!/usr/bin/env node
'use strict'
// Synthetic PROTO_CAPTURE_BIN target (spec 20260928/02 D1's test seam, per the spec's own Note:
// "PROTO_CAPTURE_BIN is a test seam read by the driver only when set"). freeze.js is expected to
// spawn this in place of spec/scripts/proto-capture.js, passing it the identical argv
// (--host/--url/--out/--composites/...), when the env var is set — freeze.test.js's AC-20260928-
// 02-6 cases. Writes a canned capture keyed by --url; exits 2 for the one --url named by
// PROTO_CAPTURE_FAIL_URL, forwarding a fixed stderr message, so a test can prove the driver
// forwards a mid-capture failure verbatim and writes no contract.json. Records the size it was
// asked for via --viewport WxH (default 1280x800) so a test can read what the driver requested;
// PROTO_CAPTURE_IGNORE_VIEWPORT=1 records 1280x800 whatever was asked (a tool that drops the
// flag), PROTO_CAPTURE_OMIT_VIEWPORT=1 writes no viewport key at all (a tool that records none).
const fs = require('fs')
const argv = process.argv.slice(2)
function flag(name) { const i = argv.indexOf(name); return i > -1 ? argv[i + 1] : null }
const url = flag('--url')
const out = flag('--out')
const composites = (flag('--composites') || '').split(',').filter(Boolean)

if (process.env.PROTO_CAPTURE_FAIL_URL && url === process.env.PROTO_CAPTURE_FAIL_URL) {
  process.stderr.write('capture-stub: forced failure for ' + url + '\n')
  process.exit(2)
}

const asked = /^(\d+)x(\d+)$/.exec(flag('--viewport') || '')
const viewport = asked && !process.env.PROTO_CAPTURE_IGNORE_VIEWPORT
  ? { width: Number(asked[1]), height: Number(asked[2]) }
  : { width: 1280, height: 800 }
const slug = (url || 'x').replace(/[^a-zA-Z0-9]/g, '_')
const doc = {
  schemaVersion: 1,
  url,
  viewport,
  composites,
  entries: [{ id: slug + '#0', tag: 'div', box: [0, 0, 1, 1], text: slug, styles: {} }],
}
if (process.env.PROTO_CAPTURE_OMIT_VIEWPORT) delete doc.viewport
fs.writeFileSync(out, JSON.stringify(doc, null, 2) + '\n')
process.exit(0)
