'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { ROOT, tmpdir, gitRepo } = require('../helpers')

// specs/20260908/04-duplicate-window-ratchet.md D1-D4: scripts/dup-windows.js against synthetic
// tmpdir git repos. Owner: AC-20260908-04-1 through AC-20260908-04-6. The standing live-tree pin
// (AC-20260908-04-7) lives in tests/consistency/dup-windows-live.test.js, not here.

const SCRIPT = path.join(ROOT, 'scripts', 'dup-windows.js')

function run(args, opts = {}) {
  return spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8', ...opts })
}

function writeTree(root, files) {
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(root, rel)
    fs.mkdirSync(path.dirname(full), { recursive: true })
    fs.writeFileSync(full, content)
  }
}

// Builds a synthetic repo, commits `tracked` files, then (optionally) writes `untracked` files
// afterward with no `git add` so they never enter the inventory.
function repo(dir, tracked, untracked) {
  const g = gitRepo(dir)
  writeTree(dir, tracked)
  g('add', '-A')
  g('commit', '-q', '-m', 'seed')
  if (untracked) writeTree(dir, untracked)
  return g
}

function writeBaseline(dir, baseline) {
  fs.writeFileSync(path.join(dir, 'dup-baseline.json'), JSON.stringify(baseline, null, 2) + '\n')
}

function readBaseline(dir) {
  return JSON.parse(fs.readFileSync(path.join(dir, 'dup-baseline.json'), 'utf8'))
}

function rawBaseline(dir) {
  return fs.readFileSync(path.join(dir, 'dup-baseline.json'), 'utf8')
}

// Eight distinct, non-blank lines — exactly one duplicate window's worth under D1's W=8.
const BLOCK_A = [
  'const alpha = 1',
  'const bravo = 2',
  'const charlie = 3',
  'const delta = 4',
  'const echo = 5',
  'const foxtrot = 6',
  'const golf = 7',
  'const hotel = 8',
]
const BLOCK_B = [
  'let india = 9',
  'let juliet = 10',
  'let kilo = 11',
  'let lima = 12',
  'let mike = 13',
  'let november = 14',
  'let oscar = 15',
  'let papa = 16',
]

function block(lines) { return lines.join('\n') + '\n' }

// Same tokens as BLOCK_A but each line carries leading indentation and a trailing `//` comment —
// D1's normalizer (strip a trailing `//…` comment, collapse whitespace, trim) must reduce this
// back to BLOCK_A's own normalized text, so the two files' windows still hash equal.
function commented(lines) {
  return lines.map((l, i) => '    ' + l + '   // note ' + i).join('\n') + '\n'
}

const CITE = 'specs/20260909/01-example.md'
function withCite(tracked) {
  return Object.assign({ [CITE]: 'placeholder spec content\n' }, tracked)
}

test('AC-20260908-04-1: two tracked files sharing the same eight consecutive normalized lines each score 1, and sharing only seven of the eight scores both 0', () => {
  const dir = tmpdir('dw-ac1')
  repo(dir, { 'scripts/a.js': block(BLOCK_A), 'scripts/b.js': block(BLOCK_A) })
  writeBaseline(dir, { window: 8, files: { 'scripts/a.js': 1, 'scripts/b.js': 1 }, raises: [] })

  const r = run(['--root', dir])
  assert.strictEqual(r.status, 0,
    'two files whose only eight lines are byte-identical must each score exactly 1 duplicate window, and a baseline recording that score for both must exit 0: ' + r.stderr)

  const nearMiss = tmpdir('dw-ac1-near')
  const almostA = BLOCK_A.slice(0, 7).concat(['const hotel = 999'])
  repo(nearMiss, { 'scripts/a.js': block(BLOCK_A), 'scripts/b.js': block(almostA) })
  writeBaseline(nearMiss, { window: 8, files: { 'scripts/a.js': 1 }, raises: [] })
  const r2 = run(['--root', nearMiss])
  assert.strictEqual(r2.status, 1,
    'sharing seven of the eight lines (one line differs) must NOT count as a duplicate window — a baseline that still records scripts/a.js at 1 is now stale because its only would-be partner no longer matches after the eighth line changed: ' + r2.stderr)
  assert.match(r2.stderr, /stale\s+scripts\/a\.js\s+0\s*<\s*1/,
    'scripts/a.js must report stale with actual 0 once its partner differs in even one of the eight lines — a seven-line match must never be treated as a duplicate window: ' + r2.stderr)
})

