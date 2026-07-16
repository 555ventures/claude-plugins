---
description: Plugin-repo-side triage of host feedback — sweep local hosts' feedback briefs, [plugin] gotchas, and escape rows; verify each finding by re-executing its evidence in the host repo; disposition every finding into spec/INTAKE.md (accepted = failing test first)
argument-hint: [host repo path, optional — default sweeps ~/Projects/*]
---

# Intake: Host Findings → Plugin Backlog

This command runs **in the claude-plugins repo only** — it is dev tooling for the plugin's
own improvement loop (shared invariants § Feedback Loop), deliberately NOT shipped in
`spec/commands/`. Hosts emit; this repo collects. Natural cadence: before cutting a plugin
release, and whenever sitting down to work on the plugin.

**The contract:** an accepted finding becomes a **failing test first** — in `tests/`,
against a fixture host under `tests/fixtures/` where the finding needs one — before any fix
lands. The test is the backlog item, the duplicate key, and the regression guard. No test,
no acceptance. `spec/INTAKE.md` is the ledger (it ships with the plugin so host doctors can
read `Fixed in`); its header states the same contract — this file and that one must never
disagree.

## Phase 1 — Sweep (read-only, across local hosts)

Target `$ARGUMENTS` if a path was given, else every git repo under `~/Projects/*` that has a
`.claude/spec.config.json`. Per host, collect:

1. **Unstamped briefs** — `docs/spec-feedback/*.md` findings rows with no `intake:` stamp.
2. **`[plugin]` gotchas** — pipeline rules § Gotchas entries tagged `[plugin]` not already
   covered by a stamped brief row or an existing INTAKE.md row.
3. **Escape rows** — `.claude/spec-runs.jsonl` `stage:"escape"` rows (jq, never read the
   ledger into context) whose `preventedBy` implicates plugin territory (`review-check`,
   `runtime-leg`, or a `doctrine` row whose gotcha carries `[plugin]`).
4. **Anomaly queries** (cross-host rollup, per stage): review rows with `skipped > 0`,
   contradicted CLEANs (escape rows pointing at CLEAN review runs), tier distribution
   skew — the per-stage table is how "how should /spec:build improve" becomes a query.

## Phase 2 — Verify in place (the step that makes the loop trustworthy)

For each candidate finding, `cd` into the host repo and **re-execute its evidence**: run the
reproducing command, or Read the cited file:line. Findings whose evidence no longer
reproduces are dispositioned `rejected` with the failed repro recorded verbatim — never
silently dropped. A finding whose brief `plugin:` stamp predates an INTAKE.md row's
`Fixed in` is `already-fixed` (no re-verification needed); the same signature reported at a
version ≥ `Fixed in` is a **regression** — reopen: flip the row's status back to `open` and
the pinning test had a hole; extend it.

## Phase 3 — Disposition (every finding terminates; nothing is left undecided)

Per finding, exactly one of:

- **accepted** — write the failing test now (fixture host if needed), append the INTAKE.md
  row (`Status: open`, `Pinned by:` the test path). The fix itself is separate, normal-flow
  work behind this repo's gates (`npm test`, `npm run build:workflows` for workflow files,
  scaffold-ledger row for any new guard).
- **rejected** — reason recorded (failed repro verbatim, or host-specific → suggest the host
  re-tag the gotcha `[host]`).
- **already-fixed** — name the fixing version; the host's doctor (upstream-fixes check)
  handles the retire-the-workaround message.
- **duplicate** — points at the existing INTAKE.md row; corroboration from a second host is
  priority signal, note it on the row.

Then **stamp the source**: write the `intake:` block (disposition, detail, date) into the
brief's findings row in the host repo — the stamp is what makes the next sweep skip it. For
gotcha/escape-sourced findings with no brief, the INTAKE.md row itself is the stamp (Phase 1
dedupes against it).

## Phase 4 — Report

Per-stage rollup table (findings by stage × category, which hosts corroborate), dispositions
with evidence, new failing tests created, and any regression reopens. If the sweep found
briefs from plugin versions ≥2 minors behind current, note which hosts should run
`/spec:doctor` for the upstream-fixes report.

## Rules

- **Never edit host code, specs, doctrine, or ledgers** — the ONLY host-side write is the
  `intake:` stamp in a brief's frontmatter. Fixes to host repos are the host's own work.
- **Never accept without the failing test.** "Obviously right" findings are the ones that
  most need the pin — plausible-but-wrong is this pipeline's founding failure mode.
- Briefs are append-only history: stamp rows, never rewrite or delete them.
- Update `Fixed in` in the same commit that lands a fix — host doctors read this file;
  a stale column lies to every host at once.
- `AskUserQuestion` dismissed → STOP (dispositions are cheap to resume; a guessed one
  poisons the ledger).
