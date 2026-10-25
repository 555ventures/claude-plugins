'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { ROOT, SPEC } = require('../helpers')

// Direct-lane /spec:fix (2026-10-25): every command retirement used to hand-list its own banned
// literals, so mentions outside that list survived the delete (4 of 10 command deletions since
// v7 left live ones). The live set is derived from disk instead — deleting a command file turns
// every surviving `/spec:<name>` mention red with no list to maintain. tests/ is out of scope:
// it builds banned names from fragments and cites retired commands in dated provenance headers.

const SCOPES = ['spec', 'git', 'docs/canonical', 'README.md']
const TOKEN = /\/spec:([a-z][a-z0-9-]*)/g

// A waived file must still carry the stale token — the waiver expires the moment it is fixed.
const WAIVED = {
  // A wording edit changes the contract hash and flags every host's grounding as stale (rules
  // § Risk Tiers); same waiver as AC-20260825-04-9's D14. Fixed with its next genuine edit.
  // Names built from fragments so the older per-name sweeps do not flag this file.
  'spec/templates/grounding-contract.md': ['gen' + 'esis-architect', 'gen' + 'esis-design'],
}

function liveSet() {
  const commands = fs.readdirSync(path.join(SPEC, 'commands')).filter(f => f.endsWith('.md')).map(f => f.slice(0, -3))
  const skills = fs.readdirSync(path.join(SPEC, 'skills'), { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name)
  return new Set([...commands, ...skills])
}

function walk(rel, acc) {
  const abs = path.join(ROOT, rel)
  if (!fs.existsSync(abs)) return acc
  if (fs.statSync(abs).isFile()) { acc.push(rel); return acc }
  for (const ent of fs.readdirSync(abs, { withFileTypes: true })) {
    if (ent.name === 'node_modules' || ent.name === '.git') continue
    walk(rel + '/' + ent.name, acc)
  }
  return acc
}

function strangers(text, live) {
  return [...new Set([...text.matchAll(TOKEN)].map(m => m[1]).filter(n => !live.has(n)))]
}

test('every /spec:<name> mention under spec/, git/, docs/canonical/ and README.md names a command file or skill that exists', () => {
  const live = liveSet()
  assert.ok(live.has('fix') && live.has('run'), 'the live set must be read from spec/commands/ — an empty set reddens every mention for the wrong reason')
  const files = SCOPES.flatMap(s => walk(s, []))
  assert.ok(files.length > 50, 'the sweep must actually walk the plugin tree (saw ' + files.length + ' files) — an empty walk passes vacuously')
  for (const rel of Object.keys(WAIVED)) {
    assert.ok(files.includes(rel), rel + ' is waived but no longer exists — drop its waiver, or a stale entry lingers with no signal')
  }
  const hits = []
  for (const rel of files) {
    let found = strangers(fs.readFileSync(path.join(ROOT, rel), 'utf8'), live)
    if (WAIVED[rel]) {
      for (const name of WAIVED[rel]) {
        assert.ok(found.includes(name), rel + ' no longer names /spec:' + name + ' — drop its waiver, or the next stale mention there hides behind it')
      }
      found = found.filter(n => !WAIVED[rel].includes(n))
    }
    for (const name of found) hits.push('/spec:' + name + ' @ ' + rel)
  }
  assert.deepStrictEqual(hits, [],
    'a mention of a deleted command sends a reader or a session to something that no longer runs: ' + hits.join('; '))
})

test('the live-command sweep flags a retired name and passes a live one', () => {
  const live = new Set(['fix'])
  const retired = 'gen' + 'esis-explore'
  assert.deepStrictEqual(strangers('run /spec:' + retired + ' then /spec:fix', live), [retired],
    'the sweep must catch a command name missing from the live set, or it passes every stale mention')
})
