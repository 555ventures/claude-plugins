'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { read, tmpdir, runNode, gitRepo } = require('../helpers')

// specs/20260823/04-review-close-hardening.md D1/D8/D9 (2026-08-23): two live incidents at one
// review close (rv_6825fa48c98d, the tier field of seven ledger rows carrying comment text) and
// (rv_e83659d49386, `build_base:`'s comment breaking /spec:review's driver outright with `fatal:
// invalid object name`) drove specs/20260823/03 to extract `spec/scripts/lib/frontmatter.js`
// mid-flight — landing first with an `fmVal(fmRaw, key)` export. D8's orchestrator reconciliation
// ruling is binding here: this build widens that SAME module to `{ fmBlock, fmValue, fmMap }`
// (fmValue supersedes fmVal by rename, no alias survives) and additionally accepts full document
// text, not just a pre-extracted raw block. Every AC-1/-2/-3 assertion below fails at HEAD on
// TypeError ("fmBlock/fmValue/fmMap is not a function") because the module exports only `fmVal`
// today — the correct red for a contract-widening pin per this repo's Test Rules. Per D9, this
// file does NOT restate spec 03's scalar-stripping pins (those live in tests/frontmatter.test.js,
// retagged in place) — it pins only the surface D1/D8 add: full-document entry, fmBlock, fmMap,
// the driver's exec-level build_base path (AC-4), and the four-script routing sweep (AC-10).

const { fmBlock, fmValue, fmMap } = require('../../spec/scripts/lib/frontmatter')

// A realistic multi-key spec document, `---`-fenced, carrying one instance of each of the three
// stripping shapes D1's Contracts block enumerates: AC-1's whitespace-preceded comment on an
// unquoted value, AC-2's quoted value whose `#` must survive, AC-3's unquoted value whose `#` has
// no preceding whitespace (a URL fragment) and must also survive.
const DOC = '---\n' +
  'status: implementing\n' +
  'tier: critical           # touches spec/bin/spec-paths (key-set edit)\n' +
  'area: "notes # misc"\n' +
  'design_source: https://claude.ai/design/p/x#frag\n' +
  '---\n\n' +
  '# Some Spec\n\n' +
  'Body text unrelated to frontmatter — fmValue/fmBlock/fmMap must never read past the closing fence.\n'

const DOC_BLOCK = 'status: implementing\n' +
  'tier: critical           # touches spec/bin/spec-paths (key-set edit)\n' +
  'area: "notes # misc"\n' +
  'design_source: https://claude.ai/design/p/x#frag'

test('AC-20260823-04-1: WHEN fmValue reads a key whose unquoted value carries a whitespace-preceded inline comment, entered with FULL document text (not a pre-extracted block), THE SYSTEM returns only the value ("tier: critical           # touches spec/bin/spec-paths (key-set edit)" -> "critical")', () => {
  assert.strictEqual(fmValue(DOC, 'tier'), 'critical',
    'fmValue must accept the FULL document (fences, body, and all) and still strip the whitespace-preceded comment down to the bare value — a surviving comment fragment here is exactly rv_6825fa48c98d\'s mechanism (a note riding into a value a caller trusts verbatim), and this widened full-document entry point is the new surface D1/D8 add over spec 03\'s raw-block-only fmVal: got ' + JSON.stringify(fmValue(DOC, 'tier')))
})

test('AC-20260823-04-2: WHEN fmValue reads a quoted value entered with full document text THE SYSTEM returns the quoted content verbatim, "#" included (\'area: "notes # misc"\' -> \'notes # misc\')', () => {
  assert.strictEqual(fmValue(DOC, 'area'), 'notes # misc',
    'a quoted value must never be truncated at its internal "#" — treating it as a comment start would silently corrupt any quoted value that legitimately contains one, and the Contracts block is explicit that a matched-quote value "unwraps verbatim (never stripped)": got ' + JSON.stringify(fmValue(DOC, 'area')))
})

test('AC-20260823-04-3: WHEN fmValue reads an unquoted value whose "#" has no preceding whitespace, entered with full document text THE SYSTEM returns the value whole ("design_source: https://claude.ai/design/p/x#frag" -> unchanged)', () => {
  assert.strictEqual(fmValue(DOC, 'design_source'), 'https://claude.ai/design/p/x#frag',
    'YAML comments require PRECEDING WHITESPACE before "#" — an unspaced "#" (a URL fragment here) is content, not a comment; stripping it would corrupt design_source every time a design URL carries a fragment, and this is the exact literal that rv_e83659d49386\'s fix must never regress: got ' + JSON.stringify(fmValue(DOC, 'design_source')))
})

