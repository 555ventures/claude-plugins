'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const { tmpdir, runNode, gitRepo } = require('../helpers')

// specs/20260823/06-prose-debt-pruning.md D13: `.claude/agent-memory/` notes
// were disposed only when a spec's diff happened to touch the note FILE itself — the wrong
// subject. This build's own review caught a note falsified by the same diff that shipped it
// only because the diff happened to touch that note's own file; a note about the same defect
// living anywhere else would have ridden through undetected. memory-sweep.js surfaces a note
// for disposition when the diff touches what the note is ABOUT (diff-hit, D5/D6) or when the
// note has outlived 10 undisposed review closes (ttl-expired, D7, oldest-first, capped at 3
// per run). Neither mode feeds `verdict.js` (D13) — this sweep is a disposition-trigger
// widener, never a gate.

function writeNote (dir, agent, filename, body) {
  const noteDir = path.join(dir, '.claude/agent-memory', agent)
  fs.mkdirSync(noteDir, { recursive: true })
  const file = path.join(noteDir, filename)
  fs.writeFileSync(file, body)
  return path.relative(dir, file).split(path.sep).join('/')
}

// Commits the given repo-relative files with a fixed author/committer date, so
// `git log -1 --format=%cI` answers deterministically instead of racing the test's wall clock.
function commitAt (dir, iso, relFiles) {
  execFileSync('git', ['-C', dir, 'add', ...relFiles], { encoding: 'utf8' })
  execFileSync('git', ['-C', dir, 'commit', '-q', '-m', 'note commit'], {
    encoding: 'utf8',
    env: Object.assign({}, process.env, { GIT_AUTHOR_DATE: iso, GIT_COMMITTER_DATE: iso })
  })
}

function writeLedger (dir, rows) {
  const ledgerDir = path.join(dir, '.claude')
  fs.mkdirSync(ledgerDir, { recursive: true })
  const file = path.join(ledgerDir, 'spec-runs.jsonl')
  fs.writeFileSync(file, rows.map((r) => JSON.stringify(r)).join('\n') + (rows.length ? '\n' : ''))
  return file
}

function writeDiff (dir, lines) {
  const file = path.join(dir, 'diff.txt')
  fs.writeFileSync(file, lines.join('\n') + '\n')
  return file
}

test('AC-20260823-06-5: a note body citing a changed path\'s basename is surfaced as diff-hit, and MEMORY.md index files are excluded from the scope even when they cite the same token', () => {
  const dir = fs.realpathSync(tmpdir('memory-sweep-diffhit'))
  gitRepo(dir, { empty: true })
  const noteRel = writeNote(dir, 'plugin-tests', 'note-diff-hit.md',
    '---\nname: note-diff-hit\ndescription: fixture\nmetadata:\n  type: feedback\n---\n\n' +
    'The fix for this defect class lives in ac-matrix.js\'s coverage derivation.\n')
  const indexRel = writeNote(dir, 'plugin-tests', 'MEMORY.md',
    '# Memory index\n\n- [note](note-diff-hit.md) — also mentions ac-matrix.js\n')
  commitAt(dir, '2026-08-01T00:00:00Z', [noteRel, indexRel])
  writeLedger(dir, [])
  const diffFile = writeDiff(dir, ['spec/scripts/ac-matrix.js'])

  const r = runNode('scripts/memory-sweep.js', ['--root', dir, '--diff', diffFile])
  assert.strictEqual(r.status, 0, (r.stderr || '') +
    ' — a sweep that ran to completion must exit 0 even when it found a diff-hit; the sweep ' +
    'is a disposition-trigger widener, never a verdict input')
  let out
  try { out = JSON.parse((r.stdout || '').trim()) } catch (e) {
    assert.fail('stdout must be the sole JSON contract, `{"notes":[...]}`; unparseable ' +
      'stdout means the close-step session cannot union it with the diff-touched set: ' + (r.stdout || ''))
  }
  const hit = out.notes.find((n) => n.path.endsWith('note-diff-hit.md'))
  assert.ok(hit, 'the note citing ac-matrix.js in its body must be surfaced when the diff ' +
    'touches spec/scripts/ac-matrix.js — a same-build falsified note living outside its own ' +
    'diff is exactly the class this spec exists to catch: ' + JSON.stringify(out))
  assert.strictEqual(hit.reason, 'diff-hit',
    'the surfaced note\'s reason must be "diff-hit", not conflated with ttl-expired: ' + JSON.stringify(hit))
  assert.strictEqual(hit.matched, 'ac-matrix.js',
    'the "matched" field must carry the exact token the note body and the diff line agreed ' +
    'on (the basename ac-matrix.js), so the disposing session can see why the note fired: ' + JSON.stringify(hit))
  assert.ok(!out.notes.some((n) => n.path.endsWith('MEMORY.md')),
    'MEMORY.md index files are excluded from the swept scope by D5/D6 even when their prose ' +
    'cites the same token — surfacing an index file for disposition would misdirect the ' +
    'session at a file nobody\'s note-writing contract governs: ' + JSON.stringify(out))
})

