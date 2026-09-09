'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { ROOT, tmpdir, gitRepo } = require('../helpers')

// specs/20260908/01-size-ratchet.md D1-D8: scripts/size-ratchet.js against synthetic tmpdir
// git repos. Owner: AC-20260908-01-1 through AC-20260908-01-8. The standing live-tree pin
// (AC-20260908-01-9) lives in tests/consistency/size-ratchet-live.test.js, not here.

const SCRIPT = path.join(ROOT, 'scripts', 'size-ratchet.js')

function run(args, opts = {}) {
  return spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8', ...opts })
}

function sized(n) { return 'x'.repeat(n) }

function writeTree(root, files) {
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(root, rel)
    fs.mkdirSync(path.dirname(full), { recursive: true })
    fs.writeFileSync(full, content)
  }
}

// Builds a synthetic repo, commits `tracked` files, then (optionally) writes `untracked`
// files afterward with no `git add` so they never enter the inventory.
function repo(dir, tracked, untracked) {
  const g = gitRepo(dir)
  writeTree(dir, tracked)
  g('add', '-A')
  g('commit', '-q', '-m', 'seed')
  if (untracked) writeTree(dir, untracked)
  return g
}

function writeBaseline(dir, baseline) {
  fs.writeFileSync(path.join(dir, 'size-baseline.json'), JSON.stringify(baseline, null, 2) + '\n')
}

function readBaseline(dir) {
  return JSON.parse(fs.readFileSync(path.join(dir, 'size-baseline.json'), 'utf8'))
}

function rawBaseline(dir) {
  return fs.readFileSync(path.join(dir, 'size-baseline.json'), 'utf8')
}

test('AC-20260908-01-1: a baseline recording every tracked file and tree at its exact size exits 0 and reports the count as all tight', () => {
  const dir = tmpdir('sr-ac1')
  repo(dir, { 'tests/a.txt': sized(10), 'tests/b.txt': sized(20) })
  writeBaseline(dir, {
    newFileCap: 40000,
    trees: { 'spec/scripts': 0, 'spec/scripts/lib': 0, scripts: 0, tests: 30 },
    files: { 'tests/a.txt': 10, 'tests/b.txt': 20 },
    raises: []
  })

  const r = run(['--root', dir])
  assert.strictEqual(r.status, 0,
    'a baseline whose every ceiling equals the tracked file/tree it names must exit 0 — a nonzero exit means the checker is reporting drift where none exists: ' + r.stderr)
  assert.match(r.stdout, /size-ratchet: 2 files, 4 trees, all tight/,
    'the summary line must name the exact file and tree counts and say "all tight" so a caller can trust exit 0 without re-deriving the counts itself: ' + r.stdout)
})

test('AC-20260908-01-2: a tracked file larger than its recorded ceiling exits 1, names the over finding on stderr with the raise remedy, and lists it under --json', () => {
  const dir = tmpdir('sr-ac2')
  repo(dir, { 'spec/scripts/x.js': sized(120) })
  writeBaseline(dir, {
    newFileCap: 40000,
    trees: { 'spec/scripts': 120, 'spec/scripts/lib': 0, scripts: 0, tests: 0 },
    files: { 'spec/scripts/x.js': 100 },
    raises: []
  })

  const r = run(['--root', dir])
  assert.strictEqual(r.status, 1,
    'a file over its ceiling must fail the check (exit 1) — a zero exit would let growth through the gate silently: ' + r.stderr)
  assert.match(r.stderr, /over\s+spec\/scripts\/x\.js\s+120\s*>\s*100/,
    'the over finding must name the path with "<actual> > <ceiling>" so the remedy is obvious from the line alone: ' + r.stderr)
  assert.match(r.stderr, /--raise[^\n]*spec\/scripts\/x\.js[^\n]*--to[^\n]*--cite/,
    'the finding must print the --raise ... --cite remedy command, not just the numbers, or a worker has to go look it up: ' + r.stderr)

  const rj = run(['--root', dir, '--json'])
  const parsed = JSON.parse(rj.stdout)
  assert.deepStrictEqual(
    parsed.findings.find(f => f.path === 'spec/scripts/x.js'),
    { kind: 'over', path: 'spec/scripts/x.js', actual: 120, ceiling: 100 },
    '--json must list the same over finding with kind/path/actual/ceiling so tooling never has to parse the text line: ' + rj.stdout)
})

