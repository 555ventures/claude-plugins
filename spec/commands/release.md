---
description: Repeatable milestone release gate — deploy to staging, run executed checks against the deployed artifact, walk the shipped briefs' journeys, promote to production behind explicit confirmation, record one ledger row and a release report
argument-hint: [milestone note or version tag, optional]
---

# Spec Release: The Milestone Gate

Per-spec review proves a diff works on a dev boot; **release proves the milestone works as a
deployed product** (shared invariants § Release Stage). It is a **repeatable milestone
gate** — invoke it whenever a roadmap brief (or coherent group) lands and a version should go
out.

**Intended model: Sonnet.** Every claim in the release report must trace to an executed
command.

**Setup:** run `spec-paths shared-for release` and read its output. Read the host's
`.claude/spec.config.json`. No `.claude/spec.config.json` → STOP: `/spec:init` first.

## Input

`$ARGUMENTS` — optional milestone note or version tag (e.g. `milestone-4` or `briefs 05-07`).
Recorded in the release manifest and tag; never parsed for behavior.

**Releasing is deliberately user-invoked:** no command's Next pointer and no
`spec-status --next` derivation ever suggests running this command.

## Phase 0 — Grounding (first run interviews; later runs read)

1. **Config `release` block** (contract file § Release): `deployCommand` (staging),
   `stagingUrl`, `e2eCommand` (runs the e2e suite against `BASE_URL`), optional
   `promoteCommand`, `productionUrl`, `healthPath`. If absent, this is the first release:
   derive each value from the repo (deploy tooling config, CI files, e2e config) — most fields
   are fully derivable and are never asked about. Confirm only the fields the repo left
   genuinely ambiguous, in batched `AskUserQuestion` calls of **≤4 fields per call**, each
   glossed in plain English with the derived value recommended first — **host-declared, never
   invented** — then write the block. A host that deploys through CI-on-tag records that as its
   `promoteCommand` shape (e.g. a tag push) rather than a direct deploy.
2. **Derive what shipped** since the last `stage:"release"` ledger row (or since genesis, on
   the first release): `done` specs by close date, grouped by `brief:` stamp — start from
   `node "$(spec-paths spec-status)" --root . --json` (the shared derivation) and apply the
   close-date window. Present the shipped-brief list; this scopes the
   journey walks.
3. **Substrate delta:** diff the shipped specs' File Plans for new env vars, new third-party
   integrations, and new migrations since the last release — each becomes a checklist row in
   Phase 1.
4. **Migrations detection (runs on every Phase 0 execution, first run and delta runs alike):**
   when the repo carries a migrations directory (any of `drizzle/`, `prisma/migrations/`,
   `migrations/`, `db/migrate/`, `alembic/`, `supabase/migrations/`) and the config `release`
   block declares neither `migrationsCheck` nor the literal `"none"`, ask the user for the
   host's migrations-status command (one `AskUserQuestion` call, derived command recommended
   first) and write the answer — including an explicit decline as `"none"` — into config
   before Phase 1. **A runnable `migrationsCheck`** is this spec's single defined term, cited
   (never restated) everywhere below: config declares a `migrationsCheck` value other than
   `"none"` or absent.

## Phase 1 — Release manifest (first run heavy, later runs delta-only)

Maintain `.claude/release-manifest.json` — same shape as init's deliverable manifest
(`{claim, kind, target}` rows). Rows for: production env vars set (an `exec` row per
verifiable check, `inert` with reason where unverifiable from this host), monitoring/error-tracking reachable, live-mode third parties
(`inert` rows with the user's explicit confirmation recorded as the reason), domain/TLS
(`exec`: a curl against `productionUrl`). Later releases: re-check only Phase 0's substrate
delta plus rows whose targets changed. The manifest is committed. Any host declaring
`migrationsCheck` owes the Phase 2 `migrations` leg below (deliberately never here).

Phase 2's `stage` call validates this manifest as its own `substrate` leg (wrapping
`manifest-check.sh` — spec-paths release-legs); never hand-parse `manifest-check.sh`'s output
yourself.

## Phase 2 — Stage and observe (all executed, fail-closed)

Pick two fresh paths now (`mktemp` for the leg manifest, `mktemp -d` for retained per-leg
output):

```
node "$(spec-paths release-legs)" stage --root . --manifest {manifestPath} --out-dir {outDir}
```

Enforced by `release-legs.js` — its header comment is the contract (legs, exit codes, row
shapes). Its own summary (per-leg pass/fail lines, `RED_BLOCKING: <legs>` when any leg is red)
is the evidence a STOP report below quotes.

