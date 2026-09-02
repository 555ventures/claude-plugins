'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { execFileSync, spawnSync } = require('node:child_process')
const { SPEC, read, tmpdir, runNode, gitRepo } = require('../helpers')

// specs/20260819/02-mutation-replay.md (brief 14, 2026-08-19): the 2026-08-18 ad-hoc consult
// injection (specs/20260819/01-review-evidence-retention.md's Fable retainer pass) proved a
// known defect can be dropped into a just-CLEANed spec's tree and the standard reviewer
// dispatched blind against it — this file pins the deterministic half of that eval turned into
// a repeatable harness: spec/scripts/replay.js's flag modes (--due/--select/--setup/--apply/
// --score/--record/--stats/--teardown, D1-D9), the shipped corpus's structural shape (D11,
// AC-9), and spec-status.js's continued silence on an unrecognized ledger stage (AC-11). Every
// worktree-touching AC below runs against a synthetic throwaway git repo, never the real one —
// the main tree is never in scope for this harness by design (D4's marker-guarded teardown
// pins the mistake this session's own spike made once, accidentally worktreeing inside the repo).
//
// 2026-08-19 (independent review, four defects fixed in place — D3/D5/D7 amended): F1 — the old
// AC-4 pin built its worktree with a raw `git worktree add` instead of --setup, so the
// .replay-worktree marker never existed and its leak into base..HEAD was invisible to a green
// suite; AC-4 below now composes --setup then --apply and pins the marker's absence directly.
// F2 — --apply gained --subject with a structural refusal (a `replay:`-style leading token, or the
// class id — deliberately NOT a vocabulary blocklist, which would refuse this very spec's own real
// build subject 'build(20260819/02): scheduled mutation replay harness'); F3 — --select now prints parent+diffBase, resolved at the close commit's PARENT, never
// the close commit itself; F4 — --score now requires verdict:"CLEAN" plus a survivors array
// before scoring anything, so a crashed/malformed reviewer return can never silently become a
// `missed` data point.
//
// 2026-08-19 (fix iteration 2, this same review): F1's fix wrote the marker into the worktree's
// working tree and hid it via `git rev-parse --git-path info/exclude` run inside the worktree —
// but info/exclude is NOT per-worktree, so that call resolved to the MAIN repo's shared
// .git/info/exclude and the write landed in the HOST repo, surviving teardown and breaking this
// spec's own "the main tree is never touched" guarantee. No test in this file ever looked at the
// host repo's git config after --setup, on either pass — that is exactly how a fully green suite
// shipped this twice. AC-20260819-02-3 below now captures the host's .git/info/exclude and `git
// status --porcelain` BEFORE --setup and asserts both are unchanged after. The marker itself moved
// to `<git -C <dir> rev-parse --git-dir>/replay-worktree` (no leading dot) — the worktree's PRIVATE
// git dir, deleted for free by `git worktree remove` — so nothing enters the working tree at all.
//
// 2026-08-19 (specs/20260819/03-replay-first-run-fixes.md, a post-CLEAN consult on the harness
// above): D1 replaces --score's --file/--line with --patch, scoring off every hunk in the
// mutation's own patch instead of a single self-reported point (AC-1..AC-4; AC-10 retags the F4
// malformed-return pins above onto the new --patch invocation). D3/D4 add unresolved/setup-failed
// outcomes so a dismissed adjudication or a broken scratch-worktree setup is recorded instead of
// silently discarded (AC-5, AC-6). D5 makes --due/--select key off the last MEASUREMENT row
// (outcome caught/missed/leg-caught), never a non-measurement one (AC-7..AC-9). D6 adds the two
// new --stats buckets (AC-12). D7 tightens --record's validation matrix (AC-13). D9 makes --apply
// the harness's only patch emitter via a required --patch-out, canonical even against a hostile
// host git config (AC-14, AC-15). D10 makes --apply commit only the patch's own files via
// `git apply --index`, never `git add -A` (AC-16). D11 normalizes a survivor's path before
// matching (AC-17). Assumption A4 named a "three-value outcome-enum" pin as a second collision to
// retag alongside --score --file/--line — no such pin was ever present in this file (grepped for
// it; the only enum-adjacent assertions here are the outcome VALUES used inside fixtures, never a
// rejection of an out-of-enum value), so AC-20260819-03-11 is authored fresh rather than retagged.
// The real --score --file/--line collision is folded into the new AC-1/2/3/4/10 tests below,
// replacing the old AC-20260819-02-5 block. The two AC-20260819-02-4 --apply tests below gain
// --patch-out in place per A7 — their assertions and AC-IDs are untouched. A THIRD collision
// neither assumption named: D7 also drops --record's --file flag (files now derives from
// --patch), which both AC-20260819-02-6 tests below still passed — fixed in place (--file
// dropped from each invocation, the key-set assertion's "file" replaced by "files", a files-from-
// patch assertion added to each), AC-IDs kept since the invariant under test (D8's record/
// artifact shape) is unchanged, only its file-derivation mechanism is. Flagged in the build
// return as a File Plan gap the collision sweep should have caught.
//
// specs/20260823/05-replay-unattended-hardening.md (2026-08-23, rv_387d84a3b424's replay): the
// scheduled harness could not run unattended, twice over — `--setup` refused every in-repo `--dir`
// (forcing `/private/tmp`, where agent Edit/Write is classifier-denied) and `--select` emitted a
// moving-ref `diffBase` that goes stale the instant the review's own merge lands. D1/D2 narrow the
// `--setup` refusal to allow exactly `<root>/.claude/worktrees/`, self-provisioning the host's
// `info/exclude` when the ignore line is missing (AC-1..AC-4, AC-6). D4 makes `--select` read
// frontmatter at the CLOSE commit (not its parent, per the old F3 pin) and validate each base
// candidate — trying `diff_base` before `build_base`, the reverse of spec 20260819/02's original
// preference now that D3 (tests/review/review-driver.test.js) stamps `diff_base` durably at every
// close — via `git merge-base --is-ancestor`, refusing (exit 4) when nothing validates (AC-5, AC-8).
// Collision fix: AC-20260819-02-2's --select fixtures fed the old code fabricated 40-hex strings as
// diff_base/build_base, which the OLD code printed back verbatim with no resolution at all; the NEW
// ancestry-validated --select can never resolve a fake sha, so every such fixture below (AC-2's own
// row-selection/tie-break cases, and AC-20260819-03-9's setup-failed-retry case) is updated in place
// to use a REAL commit sha from the fixture's own history — AC-IDs kept since the invariants under
// test (critical-tier priority, latest-wins tie-break, setup-failed retry targeting) are unchanged,
// only the base value's shape is. The old build_base-wins-over-diff_base sub-case is retired outright
// (superseded by D4's reordering) and its coverage folds into the new AC-20260823-05-5 test.
//
// specs/20260826/01-replay-scratch-path-blindness.md (2026-08-26, rv_6229b7af0d0b's due replay,
// rp_02b3f1ee52f1): the scratch worktree root handed to the blind reviewer, and the marker in its
// private git dir, both named the harness itself — `.claude/worktrees/replay-<hex>` (copied from
// a doctrine example) and `replay-worktree`, the latter one `ls "$(git rev-parse --git-dir)"`
// away from inside the tree. D1 has `--setup` derive a build-shaped `{dir}` from the target spec
// itself via `merge-back.sh branch-for` (the sole owner of the build-worktree naming rule) plus a
// random suffix (A2: git refuses `worktree add` onto an existing non-empty dir); D2 refuses a
// caller `--dir` whose basename opens with "replay" (exit 3), mirroring `--apply --subject`'s
// existing structural refusal; D3 renames the marker `replay-worktree` -> `scratch-worktree` at
// every reading site, with no grandfathering in `--teardown` (A4: no marked tree existed at build
// time). AC-1..AC-4 below are new tests pinning the derivation, the refusal, and the rename;
// AC-20260823-05-6 and AC-20260819-02-8 further below are retagged AC-20260826-01-6 (SHALL
// CONTINUE TO) since D1/D2 narrow --setup's caller-supplied-`--dir` population without touching
// the outside-repo manual-fallback or unmarked-teardown-refusal arms they already pin; the four
// `replay-*`-basename in-repo `--dir` fixtures above (AC-20260823-05-1/-3/-4) are renamed
// `scratch-*` in place so they keep exercising the in-repo allow arm instead of tripping D2.

// specs/20260831/01-replay-range-materialization.md (2026-08-31, rv_128f1a459e42/rp_d4b6fcf66c93):
// the baseline worktree stood at the close commit's parent (F3), but a diff.dirty:true review
// row's judged range is completed by the close commit that follows it (range-identity spec
// 20260824/06 D3/D7) — a leg green over the close-commit tree could go red at the bare parent,
// and step 7 rung 3's retry-then-leg-caught path recorded a FALSE leg-caught, polluting the
// catch-rate. D1-D5 give --setup an optional --overlay <closeSha> (paired with the existing
// --commit <parentSha>): after standing the worktree up at --commit, the overlay diffs
// <commit>..<overlay>, drops every row under the D2 meta-prefix set (specs/, .claude/,
// docs/canonical/ — the three surfaces a close commit records the review's own outcome on), and
// checks out/removes the remaining non-meta rows as one commit (default subject "build:
// follow-up", refused with exit 2 when a caller-supplied --subject opens with "replay" — D5).
// --overlay must resolve to a strict descendant of --commit (D4, exit 4 otherwise, naming the
// --select remedy). --setup without --overlay stays byte-identical to today (D7) —
// AC-20260831-01-6 below retags the existing --setup tests (AC-20260826-01-1, AC-20260823-05-2)
// that already pin that exact byte-identical shape, in place, rather than duplicating them. D6
// adds a pristine-baseline verification to replay.md's own step 7 rung 3 (git reset --hard
// HEAD^, fresh manifest, re-run legs) before a still-red leg is ever recorded leg-caught — a
// still-red PRISTINE result routes to rung 4's question seam instead, since it is not
// mutation-caused. AC-20260831-01-7 pins step 1's --overlay invocation and step 7 rung 3's
// pristine-verification prose, section-scoped exactly like AC-20260823-09-9 below.

const SCRIPT = 'scripts/replay.js'

// D4 (specs/20260823/05): every --select fixture that supplies a base candidate must use a REAL
// commit sha — the new ancestry-validated --select rejects anything `git rev-parse --verify` can't
// resolve, so a fabricated hex string (the old fixture idiom) can never validate. This makes one
// commit and returns its sha for embedding as diff_base/build_base in a LATER commit's frontmatter.
function commitReal(root, relFile, content, msg) {
  const full = path.join(root, relFile)
  fs.mkdirSync(path.dirname(full), { recursive: true })
  fs.writeFileSync(full, content)
  execFileSync('git', ['-C', root, 'add', '-A'])
  execFileSync('git', ['-C', root, 'commit', '-q', '-m', msg])
  return execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
}

// specs/20260831/01: build a commit whose content is exactly the given {path: content|null} map
// (null = delete a path that must already exist) — used by the --overlay fixtures below to build
// a parent/close commit pair with a precise, individually-named non-meta/meta delta shape, rather
// than the two-content-versions-of-one-file shape commitSpecFlow was built for.
function commitFiles(root, files, msg) {
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(root, rel)
    if (content === null) {
      fs.unlinkSync(full)
    } else {
      fs.mkdirSync(path.dirname(full), { recursive: true })
      fs.writeFileSync(full, content)
    }
  }
  execFileSync('git', ['-C', root, 'add', '-A'])
  execFileSync('git', ['-C', root, 'commit', '-q', '-m', msg])
  return execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
}

// D2: whether `rel` is covered by the repo's ignore rules (`.gitignore` + `info/exclude` alike) —
// `git check-ignore -q` exits 0 when ignored, 1 when not; spawnSync (not execFileSync) since exit 1
// is an expected, not exceptional, outcome here.
function isIgnored(root, rel) {
  return spawnSync('git', ['-C', root, 'check-ignore', '-q', rel]).status === 0
}

// D4 (fix iteration 2, 2026-08-19): the marker lives at `<git -C <dir> rev-parse --git-dir>/
// scratch-worktree` — the worktree's PRIVATE git dir, never its working tree. D3
// (specs/20260826/01-replay-scratch-path-blindness.md) renamed the filename itself from
// `replay-worktree` to `scratch-worktree`; both AC-3 and AC-8 resolve the marker's real location
// through this helper rather than guessing a path, so a future relocation of the marker breaks
// this helper in one place instead of desyncing every test that hardcodes it.
function markerPath(dir) {
  const gitDirRaw = execFileSync('git', ['-C', dir, 'rev-parse', '--git-dir'], { encoding: 'utf8' }).trim()
  const gitDirAbs = path.isAbsolute(gitDirRaw) ? gitDirRaw : path.resolve(dir, gitDirRaw)
  return path.join(gitDirAbs, 'scratch-worktree')
}

function writeLedger(root, rows) {
  fs.mkdirSync(path.join(root, '.claude'), { recursive: true })
  fs.writeFileSync(path.join(root, '.claude/spec-runs.jsonl'), rows.map(r => JSON.stringify(r)).join('\n') + '\n')
}

function reviewRow(n, extra = {}) {
  return {
    ts: `2026-08-${String(10 + n).padStart(2, '0')}T00:00:00Z`, stage: 'review',
    spec: `specs/x${n}.md`, runId: `rv_${String(n).padStart(12, '0')}`, verdict: 'CLEAN', ...extra,
  }
}

function replayLedgerRow(n, extra = {}) {
  return {
    ts: `2026-08-${String(10 + n).padStart(2, '0')}T00:00:00Z`, stage: 'replay',
    spec: 'specs/x.md', runId: `rp_${String(n).padStart(12, '0')}`,
    reviewRunId: `rv_${String(n).padStart(12, '0')}`, class: 'silent-fallback', file: 'lib/x.js',
    legs: 'green', outcome: 'caught', tokens: 100, ...extra,
  }
}

// F3 (2026-08-19 review): --select must resolve diffBase from the spec's frontmatter AT THE
// CLOSE COMMIT'S PARENT, not the close commit itself — so every spec fixture below is built as
// TWO commits (the pre-review tree, then the close), letting a test assert against the parent
// sha independently of the close sha.
function commitSpecFlow(root, relPath, parentContent, closeContent) {
  const full = path.join(root, relPath)
  fs.mkdirSync(path.dirname(full), { recursive: true })
  fs.writeFileSync(full, parentContent)
  execFileSync('git', ['-C', root, 'add', '-A'])
  execFileSync('git', ['-C', root, 'commit', '-q', '-m', 'add ' + relPath])
  const parent = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
  fs.writeFileSync(full, closeContent)
  execFileSync('git', ['-C', root, 'add', '-A'])
  execFileSync('git', ['-C', root, 'commit', '-q', '-m', 'close ' + relPath])
  const commit = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
  return { parent, commit }
}

function writeWorkflowReturn(dir, name, survivors) {
  const p = path.join(dir, name)
  // F4 (2026-08-19 review): the reviewer's real return is ALWAYS verdict:"CLEAN" with a
  // survivors array — "FINDINGS" is not a shape reviewer.md ever emits; the old fixture's
  // survivors.length-conditional verdict was itself stale and is fixed here, not just at the
  // call sites that read it.
  fs.writeFileSync(p, JSON.stringify({ verdict: 'CLEAN', survivors, killed: 0 }))
  return p
}

// F1 (2026-08-19 review): every worktree an AC-4 test composes must come from --setup itself,
// never a raw `git worktree add` — that substitution is exactly what let the marker-leak defect
// ship undetected. This fixture builds the base repo + mutation patch only; the worktree is
// always stood up by the test via `runNode(SCRIPT, ['--setup', ...])`.
function initApplyFixture(prefix) {
  const root = fs.realpathSync(tmpdir(prefix + '-repo'))
  gitRepo(root)
  fs.mkdirSync(path.join(root, 'lib'), { recursive: true })
  fs.writeFileSync(path.join(root, 'lib/x.js'), 'a\nb\nc\n')
  execFileSync('git', ['-C', root, 'add', '-A'])
  execFileSync('git', ['-C', root, 'commit', '-q', '-m', 'add lib/x.js'])
  const baseSha = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()

  const scratch = path.join(fs.realpathSync(tmpdir(prefix + '-scratch')), 'scratch')
  execFileSync('git', ['-C', root, 'worktree', 'add', '--detach', scratch, baseSha])
  fs.writeFileSync(path.join(scratch, 'lib/x.js'), 'a\nB\nc\n')
  const patch = execFileSync('git', ['-C', scratch, 'diff'], { encoding: 'utf8' })
  execFileSync('git', ['-C', root, 'worktree', 'remove', '--force', scratch])
  const patchFile = path.join(fs.realpathSync(tmpdir(prefix + '-patch')), 'mutation.patch')
  fs.writeFileSync(patchFile, patch)
  return { root, baseSha, patchFile }
}

test('AC-20260819-02-1: --due exits 0 printing "due reviewsSince=N" once N review rows have landed after the last replay row, and exits 1 below the threshold', () => {
  const dueDir = fs.realpathSync(tmpdir('replay-due'))
  writeLedger(dueDir, [1, 2, 3, 4, 5].map(n => reviewRow(n)))
  const due = runNode(SCRIPT, ['--due'], { cwd: dueDir })
  assert.strictEqual(due.status, 0,
    'D2: 5 review rows with zero prior replay rows must cross the >=5 cadence threshold and exit 0 — a ' +
    'wrong threshold here means /spec:replay never reminds anyone: ' + due.stderr)
  assert.match(due.stdout, /due reviewsSince=5/,
    'D2 pins the exact print string "due reviewsSince=N" — review.md\'s D13 warn line and any session ' +
    'parsing this output depends on the literal wording: ' + due.stdout)

  const notDueDir = fs.realpathSync(tmpdir('replay-due'))
  writeLedger(notDueDir, [replayLedgerRow(1), reviewRow(2), reviewRow(3), reviewRow(4), reviewRow(5)])
  const notDue = runNode(SCRIPT, ['--due'], { cwd: notDueDir })
  assert.strictEqual(notDue.status, 1,
    'D2: only 4 review rows follow the one replay row in read order — the count must reset at the last ' +
    'replay row instead of accumulating across it, or replay would fire on every single review forever: ' +
    notDue.stderr)
})

test('AC-20260819-03-7: --due keeps counting review rows across a trailing setup-failed replay row instead of resetting the clock, since a non-measurement row never counts as the last replay row', () => {
  const dir = fs.realpathSync(tmpdir('replay-due-nonmeasurement'))
  writeLedger(dir, [
    replayLedgerRow(1, { outcome: 'caught' }),
    reviewRow(2), reviewRow(3), reviewRow(4), reviewRow(5), reviewRow(6),
    replayLedgerRow(7, { outcome: 'setup-failed', class: null, legs: 'none' }),
  ])
  const r = runNode(SCRIPT, ['--due'], { cwd: dir })
  assert.strictEqual(r.status, 0,
    'D5: 5 review rows followed the last MEASUREMENT row (the caught row) and must cross the due threshold ' +
    'even though a setup-failed row trails them — a setup-failed row is not itself a measurement and must ' +
    'never reset the window: ' + r.stderr)
  assert.match(r.stdout, /due reviewsSince=5/,
    'D5: reviewsSince must count from the last measurement row (5 review rows), not be reset or inflated by ' +
    'the trailing non-measurement setup-failed row: ' + r.stdout)
})

test('AC-20260819-03-8: --due CONTINUES TO report not due and exit 1 when fewer than 5 review rows follow the last measurement replay row', () => {
  const dir = fs.realpathSync(tmpdir('replay-due-notdue'))
  writeLedger(dir, [replayLedgerRow(1, { outcome: 'caught' }), reviewRow(2), reviewRow(3), reviewRow(4)])
  const r = runNode(SCRIPT, ['--due'], { cwd: dir })
  assert.strictEqual(r.status, 1,
    'D5: only 4 review rows follow the last measurement row — this must stay below the cadence threshold ' +
    'and exit 1, or replay would fire before the Decision\'s own window closes: ' + r.stderr)
})

test('AC-20260819-02-2 (collision fix, specs/20260823/05): --select prints all five fields spec/reviewRunId/commit/parent/diffBase, preferring a critical-tier CLEAN row over a later standard-tier one, and ties resolve to the latest row', () => {
  const root = fs.realpathSync(tmpdir('replay-select'))
  gitRepo(root)
  // D4 (2026-08-23): every diff_base value below is now a REAL ancestor commit sha — the old
  // fabricated hex ('aaaa000...aaaa') can never resolve under the new ancestry-validated --select.
  const aAncestor = commitReal(root, 'lib/a-pre.js', 'a\n', 'pre a')
  const a = commitSpecFlow(root, 'specs/a.md',
    `---\ndiff_base: ${aAncestor}\n---\n# a\n`,
    `---\ndiff_base: ${aAncestor}\nstatus: done\n---\n# a\n`)
  const bAncestor = commitReal(root, 'lib/b-pre.js', 'b\n', 'pre b')
  const b = commitSpecFlow(root, 'specs/b.md',
    `---\ndiff_base: ${bAncestor}\n---\n# b\n`,
    `---\ndiff_base: ${bAncestor}\nstatus: done\n---\n# b\n`)
  writeLedger(root, [
    { ts: '2026-08-10T00:00:00Z', stage: 'review', spec: 'specs/a.md', runId: 'rv_aaaaaaaaaaaa', verdict: 'CLEAN', tier: 'critical' },
    { ts: '2026-08-11T00:00:00Z', stage: 'review', spec: 'specs/b.md', runId: 'rv_bbbbbbbbbbbb', verdict: 'CLEAN', tier: 'standard' },
  ])
  const r = runNode(SCRIPT, ['--select'], { cwd: root })
  assert.strictEqual(r.status, 0, 'D3: --select over a valid CLEAN-row window must succeed: ' + r.stderr)
  assert.match(r.stdout, /spec=specs\/a\.md/,
    'D3: the critical-tier row must win even though it is earlier in the window — a later standard-tier ' +
    'row bumping it out defeats the "critical-tier priority sampling" the Decision states: ' + r.stdout)
  assert.match(r.stdout, /reviewRunId=rv_aaaaaaaaaaaa/,
    'D3: the printed reviewRunId must be the selected row\'s own runId, not the other candidate\'s: ' + r.stdout)
  assert.match(r.stdout, new RegExp('commit=' + a.commit),
    'D3: commit must be the exact close commit for the SELECTED spec\'s path (`git log -1 --format=%H -- ' +
    '<path>`), never HEAD or the other spec\'s commit — a wrong commit means --setup worktrees the wrong tree: ' +
    r.stdout)
  assert.match(r.stdout, new RegExp('parent=' + a.parent),
    'F3 regression pin (2026-08-19 review): parent must be the close commit\'s OWN parent, printed as its ' +
    'own field — the first review found the worktree standing up at the close commit itself, handing the ' +
    'blind reviewer a ~3-line needle-only diff instead of the real base-to-HEAD diff a review judges: ' + r.stdout)
  assert.match(r.stdout, new RegExp('diffBase=' + aAncestor),
    'D4 (2026-08-23): diffBase must be the validated ancestor sha read from the selected spec\'s ' +
    'frontmatter AT THE CLOSE commit — reading a different commit or printing an unvalidated value would ' +
    'drift from the base review.md itself diffed against: ' + r.stdout)

  const root2 = fs.realpathSync(tmpdir('replay-select-tie'))
  gitRepo(root2)
  const dAncestor = commitReal(root2, 'lib/d-pre.js', 'd\n', 'pre d')
  const d = commitSpecFlow(root2, 'specs/d.md',
    `---\ndiff_base: ${dAncestor}\n---\n# d\n`,
    `---\ndiff_base: ${dAncestor}\nstatus: done\n---\n# d\n`)
  const cAncestor = commitReal(root2, 'lib/c-pre.js', 'c\n', 'pre c')
  commitSpecFlow(root2, 'specs/c.md',
    `---\ndiff_base: ${cAncestor}\n---\n# c\n`,
    `---\ndiff_base: ${cAncestor}\nstatus: done\n---\n# c\n`)
  writeLedger(root2, [
    { ts: '2026-08-10T00:00:00Z', stage: 'review', spec: 'specs/d.md', runId: 'rv_dddddddddddd', verdict: 'CLEAN', tier: 'standard' },
    { ts: '2026-08-11T00:00:00Z', stage: 'review', spec: 'specs/c.md', runId: 'rv_cccccccccccc', verdict: 'CLEAN', tier: 'standard' },
  ])
  const r2 = runNode(SCRIPT, ['--select'], { cwd: root2 })
  assert.strictEqual(r2.status, 0, 'D3: a same-tier tie must still resolve and succeed: ' + r2.stderr)
  assert.match(r2.stdout, /spec=specs\/c\.md/,
    'D3: no critical row exists in this window, so the tie between two standard rows must resolve to the ' +
    'LATEST one — resolving to the earliest would replay the same stale spec forever: ' + r2.stdout)

  const root4 = fs.realpathSync(tmpdir('replay-select-nobase'))
  gitRepo(root4)
  commitSpecFlow(root4, 'specs/f.md',
    '---\nstatus: implementing\n---\n# f\n',
    '---\nstatus: done\n---\n# f\n')
  writeLedger(root4, [
    { ts: '2026-08-10T00:00:00Z', stage: 'review', spec: 'specs/f.md', runId: 'rv_ffffffffffff', verdict: 'CLEAN' },
  ])
  const r4 = runNode(SCRIPT, ['--select'], { cwd: root4 })
  assert.strictEqual(r4.status, 4,
    'D3/D4: a selected spec carrying NEITHER build_base nor diff_base at the close commit must exit 4 — ' +
    'printing a blank or fabricated diffBase would hand --setup a base nobody can verify: ' + r4.stdout)
  assert.strictEqual(r4.stdout.trim(), '',
    'D3: an unresolvable diffBase is a git-operation failure, not a partial selection — nothing must print ' +
    'on stdout: ' + JSON.stringify(r4.stdout))
})