test('AC-20260908-04-2: duplicate windows differing only in trailing `//` comments or indentation still count as duplicates, and the finding names the partner as <path>:<line> ≡ <path>:<line>', () => {
  const dir = tmpdir('dw-ac2')
  repo(dir, { 'scripts/plain.js': block(BLOCK_A), 'scripts/decorated.js': commented(BLOCK_A) })
  // Neither file is recorded — since neither actually scores 0, this baseline is intentionally
  // short of the truth so the check is forced to print a finding for both, letting this test
  // read the required partner-naming text off stderr.
  writeBaseline(dir, { window: 8, files: {}, raises: [] })

  const r = run(['--root', dir])
  assert.strictEqual(r.status, 1,
    'comment stripping and whitespace collapse must not defeat the hash — two files whose only windows match after normalization must still fail as new-dup even though their raw bytes differ: ' + r.stderr)
  assert.match(r.stderr, /new-dup\s+scripts\/plain\.js/,
    'scripts/plain.js must be reported as new-dup once its window is found to duplicate scripts/decorated.js\'s window: ' + r.stderr)
  assert.match(r.stderr, /new-dup\s+scripts\/decorated\.js/,
    'scripts/decorated.js — indentation plus a trailing // comment on every line — must still be reported as new-dup: differing only in stripped comment/whitespace text must not hide the duplicate: ' + r.stderr)
  assert.match(r.stderr,
    /(scripts\/plain\.js:1\s*≡\s*scripts\/decorated\.js:1)|(scripts\/decorated\.js:1\s*≡\s*scripts\/plain\.js:1)/,
    'D4: the finding line must name the duplicate\'s partner as "<path>:<line> ≡ <path>:<line>" so the extraction target is visible without a second tool: ' + r.stderr)

  const rj = JSON.parse(run(['--root', dir, '--json']).stdout)
  assert.deepStrictEqual(rj.findings.find(f => f.path === 'scripts/plain.js'),
    { kind: 'new-dup', path: 'scripts/plain.js', actual: 1, ceiling: 0 },
    '--json must classify the unrecorded duplicated file as new-dup with actual 1 (one duplicate window) and ceiling 0 (nothing recorded): ' + JSON.stringify(rj.findings))
})

test('AC-20260908-04-3: the same eight lines appearing twice within one file at different offsets scores that file 2', () => {
  const dir = tmpdir('dw-ac3')
  repo(dir, { 'scripts/repeated.js': block(BLOCK_A) + block(BLOCK_A) })
  writeBaseline(dir, { window: 8, files: { 'scripts/repeated.js': 1 }, raises: [] })

  const r = run(['--root', dir])
  assert.strictEqual(r.status, 1,
    'a baseline recording only 1 duplicate window for a file whose eight lines repeat at a second offset must fail as over — the true score is 2, one for each occurrence of the matching window, so a stale count of 1 must not pass: ' + r.stderr)
  const rj = JSON.parse(run(['--root', dir, '--json']).stdout)
  assert.deepStrictEqual(rj.findings.find(f => f.path === 'scripts/repeated.js'),
    { kind: 'over', path: 'scripts/repeated.js', actual: 2, ceiling: 1 },
    "repeating the same eight lines at a second, non-overlapping offset inside one file must score that file 2 (both occurrences of the matching window count), never 1: " + JSON.stringify(rj.findings))
})

