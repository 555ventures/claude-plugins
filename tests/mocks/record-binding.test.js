'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir } = require('../helpers')
const {
  JOURNEY, LABELS, mark, writeWireframe, decideLook, writeFixtureCapture, writeCaptureConfig,
  advanceToCanonWritten, statusJson,
} = require('./mocks-driver-fixtures')

// Owner: specs/20260912/10-seeded-data-names-its-source.md D1-D4.
// AC-20260912-10-1, AC-20260912-10-2, AC-20260912-10-3, AC-20260912-10-4.
// spec/scripts/lib/mock-seed-checks.js is a pure module (no fs) — required directly, the same
// pattern tests/mocks/kit-layers.test.js already uses for a plugin lib with no disk dependency.
// The cases above call the pure library functions directly; the cases below (added by the
// review round that found D4's gate wiring itself was unpinned) exec spec/scripts/mocks-driver.js
// itself so the warn/refuse tier split and the bound-mock predicate are proven at the driver,
// never only at the library.

function approveJourneyAfterDrawn(dir) {
  writeCaptureConfig(dir, writeFixtureCapture(dir))
  decideLook(dir, 'journey-approved:' + JOURNEY, 'approve', { by: 'jj' })
  return mark(dir, 'journey-approved', ['--journey', JOURNEY])
}

test('AC-20260912-10-1: resolveRecordRef refuses an out-of-range index naming the reference and the record count, and a misspelled field naming the missing field', () => {
  const { resolveRecordRef } = require('../../spec/scripts/lib/mock-seed-checks')
  const recordsByEntity = {
    customers: [
      { name: 'Ada Lovelace', city: 'London' },
      { name: 'Bo Diallo', city: 'Dakar' },
      { name: 'Cleo Reyes', city: 'Lima' },
    ],
  }
  const outOfRange = resolveRecordRef(recordsByEntity, 'customers[9].name')
  assert.ok(outOfRange && typeof outOfRange.error === 'string',
    'an index past the end of a 3-record array must resolve to {error}, never {value:undefined} or a thrown exception, or a typo\'d index would silently bind nothing: ' + JSON.stringify(outOfRange))
  assert.match(outOfRange.error, /customers\[9\]\.name/,
    'the refusal must name the exact reference that failed, or a session cannot tell which of several bindings on a screen is broken: ' + outOfRange.error)
  assert.match(outOfRange.error, /3 record/,
    'the refusal must name the record count so the author knows the valid index range: ' + outOfRange.error)

  const missingField = resolveRecordRef(recordsByEntity, 'customers[0].nmae')
  assert.ok(missingField && typeof missingField.error === 'string',
    'a misspelled field name must resolve to {error}, not silently return undefined: ' + JSON.stringify(missingField))
  assert.match(missingField.error, /no field "nmae"/,
    'the refusal must name the first failing segment ("nmae") so the typo is findable, never a generic "does not resolve": ' + missingField.error)
})

test('AC-20260912-10-1: recordBindingViolations reports one violation per unresolvable data-record binding, each carrying the label and the same resolveRecordRef reasoning', () => {
  const { recordBindingViolations } = require('../../spec/scripts/lib/mock-seed-checks')
  const recordsByEntity = {
    customers: [
      { name: 'Ada Lovelace', city: 'London' },
      { name: 'Bo Diallo', city: 'Dakar' },
      { name: 'Cleo Reyes', city: 'Lima' },
    ],
  }
  const html = '<span data-record="customers[9].name">Nope</span>' +
    '<span data-record="customers[0].nmae">Nope</span>'
  const { violations } = recordBindingViolations(html, 'checkout', recordsByEntity)
  assert.ok(violations.some((v) => v.includes('checkout') && v.includes('customers[9].name') && /3 record/.test(v)),
    'a screen carrying an out-of-range data-record reference must be refused naming the screen, the reference, and the record count: ' + JSON.stringify(violations))
  assert.ok(violations.some((v) => v.includes('checkout') && v.includes('customers[0].nmae') && v.includes('nmae')),
    'a screen carrying a data-record reference to a nonexistent field must be refused naming the screen, the reference, and the missing field: ' + JSON.stringify(violations))
})