test('AC-20260823-06-6: ttl-expired notes surface oldest-git-date-first, capped at 3 per run, and a note under the 10-row threshold is never listed', () => {
  const dir = fs.realpathSync(tmpdir('memory-sweep-ttl'))
  gitRepo(dir, { empty: true })

  // 5 notes committed before every review row below — each sees all 12 review rows postdate
  // it (12 >= 10, all "expired"), ordered oldest-to-newest by their own commit date.
  const expiredDates = [
    '2026-01-01T00:00:00Z', '2026-01-02T00:00:00Z', '2026-01-03T00:00:00Z',
    '2026-01-04T00:00:00Z', '2026-01-05T00:00:00Z'
  ]
  const expiredRel = []
  for (let i = 0; i < expiredDates.length; i++) {
    const rel = writeNote(dir, 'plugin-tests', `note-${i + 1}.md`,
      `---\nname: note-${i + 1}\ndescription: fixture\nmetadata:\n  type: feedback\n---\n\n` +
      'A routine engineering observation with no path references of its own.\n')
    commitAt(dir, expiredDates[i], [rel])
    expiredRel.push(rel)
  }

  // A 6th note committed mid-range so exactly 9 of the 12 review rows postdate it — under the
  // >=10 threshold, so it must never appear regardless of how old it looks next to the others.
  const underRel = writeNote(dir, 'plugin-tests', 'note-6.md',
    '---\nname: note-6\ndescription: fixture\nmetadata:\n  type: feedback\n---\n\n' +
    'A routine engineering observation with no path references of its own.\n')
  commitAt(dir, '2026-01-12T12:00:00Z', [underRel])

  const reviewRows = []
  for (let d = 10; d <= 21; d++) {
    reviewRows.push({ ts: `2026-01-${String(d).padStart(2, '0')}T00:00:00Z`, stage: 'review' })
  }
  // Decoy non-review rows inside and outside the date range — must never count toward any
  // note's postdating total, proving the sweep filters on "stage":"review" specifically.
  const rows = [{ ts: '2026-01-01T00:00:00Z', stage: 'build' }]
    .concat(reviewRows)
    .concat([{ ts: '2026-01-25T00:00:00Z', stage: 'build' }])
  writeLedger(dir, rows)
  const diffFile = writeDiff(dir, ['docs/unrelated-file.md'])

  const r = runNode('scripts/memory-sweep.js', ['--root', dir, '--diff', diffFile])
  assert.strictEqual(r.status, 0, (r.stderr || '') + ' — a sweep with ttl-expired findings must still exit 0')
  const out = JSON.parse((r.stdout || '').trim())
  const ttl = out.notes.filter((n) => n.reason === 'ttl-expired')

  assert.strictEqual(ttl.length, 3,
    `exactly 3 of the 5 expired notes must surface (the oldest-first cap of 3) — got ${ttl.length}: ` +
    JSON.stringify(out))
  const surfacedNames = ttl.map((n) => path.basename(n.path)).sort()
  assert.deepStrictEqual(surfacedNames, ['note-1.md', 'note-2.md', 'note-3.md'],
    'the 3 SURFACED notes must be the 3 with the oldest git commit dates (note-1..note-3) — ' +
    'surfacing a newer expired note ahead of an older one defeats "oldest first", the ordering ' +
    'this AC exists to pin: ' + JSON.stringify(out))
  assert.ok(!out.notes.some((n) => path.basename(n.path) === 'note-4.md'),
    'note-4.md is the 4th-oldest expired note — over the 3-note cap, it must not be listed: ' + JSON.stringify(out))
  assert.ok(!out.notes.some((n) => path.basename(n.path) === 'note-5.md'),
    'note-5.md is the 5th-oldest (newest) expired note — over the 3-note cap, it must not be listed: ' + JSON.stringify(out))
  assert.ok(!out.notes.some((n) => path.basename(n.path) === 'note-6.md'),
    'note-6.md has only 9 review rows postdating its commit (below the >=10 threshold) — it ' +
    'must never surface as ttl-expired no matter how it would rank by date: ' + JSON.stringify(out))

  const oldest = ttl.find((n) => path.basename(n.path) === 'note-1.md')
  assert.strictEqual(oldest.matched, '2026-01-01T00:00:00Z',
    'the "matched" field for a ttl-expired note must carry its actual last-commit ISO date, ' +
    'so the disposing session can see how stale the note is: ' + JSON.stringify(oldest))
})

