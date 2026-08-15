'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { read, ROOT, SPEC, tmpdir, runNode } = require('./helpers')

// CROSS-20260813-03 (hearwell ×2 + upwell): qualifiers that exist at run time die before the
// durable, machine-readable artifact records them. Three shapes:
// (a) review.md's ledger row writes `testsSkipped:<n>` identically whether every skip was
//     [env:]-declared-sanctioned or wholly unsanctioned — hearwell: testsSkipped:5 looked the
//     same for five [env: DATABASE_URL]-gated ACs and five that never ran for no declared
//     reason; every downstream consumer (doctor, escape correlation) has to re-open the specs
//     and count [env: tags by hand to tell the two apart.
// (b) hearwell's first release recorded verdict CLEAN with ci:"unavailable" — a structurally
//     absent required verdict leg — and nothing forces a later reader of the milestone word or
//     ledger row to weigh that pair; the transient ⚠️ console line is the only place the
//     qualifier ever lived.
// (c) upwell spec 20260811/01: the AC coverage machinery has no way for a spec to DECLARE a
//     non-test oracle (a typecheck/compiler pass, or a named gate command) — so an AC whose
//     correctness oracle legitimately isn't a test reports as uncovered even though its oracle
//     ran, identically to an AC nobody checked at all.

const review = read('spec/commands/review.md')
const release = read('spec/commands/release.md')
const verdictJs = read('spec/scripts/verdict.js')
const specTemplate = read('spec/templates/spec.md')

test('AC-20260813-02-3 (CROSS-20260813-03a): the ledger row schema distinguishes sanctioned [env:]-gated skips from unsanctioned ones in testsSkipped', () => {
  // Bound the check to the `testsSkipped` field's own value in the ledger row shape (one JSON
  // line) — a whole-doc regex would match "sanctioned" from the unrelated `verify.sanctioned`
  // field later on the SAME line and pass vacuously without a real split ever existing.
  const m = /"testsSkipped":(\{[^}]*\}|[^,}]+)/.exec(review)
  const testsSkippedValue = m ? m[1] : ''
  assert.notStrictEqual(testsSkippedValue, '',
    'could not locate the `"testsSkipped":` field in review.md\'s ledger row shape at all — ' +
    'update the extraction regex if the ledger row was restructured')
  assert.match(testsSkippedValue, /sanctioned|unsanctioned|env-gated|declared/i,
    'review.md\'s ledger row schema writes a single `testsSkipped:<n>` count (' +
    JSON.stringify(testsSkippedValue) + ') with no split between declaration-gated ' +
    '([env: VAR]) skips and unsanctioned ones — hearwell: testsSkipped:5 was written ' +
    'identically for five properly [env:]-tagged ACs and five that skipped with no declared ' +
    'reason, so every downstream consumer must re-open the spec and count [env: tags by hand ' +
    'to tell a sanctioned skip run from an unsanctioned one')
})

test('AC-20260813-02-4 (CROSS-20260813-03b): a structurally-absent required release leg is made durable in the milestone word or a mandatory row-level qualifier', () => {
  const hasQualifierWord = /CLEAN[- ]with[- ]qualifier/i.test(release) || /CLEAN[- ]with[- ]qualifier/i.test(verdictJs)
  assert.ok(hasQualifierWord,
    'neither release.md nor verdict.js has a distinct verdict word or mandatory row-level ' +
    'qualifier (e.g. a "CLEAN-with-qualifier" milestone word) for a structurally-absent ' +
    'required leg — hearwell\'s first release recorded verdict CLEAN with ci:"unavailable" ' +
    '(a required leg that never resolved), and nothing beyond the transient ⚠️ console line ' +
    'forces a later reader of the milestone word or the durable ledger row to weigh that pair')
})

