---
description: Repeatable milestone release gate — deploy to staging, run executed checks against the deployed artifact, walk the shipped briefs' journeys, promote to production behind explicit confirmation, record one ledger row and a release report
argument-hint: [milestone note or version tag, optional]
---

# Spec Release: The Milestone Gate

Per-spec review proves a diff works on a dev boot; **release proves the milestone works as a
deployed product** (shared invariants § Release Stage). It is a **repeatable milestone
gate** — invoke it whenever a roadmap brief (or coherent group) lands and a version should go
out — not a one-time handover ceremony. Running it per milestone is what keeps the final
client handover uneventful: cross-spec seams get executed every few specs instead of all at
once at the end, and the whole-product journey is observed in the milestone where any break
appeared.

**Intended model: Sonnet.** The work is orchestration against host-declared commands plus
executed observation; there is no contract to author. Every claim in the release report must
trace to an executed command — release inherits the pipeline's core property: no stage may
claim a protection it hasn't observed executing.

**Setup:** run `spec-paths shared-for release` and read its output. Read the host's
`.claude/spec.config.json`. No `.claude/spec.config.json` → STOP: `/spec:init` first.

## Input

`$ARGUMENTS` — optional milestone note or version tag (e.g. `v0.4.0` or `briefs 05-07`).
Recorded in the release manifest and tag; never parsed for behavior.

**Releasing is deliberately user-invoked:** no command's Next pointer and no
`spec-status --next` derivation ever suggests running this command — the human decides when a
milestone ships, not the pipeline.

## Phase 0 — Grounding (first run interviews; later runs read)

1. **Config `release` block** (contract file § Release): `deployCommand` (staging),
   `stagingUrl`, `e2eCommand` (runs the e2e suite against `BASE_URL`), optional
   `promoteCommand`, `productionUrl`, `healthPath`. If absent, this is the first release:
   derive each value from the repo (deploy tooling config, CI files, e2e config) — most fields
   are fully derivable and are never asked about. Confirm only the fields the repo left
   genuinely ambiguous, in batched `AskUserQuestion` calls of **≤4 fields per call**, each
   glossed in plain English with the derived value recommended first and the consequence of
   overriding it (e.g. "deploy target — {derived value} (Recommended: matches the CI/deploy
   config already in this repo) or a different URL/command (use only if this repo actually
   deploys somewhere that config doesn't show)") — **host-declared, never invented** — then
   write the block. A host that deploys through CI-on-tag records that as its
   `promoteCommand` shape (e.g. a tag push) rather than a direct deploy.
2. **Derive what shipped** since the last `stage:"release"` ledger row (or since genesis, on
   the first release): `done` specs by close date, grouped by `brief:` stamp — start from
   `node "$(spec-paths spec-status)" --root . --json` (the shared derivation) and apply the
   close-date window. Present the shipped-brief list; this scopes the
   journey walks.
3. **Substrate delta:** diff the shipped specs' File Plans for new env vars, new third-party
   integrations, and new migrations since the last release — each becomes a checklist row in
   Phase 1 (only the delta is re-checked on later runs; the first run checks everything).
4. **Migrations detection (runs on every Phase 0 execution, first run and delta runs alike):**
   when the repo carries a migrations directory (any of `drizzle/`, `prisma/migrations/`,
   `migrations/`, `db/migrate/`, `alembic/`, `supabase/migrations/`) and the config `release`
   block declares neither `migrationsCheck` nor the literal `"none"`, ask the user for the
   host's migrations-status command (detect → recommend → confirm, the same interview pattern
   as init's `capabilities.skipReportPattern` step: propose a derived command as the
   recommended-first default, glossed in plain English with the consequence of overriding it,
   confirm or override in one `AskUserQuestion` call) and write the answer — including an
   explicit decline as `"none"` — into config before Phase 1. **A runnable `migrationsCheck`**
   is this spec's single defined term, cited (never restated) everywhere below: config declares
   a `migrationsCheck` value other than `"none"` or absent.

## Phase 1 — Release manifest (first run heavy, later runs delta-only)

Maintain `.claude/release-manifest.json` — same shape as init's deliverable manifest
(`{claim, kind, target}` rows). Rows for: production env vars set (an `exec` row per
verifiable check, `inert` with reason where unverifiable from this host), monitoring/error-tracking reachable, live-mode third parties
(payments/email/OAuth — `inert` rows with the user's explicit confirmation recorded as the
reason where no mechanical check exists), domain/TLS (`exec`: a curl against
`productionUrl`). First release: build the full manifest with the user. Later releases:
re-check only Phase 0's substrate delta plus rows whose targets changed. The manifest is
committed — it doubles as the handover document: a list of verified observations, not claims.
Any host declaring `migrationsCheck` owes the Phase 2 `migrations` leg below (deliberately
never here): a pre-deploy comparison of applied-vs-journal migrations cannot distinguish a
deploy that actually applies migrations from a journal that happens to already match what's
applied, which is exactly the coincidence that let a prior release pass green while the
deployed database sat four migrations behind. The check runs after the deploy, in Phase 2,
where the comparison is finally meaningful.

