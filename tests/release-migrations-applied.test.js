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

test('AC-20260815-07-4 (JJ-20260815-09): release doctrine states a declaring host\'s manifest owes/requires the migrations check', () => {
  assert.match(release, /migrations[\s\S]{0,300}(required|must carry|must contain|owes)/i,
    'the migrations row must be stated as an obligation on any host that declares migrationsCheck — a ' +
    'schema-carrying host that simply never writes it still passes the substrate leg, which is exactly ' +
    'how the four-migration gap escaped')
})

test('AC-20260815-07-5 (JJ-20260815-09): release doctrine places the migrations check after the deploy (Phase 2/post-deploy), with the coincidence rationale', () => {
  assert.match(release,
    /migrations[\s\S]{0,400}(after the deploy|post-deploy|Phase 2)|((after the deploy|post-deploy)[\s\S]{0,200}migrations)/i,
    'comparing journal count to applied count BEFORE the deploy cannot distinguish "the deploy ' +
    'applies migrations" from "the journal happens to match what was already applied" — which is ' +
    'exactly how the prior release went green while carrying the same missing wiring')
})

test('AC-20260815-07-7: release doctrine\'s Phase 0 names migrations-directory detection and the explicit "none" decline recording', () => {
  assert.match(release, /migrationsCheck[\s\S]{0,600}"none"/,
    'Phase 0 must detect a migrations directory (drizzle/prisma/migrations/db-migrate/alembic/supabase) ' +
    'and, when config has neither migrationsCheck nor "none", ask for the command and record a decline as ' +
    'the literal "none" — without this a host that adds its first migrations directory after release ' +
    'wiring exists silently never gets asked, reproducing the vacuous-green class this spec closes')
})

test('AC-20260815-07-8: release doctrine\'s Phase 2 blanket STOP sentence includes "migrations" in its red-row enumeration', () => {
  assert.match(release, /Any failure here \(a red [^)]*`migrations`[^)]*row\): \*\*STOP\.\*\*/,
    'the STOP sentence must enumerate migrations alongside deploy/ready/e2e/journeys/ci so a red ' +
    'migrations leg halts Phase 2 before CI/e2e/journeys spend their runs — a rationale-only claim of ' +
    'fail-fast without this enumeration edit does not actually stop anything, the identical gap the ' +
    'ci-leg spec 20260810/07 hit and fixed')
})