// specs/20260823/09-replay-baseline-attribution.md (2026-08-23, rp_1b176ebff5c7): the harness
// treated every red review leg as evidence about the planted defect, but ~1 in 4 selectable CLEAN
// rows closes with a leg legitimately red for pre-existing, sanctioned reasons — the live incident
// recorded `--legs green` on a target whose CLEAN close carried a sanctioned red reconcile leg,
// falsifying the ledger. D1 has --select derive the baseline straight from the selected review
// row's OWN `legs` array (zero extra leg runs) and append `baselineRed=`/`baselineLegs=` after the
// five existing tokens. The three tests below pin each of D1's three baseline shapes.
test('AC-20260823-09-1: --select appends baselineRed naming the one pre-existing red leg and baselineLegs listing every leg in the row\'s own array order, derived from the selected review row\'s legs array with zero extra leg runs', () => {
  const root = fs.realpathSync(tmpdir('replay-select-baseline-red'))
  gitRepo(root)
  const ancestor = commitReal(root, 'lib/pre.js', 'a\n', 'pre')
  commitSpecFlow(root, 'specs/a.md',
    `---\ndiff_base: ${ancestor}\n---\n# a\n`,
    `---\ndiff_base: ${ancestor}\nstatus: done\n---\n# a\n`)
  writeLedger(root, [
    {
      ts: '2026-08-10T00:00:00Z', stage: 'review', spec: 'specs/a.md', runId: 'rv_aaaaaaaaaaaa',
      verdict: 'CLEAN', tier: 'standard',
      legs: [{ leg: 'ci', exit: 0 }, { leg: 'gate', exit: 0 }, { leg: 'reconcile', exit: 3 }],
    },
  ])
  const r = runNode(SCRIPT, ['--select'], { cwd: root })
  assert.strictEqual(r.status, 0,
    'D1: a CLEAN row carrying a legs array with one pre-existing red leg must still select successfully: ' + r.stderr)
  assert.match(r.stdout, / baselineRed=reconcile baselineLegs=ci,gate,reconcile(\s|$)/,
    'D1/AC-1: baselineRed must name exactly the one leg red in the row\'s own legs array (exit!==0), and ' +
    'baselineLegs must list every leg name in the array\'s own order — a wrong or re-derived value here means ' +
    'the harness either ran a redundant leg pass or attributed the wrong pre-existing red into step 7: ' + r.stdout)
})

test('AC-20260823-09-2: --select emits baselineRed=none — not empty, not unknown — when the selected row\'s legs array holds no leg redder than exit 0 besides a smoke leg at exit 4, since exit-4 smoke is inert, never red', () => {
  const root = fs.realpathSync(tmpdir('replay-select-baseline-none'))
  gitRepo(root)
  const ancestor = commitReal(root, 'lib/pre.js', 'a\n', 'pre')
  commitSpecFlow(root, 'specs/a.md',
    `---\ndiff_base: ${ancestor}\n---\n# a\n`,
    `---\ndiff_base: ${ancestor}\nstatus: done\n---\n# a\n`)
  writeLedger(root, [
    {
      ts: '2026-08-10T00:00:00Z', stage: 'review', spec: 'specs/a.md', runId: 'rv_aaaaaaaaaaaa',
      verdict: 'CLEAN', tier: 'standard',
      legs: [{ leg: 'gate', exit: 0 }, { leg: 'smoke', exit: 4 }, { leg: 'ci', exit: 0 }],
    },
  ])
  const r = runNode(SCRIPT, ['--select'], { cwd: root })
  assert.strictEqual(r.status, 0,
    'D1: a row whose only non-zero-exit leg is an inert smoke must still select successfully: ' + r.stderr)
  assert.match(r.stdout, / baselineRed=none baselineLegs=gate,smoke,ci(\s|$)/,
    'D1/AC-2: baselineRed must read "none" — review-legs.js\'s own red definition exempts smoke exit 4 as ' +
    '"inert", not red — while baselineLegs must still LIST smoke by presence; collapsing presence into ' +
    'redness would wrongly explain away a genuinely NEWLY-red smoke leg later in step 7: ' + r.stdout)
})

test('AC-20260823-09-3: --select emits baselineRed=unknown baselineLegs=unknown when the selected review row carries no legs array at all, since there is no recorded baseline to derive attribution from', () => {
  const root = fs.realpathSync(tmpdir('replay-select-baseline-unknown'))
  gitRepo(root)
  const ancestor = commitReal(root, 'lib/pre.js', 'a\n', 'pre')
  commitSpecFlow(root, 'specs/a.md',
    `---\ndiff_base: ${ancestor}\n---\n# a\n`,
    `---\ndiff_base: ${ancestor}\nstatus: done\n---\n# a\n`)
  writeLedger(root, [
    { ts: '2026-08-10T00:00:00Z', stage: 'review', spec: 'specs/a.md', runId: 'rv_aaaaaaaaaaaa', verdict: 'CLEAN', tier: 'standard' },
  ])
  const r = runNode(SCRIPT, ['--select'], { cwd: root })
  assert.strictEqual(r.status, 0,
    'D1: a legacy row with no legs array (measured 2026-08-23: 3 such rows) must still select successfully: ' + r.stderr)
  assert.match(r.stdout, / baselineRed=unknown baselineLegs=unknown(\s|$)/,
    'D1/AC-3: an absent legs array must emit unknown for BOTH tokens, never an empty string or "none" — ' +
    '"none" asserts a verified-clean baseline, while "unknown" is honest about a baseline that was never ' +
    'recorded at all: ' + r.stdout)

  const root2 = fs.realpathSync(tmpdir('replay-select-baseline-unknown-empty'))
  gitRepo(root2)
  const ancestor2 = commitReal(root2, 'lib/pre2.js', 'a\n', 'pre')
  commitSpecFlow(root2, 'specs/a.md',
    `---\ndiff_base: ${ancestor2}\n---\n# a\n`,
    `---\ndiff_base: ${ancestor2}\nstatus: done\n---\n# a\n`)
  writeLedger(root2, [
    { ts: '2026-08-10T00:00:00Z', stage: 'review', spec: 'specs/a.md', runId: 'rv_bbbbbbbbbbbb', verdict: 'CLEAN', tier: 'standard', legs: [] },
  ])
  const r2 = runNode(SCRIPT, ['--select'], { cwd: root2 })
  assert.strictEqual(r2.status, 0, 'D1: a row carrying an EMPTY legs array must still select successfully: ' + r2.stderr)
  assert.match(r2.stdout, / baselineRed=unknown baselineLegs=unknown(\s|$)/,
    'D1/Contracts: an empty legs array is contract-equivalent to an absent one ("no (or empty) legs array") — ' +
    'emitting "none" here would falsely assert a verified-clean baseline for a row that recorded no legs at all: ' + r2.stdout)
})

test('AC-20260823-05-5: --select tries diff_base BEFORE build_base — a validated diff_base wins outright, and build_base is the fallback only when diff_base is absent', () => {
  // D4 reorders spec 20260819/02's original preference (build_base first): D3 now stamps diff_base
  // durably at every close, making it the trustworthy pin, so it is tried first.
  const root = fs.realpathSync(tmpdir('replay-select-priority'))
  gitRepo(root)
  const ancestor = commitReal(root, 'lib/pre.js', 'a\n', 'pre h')
  commitReal(root, 'lib/mid.js', 'b\n', 'mid h')
  // The spec file must already exist at the PARENT (with no base fields at all) so that this
  // fixture can only pass once --select reads frontmatter at the CLOSE commit — reading at the
  // parent (today's behavior) finds a base-less frontmatter and can never see the stamped values.
  const parent = commitReal(root, 'specs/h.md', '---\nstatus: implementing\n---\n# h\n', 'stub h')
  const close = commitReal(root, 'specs/h.md',
    `---\nbuild_base: 0000000000000000000000000000000000dead\ndiff_base: ${ancestor}\nstatus: done\n---\n# h\n`,
    'close specs/h.md')
  writeLedger(root, [
    { ts: '2026-08-23T00:00:00Z', stage: 'review', spec: 'specs/h.md', runId: 'rv_hhhhhhhhhhhh', verdict: 'CLEAN' },
  ])
  const r = runNode(SCRIPT, ['--select'], { cwd: root })
  assert.strictEqual(r.status, 0, 'D4: a validating diff_base candidate must select cleanly: ' + r.stderr)
  assert.match(r.stdout, new RegExp('diffBase=' + ancestor),
    'D4: diff_base must win once it validates as an ancestor of the close commit\'s parent, even with a ' +
    'build_base value also present — trying build_base first (the old order) would print the wrong base ' +
    'the moment a stamped diff_base coexists with a stale build_base: ' + r.stdout)
  assert.match(r.stdout, new RegExp('parent=' + parent), 'D4: parent must stay the close commit\'s own parent: ' + r.stdout)
  assert.match(r.stdout, new RegExp('commit=' + close), 'D4: commit must stay the close commit itself: ' + r.stdout)
  assert.ok(!r.stdout.includes('0000000000000000000000000000000000dead'),
    'D4: the non-validating (and unresolvable) build_base value must never leak into the printed diffBase ' +
    'once diff_base has already validated: ' + r.stdout)

  const root2 = fs.realpathSync(tmpdir('replay-select-priority-fallback'))
  gitRepo(root2)
  const ancestor2 = commitReal(root2, 'lib/pre.js', 'a\n', 'pre i')
  commitReal(root2, 'specs/i.md', `---\nstatus: implementing\n---\n# i\n`, 'stub i')
  const close2 = commitReal(root2, 'specs/i.md',
    `---\nbuild_base: ${ancestor2}\nstatus: done\n---\n# i\n`,
    'close specs/i.md')
  writeLedger(root2, [
    { ts: '2026-08-23T00:00:00Z', stage: 'review', spec: 'specs/i.md', runId: 'rv_iiiiiiiiiiii', verdict: 'CLEAN' },
  ])
  const r2 = runNode(SCRIPT, ['--select'], { cwd: root2 })
  assert.strictEqual(r2.status, 0, 'D4: build_base alone (no diff_base present) must still validate and select: ' + r2.stderr)
  assert.match(r2.stdout, new RegExp('diffBase=' + ancestor2),
    'D4: with no diff_base present, build_base is the fallback candidate and must be emitted once it ' +
    'validates — a spec closed before diff_base stamping existed (D3) must still select cleanly: ' + r2.stdout)
})

test('AC-20260823-05-8: --select exits 4 naming the stale-base cause and the stamped-at-close remedy when the only base candidate is a ref that has since absorbed the merge (a descendant, not an ancestor, of the close commit\'s parent)', () => {
  // A3 (spiked, spec 20260823/05): `git merge-base --is-ancestor main <close parent>` exits 1 once
  // main has merged the spec's own branch back in — this fixture reproduces exactly that shape.
  const root = fs.realpathSync(tmpdir('replay-select-descendant'))
  gitRepo(root)
  execFileSync('git', ['-C', root, 'checkout', '-q', '-b', 'feature'])
  commitReal(root, 'lib/feature-pre.js', 'a\n', 'feature pre')
  // The spec file must already exist at the PARENT (implementing, no base fields) so --select can
  // resolve a commit/parent pair at all — build_base only appears at the close commit itself,
  // matching the real shape a build produces.
  const parent = commitReal(root, 'specs/j.md', '---\nstatus: implementing\n---\n# j\n', 'stub j')
  const close = commitReal(root, 'specs/j.md',
    '---\nbuild_base: main\nstatus: done\n---\n# j\n', 'close specs/j.md')
  execFileSync('git', ['-C', root, 'checkout', '-q', 'main'])
  execFileSync('git', ['-C', root, 'merge', '-q', '--no-ff', '-m', 'merge feature', 'feature'])
  execFileSync('git', ['-C', root, 'branch', '-D', 'feature'])
  writeLedger(root, [
    { ts: '2026-08-23T00:00:00Z', stage: 'review', spec: 'specs/j.md', runId: 'rv_jjjjjjjjjjjj', verdict: 'CLEAN' },
  ])
  const sanity = spawnSync('git', ['-C', root, 'merge-base', '--is-ancestor', 'main', parent])
  assert.notStrictEqual(sanity.status, 0,
    'sanity: this fixture must reproduce the actual distortion — main must NOT be an ancestor of the ' +
    'close commit\'s parent (it absorbed the merge and moved past it), or this test proves nothing about D4\'s ' +
    'refusal arm')
  const r = runNode(SCRIPT, ['--select'], { cwd: root })
  assert.strictEqual(r.status, 4,
    'D4: build_base=main resolving to a commit that is a DESCENDANT of the close parent (post-merge) must ' +
    'be refused, never silently emitted as diffBase — a wrong base here would distort the very measurement ' +
    'replay exists to produce: ' + JSON.stringify({ status: r.status, stdout: r.stdout }))
  assert.strictEqual(r.stdout.trim(), '',
    'D4: a stale-base refusal is a git-operation failure, not a partial selection — no spec= line may print: ' +
    JSON.stringify(r.stdout))
  assert.doesNotMatch(r.stdout, /spec=/, 'D4: no spec= selection line may print on a refused --select: ' + r.stdout)
  assert.match(r.stderr, /main/,
    'D4: the refusal must name the candidate value tried (main) so the cause is on the record: ' + r.stderr)
  assert.match(r.stderr, /no longer names the pre-image|moving ref|merge|stale/i,
    'D4: the refusal must state that a moving ref no longer names the pre-image once the review\'s merge ' +
    'lands — a generic git-failure message here would leave the actual cause undiagnosed: ' + r.stderr)
  assert.match(r.stderr, /diff_base|stamp/i,
    'D4: the refusal must give the remedy — reviews closed from this version on stamp diff_base at close ' +
    '(D3), so the NEXT review\'s replay selects cleanly: ' + r.stderr)
})

test('AC-20260819-03-9 (collision fix, specs/20260823/05): --select still selects a CLEAN review row when it is followed only by a setup-failed replay row, so the retry targets the same review', () => {
  const root = fs.realpathSync(tmpdir('replay-select-setupfailed'))
  gitRepo(root)
  // D4 (2026-08-23): a REAL ancestor sha, not a fabricated hex — the new ancestry-validated
  // --select can never resolve a fake sha, and this test's own claim (a successful selection)
  // would otherwise become unreachable.
  const gAncestor = commitReal(root, 'lib/g-pre.js', 'g\n', 'pre g')
  commitSpecFlow(root, 'specs/g.md',
    `---\ndiff_base: ${gAncestor}\n---\n# g\n`,
    `---\ndiff_base: ${gAncestor}\nstatus: done\n---\n# g\n`)
  writeLedger(root, [
    { ts: '2026-08-10T00:00:00Z', stage: 'review', spec: 'specs/g.md', runId: 'rv_gggggggggggg', verdict: 'CLEAN' },
    { ts: '2026-08-11T00:00:00Z', stage: 'replay', spec: 'specs/g.md', runId: 'rp_gggggggggggg',
      reviewRunId: 'rv_gggggggggggg', class: null, files: null, legs: 'none', outcome: 'setup-failed', tokens: 0 },
  ])
  const r = runNode(SCRIPT, ['--select'], { cwd: root })
  assert.strictEqual(r.status, 0,
    'D5: a CLEAN review followed only by a setup-failed replay attempt must still be selectable — a broken ' +
    'setup must get RETRIED at the next review, not leave the review permanently unmeasured: ' + r.stderr)
  assert.match(r.stdout, /spec=specs\/g\.md/,
    'D5: the retry must target the SAME review that setup-failed on — selecting a different spec (or ' +
    'finding nothing due) would abandon the retry the Decision requires: ' + r.stdout)
  assert.match(r.stdout, /reviewRunId=rv_gggggggggggg/,
    'D5: the reviewRunId printed must be the same review\'s own runId, proving this is a retry of that ' +
    'exact run and not some other selection: ' + r.stdout)
})

// specs/20260823/05-replay-unattended-hardening.md D1 (2026-08-23, rv_387d84a3b424): the old
// combined refuse/accept test above split three ways below — AC-1 (new: the .claude/worktrees/
// allow arm), AC-2 (retagged: the surviving in-repo refusal, now narrowed to non-worktrees paths),
// AC-6 (retagged verbatim, SHALL CONTINUE TO: the outside-repo accept path with all its
// fix-iteration-2 regression pins intact, never weakened).

test('AC-20260823-05-1: --setup accepts a --dir inside <root>/.claude/worktrees/ in a repo that already ignores that path, creating the marker-carrying detached worktree there and exiting 0; a follow-up --teardown removes it', () => {
  const root = fs.realpathSync(tmpdir('replay-setup-wt-ok'))
  gitRepo(root) // gitRepo()'s own fixture .gitignore already covers .claude/worktrees/
  const sha = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
  // D2 (specs/20260826/01): renamed from replay-x — a basename opening with "replay" now trips
  // the new D2 refusal, which would sink this test's own AC-1 in-repo-allow claim under the wrong
  // arm entirely.
  assert.ok(isIgnored(root, '.claude/worktrees/scratch-x'),
    'sanity: this fixture\'s .gitignore must already cover .claude/worktrees/ — otherwise this test does ' +
    'not exercise the "already ignored" arm AC-1 names, it exercises D2\'s provisioning arm instead')

  const dir = path.join(root, '.claude/worktrees/scratch-x')
  const r = runNode(SCRIPT, ['--setup', '--commit', sha, '--dir', dir], { cwd: root })
  assert.strictEqual(r.status, 0,
    'D1: a --dir resolving inside <root>/.claude/worktrees/ must now be ACCEPTED — refusing it is exactly ' +
    'the defect that forced the replay harness into /private/tmp, where agent Edit/Write is classifier-' +
    'denied and the mutation-authoring worker blocked on manual approval on both live 2026-08-23 runs: ' + r.stderr)
  assert.match(r.stdout, new RegExp('setup dir=' + dir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ' commit=' + sha),
    'D1: the success line must print the resolved dir and commit exactly as every other --setup success ' +
    'does — this in-repo arm must not grow a different output shape: ' + r.stdout)

  const marker = markerPath(dir)
  assert.ok(fs.existsSync(marker),
    'D1/D3: the accepted in-repo worktree must still carry the scratch-worktree marker at its resolved ' +
    'private git dir path, exactly like the outside-repo path — --teardown\'s marker guard must work ' +
    'identically here: ' + marker)

  const teardown = runNode(SCRIPT, ['--teardown', '--dir', dir], { cwd: root })
  assert.strictEqual(teardown.status, 0,
    'D1: a --setup-created in-repo worktree must be removable by --teardown exactly like an outside one: ' +
    teardown.stderr)
  assert.ok(!fs.existsSync(dir), 'D1: teardown must remove the in-repo worktree directory: ' + dir)
})

// Vacuity note (2026-08-23, per this repo's own generalized-third-occurrence vacuous-rejection
// class, § Gotchas): this AC's own text says "CONTINUE TO refuse" — and it DOES already pass
// against today's script, since today refuses every in-repo --dir unconditionally, .claude/
// worktrees/ included. Kept as the correct post-implementation regression pin (D1 narrows the
// allow-list to exactly .claude/worktrees/; every other in-repo path must keep refusing) rather
// than reddened artificially. The lookalike-prefix sub-case below is the one assertion here that
// actually exercises new surface: it guards against a naive `dir.startsWith(path.join(root,
// '.claude/worktrees'))` implementation of D1 (a STRING-prefix check), which would wrongly accept
// `.claude/worktrees-evil/` — the same guard-by-name-not-location class this repo's own Gotchas
// record for the entrypoint conformance guard (specs/20260820/04).
// AC-20260831-01-6 (SHALL CONTINUE TO, specs/20260831/01): --setup without --overlay must keep
// refusing an in-repo --dir outside .claude/worktrees/ exactly as today — retagged in place.
test('AC-20260823-05-2 / AC-20260831-01-6: --setup CONTINUES TO refuse a --dir that resolves inside the repo root but NOT inside <root>/.claude/worktrees/, with exit 3 and nothing created — including a lookalike path that only shares a string prefix with .claude/worktrees/', () => {
  const root = fs.realpathSync(tmpdir('replay-setup-inside-notwt'))
  gitRepo(root)
  const sha = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()

  const dir = path.join(root, 'scratch')
  const r = runNode(SCRIPT, ['--setup', '--commit', sha, '--dir', dir], { cwd: root })
  assert.strictEqual(r.status, 3,
    'D1: an in-repo --dir OUTSIDE .claude/worktrees/ must keep the exit-3 refusal — widening the allow-list ' +
    'to "any in-repo path" is exactly the hole D1\'s Rationale rejects: ' + JSON.stringify({ status: r.status, stdout: r.stdout }))
  assert.ok(!fs.existsSync(dir),
    'D1: a refused --setup must create nothing — a partially-created worktree here would pollute the main ' +
    'repo\'s own working tree: ' + dir)

  const evilDir = path.join(root, '.claude/worktrees-evil/x')
  const rEvil = runNode(SCRIPT, ['--setup', '--commit', sha, '--dir', evilDir], { cwd: root })
  assert.strictEqual(rEvil.status, 3,
    'D1: a --dir sharing only a STRING PREFIX with .claude/worktrees/ (e.g. .claude/worktrees-evil/) but not ' +
    'actually resolving INSIDE it must still be refused as an ordinary in-repo path — evading D1\'s allow-list ' +
    'via a lookalike directory name is the guard-by-name-not-location class this repo\'s own Gotchas record: ' +
    JSON.stringify({ status: rEvil.status, stdout: rEvil.stdout }))
  assert.ok(!fs.existsSync(evilDir), 'D1: the lookalike-prefix refusal must also create nothing: ' + evilDir)

  const listAfter = execFileSync('git', ['-C', root, 'worktree', 'list'], { encoding: 'utf8' })
  assert.ok(!listAfter.includes(dir) && !listAfter.includes(evilDir),
    'D1: a refused --setup must register nothing in git\'s own worktree list either: ' + listAfter)
})