test('AC-20260823-04-1/2/3 (sanity + absent key): fmValue on a key with no comment returns it unchanged, and an absent key returns ""', () => {
  assert.strictEqual(fmValue(DOC, 'status'), 'implementing',
    'a plain unquoted value with no trailing comment must pass through unchanged — a stripping rule that mangles the ordinary case is worse than the bug it fixes: got ' + JSON.stringify(fmValue(DOC, 'status')))
  assert.strictEqual(fmValue(DOC, 'nonexistent_key'), '',
    'a key absent from the document must return "" (the Contracts\' documented default) — every caller (spec-status.js, the review/design drivers, replay.js) falls back from this default rather than crashing on undefined: got ' + JSON.stringify(fmValue(DOC, 'nonexistent_key')))
})

test('fmBlock returns exactly the raw interior between the leading `---` fences (no fence lines, no body) and "" when no frontmatter block is present', () => {
  assert.strictEqual(fmBlock(DOC), DOC_BLOCK,
    'fmBlock must return the frontmatter block\'s raw interior byte-for-byte — a caller (or a test) that re-derives the block by hand instead of trusting this function is exactly the second-derivation risk D1 exists to end: got ' + JSON.stringify(fmBlock(DOC)))
  assert.strictEqual(fmBlock('# no frontmatter here\n\njust a body\n'), '',
    'a document with no leading `---` fence must return "" per the Contracts\' documented default, never throw or return the whole document: got ' + JSON.stringify(fmBlock('# no frontmatter here\n\njust a body\n')))
})

test('fmValue accepts a pre-extracted raw block (fmBlock\'s own output) in addition to full document text, per the Contracts\' "accepts full text or a raw block"', () => {
  const block = fmBlock(DOC)
  assert.strictEqual(fmValue(block, 'tier'), 'critical',
    'fmValue must read a bare raw block exactly like it reads the full document — a caller that already extracted the block (as every one of the four routed scripts historically did) must not have to re-wrap it in `---` fences to keep working: got ' + JSON.stringify(fmValue(block, 'tier')))
})

test('AC-20260823-04-1/2/3 (fmMap facet): fmMap over full document text returns one stripped value per top-level key, exercising all three stripping rules in a single pass', () => {
  const map = fmMap(DOC)
  assert.strictEqual(map.status, 'implementing', 'fmMap must carry the plain unquoted status value unchanged: ' + JSON.stringify(map))
  assert.strictEqual(map.tier, 'critical', 'fmMap must strip the whitespace-preceded comment on tier exactly like fmValue does — a second, divergent stripping path here is the same class of bug this module exists to close: ' + JSON.stringify(map))
  assert.strictEqual(map.area, 'notes # misc', 'fmMap must preserve a quoted value\'s internal "#" verbatim: ' + JSON.stringify(map))
  assert.strictEqual(map.design_source, 'https://claude.ai/design/p/x#frag', 'fmMap must preserve an unspaced "#" inside an unquoted value: ' + JSON.stringify(map))
})

// ---- AC-20260823-04-4: driver exec path — build_base with a trailing inline comment ------------
// specs/20260823/03 D4 already routed spec-review-driver.js's local fmVal through
// lib/frontmatter.js's (already correctly quote-aware, whitespace-strip) fmVal, and D8 records
// that this driver's D2 obligation is satisfied by a one-line import rename alone — the
// substantive bug this build closes is spec-status.js/replay.js's OWN kv-loop (AC-10). Executed
// spike (2026-08-23, against this exact fixture shape): the driver already resolves
// `build_base: <sha>   # set by enter-worktree` to bare `<sha>` and reaches state REVIEWER with
// no `fatal: invalid object name` — this pin is therefore GREEN at HEAD already, kept and logged
// rather than forced red (a vacuous-but-correct exec pin is a legitimate outcome here, never a
// reason to weaken or invent a false-red assertion). NOT tagged `[pre-green:]`: that enum is closed
// (fallback-rejection | absence-invariant | predicate-in-test) and a sibling-landed fix is none of
// them — the departure is recorded in this spec's deviations sidecar instead.