test('AC-20260912-10-2: recordBindingViolations refuses a bound element whose text does not equal the resolved value, printing both strings, and reports nothing once tags are stripped and whitespace collapsed', () => {
  const { recordBindingViolations } = require('../../spec/scripts/lib/mock-seed-checks')
  const recordsByEntity = { customers: [{ name: 'Ada Lovelace' }] }

  const mismatchHtml = '<span data-record="customers[0].name">Ada Lovelance</span>'
  const { violations } = recordBindingViolations(mismatchHtml, 'profile', recordsByEntity)
  assert.ok(violations.some((v) => v.includes('Ada Lovelance') && v.includes('Ada Lovelace')),
    'a retyped copy that drifts from the record ("Lovelance" vs "Lovelace") must be refused printing BOTH strings — this is the misspelled-ninth-copy defect the spec exists to catch, and a message naming only one string leaves the author guessing which is right: ' + JSON.stringify(violations))

  const taggedHtml = '<span data-record="customers[0].name"><b>Ada</b> Lovelace</span>'
  const { violations: v2 } = recordBindingViolations(taggedHtml, 'profile', recordsByEntity)
  assert.strictEqual(v2.length, 0,
    'inner tags must be stripped and whitespace collapsed before the comparison — "<b>Ada</b> Lovelace" is the same visible text as "Ada Lovelace" and must report nothing: ' + JSON.stringify(v2))
})

test('AC-20260912-10-3: recordBindingViolations refuses a distinctive seed value occurring outside every bound element, naming the value and the screen, and reports nothing once it is correctly bound', () => {
  const { recordBindingViolations } = require('../../spec/scripts/lib/mock-seed-checks')
  const recordsByEntity = { customers: [{ name: 'Ada Lovelace' }, { name: 'Bo Diallo' }] }

  const strayHtml = '<p>Ada Lovelace signed in today</p>'
  const { violations } = recordBindingViolations(strayHtml, 'dashboard', recordsByEntity)
  assert.ok(violations.some((v) => v.includes('Ada Lovelace') && v.includes('dashboard')),
    '"Ada Lovelace" occurs in exactly one record and is 10+ characters, so a stray copy outside any data-record element must be refused naming the value and the screen\'s label ("dashboard") — otherwise a retyped, unbound copy can reach approval unnoticed: ' + JSON.stringify(violations))

  const boundHtml = '<span data-record="customers[0].name">Ada Lovelace</span>'
  const { violations: v2 } = recordBindingViolations(boundHtml, 'dashboard', recordsByEntity)
  assert.strictEqual(v2.length, 0,
    'a value that appears ONLY inside a correctly bound data-record element is not a stray occurrence and must report nothing: ' + JSON.stringify(v2))
})

test('AC-20260912-10-4: distinctiveValues returns only the value that is 8+ characters or spaced AND unique across every record file, and a stray non-distinctive value warns rather than violates', () => {
  const { distinctiveValues, recordBindingViolations } = require('../../spec/scripts/lib/mock-seed-checks')
  const recordsByEntity = {
    customers: [{ name: 'Ada Lovelace', status: 'open' }],
    venues: [{ city: 'Reykjavík' }],
    orders: [{ city: 'Reykjavík' }],
  }
  const set = distinctiveValues(recordsByEntity)
  assert.ok(set.has('Ada Lovelace'),
    '"Ada Lovelace" contains a space and occurs in exactly one record, so it must be in the distinctive set — otherwise a retyped copy of it would only ever warn, never refuse: ' + JSON.stringify([...set]))
  assert.ok(!set.has('open'),
    '"open" is a bare word under eight characters with no space — it fails the distinctiveness test and refusing it would make the rule unusable on a product\'s own chrome vocabulary: ' + JSON.stringify([...set]))
  assert.ok(!set.has('Reykjavík'),
    '"Reykjavík" occurs in two different record files, so it is not distinctive to any one record and must stay out of the refusal set: ' + JSON.stringify([...set]))

  const html = '<p>open for business</p>'
  const { violations, warns } = recordBindingViolations(html, 'billing', recordsByEntity)
  assert.strictEqual(violations.length, 0,
    'a stray occurrence of a non-distinctive value ("open") must never be a violation: ' + JSON.stringify(violations))
  assert.ok(warns.some((w) => w.includes('⚠️') && w.includes('open') && w.includes('billing')),
    'a stray occurrence of a non-distinctive value must still produce a ⚠️ warn naming the value and the screen, so it stays visible without blocking the mark: ' + JSON.stringify(warns))
})