test('AC-20260908-04-4: a recorded score below the actual is over, above the actual is stale, an unrecorded scoring file is new-dup, and a fully matching baseline exits 0', () => {
  const overDir = tmpdir('dw-ac4-over')
  repo(overDir, { 'scripts/a.js': block(BLOCK_A), 'scripts/b.js': block(BLOCK_A) })
  writeBaseline(overDir, { window: 8, files: { 'scripts/a.js': 0, 'scripts/b.js': 1 }, raises: [] })
  const rOver = run(['--root', overDir])
  assert.strictEqual(rOver.status, 1,
    'a file whose actual score (1) exceeds its recorded score (0) must exit 1 as over: ' + rOver.stderr)
  assert.match(rOver.stderr, /over\s+scripts\/a\.js\s+1\s*>\s*0/,
    'the over finding must show "<actual> > <ceiling>" on the finding line: ' + rOver.stderr)

  const staleDir = tmpdir('dw-ac4-stale')
  repo(staleDir, { 'scripts/a.js': block(BLOCK_A), 'scripts/b.js': block(BLOCK_A) })
  writeBaseline(staleDir, { window: 8, files: { 'scripts/a.js': 2, 'scripts/b.js': 1 }, raises: [] })
  const rStale = run(['--root', staleDir])
  assert.strictEqual(rStale.status, 1,
    'a file whose actual score (1) is below its recorded score (2) must exit 1 as stale: ' + rStale.stderr)
  assert.match(rStale.stderr, /stale\s+scripts\/a\.js\s+1\s*<\s*2/,
    'the stale finding must show "<actual> < <ceiling>" on the finding line: ' + rStale.stderr)

  const newDir = tmpdir('dw-ac4-new')
  repo(newDir, { 'scripts/a.js': block(BLOCK_A), 'scripts/b.js': block(BLOCK_A) })
  writeBaseline(newDir, { window: 8, files: { 'scripts/b.js': 1 }, raises: [] })
  const rNew = run(['--root', newDir])
  assert.strictEqual(rNew.status, 1,
    'an unrecorded file scoring above 0 must exit 1 as new-dup even though its duplicate partner is correctly recorded: ' + rNew.stderr)
  assert.match(rNew.stderr, /new-dup\s+scripts\/a\.js/,
    'the new-dup finding must name the unrecorded file: ' + rNew.stderr)

  const tightDir = tmpdir('dw-ac4-tight')
  repo(tightDir, { 'scripts/a.js': block(BLOCK_A), 'scripts/b.js': block(BLOCK_A) })
  writeBaseline(tightDir, { window: 8, files: { 'scripts/a.js': 1, 'scripts/b.js': 1 }, raises: [] })
  const rTight = run(['--root', tightDir])
  assert.strictEqual(rTight.status, 0,
    'every recorded score matching its actual, with no unrecorded file scoring above 0, must exit 0 — the check must not manufacture a finding where none exists: ' + rTight.stderr)
})

test('AC-20260908-04-5: --update with no over or new-dup lowers stale scores, drops entries at 0 or untracked, and rewrites the baseline so a following check exits 0', () => {
  const dir = tmpdir('dw-ac5')
  repo(dir, { 'scripts/a.js': block(BLOCK_A), 'scripts/b.js': block(BLOCK_A), 'scripts/c.js': block(BLOCK_B) })
  writeBaseline(dir, {
    window: 8,
    files: { 'scripts/a.js': 3, 'scripts/b.js': 1, 'scripts/c.js': 0, 'scripts/gone.js': 4 },
    raises: []
  })

  const r = run(['--root', dir, '--update'])
  assert.strictEqual(r.status, 0,
    '--update must succeed when nothing is over or new-dup, even with a stale score, a zero-score entry, and an untracked entry present: ' + r.stderr)

  const baseline = readBaseline(dir)
  assert.deepStrictEqual(baseline.files, { 'scripts/a.js': 1, 'scripts/b.js': 1 },
    '--update must lower the stale scripts/a.js score to its actual 1, and must drop both the zero-score scripts/c.js entry and the untracked scripts/gone.js entry entirely — D2 says a file with zero duplicates needs no entry: ' + JSON.stringify(baseline.files))

  const r2 = run(['--root', dir])
  assert.strictEqual(r2.status, 0,
    'a check run immediately after --update must exit 0 — if it does not, --update wrote a baseline it cannot itself satisfy: ' + r2.stderr)
})

