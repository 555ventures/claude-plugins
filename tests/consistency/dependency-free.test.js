'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync, execFileSync } = require('node:child_process')
const { ROOT } = require('../helpers')

// specs/20260820/01-autopilot-removal.md (2026-08-20): D1 deletes autopilot/** and
// tests/autopilot/** outright ("git history is the archive; an in-repo 'parked' copy invites
// resurrection"), and D4 deletes every SDK-import/typebox carve-out that used to sanction the
// daemon's dependency. These two pins make the dependency-free invariant absolute and a silent
// re-import impossible to land: AC-20260820-01-3 pins zero tracked
// `@anthropic-ai/claude-agent-sdk` references outside specs/** (history, D5, is never rewritten
// and stays exempt), AC-20260820-01-4 pins the autopilot/ directory gone from the tracked tree.
// Both assert against the post-deletion end state and are RED against current HEAD (ba9faae) —
// autopilot/ still exists and still imports the SDK — per TDD red-phase convention. Do not
// weaken either assertion to make them pass before the deletion lands.

function gitGrepFiles(pattern) {
  const r = spawnSync('git', ['-C', ROOT, 'grep', '-l', '--fixed-strings', pattern], { encoding: 'utf8' })
  if (r.status === 1) return [] // git grep exit 1 means "no matches", not an error
  if (r.status !== 0) {
    throw new Error('git grep failed (status ' + r.status + '): ' + (r.stderr || r.stdout))
  }
  return r.stdout.split('\n').map((l) => l.trim()).filter(Boolean)
}

test('AC-20260820-01-3: no tracked file outside specs/** references @anthropic-ai/claude-agent-sdk', () => {
  const hits = gitGrepFiles('@anthropic-ai/claude-agent-sdk')
  const live = hits.filter((f) => !f.startsWith('specs/'))
  assert.deepStrictEqual(live, [],
    'a tracked reference to @anthropic-ai/claude-agent-sdk outside specs/** means the dead ' +
    'daemon\'s dependency has resurfaced — or a fresh one was silently added — now that D4 has ' +
    'deleted every carve-out that used to sanction it: every non-history hit is a re-import ' +
    'the dependency-free invariant exists to prevent: ' + JSON.stringify(live))
})

test('AC-20260820-01-4: the repo root contains no autopilot directory', () => {
  const tracked = execFileSync('git', ['-C', ROOT, 'ls-files', '--', 'autopilot'], { encoding: 'utf8' })
    .split('\n').filter(Boolean)
  assert.deepStrictEqual(tracked, [],
    'a tracked path under autopilot/ means the daemon was archived rather than deleted — D1 ' +
    'explicitly rejects moving it to attic/, since git history is the intended archive and an ' +
    'in-repo copy keeps every SDK carve-out alive: ' + JSON.stringify(tracked))
  assert.strictEqual(fs.existsSync(path.join(ROOT, 'autopilot')), false,
    'an autopilot/ directory is still present at the repo root — listing the root must show it ' +
    'gone entirely (not merely untracked, e.g. a stray autopilot/node_modules leftover), or a ' +
    'dead copy keeps inviting resurrection')
})
