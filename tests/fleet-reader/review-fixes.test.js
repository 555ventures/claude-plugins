'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { ROOT, tmpdir, runNode } = require('../helpers')

// Fleet evidence reader (specs/20260820/05-fleet-evidence-reader.md): six defects
// the review of that spec's build found in spec/scripts/fleet-reader.js, fixed in the same
// review pass. None of the six had an acceptance criterion — they are
// review findings, not spec ACs — so this file pins them by finding number, never by a
// fabricated AC-ID (this repo has a recorded incident where a worker wrote a literal AC-ID
// placeholder for a test with no underlying AC, producing coverage-shaped output that proved
// nothing). Each block below reproduces the exact broken shape the review caught: a >64KB pipe
// write cut short by process.exit(0), an unreadable ledger file crashing the whole run, a
// readdir failure lying as "no ledger", an unreadable repos-root stack-tracing instead of
// exiting 2, a float-percent rounding a clean 57.5% down to 57%, and a config-existence check
// written to dodge a repo-wide sweep. All six fixes are already shipped; every assertion below
// is green against current code and is the regression trap if any of the six resurfaces.

const SCRIPT = 'scripts/fleet-reader.js'
const SCRIPT_PATH = path.join(ROOT, 'spec/scripts/fleet-reader.js')
const HOST_CONFIG_PATH = path.join(ROOT, 'spec/scripts/lib/host-config.js')

function mkRepo(root, name, { config = true, git = 'dir', selfRepair = false, rows = [] } = {}) {
  const dir = path.join(root, name)
  fs.mkdirSync(path.join(dir, '.claude'), { recursive: true })
  if (config) fs.writeFileSync(path.join(dir, '.claude/spec.config.json'), '{}')
  if (git === 'dir') fs.mkdirSync(path.join(dir, '.git'), { recursive: true })
  else if (git === 'file') fs.writeFileSync(path.join(dir, '.git'), 'gitdir: ../.git/worktrees/' + name + '\n')
  if (selfRepair) {
    fs.mkdirSync(path.join(dir, '.claude-plugin'), { recursive: true })
    fs.writeFileSync(path.join(dir, '.claude-plugin/marketplace.json'), '{}')
  }
  if (rows.length) {
    fs.writeFileSync(path.join(dir, '.claude/spec-runs.jsonl'), rows.map(r => JSON.stringify(r)).join('\n') + '\n')
  }
  return dir
}

// Strips `//`-to-end-of-line comments so a source pin matches actual call sites, never a
// mention inside prose. A naive substring check would fail against the CURRENT fixed file,
// because its own explanatory comment names "process.exit(0)" as the thing it does not call.
function stripLineComments(src) {
  return src.split('\n').map(line => {
    const idx = line.indexOf('//')
    return idx === -1 ? line : line.slice(0, idx)
  }).join('\n')
}

const isRoot = !!(process.getuid && process.getuid() === 0)

// review fix 1
test('review finding 1: a >64KB --json payload survives a pipe byte-identical, exits 0, and the reader never calls process.exit(0) as a code statement', () => {
  const root = tmpdir('fleet-review-pipe')
  const legNames = Array.from({ length: 40 }, (_, i) => 'leg-' + i)
  for (let r = 0; r < 20; r++) {
    const rows = []
    for (let i = 0; i < 30; i++) {
      rows.push({
        ts: '2026-08-' + String(1 + (i % 28)).padStart(2, '0') + 'T00:00:00Z',
        stage: 'review', spec: 'specs/r' + r + '-' + i + '.md', verdict: 'CLEAN',
        legs: legNames.map(l => ({ leg: l, exit: 0 })),
      })
    }
    mkRepo(root, 'repo-' + r, { rows })
  }

  const r = runNode(SCRIPT, ['--repos-root', root, '--json'])
  assert.strictEqual(r.status, 0, 'a large fleet must still derive cleanly and exit 0, not crash mid-write: ' + r.stderr)
  const byteLen = Buffer.byteLength(r.stdout, 'utf8')
  assert.ok(byteLen > 65536,
    'the fixture must exceed 64KB (got ' + byteLen + ' bytes) — at or under that boundary this test cannot distinguish the fix from the truncation bug it pins, making the assertions below vacuous')
  const parsed = JSON.parse(r.stdout)
  // AC-20260901-03-6: specs/20260901/03 D9's cleanByVia is the eighth top-level key; the pin stays
  // exhaustive (the truncation this test exists to catch is still detected by a MISSING key).
  assert.deepStrictEqual(Object.keys(parsed).sort(), [
    'cleanByVia', 'cleanContradicted', 'driftCensus', 'escapes', 'gate08', 'legRecency', 'population',
    'replayDebt',
  ], 'a truncated pipe write cuts the JSON mid-object — if any top-level key is missing or extra, the output is corrupt even though the process reported exit 0')

  const codeOnly = stripLineComments(fs.readFileSync(SCRIPT_PATH, 'utf8'))
  assert.strictEqual(codeOnly.includes('process.exit(0)'), false,
    'a reinstated process.exit(0) call site cuts stdout.write\'s async pipe buffer before it drains, silently truncating any output over ~64KB while still reporting exit 0 — the exact bug this pin exists to trap')
})

