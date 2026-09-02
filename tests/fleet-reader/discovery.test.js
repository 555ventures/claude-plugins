'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const { ROOT, tmpdir, runNode } = require('../helpers')

// Fleet evidence reader (specs/20260820/05-fleet-evidence-reader.md, 2026-08-20): brief 17's
// motivating incident is that pipeline questions get answered from whichever repo happens to
// be open — this repo's ~14% slice of the fleet's ~1,100 rows. discovery.test.js pins D2's
// scan rule (one level under --repos-root, config-gated, dotfile/node_modules/worktree
// skipped verbatim from brief 03's ratified rule), D4's population-first render, D12's
// read-only/exit-code contract, and D13's --json shape. spec/scripts/fleet-reader.js does not
// exist yet (TDD red phase) — every runNode call below fails until D1 ships it.
//
// specs/20260820/08-config-name-ban.md (2026-08-20, D8/AC-20260820-08-8): the discovery probe's
// config-presence check migrates from a private `fs.existsSync(claudeDir + '/spec.config.json')`
// (or an equally private path build) to `configExists(dir)` imported from `lib/host-config.js` —
// the sanctioned route this spec's ban opens for exactly this reason. The five-line comment above
// the old probe, ending "Do not tidy", is replaced (not trimmed) by a one-line comment.

const SCRIPT = 'scripts/fleet-reader.js'
const SCRIPT_PATH = path.join(ROOT, 'spec/scripts/fleet-reader.js')

function mkRepo(root, name, { config = true, git = 'dir', ledgers = {} } = {}) {
  const dir = path.join(root, name)
  fs.mkdirSync(path.join(dir, '.claude'), { recursive: true })
  if (config) fs.writeFileSync(path.join(dir, '.claude/spec.config.json'), '{}')
  if (git === 'dir') fs.mkdirSync(path.join(dir, '.git'), { recursive: true })
  else if (git === 'file') fs.writeFileSync(path.join(dir, '.git'), 'gitdir: ../.git/worktrees/' + name + '\n')
  for (const [file, lines] of Object.entries(ledgers)) {
    fs.writeFileSync(path.join(dir, '.claude', file),
      lines.map(l => typeof l === 'string' ? l : JSON.stringify(l)).join('\n') + '\n')
  }
  return dir
}

function hashTree(dir) {
  const files = []
  ;(function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name)
      if (e.isDirectory()) walk(p)
      else files.push(p)
    }
  })(dir)
  files.sort()
  const h = crypto.createHash('sha256')
  for (const f of files) {
    h.update(path.relative(dir, f))
    h.update(fs.readFileSync(f))
  }
  return h.digest('hex')
}

// AC-20260820-05-1
test('AC-20260820-05-1: discovery includes only the config-bearing, non-dotted, non-node_modules, non-worktree-checkout repo one level under --repos-root', () => {
  const root = tmpdir('fleet-disc-1')
  mkRepo(root, 'repo-a', { config: true, git: 'dir' })
  mkRepo(root, '.hidden', { config: true, git: 'dir' })
  mkRepo(root, 'node_modules', { config: true, git: 'dir' })
  mkRepo(root, 'wt-b', { config: true, git: 'file' })
  mkRepo(root, 'plain', { config: false, git: 'dir' })

  const r = runNode(SCRIPT, ['--repos-root', root, '--json'])
  assert.strictEqual(r.status, 0, 'D2: a repos-root with exactly one qualifying repo must derive cleanly, not error: ' + r.stderr)
  const out = JSON.parse(r.stdout)
  assert.strictEqual(out.population.scanned, 1,
    'D2: .hidden (dot-prefixed), node_modules, wt-b (.git is a file — a worktree checkout), and plain (no spec.config.json) must all be skipped — a wrong scan silently widens or narrows the fleet the other five queries answer from')
  assert.deepStrictEqual(out.population.repos.map(x => x.name), ['repo-a'],
    'the one included repo must be repo-a — any other name means the discovery predicate matched the wrong directory')
})