test('AC-20260908-01-3: a stale ceiling above the actual size, and a baseline entry no longer tracked, both exit 1 naming the update remedy', () => {
  const dir = tmpdir('sr-ac3')
  repo(dir, { 'tests/s.txt': sized(80) })
  writeBaseline(dir, {
    newFileCap: 40000,
    trees: { 'spec/scripts': 0, 'spec/scripts/lib': 0, scripts: 0, tests: 80 },
    files: { 'tests/s.txt': 100, 'tests/deleted.txt': 50 },
    raises: []
  })

  const r = run(['--root', dir])
  assert.strictEqual(r.status, 1,
    'a stale ceiling (recorded above actual) must fail the check, not pass silently as slack: ' + r.stderr)
  assert.match(r.stderr, /stale\s+tests\/s\.txt\s+80\s*<\s*100/,
    'the stale finding for a shrunk file must show "<actual> < <ceiling>": ' + r.stderr)
  assert.match(r.stderr, /stale\s+tests\/deleted\.txt\s+0\s*<\s*50/,
    'a baseline entry for a file no longer tracked must report as stale with actual 0, never be silently dropped from the report: ' + r.stderr)
  assert.match(r.stderr, /--update/,
    'every stale finding must name the --update remedy: ' + r.stderr)

  const rj = run(['--root', dir, '--json'])
  const parsed = JSON.parse(rj.stdout)
  assert.deepStrictEqual(parsed.findings.find(f => f.path === 'tests/s.txt'),
    { kind: 'stale', path: 'tests/s.txt', actual: 80, ceiling: 100 },
    '--json must carry the shrunk-file stale finding with its real actual size: ' + rj.stdout)
  assert.deepStrictEqual(parsed.findings.find(f => f.path === 'tests/deleted.txt'),
    { kind: 'stale', path: 'tests/deleted.txt', actual: 0, ceiling: 50 },
    '--json must carry the deleted-file stale finding with actual 0, proving deletions are never dropped silently: ' + rj.stdout)
})

test('AC-20260908-01-3: a tree ceiling recorded above its real sum is stale and fails the check even when every file ceiling is tight', () => {
  const dir = tmpdir('sr-ac3-stale-tree')
  repo(dir, { 'tests/a.txt': sized(50) })
  writeBaseline(dir, {
    newFileCap: 40000,
    trees: { 'spec/scripts': 0, 'spec/scripts/lib': 0, scripts: 0, tests: 100 },
    files: { 'tests/a.txt': 50 },
    raises: []
  })

  const r = run(['--root', dir])
  assert.strictEqual(r.status, 1,
    "D2: exit 0 only when every tree ceiling equals its tree sum — a tree ceiling recorded above the real sum is slack that must fail the check, not pass silently: " + r.stderr)
  assert.match(r.stderr, /stale\s+tests\s+50\s*<\s*100/,
    'the stale tree finding must show "<actual sum> < <recorded ceiling>" the same way a stale file finding does: ' + r.stderr)
  assert.match(r.stderr, /--update/,
    'the stale tree finding must name the --update remedy: ' + r.stderr)

  const rj = JSON.parse(run(['--root', dir, '--json']).stdout)
  assert.deepStrictEqual(rj.findings.find(f => f.path === 'tests'),
    { kind: 'stale', path: 'tests', actual: 50, ceiling: 100 },
    '--json must carry the stale tree finding keyed by the tree name, with the real sum as actual: ' + JSON.stringify(rj.findings))
})

test('no AC (D5: unreadable/non-object baseline is a bad invocation): a malformed baseline missing files, trees, or newFileCap exits 2, and --update over a valid baseline always writes newFileCap back', () => {
  for (const missingKey of ['files', 'trees', 'newFileCap']) {
    const dir = tmpdir('sr-d5-malformed-' + missingKey)
    repo(dir, { 'tests/a.txt': sized(10) })
    const baseline = { newFileCap: 40000, trees: { 'spec/scripts': 0, 'spec/scripts/lib': 0, scripts: 0, tests: 10 }, files: { 'tests/a.txt': 10 }, raises: [] }
    delete baseline[missingKey]
    writeBaseline(dir, baseline)

    const r = run(['--root', dir])
    assert.strictEqual(r.status, 2,
      `D5: a baseline object missing "${missingKey}" is structurally unreadable and must be a bad invocation (exit 2), never processed as an empty-but-valid baseline: ` + r.stderr)
  }

  const dir = tmpdir('sr-d5-update-keeps-cap')
  repo(dir, { 'tests/a.txt': sized(10) })
  writeBaseline(dir, {
    newFileCap: 40000,
    trees: { 'spec/scripts': 0, 'spec/scripts/lib': 0, scripts: 0, tests: 10 },
    files: { 'tests/a.txt': 10 },
    raises: []
  })
  run(['--root', dir, '--update'])
  const updated = readBaseline(dir)
  assert.strictEqual(updated.newFileCap, 40000,
    '--update over a valid baseline must always write newFileCap back — dropping the key on rewrite would permanently disable the cap: ' + JSON.stringify(updated))
})