test('AC-20260908-04-5: --update refuses and leaves the baseline byte-for-byte unchanged when any file is over or new-dup', () => {
  const overDir = tmpdir('dw-ac5-refuse-over')
  repo(overDir, { 'scripts/a.js': block(BLOCK_A), 'scripts/b.js': block(BLOCK_A) })
  writeBaseline(overDir, { window: 8, files: { 'scripts/a.js': 0, 'scripts/b.js': 1 }, raises: [] })
  const beforeOver = rawBaseline(overDir)
  const rOver = run(['--root', overDir, '--update'])
  assert.strictEqual(rOver.status, 1,
    '--update must refuse (exit 1) while any file is over its recorded score — silently rewriting past growth is exactly the loophole D3 closes: ' + rOver.stderr)
  assert.match(rOver.stderr, /over\s+scripts\/a\.js/,
    'the refusal must name the over finding that caused it, not merely exit 1 for an unrelated reason (a missing script also exits 1, which must not be mistaken for a real refusal): ' + rOver.stderr)
  assert.strictEqual(rawBaseline(overDir), beforeOver,
    '--update must leave the baseline byte-for-byte unchanged when refusing on an over finding: ' + rawBaseline(overDir))

  const newDir = tmpdir('dw-ac5-refuse-new')
  repo(newDir, { 'scripts/a.js': block(BLOCK_A), 'scripts/b.js': block(BLOCK_A) })
  writeBaseline(newDir, { window: 8, files: { 'scripts/b.js': 1 }, raises: [] })
  const beforeNew = rawBaseline(newDir)
  const rNew = run(['--root', newDir, '--update'])
  assert.strictEqual(rNew.status, 1,
    '--update must also refuse when an unrecorded file scores above 0 (new-dup) — D3 names both over and new-dup as refusal triggers, not over alone: ' + rNew.stderr)
  assert.match(rNew.stderr, /new-dup\s+scripts\/a\.js/,
    'the refusal must name the new-dup finding that caused it, not merely exit 1 for an unrelated reason: ' + rNew.stderr)
  assert.strictEqual(rawBaseline(newDir), beforeNew,
    '--update must leave the baseline byte-for-byte unchanged when refusing on a new-dup finding: ' + rawBaseline(newDir))
})

test('AC-20260908-04-6: --raise sets the named score and appends {path, from, to, cite} to raises[] when --cite names an existing specs/YYYYMMDD/NN-* file', () => {
  const dir = tmpdir('dw-ac6')
  repo(dir, withCite({ 'scripts/a.js': block(BLOCK_A) }))
  writeBaseline(dir, { window: 8, files: { 'scripts/a.js': 1 }, raises: [] })

  const rRaise = run(['--root', dir, '--raise', 'scripts/a.js', '--to', '5', '--cite', CITE])
  assert.strictEqual(rRaise.status, 0,
    'a --raise with an existing, correctly-shaped --cite must succeed: ' + rRaise.stderr)
  const after = readBaseline(dir)
  assert.strictEqual(after.files['scripts/a.js'], 5,
    '--raise must set the named file score to exactly --to: ' + after.files['scripts/a.js'])
  assert.deepStrictEqual(after.raises, [{ path: 'scripts/a.js', from: 1, to: 5, cite: CITE }],
    '--raise must append {path, from, to, cite} to raises[] so review can see who asked for the growth: ' + JSON.stringify(after.raises))
})

test('AC-20260908-04-6: --raise with a missing, nonexistent, or wrongly-shaped --cite exits 2 and leaves the baseline byte-for-byte unchanged', () => {
  const dir = tmpdir('dw-ac6-bad')
  repo(dir, withCite({ 'scripts/a.js': block(BLOCK_A), 'notes.md': 'not a spec\n' }))
  writeBaseline(dir, { window: 8, files: { 'scripts/a.js': 1 }, raises: [] })
  const before = rawBaseline(dir)

  const rMissing = run(['--root', dir, '--raise', 'scripts/a.js', '--to', '5'])
  assert.strictEqual(rMissing.status, 2,
    '--raise with no --cite at all must be a bad invocation (exit 2), never an unattributed raise: ' + rMissing.stderr)

  const rNonexistent = run(['--root', dir, '--raise', 'scripts/a.js', '--to', '5', '--cite', 'specs/20260909/99-nope.md'])
  assert.strictEqual(rNonexistent.status, 2,
    '--raise citing a spec file that does not exist must exit 2: ' + rNonexistent.stderr)

  const rWrongShape = run(['--root', dir, '--raise', 'scripts/a.js', '--to', '5', '--cite', 'notes.md'])
  assert.strictEqual(rWrongShape.status, 2,
    '--raise citing a file that exists but does not match ^specs/\\d{8}/\\d{2}- must still exit 2 — existence alone is not enough: ' + rWrongShape.stderr)

  assert.strictEqual(rawBaseline(dir), before,
    'every rejected --raise above must leave the baseline byte-for-byte unchanged: ' + rawBaseline(dir))
})