// AC-20260820-05-2
test('AC-20260820-05-2: population lists a config-only repo with rows 0 and sums rows across the live ledger and its year archive, rendered first', () => {
  const root = tmpdir('fleet-disc-2')
  mkRepo(root, 'no-ledger-repo', { config: true, git: 'dir' })
  mkRepo(root, 'archived-repo', {
    config: true,
    git: 'dir',
    ledgers: {
      'spec-runs.jsonl': [
        { ts: '2026-08-01T00:00:00Z', stage: 'plan', spec: 'specs/a.md' },
        { ts: '2026-08-02T00:00:00Z', stage: 'plan', spec: 'specs/b.md' },
      ],
      'spec-runs-2025.jsonl': [
        { ts: '2025-01-01T00:00:00Z', stage: 'plan', spec: 'specs/x.md' },
        { ts: '2025-01-02T00:00:00Z', stage: 'plan', spec: 'specs/y.md' },
        { ts: '2025-01-03T00:00:00Z', stage: 'plan', spec: 'specs/z.md' },
      ],
    },
  })

  const r = runNode(SCRIPT, ['--repos-root', root, '--json'])
  assert.strictEqual(r.status, 0, r.stderr)
  const out = JSON.parse(r.stdout)
  const byName = Object.fromEntries(out.population.repos.map(x => [x.name, x]))
  assert.strictEqual(byName['no-ledger-repo'].rows, 0,
    'D4: a scanned repo with a spec.config.json but no ledger file must be listed with rows:0, never omitted — an uncloned/never-run repo silently vanishing is the reader\'s named failure mode')
  assert.strictEqual(byName['archived-repo'].rows, 5,
    'D3: the ledger glob is .claude/spec-runs*.jsonl (live + year archives) — reading only spec-runs.jsonl would undercount to 2 and silently lose 2025\'s 3 archived rows')

  const bare = runNode(SCRIPT, ['--repos-root', root])
  assert.strictEqual(bare.status, 0, bare.stderr)
  const sections = bare.stdout.split(/\n\s*\n/).filter(s => s.trim() !== '')
  const popIdx = sections.findIndex(s => s.includes('no ledger'))
  assert.ok(popIdx !== -1, 'Behavior: a rows:0 repo renders with an explicit "no ledger" marker in the human render — it must not read as silent absence: ' + bare.stdout)
  assert.ok(popIdx <= 1,
    'D4/D13: "bare invocation = human render, population first" — the population block (carrying the no-ledger marker) must be the first or second printed section, never buried after query output: ' + bare.stdout)
})

// AC-20260820-05-11
test('AC-20260820-05-11: running the reader against a synthetic fleet leaves every file byte-identical', () => {
  const root = tmpdir('fleet-readonly')
  mkRepo(root, 'repo-a', {
    config: true,
    git: 'dir',
    ledgers: { 'spec-runs.jsonl': [{ ts: '2026-08-18T00:00:00Z', stage: 'plan', spec: 'specs/a.md' }] },
  })
  const before = hashTree(root)
  const r1 = runNode(SCRIPT, ['--repos-root', root])
  assert.strictEqual(r1.status, 0, r1.stderr)
  const r2 = runNode(SCRIPT, ['--repos-root', root, '--json'])
  assert.strictEqual(r2.status, 0, r2.stderr)
  const after = hashTree(root)
  assert.strictEqual(after, before,
    'D12: the reader is read-only and stateless (no writes, no cache, no stored repo list) — a changed recursive content hash means it wrote to a host repo it only has authority to read')
})

// AC-20260820-05-12
test('AC-20260820-05-12: an unknown flag or a non-directory --repos-root exits 2 with a usage line on stderr; a valid empty repos-root exits 0 with scanned 0', () => {
  const root = tmpdir('fleet-usage')
  const bogus = runNode(SCRIPT, ['--repos-root', root, '--bogus'])
  assert.strictEqual(bogus.status, 2, 'D12: an unrecognized flag is a usage error, not a silent no-op or a crash: ' + bogus.stderr)
  assert.match(bogus.stderr, /Usage:/, 'the usage line must appear on stderr so the invocation mistake is discoverable')
  assert.match(bogus.stderr, /fleet-reader\.js/, 'the usage line names the script per scripts/ convention (error messages name the remedy)')

  const notADir = path.join(root, 'not-a-directory.txt')
  fs.writeFileSync(notADir, 'x')
  const badRoot = runNode(SCRIPT, ['--repos-root', notADir])
  assert.strictEqual(badRoot.status, 2, 'D12: a --repos-root that is not a directory must exit 2, not attempt to readdir a file and crash')
  assert.match(badRoot.stderr, /Usage:/, 'usage line on stderr for the bad --repos-root case too')

  const empty = tmpdir('fleet-empty')
  const good = runNode(SCRIPT, ['--repos-root', empty, '--json'])
  assert.strictEqual(good.status, 0, 'D12: 0 repos found is still a derived answer (exit 0), never a usage error: ' + good.stderr)
  assert.strictEqual(JSON.parse(good.stdout).population.scanned, 0,
    'an empty repos-root must report scanned: 0, not omit the population block entirely')
})

