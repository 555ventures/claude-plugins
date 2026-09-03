'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const path = require('node:path')
const { read } = require('../helpers')

// specs/20260902/06-mocks-provenance-ledger.md D1-D4, AC-20260902-06-1..5.
// spec/templates/mocks-ledger.md (File Plan, no AC of its own) does not exist at plan time;
// the Contracts block's empty-template text is inlined here rather than read from disk, so
// this file never depends on that CREATE row's timing (deviation logged).
const { parseLedger, gateVerdict, countsLine, appendAssumption, setStatus } =
  require('../../spec/scripts/lib/mocks-ledger')

const FIXTURE = path.join('tests/fixtures/mocks-ledger/dry-run.md')

const EMPTY_TEMPLATE = [
  '# Provenance ledger — { project }',
  '',
  '<!-- Grammar: spec/doctrine/mocks.md § Provenance Ledger. Enum cells are one fixed word:',
  '     kind product|process · tag said-by-user|ratified-doc|inferred|invented ·',
  '     status open|confirmed|overridden|decided (+ optional YYYY-MM-DD). Free text only in',
  '     claim / rejected / note; write a literal pipe as \\| . Rows are written by the mocks driver',
  '     (spec-paths mocks-driver), never by hand-typed printf. -->',
  '',
  '## Assumptions',
  '',
  '| id | step | kind | claim | tag | status | rejected | dependents | note |',
  '| - | - | - | - | - | - | - | - | - |',
  '',
  '## Misunderstandings',
  '',
  '| id | what | step | cost | note |',
  '| - | - | - | - | - |',
  '',
].join('\n')

test('AC-20260902-06-1: WHEN parseLedger reads the Hearwell dry-run fixture THE SYSTEM returns 74 assumption rows and 13 catches with errors:[], and rows P1b and A3 parse to their exact fixed-word fields', () => {
  const ledger = parseLedger(read(FIXTURE))
  assert.deepStrictEqual(ledger.errors, [],
    'the committed fixture is D8\'s realistic, already-normalized corpus — any Err here means the parser rejects a row shape the fixture legitimately contains: ' + JSON.stringify(ledger.errors))
  assert.strictEqual(ledger.assumptions.length, 74,
    'the fixture has exactly 74 data rows in its Assumptions table (verified by direct count) — a row miscount means the header-driven table scan is off by a boundary (blank line, header match, or the separator row)')
  assert.strictEqual(ledger.catches.length, 13,
    'the fixture has exactly 13 data rows in its Misunderstandings table — a miscount here means the second table\'s header-driven scan is broken independently of the first')
  const p1b = ledger.assumptions.find((r) => r.id === 'P1b')
  assert.ok(p1b, 'row P1b must be present in the parsed Assumptions rows at all')
  assert.strictEqual(p1b.step, 'SEED', 'P1b\'s step cell must parse verbatim as SEED')
  assert.strictEqual(p1b.kind, 'product', 'P1b\'s kind cell must parse verbatim as product')
  assert.strictEqual(p1b.tag, 'said-by-user', 'P1b\'s tag cell must parse verbatim as said-by-user')
  assert.strictEqual(p1b.status, 'confirmed', 'P1b\'s status word must parse as confirmed, split from its trailing date')
  assert.strictEqual(p1b.statusDate, '2026-09-02', 'P1b\'s trailing status date must be split into statusDate, not left inside status or dropped')
  const a3 = ledger.assumptions.find((r) => r.id === 'A3')
  assert.ok(a3, 'row A3 must be present in the parsed Assumptions rows at all')
  assert.strictEqual(a3.kind, 'process', 'A3\'s kind cell must parse verbatim as process')
  assert.strictEqual(a3.tag, 'invented', 'A3\'s tag cell must parse verbatim as invented')
  assert.strictEqual(a3.status, 'decided', 'A3\'s status word must parse as decided — the one status word restricted to process rows')
  assert.strictEqual(a3.statusDate, null, 'A3 carries no trailing date, so statusDate must be null, never an empty string or undefined')
})

