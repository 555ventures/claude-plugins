'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { ROOT, tmpdir, runNode } = require('../helpers')

// specs/20260911/04-every-criterion-declares-its-test.md D1/D2/D3/D4: pins lib/spec-sections.js's
// `parseDisposition` (AC-1), ac-matrix.js --lint's new `missing-disposition` finding (AC-2), and
// `--resolve-root`'s `unresolved-disposition` finding (AC-3). AC-20260911-04-4 (--lint combined
// with --root/--manifest/--skips/--has-drift-script REMAINS exit 2) needs no new test here — its
// own bullet declares `→ reuses tests/ac-matrix/lint-mode.test.js :: AC-20260907-01-6`, an
// existing, unchanged, already-passing test that fully covers it.

const specSectionsPath = path.join(ROOT, 'spec/scripts/lib/spec-sections.js')

function loadSpecSections() {
  delete require.cache[specSectionsPath]
  return require(specSectionsPath)
}

test('AC-20260911-04-1: parseDisposition reads the arrow-tail disposition grammar (writes/rewrites/reuses), the `::` separator carries any title bytes verbatim, and a prose tail parses as null, never a throw', () => {
  const mod = loadSpecSections()
  assert.strictEqual(typeof mod.parseDisposition, 'function',
    'D2: lib/spec-sections.js does not export parseDisposition(bullet) — the disposition grammar has not been built yet')
  assert.strictEqual(mod.DISPOSITION_APPLIES_FROM, '20260911',
    'D2: lib/spec-sections.js must export the floor DISPOSITION_APPLIES_FROM = "20260911" — a different or missing value means ac-matrix.js\'s --lint gate could apply to the wrong specs')
  const { parseDisposition } = mod

  const reuseBullet = '→ reuses tests/a.test.js :: AC-1: a title with "quotes", [brackets] and (parens)'
  assert.deepStrictEqual(parseDisposition(reuseBullet), {
    kind: 'reuses', file: 'tests/a.test.js',
    prefix: 'AC-1: a title with "quotes", [brackets] and (parens)',
  }, 'D1: a reuses bullet must parse kind/file/prefix exactly — the `::` separator must carry a title\'s quotes, brackets and parens verbatim with no escaping: ' + JSON.stringify(parseDisposition(reuseBullet)))

  const writesBullet = '→ writes tests/b.test.js'
  assert.deepStrictEqual(parseDisposition(writesBullet), { kind: 'writes', file: 'tests/b.test.js', prefix: null },
    'D1: a writes bullet carries no `::` prefix at all — prefix must be null, never an empty string or the file path repeated: ' + JSON.stringify(parseDisposition(writesBullet)))

  const proseTail = '→ the count row in tests/c.test.js'
  assert.strictEqual(parseDisposition(proseTail), null,
    'D2: a tail matching no disposition keyword must parse null, never throw or guess a kind — a spec\'s 1,472 pre-existing arrow-free/prose-tail bullets must stay untouched: ' + JSON.stringify(parseDisposition(proseTail)))

  assert.doesNotThrow(() => parseDisposition(''),
    'D2: parseDisposition must never throw, even on an empty bullet with no arrow tail at all')
  assert.strictEqual(parseDisposition('no arrow tail here at all'), null,
    'a bullet with no arrow tail at all must parse null, matching the 440-arrow-bearing / 1,472-arrow-free split D2 requires stay untouched')

  // D1: a title carrying an arrow needs no escaping. scanning the arrows RIGHT-TO-LEFT and
  // stopping at the FIRST (rightmost) one whose tail matches the disposition grammar skips past
  // the title's own trailing arrow (whose tail is plain prose, no keyword) and lands on the real
  // disposition arrow instead of refusing the whole bullet as null (missing-disposition at lock).
  const arrowInPrefixBullet =
    '→ reuses tests/a.test.js :: AC-1: maps a → b on read'
  assert.deepStrictEqual(parseDisposition(arrowInPrefixBullet), {
    kind: 'reuses', file: 'tests/a.test.js', prefix: 'AC-1: maps a → b on read',
  }, 'D1: a reuses bullet whose title prefix itself contains a `→` must still parse — scanning ' +
    'right-to-left and skipping the title\'s own non-matching trailing arrow finds the real ' +
    'disposition arrow, and the title\'s own arrow must carry into prefix verbatim: ' +
    JSON.stringify(parseDisposition(arrowInPrefixBullet)))

  const arrowThenProseBullet = '→ maps a → b on read'
  assert.strictEqual(parseDisposition(arrowThenProseBullet), null,
    'a bullet whose tail after EVERY `→` occurrence matches no disposition keyword must still ' +
    'parse null — an arrow inside prose is never mistaken for a disposition pointer: ' +
    JSON.stringify(parseDisposition(arrowThenProseBullet)))

  // Regression (specs/20260911/04 fix round 2): a bullet's PROSE may quote an example disposition
  // BEFORE its real trailing pointer. D1 states verbatim the disposition is the bullet's
  // **trailing** `→` pointer — a left-to-right first-match scan instead stops at the quoted
  // example (whose tail also satisfies the grammar, since `prefix` is greedy and swallows
  // everything after `::`, including the real trailing pointer) and reports the wrong disposition
  // entirely, silently dropping the real one.
  const proseQuotesExampleBullet =
    '→ the AC bullet declares → reuses tests/a.test.js :: no such title against a tree ' +
    'that has no such reference → writes tests/b.test.js'
  assert.deepStrictEqual(parseDisposition(proseQuotesExampleBullet), {
    kind: 'writes', file: 'tests/b.test.js', prefix: null,
  }, 'D1: a bullet whose prose quotes an example disposition before its real trailing pointer ' +
    'must parse as the TRAILING pointer, never the quoted example — scanning right-to-left finds ' +
    'the real trailing arrow first: ' + JSON.stringify(parseDisposition(proseQuotesExampleBullet)))
})