Phase 2's `stage` call validates this manifest as its own `substrate` leg (wrapping
`manifest-check.sh` — spec-paths release-legs) and fails closed, naming the remedy, if it's
missing or malformed. Build it correctly here; `stage` below confirms it, it never guesses at
it — never hand-parse `manifest-check.sh`'s output yourself, that transcription lives in the
script now.

## Phase 2 — Stage and observe (all executed, fail-closed)

Pick two fresh paths now (`mktemp` for the leg manifest, `mktemp -d` for retained per-leg
output) — every leg below is executed and recorded through them, never re-derived by hand:

```
node "$(spec-paths release-legs)" stage --root . --manifest {manifestPath} --out-dir {outDir}
```

This one call runs every deterministic leg — `substrate` (the Phase 1 manifest check),
`deploy` (`deployCommand`), `ready` (a probe of the deployed `stagingUrl` + `healthPath`),
`migrations` (only when Phase 0 found a runnable `migrationsCheck`), `e2e` (`{e2eCommand}`
against `BASE_URL={stagingUrl}`), and `ci` (the release commit's CI verdict, via `ci-query.js`,
polling until it resolves or times out) — in the dependency order, with the exit codes,
retained output, and row shapes documented in `spec-paths release-legs`'s own header comment;
this doc does not restate them. Its own summary (per-leg pass/fail lines, `RED_BLOCKING:
<legs>` when any leg is red) is the evidence a STOP report below quotes.

- **Exit 0:** every leg it ran was green — continue to journey walks below.
- **Exit 1:** at least one leg red — **STOP.** Never promote over a red staging or a red
  release-commit CI run. Skip straight to Phase 4's `record` (below); it is the only path to a
  report from here.
- **Exit 2:** a usage or precondition failure (unreadable config, a missing `release` block or
  required key, a missing/invalid `.claude/release-manifest.json`, a non-empty `--manifest`) —
  the printed remedy names the fix (Phase 0's interview, or Phase 1's manifest). Same STOP path
  as exit 1.

