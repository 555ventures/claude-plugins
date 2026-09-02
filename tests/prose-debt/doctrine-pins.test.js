'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { ROOT } = require('../helpers')

// specs/20260823/06-prose-debt-pruning.md (D3/D4): the § Gotchas entry cap
// (AC-20260823-06-1/2/3) is only half the fix — the two writers that append to it, review's
// CLOSE step and escape's step-6 `doctrine` branch, must run/name the at-cap eviction duty at
// append time, or the cap is enforced only retroactively by the suite. D4 closes the eviction
// enum: delete (wrong/dead-cited/mechanized), merge (durable truth → docs/canonical/{area}.md),
// mechanize (recurring class → a script). This test is deliberately RED until the doctrine
// worker lands both duties in this build — neither surface names any of the three fates today,
// only the SEPARATE (and unrelated) agent-memory disposal fates "carry, correct, or delete"
// pinned by AC-20260821-02-10, which this test must not be satisfied by.

const REVIEW = path.join(ROOT, 'spec/commands/review.md')
const ESCAPE = path.join(ROOT, 'spec/commands/escape.md')

// The three eviction fates must appear in this order (delete, then merge, then mechanize) —
// matching D4's own enumeration and the Behavior section's "(delete / merge into
// docs/canonical/{area}.md / mechanize)" — within a bounded window, so a stray "delete" from
// the unrelated agent-memory disposal fates ("carry, correct, or delete", which has no
// following merge/mechanize) can never satisfy this pin by accident.
const FATES_IN_ORDER = /delete[\s\S]{0,150}merge[\s\S]{0,200}mechanize/i

test('AC-20260823-06-4: review.md\'s CLOSE step states the at-cap eviction duty naming all three fates (delete / merge / mechanize)', () => {
  assert.ok(fs.existsSync(REVIEW), 'setup: spec/commands/review.md must exist for this pin to check anything')
  const review = fs.readFileSync(REVIEW, 'utf8')

  const start = review.indexOf('**Close (the CLOSE step).**')
  assert.ok(start !== -1,
    'setup: review.md must still carry its "Close (the CLOSE step)" bullet — without this ' +
    'anchor the eviction duty has nowhere defined to live')
  const end = review.indexOf('**Merge strategy and non-trivial conflicts', start)
  assert.ok(end !== -1,
    'setup: review.md must still carry the MERGE-step bullet immediately after CLOSE, used ' +
    'here only to bound the CLOSE section being checked')
  const closeSection = review.slice(start, end)

  assert.match(closeSection, /evict/i,
    'the CLOSE step must name the eviction duty explicitly ("evict") when the Gotchas section ' +
    'is at cap — a close that runs prose-cap.js but never states what to do on exit 1 leaves ' +
    'the evicting session to invent a remedy from nothing')
  assert.match(closeSection, FATES_IN_ORDER,
    'the CLOSE step must name all three eviction fates in order — delete, merge (into ' +
    'docs/canonical/{area}.md), mechanize — per D4\'s closed enum; an open-ended "clean it up" ' +
    'collapses back into the no-op this spec exists to close, and a match on the unrelated ' +
    '"carry, correct, or delete" agent-memory sentence (which has no merge/mechanize nearby) ' +
    'must not satisfy this pin')
})

test('AC-20260823-06-4: escape.md\'s step-6 `doctrine` branch states the at-cap eviction duty naming all three fates (delete / merge / mechanize)', () => {
  assert.ok(fs.existsSync(ESCAPE), 'setup: spec/commands/escape.md must exist for this pin to check anything')
  const escape = fs.readFileSync(ESCAPE, 'utf8')

  const start = escape.indexOf('`doctrine` → **draft the one-line Gotchas entry')
  assert.ok(start !== -1,
    'setup: escape.md step 6 must still carry its `doctrine` branch bullet — without this ' +
    'anchor the at-cap eviction ask has nowhere defined to live')
  const end = escape.indexOf('`enforcer` → recommend', start)
  assert.ok(end !== -1,
    'setup: escape.md step 6 must still carry the `enforcer` branch immediately after ' +
    '`doctrine`, used here only to bound the doctrine-branch section being checked')
  const doctrineSection = escape.slice(start, end)

  assert.match(doctrineSection, /evict/i,
    'the `doctrine` branch must name the eviction it displaces when the target section is at ' +
    'cap — presenting only the drafted append with no eviction ask lets escape push a section ' +
    'straight past its cap with no one ever told')
  assert.match(doctrineSection, FATES_IN_ORDER,
    'the `doctrine` branch must name all three eviction fates in order — delete, merge, ' +
    'mechanize — per D4\'s closed enum, the same as review.md\'s CLOSE step; an eviction ask ' +
    'with no enumerated fates collapses to "clean it up somehow"')
})