test('AC-20260813-02-6 (CROSS-20260813-03c): the AC coverage machinery supports a DECLARED non-test oracle naming a manifest leg, sibling to [env:]', () => {
  const declaresOracleSyntax = /\[oracle:/i.test(specTemplate) || /\[oracle:/i.test(review)
  assert.ok(declaresOracleSyntax,
    'neither the spec template nor review.md has an `[oracle: <manifest leg>]` declaration ' +
    'syntax sibling to the existing `[env: VAR]` AC tag — an AC whose correctness oracle is ' +
    'legitimately a manifest leg (never a test) has no way to declare that, so review\'s ' +
    'mechanical grep matrix reports it uncovered identically to an AC nobody checked at all ' +
    '(upwell spec 20260811/01)')
})

test('AC-20260813-02-6: a declared [oracle:] leg that is red or absent in the manifest is a hard finding, identical standing to an uncovered AC', () => {
  assert.match(review, /\[oracle:[^\]]*\][\s\S]{0,600}(hard|uncovered)|uncovered[\s\S]{0,600}\[oracle:/i,
    'review.md must state that an `[oracle:]`-tagged AC whose declared oracle leg is red or ' +
    'absent in the manifest is a HARD finding — the same standing as an uncovered AC — ' +
    'otherwise `[oracle: anything]` becomes a coverage-laundering route with no consequence ' +
    'when the named leg never actually ran or failed')
})

test('AC-20260813-02-6: the Drift gate section carries the [oracle:] carve-out in BOTH the driftScript and no-driftScript branches', () => {
  const driftGateSection = /## Drift gate([\s\S]*?)\n## /.exec(review)
  assert.notStrictEqual(driftGateSection, null,
    'could not locate the "## Drift gate" section in review.md at all — update the extraction ' +
    'regex if the section was renamed or the doc restructured')
  const sectionText = driftGateSection[1]
  const driftScriptBranch = /driftScript.*declared[\s\S]*?(?=- \*\*No `driftScript`|$)/i.exec(sectionText)
  const noDriftScriptBranch = /No `driftScript`[\s\S]*$/i.exec(sectionText)
  assert.notStrictEqual(driftScriptBranch, null,
    'could not locate the "driftScript declared" branch inside the Drift gate section — update ' +
    'the extraction regex if that branch was reworded')
  assert.notStrictEqual(noDriftScriptBranch, null,
    'could not locate the "No driftScript" branch inside the Drift gate section — update the ' +
    'extraction regex if that branch was reworded')
  assert.match(driftScriptBranch[0], /\[oracle:/i,
    'the Drift gate section\'s driftScript-declared branch must carry the same `[oracle:]` ' +
    'carve-out as step 5\'s grep matrix — otherwise a host with a driftScript restates the ' +
    'uncovered-AC rule with no oracle exemption and directly contradicts step 5 for that host ' +
    '(refuter finding: the Drift gate section currently restates the rule for both modes with ' +
    'no carve-out at all)')
  assert.match(noDriftScriptBranch[0], /\[oracle:/i,
    'the Drift gate section\'s no-driftScript branch must carry the same `[oracle:]` carve-out ' +
    'as step 5\'s grep matrix — otherwise an `[oracle:]`-tagged AC is exempted by step 5 but ' +
    'this section\'s "zero test hits is an automatic hard finding" restatement contradicts it ' +
    'for the exact same AC')
})

// specs/20260814/01-ac-matrix-script.md D6 (retag): the [oracle:] consequence semantics stay
// stated in review.md's step-5 residue and both Drift gate branches (D5), but the algorithm
// that ENFORCES them moved to spec/scripts/ac-matrix.js — D5's enforcedBy markers must now
// point there, and the semantics must actually be enforced by the script, not just asserted
// in prose. Two pins: the doctrine citation, and a live exec check against the script.

test('AC-20260814-01-10: review.md\'s [oracle:] consequence sentences carry an enforcedBy marker pointing at spec/scripts/ac-matrix.js', () => {
  assert.match(review, /enforcedBy:\s*spec\/scripts\/ac-matrix\.js/,
    'specs/20260814/01-ac-matrix-script.md D5 requires the retained [oracle:]/[env:] consequence ' +
    'sentences in review.md to carry an `enforcedBy: spec/scripts/ac-matrix.js` marker once the ' +
    'algorithm moves out of doctrine and into the script — without it, nothing durably links the ' +
    'consequence prose to the code that actually enforces it')
})

test('AC-20260814-01-10: ac-matrix.js actually enforces the oracle-red-or-absent hard-finding semantics review.md documents', () => {
  const dir = tmpdir('vqd10')
  fs.mkdirSync(path.join(dir, 'tests'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'tests/oracle.test.js'), '// unrelated content\n')
  const spec = path.join(dir, 'spec.md')
  fs.writeFileSync(spec, '# Test Spec\n\n## Acceptance Criteria\n\n' +
    '- **AC-20260814-10-1**: WHEN X THE SYSTEM SHALL Y [oracle: gate] → tests/oracle.test.js\n\n' +
    '## File Plan\n\n| Path | Action | Layer | Summary |\n|------|--------|-------|---------|\n' +
    '| tests/oracle.test.js | CREATE | tests | covers AC |\n')
  const manifest = path.join(dir, 'manifest.jsonl')
  fs.writeFileSync(manifest, '')
  const res = runNode('scripts/ac-matrix.js',
    ['--spec', spec, '--root', dir, '--manifest', manifest, '--json'])
  assert.strictEqual(res.status, 1,
    `ac-matrix.js must exist and enforce review.md's documented rule (a declared oracle leg ` +
    `absent from the manifest is a hard finding, identical standing to an uncovered AC) — got status ${res.status}, stderr: ${res.stderr}`)
  let out
  try { out = JSON.parse(res.stdout) } catch (e) {
    assert.fail(`--json output did not parse: ${e.message} (stderr: ${res.stderr})`)
  }
  assert.ok(out.findings.some(f => f.class === 'oracle-red-or-absent'),
    'the AC declares [oracle: gate] but the manifest has no gate row at all — the script must ' +
    'emit oracle-red-or-absent, the same consequence review.md\'s doctrine states in prose')
})
