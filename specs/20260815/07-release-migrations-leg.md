---
date: 2026-08-15
status: done
diff_base: 23fea7c8d6d2436bc1e5680db78aac867600edfd
open_markers: 0
risk: T3                 # edits spec/scripts/verdict.js — the sole derivation of the review/release verdict word (named T3 trigger) — plus the hash-stamped grounding contract
area: release-integrity
design: false
depends_on: ["specs/20260815/06-redcheck-load-attribution.md"]
depended_on_by: []
breaking: false
brief: n/a
---

# Release migrations leg: applied-vs-journal is only meaningful after the deploy

## Goal

A release can currently go CLEAN while the deployed database is missing every table the
milestone shipped (observed: hearwell, four migrations behind, journal 6 vs applied 2 —
INTAKE JJ-20260815-09), because migrations are one prose noun in release.md's Phase 1
manifest: nothing requires the row, and it runs **pre-deploy**, where "journal matches
applied" can hold by coincidence on a host whose deploy never applies migrations at all. Done
means: a host that declares a migrations check gets it **run after deploy+ready** as a
first-class release leg whose absence derives UNVERIFIED and whose red derives GATE_RED
through the existing verdict machinery — no new checker — and a host with a detected
migrations directory can no longer *silently* omit the declaration. The check command is
host-declared, never invented by the plugin.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | New optional config key `release.migrationsCheck`: a host command that exits 0 iff every journaled migration is applied on the database the just-deployed **staging** environment actually uses (e.g. `npm run db:migrate:status -- --url "$STAGING_DATABASE_URL"`). Two more sanctioned values: the literal string `"none"` = an explicit, recorded decline (leg skipped, never required); key absent entirely = legacy (pre-this-contract host). | Host-declared per the release-block pattern (grounding-contract § Release: "the plugin never invents deploy mechanics"); the `"none"` spelling mirrors `runtime: {"inert": …}` — an explicit exemption is auditable, a silent omission is not. |
| D2 | release.md Phase 0 (first-run/delta interview) gains a detection step that runs on **every** Phase 0 execution — first run AND delta runs alike, stated explicitly (refuter finding: a first-run-only ask never fires for the common case of a host adding its first migrations directory *after* release wiring exists): when the repo carries a migrations directory (any of `drizzle/`, `prisma/migrations/`, `migrations/`, `db/migrate/`, `alembic/`, `supabase/migrations/`) and config has neither `migrationsCheck` nor `"none"`, ask the user for the command (detect→recommend→confirm, reusing init.md's `skipReportPattern` interview pattern ~line 255 verbatim as the phrasing template) and write the answer — including a decline as `"none"` — into config before Phase 1. This Phase 0 paragraph is also where the spec's single defined term lives: **"a runnable migrationsCheck"** = config declares a value other than `"none"`/absent; every later conditional (D3's run-the-leg, D4's `--require`) cites this term rather than restating the condition. | Closes the silent-omission residual for every host that runs `/spec:release`; detection is a directory glob, not stack parsing, so unknown stacks fall through to the ask-nothing legacy path; the single defined term is the drift-guard against the two conditionals desyncing (refuter finding — a desync where the leg runs but `--require` is forgotten would read CLEAN over a red row). |
| D3 | release.md Phase 2 gains a `migrations` leg between step 2 (ready) and step 3 (CI): run `migrationsCheck` (when runnable per D2's defined term; otherwise the leg is neither run nor appended), append `{"leg":"migrations","exit":<exit>,"observed":"pass"|"fail"}` (pinned enum, matching deploy/ready's shape). Ordering is load-bearing and stated in the doctrine: the comparison is meaningful only **after the deploy**, because before it a host with no migrate step is indistinguishable from a host that is up to date. **The fail-fast half is a mechanism edit, not just a rationale** (refuter finding, both refuters, adopted — the identical gap the ci-leg spec 20260810/07 hit and fixed): Phase 2's blanket STOP sentence ("Any failure here (a red `deploy`/`ready`/`e2e`/`journeys`/`ci` row): STOP") gains `migrations` in its enumeration, so a red migrations leg halts Phase 2 before CI/e2e/journeys spend their runs; without that edit the "stops e2e wasting its run" claim would be asserted prose over a mechanism that doesn't deliver it. Phase 4's report template also names the leg: the observed-bullets list gains a migrations line (`pass`/`fail`) whenever the leg ran — never silently green in the human-facing report. | The ordering rule is the second half of the intake pin; the STOP-enumeration edit is what makes fail-fast true rather than claimed. |
| D4 | `spec/scripts/verdict.js` gains a repeatable `--require <leg>` flag: each occurrence appends the named leg to the active profile's required set AND (release profile) its blocking set; duplicates are de-duplicated, the flag never removes built-in legs, and the accumulator is the one deliberate departure from the scalar-overwrite pattern the other flags use (noted for the worker). Profile-generic semantics are part of the contract: on `--profile review` a `--require`d leg joins the required set only (not blocking), so a mis-wired review invocation derives UNVERIFIED forever — a safe, loud failure, documented, not an error. release.md's verdict invocation passes `--require migrations` iff the config declares **a runnable `migrationsCheck`** (D2's defined term, cited not restated). Absent leg + `--require` → UNVERIFIED via the existing missing-required-leg branch; red leg → GATE_RED via the existing blocking-leg branch. No new derivation, no new verdict word, and **deliberately no named ledger-row field**: the leg persists in the ledger's generic `legs[]` as `{"leg":"migrations","exit":<n>}` like any leg — exit code is the whole contract; the human-readable outcome lives in Phase 4's report line (D3), not the ledger (recorded as intentional; a `parseCounts`-style derivation would add a second place that must track the observed enum). | The whole fix rides machinery that already exists; a generic flag (rather than a hardcoded `migrations` special case) keeps verdict.js free of per-host conditionals and gives the next conditional leg a route that needs zero verdict.js edits. |
| D5 | release.md Phase 1's manifest clause "migrations path (`exec` against staging)" is **replaced in place**: the migrations row leaves the Phase 1 manifest list; in its place one sentence states that any host declaring `migrationsCheck` owes the Phase 2 `migrations` leg (required via `--require migrations`) and why pre-deploy comparison is refused. Phase 1 keeps all its other rows untouched. | The pre-deploy manifest row IS the measured false-green; leaving it alongside the leg would keep a second, vacuous-by-timing assertion of the same fact. |
| D6 | `spec/templates/grounding-contract.md` § Release gains optional `migrationsCheck` in the release-block key list (this spec's single contract edit; the contract-hash escalation trigger is pre-answered by this Decision — proceed, no consult). | Same deliberate-contract-change discipline as specs 05/06. |
| D7 | Scaffold-ledger: **extend** the existing "Release stage executed checks" row (~line 39 — the row that already absorbed the ci leg's 2026-08-10 addition, the exact structural precedent for a new release-stage leg; refuter finding: the draft cited the "Declared host capabilities" row, but that row's own text scopes itself to the `capabilities` config block and its key-level retire framing doesn't fit a conditional leg). The addition follows the ci-leg addition's format: dated, spec-cited, naming the `migrations` leg + `--require` mechanism; evidence gains the hearwell four-behind incident; the residual "a milestone shipping zero migrations passes trivially green" is recorded there as accepted-harmless. | The row that governs release-stage executed legs is where a release-stage executed leg belongs; the capabilities row documents config-block facts, not legs. |
| D8 | Version bump target `6.81.0` (target, not pin — next-free rule on race). **Resolved at build 2026-08-17 (A4 escalation, pre-answered): HEAD already carries `6.86.0`, so the bump target is `6.87.0`.** | Version-bump discipline. |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/verdict.js | MODIFY | scripts | D4: `--require <leg>` repeatable flag → required+blocking sets; header comment documents the flag; no other derivation change |
| spec/commands/release.md | MODIFY | doctrine | D2 Phase 0 every-run detection+ask+defined term; D3 Phase 2 leg (ordering wording satisfies the carrier pins) + `migrations` added to the blanket STOP enumeration + Phase 4 report observed-bullet; D5 Phase 1 clause replacement; D4 verdict invocation gains conditional `--require migrations`. The unconditional required-legs sentence (~line 58, pinned verbatim by tests/review/verdict-doctrine.test.js) stays byte-identical — a conditional clause may be APPENDED after the pinned span, never edited into it |
| spec/templates/grounding-contract.md | MODIFY | doctrine | D6: `migrationsCheck` added to the § Release optional keys |
| spec/doctrine/scaffold-ledger.md | MODIFY | doctrine | D7: extend the Declared-host-capabilities row |
| spec/doctrine/claims-baseline.json | MODIFY | other | Re-baseline for release.md/scaffold-ledger line-count changes |
| tests/release-migrations-applied.test.js | MODIFY | tests | Tag the two carrier tests AC-20260815-07-4/5 (edit-only; the D3/D5 release.md edits turn them green); add the D2 detection pin AC-20260815-07-7 |
| tests/verdict-require-leg.test.js | CREATE | tests | AC-20260815-07-1, AC-20260815-07-2, AC-20260815-07-3, AC-20260815-07-6 — exec tests running verdict.js against synthetic manifests in `tmpdir()` |
| spec/.claude-plugin/plugin.json | MODIFY | other | D8 bump + description changelog line |
| .claude/suite-baseline.json | MODIFY | other | Regenerate — the two carrier pins leave the sanctioned-red set |
| spec/INTAKE.md | MODIFY | doctrine | Row JJ-20260815-09: `Fixed in` = landed version, `Fix` = mechanism(spec/scripts/verdict.js), same commit |

## Contracts

```jsonc
// spec.config.json release block — new OPTIONAL key
"release": {
  "deployCommand": "…", "stagingUrl": "…", "e2eCommand": "…",
  "migrationsCheck": "npm run db:migrate:status -- --url \"$STAGING_DATABASE_URL\""
  // or "none" — explicit recorded decline; key absent = legacy (Phase 0 asks on next release
  // run when a migrations directory is detected)
}
```

```
verdict.js — CLI addition (D4)
  --require <leg>      # repeatable; adds <leg> to the active profile's required set and, on
                       # --profile release, to its blocking set; duplicates de-duplicated;
                       # never removes or reorders built-in legs
New manifest leg (release profile, conditional): {"leg":"migrations","exit":<int>,"observed":"pass"|"fail"}
```

## Behavior

- **Happy path:** deploy → ready → `migrationsCheck` exits 0 → `{"leg":"migrations","exit":0,"observed":"pass"}`
  → CI/e2e/journeys proceed → verdict invoked with `--require migrations` → CLEAN as today.
- **The incident replayed under this spec:** deploy succeeds, DB four migrations behind →
  `migrationsCheck` exits non-zero → leg red → `verdict --profile release --require migrations`
  → GATE_RED (blocking) — the milestone cannot read CLEAN.
- **Host never wired the row (the vacuous-green class):** with `migrationsCheck` declared but
  the leg never appended (a doctrine-execution slip), `--require migrations` + missing leg →
  UNVERIFIED — the slip is loud, not green.
- **Declined/legacy host:** `"none"` or absent key → leg neither run nor required → verdict
  input identical to today (regression surface, pinned by AC-3).
- **Residual (accepted, recorded in the ledger row):** a milestone that ships zero migrations
  passes the leg trivially — harmless, since there is nothing to be behind on; and a host that
  never runs `/spec:release` is untouched by D2's ask.

## Acceptance Criteria

<!-- AC-IDs namespaced AC-20260815-07-N. verdict exec tests build minimal release manifests in
     tmpdir() with all seven built-in legs green, then vary the migrations leg / flags. -->

- **AC-20260815-07-1**: WHEN `verdict.js --profile release --require migrations` reads a
  manifest whose seven built-in legs are green but which has **no** `migrations` row THE
  SYSTEM SHALL print `UNVERIFIED` (literal example: manifest = deploy/ready/e2e/journeys/
  substrate/production/ci all `exit:0` → word `UNVERIFIED`) → exec test in
  tests/verdict-require-leg.test.js
- **AC-20260815-07-2**: WHEN the same manifest carries `{"leg":"migrations","exit":1,"observed":"fail"}`
  THE SYSTEM SHALL print `GATE_RED` (a required conditional leg is blocking) → exec test in
  tests/verdict-require-leg.test.js
- **AC-20260815-07-3**: WHEN `--require` is **not** passed and the manifest has no `migrations`
  row THE SYSTEM SHALL CONTINUE TO derive exactly today's word (same seven-green manifest →
  `CLEAN`, or `CLEAN-with-qualifier` when ci observed `unavailable`) — declined/legacy hosts
  are byte-identical to today → exec test in tests/verdict-require-leg.test.js (green against
  pre-change verdict.js; the sanctioned-green regression pin)
- **AC-20260815-07-4**: WHEN release doctrine describes the migrations obligation THE SYSTEM
  SHALL state that a declaring host's manifest owes/requires the migrations check → existing
  carrier test 1 in tests/release-migrations-applied.test.js (tag)
- **AC-20260815-07-5**: WHEN release doctrine places the migrations check THE SYSTEM SHALL
  state it runs after the deploy (Phase 2/post-deploy), with the coincidence rationale →
  existing carrier test 2 in tests/release-migrations-applied.test.js (tag)
- **AC-20260815-07-6**: WHEN `verdict.js --require migrations` reads a green `migrations` row
  (`exit:0`) alongside seven green built-ins THE SYSTEM SHALL print `CLEAN` (the flag adds a
  requirement, never a new failure mode) → exec test in tests/verdict-require-leg.test.js
- **AC-20260815-07-7**: WHEN release doctrine's Phase 0 is read THE SYSTEM SHALL name the
  migrations-directory detection and the explicit `"none"` decline recording (regex pin:
  `/migrationsCheck[\s\S]{0,600}"none"/` over release.md) → doctrine pin in
  tests/release-migrations-applied.test.js
- **AC-20260815-07-8**: WHEN release doctrine's Phase 2 blanket STOP sentence is read THE
  SYSTEM SHALL include `migrations` in its red-row enumeration (the ci-gate-parity precedent
  pin: same sentence, same class of check) — a red migrations leg halts Phase 2 before
  CI/e2e/journeys spend their runs → doctrine pin in tests/release-migrations-applied.test.js

## Assumptions (escalation triggers)

- A1: Hosts' migration stacks expose a status/check command runnable against a URL or env-var
  target (drizzle-kit, prisma migrate status, rails db:migrate:status, alembic current all do)
  — **if false for a host:** the host declines with `"none"` at D2's ask; the residual is an
  explicit recorded decision, which is the contract's floor.
- A2: `STAGING_DATABASE_URL`-shaped targeting is expressible inside the host's declared
  command string (the plugin passes nothing) — **if false:** the host wraps it in a script and
  declares that; the plugin's contract is exit-code-only, deliberately.
- A3: No existing consumer invokes `verdict.js` with arguments that collide with `--require`
  (verified at plan time: the flag is new; release.md and review.md are the only invokers) —
  **if false:** STOP, the flag name changes.
- A4: Version 6.81.0 free at build time — else next free, log deviation.

## Rationale

The measured failure had two independent halves — the row was optional, and its timing made it
vacuous — and either half alone re-opens the hole, so the spec carries both (require via
`--require` + ordering via D3) as one landing unit. The design adds **no new checker**: the
missing-required-leg → UNVERIFIED and red-blocking-leg → GATE_RED branches in verdict.js are
untouched; D4 only widens what "required" contains, which is why a `--require` flag was chosen
over a config-reading verdict.js (rejected: verdict.js reading spec.config.json — it is
deliberately a pure manifest+args derivation, and giving it config access would make the sole
verdict derivation environment-dependent and harder to exec-test). Rejected: keeping the
Phase 1 manifest row alongside the leg — a pre-deploy journal comparison is the measured
false-green; two assertions of one fact where one is known-vacuous is how the next reader
picks the wrong one. Rejected: hard-requiring the leg for every host — the plugin cannot know
a host has a database; the D2 detection-ask converts silent omission into explicit `"none"`,
which is the strongest stack-agnostic floor available. Regression pin: AC-3 (`SHALL CONTINUE
TO`) runs green against pre-change verdict.js, pinning the legacy derivation byte-for-byte.
Fragile to watch: release.md's Phase 2 observed-string vocabulary is parsed verbatim by
verdict.js's ledger derivation — the new leg's `"pass"|"fail"` enum must stay exactly that.

Adversarial round (2 refuters): five findings adopted, marked in Decisions — the STOP
enumeration that the fail-fast rationale silently depended on (caught independently by both
refuters, with the ci-leg spec's identical fix as precedent; now D3 + AC-8), the wrong
scaffold-ledger row (D7 now extends the release-stage-checks row), the every-run detection
cadence (D2), the two-conditionals drift risk (D2's single defined term), and the
ledger-visibility question (resolved as deliberate in D4: exit code in `legs[]` is the
persisted contract, the human-readable outcome lives in the Phase 4 report line). The
executed evidence also confirmed AC-3's premise directly: current verdict.js derives CLEAN
over a red unrequired migrations row, which is exactly the hole `--require` closes. No
finding was rejected.

Collision sweep (lock obligation, `collision-closure --literal migrations`): literals hits
outside the File Plan (init.md, shared.md, the spec template, a style-audit doc) are the
generic migration vocabulary of tier rubrics and decomposition caps, not restatements of the
replaced Phase 1 clause — waived. Likely-tier pins (tests/intake/intake-discipline.test.js
over INTAKE.md/release.md, tests/terminal-observable-acs.test.js over
verdict.js/scaffold-ledger, tests/enforce/taxonomy.test.js over grounding-contract,
tests/claims-lint-baseline-path.test.js) verified at plan time not to close over the changed
surfaces — waived; the build Phase 4 whole-suite check adjudicates any miss.

Build deviation (folded in at review close 2026-08-17): D8's literal target `6.81.0` was
already taken at HEAD (`6.86.0`), so the build bumped to the next free `6.87.0` with D8's
changelog intent intact and amended D8 in place. A4 pre-answers this, and the class already
carries a `[host]` Gotcha in `.claude/rules/spec-pipeline.md` (concurrent sessions race the
same semver) — one-off, absorbed here, no new rules entry.

## Canonical Delta

docs/canonical/release-integrity.md (create if absent): add a section "Migrations leg" — a
host declaring `release.migrationsCheck` owes the post-deploy `migrations` leg
(`observed: pass|fail`), required into the release verdict via `--require migrations`
(absent → UNVERIFIED, red → GATE_RED); pre-deploy journal comparison is refused as
vacuous-by-timing; a detected migrations directory with no declaration triggers the Phase 0
ask, and a decline is recorded as the literal `"none"`.
