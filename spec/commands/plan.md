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
`.claude/spec.config.json` (its pipeline rules load with that Read — path-scoped, never
re-read). Either missing → STOP: run `/spec:init` first.

## Input

`$ARGUMENTS` — a feature description, a path to an existing draft spec to re-open, or a
path to a roadmap planning brief (`docs/roadmap/NN-*.md`).

## Entry

- **Roadmap brief:** read the brief, `docs/roadmap/00-overview.md`, and every ADR the brief's Grounding cites (including
  each `Amended by ADR-NNNN`). Run `node "$(spec-paths spec-status)" --root . --brief NN` — exit 1 means a `Depends on`
  brief has no spec at `implementing`/`done`: print `📌 Auto-picked proceed — <dep NN> at <status>; planning is
  reversible (veto anytime)` and continue; claims resting on the unbuilt dependency cite its spec's
  Contracts as Assumptions, never spiked. Every spec this session produces gets
  `brief: NN` in frontmatter (that stamp is how roadmap status is derived); an ad-hoc spec gets `brief: n/a`. The
  brief's Out of scope section is binding; a `surfaces` block is structure only — labels and journey edges, never
  checked against approval. A `Lane: behaviour` brief (absent = structural) STOPs: run `/spec:prototype <brief>` instead
  — it carries no plan document, the freeze writes its spec.
- **Tier:** per core § Tiers — state it and why. Work failing core § Pipeline Entry gets no
  spec: say so and make it on the direct lane when it qualifies; a behaviour change names its
  lane and stops; a structural change gets a spec whatever its size.
- **Explore before asking.** Ground every claim in current code (parallel Explore agents where
  the surface is wide; `docs/canonical/{area}.md` when present). Run the pre-emptive lookups
  the host's pipeline rules § Planning declares (Context7 for third-party APIs the spec relies
  on) and embed the excerpts that matter into Contracts/UI (core § MCP Policy). Put genuine
  forks to the user via `AskUserQuestion`, options grounded in what you found; never ask what
  the codebase can answer.

## Micro-spikes (mandatory — the shape triggers it, never felt uncertainty)

Any claim the draft will lock whose truth a **third-party dependency adjudicates** —
name/format constraints, cron strings, config keys, DSL fragments, version-specific API
shapes — is falsifiable in one executed line, and that line MUST run before the claim enters a
Decision, Contract, or AC (scratch file against the installed dependency; run, observe,
delete), the check and its output recorded in Assumptions. This includes **negative claims**:
an assertion that a named mutation or misconfiguration will make a named check fail is
dependency-adjudicated identically — execute it and observe the red before locking it. For a
genuinely high-unknown area (unfamiliar API, risky integration), run a full throwaway spike in
an isolated worktree (`Agent {isolation: 'worktree'}`) and fold the findings in; set
`spiked: YYYY-MM-DD`.

## Draft

Write the spec per the template. `status: draft`. While drafting:

- **Never guess — mark it.** Where information is missing, write
  `[NEEDS CLARIFICATION: <question>]` inline instead of something plausible.
- **Decomposition cap:** core § Decomposition. A facade with no consumer in the spec or its
  series is mis-sliced — fold it into the consumer's.
