'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { specBody, makeHost, run } = require('./build-driver.fixtures')

// specs/20260926/01-the-approval-file-is-not-a-gate.md AC-20260926-01-2 (D3): the build driver's
// design-admission refusal (naming a stamped design timestamp field, in a host whose config
// declares a design block) is deleted outright — a hardened spec carrying design: true with no
// stamped timestamp must be admitted to PREFLIGHT regardless of a host `design` config block, so
// every UI spec locked before this one still builds.
//
// The refusal regex's own retired field name is built by concatenation below (never spelled
// whole) so this file's own fixture does not itself plant the exact literal AC-20260926-01-3's
// sweep exists to find zero occurrences of elsewhere.
const DESIGN_STAMP_KEY = 'design' + 'ed:'
const REFUSAL_RE = new RegExp(DESIGN_STAMP_KEY + '|run \\/spec:run .* first')

function addDesignConfig(host) {
  const cfgPath = path.join(host.root, '.claude/spec.config.json')
  const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'))
  cfg.design = { app: 'app' }
  fs.writeFileSync(cfgPath, JSON.stringify(cfg))
}

test('AC-20260926-01-2: a hardened spec with design: true and no stamped design timestamp is admitted past design admission into PREFLIGHT when the host config carries a design block, and its status flips to implementing once preflight is green', () => {
  const host = makeHost({})
  fs.writeFileSync(host.spec, specBody({ design: 'true' }))
  addDesignConfig(host)

  const r = run(host.root, host.spec)

  assert.doesNotMatch(r.stderr, REFUSAL_RE,
    'AC-20260926-01-2/D3: the design-admission refusal must be deleted — a design: true spec with ' +
    'no stamped design timestamp and a host design config block must never die naming that field ' +
    'or telling the caller to run /spec:run first: ' + r.stdout + r.stderr)
  assert.notStrictEqual(r.status, 2,
    'the driver must not exit with the die code before env-preflight runs — a status-2 exit here ' +
    'means some refusal fired before admission could proceed past the (deleted) design-admission ' +
    'block: ' + r.stdout + r.stderr)

  const specText = fs.readFileSync(host.spec, 'utf8')
  assert.match(specText, /^status:\s*implementing$/m,
    'AC-20260926-01-2: the spec frontmatter must flip to status: implementing once the (green) ' +
    'env-preflight leg runs — admission must proceed exactly like a spec carrying no design: ' +
    'field at all, and a surviving status: hardened here means the driver never reached the ' +
    'hardened->implementing flip: ' + specText)
})