**Journey walks** (session judgment — `release-legs.js` does not walk journeys): for each brief
shipped this milestone, walk its primary journey against staging (the brief's milestone-gate
observable, via the host's spec-verify skill, browser automation, or scripted API calls —
whatever the skill declares), plus **one standing whole-product journey** (sign-up → core loop
→ the product's reason to exist) every release regardless of what shipped. Record each as
observed-pass / observed-fail with the command or interaction trace. A journey that cannot be
walked (no seed path, no access) is a **blocking finding**, not a skip. Then record it:

```
node "$(spec-paths release-legs)" append --manifest {manifestPath} --leg journeys --walked <N> --failed <M>
```

Exit 0 (zero failed) → continue to Phase 3. Exit 1 (≥1 failed) → **STOP**, same as above: skip
to Phase 4's `record`.

Report a Phase 2 STOP via the shared shape: assemble `outcome: {anchor:'🚫', text:'{the derived
verdict word} — {leg} failed'}` and `next: {kind:'command', text:'route the defect to the
normal flow — direct fix or a spec, or /spec:escape (foundBy: later-spec,
preventedBy: runtime-leg) if it escaped a CLEAN review'}`, write to a temp file, and run
`node "$(spec-paths report-render)" --slots <file>`, printing its output verbatim:

```report
🚫 **{the derived verdict word} — {leg} failed**
Next: route the defect to the normal flow — direct fix or a spec, or /spec:escape if it escaped a CLEAN review
```

## Phase 3 — Promote (explicitly confirmed, never autonomous)

A milestone whose only gap is a `ci` leg that structurally never delivered a verdict (`stage`'s
summary flags this) still derives plain `CLEAN` (v7: the qualifier word is retired) and
promotes normally, carrying that observation into the promote question's context and the
Phase 4 report — the ledger row's `ci` field is the durable carrier of the observation.

1. `AskUserQuestion`: promote this build to production? (Include the Phase 2 observation
   summary in the question context.) Dismissed or declined → record the decline (exit 0 — a
   decline is not a failure):
   ```
   node "$(spec-paths release-legs)" append --manifest {manifestPath} --leg production --result skipped
   ```
   then **STOP** to Phase 4's `record`; staging stands, nothing promoted.
2. On yes: run `promoteCommand` (or instruct the user through their CI-on-tag flow when
   promotion is tag-driven and the tag push is theirs to make — **never push for them**).
3. **Verify production serves:** ready check against `productionUrl` + `healthPath`, and
   confirm the deployed version/build id is the one staged (the health endpoint's version
   field, or the platform's deployment id). A promote that cannot be verified serving is a
   failure, not a success with a caveat. Record it:
   ```
   node "$(spec-paths release-legs)" append --manifest {manifestPath} --leg production --result <verified|failed>
   ```
   A `failed` result (or a nonzero `append` exit) is a Phase 3 failure — **STOP** via the same
   renderer shape as Phase 2 above (`outcome: {anchor:'🚫', text:'GATE_RED — production
   verification failed'}`, `next: {kind:'command', text:'verify {productionUrl}/{healthPath}
   serves the staged build, then re-run /spec:release'}`), then Phase 4's `record`.

## Phase 4 — Record & report

1. **Verdict + ledger row** — run:
   ```
   node "$(spec-paths release-legs)" record --root . --manifest {manifestPath} --milestone {milestone} --briefs {shipped brief numbers, comma-separated}
   ```
   This is the **sole** verdict/ledger invocation point on every path — an early Phase 2 STOP,
   a red-journeys STOP, a declined or failed promote, and this normal close all run the exact
   same call (one origin, never a second, independent derivation). It derives `--require
   migrations` itself from the config (Phase 0's defined term — never a flag this doc passes),
   streams `verdict.js`'s own two lines verbatim (line 1 the word — `CLEAN`, `GATE_RED`, or
   `UNVERIFIED` — line 2 the ledger row), and appends exactly ONE line to
   `.claude/spec-runs.jsonl`. `--milestone`/`--briefs` are the only fields this doc supplies
   (the `$ARGUMENTS` note / Phase 0 step 2's shipped-brief list) — every other field in the row
   is the manifest's observed data, carried through unchanged. A null-status child death exits
   2 naming the remedy — never a silent pass.

2. **Tag** the release (`git tag`) when the user confirmed promotion — never push the tag;
   pushing remains theirs.

3. **Release report:** assemble the slots object — `outcome` (✅ `milestone green — {N} specs
   composed, staging + e2e passed, promoted` on CLEAN; 🚫 `{what blocked
   promotion}` otherwise), `bullets` (`- shipped: {briefs + specs}`, `- observed: {deploy,
   ready, migrations (pass/fail, when the leg ran), e2e counts, journeys walked with outcomes,
   ci verdict — one line each, read off `stage`'s and `append`'s own output}`,
   `- substrate: {rows checked / inert-declared} · production: {verification result}`),
   `warns` (`ci never delivered a verdict on this commit` when the ci leg observed no
   `conclusion`, plus
   `yours / the client's to do: {inert rows, verbatim — one line each}` whenever inert rows
   exist), and `next` — **unconditional, branched by outcome** (never the old
   "(optional)" framing): on CLEAN, the verbatim output of
   `node "$(spec-paths spec-status)" --root . --next` as `{kind: 'status-verbatim'}`;
   `{kind:'command', text: the remedy for what blocked promotion}` on 🚫. Write the slots to a temp file and run
   `node "$(spec-paths report-render)" --slots <file>`, printing its output verbatim:

   ```report
   ✅ **milestone green — {N} specs composed, staging + e2e passed, promoted**
      (or: 🚫 **{what blocked promotion}**)
   - shipped: {briefs + specs}
   - observed: {deploy, ready, migrations (pass/fail, when the leg ran), e2e counts, journeys walked with outcomes, ci verdict — one line each}
   - substrate: {rows checked / inert-declared} · production: {verification result}
   ⚠️ ci never delivered a verdict on this commit    (when the ci leg observed no conclusion)
   ⚠️ yours / the client's to do: {inert rows, verbatim — one line each}
   Next: {spec-status --next, verbatim}    (or, on 🚫: the remedy for what blocked promotion)
   ```

   Every line traces to an executed command — the report is the client-facing artifact, so
   no claim may outrun its observation.

## Rules

- **Never invent deploy mechanics** — every command comes from the config `release` block the
  user confirmed. No block, no guess.
- **Production actions are never autonomous:** promotion runs only behind a fresh per-run
  `AskUserQuestion`; never push commits or tags; never promote over a red or unverified
  staging. Approval in one release does not carry to the next.
- **A skip is reported by name, never silently green** — e2e skips, unwalkable journeys, and
  `inert` manifest rows all appear in the report explicitly.
- Defects found here route to the normal flow (fix/spec + `/spec:escape` when they escaped a
  review) — release records and gates; it never becomes a repair entry point.
- `AskUserQuestion` dismissed → STOP.