test('AC-20260823-05-3: --setup targets <root>/.claude/worktrees/<name> in a repo whose ignore rules do NOT already cover that path, appending ".claude/worktrees/" to info/exclude before creating so the path is ignored and git status stays empty afterward', () => {
  const root = fs.realpathSync(tmpdir('replay-setup-provision'))
  gitRepo(root, { empty: true }) // no .gitignore at all — the un-ignoring host D2 targets
  fs.writeFileSync(path.join(root, 'a.txt'), 'a\n')
  execFileSync('git', ['-C', root, 'add', '-A'])
  execFileSync('git', ['-C', root, 'commit', '-q', '-m', 'init'])
  const sha = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()

  // D2 (specs/20260826/01): renamed from replay-y for the same reason as the replay-x rename
  // above — a "replay"-opening basename now trips the new D2 refusal.
  assert.ok(!isIgnored(root, '.claude/worktrees/scratch-y'),
    'sanity: this fixture must NOT already ignore .claude/worktrees/ — otherwise this test does not exercise ' +
    'D2\'s provisioning arm at all')
  const excludePath = path.join(root, '.git/info/exclude')

  const dir = path.join(root, '.claude/worktrees/scratch-y')
  const r = runNode(SCRIPT, ['--setup', '--commit', sha, '--dir', dir], { cwd: root })
  assert.strictEqual(r.status, 0,
    'D2: --setup must self-provision the ignore line and succeed even on a host whose .gitignore never ' +
    'mentions .claude/worktrees/ — host repos are not guaranteed to already carry the line: ' + r.stderr)

  const excludeAfter = fs.existsSync(excludePath) ? fs.readFileSync(excludePath, 'utf8') : ''
  assert.ok(excludeAfter.includes('.claude/worktrees/'),
    'D2: info/exclude must now carry the .claude/worktrees/ line — without it the worktree stays visible to ' +
    'git status on every host that lacks the line in its own .gitignore: ' + JSON.stringify(excludeAfter))
  assert.ok(isIgnored(root, '.claude/worktrees/scratch-y'),
    'D2: after provisioning, git check-ignore -q must exit 0 for the worktree path — this is the AC\'s own ' +
    'stated check for success')
  const status = execFileSync('git', ['-C', root, 'status', '--porcelain'], { encoding: 'utf8' })
  assert.strictEqual(status.trim(), '',
    'D2: git status --porcelain in the main root must print nothing after setup — an ignore line that fails ' +
    'to actually cover the worktree would leave it dirtying the tree the maintainer works in: ' + JSON.stringify(status))
})

test('AC-20260823-05-4: WHEN the repo\'s info/exclude already carries the .claude/worktrees/ line THE SYSTEM does not append a duplicate — two consecutive setups leave exactly one occurrence', () => {
  const root = fs.realpathSync(tmpdir('replay-setup-provision-idempotent'))
  gitRepo(root, { empty: true })
  fs.writeFileSync(path.join(root, 'a.txt'), 'a\n')
  execFileSync('git', ['-C', root, 'add', '-A'])
  execFileSync('git', ['-C', root, 'commit', '-q', '-m', 'init'])
  const sha = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()

  // D2 (specs/20260826/01): renamed from replay-first/replay-second — a "replay"-opening
  // basename now trips the new D2 refusal, same reason as the replay-x/-y renames above.
  const dir1 = path.join(root, '.claude/worktrees/scratch-first')
  const r1 = runNode(SCRIPT, ['--setup', '--commit', sha, '--dir', dir1], { cwd: root })
  assert.strictEqual(r1.status, 0, 'fixture setup: the first --setup must succeed and provision the ignore line: ' + r1.stderr)

  const dir2 = path.join(root, '.claude/worktrees/scratch-second')
  const r2 = runNode(SCRIPT, ['--setup', '--commit', sha, '--dir', dir2], { cwd: root })
  assert.strictEqual(r2.status, 0, 'D2: a second --setup on an already-provisioned host must still succeed: ' + r2.stderr)

  const excludeContent = fs.readFileSync(path.join(root, '.git/info/exclude'), 'utf8')
  const occurrences = excludeContent.split('\n').filter((l) => l.trim() === '.claude/worktrees/').length
  assert.strictEqual(occurrences, 1,
    'D2: exactly one occurrence of the .claude/worktrees/ line must exist after two consecutive setups — a ' +
    'duplicate here means every future host repo accumulates one more line per replay run forever: ' +
    JSON.stringify(excludeContent))
})

// specs/20260826/01-replay-scratch-path-blindness.md D1/D2/D3 (2026-08-26): the four tests below
// pin the new --setup --spec derivation, the D2 basename refusal, and the D3 marker rename. Every
// derived name is computed by actually invoking merge-back.sh's `branch-for` subcommand — the
// sole owner of the `spec/<stem>` naming rule (pipeline rules § Risk Tiers) — rather than
// hardcoding the transform, so a future change to that rule cannot silently desync this file.

