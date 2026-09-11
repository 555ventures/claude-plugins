'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const { ROOT, runNode } = require('../helpers')

// specs/20260907/02-ac-drift-backfill.md AC-20260907-02-1 / D5 — this repository holds zero
// AC-pin drift: every SHALL CONTINUE TO pin of a done spec dated on or after the expiry floor is
// cited by a test, and every [retired:] tag cites its retiring path. Unpinned criteria expired at close.
// Executed against this repository's own real tree via ac-drift.js, JSON and plain render.

test('AC-20260907-02-1: ac-drift.js --root <this repo> --json exits 0 with an empty findings array and scanned >= 87', () => {
  const res = runNode('scripts/ac-drift.js', ['--root', ROOT, '--json'])
  let out
  try {
    out = JSON.parse(res.stdout)
  } catch (e) {
    assert.fail(`ac-drift --json must print parseable JSON on stdout, or this repo's own drift ` +
      `gate cannot be read by anything that consumes it (status ${res.status}, stderr: ` +
      `${res.stderr}): ${e.message}`)
  }
  const detail = out.findings.map((f) => `${f.spec} ${f.ac} ${f.detail}`).join('\n')
  assert.strictEqual(out.findings.length, 0,
    `this repository must hold zero AC-pin drift — every done spec's criterion is cited by a ` +
    `test or carries a sanction ([retired:]/[oracle:]/[pre-green:]/SHALL CONTINUE TO); a ` +
    `nonzero count here means a split, waive, or retirement orphaned a criterion in the same ` +
    `change that caused it — offending rows:\n${detail}`)
  assert.strictEqual(res.status, 0,
    `ac-drift's own exit code must agree with an empty findings array — a nonzero exit here ` +
    `with zero findings means the script's exit derivation and its findings array have drifted ` +
    `apart (stderr: ${res.stderr})`)
  assert.ok(out.scanned >= 87,
    `AC-20260907-02-1 pins scanned >= 87 (the executed done-spec count at lock) — a much ` +
    `smaller number here means --root resolved to the wrong tree or the repo walk silently ` +
    `narrowed, never a genuine shrink in this repo's done specs — got scanned=${out.scanned}`)
})

test('AC-20260907-02-1: ac-drift.js --root <this repo> plain render exits 0 and prints no retired-uncited or uncovered-ac row', () => {
  const res = runNode('scripts/ac-drift.js', ['--root', ROOT])
  assert.strictEqual(res.status, 0,
    `the plain render must exit 0 on this repo the same as --json does — a status split ` +
    `between the two output formats means one of them is lying about this repo's drift state ` +
    `(stdout: ${res.stdout}, stderr: ${res.stderr})`)
  assert.ok(!/retired-uncited/.test(res.stderr),
    `the plain render must print no retired-uncited row — a [retired:] tag on a live surface ` +
    `or citing a path that isn't specs/ or docs/adr/ is exactly the drift this repo blocks on ` +
    `(stderr: ${res.stderr})`)
  assert.ok(!/uncovered-ac/.test(res.stderr),
    `the plain render must print no uncovered-ac row — an acceptance criterion with no citing ` +
    `test and no sanction is exactly the drift this repo blocks on (stderr: ${res.stderr})`)
})