test('AC-20260908-01-4: a tree-over finding reports the true uncapped sum of its files, and applying the printed --raise remedy verbatim clears the check', () => {
  const dir = tmpdir('sr-ac4-tree-true-sum')
  repo(dir, {
    'specs/20260909/01-example.md': sized(5),
    'tests/a.txt': sized(45000),
    'tests/b.txt': sized(130)
  })
  writeBaseline(dir, {
    newFileCap: 40000,
    trees: { 'spec/scripts': 0, 'spec/scripts/lib': 0, scripts: 0, tests: 130 },
    files: { 'tests/a.txt': 45000, 'tests/b.txt': 130 },
    raises: []
  })

  const r = run(['--root', dir])
  assert.strictEqual(r.status, 1,
    'two tight files summing to 45130 against a tree ceiling of 130 must fail as tree-over: ' + r.stderr)
  const before = JSON.parse(run(['--root', dir, '--json']).stdout)
  assert.deepStrictEqual(before.findings.find(f => f.kind === 'tree-over'),
    { kind: 'tree-over', path: 'tests', actual: 45130, ceiling: 130 },
    "the tree-over finding's actual must be the true sum of every file's actual size (45130), never a per-file min(actual, ceiling)-capped number that understates how far over the tree really is: " + JSON.stringify(before.findings))
  assert.match(r.stderr, /--raise\s+tests\s+--to\s+45130\s+--cite/,
    'the printed remedy must offer to raise the tree to the TRUE sum (45130), not a capped, understated value: ' + r.stderr)

  const rRaise = run(['--root', dir, '--raise', 'tests', '--to', '45130', '--cite', 'specs/20260909/01-example.md'])
  assert.strictEqual(rRaise.status, 0,
    'applying the printed remedy must itself succeed: ' + rRaise.stderr)
  const rCheck = run(['--root', dir])
  assert.strictEqual(rCheck.status, 0,
    'applying the tree-over finding\'s own printed --raise remedy verbatim must clear the check to exit 0 — if a capped "actual" was printed instead, this raise would be insufficient and the check would still fail: ' + rCheck.stderr)
})

test('AC-20260908-01-4: a new file over newFileCap exits 1 as new-over-cap, and a new file under cap that pushes a tree over exits 1 as tree-over', () => {
  const capDir = tmpdir('sr-ac4-cap')
  repo(capDir, { 'tests/fixtures/big.md': sized(45000) })
  writeBaseline(capDir, {
    newFileCap: 40000,
    trees: { 'spec/scripts': 0, 'spec/scripts/lib': 0, scripts: 0, tests: 45000 },
    files: {},
    raises: []
  })
  const rCap = run(['--root', capDir])
  assert.strictEqual(rCap.status, 1,
    'a new file over newFileCap must fail the check regardless of tree headroom: ' + rCap.stderr)
  assert.match(rCap.stderr, /new-over-cap\s+tests\/fixtures\/big\.md\s+45000\s*>\s*40000/,
    'the new-over-cap finding must name the path with "<actual> > <newFileCap>": ' + rCap.stderr)
  const rCapJson = JSON.parse(run(['--root', capDir, '--json']).stdout)
  assert.deepStrictEqual(rCapJson.findings.find(f => f.path === 'tests/fixtures/big.md'),
    { kind: 'new-over-cap', path: 'tests/fixtures/big.md', actual: 45000, ceiling: 40000 },
    '--json must classify the oversized new file as new-over-cap, not over (it has no recorded ceiling to be over): ' + JSON.stringify(rCapJson))

  const treeDir = tmpdir('sr-ac4-tree')
  repo(treeDir, { 'tests/a.txt': sized(30), 'tests/b.txt': sized(1000) })
  writeBaseline(treeDir, {
    newFileCap: 40000,
    trees: { 'spec/scripts': 0, 'spec/scripts/lib': 0, scripts: 0, tests: 30 },
    files: { 'tests/a.txt': 30 },
    raises: []
  })
  const rTree = run(['--root', treeDir])
  assert.strictEqual(rTree.status, 1,
    'a new file within the cap that still pushes its tree over its ceiling must fail the check — the anti-split rule has no per-file exemption: ' + rTree.stderr)
  assert.match(rTree.stderr, /tree-over\s+tests\s+1030\s*>\s*30/,
    'the tree-over finding must name the tree with the summed "<actual> > <ceiling>": ' + rTree.stderr)
  const rTreeJson = JSON.parse(run(['--root', treeDir, '--json']).stdout)
  assert.deepStrictEqual(rTreeJson.findings.find(f => f.kind === 'tree-over'),
    { kind: 'tree-over', path: 'tests', actual: 1030, ceiling: 30 },
    '--json must key the tree-over finding\'s path as the tree name, not a file path: ' + JSON.stringify(rTreeJson))
})

