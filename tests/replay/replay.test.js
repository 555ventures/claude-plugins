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

const SCRIPT = 'scripts/replay.js'

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

function initRepoWithSpecs(specs) {
  const root = fs.realpathSync(tmpdir('replay-select'))
  gitRepo(root)
  const commits = {}
  for (const s of specs) {
    const full = path.join(root, s.relPath)
    fs.mkdirSync(path.dirname(full), { recursive: true })
    fs.writeFileSync(full, s.content)
    execFileSync('git', ['-C', root, 'add', '-A'])
    execFileSync('git', ['-C', root, 'commit', '-q', '-m', 'add ' + s.relPath])
    commits[s.relPath] = execFileSync('git', ['-C', root, 'log', '-1', '--format=%H', '--', s.relPath],
      { encoding: 'utf8' }).trim()
  }
  return { root, commits }
}

function writeWorkflowReturn(dir, name, survivors) {
  const p = path.join(dir, name)
  fs.writeFileSync(p, JSON.stringify({ verdict: survivors.length ? 'FINDINGS' : 'CLEAN', survivors, killed: 0 }))
  return p
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

test('AC-20260819-02-2: --select prefers a critical-tier CLEAN row over a later standard-tier one within the window, and ties resolve to the latest row', () => {
  const { root, commits } = initRepoWithSpecs([
    { relPath: 'specs/a.md', content: '# a\n' },
    { relPath: 'specs/b.md', content: '# b\n' },
  ])
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
  assert.match(r.stdout, new RegExp('commit=' + commits['specs/a.md']),
    'D3: commit must be the exact close commit for the SELECTED spec\'s path (`git log -1 --format=%H -- ' +
    '<path>`), never HEAD or the other spec\'s commit — a wrong commit means --setup worktrees the wrong tree: ' +
    r.stdout)

  const { root: root2 } = initRepoWithSpecs([
    { relPath: 'specs/c.md', content: '# c\n' },
    { relPath: 'specs/d.md', content: '# d\n' },
  ])
  writeLedger(root2, [
    { ts: '2026-08-10T00:00:00Z', stage: 'review', spec: 'specs/c.md', runId: 'rv_cccccccccccc', verdict: 'CLEAN', tier: 'standard' },
    { ts: '2026-08-11T00:00:00Z', stage: 'review', spec: 'specs/d.md', runId: 'rv_dddddddddddd', verdict: 'CLEAN', tier: 'standard' },
  ])
  const r2 = runNode(SCRIPT, ['--select'], { cwd: root2 })
  assert.strictEqual(r2.status, 0, 'D3: a same-tier tie must still resolve and succeed: ' + r2.stderr)
  assert.match(r2.stdout, /spec=specs\/d\.md/,
    'D3: no critical row exists in this window, so the tie between two standard rows must resolve to the ' +
    'LATEST one — resolving to the earliest would replay the same stale spec forever: ' + r2.stdout)
})

test('AC-20260819-02-3: --setup refuses a --dir inside the repo with exit 3 and creates nothing, and builds a marker-carrying detached worktree at an outside --dir', () => {
  const root = fs.realpathSync(tmpdir('replay-setup'))
  gitRepo(root)
  const sha = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()

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
  assert.ok(fs.existsSync(path.join(outsideDir, '.replay-worktree')),
    'D4: the created worktree must carry the .replay-worktree marker file — --teardown\'s refusal-without-' +
    'marker guard depends on this file existing: ' + outsideDir)
  const wtSha = execFileSync('git', ['-C', outsideDir, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
  assert.strictEqual(wtSha, sha,
    'D4: the worktree must be checked out detached at exactly --commit — a wrong sha means the mutation ' +
    'would land on the wrong tree entirely: ' + wtSha)
})

test('AC-20260819-02-4: --apply commits the patch on the worktree\'s detached HEAD so `git diff <base>..HEAD` contains it, leaving the working tree clean', () => {
  const root = fs.realpathSync(tmpdir('replay-apply-repo'))
  gitRepo(root)
  fs.mkdirSync(path.join(root, 'lib'), { recursive: true })
  fs.writeFileSync(path.join(root, 'lib/x.js'), 'a\nb\nc\n')
  execFileSync('git', ['-C', root, 'add', '-A'])
  execFileSync('git', ['-C', root, 'commit', '-q', '-m', 'add lib/x.js'])
  const baseSha = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()

  const wt = path.join(fs.realpathSync(tmpdir('replay-apply-wt')), 'wt')
  execFileSync('git', ['-C', root, 'worktree', 'add', '--detach', wt, baseSha])

  fs.writeFileSync(path.join(wt, 'lib/x.js'), 'a\nB\nc\n')
  const patch = execFileSync('git', ['-C', wt, 'diff'], { encoding: 'utf8' })
  execFileSync('git', ['-C', wt, 'checkout', '--', 'lib/x.js']) // back to clean — --apply must apply it fresh

  const patchFile = path.join(path.dirname(wt), 'mutation.patch')
  fs.writeFileSync(patchFile, patch)

  const r = runNode(SCRIPT, ['--apply', '--dir', wt, '--patch', patchFile, '--class', 'self-consistent-polarity'])
  assert.strictEqual(r.status, 0, 'D5: --apply on a clean detached worktree with a valid patch must succeed: ' + r.stderr)

  const diff = execFileSync('git', ['-C', wt, 'diff', baseSha + '..HEAD'], { encoding: 'utf8' })
  assert.match(diff, /\+B/,
    'D5: the mutation must be COMMITTED on the worktree\'s detached HEAD so `git diff <base>..HEAD` contains ' +
    'its hunks — an uncommitted mutation is invisible to review-legs.js and the reviewer, both of which read ' +
    'base..HEAD: ' + diff)

  const status = execFileSync('git', ['-C', wt, 'status', '--porcelain'], { encoding: 'utf8' })
  assert.strictEqual(status.trim(), '',
    'D5: the worktree must be clean after --apply — leftover uncommitted residue means the mutation is only ' +
    'half-applied: ' + JSON.stringify(status))

  const msg = execFileSync('git', ['-C', wt, 'log', '-1', '--format=%s'], { encoding: 'utf8' }).trim()
  assert.match(msg, /^replay: self-consistent-polarity/,
    'D5: the throwaway commit message must be exactly "replay: <class>" — without it a worktree inspected ' +
    'mid-run carries no legible provenance for the mutation it holds: ' + msg)
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

test('AC-20260819-02-8: --teardown refuses a --dir with no .replay-worktree marker with exit 3 and deletes nothing, and removes a --setup-created worktree cleanly', () => {
  const root = fs.realpathSync(tmpdir('replay-teardown-repo'))
  gitRepo(root)
  const sha = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()

  const plainDir = path.join(fs.realpathSync(tmpdir('replay-teardown-plain')), 'plain')
  fs.mkdirSync(plainDir, { recursive: true })
  const refuse = runNode(SCRIPT, ['--teardown', '--dir', plainDir], { cwd: root })
  assert.strictEqual(refuse.status, 3,
    'D4: a --dir with no .replay-worktree marker must be refused with exit 3 — the marker guard means ' +
    'teardown can only ever delete a directory THIS harness created: ' + refuse.stderr)
  assert.ok(fs.existsSync(plainDir),
    'D4: a refused teardown must delete nothing — a marker-less directory surviving is the entire point of ' +
    'the guard: ' + plainDir)

  const setupDir = path.join(fs.realpathSync(tmpdir('replay-teardown-setup')), 'wt')
  const setup = runNode(SCRIPT, ['--setup', '--commit', sha, '--dir', setupDir], { cwd: root })
  assert.strictEqual(setup.status, 0, 'fixture setup: --setup must succeed to produce a teardown-eligible worktree: ' + setup.stderr)

  const teardown = runNode(SCRIPT, ['--teardown', '--dir', setupDir], { cwd: root })
  assert.strictEqual(teardown.status, 0,
    'D4: a --setup-created --dir carrying the marker must be removed cleanly: ' + teardown.stderr)
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
