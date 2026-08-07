'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { ROOT, SPEC, read } = require('../helpers')

// spec/INTAKE.md and spec/commands/doctor.md live under spec/, not repo root — helpers.read()
// is ROOT-relative, so this file needs its own SPEC-relative reader (same pattern as
// tests/feedback-loop.test.js).
const readSpec = (p) => fs.readFileSync(path.join(SPEC, p), 'utf8')

// spec/20260805/04-intake-class-discipline.md (2026-08-05): recurring incident classes were
// getting prose patches before mechanisms (5 patches in 3 days on the dashboard seam; 3
// versions in 3 days on deltas/fidelity-check). D1 adds a `Fix` column to spec/INTAKE.md's
// accepted-findings table; D2 says a row whose Category repeats an earlier accepted-table row
// may only close as `prose(<reason>)` (>= 20 chars) unless it lands `mechanism(<path>)` — the
// Rejected-findings bullet list contributes NO Category history (verified INTAKE.md:63-109,
// it has no structured Category cell to read). D3 names this file as the enforcement carrier,
// asserting (a)-(g); this is the only place that logic lives — there is no separate script.
// AC-20260805-04-4 pins the live table itself and is EXPECTED RED until the implementation
// batch lands the Fix column (D1) and repairs the duplicate ID PRAX-20260721-01 (D6) — that is
// sanctioned TDD red, not a regression.

const FIXDIR = path.join(ROOT, 'tests/fixtures/intake-discipline')
const fixture = (name) => fs.readFileSync(path.join(FIXDIR, name), 'utf8')

// The closed Category vocabulary (D3g / spec Behavior) — verified complete on the live table
// 2026-08-05. Growing this list is a deliberate, diff-visible test edit; that is the point.
const CATEGORIES = [
  'missing-substrate',
  'reporting-integrity',
  'doctrine-rot',
  'workflow-defect',
  'template-bug',
  'checklist-gap',
]

// Parses ONLY the accepted-findings pipe table (D2, Behavior): starts at the `| ID | ...`
// header row and reads rows until the first non-`|` line, which is the blank line ahead of
// `## Rejected findings` on every fixture and on the live file — the Rejected section (a
// bullet list with no Category cell) is never reached.
function parseAcceptedTable(content) {
  const lines = content.split('\n')
  const headerIdx = lines.findIndex((l) => /^\|\s*ID\s*\|/.test(l))
  if (headerIdx === -1) return { header: [], rows: [] }
  const header = lines[headerIdx].split('|').map((s) => s.trim()).filter(Boolean)
  const rows = []
  for (let i = headerIdx + 2; i < lines.length; i++) {
    const line = lines[i]
    if (!line.trim().startsWith('|')) break
    const cells = line.split('|').map((s) => s.trim())
    cells.shift()
    cells.pop()
    const row = {}
    header.forEach((h, idx) => {
      row[h] = cells[idx] !== undefined ? cells[idx] : ''
    })
    rows.push(row)
  }
  return { header, rows }
}

