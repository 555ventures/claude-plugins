'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { ROOT, runNode } = require('../helpers')

// Standing enforcement for spec/scripts/comment-narration.js's plugin scan over this
// repository's real tree.
// Owner: specs/20260902/01-comment-narration-gate.md, AC-20260902-01-13.
// Owner: specs/20260902/02-plugin-code-sweep.md, AC-20260902-02-1.
// Owner: specs/20260902/03-plugin-prose-sweep.md, AC-20260902-03-1 (D9: baseline reduced to
// the grounding contract file alone, at its real scanned count, once the prose sweep lands).
//
// This file does not classify any narration itself — it only invokes the scanner with the
// fleet's host and person literals against the tracked ratchet baseline and asserts the exit
// code, the tracked baseline's own code-group emptiness, the --json findings list, and the
// baseline's on-disk integrity. Every class, discriminator, and mode is pinned instead in
// tests/comment-narration/comment-narration.test.js against synthetic trees.

const BASELINE_ABS = path.join(ROOT, '.claude', 'comment-narration.baseline.json')
const HOSTS = 'upwell,prax,salon-os,salon os,hearwell,hiwora,zubu,bwm,cctop,autopilot-hub'
const PEOPLE = 'JJ,founder'
const CODE_GROUP_RE = /^(spec\/scripts|spec\/bin|scripts|tests)\//

test('AC-20260902-02-1/AC-20260902-03-1: the plugin scan over this repository with the fleet host and person literals exits 0 against the tracked baseline, the tracked baseline holds no code-group key, and --json names no code-group finding', () => {
  const args = ['--root', ROOT, '--hosts', HOSTS, '--people', PEOPLE]
  if (fs.existsSync(BASELINE_ABS)) args.push('--baseline', BASELINE_ABS)
  const r = runNode('scripts/comment-narration.js', args)
  assert.strictEqual(r.status, 0,
    'the plugin scan must exit 0 against the tracked baseline once the sweep leaves no code-group path unbaselined — a nonzero exit means unswept code-group narration remains, and stderr names the offending file: ' + r.stderr)

  const baseline = fs.existsSync(BASELINE_ABS) ? JSON.parse(fs.readFileSync(BASELINE_ABS, 'utf8')) : {}
  const baselineCodeGroupKeys = Object.keys(baseline).filter((k) => CODE_GROUP_RE.test(k))
  assert.deepStrictEqual(baselineCodeGroupKeys, [],
    'the tracked baseline must hold no key under a code-group directory (spec/scripts, spec/bin, scripts, tests) — a surviving key hides a regression the ratchet would otherwise catch: ' + JSON.stringify(baselineCodeGroupKeys))

  const jr = runNode('scripts/comment-narration.js', [...args, '--json'])
  assert.strictEqual(jr.status, 0,
    'the --json run of the same invocation must also exit 0 — a mismatch against the text-mode exit means --json and text mode disagree about the same scan: ' + jr.stderr)
  const parsed = JSON.parse(jr.stdout)
  const codeGroupFindings = parsed.findings.filter((f) => CODE_GROUP_RE.test(f.file))
  assert.strictEqual(codeGroupFindings.length, 0,
    'no finding may name a file under a code-group directory (spec/scripts, spec/bin, scripts, tests) — a surviving finding means unswept narration remains in a code-group file: ' + JSON.stringify(codeGroupFindings.slice(0, 5)))
})

test('AC-20260902-01-13: every path recorded in the tracked comment-narration baseline still exists on disk', () => {
  const baseline = fs.existsSync(BASELINE_ABS) ? JSON.parse(fs.readFileSync(BASELINE_ABS, 'utf8')) : {}
  const missing = Object.keys(baseline).filter((rel) => !fs.existsSync(path.join(ROOT, rel)))
  assert.deepStrictEqual(missing, [],
    'every baseline entry must name a file that still exists — a dead entry left behind by a delete or a rename must be removed from the baseline, never carried forward silently: ' + JSON.stringify(missing))
})
