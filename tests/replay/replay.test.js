'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
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

const SCRIPT = 'scripts/replay.js'

// D4 (fix iteration 2): the marker lives at `<git -C <dir> rev-parse --git-dir>/replay-worktree` —
// the worktree's PRIVATE git dir, never its working tree. Both AC-3 and AC-8 resolve the marker's
// real location through this helper rather than guessing a path, so a future relocation of the
// marker breaks this helper in one place instead of desyncing every test that hardcodes it.
function markerPath(dir) {
  const gitDirRaw = execFileSync('git', ['-C', dir, 'rev-parse', '--git-dir'], { encoding: 'utf8' }).trim()
  const gitDirAbs = path.isAbsolute(gitDirRaw) ? gitDirRaw : path.resolve(dir, gitDirRaw)
  return path.join(gitDirAbs, 'replay-worktree')
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

test('AC-20260819-02-2: --select prints all five fields spec/reviewRunId/commit/parent/diffBase, preferring a critical-tier CLEAN row over a later standard-tier one, and ties resolve to the latest row', () => {
  const root = fs.realpathSync(tmpdir('replay-select'))
  gitRepo(root)
  const a = commitSpecFlow(root, 'specs/a.md',
    '---\ndiff_base: aaaa000000000000000000000000000000aaaa\n---\n# a\n',
    '---\ndiff_base: aaaa000000000000000000000000000000aaaa\nstatus: done\n---\n# a\n')
  const b = commitSpecFlow(root, 'specs/b.md',
    '---\ndiff_base: bbbb000000000000000000000000000000bbbb\n---\n# b\n',
    '---\ndiff_base: bbbb000000000000000000000000000000bbbb\nstatus: done\n---\n# b\n')
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
  assert.match(r.stdout, /diffBase=aaaa000000000000000000000000000000aaaa/,
    'F3 regression pin: diffBase must be read from the selected spec\'s frontmatter AT THE PARENT commit — ' +
    'reading it at the close commit (or hardcoding it) would drift from the base review.md itself diffed ' +
    'against: ' + r.stdout)

  const root2 = fs.realpathSync(tmpdir('replay-select-tie'))
  gitRepo(root2)
  const d = commitSpecFlow(root2, 'specs/d.md',
    '---\ndiff_base: dddd000000000000000000000000000000dddd\n---\n# d\n',
    '---\ndiff_base: dddd000000000000000000000000000000dddd\nstatus: done\n---\n# d\n')
  commitSpecFlow(root2, 'specs/c.md',
    '---\ndiff_base: cccc000000000000000000000000000000cccc\n---\n# c\n',
    '---\ndiff_base: cccc000000000000000000000000000000cccc\nstatus: done\n---\n# c\n')
  writeLedger(root2, [
    { ts: '2026-08-10T00:00:00Z', stage: 'review', spec: 'specs/d.md', runId: 'rv_dddddddddddd', verdict: 'CLEAN', tier: 'standard' },
    { ts: '2026-08-11T00:00:00Z', stage: 'review', spec: 'specs/c.md', runId: 'rv_cccccccccccc', verdict: 'CLEAN', tier: 'standard' },
  ])
  const r2 = runNode(SCRIPT, ['--select'], { cwd: root2 })
  assert.strictEqual(r2.status, 0, 'D3: a same-tier tie must still resolve and succeed: ' + r2.stderr)
  assert.match(r2.stdout, /spec=specs\/c\.md/,
    'D3: no critical row exists in this window, so the tie between two standard rows must resolve to the ' +
    'LATEST one — resolving to the earliest would replay the same stale spec forever: ' + r2.stdout)

  const root3 = fs.realpathSync(tmpdir('replay-select-buildbase'))
  gitRepo(root3)
  const e = commitSpecFlow(root3, 'specs/e.md',
    '---\nbuild_base: eeee111111111111111111111111111111eeee\ndiff_base: eeee222222222222222222222222222222eeee\n---\n# e\n',
    '---\nbuild_base: eeee111111111111111111111111111111eeee\ndiff_base: eeee222222222222222222222222222222eeee\nstatus: done\n---\n# e\n')
  writeLedger(root3, [
    { ts: '2026-08-10T00:00:00Z', stage: 'review', spec: 'specs/e.md', runId: 'rv_eeeeeeeeeeee', verdict: 'CLEAN' },
  ])
  const r3 = runNode(SCRIPT, ['--select'], { cwd: root3 })
  assert.strictEqual(r3.status, 0, 'D3: a spec carrying both build_base and diff_base must still select cleanly: ' + r3.stderr)
  assert.match(r3.stdout, /diffBase=eeee111111111111111111111111111111eeee/,
    'D3: build_base must win over diff_base when both are present in the parent\'s frontmatter — the ' +
    'Decision states build_base first, diff_base only as the fallback: ' + r3.stdout)
  assert.ok(!r3.stdout.includes('eeee222222222222222222222222222222eeee'),
    'D3: the diff_base value must NOT leak into the printed diffBase when build_base is present and ' +
    'non-empty — printing both/either nondeterministically would make --setup stand up the wrong base: ' +
    r3.stdout)

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
    'D3: a selected spec carrying NEITHER build_base nor diff_base at the close commit\'s parent must exit ' +
    '4 — printing a blank or fabricated diffBase would hand --setup a base nobody can verify: ' + r4.stdout)
  assert.strictEqual(r4.stdout.trim(), '',
    'D3: an unresolvable diffBase is a git-operation failure, not a partial selection — nothing must print ' +
    'on stdout: ' + JSON.stringify(r4.stdout))
})

