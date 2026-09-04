'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const { tmpdir, gitRepo } = require('../helpers')
const { GREEN_TEST, specBody, makeHost, run, stateOf, toReviewer, returnFileWith, CLEAN_RETURN, rulesWithGotchas } = require('./review-driver.fixtures')

// Shard C of the review-driver family (review-driver-close-row.test.js, split from
// review-driver.test.js by specs/20260903/06-test-suite-critical-path.md D1/D3). Owns the
// close-row ACs: specs/20260820/07-review-driver.md AC-20260820-07-6; specs/20260901/03
// AC-20260901-03-5; specs/20260901/09-disposer-gate.md AC-20260901-09-5; specs/20260902/05
// AC-20260902-05-11; specs/20260824/06-review-range-identity.md AC-20260824-06-6/-11;
// specs/20260823/03-silent-drop-hardening.md AC-20260823-03-11; specs/20260823/05
// AC-20260823-05-7; plus the canonical-doc-naming and gotchas-ratchet regressions. Shared helpers
// live in review-driver.fixtures.js (D2).

// specs/20260901/03-unified-build-loop.md D2/AC-20260901-03-5 (brief 18, SHALL
// CONTINUE TO, tagged in place, never weakened): this host is built with no --via flag, so it
// defaults to via:"direct" — the new CHECKPOINT state (reached only for via:"loop") must never
// engage here, and the line below asserting DISPOSITIONS directly after reviewer-returned stays
// the correct, unweakened pin for the direct-entry path.
//
// specs/20260901/09-disposer-gate.md D9/AC-20260901-09-5 (brief 18b, tagged in
// place, never weakened): D9 keeps this exact zero-pool CONTINUES-TO-pass shape as the AC-5
// pin — both pools empty still admits --mark dispositions --waived 0 --rejected 0
// --fix-dispatched 0 with no --file and lands CLOSE, unaffected by the CHECKPOINT retirement.
test('AC-20260820-07-6 / AC-20260901-03-5 / AC-20260901-09-5 (SHALL CONTINUE TO) / AC-20260902-05-11 (SHALL CONTINUE TO, D6): WHEN a clean run reaches CLOSE (0 survivors, dispositions 0 0 0) THE SYSTEM runs the authoritative verdict with --retain .claude/spec-runs, appends one ledger line, flips status implementing -> done, and prints the close-step instructions', () => {
  const host = makeHost()
  toReviewer(host)
  const returnFile = returnFileWith('rvdrv-clean', CLEAN_RETURN)
  run(host.root, host.spec, '--mark', 'reviewer-returned', '--file', returnFile)
  assert.strictEqual(stateOf(host.root, host.spec), 'DISPOSITIONS',
    'AC-20260901-03-5 (SHALL CONTINUE TO)/D2: a via:"direct" run (no --via flag given) must land DISPOSITIONS directly after reviewer-returned, never CHECKPOINT — CHECKPOINT exists only for via:"loop"')

  const ledger = path.join(host.root, '.claude/spec-runs.jsonl')
  const before = fs.existsSync(ledger) ? fs.readFileSync(ledger, 'utf8').trim().split('\n').filter(Boolean) : []
  const r = run(host.root, host.spec, '--mark', 'dispositions', '--waived', '0', '--rejected', '0', '--fix-dispatched', '0')
  assert.strictEqual(r.status, 0, 'a zero-survivor, zero-finding disposition must be accepted: ' + r.stdout + r.stderr)
  assert.strictEqual(stateOf(host.root, host.spec), 'CLOSE', 'zero undispositioned findings must land CLOSE: ' + r.stdout + r.stderr)

  const after = fs.readFileSync(ledger, 'utf8').trim().split('\n').filter(Boolean)
  assert.strictEqual(after.length, before.length + 1,
    'exactly one ledger line must be appended for the authoritative CLOSE pass: ' + JSON.stringify({ before, after }))
  const row = JSON.parse(after[after.length - 1])
  assert.strictEqual(row.verdict, 'CLEAN', 'the authoritative pass must derive CLEAN for a zero-survivor, zero-leg-finding run: ' + JSON.stringify(row))

  const retainDir = path.join(host.root, '.claude/spec-runs')
  assert.ok(fs.existsSync(retainDir) && fs.readdirSync(retainDir).includes(row.runId + '.json'),
    'the authoritative verdict must run with --retain .claude/spec-runs, writing <runId>.json — without it the reviewer\'s full-fidelity evidence is never durable: ' + retainDir)

  assert.match(fs.readFileSync(host.spec, 'utf8'), /status:\s*done/,
    'CLOSE must flip the spec\'s frontmatter status from implementing to done')

  assert.match(r.stdout, /Canonical Delta/, 'the CLOSE step must print the Canonical Delta instruction: ' + r.stdout)
  assert.match(r.stdout, /\.claude\/spec-runs\/\*\.json/,
    'the CLOSE step\'s hygiene listing must name .claude/spec-runs/*.json as an EXPECTED artifact — omitting it invites deleting durable evidence as reviewer scratch: ' + r.stdout)
  assert.match(r.stdout, /EXPECTED/, 'the hygiene listing must mark expected artifacts (retained evidence + sidecar) as EXPECTED, not stray paths to clean up: ' + r.stdout)
  assert.match(r.stdout, /close[- ]commit/i, 'the CLOSE step must print the close-commit instruction: ' + r.stdout)
})