// AC-20260820-05-13 / AC-20260901-03-6 (updated in place, never weakened): specs/20260901/03
// D9 adds an EIGHTH fixed question, cleanByVia, so this exhaustive key-set pin is invalidated by
// construction — the documented add-a-member-to-an-exhaustive-live-file-pin class (§ Gotchas).
// The pin stays exhaustive: the new key is added to the expected set, nothing is loosened.
// AC-20260901-07-12 (tagged, no assertion change): specs/20260901/07-escape-class-contract.md D4
// enriches the "escapes" and "driftCensus" values with unclassedRows/amendments/new drift
// buckets, but the CONTRACT is that the top-level key SET stays at exactly eight — this test is
// the oracle for that.
test('AC-20260820-05-13 / AC-20260901-03-6 / AC-20260901-07-12: --json prints exactly the eight contracted top-level keys; without --json the render is not JSON', () => {
  const root = tmpdir('fleet-json-shape')
  mkRepo(root, 'repo-a', { config: true, git: 'dir' })

  const j = runNode(SCRIPT, ['--repos-root', root, '--json'])
  assert.strictEqual(j.status, 0, j.stderr)
  const out = JSON.parse(j.stdout)
  assert.deepStrictEqual(Object.keys(out).sort(), [
    'cleanByVia', 'cleanContradicted', 'driftCensus', 'escapes', 'gate08', 'legRecency', 'population',
    'replayDebt',
  ], 'D13: --json must carry exactly the eight contracted top-level keys (cleanByVia added by specs/20260901/03 D9) — an extra or missing key breaks every --json consumer silently')

  const bare = runNode(SCRIPT, ['--repos-root', root])
  assert.strictEqual(bare.status, 0, bare.stderr)
  assert.throws(() => JSON.parse(bare.stdout),
    'D13: "--json is the sole machine format" — the bare invocation must render as human text, not double as a second JSON mode')
})

// AC-20260820-08-8
test('AC-20260820-08-8: fleet-reader.js determines config presence via configExists imported from lib/host-config, and its source names the config filename nowhere', () => {
  assert.ok(fs.existsSync(SCRIPT_PATH), 'spec/scripts/fleet-reader.js must exist for this pin to mean anything')
  const src = fs.readFileSync(SCRIPT_PATH, 'utf8')
  assert.strictEqual(src.includes('spec.config.json'), false,
    'fleet-reader.js\'s source must contain zero occurrences of the literal spec.config.json — the config-name ban (specs/20260820/08 D2) forbids naming the file outside lib/host-config.js and the two named shell scripts, and fleet-reader.js is not one of the three exempt paths')
  assert.match(src, /require\(['"]\.\/lib\/host-config['"]\)/,
    'the reader must import lib/host-config.js — this is the only sanctioned route to a config-presence check once the filename itself may not be named in this file')
  assert.match(src, /\bconfigExists\(/,
    'discovery must call configExists(...) for its presence check — calling anything else means the shared helper is imported but a private presence check still exists somewhere in this file')

  const hostConfig = require('../../spec/scripts/lib/host-config')
  assert.strictEqual(typeof hostConfig.configExists, 'function',
    'lib/host-config.js must export configExists as a function — without this export fleet-reader.js has no sanctioned way to check presence without naming the config filename itself')
  assert.strictEqual(typeof hostConfig.configPath, 'function',
    'lib/host-config.js must export configPath as a function (the renamed configPathFor) — configExists is specified in terms of it, and other callers migrating off private path-joins depend on this export existing')
})
