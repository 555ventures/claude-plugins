'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { ROOT } = require('../helpers')
const { stylesheetTargets, linksWireRegister } = require('../../spec/scripts/lib/wire-register')

// specs/20260908/07-one-wire-register-predicate.md D1/D9: spec/scripts/lib/wire-register.js is
// the single authority for "does this page apply the wireframe register as a stylesheet?" — four
// call sites hand-rolled their own answer and diverged on ten of twenty-four link forms. This
// file pins the authority's two exports directly (D10: the full matrix lives here, never
// re-spawned per call site) and bans a fifth private spelling of the rule outright, modelled on
// tests/consistency/base-derivation.test.js.

const SCRIPTS = path.join(ROOT, 'spec/scripts')
const AUTHORITY = path.join(SCRIPTS, 'lib/wire-register.js')

function jsFilesUnder(dir) {
  const out = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...jsFilesUnder(abs))
    else if (entry.isFile() && entry.name.endsWith('.js')) out.push(abs)
  }
  return out
}

// AC-20260908-07-1: stylesheetTargets(html) — every URL the page applies as a stylesheet, and
// no other URL, across every quoting form, attribute order, case, and @import shape the
// Contracts block names, plus the four never-a-target shapes and the two comment-stripped ones.
const TARGETS_TABLE = [
  ['<link rel="stylesheet" href="../../wire/tokens.css">', ['../../wire/tokens.css']],
  ["<link rel='stylesheet' href='a.css'>", ['a.css']],
  ['<link rel=stylesheet href=b.css>', ['b.css']],
  ['<LINK REL="STYLESHEET" HREF="c.css">', ['c.css']],
  ['<link href="d.css" rel="stylesheet">', ['d.css']],
  ['<style>@import "e.css";</style>', ['e.css']],
  ['<style>@import url(f.css);</style>', ['f.css']],
  ['<style>@import url("g.css");</style>', ['g.css']],
  ['<link href="h.css">', []],
  ['<link rel="icon" href="i.png">', []],
  ['<script src="j.js"></script>', []],
  ['<a href="k.css">x</a>', []],
  ['<!-- <link rel="stylesheet" href="l.css"> -->', []],
  ['<!-- @import "m.css"; -->', []],
]

test('AC-20260908-07-1: stylesheetTargets(html) returns every URL the page applies as a stylesheet and no other URL, across every quoting form, attribute order, case and @import shape', () => {
  for (const [html, expected] of TARGETS_TABLE) {
    assert.deepStrictEqual([...stylesheetTargets(html)].sort(), [...expected].sort(),
      'stylesheetTargets(' + JSON.stringify(html) + ') must equal ' + JSON.stringify(expected) +
      ' — a wrong member here is read by every one of the four call sites this module now serves')
  }
})

// AC-20260908-07-2/D10: the full twenty-four-form behaviour matrix, executed directly against
// the authority rather than re-spawned per consumer (A3's per-file test budget). Ten forms are
// "wire" segment (refusing = true); fourteen are not.
const LINKS_TABLE = [
  ['<link rel="stylesheet" href="../../wire/tokens.css">', true],
  ["<link rel='stylesheet' href='../../wire/tokens.css'>", true],
  ['<link rel=stylesheet href=../../wire/tokens.css>', true],
  ['<style>@import "../../wire/tokens.css";</style>', true],
  ['<style>@import url(../../wire/tokens.css);</style>', true],
  ['<LINK REL="STYLESHEET" HREF="../../wire/tokens.css">', true],
  ['<link href="../../wire/tokens.css" rel="stylesheet">', true],
  ['<link rel="stylesheet" href="/wire/tokens.css">', true],
  ['<link rel="stylesheet" href="wire/tokens.css">', true],
  ['<link\n  rel="stylesheet"\n  href="../../wire/tokens.css">', true],
  ['<link href="../../wire/tokens.css">', false],
  ['<link rel="icon" href="../../wire/favicon.png">', false],
  ['<link rel="preload" as="style" href="../../wire/tokens.css">', false],
  ['<link rel="stylesheet" href="../my-wire/x.css">', false],
  ['<link rel="stylesheet" href="../v.wire/x.css">', false],
  ['<link rel="stylesheet" href="../my_wire/x.css">', false],
  ['<link rel="stylesheet" href="../hardwire/x.css">', false],
  ['<link rel="stylesheet" href="../firewire/x.css">', false],
  ['<link rel="stylesheet" href="../wired/x.css">', false],
  ['<link rel="stylesheet" href="../wireframe/x.css">', false],
  ['<link rel="stylesheet" href="../rewire/x.css">', false],
  ['<!-- re-rendered from the gray wire/ register -->', false],
  ['<script src="../../wire/x.js"></script>', false],
  ['<a href="../../wire/tokens.css">x</a>', false],
]