function writeDatedSpec(prefix, relSpecPath, content) {
  const dir = tmpdir(prefix)
  const specPath = path.join(dir, relSpecPath)
  fs.mkdirSync(path.dirname(specPath), { recursive: true })
  fs.writeFileSync(specPath, content)
  return { dir, specPath }
}

function specMdAc(acLines) {
  return '# Test Spec\n\n## Acceptance Criteria\n\n' + acLines.join('\n') + '\n'
}

test('AC-20260911-04-2: ac-matrix.js --lint on a spec under specs/20260911/ whose well-formed AC carries no disposition exits 1, prints one HARD missing-disposition line naming the remedy, and its last stdout line reports missingDisposition=1', () => {
  const { specPath } = writeDatedSpec('lint-missing-disp', 'specs/20260911/99-test.md',
    specMdAc(['- **AC-20260911-99-1**: WHEN x runs THE SYSTEM SHALL do y']))
  const res = runNode('scripts/ac-matrix.js', ['--spec', specPath, '--lint'])
  assert.strictEqual(res.status, 1,
    'D3: a well-formed AC bullet in a spec dated on or after DISPOSITION_APPLIES_FROM carrying no disposition must be a hard lint finding, exit 1 — today --lint does not even know this class, so this is genuinely red at HEAD (stdout: ' + res.stdout + ' stderr: ' + res.stderr + ')')
  assert.match(res.stdout,
    /HARD\s+missing-disposition\s+AC-20260911-99-1: no disposition — end the bullet with → writes <file>, → rewrites <file> :: <title>, or → reuses <file> :: <title>/,
    'D3: the finding line must be exactly this remedy text (whitespace aside) — got ' + JSON.stringify(res.stdout))
  const lines = res.stdout.split('\n').filter(Boolean)
  assert.strictEqual(lines[lines.length - 1],
    'ac-matrix: lint malformed=0 invalidPreGreen=0 mixed=0 missingDisposition=1 unresolvedDisposition=0 · 1 finding(s)',
    'D3: the lint summary line must gain the missingDisposition/unresolvedDisposition segments in this exact position and spelling — got ' + JSON.stringify(lines[lines.length - 1]))

  const jsonRes = runNode('scripts/ac-matrix.js', ['--spec', specPath, '--lint', '--json'])
  let out
  assert.doesNotThrow(() => { out = JSON.parse(jsonRes.stdout) }, '--json must print parseable JSON: ' + jsonRes.stdout)
  assert.deepStrictEqual(out.observed.lint,
    { malformed: 0, invalidPreGreen: 0, mixed: 0, missingDisposition: 1, unresolvedDisposition: 0 },
    'D3: --json\'s observed.lint must gain the two new keys alongside the three existing ones — got ' + JSON.stringify(out.observed && out.observed.lint))
})