// AC-20260831-01-6 (SHALL CONTINUE TO, specs/20260831/01): --setup without --overlay must stay
// byte-identical to today — this test already pins the exact two-token printed line and the
// marker-carrying worktree that shape produces, so it is retagged in place rather than duplicated.
test('AC-20260826-01-1 / AC-20260831-01-6: --setup --commit <sha> --spec <spec path> with no --dir exits 0, prints exactly one stdout line "setup dir=<abs> commit=<sha>" where <abs> is R/.claude/worktrees/<name>-<6 lowercase hex> and <name> is merge-back.sh branch-for <spec path> with "/" -> "-", registers a detached worktree there carrying scratch-worktree, and leaves the host repo\'s git status --porcelain empty', () => {
  const root = fs.realpathSync(tmpdir('replay-setup-derived'))
  gitRepo(root) // gitRepo()'s own fixture .gitignore already covers .claude/worktrees/
  const relSpec = 'specs/20260825/02-genesis-consultant-discovery.md'
  const specFull = path.join(root, relSpec)
  fs.mkdirSync(path.dirname(specFull), { recursive: true })
  fs.writeFileSync(specFull, '---\nstatus: implementing\n---\n# genesis consultant discovery\n')
  execFileSync('git', ['-C', root, 'add', '-A'])
  execFileSync('git', ['-C', root, 'commit', '-q', '-m', 'add spec'])
  const sha = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
  const statusBefore = execFileSync('git', ['-C', root, 'status', '--porcelain'], { encoding: 'utf8' })

  // D1: <name> is derived by ACTUALLY invoking branch-for, never by re-deriving the rule inline —
  // branch-for is the sole owner of the stem rule (merge-back.sh header, pipeline rules).
  const branch = execFileSync('bash', [path.join(SPEC, 'scripts/merge-back.sh'), 'branch-for', relSpec], { encoding: 'utf8' }).trim()
  const expectedName = branch.replace(/\//g, '-')
  assert.ok(!/^replay/i.test(expectedName),
    'sanity: this fixture\'s derived name must not itself open with "replay" — otherwise D2\'s refusal would ' +
    'fire on the harness\'s own derivation and this test would prove nothing about D1')

  const r = runNode(SCRIPT, ['--setup', '--commit', sha, '--spec', relSpec], { cwd: root })
  assert.strictEqual(r.status, 0,
    'D1: a derived --setup with a readable --spec and no --dir must succeed — deriving the build-shaped ' +
    'path from the target spec itself is the whole point of this Decision: ' + r.stderr)

  const stdoutLines = r.stdout.split('\n').filter(Boolean)
  assert.strictEqual(stdoutLines.length, 1,
    'D1: --setup must print EXACTLY one stdout line — extra output here would corrupt any caller (replay.md ' +
    'Phase 1 step 1) that parses dir= off the printed line: ' + JSON.stringify(r.stdout))

  const expectedPrefix = path.join(root, '.claude', 'worktrees', expectedName)
  const re = new RegExp('^setup dir=(' + expectedPrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '-[0-9a-f]{6}) commit=' + sha + '$')
  const m = stdoutLines[0].match(re)
  assert.ok(m,
    'D1: the printed dir= must be exactly R/.claude/worktrees/<name>-<6 lowercase hex>, where <name> comes ' +
    'from merge-back.sh branch-for with "/" -> "-" — a differently-shaped path here means the derivation ' +
    'diverged from the single owner of build-worktree naming, which is what let the path leak into a ' +
    'doctrine example in the first place: ' + JSON.stringify(r.stdout))
  const dir = m[1]

  const gitDirRaw = execFileSync('git', ['-C', dir, 'rev-parse', '--git-dir'], { encoding: 'utf8' }).trim()
  const gitDirAbs = path.isAbsolute(gitDirRaw) ? gitDirRaw : path.resolve(dir, gitDirRaw)
  assert.ok(fs.existsSync(path.join(gitDirAbs, 'scratch-worktree')),
    'D1/D3: the derived worktree must carry the scratch-worktree marker at its resolved private git dir, ' +
    'exactly like every other --setup arm: ' + gitDirAbs)

  const list = execFileSync('git', ['-C', root, 'worktree', 'list'], { encoding: 'utf8' })
  assert.ok(list.includes(dir),
    'D1: the derived worktree must be registered as a detached worktree in git\'s own list — a missing entry ' +
    'means the printed dir= does not actually correspond to a real worktree: ' + list)

  const statusAfter = execFileSync('git', ['-C', root, 'status', '--porcelain'], { encoding: 'utf8' })
  assert.strictEqual(statusAfter, statusBefore,
    'D1: a derived --setup must leave the host repo exactly as clean as before it ran — the .claude/' +
    'worktrees/ ignore already covers this location, and any drift here means the derivation leaked into ' +
    'the tracked tree: ' + JSON.stringify({ before: statusBefore, after: statusAfter }))
})

test('AC-20260826-01-2: two derived --setup --spec runs for the same spec coexist as distinct suffixed siblings alongside the spec\'s real un-suffixed build worktree (left untouched, still on its own branch), and --setup with neither --spec nor --dir exits 2 naming both flags with nothing registered', () => {
  const root = fs.realpathSync(tmpdir('replay-setup-derived-twice'))
  gitRepo(root)
  const relSpec = 'specs/20260825/02-genesis-consultant-discovery.md'
  const specFull = path.join(root, relSpec)
  fs.mkdirSync(path.dirname(specFull), { recursive: true })
  fs.writeFileSync(specFull, '---\nstatus: implementing\n---\n# x\n')
  execFileSync('git', ['-C', root, 'add', '-A'])
  execFileSync('git', ['-C', root, 'commit', '-q', '-m', 'add spec'])
  const sha = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()

  const branch = execFileSync('bash', [path.join(SPEC, 'scripts/merge-back.sh'), 'branch-for', relSpec], { encoding: 'utf8' }).trim()
  const name = branch.replace(/\//g, '-')
  // The spec's REAL build worktree, built exactly as merge-back.sh create builds it — un-suffixed,
  // on its own branch named by the same branch-for rule.
  const buildDir = path.join(root, '.claude/worktrees', name)
  execFileSync('git', ['-C', root, 'worktree', 'add', '-b', branch, buildDir, sha])

  const first = runNode(SCRIPT, ['--setup', '--commit', sha, '--spec', relSpec], { cwd: root })
  assert.strictEqual(first.status, 0,
    'D1/A2: a derived --setup must succeed at a random-suffixed sibling even while the spec\'s own ' +
    'un-suffixed build worktree is registered — the suffix exists exactly because A2 confirmed `git ' +
    'worktree add` refuses an existing non-empty dir: ' + first.stderr)
  const second = runNode(SCRIPT, ['--setup', '--commit', sha, '--spec', relSpec], { cwd: root })
  assert.strictEqual(second.status, 0,
    'D1/AC-2: a SECOND derived --setup for the same spec must also succeed, at its OWN distinct suffix — two ' +
    'consecutive derived setups for the same spec must coexist: ' + second.stderr)

  const firstDir = first.stdout.match(/dir=(\S+)/)[1]
  const secondDir = second.stdout.match(/dir=(\S+)/)[1]
  assert.notStrictEqual(firstDir, secondDir,
    'D1/AC-2: the two derived setups must land at DISTINCT suffixed paths — a colliding path means one ' +
    'silently reused (or clobbered) the other\'s worktree: ' + JSON.stringify({ firstDir, secondDir }))

  const list = execFileSync('git', ['-C', root, 'worktree', 'list'], { encoding: 'utf8' })
  const worktreeEntries = list.trim().split('\n').filter((l) => l.includes('.claude/worktrees/'))
  assert.strictEqual(worktreeEntries.length, 3,
    'D1/AC-2: git worktree list must carry exactly 3 entries under .claude/worktrees/ — the spec\'s own ' +
    'build worktree plus the two derived setups — after two derived setups for one spec: ' + list)

  const buildBranch = execFileSync('git', ['-C', buildDir, 'branch', '--show-current'], { encoding: 'utf8' }).trim()
  assert.strictEqual(buildBranch, branch,
    'D1/AC-2: the spec\'s real build worktree must remain on its own branch, untouched by either derived ' +
    'setup: ' + buildBranch)

  const neitherRoot = fs.realpathSync(tmpdir('replay-setup-neitherflag'))
  gitRepo(neitherRoot)
  const shaNeither = execFileSync('git', ['-C', neitherRoot, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
  const listBefore = execFileSync('git', ['-C', neitherRoot, 'worktree', 'list'], { encoding: 'utf8' })
  const neither = runNode(SCRIPT, ['--setup', '--commit', shaNeither], { cwd: neitherRoot })
  assert.strictEqual(neither.status, 2,
    'D1: --setup with NEITHER --spec nor --dir must exit 2 as a usage error — there is nothing to derive a ' +
    'path from and no explicit path either: ' + JSON.stringify({ status: neither.status, stdout: neither.stdout }))
  const setupSegment = (neither.stderr.split(' | ').find((seg) => seg.includes('--setup'))) || ''
  assert.match(setupSegment, /--spec/,
    'D1: the --setup usage segment must NAME --spec as one of the two accepted ways to supply a path — the ' +
    'old usage line only ever mentioned --dir for --setup, which under-informs a caller now that --spec is ' +
    'a valid alternative (a bare grep for "--spec" anywhere in stderr would pass vacuously off --record\'s ' +
    'own --spec flag, so this checks the --setup segment specifically): ' + JSON.stringify(neither.stderr))
  assert.match(setupSegment, /--dir/,
    'D1: the --setup usage segment must also NAME --dir alongside --spec, matching the Decision\'s "naming ' +
    'both flags": ' + JSON.stringify(neither.stderr))
  const listAfter = execFileSync('git', ['-C', neitherRoot, 'worktree', 'list'], { encoding: 'utf8' })
  assert.strictEqual(listAfter, listBefore,
    'D1: a usage-error --setup must register nothing: ' + JSON.stringify({ before: listBefore, after: listAfter }))
})

test('AC-20260826-01-3: --setup --dir refuses a basename matching /^replay/i with exit 3, creates no directory and registers no worktree, and prints a stderr remedy naming --spec, while a basename that merely CONTAINS replay (not opening with it) is accepted', () => {
  const root = fs.realpathSync(tmpdir('replay-setup-basename-refusal'))
  gitRepo(root)
  const sha = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()

  const inRepoDir = path.join(root, '.claude/worktrees/replay-x')
  const listBefore = execFileSync('git', ['-C', root, 'worktree', 'list'], { encoding: 'utf8' })
  const inRepo = runNode(SCRIPT, ['--setup', '--commit', sha, '--dir', inRepoDir], { cwd: root })
  assert.strictEqual(inRepo.status, 3,
    'D2: an in-repo --dir under .claude/worktrees/ whose basename opens with "replay" must be refused with ' +
    'exit 3 even though specs/20260823/05 D1 already allows that location — the D2 basename refusal runs ' +
    'before the D1 location allow ever gets a say: ' + JSON.stringify({ status: inRepo.status, stdout: inRepo.stdout }))
  assert.ok(!fs.existsSync(inRepoDir), 'D2: the refused --dir must not be created: ' + inRepoDir)
  assert.match(inRepo.stderr, /--spec/,
    'D2: the refusal\'s remedy must name --spec as the alternative — telling a caller only "omit --dir" with ' +
    'no alternative flag leaves no path forward: ' + inRepo.stderr)
  const listAfterInRepo = execFileSync('git', ['-C', root, 'worktree', 'list'], { encoding: 'utf8' })
  assert.strictEqual(listAfterInRepo, listBefore,
    'D2: a refused --setup must register nothing in git\'s own worktree list: ' +
    JSON.stringify({ before: listBefore, after: listAfterInRepo }))

  const outsideDir = path.join(fs.realpathSync(tmpdir('replay-setup-basename-outside')), 'Replay-abc')
  const outside = runNode(SCRIPT, ['--setup', '--commit', sha, '--dir', outsideDir], { cwd: root })
  assert.strictEqual(outside.status, 3,
    'D2: the basename refusal is case-insensitive and applies outside the repo too, exactly like --apply ' +
    '--subject\'s existing structural refusal — "Replay-abc" must be refused just as "replay-x" is: ' +
    JSON.stringify({ status: outside.status, stdout: outside.stdout }))
  assert.ok(!fs.existsSync(outsideDir), 'D2: the refused outside-repo --dir must not be created either: ' + outsideDir)

  const acceptedDir = path.join(root, '.claude/worktrees/spec-02-mutation-replay-a1b2c3')
  const accepted = runNode(SCRIPT, ['--setup', '--commit', sha, '--dir', acceptedDir], { cwd: root })
  assert.strictEqual(accepted.status, 0,
    'D2: a basename that merely CONTAINS "replay" without OPENING with it (spec-02-mutation-replay-a1b2c3, ' +
    'the harness\'s own real derived name for its own spec, per A5) must be ACCEPTED — a vocabulary blocklist ' +
    'here would refuse the harness on its own spec, exactly the false positive A5 was executed to rule out: ' +
    accepted.stderr)
})

test('AC-20260826-01-4: --setup plants exactly scratch-worktree (never replay-worktree or .replay-worktree, in the private git dir or the working tree) and --teardown removes a scratch-worktree-marked dir cleanly but refuses (exit 3, deletes nothing) a linked worktree whose private git dir carries only the retired replay-worktree name', () => {
  const root = fs.realpathSync(tmpdir('replay-setup-marker-rename'))
  gitRepo(root)
  const sha = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()

  const dir = path.join(fs.realpathSync(tmpdir('replay-setup-marker-rename-wt')), 'wt')
  const setup = runNode(SCRIPT, ['--setup', '--commit', sha, '--dir', dir], { cwd: root })
  assert.strictEqual(setup.status, 0, 'fixture setup: --setup must succeed: ' + setup.stderr)

  const gitDirRaw = execFileSync('git', ['-C', dir, 'rev-parse', '--git-dir'], { encoding: 'utf8' }).trim()
  const gitDirAbs = path.isAbsolute(gitDirRaw) ? gitDirRaw : path.resolve(dir, gitDirRaw)

  assert.ok(fs.existsSync(path.join(gitDirAbs, 'scratch-worktree')),
    'D3: --setup must plant the scratch-worktree marker at the resolved private git dir — the marker\'s new ' +
    'neutral name is D3\'s whole point: ' + gitDirAbs)
  assert.ok(!fs.existsSync(path.join(gitDirAbs, 'replay-worktree')),
    'D3: --setup must NEVER plant the retired replay-worktree name in the private git dir — no grandfathered ' +
    'second name may exist alongside the new one: ' + gitDirAbs)
  assert.ok(!fs.existsSync(path.join(dir, 'replay-worktree')) && !fs.existsSync(path.join(dir, '.replay-worktree')),
    'D3: neither replay-worktree nor .replay-worktree may exist in the WORKING TREE either: ' + dir)
  assert.ok(!fs.existsSync(path.join(dir, 'scratch-worktree')) && !fs.existsSync(path.join(dir, '.scratch-worktree')),
    'D3: the marker must live ONLY in the private git dir, never in the working tree under either name — a ' +
    'copy in the working tree is exactly what --apply\'s `git add -A`-shaped commands could sweep in: ' + dir)

  const teardown = runNode(SCRIPT, ['--teardown', '--dir', dir], { cwd: root })
  assert.strictEqual(teardown.status, 0,
    'D3: a --setup-created worktree carrying the scratch-worktree marker must be removable by --teardown ' +
    'exactly like before the rename: ' + teardown.stderr)
  assert.ok(!fs.existsSync(dir), 'D3: teardown must remove the worktree directory: ' + dir)

  // A4/D3: "no grandfathering of the old name in --teardown" — a linked worktree carrying ONLY the
  // retired replay-worktree marker must be refused as unmarked, never accepted as a legacy form.
  const legacyDir = path.join(fs.realpathSync(tmpdir('replay-teardown-legacy')), 'wt')
  execFileSync('git', ['-C', root, 'worktree', 'add', '--detach', legacyDir, sha])
  const legacyGitDirRaw = execFileSync('git', ['-C', legacyDir, 'rev-parse', '--git-dir'], { encoding: 'utf8' }).trim()
  const legacyGitDirAbs = path.isAbsolute(legacyGitDirRaw) ? legacyGitDirRaw : path.resolve(legacyDir, legacyGitDirRaw)
  fs.writeFileSync(path.join(legacyGitDirAbs, 'replay-worktree'), '')

  const legacyTeardown = runNode(SCRIPT, ['--teardown', '--dir', legacyDir], { cwd: root })
  assert.strictEqual(legacyTeardown.status, 3,
    'D3: a linked worktree carrying ONLY the retired replay-worktree marker must be refused as unmarked — ' +
    'the old name grants nothing post-rename (A4: no marked tree existed at build time, so no grandfathering ' +
    'arm was ever added): ' + JSON.stringify({ status: legacyTeardown.status, stdout: legacyTeardown.stdout }))
  assert.ok(fs.existsSync(legacyDir), 'D3: the refused teardown must delete nothing: ' + legacyDir)
  const list = execFileSync('git', ['-C', root, 'worktree', 'list'], { encoding: 'utf8' })
  assert.ok(list.includes(legacyDir),
    'D3: git\'s own worktree registry must still list the refused (undeleted) directory: ' + list)
})

// specs/20260831/01-replay-range-materialization.md D1-D5 (2026-08-31, rv_128f1a459e42/
// rp_d4b6fcf66c93): the five tests below pin --setup's new --overlay <closeSha> arm — the overlay
// algorithm's materialize/skip split (AC-1/AC-2), its degenerate meta-only case (AC-3), the
// descendant validation (AC-4), and the --subject refusal/acceptance (AC-5). None of these pass
// today: --overlay is an unrecognized flag, so every invocation below hits the arg-parser's usage
// exit 2 before ever reaching --setup's mode logic — a genuine assertion-level red, not a crash.

test('AC-20260831-01-1: --setup --overlay materializes exactly the close commit\'s non-meta modify/add/delete as one commit with the default subject, leaving the worktree clean with the marker intact', () => {
  const root = fs.realpathSync(tmpdir('replay-overlay-materialize'))
  gitRepo(root)
  const parent = commitFiles(root, {
    'lib/a.js': 'a\n',
    'lib/dead.js': 'dead\n',
    'specs/01-x.md': '---\nstatus: implementing\n---\n# x\n',
    '.claude/spec-runs.jsonl': '{"line":1}\n',
  }, 'parent commit')
  const close = commitFiles(root, {
    'lib/a.js': 'A\n',
    'tests/new.test.js': 'new\n',
    'lib/dead.js': null,
    'specs/01-x.md': '---\nstatus: done\n---\n# x\n',
    '.claude/spec-runs.jsonl': '{"line":1}\n{"line":2}\n',
  }, 'close commit')

  const statusBeforeMain = execFileSync('git', ['-C', root, 'status', '--porcelain'], { encoding: 'utf8' })

  const dir = path.join(fs.realpathSync(tmpdir('replay-overlay-materialize-wt')), 'wt')
  const r = runNode(SCRIPT, ['--setup', '--commit', parent, '--overlay', close, '--dir', dir], { cwd: root })
  assert.strictEqual(r.status, 0,
    'D1: a --setup --overlay call whose close commit modifies/adds/deletes non-meta files alongside meta ' +
    'edits must succeed and materialize the range\'s true upper bound — a nonzero exit here means the false ' +
    'leg-caught misrecord (rv_128f1a459e42/rp_d4b6fcf66c93) this spec exists to fix is still live: ' + r.stderr)

  const escapedDir = dir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  assert.match(r.stdout, new RegExp('^setup dir=' + escapedDir + ' commit=' + parent + ' overlay=' + close + ' overlaid=3\\n?$'),
    'D1/Contracts: the existing tokens (dir=/commit=) must stay first, with " overlay=<closeSha> overlaid=<N>" ' +
    'appended naming exactly 3 materialized non-meta rows — a wrong N or token order here breaks the driver-' +
    'side prefix-tolerant dir= parse or miscounts the overlay: ' + JSON.stringify(r.stdout))

  const nameStatus = execFileSync('git', ['-C', dir, 'diff', '--name-status', parent, 'HEAD'], { encoding: 'utf8' }).trim()
  const rows = nameStatus.split('\n').filter(Boolean).sort()
  assert.deepStrictEqual(rows, ['A\ttests/new.test.js', 'D\tlib/dead.js', 'M\tlib/a.js'].sort(),
    'D1: git diff --name-status parent..HEAD in the worktree must list EXACTLY the 3 non-meta rows the close ' +
    'commit carried — any meta row leaking in defeats the blindness guarantee, and a missing non-meta row ' +
    'means the judged range was not fully materialized: ' + nameStatus)

  const subject = execFileSync('git', ['-C', dir, 'log', '-1', '--format=%s'], { encoding: 'utf8' }).trim()
  assert.strictEqual(subject, 'build: follow-up',
    'D5: the overlay commit must carry the default subject "build: follow-up" when --subject is omitted — a ' +
    'reviewer\'s sanctioned git log read must never see anything else: ' + subject)

  const status = execFileSync('git', ['-C', dir, 'status', '--porcelain'], { encoding: 'utf8' })
  assert.strictEqual(status.trim(), '',
    'D1: the worktree must be fully clean after the overlay commit — leftover working-tree changes would ' +
    'themselves leak into what the reconcile/at-risk legs or the blind reviewer observe: ' + status)

  const marker = markerPath(dir)
  assert.ok(fs.existsSync(marker),
    'D1: the scratch-worktree marker must still be present after the overlay commit — the overlay algorithm ' +
    'must never disturb the marker --teardown\'s refusal-without-marker guard depends on: ' + marker)

  const teardown = runNode(SCRIPT, ['--teardown', '--dir', dir], { cwd: root })
  assert.strictEqual(teardown.status, 0,
    'D1: teardown must still succeed and remove an overlay-materialized worktree exactly like any other: ' + teardown.stderr)
  assert.ok(!fs.existsSync(dir), 'D1: teardown must remove the overlay worktree directory: ' + dir)

  const statusAfterMain = execFileSync('git', ['-C', root, 'status', '--porcelain'], { encoding: 'utf8' })
  assert.strictEqual(statusAfterMain, statusBeforeMain,
    'D1: the overlay materialization must never touch the host repo\'s own working tree: ' +
    JSON.stringify({ before: statusBeforeMain, after: statusAfterMain }))
})

test('AC-20260831-01-2: --setup --overlay leaves every meta-prefix path (specs/, .claude/, docs/canonical/) at the --commit version, never materializing a close-added evidence file under .claude/spec-runs/', () => {
  const root = fs.realpathSync(tmpdir('replay-overlay-meta'))
  gitRepo(root)
  const parent = commitFiles(root, {
    'lib/a.js': 'a\n',
    'specs/02-y.md': '---\nstatus: implementing\n---\n# y\n',
    '.claude/spec-runs.jsonl': '{"line":1}\n',
    'docs/canonical/review.md': 'parent doc\n',
  }, 'parent commit')
  const close = commitFiles(root, {
    'lib/a.js': 'A\n',
    'specs/02-y.md': '---\nstatus: done\n---\n# y\n',
    '.claude/spec-runs.jsonl': '{"line":1}\n{"line":2}\n',
    'docs/canonical/review.md': 'close doc\n',
    '.claude/spec-runs/rv_deadbeefcafe.json': '{"evidence":true}\n',
  }, 'close commit')

  const dir = path.join(fs.realpathSync(tmpdir('replay-overlay-meta-wt')), 'wt')
  const r = runNode(SCRIPT, ['--setup', '--commit', parent, '--overlay', close, '--dir', dir], { cwd: root })
  assert.strictEqual(r.status, 0,
    'D2: a close commit carrying one non-meta row alongside four meta rows across all three meta prefixes ' +
    'must still overlay successfully: ' + r.stderr)

  const specContent = fs.readFileSync(path.join(dir, 'specs/02-y.md'), 'utf8')
  assert.match(specContent, /status: implementing/,
    'D2: the spec file at the worktree HEAD must still read status: implementing (the --commit/parent ' +
    'version) — materializing the close commit\'s status: done flip would leak "already reviewed" straight ' +
    'into the tree the blind reviewer or legs read: ' + specContent)

  const ledgerContent = fs.readFileSync(path.join(dir, '.claude/spec-runs.jsonl'), 'utf8')
  assert.strictEqual(ledgerContent, '{"line":1}\n',
    'D2: the worktree ledger must have no close-time row — it must match the --commit version exactly, never ' +
    'the close commit\'s appended line: ' + ledgerContent)

  const canonicalContent = fs.readFileSync(path.join(dir, 'docs/canonical/review.md'), 'utf8')
  assert.strictEqual(canonicalContent, 'parent doc\n',
    'D2: docs/canonical/ must match the --commit (parent) version — a close-time canonical-delta edit riding ' +
    'into the worktree would leak the review\'s own outcome prose: ' + canonicalContent)

  assert.ok(!fs.existsSync(path.join(dir, '.claude/spec-runs/rv_deadbeefcafe.json')),
    'D2: a close-added evidence file under .claude/spec-runs/ must be absent from the worktree — materializing ' +
    'it would hand the blind reviewer direct proof a review already ran: ' + dir)

  const nameStatus = execFileSync('git', ['-C', dir, 'diff', '--name-status', parent, 'HEAD'], { encoding: 'utf8' }).trim()
  assert.strictEqual(nameStatus, 'M\tlib/a.js',
    'D2: the overlay commit must contain ONLY the one non-meta row — any meta path appearing here means D2\'s ' +
    'prefix filter let a review-outcome surface leak into the diff the reviewer reads: ' + nameStatus)
})

test('AC-20260831-01-3: --setup --overlay whose close commit changes only meta-prefix paths creates no overlay commit, leaves the worktree HEAD at --commit, and prints overlaid=0', () => {
  const root = fs.realpathSync(tmpdir('replay-overlay-metaonly'))
  gitRepo(root)
  const parent = commitFiles(root, {
    'lib/a.js': 'a\n',
    'specs/03-z.md': '---\nstatus: implementing\n---\n# z\n',
  }, 'parent commit')
  const close = commitFiles(root, {
    'specs/03-z.md': '---\nstatus: done\n---\n# z\n',
    '.claude/spec-runs.jsonl': '{"line":1}\n',
  }, 'close commit (meta-only)')

  const dir = path.join(fs.realpathSync(tmpdir('replay-overlay-metaonly-wt')), 'wt')
  const r = runNode(SCRIPT, ['--setup', '--commit', parent, '--overlay', close, '--dir', dir], { cwd: root })
  assert.strictEqual(r.status, 0,
    'D1: a meta-only close (the clean-close degenerate case) must still exit 0 — the uniform overlay rule ' +
    'must degenerate cleanly to today\'s behavior by construction, never refuse or half-apply: ' + r.stderr)
  assert.match(r.stdout, / overlaid=0(\s|$)/,
    'D1/Contracts: overlaid=0 must print when every close-commit row is meta-prefixed and none is ' +
    'materialized: ' + r.stdout)

  const head = execFileSync('git', ['-C', dir, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
  assert.strictEqual(head, parent,
    'D1: zero non-meta rows must mean NO overlay commit is created — the worktree HEAD must stay exactly at ' +
    '--commit, never gain an empty or meta-only commit: ' + head)
})

test('AC-20260831-01-4: --setup refuses an --overlay that is not a strict descendant of --commit — an ancestor or an equal sha — with exit 4 before creating any worktree, naming the --select remedy', () => {
  const root = fs.realpathSync(tmpdir('replay-overlay-nondescendant'))
  gitRepo(root)
  const parent = commitFiles(root, { 'lib/a.js': 'a\n' }, 'parent commit')
  const close = commitFiles(root, { 'lib/a.js': 'A\n' }, 'close commit')

  const listBefore = execFileSync('git', ['-C', root, 'worktree', 'list'], { encoding: 'utf8' })

  const dirSame = path.join(fs.realpathSync(tmpdir('replay-overlay-same-wt')), 'wt')
  const rSame = runNode(SCRIPT, ['--setup', '--commit', parent, '--overlay', parent, '--dir', dirSame], { cwd: root })
  assert.strictEqual(rSame.status, 4,
    'D4: an --overlay EQUAL to --commit must be refused — D4 explicitly refuses equal shas too, not just ' +
    'non-ancestors: ' + JSON.stringify({ status: rSame.status, stdout: rSame.stdout }))
  assert.ok(!fs.existsSync(dirSame), 'D4: a refused --overlay must create no worktree directory: ' + dirSame)

  const dirReversed = path.join(fs.realpathSync(tmpdir('replay-overlay-reversed-wt')), 'wt')
  const rReversed = runNode(SCRIPT, ['--setup', '--commit', close, '--overlay', parent, '--dir', dirReversed], { cwd: root })
  assert.strictEqual(rReversed.status, 4,
    'D4: an --overlay that is an ANCESTOR of --commit (a swapped/reversed pair) must be refused exactly like ' +
    'a non-descendant: ' + JSON.stringify({ status: rReversed.status, stdout: rReversed.stdout }))
  assert.ok(!fs.existsSync(dirReversed), 'D4: the reversed-pair refusal must also create no worktree directory: ' + dirReversed)
  assert.match(rReversed.stderr, /--select/,
    'D4: the refusal must name the remedy — re-running --select and passing its printed commit/parent pair — ' +
    'or a caller has no path forward after a stale/reversed pair: ' + rReversed.stderr)

  const listAfter = execFileSync('git', ['-C', root, 'worktree', 'list'], { encoding: 'utf8' })
  assert.strictEqual(listAfter, listBefore,
    'D4: a refused --setup --overlay must register nothing in git\'s own worktree list: ' +
    JSON.stringify({ before: listBefore, after: listAfter }))
})

test('AC-20260831-01-5: --setup --overlay refuses a --subject that opens with "replay" (case-insensitive) with exit 2 naming the constraint, and accepts a build-shaped subject verbatim as the overlay commit\'s own subject', () => {
  const root = fs.realpathSync(tmpdir('replay-overlay-subject'))
  gitRepo(root)
  const parent = commitFiles(root, { 'lib/a.js': 'a\n' }, 'parent commit')
  const close = commitFiles(root, { 'lib/a.js': 'A\n' }, 'close commit')

  const refusedDir = path.join(fs.realpathSync(tmpdir('replay-overlay-subject-refused-wt')), 'wt')
  const refused = runNode(SCRIPT, ['--setup', '--commit', parent, '--overlay', close, '--dir', refusedDir,
    '--subject', 'replay harness check'], { cwd: root })
  assert.strictEqual(refused.status, 2,
    'D5: a --subject opening with "replay" (case-insensitive) must be refused — the class-id half of ' +
    '--apply\'s F2 refusal does not apply at setup time (no class exists yet), but the harness-announcing ' +
    'half still must: ' + JSON.stringify({ status: refused.status, stdout: refused.stdout }))
  assert.match(refused.stderr, /replay|announc/i,
    'D5: the refusal must NAME the constraint being violated, not fail with a generic usage error: ' + refused.stderr)
  assert.ok(!fs.existsSync(refusedDir),
    'D5: a refused --subject must create no worktree at all — refusing only the overlay commit after the ' +
    'worktree already exists would leave a half-built scratch tree behind: ' + refusedDir)

  const acceptedDir = path.join(fs.realpathSync(tmpdir('replay-overlay-subject-accepted-wt')), 'wt')
  const accepted = runNode(SCRIPT, ['--setup', '--commit', parent, '--overlay', close, '--dir', acceptedDir,
    '--subject', 'build(20260830/03): ci leg honest absence'], { cwd: root })
  assert.strictEqual(accepted.status, 0,
    'D5: a build-shaped --subject (indistinguishable from a real build commit) must be accepted: ' + accepted.stderr)
  const subject = execFileSync('git', ['-C', acceptedDir, 'log', '-1', '--format=%s'], { encoding: 'utf8' }).trim()
  assert.strictEqual(subject, 'build(20260830/03): ci leg honest absence',
    'D5: the accepted --subject must land as the overlay commit\'s subject VERBATIM — any transformation here ' +
    'would break the "indistinguishable from a real build commit" invariant --apply\'s own --subject already ' +
    'relies on: ' + subject)
})

test('AC-20260823-05-6 / AC-20260826-01-6 (retagged from AC-20260819-02-3, SHALL CONTINUE TO): --setup builds a marker-carrying detached worktree at an outside --dir that leaves the host repo byte-identical', () => {
  const root = fs.realpathSync(tmpdir('replay-setup'))
  gitRepo(root)
  const sha = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()

  // D4 host-unmodified pin (fix iteration 2, 2026-08-19): snapshot the HOST repo's shared
  // .git/info/exclude (absent is a valid snapshot value — handled below) and `git status
  // --porcelain` BEFORE any --setup call. Iteration 1's fix wrote its exclusion line into exactly
  // this file, resolved from INSIDE the worktree via `git rev-parse --git-path info/exclude` —
  // which is not per-worktree and lands in the shared common git dir.
  const excludePath = path.join(root, '.git/info/exclude')
  const excludeBefore = fs.existsSync(excludePath) ? fs.readFileSync(excludePath, 'utf8') : null
  const statusBefore = execFileSync('git', ['-C', root, 'status', '--porcelain'], { encoding: 'utf8' })

  const outsideDir = path.join(fs.realpathSync(tmpdir('replay-setup-outside')), 'wt')
  const create = runNode(SCRIPT, ['--setup', '--commit', sha, '--dir', outsideDir], { cwd: root })
  assert.strictEqual(create.status, 0,
    'D1: an outside-repo --dir must CONTINUE TO succeed exactly as today — the manual fallback path must ' +
    'survive D1\'s narrower in-repo allow-list untouched: ' + create.stderr)

  const marker = markerPath(outsideDir)
  assert.ok(marker.split(path.sep).includes('worktrees'),
    'D4: the resolved marker path must live under the worktree\'s PRIVATE git dir (a `.../worktrees/<name>/...` ' +
    'path segment), not the shared common git dir and not the working tree — this is what makes the marker ' +
    'get deleted for free by `git worktree remove`: ' + marker)
  assert.ok(fs.existsSync(marker),
    'D4/D3: the created worktree must carry the scratch-worktree marker at its resolved PRIVATE git dir path ' +
    '(`git -C <dir> rev-parse --git-dir` + "scratch-worktree") — --teardown\'s refusal-without-marker guard ' +
    'resolves this exact same path to decide whether to refuse: ' + marker)
  assert.ok(!fs.existsSync(path.join(outsideDir, 'scratch-worktree')) && !fs.existsSync(path.join(outsideDir, '.scratch-worktree')),
    'D4: nothing named scratch-worktree (with or without a leading dot) may exist in the worktree\'s own ' +
    'WORKING TREE — a marker there is exactly what could be swept into `git add -A` by --apply, which is the ' +
    'defect class this marker relocation exists to make structurally impossible: ' + outsideDir)

  const wtSha = execFileSync('git', ['-C', outsideDir, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
  assert.strictEqual(wtSha, sha,
    'D4: the worktree must be checked out detached at exactly --commit — a wrong sha means the mutation ' +
    'would land on the wrong tree entirely: ' + wtSha)

  const excludeAfter = fs.existsSync(excludePath) ? fs.readFileSync(excludePath, 'utf8') : null
  assert.strictEqual(excludeAfter, excludeBefore,
    'D4 host-unmodified pin (fix iteration 2): the HOST repo\'s .git/info/exclude must be BYTE-IDENTICAL ' +
    'before and after an OUTSIDE-repo --setup — D2\'s new self-provisioning arm exists only for the in-repo ' +
    'allow arm and must never fire here: ' + JSON.stringify({ before: excludeBefore, after: excludeAfter }))
  const statusAfter = execFileSync('git', ['-C', root, 'status', '--porcelain'], { encoding: 'utf8' })
  assert.strictEqual(statusAfter, statusBefore,
    'D4 host-unmodified pin (fix iteration 2): `git status --porcelain` in the HOST repo\'s main tree must be ' +
    'unchanged before and after --setup — a --setup call must leave no trace whatsoever visible in the tree ' +
    'the maintainer actually works in: ' + JSON.stringify({ before: statusBefore, after: statusAfter }))
})

test('AC-20260819-02-4: --setup composed with --apply commits the mutation on base..HEAD without leaking the .scratch-worktree marker into the diff or git status, subject defaulting to "build: follow-up" or landing verbatim', () => {
  const { root, baseSha, patchFile } = initApplyFixture('replay-apply')

  // F1 regression pin: the worktree comes from --setup itself (marker excluded via
  // info/exclude before it's ever written) — the OLD version of this test stood the worktree up
  // with a raw `git worktree add`, so the marker never existed for --apply's `git add -A` to
  // leak, and the defect shipped through a fully green suite.
  const wtDefault = path.join(fs.realpathSync(tmpdir('replay-apply-wt-default')), 'wt')
  const setupDefault = runNode(SCRIPT, ['--setup', '--commit', baseSha, '--dir', wtDefault], { cwd: root })
  assert.strictEqual(setupDefault.status, 0,
    'fixture setup: --setup must succeed before --apply can be composed onto it: ' + setupDefault.stderr)

  // D9 (specs/20260819/03): --patch-out is now REQUIRED — added in place here per Assumption A7,
  // assertions and this test's own AC-ID untouched, since nothing this test asserts changed.
  const patchOutDefault = path.join(fs.realpathSync(tmpdir('replay-apply-out-default')), 'mutation-out.patch')
  const applyDefault = runNode(SCRIPT, ['--apply', '--dir', wtDefault, '--patch', patchFile,
    '--patch-out', patchOutDefault, '--class', 'self-consistent-polarity'])
  assert.strictEqual(applyDefault.status, 0,
    'D5: --apply on a --setup-created worktree with a valid patch must succeed: ' + applyDefault.stderr)

  const nameStatus = execFileSync('git', ['-C', wtDefault, 'diff', '--name-status', baseSha + '..HEAD'], { encoding: 'utf8' })
  assert.match(nameStatus, /lib\/x\.js/,
    'D5: base..HEAD must contain the mutated file — this is the diff surface review-legs.js and the ' +
    'reviewer both actually read: ' + nameStatus)
  assert.ok(!nameStatus.includes('.scratch-worktree'),
    'F1 regression pin (2026-08-19 review; marker renamed by specs/20260826/01 D3): .scratch-worktree must ' +
    'NEVER appear in `git diff base..HEAD --name-status` — this is the exact defect that shipped undetected ' +
    'because the prior test built its worktree with a raw `git worktree add` instead of going through ' +
    '--setup, so there was no marker for --apply\'s `git add -A` to sweep in, and the leak was invisible to ' +
    'a green suite: ' + nameStatus)

  const statusDefault = execFileSync('git', ['-C', wtDefault, 'status', '--porcelain'], { encoding: 'utf8' })
  assert.strictEqual(statusDefault.trim(), '',
    'D5: `git status --porcelain` in the worktree must be clean after --apply — an untracked marker ' +
    'sitting there is exactly what F1 let a dispatched reviewer see: ' + JSON.stringify(statusDefault))

  const msgDefault = execFileSync('git', ['-C', wtDefault, 'log', '-1', '--format=%s'], { encoding: 'utf8' }).trim()
  assert.strictEqual(msgDefault, 'build: follow-up',
    'D5: with no --subject passed, the commit subject must default to exactly "build: follow-up" — a ' +
    'neutral, real-commit-shaped default is the whole point of F2\'s fix: ' + msgDefault)

  const wtExplicit = path.join(fs.realpathSync(tmpdir('replay-apply-wt-explicit')), 'wt')
  const setupExplicit = runNode(SCRIPT, ['--setup', '--commit', baseSha, '--dir', wtExplicit], { cwd: root })
  assert.strictEqual(setupExplicit.status, 0,
    'fixture setup: --setup must succeed for the explicit-subject case too: ' + setupExplicit.stderr)
  const subjectText = 'build: tidy up lib/x.js formatting'
  const patchOutExplicit = path.join(fs.realpathSync(tmpdir('replay-apply-out-explicit')), 'mutation-out.patch')
  const applyExplicit = runNode(SCRIPT, ['--apply', '--dir', wtExplicit, '--patch', patchFile,
    '--patch-out', patchOutExplicit, '--class', 'self-consistent-polarity', '--subject', subjectText])
  assert.strictEqual(applyExplicit.status, 0, 'D5: --apply with a clean --subject must succeed: ' + applyExplicit.stderr)
  const msgExplicit = execFileSync('git', ['-C', wtExplicit, 'log', '-1', '--format=%s'], { encoding: 'utf8' }).trim()
  assert.strictEqual(msgExplicit, subjectText,
    'D5: a passed --subject must land as the commit subject VERBATIM, not wrapped, truncated, or prefixed: ' + msgExplicit)
})

test('AC-20260819-02-4: --apply refuses a --subject announcing the harness or containing the --class value, with exit 2 and nothing committed, but accepts a spec-derived subject that merely uses the words', () => {
  const { root, baseSha, patchFile } = initApplyFixture('replay-apply-refuse')

  const wt = path.join(fs.realpathSync(tmpdir('replay-apply-refuse-wt')), 'wt')
  const setup = runNode(SCRIPT, ['--setup', '--commit', baseSha, '--dir', wt], { cwd: root })
  assert.strictEqual(setup.status, 0, 'fixture setup: --setup must succeed: ' + setup.stderr)
  const headBefore = execFileSync('git', ['-C', wt, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()

  // D9 (specs/20260819/03): --patch-out added in place per A7 on all three --apply invocations
  // below — one outside-the-worktree path is reused since every call here is expected to be
  // refused before anything is written.
  const patchOutRefuse = path.join(fs.realpathSync(tmpdir('replay-apply-refuse-out')), 'mutation-out.patch')

  const replaySubject = runNode(SCRIPT, ['--apply', '--dir', wt, '--patch', patchFile,
    '--patch-out', patchOutRefuse, '--class', 'self-consistent-polarity', '--subject', 'replay mutation test'], { cwd: root })
  assert.strictEqual(replaySubject.status, 2,
    'F2 regression pin (2026-08-19 review): a --subject announcing the harness must be refused ' +
    'with exit 2 BEFORE any git command runs — this is the exact leak that let a dispatched reviewer read ' +
    '"this is a test" straight out of a sanctioned `git log`: ' + JSON.stringify({ status: replaySubject.status, stdout: replaySubject.stdout }))
  assert.strictEqual(replaySubject.stdout.trim(), '',
    'D5: a refused --apply is a usage error, not a partial apply — nothing must print on stdout: ' +
    JSON.stringify(replaySubject.stdout))

  const classSubject = runNode(SCRIPT, ['--apply', '--dir', wt, '--patch', patchFile,
    '--patch-out', patchOutRefuse, '--class', 'self-consistent-polarity', '--subject', 'build: fix self-consistent-polarity edge case'],
    { cwd: root })
  assert.strictEqual(classSubject.status, 2,
    'F2 regression pin: a --subject containing the literal --class value must also be refused with exit 2 ' +
    '— naming the defect class is as much a blindness leak as naming the harness itself: ' +
    JSON.stringify({ status: classSubject.status, stdout: classSubject.stdout }))
  assert.strictEqual(classSubject.stdout.trim(), '',
    'D5: nothing must print on stdout for this refusal either: ' + JSON.stringify(classSubject.stdout))

  const headAfter = execFileSync('git', ['-C', wt, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
  assert.strictEqual(headAfter, headBefore,
    'D5: a refused --subject must leave the worktree exactly as --setup created it — no commit landed, ' +
    'because the subject check runs before any git command, including `git apply`: ' + headAfter)
  const status = execFileSync('git', ['-C', wt, 'status', '--porcelain'], { encoding: 'utf8' })
  assert.strictEqual(status.trim(), '',
    'D5: a refused --apply must leave the worktree clean — the patch must never even be applied when the ' +
    'subject check fails first: ' + JSON.stringify(status))

  // The narrowing pin (2026-08-19 review, second pass): an earlier draft of this refusal rejected the
  // words replay/mutation/corpus ANYWHERE in the subject, which refused exactly the subject
  // replay.md mandates — this repo's own build subject for this very spec. D5's rule is provenance,
  // not vocabulary, so a spec-derived subject that merely contains those words must be ACCEPTED.
  const derived = runNode(SCRIPT, ['--apply', '--dir', wt, '--patch', patchFile,
    '--patch-out', patchOutRefuse, '--class', 'self-consistent-polarity',
    '--subject', 'build(20260819/02): scheduled mutation replay harness'], { cwd: root })
  assert.strictEqual(derived.status, 0,
    'D5: a build-commit-shaped subject derived from the target spec must be ACCEPTED even when the ' +
    "spec's own title contains 'replay' or 'mutation' — refusing it would force the harness to commit " +
    'a subject visibly unlike this repo\'s real build commits, which is itself the blindness leak the ' +
    'rule exists to prevent: ' + derived.stderr)
  const derivedMsg = execFileSync('git', ['-C', wt, 'log', '-1', '--format=%s'], { encoding: 'utf8' }).trim()
  assert.strictEqual(derivedMsg, 'build(20260819/02): scheduled mutation replay harness',
    'D5: the accepted --subject must be the commit subject verbatim: ' + derivedMsg)
})

// specs/20260901/08-corpus-derivation-and-kill-match.md D2 (2026-09-01, brief 19): --apply and
// --record must refuse a --class value the corpus (spec/scripts/lib/replay-corpus.js's
// parseCorpus(corpusPath())) does not carry — today's --apply performs no such check at all
// (verified below: 'not-a-class' commits the mutation exactly like a real corpus id), so a typo'd
// class silently forks a class's catch-rate history into two rows nobody joins.
test('AC-20260901-08-2: --apply --class not-a-class exits 2 naming replay-corpus.md and the valid ids, leaves the worktree HEAD unchanged, and writes no --patch-out, while --class silent-fallback on the same inputs still commits the mutation (AC-20260819-02-4\'s existing fixture)', () => {
  const { root, baseSha, patchFile } = initApplyFixture('replay-apply-classcheck')
  const setupBad = runNode(SCRIPT, ['--setup', '--commit', baseSha, '--dir', path.join(fs.realpathSync(tmpdir('replay-apply-classcheck-wt1')), 'wt')], { cwd: root })
  assert.strictEqual(setupBad.status, 0, 'fixture setup: --setup must succeed before --apply can be composed onto it: ' + setupBad.stderr)
  const wtBad = setupBad.stdout.match(/setup dir=(\S+)/)[1]
  const patchOutBad = path.join(fs.realpathSync(tmpdir('replay-apply-classcheck-out1')), 'mutation.patch')
  const headBefore = execFileSync('git', ['-C', wtBad, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()

  const badClass = runNode(SCRIPT, ['--apply', '--dir', wtBad, '--patch', patchFile,
    '--patch-out', patchOutBad, '--class', 'not-a-class'])
  assert.strictEqual(badClass.status, 2,
    'D2: a --class value absent from the corpus must be refused with exit 2 — nothing in today\'s ' +
    '--apply validates --class at all, so this currently commits the mutation instead: ' +
    JSON.stringify({ status: badClass.status, stdout: badClass.stdout }))
  assert.match(badClass.stderr, /replay-corpus\.md/,
    'D2: the refusal must name the corpus file (spec/doctrine/replay-corpus.md) so the remedy is on screen: ' + badClass.stderr)
  assert.match(badClass.stderr, /silent-fallback/,
    'D2: the refusal must list the valid ids (comma-joined) — a real corpus id like silent-fallback must ' +
    'appear so the caller can see what a valid --class value looks like: ' + badClass.stderr)
  const headAfter = execFileSync('git', ['-C', wtBad, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
  assert.strictEqual(headAfter, headBefore,
    'D2: a refused --apply must leave the worktree\'s HEAD exactly where it was — nothing may be committed: ' +
    JSON.stringify({ headBefore, headAfter }))
  assert.ok(!fs.existsSync(patchOutBad),
    'D2: a refused --apply must write no --patch-out — a partial emission here would give --record ' +
    'something to read for a run that never actually happened: ' + patchOutBad)

  const setupOk = runNode(SCRIPT, ['--setup', '--commit', baseSha, '--dir', path.join(fs.realpathSync(tmpdir('replay-apply-classcheck-wt2')), 'wt')], { cwd: root })
  assert.strictEqual(setupOk.status, 0, 'fixture setup: second --setup must succeed: ' + setupOk.stderr)
  const wtOk = setupOk.stdout.match(/setup dir=(\S+)/)[1]
  const patchOutOk = path.join(fs.realpathSync(tmpdir('replay-apply-classcheck-out2')), 'mutation.patch')
  const goodClass = runNode(SCRIPT, ['--apply', '--dir', wtOk, '--patch', patchFile,
    '--patch-out', patchOutOk, '--class', 'silent-fallback'])
  assert.strictEqual(goodClass.status, 0,
    'D2: silent-fallback is a real corpus id and must still be accepted — the validation must not over-' +
    'refuse a genuinely valid class: ' + goodClass.stderr)
  assert.match(goodClass.stdout, /applied class=silent-fallback/,
    'D2: a valid --class must still commit the mutation exactly like AC-20260819-02-4\'s existing fixture: ' + goodClass.stdout)
})

test('AC-20260819-03-14: --apply --patch-out writes unquoted +++ b/<path> headers off HEAD^..HEAD even when the worktree\'s repo config sets diff.noprefix/diff.mnemonicPrefix and core.quotePath is left on, for a mutation touching a non-ASCII path', () => {
  const root = fs.realpathSync(tmpdir('replay-apply-hostile'))
  gitRepo(root)
  // Host git config is not ours (D9's own rationale) — this hostile config is entirely the
  // fixture's, standing in for a real host repo's settings; core.quotePath is deliberately left
  // unset (its default is on).
  execFileSync('git', ['-C', root, 'config', 'diff.noprefix', 'true'])
  execFileSync('git', ['-C', root, 'config', 'diff.mnemonicPrefix', 'true'])
  const nonAsciiName = 'café.js'
  fs.writeFileSync(path.join(root, nonAsciiName), 'a\nb\nc\n')
  execFileSync('git', ['-C', root, 'add', '-A'])
  execFileSync('git', ['-C', root, 'commit', '-q', '-m', 'add ' + nonAsciiName])
  const baseSha = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()

  // replay.md captures the raw authoring edit with D9's OWN pinned flags (its stated companion
  // mechanism, not this test's concern) — building the --patch input the same way isolates AC-14's
  // actual claim, which is about --apply's OWN re-emission to --patch-out from HEAD^..HEAD.
  const scratch = path.join(fs.realpathSync(tmpdir('replay-apply-hostile-scratch')), 'scratch')
  execFileSync('git', ['-C', root, 'worktree', 'add', '--detach', scratch, baseSha])
  fs.writeFileSync(path.join(scratch, nonAsciiName), 'a\nB\nc\n')
  const capturedPatch = execFileSync('git', ['-C', scratch,
    '-c', 'core.quotePath=off', '-c', 'diff.noprefix=false', '-c', 'diff.mnemonicPrefix=false',
    '-c', 'diff.srcPrefix=a/', '-c', 'diff.dstPrefix=b/',
    'diff', '--no-ext-diff', '--no-color'], { encoding: 'utf8' })
  execFileSync('git', ['-C', root, 'worktree', 'remove', '--force', scratch])
  const patchFile = path.join(fs.realpathSync(tmpdir('replay-apply-hostile-patch')), 'mutation.patch')
  fs.writeFileSync(patchFile, capturedPatch)

  const wt = path.join(fs.realpathSync(tmpdir('replay-apply-hostile-wt')), 'wt')
  const setup = runNode(SCRIPT, ['--setup', '--commit', baseSha, '--dir', wt], { cwd: root })
  assert.strictEqual(setup.status, 0, 'fixture setup: --setup must succeed: ' + setup.stderr)

  const outFile = path.join(fs.realpathSync(tmpdir('replay-apply-hostile-out')), 'mutation-out.patch')
  const apply = runNode(SCRIPT, ['--apply', '--dir', wt, '--patch', patchFile, '--patch-out', outFile, '--class', 'silent-fallback'])
  assert.strictEqual(apply.status, 0,
    'D9: --apply must succeed inside a worktree whose repo config is hostile to plain git diff — the ' +
    'pinned re-emission flags exist precisely so this host-config combination never breaks the harness: ' + apply.stderr)

  const bareDiff = execFileSync('git', ['-C', wt, 'diff', '--no-color', baseSha + '..HEAD'], { encoding: 'utf8' })
  assert.ok(!new RegExp('\\+\\+\\+ b/' + nonAsciiName.replace('é', '.')).test(bareDiff),
    'sanity: the BARE git diff in this hostile-configured repo must NOT itself produce an unquoted b/-' +
    'prefixed header — otherwise this fixture is not actually exercising the hostile config the AC ' +
    'describes: ' + JSON.stringify(bareDiff))

  const out = fs.readFileSync(outFile, 'utf8')
  assert.match(out, new RegExp('\\+\\+\\+ b/' + nonAsciiName.replace('é', '.')),
    'D9: --patch-out must carry an UNQUOTED +++ b/<path> header regardless of the worktree\'s ' +
    'diff.noprefix/mnemonicPrefix/quotePath config — a quoted or prefix-less header here is exactly the ' +
    'defect that leaves the harness permanently dead on this host, with only a dueness row to show for it: ' +
    JSON.stringify(out))

  const wfFile = path.join(path.dirname(outFile), 'return.json')
  fs.writeFileSync(wfFile, JSON.stringify({ verdict: 'CLEAN', survivors: [], killed: 0 }))
  const score = runNode(SCRIPT, ['--score', '--workflow', wfFile, '--patch', outFile])
  assert.strictEqual(score.status, 0,
    'D1: the re-emitted patch must parse to at least one hunk — an exit-2 "unusable input" here means the ' +
    'canonical emission itself is broken, the exact failure this AC exists to prevent: ' + score.stderr)
  assert.match(score.stdout, /\bmissed\b/,
    'sanity: with zero survivors and a parseable patch, --score must still reach a real outcome (missed), ' +
    'proving the patch was not silently treated as zero-hunk: ' + score.stdout)
})

test('AC-20260819-03-15: --apply exits 2 naming --patch-out when it is omitted, and exits 3 with nothing applied, committed, or written when --patch-out resolves inside --dir', () => {
  const { root, baseSha, patchFile } = initApplyFixture('replay-apply-flagvalidation')

  const wtMissing = path.join(fs.realpathSync(tmpdir('replay-apply-flagvalidation-missing')), 'wt')
  const setupMissing = runNode(SCRIPT, ['--setup', '--commit', baseSha, '--dir', wtMissing], { cwd: root })
  assert.strictEqual(setupMissing.status, 0, 'fixture setup: --setup must succeed: ' + setupMissing.stderr)
  const missingOut = runNode(SCRIPT, ['--apply', '--dir', wtMissing, '--patch', patchFile, '--class', 'self-consistent-polarity'])
  assert.strictEqual(missingOut.status, 2,
    'D9: --apply without --patch-out must be refused with exit 2 — --patch-out is REQUIRED, not optional, ' +
    'since --apply is now the harness\'s only patch emitter: ' + JSON.stringify({ status: missingOut.status, stderr: missingOut.stderr }))
  assert.match(missingOut.stderr, /--patch-out/,
    'D9: the refusal must NAME --patch-out so the caller knows exactly which required flag is missing: ' + missingOut.stderr)

  const wtInside = path.join(fs.realpathSync(tmpdir('replay-apply-flagvalidation-inside')), 'wt')
  const setupInside = runNode(SCRIPT, ['--setup', '--commit', baseSha, '--dir', wtInside], { cwd: root })
  assert.strictEqual(setupInside.status, 0, 'fixture setup: --setup must succeed: ' + setupInside.stderr)
  const headBefore = execFileSync('git', ['-C', wtInside, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
  const insideOut = path.join(wtInside, 'mutation-out.patch')
  const insideApply = runNode(SCRIPT, ['--apply', '--dir', wtInside, '--patch', patchFile, '--patch-out', insideOut, '--class', 'self-consistent-polarity'])
  assert.strictEqual(insideApply.status, 3,
    'D9: a --patch-out resolving INSIDE --dir must be refused with exit 3 BEFORE applying anything — ' +
    'writing the emitted patch into the exact tree the blind reviewer reads is a blindness violation, ' +
    'refused structurally rather than trusted to convention: ' + JSON.stringify({ status: insideApply.status, stderr: insideApply.stderr }))
  const headAfter = execFileSync('git', ['-C', wtInside, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
  assert.strictEqual(headAfter, headBefore,
    'D9: a refused --patch-out must leave the worktree at exactly the commit --setup created — nothing may ' +
    'be applied, let alone committed: ' + headAfter)
  const statusInside = execFileSync('git', ['-C', wtInside, 'status', '--porcelain'], { encoding: 'utf8' })
  assert.strictEqual(statusInside.trim(), '',
    'D9: nothing may be applied to the working tree either — a dirty tree here means the patch went on ' +
    'before the inside-dir check ran: ' + JSON.stringify(statusInside))
  assert.ok(!fs.existsSync(insideOut),
    'D9: the refusal happens BEFORE applying anything, so no file may be written at the (refused) ' +
    '--patch-out path — a partial write there would itself leak into the tree the reviewer reads: ' + insideOut)
})

test('AC-20260819-03-16: --apply commits only the patch\'s own files onto HEAD^..HEAD via git apply --index, leaving an unrelated modified tracked file and an unrelated untracked file both uncommitted', () => {
  const { root, baseSha, patchFile } = initApplyFixture('replay-apply-scope')
  const wt = path.join(fs.realpathSync(tmpdir('replay-apply-scope-wt')), 'wt')
  const setup = runNode(SCRIPT, ['--setup', '--commit', baseSha, '--dir', wt], { cwd: root })
  assert.strictEqual(setup.status, 0, 'fixture setup: --setup must succeed: ' + setup.stderr)

  // an unrelated tracked file (as if a setupCommand had rewritten a lockfile) and an unrelated
  // untracked file, both dirty in the worktree BEFORE --apply runs.
  fs.writeFileSync(path.join(wt, 'lockfile.txt'), 'pinned\n')
  execFileSync('git', ['-C', wt, 'add', '-A'])
  execFileSync('git', ['-C', wt, 'commit', '-q', '-m', 'add lockfile.txt'])
  fs.appendFileSync(path.join(wt, 'lockfile.txt'), 'unrelated churn\n')
  fs.writeFileSync(path.join(wt, 'stray.txt'), 'untracked\n')

  const outFile = path.join(fs.realpathSync(tmpdir('replay-apply-scope-out')), 'mutation-out.patch')
  const apply = runNode(SCRIPT, ['--apply', '--dir', wt, '--patch', patchFile, '--patch-out', outFile, '--class', 'self-consistent-polarity'])
  assert.strictEqual(apply.status, 0, 'D10: --apply must still succeed with unrelated dirty files present in the worktree: ' + apply.stderr)

  const nameStatus = execFileSync('git', ['-C', wt, 'diff', '--name-status', 'HEAD^..HEAD'], { encoding: 'utf8' })
  assert.match(nameStatus, /lib\/x\.js/, 'D10: HEAD^..HEAD must contain the mutated file: ' + nameStatus)
  assert.ok(!nameStatus.includes('lockfile.txt'),
    'D10: the commit must never include the unrelated modified tracked file — `git add -A` would sweep it ' +
    'into the exact diff the blind reviewer reads; `git apply --index` committing only the index must ' +
    'exclude it: ' + nameStatus)
  assert.ok(!nameStatus.includes('stray.txt'),
    'D10: the commit must never include the unrelated untracked file either — the same `git add -A` leak ' +
    'applies to untracked churn: ' + nameStatus)

  const status = execFileSync('git', ['-C', wt, 'status', '--porcelain'], { encoding: 'utf8' })
  assert.match(status, /lockfile\.txt/,
    'D10: lockfile.txt must remain dirty in the working tree after --apply, not silently absorbed into the ' +
    'commit: ' + JSON.stringify(status))
  assert.match(status, /stray\.txt/,
    'D10: stray.txt must remain untracked in the working tree after --apply, for the same reason: ' + JSON.stringify(status))
})

test('AC-20260819-03-1: --score scores caught when a survivor lands on the SECOND file of a two-file mutation patch, proving the score comes from every hunk in the patch and not a single self-reported point', () => {
  const dir = fs.realpathSync(tmpdir('replay-score-multifile'))
  const patchFile = path.join(dir, 'mutation.patch')
  fs.writeFileSync(patchFile,
    '--- a/lib/guard.js\n+++ b/lib/guard.js\n@@ -1,5 +1,5 @@\n a\n-b\n+B\n c\n d\n e\n' +
    '--- a/tests/guard.test.js\n+++ b/tests/guard.test.js\n@@ -1,3 +1,3 @@\n x\n-y\n+Y\n z\n')
  const wf = writeWorkflowReturn(dir, 'return.json', [{ file: 'tests/guard.test.js', line: 3 }])
  const r = runNode(SCRIPT, ['--score', '--workflow', wf, '--patch', patchFile])
  assert.strictEqual(r.status, 0, 'D1: a well-formed two-file patch and a CLEAN return must score, not error: ' + r.stderr)
  assert.match(r.stdout, /\bcaught\b/,
    'D1 AC-1: a finding on the SECOND mutated file (tests/guard.test.js:3, inside its own @@ +1,3 hunk) ' +
    'must score caught — scoring off a single self-reported point instead of every hunk in the patch would ' +
    'under-score exactly this multi-file mutation: ' + r.stdout)
})

test('AC-20260819-03-2: --score scores ambiguous when survivors are non-empty but none fall within +/-5 lines of any hunk range in a mutated file', () => {
  const dir = fs.realpathSync(tmpdir('replay-score-ambiguous'))
  const patchFile = path.join(dir, 'mutation.patch')
  fs.writeFileSync(patchFile, '--- a/lib/guard.js\n+++ b/lib/guard.js\n@@ -1,5 +1,5 @@\n a\n-b\n+B\n c\n d\n e\n')
  const wf = writeWorkflowReturn(dir, 'return.json', [{ file: 'lib/guard.js', line: 40 }])
  const r = runNode(SCRIPT, ['--score', '--workflow', wf, '--patch', patchFile])
  assert.strictEqual(r.status, 0, 'D1: a non-matching-but-present survivor is still a successful score, not an error: ' + r.stderr)
  assert.match(r.stdout, /\bambiguous\b/,
    'D1 AC-2: the sole survivor sits at line 40, far outside the @@ +1,5 hunk\'s +/-5-widened window ' +
    '(roughly 1-10) — this must route to ambiguous (the one human judgment seam), never be silently ' +
    'misgraded as missed: ' + r.stdout)
})

test('AC-20260819-03-3: --score scores missed when the CLEAN return\'s survivors array is empty', () => {
  const dir = fs.realpathSync(tmpdir('replay-score-missed'))
  const patchFile = path.join(dir, 'mutation.patch')
  fs.writeFileSync(patchFile, '--- a/lib/guard.js\n+++ b/lib/guard.js\n@@ -1,5 +1,5 @@\n a\n-b\n+B\n c\n d\n e\n')
  const wf = writeWorkflowReturn(dir, 'return.json', [])
  const r = runNode(SCRIPT, ['--score', '--workflow', wf, '--patch', patchFile])
  assert.strictEqual(r.status, 0, 'D1: zero survivors is still a successful score: ' + r.stderr)
  assert.match(r.stdout, /\bmissed\b/,
    'D1 AC-3: an empty survivors array is the harness\'s actual blind-spot signal and must score missed, ' +
    'distinguishable from ambiguous and caught: ' + r.stdout)
})

test('AC-20260819-03-4: --score exits 2 naming the patch path and the remedy when --patch parses to zero +++ b/ hunk headers, printing no score', () => {
  const dir = fs.realpathSync(tmpdir('replay-score-badpatch'))
  const patchFile = path.join(dir, 'not-a-patch.txt')
  fs.writeFileSync(patchFile, 'this file has no diff headers of any kind\njust some prose\n')
  const wf = writeWorkflowReturn(dir, 'return.json', [{ file: 'lib/guard.js', line: 3 }])
  const r = runNode(SCRIPT, ['--score', '--workflow', wf, '--patch', patchFile])
  assert.strictEqual(r.status, 2,
    'D1/Exit codes: a --patch that parses to zero hunks is unusable input and must exit 2, never silently ' +
    'score against nothing: ' + JSON.stringify({ status: r.status, stdout: r.stdout }))
  assert.match(r.stderr, new RegExp(patchFile.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
    'the stderr must name the offending patch PATH so the caller knows which file to inspect, not a ' +
    'generic error: ' + r.stderr)
  assert.match(r.stderr, /remedy|--apply|--patch-out|re-run|regenerate/i,
    'the stderr must name a remedy (re-run --apply/--patch-out against a harness-emitted patch) — an error ' +
    'with no remedy command violates the header-comment convention every script here follows: ' + r.stderr)
  assert.strictEqual(r.stdout.trim(), '', 'a usage error is not a score — nothing must print on stdout: ' + JSON.stringify(r.stdout))
})

// Vacuity note (2026-08-19, executed): this AC's own text says "CONTINUE TO exit 2," and it does
// pass against the pre-spec-03 script today — but empirically NOT for the CLEAN-verdict check it
// claims to pin. The old --score usage requires --file/--line, both absent from this --patch-shaped
// invocation, so the pre-image rejects via its generic missing-required-flag usage error (verified:
// `node spec/scripts/replay.js --score --workflow failed.json --patch mutation.patch` prints the
// usage line and exits 2 even with a well-formed CLEAN-and-empty-survivors return). This is the
// generalized-third-occurrence vacuous-rejection class (§ Gotchas, spec-pipeline.md): kept as the
// correct POST-implementation assertion per that doctrine rather than reddened artificially.
test('AC-20260819-03-10: --score CONTINUES TO exit 2 printing no score when the workflow return is not verdict:"CLEAN" with a survivors array, whether the verdict itself is wrong, survivors is missing, or survivors is not an array', () => {
  const dir = fs.realpathSync(tmpdir('replay-score-malformed'))
  const patchFile = path.join(dir, 'mutation.patch')
  fs.writeFileSync(patchFile, '--- a/lib/x.js\n+++ b/lib/x.js\n@@ -1,3 +1,3 @@\n a\n-b\n+B\n c\n')

  // F4 regression pin (2026-08-19 review of spec 02), retagged here per Assumption A4: the old
  // code classified ANY parseable-but-unusable reviewer return as `missed`, permanently deflating
  // the catch-rate denominator with evidence that was never actually produced. Converted from the
  // retired --file/--line invocation to the new --patch shape; the three sub-assertions below are
  // unchanged from the original pin.
  const failedPath = path.join(dir, 'failed.json')
  fs.writeFileSync(failedPath, JSON.stringify({ verdict: 'REVIEWER_FAILED' }))
  const failed = runNode(SCRIPT, ['--score', '--workflow', failedPath, '--patch', patchFile])
  assert.strictEqual(failed.status, 2,
    'a non-CLEAN verdict like REVIEWER_FAILED must exit 2, never be scored as missed — the caller must ' +
    're-dispatch the reviewer and retry --score instead of recording a phantom miss: ' +
    JSON.stringify({ status: failed.status, stdout: failed.stdout }))
  assert.strictEqual(failed.stdout.trim(), '',
    'a usage error is not a score — --score must print NOTHING on stdout when the return is unusable, so ' +
    'no downstream --record call can mistake this exit for a real outcome: ' + JSON.stringify(failed.stdout))

  const noSurvivorsPath = path.join(dir, 'no-survivors.json')
  fs.writeFileSync(noSurvivorsPath, JSON.stringify({ verdict: 'CLEAN' }))
  const noSurvivors = runNode(SCRIPT, ['--score', '--workflow', noSurvivorsPath, '--patch', patchFile])
  assert.strictEqual(noSurvivors.status, 2,
    'a CLEAN verdict with a MISSING survivors array must still exit 2 — a return that merely looks ' +
    'parseable is not the same as a valid, scoreable reviewer return: ' +
    JSON.stringify({ status: noSurvivors.status, stdout: noSurvivors.stdout }))
  assert.strictEqual(noSurvivors.stdout.trim(), '', 'nothing must print on stdout for this malformed return either: ' + JSON.stringify(noSurvivors.stdout))

  const badSurvivorsPath = path.join(dir, 'bad-survivors.json')
  fs.writeFileSync(badSurvivorsPath, JSON.stringify({ verdict: 'CLEAN', survivors: 'not-an-array' }))
  const badSurvivors = runNode(SCRIPT, ['--score', '--workflow', badSurvivorsPath, '--patch', patchFile])
  assert.strictEqual(badSurvivors.status, 2,
    'survivors must specifically be an ARRAY — a non-array value under a CLEAN verdict must exit 2 exactly ' +
    'like a missing one, never be coerced or iterated: ' +
    JSON.stringify({ status: badSurvivors.status, stdout: badSurvivors.stdout }))
  assert.strictEqual(badSurvivors.stdout.trim(), '', 'nothing must print on stdout for this malformed return either: ' + JSON.stringify(badSurvivors.stdout))
})

test('AC-20260819-03-17: --score normalizes a survivor\'s file — stripping a leading "./" and matching an absolute path at a path-segment boundary — before comparing it against the patch\'s mutated files', () => {
  const dir = fs.realpathSync(tmpdir('replay-score-normalize'))
  const patchFile = path.join(dir, 'mutation.patch')
  fs.writeFileSync(patchFile, '--- a/lib/guard.js\n+++ b/lib/guard.js\n@@ -1,5 +1,5 @@\n a\n-b\n+B\n c\n d\n e\n')

  const dotWf = writeWorkflowReturn(dir, 'dot.json', [{ file: './lib/guard.js', line: 3 }])
  const dotScore = runNode(SCRIPT, ['--score', '--workflow', dotWf, '--patch', patchFile])
  assert.strictEqual(dotScore.status, 0, 'D11: a well-formed patch and return must score, not error: ' + dotScore.stderr)
  assert.match(dotScore.stdout, /\bcaught\b/,
    'D11 AC-17: a leading "./" must be stripped before matching — the reviewer contract never pins a path ' +
    'form, so a "./lib/guard.js" return at a correct line must score caught, not fall through to ambiguous ' +
    'on a mechanical mismatch: ' + dotScore.stdout)

  const absWf = writeWorkflowReturn(dir, 'abs.json', [{ file: '/tmp/somewhere/lib/guard.js', line: 3 }])
  const absScore = runNode(SCRIPT, ['--score', '--workflow', absWf, '--patch', patchFile])
  assert.strictEqual(absScore.status, 0, 'D11: an absolute-path return must still score, not error: ' + absScore.stderr)
  assert.match(absScore.stdout, /\bcaught\b/,
    'D11 AC-17: an absolute path ending in "/lib/guard.js" at a path-segment boundary must match the ' +
    'mutated file "lib/guard.js" and score caught — the blind reviewer is rooted at {dir} and may ' +
    'legitimately return an absolute path: ' + absScore.stdout)

  const falseAbsWf = writeWorkflowReturn(dir, 'false-abs.json', [{ file: '/tmp/x/mylib/guard.js', line: 3 }])
  const falseAbsScore = runNode(SCRIPT, ['--score', '--workflow', falseAbsWf, '--patch', patchFile])
  assert.strictEqual(falseAbsScore.status, 0, 'D11: this return must still score, not error: ' + falseAbsScore.stderr)
  assert.match(falseAbsScore.stdout, /\bambiguous\b/,
    'D11 Contracts boundary case: "mylib/guard.js" must NOT match "lib/guard.js" merely because it ends in ' +
    'the same characters — the match requires a path-SEGMENT boundary, or an unrelated file sharing a ' +
    'suffix would falsely score caught: ' + falseAbsScore.stdout)
})

test('AC-20260819-02-6 / AC-20260823-09-11 (pre-existing matrix continuity: green for a caught outcome): --record appends one ledger row matching the Contracts shape with a fresh rp_ runId and writes the evidence artifact holding the patch verbatim', () => {
  const root = fs.realpathSync(tmpdir('replay-record'))
  const patchFile = path.join(root, 'mutation.patch')
  fs.writeFileSync(patchFile, '--- a/lib/x.js\n+++ b/lib/x.js\n@@ -1 +1 @@\n-a\n+B\n')
  const workflowFile = path.join(root, 'workflow.json')
  const workflowObj = { verdict: 'CLEAN', survivors: [], killed: 0 }
  fs.writeFileSync(workflowFile, JSON.stringify(workflowObj))

  // D7 (specs/20260819/03) drops --record's --file flag entirely — files is now DERIVED from
  // --patch, which this invocation already carries. This --file removal is a third collision D7
  // creates beyond the two named in Assumptions A4/A7 (neither assumption names this test); fixed
  // in place here, AC-ID kept since the underlying invariant under test — D8's record/artifact
  // shape for a caught outcome — is unchanged, only its file-derivation mechanism is.
  const r = runNode(SCRIPT, ['--record',
    '--spec', 'specs/20260819/02-mutation-replay.md',
    '--review-run-id', 'rv_aaaaaaaaaaaa',
    '--class', 'silent-fallback',
    '--legs', 'green',
    '--outcome', 'caught',
    '--patch', patchFile,
    '--workflow', workflowFile,
    '--tokens', '4200',
  ], { cwd: root })
  assert.strictEqual(r.status, 0, 'D8: a fully-formed --record invocation must succeed: ' + r.stderr)

  const ledgerPath = path.join(root, '.claude/spec-runs.jsonl')
  const lines = fs.readFileSync(ledgerPath, 'utf8').trim().split('\n')
  assert.strictEqual(lines.length, 1,
    'D8: --record must append EXACTLY one ledger row per invocation — an extra or missing line corrupts ' +
    'every downstream --stats aggregate: ' + lines.length)
  const row = JSON.parse(lines[0])
  assert.match(row.runId, /^rp_[0-9a-f]{12}$/,
    'D8: the generated runId must match rp_ + 12 lowercase hex — a wrong shape breaks the evidence ' +
    'artifact\'s filename convention (<rp_id>.json): ' + row.runId)
  assert.deepStrictEqual(Object.keys(row).sort(),
    ['class', 'files', 'legs', 'outcome', 'reviewRunId', 'runId', 'spec', 'stage', 'tokens', 'ts'],
    'D7/D8: the row\'s keys must be EXACTLY the Contracts set, no more, no less — this is the retagged-in-' +
    'place form of the original key-set pin, with the retired singular "file" key replaced by the ' +
    'D7-derived "files" array: an extra, missing, or wrongly-named key breaks --stats\' aggregation and any ' +
    'script that reads this row: ' + JSON.stringify(row))
  assert.deepStrictEqual(row.files, ['lib/x.js'],
    'D7: files must be DERIVED from --patch\'s own mutated-file headers now that --file is gone — a wrong ' +
    'or missing derivation here means every downstream consumer of this row loses the file this run scored: ' +
    JSON.stringify(row.files))
  assert.strictEqual(row.stage, 'replay', 'D8: the row must self-identify as a replay row: ' + JSON.stringify(row))
  assert.strictEqual(row.outcome, 'caught', 'D8: the outcome passed on the CLI must land verbatim in the row: ' + JSON.stringify(row))
  assert.strictEqual(row.tokens, 4200,
    'D8: the tokens field must be recorded as a NUMBER, not the raw CLI string — a string here silently ' +
    'breaks --stats\' arithmetic (string concatenation instead of addition): ' + JSON.stringify(row.tokens))

  const artifactPath = path.join(root, '.claude/spec-runs', row.runId + '.json')
  assert.ok(fs.existsSync(artifactPath),
    'D8: --record must write .claude/spec-runs/<rp_id>.json — without it there is no full-fidelity evidence ' +
    'for this replay run and /spec:escape-style provenance work has nothing to read: ' + artifactPath)
  const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'))
  assert.strictEqual(artifact.patch, fs.readFileSync(patchFile, 'utf8'),
    'D8: the artifact must hold the patch VERBATIM — a normalized or truncated copy defeats the entire ' +
    'point of retaining it: ' + JSON.stringify(artifact.patch))
  assert.deepStrictEqual(artifact.reviewer, workflowObj,
    'D8: the artifact must hold the dispatched reviewer\'s workflow return verbatim: ' + JSON.stringify(artifact.reviewer))
})

test('AC-20260819-02-6 / AC-20260823-09-11 (pre-existing matrix continuity: red:<leg> for leg-caught): --record with --outcome leg-caught writes reviewer: null in the evidence artifact since no reviewer was ever dispatched', () => {
  const root = fs.realpathSync(tmpdir('replay-record-legcaught'))
  const patchFile = path.join(root, 'mutation.patch')
  fs.writeFileSync(patchFile, '--- a/lib/y.js\n+++ b/lib/y.js\n@@ -1 +1 @@\n-a\n+B\n')

  // D7 (specs/20260819/03) drops --record's --file flag — dropped from this invocation in place
  // for the same reason as the sibling caught-outcome test above; files derives from --patch alone.
  const r = runNode(SCRIPT, ['--record',
    '--spec', 'specs/20260819/02-mutation-replay.md',
    '--review-run-id', 'rv_bbbbbbbbbbbb',
    '--class', 'boundary-shift',
    '--legs', 'red:gate',
    '--outcome', 'leg-caught',
    '--patch', patchFile,
    '--tokens', '0',
  ], { cwd: root })
  assert.strictEqual(r.status, 0, 'D8: a leg-caught record (no --workflow, since no reviewer ran) must still succeed: ' + r.stderr)

  const row = JSON.parse(fs.readFileSync(path.join(root, '.claude/spec-runs.jsonl'), 'utf8').trim())
  assert.deepStrictEqual(row.files, ['lib/y.js'],
    'D7: files must be derived from --patch on a leg-caught row too, even though no reviewer was dispatched ' +
    'and no --workflow was passed: ' + JSON.stringify(row.files))
  const artifact = JSON.parse(fs.readFileSync(path.join(root, '.claude/spec-runs', row.runId + '.json'), 'utf8'))
  assert.strictEqual(artifact.reviewer, null,
    'D8: leg-caught means the reviewer was never dispatched — the artifact must record reviewer: null, ' +
    'never an omitted key or a stale value, or --stats/escape-style tooling would misread this row as ' +
    'reviewer-graded evidence it is not: ' + JSON.stringify(artifact.reviewer))
})

// specs/20260901/08-corpus-derivation-and-kill-match.md D2 (2026-09-01, brief 19): --record
// validates --class before any read of --patch/--workflow beyond the D7 matrix, so a rejected
// class leaves the ledger untouched. A2 (executed 2026-09-01): today's --record accepts a
// non-corpus class outright — exit 0, "recorded runId=rp_…", and --stats renders the fabricated
// class verbatim — which is this test's exact red.
test('AC-20260901-08-3: --record --class not-a-class exits 2 and appends nothing to the ledger, while --class prefix-collision-coverage-fail-open on the same inputs appends the row', () => {
  const rootBad = fs.realpathSync(tmpdir('replay-record-classcheck-bad'))
  const patchFileBad = path.join(rootBad, 'mutation.patch')
  fs.writeFileSync(patchFileBad, '--- a/lib/z.js\n+++ b/lib/z.js\n@@ -1 +1 @@\n-a\n+B\n')
  const workflowFileBad = path.join(rootBad, 'workflow.json')
  fs.writeFileSync(workflowFileBad, JSON.stringify({ verdict: 'CLEAN', survivors: [], killed: [] }))

  const badClass = runNode(SCRIPT, ['--record',
    '--spec', 'specs/20260901/08-corpus-derivation-and-kill-match.md',
    '--review-run-id', 'rv_dddddddddddd',
    '--class', 'not-a-class',
    '--legs', 'green',
    '--outcome', 'caught',
    '--patch', patchFileBad,
    '--workflow', workflowFileBad,
  ], { cwd: rootBad })
  assert.strictEqual(badClass.status, 2,
    'D2: a --class value absent from the corpus must be refused with exit 2 — pre-image A2 (executed ' +
    '2026-09-01) confirmed today\'s --record accepts this outright with exit 0: ' +
    JSON.stringify({ status: badClass.status, stdout: badClass.stdout, stderr: badClass.stderr }))
  assert.ok(!fs.existsSync(path.join(rootBad, '.claude/spec-runs.jsonl')),
    'D2: a refused --record must append NOTHING — no ledger file may even be created for a class that ' +
    'was never valid: ' + rootBad)

  const rootOk = fs.realpathSync(tmpdir('replay-record-classcheck-ok'))
  const patchFileOk = path.join(rootOk, 'mutation.patch')
  fs.writeFileSync(patchFileOk, '--- a/lib/z.js\n+++ b/lib/z.js\n@@ -1 +1 @@\n-a\n+B\n')
  const workflowFileOk = path.join(rootOk, 'workflow.json')
  fs.writeFileSync(workflowFileOk, JSON.stringify({ verdict: 'CLEAN', survivors: [], killed: [] }))
  const goodClass = runNode(SCRIPT, ['--record',
    '--spec', 'specs/20260901/08-corpus-derivation-and-kill-match.md',
    '--review-run-id', 'rv_eeeeeeeeeeee',
    '--class', 'prefix-collision-coverage-fail-open',
    '--legs', 'green',
    '--outcome', 'caught',
    '--patch', patchFileOk,
    '--workflow', workflowFileOk,
  ], { cwd: rootOk })
  assert.strictEqual(goodClass.status, 0,
    'D2/D5: prefix-collision-coverage-fail-open is the one derived class shipped past the bar and must ' +
    'be accepted once D1/D5 land: ' + goodClass.stderr)
  const lines = fs.readFileSync(path.join(rootOk, '.claude/spec-runs.jsonl'), 'utf8').trim().split('\n')
  assert.strictEqual(lines.length, 1,
    'D2: a valid --class must still append exactly one ledger row, unchanged from today\'s behavior: ' + lines.length)
  const row = JSON.parse(lines[0])
  assert.strictEqual(row.class, 'prefix-collision-coverage-fail-open',
    'D2: the appended row must record the validated class verbatim: ' + JSON.stringify(row))
})

test('AC-20260819-03-5 / AC-20260823-09-11 (pre-existing matrix continuity: green riding an unresolved outcome, the same green-legs check caught/missed share): --record --outcome unresolved rides with --patch and --workflow, appends a row with outcome:"unresolved" and files parsed from the patch, and writes the artifact with the reviewer return verbatim', () => {
  const root = fs.realpathSync(tmpdir('replay-record-unresolved'))
  const patchFile = path.join(root, 'mutation.patch')
  fs.writeFileSync(patchFile, '--- a/lib/x.js\n+++ b/lib/x.js\n@@ -1,3 +1,3 @@\n a\n-b\n+B\n c\n')
  const workflowFile = path.join(root, 'workflow.json')
  const workflowObj = { verdict: 'CLEAN', survivors: [{ file: 'lib/y.js', line: 99 }], killed: 0 }
  fs.writeFileSync(workflowFile, JSON.stringify(workflowObj))

  const r = runNode(SCRIPT, ['--record',
    '--spec', 'specs/20260819/03-replay-first-run-fixes.md',
    '--review-run-id', 'rv_cccccccccccc',
    '--legs', 'green',
    '--outcome', 'unresolved',
    '--patch', patchFile,
    '--workflow', workflowFile,
    '--tokens', '500',
  ], { cwd: root })
  assert.strictEqual(r.status, 0,
    'D3/D7: a fully-formed unresolved record (patch + workflow + legs green) must succeed — a dismissed ' +
    'ambiguous adjudication must be RECORDED, never discarded: ' + r.stderr)

  const row = JSON.parse(fs.readFileSync(path.join(root, '.claude/spec-runs.jsonl'), 'utf8').trim())
  assert.strictEqual(row.outcome, 'unresolved', 'D3: the row must record outcome:"unresolved" verbatim: ' + JSON.stringify(row))
  assert.deepStrictEqual(row.files, ['lib/x.js'],
    'D7: files must be DERIVED from the patch\'s own mutated-file headers, not hand-passed — a mismatched ' +
    'hand-passed file could contradict the patch it rides with: ' + JSON.stringify(row.files))

  const artifact = JSON.parse(fs.readFileSync(path.join(root, '.claude/spec-runs', row.runId + '.json'), 'utf8'))
  assert.deepStrictEqual(artifact.reviewer, workflowObj,
    'D3: an unresolved row must keep the reviewer return VERBATIM in the artifact — this is the retained ' +
    'evidence for later human adjudication that discard-on-dismiss used to destroy: ' + JSON.stringify(artifact.reviewer))
})

test('AC-20260819-03-6 / AC-20260823-09-11 (pre-existing matrix continuity: none for setup-failed): --record --outcome setup-failed rides with --legs none and no --class/--patch/--workflow, appends a row with class/files null, and writes the artifact with patch/reviewer null', () => {
  const root = fs.realpathSync(tmpdir('replay-record-setupfailed'))
  const r = runNode(SCRIPT, ['--record',
    '--spec', 'specs/20260819/03-replay-first-run-fixes.md',
    '--review-run-id', 'rv_dddddddddddd',
    '--legs', 'none',
    '--outcome', 'setup-failed',
  ], { cwd: root })
  assert.strictEqual(r.status, 0,
    'D4/D7: a setup-failed record naming no class/patch/workflow must succeed — nothing was ever measured, ' +
    'so none of those inputs exist yet: ' + r.stderr)

  const row = JSON.parse(fs.readFileSync(path.join(root, '.claude/spec-runs.jsonl'), 'utf8').trim())
  assert.strictEqual(row.class, null, 'D4: class must be null on setup-failed — no corpus class was ever selected: ' + JSON.stringify(row))
  assert.strictEqual(row.files, null, 'D4: files must be null on setup-failed — no patch was ever produced: ' + JSON.stringify(row))
  assert.strictEqual(row.legs, 'none', 'D4: legs must record "none" verbatim: ' + JSON.stringify(row))
  assert.strictEqual(row.outcome, 'setup-failed', 'D4: outcome must record "setup-failed" verbatim: ' + JSON.stringify(row))

  const artifact = JSON.parse(fs.readFileSync(path.join(root, '.claude/spec-runs', row.runId + '.json'), 'utf8'))
  assert.strictEqual(artifact.patch, null,
    'D4: the artifact\'s patch must be null — a stale or fabricated patch here would misrepresent a run ' +
    'where the scratch copy was never even prepared: ' + JSON.stringify(artifact.patch))
  assert.strictEqual(artifact.reviewer, null,
    'D4: the artifact\'s reviewer must be null — the reviewer was never dispatched on a setup failure: ' + JSON.stringify(artifact.reviewer))
})

// Vacuity note (2026-08-19, executed): this AC's own text says "CONTINUE TO exit 2," and it does
// pass against the pre-spec-03 script today — but empirically NOT via a 5-value enum check. The
// pre-image still requires --class/--file (both absent here) for every --record call, so it
// rejects via its generic missing-required-flag usage error before ever inspecting --outcome
// (verified: the same invocation with --class/--file supplied instead rejects with "--outcome must
// be caught|missed|leg-caught, got 'setup-failed'" — the OLD three-value check, not a new one).
// Generalized-third-occurrence vacuous-rejection class (§ Gotchas) — kept as the correct POST-
// implementation assertion rather than reddened artificially.
// D2/D3 (specs/20260823/09): --record gains one new --legs value, `baseline-red:<leg>[,<leg>]`,
// valid for caught/missed/unresolved alongside green — the truthful word for a run whose target
// closed with sanctioned red legs, replacing the false `--legs green` the 2026-08-23 incident
// recorded. `unresolved` becomes two-armed: green/baseline-red:* still requires --patch+--workflow
// (Phase 3 dismissal, reviewer ran); red:<leg> requires --patch and REFUSES --workflow (step-7
// dismissal, reviewer never ran). The three tests below pin the new grammar directly.
test('AC-20260823-09-4: --record --outcome caught --legs baseline-red:reconcile appends a row whose legs field is the literal string "baseline-red:reconcile" and writes the evidence artifact exactly as for a green outcome', () => {
  const root = fs.realpathSync(tmpdir('replay-record-baselinered'))
  const patchFile = path.join(root, 'mutation.patch')
  fs.writeFileSync(patchFile, '--- a/lib/x.js\n+++ b/lib/x.js\n@@ -1 +1 @@\n-a\n+B\n')
  const workflowFile = path.join(root, 'workflow.json')
  const workflowObj = { verdict: 'CLEAN', survivors: [], killed: 0 }
  fs.writeFileSync(workflowFile, JSON.stringify(workflowObj))

  const r = runNode(SCRIPT, ['--record',
    '--spec', 'specs/20260823/09-replay-baseline-attribution.md',
    '--review-run-id', 'rv_aaaaaaaaaaaa',
    '--class', 'silent-fallback',
    '--legs', 'baseline-red:reconcile',
    '--outcome', 'caught',
    '--patch', patchFile,
    '--workflow', workflowFile,
    '--tokens', '4200',
  ], { cwd: root })
  assert.strictEqual(r.status, 0,
    'D2: --legs baseline-red:<leg> must be ACCEPTED alongside green for a caught outcome — a truthful record ' +
    'of a run whose target closed with a sanctioned red leg is the entire point of this spec: ' + r.stderr)

  const row = JSON.parse(fs.readFileSync(path.join(root, '.claude/spec-runs.jsonl'), 'utf8').trim())
  assert.strictEqual(row.legs, 'baseline-red:reconcile',
    'D2: the row\'s legs field must be the literal string "baseline-red:reconcile" verbatim, never collapsed ' +
    'to "green" — collapsing it is the exact 2026-08-23 rp_1b176ebff5c7 misrecord this spec exists to stop: ' +
    JSON.stringify(row))
  assert.strictEqual(row.outcome, 'caught', 'D2: outcome must record verbatim: ' + JSON.stringify(row))

  const artifactPath = path.join(root, '.claude/spec-runs', row.runId + '.json')
  assert.ok(fs.existsSync(artifactPath),
    'D2: a baseline-red record must write the same evidence artifact a green record does — this outcome is a ' +
    'truthful VARIANT of a measured run, not a degraded one: ' + artifactPath)
  const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'))
  assert.strictEqual(artifact.patch, fs.readFileSync(patchFile, 'utf8'),
    'D2: the artifact must hold the patch verbatim exactly as a green outcome\'s artifact does: ' + JSON.stringify(artifact.patch))
  assert.deepStrictEqual(artifact.reviewer, workflowObj,
    'D2: the artifact must hold the dispatched reviewer\'s workflow return verbatim, exactly as for green — ' +
    'the reviewer genuinely ran on a baseline-red row: ' + JSON.stringify(artifact.reviewer))
})

test('AC-20260823-09-5: --record --outcome caught --legs red:gate is refused with exit 2 naming baseline-red as an accepted value, since red: stays reserved for a newly-red leg and is incompatible with a caught outcome', () => {
  const root = fs.realpathSync(tmpdir('replay-record-red-caught-refused'))
  const patchFile = path.join(root, 'mutation.patch')
  fs.writeFileSync(patchFile, '--- a/lib/x.js\n+++ b/lib/x.js\n@@ -1 +1 @@\n-a\n+B\n')
  const workflowFile = path.join(root, 'workflow.json')
  fs.writeFileSync(workflowFile, JSON.stringify({ verdict: 'CLEAN', survivors: [], killed: 0 }))

  const r = runNode(SCRIPT, ['--record',
    '--spec', 'specs/x.md', '--review-run-id', 'rv_bbbbbbbbbbbb',
    '--class', 'silent-fallback', '--legs', 'red:gate', '--outcome', 'caught',
    '--patch', patchFile, '--workflow', workflowFile,
  ], { cwd: root })
  assert.strictEqual(r.status, 2,
    'D2: --legs red:<leg> on a caught outcome must be refused — red: means newly-red (mutation-caused), which ' +
    'can never legally ride a caught outcome that also proceeded through an explained/baseline-red run: ' +
    JSON.stringify({ status: r.status, stdout: r.stdout }))
  // Discriminating on "baseline-red" specifically, not "green": the OLD --record already rejects
  // red:gate for a caught outcome (its single-value "requires --legs green" check), and that old
  // message already contains the word "green" — a check for "green" alone would pass vacuously
  // against today's script without D2's widened enum ever landing.
  assert.match(r.stderr, /baseline-red/,
    'D2: the refusal must name baseline-red:<leg> as an accepted value for this outcome — a message that ' +
    'only ever said "green" (the old single-value check) leaves the caller with no idea the new value exists: ' +
    r.stderr)
  assert.ok(!fs.existsSync(path.join(root, '.claude/spec-runs.jsonl')),
    'a refused --record must append nothing — a partial row here would corrupt --stats\' totals: ' + root)
})

// Vacuity note (2026-08-23, executed): the noWorkflow sub-case below is fully discriminating — the
// pre-image rejects it with exit 2 ("requires --workflow") since --record's old code requires
// --workflow for every outcome in {caught, missed, unresolved} with no red:<leg> arm. The
// withWorkflow sub-case's OWN status assertion is NOT discriminating: the pre-image already exits 2
// for legs:"red:reconcile" on this shape too, but for the OLD reason ("requires --legs green, got
// 'red:reconcile'") — its stderr never mentions --workflow. The stderr assertion below is what makes
// that half of the test genuinely red pre-implementation; kept per the generalized-third-occurrence
// vacuous-rejection class (§ Gotchas) rather than reddened artificially.
test('AC-20260823-09-6: --record --outcome unresolved --legs red:reconcile --patch <p> succeeds without --workflow but is refused with exit 2 naming --workflow when --workflow rides along, since a step-7 dismissal means the reviewer never ran', () => {
  const root = fs.realpathSync(tmpdir('replay-record-unresolved-red'))
  const patchFile = path.join(root, 'mutation.patch')
  fs.writeFileSync(patchFile, '--- a/lib/x.js\n+++ b/lib/x.js\n@@ -1 +1 @@\n-a\n+B\n')
  const workflowFile = path.join(root, 'workflow.json')
  fs.writeFileSync(workflowFile, JSON.stringify({ verdict: 'CLEAN', survivors: [], killed: 0 }))

  const noWorkflow = runNode(SCRIPT, ['--record',
    '--spec', 'specs/x.md', '--review-run-id', 'rv_cccccccccccc',
    '--legs', 'red:reconcile', '--outcome', 'unresolved', '--patch', patchFile,
  ], { cwd: root })
  assert.strictEqual(noWorkflow.status, 0,
    'D3: a step-7 dismissal (red:<leg>, no --workflow) must be RECORDABLE — refusing it forces the session ' +
    'back into the leg-caught/green falsification this spec eliminates: ' + noWorkflow.stderr)
  const row = JSON.parse(fs.readFileSync(path.join(root, '.claude/spec-runs.jsonl'), 'utf8').trim())
  assert.strictEqual(row.legs, 'red:reconcile', 'D3: legs must record the red:<leg> value verbatim: ' + JSON.stringify(row))
  assert.strictEqual(row.outcome, 'unresolved', 'D3: outcome must record unresolved verbatim: ' + JSON.stringify(row))
  const artifact = JSON.parse(fs.readFileSync(path.join(root, '.claude/spec-runs', row.runId + '.json'), 'utf8'))
  assert.strictEqual(artifact.reviewer, null,
    'D3: a step-7 dismissal never dispatched a reviewer — the artifact must record reviewer: null, never a ' +
    'stale or fabricated value: ' + JSON.stringify(artifact.reviewer))

  const withWorkflow = runNode(SCRIPT, ['--record',
    '--spec', 'specs/x.md', '--review-run-id', 'rv_dddddddddddd',
    '--legs', 'red:reconcile', '--outcome', 'unresolved', '--patch', patchFile,
    '--workflow', workflowFile,
  ], { cwd: root })
  assert.strictEqual(withWorkflow.status, 2,
    'D3: the SAME red:<leg> unresolved shape must REFUSE --workflow — a step-7 dismissal by definition never ' +
    'ran the reviewer, so a --workflow value here would fabricate reviewer evidence that does not exist: ' +
    JSON.stringify({ status: withWorkflow.status, stdout: withWorkflow.stdout }))
  assert.match(withWorkflow.stderr, /--workflow/,
    'D3: the refusal must name --workflow specifically as the disallowed flag: ' + withWorkflow.stderr)
  const linesAfter = fs.readFileSync(path.join(root, '.claude/spec-runs.jsonl'), 'utf8').trim().split('\n')
  assert.strictEqual(linesAfter.length, 1,
    'D3: the refused withWorkflow call must append NOTHING — only the noWorkflow call\'s one row may exist: ' +
    JSON.stringify(linesAfter))
})

test('AC-20260823-09-11 [pre-green: predicate-in-test]: --record rejects a malformed --legs value that near-misses the widened baseline-red grammar — a bare "baseline-red" with no colon and no leg, and "baseline-red:" with an empty leg — with exit 2 naming the accepted values, and this rejection SHALL CONTINUE TO hold once baseline-red:<leg> itself becomes valid', () => {
  const root = fs.realpathSync(tmpdir('replay-record-legs-malformed'))

  const bareNoColon = runNode(SCRIPT, ['--record',
    '--spec', 'specs/x.md', '--review-run-id', 'rv_gggggggggggg',
    '--legs', 'baseline-red', '--outcome', 'caught',
  ], { cwd: root })
  assert.strictEqual(bareNoColon.status, 2,
    'D2: a bare "baseline-red" with no colon and no leg must be REFUSED — a widening built on a loose prefix ' +
    'check (e.g. legs.startsWith("baseline-red")) rather than requiring ":<leg>" would wrongly accept this ' +
    'and admit a record with no attributable leg at all: ' +
    JSON.stringify({ status: bareNoColon.status, stdout: bareNoColon.stdout }))
  assert.match(bareNoColon.stderr, /green/i,
    'D2: the refusal must name an accepted value (green) so the caller sees this is an enum violation, not a ' +
    'crash: ' + bareNoColon.stderr)
  assert.match(bareNoColon.stderr, /none/i,
    'D2: the refusal must also name "none" among the accepted values — the widened message must keep ' +
    'enumerating every member, not just the new one: ' + bareNoColon.stderr)

  const emptyLeg = runNode(SCRIPT, ['--record',
    '--spec', 'specs/x.md', '--review-run-id', 'rv_hhhhhhhhhhhh',
    '--legs', 'baseline-red:', '--outcome', 'caught',
  ], { cwd: root })
  assert.strictEqual(emptyLeg.status, 2,
    'D2: "baseline-red:" with an EMPTY leg after the colon must be REFUSED — a widening built on a loose ' +
    'pattern like /^baseline-red:/ (missing the leg-content requirement red:<leg> already enforces via .+) ' +
    'would wrongly accept this and record an attribution naming no leg at all: ' +
    JSON.stringify({ status: emptyLeg.status, stdout: emptyLeg.stdout }))
  assert.match(emptyLeg.stderr, /green/i,
    'D2: this refusal too must name an accepted value: ' + emptyLeg.stderr)

  assert.ok(!fs.existsSync(path.join(root, '.claude/spec-runs.jsonl')),
    'neither malformed --legs invocation may append a row — a partial or garbage row here corrupts --stats\' ' +
    'totals just as badly as a fully-formed bad record would: ' + root)
})

test('AC-20260819-03-11: --record CONTINUES TO exit 2 when --outcome is any value outside caught|missed|leg-caught|unresolved|setup-failed', () => {
  const root = fs.realpathSync(tmpdir('replay-record-badoutcome'))
  const r = runNode(SCRIPT, ['--record',
    '--spec', 'specs/x.md', '--review-run-id', 'rv_eeeeeeeeeeee',
    '--legs', 'green', '--outcome', 'sort-of-caught',
  ], { cwd: root })
  assert.strictEqual(r.status, 2,
    'an --outcome value outside the five-member enum must be refused with exit 2 — accepting an arbitrary ' +
    'string here would let a typo silently corrupt --stats\' bucket totals forever: ' +
    JSON.stringify({ status: r.status, stdout: r.stdout }))
  assert.ok(!fs.existsSync(path.join(root, '.claude/spec-runs.jsonl')),
    'a refused --record must append nothing to the ledger — a partial or garbage row is worse than no row ' +
    'at all: ' + root)
})

// Vacuity note (2026-08-19, executed): this test passes against the pre-spec-03 script today, but
// empirically NOT via D7's validation matrix. The missingWorkflow/missingPatch sub-cases omit
// --class/--file (pre-image-required for every --record call), so they reject via the generic
// missing-required-flag usage error; the setupFailedWithClass sub-case rejects because pre-spec-03
// --record does not recognize "setup-failed" as a valid outcome at all (the OLD three-value check),
// never reaching a --class-specific refusal. Generalized-third-occurrence vacuous-rejection class
// (§ Gotchas) — kept as the correct POST-implementation assertion rather than reddened artificially;
// each sub-case's own stderr-content assertion (naming --workflow/--patch/--class specifically) will
// only pass once the real validation matrix names the actual violated flag, so the test is not
// fully inert even pre-implementation.
test('AC-20260819-03-13: --record exits 2 naming the violated requirement when --outcome caught omits --patch or --workflow, or when --outcome setup-failed rides with --class', () => {
  const root = fs.realpathSync(tmpdir('replay-record-matrix'))
  const patchFile = path.join(root, 'mutation.patch')
  fs.writeFileSync(patchFile, '--- a/lib/x.js\n+++ b/lib/x.js\n@@ -1,3 +1,3 @@\n a\n-b\n+B\n c\n')
  const workflowFile = path.join(root, 'workflow.json')
  fs.writeFileSync(workflowFile, JSON.stringify({ verdict: 'CLEAN', survivors: [], killed: 0 }))

  const missingWorkflow = runNode(SCRIPT, ['--record',
    '--spec', 'specs/x.md', '--review-run-id', 'rv_ffffffffffff', '--legs', 'green',
    '--outcome', 'caught', '--patch', patchFile,
  ], { cwd: root })
  assert.strictEqual(missingWorkflow.status, 2,
    'D7: outcome caught requires --patch AND --workflow — omitting --workflow must be refused, never ' +
    'recorded with a missing evidentiary artifact: ' + JSON.stringify({ status: missingWorkflow.status, stderr: missingWorkflow.stderr }))
  assert.match(missingWorkflow.stderr, /--workflow/,
    'D7: the refusal must NAME the missing flag so the caller knows what to add: ' + missingWorkflow.stderr)

  const missingPatch = runNode(SCRIPT, ['--record',
    '--spec', 'specs/x.md', '--review-run-id', 'rv_ffffffffffff', '--legs', 'green',
    '--outcome', 'caught', '--workflow', workflowFile,
  ], { cwd: root })
  assert.strictEqual(missingPatch.status, 2,
    'D7: outcome caught also requires --patch — omitting it must be refused the same way: ' + JSON.stringify({ status: missingPatch.status, stderr: missingPatch.stderr }))
  assert.match(missingPatch.stderr, /--patch\b/,
    'D7: the refusal must name --patch as the missing flag: ' + missingPatch.stderr)

  const setupFailedWithClass = runNode(SCRIPT, ['--record',
    '--spec', 'specs/x.md', '--review-run-id', 'rv_ffffffffffff', '--legs', 'none',
    '--outcome', 'setup-failed', '--class', 'silent-fallback',
  ], { cwd: root })
  assert.strictEqual(setupFailedWithClass.status, 2,
    'D7: setup-failed REFUSES --class — a class implies a mutation was selected, which never happened when ' +
    'setup itself failed: ' + JSON.stringify({ status: setupFailedWithClass.status, stderr: setupFailedWithClass.stderr }))
  assert.match(setupFailedWithClass.stderr, /--class/,
    'D7: the refusal must name --class as the disallowed flag: ' + setupFailedWithClass.stderr)

  assert.ok(!fs.existsSync(path.join(root, '.claude/spec-runs.jsonl')),
    'D7: none of these three refused invocations may append a row — a validation-matrix violation must ' +
    'never partially record: ' + root)
})

// specs/20260901/08-corpus-derivation-and-kill-match.md D3 (2026-09-01, brief 19): --pick-class
// counts MEASUREMENT replay rows (caught/missed/leg-caught, D5 of 20260819/03) per corpus class
// and picks the fewest, tying to derived-first then corpus file order; every corpus class starts
// at 0 even with zero rows recorded for it. This mode does not exist at HEAD (usage/exit 2 on the
// unrecognized flag today), so every assertion below is red on MODE_FLAGS not knowing --pick-class.
test('AC-20260901-08-4: --pick-class picks the fewest-measurement-rows class, tying derived-first then corpus order, and ignores non-measurement rows entirely', () => {
  const emptyDir = fs.realpathSync(tmpdir('replay-pickclass-empty'))
  const empty = runNode(SCRIPT, ['--pick-class', '--root', emptyDir])
  assert.strictEqual(empty.status, 0, 'D3: --pick-class over an empty ledger must succeed: ' + empty.stderr)
  assert.match(empty.stdout, /^class=prefix-collision-coverage-fail-open derived=true rows=0$/m,
    'D3/D5: with zero replay rows every corpus class starts at 0, and the tie resolves derived-first ' +
    '— the shipped corpus\'s one derived class must be picked: ' + empty.stdout)

  const tieDir = fs.realpathSync(tmpdir('replay-pickclass-tie'))
  writeLedger(tieDir, [
    replayLedgerRow(1, { class: 'prefix-collision-coverage-fail-open', outcome: 'caught' }),
    replayLedgerRow(2, { class: 'promise-carried-not-delivered', outcome: 'caught' }),
    replayLedgerRow(3, { class: 'self-consistent-polarity', outcome: 'caught' }),
    replayLedgerRow(4, { class: 'silent-fallback', outcome: 'caught' }),
    replayLedgerRow(5, { class: 'boundary-shift', outcome: 'caught' }),
    replayLedgerRow(6, { class: 'dead-wiring', outcome: 'caught' }),
    // doc-contract-lie has zero rows; a setup-failed row for it must not count as a measurement.
    replayLedgerRow(7, { class: 'doc-contract-lie', outcome: 'setup-failed', legs: 'none' }),
  ])
  const tie = runNode(SCRIPT, ['--pick-class', '--root', tieDir])
  assert.strictEqual(tie.status, 0, 'D3: --pick-class over this ledger must succeed: ' + tie.stderr)
  assert.match(tie.stdout, /^class=doc-contract-lie derived=false rows=0$/m,
    'D3/D5: every hand-authored class carries >=1 measurement row except doc-contract-lie (its only ' +
    'row is setup-failed, a non-measurement outcome that must not count) — it must win outright at 0 ' +
    'rows, and a setup-failed row recorded for it must never change that answer: ' + tie.stdout)

  const orderDir = fs.realpathSync(tmpdir('replay-pickclass-order'))
  writeLedger(orderDir, [
    replayLedgerRow(1, { class: 'prefix-collision-coverage-fail-open', outcome: 'caught' }),
  ])
  const order = runNode(SCRIPT, ['--pick-class', '--root', orderDir])
  assert.strictEqual(order.status, 0, 'D3: --pick-class over this ledger must succeed: ' + order.stderr)
  assert.match(order.stdout, /^class=promise-carried-not-delivered derived=false rows=0$/m,
    'D3: once the derived class has 1 measurement row and every hand-authored class still has 0, a ' +
    'hand-authored class must win the tie (fewest rows is the primary key, derived-first only breaks ' +
    'ties among equals) — and among the six tied hand-authored classes at 0, corpus file order picks ' +
    'promise-carried-not-delivered (the first-listed class): ' + order.stdout)
})

test('AC-20260819-02-7: --stats aggregates replay rows into per-outcome totals, per-class counts, and a catch-rate that excludes leg-caught from the denominator', () => {
  const root = fs.realpathSync(tmpdir('replay-stats'))
  const rows = [
    replayLedgerRow(1, { outcome: 'caught', class: 'silent-fallback' }),
    replayLedgerRow(2, { outcome: 'caught', class: 'boundary-shift' }),
    replayLedgerRow(3, { outcome: 'missed', class: 'dead-wiring' }),
    replayLedgerRow(4, { outcome: 'leg-caught', class: 'doc-contract-lie', legs: 'red:gate' }),
  ]
  writeLedger(root, rows)
  const r = runNode(SCRIPT, ['--stats'], { cwd: root })
  assert.strictEqual(r.status, 0, 'D9: --stats over a well-formed ledger must succeed: ' + r.stderr)
  assert.match(r.stdout, /catch-rate 2\/3/,
    'D9: catch-rate = caught/(caught+missed), EXCLUDING leg-caught from the denominator — the harness ' +
    'measures the reviewer\'s blind-spot rate on leg-INVISIBLE defects, and a leg-caught row is corpus ' +
    'feedback (the class was not leg-invisible after all), never reviewer evidence: ' + r.stdout)
  assert.match(r.stdout, /(?<!leg-)\bcaught\b\D*2/i,
    'D9: the caught total (2, excluding the leg-caught row) must be printed among the per-outcome totals: ' + r.stdout)
  assert.match(r.stdout, /\bmissed\b\D*1/i,
    'D9: the missed total (1) must be printed among the per-outcome totals: ' + r.stdout)
  assert.match(r.stdout, /leg-caught\D*1/i,
    'D9: the leg-caught total (1) must still be printed even though it is excluded from catch-rate — ' +
    'hiding it would make the corpus-feedback signal invisible: ' + r.stdout)
})

test('AC-20260819-03-12: --stats prints all five outcome buckets and still excludes unresolved and setup-failed from the catch-rate denominator', () => {
  const root = fs.realpathSync(tmpdir('replay-stats-fivebucket'))
  writeLedger(root, [
    replayLedgerRow(1, { outcome: 'caught', class: 'silent-fallback' }),
    replayLedgerRow(2, { outcome: 'missed', class: 'dead-wiring' }),
    replayLedgerRow(3, { outcome: 'leg-caught', class: 'doc-contract-lie', legs: 'red:gate' }),
    replayLedgerRow(4, { outcome: 'unresolved', class: 'boundary-shift' }),
    replayLedgerRow(5, { outcome: 'setup-failed', class: null, legs: 'none' }),
  ])
  const r = runNode(SCRIPT, ['--stats'], { cwd: root })
  assert.strictEqual(r.status, 0, 'D6: --stats over a ledger carrying one row of every outcome must succeed: ' + r.stderr)
  assert.match(r.stdout, /catch-rate 1\/2/,
    'D6: catch-rate stays caught/(caught+missed) — with one caught and one missed row, unresolved and ' +
    'setup-failed must NEVER enter the denominator, or a run with no truth value would silently corrupt ' +
    'the number the instrument exists to protect: ' + r.stdout)
  for (const bucket of ['caught', 'missed', 'leg-caught', 'unresolved', 'setup-failed']) {
    assert.match(r.stdout, new RegExp('\\b' + bucket.replace(/-/g, '\\-') + '\\b\\D*1'),
      `D6: the ${bucket} bucket must be printed with its total (1) — a missing bucket makes a whole ` +
      `outcome class invisible in the totals: ` + r.stdout)
  }
})

test('AC-20260823-09-10: --stats SHALL CONTINUE TO count a legs:"baseline-red:reconcile" caught row in the caught bucket and the catch-rate numerator/denominator exactly as a legs:"green" caught row, since --stats never reads the legs field at all', () => {
  const root = fs.realpathSync(tmpdir('replay-stats-baselinered'))
  writeLedger(root, [
    replayLedgerRow(1, { outcome: 'caught', class: 'silent-fallback', legs: 'baseline-red:reconcile' }),
    replayLedgerRow(2, { outcome: 'missed', class: 'dead-wiring' }),
  ])
  const r = runNode(SCRIPT, ['--stats'], { cwd: root })
  assert.strictEqual(r.status, 0, 'D7: --stats over a ledger carrying a baseline-red row must succeed: ' + r.stderr)
  assert.match(r.stdout, /catch-rate 1\/2/,
    'D7: catch-rate must count the baseline-red:reconcile row in the numerator exactly as a green row would ' +
    '— --stats is untouched by this spec (Rationale: "catch-rate math never changes") and never reads legs ' +
    'at all, so whatever string rides in that field can never move the arithmetic: ' + r.stdout)
  assert.match(r.stdout, /\bcaught\b\D*1/i,
    'D7: the caught total (1) must include the baseline-red row among the per-outcome totals: ' + r.stdout)
})

test('AC-20260819-02-8 / AC-20260826-01-6: --teardown refuses a --dir whose private git dir carries no scratch-worktree marker with exit 3 and deletes nothing, and removes a --setup-created worktree cleanly', () => {
  const root = fs.realpathSync(tmpdir('replay-teardown-repo'))
  gitRepo(root)
  const sha = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()

  const plainDir = path.join(fs.realpathSync(tmpdir('replay-teardown-plain')), 'plain')
  fs.mkdirSync(plainDir, { recursive: true })
  const refuse = runNode(SCRIPT, ['--teardown', '--dir', plainDir], { cwd: root })
  assert.strictEqual(refuse.status, 3,
    'D4: a --dir that is not a linked worktree (so its private git dir can carry no scratch-worktree marker) ' +
    'must be refused with exit 3 — the marker guard means teardown can only ever delete a directory THIS ' +
    'harness created: ' + refuse.stderr)
  assert.ok(fs.existsSync(plainDir),
    'D4: a refused teardown must delete nothing — a marker-less directory surviving is the entire point of ' +
    'the guard: ' + plainDir)

  const setupDir = path.join(fs.realpathSync(tmpdir('replay-teardown-setup')), 'wt')
  const setup = runNode(SCRIPT, ['--setup', '--commit', sha, '--dir', setupDir], { cwd: root })
  assert.strictEqual(setup.status, 0, 'fixture setup: --setup must succeed to produce a teardown-eligible worktree: ' + setup.stderr)
  const marker = markerPath(setupDir)
  assert.ok(fs.existsSync(marker),
    'D3/D4: this fixture must produce a worktree carrying the scratch-worktree marker in its PRIVATE git dir ' +
    'BEFORE teardown runs, at the exact path --teardown itself resolves (`git -C <dir> rev-parse --git-dir` ' +
    '+ "scratch-worktree") — otherwise this test is not actually exercising the marker guard it claims to: ' + marker)

  const teardown = runNode(SCRIPT, ['--teardown', '--dir', setupDir], { cwd: root })
  assert.strictEqual(teardown.status, 0,
    'D4: a --setup-created --dir carrying the marker in its private git dir must be removed cleanly: ' + teardown.stderr)
  assert.ok(!fs.existsSync(setupDir),
    'D4: the worktree directory must be gone after teardown — a surviving directory means the scratch ' +
    'worktree leaked onto disk forever: ' + setupDir)
  const list = execFileSync('git', ['-C', root, 'worktree', 'list'], { encoding: 'utf8' })
  assert.ok(!list.includes(setupDir),
    'D4: `git worktree remove --force` must prune the worktree from git\'s own registry — a stale entry ' +
    'there blocks re-adding the same path on the next replay run: ' + list)
})

const CORPUS_CLASSES = [
  'promise-carried-not-delivered', 'self-consistent-polarity', 'silent-fallback',
  'boundary-shift', 'dead-wiring', 'doc-contract-lie',
]

// AC-20260901-08-10 (tagged, specs/20260901/08-corpus-derivation-and-kill-match.md D5): the six
// 20260819/02 class ids must CONTINUE TO carry their own headings with a recipe once the corpus
// gains its "## Derived classes" region — this test's own assertion (per-id heading lookup by
// startsWith, not an exact 6-heading count) already tolerates a 7th heading appearing after them,
// so no assertion change is needed; only the AC-ID is added.
test('AC-20260819-02-9 / AC-20260901-08-10: the shipped corpus file carries all 6 Contracts class ids, each as its own heading with a recipe section', () => {
  const corpusPath = path.join(SPEC, 'doctrine/replay-corpus.md')
  assert.ok(fs.existsSync(corpusPath),
    'D11: spec/doctrine/replay-corpus.md must exist — it is the file whose ids --record --class values must ' +
    'match; a missing file fails this structural check once instead of every downstream --record silently ' +
    'having nothing to match: ' + corpusPath)
  const src = read('spec/doctrine/replay-corpus.md')
  const headings = [...src.matchAll(/^(#{2,3})\s+(.+)$/gm)]
  for (const id of CORPUS_CLASSES) {
    const idx = headings.findIndex(h => h[2].trim() === id || h[2].trim().startsWith('`' + id + '`'))
    assert.ok(idx !== -1,
      `D11/AC-9: class id "${id}" (from the Contracts block) must appear as its own heading in ` +
      `replay-corpus.md — --record --class values are matched against these ids, so a missing heading means ` +
      `the class can never be recorded: found headings ${JSON.stringify(headings.map(h => h[2]))}`)
    const level = headings[idx][1].length
    const start = headings[idx].index + headings[idx][0].length
    let end = src.length
    for (let j = idx + 1; j < headings.length; j++) {
      if (headings[j][1].length <= level) { end = headings[j].index; break }
    }
    const section = src.slice(start, end)
    assert.match(section, /recipe/i,
      `D11: class "${id}"'s section must carry a recipe — a class with no recipe gives the mutation-` +
      `authoring session nothing to follow when /spec:replay picks this class: section began ` +
      `${JSON.stringify(section.slice(0, 200))}`)
  }
})

test('AC-20260819-02-11: spec-status.js SHALL CONTINUE TO exit 0 with zero anomalies when the ledger contains stage:"replay" rows', () => {
  const dir = fs.realpathSync(tmpdir('spec-status-replay'))
  fs.mkdirSync(path.join(dir, 'docs/roadmap'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'docs/roadmap/00-overview.md'),
    '# X Roadmap — Overview\n\n## Sequence\n\n| #  | Brief | Phase | Depends on |\n|---|---|---|---|\n' +
    '| 01 | auth | P0 | — |\n')
  fs.writeFileSync(path.join(dir, 'docs/roadmap/01-auth.md'),
    '# 01 — Auth\n\nPhase: P0 · Depends on: — · Primary workspaces: api\n')
  const specDir = path.join(dir, 'specs/20260701')
  fs.mkdirSync(specDir, { recursive: true })
  fs.writeFileSync(path.join(specDir, '01-auth-core.md'), '---\ndate: 2026-07-01\nstatus: done\nbrief: 01\n---\n\n# spec\n')
  fs.mkdirSync(path.join(dir, '.claude'), { recursive: true })
  fs.writeFileSync(path.join(dir, '.claude/spec-runs.jsonl'), JSON.stringify({
    ts: '2026-08-19T00:00:00Z', stage: 'replay', spec: 'specs/20260701/01-auth-core.md',
    runId: 'rp_aaaaaaaaaaaa', reviewRunId: 'rv_aaaaaaaaaaaa', class: 'silent-fallback',
    file: 'lib/x.js', legs: 'green', outcome: 'caught', tokens: 100,
  }) + '\n')

  const r = runNode('scripts/spec-status.js', ['--root', dir, '--json'])
  assert.strictEqual(r.status, 0,
    'spec-status.js must keep exiting 0 with an unrecognized ledger stage in the mix — a red exit here ' +
    'would mean shipping replay.js broke every host\'s status derivation the moment it recorded a row: ' + r.stderr)
  const out = JSON.parse(r.stdout)
  assert.deepStrictEqual(out.anomalies, [],
    'a stage:"replay" row must be silently ignored by the observation reader (it only qualifies stage:' +
    '"review"/"observe" rows, per lib/observation.js) — surfacing it as an anomaly would falsely nag every ' +
    'host the moment /spec:replay records its first row: ' + JSON.stringify(out.anomalies))
})

// specs/20260820/02-replay-scratch-write-access.md (2026-08-20): the same live run pinned above
// (F1/F2/F3/F4) also left two doctrine gaps in replay.md's Phase 1. D4 — `git checkout -- .`
// cannot remove files setupCommand *creates* (that run's own first-run stray root
// package-lock.json), so the setup gate needs `git clean -fd` after the restore. D5 — the
// authoring Edit/Write into `{dir}` now passes the cross-worktree write guard via the
// `scratch-worktree` marker allow (spec 20260820/02's own D1/D2, marker renamed by specs/20260826/01
// D3, pinned in tests/worktree-hook.test.js); replay.md must say so, and say that reaching for Bash instead
// (the actual 2026-08-20 incident shape) is a contract violation, not an improvisation. Amended
// 2026-08-31: the mutation is authored in-session (the worker dispatch was refused by hosts'
// unattended permission layer — salon-os, three refusals — and delegation carries no blindness
// value), so the step is now "Author the mutation (D2)"; the guard/marker/Bash contract binds
// the session's own writes identically.
test('AC-20260820-02-6: replay.md\'s Phase 1 setup gate appends "git -C {dir} clean -fd" after the checkout restore, and the mutation-authoring step states the marker-guard write path with Bash-as-violation', () => {
  const replayMdPath = path.join(SPEC, 'commands/replay.md')
  assert.ok(fs.existsSync(replayMdPath),
    'D4/D5: spec/commands/replay.md must exist — it is the doctrine file both Decisions amend; a missing ' +
    'file fails this structural check once instead of leaving the setup-gate and authoring-step claims ' +
    'silently unverifiable: ' + replayMdPath)
  const src = read('spec/commands/replay.md')

  const phase1Match = src.match(/## Phase 1 — Mutation authoring\n([\s\S]*?)\n## Phase 2 —/)
  assert.ok(phase1Match,
    'sanity: Phase 1 — Mutation authoring must exist as its own section between Phase 0 and Phase 2 — if this ' +
    'heading moved or was reworded, every scoped assertion below is checking the wrong text region')
  const phase1 = phase1Match[1]

  // D4: scope the clean-step assertion to the SETUP GATE step specifically (step 2, up to step
  // 3's class-selection heading) rather than the whole file — a `clean -fd` mentioned elsewhere
  // in Phase 1 (e.g. inside the retry step 7) would satisfy a whole-file grep without actually
  // fixing the setup gate's own restore.
  const setupGateMatch = phase1.match(/2\.\s+\*\*Setup gate \(D4\):\*\*([\s\S]*?)3\.\s+\*\*Pick a corpus class:\*\*/)
  assert.ok(setupGateMatch,
    'sanity: step 2, "**Setup gate (D4):**", must exist between step 1 (Setup) and step 3 (Pick a corpus ' +
    'class) — if this step\'s heading moved or was reworded, the clean-step assertion below is scoped to the ' +
    'wrong text and could pass or fail for the wrong reason')
  const setupGateNormalized = setupGateMatch[1].replace(/\s+/g, ' ')

  const checkoutIdx = setupGateNormalized.indexOf('git -C {dir} checkout -- .')
  assert.ok(checkoutIdx !== -1,
    'sanity: the setup gate\'s existing `git -C {dir} checkout -- .` restore must still be present — if this ' +
    'was removed instead of extended, the ordering assertion below (clean AFTER checkout) cannot mean anything')
  const cleanIdx = setupGateNormalized.indexOf('git -C {dir} clean -fd')
  assert.ok(cleanIdx !== -1,
    'D4: the setup gate must run "git -C {dir} clean -fd" — `git checkout -- .` alone cannot remove files ' +
    'setupCommand CREATES (the 2026-08-20 run\'s own untracked root package-lock.json), so that stray keeps ' +
    'reaching the tree review-legs.js and the blind reviewer read: ' + JSON.stringify(setupGateMatch[1]))
  assert.ok(cleanIdx > checkoutIdx,
    'D4: "git -C {dir} clean -fd" must run AFTER the "git -C {dir} checkout -- ." restore, per the Decision\'s ' +
    'own wording ("appends... after the... restore") — running clean first would let a subsequent checkout ' +
    'reintroduce nothing new, but the ORDER is what the Decision pins, not just co-presence: ' +
    JSON.stringify(setupGateMatch[1]))

  // D5: scope the sanctioned-write assertion to the AUTHORING step specifically (step 4,
  // up to step 5's capture-and-apply heading).
  const dispatchMatch = phase1.match(/4\.\s+\*\*Author the mutation \(D2\):\*\*([\s\S]*?)5\.\s+\*\*Capture and apply \(D9\):\*\*/)
  assert.ok(dispatchMatch,
    'sanity: step 4, "**Author the mutation (D2):**", must exist between step 3 (Pick a ' +
    'corpus class) and step 5 (Capture and apply) — if this step\'s heading moved or was reworded, the ' +
    'sanctioned-write assertions below are scoped to the wrong text')
  const dispatchNormalized = dispatchMatch[1].replace(/\s+/g, ' ')

  // Matched as two independent phrase fragments (not one contiguous-sentence literal) per the
  // repo's own hard-wrap gotcha (pipeline rules § Gotchas, specs/20260816/01) — a doctrine worker
  // splitting D5's sentence across two template fragments or two markdown lines must still pass,
  // since whitespace is already normalized above.
  assert.match(dispatchNormalized, /write guard/i,
    'D5: the authoring step must name the cross-worktree WRITE GUARD the session\'s Edit/Write passes ' +
    '— omitting this leaves no doctrine trail explaining why authoring never needs Bash to write into ' +
    '{dir}: ' + JSON.stringify(dispatchMatch[1]))
  assert.match(dispatchNormalized, /marker/i,
    'D5: the authoring step must name the MARKER as the mechanism the write guard passes through — ' +
    'naming a guard with no marker mention leaves the sanctioned path unspecified, which is exactly what let ' +
    'the 2026-08-20 authoring attempt improvise a Bash tunnel instead: ' + JSON.stringify(dispatchMatch[1]))
  assert.match(dispatchNormalized, /\bBash\b/,
    'D5: the authoring step must name BASH specifically as the disallowed path — the 2026-08-20 ' +
    'incident\'s actual shape was reaching for Bash once Edit/Write was blocked, so the sentence ' +
    'must name that exact escape route, not just gesture at "other tools": ' + JSON.stringify(dispatchMatch[1]))
  assert.match(dispatchNormalized, /contract violation|failed authoring attempt/i,
    'D5: the authoring step must state that mutating files through Bash is a CONTRACT VIOLATION treated ' +
    'as a failed authoring attempt — naming Bash without saying what happens when authoring reaches for it ' +
    'anyway leaves the 2026-08-20 bypass shape just as easy to repeat next time: ' + JSON.stringify(dispatchMatch[1]))
})

// specs/20260823/09-replay-baseline-attribution.md D4/D5 (2026-08-23, rp_1b176ebff5c7): step 7's
// pre-fix text treats EVERY red leg as mutation evidence — the retry-then-leg-caught path fires no
// matter WHY a leg is red. D4 re-keys the path to newly-red legs only, with a deterministic
// reconcile exemption grounded in step 4's File-Plan confinement of the mutation itself. D5 routes
// the residual case (neither newly-red-attributable nor reconcile-exempt) to one AskUserQuestion,
// whose dismissal must record `unresolved` via D3's workflow-refusing `red:<leg>` arm rather than
// being silently discarded. Section-scoped exactly like AC-20260820-02-6 above: whole-file grep
// would let a paraphrase living in Phase 2/3/4 satisfy this pin without step 7 itself ever changing.
test('AC-20260823-09-9: replay.md\'s Phase 1 step 7 re-keys red-leg attribution to newly-red legs, states the reconcile exemption grounded in File-Plan confinement, and states the unattributable-leg AskUserQuestion whose dismissal records unresolved via the red:<leg> arm', () => {
  const replayMdPath = path.join(SPEC, 'commands/replay.md')
  assert.ok(fs.existsSync(replayMdPath),
    'D4/D5: spec/commands/replay.md must exist — it is the doctrine file both Decisions amend; a missing ' +
    'file fails this structural check once instead of leaving step 7\'s claims silently unverifiable: ' + replayMdPath)
  const src = read('spec/commands/replay.md')

  const phase1Match = src.match(/## Phase 1 — Mutation authoring\n([\s\S]*?)\n## Phase 2 —/)
  assert.ok(phase1Match,
    'sanity: Phase 1 — Mutation authoring must exist as its own section ending at Phase 2 — if this heading ' +
    'moved or was reworded, the step-7 slice below is scoped to the wrong text region')
  const phase1 = phase1Match[1]

  // D4/D5: step 7 is Phase 1's FINAL numbered step, with no numbered sibling to bound it — slice
  // from its own heading to the end of the phase1 capture (which already stops at Phase 2).
  const step7Match = phase1.match(/7\.\s+\*\*Red legs[\s\S]*$/)
  assert.ok(step7Match,
    'sanity: step 7, "**Red legs → ...**", must exist as Phase 1\'s final numbered step — if this step\'s ' +
    'heading moved or was reworded, the assertions below are scoped to the wrong text')
  const step7 = step7Match[0].replace(/\s+/g, ' ')

  assert.match(step7, /newly[- ]red/i,
    'D4: step 7 must re-key the retry/leg-caught path to NEWLY-red legs specifically — the pre-fix text ' +
    'treats every red leg as mutation evidence, exactly the false attribution rp_1b176ebff5c7 recorded on ' +
    '2026-08-23: ' + JSON.stringify(step7Match[0]))
  assert.match(step7, /reconcile/i,
    'D4: step 7 must name reconcile as the deterministic exemption — without it a reconcile red is treated ' +
    'as newly-red evidence on every replay, not just explained per the measured 14/17 baseline-red rows: ' +
    JSON.stringify(step7Match[0]))
  assert.match(step7, /file[- ]plan/i,
    'D4: the reconcile exemption must be grounded in File-Plan confinement (the mutation is File-Plan-' +
    'confined by step 4\'s authoring contract, so reconcile redness — definitionally about out-of-plan paths — ' +
    'can never be mutation-caused) — omitting the ground leaves the exemption unexplained doctrine, easy to ' +
    'drop at the next edit: ' + JSON.stringify(step7Match[0]))
  assert.match(step7, /AskUserQuestion/,
    'D5: step 7 must state the unattributable-leg AskUserQuestion — a red leg neither newly-red nor reconcile' +
    '-exempt has no attribution path in the pre-fix text, forcing the same falsification this spec eliminates: ' +
    JSON.stringify(step7Match[0]))
  assert.match(step7, /dismiss/i,
    'D5: step 7 must state that a DISMISSED question resolves to a recordable outcome, not silent discard — ' +
    'discard-on-dismiss is the exact defect specs/20260819/03 D3 already fixed for Phase 3\'s ambiguous seam: ' +
    JSON.stringify(step7Match[0]))
  assert.match(step7, /unresolved/i,
    'D5: the dismissal must resolve to outcome unresolved specifically, never a silent drop: ' + JSON.stringify(step7Match[0]))
  assert.match(step7, /red:<leg>/,
    'D5: the dismissal must record via the red:<leg> arm (D3\'s workflow-refusing arm) — a step-7 dismissal ' +
    'means the reviewer never ran, so recording green or baseline-red here would fabricate reviewer evidence ' +
    'that does not exist: ' + JSON.stringify(step7Match[0]))
})

// specs/20260831/01-replay-range-materialization.md D6/D7 (2026-08-31): section-scoped exactly
// like AC-20260823-09-9 above — a whole-file grep would let a paraphrase living anywhere else in
// the file satisfy this pin without step 1's own invocation or step 7's own rung 3 ever changing.
test('AC-20260831-01-7: replay.md states, in Phase 1 step 1, that setup passes --overlay {commit} because the judged range ends at the close commit, and in step 7 rung 3, the pristine-baseline verification (reset --hard HEAD^, fresh manifest, re-run legs) between the failed retry and leg-caught, with red-pristine routing to rung 4\'s seam', () => {
  const replayMdPath = path.join(SPEC, 'commands/replay.md')
  assert.ok(fs.existsSync(replayMdPath),
    'D6/D7: spec/commands/replay.md must exist — it is the doctrine file both Decisions amend; a missing ' +
    'file fails this structural check once instead of leaving step 1/7\'s claims silently unverifiable: ' + replayMdPath)
  const src = read('spec/commands/replay.md')

  const phase1Match = src.match(/## Phase 1 — Mutation authoring\n([\s\S]*?)\n## Phase 2 —/)
  assert.ok(phase1Match,
    'sanity: Phase 1 — Mutation authoring must exist as its own section ending at Phase 2 — if this heading ' +
    'moved or was reworded, the step-1/step-7 slices below are scoped to the wrong text region')
  const phase1 = phase1Match[1]

  // Step 1 is Phase 1's first numbered step, bounded by step 2's own heading.
  const step1Match = phase1.match(/1\.\s+\*\*Setup:\*\*[\s\S]*?(?=\n2\.\s+\*\*Setup gate)/)
  assert.ok(step1Match,
    'sanity: step 1, "**Setup:** ...", must exist as Phase 1\'s first numbered step, bounded by step 2\'s own ' +
    'heading — if this step moved or was reworded, the assertions below are scoped to the wrong text')
  const step1 = step1Match[0].replace(/\s+/g, ' ')

  assert.match(step1, /--overlay\s*\{commit\}/,
    'D7: step 1 must state that setup passes --overlay {commit} — replay.md\'s own invocation must always ' +
    'materialize the judged range\'s true upper bound, not just stand the tree at the parent: ' + JSON.stringify(step1Match[0]))
  assert.match(step1, /judged range/i,
    'D6: step 1 must explain WHY --overlay is passed — the judged range (range-identity spec 20260824/06 ' +
    'D3/D7) ends at the close commit, not the parent — omitting the ground leaves the flag unexplained ' +
    'doctrine a future reader could drop: ' + JSON.stringify(step1Match[0]))
  assert.match(step1, /close commit/i,
    'D6: step 1 must name the close commit specifically as the range\'s true upper bound: ' + JSON.stringify(step1Match[0]))

  // Step 7 is Phase 1's final numbered step, unbounded above (no numbered sibling below it).
  const step7Match = phase1.match(/7\.\s+\*\*Red legs[\s\S]*$/)
  assert.ok(step7Match,
    'sanity: step 7, "**Red legs → ...**", must exist as Phase 1\'s final numbered step — if this step\'s ' +
    'heading moved or was reworded, the assertions below are scoped to the wrong text')
  const step7 = step7Match[0].replace(/\s+/g, ' ')

  assert.match(step7, /reset --hard HEAD\^/,
    'D6: rung 3 must state the pristine-baseline verification\'s exact command, git reset --hard HEAD^ — ' +
    'dropping exactly the mutation commit (the overlay commit, or the parent when none exists, remains) — ' +
    'before leg-caught is ever recorded: ' + JSON.stringify(step7Match[0]))
  assert.match(step7, /fresh manifest|fresh \{manifestPath\}/i,
    'D6: rung 3 must state that a FRESH manifest is used for the pristine re-run — reusing the mutation-' +
    'tainted manifest would misattribute the pristine result: ' + JSON.stringify(step7Match[0]))
  assert.match(step7, /pristine/i,
    'D6: rung 3 must name the pristine-baseline verification explicitly — this is the whole mechanism that ' +
    'stops a false leg-caught from ever being recorded: ' + JSON.stringify(step7Match[0]))
  assert.match(step7, /rung 4|question seam|AskUserQuestion/i,
    'D6: rung 3 must state that a STILL-red pristine result routes to rung 4\'s question seam — silently ' +
    'recording leg-caught (or silently explaining it away) on a pristine-red result would misattribute ' +
    'environment drift as either mutation-caused or pre-existing: ' + JSON.stringify(step7Match[0]))
})

// ---- 2026-08-27 incident (direct fix, no spec): the CWD-relocation trap. ------------------------
// During the review of specs/20260827/01 the session followed Phase 1 step 2's "run it inside
// {dir}" with a bare `cd`, and the Bash tool's working directory persisted. Every later
// cwd-defaulting harness mode therefore resolved the repo to the scratch worktree: --record
// printed a runId and appended the measurement row into a tree --teardown deleted seconds later,
// leaving the replay silently unrecorded and permanently overdue. It was recovered only because
// the patch and the reviewer return happened to live outside the copy, and it was NOTICED only
// because spec-review-driver.js's `replay-recorded` mark already verifies the row landed (that
// half of the fix was in place — this is the other half). Second working-directory relocation
// trap on record in this pipeline (the first is the worktree merge-back CWD trap), so per core §
// Incident Policy this is an in-place fix with a behavioural pin, not a standing guard.
//
// The two pins below are the fix's two halves: replay.js resolves its root from a NAMED --root
// rather than inferring one from wherever the shell stands, and replay.md's setup gate stops
// telling the session to relocate in the first place. Both are discriminating against the
// pre-image: the old arg loop falls through to usage()/exit 2 on an unrecognized --root, and the
// old step-2 text contains none of the asserted strings.

test('replay-root-1: --record --root <repo> appends the measurement row into <repo>/.claude/spec-runs.jsonl even when the process cwd is an unrelated directory, so a session standing inside the scratch worktree can no longer redirect the row into a tree teardown is about to delete', () => {
  const repo = fs.realpathSync(tmpdir('replay-root-repo'))
  const elsewhere = fs.realpathSync(tmpdir('replay-root-elsewhere'))
  const patchFile = path.join(elsewhere, 'mutation.patch')
  fs.writeFileSync(patchFile, '--- a/lib/x.js\n+++ b/lib/x.js\n@@ -1 +1 @@\n-a\n+B\n')
  const workflowFile = path.join(elsewhere, 'workflow.json')
  fs.writeFileSync(workflowFile, JSON.stringify({ verdict: 'CLEAN', survivors: [] }))

  const r = runNode(SCRIPT, ['--record', '--root', repo,
    '--spec', 'specs/x.md', '--review-run-id', 'rv_cccccccccccc',
    '--class', 'silent-fallback', '--legs', 'green', '--outcome', 'caught',
    '--patch', patchFile, '--workflow', workflowFile,
  ], { cwd: elsewhere })
  assert.strictEqual(r.status, 0,
    '--record --root must succeed against a repo the shell is not standing in — the whole point of the flag ' +
    'is that the caller names the ledger\'s home instead of the harness inferring it: ' +
    JSON.stringify({ status: r.status, stdout: r.stdout, stderr: r.stderr }))

  const ledger = path.join(repo, '.claude/spec-runs.jsonl')
  assert.ok(fs.existsSync(ledger),
    'the row must land under --root, not under cwd — landing under cwd is exactly the 2026-08-27 incident, ' +
    'where the ledger followed the session into the scratch worktree and died at teardown: ' + repo)
  const rows = fs.readFileSync(ledger, 'utf8').trim().split('\n').map(JSON.parse)
  assert.strictEqual(rows.length, 1, 'exactly one row: ' + JSON.stringify(rows))
  assert.strictEqual(rows[0].stage, 'replay', 'the row must be the replay stage row: ' + JSON.stringify(rows[0]))
  assert.strictEqual(rows[0].outcome, 'caught', 'the recorded outcome must survive the relocation: ' + JSON.stringify(rows[0]))

  assert.ok(!fs.existsSync(path.join(elsewhere, '.claude')),
    'NOTHING may be written under the process cwd when --root names a different repo — a row written to both ' +
    'places would double-count in --stats and still lose the copy inside a torn-down worktree: ' + elsewhere)

  // The retained evidence artifact follows the row, not the shell — losing it was half the 2026-08-27
  // damage (the score had to be re-derived from files that happened to live outside the copy).
  assert.ok(fs.existsSync(path.join(repo, '.claude/spec-runs')),
    'the retained per-run artifact directory must sit under --root alongside the ledger it indexes: ' + repo)
})

test('replay-root-2: --root naming a path that is not an existing directory is refused with exit 2 before anything is appended, so a typo\'d root can never silently create a ledger in a stray location', () => {
  const repo = fs.realpathSync(tmpdir('replay-root-badroot'))
  const missing = path.join(repo, 'no', 'such', 'dir')
  const r = runNode(SCRIPT, ['--stats', '--root', missing], { cwd: repo })
  assert.strictEqual(r.status, 2,
    'a --root that does not exist is a usage error, not a directory to create — silently mkdir-ing it would ' +
    'reproduce the incident with an extra step: ' + JSON.stringify({ status: r.status, stderr: r.stderr }))
  assert.match(r.stderr, /--root/,
    'the refusal must name the offending flag so the caller knows which path to correct: ' + r.stderr)
  assert.ok(!fs.existsSync(missing),
    'a refused --root must not be brought into existence: ' + missing)
})

test('replay-root-3: replay.md\'s setup gate instructs the session to run setupCommand inside {dir} WITHOUT relocating its own shell, and Rules carries the standing root invariant naming --root as the escape hatch — the doctrine half of the 2026-08-27 fix', () => {
  const src = read('spec/commands/replay.md')

  const stepMatch = src.match(/2\. \*\*Setup gate \(D4\):\*\*[\s\S]*?(?=\n3\. )/)
  assert.ok(stepMatch, 'Phase 1 step 2 (the setup gate) must still be locatable — the fix lives inside it')
  const step = stepMatch[0]
  assert.match(step, /without relocating the session/i,
    'the setup gate must say in so many words that the session is not relocated — "run it inside {dir}" alone ' +
    'is what a session reasonably executes as a bare `cd`, and every other step in this file names its target ' +
    'explicitly instead (git -C {dir}, --dir {dir}): ' + JSON.stringify(step))
  assert.match(step, /subshell/i,
    'the gate must name the concrete non-relocating mechanism, not just forbid the outcome — an instruction ' +
    'that says what not to do without saying what to do instead gets improvised past: ' + JSON.stringify(step))
  assert.match(step, /\bcd\b/,
    'the gate must name the bare `cd` it is ruling out — the incident was a session doing exactly that in ' +
    'good faith against the old wording: ' + JSON.stringify(step))

  const ruleMatch = src.match(/- \*\*The session never leaves the main root\.\*\*[\s\S]*?(?=\n- )/)
  assert.ok(ruleMatch,
    'Rules must carry the standing invariant as its own bullet — folded into step 2 alone it binds one step, ' +
    'while the trap applies to every cwd-defaulting harness mode in every phase')
  const rule = ruleMatch[0]
  assert.match(rule, /--root/,
    'the invariant must name --root as the escape hatch for a caller that cannot honour it — an invariant with ' +
    'no stated remedy is advice: ' + JSON.stringify(rule))
  assert.match(rule, /teardown/i,
    'the invariant must state the consequence (the row is lost at teardown), not just the rule — the grounding ' +
    'is what keeps it from being dropped at the next edit: ' + JSON.stringify(rule))
})