test('AC-20260908-07-2: linksWireRegister(html) is true for exactly the ten forms that link the wireframe register as a whole path segment and false for the other fourteen forms in the twenty-four-form matrix', () => {
  const refusing = LINKS_TABLE.filter(([, expected]) => expected)
  const nonRefusing = LINKS_TABLE.filter(([, expected]) => !expected)
  assert.strictEqual(refusing.length, 10, 'the matrix must carry exactly ten refusing forms per the Behavior table — a miscount here invalidates the whole pin')
  assert.strictEqual(nonRefusing.length, 14, 'the matrix must carry exactly fourteen non-refusing forms per the Behavior table — a miscount here invalidates the whole pin')
  for (const [html, expected] of LINKS_TABLE) {
    assert.strictEqual(linksWireRegister(html), expected,
      'linksWireRegister(' + JSON.stringify(html) + ') must be ' + expected +
      ' — "wire" must be a whole path segment (preceded by "/" or the start of the value), never a `\\b` word-boundary substring')
  }
  // The two forms Behavior lists with no pre-image column — a commented-out link/import applies
  // nothing, so both stay false after the move.
  assert.strictEqual(linksWireRegister('<!-- <link rel="stylesheet" href="../../wire/tokens.css"> -->'), false,
    'a commented-out <link> into wire/ must not read as linking the register — comments are stripped before scanning')
  assert.strictEqual(linksWireRegister('<!-- @import "../../wire/tokens.css"; -->'), false,
    'a commented-out @import of the register must not read as linking it — comments are stripped before scanning')
})

// AC-20260908-07-7/D9: the pin's discriminator is the source text `wire\/` — the escaped
// separator every private copy of the rule spelled (WIRE_LINK_RE, WIRE_SEGMENT_RE's own regex
// literal, and the two journey-drawn substring regexes). An ordinary comment spelling the path
// `wire/` unescaped is untouched, so the pin cannot false-fire on prose.
test('AC-20260908-07-7: no .js file under spec/scripts/ other than lib/wire-register.js contains the source text "wire\\/" — a private spelling of the rule is banned outright', () => {
  const offenders = []
  for (const file of jsFilesUnder(SCRIPTS)) {
    if (file === AUTHORITY) continue
    const src = fs.readFileSync(file, 'utf8')
    if (src.includes('wire\\/')) offenders.push(path.relative(ROOT, file))
  }
  assert.deepStrictEqual(offenders, [],
    'a stylesheet-target predicate must come from lib/wire-register.js\'s exports, never a private ' +
    'regex spelling — that private spelling is what produced four diverging answers to the same ' +
    'question. Offenders:\n  ' + offenders.join('\n  '))
})

// AC-20260908-07-8/D9: both consumers import the shared authority and call at least one export.
test('AC-20260908-07-8: design-atlas.js and mocks-driver.js each require lib/wire-register and call at least one of its exports', () => {
  const consumers = ['design-atlas.js', 'mocks-driver.js']
  for (const name of consumers) {
    const src = fs.readFileSync(path.join(SCRIPTS, name), 'utf8')
    assert.match(src, /require\('\.\/lib\/wire-register'\)/,
      name + ' reads a stylesheet-target predicate but does not import lib/wire-register.js')
    assert.match(src, /\b(?:stylesheetTargets|linksWireRegister)\s*\(/,
      name + ' imports the module but never calls stylesheetTargets(...) or linksWireRegister(...)')
  }
})
