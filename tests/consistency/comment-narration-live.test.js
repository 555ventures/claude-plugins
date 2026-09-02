'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { ROOT, runNode } = require('../helpers')

// Standing enforcement for spec/scripts/comment-narration.js's plugin scan over this
// repository's real tree. Owner: specs/20260902/01-comment-narration-gate.md,
// AC-20260902-01-13.
//
// This file does not classify any narration itself — it only invokes the scanner with the
// fleet's host and person literals against the tracked ratchet baseline and asserts the exit
// code and the baseline's own on-disk integrity. Every class, discriminator, and mode is
// pinned instead in tests/comment-narration/comment-narration.test.js against synthetic
// trees.

const BASELINE_ABS = path.join(ROOT, '.claude', 'comment-narration.baseline.json')
const HOSTS = 'upwell,prax,salon-os,salon os,hearwell,hiwora,zubu,bwm,cctop,autopilot-hub'
const PEOPLE = 'JJ,founder'

test('AC-20260902-01-13: the plugin scan over this repository with the fleet host and person literals exits 0 against the tracked baseline', () => {
  const args = ['--root', ROOT, '--hosts', HOSTS, '--people', PEOPLE]
  if (fs.existsSync(BASELINE_ABS)) args.push('--baseline', BASELINE_ABS)
  const r = runNode('scripts/comment-narration.js', args)
  assert.strictEqual(r.status, 0,
    'the plugin scan must exit 0 against the tracked ratchet baseline — a nonzero exit means new narration debt was added or the ratchet was violated, and stderr names the offending file: ' + r.stderr)
})

test('AC-20260902-01-13: every path recorded in the tracked comment-narration baseline still exists on disk', () => {
  const baseline = fs.existsSync(BASELINE_ABS) ? JSON.parse(fs.readFileSync(BASELINE_ABS, 'utf8')) : {}
  const missing = Object.keys(baseline).filter((rel) => !fs.existsSync(path.join(ROOT, rel)))
  assert.deepStrictEqual(missing, [],
    'every baseline entry must name a file that still exists — a dead entry left behind by a delete or a rename must be removed from the baseline, never carried forward silently: ' + JSON.stringify(missing))
})