test('AC-20260819-02-3: --setup refuses a --dir inside the repo with exit 3 and creates nothing, and builds a marker-carrying detached worktree at an outside --dir that leaves the host repo byte-identical', () => {
  const root = fs.realpathSync(tmpdir('replay-setup'))
  gitRepo(root)
  const sha = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()

  // D4 host-unmodified pin (fix iteration 2, 2026-08-19): snapshot the HOST repo's shared
  // .git/info/exclude (absent is a valid snapshot value — handled below) and `git status
  // --porcelain` BEFORE any --setup call. Iteration 1's fix wrote its exclusion line into exactly
  // this file, resolved from INSIDE the worktree via `git rev-parse --git-path info/exclude` —
  // which is not per-worktree and lands in the shared common git dir — so this snapshot is taken
  // before the refuse case too, not just the successful one.
  const excludePath = path.join(root, '.git/info/exclude')
  const excludeBefore = fs.existsSync(excludePath) ? fs.readFileSync(excludePath, 'utf8') : null
  const statusBefore = execFileSync('git', ['-C', root, 'status', '--porcelain'], { encoding: 'utf8' })

  const insideDir = path.join(root, 'x')
  const refuse = runNode(SCRIPT, ['--setup', '--commit', sha, '--dir', insideDir], { cwd: root })
  assert.strictEqual(refuse.status, 3,
    'D4: a --dir inside the repo root must be refused with exit 3 — this session\'s own spike accidentally ' +
    'created a worktree inside the repo, which is exactly the mistake this refusal pins: ' + refuse.stderr)
  assert.ok(!fs.existsSync(insideDir),
    'D4: a refused --setup must create nothing at the inside dir — a partially-created worktree there would ' +
    'pollute the main repo\'s own working tree: ' + insideDir)

  const outsideDir = path.join(fs.realpathSync(tmpdir('replay-setup-outside')), 'wt')
  const create = runNode(SCRIPT, ['--setup', '--commit', sha, '--dir', outsideDir], { cwd: root })
  assert.strictEqual(create.status, 0, 'D4: an outside --dir must succeed and create the detached worktree: ' + create.stderr)

  const marker = markerPath(outsideDir)
  assert.ok(marker.split(path.sep).includes('worktrees'),
    'D4: the resolved marker path must live under the worktree\'s PRIVATE git dir (a `.../worktrees/<name>/...` ' +
    'path segment), not the shared common git dir and not the working tree — this is what makes the marker ' +
    'get deleted for free by `git worktree remove`: ' + marker)
  assert.ok(fs.existsSync(marker),
    'D4: the created worktree must carry the replay-worktree marker at its resolved PRIVATE git dir path ' +
    '(`git -C <dir> rev-parse --git-dir` + "replay-worktree") — --teardown\'s refusal-without-marker guard ' +
    'resolves this exact same path to decide whether to refuse: ' + marker)
  assert.ok(!fs.existsSync(path.join(outsideDir, 'replay-worktree')) && !fs.existsSync(path.join(outsideDir, '.replay-worktree')),
    'D4: nothing named replay-worktree (with or without a leading dot) may exist in the worktree\'s own ' +
    'WORKING TREE — a marker there is exactly what could be swept into `git add -A` by --apply, which is the ' +
    'defect class this marker relocation exists to make structurally impossible: ' + outsideDir)

  const wtSha = execFileSync('git', ['-C', outsideDir, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
  assert.strictEqual(wtSha, sha,
    'D4: the worktree must be checked out detached at exactly --commit — a wrong sha means the mutation ' +
    'would land on the wrong tree entirely: ' + wtSha)

  // D4 host-unmodified pin, continued: this is the regression pin for the fix-iteration-2 defect —
  // a full green suite shipped it twice because no test here ever looked at the host repo's git
  // config after --setup. Must fail against iteration 1's info/exclude-based exclusion approach.
  const excludeAfter = fs.existsSync(excludePath) ? fs.readFileSync(excludePath, 'utf8') : null
  assert.strictEqual(excludeAfter, excludeBefore,
    'D4 host-unmodified pin (fix iteration 2): the HOST repo\'s .git/info/exclude must be BYTE-IDENTICAL ' +
    'before and after --setup — iteration 1 wrote a `.replay-worktree` exclusion line into exactly this file ' +
    'via `git rev-parse --git-path info/exclude` run inside the worktree, which resolves to the MAIN repo\'s ' +
    'shared info/exclude (not a per-worktree file) and survives teardown, breaking this spec\'s own "the main ' +
    'tree is never touched" guarantee: ' + JSON.stringify({ before: excludeBefore, after: excludeAfter }))
  const statusAfter = execFileSync('git', ['-C', root, 'status', '--porcelain'], { encoding: 'utf8' })
  assert.strictEqual(statusAfter, statusBefore,
    'D4 host-unmodified pin (fix iteration 2): `git status --porcelain` in the HOST repo\'s main tree must be ' +
    'unchanged before and after --setup — a --setup call must leave no trace whatsoever visible in the tree ' +
    'the maintainer actually works in: ' + JSON.stringify({ before: statusBefore, after: statusAfter }))
})

test('AC-20260819-02-4: --setup composed with --apply commits the mutation on base..HEAD without leaking the .replay-worktree marker into the diff or git status, subject defaulting to "build: follow-up" or landing verbatim', () => {
  const { root, baseSha, patchFile } = initApplyFixture('replay-apply')

  // F1 regression pin: the worktree comes from --setup itself (marker excluded via
  // info/exclude before it's ever written) — the OLD version of this test stood the worktree up
  // with a raw `git worktree add`, so the marker never existed for --apply's `git add -A` to
  // leak, and the defect shipped through a fully green suite.
  const wtDefault = path.join(fs.realpathSync(tmpdir('replay-apply-wt-default')), 'wt')
  const setupDefault = runNode(SCRIPT, ['--setup', '--commit', baseSha, '--dir', wtDefault], { cwd: root })
  assert.strictEqual(setupDefault.status, 0,
    'fixture setup: --setup must succeed before --apply can be composed onto it: ' + setupDefault.stderr)

  const applyDefault = runNode(SCRIPT, ['--apply', '--dir', wtDefault, '--patch', patchFile, '--class', 'self-consistent-polarity'])
  assert.strictEqual(applyDefault.status, 0,
    'D5: --apply on a --setup-created worktree with a valid patch must succeed: ' + applyDefault.stderr)

  const nameStatus = execFileSync('git', ['-C', wtDefault, 'diff', '--name-status', baseSha + '..HEAD'], { encoding: 'utf8' })
  assert.match(nameStatus, /lib\/x\.js/,
    'D5: base..HEAD must contain the mutated file — this is the diff surface review-legs.js and the ' +
    'reviewer both actually read: ' + nameStatus)
  assert.ok(!nameStatus.includes('.replay-worktree'),
    'F1 regression pin (2026-08-19 review): .replay-worktree must NEVER appear in `git diff base..HEAD ' +
    '--name-status` — this is the exact defect that shipped undetected because the prior test built its ' +
    'worktree with a raw `git worktree add` instead of going through --setup, so there was no marker for ' +
    '--apply\'s `git add -A` to sweep in, and the leak was invisible to a green suite: ' + nameStatus)

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
  const applyExplicit = runNode(SCRIPT, ['--apply', '--dir', wtExplicit, '--patch', patchFile,
    '--class', 'self-consistent-polarity', '--subject', subjectText])
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

  const replaySubject = runNode(SCRIPT, ['--apply', '--dir', wt, '--patch', patchFile,
    '--class', 'self-consistent-polarity', '--subject', 'replay mutation test'], { cwd: root })
  assert.strictEqual(replaySubject.status, 2,
    'F2 regression pin (2026-08-19 review): a --subject announcing the harness must be refused ' +
    'with exit 2 BEFORE any git command runs — this is the exact leak that let a dispatched reviewer read ' +
    '"this is a test" straight out of a sanctioned `git log`: ' + JSON.stringify({ status: replaySubject.status, stdout: replaySubject.stdout }))
  assert.strictEqual(replaySubject.stdout.trim(), '',
    'D5: a refused --apply is a usage error, not a partial apply — nothing must print on stdout: ' +
    JSON.stringify(replaySubject.stdout))

  const classSubject = runNode(SCRIPT, ['--apply', '--dir', wt, '--patch', patchFile,
    '--class', 'self-consistent-polarity', '--subject', 'build: fix self-consistent-polarity edge case'],
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
    '--class', 'self-consistent-polarity',
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

test('AC-20260819-02-5: --score prints caught for a finding within +/-5 lines of the mutation, ambiguous for a finding elsewhere, and missed for zero findings', () => {
  const dir = fs.realpathSync(tmpdir('replay-score'))

  const caughtWf = writeWorkflowReturn(dir, 'caught.json', [{ file: 'lib/x.js', line: 43 }])
  const caught = runNode(SCRIPT, ['--score', '--workflow', caughtWf, '--file', 'lib/x.js', '--line', '40'])
  assert.strictEqual(caught.status, 0, 'D7: --score must exit 0 on any parseable workflow return, caught included: ' + caught.stderr)
  assert.match(caught.stdout, /\bcaught\b/,
    'D7: a finding at the mutated file within +/-5 lines (43 vs 40) must score caught — the deterministic ' +
    'proxy exists so this exact case never needs a human: ' + caught.stdout)

  const ambigWf = writeWorkflowReturn(dir, 'ambiguous.json', [{ file: 'lib/y.js', line: 40 }])
  const ambiguous = runNode(SCRIPT, ['--score', '--workflow', ambigWf, '--file', 'lib/x.js', '--line', '40'])
  assert.strictEqual(ambiguous.status, 0, 'D7: ambiguous is still a parseable, successful score, exit 0: ' + ambiguous.stderr)
  assert.match(ambiguous.stdout, /\bambiguous\b/,
    'D7: findings exist but none at the mutated file/line — a naive scorer would misgrade this as missed; ' +
    'ambiguous routes it to the one judgment seam (a reviewer that names the defect from its call site) ' +
    'instead: ' + ambiguous.stdout)

  const missedWf = writeWorkflowReturn(dir, 'missed.json', [])
  const missed = runNode(SCRIPT, ['--score', '--workflow', missedWf, '--file', 'lib/x.js', '--line', '40'])
  assert.strictEqual(missed.status, 0, 'D7: missed is still exit 0 — --score always succeeds when the input parses: ' + missed.stderr)
  assert.match(missed.stdout, /\bmissed\b/,
    'D7: zero findings must score missed — this is the actual reviewer blind-spot signal the whole harness ' +
    'exists to measure, so it must be distinguishable from ambiguous and caught: ' + missed.stdout)

  // F4 regression pin (2026-08-19 review): the old code classified ANY parseable-but-unusable
  // reviewer return as `missed`, permanently deflating the catch-rate denominator with evidence
  // that was never actually produced. A crashed/malformed return must now be a usage error.
  const failedPath = path.join(dir, 'failed.json')
  fs.writeFileSync(failedPath, JSON.stringify({ verdict: 'REVIEWER_FAILED' }))
  const failed = runNode(SCRIPT, ['--score', '--workflow', failedPath, '--file', 'lib/x.js', '--line', '40'])
  assert.strictEqual(failed.status, 2,
    'F4 regression pin: a non-CLEAN verdict like REVIEWER_FAILED must exit 2, never be scored as missed — ' +
    'the caller must re-dispatch the reviewer and retry --score instead of recording a phantom miss: ' +
    JSON.stringify({ status: failed.status, stdout: failed.stdout }))
  assert.strictEqual(failed.stdout.trim(), '',
    'D7: a usage error is not a score — --score must print NOTHING on stdout when the return is unusable, ' +
    'so no downstream --record call can mistake this exit for a real outcome: ' + JSON.stringify(failed.stdout))

  const noSurvivorsPath = path.join(dir, 'no-survivors.json')
  fs.writeFileSync(noSurvivorsPath, JSON.stringify({ verdict: 'CLEAN' }))
  const noSurvivors = runNode(SCRIPT, ['--score', '--workflow', noSurvivorsPath, '--file', 'lib/x.js', '--line', '40'])
  assert.strictEqual(noSurvivors.status, 2,
    'F4 regression pin: a CLEAN verdict with a MISSING survivors array must still exit 2 — a return that ' +
    'merely looks parseable is not the same as a valid, scoreable reviewer return: ' +
    JSON.stringify({ status: noSurvivors.status, stdout: noSurvivors.stdout }))
  assert.strictEqual(noSurvivors.stdout.trim(), '',
    'D7: nothing must print on stdout for this malformed return either: ' + JSON.stringify(noSurvivors.stdout))

  const badSurvivorsPath = path.join(dir, 'bad-survivors.json')
  fs.writeFileSync(badSurvivorsPath, JSON.stringify({ verdict: 'CLEAN', survivors: 'not-an-array' }))
  const badSurvivors = runNode(SCRIPT, ['--score', '--workflow', badSurvivorsPath, '--file', 'lib/x.js', '--line', '40'])
  assert.strictEqual(badSurvivors.status, 2,
    'F4 regression pin: survivors must specifically be an ARRAY — a non-array value under a CLEAN verdict ' +
    'must exit 2 exactly like a missing one, never be coerced or iterated: ' +
    JSON.stringify({ status: badSurvivors.status, stdout: badSurvivors.stdout }))
  assert.strictEqual(badSurvivors.stdout.trim(), '',
    'D7: nothing must print on stdout for this malformed return either: ' + JSON.stringify(badSurvivors.stdout))
})

test('AC-20260819-02-6: --record appends one ledger row matching the Contracts shape with a fresh rp_ runId and writes the evidence artifact holding the patch verbatim', () => {
  const root = fs.realpathSync(tmpdir('replay-record'))
  const patchFile = path.join(root, 'mutation.patch')
  fs.writeFileSync(patchFile, '--- a/lib/x.js\n+++ b/lib/x.js\n@@ -1 +1 @@\n-a\n+B\n')
  const workflowFile = path.join(root, 'workflow.json')
  const workflowObj = { verdict: 'CLEAN', survivors: [], killed: 0 }
  fs.writeFileSync(workflowFile, JSON.stringify(workflowObj))

  const r = runNode(SCRIPT, ['--record',
    '--spec', 'specs/20260819/02-mutation-replay.md',
    '--review-run-id', 'rv_aaaaaaaaaaaa',
    '--class', 'silent-fallback',
    '--file', 'lib/x.js',
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
    ['class', 'file', 'legs', 'outcome', 'reviewRunId', 'runId', 'spec', 'stage', 'tokens', 'ts'],
    'D8: the row\'s keys must be EXACTLY the Contracts set, no more, no less — an extra or missing key ' +
    'breaks --stats\' aggregation and any script that reads this row: ' + JSON.stringify(row))
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

test('AC-20260819-02-6: --record with --outcome leg-caught writes reviewer: null in the evidence artifact since no reviewer was ever dispatched', () => {
  const root = fs.realpathSync(tmpdir('replay-record-legcaught'))
  const patchFile = path.join(root, 'mutation.patch')
  fs.writeFileSync(patchFile, '--- a/lib/y.js\n+++ b/lib/y.js\n@@ -1 +1 @@\n-a\n+B\n')

  const r = runNode(SCRIPT, ['--record',
    '--spec', 'specs/20260819/02-mutation-replay.md',
    '--review-run-id', 'rv_bbbbbbbbbbbb',
    '--class', 'boundary-shift',
    '--file', 'lib/y.js',
    '--legs', 'red:gate',
    '--outcome', 'leg-caught',
    '--patch', patchFile,
    '--tokens', '0',
  ], { cwd: root })
  assert.strictEqual(r.status, 0, 'D8: a leg-caught record (no --workflow, since no reviewer ran) must still succeed: ' + r.stderr)

  const row = JSON.parse(fs.readFileSync(path.join(root, '.claude/spec-runs.jsonl'), 'utf8').trim())
  const artifact = JSON.parse(fs.readFileSync(path.join(root, '.claude/spec-runs', row.runId + '.json'), 'utf8'))
  assert.strictEqual(artifact.reviewer, null,
    'D8: leg-caught means the reviewer was never dispatched — the artifact must record reviewer: null, ' +
    'never an omitted key or a stale value, or --stats/escape-style tooling would misread this row as ' +
    'reviewer-graded evidence it is not: ' + JSON.stringify(artifact.reviewer))
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

test('AC-20260819-02-8: --teardown refuses a --dir whose private git dir carries no replay-worktree marker with exit 3 and deletes nothing, and removes a --setup-created worktree cleanly', () => {
  const root = fs.realpathSync(tmpdir('replay-teardown-repo'))
  gitRepo(root)
  const sha = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()

  const plainDir = path.join(fs.realpathSync(tmpdir('replay-teardown-plain')), 'plain')
  fs.mkdirSync(plainDir, { recursive: true })
  const refuse = runNode(SCRIPT, ['--teardown', '--dir', plainDir], { cwd: root })
  assert.strictEqual(refuse.status, 3,
    'D4: a --dir that is not a linked worktree (so its private git dir can carry no replay-worktree marker) ' +
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
    'D4: this fixture must produce a worktree carrying the replay-worktree marker in its PRIVATE git dir ' +
    'BEFORE teardown runs, at the exact path --teardown itself resolves (`git -C <dir> rev-parse --git-dir` ' +
    '+ "replay-worktree") — otherwise this test is not actually exercising the marker guard it claims to: ' + marker)

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

test('AC-20260819-02-9: the shipped corpus file carries all 6 Contracts class ids, each as its own heading with a recipe section', () => {
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
      `authoring worker nothing to follow when /spec:replay picks this class: section began ` +
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