// Runs D3 assertions (a)-(g) over one parsed accepted-findings table and returns every
// violation found (rather than throwing on the first) so a single fixture/live-file call can
// surface everything wrong with it — mirrors how the real suite run will report failures.
function checkIntakeDiscipline(content) {
  const { header, rows } = parseAcceptedTable(content)
  const violations = []

  // (a) header has the Fix column.
  if (!header.includes('Fix')) {
    violations.push({
      rowId: null,
      message: 'accepted-findings header is missing the Fix column (D1) — every row must ' +
        'declare mechanism(<path>) | prose(<reason>) | — | pre-contract',
    })
    return violations
  }

  const seenCategories = new Set()
  const seenIds = new Set()

  for (const row of rows) {
    const id = row['ID']
    const category = row['Category']
    const fixedIn = row['Fixed in']
    const fix = row['Fix']

    // (f) row IDs are unique.
    if (seenIds.has(id)) {
      violations.push({
        rowId: id,
        message: `row ${id}: duplicate row ID — IDs must be unique or Category history and ` +
          'failure messages become ambiguous; re-ID the newer finding',
      })
    }
    seenIds.add(id)

    // (g) Category is from the closed vocabulary list.
    if (!CATEGORIES.includes(category)) {
      violations.push({
        rowId: id,
        message: `row ${id}: Category "${category}" is not in the closed vocabulary (` +
          `${CATEGORIES.join(', ')}) — add it to the test's list deliberately, or use an ` +
          'existing class; respelling to dodge the repeat rule must fail',
      })
    }

    // (b) Fix is one of the four sanctioned forms.
    const isDash = fix === '—' || fix === '-'
    const isPreContract = fix === 'pre-contract'
    const mechMatch = fix && fix.match(/^mechanism\((.+)\)$/)
    const proseMatch = fix && fix.match(/^prose\((.*)\)$/)
    if (!isDash && !isPreContract && !mechMatch && !proseMatch) {
      violations.push({
        rowId: id,
        message: `row ${id}: Fix "${fix}" is not one of mechanism(<path>) | prose(<reason>) ` +
          '| — | pre-contract',
      })
    }

    // (c) — on exactly the rows whose Fixed in is open, and nothing else on them.
    if (fixedIn === 'open' && !isDash) {
      violations.push({
        rowId: id,
        message: `row ${id}: Fixed in is open but Fix is "${fix}" — an open row must carry ` +
          'Fix: —, dispositions are recorded at close, never promised',
      })
    }
    if (fixedIn !== 'open' && isDash) {
      violations.push({
        rowId: id,
        message: `row ${id}: Fix is — but Fixed in is "${fixedIn}" — — is reserved ` +
          'for open rows; a closed row must declare mechanism(<path>) or prose(<reason>)',
      })
    }

    // (d) mechanism(<path>) paths exist in the repo.
    if (mechMatch) {
      const p = mechMatch[1].trim()
      if (!fs.existsSync(path.join(ROOT, p))) {
        violations.push({
          rowId: id,
          message: `row ${id}: mechanism(${p}) names a path that does not exist in the repo ` +
            '— land the mechanism at that path or correct the citation',
        })
      }
    }

    // (e) D2 repeat-class rule: a non-open, non-pre-contract row whose Category matches ANY
    // earlier accepted-table row (including pre-contract rows, tracked below regardless of
    // this row's own disposition) needs mechanism(<path>) or a >= 20-char prose reason.
    if (category) {
      const repeat = seenCategories.has(category)
      if (repeat && fixedIn !== 'open' && !isPreContract) {
        const mechOk = Boolean(mechMatch)
        const proseOk = Boolean(proseMatch) && proseMatch[1].trim().length >= 20
        if (!mechOk && !proseOk) {
          violations.push({
            rowId: id,
            message: `repeat class \`${category}\` — land a mechanism (script/gate/test) and ` +
              `record \`mechanism(<path>)\`, or state why none is possible in ` +
              `\`prose(<reason>)\` (row ${id})`,
          })
        }
      }
      seenCategories.add(category)
    }
  }

  return violations
}

function findViolation(violations, rowId) {
  return violations.find((v) => v.rowId === rowId)
}

// --- AC-20260805-04-1 ------------------------------------------------------------------

test('AC-20260805-04-1: a repeat-category row closing prose() with a reason under 20 chars fails, naming the row', () => {
  const violations = checkIntakeDiscipline(fixture('repeat-prose-short.md'))
  const v = findViolation(violations, 'X-2')
  assert.ok(v, 'X-2 repeats reporting-integrity from X-1 and closes prose(hard) (4 chars) — ' +
    'the discipline rule (D2) must fire or a repeat class can dodge the mechanism requirement')
  assert.match(v.message, /repeat class `reporting-integrity`/,
    'failure message must name the offending Category so the remedy is legible')
  assert.match(v.message, /mechanism/,
    'failure message must name the remedy: land a mechanism or state an impossibility reason')
})

test('AC-20260805-04-1: a repeat-category row closing prose() with a >= 20-char reason passes the discipline rule', () => {
  const violations = checkIntakeDiscipline(fixture('repeat-prose-long-ok.md'))
  assert.strictEqual(findViolation(violations, 'X-2'), undefined,
    'X-2 states a real impossibility reason (>= 20 chars) — a compliant prose() close must ' +
    'not be flagged, or the rule punishes honest disposition along with the dodge')
})