test('AC-20260912-10-1 (D4): an unresolvable data-record reference is a ⚠️ warn at journey-drawn (the mark still completes) but a refusal at journey-approved for the same screen', () => {
  const dir = tmpdir('record-binding-tier-split')
  advanceToCanonWritten(dir)
  for (let i = 0; i < LABELS.length; i++) writeWireframe(dir, LABELS[i], { to: LABELS[i + 1] })
  const brokenFile = path.join(dir, 'design/mocks', LABELS[0] + '.html')
  const brokenHtml = fs.readFileSync(brokenFile, 'utf8')
  const withBrokenRef = brokenHtml.replace('</main>',
    '<span data-record="customer[9].name" data-bespoke="sheet: broken ref">Nope</span></main>')
  assert.notStrictEqual(withBrokenRef, brokenHtml,
    'test setup requires </main> to be present in the fixture so the broken binding can be injected before it: ' + brokenHtml)
  fs.writeFileSync(brokenFile, withBrokenRef)

  const drawn = mark(dir, 'journey-drawn', ['--journey', JOURNEY])
  const drawnOut = drawn.stdout + drawn.stderr
  assert.strictEqual(drawn.status, 0,
    'D4 binds a binding violation as a WARN at journey-drawn, never a refusal — the mark must still complete despite the unresolvable data-record reference: ' + drawnOut)
  assert.match(drawnOut, /⚠️.*customer\[9\]\.name/,
    'journey-drawn must print the unresolvable reference as a ⚠️ warn, or D4\'s warn tier is not actually wired into the driver: ' + drawnOut)

  const approved = approveJourneyAfterDrawn(dir)
  const approvedOut = approved.stdout + approved.stderr
  assert.strictEqual(approved.status, 2,
    'D4 binds the SAME violation as a REFUSAL at journey-approved — a mock carrying an unresolvable data-record reference must never reach approval: ' + approvedOut)
  assert.match(approvedOut, /customer\[9\]\.name/,
    'the journey-approved refusal must name the same broken reference the journey-drawn warn named, or the two tiers are not checking the same rule: ' + approvedOut)
  const st = statusJson(dir)
  assert.ok(!(st.journeys[JOURNEY] && st.journeys[JOURNEY].approved),
    'the refusal must actually block the mark — journeys.onboarding.approved must not be recorded: ' + JSON.stringify(st.journeys[JOURNEY]))
})

test('D4: a mock that does not link the wire register carries none of the three binding rules at journey-approved, even when it holds an unresolvable data-record reference', () => {
  const dir = tmpdir('record-binding-unbound-predicate')
  advanceToCanonWritten(dir)
  for (let i = 0; i < LABELS.length; i++) writeWireframe(dir, LABELS[i], { to: LABELS[i + 1] })
  const drawn = mark(dir, 'journey-drawn', ['--journey', JOURNEY])
  assert.strictEqual(drawn.status, 0,
    'test setup requires journey-drawn to be accepted on the unmodified fixture before the unbinding is introduced: ' + drawn.stdout + drawn.stderr)

  // Unbind LABELS[1] AFTER it has already drawn clean: replace its two wire/*.css links with a
  // single non-wire tokens.css link — design-atlas.js's own unconditional "does not link a
  // tokens.css" check (spec/scripts/design-atlas.js, run again at journey-approved before the
  // binding pass) still needs SOME tokens.css, but linksWireRegister(html)
  // (spec/scripts/lib/wire-register.js) reads only whether a target has "wire" as a whole path
  // segment — this is exactly the "theme picked, mock no longer wears the wireframe register"
  // shape spec 09's own D2 predicate is designed to exclude. Then inject an otherwise-refusable
  // broken reference: D4 binds all three rules to the SAME predicate spec 09 D2 establishes (a
  // labelled, non-canon mock that links the wire register) — an unbound mock must carry none of
  // them.
  const label = LABELS[1]
  const file = path.join(dir, 'design/mocks', label + '.html')
  const html = fs.readFileSync(file, 'utf8')
  // The box-sizing hygiene rule (design-atlas.js hygieneViolations (a)) is satisfied by
  // linksWireRegister OR the mock's own universal reset rule — safe to add here only because an
  // unbound mock (isInventionBoundMock requires linksWireRegister too) is exempt from the
  // invention rule that would otherwise forbid a mock's own <style> block.
  const unbound = html
    .replace('<link rel="stylesheet" href="../wire/tokens.css">\n', '<link rel="stylesheet" href="../tokens.css">\n<style>* { box-sizing: border-box; }</style>\n')
    .replace('<link rel="stylesheet" href="../wire/wire.css">\n', '')
    .replace('</main>', '<span data-record="customer[9].name" data-bespoke="sheet: broken ref, unbound screen">Nope</span></main>')
  assert.ok(!unbound.includes('../wire/tokens.css') && !unbound.includes('../wire/wire.css') && unbound.includes('../tokens.css'),
    'test setup requires both wire register links to be replaced by a non-wire tokens.css link on ' + label + '.html, or the predicate this test exercises is never actually false: ' + unbound)
  fs.writeFileSync(file, unbound)

  const approved = approveJourneyAfterDrawn(dir)
  const out = approved.stdout + approved.stderr
  assert.strictEqual(approved.status, 0,
    'a screen that does not link the wire register is outside D4\'s bound-mock predicate — journey-approved must accept the journey despite the unresolvable data-record reference on that screen: ' + out)
  assert.ok(!out.includes('customer[9]'),
    'the unresolvable reference on the unbound screen must never be reported at all — reporting it would mean the binding rules ran on a screen outside the predicate: ' + out)
  const st = statusJson(dir)
  assert.ok(st.journeys[JOURNEY] && st.journeys[JOURNEY].approved,
    'the mark must actually complete once the only violation on the host sits on a screen outside the bound-mock predicate: ' + JSON.stringify(st.journeys[JOURNEY]))
})