// review fix 2
test('review finding 2: a ledger file that cannot be read is counted as unreadable (never unparseable), named, and the rest of the fleet is still answered', () => {
  const root = tmpdir('fleet-review-eisdir')
  const bad = mkRepo(root, 'bad-repo', {})
  fs.rmSync(path.join(bad, '.claude/spec-runs.jsonl'), { force: true })
  fs.mkdirSync(path.join(bad, '.claude/spec-runs.jsonl'))
  mkRepo(root, 'good-repo', { rows: [{ ts: '2026-08-01T00:00:00Z', stage: 'plan', spec: 'specs/a.md' }] })

  const r = runNode(SCRIPT, ['--repos-root', root, '--json'])
  assert.strictEqual(r.status, 0, 'an EISDIR on one repo\'s ledger file must not crash the whole run — the fix reported here was an uncaught exception losing the entire fleet: ' + r.stderr)
  const out = JSON.parse(r.stdout)
  const badPop = out.population.repos.find(x => x.name === 'bad-repo')
  assert.ok(badPop, 'bad-repo must still appear in the population block even though its ledger file could not be read')
  assert.ok(badPop.unreadable >= 1, 'a ledger path that is a directory must be counted as unreadable — silently reporting 0 hides the fact this repo\'s rows are missing')
  assert.strictEqual(badPop.unparseable, 0,
    'unreadable (a FILE that could not be read) and unparseable (a LINE that read but failed to JSON.parse) must never be conflated — folding this EISDIR into unparseable would misdirect anyone debugging it toward a corrupt line that does not exist')
  const goodPop = out.population.repos.find(x => x.name === 'good-repo')
  assert.ok(goodPop && goodPop.rows === 1, 'good-repo\'s row must still be reported — one bad ledger elsewhere must yield a partial fleet answer, not a dead run')
  const driftBad = out.driftCensus.byRepo.find(x => x.name === 'bad-repo')
  assert.ok(driftBad && driftBad.unreadable >= 1, 'driftCensus.byRepo must carry the same unreadable count as population — the two renders must never disagree about the same fleet')

  const bare = runNode(SCRIPT, ['--repos-root', root])
  assert.strictEqual(bare.status, 0, bare.stderr)
  assert.match(bare.stdout, /bad-repo:[^\n]*UNREADABLE:[^\n]*spec-runs\.jsonl/,
    'the human render must name the offending path next to bad-repo\'s line — an operator fixing this repo needs to know which file, not just that something failed')
})

