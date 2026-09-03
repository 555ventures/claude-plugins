'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { ROOT, runNode } = require('../helpers')

// Standing enforcement for spec/scripts/comment-narration.js's plugin scan over this
// repository's real tree.
// Owner: specs/20260902/01-comment-narration-gate.md, AC-20260902-01-13.
// Owner: specs/20260902/04-host-generators-owner-citations.md, AC-20260902-04-5 (D8: the
// baseline file is deleted; the scan runs with no --baseline flag and finds zero repo-wide —
// this supersedes specs/20260902/02-plugin-code-sweep.md AC-20260902-02-1 and
// specs/20260902/03-plugin-prose-sweep.md AC-20260902-03-1, whose ratchet-baseline pins this
// test body replaces).
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

test('AC-20260902-04-5: the plugin scan over this repository with the fleet host and person literals, run with no --baseline flag, exits 0 with zero findings repo-wide, and the tracked baseline file is absent from disk', () => {
  const args = ['--root', ROOT, '--hosts', HOSTS, '--people', PEOPLE]
  const r = runNode('scripts/comment-narration.js', args)
  assert.strictEqual(r.status, 0,
    'D8: the plugin scan run with no --baseline flag must exit 0 once the sweep is complete repo-wide — a nonzero exit means narration remains and stderr names the offending file: ' + r.stderr)

  const jr = runNode('scripts/comment-narration.js', [...args, '--json'])
  assert.strictEqual(jr.status, 0,
    'D8: the --json run of the same no-baseline invocation must also exit 0 — a mismatch against the text-mode exit means --json and text mode disagree about the same scan: ' + jr.stderr)
  const parsed = JSON.parse(jr.stdout)
  assert.strictEqual(parsed.total, 0,
    'D8: the standing scan must find zero narration repo-wide with no baseline in play — a nonzero total means the sweep left findings that only a deleted ratchet was hiding: ' + JSON.stringify(parsed))

  assert.strictEqual(fs.existsSync(BASELINE_ABS), false,
    'D8: .claude/comment-narration.baseline.json must be absent from disk — a surviving file means the sweep is not actually complete and the plugin still leans on a ratchet instead of a zero-finding standing scan: ' + BASELINE_ABS)
})

test('AC-20260902-01-13: every path recorded in the tracked comment-narration baseline still exists on disk', () => {
  const baseline = fs.existsSync(BASELINE_ABS) ? JSON.parse(fs.readFileSync(BASELINE_ABS, 'utf8')) : {}
  const missing = Object.keys(baseline).filter((rel) => !fs.existsSync(path.join(ROOT, rel)))
  assert.deepStrictEqual(missing, [],
    'every baseline entry must name a file that still exists — a dead entry left behind by a delete or a rename must be removed from the baseline, never carried forward silently: ' + JSON.stringify(missing))
})
