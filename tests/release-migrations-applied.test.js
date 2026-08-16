'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const { read } = require('./helpers')

// HEARWELL-20260814-02 (hearwell brief 2026-08-14, release 2026-08-14): /spec:release Phase 1
// names "migrations path (`exec` against staging)" in prose, but nothing requires a host's release
// manifest to actually carry such a row, and nothing distinguishes "migrations are applied" from
// "migrations are applied BY THE DEPLOY".
//
// Observed: the deployed database was four migrations behind — the journal held 6 entries,
// drizzle.__drizzle_migrations held 2, and every table that milestone shipped was absent from the
// live database. The PREVIOUS release passed its substrate leg with checked=10 failed=0 carrying
// the identical missing wiring, green only because the journal then happened to hold exactly the
// two migrations already applied. The gap became visible only because that host chose to invent a
// migrations-applied row for itself; a host that never writes the row, or writes one that passes
// vacuously by coincidence, gets a green substrate leg and a CLEAN milestone while shipping code
// whose tables do not exist.
//
// Fix contract, two halves — a row-presence obligation for any host declaring a database, and an
// ORDERING rule: the applied-vs-journal comparison is meaningful only AFTER the deploy, since
// before it a host with no migrate step at all is indistinguishable from a host that is up to
// date. Both halves are load-bearing: presence without ordering still passes vacuously.

const release = read('spec/commands/release.md')

test('JJ-20260815-09: release requires a migrations-applied manifest row from any host whose config declares a database', () => {
  assert.match(release, /migrations[\s\S]{0,300}(required|must carry|must contain|owes)/i,
    'the migrations row is listed as one example among several, so a schema-carrying host that ' +
    'simply never writes it still passes the substrate leg — the check that would have caught a ' +
    'four-migration gap existed only because one host invented it')
})

test('JJ-20260815-09: the migrations check is asserted after the deploy, so a host with no migrate step fails instead of passing by coincidence', () => {
  assert.match(release,
    /migrations[\s\S]{0,400}(after the deploy|post-deploy|Phase 2)|((after the deploy|post-deploy)[\s\S]{0,200}migrations)/i,
    'comparing journal count to applied count BEFORE the deploy cannot distinguish "the deploy ' +
    'applies migrations" from "the journal happens to match what was already applied" — which is ' +
    'exactly how the prior release went green while carrying the same missing wiring')
})