test('AC-20260908-01-5: --update with no over/new-over-cap/tree-over finding lowers stale ceilings, adds new files at actual size, and drops untracked entries', () => {
  const dir = tmpdir('sr-ac5')
  repo(dir, { 'tests/s.txt': sized(80), 'tests/new.txt': sized(500) })
  writeBaseline(dir, {
    newFileCap: 40000,
    trees: { 'spec/scripts': 0, 'spec/scripts/lib': 0, scripts: 0, tests: 1000 },
    files: { 'tests/s.txt': 100, 'tests/gone.txt': 20 },
    raises: []
  })

  const r = run(['--root', dir, '--update'])
  assert.strictEqual(r.status, 0,
    '--update must succeed when nothing is over or tree-over, even with stale ceilings and untracked entries present: ' + r.stderr)

  const baseline = readBaseline(dir)
  assert.deepStrictEqual(baseline.files, { 'tests/s.txt': 80, 'tests/new.txt': 500 },
    '--update must lower the stale ceiling to the actual size, add the new file at its actual size, and drop the untracked entry entirely: ' + JSON.stringify(baseline.files))
  assert.strictEqual(baseline.trees.tests, 580,
    '--update must set the tests tree ceiling to the new tracked sum (80 + 500), never leave the old stale sum in place: ' + baseline.trees.tests)

  const r2 = run(['--root', dir])
  assert.strictEqual(r2.status, 0,
    'a check run immediately after --update must exit 0 — if it does not, --update wrote a baseline it cannot itself satisfy: ' + r2.stderr)
  assert.match(r2.stdout, /2 files, 4 trees, all tight/,
    'the post-update check must report the rewritten baseline as fully tight: ' + r2.stdout)
})

test('AC-20260908-01-5: --update against a repo with no size-baseline.json seeds a fresh baseline (D8) at exit 0, every file and tree at its exact actual value', () => {
  const dir = tmpdir('sr-ac5-seed')
  repo(dir, { 'tests/a.txt': sized(30), 'tests/b.txt': sized(20), 'spec/scripts/x.js': sized(50) })
  assert.strictEqual(fs.existsSync(path.join(dir, 'size-baseline.json')), false,
    'this fixture must start with no baseline file on disk — it pins the seed path D8 requires, not an update to a baseline that already exists')

  const r = run(['--root', dir, '--update'])
  assert.strictEqual(r.status, 0,
    '--update must seed a fresh baseline from nothing and exit 0 — D8 makes this the only sanctioned producer of size-baseline.json, never a hand-typed file: ' + r.stderr)

  const baseline = readBaseline(dir)
  assert.strictEqual(baseline.newFileCap, 40000,
    'a freshly seeded baseline must carry newFileCap 40000 per D6 even though no prior baseline existed to read it from: ' + baseline.newFileCap)
  assert.deepStrictEqual(baseline.files, { 'tests/a.txt': 30, 'tests/b.txt': 20, 'spec/scripts/x.js': 50 },
    'every tracked file must be seeded at its exact actual size: ' + JSON.stringify(baseline.files))
  assert.deepStrictEqual(baseline.trees, { 'spec/scripts': 50, 'spec/scripts/lib': 0, scripts: 0, tests: 50 },
    'every tree ceiling, including the two roots with no tracked files, must be seeded at its exact tracked sum: ' + JSON.stringify(baseline.trees))
  assert.deepStrictEqual(baseline.raises, [],
    'a freshly seeded baseline must start with an empty raises[] — nothing has been raised against it yet: ' + JSON.stringify(baseline.raises))
})