test('D2: a Category that only appears in the Rejected findings bullet list is not prior history for the discipline rule', () => {
  const violations = checkIntakeDiscipline(fixture('rejected-section-not-history.md'))
  assert.strictEqual(violations.length, 0,
    'T-1 is the accepted table\'s only reporting-integrity row; the Rejected bullet mentioning ' +
    'the same class has no Category cell and must not manufacture a false second occurrence, ' +
    'or D2 blocks first-time closes for classes any host has ever complained about')
})

// --- AC-20260805-04-2 ------------------------------------------------------------------

test('AC-20260805-04-2: mechanism(<path>) passes when the path exists in the repo', () => {
  const violations = checkIntakeDiscipline(fixture('mechanism-exists-ok.md'))
  assert.strictEqual(findViolation(violations, 'Y-1'), undefined,
    'Y-1 cites tests/helpers.js, which exists — a real mechanism citation must not be flagged, ' +
    'or a compliant row can never close mechanism()')
})

test('AC-20260805-04-2: mechanism(<path>) fails naming the dangling path when it does not exist', () => {
  const violations = checkIntakeDiscipline(fixture('mechanism-missing.md'))
  const v = findViolation(violations, 'Y-1')
  assert.ok(v, 'Y-1 cites tests/does-not-exist-anywhere.js, which is absent from the repo — a ' +
    'dangling mechanism citation lies to every host reading the ledger and must fail')
  assert.match(v.message, /does-not-exist-anywhere\.js/,
    'failure message must name the dangling path itself, not just the row, or the remedy is ' +
    'a repo-wide search instead of a one-line fix')
})

// --- AC-20260805-04-3 ------------------------------------------------------------------

test('AC-20260805-04-3: an open row carrying Fix: — passes', () => {
  const violations = checkIntakeDiscipline(fixture('open-dash-ok.md'))
  assert.strictEqual(findViolation(violations, 'Z-1'), undefined,
    'Z-1 is Fixed in: open with Fix: — — the sanctioned shape for an unclosed row must ' +
    'not be flagged')
})

test('AC-20260805-04-3: an open row carrying Fix: mechanism(...) fails — dispositions are recorded at close, never promised', () => {
  const violations = checkIntakeDiscipline(fixture('open-with-mechanism-bad.md'))
  const v = findViolation(violations, 'Z-1')
  assert.ok(v, 'Z-1 is Fixed in: open but declares mechanism(tests/helpers.js) — an open row ' +
    'promising a disposition before the fix lands must fail, or the ledger can lie about work ' +
    'not yet done')
  assert.match(v.message, /open/i,
    'failure message must explain that open rows are dispositioned at close, not in advance')
})

// --- AC-20260805-04-6 -------------------------------------------------------------------

test('AC-20260805-04-6: a Category outside the closed vocabulary fails, naming the row and the six valid strings', () => {
  const violations = checkIntakeDiscipline(fixture('bad-category.md'))
  const v = findViolation(violations, 'W-1')
  assert.ok(v, 'W-1 uses Category "workflow-defects" (plural) instead of the vocabulary\'s ' +
    '"workflow-defect" — an unrecognized spelling must fail, or a class can dodge the repeat ' +
    'rule (D2) by respelling itself on its second occurrence')
  for (const cat of CATEGORIES) {
    assert.ok(v.message.includes(cat),
      `failure message must enumerate the closed vocabulary (missing "${cat}") so the remedy ` +
      'is a lookup, not a guess')
  }
})

// --- D3(a)/(b)/(f), backing AC-20260805-04-4 --------------------------------------------

test('D3(a): a table with no Fix column fails naming the missing column', () => {
  const violations = checkIntakeDiscipline(fixture('missing-fix-column.md'))
  assert.ok(violations.length > 0,
    'the accepted-findings header has no Fix column at all — D1 requires it on every table; ' +
    'silently passing here would let the whole discipline rule go unenforced')
  assert.match(violations[0].message, /Fix column/,
    'failure message must name the missing Fix column, the actual defect, not a downstream ' +
    'symptom')
})