test('review finding (D4 fix round): a mock file missing at journey-approved refuses cleanly at exit 2 naming the path, never an uncaught ENOENT crash at exit 1', () => {
  const dir = tmpdir('record-binding-missing-mock-file')
  advanceToCanonWritten(dir)
  for (let i = 0; i < LABELS.length; i++) writeWireframe(dir, LABELS[i], { to: LABELS[i + 1] })
  const drawn = mark(dir, 'journey-drawn', ['--journey', JOURNEY])
  assert.strictEqual(drawn.status, 0,
    'test setup requires journey-drawn to be accepted before the mock file is deleted out from under journey-approved: ' + drawn.stdout + drawn.stderr)

  const deletedLabel = LABELS[2]
  const deletedFile = path.join(dir, 'design/mocks', deletedLabel + '.html')
  fs.unlinkSync(deletedFile)

  const approved = approveJourneyAfterDrawn(dir)
  const out = approved.stdout + approved.stderr
  assert.strictEqual(approved.status, 2,
    'a screen deleted after journey-drawn must refuse journey-approved with a clean exit 2, precondition-style failure — an uncaught ENOENT exits 1 and prints a raw stack trace instead: ' + out)
  assert.match(out, /no such path/,
    'the refusal must come from design-atlas.js check\'s own fs.existsSync-backed "no such path" guard, run before the binding pass\'s unguarded fs.readFileSync: ' + out)
  assert.ok(out.includes(deletedLabel + '.html'),
    'the refusal must name the missing screen\'s path, or a session cannot tell which of the journey\'s screens was deleted: ' + out)
})

// Owner: the advisory finding recorded by run rv_1994883f484a's reviewer against
// specs/20260912/10-seeded-data-names-its-source.md, fixed directly (JJ 2026-09-13).
// An element whose close tag is absent — HTML lets `<td>`, `<li>`, `<p>` and friends be closed
// implicitly, and a void or self-closing element has no close tag at all — must not swallow the
// rest of the document as its own text: doing so both compares the record against the whole page
// and masks every stray seed value after it from the D3 sweep, which fails silently rather than
// loudly. The spec's own Contracts example binds a `<td>`.
test('boundBindings ends an implicitly closed element at the next close tag rather than at the end of the document', () => {
  const { boundBindings } = require('../../spec/scripts/lib/mock-seed-checks')
  const html = '<table><tr><td data-record="customers[0].name">Ada Lovelace</tr></table>' +
    '<p>Ada Lovelace</p>'
  const bindings = boundBindings(html)
  assert.strictEqual(bindings.length, 1,
    'the one data-record element must still be found when its close tag is omitted, or an implicitly closed binding stops being checked at all: ' + JSON.stringify(bindings))
  assert.strictEqual(bindings[0].text, 'Ada Lovelace',
    'an implicitly closed element\'s text must stop at the next close tag, never run to the end of the document — otherwise the record is compared against the whole rest of the page and every mismatch reads as a false refusal: ' + JSON.stringify(bindings[0]))
})

test('a distinctive seed value retyped after an implicitly closed binding is still refused', () => {
  const { recordBindingViolations } = require('../../spec/scripts/lib/mock-seed-checks')
  const recordsByEntity = {
    customers: [
      { name: 'Ada Lovelace' },
      { name: 'Bo Diallo' },
      { name: 'Cleo Reyes' },
    ],
  }
  const html = '<table><tr><td data-record="customers[0].name">Ada Lovelace</tr></table>' +
    '<p>Bo Diallo</p>'
  const { violations } = recordBindingViolations(html, 'orders', recordsByEntity)
  assert.ok(violations.some((v) => v.includes('"Bo Diallo" appears outside any data-record element')),
    'a distinctive record value typed outside every bound element must still be refused when an earlier binding omitted its close tag, or one implicitly closed cell silently switches the whole rest of the screen off: ' + JSON.stringify(violations))
})

test('a void or self-closing element carrying data-record binds empty text rather than the rest of the document', () => {
  const { boundBindings } = require('../../spec/scripts/lib/mock-seed-checks')
  const html = '<img data-record="customers[0].name"><p>Ada Lovelace</p>'
  const bindings = boundBindings(html)
  assert.strictEqual(bindings.length, 1,
    'a void element carrying data-record must still be reported, or a nonsensical binding goes unchecked: ' + JSON.stringify(bindings))
  assert.strictEqual(bindings[0].text, '',
    'a void element has no text, so its bound text must be empty and fail the equality check loudly, never absorb the following markup and mask the stray sweep: ' + JSON.stringify(bindings[0]))
})