test('AC-20260908-01-5: a freshly seeded baseline is tight by construction — the following check exits 0 and re-running --update is a byte-identical no-op', () => {
  const dir = tmpdir('sr-ac5-seed-idempotent')
  repo(dir, { 'tests/a.txt': sized(30), 'spec/scripts/x.js': sized(50) })

  const rSeed = run(['--root', dir, '--update'])
  assert.strictEqual(rSeed.status, 0,
    'the initial seed against an absent baseline must succeed: ' + rSeed.stderr)
  const seeded = rawBaseline(dir)

  const rCheck = run(['--root', dir])
  assert.strictEqual(rCheck.status, 0,
    'a plain check run immediately after seeding must exit 0 — a freshly written baseline that cannot pass its own check was not actually seeded tight: ' + rCheck.stderr)

  const rReupdate = run(['--root', dir, '--update'])
  assert.strictEqual(rReupdate.status, 0,
    're-running --update against an already-tight seeded baseline must still succeed: ' + rReupdate.stderr)
  const reupdated = rawBaseline(dir)
  assert.strictEqual(reupdated, seeded,
    're-running --update against a baseline that is already tight must be a byte-identical no-op — any diff here means the seed was not actually stable: ' + reupdated)
})

test('AC-20260908-01-5: a from-scratch seed records a tracked file over newFileCap at its actual size and still exits 0 (D13: new-over-cap cannot arise on a seed)', () => {
  const dir = tmpdir('sr-ac5-seed-over-cap')
  repo(dir, { 'tests/fixtures/big.md': sized(45000) })
  const baselinePath = path.join(dir, 'size-baseline.json')
  assert.strictEqual(fs.existsSync(baselinePath), false,
    'this fixture must start with no baseline file on disk — it pins the from-scratch seed path')

  const r = run(['--root', dir, '--update'])
  assert.strictEqual(r.status, 0,
    "D13: a from-scratch seed must succeed even when a tracked file already exceeds newFileCap — new-over-cap only applies to a file absent from an EXISTING baseline, and there is no existing baseline on a seed: " + r.stderr)

  const baseline = readBaseline(dir)
  assert.strictEqual(baseline.files['tests/fixtures/big.md'], 45000,
    'the seeded baseline must record the over-cap file at its exact actual size, the same way the spec\'s own Contracts example records genesis-driver.js at 124092 with no raises[] behind it: ' + JSON.stringify(baseline.files))
  assert.strictEqual(baseline.trees.tests, 45000,
    'the tests tree ceiling must include the over-cap file\'s bytes in its seeded sum: ' + baseline.trees.tests)

  const r2 = run(['--root', dir])
  assert.strictEqual(r2.status, 0,
    'a check run immediately after this seed must exit 0 — the seed is tight by construction regardless of newFileCap: ' + r2.stderr)
})

test('AC-20260908-01-6: --update against an EXISTING baseline refuses when a newly added tracked file exceeds newFileCap, and leaves the baseline byte-for-byte unchanged', () => {
  const dir = tmpdir('sr-ac6-existing-new-over-cap')
  repo(dir, { 'tests/a.txt': sized(30), 'tests/fixtures/big.md': sized(45000) })
  writeBaseline(dir, {
    newFileCap: 40000,
    trees: { 'spec/scripts': 0, 'spec/scripts/lib': 0, scripts: 0, tests: 30 },
    files: { 'tests/a.txt': 30 },
    raises: []
  })
  const before = rawBaseline(dir)

  const r = run(['--root', dir, '--update'])
  assert.strictEqual(r.status, 1,
    'D13 only exempts a from-scratch seed — a newly tracked file exceeding newFileCap against a baseline that already exists must still refuse --update: ' + r.stderr)
  assert.match(r.stderr, /tests\/fixtures\/big\.md/,
    'the refusal must name the new over-cap path: ' + r.stderr)

  const after = rawBaseline(dir)
  assert.strictEqual(after, before,
    '--update must leave the existing baseline byte-for-byte unchanged on this refusal, exactly like the over/tree-over refusals: ' + after)
})

test('AC-20260908-01-6: --update refuses and leaves the baseline byte-for-byte unchanged when a file is over or a tree is tree-over', () => {
  const dir = tmpdir('sr-ac6')
  repo(dir, { 'spec/scripts/x.js': sized(120) })
  writeBaseline(dir, {
    newFileCap: 40000,
    trees: { 'spec/scripts': 120, 'spec/scripts/lib': 0, scripts: 0, tests: 0 },
    files: { 'spec/scripts/x.js': 100 },
    raises: []
  })
  const before = rawBaseline(dir)

  const r = run(['--root', dir, '--update'])
  assert.strictEqual(r.status, 1,
    '--update must refuse (exit 1) while any file is over its ceiling — silently updating past growth is exactly the loophole this gate closes: ' + r.stderr)
  assert.match(r.stderr, /over\s+spec\/scripts\/x\.js\s+120\s*>\s*100/,
    'the refusal must name the over finding that caused it, not merely exit 1 for an unrelated reason (a missing script also exits 1 by crashing, which must not be mistaken for a real refusal): ' + r.stderr)

  const after = rawBaseline(dir)
  assert.strictEqual(after, before,
    '--update must leave the baseline byte-for-byte unchanged on refusal — any diff here means growth landed through --update: ' + after)
})

