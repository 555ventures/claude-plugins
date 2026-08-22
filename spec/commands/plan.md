---
description: Author and harden a spec in one session — explore, draft, executed micro-spikes, lock
argument-hint: <feature description | spec path | roadmap brief path>
---

# Spec Plan

One session: explore → draft → lock. Produces a hardened spec at
`specs/YYYYMMDD/##-{name}.md`, written from the plugin template (`spec-paths template`).
Spec quality determines all downstream spend — this is the pipeline's judgment
concentration point.

**Setup:** run `spec-paths shared-for plan` and read its output. Read the host's
`.claude/spec.config.json` and its `pipelineRules` file. Either missing → STOP: run
`/spec:init` first.

## Input

`$ARGUMENTS` — a feature description, a path to an existing draft spec to re-open, or a
path to a roadmap planning brief (`docs/roadmap/NN-*.md`).

## Entry

- **Roadmap brief:** read the brief, `docs/roadmap/00-overview.md`, and every ADR the
  brief's Grounding cites (including each `Amended by ADR-NNNN`). Run
  `node "$(spec-paths spec-status)" --root . --brief NN` — exit 1 means a `Depends on`
  brief has no spec at `implementing`/`done`: warn and confirm before proceeding. Every
  spec this session produces gets `brief: NN` in frontmatter (that stamp is how roadmap
  status is derived); an ad-hoc spec gets `brief: n/a`. The brief's Out of scope section
  is binding. UI-bearing briefs (a `surfaces` block): read each surface's mock under
  `design/mocks/`; a missing or un-ratified mock → offer `/spec:sketch <brief>` first
  (warn, don't block); a mock↔brief mismatch becomes a user question, never a silent pick.
- **Tier:** `standard` for almost everything; `critical` when the work touches
  irreversible or high-blast-radius surfaces — auth/security boundaries, data migrations,
  money, deletion of user data, or whatever the host's pipeline rules add. State the tier
  and why. Work too small to need delegation (Sonnet workers building while you only plan)
  or durability (scope spanning sessions) gets no spec — say so and stop.
- **Explore before asking.** Ground every claim in current code (parallel Explore agents
  where the surface is wide; `docs/canonical/{area}.md` when present). Run the pre-emptive
  lookups the host's pipeline rules § Planning declares (Context7 for third-party APIs the
  spec relies on) and embed the excerpts that matter into Contracts/UI — downstream workers
  never query MCPs. Then put the genuine forks to the user via `AskUserQuestion`, options
  grounded in what you found; never ask what the codebase can answer.

## Micro-spikes (mandatory — the shape triggers it, never felt uncertainty)

Any claim the draft will lock whose truth a **third-party dependency adjudicates** —
name/format constraints, cron strings, config keys, DSL fragments, version-specific API
shapes — is falsifiable in one executed line, and that line MUST run before the claim
enters a Decision, Contract, or AC (scratch file against the installed dependency; run,
observe, delete). This includes **negative claims**: an assertion that a named mutation or
misconfiguration will make a named check fail is dependency-adjudicated identically —
execute it and observe the red before locking it. Record the executed check + observed
output in Assumptions. For a genuinely high-unknown area (unfamiliar API, risky
integration), run a full throwaway spike in an isolated worktree
(`Agent {isolation: 'worktree'}`) and fold the findings in; set `spiked: YYYY-MM-DD`.

## Draft

Write the spec per the template. `status: draft`. While drafting:

- **Never guess — mark it.** Where information is missing, write
  `[NEEDS CLARIFICATION: <question>]` inline instead of something plausible. The state-gate
  hook blocks `/spec:design`, `/spec:build`, and `/spec:review` while any marker survives.
- **Decomposition cap:** a spec must fit one `/spec:build` run — roughly ≤15 File Plan
  rows, one primary area. Bigger work splits into `##-` siblings sliced by **landing unit**
  (each leaves the system green on its own), never by layer; wire `depends_on`. A facade
  with no consumer in the same spec or its series is mis-sliced — fold it into the
  consumer's spec.
