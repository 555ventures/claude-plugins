'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const { tmpdir, runNode, gitRepo } = require('../helpers')

// specs/20260904/01-commit-time-escape-coverage.md — commit mode: AC-20260904-01-3, -4, -5, -7.
// spec/scripts/commit-coverage.js does not exist yet (TDD red) — every runNode call below fails
// (non-zero exit or unparseable stdout) until D1-D5 ship it.

const SCRIPT = 'scripts/commit-coverage.js'

function writeSpec(dir, relPath, filePlanPaths) {
  const abs = path.join(dir, relPath)
  fs.mkdirSync(path.dirname(abs), { recursive: true })
  const rows = filePlanPaths.map(p => `| ${p} | MODIFY | src | . |`).join('\n')
  fs.writeFileSync(abs, '---\ndate: 2026-08-01\n---\n\n# spec\n\n## File Plan\n\n' +
    '| Path | Action | Layer | Summary |\n|---|---|---|---|\n' + rows + '\n')
}

function appendLedger(dir, rows) {
  const claudeDir = path.join(dir, '.claude')
  fs.mkdirSync(claudeDir, { recursive: true })
  fs.appendFileSync(path.join(claudeDir, 'spec-runs.jsonl'),
    rows.map(r => JSON.stringify(r)).join('\n') + '\n')
}

