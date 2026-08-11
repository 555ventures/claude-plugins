---
description: Drift check of the grounding layer — verifies config, agents, rules, activation, and cited references against the installed plugin and the current codebase; recommends targeted patches or a /spec:init refresh. --fix applies evidence-cited line-item repairs with per-patch approval
argument-hint: [focus area, optional — e.g. "agents" or "design"] [--fix]
---

# Spec Doctor: Grounding-Layer Drift Check

The grounding layer (`/spec:init`'s output) goes stale two ways: the **plugin updated**
(grounding-layer contracts changed under it) or the **codebase drifted** (cited paths,
commands, and conventions moved on). This command detects both — cheaply, without the deep
re-profile `/spec:init` runs. It is a **diagnosis, not a treatment**: report first; apply
only targeted patches the user approves; recommend a full `/spec:init` refresh for
structural drift. Never regenerate wholesale, and never touch files outside the grounding
layer. With `--fix`, the targeted-patch path extends to **doctrine repair** (below) — still
evidence-cited, still per-patch approved, never structural.

**Intended model: Sonnet.** Run `spec-paths shared-for doctor` and read its output (the
shared invariants scoped to this command — doctor's checks are enumerated and mechanical;
they never consume the design-stage process doctrine). If
`.claude/spec.config.json` is missing entirely, STOP — the repo was never initialized;
the answer is `/spec:init`, not a drift report.

## Checks — deterministic first

Run these with Bash/Read/Glob; each produces pass / fail-with-evidence (`file:line`):

1. **Config integrity** — `.claude/spec.config.json` parses; required keys present per the
   contract file's § Required config keys; legacy keys (`storybook: true`,
   `storybookCommand`) flagged for migration to the `design` block.
2. **Contract stamp** — config `contractHash` equals `$(spec-paths contract-hash)`. A
   mismatch is a lead, not a verdict — checks 3–6 below test the *current* contract (Read
   `$(spec-paths contract)`) directly and decide whether the drift is real.
3. **Agent roster** — every non-`default` `agentMap` value has a matching
   `.claude/agents/*.md` whose frontmatter `name:` is exactly that value; no orphan agents
   claiming pipeline kinds. **Routing coverage:** every layer in `layerGroups` (plus `tests`
   and `other`) resolves to a batch kind via `routing`/`agentMap` or falls to `default` — a
   layer no kind claims is the drift that breaks `/spec:build` batch dispatch.
4. **Worker Contract text** — each generated agent's `## Worker Contract (spec pipeline)`
   section is byte-identical across agents (allowing only the sanctioned self-verify command
   substitution) and matches the contract file's § Worker Contract block; the `tests`-kind
   agent carries the § Tests-kind addendum.
5. **Pipeline rules shape & scoping** — the file at `pipelineRules` exists and has all seven
   sections the contract file requires, and opens with the `paths:` frontmatter the contract's
   § Session grounding requires. Then sweep every `.claude/rules/**/*.md` carrying `paths:`
   frontmatter (the conventions files included): each glob must match ≥1 tracked file — a
   zero-match glob is a rule that silently never loads, the quietest drift in the layer. A
   grounding with no `.claude/rules/conventions/` at all and no `inert` manifest row for it
   predates the session-grounding contract — fold into the refresh recommendation.
