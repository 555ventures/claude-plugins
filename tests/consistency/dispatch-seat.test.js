'use strict'
const test = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { ROOT, read } = require('../helpers')

// /spec:fix policy.models seat gaps (20261029/09 review): seat coverage followed spec 09's step
// list, so three hand-spelled review-driver remedies and two doctrine literals escaped it. These
// scans pin the structural rule: a printed dispatch is built by host-config's agentCall, and prose
// names a policy seat rather than a model.

function filesUnder(rel, ext) {
  const out = []
  const walk = (dir) => {
    for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      const r = path.join(dir, e.name)
      if (e.isDirectory()) walk(r)
      else if (r.endsWith(ext)) out.push(r)
    }
  }
  walk(rel)
  return out
}

// host-config.js holds agentCall itself. genesis-driver's design-seat dispatches are the planner
// seat, which policy.models has no key for (POLICY_SEATS is workers|reviewer|disposer); giving it
// one is a schema change for /spec:plan, so only that exact planner literal is exempt.
const SCRIPT_EXEMPT = new Set(['spec/scripts/lib/host-config.js'])
const PLANNER_LITERAL = 'Agent {model: "fable", effort: "high"}'

test('every Agent {…} dispatch a script prints is built by agentCall — no hand-spelled literal outside the exempt files', () => {
  const hits = []
  for (const f of filesUnder('spec/scripts', '.js')) {
    if (SCRIPT_EXEMPT.has(f)) continue
    read(f).split('\n').forEach((line, i) => {
      const rest = f === 'spec/scripts/genesis-driver.js' ? line.split(PLANNER_LITERAL).join('') : line
      if (/Agent\s*\{/.test(rest)) hits.push(`${f}:${i + 1}`)
    })
  }
  assert.deepStrictEqual(hits, [],
    'a hand-spelled Agent {…} literal prints without the policy seat; build it with agentCall: ' + hits.join(', '))
})

const PROSE_DIRS = ['spec/commands', 'spec/doctrine', 'git/commands']
// core.md holds the seat table; genesis.md names the planner seat, which has no policy key.
const PROSE_EXEMPT = new Set(['spec/doctrine/core.md', 'spec/commands/genesis.md'])
const proseFiles = () => PROSE_DIRS.flatMap((d) => filesUnder(d, '.md')).filter((f) => !PROSE_EXEMPT.has(f))

test('no command or doctrine names a model beside an effort outside core § Model Placement', () => {
  // Whole text, not per line: prose wraps, so a pair split across a line break must still match.
  const re = /\b(sonnet|opus|haiku|fable)\b["`]?,?\s*(at\s+)?["`]?effort/gi
  const hits = []
  for (const f of proseFiles()) {
    const text = read(f)
    for (const m of text.matchAll(re)) hits.push(`${f}:${text.slice(0, m.index).split('\n').length}`)
  }
  assert.deepStrictEqual(hits, [],
    'a hard-coded model/effort pair ignores the host policy seat; name the seat instead: ' + hits.join(', '))
})

test('every reviewer or disposer dispatch in commands and doctrine names the policy as its seat source', () => {
  const re = /subagent_type:\s*['"]spec:(reviewer|disposer)['"]/g
  const hits = []
  for (const f of proseFiles()) {
    const text = read(f)
    for (const m of text.matchAll(re)) {
      if (!/policy/.test(text.slice(m.index, m.index + 300))) hits.push(`${f} (${m[1]})`)
    }
  }
  assert.deepStrictEqual(hits, [],
    'a bare reviewer/disposer dispatch runs on the agent frontmatter, so a host policy.models override never reaches it: ' + hits.join(', '))
})