- **File Plan row grammar:** every touched file gets its own row (Path | Action | Layer |
  Summary; Layer ∈ the host's layerGroups flattened, plus `tests`, `other` and `baseline` —
  `spec/templates/spec.md`'s File Plan comment). A row bundling
  an edit to a different file inside its Summary hands a worker a file its contract forbids
  touching — bundled edits get their own row, or a note outside the table.
- **ACs** follow `spec/templates/spec.md`'s `## Acceptance Criteria` comment verbatim — shape,
  tag grammar (`env`/`oracle`/`pre-green`), the terminal-observable rule, and the regression-pin
  grammar all live there, the one binding home; this command never restates it.
- **Decisions table is authoritative** — every fork's outcome lands there; zero open forks at
  lock. Fill **Assumptions** with each load-bearing assumption paired with its `if false →`
  fallback, **Rationale** (for the cold-start reader), and **Canonical Delta** (applied by the
  review stage on CLEAN).

## Lock

1. **Marker sweep:** `grep -n "NEEDS CLARIFICATION" {spec path}`. Resolve every live hit
   (ask or explore; delete the marker, record the ruling in Decisions), then write
   `open_markers: N` into frontmatter (0 to lock; quoted narration doesn't count — the
   state gate reads this field as authoritative).
2. **Confirm:** run `node "$(spec-paths ac-matrix)" --spec {spec path} --lint --resolve-root .`
   first — zero findings to lock (`mixed-pin`: split the bullet; `missing-disposition`: end it
   `→ writes <file>` / `→ rewrites <file> :: <title>` / `→ reuses <file> :: <title>`;
   `unresolved-disposition`: lengthen the prefix to name exactly one pre-image test —
   `node "$(spec-paths count-tests)" --root . --titles [--file <rel>]` is the reference lookup). Then:
   zero open forks; every shape-triggered micro-spike executed with evidence
   in Assumptions; every Goal promise traced to a Decision that delivers it and an AC that
   goes red in its absence — run `node "$(spec-paths promise-sweep)" --spec {spec path}`
   (no `--manifest`) and resolve every `orphan-decision` finding by citing the delivering
   AC in the row or recording `[no-ac: <reason>]`; zero orphans to lock. A `SHALL CONTINUE
   TO` pin is opt-in per criterion: it names one behavior that must outlive this spec's close
   (its test survives expiry at close); every other AC's test expires when the spec closes. A
   defect-fix spec with no pin says why in one Rationale line. A Decision that retires or
   narrows prose elsewhere runs
   `node "$(spec-paths collision-closure)" --spec {spec path} --root . --literal <stem>…`
   and enumerates every literals-leg hit in the File Plan as fix or recorded waive;
   `executes` hits are read for fixture repair to plan now; `likely`/`mentions` hits owe
   nothing (specs/20260814/05-collision-closure.md D6/D12).
   Work discovered this session that needs its own spec → write the roadmap brief now (it
   queues last by itself); if it must run before the current work,
   `node "$(spec-paths spec-queue)" add NN --top`; any follow-up that must wait for this
   spec (a re-mark, a backfill, a second sweep) →
   `node "$(spec-paths spec-queue)" add "<paste-ready action>" --after-spec {spec path}`.
   Record why not only when there is truly nothing to queue.
3. **Ledger row:** append exactly ONE row to `.claude/spec-runs.jsonl` (repo root;
   `printf '%s\n' '<json>' >>`) recording this lock's executed
   facts, before the status flip so an interrupted lock leaves either no row or a complete
   one, never a partial: `spikes` = the count of executed micro-spikes recorded in
   Assumptions; `promiseSweep` = step 2's `promise-sweep.js` printed counters
   (`rows`/`carried`/`sanctioned`/`orphans`) copied verbatim; `acLint` = `{"mixed":N}` where N
   is the `mixed=` counter step 2's FIRST `ac-matrix --lint` run printed (0 when clean first
   time — a later, clean re-run never overwrites it); `collisions` = `{hits,
   waived}` from step 2's `collision-closure.js` run, omitted entirely when no Decision
   triggered that sweep. Numbers, enums, and paths only — never prose or a self-scored
   judgment of lock quality:

   ```
   {"ts":"<ISO-8601>","stage":"plan","spec":"<repo-relative spec path>","tier":"<tier>",
    "brief":"NN"|"n/a","spikes":N,"promiseSweep":{"rows":N,"carried":N,"sanctioned":N,
    "orphans":0},"acLint":{"mixed":N},"collisions":{"hits":N,"waived":N},"verdict":"locked"}
   ```

4. Flip `status: draft → hardened`.
5. **Commit the lock:** `git add` the spec, `.claude/spec-runs.jsonl` and any brief step 2
   wrote, then `git commit -m "chore(spec): lock {YYYYMMDD/##}" -- <those paths>` — those paths
   only, whatever else is uncommitted. `/spec:run` branches the worktree from HEAD and refuses a
   spec that is not on it.
6. **Report:** assemble slots — `outcome`: ✅ `spec hardened & locked — {path}`; `bullets`:
   one plain line per decision made; `warns`: notable spike findings; `queued`: one line
   per `spec-queue add` run in step 2, printed verbatim or glossed in plain English (omit
   the slot when step 2 wrote nothing); `next`: the verbatim
   output of `node "$(spec-paths spec-status)" --root . --next` as
   `{kind: 'status-verbatim'}` — the script is the sole source of the Next suggestion.
   Render via `node "$(spec-paths report-render)" --slots <file>`, print verbatim.

   ```report
   ✅ **spec hardened & locked — specs/20260817/01-example.md**
   - checkout now retries payment capture once before failing

   {spec-status --next, verbatim}
   ```

## Rules

- Genuine forks go to the user — never silently decided; the spec must be executable by an
  orchestrator that was not in this conversation, so unstated context goes in Rationale.