test('AC-20260908-01-6: --update refuses when git ls-files still lists a path that a plain rm removed from disk, and leaves the baseline byte-for-byte unchanged', () => {
  const dir = tmpdir('sr-ac6-tracked-missing')
  const g = repo(dir, { 'tests/a.txt': sized(30), 'tests/gone.txt': sized(20) })
  writeBaseline(dir, {
    newFileCap: 40000,
    trees: { 'spec/scripts': 0, 'spec/scripts/lib': 0, scripts: 0, tests: 50 },
    files: { 'tests/a.txt': 30, 'tests/gone.txt': 20 },
    raises: []
  })
  fs.rmSync(path.join(dir, 'tests', 'gone.txt'))
  assert.ok(g('ls-files').split('\n').includes('tests/gone.txt'),
    'this fixture must remove the file with a plain rm, not git rm, so git ls-files still lists it as tracked — that is the exact gap between "gone from disk" and "gone from the index" the new guard exists to catch')
  const before = rawBaseline(dir)

  const r = run(['--root', dir, '--update'])
  assert.strictEqual(r.status, 1,
    '--update must refuse when a path git still tracks is missing from disk — silently dropping it from files[] and lowering its tree ceiling would let a still-tracked file fall out of the budget with no git-level trace of the removal: ' + r.stderr)
  assert.match(r.stderr, /tests\/gone\.txt/,
    'the refusal must name the tracked-but-missing path: ' + r.stderr)
  assert.match(r.stderr, /tracked/i,
    'the refusal must say the path is tracked but missing from disk, not just print a bare path with no reason: ' + r.stderr)
  const after = rawBaseline(dir)
  assert.strictEqual(after, before,
    '--update must leave the baseline byte-for-byte unchanged when refusing on a tracked-but-missing path: ' + after)

  g('rm', '-q', 'tests/gone.txt')
  const rAfterGitRm = run(['--root', dir, '--update'])
  assert.strictEqual(rAfterGitRm.status, 0,
    'once the path is actually removed from git (not just the working tree), --update must succeed — the guard exists for the gap between disk and the index, not for every deletion: ' + rAfterGitRm.stderr)
  const updated = readBaseline(dir)
  assert.strictEqual(updated.files['tests/gone.txt'], undefined,
    'after a real git rm, the file must be dropped from files[] entirely: ' + JSON.stringify(updated.files))
  assert.strictEqual(updated.trees.tests, 30,
    'after a real git rm, the tests tree ceiling must drop to the sum of what remains tracked (30): ' + updated.trees.tests)
  const rCheck = run(['--root', dir])
  assert.strictEqual(rCheck.status, 0,
    'a check run immediately after this --update must exit 0: ' + rCheck.stderr)
})

test('AC-20260908-01-5: a from-scratch seed also refuses when a tracked-but-missing path is present, and writes no baseline at all', () => {
  const dir = tmpdir('sr-ac5-seed-tracked-missing')
  const g = repo(dir, { 'tests/a.txt': sized(30), 'tests/gone.txt': sized(20) })
  fs.rmSync(path.join(dir, 'tests', 'gone.txt'))
  assert.ok(g('ls-files').split('\n').includes('tests/gone.txt'),
    'this fixture must remove the file with a plain rm, not git rm, so git ls-files still lists it as tracked')
  const baselinePath = path.join(dir, 'size-baseline.json')
  assert.strictEqual(fs.existsSync(baselinePath), false,
    'this fixture must start with no baseline file on disk — it pins the guard on the from-scratch seed path')

  const r = run(['--root', dir, '--update'])
  assert.strictEqual(r.status, 1,
    'the from-scratch seed must refuse exactly like an update against an existing baseline when a tracked path is missing from disk — the guard is not specific to the existing-baseline path: ' + r.stderr)
  assert.match(r.stderr, /tests\/gone\.txt/,
    'the refusal must name the tracked-but-missing path even on a seed: ' + r.stderr)
  assert.strictEqual(fs.existsSync(baselinePath), false,
    'a refused from-scratch seed must write no baseline file at all: ' + baselinePath)
})