function commitAt(dir, relPath, content, isoDate, subject) {
  const abs = path.join(dir, relPath)
  fs.mkdirSync(path.dirname(abs), { recursive: true })
  fs.writeFileSync(abs, content)
  execFileSync('git', ['-C', dir, 'add', '-A'], { encoding: 'utf8' })
  execFileSync('git', ['-C', dir, 'commit', '-q', '-m', subject], {
    encoding: 'utf8',
    env: { ...process.env, GIT_AUTHOR_DATE: isoDate, GIT_COMMITTER_DATE: isoDate },
  })
  return execFileSync('git', ['-C', dir, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
}

// Builds the AC-20260904-01-4 fixture: four specs and their review rows are committed FIRST
// in a separate, non-fix `chore: specs` commit at a committer date between the 01-a/02-c/04-g
// reviews and the 03-b review, so the fix commit below touches exactly the four src files a
// `git show --name-only` would list — never the specs/ledger fixture files themselves (a fix
// commit whose `git add -A` folded them in would inflate AC-20260904-01-4's `files` count from
// 4 to 9). Returns the fix commit's sha and the repo dir.
function buildAc4Repo() {
  const dir = tmpdir('commit-coverage-ac4')
  gitRepo(dir, { empty: true })
  writeSpec(dir, 'specs/20260801/01-a.md', ['src/a.js'])
  writeSpec(dir, 'specs/20260801/02-c.md', ['src/a.js'])
  writeSpec(dir, 'specs/20260801/03-b.md', ['src/b.js'])
  writeSpec(dir, 'specs/20260801/04-g.md', ['src/gen/*.js'])
  appendLedger(dir, [
    { ts: '2026-08-10', stage: 'review', spec: 'specs/20260801/01-a.md', runId: 'rv_a1', verdict: 'SURVIVORS' },
    { ts: '2026-08-20T00:00:00Z', stage: 'review', spec: 'specs/20260801/01-a.md', runId: 'rv_a2', verdict: 'CLEAN' },
    { ts: '2026-08-21T00:00:00Z', stage: 'review', spec: 'specs/20260801/02-c.md', runId: 'rv_c1', verdict: 'CLEAN' },
    { ts: '2026-08-25T00:00:00Z', stage: 'review', spec: 'specs/20260801/03-b.md' },
    { ts: '2026-08-20T00:00:00Z', stage: 'review', spec: 'specs/20260801/04-g.md', runId: 'rv_g1', verdict: 'CLEAN' },
  ])
  execFileSync('git', ['-C', dir, 'add', '-A'], { encoding: 'utf8' })
  execFileSync('git', ['-C', dir, 'commit', '-q', '-m', 'chore: specs'], {
    encoding: 'utf8',
    env: { ...process.env, GIT_AUTHOR_DATE: '2026-08-01T00:00:00Z', GIT_COMMITTER_DATE: '2026-08-01T00:00:00Z' },
  })
  fs.mkdirSync(path.join(dir, 'src/gen'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'src/a.js'), 'a\n')
  fs.writeFileSync(path.join(dir, 'src/b.js'), 'b\n')
  fs.writeFileSync(path.join(dir, 'src/gen/x.js'), 'g\n')
  fs.writeFileSync(path.join(dir, 'src/c.js'), 'c\n')
  execFileSync('git', ['-C', dir, 'add', '-A'], { encoding: 'utf8' })
  execFileSync('git', ['-C', dir, 'commit', '-q', '-m', 'fix(x): y'], {
    encoding: 'utf8',
    env: { ...process.env, GIT_AUTHOR_DATE: '2026-08-22T00:00:00Z', GIT_COMMITTER_DATE: '2026-08-22T00:00:00Z' },
  })
  const sha = execFileSync('git', ['-C', dir, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
  return { dir, sha }
}

test('AC-20260904-01-3: commit mode derives fixShaped from the D2 conventional fix/hotfix type-token regex, never a bare "fix" substring elsewhere in the subject', () => {
  const dir = tmpdir('commit-coverage-fixshaped')
  gitRepo(dir, { empty: true })
  const cases = [
    ['fix(nango): unwrap the listing', true],
    ['hotfix: x', true],
    ['fix!: x', true],
    ['FIX(x): y', true],
    ['review(20260903/02): CLEAN — two defects fixed', false],
    ['Fix login crash', false],
    ['bugfix: x', false],
  ]
  let i = 0
  for (const [subject, expected] of cases) {
    const sha = commitAt(dir, 'f' + (i++) + '.txt', 'x\n', '2026-08-20T00:00:00Z', subject)
    const r = runNode(SCRIPT, ['--commit', sha, '--root', dir, '--json'])
    assert.strictEqual(r.status, 0, 'D5: --commit --json against a valid sha in a ledger-less repo must exit 0: ' + r.stderr)
    const out = JSON.parse(r.stdout)
    assert.strictEqual(out.fixShaped, expected,
      'D2: subject ' + JSON.stringify(subject) + ' must report fixShaped:' + expected +
      ' — the regex matches only the conventional fix/hotfix type token, never a "fix" substring elsewhere in the subject')
  }
})

test('AC-20260904-01-4: commit mode joins File Plan membership to the latest preceding review row per spec, ranks landed specs by review epoch descending then spec path ascending, and buckets a file with no reviewed landing spec as inFlight', () => {
  const { dir, sha } = buildAc4Repo()
  const r = runNode(SCRIPT, ['--commit', sha, '--root', dir, '--json'])
  assert.strictEqual(r.status, 0, 'D5: a valid --commit sha in a repo with a ledger must exit 0: ' + r.stderr)
  const out = JSON.parse(r.stdout)
  assert.deepStrictEqual(out.files, ['src/a.js', 'src/b.js', 'src/c.js', 'src/gen/x.js'],
    'D5: files must be exactly the four touched src paths in git show --name-only\'s own (tree-sorted) order — a different set or order means the file list was not derived from git, or the specs/ledger fixture files leaked into this commit')
  assert.deepStrictEqual(out.landed, [
    {
      file: 'src/a.js',
      specs: [
        { spec: 'specs/20260801/02-c.md', reviewTs: '2026-08-21T00:00:00Z', reviewRunId: 'rv_c1', verdict: 'CLEAN' },
        { spec: 'specs/20260801/01-a.md', reviewTs: '2026-08-20T00:00:00Z', reviewRunId: 'rv_a2', verdict: 'CLEAN' },
      ],
    },
    {
      file: 'src/gen/x.js',
      specs: [
        { spec: 'specs/20260801/04-g.md', reviewTs: '2026-08-20T00:00:00Z', reviewRunId: 'rv_g1', verdict: 'CLEAN' },
      ],
    },
  ], 'D3/D5: src/a.js must land under BOTH reviewed specs sorted by review epoch descending (02-c\'s 08-21 review before 01-a\'s 08-20 one, taking each spec\'s LATEST qualifying row), and src/gen/x.js must land under the glob-matched 04-g spec — a wrong join means the offer would name the wrong spec or miss an escape candidate entirely')
  assert.deepStrictEqual(out.inFlight, [{ file: 'src/b.js', specs: ['specs/20260801/03-b.md'] }],
    'D3: src/b.js is listed only by a spec whose sole review row (08-25) comes AFTER this commit\'s committer date (08-22) — it must be inFlight, never landed, or the offer would fire on a spec still under review repairing its own work')
  assert.strictEqual(out.offer, true, 'D5: offer = fixShaped && landed.length > 0 — this fix-typed commit landed 2 files, so offer must be true')

  const featSha = commitAt(dir, 'src/feat-marker.js', 'm\n', '2026-08-23T00:00:00Z', 'feat(x): y')
  const r2 = runNode(SCRIPT, ['--commit', featSha, '--root', dir, '--json'])
  assert.strictEqual(r2.status, 0, r2.stderr)
  const out2 = JSON.parse(r2.stdout)
  assert.strictEqual(out2.fixShaped, false, 'D2: a feat-typed subject must never report fixShaped:true regardless of what the commit touches')
  assert.strictEqual(out2.offer, false, 'D5: offer must be false when fixShaped is false, even though the commit only touches an unrelated marker file here')
})

test('AC-20260904-01-5: commit mode exits 0 with a derived no-ledger answer, and exits 2 with a discoverable remedy on a bad --root, an unknown sha, or an unknown flag', () => {
  const noLedgerDir = tmpdir('commit-coverage-noledger')
  gitRepo(noLedgerDir, { empty: true })
  const sha = commitAt(noLedgerDir, 'x.txt', 'x\n', '2026-08-20T00:00:00Z', 'fix: x')
  const r1 = runNode(SCRIPT, ['--commit', sha, '--root', noLedgerDir, '--json'])
  assert.strictEqual(r1.status, 0, 'D5: absence of a ledger is a derived answer, not an error — a non-zero exit here means the script treats a missing ledger as a crash instead')
  const out1 = JSON.parse(r1.stdout)
  assert.strictEqual(out1.ledger, false, 'D5: no .claude/spec-runs*.jsonl anywhere under root must report ledger:false')
  assert.deepStrictEqual(out1.landed, [], 'D5: with no ledger, nothing can be landed — landed must be []')
  assert.strictEqual(out1.offer, false, 'D5: with no ledger, offer must be false regardless of fixShaped')

  const notARepo = tmpdir('commit-coverage-notrepo')
  const r2 = runNode(SCRIPT, ['--commit', 'HEAD', '--root', notARepo, '--json'])
  assert.strictEqual(r2.status, 2, 'D5: a --root that is not a git repository must exit 2, never crash with a raw git error or silently succeed')
  assert.match(r2.stderr, /--root/, 'the remedy on stderr must name --root so the mistake is discoverable: ' + r2.stderr)

  const gitDir = tmpdir('commit-coverage-badsha')
  gitRepo(gitDir, { empty: true })
  commitAt(gitDir, 'y.txt', 'y\n', '2026-08-20T00:00:00Z', 'fix: y')
  const r3 = runNode(SCRIPT, ['--commit', 'deadbeef', '--root', gitDir, '--json'])
  assert.strictEqual(r3.status, 2, 'D5: an unknown --commit sha must exit 2, not print a false derived answer')
  assert.match(r3.stderr, /deadbeef/, 'the remedy on stderr must name the unresolved sha so the mistake is discoverable: ' + r3.stderr)

  const r4 = runNode(SCRIPT, ['--commit', 'HEAD', '--root', gitDir, '--bogus'])
  assert.strictEqual(r4.status, 2, 'D5/Worker Rules: an unknown flag must exit 2 with the usage line, never be silently ignored')
  assert.match(r4.stderr, /Usage/i, 'stderr must carry the usage line on an unknown flag: ' + r4.stderr)
  assert.strictEqual(r4.stdout, '', 'nothing must be printed to stdout on a usage error — a partial or garbage payload would corrupt a --json consumer')
})

test('AC-20260904-01-7: commit mode\'s human render names fix-shaped/ledger/file counts, the offer line with landed-file and distinct-spec counts, one arrow line per landed file, the in-flight count, and never emits parseable JSON', () => {
  const { dir, sha } = buildAc4Repo()
  const r = runNode(SCRIPT, ['--commit', sha, '--root', dir])
  assert.strictEqual(r.status, 0, 'D5: the human render path must also exit 0 on a valid commit: ' + r.stderr)
  assert.throws(() => JSON.parse(r.stdout), 'the human render must never itself parse as JSON — --json is the sole machine format')
  assert.match(r.stdout, new RegExp('^commit ' + sha.slice(0, 12) + ' — fix\\(x\\): y$', 'm'),
    'the first line must name the 12-hex short sha and the commit subject verbatim: ' + r.stdout)
  assert.match(r.stdout, /^ {2}fix-shaped: yes · ledger: yes · files: 4$/m,
    'the summary line must report fix-shaped, ledger, and file-count exactly as derived: ' + r.stdout)
  assert.match(r.stdout, /^ {2}offer: yes — 2 files landed by reviewed specs \(3 distinct\)$/m,
    'the offer line must count 2 landed files across 3 distinct landing specs (02-c, 01-a, 04-g): ' + r.stdout)
  assert.match(r.stdout, /^ {4}src\/a\.js ← specs\/20260801\/02-c\.md \(review rv_c1 CLEAN 2026-08-21T00:00:00Z\); specs\/20260801\/01-a\.md \(review rv_a2 CLEAN 2026-08-20T00:00:00Z\)$/m,
    'the src/a.js arrow line must join its specs with "; " in review-epoch-descending order, each naming its runId, verdict, and reviewTs: ' + r.stdout)
  assert.match(r.stdout, /^ {2}in-flight: 1 files listed by specs not yet reviewed$/m,
    'the in-flight summary line must count the 1 file (src/b.js) whose only listing spec has no preceding review row: ' + r.stdout)

  const noLedgerDir = tmpdir('commit-coverage-render-noledger')
  gitRepo(noLedgerDir, { empty: true })
  const noLedgerSha = commitAt(noLedgerDir, 'z.txt', 'z\n', '2026-08-20T00:00:00Z', 'fix: z')
  const r2 = runNode(SCRIPT, ['--commit', noLedgerSha, '--root', noLedgerDir])
  assert.strictEqual(r2.status, 0, r2.stderr)
  assert.match(r2.stdout, /^ {2}offer: no — no ledger$/m,
    'a ledger-less repo\'s render must print the "no ledger" reason on the offer line, first in D5\'s reason precedence order: ' + r2.stdout)
})