// review fix 3
test('review finding 3: a .claude directory that cannot be listed renders as unreadable, never as the false "no ledger" claim', () => {
  const root = tmpdir('fleet-review-noexec')
  const repo = mkRepo(root, 'repo-a', {
    rows: [
      { ts: '2026-08-01T00:00:00Z', stage: 'plan', spec: 'specs/a.md' },
      { ts: '2026-08-02T00:00:00Z', stage: 'plan', spec: 'specs/b.md' },
      { ts: '2026-08-03T00:00:00Z', stage: 'plan', spec: 'specs/c.md' },
    ],
  })
  if (isRoot) {
    // chmod does not block a root-owned process from listing a directory — this pin cannot
    // distinguish the fix from the bug under root, so it is skipped rather than asserting a
    // false pass.
    return
  }
  const claudeDir = path.join(repo, '.claude')
  fs.chmodSync(claudeDir, 0o111) // traversal (x) works, listing (r) does not
  try {
    const r = runNode(SCRIPT, ['--repos-root', root, '--json'])
    assert.strictEqual(r.status, 0, 'an unlistable .claude directory must derive a partial answer, not crash: ' + r.stderr)
    const pop = JSON.parse(r.stdout).population.repos.find(x => x.name === 'repo-a')
    assert.ok(pop && pop.unreadable >= 1,
      'a readdir failure on .claude must be counted as unreadable — reporting unreadable:0 here is exactly the silent-absence lie D4 names as this reader\'s biggest risk')

    const bare = runNode(SCRIPT, ['--repos-root', root])
    assert.strictEqual(bare.status, 0, bare.stderr)
    const line = bare.stdout.split('\n').find(l => l.trim().startsWith('repo-a:'))
    assert.ok(line, 'the human render must still print a line for repo-a')
    assert.doesNotMatch(line, /no ledger/,
      'a repo with a real 3-row ledger must never render "no ledger" just because its directory listing failed — that reads as an empty, never-run repo when 3 rows actually exist and simply could not be seen, the exact silent lie the fix removes')
  } finally {
    fs.chmodSync(claudeDir, 0o755)
  }
})

// review fix 4
test('review finding 4: an unreadable --repos-root exits 2 with a chmod remedy on stderr, never an uncaught stack trace', () => {
  const root = tmpdir('fleet-review-rootnoexec')
  if (isRoot) {
    // Same root-immunity caveat as review finding 3 — chmod cannot block a root process, so
    // this pin would pass regardless of the fix and is skipped rather than lying.
    return
  }
  fs.chmodSync(root, 0o111)
  try {
    const r = runNode(SCRIPT, ['--repos-root', root])
    assert.strictEqual(r.status, 2,
      'an unreadable repos-root is a usage/precondition failure, not an internal error — the pre-fix behavior let the uncaught EACCES exit 1 with no guidance: ' + r.stderr)
    assert.match(r.stderr, /chmod u\+r/,
      'stderr must name the concrete remedy command (chmod u+r) — a bare error code leaves the operator guessing how to unblock the scan')
    assert.doesNotMatch(r.stderr, /^\s+at\s/m,
      'stderr must never carry a raw stack frame (a line starting with "at ") — that is what an uncaught exception looks like, and this path must be a guarded, user-facing usage error instead')
  } finally {
    fs.chmodSync(root, 0o755)
  }
})