test('AC-20260908-01-7: --raise sets one ceiling to the given value and records the raise, but only when --cite names an existing specs/YYYYMMDD/NN-* file', () => {
  const dir = tmpdir('sr-ac7')
  repo(dir, {
    'spec/scripts/y.js': sized(100),
    'tests/a.txt': sized(30),
    'specs/20260909/01-example.md': sized(5)
  })
  writeBaseline(dir, {
    newFileCap: 40000,
    trees: { 'spec/scripts': 100, 'spec/scripts/lib': 0, scripts: 0, tests: 30 },
    files: { 'spec/scripts/y.js': 100, 'tests/a.txt': 30 },
    raises: []
  })

  const rRaise = run(['--root', dir, '--raise', 'spec/scripts/y.js', '--to', '150', '--cite', 'specs/20260909/01-example.md'])
  assert.strictEqual(rRaise.status, 0,
    'a --raise with an existing, correctly-shaped --cite must succeed: ' + rRaise.stderr)
  const afterFileRaise = readBaseline(dir)
  assert.strictEqual(afterFileRaise.files['spec/scripts/y.js'], 150,
    '--raise must set the named file ceiling to exactly --to: ' + afterFileRaise.files['spec/scripts/y.js'])
  assert.deepStrictEqual(afterFileRaise.raises, [{ path: 'spec/scripts/y.js', from: 100, to: 150, cite: 'specs/20260909/01-example.md' }],
    '--raise must append {path, from, to, cite} to raises[] so review can see who asked for the growth: ' + JSON.stringify(afterFileRaise.raises))

  const rTreeRaise = run(['--root', dir, '--raise', 'tests', '--to', '9999', '--cite', 'specs/20260909/01-example.md'])
  assert.strictEqual(rTreeRaise.status, 0,
    'a --raise naming a tree key must also succeed with an existing --cite: ' + rTreeRaise.stderr)
  const afterTreeRaise = readBaseline(dir)
  assert.strictEqual(afterTreeRaise.trees.tests, 9999,
    '--raise on a tree key must set trees[<tree>] to --to: ' + afterTreeRaise.trees.tests)
  assert.ok(afterTreeRaise.raises.some(r => r.path === 'tests' && r.from === 30 && r.to === 9999 && r.cite === 'specs/20260909/01-example.md'),
    '--raise on a tree must also append its own raises[] entry recording the prior tree ceiling as from: ' + JSON.stringify(afterTreeRaise.raises))

  const badCiteDir = tmpdir('sr-ac7-bad')
  repo(badCiteDir, { 'spec/scripts/y.js': sized(100), 'notes.md': sized(5) })
  writeBaseline(badCiteDir, {
    newFileCap: 40000,
    trees: { 'spec/scripts': 100, 'spec/scripts/lib': 0, scripts: 0, tests: 0 },
    files: { 'spec/scripts/y.js': 100 },
    raises: []
  })
  const beforeBad = rawBaseline(badCiteDir)

  const rMissingCite = run(['--root', badCiteDir, '--raise', 'spec/scripts/y.js', '--to', '150'])
  assert.strictEqual(rMissingCite.status, 2,
    '--raise with no --cite at all must be a bad invocation (exit 2), never fall back to an unattributed raise: ' + rMissingCite.stderr)

  const rNonexistentCite = run(['--root', badCiteDir, '--raise', 'spec/scripts/y.js', '--to', '150', '--cite', 'specs/20260909/99-nope.md'])
  assert.strictEqual(rNonexistentCite.status, 2,
    '--raise citing a spec file that does not exist must exit 2: ' + rNonexistentCite.stderr)

  const rWrongShapeCite = run(['--root', badCiteDir, '--raise', 'spec/scripts/y.js', '--to', '150', '--cite', 'notes.md'])
  assert.strictEqual(rWrongShapeCite.status, 2,
    '--raise citing a file that exists but does not match ^specs/\\d{8}/\\d{2}- must still exit 2 — existence alone is not enough: ' + rWrongShapeCite.stderr)

  const afterBad = rawBaseline(badCiteDir)
  assert.strictEqual(afterBad, beforeBad,
    'every rejected --raise above must leave the baseline byte-for-byte unchanged: ' + afterBad)
})