- **Exit 0:** continue to journey walks below.
- **Non-zero:** **STOP** — never promote over a leg that observed nothing (a red leg, or a
  `⚪` row with a final `UNMEASURED:` line); the printed remedy names the fix. Skip straight to
  Phase 4's `record` (below); it is the only path to a report from here.

**Journey walks** (session judgment — `release-legs.js` does not walk journeys): for each brief
shipped this milestone, walk its primary journey against staging (the brief's milestone-gate
observable, via the host's spec-verify skill, browser automation, or scripted API calls),
plus **one standing whole-product journey** (sign-up → core loop → the product's reason to
exist) every release regardless of what shipped. Record each as observed-pass / observed-fail
with the command or interaction trace. A journey that cannot be walked (no seed path, no
access) is a **blocking finding**, not a skip. Then record it:

```
node "$(spec-paths release-legs)" append --manifest {manifestPath} --leg journeys --walked <N> --failed <M>
```

Exit 0 (zero failed) → continue to Phase 3. Exit 1 (≥1 failed) → **STOP**, same as above: skip
to Phase 4's `record`.

Report a Phase 2 STOP via the shared shape: assemble `outcome: {anchor:'🚫', text:'{the derived
verdict word} — {leg} failed'}` and `next: {kind:'command', text:'route the defect to the
normal flow — /spec:fix for a repair (its commit records the escape row), or a spec'}`, write to a temp file, and run
`node "$(spec-paths report-render)" --slots <file>`, printing its output verbatim.

## Phase 3 — Promote (explicitly confirmed, never autonomous)

A milestone whose only gap is a `ci` leg that structurally never delivered a verdict does
**not** promote: `unmeasuredReason` (spec/scripts/lib/release-unmeasured.js) marks that leg
unmeasured, `stage`'s `UNMEASURED:` line names it, and Phase 2's exit 1 STOPs the flow before
this phase is ever reached — an unmeasured `ci` leg is an `UNVERIFIED` stop like any other,
never a silent promote. There is no path from here that carries it into a promotion.

1. `AskUserQuestion`: promote this build to production? (Include the Phase 2 observation
   summary in the question context.) Dismissed or declined → record the decline (exit 0 — a
   decline is not a failure):
   ```
   node "$(spec-paths release-legs)" append --manifest {manifestPath} --leg production --result skipped
   ```
   then **STOP** to Phase 4's `record`; staging stands, nothing promoted.
2. On yes: run `promoteCommand` (or instruct the user through their CI-on-tag flow when
   promotion is tag-driven and the tag push is theirs to make).
3. **Verify production serves:** ready check against `productionUrl` + `healthPath`, and
   confirm the deployed version/build id is the one staged. A promote that cannot be verified
   serving is a failure, not a success with a caveat. Record it:
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
   same call; it appends exactly ONE line to `.claude/spec-runs.jsonl`.

2. **Tag** the release (`git tag`) when the user confirmed promotion.

3. **Release report:** assemble the slots object — `outcome` (✅ `milestone green — {N} specs
   composed, staging + e2e passed, promoted` on CLEAN; 🚫 `UNVERIFIED — {the unmeasured legs,
   verbatim off stage's UNMEASURED: line}` when `record` derived UNVERIFIED over one or more
   unmeasured legs; 🚫 `UNVERIFIED — nothing was measured in production` when the promote
   question was dismissed or declined; 🚫 `{what blocked promotion}` for every other STOP),
   `bullets` (`- shipped: {briefs + specs}`, `- observed: {deploy,
   ready, migrations (pass/fail, when the leg ran), e2e counts, journeys walked with outcomes,
   ci verdict — one line each, read off `stage`'s and `append`'s own output}`,
   `- substrate: {rows checked / inert-declared} · production: {verification result}`),
   `warns` (`yours / the client's to do: {inert rows, verbatim — one line each}` whenever inert
   rows exist), and `next` — **unconditional, branched by outcome**: on CLEAN, the verbatim
   output of `node "$(spec-paths spec-status)" --root . --next` as `{kind: 'status-verbatim'}`;
   `{kind:'command', text: the remedy for what blocked promotion}` on 🚫. Write the slots to a temp file and run
   `node "$(spec-paths report-render)" --slots <file>`, printing its output verbatim.

## Rules

- **Never invent deploy mechanics** — every command comes from the config `release` block the
  user confirmed. No block, no guess.
- **Production actions are never autonomous:** promotion runs only behind a fresh per-run
  `AskUserQuestion`; never push commits or tags; never promote over a red or unverified
  staging. Approval in one release does not carry to the next.
- **A skip is reported by name, never silently green** — e2e skips, unwalkable journeys, and
  `inert` manifest rows all appear in the report explicitly.
- Defects found here route to the normal flow (`/spec:fix` — its commit records the escape
  row — or a spec) — release records and gates; it never becomes a repair entry point.