- **File Plan row grammar:** every touched file gets its own row (Path | Action | Layer |
  Summary; Layer ∈ the host's layerGroups flattened, plus `tests` and `other`). A row that
  bundles an edit to a different file inside its Summary hands a worker a file its contract
  forbids touching — bundled edits get their own row or an explicit orchestrator-duty line
  outside the table.
- **ACs** follow the template's contract: `WHEN … THE SYSTEM SHALL …`, namespaced IDs
  (`AC-{YYYYMMDD-NN}-k`), `[env: VAR]` on environment-gated tests, `[oracle: <leg>]` where
  a gate leg is the honest oracle, `[pre-green: <reason>]` (closed enum: `fallback-rejection`
  | `absence-invariant` | `predicate-in-test`) on an AC whose test is legitimately green
  against the pre-image — verify against the pre-image before tagging; build's red-check
  reads the tag as a sanction, never an attestation to take on faith — literal input→output
  examples on ambiguity-prone terms (always, on critical tier). A Decision that promises a
  user-observable surface owes an AC asserting on the observable itself through the real
  in-repo route (the template names the anti-pattern: invented-fixture liveness). Defect-fix
  and behavior-change specs write a **regression pin** per behavior that must survive: `WHEN
  {trigger} THE SYSTEM SHALL CONTINUE TO {existing behavior}` — the literal words `SHALL
  CONTINUE TO` are the machine-visible marker (build's red-check treats pin carriers as
  sanctioned-green); prefer tagging the existing covering test with the AC-ID over
  duplicating it.
- **Decisions table is authoritative** — every fork's outcome lands there; zero open forks
  at lock. Fill **Assumptions** with each load-bearing assumption paired with its
  `if false →` fallback. Fill **Rationale** (for the cold-start reader) and **Canonical
  Delta** (applied by `/spec:review` on CLEAN).
- **`design:`** — only in hosts whose config declares a `design` block: `true` when the
  user should approve look/feel before build; record any `claude.ai/design` mockup URL or
  ratified mock path as `design_source:`. Hosts without a catalog never set the flag.

## Lock

1. **Marker sweep:** `grep -n "NEEDS CLARIFICATION" {spec path}`. Resolve every live hit
   (ask or explore; delete the marker, record the ruling in Decisions), then write
   `open_markers: N` into frontmatter (0 to lock; quoted narration doesn't count — the
   state gate reads this field as authoritative).
2. **Confirm:** zero open forks; every shape-triggered micro-spike executed with evidence
   in Assumptions; every Goal promise traced to a Decision that delivers it and an AC that
   goes red in its absence — run `node "$(spec-paths promise-sweep)" --spec {spec path}`
   (no `--manifest`) and resolve every `orphan-decision` finding by citing the delivering
   AC in the row or recording `[no-ac: <reason>]`; zero orphans to lock; for a defect-fix
   spec, at least one `SHALL CONTINUE TO` pin or
   a Rationale line saying why no neighbor needs pinning. A Decision that retires or
   narrows prose elsewhere runs
   `node "$(spec-paths collision-closure)" --spec {spec path} --root . --literal <stem>…`
   and enumerates every `likely`-tier hit in the File Plan as fix or recorded waive.
   Work discovered this session that needs its own spec → write the roadmap brief now, or
   record why not.
3. **Ledger row:** append exactly ONE row to `.claude/spec-runs.jsonl` (repo root;
   escape.md's mechanism — `printf '%s\n' '<json>' >>`) recording this lock's executed
   facts, before the status flip so an interrupted lock leaves either no row or a complete
   one, never a partial: `spikes` = the count of executed micro-spikes recorded in
   Assumptions; `promiseSweep` = step 2's `promise-sweep.js` printed counters
   (`rows`/`carried`/`sanctioned`/`orphans`) copied verbatim; `collisions` = `{hits,
   waived}` from step 2's `collision-closure.js` run, omitted entirely when no Decision
   triggered that sweep. Numbers, enums, and paths only — never prose or a self-scored
   judgment of lock quality:

   ```
   {"ts":"<ISO-8601>","stage":"plan","spec":"<repo-relative spec path>","tier":"<tier>",
    "brief":"NN"|"n/a","spikes":N,"promiseSweep":{"rows":N,"carried":N,"sanctioned":N,
    "orphans":0},"collisions":{"hits":N,"waived":N},"verdict":"locked"}
   ```

4. Flip `status: draft → hardened`.
5. **Report:** assemble slots — `outcome`: ✅ `spec hardened & locked — {path}`; `bullets`:
   one plain line per decision made; `warns`: notable spike findings; `next`: the verbatim
   output of `node "$(spec-paths spec-status)" --root . --next` as
   `{kind: 'status-verbatim'}` — the script is the sole source of the Next suggestion.
   Render via `node "$(spec-paths report-render)" --slots <file>`, print verbatim.

   ```report
   ✅ **spec hardened & locked — specs/20260817/01-example.md**
   - checkout now retries payment capture once before failing

   {spec-status --next, verbatim}
   ```

## Rules

- Genuine forks go to the user — never silently decided. `AskUserQuestion` dismissed →
  STOP; never invent the answer.
- The spec must be executable by an orchestrator that was not in this conversation —
  unstated context goes in Rationale.