test('AC-20260908-01-7: --raise never lowers a ceiling — a --to below the current value is exit 2 with the baseline byte-for-byte unchanged', () => {
  const dir = tmpdir('sr-ac7-never-lowers')
  repo(dir, { 'spec/scripts/y.js': sized(100), 'specs/20260909/01-example.md': sized(5) })
  writeBaseline(dir, {
    newFileCap: 40000,
    trees: { 'spec/scripts': 100, 'spec/scripts/lib': 0, scripts: 0, tests: 0 },
    files: { 'spec/scripts/y.js': 100 },
    raises: []
  })
  const before = rawBaseline(dir)

  const r = run(['--root', dir, '--raise', 'spec/scripts/y.js', '--to', '50', '--cite', 'specs/20260909/01-example.md'])
  assert.strictEqual(r.status, 2,
    'D4: a raise never lowers — a --to below the ceiling\'s current value (100) must be a bad invocation (exit 2), never a silent shrink: ' + r.stderr)

  const after = rawBaseline(dir)
  assert.strictEqual(after, before,
    'a rejected downward --raise must leave the baseline byte-for-byte unchanged: ' + after)
})

test('AC-20260908-01-7: --raise on a path that is neither tracked nor recorded in the baseline is refused, exit 2, with no phantom entry written', () => {
  const dir = tmpdir('sr-ac7-unknown-target')
  repo(dir, { 'spec/scripts/y.js': sized(100), 'specs/20260909/01-example.md': sized(5) })
  writeBaseline(dir, {
    newFileCap: 40000,
    trees: { 'spec/scripts': 100, 'spec/scripts/lib': 0, scripts: 0, tests: 0 },
    files: { 'spec/scripts/y.js': 100 },
    raises: []
  })
  const before = rawBaseline(dir)

  const r = run(['--root', dir, '--raise', 'tests/nope.txt', '--to', '10', '--cite', 'specs/20260909/01-example.md'])
  assert.strictEqual(r.status, 2,
    '--raise naming a path that is neither a tracked file nor an existing baseline/tree entry must be refused (exit 2) — there is nothing real to raise: ' + r.stderr)

  const after = rawBaseline(dir)
  assert.strictEqual(after, before,
    'a refused --raise on an unknown target must write no phantom files[] or raises[] entry — the baseline must stay byte-for-byte unchanged: ' + after)
})

test('AC-20260908-01-7: --to or --cite given without --raise is a usage error, not a silently-ignored plain check', () => {
  const dir = tmpdir('sr-ac7-orphan-flags')
  repo(dir, { 'tests/a.txt': sized(10), 'specs/20260909/01-example.md': sized(5) })
  writeBaseline(dir, {
    newFileCap: 40000,
    trees: { 'spec/scripts': 0, 'spec/scripts/lib': 0, scripts: 0, tests: 10 },
    files: { 'tests/a.txt': 10 },
    raises: []
  })

  const r = run(['--root', dir, '--to', '50', '--cite', 'specs/20260909/01-example.md'])
  assert.strictEqual(r.status, 2,
    '--to/--cite with no --raise must be a bad invocation (exit 2) — silently dropping them and running a plain check would apply a raise\'s flags without ever raising anything: ' + r.stderr)
})

test('AC-20260908-01-8: an untracked file of any size is ignored, and a tracked non-JS file over its ceiling is reported exactly like a .js file', () => {
  const dir = tmpdir('sr-ac8')
  repo(dir,
    { 'tests/fixtures/x.md': sized(20) },
    { 'spec/scripts/untracked-huge.js': sized(100000) })
  writeBaseline(dir, {
    newFileCap: 40000,
    // trees.tests is set to the file's true actual size (20), not its ceiling (10): the tree
    // itself must stay tight so this test isolates the AC-8 concern (location-based
    // classification and untracked-ignore) from the AC-4 tree-over/true-sum pin.
    trees: { 'spec/scripts': 0, 'spec/scripts/lib': 0, scripts: 0, tests: 20 },
    files: { 'tests/fixtures/x.md': 10 },
    raises: []
  })

  const r = run(['--root', dir])
  assert.strictEqual(r.status, 1,
    'the tracked over-ceiling .md file must still fail the check: ' + r.stderr)
  assert.match(r.stderr, /over\s+tests\/fixtures\/x\.md\s+20\s*>\s*10/,
    'a non-JS tracked file must report as "over" with the same "<actual> > <ceiling>" shape as a .js file — classification is by location, never by extension: ' + r.stderr)
  assert.doesNotMatch(r.stderr, /untracked-huge/,
    'an untracked file must never appear in a finding no matter how large it is — only `git ls-files` output may enter the inventory: ' + r.stderr)

  const rj = JSON.parse(run(['--root', dir, '--json']).stdout)
  assert.strictEqual(rj.findings.length, 1,
    'the untracked 100000-byte file must not add a second finding (neither new-over-cap nor a spec/scripts tree-over) — it is invisible to the checker: ' + JSON.stringify(rj.findings))
})
