'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { read, tmpdir, runNode } = require('../helpers')
const {
  SCRIPT, mark, writeFile, decideLook,
  advanceToJourneyWalked,
} = require('./mocks-driver-fixtures')

// Owner: specs/20260912/08-the-register-is-the-whole-shadcn-set.md
// AC-20260912-08-1, AC-20260912-08-2, AC-20260912-08-3, AC-20260912-08-7, AC-20260912-08-8.


test('AC-20260912-08-8: design-atlas.js check continues to report no off-token colour violation for a labelled mock whose linked tokens.css values are oklch() — the colour-literal sweep reads the mock\'s own markup, never the linked register', () => {
  const dir = tmpdir('atlas-oklch-')
  fs.mkdirSync(path.join(dir, 'design/mocks'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'design/mocks/tokens.css'),
    ':root{--background:oklch(1 0 0);--foreground:oklch(0.145 0 0);--primary:oklch(0.205 0 0);' +
    '--primary-foreground:oklch(0.985 0 0);--muted:oklch(0.97 0 0);--muted-foreground:oklch(0.556 0 0)}\n')
  fs.writeFileSync(path.join(dir, 'design/mocks/a.html'),
    '<link rel="stylesheet" href="tokens.css">\n' +
    '<main data-screen-label="a" data-status="sketch">hello</main>\n')
  const r = runNode('scripts/design-atlas.js', ['check', path.join(dir, 'design/mocks')])
  assert.ok(!/off-token color literal/.test(r.stdout),
    'the colour-literal sweep reads the mock\'s own markup and inline styles, never the linked register — a tokens.css whose values are oklch() must never itself trip an off-token violation: ' + r.stdout)
})