test('D3(b): a Fix cell that is not one of the four sanctioned forms fails naming the row', () => {
  const badTable = [
    '| ID | Source | Category | Stage | Pinned by | Fixed in | Fix |',
    '|---|---|---|---|---|---|---|',
    '| R-1 | fixture source | doctrine-rot | doctor | `tests/helpers.js` | 1.0.0 | done |',
    '',
    '## Rejected findings',
    '',
    '- nothing rejected in this fixture',
  ].join('\n')
  const violations = checkIntakeDiscipline(badTable)
  const v = findViolation(violations, 'R-1')
  assert.ok(v, 'R-1 declares Fix: done, which is none of mechanism(<path>) | prose(<reason>) ' +
    '| — | pre-contract — an unrecognized form must fail, not pass through as an unknown ' +
    'disposition')
})

test('D3(f): two accepted rows sharing one ID fail the suite naming the duplicate', () => {
  const violations = checkIntakeDiscipline(fixture('duplicate-id.md'))
  const v = findViolation(violations, 'V-1')
  assert.ok(v, 'both rows in the fixture declare ID V-1 — duplicate IDs make every ' +
    'ID-keyed failure message ambiguous (D6\'s own motivation) and must fail')
  assert.match(v.message, /duplicate/i,
    'failure message must say "duplicate", not just point at the row, so the remedy (re-ID ' +
    'the newer finding) is legible without cross-referencing the table')
})

// --- AC-20260805-04-4: the live table itself -------------------------------------------

test('AC-20260805-04-4: the live spec/INTAKE.md accepted-findings table passes every D3 assertion', () => {
  const live = readSpec('INTAKE.md')
  const violations = checkIntakeDiscipline(live)
  assert.strictEqual(violations.length, 0,
    'spec/INTAKE.md must satisfy D3(a)-(g) in full — this pin is EXPECTED RED until the ' +
    'implementation batch lands the Fix column (D1/D4 backfill) and repairs the duplicate ' +
    'PRAX-20260721-01 ID (D6); once that lands this assertion is what keeps the live file ' +
    `honest forever. Current violations:\n${violations.map((v) => `  ${v.rowId}: ${v.message}`).join('\n')}`)
})

// --- AC-20260805-04-5: doctor check 15 resolves columns by name, not position ------------

test('AC-20260805-04-5: doctor check 15 still greps `Fixed in` by name against the widened table (name-based, not positional)', () => {
  const doctor = readSpec('commands/doctor.md')
  assert.match(doctor, /Fixed in/,
    'doctor check 15 (upstream-fixes) must reference the `Fixed in` column by its header ' +
    'name — an appended Fix column must not require a positional rewrite')
  assert.match(doctor, /Upstream fixes/,
    'check 15\'s heading must still exist — this pins the same invariant feedback-loop.test.js ' +
    'covers ("check 15 closes the return path"), tagged here for AC-20260805-04-5')
})

test('AC-20260805-04-5: the order guard catches Fix landing before Fixed in', () => {
  const { header } = parseAcceptedTable(fixture('header-order-bad.md'))
  const fixedInIdx = header.indexOf('Fixed in')
  const fixIdx = header.indexOf('Fix')
  assert.ok(fixedInIdx !== -1 && fixIdx !== -1,
    'fixture must carry both columns to exercise the order guard')
  assert.ok(fixedInIdx > fixIdx,
    'header-order-bad.md deliberately places Fix before Fixed in; the guard (asserted on the ' +
    'live table below) must be capable of detecting exactly this reversal, or D1\'s ' +
    '"appended last" placement could silently invert without the suite noticing')
})

test('AC-20260805-04-5: the live table\'s header keeps Fixed in ahead of any Fix column (vacuously true until D1 lands)', () => {
  const { header } = parseAcceptedTable(readSpec('INTAKE.md'))
  const fixedInIdx = header.indexOf('Fixed in')
  const fixIdx = header.indexOf('Fix')
  assert.ok(fixedInIdx !== -1,
    'the live accepted-findings table must always carry a Fixed in column by that exact name')
  if (fixIdx !== -1) {
    assert.ok(fixedInIdx < fixIdx,
      'once D1 appends Fix, it must land after Fixed in, or doctor check 15\'s name-grep ' +
      'stays correct only by accident of column order')
  }
})
