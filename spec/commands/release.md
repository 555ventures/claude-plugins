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

Create `{manifestPath}` now — a fresh `mktemp` file, one per run — that every leg below
appends a JSONL row to (`{"leg":"<name>","exit":<code>,"observed":"<≤120-char counts/enums>"}`,
matching review's evidence-manifest shape (D1/D7)). This run's **required legs** are `deploy`,
`ready`, `e2e`, `journeys`, `substrate`, `production`, `ci` — `verdict.js --profile release`
derives the milestone word from them.

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
`manifest-check.sh` prints a machine sentinel line after its prose summary —
`TOTAL=<n> FAILS=<n> INERT=<n>` — parse `checked`/`failed`/`inert` from that sentinel verbatim
(never hand-counted from the prose lines above it) and append `{"leg":"substrate","exit":<0 if
manifest-check exits 0 else 1>,"observed":"checked=<N> failed=<M> inert=<K>"}` to
`{manifestPath}` — this exact `checked=N failed=N inert=N` shape is what
`verdict.js --profile release` parses into the ledger row's `substrate` field; drifting the
format breaks that derivation silently.

## Phase 2 — Stage and observe (all executed, fail-closed)

The `deploy`/`ready`/`e2e`/`journeys`/`production`/`ci` legs' `observed` strings below are
pinned — `verdict.js --profile release` parses them verbatim into the ledger row (D2/D7):
`deploy` and `ready` carry no counts (their exit codes alone derive the ledger row's `staging`
field — `pass` only when both exit 0); `e2e` is `passed=<N> failed=<M> skipped=<K>`; `journeys`
is `walked=<N> failed=<M>`; `production` is `observed ∈ verified|skipped|failed`; `ci` is
`observed ∈ conclusion=<value>|unavailable|in-progress`. Drifting any of these strings breaks
that derivation silently — the leg that appends the row and the script that parses it must
agree on exactly this format.

1. **Deploy to staging:** run `deployCommand`. Append `{"leg":"deploy","exit":<exit>,"observed":"<pass|fail>"}`
   to `{manifestPath}`. Failure → STOP (see below), report.
2. **Ready check against the deployed URL:** the config `runtime.readyCheck` pattern applied
   to `stagingUrl` + `healthPath` (or a plain curl). The boot-leg discipline, applied to real
   infra. Append `{"leg":"ready","exit":<exit>,"observed":"<pass|fail>"}` to `{manifestPath}`.
3. **CI check on the release commit (D4):** `node "$(spec-paths ci-query)" --commit $(git -C .
   rev-parse HEAD) --root .` — the authoritative per-commit CI verdict. A completed run with
   `conclusion` ∈ (`failure`/`timed_out`/`cancelled`) maps to `exit:1`; a completed non-red run
   maps to `exit:0`, `observed:"conclusion=<value>"`; `available:false` maps to `exit:0`,
   `observed:"unavailable"`; an in-progress run re-invokes the same command every
   `capabilities.ciPoll.intervalSeconds` seconds (default 30 — every 30 seconds — when the
   block or key is absent, D7) for up to `capabilities.ciPoll.timeoutSeconds` seconds (default
   600 — up to 10 minutes — when absent), then — if still unresolved — maps to `exit:0`,
   `observed:"in-progress"`.
   Append `{"leg":"ci","exit":<mapped>,"observed":"<mapped>"}` to `{manifestPath}` exactly once,
   after the poll loop resolves — never once per poll iteration (a double row corrupts the leg
   map). Whenever `observed` is not a `conclusion=<value>` string, the Phase 4 pre-promote
   report MUST carry one ⚠️ line stating CI never delivered a verdict on this exact commit (and,
   for `unavailable`, that pushing would produce one).
4. **e2e against the deployment:** `BASE_URL={stagingUrl} {e2eCommand}`. Capture pass / fail
   / skip counts from the runner's own output — **a skipped e2e is reported by name, never
   silently green.** When the host's declared `capabilities.skipReportPattern` (D1) is absent,
   `"none"`, or doesn't match this run's output, the skip count is honestly
   `unavailable — host runner declares no skip format`, never assumed-zero (no format is
   universal). Append
   `{"leg":"e2e","exit":<0 if zero failed else 1>,"observed":"passed=<N> failed=<M> skipped=<K>"}`
   (or `skipped=unavailable` in place of `<K>` when the skip format is undeclared/unmatched)
   to `{manifestPath}`.
5. **Journey walks:** for each brief shipped this milestone, walk its primary journey against
   staging (the brief's milestone-gate observable, via the host's spec-verify skill, browser
   automation, or scripted API calls — whatever the skill declares), plus **one standing
   whole-product journey** (sign-up → core loop → the product's reason to exist) every
   release regardless of what shipped. Record each as observed-pass / observed-fail with the
   command or interaction trace. A journey that cannot be walked (no seed path, no access) is
   a **blocking finding**, not a skip. Append
   `{"leg":"journeys","exit":<0 if zero failed else 1>,"observed":"walked=<N> failed=<M>"}` to
   `{manifestPath}`.

Any failure here (a red `deploy`/`ready`/`e2e`/`journeys`/`ci` row): **STOP.**
Never promote over a red staging or a red release-commit CI run.

The stop still runs `node "$(spec-paths verdict)" --profile release --manifest {manifestPath}
--ledger --milestone {milestone} --briefs {shipped brief numbers, comma-separated}` — an early
Phase-2 STOP leaves later legs without manifest rows, and `verdict.js` checks missing-required
legs *before* red legs, so the word it derives on an early stop is typically `UNVERIFIED`, not
`GATE_RED` (only a STOP triggered by this leg's own red row derives `GATE_RED`); its row is
appended to `.claude/spec-runs.jsonl` the same as a successful run's. In short: `verdict.js
--profile release --ledger` is what the STOP path derives here (D7: a Phase 2/3 STOP is never a
second, independent verdict origin — the same call runs again in Phase 4 below). `--milestone`
and `--briefs` are orchestrator-supplied identity fields (the `$ARGUMENTS` note / Phase 0 step
2's shipped-brief list) — everything else in the row (`staging`/`e2e`/`journeys`/`substrate`/
`production`/`ci`) is derived from the manifest rows above, never passed as a flag.

Report via the shared STOP shape: assemble `outcome: {anchor:'🚫', text:'{the derived verdict
word} — {leg} failed'}` and `next: {kind:'command', text:'route the defect to the normal flow
— direct fix or a spec, or /spec:escape (foundBy: later-spec, preventedBy: runtime-leg) if it
escaped a CLEAN review'}`, write to a temp file, and run `node "$(spec-paths report-render)"
--slots <file>`, printing its output verbatim:

```report
🚫 **{the derived verdict word} — {leg} failed**
Next: route the defect to the normal flow — direct fix or a spec, or /spec:escape if it escaped a CLEAN review
```

## Phase 3 — Promote (explicitly confirmed, never autonomous)

A milestone whose only gap is a `ci` leg that structurally never delivered a verdict
(`unavailable`/`in-progress`) is `CLEAN-with-qualifier`, not a block: it promotes exactly as
plain `CLEAN` does, carrying the already-mandated ⚠️ line (Phase 2 step 3) into the promote
question's context and the Phase 4 report — the word gates nothing extra here.

1. `AskUserQuestion`: promote this build to production? (Include the Phase 2 observation
   summary in the question context.) Dismissed or declined → STOP; staging stands, nothing
   promoted; append `{"leg":"production","exit":0,"observed":"skipped"}` to `{manifestPath}`
   (D7: a user-declined promote is exit 0, `observed:"skipped"` — it is not a failure).
2. On yes: run `promoteCommand` (or instruct the user through their CI-on-tag flow when
   promotion is tag-driven and the tag push is theirs to make — **never push for them**).
3. **Verify production serves:** ready check against `productionUrl` + `healthPath`, and
   confirm the deployed version/build id is the one staged (the health endpoint's version
   field, or the platform's deployment id). A promote that cannot be verified serving is a
   failure, not a success with a caveat. Append
   `{"leg":"production","exit":<0 if verified else 1>,"observed":"<verified|failed>"}` to
   `{manifestPath}`. A red `production` row here is a Phase 3 failure — STOP via the same
   renderer shape as Phase 2 above (`outcome: {anchor:'🚫', text:'GATE_RED — production
   verification failed'}`, `next: {kind:'command', text:'verify {productionUrl}/{healthPath}
   serves the staged build, then re-run /spec:release'}`), quoting
   `verdict.js --profile release --ledger`'s `GATE_RED` output.

## Phase 4 — Record & report

1. **Verdict + ledger row** — run `node "$(spec-paths verdict)" --profile release --manifest
   {manifestPath} --ledger --milestone {milestone} --briefs {shipped brief numbers,
   comma-separated}` (the same call the Phase 2/3 STOP path above would have quoted, had one
   fired: `verdict.js --profile release --ledger` is one derivation with one origin on every
   path). `--milestone`/`--briefs` are orchestrator-supplied identity fields (`$ARGUMENTS` /
   Phase 0 step 2's shipped-brief list); `staging`/`e2e`/`journeys`/`substrate`/`production`/`ci`
   are derived from the Phase 2/3 manifest rows, never passed as flags. Print line 1 (the word
   — `CLEAN`, `CLEAN-with-qualifier`, `GATE_RED`, or `UNVERIFIED`) verbatim, and append exactly
   ONE line to
   `.claude/spec-runs.jsonl` — line 2, the ledger row, verbatim, counts/enums/paths only, never prose:

   ```
   {"ts":"<ISO-8601>","stage":"release","milestone":"<tag or briefs range>","briefs":[<NN>,…],"verdict":"<CLEAN|CLEAN-with-qualifier|GATE_RED|UNVERIFIED>","staging":"<pass|fail>","e2e":{"passed":<n>,"failed":<n>,"skipped":<n>},"journeys":{"walked":<n>,"failed":<n>},"substrate":{"checked":<n>,"failed":<n>,"inert":<n>},"production":"<verified|skipped|failed>","ci":"<conclusion=<value>|unavailable|in-progress>"}
   ```

   `verdict` is net-new here as documented text — `verdict.js` has always emitted `row.verdict`
   on release rows; this is the doctrine catching up to the script and pinning the enum,
   `CLEAN-with-qualifier` included.

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
4. **Release report:** assemble the slots object — `outcome` (✅ `milestone green — {N} specs
   composed, staging + e2e passed, promoted` on CLEAN; ✅ `milestone green (qualified: CI
   never delivered a verdict) — promoted` on `CLEAN-with-qualifier`; 🚫 `{what blocked
   promotion}` otherwise), `bullets` (`- shipped: {briefs + specs}`, `- observed: {deploy,
   ready, e2e counts, journeys walked with outcomes, ci verdict — one line each}`,
   `- substrate: {rows checked / inert-declared} · production: {verification result}`),
   `warns` (`ci never delivered a verdict on this commit` only on `CLEAN-with-qualifier`, plus
   `yours / the client's to do: {inert rows, verbatim — one line each}` whenever inert rows
   exist), and `next` — **unconditional, branched by outcome** (A7 — never the old
   "(optional)" framing): `{kind:'command', text:'/spec:audit — hotspot debt audit for this
   milestone'}` on CLEAN/`CLEAN-with-qualifier`; `{kind:'command', text: the remedy for what
   blocked promotion}` on 🚫. Write the slots to a temp file and run
   `node "$(spec-paths report-render)" --slots <file>`, printing its output verbatim.

   ```report
   ✅ **milestone green — {N} specs composed, staging + e2e passed, promoted**
      (or, on `CLEAN-with-qualifier`: ✅ **milestone green (qualified: CI never delivered a
      verdict) — promoted** · or: 🚫 **{what blocked promotion}**)
   - shipped: {briefs + specs}
   - observed: {deploy, ready, e2e counts, journeys walked with outcomes, ci verdict — one line each}
   - substrate: {rows checked / inert-declared} · production: {verification result}
   ⚠️ ci never delivered a verdict on this commit    (only on `CLEAN-with-qualifier`)
   ⚠️ yours / the client's to do: {inert rows, verbatim — one line each}
   Next: /spec:audit — hotspot debt audit for this milestone    (or, on 🚫: the remedy for what blocked promotion)
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
