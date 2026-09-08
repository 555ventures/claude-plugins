'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { ROOT } = require('../helpers')
const { BASE_KEYS, pinnedBaseCandidates } = require('../../spec/scripts/lib/base-derivation')

// A PIN ALWAYS BEATS A REF — and this file is why that stays true.
//
// The `build_base` → `diff_base` inversion was diagnosed and fixed THREE times, one consumer at a
// time: replay.js first, then spec-review-driver.js, and spec-build-driver.js never at all until
// a field run in a host repo surfaced it again. Each consumer carried its own spelling of the
// same ordering rule, so fixing one taught the others nothing. lib/base-derivation.js is now the
// single authority for the ORDER (never for validity — the per-consumer validity predicates
// genuinely differ, see that module's header), and these pins make a fourth private spelling
// impossible rather than merely discouraged.
//
// What this file deliberately does NOT check:
//   - the validity predicates themselves (ancestry in the build driver, non-degenerate range in
//     the review driver, ancestor-of-parent in replay) — those are per-consumer behavior with
//     their own behavioral tests;
//   - prose in spec/commands/*.md — covered by the doctrine assertion at the bottom for the one
//     line that stated the order backwards, not by a general prose scan;
//   - frontmatter WRITES of `build_base:` (the review driver rewrites that line, /git:enter-worktree
//     authors it) — this bans reading the field as a base candidate, never touching it at all.

const SCRIPTS = path.join(ROOT, 'spec/scripts')
const AUTHORITY = path.join(SCRIPTS, 'lib/base-derivation.js')

function jsFilesUnder(dir) {
  const out = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...jsFilesUnder(abs))
    else if (entry.isFile() && entry.name.endsWith('.js')) out.push(abs)
  }
  return out
}

// A frontmatter READ of build_base, in every shape the repo's accessors take:
//   fmVal('build_base') / fmValue(text, 'build_base') / fm['build_base'] / fm.build_base
const READ_SHAPES = [
  /fmVal(?:ue)?\s*\([^)]*['"]build_base['"]/,
  /\[\s*['"]build_base['"]\s*\]/,
  /\.build_base\b/,
]

test('no script under spec/scripts/ reads build_base as a base candidate except the authority', () => {
  const offenders = []
  for (const file of jsFilesUnder(SCRIPTS)) {
    if (file === AUTHORITY) continue
    const src = fs.readFileSync(file, 'utf8')
    for (const re of READ_SHAPES) {
      const m = re.exec(src)
      if (m) {
        offenders.push(path.relative(ROOT, file) + ' — ' + JSON.stringify(m[0]))
        break
      }
    }
  }
  assert.deepStrictEqual(offenders, [],
    'a base candidate must come from lib/base-derivation.js\'s pinnedBaseCandidates(), never from ' +
    'a private frontmatter read — that private spelling is what produced the same ordering bug ' +
    'three times. Offenders:\n  ' + offenders.join('\n  '))
})

test('every consumer of a base candidate imports the shared order', () => {
  const consumers = ['spec-build-driver.js', 'spec-review-driver.js', 'replay.js']
  for (const name of consumers) {
    const src = fs.readFileSync(path.join(SCRIPTS, name), 'utf8')
    assert.match(src, /require\('\.\/lib\/base-derivation'\)/,
      name + ' derives a base but does not import lib/base-derivation.js')
    assert.match(src, /pinnedBaseCandidates\s*\(/,
      name + ' imports the module but never calls pinnedBaseCandidates()')
  }
})

test('the order is pin before ref', () => {
  assert.deepStrictEqual(BASE_KEYS, ['diff_base', 'build_base'])
})

test('pinnedBaseCandidates prefers the pin, drops absent and blank values, carries the key', () => {
  assert.deepStrictEqual(
    pinnedBaseCandidates({ diff_base: 'a'.repeat(40), build_base: 'main' }),
    [{ key: 'diff_base', value: 'a'.repeat(40) }, { key: 'build_base', value: 'main' }],
    'the pin must come first even when both fields are present — this is the whole bug')
  assert.deepStrictEqual(pinnedBaseCandidates({ build_base: 'main' }),
    [{ key: 'build_base', value: 'main' }], 'a lone ref is still a candidate')
  assert.deepStrictEqual(pinnedBaseCandidates({ diff_base: '   ', build_base: 'main' }),
    [{ key: 'build_base', value: 'main' }], 'a whitespace-only pin is not a candidate')
  assert.deepStrictEqual(pinnedBaseCandidates({}), [])
  assert.deepStrictEqual(pinnedBaseCandidates({ diff_base: '  main  ' }),
    [{ key: 'diff_base', value: 'main' }], 'values are trimmed')
  assert.deepStrictEqual(pinnedBaseCandidates({ diff_base: 42 }), [],
    'a non-string value is not a candidate')
})

test('pinnedBaseCandidates accepts a lookup function as well as a map', () => {
  const fmVal = (k) => ({ diff_base: 'pinned', build_base: 'main' })[k]
  assert.deepStrictEqual(pinnedBaseCandidates(fmVal),
    [{ key: 'diff_base', value: 'pinned' }, { key: 'build_base', value: 'main' }])
})

test('the review command documents the pin before the ref', () => {
  const doc = fs.readFileSync(path.join(ROOT, 'spec/commands/review.md'), 'utf8')
  assert.ok(!/`build_base`\s*→\s*`diff_base`/.test(doc),
    'spec/commands/review.md states the base order backwards from its own driver — the prose is ' +
    'what the next person reads before touching base derivation')
  assert.match(doc, /`diff_base`\s*→\s*`build_base`/)
})