const GREEN_TEST = (acId) => `'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const foo = require('../src/foo.js')
test('${acId}: foo() returns 42', () => { assert.strictEqual(foo(), 42) })
`

function specBodyBuildBase(buildBaseLine, acId) {
  return `---
status: implementing
tier: standard
build_base: ${buildBaseLine}
---
# Build Base Comment Test Spec

## Decisions

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | foo() returns 42 (${acId}) | why |

## File Plan

| File | Action | Layer |
|---|---|---|
| src/foo.js | edit | scripts |
| tests/foo.test.js | create | tests |

## Acceptance Criteria

- **${acId}**: foo() returns 42.
`
}

function makeBuildBaseHost(commentSuffix, acId) {
  const root = fs.realpathSync(tmpdir('fm-buildbase'))
  const g = gitRepo(root)
  fs.mkdirSync(path.join(root, '.claude'), { recursive: true })
  fs.mkdirSync(path.join(root, 'src'), { recursive: true })
  fs.mkdirSync(path.join(root, 'tests'), { recursive: true })
  fs.writeFileSync(path.join(root, '.claude/spec.config.json'), JSON.stringify({
    gateCommand: 'node --test {testDirs}',
    testCommand: 'node --test',
    runtime: { inert: 'plugin repo — nothing boots' },
    capabilities: { forge: 'none', skipReportPattern: 'none' },
  }))
  fs.writeFileSync(path.join(root, 'src/foo.js'), 'module.exports = () => 41\n')
  g('add', '-A'); g('commit', '-q', '-m', 'base')
  const buildBase = g('rev-parse', 'HEAD').trim()
  fs.mkdirSync(path.join(root, 'specs/20260823'), { recursive: true })
  const spec = path.join(root, 'specs/20260823/99-fm-buildbase.md')
  fs.writeFileSync(spec, specBodyBuildBase(buildBase + commentSuffix, acId))
  fs.writeFileSync(path.join(root, 'src/foo.js'), 'module.exports = () => 42\n')
  fs.writeFileSync(path.join(root, 'tests/foo.test.js'), GREEN_TEST(acId))
  g('add', '-A'); g('commit', '-q', '-m', 'implement')
  return { root, spec, buildBase }
}

function runDriver(root, spec, ...args) {
  return runNode('scripts/spec-review-driver.js', [spec, ...args], { cwd: root })
}
const driverState = (root, spec) => runDriver(root, spec, '--state').stdout.trim()

test('AC-20260823-04-4: WHEN the review driver reads a spec whose build_base: line carries a trailing inline comment THE SYSTEM resolves the same base as the comment-free form and proceeds past base derivation, with no "fatal: invalid object name" and no "main: command not found"', () => {
  const control = makeBuildBaseHost('', 'AC-20260823-04-4a')
  const treatment = makeBuildBaseHost('   # set by enter-worktree', 'AC-20260823-04-4b')

  const controlRun = runDriver(control.root, control.spec)
  assert.strictEqual(controlRun.status, 0,
    'setup precondition: the comment-free control fixture must resolve its base and reach a printed step cleanly: ' + controlRun.stdout + controlRun.stderr)
  const controlState = driverState(control.root, control.spec)
  assert.strictEqual(controlState, 'REVIEWER', 'setup precondition: the control fixture must reach REVIEWER on green legs before it is a valid baseline for comparison')

  const treatmentRun = runDriver(treatment.root, treatment.spec)
  assert.strictEqual(treatmentRun.status, 0,
    'a build_base line carrying a trailing inline comment must not stop the driver from resolving its base and proceeding — a nonzero exit here means the comment leaked into the ref git tried to resolve: ' + treatmentRun.stdout + treatmentRun.stderr)
  assert.doesNotMatch(treatmentRun.stdout + treatmentRun.stderr, /fatal: invalid object name/,
    'a comment-polluted build_base ref reaching git directly is rv_e83659d49386\'s exact failure mode: ' + treatmentRun.stdout + treatmentRun.stderr)
  assert.doesNotMatch(treatmentRun.stdout + treatmentRun.stderr, /main: command not found/,
    'the same incident\'s second symptom — the comment text reaching a shell interpolation — must also never appear: ' + treatmentRun.stdout + treatmentRun.stderr)

  // Real equivalence, not just absence-of-string: the commented fixture must reach the IDENTICAL
  // derived state as the comment-free control, proving the same base was actually used to diff
  // and run legs against — a base that silently fell back to something else (e.g. a merge-base
  // guess) could also avoid the literal error strings above while still being wrong.
  const treatmentState = driverState(treatment.root, treatment.spec)
  assert.strictEqual(treatmentState, controlState,
    'the commented and comment-free fixtures are otherwise identical (same commit history, same source, same tests) — if build_base resolution genuinely strips the comment the same way, both must derive the SAME state; a divergence here means the two fixtures resolved different bases: control=' + controlState + ' treatment=' + treatmentState)
})

