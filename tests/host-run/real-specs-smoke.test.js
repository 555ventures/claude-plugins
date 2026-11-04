'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { ROOT, tmpdir, runNode, gitRepo } = require('../helpers')

// Standing guard, deliberately UNTAGGED — no AC-ID in this file, by design.
//
// Design record: specs/20261103/10-two-missing-briefs-are-not-the-same-brief.md D9.
// spec-status --next/--lanes run over a copy of this checkout's own specs/ tree plus two ad-hoc
// sentinels; the real tree is only read. Do not add an AC-ID here and do not weaken these
// assertions to make a sweep pass.

function frontStatus(file) {
  const m = /^status:\s*(\S+)/m.exec(fs.readFileSync(file, 'utf8').split(/\n---\n/)[0])
  return m ? m[1] : null
}

function walk(dir) {
  const out = []
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) out.push(...walk(p))
    else if (e.name.endsWith('.md') && /^\d{2}[a-z]?-/.test(e.name)) out.push(p)
  }
  return out
}

function stand() {
  const dir = fs.realpathSync(tmpdir('real-specs-smoke'))
  gitRepo(dir)
  fs.cpSync(path.join(ROOT, 'specs'), path.join(dir, 'specs'), { recursive: true })
  fs.cpSync(path.join(ROOT, 'docs/roadmap'), path.join(dir, 'docs/roadmap'), { recursive: true })
  const cfgPath = path.join(ROOT, '.claude/spec.config.json')
  fs.mkdirSync(path.join(dir, '.claude'), { recursive: true })
  fs.copyFileSync(cfgPath, path.join(dir, '.claude/spec.config.json'))
  const rules = JSON.parse(fs.readFileSync(cfgPath, 'utf8')).pipelineRules
  if (rules) {
    fs.mkdirSync(path.dirname(path.join(dir, rules)), { recursive: true })
    fs.copyFileSync(path.join(ROOT, rules), path.join(dir, rules))
  }
  const sentinel = (n, stem, row) => {
    const p = path.join(dir, 'specs/20991231', n + '-' + stem + '.md')
    fs.mkdirSync(path.dirname(p), { recursive: true })
    fs.writeFileSync(p, '---\ndate: 2099-12-31\nstatus: hardened\nbrief: n/a\n---\n\n# ' + stem +
      '\n\n## File Plan\n\n| Path | Action | Layer | Summary |\n|------|--------|-------|---------|\n| `' + row + '` | CREATE | tests | smoke |\n')
  }
  sentinel('01', 'smoke-a', 'tests/host-run/smoke-a.txt')
  sentinel('02', 'smoke-b', 'tests/host-run/smoke-b.txt')
  return dir
}

test('spec-status --next --json and --lanes --json over a copy of the real specs tree place every in-flight spec exactly once and keep the frozen shapes', () => {
  const dir = stand()
  const next = runNode('scripts/spec-status.js', ['--root', dir, '--next', '--json'], { cwd: dir })
  assert.strictEqual(next.status, 0, '--next --json must derive over the real specs tree, or a real spec shape crashes the sole next derivation: ' + next.stderr)
  const lanes = runNode('scripts/spec-status.js', ['--root', dir, '--lanes', '--json'], { cwd: dir })
  assert.strictEqual(lanes.status, 0, '--lanes --json must derive over the real specs tree: ' + lanes.stderr)
  const n = JSON.parse(next.stdout).next
  const l = JSON.parse(lanes.stdout)
  const inLanes = new Set(l.lanes.map((x) => x.path))
  const inSerial = new Set(l.serialized.map((x) => x.path))
  const blocked = new Set(n.filter((e) => Array.isArray(e.blockers) && e.blockers.length > 0).map((e) => e.path))
  const inflight = walk(path.join(dir, 'specs')).filter((f) => ['hardened', 'implementing'].includes(frontStatus(f)))
    .map((f) => path.relative(dir, f).split(path.sep).join('/'))
  assert.ok(inflight.length >= 2, 'the sentinels alone are in flight, so the set cannot be smaller than two: ' + inflight.join(','))
  for (const p of inflight) {
    const homes = [inLanes.has(p), inSerial.has(p), blocked.has(p)].filter(Boolean).length
    assert.strictEqual(homes, 1, p + ' must appear in exactly one of lanes, serialized or blocked next entries, or a spec shape silently falls out of every bucket: ' +
      JSON.stringify({ lanes: [...inLanes], serialized: l.serialized, blocked: [...blocked] }))
  }
  for (const s of l.serialized) assert.ok(s.reason, s.path + ' must carry a non-empty serialization reason, or the fan-out holds it back without saying why')
  for (const e of n) {
    assert.ok(e.brief === null || /^\d{2}[a-z]?$/.test(e.brief), 'every --next brief is null or a roadmap number, never the internal variant: ' + JSON.stringify(e))
  }
  for (const s of ['specs/20991231/01-smoke-a.md', 'specs/20991231/02-smoke-b.md']) {
    assert.ok(inLanes.has(s), s + ' is half of a parallel-ok ad-hoc pair and must be a lane, or two ad-hoc specs with disjoint File Plans are held back: ' + JSON.stringify(l.lanes.map((x) => x.path)))
  }
  assert.deepStrictEqual(Object.keys(l.lanes[0]).sort(), ['action', 'branch', 'brief', 'note', 'path', 'status', 'worktree'],
    'a lane entry carries exactly the seven contract keys, or the fan-out driver reads a field that is not there')
  assert.deepStrictEqual(Object.keys(l).sort(), ['born', 'fixes', 'lanes', 'serialized'],
    'the --lanes --json top-level keys are frozen, or an external consumer reads a shape nobody pinned')
})
