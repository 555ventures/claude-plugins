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

## Phase 0 — Grounding (first run interviews; later runs read)

1. **Config `release` block** (contract file § Release): `deployCommand` (staging),
   `stagingUrl`, `e2eCommand` (runs the e2e suite against `BASE_URL`), optional
   `promoteCommand`, `productionUrl`, `healthPath`. If absent, this is the first release:
   derive each value from the repo (deploy tooling config, CI files, e2e config) and confirm
   the set with the user via `AskUserQuestion` — **host-declared, never invented** — then
   write the block. A host that deploys through CI-on-tag records that as its
   `promoteCommand` shape (e.g. a tag push) rather than a direct deploy.
2. **Derive what shipped** since the last `stage:"release"` ledger row (or since genesis, on
   the first release): `done` specs by close date, grouped by `brief:` stamp — the same
   derivation `/spec:doctor` check 14 uses. Present the shipped-brief list; this scopes the
   journey walks.
3. **Substrate delta:** diff the shipped specs' File Plans for new env vars, new third-party
   integrations, and new migrations since the last release — each becomes a checklist row in
   Phase 1 (only the delta is re-checked on later runs; the first run checks everything).

## Phase 1 — Release manifest (first run heavy, later runs delta-only)

Maintain `.claude/release-manifest.json` — same shape and same checker as init's deliverable
manifest (`{claim, kind, target}` rows; `bash $(spec-paths manifest-check) --manifest
.claude/release-manifest.json`). Rows for: production env vars set (an `exec` row per
verifiable check, `inert` with reason where unverifiable from this host), migrations path
(`exec` against staging), monitoring/error-tracking reachable, live-mode third parties
(payments/email/OAuth — `inert` rows with the user's explicit confirmation recorded as the
reason where no mechanical check exists), domain/TLS (`exec`: a curl against
`productionUrl`). First release: build the full manifest with the user. Later releases:
re-check only Phase 0's substrate delta plus rows whose targets changed. The manifest is
committed — it doubles as the handover document: a list of verified observations, not claims.

## Phase 2 — Stage and observe (all executed, fail-closed)

1. **Deploy to staging:** run `deployCommand`. Failure → STOP, report.
2. **Ready check against the deployed URL:** the config `runtime.readyCheck` pattern applied
   to `stagingUrl` + `healthPath` (or a plain curl). The boot-leg discipline, applied to real
   infra.
3. **e2e against the deployment:** `BASE_URL={stagingUrl} {e2eCommand}`. Capture pass / fail
   / skip counts — **a skipped e2e is reported by name, never silently green** (same rule as
   review's skip reconciliation).
4. **Journey walks:** for each brief shipped this milestone, walk its primary journey against
   staging (the brief's milestone-gate observable, via the host's spec-verify skill, browser
   automation, or scripted API calls — whatever the skill declares), plus **one standing
   whole-product journey** (sign-up → core loop → the product's reason to exist) every
   release regardless of what shipped. Record each as observed-pass / observed-fail with the
   command or interaction trace. A journey that cannot be walked (no seed path, no access) is
   a **blocking finding**, not a skip.

Any failure here: STOP, report what was observed, and route the defect to the normal flow
(direct fix or a spec; if it escaped a CLEAN review, offer `/spec:escape` — `foundBy:
later-spec`, `preventedBy: runtime-leg`). Never promote over a red staging.

## Phase 3 — Promote (explicitly confirmed, never autonomous)

1. `AskUserQuestion`: promote this build to production? (Include the Phase 2 observation
   summary in the question context.) Dismissed or declined → STOP; staging stands, nothing
   promoted, ledger row records `production: skipped`.
2. On yes: run `promoteCommand` (or instruct the user through their CI-on-tag flow when
   promotion is tag-driven and the tag push is theirs to make — **never push for them**).
3. **Verify production serves:** ready check against `productionUrl` + `healthPath`, and
   confirm the deployed version/build id is the one staged (the health endpoint's version
   field, or the platform's deployment id). A promote that cannot be verified serving is a
   failure, not a success with a caveat.

## Phase 4 — Record & report

1. **Ledger row** — append exactly ONE line to `.claude/spec-runs.jsonl` (counts/enums/paths
   only, never prose):

   ```
   {"ts":"<YYYY-MM-DD>","stage":"release","milestone":"<tag or briefs range>","briefs":[<NN>,…],"staging":"<pass|fail>","e2e":{"passed":<n>,"failed":<n>,"skipped":<n>},"journeys":{"walked":<n>,"failed":<n>},"substrate":{"checked":<n>,"failed":<n>,"inert":<n>},"production":"<verified|skipped|failed>"}
   ```

2. **Tag** the release (`git tag`) when the user confirmed promotion — never push the tag;
   pushing remains theirs.
3. **Feedback flush (emit half of the feedback loop — shared invariants § Feedback Loop):**
   sweep the window since the last release row for upstream signal: `[plugin]`-tagged
   Gotchas entries, `stage:"escape"` ledger rows, review rows with non-zero `skipped`
   counts, and review-folded deviations that implicated plugin templates or doctrine. If
   **at least one** qualifying item exists, write `docs/spec-feedback/<YYYYMMDD>-brief.md`
   from the plugin's brief template (`spec-paths feedback-template`) — the installed
   version (`spec-paths version`) stamped as `plugin:`, one findings row per item, evidence
   verbatim from the source material. No qualifying items → no brief (never write an empty
   one). Briefs are append-only: never edit a prior brief; a row the plugin repo's intake
   already stamped (`intake:` present) is never re-reported.
4. **Release report:** what shipped (briefs + specs), every executed observation (deploy,
   ready, e2e counts, journeys walked with outcomes), substrate rows checked / inert-declared,
   production verification, and anything that remains the user's or client's to do (the
   `inert` rows, verbatim). Every line traces to an executed command — the report is the
   client-facing artifact, so no claim may outrun its observation.

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