test('AC-20260902-06-2: WHEN a row carries a tag, status, or kind cell outside the fixed words, or a duplicate id, or a decided status on a product row, THE SYSTEM reports an Err per fault and gateVerdict on any-Err ledger returns {open:false, blocking:[]}', () => {
  const badTag = EMPTY_TEMPLATE.replace(
    '| - | - | - | - | - | - | - | - | - |\n\n## Misunderstandings',
    '| - | - | - | - | - | - | - | - | - |\n' +
    '| W7 | WIREFRAMES | product | c | inferred (my recommendation) | open | - | - | - |\n\n## Misunderstandings'
  )
  const tagLedger = parseLedger(badTag)
  const tagErr = tagLedger.errors.find((e) => e.id === 'W7')
  assert.ok(tagErr, 'a row whose tag cell is not one of the four fixed words must produce an Err naming that row\'s id — silently accepting it would let free text back into the enum column D1 exists to close (spike: 15/74 tag cells were free text before this grammar)')
  assert.strictEqual(tagErr.column, 'tag', 'the Err must name the offending column as "tag" so a caller can point the user at the right cell')
  assert.strictEqual(tagErr.message,
    'tag "inferred (my recommendation)" — allowed: said-by-user|ratified-doc|inferred|invented',
    'the Err message must match the AC\'s literal example exactly — this is the message a session reads back to fix its own malformed row')
  const gateOnErr = gateVerdict(tagLedger)
  assert.deepStrictEqual(gateOnErr, { open: false, blocking: [], errors: tagLedger.errors },
    'a ledger that does not parse must never open a gate — {open:false, blocking:[]} regardless of how many rows would otherwise pass, or a malformed ledger could silently green-light an advance')

  const dupText = EMPTY_TEMPLATE.replace(
    '| - | - | - | - | - | - | - | - | - |\n\n## Misunderstandings',
    '| - | - | - | - | - | - | - | - | - |\n' +
    '| D1 | SEED | product | a | said-by-user | confirmed | - | - | - |\n' +
    '| D1 | SEED | product | b | said-by-user | confirmed | - | - | - |\n\n## Misunderstandings'
  )
  const dupLedger = parseLedger(dupText)
  const dupErr = dupLedger.errors.find((e) => e.id === 'D1')
  assert.ok(dupErr, 'two Assumptions rows sharing one id must produce an Err — a duplicate id breaks setStatus/appendCatch\'s single-row addressing (D4)')
  const lineRefs = (Array.isArray(dupErr.line) ? dupErr.line.join(' ') : dupErr.message).match(/\d+/g) || []
  assert.ok(new Set(lineRefs).size >= 2,
    'the duplicate-id Err must name both lines the id occurs on (either two numbers in the message or a `line` array of length 2) — naming only one leaves the reader unable to find the second offending row: ' + JSON.stringify(dupErr))

  const decidedOnProduct = EMPTY_TEMPLATE.replace(
    '| - | - | - | - | - | - | - | - | - |\n\n## Misunderstandings',
    '| - | - | - | - | - | - | - | - | - |\n' +
    '| X2 | SEED | product | c | said-by-user | decided | - | - | - |\n\n## Misunderstandings'
  )
  const decidedLedger = parseLedger(decidedOnProduct)
  const decidedErr = decidedLedger.errors.find((e) => e.id === 'X2')
  assert.ok(decidedErr,
    '`decided` is restricted to process rows (Contracts grammar comment: "decided only on process rows") — a product row claiming `decided` status must be an Err, or a product fact could be marked settled without ever being confirmed by the user')
})