test('AC-20260823-06-7: no diff intersection and nothing expired prints exactly {"notes":[]} and exits 0', () => {
  const dir = fs.realpathSync(tmpdir('memory-sweep-empty'))
  gitRepo(dir, { empty: true })
  const rel = writeNote(dir, 'plugin-tests', 'note-quiet.md',
    '---\nname: note-quiet\ndescription: fixture\nmetadata:\n  type: feedback\n---\n\n' +
    'This note cites nothing that could ever appear in a changed-file set.\n')
  commitAt(dir, '2026-08-20T00:00:00Z', [rel])
  writeLedger(dir, [])
  const diffFile = writeDiff(dir, ['docs/completely-unrelated-topic.md'])

  const r = runNode('scripts/memory-sweep.js', ['--root', dir, '--diff', diffFile])
  assert.strictEqual(r.status, 0, (r.stderr || '') +
    ' — a sweep that intersects nothing must still exit 0, never a nonzero "nothing found" code')
  assert.strictEqual((r.stdout || '').trim(), '{"notes":[]}',
    'stdout must be EXACTLY {"notes":[]} with no findings and no extra output — this is the ' +
    'sole machine contract the CLOSE-step session parses, and any surrounding text (a banner, ' +
    'a summary line) breaks that parse: ' + JSON.stringify(r.stdout))
})

test('AC-20260823-06-8: an unreadable --root, --diff, or --ledger exits 2 naming the remedy, and a run that finds notes still exits 0', () => {
  const dir = fs.realpathSync(tmpdir('memory-sweep-badinput'))
  gitRepo(dir, { empty: true })
  const rel = writeNote(dir, 'plugin-tests', 'note-ok.md',
    '---\nname: note-ok\ndescription: fixture\nmetadata:\n  type: feedback\n---\n\n' +
    'This note cites ac-matrix.js as the owner of the class it records.\n')
  commitAt(dir, '2026-08-01T00:00:00Z', [rel])
  writeLedger(dir, [])
  const diffFile = writeDiff(dir, ['spec/scripts/ac-matrix.js'])

  const badRoot = runNode('scripts/memory-sweep.js',
    ['--root', path.join(dir, 'does-not-exist'), '--diff', diffFile])
  assert.strictEqual(badRoot.status, 2, (badRoot.stderr || '') +
    ' — an unreadable --root must exit 2, never crash uninformatively or silently sweep nothing')
  assert.match(badRoot.stderr || '', /--root/,
    'stderr must name --root as the bad flag so the session knows which argument to fix: ' + (badRoot.stderr || ''))

  const badDiff = runNode('scripts/memory-sweep.js',
    ['--root', dir, '--diff', path.join(dir, 'missing-diff.txt')])
  assert.strictEqual(badDiff.status, 2, (badDiff.stderr || '') + ' — an unreadable --diff must exit 2')
  assert.match(badDiff.stderr || '', /--diff/,
    'stderr must name --diff as the bad flag: ' + (badDiff.stderr || ''))

  const badLedger = runNode('scripts/memory-sweep.js',
    ['--root', dir, '--diff', diffFile, '--ledger', path.join(dir, 'missing-ledger.jsonl')])
  assert.strictEqual(badLedger.status, 2, (badLedger.stderr || '') + ' — an unreadable --ledger must exit 2')
  assert.match(badLedger.stderr || '', /--ledger|ledger/,
    'stderr must name the ledger as the bad input: ' + (badLedger.stderr || ''))

  const ok = runNode('scripts/memory-sweep.js', ['--root', dir, '--diff', diffFile])
  assert.strictEqual(ok.status, 0, (ok.stderr || '') +
    ' — a well-formed invocation that FINDS a note must still exit 0: D13 makes this sweep a ' +
    'disposition-trigger widener that never feeds verdict.js, so exit code must never vary with finding count')
  const out = JSON.parse((ok.stdout || '').trim())
  assert.ok(out.notes.length > 0,
    'this run\'s fixture is deliberately set up to find note-ok.md via diff-hit — an empty ' +
    'result here means the "still exits 0" half of this AC is not actually being exercised: ' +
    JSON.stringify(out))
})