// ---- AC-20260823-04-10: routing sweep — all four scripts route through lib/frontmatter.js ------

const FOUR_SCRIPTS = [
  'scripts/spec-review-driver.js',
  'scripts/spec-design-driver.js',
  'scripts/spec-status.js',
  'scripts/replay.js',
]
// The literal text of the buggy any-`#` strip this build closes (present today in spec-status.js
// and replay.js's own private frontmatter() kv loops) — stripping at ANY `#`, not just a
// whitespace-preceded one, is exactly rv_6825fa48c98d/rv_e83659d49386's mechanism reimplemented a
// third and fourth time. Absence of this literal is the only way to observe "no second
// derivation" from outside the module — there is no runtime hook that proves a script chose not
// to write its own regex, so a source-text assertion is the sole available observable here (the
// AC-4 behavioral pin above and the spec-status.js pin below cover the actually-reachable half).
const BUGGY_ANY_HASH_STRIP = '\\s*#.*$'
// The literal per-line kv-construction shape spec-status.js and replay.js each carry today —
// a local re-derivation of exactly what fmMap now owns.
const BUGGY_KV_LINE = '/^([A-Za-z_]+):\\s*(.*)$/'

test('AC-20260823-04-10: EACH of spec-review-driver.js, spec-design-driver.js, spec-status.js, and replay.js requires lib/frontmatter.js and carries no surviving local per-key or per-line frontmatter-parsing construction', () => {
  for (const rel of FOUR_SCRIPTS) {
    const src = read('spec/' + rel)
    assert.ok(src.includes("require('./lib/frontmatter')"),
      rel + ' must require lib/frontmatter.js — a script that parses spec frontmatter without ' +
      'routing through the sole derivation is how a third/fourth copy of the same regex bug ' +
      'recurs; source has no require(\'./lib/frontmatter\') at all')
    assert.ok(!src.includes(BUGGY_ANY_HASH_STRIP),
      rel + ' must not contain the buggy any-"#" strip regex ("\\s*#.*$") — this is the literal ' +
      'mechanism that corrupted seven ledger tier rows and once broke build_base outright; its ' +
      'survival here means this script still derives frontmatter values itself instead of ' +
      'through fmMap/fmValue')
    assert.ok(!src.includes(BUGGY_KV_LINE),
      rel + ' must not contain a local per-line frontmatter kv-parsing regex ' +
      '("/^([A-Za-z_]+):\\\\s*(.*)$/") — its presence means this script still re-implements the ' +
      'block-to-map derivation fmMap exists to be the SOLE owner of')
  }
})

test('AC-20260823-04-10 (behavioral companion): WHEN spec-status.js --json reads a spec whose "area:" value carries a "#" with no preceding whitespace THE SYSTEM returns it intact, proving the routed fmMap fix rather than merely the absence of a string in source', () => {
  const dir = tmpdir('fm10-status')
  fs.mkdirSync(path.join(dir, 'specs/20260823'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'specs/20260823/99-x.md'),
    '---\nstatus: draft\narea: notes#misc\n---\n# X\n')
  const r = runNode('scripts/spec-status.js', ['--root', dir, '--json'])
  assert.strictEqual(r.status, 0, 'spec-status.js --json must succeed against a minimal single-spec host: ' + r.stdout + r.stderr)
  const out = JSON.parse(r.stdout)
  const entry = out.specs.find((s) => s.path === 'specs/20260823/99-x.md')
  assert.ok(entry, 'the fixture spec must appear in --json specs[]: ' + r.stdout)
  assert.strictEqual(entry.area, 'notes#misc',
    'an unspaced "#" inside area: is content, not a comment (a URL fragment carries this exact ' +
    'shape) — spec-status.js\'s own local frontmatter() strips at ANY "#" today, corrupting this ' +
    'to "notes"; routing through fmMap is the only way this field survives intact: got ' + JSON.stringify(entry.area))
})
