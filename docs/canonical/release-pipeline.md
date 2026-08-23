# Release pipeline

How `/spec:release` divides its work between deterministic code and session judgment. The
semantics of the individual checks live in `release-integrity.md`; this file owns the split.

## The legs script

`/spec:release`'s deterministic legs, its manifest row grammar, and its verdict/ledger
invocation all live in `spec/scripts/release-legs.js` (resolved via `spec-paths release-legs`).
It has three subcommands, and the row grammar is documented in its own header rather than in
release.md's prose:

- `stage --root <dir> --manifest <path> [--out-dir <dir>]` — runs the pre-promote legs in
  dependency order: `substrate` + `ci` + `deploy` in parallel, then `ready` once `deploy` is
  green, then `migrations` (only when the config declares a runnable `migrationsCheck`) and
  `e2e` once `ready` is green. A red `deploy` or `ready` leaves its dependents unrun — absent
  rows, never fabricated ones, which `verdict.js` already reads as UNVERIFIED.
- `append --manifest <path> --leg journeys|production …` — the sole emitter for the two
  session-observed legs. It validates the closed grammar, derives the row's exit itself, and
  refuses a duplicate row for a leg already in the manifest.
- `record --root <dir> --manifest <path> [--milestone <s>] [--briefs N,N]` — the single
  `verdict.js --profile release --ledger` invocation point on **every** path: early-leg STOP,
  red-journeys STOP, declined promote, and the normal close alike. It derives
  `--require migrations` from the config itself, streams verdict.js's two lines verbatim, and
  exits with verdict.js's own exit.

Exit alphabet, all three subcommands: 0 = green/recorded · 1 = red · 2 = usage or precondition
failure, every 2 naming its remedy.

`record` being the sole verdict invocation point is the load-bearing property. Its predecessor
was a prose rule — "the STOP still runs verdict.js … the same call runs again in Phase 4" —
whose entire enforcement was session diligence, and the STOP path is exactly the one a bailing
session forgets. No path now reaches a report without a ledger row.

## What the session still owns

The grounding interview, release-manifest maintenance, the journey walks, the promote
confirmation, the tag, and the report. `release.md` carries these and cites the script for
everything else; it never hand-authors a manifest row.

## Counts are only ever derived from declared formats

The `e2e` leg derives `passed`/`failed`/`skipped` solely from the host's declared
`testCountPattern` / `skipReportPattern` capabilities. Where no format is declared, or a
declared pattern does not match, the slot carries typed unavailability
(`{"unavailable":"no-format-declared"}` / `{"unavailable":"pattern-no-match"}`) rather than a
number. On a red run both `passed` and `failed` are unavailable — no failure-count format
exists as a declared capability. The redness itself is unaffected, and the full runner output
is retained for the report. This is the assumed-count rule (UPWELL-20260716-02) applied to
every count slot: a model reading runner output to produce integers against no declared format
is not an observation.

## The ready check probes the deployment, not the boot

`ready` is a plain `curl -fsS --max-time 10 {stagingUrl}{healthPath}`, retried 3 times 5s
apart. `runtime.readyCheck` is deliberately not reused: the contract defines it as a command
probing the **local** boot, which is the wrong host for a deployed URL. The older
"readyCheck pattern applied to stagingUrl" phrasing was unimplementable as written.

## The feedback-brief flush is retired

Retired as of spec 7.21.0. Its plugin-side consumer (`/intake`) died in v7, core
§ Incident Policy forbids intake queues, and § Feedback Loop's carrier list never named briefs.
Host→plugin signal rides the run ledgers (swept by the fleet evidence reader) and
`[plugin]`-tagged Gotchas entries only. `/spec:doctor`'s `[plugin]`-Gotchas roll-up REPORT
survives; only the write-a-brief offer died.