test('AC-20260902-06-3: WHEN gateVerdict evaluates the fixture THE SYSTEM returns open:false naming exactly the 35 blocking rows (first W1, including W10 and T2, never A3 or P1), and a ledger whose only non-confirmed rows are process-invented-decided and product-ratified-doc-open returns open:true, blocking:[]', () => {
  const ledger = parseLedger(read(FIXTURE))
  const verdict = gateVerdict(ledger)
  assert.strictEqual(verdict.open, false,
    'the fixture carries open inferred and invented product rows — gateVerdict must report open:false or a real blocked mocks run would be told to advance')
  const blockingIds = verdict.blocking.map((r) => r.id)
  assert.strictEqual(blockingIds.length, 35,
    'exactly 35 rows in the fixture are product+invented(not overridden) or product+inferred+open (direct count) — a different count means the blocking predicate diverges from D2\'s rule: ' + JSON.stringify(blockingIds))
  assert.strictEqual(blockingIds[0], 'W1', 'the first blocking row in file order must be W1 — blocking must preserve source order, not re-sort by id or tag')
  assert.ok(blockingIds.includes('W10'), 'W10 (product, inferred, open) must be in blocking')
  assert.ok(blockingIds.includes('T2'), 'T2 (product, inferred, open) must be in blocking')
  assert.ok(!blockingIds.includes('A3'), 'A3 is a process row (invented, decided) — process rows never block per D2, regardless of tag or status')
  assert.ok(!blockingIds.includes('P1'), 'P1 is tag ratified-doc — ratified-doc rows never block per D2, regardless of status')

  const nonBlockingText = EMPTY_TEMPLATE.replace(
    '| - | - | - | - | - | - | - | - | - |\n\n## Misunderstandings',
    '| - | - | - | - | - | - | - | - | - |\n' +
    '| Z1 | SEED | process | c | invented | decided | - | - | - |\n' +
    '| Z2 | SEED | product | c | ratified-doc | open | - | - | - |\n\n## Misunderstandings'
  )
  const nonBlockingLedger = parseLedger(nonBlockingText)
  assert.deepStrictEqual(nonBlockingLedger.errors, [], 'the non-blocking fixture must itself parse clean, or the gate:true assertion below would be vacuous')
  assert.deepStrictEqual(gateVerdict(nonBlockingLedger), { open: true, blocking: [], errors: [] },
    'a process-invented-decided row and a product-ratified-doc-open row are both non-blocking by D2 — a ledger with only those must open the gate')
})

test('AC-20260902-06-4: WHEN countsLine renders the fixture THE SYSTEM prints the exact fixed-shape D3 line', () => {
  const ledger = parseLedger(read(FIXTURE))
  const line = countsLine(ledger)
  assert.strictEqual(
    line,
    '📒 ledger: 21 said-by-user · 8 ratified-doc · 32 inferred (30 open) · 5 invented (5 open) · 8 process · 13 catches',
    'D3 pins one exact fixed-glyph line other specs (spec 07\'s driver) grep verbatim — any deviation in wording, ordering, or the counted numbers breaks every caller that greps for this shape'
  )
})

test('AC-20260902-06-5: WHEN appendAssumption writes a row with a piped claim THE SYSTEM escapes the pipe on write and unescapes it on re-parse, and setStatus changes only that row\'s status and tag cells (a one-line diff)', () => {
  const withRow = appendAssumption(EMPTY_TEMPLATE, {
    id: 'X1', step: 'SEED', kind: 'product', claim: 'a | b', tag: 'invented', status: 'open',
  })
  assert.match(withRow, /a \\\| b/,
    'a literal pipe inside claim must be written escaped (\\|) in the markdown table, or the extra cell it introduces corrupts every column after it (D4, escape ledger\'s own incident)')
  const reparsed = parseLedger(withRow)
  assert.deepStrictEqual(reparsed.errors, [], 'the appended row must itself be valid against the grammar it was just written against')
  const row = reparsed.assumptions.find((r) => r.id === 'X1')
  assert.ok(row, 'the appended row must re-parse back out as one Assumptions row addressable by its id')
  assert.strictEqual(row.claim, 'a | b', 'the escaped pipe must unescape back to a literal pipe on read — a lossy round trip would silently truncate every claim containing one')

  const restatused = setStatus(withRow, 'X1', 'confirmed 2026-09-02', 'said-by-user')
  const before = withRow.split('\n')
  const after = restatused.split('\n')
  assert.strictEqual(before.length, after.length,
    'setStatus rewrites one row in place — it must never add or remove a line, or every downstream line offset a caller might track breaks')
  let diffLines = 0
  for (let i = 0; i < before.length; i++) if (before[i] !== after[i]) diffLines++
  assert.strictEqual(diffLines, 1,
    'D4: setStatus must touch only the one row\'s line — leaving every other byte identical; a diff of the two texts must be exactly one line, or the "one writer, byte-stable edits" guarantee is broken')
  const reparsedAfter = parseLedger(restatused)
  const rowAfter = reparsedAfter.assumptions.find((r) => r.id === 'X1')
  assert.strictEqual(rowAfter.status, 'confirmed', 'setStatus must actually change the status cell to the new word')
  assert.strictEqual(rowAfter.statusDate, '2026-09-02', 'setStatus must carry through the trailing date passed in the status argument')
  assert.strictEqual(rowAfter.tag, 'said-by-user', 'setStatus must change the tag cell when a tag argument is given')
  assert.strictEqual(rowAfter.claim, 'a | b', 'setStatus must leave every other cell on the row — including claim — completely untouched')
})
