'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir, runNode } = require('./helpers')

// Incident 2026-09-05 (salon-os spec 20260905/07 D15/D16, fixed 2026-09-08 under core § Incident
// Policy): /spec:design's Step 6 rewrote the UI section and never revisited the ACs, so an AC
// whose subject was a component design had just landed reached red-check with no honest way to be
// red. design-ac-reconcile.js is the deterministic half of the new Step 6 duty.

const SCRIPT = 'scripts/design-ac-reconcile.js'
function host(name, { acs, decisions = '| D1 | nothing | why |', components }) {
  const dir = tmpdir('dar-' + name)
  const spec = path.join(dir, 'spec.md')
  fs.writeFileSync(spec, `---\nstatus: hardened\ndesign: true\n---\n# S\n\n## Decisions\n\n| ID | Decision | Rationale |\n|---|---|---|\n${decisions}\n\n## Acceptance Criteria\n\n${acs.join('\n')}\n\n## File Plan\n\n| File | Action | Layer |\n|---|---|---|\n| tests/a.test.js | CREATE | tests |\n`)
  const comp = path.join(dir, 'components.json')
  fs.writeFileSync(comp, JSON.stringify(components))
  return { dir, spec, comp }
}
const run = (h, ...extra) => runNode(SCRIPT, ['--spec', h.spec, '--components', h.comp, ...extra])
const LANDED = [{ name: 'BookingSheet', purpose: 'p', props: ['open'], mockRefs: ['m1'] }]

test('design-ac-reconcile: WHEN an AC names a landed component and is neither tagged [pre-green: design-landed] nor cited in ## Decisions THE SYSTEM SHALL exit 1 naming the AC and the component', () => {
  const h = host('untagged', { acs: ['- **AC-20260905-07-3**: WHEN the case row is clicked THE SYSTEM SHALL open `BookingSheet` with the request loaded.'], components: LANDED })
  const r = run(h)
  assert.strictEqual(r.status, 1, r.stdout + r.stderr)
  assert.match(r.stdout, /unreconciled-design-ac\s+AC-20260905-07-3 names landed component\(s\) BookingSheet/)
  const j = JSON.parse(run(h, '--json').stdout)
  assert.strictEqual(j.findings.length, 1)
  assert.deepStrictEqual(j.findings[0].components, ['BookingSheet'])
})

test('design-ac-reconcile: WHEN the AC carries [pre-green: design-landed] THE SYSTEM SHALL exit 0 and report it reconciled by pre-green', () => {
  const h = host('tagged', { acs: ['- **AC-20260905-07-3**: WHEN clicked THE SYSTEM SHALL open BookingSheet. [pre-green: design-landed]'], components: LANDED })
  const j = JSON.parse(run(h, '--json').stdout)
  assert.strictEqual(run(h).status, 0)
  assert.deepStrictEqual(j.reconciled.map((x) => x.by), ['pre-green'])
})

test('design-ac-reconcile: WHEN a Decisions row cites the AC id (the split-by-mount ruling) THE SYSTEM SHALL exit 0 and report it reconciled by decision — a different pre-green reason does not reconcile on its own', () => {
  const cited = host('decision', {
    acs: ['- **AC-20260905-07-3**: WHEN clicked THE SYSTEM SHALL open BookingSheet and the route updates.'],
    decisions: '| D9 | AC-20260905-07-3 red lives in tests/route.test.js (router mount); tests/sheet.test.js is design-landed | why |',
    components: LANDED,
  })
  assert.strictEqual(run(cited).status, 0, run(cited).stdout)
  assert.deepStrictEqual(JSON.parse(run(cited, '--json').stdout).reconciled.map((x) => x.by), ['decision'])
  const wrongTag = host('wrongtag', { acs: ['- **AC-20260905-07-3**: WHEN clicked THE SYSTEM SHALL open BookingSheet. [pre-green: predicate-in-test]'], components: LANDED })
  assert.strictEqual(run(wrongTag).status, 1, 'another pre-green reason is not the design-landed sanction')
})

test('design-ac-reconcile: bare vocabulary commitments (no props/mockRefs) are not landed, name matching is word-bounded, and --component narrows the set', () => {
  const commitment = host('commitment', { acs: ['- **AC-20260905-07-3**: opens BookingSheet.'], components: [{ name: 'BookingSheet', purpose: 'p' }] })
  assert.strictEqual(run(commitment).status, 0, 'a commitment entry has not been built — nothing is pre-green yet')
  const substring = host('substr', { acs: ['- **AC-20260905-07-3**: opens BookingSheetHeader.'], components: LANDED })
  assert.strictEqual(run(substring).status, 0, 'BookingSheet inside BookingSheetHeader is not a mention')
  const two = host('narrow', {
    acs: ['- **AC-20260905-07-3**: opens BookingSheet.', '- **AC-20260905-07-4**: shows CaseBadge.'],
    components: [...LANDED, { name: 'CaseBadge', purpose: 'p', props: [] }],
  })
  assert.strictEqual(JSON.parse(run(two, '--json').stdout).findings.length, 2)
  assert.deepStrictEqual(JSON.parse(run(two, '--json', '--component', 'CaseBadge').stdout).findings.map((f) => f.id), ['AC-20260905-07-4'])
})

test('design-ac-reconcile: usage errors exit 2 — missing flags, unreadable components, a spec with no Acceptance Criteria section', () => {
  assert.strictEqual(runNode(SCRIPT, ['--spec', 'x.md']).status, 2)
  const h = host('usage', { acs: ['- **AC-20260905-07-3**: opens BookingSheet.'], components: LANDED })
  assert.strictEqual(runNode(SCRIPT, ['--spec', h.spec, '--components', h.comp + '.missing']).status, 2)
  fs.writeFileSync(h.spec, '# S\n\n## Decisions\n\nnone\n')
  assert.strictEqual(run(h).status, 2)
})
