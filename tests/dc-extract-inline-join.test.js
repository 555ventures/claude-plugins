'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir, runNode } = require('./helpers')

// PRAX-20260801-01: dc-extract's copy harvest walks each leaf block's text nodes independently,
// so a block whose text is split by inline formatting (<b>, <i>, <span>, etc — not a separate
// paragraph, just emphasis inside one sentence) is extracted as several disjoint copy entries
// instead of the one sentence a reader actually sees. Downstream, the fidelity gate then requires
// the implementation to reproduce three fragment strings verbatim instead of the one real
// sentence, which is both unverifiable against real components (nobody renders "— it does not
// transfer" as an isolated string) and loses the actual copy contract. Fix contract: a leaf
// block's inline-formatted text joins into ONE copy entry.

const SCRIPT = 'scripts/dc-extract.js'

function extract(html) {
  const dir = tmpdir('dcxij')
  const src = path.join(dir, 'in.dc.html')
  const out = path.join(dir, 'out')
  fs.writeFileSync(src, html)
  const res = runNode(SCRIPT, [src, out])
  let manifest = null
  const mPath = path.join(out, 'extract.json')
  if (fs.existsSync(mPath)) manifest = JSON.parse(fs.readFileSync(mPath, 'utf8'))
  return { res, manifest }
}

const BASE = (body) =>
  `<html><head><style>:root { --color-bg: #fff; }</style></head><body>${body}</body></html>`

test('a leaf block\'s text split by inline formatting extracts as one joined copy entry, not fragments', () => {
  const { res, manifest } = extract(BASE(
    '<x-dc id="s"><p>luck <b>within the data it ran on</b> — it does not transfer</p></x-dc>'))
  assert.strictEqual(res.status, 0, res.stderr)
  const copy = manifest.surfaces[0].entries.filter(e => e.kind === 'copy').map(e => e.value)
  assert.deepStrictEqual(copy, ['luck within the data it ran on — it does not transfer'],
    'inline-formatted text within one block must join into the single sentence a reader sees, ' +
    'not scatter into disjoint fragments per text node ("luck" / "within the data it ran on" / ' +
    '"— it does not transfer") that no real component renders as separate strings')
})