// specs/20260824/06-review-range-identity.md D3/D4: the close row is written by
// doCloseWork() BEFORE the close commit exists — fix-worker edits may still be uncommitted tracked
// changes at pass time, so `dirty:true` tells a later reader the range's true upper bound is the
// close commit that follows, never `head` alone. Untracked files (the sidecar, scratch artifacts)
// never count — `git status --porcelain --untracked-files=no` is the exact command D4 pins.
test('AC-20260824-06-6: WHEN a clean run reaches CLOSE with one uncommitted tracked-file edit in the fixture tree THE SYSTEM appends a close row with diff.dirty:true and diff.head equal to the fixture\'s HEAD before the close commit, and a retained artifact whose diff deep-equals the row\'s; WHEN the tree is clean apart from untracked files THE SYSTEM records diff.dirty:false', () => {
  const dirtyHost = makeHost()
  toReviewer(dirtyHost)
  run(dirtyHost.root, dirtyHost.spec, '--mark', 'reviewer-returned', '--file', returnFileWith('rvdrv-dirty-clean', CLEAN_RETURN))
  assert.strictEqual(stateOf(dirtyHost.root, dirtyHost.spec), 'DISPOSITIONS', 'setup: a returned CLEAN, zero-survivor result must land DISPOSITIONS')
  fs.writeFileSync(path.join(dirtyHost.root, 'src/foo.js'), 'module.exports = () => 42 // uncommitted fix-worker edit\n')
  const expectedHeadDirty = execFileSync('git', ['-C', dirtyHost.root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
  const dClose = run(dirtyHost.root, dirtyHost.spec, '--mark', 'dispositions', '--waived', '0', '--rejected', '0', '--fix-dispatched', '0')
  assert.strictEqual(dClose.status, 0, 'a zero-survivor disposition must still close even with an uncommitted tracked edit present: ' + dClose.stdout + dClose.stderr)
  const ledgerDirtyLines = fs.readFileSync(path.join(dirtyHost.root, '.claude/spec-runs.jsonl'), 'utf8').trim().split('\n').filter(Boolean)
  const rowDirty = JSON.parse(ledgerDirtyLines[ledgerDirtyLines.length - 1])
  assert.strictEqual(rowDirty.diff && rowDirty.diff.dirty, true,
    'AC-20260824-06-6: a modified TRACKED file uncommitted at close-pass time must record diff.dirty:true — ' +
    'without this a reader cannot tell the close commit that follows is still part of the judged range: ' + JSON.stringify(rowDirty))
  assert.strictEqual(rowDirty.diff.head, expectedHeadDirty,
    'AC-20260824-06-6: diff.head must equal the fixture\'s HEAD BEFORE the close commit (the driver never ' +
    'commits itself) — the close row\'s head is the tree the authoritative pass actually judged: ' + JSON.stringify(rowDirty))
  const artifactDirty = JSON.parse(fs.readFileSync(path.join(dirtyHost.root, '.claude/spec-runs', rowDirty.runId + '.json'), 'utf8'))
  assert.deepStrictEqual(artifactDirty.diff, rowDirty.diff,
    'AC-20260824-06-6: the retained artifact\'s diff must deep-equal the close row\'s diff object: ' +
    JSON.stringify({ row: rowDirty.diff, artifact: artifactDirty.diff }))

  const cleanHost = makeHost()
  toReviewer(cleanHost)
  run(cleanHost.root, cleanHost.spec, '--mark', 'reviewer-returned', '--file', returnFileWith('rvdrv-untracked-clean', CLEAN_RETURN))
  assert.strictEqual(stateOf(cleanHost.root, cleanHost.spec), 'DISPOSITIONS')
  fs.writeFileSync(path.join(cleanHost.root, 'scratch.txt'), 'an untracked scratch file, never git add-ed\n')
  const cClose = run(cleanHost.root, cleanHost.spec, '--mark', 'dispositions', '--waived', '0', '--rejected', '0', '--fix-dispatched', '0')
  assert.strictEqual(cClose.status, 0, 'a zero-survivor disposition must close normally with only an untracked file present: ' + cClose.stdout + cClose.stderr)
  const ledgerCleanLines = fs.readFileSync(path.join(cleanHost.root, '.claude/spec-runs.jsonl'), 'utf8').trim().split('\n').filter(Boolean)
  const rowClean = JSON.parse(ledgerCleanLines[ledgerCleanLines.length - 1])
  assert.strictEqual(rowClean.diff && rowClean.diff.dirty, false,
    'AC-20260824-06-6: an untracked file alone (e.g. a scratch artifact) must never count as dirty — ' +
    '`git status --porcelain --untracked-files=no` reports nothing for it, so diff.dirty must be false: ' +
    JSON.stringify(rowClean))
})

// Escape caught by audit, after specs/20260823/08-derived-session-queue.md had already
// closed CLEAN: the CLOSE step rendered `docs/canonical/${area}.md` straight from frontmatter, so a
// spec carrying `area: session-queue` whose Canonical Delta names `docs/canonical/status.md` was
// told to write a canonical doc that does not exist. Following the printed instruction would have
// fragmented the canonical layer into a second file the spec never named.
test('the CLOSE step names the canonical doc the spec\'s own Canonical Delta section names, not one derived from frontmatter area, when the two differ', () => {
  const host = makeHost({ specOpts: { area: 'session-queue', canonicalDelta: 'docs/canonical/status.md gains one paragraph about the overlay.' } })
  toReviewer(host)
  run(host.root, host.spec, '--mark', 'reviewer-returned', '--file', returnFileWith('rvdrv-canon', CLEAN_RETURN))
  const r = run(host.root, host.spec, '--mark', 'dispositions', '--waived', '0', '--rejected', '0', '--fix-dispatched', '0')

  assert.strictEqual(stateOf(host.root, host.spec), 'CLOSE', 'setup: a zero-survivor disposition must land CLOSE: ' + r.stdout + r.stderr)
  assert.match(r.stdout, /Apply the spec's Canonical Delta to docs\/canonical\/status\.md\./,
    'the close instruction must name the doc the spec itself names — a session following an area-derived path writes a canonical doc the spec never named, splitting the canonical layer in two: ' + r.stdout)
  assert.doesNotMatch(r.stdout, /docs\/canonical\/session-queue\.md/,
    'the area-derived filename must not appear at all once the Canonical Delta names its own target — printing both leaves the session to guess which is authoritative: ' + r.stdout)
})

test('the CLOSE step falls back to the area-derived canonical filename when the spec has no Canonical Delta section naming one', () => {
  const host = makeHost({ specOpts: { area: 'review' } })
  toReviewer(host)
  run(host.root, host.spec, '--mark', 'reviewer-returned', '--file', returnFileWith('rvdrv-canon-fb', CLEAN_RETURN))
  const r = run(host.root, host.spec, '--mark', 'dispositions', '--waived', '0', '--rejected', '0', '--fix-dispatched', '0')

  assert.strictEqual(stateOf(host.root, host.spec), 'CLOSE', 'setup: a zero-survivor disposition must land CLOSE: ' + r.stdout + r.stderr)
  assert.match(r.stdout, /Apply the spec's Canonical Delta to docs\/canonical\/review\.md\./,
    'a spec whose Canonical Delta names no path must still get the area-derived target — losing the fallback would leave the close step with no canonical instruction at all: ' + r.stdout)
})

test('AC-20260823-03-11: WHEN the review driver processes a spec whose frontmatter reads "tier: standard   # any note" THE SYSTEM passes exactly "standard" as --tier, so the ledger row it produces carries "tier":"standard" with no "#" (rv_e83659d49386, the same inline-comment mechanism that polluted seven live ledger rows)', () => {
  const root = fs.realpathSync(tmpdir('rvdrv-fm11'))
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
  const diffBase = g('rev-parse', 'HEAD').trim()
  fs.mkdirSync(path.join(root, 'specs/20260820'), { recursive: true })
  const spec = path.join(root, 'specs/20260820/99-drv-fm11.md')
  fs.writeFileSync(spec, specBody({ diffBase, tier: 'standard   # any note', acId: 'AC-20260820-99-3' }))
  fs.writeFileSync(path.join(root, 'src/foo.js'), 'module.exports = () => 42\n')
  fs.writeFileSync(path.join(root, 'tests/foo.test.js'), GREEN_TEST.replace('AC-20260820-99-1', 'AC-20260820-99-3'))
  g('add', '-A'); g('commit', '-q', '-m', 'implement')

  toReviewer({ root, spec })
  const returnFile = returnFileWith('rvdrv-fm11-clean', CLEAN_RETURN)
  run(root, spec, '--mark', 'reviewer-returned', '--file', returnFile)
  assert.strictEqual(stateOf(root, spec), 'DISPOSITIONS', 'setup: a returned CLEAN, zero-survivor result must land DISPOSITIONS')

  const ledger = path.join(root, '.claude/spec-runs.jsonl')
  const r = run(root, spec, '--mark', 'dispositions', '--waived', '0', '--rejected', '0', '--fix-dispatched', '0')
  assert.strictEqual(r.status, 0, 'a zero-survivor, zero-finding disposition must be accepted even when tier carries a comment: ' + r.stdout + r.stderr)

  const rows = fs.readFileSync(ledger, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l))
  const row = rows[rows.length - 1]
  assert.strictEqual(row.tier, 'standard',
    'the driver reads tier via fmVal and passes it verbatim as --tier to verdict.js — a frontmatter value carrying an inline comment must be stripped to exactly "standard" before it reaches the ledger row, or the comment text becomes part of the durable tier field, exactly rv_e83659d49386\'s mechanism: got ' + JSON.stringify(row.tier))
  assert.ok(!row.tier.includes('#'),
    'the ledger row\'s tier field must never carry a "#" — a surviving comment fragment here corrupts every downstream tier===\'critical\' comparison and tier-economics derivation reading this row: got ' + JSON.stringify(row.tier))
})

// specs/20260823/05-replay-unattended-hardening.md D3 (rv_387d84a3b424's replay):
// replay.js --select emits a spec's build_base ref verbatim — typically the MOVING ref "main",
// stale the instant the review's own merge lands (observed: reconcile exit 3, phantom out-of-plan
// and unrealized files, until hand-pinned to the true pre-image sha). The close commit is the last
// moment a symbolic base ref and the true pre-image coincide, so the driver stamps a durable
// diff_base into the spec frontmatter at the SAME implementing -> done edit that flips status —
// but only when the frontmatter carries no diff_base already, since an existing pin (however it
// got there) must never be silently repointed. AC-20260823-05-7.

function noDiffBaseSpecBody({ status = 'implementing', tier = 'standard', buildBaseRef, acId }) {
  return `---
status: ${status}
tier: ${tier}
build_base: ${buildBaseRef}
---
# Driver Test Spec (no diff_base)

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

function makeNoDiffBaseHost() {
  const root = fs.realpathSync(tmpdir('rvdrv-stamp'))
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
  // The work lands on a BRANCH, leaving `main` at the pre-image — committing the implementation
  // onto main itself would make `build_base: main` resolve to HEAD, an empty range, the exact
  // defect spec 20260901/01's review uncovered (every diff-scoped leg reports zero and passes,
  // and the reviewer is handed nothing). The driver refuses that range on the way in, so the
  // fixture has to model a real one. The AC under test is unchanged — only
  // build_base exists, and `rev-parse main` still names the sha the close flip must stamp.
  g('checkout', '-q', '-b', 'spec/99-drv-stamp')
  fs.mkdirSync(path.join(root, 'specs/20260820'), { recursive: true })
  const spec = path.join(root, 'specs/20260820/99-drv-stamp.md')
  fs.writeFileSync(spec, noDiffBaseSpecBody({ buildBaseRef: 'main', acId: 'AC-20260820-99-16' }))
  fs.writeFileSync(path.join(root, 'src/foo.js'), 'module.exports = () => 42\n')
  fs.writeFileSync(path.join(root, 'tests/foo.test.js'), GREEN_TEST.replace('AC-20260820-99-1', 'AC-20260820-99-16'))
  g('add', '-A'); g('commit', '-q', '-m', 'implement')
  return { root, spec, sidecar: spec.replace(/\.md$/, '.review') }
}

test('AC-20260823-05-7 / AC-20260824-06-11: WHEN the driver flips a spec whose frontmatter has build_base but no diff_base to status: done THE SYSTEM stamps diff_base: <sha> (the base ref resolved at flip time) into the frontmatter in the same edit, directly after build_base, with no inline comment, and that sha equals the close row\'s diff.base', () => {
  const host = makeNoDiffBaseHost()
  toReviewer(host)
  const beforeText = fs.readFileSync(host.spec, 'utf8')
  assert.doesNotMatch(beforeText, /^diff_base:/m,
    'fixture sanity: this spec must start with no diff_base line at all, or this test cannot tell a genuine ' +
    'stamp apart from a pre-existing value')

  const expectedSha = execFileSync('git', ['-C', host.root, 'rev-parse', 'main'], { encoding: 'utf8' }).trim()

  const returnFile = returnFileWith('rvdrv-stamp-clean', CLEAN_RETURN)
  run(host.root, host.spec, '--mark', 'reviewer-returned', '--file', returnFile)
  assert.strictEqual(stateOf(host.root, host.spec), 'DISPOSITIONS', 'setup: a returned CLEAN, zero-survivor result must land DISPOSITIONS')
  const r = run(host.root, host.spec, '--mark', 'dispositions', '--waived', '0', '--rejected', '0', '--fix-dispatched', '0')
  assert.strictEqual(r.status, 0, 'D3: the close flip must still succeed for a spec with no diff_base: ' + r.stdout + r.stderr)
  assert.strictEqual(stateOf(host.root, host.spec), 'CLOSE', 'D3: a zero-survivor disposition must still land CLOSE')

  const afterText = fs.readFileSync(host.spec, 'utf8')
  assert.match(afterText, /^status:\s*done$/m, 'D3: the flip must still write status: done alongside the stamp')
  const fmBlock = afterText.slice(0, afterText.indexOf('\n---', 4))
  const lines = fmBlock.split('\n')
  const buildIdx = lines.findIndex((l) => l.startsWith('build_base:'))
  const diffIdx = lines.findIndex((l) => l.startsWith('diff_base:'))
  assert.ok(buildIdx !== -1, 'sanity: build_base: must survive the flip: ' + fmBlock)
  assert.ok(diffIdx !== -1,
    'D3: a diff_base: line must be stamped into the frontmatter at the implementing -> done flip — without ' +
    'it replay.js --select has nothing durable to read once the review\'s merge makes build_base: main a ' +
    'moving, stale ref: ' + fmBlock)
  assert.strictEqual(diffIdx, buildIdx + 1,
    'D3 Contracts: the stamped diff_base: line must be inserted DIRECTLY AFTER the build_base: line — a ' +
    'stamp landing anywhere else deviates from the pinned frontmatter shape: ' + fmBlock)
  assert.strictEqual(lines[diffIdx].trim(), 'diff_base: ' + expectedSha,
    'D3: the stamped value must be EXACTLY "diff_base: <sha>" with no inline comment (the Contracts\' own ' +
    'comment is illustrative, never emitted) and no trailing text — the sha must be the review\'s own base ' +
    'ref (main) resolved at flip time: ' + JSON.stringify(lines[diffIdx]))

  const closeLedgerLines = fs.readFileSync(path.join(host.root, '.claude/spec-runs.jsonl'), 'utf8').trim().split('\n').filter(Boolean)
  const closeRow = JSON.parse(closeLedgerLines[closeLedgerLines.length - 1])
  assert.strictEqual(closeRow.diff && closeRow.diff.base, expectedSha,
    'AC-20260824-06-11: the close row\'s diff.base must equal the freshly-stamped diff_base sha — one ' +
    'resolution, two carriers (D4): a mismatch would mean the driver resolved the same base ref twice and ' +
    'got two different answers: ' + JSON.stringify(closeRow))
})

test('AC-20260823-05-7: WHEN the driver flips a spec whose frontmatter already carries a diff_base THE SYSTEM leaves that value byte-identical, never overwriting it', () => {
  const host = makeHost() // makeHost()'s specBody() already carries a diff_base line
  toReviewer(host)
  const beforeText = fs.readFileSync(host.spec, 'utf8')
  const beforeMatch = beforeText.match(/^diff_base:.*$/m)
  assert.ok(beforeMatch, 'fixture sanity: makeHost()\'s spec must already carry a diff_base line, or this test proves nothing about the absent-only guard')

  const returnFile = returnFileWith('rvdrv-stamp-existing', CLEAN_RETURN)
  run(host.root, host.spec, '--mark', 'reviewer-returned', '--file', returnFile)
  const r = run(host.root, host.spec, '--mark', 'dispositions', '--waived', '0', '--rejected', '0', '--fix-dispatched', '0')
  assert.strictEqual(r.status, 0, 'the close flip must succeed for a spec that already carries diff_base: ' + r.stdout + r.stderr)
  assert.strictEqual(stateOf(host.root, host.spec), 'CLOSE')

  const afterText = fs.readFileSync(host.spec, 'utf8')
  const afterMatches = afterText.match(/^diff_base:.*$/gm)
  assert.strictEqual(afterMatches.length, 1,
    'D3: an existing diff_base must never gain a SECOND diff_base line at the flip — an absent-only stamp ' +
    'must check for presence before writing, not just unconditionally append: ' + JSON.stringify(afterMatches))
  assert.strictEqual(afterMatches[0], beforeMatch[0],
    'D3: an existing diff_base value must be left BYTE-IDENTICAL by the close flip — overwriting it would ' +
    'silently repoint a review\'s pinned diff base after the fact: before=' + JSON.stringify(beforeMatch[0]) +
    ' after=' + JSON.stringify(afterMatches[0]))
})

function makeGotchasHost(n) {
  const host = makeHost({ gotchas: n })
  const g = (...a) => execFileSync('git', ['-C', host.root, ...a], { encoding: 'utf8' })
  toReviewer(host)
  run(host.root, host.spec, '--mark', 'reviewer-returned', '--file', returnFileWith('rvdrv-gotchas-' + n, CLEAN_RETURN))
  const d = run(host.root, host.spec, '--mark', 'dispositions', '--waived', '0', '--rejected', '0', '--fix-dispatched', '0')
  assert.strictEqual(stateOf(host.root, host.spec), 'CLOSE', 'setup precondition: dispositions must reach CLOSE: ' + d.stdout + d.stderr)
  return { ...host, g }
}

test('gotchas ratchet: the review row records the Gotchas count observed at verdict time, and an over-cap section that did not shrink refuses --mark closed', () => {
  const host = makeGotchasHost(20)
  const rows = fs.readFileSync(path.join(host.root, '.claude/spec-runs.jsonl'), 'utf8').trim().split('\n').map(l => JSON.parse(l))
  const row = rows[rows.length - 1]
  assert.strictEqual(row.stage, 'review')
  assert.strictEqual(row.gotchas, 20,
    'the review row must carry the derived Gotchas count — the ratchet baseline is derived from this observation, never attested: ' + JSON.stringify(row))
  const r = run(host.root, host.spec, '--mark', 'closed')
  assert.strictEqual(r.status, 2,
    'an over-cap section unchanged since the verdict must refuse the close — the prose-only duty is exactly what Prax skipped at 169/15: ' + r.stdout + r.stderr)
  assert.match(r.stdout + r.stderr, /20\/15/, 'the refusal must name the count and cap: ' + r.stdout + r.stderr)
  assert.match(r.stdout + r.stderr, /evict/i, 'the refusal must name the eviction remedy')
  assert.strictEqual(stateOf(host.root, host.spec), 'CLOSE')
})

test('gotchas ratchet: an over-cap section that lost one net entry since the verdict closes — no flag-day eviction', () => {
  const host = makeGotchasHost(20)
  rulesWithGotchas(host.root, 19)
  host.g('add', '-A'); host.g('commit', '-q', '-m', 'evict one')
  const r = run(host.root, host.spec, '--mark', 'closed')
  assert.strictEqual(r.status, 0,
    '19 entries against 20 at verdict is a net eviction and must close — refusing it reinstates the unmeetable gate: ' + r.stdout + r.stderr)
  assert.notStrictEqual(stateOf(host.root, host.spec), 'CLOSE', 'a ratchet-admitted close advances past CLOSE: ' + r.stdout)
})

test('gotchas ratchet: the CLOSE step names the over-cap count and the shrink requirement before the session folds', () => {
  const host = makeGotchasHost(20)
  const r = run(host.root, host.spec)
  assert.match(r.stdout, /Gotchas cap: 20\/15 at verdict — OVER CAP/,
    'the printed CLOSE step must carry the number the close will be judged against — a session that learns it only from the refusal folds first and evicts second: ' + r.stdout)
})