// review fix 5
test('review finding 5: the gate08 percent rounds half up from the two integer counts, independent of the 4dp ratio field, and never prints NaN', () => {
  const authoredRows = (n, prefix) => Array.from({ length: n }, (_, i) =>
    ({ ts: '2026-08-18T00:00:00Z', stage: 'plan', spec: 'specs/' + prefix + i + '.md' }))

  // Case A: 23/40 = exactly 57.5% — (23/40)*100 === 57.49999999999999 in floating point, so a
  // naive Math.round on the ratio prints 57%; only deriving from the two integer counts
  // (23*100/40 === 57.5 exactly) rounds half-up to 58.
  const rootA = tmpdir('fleet-review-pct-a')
  mkRepo(rootA, 'self-repo', { selfRepair: true, rows: authoredRows(23, 's') })
  mkRepo(rootA, 'host-repo', { selfRepair: false, rows: authoredRows(17, 'h') })
  const jA = runNode(SCRIPT, ['--repos-root', rootA, '--json'])
  assert.strictEqual(jA.status, 0, jA.stderr)
  const outA = JSON.parse(jA.stdout)
  assert.strictEqual(outA.gate08.selfRepairShare, 0.575,
    'the machine --json field must stay the raw 4dp ratio (0.575) untouched — the percent fix changes only the human render\'s rounding path, never this field\'s value')
  const bareA = runNode(SCRIPT, ['--repos-root', rootA])
  assert.strictEqual(bareA.status, 0, bareA.stderr)
  assert.match(bareA.stdout, /selfRepairShare=58%/,
    'an exact 57.5% must render as 58% (round-half-up) — rendering 57% means the percent is still being computed from the lossy floating-point ratio instead of the two integer counts')

  // Case B: 51/101 = truly 50.495...% — this catches the INDEPENDENT double-rounding bug: even
  // after fixing case A by rounding the 4dp ratio (0.505) times 100, Math.round(50.5) is 51,
  // one point high. Only rounding straight from the integer counts (51*100/101 = 50.49...) gives 50.
  const rootB = tmpdir('fleet-review-pct-b')
  mkRepo(rootB, 'self-repo', { selfRepair: true, rows: authoredRows(51, 's') })
  mkRepo(rootB, 'host-repo', { selfRepair: false, rows: authoredRows(50, 'h') })
  const bareB = runNode(SCRIPT, ['--repos-root', rootB])
  assert.strictEqual(bareB.status, 0, bareB.stderr)
  assert.match(bareB.stdout, /selfRepairShare=50%/,
    '51/101 (50.495...%) must render as 50% — rendering 51% means the render is going through the rounded 4dp intermediate (0.505) and double-rounding, the second bug the same review finding caught')
  assert.doesNotMatch(bareB.stdout, /selfRepairShare=51%/,
    'an explicit negative check: 51% is the double-rounding artifact this fix removes, so it must never appear for this fixture')

  // Case C: zero in-window authored specs anywhere in the fleet.
  const rootC = tmpdir('fleet-review-pct-c')
  mkRepo(rootC, 'empty-repo', { selfRepair: false, rows: [] })
  const bareC = runNode(SCRIPT, ['--repos-root', rootC])
  assert.strictEqual(bareC.status, 0, 'a fleet with zero in-window authored specs must still exit 0, not divide-by-zero crash: ' + bareC.stderr)
  assert.doesNotMatch(bareC.stdout, /NaN/,
    'zero in-window authored specs is a 0/0 case for the percent — it must render a defined 0%, never NaN leaking into the human output')
})

// review fix 6 — retagged AC-20260820-08-8 at build (D14, orchestrator collision
// ruling): specs/20260820/08-config-name-ban.md D7/D8 retire the `configPathFor` name at the
// export boundary (it becomes `configExists`/`configPath`) and retire this file's call site along
// with it, so the literal this test pinned is gone. Updated in place per this
// repo's rules § Gotchas prescription for a retired-literal collision outside the retiring spec's
// own File Plan — never weakened, never left red. The anti-concatenation assertion is unchanged.
test('AC-20260820-08-8: the config-existence check routes through host-config.js\'s exported configExists, not a re-inlined concatenation', () => {
  assert.ok(fs.existsSync(SCRIPT_PATH), 'spec/scripts/fleet-reader.js must exist for this pin to mean anything')
  const src = fs.readFileSync(SCRIPT_PATH, 'utf8')
  assert.match(src, /require\(['"]\.\/lib\/host-config['"]\)/,
    'the reader must import lib/host-config.js — without this import the only way to check config existence is re-inlining the path, which is exactly the evasion the fix removed')
  assert.match(src, /configExists\(/,
    'the reader must call configExists(...) for its config-existence check — calling anything else means the shared helper is imported but unused, leaving the evasion live elsewhere in the file')
  assert.doesNotMatch(src, /\+\s*['"`]\/?spec\.config\.json['"`]/,
    'the reader must not reintroduce a concatenated `+ \'/spec.config.json\'` (or equivalent) literal — that string-built form was written specifically to dodge a repo-wide sweep for the honest helper call, per a comment telling editors not to tidy it')

  assert.ok(fs.existsSync(HOST_CONFIG_PATH), 'spec/scripts/lib/host-config.js must exist for this pin to mean anything')
  const hostConfig = require('../../spec/scripts/lib/host-config')
  assert.strictEqual(typeof hostConfig.configExists, 'function',
    'lib/host-config.js must export configExists as a function — this export is what makes the honest form in fleet-reader.js possible at all; dropping it silently pushes the next editor back to the string-concatenation evasion')
  assert.strictEqual(typeof hostConfig.configPath, 'function',
    'lib/host-config.js must export configPath as a function (the renamed configPathFor) — configExists is specified in terms of it, and any other caller migrating off a private path-join depends on this export existing')
})
