# Release integrity

Canonical behavior of the checks that stand between a shipped milestone and a promoted
production build.

## Migrations leg

A host declaring `release.migrationsCheck` in `.claude/spec.config.json` owes the post-deploy
`migrations` leg. The check command is host-declared — the plugin never invents deploy
mechanics — and its contract is exit-code-only: 0 iff every journaled migration is applied on
the database the just-deployed staging environment actually uses.

The leg runs in `/spec:release` Phase 2, **after** the deploy and the ready check, and appends
`{"leg":"migrations","exit":<exit>,"observed":{"result":"pass"|"fail"}}` to the run manifest —
every release leg's `observed` is a typed object, and the named ledger keys (`e2e`, `journeys`,
`substrate`, `ci`) copy that object **verbatim** rather than re-deriving it, so no observed key
is ever silently omitted. A red row
joins Phase 2's blanket STOP enumeration, so it halts the phase before CI, e2e, and the journey
walks spend their runs.

Pre-deploy comparison is refused as vacuous-by-timing: before the deploy, a host whose deploy
never applies migrations at all is indistinguishable from a host that is already up to date, so
"journal matches applied" can hold by coincidence. That coincidence is what let a release pass
green while the deployed database sat four migrations behind (journal 6 entries, 2 applied).

The leg is required into the release verdict via `verdict.js --require migrations`, passed iff
the config declares a runnable `migrationsCheck`. An absent leg derives `UNVERIFIED` through the
existing missing-required-leg branch; a red leg derives `GATE_RED` through the existing
blocking-leg branch. No new checker, no new verdict word, and deliberately no named ledger-row
field — the leg persists in the ledger's generic `legs[]` like any other, while the
human-readable `pass`/`fail` outcome lives in the Phase 4 report's observed bullets.

Two more sanctioned config values close the silent-omission hole. The literal string `"none"`
records an explicit decline; the key absent entirely marks a legacy, pre-contract host. Release
Phase 0 detects a migrations directory (`drizzle/`, `prisma/migrations/`, `migrations/`,
`db/migrate/`, `alembic/`, `supabase/migrations/`) on **every** execution — first run and delta
runs alike — and when the config declares neither a command nor `"none"`, asks the user and
writes the answer, including the decline, into config before Phase 1. A silent omission is not
auditable; an explicit exemption is.

## `--require <leg>` (verdict.js)

`verdict.js` accepts a repeatable `--require <leg>` flag. Each occurrence appends the named leg
to the active profile's required set and, on `--profile release` only, to its blocking set.
Duplicates de-duplicate; the flag never removes or reorders a profile's built-in legs. It is the
one accumulator flag — every other flag is scalar-overwrite.

The semantics are profile-generic by design. On `--profile review`, a `--require`d leg joins the
required set only, never the blocking set, so a mis-wired review invocation derives `UNVERIFIED`
forever rather than silently gating nothing — a safe, loud failure, documented rather than
treated as an error. Keeping the flag generic rather than special-casing `migrations` leaves
`verdict.js` free of per-host conditionals and gives the next conditional leg a route that needs
zero changes here.
