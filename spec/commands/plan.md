---
description: Author and harden a spec in one session — explore, draft, executed micro-spikes, lock
argument-hint: <feature description | spec path | roadmap brief path>
---

# Spec Plan

One session: explore → draft → lock. Produces a hardened spec at
`specs/YYYYMMDD/##-{name}.md`, written from the plugin template (`spec-paths template`).

**Setup:** run `spec-paths shared-for plan` and read its output. Read the host's
`.claude/spec.config.json`. Either missing → STOP: run `/spec:init` first.

## Input

`$ARGUMENTS` — a feature description, a path to an existing draft spec to re-open, a path to a roadmap planning brief
(`docs/roadmap/NN-*.md`), or a behaviour contract (`design/prototypes/<stem>/contract.json`).

## Entry

- **Roadmap brief:** read the brief, `docs/roadmap/00-overview.md`, and every ADR the brief's Grounding cites (with each
  `Amended by ADR-NNNN`). Run `node "$(spec-paths spec-status)" --root . --brief NN` — exit 1 means a `Depends on` brief
  has no spec at `implementing`/`done`: print `📌 Auto-picked proceed — <dep NN> at <status>; planning is reversible
  (veto anytime)` and continue; claims resting on the unbuilt dependency cite its spec's Contracts as Assumptions, never
  spiked. Every spec this session produces gets `brief: NN` (that stamp derives roadmap status); an ad-hoc spec gets
  `brief: n/a`. The brief's Out of scope is binding; a `surfaces` block is structure only.
- **Behaviour contract:** read `contract.json`, every picture under `captures/` (view them), the test file and `pins.json`; amend
  the brief its `brief` names (the driver already stamped its `Prototype: <stem>` line; rewrite the design prose under it), a
  draft spec, or mint specs (`brief: n/a` without a roadmap). `contract.json`'s `reconcile.docs` lists every ADR and roadmap file
  committed since the prototype opened: each listed ADR this plan would rely on becomes one Decisions row — the pin that outranks
  it, or `ADR-NNNN superseded by prototype <stem>` with the ADR's status flipped in the same turn; `reconcile.stray` files are
  never read as grounding. Every
  spec carries `prototype: <stem>`; one owns the test file (row `<e2eFile with {stem}> | CREATE | other`, driver-copied) and
  one AC per pin: `WHEN pin <id> ("<note>", <screen> / <state>) is exercised against the production build THE SYSTEM SHALL pass
  its contract test`, tagged `[oracle: contract]`, ending `→ writes <that file>`. Never read `proto/<stem>` or its worktree.
- **Tier:** per core § Tiers — state it and why. Work failing core § Pipeline Entry gets no spec: say so and use the
  direct lane when it qualifies; a structural change gets a spec whatever its size.
- **Explore before asking.** Ground every claim in current code (parallel Explore agents where the surface is wide;
  `docs/canonical/{area}.md` when present). Run the pre-emptive lookups the host's pipeline rules § Planning declares
  and embed the excerpts that matter into Contracts/UI (core § MCP Policy). Genuine forks go to the user via `AskUserQuestion`.

## Micro-spikes (mandatory — the shape triggers it, never felt uncertainty)

Any claim the draft will lock whose truth a **third-party dependency adjudicates** is
falsifiable in one executed line, and that line MUST run before the claim enters a Decision,
Contract, or AC (scratch file against the installed dependency; run, observe, delete), the check
and its output recorded in Assumptions. This includes **negative claims**. For a genuinely
high-unknown area, run a full throwaway spike in an isolated worktree
(`Agent {isolation: 'worktree'}`) and fold the findings in; set `spiked: YYYY-MM-DD`.

## Draft

Write the spec per the template. `status: draft`. While drafting:

- **Never guess — mark it.** Where information is missing, write
  `[NEEDS CLARIFICATION: <question>]` inline instead of something plausible.
