'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const { ROOT, read } = require('../helpers')

// specs/20260820/08-config-name-ban.md (2026-08-20, D15 — orchestrator coverage ruling mid-build):
// AC-20260820-08-14 cites "the existing version-bump consistency test" as its carrier, but no test
// in tests/ read spec/.claude-plugin/plugin.json's version before this file (executed sweep, D15).
// The AC was uncovered and would have been reported so by ac-matrix.js at review. This file is
// that carrier — pinning the DURABLE invariant (semver shape, monotonic bump, changelog paragraph
// present and matching the manifest), never the literal version number: this repo's rules § Gotchas
// records that a spec's literal version-bump target is just that, a target, not a pin, because
// concurrent sessions in this repo race the same semver and land on the next free number instead.
// The comparison below is explicitly NUMERIC per component, not lexical/string — `7.9.0` sorting
// after `7.11.0` as a string is exactly the trap a naive `>` on the raw string falls into.

const PLUGIN_JSON_PATH = 'spec/.claude-plugin/plugin.json'
const FLOOR = [7, 11, 0] // the version this spec's own D13 target (7.12.0) must exceed

function parseSemver(v) {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(String(v))
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null
}

// Numeric, component-by-component — never a lexical/string comparison.
function compareSemver(a, b) {
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] - b[i]
  }
  return 0
}

function extractChangelogVersions(description) {
  const idx = description.indexOf('Changelog (last 3):')
  if (idx === -1) return null
  const tail = description.slice(idx)
  const re = /(\d+\.\d+\.\d+) — /g
  const versions = []
  let m
  while ((m = re.exec(tail)) !== null) versions.push(m[1])
  return versions
}

test('AC-20260820-08-14: spec/.claude-plugin/plugin.json parses as JSON and declares a version field matching strict MAJOR.MINOR.PATCH semver shape', () => {
  let manifest
  assert.doesNotThrow(() => { manifest = JSON.parse(read(PLUGIN_JSON_PATH)) },
    'spec/.claude-plugin/plugin.json must be valid JSON — every command and doctor check that reads this manifest for the plugin version fails to parse it otherwise')
  assert.strictEqual(typeof manifest.version, 'string',
    'plugin.json must declare a "version" field as a string — a missing or non-string version breaks every doctor/status check that reports the running plugin version')
  const parsed = parseSemver(manifest.version)
  assert.ok(parsed, 'the declared version "' + manifest.version + '" must match MAJOR.MINOR.PATCH ' +
    '(three dot-separated non-negative integers) — anything else is not a semver this repo\'s own bump discipline can compare against')
})

test('AC-20260820-08-14: the numeric semver comparator sorts 7.9.0 before 7.11.0 (the lexical trap a naive string comparison falls into), and the declared version is strictly greater than 7.11.0', () => {
  // Self-check the comparator against the exact trap this AC calls out: as strings, "7.9.0" >
  // "7.11.0" is true (lexical: '9' > '1'), which would let a real regression (a version that
  // never actually advanced past 7.11.x) read as a pass.
  assert.ok(compareSemver(parseSemver('7.9.0'), parseSemver('7.11.0')) < 0,
    'the comparator must rank 7.9.0 BELOW 7.11.0 numerically (minor 9 < minor 11) — a comparator that instead ranks it above (the lexical string-sort trap) would let a stale or regressed version pass this pin undetected')

  const manifest = JSON.parse(read(PLUGIN_JSON_PATH))
  const declared = parseSemver(manifest.version)
  assert.ok(declared, 'the declared version must already have passed the semver-shape pin above for this comparison to mean anything')
  assert.ok(compareSemver(declared, FLOOR) > 0,
    'the declared version ' + manifest.version + ' must be strictly greater than 7.11.0 — this spec (specs/20260820/08) is a behavior change and its own D13 requires a bump past the pre-spec version; a manifest left at or regressed below 7.11.0 means the version-bump discipline this repo\'s rules § Planning requires was skipped')
})

test('AC-20260820-08-14: the description field\'s "Changelog (last 3):" run lists exactly three versions', () => {
  const manifest = JSON.parse(read(PLUGIN_JSON_PATH))
  assert.strictEqual(typeof manifest.description, 'string',
    'plugin.json must declare a "description" field as a string — the changelog run this pin reads lives inside it, per this repo\'s "changelog is the description surface" convention')
  const versions = extractChangelogVersions(manifest.description)
  assert.ok(versions, 'the description must contain a "Changelog (last 3):" run — its absence means the changelog surface itself is missing, not just short')
  assert.strictEqual(versions.length, 3,
    'the Changelog (last 3): run must list exactly three version paragraphs, found ' + versions.length +
    ' (' + JSON.stringify(versions) + ') — fewer means a bump forgot to write its own paragraph (this spec\'s own D13 could have shipped that exact defect), and more means old entries were never trimmed off the rolling window')
})

test('AC-20260820-08-14: the leading changelog version equals the declared manifest version', () => {
  const manifest = JSON.parse(read(PLUGIN_JSON_PATH))
  const versions = extractChangelogVersions(manifest.description)
  assert.ok(versions && versions.length > 0,
    'the changelog run must have at least one entry for this comparison to mean anything — see the companion "exactly three versions" pin for that failure mode')
  assert.strictEqual(versions[0], manifest.version,
    'the first (leading) Changelog (last 3): entry must name the same version as the manifest\'s own "version" field (leading entry ' + versions[0] + ' vs declared ' + manifest.version + ') — a bump that changes the version number but writes its changelog paragraph under the OLD number (or forgets to write one at all, leaving the second-most-recent version leading) is the exact defect this pin exists to catch')
})
