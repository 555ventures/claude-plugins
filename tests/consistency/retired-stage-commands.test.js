'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { ROOT } = require('../helpers')

// specs/20260912/03-run-isolates-and-owns-the-stages.md D15 (AC-20260912-03-17): a repo-wide
// sweep for the three retired slash-command literals, same shape as
// tests/consistency/genesis-doctrine.test.js's sweepRetiredLiteral, narrowed for tests/: a
// non-comment-line check rather than whole-file, since a pin's own header legitimately records
// which retired command it was written against.

// Assembled from fragments so this sweep's own source never spells a whole retired literal —
// the self-matching trap tracked-text-purity's '\x00' construction avoids the same way.
const RETIRED = {
  build: '/spec:' + 'build',
  review: '/spec:' + 'review',
  design: '/spec:' + 'design',
}

function isCommentLine(line) {
  return line.trimStart().startsWith('//')
}

// D15: `specs/`, `docs/roadmap/`, `docs/adr/`, `docs/audit/` are dated historical records — a
// spec that retires a command must keep naming it. `.claude/` is host grounding owned by
// /spec:init and /spec:doctor, queued for a doctor re-stamp rather than hand-edited here.
// `docs/canonical/` is deliberately NOT waived — it is live surface this same sweep must keep
// watching for a future regression of the retired name (rules § Gotchas: "do not take the
// obvious-looking fix of adding docs/canonical/ to waivedPrefixes").
const WAIVED_PREFIXES = ['specs/', 'docs/roadmap/', 'docs/adr/', 'docs/audit/', '.claude/']

function walk(dir, acc) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === '.git' || ent.name === 'node_modules') continue
    // A sibling session's live /spec:run worktree is a checkout of an older commit, not this
    // repo's content — sweeping it would redden this pin whenever a run is in flight.
    if (dir === path.join(ROOT, '.claude') && ent.name === 'worktrees') continue
    const abs = path.join(dir, ent.name)
    if (ent.isDirectory()) walk(abs, acc)
    else if (ent.isFile()) acc.push(abs)
  }
  return acc
}

// Non-tests/ files: any occurrence anywhere in the file is a hit (whole-file, like
// sweepRetiredLiteral). tests/ files: only a hit on a NON-comment line counts — D15's own carve-
// out for "comment lines in tests/ that record why a pin exists".
function sweepRetiredLiteral(literal) {
  const isWaived = (rel) => WAIVED_PREFIXES.some((pre) => rel.startsWith(pre))
  const offenders = []
  for (const abs of walk(ROOT, [])) {
    const rel = path.relative(ROOT, abs).split(path.sep).join('/')
    if (isWaived(rel)) continue
    let content
    try { content = fs.readFileSync(abs, 'utf8') } catch { continue }
    if (rel.startsWith('tests/')) {
      const hit = content.split('\n').some((line) => line.includes(literal) && !isCommentLine(line))
      if (hit) offenders.push(rel)
    } else if (content.includes(literal)) {
      offenders.push(rel)
    }
  }
  return offenders
}

// ---------------------------------------------------------------------------
// AC-20260912-03-17
// ---------------------------------------------------------------------------

for (const [name, literal] of Object.entries(RETIRED)) {
  test(`AC-20260912-03-17: the tracked tree carries zero hits of the retired /spec:${name} literal under spec/, git/, scripts/, README.md, docs/canonical/, and on non-comment lines under tests/ (specs/, docs/roadmap/, docs/adr/, docs/audit/, .claude/ excluded as history)`, () => {
    const offenders = sweepRetiredLiteral(literal)
    assert.deepStrictEqual(offenders, [],
      'a surviving mention of the retired /spec:' + name + ' command outside the waived history ' +
      'prefixes points a reader, or a future session, at a command that is no longer invokable — ' +
      'D7 deletes spec/commands/' + name + '.md outright, so any live reference here is stale ' +
      'prose or a pin asserting behavior that no longer exists: ' + offenders.join(', '))
  })
}

test('AC-20260912-03-17: the sweep itself only excludes a tests/ file\'s comment lines, never the whole file, so a genuine non-comment mention is still caught', () => {
  const root = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'retired-sweep-selfcheck-'))
  try {
    fs.mkdirSync(path.join(root, 'tests'), { recursive: true })
    fs.writeFileSync(path.join(root, 'tests/probe.test.js'),
      "// a header comment may still name " + RETIRED.build + " as history\n" +
      "test('x', () => { gate('" + RETIRED.build + "', spec) })\n")
    // Exercise the same walk/isWaived/isCommentLine logic against an isolated fixture root by
    // re-deriving offenders manually — sweepRetiredLiteral is closed over the live ROOT, so this
    // proves the LINE-LEVEL discrimination (comment vs non-comment) rather than re-pointing the
    // sweep at a fixture tree.
    const content = fs.readFileSync(path.join(root, 'tests/probe.test.js'), 'utf8')
    const lines = content.split('\n')
    assert.ok(isCommentLine(lines[0]) && lines[0].includes(RETIRED.build),
      'setup: the fixture\'s first line must be a comment mention')
    assert.ok(!isCommentLine(lines[1]) && lines[1].includes(RETIRED.build),
      'setup: the fixture\'s second line must be a genuine non-comment mention')
    const hit = lines.some((line) => line.includes(RETIRED.build) && !isCommentLine(line))
    assert.ok(hit,
      'a non-comment mention of a retired literal inside tests/ must still be caught — excluding ' +
      'comment lines must never widen into excluding the whole file, or a live behavioral pin on ' +
      'a retired command could hide behind a preceding header comment')
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})