function writeTestFile(dir, rel, titles) {
  const full = path.join(dir, rel)
  fs.mkdirSync(path.dirname(full), { recursive: true })
  const body = titles.map(t => `test(${JSON.stringify(t)}, () => {})`).join('\n')
  fs.writeFileSync(full, "'use strict'\nconst { test } = require('node:test')\n" + body + '\n')
}

test('AC-20260911-04-3: ac-matrix.js --lint --resolve-root <dir> reports unresolved-disposition naming 0 matches when a reuses reference\'s prefix matches no title, and naming 2 matches when it matches two titles sharing that prefix', () => {
  const zeroDir = tmpdir('resolve-zero')
  writeTestFile(zeroDir, 'tests/a.test.js', ['AC-1: something else'])
  const { specPath: zeroSpec } = writeDatedSpec('resolve-zero-spec', 'specs/20260911/98-test.md',
    specMdAc(['- **AC-20260911-98-1**: WHEN x runs THE SYSTEM SHALL CONTINUE TO y → reuses tests/a.test.js :: no such title']))
  const zeroRes = runNode('scripts/ac-matrix.js', ['--spec', zeroSpec, '--lint', '--resolve-root', zeroDir, '--json'])
  assert.strictEqual(zeroRes.status, 1,
    'D4: a reuses reference matching zero titles in the resolve-root tree must be a hard lint finding — today --resolve-root does not exist at all, so this is genuinely red at HEAD (stdout: ' + zeroRes.stdout + ' stderr: ' + zeroRes.stderr + ')')
  let zeroOut
  assert.doesNotThrow(() => { zeroOut = JSON.parse(zeroRes.stdout) }, '--json must print parseable JSON: ' + zeroRes.stdout)
  const zeroFinding = (zeroOut.findings || []).find(f => f.class === 'unresolved-disposition')
  assert.ok(zeroFinding, 'a zero-match reuses reference must emit an unresolved-disposition finding: ' + JSON.stringify(zeroOut.findings))
  assert.match(zeroFinding.detail, /\b0\b/, 'the detail must name the match count 0: ' + zeroFinding.detail)
  assert.ok(zeroFinding.detail.includes('tests/a.test.js'), 'the detail must name the offending file: ' + zeroFinding.detail)

  const twoDir = tmpdir('resolve-two')
  writeTestFile(twoDir, 'tests/a.test.js', ['AC-1: case one', 'AC-1: case two'])
  const { specPath: twoSpec } = writeDatedSpec('resolve-two-spec', 'specs/20260911/97-test.md',
    specMdAc(['- **AC-20260911-97-1**: WHEN x runs THE SYSTEM SHALL CONTINUE TO y → reuses tests/a.test.js :: AC-1']))
  const twoRes = runNode('scripts/ac-matrix.js', ['--spec', twoSpec, '--lint', '--resolve-root', twoDir, '--json'])
  assert.strictEqual(twoRes.status, 1,
    'D4: a reuses reference matching TWO titles sharing the declared prefix must ALSO be a hard lint finding — an ambiguous reference resolves to no single test (stdout: ' + twoRes.stdout + ' stderr: ' + twoRes.stderr + ')')
  let twoOut
  assert.doesNotThrow(() => { twoOut = JSON.parse(twoRes.stdout) }, '--json must print parseable JSON: ' + twoRes.stdout)
  const twoFinding = (twoOut.findings || []).find(f => f.class === 'unresolved-disposition')
  assert.ok(twoFinding, 'a two-match reuses reference must emit an unresolved-disposition finding: ' + JSON.stringify(twoOut.findings))
  assert.match(twoFinding.detail, /\b2\b/, 'the detail must name the match count 2: ' + twoFinding.detail)
  assert.ok(twoFinding.detail.includes('tests/a.test.js'), 'the detail must name the offending file: ' + twoFinding.detail)
})