- **Decomposition cap:** core § Decomposition.
- **File Plan row grammar:** every touched file gets its own row (Path | Action | Layer |
  Summary; Layer ∈ the host's layerGroups flattened, plus `tests`, `other` and `baseline` —
  `spec/templates/spec.md`'s File Plan comment).
- **ACs** follow `spec/templates/spec.md`'s `## Acceptance Criteria` comment verbatim.
- **Decisions table is authoritative** — every fork's outcome lands there; zero open forks at
  lock. Fill **Assumptions** with each load-bearing assumption paired with its `if false →`
  fallback, **Rationale** (for the cold-start reader), and **Canonical Delta** (applied by the
  review stage on CLEAN).

## Lock

1. **Marker sweep:** `grep -n "NEEDS CLARIFICATION" {spec path}`. Resolve every live hit
   (ask or explore; delete the marker, record the ruling in Decisions), then write
   `open_markers: N` into frontmatter (0 to lock).
2. **Confirm:** run `node "$(spec-paths ac-matrix)" --spec {spec path} --lint --resolve-root .` first — zero findings
   to lock (`node "$(spec-paths count-tests)" --root . --titles [--file <rel>]` is the reference lookup for
   `unresolved-disposition`). Then: zero open forks; every shape-triggered micro-spike executed with evidence in
   Assumptions; every Goal promise traced to a Decision that delivers it and an AC that goes red in its absence — run
   `node "$(spec-paths promise-sweep)" --spec {spec path}` (no `--manifest`), resolving every `orphan-decision` finding
   by citing the delivering AC in the row or recording `[no-ac: <reason>]`; zero orphans to lock. Then run
   `node "$(spec-paths decision-lint)" --spec {spec path} --root .`, resolving every finding by tagging the row —
   `[guards: <§ Risk Tiers text>]` or `[asked: <what the user chose>]` for a restriction, a `q<id>` from
   `spec-queue add` for a deferral; zero findings to lock. A Decision that retires or narrows prose elsewhere runs
   `node "$(spec-paths collision-closure)" --spec {spec path} --root . --literal <stem>…` and enumerates every
   literals-leg hit in the File Plan as fix or recorded waive. Work discovered this session that needs its own spec →
   write the roadmap brief now; if it must run before the current work,
   `node "$(spec-paths spec-queue)" add NN --top`; any follow-up that must wait for this spec →
   `node "$(spec-paths spec-queue)" add "<paste-ready action>" --after-spec {spec path}`.
3. **Ledger row:** append exactly ONE row to `.claude/spec-runs.jsonl` (repo root;
   `printf '%s\n' '<json>' >>`), before the status flip: `spikes` = executed micro-spikes;
   `promiseSweep` = step 2's `promise-sweep.js` printed counters copied verbatim; `acLint` =
   `{"mixed":N}` from step 2's FIRST `ac-matrix --lint` run; `collisions` = `{hits, waived}` from
   `collision-closure.js`, `{"skipped":true}` when no Decision triggered it — never omitted; `decisionLint` =
   `{restrictions,deferrals}` from `decision-lint.js`'s stdout. Numbers, enums, paths only:

   ```
   {"ts":"<ISO-8601>","stage":"plan","spec":"<repo-relative spec path>","tier":"<tier>",
    "brief":"NN"|"n/a","spikes":N,"promiseSweep":{"rows":N,"carried":N,"sanctioned":N,
    "orphans":0},"acLint":{"mixed":N},"collisions":{"hits":N,"waived":N}|{"skipped":true},
    "decisionLint":{"restrictions":N,"deferrals":N},"verdict":"locked"}
   ```

4. Flip `status: draft → hardened`.
5. **Commit the lock:** `git add` the spec, `.claude/spec-runs.jsonl` and any brief step 2
   wrote, then `git commit -m "chore(spec): lock {YYYYMMDD/##}" -- <those paths>` — those paths
   only, whatever else is uncommitted.
6. **Report:** assemble slots — `outcome`: ✅ `spec hardened & locked — {path}`; `bullets`:
   one plain line per decision made; `warns`: notable spike findings; `queued`: one line
   per `spec-queue add` run in step 2 (omit the slot when step 2 wrote nothing); `next`: the verbatim
   output of `node "$(spec-paths spec-status)" --root . --next` as
   `{kind: 'status-verbatim'}`. Render via `node "$(spec-paths report-render)" --slots <file>`,
   print verbatim.

## Rules

- Genuine forks go to the user — never silently decided; the spec must be executable by an
  orchestrator that was not in this conversation, so unstated context goes in Rationale.