6. **Scripts & commands** — `patternsScript` exists, is executable, exits 0; `driftScript`
   (if declared) exists; each command referenced by `gateCommand` / `testCommand` /
   `setupCommand` / `design.command` / `design.screenshot` resolves (script names exist in
   `package.json` / `Makefile` / `pyproject.toml` — verify the *names*, don't run the gate).
   Session grounding: `.claude/settings.json` parses and its `permissions` allow entries
   reference commands that still resolve the same way (a stale allow entry is harmless noise;
   a *missing* deny on `.env*` reads when the repo has env files is a flag);
   `.claude/skills/run/SKILL.md` exists and its launch/ready commands agree with the config
   `runtime` block — a run skill teaching a dead boot command is the drift interactive users
   hit first.

6b. **Activation (authored ⇒ activated)** — verification infrastructure must demonstrably
   execute, not merely exist (shared invariants § Runtime Verification):
   - `.claude/spec-manifest.json` exists and `bash $(spec-paths manifest-check)` exits 0 — a
     missing manifest means init predates the activation contract (recommend `/spec:init`
     refresh); a failing one lists exactly which authored protections are inert.
   - config declares a `runtime` block (`bootCommand`+`readyCheck`, or explicit `inert` with
     reason); a config without one makes every review's smoke leg a hard finding — broken.
   - if the repo carries CI config: `git remote -v` is non-empty OR the manifest has an
     `inert` row declaring CI local-only. CI authored + no remote + no declaration = the
     highest-leverage silent absence on record (UpWell: zero CI executions in 10 days,
     unnoticed).
   - every env var that gates a test suite (`skipIf`-shaped) has a provisioning path named in
     pipeline rules § Test Rules — an unsatisfiable gate variable means those suites have
     never run anywhere; flag loudly with the affected suite count.
   - **enforcement claims in host docs resolve** — grep `docs/adr/` and `docs/canonical/`
     for enforcement-claim phrases (`CI-verified`, `enforced by`, `gated by`, `checked in
     CI`); each claim must map to a check that actually resolves in the `gateCommand`, the
     CI config, or the enforcement manifest. A claim whose check doesn't exist is flagged
     loudly with the doc line quoted: an asserted-but-unwired enforcement misleads every
     reviewer and refuter that cites it (measured: a host ADR claimed its error-taxonomy
     mapping was "CI-verified" — neither the mapping nor the CI step existed). Presence
     grep only — never judge whether the check is *good*, only that it is real.
7. **Cited references** — extract repo paths cited in the pipeline rules file, the
   convention rule files, and each generated agent (Reference Material, exemplars,
   naming-table examples); verify each exists. Stale citations are the most common drift and
   are individually patchable.
8. **Design foundation** (only if the config has a `design` block) — `design.doctrine`
   exists and is ~one page; token files and the living-showcase entry it names exist.
9. **Genesis handoff** (only if `.claude/genesis/status.json` exists) — verify the consume-side
   contract is intact. If the config records `genesisStackDescriptor`, that path must exist and
   parse as JSON (a recorded pointer to a missing descriptor is broken, not stale). Then:
   - **Design-rules drift** — recompute the hash of `.claude/genesis/design-rules.json`; warn if it
     differs from the config's `designRulesHash` ("design rules changed but enforcement was not
     regenerated — re-run `/spec:enforce`").
   - **Category enum** — every design rule's `targetCategory` is one of the reserved design set
     (`color | typography | i18n | structure | a11y | density | layout`); an unknown category is broken.
   - **Encodable-dimension closure** (visual archetypes) — each baseline encodable dimension
     (color roles, type scale, spacing rhythm, radii/elevation, focus ring, min target size) is
     either materialized in the `tokensConsumed` surface as named roles **or** recorded
     DEFERRED-with-reason in the doctrine `## Dissents`. A dimension that is prose-only or absent
     from both — values described in doctrine with no backing token, or a baseline family simply
     missing — is the type-scale failure signature (the genesis canon that shipped without a
     `--text-*` scale); flag it and recommend the gap be tokenized (a `/spec:design` foundation
     spec, or a token + `/spec:enforce` pass). This is the backstop genesis couldn't run — it has
     the rendered tree genesis lacked.
   - **Dissents presence** — each `docs/adr/*.md` and the design doctrine contains a
     `## Dissents` section (a grep — presence only, never judge its content).

10. **Rule enforcement** (only if the config has an `enforcementManifest`) — verify the
    deterministic enforcement `/spec:enforce` generated is still live:
    - **Enforcement drift** — recompute the hash of `.claude/rules/enforcement.json`; warn if it
      differs from the config's `rulesEnforcementHash` ("enforcement manifest changed but the
      stamp is stale — re-run `/spec:enforce`").
    - **Category enum** — every manifest entry's `category` is one of the reserved taxonomy
      (`module-boundary | naming | forbidden-symbol | structural-pattern | datetime |
      schema-validation | format | duplication | cycle`); an unknown category is broken.
    - **Wiring resolves** — for each entry, the recorded enforcer's config/contract/checker path
      exists and the `gateCommand` (or the host hook orchestrator) still invokes it, OR the entry
      records a `sweep`/`review-check` fallback. An entry whose wiring no longer resolves is the
      early-detection signal — recommend re-running `/spec:enforce` (do **not** try to re-derive
      the enforcer here; tool selection is enforce's job, and naming a tool in the doctor would
      anchor it the same way the plugin prose deliberately avoids). **Ratchet case:** a
      `duplication`/`cycle` entry whose `baseline.path` does not exist on disk fails this check
      the same way — the ratchet baseline was never established or was deleted since, and the
      gate's no-new-violations invocation has nothing to compare against.

11. **Spec-dir hygiene** — sweep `specs/**`:
    - frontmatter `status` of every spec is one of `draft | hardened | implementing | done`;
    - an `implementing` spec whose `build_base:` branch no longer exists in the repo is stale
      (the build branch was merged or deleted without `/spec:review` closing the spec);
    - a `hardened`/`implementing`/`done` spec containing a live `[NEEDS CLARIFICATION:` marker
      (colon form — the open-marker sentinel; bracketed narration without the colon is fine)
      is broken (it should have been impossible to lock);
    - an orphaned design sidecar (`specs/**/*.design/` with no sibling spec mid-design — spec
      already `done`, or `designed:` set) is leftover transient state `/spec:design` Phase 4
      should have deleted; recommend removing it.

12. **Run ledger hygiene** (only if `.claude/spec-runs.jsonl` exists) — every line parses as
    JSON with a `stage` of `build | review | escape | observe | release`; any line over ~600
    chars is a prose leak (the ledger holds counts/enums/paths only — build.md/review.md
    define the shape); the file is tracked by git (an ignored or untracked-and-stale ledger
    defeats its purpose); `observe` rows are exempt from the build/review required-field
    expectations (no `tier`/`runId` — they carry `branch`/`ci`/`sha`/`url`/`runAt` instead per
    spec 03's D1) but the same parse/stage-enum/line-length/git-tracked hygiene checks apply
    unchanged, and to the year archives (`.claude/spec-runs-<year>.jsonl`) exactly as to the
    live file — an archived observe row is still a ledger row;
    `git check-attr merge -- .claude/spec-runs.jsonl` reports `union` (without it, parallel
    worktree builds conflict at merge-back on EOF appends — init sets the `.gitattributes`
    entry; recommend re-running `/spec:init` or adding it directly).
    All checks are script passes (`jq`/`awk`) — never read the ledger into context. If the
    file somehow exceeds ~2 MB, that is years of entries or a leak: report it and suggest
    archiving whole years to `.claude/spec-runs-<year>.jsonl` (same shape, still committed).
    **Tier distribution:** with ≥5 build rows, if ≥90% share one tier, flag it — a tier
    system that always answers T3 (or always T2) has stopped discriminating; recommend
    auditing the pipeline rules § Risk Tiers triggers against what the specs actually touch
    (measured 2026-07: one host ran 100% T3 across 10 specs — 2 reviewers + checkpoints on
    everything — while a sibling host tiered normally).
    **Escapes** (`stage:"escape"` rows, recorded by `/spec:escape`) — jq correlations, flag
    loudly:
    - an escape whose `reviewRunId` matches a review row with `verdict:"CLEAN"` is a
      **contradicted CLEAN** — the review passed a real defect; report per-spec;
    - any `killedMatch:true` row means the refutation filter killed a real bug — the single
      strongest re-tuning signal the ledger can hold;
    - conversely, with ≥10 CLEAN review rows and zero escape rows behind any of them, report
      that too — it is the evidence that gates any future cut to review spend (staged
      review). Absence of escapes is only meaningful if escapes are actually being recorded;
      note when zero escape rows exist at all;
    - any escape row with `"preventedBy":"doctrine"` whose named change has not landed (the
      Gotchas/rules line it implies is absent) is an **open repair** — list it as `--fix`
      input; a `preventedBy:"enforcer"` row with no matching enforcement-manifest entry means
      `/spec:enforce` is due.
    **Plugin-defect roll-up:** collect `[plugin]`-tagged entries from pipeline rules
    § Gotchas into one "upstream bug report" block (entry + citation, verbatim) — these are
    the spec plugin's own defects living as host folklore; instead of every host re-paying
    the discovery, offer to write them as a feedback brief NOW
    (`docs/spec-feedback/<YYYYMMDD>-brief.md` from `spec-paths feedback-template`, installed
    version stamped — same artifact `/spec:release`'s flush writes; shared invariants
    § Feedback Loop). Skip entries already covered by a prior brief's `intake:`-stamped row.

13. **Scaffold audit** — Read the plugin's distrust/guard registry:
    `spec-paths scaffold-ledger 2>/dev/null || echo "$(spec-paths root)/doctrine/scaffold-ledger.md"`
    (the `scaffold-ledger` key exists; the fallback covers installed plugin versions that
    predate it). The ledger itself stays out of model context beyond this — only the
    specific rows a finding below names get quoted back in the report.
    - **Stale earned-under generations** — for each row, extract the family + version from
      `Earned under` (rows tagged `structural` / `harness-level, model-independent` have no
      generation to compare — skip them); flag any row **2+ major versions behind** the model
      family running this doctor session **AND** whose `Promote/retire condition` has never
      been evaluated against the host's `.claude/spec-runs.jsonl` (no prior doctor note or
      ledger query addressing that mechanism by name — treat "never evaluated" as the default
      unless the user points to one). Recommend running that row's named measurement now that
      a newer generation is current — never re-derive the verdict here.
    - **Ripe advisories** — for each `advisory` row, check whether `.claude/spec-runs.jsonl`
      has had time to accumulate the data its promote condition names, and hand the user the
      exact query rather than judging the correlation. Example, for the behavioral-evaluator
      row ("PROMOTE to gate when ledger shows its verdicts track escapes"):
      ```
      jq -s '[.[] | select(.stage=="escape")] | length' .claude/spec-runs.jsonl
      ```
      Report the count (and how it pairs with whatever verify-skill verdicts are recorded
      elsewhere) and quote the row's own promote condition as the acceptance bar — doctor
      names the measurement, it does not compute the promotion call.
    - **Ungoverned mechanisms** — grep the host's generated agents (`.claude/agents/*.md`),
      the pipeline rules file, and `spec.config.json` for known distrust-mechanism markers
      (the gate sentinel string, fail-closed-reviewer language, worker-git-ban text, no-free-
      text args framing) that have **no** corresponding scaffold-ledger row; flag each as a
      mechanism shipped with no named promote/retire condition.
    Output is recommendations only — this check never edits the ledger, the host's generated
    files, or the run ledger.

14. **Roadmap derivation** (only if `docs/roadmap/00-overview.md` exists) — roadmap status is
    never tracked by hand; run the derivation script (one source of truth, shared with
    `/spec:status` and `/spec:plan`'s preflight):
    ```
    node "$(spec-paths spec-status)" --root . --json
    ```
    Report its derived table (brief, derived status, spec paths) and surface every `anomalies`
    entry as a finding: `orphan-stamp` (a spec's `brief:` matches no `docs/roadmap/NN-*.md` —
    brief renamed/deleted without re-stamping, or a typo), `hand-tracked-status` (a status-like
    column in the overview's Sequence table — statuses live only in the derivation; recommend
    stripping it), `skipped-spec` (a done spec whose `depends_on` spec isn't done). Treat
    `skipped-brief`/`out-of-order`/`unknown-dependency` as info, not flags — surface them
    prominently (they are `/spec:status`'s headline signal, and accidental skips are the
    incident class the mechanism exists for), but the roadmap may have been deliberately
    reordered; the user may know why.

15. **Upstream fixes (return half of the feedback loop)** — the plugin ships its intake
    ledger (`spec-paths intake`: host findings → pinning test → `Fixed in` version). Compare
    the config's `generatedBy` version against `spec-paths version` (`sort -V`); when the
    grounding predates the installed plugin:
    - list intake rows whose `Fixed in` is newer than `generatedBy` — these are defects this
      host may still be working around;
    - cross-match them against the host's own `[plugin]` Gotchas entries and per-spec
      override Decisions (grep `specs/**` Decisions tables for rows citing generated
      doctrine files) — each match is a **retirable workaround**: report it by name with the
      fixing version ("fixed upstream in spec@X — retire the override / drop the gotcha
      line, then re-stamp via the targeted-patch flow or a `/spec:init` refresh");
    - a match whose host is ALREADY on a version ≥ its `Fixed in` is a **regression signal**,
      not a stale workaround — flag it loudly and recommend the finding be re-reported in a
      new feedback brief (never edit the old one).
    Read the ledger with grep/awk against the table rows — never load the whole file into
    context.

16. **Representation parity** (only if `docs/adr/` greps for the locked row label
    `per-surface casing ownership` — genesis Phase A writes it verbatim; an ops-conventions
    ADR present *without* that label is itself a finding — pre-6.7 grounding, recommend the
    targeted-patch flow — never a silent skip) — re-run `node $(spec-paths parity-check)
    <files>` once per surface in that row, passing the row's recorded globs as they match
    *now* plus one temp file of the surface's decided spelling exemplars copied verbatim
    from its row. Never pass the whole ADR (other surfaces' rows legitimately differ; one
    invocation = one plane). Genesis ran this at scaffold time, but contradictions accrete
    as contracts land per-spec — the incident class this catches (the same seam identifier
    spelled `runId` in contract files while the ADR's wire exemplars say `run_id`) only
    becomes visible after builds. Non-zero exit is a finding citing both sides; the fix
    routes to whichever side the ADR's ownership boundary says is wrong.

17. **Roadmap amendment integrity** (only if `docs/adr/` and `docs/roadmap/` both exist) —
    the amendment contract (adr.md template § Applies to) is bidirectional and greppable:
    - every brief named in a post-genesis ADR's `Applies to` section carries a matching
      `Amended by ADR-NNNN` line — a miss means a decision was recorded but never propagated,
      the silent class that shipped an unread OAuth account-linking rule set past plan;
    - every `Amended by ADR-NNNN` line in a brief cites an ADR whose `Applies to` names the
      brief back — a miss is a hand edit wearing an ADR's authority;
    - an `Applies to` row naming a brief whose specs are all `done` (check 14's derivation)
      with no letter-suffixed successor brief in the Sequence table is surfaced as a finding:
      the amendment has no plannable home and will never be picked up.
    Legacy migration: a non-empty `docs/roadmap/deltas/` dir predates spec@6.18.0 — flag
    every file in it ("fold into an amendment ADR + brief edits per the overview's rule,
    then delete the dir"); deltas are invisible to plan and must not persist.

18. **Claims registry** — run `node "$(spec-paths claims-lint)" --json` and report its
    findings: orphan claims (blocking-consequence lines with no marker, beyond a file's
    baselined count), unresolvable `enforcedBy:` pointers, `unenforced:` reasons under 20
    chars, and baseline drift in either direction against
    `spec/doctrine/claims-baseline.json`. The marker convention and the claim bar are shared.md
    § Doctrine Authoring's, not restated here. Output is recommendations only — this check
    never edits the corpus or the baseline; the remedy for drift is
    `node "$(spec-paths claims-lint)" --update-baseline`, printed for the user to run.

19. **CI-gate parity** (deterministic, advisory) — only when `.github/workflows/` exists:
    split the config `gateCommand` on the regex `/\{[^}]*\}/g`, trim each literal segment, and
    keep segments ≥10 chars. If no segment survives that floor, the single required segment is
    the whole trimmed `gateCommand` with placeholder tokens stripped (so a short command like
    `npm test` never degenerates to a vacuously green check). Require every kept segment to
    appear as a substring in the concatenation of `.github/workflows/*.yml` + `*.yaml`. Any
    missing segment is an advisory finding: the host's CI does not invoke the configured
    `gateCommand`, so CI red/green and pipeline gate red/green can drift; remedy = make one CI
    step run the `gateCommand` verbatim.

## Semantic spot-check — small, bounded

For 2–3 agents (prioritize any with stale citations), read one cited exemplar each and
judge whether the conventions the agent describes (naming tables, layer constraints) still
match the real code. This is the only judgment call in the run; everything above is
mechanical. Do not expand into a full re-profile.

## Repair mode (`--fix`) — targeted doctrine repair at the pipeline's evidence bar

Without `--fix`, doctor stays read-only (targeted patches still require explicit user
approval per the recommendation flow below). With `--fix`, doctor may additionally repair
**factually wrong doctrine** — the failure mode where a generated grounding entry teaches a
verified bug (measured: UpWell's `agents/jobs.md` + `spec-pipeline.md` carried a queue-name
convention the pinned dependency rejects at process start; the only sanctioned rewriter was a
full `/spec:init` re-run, so every future jobs spec was *instructed to reintroduce the crash*
and the host patched around it with per-spec override Decisions, forever).

The bar, per patch — all three, no exceptions:

1. **Evidence at the pipeline's own standard:** a reproducing command or file:line citation
   proving the current doctrine text wrong (an escape-ledger row pointing at it qualifies;
   "seems outdated" does not). For dependency-adjudicated claims, run the one falsifying line
   now — same discipline plan's refuters use.
2. **Per-patch `AskUserQuestion` approval** showing exact before → after text and the
   evidence. Never batch-approve.
3. **Scope: line-item only, inside the grounding layer** (pipeline rules file, convention
   rule files, generated agents, generated skills, the settings `permissions` block, config
   values, `scripts/spec-patterns.sh`). Structural drift (layers reorganized,
   toolchain swapped) is still `/spec:init`'s job — `--fix` refuses it and says why.

After patching: re-run the affected checks, re-stamp `contractHash`/`generatedBy`, and append
the correction as a Gotchas entry citing the evidence (tagged `[host]` or `[plugin]` by where
the wrong text came from) — the repair itself becomes territory-corrects-map history.

## Report & recommendation

Print exactly this shape (rationale: shared § Console Output Style); fill the slots, drop
any line whose slot is empty, add nothing else — per finding, one plain-language line
stating what's wrong and what it affects (evidence detail on demand, not inlined), grouped
**stale / broken**:

```
✅ **grounding healthy**     (or: ⚠️ **{N} stale** / 🚫 **broken — {what}**)
⚠️ stale: {what's wrong — what it affects, one line each}
🚫 broken: {what's wrong — what it affects, one line each}

Next: {the single recommendation below}
```

Close with exactly one recommendation:

- **Clean** — no action. If only check 2 failed (stamp trails the plugin but the current
  contract checks all pass), offer to re-stamp `contractHash` (+ `generatedBy`) — with
  `AskUserQuestion`, since it silences the hook's warning.
- **Targeted patches** — an enumerated list of small fixes (stale citation → current path,
  legacy design keys → `design` block, contract-text resync, re-stamp). Apply only after
  the user approves the list; re-run the affected checks after.
- **Enforcement drift** — checks 9–10 found design-rules/enforcement-manifest hash drift, an
  enforcer whose wiring no longer resolves, a stale or missing ratchet baseline (a
  `duplication`/`cycle` entry's `baseline.path` doesn't exist), or a rule category with no
  enforcer: recommend `/spec:enforce` (not `/spec:init` — enforcement is its own command). Doctor
  never re-derives an enforcer itself.
- **Structural drift** — architecture reorganized, layers changed, toolchain swapped, or
  the semantic spot-check failed: recommend `/spec:init` and say which findings drove the
  call. Do not attempt the refresh yourself.

## Rules

- Read-only by default; every edit is user-approved, targeted, and inside the grounding
  layer (`spec.config.json`, pipeline rules, convention rules, generated agents, generated
  skills, the settings `permissions` block, `scripts/spec-patterns.sh`).
  `--fix` widens what may be patched (doctrine content, not just stale citations), never who
  approves or where.
- Never run the host's `gateCommand`/`testCommand`/`setupCommand` — verify they resolve.
  (Exceptions, both deterministic and cheap: `manifest-check` in the activation check, and a
  single falsifying line when `--fix` evidence demands execution.)
- Re-stamp `contractHash`/`generatedBy` only when every current-contract check passes (or
  after approved patches make them pass) — the stamp asserts "grounding matches this
  plugin's contract".
- `AskUserQuestion` dismissed → STOP.
